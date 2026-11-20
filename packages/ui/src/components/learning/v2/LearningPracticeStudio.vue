<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  Download, FlaskConical, Layers3, Play, RotateCcw, Save, Trash2, ZoomIn, ZoomOut,
} from 'lucide-vue-next';
import jiuChengGongPage2 from '../../../assets/calligraphy/jiu-cheng-gong-2.jpg';
import duobaoPagoda from '../../../assets/calligraphy/duobao-pagoda.jpg';
import xuanmiPagoda from '../../../assets/calligraphy/xuanmi-pagoda.jpg';
import lantingXu from '../../../assets/calligraphy/lanting-xu.jpg';
import DivinationWorkbench from '../zhouyi/DivinationWorkbench.vue';
import CultureStudio from '../culture/CultureStudio.vue';
import CompositionStudio from '../CompositionStudio.vue';
import MedicalPracticeStudio from './MedicalPracticeStudio.vue';
import SecurityPracticeStudio from '../SecurityPracticeStudio.vue';

type PracticeInfo = {
  task: string;
  output: string;
  boundary: string;
  features: readonly string[];
  studio: {
    type: string;
    title: string;
    steps: readonly string[];
  };
};

type CalligraphyRatingKey = '起笔' | '结构' | '角度' | '粗细' | '收笔';

type CalligraphyFocus = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CalligraphyCharacter = {
  glyph: string;
  focus: CalligraphyFocus;
};

type CalligraphyAttempt = {
  id: string;
  createdAt: string;
  copybook: string;
  character: string;
  mode: '硬笔' | '毛笔';
  ratings: Record<CalligraphyRatingKey, number>;
  nextTarget: CalligraphyRatingKey;
  pageLabel: string;
};

type GenericPracticeRecord = {
  stepIndex: number;
  output: string;
  reflection: string;
  savedAt: string;
};

const CALLIGRAPHY_STORE_KEY = 'yz.learning.v2.calligraphy.attempts.v1';
const GENERIC_PRACTICE_STORE_KEY = 'yz.learning.v2.generic-practice.v1';
const CALLIGRAPHY_RATINGS: readonly CalligraphyRatingKey[] = ['起笔', '结构', '角度', '粗细', '收笔'];
const CALLIGRAPHY_BOOKS = [
  {
    name: '欧阳询《九成宫醴泉铭》',
    source: '宋拓本册页 · Wikimedia Commons（公有领域）',
    url: 'https://commons.wikimedia.org/wiki/File:%E5%AE%8B%E6%8B%93%E4%B9%9D%E6%88%90%E5%AE%AB%E9%86%B4%E6%B3%89%E9%93%AD%E5%86%8C_2.jpg',
    image: jiuChengGongPage2,
    pageLabel: '宋拓九成宫醴泉铭册 · 第二开',
    characters: [
      { glyph: '九', focus: { x: 77, y: 13, width: 11, height: 16 } },
      { glyph: '成', focus: { x: 69, y: 13, width: 11, height: 16 } },
      { glyph: '宫', focus: { x: 61, y: 13, width: 11, height: 16 } },
      { glyph: '醴', focus: { x: 53, y: 13, width: 11, height: 16 } },
      { glyph: '泉', focus: { x: 45, y: 13, width: 11, height: 16 } },
      { glyph: '铭', focus: { x: 37, y: 13, width: 11, height: 16 } },
    ],
  },
  {
    name: '颜真卿《多宝塔碑》',
    source: '公版碑帖拓本 · Wikimedia Commons',
    url: 'https://commons.wikimedia.org/w/index.php?search=%E5%A4%9A%E5%AE%9D%E5%A1%94%E7%A2%91',
    image: duobaoPagoda,
    pageLabel: '大唐多宝塔感应碑 · 碑额与碑文',
    characters: [
      { glyph: '大', focus: { x: 43, y: 9, width: 12, height: 12 } },
      { glyph: '唐', focus: { x: 35, y: 9, width: 12, height: 12 } },
      { glyph: '多', focus: { x: 27, y: 9, width: 12, height: 12 } },
      { glyph: '宝', focus: { x: 19, y: 9, width: 12, height: 12 } },
      { glyph: '塔', focus: { x: 11, y: 9, width: 12, height: 12 } },
      { glyph: '感', focus: { x: 5, y: 9, width: 12, height: 12 } },
    ],
  },
  {
    name: '柳公权《玄秘塔碑》',
    source: '公版碑帖拓本 · Wikimedia Commons',
    url: 'https://commons.wikimedia.org/w/index.php?search=%E7%8E%84%E7%A7%98%E5%A1%94%E7%A2%91',
    image: xuanmiPagoda,
    pageLabel: '玄秘塔碑 · 碑文首开',
    characters: [
      { glyph: '玄', focus: { x: 75, y: 7, width: 12, height: 13 } },
      { glyph: '秘', focus: { x: 67, y: 7, width: 12, height: 13 } },
      { glyph: '塔', focus: { x: 59, y: 7, width: 12, height: 13 } },
      { glyph: '碑', focus: { x: 51, y: 7, width: 12, height: 13 } },
      { glyph: '铭', focus: { x: 43, y: 7, width: 12, height: 13 } },
      { glyph: '序', focus: { x: 35, y: 7, width: 12, height: 13 } },
    ],
  },
  {
    name: '王羲之《兰亭序》',
    source: '神龙本兰亭序 · Wikimedia Commons（公有领域）',
    url: 'https://commons.wikimedia.org/w/index.php?search=%E5%85%B0%E4%BA%AD%E5%BA%8F%E7%A5%9E%E9%BE%99%E6%9C%AC',
    image: lantingXu,
    pageLabel: '神龙本兰亭序 · 卷首',
    characters: [
      { glyph: '永', focus: { x: 88, y: 8, width: 11, height: 26 } },
      { glyph: '和', focus: { x: 81, y: 8, width: 10, height: 26 } },
      { glyph: '九', focus: { x: 75, y: 8, width: 9, height: 26 } },
      { glyph: '年', focus: { x: 69, y: 8, width: 9, height: 26 } },
      { glyph: '岁', focus: { x: 63, y: 8, width: 9, height: 26 } },
      { glyph: '在', focus: { x: 57, y: 8, width: 9, height: 26 } },
    ],
  },
] as const;

const props = defineProps<{
  subjectKey: string;
  courseName: string;
  practice: PracticeInfo;
}>();
const emit = defineEmits<{
  'goto-lesson': [];
}>();

const started = ref(false);
const authorized = ref(false);
const target = ref('sandbox://learning/object-auth');
const method = ref('GET');
const requestPath = ref('/api/orders/1042');
const replayLog = ref('');
const nfcAuthorized = ref(false);
const fixEnabled = ref(false);
const regressionLog = ref('');

const zhouyiWorkspace = ref<'source' | 'numbers' | 'calendar' | 'geography'>('source');
const divinationWorkspace = ref<'stars' | 'tarot' | 'crystal' | 'dice'>('tarot');
const practiceSeed = ref('20261116');
const generatedRule = ref('');
const drawnCards = ref<string[]>([]);
const calligraphyOriginalStage = ref<HTMLElement | null>(null);
const calligraphyMode = ref<'硬笔' | '毛笔'>('硬笔');
const copybook = ref<(typeof CALLIGRAPHY_BOOKS)[number]['name']>(CALLIGRAPHY_BOOKS[0].name);
const calligraphyCharacter = ref<string>(CALLIGRAPHY_BOOKS[0].characters[0].glyph);
const originalZoom = ref(100);
const calligraphyRatings = ref<Record<CalligraphyRatingKey, number>>({
  起笔: 3,
  结构: 3,
  角度: 3,
  粗细: 3,
  收笔: 3,
});
const nextTarget = ref<CalligraphyRatingKey>('起笔');
const calligraphyAttempts = ref<CalligraphyAttempt[]>([]);
const compareAttemptsOpen = ref(false);
const calligraphySaveHint = ref('');
const genericStepIndex = ref(0);
const genericOutput = ref('');
const genericReflection = ref('');
const genericSavedAt = ref('');
const genericSaveHint = ref('');
const musicSequence = ref<string[]>([]);
const musicStatus = ref('点音级块组成四拍，再试听节奏。');
const MUSIC_NOTES: Record<string, number> = { 宫: 261.63, 商: 293.66, 角: 329.63, 徵: 392, 羽: 440 };
let calligraphyPan: {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
} | null = null;

const permissionRows = [
  { role: '当前用户', own: '允许', other: '拒绝', admin: '拒绝' },
  { role: '同租户成员', own: '允许', other: '拒绝', admin: '拒绝' },
  { role: '租户管理员', own: '允许', other: '允许', admin: '允许' },
];

const isSecurity = computed(() => props.subjectKey === 'security');
const isZhouyi = computed(() => props.subjectKey === 'zhouyi');
const isDivination = computed(() => props.subjectKey === 'divination');
const isCulture = computed(() => props.subjectKey === 'culture');
const isCalligraphy = computed(() => props.subjectKey === 'calligraphy');
const isMedicine = computed(() => props.subjectKey === 'medicine');
const isMusic = computed(() => props.subjectKey === 'music');
const useFullPracticeWorkbench = computed(() =>
  isZhouyi.value || isDivination.value || isCulture.value || isMedicine.value || isMusic.value,
);
const selectedCopybook = computed(() =>
  CALLIGRAPHY_BOOKS.find((book) => book.name === copybook.value) || CALLIGRAPHY_BOOKS[0],
);
const selectedCharacter = computed<CalligraphyCharacter>(() =>
  selectedCopybook.value.characters.find((character) => character.glyph === calligraphyCharacter.value)
  || selectedCopybook.value.characters[0],
);
const calligraphyFocusStyle = computed(() => {
  const focus = selectedCharacter.value.focus;
  const scale = 10000 / focus.width;
  return {
    backgroundImage: `url("${selectedCopybook.value.image}")`,
    backgroundSize: `${scale}% auto`,
    backgroundPosition: `${(focus.x / (100 - focus.width)) * 100}% ${(focus.y / (100 - focus.height)) * 100}%`,
  };
});
const canCompareAttempts = computed(() => calligraphyAttempts.value.length >= 2);
const genericRecordKey = computed(() => `${props.subjectKey}::${props.courseName}`);
const genericCurrentStep = computed(() =>
  props.practice.studio.steps[genericStepIndex.value] || props.practice.studio.steps[0] || '开始实践');
const genericStepGuide = computed(() => {
  const step = genericCurrentStep.value;
  return `完成“${step}”：只记录这一步能观察到的内容，并说明它如何支持或修正本课结论。`;
});
const genericCanGoBack = computed(() => genericStepIndex.value > 0);
const genericCanGoNext = computed(() =>
  genericStepIndex.value < Math.max(0, props.practice.studio.steps.length - 1));

function runReplay() {
  if (!authorized.value) {
    replayLog.value = '未确认授权，不能发送请求。';
    return;
  }
  replayLog.value = [
    `目标：${target.value}`,
    `${method.value} ${requestPath.value}`,
    '响应：403 Forbidden',
    '日志：服务端仍按对象归属校验，未发现越权数据泄露。',
  ].join('\n');
}

function runRegression() {
  regressionLog.value = fixEnabled.value
    ? '回归通过：本人资源 200，同租户其他用户资源 403，管理员授权资源 200。'
    : '回归失败：服务端尚未绑定当前主体与资源，其他用户资源仍可读取。';
}

function exportReport() {
  const report = [
    `课程：${props.courseName}`,
    `实践：${props.practice.studio.title}`,
    replayLog.value,
    regressionLog.value,
    '范围：隔离教学靶场，未连接真实目标。',
  ].filter(Boolean).join('\n\n');
  const url = URL.createObjectURL(new Blob([report], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'learning-security-regression.txt';
  anchor.click();
  URL.revokeObjectURL(url);
}

function stableNumber(seed: string, offset: number): number {
  const value = [...seed].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 17);
  return (value + offset * 97) >>> 0;
}

function generateRuleDemo() {
  const upperTrigrams = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
  const lowerTrigrams = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
  const upper = upperTrigrams[stableNumber(practiceSeed.value, 1) % 8];
  const lower = lowerTrigrams[stableNumber(practiceSeed.value, 2) % 8];
  generatedRule.value = `${upper}上${lower}下 · seed ${practiceSeed.value}`;
}

function drawCards() {
  const cards = ['正义', '节制', '隐者', '星星', '世界', '愚者'];
  const start = stableNumber(practiceSeed.value, 3) % cards.length;
  drawnCards.value = [0, 1, 2].map((offset) => cards[(start + offset * 2) % cards.length]);
}

function selectCopybook() {
  if (!selectedCopybook.value.characters.some((character) => character.glyph === calligraphyCharacter.value)) {
    calligraphyCharacter.value = selectedCopybook.value.characters[0].glyph;
  }
}

function changeOriginalZoom(delta: number) {
  originalZoom.value = Math.max(100, Math.min(240, originalZoom.value + delta));
}

function startOriginalPan(event: PointerEvent) {
  const stage = calligraphyOriginalStage.value;
  if (!stage || event.button !== 0) return;
  calligraphyPan = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: stage.scrollLeft,
    scrollTop: stage.scrollTop,
  };
  stage.setPointerCapture?.(event.pointerId);
  stage.classList.add('dragging');
}

function moveOriginalPan(event: PointerEvent) {
  const stage = calligraphyOriginalStage.value;
  if (!stage || !calligraphyPan || calligraphyPan.pointerId !== event.pointerId) return;
  stage.scrollLeft = calligraphyPan.scrollLeft - (event.clientX - calligraphyPan.startX);
  stage.scrollTop = calligraphyPan.scrollTop - (event.clientY - calligraphyPan.startY);
}

function endOriginalPan(event: PointerEvent) {
  const stage = calligraphyOriginalStage.value;
  if (stage?.hasPointerCapture?.(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  stage?.classList.remove('dragging');
  calligraphyPan = null;
}

function resetCalligraphyReview() {
  calligraphyRatings.value = { 起笔: 3, 结构: 3, 角度: 3, 粗细: 3, 收笔: 3 };
  nextTarget.value = '起笔';
  calligraphySaveHint.value = '自评已重置，请在本子上完成这一遍后再记录。';
}

function restoreCalligraphyAttempts() {
  try {
    const raw = JSON.parse(localStorage.getItem(CALLIGRAPHY_STORE_KEY) || '[]') as unknown;
    if (!Array.isArray(raw)) return;
    calligraphyAttempts.value = raw
      .filter((item): item is CalligraphyAttempt => (
        !!item
        && typeof item === 'object'
        && typeof (item as CalligraphyAttempt).id === 'string'
        && typeof (item as CalligraphyAttempt).character === 'string'
        && typeof (item as CalligraphyAttempt).copybook === 'string'
      ))
      .slice(-8);
  } catch {
    calligraphyAttempts.value = [];
  }
}

function persistCalligraphyAttempts() {
  try {
    localStorage.setItem(CALLIGRAPHY_STORE_KEY, JSON.stringify(calligraphyAttempts.value));
  } catch { /* local practice records are optional */ }
}

function saveCalligraphyAttempt() {
  const attempt: CalligraphyAttempt = {
    id: `${Date.now()}-${calligraphyAttempts.value.length + 1}`,
    createdAt: new Date().toISOString(),
    copybook: copybook.value,
    character: calligraphyCharacter.value,
    mode: calligraphyMode.value,
    ratings: { ...calligraphyRatings.value },
    nextTarget: nextTarget.value,
    pageLabel: selectedCopybook.value.pageLabel,
  };
  calligraphyAttempts.value = [...calligraphyAttempts.value, attempt].slice(-8);
  persistCalligraphyAttempts();
  calligraphySaveHint.value = `已记录第 ${calligraphyAttempts.value.length} 遍纸上临写；下一遍只改${nextTarget.value}。`;
}

function toggleAttemptComparison() {
  compareAttemptsOpen.value = calligraphyAttempts.value.length >= 2 && !compareAttemptsOpen.value;
}

function readGenericPracticeStore(): Record<string, GenericPracticeRecord> {
  try {
    const raw = JSON.parse(localStorage.getItem(GENERIC_PRACTICE_STORE_KEY) || '{}') as unknown;
    return raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as Record<string, GenericPracticeRecord>
      : {};
  } catch {
    return {};
  }
}

function restoreGenericPractice() {
  const saved = readGenericPracticeStore()[genericRecordKey.value];
  genericOutput.value = typeof saved?.output === 'string' ? saved.output : props.practice.output;
  genericReflection.value = typeof saved?.reflection === 'string' ? saved.reflection : '';
  genericSavedAt.value = typeof saved?.savedAt === 'string' ? saved.savedAt : '';
  genericSaveHint.value = genericSavedAt.value ? '已恢复上次实践记录。' : '';
  const maxStep = Math.max(0, props.practice.studio.steps.length - 1);
  genericStepIndex.value = Math.max(0, Math.min(Number(saved?.stepIndex) || 0, maxStep));
}

function goToPreviousGenericStep() {
  if (genericCanGoBack.value) genericStepIndex.value -= 1;
}

function goToNextGenericStep() {
  if (genericCanGoNext.value) genericStepIndex.value += 1;
}

function saveGenericPractice() {
  const savedAt = new Date().toISOString();
  const store = readGenericPracticeStore();
  store[genericRecordKey.value] = {
    stepIndex: genericStepIndex.value,
    output: genericOutput.value,
    reflection: genericReflection.value,
    savedAt,
  };
  try {
    localStorage.setItem(GENERIC_PRACTICE_STORE_KEY, JSON.stringify(store));
    genericSavedAt.value = savedAt;
    genericSaveHint.value = '实践记录已保存到本机。';
  } catch {
    genericSaveHint.value = '当前设备无法写入本地存储，记录尚未保存。';
  }
}

function addMusicNote(note: string) {
  if (musicSequence.value.length >= 4) musicSequence.value = [];
  musicSequence.value = [...musicSequence.value, note];
}

async function playMusicSequence() {
  if (!musicSequence.value.length) {
    musicStatus.value = '先点至少一个音级块。';
    return;
  }
  const AudioContextClass = (window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  }).AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    musicStatus.value = '当前设备不支持音频试听，请使用带扬声器的浏览器。';
    return;
  }
  const context = new AudioContextClass();
  for (const [index, note] of musicSequence.value.entries()) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = MUSIC_NOTES[note] || 261.63;
    gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.36);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + index * 0.36 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.36 + 0.28);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(context.currentTime + index * 0.36);
    oscillator.stop(context.currentTime + index * 0.36 + 0.3);
  }
  musicStatus.value = `正在试听：${musicSequence.value.join(' · ')}`;
  window.setTimeout(() => { void context.close(); }, musicSequence.value.length * 380 + 120);
}

onMounted(restoreCalligraphyAttempts);
watch(genericRecordKey, restoreGenericPractice, { immediate: true });
</script>

<template>
  <section
    class="lv2-studio-practice"
    :class="{ 'lv2-studio-practice-embedded': useFullPracticeWorkbench }"
    :data-subject="subjectKey"
  >
    <DivinationWorkbench
      v-if="isZhouyi || isDivination"
      class="lv2-embedded-zhouyi-workbench"
      @goto-lesson="emit('goto-lesson')"
    />
    <CultureStudio v-else-if="isCulture" class="lv2-embedded-practice-workbench" />
    <CompositionStudio v-else-if="isMusic" class="lv2-embedded-practice-workbench" />
    <MedicalPracticeStudio
      v-else-if="isMedicine"
      class="lv2-embedded-practice-workbench"
      :course-name="courseName"
      @goto-lesson="emit('goto-lesson')"
    />
    <template v-else>
    <header class="lv2-studio-intro">
      <div>
        <span>{{ practice.studio.type }} · {{ courseName }}</span>
        <h2>{{ practice.studio.title }}</h2>
        <p>{{ practice.task }}</p>
        <div class="lv2-studio-capabilities">
          <span v-for="feature in practice.features" :key="feature">{{ feature }}</span>
        </div>
      </div>
      <FlaskConical :size="24" />
    </header>

    <div v-if="isSecurity" class="lv2-security-lab">
      <section class="lv2-lab-panel">
        <header><b>授权靶场</b><span>断网教学环境</span></header>
        <label class="lv2-check">
          <input v-model="authorized" type="checkbox" />
          我确认只使用教学数据与授权靶场
        </label>
        <label>目标
          <select v-model="target">
            <option>sandbox://learning/object-auth</option>
            <option>sandbox://learning/api-auth</option>
          </select>
        </label>
        <div class="lv2-request-line">
          <select v-model="method" aria-label="请求方法">
            <option>GET</option>
            <option>POST</option>
            <option>PATCH</option>
          </select>
          <input v-model="requestPath" aria-label="请求路径" />
          <button type="button" :disabled="!authorized" @click="runReplay">发送到隔离靶场</button>
        </div>
        <pre aria-live="polite">{{ replayLog || '请求重放结果会显示在这里。' }}</pre>
      </section>

      <section class="lv2-lab-panel">
        <header><b>权限矩阵</b><span>对象级授权</span></header>
        <table>
          <thead><tr><th>主体</th><th>本人资源</th><th>他人资源</th><th>管理资源</th></tr></thead>
          <tbody>
            <tr v-for="row in permissionRows" :key="row.role">
              <th>{{ row.role }}</th><td>{{ row.own }}</td><td>{{ row.other }}</td><td>{{ row.admin }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="lv2-lab-panel">
        <header><b>修复与回归</b><span>默认拒绝</span></header>
        <label class="lv2-check">
          <input v-model="fixEnabled" type="checkbox" />
          服务端查询已绑定当前主体或租户
        </label>
        <button type="button" :disabled="!authorized" @click="runRegression">
          <Play :size="14" />运行修复与回归
        </button>
        <p aria-live="polite">{{ regressionLog || '修复后运行回归，分别检查本人、他人与管理员三类资源。' }}</p>
      </section>

      <section class="lv2-lab-panel">
        <header><b>卡 / NFC 授权设备</b><span>教学实验</span></header>
        <label class="lv2-check">
          <input v-model="nfcAuthorized" type="checkbox" />
          设备归我所有或已获得明确授权
        </label>
        <p>只读取教学标签和模拟记录；未连接门禁系统、支付卡或真实第三方设备。</p>
      </section>

      <button class="lv2-secondary" type="button" :disabled="!replayLog" @click="exportReport">
        <Download :size="14" />导出实践报告
      </button>
      <section class="lv2-security-deep-practice">
        <header><b>M1 / NFC 专项实操</b><span>保留已有真机与模拟器能力</span></header>
        <SecurityPracticeStudio />
      </section>
    </div>

    <div v-else-if="isZhouyi" class="lv2-rule-lab">
      <nav aria-label="易学实践工作区">
        <button type="button" :class="{ active: zhouyiWorkspace === 'source' }" @click="zhouyiWorkspace = 'source'">经传注疏</button>
        <button type="button" :class="{ active: zhouyiWorkspace === 'numbers' }" @click="zhouyiWorkspace = 'numbers'">象数推演</button>
        <button type="button" :class="{ active: zhouyiWorkspace === 'calendar' }" @click="zhouyiWorkspace = 'calendar'">天文历法</button>
        <button type="button" :class="{ active: zhouyiWorkspace === 'geography' }" @click="zhouyiWorkspace = 'geography'">地理图谱</button>
      </nav>
      <section v-if="zhouyiWorkspace === 'source'">
        <b>乾：元，亨，利，贞。</b>
        <p>先列字义、历代注解与白话层次。争议处保留来源，不压成唯一解释。</p>
      </section>
      <section v-else-if="zhouyiWorkspace === 'numbers'">
        <label>推演 seed<input v-model="practiceSeed" /></label>
        <button type="button" @click="generateRuleDemo"><RotateCcw :size="14" />按固定规则生成</button>
        <p aria-live="polite">{{ generatedRule || '同一 seed 会得到相同结果，便于复盘规则。' }}</p>
      </section>
      <section v-else-if="zhouyiWorkspace === 'calendar'">
        <b>节气与卦气</b>
        <p>历法内容用于理解古代时间组织与文本背景，不把天象解释为现实预言。</p>
      </section>
      <section v-else>
        <b>方位与历史地理</b>
        <p>按文献、时代与地图来源核对方位和地形；堪舆材料只作文化研究，不提供现实布局建议。</p>
      </section>
      <small>民俗文化体验 · 规则演示，不构成现实预测或决策建议。</small>
    </div>

    <div v-else-if="isDivination" class="lv2-rule-lab">
      <nav aria-label="占卜实践工作区">
        <button type="button" :class="{ active: divinationWorkspace === 'stars' }" @click="divinationWorkspace = 'stars'">星图</button>
        <button type="button" :class="{ active: divinationWorkspace === 'tarot' }" @click="divinationWorkspace = 'tarot'">塔罗牌阵</button>
        <button type="button" :class="{ active: divinationWorkspace === 'crystal' }" @click="divinationWorkspace = 'crystal'">水晶球</button>
        <button type="button" :class="{ active: divinationWorkspace === 'dice' }" @click="divinationWorkspace = 'dice'">骰签</button>
      </nav>
      <section>
        <label>记录 seed<input v-model="practiceSeed" /></label>
        <button type="button" @click="drawCards"><Play :size="14" />生成一组文化练习记录</button>
        <p v-if="drawnCards.length" aria-live="polite">
          {{ drawnCards.join(' · ') }}。先描述图像，再写两种替代解释，最后记录概率提醒。
        </p>
        <p v-else>当前工作区：{{ divinationWorkspace }}。结果只用于象征、叙事与概率复盘。</p>
      </section>
      <small>文化与娱乐体验，不预测医疗、法律、金融或现实结果，不替代专业意见。</small>
    </div>

    <div v-else-if="isCalligraphy" class="lv2-calligraphy-lab">
      <header>
        <div>
          <b>看原帖 · 本子临写 · 回看自评</b>
          <p>看屏幕里的公版碑帖，在本子上写。应用不再用电脑字体冒充范字，也不要求你在屏幕上手写。</p>
        </div>
        <div class="lv2-calligraphy-settings">
          <select v-model="calligraphyMode" aria-label="书写工具">
            <option>硬笔</option>
            <option>毛笔</option>
          </select>
          <select v-model="copybook" aria-label="字帖选择" @change="selectCopybook">
            <option v-for="book in CALLIGRAPHY_BOOKS" :key="book.name" :value="book.name">
              {{ book.name }}
            </option>
          </select>
        </div>
      </header>
      <div class="lv2-calligraphy-meta">
        <a
          class="lv2-calligraphy-source"
          :href="selectedCopybook.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          原帖出处：{{ selectedCopybook.source }} · {{ selectedCopybook.name }}
        </a>
        <label>
          原帖放大
          <input v-model.number="originalZoom" type="range" min="100" max="240" step="10" aria-label="原帖放大倍数" />
          <output>{{ originalZoom }}%</output>
        </label>
      </div>

      <div class="lv2-calligraphy-workbench">
        <section class="lv2-calligraphy-original">
          <header>
            <div><b>{{ selectedCopybook.pageLabel }}</b><span>原碑帖扫描 · 可滚动查看</span></div>
            <div class="lv2-calligraphy-zoom">
              <button type="button" aria-label="缩小原帖" @click="changeOriginalZoom(-20)"><ZoomOut :size="15" /></button>
              <button type="button" aria-label="放大原帖" @click="changeOriginalZoom(20)"><ZoomIn :size="15" /></button>
            </div>
          </header>
          <div
            ref="calligraphyOriginalStage"
            class="lv2-calligraphy-original-stage"
            @pointerdown="startOriginalPan"
            @pointermove="moveOriginalPan"
            @pointerup="endOriginalPan"
            @pointercancel="endOriginalPan"
            @pointerleave="endOriginalPan"
          >
            <img
              data-calligraphy-original
              :src="selectedCopybook.image"
              :alt="`${selectedCopybook.name}原碑帖扫描`"
              :style="{ width: `${originalZoom}%` }"
            />
          </div>
          <p>拖动滚动条查看整页；先看原帖的整体重心、行列关系和墨色，再放大到选中的范字。</p>
        </section>

        <section class="lv2-calligraphy-focus-panel">
          <header><span>本页自动聚焦</span><b>{{ selectedCharacter.glyph }}</b></header>
          <div
            data-calligraphy-focus
            class="lv2-calligraphy-focus"
            :style="calligraphyFocusStyle"
            :aria-label="`${selectedCharacter.glyph}字原帖局部放大`"
            role="img"
          ></div>
          <ol>
            <li><b>看轮廓</b><span>起笔位置、主笔方向和重心。</span></li>
            <li><b>在纸上写</b><span>{{ calligraphyMode === '毛笔' ? '毛笔' : '硬笔' }}写一遍，不截屏、不描屏幕。</span></li>
            <li><b>回看一处</b><span>本轮只选一个动作修正，下一遍再改。</span></li>
          </ol>
        </section>
      </div>

      <div class="lv2-calligraphy-actions">
        <button type="button" @click="resetCalligraphyReview"><Trash2 :size="14" />重置自评</button>
        <button type="button" data-action="save-attempt" @click="saveCalligraphyAttempt">
          <Save :size="14" />记录这一遍
        </button>
        <button
          type="button"
          data-action="compare-attempts"
          :disabled="!canCompareAttempts"
          @click="toggleAttemptComparison"
        >
          <Layers3 :size="14" />对照两遍
        </button>
        <span>{{ calligraphyMode }} · {{ copybook }} · {{ calligraphyCharacter }}</span>
      </div>

      <div class="lv2-calligraphy-review">
        <section>
          <b>本子临写后自评</b>
          <p>每项按 1 到 5 分记录，只评价你在纸上写出的结果。</p>
          <label v-for="dimension in CALLIGRAPHY_RATINGS" :key="dimension" :data-rating-dimension="dimension">
            <span>{{ dimension }}</span>
            <input v-model.number="calligraphyRatings[dimension]" type="range" min="1" max="5" step="1" :aria-label="`${dimension}评分`" />
            <output>{{ calligraphyRatings[dimension] }} / 5</output>
          </label>
        </section>
        <section>
          <b>下一遍单变量目标</b>
          <p>下一遍只选择一个可观察动作，其他维度保持本轮水平。</p>
          <select v-model="nextTarget" aria-label="下一遍目标">
            <option v-for="dimension in CALLIGRAPHY_RATINGS" :key="dimension">{{ dimension }}</option>
          </select>
          <strong>下一遍只改：{{ nextTarget }}</strong>
          <small>{{ calligraphySaveHint || '记录会按字帖、范字、书写工具、自评和下一遍目标保存在本机。' }}</small>
        </section>
      </div>

      <section v-if="calligraphyAttempts.length" class="lv2-calligraphy-attempts">
        <header>
          <b>纸上练习记录 · {{ calligraphyAttempts.length }} 遍</b>
          <span>最多保留最近 8 遍</span>
        </header>
        <div>
          <article
            v-for="(attempt, index) in calligraphyAttempts"
            :key="attempt.id"
            class="lv2-calligraphy-attempt"
          >
            <header><b>第 {{ index + 1 }} 遍 · {{ attempt.character }}</b><small>{{ attempt.mode }}</small></header>
            <span>{{ attempt.pageLabel }}</span>
            <dl>
              <div v-for="dimension in CALLIGRAPHY_RATINGS" :key="dimension">
                <dt>{{ dimension }}</dt><dd>{{ attempt.ratings[dimension] }}</dd>
              </div>
            </dl>
            <small>下一遍只改：{{ attempt.nextTarget }}</small>
          </article>
        </div>
      </section>

      <section v-if="compareAttemptsOpen && canCompareAttempts" class="lv2-calligraphy-overlay">
        <header>
          <b>两遍记录对照</b>
          <button type="button" @click="compareAttemptsOpen = false">收起</button>
        </header>
        <div>
          <article v-for="(attempt, index) in calligraphyAttempts.slice(-2)" :key="attempt.id">
            <header><b>第 {{ calligraphyAttempts.length - 1 + index }} 遍 · {{ attempt.character }}</b><span>{{ attempt.nextTarget }}</span></header>
            <ul>
              <li v-for="dimension in CALLIGRAPHY_RATINGS" :key="dimension">
                <span>{{ dimension }}</span><b>{{ attempt.ratings[dimension] }} / 5</b>
              </li>
            </ul>
          </article>
        </div>
        <p>先比较起笔、结构和收笔分数，再回看纸面；不把屏幕像素重合当作临写目标。</p>
      </section>

      <div class="lv2-calligraphy-mobile-actions">
        <button type="button" @click="resetCalligraphyReview">重置</button>
        <button type="button" data-action="mobile-save-attempt" @click="saveCalligraphyAttempt">
          <Save :size="16" />记录这一遍
        </button>
        <button type="button" :disabled="!canCompareAttempts" @click="toggleAttemptComparison">
          <Layers3 :size="16" />对照
        </button>
      </div>
      <p><b>本轮只改一个变量：</b>先检查{{ nextTarget }}，在纸上写完并记录后再开始下一遍。</p>
    </div>

    <div v-else-if="isMusic" class="lv2-music-lab">
      <header><b>四拍旋律练习</b><p>按宫、商、角、徵、羽依次选四个音级块，试听后只改一个节奏变量。</p></header>
      <div class="lv2-note-palette">
        <button v-for="(_, note) in MUSIC_NOTES" :key="note" type="button" @click="addMusicNote(note)">{{ note }}</button>
      </div>
      <div class="lv2-music-sequence" aria-live="polite">
        <span v-for="index in 4" :key="index">{{ musicSequence[index - 1] || '·' }}</span>
      </div>
      <div class="lv2-music-actions">
        <button type="button" @click="playMusicSequence"><Play :size="14" />试听</button>
        <button type="button" @click="musicSequence = []; musicStatus = '已清空，重新选择四个音。'"><Trash2 :size="14" />清空</button>
      </div>
      <p>{{ musicStatus }}</p>
    </div>

    <div v-else class="lv2-generic-studio">
      <section class="lv2-generic-current" aria-live="polite">
        <header>
          <span>{{ genericStepIndex + 1 }} / {{ practice.studio.steps.length }}</span>
          <b>{{ genericCurrentStep }}</b>
        </header>
        <p>{{ genericStepGuide }}</p>
        <div class="lv2-generic-step-actions">
          <button type="button" data-action="generic-prev" :disabled="!genericCanGoBack" @click="goToPreviousGenericStep">
            上一步
          </button>
          <button type="button" data-action="generic-next" :disabled="!genericCanGoNext" @click="goToNextGenericStep">
            下一步
          </button>
        </div>
      </section>
      <div class="lv2-generic-capture">
        <label>
          <span>实践产出 · {{ practice.output }}</span>
          <textarea
            v-model="genericOutput"
            aria-label="实践产出"
            rows="4"
            placeholder="写下本步产出、数据或图例说明。"
          />
        </label>
        <label>
          <span>实践反思</span>
          <textarea
            v-model="genericReflection"
            aria-label="实践反思"
            rows="4"
            placeholder="记录卡住的位置、修正理由和下一次只改的变量。"
          />
        </label>
      </div>
      <footer class="lv2-generic-save">
        <span aria-live="polite">{{ genericSaveHint || '实践记录只保存在本机。' }}</span>
        <button type="button" data-action="generic-save" @click="saveGenericPractice">
          <Save :size="14" />保存实践记录
        </button>
      </footer>
    </div>

    <footer class="lv2-studio-footer">
      <p><b>操作边界</b>{{ practice.boundary }}</p>
      <button type="button" @click="started = !started">{{ started ? '实践进行中' : '开始实践' }}</button>
    </footer>
    </template>
  </section>
</template>

<style scoped src="./LearningPracticeStudio.css"></style>
