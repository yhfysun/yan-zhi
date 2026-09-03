<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">IM 连接</h2>
        <div class="page-sub">接入飞书 / 企业微信，按向导一步步来</div>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">添加连接器</el-button>
    </header>

    <div v-if="loading" class="connector-grid">
      <div v-for="n in 3" :key="n" class="connector-card skeleton-card">
        <el-skeleton animated :rows="4" />
      </div>
    </div>
    <el-empty v-else-if="connectors.length === 0" description="还没有 IM 连接器，点右上角添加" />
    <div v-else class="connector-grid">
      <el-card v-for="c in connectors" :key="c.id" class="connector-card">
        <div class="connector-head">
          <div :class="['provider-badge', c.provider]">{{ c.provider === 'feishu' ? '飞书' : '企业微信' }}</div>
          <el-switch v-model="c.enabled" @change="toggleEnabled(c)" />
        </div>
        <div class="connector-name">{{ c.name }}</div>
        <div class="connector-config">{{ configSummary(c) }}</div>
        <div class="connector-actions">
          <el-button size="small" :icon="Connection" @click="testConnector(c)">测试</el-button>
          <el-button size="small" :icon="Promotion" @click="openExport(c)">导出码</el-button>
          <el-button size="small" :icon="Edit" @click="openEdit(c)">编辑</el-button>
          <el-button size="small" type="danger" :icon="Delete" @click="removeConnector(c)">删除</el-button>
        </div>
      </el-card>
    </div>

    <!-- 配置向导 -->
    <el-dialog v-model="showWizard" :title="editingId ? '编辑连接器' : '添加连接器'" width="640px" :close-on-click-modal="false">
      <el-steps :active="step" finish-status="success" align-center class="wizard-steps">
        <el-step title="方式" />
        <el-step title="平台" />
        <el-step title="取参数" />
        <el-step title="填写" />
        <el-step title="测试" />
        <el-step title="完成" />
      </el-steps>

      <div class="wizard-body">
        <!-- 步骤 0：选方式 -->
        <div v-if="step === 0" class="step-choice">
          <button type="button" class="choice-card" @click="step = 1">
            <el-icon :size="26"><EditPen /></el-icon>
            <div class="choice-title">手动配置</div>
            <div class="choice-desc">按向导去官方后台拿参数，逐步填入</div>
          </button>
          <button type="button" class="choice-card" @click="pickImport">
            <el-icon :size="26"><Upload /></el-icon>
            <div class="choice-title">扫码 / 图片导入</div>
            <div class="choice-desc">从已配好的设备导出的二维码图片，一键导入</div>
          </button>
          <input ref="importInput" type="file" accept="image/*" style="display: none" @change="onImportFile" />
        </div>

        <!-- 步骤 1：选平台 -->
        <div v-else-if="step === 1" class="step-choice">
          <button type="button" class="choice-card" @click="chooseProvider('feishu')">
            <div class="choice-title">飞书</div>
            <div class="choice-desc">企业自建应用，收发消息</div>
          </button>
          <button type="button" class="choice-card" @click="chooseProvider('wechat')">
            <div class="choice-title">企业微信</div>
            <div class="choice-desc">自建应用，收发消息</div>
          </button>
        </div>

        <!-- 步骤 2：取参数引导 -->
        <div v-else-if="step === 2" class="step-guide">
          <template v-if="form.provider === 'feishu'">
            <ol class="guide-list">
              <li>打开 <a href="https://open.feishu.cn/app" target="_blank" rel="noopener">飞书开放平台</a>，创建「企业自建应用」</li>
              <li>在「凭证与基础信息」页拿到 <b>App ID</b>（cli_ 开头）和 <b>App Secret</b></li>
              <li>在「事件与回调 > 事件配置」填回调地址，拿到 <b>Verification Token</b></li>
              <li>在「权限管理」开通 <code>im:message</code> 等权限并发布版本</li>
            </ol>
            <div class="guide-callback">回调地址：<code>{{ callbackBase }}/api/im/inbound/feishu</code></div>
          </template>
          <template v-else>
            <ol class="guide-list">
              <li>登录 <a href="https://work.weixin.qq.com/" target="_blank" rel="noopener">企业微信管理后台</a>，在「应用管理」创建自建应用</li>
              <li>在「我的企业」拿到 <b>Corp ID</b>；应用详情页拿到 <b>Secret</b> 和 <b>Agent ID</b></li>
              <li>在「接收消息 > API 接收」设置 <b>Token</b> 和 EncodingAESKey，填回调地址</li>
            </ol>
            <div class="guide-callback">回调地址：<code>{{ callbackBase }}/api/im/inbound/wechat</code></div>
          </template>
        </div>

        <!-- 步骤 3：填表单 -->
        <div v-else-if="step === 3" class="step-form">
          <el-form label-width="110px">
            <el-form-item label="名称">
              <el-input v-model="form.name" placeholder="如：团队通知机器人" />
            </el-form-item>
            <template v-if="form.provider === 'feishu'">
              <el-form-item label="App ID">
                <el-input v-model="form.appId" placeholder="cli_xxxxxxxx" />
                <span class="field-help">凭证与基础信息页顶部</span>
              </el-form-item>
              <el-form-item label="App Secret">
                <el-input v-model="form.appSecret" type="password" show-password />
                <span class="field-help">同页，点「显示」复制</span>
              </el-form-item>
              <el-form-item label="Verify Token">
                <el-input v-model="form.verificationToken" />
                <span class="field-help">事件与回调页，配回调后生成（收消息必需）</span>
              </el-form-item>
            </template>
            <template v-else>
              <el-form-item label="Corp ID">
                <el-input v-model="form.corpId" />
                <span class="field-help">我的企业页的企业ID</span>
              </el-form-item>
              <el-form-item label="Secret">
                <el-input v-model="form.secret" type="password" show-password />
                <span class="field-help">应用详情页的 Secret</span>
              </el-form-item>
              <el-form-item label="Agent ID">
                <el-input v-model="form.agentId" />
                <span class="field-help">应用详情页的 AgentId</span>
              </el-form-item>
              <el-form-item label="Token">
                <el-input v-model="form.token" />
                <span class="field-help">接收消息 > API接收 设置的 Token（收消息必需）</span>
              </el-form-item>
              <el-form-item label="EncodingAESKey">
                <el-input v-model="form.encodingAesKey" />
                <span class="field-help">同页 43 位 EncodingAESKey（加密模式收消息必需）</span>
              </el-form-item>
            </template>
          </el-form>
        </div>

        <!-- 步骤 4：测试并保存 -->
        <div v-else-if="step === 4" class="step-test">
          <el-alert
            v-if="testResult === 'fail'"
            type="error"
            :title="testError || '测试失败'"
            show-icon
            :closable="false"
            class="test-alert"
          />
          <el-alert
            v-else
            type="info"
            title="点「测试并保存」将先保存连接器，再尝试获取 access_token 验证凭据是否正确。"
            show-icon
            :closable="false"
            class="test-alert"
          />
        </div>

        <!-- 步骤 5：完成 -->
        <div v-else-if="step === 5" class="step-done">
          <el-icon :size="40" class="done-icon"><CircleCheckFilled /></el-icon>
          <div class="done-text">连接器已保存并验证通过</div>
          <div class="done-sub">到左侧导航「消息」即可收发会话</div>
        </div>
      </div>

      <template #footer>
        <el-button @click="showWizard = false">取消</el-button>
        <el-button v-if="step > 0 && step < 4" :icon="ArrowLeft" @click="step--">上一步</el-button>
        <el-button v-if="step === 1" type="primary" disabled>请选择平台</el-button>
        <el-button v-if="step === 2" type="primary" :icon="ArrowRight" @click="step = 3">下一步</el-button>
        <el-button v-if="step === 3" type="primary" :icon="ArrowRight" @click="step = 4" :disabled="!form.name.trim()">下一步</el-button>
        <el-button v-if="step === 4" type="primary" :loading="saving || testing" @click="testAndSave">测试并保存</el-button>
        <el-button v-if="step === 5" type="primary" @click="finishWizard">完成</el-button>
      </template>
    </el-dialog>

    <!-- 导出二维码 -->
    <el-dialog v-model="showQr" title="导出配置二维码" width="320px">
      <div class="qr-wrap">
        <img v-if="qrDataUrl" :src="qrDataUrl" alt="配置二维码" class="qr-img" />
        <div class="qr-tip">在另一台设备「添加连接器 > 扫码导入」识别此图，即可一键填入</div>
        <el-button v-if="qrDataUrl" :icon="Download" @click="downloadQr">保存图片</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Plus, Promotion, Edit, Delete, Upload, EditPen, ArrowLeft, ArrowRight, CircleCheckFilled, Download, Connection } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { api } from '../api/client';

const connectors = ref<any[]>([]);
const loading = ref(false);
const showWizard = ref(false);
const showQr = ref(false);
const qrDataUrl = ref('');
const step = ref(0);
const editingId = ref('');
const saving = ref(false);
const testing = ref(false);
const testResult = ref<'' | 'ok' | 'fail'>('');
const testError = ref('');
const importInput = ref<HTMLInputElement | null>(null);

const form = ref({
  provider: 'feishu',
  name: '',
  appId: '',
  appSecret: '',
  verificationToken: '',
  corpId: '',
  secret: '',
  agentId: '',
  token: '',
  encodingAesKey: '',
});

const callbackBase = computed(() => {
  if (typeof window !== 'undefined' && window.location && window.location.origin && !window.location.origin.startsWith('file')) {
    return window.location.origin;
  }
  return 'http://127.0.0.1:3001';
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

function configFrom(f: typeof form.value) {
  return f.provider === 'feishu'
    ? { appId: f.appId, appSecret: f.appSecret, verificationToken: f.verificationToken }
    : { corpId: f.corpId, secret: f.secret, agentId: f.agentId, token: f.token, encodingAesKey: f.encodingAesKey };
}

function resetForm() {
  editingId.value = '';
  testResult.value = '';
  testError.value = '';
  form.value = { provider: 'feishu', name: '', appId: '', appSecret: '', verificationToken: '', corpId: '', secret: '', agentId: '', token: '', encodingAesKey: '' };
}

function openCreate() {
  resetForm();
  step.value = 0;
  showWizard.value = true;
}

function openEdit(c: any) {
  const config = c.config || {};
  form.value = {
    provider: c.provider,
    name: c.name,
    appId: config.appId || '',
    appSecret: config.appSecret || '',
    verificationToken: config.verificationToken || '',
    corpId: config.corpId || '',
    secret: config.secret || '',
    agentId: config.agentId || '',
    token: config.token || '',
    encodingAesKey: config.encodingAesKey || '',
  };
  editingId.value = c.id;
  testResult.value = '';
  testError.value = '';
  step.value = 3;
  showWizard.value = true;
}

function chooseProvider(p: 'feishu' | 'wechat') {
  form.value.provider = p;
  step.value = 2;
}

async function testAndSave() {
  if (!form.value.name.trim()) {
    ElMessage.warning('请输入名称');
    return;
  }
  saving.value = true;
  const body = { provider: form.value.provider, name: form.value.name, config: configFrom(form.value), enabled: true };
  const res = editingId.value
    ? await api.patch<any>(`/im/connectors/${editingId.value}`, body)
    : await api.post<any>('/im/connectors', body);
  saving.value = false;
  if ('error' in res) {
    testResult.value = 'fail';
    testError.value = res.error;
    return;
  }
  if (!editingId.value) editingId.value = res.data.id;
  testing.value = true;
  const tr = await api.post<any>(`/im/connectors/${editingId.value}/test`);
  testing.value = false;
  if ('error' in tr) {
    testResult.value = 'fail';
    testError.value = tr.error;
    return;
  }
  testResult.value = 'ok';
  step.value = 5;
}

async function finishWizard() {
  showWizard.value = false;
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

async function testConnector(c: any) {
  const res = await api.post<any>(`/im/connectors/${c.id}/test`);
  if ('error' in res) ElMessage.error(`测试失败：${res.error}`);
  else ElMessage.success('连接正常');
}

function configSummary(c: any) {
  const config = c.config || {};
  if (c.provider === 'feishu') return config.appId ? `App ID ${config.appId}` : '未配置凭据';
  return config.corpId ? `Corp ID ${config.corpId}` : '未配置凭据';
}

async function openExport(c: any) {
  const text = JSON.stringify({ provider: c.provider, name: c.name, config: c.config });
  qrDataUrl.value = await QRCode.toDataURL(text, { width: 240, margin: 1 });
  showQr.value = true;
}

function downloadQr() {
  if (!qrDataUrl.value) return;
  const a = document.createElement('a');
  a.href = qrDataUrl.value;
  a.download = 'im-connector-qr.png';
  a.click();
}

function pickImport() {
  importInput.value?.click();
}

async function onImportFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (importInput.value) importInput.value.value = '';
  if (!file) return;
  const text = await decodeQrImage(file);
  if (!text) {
    ElMessage.error('未识别到二维码');
    return;
  }
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    ElMessage.error('二维码内容不是有效配置');
    return;
  }
  const config = obj.config || {};
  form.value = {
    provider: obj.provider === 'wechat' ? 'wechat' : 'feishu',
    name: obj.name || '导入的连接',
    appId: config.appId || '',
    appSecret: config.appSecret || '',
    verificationToken: config.verificationToken || '',
    corpId: config.corpId || '',
    secret: config.secret || '',
    agentId: config.agentId || '',
    token: config.token || '',
    encodingAesKey: config.encodingAesKey || '',
  };
  editingId.value = '';
  testResult.value = '';
  testError.value = '';
  step.value = 4;
  showWizard.value = true;
  ElMessage.success('已从二维码导入，请测试并保存');
}

async function decodeQrImage(file: File): Promise<string | null> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  return code ? code.data : null;
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

.wizard-steps {
  margin-bottom: 22px;
}

.wizard-body {
  min-height: 200px;
}

.step-choice {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.choice-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 16px;
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.choice-card:hover {
  border-color: var(--color-primary);
  background: rgba(124, 58, 237, 0.06);
}

.choice-title {
  font-size: 16px;
  font-weight: 700;
}

.choice-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
  text-align: center;
}

.step-guide {
  color: var(--color-text);
  line-height: 1.9;
}

.guide-list {
  margin: 0;
  padding-left: 20px;
}

.guide-list li {
  margin-bottom: 8px;
}

.guide-list a {
  color: var(--color-primary);
}

.guide-list code {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.06);
  font-size: 12px;
}

.guide-callback {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.05);
  font-size: 13px;
}

.guide-callback code {
  user-select: all;
  color: var(--color-primary);
}

.step-form .field-help {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.test-alert {
  margin-top: 8px;
}

.step-done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px 0;
}

.done-icon {
  color: #22c55e;
}

.done-text {
  font-size: 16px;
  font-weight: 700;
}

.done-sub {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.qr-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.qr-img {
  width: 240px;
  height: 240px;
  border-radius: 8px;
}

.qr-tip {
  font-size: 12px;
  color: var(--color-text-secondary);
  text-align: center;
}

@media (max-width: 767px) {
  .connector-grid {
    grid-template-columns: 1fr;
  }
  .step-choice {
    grid-template-columns: 1fr;
  }
}
</style>
