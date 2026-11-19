<script setup lang="ts">
import { computed, ref } from 'vue';
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
}>();
const emit = defineEmits<{
  openLesson: [courseName: string];
}>();

const COURSE_STATE_KEY = 'yz.learning.programming.course.v1';
const LAYER_STATE_KEY = 'yz.learning.programming.layer.v1';
const restoredCourse = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(COURSE_STATE_KEY) || '{}') as {
      courseId?: string;
      stageId?: string;
    };
    const course = props.courses.find((item) => item.id === saved.courseId);
    return course
      ? { courseId: course.id, stageId: course.stages.some((stage) => stage.id === saved.stageId) ? saved.stageId || '' : course.stages[0]?.id || '' }
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
const readyLessonCount = computed(() =>
  props.courses.reduce((sum, course) => sum + course.readyLessons, 0),
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
</script>

<template>
  <section
    class="programming-hub"
    :aria-labelledby="activeLayer === 'projects' ? 'programming-project-title' : 'programming-hub-title'"
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
      <header class="programming-hub-head">
        <div>
          <span>编程科目 · 推荐学习路线</span>
          <h1 id="programming-hub-title">先懂程序怎么跑，再按前端、后端、数据一路学深</h1>
          <p>编程通识里先学简单算法和数据结构；完整算法体系已独立为“算法与数据结构”学科。这里按先修关系排好 8 个阶段，不再把 Java 和 HTML 混在一起。</p>
        </div>
        <div class="programming-hub-summary">
          <b>{{ courseGroups.length }}</b>
          <span>推荐阶段</span>
          <small>{{ courses.length }} 门课 · {{ readyLessonCount }} 课时</small>
        </div>
      </header>

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
        <button type="button" class="programming-back" @click="closeCourse">
          <ArrowLeft :size="16" />全部课程
        </button>
        <div>
          <span v-if="selectedCoursePosition">{{ selectedCoursePosition.phase.title }} · 第 {{ selectedCoursePosition.course.order }} 门 · 完整课程</span>
          <span v-else>{{ categoryLabel(selectedCourse.category) }} · {{ selectedCourse.status === 'ready' ? '完整课程' : '课程大纲' }}</span>
          <h1>{{ selectedCourse.title }}</h1>
          <p>{{ selectedCourse.summary }}</p>
        </div>
        <dl>
          <div><dt>前置</dt><dd>{{ selectedCourse.prerequisite }}</dd></div>
          <div><dt>目标岗位</dt><dd>{{ selectedCourse.targetRole }}</dd></div>
          <div><dt>运行环境</dt><dd>{{ selectedCourse.runtime }}</dd></div>
          <div><dt>工具链</dt><dd>{{ selectedCourse.toolchain }}</dd></div>
          <div><dt>框架</dt><dd>{{ selectedCourse.frameworks }}</dd></div>
          <div><dt>毕业项目</dt><dd>{{ selectedCourse.capstone }}</dd></div>
          <div><dt>开放进度</dt><dd>{{ selectedCourse.readyLessons }} / {{ selectedCourse.totalLessons }} 课时已开放</dd></div>
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
.programming-hub-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: end;
  padding: 2px 0 20px;
  border-bottom: 1px solid var(--color-border);
}
.programming-hub-head > div:first-child > span,
.programming-course-head > div > span {
  color: var(--color-primary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .06em;
}
.programming-hub-head h1,
.programming-course-head h1 {
  margin: 5px 0 7px;
  font-family: Georgia, "Songti SC", serif;
  line-height: 1.3;
}
.programming-hub-head h1 { max-width: 780px; font-size: 31px; }
.programming-hub-head p,
.programming-course-head p {
  max-width: 760px;
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.75;
}
.programming-hub-summary {
  display: grid;
  min-width: 132px;
  padding-left: 20px;
  border-left: 1px solid var(--color-border);
}
.programming-hub-summary b {
  color: var(--color-primary);
  font-size: 30px;
  line-height: 1;
}
.programming-hub-summary span { margin-top: 5px; font-size: 12px; font-weight: 650; }
.programming-hub-summary small { margin-top: 6px; color: var(--color-text-tertiary); font-size: 9px; }
.programming-route-strip {
  display: flex;
  gap: 6px;
  margin-top: 12px;
  padding: 4px 0 8px;
  overflow-x: auto;
  scrollbar-width: thin;
}
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
  grid-template-columns: minmax(0, 1fr) minmax(260px, .62fr);
  gap: 10px 24px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--color-border);
}
.programming-course-head > .programming-back { grid-column: 1 / -1; }
.programming-course-head h1 { font-size: 28px; }
.programming-course-head dl {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 18px;
  border-left: 1px solid var(--color-border);
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
.programming-course-head dl > div { display: grid; grid-template-columns: 62px minmax(0, 1fr); gap: 8px; }
.programming-course-head dt { color: var(--color-text-tertiary); font-size: 9px; }
.programming-course-head dd { margin: 0; font-size: 10px; line-height: 1.55; }
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
  .programming-hub-head { grid-template-columns: 1fr; gap: 12px; padding-bottom: 14px; }
  .programming-hub-head h1 { font-size: 25px; }
  .programming-hub-summary {
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: baseline;
    gap: 6px;
    padding: 9px 0 0;
    border-top: 1px solid var(--color-border);
    border-left: 0;
  }
  .programming-hub-summary b { font-size: 22px; }
  .programming-hub-summary span { margin: 0; }
  .programming-hub-summary small { margin: 0; text-align: right; }
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
  .programming-course-head { grid-template-columns: 1fr; }
  .programming-course-head h1 { font-size: 23px; }
  .programming-course-head dl { padding: 10px 0 0; border-top: 1px solid var(--color-border); border-left: 0; }
  .programming-course-sources { grid-template-columns: 1fr; margin-top: 10px; }
  .programming-stage-toggle { grid-template-columns: 30px minmax(0, 1fr); }
  .programming-stage-toggle > span { grid-column: 2; }
  .programming-lesson-list button,
  .programming-lesson-planned { grid-template-columns: 15px minmax(0, 1fr) auto; }
  .programming-lesson-list button > svg:last-child { display: none; }
  .programming-back { min-height: 44px; }
}
@media (max-width: 520px) {
  .programming-hub-head h1 { font-size: 21px; }
  .programming-hub-head p,
  .programming-course-head p { font-size: 11px; }
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
