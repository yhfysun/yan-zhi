<template>
  <el-popover
    v-model:visible="store.showFilePopup"
    placement="bottom-end"
    :width="440"
    trigger="click"
    popper-class="file-mgr-popover"
    :show-arrow="true"
  >
    <template #reference>
      <el-button size="small" circle :type="store.showFilePopup ? 'primary' : ''" title="文件管理" aria-label="文件管理">
        <el-icon><FolderOpened /></el-icon>
      </el-button>
    </template>
    <div class="file-mgr-pop">
      <div class="file-mgr-pop-header">
        <span class="file-mgr-pop-title">文件管理</span>
        <el-button size="small" circle @click="triggerFilePanelUpload" title="上传文件">
          <el-icon><UploadFilled /></el-icon>
        </el-button>
      </div>
      <div class="file-panel-list conv-file-list file-mgr-pop-list">
        <div v-for="cat in fileCategories" :key="cat.key" class="conv-file-group">
          <div class="conv-file-group-header" @click="expandedFileCategories[cat.key] = !expandedFileCategories[cat.key]">
            <el-icon class="collapse-icon" :class="{ collapsed: !expandedFileCategories[cat.key] }">
              <ArrowDown v-if="expandedFileCategories[cat.key]" /><ArrowRight v-else />
            </el-icon>
            <span class="conv-file-group-name">{{ cat.label }}</span>
            <el-tag size="small" type="info" effect="plain" round>{{ (fileStore.filesByCategory[cat.key] || []).length }}</el-tag>
          </div>
          <div v-show="expandedFileCategories[cat.key]" class="conv-file-group-body">
            <div
              v-for="f in (fileStore.filesByCategory[cat.key] || [])"
              :key="f.id"
              class="file-panel-item"
              :class="{ active: store.previewingFile?.path === f.path }"
              @click="previewInPopup(f)"
              @contextmenu.prevent="openFileMenu($event, f)"
            >
              <el-icon :size="16" class="file-item-icon"><Files /></el-icon>
              <div class="file-item-info">
                <span class="file-item-name">{{ f.name }}</span>
                <span class="file-item-meta">{{ formatSize(f.size) }} · {{ f.source === 'user' ? '上传' : '产出' }}</span>
              </div>
            </div>
            <div v-if="(fileStore.filesByCategory[cat.key] || []).length === 0" class="conv-file-empty">暂无{{ cat.label }}</div>
          </div>
        </div>
      </div>
      <input ref="filePanelUploadRef" type="file" multiple style="display:none" @change="handleFilePanelUpload" />
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { FolderOpened, UploadFilled, ArrowDown, ArrowRight, Files } from '@element-plus/icons-vue';
import type { ConversationFile } from '@yan-zhi/shared';
import { useChat } from '../../composables/chat/useChat';
import { openMediaMenu } from '../../composables/useMediaPreview';

const {
  store, fileCategories, expandedFileCategories, fileStore, previewInPopup,
  formatSize, triggerFilePanelUpload, filePanelUploadRef, handleFilePanelUpload,
} = useChat();

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i;

/**
 * 文件项右键 → 复用媒体菜单（另存为 / 打开所在目录 / 复制路径）。
 * 图片额外提供放大查看与复制图片，其余文件只给文件类操作。
 */
function openFileMenu(e: MouseEvent, f: ConversationFile) {
  const isImage = (f.mimeType || '').startsWith('image/') || IMAGE_EXT_RE.test(f.name || '');
  openMediaMenu(e, {
    src: '',
    path: f.path,
    name: f.name,
    kind: isImage ? 'image' : 'file',
  });
}
</script>
