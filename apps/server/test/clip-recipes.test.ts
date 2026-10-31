/**
 * 剪辑配方（P1-11）单测：参数替换 / 内置配方套用 / 用户配方落盘。
 *
 * ★ 为什么值得测：
 *   ① 配方是"确定性套用"的承诺 —— 参数替换错一个字段，用户看到的是"套用了但效果不对"；
 *   ② 步骤失败必须指出第几步（静默跳过会让工程被改一半）；
 *   ③ 配方文件坏掉不能连累内置配方与其余自建配方。
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyClipOp, type ClipProject } from '../src/services/clip-project';
import {
  BUILTIN_CLIP_RECIPES, RECIPE_ALLOWED_OPS, RecipeParamError,
  applyRecipe, resolveParams, substituteDeep, validateRecipeData, type ClipRecipe,
} from '../src/services/clip-recipes';
import {
  deleteCustomRecipe, findRecipe, listAllRecipes, readCustomRecipes, saveCustomRecipe,
} from '../src/services/clip-recipe-store';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-clip-recipes-'));

vi.mock('../src/host-bridge.js', () => ({
  resolveArtifactDirFor: () => ({ dir: TMP, relDir: '', root: TMP, title: '', createdAt: 0 }),
}));

afterAll(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
});

function run(base: ClipProject | null, ops: Array<[string, Record<string, unknown>]>): ClipProject {
  let cur = base;
  for (const [op, args] of ops) {
    const r = applyClipOp(cur, op, args);
    if (!r.ok) throw new Error(`[${op}] ${r.error}`);
    cur = r.project;
  }
  return cur!;
}

const baseProject = () => run(null, [
  ['create', { size: '1080x1920', fps: 30 }],
  ['add_clip', { clips: [{ file: 'C:/a.mp4' }, { file: 'C:/b.mp4' }] }],
]);

describe('P1-11 · 参数替换', () => {
  it('整串占位保留原类型；嵌在长串里按字符串插值；数组/对象递归', () => {
    const out = substituteDeep(
      { n: '{{n}}', s: '第 {{n}} 段', arr: [{ t: 0, scale: '{{k}}' }, 1], deep: { x: '{{s}}' } },
      { n: 3, k: 1.5, s: 'hi' },
    ) as any;
    expect(out.n).toBe(3);                 // 数字，不是 "3"
    expect(out.s).toBe('第 3 段');
    expect(out.arr[0].scale).toBe(1.5);
    expect(out.arr[1]).toBe(1);
    expect(out.deep.x).toBe('hi');
  });

  it('缺参数时抛错并指出是哪个键', () => {
    expect(() => substituteDeep({ a: '{{missing}}' }, {})).toThrow(RecipeParamError);
    expect(() => substituteDeep({ a: '{{missing}}' }, {})).toThrow(/missing/);
  });

  it('数字表达式：{{start+length}} 这种派生值（只支持加减）', () => {
    expect(substituteDeep('{{start+length}}', { start: 2, length: 0.6 })).toBe(2.6);
    expect(substituteDeep('{{start-0.5}}', { start: 2 })).toBe(1.5);
    expect((substituteDeep({ a: '{{start+1}}s' }, { start: 2 }) as { a: string }).a).toBe('3s');
    expect(() => substituteDeep('{{start+bogus}}', { start: 2 })).toThrow(/bogus/);
  });

  it('resolveParams：补默认值、必填缺失报错、字符串数字可强转', () => {
    const recipe: ClipRecipe = {
      id: 't', name: 't', desc: '',
      params: [
        { key: 'a', label: 'A', type: 'number', default: 1 },
        { key: 'b', label: 'B', type: 'string', required: true },
        { key: 'c', label: 'C', type: 'boolean', default: true },
      ],
      steps: [],
    };
    expect(resolveParams(recipe, { b: 'x' })).toEqual({ a: 1, b: 'x', c: true });
    expect(resolveParams(recipe, { b: 'x', a: '2.5' }).a).toBe(2.5);
    expect(() => resolveParams(recipe, {})).toThrow(/b/);
    expect(() => resolveParams(recipe, { b: 'x', a: 'abc' })).toThrow(/需要数字/);
  });
});

describe('P1-11 · 内置配方套用', () => {
  it('内置配方 id 不重复，且每步 op 都在白名单内', () => {
    const ids = BUILTIN_CLIP_RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of BUILTIN_CLIP_RECIPES) {
      for (const s of r.steps) expect(RECIPE_ALLOWED_OPS.has(s.op), `${r.id} 用了未知 op ${s.op}`).toBe(true);
    }
  });

  it('★ 白名单覆盖 applyClipOp 的每一个 case（新增 op 忘了登记会红）', () => {
    const src = readFileSync(resolve(__dirname, '../src/services/clip-project.ts'), 'utf8');
    const body = src.slice(src.indexOf('export function applyClipOp'));
    const ops = new Set([...body.matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]));
    expect([...ops].filter((op) => !RECIPE_ALLOWED_OPS.has(op))).toEqual([]);
    expect([...RECIPE_ALLOWED_OPS].filter((op) => !ops.has(op))).toEqual([]);
  });

  it('punch-in：给指定片段打「推近→回位」关键帧', () => {
    const p = baseProject();
    const r = applyRecipe(p, findRecipe('punch-in')!, { clipIndex: 2, peak: 1.25 });
    if (!r.ok) throw new Error(r.error);
    const kf = r.project.clips[1].keyframes!;
    expect(kf.map((k) => k.t)).toEqual([0, 0.5, 1]);
    expect(kf[1].scale).toBe(1.25);
    expect(r.project.clips[0].keyframes).toBeUndefined();
  });

  it('title-card：加一条 zoom 标题，时间与字号按参数走', () => {
    const r = applyRecipe(baseProject(), findRecipe('title-card')!, { text: '开场', start: 1, end: 3.5, size: 120 });
    if (!r.ok) throw new Error(r.error);
    expect(r.project.texts[0]).toMatchObject({
      text: '开场', start: 1, end: 3.5, animation: 'zoom', fontSizePx: 120, position: 'center',
    });
  });

  it('bgm-bed：整片铺底 + duck；whoosh：定时音频层', () => {
    const r1 = applyRecipe(baseProject(), findRecipe('bgm-bed')!, { file: 'C:/m.mp3' });
    if (!r1.ok) throw new Error(r1.error);
    expect(r1.project.bgm).toMatchObject({ file: 'C:/m.mp3', volume: 0.25, duck: true });

    const r2 = applyRecipe(baseProject(), findRecipe('whoosh')!, { file: 'C:/w.wav', start: 2 });
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.project.audios![0]).toMatchObject({ file: 'C:/w.wav', start: 2, end: 2.6, volume: 0.8 });
  });

  it('必填参数缺失时明确报错（不静默套用半截）', () => {
    const r = applyRecipe(baseProject(), findRecipe('title-card')!, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('text');
  });

  it('★ 某一步失败时指出是第几步，且不返回半成品工程', () => {
    const recipe: ClipRecipe = {
      id: 'bad-step', name: '坏配方', desc: '',
      steps: [
        { op: 'add_text', args: { texts: [{ text: 'ok', start: 0, end: 1 }] } },
        { op: 'update_clip', args: { index: 99, patch: { label: 'x' } } },
      ],
    };
    const r = applyRecipe(baseProject(), recipe, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/第 2 步（update_clip）/);
  });
});

describe('P1-11 · 用户配方落盘', () => {
  const FILE = path.join(TMP, 'clip-recipes.json');
  beforeEach(() => { try { fs.rmSync(FILE, { force: true }); } catch { /* ignore */ } });

  const mine = {
    id: 'my-look', name: '我的风格', desc: '统一调色 + 淡入淡出',
    params: [
      { key: 'preset', label: '调色', type: 'string', default: 'cinema' },
      { key: 'clipIndex', label: '片段序号', type: 'number', default: 1 },
    ],
    steps: [
      { op: 'update_clip', args: { index: '{{clipIndex}}', patch: { colorPreset: '{{preset}}', fadeIn: 0.3 } } },
    ],
  };

  it('保存 → 出现在清单 → 能按参数套用 → 删除后消失', () => {
    const saved = saveCustomRecipe(mine);
    expect(saved.ok).toBe(true);
    const listed = listAllRecipes();
    expect(listed.recipes.some((r) => r.id === 'my-look')).toBe(true);
    expect(listed.recipes.filter((r) => r.builtin).length).toBe(BUILTIN_CLIP_RECIPES.length);

    const r = applyRecipe(baseProject(), findRecipe('my-look')!, { preset: 'warm', clipIndex: 2 });
    if (!r.ok) throw new Error(r.error);
    expect(r.project.clips[1].colorPreset).toBe('warm');
    expect(r.project.clips[1].fadeIn).toBe(0.3);

    expect(deleteCustomRecipe('my-look')).toEqual({ ok: true });
    expect(readCustomRecipes().recipes).toEqual([]);
  });

  it('内置配方 id 不能覆盖、不能删除', () => {
    const r = saveCustomRecipe({ ...mine, id: 'punch-in', name: '撞名' });
    expect(r.ok).toBe(false);
    expect(deleteCustomRecipe('punch-in').ok).toBe(false);
  });

  it('坏文件不影响内置清单，坏条目被单独跳过并给出 warnings', () => {
    fs.writeFileSync(FILE, '{ 这不是 json', 'utf8');
    const bad = listAllRecipes();
    expect(bad.recipes.length).toBe(BUILTIN_CLIP_RECIPES.length);
    expect(bad.errors.length).toBeGreaterThan(0);

    fs.writeFileSync(FILE, JSON.stringify({
      version: 1,
      recipes: [
        { id: 'ok-one', name: '好', steps: [{ op: 'add_text', args: { texts: [{ text: 'x', start: 0, end: 1 }] } }] },
        { id: 'bad one!', name: '坏', steps: [] },
      ],
    }), 'utf8');
    const mixed = listAllRecipes();
    expect(mixed.recipes.some((r) => r.id === 'ok-one')).toBe(true);
    expect(mixed.errors.some((e) => e.includes('配方数据非法'))).toBe(true);
  });

  it('validateRecipeData 封闭校验：未知 op / 空步骤 / 非法 id 都拒绝', () => {
    expect(validateRecipeData({ id: 'x', name: 'n', steps: [{ op: 'add_text' }] }).ok).toBe(false); // id 太短
    expect(validateRecipeData({ id: 'ok-id', name: 'n', steps: [] }).ok).toBe(false);
    expect(validateRecipeData({ id: 'ok-id', name: 'n', steps: [{ op: 'render' }] }).ok).toBe(false);
    expect(validateRecipeData({ id: 'ok-id', name: 'n', steps: [{ op: 'add_text' }] }).ok).toBe(true);
  });
});
