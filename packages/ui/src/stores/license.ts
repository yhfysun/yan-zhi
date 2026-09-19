// License Store：授权码校验（后端验签，前端只存码 + 调接口）
//
// 授权码不再直接写 localStorage：改由 api/license-code 模块持久化到 keyring
// （桌面端底层 DPAPI/Keychain 加密）。该模块同时维护内存缓存，供同步的请求头构造读取。
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';
import { setLicensedModes } from './mode';
import {
  loadLicenseCode,
  persistLicenseCode,
  clearLicenseCode,
} from '../api/license-code';

export interface VerifyResult {
  valid: boolean;
  expireAt: string | null;
  mac: string | null;
  machineId: string | null;
  machineMac: string;
  machineIdLocal: string | null;
  identitySource: string;
  /** 本包构建档（lite/basic/pro）。 */
  buildEdition?: string;
  /** 授权码档位。 */
  edition?: string;
  /** 实际放行的模式（后端已算好「构建档 ∩ 授权档」）。 */
  modes?: string[];
  reason?: string;
}

/** 版本档的中文展示名，供授权页与排障使用。 */
export const EDITION_LABELS: Record<string, string> = {
  lite: '阉割版',
  basic: '基础版',
  pro: '高级版',
};

export const useLicenseStore = defineStore('license', () => {
  const verified = ref(false);
  const initialized = ref(false);
  const info = ref<VerifyResult | null>(null);
  const machineMac = ref('');
  /** 本机稳定机器标识（主板 UUID 哈希）。签发方按它绑定，比 MAC 抗网卡变动。 */
  const machineId = ref('');
  /** 机器标识来源，读不到硬件信息时会显示 fallback-composite。 */
  const identitySource = ref('');
  /** 本包构建档（lite/basic/pro），由后端下发。 */
  const buildEdition = ref('');
  /** 授权码档位（lite/basic/pro）。 */
  const edition = ref('');
  /** 当前生效的授权码明文（供授权管理页展示；不含私钥，泄露无签发价值）。 */
  const currentCode = ref('');
  const error = ref('');

  /** 把授权结果里的档位信息同步给 mode store —— 模式下拉与左栏入口据它收敛。 */
  function applyEdition(data: VerifyResult | null) {
    if (data && data.valid) {
      buildEdition.value = data.buildEdition || '';
      edition.value = data.edition || '';
      setLicensedModes(data.modes || null);
    } else {
      buildEdition.value = data?.buildEdition || '';
      edition.value = data?.edition || '';
      setLicensedModes(null);
    }
  }

  /** 从 keyring 读回当前授权码（授权管理页展示用）。 */
  async function loadCurrentCode(): Promise<string> {
    try {
      currentCode.value = (await loadLicenseCode()) || '';
    } catch {
      currentCode.value = '';
    }
    return currentCode.value;
  }

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
    const code = await loadLicenseCode();
    if (!code) {
      // 首次运行：尝试预置试用授权码自动激活
      const def = await api.get<VerifyResult & { code: string }>('/license/default');
      initialized.value = true;
      if ('data' in def && def.data.valid) {
        await persistLicenseCode(def.data.code);
        verified.value = true;
        info.value = def.data;
        machineMac.value = def.data.machineMac;
        machineId.value = def.data.machineIdLocal || '';
        identitySource.value = def.data.identitySource;
        applyEdition(def.data);
      } else {
        verified.value = false;
        applyEdition('data' in def ? def.data : null);
      }
      await loadCurrentCode();
      return;
    }
    currentCode.value = code;
    const result = await api.post<VerifyResult>('/license/verify', { code });
    initialized.value = true;
    if ('data' in result && result.data.valid) {
      verified.value = true;
      info.value = result.data;
      machineMac.value = result.data.machineMac;
      machineId.value = result.data.machineIdLocal || '';
      identitySource.value = result.data.identitySource;
      applyEdition(result.data);
    } else {
      await clearLicenseCode();
      verified.value = false;
      info.value = 'data' in result ? result.data : null;
      applyEdition('data' in result ? result.data : null);
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
    await persistLicenseCode(code);
    verified.value = true;
    initialized.value = true;
    info.value = result.data;
    machineMac.value = result.data.machineMac;
    machineId.value = result.data.machineIdLocal || '';
    identitySource.value = result.data.identitySource;
    currentCode.value = code;
    applyEdition(result.data);
    return true;
  }

  async function deactivate() {
    await clearLicenseCode();
    verified.value = false;
    info.value = null;
    currentCode.value = '';
    // 掉授权即收回所有模式权限（回到「未拿到授权信息」态，由路由守卫把人拦在授权页）
    buildEdition.value = '';
    edition.value = '';
    setLicensedModes(null);
  }

  return {
    verified, initialized, info, machineMac, machineId, identitySource,
    buildEdition, edition, currentCode, error,
    init, activate, deactivate, fetchMachineInfo, loadCurrentCode,
  };
});