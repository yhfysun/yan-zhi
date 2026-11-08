<template>
  <div class="epanel">
    <div class="toolbar">
      <div>
        <h3>团队资源</h3>
        <p>模型、Skill、专家、规则、工具和 MCP 统一入口。资源授权继续使用现有 ACL。</p>
      </div>
      <div class="actions">
        <el-button :loading="loading" @click="reload">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openRule()">新建规则</el-button>
        <el-button :icon="Connection" @click="openManifest">绑定专家规则</el-button>
      </div>
    </div>

    <div class="resource-grid">
      <div v-for="card in resourceCards" :key="card.key" class="resource-card">
        <span>{{ card.label }}</span>
        <b>{{ card.items.length }}</b>
        <small>{{ card.items.slice(0, 4).map((x) => x.name).join('、') || '暂无资源' }}</small>
      </div>
    </div>

    <section class="panel">
      <div class="panel-head">
        <h3>团队规则</h3>
        <span>系统规则优先；专家规则可固定绑定到智能体</span>
      </div>
      <el-table :data="rules" v-loading="loading" border size="small">
        <el-table-column prop="name" label="名称" min-width="150" />
        <el-table-column prop="scope" label="范围" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.scope === 'system' ? 'danger' : row.scope === 'expert' ? 'warning' : 'info'">{{ scopeLabel(row.scope) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="priority" label="优先级" width="80" />
        <el-table-column label="必选" width="70">
          <template #default="{ row }">{{ row.required ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }"><el-tag size="small" :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="version" label="版本" width="70" />
        <el-table-column prop="content" label="内容" min-width="260" show-overflow-tooltip />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openRule(row)">编辑</el-button>
            <el-button link type="danger" @click="removeRule(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h3>设计资源</h3>
        <el-button size="small" :icon="Plus" @click="openDesign()">新建设计资源</el-button>
      </div>
      <el-table :data="designResources" border size="small">
        <el-table-column prop="name" label="名称" min-width="150" />
        <el-table-column label="类型" width="110">
          <template #default="{ row }">{{ designKindLabel(row.kind) }}</template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip />
        <el-table-column label="标签" min-width="180">
          <template #default="{ row }"><el-tag v-for="t in row.tags" :key="t" size="small" class="tag">{{ t }}</el-tag></template>
        </el-table-column>
        <el-table-column label="公开" width="70"><template #default="{ row }">{{ row.is_public ? '是' : '否' }}</template></el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDesign(row)">编辑</el-button>
            <el-button link type="danger" @click="removeDesign(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="ruleDialog" :title="editingRule ? '编辑团队规则' : '新建团队规则'" width="680px">
      <el-form label-width="88px">
        <el-form-item label="名称"><el-input v-model="ruleForm.name" /></el-form-item>
        <el-form-item label="范围">
          <el-select v-model="ruleForm.scope" style="width: 100%">
            <el-option label="用户规则" value="user" />
            <el-option label="专家规则" value="expert" />
            <el-option label="系统规则" value="system" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-input-number v-model="ruleForm.priority" :min="0" :max="10000" />
          <span class="hint">数字越小越靠前</span>
        </el-form-item>
        <el-form-item label="强制生效"><el-switch v-model="ruleForm.required" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="ruleForm.enabled" /></el-form-item>
        <el-form-item label="内容">
          <el-input v-model="ruleForm.content" type="textarea" :rows="12" placeholder="例如：所有对外文档必须使用公司模板；涉及金额必须给出来源和计算过程。" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ruleDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveRule">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="manifestDialog" title="绑定专家规则并生成清单" width="620px">
      <el-form label-width="100px">
        <el-form-item label="团队专家">
          <el-select v-model="manifestAgentId" filterable placeholder="选择智能体 / 专家" style="width: 100%">
            <el-option v-for="a in catalog?.agents || []" :key="a.id" :label="a.name" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="绑定规则">
          <el-select v-model="manifestRuleIds" multiple filterable placeholder="选择规则" style="width: 100%">
            <el-option v-for="r in rules.filter((x) => x.enabled)" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <p class="hint">保存后会更新智能体的规则挂载，并生成不可变 Expert Manifest 与资源版本。</p>
      </el-form>
      <template #footer>
        <el-button @click="manifestDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="!manifestAgentId" @click="saveManifest">生成清单</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="designDialog" :title="editingDesign ? '编辑设计资源' : '新建设计资源'" width="640px">
      <el-form label-width="88px">
        <el-form-item label="名称"><el-input v-model="designForm.name" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="designForm.kind" style="width: 100%">
            <el-option label="模板" value="template" />
            <el-option label="风格" value="style" />
            <el-option label="设计系统" value="design-system" />
            <el-option label="设计方向" value="direction" />
          </el-select>
        </el-form-item>
        <el-form-item label="说明"><el-input v-model="designForm.description" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="标签"><el-input v-model="designForm.tags" placeholder="逗号分隔，如 科技,极简,蓝紫" /></el-form-item>
        <el-form-item label="内容 JSON"><el-input v-model="designForm.content" type="textarea" :rows="9" placeholder='{"prompt":"...","palette":["#..."],"layout":"..."}' /></el-form-item>
        <el-form-item label="预览 URL"><el-input v-model="designForm.previewUrl" /></el-form-item>
        <el-form-item label="公开给成员"><el-switch v-model="designForm.isPublic" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="designForm.enabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="designDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveDesign">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Connection, Plus } from '@element-plus/icons-vue';
import { enterpriseApi, type DesignResource, type TeamResourceCatalog, type TeamRule } from '../../../api/enterprise';

const loading = ref(false);
const saving = ref(false);
const catalog = ref<TeamResourceCatalog | null>(null);
const rules = ref<TeamRule[]>([]);
const designResources = ref<DesignResource[]>([]);
const ruleDialog = ref(false);
const editingRule = ref<TeamRule | null>(null);
const ruleForm = ref({ name: '', scope: 'expert' as TeamRule['scope'], priority: 100, required: false, enabled: true, content: '' });
const manifestDialog = ref(false);
const manifestAgentId = ref('');
const manifestRuleIds = ref<string[]>([]);
const designDialog = ref(false);
const editingDesign = ref<DesignResource | null>(null);
const designForm = ref({
  name: '',
  kind: 'template' as DesignResource['kind'],
  description: '',
  tags: '',
  content: '{}',
  previewUrl: '',
  isPublic: true,
  enabled: true,
});

const resourceCards = computed(() => {
  const c = catalog.value;
  return [
    { key: 'models', label: '模型', items: c?.models || [] },
    { key: 'skills', label: 'Skill', items: c?.skills || [] },
    { key: 'agents', label: '专家 / 智能体', items: c?.agents || [] },
    { key: 'tools', label: '工具', items: c?.tools || [] },
    { key: 'mcp', label: 'MCP 连接', items: c?.mcp || [] },
    { key: 'plugins', label: '插件', items: c?.plugins || [] },
  ];
});

function scopeLabel(scope: string) {
  return scope === 'system' ? '系统' : scope === 'expert' ? '专家' : '用户';
}
function designKindLabel(kind: string) {
  return kind === 'style' ? '风格' : kind === 'design-system' ? '设计系统' : kind === 'direction' ? '设计方向' : '模板';
}

async function reload() {
  loading.value = true;
  try {
    const [nextCatalog, nextRules, nextDesign] = await Promise.all([
      enterpriseApi.resources(),
      enterpriseApi.rules(true),
      enterpriseApi.designResources(),
    ]);
    catalog.value = nextCatalog;
    rules.value = nextRules || [];
    designResources.value = nextDesign || [];
  } finally {
    loading.value = false;
  }
}

function openRule(row?: TeamRule) {
  editingRule.value = row || null;
  ruleForm.value = row
    ? { name: row.name, scope: row.scope, priority: row.priority, required: row.required, enabled: row.enabled, content: row.content }
    : { name: '', scope: 'expert', priority: 100, required: false, enabled: true, content: '' };
  ruleDialog.value = true;
}

async function saveRule() {
  if (!ruleForm.value.name.trim() || !ruleForm.value.content.trim()) {
    ElMessage.warning('名称和内容不能为空');
    return;
  }
  saving.value = true;
  try {
    const r = editingRule.value
      ? await enterpriseApi.updateRule(editingRule.value.id, ruleForm.value)
      : await enterpriseApi.createRule(ruleForm.value);
    if ('error' in r) { ElMessage.error(r.error); return; }
    ElMessage.success('规则已保存');
    ruleDialog.value = false;
    await reload();
  } finally {
    saving.value = false;
  }
}

async function removeRule(row: TeamRule) {
  const confirmed = await ElMessageBox.confirm(`确定删除规则「${row.name}」？`, '删除规则', { type: 'warning' }).catch(() => false);
  if (!confirmed) return;
  const r = await enterpriseApi.deleteRule(row.id);
  if ('error' in r) { ElMessage.error(r.error); return; }
  ElMessage.success('已删除');
  await reload();
}

function openManifest() {
  manifestAgentId.value = '';
  manifestRuleIds.value = [];
  manifestDialog.value = true;
}

async function saveManifest() {
  saving.value = true;
  try {
    const r = await enterpriseApi.createManifest(manifestAgentId.value, manifestRuleIds.value);
    if ('error' in r) { ElMessage.error(r.error); return; }
    ElMessage.success('专家清单已生成');
    manifestDialog.value = false;
  } finally {
    saving.value = false;
  }
}

function openDesign(row?: DesignResource) {
  editingDesign.value = row || null;
  designForm.value = row
    ? {
        name: row.name,
        kind: row.kind,
        description: row.description || '',
        tags: (row.tags || []).join(','),
        content: JSON.stringify(row.content || {}, null, 2),
        previewUrl: row.preview_url || '',
        isPublic: row.is_public,
        enabled: row.enabled,
      }
    : { name: '', kind: 'template', description: '', tags: '', content: '{}', previewUrl: '', isPublic: true, enabled: true };
  designDialog.value = true;
}

async function saveDesign() {
  let content: Record<string, unknown> = {};
  try {
    content = JSON.parse(designForm.value.content || '{}');
  } catch {
    ElMessage.error('内容 JSON 格式不正确');
    return;
  }
  saving.value = true;
  try {
    const body = {
      name: designForm.value.name,
      kind: designForm.value.kind,
      description: designForm.value.description,
      tags: designForm.value.tags.split(/[,，]/).map((x) => x.trim()).filter(Boolean),
      content,
      previewUrl: designForm.value.previewUrl,
      isPublic: designForm.value.isPublic,
      enabled: designForm.value.enabled,
    };
    const r = editingDesign.value
      ? await enterpriseApi.updateDesignResource(editingDesign.value.id, body)
      : await enterpriseApi.createDesignResource(body);
    if ('error' in r) { ElMessage.error(r.error); return; }
    ElMessage.success('设计资源已保存');
    designDialog.value = false;
    await reload();
  } finally { saving.value = false; }
}

async function removeDesign(row: DesignResource) {
  const confirmed = await ElMessageBox.confirm(`删除设计资源「${row.name}」？`, '删除设计资源', { type: 'warning' }).catch(() => false);
  if (!confirmed) return;
  const r = await enterpriseApi.deleteDesignResource(row.id);
  if ('error' in r) { ElMessage.error(r.error); return; }
  await reload();
}

onMounted(reload);
</script>

<style scoped>
.epanel { display: flex; flex-direction: column; gap: 14px; }
.toolbar, .panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.toolbar h3, .panel-head h3 { margin: 0 0 4px; font-size: 15px; }
.toolbar p, .panel-head span, .hint { margin: 0; font-size: 12px; color: var(--color-text-secondary); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.resource-grid { display: grid; grid-template-columns: repeat(6, minmax(110px, 1fr)); gap: 10px; }
.resource-card { min-width: 0; padding: 12px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg-secondary); display: flex; flex-direction: column; gap: 3px; }
.resource-card span, .resource-card small { color: var(--color-text-secondary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.resource-card b { font-size: 22px; line-height: 1.1; }
.panel { border: 1px solid var(--color-border); border-radius: 8px; padding: 12px; background: var(--color-bg-secondary); }
.hint { margin-left: 8px; }
@media (max-width: 900px) {
  .resource-grid { grid-template-columns: repeat(2, minmax(110px, 1fr)); }
  .toolbar { flex-direction: column; }
  .actions { justify-content: flex-start; }
}
</style>
