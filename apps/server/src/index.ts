import express from 'express';
import cors from 'cors';
import authRoutes from './auth.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import platformRoutes from './routes/platforms.js';
import mcpRoutes from './routes/mcp.js';
import skillRoutes from './routes/skills.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: Date.now() });
});

app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/platforms', platformRoutes);
app.use('/api/mcp-servers', mcpRoutes);
app.use('/api/skills', skillRoutes);

app.listen(PORT, () => {
  console.log(`后端已启动: http://localhost:${PORT}`);
});
