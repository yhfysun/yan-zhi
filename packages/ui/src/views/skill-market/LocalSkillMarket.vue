<template>
  <div class="local-market">
    <header class="lm-header">
      <div class="lm-header-left">
        <el-button text @click="$router.push('/skills')"><el-icon><ArrowLeft /></el-icon> 商城首页</el-button>
        <h2 class="lm-title">本地商城</h2>
      </div>
      <div class="lm-header-right">
        <div class="lm-search-wrap">
          <el-icon class="lm-search-icon"><Search /></el-icon>
          <input v-model="search" placeholder="搜索..." class="lm-search-input" />
          <el-icon v-if="search" class="lm-search-clear" @click="search = ''"><Close /></el-icon>
        </div>
        <el-button type="primary" :icon="Plus" @click="openNew" class="fab-add">新增 Skill</el-button>
        <el-tooltip content="Markdown 导入">
          <el-button circle @click="importMd" class="lm-icon-btn"><el-icon :size="16"><UploadFilled /></el-icon></el-button>
        </el-tooltip>
        <el-tooltip content="文件夹导入">
          <el-button circle @click="importFolder" class="lm-icon-btn"><el-icon :size="16"><FolderOpened /></el-icon></el-button>
        </el-tooltip>
      </div>
    </header>

    <div class="skill-grid">
      <div v-for="s in filteredSkills" :key="s.id" class="skill-card" @click="previewSkill(s)">
        <div class="card-top">
          <div class="card-icon" :class="{ off: !s.enabled }"><el-icon :size="24"><Files /></el-icon></div>
          <div class="card-name" :title="s.name">{{ s.name }}</div>
          <el-tag :type="s.source === 'local' ? 'warning' : 'success'" size="small" effect="plain">{{ s.source === 'local' ? '自建' : '内置' }}</el-tag>
        </div>
        <div class="card-bar" @click.stop>
          <el-switch :model-value="s.enabled" size="small" @change="(v: boolean) => toggle(s.id, v)" />
          <span class="card-gap" />
          <el-tooltip v-if="s.source === 'local'" content="编辑" placement="top"><el-button size="small" circle @click="openEdit(s)"><el-icon :size="14"><Edit /></el-icon></el-button></el-tooltip>
          <el-tooltip :content="s.source === 'local' ? '删除' : '卸载'" placement="top"><el-button size="small" circle type="danger" @click="removeSkill(s.id)"><el-icon :size="14"><Delete /></el-icon></el-button></el-tooltip>
        </div>
      </div>
      <el-empty v-if="filteredSkills.length === 0" description="还没有 Skill" />
    </div>

    <!-- 新建/编辑弹窗 -->
    <el-dialog v-model="showEditor" :title="editing ? '编辑 Skill' : '新建 Skill'" width="900px" :close-on-click-modal="false">
      <div class="editor-layout">
        <div class="editor-form">
          <el-form label-width="80px">
            <el-form-item label="名称"><el-input v-model="editor.name" :disabled="!!editing" /></el-form-item>
            <el-form-item label="描述"><el-input v-model="editor.description" type="textarea" :rows="2" /></el-form-item>
            <el-form-item label="触发词">
              <el-input v-model="triggersText" placeholder="逗号分隔，如：excel,xlsx,数据分析" />
            </el-form-item>
            <el-form-item label="内容">
              <el-input v-model="editor.bodyMd" type="textarea" :rows="14" placeholder="Skill Markdown 内容" />
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
        <el-button type="primary" @click="saveSkill">保存</el-button>
      </template>
    </el-dialog>

    <!-- 预览弹窗 -->
    <el-dialog v-model="showPreview" title="Skill 内容" width="640px">
      <pre class="preview-content">{{ previewContent }}</pre>
    </el-dialog>

    <!-- 导入弹窗 -->
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
import { Plus, Files, ArrowLeft, Edit, Delete, FolderOpened, UploadFilled, Search, Close } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useSkillStore } from '../../stores';
import { getPlatformAdapter } from '@yan-zhi/core';
import type { Skill } from '../../stores/skill';

const store = useSkillStore();
const search = ref('');

const showEditor = ref(false);
const showPreview = ref(false);
const showImport = ref(false);
const editing = ref<Skill | null>(null);
const previewContent = ref('');
const editor = ref({ name: '', description: '', bodyMd: '' });
const triggersText = ref('');
const importText = ref('');

onMounted(() => store.loadSkills());

const filteredSkills = computed(() => {
  if (!search.value) return store.skills;
  const q = search.value.toLowerCase();
  return store.skills.filter(s =>
    s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q)
  );
});

const previewMd = computed(() => {
  const fm = ['---', `name: ${editor.value.name || '(未填写)'}`];
  if (editor.value.description) fm.push(`description: ${editor.value.description}`);
  if (triggersText.value) {
    const ts = triggersText.value.split(',').map(s => s.trim()).filter(Boolean);
    if (ts.length) fm.push(`triggers:\n${ts.map(t => `  - ${t}`).join('\n')}`);
  }
  fm.push('---', '');
  return fm.join('\n') + (editor.value.bodyMd || '');
});

function openNew() {
  editing.value = null;
  editor.value = { name: '', description: '', bodyMd: '' };
  triggersText.value = '';
  showEditor.value = true;
}

function openEdit(s: Skill) {
  editing.value = s;
  editor.value = {
    name: s.name,
    description: (s.frontmatter as any).description || s.description || '',
    bodyMd: s.bodyMd,
  };
  triggersText.value = (s.frontmatter?.triggers || []).join(', ');
  showEditor.value = true;
}

async function saveSkill() {
  if (!editor.value.name) { ElMessage.warning('名称必填'); return; }
  const triggers = triggersText.value.split(',').map(s => s.trim()).filter(Boolean);
  if (editing.value) {
    await store.updateSkill(editing.value.id, {
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
}

function previewSkill(s: Skill) {
  previewContent.value = store.exportToMd(s);
  showPreview.value = true;
}

function exportSkill(s: Skill) {
  const md = store.exportToMd(s);
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${s.name}.md`; a.click();
  URL.revokeObjectURL(url);
}

async function toggle(id: string, enabled: boolean) {
  await store.toggleEnabled(id, enabled);
}

async function removeSkill(id: string) {
  try {
    await ElMessageBox.confirm('确认删除该 Skill？', '提示', { type: 'warning' });
    await store.uninstall(id);
    ElMessage.success('已删除');
  } catch {}
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

async function importFolder() {
  try {
    const adapter = getPlatformAdapter();
    // 使用 Tauri dialog 打开文件夹选择器
    const path = await (window as any).__TAURI__?.dialog?.open({
      directory: true, multiple: false, title: '选择 Skill 文件夹',
    });
    if (!path) return;
    // 递归扫描 .md 文件
    const mdFiles: string[] = [];
    async function scan(dir: string) {
      const entries = await adapter.fs.readDir(dir);
      for (const name of entries) {
        const full = dir + '/' + name;
        try {
          const sub = await adapter.fs.readDir(full);
          // 是子目录，递归
          await scan(full);
        } catch {
          // 是文件
          if (name.endsWith('.md')) mdFiles.push(full);
        }
      }
    }
    await scan(path);
    if (mdFiles.length === 0) {
      ElMessage.warning('所选文件夹中没有 .md 文件');
      return;
    }
    let imported = 0;
    const nameSet = new Set(store.skills.map(s => s.name));
    for (const fp of mdFiles) {
      try {
        const content = await adapter.fs.readFile(fp);
        const parsed = parseSkillMd(content);
        if (!parsed.frontmatter.name) continue;
        // 跳过已存在同名的
        if (nameSet.has(parsed.frontmatter.name)) continue;
        await store.createCustom(
          parsed.frontmatter.name,
          parsed.frontmatter.description || '',
          parsed.bodyMd || parsed.body,
          parsed.frontmatter.triggers || [],
        );
        nameSet.add(parsed.frontmatter.name);
        imported++;
      } catch {}
    }
    if (imported > 0) {
      ElMessage.success(`已从文件夹导入 ${imported} 个 Skill`);
    } else {
      ElMessage.info('没有可导入的新 Skill（可能是名称重复）');
    }
  } catch (e: any) {
    ElMessage.error('文件夹导入仅支持桌面端（需要文件系统权限）');
  }
}

function parseSkillMd(md: string): { frontmatter: any; bodyMd: string; body: string } {
  const fmMatch = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!fmMatch) return { frontmatter: {}, bodyMd: md, body: md };
  const [, fmRaw, body] = fmMatch;
  const fm: any = {};
  const lines = fmRaw.split('\n');
  let currentKey = '';
  for (const line of lines) {
    const keyMatch = line.match(/^(\w+)\s*:\s*(.*)$/);
    if (keyMatch) {
      currentKey = keyMatch[1];
      if (currentKey === 'triggers' || currentKey === 'tools') {
        fm[currentKey] = [];
      } else {
        fm[currentKey] = keyMatch[2].trim();
      }
    } else if (currentKey === 'triggers' || currentKey === 'tools') {
      const itemMatch = line.match(/^\s+-\s+(.*)/);
      if (itemMatch) fm[currentKey].push(itemMatch[1].trim());
    }
  }
  return { frontmatter: fm, bodyMd: fmRaw + '\n\n' + body.trim(), body: body.trim() };
}
</script>

<style scoped>
.local-market { padding: 24px; }

.lm-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.lm-header-left { display: flex; align-items: center; gap: 12px; }
.lm-header-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; flex-wrap: wrap; }
.lm-title { font-size: 20px; font-weight: 600; margin: 0; }

.lm-search-wrap {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 8px;
  border: 1px solid var(--glass-border); background: var(--glass-bg);
  width: 150px; transition: border-color 0.2s;
}
.lm-search-wrap:focus-within { border-color: var(--color-primary); }
.lm-search-icon { font-size: 14px; color: var(--color-text-secondary); flex-shrink: 0; }
.lm-search-input {
  border: none; outline: none; background: transparent;
  font-size: 13px; width: 100%; min-width: 0; color: var(--color-text);
}
.lm-search-input::placeholder { color: var(--color-text-secondary); opacity: 0.5; }
.lm-search-clear { font-size: 13px; color: var(--color-text-secondary); cursor: pointer; flex-shrink: 0; }

.lm-icon-btn {
  width: 32px; height: 32px; padding: 0;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg); color: var(--color-text-secondary);
}
.lm-icon-btn:hover { color: var(--color-primary); border-color: var(--color-primary); }

.skill-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); gap: 12px; }
.skill-card {
  background: var(--glass-bg); backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border); border-radius: var(--radius-md);
  padding: 16px; cursor: pointer;
  transition: all 0.2s;
  min-width: 0;
  max-width: 100%;
}
.skill-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.06); border-color: rgba(124,58,237,0.2); }

.card-top { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.card-icon { color: var(--color-primary); flex-shrink: 0; }
.card-icon.off { opacity: 0.35; }
.card-name {
  font-weight: 600; font-size: 14px; flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.card-bar { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.card-gap { flex: 1; }

.editor-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.editor-preview { display: flex; flex-direction: column; }
.preview-title { font-size: 13px; color: var(--color-text-secondary); margin-bottom: 8px; font-weight: 600; }
.preview-md {
  flex: 1; background: rgba(15, 23, 42, 0.04); padding: 12px; border-radius: 6px;
  font-family: "JetBrains Mono", monospace; font-size: 12px; overflow: auto;
  white-space: pre-wrap; min-height: 360px; max-height: 480px; word-break: break-word;
}
.preview-content {
  background: rgba(15, 23, 42, 0.04); padding: 16px; border-radius: 6px;
  font-family: "JetBrains Mono", monospace; font-size: 13px; max-height: 500px;
  overflow: auto; white-space: pre-wrap;
}

/* ===== Mobile ===== */
@media (max-width: 767px) {
  .local-market { padding: 0 !important; width: 100%; }
  .lm-header { flex-direction: column; align-items: stretch; gap: 10px; padding: 14px; }
  .lm-header-left { flex-wrap: wrap; }
  .lm-header-right { flex-wrap: wrap; gap: 6px; }
  .lm-search-wrap { width: 100%; }
  .lm-title { font-size: 18px; }
  .skill-grid { grid-template-columns: minmax(0, 1fr) !important; gap: 10px; width: 100%; padding: 0 14px 14px; box-sizing: border-box; }
  .skill-card { width: 100%; max-width: 100%; box-sizing: border-box; }
  .editor-layout { grid-template-columns: 1fr; gap: 12px; }
  .preview-md { min-height: 180px; max-height: 280px; }
}
</style>
