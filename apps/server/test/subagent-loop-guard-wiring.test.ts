import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const source = fs.readFileSync(path.join(REPO_ROOT, 'apps/server/src/llm-task-manager.ts'), 'utf8');

describe('子智能体循环闸门接线', () => {
  it('子智能体收到 FORCE_STOP 后跳出工具循环与批次循环', () => {
    const start = source.indexOf('const toolResult = await runToolCallAndPersist({');
    const end = source.indexOf('// ★★★ 达单批上限', start);
    const branch = source.slice(start, end > start ? end : start + 3000);

    expect(start).toBeGreaterThan(-1);
    expect(branch).toContain('startsWith(FORCE_STOP_MARKER)');
    expect(branch).toContain('forceStoppedByLoopGuard = true');
    expect(branch).toContain('if (forceStoppedByLoopGuard) break;');
  });

  it('浏览器进展守卫按执行流隔离，并发 pageAgent 不串状态', () => {
    expect(source).toContain('browserProgressGuards?: Map<string, BrowserProgressGuard>');
    expect(source).toContain('browserProgressGuardKey(');
    expect(source).toContain('ownership?.parentToolCallId');
    expect(source).toContain('task.browserProgressGuards.set(flowKey, guard)');
  });
});
