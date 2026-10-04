// 用户钩子匹配逻辑测试（P2-7 P2a）
// 守住的语义：
//   1) 归属隔离：只命中自己的规则；未登录（无 userId）不命中任何规则；
//   2) 工具匹配：'*' 通配；工具名精确匹配；
//   3) pattern 子串匹配大小写不敏感；命令类工具用命令行摘要参与匹配；
//   4) deny 与 confirm 并存时 deny 优先（fail-safe：冲突从紧）；
//   5) enabled=0 不生效；db 异常 fail-open（按无规则处理、不污染缓存，恢复后重查）。
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows: any[] = [];
const hoisted = vi.hoisted(() => ({
  fail: false,
  prepare: (sql: string) => ({
    all: () => {
      if (hoisted.fail) throw new Error('db gone');
      return sql.includes('user_hook') ? rows : [];
    },
    get: () => undefined,
    run: () => {},
  }),
}));

vi.mock('../src/db.js', () => ({ db: { prepare: hoisted.prepare } }));

import { matchUserHooks, userHookMatchText, invalidateUserHookCache } from '../src/services/user-hooks.js';

function mkRow(partial: Partial<Record<string, any>>) {
  return {
    id: 'uh_' + Math.random().toString(36).slice(2, 8),
    user_id: 'u1',
    name: '规则',
    trigger: 'before',
    tool: '*',
    pattern: null,
    action: 'deny',
    enabled: 1,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...partial,
  };
}

beforeEach(() => {
  rows.length = 0;
  invalidateUserHookCache();
});

describe('matchUserHooks', () => {
  it('db 异常 fail-open：不抛错、按无规则处理，恢复后自动重查（读失败不污染缓存）——须在缓存填充前跑', () => {
    rows.push(mkRow({ tool: 'cmd_exec', action: 'deny' }));
    hoisted.fail = true;
    try {
      expect(matchUserHooks('u1', 'cmd_exec', {})).toEqual({ denyRules: [], confirmRules: [] });
    } finally {
      hoisted.fail = false;
    }
    expect(matchUserHooks('u1', 'cmd_exec', {}).denyRules).toHaveLength(1);
    rows.length = 0;
  });

  it('归属隔离：别人的规则不命中；无 userId 不命中任何规则', () => {
    rows.push(mkRow({ user_id: 'u2', tool: 'cmd_exec' }));
    expect(matchUserHooks('u1', 'cmd_exec', {}).denyRules).toHaveLength(0);
    expect(matchUserHooks(null, 'cmd_exec', {}).denyRules).toHaveLength(0);
  });

  it("'*' 通配所有工具；具体工具名精确匹配", () => {
    rows.push(mkRow({ name: '全局拒绝', tool: '*' }), mkRow({ name: '只拦 git push', tool: 'api_git_push' }));
    expect(matchUserHooks('u1', 'cmd_exec', {}).denyRules.map((r) => r.name)).toEqual(['全局拒绝']);
    expect(matchUserHooks('u1', 'api_git_push', {}).denyRules.map((r) => r.name)).toEqual(['全局拒绝', '只拦 git push']);
  });

  it('pattern 子串匹配大小写不敏感；命令类工具用命令行摘要参与匹配', () => {
    rows.push(mkRow({ tool: 'cmd_exec', pattern: 'npm publish', action: 'deny' }));
    expect(matchUserHooks('u1', 'cmd_exec', { command: 'cd pkg && NPM PUBLISH --access public' }).denyRules).toHaveLength(1);
    expect(matchUserHooks('u1', 'cmd_exec', { command: 'npm run build' }).denyRules).toHaveLength(0);
  });

  it('非命令工具：参数序列化后参与匹配', () => {
    rows.push(mkRow({ tool: 'file_write', pattern: '生产环境', action: 'confirm' }));
    expect(matchUserHooks('u1', 'file_write', { path: 'config/生产环境.yaml' }).confirmRules).toHaveLength(1);
    expect(matchUserHooks('u1', 'file_write', { path: 'config/dev.yaml' }).confirmRules).toHaveLength(0);
  });

  it('deny 与 confirm 并存 → deny 优先（冲突从紧）', () => {
    rows.push(mkRow({ name: '放行', tool: 'cmd_exec', action: 'confirm' }), mkRow({ name: '拦死', tool: 'cmd_exec', action: 'deny' }));
    const v = matchUserHooks('u1', 'cmd_exec', {});
    expect(v.denyRules.map((r) => r.name)).toEqual(['拦死']);
    expect(v.confirmRules).toHaveLength(0);
  });

  it('enabled=0 的规则不生效', () => {
    rows.push(mkRow({ tool: 'cmd_exec', enabled: 0 }));
    expect(matchUserHooks('u1', 'cmd_exec', {}).denyRules).toHaveLength(0);
  });
});

describe('userHookMatchText', () => {
  it('命令类工具返回命令行摘要；工具名永远参与匹配', () => {
    const t = userHookMatchText('cmd_exec', { command: 'rm -rf /tmp/x' });
    expect(t.startsWith('cmd_exec')).toBe(true);
    expect(t).toContain('rm -rf');
  });

  it('非命令工具序列化参数', () => {
    const t = userHookMatchText('file_write', { path: 'a.txt' });
    expect(t).toContain('a.txt');
    expect(t).toContain('file_write');
  });
});
