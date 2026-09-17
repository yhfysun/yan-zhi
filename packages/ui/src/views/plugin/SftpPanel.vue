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

    <!-- 传输进度 -->
    <div v-if="transfer.active" class="sftp-progress">
      <div class="sftp-progress-meta">
        <span>{{ transfer.label }}</span>
        <span class="sftp-progress-pct">{{ transfer.percent }}%</span>
      </div>
      <el-progress :percentage="transfer.percent" :status="transfer.status" :stroke-width="6" :show-text="false" />
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
      class="ctx-menu"
      :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
      @click.stop
      @contextmenu.prevent
    >
      <template v-if="!ctx.name">
        <!-- 空白处右键：上传到当前目录 -->
        <div class="sftp-ctxmenu-item" @click="pickUploadFiles(); closeCtx()">上传文件</div>
        <div class="sftp-ctxmenu-item" @click="pickUploadFolder(); closeCtx()">上传文件夹</div>
        <div class="sftp-ctxmenu-item" @click="promptMkdir(); closeCtx()">新建目录</div>
      </template>
      <template v-else>
        <div v-if="ctx.isDir" class="sftp-ctxmenu-item" @click="openCtxDir(); closeCtx()">打开</div>
        <div class="sftp-ctxmenu-item" @click="pickUploadFiles(); closeCtx()">上传文件</div>
        <div class="sftp-ctxmenu-item" @click="pickUploadFolder(); closeCtx()">上传文件夹</div>
        <div class="sftp-ctxmenu-item" @click="promptRename(); closeCtx()">重命名</div>
        <div v-if="!ctx.isDir" class="sftp-ctxmenu-item" @click="downloadNames([ctx.name]); closeCtx()">下载</div>
        <div v-if="!ctx.isDir" class="sftp-ctxmenu-item" @click="backupSelected(); closeCtx()">备份</div>
        <div class="sftp-ctxmenu-item is-danger" @click="deleteSelected(); closeCtx()">删除</div>
      </template>
    </div>
</Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { clampMenuPos } from '../../utils/menuPosition';
import {
  ArrowUp, Connection, Document, Download, EditPen,
  Folder, FolderAdd, FolderOpened, HomeFilled, Link, Refresh, Upload,
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

const transfer = ref({ active: false, label: '', percent: 0, status: '' as '' | 'success' | 'exception' | 'warning' });

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

// ===== 右键菜单 =====
const ctx = ref({ visible: false, x: 0, y: 0, name: '', isDir: false });
function onRemoteCtx(e: RemoteEntry, ev: MouseEvent) {
  if (!remoteSelected.value.has(e.name)) remoteSelected.value = new Set([e.name]);
  ctx.value = { visible: true, ...clampMenuPos(ev), name: e.name, isDir: e.type === 'dir' };
}
/** 空白处右键：只提供上传 / 新建目录（上传目标是当前目录） */
function onListCtx(ev: MouseEvent) {
  remoteSelected.value = new Set();
  ctx.value = { visible: true, ...clampMenuPos(ev), name: '', isDir: false };
}
function openCtxDir() {
  remotePath.value = joinRemote(remotePath.value, ctx.value.name);
  void loadRemote();
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
    { confirmButtonText: '覆盖', cancelButtonText: '重命名', type: 'warning', distinguishCancelAndClose: false },
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
  transfer.value = { active: true, label: `上传 ${label} → ${dest}`, percent: 0, status: '' };
  const r = await api.post<{ jobId: string }>('/plugin/ops-shell/sftp/upload', {
    connectionId: props.connectionId, destDir: dest, files: finalItems, confirmed: needConfirm,
  });
  if ('error' in r) { transfer.value.active = false; ElMessage.error(r.error); return; }
  const ok = await subscribeProgress(r.data.jobId);
  transfer.value = { ...transfer.value, active: false, status: ok ? 'success' : 'exception' };
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
    transfer.value = { active: true, label: `下载 ${p.local.split('/').pop()}（${done + 1}/${plan.length}）`, percent: 0, status: '' };
    const r = await api.post<{ jobId: string }>('/plugin/ops-shell/sftp/download', {
      connectionId: props.connectionId, remotePath: p.remote, localPath: p.local,
    });
    if ('error' in r) {
      transfer.value = { ...transfer.value, active: false, status: 'exception' };
      ElMessage.error(r.error);
      return;
    }
    const ok = await subscribeProgress(r.data.jobId);
    transfer.value = { ...transfer.value, active: false, status: ok ? 'success' : 'exception' };
    if (!ok) return;
    done += 1;
  }
  ElMessage.success(`已下载 ${done} 项到 ${dest}`);
  if (dest === localPath.value) void loadLocal();
}

// ===== 进度订阅（SSE）；返回是否成功 =====
async function subscribeProgress(jobId: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const token = localStorage.getItem('auth_token') || '';
    void (async () => {
      try {
        const resp = await fetch(`${API_BASE}/plugin/ops-shell/sftp/progress/${jobId}/stream`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const reader = resp.body?.getReader();
        if (!reader) { resolve(true); return; }
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          for (const p of parts) {
            const line = p.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            let data: any;
            try { data = JSON.parse(line.slice(5)); } catch { continue; }
            if (data.transferred < 0) {
              transfer.value = { ...transfer.value, active: false, status: 'exception' };
              ElMessage.error('传输失败');
              resolve(false); return;
            }
            // 完成标记：后端完成后置 transferred=0,total=1
            if (data.transferred === 0 && data.total === 1) { resolve(true); return; }
            const total = data.total > 0 ? data.total : 1;
            const pct = Math.min(100, Math.round((data.transferred / total) * 100));
            transfer.value = { ...transfer.value, active: true, percent: pct };
          }
        }
        resolve(true);
      } catch {
        resolve(true);
      }
    })();
  });
}

// ===== 新建目录 / 重命名 / 删除 =====
async function promptMkdir() {
  const r = await ElMessageBox.prompt('目录名', '新建远程目录', {
    inputPlaceholder: '如 uploads',
    inputValidator: (v: string) => (v && v.trim() ? true : '名称不能为空'),
  }).catch(() => null);
  if (!r) return;
  const res = await api.post('/plugin/ops-shell/sftp/mkdir', {
    connectionId: props.connectionId, path: joinRemote(remotePath.value, r.value.trim()),
  });
  if ('error' in res) ElMessage.error(res.error); else await loadRemote();
}

async function promptRename() {
  const name = ctx.value.name || Array.from(remoteSelected.value)[0];
  if (!name) return;
  const r = await ElMessageBox.prompt('新名称', '重命名', {
    inputValue: name,
    inputValidator: (v: string) => (v && v.trim() ? true : '名称不能为空'),
  }).catch(() => null);
  if (!r || r.value.trim() === name) return;
  const res = await api.post('/plugin/ops-shell/sftp/rename', {
    connectionId: props.connectionId,
    from: joinRemote(remotePath.value, name),
    to: joinRemote(remotePath.value, r.value.trim()),
  });
  if ('error' in res) ElMessage.error(res.error); else await loadRemote();
}

async function deleteSelected() {
  const names = Array.from(remoteSelected.value);
  if (!names.length) return;
  const isProd = isProdTag(props.conn.tag || '');
  const label = names.length === 1 ? `「${names[0]}」` : `${names.length} 项`;
  const ok = await ElMessageBox.confirm(
    `${isProd ? '生产连接：' : ''}确认删除 ${label}？（仅支持文件与空目录）`, '确认删除', { type: 'warning' },
  ).then(() => true).catch(() => false);
  if (!ok) return;
  for (const name of names) {
    const res = await api.post('/plugin/ops-shell/sftp/unlink', {
      connectionId: props.connectionId, path: joinRemote(remotePath.value, name), confirmed: isProd,
    });
    if ('error' in res) { ElMessage.error(`${name}: ${res.error}`); return; }
  }
  await loadRemote();
}

onMounted(async () => {
  window.addEventListener('click', onDocClick);
  window.addEventListener('keydown', onDocKeydown);
  remotePath.value = props.conn.sftpPath || '/';
  if (isElectron) {
    // 本地栏默认「用户目录/下载」（Windows 下写 下载 也能被资源管理器识别为 Downloads）
    try {
      const home = (await electron.fs.homeDir?.() || '').replace(/\\/g, '/');
      if (home) localPath.value = `${home}/下载`;
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

/* ===== 进度 ===== */
.sftp-progress { flex-shrink: 0; }
.sftp-progress-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--color-text-secondary); margin-bottom: 3px; }
.sftp-progress-meta > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sftp-progress-pct { font-weight: 600; flex-shrink: 0; margin-left: 10px; }

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
