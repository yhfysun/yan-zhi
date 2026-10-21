/**
 * 落盘编码决策（纯函数，便于单测）。
 *
 * ★★★ 为什么单独抽出来（2026-10-21 用户实报）：「默认都 utf-8？gbk 也要支持啊，修改文件
 *   肯定要根据文件编码类型啊」。读侧早就会识别 GBK/UTF-16，但写侧写死 'utf8' ——
 *   模型改一次 GBK 的 .bat/.txt，整份文件被悄悄转成 UTF-8，cmd/记事本/老程序立刻乱码。
 *
 * 决策顺序（先权威后推断）：
 *   ① 本进程读过这个文件 → 用读到的编码（连带 BOM）+ 是否保留 CRLF
 *   ② 没读过但盘上已有 → 调用方传入盘上探测结果（同样优先）
 *   ③ 都没有（新文件）：Windows 批处理且含非 ASCII → GB18030（cmd 默认 ANSI 936）；
 *      显式 `chcp 65001` 的批处理保持 UTF-8；其余一律 UTF-8
 */
import type { TextEncoding } from '@yan-zhi/shared';

export interface WriteEncodingDecision {
  encoding: TextEncoding;
  /** 是否补回 BOM（原文件带 BOM 才补） */
  withBom: boolean;
  /** 是否把换行统一成 CRLF（Windows 批处理必须） */
  crlf: boolean;
  /** 是否把编码改成别的（供上层提示"已转换编码"） */
  converted: boolean;
}

export interface KnownEncoding {
  encoding: TextEncoding;
  bom?: TextEncoding;
}

/** Windows 批处理：cmd.exe 按系统 ANSI 代码页解析文件，UTF-8 中文会变乱码 */
export function isWindowsBatchPath(p: string, platform: string = process.platform): boolean {
  return platform === 'win32' && /\.(bat|cmd)$/i.test(p);
}

export function decideWriteEncoding(
  filePath: string,
  content: string,
  known: KnownEncoding | undefined,
  platform: string = process.platform,
): WriteEncodingDecision {
  const batch = isWindowsBatchPath(filePath, platform);

  // ③ 新文件：批处理按 cmd 的默认代码页写
  if (!known) {
    if (!batch) return { encoding: 'utf-8', withBom: false, crlf: false, converted: false };
    const declaresUtf8 = /chcp\s+65001/i.test(content);
    const hasNonAscii = /[^\x00-\x7f]/.test(content);
    if (declaresUtf8 || !hasNonAscii) {
      return { encoding: 'utf-8', withBom: false, crlf: true, converted: false };
    }
    return { encoding: 'gb18030', withBom: false, crlf: true, converted: false };
  }

  // ①② 沿用原编码
  let encoding = known.encoding;
  let converted = false;
  if (batch) {
    const declaresUtf8 = /chcp\s+65001/i.test(content);
    const hasNonAscii = /[^\x00-\x7f]/.test(content);
    // 原文件是 UTF-8 但没声明 chcp → cmd 会乱码：转成 GBK 让用户至少能用
    if (hasNonAscii && !declaresUtf8 && encoding === 'utf-8') {
      encoding = 'gb18030';
      converted = true;
    } else if (declaresUtf8 && encoding !== 'utf-8') {
      encoding = 'utf-8';
      converted = true;
    }
  }

  const sameEncoding = encoding === known.encoding;
  return {
    encoding,
    // 换编码了就不能再补原 BOM（BOM 的三字节属于旧编码）
    withBom: sameEncoding && Boolean(known.bom),
    crlf: batch,
    converted,
  };
}
