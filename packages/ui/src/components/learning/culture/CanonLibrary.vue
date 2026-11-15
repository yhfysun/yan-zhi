<script setup lang="ts">
// 典籍文库页 —— 按「图书馆」做：筛选固定顶部不滚、列表独立滚动分页、每日一首卡置顶。
// 极简风格：无多余图标/tip；条目点击在右侧展开速览（原文全文 + tag + 诵读）。
// 文库层篇目无预写注解：只显示一行「AI 注解将在后续版本提供」，
// 绝不现编注解，也不调用不存在的 POST /canon/ask（当前 501）。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api } from '../../../api/client';
import { splitZhSentences, useZhSpeech } from '../../../composables/useZhSpeech';
import NoteQuickCreateDialog from '../../notes/NoteQuickCreateDialog.vue';
import type { CanonCollections, CanonWorkRow } from './culture-types';

const PAGE_SIZE = 50;

const collections = ref<CanonCollections | null>(null);
const daily = ref<CanonWorkRow | null>(null);
const items = ref<CanonWorkRow[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const error = ref('');

// 筛选（五个下拉 + 搜索框）
const q = ref('');
const genre = ref('');
const dynasty = ref('');
const collection = ref('');
const popularity = ref('');
const difficulty = ref('');

const POPULARITY_LABELS: Record<string, string> = {
  classic: '经典',
  notable: '冷门佳作',
  normal: '常规',
};

// ===== 诵读（useZhSpeech 共用实现：按句索引高亮、保留标点自然停顿、自动挑中文声线） =====
// ★ 修复记录：曾按「句内容匹配」高亮（spokenChunk === chunk），重复句（如关雎「窈窕淑女」）
//   两处同时亮 —— 现按句索引高亮；曾剥掉标点喂 TTS 导致整句连读生硬 —— 现保留标点。
const speech = useZhSpeech();
const speakActive = speech.active;
const spokenIndex = speech.index;
const previewTextEl = ref<HTMLElement | null>(null);
/** 当前朗读的原文（区分每日一首 / 速览两个入口的 toggle 语义） */
const speakingSource = ref('');

const selected = ref<CanonWorkRow | null>(null);

/** 朗读与渲染共用同一份切分（不再各自 match） */
const spokenLines = computed(() => (selected.value ? splitZhSentences(selected.value.text) : []));

watch(spokenIndex, async (i) => {
  if (!speakActive.value || i < 0) return;
  // 当句跟随滚动，不霸屏（block:'nearest' 只在出视口时滚）
  await nextTick();
  previewTextEl.value?.querySelector<HTMLElement>(`[data-sentence="${i}"]`)?.scrollIntoView({ block: 'nearest' });
});

function toggleSpeak(text: string) {
  // 同一篇再点 = 停止；换篇点 = 直接换播（每日一首与速览按钮共用）
  if (speakActive.value && speakingSource.value === text) { speech.stop(); return; }
  speakingSource.value = text;
  speech.start(splitZhSentences(text), { loop: 'none', rate: 0.9 });
}

// ===== 数据加载 =====
async function loadCollections() {
  const res = await api.get<CanonCollections>('/learning/culture/canon/collections');
  if (res && 'data' in res && res.data) collections.value = res.data;
}

async function loadDaily() {
  const res = await api.get<CanonWorkRow>('/learning/culture/canon/daily');
  if (res && 'data' in res && res.data) daily.value = res.data;
}

async function loadWorks() {
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams();
    if (q.value.trim()) params.set('q', q.value.trim());
    if (genre.value) params.set('genre', genre.value);
    if (dynasty.value) params.set('dynasty', dynasty.value);
    if (collection.value) params.set('collection', collection.value);
    if (popularity.value) params.set('popularity', popularity.value);
    if (difficulty.value) params.set('difficulty', difficulty.value);
    params.set('page', String(page.value));
    params.set('pageSize', String(PAGE_SIZE));
    const res = await api.get<{ total: number; page: number; pageSize: number; items: CanonWorkRow[] }>(
      `/learning/culture/canon/works?${params.toString()}`,
    );
    if (res && 'data' in res && res.data) {
      items.value = res.data.items;
      total.value = res.data.total;
    } else {
      error.value = '文库检索失败';
    }
  } finally {
    loading.value = false;
  }
}

function applyFilter() {
  page.value = 1;
  selected.value = null;
  void loadWorks();
}

function turnPage(delta: number) {
  const next = page.value + delta;
  if (next < 1 || next > pageCount.value) return;
  page.value = next;
  void loadWorks();
}

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

function popularityLabel(key: string): string {
  return POPULARITY_LABELS[key] ?? key;
}

function badgeText(work: CanonWorkRow): string {
  if (work.popularity === 'classic') return '经典';
  if (work.popularity === 'notable') return '冷门佳作';
  return '';
}

function selectWork(work: CanonWorkRow) {
  speech.stop();
  selected.value = work;
}

// ===== 记到笔记（速览头部入口：预填原文全文 + 作者·朝代 + tags） =====
const noteVisible = ref(false);
const noteTitle = ref('');
const noteContent = ref('');

function openNote() {
  const w = selected.value;
  if (!w) return;
  noteTitle.value = w.title;
  const tags = w.tags.length ? `\n标签：${w.tags.join(' · ')}` : '';
  noteContent.value = `${w.text}\n\n—— ${w.author || '佚名'} · ${w.dynasty || '朝代不详'}${tags}`;
  noteVisible.value = true;
}

onMounted(async () => {
  await Promise.all([loadCollections(), loadDaily(), loadWorks()]);
});

onBeforeUnmount(() => speech.stop());
</script>

<template>
  <section class="cul-lib">
    <!-- 筛选条固定顶部，不随列表滚动 -->
    <div class="cul-lib-filters">
      <input
        v-model="q"
        class="cul-lib-search"
        type="search"
        placeholder="搜题目 / 作者 / 名句"
        aria-label="检索典籍"
        @keydown.enter="applyFilter"
      >
      <select v-model="genre" class="cul-lib-select" aria-label="体裁" @change="applyFilter">
        <option value="">体裁（全部）</option>
        <option v-for="g in collections?.genres ?? []" :key="g.key" :value="g.key">{{ g.key }} · {{ g.count }}</option>
      </select>
      <select v-model="dynasty" class="cul-lib-select" aria-label="朝代" @change="applyFilter">
        <option value="">朝代（全部）</option>
        <option v-for="d in collections?.dynasties ?? []" :key="d.key" :value="d.key">{{ d.key }} · {{ d.count }}</option>
      </select>
      <select v-model="collection" class="cul-lib-select" aria-label="丛书" @change="applyFilter">
        <option value="">丛书（全部）</option>
        <option v-for="c in collections?.collections ?? []" :key="c.key" :value="c.key">{{ c.key }} · {{ c.count }}</option>
      </select>
      <select v-model="popularity" class="cul-lib-select" aria-label="热度" @change="applyFilter">
        <option value="">热度（全部）</option>
        <option v-for="p in collections?.popularity ?? []" :key="p.key" :value="p.key">{{ popularityLabel(p.key) }} · {{ p.count }}</option>
      </select>
      <select v-model="difficulty" class="cul-lib-select" aria-label="难度" @change="applyFilter">
        <option value="">难度（全部）</option>
        <option v-for="d in collections?.difficulties ?? []" :key="d.key" :value="d.key">{{ d.key }} · {{ d.count }}</option>
      </select>
      <button type="button" class="cul-lib-search-btn" @click="applyFilter">检索</button>
    </div>

    <!-- 每日一首置顶 -->
    <div v-if="daily" class="cul-lib-daily">
      <span>每日一首</span>
      <button type="button" class="cul-lib-daily-title" @click="selectWork(daily)">
        {{ daily.title }} · {{ daily.author || '佚名' }} · {{ daily.dynasty || '' }}
      </button>
      <button type="button" class="cul-lib-speak" :class="{ active: speakActive }" @click="toggleSpeak(daily.text)">
        {{ speakActive ? '停止' : '诵读' }}
      </button>
    </div>

    <div class="cul-lib-body">
      <!-- 列表独立滚动 -->
      <div class="cul-lib-list">
        <p v-if="loading" class="cul-lib-hint">正在检索…</p>
        <p v-else-if="error" class="cul-lib-hint cul-lib-error">{{ error }}</p>
        <p v-else-if="!items.length" class="cul-lib-hint">没有命中的篇目。</p>
        <button
          v-for="work in items"
          v-else
          :key="work.id"
          type="button"
          class="cul-lib-row"
          :class="{ active: selected?.id === work.id }"
          @click="selectWork(work)"
        >
          <span v-if="badgeText(work)" class="cul-lib-badge" :class="`badge-${work.popularity}`">{{ badgeText(work) }}</span>
          <b>{{ work.title }}</b>
          <i>·</i>
          <span>{{ work.author || '佚名' }}</span>
          <i>·</i>
          <span>{{ work.dynasty || '—' }}</span>
          <i>·</i>
          <span>{{ work.genre || '—' }}</span>
        </button>
      </div>

      <!-- 右侧速览 -->
      <aside v-if="selected" class="cul-lib-preview" aria-label="篇目速览">
        <header class="cul-lib-preview-head">
          <div>
            <b>{{ selected.title }}</b>
            <p>{{ selected.author || '佚名' }} · {{ selected.dynasty || '—' }} · {{ selected.genre || '—' }}<template v-if="selected.collection"> · {{ selected.collection }}</template></p>
          </div>
          <div class="cul-lib-preview-ops">
            <button type="button" class="cul-lib-speak" :class="{ active: speakActive }" @click="toggleSpeak(selected.text)">
              {{ speakActive ? '停止' : '诵读' }}
            </button>
            <button type="button" class="cul-lib-speak" @click="openNote">记到笔记</button>
          </div>
        </header>
        <div ref="previewTextEl" class="cul-lib-preview-text" aria-live="polite">
          <span
            v-for="(sentence, i) in spokenLines"
            :key="i"
            :data-sentence="i"
            :class="{ spoken: speakActive && i === spokenIndex }"
          >{{ sentence }}</span>
        </div>
        <p v-if="selected.tags.length" class="cul-lib-preview-tags">{{ selected.tags.join(' · ') }}</p>
        <p class="cul-lib-preview-note">AI 注解将在后续版本提供</p>
      </aside>
    </div>

    <!-- 记到笔记弹窗（组件内自挂一个实例，预填速览篇目） -->
    <NoteQuickCreateDialog
      v-model:visible="noteVisible"
      :title="noteTitle"
      :content="noteContent"
      category-name="典籍摘抄"
    />

    <!-- 分页 -->
    <div class="cul-lib-pager">
      <button type="button" :disabled="page <= 1" @click="turnPage(-1)">上一页</button>
      <small>第 {{ page }} / {{ pageCount }} 页 · 共 {{ total }} 篇</small>
      <button type="button" :disabled="page >= pageCount" @click="turnPage(1)">下一页</button>
    </div>
  </section>
</template>

<style scoped>
.cul-lib { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 10px; }

/* 筛选条：固定不滚 */
.cul-lib-filters {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  position: sticky;
  top: 0;
  z-index: 5;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--glass-bg);
  padding: 10px;
}
.cul-lib-search { flex: 1 1 180px; min-width: 140px; border: 1px solid var(--color-border); border-radius: 6px; padding: 7px 10px; font-size: 12px; background: var(--glass-bg-hover); color: var(--color-text); }
.cul-lib-select { border: 1px solid var(--color-border); border-radius: 6px; padding: 7px 8px; font-size: 12px; background: var(--glass-bg-hover); color: var(--color-text); max-width: 150px; }
.cul-lib-search-btn { border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-primary-soft); color: var(--color-primary); padding: 7px 14px; font-size: 12px; cursor: pointer; }

/* 每日一首 */
.cul-lib-daily {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 30%, var(--color-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 6%, var(--glass-bg));
  padding: 10px 14px;
}
.cul-lib-daily > span { color: var(--color-primary); font-size: 10px; font-weight: 700; }
.cul-lib-daily-title { flex: 1; overflow: hidden; border: 0; background: transparent; color: var(--color-text); font-size: 13px; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.cul-lib-speak { border: 1px solid var(--color-border); border-radius: 6px; background: var(--glass-bg); color: var(--color-text); padding: 5px 12px; font-size: 11px; cursor: pointer; }
.cul-lib-speak.active { border-color: color-mix(in srgb, var(--color-primary) 50%, var(--color-border)); color: var(--color-primary); }

/* 主体：列表独立滚动 + 右侧速览 */
.cul-lib-body { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 10px; flex: 1; min-height: 0; }
.cul-lib-list { overflow-y: auto; border: 1px solid var(--color-border); border-radius: 8px; background: var(--glass-bg); padding: 6px; }
.cul-lib-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text);
  padding: 9px 10px;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.cul-lib-row:hover { background: var(--glass-bg-hover); }
.cul-lib-row.active { background: color-mix(in srgb, var(--color-primary) 9%, transparent); }
.cul-lib-row b { font-size: 12px; }
.cul-lib-row i { color: var(--color-text-tertiary); font-style: normal; }
.cul-lib-row > span { color: var(--color-text-secondary); }
.cul-lib-badge { flex: 0 0 auto; border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: 700; }
.cul-lib-badge.badge-classic { background: color-mix(in srgb, #b98a4e 16%, transparent); color: #8a6a3f; }
.cul-lib-badge.badge-notable { background: color-mix(in srgb, #2e7d5b 14%, transparent); color: #2e7d5b; }
.cul-lib-hint { margin: 10px; color: var(--color-text-tertiary); font-size: 11px; }
.cul-lib-hint.cul-lib-error { color: var(--color-danger); }

/* 速览 */
.cul-lib-preview { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: 8px; background: #fffdf8; padding: 14px; }
.cul-lib-preview-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; border-bottom: 1px solid rgba(44, 42, 38, .1); padding-bottom: 10px; }
.cul-lib-preview-head b { font-family: "Songti SC", "STSong", "SimSun", serif; font-size: 16px; color: #2c2a26; }
.cul-lib-preview-head p { margin: 4px 0 0; color: #6f6a60; font-size: 11px; }
.cul-lib-preview-ops { flex: 0 0 auto; display: flex; gap: 6px; }
.cul-lib-preview-text { font-family: "Songti SC", "STSong", "SimSun", serif; font-size: 17px; line-height: 2; color: #2c2a26; }
.cul-lib-preview-text .spoken { background: color-mix(in srgb, #b98a4e 24%, transparent); border-radius: 4px; }
.cul-lib-preview-tags { margin: 0; color: #8a6a3f; font-size: 11px; }
.cul-lib-preview-note { margin: 0; border-top: 1px solid rgba(44, 42, 38, .08); padding-top: 8px; color: #a39c8d; font-size: 11px; }

/* 分页 */
.cul-lib-pager { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; gap: 14px; }
.cul-lib-pager button { border: 1px solid var(--color-border); border-radius: 6px; background: var(--glass-bg); color: var(--color-text); padding: 6px 14px; font-size: 11px; cursor: pointer; }
.cul-lib-pager button:disabled { opacity: .4; cursor: default; }
.cul-lib-pager small { color: var(--color-text-tertiary); font-size: 10px; font-variant-numeric: tabular-nums; }

@media (max-width: 860px) {
  .cul-lib-body { grid-template-columns: 1fr; }
}
</style>
