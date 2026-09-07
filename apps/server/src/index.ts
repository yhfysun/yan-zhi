import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import cors from 'cors';
import { setPlatformAdapter, getPluginManager, getToolRegistry } from '@yan-zhi/core';
import { ensureToolsInitialized } from './mcp/index.js';
import authRoutes from './auth.js';
import licenseRoutes from './license.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import spaceRoutes from './routes/spaces.js';
import fileRoutes from './routes/files.js';
import platformRoutes from './routes/platforms.js';
import { seedBuiltinWorkflowAgents, ensureBuiltinWorkflowModel } from './builtin-workflow-agents.js';
import agentRoutes from './routes/agents.js';
import workflowRoutes from './routes/workflow.js';
import mcpRoutes from './routes/mcp.js';
import skillRoutes from './routes/skills.js';
import toolsRoutes from './routes/tools.js';
import toolMarketplaceRoutes from './routes/tool-marketplace-sources.js';
import skillMarketplaceRoutes from './routes/skill-marketplace-sources.js';
import agentMarketplaceRoutes from './routes/agent-marketplace-sources.js';
import marketplaceRoutes from './routes/marketplace.js';
import browserRoutes from './routes/browser.js';
import peersRoutes from './routes/peers.js';
import imRoutes from './routes/im.js';
import kbRoutes from './routes/kb.js';
import mcpBridgeRoutes from './mcp/index.js';
import workspaceRoutes from './routes/workspace.js';
import memoryRoutes from './routes/memory.js';
import scheduledTaskRoutes from './routes/scheduled-tasks.js';
import ollamaMarketRoutes from './routes/ollama-market.js';
import pluginRoutes, { PLUGINS_DIR } from './routes/plugins.js';
import gitRoutes from './routes/git.js';
import datasourceRoutes from './routes/datasources.js';
import sqlConsoleRoutes from './routes/sql-console.js';
import ontologyRoutes from './routes/ontologies.js';
import llmProxyRoutes from './routes/llm-proxy.js';
import llmTaskRoutes from './routes/llm-tasks.js';
import llmLogsRoutes from './routes/llm-logs.js';
import { gitExplorerManifest, gitExplorerModule } from './plugins/git-explorer.js';
import { computerUseManifest, computerUseModule } from './plugins/computer-use.js';
import { syncAgnesPlatformForAllUsers } from './agnes-platform/service.js';
import { ensureProjectDataSource } from './services/datasource.js';
import { ensureBuiltinOntologies } from './services/ontology.js';
import { startScheduledTaskScheduler } from './services/scheduled-tasks.js';
import { startMemoryDreamingScheduler } from './services/memory-dreaming.js';
import { syncDingtalkStreamClients } from './services/dingtalk-stream.js';
import { nodeAdapter } from './node-adapter.js';
import { db } from './db.js';

setPlatformAdapter(nodeAdapter);

// 启动时立即初始化工具注册中心（管理类工具就位），避免首次获取 registry 时重复初始化。
ensureToolsInitialized();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: Date.now() });
});

app.use('/api/auth', authRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/conversations', fileRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/spaces', spaceRoutes);
app.use('/api/platforms', platformRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/mcp-servers', mcpRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/tools', toolsRoutes);
app.use('/api/tool-marketplace', toolMarketplaceRoutes);
app.use('/api/skill-marketplace', skillMarketplaceRoutes);
app.use('/api/agent-marketplace', agentMarketplaceRoutes);
app.use('/api/marketplace', marketplaceRoutes);
  if (process.env.MOBILE_MODE) {
    // 移动端：playwright 浏览器自动化不可用，返回 501 避免运行时崩溃
    app.use('/api/browser', (_req, res) => res.status(501).json({ error: '浏览器自动化在移动端不可用' }));
  } else {
    app.use('/api/browser', browserRoutes);
  }
app.use('/api/peers', peersRoutes);
app.use('/api/im', imRoutes);
app.use('/api/datasources', datasourceRoutes);
app.use('/api/sql-console', sqlConsoleRoutes);
app.use('/api/ontologies', ontologyRoutes);
app.use('/api/kb', kbRoutes);
app.use('/api/mcp', mcpBridgeRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/scheduled-tasks', scheduledTaskRoutes);
app.use('/api/ollama-market', ollamaMarketRoutes);
app.use('/api/plugins', pluginRoutes);
app.use('/api/git', gitRoutes);
app.use('/api/llm', llmProxyRoutes);
app.use('/api/llm', llmTaskRoutes);
// LLM 交互日志（按 用户/会话/模型 统计，口径：一条 assistant 消息 = 一次 LLM 调用）
app.use('/api/llm', llmLogsRoutes);

const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`后端已启动: http://${HOST}:${PORT}`);
});

// 启动时清理已移除的内置模型平台残留记录（local-model-*）
try {
  db.prepare("DELETE FROM model WHERE id LIKE 'local-model-%'").run();
  db.prepare("DELETE FROM platform WHERE id LIKE 'local-model-%'").run();
  console.log('[cleanup] 已清理内置模型平台残留记录');
} catch (e) { console.warn('[cleanup] 清理内置模型平台残留失败:', e); }

// 启动时为所有用户惰性初始化 agnes 线上平台及其模型（仅首次 seed，已存在不覆盖）
try {
  const r = syncAgnesPlatformForAllUsers();
  if (r.seeded.length) console.log(`[agnes] 已为用户初始化平台: ${r.seeded.join(', ')}`);
} catch (e) { console.warn('[agnes] 初始化平台失败:', e); }

// 内置「调研报告生成流水线」智能体：幂等 seed（首次创建 / 版本升级覆盖修正）+ LLM 节点模型自动回填
try {
  const s = seedBuiltinWorkflowAgents(db);
  if (s.seeded.length) console.log(`[builtin-wf] 已内置工作流智能体: ${s.seeded.join(', ')}`);
  if (s.restored.length) console.log(`[builtin-wf] 定义版本升级，已还原内置工作流: ${s.restored.join(', ')}`);
  const f = ensureBuiltinWorkflowModel(db);
  if (f.filled) console.log('[builtin-wf] 内置工作流 LLM 节点已自动回填模型');
} catch (e) { console.warn('[builtin-wf] 初始化失败:', e); }

// 数据面预热（P4.1）：内置项目库数据源 + 全表自动本体。
// 异步生成不阻塞启动；生成完即 published，智能体启动后可直接取数（首次调用也会同步兜底等待）。
try {
  ensureProjectDataSource('guest');
  ensureBuiltinOntologies('guest');
  console.log('[data] 内置项目库数据源与自动本体预热已触发');
} catch (e) { console.warn('[data] 数据面预热失败:', e); }

// 启动对话定时任务调度器（内部有 guard，只会启动一次）
startScheduledTaskScheduler();

// 启动记忆整理（Dreaming）调度器：每日按配置时刻后台整理记忆
startMemoryDreamingScheduler();

// 启动钉钉 Stream 客户端：为所有启用的 dingtalk 连接器恢复长连接
try {
  syncDingtalkStreamClients();
} catch (e) {
  console.warn('[im] 钉钉 Stream 客户端启动失败:', e);
}

// 插件系统初始化：恢复已启用插件、同步工具到 ToolRegistry、挂载插件后端路由
(async () => {
  try {
    const mgr = getPluginManager(nodeAdapter);
    await mgr.init();
    // 注册内置插件
    await mgr.registerBuiltin(gitExplorerManifest, gitExplorerModule);
    // computer-use 高危权限（desktop-input），默认 disabled（仅首次注册生效，之后随 DB 状态），需在插件管理页手动开启
    // 移动端（MOBILE_MODE）无桌面输入环境，跳过注册避免运行时崩溃
    if (!process.env.MOBILE_MODE) {
      await mgr.registerBuiltin(computerUseManifest, computerUseModule, false);
    }
    // 已安装插件重启恢复：loadFromDb 只恢复了状态，入口模块未绑定（enabled 状态下工具/路由未注册），扫描目录补绑
    try {
      for (const d of fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const mfPath = path.join(PLUGINS_DIR, d.name, 'manifest.json');
        if (!fs.existsSync(mfPath) || !mgr.get(d.name)) continue;
        const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8')) as { id: string; main?: string };
        const entry = path.join(PLUGINS_DIR, d.name, mf.main || 'index.js');
        await mgr.rebindAndReactivate(mf.id, pathToFileURL(entry).href);
      }
    } catch {
      /* plugins/installed 目录不存在等，忽略 */
    }
    const toolReg = getToolRegistry();
    const syncPluginTools = () => {
      for (const name of toolReg.names()) {
        if (name.startsWith('plugin_')) toolReg.unregister(name);
      }
      for (const { pluginId, tool } of mgr.registry.getTools()) {
        try {
          toolReg.register({ ...tool, name: `plugin_${pluginId}__${tool.name}` });
        } catch {
          /* 重名跳过 */
        }
      }
    };
    const mountedRoutes = new Set<string>();
    const mountPluginRoutes = (pluginId: string) => {
      if (mountedRoutes.has(pluginId)) return;
      const setups = mgr.registry.backendRoutes.filter((e) => e.pluginId === pluginId);
      if (setups.length === 0) return;
      const r = express.Router();
      for (const { setup } of setups) setup(r);
      app.use(`/api/plugin/${pluginId}`, r);
      mountedRoutes.add(pluginId);
    };
    mgr.on('enabled', (id: string) => {
      syncPluginTools();
      // 启用时即时挂载该插件的后端路由（免去重启生效）
      mountPluginRoutes(id);
    });
    mgr.on('disabled', () => syncPluginTools());
    syncPluginTools();
    // 挂载启动时已启用插件的后端路由
    for (const { pluginId } of mgr.registry.backendRoutes) {
      mountPluginRoutes(pluginId);
    }
    console.log('[plugin] 插件系统已初始化');
  } catch (e) {
    console.error('[plugin] 插件系统初始化失败', e);
  }
})();
