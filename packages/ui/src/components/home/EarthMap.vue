<template>
  <div class="earth-map">
    <div class="map-toolbar glass-card">
      <el-input v-model="searchQuery" placeholder="搜索国家名（如 中国、Japan）" size="small" clearable class="map-search" @keyup.enter="doSearch">
        <template #append>
          <el-button @click="doSearch" :icon="Search" />
        </template>
      </el-input>
      <el-button size="small" @click="$emit('back')">
        <el-icon><ArrowLeft /></el-icon> 返回太阳系
      </el-button>
    </div>

    <div ref="mapContainerRef" class="map-container"></div>

    <!-- 大洲描述面板（左侧） -->
    <transition name="panel-slide">
      <div v-if="selectedContinent" class="continent-panel glass-card">
        <button class="panel-close" @click="selectedContinent = null">×</button>
        <div class="continent-header">
          <span class="continent-emoji-lg">{{ selectedContinent.emoji }}</span>
          <div>
            <h3 class="continent-title">{{ selectedContinent.name }}</h3>
            <span class="continent-en">{{ selectedContinent.enName }}</span>
          </div>
        </div>
        <div class="continent-info-list">
          <div class="info-row"><span class="info-label">面积</span><span class="info-value">{{ selectedContinent.area }}</span></div>
          <div class="info-row"><span class="info-label">人口</span><span class="info-value">{{ selectedContinent.population }}</span></div>
          <div class="info-row"><span class="info-label">国家数</span><span class="info-value">{{ selectedContinent.countries }}</span></div>
        </div>
        <p class="continent-desc">{{ selectedContinent.description }}</p>
      </div>
    </transition>

    <!-- 国家详情面板（右侧） -->
    <transition name="panel-slide">
      <div v-if="selectedCountry" class="country-panel glass-card">
        <button class="panel-close" @click="selectedCountry = null">×</button>
        <h3 class="country-name">{{ selectedCountry.name }} <span class="country-en">{{ selectedCountry.enName }}</span></h3>
        <div class="country-flag">{{ getFlagEmoji(selectedCountry.code) }}</div>
        <div class="country-info-list">
          <div class="info-row"><span class="info-label">首都</span><span class="info-value">{{ selectedCountry.capital }}</span></div>
          <div class="info-row"><span class="info-label">人口</span><span class="info-value">{{ selectedCountry.population }}</span></div>
          <div class="info-row"><span class="info-label">面积</span><span class="info-value">{{ selectedCountry.area }}</span></div>
          <div class="info-row"><span class="info-label">语言</span><span class="info-value">{{ selectedCountry.language }}</span></div>
          <div class="info-row"><span class="info-label">货币</span><span class="info-value">{{ selectedCountry.currency }}</span></div>
          <div class="info-row"><span class="info-label">大洲</span><span class="info-value">{{ selectedCountry.continent }}</span></div>
        </div>
        <p class="country-desc">{{ selectedCountry.description }}</p>
      </div>
    </transition>

    <!-- 加载提示 -->
    <div v-if="loadingGeo" class="map-loading glass-card">
      <el-icon class="is-loading" :size="20"><Loading /></el-icon>
      <span>正在加载国家边界数据...</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, ArrowLeft, Loading } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { findCountry, findCountryByGeoId, type CountryInfo } from './country-data';

defineEmits<{ back: [] }>();

/** 大洲信息 */
interface ContinentInfo {
  name: string;        // 中文名
  enName: string;      // 英文名
  center: [number, number]; // 中心坐标 [纬度, 经度]
  area: string;        // 面积
  population: string;  // 人口
  countries: number;   // 国家数量
  description: string; // 简介
  emoji: string;       // emoji 图标
}

/** 七大洲数据 */
const CONTINENTS: ContinentInfo[] = [
  { name: '亚洲', enName: 'Asia', center: [40, 100], area: '4458万km²', population: '46.4亿', countries: 48, emoji: '🌏', description: '世界最大洲，面积和人口均居首位。涵盖东亚、东南亚、南亚、西亚、中亚等地区，拥有中国、印度、日本等大国，是世界文明发源地之一。' },
  { name: '非洲', enName: 'Africa', center: [0, 20], area: '3037万km²', population: '14.0亿', countries: 54, emoji: '🌍', description: '世界第二大洲，被誉为"人类摇篮"。拥有撒哈拉沙漠、尼罗河、刚果雨林等多样地貌，矿产资源丰富。' },
  { name: '北美洲', enName: 'North America', center: [45, -100], area: '2471万km²', population: '5.9亿', countries: 23, emoji: '🌎', description: '世界第三大洲，包含美国、加拿大、墨西哥等国。拥有落基山脉、五大湖、大峡谷等自然奇观。' },
  { name: '南美洲', enName: 'South America', center: [-15, -60], area: '1784万km²', population: '4.3亿', countries: 12, emoji: '🌎', description: '拥有亚马逊雨林——地球之肺，安第斯山脉——世界最长山脉。巴西、阿根廷、智利等国在此洲。' },
  { name: '南极洲', enName: 'Antarctica', center: [-80, 0], area: '1420万km²', population: '约1000(科考站)', countries: 0, emoji: '🧊', description: '地球最南端的大陆，98%被冰雪覆盖，无永久居民。设有各国科学考察站，是地球最后的净土。' },
  { name: '欧洲', enName: 'Europe', center: [54, 15], area: '1018万km²', population: '7.5亿', countries: 44, emoji: '🌍', description: '世界第六大洲，历史文化底蕴深厚。拥有欧盟这一世界最大经济体之一，是文艺复兴、工业革命发源地。' },
  { name: '大洋洲', enName: 'Oceania', center: [-25, 135], area: '852万km²', population: '0.45亿', countries: 14, emoji: '🌏', description: '世界最小洲，主要由澳大利亚大陆和太平洋岛屿组成。拥有大堡礁、乌鲁鲁巨石等自然奇观。' },
];

const mapContainerRef = ref<HTMLDivElement>();
const searchQuery = ref('');
const selectedCountry = ref<CountryInfo | null>(null);
const selectedContinent = ref<ContinentInfo | null>(null);
const loadingGeo = ref(true);

let map: L.Map;
let geoJsonLayer: L.GeoJSON;
const countryLayers = new Map<string, L.Layer>();

onMounted(() => {
  initMap();
  addContinentMarkers();
  loadGeoJson();
});

onBeforeUnmount(() => {
  if (map) map.remove();
});

function initMap() {
  map = L.map(mapContainerRef.value!, {
    center: [20, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 8,
    worldCopyJump: true,
    zoomControl: false,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);
}

/** 在地图上添加七大洲标记（地球仪风格标签） */
function addContinentMarkers() {
  CONTINENTS.forEach((continent) => {
    const icon = L.divIcon({
      className: 'continent-marker',
      html: `<div class="continent-label" data-name="${continent.name}">
        <span class="continent-emoji">${continent.emoji}</span>
        <span class="continent-name">${continent.name}</span>
      </div>`,
      iconSize: [80, 36],
      iconAnchor: [40, 18],
    });
    const marker = L.marker(continent.center, { icon }).addTo(map);
    marker.on('click', () => {
      selectedContinent.value = continent;
      // 飞到大洲区域（zoom 3）
      map.flyTo(continent.center, 3, { duration: 1.0 });
    });
  });
}

const GEOJSON_CACHE_KEY = 'cache:countries-geojson';
const GEOJSON_REMOTE_URL = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';

/** 渲染 GeoJSON 数据到地图上 */
function renderGeoJson(data: any) {
  geoJsonLayer = L.geoJSON(data, {
    style: {
      color: 'rgba(194, 65, 12, 0.4)',
      weight: 1,
      fillColor: 'rgba(194, 65, 12, 0.05)',
      fillOpacity: 0.3,
    },
    onEachFeature: (feature, layer) => {
      const countryCode = feature.id as string;
      countryLayers.set(countryCode, layer);

      const countryName = getCountryNameByCode(countryCode);
      if (countryName) {
        layer.bindTooltip(countryName, { sticky: true, className: 'country-tooltip' });
      }

      layer.on('mouseover', (e: any) => {
        e.target.setStyle({
          color: 'rgba(194, 65, 12, 1)',
          weight: 2,
          fillColor: 'rgba(194, 65, 12, 0.3)',
          fillOpacity: 0.5,
        });
      });

      layer.on('mouseout', (e: any) => {
        if (selectedCountry.value?.code3 !== countryCode) {
          e.target.setStyle({
            color: 'rgba(194, 65, 12, 0.4)',
            weight: 1,
            fillColor: 'rgba(194, 65, 12, 0.05)',
            fillOpacity: 0.3,
          });
        }
      });

      layer.on('click', () => {
        selectCountryByCode(countryCode);
        const bounds = (layer as any).getBounds?.();
        if (bounds) (map as any).flyToBounds(bounds, { padding: [50, 50] });
      });
    },
  }).addTo(map);
}

/** 加载国家边界 GeoJSON —— 三级缓存策略：localStorage → 本地静态文件 → 在线获取 */
async function loadGeoJson() {
  try {
    let data: any = null;

    // 1. 优先从 localStorage 读取缓存（最快）—— 但验证数据完整性
    try {
      const cached = localStorage.getItem(GEOJSON_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        // 验证缓存数据完整性（至少 150 个国家）
        if (parsed?.features?.length >= 150) {
          data = parsed;
        }
      }
    } catch {}

    // 2. 没有缓存或缓存不完整，从本地静态文件加载
    if (!data) {
      try {
        const localRes = await fetch((import.meta.env.BASE_URL || '/') + 'countries.geo.json');
        if (localRes.ok) {
          const localData = await localRes.json();
          if (localData?.features?.length >= 150) {
            data = localData;
            // 缓存到 localStorage
            try { localStorage.setItem(GEOJSON_CACHE_KEY, JSON.stringify(data)); } catch {}
          }
        }
      } catch {}
    }

    // 3. 如果有数据了，先渲染（不阻塞），然后异步从在线获取最新版本更新缓存
    if (data) {
      renderGeoJson(data);
      loadingGeo.value = false;
      // 异步检查更新（不阻塞渲染）
      refreshGeoJsonCache();
      return;
    }

    // 4. 本地都没有，直接从在线获取
    const res = await fetch(GEOJSON_REMOTE_URL);
    if (!res.ok) throw new Error('加载失败');
    data = await res.json();
    renderGeoJson(data);
    // 缓存到 localStorage
    try { localStorage.setItem(GEOJSON_CACHE_KEY, JSON.stringify(data)); } catch {}
  } catch {
    ElMessage.warning('国家边界数据加载失败，仅显示地图');
  } finally {
    loadingGeo.value = false;
  }
}

/** 异步从在线获取最新 GeoJSON 并更新 localStorage 缓存 + 重新渲染 */
async function refreshGeoJsonCache() {
  try {
    const res = await fetch(GEOJSON_REMOTE_URL);
    if (!res.ok) return;
    const latest = await res.json();
    if (latest?.features?.length >= 150) {
      try { localStorage.setItem(GEOJSON_CACHE_KEY, JSON.stringify(latest)); } catch {}
      // 如果当前渲染的数据不完整，重新渲染
      if (geoJsonLayer && countryLayers.size < 150) {
        map.removeLayer(geoJsonLayer);
        countryLayers.clear();
        renderGeoJson(latest);
      }
    }
  } catch {
    // 静默失败，不影响已有地图
  }
}

function getCountryNameByCode(code: string): string | undefined {
  // GeoJSON feature.id 是 alpha-3 代码（如 CHN、USA），用 findCountryByGeoId 匹配
  const c = findCountryByGeoId(code);
  return c?.name;
}

function selectCountryByCode(code: string) {
  // GeoJSON feature.id 是 alpha-3 代码，用 findCountryByGeoId 匹配
  const country = findCountryByGeoId(code);
  if (country) {
    selectedCountry.value = country;
  } else {
    ElMessage.info('该国家信息暂未收录');
  }
}

function doSearch() {
  const q = searchQuery.value.trim();
  if (!q) return;
  const country = findCountry(q);
  if (country) {
    selectedCountry.value = country;
    // 在地图上高亮并聚焦
    // countryLayers 以 GeoJSON feature.id（alpha-3）为键
    const layer = countryLayers.get(country.code3);
    if (layer) {
      (layer as any).setStyle({
        color: 'rgba(236, 72, 153, 1)',
        weight: 3,
        fillColor: 'rgba(236, 72, 153, 0.4)',
        fillOpacity: 0.6,
      });
      const bounds = (layer as any).getBounds?.();
      if (bounds) (map as any).flyToBounds(bounds, { padding: [50, 50] });
    } else {
      ElMessage.info(`已找到 ${country.name}，但地图边界数据中无该国家`);
    }
  } else {
    ElMessage.warning('未找到该国家，试试英文或中文全名');
  }
}

function getFlagEmoji(code: string): string {
  const codePoints = code.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
  return String.fromCodePoint(...codePoints);
}
</script>

<style scoped>
.earth-map { position: absolute; inset: 0; z-index: 100; background: #000; }

.map-toolbar {
  position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 8px; padding: 8px 12px; z-index: 1000; align-items: center;
}
.map-search { width: 220px; }

.map-container { width: 100%; height: 100%; }

.country-panel {
  position: absolute; top: 70px; right: 16px; width: 300px; padding: 20px;
  z-index: 1000; max-height: calc(100% - 100px); overflow-y: auto;
}

/* 大洲描述面板（左侧） */
.continent-panel {
  position: absolute; top: 70px; left: 16px; width: 300px; padding: 20px;
  z-index: 1000; max-height: calc(100% - 100px); overflow-y: auto;
}
.continent-header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.continent-emoji-lg { font-size: 36px; }
.continent-title { font-size: 18px; font-weight: 700; margin: 0; }
.continent-en { font-size: 13px; color: var(--color-text-secondary); }
.continent-info-list { margin: 12px 0; }
.continent-desc { font-size: 13px; color: var(--color-text-secondary); line-height: 1.7; margin-top: 10px; }
.panel-close {
  position: absolute; top: 8px; right: 12px; border: none; background: transparent;
  font-size: 20px; cursor: pointer; color: var(--color-text-secondary); line-height: 1;
}
.panel-close:hover { color: var(--color-text); }
.country-name { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
.country-en { font-size: 13px; color: var(--color-text-secondary); font-weight: 400; }
.country-flag { font-size: 40px; margin: 8px 0; }
.country-info-list { margin: 12px 0; }
.info-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--glass-border); font-size: 13px; }
.info-label { color: var(--color-text-secondary); }
.info-value { font-weight: 500; }
.country-desc { font-size: 13px; color: var(--color-text-secondary); line-height: 1.6; margin-top: 10px; }

.map-loading {
  position: absolute; bottom: 60px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px; padding: 8px 16px; z-index: 1000;
  font-size: 13px; color: var(--color-text-secondary);
}

.panel-slide-enter-active, .panel-slide-leave-active { transition: all 0.3s ease; }
.panel-slide-enter-from, .panel-slide-leave-to { opacity: 0; transform: translateX(20px); }

@media (max-width: 767px) {
  .map-toolbar { flex-direction: column; width: calc(100% - 32px); }
  .map-search { width: 100%; }
  .country-panel { right: 8px; left: 8px; width: auto; top: 120px; }
  .continent-panel { right: 8px; left: 8px; width: auto; top: 120px; }
}
</style>

<style>
/* Leaflet tooltip 全局样式 */
.country-tooltip {
  background: var(--glass-bg) !important;
  border: 1px solid var(--glass-border) !important;
  border-radius: 6px !important;
  padding: 4px 10px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  color: var(--color-primary) !important;
  box-shadow: var(--shadow-md) !important;
}

/* 大洲标记（Leaflet divIcon 需要全局非 scoped 样式） */
.continent-marker { background: transparent !important; border: none !important; }
.continent-label {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  cursor: pointer; user-select: none;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
  transition: transform 0.2s;
}
.continent-label:hover { transform: scale(1.15); }
.continent-emoji { font-size: 20px; }
.continent-name {
  font-size: 11px; font-weight: 700; color: #fff;
  background: color-mix(in srgb, var(--color-primary) 75%, transparent); padding: 1px 8px; border-radius: 8px;
  white-space: nowrap;
}
</style>