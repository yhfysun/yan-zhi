/**
 * 内置 agent `max_tokens` 旧默认 2048 → 65536 兜底修复（守门测试，2026-10-10 实据）。
 *
 * ── 现场（用户实测 2026-10-10 20:29，会话 f0a901e3）────────────────────────
 *   点「继续」后 assistant 落库 `content=''`、`finish_reason='length'`、状态却 `completed`，
 *   用户只看到「（助手未返回有效内容，可能是上游中断或工具调用失败导致…）」。
 *
 * ── 根因链（逐环有实据）───────────────────────────────────────────────────
 *   ① 该库 `agent` 表定义是 `max_tokens INTEGER DEFAULT 2048`（`sqlite_master` 实测确认）；
 *      源码里已改成 65536，但 **`CREATE TABLE IF NOT EXISTS` 不会修改已存在的表** → 表定义至今是 2048；
 *   ② 一次性迁移 `agent_max_tokens_64k_v1` 用 app_config 标记**只跑一次**（本机已跑，值=16），
 *      只改了当时存在的 16 行；
 *   ③ **迁移之后新建的内置 agent**（INSERT 语句不写 max_tokens → 拿表默认）又回到 2048；
 *      本机实测 13 个中招：9 个 `a_builtin_*` + 4 个 `a_wf_*_pipeline`（后者的 is_builtin 被标成 0）；
 *   ④ `deepseek-flash` 是**推理模型**（直连上游实测：只问"说你好"就吐 1311 字 reasoning ≈ 400+ token）；
 *      `max_tokens=2048` 被 reasoning 占满 → `content` 恒空 + `finish_reason='length'`。
 *      ★ 直连 A/B 实测（本测试的依据）：max_tokens=200 → content 空 / length；=2048 → content 正常 / stop。
 *
 * ── 修复 ──────────────────────────────────────────────────────────────────
 *   迁移从「一次性」改「幂等每次校验」，且判定覆盖 `is_builtin=1 OR id LIKE 'a_builtin_%' OR 'a_wf_%'`。
 *
 * 本测试钉：
 *   ① 源码层：迁移**幂等**（不再用 app_config 标记短路）；
 *   ② 源码层：判定覆盖三类内置 id（尤其 is_builtin=0 的 a_wf_*）；
 *   ③ 源码层：条件里含 `max_tokens = 2048` —— 只修旧默认值，不碰用户手调过的其它值；
 *   ④ 表定义与迁移目标值必须一致（防"表默认 2048 / 迁移 65536"这种再次撕裂）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INDEX_SRC = readFileSync(resolve(__dirname, '..', 'src', 'index.ts'), 'utf8');
const DB_SRC = readFileSync(resolve(__dirname, '..', 'src', 'db.ts'), 'utf8');

/** 截取「max_tokens 兜底修复」那段代码，避免断言被文件其它部分误导。
 *  ★ 只取**可执行代码**（剥掉 `//` 注释行）—— 注释里会提到旧实现的名字，扫注释会误报。 */
function migrationBlock(): string {
  const start = INDEX_SRC.indexOf('max_tokens 旧默认 2048');
  expect(start, '★ 找不到 max_tokens 迁移代码块（被删或改写了？）').toBeGreaterThan(-1);
  return INDEX_SRC.slice(start, start + 1600)
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

describe('内置 agent max_tokens 兜底修复（2026-10-10 实据）', () => {
  it('★★ 迁移必须幂等 —— 不得再用 app_config 标记短路（旧实现只跑一次，漏掉后建 agent）', () => {
    const block = migrationBlock();
    expect(
      block,
      '★ 迁移又变回"一次性"了：新库/后建 agent 会再次停在 2048，重新引发"输出预算被思考吃光"',
    ).not.toMatch(/agent_max_tokens_64k_v1/);
    expect(block, '★ 迁移块里不应再有"是否已跑过"的短路判断').not.toMatch(/SELECT value FROM app_config/);
  });

  it('★★ 判定必须覆盖三类内置 agent（含 is_builtin=0 的 a_wf_*，实测正是漏网者）', () => {
    const block = migrationBlock();
    expect(block, '★ 未覆盖 is_builtin=1').toMatch(/is_builtin\s*=\s*1/);
    expect(block, '★ 未覆盖 a_builtin_ 前缀').toMatch(/id LIKE 'a_builtin_%'/);
    expect(block, "★ 未覆盖 a_wf_ 前缀 —— 4 个流水线 agent 的 is_builtin=0，只判 is_builtin 会漏掉它们")
      .toMatch(/id LIKE 'a_wf_%'/);
  });

  it('★ 只修"恰好等于旧默认"的行 —— 用户手调过的其它值不得被覆盖', () => {
    const block = migrationBlock();
    // ★ 2026-10-10 二次收敛：旧值/目标值都取自 constants.ts 常量（此前散落 7 处硬编码是撕裂根源），
    //   故这里断言"引用了那两个常量"，而不是断言字面量数字。
    expect(block, '★ 未引用 LEGACY_AGENT_MAX_TOKENS —— 旧默认值被硬编码会再次撕裂').toMatch(/LEGACY_AGENT_MAX_TOKENS/);
    expect(block, '★ 未引用 DEFAULT_AGENT_PARAMS.maxTokens —— 目标值被硬编码会再次撕裂')
      .toMatch(/DEFAULT_AGENT_PARAMS\.maxTokens/);
    expect(block, '★ WHERE 子句未参数化（缺少 max_tokens = ? 的旧值过滤）')
      .toMatch(/max_tokens\s*=\s*\?/);
  });

  it('★ 表定义必须引用同一常量（防"表默认 2048 / 源码 65536"再次撕裂）', () => {
    // ★ 2026-10-10 二次收敛：表定义里的默认值改为模板串插值 `${DEFAULT_AGENT_PARAMS.maxTokens}`，
    //   与 routes/迁移/前端共用**同一份**定义（shared/utils/agent-defaults.ts）。
    //   断言方式随之从"字面量等于 65536"改为"必须引用常量" —— 硬编码正是撕裂的成因。
    const m = DB_SRC.match(/max_tokens\s+INTEGER\s+DEFAULT\s+([^,\n]+)/);
    expect(m, '★ db.ts 里找不到 agent.max_tokens 的表默认值定义').toBeTruthy();
    expect(
      m![1],
      '★ 表定义默认值又变成硬编码了：必须写成 ${DEFAULT_AGENT_PARAMS.maxTokens}，'
      + '否则再次出现"表默认与源码默认不一致"（本次缺陷成因之一）',
    ).toMatch(/DEFAULT_AGENT_PARAMS\.maxTokens/);
  });

  it('★★ 默认值定义必须是**单一来源** —— 各调用点不得再硬编码 65536/2048', () => {
    const AGENTS_SRC = readFileSync(resolve(__dirname, '..', 'src', 'routes', 'agents.ts'), 'utf8');
    const MKT_SRC = readFileSync(resolve(__dirname, '..', 'src', 'routes', 'marketplace.ts'), 'utf8');
    for (const [name, src] of [['db.ts', DB_SRC], ['routes/agents.ts', AGENTS_SRC], ['routes/marketplace.ts', MKT_SRC]] as const) {
      expect(src, `★ ${name} 仍在硬编码 maxTokens 默认 65536 —— 应引 DEFAULT_AGENT_PARAMS`)
        .not.toMatch(/maxTokens\s*\?\?\s*65536|maxTokens:\s*65536/);
      expect(src, `★ ${name} 仍在硬编码 maxTokens 旧默认 2048`)
        .not.toMatch(/max_tokens\s*=\s*2048/);
    }
  });
});
