<script setup lang="ts">
import { computed } from 'vue';
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  NotebookPen,
  Wrench,
  X,
} from 'lucide-vue-next';

export type LearningSessionStage = 'learn' | 'practice' | 'apply' | 'coach';

const props = defineProps<{
  subjectName: string;
  courseName: string;
  courseTitle: string;
  stage: LearningSessionStage;
  stepLabel: string;
  practiceLabel: string;
  applyLabel: string;
  objective: string;
  evidence: string;
  output: string;
  learnDone: boolean;
  practiceDone: boolean;
  applyDone: boolean;
  nextCourseName: string;
}>();

const emit = defineEmits<{
  exit: [];
  'stage-change': [stage: 'learn' | 'practice' | 'apply'];
  coach: [];
  'next-lesson': [];
}>();

const stages = [
  { key: 'learn' as const, label: '学习', icon: BookOpen },
  { key: 'practice' as const, label: '练习', icon: ClipboardCheck },
  { key: 'apply' as const, label: '实践', icon: Wrench },
];

const showCourseTitle = computed(() =>
  !!props.courseTitle.trim() && props.courseTitle.trim() !== props.courseName.trim(),
);

function stageDone(stage: 'learn' | 'practice' | 'apply'): boolean {
  if (stage === 'learn') return props.learnDone;
  if (stage === 'practice') return props.practiceDone;
  return props.applyDone;
}

function stageSummary(stage: 'learn' | 'practice' | 'apply'): string {
  if (stage === 'learn') return props.stepLabel;
  if (stage === 'practice') return props.practiceLabel;
  return props.applyLabel;
}
</script>

<template>
  <section
    class="learning-session"
    :data-stage="stage"
    data-learning-session
    aria-label="本课连续学习会话"
  >
    <header class="session-top">
      <button class="session-back" type="button" aria-label="返回教材" @click="emit('exit')">
        <ChevronLeft :size="17" />
        <span>返回教材</span>
      </button>

      <div
        class="session-identity"
        :class="{ 'has-subtitle': showCourseTitle }"
        data-learning-session-course
      >
        <span>{{ subjectName }}</span>
        <b>{{ courseName }}</b>
        <small v-if="showCourseTitle">{{ courseTitle }}</small>
      </div>

      <div class="session-actions">
        <button
          v-if="nextCourseName"
          class="session-action session-next"
          type="button"
          :aria-label="`下一课：${nextCourseName}`"
          @click="emit('next-lesson')"
        >
          <span>下一课</span>
          <ChevronRight :size="15" />
        </button>
        <button
          class="session-action"
          type="button"
          :class="{ active: stage === 'coach' }"
          :aria-pressed="stage === 'coach'"
          @click="emit('coach')"
        >
          <NotebookPen :size="16" />
          <span>陪练</span>
        </button>
        <button class="session-exit" type="button" aria-label="退出本课" @click="emit('exit')">
          <X :size="17" />
        </button>
      </div>
    </header>

    <nav class="session-stages" aria-label="本课学习阶段">
      <button
        v-for="item in stages"
        :key="item.key"
        class="session-stage"
        :class="{
          active: stage === item.key,
          done: stageDone(item.key),
        }"
        type="button"
        :data-session-stage="item.key"
        :aria-current="stage === item.key ? 'step' : undefined"
        @click="emit('stage-change', item.key)"
      >
        <span class="session-stage-icon">
          <Check v-if="stageDone(item.key) && stage !== item.key" :size="14" />
          <component :is="item.icon" v-else :size="15" />
        </span>
        <span class="session-stage-copy">
          <b class="session-stage-name">{{ item.label }}</b>
          <small>{{ stageSummary(item.key) }}</small>
        </span>
      </button>
    </nav>

    <div class="session-context" aria-label="本步学习上下文" aria-live="polite">
      <div>
        <span>本步目标</span>
        <p>{{ objective }}</p>
      </div>
      <div>
        <span>完成证据</span>
        <p>{{ evidence }}</p>
      </div>
      <div>
        <span>本课产出</span>
        <p>{{ output }}</p>
      </div>
    </div>

    <div class="session-surface">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.learning-session {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 0;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid #cfd6d0;
  border-radius: 10px;
  background: #f5f4ee;
  color: #17221d;
}

.session-top {
  display: grid;
  min-height: 62px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 9px 14px;
  background: #182b23;
  color: #eef5f0;
}

.session-back,
.session-action,
.session-exit {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, .18);
  border-radius: 7px;
  background: rgba(255, 255, 255, .045);
  color: #eef5f0;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
}

.session-back {
  padding: 0 12px;
}

.session-identity {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 7px;
  align-items: baseline;
}

.session-identity.has-subtitle {
  grid-template-columns: auto minmax(0, auto) minmax(0, 1fr);
}

.session-identity span,
.session-identity small {
  overflow: hidden;
  color: #a7b8af;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-identity b {
  overflow: hidden;
  color: #f2f6f3;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-identity small {
  padding-left: 2px;
}

.session-actions {
  display: flex;
  gap: 7px;
}

.session-action {
  padding: 0 10px;
}

.session-action.active {
  border-color: #91b6a2;
  background: rgba(145, 182, 162, .14);
}

.session-next {
  border-color: rgba(145, 182, 162, .5);
  background: rgba(145, 182, 162, .12);
}

.session-exit {
  width: 38px;
  padding: 0;
}

.session-back:hover,
.session-action:hover,
.session-exit:hover {
  border-color: rgba(255, 255, 255, .34);
  background: rgba(255, 255, 255, .09);
}

.session-stages {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-bottom: 1px solid #d7ddd7;
  background: #f2f1eb;
}

.session-stage {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 52px;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  padding: 7px 16px;
  border: 0;
  border-right: 1px solid #d7ddd7;
  background: transparent;
  color: #68746d;
  text-align: left;
  cursor: pointer;
}

.session-stage:last-child {
  border-right: 0;
}

.session-stage:hover {
  background: rgba(37, 106, 80, .045);
}

.session-stage-icon {
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border: 1px solid #c6cdc7;
  border-radius: 50%;
  background: #fbfaf6;
  color: #68746d;
}

.session-stage-copy {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.session-stage-copy b,
.session-stage-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-stage-copy b {
  color: inherit;
  font-size: 12px;
  font-weight: 650;
}

.session-stage-copy small {
  color: #7a857e;
  font-size: 10px;
}

.session-stage.active {
  background: #fbfaf6;
  color: #256a50;
}

.session-stage.active::after {
  position: absolute;
  right: 14px;
  bottom: 0;
  left: 14px;
  height: 2px;
  background: #256a50;
  content: "";
}

.session-stage.active .session-stage-icon {
  border-color: #256a50;
  background: #256a50;
  color: #fff;
}

.session-stage.done:not(.active) .session-stage-icon {
  border-color: #8fb19d;
  background: #e4efe8;
  color: #256a50;
}

.session-context {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 1px;
  border-bottom: 1px solid #d7ddd7;
  background: #d7ddd7;
}

.session-context > div {
  min-width: 0;
  padding: 10px 14px;
  background: #f9f8f3;
}

.session-context span {
  display: block;
  margin-bottom: 2px;
  color: #597065;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .05em;
}

.session-context p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: #4d5a53;
  font-size: 10px;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.session-surface {
  min-height: 0;
  overflow: hidden;
  background: #f5f4ee;
}

.session-back:focus-visible,
.session-action:focus-visible,
.session-exit:focus-visible,
.session-stage:focus-visible {
  outline: 2px solid #75aa8f;
  outline-offset: 2px;
}

@media (max-width: 900px) {
  .learning-session {
    grid-template-rows: auto auto auto minmax(0, 1fr);
    min-height: 100%;
    margin: 0;
    border: 0;
    border-radius: 0;
  }

  .session-top {
    min-height: 58px;
    gap: 8px;
    padding: 8px 10px;
  }

  .session-back {
    width: 42px;
    min-height: 42px;
    padding: 0;
  }

  .session-back span {
    display: none;
  }

  .session-identity {
    grid-template-columns: minmax(0, 1fr);
    gap: 1px;
  }

  .session-identity span {
    display: none;
  }

  .session-identity b {
    font-size: 12px;
  }

  .session-identity small {
    font-size: 9px;
  }

  .session-action {
    width: 42px;
    min-height: 42px;
    padding: 0;
  }

  .session-action span {
    display: none;
  }

  .session-exit {
    width: 42px;
    height: 42px;
  }

  .session-stages {
    min-width: 0;
  }

  .session-stage {
    min-height: 50px;
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 6px;
    padding: 6px 8px;
  }

  .session-stage-icon {
    width: 23px;
    height: 23px;
  }

  .session-stage-copy {
    display: block;
  }

  .session-stage-copy b {
    display: block;
    font-size: 11px;
  }

  .session-stage-copy small {
    display: block;
    margin-top: 1px;
    font-size: 8px;
  }

  .session-context {
    display: block;
    overflow-x: auto;
    padding: 8px 10px;
    border-bottom: 1px solid #d7ddd7;
    background: #f9f8f3;
  }

  .session-context > div {
    display: none;
    padding: 0;
    background: transparent;
  }

  .session-context > div:first-child {
    display: block;
  }

  .session-context p {
    font-size: 10px;
    -webkit-line-clamp: 1;
  }

  .session-surface {
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
  }
}

@media (max-width: 370px) {
  .session-actions {
    gap: 4px;
  }

  .session-action {
    display: none;
  }

  .session-stage {
    padding-inline: 6px;
  }
}
</style>
