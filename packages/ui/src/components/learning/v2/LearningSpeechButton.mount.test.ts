// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import LearningSpeechButton from './LearningSpeechButton.vue';

const speechState = vi.hoisted(() => ({
  supported: true,
  native: false,
  start: vi.fn(),
  stop: vi.fn(),
  active: null as null | { value: boolean },
}));

vi.mock('../../../composables/useZhSpeech', async () => {
  const { ref } = await import('vue');
  const active = ref(false);
  speechState.active = active;
  speechState.start.mockImplementation(() => { active.value = true; });
  speechState.stop.mockImplementation(() => { active.value = false; });
  return {
    useZhSpeech: () => ({
      active,
      start: speechState.start,
      stop: speechState.stop,
    }),
    zhSpeechSupported: () => speechState.supported,
    splitZhSentences: (text: string) => text.split('。').filter(Boolean).map((part) => `${part}。`),
  };
});

vi.mock('../../../utils/nativeTts', () => ({
  getNativeTts: () => speechState.native ? {} : null,
}));

let app: App | null = null;

function mountButton(text = '原文。注释。') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(LearningSpeechButton, { text, label: '朗读本页' });
  app.mount(host);
  return host;
}

beforeEach(() => {
  speechState.supported = true;
  speechState.native = false;
  if (speechState.active) speechState.active.value = false;
  speechState.start.mockClear();
  speechState.stop.mockClear();
});

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
});

describe('LearningSpeechButton', () => {
  it('starts a sentence queue and exposes the active stop state', async () => {
    const host = mountButton();
    (host.querySelector('button') as HTMLButtonElement).click();
    await nextTick();

    expect(speechState.start).toHaveBeenCalledWith(['原文。', '注释。'], { loop: 'none' });
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('停止朗读');
  });

  it('shows an explicit reason when no Chinese speech engine is available', async () => {
    speechState.supported = false;
    const host = mountButton();
    (host.querySelector('button') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('没有可用的中文语音');
    expect(speechState.start).not.toHaveBeenCalled();
  });
});
