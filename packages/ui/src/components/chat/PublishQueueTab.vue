<!--
  PublishQueueTab.vue — 发布队列面板（侧栏「发布」tab）
  ------------------------------------------------------------
  模型通过 publish_enqueue 工具把准备好的内容提交到这里（只入队、不发布），
  用户在此人工确认（合规设计：发布动作必须人工点头）。
  状态流转：pending 待确认 → approved 已确认（待发布执行）→ published 已发布
                        ↘ rejected 已驳回（可撤回待确认重来）
-->
<template>
  <div class="pq-tab">
    <div class="pq-summary">
      <span class="pq-badge pending">待确认 {{ counts.pending }}</span>
      <span class="pq-badge approved">已确认 {{ counts.approved }}</span>
      <el-icon class="pq-refresh" title="刷新" @click="load"><Refresh /></el-icon>
    </div>

    <div v-if="loading" class="pq-empty">加载中…</div>
    <div v-else-if="items.length === 0" class="pq-empty">
      <p>队列为空</p>
      <p class="pq-hint">对「言智代言官」说"做完后提交到发布队列"，产出的内容会出现在这里等你确认。</p>
    </div>

    <div v-for="it in items" :key="it.id" class="pq-item" :class="`is-${it.status}`">
      <div class="pq-item-head">
        <span class="pq-platform">{{ platformLabel(it.platform) }}</span>
        <span v-if="it.collection" class="pq-collection" :title="`合集：${it.collection}`">合集 · {{ it.collection }}</span>
        <span class="pq-status" :class="`s-${it.status}`">{{ statusLabel(it.status) }}</span>
      </div>
      <div class="pq-title" :title="it.title">{{ it.title }}</div>
      <div v-if="it.content" class="pq-content" :title="it.content">{{ it.content }}</div>
      <div v-if="it.mediaPaths?.length" class="pq-media">{{ it.mediaPaths.length }} 个媒体文件</div>
      <div v-if="it.stats" class="pq-stats">
        <span v-if="it.stats.views !== undefined">▶ {{ it.stats.views }}</span>
        <span v-if="it.stats.likes !== undefined">♥ {{ it.stats.likes }}</span>
        <span v-if="it.stats.comments !== undefined">💬 {{ it.stats.comments }}</span>
        <span v-if="it.stats.shares !== undefined">↗ {{ it.stats.shares }}</span>
      </div>
      <div class="pq-actions">
        <template v-if="it.status === 'pending'">
          <el-button size="small" type="primary" @click="act(it, 'confirm')">确认</el-button>
          <el-button size="small" @click="act(it, 'reject')">驳回</el-button>
        </template>
        <template v-else-if="it.status === 'approved'">
          <el-button size="small" type="primary" :loading="dispatching === it.id" @click="dispatch(it)">派发发布任务</el-button>
          <el-button size="small" @click="act(it, 'markPublished')">手动标记已发布</el-button>
          <el-button size="small" @click="act(it, 'backToPending')">撤回待确认</el-button>
        </template>
        <template v-else-if="it.status === 'rejected'">
          <el-button size="small" @click="act(it, 'backToPending')">重新待确认</el-button>
        </template>
        <template v-else>
          <el-button size="small" @click="act(it, 'backToPending')">撤回待确认</el-button>
        </template>
        <el-button size="small" text type="danger" @click="remove(it)">删除</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { api } from '../../api/client';

interface QueueStats { views?: number; likes?: number; comments?: number; shares?: number; note?: string; recordedAt?: number }
interface QueueItem {
  id: string;
  platform: string;
  title: string;
  content?: string;
  mediaPaths?: string[];
  tags?: string;
  status: 'pending' | 'approved' | 'rejected' | 'published';
  note?: string;
  collection?: string;
  stats?: QueueStats | null;
  createdAt?: number;
}

const items = ref<QueueItem[]>([]);
const counts = ref({ pending: 0, approved: 0 });
const loading = ref(false);
const dispatching = ref('');

const PLATFORM_LABELS: Record<string, string> = {
  douyin: '抖音', xiaohongshu: '小红书', bilibili: 'B站', wechat: '公众号',
  csdn: 'CSDN', juejin: '掘金', zhihu: '知乎',
};
const STATUS_LABELS: Record<string, string> = {
  pending: '待确认', approved: '已确认', rejected: '已驳回', published: '已发布',
};

function platformLabel(p: string): string { return PLATFORM_LABELS[p] || p; }
function statusLabel(s: string): string { return STATUS_LABELS[s] || s; }

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await api.get<QueueItem[]>('/publish-queue');
    items.value = ((r as any)?.data || []) as QueueItem[];
    const c = await api.get<{ pending: number; approved: number }>('/publish-queue/counts');
    counts.value = ((c as any)?.data || { pending: 0, approved: 0 });
  } catch (e: any) {
    ElMessage.error('加载发布队列失败：' + (e?.message || e));
  } finally {
    loading.value = false;
  }
}

async function act(it: QueueItem, action: string): Promise<void> {
  try {
    await api.post(`/publish-queue/${it.id}/status`, { action });
    if (action === 'confirm') ElMessage.success('已确认，进入待发布状态');
    await load();
  } catch (e: any) {
    ElMessage.error('操作失败：' + (e?.message || e));
  }
}

/** 派发发布任务（P2）：确认后的条目一键起发布任务（代言官委派 pageAgent 实际执行） */
async function dispatch(it: QueueItem): Promise<void> {
  dispatching.value = it.id;
  try {
    const r = await api.post<{ conversationId: string; taskId: string }>(`/publish-queue/${it.id}/dispatch`, {});
    // ★ api 客户端已解开 {data} 信封（json.data 缺失才回落整个 json），不能再取一层 .data
    const d = (r as any)?.data || r;
    ElMessage.success(`发布任务已派发，可在任务列表「${it.title}」里跟踪进度`);
    console.log('[publish-queue] dispatch →', d);
    await load();
  } catch (e: any) {
    ElMessage.error('派发失败：' + (e?.message || e));
  } finally {
    dispatching.value = '';
  }
}

async function remove(it: QueueItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除「${it.title}」？`, '删除', { type: 'warning' });
  } catch { return; }
  try {
    await api.delete(`/publish-queue/${it.id}`);
    await load();
  } catch (e: any) {
    ElMessage.error('删除失败：' + (e?.message || e));
  }
}

onMounted(load);
</script>

<style scoped>
.pq-tab {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pq-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 2px 6px;
}
.pq-badge {
  font-size: 11.5px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--el-fill-color, #f4f4f5);
  color: var(--el-text-color-secondary, #64748b);
}
.pq-badge.pending { background: color-mix(in srgb, var(--el-color-warning, #efaa17) 18%, transparent); color: var(--el-color-warning, #b47a0a); }
.pq-badge.approved { background: color-mix(in srgb, var(--el-color-success, #1dc981) 16%, transparent); color: var(--el-color-success, #0d9668); }
.pq-refresh { margin-left: auto; cursor: pointer; color: var(--el-text-color-secondary, #64748b); }
.pq-refresh:hover { color: var(--el-text-color-primary, #1e293b); }

.pq-empty {
  text-align: center;
  color: var(--el-text-color-secondary, #94a3b8);
  font-size: 12.5px;
  padding: 30px 10px;
}
.pq-hint { font-size: 11.5px; opacity: 0.8; margin-top: 6px; line-height: 1.6; }

.pq-item {
  border: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.08));
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.pq-item-head { display: flex; align-items: center; gap: 6px; }
.pq-platform {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--el-color-primary, #4f46e5) 12%, transparent);
  color: var(--el-color-primary, #4f46e5);
}
.pq-collection {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--el-color-success, #1dc981) 14%, transparent);
  color: var(--el-color-success, #0d9668);
  max-width: 40%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pq-status { font-size: 11px; color: var(--el-text-color-secondary, #64748b); }
.pq-status.s-pending { color: var(--el-color-warning, #b47a0a); }
.pq-status.s-approved { color: var(--el-color-success, #0d9668); }
.pq-status.s-published { color: var(--el-color-success, #0d9668); }
.pq-status.s-rejected { color: var(--el-color-danger, #e8463a); }
.pq-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary, #1e293b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pq-content {
  font-size: 11.5px;
  color: var(--el-text-color-secondary, #64748b);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pq-media { font-size: 11px; color: var(--el-text-color-secondary, #94a3b8); }
.pq-stats {
  display: flex;
  gap: 10px;
  font-size: 11.5px;
  color: var(--el-text-color-regular, #475569);
  padding: 2px 0;
}
.pq-actions { display: flex; gap: 4px; flex-wrap: wrap; }
.pq-actions .el-button + .el-button { margin-left: 4px; }
</style>
