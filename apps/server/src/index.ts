import express from 'express';
import cors from 'cors';
import { setPlatformAdapter } from '@yan-zhi/core';
import authRoutes from './auth.js';
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
import peersRoutes from './routes/peers.js';
import imRoutes from './routes/im.js';
import kbRoutes from './routes/kb.js';
import mcpBridgeRoutes from './mcp/index.js';
import workspaceRoutes from './routes/workspace.js';
import memoryRoutes from './routes/memory.js';
import { nodeAdapter } from './node-adapter.js';
import localModelRoutes from './local-model/router.js';
import { warmupLocalModel } from './local-model/engine.js';

setPlatformAdapter(nodeAdapter);

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: Date.now() });
});

app.use('/api/auth', authRoutes);
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
app.use('/api/peers', peersRoutes);
app.use('/api/im', imRoutes);
app.use('/api/kb', kbRoutes);
app.use('/api/mcp', mcpBridgeRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/local-model', localModelRoutes);

app.listen(PORT, '127.0.0.1', () => {
  console.log(`后端已启动: http://127.0.0.1:${PORT}`);
});

warmupLocalModel().catch((error) => {
  console.error(`[local-model] 预热本地模型失败: ${error instanceof Error ? error.message : String(error)}`);
});
