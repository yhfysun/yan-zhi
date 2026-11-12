<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ArrowRight,
  BookOpen,
  Bug,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FlaskConical,
  GitBranch,
  ListOrdered,
  ShieldCheck,
  Target,
  Terminal,
  X,
} from 'lucide-vue-next';
import { api } from '../../api/client';
import SecurityCodeExample from './SecurityCodeExample.vue';

type SecurityCodeVariant = { language: string; bad: string; good: string; note: string };
type SecurityCode = SecurityCodeVariant & {
  context?: string;
  application?: string;
  exampleKind?: string;
  badLabel?: string;
  goodLabel?: string;
  variants?: SecurityCodeVariant[];
};
type SecurityTerm = { term: string; fullName?: string; explanation: string };
type SecurityLesson = {
  objectives: string[];
  keyTerms: SecurityTerm[];
  walkthrough: Array<{ title: string; detail: string }>;
  knowledgeChecks: Array<{ question: string; answer: string }>;
};
type SecurityLab = { target: string; tools: string[]; steps: string[]; expected: string; commands?: string[] };
type SecurityModule = {
  id: string; title: string; summary: string; useCase?: string; explanation?: string; topics: string[];
  lesson?: SecurityLesson; risk: string; control: string; code?: SecurityCode; lab?: SecurityLab;
};
type SecurityPath = {
  id: string; name: string; level: '入门' | '进阶' | '高级'; description: string;
  audience: string; prerequisites: string[]; nextPathIds: string[]; tags: string[]; glossary?: SecurityTerm[]; modules: SecurityModule[];
};
type StudyStepKey = 'concept' | 'reasoning' | 'defense' | 'lab' | 'check';
type StudyStep = { key: StudyStepKey; label: string; hint: string };

const props = withDefaults(defineProps<{ pathId?: string }>(), { pathId: '' });
const emit = defineEmits<{
  'select-path': [id: string];
  'focus-change': [active: boolean];
}>();

const PROGRESS_KEY = 'yz_security_progress_v1';
const paths = ref<SecurityPath[]>([]);
const loading = ref(true);
const error = ref('');
const completed = ref<Record<string, boolean>>({});

const focusedModuleId = ref('');
const activeStep = ref<StudyStepKey>('concept');
const reasoningIndex = ref(0);
const termIndex = ref(0);
const selfCheckIndex = ref(0);
const answerVisible = ref(false);
const focusFinished = ref(false);
const focusStageRef = ref<HTMLElement | null>(null);
let previousBodyOverflow = '';
let lastFocusTrigger: HTMLElement | null = null;

function unwrap<T>(r: unknown): T | null {
  if (r && typeof r === 'object' && 'data' in r) return (r as { data: T }).data;
  return null;
}
function restoreProgress() {
  try {
    completed.value = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
  } catch {
    completed.value = {};
  }
}
function persistProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(completed.value));
  } catch {
    // Progress is best-effort in restricted browser contexts.
  }
}
async function loadPaths() {
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get<{ data: SecurityPath[] }>('/learning/security/paths');
    paths.value = unwrap<SecurityPath[]>(r) || [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : '安全路线加载失败';
  } finally {
    loading.value = false;
  }
}

const activePath = computed(() =>
  paths.value.find((path) => path.id === props.pathId) || paths.value[0] || null,
);
const prerequisites = computed(() => activePath.value
  ? paths.value.filter((path) => activePath.value?.prerequisites.includes(path.id))
  : []);
const completedCount = computed(() => activePath.value
  ? activePath.value.modules.filter((mod) => completed.value[mod.id]).length
  : 0);
const progressPct = computed(() => activePath.value
  ? Math.round((completedCount.value / Math.max(1, activePath.value.modules.length)) * 100)
  : 0);

const focusedModule = computed(() =>
  activePath.value?.modules.find((mod) => mod.id === focusedModuleId.value) || null,
);
const focusedModuleIndex = computed(() =>
  activePath.value?.modules.findIndex((mod) => mod.id === focusedModuleId.value) ?? -1,
);
const nextModule = computed(() => {
  const modules = activePath.value?.modules || [];
  return focusedModuleIndex.value >= 0 ? modules[focusedModuleIndex.value + 1] || null : null;
});
const studySteps = computed<StudyStep[]>(() => {
  const mod = focusedModule.value;
  if (!mod) return [];
  const steps: StudyStep[] = [];
  if (mod.lesson || mod.useCase || mod.explanation) steps.push({ key: 'concept', label: '概念', hint: '先建立准确模型' });
  if (mod.lesson?.walkthrough.length) steps.push({ key: 'reasoning', label: '推导', hint: '一次跟一步' });
  if (mod.risk || mod.control || mod.code) steps.push({ key: 'defense', label: '攻防', hint: '风险与控制' });
  if (mod.lab) steps.push({ key: 'lab', label: '实验', hint: '授权靶场验证' });
  if (mod.lesson?.knowledgeChecks.length) steps.push({ key: 'check', label: '自测', hint: '一次答一题' });
  return steps;
});
const currentStepIndex = computed(() => Math.max(0, studySteps.value.findIndex((step) => step.key === activeStep.value)));
const currentStep = computed(() => studySteps.value[currentStepIndex.value] || null);
const isLastStep = computed(() => currentStepIndex.value >= studySteps.value.length - 1);
const reasoningSteps = computed(() => focusedModule.value?.lesson?.walkthrough || []);
const currentReasoningStep = computed(() => reasoningSteps.value[reasoningIndex.value] || null);
const keyTerms = computed(() => focusedModule.value?.lesson?.keyTerms || []);
const currentTerm = computed(() => keyTerms.value[termIndex.value] || null);
const knowledgeChecks = computed(() => focusedModule.value?.lesson?.knowledgeChecks || []);
const currentCheck = computed(() => knowledgeChecks.value[selfCheckIndex.value] || null);
const focusProgressPct = computed(() =>
  studySteps.value.length ? Math.round(((currentStepIndex.value + (focusFinished.value ? 1 : 0)) / studySteps.value.length) * 100) : 0,
);
const focused = computed(() => !!focusedModule.value);

function resetFocusState() {
  activeStep.value = 'concept';
  reasoningIndex.value = 0;
  termIndex.value = 0;
  selfCheckIndex.value = 0;
  answerVisible.value = false;
  focusFinished.value = false;
}
function openModule(id: string) {
  if (!focused.value && document.activeElement instanceof HTMLElement) {
    lastFocusTrigger = document.activeElement;
  }
  focusedModuleId.value = id;
  resetFocusState();
  emit('focus-change', true);
  void nextTick(() => focusStageRef.value?.focus());
}
function closeFocus() {
  if (!focusedModuleId.value) return;
  focusedModuleId.value = '';
  focusFinished.value = false;
  emit('focus-change', false);
  void nextTick(() => {
    if (lastFocusTrigger?.isConnected) lastFocusTrigger.focus();
    lastFocusTrigger = null;
  });
}
function selectPath(id: string) {
  if (id === activePath.value?.id) return;
  closeFocus();
  emit('select-path', id);
}
function selectStep(key: StudyStepKey) {
  activeStep.value = key;
  answerVisible.value = false;
  if (key === 'check') selfCheckIndex.value = 0;
}
function selectReasoning(index: number) {
  reasoningIndex.value = Math.min(Math.max(index, 0), Math.max(0, reasoningSteps.value.length - 1));
}
function moveReasoning(direction: -1 | 1) {
  selectReasoning(reasoningIndex.value + direction);
}
function moveTerm(direction: -1 | 1) {
  const count = keyTerms.value.length;
  if (!count) return;
  termIndex.value = (termIndex.value + direction + count) % count;
}
function moveCheck(direction: -1 | 1) {
  const count = knowledgeChecks.value.length;
  if (!count) return;
  selfCheckIndex.value = Math.min(Math.max(selfCheckIndex.value + direction, 0), count - 1);
  answerVisible.value = false;
}
function finishModule() {
  if (!focusedModule.value) return;
  completed.value = { ...completed.value, [focusedModule.value.id]: true };
  persistProgress();
  focusFinished.value = true;
}
function moveStep(direction: -1 | 1) {
  if (!focusedModule.value || !studySteps.value.length) return;
  if (direction === 1 && isLastStep.value) {
    finishModule();
    return;
  }
  const nextIndex = currentStepIndex.value + direction;
  if (nextIndex < 0 || nextIndex >= studySteps.value.length) return;
  selectStep(studySteps.value[nextIndex].key);
}
function openNextModule() {
  if (nextModule.value) {
    openModule(nextModule.value.id);
    return;
  }
  closeFocus();
}
function handleKeydown(event: KeyboardEvent) {
  if (!focused.value) return;
  if (event.key === 'Escape') {
    closeFocus();
    return;
  }
  if (event.key !== 'Tab' || !focusStageRef.value) return;
  const focusable = [...focusStageRef.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.getAttribute('aria-hidden') !== 'true');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === focusStageRef.value)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(focused, (isFocused) => {
  if (typeof document === 'undefined') return;
  if (isFocused) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = previousBodyOverflow;
  }
});
watch(() => props.pathId, () => {
  closeFocus();
  resetFocusState();
});
watch(studySteps, (steps) => {
  if (steps.length && !steps.some((step) => step.key === activeStep.value)) activeStep.value = steps[0].key;
}, { immediate: true });
watch(reasoningSteps, (steps) => {
  if (reasoningIndex.value >= steps.length) reasoningIndex.value = Math.max(0, steps.length - 1);
});
watch(keyTerms, (terms) => {
  if (termIndex.value >= terms.length) termIndex.value = Math.max(0, terms.length - 1);
});
watch(knowledgeChecks, (checks) => {
  if (selfCheckIndex.value >= checks.length) selfCheckIndex.value = Math.max(0, checks.length - 1);
});
watch(completed, persistProgress, { deep: true });
onMounted(() => {
  restoreProgress();
  window.addEventListener('keydown', handleKeydown);
  void loadPaths();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (typeof document !== 'undefined') document.body.style.overflow = previousBodyOverflow;
  if (focused.value) emit('focus-change', false);
});
</script>

<template>
  <section class="sec-workbench">
    <div v-if="loading" class="sec-loading">正在加载安全路线…</div>
    <div v-else-if="error" class="sec-error">{{ error }}</div>
    <template v-else-if="activePath">
      <div class="sec-path-overview">
        <header class="sec-overview-head">
          <div class="sec-breadcrumb">
            <span>网络安全</span>
            <ChevronRight :size="12" />
            <span>{{ activePath.level }}</span>
          </div>
          <div class="sec-overview-title-row">
            <div class="sec-overview-copy">
              <h1>{{ activePath.name }}</h1>
              <p>{{ activePath.description }}</p>
              <div class="sec-path-facts">
                <span><GitBranch :size="13" /> 先修：{{ prerequisites.length ? prerequisites.map((p) => p.name).join('、') : '无' }}</span>
                <span><ShieldCheck :size="13" /> {{ activePath.audience }}</span>
              </div>
            </div>
            <div class="sec-progress" :aria-label="`路线完成 ${progressPct}%`">
              <div class="sec-progress-ring" :style="{ '--pct': progressPct + '%' }"><b>{{ progressPct }}%</b></div>
              <span>{{ completedCount }} / {{ activePath.modules.length }} 模块</span>
            </div>
          </div>
          <nav class="sec-path-switcher" aria-label="安全路线">
            <button
              v-for="path in paths"
              :key="path.id"
              type="button"
              :class="{ active: path.id === activePath.id }"
              @click="selectPath(path.id)"
            >
              <span>{{ path.level }}</span>
              <b>{{ path.name }}</b>
            </button>
          </nav>
        </header>

        <section class="sec-module-browser" aria-labelledby="security-module-title">
          <header class="sec-section-head">
            <div>
              <p>学习路线</p>
              <h2 id="security-module-title">课程模块</h2>
            </div>
            <span>{{ activePath.modules.length }} 个知识点</span>
          </header>
          <div class="sec-module-list">
            <article
              v-for="(mod, index) in activePath.modules"
              :key="mod.id"
              class="sec-module-card"
              :class="{ completed: completed[mod.id] }"
            >
              <div class="sec-module-number">{{ String(index + 1).padStart(2, '0') }}</div>
              <div class="sec-module-copy">
                <div class="sec-module-title-row">
                  <h3>{{ mod.title }}</h3>
                  <span v-if="completed[mod.id]" class="sec-module-done">
                    <CheckCircle2 :size="13" /> 已完成
                  </span>
                </div>
                <p>{{ mod.summary }}</p>
                <div class="sec-module-topics">
                  <span v-for="topic in mod.topics.slice(0, 4)" :key="topic">{{ topic }}</span>
                </div>
              </div>
              <button type="button" class="sec-module-start" @click="openModule(mod.id)">
                {{ completed[mod.id] ? '复习本节' : '开始学习' }}
                <ArrowRight :size="15" />
              </button>
            </article>
          </div>
        </section>

        <footer class="sec-overview-safety">
          <ShieldCheck :size="18" />
          <div>
            <b>授权范围</b>
            <p>只测试自己的系统、明确授权的资产或本地靶场。实验步骤被放在独立环节，开始前仍需确认范围和停止条件。</p>
          </div>
        </footer>
      </div>

      <div
        v-if="focusedModule"
        ref="focusStageRef"
        class="sec-focus"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`sec-focus-title-${focusedModule.id}`"
        tabindex="-1"
      >
        <header class="sec-focus-header">
          <button type="button" class="sec-focus-back" aria-label="返回安全路线" @click="closeFocus">
            <ChevronLeft :size="16" />
            返回路线
          </button>
          <div class="sec-focus-crumb">
            <span>{{ activePath.name }}</span>
            <i>/</i>
            <b>{{ focusedModule.title }}</b>
          </div>
          <div class="sec-focus-header-actions">
            <span>{{ focusedModuleIndex + 1 }} / {{ activePath.modules.length }}</span>
            <button type="button" aria-label="退出专注学习" @click="closeFocus"><X :size="17" /></button>
          </div>
        </header>

        <div class="sec-focus-layout">
          <nav class="sec-focus-rail" aria-label="本节学习步骤">
            <button
              v-for="(step, stepIndex) in studySteps"
              :key="step.key"
              type="button"
              :class="{ active: activeStep === step.key, passed: !focusFinished && stepIndex < currentStepIndex }"
              :aria-current="activeStep === step.key && !focusFinished ? 'step' : undefined"
              @click="selectStep(step.key)"
            >
              <span>{{ String(stepIndex + 1).padStart(2, '0') }}</span>
              <div>
                <b>{{ step.label }}</b>
                <small>{{ step.hint }}</small>
              </div>
            </button>
          </nav>

          <main class="sec-focus-main">
            <div v-if="!focusFinished" class="sec-focus-scroll">
              <article class="sec-focus-sheet">
                <header class="sec-focus-sheet-head">
                  <p>{{ currentStep?.label }} · {{ currentStepIndex + 1 }} / {{ studySteps.length }}</p>
                  <h1 :id="`sec-focus-title-${focusedModule.id}`">{{ focusedModule.title }}</h1>
                  <span>{{ currentStep?.hint }}</span>
                </header>

                <div class="sec-focus-content" aria-live="polite">
                  <section v-if="activeStep === 'concept'" class="sec-concept-stage">
                    <div class="sec-focus-lead">
                      <span>本节要点</span>
                      <p>{{ focusedModule.summary }}</p>
                    </div>
                    <div v-if="focusedModule.useCase" class="sec-focus-block">
                      <h2>先看场景</h2>
                      <p>{{ focusedModule.useCase }}</p>
                    </div>
                    <div v-if="focusedModule.explanation" class="sec-focus-block">
                      <h2>为什么这样做</h2>
                      <p>{{ focusedModule.explanation }}</p>
                    </div>
                    <section v-if="currentTerm" class="sec-term-focus" aria-label="关键概念">
                      <header>
                        <div>
                          <span>关键概念</span>
                          <b>{{ termIndex + 1 }} / {{ keyTerms.length }}</b>
                        </div>
                        <div class="sec-term-nav">
                          <button type="button" :disabled="keyTerms.length < 2" aria-label="上一个概念" @click="moveTerm(-1)">
                            <ChevronLeft :size="14" />
                          </button>
                          <button type="button" :disabled="keyTerms.length < 2" aria-label="下一个概念" @click="moveTerm(1)">
                            <ChevronRight :size="14" />
                          </button>
                        </div>
                      </header>
                      <article>
                        <div>
                          <strong>{{ currentTerm.term }}</strong>
                          <small v-if="currentTerm.fullName">{{ currentTerm.fullName }}</small>
                        </div>
                        <p>{{ currentTerm.explanation }}</p>
                      </article>
                    </section>
                    <section v-if="focusedModule.lesson?.objectives.length" class="sec-objectives">
                      <h2>学完你要能做到</h2>
                      <ul>
                        <li v-for="objective in focusedModule.lesson.objectives" :key="objective">
                          <CheckCircle2 :size="14" />
                          <span>{{ objective }}</span>
                        </li>
                      </ul>
                    </section>
                  </section>

                  <section v-else-if="activeStep === 'reasoning' && currentReasoningStep" class="sec-reasoning-stage">
                    <header>
                      <div>
                        <ListOrdered :size="16" />
                        <span>推导 {{ reasoningIndex + 1 }} / {{ reasoningSteps.length }}</span>
                      </div>
                      <div class="sec-reasoning-controls">
                        <button type="button" :disabled="reasoningIndex === 0" aria-label="上一条推导" @click="moveReasoning(-1)">
                          <ChevronLeft :size="16" />
                        </button>
                        <button
                          type="button"
                          :disabled="reasoningIndex >= reasoningSteps.length - 1"
                          aria-label="下一条推导"
                          @click="moveReasoning(1)"
                        >
                          <ChevronRight :size="16" />
                        </button>
                      </div>
                    </header>
                    <article class="sec-reasoning-card">
                      <span>{{ String(reasoningIndex + 1).padStart(2, '0') }}</span>
                      <div>
                        <h2>{{ currentReasoningStep.title }}</h2>
                        <p>{{ currentReasoningStep.detail }}</p>
                      </div>
                    </article>
                    <div class="sec-reasoning-dots" aria-label="推导进度">
                      <button
                        v-for="(step, index) in reasoningSteps"
                        :key="step.title"
                        type="button"
                        :class="{ active: reasoningIndex === index }"
                        :aria-label="step.title"
                        :aria-current="reasoningIndex === index ? 'step' : undefined"
                        @click="selectReasoning(index)"
                      />
                    </div>
                  </section>

                  <section v-else-if="activeStep === 'defense'" class="sec-defense-stage">
                    <div class="sec-defense-grid">
                      <article class="risk">
                        <header><Bug :size="16" /><h2>风险如何发生</h2></header>
                        <p>{{ focusedModule.risk }}</p>
                      </article>
                      <article class="control">
                        <header><ShieldCheck :size="16" /><h2>控制如何阻断</h2></header>
                        <p>{{ focusedModule.control }}</p>
                      </article>
                    </div>
                    <SecurityCodeExample v-if="focusedModule.code" v-bind="focusedModule.code" />
                  </section>

                  <section v-else-if="activeStep === 'lab' && focusedModule.lab" class="sec-lab-stage">
                    <header class="sec-lab-heading">
                      <div>
                        <FlaskConical :size="18" />
                        <div><span>授权靶场</span><h2>{{ focusedModule.lab.target }}</h2></div>
                      </div>
                      <div class="sec-lab-tools">
                        <Terminal :size="13" />
                        <span v-for="tool in focusedModule.lab.tools" :key="tool">{{ tool }}</span>
                      </div>
                    </header>
                    <div v-if="focusedModule.lab.commands?.length" class="sec-lab-commands">
                      <code v-for="command in focusedModule.lab.commands" :key="command">{{ command }}</code>
                    </div>
                    <ol>
                      <li v-for="step in focusedModule.lab.steps" :key="step">{{ step }}</li>
                    </ol>
                    <p class="sec-lab-expected"><b>验收</b>{{ focusedModule.lab.expected }}</p>
                  </section>

                  <section v-else-if="activeStep === 'check' && currentCheck" class="sec-check-stage">
                    <header>
                      <div>
                        <CircleHelp :size="18" />
                        <span>问题 {{ selfCheckIndex + 1 }} / {{ knowledgeChecks.length }}</span>
                      </div>
                      <Target :size="18" />
                    </header>
                    <h2>{{ currentCheck.question }}</h2>
                    <button v-if="!answerVisible" type="button" class="sec-reveal-answer" @click="answerVisible = true">
                      看答案
                    </button>
                    <div v-else class="sec-check-answer">
                      <span>对照答案</span>
                      <p>{{ currentCheck.answer }}</p>
                    </div>
                    <div class="sec-check-nav">
                      <button type="button" :disabled="selfCheckIndex === 0" @click="moveCheck(-1)">
                        <ChevronLeft :size="15" /> 上一题
                      </button>
                      <button
                        type="button"
                        :disabled="selfCheckIndex >= knowledgeChecks.length - 1"
                        @click="moveCheck(1)"
                      >
                        下一题 <ChevronRight :size="15" />
                      </button>
                    </div>
                  </section>
                </div>
              </article>
            </div>

            <section v-else class="sec-focus-complete">
              <div class="sec-complete-mark"><CheckCircle2 :size="34" /></div>
              <p>本节完成</p>
              <h1>{{ focusedModule.title }}</h1>
              <span>知识点已标记完成，回到路线后可以继续下一节，也可以重新进入这一节复习。</span>
              <div class="sec-complete-actions">
                <button type="button" class="secondary" @click="closeFocus">
                  <BookOpen :size="15" /> 返回路线
                </button>
                <button type="button" class="primary" @click="openNextModule">
                  {{ nextModule ? '继续下一节' : '完成这条路线' }}
                  <ArrowRight :size="15" />
                </button>
              </div>
            </section>

            <footer v-if="!focusFinished" class="sec-focus-footer">
              <button type="button" class="sec-focus-prev" :disabled="currentStepIndex === 0" @click="moveStep(-1)">
                <ChevronLeft :size="15" /> 上一步
              </button>
              <div class="sec-focus-progress">
                <span><i :style="{ width: focusProgressPct + '%' }"></i></span>
                <small>{{ currentStep?.label }} · {{ currentStepIndex + 1 }} / {{ studySteps.length }}</small>
              </div>
              <button type="button" class="sec-focus-next" @click="moveStep(1)">
                {{ isLastStep ? '完成本节' : '下一步' }}
                <CheckCircle2 v-if="isLastStep" :size="15" />
                <ChevronRight v-else :size="15" />
              </button>
            </footer>
          </main>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.sec-workbench {
  min-width: 0;
  color: var(--color-text);
}
.sec-loading,
.sec-error {
  min-height: 280px;
  display: grid;
  place-items: center;
  color: var(--color-text-tertiary);
}
.sec-error { color: var(--color-danger); }
.sec-path-overview {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.sec-overview-head {
  padding: 22px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--glass-bg);
}
.sec-breadcrumb {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--color-text-tertiary);
  font-size: 11px;
}
.sec-overview-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 28px;
  margin-top: 14px;
}
.sec-overview-copy { min-width: 0; }
.sec-overview-copy h1 {
  margin: 0;
  color: var(--color-text);
  font-size: clamp(23px, 2.2vw, 32px);
  line-height: 1.2;
}
.sec-overview-copy > p {
  max-width: 760px;
  margin: 9px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.75;
}
.sec-path-facts {
  display: flex;
  align-items: center;
  gap: 8px 18px;
  flex-wrap: wrap;
  margin-top: 13px;
  color: var(--color-text-tertiary);
  font-size: 11px;
}
.sec-path-facts span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.sec-progress {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  color: var(--color-text-tertiary);
  font-size: 10px;
}
.sec-progress-ring {
  width: 62px;
  height: 62px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(#0f766e var(--pct), color-mix(in srgb, #0f766e 12%, var(--color-surface)) 0);
}
.sec-progress-ring::before {
  content: "";
  grid-area: 1 / 1;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--glass-bg);
}
.sec-progress-ring b {
  z-index: 1;
  grid-area: 1 / 1;
  color: #0f766e;
  font-size: 12px;
}
.sec-path-switcher {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  margin-top: 20px;
  padding-bottom: 2px;
}
.sec-path-switcher button {
  flex: 0 0 auto;
  min-width: 154px;
  padding: 9px 12px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  text-align: left;
  cursor: pointer;
}
.sec-path-switcher button span {
  display: block;
  color: var(--color-text-tertiary);
  font-size: 9px;
}
.sec-path-switcher button b {
  display: block;
  margin-top: 2px;
  color: var(--color-text);
  font-size: 11px;
}
.sec-path-switcher button:hover { border-color: color-mix(in srgb, #0f766e 55%, var(--color-border)); }
.sec-path-switcher button.active {
  border-color: #0f766e;
  background: color-mix(in srgb, #0f766e 9%, var(--color-surface));
  box-shadow: inset 3px 0 0 #0f766e;
}
.sec-path-switcher button.active b,
.sec-path-switcher button.active span { color: #0f766e; }
.sec-module-browser {
  padding: 20px 22px 22px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
}
.sec-section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.sec-section-head p {
  margin: 0 0 3px;
  color: #0f766e;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .5px;
}
.sec-section-head h2 {
  margin: 0;
  color: var(--color-text);
  font-size: 17px;
}
.sec-section-head > span {
  color: var(--color-text-tertiary);
  font-size: 11px;
}
.sec-module-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sec-module-card {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  min-height: 102px;
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--glass-bg);
}
.sec-module-card:hover {
  border-color: color-mix(in srgb, #0f766e 45%, var(--color-border));
}
.sec-module-card.completed {
  border-color: color-mix(in srgb, #0f766e 32%, var(--color-border));
  background: color-mix(in srgb, #0f766e 5%, var(--color-surface));
}
.sec-module-number {
  color: color-mix(in srgb, #0f766e 70%, var(--color-text-tertiary));
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.sec-module-copy { min-width: 0; }
.sec-module-title-row {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}
.sec-module-title-row h3 {
  margin: 0;
  color: var(--color-text);
  font-size: 14px;
}
.sec-module-done {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #0f766e;
  font-size: 10px;
}
.sec-module-copy > p {
  margin: 5px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.65;
}
.sec-module-topics {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.sec-module-topics span {
  padding: 2px 7px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text-tertiary);
  font-size: 9px;
}
.sec-module-start {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 108px;
  padding: 8px 11px;
  border: 1px solid color-mix(in srgb, #0f766e 50%, var(--color-border));
  border-radius: 6px;
  background: color-mix(in srgb, #0f766e 8%, var(--color-surface));
  color: #0f766e;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.sec-module-start:hover { background: #0f766e; color: #fff; }
.sec-overview-safety {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px 15px;
  border: 1px solid color-mix(in srgb, #b45309 30%, var(--color-border));
  border-radius: 8px;
  background: color-mix(in srgb, #f59e0b 8%, var(--color-surface));
  color: #b45309;
}
.sec-overview-safety > svg { flex: 0 0 auto; margin-top: 1px; }
.sec-overview-safety b { font-size: 11px; }
.sec-overview-safety p {
  margin: 3px 0 0;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1.65;
}

/* Immersive focus workspace */
.sec-focus {
  --focus-bg: #081017;
  --focus-panel: #101a23;
  --focus-panel-2: #14212c;
  --focus-line: rgba(180, 214, 218, .16);
  --focus-ink: #eef6f4;
  --focus-muted: #9fb3b4;
  --focus-accent: #4fd1c5;
  --focus-amber: #f2b35f;
  --focus-paper: #f2f5f2;
  --focus-paper-ink: #18232b;
  --focus-paper-muted: #56676c;
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--focus-ink);
  background: linear-gradient(135deg, var(--focus-bg) 0%, #0d1821 54%, #081017 100%);
  outline: none;
}
.sec-focus-header {
  flex: 0 0 58px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 20px;
  padding: 0 22px;
  border-bottom: 1px solid var(--focus-line);
  background: rgba(8, 16, 23, .96);
}
.sec-focus-back,
.sec-focus-header-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 32px;
  border: 1px solid var(--focus-line);
  border-radius: 6px;
  background: var(--focus-panel);
  color: var(--focus-muted);
  padding: 5px 10px;
  font-size: 11px;
  cursor: pointer;
}
.sec-focus-back:hover,
.sec-focus-header-actions button:hover {
  border-color: rgba(79, 209, 197, .5);
  color: var(--focus-ink);
}
.sec-focus-crumb {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  color: var(--focus-muted);
  font-size: 11px;
  white-space: nowrap;
}
.sec-focus-crumb span { overflow: hidden; text-overflow: ellipsis; }
.sec-focus-crumb i { color: rgba(159, 179, 180, .5); font-style: normal; }
.sec-focus-crumb b { overflow: hidden; color: var(--focus-ink); text-overflow: ellipsis; }
.sec-focus-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sec-focus-header-actions > span {
  color: var(--focus-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.sec-focus-header-actions button { width: 32px; padding: 0; }
.sec-focus-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
}
.sec-focus-rail {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  overflow-y: auto;
  padding: 24px 16px;
  border-right: 1px solid var(--focus-line);
  background: rgba(11, 23, 32, .76);
}
.sec-focus-rail button {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  min-height: 56px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--focus-muted);
  padding: 8px 9px;
  text-align: left;
  cursor: pointer;
}
.sec-focus-rail button > span {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--focus-line);
  border-radius: 50%;
  color: var(--focus-muted);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}
.sec-focus-rail button div { min-width: 0; }
.sec-focus-rail button b {
  display: block;
  color: var(--focus-ink);
  font-size: 12px;
}
.sec-focus-rail button small {
  display: block;
  overflow: hidden;
  margin-top: 2px;
  color: var(--focus-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sec-focus-rail button:hover {
  border-color: var(--focus-line);
  background: rgba(255, 255, 255, .025);
}
.sec-focus-rail button.active {
  border-color: rgba(79, 209, 197, .36);
  background: rgba(79, 209, 197, .11);
  box-shadow: inset 2px 0 0 var(--focus-accent);
}
.sec-focus-rail button.active > span {
  border-color: var(--focus-accent);
  color: var(--focus-accent);
}
.sec-focus-rail button.passed > span {
  border-color: rgba(79, 209, 197, .36);
  color: var(--focus-accent);
}
.sec-focus-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.sec-focus-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 28px clamp(24px, 5vw, 76px) 36px;
}
.sec-focus-sheet {
  width: min(900px, 100%);
  min-height: 100%;
  margin: 0 auto;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 8px;
  background: var(--focus-paper);
  color: var(--focus-paper-ink);
  box-shadow: 0 22px 72px rgba(0, 0, 0, .28);
}
.sec-focus-sheet-head {
  padding: 28px 34px 22px;
  border-bottom: 1px solid rgba(24, 35, 43, .11);
}
.sec-focus-sheet-head p {
  margin: 0;
  color: #0f766e;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .4px;
}
.sec-focus-sheet-head h1 {
  margin: 8px 0 6px;
  color: var(--focus-paper-ink);
  font-size: clamp(25px, 3vw, 38px);
  line-height: 1.18;
  letter-spacing: 0;
}
.sec-focus-sheet-head > span {
  color: var(--focus-paper-muted);
  font-size: 12px;
}
.sec-focus-content {
  padding: 26px 34px 34px;
}
.sec-concept-stage,
.sec-reasoning-stage,
.sec-defense-stage,
.sec-lab-stage,
.sec-check-stage {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.sec-focus-lead {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
  padding: 18px 20px;
  border-left: 3px solid #0f766e;
  background: color-mix(in srgb, #0f766e 7%, var(--focus-paper));
}
.sec-focus-lead span {
  color: #0f766e;
  font-size: 10px;
  font-weight: 700;
}
.sec-focus-lead p {
  margin: 0;
  color: var(--focus-paper-ink);
  font-size: 17px;
  line-height: 1.65;
}
.sec-focus-block h2,
.sec-objectives h2,
.sec-term-focus header span,
.sec-check-stage h2 {
  color: var(--focus-paper-ink);
}
.sec-focus-block h2,
.sec-objectives h2 {
  margin: 0 0 7px;
  font-size: 14px;
}
.sec-focus-block p {
  margin: 0;
  color: var(--focus-paper-muted);
  font-size: 13px;
  line-height: 1.9;
}
.sec-term-focus {
  border: 1px solid rgba(15, 118, 110, .28);
  border-radius: 7px;
  overflow: hidden;
}
.sec-term-focus > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border-bottom: 1px solid rgba(15, 118, 110, .2);
  background: color-mix(in srgb, #0f766e 7%, var(--focus-paper));
}
.sec-term-focus > header > div:first-child {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.sec-term-focus header span {
  color: #0f766e;
  font-size: 10px;
  font-weight: 700;
}
.sec-term-focus header b {
  color: var(--focus-paper-muted);
  font-size: 9px;
  font-weight: 500;
}
.sec-term-nav {
  display: flex;
  gap: 4px;
}
.sec-term-nav button,
.sec-reasoning-controls button {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(24, 35, 43, .14);
  border-radius: 5px;
  background: var(--focus-paper);
  color: var(--focus-paper-muted);
  cursor: pointer;
}
.sec-term-nav button:disabled,
.sec-reasoning-controls button:disabled { opacity: .35; cursor: not-allowed; }
.sec-term-focus article {
  padding: 17px 18px 19px;
}
.sec-term-focus article > div {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.sec-term-focus strong {
  color: #0f766e;
  font-size: 19px;
}
.sec-term-focus small {
  color: var(--focus-paper-muted);
  font-size: 10px;
  line-height: 1.5;
}
.sec-term-focus article p {
  margin: 9px 0 0;
  color: var(--focus-paper-ink);
  font-size: 13px;
  line-height: 1.85;
}
.sec-objectives {
  padding-top: 2px;
}
.sec-objectives ul {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.sec-objectives li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--focus-paper-muted);
  font-size: 12px;
  line-height: 1.75;
}
.sec-objectives li svg {
  flex: 0 0 auto;
  margin-top: 2px;
  color: #0f766e;
}
.sec-reasoning-stage > header,
.sec-check-stage > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.sec-reasoning-stage > header > div:first-child,
.sec-check-stage > header > div {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #0f766e;
  font-size: 11px;
  font-weight: 600;
}
.sec-reasoning-controls { display: flex; gap: 4px; }
.sec-reasoning-card {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  gap: 22px;
  min-height: 260px;
  align-items: start;
  padding: 28px;
  border: 1px solid rgba(24, 35, 43, .12);
  border-radius: 7px;
  background: var(--focus-paper);
}
.sec-reasoning-card > span {
  display: inline-grid;
  place-items: center;
  width: 48px;
  height: 36px;
  border-radius: 5px;
  background: color-mix(in srgb, #0f766e 10%, var(--focus-paper));
  color: #0f766e;
  font-size: 11px;
  font-weight: 700;
}
.sec-reasoning-card h2 {
  margin: 0;
  color: var(--focus-paper-ink);
  font-size: 22px;
}
.sec-reasoning-card p {
  margin: 13px 0 0;
  color: var(--focus-paper-muted);
  font-size: 15px;
  line-height: 2;
}
.sec-reasoning-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
}
.sec-reasoning-dots button {
  width: 24px;
  height: 5px;
  border: 0;
  border-radius: 999px;
  background: rgba(24, 35, 43, .16);
  padding: 0;
  cursor: pointer;
}
.sec-reasoning-dots button.active {
  width: 40px;
  background: #0f766e;
}
.sec-defense-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.sec-defense-grid article {
  padding: 18px;
  border: 1px solid rgba(24, 35, 43, .12);
  border-radius: 7px;
}
.sec-defense-grid article.risk {
  border-left: 3px solid #b45309;
  background: color-mix(in srgb, #f59e0b 7%, var(--focus-paper));
}
.sec-defense-grid article.control {
  border-left: 3px solid #0f766e;
  background: color-mix(in srgb, #0f766e 6%, var(--focus-paper));
}
.sec-defense-grid header {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #0f766e;
}
.sec-defense-grid .risk header { color: #b45309; }
.sec-defense-grid h2 {
  margin: 0;
  color: var(--focus-paper-ink);
  font-size: 14px;
}
.sec-defense-grid p {
  margin: 10px 0 0;
  color: var(--focus-paper-muted);
  font-size: 13px;
  line-height: 1.9;
}
.sec-defense-stage :deep(.sec-code) {
  --lp-primary: #0f766e;
  --lp-surface: var(--focus-paper);
  --lp-surface-hover: color-mix(in srgb, var(--focus-paper) 90%, #0f766e);
  --lp-border: rgba(24, 35, 43, .14);
  --lp-text: var(--focus-paper-ink);
  --lp-text-secondary: var(--focus-paper-muted);
  --color-bg: #e7ece8;
  --color-text: var(--focus-paper-ink);
  --color-text-secondary: var(--focus-paper-muted);
  border-radius: 7px;
}
.sec-lab-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.sec-lab-heading > div:first-child {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  color: #b45309;
}
.sec-lab-heading span {
  display: block;
  color: #b45309;
  font-size: 10px;
  font-weight: 700;
}
.sec-lab-heading h2 {
  margin: 4px 0 0;
  color: var(--focus-paper-ink);
  font-size: 18px;
}
.sec-lab-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex-wrap: wrap;
  color: #b45309;
}
.sec-lab-tools span {
  padding: 2px 6px;
  border: 1px solid rgba(180, 83, 9, .3);
  border-radius: 4px;
  background: color-mix(in srgb, #f59e0b 6%, var(--focus-paper));
  color: #92400e;
  font-size: 9px;
  font-weight: 500;
}
.sec-lab-commands {
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow-x: auto;
  border: 1px solid rgba(24, 35, 43, .16);
  border-radius: 6px;
  background: #15212a;
}
.sec-lab-commands code {
  padding: 8px 11px;
  color: #dce9e6;
  font: 11px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.sec-lab-stage ol {
  margin: 0;
  padding-left: 22px;
  color: var(--focus-paper-muted);
  font-size: 13px;
  line-height: 1.9;
}
.sec-lab-stage li + li { margin-top: 5px; }
.sec-lab-expected {
  margin: 0;
  padding: 13px 15px;
  border-left: 3px solid #0f766e;
  background: color-mix(in srgb, #0f766e 6%, var(--focus-paper));
  color: var(--focus-paper-muted);
  font-size: 12px;
  line-height: 1.75;
}
.sec-lab-expected b {
  display: block;
  margin-bottom: 3px;
  color: #0f766e;
  font-size: 10px;
}
.sec-check-stage {
  min-height: 330px;
}
.sec-check-stage h2 {
  max-width: 740px;
  margin: 18px 0 8px;
  font-size: clamp(20px, 2.3vw, 28px);
  line-height: 1.45;
}
.sec-reveal-answer {
  align-self: flex-start;
  margin-top: 8px;
  padding: 9px 14px;
  border: 1px solid #0f766e;
  border-radius: 6px;
  background: var(--focus-paper);
  color: #0f766e;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.sec-reveal-answer:hover { background: #0f766e; color: #fff; }
.sec-check-answer {
  margin-top: 8px;
  padding: 18px 20px;
  border-left: 3px solid #0f766e;
  background: color-mix(in srgb, #0f766e 6%, var(--focus-paper));
}
.sec-check-answer span {
  color: #0f766e;
  font-size: 10px;
  font-weight: 700;
}
.sec-check-answer p {
  margin: 7px 0 0;
  color: var(--focus-paper-ink);
  font-size: 14px;
  line-height: 1.9;
}
.sec-check-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: auto;
  padding-top: 18px;
}
.sec-check-nav button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 10px;
  border: 1px solid rgba(24, 35, 43, .16);
  border-radius: 5px;
  background: var(--focus-paper);
  color: var(--focus-paper-muted);
  font-size: 11px;
  cursor: pointer;
}
.sec-check-nav button:disabled { opacity: .35; cursor: not-allowed; }
.sec-focus-footer {
  flex: 0 0 68px;
  display: grid;
  grid-template-columns: auto minmax(180px, 380px) auto;
  align-items: center;
  justify-content: space-between;
  gap: 22px;
  padding: 0 clamp(24px, 5vw, 76px);
  border-top: 1px solid var(--focus-line);
  background: rgba(8, 16, 23, .96);
}
.sec-focus-footer button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 104px;
  min-height: 36px;
  padding: 6px 12px;
  border: 1px solid var(--focus-line);
  border-radius: 6px;
  background: var(--focus-panel);
  color: var(--focus-muted);
  font-size: 11px;
  cursor: pointer;
}
.sec-focus-footer button:disabled { opacity: .32; cursor: not-allowed; }
.sec-focus-footer .sec-focus-next {
  border-color: rgba(79, 209, 197, .45);
  background: rgba(79, 209, 197, .12);
  color: var(--focus-accent);
}
.sec-focus-progress {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
}
.sec-focus-progress > span {
  width: 100%;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(159, 179, 180, .16);
}
.sec-focus-progress i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--focus-accent);
  transition: width .2s ease;
}
.sec-focus-progress small {
  color: var(--focus-muted);
  font-size: 9px;
}
.sec-focus-complete {
  width: min(680px, calc(100% - 48px));
  margin: auto;
  padding: 46px;
  border: 1px solid var(--focus-line);
  border-radius: 8px;
  background: var(--focus-panel);
  text-align: center;
}
.sec-complete-mark {
  display: inline-grid;
  place-items: center;
  width: 68px;
  height: 68px;
  border: 1px solid rgba(79, 209, 197, .4);
  border-radius: 50%;
  background: rgba(79, 209, 197, .1);
  color: var(--focus-accent);
}
.sec-focus-complete > p {
  margin: 20px 0 5px;
  color: var(--focus-accent);
  font-size: 11px;
  font-weight: 700;
}
.sec-focus-complete h1 {
  margin: 0;
  color: var(--focus-ink);
  font-size: clamp(25px, 3vw, 36px);
}
.sec-focus-complete > span {
  display: block;
  max-width: 520px;
  margin: 12px auto 0;
  color: var(--focus-muted);
  font-size: 12px;
  line-height: 1.8;
}
.sec-complete-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 26px;
}
.sec-complete-actions button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 38px;
  padding: 7px 14px;
  border: 1px solid var(--focus-line);
  border-radius: 6px;
  background: var(--focus-panel-2);
  color: var(--focus-muted);
  font-size: 11px;
  cursor: pointer;
}
.sec-complete-actions button.primary {
  border-color: var(--focus-accent);
  background: var(--focus-accent);
  color: #06201d;
  font-weight: 700;
}

@media (max-width: 900px) {
  .sec-overview-head,
  .sec-module-browser { padding: 16px; }
  .sec-overview-title-row { gap: 16px; }
  .sec-module-card {
    grid-template-columns: 34px minmax(0, 1fr);
  }
  .sec-module-start {
    grid-column: 2;
    justify-self: start;
  }
  .sec-focus-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }
  .sec-focus-rail {
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 10px 14px;
    border-right: 0;
    border-bottom: 1px solid var(--focus-line);
  }
  .sec-focus-rail button {
    flex: 0 0 132px;
    min-height: 48px;
  }
  .sec-focus-rail button small { display: none; }
  .sec-focus-scroll { padding: 16px 12px 22px; }
  .sec-focus-sheet-head { padding: 21px 20px 18px; }
  .sec-focus-content { padding: 20px; }
  .sec-focus-footer {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    padding: 0 12px;
  }
  .sec-focus-footer button { min-width: 82px; padding: 6px 8px; }
  .sec-focus-progress small { display: none; }
  .sec-defense-grid { grid-template-columns: 1fr; }
  .sec-lab-heading { flex-direction: column; }
  .sec-lab-tools { justify-content: flex-start; }
}

@media (max-width: 620px) {
  .sec-overview-title-row { flex-direction: column; }
  .sec-progress { flex-direction: row; align-self: flex-start; }
  .sec-progress-ring { width: 46px; height: 46px; }
  .sec-progress-ring::before { width: 36px; height: 36px; }
  .sec-module-card {
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 13px;
  }
  .sec-module-number { font-size: 10px; }
  .sec-module-start { grid-column: 1; width: 100%; }
  .sec-focus-header {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
    padding: 0 10px;
  }
  .sec-focus-back { padding: 5px 7px; font-size: 0; }
  .sec-focus-crumb span,
  .sec-focus-crumb i { display: none; }
  .sec-focus-crumb b { font-size: 10px; }
  .sec-focus-header-actions > span { display: none; }
  .sec-focus-lead {
    grid-template-columns: 1fr;
    gap: 7px;
    padding: 14px;
  }
  .sec-focus-lead p { font-size: 15px; }
  .sec-reasoning-card {
    grid-template-columns: 1fr;
    gap: 12px;
    min-height: 0;
    padding: 19px;
  }
  .sec-reasoning-card h2 { font-size: 19px; }
  .sec-reasoning-card p { font-size: 14px; }
  .sec-focus-footer .sec-focus-prev {
    width: 38px;
    min-width: 38px;
    overflow: hidden;
    font-size: 0;
  }
  .sec-focus-footer .sec-focus-next {
    min-width: 94px;
  }
  .sec-complete-actions {
    flex-direction: column;
  }
  .sec-complete-actions button { justify-content: center; }
  .sec-focus-complete { padding: 30px 22px; }
}
</style>
