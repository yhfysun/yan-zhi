<script setup lang="ts">
// 周易 · 测算实践台（沉浸台）。
// 骨架契约与 culture 精读台一致：position:fixed; inset:0; z-index:3000、锁 body 滚动、
// Escape 退出 / ←→ 切步；一次只显示一个步骤，推演用「下一步」逐屏推进，无行内折叠。
// 依赖契约：runDivination / zhouyiBlockToShapes 唯一实现收口在 @yan-zhi/shared 的 zhouyi 模块，
// 本文件的 buildInput() 字段名必须与 divination.ts 各 divXxx() 读取的键一致。
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useChatStore } from '../../../stores/chat';
import { usePlatformStore } from '../../../stores/platform';

const emit = defineEmits<{
  'goto-lesson': [lessonId: string];
}>();
const props = defineProps<{ initialMethod?: string }>();

// ===== 类型与推演引擎（唯一实现收口 @yan-zhi/shared，与 server / 测试共用） =====
import { runDivination, zhouyiBlockToShapes, zhouyiCaseSearch, zhouyiCaseById, ZHOUYI_CASE_HOT, ZHOUYI_CEZI_STROKES, ZHOUYI_XINGMING_BIHUA } from '@yan-zhi/shared';
import type {
  DivinationMethod, DivinationSpec, DivinationResult,
  DivinationStep, DivinationCanonRef, DivinationVerdict, ZhouyiShape, ZhouyiCaseEntry,
} from '@yan-zhi/shared';
import { buildDivinationInput, toInt, parseDivinationUtterance, maskDivinationInput } from './divination-input';

const chat = useChatStore();
const platformStore = usePlatformStore();

type DivinationDiagram = NonNullable<DivinationStep['diagram']>;
type DivinationSourceRef = DivinationStep['sourceRef'];
type DivinationInterp = DivinationCanonRef['interpretations'][number];

type DecoratedDiagram = { shapes: ZhouyiShape[]; h: number };
function decorateDiagram(diagram: DivinationDiagram | undefined): DecoratedDiagram {
  if (!diagram) return { shapes: [], h: 0 };
  try {
    const shapes = zhouyiBlockToShapes(diagram);
    let bottom = 0;
    for (const s of shapes) {
      const b = Math.max(
        'y' in s && s.y !== undefined ? s.y : 0,
        'y2' in s && s.y2 !== undefined ? s.y2 : 0,
        ('y' in s && s.y !== undefined ? s.y : 0) + ('h' in s && s.h !== undefined ? s.h : 0),
        ('cy' in s && s.cy !== undefined ? s.cy : 0) + ('r' in s && s.r !== undefined ? s.r : 0),
      );
      if (b > bottom) bottom = b;
    }
    return { shapes, h: Math.max(60, Math.ceil(bottom) + 24) };
  } catch {
    return { shapes: [], h: 0 };
  }
}

// ===== 方法目录（11 法；level 面向用户展示「入门 / 进阶」，内部术语不上界面） =====
const METHODS: Array<{ id: DivinationMethod; label: string; hint: string; level: '入门' | '进阶' }> = [
  { id: 'meihua', label: '梅花易数', hint: '按年月日时起卦', level: '入门' },
  { id: 'dayan', label: '大衍筮法', hint: '五十蓍草分二挂一，无需输入', level: '入门' },
  { id: 'liuyao', label: '六爻纳甲', hint: '六次铜钱背字成卦', level: '入门' },
  { id: 'cezi', label: '测字', hint: '按字的笔画起卦（字占）', level: '入门' },
  { id: 'jiemeng', label: '解梦', hint: '梦象关键词查民俗梦书口径', level: '入门' },
  { id: 'sizhu', label: '四柱排盘', hint: '公历生辰排年月日时四柱', level: '进阶' },
  { id: 'bazhai', label: '八宅命卦', hint: '出生年与性别定命卦', level: '进阶' },
  { id: 'xuankong', label: '玄空飞星', hint: '元运坐向布九宫星盘', level: '进阶' },
  { id: 'wuxing', label: '五行生克', hint: '两行相生相克推演', level: '进阶' },
  { id: 'zari', label: '简易择日', hint: '按日期与事类看建除宜忌', level: '进阶' },
  { id: 'xingming', label: '姓名五格', hint: '按康熙笔画算五格（只算格数）', level: '进阶' },
];
const METHOD_LABELS: Record<DivinationMethod, string> = Object.fromEntries(
  METHODS.map((m) => [m.id, m.label]),
) as Record<DivinationMethod, string>;

const WUXING_OPTIONS = ['金', '木', '水', '火', '土'];
const DIRECTION_OPTIONS = ['坎', '艮', '震', '巽', '离', '坤', '兑', '乾'];
const DIRECTION_HINTS: Record<string, string> = {
  坎: '北', 艮: '东北', 震: '东', 巽: '东南', 离: '南', 坤: '西南', 兑: '西', 乾: '西北',
};

const FALLBACK_DISCLAIMER = '本演示为民俗文化体验与教学用途，推演口径经过简化，不构成任何现实决策建议。';

// ===== 事类（先问什么事，再选占法；词库在 @yan-zhi/shared/cases） =====
const caseQuery = ref('');
const selectedCase = ref<ZhouyiCaseEntry | null>(null);
const caseMatches = computed(() => (selectedCase.value ? [] : zhouyiCaseSearch(caseQuery.value)));

function pickCase(entry: ZhouyiCaseEntry) {
  selectedCase.value = entry;
  caseQuery.value = '';
  f.caseId = entry.id;
  if (entry.methods.length) method.value = entry.methods[0];
}
function clearCase() {
  selectedCase.value = null;
  caseQuery.value = '';
  f.caseId = '';
}

/** 一句话解析（本地纯函数）：「梦见掉牙 / 测个「明」字 / 1988.3.24 男 占一卦 / 搬家哪天好」直接预填并切占法。 */
function applyUtterance() {
  const parsed = parseDivinationUtterance(caseQuery.value);
  if (!parsed) {
    inputError.value = '没能从这句话解析出可算的内容。试试「梦见掉牙」「测个明字」「1988.3.24 13:30 男 占一卦」或直接点热门事类。';
    return;
  }
  const caseEntry = parsed.caseId ? zhouyiCaseById(parsed.caseId) : undefined;
  if (caseEntry) {
    selectedCase.value = caseEntry;
    f.caseId = caseEntry.id;
  }
  method.value = parsed.method;
  Object.assign(f, parsed.patch);
  caseQuery.value = '';
  inputError.value = '';
}

// ===== 工作台状态（中栏内嵌，非弹窗） =====
const STAGES = ['input', 'derive', 'canon', 'review', 'save'] as const;
type Stage = typeof STAGES[number];
const STAGE_NAMES: Record<Stage, string> = {
  input: '输入', derive: '推演', canon: '原文对照', review: '规则复盘', save: '记录',
};

const stage = ref<Stage>('input');
const stageIndex = computed(() => STAGES.indexOf(stage.value));
const method = ref<DivinationMethod>('meihua');
const methodLabel = computed(() => METHOD_LABELS[method.value]);

const running = ref(false);
const inputError = ref('');
const result = ref<DivinationResult | null>(null);
const stepIndex = ref(0);
const seed = ref(0);
const seedAuto = ref(true);

const preparedDerive = computed(() => {
  if (!result.value) return [] as Array<{ step: DivinationStep } & DecoratedDiagram>;
  return result.value.steps.map((step) => ({ step, ...decorateDiagram(step.diagram) }));
});
const preparedDiagrams = computed(() => {
  if (!result.value) return [] as DecoratedDiagram[];
  return result.value.diagrams
    .map((d) => decorateDiagram(d))
    .filter((d) => d.shapes.length > 0);
});
const currentPrepared = computed(() => preparedDerive.value[stepIndex.value] ?? null);

watch(() => preparedDerive.value.length, (n) => {
  if (stepIndex.value >= n) stepIndex.value = Math.max(0, n - 1);
});

// ===== 输入表单 =====
const f = reactive({
  year: '', month: '', day: '', hour: '',
  tosses: ['', '', '', '', '', ''] as string[],
  birthYear: '', gender: '男' as '男' | '女',
  yun: '', zuo: '', xiang: '',
  element1: '', element2: '',
  date: '',
  seed: '',
  caseId: '',
  ceziChars: '', ceziStrokes: '',
  dream: '',
  personName: '', nameStrokes: '',
});

function toggleToss(i: number) {
  const order = ['', '字', '背'];
  const cur = f.tosses[i] ?? '';
  f.tosses[i] = order[(order.indexOf(cur) + 1) % 3] ?? '';
}
function mockTosses() {
  for (let i = 0; i < 6; i++) f.tosses[i] = Math.random() < 0.5 ? '字' : '背';
}

function validateInput(): string {
  const num = (v: string, label: string, min: number, max: number): string => {
    const n = toInt(v);
    if (n === null) return `${label}需为整数`;
    if (n < min || n > max) return `${label}需在 ${min}–${max} 之间`;
    return '';
  };
  switch (method.value) {
    case 'meihua': {
      return num(f.year, '年', 1, 9999)
        || num(f.month, '月', 1, 12)
        || num(f.day, '日', 1, 31)
        || num(f.hour, '时', 0, 23);
    }
    case 'dayan':
      return '';
    case 'liuyao': {
      if (f.tosses.some((t) => t !== '字' && t !== '背')) return '请先点选完六次铜钱的「背 / 字」';
      return '';
    }
    case 'sizhu': {
      return num(f.year, '年', 1900, 2100)
        || num(f.month, '月', 1, 12)
        || num(f.day, '日', 1, 31)
        || num(f.hour, '时', 0, 23);
    }
    case 'bazhai':
      return num(f.birthYear, '出生年', 1900, 2100);
    case 'xuankong': {
      const yun = toInt(f.yun);
      if (yun === null || yun < 1 || yun > 9) return '元运需在 1–9 之间';
      if (!f.zuo) return '请选择坐山';
      if (!f.xiang) return '请选择朝向';
      return '';
    }
    case 'wuxing':
      if (!f.element1 || !f.element2) return '请选择两个五行';
      return '';
    case 'zari':
      if (!f.date) return '请选择日期';
      return '';
    case 'cezi': {
      const chars = f.ceziChars.trim();
      const strokes = toInt(f.ceziStrokes);
      if (!chars && !strokes) return '请输入待测的字，或直接给笔画数';
      if (!strokes && [...chars].some((ch) => !ZHOUYI_CEZI_STROKES[ch])) {
        return `「${[...chars].filter((ch) => !ZHOUYI_CEZI_STROKES[ch]).join('、')}」不在内置笔画表，请改输笔画数`;
      }
      return '';
    }
    case 'jiemeng':
      if (!f.dream.trim()) return '请输入梦象关键词（如：梦见掉牙）';
      return '';
    case 'xingming': {
      const name = f.personName.trim();
      const strokes = f.nameStrokes.trim();
      if (!name && !strokes) return '请输入姓名，或直接给各字笔画（逗号分隔）';
      if (!strokes && [...name].some((ch) => !ZHOUYI_XINGMING_BIHUA[ch])) {
        return `「${[...name].filter((ch) => !ZHOUYI_XINGMING_BIHUA[ch]).join('、')}」不在内置笔画表，请改输各字笔画`;
      }
      return '';
    }
  }
}

// 表单 → 引擎 input 的转换收口在 divination-input.ts（纯函数，宿主与测试共用同一实现）。

// ===== 引擎调用 =====
async function startRun() {
  if (running.value) return;
  inputError.value = validateInput();
  if (inputError.value) return;
  running.value = true;
  try {
    const userSeed = f.seed.trim() === '' ? undefined : toInt(f.seed);
    if (f.seed.trim() !== '' && userSeed === null) {
      inputError.value = 'seed 需为整数，或留空由系统自动生成';
      return;
    }
    seedAuto.value = userSeed === undefined;
    seed.value = (userSeed ?? (Date.now() >>> 0)) as number;
    const spec: DivinationSpec = { method: method.value, input: buildDivinationInput(method.value, f), seed: seed.value };
    const res = runDivination(spec);
    result.value = res;
    stepIndex.value = 0;
    stage.value = 'derive';
    // 推演一完成就落盘：此前只在 review→save 时写，用户看完结果直接退出/返回时记录全丢。
    // 幂等由 savedThisRun 保证，走到第 5 步不会再写第二遍。
    savedThisRun.value = false;
    ensureSaved();
  } catch (err) {
    inputError.value = `推演失败：${err instanceof Error ? err.message : String(err)}`;
  } finally {
    running.value = false;
  }
}

// ===== 步进导航 =====

function goNext() {
  switch (stage.value) {
    case 'input':
      void startRun();
      break;
    case 'derive':
      if (stepIndex.value < preparedDerive.value.length - 1) stepIndex.value += 1;
      else stage.value = 'canon';
      break;
    case 'canon':
      stage.value = 'review';
      break;
    case 'review':
      ensureSaved();
      stage.value = 'save';
      break;
    case 'save':
      break;
  }
}

function goPrev() {
  switch (stage.value) {
    case 'input':
      break;
    case 'derive':
      if (stepIndex.value > 0) stepIndex.value -= 1;
      else stage.value = 'input';
      break;
    case 'canon':
      stage.value = 'derive';
      stepIndex.value = Math.max(0, preparedDerive.value.length - 1);
      break;
    case 'review':
      stage.value = 'canon';
      break;
    case 'save':
      // 从输入页直接进记录页时没有 result，不能退回不存在的「规则复盘」。
      stage.value = result.value ? 'review' : 'input';
      break;
  }
}

// ===== 生命周期 / 键盘 =====
// ★ 中栏内嵌工作台（用户实报「实战为啥要弹窗」）：不再是 fixed 全屏弹窗——
//   顶栏无返回/退出（离开用 Tab 切换），不锁 body 滚动，不 emit focus-change。
//   组件随 tab 切换卸载，本地缓存的推演结果随组件销毁自然清空。
let previousBodyOverflow = '';
function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
}

onMounted(() => {
  const initial = props.initialMethod as DivinationMethod | undefined;
  if (initial && initial in METHOD_LABELS) method.value = initial;
  previousBodyOverflow = document.body.style.overflow;
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  document.body.style.overflow = previousBodyOverflow;
});

// ===== 记录（localStorage：按 method 分组、全部保留；绝不存 input） =====
const STORE_KEY = 'yz.zhouyi.divination.v1';
type StoredEntry = {
  method: DivinationMethod; methodLabel: string; summary: string;
  seed: number; createdAt: string; refLessonId?: string; caseName?: string;
  /** 脱敏输入摘要（生辰打码、起卦参数全显；maskDivinationInput 派生，原始 input 仍不落盘） */
  inputMasked?: string;
  /** 结果断语 label（白名单口径，便于详情一眼看到「算出了什么」） */
  verdictLabel?: string;
};
type StoreShape = Partial<Record<DivinationMethod, StoredEntry[]>>;

function readStore(): StoreShape {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as StoreShape) : {};
  } catch { return {}; }
}
function writeStore(store: StoreShape) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* 隐私模式存不了就算了 */ }
}

const savedThisRun = ref(false);
// 展开的记录用稳定 key（method+seed+createdAt）判定，不用对象引用——history computed
// 重新求值时数组元素是新对象，引用比较会让详情永远不展开（用户实报「点开没有结果」）。
const viewKey = ref('');
const entryKey = (e: StoredEntry): string => `${e.method}|${e.seed}|${e.createdAt}`;
// 记录页展示所有方法，不再只显示当前 method —— 用户从「梅花」进来却看不到刚跑的「八宅」，
// 表现就像记录丢了。按时间倒序，靠 e.methodLabel 区分。
const history = computed<StoredEntry[]>(() => Object.values(readStore())
  .flatMap((list) => list ?? [])
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

function ensureSaved() {
  if (savedThisRun.value || !result.value) return;
  const entry: StoredEntry = {
    method: result.value.method,
    methodLabel: METHOD_LABELS[result.value.method] ?? result.value.method,
    summary: result.value.summary,
    seed: seed.value,
    createdAt: new Date().toISOString(),
    inputMasked: maskDivinationInput(result.value.method, buildDivinationInput(result.value.method, f)),
    verdictLabel: result.value.verdict?.label,
    ...(selectedCase.value ? { caseName: selectedCase.value.name } : {}),
    ...(result.value.refLessonId ? { refLessonId: result.value.refLessonId } : {}),
  };
  const store = readStore();
  const list = store[entry.method] ?? [];
  store[entry.method] = [entry, ...list]; // 全部保留，不静默截断旧记录
  writeStore(store);
  savedThisRun.value = true;
}

async function clearMethodRecords() {
  try {
    await ElMessageBox.confirm(
      `将清除「${methodLabel.value}」的全部本地记录（共 ${(readStore()[method.value] ?? []).length} 条），不可恢复。`,
      '清除本方法记录',
      { confirmButtonText: '清除', cancelButtonText: '取消', type: 'warning' },
    );
  } catch { return; }
  const store = readStore();
  delete store[method.value];
  writeStore(store);
  viewKey.value = '';
  ElMessage.success('已清除本方法记录');
}

// 导出复盘 JSON：仅含 method / summary / seed / createdAt / refLessonId / disclaimer，
// 剥离 input 与出生时间等一切敏感字段。
function exportRecord() {
  if (!result.value) return;
  const saved = (readStore()[method.value] ?? []).find((e) => e.seed === seed.value);
  const payload = {
    method: result.value.method,
    summary: result.value.summary,
    seed: seed.value,
    createdAt: saved?.createdAt ?? new Date().toISOString(),
    ...(result.value.refLessonId ? { refLessonId: result.value.refLessonId } : {}),
    disclaimer: result.value.disclaimer || FALLBACK_DISCLAIMER,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zhouyi-${method.value}-${seed.value}.json`;
  a.click();
  URL.revokeObjectURL(url);
  ElMessage.success('已导出复盘 JSON（不含任何输入与生辰信息）');
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false });
}

// interpretation 标签：kind 原样（约定为 逐字原注 / 大意转述 / 今按），缺省时按字段推断
function interpTag(it: DivinationInterp): string {
  return it.kind ?? (it.paraphrase ? '大意转述' : '逐字原注');
}

function gotoLesson() {
  const id = result.value?.refLessonId;
  if (id) emit('goto-lesson', id);
}

/** 从输入页直接看记录（不必先跑一次推演）；记录页没有 result 时「上一步」回到输入页。 */
function openHistory() {
  viewKey.value = '';
  stage.value = 'save';
}

// ===== 对话测算（内嵌与「玄机先生」的对话：像聊天一样问事，不必填表单） =====
const SUANMING_AGENT_ID = 'a_builtin_suanming'; // ★ 与 apps/server/src/builtin-learning-agents.ts 成对维护
const showChat = ref(false);
const chatConvId = ref('');
const chatInput = ref('');
const chatSending = ref(false);
const chatMsgs = computed(() => (chatConvId.value ? chat.messagesByConv[chatConvId.value] || [] : []));
const chatStreaming = computed(() => !!chatConvId.value && chat.isConvStreaming(chatConvId.value));

async function openChat() {
  showChat.value = true;
  if (chatConvId.value) return;
  await platformStore.ensurePlatforms();
  await platformStore.ensureModels();
  chatConvId.value = await chat.createConversation('测算台 · 对话测算', {
    agentId: SUANMING_AGENT_ID,
    source: 'learning',
    sourceMeta: { learningKind: 'free', learningSubject: '周易' },
  });
  await chat.loadMessages(chatConvId.value);
}
function backToForm() {
  showChat.value = false;
}
async function sendChat(preset?: string) {
  const content = (preset ?? chatInput.value).trim();
  if (!content || chatSending.value || !chatConvId.value) return;
  const conv = chat.conversations.find((c) => c.id === chatConvId.value);
  let model = conv?.modelId ? platformStore.models.find((m: any) => m.id === conv.modelId) : undefined;
  if (!model) model = platformStore.models[0] as any;
  const platform = model ? platformStore.platforms.find((p: any) => p.id === (model as any).platformId) : undefined;
  if (!platform || !model) {
    ElMessage.error('还没有可用的 AI 模型 —— 请先在对话页配置平台与模型');
    return;
  }
  chatSending.value = true;
  try {
    if (!preset) chatInput.value = '';
    await chat.sendMessage(content, platform, model, undefined, {}, chatConvId.value);
  } catch (e) {
    console.error('[zhouyi] 对话测算发送失败', e);
    ElMessage.error(e instanceof Error ? `发送失败：${e.message}` : '发送失败，请稍后重试');
  } finally {
    chatSending.value = false;
  }
}
/** 把当前排盘结果发给先生解读（只发摘要/seed/事类，不发原始输入） */
function askAboutResult() {
  if (!result.value) return;
  const casePart = selectedCase.value ? `（事类：${selectedCase.value.name}）` : '';
  void sendChat(`我刚在测算台用「${methodLabel.value}」${casePart}排了盘，seed ${seed.value}。排盘摘要：${result.value.summary}。请按古法口径给我解读这一盘。`);
}
</script>

<template>
  <section class="dv-root" aria-label="周易测算实践台">
    <header class="dv-head">
      <div class="dv-title">周易测算 · {{ methodLabel }}（{{ STAGE_NAMES[stage] }}）</div>
      <div class="dv-count">步骤 {{ stageIndex + 1 }}/5</div>
    </header>

    <main class="dv-main">
      <!-- 对话测算：与玄机先生聊天问事（不必填表单，覆盖主区域） -->
      <section v-if="showChat" class="dv-chat">
        <header class="dv-chat-head">
          <div>
            <b>玄机先生 · 对话测算</b>
            <span>民俗口径，仅供娱乐参考；医疗 / 投资 / 法律请找专业人士</span>
          </div>
          <button type="button" class="dv-btn-light" @click="backToForm">回到表单</button>
        </header>
        <div class="dv-chat-msgs">
          <p v-if="!chatMsgs.length" class="dv-note">
            直接问就行：「我 1990 年生男，今年适合换工作吗」「梦见大水什么意思」「测个「安」字」。
            先生按古法口径给吉凶倾向；生辰属隐私，介意可只问事不报年。
          </p>
          <div v-for="(m, i) in chatMsgs" :key="i" class="dv-chat-row" :class="m.role">
            <div class="dv-chat-bubble">{{ m.content }}</div>
          </div>
        </div>
        <div class="dv-chat-entry">
          <button v-if="result" type="button" class="dv-btn-light" @click="askAboutResult">把刚才的排盘发给先生</button>
          <input
            v-model="chatInput"
            class="dv-chat-input"
            type="text"
            :placeholder="chatStreaming ? '先生正在回答…' : '想问什么？前程 / 姻缘 / 解梦 / 测字…'"
            :disabled="chatStreaming"
            @keyup.enter="sendChat()"
          />
          <button v-if="chatStreaming" type="button" class="dv-btn-light dv-btn-danger" @click="chat.stop(chatConvId)">停止</button>
          <button v-else type="button" class="dv-primary" :disabled="chatSending || !chatInput.trim()" @click="sendChat()">{{ chatSending ? '发送中…' : '发送' }}</button>
        </div>
      </section>

      <div v-else class="dv-paper">
        <!-- 第 1 步：输入 -->
        <section v-if="stage === 'input'" class="dv-step">
          <p class="dv-banner">民俗文化体验 · 教学演示</p>

          <!-- 事类：先问什么事，再选占法（姻缘/前程/搬家/开市…命中后自动切推荐占法） -->
          <div class="dv-case">
            <input
              v-if="!selectedCase"
              v-model="caseQuery"
              class="dv-case-input"
              type="text"
              aria-label="想问什么事"
              placeholder="想问什么事？姻缘 / 前程 / 搬家 / 梦见掉牙 / 测个「明」字…"
              @keyup.enter="applyUtterance"
            />
            <button v-if="!selectedCase && caseQuery.trim()" type="button" class="dv-btn-light" @click="applyUtterance">按这句话起卦</button>
            <div v-if="selectedCase" class="dv-case-picked">
              <b>事类 · {{ selectedCase.name }}</b>
              <span>{{ selectedCase.plain }}</span>
              <button type="button" class="dv-btn-light" @click="clearCase">换一件事</button>
            </div>
            <ul v-if="!selectedCase && caseQuery.trim() && caseMatches.length" class="dv-case-list">
              <li v-for="e in caseMatches" :key="e.id">
                <button type="button" class="dv-case-item" @click="pickCase(e)">
                  <b>{{ e.name }}</b>
                  <span>{{ e.plain }}</span>
                </button>
              </li>
            </ul>
            <p v-else-if="!selectedCase && caseQuery.trim()" class="dv-hint">没有匹配的事类，可以直接选下面的起卦方法。</p>
            <div v-if="selectedCase" class="dv-case-guide">
              <p>古法口径：{{ selectedCase.yongshen || '黄历按建除十二神与宜忌词库择日' }}</p>
              <p class="dv-case-src">——{{ selectedCase.sourceRef.work }}{{ selectedCase.sourceRef.dynasty ? ' · ' + selectedCase.sourceRef.dynasty : '' }}（{{ selectedCase.sourceRef.license }}）</p>
              <p v-if="selectedCase.note" class="dv-hint">{{ selectedCase.note }}</p>
            </div>
            <div v-if="!selectedCase" class="dv-case-chips">
              <button
                v-for="h in ZHOUYI_CASE_HOT"
                :key="h.word"
                type="button"
                @click="pickCase(zhouyiCaseById(h.caseId)!)"
              >{{ h.word }}</button>
            </div>
          </div>

          <div class="dv-top-row">
            <h2 class="dv-h2">选择起卦方法</h2>
            <div class="dv-top-actions">
              <button type="button" class="dv-btn-light" @click="openChat">对话测算 · 问先生</button>
              <button type="button" class="dv-btn-light" @click="openHistory">演练记录（{{ history.length }}）</button>
            </div>
          </div>
          <div class="dv-methods">
            <button
              v-for="m in METHODS"
              :key="m.id"
              type="button"
              class="dv-method"
              :class="{ 'is-active': method === m.id }"
              @click="method = m.id"
            >
              <span class="dv-method-top">
                <b>{{ m.label }}</b>
                <i class="dv-tag">{{ m.level }}</i>
              </span>
              <span class="dv-method-hint">{{ m.hint }}</span>
            </button>
          </div>

          <h3 class="dv-h3">{{ methodLabel }} · 输入</h3>

          <!-- 梅花易数：年月日时数字 -->
          <div v-if="method === 'meihua'" class="dv-form">
            <label class="dv-field"><span>年</span><input v-model="f.year" type="number" min="1" max="9999" placeholder="如 2026" /></label>
            <label class="dv-field"><span>月</span><input v-model="f.month" type="number" min="1" max="12" placeholder="1–12" /></label>
            <label class="dv-field"><span>日</span><input v-model="f.day" type="number" min="1" max="31" placeholder="1–31" /></label>
            <label class="dv-field"><span>时</span><input v-model="f.hour" type="number" min="0" max="23" placeholder="0–23" /></label>
          </div>

          <!-- 大衍筮法：无需输入 -->
          <p v-else-if="method === 'dayan'" class="dv-note">大衍筮法无需外部输入，可直接开始推演。</p>

          <!-- 六爻：六次铜钱 背/字 点选 + 模拟摇卦 -->
          <div v-else-if="method === 'liuyao'" class="dv-form dv-form-col">
            <div class="dv-tosses">
              <button
                v-for="(_, i) in f.tosses"
                :key="i"
                type="button"
                class="dv-toss"
                :class="{ 'is-set': f.tosses[i] !== '' }"
                @click="toggleToss(i)"
              >
                <small>第 {{ i + 1 }} 爻</small>
                <b>{{ f.tosses[i] || '未定' }}</b>
              </button>
            </div>
            <div class="dv-row">
              <button type="button" class="dv-btn-light" @click="mockTosses">模拟摇卦</button>
              <span class="dv-hint">点选铜钱正反面（背 / 字），自下而上为第 1–6 爻。</span>
            </div>
          </div>

          <!-- 四柱：公历生辰 -->
          <div v-else-if="method === 'sizhu'" class="dv-form">
            <label class="dv-field"><span>公历 年</span><input v-model="f.year" type="number" min="1900" max="2100" placeholder="1900–2100" /></label>
            <label class="dv-field"><span>月</span><input v-model="f.month" type="number" min="1" max="12" placeholder="1–12" /></label>
            <label class="dv-field"><span>日</span><input v-model="f.day" type="number" min="1" max="31" placeholder="1–31" /></label>
            <label class="dv-field"><span>时</span><input v-model="f.hour" type="number" min="0" max="23" placeholder="0–23" /></label>
          </div>

          <!-- 八宅：出生年 + 性别 -->
          <div v-else-if="method === 'bazhai'" class="dv-form">
            <label class="dv-field"><span>出生年</span><input v-model="f.birthYear" type="number" min="1900" max="2100" placeholder="1900–2100" /></label>
            <label class="dv-field">
              <span>性别</span>
              <select v-model="f.gender">
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </label>
          </div>

          <!-- 玄空飞星：元运 + 坐向 -->
          <div v-else-if="method === 'xuankong'" class="dv-form">
            <label class="dv-field"><span>元运</span><input v-model="f.yun" type="number" min="1" max="9" placeholder="1–9 运" /></label>
            <label class="dv-field">
              <span>坐</span>
              <select v-model="f.zuo">
                <option value="">请选择坐山</option>
                <option v-for="d in DIRECTION_OPTIONS" :key="d" :value="d">{{ d }}（{{ DIRECTION_HINTS[d] }}）</option>
              </select>
            </label>
            <label class="dv-field">
              <span>向</span>
              <select v-model="f.xiang">
                <option value="">请选择朝向</option>
                <option v-for="d in DIRECTION_OPTIONS" :key="d" :value="d">{{ d }}（{{ DIRECTION_HINTS[d] }}）</option>
              </select>
            </label>
            <p class="dv-hint">演示采用八方位简化口径。</p>
          </div>

          <!-- 五行生克：两个五行下拉 -->
          <div v-else-if="method === 'wuxing'" class="dv-form">
            <label class="dv-field">
              <span>第一行</span>
              <select v-model="f.element1">
                <option value="">请选择</option>
                <option v-for="w in WUXING_OPTIONS" :key="w" :value="w">{{ w }}</option>
              </select>
            </label>
            <label class="dv-field">
              <span>第二行</span>
              <select v-model="f.element2">
                <option value="">请选择</option>
                <option v-for="w in WUXING_OPTIONS" :key="w" :value="w">{{ w }}</option>
              </select>
            </label>
          </div>

          <!-- 简易择日：日期 -->
          <div v-else-if="method === 'zari'" class="dv-form">
            <label class="dv-field"><span>日期</span><input v-model="f.date" type="date" /></label>
          </div>

          <!-- 测字：字或笔画 -->
          <div v-else-if="method === 'cezi'" class="dv-form">
            <label class="dv-field"><span>待测的字</span><input v-model="f.ceziChars" type="text" maxlength="4" placeholder="如：明（命中内置笔画表自动取笔画）" /></label>
            <label class="dv-field"><span>或笔画数</span><input v-model="f.ceziStrokes" type="number" min="1" max="99" placeholder="字不在笔画表时直接给笔画" /></label>
            <p class="dv-hint">简化口径：仿梅花「以数起卦」，按现行规范笔画取数。</p>
          </div>

          <!-- 解梦：梦象关键词 -->
          <div v-else-if="method === 'jiemeng'" class="dv-form">
            <label class="dv-field"><span>梦象</span><input v-model="f.dream" type="text" maxlength="24" placeholder="如：梦见掉牙 / 梦见大水 / 梦见蛇" /></label>
            <p class="dv-hint">查民俗梦书条目口径（转述）；未收录的梦象按「梦无定象」说明。</p>
          </div>

          <!-- 姓名五格：姓名或笔画 -->
          <div v-else-if="method === 'xingming'" class="dv-form">
            <label class="dv-field"><span>姓名</span><input v-model="f.personName" type="text" maxlength="4" placeholder="如：王小明（命中内置康熙笔画表自动取笔画）" /></label>
            <label class="dv-field"><span>或各字笔画</span><input v-model="f.nameStrokes" type="text" placeholder="逗号分隔，如：4,3,4（康熙笔画口径）" /></label>
            <p class="dv-hint">近人体例，非古籍：只计算天/人/地/外/总五格格数，不做数理吉凶断语，不替人起名。</p>
          </div>

          <!-- 可选 seed -->
          <label class="dv-field dv-seed-field">
            <span>seed（可选）</span>
            <input v-model="f.seed" type="text" inputmode="numeric" placeholder="留空自动生成；同 seed 结果一致" />
          </label>

          <p v-if="inputError" class="dv-error" role="alert">{{ inputError }}</p>

          <div class="dv-actions">
            <button type="button" class="dv-primary" :disabled="running" @click="goNext">
              {{ running ? '推演中…' : '开始推演' }}
            </button>
          </div>
        </section>

        <!-- 第 2 步：推演（一次一条规则，逐步推进） -->
        <section v-else-if="stage === 'derive' && currentPrepared" class="dv-step">
          <p class="dv-crumb">推演 第 {{ stepIndex + 1 }} / {{ preparedDerive.length }} 条 · seed {{ seed }}{{ seedAuto ? '（自动）' : '' }}</p>
          <h2 class="dv-h2">{{ currentPrepared.step.rule }}</h2>
          <p class="dv-src">
            {{ currentPrepared.step.sourceRef.work }}<template v-if="currentPrepared.step.sourceRef.dynasty"> · {{ currentPrepared.step.sourceRef.dynasty }}</template><template v-if="currentPrepared.step.sourceRef.juan"> · {{ currentPrepared.step.sourceRef.juan }}</template> · {{ currentPrepared.step.sourceRef.license }}
          </p>
          <dl class="dv-io">
            <div><dt>输入</dt><dd>{{ currentPrepared.step.input }}</dd></div>
            <div><dt>输出</dt><dd>{{ currentPrepared.step.output }}</dd></div>
            <div v-if="currentPrepared.step.note"><dt>口径</dt><dd>{{ currentPrepared.step.note }}</dd></div>
          </dl>
          <svg
            v-if="currentPrepared.shapes.length"
            class="dv-svg"
            :viewBox="`0 0 680 ${currentPrepared.h}`"
            role="img"
            :aria-label="`推演图：${currentPrepared.step.rule}`"
          >
            <template v-for="(s, i) in currentPrepared.shapes" :key="i">
              <line
                v-if="s.kind === 'line'"
                :x1="s.x1" :y1="s.y1" :x2="s.x2" :y2="s.y2"
                :stroke="s.color || 'currentColor'" :stroke-width="s.strokeWidth ?? 2"
                :stroke-dasharray="s.dashed ? '6 4' : undefined"
                stroke-linecap="round"
              />
              <rect
                v-else-if="s.kind === 'rect'"
                :x="s.x" :y="s.y" :width="s.w" :height="s.h"
                :fill="s.fill || 'none'" :stroke="s.stroke || 'currentColor'" stroke-width="1"
              />
              <circle
                v-else-if="s.kind === 'circle'"
                :cx="s.cx" :cy="s.cy" :r="s.r"
                :fill="s.fill || 'none'" :stroke="s.stroke || 'currentColor'" stroke-width="1.5"
              />
              <text
                v-else-if="s.kind === 'text'"
                :x="s.x" :y="s.y" :fill="s.color || 'currentColor'"
                :font-size="s.fontSize ?? 16" :text-anchor="s.anchor || 'middle'"
              >{{ s.text }}</text>
            </template>
          </svg>
          <div class="dv-actions dv-actions-split">
            <button type="button" class="dv-btn-light" @click="goPrev">上一步</button>
            <button type="button" class="dv-primary" @click="goNext">
              {{ stepIndex < preparedDerive.length - 1 ? '下一步' : '进入原文对照' }}
            </button>
          </div>
        </section>

        <!-- 第 3 步：原文对照 -->
        <section v-else-if="stage === 'canon'" class="dv-step">
          <p class="dv-crumb">原文对照 · 共 {{ result?.canonRefs.length ?? 0 }} 条（原文均为公版典籍或仅列书目）</p>
          <article v-for="(c, ci) in result?.canonRefs ?? []" :key="ci" class="dv-canon">
            <h3 class="dv-canon-title">{{ c.title }}</h3>
            <p class="dv-canon-text">{{ c.text }}</p>
            <ul v-if="c.annotations.length" class="dv-annos">
              <li v-for="(a, ai) in c.annotations" :key="ai" class="dv-anno">
                <b>{{ a.term }}</b><span v-if="a.pinyin" class="dv-anno-py">{{ a.pinyin }}</span>
                <span class="dv-anno-gloss">{{ a.gloss }}</span>
                <span v-if="a.note" class="dv-anno-note">{{ a.note }}</span>
              </li>
            </ul>
            <ul v-if="c.interpretations.length" class="dv-interps">
              <li v-for="(it, ii) in c.interpretations" :key="ii" class="dv-interp">
                <p class="dv-interp-head">
                  <i class="dv-tag">{{ interpTag(it) }}</i>
                  <span class="dv-interp-meta">{{ it.school }} · {{ it.dynasty }}</span>
                </p>
                <p class="dv-interp-text">{{ it.text }}</p>
                <p v-if="it.paraphrase" class="dv-interp-sub"><b>大意转述</b>此条为转述口径，非逐字引文</p>
                <p v-if="it.plain" class="dv-interp-sub"><b>今按</b>{{ it.plain }}</p>
              </li>
            </ul>
            <p class="dv-plain">白话：{{ c.plain }}</p>
          </article>
          <div class="dv-actions dv-actions-split">
            <button type="button" class="dv-btn-light" @click="goPrev">上一步</button>
            <button type="button" class="dv-primary" @click="goNext">进入规则复盘</button>
          </div>
        </section>

        <!-- 第 4 步：规则复盘 -->
        <section v-else-if="stage === 'review'" class="dv-step">
          <p class="dv-crumb">规则复盘 · seed {{ seed }}</p>
          <div v-if="result?.verdict" class="dv-verdict">
            <p class="dv-verdict-label">
              <i class="dv-tag dv-tag-p0">古籍规则演示</i>
              <b>{{ result.verdict.label }}</b>
            </p>
            <blockquote class="dv-quote">
              <p class="dv-quote-text">{{ result.verdict.quote }}</p>
              <cite>
                {{ result.verdict.sourceRef.work }}<template v-if="result.verdict.sourceRef.dynasty"> · {{ result.verdict.sourceRef.dynasty }}</template><template v-if="result.verdict.sourceRef.juan"> · {{ result.verdict.sourceRef.juan }}</template>
                <i v-if="result.verdict.paraphrase" class="dv-tag">大意转述</i>
              </cite>
            </blockquote>
            <p class="dv-plain">白话：{{ result.verdict.plain }}</p>
          </div>
          <template v-if="preparedDiagrams.length">
            <h3 class="dv-h3">复盘图示</h3>
            <svg
              v-for="(d, di) in preparedDiagrams"
              :key="di"
              class="dv-svg"
              :viewBox="`0 0 680 ${d.h}`"
              role="img"
              aria-label="复盘图示"
            >
              <template v-for="(s, si) in d.shapes" :key="si">
                <line
                  v-if="s.kind === 'line'"
                  :x1="s.x1" :y1="s.y1" :x2="s.x2" :y2="s.y2"
                  :stroke="s.color || 'currentColor'" :stroke-width="s.strokeWidth ?? 2"
                  :stroke-dasharray="s.dashed ? '6 4' : undefined"
                  stroke-linecap="round"
                />
                <rect
                  v-else-if="s.kind === 'rect'"
                  :x="s.x" :y="s.y" :width="s.w" :height="s.h"
                  :fill="s.fill || 'none'" :stroke="s.stroke || 'currentColor'" stroke-width="1"
                />
                <circle
                  v-else-if="s.kind === 'circle'"
                  :cx="s.cx" :cy="s.cy" :r="s.r"
                  :fill="s.fill || 'none'" :stroke="s.stroke || 'currentColor'" stroke-width="1.5"
                />
                <text
                  v-else-if="s.kind === 'text'"
                  :x="s.x" :y="s.y" :fill="s.color || 'currentColor'"
                  :font-size="s.fontSize ?? 16" :text-anchor="s.anchor || 'middle'"
                >{{ s.text }}</text>
              </template>
            </svg>
          </template>
          <p class="dv-disclaimer">{{ result?.disclaimer || FALLBACK_DISCLAIMER }}</p>
          <div class="dv-actions dv-actions-split">
            <button type="button" class="dv-btn-light" @click="goPrev">上一步</button>
            <button
              v-if="result?.refLessonId"
              type="button"
              class="dv-primary"
              @click="gotoLesson"
            >回到第 {{ result.refLessonId }} 课</button>
            <button v-else type="button" class="dv-primary" @click="goNext">进入记录</button>
          </div>
        </section>

        <!-- 第 5 步：记录 -->
        <section v-else-if="stage === 'save'" class="dv-step">
          <p class="dv-crumb">记录 · 仅保存摘要，不保存任何输入与生辰</p>
          <div v-if="result" class="dv-save-card">
            <p class="dv-save-line"><b>{{ methodLabel }}</b><span>seed {{ seed }} · {{ savedThisRun ? '已保存到本地' : '尚未保存' }}</span></p>
            <p class="dv-save-summary">{{ result.summary }}</p>
            <div class="dv-actions dv-actions-row">
              <button type="button" class="dv-btn-light" @click="exportRecord">导出复盘 JSON</button>
            </div>
          </div>

          <div class="dv-top-row">
            <h3 class="dv-h3">全部演练记录（{{ history.length }} 条）</h3>
            <button type="button" class="dv-btn-light dv-btn-danger" @click="clearMethodRecords">清除「{{ methodLabel }}」记录</button>
          </div>
          <ul v-if="history.length" class="dv-history">
            <li v-for="(e, ei) in history" :key="ei">
              <button
                type="button"
                class="dv-history-item"
                :class="{ 'is-active': viewKey === entryKey(e) }"
                @click="viewKey = viewKey === entryKey(e) ? '' : entryKey(e)"
              >
                <span class="dv-history-method">{{ e.methodLabel }}</span>
                <span v-if="e.caseName" class="dv-history-lesson">{{ e.caseName }}</span>
                <span class="dv-history-time">{{ fmtTime(e.createdAt) }}</span>
                <span class="dv-history-seed">seed {{ e.seed }}</span>
                <span v-if="e.refLessonId" class="dv-history-lesson">第 {{ e.refLessonId }} 课</span>
              </button>
              <div v-if="viewKey === entryKey(e)" class="dv-history-detail">
                <p v-if="e.verdictLabel" class="dv-history-verdict">结果 · {{ e.verdictLabel }}</p>
                <p>{{ e.summary }}</p>
                <p v-if="e.inputMasked" class="dv-history-input">输入（脱敏）· {{ e.inputMasked }}</p>
                <p v-else class="dv-history-input">（旧记录未存脱敏输入，仅摘要）</p>
              </div>
            </li>
          </ul>
          <p v-else class="dv-note">暂无演练记录。完成任意一次推演后会自动保留摘要。</p>

          <div class="dv-actions">
            <button type="button" class="dv-btn-light" @click="goPrev">上一步</button>
          </div>
        </section>
      </div>
    </main>
  </section>
</template>

<style scoped>
/* ===== 工作台骨架（--dv-* 私有变量；深色工作台 + 浅色纸面） =====
   ★ 中栏内嵌（用户实报「实战为啥要弹窗」）：非 fixed 弹窗，随 tab 切换挂载/卸载，
   高度链由 Learning.vue 的 .lp-col-mid:has(> .dv-root) 特例供足。 */
.dv-root {
  --dv-bg: #101418;
  --dv-panel: #1a2026;
  --dv-line: rgba(214, 205, 188, .16);
  --dv-ink: #f0ead9;
  --dv-muted: #a9a294;
  --dv-accent: #b98a4e;
  --dv-paper: #fffdf8;
  --dv-paper-ink: #2c2a26;
  --dv-paper-muted: #6f6a60;
  --dv-line-soft: rgba(44, 42, 38, .18);
  --dv-error: #8a2f2b;
  --dv-serif: "Songti SC", "STSong", "SimSun", "Noto Serif SC", serif;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--dv-ink);
  background: linear-gradient(150deg, var(--dv-bg), #171d22 58%, #0c1014);
}

/* 顶栏：方法名 / 步骤 x/n（返回与退出已退役——离开用 Tab 切换） */
.dv-head {
  flex: 0 0 52px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 0 20px;
  border-bottom: 1px solid var(--dv-line);
  background: color-mix(in srgb, var(--dv-bg) 92%, transparent);
}
.dv-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  border: 1px solid var(--dv-line);
  border-radius: 6px;
  background: var(--dv-panel);
  color: var(--dv-muted);
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
}
.dv-btn:hover:not(:disabled) { border-color: color-mix(in srgb, var(--dv-accent) 45%, transparent); color: var(--dv-ink); }
.dv-btn:disabled { opacity: .45; cursor: not-allowed; }
.dv-title { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.dv-count { color: var(--dv-muted); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }

/* 主区 + 纸面 */
.dv-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 22px clamp(16px, 4vw, 56px) 40px;
}
.dv-paper {
  width: min(720px, 100%);
  margin: 0 auto;
  border: 1px solid rgba(255, 255, 255, .1);
  border-radius: 8px;
  background: var(--dv-paper);
  color: var(--dv-paper-ink);
  box-shadow: 0 22px 68px rgba(0, 0, 0, .3);
  padding: 26px clamp(18px, 4vw, 40px) 30px;
}
.dv-step { display: flex; flex-direction: column; gap: 16px; }

.dv-banner {
  margin: 0;
  padding: 6px 10px;
  border: 1px solid var(--dv-line-soft);
  border-radius: 6px;
  background: color-mix(in srgb, var(--dv-accent) 8%, var(--dv-paper));
  color: var(--dv-paper-ink);
  font-size: 12px;
  letter-spacing: .08em;
}
.dv-crumb { margin: 0; color: var(--dv-paper-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.dv-h2 { margin: 0; font-family: var(--dv-serif); font-size: 22px; line-height: 1.4; }
.dv-top-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.dv-top-row .dv-h3 { margin: 0; }
.dv-top-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* ===== 对话测算（玄机先生） ===== */
.dv-chat {
  width: min(720px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  flex: 1;
}
.dv-chat-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.dv-chat-head > div { display: flex; flex-direction: column; gap: 2px; }
.dv-chat-head b { color: var(--dv-ink); font-size: 15px; }
.dv-chat-head span { color: var(--dv-muted, rgba(240, 234, 217, .55)); font-size: 11px; }
.dv-chat-msgs { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 4px 2px; }
.dv-chat-row { display: flex; }
.dv-chat-row.user { justify-content: flex-end; }
.dv-chat-row.assistant { justify-content: flex-start; }
.dv-chat-bubble {
  max-width: 78%;
  white-space: pre-wrap;
  word-break: break-word;
  border-radius: 10px;
  padding: 9px 13px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--dv-paper-ink);
  background: var(--dv-paper);
  border: 1px solid color-mix(in srgb, var(--dv-accent) 26%, transparent);
}
.dv-chat-row.user .dv-chat-bubble {
  background: color-mix(in srgb, var(--dv-accent) 22%, var(--dv-panel));
  color: var(--dv-ink);
}
.dv-chat-entry { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dv-chat-input {
  flex: 1;
  min-width: 200px;
  border: 1px solid color-mix(in srgb, var(--dv-accent) 40%, transparent);
  border-radius: 8px;
  background: var(--dv-paper);
  color: var(--dv-paper-ink);
  padding: 10px 12px;
  font-size: 13px;
  font-family: inherit;
}
.dv-chat-input:focus { outline: none; border-color: var(--dv-accent); }
.dv-history-verdict { color: var(--dv-accent); font-weight: 600; }
.dv-history-input { color: color-mix(in srgb, var(--dv-accent) 70%, var(--dv-paper-ink)); font-size: 11px; }

/* ===== 事类（先问什么事，再选占法） ===== */
.dv-case {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid color-mix(in srgb, var(--dv-accent) 32%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--dv-accent) 7%, transparent);
  padding: 12px;
  margin-bottom: 4px;
}
.dv-case-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--dv-accent) 40%, transparent);
  border-radius: 6px;
  background: var(--dv-paper);
  color: var(--dv-paper-ink);
  padding: 9px 12px;
  font-size: 13px;
  font-family: inherit;
}
.dv-case-input:focus { outline: none; border-color: var(--dv-accent); }
.dv-case-picked { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dv-case-picked b { color: var(--dv-accent); }
.dv-case-picked span { color: var(--dv-paper-ink); font-size: 12px; }
.dv-case-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 168px; overflow-y: auto; }
.dv-case-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--dv-paper-ink);
  padding: 6px 10px;
  text-align: left;
  cursor: pointer;
}
.dv-case-item:hover { background: color-mix(in srgb, var(--dv-accent) 14%, transparent); }
.dv-case-item b { color: var(--dv-accent); white-space: nowrap; }
.dv-case-item span { font-size: 12px; }
.dv-case-guide { display: flex; flex-direction: column; gap: 4px; }
.dv-case-guide p { margin: 0; font-size: 13px; line-height: 1.7; color: var(--dv-paper-ink); }
.dv-case-src { color: color-mix(in srgb, var(--dv-accent) 80%, var(--dv-paper-ink)) !important; font-size: 11px !important; }
.dv-case-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.dv-case-chips button {
  border: 1px solid color-mix(in srgb, var(--dv-accent) 38%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--dv-accent);
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
}
.dv-case-chips button:hover { background: color-mix(in srgb, var(--dv-accent) 14%, transparent); }
.dv-h3 { margin: 4px 0 0; font-size: 15px; }
.dv-src { margin: 0; color: var(--dv-paper-muted); font-size: 12px; }
.dv-note { margin: 0; color: var(--dv-paper-muted); font-size: 13px; line-height: 1.7; }
.dv-error { margin: 0; color: var(--dv-error); font-size: 13px; }
.dv-hint { color: var(--dv-paper-muted); font-size: 12px; line-height: 1.6; }
.dv-plain { margin: 0; color: var(--dv-paper-ink); font-size: 13px; line-height: 1.8; }

/* 标签 */
.dv-tag {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--dv-line-soft);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  font-style: normal;
  color: var(--dv-paper-ink);
  background: var(--dv-paper);
  white-space: nowrap;
}
.dv-tag-p0 { border-color: color-mix(in srgb, var(--dv-accent) 55%, transparent); background: color-mix(in srgb, var(--dv-accent) 14%, var(--dv-paper)); }

/* 方法宫格 */
.dv-methods {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}
.dv-method {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--dv-line-soft);
  border-radius: 8px;
  background: var(--dv-paper);
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
}
.dv-method:hover { border-color: color-mix(in srgb, var(--dv-accent) 50%, transparent); }
.dv-method.is-active {
  border-color: color-mix(in srgb, var(--dv-accent) 65%, transparent);
  background: color-mix(in srgb, var(--dv-accent) 10%, var(--dv-paper));
}
.dv-method-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.dv-method-top b { font-size: 13px; }
.dv-method-hint { color: var(--dv-paper-muted); font-size: 11px; line-height: 1.5; }

/* 表单 */
.dv-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
.dv-form-col { display: flex; flex-direction: column; gap: 10px; }
.dv-field { display: flex; flex-direction: column; gap: 4px; }
.dv-field > span { color: var(--dv-paper-muted); font-size: 12px; }
.dv-field input,
.dv-field select {
  min-height: 34px;
  border: 1px solid var(--dv-line-soft);
  border-radius: 6px;
  background: #ffffff;
  color: var(--dv-paper-ink);
  padding: 6px 10px;
  font-size: 13px;
}
.dv-field input:focus,
.dv-field select:focus { outline: 2px solid color-mix(in srgb, var(--dv-accent) 55%, transparent); outline-offset: 1px; }
.dv-seed-field { max-width: 340px; }

/* 六爻铜钱 */
.dv-tosses { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.dv-toss {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  border: 1px solid var(--dv-line-soft);
  border-radius: 8px;
  background: var(--dv-paper);
  padding: 8px 4px;
  cursor: pointer;
}
.dv-toss small { color: var(--dv-paper-muted); font-size: 10px; }
.dv-toss b { font-size: 14px; font-family: var(--dv-serif); }
.dv-toss.is-set { border-color: color-mix(in srgb, var(--dv-accent) 60%, transparent); background: color-mix(in srgb, var(--dv-accent) 10%, var(--dv-paper)); }
.dv-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

/* 推演 I/O */
.dv-io { margin: 0; display: flex; flex-direction: column; gap: 8px; }
.dv-io > div { display: flex; gap: 10px; }
.dv-io dt {
  flex: 0 0 3.2em;
  color: var(--dv-paper-muted);
  font-size: 12px;
  padding-top: 2px;
}
.dv-io dd { margin: 0; font-size: 14px; line-height: 1.7; }

/* SVG 图 */
.dv-svg {
  width: 100%;
  height: auto;
  border: 1px solid var(--dv-line-soft);
  border-radius: 8px;
  background: #ffffff;
  color: var(--dv-paper-ink);
}

/* 原文对照 */
.dv-canon {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--dv-line-soft);
  border-radius: 8px;
  padding: 16px 18px;
  background: color-mix(in srgb, var(--dv-accent) 4%, var(--dv-paper));
}
.dv-canon-title { margin: 0; font-size: 14px; color: var(--dv-paper-muted); font-weight: 600; }
.dv-canon-text {
  margin: 0;
  font-family: var(--dv-serif);
  font-size: 20px;
  line-height: 1.9;
  letter-spacing: .05em;
}
.dv-annos { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.dv-anno { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: 12px; }
.dv-anno b { font-size: 13px; }
.dv-anno-py { color: var(--dv-paper-muted); }
.dv-anno-gloss { color: var(--dv-paper-ink); }
.dv-anno-note { color: var(--dv-paper-muted); }
.dv-interps { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
.dv-interp {
  border-left: 2px solid color-mix(in srgb, var(--dv-accent) 45%, transparent);
  padding-left: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dv-interp-head { margin: 0; display: flex; align-items: center; gap: 8px; }
.dv-interp-meta { color: var(--dv-paper-muted); font-size: 11px; }
.dv-interp-text { margin: 0; font-size: 13px; line-height: 1.7; }
.dv-interp-sub { margin: 0; color: var(--dv-paper-muted); font-size: 12px; line-height: 1.7; }
.dv-interp-sub b { color: var(--dv-paper-ink); margin-right: 6px; font-weight: 600; }

/* 复盘 */
.dv-verdict { display: flex; flex-direction: column; gap: 10px; }
.dv-verdict-label { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 16px; }
.dv-quote {
  margin: 0;
  border-left: 3px solid color-mix(in srgb, var(--dv-accent) 55%, transparent);
  padding: 8px 14px;
  background: color-mix(in srgb, var(--dv-accent) 6%, var(--dv-paper));
}
.dv-quote-text { margin: 0; font-family: var(--dv-serif); font-size: 18px; line-height: 1.9; letter-spacing: .04em; }
.dv-quote cite {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  color: var(--dv-paper-muted);
  font-size: 12px;
  font-style: normal;
}
.dv-disclaimer {
  margin: 0;
  border: 1px dashed var(--dv-line-soft);
  border-radius: 6px;
  padding: 10px 12px;
  color: var(--dv-paper-muted);
  font-size: 12px;
  line-height: 1.7;
}

/* 记录 */
.dv-save-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--dv-line-soft);
  border-radius: 8px;
  padding: 14px 16px;
}
.dv-save-line { margin: 0; display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.dv-save-line span { color: var(--dv-paper-muted); font-size: 12px; }
.dv-save-summary { margin: 0; font-size: 14px; line-height: 1.8; }
.dv-history { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.dv-history-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  border: 1px solid var(--dv-line-soft);
  border-radius: 6px;
  background: var(--dv-paper);
  padding: 8px 12px;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.dv-history-item:hover { border-color: color-mix(in srgb, var(--dv-accent) 50%, transparent); }
.dv-history-item.is-active { border-color: color-mix(in srgb, var(--dv-accent) 65%, transparent); }
.dv-history-method { color: var(--dv-accent); font-weight: 600; white-space: nowrap; }
.dv-history-time { color: var(--dv-paper-ink); font-variant-numeric: tabular-nums; }
.dv-history-seed, .dv-history-lesson { color: var(--dv-paper-muted); }
.dv-history-detail {
  border: 1px solid var(--dv-line-soft);
  border-top: 0;
  border-radius: 0 0 6px 6px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--dv-accent) 5%, var(--dv-paper));
}
.dv-history-detail p { margin: 0; font-size: 13px; line-height: 1.8; }

/* 按钮 / 动作区 */
.dv-actions { display: flex; justify-content: flex-end; gap: 10px; }
.dv-actions-split { justify-content: space-between; }
.dv-actions-row { justify-content: flex-start; }
.dv-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  border: 1px solid color-mix(in srgb, var(--dv-accent) 70%, transparent);
  border-radius: 6px;
  background: var(--dv-accent);
  color: #241a08;
  padding: 6px 18px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.dv-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--dv-accent) 88%, #ffffff); }
.dv-primary:disabled { opacity: .6; cursor: wait; }
.dv-btn-light {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  border: 1px solid var(--dv-line-soft);
  border-radius: 6px;
  background: #ffffff;
  color: var(--dv-paper-ink);
  padding: 6px 14px;
  font-size: 12px;
  cursor: pointer;
}
.dv-btn-light:hover { border-color: color-mix(in srgb, var(--dv-accent) 55%, transparent); }
.dv-btn-danger { color: var(--dv-error); border-color: color-mix(in srgb, var(--dv-error) 40%, transparent); }

@media (max-width: 560px) {
  .dv-head { gap: 10px; padding: 0 12px; }
  .dv-tosses { grid-template-columns: repeat(3, 1fr); }
  .dv-actions, .dv-actions-split { flex-direction: column; }
  .dv-actions button { width: 100%; }
}
</style>
