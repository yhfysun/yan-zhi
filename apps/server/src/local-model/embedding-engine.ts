// 内置 embedding 引擎 —— 用 node-llama-cpp 加载一个 embedding 模型（bge-small-zh）。
// 与本地对话 LLM 相互独立：同一 llama 实例可加载多个 model。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Llama, LlamaModel, LlamaEmbeddingContext } from 'node-llama-cpp';

export const EMBEDDING_MODEL_FILENAMES = [
  'bge-small-zh-v1.5-q8_0.gguf',
  'bge-small-zh-v1.5-f16.gguf',
  'bge-small-zh-v1.5.gguf',
  'text2vec-base-chinese-f16.gguf',
];
export const EMBEDDING_DIMENSIONS = 512;
export const EMBEDDING_MODEL_DISPLAY_NAME = 'bge-small-zh (内置向量)';

interface LoadedEmbedding {
  module: typeof import('node-llama-cpp');
  llama: Llama;
  model: LlamaModel;
  context: LlamaEmbeddingContext;
  modelPath: string;
}

let engine: LoadedEmbedding | null = null;
let loading: Promise<LoadedEmbedding | null> | null = null;
let loadError = '';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function candidateEmbeddingPaths(): string[] {
  const explicit = process.env.LOCAL_EMBEDDING_MODEL_PATH;
  const names = explicit ? [explicit] : EMBEDDING_MODEL_FILENAMES;
  const dirs = [
    path.resolve(currentDir, '../../models'),
    process.env.MODELS_DIR || '',
    process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR, 'models') : '',
    path.resolve(process.cwd(), 'models'),
    path.resolve(process.cwd(), 'apps/server/models'),
  ].filter(Boolean);
  const candidates: string[] = [];
  for (const n of names) {
    if (path.isAbsolute(n) && fs.existsSync(n)) return [n];
    for (const d of dirs) {
      const p = path.resolve(d, n);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return [p];
    }
  }
  return candidates;
}

export function findEmbeddingModelFile(): string | null {
  const candidates = candidateEmbeddingPaths();
  return candidates[0] || null;
}

export function getEmbeddingModelStatus() {
  const modelPath = engine?.modelPath || findEmbeddingModelFile() || null;
  return {
    available: Boolean(engine || modelPath),
    loading: Boolean(loading),
    modelPath,
    displayName: EMBEDDING_MODEL_DISPLAY_NAME,
    dimensions: EMBEDDING_DIMENSIONS,
    error: loadError,
  };
}

async function createLlama(module: typeof import('node-llama-cpp')): Promise<Llama> {
  try {
    return await module.getLlama({ gpu: 'auto', logLevel: module.LlamaLogLevel.warn });
  } catch {
    return module.getLlama({ logLevel: module.LlamaLogLevel.warn });
  }
}

async function loadEmbeddingModel(): Promise<LoadedEmbedding | null> {
  if (engine) return engine;
  if (loading) return loading;
  const modelPath = findEmbeddingModelFile();
  if (!modelPath) {
    loadError = `未找到内置 embedding 模型文件（需置于 models/：${EMBEDDING_MODEL_FILENAMES[0]}）`;
    return null;
  }
  loading = (async () => {
    const module = await import('node-llama-cpp');
    let llama: Llama | null = null;
    try {
      llama = await createLlama(module);
      const model = await llama.loadModel({ modelPath, gpuLayers: 'auto', onLoadProgress: () => undefined });
      const context = await model.createEmbeddingContext({ contextSize: 512 });
      engine = { module, llama, model, context, modelPath };
      loadError = '';
      return engine;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      loadError = message;
      console.error(`[local-embedding] 加载失败: ${message}`);
      await llama?.dispose().catch(() => undefined);
      return null;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** 生成文本向量。模型未加载或加载失败返回 null。 */
export async function embedText(text: string): Promise<number[] | null> {
  const loaded = await loadEmbeddingModel();
  if (!loaded) return null;
  try {
    const result = await loaded.context.getEmbeddingFor(String(text).slice(0, 8000));
    return Array.from(result.vector);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    loadError = message;
    console.error(`[local-embedding] 推理失败: ${message}`);
    return null;
  }
}

/** 批量生成（顺序执行，避免并发争抢 context） */
export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const out: (number[] | null)[] = [];
  for (const t of texts) out.push(await embedText(t));
  return out;
}
