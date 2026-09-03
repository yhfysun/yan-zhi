<template>
  <div class="ct" :class="{ compact }" role="list" aria-label="进度轨道">
    <template v-for="(stage, i) in stages" :key="i">
      <div
        v-if="i > 0"
        class="ct-conn"
        :class="{ done: stage.status !== 'pending' }"
        aria-hidden="true"
      />
      <div class="ct-stage" :class="stage.status" role="listitem">
        <span class="ct-n">
          <svg v-if="stage.status === 'done'" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <path d="M5 12l5 5L20 7" />
          </svg>
          <template v-else>{{ i + 1 }}</template>
        </span>
        <span class="ct-l">{{ stage.label }}</span>
        <span v-if="stage.note" class="ct-note">{{ stage.note }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// 编译轨道（P6.2）：把多阶段流水线翻译成可见进度的全局指示器。
// 首个使用场景是本体编译（意图→关系路径→物理SQL→结果）；
// 结构同步、AI 富化等多阶段流程复用同一语言，不再各画一套进度。
export interface CompileStage {
  label: string;
  status: 'done' | 'cur' | 'pending';
  /** 阶段备注：耗时 / 命中摘要等，一行内 */
  note?: string;
}

withDefaults(
  defineProps<{
    stages: CompileStage[];
    /** 紧凑模式：无备注、更小间距（嵌在卡片头部时用） */
    compact?: boolean;
  }>(),
  { compact: false },
);
</script>

<style scoped>
/* 令牌带 fallback：脱离 .dw-root 的页面也能正常渲染 */
.ct {
  --_brand: var(--dw-brand, #7c3aed);
  --_brand-soft: var(--dw-brand-soft, #f1ecfe);
  --_ink: var(--dw-ink, #14161a);
  --_ink-2: var(--dw-ink-2, #5b6070);
  --_ink-3: var(--dw-ink-3, #8e93a6);
  --_rule: var(--dw-rule, #e7e5ee);
  --_rule-strong: var(--dw-rule-strong, #d3d0de);
  --_signal: var(--dw-signal, #0e9f8f);
  --_f-display: var(--dw-f-display, 'Space Grotesk', 'PingFang SC', 'Microsoft YaHei', sans-serif);

  display: flex;
  align-items: flex-start;
  gap: 0;
  flex-wrap: wrap;
}
.ct-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 64px;
  position: relative;
}
.ct-n {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--_f-display);
  font-size: 11px;
  font-weight: 600;
  border: 1.5px solid var(--_rule-strong);
  color: var(--_ink-3);
  background: var(--dw-surface, #fff);
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}
.ct-l {
  font-size: 11px;
  color: var(--_ink-3);
  font-weight: 500;
  white-space: nowrap;
}
.ct-note {
  font-size: 10px;
  color: var(--_ink-3);
  opacity: 0.8;
  white-space: nowrap;
  font-family: var(--dw-f-mono, monospace);
}
.ct-conn {
  height: 1.5px;
  width: 26px;
  margin-top: 11px;
  background: var(--_rule);
  flex-shrink: 0;
}
.ct-conn.done {
  background: var(--_brand);
  opacity: 0.45;
}

.ct-stage.done .ct-n {
  border-color: var(--_signal);
  color: var(--_signal);
  background: var(--dw-signal-soft, #e4f5f2);
}
.ct-stage.done .ct-l {
  color: var(--_ink-2);
}
.ct-stage.cur .ct-n {
  border-color: var(--_brand);
  color: var(--_brand);
  background: var(--_brand-soft);
  box-shadow: 0 0 0 3px var(--_brand-soft);
}
.ct-stage.cur .ct-l {
  color: var(--_ink);
  font-weight: 600;
}

/* 紧凑模式：横向单行（嵌卡片头部），无备注 */
.ct.compact {
  align-items: center;
}
.ct.compact .ct-stage {
  flex-direction: row;
  gap: 5px;
  min-width: 0;
}
.ct.compact .ct-n {
  width: 16px;
  height: 16px;
  font-size: 9px;
}
.ct.compact .ct-conn {
  width: 14px;
  margin-top: 0;
}
.ct.compact .ct-note {
  display: none;
}
</style>
