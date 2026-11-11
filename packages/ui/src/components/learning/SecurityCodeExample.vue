<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Check, Copy, Info } from 'lucide-vue-next';

const props = defineProps<{
  language: string;
  context?: string;
  application?: string;
  exampleKind?: string;
  badLabel?: string;
  goodLabel?: string;
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
    yaml: 'YAML 结构',
  bash: 'Shell 命令',
  http: 'HTTP 请求',
    markdown: 'Markdown 文档',
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
      <div class="sec-code-title">
        <b>代码对照</b>
        <span>{{ languageLabel }}</span>
      </div>
    </header>
    <div class="sec-code-origin" role="note" aria-label="示例说明">
      <Info :size="14" aria-hidden="true" />
      <div>
        <div>
          <b>对应应用</b>
          <p>{{ application || '通用应用安全场景' }}</p>
        </div>
        <div>
          <b>示例类型</b>
          <p>{{ exampleKind || languageLabel }}</p>
        </div>
        <div>
          <b>示例来源</b>
          <p>{{ context || '言智安全课程 · 教学示例' }}</p>
        </div>
      </div>
    </div>
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
          <b>{{ badLabel || '风险示例' }}</b>
          <button title="复制风险示例" @click="copy('bad')">
            <Check v-if="copied === 'bad'" :size="13" />
            <Copy v-else :size="13" />
          </button>
        </div>
        <pre>{{ current.bad }}</pre>
      </article>
      <article class="good">
        <div class="sec-code-head">
          <b>{{ goodLabel || '安全示例' }}</b>
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
.sec-code { --sec-code-bg: color-mix(in srgb, var(--color-bg) 90%, var(--lp-primary, var(--color-primary))); --sec-code-head-bg: color-mix(in srgb, var(--color-bg) 82%, var(--lp-primary, var(--color-primary))); border: 1px solid var(--lp-border, var(--color-border)); border-radius: 8px; background: var(--lp-surface, var(--glass-bg)); overflow: hidden; }
.sec-code > header { display: flex; justify-content: space-between; align-items: center; padding: 7px 9px; border-bottom: 1px solid var(--lp-border, var(--color-border)); color: var(--lp-text-secondary, var(--color-text-secondary)); font-size: 11px; }
.sec-code-title { min-width: 0; display: flex; align-items: center; gap: 7px; }
.sec-code > header b { color: var(--lp-text, var(--color-text)); font-size: 11px; }
.sec-code-title span { color: var(--lp-primary, var(--color-primary)); font-size: 10px; }
.sec-code-origin { display: flex; align-items: flex-start; gap: 7px; padding: 7px 9px; border-bottom: 1px solid color-mix(in srgb, var(--lp-primary, var(--color-primary)) 32%, var(--lp-border, var(--color-border))); background: color-mix(in srgb, var(--lp-primary, var(--color-primary)) 8%, var(--lp-surface, var(--glass-bg))); color: var(--lp-primary, var(--color-primary)); }
.sec-code-origin > svg { flex: 0 0 auto; margin-top: 1px; }
.sec-code-origin > div { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.sec-code-origin > div > div { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.sec-code-origin b { display: block; margin-bottom: 1px; font-size: 10px; }
.sec-code-origin p { margin: 0; color: var(--lp-text-secondary, var(--color-text-secondary)); font-size: 10px; line-height: 1.5; }
.sec-code-languages { display: flex; gap: 4px; flex-wrap: wrap; padding: 6px 8px; border-bottom: 1px solid var(--lp-border, var(--color-border)); background: var(--lp-surface-hover, var(--glass-bg-hover)); }
.sec-code-languages button { border: 1px solid var(--lp-border, var(--color-border)); border-radius: 4px; background: var(--lp-surface, var(--glass-bg)); color: var(--lp-text-secondary, var(--color-text-secondary)); padding: 2px 6px; font-size: 9px; cursor: pointer; }
.sec-code-languages button.active { border-color: var(--lp-primary, var(--color-primary)); background: var(--lp-primary-soft, color-mix(in srgb, var(--color-primary) 13%, var(--glass-bg))); color: var(--lp-primary, var(--color-primary)); font-weight: 600; }
.sec-code-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--lp-border, var(--color-border)); }
.sec-code article { min-width: 0; background: var(--sec-code-bg); }
.sec-code-head { display: flex; align-items: center; justify-content: space-between; padding: 5px 8px; background: var(--sec-code-head-bg); }
.sec-code-head b { font-size: 10px; }
.bad .sec-code-head b { color: var(--color-danger); }
.good .sec-code-head b { color: var(--color-success); }
.sec-code-head button { border: 0; background: transparent; color: var(--color-text-secondary); cursor: pointer; display: inline-flex; }
.sec-code pre { margin: 0; padding: 9px; color: var(--color-text); font: 11px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; word-break: break-word; }
.sec-code > p { margin: 0; padding: 7px 9px; color: var(--color-text-tertiary); font-size: 10px; line-height: 1.5; }
@media (max-width: 900px) {
  .sec-code-grid { grid-template-columns: 1fr; }
}
</style>
