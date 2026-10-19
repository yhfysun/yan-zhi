// 超大工具输出落盘（对齐 Claude Code 的 spill 机制，2026-10-19）。
//
// 问题：file_read 大文件 / cmd 长日志 / 页面正文可达几十 KB。此前两种处理都有代价：
//   · 全量进上下文 → 撑爆窗口、触发压缩、把别的有用历史挤掉；
//   · 首尾截断丢弃中段 → 模型看不到需要的 API，只能反复重读，任务原地打转
//     （实测开发会话因此退化成"400 字符分块读"）。
//
// 现在的做法：超过阈值就把**全文写到会话 intermediate 目录**，上下文里只留
// 「首部 + 尾部 + 落盘路径」，模型需要完整内容时用 file_read 按路径读取
// （支持 offset/limit 分段）。信息不丢、上下文不炸、重读成本可控。
//
// 边界：
//   - 只落"中间产物"目录（会话级），不写工作目录/交付目录；
//   - 落盘失败（无权限/磁盘满）→ 返回原文，由调用方回退到原有的首尾截断；
//   - 文件名工具名经过白名单字符替换，不含路径分隔符。
import fs from 'node:fs';
import path from 'node:path';
import { ensureArtifactDirFor } from './artifact-dir.js';

/** 超过该字符数的工具输出落盘（≈4K token）；低于它的直接内联，避免碎片文件 */
export const TOOL_SPILL_THRESHOLD_CHARS = 16 * 1024;
/** 上下文里保留的首/尾长度（落盘后） */
const KEEP_HEAD = 6 * 1024;
const KEEP_TAIL = 2 * 1024;

export interface SpillResult {
  text: string;
  /** 落盘后的绝对路径（未落盘时为 undefined） */
  path?: string;
  spilled: boolean;
}

export function spillOversizedToolOutput(opts: {
  conversationId: string;
  toolName: string;
  text: string;
}): SpillResult {
  const { conversationId, toolName, text } = opts;
  if (!conversationId || !text || text.length <= TOOL_SPILL_THRESHOLD_CHARS) {
    return { text, spilled: false };
  }
  try {
    const dir = ensureArtifactDirFor({ conversationId, category: 'intermediate' });
    const safeTool = String(toolName || 'tool').replace(/[^\w.-]+/g, '_').slice(0, 40) || 'tool';
    const fileName = `tool-output-${safeTool}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
    const abs = path.join(dir.dir, fileName);
    fs.writeFileSync(abs, text, 'utf-8');
    const marker = `\n\n…[工具输出已落盘：全文 ${text.length} 字符保存在 ${abs}`
      + `；需要完整内容请用 file_read 读取该路径（支持 offset/limit 分段）——这里只展示首尾节选]…\n\n`;
    return {
      text: text.slice(0, KEEP_HEAD) + marker + text.slice(-KEEP_TAIL),
      path: abs,
      spilled: true,
    };
  } catch {
    // 落盘失败不影响任务：调用方会走普通首尾截断
    return { text, spilled: false };
  }
}
