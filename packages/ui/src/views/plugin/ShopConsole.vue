<template>
  <div class="shop-layout">
    <!-- ============ 左栏：店铺 / 仓库资源 ============ -->
    <aside class="shop-side">
      <div class="shop-side-head">
        <span class="shop-side-title">资源</span>
        <el-button size="small" type="primary" plain :icon="Plus" @click="openCreate()">新建</el-button>
      </div>

      <div v-if="!shopConnections.length" class="shop-empty">
        <p>还没有登记任何店铺 / 仓库。</p>
        <p class="shop-empty-hint">
          登记只是"告诉助手我在经营哪家店"，用于对齐站点与成本口径；
          <strong>不需要填账号密码</strong> —— 平台数据由助手委派 pageAgent 打开卖家后台获取，
          登录由你在浏览器面板完成。
        </p>
      </div>

      <div v-else class="shop-tree">
        <div v-for="node in treeRows" :key="node.id" class="shop-tree-group">
          <div class="shop-tree-glabel">
            <span>{{ node.name }}</span>
            <span class="shop-tree-count">{{ node.items.length }}</span>
          </div>
          <div
            v-for="c in node.items"
            :key="c.id"
            class="shop-item"
            :class="{ active: c.id === shopActiveId }"
            @click="selectShop(c.id)"
          >
            <el-icon class="shop-item-icon"><Shop /></el-icon>
            <span class="shop-item-name" :title="c.shopName">{{ c.shopName }}</span>
            <el-tag v-if="c.isProduction" size="small" type="danger" effect="plain">生产</el-tag>
            <span class="shop-item-site">{{ platformLabel(c.platform) }}<template v-if="c.site"> · {{ c.site }}</template></span>
          </div>
        </div>
      </div>
    </aside>

    <!-- ============ 主区 ============ -->
    <section class="shop-main">
      <el-tabs v-model="tab" class="shop-tabs">
        <el-tab-pane label="工作台" name="workbench">
          <div v-if="!active" class="shop-placeholder">
            <p>左侧选中一个店铺 / 仓库，或先「新建」登记一条。</p>
            <p class="shop-empty-hint">
              本模式当前为<strong>只读</strong>：可以抓数、比价、算利润、出选品清单与优化建议；
              改价 / 上下架 / 回消息等写操作尚未开放。
            </p>
          </div>

          <template v-else>
            <div class="shop-card">
              <div class="shop-card-head">
                <h3>{{ active.shopName }}</h3>
                <el-tag v-if="active.isProduction" type="danger" effect="plain">生产店铺</el-tag>
                <el-tag v-else-if="active.tag" type="info" effect="plain">{{ active.tag }}</el-tag>
              </div>
              <dl class="shop-kv">
                <div><dt>平台</dt><dd>{{ platformLabel(active.platform) }}</dd></div>
                <div><dt>站点 / 市场</dt><dd>{{ active.site || '—' }}</dd></div>
                <div><dt>卖家 ID</dt><dd>{{ active.sellerId || '—' }}</dd></div>
                <div><dt>API 凭据</dt><dd>{{ active.hasSecret ? '已配置' : '未配置（纯浏览器流程不需要）' }}</dd></div>
                <div><dt>最近自检</dt><dd>{{ fmtTime(active.lastCheckAt) }}</dd></div>
                <div v-if="active.note"><dt>备注</dt><dd>{{ active.note }}</dd></div>
              </dl>

              <div class="shop-card-actions">
                <el-button size="small" :loading="checking" @click="runCheck()">配置自检</el-button>
                <el-button size="small" @click="openEdit()">编辑</el-button>
                <el-button size="small" type="danger" plain @click="removeShop()">删除</el-button>
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

            <div class="shop-next">
              <p class="shop-next-title">下一步：让助手干活</p>
              <p class="shop-empty-hint">
                在对话里直接说要做什么（例：<em>帮我分析这个品类的竞品和利润，目标站点美国</em>）。
                若要开一个长期目录，建议在左侧任务列表建一个绑「店铺运营」类型的目录 —— 那样选品清单与测算表会
                自动落到该目录的资源结构里（00-source / 02-work / 03-output），跨会话可复用。
              </p>
              <el-button size="small" type="primary" plain @click="goAiLed()">切到 AI 主导（对话居中）</el-button>
            </div>
          </template>
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

          <div class="shop-ref-grid">
            <div v-for="p in shopPlatforms" :key="p.id" class="shop-ref-card">
              <div class="shop-ref-head">
                <strong>{{ p.label }}</strong>
                <el-tag size="small" effect="plain" :type="p.kind === 'warehouse' ? 'warning' : 'info'">
                  {{ p.kind === 'warehouse' ? '仓储' : '店铺' }}
                </el-tag>
              </div>
              <ul class="shop-ref-list">
                <li v-for="(m, i) in p.keyMetrics" :key="i">{{ m }}</li>
              </ul>
              <p v-if="p.entryUrl" class="shop-ref-entry">
                入口：<a :href="p.entryUrl" target="_blank" rel="noreferrer noopener">{{ p.entryUrl }}</a>
              </p>
              <p class="shop-ref-note">{{ p.loginNote }}</p>
            </div>
          </div>

          <div class="shop-ref-boundary">
            <p class="shop-ref-boundary-title">本模式能做什么 / 不能做什么</p>
            <ul class="shop-ref-list">
              <li><strong>能做（只读分析）</strong>：跨境选品分析、Listing 与详情优化建议、广告与利润测算（ACoS / 盈亏平衡 ACoS）、1688 货源与铺货差价、头程比选与库存补货台账；产出都是可照做的清单与测算表。</li>
              <li><strong>做不了（本版本）</strong>：改价、改库存、上下架、报名活动、回消息 —— 这些写操作要等后续版本，且届时每个动作都要走变更单 + 二次确认 + 审计。</li>
              <li><strong>不做（长期边界）</strong>：不代下单、不代铺货、不代替你与平台/供应商成交；不绕过平台风控；不碰用户账号密码（登录一律由你在浏览器面板完成）。</li>
            </ul>
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>

    <!-- ============ 新建 / 编辑弹窗 ============ -->
    <el-dialog v-model="dialogVisible" :title="editing ? `编辑店铺 · ${form.shopName}` : '新建店铺 / 仓库'" width="560px">
      <el-form label-width="110px">
        <el-form-item label="平台" required>
          <el-select v-model="form.platform" :disabled="!!editing" class="shop-form-full">
            <el-option v-for="p in shopPlatforms" :key="p.id" :label="p.label" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="站点 / 市场">
          <el-input v-model="form.site" :placeholder="isWarehouse ? '仓库名（如 US-West 海外仓）' : '如亚马逊 US/EU/JP、淘宝 taobao/tmall'" />
          <span class="shop-form-tip">站点会影响佣金、税与竞争口径的判断，务必与实际经营站点一致。</span>
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
        <el-form-item label="API 凭据">
          <el-input v-model="form.secret" type="password" show-password :placeholder="editing ? '留空沿用原有凭据' : '可选；纯浏览器流程不需要'" />
          <span class="shop-form-tip">仅当要用平台 API（如亚马逊 SP-API）时才需要。凭据加密存储，接口永不回显。</span>
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
  </div>
</template>

<script setup lang="ts">
// 店铺运营控制台（/shop）。形态照 OpsConsole 的三段式（左栏资源 + 主区 + 页签），
// 但**刻意只做 P0 能诚实交付的东西**：资源管理 + 配置自检 + 审计。
// 不在这里假装"店铺概览指标"——那需要真实取数，而取数走对话里的 pageAgent。
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Shop } from '@element-plus/icons-vue';
import { setLead } from '../../stores/mode';
import {
  shopConnections, shopGroups, shopPlatforms, shopActiveId, shopCheck, shopCheckId,
  shopAudit, SHOP_UNGROUPED,
  loadShopConsole, selectShop, createShop, updateShop, deleteShop, checkShop,
} from './shopSession';

const tab = ref<'workbench' | 'audit' | 'reference'>('workbench');

const active = computed(() => shopConnections.value.find((c) => c.id === shopActiveId.value) || null);
/** 自检结果必须与当前选中的店铺同 id 才显示（换店后旧结论不能串台） */
const checkForActive = computed(() =>
  (shopCheckId.value && shopCheckId.value === shopActiveId.value ? shopCheck.value : null));

const treeRows = computed(() => {
  const byGroup = new Map<string, typeof shopConnections.value>();
  for (const c of shopConnections.value) {
    const gid = c.groupId || SHOP_UNGROUPED;
    const arr = byGroup.get(gid) || [];
    arr.push(c);
    byGroup.set(gid, arr);
  }
  const rows: Array<{ id: string; name: string; items: typeof shopConnections.value }> = [];
  for (const g of shopGroups.value) {
    const items = byGroup.get(g.id) || [];
    if (items.length) rows.push({ id: g.id, name: g.name, items });
  }
  const un = byGroup.get(SHOP_UNGROUPED);
  if (un?.length) rows.push({ id: SHOP_UNGROUPED, name: '未分组', items: un });
  return rows;
});

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

const isWarehouse = computed(() => form.value.platform === 'warehouse');

// ---------- 表单 ----------
const dialogVisible = ref(false);
const editing = ref<string>('');
const saving = ref(false);
const form = ref({ platform: 'amazon', site: '', shopName: '', sellerId: '', tag: '', secret: '', groupId: '', note: '' });

function resetForm(): void {
  form.value = { platform: 'amazon', site: '', shopName: '', sellerId: '', tag: '', secret: '', groupId: '', note: '' };
}

function openCreate(): void {
  editing.value = '';
  resetForm();
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
  dialogVisible.value = true;
}

async function submit(): Promise<void> {
  if (!form.value.shopName.trim()) { ElMessage.warning('店铺名必填'); return; }
  saving.value = true;
  try {
    const payload = {
      platform: form.value.platform,
      site: form.value.site.trim(),
      shopName: form.value.shopName.trim(),
      sellerId: form.value.sellerId.trim() || undefined,
      tag: form.value.tag || undefined,
      secret: form.value.secret,
      groupId: form.value.groupId || undefined,
      note: form.value.note.trim() || undefined,
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

/** 切到 AI 主导：对话居中，便于直接下分析指令 */
function goAiLed(): void {
  setLead('shop', 'ai');
  ElMessage.info('已切到 AI 主导 —— 目标框已让给对话');
}

onMounted(() => { void loadShopConsole(); });
</script>

<style scoped>
.shop-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 12px;
  height: 100%;
  min-height: 0;
  padding: 12px;
  box-sizing: border-box;
}
.shop-side {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--el-border-color-lighter);
  padding-right: 12px;
}
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
.shop-main { min-width: 0; overflow: auto; }
.shop-tabs { height: 100%; }
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
.shop-card-actions { display: flex; gap: 8px; margin-top: 12px; }
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

/* 「口径速查」页签 */
.shop-ref-lead { margin: 0 0 12px; }
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
