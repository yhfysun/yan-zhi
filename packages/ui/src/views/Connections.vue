<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">IM 连接</h2>
        <div class="page-sub">接入飞书 / 企业微信 / 钉钉，按向导一步步来</div>
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
          <div :class="['provider-badge', c.provider]">{{ providerLabel(c.provider) }}</div>
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
            <span class="choice-badge ok">长连接·免公网</span>
            <div class="choice-title">飞书</div>
            <div class="choice-desc">企业自建应用，收发消息</div>
          </button>
          <button type="button" class="choice-card" @click="chooseProvider('wechat')">
            <span class="choice-badge warn">需公网地址</span>
            <div class="choice-title">企业微信</div>
            <div class="choice-desc">自建应用，收发消息</div>
          </button>
          <button type="button" class="choice-card" @click="chooseProvider('dingtalk')">
            <span class="choice-badge ok">本地·免公网</span>
            <div class="choice-title">钉钉（Stream 模式）</div>
            <div class="choice-desc">企业内部应用机器人，无需公网回调</div>
          </button>
          <button type="button" class="choice-card" @click="chooseProvider('wechat-personal')">
            <span class="choice-badge ok">本地·免公网</span>
            <div class="choice-title">个人微信</div>
            <div class="choice-desc">一键安装 + 扫码登录，AI 自动回复</div>
          </button>
        </div>

        <!-- 步骤 2：取参数引导 -->
        <div v-else-if="step === 2" class="step-guide">
          <template v-if="form.provider === 'feishu'">
            <ol class="guide-list">
              <li>打开 <a href="https://open.feishu.cn/app" target="_blank" rel="noopener">飞书开放平台</a>，创建「企业自建应用」</li>
              <li>在「凭证与基础信息」页拿到 <b>App ID</b>（cli_ 开头）和 <b>App Secret</b></li>
              <li>在「事件与回调」把订阅方式选为<b>「使用长连接接收事件」</b>，添加事件 <code>im.message.receive_v1</code></li>
              <li>在「权限管理」开通 <code>im:message</code> 等权限并发布版本</li>
            </ol>
            <div class="guide-callback">保存后言智自动建立长连接收消息，无需公网回调地址</div>
          </template>
          <template v-else-if="form.provider === 'wechat'">
            <ol class="guide-list">
              <li>登录 <a href="https://work.weixin.qq.com/" target="_blank" rel="noopener">企业微信管理后台</a>，在「应用管理」创建自建应用</li>
              <li>在「我的企业」拿到 <b>Corp ID</b>；应用详情页拿到 <b>Secret</b> 和 <b>Agent ID</b></li>
              <li>在「接收消息 > API 接收」把下方生成的 <b>Token</b> 和 <b>EncodingAESKey</b> 粘贴进去，并填回调地址</li>
            </ol>
            <div class="guide-callback">回调地址：<code>{{ callbackBase }}/api/im/inbound/wechat</code></div>
            <div class="guide-callback">收消息必须公网可达（平台限制）；下方 Token / EncodingAESKey 可一键生成后粘贴进后台</div>
          </template>
          <template v-else-if="form.provider === 'dingtalk'">
            <ol class="guide-list">
              <li>打开 <a href="https://open.dingtalk.com/" target="_blank" rel="noopener">钉钉开放平台</a>（手机钉钉扫码登录），在「应用开发 > 企业内部开发」创建应用</li>
              <li>在「凭证与基础信息」页拿到 <b>Client ID</b>（即 AppKey）和 <b>Client Secret</b>（即 AppSecret）</li>
              <li>在「应用功能 > 机器人与消息推送」打开机器人配置开关，勾选 <b>Stream 模式</b>，然后发布应用</li>
              <li>在「权限管理」开通 <b>企业内机器人发送消息权限</b></li>
            </ol>
            <div class="guide-callback">Stream 模式无需配置回调地址，服务端自动建立长连接收消息</div>
          </template>
          <template v-else>
            <ol class="guide-list">
              <li>全程<b>在本机</b>完成：下一步一键安装 OpenClaw 网关与微信通道插件</li>
              <li>手机微信扫描言智里显示的二维码完成登录（如提示验证码，直接在向导里输入）</li>
              <li>保存后自动装配桥接：微信消息由言智 AI 处理并自动回复</li>
            </ol>
            <div class="guide-callback">无需公网地址；本机 Node 不满足版本要求时向导会自动下载托管运行时</div>
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
            <template v-else-if="form.provider === 'wechat'">
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
              <el-input v-model="form.token">
                <template #append>
                  <el-button @click="genWechatCreds('token')">生成</el-button>
                </template>
              </el-input>
              <span class="field-help">接收消息 > API接收 设置的 Token（收消息必需，可一键生成）</span>
            </el-form-item>
            <el-form-item label="EncodingAESKey">
              <el-input v-model="form.encodingAesKey">
                <template #append>
                  <el-button @click="genWechatCreds('aes')">生成</el-button>
                </template>
              </el-input>
              <span class="field-help">同页 43 位 EncodingAESKey（加密模式收消息必需，可一键生成）</span>
            </el-form-item>
            </template>
            <template v-else-if="form.provider === 'dingtalk'">
              <el-form-item label="Client ID">
                <el-input v-model="form.clientId" placeholder="钉钉应用 AppKey" />
                <span class="field-help">凭证与基础信息页的 Client ID / AppKey</span>
              </el-form-item>
              <el-form-item label="Client Secret">
                <el-input v-model="form.clientSecret" type="password" show-password />
                <span class="field-help">同页的 Client Secret / AppSecret</span>
              </el-form-item>
            </template>
            <template v-else>
              <el-form-item label="名称">
                <el-input v-model="form.name" placeholder="如：我的微信助手" />
              </el-form-item>
            </template>
            <!-- 个人微信一键面板（与名称同屏） -->
            <div v-if="form.provider === 'wechat-personal'" class="oc-panel">
              <div class="oc-env">
                <template v-if="ocEnv">
                  <span :class="ocEnv.nodeOk ? 'oc-ok' : 'oc-bad'">Node {{ ocEnv.nodeVersion || '缺失' }}</span>
                  <span :class="ocEnv.openclawVersion ? 'oc-ok' : 'oc-bad'">OpenClaw {{ ocEnv.openclawVersion || '未安装' }}</span>
                  <span :class="ocEnv.gatewayRunning ? 'oc-ok' : 'oc-bad'">Gateway {{ ocEnv.gatewayRunning ? '运行中' : '未运行' }}</span>
                </template>
                <span v-else class="oc-bad">环境检测中…</span>
              </div>
              <div v-if="ocLogs.length" class="oc-logs">
                <div v-for="(l, i) in ocLogs" :key="i">{{ l }}</div>
              </div>
              <div class="oc-actions">
                <el-button :loading="ocInstalling" :disabled="ocReady" @click="ocInstall">
                  {{ ocEnv?.openclawVersion ? '已安装' : '一键安装' }}
                </el-button>
                <el-button type="primary" :loading="ocLoginPolling" :disabled="!ocReady || ocLoginDone" @click="ocStartLogin">
                  {{ ocLoginDone ? '已连接' : '扫码连接' }}
                </el-button>
                <el-button v-if="ocLoginPolling" @click="ocCancelLogin">取消</el-button>
              </div>
              <div v-if="ocLoginPolling && ocNeedVerify" class="oc-verify">
                <el-input v-model="ocVerify" placeholder="输入手机微信收到的验证码" size="small" @keyup.enter="ocSendVerify" />
                <el-button size="small" type="primary" @click="ocSendVerify">提交验证码</el-button>
              </div>
              <div v-if="ocQrDataUrl" class="oc-qr">
                <img :src="ocQrDataUrl" alt="微信登录二维码" />
                <div class="oc-qr-tip">手机微信扫码登录；过期会自动刷新</div>
              </div>
              <div v-if="ocStatusText" class="oc-status" :class="{ bad: ocStatusBad }">{{ ocStatusText }}</div>
            </div>
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
        <el-button v-if="step === 4" type="primary" :loading="saving || testing || ocAssembling" @click="testAndSave">测试并保存</el-button>
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
import { api, LOCAL_API_BASE } from '../api/client';

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
  botName: '',
  clientId: '',
  clientSecret: '',
});

const callbackBase = computed(() => {
  if (typeof window !== 'undefined' && window.location && window.location.origin && !window.location.origin.startsWith('file')) {
    return window.location.origin;
  }
  // file:// (Electron) 下没有可用 origin → 用本实例后端基址（端口随实例，不写死 3001）
  return LOCAL_API_BASE.replace(/\/api$/, '');
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
  if (f.provider === 'feishu') {
    return { appId: f.appId, appSecret: f.appSecret, verificationToken: f.verificationToken };
  }
  if (f.provider === 'wechat-personal') {
    // bridgeToken 由后端在创建/更新时生成并保留，前端不回传
    return {};
  }
  if (f.provider === 'dingtalk') {
    return { clientId: f.clientId, clientSecret: f.clientSecret };
  }
  return { corpId: f.corpId, secret: f.secret, agentId: f.agentId, token: f.token, encodingAesKey: f.encodingAesKey };
}

/** 企微 Token(3-32 位字母数字) / EncodingAESKey(43 位字母数字) 一键生成，用户只需粘贴进后台 */
function genWechatCreds(kind: 'token' | 'aes') {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const len = kind === 'token' ? 24 : 43;
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  if (kind === 'token') form.value.token = out;
  else form.value.encodingAesKey = out;
}

// ===== 个人微信一键面板 =====
const ocEnv = ref<any>(null);
const ocInstalling = ref(false);
const ocJob = ref<any>(null);
const ocLoginPolling = ref(false);
const ocLogin = ref<any>(null);
const ocQrDataUrl = ref('');
const ocVerify = ref('');
const ocAssembling = ref(false);
let ocInstallTimer: ReturnType<typeof setTimeout> | null = null;
let ocLoginTimer: ReturnType<typeof setTimeout> | null = null;
let ocLastQrUrl = '';

const ocLogs = computed(() => ocJob.value?.logs || []);
const ocReady = computed(() => !!ocEnv.value?.openclawVersion);
const ocLoginDone = computed(() => ocLogin.value?.state?.phase === 'success' || !!ocEnv.value?.gatewayRunning);
const ocNeedVerify = computed(() => !!(ocLogin.value?.logs || []).some((l: string) => l.includes('验证码')));
const ocStatusText = computed(() => {
  const ls = ocLogin.value;
  if (ocAssembling.value) return '正在装配桥接并重启网关…';
  if (!ls) return '';
  const phase = ls.state?.phase;
  if (phase === 'success') return `✅ ${ls.state?.message || '微信连接成功'}`;
  if (phase === 'error') return `⛔ ${ls.state?.message || '登录失败'}`;
  if (phase === 'verifying') return '已扫码，正在验证…';
  if (phase === 'waiting_scan') return ocQrDataUrl.value ? '等待手机微信扫码…' : '正在获取二维码…';
  if (ls.active) return '登录进行中…';
  if (ls.exitCode != null && ls.exitCode !== 0) return `登录进程退出（code ${ls.exitCode}）`;
  return ls.state?.message || '';
});
const ocStatusBad = computed(() => {
  const phase = ocLogin.value?.state?.phase;
  return phase === 'error' || (!!ocLogin.value && !ocLogin.value.active && ocLogin.value.exitCode !== 0 && phase !== 'success');
});

async function refreshOcEnv() {
  const res = await api.get<any>('/im/openclaw/status');
  if (!('error' in res)) ocEnv.value = res.data;
}

function stopOcPolling() {
  if (ocInstallTimer) { clearTimeout(ocInstallTimer); ocInstallTimer = null; }
  if (ocLoginTimer) { clearTimeout(ocLoginTimer); ocLoginTimer = null; }
  ocInstalling.value = false;
  ocLoginPolling.value = false;
}

async function ocInstall() {
  ocInstalling.value = true;
  const r = await api.post<any>('/im/openclaw/install');
  if ('error' in r) {
    ocInstalling.value = false;
    ElMessage.error(r.error);
    return;
  }
  const poll = async () => {
    const jr = await api.get<any>('/im/openclaw/install-job');
    if (!('error' in jr) && jr.data) {
      ocJob.value = jr.data;
      if (jr.data.finishedAt || jr.data.step === 'error') {
        ocInstalling.value = false;
        if (jr.data.step === 'error') ElMessage.error(`安装失败：${jr.data.error}`);
        else ElMessage.success('安装完成');
        await refreshOcEnv();
        return;
      }
    }
    ocInstallTimer = setTimeout(poll, 2000);
  };
  void poll();
}

async function ocStartLogin() {
  const r = await api.post<any>('/im/openclaw/login/start');
  if ('error' in r) {
    ElMessage.error(r.error);
    return;
  }
  ocLogin.value = null;
  ocQrDataUrl.value = '';
  ocLastQrUrl = '';
  ocLoginPolling.value = true;
  const poll = async () => {
    const sr = await api.get<any>('/im/openclaw/login/status');
    if (!('error' in sr) && sr.data) {
      ocLogin.value = sr.data;
      const url = sr.data.state?.qrUrl || '';
      if (url && url !== ocLastQrUrl) {
        ocLastQrUrl = url;
        ocQrDataUrl.value = await QRCode.toDataURL(url, { width: 220, margin: 1 });
      }
      if (sr.data.state?.phase === 'success') {
        ocLoginPolling.value = false;
        ElMessage.success('微信连接成功');
        await refreshOcEnv();
        return;
      }
      if (sr.data.state?.phase === 'error' || (!sr.data.active && sr.data.exitCode !== 0)) {
        ocLoginPolling.value = false;
        return;
      }
    }
    ocLoginTimer = setTimeout(poll, 2000);
  };
  void poll();
}

async function ocCancelLogin() {
  await api.post('/im/openclaw/login/cancel');
  ocLoginPolling.value = false;
  if (ocLoginTimer) { clearTimeout(ocLoginTimer); ocLoginTimer = null; }
}

async function ocSendVerify() {
  const code = ocVerify.value.trim();
  if (!code) return;
  await api.post('/im/openclaw/login/verify', { code });
  ocVerify.value = '';
}

function resetForm() {
  editingId.value = '';
  testResult.value = '';
  testError.value = '';
  form.value = { provider: 'feishu', name: '', appId: '', appSecret: '', verificationToken: '', corpId: '', secret: '', agentId: '', token: '', encodingAesKey: '', botName: '', clientId: '', clientSecret: '' };
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
    botName: config.botName || '',
    clientId: config.clientId || '',
    clientSecret: config.clientSecret || '',
  };
  editingId.value = c.id;
  testResult.value = '';
  testError.value = '';
  step.value = 3;
  showWizard.value = true;
}

function chooseProvider(p: 'feishu' | 'wechat' | 'wechat-personal' | 'dingtalk') {
  form.value.provider = p;
  step.value = 2;
  if (p === 'wechat-personal') void refreshOcEnv();
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
  // 个人微信：保存后自动装配桥接插件并拉起网关（失败给出可行动错误，不再假装通过）
  if (form.value.provider === 'wechat-personal') {
    ocAssembling.value = true;
    const ar = await api.post<any>('/im/openclaw/bridge/assemble', { connectorId: editingId.value });
    ocAssembling.value = false;
    if ('error' in ar) {
      testResult.value = 'fail';
      testError.value = ar.error;
      return;
    }
  }
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
  stopOcPolling();
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
    await ElMessageBox.confirm(`确认删除连接器「${c.name}」？`, '提示', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' });
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

function providerLabel(p: string) {
  if (p === 'feishu') return '飞书';
  if (p === 'wechat-personal') return '个人微信';
  if (p === 'dingtalk') return '钉钉';
  return '企业微信';
}

function configSummary(c: any) {
  const config = c.config || {};
  if (c.provider === 'feishu') return config.appId ? `App ID ${config.appId}` : '未配置凭据';
  if (c.provider === 'wechat-personal') return config.bridgeToken ? '本机 OpenClaw 桥接' : '未连接';
  if (c.provider === 'dingtalk') return config.clientId ? `Client ID ${config.clientId}` : '未配置凭据';
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
  const provider = ['feishu', 'wechat', 'wechat-personal', 'dingtalk'].includes(obj.provider) ? obj.provider : 'feishu';
  form.value = {
    provider,
    name: obj.name || '导入的连接',
    appId: config.appId || '',
    appSecret: config.appSecret || '',
    verificationToken: config.verificationToken || '',
    corpId: config.corpId || '',
    secret: config.secret || '',
    agentId: config.agentId || '',
    token: config.token || '',
    encodingAesKey: config.encodingAesKey || '',
    botName: config.botName || '',
    clientId: config.clientId || '',
    clientSecret: config.clientSecret || '',
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

.provider-badge.wechat-personal {
  color: #7c3aed;
  background: rgba(124, 58, 237, 0.12);
}

.provider-badge.dingtalk {
  color: #1e6fff;
  background: rgba(30, 102, 255, 0.12);
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
  position: relative;
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

/* 平台卡片徽标：本地·免公网 / 需公网地址 */
.choice-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 11px;
  line-height: 1;
  padding: 4px 8px;
  border-radius: 999px;
}
.choice-badge.ok {
  color: #1f9d55;
  background: rgba(34, 197, 94, 0.12);
}
.choice-badge.warn {
  color: #b45309;
  background: rgba(245, 158, 11, 0.14);
}

/* 个人微信一键面板 */
.oc-panel {
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 12px 14px;
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.oc-env {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
}
.oc-ok {
  color: #1f9d55;
}
.oc-bad {
  color: #b45309;
}
.oc-logs {
  max-height: 140px;
  overflow-y: auto;
  background: var(--color-bg-secondary, #f7f7f8);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.6;
  font-family: var(--font-mono, monospace);
  word-break: break-all;
  white-space: pre-wrap;
}
.oc-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.oc-verify {
  display: flex;
  gap: 8px;
  align-items: center;
}
.oc-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.oc-qr img {
  width: 220px;
  height: 220px;
  border-radius: 8px;
}
.oc-qr-tip {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.oc-status {
  font-size: 13px;
}
.oc-status.bad {
  color: #dc2626;
}
</style>
