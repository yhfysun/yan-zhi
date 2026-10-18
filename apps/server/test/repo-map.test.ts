// repo-map service unit tests (services/repo-map.ts, dev-mode project).
// Pure service, no db dependency. Fixture files are created in a temp dir.
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildRepoMapSync,
  resetRepoMapCache,
  repoMapPromptSection,
  DEV_REPO_MAP_AGENT_IDS,
} from '../src/services/repo-map.js';
import { loadTsCompiler } from '@yan-zhi/core';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-map-test-'));

beforeAll(async () => {
  await loadTsCompiler();
  fs.writeFileSync(
    path.join(ROOT, 'package.json'),
    JSON.stringify({ name: 'fixture', scripts: { build: 'tsc', test: 'vitest' } }),
  );
  fs.mkdirSync(path.join(ROOT, 'src', 'nested'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, 'src', 'a.ts'),
    'export function alphaFn() {}\nexport class Beta {}\n',
  );
  fs.writeFileSync(
    path.join(ROOT, 'src', 'nested', 'b.ts'),
    'export interface Delta {}\n',
  );
  fs.mkdirSync(path.join(ROOT, 'node_modules', 'junk'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, 'node_modules', 'junk', 'index.js'),
    'export function junkFn() {}\n',
  );
  fs.mkdirSync(path.join(ROOT, '.git'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, '.git', 'config.js'),
    'export function gitFn() {}\n',
  );
});

afterAll(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
});

describe('buildRepoMapSync', () => {
  it('extracts top-level symbols with line numbers', () => {
    resetRepoMapCache();
    const r = buildRepoMapSync(ROOT, { fresh: true });
    expect(r.text).toContain('alphaFn:1');
    expect(r.text).toContain('Beta:2');
    expect(r.text).toContain('Delta:1');
    expect(r.fileCount).toBe(2);
  });

  it('skips node_modules, hidden dirs and non-code files', () => {
    resetRepoMapCache();
    const r = buildRepoMapSync(ROOT, { fresh: true });
    expect(r.text).not.toContain('junkFn');
    expect(r.text).not.toContain('gitFn');
    expect(r.text).not.toContain('node_modules/');
  });

  it('truncates to maxChars budget', () => {
    resetRepoMapCache();
    const r = buildRepoMapSync(ROOT, { fresh: true, maxChars: 60 });
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThan(300);
  });

  it('reads package.json scripts into the map', () => {
    resetRepoMapCache();
    const r = buildRepoMapSync(ROOT, { fresh: true });
    expect(r.text).toContain('build=tsc');
  });
});

describe('repoMapPromptSection', () => {
  it('wraps the map with header and usage notes', () => {
    resetRepoMapCache();
    const s = repoMapPromptSection(ROOT);
    expect(s).toContain('## ');
    expect(s).toContain('alphaFn:1');
  });

  it('returns empty string for empty workspace', () => {
    expect(repoMapPromptSection('')).toBe('');
  });

  it('DEV set covers architect, explorer and implementers', () => {
    expect(DEV_REPO_MAP_AGENT_IDS.has('a_builtin_code_agent')).toBe(true);
    expect(DEV_REPO_MAP_AGENT_IDS.has('a_builtin_code_explorer')).toBe(true);
    expect(DEV_REPO_MAP_AGENT_IDS.has('a_builtin_backend_dev')).toBe(true);
    expect(DEV_REPO_MAP_AGENT_IDS.has('a_builtin_frontend_dev')).toBe(true);
    expect(DEV_REPO_MAP_AGENT_IDS.has('a_builtin_java_agent')).toBe(true);
    expect(DEV_REPO_MAP_AGENT_IDS.has('a_builtin_page_agent')).toBe(false);
  });
});
