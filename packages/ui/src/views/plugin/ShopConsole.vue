<template>
  <ConsoleShell storage-key="shop_aside" root-class="shop-console" :default-width="240">
    <!-- ============ 左栏：项目列表（项目 = 一条店铺会话，与剪辑项目同模型） ============ -->
    <template #aside>
      <div class="shop-side-head">
        <span class="shop-side-title">项目</span>
        <el-button size="small" type="primary" plain :icon="Plus" @click="createProject()">新建</el-button>
      </div>

      <div class="shop-projects">
        <div
          v-for="p in shopProjects"
          :key="p.id"
          class="shop-project"
          :class="{ active: p.id === activeProjectId }"
          @click="switchProject(p.id)"
        >
          <el-icon class="shop-project-icon"><ChatLineSquare /></el-icon>
          <span class="shop-project-name" :title="p.title">{{ p.title || '未命名项目' }}</span>
          <span class="shop-project-count">{{ projectCount(p.id) }}</span>
        </div>

        <!-- 历史连接没有 projectId：单独列出，避免"看不见/丢数据" -->
        <div
          v-if="orphanCount"
          class="shop-project"
          :class="{ active: activeProjectId === '' }"
          @click="switchProject('')"
        >
          <el-icon class="shop-project-icon"><Shop /></el-icon>
          <span class="shop-project-name">未归属资源</span>
          <span class="shop-project-count">{{ orphanCount }}</span>
        </div>

        <div v-if="!shopProjects.length && !orphanCount" class="shop-empty">
          <p>还没有店铺项目。</p>
          <p class="shop-empty-hint">
            一个项目 = 一家店的经营上下文（对话 + 资源）。新建后，在中间按
            <strong>店铺 / 仓储 / 物流</strong> 绑定多个资源。
          </p>
        </div>
      </div>

      <!-- 演示数据：空控制台一眼看懂怎么用；清空只删当前项目的 demo 行 -->
      <div class="shop-demo">
        <template v-if="demoShops.length">
          <span class="shop-demo-hint">{{ demoShops.length }} 条演示数据</span>
          <el-button size="small" text type="danger" :loading="demoBusy" @click="clearDemos">清空演示</el-button>
        </template>
        <el-button v-else size="small" text type="primary" :loading="demoBusy" @click="makeDemos">＋ 创建演示项目</el-button>
      </div>
    </template>

    <!-- ============ 主区：工作台 + 常驻 AI 对话栏 ============ -->
    <section
      class="shop-main"
      :class="{ 'is-lead-ai': lead === 'ai', 'is-chat-collapsed': chatCollapsed }"
      :style="{ '--shop-chat-w': chatR.width.value + 'px' }"
    >
      <div class="shop-work">
      <div class="shop-work-head">
        <span class="shop-work-title">{{ activeProjectTitle }}</span>
        <span class="shop-work-sub">{{ projectConnCount }} 条资源</span>
        <span class="shop-work-spacer"></span>
        <el-button size="small" type="primary" plain :disabled="!activeProjectId" @click="openCreate()">＋ 连接</el-button>
      </div>

      <el-tabs v-model="tab" class="shop-tabs">
        <el-tab-pane
          v-for="k in KIND_TABS"
          :key="k.kind"
          :label="`${k.label}（${kindCount(k.kind)}）`"
          :name="k.kind"
        >
          <el-table
            v-if="connsOfKind(k.kind).length"
            :data="connsOfKind(k.kind)"
            size="small"
            highlight-current-row
            :row-class-name="rowClass"
            @row-click="(row: any) => selectShop(row.id)"
          >
            <el-table-column label="名称" min-width="190">
              <template #default="{ row }">
                <span class="shop-conn-name">{{ row.shopName }}</span>
                <el-tag v-if="row.demo" size="small" type="info" effect="plain" class="shop-tag-gap">演示</el-tag>
                <el-tag v-if="row.isProduction" size="small" type="danger" effect="plain">生产</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="平台 / 站点" min-width="130">
              <template #default="{ row }">
                <span class="shop-conn-meta">{{ platformLabel(row.platform) }}<template v-if="row.site"> · {{ row.site }}</template></span>
              </template>
            </el-table-column>
            <el-table-column
              v-for="col in tabColumns(k.kind)"
              :key="col.label"
              :label="col.label"
              min-width="92"
            >
              <template #default="{ row }">
                <span :class="{ 'shop-na': kpiOf(row, col.kpi) === '—' }">{{ kpiOf(row, col.kpi) }}</span>
              </template>
            </el-table-column>
          </el-table>
          <div v-else class="shop-empty">
            <p v-if="!activeProjectId">先在左侧新建一个店铺项目，再绑定{{ k.label }}。</p>
            <p v-else>这个项目还没有{{ k.label }}，点右上角「＋ 连接」登记一条。</p>
          </div>
        </el-tab-pane>

        <el-tab-pane :label="`操作日志（${shopAudit.length}）`" name="audit">
          <el-table v-if="shopAudit.length" :data="auditRows" size="small" class="shop-audit">
            <el-table-column prop="time" label="时间" width="170" />
            <el-table-column prop="action" label="动作" width="180" />
            <el-table-column prop="connection" label="店铺" width="160" />
            <el-table-column prop="ok" label="结果" width="80" />
          </el-table>
          <p v-else class="shop-empty-hint">还没有操作记录。新建 / 修改 / 删除 / 自检都会留痕。</p>
        </el-tab-pane>

        <el-tab-pane label="口径速查" name="reference">
          <p class="shop-empty-hint shop-ref-lead">
            按平台列出<strong>该盯哪些指标</strong>与后台入口、登录注意事项。这里是只读参考 ——
            具体数值由助手指引你在浏览器面板登录后取（本插件不存账号密码，也不假装能自动取到）。
          </p>

          <!-- 按 店铺 / 仓储 / 物流 分组：服务商越来越多，平铺一屏看不出边界 -->
          <div v-for="g in refGroups" :key="g.kind" class="shop-ref-group">
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
                <!-- 对接状态必须如实标：有 API ≠ 本版本已接上 -->
                <p v-if="p.integration" class="shop-ref-api" :class="`is-${p.integration.client}`">
                  {{ integrationLabel(p.integration) }}
                  <a v-if="p.integration.docsUrl" :href="p.integration.docsUrl" target="_blank" rel="noreferrer noopener">开放平台文档</a>
                </p>
              </div>
            </div>
          </div>

          <div class="shop-ref-boundary">
            <p class="shop-ref-boundary-title">本模式能做什么 / 不能做什么</p>
            <ul class="shop-ref-list">
              <li><strong>能做（只读分析）</strong>：跨境选品分析、Listing 与详情优化建议、广告与利润测算（ACoS / 盈亏平衡 ACoS）、1688 货源与铺货差价、头程比选与库存补货台账；产出都是可照做的清单与测算表。</li>
              <li><strong>写操作（需闸门）</strong>：目前只开放「申请改价」—— 助手必须先出变更单（对象 / 现值 / 新值 / 理由 / 回滚方式），经你确认才放行；标记为「生产」的店铺还要额外批准；每次申请与被拒都记入「操作日志」。</li>
              <li><strong>做不了（本版本）</strong>：改库存、上下架、报名活动、回消息 —— 要等后续版本，届时同样走变更单 + 二次确认 + 审计。</li>
              <li><strong>不做（长期边界）</strong>：不代下单、不代铺货、不代替你与平台/供应商成交；不绕过平台风控；不碰用户账号密码（登录一律由你在浏览器面板完成）。</li>
            </ul>
          </div>
        </el-tab-pane>
      </el-tabs>

            <div v-if="!active" class="shop-placeholder">
              <p>选中上方的店铺 / 仓储 / 物流查看详情，或点右上角「＋ 连接」登记一条。</p>
              <p class="shop-empty-hint">
                本模式以<strong>只读分析</strong>为主：抓数、比价、算利润、出选品清单与优化建议。
                写操作目前只开放「申请改价」，必须经变更单 + 你确认（生产店铺还要额外批准）。
              </p>
              <el-button v-if="!shopConnections.length" size="small" type="primary" plain :loading="demoBusy" @click="makeDemos">
                先创建演示项目试试
              </el-button>
            </div>

            <div v-if="active" class="shop-card">
              <div class="shop-card-head">
                <h3>{{ active.shopName }}</h3>
                <el-tag v-if="active.isProduction" type="danger" effect="plain">生产店铺</el-tag>
                <el-tag v-else-if="active.tag" type="info" effect="plain">{{ active.tag }}</el-tag>
              </div>
              <dl class="shop-kv">
                <div><dt>平台</dt><dd>{{ platformLabel(active.platform) }}</dd></div>
                <div><dt>{{ siteFieldLabel }}</dt><dd>{{ active.site || '—' }}</dd></div>
                <div><dt>卖家 ID</dt><dd>{{ active.sellerId || '—' }}</dd></div>
                <div><dt>API 凭据</dt><dd>{{ active.hasSecret ? '已配置' : (activeKind === 'logistics' ? '未配置（物流接口需要 appKey/appSecret）' : '未配置（纯浏览器流程不需要）') }}</dd></div>
                <div><dt>最近自检</dt><dd>{{ fmtTime(active.lastCheckAt) }}</dd></div>
                <div v-if="active.note"><dt>备注</dt><dd>{{ active.note }}</dd></div>
              </dl>

              <!-- 演示经营快照：让「管理」有数据可看（真实连接暂无数据源，见卡片下方的能力边界） -->
              <div v-if="activeSnapshot" class="shop-snapshot">
                <div class="shop-kpi-grid">
                  <div v-for="k in activeSnapshot.kpis" :key="k.label" class="shop-kpi">
                    <span class="shop-kpi-label">{{ k.label }}</span>
                    <span class="shop-kpi-value">{{ k.value }}</span>
                    <span v-if="k.hint" class="shop-kpi-hint">{{ k.hint }}</span>
                  </div>
                </div>
                <div v-if="activeSnapshot.table" class="shop-snap-table">
                  <p class="shop-snap-title">{{ activeSnapshot.table.title }}</p>
                  <el-table :data="snapshotRows" size="small" border>
                    <el-table-column
                      v-for="(c, i) in activeSnapshot.table.columns"
                      :key="i"
                      :prop="`c${i}`"
                      :label="c"
                      min-width="90"
                    />
                  </el-table>
                </div>
                <p class="shop-snap-note">{{ activeSnapshot.note }}</p>
              </div>

              <div class="shop-card-actions">
                <el-button size="small" :loading="checking" @click="runCheck()">配置自检</el-button>
                <el-button size="small" @click="openEdit()">编辑</el-button>
                <el-button size="small" type="danger" plain @click="removeShop()">删除</el-button>
              </div>

              <!-- 物流：测试连接 + 运单轨迹（只读；客户端未接的服务商只显示说明） -->
              <div v-if="activeKind === 'logistics'" class="shop-logi">
                <div class="shop-logi-row">
                  <el-button size="small" :loading="logisticsBusy" :disabled="!logisticsReady" @click="runLogisticsTest()">测试连接</el-button>
                  <span v-if="!logisticsReady" class="shop-form-tip">该服务商客户端未接，当前只能登记。</span>
                  <span v-else-if="probeResult" class="shop-logi-note" :class="probeResult.ok ? 'ok' : 'err'">
                    {{ probeResult.ok ? '✓' : '✗' }} {{ probeResult.message }}
                  </span>
                </div>

                <template v-if="logisticsReady">
                  <div class="shop-logi-row">
                    <el-input v-model="trackNo" size="small" class="shop-logi-input" placeholder="运单号（顺丰 SF… / 云途 YT…）" @keyup.enter="runTrack()" />
                    <el-input v-model="trackPhone" size="small" class="shop-logi-phone" placeholder="手机后四位（选填）" />
                    <el-button size="small" type="primary" plain :loading="logisticsBusy" :disabled="!trackNo.trim()" @click="runTrack()">查轨迹</el-button>
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

            <!-- 自检结果：如实说明它只查配置，不探测连通性 -->
            <div v-if="checkForActive" class="shop-check" :class="checkForActive.ok ? 'ok' : 'err'">
              <div class="shop-check-head">
                {{ checkForActive.ok ? '✓ 配置完整' : '✗ 配置缺项' }}
                <span class="shop-check-sub">（配置自检，不含连通性探测 —— 真取数由助手委派 pageAgent 打开页面完成）</span>
              </div>
              <ul v-if="checkForActive.issues.length" class="shop-check-list">
                <li v-for="(t, i) in checkForActive.issues" :key="`i${i}`" class="is-issue">{{ t }}</li>
              </ul>
              <ul v-if="checkForActive.hints.length" class="shop-check-list">
                <li v-for="(t, i) in checkForActive.hints" :key="`h${i}`">{{ t }}</li>
              </ul>
            </div>

            <div v-if="active" class="shop-next">
              <p class="shop-next-title">下一步：让助手干活</p>
              <p class="shop-empty-hint">
                在右侧对话里直接说要做什么（例：<em>帮我分析这个品类的竞品和利润，目标站点美国</em>）。
                若要开一个长期目录，建议在左侧任务列表建一个绑「店铺运营」类型的目录 —— 那样选品清单与测算表会
                自动落到该目录的资源结构里（00-source / 02-work / 03-output），跨会话可复用。
              </p>
              <el-button size="small" type="primary" plain @click="goAiLed()">切到 AI 主导（对话居中）</el-button>
            </div>

      </div>

      <!-- 拖拽条：工作台 ↔ 对话栏（任一侧收起时不渲染） -->
      <div
        v-show="!chatCollapsed"
        class="rs-handle"
        :class="{ dragging: chatR.dragging.value }"
        @mousedown="chatR.startDrag($event, 'right')"
      ></div>

      <!-- 常驻 AI 对话栏：与办公/开发/剪辑共用同一份会话（chat.css 由下方 style src 引入） -->
      <aside v-show="!chatCollapsed" class="shop-chat">
        <div class="shop-chat-head">
          <el-icon :size="13" class="shop-chat-icon"><ChatDotRound /></el-icon>
          <span class="shop-chat-title">AI 助手</span>
          <span class="shop-chat-spacer"></span>
          <LeadToggle :model-value="lead" mode="shop" @update:model-value="onLeadChange" />
          <button class="shop-chat-btn" title="收起对话" @click="chatCollapsed = true">
            <el-icon :size="12"><ArrowRight /></el-icon>
          </button>
        </div>
        <ChatMessageList />
        <ChatInputArea />
      </aside>

      <!-- 对话栏收起后右下角的悬浮入口 -->
      <button v-if="chatCollapsed" class="shop-chat-fab" title="展开 AI 对话" @click="chatCollapsed = false">
        <el-icon :size="13"><ChatDotRound /></el-icon><span>AI</span>
      </button>
    </section>

    <ChatDialogs />

    <!-- ============ 新建 / 编辑弹窗 ============ -->
    <el-dialog v-model="dialogVisible" :title="editing ? `编辑店铺 · ${form.shopName}` : '新建店铺 / 仓库 / 物流服务'" width="560px">
      <el-form label-width="110px">
        <el-form-item label="平台" required>
          <el-select v-model="form.platform" :disabled="!!editing" class="shop-form-full">
            <el-option-group v-for="g in formPlatformGroups" :key="g.kind" :label="g.label">
              <el-option v-for="p in g.items" :key="p.id" :label="p.label" :value="p.id" />
            </el-option-group>
          </el-select>
        </el-form-item>
        <el-form-item :label="formSiteLabel">
          <el-input v-model="form.site" :placeholder="formSitePlaceholder" />
          <span class="shop-form-tip">{{ formSiteTip }}</span>
        </el-form-item>
        <el-form-item label="店铺名" required>
          <el-input v-model="form.shopName" placeholder="唯一标识，如 家居店-US" />
        </el-form-item>
        <el-form-item label="卖家 ID">
          <el-input v-model="form.sellerId" placeholder="可选，用于对账" />
        </el-form-item>
        <el-form-item label="标签">
          <el-radio-group v-model="form.tag">
            <el-radio value="测试">测试</el-radio>
            <el-radio value="生产">生产</el-radio>
          </el-radio-group>
          <span class="shop-form-tip">标记「生产」后，后续版本的写操作会对它做二次强确认。</span>
        </el-form-item>
        <!-- 物流商：凭据字段由后端下发（顺丰 partnerID/checkword/env；云途 baseUrl/客户编号/ApiSecret） -->
        <template v-if="formPlatformKind === 'logistics' && formCredentials.length">
          <el-form-item v-for="f in formCredentials" :key="f.key" :label="f.label" :required="!!f.required">
            <el-select v-if="f.options" v-model="credForm[f.key]" class="shop-form-full">
              <el-option v-for="o in f.options" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
            <el-input
              v-else
              v-model="credForm[f.key]"
              :type="f.secret ? 'password' : 'text'"
              :show-password="!!f.secret"
              :placeholder="f.placeholder || ''"
            />
            <span v-if="f.hint" class="shop-form-tip">{{ f.hint }}</span>
          </el-form-item>
          <p class="shop-cred-note">凭据整组加密存储；密钥字段永不回显，编辑时留空表示沿用原值。</p>
        </template>
        <el-form-item v-else-if="formPlatformKind === 'logistics'" label="凭据">
          <span class="shop-form-tip">该服务商还没有客户端，先登记即可；接好后再来这里填凭据。</span>
        </el-form-item>
        <el-form-item v-else label="API 凭据">
          <el-input v-model="form.secret" type="password" show-password :placeholder="editing ? '留空沿用原有凭据' : '可选；纯浏览器流程不需要'" />
          <span class="shop-form-tip">仅当要用平台 API 时才需要（亚马逊 SP-API 的凭据 JSON）。凭据加密存储，接口永不回显。</span>
        </el-form-item>
        <el-form-item label="目录">
          <el-select v-model="form.groupId" clearable placeholder="未分组" class="shop-form-full">
            <el-option v-for="g in shopGroups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="2" placeholder="用途说明（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit()">{{ editing ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>
  </ConsoleShell>
</template>

<script setup lang="ts">
// 店铺运营控制台（/shop）。形态照 OpsConsole 的三段式（左栏资源 + 主区 + 页签），
// 但**刻意只做 P0 能诚实交付的东西**：资源管理 + 配置自检 + 审计。
// 不在这里假装"店铺概览指标"——那需要真实取数，而取数走对话里的 pageAgent。
import { ref, computed, onMounted, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Shop, ChatDotRound, ArrowRight, ChatLineSquare } from '@element-plus/icons-vue';
import ConsoleShell from '../../components/console/ConsoleShell.vue';
import ChatMessageList from '../../components/chat/ChatMessageList.vue';
import ChatInputArea from '../../components/chat/ChatInputArea.vue';
import ChatDialogs from '../../components/chat/ChatDialogs.vue';
import LeadToggle from '../../components/workbench/LeadToggle.vue';
import { useChatStore } from '../../stores/chat';
import { useChat } from '../../composables/chat/useChat';
import { useResizable } from '../../composables/useResizable';
import { activeMode, leadOf, setLead, type LeadMode } from '../../stores/mode';
import {
  shopConnections, shopGroups, shopPlatforms, shopActiveId, shopCheck, shopCheckId,
  shopAudit, shopDemoData,
  loadShopConsole, selectShop, createShop, updateShop, deleteShop, checkShop,
  seedDemoShops, clearDemoShops, testShopLogistics, trackShopLogistics, getDemoTemplates,
  type ShopProbeResult, type ShopTrackResult,
} from './shopSession';

// 对话栏：宽度可拖拽并持久化（与运维/工作流同一个 useResizable）
// ★ 默认 360 / 最小 280：1280 宽窗口下三栏（资源 240 + 工作台 + 对话）不再把工作台压成窄条。
const chatR = useResizable('shop_chat', 360, 280, 760);
/** 小屏（<1100）首次进入先收起对话栏，用右下角悬浮入口展开；宽屏保持常驻。 */
const chatCollapsed = ref(typeof window !== 'undefined' && window.innerWidth < 1100);
/** 主导方：human=工作台居中+对话在右；ai=对话居中、工作台收起（LeadToggle 真实生效） */
const lead = computed<LeadMode>(() => leadOf(activeMode.value));
function onLeadChange(v: LeadMode): void {
  setLead(activeMode.value, v);
}

type ShopKind = 'store' | 'warehouse' | 'logistics';
const KIND_META: Record<ShopKind, { label: string; tag: 'info' | 'warning' | 'success' }> = {
  store: { label: '店铺', tag: 'info' },
  warehouse: { label: '仓储', tag: 'warning' },
  logistics: { label: '物流', tag: 'success' },
};
function kindLabel(k: string): string {
  return KIND_META[k as ShopKind]?.label ?? '店铺';
}
function kindTagType(k: string): 'info' | 'warning' | 'success' {
  return KIND_META[k as ShopKind]?.tag ?? 'info';
}

/** 对接状态的诚实措辞：接口已知但客户端没接，就说没接 */
function integrationLabel(i: { auth: string; client: string; enterprise?: boolean }): string {
  if (i.client === 'ready') return 'API 客户端已实现';
  if (i.client === 'pending') {
    const auth = i.auth === 'app-key-secret' ? 'appKey/appSecret 签名接口'
      : i.auth === 'api-key' ? 'API Key 接口'
        : i.auth === 'oauth' ? 'OAuth 授权接口' : '开放平台接口';
    return `${auth} · 客户端未接${i.enterprise ? ' · 需企业入驻' : ''}`;
  }
  return '仅登记，无 API 对接';
}

/** 口径速查按 店铺 → 仓储 → 物流 分组 */
const refGroups = computed(() => (['store', 'warehouse', 'logistics'] as const)
  .map((kind) => ({ kind, label: kindLabel(kind), items: shopPlatforms.value.filter((p) => p.kind === kind) }))
  .filter((g) => g.items.length));

/** 新建弹窗的平台下拉也按同一口径分组 */
const formPlatformGroups = computed(() => refGroups.value);

type ShopTab = ShopKind | 'audit' | 'reference';
const KIND_TABS: Array<{ kind: ShopKind; label: string }> = [
  { kind: 'store', label: '店铺' },
  { kind: 'warehouse', label: '仓储' },
  { kind: 'logistics', label: '物流' },
];
const tab = ref<ShopTab>('store');

// ===== 项目 = 一条店铺会话（与剪辑项目同模型；切项目 = 切整块对话上下文）=====
const chat = useChat();
const chatStore = useChatStore();
const shopProjects = computed(() => chatStore.conversations);
/** 当前项目 id；'' = 未归属（历史连接 / 还没建项目） */
const activeProjectId = ref('');
const activeProjectTitle = computed(() =>
  shopProjects.value.find((p) => p.id === activeProjectId.value)?.title
  || (activeProjectId.value ? '未命名项目' : '未归属资源'));
const activeProject = computed(() => shopProjects.value.find((p) => p.id === activeProjectId.value) || null);

watch(() => chatStore.currentConvId, (id) => { activeProjectId.value = id || ''; }, { immediate: true });

const projectConns = computed(() =>
  shopConnections.value.filter((c) => (c.projectId || '') === activeProjectId.value));
const projectConnCount = computed(() => projectConns.value.length);
const orphanCount = computed(() => shopConnections.value.filter((c) => !c.projectId).length);

function platformKindOf(id: string): ShopKind {
  return (shopPlatforms.value.find((p) => p.id === id)?.kind ?? 'store') as ShopKind;
}
function connsOfKind(kind: ShopKind) {
  return projectConns.value.filter((c) => platformKindOf(c.platform) === kind);
}
function kindCount(kind: ShopKind): number {
  return connsOfKind(kind).length;
}
function projectCount(id: string): number {
  return shopConnections.value.filter((c) => (c.projectId || '') === id).length;
}

async function switchProject(id: string): Promise<void> {
  if (id === activeProjectId.value) return;
  selectShop('');
  probeResult.value = null;
  trackResult.value = null;
  activeProjectId.value = id;
  if (!id) return;
  try { await chat.selectConv(id); } catch { /* 会话可能已删：保持空项目 */ }
}

async function createProject(): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('项目名称（例：家居出海）', '新建店铺项目', {
      inputPlaceholder: '未命名店铺项目',
      inputValidator: (v: string) => (!!String(v || '').trim() || '项目名称必填'),
    });
    const id = await chatStore.createConversation(String(value).trim());
    await chat.selectConv(id);
    selectShop('');
    tab.value = 'store';
  } catch { /* 取消 */ }
}

const active = computed(() => projectConns.value.find((c) => c.id === shopActiveId.value) || null);

/** 某个连接的演示快照（真实连接暂无数据源，返回 undefined） */
function snapshotOf(c: { demo?: boolean; shopName: string }) {
  return c.demo ? shopDemoData.value[c.shopName] : undefined;
}
/** 取快照里的某个 KPI 值；没有就显示 —（不编数字） */
function kpiOf(c: { demo?: boolean; shopName: string }, label: string): string {
  return snapshotOf(c)?.kpis.find((k) => k.label === label)?.value || '—';
}
/** 三个页签各自展示哪些经营指标（列名与快照 KPI 同名） */
const TAB_COLUMNS: Record<ShopKind, Array<{ label: string; kpi: string }>> = {
  store: [
    { label: '今日销售额', kpi: '今日销售额' },
    { label: '订单', kpi: '订单数' },
    { label: '转化率', kpi: '转化率' },
    { label: 'ACoS', kpi: '广告 ACoS' },
  ],
  warehouse: [
    { label: '在仓', kpi: '在仓库存' },
    { label: '在途', kpi: '在途库存' },
    { label: '可售天数', kpi: '可售天数' },
    { label: '滞销 SKU', kpi: '滞销 SKU' },
  ],
  logistics: [
    { label: '本月运单', kpi: '本月运单' },
    { label: '签收率', kpi: '签收率' },
    { label: '平均时效', kpi: '平均时效' },
    { label: '异常件', kpi: '异常件' },
  ],
};
function tabColumns(kind: ShopKind) { return TAB_COLUMNS[kind]; }
function rowClass({ row }: { row: { id: string } }): string {
  return row.id === shopActiveId.value ? 'shop-row-active' : '';
}

/** 切页签 / 换项目后自动选中该页签的第一条，保证下面始终有数据可看 */
watch([tab, projectConns], () => {
  if (tab.value === 'audit' || tab.value === 'reference') return;
  const list = connsOfKind(tab.value as ShopKind);
  if (!list.some((c) => c.id === shopActiveId.value)) selectShop(list[0]?.id || '');
}, { immediate: true });
/** 自检结果必须与当前选中的店铺同 id 才显示（换店后旧结论不能串台） */
const checkForActive = computed(() =>
  (shopCheckId.value && shopCheckId.value === shopActiveId.value ? shopCheck.value : null));

const auditRows = computed(() =>
  [...shopAudit.value]
    .slice(-200)
    .reverse()
    .map((e) => ({
      time: fmtTime(Number(e.at) || 0),
      action: String(e.action ?? ''),
      connection: String(e.connection ?? ''),
      ok: e.ok === false ? '失败' : '成功',
    })),
);

function fmtTime(ts?: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function platformLabel(id: string): string {
  return shopPlatforms.value.find((p) => p.id === id)?.label || id;
}

const activePlatformInfo = computed(() => shopPlatforms.value.find((p) => p.id === active.value?.platform));
const activeKind = computed<ShopKind>(() => (activePlatformInfo.value?.kind ?? 'store') as ShopKind);
const siteFieldLabel = computed(() => (activeKind.value === 'warehouse' ? '仓库' : activeKind.value === 'logistics' ? '服务范围' : '站点 / 市场'));

/** 演示经营快照：只有演示连接有（后端按 shopName 下发合成数据） */
const activeSnapshot = computed(() =>
  (active.value?.demo ? shopDemoData.value[active.value.shopName] : undefined));
const snapshotRows = computed(() =>
  (activeSnapshot.value?.table?.rows || []).map((r) => Object.fromEntries(r.map((c, i) => [`c${i}`, c]))));

const formPlatformKind = computed<ShopKind>(
  () => (shopPlatforms.value.find((p) => p.id === form.value.platform)?.kind ?? 'store') as ShopKind,
);
const formSiteLabel = computed(() => (formPlatformKind.value === 'warehouse' ? '仓库名 / 站点' : formPlatformKind.value === 'logistics' ? '服务范围' : '站点 / 市场'));
const formSitePlaceholder = computed(() => (formPlatformKind.value === 'warehouse'
  ? '如 US-West 海外仓'
  : formPlatformKind.value === 'logistics'
    ? '如 华东 / 美西（可留空）'
    : '如亚马逊 US/EU/JP、淘宝 taobao/tmall'));
const formSiteTip = computed(() => (formPlatformKind.value === 'store'
  ? '站点会影响佣金、税与竞争口径的判断，务必与实际经营站点一致。'
  : formPlatformKind.value === 'logistics'
    ? '物流商没有"站点"概念，这里只填合作范围，可留空。'
    : '仓库名即口径，建议与服务商系统里的名称一致。'));

// ---------- 物流凭据表单（由后端下发的 credentials 字段驱动） ----------
const formPlatformInfo = computed(() => shopPlatforms.value.find((p) => p.id === form.value.platform));
const formCredentials = computed(() => formPlatformInfo.value?.credentials || []);
const credForm = ref<Record<string, string>>({});

function resetCredForm(prefill?: Record<string, string>): void {
  const o: Record<string, string> = {};
  for (const f of formCredentials.value) o[f.key] = prefill?.[f.key] || f.defaultValue || '';
  // 编辑时 credMeta 里的非密钥字段优先
  if (prefill) for (const [k, v] of Object.entries(prefill)) if (!o[k]) o[k] = v;
  credForm.value = o;
}

/** 组装凭据 JSON；全空返回空串（= 不配置/沿用旧值） */
function buildCredsPayload(): string {
  const o: Record<string, string> = {};
  for (const f of formCredentials.value) {
    const v = String(credForm.value[f.key] ?? '').trim();
    if (v) o[f.key] = v;
    else if (f.defaultValue) o[f.key] = f.defaultValue;
  }
  return Object.keys(o).length ? JSON.stringify(o) : '';
}

// ---------- 物流测试 / 轨迹查询 ----------
const logisticsBusy = ref(false);
const probeResult = ref<ShopProbeResult | null>(null);
const trackResult = ref<ShopTrackResult | null>(null);
const trackNo = ref('');
const trackPhone = ref('');
const logisticsReady = computed(() => activePlatformInfo.value?.integration?.client === 'ready');

watch(shopActiveId, () => {
  probeResult.value = null;
  trackResult.value = null;
  trackNo.value = '';
  trackPhone.value = '';
});

async function runLogisticsTest(): Promise<void> {
  const c = active.value;
  if (!c) return;
  logisticsBusy.value = true;
  try {
    const r = await testShopLogistics(c.id);
    if (r.error) ElMessage.error(r.error);
    else probeResult.value = r.result || null;
  } finally {
    logisticsBusy.value = false;
  }
}

async function runTrack(): Promise<void> {
  const c = active.value;
  if (!c || !trackNo.value.trim()) return;
  logisticsBusy.value = true;
  try {
    const r = await trackShopLogistics(c.id, {
      trackingNo: trackNo.value.trim(),
      phone: trackPhone.value.trim() || undefined,
    });
    if (r.error) ElMessage.error(r.error);
    else trackResult.value = r.result || null;
  } finally {
    logisticsBusy.value = false;
  }
}

// ---------- 演示数据（按项目隔离） ----------
const demoShops = computed(() => projectConns.value.filter((c) => c.demo));
const demoBusy = ref(false);

async function makeDemos(): Promise<void> {
  demoBusy.value = true;
  try {
    const { error, items } = await getDemoTemplates();
    if (error) { ElMessage.error(error); return; }
    if (!items.length) { ElMessage.warning('后端没有可用的演示模板'); return; }
    let first = '';
    for (const t of items) {
      // 同名项目已存在则复用，避免点两次生成两套
      const existing = chatStore.conversations.find((c) => (c.title || '') === t.title);
      const pid = existing?.id || await chatStore.createConversation(t.title);
      const err = await seedDemoShops(pid, t.key);
      if (err) { ElMessage.error(err); return; }
      if (!first) first = pid;
    }
    await chatStore.loadConversations();
    if (first) await chat.selectConv(first);
    ElMessage.success(`已创建 ${items.length} 个演示项目 —— 带「演示」标记，可一键清空`);
  } finally {
    demoBusy.value = false;
  }
}

async function clearDemos(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `清空当前项目的 ${demoShops.value.length} 条演示数据？只删带「演示」标记的记录，你自己登记的一条不动。`,
      '清空演示数据',
      { type: 'warning' },
    );
  } catch { return; }
  demoBusy.value = true;
  try {
    const err = await clearDemoShops(activeProjectId.value || undefined);
    if (err) ElMessage.error(err);
    else ElMessage.success('演示数据已清空');
  } finally {
    demoBusy.value = false;
  }
}

// ---------- 表单 ----------
const dialogVisible = ref(false);
const editing = ref<string>('');
const saving = ref(false);
const form = ref({ platform: 'amazon', site: '', shopName: '', sellerId: '', tag: '', secret: '', groupId: '', note: '' });

function resetForm(): void {
  form.value = { platform: 'amazon', site: '', shopName: '', sellerId: '', tag: '', secret: '', groupId: '', note: '' };
}

/**
 * 切换平台 → 重建凭据字段（默认值会跟着变，如顺丰的 env）。
 * ★ 必须放在 `const form` 之后：watch 会**同步求值** getter，
 *   写在前面会触发 TDZ 的 ReferenceError，让整个组件初始化失败（表现为切模式无反应）。
 */
watch(() => form.value.platform, () => {
  if (dialogVisible.value) resetCredForm();
});

function openCreate(): void {
  if (!activeProjectId.value) {
    ElMessage.warning('先在左侧新建一个店铺项目，资源都归属到项目里');
    return;
  }
  editing.value = '';
  resetForm();
  resetCredForm();
  dialogVisible.value = true;
}

function openEdit(): void {
  const c = active.value;
  if (!c) return;
  editing.value = c.id;
  form.value = {
    platform: c.platform, site: c.site, shopName: c.shopName, sellerId: c.sellerId || '',
    tag: c.tag || '', secret: '', groupId: c.groupId || '', note: c.note || '',
  };
  // 非密钥字段（partnerID / customerNo / env）回填；密钥永远留空
  resetCredForm(c.credMeta);
  dialogVisible.value = true;
}

async function submit(): Promise<void> {
  if (!form.value.shopName.trim()) { ElMessage.warning('店铺名必填'); return; }

  // 物流连接：凭据按服务商声明的字段组装成 JSON（整组加密存储）
  let secret = form.value.secret;
  const logisticsWithSchema = formPlatformKind.value === 'logistics' && formCredentials.value.length > 0;
  if (logisticsWithSchema) {
    const anyFilled = formCredentials.value.some((f) => String(credForm.value[f.key] ?? '').trim());
    if (anyFilled) {
      // 编辑时密钥字段可留空（沿用旧值），其余必填项仍需填写
      const missing = formCredentials.value
        .filter((f) => f.required && !String(credForm.value[f.key] ?? '').trim() && !(editing.value && f.secret))
        .map((f) => f.label);
      if (missing.length) { ElMessage.warning(`请填写：${missing.join('、')}`); return; }
    }
    secret = buildCredsPayload();
  }

  saving.value = true;
  try {
    const payload = {
      platform: form.value.platform,
      site: form.value.site.trim(),
      shopName: form.value.shopName.trim(),
      sellerId: form.value.sellerId.trim() || undefined,
      tag: form.value.tag || undefined,
      secret,
      groupId: form.value.groupId || undefined,
      note: form.value.note.trim() || undefined,
      projectId: activeProjectId.value || undefined,
    };
    const err = editing.value ? await updateShop(editing.value, payload) : await createShop(payload);
    if (err) { ElMessage.error(err); return; }
    ElMessage.success(editing.value ? '已保存' : '已创建');
    dialogVisible.value = false;
  } finally {
    saving.value = false;
  }
}

const checking = ref(false);
async function runCheck(): Promise<void> {
  const c = active.value;
  if (!c) return;
  checking.value = true;
  try {
    const err = await checkShop(c.id);
    if (err) ElMessage.error(err);
  } finally {
    checking.value = false;
  }
}

async function removeShop(): Promise<void> {
  const c = active.value;
  if (!c) return;
  try {
    await ElMessageBox.confirm(
      `删除店铺登记「${c.shopName}」？只删这条记录，不动任何线上数据。`,
      '删除确认',
      { type: 'warning' },
    );
  } catch { return; }
  const err = await deleteShop(c.id);
  if (err) ElMessage.error(err);
  else ElMessage.success('已删除');
}

/** 切到 AI 主导：对话居中（工作台收起），便于直接下分析指令 */
function goAiLed(): void {
  setLead('shop', 'ai');
  ElMessage.info('已切到 AI 主导 —— 对话已占主区，右上角的切换按钮可切回工作台');
}

onMounted(async () => {
  await loadShopConsole();
  // 进店铺模式：项目 = 店铺会话。没有当前会话时自动落到最近一个店铺项目；
  // 一个都没有就保持「未归属」，等用户新建项目或创建演示数据。
  try {
    await chatStore.loadConversations();
    if (!chatStore.currentConvId && chatStore.conversations.length) {
      await chat.selectConv(chatStore.conversations[0].id);
    }
  } catch { /* 会话列表拉不到不影响资源管理 */ }
});
</script>

<!-- 对话区样式来自 views/chat.css（与办公/开发/剪辑同一份）：.messages 的 flex/滚动/内边距都在那里，
     不引就会「消息顶到最上沿 + 被上方条压住」。本文件在 views/plugin/ 下，路径比工作台多一层 .. -->
<style src="../chat.css"></style>

<style scoped>
/* ★ 布局盒子（左栏 + 分隔条 + 折叠条 + 主区）已交给 components/console/ConsoleShell.vue，
   与运维控制台共用同一套壳；这里只留本页自己的内容样式。 */
.shop-side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.shop-side-title { font-weight: 600; font-size: 13px; color: var(--el-text-color-regular); }
.shop-tree { overflow: auto; min-height: 0; }
.shop-tree-group { margin-bottom: 10px; }
.shop-tree-glabel {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 2px 4px;
}
.shop-tree-count { opacity: 0.7; }
.shop-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.shop-item:hover { background: var(--el-fill-color-light); }
.shop-item.active { background: var(--el-color-primary-light-9); }
.shop-item-icon { color: var(--el-color-primary); }
.shop-item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shop-item-site { font-size: 11px; color: var(--el-text-color-secondary); white-space: nowrap; }
.shop-empty { font-size: 13px; color: var(--el-text-color-regular); }
.shop-empty-hint { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.7; }
.shop-main { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; gap: 6px; position: relative; }
.shop-work { flex: 1; min-width: 0; min-height: 0; overflow: auto; }
/* ★ 不能写 height:100%：el-tabs 会把内容裁在内部（.el-tabs__content 默认 overflow:hidden），
   页签内容一超长就既看不全也滚不动。改成 min-height 让内容自然增高，滚动交给 .shop-work。 */
.shop-tabs { min-height: 100%; }

/* ===== 常驻 AI 对话栏 =====
   human：工作台占主区、对话固定宽在右；ai：工作台收起、对话占主区（LeadToggle 切换）。 */
.shop-chat {
  flex: 0 0 var(--shop-chat-w, 380px); width: var(--shop-chat-w, 380px);
  min-width: 0; min-height: 0;
  display: flex; flex-direction: column; overflow: hidden;
  border-left: 1px solid var(--el-border-color-lighter);
  padding-left: 6px;
}
.shop-main.is-lead-ai .shop-work { display: none; }
.shop-main.is-lead-ai .shop-chat {
  flex: 1 1 auto; width: auto; border-left: none; padding-left: 0;
}
.shop-chat-head {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; flex: none;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.shop-chat-icon { color: var(--el-color-primary); }
.shop-chat-title { font-size: 12px; font-weight: 600; color: var(--el-text-color-regular); }
.shop-chat-spacer { flex: 1; }
.shop-chat-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border: none; border-radius: 6px;
  background: transparent; color: var(--el-text-color-secondary); cursor: pointer;
}
.shop-chat-btn:hover { background: var(--el-fill-color-light); color: var(--el-color-primary); }

/* LeadToggle 默认是右下角悬浮，在本页会压住发送按钮 —— 收进对话栏头部做内联按钮 */
.shop-chat-head :deep(.lead-toggle-wrap) { position: static; right: auto; bottom: auto; z-index: auto; }
.shop-chat-head :deep(.lead-fab) {
  width: 24px; height: 24px; border-radius: 6px;
  box-shadow: none; background: transparent;
}
.shop-chat-head :deep(.lead-fab:hover) { background: var(--el-fill-color-light); }
.shop-chat-head :deep(.lead-fab-tip) { right: 0; bottom: auto; top: calc(100% + 6px); }

/* 对话栏收起后的悬浮入口 */
.shop-chat-fab {
  position: absolute; right: 14px; bottom: 14px; z-index: 6;
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 10px; border-radius: 16px; cursor: pointer;
  border: 1px solid var(--el-border-color); background: var(--el-bg-color);
  color: var(--el-color-primary); font-size: 12px;
  box-shadow: var(--el-box-shadow-light);
}
.shop-chat-fab:hover { border-color: var(--el-color-primary); }
.shop-placeholder { padding: 24px 4px; color: var(--el-text-color-regular); }
.shop-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 12px;
}
.shop-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.shop-card-head h3 { margin: 0; font-size: 16px; }
.shop-kv { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px 16px; margin: 0; }
.shop-kv > div { display: flex; gap: 8px; font-size: 13px; }
.shop-kv dt { color: var(--el-text-color-secondary); min-width: 72px; margin: 0; }
.shop-kv dd { margin: 0; word-break: break-all; }

/* ===== 演示经营快照（KPI + 明细表） ===== */
.shop-snapshot {
  margin-top: 14px; padding-top: 12px;
  border-top: 1px dashed var(--el-border-color-lighter);
}
.shop-kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.shop-kpi {
  display: flex; flex-direction: column; gap: 2px;
  padding: 10px 12px; border-radius: 8px;
  background: var(--el-fill-color-lighter);
}
.shop-kpi-label { font-size: 11px; color: var(--el-text-color-secondary); }
.shop-kpi-value { font-size: 18px; font-weight: 600; color: var(--el-text-color-primary); }
.shop-kpi-hint { font-size: 11px; color: var(--el-text-color-secondary); }
.shop-snap-table { margin-top: 12px; }
.shop-snap-title { font-size: 12px; font-weight: 600; margin: 0 0 6px; }
.shop-snap-note { font-size: 11px; color: var(--el-text-color-secondary); margin: 8px 0 0; line-height: 1.6; }
.shop-card-actions { display: flex; gap: 8px; margin-top: 12px; }

/* ===== 物流：测试连接 + 轨迹 ===== */
.shop-logi {
  margin-top: 12px; padding-top: 12px;
  border-top: 1px dashed var(--el-border-color-lighter);
}
.shop-logi-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.shop-logi-row + .shop-logi-row { margin-top: 8px; }
.shop-logi-input { flex: 1; min-width: 200px; }
.shop-logi-phone { width: 150px; }
.shop-logi-note { font-size: 12px; line-height: 1.6; }
.shop-logi-note.ok { color: var(--el-color-success); }
.shop-logi-note.err { color: var(--el-color-danger); }
.shop-logi-result {
  margin-top: 10px; padding: 10px 12px; border-radius: 8px;
  font-size: 12px; background: var(--el-fill-color-lighter);
}
.shop-logi-result.ok { background: var(--el-color-success-light-9); }
.shop-logi-result.err { background: var(--el-color-danger-light-9); }
.shop-logi-result-head { margin: 0; font-weight: 600; line-height: 1.6; }
.shop-logi-events { margin: 8px 0 0; padding-left: 16px; max-height: 260px; overflow: auto; }
.shop-logi-events li { line-height: 1.8; display: flex; gap: 8px; flex-wrap: wrap; }
.shop-logi-time { color: var(--el-text-color-secondary); white-space: nowrap; }
.shop-logi-loc { color: var(--el-color-primary); white-space: nowrap; }
.shop-logi-desc { flex: 1; min-width: 180px; }
.shop-logi-status { color: var(--el-text-color-secondary); }
.shop-cred-note { margin: 0 0 8px 110px; font-size: 12px; color: var(--el-text-color-secondary); }
.shop-check { border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 12px; }
.shop-check.ok { background: var(--el-color-success-light-9); border: 1px solid var(--el-color-success-light-7); }
.shop-check.err { background: var(--el-color-warning-light-9); border: 1px solid var(--el-color-warning-light-7); }
.shop-check-head { font-weight: 600; }
.shop-check-sub { font-weight: 400; font-size: 12px; color: var(--el-text-color-secondary); }
.shop-check-list { margin: 6px 0 0; padding-left: 18px; line-height: 1.8; }
.shop-check-list .is-issue { color: var(--el-color-danger); }
.shop-next { border-top: 1px dashed var(--el-border-color-lighter); padding-top: 12px; }
.shop-next-title { font-size: 13px; font-weight: 600; margin: 0 0 6px; }
.shop-form-full { width: 100%; }
.shop-form-tip { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.6; }
.shop-audit { margin-top: 4px; }

/* ===== 项目列表（左栏）===== */
.shop-projects { flex: 1; min-height: 0; overflow: auto; }
.shop-project {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 8px; border-radius: 6px; cursor: pointer;
  font-size: 13px;
}
.shop-project:hover { background: var(--el-fill-color-light); }
.shop-project.active { background: var(--el-color-primary-light-9); }
.shop-project-icon { color: var(--el-color-primary); }
.shop-project-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shop-project-count {
  font-size: 11px; color: var(--el-text-color-secondary);
  background: var(--el-fill-color); border-radius: 8px; padding: 0 6px;
}

/* ===== 当前项目头 + 资源列表 ===== */
.shop-work-head {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 2px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.shop-work-title { font-size: 14px; font-weight: 600; }
.shop-work-sub { font-size: 11px; color: var(--el-text-color-secondary); }
.shop-work-spacer { flex: 1; }
.shop-conn-list { display: flex; flex-direction: column; gap: 4px; }
.shop-conn-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 8px; cursor: pointer;
  border: 1px solid transparent; font-size: 13px;
}
.shop-conn-row:hover { background: var(--el-fill-color-light); }
.shop-conn-row.active {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-7);
}
.shop-conn-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shop-conn-meta { font-size: 11px; color: var(--el-text-color-secondary); white-space: nowrap; }
.shop-tag-gap { margin-left: 6px; }
.shop-na { color: var(--el-text-color-placeholder); }
/* 页签表格：整行可点，选中行高亮（与详情卡对应） */
.shop-work :deep(.el-table__row) { cursor: pointer; }
.shop-work :deep(.shop-row-active td) { background: var(--el-color-primary-light-9) !important; }

/* 演示数据入口：贴在左栏底部，不占资源列表的视觉重心 */
.shop-demo {
  margin-top: auto; padding-top: 8px;
  border-top: 1px dashed var(--el-border-color-lighter);
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
}
.shop-demo-hint { font-size: 11px; color: var(--el-text-color-secondary); }

/* 「口径速查」页签 */
.shop-ref-lead { margin: 0 0 12px; }
.shop-ref-group { margin-bottom: 16px; }
.shop-ref-group-title {
  font-size: 12px; font-weight: 600; color: var(--el-text-color-regular);
  margin: 0 0 8px;
}
.shop-ref-api {
  font-size: 11px; margin: 8px 0 0; line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.shop-ref-api a { margin-left: 6px; color: var(--el-color-primary); }
.shop-ref-api.is-pending { color: var(--el-color-warning); }
.shop-ref-api.is-ready { color: var(--el-color-success); }

/* ===== 窄屏收敛（≤1280）=====
   1280 宽时三栏（资源 240 + 工作台 + 对话 360）仍能放下，但工作台里的两列 KV、
   平台入口和标签会把卡片挤成锯齿 —— 这里收成单列，并让出侧栏里的站点文字。 */
@media (max-width: 1280px) {
  .shop-kv { grid-template-columns: 1fr; }
  .shop-item-site { display: none; }
  .shop-card { padding: 12px; }
  .shop-ref-grid { grid-template-columns: 1fr; }
  .shop-chat { padding-left: 4px; }
}
/* 更窄（≤1024）：对话栏默认已收起（见 chatCollapsed 初值），再次展开时给工作台留更多空间 */
@media (max-width: 1024px) {
  .shop-chat { flex-basis: 300px; width: 300px; }
  .shop-chat-head { padding: 6px 4px; }
}
.shop-ref-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.shop-ref-card { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 12px 14px; }
.shop-ref-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px; }
.shop-ref-list { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.8; }
.shop-ref-entry { font-size: 12px; margin: 8px 0 4px; word-break: break-all; }
.shop-ref-entry a { color: var(--el-color-primary); }
.shop-ref-note { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.7; margin: 4px 0 0; }
.shop-ref-boundary {
  margin-top: 16px;
  border-top: 1px dashed var(--el-border-color-lighter);
  padding-top: 12px;
}
.shop-ref-boundary-title { font-size: 13px; font-weight: 600; margin: 0 0 6px; }
</style>
