<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <div class="auth-logo">
          <span class="auth-logo-text">言</span>
        </div>
        <h1 class="auth-title">授权激活</h1>
        <p class="auth-subtitle">请输入授权码以激活应用</p>
      </div>

      <div class="machine-info">
        <div class="machine-row">
          <span class="machine-label">本机 MAC</span>
          <code class="machine-value">{{ machineMac || '读取中…' }}</code>
        </div>
      </div>

      <form class="auth-form" @submit.prevent="submit">
        <el-input
          v-model="code"
          type="textarea"
          :rows="4"
          placeholder="粘贴授权码"
          resize="none"
          class="code-input"
        />
        <el-button
          type="primary"
          :loading="loading"
          :disabled="!code.trim()"
          class="auth-submit"
          native-type="submit"
        >激活</el-button>
      </form>

      <p v-if="error" class="auth-error">{{ error }}</p>
      <p v-if="hint" class="auth-hint">{{ hint }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLicenseStore } from '../stores/license';

const router = useRouter();
const licenseStore = useLicenseStore();

const code = ref('');
const loading = ref(false);
const error = ref('');
const hint = ref('');
const machineMac = ref('');

onMounted(async () => {
  await licenseStore.fetchMachineInfo();
  machineMac.value = licenseStore.machineMac;
  if (licenseStore.info && !licenseStore.verified) {
    hint.value = licenseStore.info.reason || '原授权码已失效，请重新输入';
  }
});

async function submit() {
  error.value = '';
  hint.value = '';
  loading.value = true;
  const ok = await licenseStore.activate(code.value.trim());
  loading.value = false;
  if (ok) {
    router.replace('/chat');
  } else {
    error.value = licenseStore.error || '激活失败';
  }
}
</script>

<style scoped>
.auth-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 24px;
  background: var(--glass-bg);
}
.auth-card {
  width: 440px;
  max-width: 100%;
  padding: 36px 32px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.auth-header { text-align: center; margin-bottom: 24px; }
.auth-logo {
  width: 56px; height: 56px; margin: 0 auto 12px;
  border-radius: 16px;
  background: var(--gradient-primary);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 24px rgba(124, 58, 237, 0.35);
}
.auth-logo-text { color: #fff; font-size: 28px; font-weight: 800; }
.auth-title { font-size: 22px; font-weight: 700; color: var(--color-text); margin-bottom: 4px; }
.auth-subtitle { font-size: 13px; color: var(--color-text-secondary); }
.machine-info {
  margin-bottom: 16px;
  padding: 10px 14px;
  background: rgba(15, 23, 42, 0.04);
  border-radius: var(--radius-sm);
}
[data-theme="dark"] .machine-info { background: rgba(255, 255, 255, 0.05); }
.machine-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.machine-label { font-size: 12px; color: var(--color-text-secondary); }
.machine-value {
  font-size: 12px; font-family: ui-monospace, monospace;
  color: var(--color-primary); user-select: all;
}
.auth-form { display: flex; flex-direction: column; gap: 14px; }
.code-input :deep(.el-textarea__inner) {
  font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.6;
}
.auth-submit {
  width: 100%; height: 42px; font-size: 15px; font-weight: 600;
  background: var(--gradient-primary); border: none; color: #fff;
}
.auth-error { margin-top: 14px; font-size: 13px; color: var(--color-danger); text-align: center; }
.auth-hint { margin-top: 14px; font-size: 12px; color: var(--color-warning); text-align: center; }
</style>