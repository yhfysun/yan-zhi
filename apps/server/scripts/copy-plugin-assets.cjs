const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.resolve(__dirname, '..');
const source = path.join(serverRoot, 'src', 'plugins', 'YanZhiJavaDebugger.java');
const destination = path.join(
  serverRoot,
  'dist',
  'apps',
  'server',
  'src',
  'plugins',
  'YanZhiJavaDebugger.java',
);

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
console.log(`[copy-plugin-assets] ${path.relative(serverRoot, destination)}`);
