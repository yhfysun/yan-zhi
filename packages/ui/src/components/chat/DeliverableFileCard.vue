<template>
  <div class="deliverable-grid" ref="gridRef" :style="gridStyle">
    <div
      v-for="f in visibleFiles"
      :key="f.id"
      class="deliverable-file-card"
      :class="{ 'has-thumb': hasThumb(f) }"
      @click="preview(f)"
      @contextmenu.prevent="openMenu($event, f)"
      v-on="bindLongPress((ev) => openMenu(ev, f))"
    >
      <!-- 视频交付物：静止显示首帧；hover 走 body 级浮层放大并静音自动播 5 秒；双击进灯箱播放 -->
      <video
        v-if="isVideo(f) && !missingFiles[f.id]"
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
        v-else-if="isImage(f) && !missingFiles[f.id]"
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
      <!-- 文件已不存在占位：主源 404 + 回退不可用/回退也失败时显示（不再静默裂图/报 file:// 拦截） -->
      <div v-else-if="missingFiles[f.id]" class="deliverable-thumb missing-thumb">文件已不存在</div>
      <span class="deliverable-file-name" :title="f.name">{{ f.name }}</span>
      <div class="deliverable-file-bottom">
        <span class="deliverable-file-meta">{{ formatTime(f.createdAt) }}</span>
        <div class="deliverable-file-actions" @click.stop>
          <el-tooltip content="下载" placement="top"><el-button text size="small" circle @click="download(f)"><el-icon><Download /></el-icon></el-button></el-tooltip>
          <el-tooltip v-if="canReveal" content="打开文件夹" placement="top"><el-button text size="small" circle @click="reveal(f)"><el-icon><FolderOpened /></el-icon></el-button></el-tooltip>
        </div>
      </div>
    </div>
    <!-- 超过两行折叠：占一个格位的「更多 (N) / 收起」钮（与文件卡同宽同列） -->
    <button v-if="showToggle" type="button" class="deliverable-more-btn" @click="expanded = !expanded">
      {{ expanded ? '收起' : `更多 (${hiddenCount})` }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { Download, FolderOpened } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, ref, onBeforeUnmount, onMounted, watch } from 'vue';
import type { ConversationFile } from '@yan-zhi/shared';
import { getPlatformAdapter } from '@yan-zhi/core';
import { useChatStore } from '../../stores/chat';
import { toWindowsPath } from '../../utils/file-open';
import {
  absoluteMediaSrc,
  openMediaMenu,
  openMediaViewer,
  openMediaHover,
  closeMediaHover,
  type MediaTarget,
} from '../../composables/useMediaPreview';
// 移动端：交付物卡片没有右键，长按即弹出「另存为 / 打开目录 / 复制」菜单
import { bindLongPress } from '../../composables/useLongPress';

const props = defineProps<{ files: ConversationFile[] }>();

const adapter = getPlatformAdapter();
const canReveal = computed(() => !!adapter.shell && adapter.platform === 'desktop');

/* ===== 宽度双因素 + 两行折叠（2026-10-18）=====
 * 缺陷：助手侧 .msg-body 是 shrink-to-fit（align-items:flex-start 且无 flex:1），
 * 正文短 → 整条消息收窄；而 auto-fill 网格在"可用宽度不确定"（内在尺寸阶段）下
 * 退化为单列 COL_MIN 级别 → 「正文短 + 文件多」= 一行一个、纵向爆长。
 * 修法（两方面考虑，不是简单脱钩）：
 *   · 正文长 → 消息本来就宽 → 网格 auto-fill 自然多列（文件数量决定行数）；
 *   · 正文短 → 网格按文件数量给 min-width 保底列数，自己把消息撑宽；
 *   · 任何时刻超过两行 → 折叠成「更多 (N)」钮，点开展开全部。
 * 100vw 兜底：min-width 里带 calc(100vw - 120px) 上限（聊天列 820px 居中 + 内边距/头像
 * 约 108px），窄窗口/移动端自动让位，不会横向溢出。本组件目前只在聊天列挂载。 */
const COL_MAX = 140;   // 单卡最大宽度：一行 5 个（736px 内容宽 ÷5≈140），与 <style> 列定义一致
const COL_MIN = 100;   // 单卡最小宽度（窄容器收缩下限）
const GRID_GAP = 6;    // 与 <style> gap 一致
const MAX_ROWS = 2;    // 折叠前最多展示行数

/** 按文件数量保底列数：≥5 个文件保 5 列（140×5+gap 恰好放进 736px 内容宽），少则按实际数保 */
const gridStyle = computed(() => {
  const n = props.files.length;
  if (!n) return undefined;
  const cols = Math.min(5, n);
  const w = cols * COL_MAX + (cols - 1) * GRID_GAP;
  return { minWidth: `min(${w}px, calc(100vw - 120px))` };
});

const gridRef = ref<HTMLElement | null>(null);
const expanded = ref(false);
/** 实测每行列数（容器宽度变化时跟随）；挂载前按桌面 3 列兜底 */
const perRow = ref(3);
let ro: ResizeObserver | null = null;
onMounted(() => {
  ro = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width || 0;
    if (w > 0) perRow.value = Math.max(1, Math.floor((w + GRID_GAP) / (COL_MAX + GRID_GAP)));
  });
  if (gridRef.value) ro.observe(gridRef.value);
});
onBeforeUnmount(() => { ro?.disconnect(); ro = null; });

/** 折叠容量：两行减去「更多」钮占的一个格位；每行 1 列的窄屏至少保 2 个 */
const collapseCap = computed(() => Math.max(2, perRow.value * MAX_ROWS - 1));
const isCollapsed = computed(() => !expanded.value && props.files.length > collapseCap.value);
const visibleFiles = computed(() => (isCollapsed.value ? props.files.slice(0, collapseCap.value) : props.files));
const hiddenCount = computed(() => Math.max(0, props.files.length - collapseCap.value));
const showToggle = computed(() => props.files.length > collapseCap.value);
// 换一轮消息（文件集合变化）时复位展开态，不把上一轮的展开带到下一轮
watch(() => props.files.map((f) => f.id).join('|'), () => { expanded.value = false; });

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
/** 文件已不存在：主源 404 且无可用回退（或回退也失败）→ 卡片显示占位，不再静默裂图 */
const missingFiles = ref<Record<string, boolean>>({});
function onThumbError(f: ConversationFile) {
  // ★ 已回退过还失败 = file:// 也读不到 → 文件物理不存在，显示占位（终态，不再循环）
  if (fallbackSrcs.value[f.id]) {
    missingFiles.value = { ...missingFiles.value, [f.id]: true };
    return;
  }
  // ★ file:// 回退只在"页面本身是 file:// 源"（打包版桌面端）下可行；
  //   dev 页面是 http://localhost 源，Chromium 必然拦截 file:// 子资源
  //   （报 "Not allowed to load local resource"，实测误导排障——多数是文件真没了）。
  //   dev 下直接进"文件已不存在"占位，不再发起必然失败的请求。
  if (window.location.protocol !== 'file:') return;
  if (adapter.platform !== 'desktop') return;        // Web 端无本地文件可读
  const raw = (f.path || '').replace(/\\/g, '/');
  if (!raw) { missingFiles.value = { ...missingFiles.value, [f.id]: true }; return; }
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
  // ★ 必须带上 conversationId：FilePreview 的会话产物通道（file-stream，跨根探测+登记兜底）
  //   以它为前提 —— 漏传会退化到 workspace/file-stream，少一层兜底（2026-10-04）。
  store.openTab({ kind: 'file', name: f.name, path: f.path, conversationId: f.conversationId });
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
    // ★ 必须转成纯反斜杠：登记路径可能是 `C:\a/03-output\b.mp4` 这种混合分隔符，
    //   explorer 对 /select 的混合路径会静默失败并退化成打开默认目录（用户报「跳到文档」）。
    const p = toWindowsPath(f.path);
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
/* 卡片网格：一行 5 个（2026-10-18 用户拍板：密度优先，列宽回到 140px）；min-width 保底见脚本 gridStyle */
.deliverable-grid {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100px, 100%), 140px));
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
/* 文件已不存在占位：与缩略图同尺寸，灰底细字，不抢视觉 */
.missing-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  cursor: default;
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
  width: 15px;
  height: 15px;
  padding: 0;
}
.deliverable-file-actions :deep(.el-icon) {
  font-size: 10px;
}
/* 超两行折叠钮：与文件卡同格位，虚线边框弱化存在感，hover 才点亮 */
.deliverable-more-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 5px 7px;
  border: 1px dashed var(--glass-border);
  border-radius: 8px;
  background: transparent;
  font-size: 12px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: border-color .15s, color .15s, background .15s;
}
.deliverable-more-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--glass-bg-hover);
}
</style>
