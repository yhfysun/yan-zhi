import express from 'express';
import cors from 'cors';
import { setPlatformAdapter, getPluginManager, getToolRegistry } from '@yan-zhi/core';
import authRoutes from './auth.js';
import licenseRoutes from './license.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import spaceRoutes from './routes/spaces.js';
import fileRoutes from './routes/files.js';
import platformRoutes from './routes/platforms.js';
import mcpRoutes from './routes/mcp.js';
import skillRoutes from './routes/skills.js';
import toolsRoutes from './routes/tools.js';
import toolMarketplaceRoutes from './routes/tool-marketplace-sources.js';
import skillMarketplaceRoutes from './routes/skill-marketplace-sources.js';
import agentMarketplaceRoutes from './routes/agent-marketplace-sources.js';
import marketplaceRoutes from './routes/marketplace.js';
import browserRoutes from './routes/browser.js';
import searchRoutes from './routes/search.js';
import peersRoutes from './routes/peers.js';
import imRoutes from './routes/im.js';
import kbRoutes from './routes/kb.js';
import mcpBridgeRoutes from './mcp/index.js';
import workspaceRoutes from './routes/workspace.js';
import memoryRoutes from './routes/memory.js';
import scheduledTaskRoutes from './routes/scheduled-tasks.js';
import ollamaMarketRoutes from './routes/ollama-market.js';
import pluginRoutes from './routes/plugins.js';
import gitRoutes from './routes/git.js';
import { gitExplorerManifest, gitExplorerModule } from './plugins/git-explorer.js';
import { syncAgnesPlatformForAllUsers } from './agnes-platform/service.js';
import { startScheduledTaskScheduler } from './services/scheduled-tasks.js';
import { nodeAdapter } from './node-adapter.js';
import { db } from './db.js';

setPlatformAdapter(nodeAdapter);

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
app.use('/api/mcp-servers', mcpRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/tools', toolsRoutes);
app.use('/api/tool-marketplace', toolMarketplaceRoutes);
app.use('/api/skill-marketplace', skillMarketplaceRoutes);
app.use('/api/agent-marketplace', agentMarketplaceRoutes);
app.use('/api/marketplace', marketplaceRoutes);
  app.use('/api/browser', browserRoutes);
  app.use('/api/search', searchRoutes);
app.use('/api/peers', peersRoutes);
app.use('/api/im', imRoutes);
app.use('/api/kb', kbRoutes);
app.use('/api/mcp', mcpBridgeRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/scheduled-tasks', scheduledTaskRoutes);
app.use('/api/ollama-market', ollamaMarketRoutes);
app.use('/api/plugins', pluginRoutes);
app.use('/api/git', gitRoutes);

app.listen(PORT, '127.0.0.1', () => {
  console.log(`后端已启动: http://127.0.0.1:${PORT}`);
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

// 启动对话定时任务调度器（内部有 guard，只会启动一次）
startScheduledTaskScheduler();

// 插件系统初始化：恢复已启用插件、同步工具到 ToolRegistry、挂载插件后端路由
(async () => {
  try {
    const mgr = getPluginManager(nodeAdapter);
    await mgr.init();
    // 注册内置插件
    await mgr.registerBuiltin(gitExplorerManifest, gitExplorerModule);
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
    mgr.on('enabled', () => syncPluginTools());
    mgr.on('disabled', () => syncPluginTools());
    syncPluginTools();
    // 挂载已启用插件的后端路由（运行时新启用的需重启生效）
    for (const { pluginId, setup } of mgr.registry.backendRoutes) {
      const r = express.Router();
      setup(r);
      app.use(`/api/plugin/${pluginId}`, r);
    }
    console.log('[plugin] 插件系统已初始化');
  } catch (e) {
    console.error('[plugin] 插件系统初始化失败', e);
  }
})();
