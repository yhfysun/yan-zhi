<template>
  <div class="page">
    <header class="page-header">
      <h2 class="page-title">Skill 商店</h2>
      <div class="header-actions">
        <el-input v-model="search" placeholder="搜索 Skill" style="width: 200px" clearable />
        <el-tabs v-model="tab" class="skill-tabs">
          <el-tab-pane label="商店" name="market" />
          <el-tab-pane label="已安装" name="installed" />
          <el-tab-pane label="自建" name="custom" />
        </el-tabs>
        <el-button v-if="tab === 'custom'" type="primary" @click="showEditor = true"><el-icon><Plus /></el-icon> 新建</el-button>
      </div>
    </header>

    <!-- 分类筛选（仅商店 tab 显示） -->
    <div v-if="tab === 'market'" class="category-bar">
      <span
        v-for="c in categories"
        :key="c"
        :class="['cat-chip', { active: category === c }]"
        @click="category = c"
      >{{ c }}</span>
    </div>

    <!-- 商店 -->
    <div v-if="tab === 'market'">
      <div class="resource-section">
        <div class="resource-title">🔗 开源资源推荐</div>
        <div class="resource-links">
          <a
            v-for="r in openSourceResources"
            :key="r.url"
            :href="r.url"
            target="_blank"
            class="resource-link-item"
            :title="r.description"
          >
            <span class="resource-icon">{{ r.icon }}</span>
            <span class="resource-name">{{ r.title }}</span>
          </a>
        </div>
      </div>

      <div class="skill-grid">
        <el-card v-for="s in filteredMarket" :key="s.name" class="skill-card">
          <div class="skill-icon"><el-icon><Files /></el-icon></div>
          <div class="skill-name">{{ s.name }}</div>
          <div class="skill-desc">{{ s.description }}</div>
          <div class="skill-meta">
            <el-tag size="small" type="info">{{ s.category }}</el-tag>
            <span class="skill-author">{{ s.author }}</span>
            <span class="skill-installs"><el-icon><Download /></el-icon>{{ formatInstalls(s.installs) }}</span>
          </div>
          <div class="skill-triggers" v-if="s.triggers?.length">
            <el-tag v-for="t in s.triggers" :key="t" size="small" effect="plain">{{ t }}</el-tag>
          </div>
          <div class="skill-actions">
            <el-button size="small" type="primary" :disabled="isInstalled(s.name)" @click="install(s.name)">
              {{ isInstalled(s.name) ? '已安装' : '安装' }}
            </el-button>
            <el-button size="small" text @click="preview(s)">预览</el-button>
          </div>
        </el-card>
        <el-empty v-if="filteredMarket.length === 0" description="无匹配 Skill" />
      </div>
    </div>

    <!-- 已安装 -->
    <div v-else-if="tab === 'installed'" class="skill-grid">
      <el-card v-for="s in filteredInstalled" :key="s.id" class="skill-card">
        <div class="skill-icon" :class="{ disabled: !s.enabled }"><el-icon><Files /></el-icon></div>
        <div class="skill-name">{{ s.name }}</div>
        <div class="skill-desc">{{ s.description }}</div>
        <div class="skill-source">
          <el-tag :type="s.source === 'market' ? 'success' : 'warning'" size="small">
            {{ s.source === 'market' ? '商店' : '自建' }}
          </el-tag>
        </div>
        <div class="skill-actions">
          <el-switch :model-value="s.enabled" @change="(v) => toggle(s.id, v as boolean)" />
          <el-button size="small" text @click="preview(s)">查看</el-button>
          <el-button size="small" text type="danger" @click="uninstall(s.id)">卸载</el-button>
        </div>
      </el-card>
      <el-empty v-if="filteredInstalled.length === 0" description="还没有安装任何 Skill" />
    </div>

    <!-- 自建 -->
    <div v-else class="custom-list">
      <el-table :data="customSkills" class="glass-table">
        <el-table-column prop="name" label="名称" width="180" />
        <el-table-column prop="description" label="描述" />
        <el-table-column label="触发词" width="200">
          <template #default="{ row }">
            <el-tag v-for="t in (row.frontmatter.triggers || [])" :key="t" size="small" style="margin-right: 4px">{{ t }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240">
          <template #default="{ row }">
            <el-button size="small" @click="editCustom(row)">编辑</el-button>
            <el-button size="small" @click="exportSkill(row)">导出</el-button>
            <el-button size="small" type="danger" @click="uninstall(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="customSkills.length === 0" description="还没有自建 Skill" />
    </div>

    <!-- 自建编辑器（带实时预览） -->
    <el-dialog v-model="showEditor" :title="editingSkill ? '编辑 Skill' : '新建 Skill'" width="900px" :close-on-click-modal="false" class="editor-dialog">
      <div class="editor-layout">
        <div class="editor-form">
          <el-form label-width="80px">
            <el-form-item label="名称"><el-input v-model="editor.name" :disabled="!!editingSkill" /></el-form-item>
            <el-form-item label="描述"><el-input v-model="editor.description" type="textarea" :rows="2" /></el-form-item>
            <el-form-item label="分类">
              <el-select v-model="editor.category" placeholder="选择分类" style="width: 100%">
                <el-option v-for="c in categories.filter(x => x !== '全部')" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
            <el-form-item label="触发词">
              <el-input v-model="triggersText" placeholder="逗号分隔，如：excel,xlsx,数据分析" />
            </el-form-item>
            <el-form-item label="内容">
              <el-input v-model="editor.bodyMd" type="textarea" :rows="14" placeholder="Skill Markdown 内容（不含 frontmatter）" />
            </el-form-item>
          </el-form>
        </div>
        <div class="editor-preview">
          <div class="preview-title">实时预览</div>
          <pre class="preview-md">{{ previewMd }}</pre>
        </div>
      </div>
      <template #footer>
        <el-button @click="showEditor = false">取消</el-button>
        <el-button @click="importMd">从 Markdown 导入</el-button>
        <el-button type="primary" @click="saveCustom">保存</el-button>
      </template>
    </el-dialog>

    <!-- 预览 -->
    <el-dialog v-model="showPreview" title="Skill 内容" width="640px">
      <pre class="preview-content">{{ previewContent }}</pre>
    </el-dialog>

    <!-- 导入对话框 -->
    <el-dialog v-model="showImport" title="从 Markdown 导入" width="640px">
      <el-input v-model="importText" type="textarea" :rows="12" placeholder="粘贴 Skill Markdown（含 frontmatter）" />
      <template #footer>
        <el-button @click="showImport = false">取消</el-button>
        <el-button type="primary" @click="doImport">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Plus, Files, Download } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useSkillStore } from '../stores';
import { OPEN_SOURCE_RESOURCES } from '../stores/skill';
import type { Skill } from '@ai-assistant/shared';

const store = useSkillStore();
const openSourceResources = OPEN_SOURCE_RESOURCES;
const tab = ref('market');
const search = ref('');
const category = ref('全部');
const showEditor = ref(false);
const showPreview = ref(false);
const showImport = ref(false);
const editingSkill = ref<Skill | null>(null);
const previewContent = ref('');
const editor = ref({ name: '', description: '', bodyMd: '', category: '' });
const triggersText = ref('');
const importText = ref('');

const categories = ['全部', '编程', '写作', '设计', '数据分析', '办公', '自定义'];

onMounted(() => store.loadSkills());

const filteredMarket = computed(() => {
  let list = store.marketSkills;
  if (category.value !== '全部') list = list.filter((s) => (s as any).category === category.value);
  if (search.value) {
    const q = search.value.toLowerCase();
    list = list.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }
  return list;
});

const filteredInstalled = computed(() => {
  if (!search.value) return store.skills;
  const q = search.value.toLowerCase();
  return store.skills.filter((s) =>
    s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q),
  );
});

const customSkills = computed(() => store.skills.filter((s) => s.source === 'local'));

/** 实时预览 Markdown 全文（含 frontmatter） */
const previewMd = computed(() => {
  const fm = ['---', `name: ${editor.value.name || '(未填写)'}`];
  if (editor.value.description) fm.push(`description: ${editor.value.description}`);
  if (editor.value.category) fm.push(`category: ${editor.value.category}`);
  if (triggersText.value) {
    const ts = triggersText.value.split(',').map((s) => s.trim()).filter(Boolean);
    if (ts.length) fm.push(`triggers:\n${ts.map((t) => `  - ${t}`).join('\n')}`);
  }
  fm.push('---', '');
  return fm.join('\n') + (editor.value.bodyMd || '');
});

function formatInstalls(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function isInstalled(name: string) {
  return store.skills.some((s) => s.name === name);
}

async function install(name: string) {
  try {
    await store.install(name);
    ElMessage.success('已安装');
  } catch (e: any) {
    ElMessage.error(e?.message || '安装失败');
  }
}

async function toggle(id: string, enabled: boolean) {
  await store.toggleEnabled(id, enabled);
}

async function uninstall(id: string) {
  try {
    await ElMessageBox.confirm('确认卸载该 Skill？', '提示', { type: 'warning' });
    await store.uninstall(id);
    ElMessage.success('已卸载');
  } catch {}
}

function preview(s: any) {
  if (s.bodyMd !== undefined) {
    previewContent.value = store.exportToMd(s);
  } else {
    const fm = ['---', `name: ${s.name}`, `description: ${s.description}`];
    if (s.category) fm.push(`category: ${s.category}`);
    if (s.triggers?.length) fm.push(`triggers:\n${s.triggers.map((t: string) => `  - ${t}`).join('\n')}`);
    fm.push('---', '', s.body);
    previewContent.value = fm.join('\n');
  }
  showPreview.value = true;
}

function editCustom(s: Skill) {
  editingSkill.value = s;
  editor.value = {
    name: s.name,
    description: s.frontmatter.description || '',
    bodyMd: s.bodyMd,
    category: (s.frontmatter as any).category || '',
  };
  triggersText.value = (s.frontmatter.triggers || []).join(', ');
  showEditor.value = true;
}

function resetEditor() {
  editingSkill.value = null;
  editor.value = { name: '', description: '', bodyMd: '', category: '' };
  triggersText.value = '';
}

async function saveCustom() {
  if (!editor.value.name) { ElMessage.warning('名称必填'); return; }
  const triggers = triggersText.value.split(',').map((s) => s.trim()).filter(Boolean);
  const extra: any = {};
  if (editor.value.category) extra.category = editor.value.category;
  if (editingSkill.value) {
    await store.updateSkill(editingSkill.value.id, {
      description: editor.value.description,
      bodyMd: editor.value.bodyMd,
      triggers,
    });
    ElMessage.success('已保存');
  } else {
    await store.createCustom(editor.value.name, editor.value.description, editor.value.bodyMd, triggers);
    ElMessage.success('已创建');
  }
  showEditor.value = false;
  resetEditor();
}

function exportSkill(s: Skill) {
  const md = store.exportToMd(s);
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${s.name}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function importMd() {
  importText.value = '';
  showImport.value = true;
}

async function doImport() {
  if (!importText.value.trim()) { ElMessage.warning('请粘贴 Markdown 内容'); return; }
  try {
    await store.importFromMd(importText.value);
    ElMessage.success('已导入');
    showImport.value = false;
  } catch (e: any) {
    ElMessage.error(e?.message || '导入失败');
  }
}
</script>

<style scoped>
.page { padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
.page-title { font-size: 20px; font-weight: 600; }
.header-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.skill-tabs { background: var(--glass-bg); border-radius: var(--radius-md); padding: 0 12px; }

.category-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.cat-chip {
  padding: 4px 14px;
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--glass-bg);
}
.cat-chip:hover { background: var(--glass-bg-hover); }
.cat-chip.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }

.resource-section {
  margin-bottom: 20px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 14px 18px;
}
.resource-title { font-size: 13px; font-weight: 600; margin-bottom: 10px; color: var(--color-text-secondary); }
.resource-links { display: flex; flex-wrap: wrap; gap: 8px; }
.resource-link-item {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 14px;
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  font-size: 12px;
  color: var(--color-text);
  text-decoration: none;
  transition: all 0.2s;
  background: rgba(255, 255, 255, 0.4);
}
.resource-link-item:hover {
  border-color: var(--color-primary);
  background: rgba(59, 130, 246, 0.08);
  transform: translateY(-1px);
}
.resource-icon { font-size: 14px; }
.resource-name { white-space: nowrap; }

.skill-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.skill-card { background: var(--glass-bg); backdrop-filter: var(--glass-filter); text-align: center; transition: transform 0.2s; }
.skill-card:hover { transform: translateY(-2px); }
.skill-icon { font-size: 36px; color: var(--color-primary); margin-bottom: 12px; }
.skill-icon.disabled { opacity: 0.4; }
.skill-name { font-weight: 600; margin-bottom: 8px; }
.skill-desc { font-size: 13px; color: var(--color-text-secondary); margin-bottom: 12px; min-height: 40px; }
.skill-meta { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px; font-size: 12px; color: var(--color-text-secondary); }
.skill-author { font-style: italic; }
.skill-installs { display: inline-flex; align-items: center; gap: 2px; }
.skill-triggers { margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; }
.skill-source { margin-bottom: 12px; }
.skill-actions { display: flex; justify-content: center; align-items: center; gap: 8px; }

.glass-table { background: var(--glass-bg); backdrop-filter: var(--glass-filter); border-radius: var(--radius-md); }
.preview-content { background: rgba(15, 23, 42, 0.04); padding: 16px; border-radius: 6px; font-family: "JetBrains Mono", monospace; font-size: 13px; max-height: 500px; overflow: auto; white-space: pre-wrap; }

.editor-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.editor-preview { display: flex; flex-direction: column; }
.preview-title { font-size: 13px; color: var(--color-text-secondary); margin-bottom: 8px; font-weight: 600; }
.preview-md {
  flex: 1;
  background: rgba(15, 23, 42, 0.04);
  padding: 12px;
  border-radius: 6px;
  font-family: "JetBrains Mono", "Cascadia Code", monospace;
  font-size: 12px;
  overflow: auto;
  white-space: pre-wrap;
  min-height: 360px;
  max-height: 480px;
  word-break: break-word;
}
</style>
