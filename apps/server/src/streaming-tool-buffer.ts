/**
 * 流式文本模式工具调用缓冲器。
 *
 * 背景：不支持原生 function calling 的模型（如本地 qwen）走"文本模式"，
 * 在正文里输出 [TOOL_CALL]{...}[/TOOL_CALL] 或 <tool_call>...</tool_call>。
 * 旧实现把工具块当普通 content 逐字流式下发前端 → 前端把不完整块裸显示（一跳一跳）。
 *
 * 本缓冲器在服务端把增量 content 切成"可显示文本"和"工具块"两条流：
 *  - 可显示文本 → 正常 emit chunk，前端只看到干净正文
 *  - 工具块闭合后 → 以原始文本形式交给调用方（llm-task-manager.parseTextToolCalls）解析
 * 支持 [TOOL_CALL]{}[/TOOL_CALL]（可带 ()/[] 包裹）与 <tool_call><function=NAME>...</function></tool_call>，
 * 兼容 U+E0BC 变音符号污染（模型把变音符号当 [ 或 < 用，归一化后两种标记都要能匹配）。
 * 跨 chunk 边界安全（滑动窗口累积）。
 */

// 起点：`[TOOL_CALL]` 或 `<tool_call>`（归一化后 [ 与 < 可互换，故都匹配）
const START_RE = /[\[<](?:TOOL_CALL|tool_call)[\]>]/gi;
// 终点：`[/TOOL_CALL]` 或 `</TOOL_CALL]` 或 `</tool_call>`（含变音污染；必须带斜杠，避免把起点 `[TOOL_CALL]` 误判为终点）
const END_RE = /[\[<]\/(?:TOOL_CALL|tool_call)[\]>]/gi;

/** 起点标记最长长度（'/TOOL_CALL]'=11，'<tool_call>'=11，留余量保证跨 chunk 不漏检） */
const KEEP = 14;

export class StreamingToolCallBuffer {
  private textBuf = '';
  private toolBuf = '';
  private inTool = false;

  /** 流结束 / 块闭合时产生的完整工具块原始文本（含起点与终点标记，交调用方解析）。 */
  onToolBlock: ((raw: string) => void) | null = null;

  /** 送入一段增量 content。返回本次可显示的纯文本（工具块部分被剥离）。 */
  push(delta: string): string {
    // U+E0BC 归一化：模型偶发用变音符号代替 [ 或 <（私有区），统一归到 [ 便于后续解析
    const norm = delta.replace(/[\uE000-\uF8FF]/g, '[');
    if (!norm) return '';
    let visible = '';

    if (!this.inTool) {
      this.textBuf += norm;
      const startInfo = this.findStart(this.textBuf);
      if (startInfo) {
        visible = this.textBuf.slice(0, startInfo.index);
        this.toolBuf = this.textBuf.slice(startInfo.index);
        this.textBuf = '';
        this.inTool = true;
        return visible;
      }
      const safeLen = Math.max(0, this.textBuf.length - KEEP);
      if (safeLen > 0) {
        visible = this.textBuf.slice(0, safeLen);
        this.textBuf = this.textBuf.slice(safeLen);
      }
      return visible;
    }

    // 工具态
    this.toolBuf += norm;
    const endIdx = this.findEndIndex(this.toolBuf);
    if (endIdx >= 0) {
      const raw = this.toolBuf.slice(0, endIdx);
      const after = this.toolBuf.slice(endIdx);
      this.toolBuf = '';
      this.inTool = false;
      if (this.onToolBlock) this.onToolBlock(raw);
      if (after) visible += this.push(after);
    }
    return visible;
  }

  /** 流结束：把未闭合的残留作为文本吐出来（不吞内容）。 */
  finish(): string {
    let visible = this.textBuf;
    this.textBuf = '';
    if (this.inTool) {
      visible += this.toolBuf;
      this.toolBuf = '';
      this.inTool = false;
    }
    return visible;
  }

  private findStart(buf: string): { index: number } | null {
    START_RE.lastIndex = 0;
    const m = START_RE.exec(buf);
    if (!m) return null;
    return { index: m.index };
  }

  private findEndIndex(buf: string): number {
    END_RE.lastIndex = 0;
    const m = END_RE.exec(buf);
    if (!m) return -1;
    return m.index + m[0].length;
  }
}
