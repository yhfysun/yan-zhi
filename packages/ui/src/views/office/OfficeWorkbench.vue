<!--
  OfficeWorkbench.vue — 办公工作台（2026-11-02，P2）

  办公室模式的「人工」形态：工作区文件树 ｜ 文档/表格/演示画布 ｜ 人工窄条。
  「AI」形态就是聊天页本身（/chat）；切换入口在聊天顶栏的 AI / 人工 segmented。
  人工模式不调用任何模型，右栏只保留切回 AI 的按钮。
-->
<template>
  <div class="office-wb" :style="{ '--wb-tree-w': treeW + 'px' }">
    <!-- 左：文件树 -->
    <WorkspaceFileTree ref="treeRef" class="wb-tree" />
    <div class="rs-handle" @mousedown="treeR.startDrag($event, 'left')"></div>

    <!-- 中：画布 -->
    <section class="wb-main">
      <header class="wb-main-head">
        <div class="wb-main-title">
          <span class="wb-file-name">{{ fileName || '办公工作台' }}</span>
          <span class="wb-file-sub">{{ fileSub }}</span>
        </div>
        <div v-if="selectedPath" class="wb-main-actions">
          <el-button size="small" :icon="Download" @click="exportFile">{{ exportLabel }}</el-button>
          <el-button size="small" :icon="Link" @click="openLocal">本机打开</el-button>
        </div>
      </header>

      <!-- 空态：没有选择文件时给出明确的下一步，而不是一片空白 -->
      <div v-if="!selectedPath" class="wb-empty">
        <div class="wb-empty-icon"><el-icon :size="26"><Files /></el-icon></div>
        <h3 class="wb-empty-title">选择或新建一份文件</h3>
        <p class="wb-empty-desc">
          左侧工作区支持 Word、Excel、PPT、Markdown、文本与代码文件；
          选中后可以在这里直接查看和编辑。
        </p>
        <div class="wb-empty-actions">
          <el-button type="primary" :icon="Plus" @click="treeRef?.doCreate('doc')">新建文档</el-button>
          <el-button v-if="!rootDir" :icon="FolderOpened" @click="showWorkspaceDir = true">选择工作目录</el-button>
          <el-button v-else :icon="Refresh" @click="refresh()">刷新工作区</el-button>
        </div>
      </div>

      <div v-else class="wb-editor">
        <FilePreview v-if="useFilePreview" ref="editorRef" :file="{ name: fileName, path: selectedPath }" />
        <OfficeDocumentView v-else :path="selectedPath" />
      </div>

      <!-- 人工 → AI：与开发模式同一形态的右下角悬浮按钮 -->
      <LeadToggle :model-value="'human'" mode="office" @update:model-value="goAi" />
    </section>

    <!-- 聊天共用的弹层：工作目录选择 / 技能卡 / 定时任务等（与聊天页同一套） -->
    <ChatDialogs />
    <ChatSkillCards />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Download, Link, Files, Plus, FolderOpened, Refresh } from '@element-plus/icons-vue';
import WorkspaceFileTree from '../../components/office/WorkspaceFileTree.vue';
import OfficeDocumentView from '../../components/office/OfficeDocumentView.vue';
import FilePreview from '../../components/FilePreview.vue';
import LeadToggle from '../../components/workbench/LeadToggle.vue';
import ChatDialogs from '../../components/chat/ChatDialogs.vue';
import ChatSkillCards from '../../components/chat/ChatSkillCards.vue';
import { useWorkspaceFiles } from '../../composables/office/useWorkspaceFiles';
import { useResizable } from '../../composables/useResizable';
import { officePanel, setOfficePanel } from '../../stores/officeWorkbench';
import { API_BASE, buildRequestHeaders } from '../../api/client';
import { useChat } from '../../composables/chat/useChat';

const { selectedPath, rootDir, refresh } = useWorkspaceFiles();
const treeRef = ref<InstanceType<typeof WorkspaceFileTree> | null>(null);
const editorRef = ref<InstanceType<typeof FilePreview> | null>(null);
/** 工作目录选择弹窗与聊天页共用同一个（见 ChatDialogs） */
const { showWorkspaceDir } = useChat();
const router = useRouter();

/** 办公模式的 AI 形态 = 聊天页本身；工作台只承担「人工」形态 */
function goAi() {
  setOfficePanel('ai');
  void router.push('/chat');
}

// 工作台只承担人工形态：直接打开 /office 且上次停在 AI 时，回到聊天页
onMounted(() => {
  if (officePanel.value === 'ai') void router.replace('/chat');
});
const treeR = useResizable('office_tree', 264, 200, 480);
const { width: treeW } = treeR;

const fileName = computed(() => {
  const p = selectedPath.value;
  if (!p) return '';
  return p.split(/[\\/]/).pop() || p;
});
const fileSub = computed(() => {
  if (!selectedPath.value) return '从左侧选择或新建文档';
  return useFilePreview.value ? '可直接编辑 · 自动保存' : '可编辑文字 · 保存到本机';
});

/** 复用专门的编辑器：FilePreview 支持 md/txt/代码/docx/xlsx/pdf/图片；pptx 走解析视图 */
const useFilePreview = computed(() => {
  const p = selectedPath.value;
  if (!p) return false;
  return !/\.pptx$/i.test(p);
});

const isYdocFile = computed(() => /\.ydoc$/i.test(selectedPath.value));
const exportLabel = computed(() => (isYdocFile.value ? '导出 Word' : '导出'));

async function exportFile() {
  const p = selectedPath.value;
  if (!p) return;
  try {
    // 自定义文档格式 .ydoc：直接走 DocumentCard 的 Word 导出（可编辑图表）
    if (isYdocFile.value) {
      editorRef.value?.exportYdocWord?.();
      return;
    }
    const name = fileName.value || 'document';
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
.wb-editor { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
/* 右下角悬浮的切换按钮（LeadToggle）以画布为定位基准 */
.wb-main { position: relative; }

/* ===== 空态：明确下一步 ===== */
.wb-empty {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
  padding: 32px;
}
.wb-empty-icon {
  width: 56px; height: 56px;
  border-radius: 16px;
  display: grid; place-items: center;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
}
.wb-empty-title { margin: 6px 0 0; font-size: 16px; font-weight: 700; color: var(--color-text); }
.wb-empty-desc {
  max-width: 440px; margin: 0;
  font-size: 12.5px; line-height: 1.8; color: var(--color-text-tertiary);
}
.wb-empty-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; justify-content: center; }

@media (max-width: 1100px) {
  .office-wb { flex-direction: column; }
  .wb-tree { flex: 0 0 220px; width: 100%; border-right: none; border-bottom: 1px solid var(--color-border); }
}
</style>
