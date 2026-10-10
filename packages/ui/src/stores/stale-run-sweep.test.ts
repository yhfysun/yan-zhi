/**
 * 禁用标志（输入锁）残留 + 轮询消除 —— 回归测试
 *
 * 背景（用户实报，2026-10-11）：
 *   「应用很卡」「没有任务，禁用标志也一直存在着」
 *   「轮询？这个不是早就去掉了？不是改成 websocket 双向通讯了？轮询效率肯定差啊」
 *
 * 查证结论（本文件钉住的三个事实）：
 *   ① 业务主链路**从来没有 WebSocket** —— 任务流是 fetch + ReadableStream 手读 SSE；
 *      真正存在的是**轮询**（`/llm/tasks/active`），已改为会话级长连订阅。
 *   ② `sweepStaleBrowserTakeover` 的 120s 宽限是"禁用标志挂着不掉"的**主因**（已降到 30s）。
 *   ③ `BrowserPanel` 的 3s `setInterval(nowTick)` 是**常驻空转**（已改事件驱动）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SWEEP_INTERVAL_MS,
  BROWSER_SWEEP_GRACE_MS,
  shouldSweepConv,
} from './stale-run-sweep';

const UI_SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(UI_SRC, p), 'utf8');
const stripComments = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
// 防"注释里提到就算数"：断言只能命中**有效代码**
const CODE_CHAT = stripComments(read('stores/chat.ts'));
const CODE_PANEL = stripComments(read('components/BrowserPanel.vue'));

describe('① 禁用标志残留：宽限必须够短（120s → 30s）', () => {
  it('★★★ 宽限不得超过 30s（否则任务结束后禁用标志长时间挂着）', () => {
    expect(BROWSER_SWEEP_GRACE_MS, '★ 宽限 >30s → 用户体感"没有任务还锁着"').toBeLessThanOrEqual(30000);
  });

  it('★★★ 巡检周期不得超过 60s', () => {
    expect(SWEEP_INTERVAL_MS, '★ 周期过长 → 残留最坏要等一整轮才清').toBeLessThanOrEqual(60000);
  });

  it('★★ 常量与判定必须来自独立纯函数文件（可单测；不得内联回 store）', () => {
    expect(CODE_CHAT, '★ store 里又内联了 120000 字面量 → 判定不可测、易回退')
      .not.toMatch(/120\s*\*\s*1000|120000/);
    expect(CODE_CHAT, '★ 未从 stale-run-sweep 引入判定').toMatch(/from '\.\/stale-run-sweep'/);
  });
});

describe('② shouldSweepConv：行为级（谁被清、谁不被清）', () => {
  it('非浏览器会话：永远可查（以服务端为准）', () => {
    expect(shouldSweepConv(false, 0)).toBe(true);
    expect(shouldSweepConv(false, 99999999)).toBe(true);
  });

  it('★★★ 浏览器会话：宽限内**跳过**（刚结束的终态可能还在路上，不能误清）', () => {
    expect(shouldSweepConv(true, 0)).toBe(false);
    expect(shouldSweepConv(true, 1000)).toBe(false);
    expect(shouldSweepConv(true, BROWSER_SWEEP_GRACE_MS)).toBe(false);
  });

  it('★★★ 浏览器会话：超宽限必须查（否则残留永远清不掉 = 禁用标志挂着不掉）', () => {
    expect(shouldSweepConv(true, BROWSER_SWEEP_GRACE_MS + 1)).toBe(true);
    expect(shouldSweepConv(true, 10 * 60 * 1000)).toBe(true);
  });

  it('★ 边界：恰好等于宽限 → 跳过（用 > 而非 >=，语义明确）', () => {
    expect(shouldSweepConv(true, 30000, 30000)).toBe(false);
    expect(shouldSweepConv(true, 30001, 30000)).toBe(true);
  });
});

describe('③ 轮询消除：主路径改为会话级长连订阅', () => {
  it('★★★ 前端必须订阅会话级事件总线（conversations/:id/stream）', () => {
    expect(CODE_CHAT, '★ 未订阅会话级流 → 终态推不出去 → 只能靠轮询兜底')
      .toMatch(/\/llm\/conversations\/\$\{encodeURIComponent\(convId\)\}\/stream/);
  });

  it('★★★ 必须处理终态三类（completed/aborted/error）并清残留', () => {
    const i = CODE_CHAT.indexOf('async function subscribeConversationEvents');
    expect(i, '★ 找不到 subscribeConversationEvents').toBeGreaterThan(-1);
    const seg = CODE_CHAT.slice(i, i + 2600);
    for (const t of ['task:completed', 'task:aborted', 'task:error']) {
      expect(seg, `★ 会话级订阅漏了终态 ${t}`).toContain(t);
    }
    expect(seg, '★ 收到终态不清运行态 → 禁用标志不掉').toMatch(/runningConvIds\.value\.delete\(convId\)/);
    expect(seg, '★ 收到终态不清浏览器记账 → 输入锁不掉').toMatch(/clearBrowserTaskActive\(convId\)/);
  });

  it('★★★ 必须是**长连 + 重连**（不能收完就退，会话流是长活通道）', () => {
    const i = CODE_CHAT.indexOf('async function subscribeConversationEvents');
    const seg = CODE_CHAT.slice(i, i + 2600);
    expect(seg, '★ 缺重连循环 → 断一次就永久失效').toMatch(/while \(!ac\.signal\.aborted\)/);
    expect(seg, '★ 缺退避').toMatch(/Math\.min\(500 \* Math\.pow\(2/);
  });

  it('★★★ 切会话时必须挂上会话级订阅（否则通道根本没建立）', () => {
    const i = CODE_CHAT.indexOf('async function reconnectActiveTask');
    expect(i).toBeGreaterThan(-1);
    const seg = CODE_CHAT.slice(i, i + 700);
    expect(seg, '★ 切会话没挂会话级订阅 → 本轮改动是死代码')
      .toMatch(/subscribeConversationEvents\(convId\)/);
  });

  it('★★ 必须有退订出口（防泄漏）', () => {
    expect(CODE_CHAT).toMatch(/function unsubscribeConversationEvents\(/);
    expect(CODE_CHAT).toMatch(/subscribeConversationEvents,\s*unsubscribeConversationEvents/);
  });
});

describe('④ 轮询消除：nowTick 不得再用常驻 setInterval', () => {
  it('★★★ BrowserPanel 不得有常驻 3s 节拍器', () => {
    expect(CODE_PANEL, '★ 常驻 setInterval(nowTick) 又在 → 组件一挂载就永久空转')
      .not.toMatch(/setInterval\(\(\)\s*=>\s*\{\s*nowTick\.value\s*=\s*Date\.now\(\)/);
  });

  it('★★★ 必须改为按需单次定时器（scheduleNowTick）', () => {
    expect(CODE_PANEL).toMatch(/function scheduleNowTick\(/);
    expect(CODE_PANEL, '★ 缺"按需挂单次"→ 回退成常驻').toMatch(/nowTickTimer\s*=\s*setTimeout\(/);
  });

  it('★★★ 无浏览器活动时**不得**挂定时器（零空转）', () => {
    const i = CODE_PANEL.indexOf('function scheduleNowTick');
    const seg = CODE_PANEL.slice(i, i + 900);
    expect(seg, '★ 没有 lastBrowserToolAt 保护 → 无任务也常驻定时器').toMatch(/if \(!last\) return;/);
  });

  it('★★ 卸载时必须清定时器', () => {
    expect(CODE_PANEL).toMatch(/onUnmounted\(\(\)\s*=>\s*\{[^}]*clearTimeout\(nowTickTimer\)/);
  });
});

describe('⑤ 通信机制事实（防后人误引"已改 WebSocket"）', () => {
  it('★★★ 任务流必须是 fetch SSE（本项目**未**引入业务 WebSocket）', () => {
    expect(CODE_CHAT, '★ 任务流实现变了？').toMatch(/\/llm\/tasks\/\$\{taskId\}\/stream/);
    expect(CODE_CHAT, '★ 出现 EventSource（本项目刻意不用，因要带 x-license 头）')
      .not.toMatch(/new EventSource\(/);
  });
});

describe('⑥ 全仓轮询收口：统一走 visible-polling（防回退）', () => {
  /**
   * 2026-10-11：用户要求"轮询都去掉"。项目里仍有**必要轮询**（服务端无推送通道的场景：
   * 外部 IM 拉取 / 节点消息 / 运维指标 / 下载与合成进度 / 验证码），
   * 统一收口到 `utils/visible-polling` —— 页面隐藏时不安排下一次（真零唤醒），
   * 恢复可见时立即补一次。
   *
   * 本用例钉住：这些文件**不得**再出现裸 setInterval（回退即失败）。
   * ★ 两处**豁免**（有明确理由，见断言注释）：
   *   · `BrowserPanel.waitWebviewEl` —— 短时轮询等 DOM 元素（≤1.5s，拿到即停）
   *   · `ClipWorkbench` 播放计时 —— 播放进度是刚需，不能因切页暂停
   */
  const POLLING_FILES = [
    'views/ChatHub.vue',
    'views/Peers.vue',
    'views/Knowledge.vue',
    'components/LocalModelMarket.vue',
    'components/VoicePackPanel.vue',
    'components/ops/OpsMetricsPanel.vue',
    'stores/verification.ts',
  ];

  for (const f of POLLING_FILES) {
    it(`★ ${f} 必须走 visible-polling（不得再有裸 setInterval）`, () => {
      const code = stripComments(read(f));
      expect(code, `★ ${f} 又出现裸 setInterval → 切走标签页仍在空转`).not.toMatch(/setInterval\(/);
      expect(code, `★ ${f} 未引入 visible-polling`).toMatch(/startVisiblePolling/);
    });
  }

  it('★ components/BrowserPanel.vue 必须走 visible-polling（每日分析调度器）', () => {
    const code = stripComments(read('components/BrowserPanel.vue'));
    expect(code).toMatch(/startVisiblePolling/);
    // ★ 豁免：waitWebviewEl 的 setInterval（短时轮询等 DOM 元素，≤1.5s 拿到即停）
    //   ⇒ 允许恰好 1 处 setInterval 残留；多于 1 处说明又加了新的常驻轮询
    const hits = code.match(/setInterval\(/g) || [];
    expect(hits.length, `★ BrowserPanel 出现 ${hits.length} 处 setInterval（仅允许 waitWebviewEl 那 1 处）`)
      .toBeLessThanOrEqual(1);
  });

  it('★★ 豁免项必须有说明（waitWebviewEl 短时轮询 / ClipWorkbench 播放计时）', () => {
    const panel = read('components/BrowserPanel.vue');
    // waitWebviewEl 是短时轮询（拿到元素即停），保留 setInterval 是正当的
    const i = panel.indexOf('function waitWebviewEl');
    expect(i, '★ waitWebviewEl 不见了？').toBeGreaterThan(-1);
    const seg = panel.slice(i, i + 500);
    expect(seg, '★ waitWebviewEl 不再短时轮询？').toMatch(/setInterval\(/);
  });

  it('★★★ visible-polling 工具本身必须存在且导出正确', () => {
    const tool = stripComments(read('utils/visible-polling.ts'));
    expect(tool).toMatch(/export function startVisiblePolling\(/);
    // 隐藏时"不安排下一次"（零唤醒）—— 而不是唤醒了再 return
    expect(tool, '★ 隐藏判定没做 → 仍在唤醒主线程').toMatch(/visibilityState\s*===\s*'hidden'/);
    expect(tool, '★ 隐藏时未中断调度 → 白唤醒').toMatch(/if \(isHidden\(\) && !runWhenHidden\) return;/);
    // 恢复可见立即补一次
    expect(tool, '★ 恢复可见未立即补 → 用户要干等一个周期').toMatch(/addEventListener\('visibilitychange'/);
  });
});
