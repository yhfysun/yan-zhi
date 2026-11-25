<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  Check,
  Download,
  FileJson,
  PackageOpen,
  Trash2,
  Upload,
  X,
} from 'lucide-vue-next';
import {
  createLearningContentSelectionManifest,
  createLearningSubjectPack,
  learningSubjectPackFileName,
  parseLearningSubjectPack,
  serializeLearningSubjectPack,
  type LearningSubjectContentPack,
  type LearningV2SubjectView,
} from '@yan-zhi/shared';
import {
  removeStoredLearningContentPack,
  saveStoredLearningContentPack,
} from './content-packs-storage';

const props = defineProps<{
  open: boolean;
  subjects: readonly LearningV2SubjectView[];
  registeredPacks: readonly LearningSubjectContentPack[];
  currentSubjectKey: string;
}>();

const emit = defineEmits<{
  close: [];
  imported: [pack: LearningSubjectContentPack];
  removed: [subjectKey: string];
}>();

const selectedKeys = ref<string[]>([]);
const importMode = ref<'coexist' | 'replace'>('coexist');
const busy = ref(false);
const message = ref('');
const error = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);

const importedKeys = computed(() =>
  new Set(props.registeredPacks.map((pack) => pack.subject.key)),
);

watch(() => props.open, async (open) => {
  if (!open) return;
  error.value = '';
  message.value = '';
  if (!selectedKeys.value.includes(props.currentSubjectKey)) {
    selectedKeys.value = [props.currentSubjectKey];
  }
  await nextTick();
  closeButton.value?.focus();
});

function toggleSubject(key: string): void {
  selectedKeys.value = selectedKeys.value.includes(key)
    ? selectedKeys.value.filter((item) => item !== key)
    : [...selectedKeys.value, key];
}

function downloadText(fileName: string, content: string, type = 'application/json'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function forkPackForCoexist(pack: LearningSubjectContentPack): LearningSubjectContentPack {
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Date.now().toString(36);
  const subjectKey = `${pack.subject.key}-u-${suffix}`.slice(0, 64);
  return {
    ...pack,
    packageId: `learning.subject.${subjectKey}`,
    distribution: 'ondemand',
    subject: {
      ...pack.subject,
      key: subjectKey,
      name: `${pack.subject.name} · 导入`,
    },
    courses: pack.courses.map((course) => ({
      ...course,
      id: `${subjectKey}:${course.id}`,
      plan: {
        ...course.plan,
        subjectKey,
      },
    })),
  };
}

function exportSubject(subject: LearningV2SubjectView): void {
  const pack = createLearningSubjectPack(subject.key, {
    distribution: importedKeys.value.has(subject.key) ? 'ondemand' : 'bundled',
  });
  downloadText(learningSubjectPackFileName(subject.key), serializeLearningSubjectPack(pack));
  message.value = `已导出“${subject.name}”：${pack.counts.courses} 门课程、${pack.counts.steps} 个步骤。`;
  error.value = '';
}

function exportSelectionManifest(): void {
  if (selectedKeys.value.length === 0) {
    error.value = '至少选择一个科目。';
    return;
  }
  const selected = new Set(selectedKeys.value);
  const manifest = createLearningContentSelectionManifest(
    props.subjects.map((subject) => ({
      subjectKey: subject.key,
      distribution: selected.has(subject.key) ? 'bundled' : 'excluded',
      subjectName: subject.name,
    })),
  );
  downloadText('selection.manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  message.value = `已生成 ${selectedKeys.value.length} 个科目的打包选择清单。`;
  error.value = '';
}

async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) {
    error.value = '内容包超过 25 MB，请拆分后再导入。';
    return;
  }

  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    let pack = parseLearningSubjectPack(JSON.parse(await file.text()));
    const conflicts = props.subjects.some((subject) => subject.key === pack.subject.key);
    if (conflicts && importMode.value === 'coexist') {
      pack = forkPackForCoexist(pack);
    }
    await saveStoredLearningContentPack(pack);
    emit('imported', pack);
    message.value = `已导入“${pack.subject.name}”：${pack.counts.courses} 门课程，采用${importMode.value === 'coexist' ? '并存' : '覆盖'}策略。`;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '内容包导入失败。';
  } finally {
    busy.value = false;
  }
}

async function removePack(subjectKey: string): Promise<void> {
  busy.value = true;
  try {
    await removeStoredLearningContentPack(subjectKey);
    emit('removed', subjectKey);
    message.value = '已移除用户内容包，当前科目恢复内置版本。';
    error.value = '';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '移除内容包失败。';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="lcm-overlay"
      data-learning-content-manager
      @click.self="emit('close')"
    >
      <section
        class="lcm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lcm-title"
        @keydown.esc.stop="emit('close')"
      >
        <header>
          <div>
            <span>科目数据</span>
            <h2 id="lcm-title">导出、导入与打包选择</h2>
            <p>科目数据独立为 `.yzcourse.json`；安装包可按选择清单决定带入哪些科目。</p>
          </div>
          <button ref="closeButton" type="button" aria-label="关闭科目数据管理" @click="emit('close')">
            <X :size="18" />
          </button>
        </header>

        <div class="lcm-toolbar">
          <button type="button" class="lcm-primary" :disabled="busy" @click="fileInput?.click()">
            <Upload :size="15" />{{ busy ? '处理中' : '导入内容包' }}
          </button>
          <button type="button" :disabled="selectedKeys.length === 0" @click="exportSelectionManifest">
            <PackageOpen :size="15" />生成打包清单
          </button>
          <input
            ref="fileInput"
            type="file"
            accept=".json,.yzcourse,application/json"
            hidden
            @change="importFile"
          />
          <label class="lcm-mode">
            <span>同科冲突</span>
            <select v-model="importMode" aria-label="导入冲突策略">
              <option value="coexist">并存（推荐）</option>
              <option value="replace">覆盖当前用户包</option>
            </select>
          </label>
          <span>{{ selectedKeys.length }} 个科目已选</span>
        </div>

        <p v-if="error" class="lcm-error" role="alert">{{ error }}</p>
        <p v-else-if="message" class="lcm-message" role="status">{{ message }}</p>

        <div class="lcm-list" role="list">
          <article
            v-for="subject in subjects"
            :key="subject.key"
            role="listitem"
            :class="{ selected: selectedKeys.includes(subject.key) }"
          >
            <button
              type="button"
              class="lcm-select"
              :aria-pressed="selectedKeys.includes(subject.key)"
              :aria-label="`选择${subject.name}用于打包`"
              @click="toggleSubject(subject.key)"
            >
              <Check v-if="selectedKeys.includes(subject.key)" :size="14" />
            </button>
            <div class="lcm-subject-copy">
              <b>{{ subject.name }}</b>
              <small>{{ subject.tracks.length }} 阶段 · {{ subject.courses.length }} 门课程</small>
            </div>
            <span class="lcm-state" :class="{ imported: importedKeys.has(subject.key) }">
              {{ importedKeys.has(subject.key) ? '用户包' : '内置' }}
            </span>
            <button type="button" class="lcm-icon" :aria-label="`导出${subject.name}内容包`" @click="exportSubject(subject)">
              <Download :size="15" />
            </button>
            <button
              v-if="importedKeys.has(subject.key)"
              type="button"
              class="lcm-icon danger"
              :aria-label="`移除${subject.name}用户内容包`"
              :disabled="busy"
              @click="removePack(subject.key)"
            >
              <Trash2 :size="15" />
            </button>
          </article>
        </div>

        <footer>
          <FileJson :size="14" />
          <span>导出文件保留课程、步骤、题库、代码台和来源；不包含用户笔记与学习进度。</span>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.lcm-overlay {
  position: fixed;
  inset: 0;
  z-index: 5200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(18, 28, 24, .46);
  backdrop-filter: blur(8px);
}
.lcm-dialog {
  display: flex;
  width: min(920px, 100%);
  max-height: min(82vh, 820px);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #cbd6cf;
  border-radius: 10px;
  background: #f8faf8;
  color: #1d2a23;
  box-shadow: 0 28px 80px rgba(12, 24, 18, .28);
}
.lcm-dialog > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid #d9e1dc;
}
.lcm-dialog > header span { color: #2f6d54; font-size: 9px; font-weight: 750; letter-spacing: .08em; }
.lcm-dialog > header h2 { margin: 3px 0 5px; font-size: 21px; }
.lcm-dialog > header p { margin: 0; color: #607068; font-size: 11px; line-height: 1.6; }
.lcm-dialog > header button {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid #d1dad4;
  border-radius: 7px;
  background: #fff;
  color: #41534a;
  cursor: pointer;
}
.lcm-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 22px;
  border-bottom: 1px solid #e2e8e4;
}
.lcm-toolbar button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border: 1px solid #cbd5ce;
  border-radius: 7px;
  background: #fff;
  color: #34463d;
  font-size: 10px;
  font-weight: 650;
  cursor: pointer;
}
.lcm-toolbar button.lcm-primary { border-color: #2f6d54; background: #2f6d54; color: #fff; }
.lcm-toolbar button:disabled { cursor: not-allowed; opacity: .5; }
.lcm-toolbar > span { margin-left: auto; color: #718078; font-size: 9px; }
.lcm-mode { display: inline-flex; min-height: 36px; align-items: center; gap: 6px; color: #65736b; font-size: 9px; }
.lcm-mode select {
  height: 32px;
  padding: 0 24px 0 8px;
  border: 1px solid #cbd5ce;
  border-radius: 7px;
  background: #fff;
  color: #34463d;
  font-size: 9px;
}
.lcm-error, .lcm-message {
  margin: 10px 22px 0;
  padding: 9px 11px;
  border-radius: 7px;
  font-size: 10px;
  line-height: 1.5;
}
.lcm-error { border: 1px solid #e1b8ae; background: #fff4f1; color: #8a3527; }
.lcm-message { border: 1px solid #b9d8c7; background: #eef8f1; color: #275c43; }
.lcm-list {
  display: grid;
  min-height: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  overflow-y: auto;
  padding: 14px 22px 20px;
  scrollbar-width: none;
}
.lcm-list::-webkit-scrollbar { display: none; }
.lcm-list article {
  display: grid;
  min-width: 0;
  grid-template-columns: 28px minmax(0, 1fr) auto 32px 32px;
  gap: 8px;
  align-items: center;
  padding: 9px;
  border: 1px solid #d8e0db;
  border-radius: 8px;
  background: #fff;
}
.lcm-list article.selected { border-color: #5c9279; background: #f0f7f3; }
.lcm-select {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 1px solid #c9d3cd;
  border-radius: 6px;
  background: #fff;
  color: #2f6d54;
  cursor: pointer;
}
.selected .lcm-select { border-color: #2f6d54; background: #2f6d54; color: #fff; }
.lcm-subject-copy { min-width: 0; }
.lcm-subject-copy b, .lcm-subject-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lcm-subject-copy b { font-size: 10px; }
.lcm-subject-copy small { margin-top: 2px; color: #738078; font-size: 8px; }
.lcm-state {
  padding: 3px 6px;
  border: 1px solid #d5dcd8;
  border-radius: 999px;
  color: #758078;
  font-size: 8px;
  white-space: nowrap;
}
.lcm-state.imported { border-color: #8eb49f; background: #edf6f1; color: #2f6d54; }
.lcm-icon {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid #d3dcd6;
  border-radius: 6px;
  background: #fff;
  color: #465a50;
  cursor: pointer;
}
.lcm-icon.danger { color: #9b4032; }
.lcm-dialog > footer {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 12px 22px;
  border-top: 1px solid #d9e1dc;
  background: #eff3f0;
  color: #65736b;
  font-size: 9px;
}
@media (max-width: 700px) {
  .lcm-overlay { padding: 10px; }
  .lcm-dialog { max-height: 92vh; }
  .lcm-dialog > header { padding: 16px; }
  .lcm-toolbar { padding: 10px 16px; flex-wrap: wrap; }
  .lcm-toolbar > span { width: 100%; margin-left: 0; }
  .lcm-mode { width: 100%; justify-content: space-between; }
  .lcm-mode select { min-height: 40px; }
  .lcm-list { grid-template-columns: 1fr; padding: 12px 16px 16px; }
  .lcm-dialog > footer { padding: 10px 16px; }
}
</style>
