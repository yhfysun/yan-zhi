<template>
  <div class="voice-pack-page">
    <div class="vp-tip">
      本地语音包用于<b>离线多音色配音</b>。未安装时走 Edge 在线合成（联网，音色 6 个）；安装后可完全离线使用上百种音色。
      模型按需下载，不随安装包分发。
    </div>

    <div v-if="engine && !engine.available" class="vp-engine-warn">
      <div class="vp-engine-title">语音引擎未安装</div>
      <div class="vp-engine-body">{{ engine.error }}</div>
      <div class="vp-engine-actions">
        <el-button type="primary" size="small" :loading="engineInstalling" @click="installEngine">
          {{ engineInstalling ? '安装中…' : '下载安装引擎（约 22 MB）' }}
        </el-button>
        <span class="vp-engine-hint">装好引擎后才能使用本地语音；当前仍可用 Edge 在线合成与系统语音</span>
      </div>
    </div>

    <div v-if="loading" class="vp-loading">加载中…</div>

    <template v-else>
      <div class="vp-list">
        <div v-for="it in items" :key="it.id" class="vp-card">
          <div class="vp-card-head">
            <span class="vp-name">{{ it.name }}</span>
            <span v-if="it.installed" class="vp-badge vp-badge-ok">已安装</span>
            <span v-else class="vp-badge">未安装</span>
          </div>

          <div class="vp-desc">{{ it.desc }}</div>

          <div class="vp-meta">
            <span>{{ it.speakers }} 个说话人</span>
            <span class="vp-dot">·</span>
            <span>{{ it.sampleRate }} Hz</span>
            <span class="vp-dot">·</span>
            <span>约 {{ it.sizeMb }} MB</span>
            <span class="vp-dot">·</span>
            <span>{{ it.license }}</span>
            <span v-if="it.onDiskMb" class="vp-dot">·</span>
            <span v-if="it.onDiskMb">占用 {{ it.onDiskMb }} MB</span>
          </div>

          <div v-if="it.note" class="vp-note">{{ it.note }}</div>

          <div class="vp-manual">
            手动放置：下载失败时可将模型解压到
            <code class="vp-path">{{ it.manualDir }}</code>
            <el-button size="small" text @click="copyPath(it.manualDir)">复制</el-button>
          </div>

          <div v-if="progressOf(it.id)" class="vp-progress">
            <el-progress
              :percentage="progressOf(it.id)!.progress"
              :status="progressOf(it.id)!.state === 'error' ? 'exception' : undefined"
              :stroke-width="6"
            />
            <span class="vp-progress-msg">{{ progressOf(it.id)!.message }}</span>
          </div>

          <div class="vp-actions">
            <el-button
              v-if="!it.installed"
              type="primary"
              size="small"
              :loading="isBusy(it.id)"
              :disabled="busyId !== '' && busyId !== it.id"
              @click="install(it)"
            >
              {{ isBusy(it.id) ? '下载中' : '下载安装' }}
            </el-button>
            <template v-else>
              <el-button size="small" :loading="testingId === it.id" @click="testVoice(it)">试听</el-button>
              <el-button size="small" type="danger" plain @click="remove(it)">卸载</el-button>
            </template>
          </div>
        </div>
      </div>

      <div v-if="previewUrl" class="vp-player">
        <div class="vp-player-head">
          <span class="vp-player-title">试听：{{ previewName }}</span>
          <span v-if="previewSid !== undefined" class="vp-player-sid">说话人 {{ previewSid }}</span>
          <el-button size="small" text @click="previewUrl = ''">关闭</el-button>
        </div>
        <audio class="vp-audio" :src="previewUrl" controls autoplay />
      </div>

      <div class="vp-foot-tip">
        安装后配音链路会优先使用本地模型（离线可用）；不可用时自动回落系统语音，不会没有声音。
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api/client';

interface PackItem {
  id: string;
  name: string;
  speakers: number;
  sizeMb: number;
  sampleRate: number;
  license: string;
  desc: string;
  genderLabeled: boolean;
  note?: string;
  installed: boolean;
  onDiskMb?: number;
  modelDir: string;
  manualDir: string;
}
interface Progress {
  state: 'downloading' | 'done' | 'error';
  progress: number;
  message: string;
}
interface EngineInfo { available: boolean; source: string; error: string }

const loading = ref(true);
const items = ref<PackItem[]>([]);
const engine = ref<EngineInfo | null>(null);
const progress = ref<Record<string, Progress>>({});
const busyId = ref('');
const testingId = ref('');
let poll: ReturnType<typeof setInterval> | undefined;

function progressOf(id: string) {
  return progress.value[id] || null;
}
function isBusy(id: string) {
  return busyId.value === id;
}

const engineInstalling = ref(false);
/** 试听播放器状态（内联在面板里，不弹窗） */
const previewUrl = ref('');
const previewName = ref('');
const previewSid = ref<number | undefined>(undefined);

/** 安装推理引擎（原生二进制，按平台下载约 22MB）。 */
async function installEngine() {
  engineInstalling.value = true;
  try {
    const r = await api.post<any>('/tts-packs/engine/install');
    if ('error' in r) { ElMessage.error((r as any).error); return; }
    // 后端返回裸对象，api 客户端会包一层 { data }
    ElMessage.success(((r as any).data?.message) || '引擎安装完成');
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '引擎安装失败');
  } finally {
    engineInstalling.value = false;
  }
}

async function load() {
  try {
    const r = await api.get<any>('/tts-packs');
    if ('data' in r && r.data) {
      items.value = r.data.items || [];
      engine.value = r.data.engine || null;
    }
  } catch {
    /* 列表拉取失败保持空态，不打断设置页其它功能 */
  } finally {
    loading.value = false;
  }
}

/** 复制手动放置目录路径（网络不通时用户自行下载用）。 */
async function copyPath(p: string) {
  try {
    await navigator.clipboard.writeText(p);
    ElMessage.success('路径已复制');
  } catch {
    ElMessage.warning('复制失败，请手动选择路径');
  }
}

async function pollProgress() {
  const downloading = items.value.filter((it) => progress.value[it.id]?.state === 'downloading');
  for (const it of downloading) {
    try {
      // 后端返回 { data: Progress }，api 客户端再包一层 → 实取 r.data
      const r = await api.get<any>(`/tts-packs/${it.id}/progress`);
      const st = (r as any).data;
      if (st) progress.value[it.id] = st;
      // 完成或失败：停止轮询该包并刷新列表
      if (st?.state === 'done' || st?.state === 'error') {
        busyId.value = '';
        await load();
      }
    } catch {
      /* 单次轮询失败忽略，下轮重试 */
    }
  }
}

async function install(it: PackItem) {
  busyId.value = it.id;
  progress.value[it.id] = { state: 'downloading', progress: 1, message: '提交下载…' };
  try {
    const r = await api.post<any>(`/tts-packs/${it.id}/install`);
    if ('error' in r) {
      const msg = (r as any).error;
      ElMessage.error(msg);
      progress.value[it.id] = { state: 'error', progress: 0, message: msg };
      busyId.value = '';
      return;
    }
    ElMessage.success(((r as any).data?.message) || '安装完成');
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '安装失败');
    busyId.value = '';
  } finally {
    if (progress.value[it.id]?.state === 'done') busyId.value = '';
  }
}

async function remove(it: PackItem) {
  try {
    await ElMessageBox.confirm(
      `卸载后将删除已下载的模型文件（释放 ${it.onDiskMb ?? it.sizeMb} MB），需要时可重新下载。确定卸载？`,
      '卸载语音包',
      { type: 'warning', confirmButtonText: '卸载', cancelButtonText: '取消' },
    );
  } catch {
    return; // 用户取消
  }
  const r = await api.delete<any>(`/tts-packs/${it.id}`);
  if ('error' in r) { ElMessage.error((r as any).error); return; }
  ElMessage.success('已卸载');
  await load();
}

/** 试听：调语音包专用试听接口，合成一句样例并直接播放。 */
async function testVoice(it: PackItem) {
  testingId.value = it.id;
  try {
    // ⚠️ api 客户端会把响应包一层 { data }（见 api/client.ts 的 apiFetch），
    // 直接读 r.url 会永远是 undefined —— 必须从 r.data 取。
    const r = await api.post<any>(`/tts-packs/${it.id}/preview`, {});
    if ('error' in r) { ElMessage.error((r as any).error); return; }
    const d = (r as any).data ?? {};
    const url = d.url || (r as any).url;
    if (!url) { ElMessage.error('试听接口未返回音频地址'); return; }
    previewUrl.value = url;
    previewName.value = it.name;
    previewSid.value = d.speakerId ?? (r as any).speakerId;
    ElMessage.success(`试听已生成（说话人 ${previewSid.value ?? '-'}）`);
  } catch (e: any) {
    ElMessage.error(e?.message || '试听失败');
  } finally {
    testingId.value = '';
  }
}

onMounted(async () => {
  await load();
  poll = setInterval(pollProgress, 1500);
});
onUnmounted(() => {
  if (poll) clearInterval(poll);
});
</script>

<style scoped>
.voice-pack-page { max-width: 760px; }
.vp-tip {
  font-size: 13px; line-height: 1.7; color: var(--color-text-secondary);
  margin-bottom: 16px;
}
.vp-tip b { font-weight: 500; color: var(--color-text-primary); }
.vp-engine-warn {
  border: 0.5px solid var(--color-border-warning, #EF9F27);
  background: var(--color-background-warning, #FAEEDA);
  border-radius: var(--border-radius-md, 8px);
  padding: 12px 14px; margin-bottom: 16px;
}
.vp-engine-title { font-size: 13px; font-weight: 500; margin-bottom: 6px; }
.vp-engine-body { font-size: 12px; line-height: 1.6; color: var(--color-text-secondary); word-break: break-all; }
.vp-engine-actions { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
.vp-engine-hint { font-size: 12px; color: var(--color-text-tertiary); }
.vp-loading { font-size: 13px; color: var(--color-text-tertiary); padding: 24px 0; }
.vp-list { display: flex; flex-direction: column; gap: 12px; }
.vp-card {
  border: 0.5px solid var(--color-border-tertiary);
  border-radius: var(--border-radius-lg, 12px);
  padding: 14px 16px;
  /* 加一层弱背景：设置页可能选中带壁纸的皮肤，纯透明卡片文字会压在花壁纸上 */
  background: var(--color-background-primary, transparent);
}
.vp-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.vp-name { font-size: 14px; font-weight: 500; }
.vp-badge {
  font-size: 11px; padding: 1px 6px; border-radius: 4px;
  border: 0.5px solid var(--color-border-secondary); color: var(--color-text-secondary);
}
.vp-badge-ok {
  border-color: var(--color-border-success, #639922);
  color: var(--color-text-success, #3B6D11);
}
.vp-desc { font-size: 13px; line-height: 1.6; color: var(--color-text-secondary); margin-bottom: 8px; }
.vp-meta {
  font-size: 12px; color: var(--color-text-tertiary);
  display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;
}
.vp-dot { color: var(--color-text-tertiary); }
.vp-note {
  font-size: 12px; line-height: 1.6; color: var(--color-text-tertiary);
  border-left: 2px solid var(--color-border-tertiary); padding-left: 8px; margin-bottom: 10px;
}
.vp-progress { margin-bottom: 10px; }
.vp-manual {
  font-size: 12px; line-height: 1.7; color: var(--color-text-tertiary);
  margin-bottom: 10px;
}
.vp-path {
  font-family: var(--font-mono); font-size: 11px;
  background: var(--color-background-secondary);
  padding: 1px 4px; border-radius: 3px;
  word-break: break-all;
}
.vp-progress-msg { font-size: 12px; color: var(--color-text-tertiary); display: block; margin-top: 4px; }
.vp-actions { display: flex; gap: 8px; }
.vp-foot-tip {
  font-size: 12px; line-height: 1.6; color: var(--color-text-tertiary);
  margin-top: 16px; padding-top: 12px;
  border-top: 0.5px solid var(--color-border-tertiary);
}
.vp-player {
  margin-top: 14px;
  border: 0.5px solid var(--color-border-secondary);
  border-radius: var(--border-radius-md, 8px);
  padding: 10px 12px;
  background: var(--color-background-primary, transparent);
}
.vp-player-head {
  display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
}
.vp-player-title { font-size: 13px; font-weight: 500; }
.vp-player-sid { font-size: 12px; color: var(--color-text-tertiary); }
.vp-audio { width: 100%; height: 36px; }
</style>