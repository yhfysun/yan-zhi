// splash 窗 preload：主进程 → splash 单向推送阶段文案（contextIsolation 开启，走 contextBridge）。
// 必须登记进三份 electron-builder yml 的 files:（漏登记 = 打包版 splash 加载失败，守门 packaged-entry-modules.test.cjs）。
const { contextBridge, ipcRenderer } = require('electron');

const CHANNEL_UPDATE = 'splash:update';
const CHANNEL_GET_LAST = 'splash:get-last-update';

const listeners = [];
ipcRenderer.on(CHANNEL_UPDATE, (_e, update) => {
  for (const fn of listeners) {
    try { fn(update); } catch { /* 单个监听器异常不影响其它 */ }
  }
});

contextBridge.exposeInMainWorld('splashAPI', {
  onUpdate(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  },
  // 注册后立即拉一次当前状态，避免 splash 打开时错过已推送的 update
  getLastUpdate() {
    return ipcRenderer.invoke(CHANNEL_GET_LAST).catch(() => null);
  },
});
