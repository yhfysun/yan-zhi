<script setup lang="ts">
/**
 * M1 门禁卡 NFC 复制 · 课程内交互实验台
 *
 * ★ 定位：教学模拟（虚构 DEMO 数据）+ 真机读卡两种模式，共用 @yan-zhi/shared 的 m1 内核判定。
 *   「成功/失败」的判定完全来自内核（m1CopyReason 是唯一出口），本组件只负责分步展示与输入。
 *
 * ★ 学习准则：一次只显示一个步骤，步骤条横向滚动，底部操作按钮常驻；
 *   实验前必须完成「自有或已授权卡」弹窗确认，未确认时整条链路锁定。
 *
 * ★ 真机模式：贴源卡 → 一次性读完并恢复密钥 → 弹窗要求换目标卡 → 贴目标卡 → 写入 → 结论。
 *   NFC 贴卡是异步的且卡片容易脱离，所以真机链路一次跑完（步骤条仍可回看每一步数据），
 *   不让用户在读卡中途逐步点按钮把卡弄掉线。
 */
import { computed, onMounted, ref } from 'vue';
import {
  M1_BLOCKS_PER_SECTOR,
  M1_DEFAULT_MAX_ATTEMPTS,
  M1_PUBLIC_DEFAULT_KEYS,
  m1AuthenticatorFromImage,
  m1CopyReason,
  m1MakeBlankTarget,
  m1MakeTeachingCard,
  m1NfcCapability,
  m1NfcDriver,
  m1ParseKeybook,
  m1PlanWrite,
  m1ReadDump,
  m1ReaderFromImage,
  m1RecoverSectorKeys,
  m1RunRealCopy,
  m1VerifyCopy,
  m1WriteDump,
  type M1CardImage,
  type M1CardPolicy,
  type M1Dump,
  type M1NfcCapability,
  type M1RecoverResult,
  type M1TargetKind,
  type M1VerifyResult,
  type M1WritePlan,
} from '@yan-zhi/shared';

type LabInfo = {
  target: string;
  tools: string[];
  steps: string[];
  expected: string;
  simulator?: string;
};

const props = defineProps<{ lab: LabInfo }>();

const POLICIES: Array<{ key: M1CardPolicy; name: string; detail: string }> = [
  { key: 'default', name: '出厂默认密钥', detail: '16 个扇区全部沿用出厂默认值，认证一次即通过。' },
  { key: 'weak', name: '简单加密', detail: '第 1–4 扇区换成常见弱密钥，仍在公开密码本里 —— 照样能完整复制。' },
  { key: 'strong', name: '字典外强密钥', detail: '第 7、8 扇区使用密码本外的密钥，恢复会明确失败。' },
];
const TARGETS: Array<{ key: M1TargetKind; name: string; detail: string }> = [
  { key: 'normal', name: '普通空白卡', detail: '块 0 的卡号出厂后不可改，复制会卡在最后一块。' },
  { key: 'uid-writable', name: '可改写卡号卡', detail: '块 0 可写，能连同卡号一起复制。' },
];
const STEP_LABELS = ['选卡', '识别', '密钥恢复', '读出整卡', '写入目标卡', '校验结论'];
const ACTION_LABELS = ['放卡识别', '开始密钥恢复', '读出整卡', '写入目标卡', '逐块校验', '重新演练'];

const authorized = ref(false);
const showConsent = ref(false);
const nfcCap = ref<M1NfcCapability | null>(null);
const stepIndex = ref(0);
const policy = ref<M1CardPolicy>('weak');
const targetKind = ref<M1TargetKind>('uid-writable');
const useBuiltin = ref(true);
const keybookText = ref('');
const busy = ref(false);
const mode = ref<'sim' | 'real'>('sim');
const showSwap = ref(false);
const hardwareError = ref('');
const stageHint = ref('');
let swapResolver: (() => void) | null = null;
let swapRejecter: ((error: Error) => void) | null = null;

const card = ref<M1CardImage | null>(null);
const recovery = ref<M1RecoverResult | null>(null);
const dump = ref<M1Dump | null>(null);
const plan = ref<M1WritePlan | null>(null);
const written = ref<M1Dump | null>(null);
const verify = ref<M1VerifyResult | null>(null);
const reason = ref('');
const attempts = ref(0);

const parsedKeybook = computed(() => m1ParseKeybook(keybookText.value));
const realMode = computed(() =>
  mode.value === 'real' && nfcCap.value?.available === true && m1NfcDriver() !== null,
);
const actionLabel = computed(() =>
  realMode.value && stepIndex.value === 0 ? '贴源卡并开始' : ACTION_LABELS[stepIndex.value],
);
const deviceLine = computed(() => {
  if (!nfcCap.value) return '';
  const base = nfcCap.value.available
    ? `真机读卡器已连接（${nfcCap.value.driverId}）`
    : `真机读卡器未连接：${nfcCap.value.reason} · 当前为教学模拟`;
  return nfcCap.value.available
    ? `${base} · 当前为${realMode.value ? '真机读卡' : '教学模拟'}`
    : base;
});
const keybook = computed(() => ({
  useBuiltin: useBuiltin.value,
  customKeys: parsedKeybook.value.keys,
}));
const candidateCount = computed(() =>
  (useBuiltin.value ? M1_PUBLIC_DEFAULT_KEYS.length : 0) + parsedKeybook.value.keys.length,
);
const currentPolicy = computed(() => POLICIES.find((item) => item.key === policy.value)!);
const copyOk = computed(() => verify.value?.ok === true);
const canAct = computed(() => authorized.value && !busy.value);

function resetResults() {
  recovery.value = null;
  dump.value = null;
  plan.value = null;
  written.value = null;
  verify.value = null;
  reason.value = '';
  attempts.value = 0;
}

/** 授权是「弹窗确认」，不是一个静默勾选框：真机与模拟走同一道闸。 */
function confirmConsent() {
  authorized.value = true;
  showConsent.value = false;
}

function revokeConsent() {
  authorized.value = false;
  showConsent.value = false;
  stepIndex.value = 0;
  card.value = null;
  hardwareError.value = '';
  stageHint.value = '';
  resetResults();
}

function waitForSwapConfirm(): Promise<void> {
  showSwap.value = true;
  return new Promise<void>((resolve, reject) => {
    swapResolver = resolve;
    swapRejecter = reject;
  });
}

function confirmSwap() {
  showSwap.value = false;
  const resolve = swapResolver;
  swapResolver = null;
  swapRejecter = null;
  resolve?.();
}

function abortSwap() {
  showSwap.value = false;
  const reject = swapRejecter;
  swapResolver = null;
  swapRejecter = null;
  reject?.(new Error('已中止：未换目标卡，未写入任何数据'));
}

function toggleMode() {
  mode.value = mode.value === 'real' ? 'sim' : 'real';
  stepIndex.value = 0;
  card.value = null;
  hardwareError.value = '';
  stageHint.value = '';
  resetResults();
}

/**
 * 真机链路：与模拟器共用 m1RunRealCopy / 内核判定，只把三个端口换成读卡器。
 * ★ 写入前必须换卡（onNeedTargetCard），否则会把源卡内容写回源卡自己身上。
 */
async function runRealCopy() {
  const driver = m1NfcDriver();
  if (!driver) {
    hardwareError.value = '读卡器驱动未注册，请重启应用后重试';
    return;
  }
  resetResults();
  hardwareError.value = '';
  busy.value = true;
  stageHint.value = '请把源卡贴在手机背面 NFC 感应区，并保持贴合直到读完';
  try {
    const result = await m1RunRealCopy({
      driver,
      keybook: keybook.value,
      targetKind: targetKind.value,
      maxAttempts: M1_DEFAULT_MAX_ATTEMPTS,
      onAttempt: (attempt) => { attempts.value = attempt; },
      onNeedTargetCard: async () => {
        stageHint.value = '源卡已读完，请移开源卡';
        await waitForSwapConfirm();
        if (!driver.awaitTargetCard) {
          throw new Error('该读卡器不支持换卡，已中止写入');
        }
        stageHint.value = '等待目标空白卡贴上…';
        await driver.awaitTargetCard();
      },
    });
    card.value = {
      uid: result.dump.uid,
      bcc: result.dump.bcc,
      sak: result.dump.sak,
      atqa: result.dump.atqa,
      sectorCount: result.dump.sectorCount,
      sectors: [],
    };
    recovery.value = result.recovery;
    dump.value = result.dump;
    plan.value = result.plan;
    verify.value = result.verify;
    reason.value = result.reason;
    stepIndex.value = STEP_LABELS.length - 1;
  } catch (error) {
    hardwareError.value = error instanceof Error ? error.message : '真机读卡失败';
  } finally {
    busy.value = false;
    stageHint.value = '';
    showSwap.value = false;
    swapResolver = null;
    swapRejecter = null;
  }
}

/** 分步执行：模拟模式每一步都调用内核真实函数，判定只在内核里发生一次。 */
async function advance() {
  if (!canAct.value) return;
  if (stepIndex.value === STEP_LABELS.length - 1) {
    stepIndex.value = 0;
    card.value = null;
    hardwareError.value = '';
    resetResults();
    return;
  }
  if (realMode.value && stepIndex.value === 0) {
    await runRealCopy();
    return;
  }
  busy.value = true;
  try {
    switch (stepIndex.value) {
      case 0:
        card.value = m1MakeTeachingCard(policy.value);
        resetResults();
        break;
      case 1:
        recovery.value = await m1RecoverSectorKeys(
          card.value!,
          {
            keybook: keybook.value,
            maxAttempts: M1_DEFAULT_MAX_ATTEMPTS,
            onAttempt: (attempt) => { attempts.value = attempt; },
          },
          m1AuthenticatorFromImage(card.value!),
        );
        break;
      case 2:
        dump.value = await m1ReadDump(card.value!, recovery.value!, m1ReaderFromImage(card.value!));
        break;
      case 3: {
        plan.value = m1PlanWrite(dump.value!, targetKind.value);
        const blank = m1MakeBlankTarget(targetKind.value);
        const blocks = [...blank.blocks];
        written.value = await m1WriteDump(dump.value!, plan.value!, (index, data) => {
          blocks[index] = data;
        });
        break;
      }
      case 4:
        verify.value = m1VerifyCopy(dump.value!, written.value!);
        reason.value = m1CopyReason(recovery.value!, plan.value!, verify.value!);
        break;
      default:
        break;
    }
    stepIndex.value += 1;
  } finally {
    busy.value = false;
  }
}

function goToStep(index: number) {
  // 只允许回到已走过的步骤，不能跳过实际执行
  if (authorized.value && index <= stepIndex.value) stepIndex.value = index;
}

// 真机读卡器状态：桌面要外接读卡器、Android 用自带 NFC、iOS 只能模拟 —— 进页面就如实展示
onMounted(async () => {
  nfcCap.value = await m1NfcCapability();
  // 有可用真机时默认进真机模式，用户仍可一键切回教学模拟
  if (nfcCap.value.available && m1NfcDriver()) mode.value = 'real';
});

function shortBlock(data: string | null): string {
  if (data === null) return '不可读';
  return data.slice(0, 8);
}
</script>

<template>
  <div class="m1-lab" data-testid="m1-lab">
    <header class="m1-head">
      <div>
        <span class="m1-kicker">教学模拟 · 不连接真实读卡器</span>
        <h3>M1 门禁卡复制台</h3>
      </div>
      <div class="m1-consent-box">
        <button
          v-if="!authorized"
          type="button"
          class="m1-consent-btn"
          data-testid="m1-consent-trigger"
          @click="showConsent = true"
        >授权并开始实验</button>
        <div v-else class="m1-consent-state">
          <span>已确认 · 自有或已授权卡</span>
          <button type="button" data-testid="m1-consent-revoke" @click="revokeConsent">撤销</button>
        </div>
      </div>
    </header>

    <p v-if="deviceLine" class="m1-device" data-testid="m1-device">{{ deviceLine }}</p>
    <div v-if="nfcCap?.available" class="m1-mode-row">
      <button type="button" class="m1-mode" data-testid="m1-mode" @click="toggleMode">
        {{ realMode ? '切回教学模拟' : '切换到真机读卡' }}
      </button>
      <span v-if="realMode" class="m1-mode-tip">真机模式 · 仅处理自有或已授权的卡</span>
    </div>

    <nav class="m1-rail" aria-label="实验步骤">
      <button
        v-for="(label, index) in STEP_LABELS"
        :key="label"
        type="button"
        class="m1-rail-item"
        :class="{ active: index === stepIndex, done: index < stepIndex }"
        :disabled="index > stepIndex || !authorized"
        @click="goToStep(index)"
      >
        <b>{{ String(index + 1).padStart(2, '0') }}</b><span>{{ label }}</span>
      </button>
    </nav>

    <div class="m1-stage">
      <!-- ① 选卡与密码本 -->
      <section v-if="stepIndex === 0" class="m1-panel" data-testid="m1-step-0">
        <template v-if="!realMode">
          <h4>选择教学卡</h4>
          <div class="m1-options">
            <button
              v-for="item in POLICIES"
              :key="item.key"
              type="button"
              class="m1-option"
              :class="{ picked: policy === item.key }"
              :disabled="!authorized"
              :data-policy="item.key"
              @click="policy = item.key"
            >
              <b>{{ item.name }}</b><small>{{ item.detail }}</small>
            </button>
          </div>
        </template>
        <div v-else class="m1-real-hint" data-testid="m1-real-hint">
          <b>真机读卡</b>
          <p>打开系统 NFC，把<strong>源卡</strong>贴在手机背面感应区并保持贴合；读完后按弹窗提示换成目标空白卡。卡数据只在内存处理，不落盘、不上传。</p>
        </div>
        <p v-if="stageHint" class="m1-stage-hint" data-testid="m1-stage-hint">{{ stageHint }}</p>
        <p v-if="hardwareError" class="m1-warn" data-testid="m1-hardware-error">{{ hardwareError }}</p>

        <h4>选择目标卡</h4>
        <div class="m1-options">
          <button
            v-for="item in TARGETS"
            :key="item.key"
            type="button"
            class="m1-option"
            :class="{ picked: targetKind === item.key }"
            :disabled="!authorized"
            :data-target="item.key"
            @click="targetKind = item.key"
          >
            <b>{{ item.name }}</b><small>{{ item.detail }}</small>
          </button>
        </div>

        <h4>密码本</h4>
        <label class="m1-check">
          <input v-model="useBuiltin" type="checkbox" :disabled="!authorized" data-testid="m1-builtin" />
          <span>纳入 {{ M1_PUBLIC_DEFAULT_KEYS.length }} 条公开出厂默认值（用于检查自己的卡是否忘了改密钥）</span>
        </label>
        <textarea
          v-model="keybookText"
          class="m1-keybook"
          :disabled="!authorized"
          rows="3"
          placeholder="每行一个 6 字节密钥，例如 5A7C31E9B204；# 开头为注释"
          data-testid="m1-keybook"
        ></textarea>
        <p class="m1-hint">
          候选 {{ candidateCount }} 条 · 自定义有效 {{ parsedKeybook.keys.length }} 条
          <template v-if="parsedKeybook.rejected.length"> · 忽略非法行 {{ parsedKeybook.rejected.length }} 条</template>
          · 本轮尝试上限 {{ M1_DEFAULT_MAX_ATTEMPTS }} 次
        </p>
      </section>

      <!-- ② 识别 -->
      <section v-else-if="stepIndex === 1 && card" class="m1-panel" data-testid="m1-step-1">
        <h4>识别结果</h4>
        <p v-if="!realMode" class="m1-scenario">当前场景：<b>{{ currentPolicy.name }}</b> · {{ currentPolicy.detail }}</p>
        <p v-else class="m1-scenario">源卡已识别 · 卡号与扇区数来自卡片本身</p>
        <div class="m1-meta">
          <div><span>卡号</span><code>{{ card.uid }}</code></div>
          <div><span>校验字节</span><code>{{ card.bcc }}</code></div>
          <div><span>选择应答</span><code>{{ card.sak }}</code></div>
          <div><span>寻卡应答</span><code>{{ card.atqa }}</code></div>
          <div><span>扇区</span><code>{{ card.sectorCount }}</code></div>
          <div><span>块</span><code>{{ card.sectorCount * M1_BLOCKS_PER_SECTOR }}</code></div>
        </div>
        <p class="m1-note">第 0 块存放卡号与校验字节；每个扇区的第 4 块是扇区尾，读取前必须先通过该扇区认证。</p>
      </section>

      <!-- ③ 密钥恢复 -->
      <section v-else-if="stepIndex === 2 && recovery" class="m1-panel" data-testid="m1-step-2">
        <h4>逐扇区密钥恢复</h4>
        <p class="m1-summary">
          共尝试 <b>{{ recovery.totalAttempts }}</b> 次 · 命中 <b>{{ recovery.recovered }}/{{ card!.sectorCount }}</b> 个扇区
          <template v-if="recovery.capped"> · <b>已达尝试上限，结果标为未完成</b></template>
        </p>
        <div class="m1-sector-list">
          <div
            v-for="item in recovery.sectors"
            :key="item.sector"
            class="m1-sector-row"
            :class="{ bad: item.key === null }"
          >
            <span class="m1-sector-no">{{ String(item.sector).padStart(2, '0') }}</span>
            <code>{{ item.key || '密钥不在密码本中' }}</code>
            <small>{{ item.key ? (item.hitBy === 'custom' ? '自定义密码本' : '公开默认值') : `尝试 ${item.attempts} 次` }}</small>
          </div>
        </div>
        <p v-if="recovery.unreadableSectors.length" class="m1-warn">
          未完成扇区：{{ recovery.unreadableSectors.join('、') }}。dump 会缺块，后续校验必须失败。
        </p>
      </section>

      <!-- ④ dump -->
      <section v-else-if="stepIndex === 3 && dump" class="m1-panel" data-testid="m1-step-3">
        <h4>整卡 dump</h4>
        <p class="m1-summary">每行一个扇区，4 块；「不可读」表示该扇区密钥未恢复。</p>
        <div class="m1-dump">
          <div v-for="sector in dump.sectorCount" :key="sector" class="m1-dump-row">
            <span class="m1-sector-no">{{ String(sector - 1).padStart(2, '0') }}</span>
            <code
              v-for="block in M1_BLOCKS_PER_SECTOR"
              :key="block"
              :class="{ empty: dump.blocks[(sector - 1) * M1_BLOCKS_PER_SECTOR + block - 1] === null,
                        trailer: block === 4 }"
              :title="`扇区 ${sector - 1} 块 ${block - 1}`"
            >{{ shortBlock(dump.blocks[(sector - 1) * M1_BLOCKS_PER_SECTOR + block - 1]) }}</code>
          </div>
        </div>
      </section>

      <!-- ⑤ 写入计划 -->
      <section v-else-if="stepIndex === 4 && plan" class="m1-panel" data-testid="m1-step-4">
        <h4>写入目标卡</h4>
        <p class="m1-summary">
          目标卡：<b>{{ targetKind === 'uid-writable' ? '可改写卡号卡' : '普通空白卡' }}</b> ·
          待写 {{ plan.writable.length }} 块 · 跳过 {{ plan.skipped.length }} 块
        </p>
        <div v-if="plan.skipped.length" class="m1-skip-list">
          <div v-for="item in plan.skipped.slice(0, 12)" :key="item.block" class="m1-skip-row">
            <code>块 {{ item.block }}</code>
            <span>{{
              item.reason === 'uid-read-only' ? '块 0 不可写：普通空白卡的卡号出厂后不能改'
                : item.reason === 'no-key' ? '该扇区密钥未恢复，禁止写入半成品'
                  : '源数据为空块'
            }}</span>
          </div>
          <p v-if="plan.skipped.length > 12" class="m1-hint">另有 {{ plan.skipped.length - 12 }} 块跳过未列出。</p>
        </div>
        <p v-else class="m1-note">64 块全部可写，包括存放卡号的第 0 块。</p>
      </section>

      <!-- ⑥ 结论 -->
      <section v-else-if="stepIndex === 5 && verify" class="m1-panel" data-testid="m1-step-5">
        <div class="m1-result" :class="{ ok: copyOk, fail: !copyOk }" data-testid="m1-result">
          <b>{{ copyOk ? '复制成功' : '复制失败' }}</b>
          <span>{{ reason }}</span>
        </div>
        <p class="m1-summary">
          比对 {{ verify.compared }} 块 · 不一致 {{ verify.mismatches.length }} 块
          <template v-if="recovery"> · 密钥尝试 {{ recovery.totalAttempts }} 次</template>
        </p>
        <div v-if="verify.mismatches.length" class="m1-skip-list">
          <div v-for="(item, i) in verify.mismatches.slice(0, 8)" :key="i" class="m1-skip-row">
            <code>块 {{ item.block }}</code><span>{{ item.reason }}</span>
          </div>
        </div>

        <h4>让复制失效（防护清单）</h4>
        <ul class="m1-defense">
          <li>一卡一密：按卡派生扇区密钥，不再全楼共用出厂默认值。</li>
          <li>双向认证：升级到支持挑战应答的卡片，不能只比对卡号。</li>
          <li>挂失黑名单与持卡人绑定：复制卡在服务端立即失效。</li>
          <li>异常开门告警：同一卡号短时多地出现要能发现。</li>
        </ul>

        <h4>实验步骤</h4>
        <ol class="m1-steps"><li v-for="step in props.lab.steps" :key="step">{{ step }}</li></ol>
        <p class="m1-expected"><b>验收</b>{{ props.lab.expected }}</p>
      </section>
    </div>

    <footer class="m1-actions">
      <span class="m1-step-hint">{{ STEP_LABELS[stepIndex] }} · {{ stepIndex + 1 }} / {{ STEP_LABELS.length }}</span>
      <button
        type="button"
        class="m1-primary"
        :disabled="!canAct"
        data-testid="m1-action"
        @click="advance"
      >{{ actionLabel }}</button>
    </footer>
    <p v-if="!authorized" class="m1-gate">先完成授权确认，实验才会解锁。</p>

    <div
      v-if="showConsent"
      class="m1-modal-mask"
      data-testid="m1-consent-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="授权确认"
    >
      <div class="m1-modal">
        <span class="m1-kicker">实验前必须确认</span>
        <h4>授权确认</h4>
        <p>本实验只处理你<strong>自有或已获书面授权</strong>的门禁卡。复制他人门禁卡可能违反法律与场所规定。</p>
        <ul>
          <li>卡数据只在本机内存处理，不上传、不落盘、不进入日志。</li>
          <li>真机模式仅连接本机外接读卡器或手机自带 NFC，不访问网络侧设备。</li>
          <li>发现卡片不属于你或未获授权，立即停止并退出实验。</li>
          <li>密码本只用于检查自己的卡是否仍在用出厂默认密钥，尝试次数有上限。</li>
        </ul>
        <div class="m1-modal-actions">
          <button type="button" class="m1-quiet" data-testid="m1-consent-cancel" @click="showConsent = false">取消</button>
          <button type="button" class="m1-primary" data-testid="m1-consent-confirm" @click="confirmConsent">我已确认，继续</button>
        </div>
      </div>
    </div>

    <!-- 写入前必须换卡：不换卡会把源卡内容写回源卡本身 -->
    <div
      v-if="showSwap"
      class="m1-modal-mask"
      data-testid="m1-swap-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="换卡确认"
    >
      <div class="m1-modal">
        <span class="m1-kicker">写入前必须换卡</span>
        <h4>请换上目标空白卡</h4>
        <p>源卡数据已读出并保存在内存。先把源卡移开，再把<strong>目标空白卡</strong>贴到手机 NFC 感应区，然后点下面的按钮继续。</p>
        <ul>
          <li>继续后才会开始写入，写入会覆盖目标卡对应扇区。</li>
          <li>中止不会写入任何数据，源卡保持原样。</li>
          <li>普通空白卡的块 0 不可写，卡号复制会如实报失败。</li>
        </ul>
        <div class="m1-modal-actions">
          <button type="button" class="m1-quiet" data-testid="m1-swap-abort" @click="abortSwap">中止，不写入</button>
          <button type="button" class="m1-primary" data-testid="m1-swap-confirm" @click="confirmSwap">已换好，继续写入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.m1-lab {
  --m1-paper: var(--focus-paper, #fbf9f3);
  --m1-ink: var(--focus-paper-ink, #1b252b);
  --m1-muted: var(--focus-paper-muted, #5c6a70);
  --m1-line: rgba(24, 35, 43, .16);
  --m1-teal: #0f766e;
  --m1-amber: #b45309;
  --m1-red: #b91c1c;
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: var(--m1-ink);
  font-size: 13px;
}
.m1-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
.m1-kicker { display: block; color: var(--m1-amber); font-size: 10px; font-weight: 700; letter-spacing: .04em; }
.m1-head h3 { margin: 4px 0 0; font-size: 17px; }
.m1-consent-box { display: flex; align-items: center; }
.m1-consent-btn { min-height: 44px; padding: 0 16px; border: 1px solid var(--m1-amber);
  border-radius: 7px; background: color-mix(in srgb, #b45309 8%, var(--m1-paper));
  color: var(--m1-amber); font-size: 12px; font-weight: 600; cursor: pointer; }
.m1-consent-state { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 12px;
  border: 1px solid var(--m1-teal); border-radius: 7px;
  background: color-mix(in srgb, #0f766e 7%, var(--m1-paper)); color: var(--m1-teal); font-size: 11px; }
.m1-consent-state button { min-height: 32px; padding: 0 8px; border: 0; background: transparent;
  color: var(--m1-muted); font-size: 11px; cursor: pointer; }
.m1-check input { width: 16px; height: 16px; accent-color: var(--m1-teal); }

.m1-rail { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
.m1-rail-item { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; min-height: 40px; padding: 6px 12px;
  border: 1px solid var(--m1-line); border-radius: 6px; background: var(--m1-paper); color: var(--m1-muted);
  cursor: pointer; font-size: 11px; }
.m1-rail-item b { font-variant-numeric: tabular-nums; font-size: 10px; }
.m1-rail-item.active { border-color: var(--m1-teal); color: var(--m1-teal); background: color-mix(in srgb, #0f766e 7%, var(--m1-paper)); }
.m1-rail-item.done { color: var(--m1-teal); }
.m1-rail-item:disabled { opacity: .5; cursor: not-allowed; }

.m1-stage { min-height: 230px; }
.m1-panel h4 { margin: 0 0 9px; font-size: 13px; }
.m1-panel h4 + p { margin-top: 0; }
.m1-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
.m1-option { display: flex; flex-direction: column; gap: 5px; min-height: 76px; padding: 10px;
  border: 1px solid var(--m1-line); border-radius: 7px; background: var(--m1-paper); color: var(--m1-ink);
  text-align: left; cursor: pointer; }
.m1-option b { font-size: 12px; }
.m1-option small { color: var(--m1-muted); font-size: 10px; line-height: 1.5; }
.m1-option.picked { border-color: var(--m1-teal); background: color-mix(in srgb, #0f766e 7%, var(--m1-paper)); }
.m1-option:disabled { opacity: .55; cursor: not-allowed; }
.m1-check { display: flex; align-items: center; gap: 8px; min-height: 40px; color: var(--m1-muted); font-size: 11px; }
.m1-keybook { width: 100%; box-sizing: border-box; padding: 9px 11px; border: 1px solid var(--m1-line);
  border-radius: 6px; background: var(--m1-paper); color: var(--m1-ink);
  font: 11px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; resize: vertical; }
.m1-hint { margin: 6px 0 0; color: var(--m1-muted); font-size: 10px; }
.m1-device { margin: 0; color: var(--m1-muted); font-size: 10px; }
.m1-gate { margin: 0; color: var(--m1-amber); font-size: 11px; }
.m1-mode-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.m1-mode { min-height: 34px; padding: 0 12px; border: 1px solid var(--m1-teal); border-radius: 6px;
  background: var(--m1-paper); color: var(--m1-teal); font-size: 11px; cursor: pointer; }
.m1-mode-tip { color: var(--m1-amber); font-size: 10px; }
.m1-real-hint { padding: 10px 12px; margin-bottom: 14px; border-left: 3px solid var(--m1-amber);
  background: color-mix(in srgb, #b45309 6%, var(--m1-paper)); color: var(--m1-muted); font-size: 11px; }
.m1-real-hint b { display: block; margin-bottom: 5px; color: var(--m1-amber); font-size: 12px; }
.m1-real-hint p { margin: 0; line-height: 1.7; }
.m1-stage-hint { margin: 0 0 10px; padding: 9px 12px; border-left: 3px solid var(--m1-teal);
  background: color-mix(in srgb, #0f766e 6%, var(--m1-paper)); color: var(--m1-teal); font-size: 11px; }

.m1-scenario, .m1-summary, .m1-note, .m1-warn { margin: 0 0 10px; font-size: 12px; line-height: 1.7; }
.m1-scenario, .m1-summary { color: var(--m1-muted); }
.m1-note { padding: 10px 12px; border-left: 3px solid var(--m1-teal);
  background: color-mix(in srgb, #0f766e 6%, var(--m1-paper)); color: var(--m1-muted); }
.m1-warn { padding: 10px 12px; border-left: 3px solid var(--m1-red);
  background: color-mix(in srgb, #b91c1c 6%, var(--m1-paper)); color: var(--m1-red); }
.m1-meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
.m1-meta > div { display: flex; flex-direction: column; gap: 4px; padding: 9px 11px;
  border: 1px solid var(--m1-line); border-radius: 6px; background: var(--m1-paper); }
.m1-meta span { color: var(--m1-muted); font-size: 10px; }
.m1-meta code { font: 12px ui-monospace, SFMono-Regular, Consolas, monospace; }

.m1-sector-list, .m1-dump, .m1-skip-list { display: flex; flex-direction: column; gap: 2px;
  max-height: 250px; overflow-y: auto; border: 1px solid var(--m1-line); border-radius: 6px; padding: 4px; }
.m1-sector-row, .m1-dump-row, .m1-skip-row { display: flex; align-items: center; gap: 8px; min-height: 26px;
  padding: 3px 6px; border-radius: 4px; font-size: 11px; }
.m1-sector-row:nth-child(odd), .m1-dump-row:nth-child(odd), .m1-skip-row:nth-child(odd) {
  background: color-mix(in srgb, #0f766e 3%, var(--m1-paper)); }
.m1-sector-row code, .m1-dump-row code, .m1-skip-row code {
  font: 11px ui-monospace, SFMono-Regular, Consolas, monospace; }
.m1-sector-row small { margin-left: auto; color: var(--m1-muted); font-size: 10px; }
.m1-sector-row.bad { color: var(--m1-red); }
.m1-sector-no { flex: 0 0 22px; color: var(--m1-muted); font-variant-numeric: tabular-nums; font-size: 10px; }
.m1-dump-row code { flex: 1 1 0; min-width: 0; text-align: center; }
.m1-dump-row code.trailer { color: var(--m1-amber); }
.m1-dump-row code.empty { color: var(--m1-red); font-size: 10px; }
.m1-skip-row span { color: var(--m1-muted); font-size: 10px; }

.m1-result { display: flex; flex-direction: column; gap: 5px; padding: 12px 14px; margin-bottom: 10px;
  border-radius: 7px; border-left: 3px solid; font-size: 12px; line-height: 1.6; }
.m1-result b { font-size: 14px; }
.m1-result.ok { border-color: var(--m1-teal); background: color-mix(in srgb, #0f766e 8%, var(--m1-paper)); color: var(--m1-teal); }
.m1-result.fail { border-color: var(--m1-red); background: color-mix(in srgb, #b91c1c 7%, var(--m1-paper)); color: var(--m1-red); }
.m1-defense, .m1-steps { margin: 0 0 12px; padding-left: 20px; color: var(--m1-muted); font-size: 11px; line-height: 1.9; }
.m1-expected { margin: 0; padding: 10px 12px; border-left: 3px solid var(--m1-teal);
  background: color-mix(in srgb, #0f766e 6%, var(--m1-paper)); color: var(--m1-muted); font-size: 11px; line-height: 1.7; }
.m1-expected b { display: block; margin-bottom: 4px; color: var(--m1-teal); }

.m1-actions { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 9px 0 2px; background: var(--m1-paper); border-top: 1px solid var(--m1-line); }
.m1-step-hint { color: var(--m1-muted); font-size: 11px; }
.m1-primary { min-height: 44px; padding: 0 20px; border: 0; border-radius: 7px;
  background: var(--m1-teal); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; }
.m1-primary:disabled { opacity: .45; cursor: not-allowed; }

/* 授权弹窗：z-index 高于沉浸学习台（3000），必须盖住整屏且锁定焦点视线 */
.m1-modal-mask { position: fixed; inset: 0; z-index: 4000; display: grid; place-items: center;
  padding: 16px; background: rgba(15, 23, 28, .52); }
.m1-modal { width: min(430px, 100%); max-height: 86vh; overflow-y: auto; padding: 20px;
  border: 1px solid var(--m1-line); border-radius: 12px; background: var(--m1-paper);
  color: var(--m1-ink); box-shadow: 0 18px 48px rgba(15, 23, 28, .22); }
.m1-modal h4 { margin: 6px 0 10px; font-size: 17px; }
.m1-modal p { margin: 0 0 10px; font-size: 12px; line-height: 1.75; color: var(--m1-muted); }
.m1-modal strong { color: var(--m1-ink); }
.m1-modal ul { margin: 0 0 16px; padding-left: 19px; color: var(--m1-muted); font-size: 11px; line-height: 1.85; }
.m1-modal-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.m1-quiet { min-height: 44px; padding: 0 16px; border: 1px solid var(--m1-line); border-radius: 7px;
  background: var(--m1-paper); color: var(--m1-muted); font-size: 12px; cursor: pointer; }
.m1-modal-actions .m1-primary { min-height: 44px; }

@media (max-width: 640px) {
  .m1-options { grid-template-columns: 1fr; }
  .m1-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .m1-head { flex-direction: column; }
  .m1-consent-box, .m1-consent-btn { width: 100%; box-sizing: border-box; }
  .m1-dump-row code { font-size: 9px; }
  .m1-sector-list, .m1-dump, .m1-skip-list { max-height: 210px; }
}
</style>
