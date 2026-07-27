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
    },
    required: ['path', 'content'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const { fs } = getPlatformAdapter();
    const path = args.path as string;
    const content = args.content as string;

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
      return { content: [{ type: 'text', text: `Successfully wrote ${len} bytes to ${path}` }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error writing file: ${msg}` }], isError: true };
    }
  }
}
