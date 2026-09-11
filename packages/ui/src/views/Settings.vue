<template>
  <div class="page">
    <h2 class="page-title">设置</h2>
    <el-tabs v-model="tab" class="glass-tabs">
      <el-tab-pane label="通用" name="general">
        <el-form label-width="160px" style="max-width: 600px">
          <el-form-item label="深色模式">
            <el-switch v-model="darkMode" @change="toggleDarkMode" />
            <span class="form-tip" style="margin-left: 12px">切换深色/浅色主题</span>
          </el-form-item>
          <el-form-item label="主题色">
            <div class="theme-grid">
              <div
                v-for="t in themes"
                :key="t.value"
                :class="['theme-chip', { active: settingsStore.settings.theme === t.value }]"
                :style="{ '--chip-color': t.color }"
                @click="setTheme(t.value)"
              >
                <div class="theme-dot"></div>
                <span>{{ t.label }}</span>
              </div>
            </div>
          </el-form-item>
          <el-form-item label="布局">
            <el-select
              :model-value="settingsStore.settings.layout"
              placeholder="选择布局"
              style="width: 280px"
              @change="setLayout"
            >
              <el-option label="默认布局" value="default" />
              <el-option
                v-for="l in pluginStore.layouts"
                :key="l.id"
                :label="l.name"
                :value="l.id"
              />
            </el-select>
            <span class="form-tip" style="margin-left: 12px">插件可贡献自定义布局</span>
          </el-form-item>
          <el-form-item label="默认平台">
            <el-select v-model="defaultPlatformId" placeholder="选择默认平台" style="width: 280px" clearable @change="onPlatformChange">
              <el-option v-for="p in platformStore.platforms" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="默认模型">
            <el-select v-model="defaultModelId" placeholder="选择默认模型" style="width: 280px" clearable :disabled="!defaultPlatformId">
              <el-option v-for="m in availableDefaultModels" :key="m.id" :label="m.alias || m.modelId" :value="m.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="记忆抽取模型">
            <div style="display:flex;gap:8px;align-items:center">
              <el-select v-model="memoryExtractPlatformId" placeholder="抽取模型平台" style="width:140px" clearable @change="onMemoryExtractPlatformChange">
                <el-option v-for="p in platformStore.platforms" :key="p.id" :label="p.name" :value="p.id" />
              </el-select>
              <el-select v-model="memoryExtractModelId" placeholder="抽取模型" style="width:140px" clearable :disabled="!memoryExtractPlatformId">
                <el-option v-for="m in availableMemoryExtractModels" :key="m.id" :label="m.alias || m.modelId" :value="m.id" />
              </el-select>
              <span class="form-tip">留空则使用默认模型，仍不可用则自动回退本地小模型</span>
            </div>
          </el-form-item>
          <el-form-item label="启用上下文压缩">
            <el-switch v-model="enableCompression" />
            <span class="form-tip" style="margin-left: 12px">超长会话时自动摘要压缩</span>
          </el-form-item>
          <el-form-item label="上下文保留条数">
            <el-input-number v-model="keepRecent" :min="2" :max="50" />
            <span class="form-tip" style="margin-left: 12px">触发压缩时保留的最近消息条数</span>
          </el-form-item>
          <el-form-item label="压缩触发阈值">
            <el-input-number v-model="maxContextTokens" :min="1000" :step="1000" />
            <span class="form-tip" style="margin-left: 12px">token 数超过此值时触发压缩</span>
          </el-form-item>
        </el-form>
      </el-tab-pane>
      <el-tab-pane label="皮肤" name="skin">
        <div class="skin-page">
          <div class="skin-page-tip">点击卡片即换肤；「源码包」可下载壁纸与清单二改，打成 .yzp 后在「插件管理」安装即为自定义皮肤</div>
          <div v-for="cat in skinCategories" :key="cat" class="skin-cat">
            <div class="skin-cat-label">{{ cat }}</div>
            <div class="skin-grid">
              <div
                v-for="s in skinsByCategory(cat)"
                :key="s.id"
                :class="['skin-card', { active: settingsStore.settings.theme === s.id }]"
                @click="setTheme(s.id)"
              >
                <img class="skin-thumb" :src="skinPreviewUrl(s)" :alt="s.name" loading="lazy" />
                <div class="skin-card-body">
                  <span class="skin-name">{{ s.name }}</span>
                  <span
                    class="skin-src"
                    title="下载源码包（壁纸 + manifest + 自定义说明），二改后打成 .yzp 可作为自定义皮肤安装"
                    @click.stop="downloadSkinSource(s)"
                  >源码包</span>
                </div>
                <div v-if="settingsStore.settings.theme === s.id" class="skin-active-badge">使用中</div>
              </div>
            </div>
          </div>
          <div v-if="!allSkins.length" class="skin-empty">
            暂无皮肤 —— 皮肤以插件形式提供，可在「插件管理」安装 .yzp 皮肤包
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane label="数据" name="data">
        <div class="data-section">
          <el-button @click="exportData" :icon="Download">导出全部数据</el-button>
          <el-button @click="triggerImport" :icon="Upload">导入备份数据</el-button>
          <input ref="fileInput" type="file" accept=".json" style="display:none" @change="importData" />
          <el-button type="danger" @click="clearCache" :icon="Delete">清空缓存</el-button>
        </div>
      </el-tab-pane>
      <el-tab-pane label="记忆管理" name="memory">
        <MemoryManage />
      </el-tab-pane>
      <el-tab-pane label="商城服务端" name="marketplace">
        <el-form label-width="160px" style="max-width: 600px">
          <el-form-item label="启用商城服务端">
            <el-switch v-model="mpEnabled" @change="onMpToggle" />
            <span class="form-tip" style="margin-left: 12px">开启后其他言智节点可连接本节点获取工具/Skill/智能体</span>
          </el-form-item>
          <el-form-item label="连接地址">
            <div class="connect-url-box">
              <code>{{ connectUrl }}</code>
              <el-button size="small" text @click="copyUrl">复制</el-button>
            </div>
          </el-form-item>
          <el-form-item label="认证方式">
            <el-select v-model="mpAuthType" style="width: 200px" @change="onMpAuthChange">
              <el-option label="无认证" value="none" />
              <el-option label="Bearer Token" value="bearer" />
              <el-option label="API Key" value="api-key" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="mpAuthType !== 'none'" label="凭证">
            <el-input v-model="mpAuthValue" :placeholder="mpAuthType === 'bearer' ? '输入 Token' : '输入 API Key'" style="width: 280px" @blur="onMpAuthChange" />
          </el-form-item>
          <el-form-item label="端口">
            <el-input-number v-model="mpPort" :min="1024" :max="65535" style="width: 180px" @change="onMpPortChange" />
            <span class="form-tip" style="margin-left: 8px">默认 3001</span>
          </el-form-item>
        </el-form>
      </el-tab-pane>
      <el-tab-pane label="局域网访问" name="lan">
        <div class="lan-section">
          <p class="lan-tip">局域网内其他设备（手机 / 电脑）可用浏览器访问本节点的 Web 界面，数据与本机共享同一后端。</p>
          <div v-if="lanIps.length === 0 && !lanLoading" class="lan-empty">未检测到局域网 IP（可能未连接网络）</div>
          <div v-else class="lan-list">
            <div v-for="ip in lanIps" :key="ip.address" class="lan-item">
              <div class="lan-url-box">
                <code>{{ 'http://' + ip.address + ':' + lanPort }}</code>
                <span class="lan-iface">{{ ip.name }}</span>
              </div>
              <div class="lan-actions">
                <el-button size="small" @click="copyLanUrl(ip.address)">复制</el-button>
                <el-button size="small" type="primary" @click="openLan(ip.address)">打开浏览器</el-button>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane label="日志" name="logs">
        <div class="logs-tab-embed">
          <LlmLogs />
        </div>
      </el-tab-pane>
      <el-tab-pane label="关于" name="about">
        <div class="about-section">
          <h3>言智 (Yan-Zhi)</h3>
          <p>版本：v0.1.0 (MVP)</p>
          <p>语言可控的跨端日常办公助手 · 桌面 / Web / 移动三端统一</p>
          <p class="about-tip">开发者：yhfysun</p>
          <p class="about-tip">源码：<a class="about-link" href="https://github.com/yhfysun/yan-zhi" target="_blank" rel="noopener">https://github.com/yhfysun/yan-zhi</a></p>
          <p class="about-tip">开源协议：Apache-2.0</p>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Download, Delete, Upload } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useSettingsStore, usePlatformStore } from '../stores';
import { usePluginStore } from '../stores/plugin';
import { useToolsStore } from '../stores/tools';
import type { ThemeName } from '../stores/settings';
import { api, API_BASE } from '../api/client';
import MemoryManage from '../components/memory/MemoryManage.vue';
import LlmLogs from './LlmLogs.vue';

const settingsStore = useSettingsStore();
const platformStore = usePlatformStore();
const pluginStore = usePluginStore();
const toolsStore = useToolsStore();
const tab = ref('general');

const fileInput = ref<HTMLInputElement | null>(null);

const themes: Array<{ value: ThemeName; label: string; color: string }> = [
  { value: 'cinnabar', label: '朱砂', color: '#C2410C' },
  { value: 'ink', label: '松烟', color: '#57534E' },
  { value: 'indigo', label: '靛青', color: '#2C4A6E' },
  { value: 'pine', label: '松绿', color: '#2F6B4F' },
  { value: 'clay', label: '陶土', color: '#B05A45' },
];

// ===== 皮肤库：插件贡献的 kind='skin' 主题，按分类分组展示 =====
type SkinTheme = { id: string; name: string; category?: string; preview?: string; pluginId: string };
const allSkins = computed<SkinTheme[]>(() =>
  (pluginStore.themes as Array<SkinTheme & { kind?: string }>).filter((t) => t.kind === 'skin'),
);
const SKIN_CATEGORY_ORDER = ['动漫', '动物', '植物', '风景', '明星', '黑白', '美图', '传统文化', '太极', '简约'];
const skinCategories = computed(() => {
  const seen: string[] = [];
  for (const s of allSkins.value) {
    const c = s.category || '简约';
    if (!seen.includes(c)) seen.push(c);
  }
  return seen.sort((a, b) => {
    const ia = SKIN_CATEGORY_ORDER.indexOf(a); const ib = SKIN_CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
});
function skinsByCategory(cat: string): SkinTheme[] {
  return allSkins.value.filter((s) => (s.category || '简约') === cat);
}
function skinPreviewUrl(s: SkinTheme): string {
  const file = s.preview || 'preview.webp';
  return `${API_BASE}/plugin-assets/${s.pluginId}/${file.replace(/^\.?\//, '')}`;
}
async function downloadSkinSource(s: SkinTheme) {
  try {
    const token = localStorage.getItem('auth_token') || '';
    const resp = await fetch(`${API_BASE}/plugins/${s.id}/export`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await resp.json();
    if (!json?.data?.base64) { ElMessage.error(json?.error || '导出失败'); return; }
    const bin = Uint8Array.from(atob(json.data.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bin], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url; a.download = json.data.filename || `${s.id}-source.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    ElMessage.error('导出失败: ' + (e as Error).message);
  }
}

const darkMode = ref(settingsStore.settings.darkMode);

const defaultPlatformId = ref('');
const defaultModelId = ref('');
const keepRecent = ref(6);
const maxContextTokens = ref(8000);
const enableCompression = ref(true);
const memoryExtractPlatformId = ref('');
const memoryExtractModelId = ref('');

const availableDefaultModels = computed(() =>
  platformStore.models.filter((m) => m.platformId === defaultPlatformId.value && m.enabled),
);
const availableMemoryExtractModels = computed(() =>
  platformStore.models.filter((m) => m.platformId === memoryExtractPlatformId.value && m.enabled),
);

onMounted(async () => {
  await settingsStore.load();
  await platformStore.loadPlatforms();
  defaultPlatformId.value = settingsStore.settings.defaultPlatformId;
  defaultModelId.value = settingsStore.settings.defaultModelId;
  darkMode.value = settingsStore.settings.darkMode;
  keepRecent.value = settingsStore.settings.keepRecent;
  maxContextTokens.value = settingsStore.settings.maxContextTokens;
  enableCompression.value = settingsStore.settings.enableCompression;
  memoryExtractPlatformId.value = settingsStore.settings.memoryExtractPlatformId;
  memoryExtractModelId.value = settingsStore.settings.memoryExtractModelId;
  if (defaultPlatformId.value) {
    await platformStore.loadModels(defaultPlatformId.value);
  }
  if (memoryExtractPlatformId.value) {
    await platformStore.loadModels(memoryExtractPlatformId.value);
  }
});

function setTheme(t: ThemeName) {
  settingsStore.update({ theme: t });
}

function setLayout(id: string) {
  settingsStore.update({ layout: id });
}

function toggleDarkMode() {
  settingsStore.update({ darkMode: darkMode.value });
}

async function onPlatformChange() {
  defaultModelId.value = '';
  if (defaultPlatformId.value) {
    await platformStore.loadModels(defaultPlatformId.value);
    const def = platformStore.models.find((m) => m.platformId === defaultPlatformId.value && m.isDefault);
    defaultModelId.value = def?.id || '';
  }
  await settingsStore.update({
    defaultPlatformId: defaultPlatformId.value,
    defaultModelId: defaultModelId.value,
  });
}

watch([defaultModelId, keepRecent, maxContextTokens, enableCompression], async () => {
  await settingsStore.update({
    defaultModelId: defaultModelId.value,
    keepRecent: keepRecent.value,
    maxContextTokens: maxContextTokens.value,
    enableCompression: enableCompression.value,
  });
});

async function onMemoryExtractPlatformChange() {
  memoryExtractModelId.value = '';
  if (memoryExtractPlatformId.value) {
    await platformStore.loadModels(memoryExtractPlatformId.value);
    const def = platformStore.models.find((m) => m.platformId === memoryExtractPlatformId.value && m.isDefault);
    memoryExtractModelId.value = def?.id || '';
  }
  await settingsStore.update({
    memoryExtractPlatformId: memoryExtractPlatformId.value,
    memoryExtractModelId: memoryExtractModelId.value,
  });
}

watch([memoryExtractPlatformId, memoryExtractModelId], async ([pid, mid]) => {
  if (pid === settingsStore.settings.memoryExtractPlatformId && mid === settingsStore.settings.memoryExtractModelId) return;
  await settingsStore.update({
    memoryExtractPlatformId: memoryExtractPlatformId.value,
    memoryExtractModelId: memoryExtractModelId.value,
  });
});

async function exportData() {
  try {
    // 简化版：导出所有 DB 表为 JSON
    const tables = ['platform', 'model', 'conversation', 'message', 'mcp_server', 'mcp_tool', 'agent', 'skill'];
    const data: Record<string, unknown> = {};
    for (const t of tables) {
      try {
        const adapter = (await import('@yan-zhi/core')).getPlatformAdapter();
        data[t] = await adapter.db.query(`SELECT * FROM ${t}`);
      } catch {}
    }
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-assistant-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success('已导出');
  } catch (e: any) {
    ElMessage.error(e?.message || '导出失败');
  }
}

function triggerImport() {
  fileInput.value?.click();
}

async function importData(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    if (!backup.data || typeof backup.data !== 'object') {
      throw new Error('无效的备份文件格式');
    }
    await ElMessageBox.confirm(
      `将导入 ${Object.keys(backup.data).length} 张表的数据（备份于 ${backup.exportedAt || '未知时间'}），现有数据将被覆盖，确认？`,
      '导入确认',
      { type: 'warning' },
    );
    const adapter = (await import('@yan-zhi/core')).getPlatformAdapter();
    for (const [table, rows] of Object.entries(backup.data)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      // 先清空目标表
      await adapter.db.exec(`DELETE FROM ${table}`);
      // 逐行插入
      for (const row of rows as Record<string, unknown>[]) {
        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(', ');
        const values = cols.map((c) => row[c]);
        await adapter.db.exec(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`, values);
      }
    }
    ElMessage.success('已导入，刷新页面后生效');
    // 重置文件 input，允许重复导入同一文件
    if (fileInput.value) fileInput.value.value = '';
  } catch (e: any) {
    if (e === 'cancel') return;
    ElMessage.error(e?.message || '导入失败');
  }
}

async function clearCache() {
  try {
    await ElMessageBox.confirm('清空缓存会删除所有会话和消息（保留平台/模型/MCP/Skill 配置），确认？', '危险操作', { type: 'warning' });
    await api.delete('/conversations/clear');
    ElMessage.success('已清空');
  } catch {}
}

// 商城服务端
const mpEnabled = ref(false);
const mpAuthType = ref('none');
const mpAuthValue = ref('');
const mpPort = ref(3001);

const connectUrl = computed(() => {
  const host = window.location.hostname || 'localhost';
  return `http://${host}:${mpPort.value}/api/marketplace`;
});

async function onMpToggle(v: boolean) {
  const r = await toolsStore.setMarketplaceConfig({ enabled: v });
  if (r.persisted === 'local') {
    ElMessage.info('已暂存到本地（后端接口未就绪，恢复后将自动同步）');
  } else {
    ElMessage.success('商城服务端配置已保存');
  }
}
async function onMpAuthChange() {
  await toolsStore.setMarketplaceConfig({
    auth: { authType: mpAuthType.value, token: mpAuthValue.value },
  });
}
async function onMpPortChange() {
  await toolsStore.setMarketplaceConfig({ port: mpPort.value });
}
function copyUrl() {
  navigator.clipboard.writeText(connectUrl.value).then(() => ElMessage.success('已复制连接地址'));
}

// 局域网访问
const lanIps = ref<Array<{ name: string; address: string }>>([]);
const lanPort = ref(3001);
const lanLoading = ref(false);

async function loadLanIps() {
  lanLoading.value = true;
  try {
    const r = await api.get<any>('/network/ip');
    const data = r && 'data' in r ? (r.data as any) : r;
    if (data && Array.isArray(data.data)) {
      lanIps.value = data.data.map((x: any) => ({ name: x.name, address: x.address }));
    }
    if (data?.port) lanPort.value = data.port;
  } catch {
    lanIps.value = [];
  } finally {
    lanLoading.value = false;
  }
}

function copyLanUrl(ip: string) {
  navigator.clipboard.writeText(`http://${ip}:${lanPort.value}`).then(() => ElMessage.success('已复制地址'));
}

function openLan(ip: string) {
  const url = `http://${ip}:${lanPort.value}`;
  const w = window as any;
  // 桌面端优先用系统默认浏览器打开（Electron shell.openExternal），web 端回退新标签页
  if (w.electronAPI?.shell?.openExternal) {
    w.electronAPI.shell.openExternal(url);
    ElMessage.success('已在系统浏览器打开');
  } else if (w.open) {
    w.open(url, '_blank', 'noopener,noreferrer');
    ElMessage.success('已在新标签页打开');
  } else {
    ElMessage.warning('当前环境无法打开浏览器，请手动访问 ' + url);
  }
}

function openLanFirst() {
  if (lanIps.value.length > 0) openLan(lanIps.value[0].address);
  else ElMessage.warning('未检测到局域网 IP');
}

onMounted(() => {
  void loadLanIps();
});

onMounted(async () => {
  await toolsStore.loadMarketplaceConfig();
  mpEnabled.value = toolsStore.marketplaceEnabled;
  mpAuthType.value = toolsStore.marketplaceAuth.authType || 'none';
  mpAuthValue.value = toolsStore.marketplaceAuth.token || '';
  mpPort.value = toolsStore.marketplacePort || 3001;
});
</script>

<style scoped>
/* .page / .page-title come from App.vue global */
.page-title { margin-bottom: 24px; }
.glass-tabs { background: var(--glass-bg); backdrop-filter: var(--glass-filter); border-radius: var(--radius-md); padding: 16px; }

@media (max-width: 767px) {
  .page-title { font-size: 18px; margin-bottom: 16px; }
  .glass-tabs { padding: 12px; }
  .glass-tabs :deep(.el-tabs__header) { margin-bottom: 12px; }
  .glass-tabs :deep(.el-tabs__nav-wrap::after) { display: none; }
  .el-form { max-width: 100% !important; }
  .el-form-item { margin-bottom: 14px; }
  .data-section { flex-wrap: wrap; gap: 8px; }
  .data-section .el-button:nth-child(1),
  .data-section .el-button:nth-child(2) { flex: 1 1 calc(50% - 4px); min-width: 0; white-space: nowrap; }
  .data-section .el-button:nth-child(3) { flex: 1 1 100%; }
}

.theme-grid { display: flex; gap: 10px; flex-wrap: wrap; }
.theme-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--glass-border);
  border-radius: 18px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
}
.theme-chip:hover { background: var(--glass-bg-hover); }
.theme-chip.active { border-color: var(--chip-color); background: color-mix(in srgb, var(--chip-color) 12%, transparent); }
.theme-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--chip-color); box-shadow: 0 0 6px var(--chip-color); }

/* ===== 皮肤库（独立 tab） ===== */
.skin-page { display: flex; flex-direction: column; gap: 18px; }
.skin-page-tip { font-size: 12px; color: var(--color-text-secondary); }
.skin-cat-label { font-size: 13px; font-weight: 600; color: var(--color-text); margin-bottom: 10px; }
.skin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.skin-card {
  position: relative;
  border: 2px solid var(--glass-border);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  background: var(--glass-bg);
  transition: border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
}
.skin-card:hover { border-color: var(--color-primary); transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.12); }
.skin-card.active { border-color: var(--color-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent); }
.skin-thumb { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; display: block; }
.skin-card-body { display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; }
.skin-name { font-size: 13px; font-weight: 600; }
.skin-src { font-size: 11px; color: var(--color-text-secondary); cursor: pointer; border: none; background: transparent; padding: 2px 4px; border-radius: 6px; }
.skin-src:hover { color: var(--color-primary); background: var(--glass-bg-hover); }
.skin-active-badge {
  position: absolute; top: 6px; right: 6px;
  font-size: 10px; padding: 2px 8px; border-radius: 999px;
  background: var(--color-primary); color: #fff;
}
.skin-empty { font-size: 13px; color: var(--color-text-secondary); }

.form-tip { font-size: 12px; color: var(--color-text-secondary); }

.data-section { display: flex; gap: 12px; }
.lan-section { max-width: 600px; }
.lan-tip { color: var(--color-text-secondary); font-size: 13px; margin-bottom: 16px; }
.lan-empty { color: var(--color-text-secondary); font-size: 13px; padding: 16px 0; }
.lan-list { display: flex; flex-direction: column; gap: 12px; }
.lan-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 10px; }
.lan-url-box { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.lan-url-box code { font-family: "JetBrains Mono", monospace; font-size: 13px; color: var(--color-text); word-break: break-all; }
.lan-iface { font-size: 11px; color: var(--color-text-secondary); }
.lan-actions { display: flex; gap: 8px; flex-shrink: 0; }
.about-section h3 { margin-bottom: 12px; }
.about-section p { margin: 6px 0; color: var(--color-text-secondary); }
.about-tip { font-size: 12px; opacity: 0.7; }
.about-link { color: var(--color-primary); text-decoration: none; }
.about-link:hover { text-decoration: underline; }
.connect-url-box { display: flex; align-items: center; gap: 8px; background: rgba(15,23,42,0.04); border-radius: 6px; padding: 6px 10px; }
.connect-url-box code { font-family: monospace; font-size: 13px; color: var(--color-primary); }

/* 日志页嵌入设置 tab 时：去掉独立滚动，让整页自然滚动 */
.logs-tab-embed { padding: 4px 0; }
.logs-tab-embed :deep(.logs-page) {
  padding: 0;
  overflow: visible;
  min-height: 0;
}
.logs-tab-embed :deep(.logs-list) {
  overflow: visible;
  flex: none;
}
.logs-tab-embed :deep(.stats-table-wrap) {
  max-height: 320px;
}

</style>
