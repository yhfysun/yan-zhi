<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Check, Copy } from 'lucide-vue-next';

const props = defineProps<{
  language: string;
  context?: string;
  variants?: Array<{ language: string; bad: string; good: string; note: string }>;
  bad: string;
  good: string;
  note: string;
}>();

const copied = ref<'bad' | 'good' | ''>('');
const selectedLanguage = ref(props.language);
const availableExamples = computed(() => {
  const rows = [
    { language: props.language, bad: props.bad, good: props.good, note: props.note },
    ...(props.variants || []),
  ];
  return [...new Map(rows.map((row) => [row.language, row])).values()];
});
const current = computed(() =>
  availableExamples.value.find((row) => row.language === selectedLanguage.value) || availableExamples.value[0],
);
const languageLabel = computed(() => {
  const labels: Record<string, string> = {
  c: 'C 代码',
  cpp: 'C++ 代码',
  java: 'Java 代码',
  python: 'Python 代码',
  javascript: 'JavaScript 代码',
  typescript: 'TypeScript 代码',
  php: 'PHP 代码',
  go: 'Go 代码',
  rust: 'Rust 代码',
  yaml: 'YAML 配置',
  bash: 'Shell 命令',
  http: 'HTTP 请求',
  markdown: '报告模板',
  };
  return labels[current.value.language] || current.value.language;
});
async function copy(kind: 'bad' | 'good') {
  try {
    await navigator.clipboard.writeText(kind === 'bad' ? current.value.bad : current.value.good);
    copied.value = kind;
    ElMessage.success('代码已复制');
    window.setTimeout(() => { if (copied.value === kind) copied.value = ''; }, 1400);
  } catch {
    ElMessage.warning('当前环境无法访问剪贴板');
  }
}
watch(() => props.language, (language) => { selectedLanguage.value = language; });
</script>

<template>
  <section class="sec-code">
    <header>
      <div>
        <b>示例代码</b>
        <span class="sec-code-context">{{ context || '安全教学示例' }}</span>
      </div>
      <i>{{ languageLabel }}</i>
    </header>
    <div v-if="availableExamples.length > 1" class="sec-code-languages" aria-label="示例代码语言">
      <button
        v-for="example in availableExamples" :key="example.language"
        :class="{ active: current.language === example.language }"
        @click="selectedLanguage = example.language"
      >{{ example.language }}</button>
    </div>
    <div class="sec-code-grid">
      <article class="bad">
        <div class="sec-code-head">
          <b>风险写法</b>
          <button title="复制风险示例" @click="copy('bad')">
            <Check v-if="copied === 'bad'" :size="13" />
            <Copy v-else :size="13" />
          </button>
        </div>
        <pre>{{ current.bad }}</pre>
      </article>
      <article class="good">
        <div class="sec-code-head">
          <b>安全写法</b>
          <button title="复制安全示例" @click="copy('good')">
            <Check v-if="copied === 'good'" :size="13" />
            <Copy v-else :size="13" />
          </button>
        </div>
        <pre>{{ current.good }}</pre>
      </article>
    </div>
    <p>{{ current.note }}</p>
  </section>
</template>

<style scoped>
.sec-code { border: 1px solid var(--color-border); border-radius: 8px; background: var(--glass-bg); overflow: hidden; }
.sec-code > header { display: flex; justify-content: space-between; align-items: center; padding: 7px 9px; border-bottom: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: 11px; }
.sec-code > header > div { min-width: 0; display: flex; align-items: center; gap: 7px; }
.sec-code > header b { color: var(--color-text); font-size: 11px; }
.sec-code-context { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text-tertiary); font-size: 10px; }
.sec-code > header i { color: #0f766e; font-style: normal; font-size: 10px; }
.sec-code-languages { display: flex; gap: 4px; flex-wrap: wrap; padding: 6px 8px; border-bottom: 1px solid var(--color-border); background: #f8fafc; }
.sec-code-languages button { border: 1px solid var(--color-border); border-radius: 4px; background: var(--glass-bg); color: var(--color-text-secondary); padding: 2px 6px; font-size: 9px; cursor: pointer; }
.sec-code-languages button.active { border-color: #0f766e; background: #ecfdf5; color: #0f766e; font-weight: 600; }
.sec-code-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--color-border); }
.sec-code article { min-width: 0; background: #111827; }
.sec-code-head { display: flex; align-items: center; justify-content: space-between; padding: 5px 8px; background: #1f2937; }
.sec-code-head b { font-size: 10px; }
.bad .sec-code-head b { color: #fca5a5; }
.good .sec-code-head b { color: #86efac; }
.sec-code-head button { border: 0; background: transparent; color: #d1d5db; cursor: pointer; display: inline-flex; }
.sec-code pre { margin: 0; padding: 9px; color: #e5e7eb; font: 11px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; word-break: break-word; }
.sec-code > p { margin: 0; padding: 7px 9px; color: var(--color-text-tertiary); font-size: 10px; line-height: 1.5; }
@media (max-width: 900px) {
  .sec-code-grid { grid-template-columns: 1fr; }
}
</style>
