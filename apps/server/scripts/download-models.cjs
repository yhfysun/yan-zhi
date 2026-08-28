/* eslint-disable */
// 模型下载脚本（CI / 本地开发 / 打包前复用）。
// 模型文件 .gitignore 已排除（apps/server/models、*.gguf），不随仓库分发，
// 因此在 GitHub Actions 构建前必须先运行本脚本补齐模型，否则打包出来的应用没有本地模型/向量。
//
// 用法（在仓库根或 apps/server 下）：
//   node apps/server/scripts/download-models.cjs              # 下载全部模型
//   node apps/server/scripts/download-models.cjs --embedding  # 只下载 bge 向量模型
//   node apps/server/scripts/download-models.cjs --llm        # 只下载 qwen 对话模型
//
// 下载源：国内魔搭(ModelScope) 直链优先，hf-mirror 兜底，源逐个尝试直到成功。
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const modelsDir = path.resolve(__dirname, '..', 'models');
fs.mkdirSync(modelsDir, { recursive: true });

const MODELS = [
  {
    key: 'llm',
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    urls: [
      'https://modelscope.cn/models/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/master/qwen2.5-1.5b-instruct-q4_k_m.gguf',
      'https://hf-mirror.com/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    ],
  },
  {
    key: 'embedding',
    filename: 'bge-small-zh-v1.5-q8_0.gguf',
    urls: [
      'https://modelscope.cn/models/gubanjie/bge-small-zh-v1.5-q8_0.gguf/resolve/master/bge-small-zh-v1.5-q8_0.gguf',
      'https://hf-mirror.com/CompendiumLabs/bge-small-zh-v1.5-gguf/resolve/main/bge-small-zh-v1.5-q8_0.gguf',
    ],
  },
];

const args = process.argv.slice(2);
function enabled(key) {
  if (args.includes('--embedding')) return key === 'embedding';
  if (args.includes('--llm')) return key === 'llm';
  return true; // 默认全部
}

function download(urls, dest) {
  return new Promise((resolve, reject) => {
    const trySource = (index) => {
      if (index >= urls.length) { reject(new Error('所有模型下载源均失败')); return; }
      const url = urls[index];
      const tempDest = `${dest}.part`;
      let redirects = 0;
      const request = (currentUrl) => {
        const lib = currentUrl.startsWith('https:') ? https : http;
        const req = lib.get(currentUrl, { headers: { 'User-Agent': 'yan-zhi-download' } }, (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            res.resume();
            redirects += 1;
            if (redirects > 10) { fail('重定向过多'); return; }
            request(new URL(res.headers.location, currentUrl).toString());
            return;
          }
          if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); fail(`HTTP ${res.statusCode}`); return; }
          const totalBytes = Number(res.headers['content-length'] || 0);
          let received = 0;
          let lastPct = -1;
          const out = fs.createWriteStream(tempDest);
          res.on('data', (chunk) => {
            received += chunk.length;
            if (totalBytes > 0) {
              const pct = Math.floor((received / totalBytes) * 100);
              if (pct !== lastPct) { lastPct = pct; process.stdout.write(`\r${path.basename(dest)}: ${pct}%`); }
            }
          });
          res.pipe(out);
          out.on('finish', () => {
            fs.renameSync(tempDest, dest);
            process.stdout.write(`\r${path.basename(dest)}: 完成 (${(fs.statSync(dest).size / 1024 / 1024).toFixed(1)} MB)\n`);
            resolve();
          });
          out.on('error', (err) => fail(err && err.message ? err.message : String(err)));
        });
        req.setTimeout(60000, () => req.destroy(new Error('连接超时')));
        req.on('error', (err) => fail(err && err.message ? err.message : String(err)));
      };
      const fail = (reason) => {
        console.error(`\n[download] ${path.basename(dest)} 源 ${index + 1}/${urls.length} 失败: ${reason}`);
        try { fs.rmSync(tempDest, { force: true }); } catch {}
        trySource(index + 1);
      };
      request(url);
    };
    trySource(0);
  });
}

(async () => {
  for (const model of MODELS) {
    if (!enabled(model.key)) continue;
    const dest = path.join(modelsDir, model.filename);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(`[download] 已存在，跳过: ${model.filename}`);
      continue;
    }
    console.log(`[download] 下载 ${model.key}: ${model.filename}`);
    await download(model.urls, dest);
  }
  console.log('\n[download] 全部完成。模型存放于 apps/server/models/');
})().catch((err) => {
  console.error('[download] 失败:', err && err.message ? err.message : err);
  process.exit(1);
});
