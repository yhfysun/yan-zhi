<!--
  智能体头像统一渲染，判定顺序：
    ① 图片头像（img:*） ② 用户选的图标 / 内置 id 预设图标 ③ 名称首字
  全站 6 个渲染点都走这里，避免「列表 / 聊天 / 消息」三处头像不一致。
  尺寸由父容器决定（图片 width/height 100%），iconSize 控制图标字号。
-->
<template>
  <img v-if="src" class="agent-avatar-img" :src="src" alt="" draggable="false" />
  <component
    v-else-if="icon"
    :is="icon"
    class="agent-avatar-icon"
    theme="filled"
    :size="iconSize"
  />
  <span v-else class="agent-avatar-text" :style="{ fontSize: Math.round(iconSize * 0.9) + 'px' }">{{ initial }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { agentInitial, resolveAgentIcon } from '../utils/agentIcon';
import { resolveAgentAvatarImage } from '../utils/agentAvatarImages';

const props = withDefaults(defineProps<{
  id?: string | null;
  name?: string | null;
  avatar?: string | null;
  iconSize?: number;
}>(), { iconSize: 20 });

const src = computed(() => resolveAgentAvatarImage(props.avatar));
const icon = computed(() => resolveAgentIcon(props.id, props.avatar));
const initial = computed(() => agentInitial(props.name, 1));
</script>

<style scoped>
.agent-avatar-img {
  width: 100%; height: 100%; display: block;
  object-fit: cover; border-radius: inherit;
}
.agent-avatar-icon { display: inline-flex; line-height: 1; color: inherit; }
.agent-avatar-text { line-height: 1; font-weight: 600; color: inherit; }
</style>
