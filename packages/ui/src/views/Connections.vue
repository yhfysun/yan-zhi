<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">IM 连接</h2>
        <div class="page-sub">接入企业微信或飞书，发送文本和文件</div>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">添加连接器</el-button>
    </header>

    <div v-if="loading" class="connector-grid">
      <div v-for="n in 3" :key="n" class="connector-card skeleton-card">
        <el-skeleton animated :rows="4" />
      </div>
    </div>
    <el-empty v-else-if="connectors.length === 0" description="还没有 IM 连接器" />
    <div v-else class="connector-grid">
      <el-card v-for="c in connectors" :key="c.id" class="connector-card">
        <div class="connector-head">
          <div :class="['provider-badge', c.provider]">{{ c.provider === 'feishu' ? '飞书' : '企业微信' }}</div>
          <el-switch
            v-model="c.enabled"
            @change="toggleEnabled(c)"
          />
        </div>
        <div class="connector-name">{{ c.name }}</div>
        <div class="connector-config">{{ configSummary(c) }}</div>
        <div class="connector-actions">
          <el-button size="small" :icon="Promotion" @click="openSend(c)">发消息</el-button>
          <el-button size="small" :icon="Edit" @click="openEdit(c)">编辑</el-button>
          <el-button size="small" type="danger" :icon="Delete" @click="removeConnector(c)">删除</el-button>
        </div>
      </el-card>
    </div>

    <el-dialog v-model="showForm" :title="editingId ? '编辑连接器' : '添加连接器'" width="520px">
      <el-form label-width="90px">
        <el-form-item label="类型">
          <el-select v-model="form.provider" :disabled="!!editingId">
            <el-option label="飞书" value="feishu" />
            <el-option label="企业微信" value="wechat" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称"><el-input v-model="form.name" placeholder="如：团队通知机器人" /></el-form-item>

        <template v-if="form.provider === 'feishu'">
          <el-form-item label="App ID"><el-input v-model="form.appId" /></el-form-item>
          <el-form-item label="App Secret"><el-input v-model="form.appSecret" type="password" show-password /></el-form-item>
        </template>
        <template v-else>
          <el-form-item label="Corp ID"><el-input v-model="form.corpId" /></el-form-item>
          <el-form-item label="Secret"><el-input v-model="form.secret" type="password" show-password /></el-form-item>
          <el-form-item label="Agent ID"><el-input v-model="form.agentId" /></el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="showForm = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showSend" title="发送消息" width="560px">
      <template v-if="activeConnector">
        <el-form label-width="90px">
          <el-form-item label="接收方">
            <el-input v-model="sendForm.to" :placeholder="activeConnector.provider === 'feishu' ? '用户 open_id / user_id / chat_id' : '企业微信 UserID'" />
          </el-form-item>
          <el-form-item v-if="activeConnector.provider === 'feishu'" label="接收类型">
            <el-select v-model="sendForm.receiveIdType">
              <el-option label="open_id" value="open_id" />
              <el-option label="user_id" value="user_id" />
              <el-option label="chat_id" value="chat_id" />
            </el-select>
          </el-form-item>
          <el-form-item label="文本">
            <el-input v-model="sendForm.content" type="textarea" :rows="4" placeholder="要发送的文本" />
          </el-form-item>
          <el-form-item label="文件">
            <div class="file-picker">
              <el-button size="small" :icon="Upload" @click="pickFile">选择文件</el-button>
              <span v-if="sendFile" class="file-name">{{ sendFile.name }}</span>
              <span v-else class="file-name empty">未选择</span>
              <el-button v-if="sendFile" link type="danger" @click="clearFile">移除</el-button>
            </div>
          </el-form-item>
        </el-form>
        <input ref="fileInput" type="file" style="display: none" @change="onFileChange" />
      </template>
      <template #footer>
        <el-button @click="showSend = false">取消</el-button>
        <el-button type="primary" :loading="sending" @click="send">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Plus, Promotion, Edit, Delete, Upload } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api/client';

const connectors = ref<any[]>([]);
const loading = ref(false);
const showForm = ref(false);
const showSend = ref(false);
const editingId = ref('');
const saving = ref(false);
const sending = ref(false);
const activeConnector = ref<any | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const sendFile = ref<{ name: string; data: string } | null>(null);

const form = ref({
  provider: 'feishu',
  name: '',
  appId: '',
  appSecret: '',
  corpId: '',
  secret: '',
  agentId: '',
});

const sendForm = ref({
  to: '',
  content: '',
  receiveIdType: 'open_id',
});

onMounted(load);

async function load() {
  loading.value = true;
  const res = await api.get<any[]>('/im/connectors');
  loading.value = false;
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  connectors.value = res.data || [];
}

function configFrom(formValue: typeof form.value) {
  return formValue.provider === 'feishu'
    ? { appId: formValue.appId, appSecret: formValue.appSecret }
    : { corpId: formValue.corpId, secret: formValue.secret, agentId: formValue.agentId };
}

function resetForm() {
  editingId.value = '';
  form.value = { provider: 'feishu', name: '', appId: '', appSecret: '', corpId: '', secret: '', agentId: '' };
}

function openCreate() {
  resetForm();
  showForm.value = true;
}

function openEdit(c: any) {
  editingId.value = c.id;
  const config = c.config || {};
  form.value = {
    provider: c.provider,
    name: c.name,
    appId: config.appId || '',
    appSecret: config.appSecret || '',
    corpId: config.corpId || '',
    secret: config.secret || '',
    agentId: config.agentId || '',
  };
  showForm.value = true;
}

async function save() {
  if (!form.value.name.trim()) {
    ElMessage.warning('请输入名称');
    return;
  }
  saving.value = true;
  const body: Record<string, unknown> = {
    provider: form.value.provider,
    name: form.value.name,
    config: configFrom(form.value),
    enabled: true,
  };
  const res = editingId.value
    ? await api.patch<any>(`/im/connectors/${editingId.value}`, body)
    : await api.post<any>('/im/connectors', body);
  saving.value = false;
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  ElMessage.success('已保存');
  showForm.value = false;
  await load();
}

async function toggleEnabled(c: any) {
  const res = await api.patch<any>(`/im/connectors/${c.id}`, { enabled: c.enabled });
  if ('error' in res) {
    ElMessage.error(res.error);
    c.enabled = !c.enabled;
  }
}

async function removeConnector(c: any) {
  try {
    await ElMessageBox.confirm(`确认删除连接器「${c.name}」？`, '提示', { type: 'warning' });
  } catch {
    return;
  }
  const res = await api.delete<any>(`/im/connectors/${c.id}`);
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  ElMessage.success('已删除');
  await load();
}

function configSummary(c: any) {
  const config = c.config || {};
  if (c.provider === 'feishu') return config.appId ? `App ID ${config.appId}` : '未配置凭据';
  return config.corpId ? `Corp ID ${config.corpId}` : '未配置凭据';
}

function openSend(c: any) {
  activeConnector.value = c;
  sendForm.value = { to: '', content: '', receiveIdType: 'open_id' };
  sendFile.value = null;
  showSend.value = true;
}

function pickFile() {
  fileInput.value?.click();
}

function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    sendFile.value = { name: file.name, data: String(reader.result || '') };
  };
  reader.readAsDataURL(file);
}

function clearFile() {
  sendFile.value = null;
  if (fileInput.value) fileInput.value.value = '';
}

async function send() {
  if (!activeConnector.value) return;
  if (!sendForm.value.to.trim()) {
    ElMessage.warning('请输入接收方');
    return;
  }
  if (!sendForm.value.content.trim() && !sendFile.value) {
    ElMessage.warning('请填写文本或选择文件');
    return;
  }
  sending.value = true;
  const body: Record<string, unknown> = {
    to: sendForm.value.to,
    content: sendForm.value.content || undefined,
    receiveIdType: activeConnector.value.provider === 'feishu' ? sendForm.value.receiveIdType : undefined,
  };
  if (sendFile.value) body.file = sendFile.value;
  const res = await api.post<any>(`/im/connectors/${activeConnector.value.id}/send`, body);
  sending.value = false;
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  ElMessage.success('发送成功');
  showSend.value = false;
  clearFile();
}
</script>

<style scoped>
.connector-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.connector-card {
  border-radius: var(--radius-md);
}

.connector-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.provider-badge {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.provider-badge.feishu {
  color: #0b7a75;
  background: rgba(20, 184, 166, 0.12);
}

.provider-badge.wechat {
  color: #1f9d55;
  background: rgba(34, 197, 94, 0.12);
}

.connector-name {
  margin: 14px 0 4px;
  font-size: 17px;
  font-weight: 700;
}

.connector-config {
  min-height: 20px;
  font-size: 12px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connector-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 16px;
}

.skeleton-card {
  padding: 18px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
}

.file-picker {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
}

.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.file-name.empty {
  opacity: 0.55;
}

@media (max-width: 767px) {
  .connector-grid {
    grid-template-columns: 1fr;
  }
}
</style>
