// 浏览器桥 —— 让**服务端**直连浏览器执行面（「执行面直连化」P0-3，2026-10-10）
//
// ★★★ 这个文件是干嘛的（一句话）：
//   把「服务端驱动浏览器」这条命令通道，从**绕道渲染层（SSE 委托）**改为**服务端直连主进程**。
//   浏览器仍然活在主进程里（画面 / 虚拟光标 / 输入锁全部不变），变的只是**谁把命令送进来**。
//
// ★ 为什么需要（现状缺口的实测依据，见 server/src/llm-task-manager.ts）：
//   · `:3825` `task.subscribers.size === 0` → 等 15s 重连窗口；`:3835` 再等 8s
//     ⇒ 单次浏览器工具最坏卡 **23s**（"一断全停"的直接来源）；
//   · `:4022` 无订阅者 → `unattendedToolResult()` —— 浏览器工具**根本不执行**；
//   · 服务端是**独立进程**（main.cjs spawn 出来），拿不到 BrowserView 句柄，
//     所以此前只能靠渲染层转发。
//   ⇒ 本模块把这条依赖从链路里**结构性去掉**（"重试/宽限"只是把等待往后挪，没消除依赖）。
//
// ★★★ 安全边界（这是这条任务当初"没敢动"的正面回答，逐条对应威胁）：
//   ① **同机任意进程越权**（扫端口直接驱动用户浏览器）：
//      每启动 `crypto.randomBytes(32)` 随机 token + `timingSafeEqual` 恒定时间比对；
//      无/错 token **统一回 404**（不泄露端点存在、不给爆破反馈）。
//   ② **网页侧可达（CSRF）**：用户在 guest 里访问的**任意网站**尝试 POST 本机端点，
//      借用户之手驱动浏览器。措施：token **只在主进程内存 + server spawn env**，
//      **绝不**经 preload / localStorage / SSE 下发到任何网页上下文；
//      不回任何 CORS 头、不响应预检 ⇒ 浏览器侧跨源读响应被拦、写请求因无 token 被拒。
//   ③ **能力面过大**（端点被当通用 IPC 隧道）：只暴露 action 白名单（DESKTOP_BROWSER_ACTIONS），
//      **不**暴露 shell / MCP / 文件系统等其它 IPC 能力。
//   ④ **跨会话越权**：convId → tab 锚定在主进程解析（main.cjs runBrowserAction），
//      未锚定**明确报错**，绝不静默打到全局活动页。
//   ⑤ **危险协议**：navigate 复用现有 `^https?://` 校验（runBrowserAction 内，逐字同一实现）。
//   ⑥ **本地 DoS**：body 上限 + 仅接受 application/json + action 白名单前置拒绝。
//
// ★ 形态选择（为什么是 loopback HTTP）：
//   备选 A「父子进程 Node IPC（spawn ipc 通道）」不采用 —— dev 下 server 是
//   `spawn(process.execPath, [tsx, 'watch', ...])`，`tsx watch` 内部还会再 fork 真正的应用，
//   `process.send` 可能不存在/热重载后失效；且 `bin/dev.mjs server` 独立启动时**没有父进程通道**。
//   HTTP loopback 是唯一覆盖"主进程在、server 在"全部路径的一致形态。
//   备选 B「复用 CDP 端口」不可行 —— CDP 只到页面级 domain，且 Electron 的 CDP 实现不全
//   （`Target.createTarget: Not supported` 是既有实测结论），拿不到主进程侧资产
//   （会话锚定 / 虚拟光标 / 输入锁），现有 `pickCdpPage` 只能猜页，正是历史病灶。
//
// ★ 灰度（YZ_BROWSER_BRIDGE，在主进程与 server 同源读）：
//   off（桥不启动）| shadow（只读 action 走桥）| on（读写全走桥 + 失败自动降级）← **默认** | strict（全走桥）
//   ★ 本文件只负责"起端点和鉴权"；档位语义由 server 侧 decideBrowserExecution 决定。
//     这样"桥在不在"与"用不用桥"是两个正交问题，灰度切档不需要重启 Electron。
//   ★★★ 2026-10-10：默认从 off 提为 on（与 server 侧 DEFAULT_BRIDGE_MODE 同源）。
//     off 下端点根本不启动 → 服务端拿不到 URL/token → available() 恒 false → 永远走 SSE 委托，
//     这正是「前端一卡任务就磨」的根因。提为 on 后端点就位，失败仍会自动降级回 SSE。
//     ⚠️ 两侧默认值**必须一致**（守门测试会比对），否则会出现"服务端想用桥、主进程没起端点"的空转。

const http = require('http');
const crypto = require('crypto');

// ★ 端点路径与 header 名必须与 server 侧 `browser-bridge.ts` **逐字一致**
const BRIDGE_PATH = '/v1/browser/action';
const TOKEN_HEADER = 'x-yz-bridge-token';
const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1MB：action 入参（含 base64 路径等）远小于此

/** 默认档位（与 server 侧 DEFAULT_BRIDGE_MODE 同值） */
const DEFAULT_BRIDGE_MODE = 'on';

/** 档位：off 时不启动端点（2026-10-10 起默认为 on，见上方长注释） */
function bridgeMode() {
  const v = String(process.env.YZ_BROWSER_BRIDGE || DEFAULT_BRIDGE_MODE).trim().toLowerCase();
  return ['off', 'shadow', 'on', 'strict'].includes(v) ? v : DEFAULT_BRIDGE_MODE;
}

let server = null;
let readyPromise = null;
let state = {
  url: '',        // http://127.0.0.1:<port>
  token: '',      // 每启动随机；仅留在本进程内存
  mode: 'off',
  startedAt: 0,
};
let deps = null;

/**
 * 启动桥（幂等）。**只绑 127.0.0.1**、端口 0（自动分配）。
 *
 * ★★★ 返回 Promise，**必须在 `envForServer()` 之前 await**（2026-10-10 真跑测试抓到的真缺陷）：
 *   `server.listen()` 是**异步**的 —— 端口在 listening 回调里才拿到。若不等就取 `envForServer()`，
 *   会拿到空 url/token ⇒ 注入给后端的 env 为空 ⇒ 服务端 `browserBridgeAvailable()` 为 false
 *   ⇒ **直连静默失效**（不报错、只是走了旧路径，最难查的一类）。
 *   ⇒ main.cjs 的调用点写成 `await browserBridge.start()`。
 *
 * ★ 为什么绑 127.0.0.1 而不是 0.0.0.0：loopback 绑定的 HTTP 服务不触发
 *   Windows 防火墙授权弹窗，且外部网络完全不可达。
 * ★ 为什么端口 0：与 CDP 端口同一手法（main.cjs 注释已论证"自动选端口从根上消除抢占"），
 *   多实例并存不冲突，异常退出也没有残留端口占用问题。
 */
function start() {
  if (readyPromise) return readyPromise; // 幂等：重复调用返回同一个 ready promise
  const mode = bridgeMode();
  state.mode = mode;
  if (mode === 'off') {
    deps.log('[bridge] 档位 off —— 未启动（服务端走原有 SSE 委托路径）');
    readyPromise = Promise.resolve(state);
    return readyPromise;
  }
  if (!deps) throw new Error('[bridge] attach() 未调用');

  state.token = crypto.randomBytes(32).toString('hex');

  server = http.createServer((req, res) => {
    // ★★★ 统一 404：**不区分**"路径不对 / 无 token / token 错 / body 非法" ——
    //   不泄露"端点存在"这一事实，也不给爆破任何反馈（安全边界 ①②）。
    //   只有"路径对 + token 对"才进入业务，此时才可能返回 200/4xx 业务错误。
    const deny = () => { try { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found'); } catch { /* ignore */ } };

    try {
      // 只认 POST + 精确路径
      if (req.method !== 'POST' || req.url !== BRIDGE_PATH) return deny();

      // 恒定时间比对 token（长度不等直接拒，避免 timingSafeEqual 抛异常）
      const raw = req.headers[TOKEN_HEADER];
      const got = Array.isArray(raw) ? raw[0] : raw;
      if (typeof got !== 'string' || got.length !== state.token.length) return deny();
      let okToken = false;
      try {
        okToken = crypto.timingSafeEqual(Buffer.from(got, 'utf8'), Buffer.from(state.token, 'utf8'));
      } catch { okToken = false; }
      if (!okToken) return deny();

      // 只接受 application/json（不吃表单/多段，缩小解析面）
      const ctype = String(req.headers['content-type'] || '');
      if (!ctype.includes('application/json')) {
        res.writeHead(415, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'content-type 必须为 application/json' }));
      }

      let size = 0;
      let rejected = false;   // ★ 超限后进入"只丢弃不再累积"态（见下）
      const chunks = [];
      req.on('data', (c) => {
        if (rejected) return; // 已回 413，继续丢弃后续数据（不再累积）
        size += c.length;
        if (size > MAX_BODY_BYTES) {
          // ★★★ 先**正常回响应**再停止累积，**不要立刻 req.destroy()**（2026-10-10 真跑实测）：
          //   立刻 destroy 会在客户端读到响应**之前**断连 ⇒ 客户端只看到 `ECONNRESET`
          //   （而不是 413）→ 排障时误判成"桥崩了"。改为回 413 + 丢弃后续数据，
          //   让调用方拿到明确错误码；连接随后由客户端自行关闭。
          rejected = true;
          try { res.writeHead(413, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'body 过大' })); } catch { /* ignore */ }
          return;
        }
        chunks.push(c);
      });
      req.on('end', async () => {
        if (rejected) return;
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
        catch { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'body 不是合法 JSON' })); }

        const convId = body && body.convId ? String(body.convId) : null;
        const action = body && body.action ? String(body.action) : '';
        const tabId = body && body.tabId != null ? String(body.tabId) : null;
        const args = (body && body.args) || {};

        // ★ 能力面收窄：只允许 action 白名单（与 DESKTOP_BROWSER_ACTIONS 同源传入）
        if (!action || !deps.allowedActions.includes(action)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: `不支持的浏览器 action: ${action}` }));
        }
        if (!convId) {
          // 桥调用**必须**带会话标识 —— 没有它就没法把动作限定在"发起它的那个会话"的页上，
          // 会退回"静默打到全局活动页"（A4 消灭过的那类静默错页）。
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: '缺少 convId（桥调用必须携带会话标识）' }));
        }

        const t0 = Date.now();
        let result;
        try {
          result = await deps.runAction(convId, tabId, action, args);
        } catch (e) {
          result = { error: e && e.message ? e.message : String(e) };
        }
        const ms = Date.now() - t0;
        // 可观测（安全边界 ⑦）：全部桥调用落日志（action / convId / tabId / 耗时 / 结果码）
        deps.log(`[bridge] ${action} conv=${convId} tab=${tabId || '-'} ${ms}ms ${result && result.error ? 'ERR: ' + String(result.error).slice(0, 120) : 'OK'}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result || {}));
      });
      req.on('error', () => { try { res.destroy(); } catch { /* ignore */ } });
    } catch (e) {
      deps.warn('[bridge] 处理异常: ' + (e && e.message ? e.message : e));
      deny();
    }
  });

  server.on('error', (e) => deps.warn('[bridge] 服务异常: ' + (e && e.message ? e.message : e)));

  // ★ 端口 0 = 让 OS 挑空闲端口；host 硬编码 127.0.0.1（绝不 0.0.0.0）
  //   ★ 用 Promise 包住 listening 回调 —— 调用方必须 await 才能拿到 url/token（见 start 注释）。
  readyPromise = new Promise((resolveStart) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      state.url = `http://127.0.0.1:${port}`;
      state.startedAt = Date.now();
      // ★★★ 日志**绝不含 token**（连长度也不打）—— 日志常被用户贴出来排障。
      deps.log(`[bridge] 已启动（档位 ${mode}）: ${state.url}${BRIDGE_PATH} —— 凭据仅在本进程内存，不落盘、不进日志`);
      resolveStart(state);
    });
    server.once('error', () => {
      // 监听失败（极端情况）：不能永远挂着 —— resolve 一个空 url，让调用方按"不可用"处理
      // （`envForServer()` 会返回 {} ⇒ 服务端回落 SSE 委托，行为不变、不阻塞启动）。
      resolveStart(state);
    });
  });
  return readyPromise;
}

/** 运行期状态（给 server spawn env 用；token 不出主进程） */
function getState() {
  return { url: state.url, token: state.token, mode: state.mode };
}

/**
 * 组装要注入给 server 子进程的 env（桥关闭时返回 `{}` ⇒ 服务端 `browserBridgeAvailable()` 为 false）。
 * ★ 与 `YZ_HOT_RELOAD` / `editionEnv` / `guardEnv` **同一注入位置同一手法**（main.cjs startServer）。
 * ★ token 只经 `spawn` 的 env 传给**我们自己的** server 子进程，不落盘、不进渲染层。
 */
function envForServer() {
  if (!state.url || !state.token) return {};
  return {
    YZ_BROWSER_BRIDGE_URL: state.url + BRIDGE_PATH,
    YZ_BROWSER_BRIDGE_TOKEN: state.token,
  };
}

/** 关闭（app will-quit 调用）；端口自动分配 ⇒ 无需处理残留占用 */
function close() {
  if (!server) return;
  try { server.close(); } catch { /* ignore */ }
  try { server.closeAllConnections?.(); } catch { /* ignore */ }
  server = null;
  readyPromise = null;   // 允许重新 start（测试/重启场景）
  state = { url: '', token: '', mode: 'off', startedAt: 0 };
}

/**
 * 接线（main.cjs 在 `runBrowserAction` 定义之后调用）。
 * @param runAction      (convId, tabId, action, args) => Promise<result> —— **唯一实现**（main.cjs 的 runBrowserAction）
 * @param allowedActions 能力面白名单（main.cjs 的 DESKTOP_BROWSER_ACTIONS，单一真相源）
 */
function attach(d) {
  deps = d;
  // 注意：**只 attach 不 start** —— 启动时机由 main.cjs 在 `app.whenReady()` 之后决定
  // （需 ensure `mainWindow` 等已就绪）。见 main.cjs 的 browserBridge.start() 调用点。
}

module.exports = {
  attach, start, close, getState, envForServer, bridgeMode,
  // 供守门测试断言"路径/header 名与 server 侧逐字一致"
  BRIDGE_PATH, TOKEN_HEADER, MAX_BODY_BYTES,
};