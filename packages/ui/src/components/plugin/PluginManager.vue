<template>
  <div class="plugin-manager">
    <!-- 统一工具条：左搜索 / 右「分类筛选 → 操作按钮」（与商城、工具、MCP 各页一致） -->
    <div class="pm-toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索插件"
        clearable
        class="pm-search"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <div class="pm-header-actions">
        <el-select v-model="activeCat" class="pm-cat-select yz-cat-select" popper-class="pm-cat-popper" placeholder="全部分类">
          <template #prefix><el-icon :size="14"><Collection /></el-icon></template>
          <el-option :value="''" label="全部">
            <span class="pm-cat-opt-label">全部</span>
            <span class="pm-cat-opt-count">{{ pluginStore.plugins.length }}</span>
          </el-option>
          <el-option
            v-for="g in allGroups"
            :key="g.key"
            :value="g.key"
            :label="g.label"
          >
            <span class="pm-cat-opt-label">{{ g.label }}</span>
            <span class="pm-cat-opt-count">{{ g.items.length }}</span>
          </el-option>
        </el-select>
        <el-button @click="onOpenTemplate">
          <el-icon style="margin-right: 5px"><Document /></el-icon>开发模板
        </el-button>
        <el-button type="primary" @click="onInstall">
          <el-icon style="margin-right: 5px"><Upload /></el-icon>安装插件 (.yzp)
        </el-button>
      </div>
    </div>

    <div v-if="!pluginStore.loaded" class="pm-empty">
      <el-skeleton :rows="3" animated style="max-width: 480px" />
    </div>
    <div v-else-if="filtered.length === 0" class="pm-empty">
      <el-empty :description="keyword || activeCat ? '没有匹配的插件' : '暂无插件，安装一个试试'">
        <el-button v-if="!keyword && !activeCat" type="primary" @click="onInstall">安装插件 (.yzp)</el-button>
      </el-empty>
    </div>
    <div v-else class="pm-groups">
      <section v-for="g in groupedFiltered" :key="g.key" class="pm-group">
        <div class="pm-group-head">
          <span class="pm-group-title">{{ g.label }}</span>
          <span class="pm-group-count">{{ g.items.length }}</span>
        </div>
        <div class="pm-list">
          <div v-for="p in g.items" :key="p.manifest.id" class="pm-card" :class="{ 'is-error': p.state === 'error' }">
            <div class="pm-card-head">
              <!-- 皮肤/调色板插件：用该皮肤自身的渐变做色块图标（27 套皮肤各有独有色，
                   不再清一色 Box 盒子图标）；功能插件按插件类型选图标 -->
              <div v-if="swatchOf(p)" class="pm-icon pm-swatch" :style="{ background: swatchOf(p) }"></div>
              <div v-else class="pm-icon"><el-icon :size="20"><component :is="cardIconOf(p)" /></el-icon></div>
              <div class="pm-title">
                <span class="pm-name" :title="p.manifest.id">{{ p.manifest.name }}</span>
                <span class="pm-ver">v{{ p.manifest.version }}</span>
              </div>
              <el-switch
                :model-value="p.state === 'enabled'"
                size="small"
                @change="toggle(p)"
              />
            </div>
            <!-- 描述固定 3 行高度（不足留空），保证同行卡片同高；完整文案在「详情」里 -->
            <div class="pm-desc" :title="p.manifest.description || ''">{{ p.manifest.description || '无描述' }}</div>
            <div class="pm-perms">
              <el-dropdown trigger="click" @command="(cmd: string | number | object) => onPickCategory(p, cmd)">
                <span class="pm-cat-tag" title="点击修改分类">
                  <el-icon :size="12"><Collection /></el-icon>{{ categoryOf(p) }}
                </span>
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
              <span
                v-for="perm in p.manifest.permissions || []"
                :key="perm"
                class="pm-perm-tag"
                :title="PERM_LABELS[perm] || perm"
              >{{ PERM_LABELS[perm] || perm }}</span>
              <span class="pm-source-tag" :class="p.source === 'builtin' ? 'is-builtin' : 'is-installed'">
                {{ p.source === 'builtin' ? '内置' : '已安装' }}
              </span>
              <span v-if="p.state === 'error'" class="pm-source-tag is-danger">错误</span>
            </div>
            <div v-if="p.error" class="pm-error">{{ p.error }}</div>
            <div class="pm-actions">
              <el-button size="small" text bg @click="openConfig(p)">配置</el-button>
              <el-button size="small" text bg @click="openDetail(p)">详情</el-button>
              <el-button size="small" text bg @click="onExport(p)">导出</el-button>
              <el-button v-if="p.manifest.id === 'computer-use' && p.state === 'enabled'" size="small" text bg @click="onAudit(p)">记录</el-button>
              <el-button
                v-if="p.source !== 'builtin'"
                size="small"
                text
                bg
                type="danger"
                @click="onUninstall(p)"
              >卸载</el-button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <el-dialog v-model="configOpen" title="插件配置" width="520" :close-on-click-modal="false">
      <el-input v-model="configText" type="textarea" :rows="10" class="pm-json-input" />
      <template #footer>
        <el-button @click="configOpen = false">取消</el-button>
        <el-button type="primary" @click="saveConfig">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailOpen" title="插件详情" width="520">
      <pre class="pm-detail pm-code">{{ detailContent }}</pre>
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
        <div
          class="install-dropzone"
          :class="{ 'is-dragover': installDragover, 'is-loading': installLoading }"
          @click="!installLoading && fileInputRef?.click()"
          @dragover.prevent="installDragover = true"
          @dragleave.prevent="installDragover = false"
          @drop.prevent="onDropFile"
        >
          <input ref="fileInputRef" type="file" accept=".yzp" style="display: none" @change="onFileChange" />
          <el-icon :size="32" class="install-dropzone-icon"><UploadFilled /></el-icon>
          <template v-if="installLoading">
            <div class="install-dropzone-text">正在解析插件包…</div>
          </template>
          <template v-else>
            <div class="install-dropzone-text">
              拖拽 <b>.yzp</b> 插件包到此处，或<span class="install-dropzone-link">点击选择文件</span>
            </div>
            <div class="install-dropzone-sub">仅支持 .yzp 格式（zip 打包的 manifest.json + 插件源码）</div>
          </template>
        </div>
        <el-alert type="info" :closable="false" show-icon>
          不会写插件？先在「开发模板」里下载脚手架，改完打包成 .yzp 再回来安装。
        </el-alert>
      </div>
      <div v-else-if="installStep === 'confirm' && installManifest" class="install-step">
        <div class="install-manifest">
          <div class="install-mh">
            <div class="pm-icon"><el-icon :size="20"><Box /></el-icon></div>
            <div>
              <div class="install-mname">{{ installManifest.name }}</div>
              <div class="install-mmeta">
                <span class="install-mver">v{{ installManifest.version }}</span>
                <span v-if="installManifest.author"> · 作者：{{ installManifest.author }}</span>
              </div>
            </div>
          </div>
          <div class="install-mdesc">{{ installManifest.description || '无描述' }}</div>
          <div class="install-mperms">
            <div class="install-perms-title">该插件将获得以下权限：</div>
            <div v-if="(installManifest.permissions || []).length === 0" class="install-no-perm">无额外权限</div>
            <el-tag v-for="perm in installManifest.permissions || []" :key="perm" size="small" type="warning" effect="plain">
              {{ PERM_LABELS[perm] || perm }}
            </el-tag>
          </div>
        </div>
        <el-alert type="warning" :closable="false" show-icon>
          请确认你信任此插件来源。插件可在权限范围内访问你的文件系统、执行命令等。
        </el-alert>
      </div>
      <template #footer>
        <el-button v-if="installStep === 'confirm'" @click="installStep = 'select'">重新选择</el-button>
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
import { Search, Document, Upload, Box, Collection, UploadFilled, Share, Mouse } from '@element-plus/icons-vue';
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
const installDragover = ref(false);
const installBase64 = ref('');
const installManifest = ref<PluginManifest | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const PERM_LABELS: Record<string, string> = {
  fs: '文件系统读写',
  shell: '执行系统命令',
  git: 'Git 操作',
  db: '数据库读写（仅插件自有表）',
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

/**
 * 皮肤/调色板插件的图标色块：取该插件贡献主题的渐变色（每套皮肤独有）。
 * 无主题贡献的功能插件返回空串，走 cardIconOf 的图标分支。
 */
function swatchOf(p: PluginInfo): string {
  const t = p.manifest.contributes?.themes?.[0];
  if (!t) return '';
  return t.gradient || `linear-gradient(135deg, ${t.primaryLight}, ${t.primary})`;
}

/** 功能插件卡片图标：按插件 id 区分语义，未命中回退 Box */
function cardIconOf(p: PluginInfo) {
  if (p.manifest.id === 'git-file-manager') return Share; // 分叉节点形似 git
  if (p.manifest.id === 'computer-use') return Mouse;
  return Box;
}
const allCategories = computed<string[]>(() => {
  const set = new Set<string>(CATEGORY_PRESETS);
  for (const p of pluginStore.plugins) set.add(categoryOf(p));
  for (const v of Object.values(catOverrides.value)) if (v) set.add(v);
  return Array.from(set);
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

/**
 * 按分类分组：提取为通用函数，供下拉选项（全量）与内容区（筛选后）共用。
 * 排序：功能 → 操作 → 皮肤 → 安全 → 其余自定义分类（按名称）。
 */
const GROUP_ORDER = ['功能', '操作', '皮肤', '安全'];
function groupPlugins(list: PluginInfo[]) {
  const map = new Map<string, PluginInfo[]>();
  for (const p of list) {
    const c = categoryOf(p);
    const arr = map.get(c);
    if (arr) arr.push(p);
    else map.set(c, [p]);
  }
  const keys = Array.from(map.keys());
  keys.sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a);
    const ib = GROUP_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, 'zh-CN');
  });
  return keys.map((key) => ({ key, label: key, items: map.get(key) as PluginInfo[] }));
}

/** 下拉选项用：全量插件分组（不受当前筛选影响，否则选中分类后选项缺失） */
const allGroups = computed(() => groupPlugins(pluginStore.plugins));

/** 内容区用：筛选后的分组 */
const groupedFiltered = computed(() => groupPlugins(filtered.value));

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
    await ElMessageBox.confirm(`确定卸载 ${p.manifest.name}？`, '确认', { confirmButtonClass: 'yz-confirm-danger' });
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

function onDropFile(e: DragEvent) {
  installDragover.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) void handleFile(file);
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  await handleFile(file);
}

async function handleFile(file: File) {
  if (!file.name.endsWith('.yzp')) {
    ElMessage.error('请选择 .yzp 文件');
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
.pm-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
/* 分类筛选下拉：宽度由 .yz-cat-select 统一给定（160px），分类增多也不占版面 */
.pm-cat-select {
  flex-shrink: 0;
}
.pm-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.pm-search {
  flex: 1 1 220px;
  max-width: 420px;
}
.pm-empty {
  padding: 48px 0;
  display: flex;
  justify-content: center;
  color: var(--color-text-secondary);
}
.pm-groups {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.pm-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.pm-group-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
}
/* 与下拉选项里的数量胶囊同一形态（显式高度 + line-height:1，避免被父级行高撑成椭圆） */
.pm-group-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary);
  background: var(--color-surface-hover);
}
.pm-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
  /* 关键：stretch（默认值）让同行卡片同高 */
  align-items: stretch;
}
.pm-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%; /* 关键：跟随 grid 单元拉伸，同行同高 */
  transition: transform var(--motion-base) var(--ease-out),
    box-shadow var(--motion-base) var(--ease-out),
    border-color var(--motion-base) var(--ease-out);
}
.pm-card:hover {
  transform: translateY(-2px);
  border-color: var(--glass-border-strong);
  box-shadow: var(--shadow-md);
}
.pm-card.is-error {
  border-color: color-mix(in srgb, var(--color-danger) 45%, transparent);
}
.pm-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pm-icon {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
}
.pm-title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.pm-name {
  font-weight: 600;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pm-ver {
  color: var(--color-text-tertiary);
  font-size: 12px;
  font-family: var(--font-mono);
  flex-shrink: 0;
}
.pm-desc {
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.5;
  min-height: 20px;
  /* 固定 3 行高度：描述不足 3 行也占位（卡片同高关键）；超出 3 行截断 */
  height: calc(13px * 1.5 * 3);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* 皮肤渐变色块：铺满图标容器，不再叠主题色浅底 */
.pm-swatch {
  background: none;
  border: 1px solid rgba(15, 23, 42, 0.08);
}
.pm-perms {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.pm-cat-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--color-primary);
  background: var(--color-primary-light);
  transition: filter var(--motion-fast) var(--ease-out);
}
.pm-cat-tag:hover { filter: brightness(0.96); }
.pm-perm-tag {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  color: var(--color-text-secondary);
  background: var(--color-surface-hover);
  border: 1px solid var(--glass-border);
}
.pm-source-tag {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
}
.pm-source-tag.is-builtin {
  color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
}
.pm-source-tag.is-installed {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 12%, transparent);
}
.pm-source-tag.is-danger {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
}
.pm-error {
  color: var(--color-danger);
  font-size: 12px;
  line-height: 1.5;
}
.pm-actions {
  margin-top: auto; /* 贴底：卡片拉伸时所有按钮行底部对齐 */
  padding-top: 10px;
  border-top: 1px solid var(--glass-border);
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.pm-detail {
  font-size: 12px;
  font-family: var(--font-mono);
  white-space: pre-wrap;
  margin: 0;
}
.pm-code {
  max-height: 360px;
  overflow: auto;
  background: var(--color-surface-hover);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  padding: 12px;
}
.pm-json-input :deep(textarea) {
  font-family: var(--font-mono);
  font-size: 12px;
}
.install-step {
  min-height: 80px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.install-hint {
  color: var(--color-text-secondary);
  font-size: 13px;
  margin: 0;
  line-height: 1.6;
}
.install-dropzone {
  border: 1.5px dashed var(--glass-border-strong);
  border-radius: var(--radius-md);
  padding: 36px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  text-align: center;
  transition: border-color var(--motion-fast) var(--ease-out),
    background var(--motion-fast) var(--ease-out);
}
.install-dropzone:hover {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 4%, transparent);
}
.install-dropzone.is-dragover {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}
.install-dropzone.is-loading {
  cursor: progress;
}
.install-dropzone-icon {
  color: var(--color-text-tertiary);
}
.install-dropzone.is-dragover .install-dropzone-icon,
.install-dropzone:hover .install-dropzone-icon {
  color: var(--color-primary);
}
.install-dropzone-text {
  font-size: 14px;
  color: var(--color-text);
}
.install-dropzone-link {
  color: var(--color-primary);
  font-weight: 500;
}
.install-dropzone-sub {
  font-size: 12px;
  color: var(--color-text-tertiary);
}
.install-manifest {
  width: 100%;
  background: var(--color-surface-hover);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 14px;
}
.install-mh {
  display: flex;
  align-items: center;
  gap: 10px;
}
.install-mname {
  font-weight: 600;
  font-size: 15px;
}
.install-mmeta {
  color: var(--color-text-secondary);
  font-size: 12px;
  margin-top: 2px;
}
.install-mver {
  font-family: var(--font-mono);
}
.install-mdesc {
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.5;
  margin: 10px 0;
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
  color: var(--color-text-secondary);
}
</style>

<!-- 非 scoped：el-select 选项 teleport 到 body，需全局样式控制 popper 内布局 -->
<style>
.pm-cat-popper .el-select-dropdown__item {
  display: flex;
  align-items: center;
}
/* 分类名左、数量右（浅灰小胶囊，与卡片上的标签语言一致）
   ★★ 必须显式给 height + line-height:1：Element 的 .el-select-dropdown__item
   带 `line-height: 34px`，若不覆盖，<span> 会继承成 34px 高的盒子，
   而宽度只有 30px 左右 —— border-radius:999px 于是渲染成**竖向椭圆**（2026-10-04 用户报「很丑」）。
   tabular-nums 让数字等宽，多位数字不会左右跳。 */
.pm-cat-popper .pm-cat-opt-count {
  flex-shrink: 0;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary);
  background: var(--color-surface-hover, rgba(15, 23, 42, 0.05));
}
</style>
