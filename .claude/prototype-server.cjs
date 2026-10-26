// 本地原型静态服务：仅用于在 Browser 预览面板查看 openspec 原型页
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'openspec', 'changes', 'desktop-manager');
const PORT = 4177;

http.createServer((req, res) => {
  const rel = req.url === '/' ? 'prototype.html' : req.url.split('?')[0].slice(1);
  const file = path.join(ROOT, rel);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buf);
  });
}).listen(PORT, () => console.log('prototype on http://localhost:' + PORT));
