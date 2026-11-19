<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Code2,
  ExternalLink,
  Filter,
  ListChecks,
  Search,
  Sparkles,
  Target,
  Trophy,
  X,
} from 'lucide-vue-next';
import {
  ALGORITHM_CATEGORY_LABELS,
  ALGORITHM_DIFFICULTIES,
  ALGORITHM_LESSONS,
  ALGORITHM_PRACTICE_PROBLEMS,
  ALGORITHM_RESOURCE_SITES,
  ALGORITHM_TRACKS,
  type AlgorithmProblem,
  type AlgorithmProblemCategory,
  type AlgorithmProblemDifficulty,
} from '@yan-zhi/shared';
import AlgorithmAnimationLab from './AlgorithmAnimationLab.vue';
import AlgorithmCodeLab from './AlgorithmCodeLab.vue';

type AlgorithmMode = 'learn' | 'visualize' | 'problems' | 'resources';
type CategoryFilter = AlgorithmProblemCategory | 'all';
type DifficultyFilter = AlgorithmProblemDifficulty | 'all';

const emit = defineEmits<{
  'open-lesson': [courseName: string];
}>();

const PROGRESS_KEY = 'yz.algorithms.problem-progress.v1';
const PAGE_SIZE = 24;
const mode = ref<AlgorithmMode>('learn');
const search = ref('');
const category = ref<CategoryFilter>('all');
const difficulty = ref<DifficultyFilter>('all');
const trackFilter = ref('all');
const page = ref(1);
const completed = ref<Record<string, boolean>>({});
const activeProblem = ref<AlgorithmProblem | null>(null);
const activeStep = ref(0);
const focusRoot = ref<HTMLElement | null>(null);
let lastFocusTrigger: HTMLElement | null = null;
let previousBodyOverflow = '';
let previousAppInert = false;
let previousAppAriaHidden: string | null = null;

const lessonsByTrack = computed(() => ALGORITHM_TRACKS.map((track) => ({
  ...track,
  lessons: ALGORITHM_LESSONS.filter((lesson) => lesson.trackId === track.id),
})));
const flagshipProblems = computed(() =>
  ALGORITHM_PRACTICE_PROBLEMS.filter((problem) => problem.flagship).slice(0, 6),
);
const filteredProblems = computed(() => {
  const term = search.value.trim().toLowerCase();
  const matches = ALGORITHM_PRACTICE_PROBLEMS.filter((problem) => {
    if (category.value !== 'all' && problem.category !== category.value) return false;
    if (difficulty.value !== 'all' && problem.difficulty !== difficulty.value) return false;
    if (trackFilter.value !== 'all' && problem.trackId !== trackFilter.value) return false;
    if (!term) return true;
    return [
      problem.title,
      problem.familyTitle,
      problem.objective,
      problem.model,
      ...problem.tags,
    ].join(' ').toLowerCase().includes(term);
  });
  const difficultyOrder: Record<AlgorithmProblemDifficulty, number> = {
    入门: 0,
    进阶: 1,
    困难: 2,
    竞赛: 3,
  };
  return matches.sort((left, right) =>
    difficultyOrder[left.difficulty] - difficultyOrder[right.difficulty]
    || Number(right.flagship) - Number(left.flagship)
    || left.title.localeCompare(right.title),
  );
});
const totalPages = computed(() => Math.max(1, Math.ceil(filteredProblems.value.length / PAGE_SIZE)));
const pagedProblems = computed(() =>
  filteredProblems.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
);
const pageLabel = computed(() => {
  if (!filteredProblems.value.length) return '没有匹配题目';
  const start = (page.value - 1) * PAGE_SIZE + 1;
  const end = Math.min(page.value * PAGE_SIZE, filteredProblems.value.length);
  return `${start}-${end} / ${filteredProblems.value.length}`;
});
const completionCount = computed(() =>
  ALGORITHM_PRACTICE_PROBLEMS.reduce((sum, problem) => sum + (completed.value[problem.id] ? 1 : 0), 0),
);

const problemSteps = [
  { title: '故事任务', hint: '先看懂谁在做什么' },
  { title: '画图猜法', hint: '把人物关系画成表、树或图' },
  { title: '填空骨架', hint: '先搭伪代码，不一次写全' },
  { title: '代码实战', hint: '直接在应用里编写和运行' },
  { title: '手算找坑', hint: '用小例子抓出边界' },
  { title: '过关证明', hint: '说清为什么不会漏答案' },
  { title: '换个故事', hint: '把同一方法迁移到新场景' },
] as const;

function restoreProgress(): void {
  try {
    completed.value = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
  } catch {
    completed.value = {};
  }
}

function persistProgress(): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(completed.value));
  } catch {
    // Progress remains usable when storage is unavailable.
  }
}

function setMode(next: AlgorithmMode): void {
  mode.value = next;
}

function setCategory(next: CategoryFilter): void {
  category.value = next;
  page.value = 1;
}

function setDifficulty(next: DifficultyFilter): void {
  difficulty.value = next;
  page.value = 1;
}

function resetFilters(): void {
  search.value = '';
  category.value = 'all';
  difficulty.value = 'all';
  trackFilter.value = 'all';
  page.value = 1;
}

function previousPage(): void {
  page.value = Math.max(1, page.value - 1);
}

function nextPage(): void {
  page.value = Math.min(totalPages.value, page.value + 1);
}

function openProblem(problem: AlgorithmProblem): void {
  if (document.activeElement instanceof HTMLElement) lastFocusTrigger = document.activeElement;
  activeProblem.value = problem;
  activeStep.value = 0;
  void nextTick(() => focusRoot.value?.focus());
}

function closeProblem(): void {
  activeProblem.value = null;
  void nextTick(() => {
    if (lastFocusTrigger?.isConnected) lastFocusTrigger.focus();
    lastFocusTrigger = null;
  });
}

function moveStep(direction: -1 | 1): void {
  activeStep.value = Math.min(
    problemSteps.length - 1,
    Math.max(0, activeStep.value + direction),
  );
}

function completeProblem(): void {
  if (!activeProblem.value) return;
  completed.value = { ...completed.value, [activeProblem.value.id]: true };
  persistProgress();
}

function handleKeydown(event: KeyboardEvent): void {
  if (!activeProblem.value) return;
  if (event.key === 'Escape') {
    closeProblem();
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    moveStep(-1);
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    moveStep(1);
    return;
  }
  if (event.key !== 'Tab' || !focusRoot.value) return;
  const focusable = [...focusRoot.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.getAttribute('aria-hidden') !== 'true');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === focusRoot.value)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch([search, category, difficulty, trackFilter], () => {
  page.value = 1;
});

watch(activeProblem, (problem) => {
  if (typeof document === 'undefined') return;
  const app = document.querySelector<HTMLElement>('#app');
  if (problem) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (app) {
      previousAppInert = app.hasAttribute('inert');
      previousAppAriaHidden = app.getAttribute('aria-hidden');
      app.setAttribute('inert', '');
      app.setAttribute('aria-hidden', 'true');
    }
  } else {
    document.body.style.overflow = previousBodyOverflow;
    if (app) {
      if (!previousAppInert) app.removeAttribute('inert');
      if (previousAppAriaHidden === null) app.removeAttribute('aria-hidden');
      else app.setAttribute('aria-hidden', previousAppAriaHidden);
    }
  }
});

onMounted(() => {
  restoreProgress();
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (typeof document !== 'undefined') document.body.style.overflow = previousBodyOverflow;
});
</script>

<template>
  <section class="algorithm-workbench" aria-labelledby="algorithm-title">
    <header class="algorithm-head">
      <div>
        <span>独立学科 · 从正确性到竞赛与工程</span>
        <h1 id="algorithm-title">算法与数据结构</h1>
        <p>每个知识点都从一个小故事开始，先画图和手算，再写一点点代码。系统课程、原创变体、竞赛题族和工程基准按同一条轻松路线组织。</p>
      </div>
      <div class="algorithm-summary">
        <b>{{ ALGORITHM_PRACTICE_PROBLEMS.length }}</b>
        <span>原创实战变体</span>
        <small>{{ ALGORITHM_TRACKS.length }} 阶段 · {{ ALGORITHM_LESSONS.length }} 系统课程</small>
      </div>
    </header>

    <nav class="algorithm-mode-tabs" aria-label="算法学习模式">
      <button type="button" :aria-pressed="mode === 'learn'" @click="setMode('learn')">
        <BookOpen :size="16" /><span>系统课程</span>
      </button>
      <button type="button" :aria-pressed="mode === 'visualize'" @click="setMode('visualize')">
        <Sparkles :size="16" /><span>原理动画</span>
      </button>
      <button type="button" :aria-pressed="mode === 'problems'" @click="setMode('problems')">
        <ListChecks :size="16" /><span>题型实战</span>
        <small>{{ ALGORITHM_PRACTICE_PROBLEMS.length }}</small>
      </button>
      <button type="button" :aria-pressed="mode === 'resources'" @click="setMode('resources')">
        <ExternalLink :size="16" /><span>外部题库</span>
      </button>
    </nav>

    <template v-if="mode === 'learn'">
      <section class="algorithm-start">
        <div>
          <span><Target :size="15" />学习顺序固定</span>
          <h2>先听懂故事，再把方法一点点搭起来</h2>
          <p>每讲按“听故事 → 画小图 → 手算 → 填空实现 → 找坑 → 换个故事”推进。每步只做一点，不要求一次看懂全部。</p>
        </div>
        <button type="button" @click="emit('open-lesson', ALGORITHM_LESSONS[0].courseName)">
          从第 1 讲开始<ArrowRight :size="16" />
        </button>
      </section>

      <div class="algorithm-track-list">
        <section
          v-for="track in lessonsByTrack"
          :key="track.id"
          class="algorithm-track"
          :data-algorithm-track="track.id"
        >
          <header>
            <i>{{ track.id }}</i>
            <div>
              <span>{{ track.note }}</span>
              <h2>{{ track.title }}</h2>
              <p>{{ track.goal }}</p>
              <p class="algorithm-track-story">{{ track.story }}</p>
            </div>
            <small>{{ track.lessons.length }} 讲</small>
          </header>
          <div class="algorithm-lesson-grid">
            <button
              v-for="(lesson, lessonIndex) in track.lessons"
              :key="lesson.id"
              type="button"
              :data-algorithm-lesson="lesson.id"
              @click="emit('open-lesson', lesson.courseName)"
            >
              <i>{{ String(lessonIndex + 1).padStart(2, '0') }}</i>
              <span>
                <b>{{ lesson.title }}</b>
                <small>{{ lesson.minutes }} 分钟 · 模型、手算、实现与反例</small>
              </span>
              <ChevronRight :size="15" />
            </button>
          </div>
        </section>
      </div>
    </template>

    <template v-else-if="mode === 'visualize'">
      <AlgorithmAnimationLab />
    </template>

    <template v-else-if="mode === 'problems'">
      <section class="algorithm-problem-summary">
        <div>
          <span><Trophy :size="15" />题型库</span>
          <h2>先从故事和入门题开始，难度可以慢慢加</h2>
          <p>4,320 道原创参数化变体，默认把入门题排在前面。热点、经典、冷门、竞赛和工程场景都有，已完成 {{ completionCount }} 道。</p>
        </div>
        <div>
          <b>{{ filteredProblems.length }}</b>
          <small>当前筛选</small>
        </div>
      </section>

      <section class="algorithm-filter-panel" aria-label="算法题筛选">
        <label class="algorithm-search">
          <Search :size="16" />
          <input v-model="search" type="search" placeholder="搜索题型、结构、场景或标签" />
        </label>
        <label>
          <span><Filter :size="14" />阶段</span>
          <select v-model="trackFilter" aria-label="按算法阶段筛选">
            <option value="all">全部阶段</option>
            <option v-for="track in ALGORITHM_TRACKS" :key="track.id" :value="track.id">
              {{ track.id }} · {{ track.title }}
            </option>
          </select>
        </label>
        <div class="algorithm-filter-actions">
          <button type="button" @click="resetFilters">重置筛选</button>
        </div>
        <div class="algorithm-filter-row">
          <span>题型</span>
          <button type="button" :aria-pressed="category === 'all'" @click="setCategory('all')">全部</button>
          <button
            v-for="(label, key) in ALGORITHM_CATEGORY_LABELS"
            :key="key"
            type="button"
            :aria-pressed="category === key"
            @click="setCategory(key)"
          >
            {{ label }}
          </button>
        </div>
        <div class="algorithm-filter-row">
          <span>难度</span>
          <button type="button" :aria-pressed="difficulty === 'all'" @click="setDifficulty('all')">全部</button>
          <button
            v-for="level in ALGORITHM_DIFFICULTIES"
            :key="level"
            type="button"
            :aria-pressed="difficulty === level"
            @click="setDifficulty(level)"
          >
            {{ level }}
          </button>
        </div>
      </section>

      <section v-if="!search && category === 'all' && difficulty === 'all' && trackFilter === 'all'" class="algorithm-featured">
        <header><div><Trophy :size="16" /><b>精选题族</b></div><span>先做这 6 道建立模板</span></header>
        <div>
          <button
            v-for="problem in flagshipProblems"
            :key="problem.id"
            type="button"
            @click="openProblem(problem)"
          >
            <span>{{ problem.categoryLabel }} · {{ problem.difficulty }}</span>
            <b>{{ problem.title }}</b>
            <small>{{ problem.model }}</small>
          </button>
        </div>
      </section>

      <section class="algorithm-problem-browser" aria-label="算法题列表">
        <header>
          <span>{{ pageLabel }}</span>
          <div>
            <button type="button" :disabled="page <= 1" aria-label="上一页" @click="previousPage">
              <ChevronLeft :size="15" />
            </button>
            <b>{{ page }} / {{ totalPages }}</b>
            <button type="button" :disabled="page >= totalPages" aria-label="下一页" @click="nextPage">
              <ChevronRight :size="15" />
            </button>
          </div>
        </header>
        <div class="algorithm-problem-grid">
          <button
            v-for="problem in pagedProblems"
            :key="problem.id"
            type="button"
            class="algorithm-problem-card"
            :class="{ completed: completed[problem.id] }"
            :data-algorithm-problem="problem.id"
            @click="openProblem(problem)"
          >
            <span>
              <i>{{ problem.categoryLabel }}</i>
              <i>{{ problem.difficulty }}</i>
              <i>{{ problem.trackId }}</i>
              <CheckCircle2 v-if="completed[problem.id]" :size="14" />
            </span>
            <b>{{ problem.title }}</b>
            <p>{{ problem.story }}</p>
            <div>
              <em v-for="tag in problem.tags.slice(0, 4)" :key="tag">{{ tag }}</em>
            </div>
            <footer><span>{{ problem.complexity }}</span><ArrowRight :size="14" /></footer>
          </button>
        </div>
      </section>
    </template>

    <template v-else>
      <section class="algorithm-resource-head">
        <div>
          <span><ExternalLink :size="15" />同类题库</span>
          <h2>用平台补题量，用本课程负责方法和复盘</h2>
          <p>这里只提供官方入口和用途说明，不抓取、不复制第三方题面。练习时回到“建模、反例、复杂度”记录。</p>
        </div>
        <small>{{ ALGORITHM_RESOURCE_SITES.length }} 个官方入口</small>
      </section>
      <div class="algorithm-resource-grid">
        <a
          v-for="site in ALGORITHM_RESOURCE_SITES"
          :key="site.url"
          :href="site.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span><ExternalLink :size="15" /></span>
          <b>{{ site.name }}</b>
          <small>{{ site.focus }}</small>
          <p>{{ site.useFor }}</p>
        </a>
      </div>
    </template>

    <Teleport to="body">
      <div
        v-if="activeProblem"
        ref="focusRoot"
        class="algorithm-focus"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`algorithm-problem-title-${activeProblem.id}`"
        tabindex="-1"
      >
        <header>
          <button type="button" @click="closeProblem"><ArrowLeft :size="16" />返回题库</button>
          <div>
            <span>{{ activeProblem.categoryLabel }} · {{ activeProblem.difficulty }} · {{ activeProblem.trackId }}</span>
            <b :id="`algorithm-problem-title-${activeProblem.id}`">{{ activeProblem.title }}</b>
          </div>
          <button type="button" aria-label="关闭算法实战" @click="closeProblem"><X :size="17" /></button>
        </header>
        <div class="algorithm-focus-layout">
          <nav aria-label="算法实战步骤">
            <button
              v-for="(step, index) in problemSteps"
              :key="step.title"
              type="button"
              :class="{ active: activeStep === index, done: activeStep > index }"
              @click="activeStep = index"
            >
              <i>{{ String(index + 1).padStart(2, '0') }}</i>
              <span><b>{{ step.title }}</b><small>{{ step.hint }}</small></span>
            </button>
          </nav>
          <main>
            <div class="algorithm-focus-scroll">
              <article>
                <span>第 {{ activeStep + 1 }} / {{ problemSteps.length }} 步</span>
                <h1>{{ problemSteps[activeStep].title }}</h1>
                <p class="algorithm-focus-source">{{ activeProblem.familyTitle }} · {{ activeProblem.sourceNote }}</p>

                <template v-if="activeStep === 0">
                  <section><h2>先听一个小故事</h2><p>{{ activeProblem.story }}</p></section>
                  <section><h2>任务</h2><p>{{ activeProblem.objective }}</p></section>
                  <section><h2>输入</h2><p>{{ activeProblem.input }}</p></section>
                  <section><h2>输出</h2><p>{{ activeProblem.output }}</p></section>
                  <div class="algorithm-focus-tags"><span v-for="tag in activeProblem.tags" :key="tag">{{ tag }}</span></div>
                </template>

                <template v-else-if="activeStep === 1">
                  <section><h2>把故事画成模型</h2><p>{{ activeProblem.model }}</p></section>
                  <section>
                    <h2>先手算</h2>
                    <ol>
                      <li>画出不超过 8 个元素的输入，标出索引、状态和输出。</li>
                      <li>写出循环不变量，以及每一步为什么可以丢弃其他候选。</li>
                      <li>换成重复值、空输入或退化结构，检查模型是否仍成立。</li>
                    </ol>
                  </section>
                </template>

                <template v-else-if="activeStep === 2">
                  <section><h2>参考策略</h2><p>{{ activeProblem.approach }}</p></section>
                  <section><h2>提示</h2><ul><li v-for="hint in activeProblem.hints" :key="hint">{{ hint }}</li></ul></section>
                  <section>
                    <h2>先填这张伪代码骨架</h2>
                    <ol><li v-for="line in activeProblem.starterPseudo" :key="line">{{ line }}</li></ol>
                  </section>
                </template>

                <template v-else-if="activeStep === 3">
                  <AlgorithmCodeLab :problem="activeProblem" />
                </template>

                <template v-else-if="activeStep === 4">
                  <section><h2>易错边界</h2><ul><li v-for="pitfall in activeProblem.pitfalls" :key="pitfall">{{ pitfall }}</li></ul></section>
                  <section><h2>变体</h2><p>{{ activeProblem.variant }}</p></section>
                  <div class="algorithm-focus-alert"><CircleAlert :size="16" />至少写一个能让当前策略失效的反例，再进入下一步。</div>
                </template>

                <template v-else-if="activeStep === 5">
                  <section><h2>复杂度目标</h2><p>{{ activeProblem.complexity }}</p></section>
                  <section><h2>验收清单</h2><ul><li v-for="item in activeProblem.checklist" :key="item">{{ item }}</li></ul></section>
                </template>

                <template v-else>
                  <section><h2>迁移验收</h2><p>{{ activeProblem.variant }}</p></section>
                  <section>
                    <h2>提交物</h2>
                    <ul>
                      <li>可运行代码和至少 8 组边界/反例测试。</li>
                      <li>手算表、不变量、复杂度上界和一次基准结果。</li>
                      <li>同型题迁移记录：触发条件、不可用条件和新变体。</li>
                    </ul>
                  </section>
                  <button
                    type="button"
                    class="algorithm-finish"
                    :class="{ completed: completed[activeProblem.id] }"
                    @click="completeProblem"
                  >
                    <CheckCircle2 :size="16" />
                    {{ completed[activeProblem.id] ? '已完成，保留复盘' : '标记本题完成' }}
                  </button>
                </template>
              </article>
            </div>
            <footer>
              <button type="button" :disabled="activeStep === 0" @click="moveStep(-1)">上一步</button>
              <span>{{ activeStep + 1 }} / {{ problemSteps.length }}</span>
              <button
                type="button"
                :disabled="activeStep === problemSteps.length - 1"
                @click="moveStep(1)"
              >
                下一步<ArrowRight :size="15" />
              </button>
            </footer>
          </main>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.algorithm-workbench {
  color: var(--color-text, #17211e);
}
.algorithm-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: end;
  padding: 2px 0 18px;
  border-bottom: 1px solid var(--color-border);
}
.algorithm-head > div:first-child > span,
.algorithm-start > div > span,
.algorithm-problem-summary > div:first-child > span,
.algorithm-resource-head > div:first-child > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-primary);
  font-size: 10px;
  font-weight: 700;
}
.algorithm-head h1,
.algorithm-start h2,
.algorithm-problem-summary h2,
.algorithm-resource-head h2 {
  margin: 5px 0 7px;
  font-family: Georgia, "Songti SC", serif;
  line-height: 1.3;
}
.algorithm-head h1 { font-size: 31px; }
.algorithm-head p,
.algorithm-start p,
.algorithm-problem-summary p,
.algorithm-resource-head p {
  max-width: 760px;
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.75;
}
.algorithm-summary {
  display: grid;
  min-width: 148px;
  padding-left: 20px;
  border-left: 1px solid var(--color-border);
}
.algorithm-summary b { color: var(--color-primary); font-size: 30px; line-height: 1; }
.algorithm-summary span { margin-top: 5px; font-size: 12px; font-weight: 650; }
.algorithm-summary small { margin-top: 6px; color: var(--color-text-tertiary); font-size: 9px; }
.algorithm-mode-tabs {
  display: flex;
  width: fit-content;
  gap: 6px;
  margin: 14px 0;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 84%, transparent);
}
.algorithm-mode-tabs button {
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
.algorithm-mode-tabs button > span { white-space: nowrap; }
.algorithm-mode-tabs button[aria-pressed="true"] {
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--color-text) 9%, transparent);
}
.algorithm-mode-tabs small {
  padding: 2px 5px;
  border-radius: 999px;
  background: var(--color-bg-muted);
  font-size: 8px;
}
.algorithm-start,
.algorithm-problem-summary,
.algorithm-resource-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 15px;
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-primary);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 4%, var(--color-surface));
}
.algorithm-start h2,
.algorithm-problem-summary h2,
.algorithm-resource-head h2 { font-size: 21px; }
.algorithm-start > button {
  display: inline-flex;
  min-height: 42px;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  padding: 0 13px;
  border: 1px solid var(--color-primary);
  border-radius: 7px;
  background: var(--color-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}
.algorithm-track-list {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}
.algorithm-track {
  border-top: 1px solid var(--color-border);
  padding-top: 14px;
}
.algorithm-track > header {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  padding: 0 2px 10px;
}
.algorithm-track > header > i {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
  color: var(--color-primary);
  font: 700 11px/1 ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-style: normal;
}
.algorithm-track > header span { color: var(--color-text-tertiary); font-size: 9px; }
.algorithm-track > header h2 { margin: 3px 0 4px; font-size: 16px; }
.algorithm-track > header p { margin: 0; color: var(--color-text-secondary); font-size: 10px; line-height: 1.65; }
.algorithm-track > header .algorithm-track-story {
  margin-top: 5px;
  padding-left: 8px;
  border-left: 2px solid color-mix(in srgb, var(--color-primary) 32%, var(--color-border));
  color: var(--color-text-tertiary);
  font-size: 9px;
}
.algorithm-track > header > small { color: var(--color-text-tertiary); font-size: 9px; }
.algorithm-lesson-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.algorithm-lesson-grid button {
  display: grid;
  min-height: 62px;
  grid-template-columns: 28px minmax(0, 1fr) 16px;
  gap: 9px;
  align-items: center;
  padding: 9px 11px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.algorithm-lesson-grid button:hover {
  border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
}
.algorithm-lesson-grid button > i {
  color: var(--color-primary);
  font: 700 9px/1 ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-style: normal;
}
.algorithm-lesson-grid button b,
.algorithm-lesson-grid button small { display: block; }
.algorithm-lesson-grid button b { font-size: 11px; }
.algorithm-lesson-grid button small { margin-top: 3px; color: var(--color-text-tertiary); font-size: 8px; }
.algorithm-lesson-grid button > svg { color: var(--color-text-tertiary); }
.algorithm-problem-summary > div:last-child {
  display: grid;
  min-width: 96px;
  justify-items: end;
}
.algorithm-problem-summary > div:last-child b { color: var(--color-primary); font-size: 26px; }
.algorithm-problem-summary > div:last-child small { color: var(--color-text-tertiary); font-size: 9px; }
.algorithm-filter-panel {
  display: grid;
  gap: 9px;
  margin-top: 10px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
}
.algorithm-search {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text-tertiary);
}
.algorithm-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 11px;
}
.algorithm-filter-panel > label:not(.algorithm-search) {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: 10px;
}
.algorithm-filter-panel select {
  min-height: 36px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  padding: 0 8px;
  font: inherit;
  font-size: 10px;
}
.algorithm-filter-actions { justify-self: end; }
.algorithm-filter-actions button,
.algorithm-filter-row button {
  min-height: 34px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 9px;
  cursor: pointer;
}
.algorithm-filter-row {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.algorithm-filter-row > span { margin-right: 3px; color: var(--color-text-tertiary); font-size: 9px; }
.algorithm-filter-row button[aria-pressed="true"] {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
  color: var(--color-primary);
  font-weight: 700;
}
.algorithm-featured {
  margin-top: 10px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 3%, var(--color-surface));
}
.algorithm-featured > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.algorithm-featured > header > div { display: inline-flex; align-items: center; gap: 6px; color: var(--color-primary); font-size: 10px; }
.algorithm-featured > header > span { color: var(--color-text-tertiary); font-size: 9px; }
.algorithm-featured > div {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.algorithm-featured button {
  min-width: 0;
  padding: 9px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.algorithm-featured button span,
.algorithm-featured button b,
.algorithm-featured button small { display: block; }
.algorithm-featured button span { color: var(--color-primary); font-size: 8px; }
.algorithm-featured button b { margin-top: 4px; font-size: 10px; }
.algorithm-featured button small {
  display: -webkit-box;
  margin-top: 4px;
  overflow: hidden;
  color: var(--color-text-tertiary);
  font-size: 8px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.algorithm-problem-browser {
  margin-top: 12px;
}
.algorithm-problem-browser > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.algorithm-problem-browser > header > span { color: var(--color-text-tertiary); font-size: 9px; }
.algorithm-problem-browser > header > div { display: flex; align-items: center; gap: 6px; }
.algorithm-problem-browser > header button {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
}
.algorithm-problem-browser > header button:disabled { opacity: .35; cursor: not-allowed; }
.algorithm-problem-browser > header b { min-width: 64px; color: var(--color-text-secondary); font-size: 9px; text-align: center; }
.algorithm-problem-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.algorithm-problem-card {
  display: block;
  min-width: 0;
  min-height: 204px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.algorithm-problem-card:hover { border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border)); }
.algorithm-problem-card.completed { border-left: 3px solid var(--color-primary); }
.algorithm-problem-card > span { display: flex; align-items: center; gap: 5px; }
.algorithm-problem-card > span i {
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--color-bg-muted);
  color: var(--color-text-tertiary);
  font-size: 8px;
  font-style: normal;
}
.algorithm-problem-card > span svg { margin-left: auto; color: var(--color-primary); }
.algorithm-problem-card > b { display: block; margin-top: 9px; font-size: 12px; }
.algorithm-problem-card > p {
  display: -webkit-box;
  margin: 6px 0 0;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 9px;
  line-height: 1.6;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.algorithm-problem-card > div { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.algorithm-problem-card > div em {
  padding: 2px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--color-primary) 7%, var(--color-surface));
  color: var(--color-primary);
  font-size: 7px;
  font-style: normal;
}
.algorithm-problem-card > footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  color: var(--color-text-tertiary);
  font-size: 8px;
}
.algorithm-resource-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.algorithm-resource-grid a {
  display: block;
  min-height: 154px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
  color: inherit;
  text-decoration: none;
}
.algorithm-resource-grid a:hover { border-color: var(--color-primary); }
.algorithm-resource-grid a > span { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 6px; background: color-mix(in srgb, var(--color-primary) 9%, var(--color-surface)); color: var(--color-primary); }
.algorithm-resource-grid b { display: block; margin-top: 9px; font-size: 12px; }
.algorithm-resource-grid small { display: block; margin-top: 3px; color: var(--color-primary); font-size: 8px; }
.algorithm-resource-grid p { margin: 7px 0 0; color: var(--color-text-secondary); font-size: 9px; line-height: 1.6; }
.algorithm-lesson-grid button:focus-visible,
.algorithm-mode-tabs button:focus-visible,
.algorithm-filter-panel button:focus-visible,
.algorithm-problem-card:focus-visible,
.algorithm-featured button:focus-visible,
.algorithm-resource-grid a:focus-visible,
.algorithm-start > button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.algorithm-focus {
  --alg-focus-bg: #071412;
  --alg-focus-panel: #0f211e;
  --alg-focus-line: rgba(178, 222, 211, .16);
  --alg-focus-ink: #effaf6;
  --alg-focus-muted: #9eb8b1;
  --alg-focus-accent: #5eead4;
  --alg-paper: #f2f7f4;
  --alg-paper-ink: #15221f;
  --alg-paper-muted: #526760;
  position: fixed;
  inset: 0;
  z-index: 6000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--alg-focus-ink);
  background: linear-gradient(135deg, var(--alg-focus-bg), #0b1c19 64%, #071412);
  outline: none;
}
.algorithm-focus > header {
  flex: 0 0 58px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 0 18px;
  border-bottom: 1px solid var(--alg-focus-line);
  background: rgba(7, 20, 18, .97);
}
.algorithm-focus > header button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid var(--alg-focus-line);
  border-radius: 6px;
  background: var(--alg-focus-panel);
  color: var(--alg-focus-muted);
  font-size: 10px;
  cursor: pointer;
}
.algorithm-focus > header > div { min-width: 0; }
.algorithm-focus > header span,
.algorithm-focus > header b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.algorithm-focus > header span { color: var(--alg-focus-accent); font-size: 9px; }
.algorithm-focus > header b { margin-top: 2px; color: var(--alg-focus-ink); font-size: 11px; }
.algorithm-focus-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
}
.algorithm-focus-layout > nav {
  min-height: 0;
  overflow-y: auto;
  padding: 18px 12px;
  border-right: 1px solid var(--alg-focus-line);
  background: rgba(11, 31, 27, .76);
}
.algorithm-focus-layout > nav button {
  display: grid;
  width: 100%;
  min-height: 54px;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--alg-focus-muted);
  text-align: left;
  cursor: pointer;
}
.algorithm-focus-layout > nav button > i {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 1px solid var(--alg-focus-line);
  border-radius: 50%;
  font: 9px/1 ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-style: normal;
}
.algorithm-focus-layout > nav button b,
.algorithm-focus-layout > nav button small { display: block; }
.algorithm-focus-layout > nav button b { color: var(--alg-focus-ink); font-size: 10px; }
.algorithm-focus-layout > nav button small { margin-top: 2px; color: var(--alg-focus-muted); font-size: 8px; line-height: 1.4; }
.algorithm-focus-layout > nav button.active {
  border-color: rgba(94, 234, 212, .4);
  background: rgba(94, 234, 212, .1);
  box-shadow: inset 2px 0 0 var(--alg-focus-accent);
}
.algorithm-focus-layout > nav button.done > i { border-color: var(--alg-focus-accent); color: var(--alg-focus-accent); }
.algorithm-focus-layout > main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.algorithm-focus-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px clamp(18px, 5vw, 64px) 30px;
}
.algorithm-focus-scroll > article {
  width: min(900px, 100%);
  min-height: 100%;
  margin: 0 auto;
  padding: 28px clamp(22px, 4vw, 44px);
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 8px;
  background: var(--alg-paper);
  color: var(--alg-paper-ink);
  box-shadow: 0 22px 72px rgba(0, 0, 0, .28);
}
.algorithm-focus-scroll article > span {
  color: #0f766e;
  font-size: 10px;
  font-weight: 700;
}
.algorithm-focus-scroll h1 {
  margin: 8px 0 6px;
  color: var(--alg-paper-ink);
  font-size: clamp(25px, 3vw, 38px);
}
.algorithm-focus-source {
  margin: 0 0 22px;
  color: var(--alg-paper-muted);
  font-size: 11px;
  line-height: 1.65;
}
.algorithm-focus-scroll section {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid rgba(21, 34, 31, .11);
}
.algorithm-focus-scroll section h2 { margin: 0 0 8px; color: var(--alg-paper-ink); font-size: 14px; }
.algorithm-focus-scroll section p,
.algorithm-focus-scroll section li {
  color: var(--alg-paper-muted);
  font-size: 13px;
  line-height: 1.85;
}
.algorithm-focus-scroll section p { margin: 0; }
.algorithm-focus-scroll section ul,
.algorithm-focus-scroll section ol { margin: 0; padding-left: 20px; }
.algorithm-focus-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 18px; }
.algorithm-focus-tags span { padding: 3px 7px; border: 1px solid rgba(15, 118, 110, .25); border-radius: 999px; color: #0f766e; font-size: 9px; }
.algorithm-focus-alert {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-top: 18px;
  padding: 12px;
  border-left: 3px solid #b45309;
  background: color-mix(in srgb, #f59e0b 7%, var(--alg-paper));
  color: #92400e;
  font-size: 11px;
  line-height: 1.65;
}
.algorithm-finish {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  gap: 6px;
  margin-top: 20px;
  padding: 0 13px;
  border: 1px solid #0f766e;
  border-radius: 6px;
  background: var(--alg-paper);
  color: #0f766e;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.algorithm-finish.completed { background: #0f766e; color: #fff; }
.algorithm-focus-layout > main > footer {
  flex: 0 0 66px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 clamp(18px, 5vw, 64px);
  border-top: 1px solid var(--alg-focus-line);
  background: rgba(7, 20, 18, .96);
}
.algorithm-focus-layout > main > footer button {
  display: inline-flex;
  min-width: 100px;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid var(--alg-focus-line);
  border-radius: 6px;
  background: var(--alg-focus-panel);
  color: var(--alg-focus-muted);
  font-size: 10px;
  cursor: pointer;
}
.algorithm-focus-layout > main > footer button:last-child { border-color: rgba(94, 234, 212, .4); color: var(--alg-focus-accent); }
.algorithm-focus-layout > main > footer button:disabled { opacity: .35; cursor: not-allowed; }
.algorithm-focus-layout > main > footer span { color: var(--alg-focus-muted); font-size: 9px; }

@media (max-width: 900px) {
  .algorithm-head { grid-template-columns: 1fr; gap: 12px; padding-bottom: 14px; }
  .algorithm-head h1 { font-size: 25px; }
  .algorithm-summary {
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: baseline;
    gap: 6px;
    padding: 9px 0 0;
    border-top: 1px solid var(--color-border);
    border-left: 0;
  }
  .algorithm-summary b { font-size: 22px; }
  .algorithm-summary span,
  .algorithm-summary small { margin: 0; }
  .algorithm-summary small { text-align: right; }
  .algorithm-mode-tabs { width: 100%; }
  .algorithm-mode-tabs {
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }
  .algorithm-mode-tabs::-webkit-scrollbar { display: none; }
  .algorithm-mode-tabs button { min-height: 44px; flex: 1 0 auto; justify-content: center; }
  .algorithm-start,
  .algorithm-problem-summary,
  .algorithm-resource-head { align-items: flex-start; flex-direction: column; }
  .algorithm-start > button { width: 100%; justify-content: center; }
  .algorithm-lesson-grid,
  .algorithm-problem-grid { grid-template-columns: 1fr; }
  .algorithm-lesson-grid button { min-height: 64px; }
  .algorithm-filter-panel { grid-template-columns: 1fr; }
  .algorithm-filter-actions { justify-self: stretch; }
  .algorithm-filter-actions button { width: 100%; min-height: 44px; }
  .algorithm-filter-row button { min-height: 44px; }
  .algorithm-featured > div { grid-template-columns: 1fr; }
  .algorithm-resource-grid { grid-template-columns: 1fr; }
  .algorithm-focus-layout { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  .algorithm-focus-layout > nav {
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 9px 12px;
    border-right: 0;
    border-bottom: 1px solid var(--alg-focus-line);
  }
  .algorithm-focus-layout > nav button { flex: 0 0 146px; min-height: 48px; margin: 0 6px 0 0; }
  .algorithm-focus-layout > nav button small { display: none; }
  .algorithm-focus-scroll { padding: 14px 10px 20px; }
  .algorithm-focus-scroll > article { padding: 22px 18px; }
  .algorithm-focus > header { padding: 0 10px; }
  .algorithm-focus > header button:first-child { padding: 0 7px; font-size: 0; }
  .algorithm-focus-layout > main > footer { padding: 0 12px; }
}

@media (max-width: 520px) {
  .algorithm-head h1 { font-size: 21px; }
  .algorithm-head p,
  .algorithm-start p,
  .algorithm-problem-summary p,
  .algorithm-resource-head p { font-size: 11px; }
  .algorithm-start h2,
  .algorithm-problem-summary h2,
  .algorithm-resource-head h2 { font-size: 18px; }
  .algorithm-mode-tabs button { padding: 0 7px; font-size: 9px; }
  .algorithm-mode-tabs button small { display: none; }
  .algorithm-track > header { grid-template-columns: 38px minmax(0, 1fr); }
  .algorithm-track > header > small { grid-column: 2; }
  .algorithm-problem-card { min-height: 0; }
  .algorithm-focus-layout > main > footer button { min-width: 88px; }
}
</style>
