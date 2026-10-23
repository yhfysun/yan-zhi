<template>
  <div class="shop-tab-body">
    <p class="shop-empty-hint shop-ref-lead">
      按平台列出<strong>该盯哪些指标</strong>与后台入口、登录注意事项。这里是只读参考 ——
      具体数值由助手指引你在浏览器面板登录后取（本插件不存账号密码，也不假装能自动取到）。
    </p>

    <div v-for="g in groups" :key="g.kind" class="shop-ref-group">
      <p class="shop-ref-group-title">{{ g.label }}（{{ g.items.length }}）</p>
      <div class="shop-ref-grid">
        <div v-for="p in g.items" :key="p.id" class="shop-ref-card">
          <div class="shop-ref-head">
            <strong>{{ p.label }}</strong>
            <el-tag size="small" effect="plain" :type="kindTagType(p.kind)">{{ kindLabel(p.kind) }}</el-tag>
          </div>
          <ul class="shop-ref-list">
            <li v-for="(m, i) in p.keyMetrics" :key="i">{{ m }}</li>
          </ul>
          <p v-if="p.entryUrl" class="shop-ref-entry">
            入口：<a :href="p.entryUrl" target="_blank" rel="noreferrer noopener">{{ p.entryUrl }}</a>
          </p>
          <p class="shop-ref-note">{{ p.loginNote }}</p>
          <p v-if="p.integration" class="shop-ref-api" :class="`is-${p.integration.client}`">
            {{ integrationLabel(p.integration) }}
            <a v-if="p.integration.docsUrl" :href="p.integration.docsUrl" target="_blank" rel="noreferrer noopener">开放平台文档</a>
          </p>
        </div>
      </div>
    </div>

    <div class="shop-ref-boundary">
      <p class="shop-ref-boundary-title">真实凭据联调清单（没有真实凭据只能 mock，不宣称“已连通”）</p>
      <ul class="shop-ref-list">
        <li><strong>亚马逊 SP-API</strong>：LWA 应用 + IAM 用户（SigV4）+ 卖家授权；应用需 Product Listing / Orders 权限；填写默认 Marketplace ID（美国 ATVPDKIKX0DER）；限流按接口分档，429 会如实报限流。</li>
        <li><strong>淘宝/天猫 TOP</strong>：App Key/Secret + 卖家授权 session；需应用审核与对应 API 权限包；调用有 QPS 限制；生产环境通常还有 IP 白名单。</li>
        <li><strong>拼多多</strong>：client_id/client_secret + 商家授权 access_token；无沙箱，联调即正式调用；订单查询限 3 个月内且区间 ≤24h；限流码会如实报。</li>
        <li><strong>1688</strong>：App Key/Secret + 卖家授权 access_token；需应用权限包；采购付款必须人工。</li>
        <li><strong>TikTok Shop</strong>：Partner Center 应用审核 + 店铺授权（shop_cipher）；接口有 QPS 与 region 限制。</li>
        <li><strong>Shopify</strong>：私有 App Admin API token；域名必须是 *.myshopify.com；按店铺限速（429）；写权限需勾选 write_products 等。</li>
        <li><strong>万邑通</strong>：卖家授权 token + 应用 client_id/client_secret 双签名；出库单字段以万邑通仓库/产品编码为准。</li>
        <li><strong>京东物流</strong>：宙斯开放平台企业认证 + 应用授权 access_token + 商家编码 customerCode；token 过期会报鉴权失败。</li>
        <li><strong>菜鸟速递</strong>：对接码 + 密钥由菜鸟线下提供；网关地址按客户分配（只接受 *.cainiao.com）。</li>
        <li><strong>4PX</strong>：客户账号开通 OAuth，App Key/Secret + access_token；沙箱 open.sandbox.4px.com，生产 open.4px.com。</li>
      </ul>
      <p class="shop-ref-note">完整清单与逐项核对步骤见 docs/店铺平台联调清单-20261023.md。</p>
    </div>

    <div class="shop-ref-boundary">
      <p class="shop-ref-boundary-title">本模式能做什么 / 不能做什么</p>
      <ul class="shop-ref-list">
        <li><strong>能做（人工 + 本地业务）</strong>：商品新建/编辑/上下架/改价/改库存、订单发货、库存流水、物流轨迹 —— 全部落本地业务库并审计。</li>
        <li><strong>能做（AI）</strong>：对话下指令 → 变更单 → 你确认 → 执行并回读；演示店铺立即生效，测试/生产同样走闸门（生产额外批准、禁止批量）。</li>
        <li><strong>平台侧动作</strong>：没有管理 API 的平台返回跳转计划，在浏览器面板打开后台由你登录操作；演示店铺只返回演示计划，绝不触达真实平台。</li>
        <li><strong>不做（长期边界）</strong>：不代付款、不代签收、不绕过平台风控；不存平台账号密码。</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
// 口径速查页签：平台指标 / 入口 / 登录提示 / 对接状态（只读参考）。
import { computed } from 'vue';
import { shopPlatforms } from '../../shopSession';

type Kind = 'store' | 'warehouse' | 'logistics';
const KIND_META: Record<Kind, { label: string; tag: 'info' | 'warning' | 'success' }> = {
  store: { label: '店铺', tag: 'info' },
  warehouse: { label: '仓储', tag: 'warning' },
  logistics: { label: '物流', tag: 'success' },
};
function kindLabel(k: string): string { return KIND_META[k as Kind]?.label ?? '店铺'; }
function kindTagType(k: string): 'info' | 'warning' | 'success' { return KIND_META[k as Kind]?.tag ?? 'info'; }

function integrationLabel(i: { auth: string; client: string; enterprise?: boolean }): string {
  if (i.client === 'ready') return 'API 客户端已实现（未在真实账号联调；以自检结果为准）';
  if (i.client === 'pending') {
    const auth = i.auth === 'app-key-secret' ? 'appKey/appSecret 签名接口'
      : i.auth === 'api-key' ? 'API Key 接口'
        : i.auth === 'oauth' ? 'OAuth 授权接口' : '开放平台接口';
    return `${auth} · 客户端未接${i.enterprise ? ' · 需企业入驻' : ''}`;
  }
  return '仅登记，无 API 对接';
}

const groups = computed(() => (['store', 'warehouse', 'logistics'] as const)
  .map((kind) => ({ kind, label: kindLabel(kind), items: shopPlatforms.value.filter((p) => p.kind === kind) }))
  .filter((g) => g.items.length));
</script>
