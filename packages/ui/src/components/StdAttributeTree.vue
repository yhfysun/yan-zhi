<template>
  <div class="std-tree" v-loading="loading">
    <div class="std-toolbar">
      <el-input v-model="keyword" size="small" clearable :prefix-icon="Search" placeholder="搜索 key / 值 / 描述 / 分组" />
      <el-dropdown trigger="click" @command="onAddCmd">
        <el-button size="small" type="primary" :icon="Plus">新增</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="group">新增分组（可嵌套）</el-dropdown-item>
            <el-dropdown-item command="attr">新增属性（key/value/def）</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <div class="std-scroll" @drop="onDropRoot" @dragover.prevent>
      <template v-for="n in visibleNodes" :key="n.key">
        <div
          v-if="n.kind === 'group'"
          class="std-row std-row-group"
          :class="{ 'drag-over': dragOver === n.key }"
          :style="{ paddingLeft: 6 + n.depth * 14 + 'px' }"
          draggable="true"
          @click="toggleFold(n.id)"
          @dragstart="onDragStart($event, `grp:${n.id}`)"
          @dragover.prevent.stop="dragOver = n.key"
          @dragleave="dragOver = ''"
          @drop.stop="onDrop($event, n.id)"
        >
          <span class="std-row-inner">
            <el-icon :size="11" class="std-fold" :class="{ open: !folded.has(n.id) }"><ArrowRight /></el-icon>
            <el-icon :size="12" class="std-grp-icon"><Folder /></el-icon>
            <span class="std-grp-name" style="flex: 1">{{ n.node.name }}</span>
            <span class="ont-tag">{{ n.count }}</span>
            <el-dropdown trigger="click" @command="(cmd: string) => onRowCmd(cmd, n.node)" @click.stop>
              <el-button size="small" text :icon="MoreFilled" @click.stop />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="addChildGroup">新增子分组</el-dropdown-item>
                  <el-dropdown-item command="addChildAttr">新增属性</el-dropdown-item>
                  <el-dropdown-item command="rename">重命名</el-dropdown-item>
                  <el-dropdown-item command="remove" divided>删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </span>
        </div>
        <div
          v-else-if="n.kind === 'root'"
          class="std-row std-row-group std-row-root"
          :class="{ 'drag-over': dragOver === 'root' }"
          @dragover.prevent.stop="dragOver = 'root'"
          @dragleave="dragOver = ''"
          @drop.stop="onDropRoot($event)"
        >
          <span class="std-row-inner">
            <span class="std-grp-name" style="flex: 1">未分组</span>
            <span class="ont-tag">{{ n.count }}</span>
          </span>
        </div>
        <div
          v-else
          class="std-row std-row-attr"
          :style="{ paddingLeft: 10 + n.depth * 14 + 'px' }"
          draggable="true"
          @dragstart="onDragStart($event, `attr:${n.node.id}`)"
        >
          <span class="std-row-inner">
            <el-input v-model="n.node.key" size="small" class="dw-mono std-in-key" placeholder="key" />
            <el-input v-model="n.node.value" size="small" class="std-in-value" placeholder="value" />
            <el-input v-model="n.node.description" size="small" class="std-in-def" placeholder="def（描述）" />
            <el-button size="small" text type="danger" :icon="Delete" @click="removeNode(n.node)" />
          </span>
        </div>
      </template>
      <div v-if="!visibleNodes.some((n) => n.kind === 'attr') && !loading" class="ont-empty" style="padding: 24px">
        暂无标准属性；点「新增」创建分组或属性
      </div>
    </div>

    <footer class="std-footer">
      <span class="ont-hint">修改后点「保存全部」；属性 key 是本体字段 refAttr 的引用标识；分组下的子属性 value 即枚举取值</span>
      <el-button type="primary" size="small" :loading="saving" @click="saveAll">保存全部</el-button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus, Delete, MoreFilled, ArrowRight, Folder } from '@element-plus/icons-vue';
import { api } from '../api/client';

interface StdNode {
  id: string;
  kind: 'group' | 'attr';
  parentId: string | null;
  key: string;
  name: string;
  value: string;
  dataType: string;
  description: string;
  children: StdNode[];
}

const tree = ref<StdNode[]>([]);
const loading = ref(false);
const saving = ref(false);
const keyword = ref('');
const folded = ref(new Set<string>());
const dragOver = ref('');

async function load() {
  loading.value = true;
  const res = await api.get<StdNode[]>('/std-attributes');
  loading.value = false;
  if ('error' in res) return ElMessage.error(res.error);
  tree.value = res.data || [];
}

type VisNode =
  | { key: string; kind: 'group'; id: string; node: StdNode; depth: number; count: number }
  | { key: string; kind: 'root'; count: number }
  | { key: string; kind: 'attr'; node: StdNode; depth: number };

const visibleNodes = computed<VisNode[]>(() => {
  const k = keyword.value.trim().toLowerCase();
  const hit = (n: StdNode): boolean =>
    !k || [n.key, n.name, n.value, n.description].some((x) => (x || '').toLowerCase().includes(k)) || n.children.some(hit);
  const countAll = (n: StdNode): number => n.children.reduce((acc, c) => acc + countAll(c), n.children.length);

  const out: VisNode[] = [];
  const walk = (nodes: StdNode[], depth: number) => {
    for (const n of nodes) {
      if (n.kind === 'attr') { out.push({ key: `a:${n.id}`, kind: 'attr', node: n, depth }); continue; }
      if (!hit(n)) continue;
      out.push({ key: `g:${n.id}`, kind: 'group', id: n.id, node: n, depth, count: countAll(n) });
      if (folded.value.has(n.id)) continue;
      walk(n.children, depth + 1);
    }
  };
  walk(tree.value, 0);
  const rootAttrs = tree.value.filter((n) => n.kind === 'attr');
  out.push({ key: 'root', kind: 'root', count: rootAttrs.length });
  for (const a of rootAttrs) out.push({ key: `a:${a.id}`, kind: 'attr', node: a, depth: 1 });
  return out;
});

function toggleFold(id: string) {
  const s = new Set(folded.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  folded.value = s;
}

function onAddCmd(cmd: string) {
  void addNode(cmd === 'group' ? 'group' : 'attr', null);
}

async function addNode(kind: 'group' | 'attr', parentId: string | null) {
  try {
    const { value } = await ElMessageBox.prompt(
      kind === 'group' ? '输入分组名称（可在分组下再建分组/属性）' : '输入属性 key（小写下划线，如 conv_status）',
      kind === 'group' ? '新增分组' : '新增属性',
      { confirmButtonText: '创建', cancelButtonText: '取消', inputPlaceholder: kind === 'group' ? '如 交易域' : 'conv_status' },
    );
    const res = await api.post('/std-attributes', kind === 'group'
      ? { kind: 'group', name: value, parentId }
      : { kind: 'attr', key: value, parentId });
    if ('error' in res) return ElMessage.error(res.error);
    await load();
    ElMessage.success('已创建');
  } catch { /* 取消 */ }
}

function onRowCmd(cmd: string, node: StdNode) {
  if (cmd === 'addChildGroup') void addNode('group', node.id);
  else if (cmd === 'addChildAttr') void addNode('attr', node.id);
  else if (cmd === 'rename') void renameNode(node);
  else if (cmd === 'remove') void removeNode(node);
}

async function renameNode(node: StdNode) {
  try {
    const { value } = await ElMessageBox.prompt('输入新名称', '重命名分组', {
      confirmButtonText: '保存', cancelButtonText: '取消', inputValue: node.name,
    });
    const res = await api.patch(`/std-attributes/${node.id}`, { name: value });
    if ('error' in res) return ElMessage.error(res.error);
    await load();
  } catch { /* 取消 */ }
}

async function removeNode(node: StdNode) {
  try {
    await ElMessageBox.confirm(`删除「${node.kind === 'group' ? node.name : node.key}」？其子节点将上提一级。`, '提示', { type: 'warning' });
    const res = await api.delete(`/std-attributes/${node.id}`);
    if ('error' in res) return ElMessage.error(res.error);
    await load();
    ElMessage.success('已删除');
  } catch { /* 取消 */ }
}

// ===== 保存全部：按树序逐节点 PATCH =====
async function saveAll() {
  saving.value = true;
  try {
    const put = async (n: StdNode): Promise<boolean> => {
      const body = n.kind === 'group' ? { name: n.name } : { key: n.key, value: n.value, description: n.description };
      const res = await api.patch(`/std-attributes/${n.id}`, body);
      if ('error' in res) { ElMessage.error(res.error); return false; }
      for (const c of n.children) { if (!(await put(c))) return false; }
      return true;
    };
    for (const root of tree.value) { if (!(await put(root))) return; }
    ElMessage.success('标准属性已保存');
    await load();
  } finally {
    saving.value = false;
  }
}

// ===== 拖拽：属性/分组拖入分组（或未分组） =====
function onDragStart(e: DragEvent, payload: string) {
  e.dataTransfer?.setData('text/std-node', payload);
}
async function onDrop(e: DragEvent, parentId: string | null) {
  dragOver.value = '';
  const payload = e.dataTransfer?.getData('text/std-node');
  if (!payload) return;
  const id = payload.split(':')[1];
  try {
    const res = await api.patch(`/std-attributes/${id}`, { parentId });
    if ('error' in res) return ElMessage.error(res.error);
    await load();
  } catch { /* 拖拽失败静默 */ }
}
function onDropRoot(e: DragEvent) {
  dragOver.value = '';
  const payload = e.dataTransfer?.getData('text/std-node');
  if (payload) void onDrop(e, null);
}

onMounted(() => { void load(); });
</script>

<style scoped>
.std-tree { display: flex; flex-direction: column; min-height: 0; height: 100%; }
.std-toolbar { display: flex; gap: 8px; margin-bottom: 8px; }
.std-scroll { flex: 1; min-height: 0; overflow-y: auto; border: 1px solid var(--glass-border); border-radius: 10px; padding: 6px; }
.std-row { border-radius: 8px; min-height: 34px; display: flex; align-items: center; margin-bottom: 2px; }
.std-row-inner { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.std-row-group { cursor: pointer; user-select: none; background: rgba(15, 23, 42, 0.02); }
.std-row-group:hover { background: var(--glass-bg-hover); }
.std-row-root { opacity: 0.8; }
.std-fold { color: var(--color-text-secondary); transition: transform 0.15s ease; flex-shrink: 0; }
.std-fold.open { transform: rotate(90deg); }
.std-grp-icon { color: var(--color-text-secondary); flex-shrink: 0; }
.std-grp-name { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.std-row.drag-over { outline: 1.5px dashed var(--color-primary); outline-offset: -2px; background: color-mix(in srgb, var(--color-primary) 8%, transparent); }
.std-in-key { width: 150px; flex-shrink: 0; }
.std-in-value { width: 160px; flex-shrink: 0; }
.std-in-def { flex: 1; min-width: 0; }
.std-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 8px; gap: 10px; }
</style>
