/**
 * api_artifact_save —— URL / base64 数据流写入交付目录。
 *
 * 用户诉求：给模型一个 URL（或一段数据流）和文件名，就能直接把成品保存到会话
 * 交付目录；不需要再让模型临时调 python_exec，也不能依赖模型自己补 path/category。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(SERVER_SRC, p), 'utf8');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const EXECUTOR = stripComments(read('src/mcp/api-tool-executor.ts'));
const FILE_DEFS = stripComments(readRepo('packages/core/src/tool/builtin/api-tools/file.ts'));
const HOOKS = stripComments(read('src/services/artifact-hooks.ts'));

describe('api_artifact_save · 工具契约', () => {
  it('同时接受 url / data，并要求 file_name；文档说明二选一', () => {
    expect(FILE_DEFS).toMatch(/name: 'api_artifact_save'/);
    expect(FILE_DEFS).toMatch(/url:/);
    expect(FILE_DEFS).toMatch(/data:/);
    expect(FILE_DEFS).toMatch(/file_name:/);
    expect(FILE_DEFS).toMatch(/url.*data.*只能传一个|二选一/s);
    expect(FILE_DEFS).toMatch(/required: \['file_name'\]/);
  });

  it('url 支持 http/https，data 支持 base64 / data URL', () => {
    expect(FILE_DEFS).toMatch(/http\/https/);
    expect(FILE_DEFS).toMatch(/base64/);
    expect(FILE_DEFS).toMatch(/data URL/i);
  });

  it('工具已进入执行白名单与 switch 分发', () => {
    expect(EXECUTOR).toMatch(/'api_artifact_save'/);
    expect(EXECUTOR).toMatch(/case 'api_artifact_save':/);
    expect(EXECUTOR).toMatch(/return await artifactSave\(args, conversationId\)/);
  });

  it('产物进入媒体登记钩子，并返回本地 file + 预览 url', () => {
    expect(HOOKS).toMatch(/'api_artifact_save'/);
    expect(EXECUTOR).toMatch(/async function artifactSave\(/);
    expect(EXECUTOR).toMatch(/type: kind/);
    expect(EXECUTOR).toMatch(/file,/);
    expect(EXECUTOR).toMatch(/url: `\$\{target\.urlBase\}/);
  });
});

describe('api_artifact_save · 安全与落盘', () => {
  it('拒绝私网 / localhost 的 URL，避免把 SSRF 暴露给模型工具', () => {
    expect(EXECUTOR).toMatch(/function assertSafeArtifactUrl/);
    expect(EXECUTOR).toMatch(/localhost|127\\\.0\\\.0\\\.1|private|内网/i);
    expect(EXECUTOR).toMatch(/dns\/promises/);
  });

  it('文件大小有上限，且文件名经过安全清洗', () => {
    expect(EXECUTOR).toMatch(/ARTIFACT_SAVE_MAX_BYTES/);
    expect(EXECUTOR).toMatch(/safeDownloadName\(/);
    expect(EXECUTOR).toMatch(/超过上限/);
  });

  it('data 允许裸 base64 与 data URL，并解码为二进制写入', () => {
    expect(EXECUTOR).toContain('data:([^;,]+);base64,');
    expect(EXECUTOR).toMatch(/Buffer\.from\([^)]*,\s*'base64'\)/);
  });
});
