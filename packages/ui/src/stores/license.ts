// License Store：授权码校验（后端验签，前端只存码 + 调接口）
//
// 授权码不再直接写 localStorage：改由 api/license-code 模块持久化到 keyring
// （桌面端底层 DPAPI/Keychain 加密）。该模块同时维护内存缓存，供同步的请求头构造读取。
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';
import { waitForBackend } from '../api/backend-ready';
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

/**
 * 上次**校验通过**的结果缓存（localStorage）。
 *
 * 用途只有一个：后端暂不可达（dev 的 tsx watch 重启、应用重启窗口）时，
 * 路由守卫不要把用户踢到 /license。它不是授权凭据 —— 真正的授权码在 keyring，
 * 后端恢复后会用码重新校验并覆盖这里。
 */
const LAST_VERIFY_KEY = 'yz:license:last-verify';

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

  /** 记下校验通过的结果，供后端不可达时兜底。 */
  function rememberVerified(data: VerifyResult): void {
    try {
      localStorage.setItem(LAST_VERIFY_KEY, JSON.stringify({ ...data, valid: true }));
    } catch {
      // 存储不可用（隐私模式/配额满）→ 兜底降级为「仅本次会话有效」，不影响正常校验
    }
  }

  function forgetVerified(): void {
    try { localStorage.removeItem(LAST_VERIFY_KEY); } catch { /* ignore */ }
  }

  /** 读回缓存；过期（expireAt 已过）视为不可用。 */
  function readLastVerified(): VerifyResult | null {
    try {
      const raw = localStorage.getItem(LAST_VERIFY_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw) as VerifyResult;
      if (!v || v.valid !== true) return null;
      const exp = v.expireAt ? Date.parse(v.expireAt) : NaN;
      if (Number.isFinite(exp) && exp < Date.now()) return null;
      return v;
    } catch {
      return null;
    }
  }

  /** 缓存命中时恢复授权态（不读 keyring，不发请求）。 */
  function restoreFromCache(): boolean {
    const cached = readLastVerified();
    if (!cached) return false;
    verified.value = true;
    info.value = cached;
    machineMac.value = cached.machineMac || machineMac.value;
    machineId.value = cached.machineIdLocal || machineId.value;
    identitySource.value = cached.identitySource || identitySource.value;
    applyEdition(cached);
    return true;
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

  /**
   * 用本地授权码走一次后端校验。
   *
   * 返回 true  = 后端给出了结论（有效或无效，状态已落定）；
   * 返回 false = 后端没给出结论（重启中 / 网络失败）。**此时绝不改动授权态**。
   *
   * ★ 2026-10-24：此前 `'error' in result` 会被当成「授权无效」→ `clearLicenseCode()`
   *   + verified=false。dev 后端 tsx watch 重启的两三秒里恰好发请求，就会把用户的
   *   授权码**删掉**并踢到 /license。网络失败 ≠ 授权失效，这条线必须分开。
   */
  async function verifyCurrentCode(): Promise<boolean> {
    const code = await loadLicenseCode();
    if (!code) {
      // 首次运行：尝试预置试用授权码自动激活
      const def = await api.get<VerifyResult & { code: string }>('/license/default');
      if ('error' in def) return false;
      initialized.value = true;
      if (def.data.valid) {
        await persistLicenseCode(def.data.code);
        verified.value = true;
        info.value = def.data;
        machineMac.value = def.data.machineMac;
        machineId.value = def.data.machineIdLocal || '';
        identitySource.value = def.data.identitySource;
        applyEdition(def.data);
        rememberVerified(def.data);
      } else {
        verified.value = false;
        applyEdition(def.data);
        forgetVerified();
      }
      await loadCurrentCode();
      return true;
    }
    currentCode.value = code;
    const result = await api.post<VerifyResult>('/license/verify', { code });
    if ('error' in result) return false;
    initialized.value = true;
    if (result.data.valid) {
      verified.value = true;
      info.value = result.data;
      machineMac.value = result.data.machineMac;
      machineId.value = result.data.machineIdLocal || '';
      identitySource.value = result.data.identitySource;
      applyEdition(result.data);
      rememberVerified(result.data);
    } else {
      await clearLicenseCode();
      forgetVerified();
      verified.value = false;
      info.value = result.data;
      applyEdition(result.data);
    }
    return true;
  }

  /**
   * 兜底期结束后端恢复时，把「缓存授权态」换成真校验结果。
   *
   * 只重试约 30s（20 次 × 1.5s）：后端一旦应答就落定，不再反复打接口。
   * 失败也不清缓存 —— 兜底态宁可多留一会儿，也不要因为一次抖动把用户踢去授权页。
   */
  async function revalidateWhenBackendReady(): Promise<void> {
    for (let i = 0; i < 20; i++) {
      if (await verifyCurrentCode()) {
        error.value = '';
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  /** 启动时校验本地已存授权码（只跑一次有效校验）。无本地码时尝试预置试用码自动填充。 */
  async function init() {
    if (initialized.value) return;

    // ★★★ 先等后端就绪再校验授权 —— 这是移动端冷启动的关键一步。
    //
    // 真机顺序是「WebView 先加载前端 → 内嵌 Node 后端后启动」，此时若直接发请求：
    // 请求失败 → 校验不出结果 → 路由守卫把用户挡在 #/license，
    // 或（修复前）异常击穿路由启动 → .chat-page 永不挂载 → 各 store 的 onMounted 不执行
    // → 平台/模型/智能体全空（用户："数据初始化不行，要点进那两个页面才有"）。
    //
    // 放在这里而不是各 store：授权校验是**路由守卫里的第一道**，
    // 它过了才会挂载页面、才会跑 useChat.onMounted —— 一次等待，全局受益。
    // `waitForBackend` 有幂等记忆，就绪后立即返回，不引入额外延迟。
    const beReady = await waitForBackend();
    if (!beReady) {
      // 超时：不把用户永久挡在授权页。置 initialized 让守卫放行（门户大开好过整站打不开），
      // 后续业务请求失败时会各自走自己的错误路径；后端一旦起来，各页 onMounted 仍能补拉。
      initialized.value = true;
      error.value = '后端服务未就绪';
      // ★ 2026-10-24：有上次校验通过的记录就沿用，别把正在重启的用户踢到 /license。
      if (!restoreFromCache()) {
        verified.value = false;
        applyEdition(null);
      }
      void revalidateWhenBackendReady();
      return;
    }

    await verifyCurrentCode();
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
    rememberVerified(result.data);
    return true;
  }

  async function deactivate() {
    await clearLicenseCode();
    forgetVerified();
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