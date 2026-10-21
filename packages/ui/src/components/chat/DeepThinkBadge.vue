<!--
  DeepThinkBadge.vue — 「深度思考」标识 + 跑马灯（WorkBuddy 式）

  ★ 为什么存在（2026-10-21 用户实报）：「就跟 workbuddy 一样啊，有个深度思考标志
    然后跑马灯啊」。此前两种形态都不对：
      · 流式期：reasoningContent **整段平铺**在聊天里（实测见过几千字），一屏聊天被
        思考正文挤满，正文反而被推到看不见；
      · 完成后：只剩一个 12px 的「思考过程」小字，看不出"它刚才深度想过"。

  ★ 形态：
      thinking —— 星火图标 + 「深度思考中」**流光跑马灯**（渐变扫过文字）+ 字数，默认收起正文；
      done     —— 同款徽标静下来（「深度思考」+ 字数），点击展开全文。
    点整行切换展开（与既有 toggleReasoning 的折叠状态同源，不新增状态）。

  ★ 跑马灯只用 CSS（background-clip: text）：
     不用逐字平移，避免长文本每秒重排；暗色主题下靠 --color-primary 自动跟随。
-->
<template>
  <button
    class="dtb"
    :class="[`is-${state}`, { open }]"
    type="button"
    :title="state === 'thinking' ? '模型正在深度思考（点击查看实时思考内容）' : '点击展开/收起深度思考内容'"
    @click="emit('toggle')"
  >
    <span class="dtb-spark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="13" height="13">
        <path
          d="M12 2.4l1.9 5.3 5.3 1.9-5.3 1.9L12 16.8l-1.9-5.3L4.8 9.6l5.3-1.9L12 2.4z"
          fill="currentColor"
        />
        <path
          d="M18.4 14.8l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"
          fill="currentColor"
          opacity="0.5"
        />
      </svg>
    </span>
    <span class="dtb-label"><span class="dtb-text">{{ label }}</span></span>
    <span v-if="charsText" class="dtb-meta">{{ charsText }}</span>
    <span v-if="state === 'thinking'" class="dtb-pulse" aria-hidden="true"></span>
    <el-icon :size="10" class="dtb-caret"><CaretBottom /></el-icon>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CaretBottom } from '@element-plus/icons-vue';

const props = defineProps<{
  /** thinking = 流式中；done = 已结束（历史消息也走这个） */
  state: 'thinking' | 'done';
  /** 思考内容字数（0/未传则不显示） */
  chars?: number;
  /** 正文是否展开 */
  open?: boolean;
}>();

const emit = defineEmits<{ (e: 'toggle'): void }>();

const label = computed(() => (props.state === 'thinking' ? '深度思考中' : '深度思考'));

const charsText = computed(() => {
  const n = props.chars ?? 0;
  if (n <= 0) return '';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k 字` : `${n} 字`;
});
</script>

<style scoped>
.dtb {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 2px 8px 2px 6px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-secondary, #6b6b66);
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease, color 0.15s ease;
}
.dtb:hover {
  background: color-mix(in srgb, var(--color-primary, #c2410c) 9%, transparent);
  color: var(--color-text, #1a1a1a);
}
.dtb-spark {
  display: inline-flex;
  color: var(--color-primary, #c2410c);
  flex-shrink: 0;
}
.is-thinking .dtb-spark {
  animation: dtb-breathe 1.9s ease-in-out infinite;
}
.dtb-label {
  display: inline-flex;
  min-width: 0;
}
.dtb-text {
  white-space: nowrap;
}

/* ===== 跑马灯：渐变扫过文字 =====
   ① background-size 放大到 220%，② background-position 从右到左循环，
   ③ background-clip: text 让渐变只作用在字形上（文字本身透明）。
   非 thinking 态完全不带这套声明，静态文字零性能开销。 */
.is-thinking .dtb-text {
  background-image: linear-gradient(
    100deg,
    var(--color-text-secondary, #6b6b66) 0%,
    var(--color-text-secondary, #6b6b66) 38%,
    var(--color-primary, #c2410c) 50%,
    var(--color-text-secondary, #6b6b66) 62%,
    var(--color-text-secondary, #6b6b66) 100%
  );
  background-size: 220% 100%;
  background-repeat: no-repeat;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  animation: dtb-sweep 1.9s linear infinite;
}

.dtb-meta {
  font-size: 11px;
  font-weight: 400;
  opacity: 0.7;
  flex-shrink: 0;
}

/* 思考中的呼吸小点（比 spinner 轻，不抢注意力） */
.dtb-pulse {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-primary, #c2410c);
  flex-shrink: 0;
  animation: dtb-pulse 1.4s ease-in-out infinite;
}

.dtb-caret {
  color: currentColor;
  opacity: 0.55;
  flex-shrink: 0;
  transition: transform 0.18s ease;
}
.dtb.open .dtb-caret {
  transform: rotate(180deg);
}

@keyframes dtb-sweep {
  0% { background-position: 140% 0; }
  100% { background-position: -40% 0; }
}
@keyframes dtb-breathe {
  0%, 100% { opacity: 0.55; transform: scale(0.94) rotate(0deg); }
  50% { opacity: 1; transform: scale(1.06) rotate(8deg); }
}
@keyframes dtb-pulse {
  0%, 100% { opacity: 0.25; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1); }
}

/* 尊重「减少动态效果」：跑马灯与呼吸动画全部停掉，只留静态标识 */
@media (prefers-reduced-motion: reduce) {
  .is-thinking .dtb-text {
    animation: none;
    -webkit-text-fill-color: currentColor;
    color: var(--color-text-secondary, #6b6b66);
    background-image: none;
  }
  .is-thinking .dtb-spark,
  .dtb-pulse { animation: none; }
}
</style>
