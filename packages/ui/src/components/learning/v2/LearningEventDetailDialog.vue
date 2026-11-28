<template>
  <Teleport to="body">
    <div
      v-if="open && event"
      class="led-backdrop"
      data-learning-event-dialog
      @mousedown.self="emit('close')"
    >
      <section
        ref="dialog"
        class="led-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="summaryId"
        tabindex="-1"
        @keydown="handleKeydown"
      >
        <header class="led-header">
          <div>
            <span>{{ archiveLabel }}</span>
            <h2 :id="titleId">{{ event.title }}</h2>
            <p>{{ event.period }}</p>
          </div>
          <button
            ref="closeButton"
            type="button"
            class="led-close"
            aria-label="关闭事件档案并返回当前学习步骤"
            @click="emit('close')"
          >
            <X :size="18" />
          </button>
        </header>

        <div class="led-scroll">
          <p :id="summaryId" class="led-summary">{{ event.summary }}</p>

          <section class="led-section" aria-labelledby="led-background-title">
            <header>
              <span>{{ backgroundEyebrow }}</span>
              <h3 id="led-background-title">{{ backgroundHeading }}</h3>
            </header>
            <p>{{ event.background }}</p>
          </section>

          <section class="led-section" aria-labelledby="led-timeline-title">
            <header>
              <span>关键节点</span>
              <h3 id="led-timeline-title">{{ timelineHeading }}</h3>
            </header>
            <ol class="led-timeline">
              <li v-for="(item, index) in event.timeline" :key="`${item.date}-${item.title}`">
                <div class="led-node" aria-hidden="true">{{ index + 1 }}</div>
                <article>
                  <time>{{ item.date }}</time>
                  <h4>{{ item.title }}</h4>
                  <p>{{ item.body }}</p>
                  <div v-if="item.sourceIds.length" class="led-node-sources">
                    <span>核对材料</span>
                    <b v-for="sourceId in item.sourceIds" :key="sourceId">
                      {{ sourceLabel(sourceId) }}
                    </b>
                  </div>
                </article>
              </li>
            </ol>
          </section>

          <div class="led-outcome-grid">
            <section class="led-section">
              <header>
                <span>{{ outcomeEyebrow }}</span>
                <h3>{{ outcomeHeading }}</h3>
              </header>
              <p>{{ event.outcome }}</p>
            </section>
            <section class="led-section">
              <header>
                <span>历史意义</span>
                <h3>为什么值得学习</h3>
              </header>
              <p>{{ event.significance }}</p>
            </section>
          </div>

          <section class="led-section" aria-labelledby="led-sources-title">
            <header>
              <span>材料底账</span>
              <h3 id="led-sources-title">{{ sourcesHeading }}</h3>
            </header>
            <ul class="led-source-list">
              <li v-for="source in event.sourceCards" :key="source.id">
                <div>
                  <b>{{ source.title }}</b>
                  <span>{{ source.issuer }}<template v-if="source.date"> · {{ source.date }}</template></span>
                  <p>{{ source.usedFor }}</p>
                </div>
                <a :href="source.url" target="_blank" rel="noopener noreferrer">
                  查看原文 <ExternalLink :size="14" />
                </a>
              </li>
            </ul>
          </section>
        </div>

        <footer class="led-footer">
          <span>关闭后返回原学习步骤，位置不会丢失。</span>
          <button type="button" @click="emit('close')">返回学习</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ExternalLink, X } from 'lucide-vue-next';
import type { LearningV2EventDetail } from '@yan-zhi/shared';

const props = defineProps<{
  event: LearningV2EventDetail | null;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const dialog = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const titleId = 'learning-event-detail-title';
const summaryId = 'learning-event-detail-summary';
let previousOverflow = '';
let previousFocus: HTMLElement | null = null;

const sourceTitles = computed(() => new Map(
  (props.event?.sourceCards ?? []).map((source) => [source.id, source.title]),
));
const archiveLabel = computed(() => ({
  event: '重大事件档案',
  institution: '制度档案',
  concept: '概念档案',
  experiment: '实验档案',
  case: '案例档案',
}[props.event?.kind ?? 'event']));
const backgroundEyebrow = computed(() => props.event?.kind === 'event' ? '事件缘起' : '问题背景');
const backgroundHeading = computed(() => props.event?.kind === 'event' ? '为什么会发生' : '问题从哪里来');
const timelineHeading = computed(() => ({
  event: '从开始到结局',
  institution: '制度怎样运行与演变',
  concept: '概念与规则怎样展开',
  experiment: '实验怎样推进',
  case: '案例怎样发展',
}[props.event?.kind ?? 'event']));
const outcomeEyebrow = '事件结局';
const outcomeHeading = computed(() => props.event?.kind === 'event' ? '最后形成了什么' : '可以得出什么判断');
const sourcesHeading = '始末来源';

function sourceLabel(sourceId: string): string {
  return sourceTitles.value.get(sourceId) ?? sourceId;
}

function focusableElements(): HTMLElement[] {
  return [...(dialog.value?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
  ) ?? [])].filter((element) => element.offsetParent !== null);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    emit('close');
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = focusableElements();
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function restorePage(): void {
  document.body.style.overflow = previousOverflow;
  const target = previousFocus;
  previousFocus = null;
  if (target?.isConnected) void nextTick(() => target.focus());
}

watch(() => props.open, async (open) => {
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    await nextTick();
    closeButton.value?.focus();
  } else {
    restorePage();
  }
}, { immediate: true });

onBeforeUnmount(() => {
  if (props.open) restorePage();
});
</script>

<style scoped>
.led-backdrop {
  position: fixed;
  z-index: 6200;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(12, 20, 16, .58);
  backdrop-filter: blur(7px);
}

.led-dialog {
  display: flex;
  width: min(920px, calc(100vw - 48px));
  max-height: min(860px, calc(100vh - 48px));
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--lv2-line, #d8ded9);
  border-radius: 8px;
  background: var(--lv2-surface, #fbfcf8);
  color: var(--lv2-text, #24302a);
  box-shadow: 0 24px 72px rgba(8, 16, 12, .3);
}

.led-header {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 22px 17px;
  border-bottom: 1px solid var(--lv2-line, #d8ded9);
  background: color-mix(in srgb, var(--lv2-tint, #eef3ef) 46%, #fff);
}

.led-header span,
.led-section header span {
  color: var(--lv2-accent, #2f6d54);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
}

.led-header h2 {
  margin: 5px 0 4px;
  font-size: clamp(20px, 2.4vw, 29px);
  line-height: 1.25;
}

.led-header p {
  margin: 0;
  color: var(--lv2-muted, #67766d);
  font-size: 12px;
}

.led-close {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  place-items: center;
  border: 1px solid var(--lv2-line, #d8ded9);
  border-radius: 8px;
  background: var(--lv2-surface, #fff);
  color: var(--lv2-text, #24302a);
  cursor: pointer;
}

.led-close:hover,
.led-close:focus-visible {
  border-color: var(--lv2-accent, #2f6d54);
  color: var(--lv2-accent, #2f6d54);
}

.led-scroll {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 22px;
}

.led-summary {
  margin: 0;
  padding: 14px 16px;
  border-left: 3px solid var(--lv2-accent, #2f6d54);
  background: color-mix(in srgb, var(--lv2-tint, #eef3ef) 40%, #fff);
  font-size: 14px;
  line-height: 1.8;
}

.led-section {
  margin-top: 22px;
}

.led-section header h3 {
  margin: 4px 0 0;
  font-size: 17px;
}

.led-section > p {
  margin: 9px 0 0;
  font-size: 13px;
  line-height: 1.85;
}

.led-timeline {
  display: grid;
  gap: 0;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}

.led-timeline > li {
  position: relative;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 12px;
  padding-bottom: 18px;
}

.led-timeline > li:not(:last-child)::before {
  position: absolute;
  top: 28px;
  bottom: 0;
  left: 14px;
  width: 1px;
  background: var(--lv2-line, #d8ded9);
  content: "";
}

.led-node {
  z-index: 1;
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid var(--lv2-line, #d8ded9);
  border-radius: 50%;
  background: var(--lv2-surface, #fff);
  color: var(--lv2-accent, #2f6d54);
  font-size: 11px;
  font-weight: 700;
}

.led-timeline article {
  padding: 0 0 2px;
}

.led-timeline time {
  color: var(--lv2-accent, #2f6d54);
  font-size: 11px;
  font-weight: 700;
}

.led-timeline h4 {
  margin: 4px 0 0;
  font-size: 14px;
}

.led-timeline p {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.8;
}

.led-node-sources {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
}

.led-node-sources span {
  color: var(--lv2-muted, #67766d);
  font-size: 10px;
}

.led-node-sources b {
  padding: 2px 6px;
  border: 1px solid var(--lv2-line, #d8ded9);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
}

.led-outcome-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.led-outcome-grid .led-section {
  padding: 15px;
  border: 1px solid var(--lv2-line, #d8ded9);
  border-radius: 8px;
}

.led-source-list {
  display: grid;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.led-source-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 13px;
  border: 1px solid var(--lv2-line, #d8ded9);
  border-radius: 8px;
}

.led-source-list b,
.led-source-list span {
  display: block;
}

.led-source-list b {
  font-size: 12px;
}

.led-source-list span {
  margin-top: 3px;
  color: var(--lv2-muted, #67766d);
  font-size: 10px;
}

.led-source-list p {
  margin: 5px 0 0;
  font-size: 11px;
  line-height: 1.65;
}

.led-source-list a {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid var(--lv2-line, #d8ded9);
  border-radius: 6px;
  color: var(--lv2-accent, #2f6d54);
  font-size: 11px;
  text-decoration: none;
}

.led-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 22px;
  border-top: 1px solid var(--lv2-line, #d8ded9);
  background: var(--lv2-surface, #fbfcf8);
}

.led-footer span {
  color: var(--lv2-muted, #67766d);
  font-size: 11px;
}

.led-footer button {
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid var(--lv2-accent, #2f6d54);
  border-radius: 7px;
  background: var(--lv2-accent, #2f6d54);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

@media (max-width: 720px) {
  .led-backdrop { padding: 0; }
  .led-dialog {
    width: 100vw;
    max-height: 100dvh;
    height: 100dvh;
    border: 0;
    border-radius: 0;
  }
  .led-header { padding: 15px 14px 13px; }
  .led-header h2 { padding-right: 4px; font-size: 19px; }
  .led-scroll { padding: 15px 14px 20px; }
  .led-summary { font-size: 13px; }
  .led-outcome-grid { grid-template-columns: 1fr; }
  .led-source-list li { align-items: flex-start; flex-direction: column; }
  .led-source-list a { width: 100%; justify-content: center; }
  .led-footer { padding: 10px 14px calc(10px + env(safe-area-inset-bottom)); }
  .led-footer span { display: none; }
  .led-footer button { width: 100%; min-height: 44px; }
}
</style>
