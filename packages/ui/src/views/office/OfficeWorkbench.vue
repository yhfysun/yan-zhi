<!--
  OfficeWorkbench.vue — 办公工作台（2026-11-02，P2）

  三栏：工作区文件树 ｜ 文档 / 表格 / 演示画布 ｜ AI 助手。
  入口在顶栏「工作台」（仅办公室模式）；默认聊天页不变。
  AI / 人工 segmented 在右栏头部：人工模式右栏收成窄条，发送入口不可达（不调用任何模型）。
-->
<template>
  <div class="office-wb" :class="{ manual: isManual }" :style="{ '--wb-tree-w': treeW + 'px', '--wb-ai-w': aiW + 'px' }">
    <!-- 左：文件树 -->
    <WorkspaceFileTree class="wb-tree" @pick-dir="showWorkspaceDir = true" />
    <div class="rs-handle" @mousedown="treeR.startDrag($event, 'left')"></div>

    <!-- 中：画布 -->
    <section class="wb-main">
      <header class="wb-main-head">
        <div class="wb-main-title">
          <span class="wb-file-name">{{ fileName || '工作台' }}</span>
          <span class="wb-file-sub">{{ fileSub }}</span>
        </div>
        <div class="wb-main-actions">
          <el-button size="small" :disabled="!selectedPath" @click="exportFile">导出</el-button>
          <el-button size="small" :disabled="!selectedPath" @click="openLocal">本机打开</el-button>
        </div>
      </header>
      <OfficeDocumentView :path="selectedPath" />
    </section>

    <!-- 右：AI / 人工 -->
    <aside class="wb-ai">
      <header class="wb-ai-head">
        <span v-if="!isManual" class="wb-ai-title">助手</span>
        <div class="wb-seg">
          <button type="button" :class="{ on: !isManual }" @click="setOfficePanel('ai')">AI</button>
          <button type="button" :class="{ on: isManual }" @click="setOfficePanel('manual')">人工</button>
        </div>
      </header>

      <template v-if="!isManual">
        <div class="wb-chat chat-column">
          <ChatMessageList />
          <ChatInputArea />
        </div>
      </template>
      <div v-else class="wb-manual">
        <button class="wb-manual-btn" type="button" title="切回 AI 协作" @click="setOfficePanel('ai')">
          <el-icon :size="16"><ChatDotRound /></el-icon>
        </button>
        <div class="wb-manual-label">人工编辑 · 不调用 AI</div>
      </div>
    </aside>

    <!-- 聊天共用的弹层：工作目录选择 / 技能卡 / 定时任务等（与聊天页同一套） -->
    <ChatDialogs />
    <ChatSkillCards />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import { ChatDotRound } from '@element-plus/icons-vue';
import WorkspaceFileTree from '../../components/office/WorkspaceFileTree.vue';
import OfficeDocumentView from '../../components/office/OfficeDocumentView.vue';
import ChatMessageList from '../../components/chat/ChatMessageList.vue';
import ChatInputArea from '../../components/chat/ChatInputArea.vue';
import ChatDialogs from '../../components/chat/ChatDialogs.vue';
import ChatSkillCards from '../../components/chat/ChatSkillCards.vue';
import { useWorkspaceFiles } from '../../composables/office/useWorkspaceFiles';
import { useResizable } from '../../composables/useResizable';
import { officePanel, setOfficePanel } from '../../stores/officeWorkbench';
import { API_BASE, buildRequestHeaders } from '../../api/client';
import { useChat } from '../../composables/chat/useChat';

const { selectedPath } = useWorkspaceFiles();
/** 工作目录选择弹窗与聊天页共用同一个（见 ChatDialogs） */
const { showWorkspaceDir } = useChat();
const isManual = computed(() => officePanel.value === 'manual');

const treeR = useResizable('office_tree', 264, 200, 480);
const aiR = useResizable('office_ai', 380, 300, 720);
const { width: treeW } = treeR;
const { width: aiW } = aiR;

const fileName = computed(() => {
  const p = selectedPath.value;
  if (!p) return '';
  return p.split(/[\\/]/).pop() || p;
});
const fileSub = computed(() => {
  if (!selectedPath.value) return '从左侧选择或新建文档';
  return '只读预览 · 编辑请用本机应用';
});

function extOf(p: string): string {
  const i = p.lastIndexOf('.');
  return i >= 0 ? p.slice(i).toLowerCase() : '';
}

async function exportFile() {
  const p = selectedPath.value;
  if (!p) return;
  const name = fileName.value || 'document';
  try {
    const electronAPI = (window as unknown as { electronAPI?: any }).electronAPI;
    if (electronAPI?.dialog?.saveFile) {
      const r = await electronAPI.dialog.saveFile({ defaultName: name, sourcePath: p });
      if (r?.ok) ElMessage.success('已导出到 ' + r.path);
      else if (r && !r.cancelled) ElMessage.error('导出失败: ' + (r.error || '未知错误'));
      return;
    }
    const res = await fetch(`${API_BASE}/office/export?path=${encodeURIComponent(p)}`, { headers: buildRequestHeaders() });
    if (!res.ok) { ElMessage.error(`导出失败（HTTP ${res.status}）`); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e: any) {
    ElMessage.error('导出失败: ' + (e?.message || e));
  }
}

function openLocal() {
  const p = selectedPath.value;
  if (!p) return;
  const electronAPI = (window as unknown as { electronAPI?: any }).electronAPI;
  if (electronAPI?.shell?.openPath) {
    void electronAPI.shell.openPath(p).catch(() => ElMessage.error('本机打开失败'));
    return;
  }
  ElMessage.info('仅桌面端支持用本机应用打开');
}

</script>

<style src="../chat.css"></style>

<style scoped>
.office-wb {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  background: var(--color-bg);
}
.wb-tree {
  flex: 0 0 var(--wb-tree-w, 264px);
  width: var(--wb-tree-w, 264px);
  min-width: 0;
}
.wb-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}
.wb-main-head {
  flex: 0 0 42px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}
.wb-main-title { min-width: 0; display: flex; align-items: baseline; gap: 10px; }
.wb-file-name {
  font-size: 12.5px; font-weight: 600; color: var(--color-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 380px;
}
.wb-file-sub { font-size: 11px; color: var(--color-text-tertiary); white-space: nowrap; }
.wb-main-actions { margin-left: auto; display: flex; gap: 6px; flex-shrink: 0; }

.wb-ai {
  flex: 0 0 var(--wb-ai-w, 380px);
  width: var(--wb-ai-w, 380px);
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border);
  background: var(--color-surface);
}
.wb-ai-head {
  flex: 0 0 42px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-bottom: 1px solid var(--color-border);
}
.wb-ai-title { font-size: 12px; font-weight: 600; color: var(--color-text); }
.wb-seg {
  margin-left: auto;
  display: flex; gap: 2px; padding: 3px;
  border-radius: 8px; background: var(--color-bg);
}
.wb-seg button {
  border: none; background: transparent; padding: 4px 12px; border-radius: 6px;
  font-size: 11.5px; color: var(--color-text-secondary); cursor: pointer; font-family: inherit;
}
.wb-seg button.on {
  background: var(--color-surface); color: var(--color-text); font-weight: 600;
  box-shadow: 0 1px 2px rgba(20, 23, 30, 0.08);
}
.wb-chat { flex: 1; min-height: 0; }

/* ===== 人工模式：右栏收成窄条 ===== */
.office-wb.manual .wb-ai {
  flex-basis: 56px;
  width: 56px;
  background: var(--color-bg);
}
.office-wb.manual .wb-ai-head { justify-content: center; padding: 8px 0; flex: 0 0 auto; }
.office-wb.manual .wb-ai-title { display: none; }
.office-wb.manual .wb-seg { margin: 0; flex-direction: column; padding: 2px; }
.office-wb.manual .wb-seg button { padding: 4px 6px; }
.wb-manual {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; gap: 14px; padding-top: 14px;
}
.wb-manual-btn {
  width: 34px; height: 34px; border: none; border-radius: 9px;
  display: grid; place-items: center; background: transparent;
  color: var(--color-text-secondary); cursor: pointer;
}
.wb-manual-btn:hover { background: var(--glass-bg-hover); color: var(--color-text); }
.wb-manual-label {
  writing-mode: vertical-rl;
  font-size: 11px; letter-spacing: 0.2em; color: var(--color-text-tertiary);
}

@media (max-width: 1100px) {
  .office-wb { flex-direction: column; }
  .wb-tree { flex: 0 0 220px; width: 100%; border-right: none; border-bottom: 1px solid var(--color-border); }
  .wb-ai { flex: 1 1 auto; width: 100%; border-left: none; border-top: 1px solid var(--color-border); }
  .office-wb.manual .wb-ai { flex-basis: 52px; width: 100%; }
  .office-wb.manual .wb-seg { flex-direction: row; }
  .wb-manual { flex-direction: row; justify-content: center; padding: 8px; }
  .wb-manual-label { writing-mode: horizontal-tb; }
}
</style>
