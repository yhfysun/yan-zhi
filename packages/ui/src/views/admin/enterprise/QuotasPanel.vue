<template>
  <div class="epanel">
    <div class="toolbar">
      <div>
        <h3>周期额度</h3>
        <p>用户未单独配置时继承最近一级组织额度；模型和 MCP 调用都会进入流水。</p>
      </div>
      <div class="actions">
        <el-button :loading="loading" @click="reload">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openPolicy">新增额度</el-button>
      </div>
    </div>

    <section class="panel">
      <div class="panel-head">
        <h3>额度策略</h3>
        <span>{{ policies.length }} 条</span>
      </div>
      <el-table :data="policies" v-loading="loading" border size="small">
        <el-table-column prop="subject_name" label="对象" min-width="160" />
        <el-table-column label="类型" width="80">
          <template #default="{ row }">{{ row.subject_type === 'org' ? '组织' : '用户' }}</template>
        </el-table-column>
        <el-table-column label="周期" width="90">
          <template #default="{ row }">{{ periodLabel(row.period) }}</template>
        </el-table-column>
        <el-table-column label="上限" width="120">
          <template #default="{ row }">¥{{ Number(row.limit_cny || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }"><el-tag size="small" :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button link type="danger" @click="removePolicy(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h3>当前额度账户</h3>
        <span>最近周期优先</span>
      </div>
      <el-table :data="accounts" border size="small">
        <el-table-column prop="subject_name" label="对象" min-width="160" />
        <el-table-column prop="period" label="周期" width="80" />
        <el-table-column label="使用 / 上限" min-width="180">
          <template #default="{ row }">
            <el-progress
              :percentage="ratio(row)"
              :status="ratio(row) >= 100 ? 'exception' : ratio(row) >= 80 ? 'warning' : undefined"
              :stroke-width="8"
            />
            <span class="quota-text">¥{{ Number(row.used_cny || 0).toFixed(2) }} / ¥{{ Number(row.limit_cny || 0).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="周期时间" min-width="220">
          <template #default="{ row }">{{ formatDate(row.period_start) }} - {{ formatDate(row.period_end) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170">
          <template #default="{ row }">
            <el-button link type="primary" @click="showEntries(row)">流水</el-button>
            <el-button link type="warning" @click="reset(row)">重置</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="dialog" title="新增周期额度" width="500px">
      <el-form label-width="90px">
        <el-form-item label="对象类型">
          <el-segmented v-model="form.subjectType" :options="[{ label: '用户', value: 'user' }, { label: '组织', value: 'org' }]" />
        </el-form-item>
        <el-form-item label="对象">
          <el-select v-model="form.subjectId" filterable style="width: 100%">
            <el-option v-for="o in subjectOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="周期">
          <el-select v-model="form.period" style="width: 100%">
            <el-option label="每天" value="day" />
            <el-option label="每周" value="week" />
            <el-option label="每月" value="month" />
          </el-select>
        </el-form-item>
        <el-form-item label="额度">
          <el-input-number v-model="form.limitCny" :min="0" :precision="2" :controls="false" style="width: 100%" />
          <div class="hint">单位：人民币元。0 表示不允许新的计费调用。</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="savePolicy">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="entriesDrawer" title="额度流水" size="520px">
      <el-table :data="entries" size="small" border>
        <el-table-column label="时间" width="165">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column prop="kind" label="类型" width="90" />
        <el-table-column label="金额" width="100">
          <template #default="{ row }">¥{{ Number(row.amount_cny || 0).toFixed(4) }}</template>
        </el-table-column>
        <el-table-column prop="note" label="说明" min-width="160" show-overflow-tooltip />
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { enterpriseApi, type QuotaAccount, type QuotaPolicy } from '../../../api/enterprise';
import { adminApi, type AdminOrg, type AdminUser } from '../../../api/admin';

const loading = ref(false);
const saving = ref(false);
const policies = ref<QuotaPolicy[]>([]);
const accounts = ref<QuotaAccount[]>([]);
const users = ref<AdminUser[]>([]);
const orgs = ref<AdminOrg[]>([]);
const dialog = ref(false);
const entriesDrawer = ref(false);
const entries = ref<any[]>([]);
const form = ref({ subjectType: 'user' as 'user' | 'org', subjectId: '', period: 'month' as 'day' | 'week' | 'month', limitCny: 100 });

const subjectOptions = computed(() => form.value.subjectType === 'org'
  ? orgs.value.map((x) => ({ id: x.id, name: x.name }))
  : users.value.map((x) => ({ id: x.id, name: x.username })));

function periodLabel(v: string) {
  return v === 'day' ? '每天' : v === 'week' ? '每周' : '每月';
}
function formatDate(v: number) {
  return v ? new Date(v).toLocaleDateString() : '-';
}
function formatTime(v: number) {
  return v ? new Date(v).toLocaleString() : '-';
}
function ratio(row: QuotaAccount) {
  const limit = Number(row.limit_cny || 0);
  if (limit <= 0) return 100;
  return Math.min(100, Math.round((Number(row.used_cny || 0) / limit) * 100));
}

async function reload() {
  loading.value = true;
  try {
    const [p, a, u, o] = await Promise.all([
      enterpriseApi.policies(),
      enterpriseApi.accounts(),
      adminApi.users(),
      adminApi.orgs(),
    ]);
    policies.value = p || [];
    accounts.value = a || [];
    users.value = u || [];
    orgs.value = o || [];
  } finally {
    loading.value = false;
  }
}

function openPolicy() {
  form.value = { subjectType: 'user', subjectId: '', period: 'month', limitCny: 100 };
  dialog.value = true;
}

async function savePolicy() {
  if (!form.value.subjectId) { ElMessage.warning('请选择额度对象'); return; }
  saving.value = true;
  try {
    const r = await enterpriseApi.upsertPolicy(form.value);
    if ('error' in r) { ElMessage.error(r.error); return; }
    ElMessage.success('额度已保存');
    dialog.value = false;
    await reload();
  } finally {
    saving.value = false;
  }
}

async function removePolicy(row: QuotaPolicy) {
  const confirmed = await ElMessageBox.confirm(`确定删除「${row.subject_name || row.subject_id}」的额度策略？`, '删除额度', { type: 'warning' }).catch(() => false);
  if (!confirmed) return;
  const r = await enterpriseApi.deletePolicy(row.id);
  if ('error' in r) { ElMessage.error(r.error); return; }
  await reload();
}

async function reset(row: QuotaAccount) {
  const confirmed = await ElMessageBox.confirm(`重置「${row.subject_name || row.subject_id}」当前周期额度？`, '重置额度', { type: 'warning' }).catch(() => false);
  if (!confirmed) return;
  const r = await enterpriseApi.resetAccount(row.id);
  if ('error' in r) { ElMessage.error(r.error); return; }
  ElMessage.success('已重置');
  await reload();
}

async function showEntries(row: QuotaAccount) {
  entries.value = (await enterpriseApi.accountEntries(row.id)) || [];
  entriesDrawer.value = true;
}

onMounted(reload);
</script>

<style scoped>
.epanel { display: flex; flex-direction: column; gap: 14px; }
.toolbar, .panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.toolbar h3, .panel-head h3 { margin: 0 0 4px; font-size: 15px; }
.toolbar p, .panel-head span { margin: 0; font-size: 12px; color: var(--color-text-secondary); }
.actions { display: flex; gap: 8px; }
.panel { border: 1px solid var(--color-border); border-radius: 8px; padding: 12px; background: var(--color-bg-secondary); }
.quota-text { display: block; margin-top: 4px; color: var(--color-text-secondary); font-size: 12px; }
.hint { margin-top: 4px; font-size: 12px; color: var(--color-text-secondary); }
@media (max-width: 760px) { .toolbar { flex-direction: column; } }
</style>
