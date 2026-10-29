// 规则引擎单测（node --test，无第三方依赖）
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlan,
  classifyFile,
  normalizeCfg,
  globToRegExp,
  isKept,
  validateAiPlan,
  mergeAiPlan,
} from './rules.js';

const NOW = Date.parse('2026-10-28T10:00:00Z');
const DAY = 86400000;

function f(name, daysAgo = 30) {
  return { name, mtimeMs: NOW - daysAgo * DAY };
}

test('扩展名表：已知类型归组，未知/无扩展名不猜', () => {
  const cfg = normalizeCfg({ timeCluster: { enabled: false } });
  const rules = [];
  assert.deepEqual(classifyFile(f('a.docx'), cfg, rules, NOW), { group: '文档', by: 'ext' });
  assert.deepEqual(classifyFile(f('b.XLSX'), cfg, rules, NOW), { group: '表格', by: 'ext' });
  assert.deepEqual(classifyFile(f('c.exe'), cfg, rules, NOW), { group: '安装包', by: 'ext' });
  assert.equal(classifyFile(f('未命名文档 (3)'), cfg, rules, NOW), null);
  assert.equal(classifyFile(f('scan_0031'), cfg, rules, NOW), null);
});

test('用户规则按 priority 降序命中，覆盖扩展名表', () => {
  const cfg = normalizeCfg({
    timeCluster: { enabled: false },
    rules: [
      { match: '*.pdf', group: '合同', priority: 50 },
      { match: '*.pdf', group: '文档', priority: 10 },
      { ext: 'png', group: '截图素材', priority: 30 },
    ],
  });
  const rules = [...cfg.rules].sort((a, b) => b.priority - a.priority);
  assert.equal(classifyFile(f('x.pdf'), cfg, rules, NOW).group, '合同');
  assert.equal(classifyFile(f('y.png'), cfg, rules, NOW).group, '截图素材');
});

test('项目关键词优先于扩展名表', () => {
  const cfg = normalizeCfg({ timeCluster: { enabled: false }, projects: ['星图'] });
  assert.equal(classifyFile(f('星图-立项书.docx'), cfg, [], NOW).group, '星图');
});

test('时间簇：窗口内带「最近N天」，窗口外落回类名', () => {
  const cfg = normalizeCfg({ timeCluster: { enabled: true, windowDays: 7 } });
  assert.equal(classifyFile(f('新截图.png', 1), cfg, [], NOW).group, '图片·最近7天');
  assert.equal(classifyFile(f('旧截图.png', 30), cfg, [], NOW).group, '图片');
});

test('保留名单：快捷方式/隐藏/desktop.ini 不动', () => {
  const cfg = normalizeCfg({});
  assert.equal(isKept('Chrome.lnk', cfg), true);
  assert.equal(isKept('.gitignore', cfg), true);
  assert.equal(isKept('desktop.ini', cfg), true);
  assert.equal(isKept('报价单.xlsx', cfg), false);
});

test('glob 匹配：* 与 ? 生效且大小写不敏感', () => {
  assert.equal(globToRegExp('*.PDF').test('a.pdf'), true);
  assert.equal(globToRegExp('星图*').test('星图-评审.docx'), true);
  assert.equal(globToRegExp('a?c.txt').test('abc.txt'), true);
});

test('方案：分组/未归类/保留计数正确且成员排序稳定', () => {
  const cfg = { timeCluster: { enabled: false } };
  const files = [f('b.docx'), f('a.docx'), f('x.zip'), f('未命名'), f('Chrome.lnk')];
  const plan = buildPlan(files, cfg, NOW);
  const doc = plan.groups.find((g) => g.name === '文档');
  assert.deepEqual(doc.files, ['a.docx', 'b.docx']);
  assert.deepEqual(plan.unclassified, ['未命名']);
  assert.deepEqual(plan.stats, { total: 5, kept: 1, grouped: 3 });
});

test('幂等：同输入两次结果逐字段相等', () => {
  const files = [f('a.docx'), f('b.png', 2), f('c.rar'), f('未命名')];
  const cfg = { projects: ['星图'], timeCluster: { enabled: true, windowDays: 7 } };
  assert.deepEqual(buildPlan(files, cfg, NOW), buildPlan(files, cfg, NOW));
});

test('组数超限：最小组并入「其他」，不丢文件', () => {
  const cfg = { timeCluster: { enabled: false }, maxGroups: 2 };
  const files = [
    f('a.docx'), f('b.docx'), f('c.docx'),
    f('d.png'), f('e.png'),
    f('x.zip'),
  ];
  const plan = buildPlan(files, cfg, NOW);
  assert.equal(plan.groups.length, 2);
  const all = plan.groups.flatMap((g) => g.files);
  assert.equal(all.length, 6);
  assert.ok(plan.groups.some((g) => g.name === '其他'));
});

test('AI 校验：编造文件被拒', () => {
  const r = validateAiPlan({ groups: [{ name: '文档', files: ['不存在.docx'] }] }, ['a.docx'], {});
  assert.equal(r.ok, false);
  assert.match(r.error, /编造/);
});

test('AI 校验：重复归组被拒', () => {
  const r = validateAiPlan(
    { groups: [{ name: 'A', files: ['a'] }, { name: 'B', files: ['a'] }] },
    ['a'],
    {},
  );
  assert.equal(r.ok, false);
  assert.match(r.error, /重复/);
});

test('AI 校验：非法组名与超量被拒', () => {
  assert.equal(validateAiPlan({ groups: [{ name: 'a/b', files: ['x'] }] }, ['x'], {}).ok, false);
  assert.equal(
    validateAiPlan(
      { groups: [{ name: 'A', files: ['x'] }, { name: 'B', files: ['y'] }] },
      ['x', 'y'],
      { maxGroups: 1 },
    ).ok,
    false,
  );
});

test('AI 校验通过后可合并：同名组合并且未归类清空', () => {
  const cfg = { timeCluster: { enabled: false } };
  const base = buildPlan([f('a.docx'), f('未命名')], cfg, NOW);
  const v = validateAiPlan({ groups: [{ name: '文档', files: ['未命名'] }] }, base.unclassified, cfg);
  assert.equal(v.ok, true);
  const merged = mergeAiPlan(base, v.groups, cfg);
  const doc = merged.groups.find((g) => g.name === '文档');
  assert.deepEqual(doc.files, ['a.docx', '未命名']);
  assert.deepEqual(merged.unclassified, []);
});
