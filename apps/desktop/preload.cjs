const { ipcRenderer, contextBridge, webUtils } = require('electron');

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
    writeFileBase64: (p, b64) => ipcRenderer.invoke('fs:writeFileBase64', p, b64),
    exists: (p) => ipcRenderer.invoke('fs:exists', p),
    homeDir: () => ipcRenderer.invoke('fs:homeDir'),
    mkdir: (p) => ipcRenderer.invoke('fs:mkdir', p),
    remove: (p) => ipcRenderer.invoke('fs:remove', p),
    readDir: (p) => ipcRenderer.invoke('fs:readDir', p),
    listDirEntries: (p) => ipcRenderer.invoke('fs:listDirEntries', p),
    // 带 size/mtime 的目录列举（SFTP 本地栏用）
    listDetailed: (p) => ipcRenderer.invoke('fs:listDetailed', p),
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
    // 多选文件（options 可选；返回绝对路径数组，取消返回 []）
    showOpenFiles: () => ipcRenderer.invoke('dialog:showOpenFiles'),
  },

  // 文件路径解析：拖拽 / <input type=file> 得到的 File 转绝对路径（Electron 32+ 移除 File.path）
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
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
    createTab: (scope) => ipcRenderer.invoke('browserView:createTab', scope),
    closeTab: (tabId, fromUi) => ipcRenderer.invoke('browserView:closeTab', tabId, fromUi),
    activateTab: (tabId) => ipcRenderer.invoke('browserView:activateTab', tabId),
    ensureActiveTab: (scope) => ipcRenderer.invoke('browserView:ensureActiveTab', scope),
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
    getZoomFactor: (tabId) => ipcRenderer.invoke('browserView:getZoomFactor', tabId),
    setTheme: (tabId, theme) => ipcRenderer.invoke('browserView:setTheme', tabId, theme),
    action: (tabId, action, args) => ipcRenderer.invoke('browserView:action', tabId, action, args),
    onNavigated: (callback) => {
      ipcRenderer.on('browserView:navigated', (_e, tabId, url) => callback(tabId, url));
    },
    onLoaded: (callback) => {
      ipcRenderer.on('browserView:loaded', (_e, tabId, url) => callback(tabId, url));
    },
    onCrashed: (callback) => {
      ipcRenderer.on('browserView:crashed', (_e, tabId, reason) => callback(tabId, reason));
    },
    onTabActivated: (callback) => {
      ipcRenderer.on('browserView:tabActivated', (_e, tabId) => callback(tabId));
    },
    // 主进程兜底自建 tab（ensureActiveTab 超时）时广播，渲染层补建 tab 壳，避免"导航黑洞"
    onTabCreated: (callback) => {
      ipcRenderer.on('browserView:tabCreated', (_e, tabId, url, scope) => callback(tabId, url, scope));
    },
    // 页面 title 变化推送，渲染层更新 tab 标题（真实网站名而非 URL）
    onTitleUpdated: (callback) => {
      ipcRenderer.on('browserView:pageTitle', (_e, tabId, title) => callback(tabId, title));
    },
    // 渲染层重载完成后主进程通知"重认领"BrowserView（黑屏兜底，见 BrowserPanel onResync）
    onResync: (callback) => {
      ipcRenderer.on('browserView:resync', () => callback());
    },
  },

  // webview 引擎：网页 window.open / target=_blank 统一转应用内新标签页
  onOpenTab: (callback) => {
    ipcRenderer.on('browser:wv:openTab', (_e, url) => callback(url));
  },
  // webview 引擎：agent 首次 navigate 时主进程请求某 scope 的浏览器面板把 URL 作为当前页打开
  // （面板还停在主页/无 <webview> 时先由此建出 guest，浏览器才算真正"打开网址"）
  onForceOpen: (callback) => {
    ipcRenderer.on('browser:wv:forceOpen', (_e, url, scope) => callback(url, scope));
  },

  // pageAgent 浏览器操作统一通道（IPC 直连 BrowserView，不依赖后端 Playwright）
  browser: {
    call: (action, args) => ipcRenderer.invoke('browser:call', action, args),
    // 引擎：'webview'（DOM 内嵌，浮层可覆盖）| 'browserview'（旧原生图层）
    engine: () => ipcRenderer.invoke('browser:engine'),
    setEngine: (engine) => ipcRenderer.invoke('browser:setEngine', engine),
    // webview 引擎：把 <webview> 的 guest webContentsId 注册到主进程
    wvRegister: (tabId, wcId, scope) => ipcRenderer.invoke('browser:wv:register', tabId, wcId, scope),
    wvUnregister: (tabId) => ipcRenderer.invoke('browser:wv:unregister', tabId),
  },
});
