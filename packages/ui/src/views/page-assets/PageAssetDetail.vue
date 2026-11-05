<template>
  <article v-if="asset" class="pa-detail" aria-label="页面资产详情">
    <header class="pa-detail-head">
      <div class="pa-detail-title-wrap">
        <div class="pa-detail-title-line">
          <h3>{{ asset.title }}</h3>
          <el-tag size="small" :type="statusMeta.type" effect="plain">{{ statusMeta.label }}</el-tag>
          <el-tag v-if="asset.source === 'builtin'" size="small" type="info" effect="plain">内置</el-tag>
          <el-tag v-else size="small" type="primary" effect="plain">自建</el-tag>
          <el-tag v-if="asset.draft" size="small" type="warning" effect="plain">
            待启用草稿 v{{ asset.draft.version }}
          </el-tag>
        </div>
        <div class="pa-detail-meta">
          <span>{{ platformLabel(asset.platform) }}</span>
          <span class="pa-dot" />
          <code>{{ asset.id }}</code>
          <span class="pa-dot" />
          <span>v{{ asset.version }}</span>
          <span class="pa-dot" />
          <span>更新 {{ formatAssetTime(asset.updatedAt) }}</span>
        </div>
      </div>

      <div class="pa-detail-actions">
        <el-button size="small" :icon="ShieldCheck" :loading="saving" @click="$emit('validate')">校验</el-button>
        <el-button
          v-if="asset.source === 'builtin'"
          size="small"
          :icon="CopyPlus"
          @click="$emit('clone')"
        >
          复制为草稿
        </el-button>
        <template v-else>
          <el-button
            v-if="asset.status === 'draft' || asset.draft"
            size="small"
            :icon="Braces"
            @click="$emit('edit')"
          >
            编辑草稿
          </el-button>
          <el-button
            v-else
            size="small"
            :icon="Braces"
            @click="$emit('nextDraft')"
          >
            创建下一版
          </el-button>
          <el-button
            v-if="asset.status === 'draft' || asset.draft"
            size="small"
            type="primary"
            :icon="Play"
            :loading="saving"
            @click="$emit('activate')"
          >
            启用草稿
          </el-button>
          <el-button
            v-if="asset.status !== 'deprecated'"
            size="small"
            :icon="Archive"
            :loading="saving"
            @click="$emit('archive')"
          >
            停用
          </el-button>
        </template>
      </div>
    </header>

    <div class="pa-metrics" aria-label="资产健康度">
      <div class="pa-metric">
        <span class="pa-metric-label">能力</span>
        <strong>{{ asset.capabilities.length }}</strong>
      </div>
      <div class="pa-metric">
        <span class="pa-metric-label">操作</span>
        <strong>{{ asset.operations.length }}</strong>
      </div>
      <div class="pa-metric">
        <span class="pa-metric-label">成功率</span>
        <strong>{{ formatHealthRate(asset.health) }}</strong>
      </div>
      <div class="pa-metric">
        <span class="pa-metric-label">运行次数</span>
        <strong>{{ asset.health?.runCount || 0 }}</strong>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="pa-tabs">
      <el-tab-pane label="概览" name="overview">
        <div class="pa-overview">
          <section class="pa-section">
            <h4>适用页面</h4>
            <div class="pa-chip-row">
              <el-tag v-for="host in asset.match.hosts" :key="host" size="small" effect="plain">
                {{ host }}
              </el-tag>
            </div>
            <div class="pa-route-list">
              <code v-for="route in asset.match.routes || []" :key="route">{{ route }}</code>
              <span v-if="!(asset.match.routes || []).length" class="pa-muted">未限制具体路由</span>
            </div>
          </section>

          <section class="pa-section">
            <h4>公共能力</h4>
            <div class="pa-chip-row">
              <el-tag v-for="capability in asset.capabilities" :key="capability" size="small" type="primary" effect="plain">
                {{ capability }}
              </el-tag>
              <span v-if="!asset.capabilities.length" class="pa-muted">尚未声明能力</span>
            </div>
          </section>

          <section class="pa-section">
            <h4>维护说明</h4>
            <ul v-if="asset.instructions?.length" class="pa-note-list">
              <li v-for="(instruction, index) in asset.instructions" :key="index">{{ instruction }}</li>
            </ul>
            <p v-else class="pa-muted">暂无额外说明。</p>
          </section>

          <section v-if="asset.draft" class="pa-section">
            <h4>未启用的草稿</h4>
            <p class="pa-muted">
              v{{ asset.draft.version }} · {{ asset.draft.spec.operations.length }} 个操作 ·
              {{ asset.draft.spec.capabilities.length }} 项能力 · 更新
              {{ formatAssetTime(asset.draft.updatedAt) }}
            </p>
            <p class="pa-muted">草稿保存不会影响当前 active 版本，启用后才切换到新契约。</p>
          </section>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="`操作（${asset.operations.length}）`" name="operations">
        <div v-if="asset.operations.length" class="pa-operation-list">
          <section v-for="operation in asset.operations" :key="operation.id" class="pa-operation">
            <div class="pa-operation-head">
              <div>
                <h4>{{ operation.title }}</h4>
                <code>{{ operation.id }}</code>
              </div>
              <div class="pa-operation-tags">
                <el-tag v-if="operation.capability" size="small" type="primary" effect="plain">
                  {{ operation.capability }}
                </el-tag>
                <el-tag :type="operation.confirmation === 'required' ? 'warning' : 'success'" size="small" effect="plain">
                  {{ operation.confirmation === 'required' ? '执行前确认' : '直接执行' }}
                </el-tag>
              </div>
            </div>
            <p v-if="operation.description">{{ operation.description }}</p>
            <dl class="pa-operation-meta">
              <div>
                <dt>执行器</dt>
                <dd><code>{{ operation.executor.recipeId }}</code></dd>
              </div>
              <div>
                <dt>输入参数</dt>
                <dd>{{ operation.inputSchema?.required?.join('、') || '无必填参数' }}</dd>
              </div>
            </dl>
            <details v-if="operation.inputSchema">
              <summary>查看输入契约</summary>
              <pre>{{ JSON.stringify(operation.inputSchema, null, 2) }}</pre>
            </details>
          </section>
        </div>
        <el-empty v-else description="该资产还没有声明操作" :image-size="64" />
      </el-tab-pane>

      <el-tab-pane :label="`版本（${versions.length}）`" name="versions">
        <div v-if="versions.length" class="pa-version-list">
          <div v-for="version in versions" :key="version.version" class="pa-version-row">
            <div class="pa-version-main">
              <strong>v{{ version.version }}</strong>
              <span v-if="version.version === asset.version" class="pa-current-version">当前</span>
              <span
                v-if="asset.draft && version.version === asset.draft.version"
                class="pa-draft-version"
              >
                草稿
              </span>
              <span>{{ version.changeSummary || '无变更说明' }}</span>
            </div>
            <div class="pa-version-meta">
              <code>{{ version.contractHash.slice(0, 12) }}</code>
              <span>{{ formatAssetTime(version.createdAt) }}</span>
              <el-button
                v-if="asset.source === 'user' && version.version !== asset.version && version.version !== asset.draft?.version"
                size="small"
                text
                :icon="Undo2"
                :loading="saving"
                @click="$emit('rollback', version.version)"
              >
                回滚为草稿
              </el-button>
            </div>
          </div>
        </div>
        <el-empty v-else description="暂无历史版本" :image-size="64" />
      </el-tab-pane>
    </el-tabs>
  </article>

  <div v-else class="pa-detail-empty">
    <el-empty description="从左侧选择一个页面资产" :image-size="84" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Archive, Braces, CopyPlus, Play, ShieldCheck, Undo2 } from 'lucide-vue-next';
import type { PageAssetDetail, PageAssetVersionView } from '../../stores/page-assets';
import {
  formatAssetTime,
  formatHealthRate,
  pageAssetStatusMeta,
  platformLabel,
} from './pageAssetUi';

const props = defineProps<{
  asset: PageAssetDetail | null;
  versions: PageAssetVersionView[];
  saving?: boolean;
}>();

defineEmits<{
  (event: 'edit'): void;
  (event: 'nextDraft'): void;
  (event: 'clone'): void;
  (event: 'validate'): void;
  (event: 'activate'): void;
  (event: 'archive'): void;
  (event: 'rollback', version: number): void;
}>();

const activeTab = ref('overview');
const statusMeta = computed(() =>
  pageAssetStatusMeta(props.asset?.status || 'draft'),
);

watch(() => props.asset?.id, () => {
  activeTab.value = 'overview';
});
</script>

<style scoped>
.pa-detail {
  min-height: 100%;
  padding: var(--space-5) var(--space-5) var(--space-6);
}

.pa-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.pa-detail-title-wrap {
  min-width: 0;
}

.pa-detail-title-line,
.pa-detail-meta,
.pa-detail-actions,
.pa-chip-row,
.pa-version-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.pa-detail-title-line h3 {
  margin: 0;
  color: var(--color-text);
  font-size: 18px;
  line-height: 1.35;
}

.pa-detail-meta {
  margin-top: 7px;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}

.pa-detail-meta code,
.pa-operation code,
.pa-version-row code {
  font-family: var(--font-mono);
}

.pa-dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--color-border-strong);
}

.pa-detail-actions {
  justify-content: flex-end;
  flex: 0 0 auto;
}

.pa-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: var(--space-5) 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--color-border);
}

.pa-metric {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px 14px;
  background: var(--color-surface);
}

.pa-metric-label {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}

.pa-metric strong {
  color: var(--color-text);
  font-size: 17px;
  font-weight: 650;
}

.pa-overview {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.pa-section {
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.pa-section:last-child {
  border-bottom: none;
}

.pa-section h4,
.pa-operation h4 {
  margin: 0 0 var(--space-2);
  color: var(--color-text);
  font-size: var(--font-size-md);
}

.pa-route-list,
.pa-note-list {
  margin: var(--space-2) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.pa-route-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pa-route-list code {
  font-family: var(--font-mono);
}

.pa-note-list {
  padding-left: 18px;
}

.pa-muted {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}

.pa-operation-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.pa-operation {
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.pa-operation-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.pa-operation-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.pa-operation p {
  margin: var(--space-2) 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.pa-operation-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-5);
  margin: 10px 0;
}

.pa-operation-meta div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.pa-operation-meta dt {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}

.pa-operation-meta dd {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

details {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

details summary {
  cursor: pointer;
  color: var(--color-text-secondary);
}

pre {
  max-height: 260px;
  overflow: auto;
  margin: var(--space-2) 0 0;
  padding: var(--space-3);
  border-radius: var(--radius-xs);
  background: var(--color-bg);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  line-height: 1.55;
}

.pa-version-list {
  display: flex;
  flex-direction: column;
}

.pa-version-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 58px;
  padding: 10px 2px;
  border-bottom: 1px solid var(--color-border);
}

.pa-version-main,
.pa-version-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.pa-version-main span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pa-current-version {
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
}

.pa-draft-version {
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  background: var(--color-warning-soft);
  color: var(--color-warning);
  font-size: var(--font-size-xs);
}

.pa-version-meta {
  flex: 0 0 auto;
  color: var(--color-text-tertiary);
}

.pa-detail-empty {
  display: grid;
  min-height: 100%;
  place-items: center;
}

@media (max-width: 980px) {
  .pa-detail {
    padding: var(--space-4);
  }
  .pa-detail-head {
    flex-direction: column;
  }
  .pa-detail-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 680px) {
  .pa-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .pa-operation-head,
  .pa-version-row {
    flex-direction: column;
    align-items: flex-start;
  }
  .pa-version-meta {
    flex-wrap: wrap;
  }
}
</style>
