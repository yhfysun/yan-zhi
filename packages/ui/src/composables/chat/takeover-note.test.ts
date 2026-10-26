// 接管留痕（2026-10-24 接入 AgentScope 客户端 takeover recorder）的守门测试。
//
// 语义：暂停 = 用户接管页面，此期间的**用户真实改动**要在恢复时告知 agent，
// 否则下一轮它会把用户手填的值再覆盖一遍。测试分两层：
//   ① 文案格式化（纯函数，断言用户/模型实际看到的那句话）；
//   ② 链路锚点（页面记录用 isTrusted 过滤、恢复先注入再 resume、收尾不上报）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatTakeoverNote } from './takeover-note';

const REPO = resolve(__dirname, '../../../../..');
const PANEL = readFileSync(resolve(REPO, 'packages/ui/src/components/BrowserPanel.vue'), 'utf8');
const STORE = readFileSync(resolve(REPO, 'packages/ui/src/stores/chat.ts'), 'utf8');
const MAIN = readFileSync(resolve(REPO, 'apps/desktop/main.cjs'), 'utf8');

describe('formatTakeoverNote', () => {
  it('用户什么都没做 → 不注入（返回 undefined）', () => {
    expect(formatTakeoverNote({ interacted: false, fields: [], omitted: 0 })).toBeUndefined();
  });

  it('列出改动字段，并明确「以现值为准、别覆盖」', () => {
    const note = formatTakeoverNote({ interacted: true, fields: ['标题', '简介'], omitted: 0 })!;
    expect(note).toContain('【用户接管】');
    expect(note).toContain('「标题」');
    expect(note).toContain('「简介」');
    expect(note).toContain('以用户输入为准');
    expect(note).toContain('不要覆盖');
    expect(note).not.toContain('另有');
  });

  it('超出上限的字段给出条数，不留悬念', () => {
    const note = formatTakeoverNote({ interacted: true, fields: ['A'], omitted: 3 })!;
    expect(note).toContain('另有 3 项未列出');
  });

  it('只有交互、定位不到字段时也要说清楚（让模型先重新读页面）', () => {
    const note = formatTakeoverNote({ interacted: true, fields: [], omitted: 0 })!;
    expect(note).toContain('未能定位到具体字段');
    expect(note).toContain('重新读取页面');
  });
});

describe('接管留痕 · 链路锚点', () => {
  it('页面内只认 isTrusted 原生事件（agent 的合成写入不算用户操作）', () => {
    expect(MAIN, '缺少 takeover action').toContain("case 'takeover'");
    expect(MAIN).toContain('ev.isTrusted');
    expect(MAIN).toContain('__yzTakeover');
    expect(MAIN, '快照上限 12 项').toContain('fields.slice(0, 12)');
  });

  it('暂停即开始记录；恢复先注入用户改动再放行下一轮', () => {
    expect(PANEL).toContain('beginTakeoverRecording()');
    const at = PANEL.indexOf('function onResumeTask()');
    expect(at).toBeGreaterThanOrEqual(0);
    const body = PANEL.slice(at, at + 400);
    const injectAt = body.indexOf('await endTakeoverRecording(true)');
    const resumeAt = body.indexOf('chatStore.resumeTask()');
    expect(injectAt, '恢复路径必须先收快照').toBeGreaterThanOrEqual(0);
    expect(resumeAt, '缺少 resume').toBeGreaterThanOrEqual(0);
    expect(injectAt).toBeLessThan(resumeAt);
  });

  it('任务收尾清 paused 时只清监听、不上报（那不是"恢复执行"）', () => {
    expect(PANEL).toContain('endTakeoverRecording(false)');
    expect(STORE, '缺少注入通道').toContain('async function injectTaskNote');
    expect(STORE).toContain("requestChatWs<any>('inject'");
  });
});
