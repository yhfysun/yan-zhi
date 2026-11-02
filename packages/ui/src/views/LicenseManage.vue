<!--
  LicenseManage.vue — 授权管理页（已激活状态下从「更多」菜单进入）

  与 License.vue 的分工：
    · License.vue       = 授权**激活**页（未授权时被路由守卫拦到这里，主要动作是输入码激活）
    · LicenseManage.vue = 授权**管理**页（已激活后看版本档位 / 可用模式 / 时效，并可换码）

  ★ 本页**不展示授权码，也不展示机器标识**（用户拍板）：
    授权码：能看就能被抄走转用，索性不上屏；用户要换码只需粘贴新的，不需要看到旧的。
    机器标识：同样属于不该外露的设备指纹，不上屏。
    因此本页只呈现「授权状态类」信息（档位 / 模式 / 时效），不含任何可被复制的凭据。
    → 连带影响：用户无法从界面自助获取机器标识，签发方也就无法按机器绑定授权码。
      档位授权（lite/basic/pro）不依赖机器标识，不受影响。

  布局（2026-11-02，P1-2）：左侧分组列表 + 右侧详情容器，宽屏可拖拽；窄屏列表横向排列。
-->
<template>
  <PageFrame title="授权管理" subtitle="查看当前授权状态，或更换授权码" :scroll="false" :pad="false">
    <div class="lic-body">
      <aside class="lic-nav" :style="{ width: wide ? navW + 'px' : '' }">
        <button
          v-for="s in sections"
          :key="s.key"
          type="button"
          class="lic-nav-item"
          :class="{ active: activeSection === s.key }"
          @click="activeSection = s.key"
        >
          <el-icon :size="15"><component :is="s.icon" /></el-icon>
          <span>{{ s.label }}</span>
        </button>
      </aside>
      <div v-if="wide" class="rs-handle" @mousedown="navR.startDrag($event, 'left')"></div>

      <section class="lic-detail">
        <!-- 当前授权状态：只放状态类信息，不含凭据 -->
        <div v-if="activeSection === 'current'" class="card">
          <div class="card-head">
            <span class="card-title">当前授权</span>
            <span :class="['state-chip', licenseStore.verified ? 'is-ok' : 'is-bad']">
              {{ licenseStore.verified ? '已激活' : '未激活' }}
            </span>
          </div>

          <div class="rows">
            <div class="row">
              <span class="k">版本档位</span>
              <span class="v">{{ editionText || '—' }}</span>
            </div>
            <div class="row">
              <span class="k">可用模式</span>
              <span class="v">
                <template v-if="modeLabels.length">
                  <span v-for="m in modeLabels" :key="m" class="mode-tag">{{ m }}</span>
                </template>
                <template v-else>—</template>
              </span>
            </div>
            <div class="row">
              <span class="k">到期时间</span>
              <span class="v">{{ expireText }}</span>
            </div>
            <div class="row">
              <span class="k">激活时效</span>
              <span class="v" :class="'remain-' + remainLevel">{{ remainText || '永不过期' }}</span>
            </div>
          </div>

          <p v-if="!licenseStore.verified && reasonText" class="reason">{{ reasonText }}</p>
        </div>

        <!-- 更换授权码 -->
        <div v-else class="card">
          <div class="card-head">
            <span class="card-title">更换授权码</span>
          </div>
          <p class="hint">
            粘贴新授权码后激活。新码的版本档位会立即生效，无需重启。
          </p>
          <el-input
            v-model="newCode"
            type="textarea"
            :rows="4"
            placeholder="粘贴新的授权码"
            resize="none"
            class="code-input"
          />
          <div class="form-actions">
            <el-button
              type="primary"
              :loading="swapping"
              :disabled="!newCode.trim()"
              @click="swap"
            >更换授权码</el-button>
          </div>
          <p v-if="error" class="error">{{ error }}</p>
        </div>
      </section>
    </div>
  </PageFrame>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Key, SwitchButton } from '@element-plus/icons-vue';
import PageFrame from '../components/common/PageFrame.vue';
import { useResizable } from '../composables/useResizable';
import { useLicenseStore, EDITION_LABELS } from '../stores/license';
import { allModeDefs } from '../stores/mode';

const licenseStore = useLicenseStore();

const newCode = ref('');
const swapping = ref(false);
const error = ref('');

// ===== 左侧分组（P1-2）=====
type SectionKey = 'current' | 'swap';
const sections: Array<{ key: SectionKey; label: string; icon: unknown }> = [
  { key: 'current', label: '当前授权', icon: Key },
  { key: 'swap', label: '更换授权码', icon: SwitchButton },
];
const activeSection = ref<SectionKey>('current');

const wide = ref(typeof window !== 'undefined' ? window.innerWidth >= 900 : true);
function syncWide() { wide.value = window.innerWidth >= 900; }
onMounted(() => window.addEventListener('resize', syncWide));
onUnmounted(() => window.removeEventListener('resize', syncWide));
const navR = useResizable('license_nav', 220, 160, 360);
const { width: navW } = navR;

/** 模式 key → 中文名（复用模式定义，含运行时插件模式；找不到就原样显示 key）。 */
function modeLabelOf(key: string): string {
  const d = allModeDefs.value.find((x) => x.key === key);
  return d ? d.label.replace(/模式$/, '') : key;
}

const editionText = computed(() => {
  const ed = licenseStore.edition || licenseStore.buildEdition;
  if (!ed) return '';
  const label = EDITION_LABELS[ed] || ed;
  // 构建档与授权档不同时（如 pro 包 + basic 码）两个都标出来，避免只看一个数产生误解
  if (licenseStore.buildEdition && licenseStore.edition && licenseStore.buildEdition !== licenseStore.edition) {
    return `${label}（${ed}）· 包为 ${EDITION_LABELS[licenseStore.buildEdition] || licenseStore.buildEdition}`;
  }
  return `${label}（${ed}）`;
});

const modeLabels = computed(() =>
  (licenseStore.info?.modes || []).map(modeLabelOf),
);

const expireText = computed(() => {
  const e = licenseStore.info?.expireAt;
  if (!e) return licenseStore.verified ? '永不过期' : '—';
  return new Date(e).toLocaleString('zh-CN', { hour12: false });
});

const reasonText = computed(() => licenseStore.info?.reason || '');

/** 剩余有效期展示：把「还有多少天」算出来，临近到期时给颜色提示。
 *  纯前端展示，判断依据仍是后端返回的 expireAt（时钟差异不影响授权判定）。 */
const remainText = computed(() => {
  const e = licenseStore.info?.expireAt;
  if (!e) return '';
  const ms = new Date(e).getTime() - Date.now();
  if (Number.isNaN(ms)) return '';
  if (ms <= 0) return '已过期';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days >= 1) return `剩余 ${days} 天`;
  if (hours >= 1) return `剩余 ${hours} 小时`;
  return '不足 1 小时';
});

/** 剩余有效期紧急程度：<=7 天标橙、已过期标红，用于给数值上色。 */
const remainLevel = computed(() => {
  const e = licenseStore.info?.expireAt;
  if (!e) return 'none';
  const ms = new Date(e).getTime() - Date.now();
  if (Number.isNaN(ms)) return 'none';
  if (ms <= 0) return 'expired';
  if (ms <= 7 * 86400000) return 'soon';
  return 'ok';
});

async function swap() {
  error.value = '';
  swapping.value = true;
  const ok = await licenseStore.activate(newCode.value.trim());
  swapping.value = false;
  if (ok) {
    // 换码成功：模式可见性已由 license store 同步给 mode store，本页数值随响应式自动刷新
    newCode.value = '';
  } else {
    error.value = licenseStore.error || '更换失败';
  }
}

onMounted(async () => {
  // 直接进本页时 store 可能还没初始化（守卫会 init，但 mock/热重载下不一定）
  if (!licenseStore.initialized) {
    try { await licenseStore.init(); } catch { /* 接口不可用不阻塞渲染 */ }
  }
});
</script>

<style scoped>
.lic-body { flex: 1; min-height: 0; display: flex; }
.lic-nav {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 8px;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
  overflow-y: auto;
}
.lic-nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 38px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.lic-nav-item:hover { background: var(--glass-bg-hover); color: var(--color-text); }
.lic-nav-item.active {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
  font-weight: 600;
}
.lic-detail { flex: 1; min-width: 0; overflow-y: auto; padding: 20px 24px 28px; }
.card {
  max-width: 720px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 18px 20px;
}
.card-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 14px;
}
.card-title { font-size: 15px; font-weight: 600; color: var(--color-text); }

.state-chip {
  font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 99px;
}
.state-chip.is-ok { color: #16a34a; background: rgba(34, 197, 94, 0.12); }
.state-chip.is-bad { color: var(--color-danger); background: rgba(239, 68, 68, 0.12); }

.rows { display: flex; flex-direction: column; gap: 10px; }
.row { display: flex; align-items: baseline; gap: 12px; font-size: 13px; }
.row .k { flex: 0 0 76px; color: var(--color-text-secondary); }
.row .v { flex: 1; color: var(--color-text); }

.mode-tag {
  display: inline-block; margin-right: 6px; padding: 2px 8px;
  font-size: 12px; border-radius: 6px;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
}

/* 激活时效的紧急程度着色（仅展示用，不影响授权判定） */
.remain-ok { color: var(--color-text); }
.remain-soon { color: #d97706; font-weight: 600; }
.remain-expired { color: var(--color-danger); font-weight: 600; }

.hint { font-size: 12.5px; color: var(--color-text-secondary); margin-bottom: 12px; }
.code-input :deep(.el-textarea__inner) {
  font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.6;
}
.form-actions { margin-top: 12px; }
.reason { margin-top: 12px; font-size: 12.5px; color: var(--color-warning); }

@media (max-width: 899px) {
  .lic-body { flex-direction: column; }
  .lic-nav {
    flex-direction: row;
    border-right: none;
    border-bottom: 1px solid var(--color-border);
    overflow-x: auto;
  }
  .lic-nav-item { flex: 0 0 auto; }
  .lic-detail { padding: 16px; }
}
</style>
