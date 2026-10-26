/**
 * 轻量 semver range 匹配（插件 manifest.engine 用）。
 *
 * ★ 为什么不引 `semver` 包：宿主（服务端）与内嵌移动端后端都会跑这段校验，
 *   为一个 range 判断新增运行时依赖不划算（design §2 亦明确「用现有依赖或轻量自检」）。
 *   这里只实现插件 engine 真正会用到的子集，**不追求完整 npm 语义**：
 *     · 比较符：= / > / >= / < / <= （空白分隔的多个条件为「且」）
 *     · 简写：^ / ~ / 裸版本（x.y 视为 x.y.0 ≤ v < (x+1).0.0，同 npm）
 *     · 或：`||` 分隔（任一组满足即可）
 *     · 预发布：按 semver 规则，带预发布的版本小于同号正式版；range 未点预发布时不匹配预发布
 *   非法版本/非法 range 一律抛错 —— 调用方（安装校验）要能给出可读文案，不能静默放行。
 */

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

export const SEMVER_PATTERN = /^\d+\.\d+(\.\d+)?(-[0-9A-Za-z.-]+)?$/;

export function parseVersion(raw: string): ParsedVersion | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/.exec(raw.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: m[3] === undefined ? 0 : Number(m[3]),
    prerelease: m[4] ? m[4].split('.') : [],
  };
}

function compareIdentifiers(a: string, b: string): number {
  const an = /^\d+$/.test(a);
  const bn = /^\d+$/.test(b);
  if (an && bn) return Number(a) - Number(b);
  if (an) return -1; // 数字标识符优先级低于字母标识符
  if (bn) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 版本比较：<0 / 0 / >0。预发布版本小于同号正式版（semver §11）。 */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  for (const k of ['major', 'minor', 'patch'] as const) {
    if (a[k] !== b[k]) return a[k] - b[k];
  }
  if (!a.prerelease.length && !b.prerelease.length) return 0;
  if (!a.prerelease.length) return 1;
  if (!b.prerelease.length) return -1;
  const len = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < len; i++) {
    const x = a.prerelease[i];
    const y = b.prerelease[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const c = compareIdentifiers(x, y);
    if (c !== 0) return c;
  }
  return 0;
}

interface Comparator {
  op: '=' | '>' | '>=' | '<' | '<=';
  version: ParsedVersion;
}

function version(major: number, minor: number, patch: number): ParsedVersion {
  return { major, minor, patch, prerelease: [] };
}

/** 把单个条件（^1.2.3 / ~1.2 / >=0.1 / 0.1 …）展开成比较符列表 */
function parseComparator(token: string): Comparator[] {
  const m = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(token.trim());
  if (!m) throw new Error(`无法解析版本条件: ${token}`);
  const op = (m[1] || '') as string;
  const rawVer = m[2].trim();
  const v = parseVersion(rawVer);
  if (!v) throw new Error(`非法版本号: ${rawVer}`);

  if (op === '^') {
    let upper: ParsedVersion;
    if (v.major > 0) upper = version(v.major + 1, 0, 0);
    else if (v.minor > 0) upper = version(0, v.minor + 1, 0);
    else upper = version(0, 0, v.patch + 1);
    return [{ op: '>=', version: v }, { op: '<', version: upper }];
  }
  if (op === '~') {
    return [{ op: '>=', version: v }, { op: '<', version: version(v.major, v.minor + 1, 0) }];
  }
  if (op === '>=' || op === '>' || op === '<' || op === '<=') {
    return [{ op, version: v }];
  }
  if (op === '=') return [{ op: '=', version: v }];

  // 裸版本：补全精度（npm 同款：`1.2` = >=1.2.0 <1.3.0）
  const parts = rawVer.split('-')[0].split('.').length;
  if (parts >= 3) return [{ op: '=', version: v }];
  if (parts === 2) return [{ op: '>=', version: v }, { op: '<', version: version(v.major, v.minor + 1, 0) }];
  return [{ op: '>=', version: v }, { op: '<', version: version(v.major + 1, 0, 0) }];
}

function satisfiesComparators(v: ParsedVersion, comparators: Comparator[]): boolean {
  // 预发布版本：range 里没点明预发布 → 不匹配（npm 同款行为，避免装上 beta 版插件）
  if (v.prerelease.length && !comparators.some((c) => c.version.prerelease.length)) return false;
  for (const c of comparators) {
    const cmp = compareVersions(v, c.version);
    switch (c.op) {
      case '=':
        if (cmp !== 0) return false;
        break;
      case '>':
        if (cmp <= 0) return false;
        break;
      case '>=':
        if (cmp < 0) return false;
        break;
      case '<':
        if (cmp >= 0) return false;
        break;
      case '<=':
        if (cmp > 0) return false;
        break;
    }
  }
  return true;
}

/** 版本是否满足 range。版本或 range 非法 → 抛错（调用方转成可读文案）。 */
export function satisfiesRange(hostVersion: string, range: string): boolean {
  const v = parseVersion(hostVersion);
  if (!v) throw new Error(`非法版本号: ${hostVersion}`);
  if (typeof range !== 'string' || !range.trim()) {
    throw new Error('range 为空');
  }
  const alternatives = range.split('||').map((s) => s.trim()).filter(Boolean);
  if (!alternatives.length) throw new Error(`非法 range: ${range}`);
  return alternatives.some((alt) => {
    const tokens = alt.split(/\s+/).filter(Boolean);
    const comparators = tokens.flatMap(parseComparator);
    if (!comparators.length) throw new Error(`非法 range: ${range}`);
    return satisfiesComparators(v, comparators);
  });
}
