<template>
  <!-- ⌘K 全局搜索面板（spec「桌面端一体化顶栏 · 全局搜索」基础版）：
       自绘浮层（Teleport 到 body）—— 顶部输入框 + 分组结果列表（任务 / 空间）。
       · 任务：当前模式的会话列表按标题过滤，前 8 条 → 跳 /chat 并激活该会话；
       · 空间：空间树 store 过滤 → 切换空间并回任务页；
       · 文件：无全局文件索引 store（file.ts 是会话级），该类暂缺 —— 基础版按 spec 允许跳过。
       键盘：↑↓ 选择、Enter 跳转、Esc 关闭；样式全 token 化（圆角 12px + --shadow-3）。 -->
  <Teleport to="body">
    <transition name="cmdk-fade">
      <div v-if="visible" class="cmdk-overlay" @mousedown.self="close">
        <div class="cmdk-panel" role="dialog" aria-modal="true" aria-label="全局搜索">
          <div class="cmdk-input-row">
            <el-icon :size="16" class="cmdk-search-icon"><Search /></el-icon>
            <input
              ref="inputRef"
              v-model="query"
              class="cmdk-input"
              type="text"
              placeholder="搜索任务 / 空间…"
              @keydown="onKeydown"
            />
            <button type="button" class="cmdk-esc-hint" aria-label="关闭" @click="close">Esc</button>
          </div>
          <div ref="listRef" class="cmdk-results">
            <template v-for="group in groupedResults" :key="group.key">
              <div class="cmdk-group-label">{{ group.label }}</div>
              <button
                v-for="item in group.items"
                :key="item.key"
                type="button"
                class="cmdk-item"
                :class="{ active: item.key === activeKey }"
                @click="choose(item)"
                @mouseenter="activeKey = item.key"
              >
                <el-icon :size="15" class="cmdk-item-icon"><component :is="item.icon" /></el-icon>
                <span class="cmdk-item-title">{{ item.title }}</span>
                <span class="cmdk-item-desc">{{ item.desc }}</span>
                <el-icon :size="12" class="cmdk-item-go"><ArrowRight /></el-icon>
              </button>
            </template>
            <div v-if="!flatResults.length" class="cmdk-empty">无匹配结果</div>
          </div>
          <div class="cmdk-foot"><span>↑↓ 选择</span><span>Enter 打开</span><span>Esc 关闭</span></div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowRight, ChatDotRound, Folder, Search } from '@element-plus/icons-vue';
import { useChatStore, useSpaceStore } from '../../stores';
import { useChat } from '../../composables/chat/useChat';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>();

const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const spaceStore = useSpaceStore();

const query = ref('');
const activeKey = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);

/** 工作台三页共用同一个聊天区；不在其上时先回 /chat 再激活会话/空间 */
function onWorkbenchPage(): boolean {
  const p = route.path;
  return p.startsWith('/chat') || p.startsWith('/code') || p.startsWith('/workflow');
}

watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    query.value = '';
    activeKey.value = '';
    // 数据未就绪时惰性拉取（会话按当前模式过滤；空间为全量树）
    if (!chatStore.conversations.length) void chatStore.loadConversations();
    if (!spaceStore.spaces.length) void spaceStore.loadSpaces();
    void nextTick(() => inputRef.value?.focus());
  },
);

interface PaletteItem { key: string; type: 'task' | 'space'; title: string; desc: string; icon: Component }

/** 任务：当前模式会话按标题过滤，前 8 条（spec 基础版口径） */
const taskItems = computed<PaletteItem[]>(() => {
  const q = query.value.trim().toLowerCase();
  return chatStore.conversations
    .filter((c) => !q || (c.title || '').toLowerCase().includes(q))
    .slice(0, 8)
    .map((c) => ({
      key: 'task:' + c.id,
      type: 'task' as const,
      title: c.title || '未命名任务',
      desc: c.pinned ? '任务 · 已置顶' : '任务',
      icon: ChatDotRound,
    }));
});

/** 空间：按名称过滤 */
const spaceItems = computed<PaletteItem[]>(() => {
  const q = query.value.trim().toLowerCase();
  return spaceStore.spaces
    .filter((s) => !q || (s.name || '').toLowerCase().includes(q))
    .slice(0, 6)
    .map((s) => ({
      key: 'space:' + s.id,
      type: 'space' as const,
      title: s.name,
      desc: s.dirPath || '空间',
      icon: Folder,
    }));
});

const flatResults = computed<PaletteItem[]>(() => [...taskItems.value, ...spaceItems.value]);

const groupedResults = computed(() => {
  const groups: Array<{ key: string; label: string; items: PaletteItem[] }> = [];
  if (taskItems.value.length) groups.push({ key: 'tasks', label: '任务', items: taskItems.value });
  if (spaceItems.value.length) groups.push({ key: 'spaces', label: '空间', items: spaceItems.value });
  return groups;
});

// 结果变化（输入过滤）时把选中项锚回第一个结果，避免 Enter 落到已消失的条目
watch(flatResults, (list) => {
  if (!list.some((it) => it.key === activeKey.value)) {
    activeKey.value = list[0]?.key || '';
  }
});

function close() {
  emit('update:visible', false);
}

function moveActive(delta: number) {
  const list = flatResults.value;
  if (!list.length) return;
  const idx = list.findIndex((it) => it.key === activeKey.value);
  const next = idx < 0 ? 0 : (idx + delta + list.length) % list.length;
  activeKey.value = list[next].key;
  nextTick(() => {
    listRef.value?.querySelector('.cmdk-item.active')?.scrollIntoView({ block: 'nearest' });
  });
}

function choose(item: PaletteItem) {
  close();
  if (item.type === 'task') {
    // 任务 → 激活该会话（useChat 单例在 App 启动时已创建，与 WebTopBar「新任务」同一惰性口径）
    if (!onWorkbenchPage()) void router.push('/chat');
    void useChat().selectConv(item.key.slice('task:'.length));
  } else if (item.type === 'space') {
    // 空间 → 切空间（含目录同步）并回任务页看该空间下的任务
    void useChat().selectSpaceAndSyncDir(item.key.slice('space:'.length));
    if (!onWorkbenchPage()) void router.push('/chat');
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveActive(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveActive(-1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const hit = flatResults.value.find((it) => it.key === activeKey.value) || flatResults.value[0];
    if (hit) choose(hit);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

// 焦点漂移出输入框（点列表/点空白）后 Esc 仍要能关：面板打开期间挂全局监听
function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.visible) close();
}
watch(
  () => props.visible,
  (v) => {
    if (v) window.addEventListener('keydown', onGlobalKeydown);
    else window.removeEventListener('keydown', onGlobalKeydown);
  },
);
</script>

<style scoped>
.cmdk-overlay {
  position: fixed;
  inset: 0;
  z-index: 2500;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  background: color-mix(in srgb, var(--color-text) 24%, transparent);
  backdrop-filter: blur(2px);
}
.cmdk-panel {
  width: min(560px, calc(100vw - 32px));
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-menu, 12px);
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated, var(--glass-bg, #fff));
  box-shadow: var(--shadow-3);
}
.cmdk-input-row {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
}
.cmdk-search-icon { color: var(--color-text-secondary); flex-shrink: 0; }
.cmdk-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--color-text);
}
.cmdk-input::placeholder { color: var(--color-text-tertiary); }
.cmdk-esc-hint {
  flex-shrink: 0;
  padding: 2px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 11px;
  cursor: pointer;
}
.cmdk-results {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}
.cmdk-group-label {
  padding: 8px 10px 4px;
  font-size: 11px;
  color: var(--color-text-tertiary);
}
.cmdk-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 38px;
  padding: 7px 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}
.cmdk-item.active { background: var(--glass-bg-hover); }
.cmdk-item-icon { flex-shrink: 0; color: var(--color-text-secondary); }
.cmdk-item.active .cmdk-item-icon { color: var(--color-primary); }
.cmdk-item-title {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.cmdk-item-desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--color-text-tertiary);
  text-align: right;
}
.cmdk-item-go { flex-shrink: 0; color: var(--color-text-tertiary); opacity: 0; }
.cmdk-item.active .cmdk-item-go { opacity: 1; }
.cmdk-empty {
  padding: 28px 0;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-tertiary);
}
.cmdk-foot {
  flex-shrink: 0;
  display: flex;
  gap: 14px;
  padding: 8px 14px;
  border-top: 1px solid var(--color-border);
  font-size: 11px;
  color: var(--color-text-tertiary);
}

/* 进出场：轻淡入 + 轻微上移（token 化缓动） */
.cmdk-fade-enter-active,
.cmdk-fade-leave-active {
  transition: opacity var(--motion-fast, 120ms) var(--ease-standard, ease);
}
.cmdk-fade-enter-active .cmdk-panel,
.cmdk-fade-leave-active .cmdk-panel {
  transition: transform var(--motion-fast, 120ms) var(--ease-standard, ease);
}
.cmdk-fade-enter-from,
.cmdk-fade-leave-to {
  opacity: 0;
}
.cmdk-fade-enter-from .cmdk-panel {
  transform: translateY(-6px);
}
</style>
