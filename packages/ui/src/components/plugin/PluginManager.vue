<template>
  <div class="plugin-manager">
    <div class="pm-header">
      <div class="pm-cats">
        <span
          :class="['pm-cat-chip', { active: activeCat === '' }]"
          @click="activeCat = ''"
        >全部 {{ pluginStore.plugins.length }}</span>
        <span
          v-for="(n, cat) in catCounts"
          :key="cat"
          :class="['pm-cat-chip', { active: activeCat === cat }]"
          @click="activeCat = activeCat === cat ? '' : String(cat)"
        >{{ cat }} {{ n }}</span>
      </div>
      <div class="pm-header-actions">
        <el-input v-model="keyword" placeholder="搜索" size="small" style="width: 180px" />
        <el-button
          v-if="pluginStore.canInstall"
          size="small"
          type="primary"
          style="margin-left: 8px"
          @click="onInstall"
        >
          安装插件(.yzp)
        </el-button>
        <el-button size="small" style="margin-left: 8px" @click="onOpenTemplate">开发模板</el-button>
      </div>
    </div>
    <div v-if="!pluginStore.loaded" class="pm-empty">加载中…</div>
    <div v-else-if="filtered.length === 0" class="pm-empty">暂无插件</div>
    <div v-else class="pm-list">
      <div v-for="p in filtered" :key="p.manifest.id" class="pm-card">
        <div class="pm-card-head">
          <span class="pm-name">🧩 {{ p.manifest.name }}</span>
          <el-dropdown trigger="click" @command="(cmd: string | number | object) => onPickCategory(p, cmd)">
            <el-tag size="small" class="pm-cat-tag" :title="'点击修改分类'">{{ categoryOf(p) }}</el-tag>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="c in allCategories"
                  :key="c"
                  :command="c"
                  :disabled="c === categoryOf(p)"
                >{{ c }}</el-dropdown-item>
                <el-dropdown-item divided command="__custom">自定义…</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <span class="pm-ver">v{{ p.manifest.version }}</span>
          <el-switch
            :model-value="p.state === 'enabled'"
            size="small"
            @change="toggle(p)"
          />
        </div>
        <div class="pm-desc">{{ p.manifest.description || '无描述' }}</div>
        <div class="pm-perms">
          <el-tag
            v-for="perm in p.manifest.permissions || []"
            :key="perm"
            size="small"
            type="info"
          >{{ perm }}</el-tag>
          <el-tag size="small" :type="p.source === 'builtin' ? 'success' : 'warning'">
            {{ p.source === 'builtin' ? '内置' : '已安装' }}
          </el-tag>
          <el-tag v-if="p.state === 'error'" size="small" type="danger">错误</el-tag>
        </div>
        <div v-if="p.error" class="pm-error">{{ p.error }}</div>
        <div class="pm-actions">
          <el-button size="small" @click="openConfig(p)">配置</el-button>
          <el-button size="small" @click="openDetail(p)">详情</el-button>
          <el-button size="small" @click="onExport(p)">导出</el-button>
          <el-button v-if="p.manifest.id === 'computer-use' && p.state === 'enabled'" size="small" @click="onAudit(p)">记录</el-button>
          <el-button
            v-if="p.source !== 'builtin'"
            size="small"
            type="danger"
            @click="onUninstall(p)"
          >卸载</el-button>
        </div>
      </div>
    </div>

    <el-dialog v-model="configOpen" title="插件配置" width="500" :close-on-click-modal="false">
      <el-input v-model="configText" type="textarea" :rows="10" />
      <template #footer>
        <el-button @click="configOpen = false">取消</el-button>
        <el-button type="primary" @click="saveConfig">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailOpen" title="插件详情" width="500">
      <pre class="pm-detail">{{ detailContent }}</pre>
    </el-dialog>

    <!-- 插件开发模板 -->
    <el-dialog v-model="templateOpen" title="插件开发模板" width="640">
      <div v-if="templateData" class="install-step">
        <p class="install-hint">
          以 manifest + main.ts + README 打包的脚手架：注册工具 / 挂后端路由 / storage / 事件的用法示例。
          参考内置插件「{{ templateData.manifest?.name }}」的写法改造成你自己的插件。
        </p>
        <pre class="pm-detail pm-code">{{ templateData.code }}</pre>
      </div>
      <template #footer>
        <el-button @click="templateOpen = false">关闭</el-button>
        <el-button type="primary" :disabled="!templateData" @click="downloadBase64(templateData?.base64 || '', templateData?.filename || 'plugin-template.zip')">下载 zip</el-button>
      </template>
    </el-dialog>

    <!-- 电脑使用：操作审计 -->
    <el-dialog v-model="auditOpen" title="电脑使用 · 操作记录" width="620">
      <el-table :data="auditList" size="small" max-height="420">
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ new Date(row.t).toLocaleString('zh-CN') }}</template>
        </el-table-column>
        <el-table-column prop="op" label="操作" width="150" />
        <el-table-column label="参数">
          <template #default="{ row }">
            <span class="pm-detail">{{ JSON.stringify(row.detail ?? {}) }}</span>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="auditPanic" class="pm-error" style="margin-top: 8px">当前处于急停状态，请在插件卡片上重新启用</div>
      <template #footer>
        <el-button @click="auditOpen = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 安装向导 -->
    <el-dialog v-model="installOpen" title="安装插件" width="520" :close-on-click-modal="false">
      <div v-if="installStep === 'select'" class="install-step">
        <p class="install-hint">选择本地 .yzp 插件包进行安装。</p>
        <input ref="fileInputRef" type="file" accept=".yzp" style="display:none" @change="onFileChange" />
        <el-button type="primary" :loading="installLoading" @click="fileInputRef?.click()">选择 .yzp 文件</el-button>
      </div>
      <div v-else-if="installStep === 'confirm' && installManifest" class="install-step">
        <div class="install-manifest">
          <div class="install-mh">
            <span class="install-mname">🧩 {{ installManifest.name }}</span>
            <span class="install-mver">v{{ installManifest.version }}</span>
          </div>
          <div v-if="installManifest.author" class="install-mauthor">作者：{{ installManifest.author }}</div>
          <div class="install-mdesc">{{ installManifest.description || '无描述' }}</div>
          <div class="install-mperms">
            <div class="install-perms-title">该插件将获得以下权限：</div>
            <div v-if="(installManifest.permissions || []).length === 0" class="install-no-perm">无额外权限</div>
            <el-tag v-for="perm in installManifest.permissions || []" :key="perm" size="small" type="warning">
              {{ PERM_LABELS[perm] || perm }}
            </el-tag>
          </div>
        </div>
        <el-alert type="warning" :closable="false" show-icon style="margin-top: 12px">
          请确认你信任此插件来源。插件可在权限范围内访问你的文件系统、执行命令等。
        </el-alert>
      </div>
      <template #footer>
        <el-button @click="installOpen = false">取消</el-button>
        <el-button
          v-if="installStep === 'confirm'"
          type="primary"
          :loading="installLoading"
          @click="confirmInstall"
        >确认安装</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { usePluginStore, type PluginInfo } from '../../stores/plugin';
import { api } from '../../api/client';
import type { PluginManifest } from '@yan-zhi/core';

const pluginStore = usePluginStore();
const keyword = ref('');
const configOpen = ref(false);
const configText = ref('');
const configPlugin = ref<PluginInfo | null>(null);
const detailOpen = ref(false);
const detailContent = ref('');

// 安装向导状态
const installOpen = ref(false);
const installStep = ref<'select' | 'confirm'>('select');
const installLoading = ref(false);
const installBase64 = ref('');
const installManifest = ref<PluginManifest | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const PERM_LABELS: Record<string, string> = {
  fs: '文件系统读写',
  shell: '执行系统命令',
  git: 'Git 操作',
  db: '数据库读写',
  network: '网络请求',
  clipboard: '剪贴板',
  'desktop-input': '控制鼠标键盘（电脑使用）',
};

// 开发模板
const templateOpen = ref(false);
const templateData = ref<{ manifest?: PluginManifest; code?: string; base64?: string; filename?: string } | null>(null);

// ===== 插件分类 =====
// 口径：manifest.category（声明）> 用户自定义（localStorage）> 按 contributes/permissions 推导
const CATEGORY_PRESETS = ['功能', '皮肤', '操作'];
const CAT_OVERRIDE_KEY = 'plugin:categories';
const catOverrides = ref<Record<string, string>>((() => {
  try { return JSON.parse(localStorage.getItem(CAT_OVERRIDE_KEY) || '{}'); } catch { return {}; }
})());

function derivedCategory(p: PluginInfo): string {
  const themes = p.manifest.contributes?.themes || [];
  if (themes.some((t) => (t as { kind?: string }).kind === 'skin')) return '皮肤';
  if (p.manifest.category) return p.manifest.category;
  const perms = p.manifest.permissions || [];
  if (perms.includes('remote-shell') || perms.includes('shell') || perms.includes('desktop-input')) return '操作';
  return '功能';
}
function categoryOf(p: PluginInfo): string {
  return catOverrides.value[p.manifest.id] || derivedCategory(p);
}
const allCategories = computed<string[]>(() => {
  const set = new Set<string>(CATEGORY_PRESETS);
  for (const p of pluginStore.plugins) set.add(categoryOf(p));
  for (const v of Object.values(catOverrides.value)) if (v) set.add(v);
  return Array.from(set);
});
const catCounts = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {};
  for (const p of pluginStore.plugins) {
    const c = categoryOf(p);
    m[c] = (m[c] || 0) + 1;
  }
  return m;
});
const activeCat = ref('');

function persistCatOverrides() {
  try { localStorage.setItem(CAT_OVERRIDE_KEY, JSON.stringify(catOverrides.value)); } catch { /* ignore */ }
}
function onPickCategory(p: PluginInfo, cmd: string | number | object) {
  const cat = String(cmd);
  if (cat === '__custom') {
    ElMessageBox.prompt('输入自定义分类名称', '自定义分类', { inputValue: categoryOf(p) })
      .then(({ value }) => {
        const v = (value || '').trim();
        if (!v) return;
        catOverrides.value = { ...catOverrides.value, [p.manifest.id]: v };
        persistCatOverrides();
      })
      .catch(() => {});
    return;
  }
  catOverrides.value = { ...catOverrides.value, [p.manifest.id]: cat };
  persistCatOverrides();
}

const filtered = computed(() => {
  const kw = keyword.value.toLowerCase();
  return pluginStore.plugins.filter(
    (p) =>
      (!kw || p.manifest.name.toLowerCase().includes(kw) || p.manifest.id.includes(kw)) &&
      (!activeCat.value || categoryOf(p) === activeCat.value),
  );
});

async function toggle(p: PluginInfo) {
  if (p.state !== 'enabled' && (p.manifest.permissions || []).includes('desktop-input')) {
    try {
      await ElMessageBox.confirm(
        '该插件拥有「控制鼠标键盘」高危权限：启用后智能体可在任务中操作本机的鼠标、键盘和窗口（含截屏）。',
        '高危权限确认',
        { confirmButtonText: '我已知晓风险，启用', cancelButtonText: '取消', type: 'warning' },
      );
    } catch {
      return;
    }
  }
  const err =
    p.state === 'enabled'
      ? await pluginStore.disable(p.manifest.id)
      : await pluginStore.enable(p.manifest.id);
  if (err) ElMessage.error(err);
  else ElMessage.success(p.state === 'enabled' ? '已禁用' : '已启用');
}

function downloadBase64(base64: string, filename: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function onExport(p: PluginInfo) {
  const res = await api.get<{ format: string; filename: string; base64: string }>(`/plugins/${p.manifest.id}/export`);
  if ('error' in res) { ElMessage.error(res.error); return; }
  downloadBase64(res.data.base64, res.data.filename);
  ElMessage.success(res.data.format === 'yzp' ? '已导出 .yzp 插件包' : '已导出源码包');
}

async function onOpenTemplate() {
  const res = await api.get<{ manifest: PluginManifest; code: string; base64: string; filename: string }>('/plugins/template');
  if ('error' in res) { ElMessage.error(res.error); return; }
  templateData.value = res.data;
  templateOpen.value = true;
}

// 电脑使用操作审计
const auditOpen = ref(false);
const auditList = ref<Array<{ t: number; op: string; detail?: Record<string, unknown> }>>([]);
const auditPanic = ref(false);

async function onAudit(_p: PluginInfo) {
  const res = await api.get<{ panic: boolean; ops: Array<{ t: number; op: string; detail?: Record<string, unknown> }> }>(
    '/plugin/computer-use/audit',
  );
  if ('error' in res) { ElMessage.error(res.error); return; }
  auditPanic.value = !!res.data.panic;
  auditList.value = (res.data.ops || []).slice().reverse();
  auditOpen.value = true;
}

function openConfig(p: PluginInfo) {
  configPlugin.value = p;
  configText.value = JSON.stringify(p.config, null, 2);
  configOpen.value = true;
}

async function saveConfig() {
  if (!configPlugin.value) return;
  try {
    const cfg = JSON.parse(configText.value);
    const err = await pluginStore.setConfig(configPlugin.value.manifest.id, cfg);
    if (err) ElMessage.error(err);
    else {
      ElMessage.success('已保存');
      configOpen.value = false;
    }
  } catch {
    ElMessage.error('JSON 格式错误');
  }
}

function openDetail(p: PluginInfo) {
  detailContent.value = JSON.stringify(p.manifest, null, 2);
  detailOpen.value = true;
}

async function onUninstall(p: PluginInfo) {
  try {
    await ElMessageBox.confirm(`确定卸载 ${p.manifest.name}？`, '确认');
    const err = await pluginStore.uninstall(p.manifest.id);
    if (err) ElMessage.error(err);
    else ElMessage.success('已卸载');
  } catch {
    /* 取消 */
  }
}

function onInstall() {
  installStep.value = 'select';
  installManifest.value = null;
  installBase64.value = '';
  installOpen.value = true;
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (!file.name.endsWith('.yzp')) {
    ElMessage.error('请选择 .yzp 文件');
    input.value = '';
    return;
  }
  installLoading.value = true;
  try {
    const base64 = await fileToBase64(file);
    installBase64.value = base64;
    const res = await api.post<PluginManifest>('/plugins/install/preview', { base64 });
    if ('error' in res) { ElMessage.error(res.error); return; }
    installManifest.value = res.data;
    installStep.value = 'confirm';
  } catch (err) {
    ElMessage.error((err as Error).message || '读取文件失败');
  } finally {
    installLoading.value = false;
    input.value = '';
  }
}

async function confirmInstall() {
  if (!installManifest.value) return;
  installLoading.value = true;
  try {
    const res = await api.post<PluginInfo>('/plugins/install', { base64: installBase64.value });
    if ('error' in res) { ElMessage.error(res.error); return; }
    ElMessage.success(`已安装 ${installManifest.value.name}`);
    installOpen.value = false;
    await pluginStore.refresh();
  } catch (err) {
    ElMessage.error((err as Error).message || '安装失败');
  } finally {
    installLoading.value = false;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

onMounted(() => pluginStore.refresh());
</script>

<style scoped>
.plugin-manager {
  padding: 16px;
}
.pm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.pm-cats {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.pm-cat-chip {
  font-size: 12px;
  padding: 3px 12px;
  border-radius: 999px;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  border: 1px solid var(--el-border-color-lighter);
  user-select: none;
  transition: all 0.15s ease;
}
.pm-cat-chip:hover { color: var(--el-color-primary); border-color: var(--el-color-primary); }
.pm-cat-chip.active {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}
.pm-cat-tag { cursor: pointer; }
.pm-header h3 {
  margin: 0;
  font-size: 18px;
}
.pm-header-actions {
  display: flex;
  align-items: center;
}
.pm-empty {
  padding: 32px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
.pm-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  align-items: start;
}
.pm-card {
  border: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.1));
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pm-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pm-name {
  font-weight: 600;
  flex: 1;
}
.pm-ver {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.pm-desc {
  color: var(--el-text-color-regular);
  font-size: 13px;
  margin: 8px 0;
}
.pm-perms {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.pm-error {
  color: var(--el-color-danger);
  font-size: 12px;
  margin-top: 6px;
}
.pm-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}
.pm-detail {
  font-size: 12px;
  white-space: pre-wrap;
}
.pm-code {
  max-height: 360px;
  overflow: auto;
  background: var(--el-fill-color-light, rgba(15, 23, 42, 0.04));
  border-radius: 8px;
  padding: 12px;
}
.install-step {
  min-height: 80px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}
.install-hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin: 0;
}
.install-manifest {
  width: 100%;
}
.install-mh {
  display: flex;
  align-items: center;
  gap: 8px;
}
.install-mname {
  font-weight: 600;
  font-size: 15px;
}
.install-mver {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.install-mauthor {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 4px;
}
.install-mdesc {
  color: var(--el-text-color-regular);
  font-size: 13px;
  margin: 8px 0;
}
.install-mperms {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.install-perms-title {
  width: 100%;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
}
.install-no-perm {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
