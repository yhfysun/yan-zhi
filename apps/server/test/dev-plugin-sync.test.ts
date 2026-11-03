import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  findStaleBuiltinPlugins,
  hashPluginSource,
  isPluginArtifactStale,
  writePluginFingerprint,
} = require('../../../scripts/lib/dev-plugin-sync.cjs');

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-plugin-sync-'));
  tempDirs.push(dir);
  return dir;
}

function writeFile(file: string, content: string, mtimeMs: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  fs.utimesSync(file, new Date(mtimeMs), new Date(mtimeMs));
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('dev 内置插件产物新鲜度', () => {
  it('源码比产物新时判定为陈旧', () => {
    const root = tempDir();
    const source = path.join(root, 'apps/server/src/plugins/shop-ops.ts');
    const artifact = path.join(root, 'apps/server/plugins/builtin/shop-ops/backend/index.js');
    writeFile(source, 'source', 2_000);
    writeFile(artifact, 'artifact', 1_000);

    expect(isPluginArtifactStale({
      root,
      id: 'shop-ops',
      backendEntry: 'apps/server/src/plugins/shop-ops.ts',
      artifactDir: path.dirname(path.dirname(artifact)),
    })).toBe(true);
  });

  it('产物比源码新时判定为最新', () => {
    const root = tempDir();
    const source = path.join(root, 'apps/server/src/plugins/shop-ops.ts');
    const artifact = path.join(root, 'apps/server/plugins/builtin/shop-ops/backend/index.js');
    writeFile(source, 'source', 1_000);
    writeFile(artifact, 'artifact', 2_000);

    expect(isPluginArtifactStale({
      root,
      id: 'shop-ops',
      backendEntry: 'apps/server/src/plugins/shop-ops.ts',
      artifactDir: path.dirname(path.dirname(artifact)),
    })).toBe(false);
  });

  it('有源码哈希标记时按内容判断，不受 mtime 影响', () => {
    const root = tempDir();
    const source = path.join(root, 'apps/server/src/plugins/shop-ops.ts');
    const artifactDir = path.join(root, 'apps/server/plugins/builtin/shop-ops');
    const artifact = path.join(artifactDir, 'backend/index.js');
    writeFile(source, 'source-v1', 3_000);
    writeFile(artifact, 'artifact', 4_000);
    writePluginFingerprint({
      root,
      id: 'shop-ops',
      backendEntry: 'apps/server/src/plugins/shop-ops.ts',
      artifactDir,
    });

    expect(isPluginArtifactStale({
      root,
      id: 'shop-ops',
      backendEntry: 'apps/server/src/plugins/shop-ops.ts',
      artifactDir,
    })).toBe(false);

    writeFile(source, 'source-v2', 1_000);
    expect(isPluginArtifactStale({
      root,
      id: 'shop-ops',
      backendEntry: 'apps/server/src/plugins/shop-ops.ts',
      artifactDir,
    })).toBe(true);
  });

  it('哈希覆盖插件目录里的所有源文件', () => {
    const root = tempDir();
    const entry = path.join(root, 'apps/server/src/plugins/shop-ops.ts');
    const seed = path.join(root, 'apps/server/src/plugins/shop-ops/seed.ts');
    writeFile(entry, 'entry', 1_000);
    writeFile(seed, 'seed-v1', 1_000);
    const before = hashPluginSource({ root, id: 'shop-ops', backendEntry: 'apps/server/src/plugins/shop-ops.ts' });

    writeFile(seed, 'seed-v2', 1_000);
    const after = hashPluginSource({ root, id: 'shop-ops', backendEntry: 'apps/server/src/plugins/shop-ops.ts' });
    expect(after).not.toBe(before);
  });

  it('只返回实际存在且落后的插件包，跳过未构建或未登记源码的包', () => {
    const root = tempDir();
    const builtin = path.join(root, 'apps/server/plugins/builtin');
    writeFile(path.join(builtin, 'shop-ops/manifest.json'), '{}', 1_000);
    writeFile(path.join(builtin, 'shop-ops/backend/index.js'), 'old', 1_000);
    writeFile(path.join(root, 'apps/server/src/plugins/shop-ops.ts'), 'new', 2_000);
    writeFile(path.join(builtin, 'no-source/manifest.json'), '{}', 1_000);
    writeFile(path.join(builtin, 'no-source/backend/index.js'), 'old', 1_000);

    expect(findStaleBuiltinPlugins({
      root,
      builtinDir: builtin,
      catalog: {
        plugins: {
          'shop-ops': { backendEntry: 'apps/server/src/plugins/shop-ops.ts' },
          'no-source': {},
        },
      },
    })).toEqual(['shop-ops']);
  });
});
