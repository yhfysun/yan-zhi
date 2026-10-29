/**
 * 配方数据文件注册表守门测试（2026-10-28，任务 2）。
 *
 * 覆盖两道：
 *   A. validateRecipeData 封闭校验（kind 白名单、必填字段、尺寸上限）
 *   B. loadFileRecipes 扫描合并（坏文件不阻断、id=文件名、内置优先、错误汇总）
 *
 * fs 注入：loadFileRecipes 走 getPlatformAdapter().fs —— 测试先 setPlatformAdapter
 * 一个最小 adapter，再覆盖其 fs 方法；结束恢复（原本无 adapter 则清空）。
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateRecipeData, loadFileRecipes } from './recipes';
import { BrowserRunRecipeTool } from './index';
import { getPlatformAdapter, setPlatformAdapter } from '../../../platform/types';

/** 空环境下 getPlatformAdapter 会抛错 —— 包一层返回 undefined */
function getAdapterSafe(): any | undefined {
  try { return getPlatformAdapter(); } catch { return undefined; }
}

/** 注入假 fs：不落真盘，快且隔离 */
function withFakeFs<T>(dir: string, files: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const adapter = getAdapterSafe();
  const fake = {
    ...(adapter?.fs || {}),
    exists: async (p: string) => p === dir,
    readDir: async (p: string) => (p === dir ? Object.keys(files) : []),
    readFile: async (p: string) => {
      const name = path.basename(p);
      if (!(name in files)) throw new Error(`ENOENT: ${name}`);
      return files[name];
    },
  };
  setPlatformAdapter({ ...(adapter || {}), fs: fake } as any);
  return fn().finally(() => {
    if (adapter) setPlatformAdapter(adapter);
    else setPlatformAdapter(null as any);
  });
}

/** 一份合法的文件配方（两步：navigate + clickText） */
const VALID = {
  id: 'example-checkin',
  description: '示例站签到：进后台→点签到',
  hosts: ['example.com'],
  params: {
    noop: { type: 'string', required: false, description: '占位参数' },
  },
  steps: [
    { kind: 'navigate', url: 'https://example.com/admin' },
    { kind: 'clickText', texts: ['签到'] },
  ],
};

describe('A. validateRecipeData 封闭校验', () => {
  it('合法配方通过', () => {
    expect(validateRecipeData(VALID).ok).toBe(true);
  });

  it('未开放 kind（run_script）被拒——文件配方不允许执行任意 JS', () => {
    const v = validateRecipeData({ ...VALID, steps: [{ kind: 'run_script', script: 'return 1' }] });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain('未知步骤 kind');
  });

  it('insertTopic 不开放给文件配方（抖音专用）', () => {
    expect(validateRecipeData({ ...VALID, steps: [{ kind: 'insertTopic', topicsParam: 'topics' }] }).ok).toBe(false);
  });

  it('steps 空数组 / 非数组被拒', () => {
    expect(validateRecipeData({ ...VALID, steps: [] }).ok).toBe(false);
    expect(validateRecipeData({ ...VALID, steps: 'nope' }).ok).toBe(false);
  });

  it('steps 超 30 步被拒', () => {
    const many = Array.from({ length: 31 }, () => ({ kind: 'clickText', texts: ['x'] }));
    const v = validateRecipeData({ ...VALID, steps: many });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain('30 步');
  });

  it('id 非 kebab-case 被拒（防路径穿越）', () => {
    expect(validateRecipeData({ ...VALID, id: '../etc' }).ok).toBe(false);
    expect(validateRecipeData({ ...VALID, id: 'Bad_Id' }).ok).toBe(false);
    expect(validateRecipeData({ ...VALID, id: '' }).ok).toBe(false);
  });

  it('缺 description / navigate 缺 url / fill 字段缺 value 均被拒', () => {
    const noDesc = { ...VALID } as Record<string, unknown>;
    delete noDesc.description;
    expect(validateRecipeData(noDesc).ok).toBe(false);
    expect(validateRecipeData({ ...VALID, steps: [{ kind: 'navigate', url: '' }] }).ok).toBe(false);
    expect(validateRecipeData({ ...VALID, steps: [{ kind: 'fill', fields: [{ selector: '.a' }] }] }).ok).toBe(false);
  });

  it('params.type 只认 string/boolean', () => {
    expect(validateRecipeData({ ...VALID, params: { x: { type: 'number' } } }).ok).toBe(false);
  });

  it('hosts 必须是字符串数组', () => {
    expect(validateRecipeData({ ...VALID, hosts: 'example.com' }).ok).toBe(false);
    expect(validateRecipeData({ ...VALID, hosts: [123] }).ok).toBe(false);
  });
});

describe('B. loadFileRecipes 扫描合并', () => {
  it('合法文件配方被加载；坏 JSON/校验失败/同名内置被忽略并汇总错误', async () => {
    const dir = path.join('virtual-workspace', 'recipes');
    const files: Record<string, string> = {
      'example-checkin.json': JSON.stringify(VALID),
      'bad.json': '{ not json',
      // 校验失败：kind 未开放
      'bad-kind.json': JSON.stringify({ ...VALID, id: 'bad-kind', steps: [{ kind: 'run_script', script: 'x' }] }),
      // id 与文件名不一致
      'wrong-id.json': JSON.stringify({ ...VALID, id: 'other-id' }),
      // 与内置同名：内置优先，文件被忽略
      'form-fill.json': JSON.stringify({ ...VALID, id: 'form-fill', description: '冒充内置配方' }),
    };
    const { recipes, errors } = await withFakeFs('virtual-workspace/recipes', files, () => loadFileRecipes('virtual-workspace'));
    expect(recipes.get('example-checkin')?.id).toBe('example-checkin');
    expect(recipes.has('bad.json')).toBe(false);
    expect(recipes.has('bad-kind')).toBe(false);
    expect(recipes.has('wrong-id')).toBe(false);
    // 内置优先：同名文件配方被忽略且报错
    expect(errors.some((e) => e.includes('form-fill') && e.includes('内置优先'))).toBe(true);
    // 坏文件不阻断：错误汇总里有对应条目
    expect(errors.some((e) => e.includes('bad.json'))).toBe(true);
    expect(errors.some((e) => e.includes('bad-kind.json'))).toBe(true);
    expect(errors.some((e) => e.includes('wrong-id.json'))).toBe(true);
  });

  it('目录不存在 / 空工作目录时返回空表（不抛错）', async () => {
    const { recipes, errors } = await withFakeFs('no-such-dir', {}, () => loadFileRecipes('no-such-parent'));
    expect(recipes.size).toBe(0);
    expect(errors).toEqual([]);
    const empty = await loadFileRecipes('');
    expect(empty.recipes.size).toBe(0);
  });
});

describe('C. 未知配方报错要把已加载的文件配方 id 也列出来', () => {
  const api = {
    navigate: async () => ({ error: null }),
    action: async () => ({ error: null }),
  } as any;

  it('文件配方 id 拼进「可用」列表（否则模型不知道文件夹里有什么）', async () => {
    const files = { 'example-checkin.json': JSON.stringify(VALID) };
    const res = await withFakeFs('virtual-workspace/recipes', files, () =>
      BrowserRunRecipeTool.run({ recipe: 'no-such-recipe' }, api, { workspaceDir: 'virtual-workspace' }));
    const text = res.content.map((c: any) => c.text).join('\n');
    expect(text).toContain('example-checkin');
  });

  it('没有工作目录时只列内置配方（不因缺 ctx 抛错）', async () => {
    const res = await BrowserRunRecipeTool.run({ recipe: 'no-such-recipe' }, api);
    const text = res.content.map((c: any) => c.text).join('\n');
    expect(text).toContain('douyin-publish-video');
    expect(text).not.toContain('example-checkin');
  });

  it('配方执行必须走注入的 api（桌面直连档子动作逐个走桥）', async () => {
    const files = { 'example-checkin.json': JSON.stringify(VALID) };
    const calls: string[] = [];
    const recordingApi = {
      navigate: async (url: string) => { calls.push(`navigate:${url}`); return {}; },
      action: async (name: string) => { calls.push(`action:${name}`); return {}; },
    } as any;
    const res = await withFakeFs('virtual-workspace/recipes', files, () =>
      BrowserRunRecipeTool.run({ recipe: 'example-checkin' }, recordingApi, { workspaceDir: 'virtual-workspace' }));
    const text = res.content.map((c: any) => c.text).join('\n');
    expect(text).toContain('执行完成');
    expect(calls[0]).toBe('navigate:https://example.com/admin');
    expect(calls).toContain('action:click');
  });
});
