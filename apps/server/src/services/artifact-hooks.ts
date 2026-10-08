// 「产物自动登记 conversation_file」的两个后置钩子（P2-3 落地示例）。
//
// 为什么把它们从 `executeTool` 里搬出来：
//   主循环原先硬编码了 `if (toolName === 'file_write') …` 与 `if (MEDIA_TOOLS.has(toolName)) …`
//   两段副作用。每新增一个"会产出文件"的工具就要回去加一段 if，且**必然漏**
//   （本项目已多次踩到"某入口忘了登记 → 文件管理里看不到"）。
//   搬成钩子后：加新工具只需在这里多注册一个（或写个新的 hooks 文件），主循环不动。

import { db } from '../db.js';
import { promises as fsp } from 'node:fs';
import { guessMime } from '../utils/mime.js';
import { registerAfterToolHook, type ToolHookContext } from './tool-hooks.js';

/** 媒体生成/加工类工具（产物落会话交付目录，需登记）。与 llm-task-manager 的 MEDIA_TOOLS 同集。 */
const MEDIA_TOOLS = new Set([
  'api_image_generate', 'api_video_generate', 'api_video_status',
  'api_tts_speak', 'api_srt_generate', 'media_compose', 'media_edit',
  // 剪辑渲染产物（clip_project op=render）：漏登记的表现是"成片渲染成功但文件管理里看不到"
  'clip_project',
]);

/** 工具结果是否表示"失败"（失败就不登记，避免把错误信息当产物） */
function isFailure(result: string): boolean {
  return result.startsWith('工具执行失败') || result.startsWith('工具 ');
}

/** 插入一行 conversation_file 并广播（登记失败不抛：落盘已成功，这里只丢登记） */
function registerFile(ctx: ToolHookContext, opt: {
  fileName: string; filePath: string; category: 'deliverable' | 'intermediate'; size: number;
  emit: (e: { type: string; conversationId: string }) => void;
}): void {
  const cfId = 'cf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  db.prepare(
    'INSERT INTO conversation_file (id, conversation_id, user_id, space_id, name, path, category, mime_type, size, source, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    cfId, ctx.conversationId, ctx.userId, null,
    opt.fileName, opt.filePath, opt.category,
    guessMime(opt.fileName), opt.size, 'agent', ctx.assistantMsgId || null, Date.now(),
  );
  opt.emit({ type: 'file:registered', conversationId: ctx.conversationId });
}

/**
 * 注册内置的两个产物登记钩子。
 *
 * @param emit 事件广播函数（由主循环注入：任务级 emit，前端据此刷新文件面板）
 */
export function registerArtifactHooks(emit: (ctx: ToolHookContext, e: { type: string; conversationId: string }) => void): void {
  // ① file_write → 登记（用工具回传的**_meta.path**，不是模型传的 args.path）
  //    ★ 为什么必须用 _meta：落盘位置由服务端按会话目录决定，模型给的 path 已不参与定位。
  //      仍用 args.path 会把**并不存在的位置**写进 conversation_file → 文件管理点开 404。
  registerAfterToolHook('artifact:file_write', (toolName, _args, result, ctx) => {
    if (toolName !== 'file_write' || isFailure(result)) return;
    const m = ctx.meta as { path?: string; name?: string; category?: string; bytes?: number } | null;
    const filePath = String(m?.path || '');
    if (!filePath) return;
    const fileName = String(m?.name || '') || (filePath.split(/[/\\]/).pop() || filePath);
    registerFile(ctx, {
      fileName, filePath,
      category: m?.category === 'deliverable' ? 'deliverable' : 'intermediate',
      size: Number(m?.bytes) || 0,
      emit: (e) => emit(ctx, e),
    });
  });

  // ② 媒体产物 → 登记（产物由服务端直接写进会话交付目录；不登记则文件管理里永远看不到）
  registerAfterToolHook('artifact:media', async (toolName, _args, result, ctx) => {
    if (!MEDIA_TOOLS.has(toolName) || isFailure(result)) return;
    let media: { type?: string; file?: string; ok?: boolean } | null = null;
    try { media = JSON.parse(result); } catch { return; }
    const filePath = String(media?.file || '');
    // 产物落盘失败时工具只回远端 URL（没有本机文件），此时无处可登记
    if (media?.ok === false || !filePath) return;
    const sep = filePath.includes('/') ? '/' : '\\';
    const fileName = filePath.split(sep).pop() || filePath;
    // 产物就在本机，取真实字节数（文件管理里显示大小而不是 0）
    let size = 0;
    try { size = (await fsp.stat(filePath)).size; } catch { /* 取不到就留 0 */ }
    registerFile(ctx, {
      fileName, filePath,
      // 生图/生视频/语音默认归交付物（用户要的东西），与 mediaTarget 的落盘分类一致
      category: 'deliverable',
      size,
      emit: (e) => emit(ctx, e),
    });
  });
}