/**
 * 记忆「蒸馏 + 删除」治理闭环（M5，2026-10-09）守门测试。
 *
 * 背景：对齐 WorkBuddy 的关键设计**不是限额数字**，而是"蒸馏 + 删除"闭环 ——
 *   超期明细 → LLM 蒸馏成要点写进 MEMORY.md → **删原条目**。
 *   yan-zhi 此前只有"截断"：超出上限的内容要么被静默丢掉、要么堆在文件里永不清理。
 *
 * 本测试钉：
 *   ① 蒸馏必须存在且被收尾路径调用（否则是死代码）；
 *   ② **未被注入 LLM 时必须直接跳过**（保持本模块纯文件、不静默花 LLM 调用）；
 *   ③ 时间戳解析与阈值判定（超期才蒸馏）；
 *   ④ **模型放弃（空返回）时不得删原条目**（删了不可恢复）；
 *   ⑤ 取不到时间戳的条目**不删**（宁可留着）；
 *   ⑥ 蒸馏稿必须走滚动淘汰（否则蒸馏稿本身会堆积）。
 *
 * ★ 环境说明：本机 `better-sqlite3` ABI 不匹配，故不做真实文件系统集成测试
 *   （那需要 db 连接）。改用「源码结构断言 + 纯函数行为断言」双轨 —— 与仓内既有风格一致。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SM = strip(read('apps/server/src/services/space-memory.ts'));
const LTM = strip(read('apps/server/src/llm-task-manager.ts'));

function bodyOf(s: string, needle: string, what: string): string {
  const i = s.indexOf(needle);
  expect(i, `锚点不存在：${what} → ${needle}`).toBeGreaterThan(-1);
  const rest = s.slice(i);
  const end = rest.indexOf('\n}');
  return end > 0 ? rest.slice(0, end) : rest.slice(0, 3000);
}

describe('① 蒸馏能力必须存在且被收尾路径调用', () => {
  it('★★ 导出 distillStaleProgress', () => {
    expect(SM, '★ 缺 distillStaleProgress —— 记忆只有截断、没有蒸馏闭环')
      .toMatch(/export async function distillStaleProgress/);
  });

  it('★★ 收尾路径（recordTaskProgress）必须真的调用它（否则是死代码）', () => {
    expect(LTM, '★ 蒸馏实现了却没人调用（静默失效）').toMatch(/maybeDistillStaleMemory\(task\)/);
    // 且必须在 recordTaskProgress 内（收尾时机），不能挂在别处
    const body = bodyOf(LTM, 'async function recordTaskProgress', 'recordTaskProgress');
    expect(body, '★ 蒸馏未接在收尾路径上').toMatch(/maybeDistillStaleMemory/);
  });

  it('★★ 门控齐全：无空间 / 无模型 / 无超期条目 都跳过', () => {
    const body = bodyOf(LTM, 'async function maybeDistillStaleMemory', '蒸馏触发');
    expect(body, '★ 未判空间（未挂空间时会去找不存在的记忆文件）').toMatch(/resolveConversationSpaceId/);
    expect(body, '★ 未判模型可用性（可能拿 null 建 client）').toMatch(/resolveMemoryExtractLlm/);
  });
});

describe('② 阈值与安全性（蒸馏不能丢信息）', () => {
  it('★★ 未注入 LLM 必须直接返回 false（不静默花调用）', () => {
    const body = bodyOf(SM, 'export async function distillStaleProgress', '蒸馏实现');
    expect(body, '★ 无 LLM 时未提前返回 → 可能空跑或抛错').toMatch(/if \(!distill\) return false/);
  });

  it('★★ 模型放弃（空返回）时**不得**删原条目', () => {
    const body = bodyOf(SM, 'export async function distillStaleProgress', '蒸馏实现');
    expect(body, '★ 模型返回空仍继续删条目 → 信息不可恢复地丢失').toMatch(/if \(!digest\) return false/);
  });

  it('★★ 取不到时间戳的条目必须跳过（宁可留着也不误删）', () => {
    const body = bodyOf(SM, 'function progressLineTime', '时间戳解析');
    expect(body, '★ 解析不出时间戳时未返回 null').toMatch(/return null/);
    const impl = bodyOf(SM, 'export async function distillStaleProgress', '蒸馏实现');
    expect(impl, '★ 未判 t !== null（会把无时间戳的条目一并当超期删掉）').toMatch(/t !== null/);
  });

  it('★★ 阈值常量必须存在（30 天 + 最少条目数）', () => {
    expect(SM, '★ 缺蒸馏年龄阈值').toMatch(/PROGRESS_DISTILL_AFTER_DAYS\s*=\s*\d+/);
    expect(SM, '★ 缺蒸馏最少条目数（1 条也花一次 LLM 调用不值）')
      .toMatch(/PROGRESS_DISTILL_MIN_ENTRIES\s*=\s*\d+/);
  });

  it('★★ 蒸馏稿写回 MEMORY.md 必须走滚动淘汰（防蒸馏稿本身堆积）', () => {
    const body = bodyOf(SM, 'export async function distillStaleProgress', '蒸馏实现');
    // 蒸馏写回那一处必须带 keepPerMark
    const seg = body.slice(body.indexOf('spaceMemoryHeader'), body.indexOf('// ②'));
    expect(seg, '★ 蒸馏稿未走滚动淘汰 → 长期会产生"蒸馏稿堆积"').toMatch(/PROGRESS_ENTRY_MARK/);
  });

  it('★★ 必须是 fail-safe（收尾路径不能因蒸馏失败而报错）', () => {
    const body = bodyOf(SM, 'export async function distillStaleProgress', '蒸馏实现');
    expect(body, '★ 无 try/catch → 蒸馏异常会冒泡到收尾路径').toMatch(/catch/);
    expect(body, '★ 失败未返回 false（调用方无法判断）').toMatch(/return false/);
  });
});

describe('③ 蒸馏的 LLM 调用须与既有范式一致', () => {
  it('★★ 必须用 LlmClient(platform, model)（与 maybeReplanOnContinue 同范式）', () => {
    const body = bodyOf(LTM, 'async function maybeDistillStaleMemory', '蒸馏触发');
    expect(body, '★ 未用统一客户端范式').toMatch(/new LlmClient\(llm\.platform, llm\.model\)/);
  });

  it('★★ 蒸馏提示词必须要求"原样保留路径/命令"（一改就不可恢复）', () => {
    const body = bodyOf(LTM, 'async function maybeDistillStaleMemory', '蒸馏触发');
    expect(body, '★ 未要求保留路径/命令等不透明标识符 → 蒸馏会毁掉可操作性').toMatch(/原样保留/);
    expect(body, '★ 未要求合并去重（那就不是蒸馏而是搬家）').toMatch(/合并/);
  });
});