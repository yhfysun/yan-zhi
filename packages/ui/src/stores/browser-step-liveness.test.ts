/**
 * 浏览器步骤日志的「控制信号」不得退化为长度差分 —— 回归测试（2026-10-12）
 *
 * 背景（用户实报，2026-10-12）：
 *   「还是有点卡，而且 ai 操作浏览器看不到了？模拟鼠标没了？页面禁用标志也没了，
 *     AI 接管的也没了？暂停也没了吗？」
 *
 * 根因（CDP 直连渲染进程读 pinia 实测实锤，非推测）：
 *   `browserSteps` 有 `BROWSER_STEPS_MAX = 120` 上限，裁剪是 `push` + `splice` ⇒
 *   **净长度恒为 120**。而 `lastBrowserToolAt` 由 `watch(() => browserSteps.length)` 推导
 *   ⇒ 数组填满后 watch **永不再触发** ⇒ 时间戳冻结 ⇒ `BrowserPanel` 的 5min 硬上限
 *   把它判成"残留" ⇒ `inputLocked` / `liveControlVisible` / `agentCursorVisible` 三个
 *   computed **同时被否决** ⇒ 禁用标志 / 接管条 / 暂停恢复按钮 / 虚拟鼠标**一起消失**。
 *   实测：`browserStepsLen=120`、`lastStepAgoSec=12` 但 `agoSec=754`。
 *
 * ★★★ 本文件为什么必须**行为级**跑真 store、而不是 grep 源码：
 *   本项目反复栽在"断言存在 ≠ 断言生效"（见 browser-bridge-direct.test.ts 的变异实测记录：
 *   只断言符号时把条件改成 `if (false)` 仍通过）。上面这个 bug 恰恰就是**符号全在、
 *   逻辑失效** —— `lastBrowserToolAt.value = ...` 那行在旧实现里确实存在（在 watch 回调里），
 *   grep 必然全绿却抓不到任何东西。⇒ 必须真的把数组推到 121 条，再看时间戳对不对。
 */
import { describe, it, expect } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useChatStore } from './chat';

const UI_SRC = join(__dirname, '..');
const stripComments = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const CODE_CHAT = stripComments(readFileSync(join(UI_SRC, 'stores/chat.ts'), 'utf8'));
const CODE_USECHAT = stripComments(readFileSync(join(UI_SRC, 'composables/chat/useChat.ts'), 'utf8'));

/** 每个用例一份干净 store */
function freshStore() {
  setActivePinia(createPinia());
  return useChatStore();
}

describe('① 活性时间戳必须跟随「每一次 push」，而不是数组长度', () => {
  it('★★★ 连推 21 次（越过 20 上限）→ lastBrowserToolAt 必须等于【最后一次】的时间', () => {
    const store = freshStore();
    // 把 Date.now 打桩成可控递增值，才能精确断言"等于最后一次"
    const realNow = Date.now;
    let t = 1_700_000_000_000;
    Date.now = () => (t += 1000);
    try {
      for (let i = 0; i < 21; i++) store.pushBrowserStep('browser_click', `step-${i}`);
      const expected = t;               // 第 21 次 push 时的时间戳
      const steps = store.browserSteps;
      expect(steps.length, '★ 容量上限必须仍然是 20（不回归裁剪行为）').toBe(20);
      expect(steps[steps.length - 1].time, '★ 数组最后一条就是第 21 步').toBe(expected);
      expect(
        store.lastBrowserToolAt,
        '★★★ 活性时间戳冻结在数组首次填满那一刻 —— 这正是"禁用标志/接管条/虚拟鼠标/暂停集体消失"的根因。' +
        '旧实现用 watch(length) 推导，填满后 push+splice 净长度不变 ⇒ watch 永不触发。',
      ).toBe(expected);
    } finally { Date.now = realNow; }
  });

  it('★★ 未越过上限时同样精确等于最后一条（与原实现等价，防行为漂移）', () => {
    const store = freshStore();
    const realNow = Date.now;
    let t = 1_700_000_000_000;
    Date.now = () => (t += 500);
    try {
      for (let i = 0; i < 5; i++) store.pushBrowserStep('browser_type', `s${i}`);
      expect(store.lastBrowserToolAt).toBe(store.browserSteps[4].time);
    } finally { Date.now = realNow; }
  });

  it('★★ 第 1 条 push 就写入时间戳（不是 0 / 不是等第二条）', () => {
    const store = freshStore();
    expect(store.lastBrowserToolAt, '★ 初始必须为 0').toBe(0);
    store.pushBrowserStep('browser_navigate', 'ok');
    expect(store.lastBrowserToolAt, '★ 首条即登记 —— 否则首个步骤期间判定不到"在跑"').toBeGreaterThan(0);
  });
});

describe('② 步骤序号必须单调递增、不受裁剪影响', () => {
  it('★★★ 连推 21 次 → browserStepSeq 必须等于 21（不能跟 length 一起封顶）', () => {
    const store = freshStore();
    for (let i = 0; i < 21; i++) store.pushBrowserStep('browser_click', `s${i}`);
    expect(store.browserSteps.length, '★ 数组长度封顶').toBe(20);
    expect(
      store.browserStepSeq,
      '★★★ 序号被裁剪拖累成 20 ⇒ useChat 的"首个步骤开面板/锁输入"两个 watch 永不触发',
    ).toBe(21);
  });

  it('★★ 序号从 0 起、每次 push 恰好 +1', () => {
    const store = freshStore();
    expect(store.browserStepSeq).toBe(0);
    store.pushBrowserStep('browser_click', 'a');
    expect(store.browserStepSeq).toBe(1);
    store.pushBrowserStep('browser_click', 'b');
    expect(store.browserStepSeq).toBe(2);
  });

  it('★★★ resetBrowserStepSeq 必须把序号与时间戳一起归零（否则新会话面板不弹）', () => {
    const store = freshStore();
    store.pushBrowserStep('browser_click', 'a');
    store.pushBrowserStep('browser_click', 'b');
    store.resetBrowserStepSeq();
    expect(store.browserStepSeq, '★ 序号不清 → 新会话第一个步骤时 o!==0 → 两个 watch 都不触发').toBe(0);
    expect(store.lastBrowserToolAt, '★ 时间戳不清 → 新会话开局可能被判残留').toBe(0);
  });
});

describe('③ 源码契约：活性信号不得再从 length 差分推导', () => {
  it('★★★ stores/chat.ts 不得存在 watch(() => browserSteps...length) 推导链', () => {
    expect(
      CODE_CHAT,
      '★★★ 又出现了基于 browserSteps 长度的 watch —— 数组填满后它必然静默失效（本次事故根因）',
    ).not.toMatch(/watch\(\s*\(\)\s*=>\s*[^,)]*browserSteps[^,)]*\.length/);
  });

  it('★ pushBrowserStep 内必须直接写 lastBrowserToolAt（调用形式锚点）', () => {
    const i = CODE_CHAT.indexOf('function pushBrowserStep');
    expect(i, '未找到 pushBrowserStep').toBeGreaterThanOrEqual(0);
    // 取函数体（到下一个顶层 } 收尾，宽松取 1200 字符窗口）
    const fn = CODE_CHAT.slice(i, i + 1200);
    expect(fn, '★ pushBrowserStep 未显式登记活性时间戳').toMatch(/lastBrowserToolAt\.value\s*=/);
    expect(fn, '★ pushBrowserStep 未自增步骤序号').toMatch(/browserStepSeq\.value\s*(\+=\s*1|\+\+)/);
  });

  it('★★★ TDZ 硬约束：lastBrowserToolAt 声明必须【早于】pushBrowserStep 定义', () => {
    const decl = CODE_CHAT.indexOf('const lastBrowserToolAt');
    const fn = CODE_CHAT.indexOf('function pushBrowserStep');
    expect(decl, '未找到 lastBrowserToolAt 声明').toBeGreaterThanOrEqual(0);
    expect(fn, '未找到 pushBrowserStep').toBeGreaterThanOrEqual(0);
    expect(
      decl,
      '★★★ lastBrowserToolAt 声明在 pushBrowserStep 之后 —— pushBrowserStep 内【同步】赋值会读未初始化 const' +
      ' ⇒ ReferenceError（setup 直接抛异常）。本项目已栽过两次同款 TDZ（见 browserPanelNowTickOrder.test.ts）。',
    ).toBeLessThan(fn);
  });

  it('★★ useChat 的两个"首个步骤"watch 必须依赖 browserStepSeq，不得再依赖 length', () => {
    const hits = CODE_USECHAT.match(/watch\(\s*\(\)\s*=>\s*(?:store|chatStore)\.browserSteps\.length/g) || [];
    expect(hits.length, '★ 仍有基于 browserSteps.length 的 watch —— 长任务下会静默失效').toBe(0);
    const seqWatches = CODE_USECHAT.match(/watch\(\s*\(\)\s*=>\s*store\.browserStepSeq/g) || [];
    expect(seqWatches.length, '★ 两个"首个步骤"watch 应改用 browserStepSeq').toBeGreaterThanOrEqual(2);
  });

  it('★★ resetTaskScopedState 必须调用 resetBrowserStepSeq（跨会话清零）', () => {
    const i = CODE_USECHAT.indexOf('store.browserSteps.length = 0');
    expect(i, '未找到 browserSteps 归零点').toBeGreaterThanOrEqual(0);
    const around = CODE_USECHAT.slice(i, i + 400);
    expect(around, '★ browserSteps 归零了但序号没归零 → 新会话第一个步骤判不出 0→N').toMatch(/resetBrowserStepSeq\(\)/);
  });
});

describe('④ 容量上限不得被"顺手调大"（方案 A 的守门）', () => {
  it('★★★ BROWSER_STEPS_MAX 必须 ≤ 20', () => {
    const m = CODE_CHAT.match(/BROWSER_STEPS_MAX\s*=\s*(\d+)/);
    expect(m, '未找到 BROWSER_STEPS_MAX').not.toBeNull();
    const n = Number(m![1]);
    expect(
      n,
      '★★★ 上限被调大 —— `browserSteps` 已无任何 UI 渲染它（方案 A 查证结论），' +
      '为不展示的数组扩容零用户收益，只会放大 splice O(n) 搬移与内存。' +
      '若确需更长的可回溯历史，请新建带事件索引的独立结构（见 docs/plan-browser-steps-retention-2026-10-12.md 方案 D），' +
      '不要复活这个数组。',
    ).toBeLessThanOrEqual(20);
    expect(n, '★ 上限不得为 0（排障需要最近几条现场）').toBeGreaterThan(0);
  });

  it('★★ 单条 result 截断上限保持不变（600 字符）', () => {
    expect(CODE_CHAT, '★ 单条截断被移除 → 单条可达数十 KB，破坏容量控制').toMatch(/BROWSER_STEP_RESULT_MAX\s*=\s*\d+/);
  });
});
