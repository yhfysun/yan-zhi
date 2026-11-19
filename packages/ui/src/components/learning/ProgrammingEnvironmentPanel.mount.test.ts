// @vitest-environment jsdom
import { createApp, nextTick, type App } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { PROGRAMMING_PROJECTS } from '@yan-zhi/shared';
import ProgrammingEnvironmentPanel from './ProgrammingEnvironmentPanel.vue';

const apiState = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  api: {
    post: apiState.post,
    get: vi.fn(),
  },
}));

let app: App | null = null;

beforeEach(() => {
  apiState.post.mockReset();
  apiState.post.mockImplementation(async (url: string) => {
    if (url === '/env/detect') {
      return {
        data: {
          suggested: {},
          tools: [
            { id: 'java', label: 'Java (JDK)', path: 'C:/jdk-21', version: '21.0.4', ok: true, error: '' },
            { id: 'python', label: 'Python', path: 'C:/Python/python.exe', version: '3.12.4', ok: true, error: '' },
            { id: 'node', label: 'Node.js', path: 'C:/node/node.exe', version: '22.14.0', ok: true, error: '' },
            { id: 'c', label: 'C 编译器', path: '', version: '', ok: false, error: '未找到 gcc / clang' },
          ],
        },
      };
    }
    if (url === '/env/projects/scaffold') {
      return {
        data: {
          projectId: 'studio-site',
          path: 'C:/data/learning-projects/studio-site',
          created: true,
          files: Array.from({ length: 18 }, (_, index) => `file-${index}.md`),
          nextCommands: ['node scripts/check-env.mjs', 'pnpm install'],
        },
      };
    }
    return { data: { ok: true } };
  });
});

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
});

describe('ProgrammingEnvironmentPanel', () => {
  it('detects local Java, Python, Node, C and C++ tools and exposes official channels', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(ProgrammingEnvironmentPanel);
    app.use(createPinia());
    app.mount(host);

    (host.querySelector('.programming-environment-head > button') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(host.textContent).toContain('21.0.4'));
    expect(host.textContent).toContain('3.12.4');
    expect(host.textContent).toContain('22.14.0');
    expect(host.textContent).toContain('未检测到，请安装或配置路径');
    expect(host.querySelectorAll('.programming-environment-card a')).toHaveLength(12);
  });

  it('creates a safe project scaffold and exposes the generated stage files and commands', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(ProgrammingEnvironmentPanel, { project: PROGRAMMING_PROJECTS[0] });
    app.use(createPinia());
    app.mount(host);

    (host.querySelector('.programming-scaffold > header > button') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(host.textContent).toContain('训练工程已创建'));
    expect(host.textContent).toContain('C:/data/learning-projects/studio-site');
    expect(host.textContent).toContain('node scripts/check-env.mjs');
    expect(host.textContent).toContain('在代码工作台打开');
    expect(apiState.post).toHaveBeenCalledWith('/env/projects/scaffold', { projectId: 'studio-site' });
  });
});
