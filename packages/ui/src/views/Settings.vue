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
      <el-tab-pane label="数据" name="data">
        <div class="data-section">
          <el-button @click="exportData" :icon="Download">导出全部数据</el-button>
          <el-button @click="triggerImport" :icon="Upload">导入备份数据</el-button>
          <input ref="fileInput" type="file" accept=".json" style="display:none" @change="importData" />
          <el-button type="danger" @click="clearCache" :icon="Delete">清空缓存</el-button>
        </div>
      </el-tab-pane>
      <el-tab-pane label="关于" name="about">
        <div class="about-section">
          <h3>AI Assistant</h3>
          <p>版本：v0.1.0 (MVP)</p>
          <p>本地优先的跨端 AI 助手</p>
          <p class="about-tip">参考 Cherry Studio + DE-GPT 设计，基于 OpenAI 标准协议</p>
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
import type { ThemeName } from '../stores/settings';

const settingsStore = useSettingsStore();
const platformStore = usePlatformStore();
const tab = ref('general');

const fileInput = ref<HTMLInputElement | null>(null);

const themes: Array<{ value: ThemeName; label: string; color: string }> = [
  { value: 'ocean', label: 'Ocean', color: '#3B82F6' },
  { value: 'forest', label: 'Forest', color: '#10B981' },
  { value: 'sunset', label: 'Sunset', color: '#F59E0B' },
  { value: 'aurora', label: 'Aurora', color: '#7C3AED' },
  { value: 'rose', label: 'Rose', color: '#EC4899' },
];

const darkMode = ref(settingsStore.settings.darkMode);

const defaultPlatformId = ref('');
const defaultModelId = ref('');
const keepRecent = ref(6);
const maxContextTokens = ref(8000);
const enableCompression = ref(true);

const availableDefaultModels = computed(() =>
  platformStore.models.filter((m) => m.platformId === defaultPlatformId.value && m.enabled),
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
  if (defaultPlatformId.value) {
    await platformStore.loadModels(defaultPlatformId.value);
  }
});

function setTheme(t: ThemeName) {
  settingsStore.update({ theme: t });
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

async function exportData() {
  try {
    // 简化版：导出所有 DB 表为 JSON
    const tables = ['platform', 'model', 'conversation', 'message', 'mcp_server', 'mcp_tool', 'agent', 'skill'];
    const data: Record<string, unknown> = {};
    for (const t of tables) {
      try {
        const adapter = (await import('@ai-assistant/core')).getPlatformAdapter();
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
    const adapter = (await import('@ai-assistant/core')).getPlatformAdapter();
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
    const adapter = (await import('@ai-assistant/core')).getPlatformAdapter();
    await adapter.db.exec('DELETE FROM message');
    await adapter.db.exec('DELETE FROM conversation');
    ElMessage.success('已清空');
  } catch {}
}
</script>

<style scoped>
.page { padding: 24px; }
.page-title { font-size: 20px; font-weight: 600; margin-bottom: 24px; }
.glass-tabs { background: var(--glass-bg); backdrop-filter: var(--glass-filter); border-radius: var(--radius-md); padding: 16px; }

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

.form-tip { font-size: 12px; color: var(--color-text-secondary); }

.data-section { display: flex; gap: 12px; }
.about-section h3 { margin-bottom: 12px; }
.about-section p { margin: 6px 0; color: var(--color-text-secondary); }
.about-tip { font-size: 12px; opacity: 0.7; }
</style>
