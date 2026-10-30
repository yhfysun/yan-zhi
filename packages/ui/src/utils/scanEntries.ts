// 安全控制台「扫描入口卡」的元数据与命令拼装。
//
// ★ 卡片不是新的执行面：它只产出命令行，由控制台 submitCommand 走既有链路
//   （解析 → 确认 → POST /plugin/sec-lab/run → withGuard → 审计）。
// ★ 抽成纯函数是为了能单测：SFC 里的拼串一旦写错（漏引号、profile 拼错），
//   typecheck 抓不到，只有点下去才发现。
export type ScanKind = 'source' | 'url' | 'package' | 'self';

export interface ScanEntry {
  key: ScanKind;
  icon: string;
  label: string;
  sub: string;
  cmd: string;
  profiles: readonly string[];
  placeholder: string;
  note: string;
}

export const SCAN_ENTRIES: readonly ScanEntry[] = [
  {
    key: 'source', icon: 'S', label: '源码扫描', sub: '规则包 · 依赖 · Electron',
    cmd: 'scan-source', profiles: ['quick', 'standard', 'deep'],
    placeholder: '源码目录绝对路径', note: '只读，不执行被测代码',
  },
  {
    key: 'url', icon: 'U', label: 'URL 扫描', sub: '画像 · 探测 · 模板 POC',
    cmd: 'scan-url', profiles: ['quick', 'standard', 'deep'],
    placeholder: 'https://…（必须先登记授权范围）', note: '目标未登记授权会被护栏拒绝',
  },
  {
    key: 'package', icon: 'P', label: '安装包扫描', sub: 'APK · asar · EXE',
    cmd: 'scan-package', profiles: ['quick', 'standard', 'deep'],
    placeholder: 'APK / asar / ZIP 文件路径', note: '解包只读，不安装不执行',
  },
  {
    key: 'self', icon: 'Y', label: '言智一键体检', sub: '仓库 + 运行时 + 制品',
    cmd: 'scan-self', profiles: ['quick', 'standard', 'deep'],
    placeholder: '留空 = 扫仓库源码', note: '自有资产由服务端识别，外部目标会被拒',
  },
];

/** 目标里可能有空格：命令行解析器支持引号，统一加引号；内部引号先去掉防截断 */
export function buildScanCommand(entry: ScanEntry, rawTarget: string, profile: string): string {
  const target = String(rawTarget || '').trim().replace(/"/g, '');
  if (!target && entry.key !== 'self') throw new Error('请先填写扫描目标');
  const parts = [`/${entry.cmd}`];
  if (target) parts.push(`"${target}"`);
  parts.push(`--profile=${profile}`);
  return parts.join(' ');
}

export function findScanEntry(key: string): ScanEntry | null {
  return SCAN_ENTRIES.find((e) => e.key === key) || null;
}
