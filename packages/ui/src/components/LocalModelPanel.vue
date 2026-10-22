<template>
  <div class="local-model-page">
    <div class="lm-tip">
      这些是<b>本地运行需要的模型与工具</b>，按需下载，不随安装包分发。
      下载源已按<b>国内优先</b>排序（ModelScope / hf-mirror / gh-proxy），失败自动换下一个。
      已安装的会跳过。模型也可以让 AI 自己调用安装（会先弹确认卡）。
    </div>

    <div v-if="loading" class="lm-loading">加载中…</div>

    <template v-else>
      <SearchToolbar v-model:query="keyword" placeholder="搜索资源名称 / 用途" :count="filtered.length">
        <template #actions>
          <el-select v-model="filter" size="small" class="lm-filter-select">
            <el-option label="全部" value="" />
            <el-option label="已安装" value="installed" />
            <el-option label="未安装" value="missing" />
          </el-select>
          <el-button v-if="keyword.trim() || filter" size="small" text @click="clearFilter">重置</el-button>
          <el-button size="small" text :loading="loading" @click="load">刷新</el-button>
        </template>
      </SearchToolbar>

      <div class="lm-list">
        <div v-for="it in filtered" :key="it.id" class="lm-card">
          <div class="lm-card-head">
            <span class="lm-name">{{ it.title }}</span>
            <span v-if="progressOf(it.id)?.state === 'downloading'" class="lm-badge lm-badge-run">下载中</span>
            <span v-else-if="it.installed" class="lm-badge lm-badge-ok">已安装</span>
            <span v-else class="lm-badge">未安装</span>
          </div>

          <div class="lm-desc">{{ it.purpose }}</div>

          <div class="lm-meta">
            <span>约 {{ it.humanBytes }}</span>
            <span class="lm-dot">·</span>
            <span>{{ it.id }}</span>
          </div>

          <!-- ★ ACE-Step 的不健康状态要说清原因（权重全但 torch 是 CPU 版，光看"未安装"会误导） -->
          <div v-if="it.id === 'acestep' && acestepDetail && acestepDetail.state === 'error'" class="lm-warn">
            <div class="lm-warn-title">已安装但不可用</div>
            <div class="lm-warn-body">{{ acestepDetail.message }}</div>
            <div class="lm-warn-hint">点「修复安装」会自动补装 CUDA 版 PyTorch，不用重新下 8.9GB 权重</div>
          </div>

          <div v-if="progressOf(it.id)" class="lm-progress">
            <el-progress
              :percentage="progressOf(it.id)!.progress"
              :status="progressOf(it.id)!.state === 'error' ? 'exception' : undefined"
              :stroke-width="6"
            />
            <span class="lm-progress-msg">{{ progressOf(it.id)!.message }}</span>
          </div>

          <div class="lm-actions">
            <el-button
              v-if="!it.installed || (it.id === 'acestep' && acestepDetail?.state === 'error')"
              type="primary"
              size="small"
              :loading="isBusy(it.id)"
              :disabled="isBusy(it.id)"
              @click="install(it)"
            >
              {{ isBusy(it.id) ? '安装中…' : (it.id === 'acestep' && acestepDetail?.state === 'error' ? '修复安装' : '下载安装') }}
            </el-button>
            <span v-else class="lm-ok-hint">已就绪</span>
            <el-button size="small" text @click="showHint(it)">手动放置路径</el-button>
          </div>
        </div>
      </div>

      <div v-if="!filtered.length" class="lm-empty">没有匹配的资源</div>
    </template>
  </div>
</template>

<script setup lang="ts">
// 本地模型/工具安装面板（2026-10-22）
//
// ★ 与 VoicePackPanel 的分工：语音包仍在原页签（它有引擎+试听等专属交互）；
//   本面板是**统一入口**，覆盖 ffmpeg / yt-dlp / whisper / DiffSinger / ACE-Step / 语音包。
// ★ 通道一致性：这里的「下载安装」调 /api/install/:id，后端与 AI 的 install_resource
//   工具**共用同一个 install()** —— UI 装的与模型装的是同一份产物，不会各装一套。
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api/client';
import SearchToolbar from './common/SearchToolbar.vue';

interface Item {
  id: string;
  title: string;
  purpose: string;
  bytes: number;
  humanBytes: string;
  installed: boolean;
}

interface Progress {
  state: 'idle' | 'downloading' | 'done' | 'error';
  progress: number;
  message: string;
  installed?: boolean;
  elapsedSec?: number;
  log?: string[];
}

interface AcestepDetail {
  state: 'not-installed' | 'ready' | 'error';
  message?: string;
  missing?: string[];
}

const loading = ref(true);
const items = ref<Item[]>([]);
const acestepDetail = ref<AcestepDetail | null>(null);
const progress = ref<Record<string, Progress>>({});
const keyword = ref('');
const filter = ref('');
const busyId = ref('');

let pollTimer: number | null = null;

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return items.value.filter((it) => {
    if (filter.value === 'installed' && !it.installed) return false;
    if (filter.value === 'missing' && it.installed) return false;
    if (!kw) return true;
    return it.title.toLowerCase().includes(kw) || it.purpose.toLowerCase().includes(kw) || it.id.includes(kw);
  });
});

function progressOf(id: string) {
  return progress.value[id] || null;
}
function isBusy(id: string) {
  return busyId.value === id || progress.value[id]?.state === 'downloading';
}
function clearFilter() {
  keyword.value = '';
  filter.value = '';
}

async function load() {
  loading.value = true;
  try {
    const r = await api.get<any>('/install/list');
    const d = (r as any).data ?? {};
    items.value = d.items || [];
    acestepDetail.value = d.acestepDetail || null;
    // 后端告知哪些在装 → 恢复轮询（刷新页面后仍能看到进度）
    for (const id of d.inflight || []) {
      progress.value[id] = { state: 'downloading', progress: 50, message: '安装中…' };
      busyId.value = id;
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function install(it: Item) {
  try {
    await ElMessageBox.confirm(
      `将下载 ${it.title}（约 ${it.humanBytes}）到本机。\n\n` +
      `用途：${it.purpose}\n\n` +
      `下载源国内优先，失败会自动换源；中断后重试会续传。`,
      `安装 ${it.title}`,
      { confirmButtonText: '开始下载', cancelButtonText: '取消', type: 'info' },
    );
  } catch {
    return; // 用户取消
  }

  busyId.value = it.id;
  progress.value[it.id] = { state: 'downloading', progress: 1, message: '提交下载…' };
  startPoll();
  try {
    const r = await api.post<any>(`/install/${it.id}`, {});
    if ('error' in r) {
      ElMessage.error((r as any).error);
      progress.value[it.id] = { state: 'error', progress: 0, message: (r as any).error };
      busyId.value = '';
      return;
    }
    ElMessage.success(`已开始下载 ${it.title}`);
  } catch (e: any) {
    ElMessage.error(e?.message || '启动安装失败');
    delete progress.value[it.id];
    busyId.value = '';
  }
}

function startPoll() {
  if (pollTimer !== null) return;
  pollTimer = window.setInterval(poll, 3000);
}

async function poll() {
  const active = Object.entries(progress.value).filter(([, p]) => p.state === 'downloading');
  if (!active.length) {
    stopPoll();
    return;
  }
  for (const [id] of active) {
    try {
      const r = await api.get<any>(`/install/${id}/progress`);
      const d = (r as any).data ?? {};
      progress.value[id] = {
        state: d.state,
        progress: d.progress ?? 0,
        message: d.message || '',
        installed: d.installed,
        elapsedSec: d.elapsedSec,
        log: d.log,
      };
      if (d.state === 'done') {
        const target = items.value.find((x) => x.id === id);
        if (target) target.installed = true;
        busyId.value = '';
        ElMessage.success(`${target?.title || id} 安装完成`);
        await load();
      } else if (d.state === 'idle' && !d.installed) {
        // 安装线程结束但没装上 → 让用户看到失败，而不是一直转圈
        progress.value[id] = { state: 'error', progress: 0, message: d.message || '安装未完成' };
        busyId.value = '';
        ElMessage.error(`${id} 安装未完成，可查看日志或手动放置`);
      }
    } catch {
      // 轮询失败不打断，下轮再试
    }
  }
}

function stopPoll() {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function showHint(it: Item) {
  try {
    const r = await api.get<any>(`/install/${it.id}/status`);
    const d = (r as any).data ?? {};
    const dir = d.manualHint?.dir || d.targetDir || '';
    const text = d.manualHint?.text || '';
    await ElMessageBox.alert(
      `${text}\n\n目标目录：\n${dir}`,
      `${it.title} · 手动放置`,
      { confirmButtonText: '知道了' },
    );
  } catch (e: any) {
    ElMessage.error(e?.message || '获取路径失败');
  }
}

onMounted(async () => {
  await load();
  // 有在装的资源则持续轮询
  if (Object.keys(progress.value).length) startPoll();
});
onUnmounted(stopPoll);
</script>

<style scoped>
.local-model-page { padding: 4px 2px; }
.lm-tip {
  font-size: 12px;
  line-height: 1.7;
  color: var(--yz-text-2, #666);
  background: var(--yz-fill-1, #f7f8fa);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 12px;
}
.lm-tip b { color: var(--yz-text-1, #333); }
.lm-loading, .lm-empty {
  padding: 24px;
  text-align: center;
  color: var(--yz-text-3, #999);
  font-size: 12px;
}
.lm-filter-select { width: 100px; margin-right: 6px; }
.lm-list { display: flex; flex-direction: column; gap: 10px; }
.lm-card {
  border: 1px solid var(--yz-border, #e5e6eb);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--yz-bg-1, #fff);
}
.lm-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.lm-name { font-size: 13px; font-weight: 600; color: var(--yz-text-1, #333); }
.lm-badge {
  font-size: 11px;
  padding: 0 6px;
  line-height: 16px;
  border-radius: 3px;
  color: var(--yz-text-3, #999);
  border: 1px solid var(--yz-border, #e5e6eb);
}
.lm-badge-ok { color: #12a150; border-color: #b7ebc6; background: #f2fdf5; }
.lm-badge-run { color: #0d6efd; border-color: #b8d4fe; background: #f0f6ff; }
.lm-desc { font-size: 12px; color: var(--yz-text-2, #666); line-height: 1.6; }
.lm-meta { font-size: 11px; color: var(--yz-text-3, #999); margin-top: 4px; }
.lm-dot { margin: 0 4px; }
.lm-warn {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #fff7e6;
  border: 1px solid #ffe0a3;
}
.lm-warn-title { font-size: 12px; font-weight: 600; color: #ad6800; }
.lm-warn-body { font-size: 11px; color: #8c5a00; margin-top: 2px; line-height: 1.5; word-break: break-all; }
.lm-warn-hint { font-size: 11px; color: #ad6800; margin-top: 4px; }
.lm-progress { margin-top: 8px; }
.lm-progress-msg { font-size: 11px; color: var(--yz-text-3, #999); }
.lm-actions { margin-top: 10px; display: flex; align-items: center; gap: 8px; }
.lm-ok-hint { font-size: 12px; color: #12a150; }
</style>
