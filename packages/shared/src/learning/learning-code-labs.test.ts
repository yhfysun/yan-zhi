import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platform } from 'node:process';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { LearningV2CodeLab } from './v2-types.js';
import { getLearningV2CoursePlan } from './v2.js';
import { LEARNING_CODE_LABS_GO } from './learning-code-labs-go.js';
import { LEARNING_CODE_LABS_GO_ADVANCED } from './learning-code-labs-go-advanced.js';
import { LEARNING_CODE_LABS_GO_REMAINING } from './learning-code-labs-go-remaining.js';
import { LEARNING_V2_CODE_LABS } from './learning-code-labs.js';

const goLabEntries = [
  ...Object.entries(LEARNING_CODE_LABS_GO),
  ...Object.entries(LEARNING_CODE_LABS_GO_ADVANCED),
  ...Object.entries(LEARNING_CODE_LABS_GO_REMAINING),
];
const javascriptLabEntries = Object.entries(LEARNING_V2_CODE_LABS)
  .filter(([, lab]) => lab.practice.defaultLanguage === 'javascript'
    || lab.apply.defaultLanguage === 'javascript');
const pythonLabEntries = Object.entries(LEARNING_V2_CODE_LABS)
  .filter(([, lab]) => lab.practice.defaultLanguage === 'python'
    || lab.apply.defaultLanguage === 'python');
const typescriptLabEntries = Object.entries(LEARNING_V2_CODE_LABS)
  .filter(([, lab]) => lab.practice.defaultLanguage === 'typescript'
    || lab.apply.defaultLanguage === 'typescript');
const javaLabEntries = Object.entries(LEARNING_V2_CODE_LABS)
  .filter(([, lab]) => lab.practice.defaultLanguage === 'java'
    || lab.apply.defaultLanguage === 'java');
const nativeLabEntries = Object.entries(LEARNING_V2_CODE_LABS)
  .filter(([, lab]) => ['c', 'cpp'].includes(lab.practice.defaultLanguage)
    || ['c', 'cpp'].includes(lab.apply.defaultLanguage));
const htmlLabEntries = Object.entries(LEARNING_V2_CODE_LABS)
  .filter(([, lab]) => lab.practice.defaultLanguage === 'html'
    || lab.apply.defaultLanguage === 'html');

function verifyJavascriptCourseLab(key: string, lab: LearningV2CodeLab): void {
  const dir = mkdtempSync(join(tmpdir(), 'learning-js-code-lab-'));
  try {
    for (const mode of ['practice', 'apply'] as const) {
      const task = lab[mode];
      if (task.defaultLanguage !== 'javascript') continue;
      const source = task.starterCode.javascript;
      expect(source, `${key} / ${mode}`).toBeTruthy();
      if (!source) throw new Error(`${key} / ${mode}: missing JavaScript source`);
      const taskDir = join(dir, task.id);
      mkdirSync(taskDir, { recursive: true });
      const file = join(taskDir, 'main.js');
      writeFileSync(file, source, 'utf8');
      const result = spawnSync(process.execPath, [file], {
        encoding: 'utf8',
        input: task.stdin || '',
        timeout: 15_000,
      });
      expect(
        result.status,
        `${task.id}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      ).toBe(0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function verifyPythonCourseLab(key: string, lab: LearningV2CodeLab): void {
  const python = process.env.PYTHON || (platform === 'win32' ? 'python' : 'python3');
  const dir = mkdtempSync(join(tmpdir(), 'learning-python-code-lab-'));
  try {
    for (const mode of ['practice', 'apply'] as const) {
      const task = lab[mode];
      if (task.defaultLanguage !== 'python') continue;
      const source = task.starterCode.python;
      expect(source, `${key} / ${mode}`).toBeTruthy();
      if (!source) throw new Error(`${key} / ${mode}: missing Python source`);
      const file = join(dir, `${task.id}.py`);
      writeFileSync(file, source, 'utf8');
      const result = spawnSync(python, [file], {
        encoding: 'utf8',
        input: task.stdin || '',
        timeout: 10_000,
      });
      expect(
        result.status,
        `${task.id}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      ).toBe(0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function verifyTypescriptCourseLab(key: string, lab: LearningV2CodeLab): void {
  const dir = mkdtempSync(join(tmpdir(), 'learning-ts-code-lab-'));
  try {
    for (const mode of ['practice', 'apply'] as const) {
      const task = lab[mode];
      if (task.defaultLanguage !== 'typescript') continue;
      const source = task.starterCode.typescript;
      expect(source, `${key} / ${mode}`).toBeTruthy();
      if (!source) throw new Error(`${key} / ${mode}: missing TypeScript source`);
      const file = join(dir, `${task.id}.ts`);
      writeFileSync(file, source, 'utf8');
      const result = spawnSync(process.execPath, ['--experimental-strip-types', file], {
        encoding: 'utf8',
        input: task.stdin || '',
        timeout: 15_000,
      });
      expect(
        result.status,
        `${task.id}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      ).toBe(0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function verifyJavaCourseLab(key: string, lab: LearningV2CodeLab): void {
  const dir = mkdtempSync(join(tmpdir(), 'learning-java-code-lab-'));
  try {
    for (const mode of ['practice', 'apply'] as const) {
      const task = lab[mode];
      if (task.defaultLanguage !== 'java') continue;
      const source = task.starterCode.java;
      expect(source, `${key} / ${mode}`).toBeTruthy();
      if (!source) throw new Error(`${key} / ${mode}: missing Java source`);
      const sourceFile = join(dir, 'Main.java');
      writeFileSync(sourceFile, source, 'utf8');
      const compile = spawnSync('javac', ['-encoding', 'UTF-8', sourceFile], {
        encoding: 'utf8',
        timeout: 20_000,
      });
      expect(
        compile.status,
        `${task.id}\nstdout:\n${compile.stdout}\nstderr:\n${compile.stderr}`,
      ).toBe(0);
      const result = spawnSync('java', ['-cp', dir, 'Main'], {
        encoding: 'utf8',
        input: task.stdin || '',
        timeout: 10_000,
      });
      expect(
        result.status,
        `${task.id}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      ).toBe(0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function verifyNativeCourseLab(key: string, lab: LearningV2CodeLab): void {
  const dir = mkdtempSync(join(tmpdir(), 'learning-native-code-lab-'));
  const compilers = {
    c: spawnSync('gcc', ['--version'], { encoding: 'utf8' }).status === 0 ? 'gcc' : '',
    cpp: spawnSync('g++', ['--version'], { encoding: 'utf8' }).status === 0 ? 'g++' : '',
  };
  try {
    for (const mode of ['practice', 'apply'] as const) {
      const task = lab[mode];
      const language = task.defaultLanguage;
      if (language !== 'c' && language !== 'cpp') continue;
      const compiler = compilers[language];
      if (!compiler) continue;
      const source = task.starterCode[language];
      expect(source, `${key} / ${mode}`).toBeTruthy();
      if (!source) throw new Error(`${key} / ${mode}: missing native source`);
      const extension = language === 'c' ? 'c' : 'cpp';
      const standard = language === 'c' ? 'c17' : 'c++20';
      const sourceFile = join(dir, `${task.id}.${extension}`);
      const executable = join(dir, `${task.id}${platform === 'win32' ? '.exe' : ''}`);
      writeFileSync(sourceFile, source, 'utf8');
      const compile = spawnSync(compiler, [`-std=${standard}`, sourceFile, '-o', executable], {
        encoding: 'utf8',
        timeout: 20_000,
      });
      expect(
        compile.status,
        `${task.id}\nstdout:\n${compile.stdout}\nstderr:\n${compile.stderr}`,
      ).toBe(0);
      const result = spawnSync(executable, [], {
        encoding: 'utf8',
        input: task.stdin || '',
        timeout: 10_000,
      });
      expect(
        result.status,
        `${task.id}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      ).toBe(0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function verifyGoCourseLab(key: string, lab: (typeof goLabEntries)[number][1]): void {
  const dir = mkdtempSync(join(tmpdir(), 'learning-go-code-lab-'));
  try {
    for (const mode of ['practice', 'apply'] as const) {
      const task = lab[mode];
      const source = task.starterCode.go;
      expect(source, `${key} / ${mode}`).toBeTruthy();
      if (!source) throw new Error(`${key} / ${mode}: missing Go source`);
      const sourceFile = join(dir, 'main.go');
      const executable = join(dir, platform === 'win32' ? 'program.exe' : 'program');
      writeFileSync(sourceFile, source, 'utf8');
      const compile = spawnSync('go', ['build', '-trimpath', '-o', executable, sourceFile], {
        cwd: dir,
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          ...process.env,
          GOTOOLCHAIN: 'local',
          GO111MODULE: 'off',
        },
      });
      expect(
        compile.status,
        `${task.id}\nstdout:\n${compile.stdout}\nstderr:\n${compile.stderr}`,
      ).toBe(0);
      const result = spawnSync(executable, [], {
        encoding: 'utf8',
        input: task.stdin || '',
        timeout: 10_000,
      });
      expect(
        result.status,
        `${task.id}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      ).toBe(0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('Learning V2 handwritten code labs', () => {
  it('ships a Java environment and real first-program lab in the first Java lesson', () => {
    const plan = getLearningV2CoursePlan(
      'programming',
      'Java 零基础：JDK、IDE 与第一个程序',
    );

    expect(plan.codeLab?.requiredRuntime).toBe('java');
    expect(plan.codeLab?.languages).toEqual(['java']);
    expect(plan.codeLab?.downloadUrl).toContain('adoptium.net');
    expect(plan.codeLab?.practice.starterCode.java).toContain('System.getProperty("java.version")');
    expect(plan.codeLab?.apply.starterCode.java).toContain('public class Main');
    expect(plan.codeLab?.apply.checkpoint).toContain('javac');
    expect(plan.steps[0].example?.code).toContain('javac -version');
    expect(plan.steps[2].example?.code).toContain('public class Main');
  });

  it('ships a runnable algorithm model lab in the first algorithm lesson', () => {
    const plan = getLearningV2CoursePlan(
      'algorithms',
      '算法与数据结构 · 复杂度、正确性与测量：输入规模与大 O',
    );

    expect(plan.codeLab?.practice.defaultLanguage).toBe('javascript');
    expect(plan.codeLab?.practice.starterCode.javascript).toContain('pairChecks');
    expect(plan.codeLab?.apply.starterCode.javascript).toContain('comparisons');
    expect(plan.codeLab?.practice.checkpoint).toContain('n=10');
  });

  it('ships real Node labs across all F0-F1 programming foundation lessons', () => {
    const courseNames = [
      '编程通识 · 计算机、终端与版本控制：操作系统、Shell、PATH 与进程',
      '编程通识 · 计算机、终端与版本控制：文件、权限、编码与日志',
      '编程通识 · 计算机、终端与版本控制：Git 对象、暂存区与提交',
      '编程通识 · 计算机、终端与版本控制：分支、合并与冲突恢复',
      '编程通识 · 计算机、终端与版本控制：包管理器与版本锁定',
      '编程通识 · 计算机、终端与版本控制：编辑器、终端与远程开发',
      '编程通识 · 数据结构与算法基础：复杂度、常数与真实数据规模',
      '编程通识 · 数据结构与算法基础：数组、链表与缓存局部性',
      '编程通识 · 数据结构与算法基础：哈希表、冲突与扩容',
      '编程通识 · 数据结构与算法基础：树、堆、排序与搜索',
      '编程通识 · 数据结构与算法基础：图、遍历与最短路径直觉',
      '编程通识 · 数据结构与算法基础：算法选型与可验证基准',
    ];
    for (const courseName of courseNames) {
      const plan = getLearningV2CoursePlan('programming', courseName);
      expect(plan.codeLab?.requiredRuntime, courseName).toBe('node');
      expect(plan.codeLab?.languages, courseName).toEqual(['javascript']);
      expect(plan.codeLab?.practice.starterCode.javascript, courseName).toContain('console.log');
      expect(plan.codeLab?.apply.starterCode.javascript, courseName).toContain('console.log');
    }
  });

  it('keeps HTML browser-preview labs complete, offline and script-free', () => {
    for (const [key, lab] of htmlLabEntries) {
      expect(lab.requiredRuntime, key).toBeUndefined();
      expect(lab.languages, key).toEqual(['html']);
      for (const mode of ['practice', 'apply'] as const) {
        const task = lab[mode];
        const source = task.starterCode.html || '';
        expect(source.toLowerCase(), `${key} / ${mode}`).toContain('<!doctype html>');
        expect(source.toLowerCase(), `${key} / ${mode}`).not.toContain('<script');
        expect(source.toLowerCase(), `${key} / ${mode}`).not.toContain('<iframe');
        expect(source.toLowerCase(), `${key} / ${mode}`).not.toContain('@import');
        expect(source.toLowerCase(), `${key} / ${mode}`).not.toContain('url(');
      }
    }
  });

  for (let start = 0; start < javascriptLabEntries.length; start += 10) {
    const batch = javascriptLabEntries.slice(start, start + 10);
    it(`executes JavaScript course labs ${start + 1}-${start + batch.length}`, () => {
      for (const [key, lab] of batch) verifyJavascriptCourseLab(key, lab);
    }, 120_000);
  }

  for (let start = 0; start < pythonLabEntries.length; start += 10) {
    const batch = pythonLabEntries.slice(start, start + 10);
    it(`executes Python course labs ${start + 1}-${start + batch.length}`, () => {
      const python = process.env.PYTHON || (platform === 'win32' ? 'python' : 'python3');
      if (spawnSync(python, ['--version'], { encoding: 'utf8' }).status !== 0) return;
      for (const [key, lab] of batch) verifyPythonCourseLab(key, lab);
    }, 120_000);
  }

  for (let start = 0; start < typescriptLabEntries.length; start += 10) {
    const batch = typescriptLabEntries.slice(start, start + 10);
    it(`executes TypeScript course labs ${start + 1}-${start + batch.length}`, () => {
      for (const [key, lab] of batch) verifyTypescriptCourseLab(key, lab);
    }, 120_000);
  }

  for (let start = 0; start < nativeLabEntries.length; start += 1) {
    const batch = nativeLabEntries.slice(start, start + 1);
    it(`compiles and executes native course lab ${start + 1}`, async () => {
      for (const [key, lab] of batch) verifyNativeCourseLab(key, lab);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }, 120_000);
  }

  for (let start = 0; start < javaLabEntries.length; start += 1) {
    const batch = javaLabEntries.slice(start, start + 1);
    it(`compiles and executes Java course lab ${start + 1}`, async () => {
      if (spawnSync('javac', ['-version'], { encoding: 'utf8' }).status !== 0) return;
      for (const [key, lab] of batch) verifyJavaCourseLab(key, lab);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }, 120_000);
  }

  for (let start = 0; start < goLabEntries.length; start += 1) {
    const batch = goLabEntries.slice(start, start + 1);
    it(`builds and executes Go course lab ${start + 1}`, async () => {
      if (spawnSync('go', ['version'], { encoding: 'utf8' }).status !== 0) return;
      for (const [key, lab] of batch) verifyGoCourseLab(key, lab);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }, 120_000);
  }

  it('wires every registered code lab to an existing course', () => {
    const taskIds = new Map<string, string>();
    const sources = new Map<string, string>();
    for (const [key, lab] of Object.entries(LEARNING_V2_CODE_LABS)) {
      const separator = key.indexOf(':');
      expect(separator, key).toBeGreaterThan(0);
      const subjectKey = key.slice(0, separator);
      const courseName = key.slice(separator + 1);
      const plan = getLearningV2CoursePlan(subjectKey, courseName);
      expect(plan.courseName, key).toBe(courseName);
      expect(plan.codeLab?.title, key).toBe(lab.title);
      expect(lab.practice.id, key).not.toBe(lab.apply.id);
      expect(lab.practice.starterCode[lab.practice.defaultLanguage], key).toBeTruthy();
      expect(lab.apply.starterCode[lab.apply.defaultLanguage], key).toBeTruthy();
      for (const mode of ['practice', 'apply'] as const) {
        const task = lab[mode];
        const earlierTask = taskIds.get(task.id);
        expect(earlierTask, `${task.id} duplicated by ${key}`).toBeUndefined();
        taskIds.set(task.id, key);
        const source = task.starterCode[task.defaultLanguage]?.trim() || '';
        const earlierSource = sources.get(source);
        expect(earlierSource, `${task.id} duplicates source from ${earlierSource}`).toBeUndefined();
        sources.set(source, task.id);
      }
    }
  });
});
