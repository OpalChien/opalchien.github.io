import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

// 同一套版型分別產生中文根目錄及 /en/，不依賴即時翻譯服務。
const renderer = fileURLToPath(new URL('./build.mjs', import.meta.url));
const args = process.argv.slice(2);
// 兩種語言必須有相同文章網址，避免切換到尚未翻譯的頁面。
const read = async (name) => JSON.parse(await readFile(new URL(`../content/${name}`, import.meta.url), 'utf8'));
const zhPosts = await read('posts.json');
const enPosts = await read('en/posts.json');
const zhKeys = zhPosts.map((p) => `${p.slug}:${p.date}`).sort();
const enKeys = enPosts.map((p) => `${p.slug}:${p.date}`).sort();
if (JSON.stringify(zhKeys) !== JSON.stringify(enKeys)) throw new Error('中英文文章的 slug 與日期必須一致，請補上對應翻譯。');
for (const locale of ['zh-Hant', 'en']) {
  const result = spawnSync(process.execPath, [renderer, ...args, '--locale', locale, ...(locale === 'en' ? ['--append'] : [])], { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Built both languages with matching page routes.');
