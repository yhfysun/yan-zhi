<template>
  <div class="deliverable-grid">
    <div v-for="f in files" :key="f.id" class="deliverable-file-card" @click="preview(f)">
      <span class="deliverable-file-name" :title="f.name">{{ f.name }}</span>
      <div class="deliverable-file-bottom">
        <span class="deliverable-file-meta">{{ formatTime(f.createdAt) }}</span>
        <div class="deliverable-file-actions" @click.stop>
          <el-tooltip content="下载" placement="top"><el-button text size="small" circle @click="download(f)"><el-icon><Download /></el-icon></el-button></el-tooltip>
          <el-tooltip v-if="canReveal" content="打开文件夹" placement="top"><el-button text size="small" circle @click="reveal(f)"><el-icon><FolderOpened /></el-icon></el-button></el-tooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Download, FolderOpened } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed } from 'vue';
import type { ConversationFile } from '@yan-zhi/shared';
import { getPlatformAdapter } from '@yan-zhi/core';
import { useChatStore } from '../../stores/chat';

const props = defineProps<{ files: ConversationFile[] }>();

const adapter = getPlatformAdapter();
const canReveal = computed(() => !!adapter.shell && adapter.platform === 'desktop');

/** 格式化修改时间：MM-DD HH:mm */
function formatTime(t: number | string | undefined): string {
  if (!t) return '';
  const d = typeof t === 'number' ? new Date(t) : new Date(t);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 点击卡片即预览 */
function preview(f: ConversationFile) {
  const store = useChatStore();
  store.openTab({ kind: 'file', name: f.name, path: f.path });
  store.showFilePopup = false;
}

async function download(f: ConversationFile) {
  try {
    const base64 = await adapter.fs.readFileBase64(f.path);
    const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bin], { type: f.mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e: any) {
    ElMessage.error('下载失败: ' + (e?.message || e));
  }
}

async function reveal(f: ConversationFile) {
  if (!adapter.shell) return;
  try {
    const p = f.path;
    const isWin = /win/i.test(navigator.platform);
    const isMac = /mac/i.test(navigator.platform);
    if (isWin) {
      await adapter.shell.exec('explorer.exe', [`/select,${p}`]);
    } else if (isMac) {
      await adapter.shell.exec('open', ['-R', p]);
    } else {
      const sep = p.includes('/') ? '/' : '\\';
      const dir = p.slice(0, p.lastIndexOf(sep)) || p;
      await adapter.shell.exec('xdg-open', [dir]);
    }
  } catch (e: any) {
    ElMessage.error('打开文件夹失败: ' + (e?.message || e));
  }
}
</script>

<style scoped>
/* 卡片网格：最大宽度 140px，紧凑 */
.deliverable-grid {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(110px, 100%), 140px));
  gap: 6px;
  justify-content: start;
}
.deliverable-file-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 5px 7px;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: var(--glass-bg);
  cursor: pointer;
  transition: border-color .15s, box-shadow .15s, background .15s;
}
.deliverable-file-card:hover {
  border-color: var(--color-primary);
  background: var(--glass-bg-hover);
  box-shadow: 0 1px 6px color-mix(in srgb, var(--color-primary) 20%, transparent);
}
/* 文件名：一行省略，hover 时展开完整显示 */
.deliverable-file-name {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

}
/* 底部一行：修改时间 + 按钮组横向排列 */
.deliverable-file-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}
.deliverable-file-meta {
  font-size: 10.5px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}
.deliverable-file-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  opacity: 0.55;
  transition: opacity .15s;
}
.deliverable-file-card:hover .deliverable-file-actions {
  opacity: 1;
}
.deliverable-file-actions :deep(.el-button) {
  width: 18px;
  height: 18px;
  padding: 0;
}
.deliverable-file-actions :deep(.el-icon) {
  font-size: 11px;
}
</style>
