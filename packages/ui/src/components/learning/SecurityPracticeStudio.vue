<script setup lang="ts">
/**
 * 网络安全实操台 —— 与音乐「编曲台」同层的独立实践入口。
 *
 * ★ 课程主线在 CyberSecurityWorkbench（五步沉浸台），这里是不用先钻进某一节课
 *   「实验」步骤、点进来就能动手的实操台；手机端与桌面共用 packages/ui。
 * ★ 判定逻辑只有一份：M1NfcCopyLab 与课程内实验台复用同一个内核与同一个组件，
 *   模拟 / Android 真机 / 外接读卡器 / 密码本 / 授权弹窗全都带过来，不另写一套。
 */
import M1NfcCopyLab from './M1NfcCopyLab.vue';

const M1_LAB = {
  target: '本机课程实操台 · 仅自有或已授权卡',
  tools: ['教学模拟器', 'Android 自带 NFC', '外接读卡器', '公开默认值 + 自定义密码本'],
  steps: [
    '完成授权确认弹窗',
    '贴源卡或选择教学卡',
    '密码本逐扇区恢复密钥',
    '读出整卡 dump',
    '换上目标空白卡再写入',
    '逐块校验并给出防护清单',
  ],
  expected: '默认密钥与简单加密卡可完整复制；字典外强密钥、普通白卡必须明确失败。',
  simulator: 'm1-nfc-copy',
};
</script>

<template>
  <div class="sec-practice" data-testid="security-practice">
    <header class="sec-practice-head">
      <span class="sec-practice-kicker">网络安全 · 实践</span>
      <h3>安全实操台</h3>
      <p>模拟器与真机读卡共用同一套判定；实验先过授权确认，卡数据只在内存处理，不落盘、不上传。</p>
    </header>
    <M1NfcCopyLab :lab="M1_LAB" />
  </div>
</template>

<style scoped>
.sec-practice {
  --sp-paper: var(--focus-paper, #fbf9f3);
  --sp-ink: var(--focus-paper-ink, #1b252b);
  --sp-muted: var(--focus-paper-muted, #5c6a70);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 18px 22px;
  color: var(--sp-ink);
  overflow-y: auto;
}
.sec-practice-head { padding-bottom: 12px; border-bottom: 1px solid rgba(24, 35, 43, .16); }
.sec-practice-kicker { display: block; color: #b45309; font-size: 10px; font-weight: 700; letter-spacing: .04em; }
.sec-practice-head h3 { margin: 5px 0 6px; font-size: 18px; }
.sec-practice-head p { margin: 0; color: var(--sp-muted); font-size: 11px; line-height: 1.7; }

@media (max-width: 640px) {
  .sec-practice { padding: 12px 12px 18px; gap: 12px; }
  .sec-practice-head h3 { font-size: 16px; }
}
</style>
