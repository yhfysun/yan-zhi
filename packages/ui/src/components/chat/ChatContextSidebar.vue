<template>
  <aside class="context-sidebar" :class="{ open: contextSidebarOpen }" aria-label="任务上下文栏">
    <header class="context-sidebar-header">
      <div class="context-sidebar-title">上下文</div>
      <el-button size="small" circle @click="toggleContextSidebar" aria-label="关闭上下文栏">
        <el-icon><Close /></el-icon>
      </el-button>
    </header>

    <div class="context-sidebar-body">
      <section class="context-section">
        <div class="context-section-heading">
          <el-icon><Collection /></el-icon>
          <span>知识库</span>
        </div>
        <el-empty v-if="mountedKnowledge.length === 0" description="暂无已挂载知识库" :image-size="46" />
        <div v-else class="context-item-list">
          <div v-for="item in mountedKnowledge" :key="item.id" class="context-item">
            <el-icon><Collection /></el-icon>
            <span class="context-item-name">{{ item.name }}</span>
          </div>
        </div>
      </section>

      <section class="context-section">
        <div class="context-section-heading">
          <el-icon><Files /></el-icon>
          <span>已挂载 Skill</span>
        </div>
        <el-empty v-if="mountedSkills.length === 0" description="暂无已挂载 Skill" :image-size="46" />
        <div v-else class="context-item-list">
          <div v-for="skill in mountedSkills" :key="skill.id" class="context-item">
            <el-icon><Files /></el-icon>
            <div class="context-item-copy">
              <span class="context-item-name">{{ skill.name }}</span>
              <span class="context-item-desc">{{ skill.description }}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="context-section">
        <div class="context-section-heading">
          <el-icon><Connection /></el-icon>
          <span>已挂载工具</span>
        </div>
        <el-empty v-if="mountedTools.length === 0" description="暂无已挂载 MCP 工具" :image-size="46" />
        <div v-else class="context-item-list">
          <div v-for="tool in mountedTools" :key="tool.serverId + ':' + tool.name" class="context-item">
            <el-icon><Connection /></el-icon>
            <div class="context-item-copy">
              <span class="context-item-name">{{ tool.serverName }} / {{ tool.name }}</span>
              <span class="context-item-desc">{{ tool.description }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ★★★ 上下文压缩（D3-转，2026-10-10）：手动压一下 + 压缩历史 -->
      <section class="context-section">
        <div class="context-section-heading">
          <el-icon><MagicStick /></el-icon>
          <span>上下文压缩</span>
          <el-button
            class="ctx-compact-btn"
            size="small"
            text
            :loading="compacting"
            :disabled="!canCompact"
            @click="onCompact"
          >立即压缩</el-button>
        </div>
        <div class="ctx-compact-hint">
          自动压缩只在接近窗口上限时触发；此处可**主动**压一次（摘要会记入下方历史，可回退）。
        </div>
        <el-empty v-if="summaries.length === 0" description="暂无压缩记录" :image-size="40" />
        <div v-else class="context-item-list">
          <div v-for="s in summaries" :key="s.id" class="context-item">
            <div class="context-item-copy">
              <span class="context-item-name">
                {{ s.active ? '当前生效' : '' }} 覆盖 {{ s.coveredCount }} 条
              </span>
              <span class="context-item-desc">{{ fmtTime(s.createdAt) }} · {{ s.preview }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Close, Collection, Connection, Files, MagicStick } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useChat } from '../../composables/chat/useChat';
import type { Skill } from '../../stores/skill';
import { api } from '../../api/client';

const {
  contextSidebarOpen,
  toggleContextSidebar,
  store,
  mcpStore,
  mountedSkillIds,
  skillStore,
} = useChat();

const mountedKnowledge = computed<Array<{ id: string; name: string }>>(() => []);

const mountedSkills = computed(() =>
  mountedSkillIds.value
    .map((id) => skillStore.skills.find((skill) => skill.id === id))
    .filter((skill): skill is Skill => Boolean(skill)),
);

const mountedTools = computed(() =>
  store.mountedMcpServers.flatMap((serverId) => {
    const server = mcpStore.servers.find((item) => item.id === serverId);
    const tools = mcpStore.tools[serverId] || [];
    return tools.map((tool) => ({
      serverId,
      serverName: server?.name || serverId,
      name: tool.name,
      description: tool.description || '',
    }));
  }),
);

// ── ★★★ 上下文压缩（D3-转，2026-10-10）────────────────────────────────────
const summaries = ref<Array<{ id: string; preview: string; coveredCount: number; tokens: number; createdAt: number; active: boolean }>>([]);
const compacting = ref(false);
const currentConvId = computed(() => store.currentConvId);
/** 任务运行中不提供手动压缩（与服务端的 409 防护同源，避免无谓请求） */
const canCompact = computed(() => !!currentConvId.value && !store.isConvStreaming(currentConvId.value));

async function loadSummaries() {
  const cid = currentConvId.value;
  if (!cid) { summaries.value = []; return; }
  try {
    const r = await api.get<any>(`/conversations/${encodeURIComponent(cid)}/summaries`);
    summaries.value = Array.isArray((r as any)?.items) ? (r as any).items : [];
  } catch { summaries.value = []; }
}

async function onCompact() {
  if (!canCompact.value || compacting.value) return;
  compacting.value = true;
  try {
    const r = await store.compactNow();
    ElMessage[r.ok ? 'success' : 'warning'](r.msg);
    if (r.ok) await loadSummaries();   // 压完刷新历史（能立刻看到"当前生效"那条）
  } finally {
    compacting.value = false;
  }
}

/** 时间戳 → 简短可读（只用于列表展示，够用即可） */
function fmtTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 切会话 / 侧栏打开时刷新一次（数据量小，直接拉）
watch([currentConvId, () => contextSidebarOpen.value], ([cid, open]) => {
  if (open && cid) void loadSummaries();
}, { immediate: true });
</script>

<style scoped>
.context-sidebar {
  flex: 0 0 0;
  min-width: 0;
  width: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--glass-border, rgba(15, 23, 42, 0.1));
  background: var(--glass-bg, rgba(255, 255, 255, 0.72));
  backdrop-filter: var(--glass-filter, blur(14px));
  -webkit-backdrop-filter: var(--glass-filter, blur(14px));
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transition: flex-basis 0.24s ease, min-width 0.24s ease, width 0.24s ease, opacity 0.2s ease;
}

.context-sidebar.open {
  flex: 0 0 var(--chat-context-w, 286px);
  min-width: var(--chat-context-w, 286px);
  width: var(--chat-context-w, 286px);
  opacity: 1;
  pointer-events: auto;
}

.context-sidebar-header {
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--glass-border, rgba(15, 23, 42, 0.1));
}

.context-sidebar-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--skin-text, var(--el-text-color-primary, #1e293b));
}

.context-sidebar-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 12px 20px;
}

.context-section + .context-section {
  margin-top: 18px;
}

.context-section-heading {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
  color: var(--el-text-color-secondary, #64748b);
  font-size: 12px;
  font-weight: 700;
}

.context-section-heading .el-icon {
  color: var(--el-color-primary, #7c3aed);
}

/* ★ 上下文压缩区块（D3-转）：按钮靠右、提示行与列表复用既有样式 */
.ctx-compact-btn {
  margin-left: auto;
  padding: 2px 6px;
  font-weight: 600;
}
.ctx-compact-hint {
  margin-bottom: 8px;
  color: var(--el-text-color-secondary, #64748b);
  font-size: 11px;
  line-height: 1.5;
}

.context-item-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.context-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid var(--glass-border, rgba(15, 23, 42, 0.1));
  border-radius: 9px;
  background: var(--el-fill-color-blank, rgba(255, 255, 255, 0.66));
  color: var(--skin-text, var(--el-text-color-primary, #1e293b));
}

.context-item > .el-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--el-text-color-secondary, #64748b);
}

.context-item-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.context-item-name {
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-item-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary, #64748b);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@media (max-width: 767px) {
  .context-sidebar {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 250;
    width: min(320px, 86vw);
    min-width: 0;
    flex-basis: auto;
    transform: translateX(100%);
    transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
    box-shadow: -18px 0 36px rgba(15, 23, 42, 0.18);
  }

  .context-sidebar.open {
    flex-basis: auto;
    min-width: min(320px, 86vw);
    width: min(320px, 86vw);
    transform: translateX(0);
  }
}

/* ★ 过渡断点（768–1199px）：上下文栏同样改为右侧覆盖式抽屉（不挤压消息列），
   与 chat.css 中 .right-panel 的同区间抽屉化配套；>1200px 恢复常驻分栏。
   Capacitor 横屏（视口 800px+ 且 .platform-mobile 在）由下方专属分支接管，
   两处规则方向一致，仅宽度取 platform-mobile 的固定 320px。 */
@media (min-width: 768px) and (max-width: 1199px) {
  .context-sidebar {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 250;
    width: min(320px, 44vw);
    min-width: 0;
    flex-basis: auto;
    transform: translateX(100%);
    transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
    box-shadow: -18px 0 36px rgba(15, 23, 42, 0.18);
  }

  .context-sidebar.open {
    flex-basis: auto;
    min-width: min(320px, 44vw);
    width: min(320px, 44vw);
    transform: translateX(0);
  }
}

/* ★★ 移动外壳专属样式**必须再写一份 `.platform-mobile`**。
   `@media (max-width:767px)` 按视口宽判定，而 Capacitor **横屏视口常 800px+**
   → 媒体查询不命中，但移动外壳（TabBar 由 v-if 渲染、与宽度无关）明明在。
   实测横屏 880×420：本组件回落到底态 `flex: 0 0 0; width: 0`（只有 1px 宽），
   内部文字被挤成 **22×153 的竖排单条**（「暂无已挂载知识库」等 4 处）——
   属于 ADAPTATION-NOTES 五号坑「文字竖排」+ 十四号坑「只挂媒体查询」的叠加。
   竖屏分支里的字号/间距微调不必搬过来（横屏退回桌面值可接受），
   这里只放**与屏幕方向无关、必须生效**的结构性定位。 */
.platform-mobile .context-sidebar {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 250;
  width: min(320px, 86vw);
  min-width: 0;
  flex-basis: auto;
  transform: translateX(100%);
  transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
  box-shadow: -18px 0 36px rgba(15, 23, 42, 0.18);
}

.platform-mobile .context-sidebar.open {
  flex-basis: auto;
  min-width: min(320px, 86vw);
  width: min(320px, 86vw);
  transform: translateX(0);
}
</style>
