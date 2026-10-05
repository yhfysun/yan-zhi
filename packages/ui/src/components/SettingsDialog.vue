<!--
  SettingsDialog.vue — 桌面端「侧导航居中大弹窗」设置（Task 10.3）

  与 SettingsDrawer.vue 的分工：
    · 本组件：桌面端入口（WebTopBar 头像菜单 /「更多」菜单）打开的居中大弹窗
      （宽 min(900px, 92vw)、高 80vh 内滚动、ESC / 遮罩点击关闭）；
    · SettingsDrawer：移动端 TabBar「我的」与代码模式侧栏「开发环境」的右侧抽屉，保持不动。
  两者共用同一批内容组件：Settings.vue（经 pane 属性直取单个分区）与
  Models / LocalSkillMarket / ToolMarket 三个既有视图，不复制任何业务逻辑。

  分类沿用既有 tab / 分区收敛：通用 / 外观皮肤 / 模型服务 / 技能 / 工具与连接 /
  数据 / 钩子 / 商城服务端 / 局域网（+ 记忆管理 / 语音包 / 日志 / 关于，不删功能）。
-->
<template>
  <Teleport to="body">
    <Transition name="settings-dialog">
      <div v-if="open" class="settings-dialog-mask" @click.self="close">
        <section class="settings-dialog" role="dialog" aria-modal="true" aria-label="设置">
          <header class="sd-header">
            <span class="sd-title">设置</span>
            <button type="button" class="sd-close" aria-label="关闭设置" @click="close">
              <el-icon :size="18"><Close /></el-icon>
            </button>
          </header>

          <div class="sd-body">
            <nav class="sd-nav" aria-label="设置分类">
              <button
                v-for="c in categories"
                :key="c.key"
                type="button"
                class="sd-nav-item"
                :class="{ active: active === c.key }"
                @click="active = c.key"
              >
                <el-icon :size="16"><component :is="c.icon" /></el-icon>
                <span>{{ c.label }}</span>
              </button>
            </nav>

            <div class="sd-content">
              <!-- Settings.vue 的分区：一个实例承载全部分区（el-tabs 惰性挂载，切换保状态） -->
              <Settings v-if="activeCat?.pane" :embedded="true" :pane="activeCat.pane" />
              <!-- 独立视图分区：模型服务 / 技能 / 工具与连接（与 SettingsDrawer 同一批组件） -->
              <component :is="asyncComps[activeCat!.comp!]" v-else-if="activeCat?.comp" />
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted } from 'vue';
import {
  Setting, MagicStick, Cpu, Files, Suitcase, FolderOpened, SetUp,
  Shop, Monitor, Memo, Microphone, Document, InfoFilled, Close,
} from '@element-plus/icons-vue';
// Settings.vue 走异步组件：保持与 /settings 路由、SettingsDrawer 相同的懒加载分包，
// 不因弹窗常驻 App 壳而把它拉进首包。
const Settings = defineAsyncComponent(() => import('../views/Settings.vue'));
import { settingsDialogOpen, settingsDialogCategory, closeSettingsDialog } from '../composables/useSettingsDialog';

interface SettingsCategory {
  key: string;
  label: string;
  icon: unknown;
  /** Settings.vue 的 tab 名（el-tab-pane name） */
  pane?: string;
  /** 独立视图组件 key（见 asyncComps） */
  comp?: 'models' | 'skills' | 'tools';
}

const categories: SettingsCategory[] = [
  { key: 'general', label: '通用', icon: Setting, pane: 'general' },
  { key: 'skin', label: '外观皮肤', icon: MagicStick, pane: 'skin' },
  { key: 'models', label: '模型服务', icon: Cpu, comp: 'models' },
  { key: 'skills', label: '技能', icon: Files, comp: 'skills' },
  { key: 'tools', label: '工具与连接', icon: Suitcase, comp: 'tools' },
  { key: 'data', label: '数据', icon: FolderOpened, pane: 'data' },
  { key: 'userhooks', label: '钩子', icon: SetUp, pane: 'userhooks' },
  { key: 'marketplace', label: '商城服务端', icon: Shop, pane: 'marketplace' },
  { key: 'lan', label: '局域网', icon: Monitor, pane: 'lan' },
  { key: 'memory', label: '记忆管理', icon: Memo, pane: 'memory' },
  { key: 'voicepack', label: '语音包', icon: Microphone, pane: 'voicepack' },
  { key: 'logs', label: '日志', icon: Document, pane: 'logs' },
  { key: 'about', label: '关于', icon: InfoFilled, pane: 'about' },
];

const asyncComps = {
  models: defineAsyncComponent(() => import('../views/Models.vue')),
  skills: defineAsyncComponent(() => import('../views/skill-market/LocalSkillMarket.vue')),
  tools: defineAsyncComponent(() => import('../views/ToolMarket.vue')),
};

const open = computed(() => settingsDialogOpen.value);
const active = computed({
  get: () => settingsDialogCategory.value,
  set: (v: string) => { settingsDialogCategory.value = v; },
});
const activeCat = computed(() => categories.find((c) => c.key === active.value) || categories[0]);

function close() {
  closeSettingsDialog();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && settingsDialogOpen.value) closeSettingsDialog();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.settings-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay, 3000);
  display: flex;
  align-items: center;
  justify-content: center;
  /* 与 overlay.css 遮罩同一节奏：纯色半透，不加模糊 */
  background: var(--el-mask-color, rgba(0, 0, 0, 0.5));
}

.settings-dialog {
  display: flex;
  flex-direction: column;
  width: min(900px, 92vw);
  height: min(80vh, 760px);
  overflow: hidden;
  background: var(--glass-bg, #fff);
  color: var(--color-text, #1a1a1a);
  border: 1px solid var(--glass-border, #e7e4dc);
  /* 弹窗圆角统一 12px（--radius-card），阴影统一模态档 --shadow-3 */
  border-radius: var(--radius-card, 12px);
  box-shadow: var(--shadow-3, 0 16px 48px rgba(26, 26, 26, 0.16));
}

.sd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter, var(--glass-border, #e7e4dc));
  flex-shrink: 0;
}

.sd-title {
  font-size: var(--font-size-lg, 16px);
  font-weight: 600;
}

.sd-close {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-md, 10px);
  background: transparent;
  color: var(--color-text-secondary, #6b6b66);
  cursor: pointer;
  transition: background-color var(--motion-fast, 120ms) ease, color var(--motion-fast, 120ms) ease;
}

.sd-close:hover {
  background: var(--glass-bg-hover, #f1efe9);
  color: var(--color-text, #1a1a1a);
}

.sd-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.sd-nav {
  width: 172px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 8px;
  overflow-y: auto;
  border-right: 1px solid var(--glass-border, #e7e4dc);
  background: var(--glass-bg-hover, #f7f5f0);
}

.sd-nav-item {
  height: 36px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  flex-shrink: 0;
  border: none;
  border-radius: var(--radius-md, 10px);
  background: transparent;
  color: var(--color-text-secondary, #6b6b66);
  font-size: var(--font-size-base, 13px);
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background-color var(--motion-fast, 120ms) ease, color var(--motion-fast, 120ms) ease;
}

.sd-nav-item:hover {
  background: var(--glass-bg-hover, #f1efe9);
  color: var(--color-text, #1a1a1a);
}

.sd-nav-item.active {
  background: color-mix(in srgb, var(--color-primary, #7c9aad) 12%, transparent);
  color: var(--color-primary, #7c9aad);
  font-weight: 650;
}

.sd-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 20px 20px 24px;
}

/* 内嵌视图的路由页骨架（.page/.page-title）在弹窗内摊平，避免双层留白与大标题 */
.sd-content :deep(.page) {
  padding: 0 !important;
  min-height: 0;
  overflow: visible;
}
.sd-content :deep(.page-title) {
  display: none;
}
.sd-content :deep(.page-header) {
  margin-bottom: 14px;
  justify-content: flex-end;
  gap: 8px;
}
.sd-content :deep(.page-top) {
  margin-bottom: 14px;
}
.sd-content :deep(.page-top .page-info) {
  display: none;
}
/* Settings.vue 分区模式：tab 头已由左侧导航承担 */
.sd-content :deep(.glass-tabs) {
  background: transparent;
  border: none;
  padding: 0;
}

@media (max-width: 767px) {
  .settings-dialog {
    width: 100vw;
    height: 100vh;
    border-radius: 0;
    border: none;
  }
  .sd-nav { width: 132px; padding: 8px 6px; }
  .sd-nav-item { height: 40px; padding: 0 10px; gap: 8px; font-size: var(--font-size-sm, 12px); }
  .sd-content { padding: 14px 12px 20px; }
}
</style>

<style>
.settings-dialog-enter-active,
.settings-dialog-leave-active {
  transition: opacity var(--motion-base, 180ms) ease;
}
.settings-dialog-enter-active .settings-dialog,
.settings-dialog-leave-active .settings-dialog {
  transition: transform var(--motion-slow, 240ms) var(--ease-entrance, cubic-bezier(0.16, 1, 0.3, 1));
}
.settings-dialog-enter-from,
.settings-dialog-leave-to {
  opacity: 0;
}
.settings-dialog-enter-from .settings-dialog,
.settings-dialog-leave-to .settings-dialog {
  transform: scale(0.96) translateY(12px);
}
</style>
