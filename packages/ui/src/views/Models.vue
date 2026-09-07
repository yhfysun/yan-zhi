<template>
  <div class="page">
    <header class="page-header">
      <h2 class="page-title">模型平台管理</h2>
      <div style="display:flex;gap:10px">
        <el-button :icon="Download" @click="showLocalMarket = true">本地模型商城</el-button>
        <el-button type="primary" :icon="Plus" @click="openAdd" class="add-btn-desktop">新增平台</el-button>
      </div>
    </header>

    <div class="platform-grid">
      <template v-if="store.loading">
        <div v-for="n in 4" :key="n" class="platform-card skeleton-card">
          <el-skeleton animated>
            <template #template>
              <el-skeleton-item variant="text" style="width:60%" />
              <el-skeleton-item variant="text" style="width:40%" />
              <el-skeleton-item variant="rect" style="height:40px;margin-top:8px" />
            </template>
          </el-skeleton>
        </div>
      </template>
      <el-card v-for="p in store.platforms" :key="p.id" class="platform-card">
        <div class="card-head">
          <div class="platform-logo">{{ p.name.slice(0, 2) }}</div>
          <div class="card-info" @click="openPlatform(p.id)">
            <div class="platform-name">{{ p.name }}</div>
            <div class="platform-url">{{ p.apiUrl }}</div>
          </div>
          <el-tag v-if="p.isBuiltin" size="small" type="warning" effect="dark">内置</el-tag>
          <span :class="['status-dot', p.status]" :title="p.lastHealthAt ? `最近健康：${p.lastHealthAt}` : ''"></span>
        </div>
        <div class="platform-meta">
          <span>协议：{{ p.protocol }}</span>
          <span class="meta-sep">·</span>
          <span>{{ modelCount(p.id) }} 个模型</span>
        </div>
        <div class="card-actions">
          <el-button size="small" :loading="testing === p.id" @click="test(p.id)">测试</el-button>
          <el-button size="small" @click="openPlatform(p.id)">管理模型</el-button>
              <el-button v-if="!p.isBuiltin" size="small" @click="editPlatform(p)">编辑</el-button>
              <el-button size="small" type="danger" @click="del(p.id)">删除</el-button>
        </div>
      </el-card>
      <el-empty v-if="store.platforms.length === 0" description="还没有平台，点击右下角新增" />
    </div>

    <el-dialog v-model="showAdd" :title="editingId ? '编辑平台' : '新增平台'" width="640px" top="6vh" class="platform-edit-dialog" :close-on-click-modal="false" @closed="resetForm">
      <el-form label-width="90px">
        <el-form-item label="名称"><el-input v-model="form.name" placeholder="如：OpenAI / DeepSeek" /></el-form-item>
        <el-form-item label="协议">
          <el-select v-model="form.protocol">
            <el-option label="OpenAI" value="openai" />
            <el-option label="Anthropic" value="anthropic" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="API URL">
          <el-input v-model="form.apiUrl" placeholder="https://api.openai.com（填到域名，不要带 /v1）" />
          <div class="form-tip">填基础地址即可，系统自动拼接 <code>/v1/chat/completions</code>、<code>/v1/models</code> 等路径</div>
        </el-form-item>
        <el-form-item label="API Key">
          <div class="apikey-list">
            <div v-for="(k, i) in formKeys" :key="i" class="apikey-row">
              <el-input
                v-model="k.apiKey"
                type="password"
                show-password
                placeholder="sk-..."
                class="apikey-input"
              />
              <el-input v-model="k.label" placeholder="备注" class="apikey-label" />
              <el-button :icon="Delete" circle size="small" @click="formKeys.splice(i, 1)" />
            </div>
            <el-button size="small" :icon="Plus" @click="formKeys.push({ apiKey: '', label: '' })">添加 Token</el-button>
            <div class="form-tip">配置多个 Token 加权随机轮询：请求失败只降低该 Token 的被选概率（失败次数越多权重越低），不会停用；单次请求失败自动换 Token 重试（最多 3 次）。要排除某个 Token 请用开关手动停用</div>
          </div>
        </el-form-item>
        <el-form-item label="请求停顿">
          <div class="pause-range">
            <el-input-number v-model="form.pauseMinMs" :min="0" :max="60000" :step="100" controls-position="right" placeholder="最小" />
            <span class="pause-sep">~</span>
            <el-input-number v-model="form.pauseMaxMs" :min="0" :max="60000" :step="100" controls-position="right" placeholder="最大" />
            <span class="pause-unit">毫秒</span>
          </div>
          <div class="form-tip">每次请求前随机停顿此区间，避免短时间请求过多被限流。0 表示不停顿</div>
        </el-form-item>
      </el-form>

      <div v-if="editingId" class="apikey-manage">
        <div class="apikey-manage-title">已配置 Token（实时管理）</div>
        <div v-for="k in store.apiKeys" :key="k.id" class="apikey-manage-row">
          <el-switch v-model="k.enabled" size="small" :disabled="keyBusy(k.id)" @change="toggleKey(k)" />
          <span class="apikey-manage-key" :class="{ 'apikey-disabled': !k.enabled }">{{ k.apiKey.slice(0, 8) }}****{{ k.apiKey.slice(-4) }}</span>
          <el-tag v-if="k.label" size="small" type="info">{{ k.label }}</el-tag>
          <el-tag v-if="!k.enabled" size="small" type="warning">已停用</el-tag>
          <el-tag size="small" :type="k.failCount > 0 ? 'danger' : 'success'">失败 {{ k.failCount }} 次</el-tag>
          <el-button size="small" link :loading="testingKeyId === k.id" :disabled="keyBusy(k.id)" @click="testKey(k)">测试</el-button>
          <el-button v-if="k.failCount > 0" size="small" link @click="resetKey(k)">重置</el-button>
          <el-button size="small" link type="danger" @click="delKey(k)">删除</el-button>
        </div>
        <el-empty v-if="store.apiKeys.length === 0" description="暂无 Token" :image-size="40" />
      </div>

      <div class="dialog-actions-bar" v-if="!editingId">
        <el-button :loading="testingForm" :icon="Connection" @click="testForm">测试连接</el-button>
        <el-button :loading="fetching" :icon="Download" @click="fetchModels">拉取模型列表</el-button>
        <span v-if="formStatus" :class="['form-status', formStatusType]">{{ formStatus }}</span>
      </div>

      <div v-if="!editingId && fetchedModels.length > 0" class="fetched-models">
        <div class="fetched-header">
          <el-checkbox v-model="checkAll" :indeterminate="isIndeterminate" @change="onCheckAll">全选</el-checkbox>
          <span class="fetched-count">共 {{ fetchedModels.length }} 个，已选 {{ checkedModelIds.length }}</span>
        </div>
        <el-checkbox-group v-model="checkedModelIds" class="fetched-list">
          <el-checkbox v-for="m in fetchedModels" :key="m.id" :value="m.id" class="fetched-item">
            <span class="model-id">{{ m.id }}</span>
            <el-tag v-if="m.type" size="small" type="info">{{ m.type }}</el-tag>
          </el-checkbox>
        </el-checkbox-group>
      </div>

      <template #footer>
        <el-button @click="closeAdd">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ editingId ? '保存修改' : '保存' }}</el-button>
      </template>
    </el-dialog>

    <!-- 管理模型：弹窗内嵌平台详情，不再路由跳转（在设置抽屉中打开也不会切走主页面） -->
    <el-dialog
      v-model="showDetail"
      :title="detailTitle"
      width="860px"
      top="6vh"
      class="platform-detail-dialog"
      destroy-on-close
    >
      <PlatformDetail :key="detailId" :platform-id="detailId" embedded />
    </el-dialog>

    <!-- Mobile FAB -->
    <el-button type="primary" :icon="Plus" circle class="mobile-fab" @click="openAdd" />

    <!-- 本地模型商城：国内源下载 / 测试启用 / 删除 / Ollama 接入 -->
    <LocalModelMarket v-model="showLocalMarket" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Plus, Connection, Download, Delete } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { ModelType, PlatformApiKey } from '@yan-zhi/shared';
import { usePlatformStore } from '../stores';
import PlatformDetail from './PlatformDetail.vue';
import LocalModelMarket from '../components/LocalModelMarket.vue';

const store = usePlatformStore();
const showAdd = ref(false);
const showLocalMarket = ref(false);

const showDetail = ref(false);
const detailId = ref('');
const detailTitle = computed(() => {
  const p = store.platforms.find((x) => x.id === detailId.value);
  return p ? `管理模型 - ${p.name}` : '管理模型';
});
const editingId = ref('');
const testing = ref('');
const form = ref({ name: '', protocol: 'openai', apiUrl: '', pauseMinMs: 0, pauseMaxMs: 0 });
const formKeys = ref<Array<{ apiKey: string; label: string }>>([]);

// 测试 / 拉取状态
const testingForm = ref(false);
const fetching = ref(false);
const saving = ref(false);
const formStatus = ref('');
const formStatusType = ref<'ok' | 'err'>('ok');
const fetchedModels = ref<{ id: string; type?: string }[]>([]);
const checkedModelIds = ref<string[]>([]);

const checkAll = computed(() => fetchedModels.value.length > 0 && checkedModelIds.value.length === fetchedModels.value.length);
const isIndeterminate = computed(() => checkedModelIds.value.length > 0 && checkedModelIds.value.length < fetchedModels.value.length);

// 以数据库 status 为准，不进页自动 ping（避免线上平台因瞬时抖动被误判掉线）。
// 需要校验时由用户手动点"测试连通性"按钮。
onMounted(() => {
  store.loadPlatforms();
});

function modelCount(platformId: string) {
  return store.models.filter((m) => m.platformId === platformId).length;
}

function setStatus(msg: string, type: 'ok' | 'err' = 'ok') {
  formStatus.value = msg;
  formStatusType.value = type;
}

function openAdd() {
  resetForm();
  formKeys.value = [{ apiKey: '', label: '' }];
  showAdd.value = true;
}

function closeAdd() {
  showAdd.value = false;
  resetForm();
}

async function testForm() {
  if (!form.value.apiUrl) { ElMessage.warning('请先填写 API URL'); return; }
  testingForm.value = true;
  formStatus.value = '';
  try {
    const firstKey = formKeys.value.find((k) => k.apiKey.trim())?.apiKey.trim() || '';
    // 编辑已有平台时表单里没有明文 Key：带 platformId 让后端回退 Token 池轮换
    const r = await store.testPlatformConfig({ apiUrl: form.value.apiUrl, apiKey: firstKey, platformId: editingId.value || undefined });
    if (r.ok) {
      setStatus(`${r.msg}（${r.durationMs}ms）`, 'ok');
      ElMessage.success(r.msg);
    } else {
      setStatus(r.msg, 'err');
      ElMessage.error(r.msg);
    }
  } finally {
    testingForm.value = false;
  }
}

async function fetchModels() {
  if (!form.value.apiUrl) { ElMessage.warning('请先填写 API URL'); return; }
  fetching.value = true;
  formStatus.value = '';
  fetchedModels.value = [];
  checkedModelIds.value = [];
  try {
    const firstKey = formKeys.value.find((k) => k.apiKey.trim())?.apiKey.trim() || '';
    // 同 testForm：编辑已有平台时无明文 Key，带 platformId 回退 Token 池
    const r = await store.fetchModelsPreview({ apiUrl: form.value.apiUrl, apiKey: firstKey, platformId: editingId.value || undefined });
    if (r.ok) {
      fetchedModels.value = r.models;
      checkedModelIds.value = r.models.map((m: { id: string }) => m.id);
      setStatus(r.msg, 'ok');
      ElMessage.success(`拉取到 ${r.models.length} 个模型`);
    } else {
      setStatus(r.msg, 'err');
      ElMessage.error(r.msg);
    }
  } finally {
    fetching.value = false;
  }
}

function onCheckAll(val: any) {
  checkedModelIds.value = val ? fetchedModels.value.map((m) => m.id) : [];
}

function editPlatform(p: any) {
  if (p.isBuiltin) { ElMessage.warning('内置平台不可编辑'); return; }
  editingId.value = p.id;
  form.value = { name: p.name, protocol: p.protocol || 'openai', apiUrl: p.apiUrl, pauseMinMs: p.pauseMinMs || 0, pauseMaxMs: p.pauseMaxMs || 0 };
  formKeys.value = [];
  fetchedModels.value = [];
  checkedModelIds.value = [];
  formStatus.value = '';
  store.loadApiKeys(p.id);
  showAdd.value = true;
}

async function save() {
  if (!form.value.name || !form.value.apiUrl) {
    ElMessage.warning('名称和 API URL 必填');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      const patch: any = {
        name: form.value.name,
        protocol: form.value.protocol as any,
        apiUrl: form.value.apiUrl,
        pauseMinMs: form.value.pauseMinMs,
        pauseMaxMs: form.value.pauseMaxMs,
      };
      await store.updatePlatform(editingId.value, patch);
      for (const k of formKeys.value) {
        if (k.apiKey.trim()) {
          await store.addApiKey(editingId.value, k.apiKey.trim(), k.label.trim() || undefined);
        }
      }
      ElMessage.success('已更新');
    } else {
      const firstKey = formKeys.value.find((k) => k.apiKey.trim());
      const platformId = await store.addPlatform({
        name: form.value.name,
        protocol: form.value.protocol as any,
        apiUrl: form.value.apiUrl,
        apiKeyEnc: firstKey?.apiKey.trim() || '',
        headers: {},
        status: 'unknown',
        pauseMinMs: form.value.pauseMinMs,
        pauseMaxMs: form.value.pauseMaxMs,
      });
      for (const k of formKeys.value) {
        if (k.apiKey.trim() && k !== firstKey) {
          await store.addApiKey(platformId, k.apiKey.trim(), k.label.trim() || undefined);
        }
      }
      for (const modelId of checkedModelIds.value) {
        await store.addModel({
          platformId,
          modelId,
          alias: modelId.split('/').pop() || modelId,
          type: (fetchedModels.value.find((m: any) => m.id === modelId)?.type || 'llm') as ModelType,
          contextWindow: 131072,
          enabled: true,
          isDefault: false,
        });
      }
      ElMessage.success(`已添加平台${checkedModelIds.value.length > 0 ? `，含 ${checkedModelIds.value.length} 个模型` : ''}`);
    }
    showAdd.value = false;
    resetForm();
  } catch (e: any) {
    ElMessage.error('保存失败: ' + e.message);
  } finally {
    saving.value = false;
  }
}

function resetForm() {
  editingId.value = '';
  form.value = { name: '', protocol: 'openai', apiUrl: '', pauseMinMs: 0, pauseMaxMs: 0 };
  formKeys.value = [];
  formStatus.value = '';
  fetchedModels.value = [];
  checkedModelIds.value = [];
}

async function resetKey(k: PlatformApiKey) {
  await store.resetApiKeyFailCount(k.id, k.platformId);
  ElMessage.success('已重置失败次数');
}

// 单 Key 测试 / 启停
const testingKeyId = ref('');
const busyKeyIds = ref(new Set<string>());
function keyBusy(id: string) {
  return busyKeyIds.value.has(id) || testingKeyId.value === id;
}

async function testKey(k: PlatformApiKey) {
  testingKeyId.value = k.id;
  try {
    const r = await store.testApiKey(k.id, k.platformId);
    if (r.ok) ElMessage.success(`${r.message}（${r.durationMs ?? 0}ms）`);
    else ElMessage.error(r.message);
  } finally {
    testingKeyId.value = '';
  }
}

async function toggleKey(k: PlatformApiKey) {
  busyKeyIds.value.add(k.id);
  const newVal = k.enabled; // v-model 已先改值，即目标状态
  try {
    await store.updateApiKey(k.id, { enabled: newVal }, k.platformId);
    ElMessage.success(newVal ? '已启用' : '已停用');
  } catch {
    k.enabled = !newVal; // 失败回滚开关显示
  } finally {
    busyKeyIds.value.delete(k.id);
  }
}

async function delKey(k: PlatformApiKey) {
  try {
    await ElMessageBox.confirm('确认删除此 Token？', '提示', { type: 'warning' });
    await store.deleteApiKey(k.id, k.platformId);
    ElMessage.success('已删除');
  } catch {}
}

async function test(id: string) {
  testing.value = id;
  try {
    const r = await store.testConnectivity(id);
    if (r.ok) ElMessage.success(`${r.msg}（${r.durationMs}ms）`);
    else ElMessage.error(r.msg);
  } finally {
    testing.value = '';
  }
}

function openPlatform(id: string) {
  detailId.value = id;
  showDetail.value = true;
}

async function del(id: string) {
  const p = store.platforms.find((x) => x.id === id);

  try {
    await ElMessageBox.confirm('删除平台会同时删除其下所有模型，确认？', '提示', { type: 'warning' });
    await store.deletePlatform(id);
    ElMessage.success('已删除');
  } catch {}
}
</script>

<style scoped>
/* .page / .page-header / .page-title come from App.vue global */
.platform-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }

.platform-card { background: var(--glass-bg); backdrop-filter: var(--glass-filter); }
.card-head { display: flex; align-items: center; gap: 12px; }
.card-info { flex: 1; cursor: pointer; }
.card-info:hover .platform-name { color: var(--color-primary); }
.platform-logo { width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #3B82F6, #2563EB); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; }
.platform-name { font-weight: 600; transition: color 0.2s; }
.platform-url { font-size: 12px; color: var(--color-text-secondary); }
.status-dot { width: 8px; height: 8px; border-radius: 50%; }
.status-dot.healthy { background: #10b981; box-shadow: 0 0 6px #10b981; }
.status-dot.down { background: #ef4444; }
.status-dot.unknown { background: #94a3b8; }
.platform-meta { margin-top: 12px; font-size: 13px; color: var(--color-text-secondary); display: flex; gap: 6px; }
.meta-sep { opacity: 0.5; }
.card-actions { margin-top: 12px; display: flex; gap: 8px; }
.form-tip { font-size: 12px; color: var(--color-text-secondary); margin-top: 4px; line-height: 1.5; }
.form-tip code { background: rgba(59, 130, 246, 0.1); padding: 1px 4px; border-radius: 3px; font-family: "JetBrains Mono", "Cascadia Code", monospace; }

/* Desktop show button, mobile hide it */
.add-btn-desktop { }
.mobile-fab {
  display: none;
  position: fixed;
  right: 20px;
  z-index: 99;
  width: 48px;
  height: 48px;
  box-shadow: 0 4px 16px rgba(124, 58, 237, 0.45);
  border-radius: 50%;
  bottom: calc(56px + 12px + env(safe-area-inset-bottom, 0px));
}

@media (max-width: 767px) {
  .add-btn-desktop { display: none; }
  .mobile-fab { display: flex; }
  .platform-grid { grid-template-columns: 1fr; gap: 14px; }
  .card-actions { flex-wrap: wrap; gap: 6px; }
  .card-actions .el-button { font-size: 12px; padding: 5px 10px; }
}

/* Skeleton card — looks like a real card */
.skeleton-card {
  padding: 16px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
}

/* Dialog action buttons bar */
.dialog-actions-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0 12px;
  border-top: 1px dashed var(--color-border-light);
  margin-top: 8px;
}
@media (max-width: 767px) {
  .dialog-actions-bar {
    flex-direction: row;
    gap: 6px;
    padding: 6px 0 10px;
  }
  .dialog-actions-bar .el-button {
    flex: 1;
    justify-content: center;
    white-space: nowrap;
    font-size: 13px;
    padding: 8px 6px;
  }
}

.form-status { font-size: 12px; margin-left: auto; }
.form-status.ok { color: var(--el-color-success); }
.form-status.err { color: var(--el-color-danger); }

.fetched-models {
  margin-top: 8px;
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  padding: 8px 12px;
  max-height: 240px;
  overflow-y: auto;
  background: var(--color-bg-secondary);
}
.fetched-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border-light);
  margin-bottom: 8px;
}
.fetched-count { font-size: 12px; color: var(--color-text-secondary); }
.fetched-list { display: flex; flex-direction: column; gap: 4px; }
.fetched-item {
  display: flex !important;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
}
.fetched-item:hover { background: rgba(99, 102, 241, 0.08); }
.model-id { font-family: "JetBrains Mono", "Cascadia Code", monospace; font-size: 12px; }

.apikey-list { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.apikey-row { display: flex; align-items: center; gap: 8px; }
.apikey-input { flex: 1; }
.apikey-label { width: 120px; }
.pause-range { display: flex; align-items: center; gap: 8px; }
.pause-sep { color: var(--color-text-secondary); }
.pause-unit { font-size: 13px; color: var(--color-text-secondary); }
.apikey-manage { margin: 8px 0; padding: 12px; border: 1px solid var(--color-border-light); border-radius: 8px; background: var(--color-bg-secondary); }
.apikey-manage-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.apikey-manage-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--color-border-light); }
.apikey-manage-row:last-child { border-bottom: none; }
.apikey-manage-key { font-family: "JetBrains Mono", "Cascadia Code", monospace; font-size: 12px; flex: 1; }
.apikey-manage-key.apikey-disabled { opacity: 0.45; text-decoration: line-through; }

</style>

<style>
/* 平台详情弹窗：内容区限高独立滚动，避免模型多时撑出屏幕；
   内嵌的 .page 去掉整页 padding/滚动，并恢复被设置抽屉隐藏的页内标题 */
/* 平台编辑弹窗：Token 配置多时内容区限高、内部上下滚动，避免弹窗撑出屏幕 */
.platform-edit-dialog .el-dialog__body {
  max-height: calc(88vh - 130px);
  overflow-y: auto;
}
.platform-detail-dialog .el-dialog__body {
  max-height: calc(88vh - 120px);
  overflow-y: auto;
  padding-top: 8px;
}
.platform-detail-dialog .page {
  padding: 0;
  min-height: 0;
  overflow: visible;
}
.platform-detail-dialog .page-header {
  justify-content: space-between !important;
}
.platform-detail-dialog .page-title {
  display: block !important;
}
</style>
