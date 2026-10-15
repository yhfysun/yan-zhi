// 「导航跑偏」修复守卫（2026-10-15）—— 对应诊断报告 P0-①/②/③ 与 P1-④/⑤
//
// 实证背景（main-2026-10-14.log + data.db，非推断）：
//   · 10-14 晚 conv 13822a0d 单会话 57 次 navigate，全部由 pageAgent 子智能体发起；
//   · 21:11:07 / 21:21:42 存在**同秒双批**（两个并发子智能体流）；
//   · 全部动作 resolvedTabId=tab-1（锚共用一个），new_tab 开了 tab-2~tab-6 却 0 次被显式使用；
//   · `browser_get_info` 幻觉工具两次各挂 480s（合计 16 分钟空转）；
//   · 两天 close_tab 调用 = 0。
//
// 分层：
//   ① 真跑纯函数（browser-target / formatBridgeResult）；
//   ② 源码守卫（接线正确性 —— 本项目历史上因"判断写对了但没接上"静默失效过多次）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

const LTM = read('apps/server/src/llm-task-manager.ts');
const MAIN = read('apps/desktop/main.cjs');

describe('① P0-① 同批并发 call_agent：浏览器型子智能体改串行（防多流抢锚）', () => {
  const ltm = strip(LTM);

  it('★★★ 判据函数存在，且"宁可串行不可漏判"（解析不出/查不到行按会碰浏览器处理）', () => {
    expect(ltm, '★ 缺 isBrowserCapableSubAgent 判据').toMatch(/function isBrowserCapableSubAgent\(/);
    const i = ltm.indexOf('function isBrowserCapableSubAgent(');
    const body = ltm.slice(i, ltm.indexOf('\n}', i));
    expect(body, '★ agentId 缺失时未按"会碰浏览器"兜底 → 漏判 → 并发抢锚复发').toMatch(/if \(!raw\) return true/);
    expect(body, '★ 查不到 agent 行时未按"会碰浏览器"兜底').toMatch(/if \(!row\) return true/);
    // 判据唯一：工具 id 列表判定抽成单一函数
    expect(ltm, '★ 缺 toolIdsIncludeBrowser（判据被复制成两份）').toMatch(/function toolIdsIncludeBrowser\(/);
  });

  it('★★★ 并发面过滤必须调用该判据（否则判据是死代码）', () => {
    const i = ltm.indexOf('const parallelizableCalls = toolCallAcc.filter(');
    expect(i, '★ 锚点缺失：并发面过滤').toBeGreaterThan(-1);
    const seg = ltm.slice(Math.max(0, i - 1600), i + 900);
    expect(seg, '★ 并发面未排除浏览器型 call_agent → 两个 pageAgent 仍并发抢锚')
      .toMatch(/isBrowserCapableSubAgent\(/);
    // 判据必须是"同批存在**另一个落在这个标签页上**的浏览器型"时才生效：
    //   · 非浏览器型兄弟（代码/检索子智能体）与浏览器型并发是安全的；
    //   · 浏览器型但**各占一页**（`browserTarget:'background'`）并发也是安全的。
    //   ⇒ 两者都不得被无谓串行化（不收紧的话，后台并行会被这一层整段吃掉、方案收益归零）。
    expect(seg, '★ 未按"该标签页已被占"限定 → 混合批 / 各占一页的后台流被无谓串行化')
      .toMatch(/tabKeyTaken\.has\(key\)/);
    expect(seg, '★ 每个 tabKey 只放一个进并发批（去重必须真的加上）').toMatch(/tabKeyTaken\.add\(key\)/);
    expect(seg, '★ 串行化键必须由 browserFlowKeyOf 算出（否则与流锁的 tabKey 漂移）')
      .toMatch(/browserFlowKeyOf\(a,/);
  });

  it('★★★ 别名表为模块级唯一实现（runSubAgentImpl 与判据共用，防漂移）', () => {
    const hits = (ltm.match(/const SUBAGENT_ALIASES/g) || []).length;
    expect(hits, `★ SUBAGENT_ALIASES 出现 ${hits} 处（应为 1：模块级；函数内再定义一份就会漂移）`).toBe(1);
    expect(ltm, '★ runSubAgentImpl 未复用模块级别名表').toMatch(/const resolvedId = SUBAGENT_ALIASES\[agentId\] \|\| agentId/);
  });
});

describe('② P0-③ 未知浏览器工具快速失败（治"幻觉工具挂满 480s"）', () => {
  const ltm = strip(LTM);

  it('★★★ 桥调用前必须有注册表校验 + 近似候选提示', () => {
    const i = ltm.indexOf('if (isBrowser) {');
    expect(i, '★ 锚点缺失：浏览器分支').toBeGreaterThan(-1);
    const seg = ltm.slice(i, i + 1500);
    expect(seg, '★ 缺"未知浏览器工具"快速失败 → 幻觉工具会再走 桥400→降级SSE→480s 空等')
      .toMatch(/!registry\.has\(toolName\)/);
    expect(seg, '★ 未给出最接近的候选工具名（模型无从改口）').toMatch(/最接近的可用浏览器工具/);
    // 必须在 decideBrowserExecution **之前**（否则已经发出桥调用，白等一轮）
    const iCheck = seg.indexOf('!registry.has(toolName)');
    const iExec = seg.indexOf('decideBrowserExecution(');
    expect(iCheck, '★ 校验位置在桥调用判定之后 → 快速失败失效').toBeLessThan(iExec);
  });

  it('★★★ 判据对正常浏览器工具不误伤（名字清单确实含 browser_*，且不含幻觉名）', async () => {
    // ★ 用 BROWSER_TOOL_NAMES（工具注册表注册的**就是**这份清单的类）而不是 getToolRegistry()：
    //   后者会现场注册全部内置工具（数秒 CPU），在**全量并行**下足以把邻近测试文件
    //   顶过 hook 超时（实测 workflow-session-guard 的 8.8s hook 撞 10s 上限）。
    //   对"browser_* 名字在不在注册表"这个判据，两者**等价**（注册表 = BrowserToolClasses）。
    const { BROWSER_TOOL_NAMES } = await import('@yan-zhi/core');
    const names = new Set(BROWSER_TOOL_NAMES as string[]);
    for (const n of [
      'browser_navigate', 'browser_get_page_content', 'browser_get_page_info', 'browser_get_tabs',
      'browser_new_tab', 'browser_switch_tab', 'browser_close_tab', 'browser_run_script',
      'browser_click', 'browser_type', 'browser_wait_for', 'browser_screenshot',
    ]) {
      expect(names.has(n), `★ ${n} 不在工具名清单 → 新校验会把它误判为"未知工具"（正常功能被打死）`).toBe(true);
    }
    // 幻觉名必须不在（这正是要拦的）
    expect(names.has('browser_get_info'), '★ 幻觉工具竟在清单 → 快速失败分支永不触发').toBe(false);
  });
});

describe('③ P1-④ navigate 回执：可见性判据 + 隐藏态出路', () => {
  it('★★★ main.cjs navigate 必须读 document.visibilityState 并带回', () => {
    const m = strip(MAIN);
    // ★ 两处 switch 都有 `case 'navigate'`（BrowserView 引擎在前、webview 引擎的 doAction 在后），
    //   本次改动在后者 ⇒ 必须用 lastIndexOf 定位（用 indexOf 会切片到无关段）。
    const i = m.lastIndexOf("case 'navigate': {");
    expect(i, '★ 锚点缺失：navigate case').toBeGreaterThan(-1);
    const seg = m.slice(i, i + 9000);
    expect(seg, '★ 未读 visibilityState → 隐藏态（creator-micro 不渲染）无从判定').toMatch(/document\.visibilityState/);
    expect(seg, '★ 未把 visibilityState 放进返回体').toMatch(/result\.visibilityState\s*=/);
    expect(seg, '★ 隐藏态没给出路（应引导 run_script 页内 fetch / 让用户展开面板）').toMatch(/隐藏态/);
  });

  it('★★★ 桥层必须显式渲染 navigate 回执（否则 note 被 JSON 截断吞掉）', async () => {
    const { formatBridgeResult } = await import('../src/browser-bridge.js');
    const out = formatBridgeResult('navigate', {
      url: 'https://creator.douyin.com/creator-micro/interactive/comment',
      title: '互动管理', loading: true, visibilityState: 'hidden',
      note: '页面处于**隐藏态**（预览面板收起/未显示）：请改用 browser_run_script 在页面内 fetch 接口。',
    });
    expect(out, '★ navigate 无专属分支 → 长 note 落 JSON.slice(500) 被截断').toContain('页面可见性: hidden');
    expect(out, '★ note 未透传').toContain('隐藏态');
    expect(out, '★ loading 语义丢失').toContain('仍在加载');
  });
});

describe('④ P1-⑤ get_tabs 回执：标注可关闭页 + 卡死页出路（治 close_tab=0）', () => {
  it('★★★ 回执必须标出 [可关]/[用户页·勿关] 且给 close_tab 可抄调用（示例须是合法 JSON）', async () => {
    const { formatBridgeResult } = await import('../src/browser-bridge.js');
    const out = formatBridgeResult('get_tabs', {
      activeTabId: 'tab-1',
      tabs: [
        { tabId: 'tab-1', url: 'https://creator.douyin.com/x', title: '创作者中心', agentOpened: true, active: true },
        { tabId: 'tab-2', url: 'https://kol.fanqieopen.com/y', title: '', agentOpened: true, loading: true },
        { tabId: 'tab-9', url: 'https://user.example.com', title: '用户自己开的', agentOpened: false },
      ],
    });
    expect(out, '★ 未标注可关页 → 模型不知道该清场').toContain('[可关]');
    expect(out, '★ 未保护用户页 → 模型可能去关用户的页').toContain('[用户页·勿关]');
    // ★ 示例必须是合法 JSON 且 id 带引号（此前 `[tab-1, tab-2]` 不是合法 JSON，
    //   照抄会落到"关当前活动页"—— 复审 HIGH）
    const m = out.match(/browser_close_tab\((\{.*?\})\)/);
    expect(m, '★ 未给 close_tab 可抄调用').toBeTruthy();
    const parsed = JSON.parse(m![1]);
    expect(parsed.tabIds, '★ 示例里的 id 必须是字符串（"tab-N"）—— 数字会被执行侧过滤掉').toEqual(['tab-1', 'tab-2']);
    expect(out, '★ 卡死页（loading）没有单列提示 → 反复导航"唤醒"复发').toContain('tabId=tab-2 处于**加载中**');
  });

  it('★★★ main.cjs get_tabs 必须回传 active/loading（否则上面两个标注无数据源）', () => {
    const m = strip(MAIN);
    const i = m.indexOf("case 'get_tabs': {");
    expect(i, '★ 锚点缺失：get_tabs case').toBeGreaterThan(-1);
    const seg = m.slice(i, i + 900);
    expect(seg, '★ 回执缺 active 字段').toMatch(/active:\s*id === activeTabId/);
    expect(seg, '★ 回执缺 loading 字段').toMatch(/loading:/);
  });

  it('★★★ close_tab 必须支持 tabIds 数组（批量形态在桥路径可用）+ 复用唯一关闭实现 + 保留闸门', () => {
    const m = strip(MAIN);
    const i = m.indexOf("case 'close_tab': {");
    expect(i, '★ 锚点缺失：close_tab case').toBeGreaterThan(-1);
    const seg = m.slice(i, i + 2200);
    // ① 批量：工具描述推荐 `tabIds`，桥路径下只读 args.tabId 会 fallback 关掉"当前活动页"（复审 HIGH）
    expect(seg, '★ 不认 tabIds 数组 → 批量关页会关错（关掉当前活动页）').toMatch(/Array\.isArray\(args\.tabIds\)/);
    // ② 关闭本体必须复用唯一实现（避免第二份摘壳/清锚逻辑）
    expect(seg, '★ 未复用 closeTabById → 平行实现漂移（清锚/摘壳漏一处）').toMatch(/closeTabById\(tid, false\)/);
    // ③ 权限闸门与"别再试"文案不得回归丢失（既有守卫口径）
    expect(seg, '★ 权限闸门丢失（agent 不得关用户的页）').toMatch(/meta\.agentOpened\s*!==\s*true/);
    expect(seg, '★ 缺"别再试"文案 → 模型反复重试白烧步数').toMatch(/请勿再次尝试/);
    // ④ id 归一化：纯数字也必须指向同一个 tab
    expect(seg, '★ 缺 id 归一化（"2" 与 "tab-2" 应同指）').toMatch(/tab-'\s*\+\s*s|\$\{?'tab-'/);
  });

  it('★★★ 工具层 close_tab 的 id 归一化不得把 "tab-N" 静默过滤成空数组', async () => {
    const src = read('packages/core/src/tool/builtin/browser/index.ts');
    const i = src.indexOf('export class BrowserCloseTabTool');
    const seg = src.slice(i, i + 2200);
    expect(seg, '★ 仍在用 Number(x)+isFinite 过滤 → "tab-1" 变 NaN 被丢弃 → ids 为空 → 关错页')
      .not.toMatch(/Number\(x\)\)\.filter\(\(n\) => Number\.isFinite/);
    expect(seg, '★ 缺 normId 归一化函数').toMatch(/normId/);
  });

  it('★★★ browser_press_key 的桥 action 必须是 press（登记在唯一例外表里）', async () => {
    const { toolNameToAction } = await import('../src/browser-bridge.js');
    // 桌面端能力清单里只有 'press'（DESKTOP_BROWSER_ACTIONS），派生成 'press_key' 会被判
    // "不支持的 action" → 工具不可用 / 降级空等（复审 MEDIUM）
    expect(toolNameToAction('browser_press_key'), '★ press_key 未映射到 press → 该工具在直连档不可用').toBe('press');
    // 常规工具仍走"去前缀"默认规则
    expect(toolNameToAction('browser_navigate')).toBe('navigate');
    expect(toolNameToAction('browser_get_page_content')).toBe('get_page_content');
  });

  it('★★★ 桥对"不在白名单的 action"必须回业务错误（不能是可触发降级的非 2xx）', () => {
    const src = read('apps/desktop/browser-bridge.cjs');
    const i = src.indexOf('deps.allowedActions.includes(action)');
    expect(i, '★ 锚点缺失：白名单校验').toBeGreaterThan(-1);
    const seg = src.slice(i, i + 700);
    // 非 2xx 会被 server 判为传输层失败 → 降级 SSE → 480s 空等（复审 MEDIUM）
    expect(seg, '★ 未知 action 仍回非 2xx → 会降级 SSE 空等 480s').toMatch(/writeHead\(200/);
    expect(seg, '★ 未给可读 hint（模型无从改口）').toMatch(/hint:/);
    // 安全边界③不放宽：白名单校验本身必须还在
    expect(src, '★ 白名单校验被删 → 端点变成通用 IPC 隧道').toMatch(/deps\.allowedActions\.includes\(action\)/);
  });

  it('★★★ navigate 回执必须透传 warning（"连续 N 次无变化"的纠偏信号最该被它看到）', async () => {
    const { formatBridgeResult } = await import('../src/browser-bridge.js');
    const out = formatBridgeResult('navigate', {
      url: 'https://example.com/a', title: 'A',
      warning: '连续 3 次操作页面无任何变化，请换定位方式或换招',
    });
    expect(out, '★ warning 被显式分支吞掉（navigate 正是最该看到它的动作）').toContain('连续 3 次操作页面无任何变化');
  });
});

describe('⑤ 第三层：跨会话回落抢页（"上两个并发任务把预览面板搞乱了"）', () => {
  const bt = require(resolve(REPO, 'apps/desktop/browser-target.cjs'));

  it('★★★ 当前活动页属于**别的会话** → 不回落（各自建页，绝不导航别人的现场）', () => {
    const r = bt.resolveTarget('conv-B', null, 'navigate', {
      anchored: null,
      activeTabId: 'tab-1',
      isMine: () => false,
      isCurrentView: (t: string) => t === 'tab-1',      // 它确实是本面板可见页
      isOwnedByOther: (t: string) => t === 'tab-1',     // 但归属 conv-A（别人正在用）
    });
    expect(r.ok).toBe(true);
    expect(r.tabId, '★ 回落了别的会话正在用的页 → 把它的导航顶掉且不报错（"面板被搞乱"根因）')
      .toBeNull();
  });

  it('★★ 无人认领的活动页（用户自己开的/首次）仍回落 —— 既有语义不回归', () => {
    const r = bt.resolveTarget('conv-B', null, 'navigate', {
      anchored: null,
      activeTabId: 'tab-1',
      isMine: () => false,
      isCurrentView: (t: string) => t === 'tab-1',
      isOwnedByOther: () => false,
    });
    expect(r.tabId, '★ 把首次 navigate 的起步路径堵死了（agent 第一步走不动）').toBe('tab-1');
  });

  it('★★ 归属自己的活动页照常回落；省略 isOwnedByOther 时行为逐字不变（旧调用方不受影响）', () => {
    const mine = bt.resolveTarget('conv-A', null, 'navigate', {
      anchored: null, activeTabId: 'tab-1',
      isMine: (t: string) => t === 'tab-1', isCurrentView: () => true, isOwnedByOther: () => false,
    });
    expect(mine.tabId).toBe('tab-1');
    const legacy = bt.resolveTarget('conv-B', null, 'navigate', {
      anchored: null, activeTabId: 'tab-1', isMine: () => false, isCurrentView: () => true,
    });
    expect(legacy.tabId, '★ 省略新 opts 时行为变了 → 旧调用方/旧测试被牵连').toBe('tab-1');
  });

  it('★★★ main.cjs 必须把归属判据接进 resolveTarget（否则第三层是死代码）', () => {
    const m = strip(MAIN);
    const i = m.indexOf('resolveBrowserTarget(convId, tabId, action, {');
    expect(i, '★ 锚点缺失：目标解析调用').toBeGreaterThan(-1);
    const seg = m.slice(i, i + 1400);
    expect(seg, '★ 未传 isOwnedByOther → 跨会话回落抢页仍有缝').toMatch(/isOwnedByOther:/);
    expect(seg, '★ 归属真相源必须是 agentTouchedTabs').toMatch(/agentTouchedTabs\.get\(/);
    expect(seg, '★★ 归属口径必须是 **flowKey**（拿 convId 比 → 同一会话的另一条流被误判成"别人的页"）')
      .toMatch(/owner !== flowKey/);
  });
});
