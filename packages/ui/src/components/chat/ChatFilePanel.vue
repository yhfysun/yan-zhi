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
        <!-- ── 本任务：会话级产物（跟随当前会话，三分类）── -->
        <div class="file-section-label">本任务</div>
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
              v-on="bindLongPress((ev) => openFileMenu(ev, f))"
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

        <!-- ── 项目资源：目录级资源（跨会话共享，四段）── -->
        <template v-if="spaceStore.currentSpaceId">
          <div class="file-section-label file-section-label-res">
            项目资源
            <span class="file-section-hint">{{ currentTaskTypeLabel }}</span>
          </div>
          <div v-for="d in resourceDirs" :key="d.dir" class="conv-file-group">
            <div class="conv-file-group-header" @click="toggleResourceGroup(d.dir)">
              <el-icon class="collapse-icon" :class="{ collapsed: !expandedResourceDirs[d.dir] }">
                <ArrowDown v-if="expandedResourceDirs[d.dir]" /><ArrowRight v-else />
              </el-icon>
              <span class="conv-file-group-name">{{ d.label }}</span>
              <el-tag size="small" type="info" effect="plain" round>{{ (resourceCounts[d.dir] || 0) }}</el-tag>
            </div>
            <div v-show="expandedResourceDirs[d.dir]" class="conv-file-group-body">
<div
              v-for="f in (resourceFiles[d.dir] || [])"
              :key="f.path"
              class="file-panel-item"
              @click="previewResource(f, d.dir)"
              @contextmenu.prevent="openResourceMenu($event, f)"
              v-on="bindLongPress((ev) => openResourceMenu(ev, f))"
            >
                <el-icon :size="16" class="file-item-icon"><FolderOpened /></el-icon>
                <div class="file-item-info">
                  <span class="file-item-name">{{ f.name }}</span>
                  <span class="file-item-meta">{{ f.isDir ? '目录' : formatSize(f.size) }}</span>
                </div>
              </div>
              <div v-if="(resourceFiles[d.dir] || []).length === 0" class="conv-file-empty">
                {{ d.hint }}
              </div>
            </div>
          </div>
        </template>
        <div v-else class="conv-file-empty file-res-no-space">选中一个空间后可查看该目录的项目资源</div>
      </div>
      <input ref="filePanelUploadRef" type="file" multiple style="display:none" @change="handleFilePanelUpload" />
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { FolderOpened, UploadFilled, ArrowDown, ArrowRight, Files } from '@element-plus/icons-vue';
import type { ConversationFile } from '@yan-zhi/shared';
import { RESOURCE_DIRS, getTaskType } from '@yan-zhi/shared';
import { useChat } from '../../composables/chat/useChat';
import { useSpaceStore } from '../../stores/space';
import { openMediaMenu } from '../../composables/useMediaPreview';
// 移动端：文件项没有右键，长按即弹出「另存为 / 打开目录 / 复制」菜单
import { bindLongPress } from '../../composables/useLongPress';

const {
  store, fileCategories, expandedFileCategories, fileStore, previewInPopup,
  formatSize, triggerFilePanelUpload, filePanelUploadRef, handleFilePanelUpload,
} = useChat();

const spaceStore = useSpaceStore();

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i;
/** 音频产物（配音 / TTS）—— 用于右键菜单走媒体语义而不是普通文件 */
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|aac|flac|ogg|opus|wma)$/i;

/** 资源目录四段（与后端 shared 同一份定义，避免各写一套） */
const resourceDirs = RESOURCE_DIRS;
/** 每段的展开态（默认收起，避免面板过长；「项目资源」是低频查看） */
const expandedResourceDirs = ref<Record<string, boolean>>({});
const resourceFiles = ref<Record<string, Array<{ name: string; path: string; size: number; mtime: number; isDir: boolean }>>>({});
const resourceCounts = ref<Record<string, number>>({});

const currentTaskTypeLabel = computed(() => {
  const t = spaceStore.currentSpace?.taskType;
  return getTaskType(t).label;
});

/** 拉某段资源目录的内容（懒加载：首次展开时才请求） */
async function loadResourceSection(dir: string) {
  const sid = spaceStore.currentSpaceId;
  if (!sid) return;
  const list = await spaceStore.listResourceDir(sid, dir);
  resourceFiles.value = { ...resourceFiles.value, [dir]: list };
  resourceCounts.value = { ...resourceCounts.value, [dir]: list.length };
}

function toggleResourceGroup(dir: string) {
  const next = !expandedResourceDirs.value[dir];
  expandedResourceDirs.value = { ...expandedResourceDirs.value, [dir]: next };
  if (next && !resourceFiles.value[dir]) void loadResourceSection(dir);
}

/** 面板打开 / 换空间时刷新「项目资源」概览 */
watch(
  () => [store.showFilePopup, spaceStore.currentSpaceId] as const,
  async ([open, sid]) => {
    if (!open || !sid) return;
    const overview = await spaceStore.loadSpaceResources(sid);
    const counts: Record<string, number> = {};
    for (const o of overview) counts[o.dir] = o.count;
    resourceCounts.value = counts;
    // 已展开的段同步刷新内容
    for (const dir of Object.keys(expandedResourceDirs.value)) {
      if (expandedResourceDirs.value[dir]) void loadResourceSection(dir);
    }
  },
  { immediate: true },
);

/**
 * 资源项预览。
 *
 * ★ 必须带上 `spaceId + resourceDir`（2026-09-27 修的真实缺陷）：
 *   资源文件在**服务端空间目录**下，且没登记进 conversation_file ——
 *   Web 端的 fs 适配器只认用户授权过的根句柄，拿到服务端绝对路径必解析失败，
 *   而既有的 file-path 兜底又依赖 conversationId。带上这两个字段后，
 *   FilePreview 能退化到「按空间 + 资源目录 + 文件名」向服务端直读（两端一致可用）。
 */
function previewResource(f: { name: string; path: string; isDir: boolean }, dir: string) {
  if (f.isDir) return; // 目录不预览
  store.openTab({
    kind: 'file',
    name: f.name,
    path: f.path,
    spaceId: spaceStore.currentSpaceId || undefined,
    resourceDir: dir,
  });
}

/**
 * 文件项右键 → 复用媒体菜单（另存为 / 打开所在目录 / 复制路径）。
 * 图片额外提供放大查看与复制图片，其余文件只给文件类操作。
 */
function openFileMenu(e: MouseEvent, f: ConversationFile) {
  const isImage = (f.mimeType || '').startsWith('image/') || IMAGE_EXT_RE.test(f.name || '');
  const isAudio = (f.mimeType || '').startsWith('audio/') || AUDIO_EXT_RE.test(f.name || '');
  openMediaMenu(e, {
    src: '',
    path: f.path,
    name: f.name,
    kind: isImage ? 'image' : isAudio ? 'audio' : 'file',
  });
}

/** 资源项菜单：与文件项同构（图片给放大/复制，音频走音频语义，其余给文件操作） */
function openResourceMenu(e: MouseEvent, f: { name: string; path: string; isDir: boolean }) {
  if (f.isDir) return;
  const isImage = IMAGE_EXT_RE.test(f.name || '');
  const isAudio = AUDIO_EXT_RE.test(f.name || '');
  openMediaMenu(e, {
    src: '',
    path: f.path,
    name: f.name,
    kind: isImage ? 'image' : isAudio ? 'audio' : 'file',
  });
}
</script>