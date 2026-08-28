const { ipcRenderer, contextBridge } = require('electron');

// 通过 contextBridge 安全地暴露 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  // 平台标识
  platform: process.platform,
  isElectron: true,

  // 数据库
  db: {
    exec: (sql, params) => ipcRenderer.invoke('db:exec', sql, params),
    query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
  },

  // 文件系统
  fs: {
    readFile: (p) => ipcRenderer.invoke('fs:readFile', p),
    readFileBase64: (p) => ipcRenderer.invoke('fs:readFileBase64', p),
    writeFile: (p, content) => ipcRenderer.invoke('fs:writeFile', p, content),
    exists: (p) => ipcRenderer.invoke('fs:exists', p),
    mkdir: (p) => ipcRenderer.invoke('fs:mkdir', p),
    remove: (p) => ipcRenderer.invoke('fs:remove', p),
    readDir: (p) => ipcRenderer.invoke('fs:readDir', p),
    listDirEntries: (p) => ipcRenderer.invoke('fs:listDirEntries', p),
  },

  // Keyring
  keyring: {
    set: (key, value) => ipcRenderer.invoke('keyring:set', key, value),
    get: (key) => ipcRenderer.invoke('keyring:get', key),
    delete: (key) => ipcRenderer.invoke('keyring:delete', key),
  },

  // 原生对话框
  dialog: {
    showOpenDir: (options) => ipcRenderer.invoke('dialog:showOpenDir', options),
  },

  // Shell
  shell: {
    exec: (command, args, options) => ipcRenderer.invoke('shell:exec', command, args, options),
  },

  // 本地小模型：轻量包首次运行下载状态、重试与当前路径
  localModel: {
    getState: () => ipcRenderer.invoke('local-model:getState'),
    start: () => ipcRenderer.invoke('local-model:start'),
    getPath: () => ipcRenderer.invoke('local-model:getPath'),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('local-model:state', listener);
      return () => ipcRenderer.removeListener('local-model:state', listener);
    },
  },

  // MCP
  mcp: {
    start: (command, args, env) => ipcRenderer.invoke('mcp:start', command, args, env),
    call: (childId, method, params) => ipcRenderer.invoke('mcp:call', childId, method, params),
    kill: (childId) => ipcRenderer.invoke('mcp:kill', childId),
  },

  // BrowserView：嵌入外部网页（替代 <webview> 标签）
  browserView: {
    load: (url) => ipcRenderer.invoke('browserView:load', url),
    back: () => ipcRenderer.invoke('browserView:back'),
    forward: () => ipcRenderer.invoke('browserView:forward'),
    reload: () => ipcRenderer.invoke('browserView:reload'),
    resize: (x, y, width, height) => ipcRenderer.invoke('browserView:resize', x, y, width, height),
    hide: () => ipcRenderer.invoke('browserView:hide'),
    getUrl: () => ipcRenderer.invoke('browserView:getUrl'),
    canGoBack: () => ipcRenderer.invoke('browserView:canGoBack'),
    canGoForward: () => ipcRenderer.invoke('browserView:canGoForward'),
    // 设置网页缩放级别（对应前端 [−]/[+] 缩放控件）
    setZoomFactor: (factor) => ipcRenderer.invoke('browserView:setZoomFactor', factor),
    // 注入滚动条主题样式（美化原生滚动条）
    insertScrollbarCSS: (css) => ipcRenderer.invoke('browserView:insertScrollbarCSS', css),
    // 同步当前主题（深/浅），由主进程据此注入对应主题色的滚动条样式
    setTheme: (theme) => ipcRenderer.invoke('browserView:setTheme', theme),
    // 监听主进程的导航事件（地址栏同步）
    onNavigated: (callback) => {
      ipcRenderer.on('browserView:navigated', (_e, url) => callback(url));
    },
    // 监听页面加载完成事件
    onLoaded: (callback) => {
      ipcRenderer.on('browserView:loaded', (_e, url) => callback(url));
    },
  },
});
