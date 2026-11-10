import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const requireFromHere = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('Node 24 runtime dependency compatibility', () => {
  it('workspace 必须把 wasm-feature-detect 固定在无 import.source 的版本', () => {
    const workspace = fs.readFileSync(path.join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
    expect(workspace).toMatch(/wasm-feature-detect:\s*1\.8\.0/);
  });

  it('tesseract.js 的 wasm-feature-detect 依赖必须能被当前 Node 加载', () => {
    const tesseractEntry = requireFromHere.resolve('tesseract.js');
    const requireFromTesseract = createRequire(tesseractEntry);
    const wasmDetectPath = requireFromTesseract.resolve('wasm-feature-detect');

    const result = spawnSync(
      process.execPath,
      ['-e', `require(${JSON.stringify(wasmDetectPath)})`],
      { encoding: 'utf8' },
    );

    expect(
      result.status,
      `wasm-feature-detect 在当前 Node ${process.version} 下加载失败：\n${result.stderr || result.stdout}`,
    ).toBe(0);
  });
});
