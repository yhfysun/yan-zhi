<script setup lang="ts">
/**
 * M1 卡包 —— 已复制卡片的本地管理 + 一键写白卡。
 *
 * ★ 定位（用户拍板「越简单越好」）：贴卡 → 完成，没有试验台的分步状态机。
 *   保存的 dump 自带密钥，写卡链 = 选卡 → 贴目标空白卡 → 完成（m1WriteSavedCard 编排）。
 *
 * ★ 入口：设置 → 卡包（移动端分组首层直达）；试验台复制成功后也可「存入卡包」。
 *
 * ★ 隐私与合规：卡数据只存本机 localStorage，不上传；首次写卡弹「自有或已授权卡」
 *   授权（确认一次后持久化）；贴上来的 tag 若与保存卡 UID 相同会被拒写（防把源卡写回自己）。
 *
 * ★ 手机钱包边界说明（用户问过「为什么钱包里看不到」）：eSE 写入只有厂商钱包有接口，
 *   HCE 模拟不了 M1 协议 —— 卡包的「用」是写到白卡去刷，或用支持门卡模拟的手机
 *   走「小米钱包 → 门卡模拟」模拟白卡。说明卡置顶，避免再踩认知坑。
 */
import { computed, onMounted, ref } from 'vue';
import {
  m1NfcCapability,
  m1NfcDriver,
  m1ParseKeybook,
  m1ReadCardDump,
  m1WriteSavedCard,
  type M1CopyResult,
  type M1Dump,
  type M1NfcCapability,
  type M1TargetKind,
} from '@yan-zhi/shared';
import {
  acceptWalletConsent,
  isWalletConsentAccepted,
  useM1WalletStore,
  type M1WalletCard,
} from '../../stores/m1Wallet';

const wallet = useM1WalletStore();

const nfcCap = ref<M1NfcCapability | null>(null);
const hasDriver = computed(() => m1NfcDriver() !== null);
const nfcReady = computed(() => nfcCap.value?.available === true && hasDriver.value);

// ===== 读卡入包（卡包内闭环：贴卡 → 自动解密 → 入库，不用去试验台） =====
// ★ 解密全自动：内置公开默认密钥逐扇区静默尝试；只有解不出的扇区才让用户补密钥，
//   补完重新贴卡自动再读一遍（密钥恢复/读块判定全在内核）。
const reading = ref(false);
const readStage = ref<'waiting-tag' | 'recovering' | ''>('');
const readResult = ref<{ name: string; recovered: number; total: number; unreadable: number[] } | null>(null);
const readError = ref('');
/** 解密失败的半成品：不入库，等用户补密钥重试或选择「先保存残缺卡」 */
const readPending = ref<{ dump: M1Dump; unreadable: number[] } | null>(null);
const keyText = ref('');
const READ_STAGE_HINTS: Record<string, string> = {
  'waiting-tag': '把要复制的门禁卡贴在手机背面 NFC 感应区，保持贴合直到读完…',
  recovering: '自动解密中（逐扇区尝试密钥），保持贴合不要移开…',
};

async function runRead(customKeys: string[] = []) {
  const driver = m1NfcDriver();
  if (!nfcReady.value || !driver) {
    readError.value = nfcCap.value
      ? `本机 NFC 读卡器不可用：${nfcCap.value.reason}`
      : 'NFC 能力探测失败，请重启应用后重试';
    return;
  }
  reading.value = true;
  readResult.value = null;
  readError.value = '';
  try {
    readStage.value = 'waiting-tag';
    const { recovery, dump } = await m1ReadCardDump({
      driver,
      keybook: customKeys.length ? { useBuiltin: true, customKeys } : undefined,
      onAttempt: () => { if (readStage.value !== 'recovering') readStage.value = 'recovering'; },
    });
    if (recovery.unreadableSectors.length) {
      // 有扇区解不出：挂起等用户补密钥（重试会整卡重读），不把残缺 dump 悄悄入库
      readPending.value = { dump, unreadable: recovery.unreadableSectors };
      return;
    }
    readPending.value = null;
    const card = wallet.add(dump, { source: 'real' });
    readResult.value = {
      name: card.name,
      recovered: recovery.recovered,
      total: dump.sectorCount,
      unreadable: [],
    };
  } catch (error) {
    readError.value = error instanceof Error ? error.message : '读卡失败，请重试';
  } finally {
    reading.value = false;
    readStage.value = '';
  }
}

function startRead() {
  if (writing.value || reading.value) return;
  readResult.value = null;
  readError.value = '';
  readStage.value = '';
  readPending.value = null;
  if (!isWalletConsentAccepted()) {
    pendingAction.value = 'read';
    showConsent.value = true;
    return;
  }
  void runRead();
}

/** 解密失败后的补密钥重试：自定义密钥进密码本，重新贴卡整卡重读 */
function retryReadWithKeys() {
  if (reading.value) return;
  const parsed = m1ParseKeybook(keyText.value);
  if (!parsed.keys.length) {
    readError.value = '请先输入至少一个 12 位 hex 密钥（每行一个，例如 A0B1C2D3E4F5）';
    return;
  }
  readError.value = '';
  void runRead(parsed.keys);
}

/** 用户放弃补密钥：残缺卡如实入库（缺块扇区写卡时会自动跳过并如实校验失败） */
function savePartial() {
  if (!readPending.value || reading.value) return;
  const card = wallet.add(readPending.value.dump, { source: 'real' });
  readResult.value = {
    name: card.name,
    recovered: readPending.value.dump.keys.filter((k) => k.key).length,
    total: readPending.value.dump.sectorCount,
    unreadable: readPending.value.unreadable,
  };
  readPending.value = null;
}

// ===== 写卡流程状态 =====
const writing = ref(false);
const writeCardId = ref('');
const writeTarget = ref<M1TargetKind>('uid-writable');
const writeStage = ref<'waiting-tag' | 'writing' | 'verifying' | ''>('');
const writeResult = ref<M1CopyResult | null>(null);
const writeError = ref('');
const showConsent = ref(false);
/** 授权弹窗解锁后要继续的动作：读卡或写卡 */
const pendingAction = ref<'read' | 'write' | null>(null);

const STAGE_HINTS: Record<string, string> = {
  'waiting-tag': '把目标空白卡贴在手机背面 NFC 感应区，保持贴合直到写完…',
  writing: '正在写入，保持卡片贴合，不要移开…',
  verifying: '写入完成，正在逐块校验…',
};
const writingCard = computed(() => wallet.byId(writeCardId.value));

const TARGETS: Array<{ key: M1TargetKind; name: string; tip: string }> = [
  { key: 'uid-writable', name: '可改写卡号卡', tip: 'CUID/UID 白卡，能连同卡号一起复制，刷门禁用这种' },
  { key: 'normal', name: '普通空白卡', tip: '卡号改不了，只能复制数据，多数门禁刷不开' },
];

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startWrite(card: M1WalletCard) {
  if (writing.value || reading.value) return;
  writeCardId.value = card.id;
  writeResult.value = null;
  writeError.value = '';
  writeStage.value = '';
  if (!isWalletConsentAccepted()) {
    pendingAction.value = 'write';
    showConsent.value = true;
    return;
  }
  void runWrite();
}

function confirmConsent() {
  acceptWalletConsent();
  showConsent.value = false;
  const action = pendingAction.value;
  pendingAction.value = null;
  if (action === 'read') void runRead();
  else if (action === 'write') void runWrite();
}

async function runWrite() {
  const card = writingCard.value;
  if (!card) return;
  if (!nfcReady.value) {
    writeError.value = nfcCap.value
      ? `本机 NFC 读卡器不可用：${nfcCap.value.reason}`
      : 'NFC 能力探测失败，请重启应用后重试';
    return;
  }
  const driver = m1NfcDriver();
  if (!driver) return;
  writing.value = true;
  writeResult.value = null;
  writeError.value = '';
  try {
    writeResult.value = await m1WriteSavedCard({
      driver,
      dump: card.dump,
      targetKind: writeTarget.value,
      onStage: (stage) => { writeStage.value = stage; },
    });
  } catch (error) {
    writeError.value = error instanceof Error ? error.message : '写卡失败，请重试';
  } finally {
    writing.value = false;
    writeStage.value = '';
  }
}

// ===== 改名（行内编辑，不用 prompt —— Capacitor WebView 弹窗体验差） =====
const renamingId = ref('');
const renameText = ref('');
function beginRename(card: M1WalletCard) {
  renamingId.value = card.id;
  renameText.value = card.name;
}
function commitRename() {
  if (renamingId.value) wallet.rename(renamingId.value, renameText.value);
  renamingId.value = '';
}

// ===== 导出：MCT dump 文本 → 剪贴板（MIFARE Classic Tool 可直接导入） =====
const exportTip = ref('');
function toMctText(dump: M1WalletCard['dump']): string {
  const lines: string[] = [];
  for (let s = 0; s < dump.sectorCount; s += 1) {
    lines.push(`+Sector: ${s}`);
    for (let b = 0; b < 4; b += 1) {
      const block = dump.blocks[s * 4 + b];
      lines.push(block ?? '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    }
  }
  return lines.join('\n');
}
async function exportCard(card: M1WalletCard) {
  const text = toMctText(card.dump);
  try {
    await navigator.clipboard.writeText(text);
    exportTip.value = `「${card.name}」已复制为 MCT 格式，可粘贴保存为 .txt 供 MIFARE Classic Tool 导入`;
  } catch {
    exportTip.value = '剪贴板不可用：当前环境不允许访问剪贴板';
  }
  setTimeout(() => { exportTip.value = ''; }, 4000);
}

onMounted(async () => {
  nfcCap.value = await m1NfcCapability();
});
</script>

<template>
  <div class="m1w" data-testid="m1-wallet">
    <!-- 手机钱包边界说明：为什么钱包里看不到门卡、正确的用法是什么 -->
    <section class="m1w-note" data-testid="m1-wallet-note">
      <h4>卡片的正确用法</h4>
      <p>
        手机系统限制：第三方应用无法把卡写进手机钱包的安全芯片，应用层模拟也刷不开 M1 门禁。
        所以卡包里的卡这样用：<b>贴空白卡写进去 → 白卡当门禁刷</b>；
        或在支持「门卡模拟」的手机上用小米/OPPO 钱包模拟那张<b>白卡</b>（加密门卡直模大多会失败，白卡中转是通用做法）。
      </p>
      <p class="m1w-note-sub">卡数据只保存在本机，不上传云端；请只保存你自有或已授权的卡。</p>
    </section>

    <p class="m1w-device" data-testid="m1-wallet-device">
      {{ nfcCap
        ? (nfcReady ? `本机 NFC 可用（${nfcCap.driverId}）· 贴卡即读，贴白卡即写`
                    : `本机 NFC 不可用：${nfcCap.reason} · 只能查看与导出`)
        : '正在探测本机 NFC…' }}
    </p>

    <!-- 读卡入包：贴卡 → 自动解密 → 入库；解不出才让你补密钥 -->
    <div class="m1w-readbar" data-testid="m1-wallet-readbar">
      <button
        type="button"
        class="m1w-primary m1w-read-btn"
        :disabled="writing || reading"
        data-testid="m1-wallet-read"
        @click="startRead"
      >{{ reading ? '读卡中…' : '读卡入包' }}</button>
      <span class="m1w-read-tip">贴门禁卡自动解密，无需手动步骤</span>
    </div>
    <p v-if="readStage" class="m1w-stage" data-testid="m1-wallet-read-stage">{{ READ_STAGE_HINTS[readStage] }}</p>
    <div
      v-if="readResult"
      class="m1w-result"
      :class="readResult.unreadable.length ? 'fail' : 'ok'"
      data-testid="m1-wallet-read-result"
    >
      <b>{{ readResult.unreadable.length ? '已保存（不完整）' : '读卡成功，已入卡包' }}</b>
      <span>
        {{ readResult.name }} · 密钥 {{ readResult.recovered }}/{{ readResult.total }} 扇区
        <template v-if="readResult.unreadable.length"> · 未解出：{{ readResult.unreadable.join('、') }}</template>
      </span>
    </div>
    <p v-if="readError" class="m1w-result fail" data-testid="m1-wallet-read-error">{{ readError }}</p>
    <section v-if="readPending" class="m1w-keyfix" data-testid="m1-wallet-keyfix">
      <b>扇区 {{ readPending.unreadable.join('、') }} 没能用默认密钥解开</b>
      <p>这些扇区用了自定义密钥。把已知密钥填在下面（每行一个 12 位 hex，如 A0B1C2D3E4F5），点重试后再贴一次卡，会自动重新解密：</p>
      <textarea
        v-model="keyText"
        class="m1w-textarea"
        rows="3"
        data-testid="m1-wallet-key-input"
        placeholder="A0B1C2D3E4F5&#10;123456789ABC"
      ></textarea>
      <div class="m1w-card-actions">
        <button type="button" class="m1w-primary" :disabled="reading" data-testid="m1-wallet-key-retry" @click="retryReadWithKeys">带密钥重试</button>
        <button type="button" class="m1w-quiet" :disabled="reading" data-testid="m1-wallet-save-partial" @click="savePartial">先保存残缺卡</button>
      </div>
    </section>

    <!-- 卡列表 -->
    <div v-if="wallet.cards.length" class="m1w-list">
      <article v-for="card in wallet.cards" :key="card.id" class="m1w-card" data-testid="m1-wallet-card">
        <template v-if="renamingId !== card.id">
          <header class="m1w-card-head">
            <b class="m1w-card-name">{{ card.name }}</b>
            <span class="m1w-card-meta">{{ fmtTime(card.savedAt) }} · 真机读卡</span>
          </header>
          <p class="m1w-card-uid">UID <code>{{ card.dump.uid }}</code> · SAK {{ card.dump.sak || '--' }} · ATQA {{ card.dump.atqa || '--' }}</p>
          <p class="m1w-card-keys">
            {{ card.dump.keys.filter((k) => k.key).length }}/{{ card.dump.sectorCount }} 扇区密钥可用
          </p>
          <div class="m1w-card-actions">
            <button type="button" class="m1w-primary" :disabled="writing" @click="startWrite(card)">写卡</button>
            <button type="button" class="m1w-quiet" :disabled="writing" @click="beginRename(card)">改名</button>
            <button type="button" class="m1w-quiet" :disabled="writing" @click="exportCard(card)">导出 MCT</button>
            <button type="button" class="m1w-danger" :disabled="writing" @click="wallet.remove(card.id)">删除</button>
          </div>
        </template>
        <template v-else>
          <div class="m1w-rename">
            <input v-model="renameText" class="m1w-input" maxlength="30" @keyup.enter="commitRename" />
            <button type="button" class="m1w-primary" @click="commitRename">保存</button>
            <button type="button" class="m1w-quiet" @click="renamingId = ''">取消</button>
          </div>
        </template>
      </article>
    </div>
    <div v-else class="m1w-empty" data-testid="m1-wallet-empty">
      卡包还是空的。点上方<b>「读卡入包」</b>，贴上门禁卡就会自动解密并入库；想看完整教学步骤再去网安课程的 M1 复制台。
    </div>

    <p v-if="exportTip" class="m1w-tip">{{ exportTip }}</p>

    <!-- 写卡过程 / 结果（一次只显示一张卡的写卡面板） -->
    <section v-if="writeCardId && writingCard" class="m1w-write" data-testid="m1-wallet-write">
      <h4>写卡 · {{ writingCard.name }}</h4>
      <div class="m1w-target">
        <button
          v-for="t in TARGETS"
          :key="t.key"
          type="button"
          class="m1w-target-btn"
          :class="{ active: writeTarget === t.key }"
          :disabled="writing"
          @click="writeTarget = t.key"
        >{{ t.name }}</button>
      </div>
      <p class="m1w-target-tip">{{ TARGETS.find((t) => t.key === writeTarget)?.tip }}</p>

      <p v-if="writeStage" class="m1w-stage" data-testid="m1-wallet-stage">{{ STAGE_HINTS[writeStage] }}</p>

      <div v-if="writeResult" class="m1w-result" :class="{ ok: writeResult.ok, fail: !writeResult.ok }" data-testid="m1-wallet-result">
        <b>{{ writeResult.ok ? '写卡成功' : '写卡失败' }}</b>
        <span>{{ writeResult.reason }}</span>
      </div>
      <p v-if="writeError" class="m1w-result fail" data-testid="m1-wallet-error">{{ writeError }}</p>
    </section>

    <!-- 首次写卡授权（确认一次后不再弹） -->
    <div
      v-if="showConsent"
      class="m1w-modal-mask"
      data-testid="m1-wallet-consent"
      role="dialog"
      aria-modal="true"
      aria-label="写卡授权确认"
    >
      <div class="m1w-modal">
        <h4>读卡 / 写卡前确认</h4>
        <p>本功能只处理你<strong>自有或已获授权</strong>的门禁卡与空白卡。复制他人门禁卡可能违反法律与场所规定。</p>
        <ul>
          <li>读卡与保存都在本机完成，不上传云端、不进日志。</li>
          <li>解密自动进行；解不开的扇区需要你自己提供密钥，不提供则只能存残缺卡。</li>
          <li>写卡时贴上来的卡若与已保存卡 UID 相同会被拒写（防止把源卡写坏）。</li>
          <li>普通空白卡写不进卡号，属正常现象，不是故障。</li>
        </ul>
        <div class="m1w-modal-actions">
          <button type="button" class="m1w-quiet" data-testid="m1-wallet-consent-cancel" @click="showConsent = false">取消</button>
          <button type="button" class="m1w-primary" data-testid="m1-wallet-consent-confirm" @click="confirmConsent">我已确认，继续</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.m1w { display: flex; flex-direction: column; gap: 14px; color: var(--el-text-color-primary, #eee); }
.m1w-note { padding: 12px 14px; border-radius: 12px; background: rgba(127, 127, 127, 0.12); font-size: 13px; line-height: 1.7; }
.m1w-note h4 { margin: 0 0 6px; font-size: 14px; }
.m1w-note p { margin: 0; }
.m1w-note-sub { margin-top: 6px !important; opacity: 0.75; font-size: 12px; }
.m1w-device { margin: 0; font-size: 12px; opacity: 0.8; }
.m1w-readbar { display: flex; align-items: center; gap: 12px; }
.m1w-read-btn { min-width: 140px; min-height: 46px; font-size: 15px; }
.m1w-read-tip { font-size: 12px; opacity: 0.7; }
.m1w-keyfix { padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(251, 191, 36, 0.5); background: rgba(251, 191, 36, 0.08); }
.m1w-keyfix b { display: block; margin-bottom: 6px; font-size: 13px; color: #fbbf24; }
.m1w-keyfix p { margin: 0 0 8px; font-size: 12px; line-height: 1.7; opacity: 0.85; }
.m1w-textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 9px; border: 1px solid rgba(127, 127, 127, 0.4); background: transparent; color: inherit; font-size: 13px; font-family: monospace; resize: vertical; }
.m1w-list { display: flex; flex-direction: column; gap: 10px; }
.m1w-card { padding: 12px 14px; border-radius: 12px; background: rgba(127, 127, 127, 0.1); }
.m1w-card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.m1w-card-name { font-size: 14px; }
.m1w-card-meta { font-size: 11px; opacity: 0.6; white-space: nowrap; }
.m1w-card-uid, .m1w-card-keys { margin: 4px 0 0; font-size: 12px; opacity: 0.85; }
.m1w-card-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.m1w-empty { padding: 18px 14px; border-radius: 12px; border: 1px dashed rgba(127, 127, 127, 0.4); font-size: 13px; line-height: 1.7; opacity: 0.85; }
.m1w-tip { margin: 0; font-size: 12px; opacity: 0.8; }
.m1w-write { padding: 12px 14px; border-radius: 12px; background: rgba(127, 127, 127, 0.1); }
.m1w-write h4 { margin: 0 0 8px; font-size: 14px; }
.m1w-target { display: flex; gap: 8px; }
.m1w-target-btn { flex: 1; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(127, 127, 127, 0.4); background: transparent; color: inherit; font-size: 13px; cursor: pointer; }
.m1w-target-btn.active { border-color: #0d9488; color: #2dd4bf; font-weight: 600; }
.m1w-target-tip { margin: 6px 0 0; font-size: 12px; opacity: 0.7; }
.m1w-stage { margin: 10px 0 0; font-size: 13px; color: #fbbf24; }
.m1w-result { margin: 10px 0 0; padding: 10px 12px; border-radius: 10px; font-size: 13px; line-height: 1.6; display: flex; flex-direction: column; gap: 2px; }
.m1w-result.ok { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; }
.m1w-result.fail { background: rgba(239, 68, 68, 0.15); color: #fca5a5; }
.m1w-primary, .m1w-quiet, .m1w-danger { padding: 6px 14px; border-radius: 9px; border: none; font-size: 13px; cursor: pointer; }
.m1w-primary { background: #0d9488; color: #fff; font-weight: 600; }
.m1w-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.m1w-quiet { background: rgba(127, 127, 127, 0.2); color: inherit; }
.m1w-danger { background: rgba(239, 68, 68, 0.18); color: #fca5a5; }
.m1w-rename { display: flex; gap: 8px; align-items: center; }
.m1w-input { flex: 1; padding: 7px 10px; border-radius: 9px; border: 1px solid rgba(127, 127, 127, 0.4); background: transparent; color: inherit; font-size: 13px; }
.m1w-modal-mask { position: fixed; inset: 0; z-index: 3000; background: rgba(0, 0, 0, 0.55); display: flex; align-items: center; justify-content: center; padding: 24px; }
.m1w-modal { width: min(420px, 100%); border-radius: 16px; padding: 18px; background: var(--el-bg-color, #1f2937); color: var(--el-text-color-primary, #eee); }
.m1w-modal h4 { margin: 0 0 8px; }
.m1w-modal p, .m1w-modal li { font-size: 13px; line-height: 1.7; }
.m1w-modal ul { margin: 8px 0; padding-left: 18px; }
.m1w-modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
</style>
