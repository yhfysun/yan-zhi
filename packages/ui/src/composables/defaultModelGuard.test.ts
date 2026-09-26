// 「默认模型被清空」的守门测试。
//
// 起因（用户反复报障）：「刚进去的是吗模型平台没有初始化？输入框都没有默认挂载啊，
// 这个问题解决这么久都不行？」
//
// 真根因（不是加载失败，是**配置被自己抹掉**）：
//   useChat.onMounted 的顺序是 loadPlatforms → loadModels → healStalePlatform()。
//   移动端首启内嵌后端未就绪时 platforms/models 都是空数组，而 healStalePlatform
//   的旧实现会在「持久化值不在列表里」时把 defaultPlatformId/defaultModelId
//   **改写成回退值（当时是空串）** → 用户的默认模型被永久清空，
//   **之后即使后端就绪、重试成功也救不回来**（配置已丢）。
//   → 所以「加了重试还是不行」：重试救的是列表，救不回被抹掉的配置。
//
// 本测试钉住两条契约：
//   ① 数据未就绪时 healStalePlatform 不得改写配置
//   ② 兜底值不允许是空串（拿不到候选就保留原值）
//
// 用「读源码做结构断言」而不是挂载 useChat：它依赖 pinia + router + 一堆 store，
// 挂载成本远高于收益，且要测的是**这段守卫逻辑是否存在**（静态结构问题）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '..');
const USE_CHAT = readFileSync(resolve(SRC, 'composables/chat/useChat.ts'), 'utf8');
const PLATFORM = readFileSync(resolve(SRC, 'stores/platform.ts'), 'utf8');

/** 截取 healStalePlatform 函数体（从声明到下一个顶层函数声明前）。 */
function healBody(): string {
  const i = USE_CHAT.indexOf('async function healStalePlatform');
  expect(i, '未找到 healStalePlatform').toBeGreaterThan(-1);
  const rest = USE_CHAT.slice(i);
  const end = rest.indexOf('\n  }', rest.indexOf('{'));
  return rest.slice(0, end > 0 ? end + 4 : 1500);
}

describe('默认模型不被清空：healStalePlatform 必须在数据未就绪时保持沉默', () => {
  it('★ 必须在改写前检查 platformsLoaded / modelsLoaded', () => {
    const body = healBody();
    expect(body, 'healStalePlatform 没有检查数据是否已就绪 —— 首屏会把默认模型清空')
      .toMatch(/platformsLoaded|modelsLoaded/);
  });

  it('★ 未就绪时必须提前 return（不得落到改写分支）', () => {
    const body = healBody();
    // 存在「未就绪 → return」的分支
    expect(body, '未就绪时没有 return，仍会改写配置')
      .toMatch(/if\s*\(\s*!\s*platformStore\.(platformsLoaded|modelsLoaded)[\s\S]{0,160}?return;/);
  });

  it('★ 兜底值不得是空串：必须回落到原值', () => {
    const body = healBody();
    // nextP / nextM 的表达式里要出现 dp / dm 作为兜底
    const nextP = body.match(/const\s+nextP\s*=\s*([^;]+);/);
    const nextM = body.match(/const\s+nextM\s*=\s*([^;]+);/);
    expect(nextP, '未找到 nextP 赋值').toBeTruthy();
    expect(nextM, '未找到 nextM 赋值').toBeTruthy();
    expect(nextP![1], 'nextP 兜底没有回落到原值 dp（可能写空）').toMatch(/\bdp\b/);
    expect(nextM![1], 'nextM 兜底没有回落到原值 dm（可能写空）').toMatch(/\bdm\b/);
    // 反向：不允许以 `|| ''` 结尾（那正是把配置写空的写法）
    expect(nextP![1], 'nextP 仍以 || \'\' 结尾（会把配置写空）').not.toMatch(/\|\|\s*''\s*$/);
    expect(nextM![1], 'nextM 仍以 || \'\' 结尾（会把配置写空）').not.toMatch(/\|\|\s*''\s*$/);
  });

  it('platform store 必须提供 platformsLoaded / modelsLoaded 且只在成功时置真', () => {
    expect(PLATFORM, 'store 未定义 platformsLoaded').toMatch(/const\s+platformsLoaded\s*=\s*ref\(false\)/);
    expect(PLATFORM, 'store 未定义 modelsLoaded').toMatch(/const\s+modelsLoaded\s*=\s*ref\(false\)/);
    // 必须在拿到 data 之后才置真（不能在请求前）
    expect(PLATFORM).toMatch(/if\s*\(['"]data['"]\s+in\s+r\)\s*\{[\s\S]{0,600}?modelsLoaded\.value\s*=\s*true/);
    // 且要导出给 useChat 用
    expect(PLATFORM).toMatch(/return\s*\{[\s\S]{0,200}?platformsLoaded/);
  });

  it('★ 必须有「就绪后补挂模型」的等待，避免输入框停在空态', () => {
    expect(USE_CHAT, '缺少 ensureModelWhenReady（首屏未就绪时不会补选模型）')
      .toMatch(/function\s+ensureModelWhenReady/);
    // 且确实在 mounted 流程里被调用
    expect(USE_CHAT).toMatch(/healStalePlatform\(\);\s*\n\s*[\s\S]{0,200}?ensureModelWhenReady\(\)/);
  });
});