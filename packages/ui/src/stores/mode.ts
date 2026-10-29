// 模式状态：四模式（office / dev / ops / sec）+ 各模式主导方（lead）。
// 2026-10-12 曾增补 douyin（抖音运营模式），**2026-10-16 已移除**：它与 office 同为对话居中
//   形态、无独立工作台，属重复模式（用户拍板下线）。存量抖音会话由 db.ts 的迁移改判 office；
//   「抖音运营」能力本身（岗位卡 + 智能体 + 两个技能 + 任务类型）保留，只是不再占一个模式位。
//
// ★ 契约固化（决策 10）：模式是【同一份工作上下文的几个视图】——
//   - 模式不持有会话池：各模式共用 chatStore.currentConvId，setMode() 禁止新建会话/清消息/换 spaceId
//   - 模式不持有工作目录：统一读 settings.workspaceDir（code.ts 的 projectDir 与之双向同步）
//   - 界面状态（编辑器标签 openFiles / OpsConsole 的 windows）各自保留，不随模式切换丢失
//   - 「共享的是上下文，不是界面状态」
import { ref, computed, watch, type ComputedRef, type Ref } from 'vue';
import { BUILD_MODES, BUILD_MODE_DEFS } from '../generated/build-modes';
import { usePluginStore } from './plugin';

/** 构建期内置模式（type 只用于提示与兜底，运行时允许插件带来新 key） */
export type BaseMode = 'office' | 'dev' | 'ops' | 'sec' | 'wf' | 'clip' | 'shop';
/** 模式 key：内置之外，插件可贡献新模式（contributes.mode.key），故不是封闭联合 */
export type AppMode = BaseMode | (string & {});
/** 主导方：ai = 对话居中；human = 工作区居中（编辑器/终端/控制台），对话靠边 */
export type LeadMode = 'ai' | 'human';
/** 对话位置排布：center = 居中主视觉；right = 右栏；inline = 与控制台同区（折叠条/步骤卡） */
export type ChatPlacement = 'center' | 'right' | 'inline';

export interface ModeDef {
  key: AppMode;
  label: string;
  /** el-icon 组件名（由组件侧映射，store 保持纯数据可用 vue 图标名） */
  icon: string;
  desc: string;
  route: string;
  /** 依赖的插件 id（ops-shell / sec-lab）；undefined = 无插件依赖 */
  pluginId?: string;
  /** 插件路由是否 desktopOnly（移动端需置灰） */
  desktopOnly?: boolean;
}

/**
 * 模式定义来自**构建期生成文件**（scripts/select-modes.cjs）。
 *
 * ★ 不能在这里手写全量清单：未选模式的 label/desc/pluginId 字符串会随包泄露，
 *   而且入口会被误判为「有模式但没页面」。打包脚本按 `--modes` 只生成选中的定义。
 */
export const MODE_DEFS: ModeDef[] = BUILD_MODE_DEFS as unknown as ModeDef[];

/**
 * 运行时插件贡献的模式定义（P4：模式插件运行时装载）。
 *
 * 来源 = usePluginStore().modeDefs（服务端聚合 **enabled** 插件的 contributes.mode）。
 * 由 App.vue 在插件快照就绪/变化时调用 setRuntimeModeDefs 写入 —— 模块级 computed
 * 在这里读不到 pinia（本文件被启动早期代码 import），所以用写入式而不是直接依赖 store。
 *
 * ★ 同名 key 以构建期表为准：内置模式的 label/route 不因插件元数据漂移；
 *   但**新 key**（后装 .yzp 带来的模式）会并进来，路由由 syncPluginRoutes 动态注册。
 */
const runtimeDefs: Ref<ModeDef[]> = ref([]);

/** 写入运行时模式定义（App.vue 调；传空数组 = 清空）。返回实际并入的新模式 key。 */
export function setRuntimeModeDefs(defs: ModeDef[]): string[] {
  const built = new Set(MODE_DEFS.map((d) => d.key));
  const next: ModeDef[] = [];
  for (const d of defs || []) {
    if (!d || !d.key || !d.route || built.has(d.key)) continue;
    if (next.some((x) => x.key === d.key)) continue;
    next.push({
      key: d.key,
      label: d.label || d.key,
      icon: d.icon || 'Connection',
      desc: d.desc || '',
      route: d.route,
      pluginId: d.pluginId,
      desktopOnly: d.desktopOnly,
    });
  }
  runtimeDefs.value = next;
  // 启动时读到的未知模式若正是这次并入的插件模式 → 恢复（用户上次停在插件模式，重启后继续）
  if (pendingRuntimeMode) {
    const hit = next.some((d) => d.key === pendingRuntimeMode);
    if (hit && activeMode.value === 'office') activeMode.value = pendingRuntimeMode;
    pendingRuntimeMode = null;
  }
  // 当前模式若已不存在（插件被卸载/停用），回落到第一个可用模式，避免停在空壳上
  if (activeMode.value !== 'office' && !isModeBuilt(activeMode.value)) {
    activeMode.value = firstAvailableMode();
  }
  return next.map((d) => d.key);
}

/** 构建期 + 运行时（内置在前，顺序稳定：下拉/侧栏顺序由它决定）。 */
export const allModeDefs: ComputedRef<ModeDef[]> = computed(() => [...MODE_DEFS, ...runtimeDefs.value]);

/** 该模式是否**可用**（构建期编译进包 或 插件运行时贡献）——不看授权。 */
export function isModeBuilt(m: AppMode): boolean {
  return BUILD_MODES.includes(m) || runtimeDefs.value.some((d) => d.key === m);
}

const MODE_KEY = 'yz:mode';
const LEGACY_CODE_KEY = 'yz:code:active';
const LEAD_KEY = 'yz:mode:lead';

// ─────────────────── 版本档：模式可见性（授权分级） ───────────────────
//
// ★ 模式清单的唯一权威在**后端** `apps/server/src/license.ts` 的 `EDITION_MODES`。
//   前端只消费 `/api/license/verify` 返回的 `modes`（已算好「构建档 ∩ 授权档」），
//   绝不在这里再维护一份 —— 两处清单必然漂移，表现为「码升了但界面没放开」，
//   而且这种漂移只有真机换码才会暴露。
//
// 未拿到授权信息前（首屏、离线、接口失败）用「全可见」兜底而不是「全隐藏」：
// 隐藏会让首屏闪一下再补回（视觉抖动），且授权接口失败时用户会以为功能没了。
// 真正的硬约束在路由守卫与服务端，这里只是渲染收敛。

/** 授权放行的模式。null = 尚未拿到授权信息（此时不做收敛）。 */
const licensedModes: Ref<string[] | null> = ref(null);

/** 写入授权放行的模式（由 stores/license 在 init/activate 成功后调用）。 */
export function setLicensedModes(modes: string[] | null): void {
  licensedModes.value = Array.isArray(modes) && modes.length ? modes.slice() : null;
  // 当前模式一旦失权（换低档码）或未编译进本包，必须回落 —— 否则界面停在
  // 一个没有页面的模式上，工作台渲染空壳。
  if (licensedModes.value && !isModeAvailable(activeMode.value)) {
    activeMode.value = firstAvailableMode();
  }
}

/** 该模式是否被当前授权放行。未拿到授权信息时一律放行（见上方说明）。 */
export function isModeLicensed(m: AppMode): boolean {
  if (!licensedModes.value) return true;
  return licensedModes.value.includes(m);
}

/**
 * 该模式本次是否**可用** = 已编译进包 ∩ 授权放行。
 *
 * ★ 两个维度必须一起看：后端仍可能按授权档下发 ops，但若这个包是按
 *   `--modes=office,dev` 构建的，ops 入口/页面根本不存在，界面不能露出来。
 */
export function isModeAvailable(m: AppMode): boolean {
  return isModeBuilt(m) && isModeLicensed(m);
}

/** 当前可用模式里的第一个（回落落点）。 */
export function firstAvailableMode(): AppMode {
  const hit = allModeDefs.value.find((d) => isModeAvailable(d.key));
  return hit ? hit.key : allModeDefs.value[0]?.key ?? 'office';
}

/** 当前授权 + 构建下可见的模式定义（模式下拉 / 左栏入口都读它）。 */
export const visibleModeDefs: ComputedRef<ModeDef[]> = computed(() =>
  allModeDefs.value.filter((d) => isModeAvailable(d.key)),
);

/** 响应式暴露给组件（computed 直接用于模板）。 */
export const licensedModesRef = licensedModes;

/** 主导方默认值（决策 4 / 决策记录 #5）；运行时插件模式未声明时按 ai（对话居中） */
const LEAD_DEFAULTS: Partial<Record<BaseMode, LeadMode | null>> = {
  office: null,
  dev: 'human',
  ops: 'human',
  sec: 'human',
  wf: 'human', // 默认运行模式（人工填参执行），调试优先
  clip: 'human', // 默认时间轴居中（人工剪），要 AI 主导时切到 ai
  shop: 'human', // 默认店铺列表/工作台居中（人工主导），要 AI 主导时切到 ai
};

/**
 * 启动时读到、但当时还没有定义的模式 key（多半是后装插件带来的运行时模式）。
 * 快照到达后 setRuntimeModeDefs 里再恢复 —— 直接放行任意字符串会把脏值
 * （如历史坏数据 `gibberish`）当合法模式，故启动阶段仍按「已知定义」严格判定。
 */
let pendingRuntimeMode: string | null = null;

function readStoredMode(): AppMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v && MODE_DEFS.some((d) => d.key === v)) return v as AppMode;
    // 形态合法但不是内置模式：先记下，等插件快照确认（是插件模式才恢复）
    if (v && MODE_KEY_RE.test(v) && v !== 'douyin') pendingRuntimeMode = v;
    // 旧标记迁移：yz:code:active === '1' → dev，随后删除旧键
    // （dev 未编译进本包时直接丢弃该标记，避免落到一个不存在的路由）
    if (localStorage.getItem(LEGACY_CODE_KEY) === '1') {
      localStorage.removeItem(LEGACY_CODE_KEY);
      if (isModeBuilt('dev')) {
        localStorage.setItem(MODE_KEY, 'dev');
        return 'dev';
      }
    }
    return 'office';
  } catch {
    return 'office';
  }
}

/** 模式 key 形态（与后端 runtime-modes / 插件 id 同构）：小写字母开头，可带数字与连字符。 */
const MODE_KEY_RE = /^[a-z][a-z0-9-]{1,31}$/;

function readStoredLeads(): Record<string, LeadMode | null> {
  const out: Record<string, LeadMode | null> = { ...LEAD_DEFAULTS };
  try {
    const raw = localStorage.getItem(LEAD_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Partial<Record<AppMode, LeadMode>>;
    for (const d of MODE_DEFS) {
      const v = parsed[d.key];
      // 无 lead 的模式（仅 office）：持久化里也不读，避免脏数据造出个 lead 切换器
      if (d.key === 'office') continue;
      if (v === 'ai' || v === 'human') out[d.key] = v;
    }
  } catch { /* 坏数据回默认 */ }
  return out;
}

// 模块级单例（router guard 在 pinia 就绪前也要读，与 code.ts 的 CODE_MODE_KEY 同思路，不依赖 pinia）
export const activeMode: Ref<AppMode> = ref(readStoredMode());
const leads: Ref<Record<string, LeadMode | null>> = ref(readStoredLeads());

// 持久化（模块级 watch，导入即生效，无需组件挂载）
watch(activeMode, (m) => {
  try {
    localStorage.setItem(MODE_KEY, m);
    if (m !== 'dev') localStorage.removeItem(LEGACY_CODE_KEY);
  } catch { /* 隐私模式忽略 */ }
});
watch(leads, (v) => {
  try {
    // 只存有 lead 的模式（office 无 lead，不落持久化）
    const slim: Partial<Record<AppMode, LeadMode>> = {};
    for (const d of MODE_DEFS) {
      if (d.key === 'office') continue;
      const lv = v[d.key];
      if (lv) slim[d.key] = lv;
    }
    localStorage.setItem(LEAD_KEY, JSON.stringify(slim));
  } catch { /* 隐私模式忽略 */ }
}, { deep: true });

export function setMode(m: AppMode): void {
  // 未编译/未贡献的模式不切换：调用方若来自历史持久化/外部链接，切过去只会得到空工作台。
  if (!isModeBuilt(m)) return;
  activeMode.value = m;
}

export function modeDefOf(m: AppMode): ModeDef {
  return allModeDefs.value.find((d) => d.key === m) || allModeDefs.value[0];
}

/**
 * ★ 模式运行时化（P3）：插件贡献的模式元数据（contributes.mode）。
 * 来自插件快照（usePluginStore.modeDefs，服务端聚合 enabled 插件下发）——
 * fallbackAgent/label/icon 的运行时真相源；找不到（基座一等模式/插件未启用）返回 undefined，
 * 调用方回落构建期表。pinia 未就绪时静默回落（模块级代码在启动早期也会 import 本文件）。
 */
export function pluginModeMeta(key: string): import('./plugin').PluginModeDef | undefined {
  try {
    // 静态导入 + 调用期取 store：模块加载期不触 pinia（mode.ts 被启动早期代码 import）
    return usePluginStore().modeDefs.find((m) => m.key === key);
  } catch {
    return undefined;
  }
}

export function modeRoute(m: AppMode): string {
  return modeDefOf(m).route;
}

export function leadOf(m: AppMode): LeadMode {
  const stored = leads.value[m];
  if (stored) return stored;
  // office 无 lead（表里是 null），但对外仍返回 ai 兜底；插件模式未声明时同样 ai
  const dflt = LEAD_DEFAULTS[m as BaseMode];
  return (dflt ?? 'ai') as LeadMode;
}

export function setLead(m: AppMode, lead: LeadMode): void {
  // 无 lead 的模式：办公（对话居中，没有「人主导 vs AI 主导」的切换）
  if (m === 'office') return;
  leads.value = { ...leads.value, [m]: lead };
}

export const activeLead: ComputedRef<LeadMode> = computed(() => leadOf(activeMode.value));

/** 对话位置排布（决策 3.1 形态矩阵）；运行时插件模式读其 contributes.mode.chatPlacement */
export function chatPlacementOf(m: AppMode, lead: LeadMode): ChatPlacement {
  if (m === 'office') return 'center';
  if (m === 'dev') return lead === 'ai' ? 'center' : 'right';
  if (m === 'wf') return lead === 'ai' ? 'center' : 'right'; // 运行模式：运行台居中 + 对话在右
  if (m === 'clip') return lead === 'ai' ? 'center' : 'right'; // 剪辑模式：时间轴居中 + 对话在右
  const meta = pluginModeMeta(m);
  if (meta?.chatPlacement) return meta.chatPlacement === 'side' ? 'right' : 'center';
  return lead === 'ai' ? 'center' : 'inline'; // ops / sec / shop（控制台型：工作区居中，对话与控制台同区）
}

// ===== 兼容层：原「代码模式标记」薄封装（调用方 4 处不改行为）=====
// isCodeModeActive / setCodeModeActive 语义不变，改由 activeMode 驱动。
// 注意：stores/code.ts 仍导出这两个函数（其内部转发到这里），避免一次性改调用方。
export function isCodeModeActiveCompat(): boolean {
  return activeMode.value === 'dev';
}

export function setCodeModeActiveCompat(active: boolean): void {
  if (active) activeMode.value = 'dev';
  else if (activeMode.value === 'dev') activeMode.value = 'office';
}

/** 响应式模式标记（供组件 v-if / v-show 判断；替代 code.ts 的 codeModeActiveRef） */
export const activeModeRef = activeMode;

export const useModeStore = defineModeStore();
function defineModeStore() {
  return {
    activeMode,
    leads,
    activeLead,
    setMode,
    setLead,
    leadOf,
    modeDefOf,
    modeRoute,
    chatPlacementOf,
    // 版本档：模式可见性
    licensedModes: licensedModesRef,
    visibleModeDefs,
    setLicensedModes,
    isModeLicensed,
    // 构建期裁剪：该模式是否真的在这个包里
    isModeBuilt,
    isModeAvailable,
  };
}
