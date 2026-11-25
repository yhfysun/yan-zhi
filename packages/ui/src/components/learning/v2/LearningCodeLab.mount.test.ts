// @vitest-environment jsdom
import { createApp, nextTick, type App } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import {
  getLearningV2CoursePlan,
} from '@yan-zhi/shared';
import type { LearningV2CodeLab } from '@yan-zhi/shared';
import LearningCodeLab from './LearningCodeLab.vue';

const apiState = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../../../api/client', () => ({
  api: {
    get: (...args: unknown[]) => apiState.get(...args),
    post: (...args: unknown[]) => apiState.post(...args),
  },
}));

let app: App | null = null;
let javaDetected = false;

const javaLab = getLearningV2CoursePlan(
  'programming',
  'Java 零基础：JDK、IDE 与第一个程序',
).codeLab!;
const nodeLab = getLearningV2CoursePlan(
  'programming',
  'JavaScript · 运行环境、工具链与第一段代码：浏览器脚本、模块与 Node 进程',
).codeLab!;
const goLab = getLearningV2CoursePlan(
  'programming',
  'Go · Go 工具链、模块与第一个服务：第一组 go test 与基准',
).codeLab!;
const htmlLab: LearningV2CodeLab = {
  title: 'HTML 代码台 · 语义页面与窄屏布局',
  description: '在隔离浏览器沙箱中渲染真实 HTML 与 CSS。',
  runtimeLabel: 'HTML / CSS 浏览器沙箱',
  installSteps: [],
  languages: ['html'],
  practice: {
    id: 'html-preview-guided',
    title: '跟做：语义页面',
    brief: '修改页面标题与列表，刷新预览。',
    defaultLanguage: 'html',
    starterCode: {
      html: '<!doctype html><html><body><main><h1>课程</h1><ul><li>HTML</li></ul></main></body></html>',
    },
    checkpoint: '标题为课程，列表存在一项。',
  },
  apply: {
    id: 'html-preview-independent',
    title: '独立实践：窄屏页面',
    brief: '加入 viewport 与响应式卡片。',
    defaultLanguage: 'html',
    starterCode: {
      html: '<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><main><h1>响应式</h1></main></body></html>',
    },
    checkpoint: '页面在 390px 无横向溢出。',
  },
};

beforeEach(() => {
  localStorage.clear();
  javaDetected = false;
  apiState.get.mockReset();
  apiState.post.mockReset();

  apiState.get.mockImplementation(async (url: string) => {
    if (url === '/env/code-runtimes') {
      return {
        data: [
          {
            id: 'javascript',
            label: 'JavaScript / Node.js',
            available: true,
            version: '24.18.1',
            detail: '应用内置 Node.js',
            bundled: true,
          },
          {
            id: 'java',
            label: 'Java',
            available: javaDetected,
            version: javaDetected ? '21.0.4' : '',
            detail: javaDetected ? 'C:/jdk-21/bin/java.exe' : '需要完整 JDK（java + javac）',
            bundled: false,
          },
          {
            id: 'go',
            label: 'Go',
            available: true,
            version: '1.25.4',
            detail: 'C:/Program Files/Go/bin/go.exe',
            bundled: false,
          },
        ],
      };
    }
    throw new Error(`unexpected GET ${url}`);
  });

  apiState.post.mockImplementation(async (url: string) => {
    if (url === '/env/detect') {
      return {
        data: {
          suggested: {},
          tools: [
            {
              id: 'java',
              label: 'Java (JDK)',
              path: javaDetected ? 'C:/jdk-21' : '',
              version: javaDetected ? '21.0.4' : '',
              ok: javaDetected,
              error: javaDetected ? '' : '未找到 java / javac',
            },
          ],
        },
      };
    }
    if (url === '/env/run-code') {
      return {
        data: {
          ok: true,
          language: 'java',
          stdout: 'JDK 版本: 21.0.4\njava.home: C:/jdk-21\n第一段 Java 程序已运行。\n',
          stderr: '',
          compileOutput: '',
          exitCode: 0,
          timedOut: false,
          durationMs: 126,
          runtime: 'C:/jdk-21/bin/java.exe',
        },
      };
    }
    throw new Error(`unexpected POST ${url}`);
  });
});

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
});

async function mountLab(
  mode: 'practice' | 'apply' = 'apply',
  lab = javaLab,
  courseName = 'Java 零基础：JDK、IDE 与第一个程序',
) {
  const completed = vi.fn();
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(LearningCodeLab, {
    lab,
    mode,
    courseName,
    onCompleted: completed,
  });
  app.use(createPinia());
  app.mount(host);
  await nextTick();
  if (lab.languages.some((id) => id !== 'html')) {
    await vi.waitFor(() => expect(apiState.get).toHaveBeenCalledWith('/env/code-runtimes'));
    await vi.waitFor(() => expect(apiState.get).toHaveBeenCalledTimes(2));
  }
  return { host, completed };
}

describe('LearningCodeLab', () => {
  it('reports Node as the active runtime without leaking the Java setup copy', async () => {
    const { host } = await mountLab(
      'apply',
      nodeLab,
      'JavaScript · 运行环境、工具链与第一段代码：浏览器脚本、模块与 Node 进程',
    );

    await vi.waitFor(() => expect(host.textContent).toContain('Node.js 内置运行时 已就绪'));
    expect(host.querySelector('[data-runtime-setup]')).toBeNull();
    expect(host.textContent).not.toContain('javac');
    expect((host.querySelector('[data-action="learning-code-run"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('reports Go as the active runtime with main.go and no Java setup copy', async () => {
    const { host } = await mountLab(
      'apply',
      goLab,
      'Go · Go 工具链、模块与第一个服务：第一组 go test 与基准',
    );

    await vi.waitFor(() => expect(host.textContent).toContain('标准库 已就绪'));
    expect(host.querySelector('[data-runtime-setup]')).toBeNull();
    expect(host.textContent).not.toContain('javac');
    expect(host.textContent).toContain('main.go');
    expect((host.querySelector('[data-action="learning-code-run"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders HTML in a sandboxed preview without calling the server runner', async () => {
    const { host } = await mountLab('apply', htmlLab, 'HTML 课程');

    await vi.waitFor(() => {
      expect((host.querySelector('[data-action="learning-code-run"]') as HTMLButtonElement).disabled).toBe(false);
    });
    expect(host.textContent).toContain('HTML / CSS 浏览器沙箱 已接入');
    expect(host.textContent).toContain('index.html');
    const frame = host.querySelector('iframe') as HTMLIFrameElement;
    expect(frame).toBeTruthy();
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain('响应式');

    (host.querySelector('[data-action="learning-code-run"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(host.textContent).toContain('隔离浏览器预览已刷新'));
    expect(apiState.post).not.toHaveBeenCalledWith('/env/run-code', expect.anything());
  });

  it('shows an honest JDK setup state before allowing Java code to run', async () => {
    const { host } = await mountLab();

    await vi.waitFor(() => expect(host.textContent).toContain('未检测到完整 JDK'));
    expect(host.querySelector('[data-runtime-setup]')).toBeTruthy();
    expect(host.querySelector('[data-runtime-download]')?.getAttribute('href')).toContain('adoptium.net');
    expect((host.querySelector('[data-action="learning-code-run"]') as HTMLButtonElement).disabled).toBe(true);
    expect(apiState.post).toHaveBeenCalledWith('/env/detect', {});

    javaDetected = true;
    const detectButton = host.querySelector('[data-action="learning-code-detect"]') as HTMLButtonElement;
    await vi.waitFor(() => expect(detectButton.disabled).toBe(false));
    detectButton.click();
    await vi.waitFor(() => expect(host.textContent).toContain('21.0.4'));

    await vi.waitFor(() => {
      expect((host.querySelector('[data-action="learning-code-run"]') as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('runs Java inside the lesson, shows compile output and records the evidence', async () => {
    javaDetected = true;
    const { host, completed } = await mountLab('apply');

    await vi.waitFor(() => {
      expect((host.querySelector('[data-action="learning-code-run"]') as HTMLButtonElement).disabled).toBe(false);
    });
    expect(host.textContent).toContain('System.getProperty("java.version")');

    (host.querySelector('[data-action="learning-code-run"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(apiState.post).toHaveBeenCalledWith('/env/run-code', expect.anything()));
    await vi.waitFor(() => expect(host.textContent).toContain('运行通过'));
    expect(apiState.post).toHaveBeenCalledWith('/env/run-code', expect.objectContaining({
      language: 'java',
      source: expect.stringContaining('System.getProperty("java.version")'),
    }));
    expect(host.textContent).toContain('JDK 版本: 21.0.4');

    (host.querySelector('[data-action="learning-code-save-evidence"]') as HTMLButtonElement).click();
    await nextTick();

    expect(completed).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'apply',
      ok: true,
      language: 'java',
      exitCode: 0,
    }));
    expect(host.querySelector('[data-code-evidence-saved]')).toBeTruthy();
    const stored = JSON.parse(localStorage.getItem('yz.learning.v2.code-evidence.v1') || '{}');
    expect(Object.values(stored)).toEqual([
      expect.objectContaining({ courseName: 'Java 零基础：JDK、IDE 与第一个程序', mode: 'apply' }),
    ]);
  });

  it('restores a separate draft for each course and task', async () => {
    javaDetected = true;
    await mountLab('practice');
    await vi.waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('yz.learning.v2.code-drafts.v1') || '{}');
      expect(Object.keys(stored)).toHaveLength(1);
      expect(Object.values(stored)[0]).toEqual(expect.stringContaining('System.getProperty("java.version")'));
    });
  });
});
