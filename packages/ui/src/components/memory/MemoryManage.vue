<template>
  <div class="memory-manage">
    <!-- 顶部：维度切换 + 工具栏 -->
    <div class="memory-toolbar">
      <el-radio-group v-model="dimension" size="default" @change="onDimensionChange">
        <el-radio-button value="profile">用户个人画像</el-radio-button>
        <el-radio-button value="agent">智能体记忆</el-radio-button>
        <el-radio-button value="session">会话记忆</el-radio-button>
        <el-radio-button value="daily">每日记忆</el-radio-button>
      </el-radio-group>

      <div class="toolbar-right">
        <el-select
          v-if="dimension === 'agent'"
          v-model="agentFilter"
          placeholder="选择智能体"
          style="width: 180px"
          clearable
          @change="onAgentFilterChange"
        >
          <el-option label="全部智能体" value="" />
          <el-option v-for="a in agents" :key="a.id" :label="a.name" :value="a.id" />
        </el-select>

        <el-input
          v-model="keyword"
          placeholder="关键词搜索记忆内容"
          clearable
          style="width: 220px"
          @keyup.enter="onSearch"
        >
          <template #append>
            <el-button :icon="Search" @click="onSearch" />
          </template>
        </el-input>

        <el-button type="primary" :icon="Plus" @click="openCreate">手动新增</el-button>
      </div>
    </div>

    <!-- 手动新增：弹窗。此前为内联展开表单，「手动新增」是取反开关，
         已打开时再点一次会静默关闭并丢弃已输入内容 -->
    <FormDialog
      v-model="showCreateForm"
      title="手动新增记忆"
      width="600px"
      :loading="creating"
      :unsaved-guard="true"
      :dirty="createDirty"
      @submit="submitCreate"
      @closed="onCreateClosed"
    >
      <el-form label-width="90px" class="memory-form">
        <p class="fd-note">{{ dimensionHint }}</p>
        <el-form-item label="内容">
          <el-input
            v-model="createForm.content"
            type="textarea"
            :rows="3"
            placeholder="输入要沉淀的记忆内容（一句话事实或偏好）"
          />
        </el-form-item>
        <el-form-item label="标签">
          <el-input
            v-model="createForm.tags"
            placeholder="多个标签用逗号分隔，如：偏好, 技术"
          />
        </el-form-item>
        <el-form-item v-if="dimension === 'agent'" label="归属智能体">
          <el-select
            v-model="createForm.agentId"
            placeholder="选择智能体（必选）"
            style="width: 260px"
            filterable
          >
            <el-option v-for="a in agents" :key="a.id" :label="a.name" :value="a.id" />
          </el-select>
        </el-form-item>
      </el-form>
    </FormDialog>

    <!-- 编辑记忆：弹窗。此前是 el-table 展开行内编辑，窄屏挤压、且保存后强制跳回第 1 页 -->
    <FormDialog
      v-model="editOpen"
      title="编辑记忆"
      width="600px"
      :loading="saving"
      :unsaved-guard="true"
      :dirty="editDirty"
      @submit="submitEdit"
      @closed="onEditClosed"
    >
      <el-form label-width="70px" class="memory-form">
        <el-form-item label="内容">
          <el-input v-model="editForm.content" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="editForm.tags" placeholder="多个标签用逗号分隔" />
        </el-form-item>
      </el-form>
    </FormDialog>

    <!-- 列表 -->
    <div class="memory-table-wrap glass-sub">
      <div v-if="store.loading" class="table-state"><el-skeleton :rows="4" animated /></div>
      <el-empty
        v-else-if="store.rows.length === 0"
        :description="emptyHint"
        :image-size="80"
      />
      <el-table
        v-else
        :data="store.rows"
        row-key="id"
        size="small"
        class="memory-table"
      >
        <el-table-column label="内容" min-width="280">
          <template #default="{ row }">
            <el-tooltip
              :content="row.content"
              placement="top"
              :disabled="(row.content || '').length <= 80"
              :show-after="200"
            >
              <span class="content-cell">{{ truncate(row.content, 80) }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="标签" min-width="150">
          <template #default="{ row }">
            <div class="tags-cell">
              <template v-if="parseTags(row.tags_json).length > 0">
                <el-tag
                  v-for="t in parseTags(row.tags_json)"
                  :key="t"
                  size="small"
                  type="info"
                  effect="plain"
                >{{ t }}</el-tag>
              </template>
              <span v-else class="muted">—</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">
            <span class="time-cell">{{ formatTime(row.last_used_at || row.created_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="归属智能体" width="140">
          <template #default="{ row }">
            <span v-if="row.agent_id" class="agent-cell">{{ agentName(row.agent_id) }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="startEdit(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分页 -->
    <div v-if="store.total > 0" class="memory-pagination">
      <el-pagination
        :current-page="store.page"
        :page-size="store.pageSize"
        :total="store.total"
        layout="total, prev, pager, next"
        background
        @current-change="onPageChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Plus, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useMemoryStore, useAgentStore } from '../../stores';
import type { MemoryDimension, MemoryRow } from '../../stores/memory';
import FormDialog from '../FormDialog.vue';

const store = useMemoryStore();
const agentStore = useAgentStore();

const dimension = ref<MemoryDimension>('profile');
const agentFilter = ref<string>('');
const keyword = ref<string>('');

const agents = computed(() => agentStore.agents || []);

// 手动新增（弹窗）
const showCreateForm = ref(false);
const creating = ref(false);
const createForm = ref({ content: '', tags: '', agentId: '' });
const createSnap = ref('');
const createDirty = computed(
  () => showCreateForm.value && JSON.stringify(createForm.value) !== createSnap.value,
);

// 编辑（弹窗）
const editOpen = ref(false);
const editingRow = ref<MemoryRow | null>(null);
const saving = ref(false);
const editForm = ref({ content: '', tags: '' });
const editSnap = ref('');
const editDirty = computed(
  () => editOpen.value && JSON.stringify(editForm.value) !== editSnap.value,
);

const dimensionHint = computed(() => {
  switch (dimension.value) {
    case 'profile': return '将作为用户个人画像沉淀（不绑定智能体）';
    case 'agent': return '将绑定到所选智能体，仅该智能体可见';
    case 'session': return '会话级记忆，跨会话不保留上下文';
    case 'daily': return '每日记忆，按日期沉淀';
    default: return '';
  }
});

const emptyHint = computed(() => {
  if (keyword.value.trim()) return '没有匹配的记忆';
  return '暂无记忆，对话中自动沉淀或点击「手动新增」';
});

function truncate(s: string, n: number): string {
  const t = s || '';
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function parseTags(raw: unknown): string[] {
  if (!raw) return [];
  try {
    if (typeof raw === 'string') {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.map(String) : [];
    }
    if (Array.isArray(raw)) return raw.map(String);
  } catch {
    return [];
  }
  return [];
}

function formatTime(t: unknown): string {
  if (!t) return '—';
  try {
    const d = new Date(t as any);
    if (isNaN(d.getTime())) return String(t);
    return d.toLocaleString();
  } catch {
    return String(t);
  }
}

function agentName(id: string): string {
  const a = agents.value.find((x) => x.id === id);
  return a?.name || id;
}

/** keepPage：新增/编辑后就地刷新，不把用户从第 N 页踢回第 1 页 */
async function reload(keepPage = false) {
  try {
    await store.loadMemories({
      dimension: dimension.value,
      agentId: agentFilter.value,
      keyword: keyword.value,
      page: keepPage ? store.page : 1,
    });
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '加载记忆失败');
  }
}

function onDimensionChange() {
  // 切换维度：重置智能体筛选与分页
  agentFilter.value = '';
  showCreateForm.value = false;
  editOpen.value = false;
  reload();
}

function onAgentFilterChange() {
  editOpen.value = false;
  reload();
}

function onSearch() {
  editOpen.value = false;
  reload();
}

function onPageChange(p: number) {
  store.loadMemories({
    dimension: dimension.value,
    agentId: agentFilter.value,
    keyword: keyword.value,
    page: p,
  }).catch((e: unknown) => ElMessage.error(e instanceof Error ? e.message : '加载记忆失败'));
}

// ── 手动新增 ──
function openCreate() {
  // 不再取反：弹窗已打开时再点「手动新增」保持打开，
  // 避免旧实现里静默关闭并丢弃已输入内容
  if (showCreateForm.value) return;
  createForm.value = { content: '', tags: '', agentId: agentFilter.value || '' };
  createSnap.value = JSON.stringify(createForm.value);
  showCreateForm.value = true;
}

function onCreateClosed() {
  creating.value = false;
}

/** 维度 → 落库 type/agentId 映射（方案A）：profile/agent 都写 type=agent，profile 不传 agentId。 */
function buildCreateBody(): { content: string; type: string; agentId?: string; tags?: string[] } {
  const content = createForm.value.content.trim();
  const tags = createForm.value.tags
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (dimension.value === 'profile') {
    return { content, type: 'agent', tags: tags.length ? tags : undefined };
  }
  if (dimension.value === 'agent') {
    return { content, type: 'agent', agentId: createForm.value.agentId, tags: tags.length ? tags : undefined };
  }
  if (dimension.value === 'session') {
    return { content, type: 'session', tags: tags.length ? tags : undefined };
  }
  return { content, type: 'daily', tags: tags.length ? tags : undefined };
}

async function submitCreate() {
  if (!createForm.value.content.trim()) {
    ElMessage.warning('请输入记忆内容');
    return;
  }
  if (dimension.value === 'agent' && !createForm.value.agentId) {
    ElMessage.warning('请选择归属智能体');
    return;
  }
  creating.value = true;
  try {
    await store.createMemory(buildCreateBody());
    ElMessage.success('已新增记忆');
    showCreateForm.value = false;
    await reload(true);
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '新增失败');
  } finally {
    creating.value = false;
  }
}

// ── 编辑 ──
function startEdit(row: MemoryRow) {
  editingRow.value = row;
  editForm.value = {
    content: row.content || '',
    tags: parseTags(row.tags_json).join(', '),
  };
  editSnap.value = JSON.stringify(editForm.value);
  editOpen.value = true;
}

function onEditClosed() {
  editingRow.value = null;
  saving.value = false;
}

async function submitEdit() {
  const row = editingRow.value;
  if (!row) return;
  if (!editForm.value.content.trim()) {
    ElMessage.warning('内容不能为空');
    return;
  }
  saving.value = true;
  try {
    const tags = editForm.value.tags
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await store.updateMemory(row.id, {
      content: editForm.value.content.trim(),
      tags,
    });
    ElMessage.success('已更新');
    editOpen.value = false;
    await reload(true);
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '更新失败');
  } finally {
    saving.value = false;
  }
}

// ── 删除 ──
async function removeRow(row: MemoryRow) {
  try {
    await ElMessageBox.confirm('确认删除该条记忆？删除后不可恢复。', '删除记忆', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    await store.deleteMemory(row.id);
    ElMessage.success('已删除');
    if (editingRow.value?.id === row.id) {
      editingRow.value = null;
      editOpen.value = false;
    }
    // 删除后若当前页空了，回退一页
    if (store.rows.length <= 1 && store.page > 1) {
      await store.loadMemories({
        dimension: dimension.value,
        agentId: agentFilter.value,
        keyword: keyword.value,
        page: store.page - 1,
      });
    } else {
      await reload();
    }
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '删除失败');
  }
}

onMounted(async () => {
  // 确保智能体列表可用（智能体筛选下拉 + 归属智能体名映射）
  if (!agentStore.agents.length) {
    try { await agentStore.loadAgents(); } catch { /* 静默 */ }
  }
  await reload();
});
</script>

<style scoped>
.memory-manage {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.memory-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* 内联表单 / 列表容器：glass 风格 */
.glass-sub {
  background: var(--glass-bg, rgba(255, 255, 255, 0.6));
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md, 12px);
  padding: 14px 16px;
}

/* 弹窗内的维度说明（承接原内联表单头部的 hint） */
.fd-note {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.memory-form {
  max-width: 640px;
}

/* 列表 */
.memory-table-wrap {
  padding: 12px;
  min-height: 200px;
}

.table-state {
  padding: 8px 4px;
}

.content-cell {
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text);
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tags-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.time-cell,
.agent-cell {
  font-size: 12.5px;
  color: var(--color-text);
}

.muted {
  color: var(--color-text-secondary);
  font-size: 12px;
}

/* 分页 */
.memory-pagination {
  display: flex;
  justify-content: flex-end;
  padding: 4px 0;
}

@media (max-width: 767px) {
  .memory-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .toolbar-right {
    justify-content: flex-start;
  }
  .memory-form {
    max-width: 100%;
  }
}
</style>