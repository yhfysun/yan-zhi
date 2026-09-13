<template>
  <div class="home-page">
    <!-- 太阳系背景 -->
    <SolarSystem v-if="!showEarthMap && !isMobile" @show-earth-map="showEarthMap = true" />

    <!-- 地球地图 -->
    <EarthMap v-else-if="!isMobile" @back="showEarthMap = false" />

    <!-- 应用介绍（可拖拽小圆点，点击展开） -->
    <div v-if="!showEarthMap">
      <!-- 展开后的介绍 -->
      <transition name="intro-pop">
        <div v-if="introExpanded" class="app-intro" :style="introStyle">
          <button class="intro-close" @click="introExpanded = false">×</button>
          <h1 class="app-title">言智 <span class="app-en">Yan-Zhi</span></h1>
          <p class="app-subtitle">语言可控的智能体平台</p>
        </div>
      </transition>
      <!-- 折叠时的小圆点 -->
      <div v-if="!introExpanded" class="intro-dot" :style="introStyle"
        @mousedown="startDragIntro" @click="onIntroClick" title="言智介绍">
        <el-icon :size="16"><InfoFilled /></el-icon>
      </div>
    </div>

    <!-- 左上角功能导航小按钮 -->
    <button
      v-if="!showEarthMap"
      class="feature-nav-btn glass-card"
      :class="{ active: showFeatureNav }"
      @click="showFeatureNav = !showFeatureNav"
      title="功能导航"
    >
      <el-icon :size="18"><Grid /></el-icon>
    </button>

    <!-- 功能列表面板（从左侧滑出） -->
    <transition name="slide-left">
      <div v-if="showFeatureNav && !showEarthMap" class="feature-nav-panel glass-card">
        <div class="feature-nav-header">
          <span class="feature-nav-title">功能导航</span>
          <button class="feature-nav-close" @click="showFeatureNav = false" aria-label="关闭">×</button>
        </div>
        <div class="feature-nav-list">
          <div
            v-for="item in menuItems"
            :key="item.path"
            class="feature-nav-item"
            :style="{ '--item-color': item.color }"
          >
            <div class="feature-nav-item-info" @click="handleInfoClick(item)">
              <div class="feature-nav-item-icon">
                <el-icon :size="18"><component :is="item.icon" /></el-icon>
              </div>
              <span class="feature-nav-item-name">{{ item.name }}</span>
            </div>
            <el-button size="small" text class="feature-nav-item-enter" @click="enterItem(item)">
              进入
            </el-button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 功能详情透明弹窗 -->
    <FeatureGuide
      v-if="guideVisible"
      :feature="currentFeature"
      @close="guideVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useIsMobile } from '../composables/useIsMobile';
import {
  ChatDotRound, ChatLineRound, Collection, Monitor, Setting, Cpu, Grid, InfoFilled,
  User, Connection, Tools, Files, Link, Platform, Memo, MagicStick,
} from '@element-plus/icons-vue';
import SolarSystem from '../components/home/SolarSystem.vue';
import EarthMap from '../components/home/EarthMap.vue';
import FeatureGuide from '../components/home/FeatureGuide.vue';

/** 功能信息（与 FeatureGuide.vue 的 FeatureInfo 接口保持一致） */
interface FeatureInfo {
  key: string;
  name: string;
  icon: string;
  color: string;
  route: string;
}

const isMobile = useIsMobile();
const showEarthMap = ref(false);
const showFeatureNav = ref(isMobile.value);
const guideVisible = ref(false);
const currentFeature = ref<FeatureInfo | null>(null);

// ── 应用介绍：可拖拽小按钮 ──
const introExpanded = ref(false);
const introPos = ref({ x: 24, y: 24 }); // 小按钮/卡片位置
const introStyle = computed(() => ({ left: introPos.value.x + 'px', top: introPos.value.y + 'px' }));
const router = useRouter();
let introDragging = false;
let introDragStartX = 0;
let introDragStartY = 0;
let introDragMoved = false;

function startDragIntro(e: MouseEvent) {
  introDragging = true;
  introDragMoved = false;
  introDragStartX = e.clientX - introPos.value.x;
  introDragStartY = e.clientY - introPos.value.y;
  window.addEventListener('mousemove', onDragIntro);
  window.addEventListener('mouseup', endDragIntro);
}
function onDragIntro(e: MouseEvent) {
  if (!introDragging) return;
  introDragMoved = true;
  introPos.value = {
    x: Math.max(0, Math.min(window.innerWidth - 60, e.clientX - introDragStartX)),
    y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - introDragStartY)),
  };
}
function endDragIntro() {
  introDragging = false;
  window.removeEventListener('mousemove', onDragIntro);
  window.removeEventListener('mouseup', endDragIntro);
}
function onIntroClick() {
  // 拖拽后松手不触发点击
  if (introDragMoved) { introDragMoved = false; return; }
  introExpanded.value = true;
}

/** 菜单项：核心导航 5 项 + 2 个设置分组入口 */
interface HomeMenuItem {
  path: string;
  name: string;
  desc: string;
  icon: any;
  iconName: string;
  color: string;
  key: string;
}

const menuItems: HomeMenuItem[] = [
  { path: '/chat', name: '任务', desc: '与大模型多任务并行、跑工具化任务（含文件/结果区/浏览器预览）', icon: ChatDotRound, iconName: 'ChatDotRound', color: '#C2410C', key: 'chat' },
  { path: '/chat-hub', name: '消息', desc: '统一聊天中心：本应用助手 + 言智节点互聊 + 飞书/企业微信/个人微信渠道', icon: ChatLineRound, iconName: 'ChatLineRound', color: '#0EA5E9', key: 'chat-hub' },
  { path: '/browser', name: '浏览器', desc: '内置浏览器自动化（真实鼠标/键盘模拟 + pageAgent）', icon: Monitor, iconName: 'Monitor', color: '#F59E0B', key: 'browser' },
  { path: '/knowledge', name: '知识库', desc: '文档切块向量化、语义检索，命中自动注入对话', icon: Collection, iconName: 'Collection', color: '#10B981', key: 'knowledge' },
  { path: '/agents', name: '智能体', desc: 'harness 对话智能体 + Vue Flow 工作流画布 + 子智能体调度', icon: User, iconName: 'User', color: '#F43F5E', key: 'agents' },
  { path: '/mcp', name: 'MCP 连接', desc: '接入外部 MCP 服务（stdio / SSE / Streamable HTTP）', icon: Connection, iconName: 'Connection', color: '#6366F1', key: 'mcp' },
  { path: '/tools', name: '工具', desc: '内置工具 + 自定义 JS 沙箱工具 + 同源商城工具', icon: Tools, iconName: 'Tools', color: '#475569', key: 'tools' },
  { path: '/skills', name: 'Skill', desc: '本地技能管理 + 远程 Skill 商城（分页/详情/搜索/分类）', icon: Files, iconName: 'Files', color: '#CA8A04', key: 'skills' },
  { path: '/models', name: '模型平台', desc: 'OpenAI / Anthropic 双协议平台与模型管理', icon: Cpu, iconName: 'Cpu', color: '#2563EB', key: 'models' },
  { path: '/connections', name: 'IM 连接', desc: '飞书 / 企业微信 / 个人微信接入，收消息自动跑任务并回执', icon: Link, iconName: 'Link', color: '#0D9488', key: 'connections' },
  { path: '/peers', name: '客户端节点', desc: '言智节点互联：互取工具 / Skill / 智能体，可作商城服务端', icon: Platform, iconName: 'Platform', color: '#B45309', key: 'peers' },
  { path: '/memory', name: '记忆管理', desc: '三层自动记忆：每日 / 会话 / 长期向量，自动抽取与注入', icon: Memo, iconName: 'Memo', color: '#7C2D12', key: 'memory' },
  { path: '/distill', name: 'Skill 蒸馏', desc: '从对话记录蒸馏出可复用的 Skill · 三屏工作台', icon: MagicStick, iconName: 'MagicStick', color: '#9333EA', key: 'distill' },
  { path: '/settings', name: '设置', desc: '通用与数据：主题、默认模型、备份与缓存', icon: Setting, iconName: 'Setting', color: '#64748B', key: 'settings' },
];

/** 打开功能详情弹窗 */
function openGuide(item: typeof menuItems[number]) {
  currentFeature.value = {
    key: item.key,
    name: item.name,
    icon: item.iconName,
    color: item.color,
    route: item.path,
  };
  guideVisible.value = true;
  showFeatureNav.value = false;
}

function enterItem(item: HomeMenuItem) {
  router.push(item.path);
  showFeatureNav.value = false;
}

function handleInfoClick(item: HomeMenuItem) {
  openGuide(item);
}
</script>

<style scoped>
.home-page { position: relative; width: 100%; flex: 1; overflow: hidden; }

.home-overlay {
  position: absolute; inset: 0; z-index: 5; pointer-events: none;
  display: flex; flex-direction: column; justify-content: space-between;
  padding: 24px;
}
.home-overlay > * { pointer-events: auto; }

/* 应用介绍小圆点（可拖拽，InfoFilled 图标） */
.intro-dot {
  position: absolute; z-index: 50;
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.9);
  cursor: grab; user-select: none;
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  transition: transform 0.2s ease, background 0.2s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
.intro-dot:hover { background: color-mix(in srgb, var(--color-primary) 55%, transparent); transform: scale(1.08); }
.intro-dot:active { cursor: grabbing; }

/* 展开后的介绍卡片 */
.app-intro {
  position: absolute; z-index: 51;
  padding: 18px 28px; text-align: center;
  background: rgba(0, 5, 16, 0.75); border: 1px solid rgba(255,255,255,0.12);
  border-radius: 14px; color: #fff;
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  cursor: move; user-select: none;
}
.app-title { font-size: 24px; font-weight: 800; margin-bottom: 4px; color: #fff; }
.app-en { font-size: 14px; font-weight: 400; color: rgba(255,255,255,0.6); }
.app-subtitle { font-size: 14px; color: rgba(255,255,255,0.8); margin: 0; }
.intro-close {
  position: absolute; top: 8px; right: 10px;
  width: 22px; height: 22px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.7); font-size: 14px; line-height: 1;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.intro-close:hover { background: rgba(239, 68, 68, 0.3); color: #fff; }

/* 介绍弹出动画 */
.intro-pop-enter-active, .intro-pop-leave-active { transition: all 0.25s ease; }
.intro-pop-enter-from, .intro-pop-leave-to { opacity: 0; transform: scale(0.8); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.4s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ===== 左上角功能导航小按钮 ===== */
.feature-nav-btn {
  position: absolute; left: 16px; top: 16px; z-index: 50;
  width: 44px; height: 44px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all 0.25s ease;
}
.feature-nav-btn:hover {
  background: color-mix(in srgb, var(--color-primary) 35%, transparent);
  border-color: color-mix(in srgb, var(--color-primary) 60%, transparent);
  color: #fff;
  transform: scale(1.06);
}
.feature-nav-btn.active {
  background: color-mix(in srgb, var(--color-primary) 45%, transparent);
  border-color: color-mix(in srgb, var(--color-primary) 70%, transparent);
  color: #fff;
}
/* 关闭 glass-card 默认 hover 位移，避免按钮跳动 */
.feature-nav-btn:hover { transform: scale(1.06); }

/* ===== 功能列表面板 ===== */
.feature-nav-panel {
  position: absolute; left: 16px; top: 72px; z-index: 49;
  width: 280px; max-height: calc(100vh - 96px);
  display: flex; flex-direction: column;
  background: rgba(15, 23, 42, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  color: #fff;
  overflow: hidden;
}
.feature-nav-panel:hover { transform: none; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4); }

.feature-nav-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.feature-nav-title {
  font-size: 14px; font-weight: 600; color: rgba(255, 255, 255, 0.9);
  letter-spacing: 0.5px;
}
.feature-nav-close {
  width: 26px; height: 26px; border-radius: 6px;
  border: none; background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
  font-size: 18px; line-height: 1; cursor: pointer;
  transition: all 0.2s;
}
.feature-nav-close:hover {
  background: rgba(239, 68, 68, 0.3); color: #fff;
}

.feature-nav-list {
  flex: 1; overflow-y: auto; padding: 8px;
}
.feature-nav-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; margin-bottom: 4px; gap: 8px;
  border-radius: 10px;
  transition: background 0.2s ease;
}
.feature-nav-item:hover {
  background: rgba(255, 255, 255, 0.06);
}
.feature-nav-item-info {
  display: flex; align-items: center; gap: 10px;
  cursor: pointer; flex: 1; min-width: 0;
}
.feature-nav-item-icon {
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--item-color, #C2410C) 22%, transparent);
  color: var(--item-color, #C2410C);
  transition: transform 0.2s ease;
}
.feature-nav-item-info:hover .feature-nav-item-icon { transform: scale(1.08); }
.feature-nav-item-name {
  font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.85);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.feature-nav-item-enter {
  flex-shrink: 0; color: var(--color-primary) !important;
}
.feature-nav-item-enter:hover { color: #fff !important; }

/* 左侧滑出动画 */
.slide-left-enter-active, .slide-left-leave-active { transition: all 0.28s cubic-bezier(0.22, 1, 0.36, 1); }
.slide-left-enter-from, .slide-left-leave-to {
  opacity: 0; transform: translateX(-20px);
}

@media (max-width: 767px) {
  .home-overlay { padding: 12px; }
  .app-intro { padding: 14px 18px; }
  .app-title { font-size: 22px; }
  .app-desc { font-size: 12px; }
  .feature-nav-btn { left: 12px; top: 12px; width: 40px; height: 40px; }
  .feature-nav-panel { left: 12px; top: 60px; width: calc(100vw - 24px); max-width: 320px; }
}
</style>
