<!--
  RouteFallback.vue —— 兜底页（路由表末尾 `/:pathMatch(.*)*`，2026-10-16 首次引入）

  ★ 为什么存在（用户实报「点到运维模式后切到别的模式还是黑屏、没有任何报错」）：
    无匹配路径时 `<router-view>` 什么都不渲染 —— 深色主题下内容区就是一整块黑，
    外壳（顶栏/侧栏）还在，控制台只有一条 `[Vue Router warn]: No match found for location
    with path "/ops"`。用户既看不到原因也退不出去，只能说是"黑屏卡住"。
    本页把这种状态换成人话 + 一个出口。

  ★ 两种成因、两套文案：
    1) 「插件层还没就绪」：/ops、/sec、/shop 是插件贡献的路由，冷启动要等插件清单拉到
       才 addRoute（见 router/index.ts 的 isFallbackRoute / recoverIfCurrentRouteUnmatched）。
       这种情况**不用用户做任何事**：路由注册完，守卫会自动把人带进真正的页面
       （本组件只补一句提示 + 一个手动重试）。
    2) 「确实没有这个地址」：插件被禁用、链接过期、手输错了 —— 给回对话的出口。
-->
<template>
  <div class="rf-page">
    <div class="rf-card">
      <el-icon class="rf-icon"><Loading v-if="syncing" /><Compass v-else /></el-icon>

      <h2 class="rf-title">{{ syncing ? '这个页面还在载入' : '没有这个页面' }}</h2>

      <p v-if="syncing" class="rf-desc">
        它由插件提供，插件清单还在加载中。<br />
        通常几秒内会自动进来；一直停在这里可以点「重试」。
      </p>
      <p v-else class="rf-desc">
        本应用里没有这个地址。可能是对应的插件未启用（运维 / 安全 / 店铺都是插件提供的），
        也可能是链接过期或输错了。
      </p>

      <p class="rf-path" :title="fullPath">{{ fullPath }}</p>

      <div class="rf-actions">
        <el-button type="primary" :loading="retrying" @click="retry">重试</el-button>
        <el-button @click="goChat">回到对话</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Compass, Loading } from '@element-plus/icons-vue';
import { arePluginRoutesSynced, whenPluginRoutesSynced } from '../router';

const route = useRoute();
const router = useRouter();

const fullPath = computed(() => route.fullPath || '/');
const syncing = ref(!arePluginRoutesSynced());
const retrying = ref(false);

/** 自动重进过的路径（模块级，跨组件实例）—— 重导航同一条路径必须有一次性闸门，
 *  否则「兜底页 → 重导航 → 仍是兜底页 → 又重导航」会转不出来。 */
const autoRetried = new Set<string>();

let alive = true;

onMounted(() => {
  if (arePluginRoutesSynced()) { void autoRetry(); return; }
  void whenPluginRoutesSynced().then(() => { if (alive) void autoRetry(); });
});

onUnmounted(() => { alive = false; });

/**
 * 插件路由已就绪 → 自动再走一次当前地址（这次能命中真正的页面）。
 *
 * ★ 这一步是「切到运维模式黑屏」的收尾：本次导航是在插件路由注册**之前**解析的
 *   （`to.matched` 早在 push 那一刻就定下了，后来 addRoute 不会重解析），所以它会一直
 *   停在这里。靠这次重导航才能真正进 /ops。
 *   同一个地址只自动试一次（见 autoRetried），之后交给用户点「重试」。
 */
async function autoRetry(): Promise<void> {
  if (!alive) return;
  const p = route.path;
  if (autoRetried.has(p)) { syncing.value = !arePluginRoutesSynced(); return; }
  autoRetried.add(p);
  // 先让这一帧画出来：进来就跳走的话用户看不到任何"正在载入"的反馈
  await nextTick();
  await router.replace({ path: route.path, query: route.query, hash: route.hash });
  // 还能执行到这里 = 重导航后又回到了兜底页 ⇒ 这条地址是真没有，切到"没有这个页面"文案
  if (alive) syncing.value = false;
}

/** 手动重试：等一次插件同步（上限 10s，避免接口挂了时按死）再重导航当前地址。
 *  replace 而非 push：用户是在修页面，不该往历史栈里再塞一条同样的地址。 */
async function retry(): Promise<void> {
  if (retrying.value) return;
  retrying.value = true;
  try {
    await Promise.race([
      whenPluginRoutesSynced(),
      new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
    ]);
    syncing.value = !arePluginRoutesSynced();
    await router.replace({ path: route.path, query: route.query, hash: route.hash });
  } finally {
    retrying.value = false;
  }
}

function goChat(): void {
  void router.push('/chat');
}

// 地址变了（用户改 hash / 别处再导航落回兜底）时重新判定文案
watch(() => route.fullPath, () => { syncing.value = !arePluginRoutesSynced(); });
</script>

<style scoped>
.rf-page {
  height: 100%; display: flex; align-items: center; justify-content: center;
  padding: 24px; color: var(--color-text);
}
.rf-card {
  max-width: 460px; text-align: center; display: flex; flex-direction: column;
  align-items: center; gap: 10px;
  padding: 28px 26px; border-radius: var(--radius-lg, 14px);
  background: var(--glass-bg); border: 1px solid var(--glass-border);
}
.rf-icon { font-size: 30px; color: var(--color-text-tertiary); }
.rf-title { font-size: var(--font-size-md, 14px); font-weight: 600; margin: 0; }
.rf-desc {
  font-size: var(--font-size-sm, 12px); line-height: 1.7; margin: 0;
  color: var(--color-text-secondary);
}
.rf-path {
  font-family: var(--font-mono, monospace); font-size: 11px; margin: 0;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--color-text-tertiary);
  background: var(--el-fill-color-lighter); border-radius: 6px; padding: 2px 8px;
}
.rf-actions { display: flex; gap: 8px; margin-top: 6px; }
</style>
