<script setup lang="ts">
import { computed, type Component } from 'vue';
import {
  BookOpenText,
  CheckCircle2,
  ChevronRight,
  FolderTree,
  ListChecks,
  NotebookPen,
  PackageCheck,
  PackagePlus,
  Search,
  Settings2,
  SunMedium,
  Timer,
  TrendingUp,
  WalletCards,
} from 'lucide-vue-next';
import type {
  NoteDictionaryDefinition,
  NoteTemplateDefinition,
  NoteTemplateKind,
} from '@yan-zhi/shared';
import {
  computeNoteTotals,
  dateGroupLabel,
  groupNotesByDay,
  noteBusinessTime,
  noteDisplayTitle,
  noteListChips,
  templateForNote,
  templateKindForNote,
  type NoteViewItem,
} from './notes-view-model';

export type MobileNoteFilter =
  | 'today'
  | 'all'
  | 'journal'
  | 'expense'
  | 'income'
  | 'purchase'
  | 'sale'
  | 'time'
  | 'task'
  | 'starred';

export interface MobileNoteCategory {
  id: string;
  name: string;
  parentId: string | null;
  path: string[];
  depth: number;
  count: number;
}

export interface MobileNoteTotals {
  expense: number;
  income: number;
  purchase: number;
  sale: number;
  minutes: number;
  net?: number;
}

const props = defineProps<{
  notes: readonly NoteViewItem[];
  categories: readonly MobileNoteCategory[];
  templates: readonly NoteTemplateDefinition[];
  dictionaries: readonly NoteDictionaryDefinition[];
  loading: boolean;
  query: string;
  filter: MobileNoteFilter;
  categoryId: string;
  todayTotals?: MobileNoteTotals | null;
}>();

const emit = defineEmits<{
  'update:query': [value: string];
  'update:filter': [value: MobileNoteFilter];
  'update:categoryId': [value: string];
  create: [templateId?: string];
  open: [note: NoteViewItem];
  manage: [];
  'manage-directories': [];
  analytics: [];
  toggleTask: [note: NoteViewItem];
}>();

const ICONS: Record<NoteTemplateKind, Component> = {
  note: NotebookPen,
  journal: SunMedium,
  expense: WalletCards,
  income: TrendingUp,
  purchase: PackagePlus,
  sale: PackageCheck,
  time: Timer,
  task: ListChecks,
  custom: BookOpenText,
};
const FILTERS: Array<{ key: MobileNoteFilter; label: string }> = [
  { key: 'today', label: '今天' },
  { key: 'all', label: '全部' },
  { key: 'expense', label: '支出' },
  { key: 'income', label: '收入' },
  { key: 'purchase', label: '进货' },
  { key: 'sale', label: '出货' },
  { key: 'journal', label: '日记' },
  { key: 'time', label: '时间' },
  { key: 'task', label: '计划' },
  { key: 'starred', label: '收藏' },
];
const quickTemplates = computed(() => {
  const preferred = [
    'template.expense',
    'template.journal',
    'template.purchase',
    'template.sale',
    'template.time',
    'template.task',
  ];
  return preferred
    .map((id) => props.templates.find((template) => template.id === id))
    .filter((template): template is NoteTemplateDefinition => !!template);
});
const totals = computed(() => props.todayTotals || computeNoteTotals(props.notes, props.templates));
const filteredNotes = computed(() => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return props.notes.filter((note) => {
    const kind = templateKindForNote(note, props.templates);
    if (props.filter === 'today' && (noteBusinessTime(note) < start.getTime() || noteBusinessTime(note) >= end.getTime())) return false;
    if (props.filter === 'starred' && !note.starred) return false;
    if (!['today', 'all', 'starred'].includes(props.filter) && kind !== props.filter) return false;
    return true;
  });
});
const groups = computed(() => groupNotesByDay(filteredNotes.value));
const selectedDirectoryLabel = computed(() => {
  if (props.categoryId === '__all__') return '全部目录';
  const selected = props.categories.find((item) => item.id === props.categoryId);
  return selected?.path?.join(' / ') || selected?.name || '全部目录';
});

function templateOf(note: NoteViewItem): NoteTemplateDefinition | undefined {
  return templateForNote(note, props.templates);
}

function kindOf(note: NoteViewItem): NoteTemplateKind {
  return templateKindForNote(note, props.templates);
}

function iconOf(note: NoteViewItem): Component {
  return ICONS[kindOf(note)] || NotebookPen;
}

function moneyLabel(note: NoteViewItem): string {
  const kind = kindOf(note);
  const raw = kind === 'purchase' || kind === 'sale'
    ? note.data.total
    : kind === 'expense' || kind === 'income'
      ? note.data.amount
      : null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number <= 0) return '';
  if (kind === 'expense' || kind === 'purchase') return `-¥${number.toFixed(2)}`;
  if (kind === 'income' || kind === 'sale') return `+¥${number.toFixed(2)}`;
  return '';
}

function timeLabel(note: NoteViewItem): string {
  if (kindOf(note) !== 'time') return '';
  const minutes = Number(note.data.durationMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}小时${rest}分` : `${hours}小时`;
}

function rowTime(note: NoteViewItem): string {
  const date = new Date(noteBusinessTime(note));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function chipsOf(note: NoteViewItem): string[] {
  return noteListChips(note, templateOf(note), props.dictionaries)
    .filter((chip) => !/^[-+]?¥/.test(chip));
}
</script>

<template>
  <div class="nmh-page">
    <section class="nmh-toolbar" aria-label="搜索与设置">
      <label class="nmh-search">
        <Search :size="17" />
        <input
          :value="query"
          type="search"
          placeholder="搜索标题、正文和记录"
          @input="emit('update:query', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <button type="button" class="nmh-manage" aria-label="管理模板与字典" @click="emit('manage')">
        <Settings2 :size="19" />
      </button>
    </section>

    <div class="nmh-filter-rail" role="tablist" aria-label="记录类型">
      <button
        v-for="item in FILTERS"
        :key="item.key"
        type="button"
        role="tab"
        :aria-selected="filter === item.key"
        :class="{ active: filter === item.key }"
        @click="emit('update:filter', item.key)"
      >{{ item.label }}</button>
    </div>

    <button type="button" class="nmh-directory" @click="emit('manage-directories')">
      <FolderTree :size="16" />
      <span>{{ selectedDirectoryLabel }}</span>
      <ChevronRight :size="16" />
    </button>

    <section class="nmh-summary" aria-label="今日记录概览">
      <div><span>支出</span><strong>¥{{ totals.expense.toFixed(2) }}</strong></div>
      <div><span>进货</span><strong>¥{{ totals.purchase.toFixed(2) }}</strong></div>
      <div><span>出货</span><strong>¥{{ totals.sale.toFixed(2) }}</strong></div>
      <div><span>时间</span><strong>{{ totals.minutes }}<small>分</small></strong></div>
    </section>

    <div class="nmh-quick-head">
      <strong>最近模板</strong>
      <span>
        <button type="button" @click="emit('analytics')">统计</button>
        <button type="button" @click="emit('manage')">管理</button>
      </span>
    </div>
    <div class="nmh-quick-rail">
      <button
        v-for="template in quickTemplates"
        :key="template.id"
        type="button"
        class="nmh-quick"
        :data-tone="template.tone"
        @click="emit('create', template.id)"
      >
        <span><component :is="ICONS[template.kind]" :size="18" /></span>
        <b>{{ template.name }}</b>
      </button>
      <button type="button" class="nmh-quick is-more" @click="emit('create')">
        <span><NotebookPen :size="18" /></span>
        <b>全部</b>
      </button>
    </div>

    <section class="nmh-feed" aria-live="polite">
      <div v-if="loading" class="nmh-state" aria-busy="true">
        <span class="nmh-skeleton"></span>
        <span class="nmh-skeleton"></span>
        <span class="nmh-skeleton"></span>
      </div>
      <div v-else-if="!filteredNotes.length" class="nmh-empty">
        <NotebookPen :size="28" />
        <strong>{{ query ? '没有匹配的记录' : '今天还没有记录' }}</strong>
        <span>{{ query ? '换个关键词或目录试试' : '从一笔支出、一篇日记或一个计划开始' }}</span>
        <button type="button" @click="emit('create')">开始记录</button>
      </div>
      <template v-else>
        <section v-for="group in groups" :key="group.day" class="nmh-day">
          <header>
            <strong>{{ dateGroupLabel(group.day) }}</strong>
            <span>{{ group.items.length }} 条</span>
          </header>
          <article
            v-for="note in group.items"
            :key="note.id"
            class="nmh-record"
            :class="{ 'is-task': kindOf(note) === 'task' }"
            :data-kind="kindOf(note)"
          >
            <button type="button" class="nmh-record-open" @click="emit('open', note)">
              <span class="nmh-record-icon"><component :is="iconOf(note)" :size="18" /></span>
              <span class="nmh-record-main">
                <span class="nmh-record-title">
                  <b :class="{ done: kindOf(note) === 'task' && note.data.done === true }">{{ noteDisplayTitle(note, templateOf(note)) }}</b>
                  <em v-if="moneyLabel(note)" :class="{ expense: kindOf(note) === 'expense' || kindOf(note) === 'purchase' }">
                    {{ moneyLabel(note) }}
                  </em>
                  <em v-else-if="timeLabel(note)">{{ timeLabel(note) }}</em>
                </span>
                <span v-if="chipsOf(note).length" class="nmh-chips">
                  <i v-for="chip in chipsOf(note)" :key="chip">{{ chip }}</i>
                </span>
                <span class="nmh-record-meta">
                  {{ rowTime(note) }}
                  <template v-if="note.categoryName"> · {{ note.categoryName }}</template>
                  <template v-if="note.starred"> · 已收藏</template>
                </span>
              </span>
            </button>
            <button
              v-if="kindOf(note) === 'task'"
              type="button"
              class="nmh-task-toggle"
              :class="{ done: note.data.done === true }"
              :aria-label="note.data.done === true ? '标记任务为未完成' : '标记任务为已完成'"
              @click="emit('toggleTask', note)"
            >
              <CheckCircle2 :size="20" />
            </button>
          </article>
        </section>
      </template>
    </section>

    <button type="button" class="nmh-fab" aria-label="新建记录" @click="emit('create')">
      <NotebookPen :size="20" />
      <span>记一笔</span>
    </button>
  </div>
</template>

<style scoped>
.nmh-page {
  position: relative;
  height: 100%;
  overflow-y: auto;
  padding: 8px 0 calc(96px + env(safe-area-inset-bottom, 0px));
  background: var(--color-bg);
}

.nmh-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  gap: 8px;
  padding: 0 12px;
}

.nmh-search {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border: 1px solid var(--color-border);
  border-radius: 11px;
  background: var(--color-surface);
  color: var(--color-text-tertiary);
}

.nmh-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
}

.nmh-manage {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 11px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
}

.nmh-filter-rail {
  display: flex;
  gap: 5px;
  overflow-x: auto;
  scrollbar-width: none;
}

.nmh-filter-rail::-webkit-scrollbar {
  display: none;
}

.nmh-filter-rail {
  padding: 9px 12px 4px;
}

.nmh-filter-rail button {
  min-height: 44px;
  flex: none;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
}

.nmh-filter-rail button.active {
  background: var(--color-text);
  color: var(--color-surface);
}

.nmh-directory {
  display: flex;
  width: calc(100% - 24px);
  min-height: 44px;
  align-items: center;
  gap: 7px;
  margin: 0 12px 8px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  text-align: left;
}

.nmh-directory span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nmh-directory:active {
  background: var(--color-surface-hover);
}

.nmh-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0 12px 10px;
  padding: 10px 0;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.nmh-summary > div {
  min-width: 0;
  padding: 0 8px;
  border-left: 1px solid var(--color-border);
}

.nmh-summary > div:first-child {
  border-left: 0;
  padding-left: 0;
}

.nmh-summary span,
.nmh-summary strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nmh-summary span {
  color: var(--color-text-tertiary);
  font-size: 9px;
}

.nmh-summary strong {
  margin-top: 2px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.nmh-summary small {
  margin-left: 2px;
  color: var(--color-text-tertiary);
  font-size: 9px;
}

.nmh-quick-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 7px;
}

.nmh-quick-head strong {
  font-size: 12px;
}

.nmh-quick-head > span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nmh-quick-head button {
  min-width: 44px;
  min-height: 44px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  font: inherit;
  font-size: 10px;
}

.nmh-quick-rail {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 0 12px 11px;
  scrollbar-width: none;
}

.nmh-quick-rail::-webkit-scrollbar {
  display: none;
}

.nmh-quick {
  display: inline-flex;
  min-height: 44px;
  flex: none;
  align-items: center;
  gap: 6px;
  padding: 0 10px 0 6px;
  border: 1px solid var(--color-border);
  border-radius: 11px;
  background: var(--color-surface);
  color: var(--color-text);
}

.nmh-quick > span {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.nmh-quick b {
  font-size: 11px;
  white-space: nowrap;
}

.nmh-quick[data-tone='rose'] > span {
  background: #fdf0ef;
  color: #b84f43;
}

.nmh-quick[data-tone='emerald'] > span {
  background: #edf8f2;
  color: #2f7a5b;
}

.nmh-quick[data-tone='orange'] > span {
  background: #fff4e9;
  color: #b86a2c;
}

.nmh-quick[data-tone='blue'] > span {
  background: #eef5fc;
  color: #3f6e9c;
}

.nmh-quick[data-tone='violet'] > span {
  background: #f3f1fc;
  color: #6559a7;
}

.nmh-feed {
  border-top: 8px solid var(--color-surface-hover);
}

.nmh-day > header {
  display: flex;
  min-height: 40px;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  color: var(--color-text-secondary);
}

.nmh-day > header strong {
  font-size: 12px;
}

.nmh-day > header span {
  color: var(--color-text-tertiary);
  font-size: 9px;
}

.nmh-record {
  display: grid;
  width: 100%;
  min-height: 66px;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
}

.nmh-record.is-task {
  grid-template-columns: minmax(0, 1fr) 48px;
}

.nmh-record-open {
  display: grid;
  min-width: 0;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: start;
  gap: 9px;
  padding: 10px 14px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.nmh-record.is-task .nmh-record-open {
  padding-right: 2px;
}

.nmh-record-open:active {
  background: var(--color-surface-hover);
}

.nmh-record-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 10px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.nmh-record[data-kind='expense'] .nmh-record-icon,
.nmh-record[data-kind='purchase'] .nmh-record-icon {
  background: #fff3f0;
  color: #a6503e;
}

.nmh-record[data-kind='income'] .nmh-record-icon,
.nmh-record[data-kind='sale'] .nmh-record-icon {
  background: #edf8f2;
  color: #2f7a5b;
}

.nmh-record-main {
  min-width: 0;
}

.nmh-record-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.nmh-record-title b {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nmh-record-title b.done {
  color: var(--color-text-tertiary);
  text-decoration: line-through;
}

.nmh-task-toggle {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-tertiary);
}

.nmh-task-toggle.done {
  color: #2f7a5b;
}

.nmh-task-toggle:active {
  background: var(--color-surface-hover);
}

.nmh-record-title em {
  flex: none;
  color: #2f7a5b;
  font-size: 12px;
  font-style: normal;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.nmh-record-title em.expense {
  color: #a6503e;
}

.nmh-chips {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  overflow: hidden;
}

.nmh-chips i {
  flex: none;
  max-width: 108px;
  overflow: hidden;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
  font-size: 9px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nmh-record-meta {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: var(--color-text-tertiary);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nmh-state {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
}

.nmh-skeleton {
  height: 62px;
  border-radius: 10px;
  background: linear-gradient(90deg, var(--color-surface-hover), var(--color-surface), var(--color-surface-hover));
  background-size: 220% 100%;
  animation: nmh-shimmer 1.2s linear infinite;
}

.nmh-empty {
  display: grid;
  justify-items: center;
  gap: 5px;
  padding: 42px 24px;
  color: var(--color-text-tertiary);
  text-align: center;
}

.nmh-empty strong {
  color: var(--color-text);
  font-size: 14px;
}

.nmh-empty span {
  max-width: 280px;
  font-size: 11px;
  line-height: 1.6;
}

.nmh-empty button {
  min-height: 44px;
  margin-top: 7px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  background: var(--color-primary);
  color: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.nmh-fab {
  position: fixed;
  right: 16px;
  bottom: calc(var(--mobile-tabbar-h, 60px) + 14px + env(safe-area-inset-bottom, 0px));
  z-index: 90;
  display: inline-flex;
  min-height: 50px;
  align-items: center;
  gap: 6px;
  padding: 0 16px 0 13px;
  border: 0;
  border-radius: 999px;
  background: var(--color-primary);
  color: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 10px 26px color-mix(in srgb, var(--color-primary) 35%, transparent);
}

.nmh-fab:active {
  transform: scale(0.97);
}

@keyframes nmh-shimmer {
  from { background-position: 100% 0; }
  to { background-position: -100% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .nmh-skeleton {
    animation: none;
  }
}
</style>
