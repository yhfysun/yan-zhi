// 页面内对话「按 tab 隔离 + 任务事件归约」的守门测试（P0）。
//
// 为什么要有：三件事是**行为**，写错的表现都是"静默错内容"（本仓最难查的一类）——
//   ① 切 tab 串内容：A 页的回答跑到 B 页的面板里；
//   ② 关 tab 不清：关掉页面后对话还留着（与"对话不会保存，关闭标签页后即清除"的承诺不符）；
//   ③ chunk 并错泡：流式增量并到了上一条已完成的回答里（用户看到"回答被追加进历史消息"）。
// 所以状态机抽成纯模块（stores/page-chat-state.ts），这里真跑行为。

import { describe, it, expect } from 'vitest';
import {
  addErrorNote, addMessage, addUserEcho, applyTaskEvent, createChatState, createPageChatRegistry,
  replaceMessagesFromServer, resetChatState, streamingMessage,
} from './page-chat-state';

describe('★ 按 tab 隔离（切 tab 不串内容）', () => {
  it('两个 tab 各自独立：消息互不可见，注册表按 tabId 取', () => {
    // Arrange
    const reg = createPageChatRegistry();
    const a = reg.get('tab-1');
    const b = reg.get('tab-2');
    // Act
    addUserEcho(a, '这页第一条热搜是什么');
    addUserEcho(b, '帮我把这页表填了');
    // Assert
    expect(a.messages.map((m) => m.content)).toEqual(['这页第一条热搜是什么']);
    expect(b.messages.map((m) => m.content)).toEqual(['帮我把这页表填了']);
    expect(reg.size()).toBe(2);
  });

  it('同一个 tabId 反复取到的是同一份状态（流式增量不会被取新对象丢掉）', () => {
    const reg = createPageChatRegistry();
    const first = reg.get('tab-9');
    addUserEcho(first, 'x');
    expect(reg.get('tab-9').messages.length).toBe(1);
  });

  it('dropTab（关标签页）→ 该 tab 状态整份消失，其它 tab 不受影响', () => {
    const reg = createPageChatRegistry();
    addUserEcho(reg.get('tab-1'), 'a');
    addUserEcho(reg.get('tab-2'), 'b');
    reg.remove('tab-1');
    expect(reg.has('tab-1')).toBe(false);
    expect(reg.get('tab-2').messages.length).toBe(1);
    // 再取回来是**全新**状态（不是残留）
    expect(reg.get('tab-1').messages).toEqual([]);
  });
});

describe('★ 任务事件归约（SSE → 面板状态）', () => {
  it('message:added 按 id 幂等：重复广播不会出现两条气泡', () => {
    const s = createChatState('t');
    const ev = { type: 'message:added', message: { id: 'm1', role: 'assistant', content: '你好' } };
    applyTaskEvent(s, ev);
    applyTaskEvent(s, ev);
    expect(s.messages.length).toBe(1);
  });

  it('chunk 只并进**最后一条流式中的助手消息**，不污染已完成的历史消息', () => {
    const s = createChatState('t');
    applyTaskEvent(s, { type: 'message:added', message: { id: 'm1', role: 'assistant', content: '第一轮' } });
    applyTaskEvent(s, { type: 'task:completed' });          // 第一轮结束：m1 不再是流式
    applyTaskEvent(s, { type: 'message:added', message: { id: 'm2', role: 'assistant', content: '第二' } });
    applyTaskEvent(s, { type: 'chunk', content: '轮' });
    const [m1, m2] = s.messages;
    expect(m1.content).toBe('第一轮');   // 历史消息原样不动
    expect(m2.content).toBe('第二轮');   // 增量落在当前流式消息上
  });

  it('本地提示气泡（error 标记）不会被 chunk 追加内容', () => {
    const s = createChatState('t');
    addErrorNote(s, '⚠️ 网络异常');
    applyTaskEvent(s, { type: 'chunk', content: '不该进来' });
    expect(s.messages[0].content).toBe('⚠️ 网络异常');
  });

  it('terminal 事件（completed/error/aborted）→ 停止流式并返回 false（调用方据此停读 SSE）', () => {
    const s = createChatState('t');
    applyTaskEvent(s, { type: 'message:added', message: { id: 'm1', role: 'assistant', content: 'x' } });
    s.streaming = true;
    s.taskId = 'task-1';
    const keep = applyTaskEvent(s, { type: 'task:completed' });
    expect(keep).toBe(false);
    expect(s.streaming).toBe(false);
    expect(s.messages.every((m) => !m.streaming)).toBe(true);
    expect(s.taskId).toBe('');
  });

  it('task:error → 落一条失败提示（不静默失败）', () => {
    const s = createChatState('t');
    s.streaming = true;
    applyTaskEvent(s, { type: 'task:error', error: '模型不可用' });
    expect(s.messages.at(-1)?.content).toContain('模型不可用');
    expect(s.messages.at(-1)?.error).toBe(true);
  });

  it('未知事件类型既不改状态也不终止（前向兼容新事件）', () => {
    const s = createChatState('t');
    expect(applyTaskEvent(s, { type: 'some:future:event' })).toBe(true);
    expect(s.messages.length).toBe(0);
  });
});

describe('★ 重置语义', () => {
  it('resetChatState 清消息与运行态（用户手动清空 / 关 tab 前置）', () => {
    const s = createChatState('t');
    addUserEcho(s, 'a');
    s.streaming = true;
    s.taskId = 'task-9';
    resetChatState(s);
    expect(s.messages).toEqual([]);
    expect(s.streaming).toBe(false);
    expect(s.taskId).toBe('');
  });

  it('replaceMessagesFromServer 以服务端为准覆盖（自建会话收尾对齐真相）', () => {
    const s = createChatState('t');
    addUserEcho(s, '本地回显');
    replaceMessagesFromServer(s, [
      { id: 's1', role: 'user', content: '真实用户消息', created_at: '2026-10-16T10:00:00.000Z' },
      { id: 's2', role: 'assistant', content: '真实回答', created_at: '2026-10-16T10:00:05.000Z' },
    ]);
    expect(s.messages.map((m) => m.content)).toEqual(['真实用户消息', '真实回答']);
    expect(s.messages[0].streaming).toBeFalsy();
  });

  it('streamingMessage 取到最后一条流式助手消息（UI 滚动锚点用）', () => {
    const s = createChatState('t');
    addUserEcho(s, '问');
    expect(streamingMessage(s)).toBeNull();
    applyTaskEvent(s, { type: 'message:added', message: { id: 'm1', role: 'assistant', content: '答' } });
    expect(streamingMessage(s)?.content).toBe('答');
  });

  it('addMessage 保留顺序（问答交替不乱序）', () => {
    const s = createChatState('t');
    addMessage(s, { id: '1', role: 'user', content: 'q', createdAt: 1 });
    addMessage(s, { id: '2', role: 'assistant', content: 'a', createdAt: 2 });
    expect(s.messages.map((m) => m.id)).toEqual(['1', '2']);
  });

  it('P0.1 漂移检测的基线字段有确定默认值（不让 undefined 参与比较）', () => {
    const s = createChatState('t');
    expect(s.targetUrl).toBe('');
    expect(s.targetTabCount).toBe(0);
  });
});

// ★★★ 2026-11-15 用户实报「提示词都放出来了？不是用户问题？」：
//   服务端落库的用户消息 = buildPageTaskPrompt 的完整拼装，面板两条服务端进路
//   （message:added / replaceMessagesFromServer）都必须折回用户原话，且不与本地回显重复。
describe('★ 服务端用户消息折叠：prompt 只显示用户原话（不把提示词刷进面板）', () => {
  const PROMPT = [
    '【当前页面（用户正在浏览器里看着的页）】',
    '标题：生存33天',
    '地址：https://www.wanyiwan.top/game/sc33t',
    '',
    '【页面可见文本（宿主已抓取，可直接依据它回答，无需再读一次）】',
    'V3 5625 成长值 全屏 音乐关 ……（一大坨）',
    '',
    '【用户的问题】',
    '帮我玩玩这个游戏。。',
    '',
    '【执行面约束（务必遵守）】',
    '1. 上面这一页已经打开……',
  ].join('\n');

  it('message:added 的用户消息折叠为【用户的问题】分节', () => {
    const s = createChatState('t');
    applyTaskEvent(s, { type: 'message:added', message: { id: 'm1', role: 'user', content: PROMPT } });
    expect(s.messages.map((m) => m.content)).toEqual(['帮我玩玩这个游戏。。']);
  });

  it('与本地回显内容相同时不重复渲染（折叠前靠"长度不同"蒙混，折叠后会出双份）', () => {
    const s = createChatState('t');
    addUserEcho(s, '帮我玩玩这个游戏。。');
    applyTaskEvent(s, { type: 'message:added', message: { id: 'srv-1', role: 'user', content: PROMPT } });
    expect(s.messages.filter((m) => m.role === 'user').length).toBe(1);
  });

  it('replaceMessagesFromServer 同样折叠 + 相邻去重', () => {
    const s = createChatState('t');
    replaceMessagesFromServer(s, [
      { id: 'a', role: 'user', content: PROMPT, created_at: '2026-11-15T10:00:00.000Z' },
      { id: 'b', role: 'assistant', content: '好，我来。', created_at: '2026-11-15T10:00:01.000Z' },
    ]);
    expect(s.messages.map((m) => m.content)).toEqual(['帮我玩玩这个游戏。。', '好，我来。']);
  });

  it('非 prompt 形态（纯文本用户消息）原样保留', () => {
    const s = createChatState('t');
    replaceMessagesFromServer(s, [{ id: 'a', role: 'user', content: '普通一句话', created_at: '2026-11-15T10:00:00.000Z' }]);
    expect(s.messages.map((m) => m.content)).toEqual(['普通一句话']);
  });
});

// ★★★ 2026-11-15 用户实报「这个需要优化」「怎么这么多光标输入动画在动」：
//   任务计划工具回执把面板刷成流水账 + 每条 assistant 消息都留着 streaming 光标。
describe('★ 面板降噪 + 光标唯一', () => {
  it('任务计划回执（已创建/已更新第 N 步）不进面板', () => {
    const s = createChatState('t');
    applyTaskEvent(s, { type: 'message:added', message: { id: 'a', role: 'assistant', content: '已创建任务计划「连续刷秘境挑战5层」，共 3 步' } });
    applyTaskEvent(s, { type: 'message:added', message: { id: 'b', role: 'assistant', content: '已更新第 1 步状态为 done' } });
    applyTaskEvent(s, { type: 'message:added', message: { id: 'c', role: 'assistant', content: '战斗结束后我继续点「下一关」。' } });
    expect(s.messages.map((m) => m.content)).toEqual(['战斗结束后我继续点「下一关」。']);
  });

  it('replaceMessagesFromServer 同样滤掉活动噪音', () => {
    const s = createChatState('t');
    replaceMessagesFromServer(s, [
      { id: 'a', role: 'user', content: '帮我玩玩这个游戏', created_at: '2026-11-15T10:00:00.000Z' },
      { id: 'b', role: 'assistant', content: '已更新第 2 步状态为 running', created_at: '2026-11-15T10:00:01.000Z' },
      { id: 'c', role: 'assistant', content: '好的，我来代玩。', created_at: '2026-11-15T10:00:02.000Z' },
    ]);
    expect(s.messages.map((m) => m.content)).toEqual(['帮我玩玩这个游戏', '好的，我来代玩。']);
  });

  it('★ 光标唯一：新 assistant 消息到达时关掉上一条的 streaming', () => {
    const s = createChatState('t');
    applyTaskEvent(s, { type: 'message:added', message: { id: 'a', role: 'assistant', content: '第一条' } });
    applyTaskEvent(s, { type: 'message:added', message: { id: 'b', role: 'assistant', content: '第二条' } });
    const streaming = s.messages.filter((m) => m.streaming);
    expect(streaming.length, '★ 只允许最后一条在流式').toBe(1);
    expect(streaming[0].content).toBe('第二条');
  });
});

// ★★★ 2026-11-15 用户「工具调用参考聊天模式里面的」：工具调用按主对话步骤条同款
// 语义走**活动条**（名称+人话+状态），不灌进消息流。
describe('★ 工具活动条（参考聊天模式）', () => {
  it('tool:start 进条、tool:result 改状态并带结果摘要，不产生消息', () => {
    const s = createChatState('t');
    applyTaskEvent(s, { type: 'tool:start', toolName: 'browser_click', args: { index: 2 } });
    applyTaskEvent(s, { type: 'tool:result', toolName: 'browser_click', result: 'click 执行成功' });
    expect(s.messages.length).toBe(0);
    expect(s.tools.length).toBe(1);
    expect(s.tools[0].status).toBe('done');
    expect(s.tools[0].label).toContain('点击');
    expect(s.tools[0].label).toContain('click 执行成功');
  });

  it('活动条有上限（尾 6 条），running 光标只标最后一条同名的', () => {
    const s = createChatState('t');
    for (let i = 0; i < 9; i++) {
      applyTaskEvent(s, { type: 'tool:start', toolName: 'browser_click', args: { index: i } });
      applyTaskEvent(s, { type: 'tool:result', toolName: 'browser_click', result: 'ok' });
    }
    applyTaskEvent(s, { type: 'tool:start', toolName: 'browser_screenshot', args: {} });
    expect(s.tools.length).toBe(6);
    expect(s.tools.filter((t) => t.status === 'running').length).toBe(1);
    expect(s.tools[5].name).toBe('browser_screenshot');
  });

  it('tool:timeout 标记超时（不再让用户以为卡死）', () => {
    const s = createChatState('t');
    applyTaskEvent(s, { type: 'tool:start', toolName: 'browser_navigate', args: { url: 'https://x.com' } });
    applyTaskEvent(s, { type: 'tool:timeout', toolName: 'browser_navigate', timeoutMs: 480000 });
    expect(s.tools[0].status).toBe('timeout');
  });
});
