// ontology-contract 集成测试（P1 融合方案，2026-10-03）
//
// 守住的语义（docs/数据查询-本体语义层与QueryContract融合-方案.md）：
//   1) 契约"菜单"只含**名字**（dimensions/measures/filters/selections），没有任何 SQL 片段外泄；
//   2) 契约模式下 intent.filters **只准按名引用**——自由 SQL 条件（"1=1"、注入载荷）必须被拒，
//      且报错里给出可用的过滤器名（模型能自纠）；
//   3) 草稿态本体对契约模式不可见（与智能体取数口径一致）；
//   4) 通过严格校验后的执行复用 queryOntologyByRef 同一编译/执行通道。
//
// ★ 执行成功路径不在本测试覆盖：sqlite 连接器依赖原生 better-sqlite3（测试环境已被
//   重编为 Electron ABI），CI 同理 —— 执行链路由 previewOntologyData 等人工路径验证。
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fsSync from 'node:fs';

process.env.DATA_DIR = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yz-ontology-contract-'));

const UID = 'u_contract_test';

let buildOntologyContract: typeof import('../src/services/ontology-contract.js').buildOntologyContract;
let runOntologyContract: typeof import('../src/services/ontology-contract.js').runOntologyContract;
let validateStrictIntent: typeof import('../src/services/ontology-contract.js').validateStrictIntent;

beforeAll(async () => {
  const { db } = await import('../src/db.js');
  const { ensureProjectDataSource, listDataSources } = await import('../src/services/datasource.js');
  const ontology = await import('../src/services/ontology.js');
  ({ buildOntologyContract, runOntologyContract, validateStrictIntent } = await import('../src/services/ontology-contract.js'));

  ensureProjectDataSource(UID);
  const ds = listDataSources(UID).find((d: { type: string }) => d.type === 'project')!;
  ontology.createOntology(UID, {
    datasourceId: ds.id,
    code: 'orders_contract_test',
    name: '契约测试订单本体',
    description: '订单语义层（测试）',
    sourceSql: 'SELECT region AS "region", amount AS "amount", created_at AS "created_at" FROM orders_test',
    dimensions: [{ name: 'region', expr: 'region', description: '下单区域' }],
    measures: [{ name: 'amount', expr: 'amount', description: '订单金额' }],
    filters: [{ name: '近30天', expr: "created_at >= DATE('now','-30 day')", description: '最近 30 天的订单' }],
    policies: ['仅统计已生效订单'],
  } as never);
  ontology.publishOntology(UID, ontology.listOntologies(UID).find((o: { code: string }) => o.code === 'orders_contract_test')!.id);
  void db;
});

describe('ontology-contract（本体 × QueryContract 融合 P1）', () => {
  it('契约菜单：只有名字与业务描述，没有任何 SQL 片段外泄', () => {
    const c = buildOntologyContract(UID, 'orders_contract_test');
    expect(c.ontology.code).toBe('orders_contract_test');
    expect(c.ontology.status).toBe('published');
    expect(c.dimensions.map((d) => d.name)).toContain('region');
    expect(c.measures.map((m) => m.name)).toContain('amount');
    expect(c.filters.map((f) => f.name)).toContain('近30天');
    expect(c.policies).toContain('仅统计已生效订单');
    // 反向：菜单里不能出现 SQL 关键字/表达式（sourceSql、filter expr 都不外泄）
    const menuText = JSON.stringify({ ...c, usage: undefined });
    expect(menuText).not.toMatch(/SELECT\s|DATE\(|created_at\s*>=/);
    expect(c.usage).toContain('按名引用');
  });

  it('严格校验：自由 SQL 条件被拒，报错给出可用过滤器名（模型可自纠）', () => {
    const info = {
      filters: [{ name: '近30天' }],
    } as never;
    expect(() => validateStrictIntent(info as any, { filters: ['1=1'] }))
      .toThrow(/只能按名引用/);
    expect(() => validateStrictIntent(info as any, { filters: ["'' OR '1'='1"] }))
      .toThrow(/近30天/); // 报错必须列出可用名 —— 模型据此自纠，而不是反复试错
    expect(() => validateStrictIntent(info as any, { filters: ['@近30天'] })).not.toThrow(); // @name 形式合法
  });

  it('契约模式执行：自由 SQL 过滤器在到达编译器/连接器之前被拦下', async () => {
    await expect(runOntologyContract(UID, {
      ontology: 'orders_contract_test',
      intent: { measures: [{ name: 'amount', agg: 'sum' }], filters: ["region = 'x' OR 1=1"] },
    })).rejects.toThrow(/只能按名引用/);
  });

  it('草稿态本体对契约模式不可见', async () => {
    const ontology = await import('../src/services/ontology.js');
    const ds = (await import('../src/services/datasource.js')).listDataSources(UID).find((d: { type: string }) => d.type === 'project')!;
    ontology.createOntology(UID, {
      datasourceId: ds.id,
      code: 'draft_contract_test',
      name: '草稿本体',
      sourceSql: 'SELECT 1 AS "x" FROM orders_test',
      dimensions: [{ name: 'x', expr: 'x' }],
    } as never);
    expect(() => buildOntologyContract(UID, 'draft_contract_test')).toThrow(/已发布本体不存在/);
  });
});
