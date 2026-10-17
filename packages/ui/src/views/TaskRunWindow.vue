<!--
  TaskRunWindow.vue — 独立执行窗口（路由 /task-window/:convId）
  ------------------------------------------------------------
  由侧栏任务行的「独立窗口打开」唤起（桌面端真窗口 / Web 降级新标签页）。
  与 DiffWindow 同一外壳（ChildWindowFrame），内容是**只读执行监视器**：
    · 任务状态（运行中/已完成/失败 + 步数）实时轮询
    · 任务计划进度（conversation.task_plan_json，与主窗口 task_plan 面板同源）
    · 消息流（用户/助手气泡，轮询增量）
  设计取舍：不渲染输入框与工具面板 —— 本窗口的定位是"看任务跑"（Trae 式执行窗），
  交互（追问/插话/工具详情）仍在主窗口会话页。录屏演示也只需要这一块干净的舞台。
-->
<template>
  <ChildWindowFrame
    :title="title"
    :subtitle="statusText"
    :icon="Monitor"
    @close="onClose"
  >
    <template #actions>
      <button class="trw-act" type="button" title="在主窗口打开该任务" @click="openInMain">
        <el-icon :size="12"><Position /></el-icon>主窗口
      </button>
    </template>

    <div class="trw-body">
      <div v-if="loadError" class="trw-state">
        <el-icon :size="38"><WarningFilled /></el-icon>
        <p>{{ loadError }}</p>
        <p class="trw-state-hint">请回到主窗口，从任务行右键「独立窗口打开」重新进入。</p>
      </div>

      <template v-else>
        <!-- 状态条 -->
        <div class="trw-status" :class="{ 'is-running': status === 'running' }">
          <span class="trw-dot"></span>
          <span class="trw-status-label">{{ statusText }}</span>
          <span v-if="step > 0" class="trw-status-meta">{{ step }} 步</span>
          <span class="trw-spacer"></span>
          <span class="trw-status-meta" :title="updatedAtText">{{ updatedAtText }}</span>
        </div>

        <!-- 任务计划进度（有计划时展示，与主窗口 task_plan 同源） -->
        <div v-if="plan" class="trw-plan">
          <div class="trw-plan-title">{{ plan.title || '任务计划' }}</div>
          <div v-for="(s, i) in plan.steps" :key="i" class="trw-plan-step" :class="`is-${s.status || 'pending'}`">
            <span class="trw-plan-ico">
              <el-icon v-if="s.status === 'done'" :size="12"><CircleCheckFilled /></el-icon>
              <el-icon v-else-if="s.status === 'failed'" :size="12"><CircleCloseFilled /></el-icon>
              <el-icon v-else-if="s.status === 'running'" :size="12"><Loading /></el-icon>
              <span v-else class="trw-plan-idx">{{ i + 1 }}</span>
            </span>
            <span class="trw-plan-label" :title="s.description || s.title">{{ s.title }}</span>
          </div>
        </div>

        <!-- 消息流 -->
        <div ref="msgListRef" class="trw-msgs">
          <div v-if="messages.length === 0" class="trw-state">
            <el-icon :size="34"><ChatDotRound /></el-icon>
            <p>还没有消息</p>
          </div>
          <div
            v-for="m in messages"
            :key="m.id"
            class="trw-msg"
            :class="`is-${m.role}`"
          >
            <div class="trw-msg-role">{{ m.role === 'user' ? '指令' : m.role === 'assistant' ? '执行' : m.role }}</div>
            <div class="trw-msg-bubble">{{ m.content }}</div>
          </div>
        </div>
      </template>
    </div>
  </ChildWindowFrame>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Monitor, WarningFilled, CircleCheckFilled, CircleCloseFilled, Loading,
  ChatDotRound, Position,
} from '@element-plus/icons-vue';
import ChildWindowFrame from '../components/workbench/ChildWindowFrame.vue';
import { closeSelfWindow, isChildWindowContext } from '../utils/childWindow';
import { api } from '../api/client';

interface PlanStep { title: string; description?: string; status?: string }
interface Plan { title?: string; steps: PlanStep[] }
interface TrwMsg { id: string; role: string; content: string }

const route = useRoute();
const router = useRouter();
const convId = String(route.params.convId || '');

const title = ref('任务执行');
const status = ref<'' | 'running' | 'completed' | 'failed' | 'aborted' | 'paused'>('');
const step = ref(0);
const updatedAt = ref<number>(0);
const plan = ref<Plan | null>(null);
const messages = ref<TrwMsg[]>([]);
const loadError = ref('');
const msgListRef = ref<HTMLElement | null>(null);

const STATUS_LABELS: Record<string, string> = {
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  aborted: '已中止',
  paused: '已暂停',
};

const statusText = computed(() => (status.value ? (STATUS_LABELS[status.value] || status.value) : '加载中…'));
const updatedAtText = computed(() => {
  if (!updatedAt.value) return '';
  const d = new Date(updatedAt.value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
});

let pollTimer: ReturnType<typeof setInterval> | null = null;

/** 拉取会话元信息 + 任务状态 + 消息（轮询；MVP 用轮询而不是 SSE —— 2.5s 足够"看任务跑"） */
async function refresh(): Promise<void> {
  if (!convId) { loadError.value = '缺少任务标识'; return; }
  try {
    // 1) 会话行（标题 + 任务计划）
    const conv = await api.get<any>(`/conversations/${convId}`);
    const row = (conv as any)?.data || conv;
    if (!row?.id) { loadError.value = '任务不存在或已被删除'; stopPoll(); return; }
    title.value = row.title || '任务执行';
    updatedAt.value = row.updated_at || updatedAt.value;
    plan.value = (() => {
      if (!row.task_plan_json) return null;
      try {
        const parsed = JSON.parse(row.task_plan_json);
        return parsed && Array.isArray(parsed.steps) ? parsed : null;
      } catch { return null; }
    })();

    // 2) 任务状态（内存活任务 → llm_task 表回落的统一出口）
    const t = await api.get<any>(`/llm/tasks/active?conversationId=${encodeURIComponent(convId)}`);
    const list = (t as any)?.data;
    if (Array.isArray(list) && list.length > 0) {
      status.value = list[0].status || 'running';
      step.value = Number(list[0].step) || step.value;
      updatedAt.value = Date.now();
    } else {
      const r = await api.get<any[]>(`/conversations/${convId}/messages?limit=100`);
      const msgs = ((r as any)?.data || r) as any[];
      if (Array.isArray(msgs) && msgs.length > 0) {
        const tail = msgs[msgs.length - 1];
        status.value = tail.role === 'assistant' ? 'completed' : 'running';
        step.value = step.value;
      }
    }

    // 3) 消息流（增量追加，避免整表替换导致滚动跳动）
    const r = await api.get<any[]>(`/conversations/${convId}/messages?limit=100`);
    const msgs = ((r as any)?.data || r) as any[];
    if (Array.isArray(msgs)) {
      const next: TrwMsg[] = msgs.map((m) => ({ id: m.id, role: m.role, content: m.content || '' }));
      const changed = next.length !== messages.value.length || (next[next.length - 1]?.id !== messages.value[messages.value.length - 1]?.id);
      if (changed) {
        messages.value = next;
        await nextTick();
        const el = msgListRef.value;
        if (el) el.scrollTop = el.scrollHeight;
      }
    }
  } catch (e: any) {
    // 会话拉不到（被删/权限）只报一次，别让轮询刷屏
    if (!loadError.value) loadError.value = '加载任务失败：' + (e?.message || e);
    stopPoll();
  }
}

function stopPoll(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function openInMain(): void {
  // 主窗口可能不在本窗口进程里（真子窗口）：走 hash 直跳 —— Electron 下主窗口独立进程，
  // 这里退化为主窗口形态的浏览器跳转；应用内形态则用 router 跳回会话页。
  if (isChildWindowContext()) {
    window.open(`${location.origin}${location.pathname}#/chat/${convId}`, '_blank');
    return;
  }
  void router.push(`/chat/${convId}`);
}

async function onClose(): Promise<void> {
  if (isChildWindowContext()) {
    const closed = await closeSelfWindow();
    if (closed) return;
  }
  if (history.length > 1) history.back();
  else window.location.hash = '#/chat';
}

onMounted(() => {
  void refresh();
  pollTimer = setInterval(() => { void refresh(); }, 2500);
});
onBeforeUnmount(stopPoll);
</script>

<style scoped>
.trw-act {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  font-size: 11.5px;
  border: 1px solid var(--glass-border, rgba(15, 23, 42, 0.08));
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-secondary, #64748b);
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
}
.trw-act:hover { background: rgba(0, 0, 0, 0.05); color: var(--el-text-color-primary, #1e293b); }

.trw-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.trw-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--el-text-color-secondary, #64748b);
  font-size: 13px;
  padding: 20px;
  text-align: center;
}
.trw-state-hint { font-size: 12px; opacity: 0.8; }

/* ===== 状态条 ===== */
.trw-status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 8px 14px;
  border-bottom: 1px solid var(--glass-border, rgba(15, 23, 42, 0.08));
  font-size: 12px;
  color: var(--el-text-color-secondary, #64748b);
}
.trw-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #b6bcc6;
  flex-shrink: 0;
}
.trw-status.is-running .trw-dot {
  background: var(--el-color-success, #1dc981);
  animation: trw-pulse 1.4s ease-in-out infinite;
}
.trw-status.is-running .trw-status-label { color: var(--el-color-success, #0d9668); font-weight: 600; }
@keyframes trw-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.82); }
}
.trw-status-label { color: var(--el-text-color-primary, #1e293b); }
.trw-status-meta { font-size: 11.5px; opacity: 0.85; }
.trw-spacer { flex: 1; }

/* ===== 任务计划 ===== */
.trw-plan {
  flex-shrink: 0;
  max-height: 32%;
  overflow: auto;
  padding: 10px 14px;
  border-bottom: 1px solid var(--glass-border, rgba(15, 23, 42, 0.08));
  background: var(--el-fill-color-lighter, #fafaf9);
}
.trw-plan-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--el-text-color-primary, #1e293b);
}
.trw-plan-step {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  line-height: 22px;
  color: var(--el-text-color-secondary, #64748b);
}
.trw-plan-step.is-running { color: var(--el-color-primary, #4f46e5); }
.trw-plan-step.is-done { color: var(--el-text-color-regular, #475569); }
.trw-plan-step.is-failed { color: var(--el-color-danger, #e8463a); }
.trw-plan-ico { display: inline-flex; width: 14px; justify-content: center; flex-shrink: 0; }
.trw-plan-idx { font-size: 11px; opacity: 0.8; }
.trw-plan-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ===== 消息流 ===== */
.trw-msgs {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.trw-msg { display: flex; flex-direction: column; gap: 2px; max-width: 92%; }
.trw-msg-role {
  font-size: 10.5px;
  color: var(--el-text-color-secondary, #94a3b8);
  padding: 0 2px;
}
.trw-msg-bubble {
  padding: 8px 11px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--el-fill-color-light, #f4f4f5);
  color: var(--el-text-color-primary, #1e293b);
}
.trw-msg.is-user { align-self: flex-end; align-items: flex-end; }
.trw-msg.is-user .trw-msg-bubble {
  background: color-mix(in srgb, var(--el-color-primary, #4f46e5) 12%, transparent);
}
</style>
