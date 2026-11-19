// @vitest-environment jsdom
import { createApp, nextTick, type App } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AlgorithmAnimationLab from './AlgorithmAnimationLab.vue';
import { ALGORITHM_ANIMATION_SCENES } from './algorithm-animations';

let app: App | null = null;

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

async function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(AlgorithmAnimationLab);
  app.mount(host);
  await nextTick();
  return host;
}

describe('AlgorithmAnimationLab', () => {
  it('covers the main structures and algorithms with steppable scenes', async () => {
    const host = await mount();
    expect(ALGORITHM_ANIMATION_SCENES).toHaveLength(10);
    expect(new Set(ALGORITHM_ANIMATION_SCENES.map((scene) => scene.id)).size).toBe(10);
    expect(host.querySelectorAll('[data-algorithm-animation]')).toHaveLength(10);
    expect(host.textContent).toContain('让数据自己动起来');
    expect(host.textContent).toContain('冒泡排序');
    expect(host.textContent).toContain('第 1 /');
  });

  it('switches scenes and advances one frame at a time', async () => {
    const host = await mount();
    const binary = host.querySelector('[data-algorithm-animation="binary-search"]') as HTMLButtonElement;
    binary.click();
    await nextTick();
    expect(host.textContent).toContain('二分查找');
    expect(host.textContent).toContain('第 1 /');

    const next = [...host.querySelectorAll('button')]
      .find((button) => button.getAttribute('aria-label') === '下一帧') as HTMLButtonElement;
    next.click();
    await nextTick();
    expect(host.textContent).toContain('第 2 /');
    expect(host.textContent).toContain('看正中间');
  });

  it('plays and pauses without leaving the current scene', async () => {
    vi.useFakeTimers();
    const host = await mount();
    const play = [...host.querySelectorAll('button')]
      .find((button) => button.getAttribute('aria-label') === '播放动画') as HTMLButtonElement;
    play.click();
    await nextTick();
    await vi.advanceTimersByTimeAsync(1_150);
    await nextTick();
    expect(host.textContent).toContain('第 2 /');

    const pause = [...host.querySelectorAll('button')]
      .find((button) => button.getAttribute('aria-label') === '暂停动画') as HTMLButtonElement;
    pause.click();
    await nextTick();
    await vi.advanceTimersByTimeAsync(2_500);
    await nextTick();
    expect(host.textContent).toContain('第 2 /');
  });
});
