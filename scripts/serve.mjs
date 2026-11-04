import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = Number(portIndex < 0 ? 4173 : args[portIndex + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('請指定有效的 --port');
if (args.includes('--build')) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/build.mjs')], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
try { await stat(path.join(output, 'index.html')); } catch { throw new Error('找不到網站輸出，請先執行 npm run build 或 npm run dev'); }
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let target = path.resolve(output, `.${pathname}`);
    // 僅提供 dist 之內的檔案，不允許 URL 存取專案設定或原始檔。
    const relative = path.relative(output, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) { response.writeHead(403); response.end(); return; }
    let status = 200;
    try {
      if ((await stat(target)).isDirectory()) {
        if (!pathname.endsWith('/')) { response.writeHead(308, { Location: `${pathname}/${new URL(request.url, 'http://localhost').search}` }); response.end(); return; }
        target = path.join(target, 'index.html');
      }
      await stat(target);
    } catch { status = 404; target = path.join(output, '404.html'); }
    const data = await readFile(target);
    response.writeHead(status, { 'Content-Type': `${mime[path.extname(target)] || 'application/octet-stream'}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch { response.writeHead(400); response.end('Bad request'); }
});
server.on('error', (error) => { console.error(`無法啟動預覽：${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
