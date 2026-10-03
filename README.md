# 泸沽湖 · 手绘速写本

一支 28.2 秒、1080×1440(3:4)/ 30fps 的手绘动态短片,配原唱口播。

**构思**:一根墨线就是湖岸。它先画出灯火通明的摩梭小镇;"我想要黑暗"时墨从"黑暗"二字里涌出,吞没整张纸,灯沿着墨的前沿逐盏熄灭;夜里一只猪槽船划过,船尾水痕托出字又把字冲散;镜头沿湖长摇,同一根线延伸成对岸的山,一个人站在山脚;最后,开头那些灯化成湖面的光点,重新聚成"总有些过往"。分镜与转场见 [TREATMENT.md](TREATMENT.md)。

## 技术
- `src/scene.js`:Canvas 2D 逐帧绘制,每帧只由帧号决定(整数哈希代替随机数)。线条每 2 帧重抖、两端收尖;水彩 multiply 叠程序生成的纸纹;夜里的灯用加色发光;倒影与水中字用横向切条 + 正弦错位;字形取像素变成光点粒子;快速段 12 子帧、其余 4 子帧累积运动模糊。
- 节奏:用 ffmpeg astats 取原音 0.1 秒能量包络,逐字时刻按字幕区间 + 能量峰手工校准(见 `RUNS` 的 `times`)。
- `render.mjs`:本地 http 服务 → puppeteer-core 驱动本机 Chrome 按帧截 PNG → 流式写入 FFmpeg(H.264 yuv420p),同时从 0 秒原样混入 `original.mp3`(AAC)。
- `init()` 会校验画面上的字与 `subtitles.srt` 逐字一致。

## 重新渲染
需要 Node 18+、FFmpeg、本机 Google Chrome(或设 `PUPPETEER_EXECUTABLE_PATH`),并把原音放在根目录 `original.mp3`(原音不随仓库分发)。
```bash
npm ci
node render.mjs            # 输出 ./op55-hd.mp4
node render.mjs --qa       # 确定性检查 + 关键帧联系表 out/qa/sheet.png
node render.mjs --serve    # 浏览器预览(无声)
```

## 素材与许可
- 字体:霞鹜文楷 LXGW WenKai(npm `lxgw-wenkai-webfont`),SIL Open Font License 1.1,见 `fonts/LXGW-WenKai-OFL.txt`。
- 画面全部由代码生成,无外部图片;不含任何额外音乐,声音只有任务提供的原音。
