// @vitest-environment jsdom
import { createApp, nextTick, type App } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import AlgorithmWorkbench from './AlgorithmWorkbench.vue';
import {
  ALGORITHM_LESSONS,
  ALGORITHM_PRACTICE_PROBLEMS,
  ALGORITHM_TRACKS,
} from '@yan-zhi/shared';

let app: App | null = null;

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
  localStorage.clear();
});

async function mount() {
  const opened: string[] = [];
  const host = document.createElement('div');
  host.id = 'app';
  document.body.appendChild(host);
  app = createApp(AlgorithmWorkbench, {
    onOpenLesson: (courseName: string) => opened.push(courseName),
  });
  app.mount(host);
  await nextTick();
  return { host, opened };
}

describe('AlgorithmWorkbench', () => {
  it('starts with a story-led route instead of a wall of difficult terms', async () => {
    const { host, opened } = await mount();

    expect(host.textContent).toContain('算法与数据结构');
    expect(host.textContent).toContain('先听懂故事');
    expect(host.textContent).toContain('快递分拣站');
    expect(host.querySelectorAll('[data-algorithm-track]')).toHaveLength(ALGORITHM_TRACKS.length);
    expect(host.querySelectorAll('[data-algorithm-lesson]')).toHaveLength(ALGORITHM_LESSONS.length);

    (host.querySelector('[data-algorithm-lesson="a0-01"]') as HTMLButtonElement).click();
    await nextTick();
    expect(opened).toEqual([ALGORITHM_LESSONS[0].courseName]);
  });

  it('shows thousands of beginner-first story problems with pagination and filters', async () => {
    const { host } = await mount();
    ([...host.querySelectorAll('.algorithm-mode-tabs button')]
      .find((button) => button.textContent?.includes('题型实战')) as HTMLButtonElement).click();
    await nextTick();

    expect(host.textContent).toContain('4,320');
    expect(host.querySelectorAll('[data-algorithm-problem]')).toHaveLength(24);
    expect(host.querySelector('[data-algorithm-problem]')?.textContent).toContain('入门');

    const beginner = [...host.querySelectorAll('.algorithm-filter-row button')]
      .find((button) => button.textContent?.trim() === '入门') as HTMLButtonElement;
    beginner.click();
    await nextTick();
    expect(host.querySelectorAll('[data-algorithm-problem]')).toHaveLength(24);
    expect(host.textContent).toContain('/ 1080');
  });

  it('opens one practice step at a time and restores the problem list on exit', async () => {
    const { host } = await mount();
    ([...host.querySelectorAll('.algorithm-mode-tabs button')]
      .find((button) => button.textContent?.includes('题型实战')) as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-algorithm-problem]') as HTMLButtonElement).click();
    await nextTick();

    const dialog = document.querySelector('.algorithm-focus') as HTMLElement;
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain('先听一个小故事');
    expect(dialog.textContent).toContain('1 / 7');
    expect(document.querySelector('#app')?.hasAttribute('inert')).toBe(true);

    const next = [...dialog.querySelectorAll('footer button')]
      .find((button) => button.textContent?.includes('下一步')) as HTMLButtonElement;
    next.click();
    await nextTick();
    expect(dialog.textContent).toContain('把故事画成模型');

    (dialog.querySelector('header button') as HTMLButtonElement).click();
    await nextTick();
    expect(document.querySelector('.algorithm-focus')).toBeNull();
    expect(document.querySelector('#app')?.hasAttribute('inert')).toBe(false);
    expect(ALGORITHM_PRACTICE_PROBLEMS.length).toBe(4320);
  });

  it('opens the principle animation lab from the algorithm overview', async () => {
    const { host } = await mount();
    ([...host.querySelectorAll('.algorithm-mode-tabs button')]
      .find((button) => button.textContent?.includes('原理动画')) as HTMLButtonElement).click();
    await nextTick();

    expect(host.textContent).toContain('让数据自己动起来');
    expect(host.querySelectorAll('[data-algorithm-animation]')).toHaveLength(10);
    expect(host.querySelector('[data-algorithm-animation="graph-bfs"]')).toBeTruthy();
  });
});
