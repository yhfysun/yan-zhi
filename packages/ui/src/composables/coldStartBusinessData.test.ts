// 冷启动业务清单预热守门测试 —— 防「模型/智能体下拉空壳，非得进平台页兜一圈」回归。
//
// 背景（2026-10-16 用户实报 + 安装版日志佐证）：
//   · 用户原话：「模型和智能体数据经常容易丢，要点击对应的平台里再回会话，下拉才出来」
//   · 结构性事实：`platformStore.loadPlatforms()/loadModels()` 只在 `useChat.onMounted`
//     （会话页挂载）与几个管理页里各发一次请求；那次没落地（后端未监听 → 网络层失败、
//     授权码未就绪 → 403 而 `getWithRetry` 对 4xx 不重试、或后端重启窗口超过退避预算 ~10.5s）
//     → 共享缓存**永久为空**，只能靠用户手动进「模型平台」页把缓存补回来。
//   · 智能体那侧早有 `ensureAgents()`（下拉展开时兜底）自愈，模型这侧一直没有 —— 这是不对称的根因。
//
// 修法（两条腿，缺一不可）：
//   ① 壳层（App.vue）冷启动预热：恒挂载的组件里，等「后端就绪 + 授权码就绪」后拉三份清单；
//   ② 下拉展开时兜底：模型下拉与智能体下拉同口径，空了就补拉（幂等 + 进行中复用）。
//
// 为什么读源码断言而不是渲染测试：判据全是结构可判的（有没有预热、预热排在两个就绪门之后没有、
// 兜底挂在展开分支里没有、判据是"有没有数据"而不是"有没有拉过"），而真跑起来要拉 pinia +
// 后端 + 授权 keyring。同口径见 composables/mobilePackagingAndColdStart.test.ts 顶部说明。
// ★ 每条断言都做过变异测试（见文件末尾记录）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UI_SRC = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(UI_SRC, p), 'utf8');
/** 去注释：注释里同样会出现函数名与关键字，不去掉会被"注释喂饱"（本项目踩过）。 */
const strip = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');

const PLATFORM_TS = strip(read('stores/platform.ts'));
const APP_VUE = strip(read('App.vue'));
const INPUT_AREA = strip(read('components/chat/ChatInputArea.vue'));

/** 从一个起点截到之后的结束标记（取不到则抛，避免静默拿到空串让断言变成"恒真"）。 */
function sliceTo(src: string, from: string, end: string): string {
  const i = src.indexOf(from);
  expect(i, `源码里找不到起点：${from}`).toBeGreaterThan(-1);
  const j = src.indexOf(end, i + from.length);
  expect(j, `找不到 ${from} 的结束标记`).toBeGreaterThan(-1);
  return src.slice(i, j);
}

describe('① 平台 store：空才补拉的 ensure*', () => {
  it('导出 ensurePlatforms / ensureModels', () => {
    expect(PLATFORM_TS, '未导出').toMatch(/platforms, models,[^}]*ensurePlatforms, ensureModels/);
    expect(PLATFORM_TS, 'ensurePlatforms 未定义').toMatch(/async function ensurePlatforms\(\)/);
    expect(PLATFORM_TS, 'ensureModels 未定义').toMatch(/async function ensureModels\(\)/);
  });

  it('★ 判据是「列表非空」而不是「已加载过」标志', () => {
    // 后端 200 + 空数组也会把 modelsLoaded 置 true（见 platform.ts 里 ①/② 的注释），
    // 拿 Loaded 标志当判据 = 空列表永远不再补拉 —— 正是本 bug 的成因，必须咬住。
    const p = sliceTo(PLATFORM_TS, 'async function ensurePlatforms', '\n  }');
    const m = sliceTo(PLATFORM_TS, 'async function ensureModels', '\n  }');
    expect(p, 'ensurePlatforms 未判"已有数据"').toMatch(/if \(platforms\.value\.length\) return;/);
    expect(m, 'ensureModels 未判"已有数据"').toMatch(/if \(models\.value\.length\) return;/);
    expect(p + m, '不得用 Loaded 标志当判据').not.toMatch(/platformsLoaded\.value\s*\)\s*return|modelsLoaded\.value\s*\)\s*return/);
  });

  it('进行中的请求复用同一个 Promise（冷启动时壳层与会话页会同时触发）', () => {
    expect(PLATFORM_TS, '缺少 platforms 的 inflight 槽位').toMatch(/let platformsInflight: Promise<void> \| null = null/);
    expect(PLATFORM_TS, '缺少 models 的 inflight 槽位').toMatch(/let modelsInflight: Promise<void> \| null = null/);
    expect(PLATFORM_TS, '未复用进行中的 platforms 请求').toMatch(/platformsInflight = loadPlatforms\(\)/);
    expect(PLATFORM_TS, '未复用进行中的 models 请求').toMatch(/modelsInflight = loadModels\(\)/);
  });
});

describe('② 壳层冷启动预热（App.vue）', () => {
  const warm = sliceTo(APP_VUE, 'async function warmUpBusinessData', '\n}');

  it('拉齐三份清单：平台 + 模型 + 智能体', () => {
    expect(warm, '未预热平台').toMatch(/platformStore\.ensurePlatforms\(\)/);
    expect(warm, '未预热模型').toMatch(/platformStore\.ensureModels\(\)/);
    expect(warm, '未预热智能体').toMatch(/agentStore\.ensureAgents\(\)/);
  });

  it('★ 排在「后端就绪」与「授权码就绪」两道门之后（顺序不能反）', () => {
    const at = (s: string, label: string) => {
      const i = warm.indexOf(s);
      expect(i, `预热里找不到 ${label}`).toBeGreaterThan(-1);
      return i;
    };
    const backend = at('await waitForBackend()', '后端就绪门');
    const license = at('await useLicenseStore().init()', '授权码就绪门');
    const firstEnsure = Math.min(at('ensurePlatforms()', 'ensurePlatforms'), at('ensureModels()', 'ensureModels'));
    // 后端没监听 → 请求扑空；授权码没读出来 → /platforms 403（getWithRetry 对 4xx 不重试）
    expect(backend, '预热没等后端就绪').toBeLessThan(firstEnsure);
    expect(license, '预热没等授权码').toBeLessThan(firstEnsure);
  });

  it('onMounted 里非阻塞触发（预热不许拖慢首屏）', () => {
    const mounted = sliceTo(APP_VUE, 'onMounted(async () => {', '\n});');
    expect(mounted, 'onMounted 未触发预热').toMatch(/void warmUpBusinessData\(\);/);
  });

  it('★ 授权激活后补跑（未激活时 /platforms 是 403，那轮预热注定空手而归）', () => {
    const watcher = sliceTo(APP_VUE, 'watch(() => licenseStore.verified', '\n});');
    expect(watcher, '激活后未补跑预热').toMatch(/void warmUpBusinessData\(\);/);
    expect(watcher, '激活后未补跑插件层（原有行为被破坏）').toMatch(/void bootPluginLayer\(\);/);
  });
});

describe('③ 模型下拉展开时兜底（与智能体下拉同口径）', () => {
  it('展开分支里补拉平台与模型', () => {
    const w = sliceTo(INPUT_AREA, 'watch([modelPopOpen, mobileModelPopOpen]', '\n});');
    // 必须在"关闭"的提前 return **之后**：关闭分支里补拉等于每次收起都打一次接口
    const earlyReturn = w.indexOf('if (!desktopOpen && !mobileOpen)');
    const ensure = w.indexOf('platformStore.ensurePlatforms()');
    expect(earlyReturn, '找不到关闭分支的提前返回').toBeGreaterThan(-1);
    expect(ensure, '展开时未兜底补拉平台').toBeGreaterThan(-1);
    expect(ensure, '兜底补拉跑到了关闭分支里').toBeGreaterThan(earlyReturn);
    expect(w, '展开时未兜底补拉模型').toMatch(/platformStore\.ensureModels\(\)/);
  });

  it('智能体下拉原有的兜底没被顺手删掉（两侧同口径的对照基准）', () => {
    expect(INPUT_AREA, 'onAgentDropdownVisible 丢了').toMatch(/function onAgentDropdownVisible\(visible: boolean\)/);
    expect(INPUT_AREA, '展开时未兜底补拉智能体').toMatch(/if \(visible\) agentStore\.ensureAgents\(\);/);
  });
});

// ---- 变异测试记录（临时改源码 → 对应断言必须报红，改回后全绿）----
//
// | 变异                                                    | 触发断言 |
// |---------------------------------------------------------|----------|
// | ensurePlatforms 的判据改用 platformsLoaded 标志          | 判据是「列表非空」 |
// | 删掉 ensure* 上的 inflight 复用                          | 进行中的请求复用 |
// | 把 ensure* 挪到 waitForBackend 之前                      | 排在两道门之后 |
// | 把 useLicenseStore().init() 从预热里删掉                 | 排在两道门之后 |
// | 删掉授权 watcher 里的 warmUpBusinessData()               | 激活后补跑 |
// | 删掉 ChatInputArea 里两行 ensure*                        | 展开分支里补拉 |
// | 把 ensure* 挪到关闭分支的提前 return 之前                | 兜底补拉跑到关闭分支 |
