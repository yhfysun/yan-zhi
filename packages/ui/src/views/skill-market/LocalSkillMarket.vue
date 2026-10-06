<template>
  <div class="local-market">
    <header class="lm-header">
      <div class="lm-header-left">
        <el-button text @click="$router.push('/skills')"><el-icon><ArrowLeft /></el-icon> 商城首页</el-button>
        <h2 class="lm-title">本地商城</h2>
      </div>
      <SearchToolbar v-model:query="search" placeholder="搜索...">
        <template #actions>
          <el-select v-model="catFilter" size="default" class="yz-cat-select" placeholder="全部分类">
            <el-option label="全部分类" value="all" />
            <el-option v-for="c in categoryOptions" :key="c.key" :label="c.label" :value="c.key" />
          </el-select>
          <el-button type="primary" :icon="Plus" @click="openNew" class="fab-add">新增 Skill</el-button>
          <el-tooltip content="Markdown 导入">
            <el-button @click="importMd" class="yz-icon-btn"><el-icon :size="16"><UploadFilled /></el-icon></el-button>
          </el-tooltip>
          <el-tooltip content="文件夹导入">
            <el-button @click="importFolder" class="yz-icon-btn"><el-icon :size="16"><FolderOpened /></el-icon></el-button>
          </el-tooltip>
          <el-tooltip content="压缩包导入">
            <el-button @click="importZip" class="yz-icon-btn"><el-icon :size="16"><Box /></el-icon></el-button>
          </el-tooltip>
        </template>
      </SearchToolbar>
    </header>

    <div class="skill-groups">
      <CollapsibleCategory
        v-for="group in groupedSkills"
        :key="group.category"
        :label="group.category"
        :count="group.skills.length"
        :collapsed="!!collapsedCats[group.category]"
        @update:collapsed="toggleCat(group.category)"
      >
        <CardGrid :min-card-width="220">
          <GlassCard
            v-for="s in group.skills"
            :key="s.id"
            :title="s.name"
            :description="s.description"
            @click="previewSkill(s)"
          >
            <template #icon>
              <div class="card-icon" :class="{ off: !s.enabled }"><el-icon :size="24"><Files /></el-icon></div>
            </template>
            <template #badge>
              <el-tag v-if="s.isPublic" type="primary" size="small" effect="dark">已公开</el-tag>
              <el-tag :type="s.source === 'local' ? 'warning' : 'success'" size="small" effect="plain">{{ s.source === 'local' ? '自建' : '内置' }}</el-tag>
            </template>
            <template #actions>
              <el-tooltip v-if="authStore.isLoggedIn" :content="s.isPublic ? '点击下架' : '发布到商城'" placement="top">
                <el-switch :model-value="!!s.isPublic" size="small" @change="(v: boolean) => togglePublish(s.id, v)" />
              </el-tooltip>
              <el-switch :model-value="s.enabled" size="small" @change="(v: boolean) => toggle(s.id, v)" />
              <el-tooltip content="导出（.zip，含子目录）" placement="top"><el-button size="small" circle @click="exportSkill(s)"><el-icon :size="14"><Download /></el-icon></el-button></el-tooltip>
              <el-tooltip v-if="s.source === 'local'" content="编辑" placement="top"><el-button size="small" circle @click="openEdit(s)"><el-icon :size="14"><Edit /></el-icon></el-button></el-tooltip>
              <el-tooltip :content="s.source === 'local' ? '删除' : '卸载'" placement="top"><el-button size="small" circle type="danger" @click="removeSkill(s.id)"><el-icon :size="14"><Delete /></el-icon></el-button></el-tooltip>
            </template>
          </GlassCard>
        </CardGrid>
      </CollapsibleCategory>
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
              <el-input v-model="editor.bodyMd" type="textarea" :rows="14" placeholder="Skill Markdown 内容（SKILL.md 本体）" />
            </el-form-item>
            <el-form-item label="子目录">
              <div class="subfiles">
                <div v-for="(f, i) in editorFiles" :key="i" class="subfile-row">
                  <el-input v-model="f.path" size="small" placeholder="相对路径，如 references/api-notes.md" class="subfile-path" @focus="editingFile = i" />
                  <el-button size="small" @click="editingFile = i">编辑内容</el-button>
                  <el-button size="small" type="danger" text @click="editorFiles.splice(i, 1); if (editingFile === i) editingFile = null"><el-icon><Delete /></el-icon></el-button>
                </div>
                <el-button size="small" @click="editorFiles.push({ path: '', content: '' })">+ 添加子文件</el-button>
              </div>
            </el-form-item>
          </el-form>
          <el-form v-if="editingFile !== null" label-width="80px" class="subfile-editor">
            <el-form-item :label="editorFiles[editingFile]?.path || '路径'">
              <el-input v-model="editorFiles[editingFile].content" type="textarea" :rows="10" placeholder="子文件内容" />
            </el-form-item>
            <el-button size="small" @click="editingFile = null">收起</el-button>
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

    <!-- 预览弹窗：层级文件树 + 内容预览（2026-10-06 子目录化） -->
    <el-dialog v-model="showPreview" :title="previewTitle" width="760px">
      <div class="preview-layout" v-if="previewFiles.length">
        <div class="preview-tree">
          <div
            v-for="f in previewFiles" :key="f.path"
            class="preview-tree-item" :class="{ active: previewActive === f.path }"
            @click="previewActive = f.path"
          >
            <el-icon :size="13"><Document /></el-icon>
            <span>{{ f.path }}</span>
          </div>
        </div>
        <pre class="preview-content preview-content-pane">{{ previewFiles.find(f => f.path === previewActive)?.content }}</pre>
      </div>
      <pre v-else class="preview-content">{{ previewContent }}</pre>
    </el-dialog>

    <!-- 导入弹窗 -->
    <el-dialog v-model="showImport" title="从 Markdown 导入" width="640px" :close-on-click-modal="false">
      <el-input v-model="importText" type="textarea" :rows="12" placeholder="粘贴 Skill Markdown（含 frontmatter）" />
      <template #footer>
        <el-button @click="showImport = false">取消</el-button>
        <el-button type="primary" @click="doImport">导入</el-button>
      </template>
    </el-dialog>

    <input ref="zipInput" type="file" accept=".zip" style="display: none" @change="onZipFile" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { Plus, Files, ArrowLeft, Edit, Delete, FolderOpened, UploadFilled, Box, Document, Download } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useSkillStore, useAuthStore } from '../../stores';
import { getPlatformAdapter } from '@yan-zhi/core';
import type { Skill } from '../../stores/skill';
import SearchToolbar from '../../components/common/SearchToolbar.vue';
import GlassCard from '../../components/common/GlassCard.vue';
import CardGrid from '../../components/common/CardGrid.vue';
import CollapsibleCategory from '../../components/common/CollapsibleCategory.vue';

const store = useSkillStore();
const authStore = useAuthStore();
const search = ref('');

const showEditor = ref(false);
const showPreview = ref(false);
const showImport = ref(false);
const editing = ref<Skill | null>(null);
const previewContent = ref('');
const editor = ref({ name: '', description: '', bodyMd: '' });
const triggersText = ref('');
const importText = ref('');
// 子目录文件（2026-10-06）：预览文件树 + 编辑器子文件管理
interface SkillFile { path: string; content: string }
const previewFiles = ref<SkillFile[]>([]);
const previewActive = ref('SKILL.md');
const previewTitle = ref('Skill 内容');
const editorFiles = ref<SkillFile[]>([]);
const editingFile = ref<number | null>(null);

onMounted(() => store.loadSkills());

const filteredSkills = computed(() => {
  if (!search.value) return store.skills;
  const q = search.value.toLowerCase();
  return store.skills.filter(s =>
    s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q)
  );
});

/** 获取 skill 的分类（兼容本地 sqlite frontmatter.category 和 server 端 category 字段） */
function getSkillCategory(s: Skill): string {
  return (s as any).category || (s.frontmatter as any)?.category || '其他';
}

/** 分类下拉选项（含数量） */
const catFilter = ref('all');
const categoryOptions = computed(() => {
  const map = new Map<string, number>();
  for (const s of store.skills) {
    const cat = getSkillCategory(s);
    map.set(cat, (map.get(cat) || 0) + 1);
  }
  return Array.from(map.entries()).map(([category, count]) => ({ key: category, label: `${category}（${count}）` }));
});

/** 按分类分组（分类名在区块左上角，卡片全铺开、不再折叠），再叠加分类下拉 + 搜索词筛选 */
const groupedSkills = computed(() => {
  const q = search.value;
  const map = new Map<string, Skill[]>();
  for (const s of filteredSkills.value) {
    const cat = getSkillCategory(s);
    if (catFilter.value !== 'all' && cat !== catFilter.value) continue;
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(s);
  }
  return Array.from(map.entries()).map(([category, skills]) => ({ category, skills }));
});

/** 分类折叠状态：默认全展开 */
const collapsedCats = reactive<Record<string, boolean>>({});
function toggleCat(cat: string) { collapsedCats[cat] = !collapsedCats[cat]; }

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
  editorFiles.value = [];
  editingFile.value = null;
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
  editorFiles.value = (s.files || []).map(f => ({ ...f }));
  editingFile.value = null;
  triggersText.value = (s.frontmatter?.triggers || []).join(', ');
  showEditor.value = true;
}

async function saveSkill() {
  if (!editor.value.name) { ElMessage.warning('名称必填'); return; }
  const triggers = triggersText.value.split(',').map(s => s.trim()).filter(Boolean);
  // 过滤无效子文件（无路径/无内容）
  const files = editorFiles.value.filter(f => f.path.trim() && f.content.trim())
    .map(f => ({ path: f.path.trim().replace(/\\/g, '/'), content: f.content }));
  if (editing.value) {
    await store.updateSkill(editing.value.id, {
      description: editor.value.description,
      bodyMd: editor.value.bodyMd,
      triggers,
      files,
    });
    ElMessage.success('已保存');
  } else {
    await store.createCustom(editor.value.name, editor.value.description, editor.value.bodyMd, triggers, files);
    ElMessage.success('已创建');
  }
  showEditor.value = false;
}

function previewSkill(s: Skill) {
  previewTitle.value = s.name;
  const files: SkillFile[] = [{ path: 'SKILL.md', content: store.exportToMd(s) }];
  for (const f of (s.files || [])) files.push({ ...f });
  previewFiles.value = files;
  previewActive.value = 'SKILL.md';
  previewContent.value = files[0].content;
  showPreview.value = true;
}

async function exportSkill(s: Skill) {
  const files = (s.files || []).filter(f => f.path && f.content);
  if (files.length === 0) {
    // 无子目录 → 单文件 .md
    const md = store.exportToMd(s);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${s.name}.md`; a.click();
    URL.revokeObjectURL(url);
    return;
  }
  // 有子目录 → .zip（SKILL.md + 层级文件）
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file('SKILL.md', store.exportToMd(s));
  for (const f of files) zip.file(f.path, f.content);
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${s.name}.zip`; a.click();
  URL.revokeObjectURL(url);
}

async function toggle(id: string, enabled: boolean) {
  await store.toggleEnabled(id, enabled);
}

async function togglePublish(id: string, isPublic: boolean) {
  try {
    await store.togglePublic(id, isPublic);
    ElMessage.success(isPublic ? '已发布到商城' : '已从商城下架');
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}

async function removeSkill(id: string) {
  try {
    await ElMessageBox.confirm('确认删除该 Skill？', '提示', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' });
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

/** 批量导入解析后的 Skill Markdown（文件夹/压缩包共用），返回导入数量 */
async function importSkillTexts(items: { path: string; text: string }[]): Promise<number> {
  let imported = 0;
  const nameSet = new Set(store.skills.map(s => s.name));
  for (const { text } of items) {
    try {
      const parsed = parseSkillMd(text);
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
  return imported;
}

/** 从「条目集」里按目录分组出 skill：每个含 SKILL.md 的目录 = 一个 skill（其余文件为子目录文件）；
 *  根级散装 .md 每个 = 一个独立 skill。返回可导入的 skill 列表（含子文件）。 */
function groupEntriesToSkills(
  entries: { path: string; text: string }[],
): Array<{ name: string; description: string; bodyMd: string; triggers: string[]; files: SkillFile[] }> {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');
  const out: Array<{ name: string; description: string; bodyMd: string; triggers: string[]; files: SkillFile[] }> = [];
  const used = new Set<unknown>();
  // 1) 找所有 SKILL.md
  const skillMdEntries = entries.filter(e => norm(e.path).toLowerCase().endsWith('skill.md'));
  for (const sm of skillMdEntries) {
    const root = norm(sm.path).slice(0, -'SKILL.md'.length).replace(/\/$/, '');
    const parsed = parseSkillMd(sm.text);
    if (!parsed.frontmatter.name) continue;
    const files: SkillFile[] = [];
    for (const e of entries) {
      const np = norm(e.path);
      if (e === sm || used.has(e)) continue;
      if (root === '' ? np.includes('/') : np.startsWith(root + '/')) {
        const rel = root === '' ? np : np.slice(root.length + 1);
        if (rel && !rel.toLowerCase().endsWith('skill.md')) {
          files.push({ path: rel, content: e.text });
          used.add(e);
        }
      }
    }
    used.add(sm);
    out.push({
      name: parsed.frontmatter.name,
      description: parsed.frontmatter.description || '',
      bodyMd: parsed.bodyMd || parsed.body,
      triggers: parsed.frontmatter.triggers || [],
      files,
    });
  }
  // 2) 根级散装 .md（未被分组消费的）
  for (const e of entries) {
    if (used.has(e)) continue;
    const np = norm(e.path);
    if (!np.toLowerCase().endsWith('.md')) continue;
    const parsed = parseSkillMd(e.text);
    if (!parsed.frontmatter.name) continue;
    out.push({
      name: parsed.frontmatter.name,
      description: parsed.frontmatter.description || '',
      bodyMd: parsed.bodyMd || parsed.body,
      triggers: parsed.frontmatter.triggers || [],
      files: [],
    });
    used.add(e);
  }
  return out;
}

/** 批量导入结构化 skill（含子文件），返回导入数量 */
async function importGrouped(
  groups: Array<{ name: string; description: string; bodyMd: string; triggers: string[]; files: SkillFile[] }>,
): Promise<number> {
  let imported = 0;
  const nameSet = new Set(store.skills.map(s => s.name));
  for (const g of groups) {
    if (nameSet.has(g.name)) continue;
    await store.createCustom(g.name, g.description, g.bodyMd, g.triggers, g.files);
    nameSet.add(g.name);
    imported++;
  }
  return imported;
}

async function importFolder() {
  try {
    const adapter = getPlatformAdapter();
    // 文件夹选择：优先 Electron 原生对话框，回退 Tauri
    const w = window as any;
    let path: string | null = null;
    if (w.electronAPI?.dialog?.showOpenDir) {
      path = await w.electronAPI.dialog.showOpenDir({ directory: true, title: '选择 Skill 文件夹' });
    } else if (w.__TAURI__?.dialog?.open) {
      path = await w.__TAURI__.dialog.open({ directory: true, multiple: false, title: '选择 Skill 文件夹' });
    }
    if (!path) return;
    // 递归收集 .md 文件
    const items: { path: string; text: string }[] = [];
    async function scan(dir: string) {
      const entries = await adapter.fs.readDir(dir);
      for (const name of entries) {
        const full = dir + '/' + name;
        try {
          // 是子目录，递归
          await scan(full);
        } catch {
          // 是文件
          if (name.endsWith('.md')) items.push({ path: full, text: await adapter.fs.readFile(full) });
        }
      }
    }
    await scan(path);
    if (items.length === 0) {
      ElMessage.warning('所选文件夹中没有 .md 文件');
      return;
    }
    // 含 SKILL.md 的目录结构 → 按 skill 分组导入（子目录文件随 files 落库）
    const hasSkillMd = items.some(it => it.path.replace(/\\/g, '/').toLowerCase().endsWith('skill.md'));
    if (hasSkillMd) {
      const imported = await importGrouped(groupEntriesToSkills(items));
      if (imported > 0) ElMessage.success(`已从文件夹导入 ${imported} 个 Skill（含子目录文件）`);
      else ElMessage.info('没有可导入的新 Skill（可能是名称重复）');
      return;
    }
    const imported = await importSkillTexts(items);
    if (imported > 0) {
      ElMessage.success(`已从文件夹导入 ${imported} 个 Skill`);
    } else {
      ElMessage.info('没有可导入的新 Skill（可能是名称重复）');
    }
  } catch (e: any) {
    ElMessage.error('文件夹导入仅支持桌面端（需要文件系统权限）');
  }
}

const zipInput = ref<HTMLInputElement | null>(null);

function importZip() {
  zipInput.value?.click();
}

async function onZipFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  // 重置 value，保证同一名文件可重复选择
  input.value = '';
  if (!file) return;
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const items: { path: string; text: string }[] = [];
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      if (!entry.name.toLowerCase().endsWith('.md')) continue;
      // 跳过 macOS 元数据与隐藏文件
      if (entry.name.startsWith('__MACOSX') || /(^|\/)\./.test(entry.name)) continue;
      items.push({ path: entry.name, text: await entry.async('string') });
    }
    if (items.length === 0) {
      ElMessage.warning('压缩包中没有 .md 文件');
      return;
    }
    // 含 SKILL.md 的压缩包结构 → 按 skill 分组导入（子目录文件随 files 落库）
    const hasSkillMd = items.some(it => it.path.replace(/\\/g, '/').toLowerCase().endsWith('skill.md'));
    if (hasSkillMd) {
      const imported = await importGrouped(groupEntriesToSkills(items));
      if (imported > 0) ElMessage.success(`已从压缩包导入 ${imported} 个 Skill（含子目录文件）`);
      else ElMessage.info('没有可导入的新 Skill（可能是名称重复）');
      return;
    }
    const imported = await importSkillTexts(items);
    if (imported > 0) {
      ElMessage.success(`已从压缩包导入 ${imported} 个 Skill`);
    } else {
      ElMessage.info('没有可导入的新 Skill（可能是名称重复）');
    }
  } catch (err: any) {
    ElMessage.error(err?.message || '压缩包解析失败');
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
.lm-title { font-size: 20px; font-weight: 600; margin: 0; }
/* 搜索框 / 分类筛选 / 导入图标按钮的尺寸规范统一在 styles/surface.css：
   .yz-cat-select（筛选下拉）+ .yz-icon-btn（32×32 正圆图标按钮），各管理页共用 */

.skill-groups { display: flex; flex-direction: column; gap: 16px; }
.skill-group { }
.group-header {
  display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;
  padding: 8px 12px; border-radius: var(--radius-md); margin-bottom: 10px;
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  transition: all 0.15s;
}
.group-header:hover { border-color: rgba(124,58,237,0.3); }
.group-arrow { font-size: 14px; color: var(--color-text-secondary); transition: transform 0.2s; }
.group-arrow.collapsed { transform: rotate(0deg); }
.group-arrow:not(.collapsed) { transform: rotate(90deg); }
.group-title { font-size: 15px; font-weight: 600; color: var(--color-text); }
.group-count {
  font-size: 12px; color: var(--color-text-secondary);
  background: rgba(124,58,237,0.08); padding: 2px 8px; border-radius: 10px;
}

/* 分类标签 / 卡片网格 / 玻璃卡片：由 CollapsibleCategory / CardGrid / GlassCard 承载 */
.card-icon { color: var(--color-primary); flex-shrink: 0; }
.card-icon.off { opacity: 0.35; }

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
/* 预览文件树 + 编辑器子文件（2026-10-06 子目录化） */
.preview-layout { display: grid; grid-template-columns: 220px 1fr; gap: 12px; }
.preview-tree { border: 1px solid var(--glass-border); border-radius: 6px; padding: 6px; max-height: 500px; overflow: auto; }
.preview-tree-item {
  display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 4px;
  cursor: pointer; font-size: 13px; color: var(--color-text); word-break: break-all;
}
.preview-tree-item:hover { background: rgba(124,58,237,0.08); }
.preview-tree-item.active { background: rgba(124,58,237,0.15); font-weight: 600; }
.preview-content-pane { min-height: 460px; }
.subfiles { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.subfile-row { display: flex; gap: 6px; align-items: center; }
.subfile-path { flex: 1; }
.subfile-editor { margin-top: 8px; }

/* ===== Mobile ===== */
@media (max-width: 767px) {
  .local-market { padding: 0 !important; width: 100%; }
  .lm-header { flex-direction: column; align-items: stretch; gap: 10px; padding: 14px; }
  .lm-header-left { flex-wrap: wrap; }
  .lm-title { font-size: 18px; }
  /* 卡片网格在 CardGrid 内部：窄屏收成单列并补页面留白 */
  .skill-groups :deep(.cg) { grid-template-columns: minmax(0, 1fr); gap: 10px; width: 100%; padding: 0 14px 14px; box-sizing: border-box; }
  .editor-layout { grid-template-columns: 1fr; gap: 12px; }
  .preview-md { min-height: 180px; max-height: 280px; }
}
</style>
