<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">知识库</h2>
        <div class="page-sub">管理文档切片，按关键词检索知识内容</div>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建知识库</el-button>
    </header>

    <!-- 全局 Embedding 模型配置 -->
    <div class="embedding-config-bar glass-card">
      <div class="embedding-config-left">
        <el-icon><Histogram /></el-icon>
        <span class="embedding-config-title">向量模型</span>
        <el-select
          v-model="currentEmbeddingModel"
          size="small"
          style="width: 280px"
          :loading="embeddingLoading"
          placeholder="未选择（兜底 Ollama）"
          @change="switchEmbeddingModel"
        >
          <el-option-group v-for="g in embeddingGroups" :key="g.platformId" :label="g.platformName">
            <el-option
              v-for="m in g.models"
              :key="`${g.platformId}:${m.id}`"
              :label="m.alias || m.model_id"
              :value="`${g.platformId}:${m.id}`"
            />
          </el-option-group>
        </el-select>
        <span class="embedding-config-hint">{{ currentEmbeddingDesc }}</span>
      </div>
      <div class="embedding-config-right">
        <el-button
          size="small"
          type="warning"
          plain
          :loading="revectorizing"
          :disabled="revectorizing"
          @click="triggerRevectorize"
        >
          重新向量化
        </el-button>
        <span v-if="revectorizing && revectorizeProgress.total > 0" class="revectorize-progress">
          {{ revectorizeProgress.done }} / {{ revectorizeProgress.total }}
        </span>
      </div>
    </div>

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
          <span class="kb-item-title" style="font-size:11px;font-weight:400;margin-left:auto">
            <span v-if="kb.visibility === 'public'" class="badge-public">公开</span>
            <span v-else class="badge-private">私有</span>
          </span>
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
              <el-button v-if="authStore.isLoggedIn && selected && selected.visibility !== 'public'" size="small" type="primary" plain :icon="Share" @click="publishBase" title="发布为公开共享，所有人可见">发布</el-button>
              <!-- 内置「应用使用说明」：仅提供恢复默认，编辑文档方式和普通库一致，不允许删除 -->
              <el-button v-if="isBuiltin" size="small" type="warning" plain :icon="Refresh" @click="resetBuiltinGuide">恢复默认</el-button>
              <template v-if="!isBuiltin">
                <el-button size="small" :icon="Edit" @click="openEdit">编辑</el-button>
                <el-button size="small" type="danger" :icon="Delete" @click="removeBase">删除</el-button>
              </template>
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

          <el-tabs v-model="activeTab" class="kb-tabs">
            <el-tab-pane label="文档" name="docs">
              <div class="doc-explorer">
                <div class="doc-tree-panel">
                  <div class="doc-tree-toolbar">
                    <span class="section-label">文档列表</span>
                    <el-button size="small" type="primary" :icon="Plus" @click="openAddDoc">添加文档</el-button>
                  </div>
                  <div v-if="docLoading" class="panel-state"><el-skeleton :rows="5" animated /></div>
                  <el-empty v-else-if="docs.length === 0" description="还没有文档，点击右上角添加" :image-size="60" />
                  <div v-else class="doc-tree-body">
                    <div
                      v-for="doc in docs"
                      :key="doc.id"
                      class="doc-tree-item"
                      :class="{ active: selectedDocId === doc.id }"
                      @click="selectDoc(doc)"
                    >
                      <el-icon class="doc-tree-icon"><Document /></el-icon>
                      <span class="doc-tree-name">{{ doc.name }}</span>
                      <span class="doc-tree-chunk-count">{{ docChunksMap[doc.id]?.items.length ?? '—' }} 片</span>
                    </div>
                  </div>
                </div>
                <div class="doc-preview-panel">
                  <el-empty v-if="!selectedDoc" description="点击左侧文档查看预览" :image-size="80" />
                  <template v-else>
                    <div class="doc-preview-head">
                      <div class="doc-preview-info">
                        <div class="doc-preview-title">{{ selectedDoc.name }}</div>
                        <div class="doc-preview-meta">
                          <span>{{ docChunksMap[selectedDoc.id]?.items.length ?? 0 }} 个分片</span>
                          <span v-if="selectedDoc.createdAt"> · {{ new Date(selectedDoc.createdAt).toLocaleString() }}</span>
                        </div>
                      </div>
                      <el-button size="small" type="danger" :icon="Delete" @click="removeDoc(selectedDoc.id)">删除</el-button>
                    </div>
                    <div class="doc-preview-body">
                      <div v-if="docChunksMap[selectedDoc.id]?.loading" class="panel-state">
                        <el-skeleton :rows="6" animated />
                      </div>
                      <el-empty v-else-if="docChunksMap[selectedDoc.id] && docChunksMap[selectedDoc.id].items.length === 0" description="该文档暂无分片内容" :image-size="60" />
                      <div v-else-if="docChunksMap[selectedDoc.id]" class="doc-preview-chunks">
                        <div v-for="c in docChunksMap[selectedDoc.id].items" :key="c.id" class="doc-preview-chunk">
                          <span class="doc-preview-chunk-index">分片 {{ c.chunkIndex }}</span>
                          <p class="doc-preview-chunk-text">{{ c.content }}</p>
                        </div>
                      </div>
                      <div v-else class="panel-state"><el-skeleton :rows="3" animated /></div>
                    </div>
                  </template>
                </div>
              </div>
            </el-tab-pane>

            <el-tab-pane label="关系图谱" name="graph">
              <KbGraph :base-id="selected.id" />
            </el-tab-pane>

            <el-tab-pane label="分片列表" name="chunks">
              <div class="chunk-tab-toolbar">
                <el-button size="small" :icon="Share" :loading="chunkLoading" @click="loadChunks(selected.id)">
                  {{ chunksLoaded ? '刷新分片' : '查看分片' }}
                </el-button>
              </div>
              <div v-if="chunkLoading" class="panel-state"><el-skeleton :rows="4" animated /></div>
              <el-empty v-else-if="chunksLoaded && chunks.length === 0" description="添加文档后会自动切分，分片将显示于此" :image-size="50" />
              <div v-else-if="chunksLoaded" class="chunk-tree">
                <div v-for="group in chunkGroups" :key="group.docId" class="chunk-group">
                  <div class="chunk-group-name" @click="toggleChunkGroup(group.docId)">
                    <el-icon><Folder /></el-icon>
                    <span>{{ group.docName || '(文档)' }}</span>
                    <span class="chunk-count">{{ group.items.length }} 片</span>
                    <el-icon class="chunk-caret">
                      <ArrowDown v-if="expandedChunkGroups.includes(group.docId)" />
                      <ArrowRight v-else />
                    </el-icon>
                  </div>
                  <div v-if="expandedChunkGroups.includes(group.docId)" class="chunk-items">
                    <div v-for="c in group.items" :key="c.id" class="chunk-node">
                      <div class="chunk-node-head" @click="toggleChunk(c.id)">
                        <span class="chunk-node-index">片 {{ c.chunkIndex }}</span>
                        <el-icon class="chunk-caret">
                          <ArrowDown v-if="expandedChunks.includes(c.id)" />
                          <ArrowRight v-else />
                        </el-icon>
                      </div>
                      <div v-if="expandedChunks.includes(c.id)" class="chunk-node-content">{{ c.content }}</div>
                    </div>
                  </div>
                </div>
              </div>
              <el-empty v-else description="点击「查看分片」加载分片列表" :image-size="50" />
            </el-tab-pane>
          </el-tabs>

          <div v-if="results.length > 0" class="results">
            <span class="section-label">检索结果</span>
            <div v-for="chunk in results" :key="chunk.id" class="result-item">
              <span class="result-index">
                #{{ chunk.chunkIndex }}
                <template v-if="chunk.entity">[实体:{{ chunk.entity }}]</template>
                <template v-if="chunk.hop && chunk.hop > 1">{{ chunk.hop }}级关联</template>
                <template v-if="chunk.baseName">· {{ chunk.baseName }}</template>
              </span>
              <p class="result-text">{{ chunk.content }}</p>
              <span v-if="chunk.reason" class="result-reason">{{ chunk.reason }}</span>
            </div>
          </div>
        </template>
      </section>
    </div>

    <el-dialog v-model="showBaseDialog" :title="editingBase ? '编辑知识库' : '新建知识库'" width="480px">
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="baseForm.name" placeholder="如：产品资料库" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="baseForm.description" type="textarea" :rows="3" placeholder="可选" /></el-form-item>
        <el-form-item label="共享级别">
          <!-- 未登录（访客）固定公开共享，不可设私有 -->
          <template v-if="!authStore.isLoggedIn">
            <div class="kb-vis-force">
              <span class="badge-public">公开共享</span>
              <span class="form-tip">访客创建的知识库为「公开共享」（所有人可见、只读）。登录后可将自己创建的库设为私有。</span>
            </div>
          </template>
          <template v-else>
            <el-select v-model="baseForm.visibility" style="width: 100%">
              <el-option label="私有（仅自己可见）" value="private" />
              <el-option label="公开（PUBLIC，所有人可见）" value="public" />
            </el-select>
          </template>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBaseDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveBase">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDocDialog" title="添加文档" width="560px">
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="docForm.name" placeholder="文档名称" /></el-form-item>
        <el-form-item label="上传文件">
          <input ref="docFileInputRef" type="file" accept=".txt,.md,.json,.csv,.py,.js,.ts,.html,.css,.xml,.yaml,.yml,.log,.doc,.docx" style="display:none" @change="onDocFilePicked" />
          <div style="display:flex;align-items:center;gap:8px;width:100%">
            <el-button size="small" :icon="Folder" @click="docFileInputRef?.click()">选择文件</el-button>
            <span v-if="docFileName" class="form-tip">{{ docFileName }}（已读取内容，会自动切分）</span>
            <span v-else class="form-tip" style="color:var(--color-text-secondary)">可选，选择后自动读取文本内容</span>
          </div>
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="docForm.content" type="textarea" :rows="8" placeholder="也可直接粘贴文档正文，系统会自动切分" />
        </el-form-item>
        <el-form-item label="来源路径"><el-input v-model="docForm.sourcePath" placeholder="可选，本地文件绝对路径" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDocDialog = false">取消</el-button>
        <el-button type="primary" :loading="savingDoc" @click="saveDoc">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { Plus, Refresh, Edit, Delete, Search, Folder, Share, ArrowDown, ArrowRight, Histogram, Document } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api/client';
import { useAuthStore, useSettingsStore } from '../stores';
import { DEFAULT_APP_GUIDE, APP_GUIDE_DOCS } from '../stores/settings';
import KbGraph from '../components/KbGraph.vue';
import {
  localListBases, localCreateBase, localUpdateBase, localDeleteBase,
  localListDocs, localAddDoc, localDeleteDoc, localSearch,
} from '@yan-zhi/core';

const authStore = useAuthStore();
const settingsStore = useSettingsStore();
/**
 * 知识库统一一套数据库存服务端（guest 也走 server，服务端 guestOrAuth 以 guest 身份、只见 public 库）。
 * 因此不再走本地 DB 分支。
 */
const isLocal = () => false;

async function errOr<T>(p: Promise<T>): Promise<T | { error: string }> {
  return p.catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
}

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
const baseForm = ref({ name: '', description: '', visibility: 'private' });
const docForm = ref({ name: '', content: '', sourcePath: '' });
// 上传文件选择
const docFileInputRef = ref<HTMLInputElement | null>(null);
const docFileName = ref('');

// ── 全局 Embedding 模型配置（可从任意已配置平台选择）──
const embeddingGroups = ref<Array<{ platformId: string; platformName: string; models: any[] }>>([]);
const currentEmbeddingModel = ref('');
const currentEmbeddingDesc = ref('');
const embeddingLoading = ref(false);
const revectorizing = ref(false);
const revectorizeProgress = ref({ done: 0, total: 0 });
let revectorizePollTimer: ReturnType<typeof setInterval> | undefined;

async function loadEmbeddingModels() {
  embeddingLoading.value = true;
  try {
    const r = await api.get<any>('/kb/embedding-model');
    if ('data' in r && r.data) {
      const platforms = r.data.platforms || [];
      const models = r.data.models || [];
      embeddingGroups.value = platforms.map((p: any) => ({
        platformId: p.id,
        platformName: p.name,
        models: models.filter((m: any) => m.platform_id === p.id),
      })).filter((g: any) => g.models.length > 0);
      const cur = r.data.current;
      currentEmbeddingModel.value = cur ? `${cur.platformId}:${cur.modelId}` : '';
      currentEmbeddingDesc.value = cur ? '已配置平台向量模型' : '未配置（兜底 Ollama）';
    }
  } catch {
    // 后端不可用，静默
  } finally {
    embeddingLoading.value = false;
  }
}

async function switchEmbeddingModel(val: string) {
  const [platformId, modelId] = val.split(':');
  if (!platformId || !modelId) return;
  try {
    await api.post('/kb/embedding-model', { platformId, modelId });
    currentEmbeddingDesc.value = '已配置平台向量模型';
    ElMessage.success('已切换向量模型，建议重新向量化以获得最佳检索效果');
  } catch (e: unknown) {
    ElMessage.error('切换向量模型失败：' + (e instanceof Error ? e.message : String(e)));
    await loadEmbeddingModels();
  }
}

async function triggerRevectorize() {
  try {
    await ElMessageBox.confirm(
      '将使用当前向量模型重新生成所有知识库的向量。文档较多时可能需要几分钟，期间检索会受影响。',
      '确认重新向量化',
      { confirmButtonText: '开始', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return;
  }
  revectorizing.value = true;
  revectorizeProgress.value = { done: 0, total: 0 };
  try {
    const r = await api.post<any>('/kb/revectorize');
    if ('ok' in r && r.ok) {
      const rd = r as any;
      ElMessage.success(`重新向量化完成：${rd.done}/${rd.total} 片`);
    }
  } catch (e: unknown) {
    ElMessage.error('重新向量化失败：' + (e instanceof Error ? e.message : String(e)));
  } finally {
    revectorizing.value = false;
  }
}

function startRevectorizePoll() {
  if (revectorizePollTimer) return;
  revectorizePollTimer = setInterval(async () => {
    try {
      const r = await api.get<any>('/kb/revectorize-status');
      if ('data' in r && r.data) {
        revectorizeProgress.value = { done: r.data.done || 0, total: r.data.total || 0 };
        if (!r.data.running) {
          revectorizing.value = false;
          if (revectorizePollTimer) { clearInterval(revectorizePollTimer); revectorizePollTimer = undefined; }
        }
      }
    } catch { /* ignore */ }
  }, 1000);
}

async function onDocFilePicked(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  docFileName.value = file.name;
  if (!docForm.value.name) docForm.value.name = file.name;
  try {
    const text = await file.text();
    docForm.value.content = text;
  } catch { ElMessage.error('读取文件失败（可能不是文本文件）'); }
}
// 内置「应用使用说明」：作为普通公开知识库（id 固定），与用户库一致支持文档/切片/图谱；不提供发布/私有（始终公开）。
const BUILTIN_GUIDE_ID = 'builtin-app-guide';
const builtinGuideText = ref(settingsStore.settings.appGuide || DEFAULT_APP_GUIDE);
const isBuiltin = computed(() => selectedId.value === BUILTIN_GUIDE_ID);

// 分片节点（文档 → 分片）可视化
const chunks = ref<any[]>([]);          // 原始分片列表（含 docId/docName/chunkIndex/content）
const chunksLoaded = ref(false);
const chunkLoading = ref(false);

// 文档表格展开行：docId → 该文档的分片内容（懒加载缓存）
const docChunksMap = ref<Record<string, { loading: boolean; items: any[] }>>({});

const activeTab = ref<'docs' | 'graph' | 'chunks'>('docs');
const selectedDoc = ref<any | null>(null);
const selectedDocId = ref('');

/** 点击左侧文档：懒加载该文档的分片内容用于预览（全库 chunks 拉一次后按 docId 过滤缓存） */
async function selectDoc(doc: any) {
  selectedDoc.value = doc;
  selectedDocId.value = doc.id;
  if (docChunksMap.value[doc.id]?.items) return; // 已缓存
  docChunksMap.value[doc.id] = { loading: true, items: [] };
  try {
    if (!chunksLoaded.value) {
      const res = await api.get<any[]>(`/kb/${selected.value.id}/chunks`);
      if ('error' in res) throw new Error((res as any).error);
      chunks.value = (res as any).data || [];
      chunksLoaded.value = true;
    }
    const items = chunks.value.filter((c: any) => c.docId === doc.id);
    docChunksMap.value[doc.id] = { loading: false, items };
  } catch (e: any) {
    docChunksMap.value[doc.id] = { loading: false, items: [] };
    ElMessage.error(e?.message || '加载文档内容失败');
  }
}
const expandedChunkGroups = ref<string[]>([]); // 展开的文档组 docId
const expandedChunks = ref<string[]>([]);      // 展开的分片 id
const chunkGroups = computed(() => {
  const map = new Map<string, { docId: string; docName: string; items: any[] }>();
  for (const c of chunks.value) {
    const key = c.docId || 'none';
    if (!map.has(key)) map.set(key, { docId: c.docId, docName: c.docName || '(文档)', items: [] });
    map.get(key)!.items.push(c);
  }
  return Array.from(map.values());
});
async function loadChunks(baseId: string) {
  chunkLoading.value = true;
  const res = await api.get<any[]>(`/kb/${baseId}/chunks`);
  chunkLoading.value = false;
  if ('error' in res) { ElMessage.error(res.error); return; }
  chunks.value = (res as any).data || [];
  chunksLoaded.value = true;
}
function toggleChunkGroup(docId: string) {
  const i = expandedChunkGroups.value.indexOf(docId);
  if (i >= 0) expandedChunkGroups.value.splice(i, 1);
  else expandedChunkGroups.value.push(docId);
}
function toggleChunk(id: string) {
  const i = expandedChunks.value.indexOf(id);
  if (i >= 0) expandedChunks.value.splice(i, 1);
  else expandedChunks.value.push(id);
}

onMounted(async () => {
  await ensureBuiltinGuide(); // 确保内置「应用使用说明」库存在（种子化）
  await loadBases();
  loadEmbeddingModels(); // 加载全局 embedding 模型配置（非阻塞）
});

async function loadBases() {
  loading.value = true;
  let list: any[] = [];
  if (isLocal()) {
    list = await localListBases();
  } else {
    const res = await api.get<any[]>('/kb');
    if ('error' in res) {
      loading.value = false;
      ElMessage.error(res.error);
      return;
    }
    list = res.data || [];
  }
  loading.value = false;
  bases.value = list;
  if (!selected.value && bases.value[0]) selectBase(bases.value[0].id);
}

async function selectBase(id: string) {
  selectedId.value = id;
  let data: any = null;
  if (isLocal()) {
    data = (await localListBases()).find((b: any) => b.id === id) || null;
  } else {
    const res = await api.get<any>(`/kb/${id}`);
    if ('error' in res) {
      ElMessage.error(res.error);
      return;
    }
    data = res.data;
  }
  selected.value = data;
  docs.value = [];
  results.value = [];
  query.value = '';
  docChunksMap.value = {}; // 切库清空展开行缓存
  selectedDoc.value = null;
  selectedDocId.value = '';
  activeTab.value = 'docs';
  await loadDocs(id);
}

async function loadDocs(baseId: string) {
  docLoading.value = true;
  let list: any[] = [];
  if (isLocal()) {
    list = await localListDocs(baseId);
  } else {
    const res = await api.get<any[]>(`/kb/${baseId}/documents`);
    if ('error' in res) {
      docLoading.value = false;
      ElMessage.error(res.error);
      return;
    }
    list = res.data || [];
  }
  docLoading.value = false;
  docs.value = list;
}

function openCreate() {
  editingBase.value = null;
  // 未登录（访客）固定公开共享，可编辑的只有名称/描述
  baseForm.value = { name: '', description: '', visibility: authStore.isLoggedIn ? 'private' : 'public' };
  showBaseDialog.value = true;
}

function openEdit() {
  if (!selected.value) return;
  if (isBuiltin.value) return; // 内置库不允许编辑（保持系统默认）
  editingBase.value = selected.value.id;
  baseForm.value = {
    name: selected.value.name,
    description: selected.value.description || '',
    visibility: selected.value.visibility || 'private',
  };
  showBaseDialog.value = true;
}

async function saveBase() {
  if (!baseForm.value.name.trim()) {
    ElMessage.warning('请输入名称');
    return;
  }
  saving.value = true;
  // 未登录强制公开共享（服务端也会兜底 guest 为 public）
  const vis = authStore.isLoggedIn ? baseForm.value.visibility : 'public';
  const body = { name: baseForm.value.name, description: baseForm.value.description, visibility: vis };
  let result: any;
  let isNew = false;
  let failed = false;
  if (isLocal()) {
    result = editingBase.value
      ? await localUpdateBase(editingBase.value, body)
      : (isNew = true, await localCreateBase(body));
  } else {
    isNew = !editingBase.value;
    const res = editingBase.value
      ? await api.patch<any>(`/kb/${editingBase.value}`, body)
      : await api.post<any>('/kb', body);
    if ('error' in res) { failed = true; ElMessage.error(res.error); }
    result = res as any;
  }
  saving.value = false;
  if (failed) return;
  ElMessage.success(editingBase.value ? '已更新' : '已创建');
  showBaseDialog.value = false;
  const saved = result?.data || result || {};
  const newId = (editingBase.value || saved.id || '').toString();
  const wasEdit = !!editingBase.value;
  editingBase.value = null;
  await loadBases();
  // 新建后自动选中新库，直接看到内容
  if (wasEdit) {
    selected.value = saved;
  } else if (newId) {
    selectBase(newId);
  } else if (bases.value[0]) {
    selectBase(bases.value[0].id);
  }
}

/** 发布知识库为公开共享（登录用户，把 private → public） */
async function publishBase() {
  if (!selected.value) return;
  try {
    await ElMessageBox.confirm('发布后知识库将公开共享，本机所有用户可见。确定发布？', '发布公开', { type: 'warning' });
  } catch { return; }
  const res = await api.patch<any>(`/kb/${selected.value.id}`, { visibility: 'public' });
  if ('error' in res) { ElMessage.error(res.error); return; }
  ElMessage.success('已发布为公开共享');
  await loadBases();
  if (selected.value) selectBase(selected.value.id);
}

async function removeBase() {
  if (!selected.value) return;
  if (isBuiltin.value) return; // 内置库不允许删除
  try {
    await ElMessageBox.confirm('删除知识库会同时删除文档和切片，确认？', '提示', { type: 'warning' });
  } catch {
    return;
  }
  if (isLocal()) {
    await localDeleteBase(selected.value.id);
  } else {
    const res = await api.delete<any>(`/kb/${selected.value.id}`);
    if ('error' in res) {
      ElMessage.error(res.error);
      return;
    }
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
  docFileName.value = '';
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
  let chunkCount = 0;
  if (isLocal()) {
    const r = await localAddDoc(selected.value.id, {
      name: docForm.value.name,
      content: docForm.value.content || undefined,
      sourcePath: docForm.value.sourcePath || undefined,
    });
    chunkCount = r.chunkCount || 0;
  } else {
    const res = await api.post<any>(`/kb/${selected.value.id}/documents`, {
      name: docForm.value.name,
      content: docForm.value.content || undefined,
      sourcePath: docForm.value.sourcePath || undefined,
    });
    if ('error' in res) {
      savingDoc.value = false;
      ElMessage.error(res.error);
      return;
    }
    chunkCount = res.data?.chunkCount || 0;
  }
  savingDoc.value = false;
  ElMessage.success(`已添加，切分 ${chunkCount} 个片段`);
  showDocDialog.value = false;
  await loadDocs(selected.value.id);
}

async function removeDoc(docId: string) {
  try {
    await ElMessageBox.confirm('确认删除该文档？', '提示', { type: 'warning' });
  } catch {
    return;
  }
  if (isLocal()) {
    await localDeleteDoc(docId);
  } else {
    const res = await api.delete<any>(`/kb/documents/${docId}`);
    if ('error' in res) {
      ElMessage.error(res.error);
      return;
    }
  }
  ElMessage.success('已删除');
  delete docChunksMap.value[docId]; // 清展开缓存
  if (selectedDocId.value === docId) {
    selectedDoc.value = null;
    selectedDocId.value = '';
  }
  if (selected.value) await loadDocs(selected.value.id);
}

async function search() {
  if (!selected.value || !query.value.trim()) return;
  const q = query.value.trim();
  if (isLocal()) {
    results.value = await localSearch(selected.value.id, q, 8) || [];
  } else {
    // 实体导向多跳：问题匹配实体 → 取其切片 → 沿关联最多 3 级取关联实体切片
    const er = await api.get<any[]>(`/kb/entity-search?query=${encodeURIComponent(q)}&hops=3&topK=3`);
    if (!('error' in er) && er.data && er.data.length > 0) {
      results.value = er.data;
      return;
    }
    // 退化：本库关键词检索
    const res = await api.get<any[]>(`/kb/${selected.value.id}/search?query=${encodeURIComponent(q)}&topK=8`);
    if ('error' in res) {
      ElMessage.error(res.error);
      return;
    }
    results.value = res.data || [];
  }
  if (results.value.length === 0) ElMessage.info('没有匹配的知识片段');
}

// ── 内置应用使用说明：普通公开知识库，首次进入时用默认 docs（一个功能一个文档）种子化；可「恢复默认」重置 ──
async function ensureBuiltinGuide() {
  try {
    builtinGuideText.value = settingsStore.settings.appGuide || DEFAULT_APP_GUIDE;
    await api.post('/kb/builtin-guide', { docs: APP_GUIDE_DOCS });
  } catch {
    // 失败不阻塞（离线/服务未就绪）
  }
}

async function resetBuiltinGuide() {
  try {
    await ElMessageBox.confirm('恢复为默认应用使用说明？你当前的修改会丢失。', '提示', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await api.post('/kb/builtin-guide/reset', { docs: APP_GUIDE_DOCS });
    await settingsStore.update({ appGuide: DEFAULT_APP_GUIDE });
    ElMessage.success('已恢复默认');
    if (selected.value) await loadDocs(selected.value.id);
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '恢复失败');
  }
}
</script>

<style scoped>
.embedding-config-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  margin-bottom: 12px;
  gap: 12px;
}
.embedding-config-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.embedding-config-title {
  font-weight: 600;
  white-space: nowrap;
}
.embedding-config-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}
.embedding-config-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.revectorize-progress {
  font-size: 12px;
  color: var(--color-text-secondary);
}

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

.badge-public,
.badge-private {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 8px;
  line-height: 1.6;
}
.badge-public {
  color: #059669;
  background: rgba(16, 185, 129, 0.14);
}
.badge-private {
  color: var(--color-text-secondary);
  background: var(--glass-border);
}
.kb-vis-force {
  display: flex; flex-direction: column; align-items: flex-start; gap: 6px; width: 100%;
}
.kb-vis-force .form-tip { font-size: 12px; color: var(--color-text-secondary); line-height: 1.5; }

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

.results {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

/* 文档表格：固定最大高度、独立滚动，避免撑长页面 */
.doc-table {
  margin-top: 12px;
  flex-shrink: 0;
}

.doc-table :deep(.el-table__cell .cell) {
  font-size: 13px;
}

/* 展开行：显示文档分片全文 */
.doc-expand-state { padding: 8px 4px; }
.doc-expand-body {
  max-height: 320px; overflow-y: auto; padding: 4px 8px;
  display: flex; flex-direction: column; gap: 8px;
}
.doc-expand-chunk {
  border: 1px solid var(--glass-border); border-radius: 8px; padding: 8px 12px;
  background: rgba(0, 0, 0, 0.015);
}
.doc-expand-chunk-index {
  font-size: 11px; font-weight: 700; color: var(--color-primary);
}
.doc-expand-chunk-text {
  margin: 6px 0 0; font-size: 12.5px; line-height: 1.7;
  white-space: pre-wrap; word-break: break-word; color: var(--color-text);
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
.result-reason {
  display: block;
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-top: 2px;
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

/* ===== 分片节点（文档→分片 关系） ===== */
.chunk-section { margin-top: 4px; }
.chunk-tree { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
.chunk-group {
  border: 1px solid var(--glass-border); border-radius: 12px; overflow: hidden;
  background: var(--glass-bg, rgba(255,255,255,0.6));
}
.chunk-group-name {
  display: flex; align-items: center; gap: 8px; padding: 9px 12px; cursor: pointer;
  font-weight: 600; font-size: 13px; color: var(--color-text, #334);
}
.chunk-group-name:hover { background: var(--glass-bg-hover); }
.chunk-count { font-size: 11px; color: var(--color-text-secondary); font-weight: 400; }
.chunk-caret { font-size: 12px; color: var(--color-text-secondary); margin-left: auto; }
.chunk-items { border-top: 1px solid var(--glass-border); }
.chunk-node { border-bottom: 1px solid var(--glass-border); }
.chunk-node:last-child { border-bottom: none; }
.chunk-node-head {
  display: flex; align-items: center; gap: 8px; padding: 6px 12px; cursor: pointer;
  font-size: 12px; color: var(--color-text-secondary);
}
.chunk-node-head:hover { background: var(--glass-bg-hover); color: var(--color-primary); }
.chunk-node-index { font-weight: 600; }
.chunk-node-content {
  padding: 8px 12px 10px; font-size: 12.5px; line-height: 1.6;
  color: var(--color-text); background: rgba(0,0,0,0.02);
  word-break: break-word; white-space: pre-wrap;
  max-height: 40vh; overflow-y: auto;
}

/* ===== Tab 切换主体 ===== */
.kb-tabs {
  margin-top: 14px;
}
.kb-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}
.kb-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}
.chunk-tab-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

/* ===== 文档浏览器（Windows 资源管理器风格：左目录 + 右预览） ===== */
.doc-explorer {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 12px;
  min-height: 360px;
  height: calc(70vh - 40px);
}
.doc-tree-panel {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: var(--glass-bg, rgba(255, 255, 255, 0.4));
  overflow: hidden;
}
.doc-tree-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--glass-border);
  flex-shrink: 0;
}
.doc-tree-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}
.doc-tree-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text);
  transition: background 0.15s ease;
  user-select: none;
}
.doc-tree-item:hover {
  background: var(--glass-bg-hover);
}
.doc-tree-item.active {
  background: rgba(124, 58, 237, 0.12);
  color: var(--color-primary);
  font-weight: 600;
}
.doc-tree-icon {
  font-size: 16px;
  flex-shrink: 0;
}
.doc-tree-item.active .doc-tree-icon {
  color: var(--color-primary);
}
.doc-tree-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-tree-chunk-count {
  font-size: 11px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}
.doc-tree-item.active .doc-tree-chunk-count {
  color: var(--color-primary);
  opacity: 0.8;
}

.doc-preview-panel {
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: var(--glass-bg, rgba(255, 255, 255, 0.4));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.doc-preview-panel :deep(.el-empty) {
  margin: auto;
}
.doc-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--glass-border);
  flex-shrink: 0;
}
.doc-preview-info {
  min-width: 0;
}
.doc-preview-title {
  font-size: 15px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-preview-meta {
  margin-top: 3px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.doc-preview-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
}
.doc-preview-chunks {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.doc-preview-chunk {
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.015);
}
.doc-preview-chunk-index {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
}
.doc-preview-chunk-text {
  margin: 6px 0 0;
  font-size: 12.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-text);
}

@media (max-width: 767px) {
  .doc-explorer {
    grid-template-columns: 1fr;
    height: auto;
  }
  .doc-tree-panel {
    max-height: 220px;
  }
  .doc-preview-panel {
    min-height: 260px;
  }
}
</style>
