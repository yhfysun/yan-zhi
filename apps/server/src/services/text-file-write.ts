/**
 * 文本落盘统一出口（同步版）—— **按目标文件现有编码写回**。
 *
 * ★★★ 为什么单独一个模块（2026-10-21 用户实报）：「默认都 utf-8？gbk 也要支持啊，
 *   修改文件肯定要根据文件编码类型啊」。读取侧早已识别 GBK/UTF-16，但写入侧散落在
 *   路由里写死 `'utf-8'`（`/workspace/file` 保存、`/changes/:id/apply`、
 *   `apply-hunks`、以及两处批量回退）—— 用户把 GBK 的 .bat/.txt 交给模型改一次，
 *   或者点一下「撤销」，整份文件就被悄悄转成 UTF-8，cmd/记事本/老程序立刻乱码。
 *
 * 语义：
 *   - 目标文件存在 → 按它**当前**的编码 + BOM 写回（GBK 还是 GBK）；
 *   - Windows 批处理（.bat/.cmd）→ CRLF + GB18030（未声明 chcp 65001 时）；
 *   - 新文件 → UTF-8。
 * 决策逻辑只有一份（`decideWriteEncoding`），本模块只负责"读现编码 → 编码 → 落盘"。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeTextBytes, encodeTextBytes, type TextEncoding } from '@yan-zhi/shared';
import { decideWriteEncoding, type KnownEncoding } from './text-write-encoding.js';

/** 探测盘上现有文件的编码（文件不存在/读不了 → undefined） */
export function detectFileEncoding(filePath: string): KnownEncoding | undefined {
  try {
    const buf = readFileSync(filePath);
    const decoded = decodeTextBytes(new Uint8Array(buf));
    return { encoding: decoded.encoding, bom: decoded.bom };
  } catch {
    return undefined;
  }
}

/**
 * 按目标文件现有编码写入文本，返回**实际使用的编码**（供调用方提示"已转码"）。
 * 目录必须已存在（与调用点原有语义一致，调用方自己 mkdir）。
 */
export function writeTextFilePreservingEncoding(
  filePath: string,
  content: string,
  known?: KnownEncoding,
): TextEncoding {
  const current = known ?? detectFileEncoding(filePath);
  const plan = decideWriteEncoding(filePath, content, current);
  const body = plan.crlf ? content.replace(/\r?\n/g, '\r\n') : content;
  writeFileSync(filePath, Buffer.from(encodeTextBytes(body, plan.encoding, { withBom: plan.withBom })));
  return plan.encoding;
}
