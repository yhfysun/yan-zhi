import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCommandBackground } from './command-runtime';

let workspace = '';

afterEach(() => {
  if (workspace) {
    try { fs.rmSync(workspace, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  workspace = '';
});

describe('runCommandBackground', () => {
  it('后台命令写 running -> completed 状态并保留 stdout', async () => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-command-job-'));
    const result = await runCommandBackground(
      process.execPath,
      ['-e', "console.log('background-ok')"],
      { workspaceDir: workspace, cwd: workspace },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const deadline = Date.now() + 5000;
    let status: any = null;
    while (Date.now() < deadline) {
      try { status = JSON.parse(fs.readFileSync(result.job.statusPath, 'utf8')); } catch { status = null; }
      if (status?.state === 'completed' || status?.state === 'failed') break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    expect(status?.state).toBe('completed');
    expect(status?.exitCode).toBe(0);
    expect(fs.readFileSync(result.job.logPath, 'utf8')).toContain('background-ok');
  });
});
