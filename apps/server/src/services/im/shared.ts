import { readFile } from 'node:fs/promises';
import type { ImFilePayload } from './types.js';

/** 读取待发送文件：优先本地路径，其次 base64 data。 */
export async function resolveFile(file: ImFilePayload): Promise<{ name: string; buffer: Buffer }> {
  const name = file.name || 'file';
  if (file.path) {
    const buffer = await readFile(file.path);
    return { name, buffer };
  }
  if (file.data) {
    const data = file.data.includes(',') ? file.data.slice(file.data.indexOf(',') + 1) : file.data;
    return { name, buffer: Buffer.from(data, 'base64') };
  }
  throw new Error('文件需要 path 或 base64 data');
}
