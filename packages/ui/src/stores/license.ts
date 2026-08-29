// License Store：授权码校验（后端验签，前端只存码 + 调接口）
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';

const LICENSE_KEY = 'license_code';

export interface VerifyResult {
  valid: boolean;
  expireAt: string | null;
  mac: string | null;
  machineMac: string;
  reason?: string;
}

export const useLicenseStore = defineStore('license', () => {
  const verified = ref(false);
  const initialized = ref(false);
  const info = ref<VerifyResult | null>(null);
  const machineMac = ref('');
  const error = ref('');

  async function fetchMachineInfo() {
    const result = await api.get<{ mac: string; hostname: string }>('/license/machine-info');
    if ('data' in result) machineMac.value = result.data.mac;
  }

  /** 启动时校验本地已存授权码（只跑一次有效校验）。无本地码时尝试预置试用码自动填充。 */
  async function init() {
    if (initialized.value) return;
    const code = localStorage.getItem(LICENSE_KEY);
    if (!code) {
      // 首次运行：尝试预置试用授权码自动激活
      const def = await api.get<VerifyResult & { code: string }>('/license/default');
      initialized.value = true;
      if ('data' in def && def.data.valid) {
        localStorage.setItem(LICENSE_KEY, def.data.code);
        verified.value = true;
        info.value = def.data;
        machineMac.value = def.data.machineMac;
      } else {
        verified.value = false;
      }
      return;
    }
    const result = await api.post<VerifyResult>('/license/verify', { code });
    initialized.value = true;
    if ('data' in result && result.data.valid) {
      verified.value = true;
      info.value = result.data;
      machineMac.value = result.data.machineMac;
    } else {
      localStorage.removeItem(LICENSE_KEY);
      verified.value = false;
      info.value = 'data' in result ? result.data : null;
    }
  }

  /** 用户输入授权码激活。成功返回 true。 */
  async function activate(code: string): Promise<boolean> {
    error.value = '';
    const result = await api.post<VerifyResult>('/license/verify', { code });
    if ('error' in result) {
      error.value = result.error;
      return false;
    }
    if (!result.data.valid) {
      error.value = result.data.reason || '授权码无效';
      return false;
    }
    localStorage.setItem(LICENSE_KEY, code);
    verified.value = true;
    initialized.value = true;
    info.value = result.data;
    machineMac.value = result.data.machineMac;
    return true;
  }

  function deactivate() {
    localStorage.removeItem(LICENSE_KEY);
    verified.value = false;
    info.value = null;
  }

  return { verified, initialized, info, machineMac, error, init, activate, deactivate, fetchMachineInfo };
});