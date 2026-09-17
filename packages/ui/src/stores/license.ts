// License Store：授权码校验（后端验签，前端只存码 + 调接口）
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';

const LICENSE_KEY = 'license_code';

export interface VerifyResult {
  valid: boolean;
  expireAt: string | null;
  mac: string | null;
  machineId: string | null;
  machineMac: string;
  machineIdLocal: string | null;
  identitySource: string;
  reason?: string;
}

export const useLicenseStore = defineStore('license', () => {
  const verified = ref(false);
  const initialized = ref(false);
  const info = ref<VerifyResult | null>(null);
  const machineMac = ref('');
  /** 本机稳定机器标识（主板 UUID 哈希）。签发方按它绑定，比 MAC 抗网卡变动。 */
  const machineId = ref('');
  /** 机器标识来源，读不到硬件信息时会显示 fallback-composite。 */
  const identitySource = ref('');
  const error = ref('');

  async function fetchMachineInfo() {
    const result = await api.get<{ mac: string; machineId: string | null; source: string; hostname: string }>('/license/machine-info');
    if ('data' in result) {
      machineMac.value = result.data.mac;
      machineId.value = result.data.machineId || '';
      identitySource.value = result.data.source;
    }
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
        machineId.value = def.data.machineIdLocal || '';
        identitySource.value = def.data.identitySource;
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
      machineId.value = result.data.machineIdLocal || '';
      identitySource.value = result.data.identitySource;
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
    machineId.value = result.data.machineIdLocal || '';
    identitySource.value = result.data.identitySource;
    return true;
  }

  function deactivate() {
    localStorage.removeItem(LICENSE_KEY);
    verified.value = false;
    info.value = null;
  }

  return { verified, initialized, info, machineMac, machineId, identitySource, error, init, activate, deactivate, fetchMachineInfo };
});