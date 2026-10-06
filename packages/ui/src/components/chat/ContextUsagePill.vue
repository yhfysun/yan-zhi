<template>
  <!-- 6.1/6.2 上下文用量胶囊：常驻输入区工具条左下，点击弹明细浮层。
       数据口径（见 useChat tokenCount / shared context-policy.ts）：
       · 已用 token 是**前端估算**（estimateTokens 按消息内容+推理累加）→ 浮层标「估算」；
       · 百分比分母是**有效可用窗口**（标称 × 25%，16K 下限），不是标称窗口 ——
         标称 1M 的模型 ~256K 后明显退化，按标称显示会误导（context-policy.ts 文件头有依据）。
       阈值配色（Task 6 拍板）：≤70% 主色、70–90% 警示、>90% 危险。 -->
  <el-popover
    placement="top-start"
    :width="300"
    trigger="click"
    :show-arrow="false"
    popper-class="ctx-pill-popper"
    @show="loadBreakdown"
  >
    <template #reference>
      <button
        type="button"
        class="ctx-pill"
        :class="`is-${level}`"
        title="上下文用量（点击查看明细）"
      >
        <!-- 2026-10-04：按用户要求改为纯图标，不占工具条长度；
             颜色仍随用量档位变化（主色/警示/危险），点击弹明细 -->
        <el-icon :size="15"><Coin /></el-icon>
      </button>
    </template>

    <div class="ctx-detail">
      <div class="ctx-detail-head">
        <span class="ctx-detail-title">上下文用量</span>
        <span class="ctx-detail-tag">估算</span>
      </div>

      <!-- 总用量：token 数 / 有效可用窗口 / 百分比。
           「为什么分母不是标称窗口」的口径不占版面写在 denom 的 title 里（hover 可见）。 -->
      <div class="ctx-detail-total">
        <span class="ctx-detail-num">~{{ formatTokens(usedTokens) }}</span>
        <span class="ctx-detail-sep">/</span>
        <span class="ctx-detail-denom" :title="denomTitle">{{ formatTokens(limitTokens) }}</span>
        <span class="ctx-detail-denom" :title="denomTitle">（标称 {{ formatTokens(declaredWindow) }}）</span>
        <span class="ctx-detail-pct">{{ percent }}%</span>
      </div>

      <!-- 分段进度条（2026-10-06）：分类占比同 WorkBuddy —— 服务端 /context-breakdown
           按同一 estimateTokens 口径估算系统提示/工具定义/技能级 MCP/对话内容；失败回退旧行 -->
      <div class="ctx-bar" v-if="segments.length">
        <div
          v-for="seg in segments" :key="seg.name"
          class="ctx-bar-seg" :style="{ width: seg.pct + '%', background: seg.color }"
        />
      </div>

      <!-- 分段占用：服务端 /context-breakdown 分类估算；弹层打开时拉取（30s 缓存） -->
      <div class="ctx-detail-seg-title">分段占用</div>
      <template v-if="segments.length">
        <div class="ctx-detail-row" v-for="seg in segments" :key="seg.name">
          <span class="ctx-dot" :style="{ background: seg.color }" />
          <span class="ctx-detail-row-name">{{ seg.name }}</span>
          <span class="ctx-detail-row-val">~{{ formatTokens(seg.tokens) }}<i class="ctx-detail-row-tag">估算</i></span>
          <span class="ctx-detail-row-pct">{{ seg.pct }}%</span>
        </div>
      </template>
      <template v-else>
        <div class="ctx-detail-row is-empty">
          <span class="ctx-detail-row-name">系统提示 + 工具定义</span>
          <span class="ctx-detail-row-val">{{ breakdownLoading ? '计算中…' : '暂无分段数据' }}</span>
        </div>
        <div class="ctx-detail-row is-empty">
          <span class="ctx-detail-row-name">挂载文件</span>
          <span class="ctx-detail-row-val">{{ breakdownLoading ? '计算中…' : '暂无分段数据' }}</span>
        </div>
      </template>

      <!-- 压缩状态：只保留一行短提示；2026-10-04 删掉底部「模型标称窗口…有效可用…」
           整段说明（用户反馈文案不该放这里），口径移到分母 title -->
      <div class="ctx-detail-hint" :class="{ 'is-danger': percent > 90 }">
        <template v-if="compactCount > 0">本会话已自动压缩 {{ compactCount }} 次，较早历史已转为摘要</template>
        <template v-else>满额后较早历史将自动摘要压缩</template>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Coin } from '@element-plus/icons-vue';
import { api } from '../../api/client';

const props = withDefaults(defineProps<{
  /** 已用 token（前端按消息内容估算，非 API 精确值） */
  usedTokens: number;
  /** 有效可用窗口（标称 × EFFECTIVE_CONTEXT_RATIO，shared/context-policy.ts 口径） */
  limitTokens: number;
  /** 模型标称上下文窗口 */
  declaredWindow: number;
  /** 占有效可用窗口的百分比（0–100，contextUsagePercent 已封顶） */
  percent: number;
  /** 当前会话已发生的自动压缩次数（context:compacted 标记数） */
  compactCount?: number;
  /** 会话 id：弹层打开时拉取服务端分段估算 */
  conversationId?: string;
  /** 智能体 id：分段估算按该 agent 的提示词/工具面计算 */
  agentId?: string;
}>(), { compactCount: 0, conversationId: '', agentId: '' });

// ── 分段估算（2026-10-06，WorkBuddy 同款分类）──
interface Breakdown { system: number; tools: number; mcp: number; skill: number; messages: number }
const breakdown = ref<Breakdown | null>(null);
const breakdownLoading = ref(false);
let lastFetchAt = 0;

async function loadBreakdown() {
  if (!props.conversationId) return;
  // 30s 缓存：浮层反复开关不打接口；token 数本身是估算，够新鲜
  if (breakdown.value && Date.now() - lastFetchAt < 30000) return;
  breakdownLoading.value = true;
  try {
    const r = await api.get<any>(`/conversations/${props.conversationId}/context-breakdown?agentId=${encodeURIComponent(props.agentId || '')}`);
    if ('data' in r && r.data) {
      breakdown.value = r.data;
      lastFetchAt = Date.now();
    }
  } catch { /* 拉取失败回退「暂无分段数据」占位 */ }
  finally { breakdownLoading.value = false; }
}

/** 分类定义与占比：总账以 props.usedTokens（前端估算）为准，
 *  「其他」= 总账 − 四类之和（兜住估算口径差，负值归 0） */
const segments = computed(() => {
  if (!breakdown.value || props.usedTokens <= 0) return [];
  const b = breakdown.value;
  // 对话内容 = 前端总账 − 其余各类（前端/服务端两套估算的口径差归到这里，
  // 保证各行合计 = 总账、占比不超 100% —— 服务器独立估算消息会出 101% 这种怪行）
  const messages = Math.max(0, props.usedTokens - b.system - b.tools - b.mcp - b.skill);
  const defs = [
    { name: '系统级提示', tokens: b.system, color: '#3b82f6' },
    { name: '工具定义与描述', tokens: b.tools, color: '#22c55e' },
    { name: '对话内容', tokens: messages, color: '#f59e0b' },
    { name: 'Skill', tokens: b.skill, color: '#06b6d4' },
    { name: '技能级 MCP', tokens: b.mcp, color: '#a855f7' },
  ];
  const sum = defs.reduce((a, d) => a + d.tokens, 0);
  const other = Math.max(0, props.usedTokens - sum);
  const all = [
    ...defs,
    { name: '其他', tokens: other, color: '#94a3b8' },
  ].filter((d) => d.tokens > 0);
  return all
    .map((d) => ({ ...d, pct: Math.max(1, Math.round((d.tokens / props.usedTokens) * 100)) }))
    .sort((a, b2) => b2.tokens - a.tokens);
});

/** 用量档位：≤70% 主色 / 70–90% 警示 / >90% 危险 */
const level = computed(() => (props.percent > 90 ? 'danger' : props.percent >= 70 ? 'warn' : 'ok'));

/** 分母 hover 说明：有效可用窗口 ≈ 标称窗口 25%，解释「为什么不是标称值」 */
const denomTitle = computed(
  () => `有效可用窗口 ≈ 模型标称窗口 ${formatTokens(props.declaredWindow)} 的 25%；达到上限后较早历史自动摘要压缩`,
);

/** token 数格式化（与 ChatInputArea / 模型面板同一口径：>=1000 用 k） */
function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k`;
  return String(n);
}
</script>

<style scoped>
.ctx-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-secondary, #1f2328);
  cursor: pointer;
  flex: 0 0 auto;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}
.ctx-pill:hover {
  background: color-mix(in srgb, var(--color-primary, #c2410c) 8%, transparent);
  border-color: color-mix(in srgb, var(--color-primary, #c2410c) 36%, transparent);
  color: var(--color-primary, #c2410c);
}
/* 档位配色：图标颜色随档位变化，正常态与工具条其它图标同色，不抢眼 */
.ctx-pill.is-ok { color: var(--color-text-secondary, #8a8f98); }
.ctx-pill.is-warn { color: var(--color-warning); border-color: color-mix(in srgb, var(--color-warning) 40%, transparent); }
.ctx-pill.is-danger { color: var(--color-danger); border-color: color-mix(in srgb, var(--color-danger) 40%, transparent); }
</style>

<!-- 浮层 Teleport 到 body，样式必须写在非 scoped 块。
     规格（Task 6.2 / 统一浮层语言）：圆角 12px + --shadow-2。 -->
<style>
.ctx-pill-popper.el-popper {
  padding: 0 !important;
  border-radius: 12px !important;
  border: 1px solid var(--glass-border, var(--color-border, rgba(0, 0, 0, 0.08))) !important;
  background: var(--color-bg-elevated, #fff) !important;
  box-shadow: var(--shadow-2) !important;
}
.ctx-detail {
  padding: 12px 14px;
  font-size: var(--font-size-sm, 12px);
  color: var(--color-text, #1f2328);
}
.ctx-detail-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.ctx-detail-title {
  font-size: 13px;
  font-weight: 600;
}
/* 「估算」标签：数据为前端估算，必须明示，不冒充 API 精确值 */
.ctx-detail-tag {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-secondary, #8a8f98);
  background: color-mix(in srgb, var(--color-text-secondary, #8a8f98) 12%, transparent);
}
.ctx-detail-total {
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.06));
}
.ctx-detail-num {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-text, #1f2328);
}
.ctx-detail-sep { color: var(--color-text-secondary, #8a8f98); }
.ctx-detail-denom { color: var(--color-text-secondary, #8a8f98); }
.ctx-detail-pct {
  margin-left: auto;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-primary, #c2410c);
}
.ctx-detail-seg-title {
  margin: 10px 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary, #8a8f98);
}
.ctx-detail-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
}
.ctx-detail-row-name { color: var(--color-text, #1f2328); }
.ctx-detail-row-val {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary, #8a8f98);
}
.ctx-detail-row.is-empty .ctx-detail-row-name { color: var(--color-text-secondary, #8a8f98); }
/* 分段进度条（WorkBuddy 同款）：总条下的一条细分段条 */
.ctx-bar {
  display: flex;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  margin: 8px 0 2px;
  background: var(--color-border, rgba(0, 0, 0, 0.06));
}
.ctx-bar-seg { height: 100%; min-width: 2px; }
/* 分类行彩点 */
.ctx-dot {
  width: 8px; height: 8px; border-radius: 50%;
  flex: 0 0 auto;
}
/* 行尾分类百分比 */
.ctx-detail-row-pct {
  margin-left: 8px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text, #1f2328);
  font-weight: 600;
}
.ctx-detail-row-tag {
  font-style: normal;
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 999px;
  font-size: 10px;
  color: var(--color-text-secondary, #8a8f98);
  background: color-mix(in srgb, var(--color-text-secondary, #8a8f98) 12%, transparent);
}
/* 阈值 / 自动压缩提示一行 */
.ctx-detail-hint {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--color-border, rgba(0, 0, 0, 0.08));
  line-height: 1.5;
  color: var(--color-text-secondary, #8a8f98);
}
.ctx-detail-hint.is-danger { color: var(--danger); }
</style>
