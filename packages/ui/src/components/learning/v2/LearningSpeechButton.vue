<script setup lang="ts">
import { computed, ref } from 'vue';
import { Square, Volume2 } from 'lucide-vue-next';
import { splitZhSentences, useZhSpeech, zhSpeechSupported } from '../../../composables/useZhSpeech';
import { getNativeTts } from '../../../utils/nativeTts';

const props = withDefaults(defineProps<{
  text: string;
  label?: string;
  compact?: boolean;
}>(), {
  label: '朗读本页',
  compact: false,
});

const speech = useZhSpeech();
const speakActive = speech.active;
const error = ref('');
const buttonLabel = computed(() => speakActive.value ? '停止朗读' : props.label);

function toggleSpeech() {
  error.value = '';
  if (speakActive.value) {
    speech.stop();
    return;
  }
  const text = props.text.trim();
  if (!text) {
    error.value = '当前页面没有可朗读内容。';
    return;
  }
  if (!zhSpeechSupported() && !getNativeTts()) {
    error.value = '当前设备没有可用的中文语音，请先在系统设置中安装语音引擎。';
    return;
  }
  speech.start(splitZhSentences(text), { loop: 'none' });
  if (!speakActive.value) {
    error.value = '系统语音未启动，请检查语音引擎或声线设置。';
  }
}
</script>

<template>
  <div class="lv2-speech">
    <button
      type="button"
      class="lv2-speech-button"
      :class="{ active: speakActive, compact }"
      :aria-label="buttonLabel"
      :title="buttonLabel"
      @click="toggleSpeech"
    >
      <Square v-if="speakActive" :size="14" />
      <Volume2 v-else :size="15" />
      <span v-if="!compact">{{ buttonLabel }}</span>
    </button>
    <p v-if="error" class="lv2-speech-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped src="./LearningSpeechButton.css"></style>
