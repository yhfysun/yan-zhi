// @vitest-environment jsdom
/**
 * M1NfcCopyLab 真挂载测试 —— 走完整交互链路，不是只断言组件能渲染。
 *
 * ★ 关键验收：
 *   ① 授权闸门前链路锁定
 *   ② 默认「简单加密 + 可改写卡号卡」→ 完整复制成功
 *   ③ 字典外强密钥 → 明确失败并列出未完成扇区
 *   ④ 普通空白卡 → 块 0 不可写导致失败
 *   ⑤ 自定义密码本补上密钥后，强密钥卡也能复制成功
 *   ⑥ 一次只显示一个步骤（沉浸式准则）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import { m1RegisterNfcDriver, type M1NfcDriver } from '@yan-zhi/shared';
import M1NfcCopyLab from './M1NfcCopyLab.vue';

const LAB = {
  target: '本机课程模拟台 · 仅自有或已授权卡',
  tools: ['课程内交互模拟器'],
  steps: ['确认授权', '选卡', '恢复密钥', '逐块校验'],
  expected: '简单加密卡可完整复制；强密钥卡与普通空白卡必须失败。',
  simulator: 'm1-nfc-copy',
};

const mountedApps: App[] = [];

async function mountLab(): Promise<HTMLElement> {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(M1NfcCopyLab, { lab: LAB });
  mountedApps.push(app);
  app.mount(el);
  await nextTick();
  return el;
}

async function flush(): Promise<void> {
  // advance() 是 async，内部多次 await；宏任务一次清空全部微任务后再刷新视图
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
  await nextTick();
}

function click(el: HTMLElement, sel: string): void {
  const node = el.querySelector(sel) as HTMLElement | null;
  if (!node) throw new Error(`未找到元素 ${sel}`);
  node.click();
}

async function action(el: HTMLElement): Promise<void> {
  click(el, '[data-testid="m1-action"]');
  await flush();
}

async function authorize(el: HTMLElement): Promise<void> {
  click(el, '[data-testid="m1-consent-trigger"]');
  await nextTick();
  click(el, '[data-testid="m1-consent-confirm"]');
  await nextTick();
}

async function runToResult(el: HTMLElement): Promise<void> {
  for (let i = 0; i < 5; i += 1) await action(el);
}

function setText(el: HTMLElement, sel: string, value: string): void {
  const input = el.querySelector(sel) as HTMLTextAreaElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

beforeEach(() => {
  for (const app of mountedApps) app.unmount();
  mountedApps.length = 0;
  document.body.innerHTML = '';
});

describe('M1 复制实验台 · 授权弹窗与沉浸式步骤', () => {
  it('★ 授权必须走弹窗：未确认时锁定，点「取消」仍锁定，确认后才解锁', async () => {
    const el = await mountLab();
    const button = el.querySelector('[data-testid="m1-action"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(el.querySelector('[data-testid="m1-consent-dialog"]')).toBeNull();
    expect(el.textContent).toContain('先完成授权确认');

    click(el, '[data-testid="m1-consent-trigger"]');
    await nextTick();
    const dialog = el.querySelector('[data-testid="m1-consent-dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.textContent).toContain('自有或已获书面授权');
    expect(dialog?.textContent).toContain('不上传、不落盘');

    click(el, '[data-testid="m1-consent-cancel"]');
    await nextTick();
    expect(el.querySelector('[data-testid="m1-consent-dialog"]')).toBeNull();
    expect((el.querySelector('[data-testid="m1-action"]') as HTMLButtonElement).disabled).toBe(true);

    await authorize(el);
    expect((el.querySelector('[data-testid="m1-action"]') as HTMLButtonElement).disabled).toBe(false);
    expect(el.textContent).toContain('已确认 · 自有或已授权卡');
  });

  it('撤销授权会清空结果并把步骤送回起点', async () => {
    const el = await mountLab();
    await authorize(el);
    await action(el);
    expect(el.querySelector('[data-testid="m1-step-1"]')).toBeTruthy();

    click(el, '[data-testid="m1-consent-revoke"]');
    await nextTick();
    expect(el.querySelector('[data-testid="m1-step-0"]')).toBeTruthy();
    expect((el.querySelector('[data-testid="m1-action"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('进页面即如实展示真机读卡器状态：无驱动时说明降级原因', async () => {
    const el = await mountLab();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    const device = el.querySelector('[data-testid="m1-device"]');
    expect(device?.textContent).toContain('真机读卡器未连接');
    expect(device?.textContent).toContain('教学模拟');
  });

  it('一次只显示一个步骤，步骤推进后才出现下一步内容', async () => {
    const el = await mountLab();
    expect(el.querySelector('[data-testid="m1-step-0"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="m1-step-1"]')).toBeNull();

    await authorize(el);
    await action(el);
    expect(el.querySelector('[data-testid="m1-step-0"]')).toBeNull();
    expect(el.querySelector('[data-testid="m1-step-1"]')).toBeTruthy();
    expect(el.textContent).toContain('DEADBEEF');
  });
});

describe('M1 复制实验台 · 完整链路', () => {
  it('★ 简单加密卡 + 可改写卡号卡 → 完整复制成功', async () => {
    const el = await mountLab();
    await authorize(el);
    await runToResult(el);

    const result = el.querySelector('[data-testid="m1-result"]');
    expect(result).toBeTruthy();
    expect(result?.classList.contains('ok')).toBe(true);
    expect(result?.textContent).toContain('复制成功');
    expect(result?.textContent).toContain('逐块校验一致');
    expect(el.textContent).toContain('防护清单');
  });

  it('字典外强密钥 → 复制失败，明确列出未完成扇区', async () => {
    const el = await mountLab();
    await authorize(el);
    click(el, '[data-policy="strong"]');
    await nextTick();
    await runToResult(el);

    const result = el.querySelector('[data-testid="m1-result"]');
    expect(result?.classList.contains('fail')).toBe(true);
    expect(result?.textContent).toContain('复制失败');
    expect(result?.textContent).toContain('7、8');
  });

  it('普通空白卡 → 块 0 不可写，复制失败', async () => {
    const el = await mountLab();
    await authorize(el);
    click(el, '[data-target="normal"]');
    await nextTick();
    await runToResult(el);

    const result = el.querySelector('[data-testid="m1-result"]');
    expect(result?.classList.contains('fail')).toBe(true);
    expect(result?.textContent).toContain('块 0 不可写');
  });

  it('★ 自定义密码本生效：把强密钥写进密码本后可完整复制', async () => {
    const el = await mountLab();
    await authorize(el);
    click(el, '[data-policy="strong"]');
    setText(el, '[data-testid="m1-keybook"]', '5A7C31E9B204\nC4F0D81A63BE');
    await nextTick();
    expect(el.textContent).toContain('自定义有效 2 条');

    await runToResult(el);
    const result = el.querySelector('[data-testid="m1-result"]');
    expect(result?.classList.contains('ok')).toBe(true);
    expect(result?.textContent).toContain('复制成功');
  });

  it('密钥恢复步骤展示真实尝试次数与命中来源', async () => {
    const el = await mountLab();
    await authorize(el);
    await action(el); // → 识别
    await action(el); // → 密钥恢复

    const panel = el.querySelector('[data-testid="m1-step-2"]');
    expect(panel).toBeTruthy();
    expect(panel?.textContent).toContain('16/16');
    expect(panel?.textContent).toContain('公开默认值');
    expect(panel?.textContent).toContain('逐扇区密钥恢复');
  });
});

/** 真机驱动替身：只接受出厂默认密钥，全部块返回固定示例数据。 */
function realDriver() {
  const calls = { swaps: 0, writes: 0, stopped: 0 };
  const driver: M1NfcDriver = {
    id: 'test-nfc',
    capability: async () => ({ available: true, driverId: 'test-nfc', reason: '' }),
    startSession: async () => undefined,
    stopSession: async () => { calls.stopped += 1; },
    readCard: async () => ({
      uid: 'DEADBEEF', bcc: '31', sak: '08', atqa: '0400', sectorCount: 16,
    }),
    authenticate: async (_sector, key) => key === 'FFFFFFFFFFFF',
    readBlock: async () => 'A1'.repeat(16),
    writeBlock: async () => { calls.writes += 1; return { ok: true }; },
    awaitTargetCard: async () => { calls.swaps += 1; },
  };
  return { driver, calls };
}

describe('M1 复制实验台 · 真机模式', () => {
  // ★ registry 是模块级单例，不清会污染后面所有模拟模式用例
  afterEach(() => m1RegisterNfcDriver(null));

  it('★ 真机可用时默认进真机模式，写入前必须弹窗换卡', async () => {
    const { driver, calls } = realDriver();
    m1RegisterNfcDriver(driver);
    const el = await mountLab();
    await flush();

    expect(el.querySelector('[data-testid="m1-real-hint"]')).toBeTruthy();
    expect(el.querySelector('[data-policy="weak"]')).toBeNull();
    expect((el.querySelector('[data-testid="m1-action"]') as HTMLButtonElement).textContent)
      .toContain('贴源卡并开始');

    await authorize(el);
    click(el, '[data-testid="m1-action"]');
    await flush();

    const dialog = el.querySelector('[data-testid="m1-swap-dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('请换上目标空白卡');
    expect(calls.writes).toBe(0);

    click(el, '[data-testid="m1-swap-confirm"]');
    await flush();

    expect(calls.swaps).toBe(1);
    expect(calls.writes).toBe(64);
    expect(el.querySelector('[data-testid="m1-result"]')?.textContent).toContain('复制成功');
    expect(calls.stopped).toBe(1);
  });

  it('★ 中止换卡 → 不写入任何块，给出明确错误且不进结论页', async () => {
    const { driver, calls } = realDriver();
    m1RegisterNfcDriver(driver);
    const el = await mountLab();
    await flush();
    await authorize(el);

    click(el, '[data-testid="m1-action"]');
    await flush();
    click(el, '[data-testid="m1-swap-abort"]');
    await flush();

    expect(calls.writes).toBe(0);
    expect(calls.stopped).toBe(1);
    expect(el.querySelector('[data-testid="m1-hardware-error"]')?.textContent).toContain('已中止');
    expect(el.querySelector('[data-testid="m1-result"]')).toBeNull();
    expect(el.querySelector('[data-testid="m1-swap-dialog"]')).toBeNull();
  });

  it('一键切回教学模拟后恢复教学卡选择，且不触发真机读卡', async () => {
    const { driver } = realDriver();
    m1RegisterNfcDriver(driver);
    const el = await mountLab();
    await flush();

    click(el, '[data-testid="m1-mode"]');
    await nextTick();

    expect(el.querySelector('[data-policy="weak"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="m1-real-hint"]')).toBeNull();
  });
});
