<script setup lang="ts">
// 对句台 —— 出句 + 字位槽 + 候选字块，实时 judgeCouplet 三项判卷（字数/词性/平仄）。
// 判卷走 @yan-zhi/shared 纯函数（两端唯一实现）；错了不惩罚，只给一条具体提示，随时可看范本。
// 零基础只做「点选填槽」：点候选字依次填入空槽，点已填的槽撤销。
import { computed, ref, watch } from 'vue';
import { judgeCouplet } from '@yan-zhi/shared';
import type { CoupletCandidate } from '@yan-zhi/shared';
import type { CoupletLesson } from './culture-types';

const props = defineProps<{ lesson: CoupletLesson }>();
const emit = defineEmits<{ pass: [] }>();

const slots = ref<Array<CoupletCandidate | null>>([]);
const showSample = ref(false);
// 判卷通过只 emit 一次（范本填入也会通过，同样视为完成）
let lastPass = false;

// 换题（换课时）重置槽位
watch(
  () => props.lesson.id,
  () => {
    slots.value = Array.from({ length: props.lesson.expectPos.length }, () => null);
    showSample.value = false;
    lastPass = false;
  },
  { immediate: true },
);

const verdict = computed(() => judgeCouplet(props.lesson.expectPos, props.lesson.expectTone, slots.value));

watch(verdict, (v) => {
  if (v.pass && !lastPass) emit('pass');
  lastPass = v.pass;
});

const slotsFilled = computed(() => slots.value.every((s) => s !== null));

function pickCandidate(c: CoupletCandidate) {
  const i = slots.value.findIndex((s) => s === null);
  if (i === -1) return;
  slots.value[i] = c;
}

function clearSlot(i: number) {
  slots.value[i] = null;
}

function clearAll() {
  slots.value = Array.from({ length: props.lesson.expectPos.length }, () => null);
  showSample.value = false;
}

// 看范本：按字查候选块口径填入（不在候选里的字按期望口径兜底），并展示「为什么这么对」
function fillSample() {
  const byCh = new Map(props.lesson.candidates.map((c) => [c.ch, c] as const));
  slots.value = [...props.lesson.sampleAnswer].map((ch, i) => (
    byCh.get(ch) ?? { ch, pos: props.lesson.expectPos[i], tone: props.lesson.expectTone[i] }
  ));
  showSample.value = true;
}

function slotVerdictClass(i: number): Record<string, boolean> {
  const v = verdict.value.slots.find((s) => s.index === i);
  if (!v) return {};
  return { [v.posOk && v.toneOk ? 'ok' : 'bad']: true };
}
</script>

<template>
  <section class="cul-board">
    <div class="cul-board-prompt">
      <p class="cul-board-prompt-text">{{ lesson.prompt }}</p>
      <p class="cul-board-prompt-tone" aria-label="出句平仄">{{ lesson.promptTone }}</p>
    </div>

    <div class="cul-board-slots" aria-label="对句字位槽">
      <button
        v-for="(slot, i) in slots"
        :key="i"
        type="button"
        class="cul-slot"
        :class="{ filled: !!slot, ...slotVerdictClass(i) }"
        :aria-label="slot ? `第 ${i + 1} 字 ${slot.ch}，点按撤销` : `第 ${i + 1} 字空位`"
        @click="clearSlot(i)"
      >{{ slot?.ch ?? '' }}</button>
    </div>

    <ul class="cul-board-verdict">
      <li :class="{ ok: verdict.lengthOk }">字数 {{ verdict.filled }}/{{ verdict.required }}</li>
      <li :class="{ ok: verdict.posOkCount === verdict.required && verdict.filled === verdict.required }">词性 {{ verdict.posOkCount }}/{{ verdict.required }}</li>
      <li :class="{ ok: verdict.toneOkCount === verdict.required && verdict.filled === verdict.required }">平仄 {{ verdict.toneOkCount }}/{{ verdict.required }}</li>
    </ul>

    <p v-if="verdict.firstToneIssue" class="cul-issue-tone" role="status">{{ verdict.firstToneIssue }}，换个字试试。</p>
    <p v-if="verdict.firstPosIssue" class="cul-issue-pos" role="status">{{ verdict.firstPosIssue }}，换个字试试。</p>

    <div class="cul-board-actions">
      <button type="button" @click="fillSample">看范本</button>
      <button type="button" @click="clearAll">清空</button>
    </div>
    <p v-if="showSample" class="cul-board-why">古人这么对：「{{ lesson.sampleAnswer }}」——{{ lesson.sampleWhy }}</p>

    <div class="cul-board-candidates" aria-label="候选字块">
      <button
        v-for="(c, i) in lesson.candidates"
        :key="`${c.ch}-${i}`"
        type="button"
        class="cul-candidate"
        :disabled="slotsFilled"
        :aria-label="`候选字 ${c.ch}`"
        @click="pickCandidate(c)"
      >{{ c.ch }}</button>
    </div>
  </section>
</template>

<style scoped>
.cul-board { display: flex; flex-direction: column; gap: 14px; }
.cul-board-prompt { text-align: center; }
.cul-board-prompt-text { margin: 0; font-family: var(--cul-serif, serif); font-size: 34px; letter-spacing: .18em; color: var(--cul-paper-ink, #2c2a26); }
.cul-board-prompt-tone { margin: 4px 0 0; color: var(--cul-paper-muted, #6f6a60); font-size: 11px; letter-spacing: .32em; }
.cul-board-slots { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
.cul-slot {
  display: inline-grid;
  place-items: center;
  width: 46px;
  height: 52px;
  border: 1.5px dashed rgba(44, 42, 38, .3);
  border-radius: 6px;
  background: #ffffff;
  font-family: var(--cul-serif, serif);
  font-size: 24px;
  color: var(--cul-paper-ink, #2c2a26);
  cursor: pointer;
}
.cul-slot.filled { border-style: solid; border-color: rgba(138, 106, 63, .55); }
.cul-slot.ok { border-color: rgba(46, 125, 91, .7); }
.cul-slot.bad { border-color: rgba(185, 28, 28, .55); }
.cul-board-verdict { display: flex; justify-content: center; gap: 16px; margin: 0; padding: 0; list-style: none; }
.cul-board-verdict li { color: var(--cul-paper-muted, #6f6a60); font-size: 12px; }
.cul-board-verdict li.ok { color: #2e7d5b; }
.cul-issue-tone,
.cul-issue-pos { margin: 0; text-align: center; font-size: 12px; }
.cul-issue-tone { color: #b45309; }
.cul-issue-pos { color: #9a3412; }
.cul-board-actions { display: flex; justify-content: center; gap: 10px; }
.cul-board-actions button {
  border: 1px solid rgba(44, 42, 38, .2);
  border-radius: 6px;
  background: #ffffff;
  color: var(--cul-paper-ink, #2c2a26);
  padding: 6px 16px;
  font-size: 12px;
  cursor: pointer;
}
.cul-board-actions button:hover { border-color: rgba(138, 106, 63, .6); }
.cul-board-why { margin: 0; text-align: center; color: var(--cul-paper-muted, #6f6a60); font-size: 12px; line-height: 1.7; }
.cul-board-candidates { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; border-top: 1px solid rgba(44, 42, 38, .1); padding-top: 14px; }
.cul-candidate {
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(44, 42, 38, .18);
  border-radius: 6px;
  background: var(--cul-paper, #fffdf8);
  font-family: var(--cul-serif, serif);
  font-size: 19px;
  color: var(--cul-paper-ink, #2c2a26);
  cursor: pointer;
}
.cul-candidate:hover:not(:disabled) { border-color: rgba(138, 106, 63, .6); background: #ffffff; }
.cul-candidate:disabled { opacity: .45; cursor: default; }
</style>
