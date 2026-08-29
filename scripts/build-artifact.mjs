// index.html 是唯一的真相來源。Claude Artifact 要的是「沒有 doctype/html/head/body
// 的片段」，這支腳本就負責把外殼剝掉，免得兩份各改各的而慢慢長歪。
//
// Artifact 平台只能發布單一 HTML 檔案，沒有辦法像 GitHub Pages 那樣附帶 img/
// 資料夾 —— 所以 index.html 裡 `src="img/xxx.webp"` 這種相對路徑在 Artifact 上
// 一律 404，畫面會退回 figureSVG() 的線條人形（這是設計好的後備，不是壞掉，但
// 終究比不上真正的插畫）。這裡把每張圖轉成 base64 內嵌進 HTML 本身解決：
// 40 張圖合計不到 1MB，內嵌後約 1.3MB，仍遠低於 Artifact 16MB 的上限。
//
// 用法: node scripts/build-artifact.mjs [輸出路徑]
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync('index.html', 'utf8');
const out = process.argv[2] || 'dist/artifact.html';

const start = src.indexOf('<body>');
const end = src.lastIndexOf('</body>');
if (start === -1 || end === -1) {
  console.error('index.html 裡找不到 <body> / </body>');
  process.exit(1);
}

const title = (src.match(/<title>([^<]*)<\/title>/) || [, '鐵日誌'])[1];
let body = src.slice(start + '<body>'.length, end).trim();

// index.html 組出圖片路徑的地方是一行模板字面值 `src="img/${ex.art}.webp"`
// —— 這串字元本身（含 `${ex.art}`）就原封不動存在原始碼裡，圖片檔名要等瀏覽器
// 執行到才會算出來，所以沒辦法直接對「檔名」做文字取代，得改成：先把全部 40 張
// 圖轉成 base64 存進一個查表物件，再把這行程式改成「查表查得到就用內嵌的，查
// 不到才退回原本的相對路徑」。GitHub Pages 用的 index.html 完全不動。
const marker = 'src="img/${ex.art}.webp"';
if (!body.includes(marker)) {
  console.error(`找不到預期的圖片路徑寫法，index.html 是不是改過了？在找: ${marker}`);
  process.exit(1);
}

const artMap = {};
let inlined = 0, missing = [];
for (const f of fs.readdirSync('img')) {
  if (!f.endsWith('.webp')) continue;
  const id = f.replace(/\.webp$/, '');
  artMap[id] = `data:image/webp;base64,${fs.readFileSync(path.join('img', f)).toString('base64')}`;
  inlined++;
}

body = body.replace(marker, 'src="${ART_DATA[ex.art]||(\'img/\'+ex.art+\'.webp\')}"');
body = `<script>const ART_DATA=${JSON.stringify(artMap)};</script>\n` + body;

fs.mkdirSync(out.replace(/\/[^/]*$/, ''), { recursive: true });
fs.writeFileSync(out, `<title>${title}</title>\n${body}\n`);

if (missing.length) console.log(`缺檔（維持原路徑，Artifact 上會退回 SVG）: ${missing.join(', ')}`);
console.log(`${out}  ${(fs.statSync(out).size / 1024).toFixed(0)} KB  （內嵌 ${inlined} 張圖）`);
