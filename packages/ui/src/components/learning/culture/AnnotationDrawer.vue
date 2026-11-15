<script setup lang="ts">
// 注解抽屉（交互宪法 §2：注解走右侧抽屉，不用行内折叠/accordion）。
// 两段结构：上半「注释」= 字词训诂（term + type 徽标 + pinyin + gloss + note）；
//           下半「注解 · 历代大家」= 各家阐释（school + dynasty 徽标 + 引文 + 白话；
//           paraphrase=true 显示「大意转述」chip，避免被当成逐字引文）。
// 注解深度：初学 = 注释 + 注解全显；进阶 = 只显注释；原文 = 全藏（外层不开抽屉）。
// 极简浅色白卡片：无图标、无 tip 文案。
import { computed } from 'vue';
import type { CanonLine } from './culture-types';

const props = defineProps<{
  line: CanonLine | null;
  term?: string;
  depth: '初学' | '进阶' | '原文';
}>();

// 命中当前点查词的注释排最前；其余保持原文顺序
const annotations = computed(() => {
  const list = props.line?.annotations ?? [];
  if (!props.term) return list;
  return [...list.filter((a) => a.term === props.term), ...list.filter((a) => a.term !== props.term)];
});

const interpretations = computed(() => props.line?.interpretations ?? []);
// 进阶只看注释（训诂层），历代注解整段藏起
const showInterpretations = computed(() => props.depth === '初学');
</script>

<template>
  <aside v-if="line" class="cul-drawer" aria-label="注解">
    <section class="cul-drawer-sec" aria-label="注释">
      <h4 class="cul-drawer-sec-title">注释</h4>
      <ul class="cul-anno-list">
        <li
          v-for="(a, i) in annotations"
          :key="`${a.term}:${i}`"
          class="cul-anno"
          :class="{ hit: a.term === term }"
        >
          <div class="cul-anno-head">
            <b class="cul-anno-term">{{ a.term }}</b>
            <span v-if="a.type" class="cul-badge">{{ a.type }}</span>
            <span v-if="a.pinyin" class="cul-anno-pinyin">{{ a.pinyin }}</span>
          </div>
          <p class="cul-anno-gloss">{{ a.gloss }}</p>
          <p v-if="a.note" class="cul-anno-note">{{ a.note }}</p>
        </li>
      </ul>
    </section>

    <template v-if="showInterpretations">
      <hr class="cul-drawer-divider" />
      <section class="cul-drawer-sec" aria-label="注解 · 历代大家">
        <h4 class="cul-drawer-sec-title">注解 · 历代大家</h4>
        <ul v-if="interpretations.length" class="cul-interp-list">
          <li v-for="(it, i) in interpretations" :key="`${it.school}:${i}`" class="cul-interp">
            <div class="cul-interp-head">
              <b class="cul-interp-school">{{ it.school }}</b>
              <span class="cul-badge">{{ it.dynasty }}</span>
              <span v-if="it.paraphrase" class="cul-chip-paraphrase">大意转述</span>
            </div>
            <blockquote class="cul-interp-text">{{ it.text }}</blockquote>
            <p class="cul-interp-plain">{{ it.plain }}</p>
          </li>
        </ul>
        <p v-else class="cul-interp-empty">此行暂无历代注解</p>
      </section>
    </template>
  </aside>
</template>

<style scoped>
.cul-drawer {
  flex: 0 0 280px;
  align-self: flex-start;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(44, 42, 38, .12);
  border-radius: 8px;
  background: #ffffff;
  color: #2c2a26;
  padding: 16px 18px;
  box-shadow: 0 10px 30px rgba(10, 14, 18, .12);
}
.cul-drawer-sec-title {
  margin: 0 0 8px;
  color: #8a6a3f;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
}
.cul-drawer-divider { border: 0; border-top: 1px solid rgba(44, 42, 38, .1); margin: 12px 0; }
.cul-anno-list, .cul-interp-list { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
.cul-anno { border: 1px solid transparent; border-radius: 6px; padding: 2px 6px; }
.cul-anno.hit { border-color: rgba(138, 106, 63, .45); background: color-mix(in srgb, #8a6a3f 6%, #ffffff); }
.cul-anno-head { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.cul-anno-term { font-family: var(--cul-serif, serif); font-size: 15px; }
.cul-badge {
  border: 1px solid rgba(138, 106, 63, .4);
  border-radius: 999px;
  color: #8a6a3f;
  font-size: 9px;
  padding: 1px 7px;
  white-space: nowrap;
}
.cul-anno-pinyin { color: #8a6a3f; font-size: 11px; }
.cul-anno-gloss { margin: 3px 0 0; font-size: 13px; line-height: 1.7; }
.cul-anno-note { margin: 3px 0 0; color: #6f6a60; font-size: 11px; line-height: 1.6; }
.cul-interp-head { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.cul-interp-school { font-size: 12px; }
.cul-chip-paraphrase {
  border: 1px dashed rgba(138, 106, 63, .55);
  border-radius: 999px;
  color: #8a6a3f;
  font-size: 9px;
  padding: 1px 7px;
  white-space: nowrap;
}
.cul-interp-text {
  margin: 6px 0 0;
  border-left: 3px solid rgba(138, 106, 63, .35);
  padding: 2px 0 2px 8px;
  font-family: var(--cul-serif, serif);
  font-size: 12px;
  line-height: 1.8;
}
.cul-interp-plain { margin: 5px 0 0; color: #6f6a60; font-size: 11px; line-height: 1.6; }
.cul-interp-empty { margin: 0; color: #6f6a60; font-size: 11px; }
@media (max-width: 900px) {
  .cul-drawer { position: static; flex-basis: auto; width: 100%; }
}
</style>
