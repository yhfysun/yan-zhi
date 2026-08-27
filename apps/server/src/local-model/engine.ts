import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LlamaChat, QwenChatWrapper } from 'node-llama-cpp';
import type { Llama, LlamaModel } from 'node-llama-cpp';
import {
  localMessagesToChatHistory,
  openAiToolsToNodeLlamaFunctions,
  type LocalChatMessage,
  type OpenAiTool,
} from './tool-call-adapter.js';

export const LOCAL_MODEL_FILENAME = 'qwen2.5-1.5b-instruct-q4_k_m.gguf';
export const LOCAL_MODEL_DISPLAY_NAME = 'Qwen2.5-1.5B-Instruct';

export interface LocalChatOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onTextChunk?: (text: string) => void;
  tools?: OpenAiTool[];
}

export interface LocalChatResult {
  content: string;
  finishReason: 'stop' | 'abort' | 'max_tokens';
  modelPath: string;
  toolCalls: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

type NodeLlamaModule = typeof import('node-llama-cpp');

interface LoadedLocalModel {
  module: NodeLlamaModule;
  llama: Llama;
  model: LlamaModel;
  modelPath: string;
}

let engine: LoadedLocalModel | null = null;
let loading: Promise<LoadedLocalModel | null> | null = null;
let loadError = '';
let generationQueue: Promise<unknown> = Promise.resolve();

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function candidateModelPaths(): string[] {
  const explicit = process.env.LOCAL_MODEL_PATH;
  const candidates = [
    explicit,
    path.resolve(currentDir, '../../models', LOCAL_MODEL_FILENAME),
    path.resolve(process.cwd(), 'models', LOCAL_MODEL_FILENAME),
    path.resolve(process.cwd(), 'apps/server/models', LOCAL_MODEL_FILENAME),
    path.resolve(process.cwd(), LOCAL_MODEL_FILENAME),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(candidates)];
}

export function findLocalModelFile(): string | null {
  for (const candidate of candidateModelPaths()) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export function getLocalModelStatus() {
  const modelPath = engine?.modelPath || findLocalModelFile() || null;
  return {
    available: Boolean(engine || modelPath),
    loading: Boolean(loading),
    modelPath,
    displayName: LOCAL_MODEL_DISPLAY_NAME,
    error: loadError,
  };
}

async function createLlama(module: NodeLlamaModule): Promise<Llama> {
  try {
    return await module.getLlama({
      gpu: 'auto',
      logLevel: module.LlamaLogLevel.warn,
    });
  } catch {
    // 某些机器没有可用 GPU 或预编译二进制不匹配，回退到纯 CPU。
    return module.getLlama({ logLevel: module.LlamaLogLevel.warn });
  }
}

async function loadLocalModel(): Promise<LoadedLocalModel | null> {
  if (engine) return engine;
  if (loading) return loading;

  const modelPath = findLocalModelFile();
  if (!modelPath) {
    loadError = `未找到本地模型文件 ${LOCAL_MODEL_FILENAME}`;
    return null;
  }

  loading = (async () => {
    let module: NodeLlamaModule | null = null;
    let llama: Llama | null = null;

    try {
      module = await import('node-llama-cpp');
      llama = await createLlama(module);
      const model = await llama.loadModel({
        modelPath,
        gpuLayers: 'auto',
        onLoadProgress: () => undefined,
      });

      engine = { module, llama, model, modelPath };
      loadError = '';
      return engine;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      loadError = message;
      console.error(`[local-model] 加载本地模型失败: ${message}`);
      await llama?.dispose().catch(() => undefined);
      return null;
    } finally {
      loading = null;
    }
  })();

  return loading;
}

export function warmupLocalModel(): Promise<LoadedLocalModel | null> {
  console.log(`[local-model] 启动预热本地模型: ${findLocalModelFile() || '(未找到模型文件)'}`);
  return loadLocalModel().then((loaded) => {
    if (loaded) console.log('[local-model] 本地模型已就绪');
    return loaded;
  });
}

export async function generateLocalChat(
  messages: LocalChatMessage[],
  options: LocalChatOptions = {},
): Promise<LocalChatResult | null> {
  const run = async (): Promise<LocalChatResult | null> => {
    const loaded = await loadLocalModel();
    if (!loaded) return null;

    const { history } = localMessagesToChatHistory(messages);
    const functions = openAiToolsToNodeLlamaFunctions(options.tools);
    const context = await loaded.model.createContext({
      contextSize: 8192,
      batchSize: 512,
      threads: 0,
    });

    let chat: LlamaChat | null = null;
    try {
      chat = new LlamaChat({
        contextSequence: context.getSequence(),
        chatWrapper: new QwenChatWrapper({ variation: '3' }),
      });

      const baseOptions = {
        maxTokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.7,
        signal: options.signal,
        stopOnAbortSignal: true,
        trimWhitespaceSuffix: true,
        onTextChunk: options.onTextChunk,
      };

      const response = Object.keys(functions).length > 0
        ? await chat.generateResponse(history, {
            ...baseOptions,
            functions,
            documentFunctionParams: true,
            maxParallelFunctionCalls: 1,
          })
        : await chat.generateResponse(history, baseOptions);

      const finishReason: LocalChatResult['finishReason'] = options.signal?.aborted
        ? 'abort'
        : response.metadata.stopReason === 'maxTokens'
          ? 'max_tokens'
          : 'stop';
      const toolCalls = (response.functionCalls || []).map((call, index) => ({
        id: `call_local_${Date.now()}_${index}`,
        type: 'function' as const,
        function: {
          name: call.functionName,
          arguments: JSON.stringify(call.params ?? {}),
        },
      }));

      return {
        content: response.response.trim(),
        finishReason,
        modelPath: loaded.modelPath,
        toolCalls,
      };
    } finally {
      chat?.dispose({ disposeSequence: true });
      await context.dispose().catch(() => undefined);
    }
  };

  const result = generationQueue.then(run, run);
  generationQueue = result.catch(() => undefined);
  return result;
}
