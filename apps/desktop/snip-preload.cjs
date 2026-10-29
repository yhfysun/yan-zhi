// 截图框选窗专用 preload：透明实时遮罩方案下的最小能力集（contextIsolation 开启）。
// 框选期间窗口透明、实时屏幕可见，抓屏发生在确认/保存那一刻（主进程 requestCompose）。
const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('snipAPI', {
  // 主进程开启新一轮截图（复用窗口，页面常驻）：重置状态后回报 ready
  onNewSession: (callback) => { ipcRenderer.on('snip:new-session', () => callback()); },
  // ★ 2026-10-24：亮窗前下发的冻结帧（本轮截图"框选时看到的就是截出来的"那张底图）。
  //   遮罩一亮 hover 弹窗/下拉就没了，所以底图必须在亮窗前抓。空帧 → 回落实时屏幕。
  onFreeze: (callback) => { ipcRenderer.on('snip:freeze', (_e, info) => callback(info || {})); },
  // 状态重置完成，主进程此刻亮窗
  ready: () => ipcRenderer.send('snip:ready'),
  // 重新枚举可见窗口（hover 窗口识别）
  listWindows: () => ipcRenderer.invoke('snip:list-windows'),
  // 确认选区（逻辑像素 { x, y, width, height }）：主进程抓干净帧回发 snip:compose
  confirm: (rect) => ipcRenderer.send('snip:confirm', rect),
  // 保存到本地（rect 可选，缺省全屏）
  save: (rect) => ipcRenderer.send('snip:save-request', rect),
  // 取消截图
  cancel: () => ipcRenderer.send('snip:cancel'),
  // 主进程抓到干净帧：页面裁剪 + 重绘标注 → composed 回传
  // info: { action: 'confirm'|'save', frameUrl, x, y, w, h }（物理像素）
  onCompose: (callback) => { ipcRenderer.on('snip:compose', (_e, info) => callback(info)); },
  composed: (payload) => ipcRenderer.send('snip:composed', payload),
  // 保存结果（保存对话框关闭后回发；框选窗已恢复显示）
  onSaveResult: (callback) => { ipcRenderer.on('snip:save-result', (_e, r) => callback(r)); },
  // OCR（2026-10-29）：识别选区文字 / 识别并翻译。与 confirm 共用合成管线
  // （主进程取"带标注的选区图"），结果经 snip:ocr-result 回发。
  ocr: (rect, translate) => ipcRenderer.send('snip:ocr-request', { rect, translate: !!translate }),
  onOcrResult: (callback) => { ipcRenderer.on('snip:ocr-result', (_e, r) => callback(r || {})); },
  // 识别结果面板上的两个动作：复制文字 / 交给 AI 翻译（结果在会话里）
  copyText: (text) => ipcRenderer.send('snip:copy-text', String(text || '')),
  translateText: (text) => ipcRenderer.send('snip:translate-text', String(text || '')),
});
