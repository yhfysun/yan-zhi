<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  CheckCircle2,
  Languages,
  Clock3,
  Download,
  LoaderCircle,
  Lightbulb,
  MessageCircle,
  Sparkles,
  Target,
  Volume2,
  X,
} from 'lucide-vue-next';
import { api, withMediaAuthQuery } from '../../api/client';
import { absoluteMediaSrc } from '../../composables/useMediaPreview';
import { phonicsAudioSrc } from '../../utils/phonics-audio';

type PathStepKind = 'phonics' | 'roots' | 'grammar' | 'fable' | 'story' | 'long-story' | 'speaking' | 'translate';
type QuickCheck = { question: string; options: string[]; answer: number; explanation: string };
type PathSound = { letter: string; ipa: string; word: string; gloss: string; mouth?: string };
type PathBlendGroup = { parts: Array<{ text: string; ipa: string }>; word: string };
type PathTranslateItem = { zh: string; en: string; note: string };
type PathStep = {
  id: string;
  kind: PathStepKind;
  title: string;
  goal: string;
  minutes: number;
  explanation: string;
  pattern?: string;
  patternAudio?: string;
  sounds?: PathSound[];
  /** 零基础层：不显示 IPA 符号，显示 mouth 口型提示（数据由服务端决定）。 */
  ipaHidden?: boolean;
  /** 结构化拼读演示数据（服务端提供，前端不再猜辅音音素）。 */
  blend?: PathBlendGroup[];
  /** 教学方法标签（服务端数据驱动）。 */
  method?: string;
  tip: string;
  examples: Array<{ en: string; zh: string }>;
  wordFamily?: Array<{ word: string; gloss: string; note?: string }>;
  /** 回译课内容：先自己翻，再对照参考译文与差异提示。 */
  translate?: PathTranslateItem[];
  /** 关联阅读 Tab 的范文 id（故事/寓言课「对照细读」入口）。 */
  readingPassageId?: string;
  task: string;
  quickCheck?: QuickCheck;
};
type PathStage = {
  id: string;
  title: string;
  subtitle: string;
  level: string;
  steps: PathStep[];
};
type TrackMeta = { id: string; name: string; audience: string; entryStepId: string };
type PhaseKey = 'concept' | 'examples' | 'practice' | 'check';
type Phase = { key: PhaseKey; label: string; hint: string };

const emit = defineEmits<{ practice: []; scenes: []; 'focus-change': [active: boolean]; read: [passageId: string] }>();
const TRACK_KEY = 'yz.learning.path.track.v1';
const COMPLETED_KEY = 'yz.learning.path.completed.v2';
const SAVED_KEY = 'yz.learning.path.saved.v2';
const PHASES: Phase[] = [
  { key: 'concept', label: '理解', hint: '先抓住本课规则' },
  { key: 'examples', label: '例句', hint: '在语境里看懂' },
  { key: 'practice', label: '练习', hint: '马上输出一次' },
  { key: 'check', label: '自测', hint: '确认真的会了' },
];

const stages = ref<PathStage[]>([]);
const stageIndex = ref(0);
const stepIndex = ref(0);
const phaseIndex = ref(0);
const track = ref('zero');
const trackMeta = ref<TrackMeta[]>([]);
const completedIds = ref<string[]>([]);
const savedIds = ref<string[]>([]);
const loading = ref(true);
const error = ref('');
const focusing = ref(false);
const checkChoice = ref<number | null>(null);
const checkSubmitted = ref(false);
const dialogRef = ref<HTMLElement | null>(null);
const speakingKey = ref('');
const ttsLoadingKey = ref('');
const voiceDialogOpen = ref(false);
const voiceInstalling = ref(false);
const voiceInstallProgress = ref(0);
const voiceInstallMessage = ref('');
const voiceInstallError = ref('');
const voiceRuntimeError = ref('');
const voicePackInstalled = ref<boolean | null>(null);
const VOICE_PACK_ID = 'vits-melo-tts-zh_en';
let pendingVoiceRequest: { text: string; key: string } | null = null;
let previousBodyOverflow = '';
let lastFocusTrigger: HTMLElement | null = null;
let speechSequence = 0;
let speechAudio: HTMLAudioElement | null = null;
const speechCache = new Map<string, string>();

const stage = computed(() => stages.value[stageIndex.value] || null);
const step = computed(() => stage.value?.steps[stepIndex.value] || null);
const phase = computed(() => PHASES[phaseIndex.value] || PHASES[0]);
const totalSteps = computed(() => stages.value.reduce((sum, item) => sum + item.steps.length, 0));
const completedCount = computed(() => completedIds.value.length);
const progress = computed(() => totalSteps.value ? Math.round((completedCount.value / totalSteps.value) * 100) : 0);
const currentStepCompleted = computed(() => !!step.value && completedIds.value.includes(step.value.id));
const currentStepSaved = computed(() => !!step.value && savedIds.value.includes(step.value.id));
const answerCorrect = computed(() => !!step.value?.quickCheck && checkChoice.value === step.value.quickCheck.answer);
const isLastPhase = computed(() => phaseIndex.value === PHASES.length - 1);
const currentGlobalIndex = computed(() =>
  stages.value.slice(0, stageIndex.value).reduce((sum, item) => sum + item.steps.length, 0) + stepIndex.value + 1,
);
const wordChips = computed(() => {
  if (step.value?.wordFamily?.length) return step.value.wordFamily.slice(0, 12).map((entry) => entry.word);
  const source = step.value?.examples[0]?.en || '';
  return [...new Set(source
    .split(/[·→/,，;；|]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 28 && /^[A-Za-z][A-Za-z'’ -]*$/.test(item)))].slice(0, 12);
});
const patternSpeech = computed(() => {
  const current = step.value;
  if (!current?.pattern) return '';
  return current.patternAudio?.trim()
    || current.sounds?.map((sound) => sound.word).join(', ')
    || current.examples[0]?.en.trim()
    || '';
});
const kindLabel: Record<PathStepKind, string> = {
  phonics: '自然拼读',
  roots: '词根词缀',
  grammar: '句型语法',
  fable: '寓言精读',
  story: '短篇故事',
  'long-story': '长篇连载',
  speaking: '口语输出',
  translate: '回译',
};
const practicePlan = computed(() => {
  switch (step.value?.kind) {
    case 'phonics':
      return [
        '先点击例词，听清目标音，再跟读一遍。',
        '遮住音标，看字母组合说出对应声音。',
        '把声音放回完整单词，连续拼读三次。',
      ];
    case 'roots':
      return [
        '先拆出前缀、词根和后缀，再猜整词意思。',
        '从同根词族里挑三个词，各造一个短句。',
        '遮住中文释义，用自己的话解释词根。',
      ];
    case 'grammar':
      return [
        '先判断时间、主语和动作关系。',
        '对照正确例句，说出一个错误句为什么错。',
        '不看原文，自己造两句符合规则的句子。',
      ];
    case 'fable':
    case 'story':
    case 'long-story':
      return [
        '每读完一段，用一句英文概括发生了什么。',
        '找出人物、问题、转折和结果。',
        '合上原文，用三到四句英文复述。',
      ];
    case 'speaking':
      return [
        '先照结构读一遍，确认重音和停顿。',
        '替换真实信息，连续说三十秒。',
        '听一遍自己的表达，再修正一处。',
      ];
    case 'translate':
      return [
        '遮住参考译文，把每句中文先翻成英语。',
        '逐句点「对照」，标出和你译文不一样的地方。',
        '只改错处抄一遍，再开口读一遍正确版本。',
      ];
    default:
      return [
        '先确认本课目标。',
        '完成一次主动输出。',
        '回看并修正一个具体问题。',
      ];
  }
});
const finishRule = computed(() => {
  switch (step.value?.kind) {
    case 'phonics':
      return '能不靠音标，把例词里的目标音读准。';
    case 'roots':
      return '能拆出一个新词，并用自己的话解释词根。';
    case 'grammar':
      return '能在不看例句的情况下，自己造一句正确句子。';
    case 'fable':
    case 'story':
    case 'long-story':
      return '能用三句话复述人物、冲突和结果。';
    case 'speaking':
      return '能不看提示，把目标表达连续说出三十秒。';
    case 'translate':
      return '5 句里至少 3 句的关键差异（时态/语序/搭配）能自己找出来。';
    default:
      return '能用自己的例子完成一次主动输出。';
  }
});
const practiceActionLabel = computed(() => {
  switch (step.value?.kind) {
    case 'phonics': return '去跟读巩固';
    case 'roots': return '去造句练习';
    case 'grammar': return '去句型练习';
    case 'fable':
    case 'story':
    case 'long-story':
      return '去复述练习';
    case 'speaking': return '开始自由表达';
    default: return '去自由表达';
  }
});

function unwrap<T>(response: unknown): T | null {
  if (response && typeof response === 'object' && 'data' in response) return (response as { data: T }).data;
  return null;
}

function responseError(response: unknown): string {
  if (!response || typeof response !== 'object' || !('error' in response)) return '';
  const message = (response as { error?: unknown }).error;
  return typeof message === 'string' ? message : '';
}

async function englishVoicePackStatus(): Promise<{
  installed: boolean | null;
  engineAvailable: boolean | null;
}> {
  if (voicePackInstalled.value === true) {
    return { installed: true, engineAvailable: null };
  }
  try {
    const response = await api.get<{
      items?: Array<{ id?: string; installed?: boolean }>;
      engine?: { available?: boolean };
    }>('/tts-packs');
    if (responseError(response)) return { installed: null, engineAvailable: null };
    const payload = unwrap<{
      items?: Array<{ id?: string; installed?: boolean }>;
      engine?: { available?: boolean };
    }>(response);
    if (!payload) return { installed: null, engineAvailable: null };
    const pack = payload.items?.find((item) => item.id === VOICE_PACK_ID);
    const installed = !!pack?.installed;
    voicePackInstalled.value = installed;
    return { installed, engineAvailable: payload.engine?.available ?? null };
  } catch {
    return { installed: null, engineAvailable: null };
  }
}

/** 学习位置按轨道分开存（同一课的完成/收藏进度跨轨道共享）。 */
const positionKey = computed(() => `yz.learning.path.position.v2.${track.value}`);

function restoreLocalState() {
  try {
    const savedCompleted = JSON.parse(localStorage.getItem(COMPLETED_KEY) || '[]') as unknown;
    if (Array.isArray(savedCompleted)) completedIds.value = savedCompleted.filter((id): id is string => typeof id === 'string');
    const savedLessons = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]') as unknown;
    if (Array.isArray(savedLessons)) savedIds.value = savedLessons.filter((id): id is string => typeof id === 'string');
    const savedPosition = JSON.parse(localStorage.getItem(positionKey.value) || 'null') as { stage?: string; step?: string } | null;
    if (!savedPosition) return;
    const stageAt = stages.value.findIndex((item) => item.id === savedPosition.stage);
    if (stageAt < 0) return;
    const stepAt = stages.value[stageAt].steps.findIndex((item) => item.id === savedPosition.step);
    stageIndex.value = stageAt;
    stepIndex.value = Math.max(0, stepAt);
  } catch {
    completedIds.value = [];
  }
}

function persistLocalState() {
  try {
    localStorage.setItem(positionKey.value, JSON.stringify({ stage: stage.value?.id || '', step: step.value?.id || '' }));
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(completedIds.value));
    localStorage.setItem(SAVED_KEY, JSON.stringify(savedIds.value));
  } catch {
    // Restricted browser contexts can still use the course without persistence.
  }
}

function restoreTrack() {
  try {
    const saved = localStorage.getItem(TRACK_KEY) || 'zero';
    if (trackMeta.value.some((item) => item.id === saved)) track.value = saved;
  } catch {
    // 无 localStorage 时保持默认轨道
  }
}

async function loadTracks() {
  try {
    const response = await api.get<{ data: TrackMeta[] }>('/learning/path/tracks');
    const list = unwrap<TrackMeta[]>(response);
    // 只收结构完整的轨道元信息，畸形/误命中数据一律丢弃（保持默认轨道）
    if (Array.isArray(list)) trackMeta.value = list.filter((item) => item
      && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.audience === 'string');
  } catch {
    // 轨道元信息加载失败：不渲染切换器，走默认轨道
  }
}

async function loadPath() {
  loading.value = true;
  error.value = '';
  try {
    const response = await api.get<{ data: PathStage[] }>(`/learning/path?track=${encodeURIComponent(track.value)}`);
    stages.value = unwrap<PathStage[]>(response) || [];
    if (!stages.value.length) error.value = '学习路线暂时为空';
    restoreLocalState();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '学习路线加载失败';
  } finally {
    loading.value = false;
  }
}

function selectStage(index: number) {
  stageIndex.value = Math.max(0, Math.min(stages.value.length - 1, index));
  stepIndex.value = 0;
}

function resetLessonState() {
  clearSpeechState();
  phaseIndex.value = 0;
  checkChoice.value = null;
  checkSubmitted.value = false;
  // 逐音学习与拼读演示复位（换课/换步骤都从头带学）
  soundIdx.value = 0;
  blendingStage.value = false;
  blendingActive.value = '';
  blendingSeq += 1;
  blendingBusy.value = false;
  // 回译课：换课即收起全部参考译文，重新自己翻
  translateRevealed.value = [];
}

// ── 回译课：先自己翻，再逐句对照参考译文与差异提示 ──
const translateRevealed = ref<boolean[]>([]);

function toggleTranslate(index: number) {
  const next = [...translateRevealed.value];
  next[index] = !next[index];
  translateRevealed.value = next;
}

const allTranslateRevealed = computed(() => {
  const items = step.value?.translate;
  if (!items?.length) return false;
  return items.every((_, index) => !!translateRevealed.value[index]);
});

function revealAllTranslate() {
  const items = step.value?.translate ?? [];
  const revealTo = !allTranslateRevealed.value;
  translateRevealed.value = items.map(() => revealTo);
}

function selectPhase(index: number) {
  const next = Math.max(0, Math.min(PHASES.length - 1, index));
  if (next === phaseIndex.value) return;
  clearSpeechState();
  phaseIndex.value = next;
}

function openFocus(index = stepIndex.value) {
  if (!stage.value) return;
  lastFocusTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  stepIndex.value = Math.max(0, Math.min(stage.value.steps.length - 1, index));
  resetLessonState();
  focusing.value = true;
  emit('focus-change', true);
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  void nextTick(() => dialogRef.value?.focus());
}

function closeFocus() {
  if (!focusing.value) return;
  focusing.value = false;
  emit('focus-change', false);
  document.body.style.overflow = previousBodyOverflow;
  void nextTick(() => {
    if (lastFocusTrigger?.isConnected) lastFocusTrigger.focus();
    lastFocusTrigger = null;
  });
}

function movePhase(delta: number) {
  const next = phaseIndex.value + delta;
  if (next >= 0 && next < PHASES.length) {
    selectPhase(next);
    return;
  }
  if (delta < 0) return;
  markCurrentComplete();
}

function markCurrentComplete() {
  if (!step.value) return;
  if (!completedIds.value.includes(step.value.id)) {
    completedIds.value = [...completedIds.value, step.value.id];
    persistLocalState();
  }
  closeFocus();
}

function chooseAnswer(index: number) {
  if (checkSubmitted.value) return;
  checkChoice.value = index;
}

function submitCheck() {
  if (!step.value?.quickCheck || checkChoice.value == null) return;
  checkSubmitted.value = true;
}

function retryCheck() {
  checkChoice.value = null;
  checkSubmitted.value = false;
}

function toggleSaved() {
  if (!step.value) return;
  savedIds.value = currentStepSaved.value
    ? savedIds.value.filter((id) => id !== step.value?.id)
    : [...savedIds.value, step.value.id];
  persistLocalState();
}

function stopActiveSpeech() {
  try { window.speechSynthesis?.cancel(); } catch { /* 无浏览器语音时忽略 */ }
  try { speechAudio?.pause(); } catch { /* 音频尚未初始化时忽略 */ }
  speechAudio = null;
}

/**
 * 点音标放**本音**（随包 phonics-audio 真实音标音频）。
 * 零基础教学的硬要求：/æ/ /ɛ/ 这类符号系统 TTS 念不了，必须放真实音标音频。
 * 查不到音频（如上游缺 s/z）或播放失败 → 回退例词朗读，绝不出错横幅。
 */
async function speakIpa(sound: PathSound) {
  const src = phonicsAudioSrc(sound.ipa);
  if (!src) { void speak(sound.word, ''); return; }
  const sequence = ++speechSequence;
  stopActiveSpeech();
  speakingKey.value = '';
  ttsLoadingKey.value = '';
  try {
    await playLocalAudio(src, sequence);
  } catch {
    if (sequence === speechSequence) void speak(sound.word, '');
  }
}

/** 播放随包本地音频（绝对地址），ended/error 时 resolve/reject。 */
function playLocalAudio(src: string, sequence: number): Promise<void> {
  return new Promise((resolve, reject) => {
    stopActiveSpeech();
    // phonicsAudioSrc 已按 document.baseURI 补成绝对地址；这里只追加媒体鉴权 query
    const audio = new Audio(withMediaAuthQuery(src));
    speechAudio = audio;
    const done = (err?: Error) => {
      if (speechAudio === audio) speechAudio = null;
      if (err) reject(err); else resolve();
    };
    audio.addEventListener('ended', () => done());
    audio.addEventListener('error', () => done(new Error('audio error')));
    void audio.play().catch((e: unknown) => done(e instanceof Error ? e : new Error(String(e))));
  });
}

// ── 逐音学习（零基础：一次只教一个音标，学会再下一个）──
const soundIdx = ref(0);
const blendingStage = ref(false);
const hasSounds = computed(() => !!step.value?.sounds?.length);
const currentSound = computed(() => step.value?.sounds?.[soundIdx.value] || null);
/** 零基础层（ipaHidden）用口型提示替代 IPA 符号展示；音频仍按 ipa 播放。 */
const currentSoundMouth = computed(() => (step.value?.ipaHidden ? currentSound.value?.mouth || '' : ''));
const isLastSound = computed(() => soundIdx.value >= (step.value?.sounds?.length ?? 0) - 1);

function soundCardTitle(): string {
  const sound = currentSound.value;
  if (!sound) return '';
  return currentSoundMouth.value ? '再听一遍本音' : `再听一遍本音 ${sound.ipa}`;
}

function partTitle(part: { text: string; ipa: string | null }): string {
  if (step.value?.ipaHidden) return `再听一遍 ${part.text} 的本音`;
  return part.ipa ? `播放 ${part.ipa}` : `播放 ${part.text}`;
}

function autoPlayCurrentIpa() {
  const sound = currentSound.value;
  if (!sound) return;
  if (phonicsAudioSrc(sound.ipa)) void speakIpa(sound);
  else void speak(sound.word, `sound:${sound.letter}`);
}

function nextSound() {
  if (isLastSound.value) { blendingStage.value = true; return; }
  soundIdx.value += 1;
  autoPlayCurrentIpa();
}

function prevSound() {
  if (blendingStage.value) { blendingStage.value = false; return; }
  if (soundIdx.value > 0) { soundIdx.value -= 1; autoPlayCurrentIpa(); }
}

// ── 拼读演示（blending）：音素逐个放本音，再连成整词 ──
type BlendGroup = { parts: Array<{ text: string; ipa: string | null }>; word: string };

const blendGroups = computed<BlendGroup[]>(() => {
  // 服务端结构化数据优先（拼读课）；前端不做"按辅音字母猜音"的教学推断
  const structured = step.value?.blend;
  if (structured?.length) {
    return structured.map((group) => ({
      parts: group.parts.map((part) => ({ text: part.text, ipa: part.ipa })),
      word: group.word,
    }));
  }
  // 对比课形态（服务端 pattern 就是这么写的）：`a /æ/ → cat · e /ɛ/ → bed`
  const pattern = step.value?.pattern || '';
  return pattern.split('·').map((group) => {
    const segs = group.split('→').map((s) => s.trim()).filter(Boolean);
    if (!segs.length) return null;
    const left = segs[0];
    const lastSeg = segs.length > 1 ? segs[segs.length - 1] : left;
    const word = (lastSeg.match(/[A-Za-z][A-Za-z'-]*/) || [''])[0];
    let parts: Array<{ text: string; ipa: string | null }> = [];
    const m = /^(\S+)\s*\/(.+)\/$/.exec(left);
    if (m) parts = [{ text: m[1], ipa: `/${m[2]}/` }];
    else if (/^[A-Za-z][A-Za-z'-]*$/.test(left)) parts = [{ text: left, ipa: null }];
    if (!parts.length && !word) return null;
    return { parts, word };
  }).filter((g): g is BlendGroup => !!g);
});

const blendingActive = ref('');
const blendingBusy = ref(false);
let blendingSeq = 0;
const blendWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function speakPart(part: { text: string; ipa: string | null }, fallbackWord = '') {
  const src = part.ipa ? phonicsAudioSrc(part.ipa) : null;
  if (src) void playLocalAudio(src, ++speechSequence).catch(() => {});
  // 本音音频缺失（如上游 s/z 缺文件）时读整组例词，避免把字母读成字母名
  else void speak(fallbackWord || part.text, '');
}

/** 拼读演示专用：读一个词并**等它读完**（TTS 音频 ended；无 TTS 回退系统语音 onend），保证一组一组不重叠。 */
function speakWordAwait(text: string): Promise<void> {
  return new Promise((resolve) => {
    void (async () => {
      const sequence = ++speechSequence;
      stopActiveSpeech();
      speakingKey.value = 'pattern';
      try {
        let url = speechCache.get(text) || '';
        if (!url) {
          const response = await api.post<{ data?: { url?: string } }>('/learning/tts', {
            text,
            language: 'en-US',
            rate: -2,
          });
          if (sequence !== speechSequence) return resolve();
          const error = responseError(response);
          if (error) throw new Error(error);
          url = unwrap<{ url?: string }>(response)?.url || '';
          if (!url) throw new Error('英语语音未返回音频地址');
          speechCache.set(text, url);
        }
        const audio = new Audio(withMediaAuthQuery(absoluteMediaSrc(url)));
        speechAudio = audio;
        const done = () => {
          if (speechAudio === audio) speechAudio = null;
          resolve();
        };
        audio.addEventListener('ended', done);
        audio.addEventListener('error', done);
        await audio.play();
      } catch {
        // 无后端 TTS：系统英语语音兜底（onend 续跑），不弹错误横幅（演示场景）
        let settled = false;
        const done = () => { if (!settled) { settled = true; speakingKey.value = ''; resolve(); } };
        if (!speakWithEnglishBrowserVoice(text, 'pattern', sequence, done)) { speakingKey.value = ''; resolve(); }
        setTimeout(done, 4000);
      }
    })();
  });
}

/** 跟着演示拼一遍：逐个音素放本音，最后连成整词。 */
async function playBlending() {
  if (blendingBusy.value) return;
  const seq = ++blendingSeq;
  blendingBusy.value = true;
  speakingKey.value = 'pattern';
  try {
    stopActiveSpeech();
    for (const group of blendGroups.value) {
      if (seq !== blendingSeq) return;
      for (let i = 0; i < group.parts.length; i++) {
        if (seq !== blendingSeq) return;
        const part = group.parts[i];
        blendingActive.value = `run${seq}:${i}`;
        const src = part.ipa ? phonicsAudioSrc(part.ipa) : null;
        if (src) {
          try { await playLocalAudio(src, seq); } catch { await blendWait(200); }
        } else {
          await blendWait(320);
        }
        await blendWait(120);
      }
      if (seq !== blendingSeq) return;
      if (group.word && /^[A-Za-z][A-Za-z'-]*$/.test(group.word)) {
        blendingActive.value = 'word';
        await speakWordAwait(group.word);
      }
    }
  } finally {
    if (seq === blendingSeq) {
      blendingBusy.value = false;
      blendingActive.value = '';
      speakingKey.value = '';
    }
  }
}

function clearSpeechState() {
  speechSequence += 1;
  stopActiveSpeech();
  speakingKey.value = '';
  ttsLoadingKey.value = '';
  voiceRuntimeError.value = '';
  if (!voiceInstalling.value) {
    voiceDialogOpen.value = false;
    pendingVoiceRequest = null;
    voiceInstallError.value = '';
  }
}

function englishBrowserVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return voices.find((voice) => /^en[-_]/i.test(voice.lang))
    || voices.find((voice) => String(voice.name).toLowerCase().includes('english'))
    || null;
}

function speakWithEnglishBrowserVoice(text: string, activeKey: string, sequence: number, onDone?: () => void): boolean {
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return false;
  const voice = englishBrowserVoice();
  if (!voice) return false;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice.lang || 'en-US';
    utterance.voice = voice;
    utterance.rate = 0.86;
    speakingKey.value = activeKey;
    ttsLoadingKey.value = '';
    const finish = () => {
      if (sequence === speechSequence) speakingKey.value = '';
      onDone?.();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

function requestVoicePack(text: string, key: string) {
  pendingVoiceRequest = { text, key };
  voiceRuntimeError.value = '';
  voiceDialogOpen.value = true;
  voiceInstallError.value = '';
  voiceInstallProgress.value = 0;
  voiceInstallMessage.value = '当前电脑没有可用的英文语音。';
  void nextTick(() => document.querySelector<HTMLButtonElement>('.lp-voice-dialog-primary')?.focus());
}

function showVoiceRuntimeError(text: string, key: string, message: string) {
  pendingVoiceRequest = { text, key };
  voiceDialogOpen.value = false;
  voiceRuntimeError.value = message || '英语朗读暂时不可用，请稍后重试。';
}

function dismissVoiceRuntimeError() {
  voiceRuntimeError.value = '';
}

function retryPendingSpeech() {
  const pending = pendingVoiceRequest;
  voiceRuntimeError.value = '';
  if (pending) void speak(pending.text, pending.key);
}

async function handleSpeechUnavailable(text: string, key: string, message: string, sequence: number) {
  const status = await englishVoicePackStatus();
  if (sequence !== speechSequence) return;
  if (status.installed === false) {
    requestVoicePack(text, key);
    return;
  }
  const detail = status.engineAvailable === false
    ? '英语语音包已安装，但语音引擎尚未就绪。请到设置 → 语音包 安装推理引擎后重试。'
    : message;
  showVoiceRuntimeError(text, key, detail);
}

function closeVoiceDialog() {
  if (voiceInstalling.value) return;
  voiceDialogOpen.value = false;
  pendingVoiceRequest = null;
  voiceInstallError.value = '';
}

async function installVoicePackAndRetry() {
  if (voiceInstalling.value || !pendingVoiceRequest) return;
  voiceInstalling.value = true;
  voiceInstallError.value = '';
  voiceInstallProgress.value = 0;
  voiceInstallMessage.value = '正在准备英语语音包…';
  const installTask = api.post<{ ok?: boolean; message?: string }>(`/tts-packs/${VOICE_PACK_ID}/install`)
    .then((value) => {
      const error = responseError(value);
      return error
        ? { ok: false as const, error }
        : { ok: true as const, value };
    })
    .catch((error: unknown) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    }));
  try {
    let sawDownloading = false;
    for (;;) {
      let progressState: {
        state?: 'downloading' | 'done' | 'error';
        progress?: number;
        message?: string;
      } | null = null;
      try {
        const progressResponse = await api.get<{ data?: {
          state?: 'downloading' | 'done' | 'error';
          progress?: number;
          message?: string;
        } }>(`/tts-packs/${VOICE_PACK_ID}/progress`);
        progressState = unwrap<{
          state?: 'downloading' | 'done' | 'error';
          progress?: number;
          message?: string;
        }>(progressResponse);
        if (progressState) {
          voiceInstallProgress.value = Math.max(0, Math.min(100, Number(progressState.progress) || 0));
          if (progressState.message) voiceInstallMessage.value = progressState.message;
          if (progressState.state === 'downloading') sawDownloading = true;
        }
      } catch { /* 首次进度可能尚未写入，继续等安装请求 */ }
      if (progressState?.state === 'done') break;
      if (progressState?.state === 'error' && sawDownloading) {
        throw new Error(progressState.message || '英语语音包下载失败');
      }
      const outcome = await Promise.race([
        installTask,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
      ]);
      if (!outcome) continue;
      if (!outcome.ok) throw new Error(outcome.error || '英语语音包下载失败');
      break;
    }
    voicePackInstalled.value = true;
    voiceInstallProgress.value = 100;
    voiceInstallMessage.value = '英语语音包已安装，正在重试朗读…';
    const pending = pendingVoiceRequest;
    voiceDialogOpen.value = false;
    pendingVoiceRequest = null;
    if (pending) await speak(pending.text, pending.key);
  } catch (error) {
    voiceInstallError.value = error instanceof Error ? error.message : String(error);
  } finally {
    voiceInstalling.value = false;
  }
}

async function speak(text: string, activeKey = '') {
  const spokenText = text.trim();
  if (!spokenText) return;
  const sequence = ++speechSequence;
  stopActiveSpeech();
  voiceRuntimeError.value = '';
  speakingKey.value = activeKey;
  ttsLoadingKey.value = activeKey;
  try {
    let url = speechCache.get(spokenText) || '';
    if (!url) {
      const response = await api.post<{ data?: { url?: string } }>('/learning/tts', {
        text: spokenText,
        language: 'en-US',
        rate: -2,
      });
      if (sequence !== speechSequence) return;
      const error = responseError(response);
      if (error) throw new Error(error);
      url = unwrap<{ url?: string }>(response)?.url || '';
      if (!url) throw new Error('英语语音未返回音频地址');
      speechCache.set(spokenText, url);
    }
    if (sequence !== speechSequence) return;
    // ★ 服务端返回的是站点根相对地址（/api/generated/...）：打包版页面是 file://，
    //   直接 new Audio(相对地址) 会解析成 file:///api/... → 媒体加载必挂
    //   （2026-11-13 实报「Failed to load because no supported source was found」）。
    //   与全仓媒体一致走 absoluteMediaSrc 补全 + withMediaAuthQuery 鉴权。
    const audio = new Audio(withMediaAuthQuery(absoluteMediaSrc(url)));
    speechAudio = audio;
    ttsLoadingKey.value = '';
    const finish = () => {
      if (sequence !== speechSequence) return;
      speakingKey.value = '';
      if (speechAudio === audio) speechAudio = null;
    };
    audio.addEventListener('ended', finish);
    audio.addEventListener('error', () => {
      finish();
      if (sequence !== speechSequence) return;
      if (!speakWithEnglishBrowserVoice(spokenText, activeKey, sequence)) {
        void handleSpeechUnavailable(spokenText, activeKey, '音频播放失败，请重试。', sequence);
      }
    });
    await audio.play();
  } catch (error) {
    if (sequence !== speechSequence) return;
    if (!speakWithEnglishBrowserVoice(spokenText, activeKey, sequence)) {
      speakingKey.value = '';
      ttsLoadingKey.value = '';
      await handleSpeechUnavailable(
        spokenText,
        activeKey,
        error instanceof Error ? error.message : String(error),
        sequence,
      );
    }
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (!focusing.value) return;
  if (voiceDialogOpen.value) {
    if (event.key === 'Escape') closeVoiceDialog();
    return;
  }
  if (event.key === 'Escape') {
    closeFocus();
    return;
  }
  const target = event.target instanceof HTMLElement ? event.target : null;
  const isTyping = !!target?.closest('input, textarea, select, [contenteditable="true"]');
  if (!isTyping && event.key === 'ArrowRight') {
    event.preventDefault();
    movePhase(1);
    return;
  }
  if (!isTyping && event.key === 'ArrowLeft') {
    event.preventDefault();
    movePhase(-1);
    return;
  }
  if (event.key !== 'Tab' || !dialogRef.value) return;
  const focusable = [...dialogRef.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.value)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch([stageIndex, stepIndex], () => {
  resetLessonState();
  persistLocalState();
});

watch(track, () => {
  try { localStorage.setItem(TRACK_KEY, track.value); } catch { /* 无持久化环境忽略 */ }
  resetLessonState();
  stageIndex.value = 0;
  stepIndex.value = 0;
  void loadPath();
});

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);
  await loadTracks();
  restoreTrack();
  await loadPath();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  blendingSeq += 1;
  clearSpeechState();
  if (focusing.value) emit('focus-change', false);
  document.body.style.overflow = previousBodyOverflow;
});
</script>

<template>
  <section class="lp-path">
    <header class="lp-path-head">
      <div>
        <span class="lp-path-kicker"><Sparkles :size="13" /> 英语学习主线</span>
        <h2>从会读，到读懂，再到真正说出来</h2>
        <p>自然拼读、词根记忆、结构语法、寓言、短篇与长篇故事，一课只走一个完整学习循环。</p>
      </div>
      <div class="lp-path-actions">
        <button type="button" class="lp-path-action" @click="emit('scenes')"><BookOpen :size="14" /> 场景练习</button>
        <button type="button" class="lp-path-action primary" @click="emit('practice')"><MessageCircle :size="14" /> 自由开口</button>
      </div>
    </header>

    <div class="lp-path-progress">
      <span>总进度</span>
      <div><i :style="{ width: progress + '%' }"></i></div>
      <b>{{ completedCount }} / {{ totalSteps }} 课</b>
    </div>

    <nav v-if="trackMeta.length > 1" class="lp-path-tracks" aria-label="选择学习人群">
      <button
        v-for="item in trackMeta"
        :key="item.id"
        type="button"
        :class="{ active: item.id === track }"
        :aria-pressed="item.id === track"
        :title="item.audience"
        @click="track = item.id"
      >{{ item.name }}</button>
    </nav>

    <nav class="lp-path-stages" aria-label="英语学习阶段">
      <button
        v-for="(item, index) in stages"
        :key="item.id"
        type="button"
        :class="{ active: index === stageIndex, done: item.steps.every((lesson) => completedIds.includes(lesson.id)) }"
        @click="selectStage(index)"
      >
        <span>{{ String(index + 1).padStart(2, '0') }}</span>
        <b>{{ item.title }}</b>
        <small>{{ item.level }} · {{ item.steps.length }} 课</small>
      </button>
    </nav>

    <p v-if="loading" class="lp-path-hint">正在准备学习路线…</p>
    <p v-else-if="error" class="lp-path-hint error">{{ error }}</p>

    <template v-else-if="stage">
      <div class="lp-path-stage-head">
        <div>
          <span>{{ stage.level }}</span>
          <h3>{{ stage.title }}</h3>
          <p>{{ stage.subtitle }}</p>
        </div>
        <span class="lp-path-stage-progress">
          {{ stage.steps.filter((lesson) => completedIds.includes(lesson.id)).length }} / {{ stage.steps.length }} 已完成
        </span>
      </div>

      <div class="lp-path-step-list">
        <button
          v-for="(item, index) in stage.steps"
          :key="item.id"
          type="button"
          :class="{ complete: completedIds.includes(item.id) }"
          @click="openFocus(index)"
        >
          <span class="lp-path-step-number">
            <CheckCircle2 v-if="completedIds.includes(item.id)" :size="15" />
            <template v-else>{{ String(index + 1).padStart(2, '0') }}</template>
          </span>
          <div>
            <span class="lp-path-kind" :class="`kind-${item.kind}`">{{ kindLabel[item.kind] }}</span>
            <b>{{ item.title }}</b>
            <p>{{ item.goal }}</p>
          </div>
          <small>{{ item.minutes }} 分钟</small>
          <ArrowRight :size="15" />
        </button>
      </div>
    </template>

    <p class="lp-path-method">
      每个知识点按“理解 → 例句 → 练习 → 自测”展开；故事课程使用原创改写和公版寓言，不复制付费课程原文。
    </p>

    <section
      v-if="focusing && stage && step"
      ref="dialogRef"
      class="lp-path-immersive"
      role="dialog"
      aria-modal="true"
      :aria-label="`${stage.title} · ${step.title}`"
      tabindex="-1"
    >
      <header class="lp-path-immersive-head">
        <button type="button" class="lp-path-back" @click="closeFocus"><ArrowLeft :size="15" /><span>返回路线</span></button>
        <div class="lp-path-crumb">
          <span>{{ kindLabel[step.kind] }}</span>
          <i>/</i>
          <b>{{ step.title }}</b>
        </div>
        <div class="lp-path-head-meta">
          <div class="lp-path-head-progress" :aria-label="`课程总进度 ${progress}%`">
            <span><i :style="{ width: progress + '%' }"></i></span>
            <small>{{ currentGlobalIndex }} / {{ totalSteps }}</small>
          </div>
          <button
            type="button"
            class="lp-path-save"
            :class="{ active: currentStepSaved }"
            :aria-label="currentStepSaved ? '取消收藏本课' : '收藏本课'"
            :aria-pressed="currentStepSaved"
            @click="toggleSaved"
          >
            <BookmarkCheck v-if="currentStepSaved" :size="15" />
            <Bookmark v-else :size="15" />
          </button>
          <button type="button" aria-label="关闭当前课程" @click="closeFocus"><X :size="15" /></button>
        </div>
      </header>

      <div class="lp-path-immersive-layout">
        <nav class="lp-path-immersive-rail" aria-label="本课学习步骤">
          <div class="lp-path-rail-course">
            <span>{{ stage.title }} · {{ kindLabel[step.kind] }}</span>
            <b>{{ step.title }}</b>
            <small>{{ currentStepCompleted ? '本课已完成，可随时复习' : `第 ${currentGlobalIndex} 课 · 约 ${step.minutes} 分钟` }}</small>
          </div>
          <button
            v-for="(item, index) in PHASES"
            :key="item.key"
            type="button"
            :class="{ active: index === phaseIndex, done: index < phaseIndex }"
            :aria-current="index === phaseIndex ? 'step' : undefined"
            @click="selectPhase(index)"
          >
            <i>{{ index < phaseIndex ? '✓' : String(index + 1).padStart(2, '0') }}</i>
            <div><b>{{ item.label }}</b><small>{{ item.hint }}</small></div>
          </button>
          <div class="lp-path-rail-status">
            <span><i :style="{ width: progress + '%' }"></i></span>
            <small>{{ currentStepSaved ? '已收藏' : '进度自动保存' }}</small>
          </div>
        </nav>

        <main class="lp-path-immersive-main">
          <article class="lp-path-paper">
            <header class="lp-path-paper-head">
              <div class="lp-path-paper-title">
                <div>
                  <p>{{ kindLabel[step.kind] }}<template v-if="step.method"> · {{ step.method }}</template> · {{ phase.label }}</p>
                  <h1>{{ step.title }}</h1>
                </div>
                <span v-if="currentStepCompleted" class="lp-path-complete-badge"><CheckCircle2 :size="13" /> 已完成</span>
              </div>
              <span class="lp-path-paper-meta">
                <span class="lp-path-time"><Clock3 :size="13" /> {{ step.minutes }} 分钟</span>
                <i></i>
                <span class="lp-path-goal">{{ step.goal }}</span>
              </span>
            </header>

            <div class="lp-path-paper-body" aria-live="polite">
              <div v-if="voiceRuntimeError" class="lp-voice-runtime-error" role="alert">
                <Volume2 :size="16" />
                <p>{{ voiceRuntimeError }}</p>
                <button type="button" @click="retryPendingSpeech">重试</button>
                <button type="button" aria-label="关闭朗读错误提示" @click="dismissVoiceRuntimeError"><X :size="14" /></button>
              </div>
              <section v-if="phase.key === 'concept'" class="lp-path-lesson-stage">
                <div class="lp-path-lead">
                  <span>本课目标</span>
                  <p>{{ step.goal }}</p>
                </div>
                <!-- 逐音学习：一次只教一个音标（零基础），学会再下一个 -->
                <div v-if="hasSounds && !blendingStage" class="lp-sound-card" aria-live="polite">
                  <div class="lp-sound-main">
                    <button
                      type="button"
                      class="lp-sound-ipa"
                      :class="{ 'lp-sound-mouth': !!currentSoundMouth }"
                      :title="soundCardTitle()"
                      :aria-label="`播放本音 ${currentSound?.word || ''}`"
                      @click="currentSound && speakIpa(currentSound)"
                    >{{ currentSoundMouth || currentSound?.ipa }}</button>
                    <div class="lp-sound-side">
                      <b>{{ currentSound?.letter }}</b>
                      <button
                        type="button"
                        class="lp-sound-word"
                        :class="{ playing: speakingKey === `sound:${currentSound?.letter}` }"
                        :aria-busy="ttsLoadingKey === `sound:${currentSound?.letter}`"
                        :aria-label="`播放例词 ${currentSound?.word || ''}`"
                        @click="currentSound && speak(currentSound.word, `sound:${currentSound?.letter}`)"
                      >
                        <LoaderCircle v-if="ttsLoadingKey === `sound:${currentSound?.letter}`" class="lp-path-spin" :size="14" />
                        <Volume2 v-else :size="14" />
                        <span>{{ currentSound?.word }}</span>
                        <small>{{ currentSound?.gloss }}</small>
                      </button>
                    </div>
                  </div>
                  <div class="lp-sound-nav">
                    <button type="button" :disabled="soundIdx === 0" @click="prevSound">← 上一个</button>
                    <small>第 {{ soundIdx + 1 }} / {{ step.sounds?.length ?? 0 }} 个音 · 点大卡片反复听本音</small>
                    <button type="button" class="lp-sound-next" @click="nextSound">
                      {{ isLastSound ? '学拼读 →' : '学会了，下一个 →' }}
                    </button>
                  </div>
                </div>

                <!-- 拼读演示：音素逐个放本音，再连成整词 -->
                <div v-else-if="blendGroups.length" class="lp-path-pattern lp-path-pattern-blend">
                  <span>核心结构</span>
                  <div class="lp-blending">
                    <template v-for="(group, gi) in blendGroups" :key="gi">
                      <div class="lp-blend-group">
                        <button
                          v-for="(part, pi) in group.parts"
                          :key="pi"
                          type="button"
                          class="lp-blend-part"
                          :class="{ active: blendingActive === `run${gi}:${pi}` }"
                          :title="partTitle(part)"
                          @click="speakPart(part, group.word)"
                        >{{ part.text }}</button>
                        <button
                          type="button"
                          class="lp-blend-arrow"
                          :class="{ active: blendingActive === 'word' }"
                          :disabled="!group.word"
                          :title="group.word ? `播放 ${group.word}` : ''"
                          @click="group.word && speak(group.word, 'pattern')"
                        >→ {{ group.word }}</button>
                      </div>
                      <i v-if="gi < blendGroups.length - 1" class="lp-blend-sep">·</i>
                    </template>
                  </div>
                  <button
                    type="button"
                    class="lp-path-listen"
                    :class="{ playing: blendingBusy }"
                    :disabled="blendingBusy"
                    aria-label="跟着演示拼一遍"
                    @click="playBlending"
                  >
                    <LoaderCircle v-if="blendingBusy" class="lp-path-spin" :size="16" />
                    <Volume2 v-else :size="16" />
                    <small>{{ blendingBusy ? '演示中…' : '跟着演示拼一遍' }}</small>
                  </button>
                </div>

                <!-- 无 sounds 的课兜底：读 patternAudio / 首个例句 -->
                <div v-else-if="patternSpeech" class="lp-path-pattern">
                  <span>核心结构</span>
                  <b>{{ step.pattern }}</b>
                  <button
                    type="button"
                    class="lp-path-listen"
                    :class="{ playing: speakingKey === 'pattern' }"
                    :aria-busy="ttsLoadingKey === 'pattern'"
                    aria-label="播放本课英文示例"
                    @click="speak(patternSpeech, 'pattern')"
                  >
                    <LoaderCircle v-if="ttsLoadingKey === 'pattern'" class="lp-path-spin" :size="16" />
                    <Volume2 v-else :size="16" />
                  </button>
                </div>
                <div class="lp-path-concept-grid">
                  <div class="lp-path-concept-copy">
                    <p class="lp-path-explanation">{{ step.explanation }}</p>
                    <div class="lp-path-tip"><Lightbulb :size="16" /><span>{{ step.tip }}</span></div>
                  </div>
                  <aside class="lp-path-notes">
                    <header><span>本课速记</span><small>点词可朗读</small></header>
                    <div v-if="wordChips.length" class="lp-path-word-chips">
                      <button
                        v-for="word in wordChips"
                        :key="word"
                        type="button"
                        :class="{ playing: speakingKey === `word:${word}` }"
                        :aria-busy="ttsLoadingKey === `word:${word}`"
                        @click="speak(word, `word:${word}`)"
                      >{{ word }}</button>
                    </div>
                    <p v-else>{{ step.goal }}</p>
                    <div class="lp-path-finish-rule">
                      <CheckCircle2 :size="14" />
                      <span>{{ finishRule }}</span>
                    </div>
                  </aside>
                </div>
                <!-- 回译课：先自己翻，再逐句对照参考译文与差异提示 -->
                <div v-if="step.translate?.length" class="lp-translate" aria-label="回译练习">
                  <header>
                    <div><Languages :size="15" /><span>先自己翻，再对照</span></div>
                    <button type="button" @click="revealAllTranslate">{{ allTranslateRevealed ? '收起全部' : '全部对照' }}</button>
                  </header>
                  <ol>
                    <li v-for="(item, index) in step.translate" :key="item.zh">
                      <div class="lp-translate-source">
                        <span>{{ index + 1 }}</span>
                        <p>{{ item.zh }}</p>
                        <button
                          type="button"
                          :class="{ active: translateRevealed[index] }"
                          :aria-expanded="!!translateRevealed[index]"
                          @click="toggleTranslate(index)"
                        >{{ translateRevealed[index] ? '收起' : '对照' }}</button>
                      </div>
                      <div v-if="translateRevealed[index]" class="lp-translate-answer">
                        <p>{{ item.en }}</p>
                        <small>{{ item.note }}</small>
                        <button
                          type="button"
                          class="lp-translate-speak"
                          aria-label="朗读参考译文"
                          :class="{ playing: speakingKey === `translate:${index}` }"
                          :aria-busy="ttsLoadingKey === `translate:${index}`"
                          @click="speak(item.en, `translate:${index}`)"
                        >
                          <LoaderCircle v-if="ttsLoadingKey === `translate:${index}`" class="lp-path-spin" :size="13" />
                          <Volume2 v-else :size="13" />
                          <span>听一遍</span>
                        </button>
                      </div>
                    </li>
                  </ol>
                </div>
              </section>

              <section v-else-if="phase.key === 'examples'" class="lp-path-lesson-stage">
                <header class="lp-path-section-head">
                  <div><BookOpen :size="16" /><span>原文与理解</span></div>
                  <small>{{ step.examples.length }} 段</small>
                </header>
                <section v-if="step.wordFamily?.length" class="lp-path-word-family" aria-label="同根词族">
                  <header>
                    <div><Sparkles :size="15" /><span>同根词族</span></div>
                    <small>{{ step.wordFamily.length }} 词 · 点击朗读</small>
                  </header>
                  <div class="lp-path-word-grid">
                    <button
                      v-for="entry in step.wordFamily"
                      :key="entry.word"
                      type="button"
                      :class="{ playing: speakingKey === `family:${entry.word}` }"
                      :aria-busy="ttsLoadingKey === `family:${entry.word}`"
                      @click="speak(entry.word, `family:${entry.word}`)"
                    >
                      <b>{{ entry.word }}</b>
                      <span>{{ entry.gloss }}</span>
                      <small v-if="entry.note">{{ entry.note }}</small>
                    </button>
                  </div>
                </section>
                <div v-if="step.readingPassageId" class="lp-path-reading-link">
                  <button type="button" @click="emit('read', step.readingPassageId)">对照细读</button>
                </div>
                <div class="lp-path-examples">
                  <article v-for="(example, index) in step.examples" :key="example.en">
                    <span>{{ String(index + 1).padStart(2, '0') }}</span>
                    <div>
                      <p>{{ example.en }}</p>
                      <small>{{ example.zh }}</small>
                    </div>
                    <button
                      type="button"
                      aria-label="朗读这段英文"
                      :class="{ playing: speakingKey === `example:${index}` }"
                      :aria-busy="ttsLoadingKey === `example:${index}`"
                      @click="speak(example.en, `example:${index}`)"
                    >
                      <LoaderCircle v-if="ttsLoadingKey === `example:${index}`" class="lp-path-spin" :size="14" />
                      <Volume2 v-else :size="14" />
                    </button>
                  </article>
                </div>
              </section>

              <section v-else-if="phase.key === 'practice'" class="lp-path-lesson-stage">
                <div class="lp-path-task">
                  <span>现在动手</span>
                  <p>{{ step.task }}</p>
                </div>
                <div class="lp-path-practice-plan">
                  <div v-for="(item, index) in practicePlan" :key="item"><b>{{ index + 1 }}</b><span>{{ item }}</span></div>
                </div>
                <div class="lp-path-practice-actions">
                  <button type="button" class="lp-path-practice-action" @click="emit('practice')">
                    <MessageCircle :size="15" /> {{ practiceActionLabel }}
                  </button>
                  <button type="button" class="lp-path-secondary-action" @click="selectPhase(3)">
                    直接自测 <ArrowRight :size="14" />
                  </button>
                </div>
              </section>

              <section v-else-if="phase.key === 'check' && step.quickCheck" class="lp-path-lesson-stage">
                <header class="lp-path-section-head">
                  <div><Target :size="16" /><span>本课小测</span></div>
                  <small>不计惩罚，只看有没有理解</small>
                </header>
                <h2>{{ step.quickCheck.question }}</h2>
                <div class="lp-path-choices">
                  <button
                    v-for="(option, index) in step.quickCheck.options"
                    :key="option"
                    type="button"
                    :class="{
                      picked: checkChoice === index,
                      correct: checkSubmitted && index === step.quickCheck.answer,
                      wrong: checkSubmitted && checkChoice === index && index !== step.quickCheck.answer,
                    }"
                    @click="chooseAnswer(index)"
                  >
                    <span>{{ String.fromCharCode(65 + index) }}</span>
                    {{ option }}
                  </button>
                </div>
                <button
                  v-if="!checkSubmitted"
                  type="button"
                  class="lp-path-check-action"
                  :disabled="checkChoice == null"
                  @click="submitCheck"
                >
                  确认答案
                </button>
                <div v-else class="lp-path-feedback" :class="{ correct: answerCorrect }">
                  <b>{{ answerCorrect ? '理解正确' : '再想一步' }}</b>
                  <p>{{ step.quickCheck.explanation }}</p>
                  <button v-if="!answerCorrect" type="button" @click="retryCheck">再选一次</button>
                </div>
              </section>
            </div>
          </article>

          <footer class="lp-path-footer">
            <button type="button" :disabled="phaseIndex === 0" aria-keyshortcuts="ArrowLeft" title="上一步（←）" @click="movePhase(-1)">
              <ArrowLeft :size="14" /> 上一步
            </button>
            <div class="lp-path-phase-progress">
              <span><i :style="{ width: ((phaseIndex + 1) / PHASES.length) * 100 + '%' }"></i></span>
              <small>{{ phase.label }} · {{ phaseIndex + 1 }} / {{ PHASES.length }}</small>
            </div>
            <button v-if="!isLastPhase" type="button" class="primary" aria-keyshortcuts="ArrowRight" title="下一步（→）" @click="movePhase(1)">
              下一步 <ArrowRight :size="14" />
            </button>
            <button v-else type="button" class="primary" @click="markCurrentComplete">
              {{ currentStepCompleted ? '完成复习' : '完成本课' }} <CheckCircle2 :size="14" />
            </button>
          </footer>
        </main>
      </div>
    </section>

    <div v-if="voiceDialogOpen" class="lp-voice-modal-backdrop" @click.self="closeVoiceDialog">
      <section class="lp-voice-modal" role="dialog" aria-modal="true" aria-labelledby="lp-voice-dialog-title" aria-describedby="lp-voice-dialog-desc">
        <header>
          <div>
            <span>英语朗读</span>
            <h3 id="lp-voice-dialog-title">需要下载英语语音包</h3>
          </div>
          <button type="button" aria-label="关闭语音包下载提示" :disabled="voiceInstalling" @click="closeVoiceDialog"><X :size="16" /></button>
        </header>
        <p id="lp-voice-dialog-desc">当前电脑没有可用的英文语音。是否下载应用内英语语音包？约 163 MB，下载一次后可离线朗读。</p>
        <div v-if="voiceInstalling" class="lp-voice-install-state" role="status">
          <div><span><i :style="{ width: voiceInstallProgress + '%' }"></i></span><b>{{ voiceInstallProgress }}%</b></div>
          <p>{{ voiceInstallMessage }}</p>
        </div>
        <p v-if="voiceInstallError" class="lp-voice-install-error" role="alert">下载失败：{{ voiceInstallError }}</p>
        <footer>
          <button type="button" :disabled="voiceInstalling" @click="closeVoiceDialog">暂不下载</button>
          <button type="button" class="lp-voice-dialog-primary" :disabled="voiceInstalling" @click="installVoicePackAndRetry">
            <Download :size="15" /> {{ voiceInstalling ? '正在下载…' : '下载并朗读' }}
          </button>
        </footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.lp-path { display: flex; flex-direction: column; gap: 12px; min-height: 0; color: var(--color-text); }
.lp-path-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.lp-path-kicker { display: inline-flex; align-items: center; gap: 5px; color: var(--color-primary); font-size: 11px; font-weight: 700; }
.lp-path-head h2 { margin: 5px 0 3px; font-size: 20px; line-height: 1.35; letter-spacing: 0; }
.lp-path-head p { margin: 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.55; }
.lp-path-actions { display: flex; gap: 7px; flex-wrap: wrap; justify-content: flex-end; }
.lp-path-action,
.lp-path-footer button,
.lp-path-practice-action,
.lp-path-check-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--glass-bg);
  color: var(--color-text-secondary);
  padding: 6px 10px;
  font-size: 11px;
  cursor: pointer;
}
.lp-path-action.primary,
.lp-path-footer button.primary,
.lp-path-practice-action,
.lp-path-check-action {
  border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 13%, var(--glass-bg));
  color: var(--color-primary);
}
.lp-path-progress { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 9px; color: var(--color-text-tertiary); font-size: 10px; }
.lp-path-progress > div { height: 5px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--color-text) 10%, transparent); }
.lp-path-progress i { display: block; height: 100%; border-radius: inherit; background: var(--color-primary); }
.lp-path-tracks { display: flex; flex-wrap: wrap; gap: 7px; }
.lp-path-tracks button { padding: 7px 18px; border: 1px solid color-mix(in srgb, var(--color-primary) 24%, var(--color-border)); border-radius: 999px; background: var(--path-paper, var(--glass-bg)); color: var(--color-text-secondary); font-size: 12px; cursor: pointer; transition: background .15s ease, color .15s ease; }
.lp-path-tracks button:hover { border-color: var(--color-primary); color: var(--color-primary); }
.lp-path-tracks button.active { border-color: var(--color-primary); background: var(--color-primary); color: #fff; }
.lp-path-tracks button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.lp-path-stages { display: grid; grid-template-columns: repeat(auto-fit, minmax(126px, 1fr)); gap: 7px; }
.lp-path-stages button {
  display: grid;
  grid-template-columns: 25px minmax(0, 1fr);
  grid-template-areas: "no title" "no level";
  gap: 1px 7px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--glass-bg);
  color: var(--color-text);
  padding: 8px;
  text-align: left;
  cursor: pointer;
}
.lp-path-stages button > span { grid-area: no; align-self: center; color: var(--color-text-tertiary); font-size: 10px; font-weight: 700; }
.lp-path-stages button b { grid-area: title; overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.lp-path-stages button small { grid-area: level; color: var(--color-text-tertiary); font-size: 9px; }
.lp-path-stages button.active { border-color: color-mix(in srgb, var(--color-primary) 62%, var(--color-border)); background: color-mix(in srgb, var(--color-primary) 13%, var(--glass-bg)); }
.lp-path-stages button.active > span { color: var(--color-primary); }
.lp-path-stages button.done { border-color: color-mix(in srgb, var(--color-success) 40%, var(--color-border)); }
.lp-path-stage-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--color-border); padding-bottom: 9px; }
.lp-path-stage-head > div > span { color: var(--color-primary); font-size: 10px; font-weight: 700; }
.lp-path-stage-head h3 { margin: 2px 0; font-size: 16px; }
.lp-path-stage-head p { margin: 0; color: var(--color-text-secondary); font-size: 11px; }
.lp-path-stage-progress { color: var(--color-text-tertiary); font-size: 10px; }
.lp-path-step-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.lp-path-step-list > button {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 9px;
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--glass-bg);
  color: var(--color-text);
  padding: 11px;
  text-align: left;
  cursor: pointer;
}
.lp-path-step-list > button:hover,
.lp-path-step-list > button.complete { border-color: color-mix(in srgb, var(--color-primary) 52%, var(--color-border)); }
.lp-path-step-number { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: color-mix(in srgb, var(--color-primary) 11%, transparent); color: var(--color-primary); font-size: 10px; font-weight: 700; }
.lp-path-step-list > button > div { min-width: 0; }
.lp-path-kind { display: inline-block; margin-bottom: 3px; color: var(--color-text-tertiary); font-size: 9px; }
.lp-path-kind.kind-roots { color: #0f766e; }
.lp-path-kind.kind-grammar { color: #245bdb; }
.lp-path-kind.kind-fable { color: #b45309; }
.lp-path-kind.kind-story { color: #7e22ce; }
.lp-path-kind.kind-long-story { color: #9a3412; }
.lp-path-step-list b { display: block; overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.lp-path-step-list p { display: -webkit-box; overflow: hidden; margin: 3px 0 0; color: var(--color-text-tertiary); font-size: 9px; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.lp-path-step-list small { color: var(--color-text-tertiary); font-size: 9px; white-space: nowrap; }
.lp-path-method { margin: 0; color: var(--color-text-tertiary); font-size: 9px; line-height: 1.55; }
.lp-path-hint { margin: 8px 0; color: var(--color-text-tertiary); font-size: 11px; }
.lp-path-hint.error { color: var(--color-danger); }

.lp-path-immersive {
  --path-focus-bg: #081017;
  --path-focus-panel: #101a23;
  --path-focus-line: rgba(172, 211, 214, .18);
  --path-focus-ink: #eef7f5;
  --path-focus-muted: #a4b8b8;
  --path-focus-accent: #46c8b8;
  --path-paper: #f5f7f4;
  --path-paper-ink: #17262b;
  --path-paper-muted: #5e7074;
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--path-focus-ink);
  background: linear-gradient(135deg, var(--path-focus-bg), #0a1620 58%, #071018);
  outline: none;
}
.lp-path-immersive-head {
  flex: 0 0 58px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  padding: 0 22px;
  border-bottom: 1px solid var(--path-focus-line);
  background: color-mix(in srgb, var(--path-focus-bg) 92%, transparent);
  backdrop-filter: blur(18px);
}
.lp-path-back,
.lp-path-head-meta button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 32px;
  border: 1px solid var(--path-focus-line);
  border-radius: 6px;
  background: var(--path-focus-panel);
  color: var(--path-focus-muted);
  padding: 5px 9px;
  font-size: 11px;
  cursor: pointer;
}
.lp-path-back:hover,
.lp-path-head-meta button:hover { border-color: color-mix(in srgb, var(--path-focus-accent) 42%, transparent); color: var(--path-focus-ink); }
.lp-path-head-meta { display: flex; align-items: center; gap: 8px; color: var(--path-focus-muted); font-size: 10px; }
.lp-path-head-meta button { width: 32px; padding: 0; }
.lp-path-head-meta .lp-path-save.active { border-color: color-mix(in srgb, var(--path-focus-accent) 46%, transparent); background: color-mix(in srgb, var(--path-focus-accent) 13%, var(--path-focus-panel)); color: var(--path-focus-accent); }
.lp-path-head-progress { display: flex; align-items: center; gap: 7px; margin-right: 3px; }
.lp-path-head-progress > span { display: block; width: 48px; height: 5px; overflow: hidden; border-radius: 999px; background: rgba(159,179,180,.16); }
.lp-path-head-progress i { display: block; height: 100%; border-radius: inherit; background: var(--path-focus-accent); }
.lp-path-head-progress small { color: var(--path-focus-muted); font-size: 9px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lp-path-crumb { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 11px; }
.lp-path-crumb span { flex: 0 0 auto; padding: 2px 7px; border: 1px solid color-mix(in srgb, var(--path-focus-accent) 24%, transparent); border-radius: 999px; color: var(--path-focus-accent); font-size: 9px; }
.lp-path-crumb b { overflow: hidden; color: var(--path-focus-ink); text-overflow: ellipsis; white-space: nowrap; }
.lp-path-crumb i { color: rgba(164,184,184,.45); font-style: normal; }
.lp-path-immersive-layout { flex: 1; min-height: 0; display: grid; grid-template-columns: 230px minmax(0, 1fr); }
.lp-path-immersive-rail {
  position: relative;
  min-height: 0;
  overflow-y: auto;
  padding: 22px 14px;
  border-right: 1px solid var(--path-focus-line);
  background: color-mix(in srgb, var(--path-focus-panel) 72%, transparent);
}
.lp-path-rail-course { display: flex; flex-direction: column; gap: 4px; margin: 0 8px 16px; padding-bottom: 15px; border-bottom: 1px solid var(--path-focus-line); }
.lp-path-rail-course span { color: var(--path-focus-accent); font-size: 9px; font-weight: 700; }
.lp-path-rail-course b { color: var(--path-focus-ink); font-size: 12px; line-height: 1.5; }
.lp-path-rail-course small { color: var(--path-focus-muted); font-size: 9px; line-height: 1.5; }
.lp-path-immersive-rail button {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 56px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--path-focus-muted);
  padding: 8px 9px;
  text-align: left;
  cursor: pointer;
  transition: background .16s ease, border-color .16s ease, transform .16s ease;
}
.lp-path-immersive-rail button i { display: inline-grid; place-items: center; width: 28px; height: 28px; border: 1px solid var(--path-focus-line); border-radius: 50%; font-size: 9px; font-style: normal; }
.lp-path-immersive-rail button b { display: block; color: var(--path-focus-ink); font-size: 11px; }
.lp-path-immersive-rail button small { display: block; margin-top: 2px; color: var(--path-focus-muted); font-size: 9px; }
.lp-path-immersive-rail button.active { border-color: color-mix(in srgb, var(--path-focus-accent) 42%, transparent); background: color-mix(in srgb, var(--path-focus-accent) 11%, transparent); box-shadow: inset 2px 0 0 var(--path-focus-accent); }
.lp-path-immersive-rail button.active i,
.lp-path-immersive-rail button.done i { border-color: var(--path-focus-accent); color: var(--path-focus-accent); }
.lp-path-immersive-rail button:hover { background: rgba(255,255,255,.035); transform: translateX(2px); }
.lp-path-rail-status { display: flex; flex-direction: column; gap: 7px; margin: auto 8px 0; padding-top: 16px; }
.lp-path-rail-status > span { height: 4px; overflow: hidden; border-radius: 999px; background: rgba(159,179,180,.14); }
.lp-path-rail-status i { display: block; height: 100%; border-radius: inherit; background: var(--path-focus-accent); }
.lp-path-rail-status small { color: var(--path-focus-muted); font-size: 9px; }
.lp-path-immersive-main { min-width: 0; min-height: 0; overflow-y: auto; padding: 24px clamp(18px, 4vw, 58px) 18px; }
.lp-path-paper { width: min(940px, 100%); margin: 0 auto; overflow: hidden; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; background: var(--path-paper); color: var(--path-paper-ink); box-shadow: 0 22px 68px rgba(0,0,0,.28); }
.lp-path-paper-head { padding: 25px 30px 19px; border-bottom: 1px solid rgba(24,37,43,.11); }
.lp-path-paper-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.lp-path-paper-head p { margin: 0; color: #0f766e; font-size: 10px; font-weight: 700; }
.lp-path-paper-head h1 { margin: 7px 0 0; font-size: clamp(25px, 3vw, 36px); line-height: 1.18; letter-spacing: 0; }
.lp-path-paper-meta { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; margin-top: 10px; color: var(--path-paper-muted); font-size: 11px; line-height: 1.5; }
.lp-path-time { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.lp-path-goal { min-width: 0; }
.lp-path-paper-meta i { width: 3px; height: 3px; margin: 0 3px; border-radius: 50%; background: currentColor; opacity: .55; }
.lp-path-complete-badge { display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; padding: 4px 8px; border: 1px solid rgba(15,138,61,.24); border-radius: 999px; background: #eefaf2; color: #0f8a3d; font-size: 9px; font-weight: 600; }
.lp-path-paper-body { padding: 22px 30px 28px; }
.lp-path-lesson-stage { display: flex; flex-direction: column; gap: 17px; }
.lp-path-lead { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 18px; align-items: start; padding: 17px 19px; border-left: 3px solid #0f766e; background: color-mix(in srgb, #0f766e 7%, var(--path-paper)); }
.lp-path-lead span { color: #0f766e; font-size: 10px; font-weight: 700; }
.lp-path-lead p { margin: 0; color: var(--path-paper-ink); font-size: 16px; line-height: 1.65; }
.lp-path-pattern { display: grid; grid-template-columns: minmax(0, 1fr) 32px; gap: 4px 8px; border-left: 3px solid #0f766e; background: color-mix(in srgb, #0f766e 7%, var(--path-paper)); padding: 11px 12px; }
.lp-path-pattern span { grid-column: 1; color: var(--path-paper-muted); font-size: 10px; }
.lp-path-pattern b { grid-column: 1; color: var(--path-paper-ink); font-size: 17px; line-height: 1.5; }
.lp-path-pattern button { grid-column: 2; grid-row: 1 / span 2; align-self: center; display: inline-grid; place-items: center; width: 32px; height: 32px; border: 1px solid rgba(15,118,110,.24); border-radius: 7px; background: var(--path-paper); color: #0f766e; cursor: pointer; }
.lp-path-pattern button:hover { background: #0f766e; color: #fff; }
.lp-path-pattern button.playing { background: #0f766e; color: #fff; box-shadow: 0 0 0 3px rgba(15,118,110,.12); }
/* 逐音学习：一次一个音标（零基础），大音标点读本音 */
.lp-sound-card { display: flex; flex-direction: column; gap: 12px; border-left: 3px solid #0f766e; background: color-mix(in srgb, #0f766e 7%, var(--path-paper)); padding: 18px 20px; }
.lp-sound-main { display: flex; align-items: center; gap: 20px; }
.lp-sound-ipa { min-width: 132px; padding: 14px 18px; border: 1px solid rgba(15,118,110,.3); border-radius: 10px; background: var(--path-paper); color: #0f766e; font-size: 34px; font-weight: 700; line-height: 1.15; cursor: pointer; transition: box-shadow .15s ease, background .15s ease; }
/* 零基础层：大卡片显示口型提示（替代 IPA 符号），保持可点听本音 */
.lp-sound-ipa.lp-sound-mouth { display: inline-flex; align-items: center; text-align: left; max-width: 280px; min-height: 88px; font-size: 14px; font-weight: 500; line-height: 1.7; white-space: normal; }
.lp-sound-ipa:hover { background: #eef8f6; box-shadow: 0 0 0 3px rgba(15,118,110,.12); }
.lp-sound-side { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; }
.lp-sound-side > b { color: var(--path-paper-ink); font-size: 15px; }
.lp-sound-word { display: inline-flex; align-items: baseline; gap: 7px; padding: 7px 12px; border: 1px solid rgba(15,118,110,.24); border-radius: 7px; background: var(--path-paper); color: var(--path-paper-ink); cursor: pointer; }
.lp-sound-word:hover { border-color: #0f766e; background: #f7fbfa; }
.lp-sound-word.playing { border-color: #0f766e; background: #eef8f6; }
.lp-sound-word span { color: var(--path-paper-ink); font-size: 16px; font-weight: 600; }
.lp-sound-word small { color: var(--path-paper-muted); font-size: 11px; }
.lp-sound-word svg { align-self: center; color: #0f766e; }
.lp-sound-nav { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.lp-sound-nav small { color: var(--path-paper-muted); font-size: 11px; }
.lp-sound-nav button { padding: 7px 14px; border: 1px solid rgba(15,118,110,.24); border-radius: 7px; background: var(--path-paper); color: #0f766e; font-size: 12px; cursor: pointer; }
.lp-sound-nav button:hover:not(:disabled) { background: #eef8f6; }
.lp-sound-nav button:disabled { opacity: .4; cursor: default; }
.lp-sound-nav button.lp-sound-next { background: #0f766e; color: #fff; border-color: #0f766e; }
.lp-sound-nav button.lp-sound-next:hover:not(:disabled) { filter: brightness(1.06); }
/* 拼读演示：音素块逐个高亮，最后连成整词 */
.lp-path-pattern.lp-path-pattern-blend { grid-template-columns: minmax(0, 1fr); }
.lp-blending { grid-column: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.lp-blend-group { display: inline-flex; align-items: center; gap: 6px; }
.lp-blend-part, .lp-blend-arrow { padding: 9px 14px; border: 1px solid rgba(15,118,110,.24); border-radius: 8px; background: var(--path-paper); color: var(--path-paper-ink); font-size: 16px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: background .15s ease, box-shadow .15s ease; }
.lp-blend-part:hover, .lp-blend-arrow:hover:not(:disabled) { border-color: #0f766e; background: #f7fbfa; }
.lp-blend-part.active, .lp-blend-arrow.active { border-color: #0f766e; background: #0f766e; color: #fff; box-shadow: 0 0 0 3px rgba(15,118,110,.12); }
.lp-blend-arrow { color: #0f766e; }
.lp-blend-arrow:disabled { opacity: .45; cursor: default; }
.lp-blend-sep { color: var(--path-paper-muted); }
.lp-path-pattern-blend button.lp-path-listen { grid-column: 1; grid-row: auto; justify-self: start; display: inline-flex; align-items: center; gap: 7px; width: auto; height: auto; margin-top: 4px; padding: 8px 14px; font-size: 12px; }
.lp-path-pattern-blend button.lp-path-listen:disabled { opacity: .6; cursor: default; }
.lp-path-pattern-blend button.lp-path-listen small { font-size: 12px; }
.lp-path-pattern button:focus-visible,
.lp-sound-card button:focus-visible,
.lp-blend-part:focus-visible,
.lp-blend-arrow:focus-visible { outline: 2px solid #0f766e; outline-offset: 2px; }
.lp-path-spin { animation: lp-path-spin .8s linear infinite; }
.lp-path-speech-error { margin: 0; padding: 8px 10px; border-left: 3px solid #b42318; background: color-mix(in srgb, #d4380d 7%, var(--path-paper)); color: #b42318; font-size: 11px; line-height: 1.6; }
@keyframes lp-path-spin { to { transform: rotate(360deg); } }
.lp-path-concept-grid { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 18px; align-items: start; }
.lp-path-concept-copy { display: flex; flex-direction: column; gap: 14px; }
.lp-path-explanation { margin: 0; color: #3f5157; font-size: 15px; line-height: 1.9; }
.lp-path-tip { display: flex; align-items: flex-start; gap: 7px; color: #9a5b12; font-size: 12px; line-height: 1.65; }
.lp-path-tip svg { flex: none; margin-top: 1px; }
.lp-path-notes { padding: 15px; border: 1px solid rgba(24,37,43,.11); border-radius: 7px; background: #eef3f1; }
.lp-path-notes header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.lp-path-notes header span { color: #0f766e; font-size: 10px; font-weight: 700; }
.lp-path-notes header small { color: var(--path-paper-muted); font-size: 9px; }
.lp-path-notes > p { margin: 9px 0 0; color: var(--path-paper-muted); font-size: 11px; line-height: 1.65; }
.lp-path-word-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 11px; }
.lp-path-word-chips button { border: 1px solid rgba(15,118,110,.2); border-radius: 999px; background: var(--path-paper); color: #0f766e; padding: 4px 8px; font-size: 10px; cursor: pointer; }
.lp-path-word-chips button:hover { border-color: #0f766e; background: color-mix(in srgb, #0f766e 7%, var(--path-paper)); }
.lp-path-word-chips button.playing { border-color: #0f766e; background: #0f766e; color: #fff; }
.lp-path-finish-rule { display: flex; align-items: flex-start; gap: 7px; margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(24,37,43,.1); color: var(--path-paper-muted); font-size: 10px; line-height: 1.6; }
.lp-path-finish-rule svg { flex: none; margin-top: 1px; color: #0f8a3d; }
.lp-path-section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.lp-path-section-head > div { display: inline-flex; align-items: center; gap: 6px; color: #0f766e; font-size: 11px; font-weight: 700; }
.lp-path-section-head small { color: var(--path-paper-muted); font-size: 9px; }
.lp-path-section-head + h2 { margin: 2px 0 0; color: var(--path-paper-ink); font-size: 21px; line-height: 1.45; }
.lp-path-word-family { overflow: hidden; border: 1px solid rgba(15,118,110,.16); border-radius: 7px; background: #eef3f1; }
.lp-path-word-family > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-bottom: 1px solid rgba(15,118,110,.12); }
.lp-path-word-family > header > div { display: inline-flex; align-items: center; gap: 6px; color: #0f766e; font-size: 10px; font-weight: 700; }
.lp-path-word-family > header small { color: var(--path-paper-muted); font-size: 9px; }
.lp-path-word-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; background: rgba(15,118,110,.1); }
.lp-path-word-grid button { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; border: 0; background: #f8faf9; padding: 10px 11px; text-align: left; cursor: pointer; }
.lp-path-word-grid button:hover { background: color-mix(in srgb, #0f766e 5%, var(--path-paper)); }
.lp-path-word-grid button.playing { background: #eef8f6; box-shadow: inset 3px 0 0 #0f766e; }
.lp-path-word-grid b { color: #0f766e; font-size: 12px; }
.lp-path-word-grid span { color: var(--path-paper-ink); font-size: 10px; line-height: 1.45; }
.lp-path-word-grid small { display: -webkit-box; overflow: hidden; color: var(--path-paper-muted); font-size: 9px; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.lp-path-examples { display: flex; flex-direction: column; gap: 10px; }
.lp-path-examples article { display: grid; grid-template-columns: 34px minmax(0, 1fr) 30px; gap: 12px; align-items: start; padding: 15px; border: 1px solid rgba(24,37,43,.12); border-radius: 7px; background: var(--path-paper); }
.lp-path-examples article > span { color: #0f766e; font-size: 10px; font-weight: 700; }
.lp-path-examples p { margin: 0; color: #1f3036; font-size: 15px; line-height: 1.75; }
.lp-path-examples small { display: block; margin-top: 5px; color: var(--path-paper-muted); font-size: 11px; line-height: 1.65; }
.lp-path-examples button { display: inline-grid; place-items: center; width: 28px; height: 28px; border: 1px solid rgba(24,37,43,.15); border-radius: 6px; background: var(--path-paper); color: #0f766e; cursor: pointer; }
.lp-path-examples button.playing { border-color: #0f766e; background: #0f766e; color: #fff; }
.lp-translate { display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid rgba(24,37,43,.12); border-radius: 7px; background: var(--path-paper); }
.lp-translate header { display: flex; align-items: center; justify-content: space-between; }
.lp-translate header div { display: flex; align-items: center; gap: 6px; color: #0f766e; font-size: 12px; font-weight: 700; }
.lp-translate header button { padding: 5px 12px; border: 1px solid rgba(15,118,110,.3); border-radius: 6px; background: var(--path-paper); color: #0f766e; font-size: 11px; font-weight: 600; cursor: pointer; }
.lp-translate ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.lp-translate li { border: 1px solid rgba(24,37,43,.1); border-radius: 6px; }
.lp-translate-source { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 12px; }
.lp-translate-source > span { color: var(--path-paper-muted); font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; }
.lp-translate-source p { margin: 0; color: #1f3036; font-size: 14px; line-height: 1.6; }
.lp-translate-source button { padding: 4px 10px; border: 1px solid rgba(15,118,110,.3); border-radius: 6px; background: var(--path-paper); color: #0f766e; font-size: 11px; font-weight: 600; cursor: pointer; }
.lp-translate-source button.active { border-color: #0f766e; background: #0f766e; color: #fff; }
.lp-translate-answer { margin: 0 12px 10px 44px; padding: 8px 0 0; border-top: 1px dashed rgba(24,37,43,.12); }
.lp-translate-answer p { margin: 0; color: #0f766e; font-size: 14px; line-height: 1.6; font-weight: 600; }
.lp-translate-answer small { display: block; margin-top: 4px; color: var(--path-paper-muted); font-size: 11px; line-height: 1.65; }
.lp-translate-speak { display: inline-flex; align-items: center; gap: 5px; margin-top: 8px; padding: 4px 10px; border: 1px solid rgba(15,118,110,.3); border-radius: 6px; background: var(--path-paper); color: #0f766e; font-size: 11px; font-weight: 600; cursor: pointer; }
.lp-translate-speak.playing { border-color: #0f766e; background: #0f766e; color: #fff; }
.lp-path-reading-link { display: flex; }
.lp-path-reading-link button { padding: 6px 14px; border: 1px solid rgba(15,118,110,.3); border-radius: 7px; background: var(--path-paper); color: #0f766e; font-size: 12px; font-weight: 600; cursor: pointer; }
.lp-path-reading-link button:hover { border-color: #0f766e; }
.lp-path-task { padding: 17px 19px; border-left: 3px solid #0f766e; background: color-mix(in srgb, #0f766e 7%, var(--path-paper)); }
.lp-path-task span { color: #0f766e; font-size: 10px; font-weight: 700; }
.lp-path-task p { margin: 7px 0 0; color: var(--path-paper-ink); font-size: 15px; line-height: 1.8; }
.lp-path-practice-plan { display: flex; flex-direction: column; gap: 8px; }
.lp-path-practice-plan div { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: start; gap: 9px; padding: 10px 12px; border: 1px solid rgba(24,37,43,.11); border-radius: 6px; }
.lp-path-practice-plan b { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: color-mix(in srgb, #0f766e 10%, var(--path-paper)); color: #0f766e; font-size: 10px; }
.lp-path-practice-plan span { color: var(--path-paper-muted); font-size: 12px; line-height: 1.7; }
.lp-path-practice-action,
.lp-path-check-action { align-self: flex-start; min-height: 36px; padding: 7px 13px; font-size: 12px; }
.lp-path-practice-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.lp-path-secondary-action { display: inline-flex; align-items: center; gap: 5px; min-height: 36px; padding: 7px 13px; border: 1px solid rgba(24,37,43,.14); border-radius: 7px; background: var(--path-paper); color: var(--path-paper-muted); font-size: 12px; cursor: pointer; }
.lp-path-secondary-action:hover { border-color: #0f766e; color: #0f766e; }
.lp-path-check-action:disabled { opacity: .4; cursor: default; }
.lp-path-choices { display: flex; flex-direction: column; gap: 7px; }
.lp-path-choices button { display: flex; align-items: center; gap: 10px; width: 100%; border: 1px solid rgba(24,37,43,.13); border-radius: 6px; background: var(--path-paper); color: var(--path-paper-ink); padding: 11px 12px; text-align: left; font-size: 13px; cursor: pointer; }
.lp-path-choices button > span { display: inline-grid; place-items: center; flex: 0 0 25px; width: 25px; height: 25px; border-radius: 50%; background: var(--path-paper); color: var(--path-paper-muted); font-size: 10px; font-weight: 700; }
.lp-path-choices button.picked { border-color: #0f766e; background: color-mix(in srgb, #0f766e 6%, #fff); }
.lp-path-choices button.correct { border-color: #0f8a3d; background: #eefaf2; }
.lp-path-choices button.wrong { border-color: #d4380d; background: color-mix(in srgb, #d4380d 7%, var(--path-paper)); }
.lp-path-feedback { padding: 13px 15px; border-left: 3px solid #d4380d; background: color-mix(in srgb, #d4380d 7%, var(--path-paper)); }
.lp-path-feedback.correct { border-left-color: #0f8a3d; background: #eefaf2; }
.lp-path-feedback b { color: #b42318; font-size: 13px; }
.lp-path-feedback.correct b { color: #0f8a3d; }
.lp-path-feedback p { margin: 5px 0 0; color: var(--path-paper-muted); font-size: 12px; line-height: 1.75; }
.lp-path-feedback button { margin-top: 8px; border: 0; background: transparent; color: #0f766e; padding: 0; font-size: 11px; font-weight: 600; cursor: pointer; }
.lp-path-footer { width: min(940px, 100%); margin: 12px auto 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.lp-path-footer button { border-color: var(--path-focus-line); background: var(--path-focus-panel); color: var(--path-focus-muted); }
.lp-path-footer button.primary { border-color: var(--path-focus-accent); background: color-mix(in srgb, var(--path-focus-accent) 16%, var(--path-focus-panel)); color: var(--path-focus-accent); }
.lp-path-footer button:disabled { opacity: .35; cursor: default; }
.lp-path-phase-progress { min-width: 180px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.lp-path-phase-progress > span { width: 100%; height: 4px; overflow: hidden; border-radius: 999px; background: rgba(159,179,180,.16); }
.lp-path-phase-progress i { display: block; height: 100%; border-radius: inherit; background: var(--path-focus-accent); transition: width .2s ease; }
.lp-path-phase-progress small { color: var(--path-focus-muted); font-size: 9px; }
.lp-voice-runtime-error { display: grid; grid-template-columns: auto minmax(0,1fr) auto auto; align-items: center; gap: 9px; margin-bottom: 13px; padding: 10px 11px; border-left: 3px solid #b42318; background: color-mix(in srgb, #d4380d 7%, var(--path-paper)); color: #7a271a; }
.lp-voice-runtime-error > svg { color: #b42318; }
.lp-voice-runtime-error p { margin: 0; font-size: 11px; line-height: 1.55; }
.lp-voice-runtime-error button { display: inline-flex; align-items: center; justify-content: center; min-height: 28px; padding: 4px 9px; border: 1px solid rgba(180,35,24,.25); border-radius: 6px; background: transparent; color: #8f241b; font-size: 11px; cursor: pointer; }
.lp-voice-modal-backdrop { position: fixed; inset: 0; z-index: 3400; display: grid; place-items: center; padding: 20px; background: rgba(3,10,15,.66); backdrop-filter: blur(4px); }
.lp-voice-modal { width: min(460px, 100%); overflow: hidden; border: 1px solid rgba(255,255,255,.14); border-radius: 8px; background: #f5f7f4; color: #18252b; box-shadow: 0 24px 70px rgba(0,0,0,.36); }
.lp-voice-modal > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 18px 20px 14px; border-bottom: 1px solid rgba(24,37,43,.1); }
.lp-voice-modal > header span { color: #0f766e; font-size: 10px; font-weight: 700; }
.lp-voice-modal > header h3 { margin: 4px 0 0; font-size: 18px; line-height: 1.35; }
.lp-voice-modal > header button { flex: 0 0 auto; display: inline-grid; place-items: center; width: 30px; height: 30px; border: 1px solid rgba(24,37,43,.15); border-radius: 6px; background: transparent; color: #596a72; cursor: pointer; }
.lp-voice-modal > p { margin: 0; padding: 16px 20px; color: #3f5157; font-size: 13px; line-height: 1.75; }
.lp-voice-modal > footer { display: flex; justify-content: flex-end; gap: 8px; padding: 13px 20px 18px; border-top: 1px solid rgba(24,37,43,.08); }
.lp-voice-modal > footer button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 34px; padding: 7px 12px; border: 1px solid rgba(24,37,43,.16); border-radius: 7px; background: transparent; color: #596a72; font-size: 12px; cursor: pointer; }
.lp-voice-modal > footer button.lp-voice-dialog-primary { border-color: #0f766e; background: #0f766e; color: #f5f7f4; }
.lp-voice-modal > footer button:disabled,
.lp-voice-modal > header button:disabled { opacity: .48; cursor: default; }
.lp-voice-install-state { margin: 0 20px 16px; padding: 11px 12px; border: 1px solid rgba(15,118,110,.18); border-radius: 7px; background: #edf7f4; }
.lp-voice-install-state > div { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 10px; }
.lp-voice-install-state > div span { height: 6px; overflow: hidden; border-radius: 999px; background: rgba(15,118,110,.15); }
.lp-voice-install-state > div i { display: block; height: 100%; border-radius: inherit; background: #0f766e; transition: width .2s ease; }
.lp-voice-install-state b { color: #0f766e; font-size: 11px; }
.lp-voice-install-state p { margin: 7px 0 0; color: #596a72; font-size: 10px; line-height: 1.55; }
.lp-voice-install-error { margin: 0 20px 14px !important; padding: 9px 11px !important; border-left: 3px solid #b42318; background: color-mix(in srgb, #d4380d 7%, #f5f7f4); color: #b42318 !important; font-size: 11px !important; }
@media (max-width: 900px) {
  .lp-path-head,
  .lp-path-stage-head { align-items: flex-start; flex-direction: column; }
  .lp-path-actions { justify-content: flex-start; }
  .lp-path-stage-head > div { width: 100%; }
  .lp-path-step-list { grid-template-columns: 1fr; }
  .lp-path-immersive-head { grid-template-columns: auto minmax(0, 1fr) auto; padding: 0 12px; }
  .lp-path-crumb span,
  .lp-path-crumb i,
  .lp-path-head-progress small { display: none; }
  .lp-path-back { width: 32px; padding: 0; font-size: 0; }
  .lp-path-immersive-layout { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  .lp-path-immersive-rail { display: flex; gap: 6px; overflow-x: auto; overflow-y: hidden; padding: 9px 12px; border-right: 0; border-bottom: 1px solid var(--path-focus-line); }
  .lp-path-rail-course,
  .lp-path-rail-status { display: none; }
  .lp-path-immersive-rail button { flex: 0 0 142px; min-height: 44px; }
  .lp-path-immersive-rail button small { display: none; }
  .lp-path-immersive-main { padding: 12px; }
  .lp-path-concept-grid { grid-template-columns: 1fr; }
  .lp-sound-card { padding: 14px 16px; }
  .lp-sound-ipa { min-width: 108px; font-size: 28px; }
  .lp-path-word-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lp-path-paper-head,
  .lp-path-paper-body { padding-left: 19px; padding-right: 19px; }
}
@media (max-width: 620px) {
  .lp-path-immersive-head { gap: 8px; padding: 0 8px; }
  .lp-path-head-progress > span { width: 34px; }
  .lp-path-head-meta { gap: 5px; }
  .lp-path-crumb b { font-size: 10px; }
  .lp-path-paper-head { padding-top: 20px; }
  .lp-path-paper-title { gap: 8px; }
  .lp-path-paper-head h1 { font-size: 23px; }
  .lp-path-paper-meta { flex-wrap: wrap; gap: 5px; }
  .lp-path-paper-meta > i { display: none; }
  .lp-path-goal { flex-basis: 100%; }
  .lp-path-notes { padding: 13px; }
  .lp-sound-main { gap: 12px; }
  .lp-path-word-grid { grid-template-columns: 1fr; }
  .lp-path-lead { grid-template-columns: 1fr; gap: 7px; padding: 14px; }
  .lp-path-examples article { grid-template-columns: 26px minmax(0, 1fr) 28px; gap: 8px; padding: 12px; }
  .lp-path-examples p { font-size: 14px; }
  .lp-path-footer { gap: 6px; }
  .lp-path-footer button { min-width: 84px; padding: 6px 8px; }
  .lp-path-phase-progress { min-width: 0; }
  .lp-path-phase-progress small { display: none; }
}
@media (max-width: 380px) {
  .lp-sound-nav { flex-wrap: wrap; }
}
@media (prefers-reduced-motion: reduce) {
  .lp-path-spin { animation: none; }
  .lp-voice-install-state > div i { transition: none; }
}
</style>
