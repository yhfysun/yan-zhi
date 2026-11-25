<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Code2,
  Download,
  ExternalLink,
  LoaderCircle,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  TerminalSquare,
} from 'lucide-vue-next';
import type {
  LearningV2CodeLab,
  LearningV2CodeLanguage,
} from '@yan-zhi/shared';
import { api } from '../../../api/client';
import type { DevToolStatus } from '../../../types/dev-env';

type RuntimeStatus = {
  id: LearningV2CodeLanguage;
  label: string;
  available: boolean;
  version: string;
  detail: string;
  bundled: boolean;
};

type RunResult = {
  ok: boolean;
  language: LearningV2CodeLanguage;
  stdout: string;
  stderr: string;
  compileOutput: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  runtime: string;
};

export type LearningCodeEvidence = RunResult & {
  id: string;
  courseName: string;
  mode: 'practice' | 'apply';
  taskId: string;
  source: string;
  savedAt: string;
};

const DRAFT_STORAGE_KEY = 'yz.learning.v2.code-drafts.v1';
const EVIDENCE_STORAGE_KEY = 'yz.learning.v2.code-evidence.v1';
const CodeEditorPane = defineAsyncComponent(
  () => import('../../code/CodeEditorPane.vue'),
);

const props = defineProps<{
  lab: LearningV2CodeLab;
  mode: 'practice' | 'apply';
  courseName: string;
}>();

const emit = defineEmits<{
  completed: [evidence: LearningCodeEvidence];
}>();

const task = computed(() => props.lab[props.mode]);
const runtimes = ref<RuntimeStatus[]>([]);
const tools = ref<DevToolStatus[]>([]);
const language = ref<LearningV2CodeLanguage>(props.lab.practice.defaultLanguage);
const code = ref('');
const stdin = ref('');
const loadingRuntimes = ref(true);
const detecting = ref(false);
const running = ref(false);
const runtimeError = ref('');
const environmentError = ref('');
const runError = ref('');
const result = ref<RunResult | null>(null);
const evidenceSaved = ref(false);
const previewRevision = ref(0);

const currentRuntime = computed(() =>
  runtimeOptions.value.find((runtime) => runtime.id === language.value) || null,
);
const usesBrowserPreview = computed(() => props.lab.languages.includes('html'));
const runtimeOptions = computed<RuntimeStatus[]>(() => {
  const browserRuntime: RuntimeStatus[] = usesBrowserPreview.value
    ? [{
      id: 'html',
      label: 'HTML / CSS 浏览器沙箱',
      available: true,
      version: '隔离预览',
      detail: '源码在无脚本权限的 sandbox iframe 中渲染',
      bundled: true,
    }]
    : [];
  const serverRuntimes = props.lab.languages
    .filter((id) => id !== 'html')
    .map((id) => runtimes.value.find((runtime) => runtime.id === id))
    .filter((runtime): runtime is RuntimeStatus => !!runtime);
  return [...browserRuntime, ...serverRuntimes];
});
const requiredToolStatus = computed(() =>
  props.lab.requiredRuntime
    ? tools.value.find((tool) => tool.id === props.lab.requiredRuntime)
    : null,
);
const runtimeReady = computed(() => !!currentRuntime.value?.available);
const runtimeNoun = computed(() => ({
  javascript: 'Node.js',
  typescript: 'TypeScript',
  html: '浏览器沙箱',
  node: 'Node.js',
  python: 'Python',
  java: 'JDK',
  c: 'C 编译器',
  cpp: 'C++ 编译器',
  go: 'Go 工具链',
}[props.lab.requiredRuntime || currentRuntime.value?.id || 'javascript']));
const environmentTitle = computed(() => {
  if (!props.lab.requiredRuntime) return `${props.lab.runtimeLabel} 已接入`;
  if (loadingRuntimes.value) return '正在检查运行环境';
  if (runtimeReady.value) return `${props.lab.runtimeLabel} 已就绪`;
  return `${props.lab.runtimeLabel} 未就绪`;
});
const environmentDetail = computed(() => {
  if (usesBrowserPreview.value) {
    return '源码只在隔离 iframe 中渲染，禁用脚本、表单提交和同源访问。';
  }
  if (!props.lab.requiredRuntime) {
    return '代码在应用临时目录限时运行，关闭页面不会删除本课草稿与运行证据。';
  }
  if (loadingRuntimes.value) return '正在读取代码运行器与版本信息。';
  if (requiredToolStatus.value?.ok) {
    return [
      requiredToolStatus.value.version || currentRuntime.value?.version || '版本已检测',
      requiredToolStatus.value.path || currentRuntime.value?.detail,
    ].filter(Boolean).join(' · ');
  }
  if (runtimeReady.value) return currentRuntime.value?.detail || '运行器已就绪';
  return `未检测到完整 ${runtimeNoun.value}。${props.lab.installSteps[0] || ''}`;
});
const setupTitle = computed(() =>
  props.lab.requiredRuntime === 'java'
    ? '没有 javac，Java 源码只能看，不能编译'
    : `没有检测到可用的 ${runtimeNoun.value}，源码只能看，不能运行`,
);
const downloadLabel = computed(() =>
  props.lab.requiredRuntime === 'java' ? '下载 JDK 21' : `下载 ${runtimeNoun.value}`,
);
const fileName = computed(() => ({
  javascript: 'main.js',
  typescript: 'main.ts',
  html: 'index.html',
  python: 'main.py',
  java: 'Main.java',
  c: 'main.c',
  cpp: 'main.cpp',
  go: 'main.go',
}[language.value]));
const evidenceId = computed(() =>
  `${props.courseName}::${task.value.id}::${props.mode}`,
);
const outputText = computed(() => {
  if (!result.value) return '';
  return [
    result.value.compileOutput ? `[编译]\n${result.value.compileOutput}` : '',
    result.value.stdout ? `[标准输出]\n${result.value.stdout}` : '',
    result.value.stderr ? `[错误输出]\n${result.value.stderr}` : '',
  ].filter(Boolean).join('\n\n') || '(无输出)';
});
const canRun = computed(() =>
  !running.value
  && !loadingRuntimes.value
  && runtimeReady.value
  && !!code.value.trim(),
);
const evidenceButtonVisible = computed(() =>
  !!result.value?.ok && !running.value,
);

function unwrap<T>(response: unknown): T | null {
  if (response && typeof response === 'object' && 'data' in response) {
    return (response as { data: T }).data;
  }
  return null;
}

function readDraftStore(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || '{}') as unknown;
    return raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as Record<string, string>
      : {};
  } catch {
    return {};
  }
}

function draftKey(): string {
  return `${props.courseName}::${task.value.id}::${language.value}`;
}

function persistCode(): void {
  try {
    const store = readDraftStore();
    store[draftKey()] = code.value;
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Draft persistence is optional; the editor and runner remain usable.
  }
}

function starterCode(nextLanguage = language.value): string {
  const explicit = task.value.starterCode[nextLanguage];
  if (explicit) return explicit;
  const extension = {
    javascript: 'js',
    typescript: 'ts',
    html: 'html',
    python: 'py',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    go: 'go',
  }[nextLanguage];
  return `// ${props.courseName}\n// 在 main.${extension} 中完成“${task.value.title}”\n`;
}

function loadEditorCode(): void {
  language.value = task.value.defaultLanguage;
  const saved = readDraftStore()[draftKey()];
  code.value = saved || starterCode();
  stdin.value = task.value.stdin || '';
  result.value = null;
  runError.value = '';
  evidenceSaved.value = readEvidenceStore()[evidenceId.value] !== undefined;
}

function selectLanguage(nextLanguage: LearningV2CodeLanguage): void {
  if (!props.lab.languages.includes(nextLanguage)) return;
  persistCode();
  language.value = nextLanguage;
  const saved = readDraftStore()[draftKey()];
  code.value = saved || starterCode(nextLanguage);
  result.value = null;
  runError.value = '';
  evidenceSaved.value = readEvidenceStore()[evidenceId.value] !== undefined;
}

async function loadRuntimes(reloadEditor = false): Promise<void> {
  loadingRuntimes.value = true;
  runtimeError.value = '';
  if (!props.lab.languages.some((id) => id !== 'html')) {
    loadingRuntimes.value = false;
    if (reloadEditor) loadEditorCode();
    return;
  }
  try {
    const response = await api.get<{ data: RuntimeStatus[] }>('/env/code-runtimes');
    runtimes.value = unwrap<RuntimeStatus[]>(response) || [];
    if (!runtimeOptions.value.some((runtime) => runtime.id === language.value)) {
      language.value = task.value.defaultLanguage;
    }
    if (!runtimeOptions.value.length) {
      runtimeError.value = '没有读取到本课允许的代码运行器。';
    }
  } catch (error) {
    runtimeError.value = error instanceof Error
      ? error.message
      : '代码运行环境加载失败';
  } finally {
    loadingRuntimes.value = false;
    if (reloadEditor) loadEditorCode();
  }
}

async function detectEnvironment(): Promise<void> {
  if (!props.lab.requiredRuntime || detecting.value) return;
  detecting.value = true;
  environmentError.value = '';
  try {
    const response = await api.post<{ data: { suggested: unknown; tools: DevToolStatus[] } }>(
      '/env/detect',
      {},
    );
    tools.value = unwrap<{ suggested: unknown; tools: DevToolStatus[] }>(response)?.tools || [];
    await loadRuntimes(false);
  } catch (error) {
    environmentError.value = error instanceof Error
      ? error.message
      : '本机环境检测失败';
  } finally {
    detecting.value = false;
  }
}

async function runCode(): Promise<void> {
  if (!canRun.value) return;
  if (usesBrowserPreview.value) {
    previewRevision.value += 1;
    result.value = {
      ok: true,
      language: language.value,
      stdout: '隔离浏览器预览已刷新。请按本步验收条件检查页面结构、布局、键盘与窄屏表现。',
      stderr: '',
      compileOutput: '',
      exitCode: 0,
      timedOut: false,
      durationMs: 0,
      runtime: 'sandboxed browser preview',
    };
    runError.value = '';
    evidenceSaved.value = false;
    return;
  }
  running.value = true;
  runError.value = '';
  result.value = null;
  evidenceSaved.value = false;
  persistCode();
  try {
    const response = await api.post<{ data: RunResult }>('/env/run-code', {
      language: language.value,
      source: code.value,
      stdin: stdin.value,
    });
    const data = unwrap<RunResult>(response);
    if (!data) throw new Error('运行接口没有返回结果');
    result.value = data;
  } catch (error) {
    runError.value = error instanceof Error ? error.message : '代码运行失败';
  } finally {
    running.value = false;
  }
}

function resetCode(): void {
  code.value = starterCode();
  stdin.value = task.value.stdin || '';
  result.value = null;
  runError.value = '';
  evidenceSaved.value = false;
  persistCode();
}

function readEvidenceStore(): Record<string, LearningCodeEvidence> {
  try {
    const raw = JSON.parse(localStorage.getItem(EVIDENCE_STORAGE_KEY) || '{}') as unknown;
    return raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as Record<string, LearningCodeEvidence>
      : {};
  } catch {
    return {};
  }
}

function saveEvidence(): void {
  if (!result.value?.ok) return;
  const evidence: LearningCodeEvidence = {
    ...result.value,
    id: evidenceId.value,
    courseName: props.courseName,
    mode: props.mode,
    taskId: task.value.id,
    source: code.value,
    savedAt: new Date().toISOString(),
  };
  try {
    const store = readEvidenceStore();
    store[evidence.id] = evidence;
    localStorage.setItem(EVIDENCE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // The emitted evidence still updates the current lesson session.
  }
  evidenceSaved.value = true;
  emit('completed', evidence);
}

watch(language, () => persistCode());
watch(code, (value) => {
  if (value) persistCode();
});
watch(
  () => `${props.courseName}::${props.lab.title}::${props.mode}`,
  loadEditorCode,
);

onMounted(async () => {
  loadEditorCode();
  await loadRuntimes(false);
  if (props.lab.requiredRuntime) await detectEnvironment();
});
</script>

<template>
  <section
    class="learning-code-lab"
    :data-learning-code-lab="mode"
    :data-code-task-id="task.id"
    aria-labelledby="learning-code-lab-title"
  >
    <header class="learning-code-head">
      <div>
        <span><Code2 :size="15" />课程代码台 · {{ mode === 'practice' ? '跟做' : '独立实践' }}</span>
        <h2 id="learning-code-lab-title">{{ lab.title }}</h2>
        <p>{{ lab.description }}</p>
      </div>
      <div class="learning-code-runtime-summary" :class="{ ready: runtimeReady }">
        <LoaderCircle v-if="loadingRuntimes" :size="15" class="spin" />
        <CheckCircle2 v-else-if="runtimeReady" :size="15" />
        <CircleAlert v-else :size="15" />
        <span><b>{{ environmentTitle }}</b><small>{{ environmentDetail }}</small></span>
      </div>
    </header>

    <section
      v-if="lab.requiredRuntime && !loadingRuntimes && !runtimeReady"
      class="learning-code-setup"
      data-runtime-setup
      aria-labelledby="learning-code-setup-title"
    >
      <div class="learning-code-setup-copy">
        <span><TerminalSquare :size="16" />先完成 {{ lab.runtimeLabel }}</span>
        <h3 id="learning-code-setup-title">{{ setupTitle }}</h3>
        <ol>
          <li v-for="step in lab.installSteps" :key="step">{{ step }}</li>
        </ol>
      </div>
      <div class="learning-code-setup-actions">
        <a
          v-if="lab.downloadUrl"
          data-runtime-download
          :href="lab.downloadUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Download :size="14" />{{ downloadLabel }}
        </a>
        <a
          v-if="lab.docsUrl"
          :href="lab.docsUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink :size="14" />官方文档
        </a>
        <button
          type="button"
          data-action="learning-code-detect"
          :disabled="detecting"
          @click="detectEnvironment"
        >
          <LoaderCircle v-if="detecting" :size="14" class="spin" />
          <RefreshCw v-else :size="14" />
          {{ detecting ? '正在重新检测' : '我安装好了，重新检测' }}
        </button>
      </div>
      <div v-if="environmentError" class="learning-code-alert" role="alert">
        <AlertTriangle :size="15" />{{ environmentError }}
      </div>
    </section>

    <div v-if="runtimeError" class="learning-code-alert" role="alert">
      <AlertTriangle :size="15" />{{ runtimeError }}
    </div>

    <section class="learning-code-task">
      <header>
        <div>
          <span>{{ mode === 'practice' ? '跟做任务' : '实践任务' }}</span>
          <b>{{ task.title }}</b>
        </div>
        <small>{{ task.checkpoint }}</small>
      </header>
      <p>{{ task.brief }}</p>
    </section>

    <div class="learning-code-toolbar">
      <label>
        <span>运行语言</span>
        <div class="learning-code-select">
          <select
            :value="language"
            aria-label="选择本课代码语言"
            @change="selectLanguage(($event.target as HTMLSelectElement).value as LearningV2CodeLanguage)"
          >
            <option
            v-for="runtime in runtimeOptions"
              :key="runtime.id"
              :value="runtime.id"
              :disabled="!runtime.available"
            >
              {{ runtime.label }}{{ runtime.available ? '' : '（未就绪）' }}
            </option>
          </select>
          <ChevronDown :size="14" />
        </div>
      </label>
      <span class="learning-code-runtime">
        {{ usesBrowserPreview
          ? '隔离沙箱 · 实时渲染'
          : `${currentRuntime?.bundled ? '内置' : '本机'} · ${currentRuntime?.version || (currentRuntime?.available ? '已检测' : '未就绪')}`
        }}
      </span>
      <button type="button" class="learning-code-reset" @click="resetCode">
        <RotateCcw :size="14" />恢复手写模板
      </button>
    </div>

    <div class="learning-code-grid">
      <section class="learning-code-editor" data-learning-code-editor>
        <header>
          <span>{{ fileName }}</span>
          <small>{{ code.length }} 字符</small>
        </header>
        <CodeEditorPane
          :value="code"
          :file-name="fileName"
          :minimap="false"
          @update:value="code = $event"
        />
      </section>
      <section class="learning-code-io">
        <section v-if="usesBrowserPreview" class="learning-code-preview">
          <header>
            <span>浏览器预览</span>
            <small>sandbox · scripts disabled</small>
          </header>
          <iframe
            :key="previewRevision"
            :srcdoc="code"
            sandbox=""
            title="课程 HTML 预览"
          ></iframe>
        </section>
        <details class="learning-code-source">
          <summary>代码与命令速查</summary>
          <pre>{{ code }}</pre>
        </details>
        <label v-if="!usesBrowserPreview">
          <span>标准输入 stdin</span>
          <textarea
            v-model="stdin"
            spellcheck="false"
            aria-label="课程代码标准输入"
            placeholder="没有输入要求时保持空白"
          ></textarea>
        </label>
        <div class="learning-code-actions">
          <span v-if="currentRuntime?.detail">{{ currentRuntime.detail }}</span>
          <span v-else>{{ lab.installSteps[0] }}</span>
          <button
            type="button"
            data-action="learning-code-run"
            :disabled="!canRun"
            @click="runCode"
          >
            <LoaderCircle v-if="running" :size="15" class="spin" />
            <Play v-else :size="15" />
            {{ running ? '编译运行中' : usesBrowserPreview ? '刷新预览' : '运行代码' }}
          </button>
        </div>
        <div v-if="runError" class="learning-code-alert" role="alert">
          <AlertTriangle :size="15" />{{ runError }}
        </div>
        <section v-if="result" class="learning-code-output" aria-live="polite">
          <header>
            <span :class="{ ok: result.ok, failed: !result.ok }">
              <CheckCircle2 v-if="result.ok" :size="14" />
              <AlertTriangle v-else :size="14" />
              {{ result.ok ? '运行通过' : result.timedOut ? '运行超时' : '运行失败' }}
            </span>
            <small>exit {{ result.exitCode ?? '-' }} · {{ result.durationMs }} ms</small>
          </header>
          <pre>{{ outputText }}</pre>
        </section>
        <div v-if="evidenceButtonVisible" class="learning-code-evidence-action">
          <div>
            <b>{{ evidenceSaved ? '运行证据已记录' : '把本次运行写入本课证据' }}</b>
            <small>
              {{ evidenceSaved
                ? '课程会保留退出码、标准输出、运行语言和耗时。'
                : '只有运行成功的记录可写入，编译错误仍需先修复。' }}
            </small>
          </div>
          <button
            type="button"
            data-action="learning-code-save-evidence"
            :disabled="evidenceSaved"
            @click="saveEvidence"
          >
            <CheckCircle2 :size="14" />
            {{ evidenceSaved ? '已记录' : '记录运行证据' }}
          </button>
          <span v-if="evidenceSaved" data-code-evidence-saved aria-hidden="true"></span>
        </div>
        <p class="learning-code-safety">
          {{ usesBrowserPreview
            ? '预览 iframe 禁止脚本、表单提交和同源访问；页面不会读取本机文件或访问应用数据。'
            : '代码使用当前系统用户权限在本机临时目录运行，最长 6 秒；只运行你信任的代码。'
          }}
        </p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.learning-code-lab {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid #d6ddd7;
  border-radius: 8px;
  background: #fbfaf6;
  color: #17221d;
}
.learning-code-head,
.learning-code-toolbar,
.learning-code-editor > header,
.learning-code-output > header,
.learning-code-actions,
.learning-code-evidence-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.learning-code-head {
  align-items: flex-start;
}
.learning-code-head > div:first-child {
  min-width: 0;
}
.learning-code-head > div:first-child > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #256a50;
  font-size: 10px;
  font-weight: 750;
}
.learning-code-head h2 {
  margin: 5px 0 0;
  font-family: Georgia, "Songti SC", serif;
  font-size: 19px;
  line-height: 1.3;
}
.learning-code-head p {
  max-width: 760px;
  margin: 6px 0 0;
  color: #59665f;
  font-size: 10px;
  line-height: 1.65;
}
.learning-code-runtime-summary {
  display: flex;
  min-width: 260px;
  max-width: 380px;
  align-items: flex-start;
  gap: 7px;
  padding: 9px 10px;
  border: 1px solid #e1c5b9;
  border-radius: 7px;
  background: #fff7f3;
  color: #9a3f2d;
}
.learning-code-runtime-summary.ready {
  border-color: #b8d2c3;
  background: #eef7f1;
  color: #256a50;
}
.learning-code-runtime-summary span {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.learning-code-runtime-summary b,
.learning-code-runtime-summary small {
  overflow: hidden;
  text-overflow: ellipsis;
}
.learning-code-runtime-summary b {
  font-size: 10px;
}
.learning-code-runtime-summary small {
  color: #66736c;
  font-size: 8px;
  line-height: 1.5;
}
.learning-code-setup {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e1c5b9;
  border-left: 3px solid #a84a35;
  border-radius: 7px;
  background: #fff9f6;
}
.learning-code-setup-copy > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #9a3f2d;
  font-size: 9px;
  font-weight: 750;
}
.learning-code-setup h3 {
  margin: 4px 0 0;
  font-size: 13px;
}
.learning-code-setup ol {
  display: grid;
  gap: 3px;
  margin: 7px 0 0;
  padding-left: 19px;
  color: #5e625f;
  font-size: 9px;
  line-height: 1.55;
}
.learning-code-setup-actions {
  display: grid;
  align-content: start;
  gap: 6px;
}
.learning-code-setup-actions a,
.learning-code-setup-actions button,
.learning-code-reset,
.learning-code-actions button,
.learning-code-evidence-action button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 10px;
  border: 1px solid #d1d8d2;
  border-radius: 6px;
  background: #fff;
  color: #405048;
  font: inherit;
  font-size: 9px;
  font-weight: 650;
  text-decoration: none;
  cursor: pointer;
}
.learning-code-setup-actions button {
  border-color: #256a50;
  background: #256a50;
  color: #fff;
}
.learning-code-task {
  display: grid;
  grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
  gap: 12px;
  padding: 10px 11px;
  border: 1px solid #d6ddd7;
  border-radius: 7px;
  background: #f4f7f4;
}
.learning-code-task header {
  min-width: 0;
}
.learning-code-task header span,
.learning-code-task header b {
  display: block;
}
.learning-code-task header span {
  color: #256a50;
  font-size: 8px;
  font-weight: 750;
}
.learning-code-task header b {
  margin-top: 2px;
  font-size: 11px;
}
.learning-code-task > p,
.learning-code-task header small {
  margin: 0;
  color: #59665f;
  font-size: 9px;
  line-height: 1.6;
}
.learning-code-task header small {
  display: block;
  margin-top: 4px;
}
.learning-code-toolbar {
  padding: 8px 9px;
  border: 1px solid #d6ddd7;
  border-radius: 7px;
  background: #f5f7f4;
}
.learning-code-toolbar > label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #59665f;
  font-size: 9px;
}
.learning-code-select {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.learning-code-select select {
  min-height: 34px;
  appearance: none;
  padding: 0 30px 0 10px;
  border: 1px solid #cdd5cf;
  border-radius: 6px;
  background: #fff;
  color: #17221d;
  font: inherit;
  font-size: 10px;
}
.learning-code-select svg {
  position: absolute;
  right: 9px;
  pointer-events: none;
  color: #68766e;
}
.learning-code-runtime {
  min-width: 0;
  overflow: hidden;
  color: #68766e;
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.learning-code-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.14fr) minmax(300px, .86fr);
  gap: 10px;
}
.learning-code-preview {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.learning-code-preview > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #59665f;
  font-size: 10px;
}
.learning-code-preview > header span {
  color: #256a50;
  font-weight: 700;
}
.learning-code-preview iframe {
  width: 100%;
  height: 360px;
  border: 1px solid #cdd7cf;
  border-radius: 6px;
  background: #fff;
}
.learning-code-editor,
.learning-code-io {
  display: grid;
  min-width: 0;
  overflow: hidden;
  border: 1px solid #d6ddd7;
  border-radius: 7px;
  background: #fff;
}
.learning-code-editor > header {
  min-height: 34px;
  padding: 0 10px;
  border-bottom: 1px solid #e2e7e3;
  color: #68766e;
  font: 9px/1 ui-monospace, "SFMono-Regular", Consolas, monospace;
}
.learning-code-editor :deep(.code-editor-wrap),
.learning-code-editor :deep(.code-editor-pane) {
  height: 390px;
}
.learning-code-io {
  gap: 9px;
  align-content: start;
  padding: 10px;
}
.learning-code-io > label {
  display: grid;
  gap: 6px;
}
.learning-code-source {
  border: 1px solid #e2e7e3;
  border-radius: 6px;
  background: #f8faf8;
}
.learning-code-source summary {
  min-height: 34px;
  padding: 9px 10px;
  color: #405048;
  font-size: 9px;
  font-weight: 650;
  cursor: pointer;
}
.learning-code-source pre {
  max-height: 220px;
  overflow: auto;
  margin: 0;
  padding: 10px;
  border-top: 1px solid #e2e7e3;
  color: #30433a;
  font: 9px/1.6 ui-monospace, "SFMono-Regular", Consolas, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.learning-code-io > label > span {
  color: #59665f;
  font-size: 9px;
  font-weight: 650;
}
.learning-code-io textarea {
  min-height: 76px;
  resize: vertical;
  padding: 9px;
  border: 1px solid #d6ddd7;
  border-radius: 6px;
  background: #f8faf8;
  color: #17221d;
  font: 10px/1.6 ui-monospace, "SFMono-Regular", Consolas, monospace;
}
.learning-code-actions > span {
  min-width: 0;
  overflow: hidden;
  color: #68766e;
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.learning-code-actions button {
  min-height: 40px;
  flex: 0 0 auto;
  border-color: #256a50;
  background: #256a50;
  color: #fff;
  font-size: 10px;
}
.learning-code-actions button:disabled,
.learning-code-evidence-action button:disabled {
  opacity: .48;
  cursor: not-allowed;
}
.learning-code-output {
  overflow: hidden;
  border: 1px solid #d6ddd7;
  border-radius: 6px;
}
.learning-code-output > header {
  min-height: 34px;
  padding: 0 9px;
  background: #f3f7f4;
}
.learning-code-output > header > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 9px;
  font-weight: 750;
}
.learning-code-output > header > span.ok {
  color: #256a50;
}
.learning-code-output > header > span.failed {
  color: #a03a29;
}
.learning-code-output > header small {
  color: #68766e;
  font-size: 8px;
}
.learning-code-output pre {
  max-height: 240px;
  min-height: 96px;
  overflow: auto;
  margin: 0;
  padding: 11px;
  background: #14221c;
  color: #dce9e2;
  font: 10px/1.65 ui-monospace, "SFMono-Regular", Consolas, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.learning-code-evidence-action {
  padding: 10px;
  border: 1px solid #b8d2c3;
  border-radius: 6px;
  background: #eef7f1;
}
.learning-code-evidence-action > div {
  min-width: 0;
}
.learning-code-evidence-action b,
.learning-code-evidence-action small {
  display: block;
}
.learning-code-evidence-action b {
  color: #214d3b;
  font-size: 10px;
}
.learning-code-evidence-action small {
  margin-top: 2px;
  color: #597065;
  font-size: 8px;
  line-height: 1.5;
}
.learning-code-evidence-action button {
  flex: 0 0 auto;
  border-color: #256a50;
  color: #256a50;
}
.learning-code-alert {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 9px 10px;
  border-left: 3px solid #b42318;
  border-radius: 5px;
  background: #fff4f2;
  color: #912018;
  font-size: 9px;
  line-height: 1.6;
}
.learning-code-safety {
  margin: 0;
  color: #68766e;
  font-size: 8px;
  line-height: 1.6;
}
.spin {
  animation: learning-code-spin .8s linear infinite;
}
@keyframes learning-code-spin {
  to { transform: rotate(360deg); }
}
.learning-code-lab a:focus-visible,
.learning-code-lab button:focus-visible,
.learning-code-lab select:focus-visible,
.learning-code-lab textarea:focus-visible {
  outline: 2px solid #256a50;
  outline-offset: 2px;
}
@media (max-width: 900px) {
  .learning-code-head,
  .learning-code-task {
    grid-template-columns: 1fr;
  }
  .learning-code-head {
    display: grid;
  }
  .learning-code-runtime-summary {
    width: 100%;
    max-width: none;
    min-width: 0;
  }
  .learning-code-setup {
    grid-template-columns: 1fr;
  }
  .learning-code-setup-actions {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .learning-code-grid {
    grid-template-columns: 1fr;
  }
  .learning-code-preview iframe {
    height: 320px;
  }
  .learning-code-editor :deep(.code-editor-wrap),
  .learning-code-editor :deep(.code-editor-pane) {
    height: 320px;
  }
  .learning-code-toolbar {
    flex-wrap: wrap;
  }
  .learning-code-runtime {
    order: 3;
    width: 100%;
  }
  .learning-code-setup-actions a,
  .learning-code-setup-actions button,
  .learning-code-reset,
  .learning-code-actions button,
  .learning-code-evidence-action button {
    min-height: 44px;
  }
}
@media (max-width: 560px) {
  .learning-code-lab {
    padding: 11px;
  }
  .learning-code-head h2 {
    font-size: 17px;
  }
  .learning-code-setup-actions {
    grid-template-columns: 1fr;
  }
  .learning-code-toolbar {
    align-items: stretch;
  }
  .learning-code-toolbar > label {
    width: 100%;
    justify-content: space-between;
  }
  .learning-code-select {
    flex: 1;
  }
  .learning-code-select select {
    width: 100%;
    min-height: 44px;
  }
  .learning-code-reset {
    width: 100%;
  }
  .learning-code-editor :deep(.code-editor-wrap),
  .learning-code-editor :deep(.code-editor-pane) {
    height: 280px;
  }
  .learning-code-preview iframe {
    height: 300px;
  }
  .learning-code-actions,
  .learning-code-evidence-action {
    align-items: stretch;
    flex-direction: column;
  }
  .learning-code-actions button,
  .learning-code-evidence-action button {
    width: 100%;
  }
}
</style>
