<template>
  <div class="deliverable-grid">
    <div
      v-for="f in files"
      :key="f.id"
      class="deliverable-file-card"
      :class="{ 'has-thumb': hasThumb(f) }"
      @click="preview(f)"
      @contextmenu.prevent="openMenu($event, f)"
    >
      <!-- 视频交付物：静止显示首帧；hover 走 body 级浮层放大并静音自动播 5 秒；双击进灯箱播放 -->
      <video
        v-if="isVideo(f)"
        class="deliverable-thumb"
        :src="thumbSrc(f)"
        preload="metadata"
        muted
        playsinline
        @error="onThumbError(f)"
        @mouseenter="onThumbEnter($event, f)"
        @mouseleave="onThumbLeave"
        @dblclick.stop="zoom(f)"
      ></video>
      <!-- 图片交付物：同卡片尺寸缩略；hover 走同一套浮层放大；双击进灯箱（滚轮缩放） -->
      <img
        v-else-if="isImage(f)"
        class="deliverable-thumb"
        :src="thumbSrc(f)"
        :alt="f.name"
        loading="lazy"
        draggable="false"
        @error="onThumbError(f)"
        @mouseenter="onThumbEnter($event, f)"
        @mouseleave="onThumbLeave"
        @dblclick.stop="zoom(f)"
      />
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
import { computed, ref, onBeforeUnmount } from 'vue';
import type { ConversationFile } from '@yan-zhi/shared';
import { getPlatformAdapter } from '@yan-zhi/core';
import { useChatStore } from '../../stores/chat';
import {
  absoluteMediaSrc,
  openMediaMenu,
  openMediaViewer,
  openMediaHover,
  closeMediaHover,
  type MediaTarget,
} from '../../composables/useMediaPreview';

const props = defineProps<{ files: ConversationFile[] }>();

const adapter = getPlatformAdapter();
const canReveal = computed(() => !!adapter.shell && adapter.platform === 'desktop');

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogg)$/i;

function isVideo(f: ConversationFile): boolean {
  return (f.mimeType || '').startsWith('video/') || VIDEO_EXT_RE.test(f.name || '');
}
function isImage(f: ConversationFile): boolean {
  return (f.mimeType || '').startsWith('image/') || IMAGE_EXT_RE.test(f.name || '');
}
/** 图片 / 视频才有缩略图；其余（docx / md / xlsx…）只出文件名卡 */
function hasThumb(f: ConversationFile): boolean {
  return isVideo(f) || isImage(f);
}

/**
 * 媒体访问地址：统一走服务端 /api/generated 三段式（会话 id + 文件名唯一定位到交付目录）。
 * 桌面端也一样 —— 直接把本地绝对路径喂给 <img>/<video> 是不成立的：
 * 渲染进程页面是 http(s) 源，`C:/...` 会被 URL 解析器当成 c: 协议，图直接裂。
 * 只有拿不到会话 id 的历史数据才退回本地路径（至少还能交给系统打开）。
 */
function plainSrc(f: ConversationFile): string {
  const name = (f.name || '').replace(/[?#].*$/, '');
  if (f.conversationId && name) {
    const kind = isVideo(f) ? 'videos' : 'images';
    return absoluteMediaSrc(`/api/generated/${kind}/${f.conversationId}/${encodeURIComponent(name)}`);
  }
  return (f.path || '').replace(/\\/g, '/');
}

/** 缩略图地址：视频补 #t=0.1 媒体片段，preload=metadata 即渲染出首帧画面 */
function thumbSrc(f: ConversationFile): string {
  // 已触发过加载失败的文件改用本地绝对路径直读（见 onThumbError）
  if (fallbackSrcs.value[f.id]) return fallbackSrcs.value[f.id]!;
  const src = plainSrc(f);
  if (!src) return '';
  if (isVideo(f)) return src.includes('#') ? src : `${src}#t=0.1`;
  return src;
}

/**
 * 缩略图加载失败时的回退：桌面端改用 file:// 直读本地文件。
 *
 * 为什么需要：plainSrc 走的是服务端 /api/generated 三段式，若服务端未启动、
 * 路由 404（如文件名不在白名单）或产物已被清理，图会裂且没有任何提示。
 * 桌面端页面本身是 file:// 源，本地文件可直接读，作为最后兜底。
 * 只在第一次失败时切换（避免失败→换源→再失败的死循环）。
 */
const fallbackSrcs = ref<Record<string, string>>({});
function onThumbError(f: ConversationFile) {
  if (fallbackSrcs.value[f.id]) return;              // 已回退过，不再重复
  if (adapter.platform !== 'desktop') return;        // Web 端无本地文件可读
  const raw = (f.path || '').replace(/\\/g, '/');
  if (!raw) return;
  const url = raw.startsWith('/') ? `file://${raw}` : `file:///${raw}`;
  fallbackSrcs.value = { ...fallbackSrcs.value, [f.id]: f.conversationId && isVideo(f) ? `${url}#t=0.1` : url };
}

/** 交付文件 → 统一媒体对象：hover 浮层 / 灯箱 / 右键菜单共用同一份描述 */
function mediaOf(f: ConversationFile): MediaTarget {
  const kind = isVideo(f) ? 'video' : isImage(f) ? 'image' : 'file';
  return { src: plainSrc(f), path: f.path, name: f.name, kind };
}

/* ===== hover：统一走 MediaHoverFloat（body 级浮层），卡内放大必被容器裁剪，故不在卡内做 transform ===== */
function onThumbEnter(ev: MouseEvent, f: ConversationFile) {
  const el = ev.currentTarget as HTMLElement | null;
  if (!el) return;
  openMediaHover(el, mediaOf(f));
}
function onThumbLeave() {
  closeMediaHover();
}
/** 双击进灯箱：图片放大查看（滚轮缩放），视频全屏播放 */
function zoom(f: ConversationFile) {
  openMediaViewer(mediaOf(f));
}
/** 右键 → 复用媒体菜单：放大查看 / 播放 · 另存为… · 打开所在目录 · 复制图片 · 复制路径 */
function openMenu(e: MouseEvent, f: ConversationFile) {
  openMediaMenu(e, mediaOf(f));
}
onBeforeUnmount(() => closeMediaHover());

/** 格式化修改时间：MM-DD HH:mm */
function formatTime(t: number | string | undefined): string {
  if (!t) return '';
  const d = typeof t === 'number' ? new Date(t) : new Date(t);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 单击卡片即预览（打开右侧预览窗 tab） */
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
/* 图片 / 视频缩略：占卡片主体，底部压文件名条；放大交给 body 级浮层，卡内不改尺寸 */
.deliverable-thumb {
  width: 100%;
  height: 72px;
  object-fit: cover;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.35);
  display: block;
  user-select: none;
}
.deliverable-file-card.has-thumb .deliverable-file-name {
  font-size: 11.5px;
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
