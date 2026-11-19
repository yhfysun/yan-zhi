<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FolderKanban,
  GitBranch,
  Layers3,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  Workflow,
} from 'lucide-vue-next';
import type {
  ProgrammingProject,
  ProgrammingProjectKind,
  ProgrammingProjectPhase,
} from '@yan-zhi/shared';
import ProgrammingEnvironmentPanel from './ProgrammingEnvironmentPanel.vue';

const props = defineProps<{
  projects: readonly ProgrammingProject[];
}>();
const emit = defineEmits<{
  openLesson: [courseName: string];
}>();

const PROJECT_STATE_KEY = 'yz.learning.programming.project.v1';
const restored = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(PROJECT_STATE_KEY) || '{}') as {
      projectId?: string;
      filter?: ProgrammingProjectKind | 'all';
    };
    const project = props.projects.find((item) => item.id === saved.projectId);
    const filter = saved.filter || 'all';
    return {
      projectId: project?.id || '',
      filter: filter === 'all' || props.projects.some((item) => item.kind === filter)
        ? filter
        : 'all' as const,
    };
  } catch {
    return { projectId: '', filter: 'all' as const };
  }
})();

const selectedProjectId = ref(restored.projectId);
const activeFilter = ref<ProgrammingProjectKind | 'all'>(restored.filter);
const root = ref<HTMLElement | null>(null);
const selectedProject = computed(() =>
  props.projects.find((project) => project.id === selectedProjectId.value) || null,
);
const projectKinds = computed(() => {
  const seen = new Map<ProgrammingProjectKind, string>();
  for (const project of props.projects) {
    if (!seen.has(project.kind)) seen.set(project.kind, project.kindLabel);
  }
  return [...seen.entries()].map(([kind, label]) => ({ kind, label }));
});
const filteredProjects = computed(() =>
  activeFilter.value === 'all'
    ? props.projects
    : props.projects.filter((project) => project.kind === activeFilter.value),
);
const phaseCount = computed(() =>
  props.projects.reduce((sum, project) => sum + project.phases.length, 0),
);

function saveState(): void {
  try {
    localStorage.setItem(PROJECT_STATE_KEY, JSON.stringify({
      projectId: selectedProjectId.value,
      filter: activeFilter.value,
    }));
  } catch {
    // Project navigation remains usable when storage is unavailable.
  }
}

function selectFilter(filter: ProgrammingProjectKind | 'all'): void {
  activeFilter.value = filter;
  saveState();
}

async function scrollToTop(): Promise<void> {
  await nextTick();
  const workspace = root.value?.closest('.lv2-workspace') as HTMLElement | null;
  if (workspace) workspace.scrollTop = 0;
}

function openProject(projectId: string): void {
  selectedProjectId.value = projectId;
  saveState();
  void scrollToTop();
}

function closeProject(): void {
  selectedProjectId.value = '';
  saveState();
  void scrollToTop();
}

function openPhase(phase: ProgrammingProjectPhase): void {
  emit('openLesson', phase.courseName);
}

function startProject(project: ProgrammingProject): void {
  const first = project.phases[0];
  if (first) openPhase(first);
}
</script>

<template>
  <section ref="root" class="programming-project-hub" aria-labelledby="programming-project-title">
    <template v-if="!selectedProject">
      <header class="programming-project-head">
        <div>
          <span>综合训练 · 企业项目工坊</span>
          <h1 id="programming-project-title">从一句需求开始，做完一条真实工程链</h1>
          <p>项目按需求、契约、数据、前后端、质量、部署和运维推进。每个阶段都是独立课时，退出后回到项目主线。</p>
        </div>
        <div class="programming-project-summary">
          <b>{{ projects.length }}</b>
          <span>项目主线</span>
          <small>{{ phaseCount }} 个训练阶段</small>
        </div>
      </header>

      <div class="programming-project-loop" aria-label="项目交付闭环">
        <span><Target :size="15" />需求与验收</span>
        <ArrowRight :size="14" />
        <span><GitBranch :size="15" />契约与数据</span>
        <ArrowRight :size="14" />
        <span><Boxes :size="15" />前后端实现</span>
        <ArrowRight :size="14" />
        <span><ShieldCheck :size="15" />测试与安全</span>
        <ArrowRight :size="14" />
        <span><Workflow :size="15" />发布与运维</span>
      </div>

      <nav class="programming-project-filters" aria-label="项目类型筛选">
        <button
          type="button"
          data-project-filter="all"
          :class="{ active: activeFilter === 'all' }"
          @click="selectFilter('all')"
        >
          全部 {{ projects.length }}
        </button>
        <button
          v-for="item in projectKinds"
          :key="item.kind"
          type="button"
          :data-project-filter="item.kind"
          :class="{ active: activeFilter === item.kind }"
          @click="selectFilter(item.kind)"
        >
          {{ item.label }}
        </button>
      </nav>

      <ProgrammingEnvironmentPanel />

      <div class="programming-project-grid">
        <button
          v-for="project in filteredProjects"
          :key="project.id"
          type="button"
          class="programming-project-card"
          :data-programming-project="project.id"
          @click="openProject(project.id)"
        >
          <span class="programming-project-icon"><Rocket :size="19" /></span>
          <span class="programming-project-copy">
            <span class="programming-project-meta">
              <i>{{ project.kindLabel }}</i>
              <i>{{ project.level }}</i>
              <i>{{ project.duration }}</i>
            </span>
            <strong>{{ project.shortTitle }}</strong>
            <small>{{ project.summary }}</small>
            <span class="programming-project-stack">
              <i v-for="item in project.stack.slice(0, 5)" :key="item">{{ item }}</i>
            </span>
            <span class="programming-project-highlights">
              <em v-for="item in project.highlights.slice(0, 3)" :key="item">
                <Sparkles :size="11" />{{ item }}
              </em>
            </span>
          </span>
          <span class="programming-project-side">
            <b>{{ project.phases.length }}</b>
            <small>阶段</small>
            <ChevronRight :size="17" />
          </span>
        </button>
      </div>
    </template>

    <template v-else>
      <header class="programming-project-detail-head">
        <button type="button" class="programming-project-back" @click="closeProject">
          <ArrowLeft :size="16" />全部项目
        </button>
        <div class="programming-project-detail-title">
          <span>{{ selectedProject.kindLabel }} · {{ selectedProject.level }} · {{ selectedProject.duration }}</span>
          <h1>{{ selectedProject.title }}</h1>
          <p>{{ selectedProject.summary }}</p>
        </div>
        <button type="button" class="programming-project-start" @click="startProject(selectedProject)">
          <Rocket :size="16" />从第 1 步开始
        </button>
      </header>

      <div class="programming-project-brief">
        <article class="programming-project-why">
          <span><Sparkles :size="15" />项目价值</span>
          <p>{{ selectedProject.whyNow }}</p>
        </article>
        <dl>
          <div><dt>前置能力</dt><dd>{{ selectedProject.prerequisites.join('；') }}</dd></div>
          <div><dt>技术栈</dt><dd>{{ selectedProject.stack.join(' · ') }}</dd></div>
          <div><dt>运行架构</dt><dd>{{ selectedProject.architecture }}</dd></div>
          <div><dt>毕业交付</dt><dd>{{ selectedProject.deliverables.join('；') }}</dd></div>
          <div><dt>验收指标</dt><dd>{{ selectedProject.metrics.join('；') }}</dd></div>
        </dl>
      </div>

      <ProgrammingEnvironmentPanel :project="selectedProject" />

      <section class="programming-project-capabilities" aria-label="项目能力产出">
        <header>
          <span><Target :size="16" />毕业能力</span>
          <small>{{ selectedProject.outcomes.length }} 项可验收产出</small>
        </header>
        <ul>
          <li v-for="outcome in selectedProject.outcomes" :key="outcome">
            <CheckCircle2 :size="14" />{{ outcome }}
          </li>
        </ul>
      </section>

      <section class="programming-project-pipeline" aria-label="项目运行图">
        <header>
          <div><Workflow :size="17" /><b>项目运行图</b></div>
          <span>{{ selectedProject.pipeline.length }} 个交付关口</span>
        </header>
        <ol>
          <li v-for="(step, index) in selectedProject.pipeline" :key="step">
            <i>{{ String(index + 1).padStart(2, '0') }}</i>
            <b>{{ step }}</b>
            <ArrowRight v-if="index < selectedProject.pipeline.length - 1" :size="14" />
          </li>
        </ol>
      </section>

      <div class="programming-project-stage-head">
        <div>
          <Layers3 :size="18" />
          <div><b>项目训练阶段</b><small>每次只进入一个阶段，完成证据后再推进</small></div>
        </div>
        <span>{{ selectedProject.phases.length }} 步</span>
      </div>

      <ol class="programming-project-phase-list">
        <li
          v-for="phase in selectedProject.phases"
          :key="phase.id"
          :data-programming-project-phase="phase.id"
        >
          <button type="button" @click="openPhase(phase)">
            <i>{{ phase.id }}</i>
            <span class="programming-project-phase-copy">
              <span>
                <em>{{ phase.mode }}</em>
                <small><Clock3 :size="11" />{{ phase.minutes }} 分钟</small>
              </span>
              <b>{{ phase.title }}</b>
              <p>{{ phase.goal }}</p>
              <span class="programming-project-phase-outputs">
                <i v-for="output in phase.outputs" :key="output">{{ output }}</i>
              </span>
            </span>
            <ChevronRight :size="16" />
          </button>
        </li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.programming-project-hub {
  color: var(--color-text, #17211e);
}
.programming-project-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: end;
  padding: 2px 0 18px;
  border-bottom: 1px solid var(--color-border);
}
.programming-project-head > div:first-child > span,
.programming-project-detail-title > span {
  color: var(--color-primary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .06em;
}
.programming-project-head h1,
.programming-project-detail-head h1 {
  margin: 5px 0 7px;
  font-family: Georgia, "Songti SC", serif;
  line-height: 1.3;
}
.programming-project-head h1 { max-width: 780px; font-size: 31px; }
.programming-project-head p,
.programming-project-detail-title p {
  max-width: 780px;
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.75;
}
.programming-project-summary {
  display: grid;
  min-width: 138px;
  padding-left: 20px;
  border-left: 1px solid var(--color-border);
}
.programming-project-summary b { color: var(--color-primary); font-size: 30px; line-height: 1; }
.programming-project-summary span { margin-top: 5px; font-size: 12px; font-weight: 650; }
.programming-project-summary small { margin-top: 6px; color: var(--color-text-tertiary); font-size: 9px; }
.programming-project-loop {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-tertiary);
}
.programming-project-loop span {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
  color: var(--color-text-secondary);
  font-size: 9px;
  white-space: nowrap;
}
.programming-project-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 14px 0 12px;
}
.programming-project-filters button {
  min-height: 36px;
  padding: 0 11px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 10px;
  cursor: pointer;
}
.programming-project-filters button.active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 9%, var(--color-surface));
  color: var(--color-primary);
  font-weight: 700;
}
.programming-project-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.programming-project-card {
  display: grid;
  min-width: 0;
  min-height: 236px;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  padding: 15px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.programming-project-card:hover {
  border-color: color-mix(in srgb, var(--color-primary) 58%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 4%, var(--color-surface));
}
.programming-project-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
  color: var(--color-primary);
}
.programming-project-copy { display: block; min-width: 0; }
.programming-project-meta,
.programming-project-stack,
.programming-project-highlights {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.programming-project-meta { margin-bottom: 8px; }
.programming-project-meta i,
.programming-project-stack i {
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--color-bg-muted);
  color: var(--color-text-tertiary);
  font-size: 8px;
  font-style: normal;
  font-weight: 650;
}
.programming-project-copy > strong { display: block; font-size: 15px; }
.programming-project-copy > small {
  display: -webkit-box;
  margin-top: 6px;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.programming-project-stack { margin-top: 10px; }
.programming-project-highlights { margin-top: 7px; }
.programming-project-highlights em {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--color-primary);
  font-size: 8px;
  font-style: normal;
}
.programming-project-side {
  display: grid;
  min-width: 48px;
  justify-items: end;
  color: var(--color-text-tertiary);
}
.programming-project-side b { color: var(--color-text); font-size: 20px; line-height: 1; }
.programming-project-side small { margin-top: 3px; font-size: 8px; }
.programming-project-side svg { margin-top: 32px; }
.programming-project-detail-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px 22px;
  align-items: end;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--color-border);
}
.programming-project-detail-head > .programming-project-back {
  grid-column: 1 / -1;
}
.programming-project-detail-head h1 { font-size: 29px; }
.programming-project-back,
.programming-project-start {
  display: inline-flex;
  min-height: 38px;
  width: fit-content;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 10px;
  cursor: pointer;
}
.programming-project-start {
  border-color: color-mix(in srgb, var(--color-primary) 46%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
  color: var(--color-primary);
  font-weight: 700;
}
.programming-project-brief {
  display: grid;
  grid-template-columns: minmax(220px, .7fr) minmax(0, 1.3fr);
  gap: 12px;
  margin-top: 12px;
}
.programming-project-why,
.programming-project-brief dl,
.programming-project-capabilities,
.programming-project-pipeline {
  margin: 0;
  padding: 12px 13px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
}
.programming-project-why > span {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-primary);
  font-size: 10px;
  font-weight: 700;
}
.programming-project-why p {
  margin: 8px 0 0;
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 1.7;
}
.programming-project-brief dl { display: grid; gap: 7px; }
.programming-project-brief dl > div {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr);
  gap: 8px;
}
.programming-project-brief dt { color: var(--color-text-tertiary); font-size: 9px; }
.programming-project-brief dd { margin: 0; font-size: 10px; line-height: 1.55; }
.programming-project-capabilities,
.programming-project-pipeline { margin-top: 10px; }
.programming-project-capabilities > header,
.programming-project-pipeline > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.programming-project-capabilities > header > span,
.programming-project-pipeline > header > div {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-primary);
  font-size: 10px;
  font-weight: 700;
}
.programming-project-capabilities > header small,
.programming-project-pipeline > header > span { color: var(--color-text-tertiary); font-size: 9px; }
.programming-project-capabilities ul {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 9px 0 0;
  padding: 0;
  list-style: none;
}
.programming-project-capabilities li {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--color-text-secondary);
  font-size: 9px;
}
.programming-project-capabilities li svg { color: var(--color-primary); flex-shrink: 0; }
.programming-project-pipeline ol {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  overflow-x: auto;
}
.programming-project-pipeline li {
  display: inline-flex;
  min-width: fit-content;
  align-items: center;
  gap: 5px;
}
.programming-project-pipeline li i {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 5px;
  background: color-mix(in srgb, var(--color-primary) 9%, var(--color-surface));
  color: var(--color-primary);
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 8px;
  font-style: normal;
}
.programming-project-pipeline li b {
  color: var(--color-text-secondary);
  font-size: 9px;
  white-space: nowrap;
}
.programming-project-pipeline li > svg { color: var(--color-text-tertiary); }
.programming-project-stage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 0 10px;
}
.programming-project-stage-head > div { display: flex; align-items: center; gap: 9px; }
.programming-project-stage-head b,
.programming-project-stage-head small { display: block; }
.programming-project-stage-head b { font-size: 13px; }
.programming-project-stage-head small,
.programming-project-stage-head > span { color: var(--color-text-tertiary); font-size: 9px; }
.programming-project-phase-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.programming-project-phase-list > li {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
}
.programming-project-phase-list button {
  display: grid;
  width: 100%;
  min-height: 94px;
  grid-template-columns: 34px minmax(0, 1fr) 16px;
  gap: 10px;
  align-items: start;
  padding: 12px 13px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.programming-project-phase-list button:hover {
  background: color-mix(in srgb, var(--color-primary) 5%, transparent);
}
.programming-project-phase-list button > i {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-primary) 9%, var(--color-surface));
  color: var(--color-primary);
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
}
.programming-project-phase-copy { display: block; min-width: 0; }
.programming-project-phase-copy > span:first-child {
  display: flex;
  align-items: center;
  gap: 7px;
}
.programming-project-phase-copy em {
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
  color: var(--color-primary);
  font-size: 8px;
  font-style: normal;
  font-weight: 700;
}
.programming-project-phase-copy small {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--color-text-tertiary);
  font-size: 8px;
}
.programming-project-phase-copy > b { display: block; margin-top: 5px; font-size: 12px; }
.programming-project-phase-copy > p {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: 9px;
  line-height: 1.6;
}
.programming-project-phase-outputs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 7px;
}
.programming-project-phase-outputs i {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--color-bg-muted);
  color: var(--color-text-tertiary);
  font-size: 8px;
  font-style: normal;
}
.programming-project-phase-list button > svg { margin-top: 8px; color: var(--color-text-tertiary); }
.programming-project-card:focus-visible,
.programming-project-filters button:focus-visible,
.programming-project-back:focus-visible,
.programming-project-start:focus-visible,
.programming-project-phase-list button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
@media (max-width: 900px) {
  .programming-project-head { grid-template-columns: 1fr; gap: 12px; padding-bottom: 14px; }
  .programming-project-head h1 { font-size: 25px; }
  .programming-project-summary {
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: baseline;
    gap: 6px;
    padding: 9px 0 0;
    border-top: 1px solid var(--color-border);
    border-left: 0;
  }
  .programming-project-summary b { font-size: 22px; }
  .programming-project-summary span { margin: 0; }
  .programming-project-summary small { margin: 0; text-align: right; }
  .programming-project-loop {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .programming-project-loop::-webkit-scrollbar { display: none; }
  .programming-project-filters {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .programming-project-filters::-webkit-scrollbar { display: none; }
  .programming-project-filters button { flex-shrink: 0; min-height: 44px; }
  .programming-project-grid { grid-template-columns: 1fr; }
  .programming-project-card { min-height: 226px; padding: 12px; }
  .programming-project-detail-head { grid-template-columns: 1fr; }
  .programming-project-detail-head h1 { font-size: 23px; }
  .programming-project-back,
  .programming-project-start { min-height: 44px; }
  .programming-project-start { width: 100%; }
  .programming-project-brief { grid-template-columns: 1fr; }
  .programming-project-pipeline ol { padding-bottom: 3px; }
  .programming-project-phase-list button { min-height: 108px; padding: 11px; }
}
@media (max-width: 520px) {
  .programming-project-head h1 { font-size: 21px; }
  .programming-project-head p,
  .programming-project-detail-title p { font-size: 11px; }
  .programming-project-card { grid-template-columns: 32px minmax(0, 1fr); }
  .programming-project-icon { width: 30px; height: 30px; }
  .programming-project-side {
    grid-column: 2;
    grid-template-columns: auto auto minmax(0, 1fr);
    justify-items: start;
    align-items: center;
    gap: 5px;
  }
  .programming-project-side svg { display: none; }
  .programming-project-phase-list button { grid-template-columns: 30px minmax(0, 1fr); }
  .programming-project-phase-list button > svg { display: none; }
}
</style>
