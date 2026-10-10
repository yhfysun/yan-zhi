/**
 * 推文智能体 system prompt 守门测试。
 *
 * ★ 与 packages/core 的 novel-tuiwen-skill-seed.test.ts 是**一对**：
 *   同一批配方要同时存在于「skill 正文」与「智能体 prompt」两处（双通道下发），
 *   只有一处更新 = 另一半链路仍会盲试。本测试钉住 prompt 侧。
 *
 * ★ 另有一条通用陷阱：TS 模板串里写 Markdown 反引号必须转义成 \` ——
 *   本轮在 schema.ts 与本文件各踩一次，且**只有真编译才暴露**
 *   （tsc 报 TS1005/TS1003；数反引号配对"看起来正常"但语法已错）。
 *   故这里加一条「不得残留 \` 双重转义」的断言。
 *
 * 运行：npx vitest run test/novel-tuiwen-agent-prompt.test.ts
 */

import { describe, it, expect } from 'vitest';
import { NOVEL_TUIWEN_AGENT_SYSTEM_PROMPT } from '../src/builtin-task-mode-agents.js';

describe('推文智能体 prompt（本轮同步的配方）', () => {
  const p = NOVEL_TUIWEN_AGENT_SYSTEM_PROMPT;
  it('★ 抓正文配方在', () => {
    expect(p).toContain('#content.chapter p');
    expect(p).toContain('catalogue__item-text');
    expect(p).toContain('54 秒');
  });
  it('★ 评论区配方在（Draft.js 关键点）', () => {
    expect(p).toContain('Draft.js');
    expect(p).toContain('public-DraftEditor-content');
    expect(p).toContain('comment/list');
    expect(p).toContain('wchsYBpK');
  });
  it('反引号未被双重转义、无裸反引号残留', () => {
    expect(p).not.toContain('\\`');
  });
  it('原有内容未被破坏（书名红线/合集/回填仍在）', () => {
    expect(p).toContain('书名一律用别名');
    expect(p).toContain('添加到合集');
    expect(p).toContain('回填发文');
  });
});
