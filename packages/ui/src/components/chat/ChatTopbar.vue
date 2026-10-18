<template>
  <div class="chat-topbar">
    <el-button class="hamburger-btn" text circle @click="drawerOpen = !drawerOpen">
      <el-icon :size="20"><Expand /></el-icon>
    </el-button>
    <span class="conv-title-display">{{ currentConv?.title || '新任务' }}</span>
    <!-- 会话累计花费（2026-10-17 方案 §3.7）：等宽小字，点击展开明细（按模型/按来源）。
         ★ 不加大图标、不加 tip —— 它是"仪表读数"，不是入口。金额读库（切会话/刷新不丢），
           运行中由 task:cost 事件实时刷新。花费为 0 时不占位。 -->
    <el-popover
      v-if="convCost.costCny > 0"
      placement="bottom-start"
      :width="320"
      trigger="click"
      :show-arrow="false"
      popper-class="cost-detail-popover"
    >
      <template #reference>
        <span class="conv-cost" :class="{ 'is-over': convCost.costCny >= convCost.limitCny }">¥{{ fmtCost(convCost.costCny) }}</span>
      </template>
      <div class="cost-detail">
        <div class="cost-detail-head">
          <span>本会话累计花费</span>
          <span class="cost-detail-total">¥{{ fmtCost(convCost.costCny) }}</span>
        </div>
        <div class="cost-detail-limit">提醒档位 ¥{{ fmtCost(convCost.limitCny) }}（到阈值只提醒，任务不会停）</div>
        <div v-if="convCost.byModel.length" class="cost-detail-sec">
          <div class="cost-detail-sec-title">按模型</div>
          <div v-for="m in convCost.byModel" :key="m.label" class="cost-detail-row">
            <span class="cost-detail-label" :title="m.label">{{ m.label }}</span>
            <span class="cost-detail-val">¥{{ fmtCost(m.cny) }}</span>
          </div>
        </div>
        <div v-if="convCost.bySource.length" class="cost-detail-sec">
          <div class="cost-detail-sec-title">按来源</div>
          <div v-for="s in convCost.bySource" :key="s.source" class="cost-detail-row">
            <span class="cost-detail-label">{{ sourceLabel(s.source) }}（{{ s.calls }} 次）</span>
            <span class="cost-detail-val">¥{{ fmtCost(s.cny) }}</span>
          </div>
        </div>
        <div v-if="convCost.unpricedCalls > 0" class="cost-detail-warn">
          另有 {{ convCost.unpricedCalls }} 次调用未配置价格，实际金额可能更高
        </div>
        <div class="cost-detail-note">内置价为参考价（2026-10-17），实际以厂商账单为准</div>
      </div>
    </el-popover>
    <el-tooltip content="新建任务" placement="bottom">
      <el-button size="small" circle class="new-chat-btn" @click="startNewChat()" aria-label="新建任务">
        <!-- 用 DocumentAdd（"新建文档"）而非 EditPen：EditPen 已被输入框工具条的
             「新建任务」圆钮占用，两者同屏会撞脸（2026-09-21 实测 2 处重复）。 -->
        <el-icon><DocumentAdd /></el-icon>
      </el-button>
    </el-tooltip>
    <div class="chat-topbar-actions">
      <!-- 模式切换已统一收进主顶栏模式下拉（WebTopBar ModeSwitcher），此处不再重复入口 -->

      <el-tooltip content="上下文栏" placement="bottom">
        <el-button size="small" circle :type="contextSidebarOpen ? 'primary' : ''" @click="toggleContextSidebar" aria-label="切换上下文栏">
          <!-- 用 DataLine 而非 Grid：Grid 已被右侧面板空态的「数据浏览」占用，
               两者同屏会撞脸（2026-09-21 实测 2 处重复）。 -->
          <el-icon><DataLine /></el-icon>
        </el-button>
      </el-tooltip>

      <ChatFilePanel />

      <el-dropdown trigger="click">
        <el-button size="small" circle title="右侧栏视图" aria-label="右侧栏视图">
          <el-icon><Operation /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-if="supportsBrowser" @click="store.openTab({ kind: 'browser', name: '浏览器', url: '' })">
              <el-icon><Monitor /></el-icon><span>浏览器预览</span>
            </el-dropdown-item>
            <el-dropdown-item @click="openGitTab" :disabled="!hasWorkspaceDir">
              <el-icon><FolderOpened /></el-icon><span>Git 文件</span>
            </el-dropdown-item>
            <el-dropdown-item @click="openConsoleTab">
              <!-- 原为 Cpu：与 TabBar「模型」项同图标，下拉展开时同屏撞脸（2026-09-21 实测）。
                   控制台 = 服务端/平台控制台，用 Platform 更贴语义。 -->
              <el-icon><Platform /></el-icon><span>控制台</span>
            </el-dropdown-item>
            <el-dropdown-item divided @click="store.rightPanelOpen = !store.rightPanelOpen">
              <el-icon><Fold v-if="store.rightPanelOpen" /><Expand v-else /></el-icon>
              <span>{{ store.rightPanelOpen ? '收起右侧栏' : '展开右侧栏' }}</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-dropdown v-if="isMobile && authStore.isLoggedIn" trigger="click">
        <span class="mobile-user-avatar">{{ authStore.user?.username?.slice(0, 1) || 'U' }}</span>
        <template #dropdown>
          <el-dropdown-menu>
            <div class="user-dropdown-header">
              <span class="user-dropdown-name">{{ authStore.user?.username }}</span>
            </div>
            <el-dropdown-item divided @click="authStore.logout()">
              <el-icon><SwitchButton /></el-icon>
              <span>退出登录</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <!-- ★★★ 本机单机端（Capacitor）→ 中性「本机」头像，不给登录入口（2026-09-27）。
           移动端跑内嵌后端、身份恒为 guest（本地自带，非用户登录），与桌面端同一形态；
           此前是无条件 `v-else-if="isMobile"` → 移动端稳定渲染出「登录」死入口。 -->
      <span v-else-if="isMobile && isLocalClient" class="mobile-user-avatar is-local" title="本机">{{ localIdentityInitial }}</span>
      <router-link v-else-if="isMobile" to="/login" class="mobile-user-avatar" style="text-decoration:none;font-size:14px">
        <el-icon :size="18"><Avatar /></el-icon>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Expand, FolderOpened, Fold, DataLine, Monitor, Operation, DocumentAdd, SwitchButton, Avatar, Platform } from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
import { usePlatform } from '../../composables/usePlatform';
import { useSettingsStore } from '../../stores/settings';
import { isLocalClient } from '../../api/client';
import ChatFilePanel from './ChatFilePanel.vue';

const {
  drawerOpen, currentConv, store, isMobile, authStore,
  contextSidebarOpen, toggleContextSidebar,
  startNewChat, costStore,
} = useChat();

const settingsStore = useSettingsStore();
// E12: 移动端不支持内置浏览器——隐藏「浏览器预览」下拉入口
const { supportsBrowser } = usePlatform();
const hasWorkspaceDir = computed(() => !!settingsStore.settings.workspaceDir);

/** 本会话累计花费（等宽小字的数据源；0 时不渲染） */
const convCost = computed(() => costStore.usageOf(currentConv.value?.id));

/** 金额格式：<1 显示 4 位（小额很常见，否则 ¥0.0032 会显示成 ¥0.00），≥1 显示 2 位 */
function fmtCost(n: number): string {
  const v = Number(n) || 0;
  return v < 1 ? v.toFixed(4) : v.toFixed(2);
}

/** 调用来源的中文名（与后端 source 口径一致） */
const SOURCE_LABELS: Record<string, string> = {
  main: '主对话', sub_agent: '子智能体', summary: '进展总结', judge: '自评/判断', probe: '连通性测试',
};
function sourceLabel(s: string): string {
  return SOURCE_LABELS[s] || s;
}

/** 本机身份首字母（本机单机端的中性头像，不暴露 guest 这个内部身份） */
const localIdentityInitial = computed(() => '本');

// 「代码模式」圆形按钮已删（决策 1）：进入开发模式统一走顶栏模式下拉。

// 模式切换统一走主顶栏 ModeSwitcher，此处不再保留重复入口

function openGitTab() {
  const dir = settingsStore.settings.workspaceDir || '';
  const repoName = dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Git';
  store.openTab({ kind: 'git', name: repoName, repoPath: dir });
}

function openConsoleTab() {
  store.openTab({ kind: 'console', name: '控制台' });
}
</script>

<style scoped>
.new-chat-btn {
  flex-shrink: 0;
  margin-left: 6px;
}

/* 会话累计花费：等宽小字（仪表读数，不是入口） */
.conv-cost {
  flex-shrink: 0;
  margin-left: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1;
  opacity: 0.72;
  cursor: pointer;
  user-select: none;
}
.conv-cost:hover { opacity: 1; }
.conv-cost.is-over { color: var(--el-color-warning); opacity: 1; }

/* 花费明细弹层（el-popover 内容虽是 Teleport，但 Vue3 下仍带本组件的 scoped 属性） */
.cost-detail { font-size: 12px; line-height: 1.6; }
.cost-detail-head { display: flex; justify-content: space-between; font-weight: 600; }
.cost-detail-total { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.cost-detail-limit { margin-top: 2px; color: var(--el-text-color-secondary, #909399); }
.cost-detail-sec { margin-top: 10px; }
.cost-detail-sec-title { font-weight: 600; margin-bottom: 2px; }
.cost-detail-row { display: flex; justify-content: space-between; gap: 12px; }
.cost-detail-label {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--el-text-color-regular, #cfd3dc);
}
.cost-detail-val { flex-shrink: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.cost-detail-warn { margin-top: 10px; color: var(--el-color-warning); }
.cost-detail-note { margin-top: 8px; color: var(--el-text-color-secondary, #909399); }
</style>