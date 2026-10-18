/**
 * 上游 API 路径拼接 —— **唯一实现处**（2026-10-17）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ 为什么必须有这个模块
 *
 * 改之前，URL 是在**调用点硬编码**的：`upstreamFetchRetry('v1/chat/completions', ...)`
 * 然后 `fetch(\`${this.baseUrl}/${upstreamPath}\`)` 无条件拼一个 `v1/` 上去。
 *
 * 这对 OpenAI 官方（`https://api.openai.com`，本身不带版本段）是对的，但对**国产厂商全部是错的**：
 *
 * | 厂商       | 用户填的 base（官方给的）                                 | 改之前会拼成                                 | 正确端点                             |
 * | -------- | --------------------------------------------- | ------------------------------------- | -------------------------------- |
 * | 火山方舟     | `https://ark.cn-beijing.volces.com/api/v3`    | `/api/v3/v1/chat/completions` ❌       | `/api/v3/chat/completions`       |
 * | 智谱       | `https://open.bigmodel.cn/api/paas/v4`        | `/api/paas/v4/v1/chat/completions` ❌  | `/api/paas/v4/chat/completions`  |
 * | 阿里云百炼    | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `.../v1/v1/chat/completions` ❌  | `.../v1/chat/completions`        |
 * | DeepSeek | `https://api.deepseek.com`                    | `/v1/chat/completions` ✅              | `/v1/chat/completions`           |
 *
 * 症状极具迷惑性：**不是"模型报错"，而是 404** —— 用户会认为"这个平台连不上/不被支持"，
 * 而不是"路径拼错了"。而且旧代码在 UI 上写了一句「API 地址不要带 /v1」，
 * 等于**把兼容成本转嫁给用户**（且对火山/智谱这种"官方地址本身就带版本段"的情况根本无解）。
 *
 * ---
 * ## 规则（一句话）
 *
 * **版本段由 base 决定，不由 rel 决定**：base 末尾已经是版本段 ⇒ 不再加；否则补 `v1/`。
 *
 * 顺带解决两个存量问题：
 * ① 用户把 `/v1` 写进 base（`https://api.deepseek.com/v1`）也不再 404（天然去重）；
 * ② 现有调用点传的 `'v1/chat/completions'` 不用改 —— 版本前缀会被剥掉后按 base 重新决定。
 *
 * ---
 * ## ★ 为什么是纯函数
 *
 * 宿主（`client.ts`）依赖 electron / platform adapter，无法在 vitest 里加载；
 * 而"作用到错对象且不报错"这类 bug 静态断言抓不住。⇒ 抽成**不 import 任何宿主依赖**的纯函数，
 * 让宿主和测试**都 require 同一份真实现**（本项目「抽纯函数 + 锚点钉唯一实现」的套路）。
 *
 * 服务端代理（`apps/server/src/routes/llm-proxy.ts`）也 import 同一份 —— 否则两端各拼一次，
 * 迟早漂移成两套规则。
 */

/** 版本段：`v1` / `v3` / `v4` …（只认末段，不认 `api/v3` 整体） */
const VERSION_SEGMENT_RE = /^v\d+$/i;

/** 相对路径（**不含版本段**）—— 版本由 base 决定，见文件头规则 */
const REL_PATH = {
  chat: 'chat/completions',
  messages: 'messages',
  responses: 'responses',
  embeddings: 'embeddings',
  models: 'models',
  images: 'images/generations',
  videos: 'videos',
} as const;

export type UpstreamKind = keyof typeof REL_PATH;

/**
 * 取 URL 的最后一个路径段（忽略 query / hash / 结尾斜杠）。
 * 非法输入（空串、纯字符串无路径）返回 `''`。
 */
function lastPathSegment(base: string): string {
  // 去掉 protocol://host 部分：只保留第一个 '/' 之后的内容
  const schemeIdx = base.indexOf('://');
  const afterScheme = schemeIdx >= 0 ? base.slice(schemeIdx + 3) : base;
  const slashIdx = afterScheme.indexOf('/');
  if (slashIdx < 0) return '';
  let path = afterScheme.slice(slashIdx + 1);
  // 去 query / hash
  const cut = path.search(/[?#]/);
  if (cut >= 0) path = path.slice(0, cut);
  // 去结尾斜杠后再取末段
  path = path.replace(/\/+$/, '');
  if (!path) return '';
  const parts = path.split('/');
  return parts[parts.length - 1] || '';
}

/**
 * 把 base 与相对路径拼成完整路径（**不做 fetch，只做字符串**）。
 *
 * @param baseUrl 平台 base，可带/不带结尾斜杠、可带/不带版本段
 * @param rel     相对路径。**允许**带版本前缀（`v1/chat/completions`）—— 会被剥掉，
 *                因为"要不要版本段"由 base 决定，不由调用方决定。
 */
export function joinUpstreamPath(baseUrl: string, rel: string): string {
  const rawBase = String(baseUrl ?? '').trim();
  const base = rawBase.replace(/\/+$/, '');
  // rel 归一化：去首斜杠 + 剥掉版本前缀
  const r = String(rel ?? '').trim().replace(/^\/+/, '').replace(/^v\d+\//i, '');
  if (!base) return r;
  if (!r) return base;

  return VERSION_SEGMENT_RE.test(lastPathSegment(base)) ? `${base}/${r}` : `${base}/v1/${r}`;
}

/**
 * 按「接口种类」解析出完整上游 URL —— **新代码一律用这个**，别再手写 `v1/...`。
 *
 * @example
 * resolveUpstreamUrl('https://ark.cn-beijing.volces.com/api/v3', 'chat')
 *   // → 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
 * resolveUpstreamUrl('https://api.openai.com', 'chat')
 *   // → 'https://api.openai.com/v1/chat/completions'
 */
export function resolveUpstreamUrl(baseUrl: string, kind: UpstreamKind): string {
  return joinUpstreamPath(baseUrl, REL_PATH[kind]);
}

/** 相对路径表（供调用方/测试按 kind 取，避免各处再抄一遍字符串） */
export function upstreamRelPath(kind: UpstreamKind): string {
  return REL_PATH[kind];
}
