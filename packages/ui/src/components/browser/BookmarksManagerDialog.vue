<template>
  <el-dialog
    v-model="visible"
    title="收藏夹"
    width="720px"
    append-to-body
    :close-on-click-modal="false"
    class="bm-manager-dialog"
  >
    <div class="bm-mgr-toolbar">
      <el-input v-model="query" size="small" clearable placeholder="搜索名称或网址" style="max-width:220px" />
      <span class="bm-mgr-count">共 {{ total }} 个收藏</span>
      <span class="bm-mgr-spacer"></span>
      <el-button size="small" @click="addFolder(null)">新建文件夹</el-button>
      <el-button v-if="canImport" size="small" :loading="importing" @click="startImport">从 Chrome/Edge 导入</el-button>
      <el-button size="small" type="danger" text :disabled="!nodes.length" @click="clearAll">清空</el-button>
    </div>

    <div v-if="importProfiles.length" class="bm-mgr-import">
      <div class="bm-mgr-import-title">选择要导入的浏览器配置：</div>
      <el-radio-group v-model="importIndex" class="bm-mgr-import-list">
        <el-radio v-for="(p, i) in importProfiles" :key="p.path" :value="i" class="bm-mgr-import-item">
          {{ p.browserName }} · {{ p.profileName }}（{{ p.count }} 个）
        </el-radio>
      </el-radio-group>
      <div class="bm-mgr-import-actions">
        <el-button size="small" type="primary" @click="doImport('merge')">合并导入</el-button>
        <el-button size="small" @click="doImport('replace')">替换全部</el-button>
        <el-button size="small" text @click="importProfiles = []">取消</el-button>
      </div>
    </div>

    <div v-if="!rows.length" class="bm-mgr-empty">
      {{ nodes.length ? '没有匹配的收藏' : '还没有收藏。在网页上点星号即可收藏。' }}
    </div>

    <div v-else class="bm-mgr-list">
      <div
        v-for="row in rows"
        :key="row.node.id"
        class="bm-mgr-row"
        :class="{ folder: row.node.type === 'folder' }"
        :style="{ paddingLeft: 8 + row.depth * 18 + 'px' }"
      >
        <template v-if="row.node.type === 'folder'">
          <svg class="bm-mgr-icon folder" viewBox="0 0 24 24" width="14" height="14">
            <path fill="currentColor" d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
          </svg>
          <el-input
            class="bm-mgr-title-input"
            size="small"
            :model-value="row.node.title"
            maxlength="40"
            @change="rename(row.node.id, $event)"
          />
          <span class="bm-mgr-sub">{{ folderCount(row.node) }} 项</span>
          <el-button size="small" text @click="addFolder(row.node.id)">+ 子文件夹</el-button>
          <el-button size="small" text type="danger" @click="remove(row.node)">删除</el-button>
        </template>

        <template v-else>
          <span class="bm-mgr-favicon" :style="{ background: faviconColor(row.node.url) }">{{ initial(row.node) }}</span>
          <el-input
            class="bm-mgr-title-input"
            size="small"
            :model-value="row.node.title"
            maxlength="80"
            @change="rename(row.node.id, $event)"
          />
          <span class="bm-mgr-url" :title="row.node.url">{{ row.node.url }}</span>
          <el-select
            class="bm-mgr-move"
            size="small"
            :model-value="row.parentId"
            placeholder="根目录"
            @change="move(row.node.id, $event)"
          >
            <el-option label="根目录" :value="null" />
            <el-option v-for="f in folderOptions" :key="f.id" :label="f.path" :value="f.id" />
          </el-select>
          <el-button size="small" text @click="openUrl(row.node.url || '')">打开</el-button>
          <el-button size="small" text type="danger" @click="remove(row.node)">删除</el-button>
        </template>
      </div>
    </div>

    <template #footer>
      <el-button size="small" @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  addNode,
  countUrls,
  filterNodes,
  flattenTree,
  hostOfUrl,
  importedToNodes,
  listFolders,
  makeFolderNode,
  mergeBookmarks,
  moveNode,
  removeNode,
  updateNode,
  type BookmarkNode,
} from '../../utils/browserBookmarks';

interface ChromeProfile {
  browser: string;
  browserName: string;
  profile: string;
  profileName: string;
  path: string;
  count: number;
  roots: any[];
}

const props = defineProps<{
  modelValue: boolean;
  nodes: BookmarkNode[];
  canImport: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  change: [nodes: BookmarkNode[]];
  openUrl: [url: string];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

const query = ref('');
const rows = computed(() => flattenTree(filterNodes(props.nodes, query.value)));
const folderOptions = computed(() => listFolders(props.nodes));
const total = computed(() => countUrls(props.nodes));

const importing = ref(false);
const importProfiles = ref<ChromeProfile[]>([]);
const importIndex = ref(0);

watch(() => props.modelValue, (open) => {
  if (!open) {
    importProfiles.value = [];
    query.value = '';
  }
});

function folderCount(node: BookmarkNode): number {
  return countUrls(node.children || []);
}

function initial(node: BookmarkNode): string {
  const label = node.title || hostOfUrl(node.url || '') || '?';
  return label.trim().slice(0, 1).toUpperCase();
}

function faviconColor(url?: string): string {
  const host = hostOfUrl(url || '');
  let hash = 0;
  for (let i = 0; i < host.length; i++) hash = (hash * 31 + host.charCodeAt(i)) % 360;
  return `hsl(${hash}, 55%, 55%)`;
}

function rename(id: string, value: string) {
  const title = String(value || '').trim();
  if (!title) return;
  emit('change', updateNode(props.nodes, id, { title }));
}

function addFolder(parentId: string | null) {
  emit('change', addNode(props.nodes, parentId, makeFolderNode('新建文件夹')));
}

async function remove(node: BookmarkNode) {
  const label = node.type === 'folder'
    ? `删除文件夹「${node.title}」及其中的 ${folderCount(node)} 个收藏？`
    : `删除收藏「${node.title}」？`;
  try {
    await ElMessageBox.confirm(label, '删除收藏', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' });
  } catch {
    return;
  }
  emit('change', removeNode(props.nodes, node.id));
}

function move(id: string, target: string | null) {
  emit('change', moveNode(props.nodes, id, target));
}

function openUrl(url: string) {
  if (!url) return;
  emit('openUrl', url);
}

async function clearAll() {
  try {
    await ElMessageBox.confirm(`清空全部 ${total.value} 个收藏？此操作不可撤销。`, '清空收藏夹', {
      type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  emit('change', []);
}

async function startImport() {
  const api = (window as any).electronAPI?.bookmarks;
  if (!api?.importChrome) {
    ElMessage.warning('当前环境不支持导入本机书签');
    return;
  }
  importing.value = true;
  importProfiles.value = [];
  try {
    const r = await api.importChrome();
    if (!r?.ok) {
      ElMessage.error(r?.error || '读取浏览器书签失败');
      return;
    }
    const profiles = (r.profiles || []) as ChromeProfile[];
    if (!profiles.length) {
      ElMessage.info('未找到本机 Chrome/Edge 书签');
      return;
    }
    importProfiles.value = profiles;
    importIndex.value = 0;
  } catch (e: any) {
    ElMessage.error('读取浏览器书签失败：' + (e?.message || e));
  } finally {
    importing.value = false;
  }
}

async function doImport(mode: 'merge' | 'replace') {
  const profile = importProfiles.value[importIndex.value];
  if (!profile) return;
  const imported = importedToNodes(profile.roots || []);
  if (mode === 'replace') {
    try {
      await ElMessageBox.confirm(
        `将用「${profile.browserName} · ${profile.profileName}」的 ${profile.count} 个书签替换当前全部收藏？`,
        '替换收藏夹',
        { type: 'warning', confirmButtonText: '替换', cancelButtonText: '取消' },
      );
    } catch {
      return;
    }
    const r = mergeBookmarks([], imported);
    emit('change', r.nodes);
    ElMessage.success(`已替换为 ${r.added} 个书签`);
  } else {
    const r = mergeBookmarks(props.nodes, imported);
    emit('change', r.nodes);
    ElMessage.success(`已导入 ${r.added} 个书签${r.skipped ? `，跳过 ${r.skipped} 个重复项` : ''}`);
  }
  importProfiles.value = [];
}
</script>

<style scoped>
.bm-mgr-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap; /* ★ 窄屏（钳 92vw 后 ~340px）：toolbar ~600px 无 wrap 必溢出 */
}
.bm-mgr-count { font-size: 12px; color: var(--el-text-color-secondary, #909399); }
.bm-mgr-spacer { flex: 1; }
.bm-mgr-import {
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 8px;
  background: var(--el-fill-color-lighter, #fafafa);
}
.bm-mgr-import-title { font-size: 12px; margin-bottom: 6px; color: var(--el-text-color-regular, #606266); }
.bm-mgr-import-list { display: flex; flex-direction: column; gap: 4px; }
.bm-mgr-import-item { margin-right: 0; }
.bm-mgr-import-actions { display: flex; gap: 8px; margin-top: 8px; }
.bm-mgr-empty {
  padding: 36px 0;
  text-align: center;
  color: var(--el-text-color-secondary, #909399);
  font-size: 13px;
}
.bm-mgr-list { max-height: 52vh; overflow-y: auto; }
.bm-mgr-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter, #f0f0f0);
}
.bm-mgr-row.folder { background: var(--el-fill-color-lighter, #fafafa); }
.bm-mgr-icon.folder { color: var(--el-color-warning, #e6a23c); flex-shrink: 0; }
.bm-mgr-title-input { flex: 1 1 160px; min-width: 0; } /* ★ 原 0 0 200px 完全不缩，窄屏挤没 URL 列 */
.bm-mgr-sub { font-size: 11px; color: var(--el-text-color-secondary, #909399); flex-shrink: 0; }
.bm-mgr-url {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--el-text-color-secondary, #909399);
}
.bm-mgr-move { flex: 0 1 130px; min-width: 0; } /* ★ 允许收缩，窄屏不再顶溢出 */
.bm-mgr-favicon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  color: #fff;
  font-size: 10px;
  flex-shrink: 0;
}
</style>
