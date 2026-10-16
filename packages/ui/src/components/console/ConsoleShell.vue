<template>
  <!-- 控制台型模式的通用外壳：可收起/可调宽的左栏 + 折叠条 + 主区。
       ★ 为什么抽它：运维与店铺两个控制台此前是同一套外壳各自抄一份（布局、分隔条、折叠条、
         宽度持久化逻辑全同），改一处要点两遍。安全控制台是另一套设计语言（品牌条 + ribbon +
         grid），**不用这个壳**，故它不在迁移范围内。
       ★ 外壳只管"盒子"：左栏与主区的内容全部由使用方通过 slot 提供。 -->
  <div class="console-shell" :class="rootClass">
    <div class="cs-layout" :style="{ '--cs-aside-w': (collapsed ? 0 : asideW) + 'px' }">
      <aside
        v-show="!collapsed"
        class="cs-aside"
        :style="{ width: asideW + 'px' }"
        @contextmenu.prevent="$emit('aside-contextmenu', $event)"
      >
        <slot name="aside" />
      </aside>

      <!-- 左栏 ↔ 主区 拖拽分隔条（最小到 min，不会自动折叠） -->
      <div
        v-show="!collapsed"
        class="rs-handle rs-handle-left"
        title="拖动调整宽度"
        @mousedown="asideR.startDrag($event, 'left')"
      ></div>

      <!-- 折叠条：贴左边缘的竖条，点击收起/展开左栏（与「对话」页 .conv-toggle 一致） -->
      <div
        class="cs-aside-toggle"
        :title="collapsed ? '展开资源列表' : '收起资源列表'"
        @click="toggleAside"
      >
        <el-icon><Expand v-if="collapsed" /><Fold v-else /></el-icon>
      </div>

      <section class="cs-main"><slot /></section>
    </div>
  </div>
</template>

<script setup lang="ts">
// 通用控制台外壳（2026-10-16 从 OpsConsole 抽出，运维与店铺共用）。
// 宽度走 useResizable：localStorage 持久化，故每个模式必须给**不同的 storageKey**，
// 否则两边的侧栏宽度会互相覆盖。
import { ref } from 'vue';
import { Expand, Fold } from '@element-plus/icons-vue';
import { useResizable } from '../../composables/useResizable';

const props = withDefaults(defineProps<{
  /** 宽度持久化 key（每个模式一个，如 'ops_aside' / 'shop_aside'） */
  storageKey: string;
  /** 额外挂到根元素的类（使用方自己的作用域样式类，如 'ops-console'） */
  rootClass?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}>(), { rootClass: '', defaultWidth: 260, minWidth: 160, maxWidth: 460 });

defineEmits<{ (e: 'aside-contextmenu', ev: MouseEvent): void }>();

const asideR = useResizable(props.storageKey, props.defaultWidth, props.minWidth, props.maxWidth);
const asideW = asideR.width;
const collapsed = ref(false);

function toggleAside(): void {
  collapsed.value = !collapsed.value;
}

defineExpose({ collapsed, toggleAside, asideW });
</script>

<style scoped>
/* 根：撑满并自成定位基准（右下角悬浮胶囊 LeadToggle 相对它定位） */
.console-shell {
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
  position: relative;
}
.cs-layout { flex: 1; display: flex; gap: 6px; min-height: 0; position: relative; }
.cs-aside {
  flex: 0 0 auto; display: flex; flex-direction: column; min-height: 0;
  padding-right: 10px; border-right: 1px solid var(--glass-border);
}
.cs-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }

/* 折叠条：贴左边缘竖条（与「对话」页 .conv-toggle 一致） */
.cs-aside-toggle {
  position: absolute; left: calc(var(--cs-aside-w, 260px) + 5px); top: 50%; transform: translateY(-50%);
  width: 20px; height: 48px;
  background: var(--glass-bg); backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border); border-left: none; border-radius: 0 8px 8px 0;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; z-index: 5; font-size: 12px; color: var(--color-text-secondary);
  transition: left 0.25s ease;
}
.cs-aside-toggle:hover { color: var(--color-primary); background: var(--glass-bg-hover); }

/* ===== 面板拖拽分隔条（与 Chat 页 .rs-handle 一致） ===== */
.rs-handle {
  flex: 0 0 7px; width: 7px; cursor: col-resize; position: relative; z-index: 6;
  background: transparent; transition: background 0.15s ease;
}
.rs-handle::after {
  content: ''; position: absolute; top: 0; bottom: 0; left: 50%; width: 2px;
  transform: translateX(-50%); border-radius: 1px;
  background: var(--glass-border, rgba(148, 163, 184, 0.28));
  transition: background 0.15s ease, width 0.15s ease, opacity 0.15s ease;
}
.rs-handle:hover, .rs-handle:active { background: color-mix(in srgb, var(--color-primary) 10%, transparent); }
.rs-handle:hover::after, .rs-handle:active::after { background: var(--color-primary); width: 3px; }
</style>
