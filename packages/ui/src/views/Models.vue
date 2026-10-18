<template>
  <div class="page">
    <header class="page-header">
      <h2 class="page-title">模型平台管理</h2>
      <div style="display:flex;gap:10px">
        <el-button :icon="Download" @click="showLocalMarket = true">本地模型商城</el-button>
        <el-button type="primary" :icon="Plus" @click="openAdd" class="add-btn-desktop">新增平台</el-button>
      </div>
    </header>

    <!-- 平台搜索 / 筛选：平台多了之后靠肉眼扫卡片找不动了 -->
    <SearchToolbar v-model:query="platformKeyword" placeholder="搜索平台名称 / API URL" :count="filteredPlatforms.length">
      <template #actions>
        <el-select v-model="protocolFilter" size="small" placeholder="全部协议" class="filter-select">
          <el-option label="全部协议" value="" />
          <el-option label="OpenAI" value="openai" />
          <el-option label="OpenAI Responses" value="openai-responses" />
          <el-option label="Anthropic" value="anthropic" />
          <el-option label="自定义" value="custom" />
        </el-select>
        <el-select v-model="statusFilter" size="small" placeholder="全部状态" class="filter-select">
          <el-option label="全部状态" value="" />
          <el-option label="正常" value="healthy" />
          <el-option label="掉线" value="down" />
          <el-option label="未知" value="unknown" />
        </el-select>
        <el-button v-if="platformFilterActive" size="small" text @click="clearPlatformFilter">重置</el-button>
      </template>
    </SearchToolbar>

    <!-- 内置厂商宫格已收进「新增平台」弹窗（2026-10-18）：页面不再常驻，点按钮先选厂商、再填信息 -->

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
      <el-card v-for="p in filteredPlatforms" :key="p.id" class="platform-card" :class="{ 'platform-card-disabled': p.llmEnabled === false }">
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
          <el-tag v-if="p.llmEnabled === false" size="small" type="danger" effect="dark">已禁用</el-tag>
        </div>
        <div class="card-actions">
          <el-button size="small" :loading="testing === p.id" @click="test(p.id)">测试</el-button>
          <el-button size="small" @click="openPlatform(p.id)">管理模型</el-button>
              <el-button v-if="!p.isBuiltin || p.presetKey" size="small" @click="editPlatform(p)">编辑</el-button>
              <!-- 禁用开关（平台级 llm_enabled）：Token 过期等场景一键停用整平台，
                   模型行保留；下拉隐藏 + 全部调用通道（代理/定时任务）拒绝 -->
              <el-button
                size="small"
                :type="p.llmEnabled === false ? 'success' : 'warning'"
                :loading="togglingId === p.id"
                @click="toggleDisabled(p)"
              >{{ p.llmEnabled === false ? '启用' : '禁用' }}</el-button>
              <el-button size="small" type="danger" @click="del(p.id)">删除</el-button>
        </div>
      </el-card>
      <el-empty v-if="store.platforms.length === 0" description="还没有平台，点击右下角新增" />
      <el-empty
        v-else-if="filteredPlatforms.length === 0"
        description="没有匹配的平台，换个关键字或筛选条件试试"
      />
    </div>

    <FormDialog
      v-model="showAdd"
      :title="editingId ? '编辑平台' : '新增平台'"
      width="640px"
      top="6vh"
      dialog-class="platform-edit-dialog"
      :confirm-text="editingId ? '保存修改' : '保存'"
      :loading="saving"
      @submit="save"
      @closed="resetForm"
    >
      <el-form label-width="90px">
        <el-form-item label="名称"><el-input v-model="form.name" placeholder="如：OpenAI / DeepSeek" /></el-form-item>
        <el-form-item label="协议">
          <!-- 三格式（2026-10-17 方案 §2.1）：文案对齐厂商文档；custom 是历史遗留值，UI 不再提供 -->
          <!-- 目录厂商平台（preset）：协议/API URL 是厂商文档常量，编辑态只读 -->
          <el-select v-model="form.protocol" :disabled="editingPresetLocked">
            <el-option label="OpenAI Chat Completions 格式" value="openai" />
            <el-option label="OpenAI Responses API 格式" value="openai-responses" />
            <el-option label="Anthropic Messages 格式" value="anthropic" />
          </el-select>
        </el-form-item>
        <el-form-item label="API URL">
          <el-input v-model="form.apiUrl" :disabled="editingPresetLocked" placeholder="https://api.openai.com（填到域名，不要带 /v1）" />
          <div class="form-tip">{{ editingPresetLocked ? '目录厂商平台的协议 / API URL 来自厂商文档，不可修改（名称与 Token 可编辑）' : '填基础地址即可（火山 /api/v3、智谱 /api/paas/v4 这类带版本段的照厂商文档填）；端点路径自动拼接' }}</div>
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
              <el-button size="small" :loading="testingFormKeyIndex === i" :disabled="!k.apiKey.trim()" @click="testFormKey(k, i)">测试</el-button>
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
          <el-tag v-if="k.failCount > 0" size="small" type="danger">失败 {{ k.failCount }} 次</el-tag>
          <div class="apikey-actions">
            <el-tooltip content="测试" placement="top"><el-button size="small" :icon="Connection" :loading="testingKeyId === k.id" :disabled="keyBusy(k.id)" @click="testKey(k)" /></el-tooltip>
            <el-tooltip v-if="k.failCount > 0" content="重置失败次数" placement="top"><el-button size="small" :icon="RefreshLeft" @click="resetKey(k)" /></el-tooltip>
            <el-tooltip content="删除" placement="top"><el-button size="small" :icon="Delete" type="danger" @click="delKey(k)" /></el-tooltip>
          </div>
        </div>
        <el-empty v-if="store.apiKeys.length === 0" description="暂无 Token" :image-size="40" />
      </div>

      <StatusActionBar :status="formStatus" :status-type="formStatusType">
        <el-button :loading="testingForm" :icon="Connection" @click="testForm">测试连接</el-button>
        <!-- 新增态：预拉列表勾选带入；编辑态：直接全量同步远程模型（去重安全） -->
        <el-button v-if="!editingId" :loading="fetching" :icon="Download" @click="fetchModels">拉取模型列表</el-button>
        <el-button v-else :loading="syncing" :icon="Download" @click="syncRemoteModels">拉取远程模型</el-button>
      </StatusActionBar>

      <div v-if="!editingId && fetchedModels.length > 0" class="fetched-models">
        <div class="fetched-header">
          <el-checkbox v-model="checkAll" :indeterminate="isIndeterminate" @change="onCheckAll">全选</el-checkbox>
          <span class="fetched-count">
            <template v-if="fetchedFilterActive">显示 {{ filteredFetchedModels.length }} / </template>
            共 {{ fetchedModels.length }} 个，已选 {{ checkedModelIds.length }}
          </span>
          <!-- 平台一次可返回上百个模型，没搜索只能一路往下滚着找 -->
          <el-input
            v-model="fetchedKeyword"
            size="small"
            placeholder="搜索模型 ID / 类型"
            clearable
            class="fetched-search"
          />
        </div>
        <el-checkbox-group v-model="checkedModelIds" class="fetched-list">
          <el-checkbox v-for="m in filteredFetchedModels" :key="m.id" :value="m.id" class="fetched-item">
            <span class="model-id">{{ m.id }}</span>
            <el-tag v-if="m.type" size="small" type="info">{{ m.type }}</el-tag>
          </el-checkbox>
        </el-checkbox-group>
        <div v-if="filteredFetchedModels.length === 0" class="fetched-empty">没有匹配的模型，换个关键字试试</div>
      </div>

      <!-- footer：新增态带「上一步」回厂商选择；编辑态维持默认底栏 -->
      <template #footer="{ close }">
        <el-button v-if="!editingId" :disabled="saving" @click="backToVendorPicker">← 上一步</el-button>
        <span style="flex:1"></span>
        <el-button :disabled="saving" @click="close">{{ editingId ? '取消' : '取消' }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ editingId ? '保存修改' : '保存' }}</el-button>
      </template>
    </FormDialog>

    <!-- 管理模型：弹窗内嵌平台详情，不再路由跳转（在设置抽屉中打开也不会切走主页面） -->
    <el-dialog
      v-model="showDetail"
      :title="detailTitle"
      width="860px"
      top="6vh"
      class="platform-detail-dialog"
      destroy-on-close
      @closed="refreshModelCounts"
    >
      <PlatformDetail :key="detailId" :platform-id="detailId" embedded />
    </el-dialog>

    <!-- 新增平台 · 第一步：选择厂商（宫格收进弹窗 2026-10-18）；点厂商 → 第二步弹「添加 {厂商}」填信息 -->
    <el-dialog
      v-model="showVendorPicker"
      title="新增平台 · 选择厂商"
      width="880px"
      top="6vh"
      class="vendor-picker-dialog"
    >
      <PlatformPresetGrid ref="presetGridRef" :show-head="false" @pick="onPickPreset" @open="onPresetOpen" @custom="onCustomPick" />
      <div class="vendor-manual">
        <el-button text type="primary" @click="openManualForm">没找到厂商？手动填写完整表单 →</el-button>
      </div>
    </el-dialog>

    <!-- Mobile FAB -->
    <el-button type="primary" :icon="Plus" circle class="mobile-fab" @click="openAdd" />

    <!-- 「添加 {厂商}」对话框（宫格未添加项点击后弹出） -->
    <AddPresetDialog v-model="showAddPreset" :preset="addPresetTarget" @saved="onPresetSaved" />
    <!-- 「自定义模型」一步式对话框（平台 + 模型 + Key 一个事务） -->
    <CustomModelDialog v-model="showCustom" @created="onCustomCreated" />

    <!-- 本地模型商城：国内源下载 / 测试启用 / 删除 / Ollama 接入 -->
    <LocalModelMarket v-model="showLocalMarket" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { Plus, Connection, Download, Delete, RefreshLeft } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { ModelType, PlatformApiKey } from '@yan-zhi/shared';
import { usePlatformStore } from '../stores';
import { api } from '../api/client';
import { waitForBackend } from '../api/backend-ready';
import { DEFAULT_CONTEXT_WINDOW } from '../utils/context-window';
import PlatformDetail from './PlatformDetail.vue';
import LocalModelMarket from '../components/LocalModelMarket.vue';
import FormDialog from '../components/FormDialog.vue';
import StatusActionBar from '../components/common/StatusActionBar.vue';
import SearchToolbar from '../components/common/SearchToolbar.vue';
import PlatformPresetGrid from '../components/PlatformPresetGrid.vue';
import AddPresetDialog from '../components/AddPresetDialog.vue';
import CustomModelDialog from '../components/CustomModelDialog.vue';
import type { ModelProviderPreset } from '@yan-zhi/shared';

const store = usePlatformStore();
const showAdd = ref(false);
const showLocalMarket = ref(false);

// ── 内置厂商宫格 / 自定义模型（2026-10-17 方案 §2.3/§2.4；2026-10-18 宫格收进「新增平台」弹窗） ──
const presetGridRef = ref<InstanceType<typeof PlatformPresetGrid> | null>(null);
const showVendorPicker = ref(false);
const showAddPreset = ref(false);
const addPresetTarget = ref<ModelProviderPreset | null>(null);
const showCustom = ref(false);

/** 新增平台第一步：弹厂商选择；宫格首次打开时由自身 onMounted 加载，之后每次打开刷新「已添加」态 */
function openAdd() {
  showVendorPicker.value = true;
  void presetGridRef.value?.refresh();
}

function onPickPreset(preset: ModelProviderPreset) {
  addPresetTarget.value = preset;
  showAddPreset.value = true; // 第二步：填信息（叠在厂商选择之上）
}

/** 第一步里点了「已添加」厂商 → 关掉选择弹窗直接进详情 */
function onPresetOpen(platformId: string) {
  showVendorPicker.value = false;
  openPlatform(platformId);
}

/** 第一步里点了「自定义模型」→ 关掉选择弹窗，进一步式创建 */
function onCustomPick() {
  showVendorPicker.value = false;
  showCustom.value = true;
}

/** 第一步兜底：宫格里没有的厂商 → 旧版完整表单（多 Token / 停顿 / 拉取模型） */
function openManualForm() {
  showVendorPicker.value = false;
  resetForm();
  formKeys.value = [{ apiKey: '', label: '' }];
  showAdd.value = true;
}

/** 表单「上一步」：放弃手填内容，回到厂商选择 */
function backToVendorPicker() {
  showAdd.value = false;
  resetForm();
  openAdd();
}

/** 厂商添加成功：关掉选择弹窗，刷新宫格「已添加」态 + 平台列表（新平台立即可见） */
async function onPresetSaved() {
  showVendorPicker.value = false;
  void presetGridRef.value?.refresh();
  await store.loadPlatforms();
}

/** 自定义模型创建成功：同上，并直接打开该平台详情（用户下一步通常是设默认） */
async function onCustomCreated(platformId: string) {
  showVendorPicker.value = false;
  void presetGridRef.value?.refresh();
  await store.loadPlatforms();
  if (platformId) openPlatform(platformId);
}

// 本地模型商城关闭后重拉计数（拉取/接入本地模型会影响平台模型数）
watch(showLocalMarket, (v) => { if (!v) refreshModelCounts(); });

// ★ 候选池不在这里：候选池的第二层是「**智能体平台**」（所有智能体的默认池，跨供应商），
//   不是「模型平台」（本页 = 百炼/agnes 这类大模型供应商）。入口在 /agents（智能体平台）页。
//   见 services/model-pools.ts 文件头与 pages/Agents.vue 的候选池入口。

// ── 平台搜索 / 筛选（纯前端，不动数据） ──
const platformKeyword = ref('');
const protocolFilter = ref('');
const statusFilter = ref('');
const filteredPlatforms = computed(() => {
  const kw = platformKeyword.value.trim().toLowerCase();
  return store.platforms.filter((p: any) => {
    if (protocolFilter.value && (p.protocol || 'openai') !== protocolFilter.value) return false;
    if (statusFilter.value && (p.status || 'unknown') !== statusFilter.value) return false;
    if (!kw) return true;
    return (p.name || '').toLowerCase().includes(kw) || (p.apiUrl || '').toLowerCase().includes(kw);
  });
});
const platformFilterActive = computed(() => !!platformKeyword.value.trim() || !!protocolFilter.value || !!statusFilter.value);
function clearPlatformFilter() {
  platformKeyword.value = '';
  protocolFilter.value = '';
  statusFilter.value = '';
}

const showDetail = ref(false);
const detailId = ref('');
const detailTitle = computed(() => {
  const p = store.platforms.find((x) => x.id === detailId.value);
  return p ? `管理模型 - ${p.name}` : '管理模型';
});
const editingId = ref('');
const testing = ref('');
/** 编辑目录厂商平台（preset）：协议/API URL 只读（厂商文档常量），名称/Token/停顿可改 */
const editingPresetLocked = computed(() => {
  const p = store.platforms.find((x) => x.id === editingId.value);
  return !!p?.isBuiltin && !!p?.presetKey;
});
/** 编辑态「拉取远程模型」全量同步中（fetchRemoteModels 去重安全：同名启用、新增入库、多余隐藏） */
const syncing = ref(false);
const form = ref({ name: '', protocol: 'openai', apiUrl: '', pauseMinMs: 0, pauseMaxMs: 0 });
const formKeys = ref<Array<{ apiKey: string; label: string }>>([]);

// 测试 / 拉取状态
const testingForm = ref(false);
const testingFormKeyIndex = ref<number | null>(null);
const fetching = ref(false);
const saving = ref(false);
const formStatus = ref('');
const formStatusType = ref<'ok' | 'err'>('ok');
const fetchedModels = ref<{ id: string; type?: string }[]>([]);
const checkedModelIds = ref<string[]>([]);

// ── 拉取列表的搜索（平台一次可返回上百个模型） ──
const fetchedKeyword = ref('');
const filteredFetchedModels = computed(() => {
  const kw = fetchedKeyword.value.trim().toLowerCase();
  if (!kw) return fetchedModels.value;
  return fetchedModels.value.filter((m) =>
    (m.id || '').toLowerCase().includes(kw) || (m.type || '').toLowerCase().includes(kw),
  );
});
const fetchedFilterActive = computed(() => !!fetchedKeyword.value.trim());

// ★ 全选/半选只对**当前可见项**判定：筛掉的模型不该让"全选"永远勾不上
const visibleFetchedIds = computed(() => filteredFetchedModels.value.map((m) => m.id));
const checkAll = computed(() =>
  visibleFetchedIds.value.length > 0 && visibleFetchedIds.value.every((id) => checkedModelIds.value.includes(id)),
);
const isIndeterminate = computed(() =>
  visibleFetchedIds.value.some((id) => checkedModelIds.value.includes(id)) && !checkAll.value,
);

// 以数据库 status 为准，不进页自动 ping（避免线上平台因瞬时抖动被误判掉线）。
// 需要校验时由用户手动点"测试连通性"按钮。
onMounted(async () => {
  // ★ 与 useChat 同口径：先等后端就绪再拉，避免移动端冷启动时静默拿到空数据
  //   （`loadPlatforms` 内部虽有 getWithRetry，但这里等待能让首帧就拿到数据、少一次空态闪烁）。
  await waitForBackend();
  store.loadPlatforms();
  refreshModelCounts();
});

// ── 各平台模型计数：跨实体视图**自带独立清单**，绝不读 platformStore.models ──
// ★★ 2026-10-15 用户实报：点某平台「管理模型」看到模型后，**其他平台的「N 个模型」全部变 0**。
//   根因：modelCount() 原来读 platformStore.models 共享缓存，而 PlatformDetail onMounted 会
//   `store.loadModels(pid)` 把该缓存**整体替换**成单平台清单（与候选池下拉曾静默变空同根因，
//   见 stores/model-pool.ts 文件头注释）。本页是「一眼看全部平台」的跨实体视图，
//   计数型视图只需要计数 → 自己拉一份 /platforms/all-models 统计，与共享缓存互不影响。
const modelCounts = ref<Record<string, number>>({});

async function refreshModelCounts() {
  const r = await api.get<any[]>('/platforms/all-models');
  if ('error' in r || !Array.isArray(r.data)) return;
  const counts: Record<string, number> = {};
  for (const row of r.data) {
    const pid = row?.platform_id;
    if (typeof pid !== 'string' || !pid) continue;
    counts[pid] = (counts[pid] || 0) + 1;
  }
  modelCounts.value = counts;
}

function modelCount(platformId: string) {
  return modelCounts.value[platformId] || 0;
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

async function testFormKey(k: { apiKey: string; label: string }, index: number) {
  if (!form.value.apiUrl) { ElMessage.warning('请先填写 API URL'); return; }
  const key = k.apiKey.trim();
  if (!key) { ElMessage.warning('请先填写 API Key'); return; }
  testingFormKeyIndex.value = index;
  formStatus.value = '';
  try {
    const r = await store.testPlatformConfig({ apiUrl: form.value.apiUrl, apiKey: key, platformId: editingId.value || undefined });
    if (r.ok) {
      setStatus(`${r.msg}（${r.durationMs}ms）`, 'ok');
      ElMessage.success(r.msg);
    } else {
      setStatus(r.msg, 'err');
      ElMessage.error(r.msg);
    }
  } finally {
    testingFormKeyIndex.value = null;
  }
}

async function fetchModels() {
  if (!form.value.apiUrl) { ElMessage.warning('请先填写 API URL'); return; }
  fetching.value = true;
  formStatus.value = '';
  fetchedModels.value = [];
  fetchedKeyword.value = '';
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
  // 只增删**当前可见项**：不会因为在某个筛选条件下点了全选，就丢掉此前在别处勾上的模型
  const visible = new Set(visibleFetchedIds.value);
  if (val) {
    checkedModelIds.value = [...new Set([...checkedModelIds.value, ...visible])];
  } else {
    checkedModelIds.value = checkedModelIds.value.filter((id) => !visible.has(id));
  }
}

/** 编辑态拉取远程模型：与 PlatformDetail「拉取远程模型」同一全量同步语义（POST /models/batch） */
async function syncRemoteModels() {
  if (!editingId.value) return;
  syncing.value = true;
  try {
    const ids = await store.fetchRemoteModels(editingId.value);
    setStatus(`已同步 ${ids.length} 个远程模型`, 'ok');
    ElMessage.success(`已同步 ${ids.length} 个远程模型（同名启用、新增入库）`);
  } catch (e: any) {
    setStatus('拉取失败: ' + (e?.message || e), 'err');
    ElMessage.error('拉取失败: ' + (e?.message || e));
  } finally {
    syncing.value = false;
  }
}

function editPlatform(p: any) {
  // 目录厂商平台（preset）可编辑：名称/Token/停顿开放，协议/API URL 由厂商文档决定（表单内只读）
  if (p.isBuiltin && !p.presetKey) { ElMessage.warning('内置平台不可编辑'); return; }
  editingId.value = p.id;
  form.value = { name: p.name, protocol: p.protocol || 'openai', apiUrl: p.apiUrl, pauseMinMs: p.pauseMinMs || 0, pauseMaxMs: p.pauseMaxMs || 0 };
  formKeys.value = [];
  fetchedModels.value = [];
  fetchedKeyword.value = '';
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
      // 目录厂商平台：协议/API URL 是厂商文档常量（服务端也拦），不发这些字段
      const patch: any = editingPresetLocked.value
        ? {
            name: form.value.name,
            pauseMinMs: form.value.pauseMinMs,
            pauseMaxMs: form.value.pauseMaxMs,
          }
        : {
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
          contextWindow: DEFAULT_CONTEXT_WINDOW,
          enabled: true,
          isDefault: false,
        });
      }
      ElMessage.success(`已添加平台${checkedModelIds.value.length > 0 ? `，含 ${checkedModelIds.value.length} 个模型` : ''}`);
    }
    // 平台/模型刚发生过增删 → 计数清单过期，关闭前重拉（否则卡片显示旧数）
    await refreshModelCounts();
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
  fetchedKeyword.value = '';
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
    await ElMessageBox.confirm('确认删除此 Token？', '提示', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' });
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

/** 平台级禁用开关（复用 llm_enabled 单一语义）：禁用 = 下拉隐藏 + 全部调用通道拒绝 */
const togglingId = ref('');
async function toggleDisabled(p: any) {
  const enabling = p.llmEnabled === false; // 当前已禁用 → 本次点的是「启用」
  togglingId.value = p.id;
  try {
    await store.updatePlatform(p.id, { llmEnabled: enabling });
    // 以重拉后的库里状态为准确认生效（api 层不抛业务错误，不能只信"没抛异常"）
    const now = store.platforms.find((x) => x.id === p.id);
    if (!now || (now.llmEnabled === false) === enabling) {
      ElMessage.success(enabling ? '已启用：平台模型恢复可用' : '已禁用：该平台模型已从下拉隐藏，且不可再调用');
    } else {
      ElMessage.error('操作未生效，请重试');
    }
  } catch (e: any) {
    ElMessage.error('操作失败: ' + (e?.message || e));
  } finally {
    togglingId.value = '';
  }
}

async function del(id: string) {
  const p = store.platforms.find((x) => x.id === id);

  try {
    await ElMessageBox.confirm('删除平台会同时删除其下所有模型，确认？', '提示', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' });
    await store.deletePlatform(id);
    await refreshModelCounts();
    ElMessage.success('已删除');
  } catch {}
}
</script>

<style scoped>
/* .page / .page-header / .page-title come from App.vue global */
.platform-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }
.filter-select { width: 116px; }

.platform-card { background: var(--glass-bg); backdrop-filter: var(--glass-filter); }
/* 禁用的平台整卡降透明度 + 名称变灰，一眼可辨 */
.platform-card-disabled { opacity: 0.55; }
.platform-card-disabled .platform-name { text-decoration: line-through; color: var(--color-text-secondary); }
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

/* Dialog action buttons bar / form-status 已抽到 common/StatusActionBar.vue */

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
.fetched-search { width: 180px; margin-left: auto; flex-shrink: 0; }
.fetched-empty { padding: 12px 8px; font-size: 12px; color: var(--color-text-secondary); text-align: center; }
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
.apikey-actions { display: flex; align-items: center; gap: 4px; margin-left: auto; }
.apikey-actions .el-button { padding: 5px 6px; }

/* 新增平台弹窗第一步：宫格底部「手动填写」兜底入口 */
.vendor-manual { margin-top: 12px; text-align: center; }

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
/* 新增平台 · 厂商选择弹窗：窄屏收窄，避免 880px 溢出 */
@media (max-width: 767px) {
  .vendor-picker-dialog { width: 94% !important; }
}
</style>
