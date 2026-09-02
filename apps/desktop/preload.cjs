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

  // 剪贴板
  clipboard: {
    readText: () => ipcRenderer.invoke('clipboard:readText'),
    writeText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  },

  // Shell
  shell: {
    exec: (command, args, options) => ipcRenderer.invoke('shell:exec', command, args, options),
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },


  // MCP
  mcp: {
    start: (command, args, env) => ipcRenderer.invoke('mcp:start', command, args, env),
    call: (childId, method, params) => ipcRenderer.invoke('mcp:call', childId, method, params),
    kill: (childId) => ipcRenderer.invoke('mcp:kill', childId),
  },

  // BrowserView：嵌入外部网页（多标签页，每个 tabId 对应独立 BrowserView）
  browserView: {
    createTab: () => ipcRenderer.invoke('browserView:createTab'),
    closeTab: (tabId) => ipcRenderer.invoke('browserView:closeTab', tabId),
    activateTab: (tabId) => ipcRenderer.invoke('browserView:activateTab', tabId),
    load: (tabId, url) => ipcRenderer.invoke('browserView:load', tabId, url),
    back: (tabId) => ipcRenderer.invoke('browserView:back', tabId),
    forward: (tabId) => ipcRenderer.invoke('browserView:forward', tabId),
    reload: (tabId) => ipcRenderer.invoke('browserView:reload', tabId),
    resize: (tabId, x, y, width, height) => ipcRenderer.invoke('browserView:resize', tabId, x, y, width, height),
    hide: (tabId) => ipcRenderer.invoke('browserView:hide', tabId),
    getUrl: (tabId) => ipcRenderer.invoke('browserView:getUrl', tabId),
    canGoBack: (tabId) => ipcRenderer.invoke('browserView:canGoBack', tabId),
    canGoForward: (tabId) => ipcRenderer.invoke('browserView:canGoForward', tabId),
    setZoomFactor: (tabId, factor) => ipcRenderer.invoke('browserView:setZoomFactor', tabId, factor),
    insertScrollbarCSS: (tabId, css) => ipcRenderer.invoke('browserView:insertScrollbarCSS', tabId, css),
    setTheme: (tabId, theme) => ipcRenderer.invoke('browserView:setTheme', tabId, theme),
    action: (tabId, action, args) => ipcRenderer.invoke('browserView:action', tabId, action, args),
    onNavigated: (callback) => {
      ipcRenderer.on('browserView:navigated', (_e, tabId, url) => callback(tabId, url));
    },
    onLoaded: (callback) => {
      ipcRenderer.on('browserView:loaded', (_e, tabId, url) => callback(tabId, url));
    },
  },
});
