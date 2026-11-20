<script setup lang="ts">
// 笔记工作区（docs/笔记功能方案-2026-11-14.md §5）：独立功能页 /notes。
// ★ 布局以「记录和查看」为主舞台（2026-11-14 用户定调）：两栏——
//   左=窄导航（搜索/视图/分类/列表一体，宽度可拖），右=当前笔记满高编辑/阅读主区。
// 极简规范：无多余图标与 tip 文案；分类 = 既有项点击过滤 + 直接键入新名字（提交自动创建）。
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Pencil, Save, Trash2, X } from 'lucide-vue-next';
import {
  NOTE_BUILTIN_DICTIONARIES,
  NOTE_BUILTIN_TEMPLATES,
  type NoteDictionaryDefinition,
  type NoteTemplateData,
  type NoteTemplateDefinition,
  type NoteTemplateField,
} from '@yan-zhi/shared';
import { api } from '../api/client';
import MarkdownPreview from '../components/code/MarkdownPreview.vue';
import NoteQuickCreate from '../components/notes/NoteQuickCreate.vue';
import NoteTemplateStudio from '../components/notes/NoteTemplateStudio.vue';
import NoteTemplateForm from '../components/notes/NoteTemplateForm.vue';
import NoteDirectorySheet from '../components/notes/NoteDirectorySheet.vue';
import NoteAnalyticsSheet from '../components/notes/NoteAnalyticsSheet.vue';
import NotesMobileHome, {
  type MobileNoteFilter,
  type MobileNoteTotals,
} from '../components/notes/NotesMobileHome.vue';
import {
  buildRecordPayload,
  fieldDisplayValue,
  templateForNote,
  type NoteViewItem,
} from '../components/notes/notes-view-model';
import { planChipState, planChipLabel, toLocalInputValue, fromLocalInputValue, noteTimeLabel } from '../utils/notePlan';
import { useAuthStore } from '../stores/auth';
import { useMobileShell } from '../composables/useMobileShell';

type NoteItem = NoteViewItem;
type CategoryItem = {
  id: string;
  name: string;
  parentId: string | null;
  path: string[];
  depth: number;
  sort: number;
  count: number;
};
type DueItem = { id: string; text: string };

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const isMobileShell = useMobileShell();

function unwrap<T>(r: unknown): T | null {
  if (r && typeof r === 'object' && 'data' in r) return (r as { data: T }).data;
  return null;
}

// ── 数据 ──
const categories = ref<CategoryItem[]>([]);
const notes = ref<NoteItem[]>([]);
const dueItems = ref<DueItem[]>([]);
const loading = ref(true);
const templates = ref<NoteTemplateDefinition[]>([...NOTE_BUILTIN_TEMPLATES]);
const dictionaries = ref<NoteDictionaryDefinition[]>([...NOTE_BUILTIN_DICTIONARIES]);
const quickCreateOpen = ref(false);
const quickCreateTemplateId = ref('');
const templateStudioOpen = ref(false);
const directorySheetOpen = ref(false);
const analyticsOpen = ref(false);
const todayTotals = ref<MobileNoteTotals | null>(null);
const mobileFilter = ref<MobileNoteFilter>('today');
const mobileDetailOpen = ref(false);
const mobileEditing = ref(false);
const mobileDetailNote = ref<NoteItem | null>(null);
const mobileDetailData = ref<NoteTemplateData>({});
const mobileDetailTitle = ref('');
const mobileDetailContent = ref('');
const mobileDetailCategory = ref('');
const mobileDetailCategoryId = ref('');
const mobileDetailError = ref('');

// 视图：__all__ / __starred__ / __plan__ / __none__（未分类）/ 分类 id
const leftSel = ref<string>('__all__');
const q = ref('');
const sort = ref<'updated' | 'created' | 'plan'>('updated');

// 主区编辑副本（保存时才落库）
const draft = ref<NoteItem | null>(null);
// ★ 主区形态三态（2026-11-15 用户定调）：编辑（满宽写）/ 双栏（左写右预览）/ 查看（满宽读）
const viewMode = ref<'edit' | 'split' | 'view'>('view');
// editing 仅表示「有未落库的编辑会话」；形态由 viewMode 决定
const editing = ref(false);
const saving = ref(false);
const newCategoryName = ref('');
const creatingCategory = ref(false);

// ── 沉浸式记录/阅读（照学习模式沉浸台范式）：整屏只留当前笔记，Esc 或按钮退出 ──
const immersive = ref(false);
function toggleImmersive() { immersive.value = !immersive.value; }
function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && immersive.value) immersive.value = false;
}

// ── 双栏分隔拖拽：编辑/预览宽度比例可调（20%-80%）──
const splitRatio = ref(50); // 编辑区占 body 宽度百分比
const mainBodyRef = ref<HTMLElement | null>(null);

// ── 笔记插图（docs/音乐双方向重构方案-2026-11-15.md §3.5）：按钮 / 粘贴 / 拖拽三入口 ──
// 统一走 POST /notes/media（落 /api/generated/images），光标处插 Markdown 图片。
const editorRef = ref<HTMLTextAreaElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const uploadingImg = ref(false);

function insertAtCursor(text: string): void {
  const el = editorRef.value;
  if (!el || !draft.value) {
    if (draft.value) draft.value.content += text;
    return;
  }
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? s;
  draft.value.content = el.value.slice(0, s) + text + el.value.slice(e);
  requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + text.length; });
}

async function uploadAndInsertImage(file: File): Promise<void> {
  if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) return;
  const base64 = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
  uploadingImg.value = true;
  try {
    const r = await api.post<{ url: string }>('/notes/media', { name: file.name || 'image.png', base64 });
    const data = r && typeof r === 'object' && 'data' in r ? (r as { data?: { url?: string } }).data : null;
    if (data?.url) insertAtCursor(`\n![图片](${data.url})\n`);
  } catch { /* 上传失败静默，不打断记录 */ }
  finally { uploadingImg.value = false; }
}

function onEditorPaste(ev: ClipboardEvent): void {
  const file = [...(ev.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
  if (!file) return;
  ev.preventDefault();
  void uploadAndInsertImage(file);
}

function onEditorDrop(ev: DragEvent): void {
  const file = [...(ev.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
  if (!file) return;
  ev.preventDefault();
  void uploadAndInsertImage(file);
}

function onPickImage(ev: Event): void {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (file) void uploadAndInsertImage(file);
  (ev.target as HTMLInputElement).value = '';
}
let stopSplitResize: (() => void) | null = null;
function startSplitResize(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  stopSplitResize?.();
  const body = mainBodyRef.value;
  if (!body) return;
  const onMove = (moveEvent: PointerEvent) => {
    const rect = body.getBoundingClientRect();
    splitRatio.value = clamp(((moveEvent.clientX - rect.left) / rect.width) * 100, 20, 80);
  };
  const onUp = () => stopSplitResize?.();
  stopSplitResize = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    stopSplitResize = null;
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
}

// ── 栏宽拖拽：左导航可拖，主区 minmax(0,1fr) 吃满剩余 ──
const sideWidth = ref(300);
let stopColumnResize: (() => void) | null = null;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
function startColumnResize(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  stopColumnResize?.();
  const startX = event.clientX;
  const startWidth = sideWidth.value;
  const onMove = (moveEvent: PointerEvent) => {
    sideWidth.value = clamp(startWidth + moveEvent.clientX - startX, 260, 560);
  };
  const onUp = () => stopColumnResize?.();
  stopColumnResize = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    stopColumnResize = null;
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
}
const gridStyle = computed(() => ({ '--np-side-w': `${sideWidth.value}px` }) as Record<string, string>);

const realCategories = computed(() => categories.value.filter((c) => c.id !== '__none__'));

async function loadCategories() {
  const data = unwrap<CategoryItem[]>(await api.get('/notes/categories'));
  categories.value = data || [];
}

async function loadNotes() {
  const params = new URLSearchParams();
  if (q.value.trim()) params.set('q', q.value.trim());
  if (leftSel.value === '__plan__') params.set('kind', 'plan');
  if (leftSel.value === '__starred__') params.set('starred', '1');
  if (leftSel.value !== '__all__' && leftSel.value !== '__starred__' && leftSel.value !== '__plan__') {
    params.set('category', leftSel.value === '__none__' ? 'none' : leftSel.value);
  }
  params.set('sort', sort.value);
  const data = unwrap<NoteItem[]>(await api.get(`/notes/notes?${params.toString()}`));
  notes.value = data || [];
}

async function loadDue() {
  // Web 端无系统通知：到期提醒以列表红点呈现；桌面端轮询走 drain，两端并存互不干扰
  const data = unwrap<{ items: DueItem[] }>(await api.get('/notes/reminders/due'));
  dueItems.value = data?.items || [];
}

async function loadTodayTotals() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const response = await api.get<{ totals: MobileNoteTotals }>(
    `/notes/analytics?from=${start.getTime()}&to=${Date.now()}`,
  );
  const data = unwrap<{ totals: MobileNoteTotals }>(response);
  todayTotals.value = data?.totals || null;
}

async function ackDue() {
  const ids = dueItems.value.map((d) => d.id);
  if (!ids.length) return;
  await api.post('/notes/reminders/ack', { ids });
  dueItems.value = [];
}

async function refreshAll() {
  await Promise.all([loadCategories(), loadNotes(), loadDue(), loadTodayTotals()]);
}

async function loadRecordConfig() {
  const [templateRows, dictionaryRows] = await Promise.all([
    api.get<NoteTemplateDefinition[]>('/notes/templates'),
    api.get<NoteDictionaryDefinition[]>('/notes/dictionaries'),
  ]);
  templates.value = unwrap<NoteTemplateDefinition[]>(templateRows) || [...NOTE_BUILTIN_TEMPLATES];
  dictionaries.value = unwrap<NoteDictionaryDefinition[]>(dictionaryRows) || [...NOTE_BUILTIN_DICTIONARIES];
}

const defaultQuickCategory = computed(() => {
  return categories.value.find((category) => category.id === leftSel.value)?.name || '';
});
const defaultQuickCategoryId = computed(() => (
  leftSel.value.startsWith('__') ? '' : leftSel.value
));

const mobileDetailTemplate = computed<NoteTemplateDefinition | undefined>(() => (
  mobileDetailNote.value ? templateForNote(mobileDetailNote.value, templates.value) : undefined
));

const mobileDetailOtherFields = computed<NoteTemplateField[]>(() => {
  const template = mobileDetailTemplate.value;
  if (!template) return [];
  return template.fields.filter((field) => (
    field.key !== template.titleField && field.key !== template.contentField
  ));
});

function openQuickCreate(templateId = ''): void {
  quickCreateTemplateId.value = templateId;
  quickCreateOpen.value = true;
}

let mobileSearchTimer: number | null = null;
function setMobileQuery(value: string): void {
  q.value = value;
  if (mobileSearchTimer) window.clearTimeout(mobileSearchTimer);
  mobileSearchTimer = window.setTimeout(() => { void loadNotes(); }, 220);
}

async function setMobileCategory(categoryId: string): Promise<void> {
  leftSel.value = categoryId;
  await loadNotes();
}

function openMobileNote(note: NoteItem): void {
  mobileDetailNote.value = note;
  mobileDetailData.value = { ...note.data };
  mobileDetailTitle.value = note.title;
  mobileDetailContent.value = note.content;
  mobileDetailCategory.value = note.categoryName || '';
  mobileDetailCategoryId.value = note.categoryId || '';
  mobileDetailError.value = '';
  mobileEditing.value = false;
  mobileDetailOpen.value = true;
}

function closeMobileNote(): void {
  if (saving.value) return;
  mobileDetailOpen.value = false;
  mobileDetailNote.value = null;
  mobileEditing.value = false;
  mobileDetailError.value = '';
}

function beginMobileEdit(): void {
  if (!mobileDetailNote.value) return;
  mobileEditing.value = true;
  mobileDetailError.value = '';
}

async function saveMobileRecord(): Promise<void> {
  const note = mobileDetailNote.value;
  const template = mobileDetailTemplate.value;
  if (!note || !template || saving.value) return;
  saving.value = true;
  mobileDetailError.value = '';
  try {
    const nextData: NoteTemplateData = {
      ...mobileDetailData.value,
      [template.titleField]: mobileDetailTitle.value,
    };
    if (template.contentField) nextData[template.contentField] = mobileDetailContent.value;
    const payload = buildRecordPayload(
      template,
      nextData,
      mobileDetailCategory.value,
    );
    const templateStillExists = templates.value.some((item) => item.id === template.id);
    const response = await api.patch(`/notes/notes/${note.id}`, {
      title: mobileDetailTitle.value.trim() || payload.title,
      content: mobileDetailContent.value,
      categoryId: mobileDetailCategoryId.value || null,
      ...(mobileDetailCategoryId.value ? {} : { categoryName: mobileDetailCategory.value }),
      ...(templateStillExists ? { templateId: template.id } : {}),
      data: nextData,
      occurredAt: payload.occurredAt,
      planAt: payload.planAt,
      remindAt: payload.remindAt,
    });
    if (response && typeof response === 'object' && 'error' in response) {
      mobileDetailError.value = String((response as { error: unknown }).error);
      return;
    }
    const saved = unwrap<NoteItem>(response);
    if (saved) {
      mobileDetailNote.value = saved;
      mobileDetailTitle.value = saved.title;
      mobileDetailContent.value = saved.content;
      mobileDetailData.value = { ...saved.data };
      mobileDetailCategory.value = saved.categoryName || '';
      mobileDetailCategoryId.value = saved.categoryId || '';
    }
    mobileEditing.value = false;
    await refreshAll();
  } finally {
    saving.value = false;
  }
}

async function deleteMobileRecord(): Promise<void> {
  const note = mobileDetailNote.value;
  if (!note) return;
  if (!window.confirm(`删除「${note.title}」？不可恢复。`)) return;
  await api.delete(`/notes/notes/${note.id}`);
  closeMobileNote();
  await refreshAll();
}

async function afterRecordConfigChanged(): Promise<void> {
  await loadRecordConfig();
}

async function afterDirectoriesChanged(): Promise<void> {
  await Promise.all([loadCategories(), loadNotes()]);
}

async function toggleTaskFromList(note: NoteItem): Promise<void> {
  const response = await api.post(`/notes/notes/${note.id}/task-done`);
  if (response && typeof response === 'object' && 'error' in response) return;
  await refreshAll();
}

// ── 左栏 ──
async function selectLeft(id: string) {
  leftSel.value = id;
  await loadNotes();
}

async function createCategory() {
  const name = newCategoryName.value.trim();
  if (!name) { creatingCategory.value = false; return; }
  const cat = unwrap<CategoryItem>(await api.post('/notes/categories', { name }));
  newCategoryName.value = '';
  creatingCategory.value = false;
  if (cat) await loadCategories();
}

async function renameCategory(c: CategoryItem) {
  const name = window.prompt('重命名分类', c.name);
  if (!name || name.trim() === c.name) return;
  const r = await api.patch(`/notes/categories/${c.id}`, { name: name.trim() });
  if (r && 'error' in (r as object)) { window.alert(String((r as any).error)); return; }
  await refreshAll();
}

async function removeCategory(c: CategoryItem) {
  if (!window.confirm(`删除分类「${c.name}」？该分类下的笔记会移到「未分类」。`)) return;
  await api.delete(`/notes/categories/${c.id}`);
  if (leftSel.value === c.id) leftSel.value = '__all__';
  await refreshAll();
}

// ── 列表 ──
async function selectNote(n: NoteItem) {
  editing.value = false;
  viewMode.value = 'view';
  draft.value = { ...n };
}

async function toggleStar(n: NoteItem) {
  const r = unwrap<{ starred: boolean }>(await api.post(`/notes/notes/${n.id}/star`));
  if (r) {
    n.starred = r.starred;
    if (draft.value?.id === n.id) draft.value.starred = r.starred;
  }
}

async function createNew(kind: 'note' | 'plan') {
  const created = unwrap<NoteItem>(await api.post('/notes/notes', {
    title: kind === 'plan' ? '新计划' : '新笔记',
    kind,
    source: 'manual',
  }));
  if (!created) return;
  await loadNotes();
  await selectNote(created);
  // 新建直接进双栏记录形态（写 + 实时预览）
  editing.value = true;
  viewMode.value = 'split';
}

// ── 主区形态三态切换 ──
/** 有未落库改动才真写库（切查看态自动保存时避免无谓 PATCH） */
function hasDraftChanges(): boolean {
  if (!draft.value) return false;
  const origin = notes.value.find((n) => n.id === draft.value!.id);
  if (!origin) return true;
  return origin.title !== draft.value.title
    || origin.content !== draft.value.content
    || (origin.categoryName || '') !== (draft.value.categoryName || '')
    || (origin.planAt ?? null) !== (draft.value.planAt ?? null)
    || (origin.remindAt ?? null) !== (draft.value.remindAt ?? null);
}

async function setViewMode(mode: 'edit' | 'split' | 'view') {
  if (!draft.value || mode === viewMode.value) return;
  if (mode === 'view') {
    // 切查看：未落库改动自动保存（记录不打断，也不丢字）
    if (editing.value && hasDraftChanges()) await saveDraft();
    editing.value = false;
  } else {
    editing.value = true;
  }
  viewMode.value = mode;
}

/** 取消编辑：丢弃未保存改动，回到该笔记已落库内容 */
function cancelEdit() {
  if (!draft.value) return;
  const origin = notes.value.find((n) => n.id === draft.value!.id);
  if (origin) draft.value = { ...origin };
  editing.value = false;
  viewMode.value = 'view';
}

function rowClass(n: NoteItem): string {
  const cls: string[] = [];
  if (n.pinned) cls.push('is-pinned');
  if (draft.value?.id === n.id) cls.push('is-active');
  if (dueItems.value.some((d) => d.id === n.id)) cls.push('is-due');
  if (planChipState(n.planAt) === 'overdue') cls.push('row-overdue');
  return cls.join(' ');
}

// ── 主区 ──
const planInput = computed({
  get: () => toLocalInputValue(draft.value?.planAt ?? null),
  set: (v: string) => { if (draft.value) draft.value.planAt = fromLocalInputValue(v); },
});
const remindOn = computed({
  get: () => draft.value?.remindAt != null,
  set: (v: boolean) => { if (draft.value) draft.value.remindAt = v ? (draft.value.planAt ?? Date.now()) : null; },
});
const categoryInput = computed({
  get: () => draft.value?.categoryName || '',
  set: (v: string) => { if (draft.value) draft.value.categoryName = v || null; },
});

async function saveDraft() {
  if (!draft.value) return;
  saving.value = true;
  try {
    const saved = unwrap<NoteItem>(await api.patch(`/notes/notes/${draft.value.id}`, {
      title: draft.value.title,
      content: draft.value.content,
      categoryName: draft.value.categoryName || '',
      planAt: draft.value.planAt,
      remindAt: draft.value.remindAt,
    }));
    if (saved) {
      const idx = notes.value.findIndex((n) => n.id === saved.id);
      if (idx >= 0) notes.value[idx] = saved;
      draft.value = { ...saved };
    }
    await loadCategories();
    editing.value = false;
    viewMode.value = 'view';
  } finally {
    saving.value = false;
  }
}

async function togglePinDraft() {
  if (!draft.value) return;
  const r = unwrap<{ pinned: boolean }>(await api.post(`/notes/notes/${draft.value.id}/pin`));
  if (r) {
    draft.value.pinned = r.pinned;
    const row = notes.value.find((n) => n.id === draft.value!.id);
    if (row) row.pinned = r.pinned;
  }
}

async function removeDraft() {
  if (!draft.value) return;
  if (!window.confirm(`删除「${draft.value.title}」？不可恢复。`)) return;
  await api.delete(`/notes/notes/${draft.value.id}`);
  draft.value = null;
  editing.value = false;
  await refreshAll();
}

// 桌面端：提醒通知点击 → notes:open → 跳到本页并定位该条
let offOpen: (() => void) | null = null;

async function focusNoteById(id: string) {
  if (!id) return;
  const hit = notes.value.find((n) => n.id === id);
  if (hit) await selectNote(hit);
}

// ★ 已在本页时 App.vue 再次 push 同路径，组件不重挂 —— query 变化必须 watch 才能定位
watch(() => String((route.query as Record<string, unknown>).noteId || ''), (id) => {
  if (!id) return;
  void focusNoteById(id);
  void router.replace({ path: '/notes' });
});

onMounted(async () => {
  window.addEventListener('keydown', onGlobalKeydown);
  await Promise.all([refreshAll(), loadRecordConfig()]);
  loading.value = false;
  const noteId = String((route.query as Record<string, unknown>).noteId || '');
  if (noteId) {
    await focusNoteById(noteId);
    void router.replace({ path: '/notes' });
  }
  // 桌面端 electronAPI.notes.onOpenRequest（Web 端不存在，静默跳过）
  const bridge = (window as unknown as { electronAPI?: { notes?: { onOpenRequest?: (cb: (p: { noteId?: string }) => void) => () => void } } }).electronAPI?.notes;
  if (bridge?.onOpenRequest) {
    offOpen = bridge.onOpenRequest(async (p) => {
      await focusNoteById(String(p?.noteId || ''));
    });
  }
});
onBeforeUnmount(() => {
  if (mobileSearchTimer) window.clearTimeout(mobileSearchTimer);
  window.removeEventListener('keydown', onGlobalKeydown);
  offOpen?.();
  stopColumnResize?.();
  stopSplitResize?.();
});

// 未登录（guest 路由防御）：页面仍渲染骨架，接口由 authMiddleware 拦
const isGuest = computed(() => !auth.isLoggedIn);
</script>

<template>
  <NotesMobileHome
    v-if="isMobileShell"
    :notes="notes"
    :categories="categories"
    :templates="templates"
    :dictionaries="dictionaries"
    :loading="loading"
    :query="q"
    :filter="mobileFilter"
    :category-id="leftSel"
    :today-totals="todayTotals"
    @update:query="setMobileQuery"
    @update:filter="mobileFilter = $event"
    @update:category-id="setMobileCategory"
    @create="openQuickCreate"
    @open="openMobileNote"
    @manage="templateStudioOpen = true"
    @manage-directories="directorySheetOpen = true"
    @analytics="analyticsOpen = true"
    @toggle-task="toggleTaskFromList"
  />

  <div v-else class="notes-page" :style="gridStyle">
    <!-- 左：窄导航（搜索 / 视图 / 分类 / 列表一体） -->
    <aside class="np-side np-card">
      <div class="np-side-top">
        <input v-model="q" class="np-search" placeholder="搜索标题与内容" @keyup.enter="loadNotes" @input="loadNotes" />
        <div class="np-side-actions">
          <button class="np-mini" @click="openQuickCreate()">+ 记录</button>
          <button class="np-mini" @click="templateStudioOpen = true">模板</button>
          <button class="np-mini" @click="directorySheetOpen = true">目录</button>
          <button class="np-mini" @click="analyticsOpen = true">统计</button>
          <select v-model="sort" class="np-sort" @change="loadNotes">
            <option value="updated">更新</option>
            <option value="created">创建</option>
            <option value="plan">计划</option>
          </select>
        </div>
        <div class="np-view-item" :class="{ active: leftSel === '__all__' }" @click="selectLeft('__all__')">全部</div>
        <div class="np-view-item" :class="{ active: leftSel === '__starred__' }" @click="selectLeft('__starred__')">★ 收藏</div>
        <div class="np-view-item" :class="{ active: leftSel === '__plan__' }" @click="selectLeft('__plan__')">☑ 计划</div>
        <div class="np-side-label">分类</div>
        <div class="np-cat-item" :class="{ active: leftSel === '__none__' }" @click="selectLeft('__none__')">
          <span class="np-cat-name">未分类</span>
        </div>
        <div
          v-for="c in realCategories"
          :key="c.id"
          class="np-cat-item"
          :class="{ active: leftSel === c.id }"
          :style="{ paddingLeft: `${10 + c.depth * 14}px` }"
          @click="selectLeft(c.id)"
        >
          <span class="np-cat-name">{{ c.name }}</span>
          <span class="np-count">{{ c.count }}</span>
          <span class="np-cat-ops" @click.stop>
            <button class="np-ghost-btn" title="重命名" @click="renameCategory(c)">✎</button>
            <button class="np-ghost-btn" title="删除" @click="removeCategory(c)">×</button>
          </span>
        </div>
        <div v-if="creatingCategory" class="np-cat-create">
          <input v-model="newCategoryName" placeholder="分类名" @keyup.enter="createCategory" @blur="createCategory" />
        </div>
        <button v-else class="np-mini np-add-cat" @click="creatingCategory = true">+ 新分类</button>
      </div>
      <div v-if="dueItems.length" class="np-due-bar">
        <span class="np-due-dot"></span>{{ dueItems.length }} 条到期提醒
        <button class="np-mini" @click="ackDue">知道了</button>
      </div>
      <div class="np-list">
        <div v-if="loading" class="np-empty">加载中…</div>
        <div v-else-if="!notes.length" class="np-empty">暂无笔记</div>
        <div v-for="n in notes" :key="n.id" class="np-row" :class="rowClass(n)" @click="selectNote(n)">
          <div class="np-row-main">
            <div class="np-row-title">
              <button class="np-star" :class="{ on: n.starred }" title="收藏" @click.stop="toggleStar(n)">{{ n.starred ? '★' : '☆' }}</button>
              <span class="np-row-title-text">{{ n.title }}</span>
            </div>
            <div class="np-row-sub">
              <span class="np-row-summary">{{ n.content.slice(0, 50) || '（无正文）' }}</span>
            </div>
            <div class="np-row-chips">
              <span v-if="n.kind === 'plan'" class="np-chip np-chip-plan">计划</span>
              <span v-if="n.categoryName" class="np-chip">{{ n.categoryName }}</span>
              <span v-if="n.planAt" class="np-chip np-chip-time" :class="'np-chip-' + planChipState(n.planAt)">{{ planChipLabel(n.planAt) }}</span>
              <span class="np-row-time">{{ noteTimeLabel(n.updatedAt) }}</span>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <div class="np-col-resizer" aria-label="拖动调整导航栏宽度" @pointerdown="startColumnResize($event)"></div>

    <!-- 右：当前笔记 · 记录与查看主区（满高；沉浸态整屏只留当前笔记） -->
    <section class="np-main np-card" :class="{ immersive }">
      <template v-if="draft">
        <div class="np-main-head">
          <input v-if="viewMode !== 'view'" v-model="draft.title" class="np-title-input" placeholder="标题" />
          <h1 v-else class="np-title-view">{{ draft.title }}</h1>
          <div class="np-detail-ops">
            <div class="np-mode-switch">
              <button class="np-mode-btn" :class="{ on: viewMode === 'edit' }" @click="setViewMode('edit')">编辑</button>
              <button class="np-mode-btn" :class="{ on: viewMode === 'split' }" @click="setViewMode('split')">双栏</button>
              <button class="np-mode-btn" :class="{ on: viewMode === 'view' }" @click="setViewMode('view')">查看</button>
            </div>
            <template v-if="viewMode !== 'view'">
              <button class="np-primary" :disabled="saving" @click="saveDraft">{{ saving ? '保存中…' : '保存' }}</button>
              <button class="np-mini" @click="cancelEdit">取消</button>
            </template>
            <template v-else>
              <button class="np-mini" :class="{ on: draft.pinned }" @click="togglePinDraft">{{ draft.pinned ? '已置顶' : '置顶' }}</button>
              <button class="np-mini np-danger" @click="removeDraft">删除</button>
            </template>
            <button v-if="immersive" class="np-mini" @click="toggleImmersive">退出沉浸</button>
            <button v-else class="np-mini" @click="toggleImmersive">沉浸</button>
          </div>
        </div>
        <div class="np-main-meta">
          <span class="np-meta-label">分类</span>
          <input
            v-model="categoryInput"
            class="np-cat-input"
            list="np-category-options"
            placeholder="未分类（输入即建）"
            :disabled="!editing"
          />
          <datalist id="np-category-options">
            <option v-for="c in realCategories" :key="c.id" :value="c.name"></option>
          </datalist>
          <template v-if="draft.kind === 'plan'">
            <span class="np-meta-label">计划时间</span>
            <input v-model="planInput" type="datetime-local" class="np-cat-input" :disabled="!editing" />
            <label class="np-remind"><input v-model="remindOn" type="checkbox" :disabled="!editing" /> 到点提醒</label>
          </template>
          <span v-if="draft.source && draft.source !== 'manual'" class="np-chip np-chip-src">来自 {{ draft.source.startsWith('learning') ? '学习' : draft.source === 'chat' ? '对话' : draft.source }}</span>
          <button v-if="editing" class="np-mini" :disabled="uploadingImg" @click="fileInputRef?.click()">{{ uploadingImg ? '上传中…' : '插入图片' }}</button>
          <input ref="fileInputRef" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="np-img-input" @change="onPickImage" />
        </div>
        <div
          ref="mainBodyRef"
          class="np-main-body"
          :class="'mode-' + viewMode"
          :style="viewMode === 'split' ? { gridTemplateColumns: `minmax(0, ${splitRatio}fr) 8px minmax(0, ${100 - splitRatio}fr)` } : undefined"
        >
          <textarea v-if="viewMode !== 'view'" ref="editorRef" v-model="draft.content" class="np-editor" :placeholder="viewMode === 'split' ? 'Markdown…（左侧编辑，右侧实时预览）' : 'Markdown…'" @paste="onEditorPaste" @drop="onEditorDrop" @dragover.prevent></textarea>
          <div v-if="viewMode === 'split'" class="np-split-resizer" aria-label="拖动调整编辑/预览宽度" @pointerdown="startSplitResize($event)"></div>
          <MarkdownPreview v-if="viewMode !== 'edit'" :content="draft.content" class="np-editor-preview" />
        </div>
      </template>
      <div v-else class="np-empty-main">
        <p>选择左侧一条笔记，或</p>
        <div class="np-empty-actions">
          <button class="np-primary" @click="createNew('note')">+ 记笔记</button>
          <button class="np-mini" @click="createNew('plan')">+ 建计划</button>
        </div>
      </div>
    </section>
  </div>

  <Transition name="nmd">
    <div v-if="isMobileShell && mobileDetailOpen && mobileDetailNote" class="nmd-mask" @click.self="closeMobileNote">
      <section class="nmd-sheet" role="dialog" aria-modal="true" aria-labelledby="nmd-title">
        <header class="nmd-head">
          <button type="button" aria-label="返回记录列表" @click="closeMobileNote"><ArrowLeft :size="19" /></button>
          <div>
            <small>{{ mobileDetailTemplate?.name || '记录详情' }}</small>
            <strong id="nmd-title">{{ mobileDetailNote.categoryName || '未分类' }}</strong>
          </div>
          <button v-if="!mobileEditing" type="button" aria-label="编辑记录" @click="beginMobileEdit"><Pencil :size="18" /></button>
          <button v-else type="button" aria-label="取消编辑" @click="mobileEditing = false; mobileDetailData = { ...mobileDetailNote.data }; mobileDetailTitle = mobileDetailNote.title; mobileDetailContent = mobileDetailNote.content; mobileDetailCategory = mobileDetailNote.categoryName || ''; mobileDetailCategoryId = mobileDetailNote.categoryId || ''">
            <X :size="18" />
          </button>
        </header>

        <template v-if="!mobileEditing">
          <div class="nmd-read">
            <h2>{{ mobileDetailTitle }}</h2>
            <div class="nmd-meta">
              <span>{{ noteTimeLabel(mobileDetailNote.occurredAt || mobileDetailNote.createdAt) }}</span>
              <span v-if="mobileDetailNote.starred">已收藏</span>
              <span v-if="mobileDetailNote.planAt">计划 {{ planChipLabel(mobileDetailNote.planAt) }}</span>
            </div>

            <dl v-if="mobileDetailOtherFields.length" class="nmd-values">
              <div v-for="field in mobileDetailOtherFields" :key="field.key">
                <dt>{{ field.label }}</dt>
                <dd>{{ fieldDisplayValue(field, mobileDetailData[field.key], dictionaries) || '未填写' }}</dd>
              </div>
            </dl>

            <MarkdownPreview
              v-if="mobileDetailContent"
              :content="mobileDetailContent"
              class="nmd-markdown"
            />
            <p v-else class="nmd-empty-content">这条记录没有正文。</p>
          </div>
          <footer class="nmd-actions">
            <button type="button" class="danger" @click="deleteMobileRecord"><Trash2 :size="16" />删除</button>
            <button type="button" class="primary" @click="beginMobileEdit"><Pencil :size="16" />编辑记录</button>
          </footer>
        </template>

        <template v-else>
          <div class="nmd-edit">
            <label class="nmd-field title">
              <span>{{ mobileDetailTemplate?.fields.find((field) => field.key === mobileDetailTemplate?.titleField)?.label || '标题' }}</span>
              <input v-model="mobileDetailTitle" type="text" placeholder="标题" />
            </label>

            <label v-if="mobileDetailTemplate?.contentField" class="nmd-field">
              <span>{{ mobileDetailTemplate.fields.find((field) => field.key === mobileDetailTemplate?.contentField)?.label || '正文' }}</span>
              <textarea v-model="mobileDetailContent" rows="7" placeholder="正文"></textarea>
            </label>

            <NoteTemplateForm
              v-if="mobileDetailTemplate"
              :template="mobileDetailTemplate"
              :model-value="mobileDetailData"
              :dictionaries="dictionaries"
              @update:model-value="mobileDetailData = $event"
            />

            <label class="nmd-field">
              <span>归档到</span>
              <select v-model="mobileDetailCategoryId">
                <option value="">未分类</option>
                <option v-for="category in realCategories" :key="category.id" :value="category.id">
                  {{ category.path.join(' / ') }}
                </option>
              </select>
            </label>
            <p v-if="mobileDetailError" class="nmd-error" role="alert">{{ mobileDetailError }}</p>
          </div>
          <footer class="nmd-actions">
            <button type="button" @click="mobileEditing = false">取消</button>
            <button type="button" class="primary" :disabled="saving" @click="saveMobileRecord">
              <Save :size="16" />{{ saving ? '保存中…' : '保存修改' }}
            </button>
          </footer>
        </template>
      </section>
    </div>
  </Transition>

  <NoteQuickCreate
    :visible="quickCreateOpen"
    :templates="templates"
    :dictionaries="dictionaries"
    :categories="realCategories"
    :default-category-name="defaultQuickCategory"
    :default-category-id="defaultQuickCategoryId"
    :initial-template-id="quickCreateTemplateId"
    @close="quickCreateOpen = false"
    @saved="refreshAll"
  />

  <NoteTemplateStudio
    :visible="templateStudioOpen"
    :templates="templates"
    :dictionaries="dictionaries"
    @close="templateStudioOpen = false"
    @changed="afterRecordConfigChanged"
  />

  <NoteDirectorySheet
    :visible="directorySheetOpen"
    :directories="categories"
    :selected-id="leftSel"
    @close="directorySheetOpen = false"
    @select="selectLeft"
    @changed="afterDirectoriesChanged"
  />

  <NoteAnalyticsSheet
    :visible="analyticsOpen"
    :dictionaries="dictionaries"
    @close="analyticsOpen = false"
  />
</template>

<style scoped>
/* 笔记插图入口（隐藏原生 file input，按钮触发） */
.np-img-input { display: none; }

.notes-page {
  display: grid;
  /* 左=窄导航（可拖 260-560） / 右=记录与查看主区（minmax(0,1fr) 吃满剩余全部） */
  grid-template-columns: var(--np-side-w, 300px) 8px minmax(0, 1fr);
  gap: 0;
  height: 100%;
  min-height: 0;
  padding: 10px;
}
.np-card {
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  background: var(--color-surface, #fff);
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* 拖拽把手 */
.np-col-resizer { position: relative; width: 8px; cursor: col-resize; touch-action: none; }
.np-col-resizer::after {
  content: ""; position: absolute; top: 8px; bottom: 8px; left: 3px; width: 2px;
  border-radius: 2px; background: var(--color-border, #e5e7eb); transition: background .15s ease;
}
.np-col-resizer:hover::after, .np-col-resizer:active::after { background: var(--el-color-primary, #2563eb); }

/* ── 左栏：导航 ── */
.np-side { overflow: hidden; }
.np-side-top {
  padding: 10px 10px 6px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  flex-shrink: 0;
  display: flex; flex-direction: column; gap: 4px;
}
.np-search {
  width: 100%; padding: 6px 10px; font-size: 13px;
  border: 1px solid var(--color-border, #e5e7eb); border-radius: 7px;
  background: transparent; color: inherit; outline: none;
}
.np-search:focus { border-color: var(--el-color-primary, #2563eb); }
.np-side-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 2px; }
.np-mini {
  padding: 5px 10px; font-size: 12px; white-space: nowrap; cursor: pointer;
  border: 1px solid var(--color-border, #e5e7eb); border-radius: 7px;
  background: transparent; color: var(--color-text, #1f2937);
}
.np-mini:hover { background: var(--color-surface-hover, #f3f4f6); }
.np-mini.on { border-color: var(--el-color-primary, #2563eb); color: var(--el-color-primary, #2563eb); }
.np-primary {
  padding: 6px 14px; font-size: 13px; cursor: pointer;
  border: none; border-radius: 7px; background: var(--el-color-primary, #2563eb); color: #fff;
}
.np-primary:disabled { opacity: .6; cursor: default; }
.np-sort {
  margin-left: 0; padding: 5px 6px; font-size: 12px; border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 7px; background: transparent; color: inherit;
}
.np-view-item {
  padding: 6px 10px; border-radius: 7px; cursor: pointer;
  font-size: 13px; color: var(--color-text, #1f2937); margin-top: 2px;
}
.np-view-item:hover { background: var(--color-surface-hover, #f3f4f6); }
.np-view-item.active { background: var(--color-surface-hover, #f3f4f6); font-weight: 600; }
.np-side-label {
  margin-top: 8px; padding: 0 10px 2px;
  font-size: 11px; color: var(--color-text-tertiary, #9ca3af);
}
.np-cat-item {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 10px; border-radius: 7px; cursor: pointer;
  font-size: 13px; color: var(--color-text, #1f2937);
}
.np-cat-item:hover { background: var(--color-surface-hover, #f3f4f6); }
.np-cat-item.active { background: var(--color-surface-hover, #f3f4f6); font-weight: 600; }
.np-cat-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.np-count { font-size: 11px; color: var(--color-text-tertiary, #9ca3af); }
.np-cat-ops { display: none; gap: 2px; }
.np-cat-item:hover .np-cat-ops { display: inline-flex; }
.np-ghost-btn {
  border: none; background: transparent; cursor: pointer;
  font-size: 12px; color: var(--color-text-tertiary, #9ca3af); padding: 0 3px;
}
.np-ghost-btn:hover { color: var(--el-color-primary, #2563eb); }
.np-cat-create input {
  width: 100%; padding: 5px 8px; font-size: 12px; margin-top: 2px;
  border: 1px solid var(--color-border, #e5e7eb); border-radius: 6px;
  background: transparent; color: inherit; outline: none;
}
.np-add-cat { margin: 4px 10px 2px 0; align-self: flex-start; border-style: dashed; }

/* 到期红条（列表上方） */
.np-due-bar {
  display: flex; align-items: center; gap: 8px; padding: 6px 12px;
  font-size: 12px; color: #b91c1c; background: #fef2f2;
  border-bottom: 1px solid #fecaca; flex-shrink: 0;
}
.np-due-dot { width: 8px; height: 8px; border-radius: 50%; background: #dc2626; flex-shrink: 0; }
.np-due-bar .np-mini { margin-left: auto; }

/* 列表独立滚动 */
.np-list { flex: 1; overflow: auto; min-height: 0; }
.np-empty { padding: 30px 0; text-align: center; color: var(--color-text-tertiary, #9ca3af); font-size: 13px; }
.np-row { padding: 10px 12px; border-bottom: 1px solid var(--color-border, #f0f0f0); cursor: pointer; }
.np-row:hover { background: var(--color-surface-hover, #f9fafb); }
.np-row.is-pinned { background: var(--color-surface-hover, #f5f6f8); }
.np-row.is-active { background: var(--color-surface-hover, #eef2ff); box-shadow: inset 3px 0 0 var(--el-color-primary, #2563eb); }
.np-row.is-due { box-shadow: inset 3px 0 0 #dc2626; }
.np-row.is-due.is-active { box-shadow: inset 3px 0 0 var(--el-color-primary, #2563eb); }
.np-row-title { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; color: var(--color-text, #1f2937); }
.np-row-title-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.np-row-sub { margin-top: 3px; font-size: 12px; color: var(--color-text-tertiary, #9ca3af); }
.np-row-summary { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.np-row-chips { display: flex; align-items: center; gap: 6px; margin-top: 5px; flex-wrap: wrap; }
.np-row-time { margin-left: auto; font-size: 11px; color: var(--color-text-tertiary, #9ca3af); flex-shrink: 0; }
.np-star { border: none; background: transparent; cursor: pointer; font-size: 14px; color: var(--color-text-tertiary, #9ca3af); padding: 0; flex-shrink: 0; }
.np-star.on { color: #f59e0b; }
.np-chip {
  flex-shrink: 0; padding: 1px 7px; font-size: 11px; border-radius: 99px;
  background: var(--color-surface-hover, #f3f4f6); color: var(--color-text-secondary, #6b7280);
}
.np-chip-plan { background: #eff6ff; color: #1d4ed8; }
.np-chip-src { background: #f0fdf4; color: #15803d; }
.np-chip-overdue { background: #fef2f2; color: #b91c1c; }
.np-chip-today { background: #fff7ed; color: #c2410c; }
.np-chip-future { background: #f3f4f6; color: #6b7280; }

/* ── 右主区：记录与查看 ── */
.np-main { overflow: hidden; }
/* 沉浸态（照学习模式沉浸台）：整屏只留当前笔记 */
.np-main.immersive {
  position: fixed; inset: 0; z-index: 3000;
  border-radius: 0; border: none;
}
.np-main.immersive .np-main-head { padding: 16px 32px 4px; }
.np-main.immersive .np-main-meta { padding: 6px 32px; }
.np-main.immersive .np-main-body { margin: 8px 32px 24px; }
.np-main.immersive .np-editor { font-size: 15px; }
.np-main.immersive .np-editor-preview { font-size: 15px; }
.np-main-head {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 16px 20px 4px; flex-shrink: 0;
}
.np-title-input {
  flex: 1; min-width: 0; font-size: 22px; font-weight: 700; padding: 4px 10px;
  border: 1px solid var(--color-border, #e5e7eb); border-radius: 8px;
  background: transparent; color: inherit; outline: none;
}
.np-title-view {
  flex: 1; min-width: 0; font-size: 22px; margin: 0; overflow-wrap: anywhere;
  line-height: 1.3;
}
.np-detail-ops { display: flex; gap: 6px; flex-shrink: 0; padding-top: 2px; align-items: center; }
/* 形态三态切换器（编辑 / 双栏 / 查看） */
.np-mode-switch {
  display: inline-flex; align-items: center;
  border: 1px solid var(--color-border, #e5e7eb); border-radius: 7px; overflow: hidden;
  margin-right: 4px;
}
.np-mode-btn {
  padding: 5px 12px; font-size: 12px; cursor: pointer;
  border: none; background: transparent; color: var(--color-text-secondary, #6b7280);
}
.np-mode-btn + .np-mode-btn { border-left: 1px solid var(--color-border, #e5e7eb); }
.np-mode-btn.on { background: var(--el-color-primary, #2563eb); color: #fff; }
.np-mode-btn:not(.on):hover { background: var(--color-surface-hover, #f3f4f6); }
.np-danger:hover { color: #b91c1c; border-color: #b91c1c; }
.np-main-meta {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 6px 20px; flex-shrink: 0;
}
.np-meta-label { font-size: 12px; color: var(--color-text-tertiary, #9ca3af); }
.np-cat-input {
  padding: 4px 8px; font-size: 12px;
  border: 1px solid var(--color-border, #e5e7eb); border-radius: 6px;
  background: transparent; color: inherit; outline: none;
}
.np-remind { font-size: 12px; color: var(--color-text-secondary, #6b7280); display: inline-flex; align-items: center; gap: 4px; }
.np-main-body {
  flex: 1; min-height: 0; display: grid; gap: 0;
  /* ★ 行高必须钉 minmax(0,1fr)：默认 auto 行会让子元素 height:100% 失效（编辑区塌成内容高） */
  grid-template-rows: minmax(0, 1fr);
  border-top: 1px solid var(--color-border, #e5e7eb); margin: 8px 20px 14px;
  border-radius: 8px; overflow: hidden;
  border: 1px solid var(--color-border, #e5e7eb);
}
/* 三态：编辑=满宽写 / 双栏=左写右预览（列宽由 :style 比例驱动，中间把手可拖）/ 查看=满宽读 */
.np-main-body.mode-edit { grid-template-columns: minmax(0, 1fr); }
.np-main-body.mode-split { grid-template-columns: minmax(0, 1fr) 8px minmax(0, 1fr); }
.np-main-body.mode-view { grid-template-columns: minmax(0, 1fr); }
/* 双栏分隔把手 */
.np-split-resizer { position: relative; cursor: col-resize; touch-action: none; }
.np-split-resizer::after {
  content: ""; position: absolute; top: 8px; bottom: 8px; left: 3px; width: 2px;
  border-radius: 2px; background: var(--color-border, #e5e7eb); transition: background .15s ease;
}
.np-split-resizer:hover::after, .np-split-resizer:active::after { background: var(--el-color-primary, #2563eb); }
.np-editor {
  display: block; width: 100%; height: 100%;
  border: none; resize: none; outline: none; padding: 14px 16px;
  font-size: 14px; line-height: 1.7; font-family: inherit;
  background: transparent; color: inherit; border-right: 1px solid var(--color-border, #e5e7eb);
}
.np-editor-preview { height: 100%; min-height: 0; overflow: auto; }

/* 主区空态 */
.np-empty-main {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  color: var(--color-text-tertiary, #9ca3af); font-size: 14px;
}
.np-empty-actions { display: flex; gap: 10px; }

/* 窄屏：两栏改单列堆叠，拖拽把手隐藏 */
@media (max-width: 900px) {
  .notes-page { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .np-col-resizer { display: none; }
  .np-side { max-height: 45vh; }
}

/* ── 移动端记录详情 / 编辑 ── */
.nmd-mask {
  position: fixed;
  inset: 0;
  z-index: 6100;
  display: flex;
  background: var(--color-bg);
}

.nmd-sheet {
  display: flex;
  width: 100%;
  min-height: 0;
  flex-direction: column;
  padding-top: env(safe-area-inset-top, 0px);
  background: var(--color-bg);
  color: var(--color-text);
}

.nmd-head {
  display: grid;
  min-height: 58px;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 9px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 92%, transparent);
  backdrop-filter: blur(14px);
}

.nmd-head > button {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: var(--color-text-secondary);
}

.nmd-head > button:active {
  background: var(--color-surface-hover);
}

.nmd-head > div {
  min-width: 0;
}

.nmd-head small,
.nmd-head strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nmd-head small {
  color: var(--color-text-tertiary);
  font-size: 10px;
}

.nmd-head strong {
  margin-top: 1px;
  font-size: 13px;
}

.nmd-read,
.nmd-edit {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 18px 16px 96px;
}

.nmd-read h2 {
  margin: 0;
  font-size: 25px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.nmd-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.nmd-meta span {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--color-surface-hover);
  color: var(--color-text-tertiary);
  font-size: 9px;
}

.nmd-values {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin: 20px 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-border);
}

.nmd-values > div {
  min-width: 0;
  padding: 11px 12px;
  background: var(--color-surface);
}

.nmd-values dt {
  color: var(--color-text-tertiary);
  font-size: 9px;
}

.nmd-values dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  font-size: 13px;
  font-weight: 650;
}

.nmd-markdown {
  font-size: 15px;
  line-height: 1.8;
}

.nmd-empty-content {
  margin: 24px 0;
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.nmd-edit {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.nmd-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nmd-field > span {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 650;
}

.nmd-field input,
.nmd-field select,
.nmd-field textarea {
  width: 100%;
  min-height: 46px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  outline: none;
  resize: vertical;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 14px;
}

.nmd-field.title input {
  min-height: 56px;
  padding: 6px 2px;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  border-radius: 0;
  background: transparent;
  font-size: 23px;
  font-weight: 750;
}

.nmd-field input:focus,
.nmd-field select:focus,
.nmd-field textarea:focus {
  border-color: var(--color-primary);
}

.nmd-error {
  margin: 0;
  color: #b54737;
  font-size: 11px;
}

.nmd-actions {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  grid-template-columns: minmax(0, 0.75fr) minmax(0, 1.25fr);
  gap: 9px;
  padding: 10px 14px calc(12px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 94%, transparent);
  backdrop-filter: blur(14px);
}

.nmd-actions button {
  display: inline-flex;
  min-height: 50px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
}

.nmd-actions button.primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

.nmd-actions button.danger {
  color: #a64a3c;
}

.nmd-actions button:disabled {
  opacity: 0.58;
}

.nmd-enter-active,
.nmd-leave-active {
  transition: opacity 160ms ease, transform 200ms ease;
}

.nmd-enter-from,
.nmd-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

@media (max-width: 360px) {
  .nmd-values {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nmd-enter-active,
  .nmd-leave-active {
    transition: none;
  }
}
</style>
