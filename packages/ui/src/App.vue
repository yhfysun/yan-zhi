<template>
  <div class="app-shell" :class="{ 'platform-desktop': isDesktop, 'platform-web': isWeb, 'platform-mobile': isMobilePlatform, 'nav-collapsed': collapsed, 'is-electron': isElectron, 'is-bare': isBareRoute }">

    <!-- 独立子窗口（如差异窗口）：不套任何应用外壳，整窗交由页面自绘标题栏 -->
    <template v-if="isBareRoute">
      <main class="main-content full">
        <router-view />
      </main>
    </template>

    <!-- 内容区域 -->
    <div v-else class="app-body">
      <template v-if="$route.name === 'login' || $route.name === 'license'">
        <main class="main-content full">
          <router-view />
        </main>
      </template>

      <template v-else>
        <!-- 插件提供的自定义布局：router-view 作为默认 slot 注入 -->
        <component v-if="pluginLayoutLoader" :is="pluginLayoutLoader">
          <router-view />
        </component>

        <!-- 内置默认布局 -->
        <template v-else>
        <!-- 桌面端：竖排 SideNav 退役，主导航由 apps/desktop TitleBar 横排承担；
             web 端：WebTopBar 在 apps/web/src/App.vue 接管主导航，SideNav 也不再渲染；
             仅 Capacitor 端仍保留竖排 SideNav 的 tab-bar 分支。 -->
        <SideNav v-if="isMobile" />
        <!-- Mobile TopBar —— ★ 仅 Capacitor 端渲染（见 mobileShellAsRoot 注释）：
             桌面/Web 端的窄窗口已有外层 WebTopBar，再画一条会双标题栏重叠。

             ★ 移动端顶栏只承担两件事（主导航已下移到 TabBar，见 SideNav 的 .tab-bar）：
               ① 定位：当前会话标题（chat）或页面名（其它页）
               ② 身份：主题切换 + 头像/登录（低频但必须有出口）
             原先还放着「首页/浏览器/消息/更多」横排导航 —— 那是把桌面顶栏照搬过来，
             竖屏下既挤又和 TabBar 语义重复。
             （对话页的搜索在会话列表抽屉里，不在此重复造一个入口。） -->
        <header v-if="mobileShellAsRoot && route.name !== 'chat' && !isShellPage" class="mobile-topbar">
          <!-- 汉堡按钮 → 左滑抽屉（Task 11.1）：低频入口（空间切换/定时任务/技能工具/设置）。
               对话页不渲染本顶栏（ChatTopbar 自带会话抽屉入口），故抽屉只在其余页可达。 -->
          <button class="mobile-icon-btn" type="button" aria-label="打开菜单" @click="navDrawerOpen = true">
            <el-icon :size="18"><Menu /></el-icon>
          </button>
          <span class="mobile-topbar-title">{{ pageTitle }}</span>
          <div class="mobile-topbar-actions">
            <el-tooltip :content="settingsStore.settings.darkMode ? '切换浅色模式' : '切换深色模式'" placement="bottom">
              <button class="mobile-icon-btn" type="button" aria-label="切换主题" @click="toggleTheme">
                <el-icon :size="17"><component :is="settingsStore.settings.darkMode ? Sunny : Moon" /></el-icon>
              </button>
            </el-tooltip>
            <el-dropdown v-if="authStore.isLoggedIn" trigger="click">
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
            <!-- ★★★ 本机单机端（Capacitor 移动端）→ 中性「本机」头像，**不给登录入口**
                 （2026-09-27 用户：「移动端不应该也是默认登录？」）。
                 判据：移动端与桌面端一样跑内嵌后端、身份恒为 guest（本地自带，非用户登录），
                 所以两端该用同一个形态。Web 端才真有登录需求，保留「未登录 → 登录入口」。
                 此前这里是无条件 `v-else` → 移动端必然渲染出「登录」死入口
                 （点了进 /login，而本地端登不进任何账号）。 -->
            <el-dropdown v-else-if="isLocalClient" trigger="click">
              <span class="mobile-user-avatar is-local" title="本机">{{ localIdentityInitial }}</span>
              <template #dropdown>
                <el-dropdown-menu>
                  <div class="user-dropdown-header">
                    <span class="user-dropdown-name">本机</span>
                  </div>
                  <el-dropdown-item @click="$router.push('/settings')">
                    <el-icon><Setting /></el-icon>
                    <span>设置</span>
                  </el-dropdown-item>
                  <el-dropdown-item @click="$router.push('/memory')">
                    <el-icon><Collection /></el-icon>
                    <span>记忆管理</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <button v-else class="mobile-user-avatar" type="button" aria-label="登录" @click="$router.push('/login')">
              <!-- 用 Avatar 而非线框 User：User 已在 TabBar「智能体」上（移动端常驻同屏），
                   同图标同时可见会被当成"重复"（2026-09-21 实测 3 处人形图标）。 -->
              <el-icon :size="17"><Avatar /></el-icon>
            </button>
          </div>
        </header>
        <main class="main-content" :class="{ 'is-chat': route.name === 'chat', 'no-shell-topbar': isShellPage }">
          <router-view v-slot="{ Component }">
            <!-- ★★ 2026-10-16 页面切换**不再用 `<transition>`**（用户实报「切模式黑屏、无任何报错」
                 ＋「切换有点慢」）。原因：`mode="out-in"` 把"旧视图可以退场了"这件事交给 Vue 的
                 过渡状态机，而那个状态机要靠完成回调推进 —— 实测**离开运维台那一次**回调会不跑
                 （`state.isLeaving` 永远为 true），内容区就只剩一个占位注释：旧视图已经摘掉、
                 新视图永远不来，页面一片空白且不抛任何异常。给 `:duration` 也没救回来
                 （那个回调是状态机内部的，不是 transitionend 那一层）。
                 改用最朴素的做法：`<component>` 直接渲染 + 一条**纯 CSS 逐帧动画**
                 （见 .main-content > * 的 yz-page-in）。切换时旧视图与新视图在**同一帧**里
                 换掉，没有"等谁"的环节，也就没有能停住的中间态；顺带比 out-in 少了
                 110ms 的串行 leave，切换更快。
                 :key="viewKey" 仍留着 —— 它是看门狗唯一的修复手段（内容区空了就重挂一次）。 -->
            <component :is="Component" :key="viewKey" />
          </router-view>
        </main>
        </template>
      </template>
    </div>

    <!-- 独立子窗口：无应用抽屉（设置浮层属于主窗口的导航体验） -->
    <SettingsDrawer v-if="!isBareRoute" />

    <!-- 移动端汉堡抽屉（Task 11.1）：仅由 mobile-topbar 的汉堡按钮打开，桌面端永不展开 -->
    <MobileNavDrawer v-model="navDrawerOpen" />

    <!-- 桌面端设置弹窗（Task 10.3）：WebTopBar 头像菜单 /「更多」入口打开 -->
    <SettingsDialog v-if="!isBareRoute" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Avatar, SwitchButton, Moon, Sunny, Setting, Collection, Menu } from '@element-plus/icons-vue';
import { useAuthStore } from './stores/auth';
import { useSettingsStore } from './stores/settings';
import { usePluginStore } from './stores/plugin';
import SideNav from './components/SideNav.vue';
import SettingsDrawer from './components/SettingsDrawer.vue';
import SettingsDialog from './components/SettingsDialog.vue';
import MobileNavDrawer from './components/MobileNavDrawer.vue';
import { syncPluginRoutes } from './router';
import { resolvePluginComponent } from './plugin-component-registry';
import { MODE_VIEW_LOADERS } from './generated/build-modes';
import { useLicenseStore } from './stores/license';
import { usePlatformStore } from './stores/platform';
import { waitForBackend } from './api/backend-ready';

import { useMobileShell } from './composables/useMobileShell';
import { usePlatform } from './composables/usePlatform';
import { useSidebarState } from './composables/useSidebarState';
import { installSelectAllScope } from './utils/selectAllScope';
import { isModeWindow, isConvWindow, convIdOfWindow, modeKeyOfRoute } from './utils/modeWindow';
import * as modeModule from './stores/mode';
import { useChat } from './composables/chat/useChat';
import { useChatStore } from './stores/chat';
import { useAgentStore } from './stores/agent';
import { useCodeStore } from './stores/code';

const route = useRoute();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();
settingsStore.applyDarkMode(settingsStore.settings.darkMode);
// 低内存模式（B5）：启动即应用（与 applyDarkMode 同点位）—— 设置从磁盘读回是异步的，
// 但本地缓存里的值此刻已可用；load() 完成后 settings.ts 内还会再应用一次（幂等）。
settingsStore.applyLiteMode(settingsStore.settings.liteMode);
const pluginStore = usePluginStore();
/** 移动外壳判定：视口窄 或 跑在 Capacitor 端（详见 useMobileShell 注释）。
 *  ★ 与下方 isMobilePlatform 的分工：本变量管「用哪套壳」，isMobilePlatform 管
 *    「加哪个平台类名」。Capacitor 横屏时前者 true、后者也 true，桌面端两者都 false。 */
const isMobile = useMobileShell();
const { isDesktop, isWeb, isMobile: isMobilePlatform } = usePlatform();
const { collapsed } = useSidebarState();

/**
 * ★★ 是否由「本共享壳」承担顶部导航条 / 底部 TabBar。
 *
 * 背景（真实的适配 bug）：`isMobile` = 视口窄 **或** Capacitor 端。桌面端与 Web 端的
 * 根组件（`apps/desktop/src/App.vue` / `apps/web/src/App.vue`）**无条件**渲染 WebTopBar，
 * 而本共享壳在视口 <768px 时也会切到移动外壳（`mobile-topbar` + 底部 TabBar）。
 * 两者叠加的后果（实测 400/640px）：
 *   ① 顶部两条 36px + 48px 的横条，`mobile-topbar-title` 直接被 WebTopBar 压住；
 *   ② 底部 TabBar 与上方导航的语义重复 —— 窄屏同时存在两套主导航；
 *   ③ 内容区顶部留白按 48px 算，与 WebTopBar 的 36px 对不上。
 *
 * 处置：**只有 Capacitor 端才用自绘 mobile-topbar + TabBar**。桌面端/Web 端的窄窗口
 * 不套移动外壳，而是走 SideNav 的「宽屏 dock 紧凑形态」——语义上仍是 52px dock，
 * 与 WebTopBar 并存不冲突。
 *
 * ⚠️ 不能直接把 `isMobile` 改回宽度断点：Capacitor 横屏（视口 800+px）时会误判成 Web，
 * 底部 TabBar 与自绘顶栏一起消失（见 useMobileShell 注释里的历史坑）。
 * 所以要区分**两件事**：
 *   · `isMobile`              —— 「是否按移动交互渲染」（TabBar 项、when='mobile' 插件项、
 *                                窄屏留白/字号）→ 保持「视口窄 或 Capacitor」并集；
 *   · `mobileShellAsRoot`     —— 「本壳是否自己画顶栏/底栏」→ **仅 Capacitor**。
 *
 * 口径来源：`openspec/specs/PLATFORM.md`「移动端使用底部 TabBar」——
 * 移动端指 Capacitor 容器；桌面/Web 的窄窗口只是窄窗降级，不应变成移动端外壳。
 */
const mobileShellAsRoot = isMobilePlatform;

// Electron 桌面端检测：由主进程通过 preload 注入 window.electronAPI.isElectron
const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

/**
 * 本机单机端（桌面 Electron ∪ 移动 Capacitor）—— 决定移动顶栏的身份区形态。
 *
 * ★ 与 `isElectron` 分开：类名 `is-electron` 只该给桌面端（有真实窗口控件语义），
 *   而「身份区要不要给登录入口」是**另一件事**，判据是"身份是否本机自带"——
 *   移动端同样跑内嵌后端、恒定 guest 身份，所以也用中性本机头像（见 api/client.ts）。
 */
const isLocalClient = typeof window !== 'undefined'
  && (!!(window as any).electronAPI?.isElectron || !!(window as any).Capacitor?.isNativePlatform);
/** 本机身份首字母（与 WebTopBar 桌面端同一表述，不暴露 guest 这个内部身份） */
const localIdentityInitial = computed(() => '本');

/**
 * 独立子窗口路由（meta.bare）：不套应用外壳。
 * 用于桌面端开真窗口承载 diff 等重视图 —— 子窗口自己画标题栏与窗口控制，
 * 若再套一层 SideNav / 顶栏就会出现「窗口里还有一整套应用导航」的错位。
 */
const isBareRoute = computed(() => route.meta?.bare === true);

/** Task 11.1：移动端汉堡抽屉开合（仅 Capacitor 自绘顶栏的汉堡按钮会触发） */
const navDrawerOpen = ref(false);
/** Task 11.2：meta.mobilePageShell 路由（如 /settings 示范页）用页面自带四段式骨架——
 *  壳顶栏隐藏、.main-content 顶部不再让位 44px（见 .no-shell-topbar）。桌面端不受影响。 */
const isShellPage = computed(() => route.meta?.mobilePageShell === true);

/** 当前插件布局组件（懒加载函数）；null 表示用内置默认布局 */
const pluginLayoutLoader = shallowRef<(() => Promise<unknown>) | null>(null);
function resolvePluginLayout() {
  const id = settingsStore.settings.layout;
  if (id === 'default') { pluginLayoutLoader.value = null; return; }
  const def = pluginStore.layouts.find((l) => l.id === id);
  pluginLayoutLoader.value = def ? (resolvePluginComponent(def.component) ?? null) : null;
}

// ===== 页面切换：看门狗（2026-10-16）=====
//
// 事故复盘（用户实报「重启后切到运维模式再切别的模式黑屏，控制台一条错都没有」）：
//   那时路由视图是套在 `<transition mode="out-in">` 里的，而它要靠**完成回调**推进状态机
//   （enter-from 等 nextFrame 摘掉、旧视图等 leave 结束才换新视图）。这个回调一旦没跑到，
//   `state.isLeaving` 就永远是 true：`.main-content` 里只剩一个占位注释 ——
//   **旧视图已摘掉、新视图永远不来，页面永久空白**，而且不抛任何异常（过渡只是不推进）。
//   实测两处都能真出现：页面不可见时 Chromium 直接掐掉动画帧（requestAnimationFrame
//   实测完全不触发）；以及**离开运维台**那一次（切 `/ops` → `/code`、`/home` 都中过）。
//
// 处置分两层：
//   ① **根因层**：页面切换不再走 `<transition>`，改成纯 CSS 动画（见 router-view 与
//      .main-content > * 两处注释）—— 没有"等回调"这个环节，就没有能停住的中间态。
//      这一层同时也是"切换更快"：少了 out-in 串行的 110ms leave。
//   ② **兜底层**：本看门狗不看时序地检查「路由说我们在某个页面上、内容区却一个元素都没有」，
//      持续超过一次心跳就强制重挂当前视图。任何成因（含我没排查到的）都被它兜住 ——
//      用户报的痛点是"黑屏且无任何报错"，那就必须有一个不依赖具体成因的兜底，
//      而且它在动手时会在控制台留一行自足的线索。
const viewKey = ref(0);
/** 唯一的修复手段：把当前视图整棵重挂一次（见 ensureContentRendered）。 */
function forceRemountCurrentView() {
  viewKey.value += 1;
}

/** 「路由说我们在某个页面上，内容区却一个元素都没有」——只剩占位注释的空白。
 *
 *  ★ 2026-10-16 起，这个函数的存在意义是**兜底而非主力**：页面切换已从 `<transition>`
 *    换成纯 CSS 动画（见 router-view 处注释），那种"旧视图摘掉、新视图永远不来"的
 *    永久空白从机制上不该再出现。但它是**不看时序**的判定 —— 只要路由有匹配、
 *    内容区却空着超过一次心跳，就重挂。任何成因（含我没排查到的）都被这一条兜住。
 *
 *  ★ 这里**不能**加 `if (document.hidden) return`（我加过，是错的）：页面被判定不可见时
 *    帧会被掐，但 **DOM 照样同步建得出来**（实测隐藏状态下截图仍能渲染出内容）——
 *    隐藏期间内容区为空同样是异常，此时重挂一次就能把 DOM 补到位，
 *    等用户看过来时正确的页面已经在那儿了；反过来放行才会"一看就是黑的"。 */
function contentAreaStuck(): boolean {
  if (!route.matched.length) return false;      // 路由压根没匹配上，那是兜底路由的事
  const main = document.querySelector('.main-content');
  if (!main) return false;
  return main.children.length === 0;
}

/** 连续几次心跳都判定为卡住才动手：正常的 leave 只持续 150ms，不该被误判成卡住 */
const STUCK_TICKS_BEFORE_REPAIR = 2;
/** 同一地址两次重挂之间的冷却：限流而不是"修几次就放弃"——放弃就等于把它永久留在黑屏上 */
const REPAIR_COOLDOWN_MS = 5000;
let stuckTicks = 0;
const lastRepairAt = new Map<string, number>();
const repairCounts = new Map<string, number>();

function ensureContentRendered() {
  stuckTicks = contentAreaStuck() ? stuckTicks + 1 : 0;
  if (stuckTicks < STUCK_TICKS_BEFORE_REPAIR) return;
  stuckTicks = 0;
  const key = route.fullPath;
  const now = Date.now();
  if (now - (lastRepairAt.get(key) ?? 0) < REPAIR_COOLDOWN_MS) return;
  lastRepairAt.set(key, now);
  const n = (repairCounts.get(key) ?? 0) + 1;
  repairCounts.set(key, n);
  // 第一次留下一条**自足**的线索：用户报「黑屏但一条错都没有」，就得让这一行把
  // 「哪个地址、什么现场、页面可见与否」全带上，贴出来就能定位，不用再猜。
  if (n === 1) {
    const main = document.querySelector('.main-content');
    console.warn('[view] 内容区为空，已强制重挂当前页面', {
      路由: key,
      子元素数: main?.children.length ?? -1,
      内容区HTML: (main?.innerHTML ?? '').slice(0, 80),
      页面可见: !document.hidden,
      第几次修复: n,
    });
  }
  forceRemountCurrentView();
}

const onDocVisible = () => { if (!document.hidden) ensureContentRendered(); };

/**
 * 闲置时预热各模式工作台的模块（2026-10-16，用户反馈「切换有点慢，顺畅点」）。
 *
 * 实测：切换那一刻的 DOM 交换只要 3–13ms，慢的不是渲染，而是「切过去才去拉/编译那个模块」——
 * 模式工作台体量都不小（运维台 2300+ 行、开发台带 CodeMirror、剪辑台带时间轴），
 * dev 下第一次切还要现编译（秒级），prod 下也要现场解析执行。用户感知就是"切模式很慢"。
 * 预热之后首次切换只剩挂载成本。
 *
 * 三条约束：
 *   · 只在**空闲回调**里推进，且一次只热一个 —— 预热本身不能把主线程占满、反而更卡；
 *   · 失败静默：预热纯属优化，任何失败都不该影响功能（模块真出错时，切过去那一刻照常报错）；
 *   · 重复 import 走模块缓存，所以在看的那个也不必排除。
 */
function scheduleModeViewWarmup() {
  // ★ 只能预热本次构建实际包含的模式（生成表）：未选模式在这里**不能有 import 表达式**，
  //   否则 Rollup 仍会为它产出 chunk，打包裁剪就失效了。
  const loaders: Array<() => Promise<unknown>> = Object.values(MODE_VIEW_LOADERS);
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  const idle = (cb: () => void) => { if (ric) ric(cb, { timeout: 2000 }); else window.setTimeout(cb, 300); };
  let i = 0;
  const next = () => {
    if (i >= loaders.length) return;
    const load = loaders[i++];
    void load().catch(() => { /* 预热失败不影响功能 */ }).finally(() => idle(next));
  };
  idle(next);
}

// 会话/模式窗口共用的 chat 实例：onMounted 的会话窗口引导 + 下方「按模式记忆会话」
// 都要用（useChat 在 App.vue 挂载一次，避免重复实例化注册两套监听）。
const chat = useChat();
const chatStore = useChatStore();

onMounted(async () => {
  // 独立模式窗口（2026-10-18）：把 activeMode 同步到弹出路由对应的模式。
  // 子窗口与主窗口共享 localStorage 的 yz:mode —— 主窗口可能停在办公、弹出的却是运维窗口；
  // 工作台组件（lead/placement 等）按 activeMode 渲染，不同步会出现"路由在 /code、
  // 里面却按办公形态画"的错位。只影响子窗口自身（写回 localStorage 主窗口仅顶栏徽标跟着变，可接受）。
  if (isModeWindow()) {
    const mk = modeKeyOfRoute(route.path);
    if (mk) modeModule.setMode(mk as modeModule.AppMode);
  }
  // 会话独立窗口（2026-10-18）：完整交互界面固定打开指定会话。
  // ★ 必须走 selectConv —— `/chat/:convId` 的路径参数全仓无人消费（Chat.vue 不读
  //   route.params）。守卫已把 activeMode 拨回 office，这里等会话清单就绪后选中目标；
  //   就绪前 useChat.onMounted 的「恢复最近会话」可能先选中别的，最终以本引导为准。
  if (isConvWindow()) {
    modeModule.setMode('office');
    const cid = convIdOfWindow();
    if (cid) {
      void (async () => {
        try {
          await chatStore.loadConversations();
          await chat.selectConv(cid);
        } catch { /* 目标会话可能已删除：维持草稿态即可 */ }
      })();
    }
  }
  // 页面切换看门狗（见 ensureContentRendered 注释）：
  //   ② 回到可见 / 重新聚焦时查一次
  document.addEventListener('visibilitychange', onDocVisible);
  window.addEventListener('focus', ensureContentRendered);
  //   ③ 不看时序的定时兜底 —— 用户报的形态正是"页面一直可见、内容区却空着"
  window.setInterval(ensureContentRendered, 700);
  //   路由刚变过之后再复查一次（新视图本该在这一刻已经挂上）
  watch(() => route.fullPath, () => { window.setTimeout(ensureContentRendered, 1200); });
  // 全局 Ctrl+A 只作用于当前"窗口"（弹窗/抽屉/浮层/主内容区），不再全选整个应用
  installSelectAllScope();
  try {
    await settingsStore.load();
  } catch {
    // 设置读取失败时仍允许应用正常渲染
  }
  // ★ 授权码是业务请求的前置（2026-10-12 修复）：`/plugins` 属于授权门禁管控的接口，
  //   若在 keyring 授权码就绪前就拉，会拿到 403 → 插件路由/皮肤/布局全缺，
  //   只能重启才恢复（本函数注释里记的老坑）。init() 幂等，正常路径上零开销。
  await useLicenseStore().init();
  await bootPluginLayer();
  // 业务清单预热（模型/智能体）：非阻塞，见 warmUpBusinessData 注释
  void warmUpBusinessData();
  // 模式工作台模块预热（非阻塞、空闲时错峰，见 scheduleModeViewWarmup 注释）：
  // 排在启动那几件事之后，避免和首屏抢主线程
  scheduleModeViewWarmup();
});

/**
 * 拉插件清单并同步动态路由 / 布局。
 *
 * 为什么单独抽成一个函数还要能被重跑：授权门禁（后端 YZ_LICENSE_GUARD=1）开启时，
 * 首次启动停在授权页 → 此刻没有授权码，`/plugins` 会被 403 拒掉（它不属于豁免清单）。
 * 若只在 onMounted 跑一次，用户激活后插件路由/皮肤/布局全缺，必须重启应用才恢复 ——
 * 所以激活成功后要重跑这一段。未启用门禁时行为不变（onMounted 里跑一次）。
 */
async function bootPluginLayer() {
  try {
    await pluginStore.refresh();
    await syncPluginRoutes();
    resolvePluginLayout();
    // 皮肤主题的壁纸与主色都来自插件清单：插件就绪后按当前设置重应用。
    // 只补 applySkin 不补 applyPalette 的历史坑：启动时 plugin themes 未就绪，
    // applyPalette(皮肤id) 查不到主题直接 return → 主色族(--color-primary 等)停在默认朱砂橙，
    // 皮肤壁纸/玻璃都生效了、按钮/焦点/hover/滚动条渐变却全是默认橙色——观感即"皮肤没生效/灰蒙蒙"。
    settingsStore.applyPalette(settingsStore.settings.palette);
    settingsStore.applySkin(settingsStore.settings.skin);
  } catch {
    // 插件加载失败不阻塞主应用
  }
}

/**
 * 冷启动预热业务清单：模型（平台 + 模型）与智能体。
 *
 * ★★ 为什么必须在壳层做（2026-10-16 用户实报「模型/智能体数据经常容易丢，要点进平台页
 *   再回会话，下拉才出来」）：这两份清单此前**只**在 `useChat.onMounted`（会话页挂载）
 *   里各拉一次。冷启动那一次若没落地，列表就永久为空 —— 用户只能自己进「模型平台」
 *   逛一圈把共享缓存补回来。本组件恒挂载，在这里预热 = 不管用户落在哪个模式页，清单都已在路上。
 *
 * ★ 顺序不能反：先等内嵌后端就绪（没监听时请求直接扑空），再等授权码（keyring 异步 IPC，
 *   冷启动存在"后端已就绪但码还没读出来"的窗口，此时 `/platforms` 会 403，而
 *   `getWithRetry` 对 4xx **不重试**）—— 这两条正是"拉一次拉不到就永远没有"的成因。
 *
 * ★ 非阻塞（void）：预热不该拖慢首屏。下拉打开时还有一层 `ensure*` 兜底（见 ChatInputArea）。
 * ★ 幂等：`ensure*` 只在列表为空时发请求，进行中的请求复用同一个 Promise → 与下游展开兜底不会发两遍。
 *   与会话页 `useChat.onMounted` 那条路径（`loadPlatforms()/loadModels()` 无条件全量刷新）**可能**
 *   在时间上重叠、多打一次只读接口 —— 有意保留：那份"每次全量刷新"的语义还兼着修复
 *   被 `loadModels(pid)` 换成单平台清单的共享缓存，不能为了省一次请求把它改成 ensure*。
 */
async function warmUpBusinessData() {
  try {
    await waitForBackend();
    await useLicenseStore().init();
    const platformStore = usePlatformStore();
    const agentStore = useAgentStore();
    await Promise.allSettled([
      platformStore.ensurePlatforms(),
      platformStore.ensureModels(),
      agentStore.ensureAgents(),
    ]);
  } catch {
    // 预热失败不阻塞主应用：下拉展开时会再兜一次（见 ChatInputArea 的 ensure*）
  }
}

// 激活成功后补跑插件层：授权页拿不到 /plugins，激活后必须重新拉一次（见 bootPluginLayer 注释）
// ★ 业务清单同理：未激活时 /platforms 也是 403（冷启动那轮 `ensure*` 注定空手而归），
//   所以激活后必须连模型/智能体清单一起补拉，否则用户激活完还得手动进平台页。
const licenseStore = useLicenseStore();
watch(() => licenseStore.verified, (now, before) => {
  if (now && !before) {
    void bootPluginLayer();
    void warmUpBusinessData();
  }
});

// 布局切换或插件清单变化时重新解析
watch(() => [settingsStore.settings.layout, pluginStore.layouts], resolvePluginLayout, { deep: true });

// 插件运行中启用/禁用（如插件管理页开启 ops-shell）→ 即时同步动态路由，
// 否则 sidebar 已出现菜单入口但路由未注册，点击就是空白页
watch(() => pluginStore.routes, () => {
  void syncPluginRoutes();
}, { deep: true });


function toggleTheme() {
  settingsStore.update({ darkMode: !settingsStore.settings.darkMode });
}

const ROUTE_TITLES: Record<string, string> = {
  home: '首页',
  chat: '任务',
  'chat-hub': '消息',
  peers: '客户端节点',
  memory: '记忆管理',
  plugins: '插件管理',
  'data-sources': '数据源',
  ontologies: '本体管理',
  'sql-console': 'SQL 控制台',
  connections: 'IM 连接',
  knowledge: '知识库',
  browser: '浏览器',
  models: '模型平台',
  tools: '工具与连接',
  skills: 'Skill 商店',
  distill: 'Skill 蒸馏',
  agents: '智能体',
  'agent-canvas': '智能体画布',
  'platform-detail': '平台详情',
  'skill-detail': 'Skill 详情',
  code: '代码',
  settings: '设置',
  login: '登录',
};

const pageTitle = computed(() => {
  const name = typeof route.name === 'string' ? route.name : '';
  return ROUTE_TITLES[name] || '日常办公助手';
});

authStore.loadUser();

// ===== 按模式记忆会话与智能体（用户拍板 2026-09-16：办公/代码互切要切会话+切智能体）=====
// 每个模式各记一份「当前会话 + 当前智能体」；切模式时旧模式存档、新模式恢复（没有存档则开新任务草稿）。
// 注意：只切视图上下文，不新建会话、不清消息（决策 10 契约仍然成立——切换的是「回到哪个会话」）。
{
  const { activeMode } = modeModule;
  const agentStore = useAgentStore();
  const codeStore = useCodeStore();
  const CTX_KEY = 'yz:mode:ctx';
  type ModeCtx = Record<string, { conv: string; agent: string }>;
  const readCtx = (): ModeCtx => { try { return JSON.parse(localStorage.getItem(CTX_KEY) || '{}') as ModeCtx; } catch { return {}; } };
  const writeCtx = (c: ModeCtx) => { try { localStorage.setItem(CTX_KEY, JSON.stringify(c)); } catch { /* ignore */ } };

  watch(activeMode, async (m, old) => {
    if (!old || old === m) return;
    // 1) 旧模式存档：当前会话 + 当前智能体
    const ctx = readCtx();
    ctx[old] = { conv: chatStore.currentConvId || '', agent: agentStore.selectedId || '' };
    writeCtx(ctx);
    // 2) 新模式恢复：智能体先行
    // dev → 代码编写助手；wf → 工作流助手（工作流模式的 AI 形态宿主，负责补参/调工作流/解读结果）；
    // clip → 剪辑师；shop → 店铺运营助手（选品/经营人格，工具面与店铺任务对齐）；
    // 其余模式回落日常办公助手。缺了对应分支的话，进该模式只能绑「日常办公助手」+
    // 场景提示词，人格与职责对不上（助手不知道该去调工作流/该怎么剪/该怎么算利润）。
    const saved = ctx[m];
    const fallbackAgent =
      m === 'dev' ? 'a_builtin_code_agent'
        : m === 'wf' ? 'a_builtin_workflow_assistant'
          : m === 'clip' ? 'a_builtin_clip_agent'  // 剪辑模式：剪辑师（人格/工具面与剪辑任务对齐）
            : m === 'shop' ? 'a_builtin_shop_agent'  // 店铺运营模式：口径先行 + compare_products 选品
              : 'a_default_assistant';
    const agentId = saved?.agent || fallbackAgent;
    // syncConv=false：此刻 currentConvId 还停在旧模式会话上，回写会把新模式智能体
    // 绑进旧会话（实测把 a_builtin_code_agent 写进办公会话 → 切回办公助手"串"）。
    // 恢复的会话有自己的 agentId 绑定，第 4 步 selectConv 后由 applyConvAgent 接管。
    if (agentId && agentStore.agents.some((a) => a.id === agentId) && agentStore.selectedId !== agentId) {
      chat.onAgentSwitch(agentId, false);
    }
    // 3) ★ 先按新模式重载会话列表，再做归属判断。
    //
    // 为什么必须先重载：`conversations` 里装的还是**上一个模式**的列表
    // （loadConversations 按 mode 过滤，切模式前没重新拉过）。不重载的话，
    // 下面的 find 会拿旧列表去找新模式的会话 —— 找不到倒也罢了，
    // 更糟的是若存档里恰好存着一个别的模式的 convId，就会被"恢复"进新模式的界面。
    await chatStore.loadConversations();

    // 4) 会话：有存档、存在、且**确实是本模式的** → 恢复；否则开该模式的草稿。
    const convId = saved?.conv || '';
    const savedConv = convId ? chatStore.conversations.find((c) => c.id === convId) : undefined;
    // 归属校验两道：
    //   a) mode 必须等于当前模式（会话按模式隔离；迁移后存量会话都归 office）
    //   b) dev 还必须属于当前项目空间（防止历史脏数据把办公会话带进开发模式）
    const belongs =
      !!savedConv &&
      (savedConv.mode || 'office') === m &&
      (m !== 'dev' || savedConv.spaceId === codeStore.projectSpaceId);
    if (belongs) {
      await chat.selectConv(convId);
    } else {
      await chat.startNewChat(m === 'dev' ? codeStore.projectSpaceId : undefined);
    }
  });
}
</script>

<style>
@import './styles/tokens.css';
@import './styles/skin.css';
@import './styles/motion.css';
@import './styles/overlay.css';
@import './styles/menu.css';
@import './styles/surface.css';
@import './styles/task-row.css';

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { height: 100%; }

body {
  font-family: var(--font-body);
  font-size: clamp(14px, 1vw + 8px, 16px);
  color: var(--color-text);
  background: var(--color-bg);
  overflow: hidden;
}


.app-shell { display: flex; flex-direction: column; height: 100%; position: relative; overflow: hidden; }
.app-body { flex: 1; display: flex; overflow: hidden; min-height: 0; }

/* ===== 桌面端专属布局：CSS 变量驱动侧栏宽度联动、固定字号、实色背景、紧凑密度 ===== */
/* web/mobile 因 html,body,#app{height:100%} 仍正确铺满；高度从 100vh/dvh 改为 100% 以兼容桌面端被 flex 父容器包裹 */
.platform-desktop.app-shell {
  font-size: 14px;                /* 覆盖 body 的 clamp 流体字号，桌面端固定 */
  background: var(--color-bg);    /* 实色背景，确保无玻璃透出 */
}
.platform-desktop .main-content {
  margin-left: 0;                 /* 桌面端竖排 SideNav 已退役（导航上移标题栏），主区全宽 */
  padding-right: 0;
}
.platform-desktop .page { padding: 20px 24px; }

/* ===== Web 端专属布局：WebTopBar 在外层（apps/web/src/App.vue）接管主导航，
       此处只负责让 main-content 顶部避开 36px 顶栏，并清掉原来的 52px SideNav 留位 ===== */
.platform-web.app-shell { --titlebar-h: 36px; }
.platform-web .main-content {
  margin-left: 0;                 /* web 端 SideNav 已退役（导航上移 WebTopBar），主区全宽 */
  padding-right: 0;
  padding-top: var(--titlebar-h); /* 顶部让出 36px 给外层 WebTopBar */
}
.platform-web .page { padding-top: 24px; }  /* 主区已抬出 --titlebar-h，page 内顶部留 24px，避免与原 28px 叠加 */
.platform-desktop .page-title { font-size: 18px; }
.platform-desktop .card-grid {
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
.platform-desktop .card-grid-sm {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

.main-content { flex: 1; overflow: hidden; position: relative; z-index: 1; margin-left: 52px; padding-right: 52px; display: flex; flex-direction: column; min-height: 0; }
.main-content.full { overflow: visible; margin-left: 0; }
/* 可滚动页面：.page 自管滚动 */
.page { padding: 28px 36px; flex: 1; overflow-y: auto; }

/* Mobile TopBar
   ★ 样式不再只挂 @media：模板用 v-if="mobileShellAsRoot"（平台判定）控制存在性，
     元素在桌面端根本不会渲染。Capacitor 横屏时视口 >767px，媒体查询不命中 →
     元素渲染了却停在 display:none，即「转横屏后自绘顶栏消失」。故与 TabBar 同理，
     样式与存在性判定保持一致，不再重复用宽度门控。

   ★★ 高度与底部 TabBar 统一走变量，供 .main-content 留白消费（此前是三处写死：
      顶栏 48 / TabBar 56 / 留白 calc(48px) 与 calc(56px)，改一处漏两处）。
      顶栏从 48 → 44：移动端顶栏只放标题+两个图标，44px 已达触控舒适上限；
      省下的 4px 让首屏多显示小半行消息。 */
.app-shell { --mobile-topbar-h: 44px; --mobile-tabbar-h: 56px; }

.mobile-topbar {
  display: flex;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--mobile-topbar-h);
  padding: 0 12px;
  padding-top: env(safe-area-inset-top, 0px);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border-bottom: 1px solid var(--glass-border);
  z-index: 50;
  align-items: center;
  gap: 8px;
}

.mobile-topbar-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-topbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* 顶栏图标按钮：44×44 触控区（视觉 30px 图标底），与 TabBar 项观感一致 */
.mobile-icon-btn {
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.mobile-icon-btn:hover, .mobile-icon-btn:active {
  background: var(--glass-bg-hover);
  color: var(--color-text);
}

.mobile-user-avatar {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--color-primary-light), color-mix(in srgb, var(--color-primary) 8%, transparent));
  color: var(--color-primary);
  cursor: pointer;
  user-select: none;
}

/* 本机身份头像：中性灰底（不用主题色 —— 主题色实底是"可点的登录入口"语义）。
   仅 hover 提亮，表明它是个可点开的菜单而不是状态指示。与 WebTopBar 的
   `.title-avatar.is-local` 同一形态（两端都是本机单机端，形态必须一致）。 */
.mobile-user-avatar.is-local {
  background: var(--glass-bg-hover, rgba(15, 23, 42, 0.06));
  color: var(--color-text-secondary);
}
.mobile-user-avatar.is-local:active {
  background: var(--glass-bg-active, rgba(15, 23, 42, 0.1));
  color: var(--color-text-primary, #0f172a);
}

/* ===== 页面切换进场动画（原 slide-fade 过渡的替代，见 router-view 处注释）=====
   ★ 为什么用 animation 而不是 transition：transition 需要一段 "active" 期，而页面的换入换出
     本来就该立刻完成 —— 过渡那套状态机一旦停住，就是"旧视图已摘掉、新视图永远不来"的
     永久空白（用户实报的黑屏，且不抛任何异常）。animation 在元素插入时自己跑，
     不需要任何回调来推进，也就没有能卡住的中间态。
   ★ 为什么只动 transform、绝不动 opacity：动画帧被系统掐掉时（窗口被遮挡/最小化、后台标签页）
     动画会停在 from 那一帧；只要 from 里没有 opacity，停住的最坏情况也只是"页面下沉一点点"，
     绝不会变成一块看不见的黑。这条是那两次黑屏事故换来的铁律，改这里之前先看 router-view 注释。
   ★ 幅度与时长（2026-10-16 用户反馈「切换是好了，就是少了点过渡」后调过一次）：
     位移 6px→10px、加一点 scale、时长 0.16s→0.2s，进场感明显一些但仍不拖沓。
     ★ 别再加回去：scale 不要小于约 0.99（再小就是肉眼可辨的"缩一下"），也永远不要 opacity。 */
.main-content > * { animation: yz-page-in 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes yz-page-in {
  from { transform: translateY(10px) scale(0.994); }
  to { transform: translateY(0) scale(1); }
}

/* Global Element Plus overrides */
.el-button { font-weight: 500; letter-spacing: 0.01em; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.el-button:hover { filter: brightness(1.03); }
.el-button:active { filter: brightness(0.97); }
.el-button:not(.el-button--text):not(.el-button--primary):not(.el-button--success):not(.el-button--warning):not(.el-button--danger) {
  background: var(--btn-bg); border-color: transparent;
}
.el-button:not(.el-button--text):not(.el-button--primary):not(.el-button--success):not(.el-button--warning):not(.el-button--danger):hover {
  background: var(--btn-bg-hover); border-color: var(--btn-border);
}

/* Modernize el-button loading spinner: brand-color stroke + dash animation + rounded caps */
.el-button .el-loading-spinner {
  width: 18px; height: 18px;
}
.el-button .el-loading-spinner .circular {
  stroke: currentColor;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 90 150;
  stroke-dashoffset: 0;
  animation: btn-rotate 1s linear infinite, btn-dash 1.4s ease-in-out infinite;
}
@keyframes btn-rotate { to { transform: rotate(360deg); } }
@keyframes btn-dash {
  0%   { stroke-dasharray: 1 150; stroke-dashoffset: 0; }
  50%  { stroke-dasharray: 90 150; stroke-dashoffset: -35; }
  100% { stroke-dasharray: 90 150; stroke-dashoffset: -124; }
}
/* dim the inner mask slightly so the spinner pops */
.el-button.is-loading::before { background-color: var(--el-mask-color); opacity: 0.4; }

.el-button:focus-visible, .el-input__wrapper:focus-within, .el-select .el-input__wrapper:focus-within {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Cards */
.glass-card {
  background: var(--glass-bg); backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  transition: border-color 0.2s ease;
}
.glass-card:hover { border-color: var(--glass-border-strong); }

/* Mobile theme toggle（此前被误包进 Firefox-only @supports，移出修复其永不生效的 bug） */
.mobile-theme-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--btn-bg);
  color: var(--color-text-secondary);
  cursor: pointer;
  user-select: none;
  transition: background-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard);
}
.mobile-theme-btn:hover {
  background: var(--btn-bg-hover);
  color: var(--color-text);
}
/* 滚动条已统一收敛至 styles/surface.css */

/* Skeleton shimmer */
.skeleton-shimmer {
  background: linear-gradient(90deg,
    var(--glass-border) 25%,
    var(--glass-bg-hover) 50%,
    var(--glass-border) 75%
  ) !important;
  background-size: 200% 100% !important;
  animation: shimmer 1.5s infinite !important;
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* ===== Global page layout classes ===== */

.page-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 24px; gap: 16px;
}
.page-title { font-size: 22px; font-weight: 700; }
.page-sub { font-size: 13px; color: var(--color-text-secondary); }

/* Card grids — pages use class="card-grid" / class="card-grid-sm" in template */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
}
.card-grid-sm {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

/* ===== Mobile: skeleton + global overrides =====
   ★ 选择器口径说明（2026-09-20 修正）：
     · `.platform-mobile` —— Capacitor 端。自绘顶栏(48) + 底部 TabBar(56) 的**内容区留白**
       只归它管，且不挂媒体查询（横屏视口宽时同样要生效）。
     · `@media (max-width:767px)` —— 桌面/Web 的窄窗降级。**只管内容本身的紧凑化**
       （页面内边距、卡片列数、弹窗），不再替「移动外壳」留白。
   ⚠️ 曾经的错误做法：媒体查询里也给 `.main-content` 加 48px 顶 + 56px 底留白。
     但桌面/Web 端窄窗口根本不渲染 mobile-topbar / TabBar（它们是 Capacitor 专属）→
     顶部多留 48px 白、底部多留 56px 白，而真正提供导航的 WebTopBar 只有 36px。
   注意每条规则都带 !important（原有约定），跨分支复制时必须保持一致，否则优先级会打架。 */
@media (max-width: 767px) {
  .app-shell { flex-direction: column; }
  /* 窄窗一律禁止横向溢出（各端通用） */
  html, body, #app, .app-shell, .main-content { max-width: 100vw; overflow-x: hidden; }

  /* Global layout classes — compact */
  .page { padding: 14px !important; }
  .page-header { flex-direction: column; align-items: stretch; gap: 8px; margin-bottom: 14px; }
  .page-title { font-size: 18px; }
  .card-grid, .card-grid-sm { grid-template-columns: 1fr; gap: 12px; }

  /* Dialogs: narrow-viewport bottom sheet (spec「移动端弹窗规范」——窄屏不用桌面居中大对话框；
     48/56 为弹窗避让自绘顶栏/TabBar 的字面值，勿改成内容区留白)。
     保持 Element 的 el-overlay-dialog fixed+flex：el-dialog 用 absolute + 静态位定位，
     align-items: flex-end 把对话框压到底部（贴底圆角顶），ElMessageBox（确认框）不受影响 */
  .el-overlay { z-index: 9999 !important; overflow-y: auto !important; padding: 0 !important; }
}

/* Capacitor 端：自绘顶栏 + 底部 TabBar 的内容区让位。
   ★ 不挂媒体查询 —— 横屏时视口宽，媒体查询不命中，只有这里能兜住。
   ★★ 高度一律走 .app-shell 上的变量（--mobile-topbar-h / --mobile-tabbar-h），
      与 .mobile-topbar / .tab-bar 自身的 height 同源 —— 三处写死高度是此前
      「改一处漏两处、留白对不上」的根因。 */
.platform-mobile .app-shell { flex-direction: column; }
.platform-mobile .main-content {
  margin-left: 0 !important;
  padding: 0 !important;
  padding-top: calc(var(--mobile-topbar-h, 44px) + env(safe-area-inset-top, 0px)) !important;
  padding-bottom: calc(var(--mobile-tabbar-h, 56px) + env(safe-area-inset-bottom, 0px)) !important;
}
/* 对话页（is-chat）在移动端**同样需要底部留白**（给 TabBar 让位）。
   ★★ 这里曾写 `padding-bottom: 0`，代价是 chat.css 只能用
   `.input-area { position: sticky; bottom: 56px }` 把输入框硬抬起来 ——
   而 sticky 是「相对滚动容器吸附」，输入框因此**与消息区重叠 56px**，
   再用 `.messages { padding-bottom: 140px }` 打补丁。两层补丁叠着，
   表现为「滚到底后最后一条消息上方多出一大截空白（实测 94px）」
   且输入框浮在内容上（用户报的「输入框挡住内容」）。
   正解：底部留白交给外壳统一给，chat.css 里输入框回归静态流。
   顶部仍为 0：对话页有自己的 chat-topbar，不需要外壳再让一次。 */
.platform-mobile .main-content.is-chat {
  padding-top: env(safe-area-inset-top, 0px) !important;
  padding-bottom: calc(var(--mobile-tabbar-h, 56px) + env(safe-area-inset-bottom, 0px)) !important;
}
/* 四段式骨架页（meta.mobilePageShell，如 /settings 示范页）：壳顶栏不渲染，
   顶部让位改由页面自己的 .mps-header 承担（其自带 safe-area 内边距） */
.platform-mobile .main-content.no-shell-topbar {
  padding-top: env(safe-area-inset-top, 0px) !important;
}
.platform-mobile .main-content.full {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
.platform-mobile { max-width: 100vw; overflow-x: hidden; }

/* ★ Capacitor 端：顶栏已显示当前页名（如「设置」），而页面里还有自己的
   <h2 class="page-title">（Settings.vue 的「设置」）→ 同屏两个一模一样的标题，白占一行。
   移动端顶栏承担定位职责后，页内大标题是冗余的 —— 整个隐藏。
   ★ .page-sub（副标题）保留：它是有信息量的说明文字，不是重复。 */
.platform-mobile .page-title { display: none; }

@media (max-width: 767px) {
  .el-overlay-dialog { display: flex !important; justify-content: center !important; align-items: flex-end !important; padding-top: calc(48px + env(safe-area-inset-top, 0px)) !important; padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px)) !important; }
  .el-dialog {
    z-index: 9999 !important;
    position: absolute !important;
    width: 92vw !important;
    /* 贴底弹层：圆角只在顶部（与 ActionSheet 同一形态语言） */
    border-radius: var(--radius-lg) var(--radius-lg) 0 0 !important;
    max-width: calc(100vw - var(--yz-right-w, 0px) - 24px) !important;
    margin: 0 !important;
    max-height: calc(100dvh - 48px - env(safe-area-inset-top, 0px) - 56px - env(safe-area-inset-bottom, 0px) - 8px);
    display: flex !important; flex-direction: column !important;
    background: var(--el-bg-color) !important;
    -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
  }
  .mount-dialog .el-dialog,
  .skill-mount-dialog .el-dialog,
  .snapshot-dialog .el-dialog,
  .agent-edit-dialog .el-dialog {
    width: 92vw !important;

  }
  .el-dialog__header { background: var(--el-bg-color) !important; border-bottom: 1px solid var(--el-border-color-lighter); }
  .el-dialog__body { flex: 1; overflow-y: auto; padding: 12px 16px; background: var(--el-bg-color) !important; }
  .el-dialog__footer { display: flex; flex-direction: row; flex-wrap: nowrap; justify-content: flex-end; gap: 8px; flex-shrink: 0; padding: 10px 16px 14px; background: var(--el-bg-color) !important; }
  .el-dialog__footer .el-button { flex-shrink: 0; white-space: nowrap; }

  /* Prevent overflow */
  .el-card, .el-form, .el-table { max-width: 100%; overflow-x: auto; }

  /* Forms */
  .el-form-item:not(.el-form-item--small) { flex-direction: column; align-items: flex-start; margin-bottom: 14px; }
  .el-form-item:not(.el-form-item--small) .el-form-item__label { width: 100% !important; text-align: left !important; padding-bottom: 4px; line-height: 1.4; font-size: 13px; }
  .el-form-item:not(.el-form-item--small) .el-form-item__content { width: 100% !important; margin-left: 0 !important; }
  .el-form-item .el-input-number, .el-form-item .el-select { width: 100% !important; }

  /* Toast */
  .el-message { top: 8px !important; left: 50% !important; transform: translateX(-50%) !important; min-width: auto !important; max-width: 90vw !important; }
  .el-select-dropdown { max-height: 50vh !important; }

  /* Finger-friendly controls on touch screens */
  .el-input__wrapper,
  .el-select__wrapper { min-height: 40px; }
  .el-button:not(.el-button--small):not(.el-button--text) { min-height: 40px; }
  .el-radio, .el-checkbox { min-height: 28px; }

  /* Solid page background */
  .page { background: var(--color-bg); }

  /* Solid glass-tabs on mobile (used by Settings) */
  .glass-tabs { background: var(--el-bg-color) !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; border: 1px solid var(--el-border-color-lighter); }
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .dock-btn { background: var(--glass-bg); }
}

/* ===== add-card global ===== */
.add-card, .marketplace-card.add-card {
  border: 1.5px dashed var(--glass-border);
  background: rgba(255,255,255,0.25);
  cursor: pointer; transition: all 0.2s;
}
.add-card:hover, .marketplace-card.add-card:hover {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 5%, transparent);
}
.add-card-content {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 8px; padding: 16px 0;
  color: var(--color-text-secondary);
}
.add-card-text { font-size: 14px; }

/* Action buttons: normal text buttons on desktop, mobile turns them into a 48px FAB */
.fab-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
@media (max-width: 767px) {
  .fab-add {
    position: fixed;
    right: 16px;
    bottom: calc(56px + 12px + env(safe-area-inset-bottom, 0px));
    z-index: 80;
    width: 48px;
    height: 48px;
    padding: 0;
    border-radius: 50%;
    font-size: 0;
    box-shadow: 0 4px 16px color-mix(in srgb, var(--color-primary) 45%, transparent);
  }
  .fab-add .el-icon {
    font-size: 18px;
    margin: 0;
  }
}

/* ===== Electron 桌面端：VS Code 风格 ===== */
/* 标题栏 32px 高，SideNav 通过 --titlebar-h 变量从标题栏下方开始 */
.is-electron.app-shell {
  --titlebar-h: 32px;
}
/* VS Code 风格：紧凑间距、桌面字体、原生滚动条 */
.is-electron .app-body {
  flex: 1; display: flex; overflow: hidden;
  font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif;
  font-size: 13px; /* 桌面端固定 13px，不用 clamp 流体字号 */
}

/* 紧凑间距：减小 padding/margin */
.is-electron .page { padding: 16px 20px; }
.is-electron .main-content { padding-right: 0; }
.is-electron .page-header { margin-bottom: 16px; }
.is-electron .page-title { font-size: 16px; }
.is-electron .card-grid { gap: 12px; }
.is-electron .card-grid-sm { gap: 8px; }

/* 背景统一走 --color-bg（跟随 tokens.css 深浅色 + 皮肤壁纸），不再各自为政 */
.is-electron [data-theme="dark"] .app-shell {
  background: var(--color-bg);
}
.is-electron [data-theme="dark"] .app-body {
  background: var(--color-bg);
}
.is-electron [data-theme="dark"] .main-content {
  background: var(--color-bg);
}

/* 浅色主题背景 */
.is-electron :root:not([data-theme="dark"]) .app-shell {
  background: var(--color-bg);
}
.is-electron :root:not([data-theme="dark"]) .app-body {
  background: var(--color-bg);
}

.local-model-download-body { display: flex; flex-direction: column; gap: 10px; }
.local-model-download-title { font-size: var(--font-size-lg); font-weight: 600; color: var(--color-text); }
.local-model-download-desc { font-size: var(--font-size-base); line-height: 1.55; color: var(--color-text-secondary); }
.local-model-download-message { min-height: 20px; font-size: var(--font-size-sm); color: var(--color-text-secondary); word-break: break-all; }
</style>
