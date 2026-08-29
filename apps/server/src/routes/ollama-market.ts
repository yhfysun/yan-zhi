// Ollama 模型管理路由：拉取 / 删除 / 测试 / 列表，替代原内置 local-model-market。
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://127.0.0.1:11434';

interface CatalogItem {
  key: string;
  displayName: string;
  sizeHint: string;
  params: string;
  recommended: boolean;
  desc: string;
  effect: string;
  hardware: string;
  tier: 'low' | 'mid' | 'high' | 'ultra' | 'embedding';
  modality?: 'vision' | 'embedding';
}

const MODEL_CATALOG: CatalogItem[] = [
  { key: 'qwen2.5:0.5b', tier: 'low', displayName: 'Qwen2.5 0.5B', sizeHint: '~400 MB', params: '0.5B', recommended: true, desc: '通义千问 0.5B，极轻量，低配机器首选', effect: '简单问答与闲聊可用，适合离线兜底', hardware: '内存 2GB+，任意 CPU 可跑' },
  { key: 'qwen2.5:1.5b', tier: 'low', displayName: 'Qwen2.5 1.5B', sizeHint: '~1.0 GB', params: '1.5B', recommended: true, desc: '通义千问 1.5B，效果与速度均衡', effect: '中文问答接近云端小模型水平', hardware: '内存 4GB+，无 GPU 可跑' },
  { key: 'qwen2.5:3b', tier: 'low', displayName: 'Qwen2.5 3B', sizeHint: '~2.0 GB', params: '3B', recommended: true, desc: '通义千问 3B，中文友好', effect: '中文写作/总结/翻译均可', hardware: '内存 4GB+，无 GPU 可跑' },
  { key: 'llama3.2:1b', tier: 'low', displayName: 'Llama 3.2 1B', sizeHint: '~1.3 GB', params: '1B', recommended: false, desc: 'Meta Llama 3.2 1B，英文能力较强', effect: '英文写作与代码优于同参数 Qwen', hardware: '内存 3GB+，无 GPU 可跑' },
  { key: 'gemma2:2b', tier: 'low', displayName: 'Gemma 2 2B', sizeHint: '~1.6 GB', params: '2B', recommended: false, desc: 'Google Gemma 2 2B，英文综合能力强', effect: '英文写作与推理优于同参数 Qwen', hardware: '内存 4GB+，无 GPU 可跑' },
  { key: 'phi3.5:3.8b', tier: 'low', displayName: 'Phi-3.5 Mini', sizeHint: '~2.5 GB', params: '3.8B', recommended: false, desc: '微软 Phi-3.5 Mini，小体积大能力', effect: '英文推理与代码强', hardware: '内存 6GB+，无 GPU 可跑' },
  { key: 'minicpm3:4b', tier: 'low', displayName: 'MiniCPM3 4B', sizeHint: '~2.5 GB', params: '4B', recommended: true, desc: '面壁智能 MiniCPM3，小模型逻辑王', effect: '逻辑推理与写作远超同参数模型', hardware: '内存 6GB+，无 GPU 可跑' },
  { key: 'qwen3:0.6b', tier: 'low', displayName: 'Qwen3 0.6B', sizeHint: '~500 MB', params: '0.6B', recommended: true, desc: '通义千问 3 代 0.6B，最新架构', effect: '中文问答，低配首选', hardware: '内存 2GB+，任意 CPU 可跑' },
  { key: 'qwen3:1.7b', tier: 'low', displayName: 'Qwen3 1.7B', sizeHint: '~1.5 GB', params: '1.7B', recommended: true, desc: '通义千问 3 代 1.7B', effect: '中文写作/推理，超越 Qwen2.5 同参数', hardware: '内存 4GB+，无 GPU 可跑' },
  { key: 'qwen3:4b', tier: 'low', displayName: 'Qwen3 4B', sizeHint: '~2.5 GB', params: '4B', recommended: true, desc: '通义千问 3 代 4B', effect: '中文综合能力强，支持思考模式', hardware: '内存 6GB+，无 GPU 可跑' },
  { key: 'deepseek-r1:1.5b', tier: 'low', displayName: 'DeepSeek R1 1.5B', sizeHint: '~1.1 GB', params: '1.5B', recommended: true, desc: '深度求索 R1 推理模型 1.5B', effect: '数学/逻辑推理强，小体积大能力', hardware: '内存 4GB+，无 GPU 可跑' },
  { key: 'qwen2.5:7b', tier: 'mid', displayName: 'Qwen2.5 7B', sizeHint: '~4.7 GB', params: '7B', recommended: true, desc: '通义千问 7B，中文能力强', effect: '中文写作/代码/推理全面', hardware: '内存 8GB+，可选 GPU' },
  { key: 'llama3.1:8b', tier: 'mid', displayName: 'Llama 3.1 8B', sizeHint: '~4.9 GB', params: '8B', recommended: true, desc: 'Meta Llama 3.1 8B，综合能力强', effect: '英文/代码/推理优秀', hardware: '内存 8GB+，可选 GPU' },
  { key: 'gemma2:9b', tier: 'mid', displayName: 'Gemma 2 9B', sizeHint: '~5.5 GB', params: '9B', recommended: false, desc: 'Google Gemma 2 9B', effect: '英文综合能力强', hardware: '内存 12GB+，可选 GPU' },
  { key: 'qwen3:8b', tier: 'mid', displayName: 'Qwen3 8B', sizeHint: '~5.0 GB', params: '8B', recommended: true, desc: '通义千问 3 代 8B', effect: '中文综合能力强，支持思考模式', hardware: '内存 12GB+，可选 GPU' },
  { key: 'deepseek-r1:7b', tier: 'mid', displayName: 'DeepSeek R1 7B', sizeHint: '~4.7 GB', params: '7B', recommended: true, desc: '深度求索 R1 推理模型 7B', effect: '数学/逻辑/代码推理强', hardware: '内存 8GB+，可选 GPU' },
  { key: 'deepseek-r1:8b', tier: 'mid', displayName: 'DeepSeek R1 8B', sizeHint: '~5.0 GB', params: '8B', recommended: false, desc: '深度求索 R1 推理模型 8B', effect: '推理能力强，基于 Llama3.1', hardware: '内存 12GB+，可选 GPU' },
  { key: 'glm4:9b', tier: 'mid', displayName: 'GLM-4 9B', sizeHint: '~5.5 GB', params: '9B', recommended: true, desc: '智谱 GLM-4 9B，中文能力强', effect: '中文对话/写作/推理全面', hardware: '内存 12GB+，可选 GPU' },
  { key: 'qwen2.5:14b', tier: 'high', displayName: 'Qwen2.5 14B', sizeHint: '~9.0 GB', params: '14B', recommended: true, desc: '通义千问 14B，高质量中文', effect: '中文接近云端大模型水平', hardware: '16GB+，需 GPU' },
  { key: 'qwen2.5:32b', tier: 'high', displayName: 'Qwen2.5 32B', sizeHint: '~20 GB', params: '32B', recommended: false, desc: '通义千问 32B', effect: '中文高质量，需较强硬件', hardware: '24GB+ 显存' },
  { key: 'qwen3:14b', tier: 'high', displayName: 'Qwen3 14B', sizeHint: '~9.0 GB', params: '14B', recommended: true, desc: '通义千问 3 代 14B', effect: '中文高质量，支持思考模式', hardware: '16GB+，需 GPU' },
  { key: 'qwen3:32b', tier: 'high', displayName: 'Qwen3 32B', sizeHint: '~20 GB', params: '32B', recommended: false, desc: '通义千问 3 代 32B', effect: '中文顶级，支持思考模式', hardware: '24GB+ 显存' },
  { key: 'deepseek-r1:14b', tier: 'high', displayName: 'DeepSeek R1 14B', sizeHint: '~9.0 GB', params: '14B', recommended: true, desc: '深度求索 R1 推理模型 14B', effect: '推理能力接近云端', hardware: '16GB+，需 GPU' },
  { key: 'deepseek-r1:32b', tier: 'high', displayName: 'DeepSeek R1 32B', sizeHint: '~20 GB', params: '32B', recommended: false, desc: '深度求索 R1 推理模型 32B', effect: '强推理能力，需较强硬件', hardware: '24GB+ 显存' },
  { key: 'llama3.1:70b', tier: 'ultra', displayName: 'Llama 3.1 70B', sizeHint: '~40 GB', params: '70B', recommended: false, desc: 'Meta Llama 3.1 70B', effect: '顶级英文能力', hardware: '双卡/多卡' },
  { key: 'qwen2.5:72b', tier: 'ultra', displayName: 'Qwen2.5 72B', sizeHint: '~42 GB', params: '72B', recommended: false, desc: '通义千问 72B', effect: '顶级中文能力', hardware: '双卡/多卡' },
  { key: 'qwen3:72b', tier: 'ultra', displayName: 'Qwen3 72B', sizeHint: '~42 GB', params: '72B', recommended: false, desc: '通义千问 3 代 72B', effect: '顶级中文，支持思考模式', hardware: '双卡/多卡' },
  { key: 'deepseek-r1:70b', tier: 'ultra', displayName: 'DeepSeek R1 70B', sizeHint: '~40 GB', params: '70B', recommended: false, desc: '深度求索 R1 推理模型 70B', effect: '顶级推理能力', hardware: '双卡/多卡' },
  { key: 'nomic-embed-text', tier: 'embedding', modality: 'embedding', displayName: 'Nomic Embed v1.5', sizeHint: '~270 MB', params: 'embed', recommended: true, desc: '英文向量模型，768维，Ollama 默认', effect: '知识库向量化（英文），速度快', hardware: '内存 1GB+' },
  { key: 'bge-m3', tier: 'embedding', modality: 'embedding', displayName: 'BGE M3', sizeHint: '~1.2 GB', params: 'embed', recommended: true, desc: '多语言向量模型，1024维，支持100+语言', effect: '知识库向量化（中英混合首选）', hardware: '内存 2GB+' },
  { key: 'bge-large-zh-v1.5', tier: 'embedding', modality: 'embedding', displayName: 'BGE Large zh v1.5', sizeHint: '~1.3 GB', params: 'embed', recommended: false, desc: '中文高精度向量模型，1024维', effect: '知识库向量化（中文高精度）', hardware: '内存 2GB+' },
  { key: 'bge-small-zh-v1.5', tier: 'embedding', modality: 'embedding', displayName: 'BGE Small zh v1.5', sizeHint: '~100 MB', params: 'embed', recommended: true, desc: '中文轻量向量模型，512维，速度极快', effect: '知识库向量化（中文低配首选）', hardware: '内存 1GB+' },
  { key: 'mxbai-embed-large', tier: 'embedding', modality: 'embedding', displayName: 'MxBAI Embed Large', sizeHint: '~670 MB', params: 'embed', recommended: true, desc: '英文向量模型，1024维，MTEB 榜首', effect: '知识库向量化（英文最强）', hardware: '内存 2GB+' },
  { key: 'snowflake-arctic-embed', tier: 'embedding', modality: 'embedding', displayName: 'Snowflake Arctic Embed', sizeHint: '~670 MB', params: 'embed', recommended: false, desc: '英文向量模型，1024维，高性价比', effect: '知识库向量化（英文）', hardware: '内存 2GB+' },
  { key: 'snowflake-arctic-embed:l', tier: 'embedding', modality: 'embedding', displayName: 'Snowflake Arctic Embed L', sizeHint: '~1.2 GB', params: 'embed', recommended: false, desc: '英文大版本，1024维，精度更高', effect: '知识库向量化（英文高精度）', hardware: '内存 3GB+' },
  { key: 'all-minilm', tier: 'embedding', modality: 'embedding', displayName: 'All-minilm L6 V2', sizeHint: '~45 MB', params: 'embed', recommended: true, desc: '英文超轻量，384维，极快', effect: '知识库向量化（英文低配极速）', hardware: '内存 512MB+' },
  { key: 'jina-embeddings-v2-base-zh', tier: 'embedding', modality: 'embedding', displayName: 'Jina Embeddings v2 zh', sizeHint: '~160 MB', params: 'embed', recommended: false, desc: '中文向量模型，768维', effect: '知识库向量化（中文）', hardware: '内存 1GB+' },
  { key: 'jina-embeddings-v2-base-en', tier: 'embedding', modality: 'embedding', displayName: 'Jina Embeddings v2 en', sizeHint: '~160 MB', params: 'embed', recommended: false, desc: '英文向量模型，768维，长文本优秀', effect: '知识库向量化（英文长文本）', hardware: '内存 1GB+' },
  { key: 'multilingual-e5-base', tier: 'embedding', modality: 'embedding', displayName: 'Multilingual E5 Base', sizeHint: '~280 MB', params: 'embed', recommended: false, desc: '多语言向量模型，768维', effect: '知识库向量化（多语言）', hardware: '内存 1GB+' },
  { key: 'multilingual-e5-large', tier: 'embedding', modality: 'embedding', displayName: 'Multilingual E5 Large', sizeHint: '~560 MB', params: 'embed', recommended: false, desc: '多语言大版本，1024维', effect: '知识库向量化（多语言高精度）', hardware: '内存 2GB+' },
  { key: 'chroma-all-minilm-l6-v2', tier: 'embedding', modality: 'embedding', displayName: 'Chroma all-minilm L6', sizeHint: '~90 MB', params: 'embed', recommended: false, desc: '英文轻量，384维，Chroma 默认', effect: '知识库向量化（英文轻量）', hardware: '内存 512MB+' },
  { key: 'shaw/dmeta-embedding', tier: 'embedding', modality: 'embedding', displayName: 'Dmeta Embedding', sizeHint: '~120 MB', params: 'embed', recommended: false, desc: '多语言向量模型', effect: '知识库向量化（多语言）', hardware: '内存 1GB+' },
  { key: 'quentinz/bge-small-zh-v1.5', tier: 'embedding', modality: 'embedding', displayName: 'BGE Small zh (quentinz)', sizeHint: '~100 MB', params: 'embed', recommended: false, desc: '社区打包中文轻量向量', effect: '知识库向量化（中文轻量）', hardware: '内存 1GB+' },
];

const pullStatus = new Map<string, { state: string; progress: number; message: string }>();

async function fetchOllamaTags(): Promise<Array<{ name: string; size?: number }>> {
  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!resp.ok) return [];
    const data = await resp.json() as any;
    return (data?.models || []).map((m: any) => ({ name: m.name, size: m?.size }));
  } catch { return []; }
}

// GET /api/ollama-market
router.get('/', async (_req: Request, res: Response) => {
  const existing = await fetchOllamaTags();
  const existingNames = new Set(existing.map((m) => m.name));
  const items = MODEL_CATALOG.map((m) => ({
    ...m,
    onDisk: existingNames.has(m.key),
    download: pullStatus.get(m.key) || null,
  }));
  res.json({ data: { items, existing, ollamaBaseUrl: OLLAMA_BASE } });
});

// POST /api/ollama-market/:model/pull
router.post('/:model/pull', async (req: Request, res: Response) => {
  const model = req.params.model;
  if (pullStatus.get(model)?.state === 'downloading') {
    res.json({ ok: true, message: '正在拉取中' });
    return;
  }
  pullStatus.set(model, { state: 'downloading', progress: 0, message: '开始拉取...' });
  res.json({ ok: true, message: '开始拉取' });

  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
    });
    if (!resp.ok || !resp.body) {
      pullStatus.set(model, { state: 'error', progress: 0, message: `HTTP ${resp.status}` });
      return;
    }
    const reader = (resp.body as any).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const d = JSON.parse(line);
          if (d.total && d.completed) {
            pullStatus.set(model, { state: 'downloading', progress: d.completed / d.total, message: `拉取中 ${Math.round((d.completed / d.total) * 100)}%` });
          }
          if (d.status === 'success') {
            pullStatus.set(model, { state: 'done', progress: 1, message: '拉取完成' });
          }
        } catch { /* skip non-JSON line */ }
      }
    }
    if (pullStatus.get(model)?.state === 'downloading') {
      pullStatus.set(model, { state: 'done', progress: 1, message: '拉取完成' });
    }
  } catch (e: any) {
    pullStatus.set(model, { state: 'error', progress: 0, message: e?.message || '拉取失败' });
  }
});

// DELETE /api/ollama-market/:model
router.delete('/:model', async (req: Request, res: Response) => {
  const model = req.params.model;
  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    if (!resp.ok) { res.status(resp.status).json({ error: `删除失败: HTTP ${resp.status}` }); return; }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || '删除失败' });
  }
});

// POST /api/ollama-market/:model/test
router.post('/:model/test', async (req: Request, res: Response) => {
  const model = req.params.model;
  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '你好，请用一句话介绍自己。' }],
        stream: false,
        options: { num_predict: 100 },
      }),
    });
    if (!resp.ok) { res.status(resp.status).json({ error: `测试失败: HTTP ${resp.status}` }); return; }
    const data = await resp.json() as any;
    const reply = data?.message?.content || '';
    res.json({ ok: true, reply });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || '测试失败' });
  }
});

export default router;
