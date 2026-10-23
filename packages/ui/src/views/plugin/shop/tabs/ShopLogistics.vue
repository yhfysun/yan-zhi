<template>
  <div class="shop-tab-body">
    <div class="shop-card" v-if="shop">
      <div class="shop-card-head">
        <h3>{{ shop.shopName }}</h3>
        <el-tag size="small" type="success" effect="plain">物流</el-tag>
      </div>
      <dl class="shop-kv">
        <div><dt>服务商</dt><dd>{{ info?.label || shop.platform }}</dd></div>
        <div><dt>服务范围</dt><dd>{{ shop.site || '—' }}</dd></div>
        <div><dt>凭据</dt><dd>{{ shop.hasSecret ? '已配置' : '未配置（物流接口需要 appKey/appSecret）' }}</dd></div>
        <div><dt>客户端</dt><dd>{{ ready ? '已接（可查真实轨迹）' : '未接（当前只能登记）' }}</dd></div>
      </dl>

      <div class="shop-logi">
        <div class="shop-logi-row">
          <el-button size="small" :loading="busy" :disabled="!ready" @click="runTest()">测试连接</el-button>
          <span v-if="!ready" class="shop-form-tip">该服务商客户端未接，当前只能登记。</span>
          <span v-else-if="probe" class="shop-logi-note" :class="probe.ok ? 'ok' : 'err'">
            {{ probe.ok ? '✓' : '✗' }} {{ probe.message }}
          </span>
        </div>

        <template v-if="ready">
          <div class="shop-logi-row">
            <el-input v-model="trackNo" size="small" class="shop-logi-input" placeholder="运单号（顺丰 SF… / 云途 YT…）" @keyup.enter="runTrack()" />
            <el-input v-model="trackPhone" size="small" class="shop-logi-phone" placeholder="手机后四位（选填）" />
            <el-button size="small" type="primary" plain :loading="busy" :disabled="!trackNo.trim()" @click="runTrack()">查轨迹</el-button>
          </div>
          <div v-if="trackResult" class="shop-logi-result" :class="trackResult.ok ? 'ok' : 'err'">
            <p class="shop-logi-result-head">
              {{ trackResult.message || (trackResult.ok ? '已返回轨迹' : `查询失败${trackResult.step ? `（${trackResult.step}）` : ''}`) }}
            </p>
            <ul v-if="trackResult.events.length" class="shop-logi-events">
              <li v-for="(e, i) in trackResult.events" :key="i">
                <span class="shop-logi-time">{{ e.time }}</span>
                <span v-if="e.location" class="shop-logi-loc">{{ e.location }}</span>
                <span class="shop-logi-desc">{{ e.description }}</span>
                <span v-if="e.status" class="shop-logi-status">{{ e.status }}</span>
              </li>
            </ul>
          </div>
        </template>
      </div>
    </div>
    <p class="shop-hint-line">{{ info?.loginNote }}</p>
  </div>
</template>

<script setup lang="ts">
// 物流页签：客户端连通性测试 + 运单轨迹（只读；未接客户端如实说明）。
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { shopPlatforms, testShopLogistics, trackShopLogistics, type ShopConnection, type ShopProbeResult, type ShopTrackResult } from '../../shopSession';

const props = defineProps<{ shop: ShopConnection | null }>();

const info = computed(() => shopPlatforms.value.find((p) => p.id === props.shop?.platform));
const ready = computed(() => info.value?.integration?.client === 'ready');

const busy = ref(false);
const probe = ref<ShopProbeResult | null>(null);
const trackResult = ref<ShopTrackResult | null>(null);
const trackNo = ref('');
const trackPhone = ref('');

watch(() => props.shop?.id, () => {
  probe.value = null;
  trackResult.value = null;
  trackNo.value = '';
  trackPhone.value = '';
});

async function runTest(): Promise<void> {
  if (!props.shop) return;
  busy.value = true;
  try {
    const r = await testShopLogistics(props.shop.id);
    if (r.error) ElMessage.error(r.error);
    else probe.value = r.result || null;
  } finally {
    busy.value = false;
  }
}

async function runTrack(): Promise<void> {
  if (!props.shop || !trackNo.value.trim()) return;
  busy.value = true;
  try {
    const r = await trackShopLogistics(props.shop.id, {
      trackingNo: trackNo.value.trim(),
      phone: trackPhone.value.trim() || undefined,
    });
    if (r.error) ElMessage.error(r.error);
    else trackResult.value = r.result || null;
  } finally {
    busy.value = false;
  }
}
</script>
