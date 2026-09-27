/**
 * P2 剩余：三类 SOP 工作流模板（小说改写 / 翻译 / 有声小说）—— 守门 + 真机集成测试。
 *
 * 为什么必须有两层：
 *   ① **静态守门**：确认点是靠提示词约束不可靠的东西（模型会一路跑完）。三类流水线
 *      必须像短剧那样把确认点做成**图上的结构事实**，且确认点要真的排在「烧算力/写文件之前」。
 *      这类断言只能读定义 —— 但要注意剥注释，注释里写了正确写法会让断言假绿。
 *   ② **真机集成**：code 节点的表达式写错**不会抛错**，CodeNodeHandler 会 catch 后返回 null，
 *      表现为「跑完但产物是空的」——最难查的一类问题。所以要用真实引擎跑真实拓扑，
 *      并把 llm / api 工具这些边界桩掉，验证：挂起真的拦住下游、分批切片正确、
 *      loop body 能读父 ctx 里用户确认过的参数、汇总能把 loop 的嵌套输出还原成文本。
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  seedBuiltinWorkflowAgents, WF_NOVEL_ID, WF_TRANSLATE_ID, WF_AUDIOBOOK_ID,
} from '../src/builtin-workflow-agents';

// 独立沙箱库（不碰用户 data.db）—— 真机部分要落 workflow_run.pending_confirm_json
const box = vi.hoisted(() => {
  const fsMod = require('node:fs');
  const osMod = require('node:os');
  const pathMod = require('node:path');
  const dir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'yz-sop-'));
  return { dir };
});
process.env.DATA_DIR = box.dir;

const SERVER_SRC = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(SERVER_SRC, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const SRC = read('src/builtin-workflow-agents.ts');
const SRC_CODE = strip(SRC);

const runner = () => import('../src/workflow-runner');
const defs = () => import('../src/builtin-workflow-agents');

interface Node { id: string; type: string; config: Record<string, any>; position: any }
interface Wf { nodes: Node[]; edges: Array<{ id: string; source: string; target: string; sourceHandle?: string }> }

/**
 * 捕获 seed 写入的定义（与 builtin-workflows.test.ts 同款手法）。
 *
 * ★ 为什么用 seed 捕获而不是 export 内部函数：seed 列表本身就是「哪些流水线真正落库」的
 *   唯一真相 —— 直接捕获能把「定义了但忘了 seed」这类缺陷一起测出来。
 */
function captureDefs(): Record<string, Wf> {
  const captured: Record<string, Wf> = {};
  const fake: any = {
    prepare() {
      return {
        get: () => undefined, // 视为「不存在」→ 走 INSERT 分支
        run: (...args: unknown[]) => {
          const id = String(args[0]);
          const json = args.find((a) => typeof a === 'string' && String(a).trim().startsWith('{') && String(a).includes('nodes'));
          if (json) captured[id] = JSON.parse(String(json));
        },
      };
    },
  };
  // 同步 import 的 seed 函数（与 builtin-workflows.test.ts 一致：顶层 import 即可）
  seedBuiltinWorkflowAgents(fake);
  return captured;
}

const DEFS = captureDefs();

/** 取某条流水线的定义（拿不到直接失败，别让后续断言在 undefined 上瞎跑） */
function wfOf(id: string): Wf {
  const wf = DEFS[id];
  expect(wf, `★★ 流水线 ${id} 未被 seed（定义了但没进 seed 列表？）`).toBeTruthy();
  return wf;
}

const byId = (wf: Wf, id: string) => wf.nodes.find((n) => n.id === id);

/** loop body 出边的目标节点 = body 首节点（结构化取，不靠正则猜边字段顺序） */
const bodyFirst = (wf: Wf, loopId: string): Node => {
  const e = wf.edges.find((x) => x.source === loopId && x.sourceHandle === 'loop_body');
  expect(e, `★ ${loopId} 缺 loop_body 出边`).toBeTruthy();
  const n = byId(wf, e!.target);
  expect(n, `★ body 首节点 ${e!.target} 不存在`).toBeTruthy();
  return n!;
};

const codeExpr = (wf: Wf, id: string): string => String(byId(wf, id)?.config?.expression || '');

// ── code 节点表达式的直接求值（复用引擎同款沙箱语义）──
function evalCode(expr: string, ctx: Record<string, unknown>): unknown {
  const outputs = new Map<string, unknown>(Object.entries((ctx.__outputs as Record<string, unknown>) || {}));
  const inputs = (ctx.__inputs as Record<string, unknown>) || {};
  const runCtx = {
    inputs,
    outputs,
    callStack: [],
    get: (id: string) => outputs.get(id),
    set: (id: string, v: unknown) => outputs.set(id, v),
  };
  // 与 CodeNodeHandler 同一套沙箱包装（严格模式 + 屏蔽浏览器/计时器全局）
  const sandboxed = `"use strict"; const window=void 0,document=void 0,fetch=void 0,XMLHttpRequest=void 0,setTimeout=void 0,setInterval=void 0; return (function(ctx){ ${expr} })(ctx);`;
  // eslint-disable-next-line no-new-func
  return new Function('ctx', sandboxed)(runCtx);
}

const NV = () => wfOf(WF_NOVEL_ID);
const TR = () => wfOf(WF_TRANSLATE_ID);
const AB = () => wfOf(WF_AUDIOBOOK_ID);

describe('① 三类 SOP 流水线都必须存在且已 seed', () => {
  it('★ 小说改写 / 翻译 / 有声小说 三条流水线都已注册为内置工作流', () => {
    expect(SRC_CODE, '★ 缺小说改写流水线').toMatch(/export const WF_NOVEL_ID/);
    expect(SRC_CODE, '★ 缺翻译流水线').toMatch(/export const WF_TRANSLATE_ID/);
    expect(SRC_CODE, '★ 缺有声小说流水线').toMatch(/export const WF_AUDIOBOOK_ID/);
    // 三条都要进 seed 列表（只写函数不 seed = 库里查不到，用户用不上）
    for (const id of ['WF_NOVEL_ID', 'WF_TRANSLATE_ID', 'WF_AUDIOBOOK_ID']) {
      expect(SRC_CODE, `★★ ${id} 未进 seed 列表（定义写了但没落库）`).toMatch(new RegExp(`id: ${id},`));
    }
  });

  it('★★ LLM 模型回填必须覆盖全部流水线（漏一条 → 运行时缺模型整条跑不通）', () => {
    const m = SRC_CODE.match(/for \(const agentId of \[([^\]]*)\]\)/);
    expect(m, '★ 找不到模型回填的遍历列表').toBeTruthy();
    for (const id of ['WF_MAIN_ID', 'WF_DRAMA_ID', 'WF_NOVEL_ID', 'WF_TRANSLATE_ID', 'WF_AUDIOBOOK_ID']) {
      expect(m![1], `★★ 模型回填漏了 ${id}（该流水线的 llm 节点会缺 platformId/modelId）`).toContain(id);
    }
  });

  it('★ 定义版本必须提升（否则旧库不覆盖，用户看不到新流水线）', () => {
    expect(SRC_CODE, '★★ WF_DEF_VERSION 未提升').toMatch(/WF_DEF_VERSION = 7/);
  });

  it('★ 所有 code/condition 表达式语法必须合法（写错会被静默吞成 null）', () => {
    const bad: string[] = [];
    for (const [name, wf] of [['小说改写', NV()], ['翻译', TR()], ['有声小说', AB()]] as const) {
      for (const n of wf.nodes) {
        if (n.type !== 'code' && n.type !== 'condition') continue;
        const expr = String(n.config.expression || '');
        if (!expr) { bad.push(`${name}:${n.id} 表达式为空`); continue; }
        try {
          const body = n.type === 'condition' ? expr : `"use strict"; return (function(ctx){ ${expr} })(ctx);`;
          // eslint-disable-next-line no-new-func
          new Function('ctx', body);
        } catch (e) {
          bad.push(`${name}:${n.id} → ${(e as Error).message}`);
        }
      }
    }
    expect(bad, `★★ 存在语法非法的表达式（运行期被吞成 null，产物静默为空）:\n${bad.join('\n')}`).toEqual([]);
  });
});

describe('② 确认点必须是图上的结构事实，且排在"烧算力之前"', () => {
  // 结构化判据：节点类型 + 边的可达性。比正则可靠（不受边字段书写顺序影响）
  const isConfirm = (wf: Wf, id: string) => byId(wf, id)?.type === 'human_confirm';
  /** 从 from 出发沿边能到达 to 吗（"排在之前"的可达性判据） */
  const canReach = (wf: Wf, from: string, to: string): boolean => {
    const seen = new Set<string>([from]);
    const q = [from];
    while (q.length) {
      const cur = q.shift()!;
      for (const e of wf.edges.filter((x) => x.source === cur)) {
        if (e.target === to) return true;
        if (!seen.has(e.target)) { seen.add(e.target); q.push(e.target); }
      }
    }
    return false;
  };

  it('★★ 小说改写：目标确认 → 大纲确认 → 逐批确认，三级都要有', () => {
    const wf = NV();
    for (const id of ['nv_goal_confirm', 'nv_outline_confirm', 'nv_batch_confirm']) {
      expect(isConfirm(wf, id), `★ ${id} 不是 human_confirm 节点（缺确认点）`).toBe(true);
    }
    // ★ 顺序：确认必须在「真正干活」的节点之前 —— 用可达性判据，不靠边的书写顺序
    expect(canReach(wf, 'nv_goal_confirm', 'nv_outline_llm'), '★★ 目标确认未排在大纲生成之前').toBe(true);
    expect(canReach(wf, 'nv_outline_confirm', 'nv_loop'), '★★ 大纲确认未排在开始改写（loop）之前').toBe(true);
    // ★ 逐批确认在 loop **body 内部** —— 它的保证是「每一轮迭代都必须经过它」，
    //   所以判据是「body 首节点能到达它」，而不是「它能到达 exit 侧的汇总节点」
    //   （body 尾节点本就没有出边，用 exit 侧判据会永远 false —— 我第一版就写错了）。
    const bodyStart = bodyFirst(wf, 'nv_loop');
    expect(canReach(wf, bodyStart.id, 'nv_batch_confirm'), '★★ 逐批确认不在 loop 迭代路径上（每批跑完不经过确认）').toBe(true);
    // 且确认之后没有别的产出节点（确认就是本轮的最后一环，防止"确认了但产出还没出"）
    expect(wf.edges.filter((e) => e.source === 'nv_batch_confirm').length, '★ 逐批确认之后还有节点（确认的不是最终稿）').toBe(0);
    // 反向判据：改写（loop）不能先于确认 —— 几十章都改完了才问，白烧额度
    expect(canReach(wf, 'nv_loop', 'nv_goal_confirm'), '★★ 小说确认点挂到了 loop 之后（改完才问，方向错全废）').toBe(false);
  });

  it('★★ 翻译：语种/术语确认 + 输出格式确认 + 逐批确认，且都在翻译之前', () => {
    const wf = TR();
    for (const id of ['tr_param_confirm', 'tr_format_confirm', 'tr_batch_confirm']) {
      expect(isConfirm(wf, id), `★ ${id} 不是 human_confirm 节点（缺确认点）`).toBe(true);
    }
    // ★ 输出格式决定每批产出结构，必须前置 —— 放后面会让整稿返工
    expect(canReach(wf, 'tr_format_confirm', 'tr_loop'), '★★ 输出格式确认未排在分批翻译之前（格式没定就开翻，整稿返工）').toBe(true);
    expect(canReach(wf, 'tr_param_confirm', 'tr_loop'), '★★ 术语确认未排在翻译之前').toBe(true);
    expect(canReach(wf, 'tr_loop', 'tr_param_confirm'), '★★ 翻译先于参数确认（顺序反了）').toBe(false);
    // 逐批确认在 body 内部：每一轮迭代都必须经过它（同上，别用 exit 侧判据）
    expect(canReach(wf, bodyFirst(wf, 'tr_loop').id, 'tr_batch_confirm'), '★★ 逐批确认不在 loop 迭代路径上').toBe(true);
  });

  it('★★ 有声小说：参数确认 + 时间轴确认，且都在对应环节之前', () => {
    const wf = AB();
    expect(isConfirm(wf, 'ab_param_confirm'), '★ 缺配音/字幕参数确认点').toBe(true);
    expect(isConfirm(wf, 'ab_timeline_confirm'), '★ 缺时间轴校准确认点').toBe(true);
    // 参数确认必须在配音（loop）之前：音色没定就配完，全部重做
    expect(canReach(wf, 'ab_param_confirm', 'ab_loop'), '★★ 参数确认未排在配音之前（音色没定就配完，全部重做）').toBe(true);
    // 时间轴确认必须在交付清单之前
    expect(canReach(wf, 'ab_timeline_confirm', 'ab_manifest'), '★★ 时间轴确认未排在交付清单之前').toBe(true);
  });

  it('★ 打回一律 onReject: abort（loop 里没有"重做本批"机制，retry 会退化成假确认）', () => {
    for (const [name, wf] of [['小说改写', NV()], ['翻译', TR()], ['有声小说', AB()]] as const) {
      const confirms = wf.nodes.filter((n) => n.type === 'human_confirm');
      expect(confirms.length, `★ ${name} 没有确认点`).toBeGreaterThan(0);
      for (const c of confirms) {
        expect(c.config.onReject, `★★ ${name} 的确认点 ${c.id} 未设 onReject: abort（打回了照样跑下一批）`).toBe('abort');
        // 确认点必须有问句或向导页，否则运行台上弹出一个空框
        const hasQ = String(c.config.question || '').trim().length > 0 || (Array.isArray(c.config.pages) && c.config.pages.length > 0);
        expect(hasQ, `★ ${name} 的确认点 ${c.id} 既无 question 也无 pages`).toBe(true);
      }
    }
  });
});

describe('③ 引擎语义约定：loop/tool 的易错点专项', () => {
  it('★★ loop 的迭代源必须是纯数组（收到对象会退化成"只迭代一次"）', () => {
    for (const [name, wf, srcId, loopId] of [
      ['小说改写', NV(), 'nv_batches', 'nv_loop'],
      ['翻译', TR(), 'tr_batches', 'tr_loop'],
      ['有声小说', AB(), 'ab_list', 'ab_loop'],
    ] as const) {
      const edge = wf.edges.find((e) => e.source === srcId && e.target === loopId);
      expect(edge, `★ ${name} 缺 ${srcId} → ${loopId} 的边`).toBeTruthy();
      expect(byId(wf, srcId)?.type, `★ ${name} 的 ${srcId} 不是 code 节点`).toBe('code');
      // 行为判据（见 ④）：这里只对"有明显数组兜底"的做静态抽查；真值由 ④ 求值验证
      const expr = codeExpr(wf, srcId);
      const arrish = /Array\.isArray|return out;|\[\]/.test(expr);
      expect(arrish, `★ ${name} 的 ${srcId} 未见数组产出特征（对象会让 loop 只迭代一次）`).toBe(true);
      // 行为上再验一次：拿空输入求值，必须是数组
      const out = evalCode(expr, { __inputs: {}, __outputs: { [srcId === 'ab_list' ? 'ab_segments' : srcId]: { chapters: [], segments: [] } } });
      expect(Array.isArray(out), `★★ ${name} 的 ${srcId} 求值结果不是数组`).toBe(true);
    }
  });

  it('★ 每个 loop 都要同时有 body 与 exit 两条出边（缺一个流水线会断）', () => {
    for (const [name, wf, loopId] of [['小说改写', NV(), 'nv_loop'], ['翻译', TR(), 'tr_loop'], ['有声小说', AB(), 'ab_loop']] as const) {
      const outs = wf.edges.filter((e) => e.source === loopId);
      expect(outs.some((e) => e.sourceHandle === 'loop_body'), `★ ${name} 缺 loop_body 出边`).toBe(true);
      expect(outs.some((e) => e.sourceHandle === 'loop_exit'), `★ ${name} 缺 loop_exit 出边`).toBe(true);
    }
  });

  it('★★ loop body 首节点必须是 code 且从 ctx.inputs 取本批（body 首节点拿到的是 loop 自身输出）', () => {
    for (const [name, wf, loopId, key] of [
      ['小说改写', NV(), 'nv_loop', 'ctx.inputs.batch'],
      ['翻译', TR(), 'tr_loop', 'ctx.inputs.batch'],
      ['有声小说', AB(), 'ab_loop', 'ctx.inputs.seg'],
    ] as const) {
      const first = bodyFirst(wf, loopId);
      expect(first.type, `★★ ${name} 的 body 首节点 ${first.id} 不是 code（拿不到 ctx.inputs）`).toBe('code');
      expect(String(first.config.expression), `★★ ${name} 的 body 首节点 ${first.id} 未从 ${key} 取本批（会拿到 loop 自身输出）`).toContain(key);
    }
  });

  it('★ api 工具必须用 toolSource=api 且 arguments 为空（依赖"回落上游输出"语义）', () => {
    for (const [name, wf] of [['有声小说', AB()], ['小说改写', NV()], ['翻译', TR()]] as const) {
      const tools = wf.nodes.filter((n) => n.type === 'tool');
      for (const t of tools) {
        expect(t.config.toolSource, `★ ${name} 的 ${t.id} 应为 toolSource=api`).toBe('api');
        expect(Object.keys(t.config.arguments || {}).length, `★ ${name} 的 ${t.id} arguments 应为空（否则不吃上游入参）`).toBe(0);
      }
    }
  });

  it('★ 工具节点前必须紧邻 code 节点构造入参', () => {
    for (const [name, wf] of [['有声小说', AB()], ['小说改写', NV()], ['翻译', TR()]] as const) {
      for (const t of wf.nodes.filter((n) => n.type === 'tool')) {
        const edge = wf.edges.find((e) => e.target === t.id);
        expect(edge, `★ ${name} 的工具 ${t.id} 没有入边`).toBeTruthy();
        expect(byId(wf, edge!.source)?.type, `★ ${name} 的工具 ${t.id} 上游 ${edge!.source} 不是 code 节点`).toBe('code');
      }
    }
  });

  it('★ llm 节点留空模型（由 ensureBuiltinWorkflowModel 回填）', () => {
    for (const [name, wf] of [['小说改写', NV()], ['翻译', TR()], ['有声小说', AB()]] as const) {
      const llms = wf.nodes.filter((n) => n.type === 'llm');
      expect(llms.length, `★ ${name} 至少应有一个 llm 节点`).toBeGreaterThan(0);
      for (const l of llms) {
        expect(l.config.modelId, `★★ ${name} 的 llm 节点 ${l.id} 未留空模型（回填逻辑会跳过它 → 运行时缺模型）`).toBe('');
      }
    }
  });

  it('★★ 有声小说不得直接依赖 ffmpeg（缺一个二进制不该让整条流水线跑不通）', () => {
    const wf = AB();
    const names = wf.nodes.filter((n) => n.type === 'tool').map((n) => String(n.config.toolName));
    expect(names, '★★ 有声小说流水线直接调了 media_compose（缺 ffmpeg 整条挂掉）').not.toContain('media_compose');
    expect(names, '★ 有声小说应调 api_tts_speak 产配音').toContain('api_tts_speak');
    expect(names, '★ 有声小说应调 api_srt_generate 产字幕').toContain('api_srt_generate');
  });
});

describe('④ code 节点真实行为（直接求值，验证分批/解析/汇总逻辑）', () => {
  // 直接用 seed 捕获到的真实定义（与 ①②③ 同源，不另取一套）
  const nv = () => NV();
  const tr = () => TR();
  const ab = () => AB();
  const expr = (wf: () => Wf, id: string) => codeExpr(wf(), id);

  it('★★ 分批：用户没答批次大小 → 默认每批 3', () => {
    const chapters = Array.from({ length: 8 }, (_, i) => ({ index: i + 1, title: `第${i + 1}章`, words: 1000 }));
    const out = evalCode(expr(nv, 'nv_batches'), {
      __inputs: {},
      __outputs: { nv_scan: { chapters }, nv_goal_confirm: { answers: [] } },
    }) as Array<{ chapters: unknown[] }>;
    expect(Array.isArray(out), '★ 分批未返回数组（loop 会只迭代一次）').toBe(true);
    expect(out.map((b) => b.chapters.length), '★★ 默认批次不是 3').toEqual([3, 3, 2]);
  });

  it('★★ 分批：用户答了"每批 2 章" → 必须按用户说的切（默认值不能盖掉用户意图）', () => {
    const chapters = Array.from({ length: 5 }, (_, i) => ({ index: i + 1, title: `第${i + 1}章` }));
    const out = evalCode(expr(nv, 'nv_batches'), {
      __inputs: {},
      __outputs: {
        nv_scan: { chapters },
        nv_goal_confirm: { answers: [{ question: '每批改写几章？', answer: '每批 2 章' }] },
      },
    }) as Array<{ chapters: unknown[] }>;
    expect(out.map((b) => b.chapters.length), '★★ 未采纳用户指定的批次大小').toEqual([2, 2, 1]);
  });

  it('★ 分批：批次大小要夹在合理区间（0 / 负数 / 超大值都不能把流水线搞崩）', () => {
    const chapters = Array.from({ length: 4 }, (_, i) => ({ index: i + 1, title: `第${i + 1}章` }));
    const zero = evalCode(expr(nv, 'nv_batches'), {
      __inputs: {},
      __outputs: { nv_scan: { chapters }, nv_goal_confirm: { answers: [{ question: '每批几章', answer: '0 章' }] } },
    }) as Array<unknown>;
    expect(zero.length, '★★ 批次大小 0 会导致死循环/空分成空数组').toBeGreaterThan(0);
    const huge = evalCode(expr(nv, 'nv_batches'), {
      __inputs: {},
      __outputs: { nv_scan: { chapters }, nv_goal_confirm: { answers: [{ question: '每批几章', answer: '99 章' }] } },
    }) as Array<{ chapters: unknown[] }>;
    expect(huge.length, '★ 超大批次被夹到上限（仍能切出批次）').toBeGreaterThan(0);
  });

  it('★★ loop body 能读父 ctx 里用户确认过的参数（引擎把 outputs 复制进 itemCtx）', () => {
    const out = evalCode(expr(nv, 'nv_batch_args'), {
      __inputs: { batch: { batchIndex: 2, chapters: [{ title: '第三章 夜行', words: 1800, excerpt: '风起了' }] } },
      __outputs: {
        nv_outline_llm: '逐章大纲……',
        nv_goal_confirm: { answers: [{ question: '改成什么风格？', answer: '冷硬推理' }, { question: '人称与视角？', answer: '改第一人称' }] },
      },
    }) as string;
    expect(typeof out, '★ body 构造入参未返回文本').toBe('string');
    expect(out, '★★ 改写目标未带进 prompt（确认了等于没确认）').toContain('冷硬推理');
    expect(out, '★ 人称选择未带进 prompt').toContain('改第一人称');
    expect(out, '★ 本批章节未带进 prompt').toContain('第三章 夜行');
    expect(out, '★ 大纲未带进 prompt').toContain('逐章大纲');
    expect(out, '★★ 未限定"只改本批"（模型会顺手把后面的也改了）').toContain('只改写下面这一批');
  });

  it('★★ 汇总：loop 的嵌套输出必须还原成文本（还原不出 → 交付一份空稿）', () => {
    // loop 输出形状 = 每轮 body 的 outputs 数组
    const loopOut = [
      [null, '第一章正文……'],
      [null, '第二章正文……'],
    ];
    const out = evalCode(expr(nv, 'nv_assemble'), {
      __inputs: {},
      __outputs: { nv_loop: loopOut, nv_scan: { chapters: [{ index: 1 }, { index: 2 }] } },
    }) as { fullText: string; batches: number };
    expect(out.batches, '★★ 未从 loop 输出里数出批次').toBe(2);
    expect(out.fullText, '★★ 全稿文本为空（交付空稿）').toContain('第一章正文');
    expect(out.fullText, '★★ 第二章正文丢失').toContain('第二章正文');
  });

  it('★★ 有声小说：空文本必须返回 null（空串调 TTS 会直接报错中断整条流水线）', () => {
    const out = evalCode(expr(ab, 'ab_tts_args'), {
      __inputs: { seg: { index: 1, text: '   ', seconds: 5, tone: '旁白' } },
      __outputs: { ab_param_confirm: { answers: [] } },
    });
    expect(out, '★★ 空文本没有返回 null（会拿空串去调 TTS，报错中断）').toBeNull();
  });

  it('★ 有声小说：语速从已确认的向导作答里解析，并夹在 ±10', () => {
    const mk = (answer: string) => evalCode(expr(ab, 'ab_tts_args'), {
      __inputs: { seg: { index: 1, text: '正文', seconds: 5, tone: '主角' } },
      __outputs: { ab_param_confirm: { answers: [{ question: '语速（-10 到 10，0 为原速）？', answer }] } },
    }) as { rate: number; character: string };
    expect(mk('语速 5').rate, '★ 未采纳用户语速').toBe(5);
    expect(mk('30').rate, '★★ 语速未夹上限（超范围会被上游拒）').toBe(10);
    expect(mk('-30').rate, '★★ 语速未夹下限').toBe(-10);
    expect(mk('').rate, '★ 未作答应回落原速 0').toBe(0);
    expect(mk('3').character, '★ 角色（语气）未传给 TTS（同角色无法锁定同音色）').toBe('主角');
  });

  it('★★ 翻译：术语表与输出格式必须带进每批的 prompt（否则每批各译各的）', () => {
    const out = evalCode(expr(tr, 'tr_batch_args'), {
      __inputs: { batch: { batchIndex: 1, segments: [{ index: 1, head: '开篇' }] } },
      __outputs: {
        tr_segments: { terms: [{ from: '言智', to: 'YanZhi', note: '产品名' }] },
        tr_param_confirm: { answers: [{ question: '翻译风格与用途？', answer: '严谨直译', supplement: '法律文本' }] },
        tr_format_confirm: { answers: [{ question: '要哪种输出格式？', answer: '中英对照（逐段）' }] },
      },
    }) as string;
    expect(out, '★★ 术语表未带进 prompt（全文术语不统一）').toContain('言智 = YanZhi');
    expect(out, '★ 输出格式未带进 prompt（每批格式不一致）').toContain('中英对照');
    expect(out, '★ 风格/用途未带进 prompt').toContain('严谨直译');
    expect(out, '★ 补充说明丢失').toContain('法律文本');
    expect(out, '★★ 未写"不要漏译/增删"的硬约束（翻译最常见的失败模式）').toContain('不要漏译');
  });

  it('★ 翻译：首轮解析要能剥掉 ```json 代码块（模型经常裹）', () => {
    const out = evalCode(expr(tr, 'tr_segments'), {
      __inputs: {},
      __outputs: {
        tr_scan_llm: '```json\n{"sourceLang":"中文","segments":[{"index":1,"head":"开篇"}],"terms":[{"from":"a","to":"b"}]}\n```',
      },
    }) as { ok: boolean; sourceLang: string; segments: unknown[]; terms: unknown[] };
    expect(out.ok, '★★ 裹了代码块就解析失败（首轮就卡住）').toBe(true);
    expect(out.sourceLang).toBe('中文');
    expect(out.segments.length).toBe(1);
    expect(out.terms.length).toBe(1);
  });

  it('★ 解析失败要返回 ok:false（code 节点 catch 会吞错，不能靠 throw）', () => {
    const bad = evalCode(expr(tr, 'tr_segments'), { __inputs: {}, __outputs: { tr_scan_llm: '模型今天不想输出 JSON' } }) as { ok: boolean; error: string };
    expect(bad.ok, '★★ 非法输出未标记 ok:false（错误被静默吞掉）').toBe(false);
    expect(bad.error, '★ 失败未带原因').toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────
// 真机：用真实引擎跑真实拓扑（llm / api 边界桩掉），证明确认点真的拦住
// ────────────────────────────────────────────────────────────

/** 把 llm 节点换成 code 节点（返回罐头输出），其余拓扑原样 —— 用于在无模型环境下跑真图 */
function stubLlm(wf: { nodes: any[]; edges: any[] }, canned: Record<string, string>) {
  return {
    nodes: wf.nodes.map((n) => (n.type === 'llm'
      ? { ...n, type: 'code', config: { ...n.config, expression: `return ${JSON.stringify(canned[n.id] ?? '（桩输出）')};` } }
      : n)),
    edges: wf.edges,
  };
}

async function waitPending(m: typeof import('../src/workflow-runner'), runId: string) {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const p = m.getPendingConfirm(runId);
    if (p) return p as any;
  }
  return null;
}

describe('⑤ 真机集成：确认点必须真的拦住真实拓扑', () => {
  beforeAll(async () => {
    const { db } = await import('../src/db');
    const ts = Date.now();
    db.prepare('INSERT OR IGNORE INTO agent (id, user_id, name, type, workflow_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(WF_NOVEL_ID, 'guest', '小说改写流水线', 'workflow', JSON.stringify(NV()), ts, ts);
  });

  it('★★ 小说改写：第一道确认（改写目标）挂起 → 下游全部未执行；确认后一路跑到下一道确认', async () => {
    const m = await runner();

    // 章节扫描的罐头输出（3 章 → 默认每批 3 → 单批）
    const cannedShots = JSON.stringify({
      chapters: [
        { index: 1, title: '第一章 起风', excerpt: '风起了', words: 1200 },
        { index: 2, title: '第二章 夜行', excerpt: '他出发了', words: 1100 },
        { index: 3, title: '第三章 归途', excerpt: '天亮了', words: 900 },
      ],
      goalOptions: [{ style: '悬疑冷峻', person: '第三人称限制视角' }],
    });

    const wf = stubLlm(NV(), {
      nv_scan_llm: cannedShots,
      nv_outline_llm: '逐章大纲：保留主线，压缩支线……',
      nv_check_llm: '一致性：通过；冲突项：无',
    });
    // 逐批改写节点也要桩（真跑会调模型）—— 用 code 返回一段带章节信息的假正文
    const wf2 = {
      nodes: wf.nodes.map((n: any) => (n.id === 'nv_batch_llm'
        ? { ...n, type: 'code', config: { ...n.config, expression: "return '【本批改写正文】' + JSON.stringify((ctx.inputs.batch||{}).chapters||[]);" } }
        : n)),
      edges: wf.edges,
    };

    const runId = m.startWorkflowRun(
      { agent: { id: WF_NOVEL_ID, name: '小说改写流水线', workflow: wf2 as any }, subAgents: {} } as any,
      { source: '第一章……第二章……第三章……' },
      'guest',
    );
    expect(runId, '运行未启动').toBeTruthy();

    // ① 停在第一道确认（改写目标）
    const p1 = await waitPending(m, runId);
    expect(p1, '★★ 小说改写没有停下来等确认（确认形同虚设）').toBeTruthy();
    expect(p1.nodeId, '★ 停在了错误的节点').toBe('nv_goal_confirm');

    const okOf = (id: string) => ((m.getWorkflowRun(runId)?.events || []) as any[])
      .some((e) => e.type === 'node:ok' && e.nodeId === id);
    const started = (id: string) => ((m.getWorkflowRun(runId)?.events || []) as any[])
      .some((e) => e.type === 'node:start' && e.nodeId === id);
    // ★ 核心判据：目标没确认之前，大纲/分批/loop/确认下游都不能跑过
    for (const id of ['nv_outline_llm', 'nv_batches', 'nv_loop', 'nv_batch_confirm', 'nv_out']) {
      expect(okOf(id), `★★ 未确认前 ${id} 已执行 —— 确认点没拦住`).toBe(false);
    }
    expect(started('nv_goal_confirm'), '★ 确认节点未发 node:start（运行台上看不到）').toBe(true);

    // ② 提交目标确认 → 继续到第二道确认（大纲）
    expect(m.resolveHumanConfirm(runId, p1.callId, {
      rejected: false,
      answers: [{ question: '改成什么风格？', answer: '冷硬推理' }, { question: '每批改写几章？', answer: '3' }],
    }), '提交确认未找到等待者').toBe(true);

    const p2 = await waitPending(m, runId);
    expect(p2, '★★ 提交后未到达第二道确认（大纲）').toBeTruthy();
    expect(p2.nodeId, '★ 第二道确认节点不对').toBe('nv_outline_confirm');

    // ③ 提交大纲确认 → 进入 loop，跑完最后一道确认
    expect(m.resolveHumanConfirm(runId, p2.callId, { rejected: false, answers: [{ question: '这个大纲可以直接开始改写吗？', answer: '可以直接改写' }] })).toBe(true);

    const p3 = await waitPending(m, runId);
    expect(p3, '★★ 逐批确认点未挂起（批次确认形同虚设）').toBeTruthy();
    expect(p3.nodeId, '★ 逐批确认节点不对').toBe('nv_batch_confirm');

    expect(m.resolveHumanConfirm(runId, p3.callId, { rejected: false, answers: [{ question: '本批改写可以定稿吗？', answer: '可以，继续下一批' }] })).toBe(true);

    // ④ 等跑完
    const run = m.getWorkflowRun(runId);
    if (run) await Promise.race([run.finished, new Promise((r) => setTimeout(r, 15000))]);
    const st = m.getWorkflowRun(runId);
    expect(st?.status, '★ 提交后运行未完成').toBe('completed');
    // ⑤ 产物必须落进 output 节点
    expect((st?.result as any)?.delivery, '★★ output 节点没有产物（交付为空）').toBeTruthy();
    expect(m.getPendingConfirm(runId), '★ 完成后 pendingConfirm 未清除').toBeNull();
  }, 60000);
});