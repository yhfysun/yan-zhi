<script setup lang="ts">
// 笔记工作区（docs/笔记功能方案-2026-11-14.md §5）：独立功能页 /notes，三栏骨架照 Learning.vue 契约。
// 左=分类树（全部/收藏/计划/未分类/分类），中=筛选固定顶部+列表独立滚动，右=详情/编辑。
// 极简规范：无多余图标与 tip 文案；分类控件 = 既有下拉 + 直接键入新名字（提交自动创建）。
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api/client';
import MarkdownPreview from '../components/code/MarkdownPreview.vue';
import { planChipState, planChipLabel, toLocalInputValue, fromLocalInputValue, noteTimeLabel } from '../utils/notePlan';
import { useAuthStore } from '../stores/auth';

type NoteItem = {
  id: string; kind: 'note' | 'plan'; categoryId: string | null; categoryName: string | null;
  title: string; content: string; source: string | null; pinned: boolean; starred: boolean;
  planAt: number | null; remindAt: number | null; remindDone: boolean; createdAt: number; updatedAt: number;
};
type CategoryItem = { id: string; name: string; sort: number; count: number };
type DueItem = { id: string; text: string };

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

function unwrap<T>(r: unknown): T | null {
  if (r && typeof r === 'object' && 'data' in r) return (r as { data: T }).data;
  return null;
}

// ── 数据 ──
const categories = ref<CategoryItem[]>([]);
const notes = ref<NoteItem[]>([]);
const dueItems = ref<DueItem[]>([]);
const loading = ref(true);

// 左栏选中：__all__ / __starred__ / __plan__ / __none__ / 分类 id
const leftSel = ref<string>('__all__');
const q = ref('');
const sort = ref<'updated' | 'created' | 'plan'>('updated');

// 右栏编辑副本（保存时才落库）
const draft = ref<NoteItem | null>(null);
const editing = ref(false);
const previewMode = ref(false);
const saving = ref(false);
const newCategoryName = ref('');
const creatingCategory = ref(false);

const realCategories = computed(() => categories.value.filter((c) => c.id !== '__none__'));
const selectedCount = computed(() => notes.value.length);

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
  // Web 端无系统通知：到期提醒以顶部红点 + 列表高亮呈现；桌面端轮询走 drain，两端并存互不干扰
  const data = unwrap<{ items: DueItem[] }>(await api.get('/notes/reminders/due'));
  dueItems.value = data?.items || [];
}

async function refreshAll() {
  await Promise.all([loadCategories(), loadNotes(), loadDue()]);
}

async function ackDue() {
  const ids = dueItems.value.map((d) => d.id);
  if (!ids.length) return;
  await api.post('/notes/reminders/ack', { ids });
  dueItems.value = [];
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

// ── 中栏 ──
async function selectNote(n: NoteItem) {
  editing.value = false;
  previewMode.value = false;
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
  editing.value = true;
}

function rowClass(n: NoteItem): string {
  const cls: string[] = [];
  if (n.pinned) cls.push('is-pinned');
  if (draft.value?.id === n.id) cls.push('is-active');
  if (dueItems.value.some((d) => d.id === n.id)) cls.push('is-due');
  const st = planChipState(n.planAt);
  if (st === 'overdue') cls.push('row-overdue');
  return cls.join(' ');
}

// ── 右栏 ──
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
  if (!draft.value || !editing.value) return;
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
  await refreshAll();
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
onBeforeUnmount(() => { offOpen?.(); });

// 未登录（guest 路由防御）：页面仍渲染骨架，接口由 authMiddleware 拦
const isGuest = computed(() => !auth.isLoggedIn);
</script>

<template>
  <div class="notes-page">
    <!-- 左：分类 -->
    <aside class="np-col-left np-card">
      <div class="np-side-item" :class="{ active: leftSel === '__all__' }" @click="selectLeft('__all__')">全部 <span class="np-count">{{ selectedCount && leftSel === '__all__' ? notes.length : '' }}</span></div>
      <div class="np-side-item" :class="{ active: leftSel === '__starred__' }" @click="selectLeft('__starred__')">★ 收藏</div>
      <div class="np-side-item" :class="{ active: leftSel === '__plan__' }" @click="selectLeft('__plan__')">☑ 计划</div>
      <div class="np-side-item" :class="{ active: leftSel === '__none__' }" @click="selectLeft('__none__')">未分类</div>
      <div class="np-side-divider"></div>
      <div v-for="c in realCategories" :key="c.id" class="np-side-item np-cat" :class="{ active: leftSel === c.id }" @click="selectLeft(c.id)">
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
      <button v-else class="np-mini" @click="creatingCategory = true">+ 新分类</button>
    </aside>

    <!-- 中：筛选固定顶部 + 列表独立滚动 -->
    <section class="np-col-mid np-card">
      <div class="np-filter">
        <input v-model="q" class="np-search" placeholder="搜索标题与内容" @keyup.enter="loadNotes" @input="loadNotes" />
        <select v-model="sort" class="np-sort" @change="loadNotes">
          <option value="updated">更新时间</option>
          <option value="created">创建时间</option>
          <option value="plan">计划时间</option>
        </select>
        <button class="np-mini" @click="createNew('note')">+ 笔记</button>
        <button class="np-mini" @click="createNew('plan')">+ 计划</button>
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
              <span>{{ n.title }}</span>
              <span v-if="n.kind === 'plan'" class="np-chip np-chip-plan">计划</span>
            </div>
            <div class="np-row-sub">
              <span class="np-row-summary">{{ n.content.slice(0, 60) || '（无正文）' }}</span>
              <span v-if="n.categoryName" class="np-chip">{{ n.categoryName }}</span>
              <span v-if="n.planAt" class="np-chip np-chip-time" :class="'np-chip-' + planChipState(n.planAt)">{{ planChipLabel(n.planAt) }}</span>
              <span class="np-row-time">{{ noteTimeLabel(n.updatedAt) }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 右：详情/编辑 -->
    <section class="np-col-right np-card">
      <template v-if="draft">
        <div class="np-detail-head">
          <input v-if="editing" v-model="draft.title" class="np-title-input" placeholder="标题" />
          <h2 v-else class="np-title-view">{{ draft.title }}</h2>
          <div class="np-detail-ops">
            <template v-if="editing">
              <button class="np-primary" :disabled="saving" @click="saveDraft">{{ saving ? '保存中…' : '保存' }}</button>
              <button class="np-mini" @click="editing = false">取消</button>
            </template>
            <template v-else>
              <button class="np-mini" @click="editing = true">编辑</button>
              <button class="np-mini" :class="{ on: draft.pinned }" @click="togglePinDraft">{{ draft.pinned ? '已置顶' : '置顶' }}</button>
              <button class="np-mini np-danger" @click="removeDraft">删除</button>
            </template>
          </div>
        </div>
        <div class="np-detail-meta">
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
        </div>
        <div v-if="draft.kind === 'plan'" class="np-detail-meta">
          <span class="np-meta-label">计划时间</span>
          <input v-model="planInput" type="datetime-local" class="np-cat-input" :disabled="!editing" />
          <label class="np-remind"><input v-model="remindOn" type="checkbox" :disabled="!editing" /> 到点提醒</label>
        </div>
        <div class="np-detail-body">
          <template v-if="editing">
            <textarea v-model="draft.content" class="np-editor" placeholder="Markdown…"></textarea>
            <MarkdownPreview :content="draft.content" class="np-editor-preview" />
          </template>
          <MarkdownPreview v-else :content="draft.content || '（无正文）'" class="np-editor-preview solo" />
        </div>
      </template>
      <div v-else class="np-empty">选择左侧一条笔记</div>
    </section>
  </div>
</template>

<style scoped>
.notes-page {
  display: grid;
  grid-template-columns: 190px 1fr 400px;
  gap: 10px;
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
/* 左栏 */
.np-col-left { padding: 10px 8px; overflow: auto; }
.np-side-item {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 10px; border-radius: 7px; cursor: pointer;
  font-size: 13px; color: var(--color-text, #1f2937);
}
.np-side-item:hover { background: var(--color-surface-hover, #f3f4f6); }
.np-side-item.active { background: var(--color-surface-hover, #f3f4f6); font-weight: 600; }
.np-cat-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.np-count { font-size: 11px; color: var(--color-text-tertiary, #9ca3af); }
.np-cat-ops { display: none; gap: 2px; }
.np-cat:hover .np-cat-ops { display: inline-flex; }
.np-ghost-btn {
  border: none; background: transparent; cursor: pointer;
  font-size: 12px; color: var(--color-text-tertiary, #9ca3af); padding: 0 3px;
}
.np-ghost-btn:hover { color: var(--el-color-primary, #2563eb); }
.np-side-divider { height: 1px; background: var(--color-border, #e5e7eb); margin: 8px 4px; }
.np-cat-create input {
  width: 100%; padding: 5px 8px; font-size: 12px;
  border: 1px solid var(--color-border, #e5e7eb); border-radius: 6px;
  background: transparent; color: inherit; outline: none;
}
/* 中栏 */
.np-filter {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-bottom: 1px solid var(--color-border, #e5e7eb);
  flex-shrink: 0;
}
.np-search {
  flex: 1; min-width: 0; padding: 6px 10px; font-size: 13px;
  border: 1px solid var(--color-border, #e5e7eb); border-radius: 7px;
  background: transparent; color: inherit; outline: none;
}
.np-search:focus { border-color: var(--el-color-primary, #2563eb); }
.np-sort {
  padding: 6px 8px; font-size: 12px; border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 7px; background: transparent; color: inherit;
}
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
.np-due-bar {
  display: flex; align-items: center; gap: 8px; padding: 6px 12px;
  font-size: 12px; color: #b91c1c; background: #fef2f2; border-bottom: 1px solid #fecaca;
  flex-shrink: 0;
}
.np-due-dot { width: 8px; height: 8px; border-radius: 50%; background: #dc2626; flex-shrink: 0; }
.np-due-bar .np-mini { margin-left: auto; }
.np-list { flex: 1; overflow: auto; min-height: 0; }
.np-empty { padding: 40px 0; text-align: center; color: var(--color-text-tertiary, #9ca3af); font-size: 13px; }
.np-row { padding: 10px 14px; border-bottom: 1px solid var(--color-border, #f0f0f0); cursor: pointer; }
.np-row:hover { background: var(--color-surface-hover, #f9fafb); }
.np-row.is-pinned { background: var(--color-surface-hover, #f5f6f8); }
.np-row.is-active { background: var(--color-surface-hover, #eef2ff); }
.np-row.is-due { box-shadow: inset 3px 0 0 #dc2626; }
.np-row-title { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; color: var(--color-text, #1f2937); }
.np-row-sub { display: flex; align-items: center; gap: 8px; margin-top: 4px; font-size: 12px; color: var(--color-text-tertiary, #9ca3af); }
.np-row-summary { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.np-row-time { flex-shrink: 0; }
.np-star { border: none; background: transparent; cursor: pointer; font-size: 14px; color: var(--color-text-tertiary, #9ca3af); padding: 0; }
.np-star.on { color: #f59e0b; }
.np-chip {
  flex-shrink: 0; padding: 1px 7px; font-size: 11px; border-radius: 99px;
  background: var(--color-surface-hover, #f3f4f6); color: var(--color-text-secondary, #6b7280);
}
.np-chip-plan { background: #eff6ff; color: #1d4ed8; }
.np-chip-overdue { background: #fef2f2; color: #b91c1c; }
.np-chip-today { background: #fff7ed; color: #c2410c; }
.np-chip-future { background: #f3f4f6; color: #6b7280; }
/* 右栏 */
.np-col-right { overflow: hidden; }
.np-detail-head {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px 6px; flex-shrink: 0;
}
.np-title-input {
  flex: 1; min-width: 0; font-size: 17px; font-weight: 700; padding: 4px 8px;
  border: 1px solid var(--color-border, #e5e7eb); border-radius: 7px;
  background: transparent; color: inherit; outline: none;
}
.np-title-view { flex: 1; min-width: 0; font-size: 17px; margin: 0; overflow-wrap: anywhere; }
.np-detail-ops { display: flex; gap: 6px; flex-shrink: 0; }
.np-danger:hover { color: #b91c1c; border-color: #b91c1c; }
.np-detail-meta {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 14px; flex-shrink: 0; flex-wrap: wrap;
}
.np-meta-label { font-size: 12px; color: var(--color-text-tertiary, #9ca3af); }
.np-cat-input {
  padding: 4px 8px; font-size: 12px;
  border: 1px solid var(--color-border, #e5e7eb); border-radius: 6px;
  background: transparent; color: inherit; outline: none;
}
.np-remind { font-size: 12px; color: var(--color-text-secondary, #6b7280); display: inline-flex; align-items: center; gap: 4px; }
.np-detail-body {
  flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 0;
  border-top: 1px solid var(--color-border, #e5e7eb); margin-top: 8px;
}
.np-editor {
  border: none; resize: none; outline: none; padding: 12px 14px;
  font-size: 13px; line-height: 1.6; font-family: inherit;
  background: transparent; color: inherit; border-right: 1px solid var(--color-border, #e5e7eb);
}
.np-editor-preview { min-height: 0; overflow: auto; }
.np-editor-preview.solo { grid-column: 1 / -1; }
/* 窄屏：三栏改单列堆叠 */
@media (max-width: 900px) {
  .notes-page { grid-template-columns: 1fr; grid-template-rows: auto 1fr auto; }
  .np-col-left { max-height: 180px; }
}
</style>
