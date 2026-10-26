// 「新任务继续」接线守门测试 —— 防"改了一半"回归。
//
// ★ 为什么需要它（行为级覆盖见 continue-task.test.ts，那里测预填文案本身）：
//   本功能横跨 useChat（状态机）/ useTaskRowActions（入口）/ 办公侧栏 + 四模式工作台
//   （三处接线：桌面右键菜单、移动端动作面板、动作分发）。历史事故形态是
//   「侧栏有、工作台没有」或「菜单有、分发没有」—— 都不报错，只是点了没反应。
//
// ★ 同时守住两个已修的状态回退点（2026-10-24 代码审查发现）：
//   ① 选线框弹开后必须先返回，否则取消选线也会把全局智能体/模型改掉；
//   ② 预填不能顶掉草稿里已有的未发文字。
// ★ 手法同 conversationLifecycleWiring.test.ts：读源码 + 剥注释后断言。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../../..');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
/** 剥注释（含行注释/块注释）—— 不断干净会被注释里的示例代码骗到 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const USE_CHAT = strip(readRepo('packages/ui/src/composables/chat/useChat.ts'));
const ROW_ACTIONS = strip(readRepo('packages/ui/src/composables/useTaskRowActions.ts'));
const SIDEBAR = strip(readRepo('packages/ui/src/components/chat/ChatSidebar.vue'));
const TASK_LIST = strip(readRepo('packages/ui/src/components/workbench/TaskListSection.vue'));

describe('「新任务继续」接线', () => {
  it('两处任务列表都挂了菜单项 / 移动端面板项 / 动作分发', () => {
    for (const [name, src] of [['ChatSidebar', SIDEBAR], ['TaskListSection', TASK_LIST]] as const) {
      expect(src, `${name} 缺菜单项`).toContain('新任务继续');
      expect(src, `${name} 缺移动端面板项`).toContain("key: 'continue'");
      expect(src, `${name} 缺动作分发`).toContain("a.key === 'continue'");
    }
  });

  it('任务行共享入口在新建前先收起右键菜单', () => {
    const fn = ROW_ACTIONS.match(/async function continueTask[\s\S]*?\n  \}/)?.[0] || '';
    expect(fn).toContain('closeCtxMenu()');
    expect(fn).toContain('continueTaskAsNew');
    // 必须出现在 return 的对象里，否则两个列表都拿不到
    expect(ROW_ACTIONS).toContain('continueTask,');
  });

  it('选线框弹开后不再改全局智能体/模型（取消选线不泄漏）', () => {
    const fn = USE_CHAT.match(/async function continueTaskAsNew[\s\S]*?\n  \}/)?.[0] || '';
    expect(fn).toContain('if (taskLinePicker.value) return;');
    // 该守卫必须排在智能体/模型继承之前
    expect(fn.indexOf('if (taskLinePicker.value) return;')).toBeLessThan(fn.indexOf('onAgentSwitch'));
  });

  it('取消选线会清掉待填摘要，不泄漏给下一次新建', () => {
    const fn = USE_CHAT.match(/function cancelTaskLine\(\) \{[\s\S]*?\n  \}/)?.[0] || '';
    expect(fn).toContain('pendingContinuePrefill.value = null;');
  });

  it('预填不顶掉草稿里已有的未发文字', () => {
    const apply = USE_CHAT.match(/if \(pendingContinuePrefill\.value\) \{[\s\S]*?\n    \}/)?.[0] || '';
    expect(apply).toContain('input.value.trim()');
    expect(apply).toContain('${prefill}');
  });
});
