/**
 * 运行时生成子智能体（spawn_subagent）守门测试。
 *
 * 对齐论文：AOrchestra: Automating Sub-Agent Creation for Agentic Orchestration
 * (ICML 2026, arXiv:2602.03786) —— 把子智能体从"静态角色"升级为运行时四元组
 *   Φ = (Instruction, Context, Tools, Model)
 * 主智能体发现手头没有对口执行能力时，现场填四元组造一个临时执行者。
 *
 * ★ 本文件断言的重点**不是"功能有没有"**，而是**三道安全闸有没有真的把守**：
 *   ① 不得提权 —— 子智能体工具必须是父级的子集
 *   ② 黑名单   —— 派生类/定义类工具不可转授（防递归自增殖 + 防自我提权）
 *   ③ 预算闸   —— 单任务内现场生成次数有上限
 *   这三条"失效了不报错"，是本次实现里最容易埋雷的地方
 *   （实测已抓到一次：提权项被记进 dropped 但**同时仍留在 pinned**，工具照给）。
 *
 * ★ 本机 pnpm 的 vitest 包目录为空（已知环境问题）→ 断言写成静态断言；
 *   等价真跑见 tools/verify-spawn-subagent.cjs（44/44，含提权反例）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
/** ★ 剥注释 —— 不剥会让注释里的函数名造成 `.not.toMatch` 假红（本项目踩过两次） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SPEC = strip(read('apps/server/src/services/subagent-spec.ts'));
const LTM = strip(read('apps/server/src/llm-task-manager.ts'));
const PERM = strip(read('apps/server/src/tool-permission.ts'));
const IDX = strip(read('packages/core/src/tool/builtin/index.ts'));
const TOOL = strip(read('packages/core/src/tool/builtin/spawn-sub-agent.ts'));
const DB = strip(read('apps/server/src/db.ts'));

function at(code: string, needle: string, label: string): number {
  const i = code.indexOf(needle);
  expect(i, `★ 锚点失效（源码结构变了）：${label}`).toBeGreaterThan(-1);
  return i;
}
function win(code: string, needle: string, len: number, label?: string): string {
  const i = at(code, needle, label || needle);
  return code.slice(i, i + len);
}

describe('① 不得提权 —— 子智能体工具必须是父级子集', () => {
  it('★★★ 越权项必须同时从 pinned 里剔除（记了 dropped 但照给 = 提权漏洞）', () => {
    // 实测踩过：第一版只往 dropped 记一笔，pinned 里仍然含 cmd_exec —— 原因写了、工具也给了。
    const body = win(SPEC, 'export function resolveSpecTools', 2600, 'resolveSpecTools');
    expect(body, '★ 未做父级归属过滤（展开结果必须与 parentSet 求交集）')
      .toMatch(/parentSet\.has\(n\)/);
    expect(body, '★ 未把越权项从展开结果中排除').toMatch(/overreachSet|overreach\.has/);
  });

  it('★★ 通配展开必须限定在父级已挂载集合内（browser_* 不能凭空要来权限）', () => {
    expect(SPEC, '★ 通配展开未以父级集合为全集')
      .toMatch(/expandToolPatterns\(args\.requested,\s*parentSet\)/);
  });

  it('★★ 拒绝必须回显原因（静默变纯推理 = 模型不知道为什么能力没给）', () => {
    const body = win(SPEC, 'export function resolveSpecTools', 2600, 'resolveSpecTools');
    expect(body, '★ 未回显越权原因').toMatch(/不得提权获得/);
  });

  it('★ 裸 `*` 不得被当作"要全部"（等于一步要到所有权限）', () => {
    const body = win(SPEC, 'export function expandToolPatterns', 900, 'expandToolPatterns');
    expect(body, '★ 未拦截裸 `*`').toMatch(/if \(!prefix\) continue/);
  });

  it('★ 工具数必须有硬上限（防一口气列 100 个把提示词撑爆）', () => {
    expect(SPEC, '★ 无 MAX_PINNED_TOOLS 上限').toMatch(/MAX_PINNED_TOOLS/);
  });
});

describe('② 黑名单 —— 派生类 / 定义类工具不可转授', () => {
  it('★★★ 禁止递归自增殖：子智能体不能再派生/列举子智能体', () => {
    const i = at(SPEC, 'export const SPEC_TOOL_BLACKLIST', '黑名单定义');
    const body = SPEC.slice(i, i + 1200);
    for (const n of ['call_agent', 'spawn_subagent', 'list_sub_agents']) {
      expect(body, `★ 黑名单缺 ${n} → 子智能体可无限套娃`).toContain(`'${n}'`);
    }
  });

  it('★★★ 禁止自我提权：不能改智能体定义/挂载/会话身份', () => {
    const i = at(SPEC, 'export const SPEC_TOOL_BLACKLIST', '黑名单定义');
    const body = SPEC.slice(i, i + 1200);
    for (const n of ['api_agent_create', 'api_agent_update', 'api_agent_mount', 'api_conversation_setup']) {
      expect(body, `★ 黑名单缺 ${n} → 子智能体可给自己提权`).toContain(`'${n}'`);
    }
  });

  it('★★ 黑名单必须在裁剪时生效（不只是声明）', () => {
    const body = win(SPEC, 'export function resolveSpecTools', 2600, 'resolveSpecTools');
    expect(body, '★ 裁剪循环未检查黑名单').toMatch(/SPEC_TOOL_BLACKLIST\.has\(name\)/);
  });

  it('★★ 执行侧也必须拦（双保险：深度 >= 1 直接拒绝，不依赖工具清单）', () => {
    expect(LTM, '★ call_agent 的深度闸被删').toMatch(/depth >= 1\) return '子智能体不能再调用子智能体/);
    expect(LTM, '★ spawn_subagent 未做深度闸（只在裁剪侧拦不够）')
      .toMatch(/depth >= 1\) return '子智能体不能再生成子智能体/);
  });
});

describe('③ 预算闸 —— 防"打不过就再叫一个"', () => {
  it('★★ 必须有单任务上限', () => {
    expect(SPEC, '★ 无 DEFAULT_MAX_SPAWN_PER_TASK').toMatch(/DEFAULT_MAX_SPAWN_PER_TASK/);
    expect(SPEC, '★ 无 checkSpawnBudget').toMatch(/export function checkSpawnBudget/);
  });

  it('★★ 上限必须真的拦住，并给出可行动建议', () => {
    const body = win(SPEC, 'export function checkSpawnBudget', 900, 'checkSpawnBudget');
    expect(body, '★ 未在上限处返回拒绝').toMatch(/allowed: false/);
    expect(body, '★ 未给出替代方案（模型只会反复重试）').toMatch(/call_agent|自行完成|自己完成/);
  });

  it('★★ 计数必须在任务上（不能是模块级全局，否则跨任务串味）', () => {
    expect(LTM, '★ task 未声明 spawnCount').toMatch(/spawnCount\?: number/);
    expect(LTM, '★ 未在生成后自增').toMatch(/task\.spawnCount = used \+ 1/);
  });

  it('★ 预算可被智能体配置覆盖（0 = 关闭该能力）', () => {
    expect(LTM, '★ 未从 config_json 读 maxSpawnPerTask').toMatch(/maxSpawnPerTask/);
  });
});

describe('④ 权限分级必须穿透到子智能体', () => {
  it('★★ spawn_subagent 本身属委派类：只读会话必须拒绝', () => {
    const body = win(PERM, 'DELEGATION_TOOLS', 200, 'DELEGATION_TOOLS');
    expect(body, '★ 只读会话能生成子智能体 → 绕过权限分级的后门')
      .toMatch(/'call_agent',\s*'spawn_subagent'/);
  });

  it('★★ 父级工具全集必须按会话权限过滤（只读会话里写类工具不进全集）', () => {
    const body = win(LTM, 'function collectParentToolIds', 2000, 'collectParentToolIds');
    expect(body, '★ 未按 permissionMode 过滤父级工具').toMatch(/checkToolPermission\(mode, n\)/);
  });

  it('★ UI 交互工具不得转授（子智能体没人可答，ask_user 会直接挂住）', () => {
    const body = win(LTM, 'function collectParentToolIds', 2000, 'collectParentToolIds');
    expect(body, '★ 未排除 INTERACTIVE_TOOLS').toMatch(/INTERACTIVE_TOOLS/);
  });
});

describe('⑤ 四元组语义（I/C/T/M 各就各位）', () => {
  it('★★ I 必填且要够具体（子智能体看不到主对话，指令必须自包含）', () => {
    const body = win(SPEC, 'export function normalizeSubAgentSpec', 1600, 'normalizeSubAgentSpec');
    expect(body, '★ 未校验 instruction 必填').toMatch(/instruction 为必填项/);
    expect(body, '★ 未校验 instruction 过简').toMatch(/instruction 过于简略/);
  });

  it('★★ M 必须可指定（简单活用轻量模型省钱 —— 论文的成本可控编排）', () => {
    expect(SPEC, '★ spec 无 modelId').toMatch(/modelId\?: string/);
    expect(TOOL, '★ schema 未暴露 modelId 给模型').toMatch(/modelId: \{ type: 'string'/);
  });

  it('★★ 提示词必须渲染 I+C+交付约定，且明说"看不到主对话"', () => {
    const body = win(SPEC, 'export function renderSpecSystemPrompt', 2200, 'renderSpecSystemPrompt');
    expect(body, '★ 未告知看不到主对话历史').toMatch(/看不到主对话/);
    expect(body, '★ 未渲染 context（C 要素丢失）').toMatch(/## 上下文/);
    expect(body, '★ 未要求结论可独立理解').toMatch(/可独立理解/);
  });

  it('★ maxSteps 必须夹紧区间（模型可能传 9999 或 1）', () => {
    expect(SPEC, '★ 未夹紧 maxSteps').toMatch(/MAX_SPEC_MAX_STEPS, Math\.max\(MIN_SPEC_MAX_STEPS/);
  });
});

describe('⑥ 工具链三段（注册 → 挂载 → 模型可见）', () => {
  it('★★ 第一段：必须注册进内置工具表', () => {
    expect(IDX, '★ 未 import SpawnSubAgentTool').toMatch(/import \{ SpawnSubAgentTool \}/);
    expect(IDX, '★ 未 register（模型看不到）').toMatch(/registry\.register\(new SpawnSubAgentTool\(\)\)/);
  });

  it('★★ 第二段：必须挂到默认助手与任务模式智能体', () => {
    // ★ 用**原文**统计（不用剥注释后的 DB）：db.ts 的提示词模板串里含 `target/*.jar`
    //   （星号紧跟斜杠的注释形态），会提前闭合 strip 的块注释正则 → 吞掉一段代码 → 统计偏少。
    //   挂载点统计与注释无关，读原文最可靠。
    const rawDb = read('apps/server/src/db.ts');
    const cnt = (rawDb.match(/'spawn_subagent'/g) || []).length;
    expect(cnt, `★ db.ts 挂载点过少（${cnt} 处）—— 只挂注册不挂清单 = 模型永远看不到`).toBeGreaterThanOrEqual(3);
    expect(LTM, '★ 未在提示词里写使用引导（挂了也不会被用）').toMatch(/现场生成子智能体（spawn_subagent）/);
  });

  it('★★★ 第三段：必须能从 executeTool 真正执行（不能只挂不给实现）', () => {
    expect(LTM, '★ executeTool 无 spawn_subagent 分支 → 模型调用后拿到占位串').toMatch(/toolName === 'spawn_subagent'/);
    expect(LTM, '★ 无后端实现函数').toMatch(/async function runSpawnedSubAgent/);
  });

  it('★★ 必须复用同一条子智能体循环（不另起执行器 —— 本项目已因入口漂移出过 5 次事故）', () => {
    const body = win(LTM, 'async function runSpawnedSubAgent', 6000, 'runSpawnedSubAgent');
    expect(body, '★ 未复用 runSubAgent（另写一套会与消息归属/深度限制漂移）').toMatch(/await runSubAgent\(/);
    expect(LTM, '★ runSubAgent 未接受 specOverride').toMatch(/specOverride\?: \{/);
  });

  it('★★ 临时子智能体不得写进 agent 表（它是"用完即弃"，不该污染用户角色列表）', () => {
    const body = win(LTM, 'async function runSpawnedSubAgent', 6000, 'runSpawnedSubAgent');
    expect(body, '★ 用 INSERT INTO agent 建了持久角色（会堆垃圾角色）').not.toMatch(/INSERT INTO agent/);
    expect(body, '★ 未用合成配置（specRow/虚拟行）').toMatch(/specRow|specOverride/);
  });

  it('★ 必须在空间记忆留痕（用户要能看到"它为什么开了个子智能体"）', () => {
    expect(LTM, '★ 无留痕').toMatch(/recordSpawnedSubAgent/);
    expect(LTM, '★ 未写清用途与开放工具').toMatch(/开放工具/);
  });
});

describe('⑦ schema 与模型引导质量', () => {
  it('★★ description 必须讲清与 call_agent 的分工（否则模型会乱用）', () => {
    expect(TOOL, '★ 未说明两者区别').toMatch(/call_agent/);
    expect(TOOL, '★ 未说明先后顺序（能用现成的就不必现场造）').toMatch(/能用 call_agent 解决就不必 spawn/);
  });

  it('★★ 提示词必须同时写"该用"和"不该用"（只写该用会滥用，每件小事都开子智能体）', () => {
    const body = win(LTM, '## 缺少合适执行者时：现场生成子智能体', 4000, '使用引导段');
    expect(body, '★ 缺"适合用的场景"').toMatch(/适合用的场景/);
    expect(body, '★ 缺"不要用的场景"（会滥用）').toMatch(/不要用的场景/);
  });

  it('★ 提示词要让模型知道"要的工具只能是已挂载的子集"（避免反复试错）', () => {
    const body = win(LTM, '## 缺少合适执行者时：现场生成子智能体', 4000, '使用引导段');
    expect(body, '★ 未说明工具边界').toMatch(/只能是\*\*你已挂载工具的子集\*\*|已挂载工具的子集/);
  });
});