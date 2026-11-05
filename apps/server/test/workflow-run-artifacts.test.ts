import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.js';
import { persistRunArtifacts, listRunArtifacts } from '../src/workflow-runner.js';

const RUN_ID = 'wfr_artifacts_test';
const USER_ID = 'u_wf_artifacts_test';
const CONV_ID = 'conv_wf_artifacts_test';

function seedRun(): void {
  db.prepare(
    'INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run(USER_ID, USER_ID, '!test-no-login', 0);
  db.prepare(
    'INSERT OR IGNORE INTO conversation (id, user_id, title, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(CONV_ID, USER_ID, 'workflow artifacts test', 'default', 0, 0);
  db.prepare(
    `INSERT OR REPLACE INTO workflow_run
      (id, user_id, agent_id, agent_name, bundle_json, inputs_json, status, result_json, logs_json, error, created_at, updated_at)
     VALUES (?, ?, 'a_test', '测试工作流', '{}', '{}', 'completed', '{}', '[]', NULL, ?, ?)`,
  ).run(RUN_ID, USER_ID, Date.now(), Date.now());
}

afterEach(() => {
  db.prepare('DELETE FROM workflow_run_artifact WHERE run_id = ?').run(RUN_ID);
  db.prepare('DELETE FROM conversation_file WHERE conversation_id = ?').run(CONV_ID);
  db.prepare('DELETE FROM workflow_run WHERE id = ?').run(RUN_ID);
});

describe('工作流产物按 run 查询', () => {
  it('产物落盘后能按 runId 查回，并带路径/大小', () => {
    seedRun();
    const dir = path.join(process.env.TEMP || '.', 'yz-wf-artifacts-test');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'deliverable.txt');
    fs.writeFileSync(file, 'hello artifact', 'utf8');

    expect(persistRunArtifacts(RUN_ID, {
      files: [{ name: 'deliverable.txt', path: file }],
    }, USER_ID, '测试工作流', CONV_ID)).toBe(1);

    const list = listRunArtifacts(RUN_ID, USER_ID);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      runId: RUN_ID,
      name: 'deliverable.txt',
      path: file,
      category: 'deliverable',
    });
    expect(list[0].size).toBeGreaterThan(0);
  });

  it('路由必须提供 GET /runs/:id/artifacts', () => {
    const route = fs.readFileSync(
      path.resolve(__dirname, '../src/routes/workflow.ts'),
      'utf8',
    );
    expect(route).toContain("router.get('/runs/:id/artifacts'");
  });
});
