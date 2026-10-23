// 计划写入收敛的守门测试（2026-10-23）：
// 前端不得再对 taskPlan 发 PATCH/PUT/POST —— 计划写者只有服务端 task-plan-file。
// 允许的例外只有「清除计划」：它走 DELETE /conversations/:id/plan。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../..');
const UI_SRC = resolve(REPO, 'packages/ui/src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|vue)$/.test(name)) out.push(full);
  }
  return out;
}

const sources = walk(UI_SRC)
  .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.vue'))
  .map((f) => ({ file: f.slice(REPO.length + 1).split('\\').join('/'), text: readFileSync(f, 'utf8') }));

describe('计划双写守门', () => {
  it('任何源码都不得在写请求里携带 taskPlan', () => {
    // 单行写法：api.patch(`/conversations/...`, { taskPlan: ... })
    const offenders = sources
      .filter((s) => /api\.(patch|put|post)\s*(<[^>]*>)?\s*\([^)]*taskPlan/s.test(s.text))
      .map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it('persistPlan / planSaveTimer 已删除（防止有人把旧实现贴回来）', () => {
    const offenders = sources
      .filter((s) => /\bpersistPlan\b|\bplanSaveTimer\b/.test(s.text))
      .map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it('clearPlan 走 DELETE 专用接口', () => {
    const chat = sources.find((s) => s.file.endsWith('stores/chat.ts'));
    expect(chat).toBeTruthy();
    expect(chat!.text).toMatch(/api\.delete\(`\/conversations\/\$\{key\}\/plan`\)/);
  });
});
