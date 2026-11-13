import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import { jobsRootFor } from './python-runtime';

const { spawn } = childProcess;

export interface CommandBgJob {
  jobId: string;
  jobDir: string;
  logPath: string;
  statusPath: string;
  launcherPid?: number;
}

export interface RunCommandBackgroundOptions {
  cwd?: string;
  workspaceDir?: string;
  env?: Record<string, string>;
}

const WRAPPER_SOURCE = String.raw`
const fs = require('fs');
const { spawn } = require('child_process');
const spec = JSON.parse(process.env.YZ_BG_SPEC || '{}');
const now = () => Date.now() / 1000;
function writeStatus(data) {
  const tmp = spec.statusPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  try { fs.renameSync(tmp, spec.statusPath); } catch {
    fs.copyFileSync(tmp, spec.statusPath);
    try { fs.unlinkSync(tmp); } catch {}
  }
}
const out = fs.openSync(spec.logPath, 'a');
const startedAt = now();
let child;
try {
  child = spawn(spec.command, Array.isArray(spec.args) ? spec.args : [], {
    cwd: spec.cwd || undefined,
    env: process.env,
    windowsHide: true,
    shell: process.platform === 'win32',
    stdio: ['ignore', out, out],
  });
} catch (error) {
  writeStatus({
    state: 'failed',
    jobDir: spec.jobDir,
    logPath: spec.logPath,
    startedAt,
    finishedAt: now(),
    exitCode: 1,
    error: '后台命令启动失败: ' + (error && error.message ? error.message : String(error)),
  });
  process.exit(1);
}
writeStatus({
  state: 'running',
  jobDir: spec.jobDir,
  logPath: spec.logPath,
  startedAt,
  startedAtText: new Date(startedAt * 1000).toLocaleString('zh-CN', { hour12: false }),
  watchdogPid: process.pid,
  pid: child.pid,
  cmd: [spec.command].concat(Array.isArray(spec.args) ? spec.args : []),
});
child.once('error', (error) => {
  const finishedAt = now();
  writeStatus({
    state: 'failed',
    jobDir: spec.jobDir,
    logPath: spec.logPath,
    startedAt,
    finishedAt,
    exitCode: 1,
    watchdogPid: process.pid,
    pid: child.pid,
    elapsedSec: Math.round((finishedAt - startedAt) * 10) / 10,
    error: '后台命令启动失败: ' + (error && error.message ? error.message : String(error)),
  });
});
child.once('exit', (code, signal) => {
  const finishedAt = now();
  const ok = code === 0;
  writeStatus({
    state: ok ? 'completed' : 'failed',
    jobDir: spec.jobDir,
    logPath: spec.logPath,
    startedAt,
    startedAtText: new Date(startedAt * 1000).toLocaleString('zh-CN', { hour12: false }),
    finishedAt,
    finishedAtText: new Date(finishedAt * 1000).toLocaleString('zh-CN', { hour12: false }),
    elapsedSec: Math.round((finishedAt - startedAt) * 10) / 10,
    exitCode: typeof code === 'number' ? code : 1,
    signal: signal || null,
    watchdogPid: process.pid,
    pid: child.pid,
    error: ok ? null : ('命令退出: code=' + String(code) + ' signal=' + String(signal || '')),
  });
  try { fs.closeSync(out); } catch {}
});
`;

export async function runCommandBackground(
  command: string,
  args: string[] = [],
  opts: RunCommandBackgroundOptions = {},
): Promise<{ ok: true; job: CommandBgJob } | { ok: false; error: string }> {
  const executable = String(command || '').trim();
  if (!executable) return { ok: false, error: 'command 不能为空' };
  const jobId = `job_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  const jobDir = path.join(jobsRootFor(opts.workspaceDir), jobId);
  const logPath = path.join(jobDir, 'stdout.log');
  const statusPath = path.join(jobDir, 'status.json');
  try {
    fs.mkdirSync(jobDir, { recursive: true });
    fs.writeFileSync(logPath, '', { flag: 'a' });
  } catch (error: any) {
    return { ok: false, error: `后台任务目录写入失败: ${error?.message || error}` };
  }

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  if (opts.env) Object.assign(env, opts.env);
  env.YZ_BG_SPEC = JSON.stringify({
    command: executable,
    args: Array.isArray(args) ? args.map(String) : [],
    cwd: opts.cwd || '',
    workspaceDir: opts.workspaceDir || '',
    jobDir,
    logPath,
    statusPath,
  });
  env.ELECTRON_RUN_AS_NODE = env.ELECTRON_RUN_AS_NODE || '1';

  try {
    const child = spawn(process.execPath, ['-e', WRAPPER_SOURCE], {
      cwd: jobDir,
      env,
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    });
    child.unref();
    return {
      ok: true,
      job: { jobId, jobDir, logPath, statusPath, launcherPid: child.pid },
    };
  } catch (error: any) {
    return { ok: false, error: `后台命令启动失败: ${error?.message || error}` };
  }
}
