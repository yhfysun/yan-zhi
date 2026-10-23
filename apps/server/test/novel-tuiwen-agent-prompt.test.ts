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
  it('★ 发布/封面/评论都强制走站点配方（2026-10-23：手工逐页点实测 15/7.5/14 分钟）', () => {
    expect(p).toContain('douyin-publish-video');
    expect(p).toContain('douyin-set-cover');
    expect(p).toContain('douyin-post-comment');
    expect(p).toContain('绝不重跑 ①');
  });
  it('★ 评论区配方以实抓锚点为准（旧锚点已失效，不得再出现）', () => {
    expect(p).toContain('Draft.js');
    expect(p).toContain('input-d24X73');
    // 2026-10-15 实抓：旧锚点（10-14 版）已失效 —— 留在提示词里会让模型先撞墙再重试
    expect(p).not.toContain('comment-input-inner-container');
    expect(p).not.toContain('wchsYBpK');
    expect(p).not.toContain('public-DraftEditor-content');
  });
  it('★ 评论只发不置顶（Web 端无置顶入口，2026-10-14 穷尽验证）', () => {
    // 2026-10-14 实跑结论：评论可用创作者后台互动评论页发出，但置顶 Web 端无入口
    // → prompt 里只留「别再找入口」的事实，防止后续又被加回「去置顶」这步。
    expect(p).toContain('置顶 Web 端做不到');
    expect(p).not.toContain('菜单里选「置顶」');
  });
  it('反引号未被双重转义、无裸反引号残留', () => {
    expect(p).not.toContain('\\`');
  });
  it('原有内容未被破坏（书名红线/合集/回填仍在）', () => {
    expect(p).toContain('书名一律用别名');
    expect(p).toContain('添加到合集');
    expect(p).toContain('回填发文');
  });
  it('★ 系列任务首集发布前必先建合集（2026-10-23）', () => {
    expect(p).toContain('第一集发布前就要建好合集并勾选');
    expect(p).toContain('禁止先发完再靠「合集管理」补归集');
  });
});
