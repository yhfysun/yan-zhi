<template>
  <transition name="guide-fade">
    <div v-if="feature" class="feature-guide-mask" @click.self="$emit('close')">
      <div v-if="feature" class="feature-guide glass-card" @click.stop>
          <!-- 头部 -->
          <header class="guide-header">
            <div class="guide-title-wrap">
              <div class="guide-icon" :style="{ background: feature.color + '22', color: feature.color }">
                <el-icon :size="22"><component :is="resolvedIcon" /></el-icon>
              </div>
              <div class="guide-titles">
                <h2 class="guide-name">{{ feature.name }}</h2>
                <span class="guide-route">{{ feature.route }}</span>
              </div>
            </div>
            <button class="guide-close" @click="$emit('close')" aria-label="关闭">×</button>
          </header>

          <div class="guide-divider"></div>

          <!-- 内容区（可滚动） -->
          <div class="guide-body">
            <!-- 功能作用 -->
            <section class="guide-section">
              <div class="section-title"><span class="section-emoji">📋</span> 功能作用</div>
              <p class="section-text">{{ detail.purpose }}</p>
            </section>

            <!-- 用法介绍 -->
            <section class="guide-section">
              <div class="section-title"><span class="section-emoji">📖</span> 用法介绍</div>
              <p class="section-text">{{ detail.usage }}</p>
            </section>

            <!-- 功能按钮（无按钮的功能不渲染该段，如首页） -->
            <section v-if="detail.buttons.length" class="guide-section">
              <div class="section-title"><span class="section-emoji">🔘</span> 功能按钮</div>
              <ul class="section-list">
                <li v-for="btn in detail.buttons" :key="btn">{{ btn }}</li>
              </ul>
            </section>

            <!-- 接口规范（仅商城类功能） -->
            <section v-if="detail.apiSpec" class="guide-section">
              <div class="section-title"><span class="section-emoji">🔌</span> 接口规范</div>
              <pre class="section-code"><code>{{ detail.apiSpec }}</code></pre>
            </section>
          </div>

          <!-- 底部操作 -->
          <footer class="guide-footer">
            <el-button @click="$emit('close')">关闭</el-button>
            <el-button type="primary" @click="enterFeature">进入功能</el-button>
          </footer>
        </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  HomeFilled, ChatDotRound, Monitor, Cpu, Suitcase, Files, MagicStick, Box, Connection, Setting,
} from '@element-plus/icons-vue';

/** 功能信息（由 Home.vue 传入） */
interface FeatureInfo {
  key: string;        // 功能标识
  name: string;       // 功能名称
  icon: string;       // 图标名称
  color: string;      // 主题色
  route: string;      // 路由路径
}

const props = defineProps<{ feature: FeatureInfo | null }>();
defineEmits<{ close: [] }>();

const router = useRouter();

/** 图标名 → 组件映射 */
const ICON_MAP: Record<string, any> = {
  HomeFilled, ChatDotRound, Monitor, Cpu, Suitcase, Files, MagicStick, Box, Connection, Setting,
};
const resolvedIcon = computed(() => ICON_MAP[props.feature?.icon ?? ''] ?? HomeFilled);

/** 功能详情内容 */
interface FeatureDetail {
  purpose: string;        // 功能作用
  usage: string;          // 用法介绍
  buttons: string[];      // 功能按钮说明
  apiSpec?: string;       // 接口规范（仅商城类功能）
}

const FEATURE_DETAILS: Record<string, FeatureDetail> = {
  home: {
    purpose: 'yan-zhi 一体化日常办公助手工作台，将对话、浏览器自动化、模型配置、工具、技能（Skill）、智能体（Agent）、MCP 与外部服务接入统一整合，是进入全部功能模块的门户。',
    usage: '通过首页功能列表或星球入口进入任意模块：对话（与模型流式交流）、浏览器（网页自动化与截图）、模型（管理 OpenAI/Anthropic 平台与默认模型）、工具（内置/自定义/商城工具）、Skill（技能安装与编排）、智能体（单轮与多节点工作流）、MCP（接入外部服务）、设置（全局偏好与主题）。',
    buttons: [],
  },
  chat: {
    purpose: '流式对话工作台，支持多会话管理、工具调用可视化、思考链展示、Markdown 渲染与消息蒸馏为 Skill。',
    usage: '在左侧选择或新建任务 → 在底部输入框输入消息 → 点击发送（或回车）即可与模型交流；模型回复支持流式输出、工具调用展开、思考链折叠查看。',
    buttons: [
      '新建任务：左侧顶部按钮创建新任务',
      '消息操作：复制消息内容、将对话蒸馏为可复用 Skill',
      '工具调用展开：点击工具调用块查看入参/出参',
      '思考链展示：折叠/展开模型思考过程',
      '会话切换/重命名/删除：左侧会话列表上下文菜单',
      '模式开关：「+」菜单可开 深度思考 / 计划 / 仅回答 三种模式',
    ],
  },
  'chat-hub': {
    purpose: '统一聊天中心：聚合应用内助手会话、言智节点互聊（Peers）与 IM 渠道（飞书/企业微信/个人微信）消息。',
    usage: '左侧「会话 / 定时任务」列表管理聊天；节点聊天页与其它言智客户端互发消息、互取工具 / Skill / 智能体；配置 IM 连接后，渠道消息自动创建任务跑完并回执。',
    buttons: [
      '会话 / 定时任务：左侧标签页切换',
      '搜索会话：按名称模糊过滤',
      '节点聊天：与互联言智客户端对聊',
    ],
  },
  knowledge: {
    purpose: '共享知识库：文档自动切块并向量化（bge-small-zh），检索命中片段在对话前自动注入提示词。',
    usage: '创建 / 编辑 / 删除知识库并添加文档；检索缺失向量模型时自动降级为关键词匹配；不登录（guest）可访问 public 库，登录用户可建 private / public 共享库（跨设备可见）。',
    buttons: [
      '新建知识库：填写名称与描述',
      '添加文档：自动切块 + 向量化入库',
      '共享级别：private / public（服务端统一一套 DB）',
    ],
  },
  connections: {
    purpose: 'IM 渠道接入：飞书 / 企业微信 / 个人微信，实现「收消息 → 跑任务 → 回结果」自动闭环。',
    usage: '按 6 步向导填写应用凭据并在开放平台配置回调地址；飞书单聊回 open_id、群聊回 chat_id；企业微信支持加密模式（AES-256-CBC 解密 + XML 解析）；个人微信走 ClawBot 通道（需外部 CLI 与公网回调可达）。',
    buttons: [
      '飞书：自建应用 App ID / Secret + 事件回调',
      '企业微信：Corp ID / Secret / Token / EncodingAESKey',
      '个人微信：ClawBot 扫码通道（外部依赖）',
      '测试：连通性校验后启用',
    ],
  },
  peers: {
    purpose: '客户端节点互联：每个言智节点既是客户端也是服务端，可连接其他节点获取对方的工具 / Skill / 智能体。',
    usage: '添加对端节点地址完成握手后，可在工具 / Skill / 智能体商城中浏览并一键复制对端资源；本节点也可作为商城服务端对外暴露标准化 API（内容可见性 + none/bearer/api-key 认证）。',
    buttons: [
      '添加节点：填对端地址 + 认证方式',
      '商城服务端：本节点对外提供资源 API',
      '可见性：is_public 发布开关控制共享范围',
    ],
  },
  browser: {
    purpose: '内置浏览器自动化面板，可在聊天中调用浏览器工具进行网页操作（导航、点击、输入、截图等）。',
    usage: '在聊天中调用浏览器工具，浏览器面板会自动打开并显示当前页面；可手动在地址栏输入 URL 进行导航，或使用工具调用进行自动化操作。',
    buttons: [
      '地址栏：输入 URL 并回车导航',
      '前进/后退：浏览器历史导航',
      '刷新：重新加载当前页面',
      '截图：捕获当前页面快照供模型分析',
    ],
    apiSpec: `## 接口规范

### POST /api/browser/navigate
描述：导航到指定 URL
入参：
  - url: string (必填) — 目标 URL
出参：{ url: string, title: string }
示例请求：{ "url": "https://example.com" }
示例响应：{ "url": "https://example.com", "title": "Example Domain" }

### POST /api/browser/action
描述：在当前页面执行自动化动作
入参：
  - action: 'click' | 'input' | 'keypress' | 'scroll' | 'wait' (必填) — 动作类型
  - selector?: string (选填) — CSS 选择器（click/input 用）
  - text?: string (选填) — 输入文本（input 用）
  - key?: string (选填) — 按键名（keypress 用）
  - x?: number (选填) — 横坐标（scroll/click 坐标用）
  - y?: number (选填) — 纵坐标
出参：因动作而异，通常 { ok: boolean, value?: any }

### GET /api/browser/screenshot
描述：截取当前页面快照
入参：无
出参：image/png（二进制流，Content-Type: image/png）

### POST /api/browser/back
描述：后退到上一页
入参：无
出参：{ ok: boolean, url: string }

### POST /api/browser/forward
描述：前进到下一页
入参：无
出参：{ ok: boolean, url: string }

### POST /api/browser/refresh
描述：刷新当前页面
入参：无
出参：{ ok: boolean, url: string }

### GET /api/browser/proxy?url=
描述：代理获取远端页面/资源（绕过跨域）
查询参数：url — 目标 URL
出参：HTML 或资源原文（按目标 Content-Type 透传）

### GET /api/browser/history
描述：获取浏览历史记录
入参：无
出参：{ url: string, title: string, visitedAt: string }[]

### POST /api/browser/history
描述：记录一次访问到历史
入参：
  - url: string (必填) — 访问 URL
  - title?: string (选填) — 页面标题
出参：{ ok: boolean }

### GET /api/browser/analysis
描述：对当前页面进行 AI 分析（结构/内容/可交互元素）
入参：无
出参：
  {
    summary: string;            // 页面摘要
    elements: Array<{           // 可交互元素
      selector: string;
      type: string;
      text?: string;
    }>;
  }`,
  },
  models: {
    purpose: 'OpenAI 与 Anthropic 双协议配置中心，支持模型自动拉取、连通性测试、健康检查与默认模型设置。',
    usage: '添加平台 → 配置 API Key 与 Base URL → 点击"拉取模型"获取可用模型列表 → 测试连接 → 将目标模型设为默认。',
    buttons: [
      '添加平台：新建 OpenAI/Anthropic 兼容平台配置',
      '测试连接：验证 API Key 与网络连通性',
      '拉取模型：从远端 /models 接口拉取可用模型',
      '设为默认：将某个模型设为全局默认',
      '健康检查：定时检测平台可用性',
    ],
  },
  tools: {
    purpose: '统一管理内置工具、自定义 JS 沙箱工具与同源商城工具，所有工具遵循统一 CustomTool 协议，可在对话中被模型调用。',
    usage: '内置工具开箱即用；自定义工具用 JS 编写并在沙箱中执行，需提供 name、description、parameters（JSON Schema）与 executor；商城工具可一键安装到本地。',
    buttons: [
      '新建工具：创建自定义 JS 沙箱工具',
      '测试工具：在编辑器中试运行工具',
      '安装商城工具：从同源 Skill/Tool 商城一键安装',
      '启用/禁用：控制工具是否可被模型调用',
    ],
    apiSpec: `## 接口规范

### GET /api/tools
描述：列出所有本地工具（内置 + 自定义 + 已安装商城工具）
入参：无
出参：Tool[]

### POST /api/tools
描述：创建自定义 JS 沙箱工具
入参：
  - name: string (必填) — 工具名称，唯一
  - description: string (必填) — 工具描述，供模型决策
  - parameters: JSONSchema (必填) — 入参 JSON Schema
  - executor: string (必填) — JS 函数源码，沙箱执行
出参：Tool
示例请求：
  { "name": "calc", "description": "计算器",
    "parameters": { "type": "object", "properties": { "expr": { "type": "string" } }, "required": ["expr"] },
    "executor": "async (p) => ({ success: true, data: eval(p.expr) })" }

### PATCH /api/tools/:id
描述：更新工具字段（部分更新）
路径参数：id — 工具 ID
入参：Tool 的部分字段（name?、description?、parameters?、executor?、enabled?）
出参：Tool

### DELETE /api/tools/:id
描述：删除工具
路径参数：id — 工具 ID
出参：{ ok: boolean }

### PATCH /api/tools/:id { enabled }
描述：启用/禁用工具（控制是否可被模型调用）
路径参数：id — 工具 ID
入参：{ enabled: boolean }
出参：Tool

### GET /api/tools/marketplace
描述：拉取同源商城工具列表
入参：无
出参：Tool[]（source = 'market'）

### POST /api/tools/install
描述：从商城安装工具到本地
入参：
  - name: string (必填) — 商城中工具名称
  - source: string (必填) — 来源标识
出参：Tool

## 类型定义

interface Tool {
  id: string;
  name: string;
  description: string;
  parameters: JSONSchema;     // 入参 schema
  executor: string;           // JS 源码（自定义工具）
  source: 'builtin' | 'custom' | 'market';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

## CustomTool 协议
所有工具遵循统一接口：

interface ToolDefinition {
  name: string;           // 工具名称
  description: string;    // 描述
  parameters: JSONSchema; // 参数 schema
}
interface ToolExecutor {
  (params: Record<string, any>): Promise<ToolResult>;
}
interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

## 扩展自定义工具
1. 在工具管理页点击"新建工具"
2. 填写 name、description、parameters（JSON Schema）
3. 编写 executor（JS 函数，沙箱执行）
4. 测试通过后启用`,
  },
  skills: {
    purpose: '本地 Skill 管理 + 远程 Skill 商城，Skill 用 Markdown + front-matter 格式定义角色、触发词与工作流程。',
    usage: '从商城安装 Skill，或自定义创建；Skill 用 Markdown front-matter 定义 name、description、triggers，正文为角色定义/工作流程/输出格式。安装后可在对话中通过触发词激活。',
    buttons: [
      '安装：从远程商城安装 Skill 到本地',
      '启用/禁用：控制 Skill 是否参与触发匹配',
      '编辑：修改本地 Skill 的 Markdown 内容',
      '卸载：移除已安装的 Skill',
      '发布：将本地 Skill 发布到商城（isPublic）',
    ],
    apiSpec: `## 接口规范

### GET /api/skills
描述：列出所有已安装 Skill
入参：无
出参：Skill[]

### POST /api/skills
描述：安装或创建 Skill
入参：
  - name: string (必填) — kebab-case 名称
  - description: string (必填) — 一句话描述
  - triggers: string[] (必填) — 触发词列表
  - bodyMd: string (必填) — Markdown 正文（角色/流程/输出格式）
  - source?: string (选填) — 来源标识，默认 'local'
出参：Skill
示例请求：
  { "name": "code-reviewer", "description": "代码审查专家",
    "triggers": ["审查代码", "review"], "bodyMd": "你是一名资深代码审查专家..." }

### PATCH /api/skills/:id
描述：更新 Skill 字段（部分更新）
路径参数：id — Skill ID
入参：Skill 的部分字段（name?、description?、triggers?、bodyMd?、enabled?、isPublic?）
出参：Skill

### DELETE /api/skills/:id
描述：卸载 Skill
路径参数：id — Skill ID
出参：{ ok: boolean }

### PATCH /api/skills/:id { enabled }
描述：启用/禁用 Skill（控制是否参与触发匹配）
路径参数：id — Skill ID
入参：{ enabled: boolean }
出参：Skill

### PATCH /api/skills/:id { isPublic }
描述：发布到商城 / 从商城下架
路径参数：id — Skill ID
入参：{ isPublic: boolean }
出参：Skill

### GET /api/skills/marketplace
描述：拉取远程商城 Skill 列表
入参：无
出参：Skill[]（source = 'market'）

## 类型定义

interface Skill {
  id: string;
  name: string;                       // kebab-case
  description: string;
  source: 'market' | 'local';
  frontmatter: {
    name: string;
    description?: string;
    triggers?: string[];
    tools?: string[];
  };
  bodyMd: string;                     // Markdown 正文
  enabled: boolean;
  isPublic?: boolean;
  createdAt: string;
  updatedAt: string;
}

## Skill 格式（Markdown + front-matter）
---
name: <kebab-case 名称>
description: <一句话描述>
triggers:
  - <触发词1>
  - <触发词2>
tools:
  - <可调用工具名>
---
<body: 角色定义、工作流程、输出格式等>

## 扩展自己的 Skill 商城
实现 /api/skills 系列接口，返回符合 Skill 格式的数据。`,
  },
  distill: {
    purpose: '从历史对话记录中蒸馏出可复用 Skill，将长对话浓缩为标准化的角色定义 + 触发词 + 工作流程。',
    usage: '左屏选择源对话 → 中屏配置蒸馏模型、输入指令与温度 → 一键生成 Skill → 右屏预览/改造/保存到本地或发布到商城。',
    buttons: [
      '一键生成：调用蒸馏模型生成 Skill 草稿',
      '改造：手动编辑生成结果',
      '保存：保存到本地 Skill 库',
      '发布：发布到远程 Skill 商城',
    ],
    apiSpec: `## 接口规范

### POST /api/distill/generate
描述：从指定对话蒸馏生成 Skill 草稿
入参：
  - conversationId: string (必填) — 源对话 ID
  - instruction?: string (选填) — 蒸馏指令（额外要求）
  - model?: string (选填) — 蒸馏模型名，默认用配置模型
  - temperature?: number (选填) — 采样温度，默认 0.7
出参：{ skill: Skill }
示例请求：
  { "conversationId": "conv_abc", "instruction": "聚焦代码审查场景",
    "model": "gpt-4o", "temperature": 0.5 }
示例响应：
  { "skill": { "id": "skill_x", "name": "code-reviewer",
    "description": "代码审查专家", "triggers": ["审查", "review"],
    "bodyMd": "你是一名资深代码审查专家..." } }

### POST /api/distill/preview
描述：预览蒸馏结果（不落库）
入参：
  - conversationId: string (必填) — 源对话 ID
  - instruction?: string (选填) — 蒸馏指令
  - model?: string (选填) — 蒸馏模型名
  - temperature?: number (选填) — 采样温度
出参：Skill（未持久化，无 id）

### POST /api/distill/save
描述：保存蒸馏生成的 Skill 到本地
入参：Skill 完整对象（含 name、description、triggers、bodyMd 等）
出参：Skill（含持久化 id）

## 类型定义
（Skill 类型同"Skill 商店"模块）`,
  },
  agents: {
    purpose: '智能体管理，支持 harness（单轮对话）与 workflow（多节点编排）两种类型，workflow 使用 Vue Flow 画布进行可视化编排。',
    usage: '创建智能体 → 选择类型（harness/workflow）→ 配置系统提示词与工具集 → workflow 类型可在画布上添加子智能体节点并连线编排 → 测试运行。',
    buttons: [
      '新建智能体：创建 harness 或 workflow 智能体',
      '编辑画布：workflow 类型进入 Vue Flow 画布编排',
      '测试运行：在测试面板中试运行智能体',
      '子智能体调度：配置子智能体调用关系',
    ],
    apiSpec: `## 接口规范

### GET /api/agents
描述：列出所有智能体
入参：无
出参：Agent[]

### POST /api/agents
描述：创建智能体
入参：
  - name: string (必填) — 智能体名称
  - type: 'harness' | 'workflow' (必填) — 类型
  - systemPrompt: string (必填) — 系统提示词
  - tools: string[] (必填) — 可调用工具名列表
  - subAgents?: string[] (选填) — 子智能体 ID 列表
  - workflow?: WorkflowNode[] (选填) — workflow 节点编排
出参：Agent
示例请求：
  { "name": "代码审查员", "type": "harness",
    "systemPrompt": "你是资深代码审查专家", "tools": ["read-file", "lint"] }

### PATCH /api/agents/:id
描述：更新智能体（部分更新）
路径参数：id — 智能体 ID
入参：Agent 的部分字段
出参：Agent

### DELETE /api/agents/:id
描述：删除智能体
路径参数：id — 智能体 ID
出参：{ ok: boolean }

### POST /api/agents/:id/run
描述：运行智能体
路径参数：id — 智能体 ID
入参：
  - input: string (必填) — 用户输入
出参：
  {
    output: string;        // 智能体最终输出
    steps?: any[];         // workflow 各节点执行步骤
  }
示例响应：
  { "output": "审查完成，发现 3 处问题", "steps": [{ "node": "lint", "result": "..." }] }

## 类型定义

interface Agent {
  id: string;
  name: string;
  type: 'harness' | 'workflow';
  systemPrompt: string;
  tools: string[];
  subAgents?: string[];
  workflow?: WorkflowNode[];
  createdAt: string;
  updatedAt: string;
}

interface WorkflowNode {
  id: string;             // 节点 ID
  type: string;           // 节点类型（agent/tool/condition 等）
  name: string;           // 节点名称
  agentId?: string;       // 关联智能体 ID
  toolName?: string;      // 关联工具名
  next?: string[];        // 后继节点 ID
  config?: Record<string, any>;
}

## Agent 类型说明
- harness: 单轮对话智能体，系统提示词 + 工具集
- workflow: 工作流智能体，多节点编排（Vue Flow 画布）`,
  },
  mcp: {
    purpose: 'MCP（Model Context Protocol）服务管理，支持 stdio / SSE / Streamable HTTP 三种传输方式，可预览远端工具列表。',
    usage: '添加 MCP 服务器 → 选择传输方式（stdio/SSE/Streamable HTTP）→ 配置命令或 URL → 连接 → 查看远端暴露的工具列表 → 在对话中调用。',
    buttons: [
      '添加服务器：新建 MCP 服务配置',
      '连接/断开：控制与 MCP 服务器的连接',
      '查看工具：预览服务器暴露的工具列表',
      '编辑配置：修改传输方式与参数',
    ],
    apiSpec: `## 接口规范

### GET /api/mcp/servers
描述：列出所有 MCP 服务器配置
入参：无
出参：McpServer[]

### POST /api/mcp/servers
描述：添加 MCP 服务器
入参：
  - name: string (必填) — 服务器名称
  - transport: 'stdio' | 'sse' | 'streamable-http' (必填) — 传输方式
  - command?: string (选填, stdio 必填) — 启动命令
  - args?: string[] (选填) — 命令参数
  - url?: string (选填, sse/http 必填) — 服务 URL
  - env?: Record<string, string> (选填) — 环境变量
出参：McpServer
示例请求：
  { "name": "fs-server", "transport": "stdio",
    "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] }

### DELETE /api/mcp/servers/:id
描述：删除 MCP 服务器配置
路径参数：id — 服务器 ID
出参：{ ok: boolean }

### POST /api/mcp/servers/:id/connect
描述：连接 MCP 服务器
路径参数：id — 服务器 ID
入参：无
出参：{ ok: boolean, tools?: Tool[] }
示例响应：
  { "ok": true, "tools": [{ "name": "read_file", "description": "读取文件" }] }

### POST /api/mcp/servers/:id/disconnect
描述：断开 MCP 服务器连接
路径参数：id — 服务器 ID
入参：无
出参：{ ok: boolean }

### GET /api/mcp/servers/:id/tools
描述：列出远端服务器暴露的工具
路径参数：id — 服务器 ID
入参：无
出参：Tool[]

## 类型定义

interface McpServer {
  id: string;
  name: string;
  transport: 'stdio' | 'sse' | 'streamable-http';
  command?: string;                  // stdio 模式
  args?: string[];
  url?: string;                      // sse/http 模式
  env?: Record<string, string>;
  connected: boolean;
  createdAt: string;
  updatedAt: string;
}

## MCP 传输协议
1. stdio: 本地进程通信（标准输入输出）
2. SSE (Server-Sent Events): HTTP 流式单向推送
3. Streamable HTTP: HTTP 双向流

## MCP 协议说明
遵循 Model Context Protocol 规范，使用 JSON-RPC 2.0 通信：
- tools/list：返回工具列表
- tools/call：执行工具调用
示例：
  → { "jsonrpc": "2.0", "id": 1, "method": "tools/list" }
  ← { "jsonrpc": "2.0", "id": 1, "result": { "tools": [...] } }`,
  },
  settings: {
    purpose: '全局设置中心，包括默认平台/模型配置、主题切换、数据源与商城地址配置等。',
    usage: '在设置页配置默认平台和模型（影响对话默认调用）、切换明暗主题、配置商城 API 地址与数据源。',
    buttons: [
      '保存设置：持久化全局配置',
      '主题切换：明/暗主题',
      '默认平台/模型：设置对话默认调用目标',
    ],
  },
};

const detail = computed<FeatureDetail>(() => {
  const key = props.feature?.key ?? '';
  return FEATURE_DETAILS[key] ?? { purpose: '暂无介绍', usage: '', buttons: [] };
});

function enterFeature() {
  if (props.feature?.route) {
    router.push(props.feature.route);
  }
}
</script>

<style scoped>
/* 全屏遮罩 */
.feature-guide-mask {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  padding: 24px;
  overflow: hidden;
}

/* 弹窗主体 */
.feature-guide {
  width: 100%; max-width: 680px; max-height: 80vh;
  display: flex; flex-direction: column;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  color: #fff;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
/* 关闭 glass-card 默认 hover 位移，避免弹窗抖动 */
.feature-guide:hover { transform: none; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); }

/* 头部 */
.guide-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 24px;
}
.guide-title-wrap { display: flex; align-items: center; gap: 14px; }
.guide-icon {
  width: 44px; height: 44px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.guide-titles { display: flex; flex-direction: column; }
.guide-name { font-size: 20px; font-weight: 700; margin: 0; color: #fff; }
.guide-route {
  font-size: 12px; color: rgba(255, 255, 255, 0.5);
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  margin-top: 2px;
}
.guide-close {
  width: 32px; height: 32px; border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
  font-size: 20px; line-height: 1; cursor: pointer;
  transition: all 0.2s;
}
.guide-close:hover { background: rgba(239, 68, 68, 0.3); border-color: rgba(239, 68, 68, 0.5); color: #fff; }

.guide-divider {
  height: 1px; margin: 0 24px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
}

/* 内容区 */
.guide-body {
  padding: 18px 24px; overflow-y: auto; flex: 1; min-height: 0;
}
.guide-section { margin-bottom: 20px; }
.guide-section:last-child { margin-bottom: 0; }
.section-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 14px; font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 8px;
}
.section-emoji { font-size: 15px; }
.section-text {
  font-size: 13px; line-height: 1.75;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
}
.section-list {
  margin: 0; padding-left: 20px;
  font-size: 13px; line-height: 1.85;
  color: rgba(255, 255, 255, 0.7);
}
.section-list li { margin-bottom: 4px; }
.section-list li::marker { color: var(--color-primary); }

/* 代码块 */
.section-code {
  margin: 0; padding: 14px 16px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  overflow-x: auto;
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 12px; line-height: 1.7;
  color: rgba(255, 255, 255, 0.85);
  white-space: pre;
}
.section-code code { font-family: inherit; }

/* 底部 */
.guide-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.15);
}

/* 遮罩淡入 */
.guide-fade-enter-active, .guide-fade-leave-active { transition: opacity 0.25s ease; }
.guide-fade-enter-from, .guide-fade-leave-to { opacity: 0; }

/* 弹窗入场：一次性 CSS animation（不用 Vue transition，杜绝 transitionend 冒泡导致动画反复重播「变大变小」） */
.feature-guide { animation: guidePopIn 0.28s var(--ease-entrance, cubic-bezier(0.16, 1, 0.3, 1)); }
@keyframes guidePopIn {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}

/* 响应式 */
@media (max-width: 767px) {
  .feature-guide-mask { padding: 12px; }
  .feature-guide { max-height: 88vh; border-radius: 14px; }
  .guide-header { padding: 14px 16px; }
  .guide-body { padding: 14px 16px; }
  .guide-footer { padding: 12px 16px; }
  .guide-name { font-size: 17px; }
  .section-code { font-size: 11px; padding: 10px 12px; }
}
</style>