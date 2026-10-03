// SRT → [{ index, text, startMs, endMs }]; 保留原文(多行用 \n 连接)、顺序与起止时间。
const TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

function toMs(s) {
  const m = TIME.exec(s);
  if (!m) throw new Error(`bad SRT time: ${s}`);
  return ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4].padEnd(3, '0');
}

export function parseSrt(src) {
  const blocks = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split('-->');
    const idx = ti > 0 ? parseInt(lines[0], 10) : cues.length + 1;
    cues.push({
      index: Number.isFinite(idx) ? idx : cues.length + 1,
      text: lines.slice(ti + 1).join('\n'),
      startMs: toMs(a),
      endMs: toMs(b),
    });
  }
  cues.sort((x, y) => x.startMs - y.startMs || x.index - y.index);
  return cues;
}
