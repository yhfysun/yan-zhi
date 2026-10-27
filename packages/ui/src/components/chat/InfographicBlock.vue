<!--
信息图渲染块（AntV Infographic，纯前端 SVG）
- 只吃语法字符串；渲染失败降级为原语法，不阻断聊天。
- 导出 SVG / PNG 供交付与后续嵌入 Word。
- 由 ChatMessageList 异步引入 → 仅出现信息图时才加载（首屏不背这包）。
-->
<template>
  <div class="ig-card">
    <div class="ig-head">
      <el-icon class="ig-head-icon"><Picture /></el-icon>
      <span class="ig-title">{{ title || '信息图' }}</span>
      <span class="ig-tag">信息图</span>
      <div class="ig-actions">
        <button class="ig-btn" :disabled="!!error || busy" @click="exportAs('svg')">SVG</button>
        <button class="ig-btn" :disabled="!!error || busy" @click="exportAs('png')">PNG</button>
      </div>
    </div>

    <div v-if="error" class="ig-error">
      <div class="ig-error-title">信息图语法有误：{{ error }}</div>
      <pre class="ig-error-code">{{ syntax }}</pre>
    </div>
    <div v-else ref="el" class="ig-canvas" :style="{ height: `${height}px` }" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';
import { Picture } from '@element-plus/icons-vue';
import { Infographic } from '@antv/infographic';
import { exportFileName } from '../../utils/download-name';

const props = defineProps<{ syntax: string; title?: string; height?: number }>();

const el = ref<HTMLElement | null>(null);
const error = ref('');
const busy = ref(false);
let instance: Infographic | null = null;

const H = () => props.height ?? 420;

function render() {
  const text = (props.syntax || '').trim();
  if (!el.value || !text) return;
  try {
    if (!instance) {
      instance = new Infographic({
        container: el.value,
        width: '100%',
        height: H(),
        editable: false,
      });
    }
    instance.render(text);
    error.value = '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function toPng(): Promise<string> {
  if (!instance || error.value) return '';
  return await instance.toDataURL({ type: 'png', dpr: 2 });
}

async function toSvg(): Promise<string> {
  if (!instance || error.value) return '';
  return await instance.toDataURL({ type: 'svg', embedResources: true });
}

defineExpose({ toPng, toSvg });

async function exportAs(kind: 'svg' | 'png') {
  if (!instance || error.value) return;
  busy.value = true;
  try {
    const url = kind === 'svg' ? await toSvg() : await toPng();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName(props.title, `.${kind}`, { fallback: 'infographic' });
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  await nextTick();
  render();
  // 字体就绪后重排一次（信息图尺寸依赖字体度量）
  try {
    await document.fonts?.ready;
    render();
  } catch { /* 字体接口不可用时保持首次渲染 */ }
});

watch(() => props.syntax, () => { void nextTick(render); });

onBeforeUnmount(() => {
  instance = null;
});
</script>

<style scoped>
.ig-card { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: var(--el-fill-color-blank); overflow: hidden; margin: 8px 0; }
.ig-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--el-border-color-lighter); background: var(--el-fill-color-lighter); }
.ig-head-icon { color: var(--el-color-primary); }
.ig-title { font-size: 13px; font-weight: 600; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ig-tag { font-size: 11px; color: var(--color-text-secondary); border: 1px solid var(--el-border-color-lighter); border-radius: 4px; padding: 0 5px; }
.ig-actions { margin-left: auto; display: flex; gap: 6px; }
.ig-btn { font-size: 12px; padding: 2px 8px; border-radius: 5px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--color-text-secondary); cursor: pointer; }
.ig-btn:hover:not(:disabled) { background: var(--btn-bg-hover); color: var(--color-text); }
.ig-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.ig-canvas { width: 100%; padding: 8px; box-sizing: border-box; overflow: auto; }
.ig-error { padding: 10px 12px; }
.ig-error-title { font-size: 12px; color: var(--color-danger); margin-bottom: 8px; }
.ig-error-code { font-size: 11px; line-height: 1.5; color: var(--color-text-secondary); background: var(--el-fill-color-lighter); padding: 8px; border-radius: 6px; overflow: auto; white-space: pre-wrap; }
</style>
