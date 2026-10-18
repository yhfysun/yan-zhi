/**
 * 内置模型厂商目录（2026-10-17 方案 §2.3）—— **纯数据，前后端共用**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★ 设计判据：目录是「可添加清单」，**不是**「已有平台」。
 *   默认塞 16 个没有 Key 的平台 ⇒ 用户一进模型页就一片失效平台、模型下拉被污染。
 *   所以这里只提供"点一下 → 弹填 Key → 才建平台"的模板数据。
 *
 * ★ baseUrl 一律**不带版本段**（路径拼接收敛在 core 的 resolveUpstreamUrl：
 *   火山 /api/v3、智谱 /api/paas/v4、百炼 /compatible-mode/v1 都由 base 决定版本段，
 *   用户把 /v1 写进 base 也不会 404）。
 *
 * ★ defaultModelIds **仅作「建议添加」提示**，不做强绑定 —— 模型 ID 变动频繁，
 *   硬编码进库只会过期；真要拉模型走 /v1/models 实时拉取。
 *
 * ★ 协议切换联动（UI 侧）：同一厂商有多个兼容端点时，切协议只在该厂商
 *   `urlByProtocol` 里查默认值，且仅当用户没手改过 URL 时才改写。
 *
 * ★ AWS Bedrock **单列 P2/不做**（SigV4 签名，非 OpenAI 兼容，硬塞进来会变成假支持）。
 */

import type { Protocol } from './types/index.js';

export interface ModelProviderPreset {
  /** 稳定键（落 platform.preset_key，便于「重置为默认」与统计） */
  key: string;
  /** 展示名 */
  name: string;
  /** 默认 baseUrl（不带版本段） */
  baseUrl: string;
  /** 首选协议 */
  protocol: Protocol;
  /** 同一厂商的其它兼容端点（协议切换时按此表改写 URL；缺省只此一个） */
  urlByProtocol?: Partial<Record<Protocol, string>>;
  /** 取 Key 的页面（填 Key 弹窗里给「去获取」链接） */
  keyUrl?: string;
  /** 品牌色（宫格卡片用） */
  brandColor: string;
  /** 图标文字（首字母/两字缩写；**不引入商标图片资产**） */
  iconText: string;
  /** 建议添加的模型 ID（仅提示，见文件头） */
  defaultModelIds?: string[];
  /** 备注（宫格卡片 tooltip / 详情页展示） */
  note?: string;
}

export const MODEL_PROVIDER_PRESETS: ModelProviderPreset[] = [
  {
    key: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    protocol: 'openai',
    urlByProtocol: { openai: 'https://api.deepseek.com', anthropic: 'https://api.deepseek.com/anthropic' },
    keyUrl: 'https://platform.deepseek.com/api_keys',
    brandColor: '#4D6BFE',
    iconText: 'DS',
    defaultModelIds: ['deepseek-v4-pro', 'deepseek-v4-flash'],
    note: 'V4 亦支持 Responses 格式；另有 Anthropic 兼容端点',
  },
  {
    key: 'volces-ark',
    name: '火山引擎（方舟）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    protocol: 'openai',
    keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint',
    brandColor: '#325AB4',
    iconText: '火山',
    defaultModelIds: ['doubao-seed-2.0-pro', 'doubao-seed-2.0-lite'],
    note: '模型 ID 是「推理接入点 ID」或 doubao-*；支持 Responses',
  },
  {
    key: 'minimax-cn',
    name: 'MiniMax（国内）',
    baseUrl: 'https://api.minimaxi.com/v1',
    protocol: 'openai',
    urlByProtocol: { openai: 'https://api.minimaxi.com/v1', anthropic: 'https://api.minimaxi.com/anthropic' },
    keyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    brandColor: '#F54340',
    iconText: 'MM',
    defaultModelIds: ['minimax-m3'],
  },
  {
    key: 'minimax-global',
    name: 'MiniMax（Global）',
    baseUrl: 'https://api.minimax.io/v1',
    protocol: 'openai',
    urlByProtocol: { openai: 'https://api.minimax.io/v1', anthropic: 'https://api.minimax.io/anthropic' },
    keyUrl: 'https://www.minimax.io/platform/user-center/basic-information/interface-key',
    brandColor: '#F54340',
    iconText: 'MM',
    defaultModelIds: ['minimax-m3'],
  },
  {
    key: 'zhipu-bigmodel',
    name: '智谱 Bigmodel',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    protocol: 'openai',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    brandColor: '#3E64FF',
    iconText: '智谱',
    defaultModelIds: ['glm-5.3-flash', 'glm-4.6'],
  },
  {
    key: 'aliyun-bailian',
    name: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    protocol: 'openai',
    keyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    brandColor: '#FF6A00',
    iconText: '百炼',
    defaultModelIds: ['qwen3.6-flash', 'qwen-plus', 'qwen-max'],
    note: '生图走原生通道（已有特判）',
  },
  {
    key: 'xiaomi-mimo',
    name: 'Xiaomi MiMo',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    protocol: 'openai',
    urlByProtocol: { openai: 'https://api.xiaomimimo.com/v1', anthropic: 'https://api.xiaomimimo.com/anthropic' },
    keyUrl: 'https://platform.xiaomimimo.com/#/console/api-keys',
    brandColor: '#FF6900',
    iconText: 'MiMo',
    defaultModelIds: ['mimo-v2.5'],
  },
  {
    key: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    protocol: 'openai',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    brandColor: '#4F46E5',
    iconText: '硅基',
    defaultModelIds: ['Qwen/Qwen3-235B-A22B', 'deepseek-ai/DeepSeek-V4-Pro'],
    note: '模型 ID 带厂商前缀（Qwen/...）',
  },
  {
    key: 'z-ai',
    name: 'Z.ai',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    protocol: 'openai',
    urlByProtocol: {
      openai: 'https://api.z.ai/api/paas/v4',
      anthropic: 'https://api.z.ai/api/anthropic',
    },
    keyUrl: 'https://z.ai/manage-apikey',
    brandColor: '#1F2937',
    iconText: 'Z.ai',
    defaultModelIds: ['glm-4.6'],
    note: '另有 Coding 端点 /api/coding/paas/v4',
  },
  {
    key: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    protocol: 'openai',
    keyUrl: 'https://openrouter.ai/keys',
    brandColor: '#6562FF',
    iconText: 'OR',
    defaultModelIds: ['deepseek/deepseek-chat'],
    note: '模型 ID 带前缀（deepseek/deepseek-chat）；美元计价',
  },
  {
    key: 'moonshot-cn',
    name: 'Kimi（国内）',
    baseUrl: 'https://api.moonshot.cn/v1',
    protocol: 'openai',
    urlByProtocol: { openai: 'https://api.moonshot.cn/v1', anthropic: 'https://api.moonshot.cn/anthropic' },
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    brandColor: '#00C2A8',
    iconText: 'Kimi',
    defaultModelIds: ['kimi-k3'],
  },
  {
    key: 'moonshot-global',
    name: 'Kimi（Global）',
    baseUrl: 'https://api.moonshot.ai/v1',
    protocol: 'openai',
    urlByProtocol: { openai: 'https://api.moonshot.ai/v1', anthropic: 'https://api.moonshot.ai/anthropic' },
    keyUrl: 'https://platform.moonshot.ai/console/api-keys',
    brandColor: '#00C2A8',
    iconText: 'Kimi',
    defaultModelIds: ['kimi-k3'],
  },
  {
    key: 'byteplus-ark',
    name: 'BytePlus ModelArk',
    baseUrl: 'https://ark.ap-southeast.bytepluses.com/api/v3',
    protocol: 'openai',
    keyUrl: 'https://console.byteplus.com/ark/region:byteplus+ap-southeast/endpoint',
    brandColor: '#1664FF',
    iconText: 'Byte+',
    defaultModelIds: ['doubao-seed-2.0-pro'],
    note: '支持 Responses / Anthropic；美元计价',
  },
  {
    key: 'hunyuan-cloud',
    name: '腾讯云混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    protocol: 'openai',
    keyUrl: 'https://console.cloud.tencent.com/hunyuan/api-key',
    brandColor: '#0052D9',
    iconText: '混元',
    defaultModelIds: ['hunyuan-turbos-latest'],
    note: '官方公告将迁移 TokenHub，接入前请确认文档',
  },
  {
    key: 'moark',
    name: '模力方舟（Gitee AI）',
    baseUrl: 'https://api.moark.com/v1',
    protocol: 'openai',
    keyUrl: 'https://ai.moark.com/',
    brandColor: '#C71D23',
    iconText: 'MoArk',
    note: '兼容 OpenAI / Anthropic',
  },
];

/** AWS Bedrock（P2/不做）：SigV4 签名，非 OpenAI 兼容 —— 硬塞进来会变成假支持 */
export const BEDROCK_P2_NOTE = 'AWS Bedrock 暂不支持（SigV4 签名，非 OpenAI 兼容协议）';

/** 按 key 取预设（目录页/服务端共用） */
export function findProviderPreset(key: string): ModelProviderPreset | undefined {
  return MODEL_PROVIDER_PRESETS.find((p) => p.key === key);
}

/**
 * 协议切换时的 URL 联动判据（UI 与服务端共用，**纯函数**）：
 * 只有「当前 URL 仍等于旧协议在该厂商的默认值」时才允许改写成新协议的默认值
 * —— 用户手改过（走自定义中转）就绝不动他的 URL（防止覆盖）。
 */
export function resolveProtocolUrl(preset: ModelProviderPreset, from: Protocol, to: Protocol, currentUrl: string): string {
  const fromDefault = preset.urlByProtocol?.[from] ?? preset.baseUrl;
  const toDefault = preset.urlByProtocol?.[to] ?? preset.baseUrl;
  const cur = (currentUrl || '').trim().replace(/\/+$/, '');
  if (cur !== fromDefault.replace(/\/+$/, '')) return cur; // 用户改过 ⇒ 保持
  return toDefault;
}
