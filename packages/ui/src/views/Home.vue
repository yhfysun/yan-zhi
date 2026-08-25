<template>
  <div class="home-page">
    <!-- 太阳系背景 -->
    <SolarSystem v-if="!showEarthMap" @show-earth-map="showEarthMap = true" />

    <!-- 地球地图 -->
    <EarthMap v-else @back="showEarthMap = false" />

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
            <div class="feature-nav-item-info" @click="openGuide(item)">
              <div class="feature-nav-item-icon">
                <el-icon :size="18"><component :is="item.icon" /></el-icon>
              </div>
              <span class="feature-nav-item-name">{{ item.name }}</span>
            </div>
            <el-button size="small" text class="feature-nav-item-enter" @click="$router.push(item.path)">
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
import {
  HomeFilled, ChatDotRound, Monitor, Cpu, Suitcase, Files, MagicStick, Box, Connection, Setting, Grid, InfoFilled,
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

const showEarthMap = ref(false);
const showFeatureNav = ref(false);
const guideVisible = ref(false);
const currentFeature = ref<FeatureInfo | null>(null);

// ── 应用介绍：可拖拽小按钮 ──
const introExpanded = ref(false);
const introPos = ref({ x: 24, y: 24 }); // 小按钮/卡片位置
const introStyle = computed(() => ({ left: introPos.value.x + 'px', top: introPos.value.y + 'px' }));
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

/** 菜单项：icon 字段存储图标组件名，供 FeatureGuide 解析 */
const menuItems: Array<{ path: string; name: string; desc: string; icon: any; iconName: string; color: string; key: string }> = [
  { path: '/home', name: '首页', desc: '平台门户，功能总览', icon: HomeFilled, iconName: 'HomeFilled', color: '#4A90D9', key: 'home' },
  { path: '/chat', name: '聊天', desc: '流式对话、多会话、工具可视化', icon: ChatDotRound, iconName: 'ChatDotRound', color: '#7C3AED', key: 'chat' },
  { path: '/browser', name: '浏览器', desc: '内置浏览器自动化', icon: Monitor, iconName: 'Monitor', color: '#10B981', key: 'browser' },
  { path: '/models', name: '模型平台', desc: 'OpenAI/Anthropic 双协议', icon: Cpu, iconName: 'Cpu', color: '#F59E0B', key: 'models' },
  { path: '/tools', name: '工具管理', desc: '内置+自定义+商城工具', icon: Suitcase, iconName: 'Suitcase', color: '#EF4444', key: 'tools' },
  { path: '/skills', name: 'Skill 商店', desc: '本地+远程 Skill 管理', icon: Files, iconName: 'Files', color: '#8B5CF6', key: 'skills' },
  { path: '/distill', name: 'Skill 蒸馏', desc: '从对话蒸馏可复用 Skill', icon: MagicStick, iconName: 'MagicStick', color: '#EC4899', key: 'distill' },
  { path: '/agents', name: '智能体', desc: 'harness+workflow 智能体', icon: Box, iconName: 'Box', color: '#06B6D4', key: 'agents' },
  { path: '/mcp', name: 'MCP 服务', desc: 'stdio/SSE/HTTP 传输', icon: Connection, iconName: 'Connection', color: '#3B82F6', key: 'mcp' },
  { path: '/settings', name: '设置', desc: '主题/数据/商城配置', icon: Setting, iconName: 'Setting', color: '#64748B', key: 'settings' },
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
.intro-dot:hover { background: rgba(124, 58, 237, 0.4); transform: scale(1.08); }
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
  background: rgba(124, 58, 237, 0.35);
  border-color: rgba(124, 58, 237, 0.6);
  color: #fff;
  transform: scale(1.06);
}
.feature-nav-btn.active {
  background: rgba(124, 58, 237, 0.45);
  border-color: rgba(124, 58, 237, 0.7);
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
  background: color-mix(in srgb, var(--item-color, #7C3AED) 22%, transparent);
  color: var(--item-color, #7C3AED);
  transition: transform 0.2s ease;
}
.feature-nav-item-info:hover .feature-nav-item-icon { transform: scale(1.08); }
.feature-nav-item-name {
  font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.85);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.feature-nav-item-enter {
  flex-shrink: 0; color: rgba(124, 58, 237, 0.9) !important;
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
