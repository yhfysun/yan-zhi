/**
 * 移动端生图交付目录回归：
 * - 优先请求 b64_json，避免平台产物 CDN 在移动网络下二次下载超时；
 * - URL 回退下载给足超时；
 * - 成功落盘后现有 media artifact hook 负责登记 conversation_file。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('移动端生图写入交付目录', () => {
  it('移动端请求 b64_json，并在平台不支持时回退普通 URL 请求', () => {
    const src = read('src/mcp/api-tool-executor.ts');
    expect(src).toMatch(/process\.env\.MOBILE_MODE \? \['b64_json', ''\]/);
    expect(src).toMatch(/response_format: responseFormat/);
    expect(src).toMatch(/responseFormat && res\.status === 400/);
  });

  it('URL 回退下载使用移动端足够长的直连超时', () => {
    const src = read('src/mcp/api-tool-executor.ts');
    expect(src).toMatch(/downloadGeneratedImageBinary[\s\S]{0,500}directTimeoutMs: 60000/);
    expect(src).toMatch(/retryAttempts: 6/);
  });

  it('成功落盘返回 file 字段，媒体钩子登记为交付物', () => {
    const executor = read('src/mcp/api-tool-executor.ts');
    const hooks = read('src/services/artifact-hooks.ts');
    expect(executor).toMatch(/file:\s*localFile \|\| undefined/);
    expect(hooks).toContain("'api_image_generate'");
    expect(hooks).toMatch(/category:\s*'deliverable'/);
  });
});
