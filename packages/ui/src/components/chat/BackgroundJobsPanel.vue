<template>
  <section v-if="jobs.length" class="background-jobs" aria-label="后台任务">
    <div class="bj-head">
      <span class="bj-title">
        <el-icon :size="14"><Package /></el-icon>
        后台任务
      </span>
      <span class="bj-count">{{ activeCount ? `${activeCount} 个进行中` : '全部结束' }}</span>
      <button
        v-if="completedCount"
        type="button"
        class="bj-text-btn"
        :aria-expanded="showCompleted"
        @click="showCompleted = !showCompleted"
      >
        {{ showCompleted ? '收起已结束' : `查看已结束 ${completedCount}` }}
        <el-icon :size="11" :class="{ 'is-open': showCompleted }"><ChevronDown /></el-icon>
      </button>
    </div>

    <div class="bj-list">
      <article
        v-for="job in visibleJobs"
        :key="job.jobId"
        class="bj-row"
        :class="`is-${job.status}`"
      >
        <span class="bj-kind" :title="kindLabel(job.kind)">
          <el-icon :size="15"><component :is="kindIcon(job.kind)" /></el-icon>
        </span>
        <div class="bj-main">
          <div class="bj-line">
            <span class="bj-name" :title="job.title">{{ job.title }}</span>
            <span class="bj-status">{{ statusLabel(job.status) }}</span>
            <span v-if="job.error" class="bj-error" :title="job.error">{{ job.error }}</span>
          </div>
          <div v-if="isRunning(job)" class="bj-progress-line">
            <div class="bj-progress" role="progressbar" :aria-valuenow="job.progress ?? undefined" aria-valuemin="0" aria-valuemax="100">
              <span :style="{ width: `${Math.max(2, Number(job.progress) || 0)}%` }"></span>
            </div>
            <span class="bj-meta">
              <template v-if="job.progress != null">{{ Math.round(job.progress) }}%</template>
              <template v-else>{{ formatBytes(job.bytesDone || 0) }}</template>
              <template v-if="job.bytesTotal"> · {{ formatBytes(job.bytesDone || 0) }}/{{ formatBytes(job.bytesTotal) }}</template>
              <template v-if="job.speedBps"> · {{ formatSpeed(job.speedBps) }}</template>
              <template v-if="job.etaMs"> · 约 {{ formatDuration(job.etaMs) }}</template>
            </span>
          </div>
          <div v-else-if="job.artifactPaths?.length" class="bj-artifacts">
            <span class="bj-path" :title="job.artifactPaths[0]">{{ baseName(job.artifactPaths[0]) }}</span>
            <button type="button" class="bj-icon-btn" aria-label="在文件管理器中显示" title="在文件管理器中显示" @click="$emit('reveal', job.artifactPaths![0])">
              <el-icon :size="13"><FolderOpen /></el-icon>
            </button>
          </div>
        </div>
        <div class="bj-actions">
          <button
            v-if="job.status === 'paused'"
            type="button"
            class="bj-icon-btn"
            aria-label="恢复任务"
            title="恢复"
            :disabled="!job.controlCapabilities?.resume"
            @click="$emit('control', job.jobId, 'resume')"
          >
            <el-icon :size="14"><Play /></el-icon>
          </button>
          <button
            v-else-if="isRunning(job)"
            type="button"
            class="bj-icon-btn"
            aria-label="暂停任务"
            title="暂停"
            :disabled="!job.controlCapabilities?.pause"
            @click="$emit('control', job.jobId, 'pause')"
          >
            <el-icon :size="14"><Pause /></el-icon>
          </button>
          <button
            v-if="isRunning(job) || job.status === 'paused'"
            type="button"
            class="bj-icon-btn is-danger"
            aria-label="取消任务"
            title="取消"
            :disabled="!job.controlCapabilities?.cancel"
            @click="$emit('control', job.jobId, 'cancel')"
          >
            <el-icon :size="14"><X /></el-icon>
          </button>
          <span v-if="job.status === 'completed'" class="bj-terminal-ok" aria-label="已完成">
            <el-icon :size="16"><CircleCheck /></el-icon>
          </span>
          <span v-else-if="isTerminal(job)" class="bj-terminal-error" aria-label="任务异常">
            <el-icon :size="16"><CircleAlert /></el-icon>
          </span>
          <button
            v-if="job.status === 'completed'"
            type="button"
            class="bj-continue"
            @click="$emit('continue', job.jobId)"
          >
            <el-icon :size="12"><Play /></el-icon>
            继续处理
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  CircleAlert,
  CircleCheck,
  ChevronDown,
  Download,
  FolderOpen,
  Package,
  Pause,
  Play,
  Terminal,
  X,
} from 'lucide-vue-next';
import type { BackgroundJobView } from '../../stores/background-jobs';

const props = defineProps<{
  jobs: BackgroundJobView[];
}>();

defineEmits<{
  control: [jobId: string, operation: 'pause' | 'resume' | 'cancel'];
  reveal: [path: string];
  continue: [jobId: string];
}>();

const showCompleted = ref(false);
const isRunning = (job: BackgroundJobView) => ['queued', 'starting', 'running', 'finalizing', 'verifying'].includes(job.status);
const isTerminal = (job: BackgroundJobView) => ['failed', 'cancelled', 'stalled'].includes(job.status);
const activeCount = computed(() => props.jobs.filter(job => isRunning(job) || job.status === 'paused').length);
const completedCount = computed(() => props.jobs.filter(job => !isRunning(job) && job.status !== 'paused').length);
const visibleJobs = computed(() => {
  const active = props.jobs.filter(job => isRunning(job) || job.status === 'paused');
  if (showCompleted.value) return props.jobs;
  return active.length ? active : props.jobs.slice(0, 1);
});

function kindIcon(kind: string) {
  if (kind === 'package_build') return Package;
  if (kind === 'browser_download') return Download;
  return Terminal;
}

function kindLabel(kind: string) {
  if (kind === 'package_build') return '构建 / 打包';
  if (kind === 'browser_download') return '浏览器下载';
  if (kind === 'python_process') return 'Python 任务';
  return '命令任务';
}

function statusLabel(status: string) {
  return ({
    queued: '排队中',
    starting: '启动中',
    running: '进行中',
    paused: '已暂停',
    finalizing: '收尾中',
    verifying: '校验中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
    stalled: '已中断',
  } as Record<string, string>)[status] || status;
}

function formatBytes(bytes: number): string {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`;
}

function formatDuration(ms: number): string {
  const sec = Math.max(1, Math.ceil(Number(ms) / 1000));
  if (sec < 60) return `${sec}秒`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分${sec % 60 ? `${sec % 60}秒` : ''}`;
  return `${Math.floor(min / 60)}小时${min % 60 ? `${min % 60}分` : ''}`;
}

function baseName(filePath: string): string {
  const parts = String(filePath || '').replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}
</script>

<style scoped>
.background-jobs {
  margin: 0 18px 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  overflow: hidden;
}
.bj-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.bj-title { display: inline-flex; align-items: center; gap: 5px; color: var(--el-text-color-primary); font-weight: 600; }
.bj-count { color: var(--el-text-color-secondary); }
.bj-text-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 0;
  background: transparent;
  color: var(--el-text-color-secondary);
  font: inherit;
  cursor: pointer;
}
.bj-text-btn:hover { color: var(--el-color-primary); }
.bj-text-btn svg { transition: transform .16s ease; }
.bj-text-btn svg.is-open { transform: rotate(180deg); }
.bj-list { display: grid; }
.bj-row {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 52px;
  padding: 7px 10px;
  border-top: 1px solid var(--el-border-color-extra-light);
}
.bj-row:first-child { border-top: 0; }
.bj-kind {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.bj-main { min-width: 0; }
.bj-line { display: flex; align-items: center; gap: 7px; min-width: 0; }
.bj-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-primary);
  font-size: 12px;
  font-weight: 600;
}
.bj-status {
  flex: none;
  color: var(--el-text-color-secondary);
  font-size: 11px;
}
.is-running .bj-status, .is-finalizing .bj-status, .is-verifying .bj-status { color: var(--el-color-primary); }
.is-completed .bj-status { color: var(--el-color-success); }
.is-failed .bj-status, .is-stalled .bj-status, .is-cancelled .bj-status { color: var(--el-color-danger); }
.bj-error {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-color-danger);
  font-size: 11px;
}
.bj-progress-line { display: flex; align-items: center; gap: 8px; margin-top: 5px; min-width: 0; }
.bj-progress {
  width: min(260px, 36vw);
  height: 4px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--el-fill-color);
}
.bj-progress span {
  display: block;
  height: 100%;
  min-width: 2px;
  border-radius: inherit;
  background: var(--el-color-primary);
  transition: width .25s ease;
}
.bj-meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.bj-artifacts { display: flex; align-items: center; gap: 4px; margin-top: 3px; min-width: 0; }
.bj-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-secondary);
  font-size: 11px;
}
.bj-actions { display: flex; align-items: center; gap: 2px; }
.bj-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}
.bj-icon-btn:hover:not(:disabled) { background: var(--el-fill-color-light); color: var(--el-color-primary); }
.bj-icon-btn.is-danger:hover:not(:disabled) { color: var(--el-color-danger); }
.bj-icon-btn:disabled { opacity: .35; cursor: not-allowed; }
.bj-terminal-ok { color: var(--el-color-success); }
.bj-terminal-error { color: var(--el-color-danger); }
.bj-continue {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.bj-continue:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
@media (max-width: 720px) {
  .background-jobs { margin: 0 10px 6px; }
  .bj-progress { width: 32vw; }
  .bj-meta { display: none; }
}
</style>
