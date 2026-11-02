<template>
  <div class="oft">
    <div class="oft-head">
      <span class="oft-title">字段总览</span>
      <span class="oft-sub">角色 / 置信度 / 锁定状态；置信度 &lt;70% 的字段禁止发布</span>
      <span style="flex: 1" />
      <span v-if="lowCount" class="oft-warn">{{ lowCount }} 个低置信度字段</span>
    </div>
    <el-table :data="rows" size="small" border :row-class-name="rowClass" max-height="260">
      <el-table-column label="字段" min-width="150">
        <template #default="{ row }">
          <div class="oft-name">
            <span class="dw-mono">{{ row.name }}</span>
            <small v-if="row.displayName && row.displayName !== row.name">{{ row.displayName }}</small>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="86">
        <template #default="{ row }">{{ KIND_LABEL[row.kind] }}</template>
      </el-table-column>
      <el-table-column label="角色" width="104">
        <template #default="{ row }">
          <span class="oft-role" :data-role="row.role || 'dimension'">{{ ROLE_LABEL[row.role || 'dimension'] || row.role }}</span>
        </template>
      </el-table-column>
      <el-table-column label="描述" min-width="180">
        <template #default="{ row }">
          <span v-if="row.description" class="oft-desc">{{ row.description }}</span>
          <span v-else class="oft-empty">未填写</span>
        </template>
      </el-table-column>
      <el-table-column label="置信度" width="100">
        <template #default="{ row }">
          <span v-if="typeof row.confidence === 'number'" class="oft-conf" :class="{ low: row.confidence < 0.7 }">
            {{ Math.round(row.confidence * 100) }}%
          </span>
          <span v-else class="oft-empty">—</span>
        </template>
      </el-table-column>
      <el-table-column label="附加" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.samples" size="small" type="info">样本 {{ row.samples }}</el-tag>
          <el-tag v-if="row.enums" size="small" type="success" style="margin-left: 4px">枚举 {{ row.enums }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="敏感" width="64" align="center">
        <template #default="{ row }">
          <el-checkbox
            :model-value="!!row.sensitive"
            size="small"
            @update:model-value="(v: boolean) => emit('toggleSensitive', { kind: row.kind, name: row.name, value: v })"
          />
        </template>
      </el-table-column>
      <el-table-column label="锁定" width="64" align="center">
        <template #default="{ row }">
          <el-icon v-if="row.locked" :size="14" class="oft-lock" title="人工确认，不被同步/富化覆盖"><Lock /></el-icon>
          <span v-else class="oft-empty">—</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Lock } from '@element-plus/icons-vue';

export interface FieldRow {
  kind: 'dimension' | 'time' | 'measure';
  name: string;
  displayName?: string;
  role?: string;
  description?: string;
  confidence?: number;
  locked?: boolean;
  sensitive?: boolean;
  samples?: number;
  enums?: number;
}

const props = defineProps<{ fields: FieldRow[] }>();
const emit = defineEmits<{ (e: 'toggleSensitive', p: { kind: string; name: string; value: boolean }): void }>();

const KIND_LABEL: Record<string, string> = { dimension: '维度', time: '时间', measure: '度量' };
const ROLE_LABEL: Record<string, string> = {
  identifier: '标识', foreign_key: '外键', time: '时间', measure: '度量', enum: '枚举', dimension: '维度',
};

const rows = computed(() => props.fields || []);
const lowCount = computed(() => rows.value.filter((f) => typeof f.confidence === 'number' && f.confidence < 0.7).length);

function rowClass({ row }: { row: FieldRow }): string {
  return typeof row.confidence === 'number' && row.confidence < 0.7 ? 'is-low-confidence' : '';
}
</script>

<style scoped>
.oft { border: 1px solid var(--glass-border); border-radius: 10px; padding: 10px 12px; margin-bottom: 14px; }
.oft-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.oft-title { font-size: 13px; font-weight: 600; }
.oft-sub { font-size: 11.5px; color: var(--color-text-secondary); }
.oft-warn { font-size: 12px; color: var(--el-color-warning); }
.oft-name { display: flex; flex-direction: column; line-height: 1.35; }
.oft-name small { color: var(--color-text-secondary); font-size: 11px; }
.oft-role { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--glass-bg, rgba(127,127,127,.12)); }
.oft-role[data-role="identifier"] { color: #334155; }
.oft-role[data-role="foreign_key"] { color: #7c3aed; }
.oft-role[data-role="time"] { color: #0e9f8f; }
.oft-role[data-role="measure"] { color: #b4710a; }
.oft-role[data-role="enum"] { color: #2563eb; }
.oft-desc { font-size: 12px; }
.oft-empty { color: var(--color-text-tertiary, var(--color-text-secondary)); font-size: 12px; }
.oft-conf { font-size: 12px; font-weight: 600; }
.oft-conf.low { color: #b4710a; }
.oft-lock { color: var(--el-color-warning); }
:deep(.el-table__row.is-low-confidence) { background: #fff8e6; }
</style>
