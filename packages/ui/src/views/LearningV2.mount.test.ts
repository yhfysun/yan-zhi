// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import LearningV2 from './LearningV2.vue';
import { setLead, setMode } from '../stores/mode';
import { toggleRegisteredWorkspaceSidebar } from '../stores/workspaceSidebar';

const apiState = vi.hoisted(() => ({
  get: vi.fn(async (_url: string): Promise<any> => ({ data: { lessonIds: [] } })),
  post: vi.fn(async (_url: string, _body?: unknown): Promise<any> => ({ data: { ok: true } })),
}));

vi.mock('../api/client', () => ({
  api: {
    get: apiState.get,
    post: apiState.post,
  },
}));

vi.mock('../components/notes/NoteQuickCreateDialog.vue', () => ({
  default: {
    name: 'NoteQuickCreateDialog',
    props: ['visible', 'title', 'content', 'categoryName'],
    template: '<div data-test="note-dialog"></div>',
  },
}));

vi.mock('../components/chat/ChatMessageList.vue', () => ({
  default: {
    name: 'ChatMessageList',
    template: '<div data-test="learning-chat-messages"><slot name="welcome"></slot></div>',
  },
}));

vi.mock('../components/chat/ChatInputArea.vue', () => ({
  default: {
    name: 'ChatInputArea',
    template: '<div data-test="learning-chat-input"></div>',
  },
}));

vi.mock('../components/learning/CyberSecurityWorkbench.vue', () => ({
  default: {
    name: 'CyberSecurityWorkbench',
    props: ['pathId'],
    emits: ['select-path'],
    template: '<div data-specialized-security>网络安全完整课程</div>',
  },
}));

let app: App | null = null;

beforeEach(() => {
  setMode('learning');
  setLead('learning', 'human');
  localStorage.clear();
  window.history.replaceState({}, '', window.location.href);
  document.body.style.overflow = '';
  apiState.get.mockClear();
  apiState.post.mockClear();
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
            available: true,
            version: '21.0.4',
            detail: 'C:/jdk-21/bin/java.exe',
            bundled: false,
          },
        ],
      };
    }
    return { data: { lessonIds: [] } };
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
              path: 'C:/jdk-21',
              version: '21.0.4',
              ok: true,
              error: '',
            },
          ],
        },
      };
    }
    return { data: { ok: true } };
  });
});

async function mountPage(): Promise<HTMLElement> {
  // Immersive lesson/studio surfaces teleport to <body> so they can escape
  // the application stacking context. Mount the test app at the same root
  // and query through it, matching the real runtime containment.
  const host = document.body;
  app = createApp(LearningV2);
  app.use(createPinia());
  app.mount(host);
  await nextTick();
  await waitForLearningReady(host);
  return host;
}

async function waitForLearningReady(host: ParentNode): Promise<void> {
  await vi.waitFor(() => {
    expect(host.querySelector('.lv2')?.getAttribute('data-learning-ready')).toBe('true');
  });
  await nextTick();
}

afterEach(() => {
  setLead('learning', 'human');
  setMode('office');
  app?.unmount();
  app = null;
  vi.restoreAllMocks();
  localStorage.clear();
  document.body.style.overflow = '';
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('LearningV2', () => {
  it('fills the shell content height and scrolls above the global status bar', () => {
    const css = readFileSync(resolve(__dirname, 'learning-v2.css'), 'utf8');
    const libraryCss = readFileSync(resolve(__dirname, '../components/learning/v2/learning-library.css'), 'utf8');
    const appSource = readFileSync(resolve(__dirname, '../App.vue'), 'utf8');

    expect(css).toMatch(/\.lv2 \{[^}]*height: 100%;[^}]*min-height: 0;/);
    expect(appSource).toContain("'has-statusbar': showStatusBar");
    expect(appSource).toMatch(/\.app-shell\.has-statusbar \{ --app-statusbar-h: 26px; \}/);
    expect(appSource).toMatch(/html\.yz-learning-study \.tab-bar \{ display: none !important; \}/);
    expect(appSource).toMatch(/html\.yz-learning-study \.platform-mobile \.main-content,[\s\S]*?padding-bottom: 0 !important;/);
    for (const selector of ['.lv2-lesson', '.lv2-specialized-study', '.lv2-studio-immersive']) {
      expect(css).toMatch(new RegExp(`${selector.replace('.', '\\.')} \\{[^}]*position: fixed;[^}]*inset: 0;`));
      expect(css).toMatch(new RegExp(`${selector.replace('.', '\\.')} \\{[^}]*height: 100dvh;`));
    }
    expect(css).toMatch(/\.lv2 \{[^}]*background: transparent;/);
    expect(css).toMatch(/\.lv2-subjects \{[^}]*backdrop-filter: blur\(18px\)/);
    expect(css).toMatch(/\.lv2-workspace \{[^}]*background: transparent;/);
    expect(appSource).toMatch(/\.app-shell\.is-learning \{[^}]*background: transparent !important;/);
    expect(css).toMatch(/\.lv2 \{[^}]*grid-template-rows: minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.lv2-subjects \{[^}]*height: 100%;[^}]*min-height: 0;[^}]*overflow: hidden;/);
    expect(css).toMatch(/\.lv2-subject-list \{[^}]*min-height: 0;[^}]*overflow-y: auto;/);
    expect(css).toMatch(/\.lv2-main \{[^}]*min-height: 0;[^}]*display: flex;/);
    expect(css).toMatch(/\.lv2-workspace \{[^}]*min-height: 0;[^}]*flex: 1;[^}]*overflow-y: auto;/);
    expect(css).toMatch(/\.lv2\.study-full \.lv2-workspace\.is-study-surface \{[^}]*width: 100%;[^}]*max-width: none;[^}]*margin: 0;/);
    expect(css).toMatch(/\.lv2\.study-full \.learning-session \{[^}]*border: 0;[^}]*border-radius: 0;/);
    expect(css).toMatch(/\.lv2\.study-full:not\(\.study-lesson\) \.lv2-content \{[^}]*padding: 0;/);
    expect(css).toMatch(/\.lv2-studio-immersive \{[^}]*position: fixed;[^}]*inset: 0;[^}]*overflow: hidden;/);
    expect(css).toMatch(/\.lv2-studio-immersive-body \{[^}]*min-height: 0;[^}]*overflow-y: auto;/);
    expect(css).toMatch(/\.lv2-specialized-study \{[^}]*background: var\(--skin-panel-bg-strong/);
    expect(css).not.toMatch(/\.lv2-specialized-study-surface \{[^}]*backdrop-filter/);
    expect(css).toMatch(/\.lv2-subject-list \{[^}]*scrollbar-width: thin;/);
    expect(css).toMatch(/\.lv2-subject-list::-webkit-scrollbar \{[^}]*width: 8px;/);
    expect(css).toMatch(/\.lv2-library-shell \{[^}]*width: 100%;[^}]*align-items: stretch;/);
    expect(libraryCss).toMatch(/\.ll-library \{[^}]*width: 100%;[^}]*height: 100%;/);
    // 学习态（尤其移动端）隐藏滚动条，保留滚动能力但不显示亮色轨道
    expect(css).toMatch(/html\.yz-learning-study \.lv2 \*::-webkit-scrollbar \{[^}]*display: none/);
    expect(css).toMatch(/@media \(max-width: 900px\) \{[\s\S]*?\.lv2 \*::-webkit-scrollbar \{[^}]*display: none/);
    expect(css).toMatch(/@media \(max-width: 900px\) \{[\s\S]*?\.lv2-lesson-body > \.rpane \{ display: none; \}/);
    expect(css).toMatch(/:global\(\.lv2-ai-select-popper\.el-popper\) \{[\s\S]*?max-width: calc\(100vw - 24px\);/);
    expect(css).toMatch(/:global\(\.lv2-ai-select-popper \.el-select-dropdown__item\) \{[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;/);
    // 深色皮肤下实践/练习页必须整组覆盖组件令牌，避免灰底灰字
    expect(css).toMatch(/html\[data-skin="on"\] \.lv2\.study-full:not\(\.study-lesson\)[\s\S]*?--lv2-note-ink: #30433a/);
    // 2026-11-23 实报：图书馆皮肤补丁曾把背景刷成深色 --skin-surface，但深字 color:#17211e 未配对 → 深字压深底。
    // 契约：皮肤模式下 .ll-library 子树把 --el-* 钉成浅色纸面，背景与深字配对。
    const librarySkin = css.match(/html\[data-skin="on"\] \.ll-library \{[\s\S]*?\n\}/)?.[0] || '';
    expect(librarySkin).toContain('--el-bg-color: #fff');
    expect(librarySkin).toContain('--el-fill-color-light: #f7f8f7');
    expect(librarySkin).toContain('background: #f4f7f4');
    expect(librarySkin).toContain('color: #17211e');
    expect(librarySkin).not.toMatch(/background:\s*var\(--skin-surface/);
    // 2026-11-23 实报：11-21 的深色 veil 补丁在 study-full 浅色纸面上造成「深卡+白框+白底红字」混搭，已移除。
    // 契约：不得再有直接刷 .lv2-quiz 卡片本体的深色 veil/backdrop 规则（选项/清单回落到 study-full 浅令牌）。
    expect(css).not.toMatch(/\[data-skin="on"\] \.lv2-quiz \{[^}]*--skin-popover-veil/);
    expect(css).not.toMatch(/\[data-skin="on"\] \.lv2-quiz \{[^}]*backdrop-filter/);
  });

  it('gives the mobile learning session a bounded fourth row and touch scrolling', () => {
    const shell = readFileSync(
      resolve(__dirname, '../components/learning/v2/LearningSessionShell.vue'),
      'utf8',
    );
    const mobile = shell.match(/@media \(max-width: 900px\) \{[\s\S]*?@media \(max-width: 370px\)/)
      ?.[0] || '';

    expect(mobile).toMatch(/\.learning-session \{[^}]*grid-template-rows: auto auto auto minmax\(0, 1fr\);/);
    expect(mobile).toMatch(/\.session-surface \{[^}]*min-height: 0;[^}]*overflow-y: auto;[^}]*touch-action: pan-y;/s);
  });

  it('keeps one centered desktop quick-action set and a wide learning composer', () => {
    const css = readFileSync(resolve(__dirname, 'learning-v2.css'), 'utf8');
    const view = readFileSync(resolve(__dirname, 'LearningV2.vue'), 'utf8');

    expect(view).not.toContain('lv2-ai-quick-strip');
    expect(css).toMatch(/\.lv2-ai-welcome-prompts \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s);
    expect(css).toMatch(/\.lv2-ai-welcome \{[^}]*align-items: center;[^}]*text-align: center;/s);
    expect(css).toMatch(/\.lv2-ai-messages :deep\(\.messages\) \{[^}]*max-width: min\(1180px, calc\(100% - 32px\)\);/s);
    expect(css).toMatch(/\.lv2-ai-composer :deep\(\.input-area\) \{[^}]*max-width: min\(1180px, calc\(100% - 32px\)\);/s);
  });

  it('uses neutral surfaces for course selection instead of flooding the page with subject tint', () => {
    const css = readFileSync(resolve(__dirname, 'learning-v2.css'), 'utf8');
    const libraryCss = readFileSync(resolve(__dirname, '../components/learning/v2/learning-library.css'), 'utf8');

    // 中性高亮必须跟随皮肤明暗 + 半透明透出壁纸，禁止硬编码浅色白块（深色皮肤下会盖住壁纸）
    expect(css).toMatch(/\.lv2-subject:hover, \.lv2-subject\.active \{[^}]*background: color-mix\(in srgb, var\(--skin-surface-raised/);
    expect(css).not.toMatch(/\.lv2-subject:hover, \.lv2-subject\.active \{[^}]*background: #f[0-9a-f]{5};/);
    expect(css).toMatch(/\.lv2-subject\.active \{[^}]*box-shadow: inset 3px 0 var\(--lv2-accent\);/);
    expect(css).toMatch(/\.lv2-roadmap-track \{[^}]*background: color-mix/);
    expect(css).toMatch(/\.lv2-roadmap-list > button\.active \{[^}]*background: color-mix/);
    // 书籍图层按钮、移动端工具/课程卡/科目抽屉的选中态同样禁止硬编码白块
    for (const selector of [
      '.lv2-book-layers button.active',
      '.lv2-mobile-tools button.active',
      '.lv2-mobile-course-strip > div button.active',
      '.lv2-mobile-subject-sheet .lv2-mobile-subject-entry.active',
    ]) {
      const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(css).toMatch(new RegExp(`${esc} \\{[^}]*background: color-mix\\(in srgb, var\\(--skin-surface-raised`));
    }
    // 沉浸学习层的独立白底阅读表面是有意设计，不被上面的规则误伤
    expect(css).toMatch(/\.lv2-lesson > nav button\.active \{ background: #edf3ef; color: #18231f; \}/);
    expect(libraryCss).toMatch(/\.ll-nav nav button\.active \{[^}]*background: #f1f4f2;[^}]*color: #26352f;/);
    expect(libraryCss).toMatch(/\.ll-detail-actions button:last-child[^{]*\{[^}]*background: #17211e;/);
  });

  it('uses an underline learning tab bar with readable skin-mode selection colors', () => {
    const css = readFileSync(resolve(__dirname, 'learning-v2.css'), 'utf8');

    expect(css).toMatch(/\.lv2-pages button\.active \{[^}]*background: transparent;[^}]*color: var\(--lv2-accent\);/);
    expect(css).not.toMatch(/\.lv2-pages button\.active \{[^}]*background: #17211e;/);
    expect(css).toMatch(/\.lv2-pages button\.active::after \{[^}]*background: currentColor;/);
    expect(css).toMatch(/html\[data-skin="on"\] \.lv2 \.lv2-pages button\.active \{[^}]*color: var\(--lv2-accent\);/);
    expect(css).toMatch(/\.lv2-session-practice-layout \{[^}]*grid-template-columns: 240px minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.lv2-session-stage-rail \{[^}]*overflow-y: auto;[^}]*border: 1px solid #d7ddd7;/);
    expect(css).toMatch(/\.lv2-lesson-notes > header \{[^}]*padding: 0 0 10px 32px;/);
  });

  it('keeps lesson speech and note actions on the same aligned control row', () => {
    const css = readFileSync(resolve(__dirname, 'learning-v2.css'), 'utf8');
    const view = readFileSync(resolve(__dirname, 'LearningV2.vue'), 'utf8');

    expect(view).toContain('class="lv2-lesson-note-action"');
    expect(css).toMatch(/\.lv2-lesson-actions > \.lv2-speech \{[^}]*flex: 0 0 108px;[^}]*width: 108px;[^}]*align-items: stretch;/s);
    expect(css).toMatch(/\.lv2-lesson-actions > \.lv2-speech :deep\(\.lv2-speech-button\),\s*\.lv2-lesson-body > article \.lv2-lesson-actions > \.lv2-lesson-note-action \{[^}]*width: 108px;[^}]*height: 38px;[^}]*min-height: 38px;[^}]*margin-top: 0;[^}]*justify-content: center;[^}]*font-size: 10px;/s);
  });

  it('keeps desktop lesson side panes independently scrollable with hidden scrollbars', () => {
    const pane = readFileSync(
      resolve(__dirname, '../components/learning/v2/ResizablePane.vue'),
      'utf8',
    );

    expect(pane).toMatch(/\.rpane-content \{[^}]*overflow-y: auto;[^}]*scrollbar-width: none;/);
    expect(pane).toMatch(/\.rpane-content::-webkit-scrollbar \{[^}]*display: none;[^}]*width: 0;/);
  });

  it('keeps horizontal course rails on a themed thin scrollbar instead of a native white bar', () => {
    const files = [
      '../components/learning/CultureWorkbench.vue',
      '../components/learning/CyberSecurityWorkbench.vue',
      '../components/learning/M1NfcCopyLab.vue',
      '../components/learning/MusicWorkbench.vue',
      '../components/learning/ProgrammingProjectHub.vue',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(__dirname, file), 'utf8');
      // 每个横滑轨道都必须自带 WebKit 细滚动条定制（仅靠全局皮肤样式在深色壁纸下会露白条）
      expect(source, file).toMatch(/::-webkit-scrollbar \{ height: 6px; \}/);
      expect(source, file).toMatch(/::-webkit-scrollbar-thumb \{[^}]*border-radius: 999px/);
      expect(source, file).toMatch(/scrollbar-color: color-mix/);
    }
  });

  it('hides the programming route strip scrollbar while keeping it scrollable', () => {
    const source = readFileSync(resolve(__dirname, '../components/learning/ProgrammingCourseHub.vue'), 'utf8');
    // 2026-11-21 用户要求：路线横滑条不显示滚动条（保留滚动能力）
    expect(source).toMatch(/scrollbar-width: none/);
    expect(source).toMatch(/\.programming-route-strip::-webkit-scrollbar \{ display: none; \}/);
  });

  it('keeps every specialized immersive workbench above the global status bar', () => {
    for (const file of [
      '../components/learning/EnglishPathWorkbench.vue',
      '../components/learning/CyberSecurityWorkbench.vue',
      '../components/learning/CultureWorkbench.vue',
      '../components/learning/MusicWorkbench.vue',
      '../components/learning/zhouyi/ZhouyiWorkbench.vue',
    ]) {
      const source = readFileSync(resolve(__dirname, file), 'utf8');
      expect(source, file).toContain('bottom: var(--app-statusbar-h, 0px);');
    }
    const english = readFileSync(resolve(__dirname, '../components/learning/EnglishPathWorkbench.vue'), 'utf8');
    expect(english).toContain('<Teleport to="body">');
    expect(english).not.toContain(':disabled="!isNarrowViewport"');
  });

  it('resets the workspace scroll position when switching learning surfaces', async () => {
    const host = await mountPage();
    const workspace = host.querySelector('.lv2-workspace') as HTMLElement;
    workspace.scrollTop = 240;

    (host.querySelector('.lv2-pages [data-page="roadmap"]') as HTMLButtonElement).click();
    await nextTick();
    await nextTick();

    expect(workspace.scrollTop).toBe(0);
  });

  it('opens the selected course in one click from the up-next strip', async () => {
    const host = await mountPage();
    const course = host.querySelector('.lv2-upnext button') as HTMLButtonElement;
    const title = course.querySelector('b')?.textContent || '';

    course.click();
    await nextTick();

    expect(host.querySelector('.lv2-lesson')).toBeTruthy();
    expect(host.querySelector('[data-learning-session-course]')?.textContent).toContain(title);
    expect(host.querySelector('[data-page="lesson"]')).toBeNull();
  });

  it('keeps one learning session shell while moving through learn, practice and apply', async () => {
    const host = await mountPage();
    (host.querySelector('.lv2-upnext button') as HTMLButtonElement).click();
    await nextTick();

    const shell = host.querySelector('[data-learning-session]') as HTMLElement | null;
    expect(shell).toBeTruthy();
    expect([...shell!.querySelectorAll('[data-session-stage] .session-stage-name')].map((item) => item.textContent?.trim()))
      .toEqual(['学习', '练习', '实践']);
    expect(shell!.querySelector('[data-session-stage="learn"]')?.getAttribute('aria-current')).toBe('step');

    (shell!.querySelector('[data-session-stage="practice"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('[data-learning-session]')).toBe(shell);
    expect(host.querySelector('.lv2-quiz')).toBeTruthy();
    expect(host.querySelector('.lv2-session-practice-side.lv2-session-stage-rail')).toBeTruthy();
    expect(host.querySelector('.lv2-quiz-picker')).toBeNull();
    expect(host.querySelector('.lv2-subview-bar')).toBeNull();
    expect(shell!.querySelector('[data-session-stage="practice"]')?.getAttribute('aria-current')).toBe('step');

    (shell!.querySelector('[data-session-stage="apply"]') as HTMLButtonElement).click();
    await nextTick();
    await nextTick();

    expect(host.querySelector('[data-learning-session]')).toBe(shell);
    expect(host.querySelector('.lv2-studio-immersive')).toBeTruthy();
    expect(host.querySelector('.lv2-studio-immersive')?.textContent).toContain('本课实践 ·');
    expect(host.querySelector('.lv2-session-apply-rail')?.textContent).toContain('验收产出');
  });

  it('pins practice to the current course instead of exposing a second course context', async () => {
    const host = await mountPage();
    (host.querySelector('.lv2-upnext button') as HTMLButtonElement).click();
    await nextTick();
    const courseName = host.querySelector('[data-learning-session-course] b')?.textContent?.trim() || '';

    (host.querySelector('[data-session-stage="practice"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('[data-learning-session-course]')?.textContent).toContain(courseName);
    expect(host.querySelector('.lv2-quiz-checkpoints header b')?.textContent).toContain(courseName);
    expect(host.querySelector('.lv2-quiz-course-select')).toBeNull();
  });

  it('offers practice or next-course choices in place instead of jumping to the practice page on finish', async () => {
    const host = await mountPage();
    (host.querySelector('.lv2-upnext button') as HTMLButtonElement).click();
    await nextTick();

    const footer = () => host.querySelector('.lv2-lesson > footer') as HTMLElement | null;
    const advance = async () => {
      const last = footer()?.querySelector('button:last-child') as HTMLButtonElement;
      last.click();
      await nextTick();
    };
    for (let i = 0; i < 12 && footer(); i += 1) await advance();

    const done = host.querySelector('.lv2-lesson-done') as HTMLElement | null;
    expect(done).toBeTruthy();
    expect(done?.textContent).toContain('本课已完成');
    expect(done?.textContent).toContain('继续练习');
    expect(done?.textContent).toContain('下一课');
    expect(host.querySelector('[data-learning-session] [aria-label^="下一课："]')).toBeTruthy();
    // 顶部进度仍标记本课未看完的入口，完成状态由进度接口记录
    expect(apiState.post).toHaveBeenCalledWith('/learning/lesson-progress', expect.anything());

    // 同一会话壳内进入练习阶段，不再在课程页尾展开另一套练习卡
    (done?.querySelector('.lv2-lesson-done-actions button:first-child') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-quiz')).toBeTruthy();
    expect(host.querySelector('.lv2-lesson-quiz')).toBeNull();
    expect(host.querySelector('[data-learning-session]')).toBeTruthy();
  });

  it('keeps the current course and session identity when moving from finish into practice', async () => {
    const host = await mountPage();
    (host.querySelector('.lv2-upnext button') as HTMLButtonElement).click();
    await nextTick();
    const before = host.querySelector('[data-learning-session-course] b')?.textContent || '';
    const shell = host.querySelector('[data-learning-session]');

    const footer = () => host.querySelector('.lv2-lesson > footer') as HTMLElement | null;
    for (let i = 0; i < 12 && footer(); i += 1) {
      (footer()?.querySelector('button:last-child') as HTMLButtonElement).click();
      await nextTick();
    }
    (host.querySelector('.lv2-lesson-done-actions button:first-child') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('[data-learning-session]')).toBe(shell);
    expect(host.querySelector('[data-learning-session-course] b')?.textContent).toBe(before);
    expect(host.querySelector('[data-session-stage="practice"]')?.getAttribute('aria-current')).toBe('step');
  });

  it('keeps a next-course action in the shared shell across practice and apply', async () => {
    const host = await mountPage();
    (host.querySelector('.lv2-upnext button') as HTMLButtonElement).click();
    await nextTick();
    const before = host.querySelector('[data-learning-session-course] b')?.textContent || '';

    const footer = () => host.querySelector('.lv2-lesson > footer') as HTMLElement | null;
    for (let i = 0; i < 12 && footer(); i += 1) {
      (footer()?.querySelector('button:last-child') as HTMLButtonElement).click();
      await nextTick();
    }

    (host.querySelector('[data-session-stage="practice"]') as HTMLButtonElement).click();
    await nextTick();
    const next = host.querySelector('[data-learning-session] [aria-label^="下一课："]') as HTMLButtonElement;
    expect(next).toBeTruthy();
    next.click();
    await nextTick();

    expect(host.querySelector('[data-learning-session-course] b')?.textContent).not.toBe(before);
    expect(host.querySelector('[data-session-stage="learn"]')?.getAttribute('aria-current')).toBe('step');
  });

  it('restores the completed lesson state when navigating back from practice', async () => {
    const host = await mountPage();
    (host.querySelector('.lv2-upnext button') as HTMLButtonElement).click();
    await nextTick();

    const footer = () => host.querySelector('.lv2-lesson > footer') as HTMLElement | null;
    for (let i = 0; i < 12 && footer(); i += 1) {
      (footer()?.querySelector('button:last-child') as HTMLButtonElement).click();
      await nextTick();
    }

    (host.querySelector('.lv2-lesson-done-actions button:first-child') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-quiz')).toBeTruthy();

    (host.querySelector('[data-session-stage="learn"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('.lv2-lesson-quiz')).toBeNull();
    expect(host.querySelector('.lv2-lesson-done')).toBeTruthy();
    expect(host.querySelector('.lv2-lesson > footer')).toBeNull();
  });

  it('numbers the current course and every upcoming course so order is unambiguous', async () => {
    const host = await mountPage();

    expect(host.querySelector('.lv2-continue span em')?.textContent).toContain('第 2 / 13 课');
    const orders = [...host.querySelectorAll('.lv2-upnext .lv2-course-order')]
      .map((item) => item.textContent?.trim());
    expect(orders).toEqual(['第 01 课', '第 03 课', '第 04 课', '第 05 课']);
    expect([...host.querySelectorAll('.lv2-upnext button')]
      .map((item) => item.getAttribute('data-course-relation')))
      .toEqual(['previous', 'next', 'later', 'later']);
    expect(host.querySelector('.lv2-upnext .is-previous .lv2-course-relation')?.textContent?.trim())
      .toBe('上一课');
    expect(host.querySelector('.lv2-upnext .is-next .lv2-course-relation')?.textContent?.trim())
      .toBe('下一课 · 默认');

    (host.querySelector('[data-page="roadmap"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-roadmap .lv2-course-order')?.textContent?.trim()).toBe('第 01 课');
  });

  it('opens subject content management for export, import and package selection', async () => {
    const host = await mountPage();
    const trigger = host.querySelector('[aria-label="管理科目数据"]') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    trigger.click();
    await nextTick();

    const dialog = document.body.querySelector('[data-learning-content-manager]');
    expect(dialog).toBeTruthy();
    expect(dialog?.querySelector('#lcm-title')?.textContent).toContain('导出、导入与打包选择');
    expect(dialog?.querySelectorAll('.lcm-list article')).toHaveLength(22);
    expect(dialog?.textContent).toContain('导入内容包');
    expect(dialog?.textContent).toContain('生成打包清单');
    expect(dialog?.querySelector('input[type="file"]')).toBeTruthy();
  });

  it('collapses and restores the desktop subject sidebar from a persistent preference', async () => {
    localStorage.setItem('yz.learning.v2.subjects-collapsed.v1', '1');
    const host = await mountPage();

    expect(host.querySelector('.lv2')?.classList.contains('subjects-collapsed')).toBe(true);
    expect(host.querySelector('[aria-label="展开学习科目栏"]')).toBeNull();
    toggleRegisteredWorkspaceSidebar();
    await nextTick();

    expect(host.querySelector('.lv2')?.classList.contains('subjects-collapsed')).toBe(false);
    expect(localStorage.getItem('yz.learning.v2.subjects-collapsed.v1')).toBe('0');
    expect(host.querySelector('[aria-label="收起学习科目栏"]')).toBeNull();
  });

  it('collapses roadmap stages and keeps the selected stage visible', async () => {
    const host = await mountPage();
    (host.querySelector('[data-page="roadmap"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('.lv2-depth')).toBeNull();
    expect(host.textContent).not.toContain('零基础 → 基础 → 进阶 → 实战与专题');
    const stages = [...host.querySelectorAll('.lv2-roadmap-track')] as HTMLButtonElement[];
    expect(stages.length).toBeGreaterThan(1);
    expect(stages[0].getAttribute('aria-expanded')).toBe('true');

    stages[0].click();
    await nextTick();
    expect(stages[0].getAttribute('aria-expanded')).toBe('false');
    expect((host.querySelector('.lv2-roadmap section .lv2-roadmap-list') as HTMLElement).style.display).toBe('none');

    stages[1].click();
    await nextTick();
    expect(stages[1].getAttribute('aria-expanded')).toBe('true');
  });

  it('renders all 22 zero-base subjects and eight surfaces', async () => {
    const host = await mountPage();
    expect(host.querySelectorAll('[data-subject], [data-programming-subject-package]')).toHaveLength(38);
    expect(host.querySelectorAll('[data-page]')).toHaveLength(8);
    expect(host.textContent).toContain('党史');
    expect(host.textContent).toContain('编程');
    expect(host.textContent).toContain('医学');
    expect(host.textContent).toContain('易学');
    expect(host.textContent).toContain('学科总览');
    expect(host.textContent).not.toContain('返回旧版学习');
  });

  it('keeps original text visible with layered notes and no template note inserts', async () => {
    const host = await mountPage();
    (host.querySelector('[data-page="books"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-original')?.textContent).toContain('会议集中');
    expect(host.querySelector('.lv2-source')?.textContent).toContain('来源');
    expect(host.querySelector('[data-exemplary-annotation]')).toBeNull();
    expect(host.textContent).not.toContain('套用优秀读书笔记');
  });

  it('shows sourced classical commentary on the books page for covered subjects', async () => {
    const host = await mountPage();
    (host.querySelector('[data-subject="culture"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-page="books"]') as HTMLButtonElement).click();
    await nextTick();

    const section = host.querySelector('[data-expert-notes]');
    expect(section?.textContent).toContain('名家注解');
    expect(section?.textContent).toContain('习，鸟数飞也');
    expect(section?.textContent).toContain('朱熹《四书章句集注');
    expect(section?.textContent).toContain('抄进我的笔记');
  });

  it('shows sourced expert notes on the default subject books page too', async () => {
    const host = await mountPage();
    (host.querySelector('[data-page="books"]') as HTMLButtonElement).click();
    await nextTick();
    const section = host.querySelector('[data-expert-notes]');
    expect(section?.textContent).toContain('名家注解');
    expect(section?.textContent).toContain('共产党宣言');
    expect(section?.textContent).toContain('出处：');
  });

  it('shows sourced study notes on the last math lesson step only', async () => {
    const host = await mountPage();
    (host.querySelector('[data-subject="math"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-page="lesson"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('[data-expert-notes]')).toBeNull();

    const stepButtons = host.querySelectorAll('.lv2-lesson > nav button');
    (stepButtons[stepButtons.length - 1] as HTMLButtonElement).click();
    await nextTick();

    const section = host.querySelector('[data-expert-notes]');
    expect(section?.textContent).toContain('倒序相加');
    expect(section?.textContent).toContain('出处：');
    expect(section?.textContent).toContain('抄进我的笔记');
  });

  it('switches to the selected course practice and keeps subject-specific tools', async () => {
    const host = await mountPage();
    (host.querySelector('[data-subject="security"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-page="studio"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.textContent).toContain('Web 漏洞与攻击防御');
    expect(host.textContent).toContain('NFC');
    expect(host.textContent).toContain('仅限授权靶场');
  });

  it('renders an explicitly reviewed zero-base plan instead of a generated draft', async () => {
    const host = await mountPage();
    (host.querySelector('[data-subject="physics"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-page="roadmap"]') as HTMLButtonElement).click();
    await nextTick();
    const nextCourse = [...host.querySelectorAll('.lv2-roadmap button')]
      .find((button) => button.textContent?.includes('力与牛顿运动定律')) as HTMLButtonElement | undefined;
    nextCourse?.click();
    await nextTick();

    expect(host.querySelector('.lv2-lesson')?.textContent).toContain('力与牛顿运动定律');
    expect(host.querySelector('.lv2-lesson')?.textContent).toContain('受力图');
    expect(host.querySelector('.lv2-lesson')?.textContent).toContain('前置知识');
    expect(host.querySelector('.lv2-lesson')?.textContent).toContain('常见错误');
  });

  it('uses the real review status for the quality badge', () => {
    const view = readFileSync(resolve(__dirname, 'LearningV2.vue'), 'utf8');
    expect(view).toContain("coursePlan.reviewStatus === 'reviewed'");
    expect(view).toContain("'完整教案 · 系统整理'");
  });

  it('opens a generated completion plan instead of leaving the course under construction', async () => {
    const host = await mountPage();
    (host.querySelector('[data-subject="security"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-page="roadmap"]') as HTMLButtonElement).click();
    await nextTick();

    const draft = [...host.querySelectorAll('.lv2-roadmap button')]
      .find((button) => button.textContent?.includes('多语言安全编码')) as HTMLButtonElement;
    expect(draft.disabled).toBe(false);
    expect(draft.textContent).not.toContain('建设中');

    draft.click();
    await nextTick();
    expect(host.querySelector('[data-specialized-security]')).toBeTruthy();
    expect(host.querySelector('[data-learning-session-course]')?.textContent).toContain('多语言安全编码');
  });

  it('opens the programming course center and enters the Java zero-base lesson', async () => {
    const host = await mountPage();
    (host.querySelector('[data-programming-subject-package="java-enterprise"]') as HTMLButtonElement).click();
    await nextTick();
    // 2026-11-21：总览不再渲染课程 Hub（与课程地图页签重复），先切到课程地图
    (host.querySelector('[data-page="roadmap"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('.programming-course-head h1')?.textContent).toContain('Java');
    expect(host.textContent).toContain('中间件源码');

    expect(host.querySelectorAll('[data-programming-stage]')).toHaveLength(12);
    const firstLesson = host.querySelector('[data-programming-lesson-status="ready"]') as HTMLButtonElement;
    expect(firstLesson.textContent).toContain('JDK、IDE 与第一个程序');
    firstLesson.click();
    await nextTick();

    expect(host.querySelector('.lv2-lesson')?.textContent).toContain('Java 零基础');
    expect(host.querySelector('.lv2-prerequisite')?.textContent).toContain('前置知识');
    expect(host.querySelector('.lv2-step-objective')?.textContent).toContain('本步目标');
    const stepButtons = host.querySelectorAll('.lv2-lesson > nav button');
    (stepButtons[stepButtons.length - 1] as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-lesson-sources')?.textContent).toContain('https://');

    (host.querySelector('.session-back') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.programming-course-head h1')?.textContent).toContain('Java');
  });

  it('shows handwritten command examples and runs Java code in practice and apply', async () => {
    const host = await mountPage();
    (host.querySelector('[data-programming-subject-package="java-enterprise"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-page="roadmap"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.programming-course-head h1')?.textContent).toContain('Java');
    (host.querySelector('[data-programming-lesson-status="ready"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('.lv2-step-example')?.textContent).toContain('javac -version');
    expect(host.querySelector('.lv2-step-example pre')?.textContent).toContain('where.exe java');

    (host.querySelector('[data-session-stage="practice"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.learning-code-lab[data-learning-code-lab="practice"]')).toBeTruthy();
    expect(host.textContent).toContain('JDK、Main.java 与真实运行');

    (host.querySelector('[data-session-stage="apply"]') as HTMLButtonElement).click();
    await nextTick();
    await nextTick();
    expect(host.querySelector('.learning-code-lab[data-learning-code-lab="apply"]')).toBeTruthy();
    expect(host.textContent).toContain('独立实践：完成你的环境卡程序');
  });

  it('uses the same runnable lab pattern in the first algorithm lesson', async () => {
    const host = await mountPage();
    (host.querySelector('[data-subject="algorithms"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-page="roadmap"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-algorithm-lesson="a0-01"]') as HTMLButtonElement).click();
    await nextTick();

    (host.querySelector('[data-session-stage="practice"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.learning-code-lab[data-learning-code-lab="practice"]')).toBeTruthy();
    expect(host.textContent).toContain('把操作次数跑出来');

    (host.querySelector('[data-session-stage="apply"]') as HTMLButtonElement).click();
    await nextTick();
    await nextTick();
    expect(host.querySelector('.learning-code-lab[data-learning-code-lab="apply"]')).toBeTruthy();
    expect(host.textContent).toContain('独立实践：比较两种计数口径');
  });

  it('groups subjects by course category and shows programming packages instead of flat lessons', async () => {
    const host = await mountPage();
    const groups = [...host.querySelectorAll('.lv2-subject-group-head b')]
      .map((item) => item.textContent?.trim());
    expect(groups).toEqual(['人文社科', '语言文学', '数理医学', '艺术思维', '编程算法', '职业安全', '易学民俗']);

    const technology = [...host.querySelectorAll('.lv2-subject-group-head')]
      .find((item) => item.textContent?.includes('编程算法')) as HTMLButtonElement;
    technology.click();
    await nextTick();
    expect(host.querySelectorAll('[data-programming-subject-package]')).toHaveLength(17);
    expect(host.querySelector('[data-subject="programming"]')).toBeNull();
    (host.querySelector('[data-programming-subject-package="java-enterprise"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('.programming-course-head h1')?.textContent).toContain('Java');
  });

  it('splits every programming package into its own subject entry', async () => {
    const host = await mountPage();
    const technology = [...host.querySelectorAll('.lv2-subject-group-head')]
      .find((item) => item.textContent?.includes('编程算法')) as HTMLButtonElement;
    technology.click();
    await nextTick();

    expect(host.querySelector('[data-programming-subject-package]')).toBeTruthy();
    expect(host.querySelectorAll('[data-programming-subject-package]')).toHaveLength(17);
    expect(host.querySelector('[data-subject="programming"]')).toBeNull();
    expect(host.querySelector('[data-subject="algorithms"]')).toBeTruthy();
    expect(technology.querySelector('small')?.textContent).toBe('18');
    expect(host.textContent).toContain('Java 企业级后端');
    expect(host.textContent).toContain('Python');
    expect(host.textContent).toContain('C++');

    (host.querySelector('[data-programming-subject-package="python-enterprise"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.programming-course-head h1')?.textContent).toContain('Python');
    expect(host.querySelector('[data-programming-subject-package="python-enterprise"]')?.classList.contains('active')).toBe(true);
  });

  it('uses the same split programming entries in the mobile subject sheet', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('max-width: 900px'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    const host = await mountPage();

    (host.querySelector('.lv2-mobile-subject') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelectorAll('[data-mobile-subject-category]')).toHaveLength(7);
    const technology = host.querySelector('[data-mobile-subject-category="technology"] .lv2-mobile-subject-group-head') as HTMLButtonElement;
    technology.click();
    await nextTick();
    expect(host.querySelectorAll('[data-mobile-programming-package]')).toHaveLength(17);
    expect(host.querySelector('[data-mobile-programming-package="go-cloud"]')?.textContent).toContain('Go');

    technology.click();
    await nextTick();
    expect((host.querySelector('[data-mobile-subject-category-items="technology"]') as HTMLElement).style.display).toBe('none');
    technology.click();
    await nextTick();

    (host.querySelector('[data-mobile-programming-package="go-cloud"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.programming-course-head h1')?.textContent).toContain('Go');
  });

  it('renders the mobile subject sheet above the global tab bar', () => {
    const learningCss = readFileSync(resolve(__dirname, 'learning-v2.css'), 'utf8');
    const sideNav = readFileSync(resolve(__dirname, '../components/SideNav.vue'), 'utf8');
    const zIndexOf = (css: string, selector: string): number => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
      const blocks = [...source.matchAll(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'g'))];
      return Math.max(0, ...blocks.map((block) =>
        Number(block[1].match(/z-index:\s*(\d+)/)?.[1] || 0),
      ));
    };

    expect(zIndexOf(learningCss, '.lv2-mobile-sheet-mask'))
      .toBeGreaterThan(zIndexOf(sideNav, '.tab-bar'));
  });

  it('opens a project-training phase as the same immersive single-step lesson', async () => {
    const host = await mountPage();
    (host.querySelector('[data-programming-subject-package="java-enterprise"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-page="roadmap"]') as HTMLButtonElement).click();
    await nextTick();

    (host.querySelector('[data-learning-layer="projects"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-programming-project="studio-site"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.textContent).toContain('Studio 企业官网');
    expect(host.querySelectorAll('[data-programming-project-phase]')).toHaveLength(10);

    (host.querySelector('[data-programming-project-phase="03"] button') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-lesson')?.textContent).toContain('Studio 企业官网 · API 契约与前端数据边界');
    expect(host.querySelector('.lv2-lesson-copy')?.textContent).toContain('接口');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(host.querySelector('.lv2-lesson')).toBeNull();
    expect(host.querySelector('.programming-project-detail-head')).toBeTruthy();
    expect(host.textContent).toContain('Studio 企业官网');
  });

  it('runs every question in the current course as one continuous quiz session', async () => {
    const host = await mountPage();
    (host.querySelector('[data-programming-subject-package="java-enterprise"]') as HTMLButtonElement).click();
    await nextTick();
    // 2026-11-22：编程总览必须渲染通用内容（此前 Hub 移走后整页空白）
    (host.querySelector('[data-page="overview"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-continue')).toBeTruthy();
    (host.querySelector('[data-page="practice"]') as HTMLButtonElement).click();
    await nextTick();

    // 练习固定使用当前课程，不再暴露第二个章节选择上下文
    expect(host.querySelector('.lv2-quiz-course-select')).toBeNull();
    expect(host.querySelector('[data-learning-session-course]')?.textContent).toContain('编程');
    expect(host.querySelector('.lv2-session-practice-layout')).toBeTruthy();
    expect(host.querySelector('.lv2-session-practice-main .lv2-quiz')).toBeTruthy();
    expect(host.querySelector('.lv2-session-practice-side .lv2-quiz-checkpoints')).toBeTruthy();
    expect(host.querySelector('.lv2-quiz-meta')?.textContent).toContain('第 1 / 4 题');
    const bank = host.querySelector('[data-quiz-bank]') as HTMLElement;
    const bankToggle = host.querySelector('.lv2-quiz-bank-toggle') as HTMLButtonElement;
    expect(bank).toBeTruthy();
    expect(bank.getAttribute('data-quiz-course')).toBe(
      host.querySelector('[data-learning-session-course] b')?.textContent?.trim(),
    );
    expect(bank.style.display).toBe('none');
    expect(bankToggle.getAttribute('aria-expanded')).toBe('false');

    bankToggle.click();
    await nextTick();
    expect(bank.style.display).not.toBe('none');
    expect(host.querySelectorAll('[data-quiz-bank-item]')).toHaveLength(4);
    expect(bankToggle.getAttribute('aria-expanded')).toBe('true');
    bankToggle.click();
    await nextTick();
    expect(bank.style.display).toBe('none');

    // 作答 → 提交 → 解析可见 → 下一题
    const firstOption = host.querySelector('.lv2-quiz > button') as HTMLButtonElement;
    firstOption.click();
    await nextTick();
    expect(host.querySelector('.lv2-quiz-meta')?.textContent).toContain('已得 0 分');
    expect((host.querySelector('.lv2-quiz-nav') as HTMLButtonElement).disabled).toBe(true);
    (host.querySelector('.lv2-quiz-submit') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('[data-quiz-feedback]')?.textContent).toMatch(/回答正确|需要复习/);
    expect(host.querySelector('.lv2-quiz-score')).toBeNull();
    expect((host.querySelector('.lv2-quiz-nav') as HTMLButtonElement).disabled).toBe(true);

    (host.querySelector('.lv2-quiz-submit') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-quiz-meta')?.textContent).toContain('第 2 / 4 题');
    expect((host.querySelector('.lv2-quiz-nav') as HTMLButtonElement).disabled).toBe(false);

    for (let question = 2; question <= 4; question += 1) {
      (host.querySelector('.lv2-quiz > button') as HTMLButtonElement).click();
      await nextTick();
      (host.querySelector('.lv2-quiz-submit') as HTMLButtonElement).click();
      await nextTick();
      if (question < 4) {
        (host.querySelector('.lv2-quiz-submit') as HTMLButtonElement).click();
        await nextTick();
      }
    }

    expect(host.querySelector('.lv2-quiz-meta')?.textContent).toContain('第 4 / 4 题');
    expect(bank.style.display).not.toBe('none');
    expect(bankToggle.getAttribute('aria-expanded')).toBe('true');
    expect(bank.textContent).toContain('4 / 4 已完成');
    expect(host.querySelectorAll('[data-quiz-bank-status]').length).toBe(4);
    for (const status of host.querySelectorAll('[data-quiz-bank-status]')) {
      expect(['正确', '错误']).toContain(status.textContent?.trim());
    }

    (host.querySelector('[data-quiz-bank-item="2"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-quiz-meta')?.textContent).toContain('第 3 / 4 题');
    expect(bank.style.display).toBe('none');
    expect(bankToggle.getAttribute('aria-expanded')).toBe('false');

    // 自测清单来自课程步骤 checkpoint
    expect(host.querySelector('.lv2-quiz-checkpoints')?.textContent).toContain('本课自测清单');
  });

  it('derives course progress labels from actual completion instead of catalog sample text', async () => {
    const host = await mountPage();
    (host.querySelector('[data-page="roadmap"]') as HTMLButtonElement).click();
    await nextTick();

    const first = [...host.querySelectorAll('.lv2-roadmap button')]
      .find((button) => button.textContent?.includes('建党与初心')) as HTMLButtonElement;
    expect(first.querySelector('small')?.textContent).not.toBe('已完成');
    expect(first.querySelector('small')?.textContent).toBe('未开始');
  });

  it('shows guided practice, independent output and traceable sources in the lesson surface', async () => {
    const host = await mountPage();
    (host.querySelector('[data-subject="physics"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-page="roadmap"]') as HTMLButtonElement).click();
    await nextTick();
    const course = [...host.querySelectorAll('.lv2-roadmap button')]
      .find((button) => button.textContent?.includes('力与牛顿运动定律')) as HTMLButtonElement;
    course.click();
    await nextTick();
    const stepButtons = host.querySelectorAll('.lv2-lesson > nav button');
    (stepButtons[stepButtons.length - 1] as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('.lv2-lesson-practice')?.textContent).toContain('把一本书放在桌面');
    expect(host.querySelector('.lv2-lesson-practice')?.textContent).toContain('滑梯或电梯');
    expect(host.querySelector('.lv2-lesson-sources')?.textContent).toContain('OpenStax');
    expect(host.querySelector('.lv2-lesson-sources')?.textContent).toContain('https://');
  });

  it('renders every reviewed lesson step as a complete teach-practice-check unit', async () => {
    const host = await mountPage();
    (host.querySelector('[data-page="lesson"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelectorAll('.lv2-lesson-copy p').length).toBeGreaterThanOrEqual(1);
    expect(host.querySelector('.lv2-step-objective')?.textContent).toContain('本步目标');
    expect(host.querySelector('.lv2-step-lab')?.textContent).toContain('跟做与记录');
    // 2026-11-22：完成检查不再逐步展示——习题归入学完后的「本课练习」逐题自测
    expect(host.querySelector('.lv2-step-check')).toBeNull();
    expect(host.querySelector('.lv2-errors')?.textContent).toContain('常见错误');
    expect(host.querySelector('[data-exemplary-note]')).toBeNull();
    expect(host.querySelector('[data-action="open-scholar-note"]')).toBeNull();
  });

  it('does not offer template scholar-note panels over lesson content', async () => {
    const host = await mountPage();
    (host.querySelector('[data-page="lesson"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('[data-action="open-scholar-note"]')).toBeNull();
    expect(document.body.querySelector('[data-scholar-note-panel]')).toBeNull();
    expect(host.querySelector('.lv2-lesson')).toBeTruthy();
  });

  it('renders the reviewed Party founding lesson as subject content, not writing commentary', async () => {
    const host = await mountPage();
    (host.querySelector('[data-page="roadmap"]') as HTMLButtonElement).click();
    await nextTick();
    const first = [...host.querySelectorAll('.lv2-roadmap-list > button')]
      .find((button) => button.textContent?.includes('建党与初心')) as HTMLButtonElement;

    first.click();
    await nextTick();

    const copy = host.querySelector('.lv2-lesson-copy')?.textContent || '';
    expect(host.querySelectorAll('.lv2-lesson-copy p').length).toBeGreaterThanOrEqual(6);
    expect(copy).toContain('1919 年 5 月 4 日');
    expect(copy).toContain('1920 年');
    expect(copy).toContain('1921 年 7 月');
    expect(copy).toContain('1922 年 7 月');
    expect(copy).toContain('画舫');
    expect(copy).toContain('不是“红船会议”');
    expect(copy).not.toContain('党史不是一串孤立结论');
    expect(copy).not.toContain('时间轴的任务');
  });

  it('opens the shared library and filters across all subjects', async () => {
    const host = await mountPage();
    expect(host.querySelector('[aria-label="打开公共图书馆"]')?.textContent).toContain('图书馆');
    (host.querySelector('[aria-label="打开公共图书馆"]') as HTMLButtonElement).click();
    await nextTick();
    const input = document.body.querySelector('[data-library-search]') as HTMLInputElement;
    input.value = '星图';
    input.dispatchEvent(new Event('input'));
    await nextTick();

    expect(document.body.querySelector('.ll-library')?.textContent).toContain('星图与历法入门');
    expect(document.body.querySelector('.ll-library')?.textContent).toContain('仅书目登记');
  });

  it('renders the library as a first-class learning workspace instead of a modal overlay', async () => {
    const host = await mountPage();
    (host.querySelector('[aria-label="打开公共图书馆"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('.lv2')?.classList.contains('is-library-open')).toBe(true);
    expect(host.querySelector('.lv2-library-page .ll-library')).toBeTruthy();
    expect(host.querySelector('.lv2-library-mask')).toBeNull();
    expect(host.querySelector('.lv2-library-page')?.parentElement).toBe(host.querySelector('.lv2'));
    expect(document.body.style.overflow).not.toBe('hidden');

    (host.querySelector('[aria-label="关闭图书馆"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-library-page')).toBeNull();
    expect(host.querySelector('.lv2-subjects')).toBeTruthy();
  });

  it('switches learning between the complete AI workspace and the immersive human desk', async () => {
    setLead('learning', 'ai');
    const host = await mountPage();

    expect(host.querySelector('.lv2')?.classList.contains('is-learning-ai')).toBe(true);
    expect(host.querySelector('.lv2-ai-context')?.textContent).toContain('学习教练');
    expect(host.querySelector('.lv2-ai-context')?.textContent).toContain('当前课程');
    expect(host.querySelector('[data-test="learning-chat-messages"]')).toBeTruthy();
    expect(host.querySelector('[data-test="learning-chat-input"]')).toBeTruthy();
    expect(host.querySelector('.lv2-ai-welcome')?.textContent).toContain('今天想把哪一块学明白');
    expect(host.querySelector('.lv2-ai-actions')?.textContent).toContain('图书馆');
    const coachPane = host.querySelector('[data-pane-label="学习教练"]') as HTMLElement;
    const conversationPane = host.querySelector('[data-pane-label="学习会话"]') as HTMLElement;
    expect(coachPane.querySelector('[role="separator"]')).toBeTruthy();
    expect(coachPane.querySelector('.lv2-ai-brand-toggle')).toBeNull();
    expect(coachPane.querySelector('.rpane-fold')).toBeNull();
    expect(conversationPane.querySelector('[role="separator"]')).toBeTruthy();
    expect(conversationPane.textContent).toContain('还没有学习会话');
    toggleRegisteredWorkspaceSidebar();
    await nextTick();
    expect(coachPane.classList.contains('rpane-collapsed')).toBe(true);
    toggleRegisteredWorkspaceSidebar();
    await nextTick();
    expect(coachPane.classList.contains('rpane-collapsed')).toBe(false);

    (host.querySelector('.lv2-ai-actions button') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('.lv2')?.classList.contains('is-learning-ai')).toBe(false);
    expect(host.querySelector('.lv2-subjects')).toBeTruthy();
    expect(host.querySelector('.lv2-workspace')).toBeTruthy();
  });

  it('restores the latest learning-mode conversation without reusing another mode', () => {
    const view = readFileSync(resolve(__dirname, 'LearningV2.vue'), 'utf8');

    expect(view).toContain("conversation.mode === 'learning'");
    expect(view).toContain('async function restoreLearningConversation()');
    expect(view).toContain('await chat.selectConv(latest.id)');
    expect(view).toContain('<LearningConversationRail');
    expect(view).toContain('@select="selectLearningConversation"');
  });

  it('returns from the built-in reader to the open library instead of dropping to the overview', async () => {
    const host = await mountPage();
    (host.querySelector('[aria-label="打开公共图书馆"]') as HTMLButtonElement).click();
    await nextTick();

    const read = document.body.querySelector('button[data-read-book]') as HTMLButtonElement;
    read.click();
    await nextTick();
    expect(document.body.querySelector('.learning-book-reader')).toBeTruthy();

    (document.body.querySelector('[aria-label="关闭阅读器"]') as HTMLButtonElement).click();
    await nextTick();
    expect(document.body.querySelector('.ll-library')).toBeTruthy();
  });

  it('reports completed lessons to the existing progress API', async () => {
    const host = await mountPage();
    (host.querySelector('[data-page="lesson"]') as HTMLButtonElement).click();
    await nextTick();
    for (let index = 0; index < 4; index += 1) {
      (host.querySelector('.lv2-lesson > footer button:last-child') as HTMLButtonElement).click();
      await nextTick();
    }
    (host.querySelector('.lv2-lesson > footer button:last-child') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(apiState.post).toHaveBeenCalledWith('/learning/lesson-progress', {
        subject: '党史',
        lessonIds: ['party:0:1'],
      });
    });
    expect(JSON.parse(localStorage.getItem('yz.learning.v2.progress.v1') || '{}').party).toContain('party:0:1');
  });

  it('keeps progress responses scoped when the learner changes subject before loading finishes', async () => {
    let resolveParty!: (value: { data: { lessonIds: string[] } }) => void;
    apiState.get.mockImplementation((url: string) => {
      const decoded = decodeURIComponent(url);
      if (url.startsWith('/learning/lesson-progress?') && decoded.includes('subject=党史')) {
        return new Promise<{ data: { lessonIds: string[] } }>((resolve) => {
          resolveParty = resolve;
        });
      }
      return Promise.resolve({ data: { lessonIds: [] } });
    });
    const host = await mountPage();

    (host.querySelector('[data-subject="security"]') as HTMLButtonElement).click();
    await nextTick();
    await vi.waitFor(() => {
      expect(apiState.get.mock.calls.some(([url]) =>
        url.startsWith('/learning/lesson-progress?')
        && decodeURIComponent(url).includes('subject=网络安全'),
      )).toBe(true);
    });

    resolveParty({ data: { lessonIds: ['party:0:1'] } });
    await vi.waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('yz.learning.v2.progress.v1') || '{}');
      expect(saved.security || []).not.toContain('party:0:1');
    });
  });

  it('restores the saved immersive step for the same course', async () => {
    localStorage.setItem('yz.learning.v2.session.v1', JSON.stringify({
      subject: 'party',
      page: 'lesson',
      step: 2,
    }));
    const host = await mountPage();

    expect(
      host.querySelector('[data-session-stage="learn"] .session-stage-copy small')?.textContent,
    ).toContain('3/5');
  });

  it('exits the immersive lesson with Escape and restores the overview', async () => {
    const host = await mountPage();
    (host.querySelector('[data-page="lesson"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-lesson')).toBeTruthy();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();

    expect(host.querySelector('.lv2-lesson')).toBeNull();
    expect(host.textContent).toContain('继续学习');
  });

  it('uses a same-route history sentinel so system swipe exits the lesson only', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const host = await mountPage();
    (host.querySelector('[data-page="lesson"]') as HTMLButtonElement).click();
    await nextTick();

    expect(window.history.state).toMatchObject({ yzLearningStudy: true });
    const nativeBack = new CustomEvent('yz:mobile-back', { cancelable: true });
    const dispatchResult = document.dispatchEvent(nativeBack);
    await nextTick();
    await nextTick();

    expect(dispatchResult).toBe(false);
    expect(nativeBack.defaultPrevented).toBe(true);
    expect(host.querySelector('.lv2-lesson')).toBeNull();
    expect(host.textContent).toContain('继续学习');
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('exits the lesson on browser popstate without stepping back out of learning', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const host = await mountPage();
    (host.querySelector('[data-page="lesson"]') as HTMLButtonElement).click();
    await nextTick();

    expect(window.history.state).toMatchObject({ yzLearningStudy: true });
    window.history.replaceState({}, '', window.location.href);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    await nextTick();
    await nextTick();

    expect(host.querySelector('.lv2-lesson')).toBeNull();
    expect(host.textContent).toContain('继续学习');
    expect(back).not.toHaveBeenCalled();
  });

  it('takes over the whole app while studying and keeps practice tools reachable', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    app = createApp(LearningV2);
    app.use(createPinia());
    app.mount(root);
    await nextTick();
    await waitForLearningReady(root);

    (root.querySelector('[data-page="lesson"]') as HTMLButtonElement).click();
    await nextTick();

    const lesson = document.querySelector('.lv2-lesson.inline') as HTMLElement;
    expect(lesson).toBeTruthy();
    expect(root.hasAttribute('inert')).toBe(false);
    expect(root.hasAttribute('aria-hidden')).toBe(false);
    expect(root.querySelector('.lv2.study-full')).toBeTruthy();
    expect(root.querySelector('.lv2-subjects')).toBeNull();
    expect(root.querySelector('.lv2-pages')).toBeNull();
    expect(document.documentElement.classList.contains('yz-learning-study')).toBe(true);
    const stages = [...root.querySelectorAll('[data-session-stage] .session-stage-name')]
      .map((item) => item.textContent?.trim());
    expect(stages).toEqual(['学习', '练习', '实践']);

    const last = lesson.querySelector('footer button:last-child') as HTMLButtonElement;
    last.focus();
    expect(document.activeElement).toBe(last);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(document.querySelector('.lv2-lesson')).toBeNull();
    expect(document.documentElement.classList.contains('yz-learning-study')).toBe(false);
  });

  it('exits the immersive lesson from both session controls', async () => {
    const host = await mountPage();
    (host.querySelector('.lv2-pages [data-page="lesson"]') as HTMLButtonElement).click();
    await nextTick();

    (host.querySelector('[data-learning-session] [aria-label="返回教材"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-lesson')).toBeNull();

    (host.querySelector('.lv2-pages [data-page="lesson"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-learning-session] [aria-label="退出本课"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-lesson')).toBeNull();
  });

  it('returns to the subject overview from books and practice via the page tabs', async () => {
    const host = await mountPage();

    (host.querySelector('[data-page="books"]') as HTMLButtonElement).click();
    await nextTick();
    // 2026-11-22：桌面端不再放「返回学科」按钮（页签即导航），返回走顶部页签
    expect(host.querySelector('.lv2-page-back')).toBeNull();
    (host.querySelector('[data-page="overview"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-continue')).toBeTruthy();

    (host.querySelector('[data-page="practice"]') as HTMLButtonElement).click();
    await nextTick();
    // 练习与课程共用会话头，返回教材走统一入口
    (host.querySelector('[data-learning-session] [aria-label="返回教材"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-continue')).toBeTruthy();
  });

  it('opens metadata-only library records instead of routing to an unrelated sample book', async () => {
    const host = await mountPage();
    (host.querySelector('[aria-label="打开公共图书馆"]') as HTMLButtonElement).click();
    await nextTick();

    const input = document.body.querySelector('[data-library-search]') as HTMLInputElement;
    input.value = '星图与历法入门';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    const metadata = [...document.body.querySelectorAll('.ll-book-card')]
      .find((button) => button.textContent?.includes('星图与历法入门')) as HTMLButtonElement;
    metadata.click();
    await nextTick();

    expect(document.body.querySelector('.ll-detail')?.textContent).toContain('版本与许可信息待核验');
    expect(document.body.querySelector('.ll-detail')?.textContent).toContain('仅书目登记');
  });

  it('keeps the prototype desktop study rail with real progress and review cues', async () => {
    const host = await mountPage();

    expect(host.querySelector('.lv2-brand')?.textContent).not.toContain('Learning V2');
    expect(host.querySelector('.lv2-study-rail')?.textContent).toContain('今日目标');
    expect(host.querySelector('.lv2-study-rail')?.textContent).toContain('掌握度');
    expect(host.querySelector('.lv2-study-rail')?.textContent).toContain('最近记录');
    expect(host.querySelectorAll('.lv2-study-rail .lv2-rail-plan button')).toHaveLength(3);
  });

  it('collapses and resizes the desktop study rail while remembering the choice', async () => {
    const host = await mountPage();
    const workspace = host.querySelector('.lv2-workspace') as HTMLElement;
    const resizeHandle = host.querySelector('[aria-label="调整今日学习侧栏宽度"]') as HTMLElement;

    expect(workspace.style.getPropertyValue('--lv2-study-rail-width')).toBe('216px');
    resizeHandle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await nextTick();
    expect(workspace.style.getPropertyValue('--lv2-study-rail-width')).toBe('232px');

    (host.querySelector('[aria-label="收起今日学习侧栏"]') as HTMLButtonElement).click();
    await nextTick();
    expect(workspace.style.getPropertyValue('--lv2-study-rail-width')).toBe('42px');
    expect(host.querySelector('[aria-label="展开今日学习侧栏"]')).toBeTruthy();
    expect(localStorage.getItem('yz.learning.v2.study-rail.v1')).toContain('"collapsed":true');
  });

  it('uses a distinct mobile overview with one course picker, five tools and one primary action', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('max-width: 900px'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    const host = await mountPage();

    expect(host.querySelector('.lv2-mobile-overview')).toBeTruthy();
    expect(host.querySelector('.lv2-mobile-course-select')).toBeTruthy();
    expect(host.querySelector('.lv2-mobile-overview-head')).toBeNull();
    expect(host.querySelector('.lv2-mobile-primary')).toBeNull();
    expect(host.querySelectorAll('.lv2-mobile-tools button')).toHaveLength(5);
    expect(host.querySelector('.lv2-mobile-continue')?.textContent).toContain('开始本节');
    expect(host.querySelector('.lv2-mobile-continue')?.textContent).toContain('第 2 / 13 课');
    expect(host.querySelector('.lv2-mobile-course-strip .lv2-course-order')).toBeTruthy();

    (host.querySelector('.lv2-mobile-course-trigger') as HTMLButtonElement).click();
    await nextTick();
    const trackHeads = host.querySelectorAll('[data-mobile-course-track]');
    expect(trackHeads.length).toBeGreaterThan(1);
    const currentTrack = [...trackHeads].find((item) =>
      (host.querySelector(`[data-mobile-course-track-items="${item.getAttribute('data-mobile-course-track')}"]`) as HTMLElement)
        ?.style.display !== 'none') as HTMLButtonElement;
    expect(currentTrack).toBeTruthy();
    currentTrack.click();
    await nextTick();
    expect((host.querySelector(`[data-mobile-course-track-items="${currentTrack.getAttribute('data-mobile-course-track')}"]`) as HTMLElement).style.display).toBe('none');
    currentTrack.click();
    await nextTick();

    (host.querySelector('.lv2-mobile-tools [data-page="books"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-mobile-pagebar')?.textContent).toContain('书籍研读');
    (host.querySelector('.lv2-mobile-pagebar [data-action="back-to-subject"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-mobile-overview')).toBeTruthy();
  });

  it('renders executable security and Zhouyi practice surfaces instead of feature labels alone', async () => {
    const host = await mountPage();
    (host.querySelector('[data-subject="security"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-page="studio"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.textContent).toContain('发送到隔离靶场');
    expect(host.textContent).toContain('权限矩阵');
    expect(host.textContent).toContain('修复与回归');

    (host.querySelector('[data-learning-session] [aria-label="返回教材"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-subject="zhouyi"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('.lv2-topbar-actions .lv2-tool-chip') as HTMLButtonElement).click();
    await nextTick();
    await nextTick();
    expect(host.querySelector('.dv-root')).toBeTruthy();
    expect(host.textContent).toContain('梅花易数');
    expect(host.textContent).toContain('大衍筮法');
    expect(host.textContent).toContain('民俗文化体验 · 教学演示');
  });

  it('opens practice in an in-page workspace with its own scroll and Escape exit', async () => {
    const host = await mountPage();
    (host.querySelector('[data-page="studio"]') as HTMLButtonElement).click();
    await nextTick();
    await nextTick();

    const shell = host.querySelector('.lv2-studio-immersive.inline') as HTMLElement;
    const body = host.querySelector('.lv2-studio-immersive-body') as HTMLElement;
    expect(shell).toBeTruthy();
    expect(body).toBeTruthy();
    expect(host.querySelector('.lv2-study-rail')).toBeNull();
    expect(document.body.style.overflow).not.toBe('hidden');

    body.scrollTop = 320;
    expect(body.scrollTop).toBe(320);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    await nextTick();
    expect(host.querySelector('.lv2-studio-immersive')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('reuses the complete specialized workbenches for English and Zhouyi course study', async () => {
    const host = await mountPage();

    (host.querySelector('[data-subject="english"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-page="lesson"]') as HTMLButtonElement).click();
    await nextTick();
    await nextTick();
    expect(host.querySelector('.lv2-specialized-study')).toBeTruthy();
    expect(host.querySelector('.lp-path')).toBeTruthy();
    expect(host.querySelector('[data-action="open-scholar-note"]')).toBeNull();
    expect(host.querySelector('.lv2-lesson')).toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    await nextTick();
    (host.querySelector('[data-subject="zhouyi"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-page="lesson"]') as HTMLButtonElement).click();
    await nextTick();
    await nextTick();
    expect(host.querySelector('.zy-root')).toBeTruthy();
  });

  it('opens the medicine double-path studio with synthetic cases and safety boundaries', async () => {
    const host = await mountPage();
    (host.querySelector('[data-subject="medicine"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-page="studio"]') as HTMLButtonElement).click();
    await nextTick();
    await nextTick();

    expect(host.querySelector('[data-medical-studio]')).toBeTruthy();
    expect(host.textContent).toContain('固定病例，双路径复盘');
    expect(host.textContent).toContain('中医学习视角');
    expect(host.textContent).toContain('西医学习视角');
    expect(host.textContent).toContain('不据课程诊断真人');
    expect(host.textContent).toContain('联系当地急救系统');
    const atlasButton = [...host.querySelectorAll('.medical-workspace-switcher button')]
      .find((button) => button.textContent?.includes('人体图鉴')) as HTMLButtonElement;
    atlasButton.click();
    await nextTick();
    expect(host.querySelector('[data-medical-atlas]')).toBeTruthy();
    expect(host.textContent).toContain('内脏分布');
    expect(host.textContent).toContain('经络穴位');
    const gameButton = [...host.querySelectorAll('.medical-workspace-switcher button')]
      .find((button) => button.textContent?.includes('解剖小游戏')) as HTMLButtonElement;
    gameButton.click();
    await nextTick();
    expect(host.querySelector('[data-medical-anatomy-game]')).toBeTruthy();
    expect(host.textContent).toContain('动物结构配对');
  });

  it('shows three primary entries instead of eight learning tabs', async () => {
    const host = await mountPage();
    const labels = [...host.querySelectorAll('.lv2-pages > button[data-nav]')]
      .map((button) => button.textContent?.trim());
    expect(labels).toEqual(['教材', '今日复习', '我的']);
    expect(host.querySelectorAll('.lv2-pages [data-page]')).toHaveLength(8);
    expect(host.querySelector('.lv2-legacy-nav')?.getAttribute('aria-hidden')).toBe('true');

    (host.querySelector('[data-nav="mine"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-mine-panel')).toBeTruthy();
    expect(host.textContent).toContain('我的学习');
  });

  it('keeps practice, studio and coach one click away from the overview', async () => {
    const host = await mountPage();
    const chips = [...host.querySelectorAll('.lv2-topbar-actions .lv2-tool-chip')]
      .map((button) => button.textContent?.trim());
    expect(chips).toEqual(['实践', '练习', '陪练']);

    (host.querySelector('.lv2-topbar-actions .lv2-tool-chip') as HTMLButtonElement).click();
    await nextTick();
    await nextTick();
    expect(host.querySelector('.lv2-studio-immersive')).toBeTruthy();

    (host.querySelector('[data-session-stage="practice"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-quiz')).toBeTruthy();
    expect(host.querySelector('.lv2-subview-bar')).toBeNull();

    (host.querySelector('[data-learning-session] .session-action') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-session-coach-surface')).toBeTruthy();
  });

  it('keeps the mobile learning topbar compact and moves secondary actions into a 44px menu', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('max-width: 900px'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    const host = await mountPage();
    const view = readFileSync(resolve(__dirname, 'LearningV2.vue'), 'utf8');
    const css = readFileSync(resolve(__dirname, 'learning-v2.css'), 'utf8');

    expect(host.querySelector('.lv2-mobile-topbar')).toBeTruthy();
    expect(host.querySelector('.lv2-mobile-subject')?.textContent).toContain('党史');
    expect(host.querySelector('.lv2-mobile-topbar .lv2-library-button')).toBeNull();
    expect(host.querySelectorAll('.lv2-mobile-topbar .lv2-tool-chip')).toHaveLength(0);
    expect(host.querySelector('[data-mobile-more-trigger]')).toBeTruthy();

    expect(css).toMatch(/\.lv2-mobile-topbar \{[^}]*height: 60px;[^}]*min-height: 60px;/s);
    expect(css).toMatch(/\.lv2-mobile-subject \{[^}]*flex: 0 0 auto;[^}]*white-space: nowrap;/s);
    expect(css).toMatch(/\.lv2-mobile-more \{[^}]*width: 44px;[^}]*height: 44px;/s);
    expect(css).toMatch(/\.lv2-mobile-more-menu button \{[^}]*min-height: 44px;/s);

    const more = host.querySelector('[data-mobile-more-trigger]') as HTMLButtonElement;
    expect(more.getAttribute('aria-expanded')).toBe('false');
    more.click();
    await nextTick();
    await nextTick();

    expect(more.getAttribute('aria-expanded')).toBe('true');
    const menu = host.querySelector('[data-mobile-more-menu]') as HTMLElement;
    expect(menu?.getAttribute('role')).toBe('menu');
    const labels = [...menu.querySelectorAll('[role="menuitem"]')]
      .map((item) => item.textContent?.trim());
    expect(labels).toEqual(['实践', '练习', '陪练', '科目数据', '图书馆']);
    expect(document.activeElement).toBe(menu.querySelector('[role="menuitem"]'));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    await nextTick();
    expect(host.querySelector('[data-mobile-more-menu]')).toBeNull();
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(more);

    more.click();
    await nextTick();
    await nextTick();
    (host.querySelector('[data-mobile-action="practice"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('[data-learning-session][data-stage="practice"]')).toBeTruthy();
    expect(host.querySelector('.lv2-mobile-topbar')).toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    await nextTick();
    expect(host.querySelector('.lv2-mobile-topbar')).toBeTruthy();
  });

  it('builds narration lazily and tolerates missing optional arrays', () => {
    const view = readFileSync(resolve(__dirname, 'LearningV2.vue'), 'utf8');

    expect(view).toContain("if (activePage.value === 'practice')");
    expect(view).toContain("(quiz?.options ?? []).join('；')");
    expect(view).toContain("(subject.value.review?.items ?? []).join('；')");
    expect(view).toContain("(coach?.prompts ?? []).join('；')");
    expect(view).not.toContain('const pageText: Record<LearningV2PageKey, string>');
  });

  it('keeps the full-window learning shell while moving between lesson, practice and studio', async () => {
    const host = await mountPage();
    (host.querySelector('[data-page="practice"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-quiz')).toBeTruthy();
    expect(document.documentElement.classList.contains('yz-learning-study')).toBe(true);
    expect(host.querySelector('.lv2-subjects')).toBeNull();
    expect(host.querySelector('[data-learning-session]')).toBeTruthy();

    (host.querySelector('[data-session-stage="learn"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-lesson.inline')).toBeTruthy();
    expect(document.documentElement.classList.contains('yz-learning-study')).toBe(true);
  });

  it('exits practice and coach through the shared session escape path', async () => {
    const host = await mountPage();
    (host.querySelector('[data-page="practice"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-quiz')).toBeTruthy();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(host.querySelector('[data-learning-session]')).toBeNull();
    expect(host.querySelector('.lv2-continue')).toBeTruthy();

    (host.querySelector('[data-page="lesson"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-learning-session] .session-action') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-session-coach-surface')).toBeTruthy();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(host.querySelector('[data-learning-session]')).toBeNull();
  });

  it('renders a textbook TOC on the overview and quick-navigation panes inside the lesson', async () => {
    const host = await mountPage();
    expect(host.querySelector('.lv2-textbook-toc')).toBeTruthy();

    (host.querySelector('.lv2-upnext button') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('.lv2-lesson-body .lv2-lesson-toc')).toBeTruthy();
    expect(host.querySelector('.lv2-lesson-body .lv2-lesson-notes')).toBeTruthy();
    expect(host.querySelectorAll('.lv2-lesson-body .rpane')).toHaveLength(2);
    const tocCourse = host.querySelector('.lv2-lesson-toc section button') as HTMLButtonElement;
    expect(tocCourse).toBeTruthy();
  });
});
