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

    <!-- 路径栏 -->
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

    <!-- 下载目标目录（本地栏已移除，下载统一落这里） -->
    <div class="sftp-target">
      <el-icon class="sftp-target-icon"><Download /></el-icon>
      <span class="sftp-target-path" :title="downloadDir">{{ downloadDir || '未设置下载目录' }}</span>
      <el-button link size="small" @click="pickDownloadDir">更改</el-button>
    </div>

    <!-- 远程列表：拖入系统文件/文件夹即可上传到当前目录 -->
    <div
      class="sftp-list"
      :class="{ 'is-over': dragOver, 'is-busy': remoteLoading }"
      @dragover="onListDragOver"
      @dragleave="onListDragLeave"
      @drop="onListDrop"
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
        :class="{ selected: remoteSelected.has(e.name) }"
        :title="e.name"
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
            title="下载到本地下载目录"
            @click="downloadNames([e.name])"
          />
        </span>
      </div>
      <div v-if="!remoteLoading && !remoteEntries.length" class="sftp-state">
        <el-icon class="sftp-state-icon"><FolderOpened /></el-icon>
        <span>此目录为空，可拖入文件或右键上传</span>
      </div>

      <div v-if="dragOver" class="sftp-dropzone">
        <el-icon><Upload /></el-icon>
        <span>松开上传到 {{ remotePath }}</span>
      </div>
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

const remotePath = ref('/');
const remoteRoot = ref('/');
const remoteEntries = ref<RemoteEntry[]>([]);
const remoteSelected = ref(new Set<string>());
const remoteLoading = ref(false);

/** 下载目标目录（本地栏已移除，所有下载统一落这里） */
const downloadDir = ref('');

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
function onListDragOver(ev: DragEvent) {
  if (!ev.dataTransfer?.types?.includes('Files')) return;
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'copy';
  dragOver.value = true;
}
function onListDragLeave(ev: DragEvent) {
  const el = ev.currentTarget as HTMLElement | null;
  const to = ev.relatedTarget as Node | null;
  // 移入子元素也会触发 dragleave，relatedTarget 仍在容器内时忽略
  if (!el || !to || !el.contains(to)) dragOver.value = false;
}
function onListDrop(ev: DragEvent) {
  if (!ev.dataTransfer?.types?.includes('Files')) return;
  ev.preventDefault();
  dragOver.value = false;
  const paths = pathsFromDataTransfer(ev.dataTransfer);
  if (!paths.length) {
    ElMessage.warning('未能解析拖入项路径（仅桌面端支持拖拽上传）');
    return;
  }
  void uploadPaths(paths);
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

/** 上传本地路径（文件或文件夹——目录由后端递归展开，保留目录结构） */
async function uploadPaths(paths: string[]) {
  if (!paths.length) return;
  await uploadItems(paths.map((p) => ({ localPath: p, rel: basename(p) })));
}

async function uploadItems(items: UploadItem[]) {
  if (!items.length) { ElMessage.warning('没有可上传的文件'); return; }
  const needConfirm = isProdTag(props.conn.tag || '');
  const label = items.length === 1 ? basename(items[0].localPath) : `${items.length} 项`;
  if (needConfirm) {
    const ok = await ElMessageBox.confirm(
      `生产连接：确认上传「${label}」到 ${remotePath.value}？`, '二次确认', { type: 'warning' },
    ).then(() => true).catch(() => false);
    if (!ok) return;
  }
  transfer.value = { active: true, label: `上传 ${label} → ${remotePath.value}`, percent: 0, status: '' };
  const r = await api.post<{ jobId: string }>('/plugin/ops-shell/sftp/upload', {
    connectionId: props.connectionId, destDir: remotePath.value, files: items, confirmed: needConfirm,
  });
  if ('error' in r) { transfer.value.active = false; ElMessage.error(r.error); return; }
  const ok = await subscribeProgress(r.data.jobId);
  transfer.value = { ...transfer.value, active: false, status: ok ? 'success' : 'exception' };
  if (ok) ElMessage.success(`已上传 ${label}`);
  await loadRemote();
}

// ===== 下载（统一落到 downloadDir） =====
async function pickDownloadDir() {
  if (!isElectron) { ElMessage.warning('仅桌面端支持选择下载目录'); return; }
  const dir = await electron.dialog.showOpenDir({ title: '选择下载目录' });
  if (dir) downloadDir.value = dir.replace(/\\/g, '/');
}

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

async function downloadNames(names: string[]) {
  if (!names.length) return;
  if (!downloadDir.value) { ElMessage.warning('请先设置下载目录'); return; }
  const dirs = remoteEntries.value.filter((e) => e.type === 'dir' && names.includes(e.name)).map((e) => e.name);
  const files = names.filter((n) => !dirs.includes(n));
  if (dirs.length) ElMessage.warning(`已跳过目录：${dirs.join('、')}（暂不支持下载目录）`);
  if (!files.length) return;
  const base = downloadDir.value.replace(/\\/g, '/').replace(/\/+$/, '');
  const needConfirm = isProdTag(props.conn.tag || '');
  if (needConfirm) {
    const ok = await ElMessageBox.confirm(
      `生产连接：确认从服务器下载 ${files.length} 个文件到 ${base}？`, '二次确认', { type: 'warning' },
    ).then(() => true).catch(() => false);
    if (!ok) return;
  }
  for (const name of files) {
    const localFull = `${base}/${name}`;
    transfer.value = { active: true, label: `下载 ${name}`, percent: 0, status: '' };
    const r = await api.post<{ jobId: string }>('/plugin/ops-shell/sftp/download', {
      connectionId: props.connectionId, remotePath: joinRemote(remotePath.value, name), localPath: localFull,
    });
    if ('error' in r) { transfer.value = { ...transfer.value, active: false, status: 'exception' }; ElMessage.error(r.error); return; }
    const ok = await subscribeProgress(r.data.jobId);
    transfer.value = { ...transfer.value, active: false, status: ok ? 'success' : 'exception' };
    if (!ok) return;
    ElMessage.success(`已下载到 ${localFull}`);
  }
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
    // 下载目录默认「用户目录/下载」（Windows 下写 下载 也能被资源管理器识别为 Downloads）
    try {
      const home = (await electron.fs.homeDir?.() || '').replace(/\\/g, '/');
      if (home) downloadDir.value = `${home}/下载`;
    } catch { /* ignore */ }
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
