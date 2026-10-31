// 剪辑配方（recipe）—— 一组 op 存成模板，一键套用。**纯函数层**（不碰磁盘）。
//
// 为什么需要（P1-11）：
//   「同一套风格做多集」时，模型每次都要重新编排同一串 op（调色 + 关键帧 + 音效 + 标题），
//   每次都可能在参数或顺序上漂一点，用户看到的是"这集和上集不一样"，却说不清哪不一样。
//   把已验证可行的 op 组合固化成**数据**，模型只传参数、代码确定性套用。
//
// 与 browser 配方的关系：同一个思路（`tool/builtin/browser/recipes.ts`），
//   区别是这里作用于剪辑工程（纯函数 applyClipOp），因此可以完全脱机单测。
//
// ★ 边界：配方只做**工程编辑**。渲染/合成不属于配方（它们不在 applyClipOp 里）。

import { applyClipOp, type ClipProject } from './clip-project.js';

export interface ClipRecipeParam {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  default?: string | number | boolean;
  desc?: string;
}

export interface ClipRecipeStep {
  op: string;
  args: Record<string, unknown>;
}

export interface ClipRecipe {
  id: string;
  name: string;
  desc: string;
  params?: ClipRecipeParam[];
  steps: ClipRecipeStep[];
  /** 内置配方（只读；用户配方可删） */
  builtin?: boolean;
}

/**
 * 用户配方允许出现的 op —— 与 applyClipOp 的 case 保持一致（有守门测试）。
 * ★ 为什么要有白名单而不是"applyClipOp 认得就行"：用户手写 json 时拼错 op，
 *   要到**套用那一刻**才报错，而那时人可能已经以为存好了。存之前就拒绝更省事。
 */
export const RECIPE_ALLOWED_OPS: ReadonlySet<string> = new Set([
  'create', 'get', 'set_output',
  'add_clip', 'update_clip', 'remove_clip', 'move_clip', 'clear_clips',
  'add_text', 'update_text', 'remove_text', 'clear_texts',
  'set_bgm', 'clear_bgm', 'set_audio_fx',
  'add_overlay', 'update_overlay', 'remove_overlay',
  'add_audio', 'update_audio', 'remove_audio', 'clear_audios',
  'add_sticker', 'update_sticker', 'remove_sticker', 'clear_stickers',
]);

/**
 * 内置配方。
 * ★ 只挑"参数少、效果肉眼可见、纯 op 可表达"的组合；需要 ffprobe/渲染的一律不进配方。
 */
export const BUILTIN_CLIP_RECIPES: ClipRecipe[] = [
  {
    id: 'punch-in',
    name: '强调推镜',
    desc: '给指定片段做「推近 → 回位」的强调运镜（中点放到峰值倍数），适合口播重音/关键词',
    builtin: true,
    params: [
      { key: 'clipIndex', label: '片段序号（从 1 开始）', type: 'number', default: 1 },
      { key: 'peak', label: '峰值放大倍数', type: 'number', default: 1.18, desc: '1.05~3；1.15 左右最自然' },
    ],
    steps: [{
      op: 'update_clip',
      args: {
        index: '{{clipIndex}}',
        patch: {
          keyframes: [
            { t: 0, scale: 1, ease: 'inout' },
            { t: 0.5, scale: '{{peak}}', ease: 'inout' },
            { t: 1, scale: 1 },
          ],
        },
      },
    }],
  },
  {
    id: 'title-card',
    name: '片头标题',
    desc: '加一条居中放大的标题字幕（zoom 动画），适合片头一句话',
    builtin: true,
    params: [
      { key: 'text', label: '标题文字', type: 'string', required: true },
      { key: 'start', label: '起始秒', type: 'number', default: 0 },
      { key: 'end', label: '结束秒', type: 'number', default: 2 },
      { key: 'size', label: '字号（像素，1920 高基准）', type: 'number', default: 96 },
    ],
    steps: [{
      op: 'add_text',
      args: {
        texts: [{
          text: '{{text}}',
          start: '{{start}}',
          end: '{{end}}',
          animation: 'zoom',
          fontSizePx: '{{size}}',
          position: 'center',
        }],
      },
    }],
  },
  {
    id: 'bgm-bed',
    name: '整片铺底音乐',
    desc: '把一首音乐铺满整片（音量默认 0.25，说话自动压低）',
    builtin: true,
    params: [
      { key: 'file', label: '音乐文件绝对路径', type: 'string', required: true },
      { key: 'volume', label: '音量 0~1', type: 'number', default: 0.25 },
      { key: 'duck', label: '说话时自动压低', type: 'boolean', default: true },
    ],
    steps: [{
      op: 'set_bgm',
      args: { file: '{{file}}', volume: '{{volume}}', duck: '{{duck}}' },
    }],
  },
  {
    id: 'whoosh',
    name: '转场音效',
    desc: '在指定时间点放一段短音效（默认 0.6 秒），适合转场"唰"声',
    builtin: true,
    params: [
      { key: 'file', label: '音效文件绝对路径', type: 'string', required: true },
      { key: 'start', label: '起始秒', type: 'number', default: 0 },
      { key: 'length', label: '时长（秒）', type: 'number', default: 0.6 },
      { key: 'volume', label: '音量 0~2', type: 'number', default: 0.8 },
    ],
    steps: [{
      op: 'add_audio',
      args: {
        audios: [{ file: '{{file}}', start: '{{start}}', end: '{{start+length}}', volume: '{{volume}}' }],
      },
    }],
  },
];

/**
 * 受限数字表达式求值：只支持 `a + b - c` 形式（操作数是参数名或数字字面量）。
 * ★ 为什么需要：配方里最常见的派生是「结束 = 起点 + 时长」（音效/字幕），
 *   没有它就得让调用方把两个时间都算好传进来，等于把"确定性"又还给调用方。
 * ★ 为什么只有加减：够用、且完全可预期 —— 不引入 eval，不做乘除与括号。
 */
function evalNumericExpr(expr: string, params: Record<string, unknown>): number {
  const parts = expr.split(/([+-])/);
  let total = 0;
  let sign = 1;
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    if (p === '+') { sign = 1; continue; }
    if (p === '-') { sign = -1; continue; }
    const v = p in params ? Number(params[p]) : Number(p);
    if (!Number.isFinite(v)) {
      throw new RecipeParamError(`无法求值 {{${expr}}}：${p} 既不是参数也不是数字`);
    }
    total += sign * v;
  }
  return Number(total.toFixed(4));
}

/** 递归替换 `{{key}}` 占位：整串就是占位时保留原类型（数字/布尔），否则按字符串插值。 */
export class RecipeParamError extends Error {}

export function substituteDeep(value: unknown, params: Record<string, unknown>, pathHint = ''): unknown {
  if (typeof value === 'string') {
    const whole = /^\{\{\s*(.+?)\s*\}\}$/.exec(value);
    if (whole) {
      const expr = whole[1];
      if (expr in params) return params[expr];
      if (/[+\-]/.test(expr)) return evalNumericExpr(expr, params);
      throw new RecipeParamError(`配方参数缺失：${expr}${pathHint ? `（${pathHint}）` : ''}`);
    }
    return value.replace(/\{\{\s*(.+?)\s*\}\}/g, (_m, expr: string) => {
      if (expr in params) return String(params[expr]);
      if (/[+\-]/.test(expr)) return String(evalNumericExpr(expr, params));
      throw new RecipeParamError(`配方参数缺失：${expr}${pathHint ? `（${pathHint}）` : ''}`);
    });
  }
  if (Array.isArray(value)) return value.map((v, i) => substituteDeep(v, params, `${pathHint}[${i}]`));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = substituteDeep(v, params, pathHint ? `${pathHint}.${k}` : k);
    }
    return out;
  }
  return value;
}

/** 按参数字段类型规范化用户传入值（字符串 '0.8' 也接受，减少调用方负担）。 */
function coerceParam(def: ClipRecipeParam, raw: unknown): unknown {
  if (def.type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new RecipeParamError(`参数 ${def.key} 需要数字，收到：${String(raw)}`);
    return n;
  }
  if (def.type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    const s = String(raw).trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(s)) return true;
    if (['false', '0', 'no', 'off'].includes(s)) return false;
    throw new RecipeParamError(`参数 ${def.key} 需要布尔值，收到：${String(raw)}`);
  }
  const s = String(raw);
  if (!s.trim()) throw new RecipeParamError(`参数 ${def.key} 不能为空`);
  return s;
}

/** 合并默认值 + 校验必填，得到最终参数表。 */
export function resolveParams(recipe: ClipRecipe, given: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of recipe.params || []) {
    const raw = given[def.key];
    if (raw === undefined || raw === null || raw === '') {
      if (def.default !== undefined) { out[def.key] = def.default; continue; }
      if (def.required) throw new RecipeParamError(`配方「${recipe.name}」缺少必填参数：${def.key}（${def.label}）`);
      continue;
    }
    out[def.key] = coerceParam(def, raw);
  }
  return out;
}

/**
 * 套用配方：按顺序跑每个 op。**任一步失败即停**并指出是第几步 ——
 * 继续跑下去只会把工程改得更乱，报错也离真正原因更远。
 */
export function applyRecipe(
  project: ClipProject,
  recipe: ClipRecipe,
  given: Record<string, unknown> = {},
): { ok: true; project: ClipProject; notes: string[] } | { ok: false; error: string } {
  let params: Record<string, unknown>;
  try {
    params = resolveParams(recipe, given);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  let cur = project;
  const notes: string[] = [];
  for (let i = 0; i < recipe.steps.length; i++) {
    const step = recipe.steps[i];
    let args: Record<string, unknown>;
    try {
      args = substituteDeep(step.args || {}, params) as Record<string, unknown>;
    } catch (e) {
      return { ok: false, error: `配方第 ${i + 1} 步（${step.op}）：${e instanceof Error ? e.message : String(e)}` };
    }
    const r = applyClipOp(cur, step.op, args);
    if (!r.ok) return { ok: false, error: `配方第 ${i + 1} 步（${step.op}）失败：${r.error}` };
    cur = r.project;
    notes.push(r.note);
  }
  return { ok: true, project: cur, notes };
}

const RECIPE_MAX_STEPS = 20;
const RECIPE_MAX_BYTES = 64 * 1024;

/**
 * 校验用户提交的配方数据（存盘前）。封闭校验：只认白名单 op、步骤数与体积有上限。
 * ★ 不做"试跑"：合法配方可能依赖当前工程里的片段（试跑会把合法配方误杀）。
 */
export function validateRecipeData(raw: unknown): { ok: true; recipe: ClipRecipe } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: '配方必须是对象' };
  const m = raw as Record<string, unknown>;
  const id = String(m.id ?? '').trim();
  if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(id)) {
    return { ok: false, error: 'id 需为 2~48 位小写字母/数字/连字符（如 "my-look"）' };
  }
  const name = String(m.name ?? '').trim();
  if (!name) return { ok: false, error: 'name 必填' };
  const desc = String(m.desc ?? m.description ?? '').trim();
  const stepsRaw = Array.isArray(m.steps) ? m.steps : [];
  if (!stepsRaw.length) return { ok: false, error: 'steps 必填且非空' };
  if (stepsRaw.length > RECIPE_MAX_STEPS) return { ok: false, error: `steps 最多 ${RECIPE_MAX_STEPS} 步` };
  const steps: ClipRecipeStep[] = [];
  for (let i = 0; i < stepsRaw.length; i++) {
    const s = stepsRaw[i];
    if (!s || typeof s !== 'object') return { ok: false, error: `steps[${i}] 必须是对象` };
    const sm = s as Record<string, unknown>;
    const op = String(sm.op ?? '').trim().toLowerCase();
    if (!RECIPE_ALLOWED_OPS.has(op)) {
      return { ok: false, error: `steps[${i}].op 不支持：${op || '(空)'}（可选：${[...RECIPE_ALLOWED_OPS].join(' / ')}）` };
    }
    const args = sm.args;
    if (args != null && (typeof args !== 'object' || Array.isArray(args))) {
      return { ok: false, error: `steps[${i}].args 必须是对象` };
    }
    steps.push({ op, args: (args as Record<string, unknown>) || {} });
  }
  const paramsRaw = Array.isArray(m.params) ? m.params : [];
  const params: ClipRecipeParam[] = [];
  for (let i = 0; i < paramsRaw.length; i++) {
    const p = paramsRaw[i];
    if (!p || typeof p !== 'object') return { ok: false, error: `params[${i}] 必须是对象` };
    const pm = p as Record<string, unknown>;
    const key = String(pm.key ?? '').trim();
    // ★ key 里不允许 +/-：占位表达式按加减切分，键名带减号会歧义
    if (!/^[\w.]+$/.test(key)) return { ok: false, error: `params[${i}].key 非法：${key || '(空)'}（只允许字母/数字/下划线/点）` };
    const type = String(pm.type ?? 'string') as ClipRecipeParam['type'];
    if (!['string', 'number', 'boolean'].includes(type)) {
      return { ok: false, error: `params[${i}].type 只支持 string/number/boolean` };
    }
    params.push({
      key,
      label: String(pm.label ?? key),
      type,
      ...(pm.required === true ? { required: true } : {}),
      ...(pm.default !== undefined ? { default: pm.default as ClipRecipeParam['default'] } : {}),
      ...(pm.desc ? { desc: String(pm.desc) } : {}),
    });
  }
  const recipe: ClipRecipe = { id, name, desc, ...(params.length ? { params } : {}), steps };
  if (Buffer.byteLength(JSON.stringify(recipe), 'utf8') > RECIPE_MAX_BYTES) {
    return { ok: false, error: '配方体积超过 64KB 上限' };
  }
  return { ok: true, recipe };
}
