// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import MedicalPracticeStudio from './MedicalPracticeStudio.vue';

let app: App | null = null;

function mountStudio(): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  app = createApp(MedicalPracticeStudio, {
    courseName: '中医 · 医学通识与安全边界',
  });
  app.mount(host);
  return host;
}

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
});

describe('MedicalPracticeStudio', () => {
  it('keeps synthetic cases, both medicine branches and emergency boundaries explicit', () => {
    const host = mountStudio();
    expect(host.querySelector('[data-medical-studio]')).toBeTruthy();
    expect(host.textContent).toContain('病例 A · 活动中的胸部压迫感');
    expect(host.textContent).toContain('中医学习视角');
    expect(host.textContent).toContain('西医学习视角');
    expect(host.textContent).toContain('立即联系当地急救系统');
    expect(host.textContent).toContain('不评估任何真实个人的病情');
  });

  it('switches fixed cases and generates a non-prescriptive learning summary', async () => {
    const host = mountStudio();
    const cases = [...host.querySelectorAll('.medical-case-switcher button')] as HTMLButtonElement[];
    cases[2].click();
    await nextTick();
    expect(host.textContent).toContain('病例 C · 慢病随访记录');
    expect(host.textContent).toContain('不能根据课程或网络文章自行停药');

    const checks = [...host.querySelectorAll('.medical-observation input[type="checkbox"]')] as HTMLInputElement[];
    checks[0].checked = true;
    checks[0].dispatchEvent(new Event('change', { bubbles: true }));
    checks[1].checked = true;
    checks[1].dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();

    const generate = [...host.querySelectorAll('.medical-communication-actions button')]
      .find((button) => button.textContent?.includes('生成学习摘要')) as HTMLButtonElement;
    expect(generate.disabled).toBe(false);
    generate.click();
    await nextTick();

    expect(host.querySelector('.medical-communication pre')?.textContent).toContain('学习摘要');
    expect(host.querySelector('.medical-communication pre')?.textContent).toContain('不构成对真人的诊断');
    expect(host.querySelector('.medical-communication pre')?.textContent).not.toContain('处方：');
  });

  it('opens all five anatomical atlas layers and keeps the schematic boundary visible', async () => {
    const host = mountStudio();
    const atlasButton = [...host.querySelectorAll('.medical-workspace-switcher button')]
      .find((button) => button.textContent?.includes('人体图鉴')) as HTMLButtonElement;
    atlasButton.click();
    await nextTick();

    expect(host.querySelector('[data-medical-atlas]')).toBeTruthy();
    expect(host.textContent).toContain('先看位置，再读病例');
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(5);
    expect(host.textContent).toContain('内脏分布');
    expect(host.textContent).toContain('骨骼');
    expect(host.textContent).toContain('血脉循环');
    expect(host.textContent).toContain('经络穴位');

    const meridianTab = [...host.querySelectorAll('[role="tab"]')]
      .find((button) => button.textContent?.includes('经络穴位')) as HTMLButtonElement;
    meridianTab.click();
    await nextTick();
    expect(host.textContent).toContain('百会');
    expect(host.textContent).toContain('合谷');
    expect(host.textContent).toContain('不依据此图自行针刺');
  });

  it('opens the anatomy challenges from the same medical practice workspace', async () => {
    const host = mountStudio();
    const gameButton = [...host.querySelectorAll('.medical-workspace-switcher button')]
      .find((button) => button.textContent?.includes('解剖小游戏')) as HTMLButtonElement;
    gameButton.click();
    await nextTick();

    expect(host.querySelector('[data-medical-anatomy-game]')).toBeTruthy();
    expect(host.textContent).toContain('骨骼拼装');
    expect(host.textContent).toContain('器官归位');
    expect(host.textContent).toContain('动物结构配对');
  });
});
