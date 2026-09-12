<template>
  <div class="rdp">
    <!-- ===== 配置选择 ===== -->
    <div class="rdp-head">
      <el-select v-model="code.activeConfigId" size="small" placeholder="选择运行配置" class="rdp-select">
        <el-option v-for="c in code.runConfigs" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-tooltip content="新建配置" placement="bottom" :show-after="400">
        <button class="rdp-icon-btn" @click="newConfig"><el-icon :size="13"><Plus /></el-icon></button>
      </el-tooltip>
      <el-tooltip content="编辑当前配置" placement="bottom" :show-after="400">
        <button class="rdp-icon-btn" :disabled="!current" @click="editConfig"><el-icon :size="13"><EditPen /></el-icon></button>
      </el-tooltip>
      <el-tooltip content="删除当前配置" placement="bottom" :show-after="400">
        <button class="rdp-icon-btn danger" :disabled="!current" @click="delConfig"><el-icon :size="13"><Delete /></el-icon></button>
      </el-tooltip>
    </div>

    <!-- ===== 控制条 ===== -->
    <div class="rdp-ctrl">
      <button class="rdp-run" :disabled="!current || busy" @click="doStart(false)">
        <el-icon :size="12"><CaretRight /></el-icon>运行
      </button>
      <button
        class="rdp-run debug"
        :disabled="!current || busy || !debugSupported"
        :title="debugHint"
        @click="doStart(true)"
      >
        <el-icon :size="12"><Aim /></el-icon>调试
      </button>
      <button class="rdp-stop" :disabled="!sessionActive" @click="stopAll">
        <el-icon :size="12"><SwitchButton /></el-icon>停止
      </button>
    </div>
    <div v-if="current && !debugSupported" class="rdp-note">{{ debugHint }}</div>

    <!-- ===== 配置编辑表单 ===== -->
    <div v-if="editing" class="rdp-form">
      <el-input v-model="form.name" size="small" placeholder="配置名称" />
      <el-select v-model="form.kind" size="small" class="rdp-form-full">
        <el-option label="Java（主类）" value="java" />
        <el-option label="Maven（goal）" value="maven" />
        <el-option label="Python（脚本）" value="python" />
        <el-option label="Node（脚本）" value="node" />
        <el-option label="自定义命令" value="custom" />
      </el-select>
      <el-input v-model="form.cwd" size="small" placeholder="工作目录（留空用项目目录）" />

      <template v-if="form.kind === 'java'">
        <el-input v-model="form.mainClass" size="small" placeholder="主类名，如 com.demo.App" />
        <el-input v-model="form.classpath" size="small" placeholder="classpath，如 target/classes;lib/*" />
      </template>
      <template v-else-if="form.kind === 'maven'">
        <el-input v-model="form.goal" size="small" placeholder="Maven goal，如 spring-boot:run" />
      </template>
      <template v-else-if="form.kind === 'python' || form.kind === 'node'">
        <el-input v-model="form.program" size="small" :placeholder="form.kind === 'python' ? '入口脚本，如 app.py' : '入口脚本，如 index.js'" />
      </template>
      <template v-else-if="form.kind === 'custom'">
        <el-input v-model="form.command" size="small" placeholder="完整命令，如 npm run dev" />
      </template>

      <el-input v-model="argsText" size="small" placeholder="附加参数（空格分隔）" />
      <div class="rdp-form-actions">
        <button class="rdp-btn primary" @click="saveConfig">保存</button>
        <button class="rdp-btn" @click="editing = false">取消</button>
      </div>
    </div>

    <!-- ===== 调试控制（仅调试会话激活） ===== -->
    <div v-if="dbg.id && dbg.state !== 'exited'" class="rdp-dbg">
      <div class="rdp-dbg-bar">
        <el-tooltip content="继续 (F5)" placement="top" :show-after="400">
          <button class="rdp-icon-btn" :disabled="dbg.state !== 'paused'" @click="dbgContinue">
            <el-icon :size="13"><CaretRight /></el-icon>
          </button>
        </el-tooltip>
        <el-tooltip content="单步跳过 (F10)" placement="top" :show-after="400">
          <button class="rdp-icon-btn" :disabled="dbg.state !== 'paused'" @click="dbgStep('over')">
            <el-icon :size="13"><Right /></el-icon>
          </button>
        </el-tooltip>
        <el-tooltip content="单步进入 (F11)" placement="top" :show-after="400">
          <button class="rdp-icon-btn" :disabled="dbg.state !== 'paused'" @click="dbgStep('into')">
            <el-icon :size="13"><Bottom /></el-icon>
          </button>
        </el-tooltip>
        <el-tooltip content="跳出 (Shift+F11)" placement="top" :show-after="400">
          <button class="rdp-icon-btn" :disabled="dbg.state !== 'paused'" @click="dbgStep('out')">
            <el-icon :size="13"><Top /></el-icon>
          </button>
        </el-tooltip>
        <span class="rdp-dbg-state" :class="dbg.state">{{ stateLabel }}</span>
      </div>

      <div v-if="dbg.frames.length" class="rdp-sec">
        <div class="rdp-sec-title">调用栈</div>
        <div
          v-for="(f, i) in dbg.frames"
          :key="f.id + '-' + i"
          class="rdp-frame"
          :class="{ active: i === 0 }"
          :title="f.file"
          @click="selectFrame(f.id)"
        >
          <span class="rdp-frame-name">{{ f.name }}</span>
          <span class="rdp-frame-loc">{{ fileName(f.file) }}:{{ f.line }}</span>
        </div>
      </div>

      <div v-if="dbg.variables.length" class="rdp-sec">
        <div class="rdp-sec-title">变量</div>
        <div v-for="v in dbg.variables.slice(0, 60)" :key="v.name" class="rdp-var">
          <span class="rdp-var-name">{{ v.name }}</span>
          <span class="rdp-var-value" :title="v.value">{{ v.value }}</span>
        </div>
      </div>
    </div>

    <!-- ===== 断点 ===== -->
    <div v-if="bpList.length" class="rdp-sec">
      <div class="rdp-sec-title">
        断点
        <button class="rdp-sec-clear" @click="code.clearBreakpoints()">全部清除</button>
      </div>
      <div v-for="b in bpList" :key="b.path" class="rdp-bp" :title="b.path">
        <span class="rdp-bp-name">{{ fileName(b.path) }}</span>
        <span class="rdp-bp-lines">{{ b.lines.join(', ') }}</span>
        <button class="rdp-bp-del" @click="code.clearBreakpoints(b.path)">
          <el-icon :size="10"><Close /></el-icon>
        </button>
      </div>
    </div>

    <!-- ===== 输出 ===== -->
    <div class="rdp-out-wrap">
      <div class="rdp-sec-title rdp-out-title">
        输出
        <button class="rdp-sec-clear" @click="output = ''">清空</button>
      </div>
      <pre ref="outRef" class="rdp-out">{{ output || '（暂无输出）' }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Plus, EditPen, Delete, CaretRight, Aim, SwitchButton, Right, Bottom, Top, Close,
} from '@element-plus/icons-vue';
import { api, API_BASE } from '../../../api/client';
import { useCodeStore, type RunConfigItem } from '../../../stores/code';

const code = useCodeStore();

const editing = ref(false);
const busy = ref(false);
const output = ref('');
const outRef = ref<HTMLElement | null>(null);
const argsText = ref('');

const form = ref<RunConfigItem>(blankConfig('python'));

const current = computed(() => code.runConfigs.find((c) => c.id === code.activeConfigId) || null);
const debugSupported = computed(() => !!current.value && (current.value.kind === 'python' || current.value.kind === 'node'));
const debugHint = computed(() => {
  const k = current.value?.kind;
  if (!current.value) return '先选择或新建运行配置';
  if (k === 'python') return 'Python 断点需要 debugpy：设置 → 开发环境 → 一键安装';
  if (k === 'node') return 'Node 使用内置 inspector，无需额外依赖';
  return 'Java / Maven 本期仅支持运行，断点需接入 java-debug + jdt.ls';
});

function blankConfig(kind: RunConfigItem['kind']): RunConfigItem {
  return {
    id: `cfg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: '', kind, cwd: '', mainClass: '', classpath: '', goal: '', program: '', command: '', args: [],
  };
}

function newConfig() {
  form.value = blankConfig('python');
  form.value.cwd = code.projectDir || '';
  argsText.value = '';
  editing.value = true;
}

function editConfig() {
  if (!current.value) return;
  form.value = { ...current.value };
  argsText.value = (current.value.args || []).join(' ');
  editing.value = true;
}

function saveConfig() {
  const f = form.value;
  if (!f.name.trim()) { ElMessage.warning('请填写配置名称'); return; }
  const cfg: RunConfigItem = {
    ...f,
    name: f.name.trim(),
    cwd: f.cwd.trim() || code.projectDir || '',
    args: argsText.value.trim() ? argsText.value.trim().split(/\s+/) : [],
  };
  code.saveRunConfig(cfg);
  code.activeConfigId = cfg.id;
  editing.value = false;
  ElMessage.success('配置已保存');
}

async function delConfig() {
  if (!current.value) return;
  try {
    await ElMessageBox.confirm(`删除配置「${current.value.name}」？`, '删除', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    });
  } catch { return; }
  code.removeRunConfig(current.value.id);
}

// ======================== 断点列表 ========================
const bpList = computed(() =>
  Object.entries(code.breakpoints).map(([path, lines]) => ({ path, lines: lines as number[] })),
);

// ======================== SSE ========================
let abort: AbortController | null = null;

async function openStream(url: string, onMsg: (data: any) => void) {
  abort?.abort();
  abort = new AbortController();
  const token = localStorage.getItem('auth_token') || '';
  try {
    const resp = await fetch(`${API_BASE}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: abort!.signal,
    });
    const reader = resp.body?.getReader();
    if (!reader) return;
    const td = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += td.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() || '';
      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === ':connected') continue;
        try { onMsg(JSON.parse(payload)); } catch { /* 非 JSON 帧忽略 */ }
      }
    }
  } catch { /* 主动中止 / 网络中断 */ }
}

function appendOutput(text: string) {
  if (!text) return;
  output.value += text;
  if (output.value.length > 40000) output.value = output.value.slice(-40000);
  void nextTick(() => {
    if (outRef.value) outRef.value.scrollTop = outRef.value.scrollHeight;
  });
}

// ======================== 运行 / 调试 ========================
const runId = ref('');
const dbg = ref<{ id: string; state: string; frames: any[]; variables: any[]; scopes: any[] }>({
  id: '', state: '', frames: [], variables: [], scopes: [],
});
const sessionActive = computed(() => !!runId.value || (!!dbg.value.id && dbg.value.state !== 'exited'));
const STATE_LABEL: Record<string, string> = { starting: '启动中', running: '运行中', paused: '已暂停', exited: '已结束' };
const stateLabel = computed(() => STATE_LABEL[dbg.value.state] || dbg.value.state);

async function doStart(withDebug: boolean) {
  const cfg = current.value;
  if (!cfg) return;
  busy.value = true;
  output.value = '';
  const payload = {
    ...cfg,
    cwd: cfg.cwd || code.projectDir || '',
    args: cfg.args || [],
  };

  if (withDebug) {
    const r = await api.post<{ id: string; state: string; frames: any[]; variables: any[] }>('/debug/start', {
      lang: cfg.kind,
      program: cfg.program || '',
      cwd: payload.cwd,
      args: payload.args,
      breakpoints: code.breakpoints,
    });
    busy.value = false;
    if ('error' in r) { ElMessage.error(r.error); appendOutput(`[错误] ${r.error}\n`); return; }
    dbg.value = { id: r.data.id, state: r.data.state, frames: r.data.frames || [], variables: r.data.variables || [], scopes: [] };
    runId.value = '';
    void openStream(`/debug/${r.data.id}/stream`, onDebugEvent);
    return;
  }

  const r = await api.post<{ id: string; cmdline: string }>('/debug/run', payload);
  busy.value = false;
  if ('error' in r) { ElMessage.error(r.error); appendOutput(`[错误] ${r.error}\n`); return; }
  runId.value = r.data.id;
  dbg.value = { id: '', state: '', frames: [], variables: [], scopes: [] };
  void openStream(`/debug/run/${r.data.id}/stream`, (msg) => {
    if (msg.type === 'output') appendOutput(msg.text);
    if (msg.type === 'exited') { appendOutput(`\n[退出码 ${msg.code}]\n`); runId.value = ''; }
  });
}

function onDebugEvent(msg: any) {
  if (msg.type === 'output') { appendOutput(msg.text); return; }
  if (msg.type === 'snapshot') {
    dbg.value = {
      id: msg.snapshot.id, state: msg.snapshot.state,
      frames: msg.snapshot.frames || [], variables: msg.snapshot.variables || [], scopes: msg.snapshot.scopes || [],
    };
    return;
  }
  if (msg.type === 'state') { dbg.value.state = msg.state; if (msg.state === 'exited') code.setDebugActive('', 0); return; }
  if (msg.type === 'stopped') {
    dbg.value.state = 'paused';
    if (msg.file) {
      code.setDebugActive(msg.file, msg.line || 0);
      code.revealLine(msg.file, msg.line || 1);
    }
    void refreshDebug();
    return;
  }
  if (msg.type === 'exited') { dbg.value.state = 'exited'; code.setDebugActive('', 0); }
}

async function refreshDebug() {
  if (!dbg.value.id) return;
  const r = await api.get<{ frames: any[]; variables: any[]; scopes: any[]; state: string }>(`/debug/${dbg.value.id}`);
  if ('error' in r) return;
  dbg.value.frames = r.data.frames || [];
  dbg.value.variables = r.data.variables || [];
  dbg.value.scopes = r.data.scopes || [];
  dbg.value.state = r.data.state || dbg.value.state;
}

async function dbgContinue() {
  if (!dbg.value.id) return;
  await api.post(`/debug/${dbg.value.id}/continue`, {});
  code.setDebugActive('', 0);
  dbg.value.state = 'running';
}

async function dbgStep(kind: 'over' | 'into' | 'out') {
  if (!dbg.value.id) return;
  await api.post(`/debug/${dbg.value.id}/step`, { kind });
  code.setDebugActive('', 0);
  dbg.value.state = 'running';
}

async function selectFrame(frameId: number) {
  if (!dbg.value.id) return;
  const r = await api.post<{ variables: any[]; scopes: any[] }>(`/debug/${dbg.value.id}/frame`, { frameId });
  if ('error' in r) return;
  dbg.value.variables = r.data.variables || [];
  dbg.value.scopes = r.data.scopes || [];
}

async function stopAll() {
  if (dbg.value.id) {
    await api.post(`/debug/${dbg.value.id}/stop`, {});
    dbg.value = { id: '', state: '', frames: [], variables: [], scopes: [] };
    code.setDebugActive('', 0);
  }
  if (runId.value) {
    await api.post(`/debug/run/${runId.value}/stop`, {});
    runId.value = '';
  }
  abort?.abort();
  abort = null;
}

// 断点变更实时同步到活跃调试会话
watch(() => code.breakpoints, async (bps) => {
  if (!dbg.value.id) return;
  for (const [file, lines] of Object.entries(bps as Record<string, number[]>)) {
    await api.post(`/debug/${dbg.value.id}/breakpoints`, { file, lines });
  }
}, { deep: true });

function fileName(p: string) { return (p || '').split(/[\\/]/).pop() || p; }

onBeforeUnmount(() => { abort?.abort(); abort = null; });
</script>

<style scoped>
.rdp { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.rdp-head {
  display: flex; align-items: center; gap: 3px; padding: 8px; flex-shrink: 0;
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
}
.rdp-select { flex: 1; min-width: 0; }
.rdp-icon-btn {
  width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 6px; background: transparent;
  color: var(--color-text-secondary, #6b6b66); cursor: pointer; transition: all 0.15s ease; flex-shrink: 0;
}
.rdp-icon-btn:hover:not(:disabled) { background: var(--glass-bg-hover, #f1efe9); color: var(--color-primary, #c2410c); }
.rdp-icon-btn:disabled { opacity: 0.32; cursor: default; }
.rdp-icon-btn.danger:hover:not(:disabled) { color: var(--el-color-danger); }

.rdp-ctrl { display: flex; gap: 6px; padding: 8px; flex-shrink: 0; }
.rdp-run {
  flex: 1; height: 28px; display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  font-size: 12px; font-family: inherit; cursor: pointer;
  border: 1px solid var(--glass-border-strong, #d8d5cc); border-radius: 8px;
  background: color-mix(in srgb, var(--color-success, #2f6b4f) 10%, transparent);
  color: var(--color-success, #2f6b4f); transition: all 0.15s ease;
}
.rdp-run:hover:not(:disabled) { border-color: var(--color-success, #2f6b4f); filter: brightness(0.96); }
.rdp-run.debug {
  background: color-mix(in srgb, var(--color-primary, #c2410c) 10%, transparent);
  color: var(--color-primary, #c2410c);
}
.rdp-run.debug:hover:not(:disabled) { border-color: var(--color-primary, #c2410c); }
.rdp-run:disabled { opacity: 0.4; cursor: default; }
.rdp-stop {
  width: 66px; height: 28px; display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  font-size: 12px; font-family: inherit; cursor: pointer;
  border: 1px solid var(--glass-border-strong, #d8d5cc); border-radius: 8px;
  background: transparent; color: var(--el-color-danger); transition: all 0.15s ease; flex-shrink: 0;
}
.rdp-stop:hover:not(:disabled) { border-color: var(--el-color-danger); }
.rdp-stop:disabled { opacity: 0.35; cursor: default; }

.rdp-note {
  margin: 0 8px 6px; padding: 6px 8px; border-radius: 7px; font-size: 11px; line-height: 1.5;
  background: var(--glass-bg-hover, #f1efe9); color: var(--color-text-secondary, #6b6b66);
}

.rdp-form { display: flex; flex-direction: column; gap: 6px; padding: 8px; flex-shrink: 0; }
.rdp-form-full { width: 100%; }
.rdp-form-actions { display: flex; gap: 6px; }
.rdp-btn {
  flex: 1; height: 26px; font-size: 12px; font-family: inherit; cursor: pointer;
  border: 1px solid var(--glass-border-strong, #d8d5cc); border-radius: 7px;
  background: transparent; color: var(--color-text, #1a1a1a);
}
.rdp-btn.primary {
  background: var(--color-primary, #c2410c); border-color: var(--color-primary, #c2410c); color: #fff;
}

.rdp-dbg { flex-shrink: 0; border-top: 1px solid var(--glass-border, #e7e4dc); padding: 6px 8px; max-height: 46%; overflow: auto; }
.rdp-dbg-bar { display: flex; align-items: center; gap: 2px; }
.rdp-dbg-state { margin-left: auto; font-size: 10.5px; padding: 1px 7px; border-radius: 8px; background: var(--glass-bg-hover, #f1efe9); }
.rdp-dbg-state.paused { background: color-mix(in srgb, var(--color-warning, #b45309) 18%, transparent); color: var(--color-warning, #b45309); }
.rdp-dbg-state.running { background: color-mix(in srgb, var(--color-success, #2f6b4f) 16%, transparent); color: var(--color-success, #2f6b4f); }

.rdp-sec { margin-top: 8px; }
.rdp-sec-title {
  display: flex; align-items: center;
  font-size: 11px; font-weight: 600; color: var(--color-text-secondary, #6b6b66);
  padding: 2px 0 4px;
}
.rdp-sec-clear {
  margin-left: auto; border: none; background: transparent; cursor: pointer;
  font-size: 10.5px; font-family: inherit; color: var(--color-text-tertiary, #9c9b94);
}
.rdp-sec-clear:hover { color: var(--el-color-danger); }

.rdp-frame {
  display: flex; align-items: baseline; gap: 6px; padding: 2px 6px; border-radius: 5px;
  font-size: 11.5px; cursor: pointer; color: var(--color-text-secondary, #6b6b66);
}
.rdp-frame:hover { background: var(--glass-bg-hover, #f1efe9); }
.rdp-frame.active { color: var(--color-primary, #c2410c); background: color-mix(in srgb, var(--color-primary, #c2410c) 8%, transparent); }
.rdp-frame-name { font-weight: 600; flex-shrink: 0; max-width: 46%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rdp-frame-loc { flex: 1; min-width: 0; font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.rdp-var {
  display: flex; gap: 6px; padding: 1px 6px; font-size: 11px;
  font-family: var(--font-mono, monospace);
}
.rdp-var-name { color: var(--color-text, #1a1a1a); flex-shrink: 0; max-width: 42%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rdp-var-value { color: var(--color-text-tertiary, #9c9b94); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.rdp-bp {
  display: flex; align-items: center; gap: 6px; padding: 2px 6px; border-radius: 5px; font-size: 11px;
}
.rdp-bp:hover { background: var(--glass-bg-hover, #f1efe9); }
.rdp-bp-name { font-weight: 600; flex-shrink: 0; max-width: 48%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rdp-bp-lines { flex: 1; min-width: 0; color: var(--color-text-tertiary, #9c9b94); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rdp-bp-del {
  width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 4px; background: transparent; color: var(--color-text-tertiary, #9c9b94); cursor: pointer;
}
.rdp-bp-del:hover { color: var(--el-color-danger); background: var(--glass-bg-hover, #f1efe9); }

.rdp-out-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 8px; border-top: 1px solid var(--glass-border, #e7e4dc); }
.rdp-out-title { padding-top: 0; }
.rdp-out {
  flex: 1; min-height: 0; overflow: auto; margin: 0; padding: 6px;
  font-family: var(--font-mono, "Cascadia Code", Consolas, monospace); font-size: 11px; line-height: 1.55;
  white-space: pre-wrap; word-break: break-all;
  background: var(--el-fill-color-lighter, #faf9f6); border-radius: 7px;
  color: var(--color-text-secondary, #6b6b66);
}
</style>
