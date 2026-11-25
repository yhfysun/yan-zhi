// @vitest-environment jsdom
import { createApp, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALGORITHM_PRACTICE_PROBLEMS } from '@yan-zhi/shared';
import AlgorithmCodeLab from './AlgorithmCodeLab.vue';

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  api: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

let app: App | null = null;

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
  localStorage.clear();
  getMock.mockReset();
  postMock.mockReset();
});

async function mount() {
  getMock.mockResolvedValue({
    data: [
      { id: 'javascript', label: 'JavaScript / Node.js', available: true, version: '24.18.1', detail: '内置 Node.js', bundled: true },
      { id: 'typescript', label: 'TypeScript / Node.js', available: true, version: '24.18.1', detail: '原生类型擦除', bundled: true },
      { id: 'python', label: 'Python', available: true, version: '3.13.5', detail: '内置 Python', bundled: true },
      { id: 'java', label: 'Java', available: false, version: '', detail: '需要完整 JDK', bundled: false },
      { id: 'c', label: 'C', available: true, version: '15.2.0', detail: 'gcc', bundled: false },
      { id: 'cpp', label: 'C++', available: true, version: '15.2.0', detail: 'g++', bundled: false },
      { id: 'go', label: 'Go', available: true, version: '1.25.4', detail: 'go', bundled: false },
    ],
  });
  postMock.mockResolvedValue({
    data: {
      ok: true,
      language: 'javascript',
      stdout: '42\n',
      stderr: '',
      compileOutput: '',
      exitCode: 0,
      timedOut: false,
      durationMs: 88,
      runtime: 'Node.js 24.18.1',
    },
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(AlgorithmCodeLab, { problem: ALGORITHM_PRACTICE_PROBLEMS[0] });
  app.use(createPinia());
  app.mount(host);
  await nextTick();
  await vi.waitFor(() => expect(host.textContent).toContain('6 / 7 种语言可用'));
  return host;
}

describe('AlgorithmCodeLab', () => {
  it('loads bundled Node and Python plus detected compilers', async () => {
    const host = await mount();
    expect(getMock).toHaveBeenCalledWith('/env/code-runtimes');
    expect(host.textContent).toContain('JavaScript / Node.js');
    expect(host.textContent).toContain('内置');
    expect(host.textContent).toContain('main.js');
  });

  it('runs code and shows output without leaving the problem', async () => {
    const host = await mount();
    const run = [...host.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('运行代码')) as HTMLButtonElement;
    run.click();
    await vi.waitFor(() => expect(host.textContent).toContain('运行通过'));
    expect(postMock).toHaveBeenCalledWith('/env/run-code', expect.objectContaining({
      language: 'javascript',
      stdin: '',
    }));
    expect(host.textContent).toContain('42');
  });

  it('keeps a per-problem code draft', async () => {
    await mount();
    await vi.waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('yz.algorithms.code.v1') || '{}');
      expect(saved[ALGORITHM_PRACTICE_PROBLEMS[0].id].javascript).toContain("require('node:fs')");
    });
  });
});
