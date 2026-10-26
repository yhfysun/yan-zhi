<!--
文档类型管理（文档 D1/D2）
- 左：内置模板 / 自定义类型；右：可视化编辑（字段 + 段落 + 变量）
- 内置类型只读，可「另存为副本」变成自定义后编辑
- YAML 导入导出走后端（与文档格式同构，导入即校验）
-->
<template>
  <div class="page dw-root dt-root">
    <aside class="dt-side">
      <div class="dt-side-head">
        <span class="dt-side-title">文档类型</span>
        <div class="dt-side-actions">
          <el-button size="small" text @click="importOpen = true">导入</el-button>
          <el-button size="small" text @click="newType">+ 新建</el-button>
        </div>
      </div>
      <div v-if="store.error" class="dt-error">{{ store.error }}</div>
      <div class="dt-group">内置模板</div>
      <div
        v-for="t in store.builtins"
        :key="t.code"
        class="dt-item"
        :class="{ on: draft?.code === t.code }"
        @click="select(t)"
      >
        <div class="dt-item-name">{{ t.name }}</div>
        <div class="dt-item-meta">{{ t.code }} · {{ t.sections.length }} 段</div>
      </div>
      <div class="dt-group">自定义</div>
      <div
        v-for="t in store.customs"
        :key="t.code"
        class="dt-item"
        :class="{ on: draft?.code === t.code }"
        @click="select(t)"
      >
        <div class="dt-item-name">{{ t.name }}</div>
        <div class="dt-item-meta">{{ t.code }} · {{ t.sections.length }} 段</div>
      </div>
      <div v-if="!store.customs.length" class="dt-side-empty">还没有自定义类型</div>
    </aside>

    <section class="dt-main">
      <div v-if="!draft" class="dt-empty">选择左侧模板，或新建一个文档类型</div>
      <template v-else>
        <div class="dt-main-head">
          <el-tag size="small" :type="isBuiltin ? 'info' : 'success'">{{ isBuiltin ? '内置（只读）' : '自定义' }}</el-tag>
          <span class="dt-main-title">{{ draft.name || '未命名' }}</span>
          <div class="dt-main-actions">
            <el-button v-if="isBuiltin" size="small" @click="cloneAsNew">另存为副本</el-button>
            <el-button size="small" :loading="busy" @click="exportYaml">导出 YAML</el-button>
            <el-button v-if="!isBuiltin" size="small" @click="removeCurrent">删除</el-button>
            <el-button size="small" type="primary" :loading="busy" :disabled="isBuiltin" @click="save">保存</el-button>
          </div>
        </div>

        <div class="dt-form">
          <label class="dt-field"><span>code</span>
            <el-input v-model="draft.code" size="small" :disabled="isBuiltin" placeholder="小写字母/数字/下划线" />
          </label>
          <label class="dt-field"><span>名称</span><el-input v-model="draft.name" size="small" :disabled="isBuiltin" /></label>
          <label class="dt-field"><span>分类</span><el-input v-model="draft.category" size="small" :disabled="isBuiltin" /></label>
          <label class="dt-field dt-field-wide"><span>说明</span><el-input v-model="draft.description" size="small" :disabled="isBuiltin" /></label>
          <label class="dt-field dt-field-wide"><span>适用场景</span><el-input v-model="draft.usage" size="small" :disabled="isBuiltin" /></label>
        </div>

        <div class="dt-section-head">
          <span class="dt-block-title">段落结构</span>
          <el-button size="small" text :disabled="isBuiltin" @click="addSection">+ 添加段落</el-button>
        </div>
        <div class="dt-sections">
          <div v-for="(s, i) in draft.sections" :key="i" class="dt-section">
            <el-select v-model="s.kind" size="small" style="width: 110px" :disabled="isBuiltin">
              <el-option v-for="(label, kind) in KIND_LABELS" :key="kind" :label="label" :value="kind" />
            </el-select>
            <el-input v-model="s.label" size="small" style="width: 150px" placeholder="段名" :disabled="isBuiltin" />
            <el-input v-model="s.hint" size="small" placeholder="给模型看的撰写要点" :disabled="isBuiltin" />
            <el-checkbox v-model="s.required" size="small" :disabled="isBuiltin">必填</el-checkbox>
            <div class="dt-row-actions">
              <button type="button" :disabled="isBuiltin || i === 0" @click="move(i, -1)">↑</button>
              <button type="button" :disabled="isBuiltin || i === draft.sections.length - 1" @click="move(i, 1)">↓</button>
              <button type="button" class="danger" :disabled="isBuiltin" @click="draft.sections.splice(i, 1)">×</button>
            </div>
          </div>
        </div>

        <div class="dt-section-head">
          <span class="dt-block-title">变量（正文里用双花括号包围 key 作占位）</span>
          <el-button size="small" text :disabled="isBuiltin" @click="addVariable">+ 添加变量</el-button>
        </div>
        <div v-if="!draft.variables?.length" class="dt-hint">没有变量：渲染时不需要填表。</div>
        <div v-for="(v, i) in draft.variables || []" :key="i" class="dt-variable">
          <el-input v-model="v.key" size="small" style="width: 120px" placeholder="key" :disabled="isBuiltin" />
          <el-input v-model="v.label" size="small" style="width: 130px" placeholder="显示名" :disabled="isBuiltin" />
          <el-select v-model="v.type" size="small" style="width: 100px" :disabled="isBuiltin">
            <el-option label="文本" value="text" />
            <el-option label="日期" value="date" />
            <el-option label="下拉" value="select" />
          </el-select>
          <el-input v-model="v.default" size="small" style="width: 130px" placeholder="默认值" :disabled="isBuiltin" />
          <el-input
            v-if="v.type === 'select'"
            :model-value="(v.options || []).join(',')"
            size="small"
            style="width: 180px"
            placeholder="选项，逗号分隔"
            :disabled="isBuiltin"
            @update:model-value="(val: string) => (v.options = val.split(',').map((x) => x.trim()).filter(Boolean))"
          />
          <button type="button" class="dt-del" :disabled="isBuiltin" @click="draft.variables!.splice(i, 1)">×</button>
        </div>
      </template>
    </section>

    <el-dialog v-model="importOpen" title="导入文档类型 YAML" width="560px" append-to-body>
      <el-input v-model="importText" type="textarea" :rows="14" placeholder="粘贴 YAML；导入会按 code 覆盖同名的自定义类型" />
      <template #footer>
        <el-button size="small" @click="importOpen = false">取消</el-button>
        <el-button size="small" type="primary" :loading="busy" @click="doImport">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useDocumentTypeStore } from '../stores/document-type';
import type { DocumentType, DocumentTypeSectionSpec, DocumentVariableSpec } from '../utils/document-types';

const KIND_LABELS: Record<DocumentTypeSectionSpec['kind'], string> = {
  heading: '标题', paragraph: '段落', metrics: '指标', table: '表格',
  chart: '图表', infographic: '信息图', image: '图片', pageBreak: '分页',
};

const store = useDocumentTypeStore();
const draft = ref<DocumentType | null>(null);
const isBuiltin = ref(false);
const busy = ref(false);
const importOpen = ref(false);
const importText = ref('');

onMounted(async () => {
  await store.load();
});

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function select(t: DocumentType): void {
  draft.value = clone(t);
  isBuiltin.value = !!t.builtin;
}

function newType(): void {
  draft.value = {
    code: '',
    name: '',
    description: '',
    category: '自定义',
    output: 'docx',
    sections: [{ kind: 'paragraph', label: '正文', hint: '' }],
  };
  isBuiltin.value = false;
}

function cloneAsNew(): void {
  const cur = draft.value;
  if (!cur) return;
  draft.value = {
    ...clone(cur),
    code: `${cur.code}-copy`,
    name: `${cur.name}（副本）`,
  };
  isBuiltin.value = false;
}

function addSection(): void {
  draft.value?.sections.push({ kind: 'paragraph', label: '新段落', hint: '' });
}

function move(index: number, delta: number): void {
  const list = draft.value?.sections;
  if (!list) return;
  const next = index + delta;
  if (next < 0 || next >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(next, 0, item);
}

function addVariable(): void {
  const d = draft.value;
  if (!d) return;
  if (!d.variables) d.variables = [];
  d.variables.push({ key: '', label: '', type: 'text' } as DocumentVariableSpec);
}

async function save(): Promise<void> {
  const d = draft.value;
  if (!d) return;
  busy.value = true;
  try {
    const saved = await store.save(d);
    if (saved) { select(saved); ElMessage.success('已保存'); }
  } finally {
    busy.value = false;
  }
}

async function removeCurrent(): Promise<void> {
  const d = draft.value;
  if (!d || isBuiltin.value) return;
  try {
    await ElMessageBox.confirm(`删除文档类型「${d.name}」？`, '删除', { type: 'warning' });
  } catch { return; }
  busy.value = true;
  try {
    if (await store.remove(d.code)) {
      draft.value = null;
      ElMessage.success('已删除');
    }
  } finally {
    busy.value = false;
  }
}

async function exportYaml(): Promise<void> {
  const d = draft.value;
  if (!d) return;
  busy.value = true;
  try {
    const yaml = await store.exportYaml(d);
    if (!yaml) return;
    const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${d.code || 'document-type'}.yaml`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } finally {
    busy.value = false;
  }
}

async function doImport(): Promise<void> {
  if (!importText.value.trim()) return;
  busy.value = true;
  try {
    const imported = await store.importYaml(importText.value);
    if (!imported) return;
    importOpen.value = false;
    importText.value = '';
    select(imported);
    ElMessage.success('已导入');
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.dt-root { display: flex; height: 100%; min-height: 0; }
.dt-side { flex: 0 0 230px; display: flex; flex-direction: column; min-height: 0; overflow: auto; border-right: 1px solid var(--el-border-color-lighter); }
.dt-side-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--el-border-color-lighter); }
.dt-side-title { font-size: 13px; font-weight: 600; color: var(--color-text); }
.dt-side-actions { display: flex; gap: 2px; }
.dt-group { padding: 10px 12px 4px; font-size: 11px; color: var(--color-text-tertiary); }
.dt-item { padding: 8px 12px; cursor: pointer; border-left: 3px solid transparent; }
.dt-item:hover { background: var(--el-fill-color-lighter); }
.dt-item.on { background: color-mix(in srgb, var(--el-color-primary) 10%, transparent); border-left-color: var(--el-color-primary); }
.dt-item-name { font-size: 12px; font-weight: 600; color: var(--color-text); }
.dt-item-meta { font-size: 11px; color: var(--color-text-tertiary); }
.dt-side-empty { padding: 8px 12px; font-size: 11px; color: var(--color-text-tertiary); }
.dt-error { padding: 6px 12px; font-size: 12px; color: var(--el-color-danger); }
.dt-main { flex: 1 1 auto; min-width: 0; overflow: auto; padding: 12px 16px 24px; }
.dt-empty { display: flex; height: 100%; align-items: center; justify-content: center; color: var(--color-text-tertiary); font-size: 13px; }
.dt-main-head { display: flex; align-items: center; gap: 8px; padding-bottom: 10px; border-bottom: 1px solid var(--el-border-color-lighter); }
.dt-main-title { font-size: 15px; font-weight: 600; color: var(--color-text); }
.dt-main-actions { margin-left: auto; display: flex; gap: 6px; }
.dt-form { display: flex; flex-wrap: wrap; gap: 10px; padding: 12px 0; }
.dt-field { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-text-secondary); }
.dt-field > span { flex: 0 0 auto; width: 56px; }
.dt-field-wide { flex: 1 1 320px; }
.dt-section-head { display: flex; align-items: center; justify-content: space-between; margin: 10px 0 6px; }
.dt-block-title { font-size: 13px; font-weight: 600; color: var(--color-text); }
.dt-hint { font-size: 12px; color: var(--color-text-tertiary); padding: 6px 0; }
.dt-sections { display: flex; flex-direction: column; gap: 6px; }
.dt-section { display: flex; align-items: center; gap: 6px; padding: 6px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; }
.dt-variable { display: flex; align-items: center; gap: 6px; padding: 6px 0; }
.dt-row-actions { display: flex; gap: 2px; margin-left: auto; }
.dt-row-actions button, .dt-del { border: 1px solid var(--el-border-color-lighter); background: var(--el-fill-color-blank); color: var(--color-text-secondary); cursor: pointer; border-radius: 4px; width: 24px; height: 22px; }
.dt-row-actions button:disabled, .dt-del:disabled { opacity: 0.4; cursor: not-allowed; }
.dt-row-actions button.danger:hover:not(:disabled), .dt-del:hover:not(:disabled) { color: var(--el-color-danger); border-color: var(--el-color-danger); }
</style>
