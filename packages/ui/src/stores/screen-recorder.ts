/**
 * 选区录屏的全局状态（2026-10-26）。
 *
 * 为什么放 store：入口有两个 —— 聊天输入框「截图」旁的下拉、浏览器面板「更多」菜单。
 * 若各自持有状态，从 A 开始的录制在 B 里显示不出来（也就停不掉）。状态与启停流程只此一份。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { startRegionRecording, type RegionDisplay, type RegionRect } from '../composables/region-recorder';

interface ActiveRecording {
  stop: () => Promise<string | null>;
  startedAt: number;
}

export const useScreenRecorderStore = defineStore('screen-recorder', () => {
  const active = ref<ActiveRecording | null>(null);
  const starting = ref(false);
  const isRecording = computed(() => !!active.value);

  async function start(): Promise<{ ok: boolean; error?: string }> {
    const api = (window as any).electronAPI;
    if (!api?.screenshot?.capture || !api?.screenRecord?.saveBlob) {
      return { ok: false, error: '当前环境不支持录屏（仅桌面端）' };
    }
    // 1) 复用截图遮罩框选区域（region 模式只回矩形，不做截图合成）
    let sel: any = null;
    try { sel = await api.screenshot.capture({ hideApp: false, mode: 'region' }); } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
    if (!sel?.ok || !sel.rect) {
      // 用户取消（无 error）→ 静默
      return { ok: false, error: sel?.error || '' };
    }
    // 2) 指定选区所在显示器，再开始采集 + 录制
    try {
      await api.screenRecord.selectDisplay?.(sel.display?.id || '');
      const handle = await startRegionRecording({
        rect: sel.rect as RegionRect,
        display: sel.display as RegionDisplay,
        fps: 15,
        onAutoStop: (file) => {
          active.value = null;
          if (file) ElMessage.info(`录屏已达 10 分钟上限，已保存：${file}`);
        },
      });
      active.value = { stop: handle.stop, startedAt: Date.now() };
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  async function stop(): Promise<{ ok: boolean; file?: string | null }> {
    const s = active.value;
    if (!s) return { ok: false, file: null };
    active.value = null;
    const file = await s.stop();
    return { ok: !!file, file };
  }

  /** 菜单/按钮统一入口：开始 ↔ 停止，并给出用户反馈（两个入口共用同一套文案） */
  async function toggle(): Promise<void> {
    if (starting.value) return;
    if (active.value) {
      const r = await stop();
      if (r.file) {
        try { await navigator.clipboard?.writeText(r.file); } catch { /* 剪贴板不可用时只提示路径 */ }
        ElMessage.success(`录屏已保存：${r.file}（路径已复制）`);
      } else {
        ElMessage.warning('录屏已停止，但保存失败（检查视频目录权限 / ffmpeg）');
      }
      return;
    }
    starting.value = true;
    try {
      const r = await start();
      if (r.ok) {
        ElMessage.success('开始录制选区（上限 10 分钟）；可最小化本应用去操作电脑，回来点「停止录屏」');
      } else if (r.error) {
        ElMessage.warning('录屏未开始：' + r.error);
      }
    } finally {
      starting.value = false;
    }
  }

  return { active, starting, isRecording, start, stop, toggle };
});
