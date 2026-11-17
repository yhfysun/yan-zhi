// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import CyberSecurityWorkbench from './CyberSecurityWorkbench.vue';

const apiState = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('../../api/client', () => ({ api: { get: apiState.get } }));

let app: App | null = null;

beforeEach(() => {
  apiState.get.mockResolvedValue({
    data: [{
      id: 'entry',
      name: '安全入门',
      level: '入门',
      description: '从授权边界开始。',
      audience: '初学者',
      prerequisites: [],
      nextPathIds: [],
      tags: ['入门'],
      modules: [{
        id: 'module-1',
        title: '威胁建模',
        summary: '先回答保护什么。',
        useCase: '为一个新系统建立边界。',
        explanation: '威胁建模是持续回答保护对象、攻击路径和控制措施的过程。',
        topics: ['资产', '威胁', '控制'],
        lesson: {
          objectives: ['能列出四类问题'],
          keyTerms: [{ term: 'STRIDE', explanation: '六类威胁的检查表。' }],
          walkthrough: [],
          knowledgeChecks: [],
        },
        risk: '边界不清导致漏项。',
        control: '在评审中固定检查清单。',
      }],
    }],
  });
});

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('CyberSecurityWorkbench', () => {
  it('teleports the immersive lesson to the viewport so no course content can remain underneath it', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(CyberSecurityWorkbench, { pathId: 'entry' });
    app.mount(host);
    await vi.waitFor(() => expect(host.querySelector('.sec-module-start')).toBeTruthy());

    (host.querySelector('.sec-module-start') as HTMLButtonElement).click();
    await nextTick();
    await nextTick();

    const focus = document.body.querySelector('.sec-focus') as HTMLElement;
    expect(focus).toBeTruthy();
    expect(focus.parentElement).toBe(document.body);
    expect(host.querySelector('.sec-focus')).toBeNull();
  });
});
