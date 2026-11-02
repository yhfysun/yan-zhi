<template>
  <div class="std-tree" v-loading="loading">
    <div class="std-toolbar">
      <el-input v-model="keyword" size="small" clearable :prefix-icon="Search" placeholder="搜索 key / 值 / 描述 / 分组" />
      <el-radio-group v-model="viewMode" size="small" @change="onModeChange">
        <el-radio-button value="table">表格</el-radio-button>
        <el-radio-button value="json">JSON</el-radio-button>
      </el-radio-group>
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

    <div v-if="viewMode === 'table'" class="std-scroll" @drop="onDropRoot" @dragover.prevent>
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
            <el-button size="small" text @click="openEnum(n.node)">枚举</el-button>
            <el-button size="small" text type="danger" :icon="Delete" @click="removeNode(n.node)" />
          </span>
        </div>
      </template>
      <div v-if="!visibleNodes.some((n) => n.kind === 'attr') && !loading" class="ont-empty" style="padding: 24px">
        暂无标准属性；点「新增」创建分组或属性
      </div>
    </div>

    <div v-else class="std-json">
      <el-input v-model="jsonText" type="textarea" :rows="18" class="dw-mono" spellcheck="false" placeholder="属性数组 JSON" />
    </div>

    <footer class="std-footer">
      <span class="ont-hint">
        {{ viewMode === 'json'
          ? 'JSON 模式可批量改 key/名称/值/描述/同义词/枚举与枚举来源；新增节点请用表格模式。'
          : '修改后点「保存全部」；属性 key 是本体字段 refAttr 的引用标识；点「枚举」配置取值来源。' }}
      </span>
      <el-button v-if="viewMode === 'json'" type="primary" size="small" :loading="saving" @click="applyJson">应用 JSON</el-button>
      <el-button v-else type="primary" size="small" :loading="saving" @click="saveAll">保存全部</el-button>
    </footer>

    <!-- 枚举取值 -->
    <el-dialog v-model="enumOpen" :title="`枚举 · ${enumNode?.key || ''}`" width="620px">
      <template v-if="enumNode">
        <el-form label-width="90px" size="small">
          <el-form-item label="来源">
            <el-radio-group v-model="enumForm.source">
              <el-radio-button value="manual">手填 / JSON</el-radio-button>
              <el-radio-button value="sql">SQL 字典</el-radio-button>
              <el-radio-button value="distinct">DISTINCT 采样</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <template v-if="enumForm.source !== 'manual'">
            <el-form-item label="数据源">
              <el-select v-model="enumForm.datasourceId" placeholder="选择数据源" style="width: 100%">
                <el-option v-for="d in datasources" :key="d.id" :label="d.name" :value="d.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="SELECT">
              <el-input v-model="enumForm.sql" type="textarea" :rows="4" class="dw-mono" spellcheck="false" placeholder="只读 SELECT，首列作为取值，如 SELECT DISTINCT status FROM orders" />
            </el-form-item>
            <el-form-item label=" ">
              <el-button size="small" :loading="enumPreviewing" @click="previewEnumValues">预览</el-button>
              <span class="ont-hint" style="margin-left: 8px">{{ enumPreview.length ? `命中 ${enumPreview.length} 个取值` : '' }}</span>
            </el-form-item>
          </template>
          <el-form-item label="取值">
            <el-input v-model="enumForm.text" type="textarea" :rows="5" placeholder="每行一个取值（也可直接粘 JSON 数组）" />
            <div class="ont-hint" style="margin-top: 4px">保存后作为该属性的枚举，供智能体与本体字段引用。</div>
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button size="small" @click="enumOpen = false">取消</el-button>
        <el-button size="small" type="primary" :loading="enumSaving" @click="saveEnum">保存</el-button>
      </template>
    </el-dialog>
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
  synonyms: string[];
  enums: string[];
  enumSource: 'manual' | 'sql' | 'distinct';
  enumSql: string;
  enumDatasourceId: string;
  children: StdNode[];
}

const tree = ref<StdNode[]>([]);
const loading = ref(false);
const saving = ref(false);
const keyword = ref('');
const folded = ref(new Set<string>());
const dragOver = ref('');

// ===== 表格 / JSON 双模式 =====
const viewMode = ref<'table' | 'json'>('table');
const jsonText = ref('');

function flattenAttrs(nodes: StdNode[], out: StdNode[] = []): StdNode[] {
  for (const n of nodes) {
    if (n.kind === 'attr') out.push(n);
    flattenAttrs(n.children, out);
  }
  return out;
}

function toJsonRows(): unknown[] {
  return flattenAttrs(tree.value).map((n) => ({
    id: n.id, key: n.key, name: n.name, value: n.value, description: n.description,
    synonyms: n.synonyms || [], enums: n.enums || [],
    enumSource: n.enumSource || 'manual', enumSql: n.enumSql || '', enumDatasourceId: n.enumDatasourceId || '',
  }));
}

function onModeChange(): void {
  if (viewMode.value === 'json') jsonText.value = JSON.stringify(toJsonRows(), null, 2);
}

async function applyJson(): Promise<void> {
  let rows: any[];
  try {
    const parsed = JSON.parse(jsonText.value);
    if (!Array.isArray(parsed)) throw new Error('顶层必须是数组');
    rows = parsed;
  } catch (e) {
    ElMessage.error(`JSON 解析失败：${(e as Error).message}`);
    return;
  }
  saving.value = true;
  try {
    let n = 0;
    for (const r of rows) {
      if (!r || typeof r.id !== 'string') continue;
      const body: Record<string, unknown> = {};
      for (const k of ['key', 'name', 'value', 'description', 'enumSource', 'enumSql', 'enumDatasourceId'] as const) {
        if (r[k] !== undefined) body[k] = r[k];
      }
      if (Array.isArray(r.synonyms)) body.synonyms = r.synonyms.map(String);
      if (Array.isArray(r.enums)) body.enums = r.enums.map(String);
      if (!Object.keys(body).length) continue;
      const res = await api.patch(`/std-attributes/${r.id}`, body);
      if ('error' in res) { ElMessage.error(`保存 ${r.key || r.id} 失败：${res.error}`); return; }
      n += 1;
    }
    ElMessage.success(`已应用 ${n} 条属性`);
    await load();
    onModeChange();
  } finally {
    saving.value = false;
  }
}

// ===== 枚举配置 =====
interface DataSourceLite { id: string; name: string }
const datasources = ref<DataSourceLite[]>([]);
const enumOpen = ref(false);
const enumNode = ref<StdNode | null>(null);
const enumPreview = ref<string[]>([]);
const enumPreviewing = ref(false);
const enumSaving = ref(false);
const enumForm = ref({ source: 'manual' as 'manual' | 'sql' | 'distinct', datasourceId: '', sql: '', text: '' });

async function loadDatasources(): Promise<void> {
  if (datasources.value.length) return;
  const res = await api.get<DataSourceLite[]>('/datasources');
  if (!('error' in res)) datasources.value = res.data || [];
}

async function openEnum(node: StdNode): Promise<void> {
  enumNode.value = node;
  enumForm.value = {
    source: node.enumSource || 'manual',
    datasourceId: node.enumDatasourceId || '',
    sql: node.enumSql || '',
    text: (node.enums || []).join('\n'),
  };
  enumPreview.value = [];
  enumOpen.value = true;
  await loadDatasources();
}

async function previewEnumValues(): Promise<void> {
  enumPreviewing.value = true;
  try {
    const res = await api.post<{ values: string[] }>('/std-attributes/preview-enum', {
      datasourceId: enumForm.value.datasourceId,
      sql: enumForm.value.sql,
      source: enumForm.value.source,
    });
    if ('error' in res) { ElMessage.error(res.error); return; }
    enumPreview.value = res.data.values || [];
    enumForm.value.text = enumPreview.value.join('\n');
  } finally {
    enumPreviewing.value = false;
  }
}

function parseEnumText(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  if (t.startsWith('[')) {
    try {
      const v = JSON.parse(t);
      return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
    } catch { /* 按行解析 */ }
  }
  return t.split(/[\n,，]/).map((s) => s.trim()).filter(Boolean);
}

async function saveEnum(): Promise<void> {
  if (!enumNode.value) return;
  enumSaving.value = true;
  try {
    const res = await api.patch(`/std-attributes/${enumNode.value.id}`, {
      enums: parseEnumText(enumForm.value.text),
      enumSource: enumForm.value.source,
      enumSql: enumForm.value.sql,
      enumDatasourceId: enumForm.value.datasourceId,
    });
    if ('error' in res) { ElMessage.error(res.error); return; }
    enumOpen.value = false;
    ElMessage.success('枚举已保存');
    await load();
  } finally {
    enumSaving.value = false;
  }
}

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
    await ElMessageBox.confirm(`删除「${node.kind === 'group' ? node.name : node.key}」？其子节点将上提一级。`, '提示', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' });
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
.std-json { flex: 1; min-height: 0; display: flex; }
.std-row { border-radius: 8px; min-height: 34px; display: flex; align-items: center; margin-bottom: 2px; }
.std-row-inner { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.std-row-group { cursor: pointer; user-select: none; background: color-mix(in srgb, var(--color-text) 2%, transparent); }
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
