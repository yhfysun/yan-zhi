// 生成宿主共享依赖 shim（yz://shared/**）与服务端宿主桥 shim（__server-host__.mjs）。
// 用法: node scripts/generate-host-shims.mjs
// 产物: apps/desktop/host-shims/*.mjs（随 electron-builder files 分发进 asar）
import { main } from './lib/host-shims.mjs';

await main();
