<template>
  <el-dialog
    :model-value="modelValue"
    :title="editing ? `编辑店铺 · ${editing.shopName}` : '新建店铺 / 仓库 / 物流服务'"
    width="560px"
    append-to-body
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <el-form label-width="110px">
      <el-form-item label="平台" required>
        <el-select v-model="form.platform" :disabled="!!editing" class="shop-form-full">
          <el-option-group v-for="g in platformGroups" :key="g.kind" :label="g.label">
            <el-option v-for="p in g.items" :key="p.id" :label="p.label" :value="p.id" />
          </el-option-group>
        </el-select>
      </el-form-item>
      <el-form-item :label="siteLabel">
        <el-input v-model="form.site" :placeholder="sitePlaceholder" />
        <span class="shop-form-tip">{{ siteTip }}</span>
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
        <span class="shop-form-tip">标记「生产」后，写操作会额外要求人工批准（approveProduction）。</span>
      </el-form-item>
      <!-- 凭据字段由后端下发：物流商（顺丰/云途）与店铺平台（Shopify 等）共用同一套渲染 -->
      <template v-if="credentials.length">
        <el-form-item label="需要准备">
          <div class="shop-cred-guide">
            <p><strong>{{ credentials.map((f) => f.label).join('、') }}</strong></p>
            <p>{{ platformInfo?.loginNote }}</p>
            <p class="shop-form-tip">密钥类字段只加密存储、永不回显；编辑时留空表示沿用原值。</p>
            <a
              v-if="platformInfo?.integration?.docsUrl"
              :href="platformInfo.integration.docsUrl"
              target="_blank"
              rel="noreferrer noopener"
            >打开开放平台文档 →</a>
          </div>
        </el-form-item>
        <el-form-item v-for="f in credentials" :key="f.key" :label="f.label" :required="!!f.required">
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
      <el-form-item v-else-if="platformKind === 'logistics'" label="凭据">
        <span class="shop-form-tip">该服务商还没有客户端，先登记即可；接好后再来这里填凭据。</span>
      </el-form-item>
      <el-form-item v-else label="API 凭据（JSON）">
        <el-input v-model="form.secret" type="password" show-password :placeholder="editing ? '留空沿用原有凭据' : '可选；该平台尚未支持结构化字段'" />
        <span class="shop-form-tip">该平台还没有结构化凭据表单与 API 客户端；如需先用 JSON 暂存。接入后这里会按字段渲染并写明去后台哪里获取。</span>
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
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit()">{{ editing ? '保存' : '创建' }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
// 连接弹窗：新建 / 编辑店铺、仓库、物流服务（凭据字段由平台清单驱动，整组加密）。
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import {
  shopPlatforms, shopGroups, createShop, updateShop,
  type ShopConnection,
} from '../shopSession';

const props = defineProps<{
  modelValue: boolean;
  editing: ShopConnection | null;
  projectId: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved'): void;
}>();

const saving = ref(false);
const form = ref({ platform: 'amazon', site: '', shopName: '', sellerId: '', tag: '', secret: '', groupId: '', note: '' });
const credForm = ref<Record<string, string>>({});

const platformGroups = computed(() => (['store', 'warehouse', 'logistics'] as const)
  .map((kind) => ({ kind, label: kind === 'store' ? '店铺' : kind === 'warehouse' ? '仓储' : '物流', items: shopPlatforms.value.filter((p) => p.kind === kind) }))
  .filter((g) => g.items.length));

const platformInfo = computed(() => shopPlatforms.value.find((p) => p.id === form.value.platform));
const platformKind = computed(() => platformInfo.value?.kind ?? 'store');
const credentials = computed(() => platformInfo.value?.credentials || []);

const siteLabel = computed(() => (platformKind.value === 'warehouse' ? '仓库名 / 站点' : platformKind.value === 'logistics' ? '服务范围' : '站点 / 市场'));
const sitePlaceholder = computed(() => (platformKind.value === 'warehouse'
  ? '如 US-West 海外仓'
  : platformKind.value === 'logistics'
    ? '如 华东 / 美西（可留空）'
    : '如亚马逊 US/EU/JP、淘宝 taobao/tmall'));
const siteTip = computed(() => (platformKind.value === 'store'
  ? '站点会影响佣金、税与竞争口径的判断，务必与实际经营站点一致。'
  : platformKind.value === 'logistics'
    ? '物流商没有"站点"概念，这里只填合作范围，可留空。'
    : '仓库名即口径，建议与服务商系统里的名称一致。'));

function resetCredForm(prefill?: Record<string, string>): void {
  const o: Record<string, string> = {};
  for (const f of credentials.value) o[f.key] = prefill?.[f.key] || f.defaultValue || '';
  if (prefill) for (const [k, v] of Object.entries(prefill)) if (!o[k]) o[k] = v;
  credForm.value = o;
}

function buildCredsPayload(): string {
  const o: Record<string, string> = {};
  for (const f of credentials.value) {
    const v = String(credForm.value[f.key] ?? '').trim();
    if (v) o[f.key] = v;
    else if (f.defaultValue) o[f.key] = f.defaultValue;
  }
  return Object.keys(o).length ? JSON.stringify(o) : '';
}

/**
 * 切换平台 → 重建凭据字段（默认值会跟着变，如顺丰的 env）。
 * ★ 必须放在 `const form` 之后：watch 会**同步求值** getter，
 *   写在前面会触发 TDZ 的 ReferenceError（2026-10-21 真机事故）。
 */
watch(() => form.value.platform, () => {
  if (props.modelValue) resetCredForm();
});

watch(() => props.modelValue, (visible) => {
  if (!visible) return;
  const c = props.editing;
  form.value = {
    platform: c?.platform || 'amazon',
    site: c?.site || '',
    shopName: c?.shopName || '',
    sellerId: c?.sellerId || '',
    tag: c?.tag || '',
    secret: '',
    groupId: c?.groupId || '',
    note: c?.note || '',
  };
  resetCredForm(c?.credMeta);
}, { immediate: true });

async function submit(): Promise<void> {
  if (!form.value.shopName.trim()) { ElMessage.warning('店铺名必填'); return; }

  // 有结构化凭据字段的平台（物流商 + 已接入 API 的店铺平台）：按字段组装成 JSON，整组加密存储
  let secret = form.value.secret;
  const withSchema = credentials.value.length > 0;
  if (withSchema) {
    const anyFilled = credentials.value.some((f) => String(credForm.value[f.key] ?? '').trim());
    if (anyFilled) {
      const missing = credentials.value
        .filter((f) => f.required && !String(credForm.value[f.key] ?? '').trim() && !(props.editing && f.secret))
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
      projectId: props.projectId || undefined,
    };
    const err = props.editing
      ? await updateShop(props.editing.id, payload)
      : await createShop(payload);
    if (err) { ElMessage.error(err); return; }
    ElMessage.success(props.editing ? '已保存' : '已创建');
    emit('saved');
  } finally {
    saving.value = false;
  }
}
</script>
