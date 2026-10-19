<template>
  <div class="ext-panel">
    <div class="ext-head">
      <div class="ext-head-main">
        <div class="ext-title">浏览器扩展</div>
        <div class="ext-sub">
          仅对内置浏览器生效（独立 session，不影响应用界面）。支持已解压的 Manifest V2 / V3 扩展目录。
        </div>
      </div>
      <div class="ext-head-actions">
        <el-button :loading="installing" :disabled="!supported" @click="install">
          安装扩展目录
        </el-button>
        <el-button type="primary" :loading="installingZip" :disabled="!supported" @click="installZip">
          安装 zip 包
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="!supported"
      type="info"
      :closable="false"
      show-icon
      title="扩展管理仅在桌面端可用"
    />
    <el-alert v-else-if="error" type="error" :closable="false" show-icon :title="error" />

    <div v-if="supported" class="ext-store">
      <div class="ext-store-head">
        <div>
          <div class="ext-store-title">精选扩展</div>
          <div class="ext-store-sub">商店安装仅限白名单；其他扩展可用右上角「安装扩展目录」。</div>
        </div>
        <el-button size="small" :loading="updating" @click="checkUpdates">检查更新</el-button>
      </div>
      <div class="ext-store-grid">
        <div v-for="w in whitelist" :key="w.id" class="ext-store-card">
          <div class="ext-store-main">
            <div class="ext-store-name-row">
              <span class="ext-store-name">{{ w.name }}</span>
              <el-tag size="small" :type="w.status === 'verified' ? 'success' : 'warning'">
                {{ w.status === 'verified' ? '已验证' : '部分可用' }}
              </el-tag>
            </div>
            <div class="ext-store-note">{{ w.note }}</div>
          </div>
          <el-button
            size="small"
            type="primary"
            :loading="storeInstalling === w.id"
            :disabled="isInstalled(w.id)"
            @click="installStore(w)"
          >{{ isInstalled(w.id) ? '已安装' : '安装' }}</el-button>
        </div>
      </div>
    </div>

    <div v-if="supported && extensions.length" class="ext-toolbar">
      <el-input
        v-model="search"
        size="small"
        clearable
        placeholder="搜索扩展名称或描述"
        class="ext-search"
      />
      <span class="ext-count">{{ filteredExtensions.length }} / {{ extensions.length }}</span>
    </div>

    <div v-if="supported && !loading && !extensions.length" class="ext-empty">
      还没有安装扩展。点击右上角，选择一个包含 <code>manifest.json</code> 的已解压目录。
    </div>
    <div v-else-if="supported && extensions.length && !filteredExtensions.length" class="ext-empty">
      没有匹配「{{ search }}」的扩展。
    </div>

    <div v-for="ext in filteredExtensions" :key="ext.key" class="ext-card">
      <div class="ext-icon">
        <img v-if="ext.iconDataUrl" :src="ext.iconDataUrl" alt="" />
        <span v-else class="ext-icon-fallback">{{ (ext.name || '?').slice(0, 1) }}</span>
      </div>
      <div class="ext-card-main">
        <div class="ext-name-row">
          <span class="ext-name">{{ ext.name }}</span>
          <span class="ext-version">v{{ ext.version }}</span>
          <el-tag v-if="ext.manifestVersion" size="small" :type="ext.manifestVersion === 3 ? 'warning' : 'info'">
            MV{{ ext.manifestVersion }}
          </el-tag>
          <el-tag v-if="!ext.enabled" size="small" type="info">已停用</el-tag>
          <el-tag v-if="ext.source === 'store'" size="small" type="success">商店</el-tag>
        </div>
        <div v-if="ext.description" class="ext-desc">{{ ext.description }}</div>
        <div v-if="ext.permissions.length || ext.hostPermissions.length" class="ext-perms">
          <el-tag
            v-for="p in ext.permissions"
            :key="'perm-' + p"
            size="small"
            class="perm-chip"
            :title="permissionLabel(p)"
          >{{ p }}</el-tag>
          <el-tag
            v-for="p in ext.hostPermissions"
            :key="'host-' + p"
            size="small"
            type="danger"
            class="perm-chip"
            :title="'可读取/修改这些站点的内容：' + p"
          >{{ p }}</el-tag>
        </div>
        <div class="ext-meta">
          <span>{{ sourceLabel(ext) }}</span>
          <span v-if="ext.installedAt">安装于 {{ formatDate(ext.installedAt) }}</span>
          <span v-if="ext.storeId" class="ext-mono">{{ ext.storeId }}</span>
        </div>
        <div v-if="ext.origin" class="ext-origin" :title="ext.origin">来源：{{ ext.origin }}</div>
        <div v-if="ext.manifestError" class="ext-warn">manifest 读取失败：{{ ext.manifestError }}</div>
        <div v-else-if="ext.loadError" class="ext-warn">加载失败：{{ ext.loadError }}</div>
        <div v-if="ext.fingerprint" class="ext-fingerprint" :title="ext.origin || ''">
          指纹 SHA-256 {{ ext.fingerprint.slice(0, 16) }}…
        </div>
      </div>
      <div class="ext-actions">
        <el-switch
          :model-value="ext.enabled"
          :loading="busyKey === ext.key"
          :disabled="!!ext.manifestError"
          @change="(v: boolean) => toggle(ext, v)"
        />
        <el-button size="small" :disabled="!ext.enabled || !ext.popup" @click="openPage(ext, 'popup')">弹窗</el-button>
        <el-button size="small" :disabled="!ext.enabled || !ext.optionsPage" @click="openPage(ext, 'options')">选项</el-button>
        <el-button size="small" type="danger" plain :loading="busyKey === ext.key" @click="remove(ext)">删除</el-button>
      </div>
    </div>

    <div class="ext-foot">
      <div>兼容性：内容脚本、MV2 后台页、MV3 service worker、<code>webRequest</code> 拦截可用；MV3 <code>declarativeNetRequest</code>（多数新版去广告扩展）不生效。</div>
      <div>扩展可读取本浏览器访问的页面内容（含登录态），请只安装可信来源。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

interface ExtensionEntry {
  key: string;
  name: string;
  version: string;
  manifestVersion: number | null;
  description: string;
  permissions: string[];
  hostPermissions: string[];
  popup: string;
  optionsPage: string;
  enabled: boolean;
  loadError: string | null;
  manifestError?: string;
  source?: 'folder' | 'zip' | 'store';
  storeId?: string | null;
  installedAt?: string | null;
  /** 安装包指纹（zip 为文件 SHA-256；目录为内容 SHA-256） */
  fingerprint?: string | null;
  /** 安装来源：目录路径或 zip 文件路径 */
  origin?: string | null;
  /** manifest 声明的图标（data URL，管理页展示用） */
  iconDataUrl?: string;
}

interface WhitelistEntry {
  id: string;
  name: string;
  status: 'verified' | 'partial';
  note: string;
}

interface ExtensionApi {
  list: () => Promise<{ ok: boolean; error?: string; extensions?: ExtensionEntry[] }>;
  installDir: () => Promise<{ ok: boolean; canceled?: boolean; error?: string; entry?: { name?: string } }>;
  installZip: () => Promise<{ ok: boolean; canceled?: boolean; error?: string; entry?: { name?: string } }>;
  toggle: (key: string, enabled: boolean) => Promise<{ ok: boolean; error?: string }>;
  remove: (key: string) => Promise<{ ok: boolean; error?: string }>;
  openPage: (key: string, kind: 'popup' | 'options') => Promise<{ ok: boolean; error?: string }>;
  whitelist: () => Promise<{ ok: boolean; error?: string; extensions?: WhitelistEntry[] }>;
  installStore: (idOrUrl: string) => Promise<{ ok: boolean; error?: string; entry?: { name?: string } }>;
  update: () => Promise<{ ok: boolean; error?: string }>;
}

const api: ExtensionApi | undefined = (window as any).electronAPI?.extensions;
const supported = !!api;
const extensions = ref<ExtensionEntry[]>([]);
const whitelist = ref<WhitelistEntry[]>([]);
const loading = ref(false);
const installing = ref(false);
const installingZip = ref(false);
const storeInstalling = ref('');
const updating = ref(false);
const busyKey = ref('');
const error = ref('');
const search = ref('');

/** 常见权限的中文解释（未收录的原样展示权限名） */
const PERMISSION_LABELS: Record<string, string> = {
  storage: '读写扩展自己的本地存储',
  unlimitedStorage: '不受配额限制地存储数据',
  tabs: '读取标签页标题与网址',
  activeTab: '在你点击扩展时访问当前页面',
  scripting: '向页面注入脚本或样式',
  cookies: '读取和修改网站 Cookie（含登录态）',
  webRequest: '监听或拦截网络请求',
  webNavigation: '读取页面导航事件',
  contextMenus: '添加浏览器右键菜单项',
  notifications: '显示系统通知',
  downloads: '管理下载任务',
  history: '读取浏览历史',
  bookmarks: '读写书签',
  clipboardRead: '读取剪贴板',
  clipboardWrite: '写入剪贴板',
  alarms: '设置定时任务',
  identity: '读取账号身份信息',
  management: '管理其它扩展',
  debugger: '调试页面与扩展',
};

function permissionLabel(p: string) {
  return PERMISSION_LABELS[p] || p;
}

const filteredExtensions = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return extensions.value;
  return extensions.value.filter((ext) =>
    (ext.name || '').toLowerCase().includes(q) || (ext.description || '').toLowerCase().includes(q),
  );
});

function sourceLabel(ext: ExtensionEntry) {
  if (ext.source === 'store') return 'Chrome 商店';
  if (ext.source === 'zip') return '本地 zip 包';
  return '本地目录';
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function refresh() {
  if (!api) return;
  loading.value = true;
  try {
    const r = await api.list();
    if (r && r.ok) {
      extensions.value = r.extensions || [];
      error.value = '';
    } else {
      error.value = r?.error || '读取扩展列表失败';
    }
  } catch (e: any) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function install() {
  if (!api) return;
  installing.value = true;
  try {
    const r = await api.installDir();
    if (r?.canceled) return;
    if (!r?.ok) {
      ElMessage.error(r?.error || '安装失败');
      return;
    }
    ElMessage.success('已安装：' + (r.entry?.name || '扩展'));
    await refresh();
  } catch (e: any) {
    ElMessage.error(e?.message || String(e));
  } finally {
    installing.value = false;
  }
}

async function installZip() {
  if (!api) return;
  installingZip.value = true;
  try {
    const r = await api.installZip();
    if (r?.canceled) return;
    if (!r?.ok) {
      ElMessage.error(r?.error || '安装失败');
      return;
    }
    ElMessage.success('已安装：' + (r.entry?.name || '扩展'));
    await refresh();
  } catch (e: any) {
    ElMessage.error(e?.message || String(e));
  } finally {
    installingZip.value = false;
  }
}

async function toggle(ext: ExtensionEntry, enabled: boolean) {
  if (!api) return;
  busyKey.value = ext.key;
  try {
    const r = await api.toggle(ext.key, enabled);
    if (!r?.ok) ElMessage.error(r?.error || '切换失败');
    await refresh();
  } catch (e: any) {
    ElMessage.error(e?.message || String(e));
  } finally {
    busyKey.value = '';
  }
}

async function remove(ext: ExtensionEntry) {
  if (!api) return;
  try {
    await ElMessageBox.confirm(
      `确定删除扩展「${ext.name}」？扩展文件会一并删除。`,
      '删除扩展',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  busyKey.value = ext.key;
  try {
    const r = await api.remove(ext.key);
    if (!r?.ok) ElMessage.error(r?.error || '删除失败');
    await refresh();
  } catch (e: any) {
    ElMessage.error(e?.message || String(e));
  } finally {
    busyKey.value = '';
  }
}

async function openPage(ext: ExtensionEntry, kind: 'popup' | 'options') {
  if (!api) return;
  try {
    const r = await api.openPage(ext.key, kind);
    if (!r?.ok) ElMessage.error(r?.error || '打开失败');
  } catch (e: any) {
    ElMessage.error(e?.message || String(e));
  }
}

async function loadWhitelist() {
  if (!api) return;
  try {
    const r = await api.whitelist();
    if (r?.ok) whitelist.value = r.extensions || [];
  } catch {
    /* 白名单读取失败不阻塞本地扩展列表 */
  }
}

function isInstalled(storeId: string) {
  return extensions.value.some((e) => e.storeId === storeId);
}

async function installStore(w: WhitelistEntry) {
  if (!api) return;
  try {
    await ElMessageBox.confirm(
      `即将从 Chrome 商店安装「${w.name}」。\n\n${w.note}\n\n该扩展可以读取你在内置浏览器中访问的页面内容（包括已登录站点）。`,
      '安装浏览器扩展',
      { type: 'warning', confirmButtonText: '安装', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  storeInstalling.value = w.id;
  try {
    const r = await api.installStore(w.id);
    if (!r?.ok) {
      ElMessage.error(r?.error || '安装失败');
      return;
    }
    ElMessage.success('已安装：' + (r.entry?.name || w.name));
    await refresh();
  } catch (e: any) {
    ElMessage.error(e?.message || String(e));
  } finally {
    storeInstalling.value = '';
  }
}

async function checkUpdates() {
  if (!api) return;
  updating.value = true;
  try {
    const r = await api.update();
    if (!r?.ok) {
      ElMessage.error(r?.error || '检查更新失败');
      return;
    }
    ElMessage.success('更新检查完成');
    await refresh();
  } catch (e: any) {
    ElMessage.error(e?.message || String(e));
  } finally {
    updating.value = false;
  }
}

onMounted(() => {
  void refresh();
  void loadWhitelist();
});
</script>

<style scoped>
.ext-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 2px 16px;
}
.ext-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.ext-head-main { min-width: 0; }
.ext-head-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.ext-fingerprint {
  margin-top: 6px;
  font-size: 11px;
  font-family: var(--el-font-family-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  color: var(--color-text-secondary);
  opacity: 0.8;
  word-break: break-all;
}
.ext-title { font-size: 15px; font-weight: 600; color: var(--color-text-primary); }
.ext-sub {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}
.ext-empty {
  padding: 28px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-secondary);
  background: var(--glass-bg);
  border: 1px dashed var(--glass-border);
  border-radius: 10px;
}
.ext-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
}
.ext-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ext-search { max-width: 280px; }
.ext-count { font-size: 12px; color: var(--color-text-secondary); }
.ext-icon {
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8px;
  background: var(--glass-bg-hover);
}
.ext-icon img { width: 100%; height: 100%; object-fit: contain; }
.ext-icon-fallback { font-size: 16px; font-weight: 600; color: var(--color-text-secondary); }
.ext-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
  opacity: 0.85;
}
.ext-mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.ext-origin {
  margin-top: 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--color-text-secondary);
  opacity: 0.7;
}
.ext-card-main { min-width: 0; flex: 1; }
.ext-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ext-name { font-size: 14px; font-weight: 600; color: var(--color-text-primary); }
.ext-version { font-size: 12px; color: var(--color-text-secondary); }
.ext-desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}
.ext-perms {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.perm-chip { max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
.ext-warn {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-danger, #c7382e);
}
.ext-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.ext-foot {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}
.ext-foot code,
.ext-empty code {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--glass-bg-hover);
}
.ext-store {
  padding: 14px 16px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
}
.ext-store-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.ext-store-title { font-size: 14px; font-weight: 600; color: var(--color-text-primary); }
.ext-store-sub { margin-top: 4px; font-size: 12px; line-height: 1.6; color: var(--color-text-secondary); }
.ext-store-grid { display: flex; flex-direction: column; gap: 8px; }
.ext-store-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: var(--glass-bg-hover);
}
.ext-store-main { min-width: 0; }
.ext-store-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ext-store-name { font-size: 13px; font-weight: 600; color: var(--color-text-primary); }
.ext-store-note {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}
@media (max-width: 720px) {
  .ext-head { flex-direction: column; }
  .ext-card { flex-direction: column; }
  .ext-actions { justify-content: flex-start; }
  .ext-store-card { flex-direction: column; align-items: flex-start; }
}
</style>
