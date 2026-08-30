import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';

export class FileWriteTool implements BuiltInTool {
  name = 'file_write';
  description = 'Write content to a file at the specified path. Creates parent directories if needed. Overwrites existing files.';

  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The absolute or relative path to write the file to.',
      },
      content: {
        type: 'string',
        description: 'The text content to write to the file.',
      },
      category: {
        type: 'string',
        enum: ['intermediate', 'deliverable'],
        description: '文件分类，必须正确选择：deliverable=最终交付给用户的成果（报告、最终文档、生成的源代码、导出数据、图片成品等用户会直接使用或保存的文件）；intermediate=过程性中间产物（调试输出、临时草稿、中间计算结果、将被后续步骤覆盖或删除的临时文件）。凡用户最终想要的结果文件必须显式传 deliverable，不要省略该参数，也不要把交付物误标为 intermediate。',
      },
    },
    required: ['path', 'content'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const { fs } = getPlatformAdapter();
    const path = args.path as string;
    const content = args.content as string;
    const category = (args.category as 'intermediate' | 'deliverable') || 'intermediate';

    if (!path) {
      return { content: [{ type: 'text', text: 'Error: path is required' }], isError: true };
    }
    if (content === undefined || content === null) {
      return { content: [{ type: 'text', text: 'Error: content is required' }], isError: true };
    }

    try {
      const i = path.lastIndexOf('/');
      if (i > 0) {
        const parentDir = path.slice(0, i);
        const parentExists = await fs.exists(parentDir);
        if (!parentExists) {
          await fs.mkdir(parentDir);
        }
      }
      await fs.writeFile(path, content);
      const len = content.length;
      // 在结果中携带元数据，供 chat.ts 执行循环记录到 conversation_file
      return {
        content: [{ type: 'text', text: `Successfully wrote ${len} bytes to ${path}` }],
        _meta: { path, category, bytes: len },
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error writing file: ${msg}` }], isError: true };
    }
  }
}
