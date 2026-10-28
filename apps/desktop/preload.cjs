const { ipcRenderer, contextBridge, webUtils } = require('electron');

/**
 * 本实例的后端 API 端口 + 基址。
 *
 * ★★★ 必须由主进程下发（additionalArguments），**不在渲染层硬编码端口**。
 *   原因：端口是"实例级"配置（2026-10-10 起 dev 与安装版同为 3001；
 *   可用 YANZHI_API_PORT 临时错开做并存调试）；
 *   若前端写死，实例切换时界面会去请求**另一个实例的后端**（数据串台、看着像"软件自己在变"）。
 *
 * 取值顺序：主进程下发的 `--yz-api-port=<n>` → 环境变量 → 3001（兜底）。
 * process.argv 在 preload（有 node 能力）里可读；渲染层拿不到 env，只能走 contextBridge。
 */
function resolveApiPort() {
  try {
    const hit = (process.argv || []).find((a) => a.startsWith('--yz-api-port='));
    if (hit) {
      const n = Number(hit.split('=')[1]);
      if (Number.isInteger(n) && n > 0 && n < 65536) return n;
    }
  } catch { /* ignore */ }
  const envPort = Number(process.env.YANZHI_API_PORT);
  if (Number.isInteger(envPort) && envPort > 0 && envPort < 65536) return envPort;
  return 3001;
}
const API_PORT = resolveApiPort();

// ★ 渲染层心跳（2026-10-19）：主线程被长任务/大列表占死时，页面里的定时器也会停。
//   主进程看门狗据此判定"界面已卡死"并自动重载窗口 —— 用户不再需要点任何东西。
try {
  setInterval(() => {
    try { ipcRenderer.send('yz:renderer-heartbeat'); } catch { /* 窗口正在销毁 */ }
  }, 2000);
} catch { /* preload 顶层异常不应阻断 API 暴露 */ }

// 通过 contextBridge 安全地暴露 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 本实例后端端口 / 基址（含 /api 前缀）—— 所有前端请求地址都从这里取，禁止再写 3001
  apiPort: API_PORT,
  apiBase: 'http://127.0.0.1:' + API_PORT + '/api',
  apiOrigin: 'http://127.0.0.1:' + API_PORT,
  // 是否开发实例（界面可据此区分标题，避免与安装版窗口混淆）
  isDevInstance: (process.argv || []).includes('--yz-dev-instance'),
  // 窗口控制
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  // 界面刷新（顶栏刷新按钮）：由主进程执行 reloadIgnoringCache，界面卡住时的自救出口
  reload: () => ipcRenderer.send('window-reload'),
  // 远程控制隐私屏（remote-control 插件）：true=所有显示器铺全黑点击穿透窗，false=撤掉
  rcPrivacy: (on) => ipcRenderer.invoke('rc:privacy', !!on),
  // 远控多显示器：枚举本机显示器（物理像素 bounds + 桌面采集源名）与选择采集目标
  rcDisplays: () => ipcRenderer.invoke('rc:displays'),
  rcSetCaptureDisplay: (id) => ipcRenderer.invoke('rc:set-capture-display', String(id == null ? '' : id)),
  // 远控明示原则：会话开始弹系统通知（渲染层轮询发现新会话时调用）
  rcNotify: (title, body) => ipcRenderer.invoke('rc:notify', String(title || ''), String(body || '')),
  // 远控托盘状态：上报「远控中」会话（托盘提示/菜单随之更新）
  rcSessionState: (active, device) => ipcRenderer.invoke('rc:session-state', !!active, String(device || '')),
  // 远控确认弹窗抬升：确认弹窗在主窗口，远控/二维码页是独立子窗口会压在它上面
  rcRaisePrompt: (on) => ipcRenderer.invoke('rc:raise', !!on),
  // 托盘「一键断开」回调：主进程菜单点击 → 渲染层在 host WS 上发 session.stop {all:true}
  onRcDisconnectAll: (cb) => ipcRenderer.on('rc:disconnect-all', () => { try { cb(); } catch { /* ignore */ } }),
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

  // 宠物伴星（2026-10-28）：透明置顶宠物窗的生命周期、状态同步与穿透控制
  pet: {
    open: () => ipcRenderer.invoke('pet:open'),
    close: () => ipcRenderer.invoke('pet:close'),
    toggle: () => ipcRenderer.invoke('pet:toggle'),
    isOpen: () => ipcRenderer.invoke('pet:is-open'),
    // 主窗口 → 主进程 → 宠物窗：轻量任务视图（状态 / 标题 / 计数）
    sync: (payload) => ipcRenderer.send('pet:sync', payload || {}),
    // 设置变更（渲染器 / 形象 / 缩放）即时下发给宠物窗
    settings: (payload) => ipcRenderer.send('pet:settings', payload || {}),
    // 系统通知（完成 / 出错 / 等你输入）：主进程弹原生通知，点击前置主窗并跳会话
    notify: (payload) => ipcRenderer.send('pet:notify', payload || {}),
    // 宠物窗刚加载完：主动要一次当前状态（主窗只在变化时推，重载后拿不到旧值）
    requestSync: () => ipcRenderer.send('pet:request-sync'),
    // 主窗侧订阅：宠物窗要数据时，把当前快照推一次
    onNeedSync: (cb) => {
      const h = () => cb();
      ipcRenderer.on('pet:need-sync', h);
      return () => ipcRenderer.removeListener('pet:need-sync', h);
    },
    // 宠物窗：指针命中宠物矩形时关穿透，离开时开穿透
    setInteractive: (on) => ipcRenderer.send('pet:set-interactive', !!on),
    // 宠物窗拖拽 = 移动窗口（渲染层只知道相对位移）
    moveBy: (dx, dy) => ipcRenderer.send('pet:move-by', Number(dx) || 0, Number(dy) || 0),
    // 沿屏幕底边踱步：{ on: true } 起走 / { on: false } 停下（位移由主进程算）
    walk: (payload) => ipcRenderer.send('pet:walk', payload || {}),
    // 3D 形象：选择 / 读取自定义 VRM；内置模型也从主进程读（打包版 file:// 不能 fetch）
    pickVrm: () => ipcRenderer.invoke('pet:pick-vrm'),
    readVrm: (filePath) => ipcRenderer.invoke('pet:read-vrm', filePath),
    readBuiltinVrm: () => ipcRenderer.invoke('pet:read-builtin-vrm'),
    onWalkState: (cb) => {
      const h = (_e, p) => cb(p);
      ipcRenderer.on('pet:walk-state', h);
      return () => ipcRenderer.removeListener('pet:walk-state', h);
    },
    // 窗口可见 / 应用在前台：渲染层据此失焦降帧、隐藏即停渲染
    onWinState: (cb) => {
      const h = (_e, p) => cb(p);
      ipcRenderer.on('pet:win-state', h);
      return () => ipcRenderer.removeListener('pet:win-state', h);
    },
    // 宠物窗动作回传（点行跳会话等；P0 先留通道）
    action: (action) => ipcRenderer.send('pet:action', action || {}),
    onState: (cb) => {
      const h = (_e, p) => cb(p);
      ipcRenderer.on('pet:state', h);
      return () => ipcRenderer.removeListener('pet:state', h);
    },
    onSettings: (cb) => {
      const h = (_e, p) => cb(p);
      ipcRenderer.on('pet:settings', h);
      return () => ipcRenderer.removeListener('pet:settings', h);
    },
    // 主进程侧开关（托盘 / Alt+P）也要让设置页的开关跟着变
    onOpened: (cb) => {
      const h = () => cb();
      ipcRenderer.on('pet:opened', h);
      return () => ipcRenderer.removeListener('pet:opened', h);
    },
    onClosed: (cb) => {
      const h = () => cb();
      ipcRenderer.on('pet:closed', h);
      return () => ipcRenderer.removeListener('pet:closed', h);
    },
    onAction: (cb) => {
      const h = (_e, p) => cb(p);
      ipcRenderer.on('pet:action', h);
      return () => ipcRenderer.removeListener('pet:action', h);
    },
  },

  // 桌面录屏（screen_record 工具执行端）：主进程 capturePage 定帧采样 + ffmpeg 编码 mp4
  screenRecord: {
    // opts: { outPath, target?('task:<convId>'|''=主窗口), fps? } → { ok, recordId, outPath } | { ok:false, error }
    start: (opts) => ipcRenderer.invoke('screen-record:start', opts),
    // opts: { recordId } → { ok, outPath, durationMs, frames, bytes } | { ok:false, error }
    stop: (opts) => ipcRenderer.invoke('screen-record:stop', opts),
    // ★ 选区录屏（2026-10-26）：先指定选区所在显示器，下一次 getDisplayMedia 就抓这一块屏
    selectDisplay: (displayId) => ipcRenderer.invoke('screen-record:select-display', displayId),
    // 渲染层 MediaRecorder 产出的 webm 字节 → 落盘（能转 mp4 就转）：{ ok, file, ext } | { ok:false, error }
    saveBlob: (data, mime) => ipcRenderer.invoke('screen-record:save-blob', { data, mime }),
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

  // 原生对话框（选择目录 / 多选文件 / 保存）
  dialog: {
    showOpenDir: (options) => ipcRenderer.invoke('dialog:showOpenDir', options),
    // 多选文件（options 可选；返回绝对路径数组，取消返回 []）
    showOpenFiles: () => ipcRenderer.invoke('dialog:showOpenFiles'),
    // 系统保存框（媒体右键「另存为」）
    saveFile: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
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

  // AI 急停全局热键（computer-use 唯一安全阀）：★ 不可禁用，主进程对空值回退默认键
  panicHotkey: {
    // 读取当前生效的热键（Electron accelerator 串；主进程保证恒非空）
    get: () => ipcRenderer.invoke('shortcut:getPanic'),
    // 换键，返回 { ok, accelerator, error? }（被占用时 ok=false 并给出原因）
    set: (accel) => ipcRenderer.invoke('shortcut:setPanic', accel),
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
    // ★ B5（2026-10-10）：查询桌面端支持哪些 action（单一真相源在主进程，
    //   渲染层据此推导映射，避免两份硬编码清单漂移 → "能力在、入口断"）。
    actions: () => ipcRenderer.invoke('browserView:actions'),
    createTab: (scope) => ipcRenderer.invoke('browserView:createTab', scope),
    closeTab: (tabId, fromUi) => ipcRenderer.invoke('browserView:closeTab', tabId, fromUi),
    // 关闭指定 scope 下的所有 tab（多会话隔离：切换会话/卸载 BrowserPanel 时调用，避免 tab 堆积）
    closeAllTabs: (scope, fromUi) => ipcRenderer.invoke('browserView:closeAllTabs', scope, fromUi),
    // 收尾自动收拾：关闭全部 agent 打开的 tab（agentOpened===true，用户手开的不动），返回 { closed: n }
    closeAgentTabs: () => ipcRenderer.invoke('browserView:closeAgentTabs'),
    // ★ 按**会话**关闭 agent 操作过的页面（「直连化」可见性契约）：桥档下渲染层不执行
    //   browser_* 工具 → 渲染层的 agentOpened 记账恒为空 → closeAgentTabs 关不掉东西。
    //   主进程按自己的 agentTouchedTabs 收口（不依赖渲染层）。
    closeConvTabs: (convId) => ipcRenderer.invoke('browserView:closeConvTabs', convId),
    // ★ P3-6 目标页锁定：页面对话任务开始时钉住"用户指的那一页"，任务期间不许换标签页。
    //   锁定语义与判定本体见 browser-target.cjs 的 createFlowPinRegistry / resolveTarget；
    //   这里只转发（幂等，任务异常结束时多调一次 unpin 也不会误伤别人）。
    pinTarget: (convId, flow, tabId) => ipcRenderer.invoke('browserView:pinTarget', convId, flow, tabId),
    unpinTarget: (convId, flow) => ipcRenderer.invoke('browserView:unpinTarget', convId, flow),
    activateTab: (tabId) => ipcRenderer.invoke('browserView:activateTab', tabId),
    // 截图当前页（用户从「更多」菜单触发）：落盘到图片目录，返回 { file }
    captureTab: (tabId) => ipcRenderer.invoke('browserView:captureTab', tabId),
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
    // ★ 2026-10-23：任务收尾清编号层（主进程按自己的 tab 表逐个关，含已隐藏页面）
    highlightOffAll: () => ipcRenderer.invoke('browserView:highlightOffAll'),
    // ★ 2026-10-27：面板判定 pageAgent 已收工（45s 无动作）时告知主进程 —— 主进程据此清掉
    //   "最近有动作"的记账，最小化不再弹「浏览器任务运行中」（真有动作在途由 tabActionBusy 兜住）。
    agentIdle: () => ipcRenderer.send('browserView:agentIdle'),
    // 截图临时可见：非激活 webview 默认 visibility:hidden（省 CPU），截图前主进程临时点亮
    onCaptureVisible: (callback) => {
      const h = (_e, tabId, visible) => callback(tabId, visible);
      ipcRenderer.on('browser:wv:captureVisible', h);
      return () => ipcRenderer.removeListener('browser:wv:captureVisible', h);
    },
    // ★★★ 2026-10-11：所有 onXxx 改为**返回 unsubscribe 函数**。
    //   此前每个 onXxx 只 `ipcRenderer.on` 不注销 ⇒ 组件每次挂载都新增一份监听器
    //   ⇒ 实测 `MaxListenersExceededWarning: 11 browserView:tabCreated listeners added`
    //   ⇒ 内存泄漏 + 事件被旧回调重复消费（"一下开 5 个"类问题）。
    //   ★ 向后兼容：旧调用方忽略返回值照常工作（只是不注销）。
    onNavigated: (callback) => {
      const h = (_e, tabId, url) => callback(tabId, url);
      ipcRenderer.on('browserView:navigated', h);
      return () => ipcRenderer.removeListener('browserView:navigated', h);
    },
    onLoaded: (callback) => {
      const h = (_e, tabId, url) => callback(tabId, url);
      ipcRenderer.on('browserView:loaded', h);
      return () => ipcRenderer.removeListener('browserView:loaded', h);
    },
    onCrashed: (callback) => {
      const h = (_e, tabId, reason) => callback(tabId, reason);
      ipcRenderer.on('browserView:crashed', h);
      return () => ipcRenderer.removeListener('browserView:crashed', h);
    },
    onTabActivated: (callback) => {
      const h = (_e, tabId) => callback(tabId);
      ipcRenderer.on('browserView:tabActivated', h);
      return () => ipcRenderer.removeListener('browserView:tabActivated', h);
    },
    // 主进程兜底自建 tab（ensureActiveTab 超时）时广播，渲染层补建 tab 壳，避免"导航黑洞"
    onTabCreated: (callback) => {
      // ★ 第 4 个参数 `background`（2026-10-15 后台标签页）：该页是**后台流**建的 ⇒ 渲染层不切过去。
      //   必须转发 —— 丢了它，两个 pageAgent 并行时用户正在看的页会被顶掉（验收口径 #2）。
      const h = (_e, tabId, url, scope, background) => callback(tabId, url, scope, background);
      ipcRenderer.on('browserView:tabCreated', h);
      return () => ipcRenderer.removeListener('browserView:tabCreated', h);
    },
    // tab 关闭广播（2026-10-09）：agent 关 tab / 收尾自动收拾 / closeAllTabs 时推送，渲染层幂等摘壳
    onTabClosed: (callback) => {
      const h = (_e, tabId) => callback(tabId);
      ipcRenderer.on('browserView:tabClosed', h);
      return () => ipcRenderer.removeListener('browserView:tabClosed', h);
    },
    // tab 休眠广播（2026-10-19）：内存回收不再关 tab，只销毁 guest 并保留壳与 url
    onTabSuspended: (callback) => {
      const h = (_e, tabId, url) => callback(tabId, url);
      ipcRenderer.on('browserView:tabSuspended', h);
      return () => ipcRenderer.removeListener('browserView:tabSuspended', h);
    },
    // tab 唤醒广播：agent 动作命中休眠 tab 时主进程请求渲染层重建 <webview>（不切可见）
    onTabResume: (callback) => {
      const h = (_e, tabId) => callback(tabId);
      ipcRenderer.on('browserView:tabResume', h);
      return () => ipcRenderer.removeListener('browserView:tabResume', h);
    },
    // 页面 title 变化推送，渲染层更新 tab 标题（真实网站名而非 URL）
    onTitleUpdated: (callback) => {
      const h = (_e, tabId, title) => callback(tabId, title);
      ipcRenderer.on('browserView:pageTitle', h);
      return () => ipcRenderer.removeListener('browserView:pageTitle', h);
    },
    // 渲染层重载完成后主进程通知"重认领"BrowserView（黑屏兜底，见 BrowserPanel onResync）
    onResync: (callback) => {
      const h = () => callback();
      ipcRenderer.on('browserView:resync', h);
      return () => ipcRenderer.removeListener('browserView:resync', h);
    },
    // Agent 虚拟鼠标广播：主进程在 browserView:action 完成后推送 guest 光标坐标（已按缩放换算）
    onCursor: (callback) => {
      const h = (_e, tabId, x, y, label, kind) => callback(tabId, x, y, label, kind);
      ipcRenderer.on('browserView:cursor', h);
      return () => ipcRenderer.removeListener('browserView:cursor', h);
    },
    // ★ 不提供 offAll()：BrowserPanel 可能**两个实例并存**（对话页 preview 面板 + /browser 独立页），
    //   一次性 removeAllListeners 会把另一实例的监听也清掉。故只暴露**精确的** unsubscribe
    //   （每个 onXxx 返回各自的 removeListener 闭包），由组件实例自己收集、卸载时逐个调用。
  },

  // webview 引擎：网页 window.open / target=_blank 统一转应用内新标签页
  onOpenTab: (callback) => {
    // scope：弹窗归属空间（preview/page），渲染层据此只让对应的面板接管，避免两边同时开 tab
    const h = (_e, url, scope) => callback(url, scope);
    ipcRenderer.on('browser:wv:openTab', h);
    return () => ipcRenderer.removeListener('browser:wv:openTab', h);
  },
  // webview 引擎：agent 首次 navigate 时主进程请求某 scope 的浏览器面板把 URL 作为当前页打开
  // （面板还停在主页/无 <webview> 时先由此建出 guest，浏览器才算真正"打开网址"）
  onForceOpen: (callback) => {
    const h = (_e, url, scope, tabId) => callback(url, scope, tabId);
    ipcRenderer.on('browser:wv:forceOpen', h);
    return () => ipcRenderer.removeListener('browser:wv:forceOpen', h);
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

  // 收藏夹：从本机 Chrome/Edge 只读导入（返回归一化书签树，id/合并由渲染层处理）
  bookmarks: {
    importChrome: () => ipcRenderer.invoke('bookmarks:importChrome'),
  },

  // 浏览器扩展（P1/P2）：安装/开关/卸载/打开扩展页面/商店白名单
  extensions: {
    list: () => ipcRenderer.invoke('ext:list'),
    mode: () => ipcRenderer.invoke('ext:mode'),
    installDir: () => ipcRenderer.invoke('ext:installDir'),
    installZip: () => ipcRenderer.invoke('ext:installZip'),
    toggle: (key, enabled) => ipcRenderer.invoke('ext:toggle', key, enabled),
    remove: (key) => ipcRenderer.invoke('ext:remove', key),
    openPage: (key, kind) => ipcRenderer.invoke('ext:openPage', key, kind),
    whitelist: () => ipcRenderer.invoke('ext:whitelist'),
    installStore: (idOrUrl) => ipcRenderer.invoke('ext:installStore', idOrUrl),
    update: () => ipcRenderer.invoke('ext:update'),
    actions: () => ipcRenderer.invoke('ext:actions'),
    actionClick: (key) => ipcRenderer.invoke('ext:actionClick', key),
    onActionUpdated: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on('ext:action:updated', handler);
      return () => ipcRenderer.removeListener('ext:action:updated', handler);
    },
  },
});
