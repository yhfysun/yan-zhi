<template>
  <!-- 四段式页面骨架示范接入（Task 11.2）：桌面端 / 抽屉·弹窗内嵌（embedded/pane）时
       show-header=false，组件退化为纯内容壳，布局与旧 .page 一致；
       仅 /settings 路由页在移动外壳下渲染骨架头（返回 + 标题 + 主题切换）。 -->
  <MobilePageShell :title="shellTitle" back :show-header="pageShell" :back-handler="mobileBackHandler">
    <template #actions>
      <button v-if="pageShell" class="mobile-icon-btn" type="button" aria-label="切换主题" @click="toggleThemeQuick">
        <el-icon :size="17"><component :is="settingsStore.settings.darkMode ? Sunny : Moon" /></el-icon>
      </button>
    </template>
    <!-- 移动外壳首层：分组入口列表（四段式「首层分组 → 二级子页」，Task 10.5）。
         桌面 / Web / 弹窗内嵌（pageShell=false）走 v-else 分支，行为与旧版完全一致。 -->
    <template v-if="pageShell && !mobileGroup">
      <h2 class="page-title">设置</h2>
      <div class="settings-group-list">
        <button
          v-for="g in mobileGroups"
          :key="g.key"
          type="button"
          class="settings-group-row"
          @click="enterMobileGroup(g)"
        >
          <span class="settings-group-icon"><el-icon :size="17"><component :is="g.icon" /></el-icon></span>
          <span class="settings-group-main">
            <span class="settings-group-name">{{ g.label }}</span>
            <span class="settings-group-desc">{{ g.desc }}</span>
          </span>
          <el-icon class="settings-group-arrow" :size="14"><ArrowRight /></el-icon>
        </button>
      </div>
    </template>
    <template v-else>
      <h2 v-if="!(pageShell && mobileGroup)" class="page-title">设置</h2>
      <!-- 二级子页内的页内子分段（仅多 tab 分组显示）：pane 直取机制与 SettingsDialog 同一通道 -->
      <div v-if="pageShell && mobileGroup && mobileGroup.tabs.length > 1" class="mobile-sub-tabs">
        <button
          v-for="t in mobileGroup.tabs"
          :key="t.name"
          type="button"
          class="mobile-sub-tab"
          :class="{ active: tab === t.name }"
          @click="tab = t.name"
        >{{ t.label }}</button>
      </div>
      <el-tabs v-model="tab" class="glass-tabs" :class="{ 'is-pane': isPaneMode || (pageShell && !!mobileGroup) }">
      <el-tab-pane label="通用" name="general" lazy>
        <div class="settings-form">
          <SettingRow label="深色模式" tip="切换深色/浅色主题" tip-after>
            <el-switch v-model="darkMode" @change="toggleDarkMode" />
          </SettingRow>
          <SettingRow label="主题色">
            <div class="theme-grid">
              <div
                v-for="t in themes"
                :key="t.value"
                :class="['theme-chip', { active: settingsStore.settings.palette === t.value }]"
                :style="{ '--chip-color': t.color }"
                @click="setPalette(t.value)"
              >
                <div class="theme-dot"></div>
                <span>{{ t.label }}</span>
              </div>
            </div>
          </SettingRow>
          <SettingRow label="布局" tip="插件可贡献自定义布局" tip-after>
            <el-select
              :model-value="settingsStore.settings.layout"
              placeholder="选择布局"
              style="width: 280px"
              @change="setLayout"
            >
              <el-option label="默认布局" value="default" />
              <el-option
                v-for="l in pluginStore.layouts"
                :key="l.id"
                :label="l.name"
                :value="l.id"
              />
            </el-select>
          </SettingRow>
          <SettingRow label="默认平台">
            <el-select v-model="defaultPlatformId" placeholder="选择默认平台" style="width: 280px" clearable @change="onPlatformChange">
              <el-option v-for="p in platformStore.platforms" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
          </SettingRow>
          <SettingRow label="默认模型">
            <el-select v-model="defaultModelId" placeholder="选择默认模型" style="width: 280px" clearable :disabled="!defaultPlatformId">
              <el-option v-for="m in availableDefaultModels" :key="m.id" :label="m.alias || m.modelId" :value="m.id" />
            </el-select>
          </SettingRow>
          <SettingRow
            label="记忆抽取模型"
            tip="留空则自动跟随全局默认模型（如 agnes 3.0 Flash，支持视觉），不可用时才回退本地小模型"
            tip-after
          >
            <div style="display:flex;gap:8px;align-items:center">
              <el-select v-model="memoryExtractPlatformId" placeholder="抽取模型平台" style="width:140px" clearable @change="onMemoryExtractPlatformChange">
                <el-option v-for="p in platformStore.platforms" :key="p.id" :label="p.name" :value="p.id" />
              </el-select>
              <el-select v-model="memoryExtractModelId" placeholder="抽取模型" style="width:140px" clearable :disabled="!memoryExtractPlatformId">
                <el-option v-for="m in availableMemoryExtractModels" :key="m.id" :label="m.alias || m.modelId" :value="m.id" />
              </el-select>
            </div>
          </SettingRow>
          <SettingRow label="启用上下文压缩" tip="超长任务时自动摘要压缩" tip-after>
            <el-switch v-model="enableCompression" />
          </SettingRow>
          <SettingRow label="上下文保留条数" tip="触发压缩时保留的最近消息条数" tip-after>
            <el-input-number v-model="keepRecent" :min="2" :max="50" />
          </SettingRow>
          <!-- 压缩触发阈值已移除：是否压缩由所选模型的上下文窗口配置自动决定 -->
          <!-- 桌面端专属：截图全局快捷键（web / 移动端无本地截图能力，自动隐藏） -->
          <SettingRow v-if="canScreenshot" label="截图快捷键">
            <el-input
              :model-value="shotAccelDisplay"
              readonly
              placeholder="点此框后按下组合键"
              style="width: 210px"
              @keydown.capture.prevent="onShotAccelKeyDown"
            />
            <div style="display: inline-flex; gap: 8px">
              <el-button size="small" @click="resetShotAccel">恢复默认</el-button>
              <el-button size="small" :disabled="!shotAccel" @click="clearShotAccel">禁用</el-button>
            </div>
          </SettingRow>
          <!-- 桌面端专属：截图时是否隐藏本应用窗口（想截自己界面时关掉） -->
          <SettingRow v-if="canScreenshot" label="截图隐藏本应用">
            <el-switch v-model="screenshotHideApp" />
          </SettingRow>
          <!-- 移动端专属：远程后端地址（连自建节点；不配则走 APK 内嵌本地后端） -->
          <SettingRow
            v-if="isCapacitor"
            label="后端服务地址"
            :tip="`当前生效：${API_BASE}。保存后自动重载一次；重载前已建立的流式连接需重开会话。`"
            tip-after
          >
            <el-input
              v-model="mobileApiBaseInput"
              placeholder="https://your-node.example.com（留空用内嵌本地后端）"
              clearable
            />
            <div style="display: inline-flex; gap: 8px; margin-top: 8px">
              <el-button size="small" type="primary" @click="saveMobileApiBase">保存并重载</el-button>
              <el-button size="small" :disabled="!getMobileApiBase()" @click="clearMobileApiBase">恢复内嵌后端</el-button>
            </div>
          </SettingRow>
        </div>
      </el-tab-pane>
      <el-tab-pane label="皮肤" name="skin" lazy>
        <div class="skin-page">
          <div class="skin-page-tip">主题色与皮肤独立选择 —— 主题色决定按钮/链接/强调色，皮肤决定壁纸/玻璃/边框风格。可只选主题色（纯调色板），也可主题色 + 皮肤任意组合。</div>

          <div class="skin-section">
            <div class="skin-section-label">主题色</div>
            <div class="theme-grid">
              <div
                v-for="t in themes"
                :key="t.value"
                :class="['theme-chip', { active: settingsStore.settings.palette === t.value }]"
                :style="{ '--chip-color': t.color }"
                @click="setPalette(t.value)"
              >
                <div class="theme-dot"></div>
                <span>{{ t.label }}</span>
              </div>
            </div>
          </div>

          <div class="skin-section">
            <div class="skin-section-label">内置系列皮肤 <span class="skin-section-hint">（成套换肤：壁纸 + 菜单 + 代码模式 + 浏览器外壳 + 弹窗/输入框/按钮/列表纹理，选中后自动搭配同色主题）</span></div>
            <div class="skin-grid">
              <div
                v-for="bs in builtinSeries"
                :key="bs.id"
                :class="['skin-card', { active: settingsStore.settings.skin === bs.id }]"
                @click="setBuiltinSeries(bs)"
              >
                <img class="skin-thumb" :src="bs.preview" :alt="bs.name" loading="lazy" />
                <div class="skin-card-body">
                  <span class="skin-name">{{ bs.name }}</span>
                  <span class="skin-src builtin-tag">内置</span>
                </div>
                <div v-if="settingsStore.settings.skin === bs.id" class="skin-active-badge">使用中</div>
              </div>
            </div>
          </div>

          <div class="skin-section">
            <div class="skin-section-label">皮肤 <span class="skin-section-hint">（插件皮肤包；不选则纯调色板模式）</span></div>
            <div class="skin-grid">
              <div
                :class="['skin-card', 'skin-card-none', { active: !settingsStore.settings.skin }]"
                @click="setSkin('')"
              >
                <div class="skin-thumb-none"><span>纯调色板</span></div>
                <div class="skin-card-body"><span class="skin-name">无皮肤</span></div>
                <div v-if="!settingsStore.settings.skin" class="skin-active-badge">使用中</div>
              </div>
            </div>
            <div v-for="cat in skinCategories" :key="cat" class="skin-cat">
              <div class="skin-cat-label">{{ cat }}</div>
              <div class="skin-grid">
                <div
                  v-for="s in skinsByCategory(cat)"
                  :key="s.id"
                  :class="['skin-card', { active: settingsStore.settings.skin === s.id }]"
                  @click="setSkin(s.id)"
                >
                  <img class="skin-thumb" :src="skinPreviewUrl(s)" :alt="s.name" loading="lazy" />
                  <div class="skin-card-body">
                    <span class="skin-name">{{ s.name }}</span>
                    <span
                      class="skin-src"
                      title="下载源码包（壁纸 + manifest + 自定义说明），二改后打成 .yzp 可作为自定义皮肤安装"
                      @click.stop="downloadSkinSource(s)"
                    >源码包</span>
                  </div>
                  <div v-if="settingsStore.settings.skin === s.id" class="skin-active-badge">使用中</div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="!allSkins.length" class="skin-empty">
            更多皮肤以插件形式提供，可在「插件管理」安装 .yzp 皮肤包（上方内置系列开箱即用）
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane label="数据" name="data" lazy>
        <div class="data-section">
          <el-button @click="exportData" :icon="Download">导出全部数据</el-button>
          <el-button @click="triggerImport" :icon="Upload">导入备份数据</el-button>
          <input ref="fileInput" type="file" accept=".json" style="display:none" @change="importData" />
          <el-button type="danger" @click="clearCache" :icon="Delete">清空缓存</el-button>
        </div>
      </el-tab-pane>
      <el-tab-pane label="工具钩子" name="userhooks" lazy>
        <UserHooksPanel />
      </el-tab-pane>
      <!-- pane 模式（SettingsDialog 左导航直取分区）下，embedded 不再隐藏这三页：
           弹窗分类「记忆管理 / 商城服务端 / 局域网」要靠它们渲染（Task 10.3） -->
      <el-tab-pane v-if="!embedded || isPaneMode" label="记忆管理" name="memory" lazy>
        <MemoryManage />
      </el-tab-pane>
      <el-tab-pane v-if="!embedded || isPaneMode" label="商城服务端" name="marketplace" lazy>
        <div class="settings-form">
          <SettingRow label="启用商城服务端" tip="开启后其他言智节点可连接本节点获取工具/Skill/智能体" tip-after>
            <el-switch v-model="mpEnabled" @change="onMpToggle" />
          </SettingRow>
          <SettingRow label="连接地址">
            <div class="connect-url-box">
              <code>{{ connectUrl }}</code>
              <el-button size="small" text @click="copyUrl">复制</el-button>
            </div>
          </SettingRow>
          <SettingRow label="认证方式">
            <el-select v-model="mpAuthType" style="width: 200px" @change="onMpAuthChange">
              <el-option label="无认证" value="none" />
              <el-option label="Bearer Token" value="bearer" />
              <el-option label="API Key" value="api-key" />
            </el-select>
          </SettingRow>
          <SettingRow v-if="mpAuthType !== 'none'" label="凭证">
            <el-input v-model="mpAuthValue" :placeholder="mpAuthType === 'bearer' ? '输入 Token' : '输入 API Key'" style="width: 280px" @blur="onMpAuthChange" />
          </SettingRow>
          <SettingRow label="端口" tip="默认 3001" tip-after>
            <el-input-number v-model="mpPort" :min="1024" :max="65535" style="width: 180px" @change="onMpPortChange" />
          </SettingRow>
        </div>
      </el-tab-pane>
      <el-tab-pane v-if="!embedded || isPaneMode" label="局域网访问" name="lan" lazy>
        <div class="lan-section">
          <p class="lan-tip">局域网内其他设备（手机 / 电脑）可用浏览器访问本节点的 Web 界面，数据与本机共享同一后端。</p>
          <div v-if="lanIps.length === 0 && !lanLoading" class="lan-empty">未检测到局域网 IP（可能未连接网络）</div>
          <div v-else class="lan-list">
            <div v-for="ip in lanIps" :key="ip.address" class="lan-item">
              <div class="lan-url-box">
                <code>{{ 'http://' + ip.address + ':' + lanPort }}</code>
                <span class="lan-iface">{{ ip.name }}</span>
              </div>
              <div class="lan-actions">
                <el-button size="small" @click="copyLanUrl(ip.address)">复制</el-button>
                <el-button size="small" type="primary" @click="openLan(ip.address)">打开浏览器</el-button>
              </div>
            </div>
          </div>
        </div>
        <!-- 节点发现：扫描同网段其他言智节点。移动端一键设为后端（经本端后端扫描，避开 WebView 混合内容拦截） -->
        <div class="lan-section" style="margin-top: 16px">
          <div style="display: flex; align-items: center; justify-content: space-between">
            <p class="lan-tip" style="margin: 0">扫描同网段（/24）内、端口 {{ lanPort }} 上的其他言智节点。移动端可一键设为后端；桌面 / Web 可复制地址用于商城源或节点互聊。</p>
            <el-button size="small" :loading="nodeScanning" style="margin-left: 12px; flex-shrink: 0" @click="scanLanNodes">扫描节点</el-button>
          </div>
          <div v-if="lanNodes.length > 0" class="lan-list">
            <div v-for="n in lanNodes" :key="n.ip + ':' + n.port" class="lan-item">
              <div class="lan-url-box">
                <code>{{ 'http://' + n.ip + ':' + n.port }}</code>
                <span class="lan-iface">{{ n.isSelf ? '本机' : '言智节点' }}</span>
              </div>
              <div class="lan-actions">
                <el-button v-if="isCapacitor" size="small" type="primary" @click="useNodeAsBackend(n)">设为后端</el-button>
                <el-button size="small" @click="copyNodeUrl(n)">复制</el-button>
              </div>
            </div>
          </div>
          <div v-else-if="!nodeScanning && nodeScanDone" class="lan-empty">
            未发现其他言智节点（确认对方已启动、与本机同网段且端口为 {{ lanPort }}）
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane label="语音包" name="voicepack" lazy>
        <VoicePackPanel />
      </el-tab-pane>
      <el-tab-pane label="日志" name="logs" lazy>
        <div class="logs-tab-embed">
          <LlmLogs />
        </div>
      </el-tab-pane>
      <el-tab-pane label="关于" name="about" lazy>
        <div class="about-section">
          <h3>言智 (Yan-Zhi)</h3>
          <p>版本：v0.1.0 (MVP)</p>
          <p>语言可控的跨端日常办公助手 · 桌面 / Web / 移动三端统一</p>
          <p class="about-tip">开发者：yhfysun</p>
          <p class="about-tip">源码：<a class="about-link" href="https://github.com/yhfysun/yan-zhi" target="_blank" rel="noopener">https://github.com/yhfysun/yan-zhi</a></p>
          <p class="about-tip">开源协议：Apache-2.0</p>
        </div>
      </el-tab-pane>
      </el-tabs>
    </template>
  </MobilePageShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, type Component } from 'vue';
const props = withDefaults(defineProps<{ embedded?: boolean; pane?: string }>(), { embedded: false, pane: '' });
const embedded = computed(() => props.embedded);
/**
 * pane 模式（Task 10.3）：SettingsDialog 左侧分类导航直取单个分区时传入，
 * 本组件隐藏自身 el-tabs 头、只渲染对应 pane（el-tab-pane lazy 保证未访问分区不挂载）。
 * /settings 路由页与 SettingsDrawer 的 embedded 用法不受影响（pane 为空）。
 */
const isPaneMode = computed(() => !!props.pane);
import { Download, Delete, Upload, Sunny, Moon, ArrowRight, Setting, Brush, DataLine, MagicStick, Link, InfoFilled } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useSettingsStore, usePlatformStore } from '../stores';
import { usePluginStore } from '../stores/plugin';
import { useToolsStore } from '../stores/tools';
import MobilePageShell from '../components/common/MobilePageShell.vue';
import SettingRow from '../components/common/SettingRow.vue';
import { useMobileShell } from '../composables/useMobileShell';

/** 四段式骨架头仅在「移动外壳 + /settings 独立路由页」渲染：
 *  抽屉内嵌（embedded）与设置弹窗 pane 用法保持原布局，桌面端完全不变 */
const isMobileShellSettings = useMobileShell();
const pageShell = computed(() => isMobileShellSettings.value && !props.embedded && !props.pane);
/** 骨架头上的主题快捷切换（顶栏被骨架页替代后的补位入口），并同步本地开关 ref 防 UI 漂移 */
function toggleThemeQuick() {
  const next = !settingsStore.settings.darkMode;
  darkMode.value = next;
  settingsStore.update({ darkMode: next });
}
import type { ThemeName } from '../stores/settings';
import { api, API_BASE, isCapacitor, getMobileApiBase, setMobileApiBase } from '../api/client';
import MemoryManage from '../components/memory/MemoryManage.vue';
import LlmLogs from './LlmLogs.vue';
import VoicePackPanel from '../components/VoicePackPanel.vue';
import UserHooksPanel from '../components/settings/UserHooksPanel.vue';

const settingsStore = useSettingsStore();
const platformStore = usePlatformStore();
const pluginStore = usePluginStore();
const toolsStore = useToolsStore();
const tab = ref('general');

// pane 模式：外部（SettingsDialog 左导航）切换分类 → 同步内部 el-tabs（isPaneMode 声明在上方）
watch(
  () => props.pane,
  (p) => { if (p) tab.value = p; },
);

// ===== 移动端四段式层级导航（spec「设置页双端布局」）：首层分组入口 → 二级全屏子页 =====
// 仅移动外壳 + /settings 独立路由页（pageShell）生效；桌面 / Web / 抽屉·弹窗内嵌不走该分支。
// 分组把现有 10 个 tab 聚合为 6 个入口行；二级子页复用 pane 直取机制（v-model=tab + lazy pane），
// 多 tab 分组在子页顶部给一排页内子分段。返回键经 MobilePageShell.backHandler 先退回首层而非离开路由。
interface SettingsGroupTab { name: string; label: string }
interface SettingsGroup { key: string; label: string; desc: string; icon: Component; tabs: SettingsGroupTab[] }
const mobileGroups: SettingsGroup[] = [
  { key: 'general', label: '通用设置', desc: '深色模式 · 布局 · 默认模型 · 上下文压缩', icon: Setting, tabs: [{ name: 'general', label: '通用' }] },
  { key: 'skin', label: '外观皮肤', desc: '主题色 · 内置系列皮肤 · 插件皮肤包', icon: Brush, tabs: [{ name: 'skin', label: '皮肤' }] },
  { key: 'data', label: '数据与日志', desc: '导出 / 导入备份 · 清空缓存 · LLM 日志', icon: DataLine, tabs: [{ name: 'data', label: '数据' }, { name: 'logs', label: '日志' }] },
  { key: 'hooks', label: '工具与钩子', desc: '自定义工具钩子 · 记忆管理', icon: MagicStick, tabs: [{ name: 'userhooks', label: '钩子' }, { name: 'memory', label: '记忆' }] },
  { key: 'service', label: '服务与连接', desc: '商城服务端 · 局域网访问 · 语音包', icon: Link, tabs: [{ name: 'marketplace', label: '商城' }, { name: 'lan', label: '局域网' }, { name: 'voicepack', label: '语音包' }] },
  { key: 'about', label: '关于', desc: '版本 · 开源信息', icon: InfoFilled, tabs: [{ name: 'about', label: '关于' }] },
];
const mobileGroup = ref<SettingsGroup | null>(null);
/** 页面头标题：二级子页显示分组名，首层与桌面显示「设置」 */
const shellTitle = computed(() => (pageShell.value && mobileGroup.value ? mobileGroup.value.label : '设置'));
/** 二级子页的返回：先退回首层分组（页内层级），不离开 /settings；首层不传 → MobilePageShell 默认路由回退 */
const mobileBackHandler = computed(() => (pageShell.value && mobileGroup.value ? exitMobileGroup : undefined));
function enterMobileGroup(g: SettingsGroup) {
  mobileGroup.value = g;
  tab.value = g.tabs[0].name;
}
function exitMobileGroup() {
  mobileGroup.value = null;
  tab.value = 'general';
}
// 移动外壳 → 桌面/宽视口（窗口拉宽等）时清掉页内层级态，避免桌面 el-tabs 头被 is-pane 吞掉
watch(pageShell, (v) => { if (!v) { mobileGroup.value = null; tab.value = 'general'; } });

const fileInput = ref<HTMLInputElement | null>(null);

const themes: Array<{ value: ThemeName; label: string; color: string }> = [
  { value: 'cinnabar', label: '朱砂', color: '#C7382E' },
  { value: 'ink', label: '松烟', color: '#3A3F47' },
  { value: 'indigo', label: '靛青', color: '#2864A8' },
  { value: 'pine', label: '松绿', color: '#2E7D5B' },
  { value: 'clay', label: '陶土', color: '#C4704F' },
  { value: 'cloud', label: '云霁', color: '#5B8DB8' },
  { value: 'bamboo', label: '竹篁', color: '#6CA96E' },
  { value: 'ripple', label: '涟碧', color: '#2AA198' },
  { value: 'porcelain', label: '瓷冰', color: '#9BAEAC' },
  { value: 'dune', label: '砂丘', color: '#C99559' },
];

// ===== 内置系列皮肤：每个主题色一套成套纹理（壁纸/菜单/代码模式/浏览器外壳/部件），无需插件 =====
import { BUILTIN_SKIN_SERIES } from '../styles/skinSeries';
const builtinSeries = BUILTIN_SKIN_SERIES;

function setBuiltinSeries(bs: { id: string }) {
  // update 内部会自动把 palette 同步到系列对应主题色
  settingsStore.update({ skin: bs.id });
}

// ===== 皮肤库：插件贡献的 kind='skin' 主题，按分类分组展示 =====
type SkinTheme = { id: string; name: string; category?: string; preview?: string; pluginId: string };
const allSkins = computed<SkinTheme[]>(() =>
  (pluginStore.themes as Array<SkinTheme & { kind?: string }>).filter((t) => t.kind === 'skin'),
);
const SKIN_CATEGORY_ORDER = ['动漫', '动物', '植物', '风景', '明星', '黑白', '美图', '传统文化', '太极', '简约'];
const skinCategories = computed(() => {
  const seen: string[] = [];
  for (const s of allSkins.value) {
    const c = s.category || '简约';
    if (!seen.includes(c)) seen.push(c);
  }
  return seen.sort((a, b) => {
    const ia = SKIN_CATEGORY_ORDER.indexOf(a); const ib = SKIN_CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
});
function skinsByCategory(cat: string): SkinTheme[] {
  return allSkins.value.filter((s) => (s.category || '简约') === cat);
}
function skinPreviewUrl(s: SkinTheme): string {
  const file = s.preview || 'preview.webp';
  return `${API_BASE}/plugin-assets/${s.pluginId}/${file.replace(/^\.?\//, '')}`;
}
async function downloadSkinSource(s: SkinTheme) {
  try {
    const token = localStorage.getItem('auth_token') || '';
    const resp = await fetch(`${API_BASE}/plugins/${s.id}/export`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await resp.json();
    if (!json?.data?.base64) { ElMessage.error(json?.error || '导出失败'); return; }
    const bin = Uint8Array.from(atob(json.data.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bin], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url; a.download = json.data.filename || `${s.id}-source.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    ElMessage.error('导出失败: ' + (e as Error).message);
  }
}

const darkMode = ref(settingsStore.settings.darkMode);

// ===== 移动端远程后端地址（仅 Capacitor 环境显示）=====
// 保存即 location.reload()：BASE_URL 是模块级常量，改动靠重载一次性生效，
// 免去用户手动杀进程重启（这是 mobile_api_base 此前「无写入入口、改了不生效」的收尾）。
const mobileApiBaseInput = ref(isCapacitor ? getMobileApiBase() : '');
function saveMobileApiBase(): void {
  try {
    setMobileApiBase(mobileApiBaseInput.value);
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败');
    return;
  }
  ElMessage.success('已保存，正在重载…');
  setTimeout(() => location.reload(), 600);
}
function clearMobileApiBase(): void {
  setMobileApiBase('');
  ElMessage.success('已恢复内嵌本地后端，正在重载…');
  setTimeout(() => location.reload(), 600);
}

const defaultPlatformId = ref('');
const defaultModelId = ref('');
const keepRecent = ref(6);
const enableCompression = ref(true);
const memoryExtractPlatformId = ref('');
const memoryExtractModelId = ref('');

// ===== 截图全局快捷键（仅桌面端）=====
const canScreenshot = typeof window !== 'undefined' && !!(window as any).electronAPI?.screenshot;
const DEFAULT_SHOT_ACCEL = 'Control+Alt+A';
const shotAccel = ref(String(settingsStore.settings.screenshotAccelerator ?? DEFAULT_SHOT_ACCEL));
// store 是异步加载的，加载完成后把持久化值灌进来（不覆盖用户此刻正在录制的值）
watch(
  () => settingsStore.settings.screenshotAccelerator,
  (v) => { if (typeof v === 'string') shotAccel.value = v; },
);
const shotAccelDisplay = computed(() =>
  shotAccel.value ? shotAccel.value.replace(/Control/g, 'Ctrl').replace(/\+/g, ' + ') : '未启用',
);
// 截图时是否隐藏本应用窗口（双向绑定到 store，store.update 负责持久化）
const screenshotHideApp = computed({
  get: () => settingsStore.settings.screenshotHideApp !== false,
  set: (v: boolean) => { void settingsStore.update({ screenshotHideApp: v }); },
});

/** KeyboardEvent.key → Electron accelerator 名 */
const ACCEL_KEY_MAP: Record<string, string> = {
  ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Escape: 'Escape', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
  Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
};
const ACCEL_SPECIAL = new Set([...Object.values(ACCEL_KEY_MAP), ...['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'PrintScreen', 'Numlock']]);

/** 从按键事件拼出 accelerator 串；组合不合法（无修饰键 / 单键 Tab 等）返回 null */
function accelFromEvent(e: KeyboardEvent): string | null {
  let base = '';
  if (e.key.length === 1 && /\S/.test(e.key)) base = e.key.toUpperCase();
  else if (ACCEL_KEY_MAP[e.key]) base = ACCEL_KEY_MAP[e.key];
  else if (ACCEL_SPECIAL.has(e.key)) base = e.key;
  if (!base) return null;
  // 单修饰键（只按 Ctrl）不算完整组合
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Meta');
  // 必须带修饰键：否则普通打字会被当成热键吃掉整个键盘
  if (!mods.length) return null;
  return [...mods, base].join('+');
}

async function applyShotAccel(accel: string) {
  const api = (window as any).electronAPI?.screenshot;
  if (!api) return;
  const r = await api.setAccelerator(accel).catch(() => null);
  if (r && r.ok === false) {
    ElMessage.error(r.error || '快捷键设置失败');
    return;
  }
  shotAccel.value = accel;
  await settingsStore.update({ screenshotAccelerator: accel });
  ElMessage.success(accel ? `截图快捷键已设为 ${shotAccelDisplay.value}` : '截图快捷键已禁用');
}
function onShotAccelKeyDown(e: KeyboardEvent) {
  const accel = accelFromEvent(e);
  if (!accel) {
    ElMessage.warning('请按住 Ctrl / Alt / Shift 再按一个键');
    return;
  }
  void applyShotAccel(accel);
}
function resetShotAccel() { void applyShotAccel(DEFAULT_SHOT_ACCEL); }
function clearShotAccel() { void applyShotAccel(''); }

const availableDefaultModels = computed(() =>
  platformStore.models.filter((m) => m.platformId === defaultPlatformId.value && m.enabled),
);
const availableMemoryExtractModels = computed(() =>
  platformStore.models.filter((m) => m.platformId === memoryExtractPlatformId.value && m.enabled),
);

onMounted(async () => {
  await settingsStore.load();
  await platformStore.loadPlatforms();
  defaultPlatformId.value = settingsStore.settings.defaultPlatformId;
  defaultModelId.value = settingsStore.settings.defaultModelId;
  darkMode.value = settingsStore.settings.darkMode;
  keepRecent.value = settingsStore.settings.keepRecent;
  enableCompression.value = settingsStore.settings.enableCompression;
  memoryExtractPlatformId.value = settingsStore.settings.memoryExtractPlatformId;
  memoryExtractModelId.value = settingsStore.settings.memoryExtractModelId;
  if (defaultPlatformId.value) {
    await platformStore.loadModels(defaultPlatformId.value);
  }
  if (memoryExtractPlatformId.value) {
    await platformStore.loadModels(memoryExtractPlatformId.value);
  }
  // 抽取模型未配置 → 自动跟随全局默认模型（通常是 agnes 视觉模型），不再落到本地小模型
  if (!memoryExtractPlatformId.value || !memoryExtractModelId.value) {
    const pid = settingsStore.settings.defaultPlatformId || defaultPlatformId.value;
    const mid = settingsStore.settings.defaultModelId || defaultModelId.value;
    if (pid && mid) {
      if (pid !== memoryExtractPlatformId.value) await platformStore.loadModels(pid);
      const def = platformStore.models.find((m) => m.id === mid && m.enabled);
      if (def) {
        memoryExtractPlatformId.value = def.platformId;
        memoryExtractModelId.value = def.id;
        await settingsStore.update({
          memoryExtractPlatformId: memoryExtractPlatformId.value,
          memoryExtractModelId: memoryExtractModelId.value,
        });
      }
    }
  }
});

function setPalette(t: ThemeName) {
  settingsStore.update({ palette: t });
}

function setSkin(s: string) {
  settingsStore.update({ skin: s });
}

function setLayout(id: string) {
  settingsStore.update({ layout: id });
}

function toggleDarkMode() {
  settingsStore.update({ darkMode: darkMode.value });
}

async function onPlatformChange() {
  defaultModelId.value = '';
  if (defaultPlatformId.value) {
    await platformStore.loadModels(defaultPlatformId.value);
    const def = platformStore.models.find((m) => m.platformId === defaultPlatformId.value && m.isDefault);
    defaultModelId.value = def?.id || '';
  }
  await settingsStore.update({
    defaultPlatformId: defaultPlatformId.value,
    defaultModelId: defaultModelId.value,
  });
}

watch([defaultModelId, keepRecent, enableCompression], async () => {
  await settingsStore.update({
    defaultModelId: defaultModelId.value,
    keepRecent: keepRecent.value,
    enableCompression: enableCompression.value,
  });
});

async function onMemoryExtractPlatformChange() {
  memoryExtractModelId.value = '';
  if (memoryExtractPlatformId.value) {
    await platformStore.loadModels(memoryExtractPlatformId.value);
    const def = platformStore.models.find((m) => m.platformId === memoryExtractPlatformId.value && m.isDefault);
    memoryExtractModelId.value = def?.id || '';
  }
  await settingsStore.update({
    memoryExtractPlatformId: memoryExtractPlatformId.value,
    memoryExtractModelId: memoryExtractModelId.value,
  });
}

watch([memoryExtractPlatformId, memoryExtractModelId], async ([pid, mid]) => {
  if (pid === settingsStore.settings.memoryExtractPlatformId && mid === settingsStore.settings.memoryExtractModelId) return;
  await settingsStore.update({
    memoryExtractPlatformId: memoryExtractPlatformId.value,
    memoryExtractModelId: memoryExtractModelId.value,
  });
});

async function exportData() {
  try {
    const adapter = (await import('@yan-zhi/core')).getPlatformAdapter();
    // 动态读取所有用户表（排除 sqlite 内部表和向量索引表）
    const tableRows = await adapter.db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'vec_%' AND name NOT LIKE '_%'",
    );
    const identRe = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    const tables = tableRows.map((r) => r.name).filter((n) => identRe.test(n));
    const data: Record<string, unknown> = {};
    for (const t of tables) {
      try { data[t] = await adapter.db.query(`SELECT * FROM "${t}"`); } catch {}
    }
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, tables: tables.length, data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-assistant-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success(`已导出 ${tables.length} 张表`);
  } catch (e: any) {
    ElMessage.error(e?.message || '导出失败');
  }
}

function triggerImport() {
  fileInput.value?.click();
}

async function importData(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    if (!backup.data || typeof backup.data !== 'object') {
      throw new Error('无效的备份文件格式');
    }
    await ElMessageBox.confirm(
      `将导入 ${Object.keys(backup.data).length} 张表的数据（备份于 ${backup.exportedAt || '未知时间'}），现有数据将被覆盖，确认？`,
      '导入确认',
      { type: 'warning', confirmButtonClass: 'yz-confirm-danger' },
    );
    // 表名/列名白名单校验：只允许合法 SQL 标识符，防注入
    const identRe = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    const tableNames = Object.keys(backup.data).filter((t) => identRe.test(t));
    const adapter = (await import('@yan-zhi/core')).getPlatformAdapter();
    // 事务化导入：中途失败自动回滚，不丢数据
    await adapter.db.transaction(async () => {
      for (const table of tableNames) {
        const rows = backup.data[table];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        await adapter.db.exec(`DELETE FROM "${table}"`);
        for (const row of rows as Record<string, unknown>[]) {
          const cols = Object.keys(row).filter((c) => identRe.test(c));
          if (cols.length === 0) continue;
          const placeholders = cols.map(() => '?').join(', ');
          const values = cols.map((c) => row[c]);
          await adapter.db.exec(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`, values);
        }
      }
    });
    ElMessage.success(`已导入 ${tableNames.length} 张表，刷新页面后生效`);
    // 重置文件 input，允许重复导入同一文件
    if (fileInput.value) fileInput.value.value = '';
  } catch (e: any) {
    if (e === 'cancel') return;
    ElMessage.error(e?.message || '导入失败');
  }
}

async function clearCache() {
  try {
    await ElMessageBox.confirm('清空缓存会删除所有任务和消息（保留平台/模型/MCP/Skill 配置），确认？', '危险操作', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' });
    await api.delete('/conversations/clear');
    ElMessage.success('已清空');
  } catch {}
}

// 商城服务端
const mpEnabled = ref(false);
const mpAuthType = ref('none');
const mpAuthValue = ref('');
const mpPort = ref(3001);

const connectUrl = computed(() => {
  const host = window.location.hostname || 'localhost';
  return `http://${host}:${mpPort.value}/api/marketplace`;
});

async function onMpToggle(v: boolean) {
  const r = await toolsStore.setMarketplaceConfig({ enabled: v });
  if (r.persisted === 'local') {
    ElMessage.info('已暂存到本地（后端接口未就绪，恢复后将自动同步）');
  } else {
    ElMessage.success('商城服务端配置已保存');
  }
}
async function onMpAuthChange() {
  await toolsStore.setMarketplaceConfig({
    auth: { authType: mpAuthType.value, token: mpAuthValue.value },
  });
}
async function onMpPortChange() {
  await toolsStore.setMarketplaceConfig({ port: mpPort.value });
}
function copyUrl() {
  navigator.clipboard.writeText(connectUrl.value).then(() => ElMessage.success('已复制连接地址'));
}

// 局域网访问
const lanIps = ref<Array<{ name: string; address: string }>>([]);
const lanPort = ref(3001);
const lanLoading = ref(false);

async function loadLanIps() {
  lanLoading.value = true;
  try {
    const r = await api.get<any>('/network/ip');
    const data = r && 'data' in r ? (r.data as any) : r;
    if (data && Array.isArray(data.data)) {
      lanIps.value = data.data.map((x: any) => ({ name: x.name, address: x.address }));
    }
    if (data?.port) lanPort.value = data.port;
  } catch {
    lanIps.value = [];
  } finally {
    lanLoading.value = false;
  }
}

function copyLanUrl(ip: string) {
  navigator.clipboard.writeText(`http://${ip}:${lanPort.value}`).then(() => ElMessage.success('已复制地址'));
}

function openLan(ip: string) {
  const url = `http://${ip}:${lanPort.value}`;
  const w = window as any;
  // 桌面端优先用系统默认浏览器打开（Electron shell.openExternal），web 端回退新标签页
  if (w.electronAPI?.shell?.openExternal) {
    w.electronAPI.shell.openExternal(url);
    ElMessage.success('已在系统浏览器打开');
  } else if (w.open) {
    w.open(url, '_blank', 'noopener,noreferrer');
    ElMessage.success('已在新标签页打开');
  } else {
    ElMessage.warning('当前环境无法打开浏览器，请手动访问 ' + url);
  }
}

function openLanFirst() {
  if (lanIps.value.length > 0) openLan(lanIps.value[0].address);
  else ElMessage.warning('未检测到局域网 IP');
}

// ===== 局域网节点发现（扫描经本端后端做，移动端可一键设为后端）=====
const lanNodes = ref<Array<{ ip: string; port: number; isSelf: boolean }>>([]);
const nodeScanning = ref(false);
const nodeScanDone = ref(false);

async function scanLanNodes() {
  nodeScanning.value = true;
  try {
    const r = await api.post<any>('/lan/discover-nodes', {});
    const data = r && 'data' in r ? (r.data as any) : r;
    lanNodes.value = Array.isArray(data?.data?.nodes) ? data.data.nodes : [];
    if (!lanNodes.value.length) ElMessage.info(`扫描完成（${Math.round((data?.durationMs || 0) / 100) / 10}s），未发现言智节点`);
  } catch (e) {
    lanNodes.value = [];
    ElMessage.error('扫描失败: ' + ((e as Error).message || '未知错误'));
  } finally {
    nodeScanning.value = false;
    nodeScanDone.value = true;
  }
}

function useNodeAsBackend(n: { ip: string; port: number }) {
  try {
    setMobileApiBase(`http://${n.ip}:${n.port}`);
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败');
    return;
  }
  ElMessage.success(`已设为后端 http://${n.ip}:${n.port}，正在重载…`);
  setTimeout(() => location.reload(), 600);
}

function copyNodeUrl(n: { ip: string; port: number }) {
  navigator.clipboard.writeText(`http://${n.ip}:${n.port}`).then(() => ElMessage.success('已复制地址'));
}

onMounted(() => {
  void loadLanIps();
});

onMounted(async () => {
  await toolsStore.loadMarketplaceConfig();
  mpEnabled.value = toolsStore.marketplaceEnabled;
  mpAuthType.value = toolsStore.marketplaceAuth.authType || 'none';
  mpAuthValue.value = toolsStore.marketplaceAuth.token || '';
  mpPort.value = toolsStore.marketplacePort || 3001;
});
</script>

<style scoped>
/* .page / .page-title come from App.vue global */
.page-title { margin-bottom: 24px; }
.glass-tabs { background: var(--glass-bg); backdrop-filter: var(--glass-filter); border-radius: var(--radius-md); padding: 16px; }
/* pane 模式（SettingsDialog 内嵌，Task 10.3）：tab 头由弹窗左侧分类导航承担，隐藏自身 tab 条 */
.glass-tabs.is-pane :deep(.el-tabs__header) { display: none; }

/* ===== 移动端首层分组入口列表 + 二级子页（spec「设置页双端布局」） =====
   仅移动外壳分支渲染这些类；行高 ≥44px 触控标准，样式全部走 token。 */
.settings-group-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.settings-group-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 10px 14px;
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}
.settings-group-row:active { background: var(--glass-bg-hover); }
.settings-group-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
}
.settings-group-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.settings-group-name { font-size: 14px; font-weight: 600; }
.settings-group-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-group-arrow { flex-shrink: 0; color: var(--color-text-secondary); }

/* 二级子页内多 tab 分组的页内子分段 */
.mobile-sub-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.mobile-sub-tab {
  min-height: 36px;
  padding: 0 16px;
  border: 1px solid var(--glass-border);
  border-radius: 18px;
  background: var(--glass-bg);
  color: var(--color-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.mobile-sub-tab.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

@media (max-width: 767px) {
  .page-title { font-size: 18px; margin-bottom: 16px; }
  .glass-tabs { padding: 12px; }
  .glass-tabs :deep(.el-tabs__header) { margin-bottom: 12px; }
  /* ★ Task 10.4：窄屏 tab 由「横向滚动」改「多行平铺列表」——
     10 个 tab 横排必溢出，藏进横向滚动在触屏上等于不可发现（无箭头提示）。
     直接换行平铺：全部分区入口一眼可见，行高提到 44px 触控标准。
     滚动箭头/位移与激活下划线在换行布局下语义失效，一并停用。 */
  .glass-tabs :deep(.el-tabs__nav-wrap)::after { display: none; }
  .glass-tabs :deep(.el-tabs__nav-scroll) { overflow: visible; }
  .glass-tabs :deep(.el-tabs__nav) {
    flex-wrap: wrap;
    transform: none !important;
  }
  .glass-tabs :deep(.el-tabs__nav-prev),
  .glass-tabs :deep(.el-tabs__nav-next) { display: none; }
  .glass-tabs :deep(.el-tabs__active-bar) { display: none; }
  .glass-tabs :deep(.el-tabs__item) {
    height: 44px; line-height: 44px;
    padding: 0 14px;
    white-space: nowrap;
  }
  .settings-form { max-width: 100% !important; }
  .settings-form :deep(.setting-row) { margin-bottom: 14px; }
  .data-section { flex-wrap: wrap; gap: 8px; }
  .data-section .el-button:nth-child(1),
  .data-section .el-button:nth-child(2) { flex: 1 1 calc(50% - 4px); min-width: 0; white-space: nowrap; }
  .data-section .el-button:nth-child(3) { flex: 1 1 100%; }
}

.theme-grid { display: flex; gap: 10px; flex-wrap: wrap; }
.theme-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--glass-border);
  border-radius: 18px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
}
.theme-chip:hover { background: var(--glass-bg-hover); }
.theme-chip.active { border-color: var(--chip-color); background: color-mix(in srgb, var(--chip-color) 12%, transparent); }
.theme-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--chip-color); box-shadow: 0 0 6px var(--chip-color); }

/* ===== 皮肤库（独立 tab） ===== */
.skin-page { display: flex; flex-direction: column; gap: 18px; }
.skin-page-tip { font-size: 12px; color: var(--color-text-secondary); }
.skin-cat-label { font-size: 13px; font-weight: 600; color: var(--color-text); margin-bottom: 10px; }
.skin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.skin-card {
  position: relative;
  border: 2px solid var(--glass-border);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  background: var(--glass-bg);
  transition: border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
}
.skin-card:hover { border-color: var(--color-primary); transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.12); }
.skin-card.active { border-color: var(--color-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent); }
.skin-thumb { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; display: block; }
.skin-card-body { display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; }
.skin-name { font-size: 13px; font-weight: 600; }
.skin-src { font-size: 11px; color: var(--color-text-secondary); cursor: pointer; border: none; background: transparent; padding: 2px 4px; border-radius: 6px; }
.skin-src:hover { color: var(--color-primary); background: var(--glass-bg-hover); }
.builtin-tag {
  font-size: 10px; padding: 1px 6px; border-radius: 5px; cursor: default;
  color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 12%, transparent);
}
.skin-active-badge {
  position: absolute; top: 6px; right: 6px;
  font-size: 10px; padding: 2px 8px; border-radius: 999px;
  background: var(--color-primary); color: #fff;
}
.skin-empty { font-size: 13px; color: var(--color-text-secondary); }
.skin-section { display: flex; flex-direction: column; gap: 10px; }
.skin-section-label { font-size: 14px; font-weight: 600; color: var(--color-text); }
.skin-section-hint { font-size: 12px; font-weight: 400; color: var(--color-text-secondary); }
.skin-card-none .skin-thumb-none {
  width: 100%; aspect-ratio: 16 / 10; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, var(--glass-bg), var(--glass-bg-hover));
  color: var(--color-text-secondary); font-size: 14px; font-weight: 600;
}

.data-section { display: flex; gap: 12px; }
.settings-form { max-width: 600px; }
.lan-section { max-width: 600px; }
.lan-tip { color: var(--color-text-secondary); font-size: 13px; margin-bottom: 16px; }
.lan-empty { color: var(--color-text-secondary); font-size: 13px; padding: 16px 0; }
.lan-list { display: flex; flex-direction: column; gap: 12px; }
.lan-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 10px; }
.lan-url-box { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.lan-url-box code { font-family: "JetBrains Mono", monospace; font-size: 13px; color: var(--color-text); word-break: break-all; }
.lan-iface { font-size: 11px; color: var(--color-text-secondary); }
.lan-actions { display: flex; gap: 8px; flex-shrink: 0; }
.about-section h3 { margin-bottom: 12px; }
.about-section p { margin: 6px 0; color: var(--color-text-secondary); }
.about-tip { font-size: 12px; opacity: 0.7; }
.about-link { color: var(--color-primary); text-decoration: none; }
.about-link:hover { text-decoration: underline; }
.connect-url-box { display: flex; align-items: center; gap: 8px; background: rgba(15,23,42,0.04); border-radius: 6px; padding: 6px 10px; }
.connect-url-box code { font-family: monospace; font-size: 13px; color: var(--color-primary); }

/* 日志页嵌入设置 tab 时：去掉独立滚动，让整页自然滚动 */
.logs-tab-embed { padding: 4px 0; }
.logs-tab-embed :deep(.logs-page) {
  padding: 0;
  overflow: visible;
  min-height: 0;
}
.logs-tab-embed :deep(.logs-list) {
  overflow: visible;
  flex: none;
}
.logs-tab-embed :deep(.stats-table-wrap) {
  max-height: 320px;
}

</style>
