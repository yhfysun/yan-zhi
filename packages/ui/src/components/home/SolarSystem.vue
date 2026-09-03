<template>
  <div class="solar-system" ref="containerRef">
    <canvas ref="canvasRef" class="solar-canvas"></canvas>

    <!-- 星球介绍右侧面板 -->
    <transition name="panel-slide">
      <div v-if="selectedPlanet">
        <!-- 折叠状态：小星球图标（可拖动） -->
        <div v-if="panelCollapsed" class="planet-mini-orb"
          :style="{ background: selectedPlanet.color, right: miniOrbPos.right + 'px', bottom: miniOrbPos.bottom + 'px' }"
          @click="onMiniOrbClick"
          @mousedown="startDragMiniOrb"
          title="点击展开 · 可拖动">
          {{ selectedPlanet.emoji }}
        </div>
        <!-- 展开状态：完整面板 -->
        <div v-else class="planet-panel glass-card">
          <button class="panel-close" @click="closePlanet">×</button>
          <div class="panel-header" @click="panelCollapsed = true">
            <div class="panel-icon" :style="{ background: selectedPlanet.color }">{{ selectedPlanet.emoji }}</div>
            <div class="panel-titles">
              <h3 class="panel-name">{{ selectedPlanet.name }}</h3>
              <span class="panel-feature" v-if="selectedPlanet.feature">{{ selectedPlanet.feature }}</span>
            </div>
            <button class="panel-toggle" title="收起">
              <el-icon :size="12"><ArrowDown /></el-icon>
            </button>
          </div>
          <div class="panel-body">
            <p class="panel-desc">{{ selectedPlanet.description }}</p>
            <div class="panel-divider"></div>
            <div class="panel-stats" v-if="selectedPlanetStats">
              <div class="stat-row"><span class="stat-label">直径</span><span class="stat-value">{{ selectedPlanetStats.diameter }}</span></div>
              <div class="stat-row"><span class="stat-label">距太阳</span><span class="stat-value">{{ selectedPlanetStats.distance }}</span></div>
              <div class="stat-row"><span class="stat-label">公转周期</span><span class="stat-value">{{ selectedPlanetStats.period }}</span></div>
              <div class="stat-row"><span class="stat-label">特征</span><span class="stat-value">{{ selectedPlanetStats.feature }}</span></div>
            </div>
            <div class="panel-actions">
              <el-button v-if="selectedPlanet.route" type="primary" @click="goToPlanet(selectedPlanet)">
                进入{{ selectedPlanet.feature }}
              </el-button>
              <el-button v-if="selectedPlanet.isEarth" @click="$emit('show-earth-map')">
                查看真实地球
              </el-button>
            </div>
            <div class="panel-hint">📷 已聚焦{{ selectedPlanet.name }}，拖动可旋转观察，关闭后恢复运转</div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import * as THREE from 'three';
import { ArrowDown } from '@element-plus/icons-vue';

const emit = defineEmits<{ 'show-earth-map': [] }>();
const router = useRouter();
const containerRef = ref<HTMLDivElement>();
const canvasRef = ref<HTMLCanvasElement>();
const selectedPlanet = ref<PlanetInfo | null>(null);
const panelCollapsed = ref(false); // 星球面板折叠状态
// 小星球图标拖动位置（right/bottom 偏移，相对于容器右下角）
const miniOrbPos = ref({ right: 24, bottom: 24 });
let miniOrbDragging = false;
let miniOrbDragMoved = false;
const selectedPlanetStats = computed(() => {
  if (!selectedPlanet.value) return null;
  return PLANET_STATS[selectedPlanet.value.name] || null;
});

interface PlanetInfo {
  name: string; emoji: string; color: string; description: string;
  feature?: string; route?: string; isEarth?: boolean;
}

const PLANETS: PlanetInfo[] = [
  { name: '太阳', emoji: '☀️', color: '#FDB813', description: '言智的核心——语言可控的智能体平台，所有管理功能均可通过自然语言操控。', feature: '应用核心' },
  { name: '水星', emoji: '💬', color: '#A0826D', description: '流式对话、Markdown 渲染、多会话管理、工具调用可视化、思考链展示。', feature: '任务', route: '/chat' },
  { name: '金星', emoji: '⚙️', color: '#E8C39E', description: 'OpenAI 与 Anthropic 双协议配置，模型自动拉取、连通性测试、健康检查。', feature: '模型平台', route: '/models' },
  { name: '地球', emoji: '🌍', color: '#4A90D9', description: '应用的门面——首页太阳系探索。点击查看真实地球地图，点击国家查询信息。', feature: '首页', route: '/home', isEarth: true },
  { name: '火星', emoji: '🔧', color: '#CD5C5C', description: '内置工具 + 自定义 JS 沙箱工具 + 同源商城工具，统一 CustomTool 协议。', feature: '工具管理', route: '/tools' },
  { name: '木星', emoji: '📚', color: '#D8A47F', description: '本地 Skill 管理 + 远程 Skill 商城，Markdown 格式，标准化 Marketplace Protocol。', feature: 'Skill 商店', route: '/skills' },
  { name: '土星', emoji: '✨', color: '#F4E4BC', description: '从对话记录蒸馏出可复用 Skill，配置蒸馏智能体提示词/温度，预览改造保存。', feature: 'Skill 蒸馏', route: '/distill' },
  { name: '天王星', emoji: '🤖', color: '#7FDBDA', description: 'harness 与 workflow 两种类型，Vue Flow 工作流画布，子智能体调度与记忆。', feature: '智能体', route: '/agents' },
  { name: '海王星', emoji: '🔌', color: '#4169E1', description: 'stdio / SSE / Streamable HTTP 三种传输，工具列表预览、连接日志。', feature: 'MCP 服务', route: '/mcp' },
];

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let animationId: number;
let planets: THREE.Mesh[] = [];
let planetGroup: THREE.Group;
let raycaster: THREE.Raycaster;
let mouse: THREE.Vector2;
let starField: THREE.Points;
let speedLines: THREE.Points;
let sunGlow: THREE.Mesh;
let earthAtmosphere: THREE.Mesh;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragDistance = 0; // 累计拖拽距离，用于区分"点击"和"拖拽后松手"
let cameraAngleX = 0.2;
let cameraAngleY = 0;
let cameraDistance = 36;
let baseDistance = 36; // 用户缩放基准（呼吸动画叠加其上，缩放不丢失）
let resizeObserver: ResizeObserver;
let clock = 0;
let particleTexture: THREE.Texture;

// 相机飞行动画
let isFocusing = false;
let selectedPlanetIndex = -1;
let cameraTargetPos = new THREE.Vector3(0, 0, 36);
let cameraTargetLook = new THREE.Vector3(0, 0, 0);
let currentLook = new THREE.Vector3(0, 0, 0);

// 聚焦模式下相机控制变量（围绕选中星球观察）
let focusDistance = 10;    // 聚焦模式下相机与星球的距离
let focusAngleX = 0.2;     // 聚焦模式下相机的俯仰角
let focusAngleY = 0;       // 聚焦模式下相机的水平角
let focusLerp = 1;         // 聚焦过渡进度 0→1（平滑飞行动画）
let focusStartPos = new THREE.Vector3(); // 聚焦开始时相机位置

// 真实纹理加载器（异步加载 textures/*.jpg，失败则保留程序化纹理）
const textureLoader = new THREE.TextureLoader();
const TEX_BASE = (import.meta.env.BASE_URL || '/') + 'textures/';

// 星球天文数据
const PLANET_STATS: Record<string, { diameter: string; distance: string; period: string; feature: string }> = {
  '太阳': { diameter: '1,392,700 km', distance: '—', period: '—', feature: 'G2V 主序星，表面温度 5778K' },
  '水星': { diameter: '4,879 km', distance: '0.39 AU', period: '88 天', feature: '最内行星，无大气层' },
  '金星': { diameter: '12,104 km', distance: '0.72 AU', period: '225 天', feature: '浓厚硫酸云层，表面 462°C' },
  '地球': { diameter: '12,742 km', distance: '1.00 AU', period: '365 天', feature: '唯一已知有生命的行星' },
  '火星': { diameter: '6,779 km', distance: '1.52 AU', period: '687 天', feature: '红色表面，两极冰冠' },
  '木星': { diameter: '139,820 km', distance: '5.20 AU', period: '11.9 年', feature: '最大行星，大红斑风暴' },
  '土星': { diameter: '116,460 km', distance: '9.54 AU', period: '29.5 年', feature: '壮观光环系统' },
  '天王星': { diameter: '50,724 km', distance: '19.2 AU', period: '84 年', feature: '侧向自转，冰巨星' },
  '海王星': { diameter: '49,244 km', distance: '30.1 AU', period: '165 年', feature: '最远行星，大暗斑风暴' },
};

// ===== 程序化生成圆形光点纹理（解决粒子方块问题） =====
function createParticleTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

// ===== 程序化生成行星表面纹理（解决贴图问题） =====
function createPlanetTexture(type: string): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // 噪声辅助函数
  const noise = (x: number, y: number, scale: number) => {
    return (Math.sin(x * scale * 0.1) * Math.cos(y * scale * 0.13) + Math.sin(x * scale * 0.07 + 2) * Math.cos(y * scale * 0.11 + 1)) * 0.5;
  };

  switch (type) {
    case 'sun': {
      // 太阳：亮黄底色 + 颗粒状表面
      ctx.fillStyle = '#FFCC33';
      ctx.fillRect(0, 0, 1024, 512);
      for (let i = 0; i < 8000; i++) {
        const x = Math.random() * 1024, y = Math.random() * 512;
        const n = noise(x, y, 3);
        ctx.fillStyle = n > 0 ? `rgba(255,220,80,${0.3 + n * 0.3})` : `rgba(255,140,20,${0.2 + Math.abs(n) * 0.3})`;
        ctx.fillRect(x, y, 3, 3);
      }
      break;
    }
    case 'mercury': {
      // 水星：灰褐色 + 陨石坑
      ctx.fillStyle = '#8C7853';
      ctx.fillRect(0, 0, 1024, 512);
      for (let i = 0; i < 200; i++) {
        const x = Math.random() * 1024, y = Math.random() * 512, r = 3 + Math.random() * 15;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(60,50,40,0.6)');
        grad.addColorStop(1, 'rgba(60,50,40,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < 5000; i++) {
        ctx.fillStyle = `rgba(${140 + Math.random() * 40},${120 + Math.random() * 30},${80 + Math.random() * 20},0.3)`;
        ctx.fillRect(Math.random() * 1024, Math.random() * 512, 2, 2);
      }
      break;
    }
    case 'venus': {
      // 金星：黄褐色云层条纹
      for (let y = 0; y < 512; y++) {
        const n = noise(0, y, 8) + noise(0, y, 20) * 0.5;
        const r = 220 + n * 30, g = 180 + n * 25, b = 120 + n * 20;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(0, y, 1024, 1);
      }
      for (let i = 0; i < 3000; i++) {
        const x = Math.random() * 1024, y = Math.random() * 512;
        ctx.fillStyle = `rgba(255,230,180,${Math.random() * 0.15})`;
        ctx.fillRect(x, y, 20 + Math.random() * 40, 2);
      }
      break;
    }
    case 'earth': {
      // 地球：蓝色海洋 + 绿色大陆 + 白色云层 + 极地冰盖
      ctx.fillStyle = '#1a5f9e';
      ctx.fillRect(0, 0, 1024, 512);
      // 大陆
      ctx.fillStyle = '#2d8a3e';
      for (let i = 0; i < 12; i++) {
        const cx = Math.random() * 1024, cy = 100 + Math.random() * 312;
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.1) {
          const r = 40 + Math.random() * 80;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.6;
          if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill();
      }
      // 沙漠/山脉
      ctx.fillStyle = 'rgba(180,150,100,0.4)';
      for (let i = 0; i < 20; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * 1024, 120 + Math.random() * 272, 15 + Math.random() * 35, 0, Math.PI * 2);
        ctx.fill();
      }
      // 极地冰盖
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(0, 0, 1024, 40);
      ctx.fillRect(0, 472, 1024, 40);
      // 云层
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 30; i++) {
        ctx.beginPath();
        ctx.ellipse(Math.random() * 1024, Math.random() * 512, 30 + Math.random() * 60, 8 + Math.random() * 15, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'mars': {
      // 火星：红褐色 + 暗色区域 + 极冠
      ctx.fillStyle = '#c1440e';
      ctx.fillRect(0, 0, 1024, 512);
      for (let i = 0; i < 6000; i++) {
        const x = Math.random() * 1024, y = Math.random() * 512;
        const n = noise(x, y, 5);
        ctx.fillStyle = n > 0 ? `rgba(200,80,30,0.3)` : `rgba(120,50,20,0.3)`;
        ctx.fillRect(x, y, 4, 4);
      }
      // 暗色区域
      ctx.fillStyle = 'rgba(80,30,10,0.3)';
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * 1024, 100 + Math.random() * 312, 40 + Math.random() * 60, 0, Math.PI * 2);
        ctx.fill();
      }
      // 极冠
      ctx.fillStyle = 'rgba(240,230,220,0.7)';
      ctx.fillRect(0, 0, 1024, 25);
      ctx.fillRect(0, 487, 1024, 25);
      break;
    }
    case 'jupiter': {
      // 木星：橙褐色条纹带
      const bands = ['#c9a06b', '#d4ae7d', '#b88a5a', '#e0c094', '#a9794a', '#d4ae7d', '#c9a06b', '#e0c094', '#b88a5a', '#d4ae7d'];
      for (let i = 0; i < bands.length; i++) {
        ctx.fillStyle = bands[i];
        ctx.fillRect(0, (i / bands.length) * 512, 1024, 512 / bands.length + 1);
      }
      // 大红斑
      ctx.fillStyle = 'rgba(180,60,30,0.6)';
      ctx.beginPath(); ctx.ellipse(600, 300, 60, 35, 0, 0, Math.PI * 2); ctx.fill();
      // 条纹噪声
      for (let i = 0; i < 4000; i++) {
        ctx.fillStyle = `rgba(${200 + Math.random() * 55},${150 + Math.random() * 50},${100 + Math.random() * 40},${Math.random() * 0.2})`;
        ctx.fillRect(Math.random() * 1024, Math.random() * 512, 15 + Math.random() * 30, 2);
      }
      break;
    }
    case 'saturn': {
      // 土星：淡黄色条纹带
      const bands = ['#e8d5a3', '#f0e0b0', '#dcc890', '#f4e4bc', '#d0b878', '#f0e0b0', '#e8d5a3', '#f4e4bc', '#dcc890', '#f0e0b0'];
      for (let i = 0; i < bands.length; i++) {
        ctx.fillStyle = bands[i];
        ctx.fillRect(0, (i / bands.length) * 512, 1024, 512 / bands.length + 1);
      }
      for (let i = 0; i < 3000; i++) {
        ctx.fillStyle = `rgba(${230 + Math.random() * 25},${210 + Math.random() * 30},${170 + Math.random() * 30},${Math.random() * 0.15})`;
        ctx.fillRect(Math.random() * 1024, Math.random() * 512, 20 + Math.random() * 40, 2);
      }
      break;
    }
    case 'uranus': {
      // 天王星：青色平滑
      ctx.fillStyle = '#7fdada';
      ctx.fillRect(0, 0, 1024, 512);
      for (let i = 0; i < 2000; i++) {
        const n = noise(Math.random() * 1024, Math.random() * 512, 3);
        ctx.fillStyle = `rgba(${100 + n * 30},${200 + n * 20},${210 + n * 20},0.1)`;
        ctx.fillRect(Math.random() * 1024, Math.random() * 512, 5, 5);
      }
      break;
    }
    case 'neptune': {
      // 海王星：深蓝色 + 风暴
      ctx.fillStyle = '#3b6de0';
      ctx.fillRect(0, 0, 1024, 512);
      for (let i = 0; i < 3000; i++) {
        const n = noise(Math.random() * 1024, Math.random() * 512, 4);
        ctx.fillStyle = n > 0 ? `rgba(80,130,240,0.2)` : `rgba(20,50,150,0.2)`;
        ctx.fillRect(Math.random() * 1024, Math.random() * 512, 6, 6);
      }
      // 大暗斑
      ctx.fillStyle = 'rgba(20,40,100,0.5)';
      ctx.beginPath(); ctx.ellipse(500, 280, 50, 30, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

onMounted(() => {
  particleTexture = createParticleTexture();
  initScene();
  animate();
  setupInteraction();
  resizeObserver = new ResizeObserver(() => onResize());
  if (containerRef.value) resizeObserver.observe(containerRef.value);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId);
  resizeObserver?.disconnect();
  canvasRef.value?.removeEventListener('mousedown', onMouseDown);
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
  window.removeEventListener('wheel', onWheel);
  canvasRef.value?.removeEventListener('click', onClick);
  planets.forEach((p) => { p.geometry.dispose(); (p.material as THREE.Material).dispose(); });
  starField?.geometry.dispose(); (starField?.material as THREE.Material)?.dispose();
  speedLines?.geometry.dispose(); (speedLines?.material as THREE.Material)?.dispose();
  sunGlow?.geometry.dispose(); (sunGlow?.material as THREE.Material)?.dispose();
  earthAtmosphere?.geometry.dispose(); (earthAtmosphere?.material as THREE.Material)?.dispose();
  particleTexture?.dispose();
  renderer.dispose();
});

function initScene() {
  const container = containerRef.value!;
  const width = container.clientWidth;
  const height = container.clientHeight;
  const isMobile = width < 768;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000308);
  scene.fog = new THREE.FogExp2(0x000308, 0.006);

  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
  updateCameraPosition();

  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value!, antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  createStarField(isMobile ? 2500 : 7000);
  createSpeedLines(isMobile ? 200 : 500);
  createSun();
  createPlanets(isMobile);
}

function createStarField(count: number) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = 120 + Math.random() * 600;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const t = Math.random();
    if (t < 0.6) { colors[i*3]=1; colors[i*3+1]=1; colors[i*3+2]=1; }
    else if (t < 0.8) { colors[i*3]=0.7; colors[i*3+1]=0.85; colors[i*3+2]=1; }
    else if (t < 0.95) { colors[i*3]=1; colors[i*3+1]=0.95; colors[i*3+2]=0.7; }
    else { colors[i*3]=1; colors[i*3+1]=0.6; colors[i*3+2]=0.4; }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 2, sizeAttenuation: true, vertexColors: true,
    map: particleTexture, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  starField = new THREE.Points(geo, mat);
  scene.add(starField);
}

function createSpeedLines(count: number) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 100;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
    positions[i * 3 + 2] = -Math.random() * 400;
    velocities[i] = 0.15 + Math.random() * 0.5; // 减慢速度
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  (geo as any).userData = { velocities };

  const mat = new THREE.PointsMaterial({
    color: 0x88bbff, size: 2.5, sizeAttenuation: true,
    map: particleTexture, transparent: true, depthWrite: false,
    opacity: 0.5, blending: THREE.AdditiveBlending,
  });
  speedLines = new THREE.Points(geo, mat);
  scene.add(speedLines);
}

function createSun() {
  // 太阳内核——先用程序化纹理立即创建，再异步加载真实纹理替换
  const sunTexture = createPlanetTexture('sun');
  const coreGeo = new THREE.SphereGeometry(2.5, 64, 64);
  const coreMat = new THREE.MeshBasicMaterial({ map: sunTexture, color: 0xFFDD44 });
  const sun = new THREE.Mesh(coreGeo, coreMat);
  sun.userData = { planetIndex: 0, baseScale: 1 };
  scene.add(sun);
  planets.push(sun);

  // 异步加载真实太阳纹理，成功则替换程序化纹理
  textureLoader.load(
    `${TEX_BASE}sun.jpg`,
    (realTex) => {
      realTex.colorSpace = THREE.SRGBColorSpace;
      coreMat.map = realTex;
      coreMat.needsUpdate = true;
      sunTexture.dispose();
    },
    undefined,
    () => { /* 加载失败，保持程序化纹理 */ }
  );

  // 多层光晕
  const glowGeo = new THREE.SphereGeometry(3.5, 32, 32);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xFFAA22, transparent: true, opacity: 0.3,
    side: THREE.BackSide, blending: THREE.AdditiveBlending,
  });
  sunGlow = new THREE.Mesh(glowGeo, glowMat);
  scene.add(sunGlow);

  const glow2Geo = new THREE.SphereGeometry(5.5, 32, 32);
  const glow2Mat = new THREE.MeshBasicMaterial({
    color: 0xFF8800, transparent: true, opacity: 0.1,
    side: THREE.BackSide, blending: THREE.AdditiveBlending,
  });
  const sunGlow2 = new THREE.Mesh(glow2Geo, glow2Mat);
  scene.add(sunGlow2);

  const sunLight = new THREE.PointLight(0xFFDD88, 8, 500, 1.0);
  scene.add(sunLight);
  // 环境光：增强到 2.5，让行星在环境光下纹理颜色可见
  scene.add(new THREE.AmbientLight(0xffffff, 2.5));
  // 半球光——让行星暗面也有微弱光照，不至于全黑
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.0));
}

function createPlanets(isMobile: boolean) {
  // 增大行星尺寸 + 调整轨道，确保地球清晰可见
  const planetData = [
    { radius: 5, size: 0.8, tex: 'mercury', speed: 0.008 },   // 水星
    { radius: 7, size: 1.2, tex: 'venus', speed: 0.006 },     // 金星
    { radius: 9.5, size: 1.4, tex: 'earth', speed: 0.0045 },  // 地球（增大）
    { radius: 12, size: 1.0, tex: 'mars', speed: 0.0035 },    // 火星
    { radius: 16, size: 2.4, tex: 'jupiter', speed: 0.0015 }, // 木星
    { radius: 20, size: 2.0, tex: 'saturn', speed: 0.001 },   // 土星
    { radius: 24, size: 1.5, tex: 'uranus', speed: 0.0006 },  // 天王星
    { radius: 27.5, size: 1.4, tex: 'neptune', speed: 0.0004 }, // 海王星
  ];

  planetGroup = new THREE.Group();
  const seg = isMobile ? 32 : 64;

  planetData.forEach((d, i) => {
    const proceduralTex = createPlanetTexture(d.tex);
    const geo = new THREE.SphereGeometry(d.size, seg, seg);
    const mat = new THREE.MeshStandardMaterial({
      map: proceduralTex,
      roughness: 0.85,
      metalness: 0.05,
      emissive: 0x222222,
      emissiveIntensity: 1.0,
      emissiveMap: proceduralTex,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = {
      planetIndex: i + 1,
      orbitRadius: d.radius,
      orbitSpeed: d.speed,
      orbitAngle: Math.random() * Math.PI * 2,
      baseScale: 1,
    };
    planetGroup.add(mesh);
    planets.push(mesh);

    // 异步加载真实行星纹理，成功则替换程序化纹理
    textureLoader.load(
      `${TEX_BASE}${d.tex}.jpg`,
      (realTex) => {
        realTex.colorSpace = THREE.SRGBColorSpace;
        mat.map = realTex;
        mat.emissiveMap = realTex;
        mat.needsUpdate = true;
        proceduralTex.dispose();
      },
      undefined,
      () => { /* 加载失败，保持程序化纹理 */ }
    );

    // 轨道线
    const orbitGeo = new THREE.RingGeometry(d.radius - 0.02, d.radius + 0.02, 128);
    const orbitMat = new THREE.MeshBasicMaterial({
      color: 0x7C3AED, opacity: 0.12, transparent: true, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const orbit = new THREE.Mesh(orbitGeo, orbitMat);
    orbit.rotation.x = Math.PI / 2;
    planetGroup.add(orbit);
  });

  // 地球大气层光晕——让地球更显眼
  const earth = planets[3]; // 地球是第4个行星（索引3）
  if (earth) {
    const atmGeo = new THREE.SphereGeometry(1.55, 32, 32);
    const atmMat = new THREE.MeshBasicMaterial({
      color: 0x4A90D9, transparent: true, opacity: 0.15,
      side: THREE.BackSide, blending: THREE.AdditiveBlending,
    });
    earthAtmosphere = new THREE.Mesh(atmGeo, atmMat);
    earth.add(earthAtmosphere);

    // 月球——绕地球公转
    const moonGeo = new THREE.SphereGeometry(0.35, 32, 32); // 月球半径0.35（地球1.4的1/4）
    const moonTex = createPlanetTexture('mercury'); // 复用水星纹理（灰色陨石坑）作为月球纹理
    const moonMat = new THREE.MeshStandardMaterial({
      map: moonTex,
      roughness: 0.9,
      metalness: 0.0,
      emissive: 0x222222,
      emissiveIntensity: 1.0,
      emissiveMap: moonTex,
    });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moon.userData = { isMoon: true, orbitAngle: 0, orbitSpeed: 0.02, orbitRadius: 2.5 };
    earth.add(moon);

    // 尝试加载真实月球纹理（复用 mercury 纹理作为月球——灰色多陨石坑）
    textureLoader.load(
      `${TEX_BASE}mercury.jpg`,
      (realTex) => {
        realTex.colorSpace = THREE.SRGBColorSpace;
        moonMat.map = realTex;
        moonMat.emissiveMap = realTex;
        moonMat.needsUpdate = true;
        moonTex.dispose();
      },
      undefined,
      () => { /* 加载失败，保持程序化纹理 */ }
    );
  }

  // 土星光环
  const saturn = planets[5];
  if (saturn) {
    const ringGeo = new THREE.RingGeometry(2.4, 3.8, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xF4E4BC, opacity: 0.6, transparent: true, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.2;
    saturn.add(ring);
  }

  scene.add(planetGroup);
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
}

function updateCameraPosition() {
  const r = cameraDistance;
  camera.position.x = r * Math.sin(cameraAngleY) * Math.cos(cameraAngleX);
  camera.position.y = r * Math.sin(cameraAngleX);
  camera.position.z = r * Math.cos(cameraAngleY) * Math.cos(cameraAngleX);
  camera.lookAt(0, 0, 0);
}

function animate() {
  animationId = requestAnimationFrame(animate);
  clock += 0.01; // 减慢整体时钟

  // 行星公转 + 自转（聚焦模式下全部停止——让用户安静观察星球，不头晕）
  planets.forEach((p, i) => {
    if (i === 0) {
      if (!isFocusing) p.rotation.y += 0.002; // 太阳自转：聚焦时也停
    } else {
      const data = p.userData;
      if (!isFocusing) {
        // 非聚焦：正常公转 + 自转
        data.orbitAngle += data.orbitSpeed;
        p.position.x = data.orbitRadius * Math.cos(data.orbitAngle);
        p.position.z = data.orbitRadius * Math.sin(data.orbitAngle);
        p.rotation.y += 0.008;
      }
      // 聚焦时：公转和自转都停，星球静止悬停
    }
  });

  // 月球绕地球公转（聚焦时也停）
  const earth = planets[3];
  if (earth && !isFocusing) {
    const moon = earth.children.find((c: any) => c.userData?.isMoon);
    if (moon) {
      const md = moon.userData;
      md.orbitAngle += md.orbitSpeed;
      moon.position.x = md.orbitRadius * Math.cos(md.orbitAngle);
      moon.position.z = md.orbitRadius * Math.sin(md.orbitAngle);
      moon.rotation.y += 0.01;
    }
  }

  // 太阳光晕脉动
  if (sunGlow) {
    const pulse = 1 + Math.sin(clock * 1.5) * 0.04;
    sunGlow.scale.setScalar(pulse);
    (sunGlow.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(clock * 2) * 0.04;
  }

  // 星空缓慢旋转
  if (starField) starField.rotation.y += 0.0002;

  // 穿梭粒子流（减慢）
  if (speedLines) {
    const positions = speedLines.geometry.attributes.position.array as Float32Array;
    const velocities = (speedLines.geometry as any).userData.velocities as Float32Array;
    const count = velocities.length;
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 2] += velocities[i];
      if (positions[i * 3 + 2] > cameraDistance + 30) {
        positions[i * 3] = (Math.random() - 0.5) * 100;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
        positions[i * 3 + 2] = -400;
      }
    }
    speedLines.geometry.attributes.position.needsUpdate = true;
  }

  // 相机逻辑：聚焦模式 vs 自由模式
  if (isFocusing && selectedPlanetIndex >= 0) {
    // 聚焦模式：用球面坐标计算相机位置（围绕选中星球）
    const planet = planets[selectedPlanetIndex];
    if (planet) {
      const pos = planet.position;
      // 目标相机位置
      const targetX = pos.x + focusDistance * Math.sin(focusAngleY) * Math.cos(focusAngleX);
      const targetY = pos.y + focusDistance * Math.sin(focusAngleX);
      const targetZ = pos.z + focusDistance * Math.cos(focusAngleY) * Math.cos(focusAngleX);
      
      if (focusLerp < 1) {
        // 平滑飞行过渡：从起始位置 lerp 到目标位置
        focusLerp = Math.min(1, focusLerp + 0.04); // 过渡速度
        const t = focusLerp * focusLerp * (3 - 2 * focusLerp); // smoothstep
        camera.position.x = focusStartPos.x + (targetX - focusStartPos.x) * t;
        camera.position.y = focusStartPos.y + (targetY - focusStartPos.y) * t;
        camera.position.z = focusStartPos.z + (targetZ - focusStartPos.z) * t;
      } else {
        camera.position.x = targetX;
        camera.position.y = targetY;
        camera.position.z = targetZ;
      }
      camera.lookAt(pos);
    }
  } else {
    // 自由模式：缓慢呼吸 + 微转（呼吸叠加在用户缩放距离之上，缩放不丢失）
    cameraDistance = baseDistance + Math.sin(clock * 0.08) * 3;
    cameraAngleY += 0.0003;
    updateCameraPosition();
  }

  renderer.render(scene, camera);
}

function setupInteraction() {
  const canvas = canvasRef.value!;
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('click', onClick);
}

function onMouseDown(e: MouseEvent) {
  isDragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragDistance = 0; // 重置拖拽距离
  // 用户开始拖拽时，如果飞行动画还在进行，立即结束飞行——让用户完全接管视角控制
  // 否则飞行动画会继续朝初始目标位置插值，造成"旋转后转回去"的错觉
  if (isFocusing && focusLerp < 1) {
    focusLerp = 1;
  }
}
function onMouseMove(e: MouseEvent) {
  if (!isDragging) return;
  const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY;
  dragDistance += Math.abs(dx) + Math.abs(dy); // 累计拖拽距离，用于区分点击和拖拽
  if (isFocusing) {
    // 聚焦模式：围绕选中星球旋转，灵敏度更高，流畅
    focusAngleY -= dx * 0.008;
    focusAngleX = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, focusAngleX + dy * 0.008));
  } else {
    // 自由模式：原有逻辑
    cameraAngleY -= dx * 0.005;
    cameraAngleX = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, cameraAngleX + dy * 0.005));
  }
  dragStartX = e.clientX; dragStartY = e.clientY;
}
function onMouseUp() { isDragging = false; }
function onWheel(e: WheelEvent) {
  // 检查鼠标是否在太阳系容器内，不在则不处理（让外层滚动正常工作）
  const container = containerRef.value;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  // 容器有有效尺寸时才做边界检查；容器尺寸为 0 时（CSS 未生效）直接处理
  if (rect.width > 0 && rect.height > 0) {
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
  }
  e.preventDefault();
  if (isFocusing) {
    // 聚焦模式：缩放与星球的距离，范围合理
    const r = getSelectedActualRadius();
    focusDistance = Math.max(r * 1.3, Math.min(r * 4, focusDistance + e.deltaY * 0.015));
  } else {
    // 自由模式：滚轮直接缩放整个太阳系（无需先点击星球）
    baseDistance = Math.max(8, Math.min(80, baseDistance + e.deltaY * 0.05));
  }
}

function onClick(e: MouseEvent) {
  if (isDragging) return;
  // 拖拽后松手会触发 click 事件——如果拖拽距离大于 5px，说明是拖拽不是点击，忽略
  // 否则拖拽旋转后松手会重新调用 selectPlanet，重置 focusAngleX/Y 导致视角"恢复原位"
  if (dragDistance > 5) return;
  const canvas = canvasRef.value!;
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(planets);
  if (intersects.length > 0) {
    const idx = intersects[0].object.userData.planetIndex;
    if (idx !== undefined && idx < PLANETS.length) selectPlanet(idx);
  }
}

// 获取选中星球的**放大后**实际半径（聚焦模式下星球放大3倍）
function getSelectedActualRadius(): number {
  if (selectedPlanetIndex < 0) return 1;
  if (selectedPlanetIndex === 0) return 2.5 * 3;
  return (planets[selectedPlanetIndex].geometry as any).parameters.radius * 3;
}

function selectPlanet(idx: number) {
  selectedPlanet.value = PLANETS[idx];
  selectedPlanetIndex = idx;
  panelCollapsed.value = false; // 每次选中星球时展开面板
  miniOrbPos.value = { right: 24, bottom: 24 }; // 小星球图标默认在右下角

  // 只显示选中的星球，隐藏其他——像地球仪一样单独展示
  planets.forEach((p, i) => {
    const mat = p.material as THREE.MeshStandardMaterial;
    if (i === idx) {
      p.visible = true;
      p.scale.setScalar(3.0); // 放大3倍，大而清晰
      if (mat.emissive) {
        mat.emissive.setHex(0x888888);
        mat.emissiveIntensity = 1.8; // 更亮，细节清晰
      }
    } else {
      p.visible = false;
    }
  });

  // 隐藏轨道线
  planetGroup.children.forEach((child) => {
    if (!planets.includes(child as THREE.Mesh)) {
      (child as THREE.Mesh).visible = false;
    }
  });

  // 相机聚焦到选中的星球——距离近一点，星球更大更震撼
  isFocusing = true;
  focusLerp = 0; // 启动平滑飞行动画
  focusStartPos.copy(camera.position); // 记录起始位置
  const actualRadius = idx === 0 ? 2.5 * 3 : (planets[idx].geometry as any).parameters.radius * 3;
  focusDistance = actualRadius * 1.8; // 1.8倍半径，星球充满视野
  focusAngleX = 0.25;
  focusAngleY = 0;
}

function closePlanet() {
  selectedPlanet.value = null;
  selectedPlanetIndex = -1;

  // 恢复所有星球显示 + 正常大小 + 正常自发光
  planets.forEach((p) => {
    p.visible = true;
    p.scale.setScalar(1);
    const mat = p.material as THREE.MeshStandardMaterial;
    if (mat.emissive) {
      mat.emissive.setHex(0x222222);
      mat.emissiveIntensity = 1.0;
    }
  });

  // 恢复所有轨道线显示
  planetGroup.children.forEach((child) => {
    (child as THREE.Mesh).visible = true;
  });

  isFocusing = false;
}

// 小星球图标：点击展开（拖动后不触发）
function onMiniOrbClick() {
  if (miniOrbDragMoved) { miniOrbDragMoved = false; return; }
  panelCollapsed.value = false;
}

// 小星球图标：拖动
function startDragMiniOrb(e: MouseEvent) {
  miniOrbDragging = true;
  miniOrbDragMoved = false;
  const startX = e.clientX;
  const startY = e.clientY;
  const startRight = miniOrbPos.value.right;
  const startBottom = miniOrbPos.value.bottom;
  function onMove(ev: MouseEvent) {
    if (!miniOrbDragging) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) miniOrbDragMoved = true;
    miniOrbPos.value = {
      right: Math.max(8, startRight - dx),
      bottom: Math.max(8, startBottom - dy),
    };
  }
  function onUp() {
    miniOrbDragging = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function goToPlanet(planet: PlanetInfo) { if (planet.route) router.push(planet.route); }

function onResize() {
  const container = containerRef.value;
  if (!container) return;
  const width = container.clientWidth, height = container.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
</script>

<style scoped>
.solar-system { position: absolute; inset: 0; overflow: hidden; }
.solar-canvas { width: 100%; height: 100%; display: block; cursor: grab; }
.solar-canvas:active { cursor: grabbing; }

/* 右侧滑入面板 */
.planet-panel {
  position: absolute; top: 50%; right: 24px; transform: translateY(-50%);
  width: 320px; padding: 24px; z-index: 10;
  background: rgba(10, 15, 30, 0.85); border: 1px solid rgba(255,255,255,0.12);
  backdrop-filter: blur(16px); color: #fff; max-height: 80vh; overflow-y: auto;
}
/* 折叠后的小星球图标 */
.planet-mini-orb {
  position: absolute; z-index: 10;
  width: 48px; height: 48px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; cursor: grab; user-select: none;
  box-shadow: 0 0 24px color-mix(in srgb, var(--color-primary) 50%, transparent), 0 4px 16px rgba(0,0,0,0.4);
  border: 2px solid rgba(255,255,255,0.2);
  transition: transform 0.2s ease;
  color: #fff;
}
.planet-mini-orb:hover { transform: scale(1.1); }
.planet-mini-orb:active { cursor: grabbing; }

.panel-close {
  position: absolute; top: 10px; right: 14px; border: none; background: transparent;
  font-size: 22px; cursor: pointer; color: rgba(255,255,255,0.5); line-height: 1; z-index: 2;
}
.panel-close:hover { color: #fff; }
.panel-header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; cursor: pointer; user-select: none; }

.panel-toggle {
  margin-left: auto; width: 22px; height: 22px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.7); cursor: pointer; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.panel-toggle:hover { background: color-mix(in srgb, var(--color-primary) 35%, transparent); color: #fff; }
.panel-body { overflow: hidden; }
.panel-icon {
  width: 52px; height: 52px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 26px;
  box-shadow: 0 0 20px color-mix(in srgb, var(--color-primary) 40%, transparent);
}
.panel-titles { min-width: 0; }
.panel-name { font-size: 18px; font-weight: 700; color: #fff; margin: 0; }
.panel-feature { font-size: 12px; color: var(--color-primary); font-weight: 600; }
.panel-desc { font-size: 13px; color: rgba(255,255,255,0.7); line-height: 1.7; margin-bottom: 14px; }
.panel-divider { height: 1px; background: rgba(255,255,255,0.1); margin: 14px 0; }
.panel-stats { margin-bottom: 16px; }
.stat-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.stat-label { color: rgba(255,255,255,0.5); }
.stat-value { color: rgba(255,255,255,0.85); font-weight: 500; text-align: right; }
.panel-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.panel-hint { font-size: 11px; color: rgba(255,255,255,0.35); text-align: center; }

.panel-slide-enter-active, .panel-slide-leave-active { transition: all 0.35s ease; }
.panel-slide-enter-from, .panel-slide-leave-to { opacity: 0; transform: translate(20px, -50%); }

/* 面板内容折叠动画 */
.panel-expand-enter-active, .panel-expand-leave-active { transition: all 0.3s ease; }
.panel-expand-enter-from, .panel-expand-leave-to { opacity: 0; max-height: 0; }
.panel-expand-enter-to, .panel-expand-leave-from { opacity: 1; max-height: 600px; }

@media (max-width: 767px) {
  .planet-panel { right: 8px; left: 8px; width: auto; padding: 18px; max-height: 70vh; }
}
</style>
