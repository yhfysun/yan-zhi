// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import MedicalAnatomyGame from './MedicalAnatomyGame.vue';

let app: App | null = null;

function mountGame(): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  app = createApp(MedicalAnatomyGame);
  app.mount(host);
  return host;
}

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
});

describe('MedicalAnatomyGame', () => {
  it('offers assembly, acupoint, history, terminology, evidence and animal challenges', () => {
    const host = mountGame();
    expect(host.querySelector('[data-medical-anatomy-game]')).toBeTruthy();
    expect(host.textContent).toContain('骨骼拼装');
    expect(host.textContent).toContain('器官归位');
    expect(host.textContent).toContain('找穴位');
    expect(host.textContent).toContain('动物结构配对');
    expect(host.textContent).toContain('病程时间轴');
    expect(host.textContent).toContain('医学术语配对');
    expect(host.textContent).toContain('证据来源分拣');
    expect(host.textContent).toContain('不做真实解剖操作');
    expect(host.textContent).toContain('不可据此进行真人或动物操作');
  });

  it('completes the skeleton assembly with keyboard-accessible selection and slots', async () => {
    const host = mountGame();
    const labels = ['颅骨', '胸廓', '脊柱', '上肢骨', '骨盆', '下肢骨'];

    for (const label of labels) {
      const trayButton = [...host.querySelectorAll('.medical-piece-tray button')]
        .find((button) => button.textContent?.includes(label)) as HTMLButtonElement;
      trayButton.click();
      await nextTick();
      const slot = host.querySelector(`[aria-label="${label}空位"]`) as HTMLButtonElement;
      slot.click();
      await nextTick();
    }

    expect(host.textContent).toContain('6 / 6 已归位');
    expect(host.textContent).toContain('全部归位');
  });

  it('matches animal structures and prevents the same feature from being selected twice', async () => {
    const host = mountGame();
    const animalTab = [...host.querySelectorAll('.medical-game-modes button')]
      .find((button) => button.textContent?.includes('动物结构配对')) as HTMLButtonElement;
    animalTab.click();
    await nextTick();

    const dog = [...host.querySelectorAll('.medical-animal-cards button')]
      .find((button) => button.textContent?.includes('犬')) as HTMLButtonElement;
    dog.click();
    await nextTick();
    const dogFeature = [...host.querySelectorAll('.medical-animal-features button')]
      .find((button) => button.textContent?.includes('四足行走')) as HTMLButtonElement;
    dogFeature.click();
    await nextTick();

    expect(host.textContent).toContain('配对正确：犬');
    expect(dogFeature.disabled).toBe(true);
  });

  it('finds acupoints on the schematic body and advances to the next target', async () => {
    const host = mountGame();
    const pointTab = [...host.querySelectorAll('.medical-game-modes button')]
      .find((button) => button.textContent?.includes('找穴位')) as HTMLButtonElement;
    pointTab.click();
    await nextTick();

    expect(host.textContent).toContain('百会');
    expect(host.textContent).toContain('不提供针刺、艾灸、按压或治疗操作');
    const firstPoint = host.querySelector('[aria-label="地图穴位点 1"]') as HTMLButtonElement;
    firstPoint.click();
    await nextTick();

    expect(host.textContent).toContain('定位正确：百会');
    expect(host.textContent).toContain('当前目标');
    expect(host.querySelector('.medical-point-targets h4')?.textContent).toBe('合谷');
  });

  it('orders the synthetic case timeline from onset to today', async () => {
    const host = mountGame();
    const timelineTab = [...host.querySelectorAll('.medical-game-modes button')]
      .find((button) => button.textContent?.includes('病程时间轴')) as HTMLButtonElement;
    timelineTab.click();
    await nextTick();

    for (const fragment of ['三周前', '两周前', '三天前', '今天']) {
      const event = [...host.querySelectorAll('.medical-timeline-pool button')]
        .find((button) => button.textContent?.includes(fragment)) as HTMLButtonElement;
      event.click();
      await nextTick();
    }
    expect(host.textContent).toContain('时间轴完成');
  });

  it('separates source layers and matches medical terms without mixing systems', async () => {
    const host = mountGame();
    const termTab = [...host.querySelectorAll('.medical-game-modes button')]
      .find((button) => button.textContent?.includes('医学术语配对')) as HTMLButtonElement;
    termTab.click();
    await nextTick();
    const term = [...host.querySelectorAll('.medical-term-cards button')]
      .find((button) => button.textContent?.includes('证候')) as HTMLButtonElement;
    const definition = [...host.querySelectorAll('.medical-definition-cards button')]
      .find((button) => button.textContent?.includes('不等同西医病名')) as HTMLButtonElement;
    term.click();
    definition.click();
    await nextTick();
    expect(host.textContent).toContain('配对正确：证候');

    const evidenceTab = [...host.querySelectorAll('.medical-game-modes button')]
      .find((button) => button.textContent?.includes('证据来源分拣')) as HTMLButtonElement;
    evidenceTab.click();
    await nextTick();
    const original = [...host.querySelectorAll('.medical-evidence-cards button')]
      .find((button) => button.textContent?.includes('逐字摘录')) as HTMLButtonElement;
    original.click();
    const originalCategory = [...host.querySelectorAll('.medical-evidence-categories button')]
      .find((button) => button.textContent?.trim() === '原文') as HTMLButtonElement;
    originalCategory.click();
    await nextTick();
    expect(host.textContent).toContain('分拣正确：这条材料属于“原文”');
  });
});
