<template>
  <!-- ★ 移动端模式切换（2026-11-15 用户实报「缺少办公学习模式切换按钮」）：
       移动端只有 office / learning 两个模式（mode.ts MOBILE_ALLOWED_MODES 白名单），
       桌面的 ModeSwitcher 挂在侧栏（移动端不渲染）⇒ 手机上没有任何切换入口。
       本组件放 mobile-topbar / ChatTopbar，选项来自 visibleModeDefs（授权+平台白名单
       的唯一出口），点击 = setMode + 跳该模式路由 —— 与桌面同语义，不另设判定。 -->
  <el-dropdown trigger="click" @command="onPick">
    <!-- ★ 用「当前模式名」文字 pill 而非图标（2026-11-15 真机反馈：图标撞脸看不见），
         文字按钮自解释，用户一眼知道这是模式入口 -->
    <button class="mode-pill" type="button" :aria-label="`当前模式：${currentLabel}，点击切换`">
      <el-icon :size="14"><component :is="currentIcon" /></el-icon>
      <span class="mode-pill-text">{{ currentShort }}</span>
    </button>
    <template #dropdown>
      <el-dropdown-menu>
        <div class="user-dropdown-header">
          <span class="user-dropdown-name">切换模式</span>
        </div>
        <el-dropdown-item
          v-for="d in visibleDefs"
          :key="d.key"
          :command="d.key"
          :class="{ 'is-active-mode': d.key === currentMode }"
        >
          <el-icon><component :is="iconOf(d.icon)" /></el-icon>
          <span>{{ d.label }}</span>
          <el-icon v-if="d.key === currentMode" class="mode-check"><Check /></el-icon>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import { Reading, ChatDotRound, Check } from '@element-plus/icons-vue';
// ★ 直接用模块级导出（ref/computed 类型完整）；useModeStore 单例对象的字段类型
//   在 vue-tsc 下退化（.find 报 not callable），且本组件只用这四个导出。
import { visibleModeDefs, activeMode, setMode, modeRoute } from '../stores/mode';

const visibleDefs = visibleModeDefs;
const currentMode = activeMode;

const ICONS: Record<string, Component> = { ChatDotRound, Reading };
function iconOf(name: string): Component {
  return ICONS[name] || ChatDotRound;
}

const currentLabel = computed(
  () => visibleDefs.value.find((d) => d.key === currentMode.value)?.label || '办公模式',
);
/** 顶栏 pill 用短名（「办公模式」→「办公」），窄屏不挤 */
const currentShort = computed(() => currentLabel.value.replace(/模式$/, ''));
const currentIcon = computed(() => iconOf(currentLabel.value.includes('学习') ? 'Reading' : 'ChatDotRound'));

function onPick(key: string | number | object) {
  const m = String(key);
  if (m === currentMode.value) return;
  setMode(m);
  void import('../router').then(({ default: router }) => {
    void router.push(modeRoute(m)).catch(() => { /* 同路由重复跳转 */ });
  });
}
</script>

<style scoped>
.mode-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 40px;
  padding: 0 10px;
  border-radius: 14px;
  border: 1px solid var(--el-border-color, #dcdfe6);
  background: var(--el-bg-color, #fff);
  color: var(--el-text-color-primary, #303133);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}
.mode-pill:active { opacity: .7; }
.mode-pill-text { font-weight: 600; }
.mode-check { margin-left: auto; color: var(--el-color-primary); }
:deep(.el-dropdown-menu__item.is-active-mode) { color: var(--el-color-primary); font-weight: 600; }
</style>
