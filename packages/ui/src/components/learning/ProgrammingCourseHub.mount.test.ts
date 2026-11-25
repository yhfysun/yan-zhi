// @vitest-environment jsdom
import { createApp, nextTick, type App } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ProgrammingCourseHub from './ProgrammingCourseHub.vue';
import {
  JAVA_ENTERPRISE_COURSE,
  PROGRAMMING_CURRICULUM_PHASES,
  PROGRAMMING_COURSE_PACKAGES,
  PROGRAMMING_PROJECTS,
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
  document.body.appendChild(host);
  app = createApp(ProgrammingCourseHub, {
    courses: PROGRAMMING_COURSE_PACKAGES,
    projects: PROGRAMMING_PROJECTS,
    onOpenLesson: (courseName: string) => opened.push(courseName),
  });
  app.mount(host);
  await nextTick();
  return { host, opened };
}

describe('ProgrammingCourseHub', () => {
  it('shows standalone language courses instead of a flat knowledge-point list', async () => {
    const { host } = await mount();
    expect(host.textContent).toContain('独立课程');
    expect(host.querySelectorAll('[data-programming-course]')).toHaveLength(PROGRAMMING_COURSE_PACKAGES.length);
    expect(host.textContent).toContain('Java 企业级后端');
    expect(host.textContent).toContain('中间件源码');
    expect(host.textContent).toContain('Kafka');
    expect(host.textContent).not.toContain('JVM GC、JIT 与 JFR 调优');
    expect(host.querySelectorAll('[data-programming-phase]')).toHaveLength(
      PROGRAMMING_CURRICULUM_PHASES.length,
    );
    expect(host.querySelector('[data-programming-phase]')?.textContent).toContain('编程通用、计算机与代码原理');
    expect(host.querySelector('[data-programming-course="programming-foundations"]')?.getAttribute('data-programming-order')).toBe('1');
    expect(host.querySelector('[data-programming-course="html5"]')?.getAttribute('data-programming-order')).toBe('2');
    expect(host.querySelector('[data-programming-course="java-enterprise"]')?.getAttribute('data-programming-order')).toBe('8');
  });

  it('opens the Java course from JDK setup and exposes J0/J1 staged lessons', async () => {
    const { host, opened } = await mount();
    (host.querySelector('[data-programming-course="java-enterprise"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.textContent).toContain('零基础环境与第一行代码');
    expect(host.textContent).toContain('Java 语言核心与面向对象');
    expect(host.textContent).toContain('Kafka、中间件与多数据源');
    expect(host.querySelectorAll('[data-programming-stage]')).toHaveLength(JAVA_ENTERPRISE_COURSE.stages.length);

    const firstLesson = host.querySelector('[data-programming-lesson-status="ready"]') as HTMLButtonElement;
    expect(firstLesson.textContent).toContain('JDK、IDE 与第一个程序');
    firstLesson.click();
    await nextTick();
    expect(opened).toEqual(['Java 零基础：JDK、IDE 与第一个程序']);
  });

  it('keeps planned stages explicit without pretending they are ready lessons', async () => {
    const { host } = await mount();
    (host.querySelector('[data-programming-course="java-enterprise"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.textContent).toContain('110 / 110课时开放');
    expect(host.querySelectorAll('[data-programming-stage-status="planned"]')).toHaveLength(0);
  });

  it('shows the selected language runtime, toolchain, frameworks and source anchors', async () => {
    const { host } = await mount();
    (host.querySelector('[data-programming-course="html5"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.textContent).toContain('完整课程');
    expect(host.textContent).toContain('Chrome、Firefox、Safari');
    expect(host.textContent).toContain('浏览器 DevTools');
    expect(host.textContent).toContain('WHATWG HTML');
    expect(host.textContent).toContain('语义化、可键盘操作');
    expect(host.querySelectorAll('[data-programming-stage]').length).toBeGreaterThanOrEqual(6);
    expect(host.textContent).not.toContain('Java 零基础样板课');
  });

  it('keeps the long course overview compact instead of leaving a blank title column', async () => {
    const { host } = await mount();
    (host.querySelector('[data-programming-course="middleware-source"]') as HTMLButtonElement).click();
    await nextTick();

    const head = host.querySelector('.programming-course-head') as HTMLElement;
    expect(head.querySelector('.programming-course-toolbar')).toBeTruthy();
    expect(head.querySelector('.programming-course-title-block h1')?.textContent)
      .toContain('Kafka、Redis、RabbitMQ');
    expect(head.querySelector('.programming-course-title-block h1')?.getAttribute('title'))
      .toContain('中间件与源码');
    expect(head.querySelector('[data-programming-course-summary]')?.textContent)
      .toContain('消息、缓存、配置和代理');
    expect(head.querySelector('[data-programming-course-progress]')?.textContent)
      .toContain('35 / 35');
    expect(head.querySelectorAll('.programming-course-facts > div')).toHaveLength(6);

    const source = readFileSync(resolve(__dirname, 'ProgrammingCourseHub.vue'), 'utf8');
    expect(source).toMatch(/\.programming-course-facts \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(/);
    expect(source).not.toMatch(/\.programming-course-head \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(260px/);
    expect(source).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.programming-course-facts \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
    expect(source).toMatch(/@media \(max-width: 520px\)[\s\S]*?\.programming-course-progress \{[\s\S]*?width: 100%;[\s\S]*?margin-left: 0;/);
    expect(source).toMatch(/@media \(max-width: 520px\)[\s\S]*?\.programming-course-facts \{ grid-template-columns: 1fr; \}/);
    expect(source).toMatch(/\.programming-course-title-block h1 \{[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/);
  });

  it('restores the selected course and stage after leaving and reopening learning', async () => {
    const first = await mount();
    (first.host.querySelector('[data-programming-course="java-enterprise"]') as HTMLButtonElement).click();
    await nextTick();
    (first.host.querySelector('[data-programming-stage="J1"] .programming-stage-toggle') as HTMLButtonElement).click();
    await nextTick();

    app?.unmount();
    document.body.innerHTML = '';
    app = null;

    const second = await mount();
    expect(second.host.textContent).toContain('Java 企业级后端');
    expect(second.host.querySelector('[data-programming-stage="J0"] .programming-stage-toggle')?.getAttribute('aria-expanded')).toBe('false');
    expect(second.host.querySelector('[data-programming-stage="J1"] .programming-stage-toggle')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens project training with different frontend, monolith, microservice and AI project types', async () => {
    const { host } = await mount();
    (host.querySelector('[data-learning-layer="projects"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.textContent).toContain('综合训练');
    expect(host.querySelectorAll('[data-programming-project]')).toHaveLength(PROGRAMMING_PROJECTS.length);
    expect(host.textContent).toContain('前端项目');
    expect(host.textContent).toContain('多模块单体');
    expect(host.textContent).toContain('微服务');
    expect(host.textContent).toContain('AI 全栈');

    (host.querySelector('[data-project-filter="microservices"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelectorAll('[data-programming-project]')).toHaveLength(1);
    expect(host.textContent).toContain('Orbit 内容社区微服务');
  });

  it('walks a project through requirements, API, data, implementation, delivery and operations', async () => {
    const { host, opened } = await mount();
    (host.querySelector('[data-learning-layer="projects"]') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('[data-programming-project="teamflow-saas"]') as HTMLButtonElement).click();
    await nextTick();

    expect(host.textContent).toContain('TeamFlow 多租户任务协作 SaaS');
    expect(host.textContent).toContain('多租户数据隔离');
    expect(host.textContent).toContain('对象级权限与审计');
    expect(host.textContent).toContain('项目运行图');
    expect(host.querySelectorAll('[data-programming-project-phase]')).toHaveLength(10);
    expect(host.textContent).toContain('API 契约与前端数据边界');
    expect(host.textContent).toContain('数据模型、约束与迁移');
    expect(host.textContent).toContain('故障演练、回滚与项目答辩');

    (host.querySelector('[data-programming-project-phase="03"] button') as HTMLButtonElement).click();
    await nextTick();
    expect(opened).toEqual(['综合训练 · TeamFlow 协作 SaaS · API 契约与前端数据边界']);
  });

});
