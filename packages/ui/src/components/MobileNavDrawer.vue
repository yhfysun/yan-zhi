<template>
  <Teleport to="body">
    <Transition name="mnav">
      <div v-if="modelValue" class="mnav-mask" @click="close">
        <nav class="mnav-panel" role="dialog" aria-modal="true" aria-label="更多功能" @click.stop>
          <header class="mnav-head">
            <span class="mnav-brand">言</span>
            <div>
              <strong>言智</strong>
              <small>工作入口与偏好</small>
            </div>
            <button type="button" class="mnav-close" aria-label="关闭更多功能" @click="close">
              <el-icon :size="18"><Close /></el-icon>
            </button>
          </header>

          <div class="mnav-group">
            <div class="mnav-group-title">工作</div>
            <button
              v-for="it in workItems"
              :key="it.key"
              type="button"
              class="mnav-item"
              @click="it.run()"
            >
              <span class="mnav-item-icon"><el-icon :size="18"><component :is="it.icon" /></el-icon></span>
              <span class="mnav-item-copy"><strong>{{ it.label }}</strong><small>{{ it.desc }}</small></span>
              <el-icon :size="14" class="mnav-arrow"><ArrowRight /></el-icon>
            </button>
          </div>

          <div class="mnav-group">
            <div class="mnav-group-title">偏好</div>
            <button type="button" class="mnav-item" @click="toggleTheme">
              <span class="mnav-item-icon">
                <el-icon :size="18"><component :is="settingsStore.settings.darkMode ? Sunny : Moon" /></el-icon>
              </span>
              <span class="mnav-item-copy">
                <strong>{{ settingsStore.settings.darkMode ? '浅色模式' : '深色模式' }}</strong>
                <small>切换显示主题</small>
              </span>
              <span class="mnav-theme-state">{{ settingsStore.settings.darkMode ? '深色' : '浅色' }}</span>
            </button>
            <button type="button" class="mnav-item" @click="go('/settings')">
              <span class="mnav-item-icon"><el-icon :size="18"><Setting /></el-icon></span>
              <span class="mnav-item-copy"><strong>设置</strong><small>模型、工具、通知与快捷键</small></span>
              <el-icon :size="14" class="mnav-arrow"><ArrowRight /></el-icon>
            </button>
          </div>

          <div class="mnav-account">
            <span class="mnav-avatar">{{ accountInitial }}</span>
            <span class="mnav-account-copy">
              <strong>{{ accountName }}</strong>
              <small>{{ isLocalClient ? '本机单用户工作区' : authStore.isLoggedIn ? '团队账号' : '未登录' }}</small>
            </span>
            <button v-if="authStore.isLoggedIn && !isLocalClient" type="button" class="mnav-login" @click="logout">
              退出
            </button>
            <button v-else-if="!isLocalClient" type="button" class="mnav-login" @click="go('/login')">
              登录
            </button>
          </div>
        </nav>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import {
  ArrowRight,
  Close,
  Files,
  FolderOpened,
  Moon,
  Setting,
  Sunny,
  Timer,
  Tools,
} from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import { useChat } from '../composables/chat/useChat';
import { useAuthStore } from '../stores/auth';
import { useSettingsStore } from '../stores/settings';
import { isLocalClient } from '../api/client';

defineProps<{ modelValue: boolean }>();

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const router = useRouter();
const chat = useChat();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();

const accountName = authStore.isLoggedIn && !isLocalClient
  ? authStore.user?.username || '账号'
  : '本机';
const accountInitial = accountName.slice(0, 1).toUpperCase();

function close() {
  emit('update:modelValue', false);
}

function go(path: string) {
  close();
  void router.push(path).catch(() => {});
}

function goChatTab(tab: 'chat' | 'task') {
  close();
  chat.sideTab.value = tab;
  chat.drawerOpen.value = true;
  void router.push('/chat').catch(() => {});
}

function toggleTheme() {
  settingsStore.update({ darkMode: !settingsStore.settings.darkMode });
}

function logout() {
  authStore.logout();
  close();
  window.setTimeout(() => {
    window.location.href = '/#/login';
    window.location.reload();
  }, 180);
}

interface DrawerItem {
  key: string;
  label: string;
  desc: string;
  icon: Component;
  run: () => void;
}

const workItems: DrawerItem[] = [
  { key: 'space', label: '空间与任务', desc: '切换空间，回到最近任务', icon: FolderOpened, run: () => goChatTab('chat') },
  { key: 'cron', label: '定时任务', desc: '查看计划运行与历史结果', icon: Timer, run: () => goChatTab('task') },
  { key: 'tools', label: '技能与工具', desc: '管理 Skill、连接和自动能力', icon: Tools, run: () => go('/tools') },
  { key: 'files', label: '文件与产物', desc: '查看页面资产和工作文件', icon: Files, run: () => go('/page-assets') },
];
</script>

<style scoped>
.mnav-mask {
  position: fixed;
  inset: 0;
  z-index: 5200;
  background: rgba(13, 18, 22, 0.44);
}

.mnav-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  width: min(88vw, 360px);
  flex-direction: column;
  gap: 18px;
  overflow: auto;
  padding: calc(12px + env(safe-area-inset-top, 0px)) 12px calc(12px + env(safe-area-inset-bottom, 0px));
  background: var(--color-surface);
  box-shadow: -16px 0 42px color-mix(in srgb, var(--color-text) 16%, transparent);
}

.mnav-head {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 10px;
  padding: 4px 2px 12px;
  border-bottom: 1px solid var(--color-border);
}

.mnav-brand {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 13px;
  background: var(--color-text);
  color: var(--color-surface);
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
}

.mnav-head strong,
.mnav-head small {
  display: block;
}

.mnav-head strong {
  font-size: 16px;
}

.mnav-head small {
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.mnav-close {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 0;
  border-radius: 12px;
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
}

.mnav-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mnav-group-title {
  padding: 0 8px 2px;
  color: var(--color-text-tertiary);
  font-size: 11px;
  font-weight: 650;
}

.mnav-item {
  display: grid;
  width: 100%;
  min-height: 58px;
  grid-template-columns: 40px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 10px;
  padding: 7px 9px;
  border: 0;
  border-radius: 13px;
  background: transparent;
  color: var(--color-text);
  text-align: left;
}

.mnav-item:active {
  background: var(--color-surface-hover);
}

.mnav-item-icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 11px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.mnav-item-copy {
  min-width: 0;
}

.mnav-item-copy strong,
.mnav-item-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mnav-item-copy strong {
  font-size: 14px;
}

.mnav-item-copy small {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.mnav-arrow {
  color: var(--color-text-tertiary);
}

.mnav-theme-state {
  color: var(--color-text-tertiary);
  font-size: 11px;
}

.mnav-account {
  display: grid;
  min-height: 64px;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding: 9px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-surface-hover) 62%, transparent);
}

.mnav-avatar {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 12px;
  background: var(--color-text);
  color: var(--color-surface);
  font-size: 14px;
  font-weight: 700;
}

.mnav-account-copy {
  min-width: 0;
}

.mnav-account-copy strong,
.mnav-account-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mnav-account-copy strong {
  font-size: 13px;
}

.mnav-account-copy small {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.mnav-login {
  min-width: 48px;
  min-height: 40px;
  padding: 0 10px;
  border: 0;
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.mnav-enter-active,
.mnav-leave-active {
  transition: opacity var(--motion-base) var(--ease-standard);
}

.mnav-enter-active .mnav-panel,
.mnav-leave-active .mnav-panel {
  transition: transform var(--motion-slow) var(--ease-entrance);
}

.mnav-enter-from,
.mnav-leave-to {
  opacity: 0;
}

.mnav-enter-from .mnav-panel,
.mnav-leave-to .mnav-panel {
  transform: translateX(100%);
}

@media (prefers-reduced-motion: reduce) {
  .mnav-enter-active,
  .mnav-leave-active,
  .mnav-enter-active .mnav-panel,
  .mnav-leave-active .mnav-panel {
    transition-duration: 1ms;
  }
}
</style>
