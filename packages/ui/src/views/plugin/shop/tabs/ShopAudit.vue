<template>
  <div class="shop-tab-body">
    <el-table v-if="rows.length" :data="rows" size="small" class="shop-audit" max-height="calc(100vh - 220px)">
      <el-table-column prop="time" label="时间" width="150" />
      <el-table-column prop="action" label="动作" width="210" />
      <el-table-column prop="connection" label="店铺" width="180" show-overflow-tooltip />
      <el-table-column prop="ok" label="结果" width="80" />
      <el-table-column prop="note" label="说明" min-width="200" show-overflow-tooltip />
    </el-table>
    <p v-else class="shop-empty-hint">还没有操作记录。新建 / 修改 / 删除 / 自检 / 商品与订单的每个写动作都会留痕。</p>
    <p class="shop-hint-line">最近 200 条，按时间倒序。人工与 AI 的写操作共用这一份审计（actor 由后端记录）。</p>
  </div>
</template>

<script setup lang="ts">
// 操作日志页签：读插件审计（人工与 AI 共用）。
import { computed } from 'vue';
import { shopAudit } from '../../shopSession';
import { fmtTime } from '../useShopApi';

const rows = computed(() => [...shopAudit.value]
  .slice(-200)
  .reverse()
  .map((e) => ({
    time: fmtTime(Number(e.at) || 0),
    action: String(e.action ?? ''),
    connection: String(e.connection ?? ''),
    ok: e.ok === false ? '失败' : '成功',
    note: String(e.note ?? ''),
  })));
</script>
