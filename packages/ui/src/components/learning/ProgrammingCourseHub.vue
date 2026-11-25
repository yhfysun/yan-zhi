<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Clock3,
  Code2,
  FolderKanban,
  Layers3,
} from 'lucide-vue-next';
import type {
  ProgrammingCoursePackage,
  ProgrammingLessonOutline,
  ProgrammingProject,
} from '@yan-zhi/shared';
import { PROGRAMMING_CURRICULUM_PHASES } from '@yan-zhi/shared';
import ProgrammingProjectHub from './ProgrammingProjectHub.vue';

const props = defineProps<{
  courses: readonly ProgrammingCoursePackage[];
  projects: readonly ProgrammingProject[];
  initialCourseId?: string;
}>();
const emit = defineEmits<{
  openLesson: [courseName: string];
  selectCourse: [courseId: string];
}>();

const COURSE_STATE_KEY = 'yz.learning.programming.course.v1';
const LAYER_STATE_KEY = 'yz.learning.programming.layer.v1';
const restoredCourse = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(COURSE_STATE_KEY) || '{}') as {
      courseId?: string;
      stageId?: string;
    };
    const requestedCourse = props.initialCourseId
      ? props.courses.find((item) => item.id === props.initialCourseId)
      : null;
    const course = requestedCourse || props.courses.find((item) => item.id === saved.courseId);
    return course
      ? {
          courseId: course.id,
          stageId: course.stages.some((stage) => stage.id === saved.stageId)
            ? saved.stageId || ''
            : course.stages[0]?.id || '',
        }
      : { courseId: '', stageId: '' };
  } catch {
    return { courseId: '', stageId: '' };
  }
})();
const selectedCourseId = ref(restoredCourse.courseId);
const expandedStageId = ref(restoredCourse.stageId);
const activeLayer = ref<'courses' | 'projects'>(
  localStorage.getItem(LAYER_STATE_KEY) === 'projects' && props.projects.length
    ? 'projects'
    : 'courses',
);
const selectedCourse = computed(() =>
  props.courses.find((course) => course.id === selectedCourseId.value) || null,
);
const courseGroups = computed(() => {
  let order = 0;
  return PROGRAMMING_CURRICULUM_PHASES.map((phase) => ({
    ...phase,
    courses: phase.courses.flatMap((entry) => {
      const course = props.courses.find((item) => item.id === entry.courseId);
      if (!course) return [];
      order += 1;
      return [{ ...entry, course, order }];
    }),
  }));
});
const selectedCoursePosition = computed(() => {
  for (const phase of courseGroups.value) {
    const course = phase.courses.find((item) => item.course.id === selectedCourseId.value);
    if (course) return { phase, course };
  }
  return null;
});

const CATEGORY_LABELS: Record<ProgrammingCoursePackage['category'], string> = {
  foundation: '通识',
  frontend: '前端',
  backend: '后端',
  systems: '系统',
  middleware: '中间件',
  ai: 'AI',
  engineering: '工程',
};

function categoryLabel(category: ProgrammingCoursePackage['category']): string {
  return CATEGORY_LABELS[category];
}

function selectLayer(layer: 'courses' | 'projects'): void {
  activeLayer.value = layer;
  try {
    localStorage.setItem(LAYER_STATE_KEY, layer);
  } catch {
    // Layer switching remains available when storage is unavailable.
  }
}

function openCourse(courseId: string): void {
  selectedCourseId.value = courseId;
  expandedStageId.value = props.courses.find((course) => course.id === courseId)?.stages[0]?.id || '';
  saveCourseState();
  emit('selectCourse', courseId);
}

function closeCourse(): void {
  selectedCourseId.value = '';
  expandedStageId.value = '';
  try { localStorage.removeItem(COURSE_STATE_KEY); } catch { /* optional persistence */ }
}

function toggleStage(stageId: string): void {
  expandedStageId.value = expandedStageId.value === stageId ? '' : stageId;
  saveCourseState();
}

function saveCourseState(): void {
  try {
    localStorage.setItem(COURSE_STATE_KEY, JSON.stringify({
      courseId: selectedCourseId.value,
      stageId: expandedStageId.value,
    }));
  } catch { /* optional persistence */ }
}

function openLesson(lesson: ProgrammingLessonOutline): void {
  if (lesson.status !== 'ready' || !lesson.courseName) return;
  emit('openLesson', lesson.courseName);
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} 小时`;
}

function scrollToPhase(phaseId: string): void {
  const target = document.querySelector<HTMLElement>(`[data-programming-phase="${phaseId}"]`);
  if (!target) return;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
}

watch(() => props.initialCourseId, (courseId) => {
  if (!courseId || courseId === selectedCourseId.value) return;
  if (props.courses.some((course) => course.id === courseId)) openCourse(courseId);
});
</script>

<template>
  <section
    class="programming-hub"
    aria-label="编程课程地图"
  >
    <nav class="programming-layer-tabs" aria-label="编程学习内容">
      <button
        type="button"
        data-learning-layer="courses"
        :class="{ active: activeLayer === 'courses' }"
        @click="selectLayer('courses')"
      >
        <BookOpen :size="16" />
        <span>独立课程</span>
        <small>{{ courses.length }}</small>
      </button>
      <button
        type="button"
        data-learning-layer="projects"
        :class="{ active: activeLayer === 'projects' }"
        @click="selectLayer('projects')"
      >
        <FolderKanban :size="16" />
        <span>综合训练</span>
        <small>{{ projects.length }}</small>
      </button>
    </nav>

    <ProgrammingProjectHub
      v-if="activeLayer === 'projects'"
      :projects="projects"
      @open-lesson="emit('openLesson', $event)"
    />

    <template v-else>
    <template v-if="!selectedCourse">
      <nav class="programming-route-strip" aria-label="编程推荐学习顺序">
        <button
          v-for="group in courseGroups"
          :key="group.id"
          type="button"
          @click="scrollToPhase(group.id)"
        >
          <i>{{ String(group.step).padStart(2, '0') }}</i>
          <span><b>{{ group.title }}</b><small>{{ group.courses.length }} 门课</small></span>
        </button>
        <button type="button" class="projects" @click="selectLayer('projects')">
          <i>{{ String(courseGroups.length + 1).padStart(2, '0') }}</i>
          <span><b>综合训练</b><small>{{ projects.length }} 个项目</small></span>
        </button>
      </nav>

      <div class="programming-stage-groups">
        <section
          v-for="group in courseGroups"
          :key="group.id"
          class="programming-path-stage"
          :data-programming-phase="group.id"
        >
          <header>
            <i>{{ String(group.step).padStart(2, '0') }}</i>
            <div>
              <span>学习顺序 {{ group.step }} / {{ courseGroups.length }}</span>
              <h2>{{ group.title }}</h2>
              <p>{{ group.description }}</p>
            </div>
            <small>{{ group.outcome }}</small>
          </header>
          <div class="programming-course-grid">
            <button
              v-for="entry in group.courses"
              :key="entry.course.id"
              type="button"
              class="programming-course-card"
              :class="{ ready: entry.course.status === 'ready', outline: entry.course.status === 'outline' }"
              :data-programming-course="entry.course.id"
              :data-programming-order="entry.order"
              @click="openCourse(entry.course.id)"
            >
              <span class="programming-course-icon"><Code2 :size="19" /></span>
              <span class="programming-course-copy">
                <span class="programming-course-meta">
                  <i>{{ String(entry.order).padStart(2, '0') }} · {{ entry.note }}</i>
                  <i>{{ categoryLabel(entry.course.category) }}</i>
                </span>
                <b>{{ entry.course.shortTitle }}</b>
                <small>{{ entry.course.summary }}</small>
              </span>
              <span class="programming-course-side">
                <span>{{ entry.course.readyLessons }} / {{ entry.course.totalLessons }}</span>
                <small>课时开放</small>
                <ChevronRight :size="17" />
              </span>
            </button>
          </div>
        </section>
      </div>
    </template>

    <template v-else>
      <header class="programming-course-head">
        <div class="programming-course-toolbar">
          <button type="button" class="programming-back" @click="closeCourse">
            <ArrowLeft :size="16" />全部课程
          </button>
          <span class="programming-course-breadcrumb">
            <template v-if="selectedCoursePosition">
              {{ selectedCoursePosition.phase.title }} · 第 {{ selectedCoursePosition.course.order }} 门
            </template>
            <template v-else>{{ categoryLabel(selectedCourse.category) }}</template>
          </span>
          <div class="programming-course-progress" data-programming-course-progress>
            <b>{{ selectedCourse.readyLessons }} / {{ selectedCourse.totalLessons }}</b>
            <small>课时开放</small>
          </div>
        </div>
        <div class="programming-course-title-block">
          <div class="programming-course-eyebrow">
            <span>{{ categoryLabel(selectedCourse.category) }}</span>
            <span>{{ selectedCourse.status === 'ready' ? '完整课程' : '课程大纲' }}</span>
          </div>
          <h1 :title="selectedCourse.title">{{ selectedCourse.title }}</h1>
          <p data-programming-course-summary>{{ selectedCourse.summary }}</p>
        </div>
        <dl class="programming-course-facts">
          <div><dt>前置知识</dt><dd>{{ selectedCourse.prerequisite }}</dd></div>
          <div><dt>目标岗位</dt><dd>{{ selectedCourse.targetRole }}</dd></div>
          <div><dt>运行环境</dt><dd>{{ selectedCourse.runtime }}</dd></div>
          <div><dt>工具链</dt><dd>{{ selectedCourse.toolchain }}</dd></div>
          <div><dt>框架与依赖</dt><dd>{{ selectedCourse.frameworks }}</dd></div>
          <div><dt>毕业项目</dt><dd>{{ selectedCourse.capstone }}</dd></div>
        </dl>
      </header>

      <aside class="programming-course-sources" aria-label="源码与规范锚点">
        <div>
          <Code2 :size="16" />
          <b>源码与规范锚点</b>
        </div>
        <ul>
          <li v-for="anchor in selectedCourse.sourceAnchors" :key="anchor">{{ anchor }}</li>
        </ul>
      </aside>

      <div class="programming-stage-head">
        <div>
          <Layers3 :size="18" />
          <div><b>课程阶段</b><small>先完成阶段验收，再进入下一阶段</small></div>
        </div>
        <span>{{ selectedCourse.stages.length }} 个阶段</span>
      </div>

      <ol class="programming-stage-list">
        <li
          v-for="(stage, stageIndex) in selectedCourse.stages"
          :key="stage.id"
          class="programming-stage"
          :data-programming-stage="stage.id"
          :data-programming-stage-status="stage.lessons.some((lesson) => lesson.status === 'ready') ? 'ready' : 'planned'"
        >
          <button
            type="button"
            class="programming-stage-toggle"
            :aria-expanded="expandedStageId === stage.id"
            @click="toggleStage(stage.id)"
          >
            <i>{{ stage.id }}</i>
            <div>
              <b>{{ stage.title }}</b>
              <p>{{ stage.goal }}</p>
            </div>
            <span><Clock3 :size="13" />{{ durationLabel(stage.minutes) }}<ChevronDown :size="15" :class="{ open: expandedStageId === stage.id }" /></span>
          </button>
          <template v-if="expandedStageId === stage.id">
          <ol v-if="stage.lessons.some((lesson) => lesson.status === 'ready')" class="programming-lesson-list">
            <li v-for="(lesson, lessonIndex) in stage.lessons" :key="lesson.id">
              <button
                v-if="lesson.status === 'ready'"
                type="button"
                data-programming-lesson-status="ready"
                @click="openLesson(lesson)"
              >
                <CheckCircle2 :size="15" />
                <span>
                  <small>{{ stage.id }} · {{ String(lessonIndex + 1).padStart(2, '0') }}</small>
                  <b>{{ lesson.title }}</b>
                </span>
                <em>{{ lesson.minutes }} 分钟</em>
                <ChevronRight :size="15" />
              </button>
              <div v-else class="programming-lesson-planned" data-programming-lesson-status="planned">
                <CircleDashed :size="15" />
                <span>
                  <small>{{ stage.id }} · {{ String(lessonIndex + 1).padStart(2, '0') }}</small>
                  <b>{{ lesson.title }}</b>
                </span>
                <em>待发布</em>
              </div>
            </li>
          </ol>
          <div v-else class="programming-stage-planned">
            <CircleDashed :size="15" />
            <span><b>该阶段计划 {{ stage.lessons.length }} 个课时</b><small>课程大纲已建立，课时内容尚未开放。</small></span>
          </div>
          <footer v-if="stageIndex === 0 && selectedCourse.id === 'java-enterprise'">
            <BookOpen :size="14" />
            Java 主线已覆盖 J0-J11；继续按阶段完成源码、实验和企业项目验收。
          </footer>
          </template>
        </li>
      </ol>
    </template>
    </template>
  </section>
</template>

<style scoped>
.programming-hub {
  color: var(--color-text, #17211e);
}
.programming-layer-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 82%, transparent);
  width: fit-content;
}
.programming-layer-tabs button {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 650;
  cursor: pointer;
}
.programming-layer-tabs button.active {
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--color-text) 9%, transparent);
}
.programming-layer-tabs button small {
  min-width: 20px;
  padding: 2px 5px;
  border-radius: 999px;
  background: var(--color-bg-muted);
  color: var(--color-text-tertiary);
  font-size: 8px;
  text-align: center;
}
.programming-layer-tabs button.active small {
  background: color-mix(in srgb, var(--color-primary) 9%, var(--color-surface));
  color: var(--color-primary);
}
.programming-course-head h1 {
  margin: 0;
  font-family: Georgia, "Songti SC", serif;
  line-height: 1.35;
}
.programming-route-strip {
  display: flex;
  gap: 6px;
  margin-top: 12px;
  padding: 4px 0 8px;
  overflow-x: auto;
  /* 2026-11-21 用户要求：路线横滑条不显示滚动条（保留滚动能力） */
  scrollbar-width: none;
}
.programming-route-strip::-webkit-scrollbar { display: none; }
.programming-route-strip button {
  display: grid;
  min-width: 158px;
  min-height: 54px;
  flex: 0 0 auto;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 7px 9px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-surface) 86%, transparent);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.programming-route-strip button:hover { border-color: var(--color-primary); }
.programming-route-strip button.projects {
  border-style: dashed;
  background: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface));
}
.programming-route-strip button > i {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 5px;
  background: color-mix(in srgb, var(--color-primary) 9%, var(--color-surface));
  color: var(--color-primary);
  font: 700 8px/1 ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-style: normal;
}
.programming-route-strip button b,
.programming-route-strip button small { display: block; }
.programming-route-strip button b { overflow: hidden; color: var(--color-text); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.programming-route-strip button small { margin-top: 3px; color: var(--color-text-tertiary); font-size: 8px; }
.programming-stage-groups {
  display: grid;
  gap: 18px;
  margin-top: 8px;
}
.programming-path-stage {
  scroll-margin-top: 72px;
  border-top: 1px solid var(--color-border);
  padding-top: 14px;
}
.programming-path-stage > header {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) minmax(180px, .4fr);
  gap: 12px;
  align-items: start;
  padding: 0 2px 4px;
}
.programming-path-stage > header > i {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--color-primary) 24%, var(--color-border));
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-primary) 9%, var(--color-surface));
  color: var(--color-primary);
  font: 700 11px/1 ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-style: normal;
}
.programming-path-stage > header span {
  color: var(--color-primary);
  font-size: 9px;
  font-weight: 700;
}
.programming-path-stage > header h2 {
  margin: 3px 0 4px;
  font-size: 17px;
}
.programming-path-stage > header p {
  max-width: 760px;
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 1.7;
}
.programming-path-stage > header > small {
  padding-left: 12px;
  border-left: 1px solid var(--color-border);
  color: var(--color-text-tertiary);
  font-size: 9px;
  line-height: 1.65;
}
.programming-course-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding-top: 10px;
}
.programming-course-card {
  display: grid;
  min-width: 0;
  min-height: 148px;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  padding: 15px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 86%, transparent);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.programming-course-card:hover {
  border-color: color-mix(in srgb, var(--color-primary) 58%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface));
}
.programming-course-card.ready {
  border-left: 3px solid var(--color-primary);
}
.programming-course-card.outline {
  border-style: dashed;
}
.programming-course-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
  color: var(--color-primary);
}
.programming-course-copy { display: block; min-width: 0; }
.programming-course-meta { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
.programming-course-meta i {
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--color-bg-muted);
  color: var(--color-text-tertiary);
  font-size: 8px;
  font-style: normal;
  font-weight: 650;
}
.programming-course-copy > b { display: block; font-size: 15px; }
.programming-course-copy > small {
  display: -webkit-box;
  margin-top: 6px;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.programming-course-side {
  display: grid;
  min-width: 76px;
  justify-items: end;
  gap: 2px;
  color: var(--color-text-tertiary);
}
.programming-course-side > span { color: var(--color-text); font-size: 11px; font-weight: 700; }
.programming-course-side > small { font-size: 8px; }
.programming-course-side > svg { margin-top: 20px; }
.programming-course-head {
  display: grid;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border);
}
.programming-course-toolbar {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.programming-course-breadcrumb {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-tertiary);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.programming-course-progress {
  display: inline-flex;
  min-height: 32px;
  align-items: baseline;
  gap: 3px;
  margin-left: auto;
  padding: 5px 9px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 20%, var(--color-border));
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface));
  color: var(--color-text-secondary);
}
.programming-course-progress b {
  color: var(--color-primary);
  font: 700 15px/1 ui-monospace, "SFMono-Regular", Consolas, monospace;
}
.programming-course-progress span {
  font-size: 10px;
}
.programming-course-progress small {
  margin-left: 3px;
  color: var(--color-text-tertiary);
  font-size: 8px;
}
.programming-course-title-block {
  min-width: 0;
  padding: 4px 0 2px;
}
.programming-course-eyebrow {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.programming-course-eyebrow span {
  padding: 3px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 7%, var(--color-surface));
  color: var(--color-primary);
  font-size: 8px;
  font-weight: 700;
}
.programming-course-title-block h1 {
  max-width: 100%;
  margin-top: 7px;
  overflow: hidden;
  font-size: clamp(21px, 2.1vw, 28px);
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.programming-course-title-block p {
  max-width: 82ch;
  margin: 7px 0 0;
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 1.7;
}
.programming-course-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 8px;
  margin: 0;
}
.programming-course-facts > div {
  min-width: 0;
  padding: 10px 11px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-surface) 84%, transparent);
}
.programming-course-facts dt {
  color: var(--color-primary);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: .04em;
}
.programming-course-facts dd {
  display: -webkit-box;
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.programming-course-sources {
  display: grid;
  grid-template-columns: minmax(150px, .28fr) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
  margin-top: 12px;
  padding: 11px 13px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 4%, var(--color-surface));
}
.programming-course-sources > div {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--color-primary);
  font-size: 10px;
}
.programming-course-sources ul {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.programming-course-sources li {
  max-width: 100%;
  padding: 4px 7px;
  border-radius: 5px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 9px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.programming-back {
  display: inline-flex;
  min-height: 36px;
  width: fit-content;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 10px;
  cursor: pointer;
}
.programming-stage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 0 10px;
}
.programming-stage-head > div { display: flex; align-items: center; gap: 9px; }
.programming-stage-head b,
.programming-stage-head small { display: block; }
.programming-stage-head b { font-size: 13px; }
.programming-stage-head small,
.programming-stage-head > span { color: var(--color-text-tertiary); font-size: 9px; }
.programming-stage-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.programming-stage {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
}
.programming-stage-toggle {
  display: grid;
  width: 100%;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  padding: 12px 13px;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.programming-stage-toggle > i {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-primary) 9%, var(--color-surface));
  color: var(--color-primary);
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
}
.programming-stage-toggle b { font-size: 12px; }
.programming-stage-toggle p { margin: 3px 0 0; color: var(--color-text-secondary); font-size: 9px; line-height: 1.6; }
.programming-stage-toggle > span { display: inline-flex; align-items: center; gap: 4px; color: var(--color-text-tertiary); font-size: 9px; white-space: nowrap; }
.programming-stage-toggle svg { transition: transform .15s ease; }
.programming-stage-toggle svg.open { transform: rotate(180deg); }
.programming-lesson-list {
  display: grid;
  margin: 0;
  padding: 4px 8px 8px;
  list-style: none;
}
.programming-lesson-list button,
.programming-lesson-planned {
  display: grid;
  width: 100%;
  min-height: 48px;
  grid-template-columns: 16px minmax(0, 1fr) auto 16px;
  gap: 8px;
  align-items: center;
  padding: 6px 5px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  text-align: left;
}
.programming-lesson-list button { cursor: pointer; }
.programming-lesson-list button:hover { background: color-mix(in srgb, var(--color-primary) 7%, transparent); }
.programming-lesson-list button > svg:first-child { color: var(--color-primary); }
.programming-lesson-list small,
.programming-lesson-list b { display: block; }
.programming-lesson-list small { color: var(--color-text-tertiary); font-family: ui-monospace, "SFMono-Regular", Consolas, monospace; font-size: 8px; }
.programming-lesson-list b { margin-top: 2px; font-size: 10px; line-height: 1.45; }
.programming-lesson-list em { color: var(--color-text-tertiary); font-size: 8px; font-style: normal; white-space: nowrap; }
.programming-lesson-planned { color: var(--color-text-tertiary); opacity: .7; }
.programming-lesson-planned { grid-template-columns: 16px minmax(0, 1fr) auto; }
.programming-stage-planned {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 13px;
  color: var(--color-text-tertiary);
}
.programming-stage-planned span b,
.programming-stage-planned span small { display: block; }
.programming-stage-planned span b { color: var(--color-text-secondary); font-size: 10px; }
.programming-stage-planned span small { margin-top: 2px; font-size: 8px; }
.programming-stage > footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 13px 10px;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-tertiary);
  font-size: 9px;
}
.programming-course-card:focus-visible,
.programming-lesson-list button:focus-visible,
.programming-back:focus-visible,
.programming-stage-toggle:focus-visible,
.programming-layer-tabs button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
@media (max-width: 900px) {
  .programming-layer-tabs {
    width: 100%;
  }
  .programming-layer-tabs button {
    min-height: 44px;
    flex: 1;
    justify-content: center;
  }
  .programming-route-strip { margin-top: 8px; }
  .programming-route-strip button { min-height: 56px; }
  .programming-path-stage > header {
    grid-template-columns: 42px minmax(0, 1fr);
  }
  .programming-path-stage > header > small {
    grid-column: 2;
    padding: 8px 0 0;
    border-top: 1px solid var(--color-border);
    border-left: 0;
  }
  .programming-course-grid { grid-template-columns: 1fr; }
  .programming-course-card { min-height: 126px; padding: 12px; }
  .programming-course-title-block h1 { font-size: 22px; }
  .programming-course-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .programming-course-sources { grid-template-columns: 1fr; margin-top: 10px; }
  .programming-stage-toggle { grid-template-columns: 30px minmax(0, 1fr); }
  .programming-stage-toggle > span { grid-column: 2; }
  .programming-lesson-list button,
  .programming-lesson-planned { grid-template-columns: 15px minmax(0, 1fr) auto; }
  .programming-lesson-list button > svg:last-child { display: none; }
  .programming-back { min-height: 44px; }
}
@media (max-width: 520px) {
  .programming-course-progress {
    width: 100%;
    margin-left: 0;
  }
  .programming-course-facts { grid-template-columns: 1fr; }
  .programming-course-card { grid-template-columns: 32px minmax(0, 1fr); }
  .programming-course-icon { width: 30px; height: 30px; }
  .programming-course-side {
    grid-column: 2;
    grid-template-columns: auto auto minmax(0, 1fr);
    justify-items: start;
    align-items: center;
    gap: 5px;
  }
  .programming-course-side > svg { display: none; }
  .programming-route-strip button { min-width: 172px; }
  .programming-path-stage > header h2 { font-size: 16px; }
  .programming-lesson-list b { font-size: 10px; }
}
</style>
