<template>
  <el-dialog v-model="visible" title="本地模型商城" width="760px" :close-on-click-modal="false" class="local-market-dialog">
    <div v-if="loading" class="market-state"><el-skeleton :rows="5" animated /></div>
    <template v-else>
      <div class="tier-tabs">
        <button :class="['tier-tab', { active: activeTier === 'low' }]" @click="activeTier = 'low'">
          <span class="tier-tab-label">低配版</span>
          <span class="tier-tab-desc">2-4GB 内存 · 无 GPU</span>
        </button>
        <button :class="['tier-tab', { active: activeTier === 'mid' }]" @click="activeTier = 'mid'">
          <span class="tier-tab-label">中配版</span>
          <span class="tier-tab-desc">8-16GB 内存 · 可选 GPU</span>
        </button>
        <button :class="['tier-tab', { active: activeTier === 'high' }]" @click="activeTier = 'high'">
          <span class="tier-tab-label">高配版</span>
          <span class="tier-tab-desc">16GB+ · 需 GPU</span>
        </button>
        <button :class="['tier-tab', { active: activeTier === 'ultra' }]" @click="activeTier = 'ultra'">
          <span class="tier-tab-label">顶配版</span>
          <span class="tier-tab-desc">24GB+ 显存 · 双卡/A100</span>
        </button>
        <button :class="['tier-tab', { active: activeTier === 'embedding' }]" @click="activeTier = 'embedding'">
          <span class="tier-tab-label">向量模型</span>
          <span class="tier-tab-desc">知识库向量化 · Embedding</span>
        </button>
      </div>
      <div class="market-list">
        <div
          v-for="item in filteredItems"
          :key="item.key"
          class="market-card"
          :class="{ 'is-enabled': item.onDisk, 'is-downloading': isDownloading(item) }"
        >
          <div class="market-card-head">
            <div class="market-card-icon" :class="{ ok: item.onDisk }">
              <span v-if="item.onDisk" class="icon-check"><el-icon><Check /></el-icon></span>
              <span v-else-if="item.params">{{ item.params }}</span>
            </div>
            <div class="market-card-info">
              <div class="market-card-name">
                {{ item.displayName }}
                <el-tag v-if="item.modality === 'embedding'" size="small" type="info" effect="light">向量</el-tag>
                <el-tag v-if="item.recommended" size="small" type="success" effect="light">推荐</el-tag>
                <el-tag v-if="item.onDisk" size="small" type="success" effect="dark">可用</el-tag>
              </div>
              <div class="market-card-desc">{{ item.desc }}</div>
              <div class="market-card-specs">
                <div class="spec-row">
                  <span class="spec-label"><el-icon><TrendCharts /></el-icon>效果</span>
                  <span class="spec-text">{{ item.effect }}</span>
                </div>
                <div class="spec-row">
                  <span class="spec-label"><el-icon><Monitor /></el-icon>硬件</span>
                  <span class="spec-text">{{ item.hardware }}</span>
                </div>
              </div>
            </div>
            <div class="market-card-meta">
              <div class="market-card-size">{{ item.sizeHint }}</div>
            </div>
          </div>

          <div v-if="item.download?.state === 'downloading'" class="dl-progress">
            <el-progress
              :percentage="Math.round((item.download.progress || 0) * 100)"
              :stroke-width="8"
              :status="item.download.progress >= 1 ? 'success' : undefined"
            />
            <div class="dl-stats"><span>{{ item.download.message }}</span></div>
          </div>

          <div v-if="item.download?.state === 'done'" class="dl-msg dl-msg-ok">
            <el-icon><CircleCheckFilled /></el-icon>
            <span>{{ item.download.message }}</span>
          </div>
          <div v-if="item.download?.state === 'error'" class="dl-msg dl-msg-err">
            <el-icon><CircleCloseFilled /></el-icon>
            <span>拉取失败：{{ item.download.message }}</span>
          </div>

          <div class="market-card-actions">
            <template v-if="isDownloading(item)">
              <el-button size="small" type="info" plain disabled>拉取中...</el-button>
            </template>
            <template v-else>
              <el-button v-if="!item.onDisk" size="small" type="primary" :icon="Download" @click="pull(item)">拉取</el-button>
              <el-button v-if="item.onDisk" size="small" type="success" plain :loading="testing === item.key" @click="test(item)">测试</el-button>
              <el-button v-if="item.onDisk" size="small" type="danger" plain @click="remove(item)">删除</el-button>
            </template>
          </div>
        </div>
      </div>
      <el-empty v-if="filteredItems.length === 0" description="暂无模型" :image-size="70" />
    </template>

    <div class="ollama-box">
      <div class="ollama-head">
        <div>
          <div class="ollama-title">已安装 Ollama？</div>
          <div class="ollama-desc">Ollama 提供更成熟的模型管理与推理（模型拉取 / GPU 调度 / OpenAI 兼容 API），接入后无需手动下载模型文件。</div>
        </div>
        <div class="ollama-actions">
          <code class="ollama-url">http://127.0.0.1:11434</code>
          <el-button v-if="!ollamaConnected" size="small" type="primary" plain @click="addOllama">一键接入</el-button>
          <span v-else class="ollama-connected"><el-icon><Check /></el-icon>已接入</span>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Download, Check, CircleCheckFilled, CircleCloseFilled, TrendCharts, Monitor } from '@element-plus/icons-vue';
import { api } from '../api/client';
import { usePlatformStore } from '../stores';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>();
const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const platformStore = usePlatformStore();

interface DownloadState {
  state: 'downloading' | 'done' | 'error';
  progress: number;
  message: string;
}
interface MarketItem {
  key: string;
  displayName: string;
  sizeHint: string;
  params: string;
  recommended: boolean;
  desc: string;
  effect: string;
  hardware: string;
  tier: 'low' | 'mid' | 'high' | 'ultra' | 'embedding';
  modality?: 'vision' | 'embedding';
  onDisk: boolean;
  download: DownloadState | null;
}

const loading = ref(true);
const items = ref<MarketItem[]>([]);
const activeTier = ref<'low' | 'mid' | 'high' | 'ultra' | 'embedding'>('low');
const testing = ref('');
let pollTimer: ReturnType<typeof setInterval> | undefined;
let wasDownloading = false;

const filteredItems = computed(() => items.value.filter((it) => it.tier === activeTier.value));

const ollamaConnected = computed(() =>
  (platformStore.platforms as any[]).some((p) => p?.apiUrl && p.apiUrl.includes('127.0.0.1:11434')),
);

watch(visible, (v) => {
  if (v) {
    load();
    pollTimer = setInterval(async () => {
      const hasDl = items.value.some((i) => i.download?.state === 'downloading');
      if (hasDl) await load();
      // 从"有下载中"变为"全部完成"时，刷新模型管理页，让新拉取的模型立即可见
      if (wasDownloading && !hasDl) {
        wasDownloading = false;
        await ensureOllamaPlatform();
      } else if (hasDl) {
        wasDownloading = true;
      }
    }, 1500);
  } else {
    stopPolling();
  }
}, { immediate: true });

onUnmounted(stopPolling);

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = undefined;
}

async function load() {
  if (platformStore.platforms.length === 0) await platformStore.loadPlatforms().catch(() => undefined);
  try {
    const r = await api.get<any>('/ollama-market');
    loading.value = false;
    if ('data' in r && r.data && r.data.items) {
      items.value = r.data.items.map((it: any) => ({
        key: it.key,
        displayName: it.displayName,
        sizeHint: it.sizeHint,
        params: it.params,
        recommended: it.recommended,
        desc: it.desc,
        effect: it.effect,
        hardware: it.hardware,
        tier: it.tier,
        modality: it.modality,
        onDisk: !!it.onDisk,
        download: it.download || null,
      }));
    }
  } catch {
    loading.value = false;
  }
}

function isDownloading(item: MarketItem) {
  return item.download?.state === 'downloading';
}

async function pull(item: MarketItem) {
  const r = await api.post<any>(`/ollama-market/${item.key}/pull`);
  if ('error' in r) { ElMessage.error(r.error); return; }
  ElMessage.success('开始拉取模型');
  load();
  // 拉取后自动确保 Ollama 平台存在并刷新模型列表，让模型管理页可见
  await ensureOllamaPlatform();
}

/** 确保本地模型（Ollama）平台存在并刷新其模型列表，拉取/完成时调用 */
async function ensureOllamaPlatform() {
  try {
    let p = (platformStore.platforms as any[]).find((x) => x?.apiUrl && x.apiUrl.includes('127.0.0.1:11434'));
    if (!p) {
      const platformId = await platformStore.addPlatform({
        name: '本地模型', protocol: 'openai' as any, apiUrl: 'http://127.0.0.1:11434',
        apiKeyEnc: '', headers: {}, status: 'unknown',
      });
      await platformStore.loadPlatforms();
      p = platformStore.platforms.find((x: any) => x.id === platformId);
    }
    if (p) {
      await platformStore.fetchRemoteModels(p.id).catch(() => undefined);
      await platformStore.loadModels();
    }
  } catch { /* 忽略：平台创建/刷新失败不影响拉取 */ }
}

async function test(item: MarketItem) {
  testing.value = item.key;
  try {
    const r = await api.post<any>(`/ollama-market/${item.key}/test`);
    if ('error' in r) { ElMessage.error(r.error); return; }
    if (r.data?.ok) {
      ElMessage.success(`测试通过：「${r.data.reply}」`);
      await platformStore.loadPlatforms();
      await platformStore.loadModels();
    } else {
      ElMessage.error('测试失败：' + (r.data?.error || '推理异常'));
    }
  } finally {
    testing.value = '';
  }
}

async function remove(item: MarketItem) {
  try {
    await ElMessageBox.confirm(
      `删除 ${item.displayName}？模型将从 Ollama 移除。`,
      '删除确认',
      { type: 'warning' },
    );
  } catch { return; }
  const r = await api.delete(`/ollama-market/${item.key}`);
  if ('error' in r) { ElMessage.error(r.error); return; }
  ElMessage.success('已删除');
  load();
}

async function addOllama() {
  if (ollamaConnected.value) { ElMessage.info('Ollama 已接入，无需重复添加'); return; }
  try {
    const platformId = await platformStore.addPlatform({
      name: '本地模型',
      protocol: 'openai' as any,
      apiUrl: 'http://127.0.0.1:11434',
      apiKeyEnc: '',
      headers: {},
      status: 'unknown',
    });
    try {
      await platformStore.fetchRemoteModels(platformId);
      ElMessage.success('已接入 Ollama 并拉取模型列表');
    } catch {
      ElMessage.warning('已创建平台，但拉取模型失败——请确认 Ollama 正在运行');
    }
    await platformStore.loadPlatforms();
    visible.value = false;
  } catch (e: any) {
    ElMessage.error('接入失败: ' + (e?.message || e));
  }
}
</script>

<style>
.local-market-dialog { max-height: 88vh; display: flex; flex-direction: column; margin-top: 6vh !important; }
.local-market-dialog .el-dialog__body { flex: 1; overflow-y: auto; padding-top: 12px; }
</style>

<style scoped>
.tier-tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.tier-tab {
  flex: 1; min-width: 110px; padding: 10px 8px; border: 1px solid var(--color-border, #e4e7ed);
  border-radius: 10px; background: transparent; cursor: pointer; text-align: center; transition: all 0.2s;
}
.tier-tab:hover { border-color: var(--color-primary, #7c3aed); }
.tier-tab.active { border-color: var(--color-primary, #7c3aed); background: rgba(124, 58, 237, 0.08); }
.tier-tab-label { display: block; font-size: 14px; font-weight: 600; color: var(--color-text-primary, #303133); }
.tier-tab-desc { display: block; font-size: 11px; color: var(--color-text-secondary, #909399); margin-top: 2px; }

.market-list { display: flex; flex-direction: column; gap: 12px; }
.market-card {
  border: 1px solid var(--color-border, #e4e7ed); border-radius: 12px; padding: 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.market-card.is-enabled { border-color: var(--el-color-success, #67c23a); }
.market-card.is-downloading { border-color: var(--el-color-primary, #409eff); }
.market-card-head { display: flex; gap: 12px; align-items: flex-start; }
.market-card-icon {
  width: 44px; height: 44px; border-radius: 10px; flex-shrink: 0;
  background: var(--color-bg-secondary, #f5f7fa); display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 600; color: var(--color-text-secondary, #909399);
}
.market-card-icon.ok { background: rgba(103, 194, 58, 0.12); color: var(--el-color-success, #67c23a); }
.icon-check { font-size: 20px; }
.market-card-info { flex: 1; min-width: 0; }
.market-card-name { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.market-card-desc { font-size: 12.5px; color: var(--color-text-secondary, #909399); margin-top: 4px; line-height: 1.5; }
.market-card-specs { margin-top: 8px; display: flex; gap: 16px; }
.spec-row { display: flex; align-items: center; gap: 4px; font-size: 12px; }
.spec-label { color: var(--color-text-secondary, #909399); display: inline-flex; align-items: center; gap: 2px; }
.spec-text { color: var(--color-text-primary, #606266); }
.market-card-meta { flex-shrink: 0; text-align: right; }
.market-card-size { font-size: 12px; color: var(--color-text-secondary, #909399); }

.dl-progress { margin-top: 10px; }
.dl-stats { font-size: 12px; color: var(--color-text-secondary, #909399); margin-top: 4px; }
.dl-msg { margin-top: 10px; display: flex; align-items: center; gap: 6px; font-size: 12.5px; }
.dl-msg-ok { color: var(--el-color-success, #67c23a); }
.dl-msg-err { color: var(--el-color-danger, #f56c6c); }

.market-card-actions { margin-top: 10px; display: flex; gap: 8px; }

.ollama-box {
  margin-top: 20px; border: 1px solid var(--color-border, #e4e7ed); border-radius: 10px; padding: 16px;
  background: rgba(124, 58, 237, 0.04);
}
.ollama-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.ollama-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
.ollama-desc { font-size: 12.5px; color: var(--color-text-secondary, #909399); line-height: 1.6; }
.ollama-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }
.ollama-url { font-size: 12px; color: var(--color-text-secondary, #909399); }
.ollama-connected { color: var(--el-color-success, #67c23a); display: inline-flex; align-items: center; gap: 4px; font-size: 13px; }
</style>
