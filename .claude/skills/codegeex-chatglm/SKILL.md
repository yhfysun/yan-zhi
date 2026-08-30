---
name: codegeex-chatglm
description: 对接清华开源大模型（CodeGeeX 代码生成 / ChatGLM 对话 / 智谱 GLM 系列）。当用户要求"配置 CodeGeeX""接入 ChatGLM""用智谱 API""切换到 GLM 模型"时触发。指导在平台管理中添加智谱 AI / ChatGLM 的 OpenAI 兼容 API，配置模型并测试连通性。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# 对接清华开源大模型（codegeex-chatglm）

指导在言智平台中配置清华开源大模型（CodeGeeX / ChatGLM / 智谱 GLM 系列），通过 OpenAI 兼容 API 接入。

## 何时触发

- 用户说"配置 CodeGeeX""接入 ChatGLM""用智谱 API""切换 GLM 模型"等
- 用户要求添加清华/智谱的大模型平台
- 用户想用 GLM 系列模型做代码生成或对话

## 背景知识

清华开源大模型生态：
- **ChatGLM**：清华 KEG 实验室开源对话模型（GLM-4 系列）
- **CodeGeeX**：清华代码生成模型（多语言代码补全/生成）
- **智谱 AI（BigModel）**：ChatGLM 商用 API 平台，提供 OpenAI 兼容接口
- **API 地址**：`https://open.bigmodel.cn/api/paas/v4/`

智谱 API 兼容 OpenAI 接口格式，可直接在言智平台「平台管理」中添加。

## 标准流程

### 1. 获取 API Key

指导用户：
1. 访问 https://open.bigmodel.cn/
2. 注册/登录智谱开放平台
3. 在 API Keys 页面创建密钥（格式：`xxxxxxxx.xxxxxxxxxxxxxxxx`）

### 2. 添加平台

在言智平台「设置 → 平台管理」中添加：

| 字段 | 值 |
|------|-----|
| 平台名称 | 智谱 AI |
| 协议 | openai（OpenAI 兼容） |
| API 地址 | `https://open.bigmodel.cn/api/paas/v4/` |
| API Key | 用户获取的密钥 |

### 3. 配置模型

智谱 GLM 系列可用模型：

| 模型 ID | 用途 | 上下文 | 说明 |
|---------|------|--------|------|
| `glm-4-plus` | 通用对话 | 128K | GLM-4 增强版，综合能力强 |
| `glm-4` | 通用对话 | 128K | GLM-4 标准版 |
| `glm-4-air` | 轻量对话 | 128K | 低成本快速版 |
| `glm-4-long` | 长文本 | 1M | 超长上下文 |
| `glm-4v` | 视觉理解 | 2K | 多模态图文理解 |
| `glm-4-flash` | 免费对话 | 128K | 免费版，适合测试 |
| `codegeex-4` | 代码生成 | 128K | CodeGeeX 4，代码补全/生成/翻译 |

在「平台管理 → 模型管理」中添加需要的模型。

### 4. 测试连通性

添加后点击「测试」按钮，或创建会话发送测试消息：
```
你好，请介绍一下你自己。
```

确认返回正常即接入成功。

### 5. 使用 CodeGeeX 做代码生成

CodeGeeX-4 适合代码任务，可在智能体中配置：

- **代码补全**：设置 system prompt 引导补全场景
- **代码生成**：描述需求让模型生成代码
- **代码翻译**：让模型在不同语言间转换
- **代码注释**：让模型为代码添加注释
- **Bug 修复**：提供代码和错误信息让模型修复

示例 system prompt：
```
你是 CodeGeeX 代码助手，擅长多语言编程。
根据用户描述生成高质量代码，遵循最佳实践。
输出格式：先简述方案，再给完整代码，最后说明关键点。
```

## 自建 ChatGLM 部署接入

如用户自建部署 ChatGLM（如 ChatGLM3-6B / GLM-4-9B），也可接入：

1. 自建服务需暴露 OpenAI 兼容接口（如用 vLLM / FastChat 部署）
2. 在平台管理中添加：
   - API 地址：`http://<服务器IP>:<端口>/v1/`
   - API Key：任意值（自建通常不校验）
   - 模型 ID：部署时指定的模型名

### vLLM 部署示例

```bash
# 部署 GLM-4-9B（OpenAI 兼容接口）
python -m vllm.entrypoints.openai.api_server \
  --model THUDM/glm-4-9b-chat \
  --trust-remote-code \
  --port 8000
```

部署后在平台管理添加 API 地址 `http://<IP>:8000/v1/`。

## 注意事项

- 智谱 API Key 格式为 `id.secret`，整体作为 Key 填入
- API 地址末尾的 `/` 要保留（`/api/paas/v4/`）
- `glm-4-flash` 免费但有速率限制，适合测试
- `codegeex-4` 专门优化了代码任务，编程场景优先选用
- 自建部署需确保显卡显存足够（GLM-4-9B 约需 18GB 显存）
- API 调用费用见 https://open.bigmodel.cn/pricing