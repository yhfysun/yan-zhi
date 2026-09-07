// file_edit 内置工具 — 文件局部精准编辑（old_string → new_string 替换，避免整文件重写）
// 语义对齐主流编码助手的 replace_in_file：old_string 必须在文件中唯一命中（或 replace_all），
// 未命中/多命中时返回引导性错误，让模型补充上下文或改用 file_grep 定位。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';

export class FileEditTool implements BuiltInTool {
  name = 'file_edit';
  description = '对已有文件做局部替换编辑：把 old_string 精确替换为 new_string。old_string 必须与文件内容逐字符一致（含缩进/换行）且在文件中唯一；多处出现时需扩大上下文使其唯一，或传 replace_all=true 全部替换。适合修改大文件/配置，比 file_write 整文件覆盖更安全省 token。新建文件请用 file_write。';

  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The file to edit (absolute or relative path). Must already exist — use file_write to create new files.',
      },
      old_string: {
        type: 'string',
        description: 'The exact text to replace. Must match the file content character-for-character (including whitespace/indentation) and be unique in the file unless replace_all is true.',
      },
      new_string: {
        type: 'string',
        description: 'The replacement text. Use empty string to delete the matched text.',
      },
      replace_all: {
        type: 'boolean',
        description: 'Replace ALL occurrences of old_string. Defaults to false (requires unique match).',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const { fs } = getPlatformAdapter();
    const path = args.path as string;
    const oldString = args.old_string as string | undefined;
    const newString = args.new_string as string | undefined;
    const replaceAll = Boolean(args.replace_all);

    if (!path) {
      return { content: [{ type: 'text', text: 'Error: path is required' }], isError: true };
    }
    if (oldString === undefined || oldString === null || oldString === '') {
      return {
        content: [{ type: 'text', text: 'Error: old_string is required and must be non-empty. To create a new file, use file_write instead.' }],
        isError: true,
      };
    }
    if (newString === undefined || newString === null) {
      return { content: [{ type: 'text', text: 'Error: new_string is required (use empty string to delete text).' }], isError: true };
    }

    const exists = await fs.exists(path);
    if (!exists) {
      return {
        content: [{ type: 'text', text: `Error: file not found: ${path}. To create a new file, use file_write.` }],
        isError: true,
      };
    }

    let content: string;
    try {
      content = await fs.readFile(path);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error reading file: ${msg}` }], isError: true };
    }

    // 统一换行比较/替换（都在 LF 规范空间进行），写回时还原原换行风格
    const isCrlf = content.includes('\r\n');
    const fileNorm = content.replace(/\r\n/g, '\n');
    const oldNorm = oldString.replace(/\r\n/g, '\n');
    const newNorm = newString.replace(/\r\n/g, '\n');

    // 计数（支持 \n 对 \r\n 文件的容错匹配）
    let count = 0;
    let idx = fileNorm.indexOf(oldNorm);
    while (idx !== -1) {
      count++;
      idx = fileNorm.indexOf(oldNorm, idx + oldNorm.length);
    }

    if (count === 0) {
      const preview = fileNorm.slice(0, 300);
      return {
        content: [{
          type: 'text',
          text: `Error: old_string not found in ${path}. It must match the file content exactly (including whitespace/indentation). Re-read the file (or use file_grep to locate the region) and copy the text verbatim.\nFile head preview:\n${preview}`,
        }],
        isError: true,
      };
    }
    if (count > 1 && !replaceAll) {
      return {
        content: [{
          type: 'text',
          text: `Error: old_string matches ${count} locations in ${path}. Include more surrounding lines to make it unique, or pass replace_all=true to replace all ${count} occurrences.`,
        }],
        isError: true,
      };
    }

    const replacedNorm = replaceAll ? fileNorm.split(oldNorm).join(newNorm) : fileNorm.replace(oldNorm, newNorm);
    const next = isCrlf ? replacedNorm.replace(/\n/g, '\r\n') : replacedNorm;

    try {
      await fs.writeFile(path, next);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error writing file: ${msg}` }], isError: true };
    }

    const replacedCount = replaceAll ? count : 1;
    return {
      content: [{
        type: 'text',
        text: `Successfully edited ${path}: replaced ${replacedCount} occurrence${replacedCount > 1 ? 's' : ''} (${oldNorm.length} chars → ${newNorm.length} chars). New file size: ${next.length} chars.`,
      }],
      _meta: { path, category: 'intermediate', bytes: next.length, edits: replacedCount },
    };
  }
}
