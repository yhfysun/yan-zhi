<template>
  <div class="sftp-panel" :class="{ 'is-compact': compact }">
    <!-- 顶栏：连接信息 + 全局操作 -->
    <div class="sftp-head">
      <span class="sftp-host">
        <el-icon class="sftp-host-icon"><Connection /></el-icon>
        {{ conn.username }}@{{ conn.host }}
      </span>
      <div class="sftp-head-actions">
        <el-button size="small" :icon="FolderAdd" @click="promptMkdir">新建目录</el-button>
        <el-button size="small" :icon="Refresh" title="刷新列表" @click="loadRemote" />
      </div>
    </div>

    <!-- 任务列表（2026-10-16）：上传 / 下载 / 删除统一在这里看进度。
         删除任务可展开看**实时删除的文件** —— 旧版只有一条聚合进度条，删目录时既不知道
         删到哪儿了，也没有任何「删了哪些」的痕迹；上传文件夹同样看不到逐个文件的进度。 -->
    <div v-if="tasks.length" class="sftp-tasks">
      <div class="sftp-tasks-head">
        <span class="sftp-tasks-title">
          <el-icon class="sftp-tasks-icon"><Tickets /></el-icon>
          任务{{ runningCount ? `（进行中 ${runningCount}）` : `（${tasks.length}）` }}
        </span>
        <div class="sftp-tasks-actions">
          <el-button link size="small" @click="tasksOpen = !tasksOpen">{{ tasksOpen ? '收起' : '展开' }}</el-button>
          <el-button link size="small" :disabled="!finishedCount" @click="clearFinishedTasks">清除已完成</el-button>
        </div>
      </div>

      <div v-if="tasksOpen" class="sftp-tasks-body">
        <div
          v-for="t in orderedTasks"
          :key="t.id"
          class="sftp-task"
          :class="{ 'is-failed': t.state === 'failed', 'is-done': t.state === 'done' }"
        >
          <el-icon class="sftp-task-icon">
            <Upload v-if="t.kind === 'upload'" /><Download v-else-if="t.kind === 'download'" /><Delete v-else />
          </el-icon>
          <div class="sftp-task-main">
            <div class="sftp-task-line">
              <span class="sftp-task-label" :title="t.label">{{ t.label }}</span>
              <span class="sftp-task-meta">{{ taskMeta(t) }}</span>
            </div>
            <el-progress
              v-if="t.kind !== 'delete'"
              :percentage="percentOf(t)"
              :status="t.state === 'failed' ? 'exception' : (t.state === 'done' ? 'success' : '')"
              :stroke-width="4"
              :show-text="false"
            />
            <!-- 删除任务：实时删除明细（默认收起，点开跟最新） -->
            <div v-if="t.kind === 'delete' && t.deleted.length" class="sftp-task-del">
              <span class="sftp-task-del-toggle" @click="t.expanded = !t.expanded">
                {{ t.expanded ? '收起明细' : '查看删掉的项' }}（{{ t.deletedCount }}）
              </span>
              <div v-if="t.expanded" class="sftp-task-del-list">
                <div v-for="(p, i) in delRows(t)" :key="t.id + i" class="sftp-task-del-item" :title="p">{{ p }}</div>
              </div>
            </div>
            <div v-if="t.error" class="sftp-task-err" :title="t.error">{{ t.error }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 双栏：远程 │ 本地（任务 7.5 / 12.3）
         跨栏拖拽：本地→远程 = 上传，远程→本地 = 下载；同栏拖动不响应。
         悬停到子目录行则传到该目录，否则传到该栏当前目录。 -->
    <div class="sftp-panes" :class="{ 'is-stacked': compact }">
      <!-- ===== 远程栏 ===== -->
      <section class="sftp-pane">
        <div class="sftp-pane-head">
          <span class="sftp-pane-tag">远程</span>
          <span class="sftp-pane-host" :title="remotePath">{{ conn.username }}@{{ conn.host }}</span>
        </div>

        <div class="sftp-pathbar">
          <el-button link size="small" :icon="ArrowUp" :disabled="remotePath === '/'" title="上一级" @click="goRemoteUp" />
          <el-button link size="small" :icon="HomeFilled" title="回到默认目录" @click="goRemoteHome" />
          <template v-if="editingPath">
            <el-input
              ref="remotePathInput"
              v-model="pathDraft"
              size="small"
              class="sftp-path-input"
              placeholder="/path"
              @keyup.enter="commitRemotePath"
              @keyup.esc="editingPath = false"
              @blur="editingPath = false"
            />
          </template>
          <nav v-else class="sftp-crumbs" title="点击可编辑路径" @click="startEditPath">
            <span v-if="!remoteCrumbs.length" class="sftp-crumb">/</span>
            <template v-for="(c, i) in remoteCrumbs" :key="c.path">
              <span v-if="i" class="sftp-crumb-sep">/</span>
              <span class="sftp-crumb" :title="c.path" @click.stop="navigateRemote(c.path)">{{ c.label }}</span>
            </template>
          </nav>
          <el-button link size="small" :icon="EditPen" title="编辑路径" @click="startEditPath" />
        </div>

        <div
          class="sftp-list"
          :class="{ 'is-over': dragOver, 'is-busy': remoteLoading, 'is-drop': dropPane === 'remote' }"
          @dragover="onRemoteDragOver"
          @dragleave="onPaneDragLeave('remote', $event)"
          @drop="onRemoteDrop"
          @contextmenu.prevent="onListCtx"
        >
          <div class="sftp-cols-head">
            <span class="sftp-c-name">名称</span>
            <span class="sftp-c-size">大小</span>
            <span v-if="!compact" class="sftp-c-time">修改时间</span>
          </div>
          <div v-if="remoteLoading" class="sftp-state">加载中…</div>
          <div
            v-for="(e, i) in remoteEntries"
            :key="e.name"
            class="sftp-row"
            :class="{ selected: remoteSelected.has(e.name), 'is-drop': dropPane === 'remote' && dropName === e.name, 'is-drag-src': dragPane === 'remote' && dragNames.includes(e.name) }"
            :title="e.name"
            draggable="true"
            @dragstart="onRemoteRowDragStart(e)"
            @dragend="onDragEnd"
            @dragover.stop="onRemoteRowDragOver(e)"
            @drop.stop="onRemoteDropOnDir(e)"
            @click="onRemoteClick($event, e, i)"
            @dblclick="onRemoteDblClick(e)"
            @contextmenu.prevent.stop="onRemoteCtx(e, $event)"
          >
            <el-icon class="sftp-row-icon" :class="e.type === 'dir' ? 'is-dir' : 'is-file'">
              <Folder v-if="e.type === 'dir'" /><Link v-else-if="e.type === 'link'" /><Document v-else />
            </el-icon>
            <span class="sftp-name">{{ e.name }}</span>
            <span class="sftp-size">{{ e.type === 'dir' ? '—' : fmtSize(e.size) }}</span>
            <span v-if="!compact" class="sftp-time">{{ fmtTime(e.mtime) }}</span>
            <span class="sftp-row-actions" @click.stop>
              <el-button
                v-if="e.type !== 'dir'"
                link
                size="small"
                :icon="Download"
                title="下载到本地当前目录"
                @click="downloadNames([e.name], localPath)"
              />
            </span>
          </div>
          <div v-if="!remoteLoading && !remoteEntries.length" class="sftp-state">
            <el-icon class="sftp-state-icon"><FolderOpened /></el-icon>
            <span>此目录为空，可从本地栏拖入文件或右键上传</span>
          </div>

          <div v-if="dragOver || dropPane === 'remote'" class="sftp-dropzone">
            <el-icon><Upload /></el-icon>
            <span>松开上传到 {{ dropName && dropPane === 'remote' ? joinRemote(remotePath, dropName) : remotePath }}</span>
          </div>
        </div>
      </section>

      <!-- ===== 本地栏（桌面端可用；下载目标 = 本栏当前目录） ===== -->
      <section class="sftp-pane">
        <div class="sftp-pane-head">
          <span class="sftp-pane-tag">本地</span>
          <span class="sftp-pane-host" :title="localPath">{{ localPath || '未选择目录' }}</span>
          <el-button link size="small" :icon="FolderAdd" title="选择本地目录" @click="pickLocalDir" />
        </div>

        <div class="sftp-pathbar">
          <el-button link size="small" :icon="ArrowUp" :disabled="!localParent" title="上一级" @click="goLocalUp" />
          <el-button link size="small" :icon="HomeFilled" title="回到用户目录" @click="goLocalHome" />
          <span class="sftp-local-path" :title="localPath">{{ localPath || '—' }}</span>
          <el-button link size="small" :icon="Refresh" title="刷新" @click="loadLocal" />
        </div>

        <div
          class="sftp-list"
          :class="{ 'is-busy': localLoading, 'is-drop': dropPane === 'local' }"
          @dragover="onLocalDragOver"
          @dragleave="onPaneDragLeave('local', $event)"
          @drop="onLocalDrop"
          @contextmenu.prevent="onLocalListCtx"
        >
          <div class="sftp-cols-head">
            <span class="sftp-c-name">名称</span>
            <span class="sftp-c-size">大小</span>
            <span v-if="!compact" class="sftp-c-time">修改时间</span>
          </div>
          <div v-if="!isElectron" class="sftp-state">本地目录浏览仅桌面端可用（网页端可用行内「下载」按钮）</div>
          <div v-else-if="localLoading" class="sftp-state">加载中…</div>
          <div
            v-for="(e, i) in localEntries"
            :key="e.name"
            class="sftp-row"
            :class="{ selected: localSelected.has(e.name), 'is-drop': dropPane === 'local' && dropName === e.name, 'is-drag-src': dragPane === 'local' && dragNames.includes(e.name) }"
            :title="e.path"
            draggable="true"
            @dragstart="onLocalRowDragStart(e)"
            @dragend="onDragEnd"
            @dragover.stop="onLocalRowDragOver(e)"
            @drop.stop="onLocalDropOnDir(e)"
            @click="onLocalClick($event, e, i)"
            @dblclick="onLocalDblClick(e)"
            @contextmenu.prevent.stop="onLocalCtx(e, $event)"
          >
            <el-icon class="sftp-row-icon" :class="e.isDir ? 'is-dir' : 'is-file'">
              <Folder v-if="e.isDir" /><Document v-else />
            </el-icon>
            <span class="sftp-name">{{ e.name }}</span>
            <span class="sftp-size">{{ e.isDir ? '—' : fmtSize(e.size) }}</span>
            <span v-if="!compact" class="sftp-time">{{ fmtTime(e.mtime) }}</span>
            <span class="sftp-row-actions" @click.stop>
              <el-button
                v-if="!e.isDir"
                link
                size="small"
                :icon="Upload"
                title="上传到远程当前目录"
                @click="uploadPaths([e.path])"
              />
            </span>
          </div>
          <!-- 空目录态：不能接 v-else-if（前一个兄弟是 v-for，链会断），用完整条件的 v-if -->
          <div v-if="isElectron && !localLoading && !localEntries.length" class="sftp-state">
            <el-icon class="sftp-state-icon"><FolderOpened /></el-icon>
            <span>空目录，可从远程栏拖文件到这里下载</span>
          </div>

          <div v-if="dropPane === 'local'" class="sftp-dropzone">
            <el-icon><Download /></el-icon>
            <span>松开下载到 {{ dropName && dropPane === 'local' ? joinLocal(localPath, dropName) : localPath }}</span>
          </div>
        </div>
      </section>
    </div>

    <!-- 非桌面端降级用的原生 input -->
    <input ref="fileInput" type="file" multiple style="display: none" @change="onFileInput" />
    <input ref="folderInput" type="file" webkitdirectory multiple style="display: none" @change="onFolderInput" />

    <!-- 右键菜单：轻量自绘，避免 el-dropdown 在隐藏容器中的注入/定位问题 -->
    <Teleport to="body">
<div
      v-if="ctx.visible"
      ref="ctxMenuEl"
      class="ctx-menu"
      :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
      @click.stop
      @contextmenu.prevent
    >
      <!-- 远程栏 -->
      <template v-if="ctx.pane === 'remote'">
        <template v-if="!ctx.name">
          <!-- 空白处右键：上传到当前目录 -->
          <div class="sftp-ctxmenu-item" @click="pickUploadFiles(); closeCtx()">上传文件</div>
          <div class="sftp-ctxmenu-item" @click="pickUploadFolder(); closeCtx()">上传文件夹</div>
          <div class="sftp-ctxmenu-item" @click="promptMkdir(); closeCtx()">新建目录</div>
        </template>
        <template v-else>
          <div v-if="ctx.isDir" class="sftp-ctxmenu-item" @click="openCtxDir(); closeCtx()">打开</div>
          <!-- 「下载」改叫「复制到本地」：目录也支持（递归下载），文案与本地栏对称 -->
          <div class="sftp-ctxmenu-item" @click="copyCtxToOther(); closeCtx()">复制到本地</div>
          <div class="sftp-ctxmenu-item" @click="promptRename(); closeCtx()">重命名</div>
          <div v-if="!ctx.isDir" class="sftp-ctxmenu-item" @click="backupSelected(); closeCtx()">备份</div>
          <div class="sftp-ctxmenu-item is-danger" @click="deleteSelected(); closeCtx()">删除</div>
        </template>
      </template>

      <!-- 本地栏 -->
      <template v-else>
        <template v-if="!ctx.name">
          <div class="sftp-ctxmenu-item" @click="promptMkdir(); closeCtx()">新建目录</div>
        </template>
        <template v-else>
          <div v-if="ctx.isDir" class="sftp-ctxmenu-item" @click="openCtxDir(); closeCtx()">打开</div>
          <div class="sftp-ctxmenu-item" @click="copyCtxToOther(); closeCtx()">复制到远程</div>
          <div class="sftp-ctxmenu-item" @click="promptRename(); closeCtx()">重命名</div>
          <div class="sftp-ctxmenu-item is-danger" @click="deleteSelected(); closeCtx()">删除</div>
        </template>
      </template>
    </div>
</Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { placeMenuAfterRender } from '../../composables/useMenuPlacement';
import { consumeSseStream } from '../../utils/sse';
import {
  ArrowUp, Connection, Delete, Document, Download, EditPen,
  Folder, FolderAdd, FolderOpened, HomeFilled, Link, Refresh, Tickets, Upload,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, API_BASE } from '../../api/client';

interface Props {
  connectionId: string;
  conn: {
    id: string;
    name: string;
    host: string;
    username: string;
    tag?: string;
    sftpPath?: string;
  };
  /** 紧凑模式：并排嵌在终端右侧时收窄列（隐藏修改时间列） */
  compact?: boolean;
}
const props = defineProps<Props>();

interface RemoteEntry {
  name: string;
  type: 'file' | 'dir' | 'link';
  size: number;
  mtime: number;
  mode: number;
}
/** 本地栏条目（Electron fs:listDetailed 返回结构） */
interface LocalEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mtime: number;
}

const remotePath = ref('/');
const remoteRoot = ref('/');
const remoteEntries = ref<RemoteEntry[]>([]);
const remoteSelected = ref(new Set<string>());
const remoteLoading = ref(false);

/** 本地栏当前目录（下载目标；桌面端可用） */
const localPath = ref('');
const localEntries = ref<LocalEntry[]>([]);
const localSelected = ref(new Set<string>());
const localLoading = ref(false);
let localAnchor = -1;

const editingPath = ref(false);
const pathDraft = ref('');
const remotePathInput = ref<{ focus: () => void } | null>(null);

const fileInput = ref<HTMLInputElement | null>(null);
const folderInput = ref<HTMLInputElement | null>(null);

/**
 * 任务列表（2026-10-16）。
 *
 * 为什么把旧的那条 `transfer` 聚合进度条换成列表：用户要的是「上传文件和目录要有任务列表
 * 可以看到进度」，以及「删目录时要能看到实时删掉的文件」—— 一条只有一个百分比的进度条
 * 两样都做不到（同时进行两件事时还会互相覆盖 label）。
 *
 * 一条任务 = 后端的一个 job（见 ops-shell 的 SftpJob）；进度由 SSE 增量刷新。
 */
interface SftpTask {
  /** 后端 jobId，同时用作列表 key */
  id: string;
  kind: 'upload' | 'download' | 'delete';
  label: string;
  state: 'running' | 'done' | 'failed';
  transferred: number;
  total: number;
  doneCount: number;
  totalCount: number;
  currentFile: string;
  /** 删除任务：累计已删条目数（服务端的计数，不随前端保留上限缩水） */
  deletedCount: number;
  /** 删除任务：前端累积的已删路径（最近 DELETED_KEEP 条；服务端每帧只推最近 50 条） */
  deleted: string[];
  /** 删除明细是否展开 */
  expanded: boolean;
  error?: string;
}

/** 前端保留的已删路径上限：与后端 MAX_JOB_DELETED_KEEP 同量级，避免长任务把 DOM 撑爆。 */
const DELETED_KEEP = 200;
/** 明细里一次性渲染的行数上限（更早的在 title 里也能看到计数，不必都塞进 DOM）。 */
const DELETED_ROWS = 60;

const tasks = ref<SftpTask[]>([]);
const tasksOpen = ref(true);

const orderedTasks = computed(() => [...tasks.value].sort((a, b) => {
  // 进行中的排前面（用户最关心），其余保持插入顺序（新任务在后）
  const rank = (t: SftpTask) => (t.state === 'running' ? 0 : 1);
  return rank(a) - rank(b);
}));
const runningCount = computed(() => tasks.value.filter((t) => t.state === 'running').length);
const finishedCount = computed(() => tasks.value.filter((t) => t.state !== 'running').length);

/** 明细行：最近删的排最前（跟着看最新），只渲染末尾 DELETED_ROWS 条 */
function delRows(t: SftpTask): string[] {
  return t.deleted.slice(-DELETED_ROWS).reverse();
}

/** 行右侧那行小字：删除看条数，上传/下载看「第几个 · 合计」+ 字节 */
function taskMeta(t: SftpTask): string {
  if (t.kind === 'delete') {
    if (t.state === 'done') return `已删除 ${t.deletedCount} 项`;
    if (t.state === 'failed') return `中断于 ${t.deletedCount} 项`;
    return `已删除 ${t.deletedCount} 项…`;
  }
  const idx = t.totalCount > 1 ? `${t.doneCount}/${t.totalCount} · ` : '';
  if (t.state === 'done') return `${idx}完成`;
  if (t.state === 'failed') return `${idx}失败`;
  return `${idx}${fmtSize(t.transferred)}${t.total > 1 ? ` / ${fmtSize(t.total)}` : ''}`;
}

/** 上传/下载的百分比（删除任务不画进度条：遍历前不知道树里有多少项，画了只能是假的） */
function percentOf(t: SftpTask): number {
  if (t.state === 'done') return 100;
  if (!t.total) return t.state === 'running' ? 10 : 0;
  return Math.min(100, Math.round((t.transferred / t.total) * 100));
}

function clearFinishedTasks() {
  tasks.value = tasks.value.filter((t) => t.state === 'running');
}

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
const electron = (window as any).electronAPI;

/** 是否有系统文件悬停在列表上 */
const dragOver = ref(false);
/** shift 连选的锚点下标 */
let remoteAnchor = -1;

// ===== 格式化 =====
function fmtSize(n: number): string {
  if (!n) return '0 B';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}
function fmtTime(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function basename(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || p;
}
function isProdTag(tag: string): boolean {
  const t = (tag || '').toLowerCase();
  return t.includes('生产') || t.includes('prod');
}

// ===== 面包屑 =====
function crumbsOf(p: string): Array<{ label: string; path: string }> {
  const norm = (p || '/').replace(/\\/g, '/').replace(/\/+$/, '');
  const segs = norm.split('/').filter(Boolean);
  const out: Array<{ label: string; path: string }> = [];
  let acc = '';
  segs.forEach((s) => {
    acc = acc ? `${acc}/${s}` : s;
    out.push({ label: s, path: acc.startsWith('/') ? acc : '/' + acc });
  });
  return out;
}
const remoteCrumbs = computed(() => crumbsOf(remotePath.value));

function startEditPath() {
  editingPath.value = true;
  pathDraft.value = remotePath.value;
  void nextTick(() => remotePathInput.value?.focus?.());
}
function commitRemotePath() {
  const p = pathDraft.value.trim();
  editingPath.value = false;
  if (p) { remotePath.value = p; void loadRemote(); }
}
function navigateRemote(p: string) { remotePath.value = p; void loadRemote(); }

// ===== 远程列表 =====
async function loadRemote() {
  remoteLoading.value = true;
  try {
    const r = await api.get<{ path: string; entries: RemoteEntry[]; root: string }>(
      `/plugin/ops-shell/sftp/list?connectionId=${props.connectionId}&path=${encodeURIComponent(remotePath.value)}`,
    );
    if ('data' in r) {
      remoteEntries.value = r.data.entries;
      remotePath.value = r.data.path;
      remoteRoot.value = r.data.root || props.conn.sftpPath || '/';
      remoteSelected.value = new Set();
      remoteAnchor = -1;
    } else {
      ElMessage.error(r.error);
    }
  } catch (e) {
    ElMessage.error('读取远程目录失败: ' + (e as Error).message);
  } finally {
    remoteLoading.value = false;
  }
}
function goRemoteUp() {
  const p = remotePath.value.replace(/\/+$/, '');
  const idx = p.lastIndexOf('/');
  remotePath.value = idx <= 0 ? '/' : p.slice(0, idx);
  void loadRemote();
}
function goRemoteHome() {
  remotePath.value = remoteRoot.value || '/';
  void loadRemote();
}
function onRemoteDblClick(e: RemoteEntry) {
  if (e.type === 'dir') { remotePath.value = joinRemote(remotePath.value, e.name); void loadRemote(); }
}
function joinRemote(base: string, name: string): string {
  return `${base.replace(/\/+$/, '')}/${name}`;
}

// ===== 选择（单击单选 / Ctrl 反选 / Shift 连选） =====
function onRemoteClick(ev: MouseEvent, e: RemoteEntry, idx: number) {
  const s = new Set(remoteSelected.value);
  if (ev.shiftKey && remoteAnchor >= 0) {
    const [a, b] = [Math.min(remoteAnchor, idx), Math.max(remoteAnchor, idx)];
    for (let i = a; i <= b; i++) s.add(remoteEntries.value[i].name);
  } else if (ev.ctrlKey || ev.metaKey) {
    if (s.has(e.name)) s.delete(e.name); else s.add(e.name);
    remoteAnchor = idx;
  } else {
    s.clear(); s.add(e.name);
    remoteAnchor = idx;
  }
  remoteSelected.value = s;
}

// ===== 右键菜单（远程 / 本地两栏共用一份状态，用 pane 分叉） =====
// 为什么共用：以前菜单只挂在远程栏上，本地栏**整个没有右键菜单** —— 一份状态 + pane
// 分叉，比写两套几乎一样的菜单更难漏。
type CtxPane = 'remote' | 'local';
const ctx = ref<{ visible: boolean; x: number; y: number; name: string; isDir: boolean; pane: CtxPane }>({
  visible: false, x: 0, y: 0, name: '', isDir: false, pane: 'remote',
});
/** 菜单元素：渲染后按真实尺寸校正位置（见 composables/useMenuPlacement） */
const ctxMenuEl = ref<HTMLElement | null>(null);
function openCtx(ev: MouseEvent, pane: CtxPane, name: string, isDir: boolean) {
  // ★ 先按光标落位，再由 placeMenuAfterRender 量出**真实尺寸**后校正：
  //   贴光标右下 / 下方放不下则翻到上方 / 不越界。旧实现按"猜 320px 高"硬夹，
  //   在窗口底部右击会把三行菜单推到光标上方两百多像素（用户：'隔这么远'）。
  const at = { x: ev.clientX, y: ev.clientY };
  ctx.value = { visible: true, ...at, name, isDir, pane };
  placeMenuAfterRender(ctxMenuEl, at, (p) => { ctx.value = { ...ctx.value, ...p }; });
}
function onRemoteCtx(e: RemoteEntry, ev: MouseEvent) {
  if (!remoteSelected.value.has(e.name)) remoteSelected.value = new Set([e.name]);
  openCtx(ev, 'remote', e.name, e.type === 'dir');
}
/** 远程栏空白处右键：上传 / 新建目录（目标都是当前远程目录） */
function onListCtx(ev: MouseEvent) {
  remoteSelected.value = new Set();
  openCtx(ev, 'remote', '', false);
}
function onLocalCtx(e: LocalEntry, ev: MouseEvent) {
  if (!localSelected.value.has(e.name)) localSelected.value = new Set([e.name]);
  openCtx(ev, 'local', e.name, e.isDir);
}
/** 本地栏空白处右键：只给「新建目录」（上传的目标是远程，放这里会让人误解） */
function onLocalListCtx(ev: MouseEvent) {
  localSelected.value = new Set();
  openCtx(ev, 'local', '', false);
}
function openCtxDir() {
  if (ctx.value.pane === 'local') {
    const e = localEntries.value.find((x) => x.name === ctx.value.name);
    if (e) { localPath.value = e.path; void loadLocal(); }
    return;
  }
  remotePath.value = joinRemote(remotePath.value, ctx.value.name);
  void loadRemote();
}
/** 本次要操作的名字：右键那一项优先（若它在多选里则整批），否则取多选 */
function ctxNames(): string[] {
  const sel = ctx.value.pane === 'local' ? localSelected.value : remoteSelected.value;
  if (ctx.value.name) return sel.has(ctx.value.name) ? Array.from(sel) : [ctx.value.name];
  return Array.from(sel);
}
function closeCtx() {
  ctx.value = { ...ctx.value, visible: false };
}
function onDocClick() {
  if (ctx.value.visible) closeCtx();
}
function onDocKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') closeCtx();
}

// ===== 拖拽：从系统文件管理器拖入（文件或文件夹） =====
/** 从 DataTransfer 解析出绝对路径（Electron 32+ 需 webUtils.getPathForFile） */
function pathsFromDataTransfer(dt: DataTransfer | null): string[] {
  if (!dt) return [];
  const out: string[] = [];
  for (const f of Array.from(dt.files || [])) {
    const p = electron?.getPathForFile?.(f) || (f as unknown as { path?: string }).path;
    if (p) out.push(String(p).replace(/\\/g, '/'));
  }
  return out;
}
/** 跨栏拖拽状态：dragPane=null 表示来自**系统文件管理器**（行为同原来：上传到远程当前目录） */
const dragPane = ref<'' | 'remote' | 'local'>('');
const dragNames = ref<string[]>([]);
/** 当前悬停的放置目标：栏 + （可选）子目录名 */
const dropPane = ref<'' | 'remote' | 'local'>('');
const dropName = ref('');

function onRemoteRowDragStart(e: RemoteEntry) {
  const names = remoteSelected.value.has(e.name) ? Array.from(remoteSelected.value) : [e.name];
  dragPane.value = 'remote';
  dragNames.value = names;
}
function onLocalRowDragStart(e: LocalEntry) {
  const names = localSelected.value.has(e.name) ? Array.from(localSelected.value) : [e.name];
  dragPane.value = 'local';
  dragNames.value = names;
}
function onDragEnd() {
  dragPane.value = '';
  dragNames.value = [];
  dropPane.value = '';
  dropName.value = '';
}
/** 悬停到子目录行 → 传到该子目录；否则传到栏当前目录 */
function onRemoteRowDragOver(e: RemoteEntry) {
  if (dragPane.value !== 'local') return;
  dropPane.value = 'remote';
  dropName.value = e.type === 'dir' ? e.name : '';
}
function onLocalRowDragOver(e: LocalEntry) {
  if (dragPane.value !== 'remote') return;
  dropPane.value = 'local';
  dropName.value = e.isDir ? e.name : '';
}
function onPaneDragLeave(pane: 'remote' | 'local', ev: DragEvent) {
  const el = ev.currentTarget as HTMLElement | null;
  const to = ev.relatedTarget as Node | null;
  if (!el || !to || !el.contains(to)) {
    if (dropPane.value === pane) { dropPane.value = ''; dropName.value = ''; }
    if (pane === 'remote') dragOver.value = false;
  }
}
/** 远程栏：接收本地栏拖入（上传）或系统文件拖入 */
function onRemoteDragOver(ev: DragEvent) {
  const fromSystem = !!ev.dataTransfer?.types?.includes('Files');
  if (dragPane.value !== 'local' && !fromSystem) return;
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
  if (fromSystem && dragPane.value !== 'local') dragOver.value = true;
  if (dragPane.value === 'local') { dropPane.value = 'remote'; if (!dropName.value) dropName.value = ''; }
}
function onRemoteDrop(ev: DragEvent) {
  dragOver.value = false;
  const fromLocal = dragPane.value === 'local';
  const names = [...dragNames.value];
  const dirName = dropName.value;
  onDragEnd();
  if (fromLocal) {
    const paths = names
      .map((n) => localEntries.value.find((e) => e.name === n)?.path)
      .filter((p): p is string => !!p);
    if (!paths.length) return;
    void uploadPaths(paths, dirName ? joinRemote(remotePath.value, dirName) : remotePath.value);
    return;
  }
  // 系统文件管理器拖入（原行为）
  if (!ev.dataTransfer?.types?.includes('Files')) return;
  ev.preventDefault();
  const paths = pathsFromDataTransfer(ev.dataTransfer);
  if (!paths.length) {
    ElMessage.warning('未能解析拖入项路径（仅桌面端支持拖拽上传）');
    return;
  }
  void uploadPaths(paths, dirName ? joinRemote(remotePath.value, dirName) : remotePath.value);
}
function onRemoteDropOnDir(e: RemoteEntry) {
  if (dragPane.value !== 'local') return;
  const names = [...dragNames.value];
  onDragEnd();
  const paths = names
    .map((n) => localEntries.value.find((x) => x.name === n)?.path)
    .filter((p): p is string => !!p);
  if (!paths.length) return;
  void uploadPaths(paths, e.type === 'dir' ? joinRemote(remotePath.value, e.name) : remotePath.value);
}

/** 本地栏：接收远程栏拖入（下载） */
function onLocalDragOver(ev: DragEvent) {
  if (dragPane.value !== 'remote') return;
  if (!isElectron || !localPath.value) return;
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
  dropPane.value = 'local';
}
function onLocalDrop() {
  if (dragPane.value !== 'remote') return;
  const names = [...dragNames.value];
  const dirName = dropName.value;
  onDragEnd();
  if (!names.length) return;
  void downloadNames(names, dirName ? joinLocal(localPath.value, dirName) : localPath.value);
}
function onLocalDropOnDir(e: LocalEntry) {
  if (dragPane.value !== 'remote') return;
  const names = [...dragNames.value];
  onDragEnd();
  if (!names.length) return;
  void downloadNames(names, e.isDir ? joinLocal(localPath.value, e.name) : localPath.value);
}

// ===== 本地栏（任务 7.5：双栏互拖的下载侧）=====
const localParent = computed(() => {
  const p = localPath.value.replace(/\\/g, '/').replace(/\/+$/, '');
  const idx = p.lastIndexOf('/');
  return idx > 0 ? p.slice(0, idx) : '';
});
function joinLocal(base: string, name: string): string {
  return `${base.replace(/\\/g, '/').replace(/\/+$/, '')}/${name}`;
}
async function loadLocal() {
  if (!isElectron || !localPath.value) return;
  localLoading.value = true;
  try {
    const list = await electron.fs.listDetailed(localPath.value);
    localEntries.value = (list || [])
      .map((e: any) => ({ name: e.name, path: String(e.path || '').replace(/\\/g, '/'), isDir: !!e.isDir, size: e.size || 0, mtime: e.mtime || 0 }))
      .sort((a: LocalEntry, b: LocalEntry) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    localSelected.value = new Set();
    localAnchor = -1;
  } catch (e) {
    ElMessage.error('读取本地目录失败: ' + (e as Error).message);
    localEntries.value = [];
  } finally {
    localLoading.value = false;
  }
}
function goLocalUp() {
  if (!localParent.value) return;
  localPath.value = localParent.value;
  void loadLocal();
}
async function goLocalHome() {
  try {
    const home = (await electron.fs.homeDir?.() || '').replace(/\\/g, '/');
    if (home) { localPath.value = home; void loadLocal(); }
  } catch { /* ignore */ }
}
async function pickLocalDir() {
  if (!isElectron) { ElMessage.warning('仅桌面端支持浏览本地目录'); return; }
  const dir = await electron.dialog.showOpenDir({ title: '选择本地目录（下载目标）' });
  if (dir) { localPath.value = String(dir).replace(/\\/g, '/'); void loadLocal(); }
}
function onLocalClick(ev: MouseEvent, e: LocalEntry, idx: number) {
  const s = new Set(localSelected.value);
  if (ev.shiftKey && localAnchor >= 0) {
    const [a, b] = [Math.min(localAnchor, idx), Math.max(localAnchor, idx)];
    for (let i = a; i <= b; i++) s.add(localEntries.value[i].name);
  } else if (ev.ctrlKey || ev.metaKey) {
    if (s.has(e.name)) s.delete(e.name); else s.add(e.name);
    localAnchor = idx;
  } else {
    s.clear(); s.add(e.name);
    localAnchor = idx;
  }
  localSelected.value = s;
}
function onLocalDblClick(e: LocalEntry) {
  if (e.isDir) { localPath.value = e.path; void loadLocal(); }
}

// ===== 上传 =====
function pickUploadFiles() {
  if (isElectron) {
    void (async () => {
      const files = await electron.dialog.showOpenFiles();
      if (files?.length) await uploadPaths(files.map((f: string) => f.replace(/\\/g, '/')));
    })();
  } else {
    fileInput.value?.click();
  }
}
function pickUploadFolder() {
  if (isElectron) {
    void (async () => {
      const dir = await electron.dialog.showOpenDir({ title: '选择要上传的文件夹' });
      if (dir) await uploadPaths([dir.replace(/\\/g, '/')]);
    })();
  } else {
    folderInput.value?.click();
  }
}
async function onFileInput(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const paths = Array.from(input.files || [])
    .map((f: any) => electron?.getPathForFile?.(f) || f.path || '')
    .filter(Boolean)
    .map((p: string) => p.replace(/\\/g, '/'));
  input.value = '';
  if (paths.length) await uploadPaths(paths);
}
async function onFolderInput(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const pairs: UploadItem[] = Array.from(input.files || []).map((f: any) => {
    const rel = (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name;
    return { localPath: electron?.getPathForFile?.(f) || f.path || '', rel };
  }).filter((p) => p.localPath);
  input.value = '';
  if (pairs.length) await uploadItems(pairs);
}

interface UploadItem {
  localPath: string;
  rel: string;
}

/** 上传本地路径（文件或文件夹——目录由后端递归展开，保留目录结构）
 *  destDir 省略时用远程当前目录（拖拽到子目录行则传该子目录） */
async function uploadPaths(paths: string[], destDir?: string) {
  if (!paths.length) return;
  await uploadItems(paths.map((p) => ({ localPath: p, rel: basename(p) })), destDir);
}

/** 同名冲突：绝不静默覆盖。返回 'overwrite' 覆盖 / 'rename' 自动改名（-<n>） */
async function askConflict(names: string[], side: '远程' | '本地'): Promise<'overwrite' | 'rename'> {
  const label = names.slice(0, 3).join('、') + (names.length > 3 ? ` 等 ${names.length} 项` : '');
  return ElMessageBox.confirm(
    `${side}已有同名项：${label}。选择「覆盖」将替换原文件；选择「重命名」保留双方（自动加 -1 后缀）。`,
    '同名冲突',
    { confirmButtonText: '覆盖', confirmButtonClass: 'yz-confirm-danger', cancelButtonText: '重命名', type: 'warning', distinguishCancelAndClose: false },
  ).then(() => 'overwrite' as const).catch(() => 'rename' as const);
}
/** 生成不冲突的名字：name.ext → name-1.ext */
function altName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 1;
  let candidate = `${base}-${i}${ext}`;
  while (taken.has(candidate)) {
    i += 1;
    candidate = `${base}-${i}${ext}`;
  }
  return candidate;
}

async function uploadItems(items: UploadItem[], destDir?: string) {
  if (!items.length) { ElMessage.warning('没有可上传的文件'); return; }
  const dest = destDir || remotePath.value;
  const needConfirm = isProdTag(props.conn.tag || '');
  // 同名冲突：按目标目录现有条目判定（12.7）
  let finalItems = items;
  if (dest === remotePath.value) {
    const taken = new Set(remoteEntries.value.map((e) => e.name));
    const hit = items.filter((it) => taken.has(it.rel)).map((it) => it.rel);
    if (hit.length) {
      const action = await askConflict(hit, '远程');
      if (action === 'rename') {
        finalItems = items.map((it) => (taken.has(it.rel) ? { ...it, rel: altName(it.rel, taken) } : it));
      }
    }
  }
  const label = finalItems.length === 1 ? basename(finalItems[0].localPath) : `${finalItems.length} 项`;
  if (needConfirm) {
    const ok = await ElMessageBox.confirm(
      `生产连接：确认上传「${label}」到 ${dest}？`, '二次确认', { type: 'warning' },
    ).then(() => true).catch(() => false);
    if (!ok) return;
  }
  const r = await api.post<{ jobId: string; count: number; total: number }>('/plugin/ops-shell/sftp/upload', {
    connectionId: props.connectionId, destDir: dest, files: finalItems, confirmed: needConfirm,
  });
  if ('error' in r) { ElMessage.error(r.error); return; }
  addTask(r.data.jobId, 'upload', `上传 ${label} → ${dest}`, r.data.count, r.data.total);
  const ok = await subscribeTask(r.data.jobId);
  if (ok) ElMessage.success(`已上传 ${label}`);
  await loadRemote();
}

// ===== 下载（目标 = 本地栏当前目录） =====

/** 备份：在远程同目录生成一份 <名>.bak-<时间戳> 副本（改配置前的默认动作） */
async function backupSelected() {
  const files = remoteEntries.value
    .filter((e) => e.type === 'file' && remoteSelected.value.has(e.name))
    .map((e) => e.name);
  if (!files.length) { ElMessage.warning('请选择要备份的文件'); return; }
  if (isProdTag(props.conn.tag || '')) {
    const ok = await ElMessageBox.confirm(
      `生产连接：确认在服务器上备份 ${files.length} 个文件？`, '二次确认', { type: 'warning' },
    ).then(() => true).catch(() => false);
    if (!ok) return;
  }
  let done = 0;
  for (const name of files) {
    const r = await api.post<{ ok: boolean; to: string }>('/plugin/ops-shell/sftp/backup', {
      connectionId: props.connectionId,
      path: joinRemote(remotePath.value, name),
      confirmed: true,
    });
    if ('error' in r) ElMessage.error(`「${name}」备份失败：${r.error}`);
    else done += 1;
  }
  if (done) {
    ElMessage.success(`已备份 ${done} 个文件（同目录 .bak-时间戳 副本）`);
    void loadRemote();
  }
}

/** 递归列举远程目录下的文件（目录下载用；限深 6 层 / 200 个文件，避免拖死） */
async function walkRemoteFiles(dir: string, prefix = '', depth = 0): Promise<Array<{ remote: string; rel: string }>> {
  if (depth > 6) return [];
  const r = await api.get<{ entries: RemoteEntry[] }>(
    `/plugin/ops-shell/sftp/list?connectionId=${props.connectionId}&path=${encodeURIComponent(dir)}`,
  );
  if (!('data' in r)) return [];
  const out: Array<{ remote: string; rel: string }> = [];
  for (const e of r.data.entries || []) {
    if (e.type === 'dir') {
      out.push(...(await walkRemoteFiles(joinRemote(dir, e.name), prefix ? `${prefix}/${e.name}` : e.name, depth + 1)));
    } else {
      out.push({ remote: joinRemote(dir, e.name), rel: prefix ? `${prefix}/${e.name}` : e.name });
    }
  }
  return out;
}

async function downloadNames(names: string[], destDir?: string) {
  if (!names.length) return;
  const dest = (destDir || localPath.value || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!dest) { ElMessage.warning('请先选择本地目录（本地栏「+」按钮）'); return; }
  // 路径穿越防护（12.9）：目标必须落在本地栏当前目录内
  const base = localPath.value.replace(/\\/g, '/').replace(/\/+$/, '');
  if (base && dest !== base && !dest.startsWith(base + '/')) {
    ElMessage.error('下载目标超出当前本地目录，已拒绝');
    return;
  }
  const dirs = remoteEntries.value.filter((e) => e.type === 'dir' && names.includes(e.name)).map((e) => e.name);
  const files = names.filter((n) => !dirs.includes(n));
  const needConfirm = isProdTag(props.conn.tag || '');
  if (needConfirm) {
    const ok = await ElMessageBox.confirm(
      `生产连接：确认从服务器下载 ${names.length} 项到 ${dest}？`, '二次确认', { type: 'warning' },
    ).then(() => true).catch(() => false);
    if (!ok) return;
  }

  // 目录：前端递归（后端不支持整目录下载）——建本地子目录后逐文件下载
  const plan: Array<{ remote: string; local: string }> = [];
  for (const name of files) plan.push({ remote: joinRemote(remotePath.value, name), local: `${dest}/${name}` });
  for (const d of dirs) {
    const list = await walkRemoteFiles(joinRemote(remotePath.value, d));
    if (!list.length) { ElMessage.warning(`目录「${d}」为空或无法读取`); continue; }
    if (list.length > 200) { ElMessage.warning(`目录「${d}」文件过多（${list.length}），已取消下载`); continue; }
    if (isElectron) {
      try { await electron.fs.mkdir(`${dest}/${d}`); } catch { /* 已存在则忽略 */ }
    }
    for (const f of list) plan.push({ remote: f.remote, local: `${dest}/${d}/${f.rel}` });
  }
  if (!plan.length) return;

  // 同名冲突（12.7）：本地已存在则先问，绝不静默覆盖
  if (isElectron) {
    const hit: string[] = [];
    for (const p of plan) {
      try { if (await electron.fs.exists(p.local)) hit.push(p.local.split('/').pop() || p.local); } catch { /* ignore */ }
    }
    if (hit.length) {
      const action = await askConflict(hit, '本地');
      if (action === 'rename') {
        const taken = new Set(localEntries.value.map((e) => e.name));
        for (const p of plan) {
          const name = p.local.split('/').pop() || '';
          if (hit.includes(name)) {
            const alt = altName(name, taken);
            taken.add(alt);
            p.local = p.local.slice(0, p.local.length - name.length) + alt;
          }
        }
      }
    }
  }

  let done = 0;
  for (const p of plan) {
    const name = p.local.split('/').pop() || p.local;
    const r = await api.post<{ jobId: string }>('/plugin/ops-shell/sftp/download', {
      connectionId: props.connectionId, remotePath: p.remote, localPath: p.local,
    });
    if ('error' in r) { ElMessage.error(r.error); return; }
    addTask(r.data.jobId, 'download', `下载 ${name} → ${dest}`, 1);
    const ok = await subscribeTask(r.data.jobId);
    if (!ok) { ElMessage.error(`「${name}」下载失败`); return; }
    done += 1;
  }
  ElMessage.success(`已下载 ${done} 项到 ${dest}`);
  if (dest === localPath.value) void loadLocal();
}

  /** 登记一条任务行（★ 之后一律用 taskOf(id) 拿**响应式代理**再改：
   *  直接改这里返回的裸对象不会触发渲染 —— 数组进 ref 后才被包成代理） */
  const addTask = (id: string, kind: SftpTask['kind'], labelText: string, totalCount: number, totalBytes = 0) => {
    tasks.value = [...tasks.value, {
      id, kind, label: labelText, state: 'running',
      transferred: 0, total: totalBytes, doneCount: 0, totalCount,
      currentFile: '', deletedCount: 0, deleted: [], expanded: false,
    }];
    tasksOpen.value = true;
  };
  const taskOf = (id: string): SftpTask | undefined => tasks.value.find((x) => x.id === id);

  /** 一帧进度写进任务行；删除任务把新增的路径接到明细尾部（见 DELETED_KEEP） */
  function applyJobFrame(jobId: string, d: Record<string, unknown>): void {
    const t = taskOf(jobId);
    if (!t) return;
    if (typeof d.label === 'string' && d.label) t.label = d.label;
    if (typeof d.state === 'string') t.state = d.state as SftpTask['state'];
    if (typeof d.transferred === 'number') t.transferred = d.transferred;
    if (typeof d.total === 'number') t.total = d.total;
    if (typeof d.doneCount === 'number') t.doneCount = d.doneCount;
    if (typeof d.totalCount === 'number') t.totalCount = d.totalCount;
    if (typeof d.currentFile === 'string') t.currentFile = d.currentFile;
    if (typeof d.error === 'string' && d.error) t.error = d.error;
    if (t.kind === 'delete' && typeof d.deletedCount === 'number') {
      const delta = d.deletedCount - t.deletedCount;
      t.deletedCount = d.deletedCount;
      // 服务端每帧只推最近 50 条：只接这一帧新增的尾部 delta 条，避免整段重复追加
      if (delta > 0 && Array.isArray(d.deleted)) {
        const all = d.deleted as string[];
        const fresh = delta <= all.length ? all.slice(all.length - delta) : all;
        t.deleted = [...t.deleted, ...fresh].slice(-DELETED_KEEP);
      }
    }
  }

  /** 订阅一个后端任务的 SSE，返回是否成功结束。
   *  ★ 终止口径：服务端推 `state` 终态帧后**关流**（见 ops-shell 的 sftpProgressStream），
   *    不再靠"读字节哨兵"猜 —— 旧实现一旦漏掉最后一帧就永远显示进行中。 */
  async function subscribeTask(jobId: string): Promise<boolean> {
    let ok = true;
    let sawFinal = false;
    try {
      const token = localStorage.getItem('auth_token') || '';
      const resp = await fetch(`${API_BASE}/plugin/ops-shell/sftp/progress/${jobId}/stream`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.body) return true;
      // SSE 解码统一走 utils/sse（P5 收口）
      await consumeSseStream(resp.body, (payload) => {
        let data: Record<string, unknown>;
        try { data = JSON.parse(payload); } catch { return; }
        applyJobFrame(jobId, data);
        if (data.state === 'done' || data.state === 'failed') {
          sawFinal = true;
          ok = data.state === 'done';
          return false; // 终态：停止消费
        }
      });
      const t = taskOf(jobId);
      // 流关了却没见到终态帧 = 连接中断（任务在服务端可能还在跑）——如实写进任务
      if (!sawFinal && t && t.state === 'running') {
        t.state = 'failed';
        t.error = '进度连接已断开（服务端可能仍在执行）';
        ok = false;
      }
      return ok;
    } catch {
      const t = taskOf(jobId);
      if (t && t.state === 'running') { t.state = 'failed'; t.error = '进度连接异常'; }
      return false;
    }
  }

// ===== 新建目录 / 重命名 / 删除 / 复制（两栏共用，按 ctx.pane 分叉） =====
/** 当前栏是否生产连接（只有远程栏有这个概念） */
function ctxIsProd(): boolean {
  return ctx.value.pane === 'remote' && isProdTag(props.conn.tag || '');
}

async function promptMkdir() {
  const pane = ctx.value.pane;
  const r = await ElMessageBox.prompt('目录名', pane === 'local' ? '新建本地目录' : '新建远程目录', {
    inputPlaceholder: '如 uploads',
    inputValidator: (v: string) => (v && v.trim() ? true : '名称不能为空'),
  }).catch(() => null);
  if (!r) return;
  const name = r.value.trim();
  const res = pane === 'local'
    ? await api.post('/plugin/ops-shell/local/mkdir', { path: joinLocal(localPath.value, name) })
    : await api.post('/plugin/ops-shell/sftp/mkdir', { connectionId: props.connectionId, path: joinRemote(remotePath.value, name) });
  if ('error' in res) { ElMessage.error(res.error); return; }
  await (pane === 'local' ? loadLocal() : loadRemote());
}

async function promptRename() {
  const pane = ctx.value.pane;
  const name = ctx.value.name || ctxNames()[0];
  if (!name) return;
  const r = await ElMessageBox.prompt('新名称', '重命名', {
    inputValue: name,
    inputValidator: (v: string) => (v && v.trim() ? true : '名称不能为空'),
  }).catch(() => null);
  if (!r || !r.value.trim() || r.value.trim() === name) return;
  const to = r.value.trim();
  const res = pane === 'local'
    ? await api.post('/plugin/ops-shell/local/rename', {
      from: joinLocal(localPath.value, name), to: joinLocal(localPath.value, to),
    })
    : await api.post('/plugin/ops-shell/sftp/rename', {
      connectionId: props.connectionId,
      from: joinRemote(remotePath.value, name),
      to: joinRemote(remotePath.value, to),
    });
  if ('error' in res) { ElMessage.error(res.error); return; }
  await (pane === 'local' ? loadLocal() : loadRemote());
}

async function deleteSelected() {
  const pane = ctx.value.pane;
  const names = ctxNames();
  if (!names.length) return;
  const isProd = ctxIsProd();
  const label = names.length === 1 ? `「${names[0]}」` : `${names.length} 项`;
  // 目录是**连同内容一起删**的（本地与远程都递归），文案必须说清 ——
  // 旧文案写「仅支持文件与空目录」，而界面对目录也显示删除，等于那个按钮对目录是坏的
  const dirNote = ctx.value.isDir ? '目录会连同**全部内容**一起删除，' : '';
  const ok = await ElMessageBox.confirm(
    `${isProd ? '生产连接：' : ''}确认删除 ${label}？${dirNote}不可恢复。`,
    '确认删除', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' },
  ).then(() => true).catch(() => false);
  if (!ok) return;
  for (const name of names) {
    if (pane === 'local') {
      const res = await api.post('/plugin/ops-shell/local/delete', { path: joinLocal(localPath.value, name), recursive: true });
      if ('error' in res) { ElMessage.error(`${name}: ${res.error}`); return; }
      continue;
    }
    // 远程删除是「任务」：立刻拿到 jobId，删除在后台逐条跑，订阅里能实时看到删掉了哪些
    const res = await api.post<{ jobId: string; isDir: boolean }>('/plugin/ops-shell/sftp/unlink', {
      connectionId: props.connectionId, path: joinRemote(remotePath.value, name), confirmed: isProd,
    });
    if ('error' in res) { ElMessage.error(`${name}: ${res.error}`); return; }
    addTask(res.data.jobId, 'delete', `${res.data.isDir ? '删除目录' : '删除文件'} ${name}`, 1);
    const deleted = await subscribeTask(res.data.jobId);
    if (!deleted) { ElMessage.error(`${name}: 删除失败`); return; }
  }
  await (pane === 'local' ? loadLocal() : loadRemote());
}

/** 复制到另一端：远程 → 本地（下载），本地 → 远程（上传）；目录都递归 */
async function copyCtxToOther() {
  const name = ctx.value.name;
  if (!name) return;
  if (ctx.value.pane === 'remote') { await downloadNames([name], localPath.value); return; }
  const entry = localEntries.value.find((x) => x.name === name);
  if (entry) await uploadPaths([entry.path]);
}

onMounted(async () => {
  window.addEventListener('click', onDocClick);
  window.addEventListener('keydown', onDocKeydown);
  remotePath.value = props.conn.sftpPath || '/';
  if (isElectron) {
    // 本地栏默认「用户目录下的下载目录」。
    // ★ 不能硬编码中文「下载」：目录名随系统语言/用户配置而变（中文 Windows 常见「下载」、
    //   英文是 Downloads），而且**显示名与磁盘上的真实名可以不一致** —— 资源管理器会把
    //   Downloads 显示成「下载」，但 fsp.readdir 用的是真实名。
    //   2026-10-16 实测：硬编码「下载」在真实名是 Downloads 的机器上直接 ENOENT
    //   （表现为打开 SFTP 面板就弹「读取本地目录失败」）。
    //   故按候选依次**探测**：能列出来才算数，都不行就回落到用户主目录（至少可读）。
    try {
      const home = (await electron.fs.homeDir?.() || '').replace(/\\/g, '/');
      if (home) {
        for (const cand of [`${home}/Downloads`, `${home}/下载`, home]) {
          try {
            await electron.fs.listDetailed(cand);
            localPath.value = cand;
            break;
          } catch { /* 该目录不存在或不可读 → 试下一个候选 */ }
        }
      }
    } catch { /* ignore */ }
    void loadLocal();
  }
  await loadRemote();
});

onUnmounted(() => {
  window.removeEventListener('click', onDocClick);
  window.removeEventListener('keydown', onDocKeydown);
});
</script>

<style scoped>
.sftp-panel { height: 100%; display: flex; flex-direction: column; gap: 8px; min-height: 0; }

/* ===== 顶栏 ===== */
.sftp-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; flex-shrink: 0; }
.sftp-host {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; color: var(--color-text-secondary); font-family: Consolas, monospace;
}
.sftp-host-icon { font-size: 13px; }
.sftp-head-actions { display: flex; gap: 6px; flex-wrap: wrap; }

/* ===== 任务列表（上传 / 下载 / 删除） ===== */
.sftp-tasks {
  flex-shrink: 0; border: 1px solid var(--glass-border); border-radius: 8px;
  background: var(--glass-bg); overflow: hidden;
}
.sftp-tasks-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 4px 8px; font-size: 12px; color: var(--color-text-secondary);
}
.sftp-tasks-title { display: inline-flex; align-items: center; gap: 5px; }
.sftp-tasks-icon { font-size: 13px; }
.sftp-tasks-actions { display: flex; align-items: center; gap: 2px; }
/* 任务多时内部滚动，不把双栏列表挤走 */
.sftp-tasks-body { max-height: 190px; overflow: auto; border-top: 1px solid var(--glass-border); }
.sftp-task { display: flex; gap: 6px; padding: 5px 8px; }
.sftp-task + .sftp-task { border-top: 1px dashed var(--glass-border); }
.sftp-task-icon { font-size: 13px; color: var(--color-text-tertiary); margin-top: 2px; flex: none; }
.sftp-task.is-failed .sftp-task-icon { color: var(--color-danger, #c25b4e); }
.sftp-task.is-done .sftp-task-icon { color: var(--color-success, #4fa97f); }
.sftp-task-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.sftp-task-line { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.sftp-task-label { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sftp-task-meta { flex: none; font-size: 11px; color: var(--color-text-tertiary); }
.sftp-task-err { font-size: 11px; color: var(--color-danger, #c25b4e); word-break: break-all; }
/* 删除明细：实时滚动的已删路径 */
.sftp-task-del-toggle { font-size: 11px; color: var(--color-primary); cursor: pointer; }
.sftp-task-del-list {
  margin-top: 3px; max-height: 110px; overflow: auto;
  font-family: var(--font-mono, Consolas, monospace); font-size: 11px;
  color: var(--color-text-secondary); background: rgba(127, 127, 127, 0.08);
  border-radius: 4px; padding: 3px 5px;
}
.sftp-task-del-item { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ===== 路径栏 ===== */
.sftp-pathbar {
  display: flex; align-items: center; gap: 2px; flex-shrink: 0; min-height: 24px;
  border: 1px solid var(--glass-border); border-radius: 6px; padding: 0 4px; background: var(--glass-bg);
}
.sftp-crumbs { flex: 1; min-width: 0; display: flex; align-items: center; gap: 1px; overflow-x: auto; cursor: text; scrollbar-width: none; }
.sftp-crumbs::-webkit-scrollbar { display: none; }
.sftp-crumb { font-size: 11px; color: var(--color-text-secondary); padding: 1px 3px; border-radius: 3px; white-space: nowrap; }
.sftp-crumb:hover { color: var(--color-primary); background: var(--glass-bg-hover); }
.sftp-crumb-sep { font-size: 10px; color: var(--color-text-tertiary); }
.sftp-path-input { flex: 1; }
.sftp-path-input :deep(.el-input__wrapper) { box-shadow: none; background: transparent; padding: 0 4px; }
.sftp-path-input :deep(.el-input__inner) { font-family: Consolas, monospace; font-size: 11px; }

/* ===== 下载目标目录 ===== */
.sftp-target {
  display: flex; align-items: center; gap: 5px; flex-shrink: 0;
  font-size: 11px; color: var(--color-text-tertiary); padding: 0 2px;
}
.sftp-target-icon { font-size: 12px; }
.sftp-target-path {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: Consolas, monospace; direction: rtl; text-align: left;
}

/* ===== 双栏：远程 │ 本地（任务 7.5）=====
   宽容器左右并排；紧凑模式（嵌在终端右侧）上下堆叠，避免每栏挤成一条缝 */
.sftp-panes {
  flex: 1; min-height: 0;
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}
.sftp-panes.is-stacked { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }

.sftp-pane { display: flex; flex-direction: column; gap: 4px; min-height: 0; min-width: 0; }

.sftp-pane-head {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; color: var(--color-text-secondary); flex-shrink: 0;
}
.sftp-pane-tag {
  flex-shrink: 0;
  font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
  padding: 1px 6px; border-radius: 6px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
}
.sftp-pane-host {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: Consolas, monospace; font-size: 10.5px; color: var(--color-text-tertiary);
}
.sftp-local-path {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: Consolas, monospace; font-size: 11px; color: var(--color-text-secondary);
  padding: 0 4px;
}

/* 跨栏拖拽的落点提示 */
.sftp-list.is-drop { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 6%, transparent); }
.sftp-row.is-drop { background: color-mix(in srgb, var(--color-primary) 18%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 45%, transparent); }
.sftp-row.is-drag-src { opacity: 0.4; }

/* ===== 列表 ===== */
.sftp-list {
  position: relative; flex: 1; min-height: 0; overflow: auto;
  border: 1px solid var(--glass-border); border-radius: 8px; background: var(--glass-bg);
  transition: border-color 0.12s ease, background 0.12s ease;
}
.sftp-list.is-busy { opacity: 0.6; pointer-events: none; }
.sftp-list.is-over { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 5%, transparent); }
.sftp-cols-head {
  position: sticky; top: 0; z-index: 1;
  display: grid; grid-template-columns: 1fr 72px 92px; gap: 8px;
  padding: 4px 24px 4px 24px; font-size: 10px; color: var(--color-text-tertiary);
  background: var(--color-surface); border-bottom: 1px solid var(--glass-border);
}
.sftp-c-name { padding-left: 2px; }
.sftp-c-size, .sftp-c-time { text-align: right; }

.sftp-row {
  position: relative; display: grid; grid-template-columns: 16px 1fr 72px 92px; gap: 8px;
  align-items: center; padding: 3px 8px; border-radius: 5px; cursor: default;
  font-size: 12px; user-select: none;
}
.sftp-row:hover { background: var(--glass-bg-hover); }
.sftp-row.selected { background: color-mix(in srgb, var(--color-primary) 12%, transparent); }
.sftp-row-icon { font-size: 14px; }
.sftp-row-icon.is-dir { color: var(--color-primary); }
.sftp-row-icon.is-file { color: var(--color-text-tertiary); }
.sftp-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sftp-size, .sftp-time { font-size: 11px; color: var(--color-text-tertiary); text-align: right; white-space: nowrap; }
/* 行内操作：悬浮覆盖右侧，不挤压列表布局 */
.sftp-row-actions {
  position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
  display: none; align-items: center; padding-left: 16px; border-radius: 0 5px 5px 0;
  background: linear-gradient(90deg, transparent, var(--glass-bg-hover) 30%);
}
.sftp-row:hover .sftp-row-actions { display: flex; }

/* ===== 紧凑模式（并排嵌在终端右侧）：隐藏修改时间列 ===== */
.sftp-panel.is-compact .sftp-cols-head { grid-template-columns: 1fr 60px; padding-right: 20px; }
.sftp-panel.is-compact .sftp-row { grid-template-columns: 16px 1fr 60px; }

/* ===== 状态 / 拖拽覆盖层 ===== */
.sftp-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  padding: 26px 12px; font-size: 12px; color: var(--color-text-tertiary); text-align: center;
}
.sftp-state-icon { font-size: 20px; opacity: 0.5; }
.sftp-dropzone {
  position: absolute; inset: 0; z-index: 2;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  font-size: 12px; color: var(--color-primary); pointer-events: none;
  border: 1px dashed var(--color-primary); border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}
.sftp-dropzone :deep(.el-icon) { font-size: 22px; }


</style>
