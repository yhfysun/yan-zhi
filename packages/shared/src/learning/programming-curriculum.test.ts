import { describe, expect, it } from 'vitest';
import {
  JAVA_ENTERPRISE_COURSE,
  PROGRAMMING_CURRICULUM_PHASES,
  PROGRAMMING_COURSE_PACKAGES,
  PROGRAMMING_PROJECTS,
  PROGRAMMING_PROJECT_COURSE_SEEDS,
  getCoursePracticeTask,
  getLearningV2CoursePlan,
  getLearningV2Subject,
  getLearningV2Subjects,
  isLearningV2CourseReady,
} from './v2.js';

describe('Learning V2 programming curriculum', () => {
  it('registers programming as a complete subject with algorithms separated', () => {
    const subjects = getLearningV2Subjects();
    const programming = getLearningV2Subject('programming');

    expect(subjects).toHaveLength(21);
    expect(programming).toBeTruthy();
    expect(programming!.tracks).toHaveLength(16);
    expect(programming!.courses.length).toBeGreaterThanOrEqual(50);
    expect(programming!.current.course).toBeTruthy();
    expect(programming!.lesson.steps.length).toBeGreaterThanOrEqual(5);
  });

  it('models each language as a standalone course package with staged lessons', () => {
    const programming = getLearningV2Subject('programming')!;
    expect(PROGRAMMING_COURSE_PACKAGES).toHaveLength(17);
    expect(PROGRAMMING_CURRICULUM_PHASES.map((phase) => phase.step)).toEqual(
      Array.from({ length: PROGRAMMING_CURRICULUM_PHASES.length }, (_, index) => index + 1),
    );
    expect(PROGRAMMING_CURRICULUM_PHASES.flatMap((phase) =>
      phase.courses.map((course) => course.courseId),
    )).toEqual(PROGRAMMING_COURSE_PACKAGES.map((course) => course.id));
    expect(PROGRAMMING_COURSE_PACKAGES[0].id).toBe('programming-foundations');
    expect(PROGRAMMING_COURSE_PACKAGES.at(-1)?.id).toBe('software-engineering');
    expect(PROGRAMMING_COURSE_PACKAGES.every((course) => course.status === 'ready')).toBe(true);
    expect(PROGRAMMING_COURSE_PACKAGES.reduce((sum, course) => sum + course.readyLessons, 0)).toBe(714);
    expect(new Set(PROGRAMMING_COURSE_PACKAGES.flatMap((course) =>
      course.stages.flatMap((stage) => stage.lessons.map((lesson) => lesson.courseName)),
    )).size).toBe(714);
    expect(JAVA_ENTERPRISE_COURSE.totalLessons).toBe(110);
    expect(JAVA_ENTERPRISE_COURSE.readyLessons).toBe(110);
    expect(JAVA_ENTERPRISE_COURSE.stages).toHaveLength(12);
    expect(JAVA_ENTERPRISE_COURSE.stages[0].lessons).toHaveLength(8);
    expect(JAVA_ENTERPRISE_COURSE.stages[1].lessons).toHaveLength(14);

    const readyJavaLessons = JAVA_ENTERPRISE_COURSE.stages
      .flatMap((stage) => stage.lessons)
      .filter((lesson) => lesson.status === 'ready');
    expect(readyJavaLessons).toHaveLength(110);
    expect(new Set(readyJavaLessons.map((lesson) => lesson.courseName)).size).toBe(110);
    for (const lesson of readyJavaLessons) {
      expect(programming.courses.some((course) => course.name === lesson.courseName), lesson.courseName).toBe(true);
      expect(getLearningV2CoursePlan('programming', lesson.courseName).qualityStatus).toBe('curated');
    }

    const middleware = PROGRAMMING_COURSE_PACKAGES.find((course) => course.id === 'middleware-source');
    expect(middleware?.title).toContain('Kafka');
    expect(middleware?.stages.map((stage) => stage.title).join(' ')).toContain('Redis');
    const javaText = JAVA_ENTERPRISE_COURSE.stages.map((stage) => `${stage.title} ${stage.goal}`).join(' ');
    expect(javaText).toContain('Kafka');
    expect(javaText).toContain('多数据源');
  });

  it('builds every non-Java language around its own runtime, frameworks, source anchors and capstone', () => {
    const courseIds = [
      'html5', 'css3', 'javascript', 'typescript', 'vue3', 'react',
      'python-enterprise', 'go-cloud', 'c-systems', 'cpp-performance',
      'middleware-source', 'ai-programming', 'software-engineering',
      'testing-quality', 'security-engineering',
    ];
    for (const id of courseIds) {
      const course = PROGRAMMING_COURSE_PACKAGES.find((item) => item.id === id)!;
      expect(course.stages.length, id).toBeGreaterThanOrEqual(6);
      expect(course.readyLessons, id).toBeGreaterThanOrEqual(24);
      expect(course.runtime.length, id).toBeGreaterThan(10);
      expect(course.toolchain.length, id).toBeGreaterThan(10);
      expect(course.frameworks.length, id).toBeGreaterThan(10);
      expect(course.sourceAnchors.length, id).toBeGreaterThanOrEqual(3);
      expect(course.capstone.length, id).toBeGreaterThan(20);
    }

    const searchable = PROGRAMMING_COURSE_PACKAGES
      .flatMap((course) => [
        course.runtime,
        course.toolchain,
        course.frameworks,
        course.capstone,
        ...course.sourceAnchors,
        ...course.stages.map((stage) => stage.title),
      ])
      .join('\n');
    for (const keyword of [
      'DevTools', 'Vite', 'TypeScript Compiler', 'Vue DevTools', 'React DevTools',
      'CPython', 'py-spy', 'go test', 'pprof', 'CMake Presets', 'ASan',
      'UnifiedLog', 'HikariCP', 'MCP', 'Helm', 'Argo CD', 'SRE',
    ]) {
      expect(searchable, keyword).toContain(keyword);
    }
  });

  it('covers every requested language, framework, platform and delivery capability', () => {
    const programming = getLearningV2Subject('programming');
    const searchable = [
      programming!.line,
      ...programming!.tracks.map((track) => `${track.name} ${track.note}`),
      ...programming!.courses.map((course) => `${course.trackName} ${course.name}`),
    ].join('\n');

    for (const keyword of [
      'HTML', 'CSS', 'JavaScript', 'TypeScript', 'Vue', 'React',
      'Java', 'JVM', 'Spring', 'Spring Boot', 'Spring AI', 'MyBatis',
      'Spring 家族源码', 'SSE', 'WebFlux', '背压', 'JDK 8',
      'Records', 'Virtual Threads',
      'Python', 'Go', 'C++', 'Docker', 'Kubernetes', 'Apollo',
      '负载均衡', 'CI/CD', 'OpenTelemetry', '架构', '项目管理',
    ]) {
      expect(searchable, keyword).toContain(keyword);
    }
  });

  it('publishes only complete, source-backed programming lessons', () => {
    const programming = getLearningV2Subject('programming')!;

    for (const course of programming.courses) {
      const plan = getLearningV2CoursePlan('programming', course.name);
      expect(isLearningV2CourseReady('programming', course.name), course.name).toBe(true);
      expect(plan.qualityStatus, course.name).toBe('curated');
      expect(plan.steps, course.name).toHaveLength(5);
      expect(plan.prerequisite.length, course.name).toBeGreaterThan(8);
      expect(plan.plainLanguageGoal.length, course.name).toBeGreaterThan(30);
      expect(plan.guidedPractice.length, course.name).toBeGreaterThan(30);
      expect(plan.independentPractice.length, course.name).toBeGreaterThan(30);
      expect(plan.commonErrors.length, course.name).toBeGreaterThanOrEqual(2);
      expect(plan.sourceRefs.length, course.name).toBeGreaterThanOrEqual(2);
      expect(plan.sourceRefs.some((source) => source.includes('https://')), course.name).toBe(true);
      expect(plan.steps.every((step) => step.body.length >= 60), course.name).toBe(true);
      expect(new Set(plan.steps.map((step) => step.body)).size, course.name).toBe(5);
    }
  });

  it('keeps Java and the enterprise delivery path at source/runtime depth', () => {
    const programming = getLearningV2Subject('programming')!;
    const text = programming.courses.map((course) => course.name).join('\n');

    for (const keyword of [
      'ArrayList', 'HashMap', 'ConcurrentHashMap', 'ThreadPoolExecutor',
      '类加载', 'JVM 内存', 'GC', 'JIT', 'JFR', 'Spring IoC', 'AOP',
      '事务', 'Spring AI', 'MyBatis', 'Spring Security', 'Spring Cloud',
      'Kubernetes', 'Helm',
      'Apollo', '负载均衡', '回滚', '可观测性',
    ]) {
      expect(text, keyword).toContain(keyword);
    }
  });

  it('gives every programming course a concrete project or operational output', () => {
    const programming = getLearningV2Subject('programming')!;

    for (const course of programming.courses) {
      const practice = getCoursePracticeTask('programming', course.name);
      expect(practice.task, course.name).toContain(course.name);
      expect(practice.output.length, course.name).toBeGreaterThan(8);
      expect(practice.boundary.length, course.name).toBeGreaterThan(8);
    }
  });

  it('provides thirteen complete project-training lines with different architecture shapes', () => {
    expect(PROGRAMMING_PROJECTS).toHaveLength(13);
    expect(PROGRAMMING_PROJECT_COURSE_SEEDS).toHaveLength(130);
    expect(new Set(PROGRAMMING_PROJECT_COURSE_SEEDS.map((course) => course.name)).size).toBe(130);
    expect(new Set(PROGRAMMING_PROJECTS.map((project) => project.id)).size).toBe(13);
    expect(PROGRAMMING_PROJECTS.map((project) => project.kind)).toEqual(expect.arrayContaining([
      'frontend',
      'fullstack',
      'modular-monolith',
      'microservices',
      'ai-streaming',
      'cloud-native',
      'systems',
      'delivery-platform',
      'realtime',
      'data',
      'security-product',
      'developer-tools',
    ]));

    const lifecycle = [
      '业务理解与用户任务',
      '范围、验收与非功能目标',
      'API 契约与前端数据边界',
      '数据模型、约束与迁移',
      '项目骨架、模块边界与本地环境',
      '后端核心链路与异常恢复',
      '前端页面、状态与可访问交互',
      '联调、测试、安全与性能',
      '容器、CI/CD、可观测与发布',
      '故障演练、回滚与项目答辩',
    ];
    for (const project of PROGRAMMING_PROJECTS) {
      expect(project.phases.map((phase) => phase.title), project.id).toEqual(lifecycle);
      expect(project.stack.length, project.id).toBeGreaterThanOrEqual(5);
      expect(project.deliverables.length, project.id).toBeGreaterThanOrEqual(4);
      expect(project.metrics.length, project.id).toBeGreaterThanOrEqual(4);
      for (const phase of project.phases) {
        expect(phase.actions.length, phase.courseName).toBeGreaterThanOrEqual(3);
        expect(phase.outputs.length, phase.courseName).toBeGreaterThanOrEqual(3);
        const plan = getLearningV2CoursePlan('programming', phase.courseName);
        expect(plan.qualityStatus, phase.courseName).toBe('curated');
        expect(plan.steps, phase.courseName).toHaveLength(5);
        expect(plan.steps.every((step) => step.body.length >= 60), phase.courseName).toBe(true);
        expect(plan.sourceRefs.length, phase.courseName).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('keeps the project training track enterable from the programming subject', () => {
    const programming = getLearningV2Subject('programming')!;
    const projectTrack = programming.tracks.find((track) => track.name === 'P15 · 综合训练项目');
    expect(projectTrack).toBeTruthy();
    expect(projectTrack!.courses).toHaveLength(130);

    for (const project of PROGRAMMING_PROJECTS) {
      for (const phase of project.phases) {
        expect(projectTrack!.courses.some((course) => course.name === phase.courseName), phase.courseName).toBe(true);
        expect(isLearningV2CourseReady('programming', phase.courseName), phase.courseName).toBe(true);
      }
    }
  });
});
