<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">知识库</h2>
        <div class="page-sub">管理文档切片，按关键词检索知识内容</div>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建知识库</el-button>
    </header>

    <div class="knowledge-layout">
      <aside class="kb-list glass-card">
        <div class="panel-head">
          <span>知识库</span>
          <el-button link type="primary" :icon="Refresh" @click="loadBases" />
        </div>
        <div v-if="loading" class="panel-state">
          <el-skeleton :rows="5" animated />
        </div>
        <el-empty v-else-if="bases.length === 0" description="还没有知识库" :image-size="64" />
        <button
          v-for="kb in bases"
          :key="kb.id"
          class="kb-item"
          :class="{ active: selectedId === kb.id }"
          type="button"
          @click="selectBase(kb.id)"
        >
          <span class="kb-item-title">{{ kb.name }}</span>
          <span class="kb-item-desc">{{ kb.description || '无描述' }}</span>
        </button>
      </aside>

      <section class="kb-detail glass-card">
        <template v-if="!selected">
          <el-empty description="选择或新建一个知识库" />
        </template>
        <template v-else>
          <div class="detail-head">
            <div>
              <div class="detail-title">{{ selected.name }}</div>
              <div class="detail-desc">{{ selected.description || '无描述' }}</div>
            </div>
            <div class="detail-actions">
              <el-button size="small" :icon="Edit" @click="openEdit">编辑</el-button>
              <el-button size="small" type="danger" :icon="Delete" @click="removeBase">删除</el-button>
            </div>
          </div>

          <div class="search-row">
            <el-input
              v-model="query"
              clearable
              placeholder="输入关键词搜索知识片段"
              @keyup.enter="search"
            >
              <template #append>
                <el-button :icon="Search" @click="search" />
              </template>
            </el-input>
          </div>

          <div class="doc-toolbar">
            <span class="section-label">文档</span>
            <el-button size="small" type="primary" :icon="Plus" @click="openAddDoc">添加文档</el-button>
          </div>

          <div v-if="docLoading" class="panel-state">
            <el-skeleton :rows="4" animated />
          </div>
          <el-empty v-else-if="docs.length === 0" description="还没有文档" :image-size="60" />
          <div v-else class="doc-list">
            <div v-for="doc in docs" :key="doc.id" class="doc-item">
              <div class="doc-info">
                <span class="doc-name">{{ doc.name }}</span>
                <span class="doc-meta">{{ doc.createdAt ? new Date(doc.createdAt).toLocaleString() : '' }}</span>
              </div>
              <el-button link type="danger" :icon="Delete" @click="removeDoc(doc.id)" />
            </div>
          </div>

          <div v-if="results.length > 0" class="results">
            <span class="section-label">检索结果</span>
            <div v-for="chunk in results" :key="chunk.id" class="result-item">
              <span class="result-index">#{{ chunk.chunkIndex }}</span>
              <p class="result-text">{{ chunk.content }}</p>
            </div>
          </div>
        </template>
      </section>
    </div>

    <el-dialog v-model="showBaseDialog" :title="editingBase ? '编辑知识库' : '新建知识库'" width="480px">
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="baseForm.name" placeholder="如：产品资料库" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="baseForm.description" type="textarea" :rows="3" placeholder="可选" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBaseDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveBase">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDocDialog" title="添加文档" width="560px">
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="docForm.name" placeholder="文档名称" /></el-form-item>
        <el-form-item label="内容">
          <el-input v-model="docForm.content" type="textarea" :rows="8" placeholder="粘贴文档正文，系统会自动切分" />
        </el-form-item>
        <el-form-item label="来源路径"><el-input v-model="docForm.sourcePath" placeholder="可选，本地文件路径" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDocDialog = false">取消</el-button>
        <el-button type="primary" :loading="savingDoc" @click="saveDoc">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Plus, Refresh, Edit, Delete, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api/client';

const bases = ref<any[]>([]);
const selected = ref<any | null>(null);
const selectedId = ref('');
const docs = ref<any[]>([]);
const results = ref<any[]>([]);
const loading = ref(false);
const docLoading = ref(false);
const query = ref('');

const showBaseDialog = ref(false);
const showDocDialog = ref(false);
const saving = ref(false);
const savingDoc = ref(false);
const editingBase = ref<string | null>(null);
const baseForm = ref({ name: '', description: '' });
const docForm = ref({ name: '', content: '', sourcePath: '' });

onMounted(loadBases);

async function loadBases() {
  loading.value = true;
  const res = await api.get<any[]>('/kb');
  loading.value = false;
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  bases.value = res.data || [];
  if (!selected.value && bases.value[0]) selectBase(bases.value[0].id);
}

async function selectBase(id: string) {
  selectedId.value = id;
  const res = await api.get<any>(`/kb/${id}`);
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  selected.value = res.data;
  docs.value = [];
  results.value = [];
  query.value = '';
  await loadDocs(id);
}

async function loadDocs(baseId: string) {
  docLoading.value = true;
  const res = await api.get<any[]>(`/kb/${baseId}/documents`);
  docLoading.value = false;
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  docs.value = res.data || [];
}

function openCreate() {
  editingBase.value = null;
  baseForm.value = { name: '', description: '' };
  showBaseDialog.value = true;
}

function openEdit() {
  if (!selected.value) return;
  editingBase.value = selected.value.id;
  baseForm.value = { name: selected.value.name, description: selected.value.description || '' };
  showBaseDialog.value = true;
}

async function saveBase() {
  if (!baseForm.value.name.trim()) {
    ElMessage.warning('请输入名称');
    return;
  }
  saving.value = true;
  const body = { name: baseForm.value.name, description: baseForm.value.description };
  const res = editingBase.value
    ? await api.patch<any>(`/kb/${editingBase.value}`, body)
    : await api.post<any>('/kb', body);
  saving.value = false;
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  ElMessage.success(editingBase.value ? '已更新' : '已创建');
  showBaseDialog.value = false;
  await loadBases();
  if (editingBase.value) {
    selected.value = res.data;
    await loadDocs(editingBase.value);
  }
  editingBase.value = null;
}

async function removeBase() {
  if (!selected.value) return;
  try {
    await ElMessageBox.confirm('删除知识库会同时删除文档和切片，确认？', '提示', { type: 'warning' });
  } catch {
    return;
  }
  const res = await api.delete<any>(`/kb/${selected.value.id}`);
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  ElMessage.success('已删除');
  selected.value = null;
  selectedId.value = '';
  docs.value = [];
  results.value = [];
  await loadBases();
}

function openAddDoc() {
  docForm.value = { name: '', content: '', sourcePath: '' };
  showDocDialog.value = true;
}

async function saveDoc() {
  if (!selected.value) return;
  if (!docForm.value.name.trim()) {
    ElMessage.warning('请输入文档名称');
    return;
  }
  if (!docForm.value.content.trim() && !docForm.value.sourcePath.trim()) {
    ElMessage.warning('请填写内容或来源路径');
    return;
  }
  savingDoc.value = true;
  const res = await api.post<any>(`/kb/${selected.value.id}/documents`, {
    name: docForm.value.name,
    content: docForm.value.content || undefined,
    sourcePath: docForm.value.sourcePath || undefined,
  });
  savingDoc.value = false;
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  ElMessage.success(`已添加，切分 ${res.data.chunkCount || 0} 个片段`);
  showDocDialog.value = false;
  await loadDocs(selected.value.id);
}

async function removeDoc(docId: string) {
  try {
    await ElMessageBox.confirm('确认删除该文档？', '提示', { type: 'warning' });
  } catch {
    return;
  }
  const res = await api.delete<any>(`/kb/documents/${docId}`);
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  ElMessage.success('已删除');
  if (selected.value) await loadDocs(selected.value.id);
}

async function search() {
  if (!selected.value || !query.value.trim()) return;
  const res = await api.get<any[]>(`/kb/${selected.value.id}/search?query=${encodeURIComponent(query.value.trim())}&topK=8`);
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  results.value = res.data || [];
  if (results.value.length === 0) ElMessage.info('没有匹配的知识片段');
}
</script>

<style scoped>
.knowledge-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  min-height: 0;
}

.kb-list,
.kb-detail {
  min-height: 420px;
  border-radius: var(--radius-md);
  padding: 16px;
}

.kb-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-head,
.detail-head,
.doc-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-head {
  font-size: 14px;
  font-weight: 600;
}

.panel-state {
  padding: 16px 0;
}

.kb-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  padding: 12px;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition: all 0.18s ease;
}

.kb-item:hover {
  background: var(--glass-bg-hover);
}

.kb-item.active {
  border-color: var(--color-primary);
  background: rgba(124, 58, 237, 0.08);
}

.kb-item-title {
  font-weight: 600;
}

.kb-item-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.detail-title {
  font-size: 18px;
  font-weight: 700;
}

.detail-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.detail-actions {
  display: flex;
  gap: 6px;
}

.search-row {
  margin: 16px 0 14px;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.doc-list,
.results {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.doc-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 12px;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
}

.doc-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.doc-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-meta {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.results {
  margin-top: 22px;
}

.result-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: rgba(124, 58, 237, 0.05);
  border-radius: 10px;
}

.result-index {
  flex-shrink: 0;
  color: var(--color-primary);
  font-weight: 700;
}

.result-text {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.6;
}

@media (max-width: 767px) {
  .knowledge-layout {
    grid-template-columns: 1fr;
  }
  .kb-list,
  .kb-detail {
    min-height: 0;
  }
}
</style>
