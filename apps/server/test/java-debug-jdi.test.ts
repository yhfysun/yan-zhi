import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { makeJavaSuiteTools } from '../src/plugins/java-suite.js';

const tools = new Map(makeJavaSuiteTools().map((tool) => [tool.name, tool]));
const activeSessions = new Set<string>();
const externalTargets = new Set<ChildProcess>();

function toolText(result: { content?: Array<{ text?: string }> }): string {
  return String(result.content?.[0]?.text || '');
}

async function execute(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const tool = tools.get(name);
  if (!tool) throw new Error(`missing tool: ${name}`);
  return toolText(await tool.execute(args));
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

async function waitForPaused(sessionId: string, reason: string, timeoutMs = 12_000): Promise<Record<string, any>> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    last = await execute('java_debug_status');
    const sessions = JSON.parse(last) as Array<Record<string, any>>;
    const session = sessions.find((item) => item.id === sessionId);
    if (session?.status === 'paused' && session.lastPause?.reason === reason) return session;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Java debugger did not pause with ${reason}; last status: ${last}`);
}

afterEach(async () => {
  for (const sessionId of activeSessions) {
    await execute('java_debug_stop', { sessionId });
  }
  activeSessions.clear();
  for (const target of externalTargets) {
    try { target.kill(); } catch { /* ignore */ }
  }
  externalTargets.clear();
});

describe('Java JDI debugger', () => {
  it('uses the configured JDK to attach, hit a breakpoint, eval a local and step', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-java-jdi-'));
    const classesDir = path.join(tempDir, 'classes');
    fs.mkdirSync(classesDir, { recursive: true });
    const source = path.join(tempDir, 'Sample.java');
    fs.writeFileSync(source, [
      'public class Sample {',
      '  public static void main(String[] args) throws Exception {',
      '    int i = 0;',
      '    for (i = 0; i < 3; i++) {',
      '      System.out.println("i=" + i);',
      '      Thread.sleep(150);',
      '    }',
      '  }',
      '}',
    ].join('\n'), 'utf8');
    const compiled = spawnSync('javac', ['-g', '-d', classesDir, source], {
      encoding: 'utf8',
      windowsHide: true,
    });
    expect(compiled.status, compiled.stderr || compiled.stdout).toBe(0);

    const port = await freePort();
    const launched = await execute('java_debug_launch', {
      dir: tempDir,
      mainClass: 'Sample',
      classpath: classesDir,
      port,
    });
    const sessionId = launched.match(/会话已启动并暂停在入口: (debug-[^\s]+)/)?.[1] || '';
    expect(sessionId, launched).toBeTruthy();
    activeSessions.add(sessionId);

    const breakpoint = await execute('java_debug_set_breakpoint', {
      sessionId,
      className: 'Sample',
      line: 5,
    });
    expect(breakpoint).toContain('断点已提交');

    expect(await execute('java_debug_continue', { sessionId })).toContain('继续执行');
    const paused = await waitForPaused(sessionId, 'breakpoint');
    expect(paused.lastPause).toMatchObject({ className: 'Sample', line: 5 });

    const evaluated = await execute('java_debug_eval', { sessionId, expression: 'i' });
    expect(evaluated).toMatch(/^int = \d+$/);

    expect(await execute('java_debug_step', { sessionId, mode: 'over' })).toContain('单步执行');
    const stepped = await waitForPaused(sessionId, 'step');
    expect(stepped.lastPause).toMatchObject({ className: 'Sample', line: 6 });
  }, 40_000);

  it('attaches to an already running JDWP process through the configured JDK', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-java-jdi-attach-'));
    const classesDir = path.join(tempDir, 'classes');
    fs.mkdirSync(classesDir, { recursive: true });
    const source = path.join(tempDir, 'AttachSample.java');
    fs.writeFileSync(source, [
      'public class AttachSample {',
      '  public static void main(String[] args) throws Exception {',
      '    for (int i = 0; i < 3; i++) {',
      '      System.out.println("tick=" + i);',
      '      Thread.sleep(150);',
      '    }',
      '  }',
      '}',
    ].join('\n'), 'utf8');
    const compiled = spawnSync('javac', ['-g', '-d', classesDir, source], {
      encoding: 'utf8',
      windowsHide: true,
    });
    expect(compiled.status, compiled.stderr || compiled.stdout).toBe(0);

    const port = await freePort();
    const target = spawn('java', [
      `-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=127.0.0.1:${port}`,
      '-cp', classesDir,
      'AttachSample',
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    externalTargets.add(target);

    const attached = await execute('java_debug_attach', { host: '127.0.0.1', port });
    const sessionId = attached.match(/会话 ID: (debug-[^，\s]+)/)?.[1] || '';
    expect(sessionId, attached).toBeTruthy();
    activeSessions.add(sessionId);

    expect(await execute('java_debug_set_breakpoint', {
      sessionId,
      className: 'AttachSample',
      line: 4,
    })).toContain('断点已提交');
    expect(await execute('java_debug_continue', { sessionId })).toContain('继续执行');
    const paused = await waitForPaused(sessionId, 'breakpoint');
    expect(paused.lastPause).toMatchObject({ className: 'AttachSample', line: 4 });
  }, 40_000);
});
