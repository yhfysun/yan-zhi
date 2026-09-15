<template>
  <div class="page">
    <header class="page-header">
      <div class="header-left">
        <el-button v-if="!embedded" text @click="back"><el-icon><ArrowLeft /></el-icon> 返回</el-button>
        <h2 class="page-title">{{ platform?.name || '平台详情' }}</h2>
        <span :class="['status-dot', platform?.status]"></span>
      </div>
      <div v-if="!platform?.isBuiltin" class="header-actions header-actions-desktop">
        <el-button @click="fetchRemote" :loading="fetching">拉取远程模型</el-button>
        <el-button @click="batchMode = !batchMode" :type="batchMode ? 'warning' : ''">
          {{ batchMode ? '取消' : '批量' }}
        </el-button>
        <el-button type="primary" @click="openAddModel"><el-icon><Plus /></el-icon> 手动添加</el-button>
      </div>
    </header>

    <div v-if="batchMode" class="batch-toolbar">
      <span>已选 {{ selectedModelIds.size }} 个</span>
      <el-button size="small" :disabled="models.length === 0" @click="batchSelectAll">全选</el-button>
      <el-button size="small" type="primary" :disabled="selectedModelIds.size === 0" @click="showBatchContext = true">批量设置上下文</el-button>
      <el-button size="small" type="danger" :disabled="selectedModelIds.size === 0" @click="batchDeleteModels">批量删除</el-button>
    </div>

    <div class="model-grid">
      <div
        v-for="m in models"
        :key="m.id"
        class="model-card"
        :class="{ disabled: !m.enabled }"
        @click="onCardClick(m)"
      >
        <el-checkbox
          v-if="batchMode && !m.isBuiltin"
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
          <el-switch v-if="!m.isBuiltin" v-model="m.enabled" size="small" @click.stop @change="toggleEnabled(m)" />
        </div>

        <div class="model-card-tags">
          <el-tag size="small" :type="m.type === 'llm' ? '' : 'info'" effect="light">{{ m.type }}</el-tag>
          <el-tag v-if="m.isDefault" size="small" type="warning" effect="dark">默认</el-tag>
          <el-tag v-if="m.isBuiltin" size="small" type="warning" effect="dark">内置</el-tag>
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

        <div v-if="m.description" class="model-card-desc">{{ m.description }}</div>

        <div class="model-card-foot">
          <el-input
            v-if="!m.isBuiltin"
            v-model="m.alias"
            size="small"
            placeholder="别名（可选）"
            @click.stop
            @change="updateAlias(m)"
            class="alias-input"
          />
          <div class="model-card-actions" @click.stop>
            <el-dropdown trigger="click" @command="(k: string) => runCapabilityTest(m, k)">
              <el-button size="small" :loading="testing === m.id">
                测试<el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="k in testKindsOf(m)" :key="k.kind" :command="k.kind">
                    {{ k.label }}
                  </el-dropdown-item>
                  <el-dropdown-item command="__auto" divided>
                    自动检测全部并勾选
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button v-if="!m.isBuiltin" size="small" text @click="editModel(m)">编辑</el-button>
            <el-button v-if="!m.isBuiltin && !m.isDefault" size="small" text @click="setDefault(m)">设为默认</el-button>
            <el-button size="small" type="danger" text @click="del(m)">删除</el-button>
          </div>
        </div>
      </div>

      <div v-if="!platform?.isBuiltin" class="model-card add-card" @click="openAddModel">
        <el-icon :size="32"><Plus /></el-icon>
        <span>添加模型</span>
      </div>

      <el-empty v-if="models.length === 0 && !fetching" description="暂无模型，点击拉取远程模型或手动添加" />
    </div>

    <!-- 手动添加对话框 -->
    <el-dialog v-model="showAdd" :title="editingModelId ? '编辑模型' : '添加模型'" width="520px" :close-on-click-modal="false" @closed="resetModelForm">
      <el-form label-width="100px">
        <el-form-item label="模型 ID"><el-input v-model="form.modelId" placeholder="如：gpt-4o-mini" /></el-form-item>
        <el-form-item label="别名"><el-input v-model="form.alias" placeholder="（可选）" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type">
            <el-option label="LLM" value="llm" />
            <el-option v-if="supportsEmbeddings" label="Embedding" value="embedding" />
            <el-option label="Rerank" value="rerank" />
            <el-option label="图片生成" value="image" />
            <el-option label="视频生成" value="video" />
            <el-option label="音频生成" value="audio" />
            <el-option label="语音合成(TTS)" value="tts" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="模型描述：用途、专长、适用场景等（供智能体选型时参考）" />
        </el-form-item>
        <el-form-item label="能力">
          <el-checkbox-group v-model="form.capabilities" class="cap-group">
            <span v-for="c in capDefs" :key="c.value" class="cap-item">
              <el-checkbox :value="c.value">{{ c.label }}</el-checkbox>
              <el-button
                size="small" text type="primary"
                :loading="capTesting === c.kind"
                @click="testCapabilityInForm(c)"
              >测试</el-button>
            </span>
          </el-checkbox-group>
          <div class="form-tip cap-tip">
            点「测试」实测该能力，通过后自动勾上（推理＝多步问答，能正常问答即默认具备）
          </div>
        </el-form-item>
        <el-form-item label="上下文窗口">
          <div class="ctx-editor">
            <div class="ctx-input-row">
              <el-input-number v-model="form.contextWindowK" :min="1" :step="16" :precision="0" />
              <span class="form-tip">K tokens</span>
              <el-button
                v-for="p in ctxPresets"
                :key="p.k"
                size="small"
                class="ctx-preset-btn"
                :type="form.contextWindowK === p.k ? 'primary' : ''"
                @click="form.contextWindowK = p.k"
              >{{ p.label }}</el-button>
            </div>
          </div>
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
        <el-button @click="closeModelDialog">取消</el-button>
        <el-button type="primary" @click="addOrEditModel">{{ editingModelId ? '保存修改' : '添加' }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showBatchContext" title="批量设置上下文窗口" width="420px" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="上下文窗口">
          <div class="ctx-editor">
            <div class="ctx-input-row">
              <el-input-number v-model="batchContextWindowK" :min="1" :step="16" :precision="0" />
              <span class="form-tip">K tokens</span>
              <el-button
                v-for="p in ctxPresets"
                :key="p.k"
                size="small"
                class="ctx-preset-btn"
                :type="batchContextWindowK === p.k ? 'primary' : ''"
                @click="batchContextWindowK = p.k"
              >{{ p.label }}</el-button>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBatchContext = false">取消</el-button>
        <el-button type="primary" :loading="batchSaving" @click="applyBatchContext">应用 ({{ selectedModelIds.size }} 个)</el-button>
      </template>
    </el-dialog>

    <!-- 测试结果 -->
    <el-dialog v-model="testResultDialog" :title="testResult.title || '模型测试结果'" width="520px">
      <div class="test-result">
        <el-result
          v-if="!testResult.list?.length"
          :icon="testResult.ok ? 'success' : 'error'"
          :title="testResult.ok ? '测试通过' : '测试未通过'"
          :sub-title="testResult.msg"
        />
        <div v-else class="cap-result-list">
          <div v-for="r in testResult.list" :key="r.kind" class="cap-result-row">
            <el-tag size="small" :type="r.ok ? 'success' : 'danger'" effect="light">{{ r.label }}</el-tag>
            <span class="cap-result-msg">{{ r.ok ? '通过' : '未通过' }} · {{ r.msg }}</span>
            <span class="cap-result-ms">{{ r.durationMs }}ms</span>
          </div>
        </div>
        <div v-if="testResult.ok && !testResult.list?.length" class="test-detail">
          <div>耗时：{{ testResult.durationMs }}ms</div>
          <div v-if="testResult.finishReason">finish_reason：{{ testResult.finishReason }}</div>
        </div>
        <div v-if="testResult.detail" class="test-detail">模型回答：{{ testResult.detail }}</div>
        <div v-if="testResult.applied?.length" class="test-detail">
          已自动勾选能力：{{ testResult.applied.join('、') }}
        </div>
      </div>
    </el-dialog>

    <!-- Mobile: header-actions as a collapsible toolbar below header -->
    <div v-if="!platform?.isBuiltin" class="header-actions-mobile">
      <el-button size="small" @click="fetchRemote" :loading="fetching">拉取</el-button>
      <el-button size="small" @click="batchMode = !batchMode" :type="batchMode ? 'warning' : ''">
        {{ batchMode ? '取消' : '批量' }}
      </el-button>
    </div>

    <!-- Mobile FAB -->
    <el-button v-if="!platform?.isBuiltin" type="primary" :icon="Plus" circle class="mobile-fab" @click="openAddModel" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus, ArrowLeft, Expand, ArrowDown } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { usePlatformStore } from '../stores';

const props = defineProps<{
  /** 弹窗内嵌时直接传入平台 ID；不传则回退到路由参数（/models/:platformId） */
  platformId?: string;
  /** 内嵌模式（如设置弹窗中）：隐藏「返回」按钮 */
  embedded?: boolean;
}>();

const route = useRoute();
const router = useRouter();
const store = usePlatformStore();
const platformId = computed(() => props.platformId || (route.params.platformId as string));
const platform = computed(() => store.platforms.find((p) => p.id === platformId.value));
const models = computed(() => store.models.filter((m) => m.platformId === platformId.value));
const supportsEmbeddings = computed(() => platform.value?.protocol !== 'anthropic');
const showAdd = ref(false);
const editingModelId = ref('');
const fetching = ref(false);
const testing = ref('');
const testResultDialog = ref(false);
const testResult = ref<{
  ok: boolean;
  msg: string;
  title?: string;
  durationMs?: number;
  finishReason?: string;
  detail?: string;
  applied?: string[];
  list?: { kind: string; label: string; ok: boolean; msg: string; durationMs: number }[];
}>({ ok: false, msg: '' });
const batchMode = ref(false);
const selectedModelIds = ref<Set<string>>(new Set());
const showBatchContext = ref(false);
const batchContextWindowK = ref(256);
const batchSaving = ref(false);
// 上下文窗口预设档位（K tokens 为单位；1M = 1024K = 1048576 tokens，存储层仍存 token 数）
// 只保留 1M 快捷档：默认档已经是 256K，档位按钮太多反而占版面
const ctxPresets = [{ k: 1024, label: '1M' }];
/** 能力项与对应测试：推理用「基础问答」测（能问答即具备多步推理）；图片/视频生成仅对应类型模型显示 */
const CAP_DEFS = [
  { value: 'function_call', label: '函数调用', kind: 'function_call' },
  { value: 'vision', label: '视觉', kind: 'vision' },
  { value: 'reasoning', label: '推理（问答）', kind: 'chat' },
  { value: 'image', label: '图片生成', kind: 'image' },
  { value: 'video', label: '视频生成', kind: 'video' },
];
const capDefs = computed(() =>
  CAP_DEFS.filter((c) => {
    if (c.value === 'image') return form.value.type === 'image';
    if (c.value === 'video') return form.value.type === 'video';
    return true;
  }),
);
const capTesting = ref('');

const form = ref({
  modelId: '', alias: '', type: 'llm', contextWindowK: 256,
  capabilities: ['reasoning'] as string[],
  description: '',
  pricingInput: 0, pricingOutput: 0,
});

onMounted(async () => {
  await store.loadPlatforms();
  await store.loadModels(platformId.value);
});

function back() { router.push('/models'); }

function capabilityLabel(cap: string) {
  const m: Record<string, string> = { function_call: '函数调用', vision: '视觉', reasoning: '推理', image: '图片生成', video: '视频生成' };
  return m[cap] || cap;
}

function openAddModel() {
  resetModelForm();
  showAdd.value = true;
}

function closeModelDialog() {
  showAdd.value = false;
  resetModelForm();
}

function formatWindow(n: number): string {
  if (n >= 1048576) {
    const m = n / 1048576;
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  if (n >= 1024) return `${Math.round(n / 1024)}K`;
  return String(n);
}

async function fetchRemote() {
  if (platform.value?.isBuiltin) { ElMessage.warning('内置平台不可拉取或修改模型'); return; }
  fetching.value = true;
  try {
    const ids = await store.fetchRemoteModels(platformId.value);
    ElMessage.success(`拉取成功，新增 ${ids.length} 个模型`);
  } catch (e: any) {
    ElMessage.error(e?.message || '拉取失败');
  } finally { fetching.value = false; }
}

/** 卡片整块可点：直接进编辑，省得去找卡片右下角那个小到看不见的「编辑」 */
function onCardClick(m: any) {
  if (batchMode.value) { toggleModelSelect(m.id); return; }
  editModel(m);
}

function editModel(m: any) {
  if (m.isBuiltin) { ElMessage.warning('内置模型不可编辑'); return; }
  editingModelId.value = m.id;
  form.value = {
    modelId: m.modelId, alias: m.alias || '', type: m.type || 'llm',
    contextWindowK: Math.max(1, Math.round((m.contextWindow || 262144) / 1024)),
    // 历史模型未标能力且是 llm → 预勾「推理」（能问答即具备），其它能力仍以数据库为准
    capabilities: (m.capabilities || []).length
      ? [...(m.capabilities || [])]
      : (m.type || 'llm') === 'llm' ? ['reasoning'] : [],
    description: m.description || '',
    pricingInput: m.pricing?.input || 0, pricingOutput: m.pricing?.output || 0,
  };
  showAdd.value = true;
}

async function addOrEditModel() {
    if (!form.value.modelId) { ElMessage.warning('模型 ID 必填'); return; }
    if (editingModelId.value) {
      await store.updateModel(editingModelId.value, {
        modelId: form.value.modelId, alias: form.value.alias,
        type: form.value.type as any, contextWindow: (form.value.contextWindowK || 128) * 1024,
        capabilities: form.value.capabilities,
        description: form.value.description,
        pricing: { input: form.value.pricingInput, output: form.value.pricingOutput },
      });
      ElMessage.success('已更新');
    } else {
      await store.addModel({
        platformId: platformId.value, modelId: form.value.modelId,
        alias: form.value.alias, type: form.value.type as any,
        contextWindow: (form.value.contextWindowK || 256) * 1024, enabled: true, isDefault: false,
        capabilities: form.value.capabilities,
        description: form.value.description,
        pricing: { input: form.value.pricingInput, output: form.value.pricingOutput },
      });
      ElMessage.success('已添加');
    }
    showAdd.value = false;
    resetModelForm();
  }

function resetModelForm() {
  editingModelId.value = '';
  form.value = { modelId: '', alias: '', type: 'llm', contextWindowK: 256, capabilities: ['reasoning'], description: '', pricingInput: 0, pricingOutput: 0 };
}

async function updateAlias(row: any) { if (row.isBuiltin) return; await store.updateModel(row.id, { alias: row.alias }); }
async function toggleEnabled(row: any) { if (row.isBuiltin) return; await store.updateModel(row.id, { enabled: row.enabled }); }
async function setDefault(row: any) { if (row.isBuiltin) { ElMessage.warning('内置模型不可设为默认'); return; } await store.updateModel(row.id, { isDefault: true }); ElMessage.success(`已设为默认：${row.modelId}`); }

function toggleModelSelect(id: string) {
  const m = models.value.find((x) => x.id === id);
  if (m?.isBuiltin) return;
  const next = new Set(selectedModelIds.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  selectedModelIds.value = next;
}
function batchSelectAll() {
  selectedModelIds.value = new Set(models.value.filter(m => m.enabled && !m.isBuiltin).map(m => m.id));
}
async function applyBatchContext() {
  if (selectedModelIds.value.size === 0) return;
  batchSaving.value = true;
  try {
    for (const id of selectedModelIds.value) {
      await store.updateModel(id, { contextWindow: (batchContextWindowK.value || 256) * 1024 });
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
    testResult.value = { ...r, title: `连通测试 · ${row.modelId}` };
    testResultDialog.value = true;
  } finally { testing.value = ''; }
}

/** 每种模型类型可跑的测试项 */
function testKindsOf(m: any): { kind: string; label: string }[] {
  // 所有模型都给全三项（问答/视觉/工具）——不支持会在结果里如实报失败，不该出现空下拉
  const base = [
    { kind: 'chat', label: '基础问答' },
    { kind: 'vision', label: '视觉识图' },
    { kind: 'function_call', label: '工具调用' },
  ];
  if (m.type === 'embedding') base.push({ kind: 'embedding', label: '向量嵌入' });
  if (m.type === 'image') base.push({ kind: 'image', label: '图片生成' });
  if (m.type === 'video') base.push({ kind: 'video', label: '视频生成' });
  return base;
}

/** 卡片下拉：单项测试 / 自动检测全部 */
async function runCapabilityTest(m: any, kind: string) {
  if (kind === '__auto') { await autoDetectCapabilities(m); return; }
  testing.value = m.id;
  try {
    const r = await store.testModelCapability(m.id, kind as any);
    testResult.value = {
      ok: r.ok,
      msg: r.msg,
      title: `${r.label} · ${m.modelId}`,
      durationMs: r.durationMs,
      detail: r.detail,
      applied: r.ok && r.capability ? [capabilityLabel(r.capability)] : [],
    };
    testResultDialog.value = true;
  } catch (e: any) {
    ElMessage.error(e?.message || '测试失败');
  } finally { testing.value = ''; }
}

/** 自动检测：跑 chat / vision / function_call，把通过的写回能力 */
async function autoDetectCapabilities(m: any) {
  testing.value = m.id;
  try {
    const kinds = ['chat', 'vision', 'function_call'];
    // 按模型类型追加专属测试项（image/video 的三项基础测试对它们通常必失败，专属项才是有效信号）
    if (m.type === 'image') kinds.push('image');
    if (m.type === 'video') kinds.push('video');
    const list: { kind: string; label: string; ok: boolean; msg: string; durationMs: number }[] = [];
    const applied: string[] = [];
    for (const k of kinds) {
      const r = await store.testModelCapability(m.id, k as any);
      list.push({ kind: k, label: r.label, ok: r.ok, msg: r.msg, durationMs: r.durationMs });
      if (r.ok && r.capability) applied.push(capabilityLabel(r.capability));
    }
    testResult.value = {
      ok: list.some((x) => x.ok),
      msg: `通过 ${list.filter((x) => x.ok).length}/${list.length} 项`,
      title: `自动检测 · ${m.modelId}`,
      list,
      applied,
    };
    testResultDialog.value = true;
  } catch (e: any) {
    ElMessage.error(e?.message || '自动检测失败');
  } finally { testing.value = ''; }
}

/** 编辑弹窗里：点某个能力旁的「测试」，通过即勾上 */
async function testCapabilityInForm(c: { value: string; label: string; kind: string }) {
  if (!editingModelId.value) { ElMessage.warning('请先保存模型，再测试能力'); return; }
  capTesting.value = c.kind;
  try {
    // autoApply=false：编辑态只回显结果，由用户决定是否保存；通过则顺手勾上
    const r = await store.testModelCapability(editingModelId.value, c.kind as any, { autoApply: false });
    if (r.ok) {
      if (!form.value.capabilities.includes(c.value)) form.value.capabilities.push(c.value);
      ElMessage.success(`${c.label}：通过（${r.durationMs}ms）${r.detail ? ` — ${r.detail}` : ''}`);
    } else {
      ElMessage.warning(`${c.label}：未通过 — ${r.msg}`);
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '测试失败');
  } finally { capTesting.value = ''; }
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
  transition: all 0.2s ease; cursor: pointer;
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
.model-card-desc { font-size: 12px; color: var(--color-text-secondary); line-height: 1.5; }

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
.ctx-editor { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.ctx-input-row { display: flex; align-items: center; }
.ctx-preset-btn { margin-left: 8px; }
.test-result { padding: 12px; }
.test-detail { margin-top: -8px; padding: 0 24px 12px; font-size: 13px; color: var(--color-text-secondary); line-height: 1.8; }

/* 能力测试：每个能力后跟一个「测试」按钮 */
.cap-group { display: flex; flex-wrap: wrap; gap: 4px 18px; align-items: center; }
.cap-item { display: inline-flex; align-items: center; gap: 2px; }
.cap-tip { margin-left: 0; margin-top: 6px; line-height: 1.6; }
.cap-result-list { display: flex; flex-direction: column; gap: 10px; padding: 4px 24px 8px; }
.cap-result-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.cap-result-msg { color: var(--color-text-secondary); flex: 1; min-width: 0; }
.cap-result-ms { color: var(--color-text-secondary); font-size: 12px; }

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
