// index.html 是唯一的真相來源。Claude Artifact 要的是「沒有 doctype/html/head/body
// 的片段」，這支腳本就負責把外殼剝掉，免得兩份各改各的而慢慢長歪。
// 用法: node scripts/build-artifact.mjs [輸出路徑]
import fs from 'fs';

const src = fs.readFileSync('index.html', 'utf8');
const out = process.argv[2] || 'dist/artifact.html';

const start = src.indexOf('<body>');
const end = src.lastIndexOf('</body>');
if (start === -1 || end === -1) {
  console.error('index.html 裡找不到 <body> / </body>');
  process.exit(1);
}

const title = (src.match(/<title>([^<]*)<\/title>/) || [, '鐵日誌'])[1];
const body = src.slice(start + '<body>'.length, end).trim();

fs.mkdirSync(out.replace(/\/[^/]*$/, ''), { recursive: true });
fs.writeFileSync(out, `<title>${title}</title>\n${body}\n`);

console.log(`${out}  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
