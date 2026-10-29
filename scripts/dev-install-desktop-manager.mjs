// 开发期安装：把可选插件拷到服务端的 installed 目录（等价于线上「上传 .yzp」）。
// 线上分发走 /api/plugins/install，不依赖本脚本；安装包也**不会**包含该插件。
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'plugins', 'optional', 'desktop-manager');
const dst = path.join(root, 'apps', 'server', 'plugins', 'installed', 'desktop-manager');

if (!fs.existsSync(src)) {
  console.error('源码目录不存在:', src);
  process.exit(1);
}
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log('[desktop-manager] installed →', dst);
console.log('重启服务端（或重新加载插件）后生效；卸载：删除该目录');
