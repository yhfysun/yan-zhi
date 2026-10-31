// 用户自建配方的落盘 —— **IO 层**（与 clip-store 同构：纯函数层 clip-recipes.ts 不碰磁盘）。
//
// 存放位置：产物根目录下的 `clip-recipes.json`（跨会话共享 —— 配方本来就是给"同一套风格做多集"用的）。
// ★ 单文件而不是一目录多文件：配方数量小（几十条），单文件便于备份、也方便用户手写。
// ★ 写盘走"临时文件 + rename"：配方文件坏了会连累所有套用，写入不能出现半截 json。

import fs from 'node:fs';
import path from 'node:path';
// 目录解析经桥（P4）：本文件随 clip-mode 插件包分发，直接引 artifact-dir 会把根目录算错。
import { resolveArtifactDirFor } from '../host-bridge.js';
import { BUILTIN_CLIP_RECIPES, validateRecipeData, type ClipRecipe } from './clip-recipes.js';

export const CLIP_RECIPES_FILE = 'clip-recipes.json';
const RECIPE_MAX_COUNT = 50;

/** 配方文件位置（产物根目录下，不带会话维度）。 */
export function clipRecipesFile(): { dir: string; file: string } {
  const { root } = resolveArtifactDirFor({ category: 'intermediate' });
  return { dir: root, file: path.join(root, CLIP_RECIPES_FILE) };
}

/**
 * 读用户配方。坏文件/坏条目**不阻断**：返回能用的部分 + 错误清单（调用方展示）。
 * ★ 一条坏配方不该让其余配方和内置配方一起失效。
 */
export function readCustomRecipes(): { recipes: ClipRecipe[]; errors: string[] } {
  const { file } = clipRecipesFile();
  if (!fs.existsSync(file)) return { recipes: [], errors: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { recipes?: unknown[] } | unknown[];
    const list = Array.isArray(parsed) ? parsed : parsed?.recipes;
    if (!Array.isArray(list)) {
      return { recipes: [], errors: [`${CLIP_RECIPES_FILE} 结构非法（需要 { version, recipes: [...] }），已忽略`] };
    }
    const recipes: ClipRecipe[] = [];
    const errors: string[] = [];
    for (const item of list.slice(0, RECIPE_MAX_COUNT)) {
      const v = validateRecipeData(item);
      if (!v.ok) { errors.push(`配方数据非法：${v.error}`); continue; }
      if (BUILTIN_CLIP_RECIPES.some((b) => b.id === v.recipe.id)) {
        errors.push(`「${v.recipe.id}」与内置配方同名，已忽略`);
        continue;
      }
      recipes.push(v.recipe);
    }
    return { recipes, errors };
  } catch (e) {
    return { recipes: [], errors: [`读不了 ${CLIP_RECIPES_FILE}：${e instanceof Error ? e.message : String(e)}`] };
  }
}

function writeCustomRecipes(recipes: ClipRecipe[]): void {
  const { dir, file } = clipRecipesFile();
  fs.mkdirSync(dir, { recursive: true });
  const body = JSON.stringify({ version: 1, recipes }, null, 2);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, body, 'utf8');
  fs.renameSync(tmp, file);
}

/** 内置 + 用户配方（内置在前，同名以内置为准）。 */
export function listAllRecipes(): { recipes: ClipRecipe[]; errors: string[] } {
  const { recipes, errors } = readCustomRecipes();
  return { recipes: [...BUILTIN_CLIP_RECIPES, ...recipes], errors };
}

export function findRecipe(id: string): ClipRecipe | null {
  const key = String(id || '').trim();
  if (!key) return null;
  return listAllRecipes().recipes.find((r) => r.id === key) || null;
}

/** 保存（同 id 覆盖）。内置配方 id 不允许覆盖 —— 用户改错了没法对照。 */
export function saveCustomRecipe(input: unknown): { ok: true; recipe: ClipRecipe } | { ok: false; error: string } {
  const v = validateRecipeData(input);
  if (!v.ok) return v;
  if (BUILTIN_CLIP_RECIPES.some((b) => b.id === v.recipe.id)) {
    return { ok: false, error: `「${v.recipe.id}」是内置配方，换个 id 再存（如 ${v.recipe.id}-2）` };
  }
  const { recipes } = readCustomRecipes();
  const next = recipes.filter((r) => r.id !== v.recipe.id);
  if (next.length >= RECIPE_MAX_COUNT) return { ok: false, error: `自定义配方最多 ${RECIPE_MAX_COUNT} 条` };
  next.push(v.recipe);
  writeCustomRecipes(next);
  return { ok: true, recipe: v.recipe };
}

export function deleteCustomRecipe(id: string): { ok: true } | { ok: false; error: string } {
  const key = String(id || '').trim();
  if (BUILTIN_CLIP_RECIPES.some((b) => b.id === key)) return { ok: false, error: `「${key}」是内置配方，不能删除` };
  const { recipes } = readCustomRecipes();
  const next = recipes.filter((r) => r.id !== key);
  if (next.length === recipes.length) return { ok: false, error: `找不到自定义配方：${key}` };
  writeCustomRecipes(next);
  return { ok: true };
}
