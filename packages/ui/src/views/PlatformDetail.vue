<template>
  <div class="page">
    <header class="page-header">
      <div class="header-left">
        <el-button text @click="back"><el-icon><ArrowLeft /></el-icon> 返回</el-button>
        <h2 class="page-title">{{ platform?.name || '平台详情' }}</h2>
        <span :class="['status-dot', platform?.status]"></span>
      </div>
      <div class="header-actions header-actions-desktop">
        <el-button @click="fetchRemote" :loading="fetching">拉取远程模型</el-button>
        <el-button @click="batchMode = !batchMode" :type="batchMode ? 'warning' : ''">
          {{ batchMode ? '取消' : '批量' }}
        </el-button>
        <el-button type="primary" @click="showAdd = true"><el-icon><Plus /></el-icon> 手动添加</el-button>
      </div>
    </header>

    <div v-if="batchMode" class="batch-toolbar">
      <span>已选 {{ selectedModelIds.size }} 个</span>
      <el-button size="small" :disabled="models.length === 0" @click="batchSelectAll">全选</el-button>
      <el-button size="small" type="primary" :disabled="selectedModelIds.size === 0" @click="showBatchContext = true">批量设置上下文</el-button>
      <el-button size="small" type="danger" :disabled="selectedModelIds.size === 0" @click="batchDeleteModels">批量删除</el-button>
    </div>

    <div class="model-grid">
      <div v-for="m in models" :key="m.id" class="model-card" :class="{ disabled: !m.enabled }">
        <el-checkbox
          v-if="batchMode"
          :model-value="selectedModelIds.has(m.id)"
          class="model-card-check"
          @click.stop
          @change="toggleModelSelect(m.id)"
        />
        <div class="model-card-top">
          <div class="model-card-icon" :class="m.type">{{ (m.alias || m.modelId).slice(0, 2) }}</div>
          <div class="model-card-head">
            <div class="model-card-name">{{ m.alias || m.modelId }}</div>
            <div class="model-card-id">{{ m.modelId }}</div>
          </div>
          <el-switch v-model="m.enabled" size="small" @change="toggleEnabled(m)" />
        </div>

        <div class="model-card-tags">
          <el-tag size="small" :type="m.type === 'llm' ? '' : 'info'" effect="light">{{ m.type }}</el-tag>
          <el-tag v-if="m.isDefault" size="small" type="warning" effect="dark">默认</el-tag>
          <el-tag v-for="cap in (m.capabilities || [])" :key="cap" size="small" type="info">
            {{ capabilityLabel(cap) }}
          </el-tag>
        </div>

        <div class="model-card-stats">
          <div class="stat-item">
            <el-icon><Expand /></el-icon>
            <span>{{ formatWindow(m.contextWindow) }} 上下文</span>
          </div>
        </div>

        <div class="model-card-foot">
          <el-input
            v-model="m.alias"
            size="small"
            placeholder="别名（可选）"
            @change="updateAlias(m)"
            class="alias-input"
          />
          <div class="model-card-actions">
            <el-button size="small" text @click="editModel(m)">编辑</el-button>
            <el-button size="small" text @click="setDefault(m)" v-if="!m.isDefault">设为默认</el-button>
            <el-button size="small" :loading="testing === m.id" @click="testModel(m)">测试</el-button>
            <el-button size="small" type="danger" text @click="del(m)">删除</el-button>
          </div>
        </div>
      </div>

      <div class="model-card add-card" @click="showAdd = true">
        <el-icon :size="32"><Plus /></el-icon>
        <span>添加模型</span>
      </div>

      <el-empty v-if="models.length === 0 && !fetching" description="暂无模型，点击拉取远程模型或手动添加" />
    </div>

    <!-- 手动添加对话框 -->
    <el-dialog v-model="showAdd" :title="editingModelId ? '编辑模型' : '添加模型'" width="520px">
      <el-form label-width="100px">
        <el-form-item label="模型 ID"><el-input v-model="form.modelId" placeholder="如：gpt-4o-mini" /></el-form-item>
        <el-form-item label="别名"><el-input v-model="form.alias" placeholder="（可选）" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type">
            <el-option label="LLM" value="llm" />
            <el-option label="Embedding" value="embedding" />
            <el-option label="Rerank" value="rerank" />
          </el-select>
        </el-form-item>
        <el-form-item label="能力">
          <el-checkbox-group v-model="form.capabilities">
            <el-checkbox value="function_call">函数调用</el-checkbox>
            <el-checkbox value="vision">视觉</el-checkbox>
            <el-checkbox value="reasoning">推理</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="上下文窗口">
          <el-input-number v-model="form.contextWindow" :min="512" :step="1024" />
        </el-form-item>
        <el-form-item label="输入价格">
          <el-input-number v-model="form.pricingInput" :min="0" :step="0.001" :precision="4" />
          <span class="form-tip">元/千token</span>
        </el-form-item>
        <el-form-item label="输出价格">
          <el-input-number v-model="form.pricingOutput" :min="0" :step="0.001" :precision="4" />
          <span class="form-tip">元/千token</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="addOrEditModel">{{ editingModelId ? '保存修改' : '添加' }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showBatchContext" title="批量设置上下文窗口" width="380px">
      <el-form label-width="100px">
        <el-form-item label="上下文窗口">
          <el-input-number v-model="batchContextWindow" :min="512" :step="1024" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBatchContext = false">取消</el-button>
        <el-button type="primary" :loading="batchSaving" @click="applyBatchContext">应用 ({{ selectedModelIds.size }} 个)</el-button>
      </template>
    </el-dialog>

    <!-- 测试结果 -->
    <el-dialog v-model="testResultDialog" title="模型测试结果" width="480px">
      <div class="test-result">
        <el-result :icon="testResult.ok ? 'success' : 'error'" :title="testResult.ok ? '连通正常' : '连通失败'" :sub-title="testResult.msg" />
        <div v-if="testResult.ok" class="test-detail">
          <div>耗时：{{ testResult.durationMs }}ms</div>
          <div>finish_reason：{{ testResult.finishReason || '-' }}</div>
        </div>
      </div>
    </el-dialog>

    <!-- Mobile: header-actions as a collapsible toolbar below header -->
    <div class="header-actions-mobile">
      <el-button size="small" @click="fetchRemote" :loading="fetching">拉取</el-button>
      <el-button size="small" @click="batchMode = !batchMode" :type="batchMode ? 'warning' : ''">
        {{ batchMode ? '取消' : '批量' }}
      </el-button>
    </div>

    <!-- Mobile FAB -->
    <el-button type="primary" :icon="Plus" circle class="mobile-fab" @click="showAdd = true" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus, ArrowLeft, Expand } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { usePlatformStore } from '../stores';

const route = useRoute();
const router = useRouter();
const store = usePlatformStore();
const platformId = computed(() => route.params.platformId as string);
const platform = computed(() => store.platforms.find((p) => p.id === platformId.value));
const models = computed(() => store.models.filter((m) => m.platformId === platformId.value));
const showAdd = ref(false);
const editingModelId = ref('');
const fetching = ref(false);
const testing = ref('');
const testResultDialog = ref(false);
const testResult = ref<{ ok: boolean; msg: string; durationMs?: number; finishReason?: string }>({ ok: false, msg: '' });
const batchMode = ref(false);
const selectedModelIds = ref<Set<string>>(new Set());
const showBatchContext = ref(false);
const batchContextWindow = ref(131072);
const batchSaving = ref(false);
const form = ref({
  modelId: '', alias: '', type: 'llm', contextWindow: 131072,
  capabilities: [] as string[],
  pricingInput: 0, pricingOutput: 0,
});

onMounted(async () => {
  await store.loadPlatforms();
  await store.loadModels(platformId.value);
});

function back() { router.push('/models'); }

function capabilityLabel(cap: string) {
  const m: Record<string, string> = { function_call: '函数调用', vision: '视觉', reasoning: '推理' };
  return m[cap] || cap;
}
function formatWindow(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

async function fetchRemote() {
  fetching.value = true;
  try {
    const ids = await store.fetchRemoteModels(platformId.value);
    ElMessage.success(`拉取成功，新增 ${ids.length} 个模型`);
  } catch (e: any) {
    ElMessage.error(e?.message || '拉取失败');
  } finally { fetching.value = false; }
}

function editModel(m: any) {
  editingModelId.value = m.id;
  form.value = {
    modelId: m.modelId, alias: m.alias || '', type: m.type || 'llm',
    contextWindow: m.contextWindow || 4096,
    capabilities: [...(m.capabilities || [])],
    pricingInput: m.pricing?.input || 0, pricingOutput: m.pricing?.output || 0,
  };
  showAdd.value = true;
}

async function addOrEditModel() {
    if (!form.value.modelId) { ElMessage.warning('模型 ID 必填'); return; }
    if (editingModelId.value) {
      await store.updateModel(editingModelId.value, {
        modelId: form.value.modelId, alias: form.value.alias,
        type: form.value.type as any, contextWindow: form.value.contextWindow,
        capabilities: form.value.capabilities,
        pricing: { input: form.value.pricingInput, output: form.value.pricingOutput },
      });
      ElMessage.success('已更新');
    } else {
      await store.addModel({
        platformId: platformId.value, modelId: form.value.modelId,
        alias: form.value.alias, type: form.value.type as any,
        contextWindow: form.value.contextWindow, enabled: true, isDefault: false,
        capabilities: form.value.capabilities,
        pricing: { input: form.value.pricingInput, output: form.value.pricingOutput },
      });
      ElMessage.success('已添加');
    }
    showAdd.value = false;
    resetModelForm();
  }

function resetModelForm() {
  editingModelId.value = '';
  form.value = { modelId: '', alias: '', type: 'llm', contextWindow: 131072, capabilities: [], pricingInput: 0, pricingOutput: 0 };
}

async function updateAlias(row: any) { await store.updateModel(row.id, { alias: row.alias }); }
async function toggleEnabled(row: any) { await store.updateModel(row.id, { enabled: row.enabled }); }
async function setDefault(row: any) { await store.updateModel(row.id, { isDefault: true }); ElMessage.success(`已设为默认：${row.modelId}`); }

function toggleModelSelect(id: string) {
  const next = new Set(selectedModelIds.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  selectedModelIds.value = next;
}
function batchSelectAll() {
  selectedModelIds.value = new Set(models.value.filter(m => m.enabled).map(m => m.id));
}
async function applyBatchContext() {
  if (selectedModelIds.value.size === 0) return;
  batchSaving.value = true;
  try {
    for (const id of selectedModelIds.value) {
      await store.updateModel(id, { contextWindow: batchContextWindow.value });
    }
    ElMessage.success(`已设置 ${selectedModelIds.value.size} 个模型的上下文窗口`);
    selectedModelIds.value = new Set();
    showBatchContext.value = false;
    batchMode.value = false;
  } catch (e: any) {
    ElMessage.error(e?.message || '设置失败');
  } finally { batchSaving.value = false; }
}
async function batchDeleteModels() {
  if (selectedModelIds.value.size === 0) return;
  try {
    await ElMessageBox.confirm(`删除 ${selectedModelIds.value.size} 个模型？`, '提示', { type: 'warning' });
    for (const id of selectedModelIds.value) {
      await store.deleteModel(id);
    }
    ElMessage.success(`已删除 ${selectedModelIds.value.size} 个模型`);
    selectedModelIds.value = new Set();
    batchMode.value = false;
  } catch {}
}
async function del(row: any) {
  try {
    await ElMessageBox.confirm(`删除模型 ${row.modelId}？`, '提示', { type: 'warning' });
    await store.deleteModel(row.id);
    ElMessage.success('已删除');
  } catch {}
}

async function testModel(row: any) {
  testing.value = row.id;
  try {
    const r = await store.testModel(row.id);
    testResult.value = r;
    testResultDialog.value = true;
  } finally { testing.value = ''; }
}
</script>

<style scoped>
/* .page / .page-header / .page-title come from App.vue global */
.header-left { display: flex; align-items: center; gap: 12px; }
.header-actions { display: flex; gap: 8px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; }
.status-dot.healthy { background: #10b981; box-shadow: 0 0 6px rgba(16,185,129,0.4); }
.status-dot.down { background: #ef4444; }
.status-dot.unknown { background: #94a3b8; }

.model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}

.model-card { position: relative;
  background: var(--glass-bg); backdrop-filter: var(--glass-filter); -webkit-backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border); border-radius: var(--radius-md);
  padding: 16px; display: flex; flex-direction: column; gap: 12px;
  transition: all 0.2s ease;
}
.model-card-check { position: absolute; top: 16px; left: 16px; z-index: 1; }
.model-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.06); border-color: var(--glass-border-strong); }

.batch-toolbar {
  display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
  padding: 10px 16px; background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: 10px; font-size: 13px; color: var(--color-text-secondary);
}
.batch-toolbar span:first-child { font-weight: 600; }
.model-card.disabled { opacity: 0.6; }
.model-card-top { display: flex; align-items: center; gap: 12px; }
.model-card-icon {
  width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px; flex-shrink: 0;
  background: rgba(59,130,246,0.1); color: var(--color-primary);
}
.model-card-icon.embedding { background: rgba(245,158,11,0.1); color: #f59e0b; }
.model-card-icon.rerank { background: rgba(139,92,246,0.1); color: #8B5CF6; }

.model-card-head { flex: 1; min-width: 0; }
.model-card-name { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.model-card-id { font-size: 11px; color: var(--color-text-secondary); font-family: "JetBrains Mono", monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.model-card-tags { display: flex; gap: 4px; flex-wrap: wrap; }

.model-card-stats { display: flex; gap: 14px; }
.stat-item { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--color-text-secondary); }

.model-card-foot {
  display: flex; align-items: center; gap: 8px;
  padding-top: 8px; border-top: 1px solid var(--glass-border);
}
.alias-input { max-width: 140px; }
.model-card-actions { display: flex; gap: 4px; margin-left: auto; }

/* 添加卡片 */
.add-card {
  border: 1.5px dashed var(--glass-border);
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; min-height: 160px; cursor: pointer;
  color: var(--color-text-secondary); gap: 8px;
}
.add-card:hover { color: var(--color-primary); border-color: var(--color-primary); background: rgba(59,130,246,0.04); }

.form-tip { font-size: 12px; color: var(--color-text-secondary); margin-left: 8px; }
.test-result { padding: 12px; }
.test-detail { margin-top: -8px; padding: 0 24px 12px; font-size: 13px; color: var(--color-text-secondary); line-height: 1.8; }

/* Desktop: show header actions, hide mobile toolbar/FAB */
.header-actions-desktop { display: flex; }
.header-actions-mobile { display: none; }
.mobile-fab { display: none; }

@media (max-width: 767px) {
  .header-actions-desktop { display: none; }
  .header-actions-mobile {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .mobile-fab {
    display: flex;
    position: fixed;
    right: 20px;
    z-index: 99;
    width: 48px;
    height: 48px;
    box-shadow: 0 4px 16px rgba(124, 58, 237, 0.45);
    border-radius: 50%;
    /* above mobile TabBar (56px) */
    bottom: calc(56px + 12px + env(safe-area-inset-bottom, 0px));
  }
  .model-grid { grid-template-columns: 1fr; gap: 12px; }
  .batch-toolbar { flex-wrap: wrap; gap: 8px; font-size: 12px; padding: 8px 12px; }
  .alias-input { max-width: 100%; }
  .model-card-foot { flex-wrap: wrap; gap: 8px; }
  .model-card-actions { width: 100%; margin-left: 0; flex-wrap: wrap; justify-content: flex-start; }
}
</style>
