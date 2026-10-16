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

/* ===== 面板拖拽分隔条（与 Chat 页 .rs-handle 一致） =====
   ★ 本组规则**不在本 scoped 块里**，而是放在文件末尾那个**非 scoped 的 `<style>` 块**中：
   运维文件面板的分隔条是**父组件 OpsConsole** 渲染的（`.ops-body > .rs-handle-right`），
   scoped 规则带 data-v 属性跨不过去 ⇒ 那条分隔条会一条样式都吃不到（实测宽 0 / cursor auto，
   看不见也拖不动）。规则与理由见文件末尾。 */

</style>

<!-- ============================================================
     分隔条（`.rs-handle`）—— 故意**不 scoped**，是全局原语
     ============================================================
     ★★ 为什么单独开一个非 scoped 块（2026-10-16 真机事故）：
     本壳的**左栏**分隔条在自己的模板里，scoped 够用；但运维的**文件面板**分隔条由
     **父组件 OpsConsole** 渲染（`.ops-body > .rs-handle-right`）—— scoped 规则带 data-v 属性，
     跨不到父组件的模板 ⇒ 那条分隔条一条样式都吃不到：实测 `width: 0` / `cursor: auto`，
     既不显示也拖不动（文件面板宽度调不了）。
     它此前靠 `views/chat.css` 里一份**同名全局规则**顶着，而 chat.css 只在聊天页被加载 ⇒
     冷启动直接进运维（模式被记住）时同样失效 —— 与 `.ctx-menu` 是同一次事故的两个面：
     **共用控件的样式不能住在按路由懒加载的样式表里**。
     ⚠️ 别改成 scoped 块里的 `:global(.rs-handle)::after`：本仓 Vue 版本会把伪元素规则编到元素自身上
     （实测分隔条 `position: absolute` 脱离文档流、宽变 2px），所以这里用最朴素的非 scoped 块。 -->
<style>
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
