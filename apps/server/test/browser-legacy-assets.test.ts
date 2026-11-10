/**
 * 浏览器旧资产专项审计。
 *
 * 防止再次出现“源码已经单入口，但三端种子/历史 WIP/旧工具名仍在实际加载链里”的问题。
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const walkSourceFiles = (rel: string): string[] => {
  const dir = path.join(ROOT, rel);
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(dir, entry.name);
    return entry.isDirectory()
      ? walkSourceFiles(path.relative(ROOT, child))
      : (entry.name.endsWith('.ts') ? [child] : []);
  });
};

describe('浏览器旧资产审计', () => {
  it('★ 当前移动端启动链使用 core 共享种子，不使用 WIP 旧 seed', () => {
    const mobileMain = read('apps/mobile/src/main.ts');
    const mobileBuild = read('apps/mobile/scripts/build-mobile-server.cjs');
    expect(mobileMain).toContain("seedBuiltinSkills");
    expect(mobileMain).toContain('@yan-zhi/core');
    expect(`${mobileMain}\n${mobileBuild}`).not.toContain('wip-mobile-sqlite');
  });

  it('★ core 三端共享 skill 种子不再保留旧登录/搜索工具说明', () => {
    const src = read('packages/core/src/db/schema.ts');
    expect(src).toContain('WEB_TASK_AUTOMATION_BODY');
    expect(src).toContain('WEB_PAGE_OPERATION_BODY');
    expect(src).not.toContain('browser_login_saved { host }');
    expect(src).not.toContain('browser_search / browser_submit_form');
    expect(src).not.toContain('browser_next_page 翻页');
  });

  it('★ 历史 WIP seed 必须明确标记为不参与构建', () => {
    const src = read('apps/server/wip-mobile-sqlite/db/seed.ts');
    expect(src).toContain('DEPRECATED / UNUSED');
    expect(src).toContain('不是当前移动端启动链');
  });

  it('★ 活跃源码里不得再出现不存在的 browser_action_and_observe', () => {
    const files = [
      'apps/server/src/db.ts',
      'apps/server/src/llm-task-manager.ts',
      'apps/server/src/tool-permission.ts',
      'packages/ui/src/stores/agent.ts',
      'packages/shared/src/page-agent.ts',
      'packages/core/src/db/schema.ts',
    ];
    const hits = files.filter((file) => read(file).includes('browser_action_and_observe'));
    expect(hits, `活跃源码仍引用幽灵工具：${hits.join(', ')}`).toEqual([]);
  });

  it('★ pageAgent ID 只能来自 shared，服务端源码不得再各自硬编码', () => {
    const hits = walkSourceFiles('apps/server/src')
      .filter((file) => /(?:const|let|var)\s+PAGE_AGENT_ID\s*=\s*['"]a_builtin_page_agent['"]/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file));
    expect(hits, `pageAgent ID 存在重复定义：${hits.join(', ')}`).toEqual([]);
  });
});
