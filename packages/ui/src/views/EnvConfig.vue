<template>
  <div class="env">
    <div class="env-head">
      <div>
        <h3 class="env-title">开发环境</h3>
        <p class="env-sub">按工具分类配置路径与参数。配置会注入到代码模式的终端、运行与调试进程。</p>
      </div>
      <div class="env-head-actions">
        <button class="env-btn" :disabled="detecting" @click="detect">
          <el-icon v-if="detecting" :size="13" class="spin"><Loading /></el-icon>
          <el-icon v-else :size="13"><MagicStick /></el-icon>自动检测
        </button>
        <button class="env-btn" :disabled="saving" @click="save">
          <el-icon :size="13"><Select /></el-icon>保存
        </button>
        <button class="env-btn danger" @click="reset">
          <el-icon :size="13"><RefreshLeft /></el-icon>恢复默认
        </button>
      </div>
    </div>

    <!-- 分类 tab -->
    <div class="env-tabs">
      <button
        v-for="t in TABS"
        :key="t.key"
        class="env-tab"
        :class="{ on: activeTab === t.key }"
        @click="activeTab = t.key"
      >
        <span
          v-if="t.tool"
          class="env-tab-dot"
          :class="{ ok: currentTool?.ok, bad: currentTool && !currentTool.ok }"
        ></span>
        {{ t.label }}
      </button>
    </div>

    <div class="env-body">
      <!-- 当前工具状态卡片（通用 tab 无对应工具） -->
      <div v-if="currentTool" class="env-card" :class="{ ok: currentTool.ok }">
        <div class="env-card-top">
          <span class="env-card-dot"></span>
          <span class="env-card-name">{{ currentTool.label }}</span>
          <span class="env-card-ver">{{ currentTool.ok ? currentTool.version : '未就绪' }}</span>
        </div>
        <div class="env-card-path" :title="currentTool.ok ? currentTool.path : currentTool.error">
          {{ currentTool.ok ? currentTool.path : currentTool.error }}
        </div>
      </div>

      <!-- ===== Java ===== -->
      <template v-if="activeTab === 'java'">
        <div class="env-field">
          <label class="env-label">JAVA_HOME（JDK 根目录）</label>
          <div class="env-input-row">
            <el-input v-model="form.javaHome" size="default" placeholder="如 C:\Program Files\Java\jdk-17" />
            <button class="env-pick" @click="pick('javaHome', true)">浏览</button>
          </div>
          <p class="env-tip">目录下的 bin/java 会被加入 PATH；运行 Java 主类、编译 classpath 都用它。</p>
        </div>
        <div class="env-field">
          <label class="env-label">JAVA_OPTS</label>
          <el-input v-model="form.javaOpts" size="default" placeholder="如 -Xmx512m -Dfile.encoding=UTF-8" />
          <p class="env-tip">运行 Java 主类时附加的 JVM 参数。</p>
        </div>
      </template>

      <!-- ===== Maven ===== -->
      <template v-else-if="activeTab === 'maven'">
        <div class="env-field">
          <label class="env-label">Maven 根目录（M2_HOME）</label>
          <div class="env-input-row">
            <el-input v-model="form.mavenHome" size="default" placeholder="如 D:\apache-maven-3.9.6" />
            <button class="env-pick" @click="pick('mavenHome', true)">浏览</button>
          </div>
          <p class="env-tip">目录下的 bin/mvn 会被加入 PATH；Maven 运行配置直接调用它。</p>
        </div>
        <div class="env-field">
          <label class="env-label">MAVEN_OPTS</label>
          <el-input v-model="form.mavenOpts" size="default" placeholder="如 -DskipTests -o" />
          <p class="env-tip">每次执行 Maven goal 时附加的参数。</p>
        </div>
      </template>

      <!-- ===== Python ===== -->
      <template v-else-if="activeTab === 'python'">
        <div class="env-field">
          <label class="env-label">Python 解释器</label>
          <div class="env-input-row">
            <el-input v-model="form.pythonPath" size="default" placeholder="如 C:\Python311\python.exe（留空用 PATH 里的 python）" />
            <button class="env-pick" @click="pick('pythonPath', false)">浏览</button>
          </div>
          <p class="env-tip">运行 / 调试 Python 脚本使用的解释器。</p>
        </div>
        <div class="env-field">
          <label class="env-label">pip 镜像源</label>
          <el-input v-model="form.pipIndexUrl" size="default" placeholder="如 https://pypi.tuna.tsinghua.edu.cn/simple" />
          <p class="env-tip">安装 debugpy 等依赖时使用；受限网络建议填国内镜像。</p>
        </div>
        <div class="env-field">
          <label class="env-label">断点调试依赖</label>
          <div class="env-inline">
            <button class="env-btn sm" :disabled="!!installing" @click="installDebugpy">
              <el-icon v-if="installing === 'debugpy'" :size="12" class="spin"><Loading /></el-icon>
              <el-icon v-else :size="12"><Download /></el-icon>安装 debugpy
            </button>
            <span class="env-inline-note">{{ debugpyNote }}</span>
          </div>
          <p class="env-tip">Python 断点基于 DAP，需要 debugpy（装在 Python 环境里，不占应用体积）。</p>
        </div>
      </template>

      <!-- ===== Node ===== -->
      <template v-else-if="activeTab === 'node'">
        <div class="env-field">
          <label class="env-label">Node 可执行文件</label>
          <div class="env-input-row">
            <el-input v-model="form.nodePath" size="default" placeholder="留空用 PATH 里的 node" />
            <button class="env-pick" @click="pick('nodePath', false)">浏览</button>
          </div>
          <p class="env-tip">Node 断点用内置 inspector（--inspect-brk），不需要额外依赖。</p>
        </div>
      </template>

      <!-- ===== Git ===== -->
      <template v-else-if="activeTab === 'git'">
        <div class="env-field">
          <label class="env-label">Git 可执行文件</label>
          <div class="env-input-row">
            <el-input v-model="form.gitPath" size="default" placeholder="留空用 PATH 里的 git" />
            <button class="env-pick" @click="pick('gitPath', false)">浏览</button>
          </div>
          <p class="env-tip">代码模式左栏「源代码管理」与 git 相关工具使用。</p>
        </div>
      </template>

      <!-- ===== 通用 ===== -->
      <template v-else>
        <div class="env-field">
          <label class="env-label">终端默认 Shell</label>
          <el-select v-model="form.defaultShell" size="default" class="env-select">
            <el-option label="PowerShell" value="powershell" />
            <el-option label="CMD" value="cmd" />
            <el-option label="Bash" value="bash" />
          </el-select>
          <p class="env-tip">代码模式底部控制台新建会话时使用的 shell。</p>
        </div>
        <div class="env-field">
          <label class="env-label">附加环境变量（每行一条 KEY=VALUE，注入所有终端与运行进程）</label>
          <el-input v-model="extraEnvText" type="textarea" :rows="4" placeholder="GRADLE_USER_HOME=C:\.gradle&#10;NODE_ENV=development" />
        </div>
      </template>
    </div>

    <!-- 安装日志 -->
    <div v-if="installLog" class="env-log">
      <div class="env-log-head">安装日志<button class="env-log-close" @click="installLog = ''">×</button></div>
      <pre class="env-log-body">{{ installLog }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Loading, MagicStick, Select, RefreshLeft, Download } from '@element-plus/icons-vue';
import { api } from '../api/client';
import type { DevEnvConfig } from '../types/dev-env';

interface ToolStatus { id: string; label: string; path: string; version: string; ok: boolean; error: string }

type TabKey = 'java' | 'maven' | 'python' | 'node' | 'git' | 'general';

const TABS: Array<{ key: TabKey; label: string; tool?: string }> = [
  { key: 'java', label: 'Java', tool: 'java' },
  { key: 'maven', label: 'Maven', tool: 'maven' },
  { key: 'python', label: 'Python', tool: 'python' },
  { key: 'node', label: 'Node', tool: 'node' },
  { key: 'git', label: 'Git', tool: 'git' },
  { key: 'general', label: '通用' },
];

const activeTab = ref<TabKey>('java');

const form = reactive<DevEnvConfig>({
  javaHome: '', mavenHome: '', pythonPath: '', nodePath: '', gitPath: '',
  defaultShell: 'powershell', extraEnv: {}, javaOpts: '', mavenOpts: '', pipIndexUrl: '',
});
const extraEnvText = ref('');
const tools = ref<ToolStatus[]>([]);
const detecting = ref(false);
const saving = ref(false);
const installing = ref('');
const installLog = ref('');
const debugpyNote = ref('');

const currentTool = computed<ToolStatus | null>(() => {
  const tab = TABS.find((t) => t.key === activeTab.value);
  if (!tab?.tool) return null;
  return tools.value.find((t) => t.id === tab.tool) || null;
});

function parseExtraEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of extraEnvText.value.split('\n')) {
    const m = /^([A-Za-z_][\w.]*)\s*=\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function fillFrom(cfg: DevEnvConfig) {
  Object.assign(form, cfg, { extraEnv: cfg.extraEnv || {} });
  extraEnvText.value = Object.entries(form.extraEnv || {}).map(([k, v]) => `${k}=${v}`).join('\n');
}

async function load() {
  const r = await api.get<DevEnvConfig>('/env');
  if ('error' in r) return;
  fillFrom(r.data);
  await verify();
}

async function verify() {
  const r = await api.post<ToolStatus[]>('/env/verify', { ...form, extraEnv: parseExtraEnv() });
  if ('error' in r) return;
  tools.value = r.data || [];
}

async function detect() {
  detecting.value = true;
  const r = await api.post<{ suggested: Partial<DevEnvConfig>; tools: ToolStatus[] }>('/env/detect', {});
  detecting.value = false;
  if ('error' in r) { ElMessage.error(r.error); return; }
  fillFrom({ ...form, ...r.data.suggested } as DevEnvConfig);
  tools.value = r.data.tools || [];
  ElMessage.success('已检测到本机工具链，确认后点「保存」');
}

async function save() {
  saving.value = true;
  const payload: DevEnvConfig = { ...form, extraEnv: parseExtraEnv() };
  const r = await api.put<DevEnvConfig>('/env', payload);
  saving.value = false;
  if ('error' in r) { ElMessage.error(r.error); return; }
  fillFrom(r.data);
  await verify();
  ElMessage.success('开发环境已保存');
}

async function reset() {
  const r = await api.post<DevEnvConfig>('/env/reset', {});
  if ('error' in r) { ElMessage.error(r.error); return; }
  fillFrom(r.data);
  await verify();
  ElMessage.success('已恢复默认');
}

/** 浏览：桌面端走原生目录/文件选择，web 端退化为手填提示 */
async function pick(key: 'javaHome' | 'mavenHome' | 'pythonPath' | 'nodePath' | 'gitPath', isDir: boolean) {
  try {
    const { getPlatformAdapter } = await import('@yan-zhi/core');
    const adapter = getPlatformAdapter();
    const picked = isDir
      ? await (adapter as any).dialog?.pickDirectory?.()
      : await (adapter as any).dialog?.pickFile?.();
    if (picked) { (form as any)[key] = picked; await verify(); }
    else ElMessage.info('当前平台不支持浏览，请手动填写路径');
  } catch {
    ElMessage.info('当前平台不支持浏览，请手动填写路径');
  }
}

async function checkDebugpy() {
  const r = await api.get<{ installed: boolean; version?: string; error?: string }>('/env/debugpy');
  if ('error' in r) return;
  debugpyNote.value = r.data.installed ? `已安装 v${r.data.version || ''}` : (r.data.error || '未安装');
}

async function installDebugpy() {
  installing.value = 'debugpy';
  installLog.value = '';
  const r = await api.post<{ ok: boolean; log: string }>('/env/debugpy/install', {});
  installing.value = '';
  if ('error' in r) { ElMessage.error(r.error); return; }
  installLog.value = r.data.log || '';
  if (r.data.ok) { ElMessage.success('debugpy 安装完成'); await checkDebugpy(); }
  else ElMessage.error('安装失败，详见日志');
}

onMounted(async () => {
  await load();
  await checkDebugpy();
});
</script>

<style scoped>
.env { display: flex; flex-direction: column; gap: 14px; }

.env-head { display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.env-title { margin: 0 0 4px; font-size: 15px; font-weight: 700; color: var(--color-text, #1a1a1a); }
.env-sub { margin: 0; font-size: 12px; line-height: 1.6; color: var(--color-text-tertiary, #9c9b94); max-width: 620px; }
.env-head-actions { display: flex; gap: 6px; margin-left: auto; }

.env-btn {
  display: inline-flex; align-items: center; gap: 5px;
  height: 30px; padding: 0 12px; font-size: 12px; font-family: inherit; cursor: pointer;
  border: 1px solid var(--glass-border-strong, #d8d5cc); border-radius: 8px;
  background: var(--color-surface, #fff); color: var(--color-text, #1a1a1a);
  transition: all 0.15s ease;
}
.env-btn:hover:not(:disabled) { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.env-btn:disabled { opacity: 0.5; cursor: default; }
.env-btn.danger:hover { border-color: var(--el-color-danger); color: var(--el-color-danger); }
.env-btn.sm { height: 26px; padding: 0 10px; font-size: 11.5px; }
.spin { animation: env-spin 0.9s linear infinite; }
@keyframes env-spin { to { transform: rotate(360deg); } }

/* ===== 分类 tab ===== */
.env-tabs {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  padding: 3px; border-radius: 10px;
  background: var(--el-fill-color-lighter, #f6f4ef);
  border: 1px solid var(--glass-border, #e7e4dc);
}
.env-tab {
  display: inline-flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 14px; font-size: 12px; font-family: inherit;
  border: none; border-radius: 8px; background: transparent;
  color: var(--color-text-secondary, #6b6b66); cursor: pointer;
  transition: all 0.15s ease;
}
.env-tab:hover { color: var(--color-text, #1a1a1a); }
.env-tab.on {
  background: var(--color-surface, #fff);
  color: var(--color-primary, #c2410c); font-weight: 600;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
}
.env-tab-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-text-tertiary, #9c9b94); flex-shrink: 0; }
.env-tab-dot.ok { background: var(--color-success, #2f6b4f); }
.env-tab-dot.bad { background: var(--el-color-danger); }

.env-body { display: flex; flex-direction: column; gap: 14px; }

/* ===== 状态卡片 ===== */
.env-card {
  padding: 10px 12px; border-radius: 10px;
  border: 1px solid var(--glass-border, #e7e4dc);
  background: var(--color-surface, #fff);
}
.env-card-top { display: flex; align-items: center; gap: 6px; }
.env-card-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--color-text-tertiary, #9c9b94); flex-shrink: 0; }
.env-card.ok .env-card-dot {
  background: var(--color-success, #2f6b4f);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-success, #2f6b4f) 18%, transparent);
}
.env-card-name { font-size: 12.5px; font-weight: 600; color: var(--color-text, #1a1a1a); }
.env-card-ver { margin-left: auto; font-size: 11px; color: var(--color-text-tertiary, #9c9b94); }
.env-card-path {
  margin-top: 4px; font-size: 10.5px; line-height: 1.5; color: var(--color-text-tertiary, #9c9b94);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ===== 表单 ===== */
.env-field { display: flex; flex-direction: column; gap: 5px; }
.env-label { font-size: 12px; font-weight: 600; color: var(--color-text, #1a1a1a); }
.env-input-row { display: flex; gap: 6px; }
.env-pick {
  height: 32px; padding: 0 12px; flex-shrink: 0; cursor: pointer;
  border: 1px solid var(--glass-border-strong, #d8d5cc); border-radius: 8px;
  background: transparent; color: var(--color-text-secondary, #6b6b66);
  font-size: 12px; font-family: inherit;
}
.env-pick:hover { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.env-tip { margin: 0; font-size: 11px; color: var(--color-text-tertiary, #9c9b94); }
.env-inline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.env-inline-note { font-size: 11px; color: var(--color-text-tertiary, #9c9b94); }
.env-select { width: 100%; }

/* ===== 安装日志 ===== */
.env-log { border: 1px solid var(--glass-border, #e7e4dc); border-radius: 10px; overflow: hidden; }
.env-log-head {
  display: flex; align-items: center;
  padding: 6px 10px; font-size: 11.5px; font-weight: 600;
  background: var(--el-fill-color-lighter, #f6f4ef); color: var(--color-text-secondary, #6b6b66);
}
.env-log-close {
  margin-left: auto; border: none; background: transparent; cursor: pointer;
  font-size: 16px; line-height: 1; color: var(--color-text-tertiary, #9c9b94);
}
.env-log-body {
  margin: 0; padding: 8px 10px; max-height: 220px; overflow: auto;
  font-family: var(--font-mono, Consolas, monospace); font-size: 11px; line-height: 1.55;
  white-space: pre-wrap; word-break: break-all; color: var(--color-text-secondary, #6b6b66);
}
</style>
