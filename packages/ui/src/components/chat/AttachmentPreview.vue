<template>
  <div class="atp">
    <div class="atp-head">
      <span class="atp-name" :title="file.name">{{ file.name }}</span>
      <span class="atp-badge">{{ badge }}</span>
      <span class="atp-size">{{ humanSize }}</span>
    </div>

    <div class="atp-body">
      <div v-if="state === 'loading'" class="atp-tip">预览生成中…</div>

      <!-- 图片：等比例缩放，完整放进固定框（不裁切、不变形）；双击放大查看 -->
      <div v-else-if="kind === 'image'" class="atp-stage atp-stage-paper">
        <img :src="file.dataUrl" :alt="file.name" class="atp-img" @dblclick="zoomImage" />
      </div>

      <!-- PDF：pdf.js 栅格化首页 -->
      <div v-else-if="kind === 'pdf'" class="atp-stage atp-stage-paper">
        <img v-if="imgSrc" :src="imgSrc" :alt="file.name + ' 第 1 页'" class="atp-img" />
        <div v-else class="atp-tip">首页无内容</div>
      </div>

      <!-- Excel / CSV：迷你表格（首行为表头，只取前几行几列） -->
      <div v-else-if="kind === 'excel' || kind === 'csv'" class="atp-stage atp-stage-paper atp-sheet">
        <table v-if="rows.length" class="atp-table">
          <tbody>
            <tr v-for="(r, ri) in rows" :key="ri" :class="{ 'atp-tr-head': ri === 0 }">
              <td v-for="(c, ci) in r" :key="ci" :title="c">{{ c }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="atp-tip">空表格</div>
      </div>

      <!-- 文本 / 代码 / Word：开头一段，超出部分由固定框裁掉 -->
      <div v-else-if="kind === 'text' || kind === 'docx'" class="atp-stage atp-stage-paper atp-text">
        <pre class="atp-pre">{{ text }}</pre>
      </div>

      <!-- 其余（压缩包 / 音视频 / 未知二进制）：只给元信息 -->
      <div v-else class="atp-stage atp-none">
        <el-icon :size="26"><Document /></el-icon>
        <div class="atp-tip">{{ note || '该类型暂不支持预览' }}</div>
      </div>
    </div>
  </div>
</template>

<!-- 模块级缓存：hover 进出会销毁/重建预览组件，解析结果必须存在实例之外 -->
<script lang="ts">
interface PreviewPayload {
  img?: string;
  rows?: string[][];
  text?: string;
  note?: string;
}
const PREVIEW_CACHE = new Map<string, PreviewPayload>();
</script>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Document } from '@element-plus/icons-vue';
import { extractExcelSheets, extractDocxHtml } from '@yan-zhi/core';
import { openMediaViewer } from '../../composables/useMediaPreview';

/**
 * 附件悬浮预览卡：输入框下方 chip 的 hover 弹层内容。
 * 统一「固定尺寸的一张卡片」：图片等比例缩放，PDF/表格/文本/Word 各自渲染成
 * 可扫一眼的形态；只显示开头一小部分，其余由固定高度裁掉（不做完整阅读）。
 * 入参是输入框里的 { name, size, type, dataUrl }（FileReader 读出的 data URL）。
 */
const props = defineProps<{
  file: { name: string; size: number; type: string; dataUrl: string };
}>();

type Kind = 'image' | 'pdf' | 'excel' | 'csv' | 'text' | 'docx' | 'other';

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif']);
const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'json', 'log', 'xml', 'yaml', 'yml', 'ini', 'toml', 'conf',
  'js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'hpp',
  'html', 'css', 'scss', 'less', 'sh', 'bash', 'sql', 'php', 'rb', 'kt', 'swift', 'dart',
]);

const PREVIEW_ROWS = 8;   // 表格最多显示行数（含表头）
const PREVIEW_COLS = 6;   // 表格最多显示列数
const PREVIEW_CHARS = 900; // 文本最多显示字符数

const state = ref<'loading' | 'ready' | 'error'>('loading');
const errorMsg = ref('');
const imgSrc = ref('');
const rows = ref<string[][]>([]);
const text = ref('');
const note = ref('');

const ext = computed(() => (props.file.name.split('.').pop() || '').toLowerCase());

const kind = computed<Kind>(() => {
  const mime = (props.file.type || '').toLowerCase();
  const e = ext.value;
  if (mime.startsWith('image/') || IMAGE_EXT.has(e)) return 'image';
  if (e === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (e === 'xlsx' || e === 'xls' || e === 'xlsm') return 'excel';
  if (e === 'csv') return 'csv';
  if (e === 'docx' || e === 'doc') return 'docx';
  if (mime.startsWith('text/') || TEXT_EXT.has(e)) return 'text';
  return 'other';
});

const badge = computed(() => ({
  image: '图片', pdf: 'PDF', excel: '表格', csv: 'CSV', text: '文本', docx: '文档', other: '文件',
}[kind.value]));

const humanSize = computed(() => {
  const n = props.file.size || 0;
  if (!n) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
});

/** data URL → 纯 base64（去掉 data:xxx;base64, 前缀） */
function b64Of(dataUrl: string): string {
  const i = dataUrl.indexOf(',');
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

/** 用户上传的图片双击放大：与聊天区图片走同一个灯箱 */
function zoomImage() {
  if (kind.value !== 'image') return;
  openMediaViewer({ src: props.file.dataUrl, kind: 'image', name: props.file.name });
}

/** base64 → UTF-8 文本（只解前 ~120KB，够显示开头即可，避免大文件卡界面） */
function b64ToTextHead(b64: string): string {
  const cut = b64.length - (b64.length % 4);
  const head = b64.slice(0, Math.min(cut, 120000));
  const bin = atob(head);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/** mammoth 输出的是 HTML，这里只要纯文本片段（避免把远程/内嵌资源带进预览） */
function htmlToText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

// 同名同大小视为同一份内容：hover 反复进出不重复解析
async function resolve() {
  const key = `${props.file.name}|${props.file.size}`;
  const hit = PREVIEW_CACHE.get(key);
  if (hit) {
    imgSrc.value = hit.img || '';
    rows.value = hit.rows || [];
    text.value = hit.text || '';
    note.value = hit.note || '';
    state.value = 'ready';
    return;
  }
  state.value = 'loading';
  try {
    const k = kind.value;
    const b64 = b64Of(props.file.dataUrl || '');
    if (k === 'image') {
      // 直接用 data URL，不重复解码
    } else if (k === 'pdf') {
      const { renderPdfToImages } = await import('../../utils/pdf-render');
      const r = await renderPdfToImages(b64, { maxPages: 1, scale: 1.1 });
      imgSrc.value = r.images[0] ? `data:image/png;base64,${r.images[0]}` : '';
    } else if (k === 'excel') {
      const sheets = await extractExcelSheets(b64);
      const s = sheets[0];
      rows.value = (s?.rows || []).slice(0, PREVIEW_ROWS).map((r) => r.slice(0, PREVIEW_COLS));
    } else if (k === 'csv') {
      const lines = b64ToTextHead(b64).split(/\r?\n/).filter((l) => l.trim()).slice(0, PREVIEW_ROWS);
      rows.value = lines.map((l) => l.split(',').slice(0, PREVIEW_COLS).map((c) => c.trim().replace(/^"|"$/g, '')));
    } else if (k === 'docx') {
      const html = await extractDocxHtml(b64);
      text.value = htmlToText(html).slice(0, PREVIEW_CHARS) || '（文档无文本内容）';
    } else if (k === 'text') {
      text.value = b64ToTextHead(b64).slice(0, PREVIEW_CHARS);
    } else {
      note.value = '该类型暂不支持预览';
    }
    PREVIEW_CACHE.set(key, { img: imgSrc.value, rows: rows.value, text: text.value, note: note.value });
    state.value = 'ready';
  } catch (e) {
    errorMsg.value = `预览失败：${e instanceof Error ? e.message : String(e)}`;
    state.value = 'error';
  }
}

onMounted(resolve);
</script>

<style scoped>
.atp {
  /* 宽度由宿主浮层决定（el-popover :width），这里只保证最小可读宽度 */
  width: 100%;
  min-width: 300px;
  box-sizing: border-box;
  border-radius: 10px;
  overflow: hidden;
  background: var(--color-bg, #ffffff);
  color: var(--color-text, #1f2937);
  border: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.1));
}
.atp-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 11px;
  line-height: 1.4;
  border-bottom: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.08));
}
.atp-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.atp-badge {
  flex: none;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  color: var(--color-primary, #c2410c);
  background: color-mix(in srgb, var(--color-primary, #c2410c) 12%, transparent);
}
.atp-size {
  flex: none;
  color: var(--color-text-tertiary, #8a8f98);
}
/* 固定高度：内容不用全部显示，超出直接裁掉 */
.atp-body {
  height: 200px;
  box-sizing: border-box;
  padding: 8px;
}
.atp-stage {
  height: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
/* 纸面：图片/表格/文本都垫白底，像一张被预览的纸 */
.atp-stage-paper {
  background: #ffffff;
  border-radius: 6px;
}
.atp-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}
.atp-tip {
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
}
.atp-none {
  flex-direction: column;
  gap: 6px;
}
/* 迷你表格 */
.atp-sheet {
  display: block;
  overflow: auto;
}
.atp-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 11px;
  color: #1f2937;
  table-layout: fixed;
}
.atp-table td {
  border: 1px solid #e5e7eb;
  padding: 2px 5px;
  max-width: 84px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.atp-tr-head td {
  background: #f3f4f6;
  font-weight: 600;
}
/* 文本片段 */
.atp-text {
  display: block;
  overflow: hidden;
}
.atp-pre {
  margin: 0;
  padding: 6px 8px;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.55;
  color: #1f2937;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
