<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import {
  ArrowRight,
  BookOpen,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FlaskConical,
  GitBranch,
  ListOrdered,
  ShieldCheck,
  Target,
  Terminal,
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
const emit = defineEmits<{ 'select-path': [id: string] }>();
const PROGRESS_KEY = 'yz_security_progress_v1';
const paths = ref<SecurityPath[]>([]);
const loading = ref(true);
const error = ref('');
const expandedModule = ref('');
const activeStep = ref<StudyStepKey>('concept');
const reasoningIndex = ref(0);
const completed = ref<Record<string, boolean>>({});

function unwrap<T>(r: unknown): T | null {
  if (r && typeof r === 'object' && 'data' in r) return (r as { data: T }).data;
  return null;
}
function restoreProgress() {
  try { completed.value = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch { completed.value = {}; }
}
function persistProgress() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(completed.value)); } catch { /* ignore */ }
}
async function loadPaths() {
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get<{ data: SecurityPath[] }>('/learning/security/paths');
    paths.value = unwrap<SecurityPath[]>(r) || [];
    const active = activePath.value;
    expandedModule.value = active?.modules[0]?.id || '';
    activeStep.value = 'concept';
    reasoningIndex.value = 0;
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
const nextPaths = computed(() => activePath.value
  ? paths.value.filter((path) => activePath.value?.nextPathIds.includes(path.id))
  : []);
const completedCount = computed(() => activePath.value
  ? activePath.value.modules.filter((mod) => completed.value[mod.id]).length
  : 0);
const progressPct = computed(() => activePath.value
  ? Math.round((completedCount.value / Math.max(1, activePath.value.modules.length)) * 100)
  : 0);
function selectPath(id: string) {
  emit('select-path', id);
  const path = paths.value.find((item) => item.id === id);
  expandedModule.value = path?.modules[0]?.id || '';
  activeStep.value = 'concept';
  reasoningIndex.value = 0;
}
function toggleModule(id: string) {
  const opening = expandedModule.value !== id;
  expandedModule.value = opening ? id : '';
  if (opening) {
    activeStep.value = 'concept';
    reasoningIndex.value = 0;
  }
}
function setCompleted(id: string, value: boolean) {
  completed.value = { ...completed.value, [id]: value };
  persistProgress();
  ElMessage.success(value ? '模块已完成' : '已取消完成');
}
const expanded = computed(() => activePath.value?.modules.find((mod) => mod.id === expandedModule.value) || null);
const studySteps = computed<StudyStep[]>(() => {
  const mod = expanded.value;
  if (!mod) return [];
  const steps: StudyStep[] = [];
  if (mod.lesson || mod.useCase || mod.explanation) steps.push({ key: 'concept', label: '概念', hint: '目标与术语' });
  if (mod.lesson?.walkthrough.length) steps.push({ key: 'reasoning', label: '推导', hint: '跟着流程走一遍' });
  if (mod.risk || mod.control || mod.code) steps.push({ key: 'defense', label: '攻防', hint: '风险、控制与代码' });
  if (mod.lab) steps.push({ key: 'lab', label: '实验', hint: '本地靶场验证' });
  if (mod.lesson?.knowledgeChecks.length) steps.push({ key: 'check', label: '自测', hint: '先回答再看解析' });
  return steps;
});
const currentStepIndex = computed(() => Math.max(0, studySteps.value.findIndex((step) => step.key === activeStep.value)));
const currentStep = computed(() => studySteps.value[currentStepIndex.value] || null);
const isLastStep = computed(() => currentStepIndex.value >= studySteps.value.length - 1);
const reasoningSteps = computed(() => expanded.value?.lesson?.walkthrough || []);
const currentReasoningStep = computed(() => reasoningSteps.value[reasoningIndex.value] || null);
function selectStep(key: StudyStepKey) {
  activeStep.value = key;
}
function selectReasoning(index: number) {
  reasoningIndex.value = Math.min(Math.max(index, 0), Math.max(0, reasoningSteps.value.length - 1));
}
function moveReasoning(direction: -1 | 1) {
  selectReasoning(reasoningIndex.value + direction);
}
function moveStep(direction: -1 | 1) {
  if (!expanded.value || !studySteps.value.length) return;
  const nextIndex = currentStepIndex.value + direction;
  if (nextIndex < 0) return;
  if (nextIndex >= studySteps.value.length) {
    setCompleted(expanded.value.id, true);
    return;
  }
  activeStep.value = studySteps.value[nextIndex].key;
}

watch(() => props.pathId, () => {
  expandedModule.value = activePath.value?.modules[0]?.id || '';
  activeStep.value = 'concept';
  reasoningIndex.value = 0;
});
watch(studySteps, (steps) => {
  if (steps.length && !steps.some((step) => step.key === activeStep.value)) activeStep.value = steps[0].key;
}, { immediate: true });
watch(reasoningSteps, (steps) => {
  if (reasoningIndex.value >= steps.length) reasoningIndex.value = Math.max(0, steps.length - 1);
});
watch(completed, persistProgress, { deep: true });
onMounted(() => {
  restoreProgress();
  void loadPaths();
});
</script>

<template>
  <section class="sec-workbench">
    <div v-if="loading" class="sec-loading">正在加载安全路线…</div>
    <div v-else-if="error" class="sec-error">{{ error }}</div>
    <template v-else-if="activePath">
      <header class="sec-hero">
        <div>
          <p class="sec-eyebrow">网络安全 · 独立科目</p>
          <h2>{{ activePath.name }}</h2>
          <p>{{ activePath.description }}</p>
        </div>
        <div class="sec-progress">
          <div class="sec-progress-ring" :style="{ '--pct': progressPct + '%' }"><b>{{ progressPct }}%</b></div>
          <span>{{ completedCount }} / {{ activePath.modules.length }} 模块</span>
        </div>
      </header>

      <div class="sec-branch-map" aria-label="安全分支路线">
        <button
          v-for="(path, index) in paths" :key="path.id"
          :class="{ active: path.id === activePath.id }"
          @click="selectPath(path.id)"
        >
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          <b>{{ path.name }}</b>
          <i>{{ path.level }}</i>
          <ArrowRight v-if="index < paths.length - 1" :size="13" />
        </button>
      </div>

      <div class="sec-meta-row">
        <span><GitBranch :size="13" /> 先修：{{ prerequisites.length ? prerequisites.map((p) => p.name).join('、') : '无' }}</span>
        <span><ShieldCheck :size="13" /> 适合：{{ activePath.audience }}</span>
        <span v-for="tag in activePath.tags" :key="tag" class="sec-tag">{{ tag }}</span>
      </div>

      <details v-if="activePath.glossary?.length" class="sec-glossary">
        <summary>
          <span><BookOpen :size="15" /> 本路线专业名词</span>
          <b>{{ activePath.glossary.length }} 个</b>
          <ChevronDown :size="15" />
        </summary>
        <div class="sec-glossary-grid">
          <article v-for="item in activePath.glossary" :key="item.term">
            <div>
              <strong>{{ item.term }}</strong>
              <small v-if="item.fullName">{{ item.fullName }}</small>
            </div>
            <p>{{ item.explanation }}</p>
          </article>
        </div>
      </details>

      <div class="sec-modules">
        <article v-for="(mod, index) in activePath.modules" :key="mod.id" class="sec-module" :class="{ expanded: expandedModule === mod.id }">
          <header>
            <label class="sec-module-check" title="标记完成" @click.stop>
              <input type="checkbox" :checked="!!completed[mod.id]" @change="setCompleted(mod.id, ($event.target as HTMLInputElement).checked)" />
              <CheckCircle2 :size="16" />
            </label>
            <button class="sec-module-head" @click="toggleModule(mod.id)">
              <span>{{ String(index + 1).padStart(2, '0') }}</span>
              <div><b>{{ mod.title }}</b><p>{{ mod.summary }}</p></div>
              <ChevronDown :size="16" />
            </button>
          </header>

          <div v-if="expandedModule === mod.id" class="sec-module-body">
            <div class="sec-topics">
              <span v-for="topic in mod.topics" :key="topic">{{ topic }}</span>
            </div>
            <nav class="sec-step-nav" aria-label="模块学习步骤">
              <button
                v-for="(step, stepIndex) in studySteps"
                :key="step.key"
                type="button"
                :class="{ active: activeStep === step.key }"
                :aria-current="activeStep === step.key ? 'step' : undefined"
                @click="selectStep(step.key)"
              >
                <span>{{ String(stepIndex + 1).padStart(2, '0') }}</span>
                <b>{{ step.label }}</b>
                <small>{{ step.hint }}</small>
              </button>
            </nav>

            <div class="sec-step-stage" aria-live="polite">
              <template v-if="activeStep === 'concept' && mod.lesson">
                <section class="sec-lesson">
                  <header><Target :size="15" /><h3>本节目标</h3></header>
                  <ul>
                    <li v-for="objective in mod.lesson.objectives" :key="objective">
                      <CheckCircle2 :size="13" />
                      <span>{{ objective }}</span>
                    </li>
                  </ul>
                  <div v-if="mod.lesson.keyTerms.length" class="sec-terms">
                    <div class="sec-term-featured">
                      <b>{{ mod.lesson.keyTerms[0].term }}</b>
                      <em v-if="mod.lesson.keyTerms[0].fullName">{{ mod.lesson.keyTerms[0].fullName }}</em>
                      <span>{{ mod.lesson.keyTerms[0].explanation }}</span>
                    </div>
                    <div v-if="mod.lesson.keyTerms.length > 1" class="sec-term-chips">
                      <details v-for="item in mod.lesson.keyTerms.slice(1)" :key="item.term">
                        <summary>{{ item.term }}</summary>
                        <div>
                          <em v-if="item.fullName">{{ item.fullName }}</em>
                          <p>{{ item.explanation }}</p>
                        </div>
                      </details>
                    </div>
                  </div>
                </section>
              </template>
              <div v-if="activeStep === 'concept'" class="sec-context-grid">
                <section v-if="mod.useCase"><h3>先看场景</h3><p>{{ mod.useCase }}</p></section>
                <section v-if="mod.explanation"><h3>为什么会这样</h3><p>{{ mod.explanation }}</p></section>
              </div>

              <section v-if="activeStep === 'reasoning' && mod.lesson" class="sec-walkthrough">
                <header>
                  <ListOrdered :size="15" />
                  <h3>跟着推导一遍</h3>
                  <div class="sec-walkthrough-nav">
                    <button type="button" :disabled="reasoningIndex === 0" aria-label="上一条推导" @click="moveReasoning(-1)">
                      <ChevronLeft :size="13" />
                    </button>
                    <span>{{ reasoningIndex + 1 }} / {{ reasoningSteps.length }}</span>
                    <button type="button" :disabled="reasoningIndex >= reasoningSteps.length - 1" aria-label="下一条推导" @click="moveReasoning(1)">
                      <ChevronRight :size="13" />
                    </button>
                  </div>
                </header>
                <article v-if="currentReasoningStep" class="sec-walkthrough-focus">
                  <span>{{ String(reasoningIndex + 1).padStart(2, '0') }}</span>
                  <div><b>{{ currentReasoningStep.title }}</b><p>{{ currentReasoningStep.detail }}</p></div>
                </article>
                <div class="sec-walkthrough-dots" aria-label="推导步骤导航">
                  <button
                    v-for="(step, stepIndex) in reasoningSteps"
                    :key="step.title"
                    type="button"
                    :class="{ active: reasoningIndex === stepIndex }"
                    :aria-label="step.title"
                    :aria-current="reasoningIndex === stepIndex ? 'step' : undefined"
                    @click="selectReasoning(stepIndex)"
                  />
                </div>
              </section>

              <template v-if="activeStep === 'defense'">
                <div class="sec-risk-grid">
                  <section class="attack">
                    <h3><Bug :size="14" /> 风险如何发生</h3>
                    <p>{{ mod.risk }}</p>
                  </section>
                  <section class="defense">
                    <h3><ShieldCheck :size="14" /> 控制如何阻断</h3>
                    <p>{{ mod.control }}</p>
                  </section>
                </div>
                <SecurityCodeExample v-if="mod.code" v-bind="mod.code" />
              </template>

              <section v-if="activeStep === 'lab' && mod.lab" class="sec-lab">
                <header><FlaskConical :size="15" /><b>授权靶场实验</b><span>{{ mod.lab.target }}</span></header>
                <div class="sec-lab-tools">
                  <Terminal :size="13" />
                  <span v-for="tool in mod.lab.tools" :key="tool">{{ tool }}</span>
                </div>
                <div v-if="mod.lab.commands?.length" class="sec-lab-commands">
                  <code v-for="command in mod.lab.commands" :key="command">{{ command }}</code>
                </div>
                <ol>
                  <li v-for="step in mod.lab.steps" :key="step">{{ step }}</li>
                </ol>
                <p><b>验收：</b>{{ mod.lab.expected }}</p>
              </section>

              <section v-if="activeStep === 'check' && mod.lesson?.knowledgeChecks.length" class="sec-self-check">
                <header>
                  <div><CircleHelp :size="15" /><h3>学完自测</h3></div>
                  <span>先自己在纸上回答，再展开对照</span>
                </header>
                <details v-for="(check, checkIndex) in mod.lesson.knowledgeChecks" :key="check.question">
                  <summary><b>{{ checkIndex + 1 }}.</b> {{ check.question }}</summary>
                  <p>{{ check.answer }}</p>
                </details>
              </section>
            </div>

            <footer v-if="studySteps.length" class="sec-step-footer">
              <button type="button" class="sec-step-prev" :disabled="currentStepIndex === 0" @click="moveStep(-1)">
                <ChevronLeft :size="14" /> 上一步
              </button>
              <span class="sec-step-progress">
                <b>{{ currentStepIndex + 1 }} / {{ studySteps.length }}</b>
                {{ currentStep?.label }}
              </span>
              <button type="button" class="sec-step-next" @click="moveStep(1)">
                {{ isLastStep ? '完成本节' : '下一步' }}
                <CheckCircle2 v-if="isLastStep" :size="14" />
                <ChevronRight v-else :size="14" />
              </button>
            </footer>
          </div>
        </article>
      </div>

      <footer v-if="nextPaths.length" class="sec-next">
        <span>完成后进入分支</span>
        <button v-for="path in nextPaths" :key="path.id" @click="selectPath(path.id)">
          {{ path.name }} <ArrowRight :size="14" />
        </button>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.sec-workbench { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.sec-loading, .sec-error { min-height: 240px; display: flex; align-items: center; justify-content: center; color: var(--color-text-tertiary); }
.sec-error { color: var(--color-danger); }
.sec-hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border: 1px solid var(--lp-border, var(--color-border)); border-radius: 10px; background: var(--lp-surface, var(--glass-bg)); padding: 16px; }
.sec-eyebrow { margin: 0; color: var(--lp-primary, var(--color-primary)); font-size: 10px; font-weight: 700; letter-spacing: .4px; }
.sec-hero h2 { margin: 3px 0 4px; font-size: 20px; color: var(--color-text); }
.sec-hero p:last-child { margin: 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.6; }
.sec-progress { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--color-text-tertiary); font-size: 10px; flex-shrink: 0; }
.sec-progress-ring { width: 58px; height: 58px; border-radius: 50%; background: conic-gradient(var(--lp-primary, var(--color-primary)) var(--pct), color-mix(in srgb, var(--lp-primary, var(--color-primary)) 16%, var(--lp-surface, var(--glass-bg))) 0); display: grid; place-items: center; }
.sec-progress-ring::before { content: ""; grid-area: 1 / 1; width: 44px; height: 44px; border-radius: 50%; background: var(--lp-surface, var(--glass-bg)); }
.sec-progress-ring b { grid-area: 1 / 1; z-index: 1; color: var(--lp-primary, var(--color-primary)); font-size: 12px; }
.sec-branch-map { display: flex; gap: 6px; overflow-x: auto; padding: 2px 0 5px; }
.sec-branch-map button { position: relative; min-width: 164px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--glass-bg); color: var(--color-text-secondary); padding: 8px 24px 8px 9px; display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 1px 5px; text-align: left; cursor: pointer; }
.sec-branch-map button > span { grid-row: 1 / 3; align-self: center; color: var(--lp-text-tertiary, var(--color-text-tertiary)); font-size: 11px; font-weight: 700; }
.sec-branch-map b { font-size: 11px; color: var(--color-text); white-space: nowrap; }
.sec-branch-map i { font-style: normal; font-size: 9px; color: var(--color-text-tertiary); }
.sec-branch-map button > svg { position: absolute; right: 5px; top: 50%; transform: translateY(-50%); color: var(--color-text-tertiary); }
.sec-branch-map button.active { border-color: var(--lp-primary, var(--color-primary)); background: var(--lp-primary-soft, color-mix(in srgb, var(--color-primary) 13%, var(--glass-bg))); box-shadow: inset 3px 0 0 var(--lp-primary, var(--color-primary)); }
.sec-branch-map button.active > span, .sec-branch-map button.active b { color: var(--lp-primary, var(--color-primary)); }
.sec-meta-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; color: var(--color-text-tertiary); font-size: 10px; }
.sec-meta-row > span { display: inline-flex; align-items: center; gap: 3px; }
.sec-tag { border: 1px solid color-mix(in srgb, var(--lp-primary, var(--color-primary)) 35%, var(--lp-border, var(--color-border))); border-radius: 999px; background: var(--lp-primary-soft, color-mix(in srgb, var(--color-primary) 13%, var(--glass-bg))); color: var(--lp-primary, var(--color-primary)); padding: 1px 6px; }
.sec-glossary { border: 1px solid var(--color-border); border-radius: 8px; background: var(--glass-bg); overflow: hidden; }
.sec-glossary summary { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; align-items: center; gap: 7px; padding: 9px 10px; color: var(--color-text); cursor: pointer; list-style: none; }
.sec-glossary summary::-webkit-details-marker { display: none; }
.sec-glossary summary > span { display: inline-flex; align-items: center; gap: 6px; color: var(--lp-primary, var(--color-primary)); font-size: 12px; font-weight: 700; }
.sec-glossary summary > b { border-radius: 999px; background: var(--lp-primary-soft, color-mix(in srgb, var(--color-primary) 13%, var(--glass-bg))); color: var(--lp-primary, var(--color-primary)); padding: 1px 6px; font-size: 10px; }
.sec-glossary summary > svg { justify-self: end; color: var(--color-text-tertiary); transition: transform .15s ease; }
.sec-glossary[open] summary > svg { transform: rotate(180deg); }
.sec-glossary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 12px; border-top: 1px solid var(--color-border); padding: 4px 10px 8px; }
.sec-glossary-grid article { min-width: 0; border-bottom: 1px dashed var(--color-border); padding: 7px 0; }
.sec-glossary-grid article > div { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.sec-glossary-grid strong { color: var(--lp-primary, var(--color-primary)); font-size: 11px; }
.sec-glossary-grid small { color: var(--color-text-tertiary); font-size: 9px; line-height: 1.4; }
.sec-glossary-grid p { margin: 3px 0 0; color: var(--color-text-secondary); font-size: 11px; line-height: 1.65; }
.sec-modules { display: flex; flex-direction: column; gap: 8px; }
.sec-module { border: 1px solid var(--color-border); border-radius: 9px; background: var(--glass-bg); overflow: hidden; }
.sec-module.expanded { border-color: var(--lp-primary, var(--color-primary)); }
.sec-module > header { display: flex; align-items: stretch; }
.sec-module-check { width: 42px; display: flex; align-items: center; justify-content: center; color: var(--lp-text-tertiary, var(--color-text-tertiary)); cursor: pointer; border-right: 1px solid var(--color-border); }
.sec-module-check input { position: absolute; opacity: 0; pointer-events: none; }
.sec-module-check:has(input:checked) { color: var(--lp-primary, var(--color-primary)); background: var(--lp-primary-soft, color-mix(in srgb, var(--color-primary) 13%, var(--glass-bg))); }
.sec-module-head { flex: 1; display: grid; grid-template-columns: 28px minmax(0, 1fr) 20px; align-items: center; gap: 7px; border: 0; background: transparent; color: var(--color-text); text-align: left; padding: 10px; cursor: pointer; }
.sec-module-head > span { color: var(--lp-text-tertiary, var(--color-text-tertiary)); font-size: 11px; font-weight: 700; }
.sec-module-head b { font-size: 13px; }
.sec-module-head p { margin: 2px 0 0; color: var(--color-text-tertiary); font-size: 11px; line-height: 1.5; }
.sec-module-head > svg { transition: transform .15s ease; color: var(--color-text-tertiary); }
.sec-module.expanded .sec-module-head > svg { transform: rotate(180deg); }
.sec-module-body { display: flex; flex-direction: column; gap: 10px; padding: 0 12px 12px 50px; }
.sec-topics { display: flex; gap: 5px; flex-wrap: wrap; }
.sec-topics span { border: 1px solid var(--lp-border, var(--color-border)); border-radius: 4px; background: var(--lp-surface-hover, var(--glass-bg-hover)); color: var(--lp-text-secondary, var(--color-text-secondary)); padding: 2px 6px; font-size: 10px; }
.sec-step-nav { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border: 1px solid var(--color-border); border-radius: 8px; background: var(--lp-surface, var(--glass-bg)); overflow: hidden; }
.sec-step-nav button { min-width: 0; display: grid; grid-template-columns: 23px minmax(0, 1fr); gap: 1px 5px; border: 0; border-right: 1px solid var(--color-border); background: transparent; color: var(--color-text-secondary); padding: 7px 8px; text-align: left; cursor: pointer; }
.sec-step-nav button:last-child { border-right: 0; }
.sec-step-nav button > span { grid-row: 1 / 3; align-self: center; color: var(--color-text-tertiary); font-size: 10px; font-weight: 700; }
.sec-step-nav button b { overflow: hidden; color: var(--color-text); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.sec-step-nav button small { overflow: hidden; color: var(--color-text-tertiary); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.sec-step-nav button.active { background: var(--lp-primary-soft, color-mix(in srgb, var(--color-primary) 13%, var(--glass-bg))); box-shadow: inset 0 -2px 0 var(--lp-primary, var(--color-primary)); }
.sec-step-nav button.active > span, .sec-step-nav button.active b { color: var(--lp-primary, var(--color-primary)); }
.sec-step-stage { display: flex; flex-direction: column; gap: 8px; min-height: 220px; }
.sec-lesson { border: 1px solid color-mix(in srgb, var(--lp-primary, var(--color-primary)) 38%, var(--lp-border, var(--color-border))); border-radius: 8px; background: color-mix(in srgb, var(--lp-primary, var(--color-primary)) 8%, var(--lp-surface, var(--glass-bg))); padding: 10px; }
.sec-lesson > header, .sec-walkthrough > header, .sec-self-check > header > div { display: flex; align-items: center; gap: 6px; color: var(--lp-primary, var(--color-primary)); }
.sec-lesson h3, .sec-walkthrough h3, .sec-self-check h3 { margin: 0; color: var(--color-text); font-size: 13px; }
.sec-lesson ul { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 5px 14px; margin: 8px 0; padding: 0; }
.sec-lesson li { display: flex; align-items: flex-start; gap: 5px; color: var(--color-text-secondary); font-size: 12px; line-height: 1.7; }
.sec-lesson li > svg { flex: 0 0 auto; margin-top: 1px; color: var(--lp-primary, var(--color-primary)); }
.sec-terms { display: flex; flex-direction: column; gap: 7px; border-top: 1px solid color-mix(in srgb, var(--lp-primary, var(--color-primary)) 24%, var(--lp-border, var(--color-border))); padding-top: 8px; }
.sec-term-featured { border-left: 2px solid color-mix(in srgb, var(--lp-primary, var(--color-primary)) 58%, var(--lp-border, var(--color-border))); padding-left: 8px; }
.sec-term-featured b { display: block; color: var(--lp-primary, var(--color-primary)); font-size: 11px; }
.sec-term-featured em { display: block; margin-top: 1px; color: var(--color-text-tertiary); font-size: 9px; font-style: normal; line-height: 1.45; }
.sec-term-featured span { display: block; margin-top: 2px; color: var(--color-text-secondary); font-size: 11px; line-height: 1.65; }
.sec-term-chips { display: flex; align-items: flex-start; gap: 5px; flex-wrap: wrap; }
.sec-term-chips details { max-width: 100%; border: 1px solid color-mix(in srgb, var(--lp-primary, var(--color-primary)) 22%, var(--lp-border, var(--color-border))); border-radius: 5px; background: var(--lp-surface, var(--glass-bg)); }
.sec-term-chips summary { padding: 3px 7px; color: var(--color-text-secondary); font-size: 10px; font-weight: 600; line-height: 1.5; cursor: pointer; }
.sec-term-chips details[open] { flex-basis: 100%; }
.sec-term-chips details > div { border-top: 1px solid var(--color-border); padding: 5px 7px 6px; }
.sec-term-chips em { display: block; color: var(--color-text-tertiary); font-size: 9px; font-style: normal; line-height: 1.45; }
.sec-term-chips p { margin: 2px 0 0; color: var(--color-text-secondary); font-size: 11px; line-height: 1.65; }
.sec-context-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sec-context-grid section { border: 1px solid var(--color-border); border-radius: 7px; background: var(--glass-bg); padding: 8px 9px; }
.sec-context-grid h3 { margin: 0 0 4px; color: var(--color-text); font-size: 12px; }
.sec-context-grid p { margin: 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.75; }
.sec-risk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sec-risk-grid section { border-left: 3px solid; padding: 8px 9px; background: var(--lp-surface, var(--glass-bg)); }
.sec-risk-grid .attack { border-color: var(--color-warning); background: color-mix(in srgb, var(--color-warning) 10%, var(--lp-surface, var(--glass-bg))); }
.sec-risk-grid .defense { border-color: var(--lp-primary, var(--color-primary)); background: color-mix(in srgb, var(--lp-primary, var(--color-primary)) 8%, var(--lp-surface, var(--glass-bg))); }
.sec-risk-grid h3 { display: flex; align-items: center; gap: 5px; margin: 0 0 4px; font-size: 12px; }
.sec-risk-grid p { margin: 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.75; }
.sec-walkthrough { border: 1px solid var(--lp-border, var(--color-border)); border-radius: 8px; background: var(--lp-surface-hover, var(--glass-bg-hover)); padding: 10px; }
.sec-walkthrough-nav { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; color: var(--color-text-tertiary); font-size: 9px; }
.sec-walkthrough-nav button { display: inline-grid; place-items: center; width: 24px; height: 22px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--lp-surface, var(--glass-bg)); color: var(--color-text-secondary); cursor: pointer; }
.sec-walkthrough-nav button:disabled { opacity: .35; cursor: not-allowed; }
.sec-walkthrough-focus { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 8px; margin-top: 8px; border-top: 1px dashed var(--lp-border, var(--color-border)); padding-top: 9px; }
.sec-walkthrough-focus > span { display: inline-flex; align-items: center; justify-content: center; align-self: start; width: 26px; height: 20px; border-radius: 4px; background: var(--lp-primary-soft, color-mix(in srgb, var(--color-primary) 13%, var(--glass-bg))); color: var(--lp-primary, var(--color-primary)); font-size: 9px; font-weight: 700; }
.sec-walkthrough b { display: block; color: var(--color-text); font-size: 12px; }
.sec-walkthrough-focus p { margin: 4px 0 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.8; }
.sec-walkthrough-dots { display: flex; align-items: center; justify-content: center; gap: 5px; margin-top: 9px; }
.sec-walkthrough-dots button { width: 18px; height: 4px; border: 0; border-radius: 999px; background: var(--color-border); padding: 0; cursor: pointer; }
.sec-walkthrough-dots button.active { width: 28px; background: var(--lp-primary, var(--color-primary)); }
.sec-lab { border: 1px dashed color-mix(in srgb, var(--color-warning) 62%, var(--lp-border, var(--color-border))); border-radius: 8px; background: color-mix(in srgb, var(--color-warning) 10%, var(--lp-surface, var(--glass-bg))); padding: 9px 10px; }
.sec-lab > header { display: flex; align-items: center; gap: 5px; color: var(--color-warning); }
.sec-lab > header b { font-size: 12px; }
.sec-lab > header span { margin-left: auto; color: var(--color-warning); font-size: 11px; }
.sec-lab-tools { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin: 6px 0; color: var(--color-warning); }
.sec-lab-tools span { border: 1px solid color-mix(in srgb, var(--color-warning) 42%, var(--lp-border, var(--color-border))); border-radius: 4px; background: var(--lp-surface, var(--glass-bg)); padding: 1px 5px; font-size: 10px; }
.sec-lab-commands { display: flex; flex-direction: column; gap: 1px; margin: 7px 0; border: 1px solid var(--lp-border-strong, var(--color-border-strong)); border-radius: 6px; background: color-mix(in srgb, var(--color-bg) 90%, var(--lp-primary, var(--color-primary))); overflow-x: auto; }
.sec-lab-commands code { display: block; min-width: 0; padding: 6px 8px; color: var(--color-text); font: 11px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.sec-lab ol { margin: 6px 0 8px; padding-left: 20px; color: var(--lp-text-secondary, var(--color-text-secondary)); font-size: 12px; line-height: 1.75; }
.sec-lab > p { margin: 0; color: var(--color-warning); font-size: 11px; line-height: 1.7; }
.sec-self-check { border: 1px solid var(--color-border); border-radius: 8px; background: var(--glass-bg); padding: 10px; }
.sec-self-check > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
.sec-self-check > header > span { color: var(--color-text-tertiary); font-size: 10px; }
.sec-self-check details { border-top: 1px solid var(--color-border); padding: 7px 0; }
.sec-self-check summary { color: var(--color-text); font-size: 12px; line-height: 1.65; cursor: pointer; }
.sec-self-check details p { margin: 7px 0 0 18px; color: var(--color-text-secondary); font-size: 12px; line-height: 1.8; }
.sec-step-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; border-top: 1px solid var(--color-border); padding-top: 9px; }
.sec-step-footer button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 92px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--lp-surface, var(--glass-bg)); color: var(--color-text-secondary); padding: 5px 9px; font-size: 11px; cursor: pointer; }
.sec-step-footer button:disabled { opacity: .45; cursor: not-allowed; }
.sec-step-footer .sec-step-next { border-color: color-mix(in srgb, var(--lp-primary, var(--color-primary)) 45%, var(--lp-border, var(--color-border))); background: var(--lp-primary-soft, color-mix(in srgb, var(--color-primary) 13%, var(--glass-bg))); color: var(--lp-primary, var(--color-primary)); }
.sec-step-progress { display: flex; align-items: baseline; gap: 5px; color: var(--color-text-tertiary); font-size: 10px; }
.sec-step-progress b { color: var(--color-text); font-size: 11px; }
.sec-next { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; border-top: 1px solid var(--color-border); padding-top: 9px; }
.sec-next > span { color: var(--color-text-tertiary); font-size: 10px; }
.sec-next button { border: 1px solid color-mix(in srgb, var(--lp-primary, var(--color-primary)) 35%, var(--lp-border, var(--color-border))); border-radius: 6px; background: var(--lp-primary-soft, color-mix(in srgb, var(--color-primary) 13%, var(--glass-bg))); color: var(--lp-primary, var(--color-primary)); padding: 4px 8px; font-size: 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
@media (max-width: 900px) {
  .sec-hero { flex-direction: column; }
  .sec-risk-grid { grid-template-columns: 1fr; }
  .sec-context-grid { grid-template-columns: 1fr; }
  .sec-lesson ul { grid-template-columns: 1fr; }
  .sec-glossary-grid { grid-template-columns: 1fr; }
  .sec-glossary summary { grid-template-columns: auto auto minmax(0, 1fr) auto; }
  .sec-step-nav { display: flex; overflow-x: auto; }
  .sec-step-nav button { flex: 0 0 126px; }
  .sec-step-stage { min-height: 0; }
  .sec-step-footer { flex-wrap: wrap; }
  .sec-step-progress { order: -1; width: 100%; justify-content: center; }
  .sec-self-check > header { align-items: flex-start; flex-direction: column; gap: 3px; }
  .sec-module-body { padding-left: 12px; }
  .sec-lab > header { align-items: flex-start; flex-wrap: wrap; }
  .sec-lab > header span { width: 100%; margin-left: 20px; }
}
</style>
