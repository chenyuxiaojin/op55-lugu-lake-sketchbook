// 本地 http 提供 index.html → puppeteer-core 复用一个页面逐帧取 PNG → 以流写入 FFmpeg(image2pipe)。
// 用法:
//   node render.mjs                 完整导出 ./op55-hd.mp4(H.264 yuv420p + 原音 AAC)
//   node render.mjs --qa            确定性检查 + 关键帧联系表 out/qa/sheet.png
//   node render.mjs --frames 0,45   只导出指定帧的联系表
//   node render.mjs --serve         仅起预览服务,浏览器打开打印出的地址
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { parseSrt } from './src/srt.js';
import { FPS } from './src/scene.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.srt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

function serve(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

function findBrowser() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error('找不到 Chrome/Chromium:请设置 PUPPETEER_EXECUTABLE_PATH');
  return hit;
}

async function openPage(port) {
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--font-render-hinting=none'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.setViewport({ width: 1080, height: 1440, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/index.html?render=1`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 60000 });
  const info = await page.evaluate(() => window.__info);
  const grab = async (f, label = false) => Buffer.from(await page.evaluate((n, l) => window.__renderPNG(n, l), f, label), 'base64');
  return { browser, page, info, grab };
}

function ffmpeg(argv) {
  const p = spawn('ffmpeg', argv, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) =>
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)))),
  );
  return { stdin: p.stdin, done };
}

async function writeFrame(stdin, buf) {
  if (!stdin.write(buf)) await once(stdin, 'drain');
}

function keyFrames(totalFrames) {
  const cues = parseSrt(fs.readFileSync(path.join(ROOT, 'subtitles.srt'), 'utf8'));
  const f = (ms) => Math.round((ms / 1000) * FPS);
  const set = new Set([0, totalFrames - 1]);
  for (const c of cues) {
    const s = Math.ceil((c.startMs / 1000) * FPS);
    const e = Math.ceil((c.endMs / 1000) * FPS);
    [s - 1, s, s + 3, f((c.startMs + c.endMs) / 2), e - 2, e - 1, e].forEach((x) => set.add(x));
  }
  return [...set].filter((x) => x >= 0 && x < totalFrames).sort((a, b) => a - b);
}

async function contactSheet(grab, frames, file) {
  const cols = 4;
  const rows = Math.ceil(frames.length / cols);
  const { stdin, done } = ffmpeg([
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'png', '-i', '-',
    '-vf', `scale=640:-1,tile=${cols}x${rows}:padding=6:color=white`, '-frames:v', '1', file,
  ]);
  for (const fr of frames) await writeFrame(stdin, await grab(fr, true));
  stdin.end();
  await done;
}

async function main() {
  const server = await serve(flag('--serve') ? Number(opt('--port') || 4710) : 0);
  const { port } = server.address();
  if (flag('--serve')) {
    console.log(`预览: http://127.0.0.1:${port}/index.html`);
    return;
  }
  fs.mkdirSync(path.join(OUT, 'qa'), { recursive: true });
  const { browser, info, grab } = await openPage(port);
  try {
    const total = info.totalFrames;
    if (flag('--qa') || opt('--frames')) {
      const frames = opt('--frames') ? opt('--frames').split(',').map(Number) : keyFrames(total);
      if (flag('--qa')) {
        for (const fr of [0, Math.floor(total / 2), total - 1, ...frames.slice(1, 6)]) {
          const a = await grab(fr);
          const b = await grab(fr);
          if (!a.equals(b)) throw new Error(`帧 ${fr} 两次绘制不一致`);
        }
        console.log('确定性检查通过');
      }
      const sheet = path.join(OUT, 'qa', opt('--sheet') || 'sheet.png');
      await contactSheet(grab, frames, sheet);
      console.log(`联系表 ${sheet}  帧: ${frames.join(',')}`);
      return;
    }
    const file = path.join(ROOT, opt('--out') || 'op55-hd.mp4');
    const { stdin, done } = ffmpeg([
      '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-i', path.join(ROOT, 'original.mp3'), '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
      '-r', String(FPS), '-movflags', '+faststart', file,
    ]);
    const t0 = Date.now();
    for (let fr = 0; fr < total; fr++) {
      await writeFrame(stdin, await grab(fr));
      if (fr % 60 === 0) process.stdout.write(`\r${fr}/${total}`);
    }
    stdin.end();
    await done;
    console.log(`\r导出完成 ${file}  ${total} 帧  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
