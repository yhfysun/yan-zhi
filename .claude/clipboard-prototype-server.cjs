// 静态原型预览服务:只读 docs/prototypes,供 Browser 预览面板查看原型页
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'docs', 'prototypes');
const PORT = Number(process.env.PORT || 4201);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url === '/' ? '/clipboard-proto.html' : req.url).split('?')[0]);
  const file = path.join(ROOT, rel);
  // 防目录穿越:必须落在 ROOT 内
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('403'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => console.log('prototypes on http://localhost:' + PORT));
