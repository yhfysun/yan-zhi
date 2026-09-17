// 模式状态：四模式（office / dev / ops / sec）+ 各模式主导方（lead）。
//
// ★ 契约固化（决策 10）：模式是【同一份工作上下文的四个视图】——
//   - 模式不持有会话池：四模式共用 chatStore.currentConvId，setMode() 禁止新建会话/清消息/换 spaceId
//   - 模式不持有工作目录：统一读 settings.workspaceDir（code.ts 的 projectDir 与之双向同步）
//   - 界面状态（编辑器标签 openFiles / OpsConsole 的 windows）各自保留，不随模式切换丢失
//   - 「共享的是上下文，不是界面状态」
import { ref, computed, watch, type ComputedRef, type Ref } from 'vue';

export type AppMode = 'office' | 'dev' | 'ops' | 'sec';
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

export const MODE_DEFS: ModeDef[] = [
  { key: 'office', label: '办公模式', icon: 'ChatDotRound', desc: '文档 · 表格 · 岗位模板', route: '/chat' },
  { key: 'dev', label: '开发模式', icon: 'Monitor', desc: '写代码 · 改 Bug · 读项目', route: '/code' },
  // pluginId 必须与插件 manifest.id 完全一致（ops-shell / sec-lab），
  // 写成 'ops' / 'sec' 会导致插件明明已启用却判定为「未启用」而置灰。
  { key: 'ops', label: '运维模式', icon: 'Platform', desc: '服务器 · Docker · 数据库', route: '/ops', pluginId: 'ops-shell', desktopOnly: true },
  { key: 'sec', label: '安全模式', icon: 'Lock', desc: '侦察 · 扫描 · 审计', route: '/sec', pluginId: 'sec-lab', desktopOnly: true },
];

const MODE_KEY = 'yz:mode';
const LEGACY_CODE_KEY = 'yz:code:active';
const LEAD_KEY = 'yz:mode:lead';

/** 主导方默认值（决策 4 / 决策记录 #5）：办公无 lead；dev 默认编辑器居中（= 现状）；ops/sec 默认命令模式 */
const LEAD_DEFAULTS: Record<AppMode, LeadMode | null> = {
  office: null,
  dev: 'human',
  ops: 'human',
  sec: 'human',
};

function readStoredMode(): AppMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v && MODE_DEFS.some((d) => d.key === v)) return v as AppMode;
    // 旧标记迁移：yz:code:active === '1' → dev，随后删除旧键
    if (localStorage.getItem(LEGACY_CODE_KEY) === '1') {
      localStorage.setItem(MODE_KEY, 'dev');
      localStorage.removeItem(LEGACY_CODE_KEY);
      return 'dev';
    }
    return 'office';
  } catch {
    return 'office';
  }
}

function readStoredLeads(): Record<AppMode, LeadMode | null> {
  const out: Record<AppMode, LeadMode | null> = { ...LEAD_DEFAULTS };
  try {
    const raw = localStorage.getItem(LEAD_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Partial<Record<AppMode, LeadMode>>;
    for (const d of MODE_DEFS) {
      const v = parsed[d.key];
      if (d.key === 'office') continue; // 办公无 lead，持久化里也不读
      if (v === 'ai' || v === 'human') out[d.key] = v;
    }
  } catch { /* 坏数据回默认 */ }
  return out;
}

// 模块级单例（router guard 在 pinia 就绪前也要读，与 code.ts 的 CODE_MODE_KEY 同思路，不依赖 pinia）
export const activeMode: Ref<AppMode> = ref(readStoredMode());
const leads: Ref<Record<AppMode, LeadMode | null>> = ref(readStoredLeads());

// 持久化（模块级 watch，导入即生效，无需组件挂载）
watch(activeMode, (m) => {
  try {
    localStorage.setItem(MODE_KEY, m);
    if (m !== 'dev') localStorage.removeItem(LEGACY_CODE_KEY);
  } catch { /* 隐私模式忽略 */ }
});
watch(leads, (v) => {
  try {
    // 只存有 lead 的三个模式
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
  activeMode.value = m;
}

export function modeDefOf(m: AppMode): ModeDef {
  return MODE_DEFS.find((d) => d.key === m) || MODE_DEFS[0];
}

export function modeRoute(m: AppMode): string {
  return modeDefOf(m).route;
}

export function leadOf(m: AppMode): LeadMode {
  return leads.value[m] || (LEAD_DEFAULTS[m] ?? 'ai');
}

export function setLead(m: AppMode, lead: LeadMode): void {
  if (m === 'office') return; // 办公模式无 lead
  leads.value = { ...leads.value, [m]: lead };
}

export const activeLead: ComputedRef<LeadMode> = computed(() => leadOf(activeMode.value));

/** 对话位置排布（决策 3.1 形态矩阵） */
export function chatPlacementOf(m: AppMode, lead: LeadMode): ChatPlacement {
  if (m === 'office') return 'center';
  if (m === 'dev') return lead === 'ai' ? 'center' : 'right';
  return lead === 'ai' ? 'center' : 'inline'; // ops / sec
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
  };
}
