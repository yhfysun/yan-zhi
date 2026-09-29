// 工具调用参数的「截断感知与诊断文案」——纯函数，零依赖，便于直接测试。
//
// ★★★ 背景（2026-09-29 排障）：
//   主循环此前**从不读取** `finish_reason`（实测 `grep -c finishReason` = 0），
//   于是两种截然不同的失败被一视同仁：
//     · 模型压根没生成参数 → `arguments` 是**干净的 `{}`**；
//     · 生成到一半被输出上限切断 → `finish_reason === 'length'`，
//       `arguments` 是**半截 JSON**（例如 `{"code":"import os, subprocess\nF=r"C:/...`）。
//   两者都被丢进同一个「疑似 max_tokens / 模型能力」的提示里 —— 归因是错的，
//   而且**截断时提示"重试同样的调用"必然再次截断**，属于无效建议。
//
//   本模块只负责「判断 + 生成给模型看的文案」，不碰执行流程，
//   让调用侧（apps/server）保持薄：拿到 finish_reason 后调这里取文案即可。

import type { DeltaToolCall } from '@yan-zhi/shared';

/** 参数是否「空」：空串、纯空白、或空的 `{}`（注意：半截 JSON **不算**空 —— 那是截断的信号） */
export function isEmptyToolArguments(raw: unknown): boolean {
  const s = typeof raw === 'string' ? raw : raw == null ? '' : JSON.stringify(raw);
  return s.trim() === '' || s.trim() === '{}';
}

/**
 * 参数是否是「被截断的半截 JSON」。
 *
 * 判据刻意保守：必须**看起来像 JSON 对象**（以 `{` 开头）且**解析失败**。
 * 不这么收紧的话，模型输出纯文本参数（老模型的文本模式）会被误判成截断。
 */
export function looksTruncatedJson(raw: unknown): boolean {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s.startsWith('{')) return false;
  try {
    JSON.parse(s);
    return false;
  } catch {
    return true;
  }
}

/** 截断诊断的输入 */
export interface TruncationContext {
  toolName: string;
  /** 上游返回的 finish_reason（末次非空值） */
  finishReason?: string;
  /** 缺失的必填参数名 */
  missingArgs?: string[];
  /** 已收到的参数片段（可能只是半截 JSON） */
  rawArguments?: unknown;
}

/** 截断诊断结果 */
export interface TruncatedArgsAdvice {
  /** 是否判定为「被输出上限截断」（而不是模型没生成） */
  truncated: boolean;
  /** 给模型看的完整提示 */
  message: string;
}

/**
 * 判定 + 生成「因输出上限被截断」的诊断提示。
 *
 * ★ 关键设计：**不给"重试"建议，而是给"换表达方式"建议**。
 *   同样的参数长度重试必然再截断一次 —— 实测 `python_exec` 的 `code` 字段
 *   正是长参数的重灾区。真正有效的出路是：
 *   把长内容**落盘**（file_write）再用短参数执行文件（python_exec 跑文件），
 *   即把"一次巨大的参数"拆成"两次短参数"。
 */
export function adviceForTruncatedArgs(ctx: TruncationContext): TruncatedArgsAdvice {
  const raw = ctx.rawArguments;
  const truncated =
    ctx.finishReason === 'length' ||
    looksTruncatedJson(raw) ||
    (ctx.finishReason == null && looksTruncatedJson(raw));

  if (!truncated) {
    return {
      truncated: false,
      message: buildGenericMissingArgsMessage(ctx),
    };
  }

  const preview = argumentPreview(raw);
  const missing = ctx.missingArgs?.length ? `（缺少：${ctx.missingArgs.join('、')}）` : '';
  return {
    truncated: true,
    message:
      `工具 ${ctx.toolName} 未执行：本次输出**被长度上限截断**（finish_reason=length），参数不完整${missing}。\n` +
      (preview ? `已收到的参数片段：\n\`\`\`\n${preview}\n\`\`\`\n` : '') +
      `★ 不要重试同样长度的调用 —— 会再次被截断。请改成分两步：\n` +
      `1. 用 file_write 把完整内容（长代码 / 长文本）写入一个文件；\n` +
      `2. 再用 ${ctx.toolName} 传一个**很短的参数**去引用/执行那个文件（例如只传文件路径）。\n` +
      `若内容确实很短，也可把参数压缩到最小后重试一次。`,
  };
}

/** 给模型看的参数片段预览（限长，避免把半截 JSON 原样灌回上下文） */
export function argumentPreview(raw: unknown, maxLen = 400): string {
  const s = typeof raw === 'string' ? raw : raw == null ? '' : JSON.stringify(raw);
  const t = s.trim();
  if (!t) return '';
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

/** 非截断场景的缺失参数提示（不含"截断"臆测，避免再次误导排查方向） */
function buildGenericMissingArgsMessage(ctx: TruncationContext): string {
  const missing = ctx.missingArgs?.length ? ctx.missingArgs.join('、') : '必填参数';
  return (
    `工具 ${ctx.toolName} 未执行：arguments 缺少必填参数（${missing}）。\n` +
    `已收到的参数片段：${argumentPreview(ctx.rawArguments) || '(空)'}\n` +
    `请重新调用并提供完整、合法的 JSON 参数；若参数较长，先用 file_write 落盘再传文件路径。`
  );
}

/** 从一批工具调用里取出「首个空参调用」的参数片段，供诊断文案使用 */
export function firstEmptyArgsCall(
  toolCalls: Array<DeltaToolCall | { function?: { name?: string; arguments?: string }; toolName?: string; arguments?: unknown }>,
): { name: string; raw: unknown } | null {
  for (const tc of toolCalls || []) {
    const anyTc = tc as any;
    const raw = anyTc.function?.arguments ?? anyTc.arguments;
    if (isEmptyToolArguments(raw) || looksTruncatedJson(raw)) {
      return { name: anyTc.function?.name || anyTc.toolName || '', raw };
    }
  }
  return null;
}