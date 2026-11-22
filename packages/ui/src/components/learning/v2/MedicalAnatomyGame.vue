<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, Puzzle, RotateCcw, Sparkles } from 'lucide-vue-next';

type GameMode = 'skeleton' | 'organs' | 'acupoints' | 'animals' | 'timeline' | 'terms' | 'evidence';

type AssemblyPiece = {
  id: string;
  label: string;
  hint: string;
  path: string;
  slot: { x: number; y: number };
};

type AnimalCard = {
  id: string;
  label: string;
  path: string;
  clue: string;
};

type AnimalFeature = {
  id: string;
  label: string;
};

type TimelineEvent = {
  id: string;
  label: string;
};

type TermCard = {
  id: string;
  term: string;
  definition: string;
};

type EvidenceCard = {
  id: string;
  text: string;
  category: '原文' | '注解' | '今解' | '经验' | '研究';
};

type Acupoint = {
  id: string;
  label: string;
  clue: string;
  x: number;
  y: number;
};

const GAME_MODES: readonly { key: GameMode; label: string }[] = [
  { key: 'skeleton', label: '骨骼拼装' },
  { key: 'organs', label: '器官归位' },
  { key: 'acupoints', label: '找穴位' },
  { key: 'animals', label: '动物结构配对' },
  { key: 'timeline', label: '病程时间轴' },
  { key: 'terms', label: '医学术语配对' },
  { key: 'evidence', label: '证据来源分拣' },
];

const SKELETON_PIECES: readonly AssemblyPiece[] = [
  {
    id: 'skull',
    label: '颅骨',
    hint: '头部，保护脑',
    path: 'M30 8C12 8 6 22 9 38c3 17 14 28 32 32 18-4 29-15 32-32C76 22 70 8 52 8c-8-5-14-5-22 0Z',
    slot: { x: 42, y: 5 },
  },
  {
    id: 'ribs',
    label: '胸廓',
    hint: '胸部，保护心肺',
    path: 'M50 0C30 15 18 26 14 46M50 0c20 15 32 26 36 46M18 20h64M15 38h70M16 56h68M20 74h60',
    slot: { x: 34, y: 21 },
  },
  {
    id: 'spine',
    label: '脊柱',
    hint: '背部中轴',
    path: 'M50 0c-5 20 5 36 0 54s5 30 0 46',
    slot: { x: 47, y: 24 },
  },
  {
    id: 'arm-bones',
    label: '上肢骨',
    hint: '肩、肘与手',
    path: 'M8 4l22 36 2 45M92 4L70 40l-2 45',
    slot: { x: 20, y: 31 },
  },
  {
    id: 'pelvis',
    label: '骨盆',
    hint: '连接脊柱与下肢',
    path: 'M14 18c3 25 15 38 36 47 21-9 33-22 36-47-13 13-24 18-36 18S27 31 14 18Z',
    slot: { x: 33, y: 48 },
  },
  {
    id: 'leg-bones',
    label: '下肢骨',
    hint: '髋、膝与踝',
    path: 'M17 4l10 42-6 50M83 4L73 46l6 50',
    slot: { x: 34, y: 58 },
  },
] as const;

const ORGAN_PIECES: readonly AssemblyPiece[] = [
  {
    id: 'brain',
    label: '脑',
    hint: '颅腔，中枢神经系统',
    path: 'M22 52c-17 0-22-16-13-27-4-14 12-27 27-19 8-10 26-8 31 2 17 1 26 21 14 32 7 17-10 31-26 24-9 9-27 6-33-12Z',
    slot: { x: 43, y: 5 },
  },
  {
    id: 'lungs',
    label: '肺',
    hint: '左右胸腔',
    path: 'M45 8C28 19 17 40 24 65c5 19 19 25 28 12l8-42Zm10 0c17 11 28 32 21 57-5 19-19 25-28 12L40 35Z',
    slot: { x: 31, y: 20 },
  },
  {
    id: 'heart',
    label: '心脏',
    hint: '胸腔中部偏左',
    path: 'M50 80C16 56 7 30 23 18c10-7 22-2 27 9 5-11 17-16 27-9 16 12 7 38-27 62Z',
    slot: { x: 44, y: 31 },
  },
  {
    id: 'digestive',
    label: '肝胃肠',
    hint: '主要腹腔器官',
    path: 'M11 16c23-12 82-12 78 10 12 19 5 41-16 51-19 9-49 7-61-9C1 51 1 28 11 16Zm19 23c18-9 42-9 52 1M36 47c10 16 29 17 41 2',
    slot: { x: 27, y: 44 },
  },
  {
    id: 'kidney-bladder',
    label: '肾与膀胱',
    hint: '腹膜后与盆腔',
    path: 'M15 12c-12 8-9 29 6 31 9 1 15-7 15-16 0-12-11-21-21-15Zm70 0c12 8 9 29-6 31-9 1-15-7-15-16 0-12 11-21 21-15ZM50 51c9 0 16 8 16 20s-7 20-16 20-16-8-16-20 7-20 16-20Z',
    slot: { x: 38, y: 51 },
  },
] as const;

const ANIMALS: readonly AnimalCard[] = [
  {
    id: 'human',
    label: '人',
    clue: '直立双足，双手适合精细操作',
    path: 'M44 8c9 0 15 7 15 16s-6 16-15 16-15-7-15-16S35 8 44 8ZM28 43h32l7 34-10 18H31L21 77Zm-4 8L9 73l4 8 17-18Zm40 0 15 22-4 8-17-18Zm-22 36h12l-2 40H38Zm20 0h12l4 40H64Z',
  },
  {
    id: 'dog',
    label: '犬',
    clue: '四足行走，嗅觉与听觉适应强',
    path: 'M10 40c7-12 18-18 31-18l19-10 5 18 21 3c8 2 12 11 8 18l-19 8-13 24-13-3 6-20H31L17 84l-12-4 11-30Z',
  },
  {
    id: 'bird',
    label: '鸟',
    clue: '前肢为翼，肺与气囊参与呼吸',
    path: 'M13 49c19-8 36-9 55-3 13 4 21 13 28 25-17 2-30 0-42-6-9 13-23 17-39 13l13-14-20-2Z',
  },
  {
    id: 'fish',
    label: '鱼',
    clue: '鳃呼吸，鳍和尾负责游动',
    path: 'M8 48c17-20 47-25 69-9l20-18v49L78 52C55 69 25 67 8 48Zm21-1c3-7 9-9 14-4-6 1-9 3-10 8Z',
  },
  {
    id: 'frog',
    label: '蛙',
    clue: '幼体多用鳃，成体肺与皮肤参与气体交换',
    path: 'M20 37c0-13 10-23 23-23 9 0 16 5 20 12 12-7 28-2 34 10 10 21-7 45-31 48H43C21 84 7 64 11 48Z',
  },
] as const;

const ANIMAL_FEATURES: readonly AnimalFeature[] = [
  { id: 'human', label: '直立双足与灵活双手' },
  { id: 'dog', label: '四足行走与发达嗅听觉' },
  { id: 'bird', label: '翼、肺与气囊' },
  { id: 'fish', label: '鳃、鳍与尾' },
  { id: 'frog', label: '幼体鳃、成体肺与皮肤交换' },
] as const;

const TIMELINE_EVENTS: readonly TimelineEvent[] = [
  { id: 'onset', label: '三周前：出现间歇性干咳，夜间更明显' },
  { id: 'change', label: '两周前：咳嗽频率增加，仍未记录发热' },
  { id: 'fever', label: '三天前：测得发热 38.1°C，记录用药与体温变化' },
  { id: 'today', label: '今天：补充呼吸状态、伴随症状与既往病史' },
] as const;

const TERM_CARDS: readonly TermCard[] = [
  { id: 'pattern', term: '证候', definition: '中医对一组可观察表现及其关系的概括，不等同西医病名。' },
  { id: 'differential', term: '鉴别诊断', definition: '诊断尚未确定时，并列比较多种可能，再用信息逐步缩小范围。' },
  { id: 'homeostasis', term: '稳态', definition: '机体通过反馈调节维持内环境相对稳定的过程。' },
  { id: 'meridian', term: '经络', definition: '传统医学理论中的联系网络，不等同于血管或神经。' },
  { id: 'specificity', term: '特异度', definition: '没有该病的人被检查正确判为阴性的比例。' },
] as const;

const EVIDENCE_CARDS: readonly EvidenceCard[] = [
  { id: 'classic', text: '《素问》某篇逐字摘录，并注明底本与篇名。', category: '原文' },
  { id: 'annotation', text: '某古代注家对上述条文的解释，与原文分行呈现。', category: '注解' },
  { id: 'today', text: '本课程用现代系统论作类比，并明确这是编者转述。', category: '今解' },
  { id: 'experience', text: '一位讲者分享自己的诊疗经历，只有个案和回忆。', category: '经验' },
  { id: 'research', text: '系统综述汇总多项研究，说明人群、终点与偏倚风险。', category: '研究' },
] as const;

const EVIDENCE_CATEGORIES: readonly EvidenceCard['category'][] = ['原文', '注解', '今解', '经验', '研究'];

const ACUPOINTS: readonly Acupoint[] = [
  { id: 'baihui', label: '百会', clue: '头顶正中附近', x: 50, y: 5 },
  { id: 'hegu', label: '合谷', clue: '手部虎口区域', x: 33, y: 48 },
  { id: 'neiguan', label: '内关', clue: '前臂掌侧', x: 35, y: 40 },
  { id: 'zusanli', label: '足三里', clue: '小腿前外侧，膝下', x: 39, y: 77 },
  { id: 'sanyinjiao', label: '三阴交', clue: '内踝上方', x: 41, y: 89 },
  { id: 'yongquan', label: '涌泉', clue: '足底前部', x: 34, y: 97 },
] as const;

const activeGame = ref<GameMode>('skeleton');
const selectedPieceId = ref('');
const selectedAnimalId = ref('');
const selectedTermId = ref('');
const selectedEvidenceId = ref('');
const skeletonPlaced = ref<string[]>([]);
const organPlaced = ref<string[]>([]);
const animalMatches = ref<string[]>([]);
const termMatches = ref<string[]>([]);
const evidenceMatches = ref<string[]>([]);
const timelineOrder = ref<string[]>([]);
const acupointMatches = ref<string[]>([]);
const targetAcupointId = ref(ACUPOINTS[0].id);
const feedback = ref('先选择一块碎片，再点对应空位。');
const animalFeedback = ref('先选一个动物，再选它最匹配的结构特征。');
const timelineFeedback = ref('从最早发生的事件开始，依次点到今天。');
const termFeedback = ref('先选一个术语，再选它对应的定义。');
const evidenceFeedback = ref('先选一条材料，再判断它属于原文、注解、今解、经验还是研究。');
const acupointFeedback = ref('按名称和定位线索，在地图上找到对应编号点。');
const currentPieces = computed(() => activeGame.value === 'organs' ? ORGAN_PIECES : SKELETON_PIECES);
const currentPlaced = computed(() =>
  activeGame.value === 'organs' ? organPlaced.value : skeletonPlaced.value,
);
const remainingPieces = computed(() =>
  currentPieces.value.filter((piece) => !currentPlaced.value.includes(piece.id)),
);
const placedPieces = computed(() =>
  currentPieces.value
    .filter((piece) => currentPlaced.value.includes(piece.id))
    .map((piece) => ({
      ...piece,
      transform: `translate(${piece.slot.x * 3.2} ${piece.slot.y * 5.2}) scale(${activeGame.value === 'organs' ? 0.6 : 0.55})`,
    })),
);
const isAssemblyGame = computed(() => activeGame.value === 'skeleton' || activeGame.value === 'organs');
const assemblyComplete = computed(() =>
  isAssemblyGame.value && currentPlaced.value.length === currentPieces.value.length,
);
const animalsComplete = computed(() => animalMatches.value.length === ANIMALS.length);
const termsComplete = computed(() => termMatches.value.length === TERM_CARDS.length);
const evidenceComplete = computed(() => evidenceMatches.value.length === EVIDENCE_CARDS.length);
const timelineComplete = computed(() => timelineOrder.value.length === TIMELINE_EVENTS.length);
const currentAcupoint = computed(() =>
  ACUPOINTS.find((item) => item.id === targetAcupointId.value) || ACUPOINTS[0],
);
const acupointsComplete = computed(() => acupointMatches.value.length === ACUPOINTS.length);
const remainingEvidence = computed(() =>
  EVIDENCE_CARDS.filter((item) => !evidenceMatches.value.includes(item.id)),
);

function selectGame(mode: GameMode) {
  activeGame.value = mode;
  if (mode === 'organs') feedback.value = '先选择器官，再点它所在的大致区域。';
  if (mode === 'skeleton') feedback.value = '先选择骨骼碎片，再点对应空位。';
  if (mode === 'acupoints') acupointFeedback.value = '按名称和定位线索，在地图上找到对应编号点。';
  if (mode === 'timeline') timelineFeedback.value = '从最早发生的事件开始，依次点到今天。';
  if (mode === 'terms') termFeedback.value = '先选一个术语，再选它对应的定义。';
  if (mode === 'evidence') evidenceFeedback.value = '先选一条材料，再判断它的来源层级。';
}

function selectPiece(id: string) {
  selectedPieceId.value = id;
  feedback.value = `已选择：${currentPieces.value.find((item) => item.id === id)?.label || id}`;
}

function placePiece(slotId: string) {
  if (assemblyComplete.value) return;
  if (!selectedPieceId.value) {
    feedback.value = '先在上方碎片区选择一个结构。';
    return;
  }
  const piece = currentPieces.value.find((item) => item.id === selectedPieceId.value);
  if (!piece) return;
  if (piece.id !== slotId) {
    feedback.value = `“${piece.label}”不在这个位置。${piece.hint}。`;
    return;
  }
  const target = activeGame.value === 'organs' ? organPlaced : skeletonPlaced;
  if (!target.value.includes(piece.id)) target.value = [...target.value, piece.id];
  selectedPieceId.value = '';
  feedback.value = `放置正确：${piece.label}。${piece.hint}。`;
}

function resetAssembly() {
  if (activeGame.value === 'organs') organPlaced.value = [];
  else skeletonPlaced.value = [];
  selectedPieceId.value = '';
  feedback.value = '拼装已重置。先选择一块碎片。';
}

function selectAnimal(id: string) {
  selectedAnimalId.value = id;
  animalFeedback.value = `已选择：${ANIMALS.find((animal) => animal.id === id)?.label || id}。再选结构特征。`;
}

function matchAnimal(featureId: string) {
  if (!selectedAnimalId.value) {
    animalFeedback.value = '先选择一个动物。';
    return;
  }
  if (selectedAnimalId.value !== featureId) {
    animalFeedback.value = '这组特征不匹配。注意呼吸方式、肢体结构和运动方式。';
    return;
  }
  if (!animalMatches.value.includes(featureId)) {
    animalMatches.value = [...animalMatches.value, featureId];
  }
  const animal = ANIMALS.find((item) => item.id === featureId);
  animalFeedback.value = `配对正确：${animal?.label}。${animal?.clue}。`;
  selectedAnimalId.value = '';
}

function resetAnimals() {
  animalMatches.value = [];
  selectedAnimalId.value = '';
  animalFeedback.value = '动物配对已重置。先选择一个动物。';
}

function selectTimelineEvent(id: string) {
  if (timelineOrder.value.includes(id)) {
    timelineFeedback.value = '这个事件已经排入时间轴。继续找下一件。';
    return;
  }
  const expected = TIMELINE_EVENTS[timelineOrder.value.length];
  if (expected?.id !== id) {
    timelineFeedback.value = `时间顺序还不对。下一件应该发生在${expected?.label.split('：')[0] || '更晚'}。`;
    return;
  }
  timelineOrder.value = [...timelineOrder.value, id];
  timelineFeedback.value = `已加入第 ${timelineOrder.value.length} 项：${expected.label}。`;
}

function resetTimeline() {
  timelineOrder.value = [];
  timelineFeedback.value = '病程时间轴已重置。从最早发生的事件开始。';
}

function selectTerm(id: string) {
  selectedTermId.value = id;
  termFeedback.value = `已选择：${TERM_CARDS.find((item) => item.id === id)?.term || id}。再选对应定义。`;
}

function matchTerm(definitionId: string) {
  if (!selectedTermId.value) {
    termFeedback.value = '先选择一个术语。';
    return;
  }
  if (selectedTermId.value !== definitionId) {
    termFeedback.value = '术语与定义不匹配。注意这个词属于中医、临床推理还是检查统计。';
    return;
  }
  if (!termMatches.value.includes(definitionId)) {
    termMatches.value = [...termMatches.value, definitionId];
  }
  termFeedback.value = `配对正确：${TERM_CARDS.find((item) => item.id === definitionId)?.term}。`;
  selectedTermId.value = '';
}

function resetTerms() {
  termMatches.value = [];
  selectedTermId.value = '';
  termFeedback.value = '术语配对已重置。先选择一个术语。';
}

function selectEvidence(id: string) {
  selectedEvidenceId.value = id;
  evidenceFeedback.value = `已选择材料 ${EVIDENCE_CARDS.findIndex((item) => item.id === id) + 1}，再判断来源层级。`;
}

function matchEvidence(category: EvidenceCard['category']) {
  if (!selectedEvidenceId.value) {
    evidenceFeedback.value = '先选择一条材料。';
    return;
  }
  const item = EVIDENCE_CARDS.find((entry) => entry.id === selectedEvidenceId.value);
  if (!item) return;
  if (item.category !== category) {
    evidenceFeedback.value = '来源层级不匹配。逐字材料、后人解释、编者类比、个人经历和研究综述不能混为一类。';
    return;
  }
  if (!evidenceMatches.value.includes(item.id)) {
    evidenceMatches.value = [...evidenceMatches.value, item.id];
  }
  evidenceFeedback.value = `分拣正确：这条材料属于“${category}”。`;
  selectedEvidenceId.value = '';
}

function resetEvidence() {
  evidenceMatches.value = [];
  selectedEvidenceId.value = '';
  evidenceFeedback.value = '证据来源分拣已重置。先选择一条材料。';
}

function selectAcupoint(id: string) {
  if (acupointsComplete.value) return;
  if (id !== targetAcupointId.value) {
    acupointFeedback.value = `这里不是“${currentAcupoint.value.label}”。再看线索：${currentAcupoint.value.clue}。`;
    return;
  }
  if (!acupointMatches.value.includes(id)) {
    acupointMatches.value = [...acupointMatches.value, id];
  }
  acupointFeedback.value = `定位正确：${currentAcupoint.value.label}，${currentAcupoint.value.clue}。`;
  const next = ACUPOINTS.find((item) => !acupointMatches.value.includes(item.id));
  if (next) targetAcupointId.value = next.id;
}

function selectAcupointTarget(id: string) {
  const found = acupointMatches.value.includes(id);
  if (!found) targetAcupointId.value = id;
  acupointFeedback.value = `当前目标：${ACUPOINTS.find((item) => item.id === id)?.label}。请在地图上找到它。`;
}

function resetAcupoints() {
  acupointMatches.value = [];
  targetAcupointId.value = ACUPOINTS[0].id;
  acupointFeedback.value = '穴位挑战已重置。按名称和线索找到对应编号点。';
}
</script>

<template>
  <section class="medical-game" data-medical-anatomy-game>
    <header class="medical-game-head">
      <div>
        <span>解剖结构挑战 · 示意模型</span>
        <h2>拼结构、找位置、排证据</h2>
        <p>用点选完成结构拼装、穴位定位、病程排序、术语配对和来源分拣。这里不做真实解剖操作，不展示真实切口，也不提供手术、穿刺或动物实验步骤。</p>
      </div>
      <Puzzle :size="26" aria-hidden="true" />
    </header>

    <nav class="medical-game-modes" aria-label="解剖小游戏模式">
      <button
        v-for="mode in GAME_MODES"
        :key="mode.key"
        type="button"
        :aria-pressed="activeGame === mode.key"
        :class="{ active: activeGame === mode.key }"
        @click="selectGame(mode.key)"
      >
        {{ mode.label }}
      </button>
    </nav>

    <template v-if="isAssemblyGame">
      <section class="medical-assembly">
        <div class="medical-assembly-board">
          <header>
            <div>
              <span>{{ activeGame === 'organs' ? '器官归位' : '骨骼拼装' }}</span>
              <h3>{{ currentPlaced.length }} / {{ currentPieces.length }} 已归位</h3>
            </div>
            <button type="button" @click="resetAssembly"><RotateCcw :size="15" />重置</button>
          </header>
          <div class="medical-assembly-stage">
            <svg viewBox="0 0 320 520" role="img" :aria-label="activeGame === 'organs' ? '人体器官归位示意' : '人体骨骼拼装示意'">
              <path class="assembly-body" d="M154 18c-6 0-11 9-11 22s5 23 11 23 11-10 11-23-5-22-11-22ZM84 92c8-11 30-17 44-20h72c14 3 36 9 44 20l30 93-20 12-31-58-4 96 9 168h-22l-11-125-9 125h-22l9-168-4-96-31 58-20-12Z" />
              <g
                v-for="piece in placedPieces"
                :key="piece.id"
                class="assembly-placed-piece"
                :transform="piece.transform"
              >
                <path :d="piece.path" />
              </g>
            </svg>
            <div class="medical-assembly-slots">
              <button
                v-for="piece in currentPieces"
                :key="piece.id"
                type="button"
                :class="{ filled: currentPlaced.includes(piece.id) }"
                :aria-label="`${piece.label}空位`"
                @click="placePiece(piece.id)"
              >
                <Check v-if="currentPlaced.includes(piece.id)" :size="14" />
                <span>{{ piece.label }}</span>
              </button>
            </div>
          </div>
          <p class="medical-game-feedback" aria-live="polite">{{ feedback }}</p>
        </div>

        <aside class="medical-piece-tray">
          <header>
            <span>结构碎片</span>
            <h3>{{ selectedPieceId ? '选择空位' : '选择一块碎片' }}</h3>
          </header>
          <div>
            <button
              v-for="piece in remainingPieces"
              :key="piece.id"
              type="button"
              :class="{ selected: selectedPieceId === piece.id }"
              @click="selectPiece(piece.id)"
            >
              <svg viewBox="0 0 100 100" aria-hidden="true"><path :d="piece.path" /></svg>
              <span>{{ piece.label }}</span>
            </button>
          </div>
          <p v-if="assemblyComplete" class="medical-game-complete" aria-live="polite">
            <Sparkles :size="16" />全部归位。现在用“器官相邻、骨骼保护、结构功能”三句话复盘。
          </p>
        </aside>
      </section>
    </template>

    <template v-else-if="activeGame === 'animals'">
      <section class="medical-animal-game">
        <header>
          <div>
            <span>动物结构对照</span>
            <h3>{{ animalMatches.length }} / {{ ANIMALS.length }} 已配对</h3>
          </div>
          <button type="button" @click="resetAnimals"><RotateCcw :size="15" />重置</button>
        </header>

        <div class="medical-animal-layout">
          <div class="medical-animal-cards">
            <button
              v-for="animal in ANIMALS"
              :key="animal.id"
              type="button"
              :class="{ selected: selectedAnimalId === animal.id, matched: animalMatches.includes(animal.id) }"
              @click="selectAnimal(animal.id)"
            >
              <svg viewBox="0 0 100 100" role="img" :aria-label="`${animal.label}轮廓示意`"><path :d="animal.path" /></svg>
              <span>{{ animal.label }}</span>
              <Check v-if="animalMatches.includes(animal.id)" class="medical-animal-check" :size="16" />
            </button>
          </div>

          <div class="medical-animal-features">
            <button
              v-for="feature in ANIMAL_FEATURES"
              :key="feature.id"
              type="button"
              :disabled="animalMatches.includes(feature.id)"
              :class="{ matched: animalMatches.includes(feature.id) }"
              @click="matchAnimal(feature.id)"
            >
              <span>{{ feature.label }}</span>
              <Check v-if="animalMatches.includes(feature.id)" :size="15" />
            </button>
          </div>
        </div>
        <p class="medical-game-feedback" aria-live="polite">{{ animalFeedback }}</p>
        <p v-if="animalsComplete" class="medical-game-complete" aria-live="polite">
          <Sparkles :size="16" />动物结构配对完成。不同动物解决呼吸、支撑和运动问题的方式不同，不能把人的结构直接套到其他动物。
        </p>
      </section>
    </template>

    <section v-else-if="activeGame === 'acupoints'" class="medical-point-game">
      <header>
        <div>
          <span>穴位定位挑战</span>
          <h3>{{ acupointMatches.length }} / {{ ACUPOINTS.length }} 已找到</h3>
        </div>
        <button type="button" @click="resetAcupoints"><RotateCcw :size="15" />重置</button>
      </header>
      <div class="medical-point-layout">
        <div class="medical-point-board">
          <div class="medical-point-canvas">
            <svg viewBox="0 0 320 520" role="img" aria-label="人体穴位定位示意图">
              <path class="medical-point-body" d="M154 18c-6 0-11 9-11 22s5 23 11 23 11-10 11-23-5-22-11-22ZM84 92c8-11 30-17 44-20h72c14 3 36 9 44 20l30 93-20 12-31-58-4 96 9 168h-22l-11-125-9 125h-22l9-168-4-96-31 58-20-12Z" />
              <path class="medical-point-line" d="M154 28c-7 25-7 53 0 80 8 25 8 55 0 87-9 33-9 73 0 110 7 29 7 64 0 95M122 107c-25 16-45 41-59 76-12 30-22 58-33 87M186 107c25 16 45 41 59 76 12 30 22 58 33 87" />
            </svg>
            <button
              v-for="(point, index) in ACUPOINTS"
              :key="point.id"
              type="button"
              class="medical-point-marker"
              :style="{ left: `${point.x}%`, top: `${point.y}%` }"
              :class="{ found: acupointMatches.includes(point.id) }"
              :aria-label="`地图穴位点 ${index + 1}`"
              @click="selectAcupoint(point.id)"
            >
              {{ acupointMatches.includes(point.id) ? '✓' : index + 1 }}
            </button>
          </div>
        </div>
        <aside class="medical-point-targets">
          <span>当前目标</span>
          <h4>{{ currentAcupoint.label }}</h4>
          <p>{{ currentAcupoint.clue }}</p>
          <div>
            <button
              v-for="point in ACUPOINTS"
              :key="point.id"
              type="button"
              :class="{
                current: targetAcupointId === point.id,
                found: acupointMatches.includes(point.id),
              }"
              :disabled="acupointMatches.includes(point.id)"
              @click="selectAcupointTarget(point.id)"
            >
              <Check v-if="acupointMatches.includes(point.id)" :size="14" />
              {{ point.label }}
            </button>
          </div>
          <small>只练习名称、方位和定位线索，不提供针刺、艾灸、按压或治疗操作。</small>
        </aside>
      </div>
      <p class="medical-game-feedback" aria-live="polite">{{ acupointFeedback }}</p>
      <p v-if="acupointsComplete" class="medical-game-complete" aria-live="polite">
        <Sparkles :size="16" />穴位定位完成。复述每个点的名称、方位和边界，不用“感觉差不多”代替定位依据。
      </p>
    </section>

    <section v-else-if="activeGame === 'timeline'" class="medical-text-game">
      <header>
        <div><span>合成病例 · 病史采集</span><h3>把事件按时间排好</h3></div>
        <button type="button" @click="resetTimeline"><RotateCcw :size="15" />重置</button>
      </header>
      <div class="medical-timeline-order">
        <article v-for="event in TIMELINE_EVENTS" :key="event.id">
          <i>{{ timelineOrder.indexOf(event.id) >= 0 ? timelineOrder.indexOf(event.id) + 1 : '·' }}</i>
          <span>{{ event.label }}</span>
        </article>
      </div>
      <div class="medical-timeline-pool">
        <button
          v-for="event in [...TIMELINE_EVENTS].reverse()"
          :key="event.id"
          type="button"
          :disabled="timelineOrder.includes(event.id)"
          @click="selectTimelineEvent(event.id)"
        >
          {{ event.label }}
        </button>
      </div>
      <p class="medical-game-feedback" aria-live="polite">{{ timelineFeedback }}</p>
      <p v-if="timelineComplete" class="medical-game-complete" aria-live="polite">
        <Sparkles :size="16" />时间轴完成。病史不是事件清单，要写清起点、变化、干预和当前状态。
      </p>
    </section>

    <section v-else-if="activeGame === 'terms'" class="medical-text-game">
      <header>
        <div><span>术语边界挑战</span><h3>术语与定义配对</h3></div>
        <button type="button" @click="resetTerms"><RotateCcw :size="15" />重置</button>
      </header>
      <div class="medical-term-layout">
        <div class="medical-term-cards">
          <button
            v-for="card in TERM_CARDS"
            :key="card.id"
            type="button"
            :disabled="termMatches.includes(card.id)"
            :class="{ selected: selectedTermId === card.id, matched: termMatches.includes(card.id) }"
            @click="selectTerm(card.id)"
          >
            {{ card.term }}
          </button>
        </div>
        <div class="medical-definition-cards">
          <button
            v-for="card in TERM_CARDS"
            :key="card.id"
            type="button"
            :disabled="termMatches.includes(card.id)"
            :class="{ matched: termMatches.includes(card.id) }"
            @click="matchTerm(card.id)"
          >
            <span>{{ card.definition }}</span>
            <Check v-if="termMatches.includes(card.id)" :size="15" />
          </button>
        </div>
      </div>
      <p class="medical-game-feedback" aria-live="polite">{{ termFeedback }}</p>
      <p v-if="termsComplete" class="medical-game-complete" aria-live="polite">
        <Sparkles :size="16" />术语配对完成。中医证候、西医诊断、稳态和检验统计不能互相替代。
      </p>
    </section>

    <section v-else class="medical-text-game">
      <header>
        <div><span>来源层级挑战</span><h3>材料应该放在哪一层</h3></div>
        <button type="button" @click="resetEvidence"><RotateCcw :size="15" />重置</button>
      </header>
      <div class="medical-evidence-layout">
        <div class="medical-evidence-cards">
          <button
            v-for="(card, index) in remainingEvidence"
            :key="card.id"
            type="button"
            :class="{ selected: selectedEvidenceId === card.id }"
            @click="selectEvidence(card.id)"
          >
            <i>{{ String(index + 1).padStart(2, '0') }}</i>
            <span>{{ card.text }}</span>
          </button>
        </div>
        <div class="medical-evidence-categories">
          <button
            v-for="category in EVIDENCE_CATEGORIES"
            :key="category"
            type="button"
            :disabled="evidenceMatches.length === EVIDENCE_CARDS.length"
            @click="matchEvidence(category)"
          >
            {{ category }}
          </button>
        </div>
      </div>
      <p class="medical-game-feedback" aria-live="polite">{{ evidenceFeedback }}</p>
      <p v-if="evidenceComplete" class="medical-game-complete" aria-live="polite">
        <Sparkles :size="16" />来源分拣完成。逐字原文、后人注解、编者今解、个人经验与研究综述必须各归其位。
      </p>
    </section>

    <p class="medical-game-boundary">
      所有图形均为教学示意，不代表真实断层、影像、手术视野或动物实验；不可据此进行真人或动物操作。
    </p>
  </section>
</template>

<style scoped>
.medical-game {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  overflow-y: auto;
  background: var(--lv2-surface, #fff);
  color: var(--color-text, #17211e);
}

.medical-game-head,
.medical-assembly-board > header,
.medical-piece-tray > header,
.medical-animal-game > header,
.medical-point-game > header,
.medical-text-game > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.medical-game-head span,
.medical-assembly-board header span,
.medical-piece-tray header span,
.medical-animal-game header span,
.medical-point-game header span,
.medical-text-game header span {
  color: var(--lv2-accent, #1f6f5c);
  font-size: 9px;
  font-weight: 700;
}

.medical-game-head h2 {
  margin: 4px 0 0;
  font-size: 22px;
  letter-spacing: 0;
}

.medical-game-head p,
.medical-game-feedback,
.medical-game-complete,
.medical-game-boundary,
.medical-piece-tray p {
  margin: 7px 0 0;
  color: var(--lv2-muted, #748078);
  font-size: 11px;
  line-height: 1.75;
}

.medical-game-head > svg {
  flex: 0 0 auto;
  color: var(--lv2-accent, #1f6f5c);
}

.medical-game-modes {
  display: flex;
  min-height: 44px;
  flex: 0 0 auto;
  gap: 6px;
  overflow-x: auto;
}

.medical-game-modes button,
.medical-assembly-board header button,
.medical-animal-game > header button,
.medical-point-game > header button,
.medical-text-game > header button {
  display: inline-flex;
  min-height: 44px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: var(--lv2-surface, #fff);
  color: inherit;
  font-size: 10px;
  cursor: pointer;
}

.medical-game-modes button.active {
  border-color: var(--lv2-accent, #1f6f5c);
  background: var(--lv2-accent, #1f6f5c);
  color: #fff;
  font-weight: 700;
}

.medical-assembly {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(230px, .75fr);
  gap: 12px;
}

.medical-assembly-board,
.medical-piece-tray,
.medical-animal-game,
.medical-point-game,
.medical-text-game {
  min-width: 0;
  padding: 13px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 8px;
  background: var(--lv2-card, #fafcfa);
}

.medical-assembly-board h3,
.medical-piece-tray h3,
.medical-animal-game h3,
.medical-point-game h3,
.medical-text-game h3 {
  margin: 4px 0 0;
  font-size: 15px;
}

.medical-assembly-stage {
  position: relative;
  min-height: 420px;
  margin-top: 10px;
  overflow: hidden;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: var(--lv2-card-soft, #f4f8f5);
}

.medical-assembly-stage > svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.assembly-body {
  fill: #dfece6;
  stroke: #9fb9ae;
  stroke-width: 1.5;
}

.assembly-placed-piece path {
  fill: none;
  stroke: #456f60;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.medical-assembly-slots {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
  width: min(240px, calc(100% - 20px));
  padding: 7px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: rgba(250, 252, 250, .92);
}

.medical-assembly-slots button {
  display: flex;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px;
  border: 1px dashed #9fb9ae;
  border-radius: 6px;
  background: transparent;
  color: #405a50;
  font-size: 9px;
  cursor: pointer;
}

.medical-assembly-slots button.filled {
  border-style: solid;
  border-color: #77a790;
  background: #e8f2ed;
}

.medical-piece-tray {
  display: flex;
  flex-direction: column;
}

.medical-piece-tray > div {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 12px;
}

.medical-piece-tray > div > button {
  display: flex;
  min-height: 108px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 9px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: var(--lv2-surface, #fff);
  color: inherit;
  cursor: pointer;
}

.medical-piece-tray > div > button.selected {
  border-color: var(--lv2-accent, #1f6f5c);
  background: var(--lv2-accent-wash, var(--lv2-tint, #edf7f2));
}

.medical-piece-tray svg {
  width: 58px;
  height: 58px;
}

.medical-piece-tray svg path {
  fill: none;
  stroke: #527f6d;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.medical-piece-tray span {
  font-size: 10px;
  font-weight: 700;
}

.medical-game-complete {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-top: auto !important;
  padding: 10px;
  border-radius: 7px;
  background: #eaf4ee;
  color: #315b4b;
}

.medical-animal-game > header {
  align-items: center;
}

.medical-animal-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(230px, .8fr);
  gap: 12px;
  margin-top: 12px;
}

.medical-animal-cards {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}

.medical-animal-cards button {
  position: relative;
  display: flex;
  min-height: 150px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: var(--lv2-surface, #fff);
  color: inherit;
  cursor: pointer;
}

.medical-animal-cards button.selected {
  border-color: var(--lv2-accent, #1f6f5c);
  background: var(--lv2-accent-wash, var(--lv2-tint, #edf7f2));
}

.medical-animal-cards button.matched {
  opacity: .72;
}

.medical-animal-cards svg {
  width: 66px;
  height: 66px;
}

.medical-animal-cards svg path {
  fill: #d8e8e1;
  stroke: #527f6d;
  stroke-width: 2.5;
}

.medical-animal-cards span {
  font-size: 11px;
  font-weight: 700;
}

.medical-animal-check {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 16px;
  height: 16px;
  color: var(--lv2-accent, #1f6f5c);
}

.medical-animal-features {
  display: grid;
  gap: 7px;
}

.medical-animal-features button {
  display: flex;
  min-height: 54px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 11px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: var(--lv2-surface, #fff);
  color: inherit;
  font-size: 10px;
  text-align: left;
  cursor: pointer;
}

.medical-animal-features button.matched {
  border-color: #77a790;
  background: #eaf4ee;
  color: #315b4b;
}

.medical-animal-features button:disabled {
  cursor: default;
}

.medical-point-layout {
  display: grid;
  grid-template-columns: minmax(300px, 1.15fr) minmax(230px, .85fr);
  gap: 12px;
  margin-top: 12px;
}

.medical-point-board {
  position: relative;
  display: grid;
  min-height: 470px;
  place-items: center;
  padding: 10px;
  overflow: hidden;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: var(--lv2-card-soft, #f4f8f5);
}

.medical-point-canvas {
  position: relative;
  width: min(100%, 290px);
  aspect-ratio: 320 / 520;
}

.medical-point-canvas > svg {
  display: block;
  width: 100%;
  height: 100%;
}

.medical-point-body {
  fill: #dfece6;
  stroke: #9fb9ae;
  stroke-width: 1.5;
}

.medical-point-line {
  fill: none;
  stroke: #7eaa97;
  stroke-width: 2;
  stroke-dasharray: 5 4;
}

.medical-point-marker {
  position: absolute;
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #b76d2d;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  box-shadow: 0 2px 7px rgba(55, 69, 62, .2);
  transform: translate(-50%, -50%);
  cursor: pointer;
}

.medical-point-marker.found {
  background: #44866f;
}

.medical-point-targets {
  min-width: 0;
  padding: 13px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: var(--lv2-card, #fafcfa);
}

.medical-point-targets > span {
  color: var(--lv2-accent, #1f6f5c);
  font-size: 9px;
  font-weight: 700;
}

.medical-point-targets h4 {
  margin: 5px 0 0;
  font-size: 22px;
}

.medical-point-targets > p,
.medical-point-targets > small {
  display: block;
  margin: 7px 0 0;
  color: var(--lv2-muted, #748078);
  font-size: 10px;
  line-height: 1.7;
}

.medical-point-targets > div {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 12px;
}

.medical-point-targets button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 7px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: var(--lv2-surface, #fff);
  color: inherit;
  font-size: 10px;
  cursor: pointer;
}

.medical-point-targets button.current {
  border-color: var(--lv2-accent, #1f6f5c);
  background: var(--lv2-accent-wash, var(--lv2-tint, #edf7f2));
  font-weight: 700;
}

.medical-point-targets button.found {
  opacity: .62;
}

.medical-timeline-order,
.medical-timeline-pool,
.medical-evidence-layout,
.medical-term-layout {
  margin-top: 12px;
}

.medical-timeline-order {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
}

.medical-timeline-order article {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 7px;
  min-height: 92px;
  align-content: start;
  padding: 10px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: #fafcfa;
  color: #405a50;
  font-size: 9px;
  line-height: 1.6;
}

.medical-timeline-order i {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 50%;
  background: #e6f0eb;
  color: #315b4b;
  font-style: normal;
  font-weight: 700;
}

.medical-timeline-pool {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.medical-timeline-pool button {
  min-height: 54px;
  padding: 9px 11px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: var(--lv2-surface, #fff);
  color: inherit;
  font-size: 10px;
  line-height: 1.6;
  text-align: left;
  cursor: pointer;
}

.medical-timeline-pool button:disabled {
  opacity: .4;
  cursor: default;
}

.medical-term-layout,
.medical-evidence-layout {
  display: grid;
  grid-template-columns: minmax(180px, .65fr) minmax(0, 1.35fr);
  gap: 10px;
}

.medical-term-cards,
.medical-evidence-categories {
  display: grid;
  align-content: start;
  gap: 7px;
}

.medical-term-cards button,
.medical-evidence-categories button {
  min-height: 46px;
  padding: 8px 10px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: var(--lv2-surface, #fff);
  color: inherit;
  font-size: 10px;
  cursor: pointer;
}

.medical-term-cards button.selected {
  border-color: var(--lv2-accent, #1f6f5c);
  background: var(--lv2-accent-wash, var(--lv2-tint, #edf7f2));
  font-weight: 700;
}

.medical-definition-cards,
.medical-evidence-cards {
  display: grid;
  align-content: start;
  gap: 7px;
}

.medical-definition-cards button,
.medical-evidence-cards button {
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
  padding: 9px 11px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: var(--lv2-card, #fafcfa);
  color: inherit;
  font-size: 10px;
  line-height: 1.65;
  text-align: left;
  cursor: pointer;
}

.medical-evidence-cards button.selected {
  border-color: var(--lv2-accent, #1f6f5c);
  background: var(--lv2-accent-wash, var(--lv2-tint, #edf7f2));
}

.medical-evidence-cards button i {
  flex: 0 0 auto;
  color: var(--lv2-accent, #1f6f5c);
  font-style: normal;
  font-weight: 700;
}

.medical-definition-cards button.matched {
  border-color: #77a790;
  background: #eaf4ee;
}

.medical-definition-cards button:disabled,
.medical-term-cards button:disabled {
  cursor: default;
  opacity: .64;
}

.medical-evidence-categories button {
  min-height: 54px;
  font-weight: 700;
}

.medical-game-boundary {
  padding: 9px 11px;
  border-radius: 7px;
  background: #fbf7ef;
  color: #725d3c;
  font-size: 9px;
}

@media (max-width: 900px) {
  .medical-game {
    padding: 12px;
  }

  .medical-game-head h2 {
    font-size: 19px;
  }

  .medical-assembly,
  .medical-animal-layout,
  .medical-point-layout,
  .medical-term-layout,
  .medical-evidence-layout {
    grid-template-columns: 1fr;
  }

  .medical-assembly-stage {
    min-height: 380px;
  }

  .medical-point-board {
    min-height: 430px;
  }

  .medical-animal-cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .medical-timeline-order {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .medical-game-head p,
  .medical-game-feedback,
  .medical-game-complete,
  .medical-game-boundary,
  .medical-piece-tray p {
    font-size: 12px;
  }
}

@media (max-width: 360px) {
  .medical-game-head {
    display: block;
  }

  .medical-game-head > svg {
    display: none;
  }

  .medical-assembly-slots,
  .medical-piece-tray > div,
  .medical-timeline-pool,
  .medical-point-targets > div {
    grid-template-columns: 1fr;
  }

  .medical-animal-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .medical-timeline-order {
    grid-template-columns: 1fr;
  }
}
</style>
