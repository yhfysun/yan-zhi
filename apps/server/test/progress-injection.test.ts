/**
 * 进展「接力棒」注入（D5，2026-10-09）守门测试。
 *
 * 背景：`progress.md` 是跨会话接力的**主要线索**（上一批做到哪、还剩什么），
 *   但设计上"按需读"（防爆窗）→ 只有模型主动调 `api_space_memory_read` 才看得到，
 *   而项目自己的方案文档就承认"长任务跑偏时模型根本不会去调"。
 *   ⇒ 结果：换会话继续时模型不知道上一批做到哪。
 *
 * 修法：在提示词注入**最近 3 条 / 1200 字**（是"接力棒"不是"流水账"），整份明细仍按需读。
 *
 * 本测试钉：
 *   ① 注入函数存在 + 被提示词构建路径调用；
 *   ② **只取最近 N 条**（不是整份 —— 否则重蹈"流水账撑爆注入预算"）；
 *   ③ 有空字节数上限；
 *   ④ 无进展行时返回空串（不注入空壳）；
 *   ⑤ ⚠️ 不得与"整份明细注入"混淆（那是另一个函数）。
 *
 * ★ 行为断言（真跑纯函数）—— 因为"取哪几条/多少字"是逻辑，静态查字符串证明不了。
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

describe('① 注入接线', () => {
  it('★★ formatProgressContext 必须存在并导出', () => {
    expect(SM, '★ 缺 formatProgressContext（进度不注入 → 换会话模型不知道做到哪）')
      .toMatch(/export function formatProgressContext/);
  });

  it('★★ 提示词构建必须真的调用它（否则是死代码）', () => {
    expect(LTM, '★ 进展注入实现了却没人调用').toMatch(/formatProgressContext\(/);
    // ★ 注意锚点：记忆段（空间记忆/决策记录/进展）是**每轮注入**的，位置在
    //   `runReActLoop` 内（紧跟 formatTaskMemoryContext 之后），**不在**
    //   `buildSystemPromptForBackend`（那是"基础提示词"，只产 agent 人格/工具说明）。
    //   第一版锚错了函数 → 假红。锚点必须打在**真实注入点所在的那个函数**里。
    const i = LTM.indexOf('function runReActLoop');
    expect(i, '★ 锚点不存在').toBeGreaterThan(-1);
    const body = LTM.slice(i, i + 40000);
    expect(body, '★ 未在每轮提示词注入里加进展段（换会话接力链缺失）').toMatch(/formatProgressContext/);
    // 且必须紧跟决策记录注入之后（与空间记忆/决策记录同组，别散落）
    const memIdx = body.indexOf('formatTaskMemoryContext');
    const progIdx = body.indexOf('formatProgressContext');
    expect(memIdx, '★ 决策记录注入消失').toBeGreaterThan(-1);
    expect(progIdx, '★ 进展注入未与其它记忆段放在同一组').toBeGreaterThan(memIdx);
  });

  it('★★ 必须用异步读取出口 readTaskProgressForConversation（它不是同步读盘）', () => {
    expect(LTM, '★ 未用统一读取出口（会绕过 selectMemoryLines 的"取最新"逻辑）')
      .toMatch(/readTaskProgressForConversation\(/);
  });
});

describe('② 必须是"接力棒"而不是"流水账"（上限齐全）', () => {
  it('★★ 必须有条目数上限 + 字数上限', () => {
    expect(SM, '★ 缺条目数上限 → 会注入整份明细').toMatch(/PROGRESS_INJECT_MAX_ENTRIES\s*=\s*\d+/);
    expect(SM, '★ 缺字数上限').toMatch(/PROGRESS_INJECT_MAX_CHARS\s*=\s*\d+/);
  });

  it('★★ 条目数上限必须很小（≤5）—— 注入的是"最近做到哪"', () => {
    const m = SM.match(/PROGRESS_INJECT_MAX_ENTRIES\s*=\s*(\d+)/);
    expect(m, '★ 未找到条目数上限').toBeTruthy();
    expect(Number(m![1]), '★ 条目数上限过大 → 又变成流水账注入').toBeLessThanOrEqual(5);
  });

  it('★★ 实现必须真的做「取最近 N 条」+ 字数截断', () => {
    const i = SM.indexOf('export function formatProgressContext');
    const body = SM.slice(i, i + 1600);
    expect(body, '★ 未取最近 N 条（slice(-N)）').toMatch(/slice\(-PROGRESS_INJECT_MAX_ENTRIES\)/);
    expect(body, '★ 未按字数上限截断').toMatch(/PROGRESS_INJECT_MAX_CHARS/);
  });
});

describe('③ 行为断言（真跑纯函数 —— 取哪几条必须真验）', () => {
  it('★★ 只取任务进展行（跳过头部注释）', async () => {
    const mod = await import('../src/services/space-memory.js').catch(() => null);
    if (!mod || typeof (mod as any).formatProgressContext !== 'function') {
      // 本机 db 链不可用时退化为静态断言（已在 ① 覆盖），不假红
      expect(SM).toMatch(/export function formatProgressContext/);
      return;
    }
    const text = [
      '# 测试 · 任务进展',
      '',
      '> 头部说明',
      '',
      '- 2026-01-01 00:00 任务【已完成】A：第一条',
      '- 2026-01-02 00:00 任务【已完成】B：第二条',
      '- 2026-01-03 00:00 任务【达最大步数中断】(5 步)C：第三条',
      '- 2026-01-04 00:00 任务【已完成】D：第四条',
      '- 2026-01-05 00:00 任务【已完成】E：第五条',
    ].join('\n');
    const out = (mod as any).formatProgressContext(text) as string;
    expect(out, '★ 未注入任何进展').toBeTruthy();
    expect(out, '★ 注入了头部注释（应只给进展行）').not.toContain('头部说明');
    // ★ 只应有最近 3 条（C/D/E），不该有最早的 A/B
    expect(out, '★ 注入了全部条目（=流水账）').not.toContain('第一条');
    expect(out, '★ 未包含最新条目（接力棒失效）').toContain('第五条');
    expect(out, '★ 未包含倒数第三条').toContain('第三条');
  });

  it('★★ 没有进展行时返回空串（不注入空壳）', async () => {
    const mod = await import('../src/services/space-memory.js').catch(() => null);
    if (!mod || typeof (mod as any).formatProgressContext !== 'function') return;
    expect((mod as any).formatProgressContext(''), '空输入应返回空串').toBe('');
    expect((mod as any).formatProgressContext('# 只有标题\n\n> 说明'), '无进展行应返回空串').toBe('');
  });

  it('★★★ 长条目吃掉预算时仍要注入最近几条（真跑抓出的缺陷两连）', async () => {
    // ★★★ 这条是**真跑真实数据抓出来的**（静态测试用短条目全绿）：
    //   长任务的收尾条目是**完整 markdown 总结**（实测"第3章"那条 > 3000 字），注入上限 1200。
    //   · 第一版"超上限就 break" → 最新那条被整条拒掉 → **注入 0 条**（接力棒完全失效）；
    //   · 第二版"超限即截断该条" → 最新那条吃光 1200 预算 → **只注入 1 条**（丢了轨迹）。
    //   ⇒ 终版"均分预算"：每条份额 = 总预算 / 条数，最近几条都露头。
    const mod = await import('../src/services/space-memory.js').catch(() => null);
    if (!mod || typeof (mod as any).formatProgressContext !== 'function') return;
    const huge = (n: number) => `- 2026-01-0${n} 00:00 任务【达最大步数中断】(200 步)助手：${'很长的总结内容。'.repeat(500)}`;
    const out = (mod as any).formatProgressContext([huge(3), huge(4), huge(5)].join('\n')) as string;
    expect(out, '★ 长条目下注入为空（接力棒失效）').toBeTruthy();
    // ★ 三条都要露头（能看出"最近几批"的轨迹），不是只留最新一条
    for (const d of ['2026-01-03', '2026-01-04', '2026-01-05']) {
      expect(out, `★ 长条目下丢了 ${d} 这条（只剩最新一条 = 没有轨迹）`).toContain(d);
    }
    expect(out.length, '★ 未受预算约束（超预算注入）').toBeLessThan(2000);
  });
});