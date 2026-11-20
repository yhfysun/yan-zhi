<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { BarChart3, CheckCircle2, Clock3, PackageCheck, TrendingDown, TrendingUp, X } from 'lucide-vue-next';
import { noteDictionaryById, type NoteDictionaryDefinition } from '@yan-zhi/shared';
import { api } from '../../api/client';

interface AnalyticsData {
  from: number;
  to: number;
  totals: {
    expense: number;
    income: number;
    purchase: number;
    sale: number;
    net: number;
    minutes: number;
    tasksDone: number;
    tasksOpen: number;
    tasksOverdue: number;
  };
  daily: Array<{
    day: string;
    expense: number;
    income: number;
    purchase: number;
    sale: number;
    minutes: number;
  }>;
  expenseByCategory: Array<{ key: string; dictionaryId?: string | null; amount: number }>;
  timeByCategory: Array<{ key: string; dictionaryId?: string | null; minutes: number }>;
  inventory: Array<{
    product: string;
    category: string | null;
    categoryDictionaryId?: string | null;
    quantityOnHand: number;
    purchaseAmount: number;
    saleAmount: number;
  }>;
}

const props = defineProps<{
  visible: boolean;
  dictionaries: readonly NoteDictionaryDefinition[];
}>();

const emit = defineEmits<{ close: [] }>();
const range = ref<'today' | 'week' | 'month'>('today');
const data = ref<AnalyticsData | null>(null);
const loading = ref(false);
const error = ref('');

function rangeBounds(value: typeof range.value): { from: number; to: number } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (value === 'week') start.setDate(start.getDate() - 6);
  if (value === 'month') start.setDate(1);
  return { from: start.getTime(), to: now.getTime() };
}

function unwrap<T>(response: unknown): T | null {
  if (response && typeof response === 'object' && 'data' in response) {
    return (response as { data: T }).data;
  }
  return null;
}

async function load(): Promise<void> {
  if (!props.visible) return;
  loading.value = true;
  error.value = '';
  try {
    const bounds = rangeBounds(range.value);
    const response = await api.get<AnalyticsData>(
      `/notes/analytics?from=${bounds.from}&to=${bounds.to}`,
    );
    if (response && typeof response === 'object' && 'error' in response) {
      error.value = String((response as { error: unknown }).error);
      return;
    }
    data.value = unwrap<AnalyticsData>(response);
  } finally {
    loading.value = false;
  }
}

function categoryLabel(dictionaryId: string, key: string): string {
  const dictionary = noteDictionaryById(dictionaryId, props.dictionaries);
  return dictionary?.items.find((item) => item.id === key)?.label || key;
}

const maxExpense = computed(() => Math.max(1, ...(data.value?.expenseByCategory.map((item) => item.amount) || [0])));
const maxTime = computed(() => Math.max(1, ...(data.value?.timeByCategory.map((item) => item.minutes) || [0])));

watch(() => props.visible, (open) => {
  if (open) {
    range.value = 'today';
    void load();
  }
}, { immediate: true });

watch(range, () => { void load(); });
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="nas-mask" @click.self="$emit('close')">
      <section class="nas-sheet" role="dialog" aria-modal="true" aria-labelledby="nas-title">
        <header>
          <div>
            <small>记录统计</small>
            <h2 id="nas-title">账本与时间报告</h2>
          </div>
          <button type="button" aria-label="关闭报告" @click="$emit('close')"><X :size="18" /></button>
        </header>

        <div class="nas-ranges" role="tablist" aria-label="统计时间范围">
          <button type="button" role="tab" :aria-selected="range === 'today'" :class="{ active: range === 'today' }" @click="range = 'today'">今天</button>
          <button type="button" role="tab" :aria-selected="range === 'week'" :class="{ active: range === 'week' }" @click="range = 'week'">近 7 天</button>
          <button type="button" role="tab" :aria-selected="range === 'month'" :class="{ active: range === 'month' }" @click="range = 'month'">本月</button>
        </div>

        <div v-if="loading" class="nas-loading" aria-busy="true">
          <i></i><i></i><i></i>
        </div>
        <p v-else-if="error" class="nas-error" role="alert">{{ error }}</p>

        <template v-else-if="data">
          <section class="nas-totals" aria-label="金额概览">
            <article>
              <TrendingDown :size="16" />
              <span>日常支出</span>
              <strong>¥{{ data.totals.expense.toFixed(2) }}</strong>
            </article>
            <article>
              <TrendingUp :size="16" />
              <span>收入</span>
              <strong>¥{{ data.totals.income.toFixed(2) }}</strong>
            </article>
            <article>
              <PackageCheck :size="16" />
              <span>进货</span>
              <strong>¥{{ data.totals.purchase.toFixed(2) }}</strong>
            </article>
            <article>
              <BarChart3 :size="16" />
              <span>出货</span>
              <strong>¥{{ data.totals.sale.toFixed(2) }}</strong>
            </article>
            <article>
              <span>净现金流</span>
              <strong :class="{ negative: data.totals.net < 0 }">¥{{ data.totals.net.toFixed(2) }}</strong>
            </article>
            <article>
              <Clock3 :size="16" />
              <span>记录时间</span>
              <strong>{{ Math.floor(data.totals.minutes / 60) }}h {{ data.totals.minutes % 60 }}m</strong>
            </article>
          </section>

          <section class="nas-block">
            <header><strong>钱花在哪里</strong><small>按支出分类</small></header>
            <div v-if="data.expenseByCategory.length" class="nas-bars">
              <div v-for="item in data.expenseByCategory" :key="item.key">
                <span>{{ categoryLabel(item.dictionaryId || 'dict.expense_category', item.key) }}</span>
                <i><b :style="{ width: `${Math.max(4, item.amount / maxExpense * 100)}%` }"></b></i>
                <em>¥{{ item.amount.toFixed(2) }}</em>
              </div>
            </div>
            <p v-else class="nas-empty">这个时间范围还没有日常支出。</p>
          </section>

          <section v-if="range !== 'today' && data.daily.length" class="nas-block">
            <header><strong>每日记录</strong><small>按发生日期汇总</small></header>
            <div class="nas-daily">
              <article v-for="day in data.daily" :key="day.day">
                <strong>{{ day.day.slice(5) }}</strong>
                <span>支出 ¥{{ day.expense.toFixed(2) }}</span>
                <span>进货 ¥{{ day.purchase.toFixed(2) }}</span>
                <span>出货 ¥{{ day.sale.toFixed(2) }}</span>
                <em>{{ day.minutes }} 分</em>
              </article>
            </div>
          </section>

          <section class="nas-block">
            <header><strong>时间花在哪里</strong><small>按时间场景</small></header>
            <div v-if="data.timeByCategory.length" class="nas-bars time">
              <div v-for="item in data.timeByCategory" :key="item.key">
                <span>{{ categoryLabel(item.dictionaryId || 'dict.time_category', item.key) }}</span>
                <i><b :style="{ width: `${Math.max(4, item.minutes / maxTime * 100)}%` }"></b></i>
                <em>{{ item.minutes }} 分</em>
              </div>
            </div>
            <p v-else class="nas-empty">还没有时间记录。</p>
          </section>

          <section class="nas-block">
            <header><strong>库存结余</strong><small>进货数量减出货数量</small></header>
            <div v-if="data.inventory.length" class="nas-inventory">
              <article v-for="item in data.inventory.slice(0, 12)" :key="`${item.product}-${item.category || ''}`">
                <div><strong>{{ item.product }}</strong><small>{{ categoryLabel(item.categoryDictionaryId || 'dict.product_category', item.category || '') || '未分类' }}</small></div>
                <b :class="{ negative: item.quantityOnHand < 0 }">{{ item.quantityOnHand }} 件</b>
              </article>
            </div>
            <p v-else class="nas-empty">还没有进货或出货记录。</p>
          </section>

          <section class="nas-task-summary">
            <div><CheckCircle2 :size="16" /><span>已完成</span><strong>{{ data.totals.tasksDone }}</strong></div>
            <div><span>待办</span><strong>{{ data.totals.tasksOpen }}</strong></div>
            <div><span>已逾期</span><strong :class="{ negative: data.totals.tasksOverdue > 0 }">{{ data.totals.tasksOverdue }}</strong></div>
          </section>
        </template>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.nas-mask {
  position: fixed;
  inset: 0;
  z-index: 6250;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(12, 18, 21, 0.48);
}

.nas-sheet {
  display: flex;
  width: min(680px, 100%);
  max-height: 90dvh;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 18px 14px calc(16px + env(safe-area-inset-bottom, 0px));
  border-radius: 24px 24px 0 0;
  background: var(--color-bg);
  color: var(--color-text);
}

.nas-sheet > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.nas-sheet > header small {
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 700;
}

.nas-sheet > header h2 {
  margin: 2px 0 0;
  font-size: 20px;
}

.nas-sheet > header button {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 0;
  border-radius: 12px;
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
}

.nas-ranges {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border-radius: 11px;
  background: var(--color-surface-hover);
}

.nas-ranges button {
  min-height: 44px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
}

.nas-ranges button.active {
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: 0 1px 4px rgba(20, 28, 32, 0.08);
}

.nas-loading {
  display: grid;
  gap: 8px;
}

.nas-loading i {
  height: 72px;
  border-radius: 10px;
  background: linear-gradient(90deg, var(--color-surface-hover), var(--color-surface), var(--color-surface-hover));
  background-size: 220% 100%;
  animation: nas-shimmer 1.2s linear infinite;
}

.nas-error {
  margin: 0;
  padding: 10px;
  border-radius: 9px;
  background: #fff1ef;
  color: #a53f32;
  font-size: 12px;
}

.nas-totals {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-border);
}

.nas-totals article {
  display: grid;
  min-height: 74px;
  align-content: center;
  gap: 3px;
  padding: 10px;
  background: var(--color-surface);
}

.nas-totals article svg {
  color: var(--color-primary);
}

.nas-totals span {
  color: var(--color-text-tertiary);
  font-size: 9px;
}

.nas-totals strong {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.negative {
  color: #a64a3c !important;
}

.nas-block {
  padding: 11px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
}

.nas-block > header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.nas-block > header strong {
  font-size: 13px;
}

.nas-block > header small {
  color: var(--color-text-tertiary);
  font-size: 9px;
}

.nas-bars {
  display: grid;
  gap: 8px;
}

.nas-bars > div {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) 70px;
  align-items: center;
  gap: 8px;
}

.nas-bars span {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nas-bars i {
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-surface-hover);
}

.nas-bars b {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #c26a55;
}

.nas-bars.time b {
  background: #4b7f71;
}

.nas-bars em {
  color: var(--color-text-secondary);
  font-size: 10px;
  font-style: normal;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.nas-inventory {
  display: grid;
  gap: 1px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--color-border);
}

.nas-daily {
  display: grid;
  gap: 1px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--color-border);
}

.nas-daily article {
  display: grid;
  min-height: 46px;
  grid-template-columns: 48px repeat(3, minmax(0, 1fr)) 48px;
  align-items: center;
  gap: 5px;
  padding: 7px 9px;
  background: var(--color-surface);
}

.nas-daily strong {
  font-size: 11px;
}

.nas-daily span {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nas-daily em {
  color: var(--color-text-tertiary);
  font-size: 9px;
  font-style: normal;
  text-align: right;
}

.nas-inventory article {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  background: var(--color-surface);
}

.nas-inventory strong,
.nas-inventory small {
  display: block;
}

.nas-inventory strong {
  font-size: 12px;
}

.nas-inventory small {
  margin-top: 2px;
  color: var(--color-text-tertiary);
  font-size: 9px;
}

.nas-inventory > article > b {
  flex: none;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.nas-task-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.nas-task-summary > div {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 5px;
  padding: 8px;
  border-radius: 9px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 10px;
}

.nas-task-summary strong {
  margin-left: auto;
  color: var(--color-text);
  font-size: 14px;
}

.nas-empty {
  margin: 4px 0 2px;
  color: var(--color-text-tertiary);
  font-size: 11px;
}

@keyframes nas-shimmer {
  from { background-position: 100% 0; }
  to { background-position: -100% 0; }
}

@media (min-width: 760px) {
  .nas-mask {
    align-items: center;
    padding: 24px;
  }

  .nas-sheet {
    max-height: 84dvh;
    padding: 22px;
    border-radius: 18px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nas-loading i { animation: none; }
}
</style>
