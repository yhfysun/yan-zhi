/**
 * 加密凭证自检（2026-10-16）。
 *
 * ★★★ 为什么必须有（实据，非推测）：
 *   dev 遗留库并入生产库（`scripts/merge-dev-db.py`）是**逐表 INSERT OR IGNORE 搬数据行**，
 *   而 `app_config` 里的 `saved_password_master_key` 因生产侧已有同名 key 被**跳过**。
 *   于是 dev 库里加密过的凭证搬过来之后，用生产主密钥**永远解不开**。
 *   AES-GCM 是认证加密，症状不是乱码而是抛 `Unsupported state or unable to authenticate data`，
 *   且该原文一路透传到运维连接弹窗的「测试连接」结果（`❌ Unsupported state…`）。
 *   当时是靠人工逐库比对主密钥指纹才定位的 —— 这件事不该靠人。
 *
 * 边界（刻意保守，与 db-integrity 同一原则）：
 *   · **只报不修** —— 没有源库密钥时密文在数学上无法恢复，唯一处置是用户重填，
 *     故不提供任何"自动修复/清空"入口（那会静默删掉用户数据）；
 *   · **永不抛错** —— 启动路径不该因为一次诊断失败而起不来；
 *   · **不打印密钥、密文与明文**，只报位置（表.列 / rowid / 插件键）与条数。
 */
import { createLogger } from './logger.js';
import { canDecrypt as realCanDecrypt, masterKeyFingerprint } from '../utils/crypto.js';

const logger = createLogger('credential-audit');

/** 已知存加密凭证的列 —— 与 utils/crypto.ts 的 `decrypt` 调用点一一对应。
 *  新增一处 decrypt 调用就必须在这里补一行，否则自检会漏掉那类凭证。 */
export const ENCRYPTED_COLUMNS: ReadonlyArray<{ table: string; column: string; by: string }> = [
  { table: 'saved_password', column: 'password_enc', by: 'routes/browser.ts（浏览器保存的密码）' },
  { table: 'mcp_credential', column: 'secret_enc', by: 'mcp/client-manager.ts（MCP 凭据）' },
  { table: 'data_source', column: 'password_enc', by: 'services/connector.ts（数据源连接）' },
];

/** 三段式密文（iv:tag:ciphertext，均 base64）。plugin_storage 里的密文没有固定列名，只能按形状认。 */
const TRIPLE_RE = /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]*$/;

export interface EncryptedRef {
  /** 人可读位置：`表.列` 或 `plugin_storage(插件).键` */
  where: string;
  rowId: string | number;
  payload: string;
}

export interface CredentialAuditResult {
  ok: boolean;
  total: number;
  failures: EncryptedRef[];
  /** 当前主密钥指纹；取不到（无 app_config 行等）为 null */
  keyFingerprint: string | null;
}

/** 最小 DB 接口：只用到 prepare().all()，便于测试注入内存库 */
export interface AuditDb {
  prepare(sql: string): { all(...args: unknown[]): unknown[] };
}

/**
 * 收集库里所有「看起来是加密凭证」的值。**只读、只认形状，不判断能否解开**。
 * 表/列不存在（老库、或该功能从未启用）一律跳过，不报错。
 */
export function collectEncryptedValues(db: AuditDb): EncryptedRef[] {
  const out: EncryptedRef[] = [];

  for (const { table, column } of ENCRYPTED_COLUMNS) {
    let rows: unknown[] = [];
    try {
      rows = db.prepare(
        `SELECT rowid AS rid, "${column}" AS v FROM "${table}" WHERE "${column}" IS NOT NULL AND "${column}" <> ''`,
      ).all();
    } catch {
      continue; // 表或列不存在 → 该功能未启用，跳过
    }
    for (const r of rows as Array<{ rid: string | number; v: unknown }>) {
      if (typeof r.v === 'string' && TRIPLE_RE.test(r.v)) {
        out.push({ where: `${table}.${column}`, rowId: r.rid, payload: r.v });
      }
    }
  }

  // plugin_storage：密文藏在 JSON 里（如 ops-shell 连接的 secretEnc），按形状递归兜一遍。
  // ★ 不按字段名白名单匹配：字段名换一版就会漏，形状（三段 base64）不会。
  let psRows: unknown[] = [];
  try {
    psRows = db.prepare('SELECT rowid AS rid, plugin_id, key, value FROM plugin_storage').all();
  } catch {
    psRows = [];
  }
  for (const r of psRows as Array<{ rid: string | number; plugin_id: string; key: string; value: unknown }>) {
    if (typeof r.value !== 'string') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(r.value);
    } catch {
      continue; // 非 JSON 值（如 __app__ 的开关）→ 跳过
    }
    const walk = (node: unknown, trail: string): void => {
      if (Array.isArray(node)) {
        node.forEach((n, i) => walk(n, `${trail}[${i}]`));
        return;
      }
      if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
          if (typeof v === 'string' && TRIPLE_RE.test(v)) {
            out.push({
              where: `plugin_storage(${r.plugin_id}).${r.key}${trail}.${k}`,
              rowId: r.rid,
              payload: v,
            });
          } else {
            walk(v, `${trail}.${k}`);
          }
        }
      }
    };
    walk(parsed, '');
  }

  return out;
}

/**
 * 自检：把收集到的密文逐个用当前主密钥试解，返回失败清单。
 * `opts.canDecrypt` 可注入（测试用；与 db-integrity 的 `opts.probe` 同一手法）。**永不抛错**。
 */
export function auditCredentials(
  db: AuditDb,
  opts?: { canDecrypt?: (payload: string) => boolean },
): CredentialAuditResult {
  const canDec = opts?.canDecrypt ?? realCanDecrypt;

  let keyFingerprint: string | null = null;
  try {
    keyFingerprint = masterKeyFingerprint();
  } catch {
    keyFingerprint = null;
  }

  let refs: EncryptedRef[] = [];
  try {
    refs = collectEncryptedValues(db);
  } catch (e) {
    logger.warn('[credential-audit] 收集加密凭证失败（跳过本次自检）:', e);
    return { ok: true, total: 0, failures: [], keyFingerprint };
  }

  const failures: EncryptedRef[] = [];
  for (const ref of refs) {
    let ok = false;
    try {
      ok = canDec(ref.payload);
    } catch {
      ok = false;
    }
    if (!ok) failures.push(ref);
  }
  return { ok: failures.length === 0, total: refs.length, failures, keyFingerprint };
}

/**
 * 启动时调用：跑自检并按结果打日志。**永不抛错**（启动路径不该被诊断挡住）。
 * 有失败时只报「哪些解不开」，不尝试修复。
 */
export function logCredentialAudit(db: AuditDb): CredentialAuditResult | null {
  try {
    const r = auditCredentials(db);
    const fp = r.keyFingerprint ?? '未知';
    if (r.total === 0) {
      logger.info(`[credential-audit] 加密凭证自检：库内无加密凭证（主密钥指纹 ${fp}）`);
      return r;
    }
    if (r.ok) {
      logger.info(`[credential-audit] 加密凭证自检通过：${r.total} 条全部可用当前主密钥解密（主密钥指纹 ${fp}）`);
      return r;
    }
    const where = r.failures.map((f) => `${f.where}#${f.rowId}`).join('、');
    logger.warn(
      `[credential-audit] ★ ${r.failures.length}/${r.total} 条加密凭证**无法用当前主密钥解密**`
      + `（主密钥指纹 ${fp}）：${where}。`
      + '通常意味着这些密文由**另一份数据库的主密钥**加密（例如开发库并入生产库时只搬了数据行、'
      + '主密钥行被跳过），本机永远解不开。用户侧表现为对应功能报「凭证解密失败」或'
      + '「Unsupported state or unable to authenticate data」。'
      + '处置只能由用户重新填写这些凭证（运维连接 / 数据源 / MCP 凭据 / 浏览器保存的密码）。'
      + '本条自检只报不修。',
    );
    return r;
  } catch (e) {
    logger.warn('[credential-audit] 自检异常（不影响启动）:', e);
    return null;
  }
}
