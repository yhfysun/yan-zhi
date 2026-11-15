// @vitest-environment jsdom
/**
 * 网络安全实操台真挂载测试 —— 与音乐「编曲台」同层的独立实践入口。
 * ★ 关键验收：点进来就能动手（不用先钻进某节课的实验步骤），且授权闸门仍然生效。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import SecurityPracticeStudio from './SecurityPracticeStudio.vue';

const mountedApps: App[] = [];

async function mountStudio(): Promise<HTMLElement> {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(SecurityPracticeStudio);
  mountedApps.push(app);
  app.mount(el);
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
  return el;
}

beforeEach(() => {
  for (const app of mountedApps) app.unmount();
  mountedApps.length = 0;
  document.body.innerHTML = '';
});

describe('网络安全实操台', () => {
  it('★ 挂载即内嵌完整 M1 实验台，授权未确认时链路锁定', async () => {
    const el = await mountStudio();
    expect(el.querySelector('[data-testid="security-practice"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="m1-lab"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="m1-consent-trigger"]')).toBeTruthy();
    expect((el.querySelector('[data-testid="m1-action"]') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('[data-testid="m1-keybook"]')).toBeTruthy();
  });

  it('★ 真机状态如实展示；无驱动时明确降级到教学模拟', async () => {
    const el = await mountStudio();
    const device = el.querySelector('[data-testid="m1-device"]');
    expect(device?.textContent).toContain('真机读卡器未连接');
    expect(device?.textContent).toContain('教学模拟');
    expect(el.querySelector('[data-policy="weak"]')).toBeTruthy();
  });

  it('完成授权弹窗后，实操台能推进到识别步骤', async () => {
    const el = await mountStudio();
    (el.querySelector('[data-testid="m1-consent-trigger"]') as HTMLElement).click();
    await nextTick();
    expect(el.querySelector('[data-testid="m1-consent-dialog"]')).toBeTruthy();
    (el.querySelector('[data-testid="m1-consent-confirm"]') as HTMLElement).click();
    await nextTick();

    (el.querySelector('[data-testid="m1-action"]') as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    expect(el.querySelector('[data-testid="m1-step-1"]')).toBeTruthy();
  });
});
