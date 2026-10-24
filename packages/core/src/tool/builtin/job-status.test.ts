/**
 * job_status（2026-10-24）：后台作业轮询的正确性。
 *
 * 钉死三件事：
 *   ① completed/failed 要带退出码与日志尾部（模型据此判断产物是否可信）；
 *   ② running 但进程已不在 → 报「已中断」，不能让模型无限轮询一个死作业；
 *   ③ jobId 非法（路径穿越）必须拒绝。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JobStatusTool } from './job-status';

let ws = '';
let tool: JobStatusTool;

function makeJob(id: string, status: Record<string, unknown>, log = ''): string {
  const dir = path.join(ws, '.yan-zhi', 'jobs', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify(status), 'utf-8');
  fs.writeFileSync(path.join(dir, 'stdout.log'), log, 'utf-8');
  return dir;
}

function text(r: { content: Array<{ text?: string }> }): string {
  return r.content[0]?.text || '';
}

beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-jobs-'));
  tool = new JobStatusTool();
});

afterEach(() => {
  try { fs.rmSync(ws, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('job_status', () => {
  it('已完成：显示状态、退出码与日志尾部', async () => {
    makeJob('job_abc123_deadbeef', {
      state: 'completed', startedAt: 100, finishedAt: 181.5, exitCode: 0,
      startedAtText: '2026-10-24 16:00:00', finishedAtText: '2026-10-24 16:01:21',
    }, 'rendering...\nOUT ok.mp4 dur=81.54s\nDONE');
    const r = await tool.execute(
      { jobId: 'job_abc123_deadbeef', tailLines: 10 },
      { workspaceDir: ws },
    );
    const t = text(r);
    expect(t).toContain('已完成');
    expect(t).toContain('退出码：0');
    expect(t).toContain('OUT ok.mp4');
    expect(t).toContain('读日志里的产物路径');
  });

  it('失败：带 exitCode 与日志尾部', async () => {
    makeJob('job_abc124_deadbeef', {
      state: 'failed', startedAt: 100, finishedAt: 110, exitCode: 1,
    }, 'Traceback...\nSystemExit: 1');
    const t = text(await tool.execute({ jobId: 'job_abc124_deadbeef' }, { workspaceDir: ws }));
    expect(t).toContain('失败');
    expect(t).toContain('退出码：1');
    expect(t).toContain('SystemExit');
  });

  it('running 但进程已不在 → 报「已中断」，不诱导继续轮询', async () => {
    makeJob('job_abc125_deadbeef', {
      state: 'running', startedAt: 100, pid: 999999, watchdogPid: 999999,
    }, 'partial...');
    const t = text(await tool.execute({ jobId: 'job_abc125_deadbeef' }, { workspaceDir: ws }));
    expect(t).toContain('已中断');
    expect(t).not.toContain('继续轮询');
  });

  it('running 且进程活着 → 给出继续轮询指引', async () => {
    makeJob('job_abc126_deadbeef', {
      state: 'running', startedAt: Date.now() / 1000 - 5, pid: process.pid,
    }, 'step 1/4');
    const t = text(await tool.execute({ jobId: 'job_abc126_deadbeef' }, { workspaceDir: ws }));
    expect(t).toContain('运行中');
    expect(t).toContain('继续轮询');
  });

  it('jobId 非法（路径穿越）→ 拒绝', async () => {
    const r = await tool.execute({ jobId: '../../evil' }, { workspaceDir: ws });
    expect((r as { isError?: boolean }).isError).toBe(true);
    expect(text(r)).toContain('jobId 格式不对');
  });

  it('不存在的 jobId → 明确报找不到', async () => {
    const r = await tool.execute({ jobId: 'job_zzz000_deadbeef' }, { workspaceDir: ws });
    expect((r as { isError?: boolean }).isError).toBe(true);
    expect(text(r)).toContain('找不到作业');
  });

  it('不带 jobId → 列出最近作业', async () => {
    makeJob('job_aaa111_deadbeef', { state: 'completed', startedAt: 100, finishedAt: 120, exitCode: 0 });
    makeJob('job_bbb222_deadbeef', { state: 'failed', startedAt: 130, finishedAt: 140, exitCode: 1 });
    const t = text(await tool.execute({}, { workspaceDir: ws }));
    expect(t).toContain('最近的后台作业');
    expect(t).toContain('job_bbb222_deadbeef');
    expect(t).toContain('job_aaa111_deadbeef');
  });
});
