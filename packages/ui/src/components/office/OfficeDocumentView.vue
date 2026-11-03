<!--
  OfficeDocumentView.vue — 办公三件套只读视图（2026-11-02，P2）

  内容由 /api/office/content 解析（python-docx / openpyxl / python-pptx）：
    · 文档：标题 / 段落 / 表格，A4 纸面观感
    · 表格：多 sheet 切换 + 行列号
    · 演示：16:9 幻灯片卡片（标题 + 正文 + 备注）
  编辑不在本期范围：双击可调用系统 Office 打开（由工作台标题栏提供入口）。
-->
<template>
  <div class="odv" :class="'is-' + kind">
    <div v-if="!path" class="odv-empty">从左侧选择一份文档，或新建文档 / 表格 / 演示</div>
    <div v-else-if="loading" class="odv-empty">正在解析…</div>
    <div v-else-if="error" class="odv-empty">{{ error }}</div>

    <!-- 文档 -->
    <div v-else-if="kind === 'doc'" class="odv-doc-outer">
      <div class="odv-doc-toolbar">
        <template v-if="!editingDoc">
          <el-button size="small" @click="startDocEdit">编辑文字</el-button>
        </template>
        <template v-else>
          <el-button size="small" @click="cancelDocEdit">取消</el-button>
          <el-button size="small" type="primary" :loading="savingDoc" @click="saveDocEdits">保存</el-button>
        </template>
        <span v-if="docError" class="odv-slide-error">{{ docError }}</span>
      </div>
      <div class="odv-doc-wrap">
        <article class="odv-page">
          <template v-for="(b, i) in (editingDoc ? docDraft : docBlocks)" :key="i">
            <template v-if="editingDoc">
              <el-input
                v-if="b.type === 'heading'"
                v-model="b.text"
                size="small"
                class="odv-doc-edit-h"
              />
              <el-input
                v-else-if="b.type === 'paragraph'"
                v-model="b.text"
                type="textarea"
                :autosize="{ minRows: 1, maxRows: 8 }"
                size="small"
                class="odv-doc-edit-p"
              />
              <table v-else-if="b.type === 'table'" class="odv-table">
                <tbody>
                  <tr v-for="(row, r) in b.rows" :key="r">
                    <td v-for="(cell, c) in row" :key="c" :class="{ 'is-head': r === 0 }">
                      <el-input v-model="b.rows[r][c]" size="small" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </template>
            <template v-else>
              <h1 v-if="b.type === 'heading' && b.level === 1" class="odv-h1">{{ b.text }}</h1>
              <h2 v-else-if="b.type === 'heading'" class="odv-h2">{{ b.text }}</h2>
              <p v-else-if="b.type === 'paragraph'" class="odv-p">{{ b.text }}</p>
              <table v-else-if="b.type === 'table'" class="odv-table">
                <tbody>
                  <tr v-for="(row, r) in b.rows" :key="r">
                    <td v-for="(cell, c) in row" :key="c" :class="{ 'is-head': r === 0 }">{{ cell }}</td>
                  </tr>
                </tbody>
              </table>
            </template>
          </template>
          <div v-if="docBlocks.length === 0" class="odv-empty-inline">（空白文档）</div>
        </article>
      </div>
    </div>

    <!-- 表格 -->
    <div v-else-if="kind === 'sheet'" class="odv-sheet-wrap">
      <div class="odv-sheet-tabs">
        <button
          v-for="(s, i) in sheetTabs" :key="s.name"
          type="button" class="odv-sheet-tab" :class="{ on: i === activeSheet }"
          @click="activeSheet = i"
        >{{ s.name }}</button>
      </div>
      <div class="odv-sheet-scroll">
        <table class="odv-sheet" v-if="activeSheetObj">
          <tbody>
            <tr v-for="(row, r) in activeSheetObj.rows" :key="r">
              <td class="odv-gutter">{{ r + 1 }}</td>
              <td v-for="(cell, c) in row" :key="c" :class="{ 'is-num': typeof cell === 'number' }">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="activeSheetObj && activeSheetObj.rows.length === 0" class="odv-empty-inline">（空表）</div>
        <div v-if="activeSheetObj?.truncated" class="odv-trunc">表格较大，仅显示前 400 行 / 40 列</div>
      </div>
    </div>

    <!-- 演示 -->
    <div v-else-if="kind === 'slides'" class="odv-slides-wrap">
      <div class="odv-slide-toolbar">
        <template v-if="!editingSlides">
          <el-button size="small" @click="startSlideEdit">编辑文字</el-button>
        </template>
        <template v-else>
          <el-button size="small" @click="cancelSlideEdit">取消</el-button>
          <el-button size="small" type="primary" :loading="savingSlides" @click="saveSlideEdits">保存</el-button>
        </template>
        <span v-if="slideError" class="odv-slide-error">{{ slideError }}</span>
      </div>
      <section v-for="s in slides" :key="s.index" class="odv-slide">
        <div class="odv-slide-no">第 {{ s.index }} 页</div>
        <h3 class="odv-slide-title">{{ s.title || '（无标题）' }}</h3>
        <template v-if="editingSlides">
          <div v-for="st in s.shapeTexts" :key="st.shape" class="odv-slide-edit-row">
            <el-input v-model="st.text" type="textarea" :rows="2" size="small" />
          </div>
        </template>
        <template v-else>
          <p v-for="(t, i) in s.texts" :key="i" class="odv-slide-text">{{ t }}</p>
          <div v-if="s.notes" class="odv-slide-notes">备注：{{ s.notes }}</div>
        </template>
      </section>
      <div v-if="slides.length === 0" class="odv-empty-inline">（空演示）</div>
    </div>

    <!-- Markdown：直接渲染（工作区里最常见的说明/术语文档） -->
    <div v-else-if="kind === 'md'" class="odv-md-wrap">
      <article class="odv-markdown" v-html="renderedMd"></article>
    </div>

    <!-- 纯文本：等宽展示，保留换行 -->
    <div v-else-if="kind === 'text'" class="odv-text-wrap">
      <pre class="odv-text">{{ textContent }}</pre>
    </div>

    <div v-else class="odv-empty">暂不支持预览该格式，请用本机 Office 打开。</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from '../../api/client';
import { useChat } from '../../composables/chat/useChat';

type DocBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'table'; rows: string[][] };
interface Sheet { name: string; rows: Array<Array<string | number>>; truncated?: boolean }
interface Slide { index: number; title: string; texts: string[]; notes: string; shapeTexts?: Array<{ shape: number; text: string }> }

const props = defineProps<{ path: string }>();

const loading = ref(false);
const error = ref('');
const kind = ref<'doc' | 'sheet' | 'slides' | 'md' | 'text' | 'unknown'>('unknown');
const docBlocks = ref<DocBlock[]>([]);
const sheetTabs = ref<Sheet[]>([]);
const activeSheet = ref(0);
const slides = ref<Slide[]>([]);
const textContent = ref('');
const editingSlides = ref(false);
const savingSlides = ref(false);
const slideError = ref('');

// ===== docx 文字编辑（标题 / 段落 / 表格单元格）=====
const editingDoc = ref(false);
const savingDoc = ref(false);
const docError = ref('');
const docDraft = ref<DocBlock[]>([]);

function startDocEdit() {
  // 深拷贝成草稿：取消时直接丢弃，不动已渲染的原内容
  docDraft.value = JSON.parse(JSON.stringify(docBlocks.value)) as DocBlock[];
  editingDoc.value = true;
  docError.value = '';
}
function cancelDocEdit() {
  editingDoc.value = false;
  docError.value = '';
  docDraft.value = [];
}
async function saveDocEdits() {
  if (!props.path) return;
  savingDoc.value = true;
  docError.value = '';
  try {
    const blocks = docDraft.value.map((b) =>
      b.type === 'table' ? { type: 'table', rows: b.rows } : { type: b.type, text: b.text },
    );
    const r = await api.post('/office/save', { path: props.path, blocks });
    if (!('data' in r)) { docError.value = r.error || '保存失败'; return; }
    editingDoc.value = false;
    docDraft.value = [];
    await load();
  } catch (e: any) {
    docError.value = e?.message || '保存失败';
  } finally {
    savingDoc.value = false;
  }
}

function startSlideEdit() {
  editingSlides.value = true;
  slideError.value = '';
}
function cancelSlideEdit() {
  editingSlides.value = false;
  void load();
}
async function saveSlideEdits() {
  if (!props.path) return;
  savingSlides.value = true;
  slideError.value = '';
  try {
    const payload = slides.value.map((s) => ({
      index: s.index,
      shapes: (s.shapeTexts || []).map((t) => ({ shape: t.shape, text: t.text })),
    }));
    const r = await api.post('/office/save', { path: props.path, slides: payload });
    if (!('data' in r)) { slideError.value = r.error || '保存失败'; return; }
    editingSlides.value = false;
    await load();
  } catch (e: any) {
    slideError.value = e?.message || '保存失败';
  } finally {
    savingSlides.value = false;
  }
}

const { renderMarkdown } = useChat();
const renderedMd = computed(() => (textContent.value ? renderMarkdown(textContent.value) : ''));

const OFFICE_EXT = new Set(['.docx', '.xlsx', '.xlsm', '.pptx']);
const MD_EXT = new Set(['.md', '.markdown']);
const TEXT_EXT = new Set([
  '.txt', '.log', '.json', '.yaml', '.yml', '.csv', '.tsv', '.ini', '.env',
  '.ts', '.js', '.mjs', '.cjs', '.py', '.sh', '.css', '.html', '.xml', '.sql', '.toml',
]);

const activeSheetObj = computed(() => sheetTabs.value[activeSheet.value] || null);

function extOf(p: string): string {
  const i = p.lastIndexOf('.');
  return i >= 0 ? p.slice(i).toLowerCase() : '';
}

async function load() {
  if (!props.path) return;
  loading.value = true;
  error.value = '';
  editingDoc.value = false;
  docDraft.value = [];
  docError.value = '';
  editingSlides.value = false;
  slideError.value = '';
  docBlocks.value = [];
  sheetTabs.value = [];
  slides.value = [];
  activeSheet.value = 0;
  try {
    const r = await api.get<any>(`/office/content?path=${encodeURIComponent(props.path)}`);
    if (!('data' in r)) {
      error.value = r.error || '解析失败';
      kind.value = 'unknown';
      return;
    }
    const d = r.data;
    kind.value = d?.kind || 'unknown';
    if (d?.kind === 'doc') docBlocks.value = d.blocks || [];
    else if (d?.kind === 'sheet') sheetTabs.value = d.sheets || [];
    else if (d?.kind === 'slides') slides.value = d.slides || [];
  } catch (e: any) {
    error.value = e?.message || '解析失败';
  } finally {
    loading.value = false;
  }
}

watch(() => props.path, load, { immediate: true });
defineExpose({ load, ext: () => extOf(props.path) });
</script>

<style scoped>
.odv { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.odv-empty {
  flex: 1; display: grid; place-items: center;
  font-size: 13px; color: var(--color-text-tertiary); padding: 24px; text-align: center;
}
.odv-empty-inline { padding: 24px; text-align: center; font-size: 13px; color: var(--color-text-tertiary); }

/* ===== 文档：A4 纸面 ===== */
.odv-doc-outer { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.odv-doc-toolbar {
  flex: 0 0 auto;
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-bottom: 1px solid var(--color-border);
}
.odv-doc-edit-h { display: block; margin: 6px 0; }
.odv-doc-edit-p { display: block; margin: 4px 0; }
.odv-doc-wrap { flex: 1; min-height: 0; overflow: auto; background: var(--color-bg); padding: 26px 40px 60px; display: flex; justify-content: center; }
.odv-page {
  width: min(720px, 100%); min-height: 900px; padding: 54px 64px;
  background: var(--color-surface);
  border: 1px solid var(--color-border); border-radius: 4px;
  box-shadow: 0 2px 10px rgba(20, 23, 30, 0.06);
}
.odv-h1 { font-size: 22px; margin: 0 0 12px; font-weight: 700; color: var(--color-text); }
.odv-h2 { font-size: 15px; margin: 24px 0 8px; color: var(--color-text); }
.odv-p { font-size: 13.5px; line-height: 1.8; color: var(--color-text-secondary); margin: 0 0 10px; white-space: pre-wrap; }
.odv-table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 12.5px; }
.odv-table td { border-bottom: 1px solid var(--color-border); padding: 9px 12px; text-align: left; color: var(--color-text-secondary); }
.odv-table td.is-head { background: var(--color-bg); color: var(--color-text-tertiary); font-size: 11px; font-weight: 600; }

/* ===== 表格 ===== */
.odv-sheet-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.odv-sheet-tabs { flex: 0 0 auto; display: flex; gap: 2px; padding: 6px 10px 0; border-bottom: 1px solid var(--color-border); overflow-x: auto; }
.odv-sheet-tab {
  border: none; background: transparent; padding: 6px 12px; border-radius: 6px 6px 0 0;
  font-size: 12px; color: var(--color-text-secondary); cursor: pointer; white-space: nowrap;
}
.odv-sheet-tab:hover { background: var(--glass-bg-hover); }
.odv-sheet-tab.on { background: var(--color-surface); color: var(--color-primary); font-weight: 600; box-shadow: inset 0 -2px 0 var(--color-primary); }
.odv-sheet-scroll { flex: 1; min-height: 0; overflow: auto; }
.odv-sheet { border-collapse: collapse; font-size: 12px; min-width: 100%; }
.odv-sheet td {
  border: 1px solid var(--color-border); padding: 5px 10px; min-width: 70px;
  color: var(--color-text-secondary); white-space: nowrap;
}
.odv-sheet td.is-num { text-align: right; font-variant-numeric: tabular-nums; }
.odv-sheet td.odv-gutter {
  min-width: 34px; width: 34px; text-align: center; color: var(--color-text-tertiary);
  background: var(--color-bg); font-size: 10px; position: sticky; left: 0;
}
.odv-trunc { padding: 8px 12px; font-size: 11px; color: var(--color-text-tertiary); }

/* ===== 演示 ===== */
.odv-slides-wrap {
  flex: 1; min-height: 0; overflow: auto; padding: 22px;
  display: flex; flex-direction: column; gap: 18px; align-items: center;
  background: var(--color-bg);
}
.odv-slide-toolbar {
  width: min(760px, 100%);
  display: flex; align-items: center; gap: 8px;
}
.odv-slide-error { font-size: 12px; color: var(--color-danger); }
.odv-slide-edit-row { width: 100%; }
.odv-slide {
  width: min(760px, 100%); aspect-ratio: 16 / 9; padding: 34px 44px;
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 8px;
  box-shadow: 0 4px 16px rgba(20, 23, 30, 0.07);
  display: flex; flex-direction: column; gap: 10px; overflow: hidden;
}
.odv-slide-no { font-size: 11px; color: var(--color-text-tertiary); }
.odv-slide-title { font-size: 22px; font-weight: 700; margin: 0; color: var(--color-text); }
.odv-slide-text { font-size: 13.5px; line-height: 1.7; color: var(--color-text-secondary); margin: 0; white-space: pre-wrap; }
.odv-slide-notes { margin-top: auto; padding-top: 10px; border-top: 1px dashed var(--color-border); font-size: 11.5px; color: var(--color-text-tertiary); white-space: pre-wrap; }

@media (max-width: 900px) {
  .odv-doc-wrap { padding: 14px; }
  .odv-page { padding: 26px 20px; min-height: 0; }
  .odv-slide { padding: 18px 20px; aspect-ratio: auto; }
}
</style>
