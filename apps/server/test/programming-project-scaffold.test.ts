import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dataDir } from '../src/db';
import { scaffoldProgrammingProject } from '../src/services/programming-project-scaffold';

const created: string[] = [];

afterEach(() => {
  for (const target of created.splice(0)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe('programming project scaffold', () => {
  it('creates a safe, idempotent project workspace with phase plans and runbooks', () => {
    const result = scaffoldProgrammingProject('teamflow-saas');
    created.push(result.path);

    expect(result.created).toBe(true);
    expect(path.resolve(result.path).startsWith(path.resolve(dataDir, 'learning-projects'))).toBe(true);
    expect(result.files).toContain('README.md');
    expect(result.files).toContain('docs/02-api-contract.md');
    expect(result.files).toContain('docs/03-data-model.md');
    expect(result.files).toContain('docs/05-runbook.md');
    expect(result.files.filter((file) => file.startsWith('phases/'))).toHaveLength(10);
    expect(fs.readFileSync(path.join(result.path, 'README.md'), 'utf8')).toContain('TeamFlow');
    expect(fs.readFileSync(path.join(result.path, 'docs/05-runbook.md'), 'utf8')).toContain('回滚');
    expect(fs.readFileSync(path.join(result.path, '.env.example'), 'utf8')).toContain('POSTGRES_PASSWORD=');

    const again = scaffoldProgrammingProject('teamflow-saas');
    expect(again.created).toBe(false);
    expect(again.path).toBe(result.path);
  });

  it('rejects unknown project ids instead of creating arbitrary directories', () => {
    expect(() => scaffoldProgrammingProject('../escape')).toThrow('未知项目');
  });
});
