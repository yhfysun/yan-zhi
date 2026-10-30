// 扫描剖面：同一类输入按不同深度组合步骤。
//
// ★ 剖面只描述"跑多深"，不描述"怎么跑"——具体步骤由各 Scanner 自己解释。
//   好处是新增引擎时不用改命令层，剖面名保持稳定。
import type { ScanKind } from './types.js';

export interface ScanProfile {
  key: string;
  label: string;
  desc: string;
}

export const PROFILES: Record<ScanKind, ScanProfile[]> = {
  source: [
    { key: 'quick', label: '快', desc: '规则包 + 高熵秘钥检测，秒级完成' },
    { key: 'standard', label: '全', desc: '规则包 + 依赖快照核对 + Electron 配置审计' },
    { key: 'deep', label: '深', desc: '全量规则 + 依赖 + 跨文件上下文复核（较慢）' },
  ],
  url: [
    { key: 'quick', label: '快', desc: '被动画像 + 安全头 + TLS + 基线' },
    { key: 'standard', label: '全', desc: '加快捷爬虫、JS 接口、目录、模板 POC' },
    { key: 'deep', label: '深', desc: '加反射验证；注入类需交战模式' },
    { key: 'api', label: '接口', desc: '端点枚举与鉴权矩阵（只读优先）' },
  ],
  package: [
    { key: 'quick', label: '快', desc: '清单属性 + 签名 + 明文流量' },
    { key: 'standard', label: '全', desc: '加 DEX 字符串、资源明文、WebView 配置' },
    { key: 'deep', label: '深', desc: 'jadx 反编译后做关键类语义审计' },
  ],
  self: [
    { key: 'quick', label: '快', desc: '源码规则 + 运行时配置 + 制品清单' },
    { key: 'standard', label: '全', desc: '加依赖、URL 基线、DEX 字符串' },
    { key: 'deep', label: '深', desc: '全链路 + 关键类语义复核' },
  ],
};

export function normalizeProfile(kind: ScanKind, raw: string | undefined): string {
  const key = String(raw || 'quick').toLowerCase();
  return PROFILES[kind].some((p) => p.key === key) ? key : 'quick';
}
