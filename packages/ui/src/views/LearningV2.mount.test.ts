// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import LearningV2 from './LearningV2.vue';
import { setLead, setMode } from '../stores/mode';

const apiState = vi.hoisted(() => ({
  get: vi.fn(async (): Promise<{ data: { lessonIds: string[] } }> => ({ data: { lessonIds: [] } })),
  post: vi.fn(async () => ({ data: { ok: true } })),
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
  document.body.style.overflow = '';
  apiState.get.mockClear();
  apiState.post.mockClear();
  apiState.get.mockResolvedValue({ data: { lessonIds: [] } });
  apiState.post.mockResolvedValue({ data: { ok: true } });
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
  return host;
}

afterEach(() => {
  setLead('learning', 'human');
  setMode('office');
  app?.unmount();
  app = null;
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
    expect(css).toMatch(/\.lv2-studio-immersive \{[^}]*position: fixed;[^}]*inset: 0;[^}]*overflow: hidden;/);
    expect(css).toMatch(/\.lv2-studio-immersive-body \{[^}]*min-height: 0;[^}]*overflow-y: auto;/);
    expect(css).toMatch(/\.lv2-specialized-study \{[^}]*background: var\(--skin-panel-bg-strong/);
    expect(css).not.toMatch(/\.lv2-specialized-study-surface \{[^}]*backdrop-filter/);
    expect(css).toMatch(/\.lv2-subject-list \{[^}]*scrollbar-width: thin;/);
    expect(css).toMatch(/\.lv2-subject-list::-webkit-scrollbar \{[^}]*width: 8px;/);
    expect(css).toMatch(/\.lv2-library-shell \{[^}]*width: 100%;[^}]*align-items: stretch;/);
    expect(libraryCss).toMatch(/\.ll-library \{[^}]*width: 100%;[^}]*height: 100%;/);
  });

  it('uses neutral surfaces for course selection instead of flooding the page with subject tint', () => {
    const css = readFileSync(resolve(__dirname, 'learning-v2.css'), 'utf8');
    const libraryCss = readFileSync(resolve(__dirname, '../components/learning/v2/learning-library.css'), 'utf8');

    expect(css).toMatch(/\.lv2-subject:hover, \.lv2-subject\.active \{[^}]*background: #f2f4f2;/);
    expect(css).toMatch(/\.lv2-roadmap-track \{[^}]*background: color-mix/);
    expect(css).toMatch(/\.lv2-roadmap-list > button\.active \{[^}]*background: color-mix/);
    expect(libraryCss).toMatch(/\.ll-nav nav button\.active \{[^}]*background: #f1f4f2;[^}]*color: #26352f;/);
    expect(libraryCss).toMatch(/\.ll-detail-actions button:last-child[^{]*\{[^}]*background: #17211e;/);
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
    expect(host.querySelector('.lv2-lesson > header b')?.textContent).toContain(title);
    expect(host.querySelector('[data-page="lesson"]')).toBeNull();
  });

  it('numbers the current course and every upcoming course so order is unambiguous', async () => {
    const host = await mountPage();

    expect(host.querySelector('.lv2-continue span em')?.textContent).toContain('第 2 / 13 课');
    const orders = [...host.querySelectorAll('.lv2-upnext .lv2-course-order')]
      .map((item) => item.textContent?.trim());
    expect(orders).toEqual(['第 01 课', '第 03 课', '第 04 课', '第 05 课']);

    (host.querySelector('[data-page="roadmap"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-roadmap .lv2-course-order')?.textContent?.trim()).toBe('第 01 课');
  });

  it('collapses and restores the desktop subject sidebar from a persistent preference', async () => {
    localStorage.setItem('yz.learning.v2.subjects-collapsed.v1', '1');
    const host = await mountPage();

    expect(host.querySelector('.lv2')?.classList.contains('subjects-collapsed')).toBe(true);
    const expand = host.querySelector('[aria-label="展开学习科目栏"]') as HTMLButtonElement;
    expect(expand).toBeTruthy();

    expand.click();
    await nextTick();

    expect(host.querySelector('.lv2')?.classList.contains('subjects-collapsed')).toBe(false);
    expect(localStorage.getItem('yz.learning.v2.subjects-collapsed.v1')).toBe('0');
    expect(host.querySelector('[aria-label="收起学习科目栏"]')).toBeTruthy();
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
    expect(host.querySelectorAll('[data-subject]')).toHaveLength(22);
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
    expect(host.textContent).toContain('卡/NFC安全');
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
    expect(host.querySelector('.lv2-specialized-study-bar')?.textContent).toContain('多语言安全编码');
  });

  it('opens the programming course center and enters the Java zero-base lesson', async () => {
    const host = await mountPage();
    (host.querySelector('[data-subject="programming"]') as HTMLButtonElement).click();
    await nextTick();

    const javaCourse = host.querySelector('[data-programming-course="java-enterprise"]') as HTMLButtonElement;
    expect(javaCourse).toBeTruthy();
    expect(host.textContent).toContain('中间件源码');
    javaCourse.click();
    await nextTick();

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
  });

  it('opens a project-training phase as the same immersive single-step lesson', async () => {
    const host = await mountPage();
    (host.querySelector('[data-subject="programming"]') as HTMLButtonElement).click();
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
    expect(host.textContent).toContain('Studio 企业官网');
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
    expect(host.querySelector('.lv2-step-check')?.textContent).toContain('合上提示再回答');
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
    expect(host.querySelectorAll('.lv2-lesson-copy p').length).toBeGreaterThanOrEqual(3);
    expect(copy).toContain('1919 年爆发的五四运动');
    expect(copy).toContain('1921 年 7 月');
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

    (host.querySelector('.lv2-ai-actions button') as HTMLButtonElement).click();
    await nextTick();

    expect(host.querySelector('.lv2')?.classList.contains('is-learning-ai')).toBe(false);
    expect(host.querySelector('.lv2-subjects')).toBeTruthy();
    expect(host.querySelector('.lv2-workspace')).toBeTruthy();
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
    apiState.get.mockImplementationOnce(() => new Promise<{ data: { lessonIds: string[] } }>((resolve) => {
      resolveParty = resolve;
    }));
    const host = await mountPage();

    (host.querySelector('[data-subject="security"]') as HTMLButtonElement).click();
    await nextTick();
    await vi.waitFor(() => expect(apiState.get).toHaveBeenCalledTimes(2));

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

    expect(host.querySelector('.lv2-lesson > header span')?.textContent).toContain('3/5');
  });

  it('exits the immersive lesson with Escape and restores the overview', async () => {
    const host = await mountPage();
    (host.querySelector('[data-page="lesson"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-lesson')).toBeTruthy();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();

    expect(host.querySelector('.lv2-lesson')).toBeNull();
    expect(host.textContent).toContain('零基础起点');
  });

  it('makes the overview inert and keeps keyboard focus inside the immersive lesson', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    app = createApp(LearningV2);
    app.use(createPinia());
    app.mount(root);
    await nextTick();

    (root.querySelector('[data-page="lesson"]') as HTMLButtonElement).click();
    await nextTick();

    const lesson = document.querySelector('.lv2-lesson') as HTMLElement;
    expect(lesson).toBeTruthy();
    expect(root.hasAttribute('inert')).toBe(true);
    expect(root.getAttribute('aria-hidden')).toBe('true');

    const last = lesson.querySelector('footer button:last-child') as HTMLButtonElement;
    last.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect((document.activeElement as HTMLElement | null)?.closest('.lv2-lesson')).toBe(lesson);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(document.querySelector('.lv2-lesson')).toBeNull();
    expect(root.hasAttribute('inert')).toBe(false);
    expect(root.hasAttribute('aria-hidden')).toBe(false);
  });

  it('exits the immersive lesson from both header controls', async () => {
    const host = await mountPage();
    (host.querySelector('.lv2-pages [data-page="lesson"]') as HTMLButtonElement).click();
    await nextTick();

    (host.querySelector('.lv2-lesson [data-action="exit-lesson"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-lesson')).toBeNull();

    (host.querySelector('.lv2-pages [data-page="lesson"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('.lv2-lesson [aria-label="关闭课程"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.lv2-lesson')).toBeNull();
  });

  it('keeps an explicit return-to-subject action on books and practice pages', async () => {
    const host = await mountPage();

    (host.querySelector('[data-page="books"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('[data-action="back-to-subject"]')?.textContent).toContain('返回学科');

    (host.querySelector('[data-page="practice"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('[data-action="back-to-subject"]')?.textContent).toContain('返回学科');
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
    const resizeHandle = host.querySelector('[role="separator"]') as HTMLElement;

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

    (host.querySelector('[data-subject="zhouyi"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.dv-root')).toBeTruthy();
    expect(host.textContent).toContain('梅花易数');
    expect(host.textContent).toContain('大衍筮法');
    expect(host.textContent).toContain('民俗文化体验 · 教学演示');
  });

  it('opens practice in a full-screen immersive workspace with its own scroll and Escape exit', async () => {
    const host = await mountPage();
    (host.querySelector('[data-page="studio"]') as HTMLButtonElement).click();
    await nextTick();
    await nextTick();

    const shell = host.querySelector('.lv2-studio-immersive') as HTMLElement;
    const body = host.querySelector('.lv2-studio-immersive-body') as HTMLElement;
    expect(shell).toBeTruthy();
    expect(body).toBeTruthy();
    expect(host.querySelector('.lv2-study-rail')).toBeNull();
    expect(document.body.style.overflow).toBe('hidden');

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
});
