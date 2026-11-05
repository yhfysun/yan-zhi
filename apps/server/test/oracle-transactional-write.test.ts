import { describe, expect, it, vi } from 'vitest';
import {
  OracleLikeConnector,
  type DataSourceRow,
  type OracleLikeConn,
} from '../src/services/connector.js';

function row(): DataSourceRow {
  return {
    id: 'ds_oracle_tx',
    user_id: 'u_oracle_tx',
    name: 'Oracle TX',
    type: 'oracle',
    host: '127.0.0.1',
    port: 1521,
    database: 'ORCL',
    service_name: 'ORCLPDB1',
    file_path: null,
    username: 'demo',
    password_enc: null,
    options_json: '{}',
    readonly: 0,
    allow_write: 1,
    builtin: 0,
    status: 'ok',
    last_error: null,
    last_test_at: null,
    schema_synced_at: null,
    table_count: null,
    created_at: 1,
    updated_at: 1,
  };
}

function fakeConnection(): OracleLikeConn & {
  execute: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  rollback: ReturnType<typeof vi.fn>;
} {
  return {
    execute: vi.fn(async () => ({ rowsAffected: 2 })),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
  };
}

describe('Oracle/DM transactional write adapter', () => {
  it('预检执行后 rollback，确认执行后 commit，并返回影响行数', async () => {
    const connection = fakeConnection();
    const connector = new OracleLikeConnector('oracle', row(), async () => connection);

    await expect(connector.executeWrite('UPDATE account SET status = 1 WHERE id = 2', [], {
      rollback: true,
    })).resolves.toMatchObject({ affectedRows: 2 });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();

    await expect(connector.executeWrite('UPDATE account SET status = 1 WHERE id = 2', [], {
      rollback: false,
    })).resolves.toMatchObject({ affectedRows: 2 });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.execute).toHaveBeenLastCalledWith(
      'UPDATE account SET status = 1 WHERE id = 2',
      [],
      { autoCommit: false },
    );
  });

  it('参数绑定或驱动异常时拒绝并 rollback', async () => {
    const connection = fakeConnection();
    connection.execute.mockRejectedValueOnce(new Error('ORA-00933'));
    const connector = new OracleLikeConnector('dm', row(), async () => connection);

    await expect(connector.executeWrite('UPDATE t SET x = ? WHERE id = 1', ['x'], {
      rollback: true,
    })).rejects.toThrow(/绑定参数/);

    await expect(connector.executeWrite('UPDATE t SET x = 1 WHERE id = 1', [], {
      rollback: true,
    })).rejects.toThrow('ORA-00933');
    expect(connection.rollback).toHaveBeenCalled();
  });
});
