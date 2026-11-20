<template>
  <section class="pet-settings-page" aria-label="宠物设置">
    <div class="pet-settings-workspace">
      <header class="pet-settings-workspace-head">
        <div>
          <el-icon :size="18"><Present /></el-icon>
          <span>
            <b>桌面宠物</b>
            <small>设置会立即应用到悬浮宠物</small>
          </span>
        </div>
        <el-tag :type="petStore.settings.enabled ? 'success' : 'info'" effect="plain">
          {{ petStore.settings.enabled ? '已显示' : '已隐藏' }}
        </el-tag>
      </header>

      <div class="pet-settings-content">
        <Settings embedded pane="pet" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Present } from '@element-plus/icons-vue';
import Settings from './Settings.vue';
import { usePetStore } from '../stores/pet';

const petStore = usePetStore();
petStore.init();
</script>

<style scoped>
.pet-settings-page {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  padding: 16px 24px 24px;
  background: var(--color-bg);
}

.pet-settings-workspace {
  display: flex;
  width: min(1180px, 100%);
  min-height: 0;
  flex: 1;
  flex-direction: column;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
}

.pet-settings-workspace-head {
  display: flex;
  min-height: 62px;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border);
}

.pet-settings-workspace-head > div {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.pet-settings-workspace-head b,
.pet-settings-workspace-head small {
  display: block;
}

.pet-settings-workspace-head b {
  color: var(--color-text);
  font-size: 13px;
}

.pet-settings-workspace-head small {
  margin-top: 2px;
  color: var(--color-text-tertiary);
  font-size: 10px;
}

.pet-settings-content {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px 24px;
}

.pet-settings-content :deep(.glass-tabs) {
  padding: 0;
  border-radius: 0;
  background: transparent;
  backdrop-filter: none;
}

.pet-settings-content :deep(.el-tabs__header) {
  display: none;
}

@media (max-width: 900px) {
  .pet-settings-page {
    padding: 10px;
  }

  .pet-settings-content {
    padding: 12px;
  }
}
</style>
