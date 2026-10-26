<template>
  <div class="am-page">
    <header class="am-head">
      <div>
        <h2 class="am-title">安卓远控</h2>
        <p class="am-sub">用 scrcpy 在电脑上实时镜像并操作安卓手机（USB / 无线调试）</p>
      </div>
      <div class="am-head-actions">
        <el-button size="small" :loading="loading" @click="refresh">刷新</el-button>
        <el-button v-if="running" size="small" type="danger" @click="disconnect">断开 {{ running.serial }}</el-button>
      </div>
    </header>

    <div v-if="!scrcpyOk" class="am-alert">
      未找到 scrcpy。把 scrcpy 解压到 <code>tools/scrcpy/</code>（应存在 <code>scrcpy.exe</code>），
      或运行 <code>node scripts/fetch-scrcpy.mjs</code> 自动下载。
    </div>
    <div v-else-if="!adbOk" class="am-alert">
      未找到可用的 adb。请安装 Android SDK platform-tools，或设置 <code>ANDROID_HOME</code>。
    </div>
    <div v-else-if="lastError && !running" class="am-alert">
      scrcpy 退出：{{ lastError }}
    </div>

    <section class="am-card">
      <div class="am-card-title">已连接设备</div>
      <div v-if="!devices.length" class="am-empty">
        没有检测到设备。用 USB 连接并在手机上打开「开发者选项 → USB 调试」，或在下面用无线调试配对。
      </div>
      <div v-for="d in devices" :key="d.serial" class="am-device" :class="{ online: d.state === 'device' }">
        <div class="am-device-main">
          <div class="am-device-name">{{ d.model || d.product || '安卓设备' }}</div>
          <div class="am-device-serial">{{ d.serial }} · {{ d.state }}</div>
        </div>
        <el-button
          size="small" type="primary" :disabled="d.state !== 'device' || (!!running && running.serial !== d.serial)"
          @click="connect(d.serial)"
        >连接</el-button>
      </div>
    </section>

    <section class="am-card">
      <div class="am-card-title">无线调试（Android 11+）</div>
      <div class="am-grid">
        <el-input v-model="wireless.host" placeholder="手机 IP，如 192.168.10.100" size="small" />
        <el-input v-model="wireless.pairPort" placeholder="配对端口" size="small" />
        <el-input v-model="wireless.code" placeholder="6 位配对码" size="small" />
        <el-button size="small" :loading="pairing" @click="pair">配对</el-button>
      </div>
      <div class="am-grid am-grid-second">
        <el-input v-model="wireless.host" placeholder="手机 IP" size="small" disabled />
        <el-input v-model="wireless.connectPort" placeholder="调试端口（无线调试页显示）" size="small" />
        <el-button size="small" type="primary" :loading="connecting" @click="wirelessConnect">无线连接</el-button>
      </div>
      <p class="am-hint">
        手机：设置 → 开发者选项 → 无线调试 →「使用配对码配对设备」，配对端口与 6 位码填上面；
        配对成功后把「IP 地址和端口」里的端口填到调试端口，点无线连接。
      </p>
    </section>

    <section class="am-card">
      <div class="am-card-title">运行环境</div>
      <div class="am-kv"><span>scrcpy</span><code>{{ scrcpyVersion || '—' }}</code></div>
      <div class="am-kv"><span>路径</span><code>{{ scrcpy || '—' }}</code></div>
      <div class="am-kv"><span>adb</span><code>{{ adb || '—' }}</code></div>
      <div class="am-kv"><span>当前设置</span><code>最长边 {{ settings.maxSize }}px · {{ Math.round(settings.bitRate / 1e6) }}Mbps · 常亮 {{ settings.stayAwake ? '开' : '关' }}</code></div>
      <p class="am-hint">画面由 scrcpy 独立窗口渲染；键盘鼠标直通手机，手机端无需安装任何 App。</p>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * 安卓远控（android-mirror 插件）：设备发现 / 连接 / 无线配对 / 断开。
 * 画面交给内置 scrcpy 自己的窗口渲染，这里只做控制面。
 */
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../api/client';

interface DeviceInfo { serial: string; state: string; model?: string; product?: string }

const loading = ref(false);
const pairing = ref(false);
const connecting = ref(false);
const devices = ref<DeviceInfo[]>([]);
const running = ref<{ serial: string; pid?: number } | null>(null);
const lastError = ref('');
const adb = ref('');
const adbOk = ref(true);
const scrcpy = ref('');
const scrcpyOk = ref(true);
const scrcpyVersion = ref('');
const settings = reactive({ maxSize: 1280, bitRate: 8000000, stayAwake: true });
const wireless = reactive({ host: '', pairPort: '', code: '', connectPort: '' });

let timer: number | null = null;

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const r = await api.get<{
      adb: string; adbOk: boolean; devices: DeviceInfo[]; scrcpy: string; scrcpyOk: boolean;
      scrcpyVersion: string; running: { serial: string; pid?: number } | null;
      lastError?: string;
      settings: { maxSize: number; bitRate: number; stayAwake: boolean };
    }>('/plugin/android-mirror/status');
    if ('error' in r || !r.data) {
      ElMessage.error(String((r as { error?: string }).error || '读取状态失败'));
      return;
    }
    const d = r.data;
    adb.value = d.adb;
    adbOk.value = d.adbOk;
    devices.value = d.devices || [];
    scrcpy.value = d.scrcpy;
    scrcpyOk.value = d.scrcpyOk;
    scrcpyVersion.value = d.scrcpyVersion;
    running.value = d.running;
    lastError.value = d.lastError || '';
    settings.maxSize = d.settings?.maxSize ?? 1280;
    settings.bitRate = d.settings?.bitRate ?? 8000000;
    settings.stayAwake = d.settings?.stayAwake !== false;
  } catch (e) {
    ElMessage.error((e as Error)?.message || '读取状态失败');
  } finally {
    loading.value = false;
  }
}

async function connect(serial: string): Promise<void> {
  const r = await api.post<{ ok: boolean }>('/plugin/android-mirror/connect', { serial });
  if ('error' in r) { ElMessage.error(String(r.error)); return; }
  ElMessage.success('已启动画面窗口');
  await refresh();
}

async function disconnect(): Promise<void> {
  await api.post('/plugin/android-mirror/disconnect', {});
  ElMessage.success('已断开');
  await refresh();
}

async function pair(): Promise<void> {
  if (!wireless.host || !wireless.pairPort || !wireless.code) {
    ElMessage.warning('请填写手机 IP、配对端口和配对码');
    return;
  }
  pairing.value = true;
  try {
    const r = await api.post('/plugin/android-mirror/wireless/pair', {
      host: wireless.host.trim(),
      port: Number(wireless.pairPort),
      code: wireless.code.trim(),
    });
    if ('error' in r) { ElMessage.error(String(r.error)); return; }
    ElMessage.success('配对成功，接着填调试端口并点「无线连接」');
  } finally {
    pairing.value = false;
  }
}

async function wirelessConnect(): Promise<void> {
  if (!wireless.host || !wireless.connectPort) {
    ElMessage.warning('请填写手机 IP 和调试端口');
    return;
  }
  connecting.value = true;
  try {
    const r = await api.post('/plugin/android-mirror/wireless/connect', {
      host: wireless.host.trim(),
      port: Number(wireless.connectPort),
    });
    if ('error' in r) { ElMessage.error(String(r.error)); return; }
    ElMessage.success('已连接，设备会出现在上方列表');
    await refresh();
  } finally {
    connecting.value = false;
  }
}

onMounted(() => {
  void refresh();
  timer = window.setInterval(() => void refresh(), 4000);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.am-page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 14px; max-width: 900px; }
.am-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.am-title { margin: 0; font-size: 20px; font-weight: 600; }
.am-sub { margin: 4px 0 0; font-size: 13px; color: var(--el-text-color-secondary); }
.am-head-actions { display: flex; gap: 8px; }
.am-alert { background: #2a1f22; border: 1px solid #4a3038; color: #f0b6c2; border-radius: 8px; padding: 10px 12px; font-size: 13px; }
.am-card { border: 1px solid var(--el-border-color-lighter); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.am-card-title { font-size: 14px; font-weight: 600; }
.am-empty { font-size: 13px; color: var(--el-text-color-secondary); line-height: 1.7; }
.am-device { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; }
.am-device.online { border-color: var(--el-color-primary-light-5); }
.am-device-name { font-size: 14px; }
.am-device-serial { font-size: 12px; color: var(--el-text-color-secondary); }
.am-grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr auto; gap: 8px; align-items: center; }
.am-grid-second { grid-template-columns: 1.4fr 1fr auto; }
.am-hint { margin: 0; font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.7; }
.am-kv { display: flex; gap: 10px; font-size: 13px; }
.am-kv span { width: 76px; flex-shrink: 0; color: var(--el-text-color-secondary); }
.am-kv code { word-break: break-all; }
</style>
