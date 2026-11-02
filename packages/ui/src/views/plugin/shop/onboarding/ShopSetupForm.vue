<template>
  <section class="shop-setup-form" aria-labelledby="shop-setup-form-title">
    <div class="shop-setup-form-head">
      <div>
        <span class="shop-setup-kicker">第一步 · 经营口径</span>
        <h2 id="shop-setup-form-title">先定好，AI 再执行</h2>
      </div>
      <span class="shop-setup-saved">已自动保存</span>
    </div>
    <p class="shop-setup-form-lead">
      平台、市场、品类和预算会直接影响选品与利润测算。一次填完，后续对话不再重复问。
    </p>

    <el-form label-position="top" class="shop-setup-fields">
      <div class="shop-setup-field-grid">
        <el-form-item label="目标平台">
          <el-select :model-value="profile.platform" class="shop-form-full" @update:model-value="set('platform', $event)">
            <el-option v-for="item in SHOP_PLATFORM_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标市场">
          <el-input
            :model-value="profile.market"
            placeholder="如 美国 / 东南亚 / 中国"
            @update:model-value="set('market', $event)"
          />
        </el-form-item>
        <el-form-item label="品类 / 商品方向">
          <el-input
            :model-value="profile.category"
            placeholder="如 家居收纳 / 宠物用品"
            @update:model-value="set('category', $event)"
          />
        </el-form-item>
        <el-form-item label="可投入预算（元）">
          <el-input
            :model-value="profile.budgetYuan"
            inputmode="numeric"
            placeholder="首批货 + 流动资金"
            @update:model-value="set('budgetYuan', $event)"
          />
        </el-form-item>
      </div>

      <el-form-item label="经营主体">
        <el-radio-group :model-value="profile.entityType" @update:model-value="set('entityType', $event)">
          <el-radio-button v-for="item in entityOptions" :key="item.value" :value="item.value">
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
        <p class="shop-form-tip">{{ entityGuidance }}</p>
      </el-form-item>

      <el-form-item label="供货方式">
        <el-radio-group :model-value="profile.supplyChoice" @update:model-value="set('supplyChoice', $event)">
          <el-radio-button value="stocked">有货源</el-radio-button>
          <el-radio-button value="dropship">无货源</el-radio-button>
          <el-radio-button value="brand">自有品牌 / 工厂</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="账号与资质">
        <div class="shop-setup-checks">
          <el-checkbox :model-value="profile.hasAccount" @update:model-value="set('hasAccount', $event)">
            已有平台账号
          </el-checkbox>
          <el-checkbox :model-value="profile.hasQualification" @update:model-value="set('hasQualification', $event)">
            {{ qualificationLabel }}
          </el-checkbox>
        </div>
        <p v-if="profile.entityType === 'individual'" class="shop-form-tip">
          个人身份开店不需要营业执照；平台若要求类目资质，会在这里单独列出。
        </p>
      </el-form-item>

      <el-form-item label="投入经验与补充">
        <el-select :model-value="profile.experience" class="shop-form-full" @update:model-value="set('experience', $event)">
          <el-option label="第一次开店" value="beginner" />
          <el-option label="做过一些电商" value="some" />
          <el-option label="有成熟经验" value="experienced" />
        </el-select>
        <el-input
          :model-value="profile.notes"
          type="textarea"
          :rows="2"
          resize="none"
          placeholder="可选：不能做的品类、已有供应链、每周投入时间等"
          @update:model-value="set('notes', $event)"
        />
      </el-form-item>
    </el-form>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  SHOP_PLATFORM_OPTIONS,
  entityGuidanceOf,
  shopEntityOptionsOf,
  type ShopSetupProfile,
} from './shopOnboarding';

const props = defineProps<{
  profile: ShopSetupProfile;
}>();

const emit = defineEmits<{
  (e: 'update:profile', value: ShopSetupProfile): void;
}>();

const entityOptions = computed(() => shopEntityOptionsOf(props.profile.platform));
const entityGuidance = computed(() => entityGuidanceOf(props.profile));

const qualificationLabel = computed(() => {
  if (props.profile.entityType === 'individual') return '平台要求的个人实名资料已备齐';
  if (props.profile.entityType === 'sole_proprietor' || props.profile.entityType === 'company') {
    return '营业执照与主体 / 类目资质已备齐';
  }
  return '主体 / 类目资质已备齐';
});

function set<K extends keyof ShopSetupProfile>(key: K, value: unknown): void {
  emit('update:profile', { ...props.profile, [key]: value as ShopSetupProfile[K] });
}
</script>
