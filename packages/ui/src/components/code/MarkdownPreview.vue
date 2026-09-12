<template>
  <div ref="rootRef" class="md-preview" @click="onContentClick" v-html="html"></div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

const props = defineProps<{ content: string }>();
const rootRef = ref<HTMLElement | null>(null);

// 与对话模式 FilePreview.vue 完全一致的渲染配置，保证「统一」
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(str: string, lang: string): string {
    const code = lang && hljs.getLanguage(lang)
      ? hljs.highlight(str, { language: lang }).value
      : md.utils.escapeHtml(str);
    // 代码块右上角复制按钮（事件委托在 onContentClick 处理）
    return `<pre class="hljs md-pre"><button class="md-copy-btn" data-code="${encodeURIComponent(str)}">复制</button><code>${code}</code></pre>`;
  },
});

const html = computed(() => md.render(props.content || ''));

/** v-html 内容的事件委托：代码块复制按钮 */
function onContentClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  const btn = t.closest('.md-copy-btn') as HTMLElement | null;
  if (!btn) return;
  const raw = btn.getAttribute('data-code') || '';
  navigator.clipboard.writeText(decodeURIComponent(raw)).then(() => {
    btn.textContent = '已复制';
    setTimeout(() => { btn.textContent = '复制'; }, 1500);
  }).catch(() => { /* ignore */ });
}
</script>

<style scoped>
.md-preview {
  height: 100%;
  overflow: auto;
  font-size: 13px;
  line-height: 1.6;
  padding: 12px 16px;
  background: var(--color-surface, #fff);
}
.md-preview :deep(.md-pre) {
  position: relative;
  background: var(--el-fill-color-dark);
  padding: 12px;
  border-radius: 6px;
  overflow: auto;
  margin: 8px 0;
}
.md-preview :deep(code) { font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; }
.md-preview :deep(.md-copy-btn) {
  position: absolute; top: 6px; right: 6px;
  padding: 2px 8px; font-size: 11px; border: 1px solid var(--el-border-color);
  border-radius: 4px; background: var(--el-bg-color); color: var(--el-text-color-secondary);
  cursor: pointer; opacity: 0; transition: opacity 0.15s;
}
.md-preview :deep(pre:hover .md-copy-btn) { opacity: 1; }
.md-preview :deep(.md-copy-btn:hover) { color: var(--el-color-primary); border-color: var(--el-color-primary); }
</style>

<!-- hljs token 主题（非 scoped，全局生效；与 FilePreview.vue 同一套，保证代码模式独立加载也有彩色 token）。
     浅色 = github 风；[data-theme=dark] 覆盖为 github-dark 风，随应用主题切换。 -->
<style>
.md-preview .hljs { color: #24292e; background: transparent; }
.md-preview .hljs-comment, .md-preview .hljs-quote { color: #6a737d; font-style: italic; }
.md-preview .hljs-keyword, .md-preview .hljs-selector-tag, .md-preview .hljs-meta-keyword, .md-preview .hljs-doctag, .md-preview .hljs-template-tag { color: #d73a49; }
.md-preview .hljs-string, .md-preview .hljs-regexp, .md-preview .hljs-addition, .md-preview .hljs-meta-string { color: #032f62; }
.md-preview .hljs-number, .md-preview .hljs-literal, .md-preview .hljs-variable, .md-preview .hljs-template-variable, .md-preview .hljs-attr, .md-preview .hljs-attribute { color: #005cc5; }
.md-preview .hljs-title, .md-preview .hljs-title.class_, .md-preview .hljs-title.function_, .md-preview .hljs-section, .md-preview .hljs-name { color: #6f42c1; }
.md-preview .hljs-type, .md-preview .hljs-built_in, .md-preview .hljs-builtin-name, .md-preview .hljs-symbol, .md-preview .hljs-bullet, .md-preview .hljs-link { color: #e36209; }
.md-preview .hljs-deletion { color: #b31d28; }
.md-preview .hljs-emphasis { font-style: italic; }
.md-preview .hljs-strong { font-weight: 600; }
[data-theme="dark"] .md-preview .hljs { color: #c9d1d9; }
[data-theme="dark"] .md-preview .hljs-comment, [data-theme="dark"] .md-preview .hljs-quote { color: #8b949e; }
[data-theme="dark"] .md-preview .hljs-keyword, [data-theme="dark"] .md-preview .hljs-selector-tag, [data-theme="dark"] .md-preview .hljs-doctag, [data-theme="dark"] .md-preview .hljs-template-tag { color: #ff7b72; }
[data-theme="dark"] .md-preview .hljs-string, [data-theme="dark"] .md-preview .hljs-regexp, [data-theme="dark"] .md-preview .hljs-addition, [data-theme="dark"] .md-preview .hljs-meta-string { color: #a5d6ff; }
[data-theme="dark"] .md-preview .hljs-number, [data-theme="dark"] .md-preview .hljs-literal, [data-theme="dark"] .md-preview .hljs-variable, [data-theme="dark"] .md-preview .hljs-attr, [data-theme="dark"] .md-preview .hljs-attribute { color: #79c0ff; }
[data-theme="dark"] .md-preview .hljs-title, [data-theme="dark"] .md-preview .hljs-title.class_, [data-theme="dark"] .md-preview .hljs-title.function_, [data-theme="dark"] .md-preview .hljs-section, [data-theme="dark"] .md-preview .hljs-name { color: #d2a8ff; }
[data-theme="dark"] .md-preview .hljs-type, [data-theme="dark"] .md-preview .hljs-built_in, [data-theme="dark"] .md-preview .hljs-builtin-name, [data-theme="dark"] .md-preview .hljs-symbol, [data-theme="dark"] .md-preview .hljs-bullet, [data-theme="dark"] .md-preview .hljs-link { color: #ffa657; }
[data-theme="dark"] .md-preview .hljs-deletion { color: #ffd7d9; }
</style>
