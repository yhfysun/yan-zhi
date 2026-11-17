<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Brain, Send, Sparkles } from 'lucide-vue-next';
import { useChatStore, usePlatformStore } from '../../../stores';

const props = defineProps<{
  subjectKey: string;
  subjectName: string;
  courseName: string;
  opening: string;
  prompts: readonly string[];
  reference: string;
}>();

const chat = useChatStore();
const platformStore = usePlatformStore();
const conversationId = ref('');
const draft = ref('');
const sending = ref(false);
const error = ref('');
let loadGeneration = 0;

const messages = computed(() =>
  conversationId.value ? chat.messagesByConv[conversationId.value] || [] : [],
);
const streaming = computed(() =>
  !!conversationId.value && chat.isConvStreaming(conversationId.value),
);
const conversationKey = computed(() => `yz.learning.v2.coach.${props.subjectKey}.v1`);

function agentIdForSubject(subjectKey: string): string {
  if (subjectKey === 'english') return 'a_builtin_learning_coach';
  if (subjectKey === 'culture') return 'a_builtin_culture_coach';
  if (subjectKey === 'music') return 'a_builtin_music_coach';
  if (subjectKey === 'zhouyi') return 'a_builtin_zhouyi_coach';
  return 'a_builtin_learning_subject_coach';
}

function contextPrefix(content: string): string {
  return [
    `【当前学习上下文】科目：${props.subjectName}；课程：${props.courseName}。`,
    `引用范围：${props.reference}`,
    '请从零基础开始，先诊断我的理解，再给一个必要步骤；原文、事实和出处拿不准时明确说明。',
    '',
    content,
  ].join('\n');
}

async function restoreConversation() {
  const generation = ++loadGeneration;
  conversationId.value = '';
  try {
    const saved = localStorage.getItem(conversationKey.value) || '';
    if (!saved) return;
    await chat.loadMessages(saved);
    if (generation === loadGeneration) conversationId.value = saved;
  } catch {
    try { localStorage.removeItem(conversationKey.value); } catch { /* storage may be unavailable */ }
  }
}

async function ensureConversation(): Promise<string> {
  if (conversationId.value) return conversationId.value;
  const id = await chat.createConversation(`${props.subjectName}陪练`, {
    agentId: agentIdForSubject(props.subjectKey),
    source: 'learning',
    sourceMeta: {
      learningKind: 'free',
      learningSubject: props.subjectName,
      learningCourseId: props.courseName,
    },
  });
  conversationId.value = id;
  try { localStorage.setItem(conversationKey.value, id); } catch { /* storage may be unavailable */ }
  return id;
}

async function resolveModel(): Promise<{ platform: unknown; model: unknown } | null> {
  await platformStore.ensurePlatforms();
  await platformStore.ensureModels();
  const model = platformStore.models[0];
  if (!model) return null;
  const platform = platformStore.platforms.find((item) => item.id === model.platformId);
  return platform ? { platform, model } : null;
}

async function send(content = draft.value) {
  const text = content.trim();
  if (!text || sending.value || streaming.value) return;
  error.value = '';
  sending.value = true;
  try {
    const id = await ensureConversation();
    const resolved = await resolveModel();
    if (!resolved) {
      error.value = '还没有可用的 AI 模型，请先在平台设置中配置模型。';
      return;
    }
    draft.value = '';
    await chat.sendMessage(
      contextPrefix(text),
      resolved.platform as never,
      resolved.model as never,
      undefined,
      {},
      id,
    );
  } catch (cause) {
    error.value = cause instanceof Error ? `发送失败：${cause.message}` : '发送失败，请稍后重试。';
  } finally {
    sending.value = false;
  }
}

watch(() => props.subjectKey, () => {
  draft.value = '';
  error.value = '';
  void restoreConversation();
});

onMounted(() => { void restoreConversation(); });
</script>

<template>
  <section class="lv2-coach-panel">
    <div class="lv2-coach-context">
      <Brain :size="20" />
      <div><b>{{ subjectName }} · {{ courseName }}</b><span>只使用当前课程、原文和可核验来源</span></div>
    </div>

    <div class="lv2-coach-thread" aria-live="polite">
      <div v-if="!messages.length" class="lv2-coach-message assistant">
        <span>陪练</span><p>{{ opening }}</p>
      </div>
      <div
        v-for="message in messages"
        :key="message.id"
        class="lv2-coach-message"
        :class="message.role"
      >
        <span>{{ message.role === 'user' ? '我' : '陪练' }}</span>
        <p>{{ message.content }}</p>
      </div>
      <div v-if="streaming" class="lv2-coach-typing"><Sparkles :size="14" />正在组织追问…</div>
    </div>

    <div class="lv2-coach-prompts">
      <button v-for="prompt in prompts" :key="prompt" type="button" :disabled="sending || streaming" @click="send(prompt)">
        {{ prompt }}
      </button>
    </div>

    <form class="lv2-coach-compose" @submit.prevent="send()">
      <textarea v-model="draft" rows="3" placeholder="说出你的理解、证据或卡住的位置" />
      <button type="submit" :disabled="sending || streaming || !draft.trim()">
        <Send :size="15" />{{ sending ? '发送中…' : '发送' }}
      </button>
    </form>
    <p v-if="error" class="lv2-coach-error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped src="./LearningCoachPanel.css"></style>
