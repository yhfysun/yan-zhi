import { constants } from 'node:fs';
import { access, copyFile, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AutomationRunContext, AutomationStepAdapter, AutomationStepExecution } from '@yan-zhi/core';
import type { AutomationStep } from '@yan-zhi/shared';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fileSnapshot(path: string): Promise<{ path: string; exists: boolean; size: number; isFile: boolean }> {
  try {
    const info = await stat(path);
    return { path, exists: true, size: info.size, isFile: info.isFile() };
  } catch {
    return { path, exists: false, size: 0, isFile: false };
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function assertTransferSource(path: string): Promise<void> {
  const snapshot = await fileSnapshot(path);
  if (!snapshot.exists) throw new Error(`源文件不存在：${path}`);
  if (!snapshot.isFile) throw new Error(`源路径不是文件：${path}`);
}

export class FileAutomationAdapter implements AutomationStepAdapter {
  constructor(private readonly options: { pollMs?: number } = {}) {}

  async execute(step: AutomationStep, _context: AutomationRunContext): Promise<AutomationStepExecution> {
    if (step.type === 'file.exists') {
      return { output: await fileSnapshot(step.path) };
    }
    if (step.type === 'file.wait') {
      const timeoutMs = Math.max(100, Math.min(10 * 60_000, step.timeoutMs || 120_000));
      const deadline = Date.now() + timeoutMs;
      const pollMs = Math.max(20, Math.min(2_000, this.options.pollMs || 500));
      while (Date.now() <= deadline) {
        const snapshot = await fileSnapshot(step.path);
        if (snapshot.exists && snapshot.isFile && snapshot.size > 0) return { output: snapshot };
        await sleep(Math.min(pollMs, Math.max(1, deadline - Date.now())));
      }
      throw new Error(`等待文件超时：${step.path}`);
    }
    if (step.type === 'file.copy') {
      await assertTransferSource(step.from);
      await mkdir(dirname(step.to), { recursive: true });
      if (!step.overwrite && await pathExists(step.to)) {
        throw new Error(`目标文件已存在：${step.to}`);
      }
      await copyFile(step.from, step.to, step.overwrite ? 0 : constants.COPYFILE_EXCL);
      return {
        output: {
          operation: 'copy',
          from: step.from,
          to: step.to,
          ...(await fileSnapshot(step.to)),
        },
      };
    }
    if (step.type === 'file.move') {
      await assertTransferSource(step.from);
      await mkdir(dirname(step.to), { recursive: true });
      if (!step.overwrite && await pathExists(step.to)) {
        throw new Error(`目标文件已存在：${step.to}`);
      }
      if (step.overwrite && await pathExists(step.to)) {
        await unlink(step.to);
      }
      try {
        await rename(step.from, step.to);
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'EXDEV') throw error;
        await copyFile(step.from, step.to);
        await unlink(step.from);
      }
      return {
        output: {
          operation: 'move',
          from: step.from,
          to: step.to,
          ...(await fileSnapshot(step.to)),
        },
      };
    }
    throw new Error(`步骤 ${step.id} 不是文件步骤`);
  }
}
