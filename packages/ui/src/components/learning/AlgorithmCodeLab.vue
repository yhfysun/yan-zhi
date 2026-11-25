<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Code2,
  LoaderCircle,
  Play,
  RotateCcw,
} from 'lucide-vue-next';
import type {
  AlgorithmProblem,
} from '@yan-zhi/shared';
import { api } from '../../api/client';

type AlgorithmCodeLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'java'
  | 'c'
  | 'cpp'
  | 'go';
type RuntimeStatus = {
  id: AlgorithmCodeLanguage;
  label: string;
  available: boolean;
  version: string;
  detail: string;
  bundled: boolean;
};
type RunResult = {
  ok: boolean;
  language: AlgorithmCodeLanguage;
  stdout: string;
  stderr: string;
  compileOutput: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  runtime: string;
};

const props = defineProps<{
  problem: AlgorithmProblem;
}>();

const CodeEditorPane = defineAsyncComponent(() => import('../code/CodeEditorPane.vue'));
const STORAGE_KEY = 'yz.algorithms.code.v1';
const runtimes = ref<RuntimeStatus[]>([]);
const loadingRuntimes = ref(true);
const runtimeError = ref('');
const language = ref<AlgorithmCodeLanguage>('javascript');
const code = ref('');
const stdin = ref('');
const running = ref(false);
const runError = ref('');
const result = ref<RunResult | null>(null);

const fileName = computed(() => ({
  javascript: 'main.js',
  typescript: 'main.ts',
  python: 'main.py',
  java: 'Main.java',
  c: 'main.c',
  cpp: 'main.cpp',
  go: 'main.go',
}[language.value]));
const currentRuntime = computed(() =>
  runtimes.value.find((runtime) => runtime.id === language.value) || null,
);
const availableRuntimes = computed(() => runtimes.value.filter((runtime) => runtime.available));
const outputText = computed(() => {
  if (!result.value) return '';
  return [
    result.value.compileOutput ? `[编译]\n${result.value.compileOutput}` : '',
    result.value.stdout ? `[输出]\n${result.value.stdout}` : '',
    result.value.stderr ? `[错误]\n${result.value.stderr}` : '',
  ].filter(Boolean).join('\n\n') || '(无输出)';
});

function unwrap<T>(response: unknown): T | null {
  if (response && typeof response === 'object' && 'data' in response) {
    return (response as { data: T }).data;
  }
  return null;
}

function restoreCodeMap(): Record<string, Record<string, string>> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveCode(): void {
  try {
    const all = restoreCodeMap();
    all[props.problem.id] ||= {};
    all[props.problem.id][language.value] = code.value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Draft persistence is optional; running code still works.
  }
}

function starterCode(nextLanguage: AlgorithmCodeLanguage): string {
  const title = props.problem.title;
  if (nextLanguage === 'javascript') {
    return `// ${title}\nconst fs = require('node:fs');\nconst input = fs.readFileSync(0, 'utf8').trim();\n\n// 先写暴力解，再按伪代码骨架优化\nconsole.log(input);\n`;
  }
  if (nextLanguage === 'typescript') {
    return `// ${title}\nimport { readFileSync } from 'node:fs';\n\nconst input: string = readFileSync(0, 'utf8').trim();\n\n// 先写暴力解，再按伪代码骨架优化\nconsole.log(input);\n`;
  }
  if (nextLanguage === 'python') {
    return `# ${title}\nimport sys\n\ndata = sys.stdin.read().strip()\n\n# 先写暴力解，再按伪代码骨架优化\nprint(data)\n`;
  }
  if (nextLanguage === 'java') {
    return `// ${title}\nimport java.io.*;\nimport java.util.*;\n\npublic class Main {\n  public static void main(String[] args) throws Exception {\n    BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n    String input = br.readLine();\n    System.out.println(input == null ? \"\" : input);\n  }\n}\n`;
  }
  if (nextLanguage === 'go') {
    return `// ${title}\npackage main\n\nimport (\n  "bufio"\n  "fmt"\n  "os"\n)\n\nfunc main() {\n  scanner := bufio.NewScanner(os.Stdin)\n  for scanner.Scan() {\n    fmt.Println(scanner.Text())\n  }\n}\n`;
  }
  if (nextLanguage === 'c') {
    return `/* ${title} */\n#include <stdio.h>\n\nint main(void) {\n  char input[4096];\n  if (fgets(input, sizeof(input), stdin)) fputs(input, stdout);\n  return 0;\n}\n`;
  }
  return `// ${title}\n#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  ios::sync_with_stdio(false);\n  cin.tie(nullptr);\n  string input;\n  if (getline(cin, input)) cout << input << '\\n';\n  return 0;\n}\n`;
}

function loadEditorCode(): void {
  const saved = restoreCodeMap()[props.problem.id]?.[language.value];
  code.value = saved || starterCode(language.value);
  result.value = null;
  runError.value = '';
}

async function loadRuntimes(): Promise<void> {
  loadingRuntimes.value = true;
  runtimeError.value = '';
  try {
    const response = await api.get<{ data: RuntimeStatus[] }>('/env/code-runtimes');
    runtimes.value = unwrap<RuntimeStatus[]>(response) || [];
    const firstAvailable = runtimes.value.find((runtime) => runtime.available);
    if (firstAvailable && !runtimes.value.find((runtime) => runtime.id === language.value)?.available) {
      language.value = firstAvailable.id;
    }
    if (!availableRuntimes.value.length) {
      runtimeError.value = '没有检测到可运行语言。JavaScript 应默认可用，请检查本地服务端。';
    }
  } catch (error) {
    runtimeError.value = error instanceof Error ? error.message : '代码运行环境加载失败';
  } finally {
    loadingRuntimes.value = false;
    loadEditorCode();
  }
}

async function runCode(): Promise<void> {
  if (!currentRuntime.value?.available || running.value) return;
  running.value = true;
  runError.value = '';
  result.value = null;
  saveCode();
  try {
    const response = await api.post<{ data: RunResult }>('/env/run-code', {
      language: language.value,
      source: code.value,
      stdin: stdin.value,
    });
    const data = unwrap<RunResult>(response);
    if (!data) throw new Error('运行接口未返回结果');
    result.value = data;
  } catch (error) {
    runError.value = error instanceof Error ? error.message : '代码运行失败';
  } finally {
    running.value = false;
  }
}

function resetCode(): void {
  code.value = starterCode(language.value);
  result.value = null;
  runError.value = '';
  saveCode();
}

watch(language, () => {
  saveCode();
  loadEditorCode();
});

watch(code, (value) => {
  if (value) saveCode();
});

watch(() => props.problem.id, () => {
  stdin.value = '';
  loadEditorCode();
});

onMounted(() => {
  loadEditorCode();
  void loadRuntimes();
});
</script>

<template>
  <section class="algorithm-code-lab" aria-labelledby="algorithm-code-lab-title">
    <header>
      <div>
        <span><Code2 :size="15" />代码实战</span>
        <h2 id="algorithm-code-lab-title">写完就运行，不用切到别的应用</h2>
      </div>
      <div class="algorithm-code-run-state">
        <LoaderCircle v-if="loadingRuntimes" :size="14" class="spin" />
        <span v-else>{{ availableRuntimes.length }} / {{ runtimes.length }} 种语言可用</span>
      </div>
    </header>

    <div v-if="runtimeError" class="algorithm-code-error" role="alert">
      <AlertTriangle :size="15" />{{ runtimeError }}
    </div>

    <div class="algorithm-code-toolbar">
      <label>
        <span>语言</span>
        <div class="algorithm-code-language">
          <select v-model="language" aria-label="选择代码运行语言">
            <option
              v-for="runtime in runtimes"
              :key="runtime.id"
              :value="runtime.id"
              :disabled="!runtime.available"
            >
              {{ runtime.label }}{{ runtime.available ? '' : '（不可用）' }}
            </option>
          </select>
          <ChevronDown :size="14" />
        </div>
      </label>
      <span v-if="currentRuntime" class="algorithm-code-runtime">
        {{ currentRuntime.bundled ? '内置' : '本机' }} · {{ currentRuntime.version || '版本未知' }}
      </span>
      <button type="button" class="algorithm-code-reset" @click="resetCode">
        <RotateCcw :size="14" />重置模板
      </button>
    </div>
    <div class="algorithm-code-runtimes" aria-label="可用代码运行环境">
      <span
        v-for="runtime in runtimes"
        :key="runtime.id"
        :class="{ available: runtime.available, missing: !runtime.available }"
      >
        <i></i>{{ runtime.label }}
        <small>{{ runtime.available ? (runtime.bundled ? '内置' : runtime.version || '已检测') : '未就绪' }}</small>
      </span>
    </div>

    <div class="algorithm-code-grid">
      <section class="algorithm-code-editor">
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
      <section class="algorithm-code-io">
        <label>
          <span>运行输入 stdin</span>
          <textarea
            v-model="stdin"
            spellcheck="false"
            placeholder="按题目输入格式粘贴一组数据，例如：&#10;5&#10;1 2 3 4 5"
          ></textarea>
        </label>
        <div class="algorithm-code-actions">
          <span v-if="currentRuntime?.available">{{ currentRuntime.detail }}</span>
          <button
            type="button"
            :disabled="running || !currentRuntime?.available || !code.trim()"
            @click="runCode"
          >
            <LoaderCircle v-if="running" :size="15" class="spin" />
            <Play v-else :size="15" />
            {{ running ? '运行中' : '运行代码' }}
          </button>
        </div>
        <div v-if="runError" class="algorithm-code-error" role="alert">
          <AlertTriangle :size="15" />{{ runError }}
        </div>
        <section v-if="result" class="algorithm-code-output">
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
        <p class="algorithm-code-safety">
          代码使用当前系统用户权限在本机临时目录运行，最长 6 秒；只运行你信任的代码。
        </p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.algorithm-code-lab {
  display: grid;
  gap: 10px;
  --algorithm-code-surface: color-mix(in srgb, var(--alg-paper) 96%, #eef5f1);
}
.algorithm-code-lab > header,
.algorithm-code-toolbar,
.algorithm-code-editor > header,
.algorithm-code-output > header,
.algorithm-code-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.algorithm-code-lab > header > div:first-child > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #0f766e;
  font-size: 10px;
  font-weight: 700;
}
.algorithm-code-lab h2 { margin: 4px 0 0; font-size: 18px; }
.algorithm-code-run-state { color: var(--alg-paper-muted); font-size: 9px; }
.algorithm-code-toolbar {
  padding: 9px 10px;
  border: 1px solid rgba(21, 34, 31, .12);
  border-radius: 7px;
  background: var(--algorithm-code-surface);
}
.algorithm-code-toolbar > label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--alg-paper-muted);
  font-size: 9px;
}
.algorithm-code-language {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.algorithm-code-language select {
  min-height: 36px;
  appearance: none;
  padding: 0 30px 0 10px;
  border: 1px solid rgba(21, 34, 31, .15);
  border-radius: 6px;
  background: var(--algorithm-code-surface);
  color: var(--alg-paper-ink);
  font: inherit;
  font-size: 10px;
}
.algorithm-code-language svg {
  position: absolute;
  right: 9px;
  pointer-events: none;
  color: var(--alg-paper-muted);
}
.algorithm-code-runtime {
  min-width: 0;
  overflow: hidden;
  color: var(--alg-paper-muted);
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.algorithm-code-runtimes {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.algorithm-code-runtimes > span {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  border: 1px solid rgba(21, 34, 31, .12);
  border-radius: 999px;
  background: var(--algorithm-code-surface);
  color: var(--alg-paper-muted);
  font-size: 8px;
}
.algorithm-code-runtimes > span > i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #b42318;
}
.algorithm-code-runtimes > span.available > i { background: #0f766e; }
.algorithm-code-runtimes small { color: var(--alg-paper-muted); font-size: 7px; }
.algorithm-code-runtimes .missing { opacity: .55; }
.algorithm-code-reset {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 4px;
  padding: 0 9px;
  border: 1px solid rgba(21, 34, 31, .15);
  border-radius: 6px;
  background: var(--algorithm-code-surface);
  color: var(--alg-paper-muted);
  font-size: 9px;
  cursor: pointer;
}
.algorithm-code-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(300px, .85fr);
  gap: 10px;
}
.algorithm-code-editor,
.algorithm-code-io {
  display: grid;
  min-width: 0;
  border: 1px solid rgba(21, 34, 31, .12);
  border-radius: 7px;
  overflow: hidden;
  background: var(--algorithm-code-surface);
}
.algorithm-code-editor > header {
  min-height: 34px;
  padding: 0 10px;
  border-bottom: 1px solid rgba(21, 34, 31, .1);
  color: var(--alg-paper-muted);
  font: 9px/1 ui-monospace, "SFMono-Regular", Consolas, monospace;
}
.algorithm-code-editor :deep(.code-editor-wrap) { height: 430px; }
.algorithm-code-editor :deep(.code-editor-pane) { height: 430px; }
.algorithm-code-io {
  gap: 9px;
  align-content: start;
  padding: 10px;
}
.algorithm-code-io > label { display: grid; gap: 6px; }
.algorithm-code-io > label > span {
  color: var(--alg-paper-muted);
  font-size: 9px;
  font-weight: 650;
}
.algorithm-code-io textarea {
  min-height: 94px;
  resize: vertical;
  padding: 9px;
  border: 1px solid rgba(21, 34, 31, .14);
  border-radius: 6px;
  background: #f7faf8;
  color: var(--alg-paper-ink);
  font: 11px/1.6 ui-monospace, "SFMono-Regular", Consolas, monospace;
}
.algorithm-code-actions > span {
  min-width: 0;
  overflow: hidden;
  color: var(--alg-paper-muted);
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.algorithm-code-actions button {
  display: inline-flex;
  min-height: 40px;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  padding: 0 13px;
  border: 1px solid #0f766e;
  border-radius: 6px;
  background: #0f766e;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}
.algorithm-code-actions button:disabled { opacity: .45; cursor: not-allowed; }
.algorithm-code-output {
  overflow: hidden;
  border: 1px solid rgba(21, 34, 31, .14);
  border-radius: 6px;
}
.algorithm-code-output > header {
  min-height: 34px;
  padding: 0 9px;
  background: #f3f7f5;
}
.algorithm-code-output > header > span { display: inline-flex; align-items: center; gap: 5px; font-size: 9px; font-weight: 700; }
.algorithm-code-output > header > span.ok { color: #0f766e; }
.algorithm-code-output > header > span.failed { color: #b42318; }
.algorithm-code-output > header small { color: var(--alg-paper-muted); font-size: 8px; }
.algorithm-code-output pre {
  max-height: 230px;
  min-height: 90px;
  overflow: auto;
  margin: 0;
  padding: 11px;
  background: #12201d;
  color: #dce9e4;
  font: 10px/1.65 ui-monospace, "SFMono-Regular", Consolas, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.algorithm-code-error {
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
.algorithm-code-safety { margin: 0; color: var(--alg-paper-muted); font-size: 8px; line-height: 1.6; }
.spin { animation: algorithm-code-spin .8s linear infinite; }
@keyframes algorithm-code-spin { to { transform: rotate(360deg); } }

@media (max-width: 900px) {
  .algorithm-code-grid { grid-template-columns: 1fr; }
  .algorithm-code-editor :deep(.code-editor-wrap),
  .algorithm-code-editor :deep(.code-editor-pane) { height: 320px; }
  .algorithm-code-toolbar { flex-wrap: wrap; }
  .algorithm-code-runtime { order: 3; width: 100%; }
}

@media (max-width: 520px) {
  .algorithm-code-lab > header { align-items: flex-start; }
  .algorithm-code-lab h2 { font-size: 16px; }
  .algorithm-code-toolbar { align-items: flex-start; }
  .algorithm-code-toolbar > label { width: 100%; justify-content: space-between; }
  .algorithm-code-language { flex: 1; }
  .algorithm-code-language select { width: 100%; min-height: 44px; }
  .algorithm-code-reset { min-height: 44px; }
  .algorithm-code-editor :deep(.code-editor-wrap),
  .algorithm-code-editor :deep(.code-editor-pane) { height: 280px; }
  .algorithm-code-actions { align-items: stretch; flex-direction: column; }
  .algorithm-code-actions button { min-height: 44px; justify-content: center; }
}
</style>
