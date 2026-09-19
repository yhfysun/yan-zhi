# LlmClient 仅支持 OpenAI 协议，Anthropic 协议后端未实现

- **状态**：未解决
- **严重度**：medium
- **发现日期**：2026-09-19（汇总既有记录）

## 现象

新增 Anthropic 平台（协议选 `anthropic`）后，模型调用失败或行为异常。

## 根因

`LlmClient` 当前只实现了 OpenAI 协议的请求/响应适配，
`protocol: 'anthropic'` 在后端**没有对应的实现分支**。

## 影响面

- 无法直接接入 Claude 系列模型（需用户自行套一层 OpenAI 兼容网关）。
- 平台表单里已可选该协议，但选了不可用 —— 属「选了才知道不行」，体验不佳。

## 修复方向

在 `LlmClient` 中补齐 Anthropic 协议适配：

- 请求体：`system` 独立字段（非 messages 里的 system 角色）、`max_tokens` 必填；
- 认证头：`x-api-key` + `anthropic-version`，而非 `Authorization: Bearer`；
- 流式事件格式：`content_block_delta` / `message_delta` 等，与 OpenAI 的
  `choices[].delta` 结构不同，需要在流式解析层做分支；
- 工具调用（tool_use / tool_result）的字段映射与 OpenAI 的 `tool_calls` 差异较大。

> 建议先确认是否只为「直连官方 API」，还是也要兼容各种第三方 Anthropic 兼容端点 ——
> 后者对字段宽容度要求更高。

## 备注

若短期不做，至少在平台表单里把 `anthropic` 选项置灰或标注「暂未支持」，
避免用户配置完才发现不可用。