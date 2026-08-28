// 把 img/src/*.png 縮成 600×800 的 WebP 放進 img/。
//   node scripts/optimize-art.mjs [quality]
//
// 這個環境沒有 cwebp / ImageMagick / sharp，但有 Chromium，
// 所以直接借瀏覽器的 canvas 編碼器：畫上去再 toDataURL('image/webp', q)。
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'img/src';
const OUT = 'img';
const W = 600, H = 800;
const Q = Number(process.argv[2] || 0.82);

if (!fs.existsSync(SRC)) { console.error(`找不到 ${SRC}`); process.exit(1); }
const files = fs.readdirSync(SRC).filter(f => f.endsWith('.png')).sort();
if (!files.length) { console.error(`${SRC} 裡沒有 png`); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

let before = 0, after = 0;
for (const f of files) {
  const src = path.join(SRC, f);
  const dest = path.join(OUT, f.replace(/\.png$/, '.webp'));
  const dataUri = 'data:image/png;base64,' + fs.readFileSync(src).toString('base64');

  const out = await page.evaluate(async ({ uri, w, h, q }) => {
    const img = new Image();
    img.src = uri;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/webp', q);
  }, { uri: dataUri, w: W, h: H, q: Q });

  if (!out.startsWith('data:image/webp')) {
    console.log(`FAIL ${f}: 這個 Chromium 沒有輸出 webp`);
    continue;
  }
  fs.writeFileSync(dest, Buffer.from(out.split(',')[1], 'base64'));

  const b = fs.statSync(src).size, a = fs.statSync(dest).size;
  before += b; after += a;
  console.log(`${path.basename(dest).padEnd(22)} ${(b / 1024).toFixed(0).padStart(5)} KB → ${(a / 1024).toFixed(0).padStart(4)} KB`);
}

await browser.close();
console.log(`\n合計 ${(before / 1024 / 1024).toFixed(1)} MB → ${(after / 1024 / 1024).toFixed(2)} MB  (quality ${Q})`);
