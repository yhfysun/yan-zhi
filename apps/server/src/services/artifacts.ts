// 工件协议（2026-10-08 多智能体协同 P1）
//
// 目标：子智能体产出的大文件**只回「路径+描述」**给主智能体，全文不回流 ——
// 主上下文只收工件清单，细节由下游任务按路径自取。
//
// 实现取向（复用而非新表）：
//   工件登记**复用 conversation_file**（file_write / 媒体工具的产物本来就会经
//   artifact-hooks 落这张表，文件管理 UI 也认它）。这里只补两件事：
//     ① AsyncLocalStorage 作用域采集器：一次 runSubAgent 期间登记的所有产物
//        收集成清单（并发安全，嵌套 run 复用外层 store）；
//     ② runSubAgent 返回值改写：有产物时「短结论 + 工件清单」替代全文。

/** 单个工件的摘要（与 conversation_file 行对齐） */
export interface ArtifactBrief {
  id: string;
  path: string;
  name: string;
  category: string;
  size: number;
}

import { AsyncLocalStorage } from 'node:async_hooks';

interface CollectorStore { artifacts: ArtifactBrief[] }

const als = new AsyncLocalStorage<CollectorStore>();

/**
 * 在采集器作用域内执行 fn；期间经 collectArtifact() 登记的产物会被收集。
 * ★ 嵌套安全：外层已有 store（如 PlanRunner 包住 runSubAgent）时**复用外层**，
 *   内层结果携带同一份清单 —— 外层取到的 artifacts 含内层全部产出。
 */
export async function runWithArtifactCollector<T>(fn: () => Promise<T>): Promise<{ result: T; artifacts: ArtifactBrief[] }> {
  const existing = als.getStore();
  if (existing) {
    const result = await fn();
    return { result, artifacts: [...existing.artifacts] };
  }
  const store: CollectorStore = { artifacts: [] };
  const result = await als.run(store, fn);
  return { result, artifacts: [...store.artifacts] };
}

/** 产物登记时顺手采集（无作用域 = 主智能体自己产出，静默忽略） */
export function collectArtifact(a: ArtifactBrief): void {
  const store = als.getStore();
  if (!store) return;
  // 去重（同一 cf id 只收一次；并发下 registerFile 理论上不会重复，兜一道）
  if (store.artifacts.some((x) => x.id === a.id)) return;
  store.artifacts.push(a);
}

function fmtSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * 把子智能体返回值改写为「短结论 + 工件清单」。
 * 结论保留前 1200 字符（子智能体的收尾总结有决策价值），全文不回流。
 */
export function formatSubAgentReturn(result: string, artifacts: ArtifactBrief[]): string {
  if (!artifacts.length) return result;
  const lines = artifacts.map((a) => {
    const size = a.size ? `，${fmtSize(a.size)}` : '';
    return `- [${a.id}] ${a.name}（${a.category}${size}）→ ${a.path}`;
  }).join('\n');
  const head = result.length > 1200
    ? result.slice(0, 1200) + '\n…[结论过长已截断，细节在工件文件里]'
    : result;
  return `${head}\n\n产出工件 ${artifacts.length} 个（已登记，内容不随行返回；下游任务按上述路径用 file_read 自取）：\n${lines}`;
}
