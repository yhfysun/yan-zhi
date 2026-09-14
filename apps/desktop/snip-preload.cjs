// 截图框选窗专用 preload：只暴露「拉取冻结画面 / 就绪通知 / 确认选区 / 取消」
// 四个最小能力，不给任何文件系统等高权限 API（contextIsolation 开启）。
const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('snipAPI', {
  // 拉取主进程预先抓好的全屏冻结图（PNG dataURL）+ 显示器逻辑尺寸
  getImage: () => ipcRenderer.invoke('snip:get-image'),
  // 冻结图渲染完成，通知主进程显示窗口（避免先露出黑屏）
  ready: () => ipcRenderer.send('snip:ready'),
  // 确认选区（逻辑像素 { x, y, width, height }），主进程裁剪原图后返回渲染层
  confirm: (rect) => ipcRenderer.send('snip:confirm', rect),
  // 取消截图
  cancel: () => ipcRenderer.send('snip:cancel'),
});
