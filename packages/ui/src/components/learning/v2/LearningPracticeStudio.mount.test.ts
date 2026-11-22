// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import LearningPracticeStudio from './LearningPracticeStudio.vue';

const CALLIGRAPHY_STORE_KEY = 'yz.learning.v2.calligraphy.attempts.v1';
const GENERIC_STORE_KEY = 'yz.learning.v2.generic-practice.v1';

// hanzi-writer 打桩：笔顺数据加载成败由 loadState.fail 控制，避免测试触网。
const loadState = vi.hoisted(() => ({ fail: false }));
vi.mock('hanzi-writer', () => ({
  default: {
    create: (_target: HTMLElement, _glyph: string, options: {
      onLoadCharDataSuccess?: () => void;
      onLoadCharDataError?: () => void;
    }) => {
      queueMicrotask(() => {
        if (loadState.fail) options.onLoadCharDataError?.();
        else options.onLoadCharDataSuccess?.();
      });
      return {
        animateCharacter: vi.fn(),
        quiz: vi.fn(),
        cleanup: vi.fn(),
      };
    },
    loadCharacterData: vi.fn(),
  },
}));

let app: App | null = null;

const practice = {
  task: '围绕九成宫横画完成读帖、摹写和两次临写。',
  output: '一组带自评的临写作品',
  boundary: '只使用公版碑帖与教学画板。',
  features: ['碑帖阅读', '描红', '叠合对照'],
  studio: {
    type: '书写实验',
    title: '碑帖临写台',
    steps: ['读帖', '摹写', '临写', '复盘'],
  },
} as const;

const genericPractice = {
  task: '完成一次受力图和误差复盘。',
  output: '受力图与一页误差复盘',
  boundary: '只使用安全、低速度的日常观察。',
  features: ['测量', '作图', '复盘'],
  studio: {
    type: '通用实践',
    title: '科学观察工作台',
    steps: ['确定观察对象', '记录变量', '解释证据', '复盘误差'],
  },
} as const;

async function mountStudio(
  subjectKey = 'calligraphy',
  studioPractice: typeof practice | typeof genericPractice = practice,
  courseName = '九成宫：横画的起收与重心',
): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(LearningPracticeStudio, {
    subjectKey,
    courseName,
    practice: studioPractice,
  });
  app.use(createPinia());
  app.mount(host);
  await nextTick();
  return host;
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    lineWidth: 1,
    lineCap: 'round',
    lineJoin: 'round',
    strokeStyle: '#000',
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,calligraphy');
});

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('LearningPracticeStudio calligraphy', () => {
  it('shows a vertical model column, rice-grid practice area and source provenance', async () => {
    const host = await mountStudio();

    expect((host.querySelector('[aria-label="字帖选择"]') as HTMLSelectElement).value)
      .toContain('九成宫');
    const column = host.querySelector('[data-calligraphy-column]');
    expect(column?.querySelectorAll('button')).toHaveLength(6);
    expect(column?.querySelector('b')?.textContent).toBe('九');
    expect(column?.querySelector('[data-calligraphy-focus]')).toBeTruthy();
    const grid = host.querySelector('[data-calligraphy-grid]');
    expect(grid?.querySelector('.lv2-calligraphy-tracing')?.textContent).toContain('九');
    expect(host.querySelector('[data-calligraphy-print-sheet]')).toBeTruthy();
    expect(host.querySelectorAll('[data-calligraphy-print-sheet] .lv2-calligraphy-cell')).toHaveLength(6);
    expect(host.querySelector('[data-action="animate-strokes"]')).toBeTruthy();
    expect(host.querySelector('[data-action="quiz-strokes"]')).toBeTruthy();
    expect(host.textContent).toContain('看笔顺');
    expect(host.querySelector('.lv2-calligraphy-source')?.textContent).toContain('九成宫醴泉铭');
    expect(host.querySelector('.lv2-calligraphy-source')?.getAttribute('href')).toMatch(/^https:\/\//);
  });

  it('switches the model character in the rice grid from the vertical column', async () => {
    const host = await mountStudio();

    (host.querySelector('[aria-label="选择范字成"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('[aria-label="选择范字成"]')?.classList.contains('active')).toBe(true);
    expect(host.querySelector('.lv2-calligraphy-tracing')?.textContent).toContain('成');
    expect(host.querySelector('.lv2-calligraphy-grid-panel > header')?.textContent).toContain('成');
    expect(host.querySelector('.lv2-calligraphy-print-sheet .lv2-calligraphy-cell')?.textContent).toContain('成');
  });

  it('plays stroke animation via hanzi-writer and falls back to tracing when data fails', async () => {
    const host = await mountStudio();

    (host.querySelector('[data-action="animate-strokes"]') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await nextTick();

    expect(host.querySelector('[data-calligraphy-fallback]')).toBeNull();
    expect(host.querySelector('.lv2-calligraphy-tracing')).toBeNull();
    expect(host.querySelector('[data-calligraphy-writer]')).toBeTruthy();
    expect(host.textContent).toContain('按笔顺逐笔演示');

    (host.querySelector('[data-action="quiz-strokes"]') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await nextTick();
    expect(host.textContent).not.toContain('正在加载');

    loadState.fail = true;
    const otherHost = await mountStudio();
    (otherHost.querySelector('[data-action="animate-strokes"]') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await nextTick();

    expect(otherHost.querySelector('[data-calligraphy-fallback]')?.textContent).toContain('回退为红色描红');
    expect(otherHost.querySelector('.lv2-calligraphy-tracing')).toBeTruthy();
    loadState.fail = false;
  });

  it('records paper-practice attempts and exposes a comparison of the self-review records', async () => {
    const host = await mountStudio();

    (host.querySelector('[data-action="save-attempt"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-action="save-attempt"]') as HTMLButtonElement).click();
    await nextTick();

    const saved = JSON.parse(localStorage.getItem(CALLIGRAPHY_STORE_KEY) || '[]');
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({
      copybook: expect.stringContaining('九成宫'),
      character: '九',
    });
    expect(saved[0]).not.toHaveProperty('image');
    expect(host.querySelectorAll('.lv2-calligraphy-attempt')).toHaveLength(2);

    (host.querySelector('[data-action="compare-attempts"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-calligraphy-overlay')?.textContent).toContain('第 1 遍');
    expect(host.querySelector('.lv2-calligraphy-overlay')?.textContent).toContain('起笔');
  });

  it('records five self-review dimensions and a single next-attempt target', async () => {
    const host = await mountStudio();
    const ratings = host.querySelectorAll('[data-rating-dimension] input');
    expect(ratings).toHaveLength(5);

    (ratings[0] as HTMLInputElement).value = '4';
    (ratings[0] as HTMLInputElement).dispatchEvent(new Event('input'));
    (host.querySelector('[aria-label="下一遍目标"]') as HTMLSelectElement).value = '起笔';
    (host.querySelector('[aria-label="下一遍目标"]') as HTMLSelectElement)
      .dispatchEvent(new Event('change'));
    await nextTick();

    expect(host.querySelector('[data-rating-dimension="起笔"] output')?.textContent).toBe('4 / 5');
    expect(host.textContent).toContain('下一遍只改：起笔');

    (host.querySelector('[data-action="save-attempt"]') as HTMLButtonElement).click();
    await nextTick();
    const saved = JSON.parse(localStorage.getItem(CALLIGRAPHY_STORE_KEY) || '[]');
    expect(saved[0].ratings).toMatchObject({ 起笔: 4 });
    expect(saved[0].nextTarget).toBe('起笔');
  });

  it('opens the free-zoom original-image viewer and closes it', async () => {
    const host = await mountStudio();

    expect(host.querySelector('[data-viewer="viewport"]')).toBeNull();
    (host.querySelector('[data-action="view-original"]') as HTMLButtonElement).click();
    await nextTick();

    const viewport = host.querySelector('[data-viewer="viewport"]');
    expect(viewport).toBeTruthy();
    expect(host.querySelector('[data-viewer="image"]')?.getAttribute('alt')).toContain('真迹');
    expect(host.querySelector('[data-viewer="zoom-level"]')?.textContent).toBe('100%');

    // 放大按钮：比例上升
    (host.querySelector('[data-viewer="zoom-in"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('[data-viewer="zoom-level"]')?.textContent).not.toBe('100%');

    // 复位：回到 100%
    (host.querySelector('[data-viewer="reset"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('[data-viewer="zoom-level"]')?.textContent).toBe('100%');

    (host.querySelector('[data-viewer="close"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('[data-viewer="viewport"]')).toBeNull();
  });

  it('focuses a model character in the original viewer when clicking it', async () => {
    const host = await mountStudio();

    (host.querySelector('[aria-label="选择范字成"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('[aria-label="选择范字成"]')?.classList.contains('active')).toBe(true);
    expect(host.querySelector('[data-viewer="viewport"]')).toBeTruthy();
    // 聚焦后缩放比例不为 100%（自动放大到该字区域）
    expect(host.querySelector('[data-viewer="zoom-level"]')?.textContent).not.toBe('100%');
  });

  it('keeps an app-style mobile practice toolbar and responsive workbench in CSS', async () => {
    const css = readFileSync(resolve(__dirname, 'LearningPracticeStudio.css'), 'utf8');

    expect(css).toMatch(/\.lv2-calligraphy-mobile-actions/);
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*\.lv2-calligraphy-mobile-actions/);
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*\.lv2-calligraphy-column \{[\s\S]*?flex-direction: row/);
    expect(css).toMatch(/@media print[\s\S]*\.lv2-calligraphy-print-sheet/);
    expect(css).toMatch(/\.lv2-calligraphy-column b \{[\s\S]*?KaiTi/);
    expect(css).toMatch(/\.lv2-calligraphy-grid \{[\s\S]*?aspect-ratio: 1/);
  });
});

describe('LearningPracticeStudio generic practice', () => {
  it('reuses the complete Zhouyi divination workbench instead of the simplified placeholder', async () => {
    const host = await mountStudio('zhouyi', practice, '乾卦精读');

    expect(host.querySelector('.dv-root')).toBeTruthy();
    expect(host.textContent).toContain('梅花易数');
    expect(host.textContent).toContain('大衍筮法');
    expect(host.querySelector('.dv-count')?.textContent).toContain('/5');
    expect(host.textContent).toContain('民俗文化体验 · 教学演示');
  });

  it('advances one practice step at a time instead of exposing a checklist', async () => {
    const host = await mountStudio('physics', genericPractice, '力与牛顿运动定律');
    const current = host.querySelector('.lv2-generic-current') as HTMLElement;

    expect(current.textContent).toContain('1 / 4');
    expect(current.textContent).toContain('确定观察对象');
    expect(host.querySelectorAll('.lv2-generic-current').length).toBe(1);

    (host.querySelector('[data-action="generic-next"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-generic-current')?.textContent).toContain('2 / 4');
    expect(host.querySelector('.lv2-generic-current')?.textContent).toContain('记录变量');
  });

  it('saves an editable output and reflection by subject and course', async () => {
    const host = await mountStudio('physics', genericPractice, '力与牛顿运动定律');
    const output = host.querySelector('[aria-label="实践产出"]') as HTMLTextAreaElement;
    const reflection = host.querySelector('[aria-label="实践反思"]') as HTMLTextAreaElement;

    output.value = '画出了重力、支持力和摩擦力。';
    output.dispatchEvent(new Event('input'));
    reflection.value = '下一次先标正方向，再写分量。';
    reflection.dispatchEvent(new Event('input'));
    (host.querySelector('[data-action="generic-save"]') as HTMLButtonElement).click();
    await nextTick();

    const stored = JSON.parse(localStorage.getItem(GENERIC_STORE_KEY) || '{}');
    expect(stored['physics::力与牛顿运动定律']).toMatchObject({
      stepIndex: 0,
      output: '画出了重力、支持力和摩擦力。',
      reflection: '下一次先标正方向，再写分量。',
    });
    expect(host.textContent).toContain('实践记录已保存');
  });

  it('restores the last step, output and reflection when remounted', async () => {
    localStorage.setItem(GENERIC_STORE_KEY, JSON.stringify({
      'physics::力与牛顿运动定律': {
        stepIndex: 2,
        output: '证据：位移随时间增大。',
        reflection: '需要补采样间隔。',
        savedAt: '2026-11-17T02:00:00.000Z',
      },
    }));

    const host = await mountStudio('physics', genericPractice, '力与牛顿运动定律');

    expect(host.querySelector('.lv2-generic-current')?.textContent).toContain('3 / 4');
    expect((host.querySelector('[aria-label="实践产出"]') as HTMLTextAreaElement).value)
      .toBe('证据：位移随时间增大。');
    expect((host.querySelector('[aria-label="实践反思"]') as HTMLTextAreaElement).value)
      .toBe('需要补采样间隔。');
  });
});
