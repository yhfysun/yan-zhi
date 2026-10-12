/**
 * 管理页面的搜索 / 分类筛选 —— **接线守门测试**
 *
 * 背景（用户实报 2026-10-12）：
 *   「管理模型 - 百炼大模型」弹窗模型一多就没法找 ——「这种管理页面啊很难用啊没有搜索分类」。
 *   随后全量审计发现同类问题：平台列表、语音包、工具钩子规则表、远程智能体列表
 *   都是**裸列**（只靠肉眼扫）。本轮统一补上搜索条（复用 components/common/SearchToolbar.vue）。
 *
 * ★ 为什么这一层只能是静态断言（本项目最贵判据第 1 条：断言「存在」≠ 断言「生效」）：
 *   这些 .vue 依赖 vue-router + pinia，vitest(environment: 'node') 下无法挂载，
 *   所以本文件只回答「**过滤条件有没有真正接到列表上**」——
 *   而这恰恰是最容易只做一半的地方：加了 computed 却忘了把 `v-for` / `:data` 换成过滤后数组，
 *   筛选条形同虚设且**不报任何错**。过滤语义本身由 utils/modelFilter.test.ts 真跑验证。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

function srcOf(rel: string): string {
  return readFileSync(path.resolve(here, rel), 'utf8');
}
/** 剥注释，避免注释里的字样被当成真代码（对齐 views/clipWorkbench.test.ts 的做法） */
function code(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
}

const MODELS = code(srcOf('../views/Models.vue'));
const AGENTS = code(srcOf('../views/Agents.vue'));
const VOICE = code(srcOf('../components/VoicePackPanel.vue'));
const HOOKS = code(srcOf('../components/settings/UserHooksPanel.vue'));
const PLATFORM_DETAIL = code(srcOf('../views/PlatformDetail.vue'));
// 第二轮补的（审计里的 B 类 + 拉取预览列表）
const MCP = code(srcOf('../components/McpPanel.vue'));
const DATA_SOURCES = code(srcOf('../views/DataSourcesPage.vue'));
const WORKFLOW = code(srcOf('../views/WorkflowWorkbench.vue'));
const DATA_CONSOLE = code(srcOf('../views/DataConsolePage.vue'));

/** 每个页面各自的关键信息：列表绑哪个数组、筛选变量叫什么 */
const PAGES = [
  { name: 'PlatformDetail（模型管理弹窗）', src: PLATFORM_DETAIL, filtered: 'filteredModels', legacy: 'v-for="m in models"', toolbar: 'SearchToolbar' },
  { name: 'Models（模型平台管理）', src: MODELS, filtered: 'filteredPlatforms', legacy: 'v-for="p in store.platforms"', toolbar: 'SearchToolbar' },
  { name: 'Agents（本地智能体）', src: AGENTS, filtered: 'visibleAgents', legacy: 'v-for="agent in g.agents"', toolbar: 'SearchToolbar' },
  { name: 'VoicePackPanel（语音包）', src: VOICE, filtered: 'filteredItems', legacy: 'v-for="it in items"', toolbar: 'SearchToolbar' },
  { name: 'UserHooksPanel（工具钩子规则）', src: HOOKS, filtered: 'filteredHooks', legacy: ':data="hooks"', toolbar: 'SearchToolbar' },
];

describe('管理页面 · 搜索条存在（每个页面都得有）', () => {
  it.each(PAGES)('$name 有搜索/筛选条', ({ src, toolbar }) => {
    // 搜索条必须真在模板里（而不是只在 script 里定义状态）
    expect(src).toContain(toolbar);
  });

  it.each(PAGES)('$name 的搜索条组件已 import（不 import = 未注册 = 静默不渲染）', ({ src }) => {
    expect(src).toMatch(/import SearchToolbar from '\.\.?\/[\w/]*SearchToolbar\.vue'/);
  });
});

describe('管理页面 · ★ 过滤真的接到了列表上（只加 computed 却没换 v-for = 筛选条形同虚设）', () => {
  it('PlatformDetail：卡片遍历 filteredModels 而非 models', () => {
    expect(PLATFORM_DETAIL).toMatch(/v-for="m in filteredModels"/);
    expect(PLATFORM_DETAIL).not.toMatch(/v-for="m in models"/);
  });

  it('Models：平台卡遍历 filteredPlatforms 而非 store.platforms', () => {
    expect(MODELS).toMatch(/v-for="p in filteredPlatforms"/);
    expect(MODELS).not.toMatch(/v-for="p in store\.platforms"/);
  });

  it('Agents：分组数据源是 visibleAgents（关键字搜索收口在分类过滤里）', () => {
    // groupedAgents 是唯一渲染源，它遍历 visibleAgents ⇒ 搜索经 visibleAgents 生效
    expect(AGENTS).toMatch(/for \(const a of visibleAgents\.value\)/);
    expect(AGENTS).toMatch(/const visibleAgents = computed\(/);
    // 关键字必须并进 visibleAgents，而不是另开一条旁路
    expect(AGENTS).toMatch(/visibleAgents = computed\(\(\) => \{[\s\S]*?agentKeyword\.value/);
  });

  it('Agents：远程列表遍历 filteredRemoteAgents 而非 remoteAgentItems', () => {
    expect(AGENTS).toMatch(/v-for="item in filteredRemoteAgents"/);
    expect(AGENTS).not.toMatch(/v-for="item in remoteAgentItems"/);
  });

  it('VoicePackPanel：遍历 filteredItems 而非 items', () => {
    expect(VOICE).toMatch(/v-for="it in filteredItems"/);
    expect(VOICE).not.toMatch(/v-for="it in items"/);
  });

  it('UserHooksPanel：表格 :data 吃 filteredHooks 而非 hooks', () => {
    expect(HOOKS).toMatch(/:data="filteredHooks"/);
    expect(HOOKS).not.toMatch(/:data="hooks"/);
  });
});

describe('管理页面 · 有分类维度的必须给筛选控件（不是只给个搜索框）', () => {
  it('PlatformDetail：类型筛选下拉存在，且选项来自真实类型（不列零项）', () => {
    expect(PLATFORM_DETAIL).toMatch(/v-model="modelTypeFilter"/);
    expect(PLATFORM_DETAIL).toMatch(/v-for="t in modelTypeOptions"/);
  });

  it('Models：协议 + 状态两个筛选下拉都在', () => {
    expect(MODELS).toMatch(/v-model="protocolFilter"/);
    expect(MODELS).toMatch(/v-model="statusFilter"/);
  });

  it('VoicePackPanel：安装状态筛选下拉存在', () => {
    expect(VOICE).toMatch(/v-model="installFilter"/);
    expect(VOICE).toMatch(/label="已安装" value="installed"/);
  });

  it('UserHooksPanel：动作 + 启用状态两个筛选下拉都在', () => {
    expect(HOOKS).toMatch(/v-model="hookActionFilter"/);
    expect(HOOKS).toMatch(/v-model="hookEnabledFilter"/);
  });
});

describe('管理页面 · 筛选态为空时不能留白面板', () => {
  it.each(PAGES)('$name 无匹配时给空态而不是空白页', ({ src }) => {
    // 空态条件必须基于「过滤后」数组，否则筛不出东西时用户看到的是"页面坏了"
    // 注意：过滤后数组在 script 里通常带 .value（computed ref）
    expect(src).toMatch(/(filteredModels|filteredPlatforms|visibleAgents|filteredItems|filteredRemoteAgents|filteredHooks)(\.value)?\.length === 0/);
  });
});

describe('第二轮（B 类 + 拉取预览列表）· 同样必须真的接到列表上', () => {
  it('Models：拉取预览列表遍历 filteredFetchedModels 而非全量 fetchedModels', () => {
    expect(MODELS).toMatch(/v-for="m in filteredFetchedModels"/);
    expect(MODELS).not.toMatch(/v-for="m in fetchedModels"/);
    expect(MODELS).toMatch(/v-model="fetchedKeyword"/);
  });

  it('★ Models：全选只作用于**当前可见项**，不会因筛选丢掉此前勾上的模型', () => {
    const fn = MODELS.match(/function onCheckAll\(val: any\)\s*\{([\s\S]*?)\n\}/);
    expect(fn).toBeTruthy();
    // 必须走"并集/差集"而不是整体替换：整体替换会把别的筛选条件下勾的模型清掉
    expect(fn![1]).toMatch(/visibleFetchedIds|visible/);
    expect(fn![1]).toMatch(/\[\.\.\.new Set\(\[|filter\(\(id\) => !visible/);
  });

  it('McpPanel：凭证 tab 与访问凭证 tab 都换成过滤后数组', () => {
    // ★ 只钉"列表行"那一处：新增服务表单里的凭证下拉**应该**列全量凭证供选择
    //   （`<el-option v-for="c in store.credentials" ... :value="c.id">`），不能一起改。
    //   区分特征：列表行是 ToggleListRow，同一行带 `:title="c.name"`。
    expect(MCP).toMatch(/v-for="c in filteredCredentials" :key="c\.id" :title="c\.name"/);
    expect(MCP).not.toMatch(/v-for="c in store\.credentials" :key="c\.id" :title="c\.name"/);
    expect(MCP).toMatch(/v-for="k in filteredAccessKeys"/);
    expect(MCP).not.toMatch(/v-for="k in store\.accessKeys"/);
  });

  it('DataSourcesPage：类型 + 来源两个筛选都收口在 filtered', () => {
    expect(DATA_SOURCES).toMatch(/typeFilter\.value && d\.type !== typeFilter\.value/);
    expect(DATA_SOURCES).toMatch(/originFilter\.value === 'builtin'/);
    expect(DATA_SOURCES).toMatch(/v-for="ds in filtered"/);
  });

  it('WorkflowWorkbench：运行状态筛选并进 filtered（含"从未运行"档）', () => {
    expect(WORKFLOW).toMatch(/runStatusFilter\.value && st !== runStatusFilter\.value/);
    expect(WORKFLOW).toMatch(/a\.lastRun\?\.status \|\| 'none'/);
    expect(WORKFLOW).toMatch(/v-model="runStatusFilter"/);
  });

  it('DataConsolePage：表/视图筛选先于关键字生效', () => {
    expect(DATA_CONSOLE).toMatch(/schemaKindFilter\.value\s*\n?\s*\? tables\.value\.filter/);
    expect(DATA_CONSOLE).toMatch(/v-model="schemaKindFilter"/);
  });
});

describe('管理页面 · 筛选中可一键复位', () => {
  it('UserHooksPanel 的空态文案区分「真没有」与「被筛掉」（表格用 empty-text）', () => {
    expect(HOOKS).toMatch(/const emptyText = computed/);
    expect(HOOKS).toMatch(/filteredHooks\.value\.length === 0\)\s*return '没有匹配的规则/);
    expect(HOOKS).toMatch(/:empty-text="emptyText"/);
  });

  it('Models / VoicePackPanel / UserHooksPanel 都有「重置」按钮', () => {
    for (const [src, fn] of [
      [MODELS, 'clearPlatformFilter'],
      [VOICE, 'clearPackFilter'],
      [HOOKS, 'clearHookFilter'],
      [PLATFORM_DETAIL, 'clearModelFilter'],
    ] as const) {
      expect(src).toContain(`@click="${fn}"`);
      // 重置必须把所有筛选条件一起清空 —— 只清一个的话用户会以为"点了没用"
      const body = src.match(new RegExp(`function ${fn}\\(\\)\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] || '';
      expect(body).toMatch(/\.value = '';/);
    }
  });
});

describe('管理页面 · 列表区独立滚动（筛选条固定顶部，不被内容顶走）', () => {
  it('Agents：内容区限高滚动，搜索条固定', () => {
    const css = srcOf('../views/Agents.vue');
    expect(css).toMatch(/\.agents-content\s*\{[^}]*max-height:[^}]*overflow|flex-direction:\s*column/);
  });

  it('VoicePackPanel：.vp-list 限高独立滚动（原来无上限，会把筛选条顶出视口）', () => {
    expect(srcOf('../components/VoicePackPanel.vue')).toMatch(/\.vp-list\s*\{[^}]*max-height:[^}]*overflow-y:\s*auto/);
  });

  it('UserHooksPanel：表格有 max-height（长规则表不会撑出弹窗）', () => {
    expect(HOOKS).toMatch(/max-height="420"/);
  });
});
