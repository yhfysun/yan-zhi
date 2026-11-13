import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileAutomationAdapter } from '../src/services/automation-file-adapter.js';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'yz-automation-file-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const context = { runId: 'run1', userId: 'guest', params: {}, variables: {} };

describe('FileAutomationAdapter', () => {
  it('file.exists 返回文件大小与存在状态', async () => {
    const dir = tempDir();
    const file = join(dir, 'report.txt');
    writeFileSync(file, 'hello');
    const adapter = new FileAutomationAdapter();

    const out = await adapter.execute({ id: 's1', type: 'file.exists', path: file }, context);

    expect(out.output).toMatchObject({ exists: true, size: 5, path: file });
  });

  it('file.wait 等到文件出现后完成', async () => {
    const dir = tempDir();
    const file = join(dir, 'later.txt');
    const adapter = new FileAutomationAdapter({ pollMs: 20 });
    setTimeout(() => writeFileSync(file, 'ready'), 60);

    const out = await adapter.execute(
      { id: 's1', type: 'file.wait', path: file, timeoutMs: 1000 },
      context,
    );

    expect((out.output as any).exists).toBe(true);
  });

  it('文件等待超时会失败', async () => {
    const dir = tempDir();
    const adapter = new FileAutomationAdapter({ pollMs: 20 });

    await expect(
      adapter.execute(
        { id: 's1', type: 'file.wait', path: join(dir, 'missing.txt'), timeoutMs: 80 },
        context,
      ),
    ).rejects.toThrow(/等待文件超时/);
  });

  it('file.copy 复制文件并自动创建目标目录', async () => {
    const dir = tempDir();
    const source = join(dir, 'source.txt');
    const target = join(dir, 'nested', 'copy.txt');
    writeFileSync(source, 'copy me');
    const adapter = new FileAutomationAdapter();

    const out = await adapter.execute(
      { id: 'copy', type: 'file.copy', from: source, to: target },
      context,
    );

    expect(out.output).toMatchObject({ operation: 'copy', from: source, to: target, exists: true });
    expect(readFileSync(target, 'utf8')).toBe('copy me');
  });

  it('file.copy 默认不覆盖已有目标，开启 overwrite 后才覆盖', async () => {
    const dir = tempDir();
    const source = join(dir, 'source.txt');
    const target = join(dir, 'target.txt');
    writeFileSync(source, 'new');
    writeFileSync(target, 'old');
    const adapter = new FileAutomationAdapter();

    await expect(adapter.execute(
      { id: 'copy', type: 'file.copy', from: source, to: target },
      context,
    )).rejects.toThrow(/目标文件已存在/);

    await adapter.execute(
      { id: 'copy', type: 'file.copy', from: source, to: target, overwrite: true },
      context,
    );
    expect(readFileSync(target, 'utf8')).toBe('new');
  });

  it('file.move 移动文件并移除源路径', async () => {
    const dir = tempDir();
    const source = join(dir, 'source.txt');
    const target = join(dir, 'nested', 'moved.txt');
    writeFileSync(source, 'move me');
    const adapter = new FileAutomationAdapter();

    const out = await adapter.execute(
      { id: 'move', type: 'file.move', from: source, to: target },
      context,
    );

    expect(out.output).toMatchObject({ operation: 'move', from: source, to: target, exists: true });
    expect(existsSync(source)).toBe(false);
    expect(readFileSync(target, 'utf8')).toBe('move me');
  });
});
