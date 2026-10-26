/**
 * 暂停任务时必须收回宿主层虚拟光标（2026-10-26 用户实报「我暂停了 pageAgent…鼠标也还在」）
 *
 * 背景：AI 虚拟鼠标由主进程在**动作收尾**时读 `__yzLastCursor` 广播，暂停后没有新动作
 *   ⇒ 再没人广播，光标就停在最后位置，看起来像 agent 还在操作。
 * 修法：暂停即 clearAgentCursor（恢复后下一次动作会重新广播）。
 *
 * ★ 为什么还要断言源码顺序：真 store 的 `taskIds` 是闭包私有 Map，测试无法从外部塞 taskId，
 *   所以「暂停 → 光标清空」的完整链路在单测里跑不起来。这里退一步锁住**调用存在、且在
 *   sendChatWs('pause') 之前**（否则暂停请求先发出去，光标要等下一帧才收）；行为侧另用
 *   clearAgentCursor 实测兜住。
 */
import { describe, it, expect } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useChatStore } from './chat';

function freshStore() {
  setActivePinia(createPinia());
  return useChatStore();
}

describe('暂停任务收回虚拟光标', () => {
  it('clearAgentCursor 真的把光标置空', () => {
    const store = freshStore();
    store.onAgentCursor('tab-1', 100, 200, '点击', 'click');
    expect(store.agentCursor).toBeTruthy();

    store.clearAgentCursor();

    expect(store.agentCursor).toBeNull();
  });

  it('pauseTask 里 clearAgentCursor 在 sendChatWs(pause) 之前调用', () => {
    const code = readFileSync(join(__dirname, 'chat.ts'), 'utf8');
    const start = code.indexOf('async function pauseTask');
    expect(start, 'pauseTask 不见了（改名/挪位置？）').toBeGreaterThan(-1);
    const end = code.indexOf('\n  }\n', start);
    const body = code.slice(start, end);
    const at = body.indexOf('clearAgentCursor()');
    expect(at, 'pauseTask 没清光标：暂停后虚拟鼠标会停在原地').toBeGreaterThan(-1);
    expect(at).toBeLessThan(body.indexOf("sendChatWs('pause'"));
  });
});
