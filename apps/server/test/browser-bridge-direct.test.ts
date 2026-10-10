/**
 * 浏览器执行面「直连化」守门测试（2026-10-10）。
 *
 * 背景（实测缺口，见 docs/浏览器执行面直连化-方案.md）：
 *   浏览器工具此前必须**绕道渲染层**（server emit `tool:execute` → 前端 dispatchToolCall → IPC → main）——
 *   而 server 是独立进程，拿不到 BrowserView 句柄。绕道代价（源码实证）：
 *     · `llm-task-manager.ts:3896` subscribers=0 → 等 15s；失败再等 8s ⇒ 单次最坏卡 **23s**；
 *     · 无订阅者 → `unattendedToolResult()` —— 浏览器工具**根本不执行**。
 *   直连化 = 主进程开 loopback 端点 + server 直连（不经 UI 层），结构上去掉这条依赖。
 *
 * 本测试钉的是**最容易出错、且错了会静默失效**的五处（每条都对应方案 §10 的风险）：
 *   ① `browserView:action` handler **不再自带 switch**（防两处实现漂移）
 *   ② 桥暴露的能力面 ⊆ `DESKTOP_BROWSER_ACTIONS` 白名单（防"能力面过宽"）
 *   ③ 桥与 server 的**路径名 / header 名逐字一致**（不一致 = 静默 404，最难查）
 *   ④ 执行面判定**只在服务端一处**（前端不得自己探端点 —— 会造第二份判据 + 泄露 token）
 *   ⑤ 前端在 bridge 档下**不本地执行**（防双执行：同一次调用打两遍页面）
 *   + 端点安全：只绑 loopback、端口 0、恒定时间比对、统一 404、body 上限
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

// 用 createRequire 加载主进程的 .cjs（CommonJS），在 ESM 测试里真跑它的纯函数
const require = createRequire(import.meta.url);

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const MAIN = read('apps/desktop/main.cjs');
const BRIDGE = read('apps/desktop/browser-bridge.cjs');
const SRV_BRIDGE = read('apps/server/src/browser-bridge.ts');
const LTM = read('apps/server/src/llm-task-manager.ts');
const CHAT = read('packages/ui/src/stores/chat.ts');

/** 去掉注释（防"注释满足断言"那类假绿 —— 本项目反复栽过的坑） */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

describe('① ★★★ action 只能有一处实现（防两处 switch 漂移）', () => {
  it('必须有 runBrowserAction（唯一实现）', () => {
    expect(stripComments(MAIN), '★ 未抽出唯一实现 → 桥必然复制一份 switch').toMatch(/async function runBrowserAction\(/);
  });

  it('browserView:action handler 内**不再自带 switch**', () => {
    // ★ 用 lastIndexOf：runBrowserAction 的 JSDoc 里也提到了 `ipcMain.handle('browserView:action')`，
    //   indexOf 会命中注释里那处（假锚点）。真正的 handler 在文件尾部。
    const i = MAIN.lastIndexOf("ipcMain.handle('browserView:action'");
    expect(i, '★ 锚点缺失：browserView:action handler').toBeGreaterThan(-1);
    const seg = MAIN.slice(i);
    // handler 到下一个顶层 section 分隔（`\n// ===`）之间的片段 —— 不应含任何 switch
    const end = seg.indexOf('\n// ===');
    expect(end, '★ handler 之后找不到 section 分隔（锚点不可靠）').toBeGreaterThan(0);
    const body = stripComments(seg.slice(0, end));
    expect(body, '★ handler 内又出现了 switch → 两处实现会漂移').not.toMatch(/switch\s*\(action\)/);
    expect(body, '★ handler 必须委托给 runBrowserAction').toMatch(/runBrowserAction\(/);
  });

  it('★★★ `browserView:action` 这条链路只允许一个 switch（在 runBrowserAction 里）', () => {
    const m = stripComments(MAIN);
    // ★ 注意：文件里还有一个**已废弃**的 `browser:call`（main.cjs 顶部标注 `[deprecated]`）
    //   自带 switch，与本方案无关（不属 browserView:action 链路）。故把范围限定在
    //   runBrowserAction 的函数体（到下一个顶层 `\n}` 为止），只数这里的 switch。
    const start = m.indexOf('async function runBrowserAction(');
    expect(start, '★ 锚点缺失：runBrowserAction').toBeGreaterThan(-1);
    const end = m.indexOf('\n}\n', start);
    expect(end, '★ 锚点不可靠：runBrowserAction 函数体结尾').toBeGreaterThan(start);
    const body = m.slice(start, end);
    const n = (body.match(/switch\s*\(action\)/g) || []).length;
    expect(n, `★ runBrowserAction 里出现 ${n} 处 switch(action)（应为 1：唯一实现）`).toBe(1);
  });

  it('桥必须调用注入的 runAction（而不是自带 action 分发）', () => {
    expect(stripComments(BRIDGE), '★ 桥未复用唯一实现').toMatch(/deps\.runAction\(/);
    expect(stripComments(BRIDGE), '★ 桥自带 switch = 第二处实现').not.toMatch(/switch\s*\(action\)/);
  });

  it('main.cjs 必须把唯一实现与白名单注入桥', () => {
    expect(stripComments(MAIN), '★ 未把 runBrowserAction 注入桥').toMatch(/browserBridge\.attach\(/);
    expect(stripComments(MAIN), '★ 未把能力清单注入桥 → 白名单会漂移').toMatch(/allowedActions:\s*DESKTOP_BROWSER_ACTIONS/);
  });
});

describe('② ★★★ 桥的能力面必须是白名单子集（防"端点成为通用 IPC 隧道"）', () => {
  it('桥必须校验 action 属于 allowedActions', () => {
    expect(stripComments(BRIDGE), '★ 未校验 action → 端点可被当通用 IPC 用（安全边界③）')
      .toMatch(/deps\.allowedActions\.includes\(action\)/);
  });

  it('白名单来源必须是 DESKTOP_BROWSER_ACTIONS（单一真相源）', () => {
    // DESKTOP_BROWSER_ACTIONS 在 main.cjs 里，是 action 能力清单的唯一定义
    expect(stripComments(MAIN)).toMatch(/const DESKTOP_BROWSER_ACTIONS = \[/);
    expect(stripComments(MAIN)).toMatch(/allowedActions:\s*DESKTOP_BROWSER_ACTIONS/);
  });

  it('★ 桥暴露的 action 集合 ⊆ DESKTOP_BROWSER_ACTIONS', () => {
    const i = MAIN.indexOf('const DESKTOP_BROWSER_ACTIONS = [');
    const declared = (MAIN.slice(i, MAIN.indexOf('];', i)).match(/'([a-z_]+)'/g) || [])
      .map((s) => s.replace(/'/g, ''));
    expect(declared.length, '★ 清单解析失败').toBeGreaterThan(30);
    // 桥侧不应出现任何硬编码的 action 名（它只用注入的 allowedActions）
    const hardcodedInBridge = (stripComments(BRIDGE).match(/'(get_page_info|navigate|click|type|screenshot)'/g) || []);
    expect(hardcodedInBridge, `★ 桥里硬编码了 action 名（应与白名单同源）：${hardcodedInBridge.join(', ')}`).toEqual([]);
  });
});

describe('③ ★★★ 桥与 server 的路径/header 名必须逐字一致（不一致 = 静默 404）', () => {
  it('路径名两边一致', () => {
    // 桥（cjs）与 server（ts）都必须引用同一个字面量
    expect(BRIDGE, '★ 桥缺 BRIDGE_PATH').toMatch(/const BRIDGE_PATH = '\/v1\/browser\/action'/);
    expect(SRV_BRIDGE, '★ server 侧路径与桥不一致').toMatch(/export const BRIDGE_PATH = '\/v1\/browser\/action'/);
  });

  it('token header 名两边一致', () => {
    expect(BRIDGE, '★ 桥缺 TOKEN_HEADER').toMatch(/const TOKEN_HEADER = 'x-yz-bridge-token'/);
    expect(SRV_BRIDGE, '★ server 侧 header 与桥不一致').toMatch(/export const TOKEN_HEADER = 'x-yz-bridge-token'/);
  });

  it('server 调用时用的是同一个 header 常量（不是手写字面量）', () => {
    expect(stripComments(SRV_BRIDGE), '★ 未用常量拼 header → 手写必然漂移')
      .toMatch(/\[TOKEN_HEADER\]:\s*token/);
  });
});

describe('④ ★★★ 执行面判定只在服务端一处（前端不得自己探端点）', () => {
  it('server 有唯一判定函数', () => {
    expect(stripComments(SRV_BRIDGE), '★ 缺 decideBrowserExecution（唯一判定口径）')
      .toMatch(/export function decideBrowserExecution\(/);
  });

  it('llm-task-manager 用该函数、且不自己写档位判定', () => {
    const ltm = stripComments(LTM);
    expect(ltm, '★ 未调用唯一判定函数').toMatch(/decideBrowserExecution\(/);
    // 不许在 llm-task-manager 里再写一份档位字符串判断（'shadow'/'strict' 只能出现在 browser-bridge.ts）
    expect(ltm, '★ llm-task-manager 里又出现了档位字面量 → 第二份判据')
      .not.toMatch(/===\s*'shadow'/);
  });

  it('★★★ 前端**不得**自己探测桥端点（防第二份判据 + 防 token 外泄）', () => {
    const chat = stripComments(CHAT);
    // 渲染层不许出现桥的 env 变量名 / header 名 / 端点路径
    expect(chat, '★ 前端出现了桥 env 变量 → token 会泄露到渲染层').not.toMatch(/YZ_BROWSER_BRIDGE/);
    expect(chat, '★ 前端出现了桥 header → 泄露 token').not.toMatch(/x-yz-bridge-token/);
    expect(chat, '★ 前端出现了桥端点路径 → 前端在自探端点').not.toMatch(/\/v1\/browser\/action/);
  });

  it('执行面判据由服务端经 task:created 下发，且**不含 URL/token**', () => {
    // server 侧下发
    expect(stripComments(LTM), '★ server 未下发 browserExecution').toMatch(/browserExecution:/);
    // 下发内容里不得带 url/token（只是枚举标记）
    const i = LTM.indexOf('browserExecution:');
    const line = LTM.slice(i, LTM.indexOf('});', i));
    expect(line, '★ 下发的标记里带了 url/token → 安全边界被破坏').not.toMatch(/url|token|bridgeUrl/i);
  });
});

describe('⑤ ★★★ 前端在 bridge 档下不本地执行（防双执行）', () => {
  it('前端消费 browserExecution 并跳过本地执行', () => {
    const chat = stripComments(CHAT);
    expect(chat, '★ 未接 task:created 的执行面标记').toMatch(/case 'task:created'/);
    expect(chat, '★ 未落地执行面状态').toMatch(/browserExecutionByConv/);
    expect(chat, '★ tool:execute 里缺少"跳过本地执行"的守卫 → 会双执行')
      .toMatch(/isBrowserExecutionByBridge\(convId\)/);
  });

  it('★ 守卫必须在 dispatchToolCall **之前**（否则已经执行了）', () => {
    const i = CHAT.indexOf("case 'tool:execute'");
    const seg = CHAT.slice(i, i + 3000);
    const guard = seg.indexOf('isBrowserExecutionByBridge(convId)');
    const dispatch = seg.indexOf('await dispatchToolCall(toolName, args, ctx)');
    expect(guard, '★ 守卫缺失').toBeGreaterThan(-1);
    expect(dispatch, '★ dispatchToolCall 锚点缺失').toBeGreaterThan(-1);
    expect(guard, '★ 守卫在 dispatchToolCall 之后 = 拦不住双执行').toBeLessThan(dispatch);
  });

  it('执行面状态在任务三态收尾都要清理（防残留影响下一任务）', () => {
    const chat = stripComments(CHAT);
    for (const t of ['task:completed', 'task:aborted', 'task:error']) {
      const i = chat.indexOf(`case '${t}'`);
      expect(i, `★ 锚点缺失：${t}`).toBeGreaterThan(-1);
      const line = chat.slice(i, chat.indexOf('\n', i));
      expect(line, `★ ${t} 未清理执行面标记 → 下一任务可能继承 bridge 档而不执行工具`).toMatch(/clearBrowserExecution\(/);
    }
  });
});

describe('⑥ ★★ 端点安全边界（可被真跑验证的静态面）', () => {
  it('★ 只绑 127.0.0.1（绝不 0.0.0.0）', () => {
    expect(stripComments(BRIDGE), '★ 未绑 loopback → 外部网络可达').toMatch(/listen\(\s*0\s*,\s*'127\.0\.0\.1'/);
    expect(stripComments(BRIDGE), '★ 出现 0.0.0.0（安全边界禁止）').not.toMatch(/0\.0\.0\.0/);
  });

  it('★ 端口 0 自动分配（与 CDP 同手法，无抢占/无残留占用）', () => {
    expect(stripComments(BRIDGE), '★ 未用端口 0').toMatch(/server\.listen\(0,/);
  });

  it('★ token 恒定时间比对（timingSafeEqual，非 ===）', () => {
    const b = stripComments(BRIDGE);
    expect(b, '★ 未用 timingSafeEqual → 可被时序攻击').toMatch(/crypto\.timingSafeEqual\(/);
  });

  it('★ 无/错 token 统一 404（不区分原因，不泄露端点存在）', () => {
    const b = stripComments(BRIDGE);
    expect(b, '★ 缺统一拒绝出口 deny()').toMatch(/const deny = \(\) =>/);
    // 鉴权失败处必须走 deny()，而不是返回带信息的 401/403
    const tokenBlock = b.slice(b.indexOf('timingSafeEqual'), b.indexOf('application/json'));
    expect(tokenBlock, '★ 鉴权失败未走统一 deny()').toMatch(/deny\(\)/);
    expect(b, '★ 出现了 401/403（会泄露"端点存在"）').not.toMatch(/writeHead\((401|403)/);
  });

  it('★ body 大小上限（防本地 DoS）', () => {
    expect(stripComments(BRIDGE), '★ 无 body 上限').toMatch(/MAX_BODY_BYTES/);
    expect(stripComments(BRIDGE), '★ 未在超限时拒绝').toMatch(/413/);
  });

  it('★ 只接受 application/json（缩小解析面）', () => {
    expect(stripComments(BRIDGE), '★ 未限制 content-type').toMatch(/application\/json/);
  });

  it('★ 桥调用必须带 convId（否则退回静默打到全局活动页）', () => {
    const b = stripComments(BRIDGE);
    // ★★ 断言**判定条件本身**，而不是"报错文案存在" —— 变异验证实测：只断言 `缺少 convId`
    //    时，把 `if (!convId)` 改成 `if (false)` 仍能通过（文案照样在）→ 漏抓。
    //    这与项目最贵的判据"断言存在≠断言生效"同族。
    expect(b, '★ 未强制 convId（条件被短路）').toMatch(/if\s*\(\s*!convId\s*\)\s*\{/);
    expect(b, '★ 未返回错误').toMatch(/缺少 convId/);
  });

  it('★ 日志不得打印 token（用户会贴日志排障）', () => {
    const b = stripComments(BRIDGE);
    // 找所有 console/日志调用，确认没有把 state.token 拼进去
    const logLines = b.match(/(deps\.log|deps\.warn)\([^)]*\)/g) || [];
    const leaked = logLines.filter((l) => /state\.token/.test(l));
    expect(leaked, `★ 日志泄露 token：${leaked.join(' | ')}`).toEqual([]);
  });

  it('★ 档位非法值一律回落 off（写错不能变成"意外开启直连"）', () => {
    expect(stripComments(BRIDGE), '★ 缺档位校验').toMatch(/\['off', 'shadow', 'on', 'strict'\]\.includes/);
    expect(stripComments(SRV_BRIDGE), '★ server 侧缺档位校验').toMatch(/\['off', 'shadow', 'on', 'strict'\]\.includes/);
  });

  it('★★ 默认档位必须是 on（2026-10-10 起：直连根治"前端一卡任务就磨"）', () => {
    // ★ 口径反转：此前默认 off（打包版先不发桥）→ 用户实测「浏览器任务执行不下去」，
    //   根因就是 off 下全走 SSE 委托前端。现提为 on，且失败仍会降级回 SSE（见 llm-task-manager）。
    expect(stripComments(BRIDGE), '★ 主进程默认档不是 on').toMatch(/YZ_BROWSER_BRIDGE \|\| DEFAULT_BRIDGE_MODE|DEFAULT_BRIDGE_MODE = 'on'/);
    expect(stripComments(SRV_BRIDGE), '★ server 默认档不是 on').toMatch(/YZ_BROWSER_BRIDGE \|\| DEFAULT_BRIDGE_MODE|DEFAULT_BRIDGE_MODE: BridgeMode = 'on'/);
    // 两侧默认值必须同值（一侧 on 一侧 off = 服务端想用桥但端点没起 → 静默空转）
    expect(stripComments(BRIDGE)).toMatch(/DEFAULT_BRIDGE_MODE = 'on'/);
    expect(stripComments(SRV_BRIDGE)).toMatch(/DEFAULT_BRIDGE_MODE: BridgeMode = 'on'/);
  });
});

describe('⑦ ★★ 会话锚定下沉主进程（P0-2）', () => {
  it('主进程持有 convAnchors 与解析/失效函数', () => {
    const m = stripComments(MAIN);
    expect(m, '★ 缺 convAnchors').toMatch(/const convAnchors = new Map\(\)/);
    expect(m, '★ 缺 setConvAnchor').toMatch(/function setConvAnchor\(/);
    expect(m, '★ 缺 resolveTabIdForConv').toMatch(/function resolveTabIdForConv\(/);
    expect(m, '★ 缺 clearConvAnchorsForTab').toMatch(/function clearConvAnchorsForTab\(/);
  });

  it('★★★ 未锚定时对非"建页类" action 必须明确报错（绝不静默用全局页）', () => {
    // ★★ 判定本体已收敛到 `browser-target.cjs`（见 ⑫/⑬；行为由 ⑬ **真跑**覆盖）。
    //   这里只钉"建页白名单 + 明确报错文案"确在该模块，以及 main.cjs 确实消费了判定结果
    //   （ok:false → return error）—— 否则"判定正确但调用方忽略"仍会静默放行。
    const TARGET = read('apps/desktop/browser-target.cjs');
    expect(TARGET, '★ "建页类 action 放行"白名单缺失').toMatch(/const ANCHOR_ESTABLISHING_ACTIONS = new Set\(/);
    expect(TARGET, '★ 未锚定报错文案缺失').toMatch(/尚未绑定浏览器页面/);
    const m = stripComments(MAIN);
    expect(m, '★ main.cjs 未消费判定结果（ok:false 被忽略 → 静默用全局页）')
      .toMatch(/if\s*\(!r\.ok\)\s*return\s*\{\s*error:\s*r\.error\s*\}/);
  });

  it('★★ tab 关闭必须清锚（唯一出口 broadcastTabClosed）', () => {
    const m = stripComments(MAIN);
    const i = m.indexOf('function broadcastTabClosed(');
    expect(i, '★ 锚点缺失：broadcastTabClosed').toBeGreaterThan(-1);
    const body = m.slice(i, m.indexOf('\n}', i));
    expect(body, '★ 关闭时未清锚 → 会指向幽灵 tab').toMatch(/clearConvAnchorsForTab\(/);
  });

  it('★★ IPC 路径传 convId=null（不与渲染层"两个锚"打架）', () => {
    expect(stripComments(MAIN), '★ IPC 路径带了 convId → 两处锚定会互相顶替')
      .toMatch(/ipcMain\.handle\('browserView:action',\s*async\s*\(_e,\s*tabId,\s*action,\s*args\)\s*=>\s*\n?\s*runBrowserAction\(null,/);
  });
});

describe('⑧ ★★ 桥必须在 startServer 之前启动（否则 env 注入为空 = 静默不生效）', () => {
  it('whenReady 里 bridge.start() 早于 startServer()', () => {
    const m = stripComments(MAIN);
    const i = m.indexOf('browserBridge.start()');
    const j = m.indexOf('startServer();', m.indexOf('app.whenReady'));
    expect(i, '★ 缺 browserBridge.start()').toBeGreaterThan(-1);
    expect(j, '★ 锚点缺失：startServer()').toBeGreaterThan(-1);
    expect(i, '★ 桥在 startServer 之后启动 → envForServer() 为空 → 直连静默失效').toBeLessThan(j);
  });

  it('三处 spawn（dev tsx / dev npx / 生产）都注入 bridgeEnv', () => {
    const m = stripComments(MAIN);
    // 定义 1 处（const bridgeEnv = browserBridge.envForServer()）+ 展开 3 处（...bridgeEnv）
    expect(m, '★ 未从桥取 env').toMatch(/const bridgeEnv = browserBridge\.envForServer\(\)/);
    const n = (m.match(/\.\.\.bridgeEnv/g) || []).length;
    expect(n, `★ ...bridgeEnv 出现 ${n} 处（应为 3：dev tsx / dev npx / 生产 三条 spawn 路径）→ 有路径拿不到桥`).toBe(3);
  });

  it('退出时关闭桥', () => {
    const m = stripComments(MAIN);
    const i = m.indexOf("app.on('before-quit'");
    const seg = m.slice(i, i + 600);
    expect(seg, '★ 退出未关桥').toMatch(/browserBridge\.close\(\)/);
  });
});

describe('⑨ ★★★ 三份 electron-builder yml 必须登记新 .cjs 模块', () => {
  for (const f of ['electron-builder.full.yml', 'electron-builder.lite.yml', 'electron-builder.mac.yml']) {
    for (const mod of ['browser-bridge.cjs', 'browser-target.cjs']) {
      it(`${f} 登记了 ${mod}`, () => {
        const yml = read(`apps/desktop/${f}`);
        expect(yml, `★ ${f} 漏登记 → 打包版启动即崩（Cannot find module './${mod}'）`)
          .toMatch(new RegExp(`^\\s*-\\s*${mod.replace('.', '\\.')}\\s*$`, 'm'));
      });
    }
  }
});

describe('⑪ ★★★ 可见性契约：桥档下"看不见/收不干净"两个静默退化必须有对策', () => {
  const PRELOAD = read('apps/desktop/preload.cjs');
  const USECHAT = read('packages/ui/src/composables/chat/useChat.ts');
  const PANEL = read('packages/ui/src/components/BrowserPanel.vue');

  it('★★★ 预览面板的打开不能只依赖被跳过的 dispatchToolCall', () => {
    // 桥档下 tool:execute 被跳过 ⇒ dispatchToolCall 里的 `openTab` 永不执行。
    // 对策：browserSteps 首次出现时（SSE tool:start/tool:result 驱动）也要把面板打开。
    const i = USECHAT.indexOf("watch(() => store.browserSteps.length");
    expect(i, '★ 锚点缺失：browserSteps watch').toBeGreaterThan(-1);
    const seg = USECHAT.slice(i, i + 2500);
    expect(seg, '★ browserSteps watch 里没有 openTab → 桥档下面板不会被打开').toMatch(/store\.openTab\(/);
  });

  it('★★★ 主进程必须有按会话关闭 agent 页面的入口（渲染层记账在桥档恒为空）', () => {
    const m = stripComments(MAIN);
    expect(m, '★ 缺 closeConvTabs IPC → 桥档下 agent 页面永不自动关闭')
      .toMatch(/ipcMain\.handle\('browserView:closeConvTabs'/);
    // 必须按会话记账过滤（不依赖 agentOpened）
    expect(m, '★ 未按会话过滤').toMatch(/agentTouchedTabs/);
  });

  it('★★★ preload 暴露 closeConvTabs', () => {
    expect(PRELOAD, '★ 未暴露 → 渲染层调不到').toMatch(/closeConvTabs:\s*\(convId\)\s*=>\s*ipcRenderer\.invoke\('browserView:closeConvTabs'/);
  });

  it('★★★ 任务收尾优先走按会话关闭（桥档）+ 保留旧入口兜底', () => {
    const u = stripComments(USECHAT);
    // ★★ 断言**判定条件本身**（`if (convId && closeApi?.closeConvTabs)`），
    //    不是"closeConvTabs(convId) 这个符号存在" —— 变异实测：只断言符号时把条件改成
    //    `if (false)` 仍通过（调用还在死分支里）→ 漏抓。同族判据"断言存在≠断言生效"。
    expect(u, '★ 收尾未走 closeConvTabs 判定 → 桥档下页面堆积')
      .toMatch(/if\s*\(\s*convId\s*&&\s*closeApi\?\.closeConvTabs\s*\)/);
    expect(u, '★ 保留旧入口兜底缺失（非桥档/旧主进程会失去该能力）').toMatch(/closeApi\?\.closeAgentTabs/);
  });

  it('★★ 收尾"按会话关闭"必须在"按 agentOpened 关闭"之前判定', () => {
    const u = stripComments(USECHAT);
    // 用**判定条件**定位（不是调用点），保证顺序断言反映真实控制流
    const iConv = u.search(/if\s*\(\s*convId\s*&&\s*closeApi\?\.closeConvTabs\s*\)/);
    const iAgent = u.search(/if\s*\(\s*leftover\.length\s*>\s*0\s*&&\s*closeApi\?\.closeAgentTabs\s*\)/);
    expect(iConv, '★ 缺按会话关闭判定').toBeGreaterThan(-1);
    expect(iAgent, '★ 缺按 agentOpened 关闭判定').toBeGreaterThan(-1);
    expect(iConv, '★ 顺序反了 → 桥档下先走空集合分支直接清账，后续分支不再执行').toBeLessThan(iAgent);
  });

  it('★★ agent 页面归属只记 preview 空间（不碰 /browser 用户空间）', () => {
    const m = stripComments(MAIN);
    // ★★ 断言**带守卫的调用点**（`if (isPreviewScope(tid)) agentTouchedTabs.set`），
    //    不是"isPreviewScope 这个名字存在" —— 变异实测：把守卫去掉后名字仍在（定义处）→ 漏抓。
    expect(m, '★ 缺 preview 空间守卫 → 会误关用户的 /browser 独立页')
      .toMatch(/if\s*\(\s*isPreviewScope\(tid\)\s*\)\s*agentTouchedTabs\.set\(/);
  });

  it('★★★ 自建 tab 统一走 tabCreated 通道（与 new_tab 同口径），且渲染层兼容裸 preview', () => {
    // ★★★ 2026-10-10 二次根因修复：navigate 自建分支**必须用 `browserView:tabCreated`**。
    //   实测：走 `browser:wv:forceOpen` 时 8s 必超时（日志 `wc=NULL(8s 超时)`），而 `new_tab`
    //   用的 `tabCreated` 是现网验证可用的黄金路径 ⇒ 两条通道语义重叠 = 平行实现漂移。
    //   ⇒ 断言"自建分支必须广播 tabCreated"，防回退。
    const m = stripComments(MAIN);
    const iSelf = m.indexOf("action === 'navigate' && args.url");
    expect(iSelf, '★ 自建分支锚点缺失').toBeGreaterThan(-1);
    const selfSeg = m.slice(iSelf, iSelf + 3000);
    expect(selfSeg, '★ 自建分支未广播 tabCreated → 渲染层不建壳，waitForGuest 必超时')
      .toMatch(/send\('browserView:tabCreated'/);
    // scope 必须是**裸 'preview'**（渲染层 browserScope 是 preview:<convId>，靠放宽匹配命中）
    expect(selfSeg, '★ 自建分支 scope 不是裸 preview → 与 new_tab 口径不一致')
      .toMatch(/const scope = 'preview'/);
    // 渲染层 onTabCreated 必须放宽 scope 匹配（否则裸 preview 广播被严格相等静默漏掉）
    expect(PANEL, '★ onTabCreated scope 匹配过严 → 主进程裸 preview 广播被漏掉，渲染层不建壳')
      .toMatch(/belong === 'preview' && browserScope\.startsWith\('preview'\)/);
  });

  it('★★★ 自建 tab 的 id 必须两端对齐 + wc=null 走显式错误', () => {
    // ① 渲染层：forceOpen/onTabCreated 都必须用主进程给的 tabId 建壳（不能自己另起 id）
    expect(PANEL, '★ onTabCreated 未用主进程给的 tid 建壳')
      .toMatch(/id: tid, url: url \|\| ''/);
    // ② 主进程：拿不到 wc 时必须**显式报错**返回，不得落到 wc.loadURL 抛原生 TypeError
    const m = stripComments(MAIN);
    expect(m, '★ wc=null 未显式拦下 → 会抛 loadURL of null（模型只能瞎猜"前端不可达"）')
      .toMatch(/已请求预览面板打开该页，但 8s 内未建出页面/);
    // ③ 自建等待必须有可诊断日志（此前该路径零日志，排障只能读库反推）
    expect(m, '★ 自建等待无日志（静默失效家族）').toMatch(/自建后等待 guest/);
  });
});

describe('⑫ ★★★ 多页语义：显式 tabId / new_tab 不得改写"当前操作页"（判定本体在纯函数模块）', () => {
  const TARGET = read('apps/desktop/browser-target.cjs');

  it('★★★ 判定本体必须在 browser-target.cjs（可真跑），main.cjs 只引用', () => {
    expect(TARGET, '★ 缺 resolveTarget').toMatch(/function resolveTarget\(/);
    expect(TARGET, '★ 缺 decideAnchorUpdate').toMatch(/function decideAnchorUpdate\(/);
    expect(TARGET, '★ 缺 NO_ANCHOR_REWRITE_ACTIONS').toMatch(/const NO_ANCHOR_REWRITE_ACTIONS = new Set\(/);
    // ★ main.cjs 不得再自带一份（同一语义两处实现 = 必然漂移）
    expect(stripComments(MAIN), '★ main.cjs 又自带了一份 NO_ANCHOR_REWRITE_ACTIONS（两处实现）')
      .not.toMatch(/NO_ANCHOR_REWRITE_ACTIONS = new Set\(/);
    expect(stripComments(MAIN), '★ main.cjs 未引用纯函数模块').toMatch(/require\('\.\/browser-target\.cjs'\)/);
  });

  it('★★★ 读类 + navigate + new_tab 必须在"不改锚"集合内', () => {
    for (const a of ['get_page_content', 'get_page_info', 'get_dom', 'get_text', 'get_visible_text', 'screenshot', 'navigate', 'new_tab']) {
      const i = TARGET.indexOf('const NO_ANCHOR_REWRITE_ACTIONS = new Set(');
      const body = TARGET.slice(i, TARGET.indexOf(']);', i));
      expect(body, `★ ${a} 未列入"不改锚" → 定向动作会改写操作页`).toContain(`'${a}'`);
    }
  });

  it('★★★ main.cjs 的两处调用必须分别用唯一实现', () => {
    const m = stripComments(MAIN);
    expect(m, '★ 未用 resolveBrowserTarget（判定被内联复制）').toMatch(/resolveBrowserTarget\(convId, tabId, action,/);
    expect(m, '★ 未用 decideAnchorUpdate（记账判定被内联复制）').toMatch(/decideAnchorUpdate\(action,/);
    // ok:false 必须真的 return error（不是被忽略）
    expect(m, '★ resolveTarget 的 ok:false 未被处理 → 越权/未锚定仍会放行').toMatch(/if\s*\(!r\.ok\)\s*return\s*\{\s*error:\s*r\.error\s*\}/);
  });

  it('★★★ 会话首次导航自建的 tab 必须登记 + 只经建 tab 唯一实现', () => {
    // ★ 根因（自检抓到的真缺陷）：渲染层建 guest 走的是 `browserView:createTab`
    //   （**不是** switch(action) 的 `case 'new_tab'`）⇒ 该 tab 不经过任何登记点 ⇒
    //   agent 首导航后第二次带 tabId 的读/写**必然被越权闸门误拒**（报"不属于本会话"），
    //   表现为"打开网页后就读不了"；且跨会话可猜中 tabId。
    const m = stripComments(MAIN);
    const iNav = m.indexOf("!wc && action === 'navigate' && args.url");
    expect(iNav, '★ 锚点缺失：自建 guest 分支').toBeGreaterThan(-1);
    const seg = m.slice(iNav, iNav + 1500);
    expect(seg, '★ 自建 tab 未登记本会话（后续带 tabId 会被误拒）').toMatch(/markConvTabTouched\(convId,\s*tabId\)/);
    expect(seg, '★ 自建 tab 未经过建 tab 唯一实现').toMatch(/tabId = createBrowserTab\(/);
    // 建 tab 只能有一处实现（IPC handler 必须委托，不得自带一份 set/ensure 逻辑）
    expect(m, '★ 缺 createBrowserTab').toMatch(/function createBrowserTab\(scope\)/);
    expect((m.match(/function createBrowserTab\(/g) || []).length, '★ createBrowserTab 有多处实现').toBe(1);
    const iIpc = m.indexOf("ipcMain.handle('browserView:createTab'");
    const line = m.slice(iIpc, m.indexOf('\n', iIpc));
    expect(line, '★ IPC handler 未委托给唯一实现').toMatch(/createBrowserTab\(scope\)/);
  });

  it('★★ main.cjs 从 browser-target.cjs 引入的符号必须**都被使用**（防死导入）', () => {
    // ★ 这条来自一次真实自检：重构后 `ANCHOR_ESTABLISHING_ACTIONS` /
    //   `NO_ANCHOR_REWRITE_ACTIONS` 只剩 import 行（各自判断已搬进模块）→ **死导入**
    //   （读代码的人会以为 main.cjs 还在用它们）。删掉后留一条守卫防回归。
    const m = stripComments(MAIN);
    const end = m.indexOf("} = require('./browser-target.cjs');");
    expect(end, '★ 锚点缺失：browser-target.cjs 解构导入').toBeGreaterThan(-1);
    const start = m.lastIndexOf('const {', end);
    const names = m.slice(start, end)
      .replace(/const\s*\{/, '')
      .split(',')
      .map((s) => s.trim().split(':').map((x) => x.trim()))
      .map(([imported, local]) => local || imported)
      .filter(Boolean);
    expect(names.length, '★ 未解析出解构名').toBeGreaterThan(0);
    for (const n of names) {
      const count = (m.match(new RegExp('\\b' + n + '\\b', 'g')) || []).length;
      expect(count, `★ ${n} 是死导入（只出现 ${count} 次 = 仅 import 行；判断已搬进模块就别再引入）`).toBeGreaterThan(1);
    }
  });
});

describe('⑬ ★★★ 多页语义【真跑】：resolveTarget / decideAnchorUpdate 行为', () => {
  // ★ 真跑（不是静态断言）：判定错了的表现是"打到错的页且不报错"，
  //   静态断言抓不住分支顺序/条件短路 —— 必须真跑行为。
  const bt = require(resolve(REPO, 'apps/desktop/browser-target.cjs'));

  /** 造一个"本会话只有 tab-1（锚）与 tab-9（new_tab 开过）"的环境 */
  const env = { anchored: 'tab-1', isMine: (t: string) => t === 'tab-1' || t === 'tab-9' };

  it('★★★ tabIdCandidates：兼容 `tab-N` 与纯数字（防模型按 schema 传 number 被误拒）', () => {
    expect(bt.tabIdCandidates('tab-9')).toEqual(['tab-9']);
    expect(bt.tabIdCandidates(9), '★ 纯数字未归一成 tab-N').toEqual(['9', 'tab-9']);
    expect(bt.tabIdCandidates('  tab-9  '), '★ 未 trim').toEqual(['tab-9']);
    expect(bt.tabIdCandidates(null)).toEqual([]);
    expect(bt.tabIdCandidates('')).toEqual([]);
  });

  it('★★★ 显式 tabId 优先于锚（多页定向读不被带偏）', () => {
    const r = bt.resolveTarget('c1', 'tab-9', 'get_page_content', env);
    expect(r.ok).toBe(true);
    expect(r.tabId, '★ 定向读被锚覆盖 → 读到错页').toBe('tab-9');
  });

  it('★★★ 显式 tabId 兼容纯数字（模型按 schema 传 number 不被误拒）', () => {
    const r = bt.resolveTarget('c1', 9, 'get_page_content', env);
    expect(r.ok, '★ 纯数字被误拒（工具 schema 写的是 number）').toBe(true);
    expect(r.tabId).toBe('tab-9');
  });

  it('★★★ 跨会话 tabId 被拒绝（越权闸门）', () => {
    const r = bt.resolveTarget('c1', 'tab-999', 'get_page_content', env);
    expect(r.ok, '★ 别的会话/未登记的 tab 被放行 → 跨会话越权').toBe(false);
    expect(r.error).toMatch(/不属于本会话/);
  });

  it('★★ 无显式 tabId → 用锚', () => {
    const r = bt.resolveTarget('c1', null, 'click', env);
    expect(r.ok).toBe(true);
    expect(r.tabId).toBe('tab-1');
  });

  it('★★ 未锚定 + 建页类（navigate/new_tab/switch_tab）→ 放行（tabId=null 交下游自建）', () => {
    const noAnchor = { anchored: null, isMine: () => false };
    for (const a of ['navigate', 'new_tab', 'switch_tab']) {
      const r = bt.resolveTarget('c1', null, a, noAnchor);
      expect(r.ok, `★ ${a} 被挡 → agent 第一步走不动`).toBe(true);
    }
  });

  it('★★★ 未锚定 + 普通动作 → 明确报错（绝不静默用全局活动页）', () => {
    const noAnchor = { anchored: null, isMine: () => false };
    const r = bt.resolveTarget('c1', null, 'click', noAnchor);
    expect(r.ok, '★ 未锚定却放行 → 会打到别的会话的页上').toBe(false);
    expect(r.error).toMatch(/尚未绑定浏览器页面/);
  });

  it('★★ 渲染层路径（convId=null）原样透传（行为逐字不变）', () => {
    const r = bt.resolveTarget(null, 'tab-x', 'click', { anchored: 'tab-1', isMine: () => false });
    expect(r.ok, '★ 渲染层路径不应被越权闸门拦（它自己已锚定）').toBe(true);
    expect(r.tabId).toBe('tab-x');
  });

  it('★★★ new_tab → 只登记新页（touch），**不改锚**', () => {
    const u = bt.decideAnchorUpdate('new_tab', false, null, 'tab-9');
    expect(u.mode, '★ new_tab 改了锚 → 后续写操作打到新页').toBe('touch');
    expect(u.tabId).toBe('tab-9');
  });

  it('★★★ switch_tab → 改锚（否则"切换操作目标"毫无意义）', () => {
    const u = bt.decideAnchorUpdate('switch_tab', true, 'tab-9', 'tab-9');
    expect(u.mode).toBe('anchor');
    expect(u.tabId).toBe('tab-9');
  });

  it('★★★ 定向读（显式 tabId）→ 只登记不改锚', () => {
    const u = bt.decideAnchorUpdate('get_page_content', true, 'tab-9', null);
    expect(u.mode, '★ 定向读改了锚 → 后续写操作被带偏').toBe('touch');
  });

  it('★★★ 无显式 tabId 的写/交互 → 改锚到实际作用页', () => {
    for (const a of ['click', 'type', 'press', 'hover', 'scroll']) {
      const u = bt.decideAnchorUpdate(a, false, 'tab-1', null);
      expect(u.mode, `★ ${a} 未改锚 → 锚不跟随写操作`).toBe('anchor');
    }
    // navigate 不带显式 tabId 也应改锚（它确实改变了当前页）
    expect(bt.decideAnchorUpdate('navigate', false, 'tab-1', null).mode).toBe('anchor');
  });

  it('★★★ 多页典型序列【真跑】：new_tab 后写操作仍锚在原页，定向读能读新页', () => {
    // 模拟：会话锚在 tab-1；agent new_tab 开 tab-9；然后 click（无 tabId）；再定向读 tab-9
    let anchor = 'tab-1';
    const touched = new Set(['tab-1']);
    const isMine = (t: string) => touched.has(t);
    // ① new_tab
    const r1 = bt.resolveTarget('c1', null, 'new_tab', { anchored: anchor, isMine });
    expect(r1.ok).toBe(true);
    const u1 = bt.decideAnchorUpdate('new_tab', false, r1.tabId, 'tab-9');
    if (u1.mode === 'touch') touched.add(u1.tabId!);
    if (u1.mode === 'anchor') anchor = u1.tabId!;
    expect(anchor, '★ new_tab 后锚被搬走 → 后续 click 打到新页').toBe('tab-1');
    // ② click（无 tabId）→ 应作用在原锚 tab-1 上
    const r2 = bt.resolveTarget('c1', null, 'click', { anchored: anchor, isMine });
    expect(r2.tabId, '★ click 打到了新开的页').toBe('tab-1');
    // ③ 定向读 tab-9 → 允许（本会话 new_tab 开过）
    const r3 = bt.resolveTarget('c1', 'tab-9', 'get_page_content', { anchored: anchor, isMine });
    expect(r3.ok, '★ new_tab 开的页读不了（未登记 → 越权闸门误拒）').toBe(true);
    expect(r3.tabId).toBe('tab-9');
    // ④ 定向读后锚不变（仍然 tab-1）
    const u2 = bt.decideAnchorUpdate('get_page_content', true, r3.tabId, null);
    if (u2.mode === 'anchor') anchor = u2.tabId!;
    expect(anchor, '★ 定向读把锚带走了').toBe('tab-1');
  });
});

describe('⑩ ★★ server 侧三档分支（bridge → SSE → 离线）', () => {
  it('bridge 档必须先于 SSE 委托分支（否则直连永远走不到）', () => {
    const ltm = stripComments(LTM);
    const iBridge = ltm.indexOf('const exec = decideBrowserExecution(');
    const iSub = ltm.indexOf('waitForFrontendSubscriber(task, 15000)');
    expect(iBridge, '★ 缺 bridge 分支').toBeGreaterThan(-1);
    expect(iSub, '★ 锚点缺失：SSE 宽限分支').toBeGreaterThan(-1);
    expect(iBridge, '★ bridge 分支在 SSE 之后 → 直连死代码').toBeLessThan(iSub);
  });

  it('★ 桥失败分两类：传输失败才降级 SSE、strict 不降级、业务错误不降级', () => {
    const ltm = stripComments(LTM);
    expect(ltm, '★ 缺 strict 不降级').toMatch(/bridgeMode\(\) === 'strict'/);
    // ★★★ 2026-10-10 根因修复：`on` 档**不再无条件降级**。
    //   旧断言 `桥调用失败，降级回 SSE` 钉的是死降级行为（渲染层在 on 档下已不执行
    //   browser_* ⇒ SSE 必然无订阅者 ⇒ 8s 失败被拖成 23s 且文案误导）。
    //   新语义：只有**传输层**失败（端点不可达/超时/鉴权）才降级。
    expect(ltm, '★ 缺传输失败的降级判定（isBridgeTransportError）')
      .toMatch(/isBridgeTransportError\(e\)/);
    expect(ltm, '★ 传输失败仍应降级（打点文案）').toMatch(/桥传输失败，降级回 SSE 委托/);
    expect(ltm, '★ 业务错误不得触发降级').toMatch(/动作执行失败（非桥故障，不降级）/);
    // 业务错误分支必须**早于**降级落点（先 return，才不会被后面的 SSE 宽限吃掉）
    const iBiz = ltm.indexOf('动作执行失败（非桥故障，不降级）');
    const iDeg = ltm.indexOf('桥传输失败，降级回 SSE 委托');
    expect(iBiz, '★ 业务错误分支丢失').toBeGreaterThan(-1);
    expect(iDeg, '★ 降级分支丢失').toBeGreaterThan(-1);
    expect(iBiz, '★ 业务错误未在降级之前 return → 仍会被拖进 SSE 宽限').toBeLessThan(iDeg);
  });

  it('截图归档两路径共用同一后处理出口', () => {
    const ltm = stripComments(LTM);
    // bridge 分支内也调 archiveDelegatedScreenshot（与 SSE 分支同一个函数）
    const iBridge = ltm.indexOf('const exec = decideBrowserExecution(');
    const iNext = ltm.indexOf('waitForFrontendSubscriber(task, 15000)');
    const bridgeSeg = ltm.slice(iBridge, iNext);
    expect(bridgeSeg, '★ bridge 路径未走截图归档 → 截图登记不进 conversation_file')
      .toMatch(/archiveDelegatedScreenshot\(/);
  });
});
// ══════════════════════════════════════════════════════════════════════════
// ⑬ ★★★ 锚定建立 + webview tab 上限（2026-10-10 三次根因修复）
//
// 用户实报："pageAgent 一跑整个应用卡死"。
// 实证链条（main-2026-10-10.log 23:44~23:46，3 分钟 36 次 navigate）：
//   ① navigate 未锚定时 resolveTarget 返回 tabId=null → 下游用 activeTabId 兜底拿到 guest
//      ⇒ navigate"看起来成功"但主进程不知道操作的是哪个 tab
//   ② decideAnchorUpdate(action, false, null, null) → 'none' ⇒ **锚永不建立**
//   ③ 后续 get_page_content / screenshot / get_dom 全报"该会话尚未绑定浏览器页面"
//   ④ 模型以为导航没生效 → 疯狂换 URL 重试 → 每次重试又走"自建新 tab"
//   ⑤ webview 引擎的 createBrowserTab **无上限**（MAX_TABS/evict 只遍历 browserViews）
//      ⇒ tab 无限堆积，每个 tab = 一个 Chromium 渲染进程
//   ⑥ `MaxListenersExceededWarning: 11 did-stop-loading listeners` + CPU/内存爆炸 → 卡死
// ══════════════════════════════════════════════════════════════════════════
describe('⑬ ★★★ 锚定建立 + webview tab 上限（防"跑起来就卡死"）', () => {
  const TARGET = read('apps/desktop/browser-target.cjs');
  const bt = require(resolve(REPO, 'apps/desktop/browser-target.cjs'));

  it('★★★ 建页类动作未锚定时必须回落 activeTabId（否则锚永不建立）', () => {
    const isMine = (t: string) => t === 'tab-1';
    // 场景 B（实测现场）：navigate 无显式 tabId、未锚定、activeTabId=tab-1（本会话的）
    const r = bt.resolveTarget('c1', null, 'navigate', { anchored: null, activeTabId: 'tab-1', isMine });
    expect(r.ok, '★ 未放行 → navigate 拿不到 tabId → 锚永建不起来').toBe(true);
    expect(r.tabId, '★ 未回落 activeTabId → decideAnchorUpdate 收到 null → 返回 none → 读类动作全被拒')
      .toBe('tab-1');
  });

  it('★★★ 回落仍必须过 isMine 闸门（防跨会话越权）', () => {
    // activeTabId 属于**别的会话**（未登记）→ 绝不回落
    const r = bt.resolveTarget('c1', null, 'navigate', {
      anchored: null, activeTabId: 'tab-9', isMine: (t: string) => t === 'tab-1',
    });
    expect(r.ok).toBe(true);
    expect(r.tabId, '★ 回落了别的会话的页 → 跨会话越权').toBeNull();
  });

  it('★★★ 读类动作**不得**回落 activeTabId（保持"绝不静默打别人的页"）', () => {
    const r = bt.resolveTarget('c1', null, 'get_page_content', {
      anchored: null, activeTabId: 'tab-1', isMine: () => true,
    });
    expect(r.ok, '★ 读类动作放行了未锚定的全局活动页 → A4 消灭过的静默错页回归').toBe(false);
  });

  it('★★★ main.cjs 必须把 activeTabId 传进判定（否则回落是死代码）', () => {
    const m = stripComments(MAIN);
    const i = m.indexOf('resolveBrowserTarget(convId, tabId, action, {');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const seg = m.slice(i, i + 600);
    expect(seg, '★ 未传 activeTabId → 建页类回落逻辑失效，锚建立不了').toMatch(/activeTabId,/);
  });

  it('★★★ webview 引擎的建 tab 必须有上限收口（卡死根因）', () => {
    const m = stripComments(MAIN);
    // ① 必须有 webview 专用的 LRU 收口函数
    expect(m, '★ 缺 evictLruWebviewTabIfNeeded → webview tab 无上限堆积 → 应用卡死')
      .toMatch(/function evictLruWebviewTabIfNeeded\(/);
    // ② 建 tab 的 webview 分支必须调用它（不能只保护 browserview 分支）
    const iFn = m.indexOf('function createBrowserTab(scope)');
    const seg = m.slice(iFn, iFn + 900);
    expect(seg, '★ webview 分支未收口 → 建 tab 无上限').toMatch(/evictLruWebviewTabIfNeeded\(\)/);
    // ③ 逐出必须广播 tabClosed（否则渲染层 <webview> 元素不销毁，进程不释放）
    const iEv = m.indexOf('function evictLruWebviewTabIfNeeded(');
    const evSeg = m.slice(iEv, iEv + 1600);
    expect(evSeg, '★ 逐出未广播 tabClosed → <webview> 元素与 guest 进程残留').toMatch(/send\('browserView:tabClosed'/);
    // ④ 必须清锚（否则留下幽灵 tabId）
    expect(evSeg, '★ 逐出未清锚 → 幽灵 tabId 残留').toMatch(/clearConvAnchorsForTab\(/);
  });

  it('★★ 锚定决策必须可观测（"navigate 成功后读不到页"的唯一线索）', () => {
    const m = stripComments(MAIN);
    expect(m, '★ 锚定决策无日志 → 排障只能读库反查（本项目已栽过）')
      .toMatch(/锚定决策: action=/);
  });
});

// ⑭ ★★★ 四次根因：`isMine` 闸门挡住**首次** navigate（2026-10-10 深夜复查）
//
// 三次修复（⑬）把回落闸门定为 `isMine(fb)`，但 `isMine` 的实现是
// `agentTouchedTabs.get(t) === convId`，而 `agentTouchedTabs` **只在动作成功执行后才登记**
// ⇒ **首次** navigate 时该 tab 一个都没登记 ⇒ `isMine` 恒 false ⇒ 回落**仍不生效**
// ⇒ tabId 还是 null ⇒ 锚还是建不起来 ⇒ ⑬ 的修复等于白改（"断言存在 ≠ 断言生效"的又一例）。
//
// 判据：回落闸门必须是「isMine **或** 就是本面板当前活动页」（isCurrentView）。
//   · isCurrentView 安全的理由：activeTabId 是**本面板**正在显示的页（用户肉眼可见），
//     不可能是"别的会话的页"；跨会话越权的真实威胁是显式传未登记的 tabId（由 ①② 分支拦）。
// ══════════════════════════════════════════════════════════════════════════
describe('⑭ ★★★ 首次 navigate 必须能建立锚（isMine 挡不住——antouchedTabs 还是空的）', () => {
  const MAIN2 = read('apps/desktop/main.cjs');
  const bt = require(resolve(REPO, 'apps/desktop/browser-target.cjs'));

  it('★★★ 未登记的 activeTabId（= 本面板当前活动页）也必须回落', () => {
    // 真实首次场景：agentTouchedTabs 为空 ⇒ isMine 恒 false，但 tab-1 就是当前活动页
    const r = bt.resolveTarget('c1', null, 'navigate', {
      anchored: null,
      activeTabId: 'tab-1',
      isMine: () => false,                      // ← 首次：一个都没登记
      isCurrentView: (t: string) => t === 'tab-1',
    });
    expect(r.ok).toBe(true);
    expect(r.tabId, '★ isMine 挡住首次 navigate → 回落不生效 → 锚永建不起来（⑬ 的修复白改）')
      .toBe('tab-1');
    // 连带：锚必须真的能建立（端到端语义）
    const upd = bt.decideAnchorUpdate('navigate', false, r.tabId, undefined);
    expect(upd.mode, '★ 仍未建立锚 → 后续读类动作全被拒 → 模型穷举换 URL → tab 堆积 → 卡死')
      .toBe('anchor');
    expect(upd.tabId).toBe('tab-1');
  });

  it('★★★ 非当前活动页且未登记 → 绝不回落（越权闸门未破）', () => {
    const r = bt.resolveTarget('c1', null, 'navigate', {
      anchored: null,
      activeTabId: 'tab-9',                     // 不是本面板活动页
      isMine: () => false,
      isCurrentView: (t: string) => t === 'tab-1',
    });
    expect(r.ok).toBe(true);
    expect(r.tabId, '★ 回落了非当前页的未登记 tab → 跨会话越权').toBeNull();
  });

  it('★★★ 显式传别的会话 tabId → 仍必须拒绝（回落放宽不影响越权闸门）', () => {
    const r = bt.resolveTarget('c1', 'tab-99', 'navigate', {
      anchored: null,
      activeTabId: 'tab-1',
      isMine: () => false,
      isCurrentView: (t: string) => t === 'tab-1',
    });
    expect(r.ok, '★ 显式越权 tabId 被放行 → 跨会话越权').toBe(false);
  });

  it('★★★ main.cjs 必须传 isCurrentView 且真的引用 activeTabId（否则放宽是死代码）', () => {
    const m = stripComments(MAIN2);
    const i = m.indexOf('resolveBrowserTarget(convId, tabId, action, {');
    expect(i).toBeGreaterThan(-1);
    const seg = m.slice(i, i + 900);
    // ★ 不能只查关键字存在 —— 必须"真的拿 activeTabId 比较"（防 `isCurrentView: () => false` 这类死代码）
    expect(seg, '★ 未传 isCurrentView → 首次 navigate 仍被 isMine 挡住 → 锚建不起来')
      .toMatch(/isCurrentView:\s*\([^)]*\)\s*=>\s*[^,]*activeTabId/);
  });
});

// ⑮ ★★★ openInNewTab：开新页 ≠ 抢锚（2026-10-11，用户拍板语义）
//
// 背景（"看似有、实则失效"的缺口）：
//   `openInNewTab` 的处理**原先只写在渲染层**（ui/stores/chat.ts 读 args.openInNewTab）。
//   而执行面直连化（2026-10-10）后，browser_* 由**服务端直连主进程**执行、
//   渲染层 tool:execute 守卫直接跳过 ⇒ 那段代码**根本不会跑**
//   ⇒ 参数被静默忽略 ⇒ 退化成"覆盖当前页"（正是工具描述承诺"不再退化成覆盖当前页"的反面）。
//
// 修法：主进程入口把它**委派给 `new_tab`**（语义逐字一致：开新页 + 返回 tabId + touch 不抢锚），
//   复用 new_tab 全套实现，**绝不抄第二份建壳逻辑**（本项目反复栽在"平行实现漂移"）。
// ══════════════════════════════════════════════════════════════════════════
describe('⑮ ★★★ openInNewTab 委派 new_tab（开新页不抢锚）', () => {
  const MAIN3 = read('apps/desktop/main.cjs');
  const bt = require(resolve(REPO, 'apps/desktop/browser-target.cjs'));

  it('★★★ main.cjs 必须把 navigate+openInNewTab 改写为 new_tab（且在 resolveBrowserTarget 之前）', () => {
    const m = stripComments(MAIN3);
    const i = m.indexOf("args.openInNewTab === true");
    expect(i, '★ 主进程没处理 openInNewTab → 直连路径下被静默忽略 → 退化成覆盖当前页').toBeGreaterThan(-1);
    const seg = m.slice(i, i + 300);
    expect(seg, '★ 未委派给 new_tab').toMatch(/action\s*=\s*'new_tab'/);
    // ★ 位置断言：改写必须在 resolveBrowserTarget **之前**（它按 action 决定回落语义）
    const iResolve = m.indexOf('resolveBrowserTarget(convId, tabId, action, {');
    expect(i, '★ 改写位置在 resolveBrowserTarget 之后 → 解析用的是旧 action').toBeLessThan(iResolve);
  });

  it('★★★ 委派后锚语义必须是 touch（不抢锚）—— 这是 openInNewTab 的定义', () => {
    // openInNewTab 已改写为 new_tab ⇒ decideAnchorUpdate('new_tab', …) 必须返回 touch
    const upd = bt.decideAnchorUpdate('new_tab', false, 'tab-1', 'tab-9');
    expect(upd.mode, '★ 开新页却改了"当前操作页" → 抢锚（与定义相反）').toBe('touch');
    expect(upd.tabId).toBe('tab-9');
  });

  it('★★★ new_tab 必须走 createBrowserTab（否则绕过 tab 上限 → agent 反复开页即堆积卡死）', () => {
    const m = stripComments(MAIN3);
    const i = m.indexOf("case 'new_tab':");
    expect(i).toBeGreaterThan(-1);
    const seg = m.slice(i, i + 1800);
    expect(seg, '★ new_tab 自己 tabSeq++ 自建 → 绕过 createBrowserTab 的 MAX_TABS/LRU 收口')
      .toMatch(/createBrowserTab\(/);
    expect(seg, '★ 仍在自建（webviewTabs.set + tabSeq++）→ 平行实现').not.toMatch(/webviewTabs\.set\(tabId,\s*\{/);
    // agentOpened 标记必须保留（agent 只能关自己开的 tab）
    expect(seg, '★ 丢了 agentOpened 标记 → agent 关不掉自己开的 tab').toMatch(/agentOpened\s*=\s*true/);
  });

  it('★★ createBrowserTab 内部必须有上限收口（防止被绕过的那条路径再出现）', () => {
    const btSrc = read('apps/desktop/main.cjs');
    const i = btSrc.indexOf('function createBrowserTab(scope)');
    const seg = btSrc.slice(i, i + 1500);
    expect(seg, '★ createBrowserTab 缺 evictLruWebviewTabIfNeeded').toMatch(/evictLruWebviewTabIfNeeded\(\)/);
  });

  it('★★★ webview 建 tab 必须**只有 createBrowserTab 一个收口**（防"平行实现漂移"再犯）', () => {
    const code = stripComments(read('apps/desktop/main.cjs'));
    // 所有向 webviewTabs 写入**新条目**的点，只允许出现在 createBrowserTab 内。
    // （例外：`webviewTabs.set(tabId, t)` 形态是 wvRegister 更新既有条目的 wcId，不是建 tab；
    //  这里用"字面量对象含 wcId: null"来识别"建新条目"。）
    const newEntryHits = code.match(/webviewTabs\.set\([^,]+,\s*\{[^}]*wcId:\s*null/g) || [];
    expect(newEntryHits.length, `★ 有 ${newEntryHits.length} 处直接新建 webviewTabs 条目（应为 1 = createBrowserTab 内）`)
      .toBeLessThanOrEqual(1);
    // 且 `++tabSeq` 在 webview 路径不得脱离 createBrowserTab 使用：
    //   允许 BrowserView 引擎的 2 处（1007 弹窗 / 1853 兜底），它们各自调了 evictLruTabIfNeeded。
    const seqHits = code.match(/\+\+tabSeq/g) || [];
    expect(seqHits.length, `★ ++tabSeq 出现 ${seqHits.length} 处（应为 3：createBrowserTab + BrowserView 两处）`)
      .toBeLessThanOrEqual(3);
  });

  it('★★ BrowserView 引擎的两处自建必须各自调 evictLruTabIfNeeded（旧引擎的收口不能丢）', () => {
    const code = stripComments(read('apps/desktop/main.cjs'));
    const hits = [...code.matchAll(/evictLruTabIfNeeded\(\)/g)];
    // createBrowserTab 内 1 处 + 弹窗 handler 1 处 + ensureActiveTab 兜底 1 处 = 3 处
    expect(hits.length, '★ BrowserView 收口点少了（旧引擎 tab 会堆积）').toBeGreaterThanOrEqual(3);
  });
});
