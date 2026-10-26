<!--
  智能体头像统一渲染，判定顺序：
    ① 用户选的图片头像（img:*） ② 用户选的图标键 / 内置 id 预设彩色头像
    ③ 内置 id 的单色预设图标 ④ 名称首字
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
import { agentInitial, isKnownAgentIconKey, resolveAgentIcon } from '../utils/agentIcon';
import { resolveAgentAvatarImage, resolveAgentAvatarImageByAgentId } from '../utils/agentAvatarImages';

const props = withDefaults(defineProps<{
  id?: string | null;
  name?: string | null;
  avatar?: string | null;
  iconSize?: number;
}>(), { iconSize: 20 });

const src = computed(() => {
  const picked = resolveAgentAvatarImage(props.avatar);
  if (picked) return picked;
  // 用户显式选过图标 → 图标优先，不允许内置预设彩色头像盖掉
  if (isKnownAgentIconKey(props.avatar)) return undefined;
  return resolveAgentAvatarImageByAgentId(props.id);
});
const icon = computed(() => (src.value ? undefined : resolveAgentIcon(props.id, props.avatar)));
const initial = computed(() => agentInitial(props.name, 1));
</script>

<style scoped>
.agent-avatar-img {
  width: 100%; height: 100%; display: block;
  object-fit: cover; border-radius: inherit;
  /* 彩色图标自带透明留白：用中性底色填满方框，避免父容器的主色淡染透上来串色 */
  background: var(--color-surface);
}
.agent-avatar-icon { display: inline-flex; line-height: 1; color: inherit; }
.agent-avatar-text { line-height: 1; font-weight: 600; color: inherit; }
</style>
