<!--
  页面内对话「历史」弹窗（P3-5，2026-10-16）—— 列表 / 打开 / 删除 三件事。

  为什么是弹窗而不是面板里再挤一列（与 PageCommandsDialog 同一判断）：
    浏览器面板已经承载了视口 + 停靠对话，历史是**偶尔回看**的动作，
    常驻会长期占掉本就紧张的宽度；弹窗用完即走，且与面板既有的收藏/指令弹窗同形态。

  ★ 三件事各自的口径（都不是"看起来像"就行）：
    · **列表**：按来源查（`source=browser-page`），与用户当前待在哪个模式无关；
      查不到 ≠ 没有 —— 读失败会明说一句，不静默显示成"还没有历史"。
    · **打开**：切这个 tab 的会话绑定并**读回消息**（不重放任务）；
      正在执行时不允许切（否则用户看到的是两条会话混在一个面板里）。
    · **删除**：服务端**软删进回收站**（可恢复），文案必须说实话，不能写"已永久删除"。
-->
<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    title="页面会话历史"
    width="620px"
    :close-on-click-modal="false"
    class="pch-dialog"
  >
    <div class="pch-toolbar">
      <el-input
        v-model="keyword" size="small" clearable class="pch-search"
        placeholder="搜索标题或站点" :prefix-icon="Search"
      />
      <el-checkbox v-if="currentHost" v-model="onlyCurrentHost" size="small" class="pch-only-host">
        只看本站（{{ currentHost }}）
      </el-checkbox>
      <el-button size="small" :loading="loading" @click="reload">刷新</el-button>
    </div>

    <div v-if="warning" class="pch-warn">⚠️ {{ warning }}</div>

    <div class="pch-list">
      <div v-if="loading && !sessions.length" class="pch-hint">正在读取…</div>
      <div v-else-if="!shown.length" class="pch-hint">
        {{ sessions.length ? '没有符合条件的会话。' : '还没有页面对话。在页面上聊过的内容都会留在这里。' }}
      </div>
      <div
        v-for="s in shown" :key="s.id"
        class="pch-row" :class="{ 'is-current': s.id === currentConvId }"
      >
        <div class="pch-row-main">
          <div class="pch-row-title">
            <span v-if="s.host" class="pch-host">{{ s.host }}</span>
            <span class="pch-title-text" :title="s.title">{{ s.title }}</span>
            <span v-if="s.id === currentConvId" class="pch-current">当前</span>
          </div>
          <div class="pch-row-sub">
            <span>{{ formatSessionTime(s.updatedAt) }}</span>
            <span v-if="s.url" class="pch-url" :title="s.url">{{ s.url }}</span>
          </div>
        </div>
        <div class="pch-row-actions">
          <el-button size="small" text type="primary" @click="onOpen(s)">打开</el-button>
          <el-button size="small" text type="danger" @click="onDelete(s)">删除</el-button>
        </div>
      </div>
    </div>

    <template #footer>
      <span class="pch-foot">删除是移入回收站（可在回收站恢复），不会立刻抹掉数据。</span>
      <el-button @click="$emit('update:visible', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import { usePageChatStore } from '../../stores/page-chat';
import { filterSessions, formatSessionTime, type PageChatSession } from '../../utils/pageChatHistory';

const props = defineProps<{
  visible: boolean;
  /** 当前页所在 tab：打开历史会话时切的是**这个 tab** 的绑定 */
  tabId: string;
  /** 该 tab 此刻绑定的会话 id（列表里标「当前」） */
  currentConvId?: string;
  /** 当前页站点（提供"只看本站"开关） */
  currentHost?: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  /** 已切到某条历史会话（面板需要滚到底部 / 更新头部） */
  (e: 'opened'): void;
}>();

const pageChat = usePageChatStore();

const sessions = ref<PageChatSession[]>([]);
const loading = ref(false);
const warning = ref('');
const keyword = ref('');
const onlyCurrentHost = ref(false);

const shown = computed(() =>
  filterSessions(sessions.value, keyword.value, onlyCurrentHost.value ? (props.currentHost || '') : ''),
);

async function reload() {
  loading.value = true;
  try {
    const r = await pageChat.listSessions();
    sessions.value = r.rows;
    warning.value = r.warning;
  } finally {
    loading.value = false;
  }
}

// 每次打开都重拉：面板里刚聊完的那条必须立刻出现在列表最上面（否则用户会以为没存）
watch(() => props.visible, (v) => {
  if (!v) return;
  keyword.value = '';
  onlyCurrentHost.value = false;
  void reload();
});

async function onOpen(s: PageChatSession) {
  const r = await pageChat.openSession(props.tabId, s);
  if (!r.ok) {
    if (r.msg) ElMessage.warning(r.msg);
    return;                       // 读消息失败时面板里已有提示气泡，这里不重复弹
  }
  emit('opened');
  emit('update:visible', false);
}

async function onDelete(s: PageChatSession) {
  try {
    await ElMessageBox.confirm(
      `把「${s.title}」移到回收站？可在回收站恢复。`,
      '删除页面会话',
      { confirmButtonText: '移入回收站', cancelButtonText: '取消', type: 'warning' },
    );
  } catch { return; }
  const r = await pageChat.deleteSession(s.id);
  if (!r.ok) { ElMessage.error(`删除失败：${r.msg}`); return; }
  sessions.value = sessions.value.filter((x) => x.id !== s.id);
  ElMessage.success('已移入回收站');
}
</script>

<style scoped>
.pch-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.pch-search { max-width: 220px; }
.pch-only-host { flex-shrink: 0; }
.pch-warn {
  font-size: 12px; color: var(--el-color-warning, #e6a23c);
  background: var(--el-color-warning-light-9, #fdf6ec); padding: 6px 10px; border-radius: 6px; margin-bottom: 8px;
}
.pch-list { max-height: 380px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.pch-hint { color: var(--el-text-color-secondary, #909399); font-size: 12px; padding: 18px 4px; text-align: center; }
.pch-row {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px;
  border: 1px solid transparent;
}
.pch-row:hover { background: var(--el-fill-color-light, #f5f7fa); }
.pch-row.is-current { border-color: var(--el-color-primary-light-5, #a0cfff); }
.pch-row-main { flex: 1; min-width: 0; }
.pch-row-title { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.pch-host {
  flex-shrink: 0; font-size: 11px; padding: 1px 6px; border-radius: 8px;
  background: var(--el-fill-color, #f0f2f5); color: var(--el-text-color-regular, #606266);
}
.pch-title-text {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--el-text-color-primary, #303133);
}
.pch-current {
  flex-shrink: 0; font-size: 11px; padding: 1px 6px; border-radius: 8px;
  background: var(--el-color-primary-light-9, #ecf5ff); color: var(--el-color-primary);
}
.pch-row-sub {
  display: flex; align-items: center; gap: 8px; margin-top: 2px;
  font-size: 11px; color: var(--el-text-color-secondary, #909399);
}
.pch-url { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pch-row-actions { flex-shrink: 0; }
.pch-foot { float: left; font-size: 12px; color: var(--el-text-color-secondary, #909399); line-height: 32px; }
</style>
