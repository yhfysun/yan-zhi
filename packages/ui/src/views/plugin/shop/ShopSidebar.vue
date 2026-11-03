<template>
  <div class="shop-side-head">
    <div class="shop-side-heading">
      <span class="shop-side-title">店铺项目</span>
      <span v-if="projects.length" class="shop-side-count">{{ projects.length }}</span>
    </div>
    <el-button size="small" type="primary" plain :icon="Plus" @click="emit('create-project')">新建</el-button>
  </div>
  <p class="shop-side-desc">一个项目保存一套开店资料、对话和资源。</p>

  <div class="shop-projects">
    <div
      v-for="p in projects"
      :key="p.id"
      class="shop-project"
      :class="{ active: p.id === activeProjectId }"
    >
      <button class="shop-project-main" type="button" @click="emit('select-project', p.id)">
        <el-icon class="shop-project-icon"><ChatLineSquare /></el-icon>
        <span class="shop-project-copy">
          <span class="shop-project-name" :title="p.title">{{ p.title || '未命名项目' }}</span>
          <span class="shop-project-meta">{{ countOf(p.id) ? `${countOf(p.id)} 项资源` : '尚未接入资源' }}</span>
        </span>
      </button>
      <button class="shop-project-del" title="删除项目" @click.stop="emit('delete-project', p)"><el-icon><Close /></el-icon></button>
    </div>

    <!-- 历史连接没有 projectId：单独列出，避免"看不见/丢数据" -->
    <div
      v-if="orphanCount"
      class="shop-project"
      :class="{ active: activeProjectId === '' }"
    >
      <button class="shop-project-main" type="button" @click="emit('select-project', '')">
        <el-icon class="shop-project-icon"><Shop /></el-icon>
        <span class="shop-project-copy">
          <span class="shop-project-name">未归属资源</span>
          <span class="shop-project-meta">{{ orphanCount }} 项历史资源</span>
        </span>
      </button>
    </div>

    <div v-if="!projects.length && !orphanCount" class="shop-project-empty">
      <span class="shop-project-empty-icon" aria-hidden="true"><FolderOpened /></span>
      <strong>先建一个店铺项目</strong>
      <p>开店资料、AI 对话和后续商品订单都会归到这个项目。</p>
      <el-button size="small" type="primary" plain @click="emit('create-project')">新建店铺项目</el-button>
    </div>
  </div>

  <div v-if="activeProjectId" class="shop-project-workspace">
    <span class="shop-project-workspace-icon" aria-hidden="true"><FolderOpened /></span>
    <span class="shop-project-workspace-copy">
      <span>素材目录</span>
      <strong :title="projectWorkspaceDir || '未绑定'">
        {{ projectWorkspaceDir ? workspaceBaseName : '未绑定' }}
      </strong>
    </span>
    <button
      type="button"
      class="shop-project-workspace-action"
      :title="projectWorkspaceDir ? '更换项目素材目录' : '选择项目素材目录'"
      @click="emit('choose-workspace')"
    >{{ projectWorkspaceDir ? '更换' : '选择' }}</button>
  </div>

  <div v-if="projectTasks.length > 1" class="shop-project-tasks">
    <div class="shop-project-tasks-head">
      <span>最近任务</span>
      <span>{{ projectTasks.length }}</span>
    </div>
    <div class="shop-project-task-list">
      <button
        v-for="task in projectTasks"
        :key="task.id"
        type="button"
        class="shop-project-task"
        :class="{ active: task.id === activeTaskId }"
        :title="task.title || '未命名任务'"
        @click="emit('select-task', task.id)"
      >
        <el-icon :size="12"><ChatLineSquare /></el-icon>
        <span class="shop-project-task-name">{{ task.title || '未命名任务' }}</span>
        <span v-if="task.running" class="shop-project-task-running" aria-label="任务运行中"></span>
        <span v-else-if="task.id === activeTaskId" class="shop-project-task-current">当前</span>
      </button>
    </div>
  </div>

  <!-- 当前项目下的资源（店铺列表带 演示/测试/生产 · 有货源/无货源 角标） -->
  <div class="shop-shops">
    <div class="shop-shops-head">
      <div class="shop-side-heading">
        <span class="shop-side-title">已接入资源</span>
        <span class="shop-side-count">{{ shops.length }}</span>
      </div>
      <el-button
        size="small"
        type="primary"
        plain
        :disabled="!activeProjectId"
        @click="emit('create-connection')"
      >＋ 连接</el-button>
    </div>
    <button
      v-for="c in shops"
      :key="c.id"
      type="button"
      class="shop-shop-row"
      :class="{ active: c.id === activeShopId }"
      @click="emit('select-shop', c.id)"
    >
      <el-icon :size="12"><Shop /></el-icon>
      <span class="shop-shop-name" :title="c.shopName">{{ c.shopName }}</span>
      <span class="shop-shop-badges">
        <el-tag size="small" effect="plain" :type="shopTypeMeta(c).tag">{{ shopTypeMeta(c).label }}</el-tag>
        <el-tag size="small" effect="plain" :type="supplyMeta(c).tag">{{ supplyMeta(c).label }}</el-tag>
      </span>
    </button>
    <div v-if="!shops.length" class="shop-resource-empty" role="status">
      <span class="shop-resource-empty-icon" aria-hidden="true"><Shop /></span>
      <strong>{{ activeProjectId ? '还没有接入店铺' : '先选择一个店铺项目' }}</strong>
      <p>
        {{ activeProjectId
          ? '接入后可同步商品、订单和库存；仓储与物流也从这里添加。'
          : '新建项目后再接入店铺、仓储或物流。' }}
      </p>
      <el-button
        size="small"
        type="primary"
        plain
        :disabled="!activeProjectId"
        @click="emit('create-connection')"
      >接入店铺</el-button>
    </div>
  </div>

  <!-- 演示数据：空控制台一眼看懂怎么用；清空只删当前项目的 demo 行 -->
  <div class="shop-demo">
    <template v-if="demoCount">
      <span class="shop-demo-hint">{{ demoCount }} 条演示数据</span>
      <el-button size="small" text type="danger" :loading="demoBusy" @click="emit('clear-demo')">清空演示</el-button>
    </template>
    <el-button v-else size="small" text type="primary" :loading="demoBusy" @click="emit('seed-demo')">先看演示项目</el-button>
  </div>
</template>

<script setup lang="ts">
// 左栏：项目列表 + 当前项目的资源列表（店铺/仓储/物流统一一处，带类型与货源角标）。
import { computed } from 'vue';
import { ChatLineSquare, FolderOpened, Plus, Shop } from '@element-plus/icons-vue';
import type { ShopConnection } from '../shopSession';
import { SHOP_TYPE_META, SUPPLY_META, type ShopType, type SupplyMode } from './useShopApi';

interface ProjectItem { id: string; title?: string }
interface ProjectTaskItem { id: string; title?: string; running?: boolean }

const props = defineProps<{
  projects: ProjectItem[];
  activeProjectId: string;
  projectWorkspaceDir: string;
  projectTasks: ProjectTaskItem[];
  activeTaskId: string;
  shops: ShopConnection[];
  activeShopId: string;
  orphanCount: number;
  demoCount: number;
  demoBusy: boolean;
  counts: Record<string, number>;
}>();

const emit = defineEmits<{
  (e: 'select-project', id: string): void;
  (e: 'choose-workspace'): void;
  (e: 'select-task', id: string): void;
  (e: 'create-project'): void;
  (e: 'delete-project', p: ProjectItem): void;
  (e: 'select-shop', id: string): void;
  (e: 'create-connection'): void;
  (e: 'seed-demo'): void;
  (e: 'clear-demo'): void;
}>();

function countOf(id: string): number {
  return props.counts[id] || 0;
}

const workspaceBaseName = computed(() =>
  props.projectWorkspaceDir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || props.projectWorkspaceDir,
);

/** 老连接没有 shopType：按 demo / 生产标签推导（与后端 shopContextOf 同口径） */
function shopTypeOf(c: ShopConnection): ShopType {
  return c.shopType ?? (c.demo ? 'demo' : c.isProduction ? 'production' : 'test');
}
function shopTypeMeta(c: ShopConnection) {
  return SHOP_TYPE_META[shopTypeOf(c)];
}
function supplyMeta(c: ShopConnection) {
  const mode: SupplyMode = c.supplyMode ?? 'stocked';
  return SUPPLY_META[mode];
}
</script>
