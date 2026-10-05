<template>
  <!-- 汉堡侧滑抽屉（spec「移动端导航与页面骨架」/ Task 11.1）：
       TabBar 承载高频页，低频入口（空间切换/定时任务/技能工具/设置）收进本抽屉。
       遮罩点击关闭；列表项 ≥44px 触控目标。
       ★ 路由均为 router/index.ts MOBILE_BLOCKED_PATHS 之外的移动端可用入口，
         不新造路由；空间切换/定时任务落在对话页侧栏抽屉（sideTab），不另起页面。 -->
  <Teleport to="body">
    <transition name="mnav">
      <div v-if="modelValue" class="mnav-mask" @click="close">
        <nav class="mnav-panel" role="dialog" aria-label="导航菜单" @click.stop>
          <div class="mnav-title">导航</div>
          <button
            v-for="it in items"
            :key="it.key"
            type="button"
            class="mnav-item"
            @click="it.run()"
          >
            <el-icon :size="18"><component :is="it.icon" /></el-icon>
            <span>{{ it.label }}</span>
          </button>
        </nav>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import { FolderOpened, Timer, Tools, Setting } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import { useChat } from '../composables/chat/useChat';

defineProps<{ modelValue: boolean }>();

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const router = useRouter();
const chat = useChat();

function close() {
  emit('update:modelValue', false);
}

/** 普通路由跳转；重复导航（已在目标页）静默吞掉 */
function go(path: string) {
  close();
  void router.push(path).catch(() => {});
}

/** 空间切换 / 定时任务：落到对话页并展开侧栏抽屉对应 tab（spaceStore 的空间树在侧栏里） */
function goChatTab(tab: 'chat' | 'task') {
  close();
  chat.sideTab.value = tab;
  chat.drawerOpen.value = true;
  void router.push('/chat').catch(() => {});
}

const items: Array<{ key: string; label: string; icon: Component; run: () => void }> = [
  { key: 'space', label: '空间切换', icon: FolderOpened, run: () => goChatTab('chat') },
  { key: 'cron', label: '定时任务', icon: Timer, run: () => goChatTab('task') },
  { key: 'tools', label: '技能工具', icon: Tools, run: () => go('/tools') },
  { key: 'settings', label: '设置', icon: Setting, run: () => go('/settings') },
];
</script>

<style scoped>
.mnav-mask {
  position: fixed;
  inset: 0;
  /* 高于顶栏(50)/TabBar(100)，低于弹窗层（9999） */
  z-index: 2600;
  background: var(--el-mask-color, rgba(0, 0, 0, 0.5));
}

.mnav-panel {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: min(78vw, 320px);
  background: var(--el-bg-color, #fff);
  box-shadow: var(--shadow-3);
  padding: calc(12px + env(safe-area-inset-top, 0px)) 8px calc(12px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mnav-title {
  padding: 8px 14px 6px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--color-text-tertiary);
  user-select: none;
}

.mnav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  /* 触控目标 ≥44px */
  min-height: 44px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  font-size: var(--font-size-md);
  font-family: inherit;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease-standard);
}
.mnav-item:active {
  background: var(--color-surface-hover);
}
.mnav-item .el-icon {
  color: var(--color-text-secondary);
}

.mnav-enter-active {
  transition: opacity var(--motion-base) var(--ease-standard);
}
.mnav-leave-active {
  transition: opacity var(--motion-fast) var(--ease-standard);
}
.mnav-enter-from,
.mnav-leave-to {
  opacity: 0;
}
.mnav-enter-active .mnav-panel {
  transition: transform var(--motion-slow) var(--ease-entrance);
}
.mnav-leave-active .mnav-panel {
  transition: transform var(--motion-base) var(--ease-standard);
}
.mnav-enter-from .mnav-panel,
.mnav-leave-to .mnav-panel {
  transform: translateX(-100%);
}
</style>
