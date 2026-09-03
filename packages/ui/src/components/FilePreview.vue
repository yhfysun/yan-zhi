<template>
  <div class="file-preview">
    <!-- 元信息条：文件名 + 类型徽章 + 大小 -->
    <div v-if="!loading && !error" class="fp-meta">
      <span class="fp-meta-name" :title="file.path">{{ file.name }}</span>
      <span class="fp-meta-badge">{{ kindBadge }}</span>
      <span class="fp-meta-size">{{ humanSize }}<template v-if="truncated"> · 文件过大，已截断</template></span>
    </div>
    <div v-if="loading" class="fp-loading">读取中...</div>
    <div v-else-if="error" class="fp-error">{{ error }}</div>
    <template v-else>
      <!-- 图片 -->
      <div v-if="kind === 'image'" class="fp-image-wrap">
        <img :src="imageSrc" :alt="file.name" class="fp-image" />
      </div>
      <!-- PDF -->
      <iframe v-else-if="kind === 'pdf'" :src="pdfSrc" class="fp-pdf" frameborder="0"></iframe>
      <!-- CSV 表格化（首行为表头，>1000 行截断） -->
      <div v-else-if="kind === 'csv'" class="fp-csv-wrap">
        <table class="fp-csv">
          <thead><tr><th v-for="(c, i) in csvRows[0]" :key="'h' + i">{{ c }}</th></tr></thead>
          <tbody>
            <tr v-for="(row, r) in csvBodyRows" :key="r">
              <td v-for="(c, i) in row" :key="i">{{ c }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="csvTruncated" class="fp-hint">超过 1000 行，仅显示前 1000 行</div>
      </div>
      <!-- Markdown / 纯文本（代码块带复制按钮） -->
      <div v-else-if="kind === 'text' && isMd" class="fp-text" @click="onContentClick" v-html="renderedMd"></div>
      <!-- 代码 / JSON：行号列 + 高亮 -->
      <div v-else-if="kind === 'text'" class="fp-code-wrap" @click="onContentClick">
        <div class="fp-lns">{{ lineNos }}</div>
        <pre class="hljs fp-code"><code v-html="renderedCode"></code></pre>
      </div>
      <!-- 二进制 -->
      <div v-else class="fp-binary">
        <el-icon :size="40"><Document /></el-icon>
        <p>{{ file.name }}</p>
        <p class="fp-hint">{{ humanSize }} · 二进制文件，无法预览</p>
        <el-button size="small" @click="download">下载文件</el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { Document } from '@element-plus/icons-vue';
import { API_BASE } from '../api/client';

const props = defineProps<{ file: { name: string; path: string } }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const loading = ref(true);
const error = ref('');
const content = ref('');
const truncated = ref(false);
const imageSrc = ref('');
const pdfSrc = ref('');
const kind = ref<'image' | 'pdf' | 'text' | 'csv' | 'binary'>('text');

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(str: string, lang: string): string {
    const code = lang && hljs.getLanguage(lang)
      ? hljs.highlight(str, { language: lang }).value
      : md.utils.escapeHtml(str);
    // 代码块右上角复制按钮（事件委托在 onContentClick 处理）
    return `<pre class="hljs fp-pre"><button class="fp-copy-btn" data-code="${encodeURIComponent(str)}">复制</button><code>${code}</code></pre>`;
  },
});

const ext = computed(() => props.file.name.split('.').pop()?.toLowerCase() || '');
const isMd = computed(() => ['md', 'markdown', 'txt'].includes(ext.value) || !ext.value);

const kindBadge = computed(() => {
  if (kind.value === 'image') return '图片';
  if (kind.value === 'pdf') return 'PDF';
  if (kind.value === 'csv') return 'CSV';
  if (kind.value === 'binary') return '二进制';
  if (isMd.value) return 'Markdown';
  return ext.value.toUpperCase() || '文本';
});

const humanSize = computed(() => {
  const bytes = new Blob([content.value]).size;
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
});

const renderedMd = computed(() => (kind.value === 'text' && isMd.value ? md.render(content.value) : ''));

/** 代码视图：高亮（不认识的扩展名按纯文本转义） */
const renderedCode = computed(() => {
  if (kind.value !== 'text' || isMd.value) return '';
  if (ext.value && hljs.getLanguage(ext.value)) {
    return hljs.highlight(content.value, { language: ext.value }).value;
  }
  return md.utils.escapeHtml(content.value);
});

/** 行号列：纯文本节点（大文件几十万行也不会生成几十万个 DOM 节点） */
const lineNos = computed(() => {
  if (kind.value !== 'text' || isMd.value) return '';
  const n = content.value.split('\n').length;
  const parts: string[] = [];
  for (let i = 1; i <= n; i++) parts.push(String(i));
  return parts.join('\n');
});

// ===== CSV 表格化 =====
const CSV_MAX_ROWS = 1000;
const csvRows = computed<string[][]>(() => {
  if (kind.value !== 'csv') return [];
  return parseCsv(content.value);
});
const csvBodyRows = computed(() => csvRows.value.slice(1, 1 + CSV_MAX_ROWS));
const csvTruncated = computed(() => csvRows.value.length - 1 > CSV_MAX_ROWS);

/** 基础 CSV 解析：支持引号包裹、引号转义（""）、逗号/换行分隔 */
function parseCsv(s: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c === '\r') { /* skip CRLF 的 \r */ }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const IMG_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'];

/** 图片扩展名 → data URL 的 MIME 类型 */
function imgMime(ext: string): string {
  switch (ext) {
    case 'jpg': return 'image/jpeg';
    case 'jpeg': return 'image/jpeg';
    case 'ico': return 'image/x-icon';
    case 'svg': return 'image/svg+xml';
    case 'webp': return 'image/webp';
    default: return 'image/' + ext;
  }
}

const TEXT_LIMIT = 2000000; // 2MB：超限截断并在元信息条提示

async function loadFile() {
  loading.value = true;
  error.value = '';
  content.value = '';
  truncated.value = false;
  imageSrc.value = '';
  pdfSrc.value = '';
  try {
    const { getPlatformAdapter } = await import('@yan-zhi/core');
    const adapter = getPlatformAdapter();
    if (IMG_EXTS.includes(ext.value)) {
      // 二进制图片：以 base64 读取原始字节，构造 data URL 才能正确渲染
      const b64 = await adapter.fs.readFileBase64(props.file.path);
      imageSrc.value = `data:${imgMime(ext.value)};base64,${b64}`;
      kind.value = 'image';
    } else if (ext.value === 'pdf') {
      const b64 = await adapter.fs.readFileBase64(props.file.path);
      pdfSrc.value = `data:application/pdf;base64,${b64}`;
      kind.value = 'pdf';
    } else {
      const raw = await adapter.fs.readFile(props.file.path);
      if (typeof raw === 'string') {
        if (raw.length >= TEXT_LIMIT) {
          content.value = raw.slice(0, TEXT_LIMIT);
          truncated.value = true;
        } else {
          content.value = raw;
        }
        kind.value = ext.value === 'csv' ? 'csv' : 'text';
      } else {
        kind.value = 'binary';
      }
    }
  } catch (e: any) {
    error.value = '读取文件失败: ' + (e?.message || e);
  } finally {
    loading.value = false;
  }
}

/** v-html 内容的事件委托：代码块复制按钮 */
function onContentClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  const btn = t.closest('.fp-copy-btn') as HTMLElement | null;
  if (!btn) return;
  const raw = btn.getAttribute('data-code') || '';
  navigator.clipboard.writeText(decodeURIComponent(raw)).then(() => {
    btn.textContent = '已复制';
    setTimeout(() => { btn.textContent = '复制'; }, 1500);
  }).catch(() => { /* ignore */ });
}

function download() {
  // 通过创建 a 标签下载
  const a = document.createElement('a');
  a.href = `${API_BASE}/files/download?path=${encodeURIComponent(props.file.path)}`;
  a.download = props.file.name;
  a.click();
}

watch(() => props.file?.path, () => { if (props.file?.path) loadFile(); }, { immediate: true });
</script>

<style scoped>
.file-preview { height: 100%; overflow: auto; padding: 0; background: var(--el-bg-color); display: flex; flex-direction: column; }
/* 元信息条 */
.fp-meta {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; flex-shrink: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 12px; color: var(--el-text-color-secondary);
}
.fp-meta-name { font-weight: 600; color: var(--el-text-color-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 50%; }
.fp-meta-badge {
  flex-shrink: 0; padding: 1px 8px; border-radius: 4px;
  background: var(--el-color-primary-light-9, rgba(124, 58, 237, 0.08));
  color: var(--el-color-primary, #7c3aed); font-size: 11px;
}
.fp-meta-size { flex-shrink: 0; margin-left: auto; }
.fp-loading, .fp-error { padding: 40px; text-align: center; color: var(--el-text-color-secondary); }
.fp-image-wrap { text-align: center; padding: 12px; }
.fp-image { max-width: 100%; max-height: 70vh; border-radius: 4px; }
.fp-pdf { width: 100%; height: 70vh; border: 0; border-top: 1px solid var(--el-border-color-lighter); }
.fp-text { font-size: 13px; line-height: 1.6; padding: 12px; }
.fp-text :deep(pre) { background: var(--el-fill-color-dark); padding: 12px; border-radius: 6px; overflow: auto; margin: 8px 0; position: relative; }
.fp-text :deep(code) { font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; }
/* 代码视图：行号列 + 代码同容器滚动（滚动天然同步） */
.fp-code-wrap { display: flex; flex: 1; min-height: 0; overflow: auto; font-size: 12px; line-height: 1.6; }
.fp-lns {
  flex-shrink: 0; padding: 12px 8px 12px 12px; text-align: right;
  color: var(--el-text-color-placeholder); user-select: none; white-space: pre;
  border-right: 1px solid var(--el-border-color-lighter);
  font-family: 'Consolas', 'Monaco', monospace;
}
.fp-code { margin: 0; padding: 12px; flex: 1; min-width: 0; background: transparent; font-family: 'Consolas', 'Monaco', monospace; }
/* 代码块复制按钮 */
:deep(.fp-pre) { position: relative; }
:deep(.fp-copy-btn) {
  position: absolute; top: 6px; right: 6px;
  padding: 2px 8px; font-size: 11px; border: 1px solid var(--el-border-color);
  border-radius: 4px; background: var(--el-bg-color); color: var(--el-text-color-secondary);
  cursor: pointer; opacity: 0; transition: opacity 0.15s;
}
:deep(pre:hover .fp-copy-btn) { opacity: 1; }
:deep(.fp-copy-btn:hover) { color: var(--el-color-primary); border-color: var(--el-color-primary); }
/* CSV 表格 */
.fp-csv-wrap { flex: 1; overflow: auto; padding: 12px; }
.fp-csv { border-collapse: collapse; font-size: 12px; width: 100%; }
.fp-csv th, .fp-csv td {
  border: 1px solid var(--el-border-color-lighter); padding: 5px 10px;
  text-align: left; white-space: nowrap; max-width: 320px; overflow: hidden; text-overflow: ellipsis;
}
.fp-csv th { background: var(--el-fill-color-light); position: sticky; top: 0; font-weight: 600; }
.fp-csv tr:hover td { background: var(--el-fill-color-lighter); }
.fp-binary { text-align: center; padding: 40px; color: var(--el-text-color-secondary); display: flex; flex-direction: column; align-items: center; gap: 8px; }
.fp-hint { font-size: 12px; }
</style>

<!-- hljs token 主题（非 scoped：此前项目从未引入 hljs 主题 CSS，token 一直无色）。
     浅色 = github 风；[data-theme=dark] 覆盖为 github-dark 风，随应用主题切换。 -->
<style>
.hljs { color: #24292e; background: transparent; }
.hljs-comment, .hljs-quote { color: #6a737d; font-style: italic; }
.hljs-keyword, .hljs-selector-tag, .hljs-meta-keyword, .hljs-doctag, .hljs-template-tag { color: #d73a49; }
.hljs-string, .hljs-regexp, .hljs-addition, .hljs-meta-string { color: #032f62; }
.hljs-number, .hljs-literal, .hljs-variable, .hljs-template-variable, .hljs-attr, .hljs-attribute { color: #005cc5; }
.hljs-title, .hljs-title.class_, .hljs-title.function_, .hljs-section, .hljs-name { color: #6f42c1; }
.hljs-type, .hljs-built_in, .hljs-builtin-name, .hljs-symbol, .hljs-bullet, .hljs-link { color: #e36209; }
.hljs-deletion { color: #b31d28; }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: 600; }
[data-theme="dark"] .hljs { color: #c9d1d9; }
[data-theme="dark"] .hljs-comment, [data-theme="dark"] .hljs-quote { color: #8b949e; }
[data-theme="dark"] .hljs-keyword, [data-theme="dark"] .hljs-selector-tag, [data-theme="dark"] .hljs-meta-keyword, [data-theme="dark"] .hljs-doctag, [data-theme="dark"] .hljs-template-tag { color: #ff7b72; }
[data-theme="dark"] .hljs-string, [data-theme="dark"] .hljs-regexp, [data-theme="dark"] .hljs-addition, [data-theme="dark"] .hljs-meta-string { color: #a5d6ff; }
[data-theme="dark"] .hljs-number, [data-theme="dark"] .hljs-literal, [data-theme="dark"] .hljs-variable, [data-theme="dark"] .hljs-template-variable, [data-theme="dark"] .hljs-attr, [data-theme="dark"] .hljs-attribute { color: #79c0ff; }
[data-theme="dark"] .hljs-title, [data-theme="dark"] .hljs-title.class_, [data-theme="dark"] .hljs-title.function_, [data-theme="dark"] .hljs-section, [data-theme="dark"] .hljs-name { color: #d2a8ff; }
[data-theme="dark"] .hljs-type, [data-theme="dark"] .hljs-built_in, [data-theme="dark"] .hljs-builtin-name, [data-theme="dark"] .hljs-symbol, [data-theme="dark"] .hljs-bullet, [data-theme="dark"] .hljs-link { color: #ffa657; }
[data-theme="dark"] .hljs-deletion { color: #ffd7d9; }
</style>
