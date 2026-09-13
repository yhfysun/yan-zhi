<template>
  <div class="lcp">
    <!-- 子 tab 栏（浏览器风格）：tab 区横向滚动，操作按钮固定右侧不挤压 -->
    <div class="lcp-tabs">
      <div class="lcp-tabs-scroll">
        <div
          v-for="s in sessions"
          :key="s.id"
          class="lcp-tab"
          :class="{ active: s.id === activeId }"
          :title="s.open ? `${s.label} · 运行中` : `${s.label} · ${s.error ? '启动失败' : '已结束'}`"
          @click="activeId = s.id"
        >
          <span class="lcp-dot" :class="{ on: s.open }"></span>
          <span class="lcp-tab-label">{{ s.label }}</span>
          <span class="lcp-tab-close" title="关闭" @click.stop="closeSession(s)">
            <el-icon :size="10"><Close /></el-icon>
          </span>
        </div>

        <!-- + 新增终端：Windows 下可选 Shell，其他平台固定 Bash -->
        <el-dropdown v-if="isWin" trigger="click" @command="(cmd: string) => addSession(cmd as ShellKind)">
          <button class="lcp-add" title="新建终端">
            <el-icon :size="13"><Plus /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="powershell"><el-icon><Cpu /></el-icon>PowerShell</el-dropdown-item>
              <el-dropdown-item command="cmd"><el-icon><Promotion /></el-icon>CMD</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <button v-else class="lcp-add" title="新建终端" @click="addSession('bash')">
          <el-icon :size="13"><Plus /></el-icon>
        </button>
      </div>

      <!-- 当前会话操作（固定右侧） -->
      <div v-if="activeSession" class="lcp-tab-actions">
        <button v-if="activeSession.open" class="lcp-btn" title="清屏" @click="clearSession(activeSession)">
          <el-icon :size="12"><Brush /></el-icon>
        </button>
        <button class="lcp-btn" :title="activeSession.open ? '重启会话' : '重新连接'" @click="restartSession(activeSession)">
          <el-icon :size="12"><RefreshRight /></el-icon>
        </button>
        <button v-if="activeSession.open" class="lcp-btn lcp-btn-danger" title="断开" @click="closeSession(activeSession)">
          <el-icon :size="12"><SwitchButton /></el-icon>
        </button>
      </div>
    </div>

    <!-- 终端帧区：全部会话常驻 DOM（v-show 切换，保留各自输出与滚动位置） -->
    <div
      v-for="s in sessions"
      :key="s.id"
      v-show="s.id === activeId"
      class="lcp-frame"
      :ref="(el) => setFrameEl(s.id, el)"
    >
      <div v-if="s.open" class="lcp-term-frame">
        <div class="lcp-term"></div>
      </div>
      <div v-else class="lcp-empty">
        <div class="lcp-empty-icon"><el-icon :size="22"><Monitor /></el-icon></div>
        <p class="lcp-empty-title">{{ s.error ? '启动失败' : '会话已结束' }}</p>
        <p v-if="s.error" class="lcp-empty-sub lcp-error">{{ s.error }}</p>
        <button class="lcp-retry" @click="restartSession(s)">
          <el-icon :size="12"><RefreshRight /></el-icon>重新连接
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { Close, Plus, Cpu, Promotion, Brush, RefreshRight, SwitchButton, Monitor } from '@element-plus/icons-vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api, API_BASE } from '../../api/client';

type ShellKind = 'powershell' | 'cmd' | 'bash';
const isWin = navigator.platform.toLowerCase().includes('win');

interface ConsoleSession {
  id: number;
  label: string;
  shell: ShellKind;
  /** 后端会话 id；'' 表示尚未连接 */
  sessionId: string;
  open: boolean;
  error: string;
  term: Terminal | null;
  fitAddon: FitAddon | null;
  streamController: AbortController | null;
  resizeObserver: ResizeObserver | null;
  exited: boolean;
}

let seq = 0;
const sessions = ref<ConsoleSession[]>([]);
const activeId = ref(0);
const activeSession = computed(() => sessions.value.find((s) => s.id === activeId.value) || null);

const frameEls = new Map<number, HTMLElement>();
function setFrameEl(id: number, el: unknown) {
  if (el) frameEls.set(id, el as HTMLElement);
  else frameEls.delete(id);
}

function baseLabel(shell: ShellKind): string {
  if (shell === 'cmd') return 'CMD';
  if (shell === 'bash') return 'Bash';
  return 'PowerShell';
}
function nextLabel(shell: ShellKind): string {
  const base = baseLabel(shell);
  const n = sessions.value.filter((s) => s.label === base || s.label.startsWith(base + ' ')).length;
  return n === 0 ? base : `${base} ${n + 1}`;
}

/** SSE 帧 base64 → 字节流解码。Windows 控制台默认 GBK（chcp 936），优先用 gbk 解码，失败回退 utf-8 */
function makeOutputDecoder(): TextDecoder {
  try {
    const probe = new TextDecoder('gbk');
    probe.decode(new Uint8Array([0]));
    return probe;
  } catch {
    return new TextDecoder('utf-8');
  }
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

/** 新增终端会话（自动激活并连接） */
function addSession(shell: ShellKind) {
  const s: ConsoleSession = {
    id: ++seq,
    label: nextLabel(shell),
    shell,
    sessionId: '',
    open: false,
    error: '',
    term: null,
    fitAddon: null,
    streamController: null,
    resizeObserver: null,
    exited: false,
  };
  sessions.value.push(s);
  activeId.value = s.id;
  void openSession(s);
}

async function openSession(s: ConsoleSession) {
  if (s.open || s.term) return;
  s.error = '';
  const r = await api.post<{ sessionId: string; cwd: string }>('/local-console/open', {
    shell: s.shell, cols: 120, rows: 30,
  });
  if ('error' in r) {
    s.error = r.error;
    return;
  }
  s.sessionId = r.data.sessionId;
  s.open = true;
  s.exited = false;
  await nextTick();
  const frame = frameEls.get(s.id);
  if (!frame) return;
  const host = frame.querySelector('.lcp-term') as HTMLElement | null;
  if (!host) return;

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 12.5,
    lineHeight: 1.2,
    fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
    theme: {
      background: '#0d1117',
      foreground: '#d4d4d8',
      cursor: '#e2e8f0',
      selectionBackground: 'rgba(99, 140, 255, 0.30)',
      black: '#1b1f27', red: '#f87171', green: '#4ade80', yellow: '#facc15',
      blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#e4e4e7',
      brightBlack: '#6b7280', brightRed: '#fca5a5', brightGreen: '#86efac', brightYellow: '#fde047',
      brightBlue: '#93c5fd', brightMagenta: '#d8b4fe', brightCyan: '#67e8f9', brightWhite: '#fafafa',
    },
    scrollback: 3000,
  });
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(host);
  try { fitAddon.fit(); } catch { /* 容器未就绪忽略 */ }
  term.onData((data) => {
    void api.post(`/local-console/${s.sessionId}/input`, { data });
  });
  s.term = term;
  s.fitAddon = fitAddon;

  const ro = new ResizeObserver(() => {
    try { s.fitAddon?.fit(); } catch { /* 尺寸异常忽略 */ }
  });
  ro.observe(frame);
  s.resizeObserver = ro;

  // SSE 输出流
  s.streamController = new AbortController();
  const token = localStorage.getItem('auth_token') || '';
  void (async () => {
    const decoder = makeOutputDecoder();
    try {
      const resp = await fetch(`${API_BASE}/local-console/${s.sessionId}/stream`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: s.streamController!.signal,
      });
      const reader = resp.body?.getReader();
      if (!reader) return;
      const tb = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += tb.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          const payload = line.slice(5);
          if (payload === ':connected') continue;
          try { s.term?.write(decoder.decode(b64ToBytes(payload), { stream: true })); } catch { /* 非 base64 帧忽略 */ }
        }
      }
      // SSE 正常结束 = shell 进程退出（保留终端回显，状态灯熄灭）
      if (s.term) {
        s.term.write('\r\n\x1b[90m── 会话已结束 ──\x1b[0m\r\n');
      }
      s.open = false;
      s.exited = true;
    } catch { /* 会话关闭/网络中断，静默 */ }
  })();

  term.focus();
}

/** 释放单个会话的前端资源（不改动 sessions 数组） */
function teardownSession(s: ConsoleSession) {
  if (s.sessionId) void api.post(`/local-console/${s.sessionId}/close`, {});
  s.streamController?.abort();
  s.streamController = null;
  s.resizeObserver?.disconnect();
  s.resizeObserver = null;
  s.term?.dispose();
  s.term = null; s.fitAddon = null;
  s.sessionId = '';
  s.open = false;
}

/** 重启 / 重连会话（保留原 tab） */
async function restartSession(s: ConsoleSession) {
  teardownSession(s);
  s.error = '';
  s.exited = false;
  await nextTick();
  await openSession(s);
}

/** 关闭会话：释放资源并移除 tab，激活左邻 → 右邻 */
function closeSession(s: ConsoleSession) {
  teardownSession(s);
  const idx = sessions.value.findIndex((x) => x.id === s.id);
  if (idx >= 0) sessions.value.splice(idx, 1);
  if (activeId.value === s.id) {
    const next = sessions.value[idx - 1] || sessions.value[idx] || null;
    activeId.value = next ? next.id : 0;
  }
}

function clearSession(s: ConsoleSession) {
  s.term?.clear();
  s.term?.focus();
}

// 首个终端自动创建（浏览器打开即有默认标签页的体验）
onMounted(() => { if (!sessions.value.length) addSession(isWin ? 'powershell' : 'bash'); });
onUnmounted(() => {
  for (const s of [...sessions.value]) teardownSession(s);
  sessions.value = [];
});
</script>

<style scoped>
.lcp {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px 12px;
  overflow: hidden;
}

/* ===== 子 tab 栏（浏览器风格）：tab 区横向滚动，按钮固定右侧 ===== */
.lcp-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-height: 28px;
}
.lcp-tabs-scroll {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px;
  margin: -2px;
  scrollbar-width: thin;
  scrollbar-color: var(--glass-border) transparent;
}
.lcp-tabs-scroll::-webkit-scrollbar { height: 4px; }
.lcp-tabs-scroll::-webkit-scrollbar-thumb { background: var(--glass-border); border-radius: 2px; }
.lcp-tabs-scroll::-webkit-scrollbar-track { background: transparent; }
.lcp-tabs-scroll > * { flex-shrink: 0; }
.lcp-tab-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }

.lcp-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px;
  max-width: 150px;
  border-radius: 6px;
  font-size: 11px;
  color: var(--color-text-secondary);
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
  flex-shrink: 0;
  white-space: nowrap;
}
.lcp-tab:hover { color: var(--color-text); background: var(--glass-bg-hover); }
.lcp-tab.active {
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-text) 8%, transparent);
  box-shadow: inset 0 -2px 0 var(--color-primary);
  font-weight: 500;
}
.lcp-tab-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lcp-tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px; height: 14px;
  border-radius: 4px;
  color: var(--color-text-tertiary);
  opacity: 0;
  transition: all 0.12s ease;
  flex-shrink: 0;
}
.lcp-tab:hover .lcp-tab-close { opacity: 1; }
.lcp-tab-close:hover { color: var(--el-color-danger); background: var(--glass-bg-hover); }

.lcp-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--color-text-tertiary);
  flex-shrink: 0;
  transition: all 0.25s ease;
}
.lcp-dot.on {
  background: var(--color-success, #34d399);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-success, #34d399) 20%, transparent);
}

/* 「+」新增按钮 */
.lcp-add {
  width: 22px; height: 22px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.lcp-add:hover { color: var(--color-primary); background: var(--glass-bg-hover); }

/* 会话操作小图标按钮 */
.lcp-btn {
  width: 22px; height: 22px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.lcp-btn:hover { color: var(--color-text); background: var(--glass-bg-hover); border-color: var(--glass-border); }
.lcp-btn-danger:hover { color: var(--el-color-danger); border-color: var(--el-color-danger); }
.lcp-btn:active { transform: scale(0.92); }

/* ===== 终端帧 ===== */
.lcp-frame {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.lcp-term-frame {
  flex: 1;
  min-height: 0;
  border-radius: 10px;
  padding: 1px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.02) 40%);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}
.lcp-term {
  height: 100%;
  border-radius: 9px;
  overflow: hidden;
  /* 终端容器底：跟随皮肤凹陷层（未开皮肤时保持原深色）。
     注意上面 xterm 的 theme.background 是**终端模拟器调色板**，故意不接皮肤——
     终端配色需要保证 ANSI 16 色对比，换肤会破坏语义。 */
  background: var(--skin-surface-sunken, #0d1117);
  padding: 8px;
}

/* ===== 未连接/失败态 ===== */
.lcp-empty {
  flex: 1;
  min-height: 0;
  border-radius: 12px;
  border: 1px dashed var(--glass-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 18px;
  text-align: center;
  background:
    radial-gradient(120px 80px at 50% 32%, color-mix(in srgb, var(--color-primary) 7%, transparent), transparent),
    transparent;
}
.lcp-empty-icon {
  width: 44px; height: 44px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary) 18%, transparent);
  margin-bottom: 4px;
}
.lcp-empty-title { font-size: 12.5px; font-weight: 600; color: var(--color-text); margin: 0; }
.lcp-empty-sub { font-size: 11px; line-height: 1.5; color: var(--color-text-tertiary); margin: 0; }
.lcp-error { color: var(--el-color-danger); word-break: break-all; }
.lcp-retry {
  display: inline-flex; align-items: center; gap: 4px;
  height: 24px; padding: 0 10px;
  margin-top: 2px;
  font-size: 11px; font-weight: 500;
  border: 1px solid var(--glass-border); border-radius: 7px;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  transition: all 0.15s ease;
}
.lcp-retry:hover { border-color: var(--color-primary); background: var(--glass-bg-hover); }
</style>
