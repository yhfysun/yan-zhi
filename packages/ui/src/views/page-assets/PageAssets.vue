<template>
  <PageFrame
    title="页面资产"
    subtitle="维护页面契约、公共能力、操作版本与运行健康度；Skill 只引用 capability，不复制页面步骤。"
    :scroll="false"
    :pad="false"
  >
    <template #actions>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建资产</el-button>
    </template>

    <div class="pa-body">
      <PageAssetList
        :items="pageAssetsStore.items"
        :selected-id="pageAssetsStore.selected?.id"
        :loading="pageAssetsStore.loading"
        :search="String(pageAssetsStore.filters.query || '')"
        :platform="String(pageAssetsStore.filters.platform || '')"
        :status="pageAssetsStore.filters.status || ''"
        :platform-options="platformOptions"
        :active-count="pageAssetsStore.activeCount"
        :draft-count="pageAssetsStore.draftCount"
        @select="selectAsset"
        @reload="reload"
        @update:search="setSearch"
        @update:platform="setPlatform"
        @update:status="setStatus"
      />

      <main class="pa-main">
        <el-alert
          v-if="pageAssetsStore.error"
          class="pa-error"
          :title="pageAssetsStore.error"
          type="error"
          show-icon
          :closable="false"
        >
          <template #default>
            <el-button size="small" text type="primary" @click="reload">重试</el-button>
          </template>
        </el-alert>

        <div v-if="pageAssetsStore.detailLoading" class="pa-detail-loading" aria-label="正在加载资产详情">
          <el-skeleton :rows="8" animated />
        </div>
        <PageAssetDetail
          v-else
          :asset="pageAssetsStore.selected"
          :versions="pageAssetsStore.versions"
          :saving="pageAssetsStore.saving"
          @edit="openEdit"
          @next-draft="openNextDraft"
          @clone="openClone"
          @validate="validateSelected"
          @activate="activateSelected"
          @archive="archiveSelected"
          @rollback="rollbackToVersion"
        />
      </main>
    </div>

    <PageAssetEditorDialog
      v-model="editorOpen"
      :title="editorTitle"
      :initial-spec="editorSpec"
      :saving="pageAssetsStore.saving"
      :error="pageAssetsStore.error"
      @save="saveEditor"
    />
  </PageFrame>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from 'lucide-vue-next';
import type { PageAssetSpec, PageAssetStatus } from '@yan-zhi/shared';
import PageFrame from '../../components/common/PageFrame.vue';
import PageAssetDetail from './PageAssetDetail.vue';
import PageAssetEditorDialog from './PageAssetEditorDialog.vue';
import PageAssetList from './PageAssetList.vue';
import { usePageAssetsStore, type PageAssetDetail as PageAssetDetailView } from '../../stores/page-assets';
import {
  clonePageAssetSpec,
  copyPageAssetSpec,
  createBlankPageAssetSpec,
  platformLabel,
} from './pageAssetUi';

const pageAssetsStore = usePageAssetsStore();
const editorOpen = ref(false);
const editorSpec = ref<PageAssetSpec | null>(null);
const editorMode = ref<'create' | 'update' | 'next'>('create');

function currentAsset(): PageAssetDetailView | null {
  return pageAssetsStore.selected as unknown as PageAssetDetailView | null;
}

function workingVersionOf(asset: PageAssetDetailView): number {
  return asset.draft?.version ?? asset.version;
}

function workingSpecOf(asset: PageAssetDetailView): PageAssetSpec {
  return copyPageAssetSpec(asset.draft?.spec ?? asset);
}

const editorTitle = computed(() => {
  if (editorMode.value === 'update') return '编辑页面资产草稿';
  if (editorMode.value === 'next') return '创建下一版草稿';
  return editorSpec.value?.id.endsWith('.copy') ? '复制为草稿' : '新建页面资产';
});

const platformOptions = computed(() => {
  const values = new Set(['douyin', 'kuaishou', 'xiaohongshu']);
  pageAssetsStore.items.forEach((item) => values.add(item.platform));
  return [...values].map((value) => ({ value, label: platformLabel(value) }));
});

function setSearch(value: string): void {
  pageAssetsStore.filters.query = value;
}

function setPlatform(value: string): void {
  pageAssetsStore.filters.platform = value;
  void reload();
}

function setStatus(value: PageAssetStatus | ''): void {
  pageAssetsStore.filters.status = value;
  void reload();
}

async function reload(): Promise<void> {
  await pageAssetsStore.load();
  if (!pageAssetsStore.items.length) {
    pageAssetsStore.clearSelection();
    return;
  }
  const selected = currentAsset();
  if (!selected || !pageAssetsStore.items.some((item) => item.id === selected.id)) {
    await selectAsset(pageAssetsStore.items[0].id);
  }
}

async function selectAsset(id: string): Promise<void> {
  await pageAssetsStore.select(id);
}

function openCreate(): void {
  editorMode.value = 'create';
  editorSpec.value = createBlankPageAssetSpec();
  editorOpen.value = true;
}

function openEdit(): void {
  const selected = currentAsset();
  if (!selected || selected.source === 'builtin' || (!selected.draft && selected.status !== 'draft')) return;
  editorMode.value = 'update';
  editorSpec.value = workingSpecOf(selected);
  editorOpen.value = true;
}

async function openNextDraft(): Promise<void> {
  const selected = currentAsset();
  if (!selected || selected.source === 'builtin') return;
  if (selected.draft) {
    openEdit();
    return;
  }
  try {
    await ElMessageBox.confirm(
      `将基于当前 v${selected.version} 创建下一版草稿。当前 active 版本保持在线，只有启用草稿后才会切换运行时契约。`,
      '创建下一版草稿',
      { type: 'warning', confirmButtonText: '继续编辑', cancelButtonText: '取消' },
    );
    editorMode.value = 'next';
    editorSpec.value = workingSpecOf(selected);
    editorOpen.value = true;
  } catch {
    // User cancelled.
  }
}

function openClone(): void {
  const selected = currentAsset();
  if (!selected) return;
  editorMode.value = 'create';
  editorSpec.value = clonePageAssetSpec(selected);
  editorOpen.value = true;
}

async function saveEditor(payload: { spec: PageAssetSpec; changeSummary: string }): Promise<void> {
  try {
    const selected = currentAsset();
    let saved;
    if (editorMode.value === 'update' && selected) {
      saved = await pageAssetsStore.updateDraft(
        selected.id,
        payload.spec,
        workingVersionOf(selected),
        payload.changeSummary,
      );
    } else if (editorMode.value === 'next' && selected) {
      saved = await pageAssetsStore.saveDraft(payload.spec, {
        expectedVersion: workingVersionOf(selected),
        changeSummary: payload.changeSummary,
      });
    } else {
      saved = await pageAssetsStore.saveDraft(payload.spec, { changeSummary: payload.changeSummary });
    }
    editorOpen.value = false;
    await pageAssetsStore.load();
    await pageAssetsStore.select(saved.id);
    ElMessage.success('页面资产草稿已保存');
  } catch {
    // store.error is rendered inside the editor.
  }
}

async function validateSelected(): Promise<void> {
  const selected = currentAsset();
  if (!selected) return;
  try {
    const result = await pageAssetsStore.validate(selected.id);
    if (result.ok) ElMessage.success(`校验通过 · v${result.version} · ${result.contractHash.slice(0, 12)}`);
    else ElMessage.error(result.errors.join('；') || '校验失败');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  }
}

async function activateSelected(): Promise<void> {
  const asset = currentAsset();
  if (!asset) return;
  try {
    const workingVersion = workingVersionOf(asset);
    await ElMessageBox.confirm(
      asset.draft
        ? `启用「${asset.title}」草稿 v${workingVersion} 后，将切换到新契约；切换前 active v${asset.version} 继续在线。`
        : `启用「${asset.title}」v${workingVersion} 后，引用其 capability 的智能体将可以启动新任务调用。`,
      '启用页面资产',
      { type: 'warning', confirmButtonText: '启用', cancelButtonText: '取消' },
    );
    await pageAssetsStore.activate(
      asset.id,
      workingVersion,
      'activate from page asset workbench',
    );
    ElMessage.success('页面资产已启用');
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error instanceof Error ? error.message : String(error));
  }
}

async function archiveSelected(): Promise<void> {
  const asset = currentAsset();
  if (!asset) return;
  try {
    await ElMessageBox.confirm(
      `停用后现有引用会立即停止返回「${asset.title}」，历史版本仍保留。`,
      '停用页面资产',
      { type: 'warning', confirmButtonText: '停用', cancelButtonText: '取消' },
    );
    await pageAssetsStore.archive(asset.id);
    ElMessage.success('页面资产已停用');
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error instanceof Error ? error.message : String(error));
  }
}

async function rollbackToVersion(version: number): Promise<void> {
  const asset = currentAsset();
  if (!asset) return;
  try {
    await ElMessageBox.confirm(
      `将 v${version} 恢复为新的草稿版本，不会直接覆盖当前启用版本。`,
      '回滚页面资产',
      { type: 'warning', confirmButtonText: '恢复为草稿', cancelButtonText: '取消' },
    );
    await pageAssetsStore.rollback(asset.id, version);
    ElMessage.success('已恢复为草稿，请校验后重新启用');
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error instanceof Error ? error.message : String(error));
  }
}

onMounted(reload);
</script>

<style scoped>
.pa-body {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  flex: 1;
  min-height: 0;
}

.pa-main {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  background: var(--color-bg);
}

.pa-error {
  margin: var(--space-3) var(--space-4) 0;
}

.pa-detail-loading {
  padding: var(--space-5);
}

@media (max-width: 900px) {
  .pa-body {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(220px, 42vh) minmax(0, 1fr);
  }
  .pa-main {
    min-height: 0;
  }
}
</style>
