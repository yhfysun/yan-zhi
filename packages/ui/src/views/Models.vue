<template>
  <div class="page">
    <header class="page-header">
      <h2 class="page-title">模型平台管理</h2>
      <el-button type="primary" @click="showAdd = true">
        <el-icon><Plus /></el-icon> 新增平台
      </el-button>
    </header>

    <div class="platform-grid">
      <template v-if="store.loading">
        <el-skeleton v-for="n in 4" :key="n" animated style="padding:16px">
          <template #template><el-skeleton-item variant="text" style="width:60%" /><el-skeleton-item variant="text" style="width:40%" /><el-skeleton-item variant="rect" style="height:40px;margin-top:8px" /></template>
        </el-skeleton>
      </template>
      <el-card v-for="p in store.platforms" :key="p.id" class="platform-card">
        <div class="card-head">
          <div class="platform-logo">{{ p.name.slice(0, 2) }}</div>
          <div class="card-info" @click="openPlatform(p.id)">
            <div class="platform-name">{{ p.name }}</div>
            <div class="platform-url">{{ p.apiUrl }}</div>
          </div>
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
          <el-button size="small" @click="editPlatform(p)">编辑</el-button>
          <el-button size="small" type="danger" @click="del(p.id)">删除</el-button>
        </div>
      </el-card>
      <el-empty v-if="store.platforms.length === 0" description="还没有平台，点击右上角新增" />
    </div>

    <el-dialog v-model="showAdd" :title="editingId ? '编辑平台' : '新增平台'" width="640px" :close-on-click-modal="false">
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
          <el-input
            v-model="form.apiKey"
            type="password"
            show-password
            :placeholder="editingId && !apiKeyDirty ? '已设置（不修改留空即可）' : 'sk-...'"
            @input="apiKeyDirty = true"
          />
        </el-form-item>
      </el-form>

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
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ editingId ? '保存修改' : '保存' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, Connection, Download } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { usePlatformStore } from '../stores';

const store = usePlatformStore();
const router = useRouter();
const showAdd = ref(false);
const editingId = ref('');
const apiKeyDirty = ref(false);
const testing = ref('');
const form = ref({ name: '', protocol: 'openai', apiUrl: '', apiKey: '' });

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

onMounted(() => {
  store.loadPlatforms();
  store.startHealthCheck();
});

function modelCount(platformId: string) {
  return store.models.filter((m) => m.platformId === platformId).length;
}

function setStatus(msg: string, type: 'ok' | 'err' = 'ok') {
  formStatus.value = msg;
  formStatusType.value = type;
}

async function testForm() {
  if (!form.value.apiUrl) { ElMessage.warning('请先填写 API URL'); return; }
  testingForm.value = true;
  formStatus.value = '';
  try {
    const r = await store.testPlatformConfig({ apiUrl: form.value.apiUrl, apiKey: form.value.apiKey });
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
    const r = await store.fetchModelsPreview({ apiUrl: form.value.apiUrl, apiKey: form.value.apiKey });
    if (r.ok) {
      fetchedModels.value = r.models;
      checkedModelIds.value = r.models.map((m) => m.id);
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
  editingId.value = p.id;
  apiKeyDirty.value = false;
  form.value = { name: p.name, protocol: p.protocol || 'openai', apiUrl: p.apiUrl, apiKey: p.apiKeyDec || '' };
  fetchedModels.value = [];
  checkedModelIds.value = [];
  formStatus.value = '';
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
      };
      if (apiKeyDirty.value) {
        patch.apiKeyEnc = form.value.apiKey;
      }
      await store.updatePlatform(editingId.value, patch);
      ElMessage.success('已更新');
    } else {
      const platformId = await store.addPlatform({
        name: form.value.name,
        protocol: form.value.protocol as any,
        apiUrl: form.value.apiUrl,
        apiKeyEnc: form.value.apiKey,
        headers: {},
        status: 'unknown',
      });
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
  apiKeyDirty.value = false;
  form.value = { name: '', protocol: 'openai', apiUrl: '', apiKey: '' };
  formStatus.value = '';
  fetchedModels.value = [];
  checkedModelIds.value = [];
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
  router.push(`/models/${id}`);
}

async function del(id: string) {
  try {
    await ElMessageBox.confirm('删除平台会同时删除其下所有模型，确认？', '提示', { type: 'warning' });
    await store.deletePlatform(id);
    ElMessage.success('已删除');
  } catch {}
}
</script>

<style scoped>
.page { padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.page-title { font-size: 20px; font-weight: 600; }
.platform-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
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

.dialog-actions-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0 12px;
  border-top: 1px dashed var(--color-border-light);
  margin-top: 8px;
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
</style>
