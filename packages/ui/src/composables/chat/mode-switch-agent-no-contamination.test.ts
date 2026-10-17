// 模式切换「助手串会话」守门测试（2026-10-17 实报）。
//
// 事故形态：办公会话「小说推文」的输入区智能体显示为「代码编写助手」。
// 根因：App.vue 切模式时第 2 步（恢复新模式智能体）先于第 4 步（恢复新模式会话）执行，
// 且复用了 onAgentSwitch —— 它会把 agentId 回写进"当前会话"，而此刻 currentConvId
// 还停在**旧模式**的会话上 ⇒ 新模式智能体被绑进旧模式会话，切回来就被 applyConvAgent 还原出来。
//
// 修复契约（本测试钉住三件事）：
//   1) onAgentSwitch 有 syncConv 参数，默认 true（手动换助手的回写行为不变）；
//   2) 回写被 syncConv 守卫（否则参数是死的）；
//   3) App.vue 模式切换恢复路径必须传 false。
//
// 手法同 conversationLifecycleWiring.test.ts：读源码 + 剥注释后断言。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../../..');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
/** 剥注释（含行注释/块注释）——不断干净会被注释里的示例代码骗到 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const USE_CHAT = strip(readRepo('packages/ui/src/composables/chat/useChat.ts'));
const APP = strip(readRepo('packages/ui/src/App.vue'));

/** 取源码中某个函数的函数体（从签名起至下一处 "\n  }" 结束） */
function fnBody(src: string, signature: string): string {
  const start = src.indexOf(signature);
  expect(start, `找不到 ${signature}`).toBeGreaterThan(-1);
  const end = src.indexOf('\n  }', start);
  return src.slice(start, end);
}

describe('模式切换 · 助手不得回写进旧模式会话', () => {
  it('onAgentSwitch 带 syncConv 参数且默认 true（手动换助手回写行为不变）', () => {
    expect(USE_CHAT).toMatch(/function onAgentSwitch\(id: string, syncConv = true\)/);
  });

  it('会话回写被 syncConv 守卫（否则参数是摆设）', () => {
    const body = fnBody(USE_CHAT, 'function onAgentSwitch(');
    expect(body).toMatch(/if \(syncConv && store\.currentConvId\)/);
    expect(body).toMatch(/updateConversation\(store\.currentConvId, \{ agentId: id \}\)/);
  });

  it('App.vue 模式切换的智能体恢复必须传 syncConv=false', () => {
    // 只钉模式切换块内的那一处调用：fallbackAgent 之后的 onAgentSwitch
    const m = APP.match(/const fallbackAgent =[\s\S]{0,600}?chat\.onAgentSwitch\(agentId[^)]*\)/);
    expect(m, '找不到模式切换块的 onAgentSwitch 调用').not.toBeNull();
    expect(m![0]).toMatch(/chat\.onAgentSwitch\(agentId, false\)/);
  });

  it('默认助手回退路径（无存档时）同样不得回写', () => {
    // fallbackAgent 定义与 onAgentSwitch(agentId, false) 必须同处一个 watch 回调：
    // 防止有人把调用搬出条件块、换回单参调用。
    const watchIdx = APP.indexOf('watch(activeMode, async (m, old)');
    expect(watchIdx).toBeGreaterThan(-1);
    const watchBody = APP.slice(watchIdx, APP.indexOf('\n  });', watchIdx));
    expect(watchBody).toContain('const fallbackAgent =');
    expect(watchBody).toMatch(/onAgentSwitch\(agentId, false\)/);
  });
});
