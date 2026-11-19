<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Code2,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  TerminalSquare,
  Wrench,
} from 'lucide-vue-next';
import type { ProgrammingProject } from '@yan-zhi/shared';
import { api } from '../../api/client';
import { setMode } from '../../stores/mode';
import type { DevToolStatus } from '../../types/dev-env';

type ToolId = 'java' | 'python' | 'node' | 'c' | 'cpp' | 'cmake';

type ToolChannel = {
  id: ToolId;
  label: string;
  requirement: string;
  download: string;
  docs: string;
};

type ScaffoldResult = {
  projectId: string;
  path: string;
  created: boolean;
  files: string[];
  nextCommands: string[];
};

const props = defineProps<{
  project?: ProgrammingProject | null;
}>();

const tools = ref<DevToolStatus[]>([]);
const detecting = ref(false);
const detectionError = ref('');
const scaffoldBusy = ref(false);
const scaffoldError = ref('');
const scaffold = ref<ScaffoldResult | null>(null);

const CHANNELS: readonly ToolChannel[] = [
  {
    id: 'java',
    label: 'Java / JDK',
    requirement: 'Java 17/21 LTS',
    download: 'https://adoptium.net/temurin/releases/',
    docs: 'https://docs.oracle.com/en/java/',
  },
  {
    id: 'python',
    label: 'Python',
    requirement: '3.11+',
    download: 'https://www.python.org/downloads/',
    docs: 'https://docs.python.org/3/using/',
  },
  {
    id: 'node',
    label: 'Node.js',
    requirement: '20/22/24 LTS',
    download: 'https://nodejs.org/en/download',
    docs: 'https://nodejs.org/en/learn/getting-started/introduction-to-nodejs',
  },
  {
    id: 'c',
    label: 'C 编译器',
    requirement: 'GCC 或 Clang',
    download: 'https://www.msys2.org/',
    docs: 'https://gcc.gnu.org/onlinedocs/',
  },
  {
    id: 'cpp',
    label: 'C++ 编译器',
    requirement: 'GCC / Clang C++20',
    download: 'https://www.msys2.org/',
    docs: 'https://eel.is/c++draft/',
  },
  {
    id: 'cmake',
    label: 'CMake',
    requirement: '3.25+',
    download: 'https://cmake.org/download/',
    docs: 'https://cmake.org/cmake/help/latest/guide/user-interaction/',
  },
];

const statusById = computed(() => new Map(tools.value.map((tool) => [tool.id, tool])));
const installedCount = computed(() =>
  CHANNELS.filter((channel) => statusById.value.get(channel.id)?.ok).length,
);

function unwrap<T>(result: unknown): T | null {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: T }).data;
  }
  return null;
}

async function detect(): Promise<void> {
  detecting.value = true;
  detectionError.value = '';
  try {
    const result = await api.post<{ suggested: unknown; tools: DevToolStatus[] }>('/env/detect', {});
    if ('error' in result) throw new Error(result.error);
    tools.value = unwrap<{ suggested: unknown; tools: DevToolStatus[] }>(result)?.tools || [];
  } catch (error) {
    detectionError.value = error instanceof Error ? error.message : '本机环境检测失败';
  } finally {
    detecting.value = false;
  }
}

async function createProject(): Promise<void> {
  if (!props.project) return;
  scaffoldBusy.value = true;
  scaffoldError.value = '';
  try {
    const result = await api.post<ScaffoldResult>('/env/projects/scaffold', {
      projectId: props.project.id,
    });
    if ('error' in result) throw new Error(result.error);
    scaffold.value = unwrap<ScaffoldResult>(result);
  } catch (error) {
    scaffoldError.value = error instanceof Error ? error.message : '训练工程创建失败';
  } finally {
    scaffoldBusy.value = false;
  }
}

async function openDirectory(): Promise<void> {
  if (!scaffold.value?.path) return;
  await api.post('/env/open', { dir: scaffold.value.path });
}

async function openCodeWorkbench(): Promise<void> {
  if (!scaffold.value?.path) return;
  const { useCodeStore } = await import('../../stores/code');
  const code = useCodeStore();
  code.setProjectDir(scaffold.value.path);
  setMode('dev');
  window.location.hash = '#/code';
}
</script>

<template>
  <section class="programming-environment" aria-labelledby="programming-environment-title">
    <header class="programming-environment-head">
      <div>
        <span><Wrench :size="15" />本机开发环境</span>
        <h2 id="programming-environment-title">先识别工具链，再开始项目</h2>
      </div>
      <button type="button" :disabled="detecting" @click="detect">
        <LoaderCircle v-if="detecting" :size="14" class="spin" />
        <RefreshCw v-else :size="14" />
        {{ detecting ? '检测中' : tools.length ? '重新检测' : '检测本机' }}
      </button>
    </header>

    <div class="programming-environment-summary">
      <span>{{ tools.length ? `${installedCount} / ${CHANNELS.length} 个工具可用` : '尚未检测本机环境' }}</span>
      <small>识别 Java、Python、Node、C、C++ 和 CMake，不自动安装，不执行未知命令。</small>
    </div>

    <div v-if="detectionError" class="programming-environment-error" role="alert">
      <CircleAlert :size="15" />{{ detectionError }}
    </div>

    <div class="programming-environment-grid">
      <article
        v-for="channel in CHANNELS"
        :key="channel.id"
        class="programming-environment-card"
        :class="{ ok: statusById.get(channel.id)?.ok, missing: tools.length && !statusById.get(channel.id)?.ok }"
      >
        <header>
          <span>{{ channel.label }}</span>
          <CheckCircle2 v-if="statusById.get(channel.id)?.ok" :size="15" />
          <CircleAlert v-else-if="tools.length" :size="15" />
          <TerminalSquare v-else :size="15" />
        </header>
        <b>{{ statusById.get(channel.id)?.ok ? statusById.get(channel.id)?.version : channel.requirement }}</b>
        <small v-if="statusById.get(channel.id)?.ok" :title="statusById.get(channel.id)?.path">
          {{ statusById.get(channel.id)?.path }}
        </small>
        <small v-else>{{ tools.length ? '未检测到，请安装或配置路径' : '点击检测读取本机状态' }}</small>
        <div>
          <a :href="channel.download" target="_blank" rel="noopener noreferrer">
            <ArrowUpRight :size="12" />官方下载
          </a>
          <a :href="channel.docs" target="_blank" rel="noopener noreferrer">
            文档
          </a>
        </div>
      </article>
    </div>

    <section v-if="project" class="programming-scaffold">
      <header>
        <div>
          <span><Code2 :size="15" />项目启动器</span>
          <h3>{{ project.shortTitle }}</h3>
        </div>
        <button type="button" :disabled="scaffoldBusy" @click="createProject">
          <LoaderCircle v-if="scaffoldBusy" :size="14" class="spin" />
          <Code2 v-else :size="14" />
          {{ scaffoldBusy ? '创建中' : scaffold ? '刷新工程骨架' : '创建训练工程' }}
        </button>
      </header>
      <p>在应用数据目录生成需求、API、数据模型、十个阶段、运行手册和依赖启动配置，不覆盖已有业务代码。</p>

      <div v-if="scaffoldError" class="programming-environment-error" role="alert">
        <CircleAlert :size="15" />{{ scaffoldError }}
      </div>

      <div v-if="scaffold" class="programming-scaffold-result">
        <div>
          <CheckCircle2 :size="15" />
          <span>
            <b>{{ scaffold.created ? '训练工程已创建' : '训练工程已存在，可继续使用' }}</b>
            <small>{{ scaffold.path }}</small>
          </span>
        </div>
        <p>已生成 {{ scaffold.files.length }} 个文件，包含 {{ project.phases.length }} 个阶段计划和运行手册。</p>
        <code v-for="command in scaffold.nextCommands" :key="command">{{ command }}</code>
        <div class="programming-scaffold-actions">
          <button type="button" @click="openDirectory"><FolderOpen :size="14" />打开目录</button>
          <button type="button" class="primary" @click="openCodeWorkbench"><Code2 :size="14" />在代码工作台打开</button>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.programming-environment {
  margin-top: 12px;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 86%, transparent);
}
.programming-environment-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.programming-environment-head > div > span,
.programming-scaffold > header > div > span {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-primary);
  font-size: 10px;
  font-weight: 700;
}
.programming-environment-head h2 {
  margin: 4px 0 0;
  font-family: Georgia, "Songti SC", serif;
  font-size: 18px;
}
.programming-environment-head > button,
.programming-scaffold > header > button,
.programming-scaffold-actions button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 10px;
  cursor: pointer;
}
.programming-environment-summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px 14px;
  margin-top: 7px;
}
.programming-environment-summary span { color: var(--color-text-secondary); font-size: 10px; }
.programming-environment-summary small { color: var(--color-text-tertiary); font-size: 9px; }
.programming-environment-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.programming-environment-card {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
}
.programming-environment-card.ok { border-color: color-mix(in srgb, var(--color-success, #2f6b4f) 45%, var(--color-border)); }
.programming-environment-card.missing { border-style: dashed; }
.programming-environment-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  color: var(--color-text-tertiary);
  font-size: 9px;
}
.programming-environment-card.ok header svg { color: var(--color-success, #2f6b4f); }
.programming-environment-card.missing header svg { color: var(--color-warning, #b88230); }
.programming-environment-card > b {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: var(--color-text);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.programming-environment-card > small {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: var(--color-text-tertiary);
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.programming-environment-card > div {
  display: flex;
  gap: 5px;
  margin-top: 8px;
}
.programming-environment-card a {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 3px;
  padding: 0 7px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  color: var(--color-primary);
  font-size: 8px;
  text-decoration: none;
}
.programming-environment-error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 9px;
  padding: 8px 9px;
  border: 1px solid color-mix(in srgb, var(--el-color-danger, #c0392b) 35%, var(--color-border));
  border-radius: 6px;
  color: var(--el-color-danger, #c0392b);
  font-size: 9px;
}
.programming-scaffold {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}
.programming-scaffold > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.programming-scaffold h3 { margin: 4px 0 0; font-size: 14px; }
.programming-scaffold > p {
  margin: 7px 0 0;
  color: var(--color-text-secondary);
  font-size: 9px;
  line-height: 1.6;
}
.programming-scaffold-result {
  margin-top: 9px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--color-success, #2f6b4f) 35%, var(--color-border));
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-success, #2f6b4f) 4%, var(--color-surface));
}
.programming-scaffold-result > div:first-child {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: var(--color-success, #2f6b4f);
}
.programming-scaffold-result span b,
.programming-scaffold-result span small { display: block; }
.programming-scaffold-result span b { font-size: 10px; }
.programming-scaffold-result span small {
  margin-top: 3px;
  overflow-wrap: anywhere;
  color: var(--color-text-secondary);
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 8px;
}
.programming-scaffold-result > p { margin: 7px 0; color: var(--color-text-secondary); font-size: 9px; }
.programming-scaffold-result > code {
  display: block;
  margin-top: 4px;
  padding: 5px 7px;
  overflow-x: auto;
  border-radius: 4px;
  background: var(--color-bg-muted);
  color: var(--color-text-secondary);
  font-size: 8px;
}
.programming-scaffold-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.programming-scaffold-actions button.primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}
.spin { animation: programming-spin 1s linear infinite; }
@keyframes programming-spin { to { transform: rotate(360deg); } }
.programming-environment button:focus-visible,
.programming-environment a:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
@media (max-width: 900px) {
  .programming-environment-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .programming-environment-head > button,
  .programming-scaffold > header > button,
  .programming-scaffold-actions button { min-height: 44px; }
  .programming-environment-card a { min-height: 44px; padding-inline: 10px; }
}
@media (max-width: 520px) {
  .programming-environment { padding: 11px; }
  .programming-environment-head { align-items: flex-start; flex-direction: column; }
  .programming-environment-head > button { width: 100%; }
  .programming-environment-grid { grid-template-columns: 1fr; }
  .programming-scaffold > header { align-items: flex-start; flex-direction: column; }
  .programming-scaffold > header > button { width: 100%; }
}
</style>
