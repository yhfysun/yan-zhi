<template>
  <div ref="rootRef" class="file-preview">
    <!-- 元信息条：文件名 + 类型徽章 + 大小 -->
    <div v-if="!loading && !error" class="fp-meta">
      <span class="fp-meta-name" :title="file.path">{{ file.name }}</span>
      <span class="fp-meta-badge">{{ kindBadge }}</span>
      <span class="fp-meta-size">{{ humanSize }}<template v-if="truncated"> · 文件过大，已截断</template></span>
      <el-button size="small" text bg title="在文件管理器中显示此文件" @click="openContainingFolder">
        <el-icon><FolderOpened /></el-icon>&nbsp;目录
      </el-button>
      <!-- Markdown：阅读 / 编辑 / 分屏（左源码右实时预览）三态 -->
      <div v-if="isMdText" class="fp-seg">
        <button :class="{ on: mdMode === 'read' }" @click="switchMdMode('read')">阅读</button>
        <button :class="{ on: mdMode === 'edit' }" @click="switchMdMode('edit')">编辑</button>
        <button :class="{ on: mdMode === 'split' }" @click="switchMdMode('split')">分屏</button>
      </div>
      <!-- 非文本类之外的纯文本：直接切换编辑 -->
      <template v-else-if="canEdit">
        <el-button v-if="!editing" size="small" text bg @click="startEdit">
          <el-icon><EditPen /></el-icon>&nbsp;编辑
        </el-button>
        <template v-else>
          <el-button size="small" :disabled="!canUndo || saving" :title="undoTitle" @click="undoSave">撤回</el-button>
          <el-button size="small" :disabled="!canRedo || saving" :title="redoTitle" @click="redoSave">重做</el-button>
          <el-button size="small" :disabled="saving" @click="cancelEdit">取消</el-button>
          <el-button size="small" type="primary" :loading="saving" @click="saveEdit">保存</el-button>
        </template>
      </template>
      <!-- MD 编辑/分屏态的操作按钮 -->
      <template v-if="isMdText && mdMode !== 'read'">
        <el-button size="small" :disabled="!canUndo || saving" :title="undoTitle" @click="undoSave">撤回</el-button>
        <el-button size="small" :disabled="!canRedo || saving" :title="redoTitle" @click="redoSave">重做</el-button>
        <el-button size="small" :disabled="saving" @click="cancelEdit">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="saveEdit">保存</el-button>
      </template>
      <!-- Excel：双击单元格改值，保存写回 .xlsx -->
      <template v-if="kind === 'excel'">
        <span v-if="xlsPreviewOnly" class="fp-dirty-hint">旧版 .xls 仅支持预览，编辑请另存为 .xlsx</span>
        <template v-else>
          <span v-if="excelEditsCount" class="fp-dirty-hint">{{ excelEditsCount }} 处未保存</span>
          <el-button size="small" type="primary" :loading="excelSaving" :disabled="!excelEditsCount" @click="saveExcel">保存</el-button>
        </template>
        <el-button v-if="xlsPreviewOnly" size="small" text bg @click="openWithSystemApp">本机打开</el-button>
      </template>
    </div>
    <div v-if="loading" class="fp-loading">读取中...</div>
    <div v-else-if="error" class="fp-error">{{ error }}</div>
    <template v-else>
      <!-- 图片 -->
      <div v-if="kind === 'image'" class="fp-image-wrap">
        <img :src="imageSrc" :alt="file.name" class="fp-image" />
      </div>
      <!-- PDF：高保真栅格图（pdf.js 客户端渲染）优先；无图时降级为分页文本 -->
      <div v-else-if="kind === 'pdf'" class="fp-pdf-pages">
        <template v-if="pdfImages.length">
          <div v-for="(img, i) in pdfImages" :key="'img' + i" class="fp-pdf-page">
            <div class="fp-pdf-page-tag">第 {{ i + 1 }} / {{ pdfTotal }} 页</div>
            <img :src="'data:image/png;base64,' + img" :alt="'PDF 第 ' + (i + 1) + ' 页'" class="fp-pdf-page-img" />
          </div>
          <div v-if="pdfNote" class="fp-pdf-note">{{ pdfNote }}</div>
        </template>
        <template v-else>
          <div v-for="(p, i) in pdfPages" :key="'txt' + i" class="fp-pdf-page">
            <div class="fp-pdf-page-tag">第 {{ i + 1 }} / {{ pdfTotal }} 页</div>
            <pre class="fp-pdf-page-text">{{ p || '（本页无可提取文本，可能是扫描件/图片页，建议用浏览器/Adobe 打开）' }}</pre>
          </div>
        </template>
      </div>
      <!-- Excel：工作表 tab + 带样式表格（字体/颜色/对齐/合并单元格/列宽） -->
      <template v-else-if="kind === 'excel'">
        <div class="fp-sheet-tabs">
          <button
            v-for="(s, i) in excelRender"
            :key="s.name"
            class="fp-sheet-tab"
            :class="{ active: i === activeSheet }"
            @click="activeSheet = i"
          >{{ s.name }}</button>
        </div>
        <div class="fp-table-wrap">
          <table v-if="activeSheetObj" class="fp-xlsx">
            <colgroup>
              <col class="fp-xlsx-gutter" :style="{ width: '38px' }" />
              <col v-for="(w, i) in activeSheetObj.colWidths" :key="i" :style="{ width: colW(activeSheet, i) + 'px' }" />
            </colgroup>
            <tbody>
              <!-- 列标行（A/B/C…），拖拽单元格右缘调列宽 -->
              <tr class="fp-xlsx-colhead-row">
                <td class="fp-xlsx-gutter"></td>
                <td v-for="(w, i) in activeSheetObj.colWidths" :key="'ch' + i" class="fp-xlsx-colhead">
                  <span>{{ colLetter(i) }}</span>
                  <span class="fp-col-grip" @mousedown.stop.prevent="onGripDown($event, i)"></span>
                </td>
              </tr>
              <tr v-for="(row, r) in activeSheetObj.rows" :key="r" :class="{ 'fp-xlsx-head': r === 0 }">
                <td class="fp-xlsx-gutter fp-xlsx-rownum">{{ r + 1 }}</td>
                <td
                  v-for="cell in row"
                  :key="cell.ci"
                  :rowspan="cell.span.rs > 1 ? cell.span.rs : undefined"
                  :colspan="cell.span.cs > 1 ? cell.span.cs : undefined"
                  :style="cellStyle(cell.s)"
                  :class="{ 'fp-cell-edited': excelDirty[`${activeSheet}:${r}:${cell.ci}`] }"
                  @dblclick="beginCellEdit"
                  @blur="commitCellEdit($event, r, cell.ci, cell.v)"
                  @keydown="onCellKeydown($event, r, cell.ci, cell.v)"
                >{{ cellText(activeSheet, r, cell.ci, cell.v) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="activeSheetObj?.truncated" class="fp-hint fp-table-hint">超过 500 行，仅显示前 500 行</div>
        </div>
      </template>
      <!-- Word（.docx/.doc）：不做内嵌预览，走二进制「暂不支持 + 本机应用打开」 -->
      <!-- CSV 表格化（首行为表头，>1000 行截断） -->
      <div v-else-if="kind === 'csv'" class="fp-table-wrap">
        <table class="fp-table">
          <thead><tr><th v-for="(c, i) in csvRows[0]" :key="'h' + i">{{ c }}</th></tr></thead>
          <tbody>
            <tr v-for="(row, r) in csvBodyRows" :key="r">
              <td v-for="(c, i) in row" :key="i">{{ c }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="csvTruncated" class="fp-hint fp-table-hint">超过 1000 行，仅显示前 1000 行</div>
      </div>
      <!-- MD 编辑模式：整屏源码（Ctrl+S 保存） -->
      <div v-else-if="isMdText && mdMode === 'edit'" class="fp-edit-wrap">
        <textarea v-model="editContent" class="fp-editor" spellcheck="false" @keydown="onEditorKeydown"></textarea>
      </div>
      <!-- MD 分屏模式：左侧源码 + 右侧实时渲染预览 -->
      <div v-else-if="isMdText && mdMode === 'split'" class="fp-split">
        <textarea v-model="editContent" class="fp-editor" spellcheck="false" @keydown="onEditorKeydown"></textarea>
        <div class="fp-text fp-split-preview" @click="onContentClick" v-html="renderedEditMd"></div>
      </div>
      <!-- 编辑模式：纯文本编辑（Ctrl+S 保存） -->
      <div v-else-if="editing" class="fp-edit-wrap">
        <textarea v-model="editContent" class="fp-editor" spellcheck="false" @keydown="onEditorKeydown"></textarea>
      </div>
      <!-- Markdown / 纯文本（代码块带复制按钮） -->
      <div v-else-if="kind === 'text' && isMd" class="fp-text" @click="onContentClick" v-html="renderedMd"></div>
      <!-- 代码 / JSON：行号列 + 高亮 -->
      <div v-else-if="kind === 'text'" class="fp-code-wrap" @click="onContentClick">
        <div class="fp-lns">{{ lineNos }}</div>
        <pre class="hljs fp-code"><code v-html="renderedCode"></code></pre>
      </div>
      <!-- 暂不支持：二进制/未知格式，干净提示 + 本机应用打开 + 下载 -->
      <div v-else class="fp-binary">
        <el-icon :size="40"><Document /></el-icon>
        <p>{{ file.name }}</p>
        <p class="fp-hint">{{ humanSize }}<template v-if="fileMtime"> · 修改于 {{ fileMtime }}</template></p>
        <p class="fp-hint fp-binary-path" :title="file.path">{{ file.path }}</p>
        <p class="fp-hint">{{ unsupportedNote || '暂不支持预览' }}</p>
        <div class="fp-binary-actions">
          <el-button size="small" type="primary" @click="openWithSystemApp">用本机应用打开</el-button>
          <el-button size="small" @click="openContainingFolder">打开目录</el-button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Document, EditPen, FolderOpened } from '@element-plus/icons-vue';
import { extractPdfPages } from '@yan-zhi/core';
import { renderPdfToImages } from '../utils/pdf-render';
import { parseExcelStyled, type ExcelStyledSheet } from '../utils/excel-styled';

const props = defineProps<{ file: { name: string; path: string } }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const loading = ref(true);
const error = ref('');
const content = ref('');
const truncated = ref(false);
const imageSrc = ref('');
const kind = ref<'image' | 'pdf' | 'excel' | 'text' | 'csv' | 'binary'>('text');
const byteSize = ref(0);
const unsupportedNote = ref('');
/** 文件修改时间（stat 可用时显示） */
const fileMtime = ref('');
// PDF 分页文本（pdf.js 不可用时的降级）
const pdfPages = ref<string[]>([]);
// PDF 高保真栅格图（pdf.js 客户端渲染，真实版式/图片）
const pdfImages = ref<string[]>([]);
const pdfTotal = ref(0);
const pdfNote = ref('');
// Excel 工作表（带样式）
const excelSheets = ref<ExcelStyledSheet[]>([]);
const activeSheet = ref(0);
// ===== Excel 编辑：列宽拖拽 + 单元格改值（保存经 exceljs 写回）=====
const excelSourceB64 = ref('');
const excelWidths = ref<Record<number, number[]>>({});
const excelDirty = ref<Record<string, { r: number; c: number; v: string }>>({});
const excelSaving = ref(false);
const excelEditsCount = computed(() => Object.keys(excelDirty.value).length);
/** 旧版 .xls：仅预览（写回会产生 xlsx 字节伪装成 .xls，禁止编辑） */
const xlsPreviewOnly = ref(false);

function u8ToB64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
/** SheetJS 读取 .xls（BIFF）→ 写出 .xlsx，返回 base64 供 parseExcelStyled 使用 */
async function convertXlsToXlsx(b64: string): Promise<string> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(b64, { type: 'base64' });
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return u8ToB64(new Uint8Array(out as ArrayBuffer));
}

/** 0 基列号 → Excel 列标（A/B/…/Z/AA…） */
function colLetter(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
/** 当前列宽（优先用户拖拽值） */
function colW(sheetIdx: number, col: number): number {
  const arr = excelWidths.value[sheetIdx];
  if (arr && arr[col] != null) return arr[col];
  return excelRender.value[sheetIdx]?.colWidths[col] ?? 80;
}
function ensureWidths(sheetIdx: number): number[] {
  if (!excelWidths.value[sheetIdx]) {
    excelWidths.value[sheetIdx] = (excelRender.value[sheetIdx]?.colWidths ?? []).map((w) => w);
  }
  return excelWidths.value[sheetIdx];
}
let gripDrag: { col: number; startX: number; startW: number } | null = null;
function onGripDown(e: MouseEvent, col: number) {
  gripDrag = { col, startX: e.clientX, startW: colW(activeSheet.value, col) };
  document.addEventListener('mousemove', onGripMove);
  document.addEventListener('mouseup', onGripUp);
}
function onGripMove(e: MouseEvent) {
  if (!gripDrag) return;
  ensureWidths(activeSheet.value)[gripDrag.col] = Math.max(40, gripDrag.startW + e.clientX - gripDrag.startX);
}
function onGripUp() {
  gripDrag = null;
  document.removeEventListener('mousemove', onGripMove);
  document.removeEventListener('mouseup', onGripUp);
}
/** 双击单元格进入编辑 */
function beginCellEdit(e: MouseEvent) {
  const td = e.currentTarget as HTMLElement;
  td.contentEditable = 'plaintext-only';
  td.focus();
  const range = document.createRange();
  range.selectNodeContents(td);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}
function onCellKeydown(e: KeyboardEvent, r: number, c: number, orig: string) {
  const td = e.currentTarget as HTMLElement;
  if (e.key === 'Enter') { e.preventDefault(); td.blur(); }
  else if (e.key === 'Escape') {
    const key = `${activeSheet.value}:${r}:${c}`;
    td.textContent = excelDirty.value[key]?.v ?? orig;
    td.contentEditable = 'false';
    td.blur();
  }
}
function commitCellEdit(e: FocusEvent, r: number, c: number, orig: string) {
  const td = e.target as HTMLElement;
  td.contentEditable = 'false';
  const val = (td.textContent ?? '').replace(/\u00a0/g, ' ');
  const key = `${activeSheet.value}:${r}:${c}`;
  const prev = excelDirty.value[key]?.v ?? orig;
  if (val === prev) return;
  excelDirty.value[key] = { r, c, v: val };
}
/** 脏单元格覆盖显示 */
function cellText(sheetIdx: number, r: number, c: number, orig: string): string {
  return excelDirty.value[`${sheetIdx}:${r}:${c}`]?.v ?? orig;
}
async function saveExcel() {
  const edits = Object.entries(excelDirty.value).map(([key, d]) => ({
    sheet: Number(key.split(':')[0]),
    r: d.r,
    c: d.c,
    v: d.v,
  }));
  if (!edits.length || excelSaving.value) return;
  excelSaving.value = true;
  try {
    const { applyExcelEdits } = await import('../utils/excel-styled');
    const newB64 = await applyExcelEdits(excelSourceB64.value, edits);
    const { getPlatformAdapter } = await import('@yan-zhi/core');
    await getPlatformAdapter().fs.writeFileBase64(props.file.path, newB64);
    excelDirty.value = {};
    ElMessage.success('已保存');
    loadFile();
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e?.message || e));
  } finally {
    excelSaving.value = false;
  }
}
// ===== 本机应用打开（桌面端 shell.openPath；Web 端提示下载）=====
async function openWithSystemApp() {
  try {
    const api = (window as unknown as { electronAPI?: { shell?: { openPath?: (p: string) => Promise<unknown> } } }).electronAPI;
    if (api?.shell?.openPath) {
      await api.shell.openPath(props.file.path);
    } else {
      ElMessage.info('内嵌预览暂不支持该格式，桌面端可用本机应用打开');
    }
  } catch (e: any) {
    ElMessage.error('打开失败: ' + (e?.message || e));
  }
}

/** 在文件管理器中定位文件（桌面端；Web 端不支持） */
async function openContainingFolder() {
  try {
    const api = (window as unknown as { electronAPI?: { shell?: { showItemInFolder?: (p: string) => Promise<unknown> } } }).electronAPI;
    if (api?.shell?.showItemInFolder) {
      await api.shell.showItemInFolder(props.file.path);
    } else {
      ElMessage.info('仅桌面端支持打开文件目录');
    }
  } catch (e: any) {
    ElMessage.error('打开目录失败: ' + (e?.message || e));
  }
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(str: string, lang: string): string {
    const code = lang && hljs.getLanguage(lang)
      ? hljs.highlight(str, { language: lang }).value
      : md.utils.escapeHtml(str);
    // 代码块右上角复制按钮（事件委托在 onContentClick 处理）
    return `<pre class="hljs fp-pre"><button class="fp-copy-btn" data-code="${encodeURIComponent(str)}">复制</button><code>${code}</code></pre>`;
  },
});

const ext = computed(() => props.file.name.split('.').pop()?.toLowerCase() || '');
const isMd = computed(() => ['md', 'markdown', 'txt'].includes(ext.value) || !ext.value);

// ===== 编辑模式（仅限未截断的文本类文件）=====
const editing = ref(false);
const editContent = ref('');
const saving = ref(false);
const canEdit = computed(() => kind.value === 'text' && !isMd.value && !truncated.value);
/** Markdown 三态：阅读 / 编辑（整屏源码）/ 分屏（左源码右实时预览） */
type MdViewMode = 'read' | 'edit' | 'split';
const mdMode = ref<MdViewMode>('read');
const isMdText = computed(() => kind.value === 'text' && isMd.value && !truncated.value);
/** 分屏/编辑态的实时渲染：直接渲染编辑内容，边写边看 */
const renderedEditMd = computed(() => md.render(editContent.value || ''));

async function switchMdMode(m: MdViewMode) {
  if (m === mdMode.value) return;
  if (mdMode.value !== 'read' && editContent.value !== content.value) {
    try {
      await ElMessageBox.confirm('有未保存的修改，确定放弃？', '提示', { type: 'warning' });
    } catch { /* 留在当前模式 */ return; }
    editContent.value = content.value;
  }
  if (m !== 'read') editContent.value = content.value;
  mdMode.value = m;
}

function startEdit() {
  editContent.value = content.value;
  editing.value = true;
}

async function cancelEdit() {
  if (editContent.value !== content.value) {
    try {
      await ElMessageBox.confirm('有未保存的修改，确定放弃？', '提示', { type: 'warning' });
    } catch { /* 取消放弃 */ }
  }
  editContent.value = content.value;
  editing.value = false;
  if (isMdText.value) mdMode.value = 'read';
}

async function saveEdit() {
  saving.value = true;
  try {
    const { getPlatformAdapter } = await import('@yan-zhi/core');
    await getPlatformAdapter().fs.writeFile(props.file.path, editContent.value);
    recordSnapshot();
    content.value = editContent.value;
    byteSize.value = new Blob([editContent.value]).size;
    editing.value = false;
    ElMessage.success('已保存');
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e?.message || e));
  } finally {
    saving.value = false;
  }
}

/** 编辑器内 Ctrl/Cmd+S 保存 */
function onEditorKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (!saving.value) saveEdit();
  }
}

// ===== 保存历史：可前（重做）后（撤回）切换，最多 30 步 =====
const MAX_SNAPSHOTS = 30;
const rootRef = ref<HTMLElement | null>(null);
/** 快照时间线：[0] 为本次加载基线，其后每次保存追加一个状态 */
const snapshots = ref<string[]>([]);
const snapIdx = ref(0);
const canUndo = computed(() => snapIdx.value > 0);
const canRedo = computed(() => snapIdx.value >= 0 && snapIdx.value < snapshots.value.length - 1);
const undoTitle = computed(() => canUndo.value ? `撤回到第 ${snapIdx.value} 步（已保存 ${snapshots.value.length - 1} 次）` : '没有更早的版本');
const redoTitle = computed(() => canRedo.value ? `重做到第 ${snapIdx.value + 2} 步` : '没有可重做的版本');

/** 保存成功后记录快照；处于回退态时丢弃其后可重做分支 */
function recordSnapshot() {
  if (snapIdx.value < snapshots.value.length - 1) {
    snapshots.value = snapshots.value.slice(0, snapIdx.value + 1);
  }
  snapshots.value.push(editContent.value);
  if (snapshots.value.length > MAX_SNAPSHOTS) snapshots.value.shift();
  snapIdx.value = snapshots.value.length - 1;
}

/** 沿时间线前后移动：写回目标版本到磁盘并同步编辑器 */
async function restoreSnapshot(dir: -1 | 1) {
  const next = snapIdx.value + dir;
  if (next < 0 || next >= snapshots.value.length || saving.value) return;
  saving.value = true;
  try {
    const target = snapshots.value[next];
    const { getPlatformAdapter } = await import('@yan-zhi/core');
    await getPlatformAdapter().fs.writeFile(props.file.path, target);
    snapIdx.value = next;
    content.value = target;
    editContent.value = target;
    byteSize.value = new Blob([target]).size;
    ElMessage.success(dir < 0 ? '已撤回上一版本' : '已重做');
  } catch (e: any) {
    ElMessage.error((dir < 0 ? '撤回失败: ' : '重做失败: ') + (e?.message || e));
  } finally {
    saving.value = false;
  }
}
const undoSave = () => restoreSnapshot(-1);
const redoSave = () => restoreSnapshot(1);

/** 全局 Ctrl/Cmd+S：编辑态下即使焦点不在文本框也能保存（仅当前激活 tab 生效） */
function onGlobalKeydown(e: KeyboardEvent) {
  if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's')) return;
  const inEdit = editing.value || (isMdText.value && mdMode.value !== 'read');
  if (!inEdit || saving.value) return;
  const el = rootRef.value;
  if (!el || el.offsetParent === null) return; // 本实例非激活 tab（v-show 隐藏）
  e.preventDefault();
  e.stopPropagation();
  saveEdit();
}
onMounted(() => document.addEventListener('keydown', onGlobalKeydown, true));
onBeforeUnmount(() => document.removeEventListener('keydown', onGlobalKeydown, true));

const kindBadge = computed(() => {
  switch (kind.value) {
    case 'image': return '图片';
    case 'pdf': return 'PDF';
    case 'excel': return 'Excel';
    case 'csv': return 'CSV';
    case 'binary': return '二进制';
    default: return isMd.value ? 'Markdown' : (ext.value.toUpperCase() || '文本');
  }
});

const humanSize = computed(() => {
  const bytes = byteSize.value || new Blob([content.value]).size;
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
});

const renderedMd = computed(() => (kind.value === 'text' && isMd.value ? md.render(content.value) : ''));

/** 代码视图：高亮（不认识的扩展名按纯文本转义） */
const renderedCode = computed(() => {
  if (kind.value !== 'text' || isMd.value) return '';
  if (ext.value && hljs.getLanguage(ext.value)) {
    return hljs.highlight(content.value, { language: ext.value }).value;
  }
  return md.utils.escapeHtml(content.value);
});

/** 行号列：纯文本节点（大文件几十万行也不会生成几十万个 DOM 节点） */
const lineNos = computed(() => {
  if (kind.value !== 'text' || isMd.value) return '';
  const n = content.value.split('\n').length;
  const parts: string[] = [];
  for (let i = 1; i <= n; i++) parts.push(String(i));
  return parts.join('\n');
});

// ===== Excel 工作表（带样式）=====
// 预先把合并单元格展开：被覆盖的格子从渲染数组剔除，左上角格子带 rowspan/colspan
interface RenderCell {
  v: string;
  /** 原始列号（0 基；合并单元格渲染压缩后仍指向真实列） */
  ci: number;
  s: import('../utils/excel-styled').CellStyle;
  span: { rs: number; cs: number };
}
interface RenderSheet {
  name: string;
  truncated: boolean;
  colWidths: number[];
  rows: RenderCell[][];
}
const excelRender = computed<RenderSheet[]>(() => {
  return excelSheets.value.map((sheet) => {
    const covered = new Set<string>();
    const spanMap = new Map<string, { rs: number; cs: number }>();
    for (const m of sheet.merges) {
      for (let r = m.r; r < m.r + m.rs; r++) {
        for (let c = m.c; c < m.c + m.cs; c++) {
          if (r === m.r && c === m.c) spanMap.set(`${r},${c}`, { rs: m.rs, cs: m.cs });
          else covered.add(`${r},${c}`);
        }
      }
    }
    const rows: RenderCell[][] = sheet.cells.map((row, r) => {
      const out: RenderCell[] = [];
      row.forEach((cell, c) => {
        if (covered.has(`${r},${c}`)) return;
        out.push({ v: cell.v, ci: c, s: cell.s, span: spanMap.get(`${r},${c}`) || { rs: 1, cs: 1 } });
      });
      return out;
    });
    return { name: sheet.name, truncated: sheet.truncated, colWidths: sheet.colWidths, rows };
  });
});
const activeSheetObj = computed<RenderSheet | undefined>(() => excelRender.value[activeSheet.value]);

function cellStyle(s: RenderCell['s']): Record<string, string> {
  const st: Record<string, string> = {};
  if (s.bold) st.fontWeight = '700';
  if (s.italic) st.fontStyle = 'italic';
  if (s.underline) st.textDecoration = 'underline';
  if (s.strike) st.textDecoration = (st.textDecoration ? st.textDecoration + ' ' : '') + 'line-through';
  if (s.align) st.textAlign = s.align;
  if (s.valign) st.verticalAlign = s.valign;
  if (s.color) st.color = s.color;
  if (s.bg) st.backgroundColor = s.bg;
  if (s.fontSize) st.fontSize = s.fontSize + 'px';
  st.whiteSpace = s.wrap ? 'normal' : 'nowrap';
  st.wordBreak = 'break-word';
  return st;
}

// ===== CSV 表格化 =====
const CSV_MAX_ROWS = 1000;
const csvRows = computed<string[][]>(() => {
  if (kind.value !== 'csv') return [];
  return parseCsv(content.value);
});
const csvBodyRows = computed(() => csvRows.value.slice(1, 1 + CSV_MAX_ROWS));
const csvTruncated = computed(() => csvRows.value.length - 1 > CSV_MAX_ROWS);

/** 基础 CSV 解析：支持引号包裹、引号转义（""）、逗号/换行分隔 */
function parseCsv(s: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c === '\r') { /* skip CRLF 的 \r */ }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const IMG_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'];
const EXCEL_EXTS = ['xlsx', 'xls'];
const PDF_EXTS = ['pdf'];
const WORD_EXTS = ['docx', 'doc'];
const TEXT_EXTS = new Set([
  'md', 'markdown', 'txt', 'log', 'json', 'py', 'js', 'ts', 'jsx', 'tsx', 'vue', 'html', 'htm', 'css', 'scss', 'less',
  'xml', 'yaml', 'yml', 'ini', 'cfg', 'conf', 'env', 'sh', 'bat', 'ps1', 'sql', 'java', 'kt', 'go', 'rs', 'c', 'h',
  'cpp', 'hpp', 'cs', 'php', 'rb', 'swift', 'toml', 'properties', 'gitignore', 'lock',
]);

/** 图片扩展名 → data URL 的 MIME 类型 */
function imgMime(ext: string): string {
  switch (ext) {
    case 'jpg': return 'image/jpeg';
    case 'jpeg': return 'image/jpeg';
    case 'ico': return 'image/x-icon';
    case 'svg': return 'image/svg+xml';
    case 'webp': return 'image/webp';
    default: return 'image/' + ext;
  }
}

const TEXT_LIMIT = 2000000; // 2MB：超限截断并在元信息条提示

async function loadFile() {
  loading.value = true;
  error.value = '';
  content.value = '';
  truncated.value = false;
  editing.value = false;
  editContent.value = '';
  mdMode.value = 'read';
  imageSrc.value = '';
  pdfPages.value = [];
  pdfImages.value = [];
  pdfTotal.value = 0;
  pdfNote.value = '';
  excelSheets.value = [];
  activeSheet.value = 0;
  byteSize.value = 0;
  unsupportedNote.value = '';
  fileMtime.value = '';
  try {
    const { getPlatformAdapter } = await import('@yan-zhi/core');
    const adapter = getPlatformAdapter();
    // 先取文件元信息：binary 等不读内容的分支也能显示真实大小/修改时间
    try {
      const st = await adapter.fs.stat?.(props.file.path);
      if (st) {
        byteSize.value = st.size;
        if (st.mtimeMs) fileMtime.value = new Date(st.mtimeMs).toLocaleString();
      }
    } catch { /* stat 可选，失败不影响预览 */ }
    const e = ext.value;

    if (IMG_EXTS.includes(e)) {
      // 二进制图片：以 base64 读取原始字节，构造 data URL 才能正确渲染
      const b64 = await adapter.fs.readFileBase64(props.file.path);
      imageSrc.value = `data:${imgMime(e)};base64,${b64}`;
      byteSize.value = Math.floor(b64.length * 3 / 4);
      kind.value = 'image';
      return;
    }

    if (PDF_EXTS.includes(e)) {
      // PDF：客户端 pdf.js 把每页渲染成图片（真·高保真，含版式/图片），纯前端、无需 Python。
      // pdf.js 不可用（极老环境）时降级为 unpdf 纯文本提取。
      let b64 = '';
      try {
        b64 = await adapter.fs.readFileBase64(props.file.path);
      } catch {
        kind.value = 'binary';
        unsupportedNote.value = '暂不支持预览';
        return;
      }
      byteSize.value = Math.floor(b64.length * 3 / 4);
      try {
        const res = await renderPdfToImages(b64, { maxPages: 30, scale: 1.6 });
        pdfImages.value = res.images;
        pdfTotal.value = res.total;
        pdfNote.value = res.rendered < res.total ? `仅渲染前 ${res.rendered} / ${res.total} 页` : '';
        kind.value = 'pdf';
      } catch {
        const { totalPages, pages } = await extractPdfPages(b64);
        pdfTotal.value = totalPages;
        pdfPages.value = pages;
        kind.value = 'pdf';
      }
      return;
    }

    if (EXCEL_EXTS.includes(e)) {
      try {
        let b64 = await adapter.fs.readFileBase64(props.file.path);
        byteSize.value = Math.floor(b64.length * 3 / 4);
        excelWidths.value = {};
        excelDirty.value = {};
        xlsPreviewOnly.value = e === 'xls';
        if (e === 'xls') {
          // 旧版 .xls：优先服务端 xlrd 带样式解析（字体/颜色/填充/合并/列宽）；
          // 不可用时降级 SheetJS 转 .xlsx（仅内容，样式丢弃）
          try {
            const { api } = await import('../api/client');
            const r = await api.post<{ sheets: ExcelStyledSheet[] }>('/preview/xls-styled', { b64 });
            if ('error' in r || !r.data?.sheets?.length) throw new Error('error' in r ? r.error : '空结果');
            excelSheets.value = r.data.sheets;
            excelSourceB64.value = '';
            kind.value = 'excel';
            return;
          } catch (err) {
            console.warn('[FilePreview] xls 样式通道不可用，降级为无样式预览:', err);
            b64 = await convertXlsToXlsx(b64);
          }
        }
        const book = await parseExcelStyled(b64);
        excelSheets.value = book.sheets;
        excelSourceB64.value = b64;
        kind.value = 'excel';
      } catch {
        kind.value = 'binary';
        unsupportedNote.value = e === 'xls' ? '旧版 .xls 解析失败，请用 Excel 另存为 .xlsx 后预览' : '暂不支持预览';
      }
      return;
    }

    if (WORD_EXTS.includes(e)) {
      // Word 文档不做内嵌预览（浮动文本框模板渲染质量差），交由本机应用打开
      kind.value = 'binary';
      unsupportedNote.value = 'Word 文档暂不支持内嵌预览，请用本机应用打开';
      return;
    }

    if (e === 'csv') {
      const raw = await adapter.fs.readFile(props.file.path);
      content.value = raw.length >= TEXT_LIMIT ? raw.slice(0, TEXT_LIMIT) : raw;
      truncated.value = raw.length >= TEXT_LIMIT;
      kind.value = 'csv';
      return;
    }

    // 文本类：扩展名白名单内直接读；白名单外也尝试读，但检测到二进制特征（空字节/大量替换符）转暂不支持
    if (TEXT_EXTS.has(e) || !e) {
      const raw = await adapter.fs.readFile(props.file.path);
      if (raw.length >= TEXT_LIMIT) {
        content.value = raw.slice(0, TEXT_LIMIT);
        truncated.value = true;
      } else {
        content.value = raw;
      }
      kind.value = 'text';
      return;
    }

    const raw = await adapter.fs.readFile(props.file.path);
    const isBinary = raw.includes('\u0000') || countReplacement(raw) > Math.min(raw.length, 2000) * 0.1;
    if (isBinary) {
      kind.value = 'binary';
      unsupportedNote.value = e === 'doc' ? '旧版 .doc 不支持预览，建议另存为 .docx' : '暂不支持预览';
    } else {
      content.value = raw.length >= TEXT_LIMIT ? raw.slice(0, TEXT_LIMIT) : raw;
      truncated.value = raw.length >= TEXT_LIMIT;
      kind.value = 'text';
    }
  } catch (e: any) {
    error.value = '读取文件失败: ' + (e?.message || e);
  } finally {
    loading.value = false;
    // 快照时间线以本次加载内容为基线，供撤回/重做
    snapshots.value = [content.value];
    snapIdx.value = 0;
  }
}

/** 统计替换符数量（UTF-8 解码二进制时产生 U+FFFD），取前 2000 字符为样本 */
function countReplacement(s: string): number {
  let n = 0;
  const sample = s.slice(0, 2000);
  for (let i = 0; i < sample.length; i++) if (sample[i] === '\uFFFD') n++;
  return n;
}

/** v-html 内容的事件委托：代码块复制按钮 */
function onContentClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  const btn = t.closest('.fp-copy-btn') as HTMLElement | null;
  if (!btn) return;
  const raw = btn.getAttribute('data-code') || '';
  navigator.clipboard.writeText(decodeURIComponent(raw)).then(() => {
    btn.textContent = '已复制';
    setTimeout(() => { btn.textContent = '复制'; }, 1500);
  }).catch(() => { /* ignore */ });
}

watch(() => props.file?.path, () => { if (props.file?.path) loadFile(); }, { immediate: true });
</script>

<style scoped>
.file-preview { height: 100%; overflow: auto; padding: 0; background: var(--el-bg-color); display: flex; flex-direction: column; }
/* 元信息条 */
.fp-meta {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; flex-shrink: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 12px; color: var(--el-text-color-secondary);
}
.fp-meta-name { font-weight: 600; color: var(--el-text-color-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 50%; }
.fp-meta-badge {
  flex-shrink: 0; padding: 1px 8px; border-radius: 4px;
  background: var(--el-color-primary-light-9, rgba(124, 58, 237, 0.08));
  color: var(--el-color-primary, #7c3aed); font-size: 11px;
}
.fp-meta-size { flex-shrink: 0; margin-left: auto; }
.fp-loading, .fp-error { padding: 40px; text-align: center; color: var(--el-text-color-secondary); }
.fp-image-wrap { text-align: center; padding: 12px; }
.fp-image { max-width: 100%; max-height: 70vh; border-radius: 4px; }
/* PDF 分页文本 */
.fp-pdf-pages { flex: 1; overflow: auto; padding: 12px; }
.fp-pdf-page { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; margin-bottom: 12px; overflow: hidden; }
.fp-pdf-page-tag { padding: 4px 10px; font-size: 11px; color: var(--el-text-color-secondary); background: var(--el-fill-color-light); border-bottom: 1px solid var(--el-border-color-lighter); }
.fp-pdf-page-text { margin: 0; padding: 12px; font-size: 13px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; font-family: inherit; color: var(--el-text-color-primary); }
.fp-pdf-page-img { display: block; width: 100%; height: auto; }
/* Excel 工作表 tab */
.fp-sheet-tabs { display: flex; gap: 4px; padding: 8px 12px 0; flex-shrink: 0; border-bottom: 1px solid var(--el-border-color-lighter); overflow-x: auto; }
.fp-sheet-tab {
  padding: 4px 12px; font-size: 12px; border: 1px solid transparent; border-bottom: none;
  border-radius: 6px 6px 0 0; background: transparent; color: var(--el-text-color-secondary);
  cursor: pointer; white-space: nowrap;
}
.fp-sheet-tab.active { background: var(--el-bg-color); border-color: var(--el-border-color-lighter); color: var(--el-color-primary); font-weight: 600; }
.fp-text { font-size: 13px; line-height: 1.6; padding: 12px; }
.fp-text :deep(pre) { background: var(--el-fill-color-dark); padding: 12px; border-radius: 6px; overflow: auto; margin: 8px 0; position: relative; }
.fp-text :deep(code) { font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; }
/* 代码视图：行号列 + 代码同容器滚动（滚动天然同步） */
.fp-code-wrap { display: flex; flex: 1; min-height: 0; overflow: auto; font-size: 12px; line-height: 1.6; }
.fp-lns {
  flex-shrink: 0; padding: 12px 8px 12px 12px; text-align: right;
  color: var(--el-text-color-placeholder); user-select: none; white-space: pre;
  border-right: 1px solid var(--el-border-color-lighter);
  font-family: 'Consolas', 'Monaco', monospace;
}
.fp-code { margin: 0; padding: 12px; flex: 1; min-width: 0; background: transparent; font-family: 'Consolas', 'Monaco', monospace; }
/* 编辑模式：等宽 textarea 编辑器 */
.fp-edit-wrap { flex: 1; min-height: 0; display: flex; }
.fp-editor {
  flex: 1; min-height: 0; resize: none; border: none; outline: none;
  padding: 12px; background: var(--el-bg-color); color: var(--el-text-color-primary);
  font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; line-height: 1.6;
  white-space: pre; overflow: auto; tab-size: 2;
}
/* MD 三态切换：分段按钮 */
.fp-seg {
  display: inline-flex; flex-shrink: 0; overflow: hidden;
  border: 1px solid var(--el-border-color); border-radius: 6px;
}
.fp-seg button {
  border: none; background: transparent; cursor: pointer;
  padding: 3px 10px; font-size: 12px; line-height: 1.5;
  color: var(--el-text-color-secondary); transition: background 0.12s, color 0.12s;
}
.fp-seg button + button { border-left: 1px solid var(--el-border-color-lighter); }
.fp-seg button:hover { color: var(--el-color-primary); }
.fp-seg button.on { background: var(--el-color-primary); color: #fff; }
/* MD 分屏：左源码右实时预览 */
.fp-split { flex: 1; min-height: 0; display: flex; }
.fp-split .fp-editor { flex: 1 1 50%; min-width: 0; border-right: 1px solid var(--el-border-color-lighter); }
.fp-split-preview { flex: 1 1 50%; min-width: 0; overflow: auto; }
/* 代码块复制按钮 */
:deep(.fp-pre) { position: relative; }
:deep(.fp-copy-btn) {
  position: absolute; top: 6px; right: 6px;
  padding: 2px 8px; font-size: 11px; border: 1px solid var(--el-border-color);
  border-radius: 4px; background: var(--el-bg-color); color: var(--el-text-color-secondary);
  cursor: pointer; opacity: 0; transition: opacity 0.15s;
}
:deep(pre:hover .fp-copy-btn) { opacity: 1; }
:deep(.fp-copy-btn:hover) { color: var(--el-color-primary); border-color: var(--el-color-primary); }
/* 表格（CSV） */
.fp-table-wrap { flex: 1; overflow: auto; padding: 12px; }
.fp-table { border-collapse: collapse; font-size: 12px; width: 100%; }
.fp-table th, .fp-table td {
  border: 1px solid var(--el-border-color-lighter); padding: 5px 10px;
  text-align: left; white-space: nowrap; max-width: 320px; overflow: hidden; text-overflow: ellipsis;
}
.fp-table th { background: var(--el-fill-color-light); position: sticky; top: 0; font-weight: 600; }
.fp-table tr:hover td { background: var(--el-fill-color-lighter); }
.fp-table-hint { padding-top: 8px; color: var(--el-text-color-secondary); }
/* Excel 带样式表格：原生网格外观（列标/行号/网格线），列总和超出容器时横向滚动 */
.fp-xlsx {
  border-collapse: collapse; font-size: 12px; table-layout: fixed;
  width: max-content; min-width: 100%;
}
.fp-xlsx td {
  border: 1px solid var(--el-border-color, #dcdfe6); padding: 4px 8px;
  text-align: left; vertical-align: top; overflow: hidden; text-overflow: ellipsis;
  word-break: break-all; height: 22px;
}
.fp-xlsx tr.fp-xlsx-head td { background: var(--el-fill-color-light); font-weight: 600; }
.fp-xlsx tbody tr:not(.fp-xlsx-colhead-row):hover td:not(.fp-xlsx-gutter) { background: var(--el-fill-color-lighter); }
/* 列标行 / 行号列（Excel 原生灰底 gutter） */
.fp-xlsx-gutter { background: var(--el-fill-color, #f5f7fa); color: var(--el-text-color-secondary); text-align: center; font-weight: 400; }
.fp-xlsx-colhead-row td { position: sticky; top: 0; z-index: 2; height: 20px; padding: 2px 4px; }
.fp-xlsx-colhead { position: relative; user-select: none; }
.fp-xlsx .fp-xlsx-gutter { position: sticky; left: 0; z-index: 1; }
.fp-xlsx-colhead-row .fp-xlsx-gutter { z-index: 3; }
/* 列宽拖拽手柄：列标单元格右缘 */
.fp-col-grip { position: absolute; top: 0; right: -3px; width: 7px; height: 100%; cursor: col-resize; z-index: 2; }
.fp-col-grip:hover { background: rgba(124, 58, 237, 0.25); }
/* 编辑中的单元格 */
.fp-xlsx td[contenteditable="plaintext-only"] { outline: 2px solid var(--el-color-primary, #7c3aed); outline-offset: -2px; cursor: text; background: var(--el-bg-color); }
.fp-cell-edited { box-shadow: inset 0 0 0 1px var(--el-color-warning, #e6a23c); }
.fp-dirty-hint { flex-shrink: 0; font-size: 12px; color: var(--el-color-warning, #e6a23c); }
/* PDF 备注（仅渲染前 N 页等） */
.fp-pdf-note { padding: 8px 12px; font-size: 12px; color: var(--el-text-color-secondary); text-align: center; }
.fp-binary { text-align: center; padding: 40px; color: var(--el-text-color-secondary); display: flex; flex-direction: column; align-items: center; gap: 8px; }
.fp-binary-actions { display: flex; gap: 8px; }
.fp-binary-path { max-width: 90%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: center; }
.fp-hint { font-size: 12px; }
</style>

<!-- hljs token 主题（非 scoped：此前项目从未引入 hljs 主题 CSS，token 一直无色）。
     浅色 = github 风；[data-theme=dark] 覆盖为 github-dark 风，随应用主题切换。 -->
<style>
.hljs { color: #24292e; background: transparent; }
.hljs-comment, .hljs-quote { color: #6a737d; font-style: italic; }
.hljs-keyword, .hljs-selector-tag, .hljs-meta-keyword, .hljs-doctag, .hljs-template-tag { color: #d73a49; }
.hljs-string, .hljs-regexp, .hljs-addition, .hljs-meta-string { color: #032f62; }
.hljs-number, .hljs-literal, .hljs-variable, .hljs-template-variable, .hljs-attr, .hljs-attribute { color: #005cc5; }
.hljs-title, .hljs-title.class_, .hljs-title.function_, .hljs-section, .hljs-name { color: #6f42c1; }
.hljs-type, .hljs-built_in, .hljs-builtin-name, .hljs-symbol, .hljs-bullet, .hljs-link { color: #e36209; }
.hljs-deletion { color: #b31d28; }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: 600; }
[data-theme="dark"] .hljs { color: #c9d1d9; }
[data-theme="dark"] .hljs-comment, [data-theme="dark"] .hljs-quote { color: #8b949e; }
[data-theme="dark"] .hljs-keyword, [data-theme="dark"] .hljs-selector-tag, [data-theme="dark"] .hljs-doctag, [data-theme="dark"] .hljs-template-tag { color: #ff7b72; }
[data-theme="dark"] .hljs-string, [data-theme="dark"] .hljs-regexp, [data-theme="dark"] .hljs-addition, [data-theme="dark"] .hljs-meta-string { color: #a5d6ff; }
[data-theme="dark"] .hljs-number, [data-theme="dark"] .hljs-literal, [data-theme="dark"] .hljs-variable, [data-theme="dark"] .hljs-attr, [data-theme="dark"] .hljs-attribute { color: #79c0ff; }
[data-theme="dark"] .hljs-title, [data-theme="dark"] .hljs-title.class_, [data-theme="dark"] .hljs-title.function_, [data-theme="dark"] .hljs-section, [data-theme="dark"] .hljs-name { color: #d2a8ff; }
[data-theme="dark"] .hljs-type, [data-theme="dark"] .hljs-built_in, [data-theme="dark"] .hljs-builtin-name, [data-theme="dark"] .hljs-symbol, [data-theme="dark"] .hljs-bullet, [data-theme="dark"] .hljs-link { color: #ffa657; }
[data-theme="dark"] .hljs-deletion { color: #ffd7d9; }
</style>
