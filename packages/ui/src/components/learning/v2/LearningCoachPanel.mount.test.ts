// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import LearningCoachPanel from './LearningCoachPanel.vue';

const storeState = vi.hoisted(() => ({
  createConversation: vi.fn(async () => 'conv-1'),
  loadMessages: vi.fn(async () => {}),
  sendMessage: vi.fn(async () => {}),
  ensurePlatforms: vi.fn(async () => {}),
  ensureModels: vi.fn(async () => {}),
  chat: {
    messagesByConv: {} as Record<string, Array<{ id: string; role: string; content: string }>>,
    isConvStreaming: vi.fn(() => false),
  },
  platform: {
    models: [{ id: 'model-1', platformId: 'platform-1' }],
    platforms: [{ id: 'platform-1' }],
  },
}));

vi.mock('../../../stores', () => ({
  useChatStore: () => ({
    messagesByConv: storeState.chat.messagesByConv,
    isConvStreaming: storeState.chat.isConvStreaming,
    createConversation: storeState.createConversation,
    loadMessages: storeState.loadMessages,
    sendMessage: storeState.sendMessage,
  }),
  usePlatformStore: () => ({
    models: storeState.platform.models,
    platforms: storeState.platform.platforms,
    ensurePlatforms: storeState.ensurePlatforms,
    ensureModels: storeState.ensureModels,
  }),
}));

let app: App | null = null;

function mountPanel(subjectKey = 'party', subjectName = '党史') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(LearningCoachPanel, {
    subjectKey,
    subjectName,
    courseName: '遵义会议',
    opening: '先说说你对这次转折的理解。',
    prompts: ['帮我核对证据', '追问我一个关键点'],
    reference: '《中国共产党简史》',
  });
  app.mount(host);
  return host;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  storeState.chat.messagesByConv = {};
});

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('LearningCoachPanel', () => {
  it('sends a real course-scoped conversation instead of leaving the prompt button inert', async () => {
    const host = mountPanel();
    const prompt = [...host.querySelectorAll('.lv2-coach-prompts button')]
      .find((button) => button.textContent?.includes('核对证据')) as HTMLButtonElement;
    prompt.click();

    await vi.waitFor(() => expect(storeState.sendMessage).toHaveBeenCalledTimes(1));
    expect(storeState.createConversation).toHaveBeenCalledWith('党史陪练', expect.objectContaining({
      agentId: 'a_builtin_learning_subject_coach',
      source: 'learning',
      sourceMeta: expect.objectContaining({
        learningSubject: '党史',
        learningCourseId: '遵义会议',
      }),
    }));
    const sent = storeState.sendMessage.mock.calls[0] as unknown[];
    expect(String(sent[0])).toContain('科目：党史');
    expect(String(sent[0])).toContain('课程：遵义会议');
    expect(localStorage.getItem('yz.learning.v2.coach.party.v1')).toBe('conv-1');
  });

  it('keeps specialized existing agents for traditional culture and Zhouyi', async () => {
    const host = mountPanel('zhouyi', '周易');
    (host.querySelector('.lv2-coach-prompts button') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(storeState.createConversation).toHaveBeenCalled());
    expect(storeState.createConversation).toHaveBeenLastCalledWith('周易陪练', expect.objectContaining({
      agentId: 'a_builtin_zhouyi_coach',
    }));
  });

  it('shows a visible error when no model is configured', async () => {
    storeState.platform.models.splice(0, storeState.platform.models.length);
    const host = mountPanel();
    (host.querySelector('.lv2-coach-prompts button') as HTMLButtonElement).click();
    await nextTick();

    await vi.waitFor(() => {
      expect(host.querySelector('.lv2-coach-error')?.textContent).toContain('还没有可用的 AI 模型');
    });
  });
});
