<template>
  <div class="file-preview">
    <div v-if="loading" class="fp-loading">读取中...</div>
    <div v-else-if="error" class="fp-error">{{ error }}</div>
    <template v-else>
      <!-- 图片 -->
      <div v-if="kind === 'image'" class="fp-image-wrap">
        <img :src="imageSrc" :alt="file.name" class="fp-image" />
      </div>
      <!-- PDF -->
      <iframe v-else-if="kind === 'pdf'" :src="pdfSrc" class="fp-pdf" frameborder="0"></iframe>
      <!-- Markdown / 代码 / 文本 -->
      <div v-else-if="kind === 'text'" class="fp-text" v-html="rendered"></div>
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

const props = defineProps<{ file: { name: string; path: string } }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const loading = ref(true);
const error = ref('');
const content = ref('');
const imageSrc = ref('');
const pdfSrc = ref('');
const kind = ref<'image' | 'pdf' | 'text' | 'binary'>('text');

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(str: string, lang: string) {
    if (lang && hljs.getLanguage(lang)) {
      try { return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`; } catch {}
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  },
});

const ext = computed(() => props.file.name.split('.').pop()?.toLowerCase() || '');
const humanSize = computed(() => {
  const bytes = new Blob([content.value]).size;
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
});
const rendered = computed(() => {
  if (kind.value !== 'text') return '';
  const mdExts = ['md', 'markdown', 'txt'];
  if (mdExts.includes(ext.value) || !ext.value) return md.render(content.value);
  // 代码文件：直接高亮
  if (ext.value && hljs.getLanguage(ext.value)) {
    return `<pre class="hljs"><code>${hljs.highlight(content.value, { language: ext.value }).value}</code></pre>`;
  }
  return `<pre class="hljs"><code>${md.utils.escapeHtml(content.value)}</code></pre>`;
});

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

async function loadFile() {
  loading.value = true;
  error.value = '';
  content.value = '';
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
      if (typeof raw === 'string' && raw.length < 500000) {
        content.value = raw;
        kind.value = 'text';
      } else if (typeof raw === 'string') {
        content.value = raw.slice(0, 100000) + '\n\n... (文件过大，已截断)';
        kind.value = 'text';
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

function download() {
  // 通过创建 a 标签下载
  const a = document.createElement('a');
  a.href = `/api/files/download?path=${encodeURIComponent(props.file.path)}`;
  a.download = props.file.name;
  a.click();
}

watch(() => props.file?.path, () => { if (props.file?.path) loadFile(); }, { immediate: true });
</script>

<style scoped>
.file-preview { height: 100%; overflow: auto; padding: 12px; background: var(--el-bg-color); }
.fp-loading, .fp-error { padding: 40px; text-align: center; color: var(--el-text-color-secondary); }
.fp-image-wrap { text-align: center; }
.fp-image { max-width: 100%; max-height: 70vh; border-radius: 4px; }
.fp-pdf { width: 100%; height: 70vh; border: 1px solid var(--el-border-color); border-radius: 4px; }
.fp-text { font-size: 13px; line-height: 1.6; }
.fp-text :deep(pre) { background: var(--el-fill-color-dark); padding: 12px; border-radius: 6px; overflow: auto; margin: 8px 0; }
.fp-text :deep(code) { font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; }
.fp-binary { text-align: center; padding: 40px; color: var(--el-text-color-secondary); display: flex; flex-direction: column; align-items: center; gap: 8px; }
.fp-hint { font-size: 12px; }
</style>
