<template>
  <div v-if="attachments.length || links.length || annotations.length" class="ual" :class="{ 'has-annos': annotations.length }">
    <!-- 浏览器批注（2026-10-28）：每条一张卡 —— 编号 + 目标 + 组件路径 + 评论。
         正文里那块机器可读文本已由 splitUserContent 剥掉，这里只做人类视图。 -->
    <div v-if="annotations.length" class="ual-annos">
      <div v-for="a in annotations" :key="'anno' + a.index" class="ual-anno">
        <div class="ual-anno-head">
          <span class="ual-anno-idx">{{ a.index }}</span>
          <span class="ual-anno-label">{{ a.label }}</span>
          <button
            v-if="annotationShot && a.index === 1 && shotBroken"
            type="button"
            class="ual-anno-shot"
            title="查看批注时的页面截图"
            @click="openAnnotationShot"
          >
            <el-icon :size="11"><Picture /></el-icon>
            截图
          </button>
        </div>
        <div v-if="a.componentFile" class="ual-anno-comp">{{ a.componentFile }}</div>
        <div v-if="a.selector" class="ual-anno-sel">{{ a.selector }}</div>
        <div v-if="a.comment" class="ual-anno-comment">{{ a.comment }}</div>
        <!-- 截图：能取到就直出缩略图（点开大图），取不到才退回一个「截图」小胶囊 -->
        <img
          v-if="annotationShot && a.index === 1 && !shotBroken"
          class="ual-anno-thumb"
          :src="shotSrc"
          alt="批注截图"
          loading="lazy"
          draggable="false"
          @error="shotBroken = true"
          @click="openAnnotationShot"
        />
      </div>
    </div>

    <!-- 收起态：只留一行概览文字（图片/文件全部不渲染）
         ★ 只有批注、没有附件/链接时整块不渲染 —— 否则会剩一个孤零零的「收起」箭头（实测）。 -->
    <button
      v-if="!expanded && hasFilesOrLinks"
      type="button"
      class="ual-summary"
      title="展开附件"
      @click="expanded = true"
    >
      <el-icon :size="11"><ArrowRight /></el-icon>
      <span>{{ summaryText }}</span>
    </button>

    <!-- 展开态：只显示图/文件本身，不再挂概览文字；收起按钮固定在最右，不随横向滚动跑掉 -->
    <template v-else-if="hasFilesOrLinks">
      <div class="ual-chips">
        <!-- 文件 / 图片附件：挂在用户气泡下方（气泡里只留正文） -->
        <div
          v-for="(a, i) in attachments"
          :key="'f' + i"
          class="ual-item"
          :class="['is-' + a.kind, { 'is-broken': !!a.error }]"
          :title="titleOf(a)"
          role="button"
          tabindex="0"
          @click="onOpen(a)"
          @keydown.enter.prevent="onOpen(a)"
          @keydown.space.prevent="onOpen(a)"
          @mouseenter="onHoverEnter($event, a)"
          @mouseleave="onHoverLeave()"
          @contextmenu.prevent="onMenu($event, a)"
        >
          <template v-if="a.kind === 'image' && srcOf(a) && !broken[a.path || a.name]">
            <img
              class="ual-thumb"
              :src="srcOf(a)"
              :alt="a.name"
              loading="lazy"
              draggable="false"
              @error="onThumbError(a)"
            />
          </template>
          <template v-else>
            <el-icon class="ual-icon" :size="13">
              <Folder v-if="a.kind === 'folder'" />
              <Picture v-else-if="a.kind === 'image'" />
              <Document v-else />
            </el-icon>
            <span class="ual-name">{{ a.name }}</span>
            <span v-if="a.sizeText" class="ual-size">{{ a.sizeText }}</span>
            <span v-if="a.error" class="ual-flag">保存失败</span>
            <!-- 文本类文件：一键挂进对话输入框（常显，hover 才上色） -->
            <button
              v-if="canReference(a)"
              type="button"
              class="ual-ref"
              title="引用到对话：挂进输入框，补充指令后发送"
              @click.stop="onReference(a)"
            >
              <el-icon :size="11"><Link /></el-icon><span>引用</span>
            </button>
          </template>
        </div>

        <!-- 网页引用：一条链接一个胶囊；点击优先在应用内浏览器打开（无内置浏览器才回落系统） -->
        <button
          v-for="(l, i) in links"
          :key="'l' + i"
          type="button"
          class="ual-link"
          :title="l.url"
          @click="openLink(l)"
        >
          <el-icon class="ual-icon" :size="12"><Link /></el-icon>
          <span class="ual-name">{{ l.name }}</span>
        </button>
      </div>

      <button type="button" class="ual-fold" title="收起附件" @click="expanded = false">
        <el-icon :size="12"><ArrowUp /></el-icon>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 用户消息的附件 / 引用胶囊（2026-10-28）。
 *
 * 发送时文件路径是**纯文本**拼进正文的（智能体要读），此前整段露在紫色气泡里。
 * 这里把解析好的附件渲染成气泡下方的预览：图片给缩略图（点开灯箱）、
 * 其它文件给图标+名称+大小（点开站内预览），失败的落盘只给失败标记。
 *
 * 缩略图地址走 `/api/workspace/file-stream?path=`：上传文件在会话产物根内，
 * 命中 path-guard 允许根即可直出字节（不用前端读 base64，也不怕大图）。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { ArrowRight, ArrowUp, ChatDotRound, Document, Folder, Picture, Link } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { API_BASE, getLicenseCode } from '../../api/client';
import { openMediaViewer, openMediaMenu, openMediaHover, closeMediaHover, type MediaTarget } from '../../composables/useMediaPreview';
import { useChat } from '../../composables/chat/useChat';
import { usePlatform } from '../../composables/usePlatform';
import type { UserAttachment, UserQuotedLink, UserAnnotation } from '../../utils/user-attachments';

const props = defineProps<{
  attachments: UserAttachment[];
  links?: UserQuotedLink[];
  /** 浏览器批注（2026-10-28）：正文里那块机器可读文本，这里渲染成卡片 */
  annotations?: UserAnnotation[];
  /** 批注截图路径：可点开查看当时标注的整页画面 */
  annotationShot?: string;
}>();

const links = computed(() => props.links || []);
const annotations = computed(() => props.annotations || []);
/** 是否真有附件/链接 —— 只有批注时不渲染收起/展开那套控件 */
const hasFilesOrLinks = computed(() => props.attachments.length > 0 || links.value.length > 0);
/** 截图取不到时（老消息指向 userData 路径 → file-stream 403）退回胶囊按钮 */
const shotBroken = ref(false);
const shotSrc = computed(() =>
  props.annotationShot
    ? srcOf({ name: '批注截图.png', path: props.annotationShot, kind: 'image' })
    : '',
);

/** 点开批注截图：复用附件打开逻辑（图片走媒体查看器） */
function openAnnotationShot() {
  const path = props.annotationShot;
  if (!path) return;
  onOpen({ name: '批注截图.png', path, kind: 'image' });
}

/** 默认展开：附件只在真有内容时出现，收起来是用户主动动作（收起后仍留概览计数） */
const expanded = ref(true);
const summaryText = computed(() => {
  const imageCount = props.attachments.filter((a) => a.kind === 'image').length;
  const fileCount = props.attachments.length - imageCount;
  const parts: string[] = [];
  if (imageCount) parts.push(`图片 ×${imageCount}`);
  if (fileCount) parts.push(`文件 ×${fileCount}`);
  if (links.value.length) parts.push(`链接 ×${links.value.length}`);
  return parts.join(' · ') || '附件';
});
const { openPath, referenceFile, store } = useChat();
const { supportsBrowser } = usePlatform();

/** 网页引用：优先在应用内浏览器标签里打开（预览窗），没有内置浏览器才回落系统 */
function openLink(l: UserQuotedLink) {
  if (!supportsBrowser) { window.open(l.url, '_blank', 'noopener,noreferrer'); return; }
  void store.openBrowserUrl(l.url, l.name).then((ok) => {
    if (!ok) window.open(l.url, '_blank', 'noopener,noreferrer');
  });
}

/** 能「引用到对话」的文本类扩展名（与输入框 @ 引用能读的那一类一致） */
const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'conf', 'log',
  'csv', 'tsv', 'xml', 'html', 'htm', 'css', 'scss', 'less',
  'js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'hpp',
  'sh', 'bash', 'ps1', 'sql', 'php', 'rb', 'kt', 'swift', 'dart',
]);

/** 加载失败的缩略图路径：不再反复裂图，改成文件胶囊 */
const broken = ref<Record<string, boolean>>({});

function srcOf(a: UserAttachment): string {
  if (!a.path) return '';
  const code = getLicenseCode();
  const qs = code ? `&license=${encodeURIComponent(code)}` : '';
  return `${API_BASE}/workspace/file-stream?path=${encodeURIComponent(a.path)}${qs}`;
}

function titleOf(a: UserAttachment): string {
  if (a.error) return `保存失败：${a.error}`;
  return a.path ? `${a.name}\n${a.path}` : a.name;
}

function onThumbError(a: UserAttachment) {
  broken.value = { ...broken.value, [a.path || a.name]: true };
}

function canReference(a: UserAttachment): boolean {
  if (a.error || !a.path || a.kind !== 'file') return false;
  if ((a.mimeType || '').startsWith('text/')) return true;
  const ext = (a.name.split('.').pop() || '').toLowerCase();
  return TEXT_EXT.has(ext);
}

function onReference(a: UserAttachment) {
  if (!a.path) return;
  referenceFile(a.path, a.name);
}

function onOpen(a: UserAttachment) {
  if (a.kind === 'quote') return;   // 消息引用只是标记"引了哪条"，没有可打开的目标
  if (a.error) { ElMessage.warning(`该文件保存失败：${a.error}`); return; }
  if (!a.path) return;
  if (a.kind === 'image') {
    openMediaViewer({ src: srcOf(a), path: a.path, name: a.name, kind: 'image' });
    return;
  }
  openPath(a.path, { name: a.name, forceDir: a.kind === 'folder' });
}

function onMenu(e: MouseEvent, a: UserAttachment) {
  if (a.kind === 'quote' || !a.path || a.error) return;
  const kind: 'image' | 'file' = a.kind === 'image' ? 'image' : 'file';
  openMediaMenu(e, { src: srcOf(a) || a.path, path: a.path, name: a.name, kind });
}

/** 图片缩略图的 hover 放大：与交付卡片共用同一个 body 级浮层（卡内放大必被裁剪） */
function mediaOf(a: UserAttachment): MediaTarget | null {
  if (a.kind !== 'image' || !a.path || a.error) return null;
  return { src: srcOf(a), path: a.path, name: a.name, kind: 'image' };
}
function onHoverEnter(e: MouseEvent, a: UserAttachment) {
  const t = mediaOf(a);
  const el = e.currentTarget as HTMLElement | null;
  if (t && el) openMediaHover(el, t);
}
function onHoverLeave() {
  closeMediaHover();
}
onBeforeUnmount(() => closeMediaHover());
</script>

<style scoped>
.ual {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 6px;
  max-width: 85%;
}

/* ===== 浏览器批注卡片（2026-10-28） ===== */
/* ★ 有批注时容器必须变成**通栏块**：`.ual` 默认是"按内容宽度右对齐的 flex"，
   批注卡放进去会被压成窄条浮在中间（实测很难看）。 */
.ual.has-annos {
  display: block;
  width: 100%;
  max-width: 100%;
}
.ual-annos {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.ual-anno {
  border: 1px solid var(--el-border-color-lighter);
  border-left: 3px solid #f97316;
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--el-bg-color);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}
.ual-anno-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.ual-anno-idx {
  flex: none;
  width: 17px;
  height: 17px;
  border-radius: 5px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: #f97316;
}
.ual-anno-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ual-anno-shot {
  margin-left: auto;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background: none;
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  padding: 1px 8px;
  cursor: pointer;
}
.ual-anno-shot:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}
.ual-anno-comp {
  margin-top: 4px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 10.5px;
  color: var(--el-color-primary);
  word-break: break-all;
}
.ual-anno-sel {
  margin-top: 2px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 10px;
  color: var(--el-text-color-placeholder);
  word-break: break-all;
}
.ual-anno-comment {
  margin-top: 5px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
}
.ual-anno-thumb {
  display: block;
  margin-top: 8px;
  max-width: 100%;
  max-height: 190px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
  object-fit: contain;
  cursor: zoom-in;
}
/* 附件多了不换行撑高：一行横向滚动（收起按钮在滚动区外，不会被滚走） */
.ual-chips {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
  scrollbar-width: thin;
  scrollbar-color: var(--glass-border, rgba(15, 23, 42, 0.2)) transparent;
}
.ual-chips::-webkit-scrollbar { height: 5px; }
.ual-chips::-webkit-scrollbar-thumb {
  background: var(--glass-border, rgba(15, 23, 42, 0.2));
  border-radius: 3px;
}
.ual-chips::-webkit-scrollbar-track { background: transparent; }
/* 收起态：只这一行文字（图/文件都不渲染） */
.ual-summary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border: 1px solid var(--glass-border, rgba(15, 23, 42, 0.1));
  border-radius: 999px;
  background: var(--glass-bg, #fff);
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1.5;
  cursor: pointer;
}
.ual-summary:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
}
/* 展开态：收起按钮常显（右侧，不在滚动区内） */
.ual-fold {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: var(--glass-bg, rgba(15, 23, 42, 0.06));
  color: var(--color-text-secondary);
  opacity: 0.75;
  cursor: pointer;
}
.ual-fold:hover { opacity: 1; color: var(--color-primary); }
.ual-item {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 180px;
  padding: 3px 8px;
  border-radius: 8px;
  border: 1px solid var(--glass-border, rgba(15, 23, 42, 0.1));
  background: var(--glass-bg, #fff);
  color: var(--color-text, #1f2937);
  font-size: 11px;
  line-height: 1.5;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ual-item:hover {
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 14%, transparent);
}
.ual-item.is-broken {
  cursor: not-allowed;
  opacity: 0.75;
  border-style: dashed;
}
/* 图片：只留缩略图，圆角裁剪；hover 有 body 级放大浮层（见 openMediaHover），
   这里只负责光标与轻微高亮，别在卡内做 transform（会被 overflow 裁掉） */
.ual-item.is-image {
  padding: 0;
  overflow: hidden;
  border-radius: 12px;
  background: transparent;
  cursor: zoom-in;
}
.ual-thumb {
  display: block;
  width: 72px;
  height: 72px;
  object-fit: cover;
  background: var(--glass-bg, #fff);
}
.ual-item.is-image:hover .ual-thumb {
  filter: brightness(1.04);
  transform: scale(1.06);
}
.ual-thumb { transition: transform 0.15s ease, filter 0.15s ease; }
.ual-icon { flex: none; color: var(--color-primary); }
.ual-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.ual-size { flex: none; color: var(--color-text-secondary); font-size: 10px; }
.ual-flag { flex: none; font-size: 10px; color: var(--el-color-danger, #f56c6c); }
/* 引用按钮：常显（隐藏式按钮用户根本点不到），hover 才上色 */
.ual-ref {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 18px;
  padding: 0 5px;
  border: none;
  border-radius: 5px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
}
.ual-ref:hover { background: color-mix(in srgb, var(--color-primary) 24%, transparent); }
/* 消息引用 chip：只是标记，不强调边框 */
.ual-item.is-quote { cursor: default; max-width: 260px; }
.ual-item.is-quote .ual-name { font-weight: 400; color: var(--color-text-secondary); }
/* 网页引用：淡底胶囊 + 链接 */
.ual-link {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 180px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
  text-decoration: none;
  font-family: inherit;
  line-height: 1.4;
  cursor: pointer;
}
.ual-link:hover { background: color-mix(in srgb, var(--color-primary) 14%, transparent); }
.ual-link .ual-name { font-weight: 600; }
@media (max-width: 767px) {
  .ual { max-width: 100%; }
  .ual-thumb { width: 60px; height: 60px; }
}
</style>
