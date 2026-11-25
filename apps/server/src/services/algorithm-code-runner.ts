import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { findPython } from '@yan-zhi/core';
import {
  buildSpawnEnv,
  probeTool,
  resolveToolExe,
} from './dev-env.js';

export type AlgorithmCodeLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'java'
  | 'c'
  | 'cpp'
  | 'go';

export type AlgorithmCodeRuntime = {
  id: AlgorithmCodeLanguage;
  label: string;
  available: boolean;
  version: string;
  detail: string;
  bundled: boolean;
};

export type AlgorithmCodeRunResult = {
  ok: boolean;
  language: AlgorithmCodeLanguage;
  stdout: string;
  stderr: string;
  compileOutput: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  runtime: string;
};

const MAX_SOURCE_BYTES = 128 * 1024;
const MAX_INPUT_BYTES = 64 * 1024;
const MAX_OUTPUT_CHARS = 64 * 1024;
const COMPILE_TIMEOUT_MS = 12_000;
const RUN_TIMEOUT_MS = 6_000;

function cap(value: string): string {
  if (value.length <= MAX_OUTPUT_CHARS) return value;
  return `${value.slice(0, MAX_OUTPUT_CHARS)}\n…输出已截断（最多 ${MAX_OUTPUT_CHARS} 字符）`;
}

function executableSibling(exe: string, name: string): string {
  const candidate = path.join(path.dirname(exe), process.platform === 'win32' ? `${name}.exe` : name);
  return fs.existsSync(candidate) ? candidate : '';
}

async function commandVersion(exe: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  const result = await runProcess(exe, args, {
    cwd: os.tmpdir(),
    env,
    stdin: '',
    timeoutMs: 4_000,
  });
  const text = `${result.stdout}\n${result.stderr}`.trim();
  const match = text.match(/(?:version\s+)?(\d+(?:\.\d+){1,3}(?:[-+._a-zA-Z0-9]*)?)/i);
  return match?.[1] || text.split(/\r?\n/).find(Boolean)?.slice(0, 80) || '';
}

export async function listAlgorithmCodeRuntimes(): Promise<AlgorithmCodeRuntime[]> {
  const cfgEnv = buildSpawnEnv();
  const runtimes: AlgorithmCodeRuntime[] = [];

  const nodePath = resolveToolExe('node');
  const nodeBundled = !!process.versions.electron;
  runtimes.push({
    id: 'javascript',
    label: 'JavaScript / Node.js',
    available: true,
    version: process.versions.node,
    detail: nodeBundled ? '应用内置 Node.js，无需安装' : (nodePath || '使用当前服务端 Node.js'),
    bundled: nodeBundled,
  });
  runtimes.push({
    id: 'typescript',
    label: 'TypeScript / Node.js',
    available: Number(process.versions.node.split('.')[0]) >= 22,
    version: process.versions.node,
    detail: 'Node.js 原生类型擦除，直接运行 .ts 单文件任务',
    bundled: nodeBundled,
  });

  try {
    const python = await findPython();
    const version = await commandVersion(python, ['--version'], cfgEnv);
    runtimes.push({
      id: 'python',
      label: 'Python',
      available: true,
      version,
      detail: python,
      bundled: /[\\/]resources[\\/]python[\\/]/i.test(python),
    });
  } catch (error) {
    runtimes.push({
      id: 'python',
      label: 'Python',
      available: false,
      version: '',
      detail: error instanceof Error ? error.message : '未找到 Python',
      bundled: false,
    });
  }

  const javaExe = resolveToolExe('java');
  const javacExe = javaExe ? executableSibling(javaExe, 'javac') : '';
  const javaStatus = probeTool('java');
  runtimes.push({
    id: 'java',
    label: 'Java',
    available: !!javaExe && !!javacExe && javaStatus.ok,
    version: javaStatus.version,
    detail: javaExe && javacExe ? `${javaExe} · ${javacExe}` : '需要完整 JDK（java + javac）',
    bundled: false,
  });

  const cExe = resolveToolExe('c');
  const cStatus = probeTool('c');
  runtimes.push({
    id: 'c',
    label: 'C',
    available: !!cExe && cStatus.ok,
    version: cStatus.version,
    detail: cExe || cStatus.error || '未找到 GCC / Clang',
    bundled: false,
  });

  const cppExe = resolveToolExe('cpp');
  const cppStatus = probeTool('cpp');
  runtimes.push({
    id: 'cpp',
    label: 'C++',
    available: !!cppExe && cppStatus.ok,
    version: cppStatus.version,
    detail: cppExe || cppStatus.error || '未找到 G++ / Clang++',
    bundled: false,
  });

  const goExe = resolveToolExe('go');
  const goStatus = probeTool('go');
  runtimes.push({
    id: 'go',
    label: 'Go',
    available: !!goExe && goStatus.ok,
    version: goStatus.version,
    detail: goExe || goStatus.error || '未找到 Go',
    bundled: false,
  });

  return runtimes;
}

type ProcessResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
};

function terminateTree(child: ReturnType<typeof spawn>): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    try {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.unref();
    } catch { /* ignore */ }
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* ignore */ }
  }
}

function runProcess(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    stdin: string;
    timeoutMs: number;
  },
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      terminateTree(child);
    }, options.timeoutMs);
    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: cap(stdout),
        stderr: cap(stderr),
        exitCode,
        timedOut,
      });
    };
    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT_CHARS * 2) stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT_CHARS * 2) stderr += chunk.toString('utf8');
    });
    child.once('error', (error) => {
      stderr += error.message;
      finish(null);
    });
    child.once('close', (code) => finish(code));
    child.stdin?.end(options.stdin);
  });
}

function sourceFileName(language: AlgorithmCodeLanguage): string {
  if (language === 'javascript') return 'main.js';
  if (language === 'typescript') return 'main.ts';
  if (language === 'python') return 'main.py';
  if (language === 'java') return 'Main.java';
  if (language === 'c') return 'main.c';
  if (language === 'cpp') return 'main.cpp';
  return 'main.go';
}

function validateRequest(language: AlgorithmCodeLanguage, source: string, stdin: string): string {
  if (!['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'go'].includes(language)) {
    throw new Error('不支持的编程语言');
  }
  if (!source.trim()) throw new Error('代码不能为空');
  if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
    throw new Error(`代码不能超过 ${MAX_SOURCE_BYTES / 1024} KB`);
  }
  if (Buffer.byteLength(stdin, 'utf8') > MAX_INPUT_BYTES) {
    throw new Error(`输入不能超过 ${MAX_INPUT_BYTES / 1024} KB`);
  }
  return '';
}

export async function runAlgorithmCode(input: {
  language: AlgorithmCodeLanguage;
  source: string;
  stdin?: string;
}): Promise<AlgorithmCodeRunResult> {
  const language = input.language;
  const source = String(input.source || '');
  const stdin = String(input.stdin || '');
  validateRequest(language, source, stdin);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-algorithm-'));
  const env = buildSpawnEnv();
  env.PYTHONIOENCODING = 'utf-8';
  env.PYTHONUTF8 = '1';
  env.GOTOOLCHAIN = 'local';
  env.GO111MODULE = 'off';
  const started = Date.now();
  let stdout = '';
  let stderr = '';
  let compileOutput = '';
  let exitCode: number | null = null;
  let timedOut = false;
  let runtime = '';

  try {
    const file = path.join(dir, sourceFileName(language));
    fs.writeFileSync(file, source, 'utf8');

    let command = '';
    let args: string[] = [];
    if (language === 'javascript') {
      command = process.versions.electron ? process.execPath : (resolveToolExe('node') || process.execPath);
      env.ELECTRON_RUN_AS_NODE = '1';
      args = [file];
      runtime = `Node.js ${process.versions.node}`;
    } else if (language === 'typescript') {
      command = process.versions.electron ? process.execPath : (resolveToolExe('node') || process.execPath);
      env.ELECTRON_RUN_AS_NODE = '1';
      args = ['--experimental-strip-types', file];
      runtime = `Node.js ${process.versions.node} (type stripping)`;
    } else if (language === 'python') {
      command = await findPython();
      args = [file];
      runtime = command;
    } else if (language === 'java') {
      const java = resolveToolExe('java');
      const javac = java ? executableSibling(java, 'javac') : '';
      if (!java || !javac) throw new Error('需要完整 JDK（java + javac）');
      const compile = await runProcess(javac, ['-encoding', 'UTF-8', '-d', dir, file], {
        cwd: dir,
        env,
        stdin: '',
        timeoutMs: COMPILE_TIMEOUT_MS,
      });
      compileOutput = [compile.stdout, compile.stderr].filter(Boolean).join('\n');
      if (compile.exitCode !== 0 || compile.timedOut) {
        return {
          ok: false,
          language,
          stdout: '',
          stderr: compile.stderr,
          compileOutput,
          exitCode: compile.exitCode,
          timedOut: compile.timedOut,
          durationMs: Date.now() - started,
          runtime: `${java} · ${javac}`,
        };
      }
      command = java;
      args = ['-Dfile.encoding=UTF-8', '-cp', dir, 'Main'];
      runtime = java;
    } else if (language === 'go') {
      const go = resolveToolExe('go');
      if (!go) throw new Error('未找到 Go 工具链');
      const output = path.join(dir, process.platform === 'win32' ? 'program.exe' : 'program');
      const compile = await runProcess(go, ['build', '-trimpath', '-o', output, file], {
        cwd: dir,
        env,
        stdin: '',
        timeoutMs: 30_000,
      });
      compileOutput = [compile.stdout, compile.stderr].filter(Boolean).join('\n');
      if (compile.exitCode !== 0 || compile.timedOut) {
        return {
          ok: false,
          language,
          stdout: '',
          stderr: compile.stderr,
          compileOutput,
          exitCode: compile.exitCode,
          timedOut: compile.timedOut,
          durationMs: Date.now() - started,
          runtime: go,
        };
      }
      command = output;
      args = [];
      runtime = go;
    } else {
      const compiler = resolveToolExe(language === 'c' ? 'c' : 'cpp');
      if (!compiler) throw new Error(language === 'c' ? '未找到 C 编译器' : '未找到 C++ 编译器');
      const output = path.join(dir, process.platform === 'win32' ? 'program.exe' : 'program');
      const compileArgs = language === 'c'
        ? ['-std=c17', '-O2', file, '-o', output]
        : ['-std=c++20', '-O2', file, '-o', output];
      const compile = await runProcess(compiler, compileArgs, {
        cwd: dir,
        env,
        stdin: '',
        timeoutMs: COMPILE_TIMEOUT_MS,
      });
      compileOutput = [compile.stdout, compile.stderr].filter(Boolean).join('\n');
      if (compile.exitCode !== 0 || compile.timedOut) {
        return {
          ok: false,
          language,
          stdout: '',
          stderr: compile.stderr,
          compileOutput,
          exitCode: compile.exitCode,
          timedOut: compile.timedOut,
          durationMs: Date.now() - started,
          runtime: compiler,
        };
      }
      command = output;
      args = [];
      runtime = compiler;
    }

    const run = await runProcess(command, args, {
      cwd: dir,
      env,
      stdin,
      timeoutMs: RUN_TIMEOUT_MS,
    });
    stdout = run.stdout;
    stderr = run.stderr;
    exitCode = run.exitCode;
    timedOut = run.timedOut;
    return {
      ok: !run.timedOut && run.exitCode === 0,
      language,
      stdout,
      stderr,
      compileOutput,
      exitCode,
      timedOut,
      durationMs: Date.now() - started,
      runtime,
    };
  } catch (error) {
    stderr = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      language,
      stdout,
      stderr,
      compileOutput,
      exitCode,
      timedOut,
      durationMs: Date.now() - started,
      runtime,
    };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}
