// 本地静态服务：仅用于 Browser 预览面板查看原型页与插件围栏页
// 用法：node .claude/prototype-server.cjs [--root <dir>] [--port <n>]
const http = require('http');
const fs = require('fs');
const path = require('path');

const argv = process.argv;
const rootIdx = argv.indexOf('--root');
const portIdx = argv.indexOf('--port');
const ROOT = rootIdx > 0 ? path.resolve(argv[rootIdx + 1]) : path.join(__dirname, '..', 'openspec', 'changes', 'desktop-manager');
const PORT = portIdx > 0 ? Number(argv[portIdx + 1]) : 4177;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

http.createServer((req, res) => {
  let rel = req.url === '/' ? 'prototype.html' : decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(path.resolve(ROOT))) { res.writeHead(403); res.end('403'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => console.log('serving ' + ROOT + ' on http://localhost:' + PORT));
