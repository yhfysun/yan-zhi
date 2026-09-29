// 真机验证：Express res.sendFile 是否真的支持 HTTP Range（视频流式播放的关键依据）
//
// ★ 为什么验这个：视频黑屏的根因是「前端用 blob: URL，Chromium 对 blob 媒体不实现 Range」。
//   修复方案是改走 HTTP URL，其成立前提是**后端 res.sendFile 返回 206 + Content-Range**。
//   这个前提必须实测，不能靠"Express 应该支持"这种推断。
//
// 做法：起一个最小 Express 服务，暴露 sendFile 端点，然后用真实 MP4 发带 Range 的请求，
//       检查状态码/响应头/字节长度是否符合 RFC 7233。
const fs = require('fs');
const os = require('os');
const path = require('path');

// ★ 本机 `.bin` 链接为空、workspace 依赖常解析不到 → 自己把 express 的 .pnpm 目录
//   塞进 module.paths，这样 `node tools/verify-range-stream.cjs` 直接可跑，
//   不需要调用方记得设 NODE_PATH（我第一版就需要，很容易忘）。
{
  const pnpmDir = path.resolve(__dirname, '..', 'node_modules', '.pnpm');
  if (fs.existsSync(pnpmDir)) {
    const exp = fs.readdirSync(pnpmDir).find((n) => n.startsWith('express@'));
    if (exp) {
      // express 的依赖（send / range-parser 等）也在 .pnpm 根下 → 一并加入搜索路径
      module.paths.unshift(path.join(pnpmDir, exp, 'node_modules'), pnpmDir);
    }
  }
}

const express = require('express');

const VIDEO = process.argv[2] || path.resolve(__dirname, '..', 'tmp/sub-scale/sub-portrait.mp4');
const PORT = 3098;

(async () => {
  if (!fs.existsSync(VIDEO)) { console.log('测试视频不存在:', VIDEO); process.exit(2); }
  const size = fs.statSync(VIDEO).size;
  console.log('测试视频:', VIDEO);
  console.log('  大小:', (size / 1048576).toFixed(1), 'MB');
  console.log('');

  const app = express();
  // ★ 复刻 apps/server/src/routes/files.ts 的 `/conversations/:id/file-stream` 实现
  //   （同一套头设置 + 同一套 err 处理：越界 Range 回 416 而不是 500）
  app.get('/stream', (req, res) => {
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader('Accept-Ranges', 'bytes');
    res.sendFile(VIDEO, (err) => {
      if (!err) return;
      const code = err.code;
      if (code === 'ECONNABORTED' || code === 'ERR_STREAM_PREMATURE_CLOSE' || res.headersSent) return;
      if (code === 'ERR_HTTP_RANGE_NOT_SATISFIABLE' || err.status === 416) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
        return;
      }
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
  });

  const server = app.listen(PORT, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));

  const url = `http://127.0.0.1:${PORT}/stream`;
  let pass = 0, fail = 0;
  const ck = (n, ok, extra = '') => {
    if (ok) { pass++; console.log('  ✅ ' + n + (extra ? ' — ' + extra : '')); }
    else { fail++; console.log('  ❌ ' + n + (extra ? ' — ' + extra : '')); }
  };

  // ① 无 Range 的普通请求：应 200 + Accept-Ranges
  console.log('=== ① 普通请求（无 Range）===');
  {
    const r = await fetch(url);
    ck('状态 200', r.status === 200, 'got ' + r.status);
    ck('★ 声明 Accept-Ranges: bytes（播放器据此决定能否分段请求）',
      (r.headers.get('accept-ranges') || '') === 'bytes', r.headers.get('accept-ranges'));
    ck('Content-Length 正确', Number(r.headers.get('content-length')) === size);
    // 读完（丢弃）以释放连接
    await r.arrayBuffer();
  }

  // ② 带 Range 的请求（模拟 <video> 首次探测）：应 206 + Content-Range
  console.log('');
  console.log('=== ② Range: bytes=0-1023（模拟播放器首段探测）===');
  {
    const r = await fetch(url, { headers: { Range: 'bytes=0-1023' } });
    ck('★★ 状态 206 Partial Content（这是 blob: 给不了的）', r.status === 206, 'got ' + r.status);
    const cr = r.headers.get('content-range') || '';
    ck('★★ 有 Content-Range 头', /^bytes 0-1023\/\d+$/.test(cr), cr);
    const buf = await r.arrayBuffer();
    ck('字节长度 = 1024', buf.byteLength === 1024, 'got ' + buf.byteLength);
    // 校验取到的是文件真正的头 1024 字节
    const head = fs.readFileSync(VIDEO).subarray(0, 1024);
    ck('★ 字节内容与源文件一致', Buffer.compare(Buffer.from(buf), head) === 0);
  }

  // ③ 中段 Range（模拟 seek）：应回对应区间
  console.log('');
  console.log('=== ③ Range: bytes=1048576-1049599（模拟 seek 到中段）===');
  {
    const start = 1048576, end = 1049599;
    const r = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
    ck('状态 206', r.status === 206, 'got ' + r.status);
    const cr = r.headers.get('content-range') || '';
    ck('Content-Range 起点正确', cr.includes(`bytes ${start}-${end}/`), cr);
    const buf = await r.arrayBuffer();
    ck('字节长度正确', buf.byteLength === end - start + 1, 'got ' + buf.byteLength);
  }

  // ④ 尾段 Range（模拟读到结尾）
  console.log('');
  console.log('=== ④ Range: bytes=-1024（末尾 1KB）===');
  {
    const r = await fetch(url, { headers: { Range: 'bytes=-1024' } });
    ck('状态 206', r.status === 206, 'got ' + r.status);
    const buf = await r.arrayBuffer();
    ck('字节长度 = 1024', buf.byteLength === 1024, 'got ' + buf.byteLength);
  }

  // ⑤ 越界 Range：应 416
  console.log('');
  console.log('=== ⑤ Range 越界（bytes=99999999999-）===');
  {
    const r = await fetch(url, { headers: { Range: 'bytes=99999999999-' } });
    ck('状态 416（Range Not Satisfiable）', r.status === 416, 'got ' + r.status);
    await r.arrayBuffer().catch(() => {});
  }

  console.log('');
  console.log(`结果: ${pass} 通过 / ${fail} 失败`);
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message); process.exit(2); });