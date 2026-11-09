<script setup lang="ts">
// 场景练习结算卡：学习模式陪练输出 [SCENE_END] + ```scene_result 围栏时的展示卡。
// 星级 + 分数 + 目标句型 + 纠错表（错句 → 母语者说法 → 一句为什么）；纠错项可朗读。
// P2 场景重练：仅当当前会话带场景元数据时显示「重练」（建新会话由 ChatMessageList 接线）。
import type { SceneResult } from '../../utils/scene-result';

const props = defineProps<{ result: SceneResult; canRetry?: boolean; retrying?: boolean }>();
defineEmits<{ retry: [] }>();

/** 本地朗读：不依赖语音包安装状态（Chromium 自带 SpeechSynthesis，en-US 优先） */
function speak(text: string) {
  try {
    if (!text.trim() || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch { /* 无语音引擎时静默 */ }
}
</script>

<template>
  <div class="scene-result-card">
    <div class="sr-head">
      <span class="sr-title">🎯 场景练习完成</span>
      <span class="sr-stars">{{ '★'.repeat(props.result.stars) }}{{ '☆'.repeat(3 - props.result.stars) }}</span>
      <span class="sr-score">{{ props.result.score }} 分</span>
    </div>
    <div v-if="props.result.keyPhrases.length" class="sr-section">
      <h4>本场景关键句型</h4>
      <ul class="sr-phrases">
        <li v-for="(p, i) in props.result.keyPhrases" :key="i">
          <span>{{ p }}</span>
          <button class="sr-speak" title="朗读" @click="speak(p)">🔊</button>
        </li>
      </ul>
    </div>
    <div v-if="props.result.corrections.length" class="sr-section">
      <h4>纠错记录</h4>
      <ul class="sr-corrections">
        <li v-for="(c, i) in props.result.corrections" :key="i">
          <p class="sr-wrong"><s>{{ c.wrong }}</s></p>
          <p class="sr-right">✅ {{ c.right }}
            <button class="sr-speak" title="朗读" @click="speak(c.right)">🔊</button>
          </p>
          <p v-if="c.why" class="sr-why">为什么：{{ c.why }}<span v-if="c.grammarPoint" class="sr-gp">{{ c.grammarPoint }}</span></p>
        </li>
      </ul>
    </div>
    <p class="sr-hint">这些表达会自动进入错误本，按 SRS 排程复习。</p>
    <button v-if="props.canRetry" class="sr-retry" :disabled="props.retrying" @click="$emit('retry')">
      {{ props.retrying ? '创建重练会话中…' : '🔁 重练这个场景' }}
    </button>
  </div>
</template>

<style scoped>
.scene-result-card { border: 1px solid #b7ebc9; background: #f6fff8; border-radius: 10px; padding: 12px 14px; margin: 8px 0; font-size: 13px; color: #1f2329; }
.sr-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.sr-title { font-weight: 700; }
.sr-stars { color: #f7b500; letter-spacing: 2px; }
.sr-score { margin-left: auto; font-weight: 700; color: #0f8a3d; }
.sr-section { margin-top: 8px; }
.sr-section h4 { font-size: 12px; color: #4e5469; margin: 0 0 5px; }
.sr-phrases, .sr-corrections { list-style: none; margin: 0; padding: 0; }
.sr-phrases li { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; border-bottom: 1px dashed #d8ecdd; }
.sr-corrections li { padding: 5px 0; border-bottom: 1px dashed #d8ecdd; }
.sr-corrections p { margin: 0 0 2px; }
.sr-wrong { color: #d4380d; }
.sr-right { color: #0f8a3d; }
.sr-why { color: #8f959e; font-size: 12px; }
.sr-gp { margin-left: 6px; background: #eef7f0; border-radius: 4px; padding: 1px 5px; }
.sr-speak { border: none; background: transparent; cursor: pointer; font-size: 12px; }
.sr-hint { color: #8f959e; font-size: 11px; margin: 8px 0 0; }
.sr-retry { margin-top: 8px; width: 100%; border: 1px solid #b7ebc9; background: #fff; border-radius: 6px; padding: 6px 0; font-size: 13px; color: #0f8a3d; cursor: pointer; }
.sr-retry:hover { background: #f6fff8; }
.sr-retry:disabled { opacity: .6; cursor: default; }
</style>
