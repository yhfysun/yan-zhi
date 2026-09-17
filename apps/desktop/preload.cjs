const { ipcRenderer, contextBridge, webUtils } = require('electron');

// 通过 contextBridge 安全地暴露 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  // 界面刷新（顶栏刷新按钮）：由主进程执行 reloadIgnoringCache，界面卡住时的自救出口
  reload: () => ipcRenderer.send('window-reload'),
  // 平台标识
  platform: process.platform,
  isElectron: true,

  // 独立子窗口（diff / 冲突解决等「另开一个窗口」的场景）
  childWindow: {
    // 打开（或聚焦已有）子窗口；route 走应用内的 hash 路由
    open: (opts) => ipcRenderer.invoke('child-window:open', opts),
    isMaximized: () => ipcRenderer.invoke('child-window:is-maximized'),
    focusMain: () => ipcRenderer.invoke('child-window:focus-main'),
    // 开窗前投递初始载荷（diff 文本 / 冲突路径等），子窗口就绪后取走
    putPayload: (key, payload) => ipcRenderer.invoke('child-window:put-payload', key, payload),
    takePayload: (key) => ipcRenderer.invoke('child-window:take-payload', key),
  },

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
    stat: (p) => ipcRenderer.invoke('fs:stat', p),
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
    // 写入图片（dataURL）——媒体预览右键「复制」用
    writeImage: (dataUrl) => ipcRenderer.invoke('clipboard:writeImage', dataUrl),
  },

  // 系统保存框（媒体右键「另存为」）
  dialog: {
    saveFile: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
  },

  // 屏幕截图（框选）：invoke 挂起直到用户在框选窗确认（返回 { ok, dataUrl, width, height }）
  // 或取消（{ ok:false, cancelled:true }）。仅桌面端存在，渲染层据此决定是否显示截图按钮。
  screenshot: {
    capture: (opts) => ipcRenderer.invoke('screenshot:capture', opts),
    // 开新截图前先清理可能残留的旧会话（对未升级的主进程返回异常，调用处需静默）
    cancel: () => ipcRenderer.invoke('screenshot:cancel'),
    // 框选窗内「保存到本地」：主进程弹系统保存框并写 PNG，返回 { ok, path } | { ok:false, cancelled }
    save: (dataUrl) => ipcRenderer.invoke('snip:save', dataUrl),
    // 全局热键回调：可能来自任意前台应用，与主窗口按钮走同一条框选流程
    onHotkey: (callback) => {
      ipcRenderer.on('shortcut:screenshot', () => callback());
    },
    // 读取当前生效的热键（Electron accelerator 串，如 'Control+Alt+A'；空串=未注册/禁用）
    getAccelerator: () => ipcRenderer.invoke('shortcut:getScreenshot'),
    // 设置热键，返回 { ok, accelerator, error? }（被占用时 ok=false 并给出原因）
    setAccelerator: (accel) => ipcRenderer.invoke('shortcut:setScreenshot', accel),
  },

  // Shell
  shell: {
    exec: (command, args, options) => ipcRenderer.invoke('shell:exec', command, args, options),
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    showItemInFolder: (p) => ipcRenderer.invoke('shell:showItemInFolder', p),
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
    // 关闭指定 scope 下的所有 tab（多会话隔离：切换会话/卸载 BrowserPanel 时调用，避免 tab 堆积）
    closeAllTabs: (scope, fromUi) => ipcRenderer.invoke('browserView:closeAllTabs', scope, fromUi),
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
    // Agent 虚拟鼠标广播：主进程在 browserView:action 完成后推送 guest 光标坐标（已按缩放换算）
    onCursor: (callback) => {
      ipcRenderer.on('browserView:cursor', (_e, tabId, x, y, label, kind) => callback(tabId, x, y, label, kind));
    },
  },

  // webview 引擎：网页 window.open / target=_blank 统一转应用内新标签页
  onOpenTab: (callback) => {
    // scope：弹窗归属空间（preview/page），渲染层据此只让对应的面板接管，避免两边同时开 tab
    ipcRenderer.on('browser:wv:openTab', (_e, url, scope) => callback(url, scope));
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
