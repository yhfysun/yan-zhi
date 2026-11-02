// 命名与分布启发式（P2.5.2）：给自动生成的本体补 displayName / role / 候选枚举初值。
//
// ★ 只做"初值"：用户可以随时改；不覆盖已有值（displayName/role 已存在时保留）。
// ★ role 只用于模型与 UI 的理解，不参与编译 —— 编译器仍按 dimensions/measures 列表工作。
import { ENUM_MAX, isLikelyNumericType, isLikelyTimeType, type ColumnProfile } from './ontology-profile.js';

export type FieldRole = 'identifier' | 'foreign_key' | 'time' | 'measure' | 'enum' | 'dimension';

const TERMS: Record<string, string> = {
  id: '编号', user: '用户', customer: '客户', product: '商品', order: '订单', shop: '店铺',
  amount: '金额', price: '价格', qty: '数量', quantity: '数量', count: '计数', total: '总额',
  name: '名称', title: '标题', status: '状态', type: '类型', category: '分类', region: '区域',
  province: '省份', city: '城市', phone: '手机号', mobile: '手机号', email: '邮箱', address: '地址',
  created: '创建', updated: '更新', deleted: '删除', at: '时间', date: '日期', time: '时间',
  code: '编码', remark: '备注', description: '描述', pay: '支付', balance: '余额', sku: 'SKU',
  stock: '库存', score: '评分', level: '等级', tag: '标签', url: '链接', path: '路径',
  file: '文件', size: '大小', duration: '时长', start: '开始', end: '结束', is: '是否',
  has: '有无', parent: '上级', source: '来源', channel: '渠道', brand: '品牌', unit: '单位',
};

/** 列名 → 业务显示名（user_id → 用户编号；created_at → 创建时间；未知词保留原名） */
export function humanizeColumn(raw: string): string {
  const name = String(raw || '').trim();
  if (!name) return '';
  if (name.toLowerCase() === 'id') return TERMS.id;
  const isFk = /_id$/i.test(name);
  const base = isFk ? name.slice(0, -3) : name;
  const tokens = base.split(/[_\-\s]+/).filter(Boolean);
  const mapped = tokens.map((t) => TERMS[t.toLowerCase()] || '').filter(Boolean);
  if (!mapped.length) return name;
  return isFk ? `${mapped.join('')}编号` : mapped.join('');
}

export interface RoleInput {
  name: string;
  type?: string;
  pk?: boolean;
  profile?: Pick<ColumnProfile, 'distinctCount' | 'values'> | null;
}

/** 字段角色推断（保守）：主键 → 标识；_id → 外键；时间类型 → 时间；低基数 → 枚举；数值 → 度量；其余维度 */
export function inferFieldRole(input: RoleInput): FieldRole {
  const name = String(input.name || '');
  if (input.pk) return 'identifier';
  if (/_id$/i.test(name)) return 'foreign_key';
  const type = String(input.type || '');
  if (isLikelyTimeType(type)) return 'time';
  const distinct = input.profile?.distinctCount;
  const hasValues = !!input.profile?.values?.length;
  if (isLikelyNumericType(type)) {
    return distinct !== undefined && distinct > 0 && distinct <= 10 && hasValues ? 'enum' : 'measure';
  }
  if (distinct !== undefined && distinct > 0 && distinct <= ENUM_MAX && hasValues) return 'enum';
  return 'dimension';
}

export interface FieldLike {
  name: string;
  displayName?: string;
  role?: string;
  enums?: string[];
}

export interface SpecLike<TD extends FieldLike, TT extends FieldLike, TM extends FieldLike> {
  dimensions: TD[];
  timeDimensions: TT[];
  measures: TM[];
}

/**
 * 给生成结果补 displayName / role / 候选枚举（不改已有值，返回新数组）。
 * 枚举只挂到"维度里的低基数字段"；度量与时间维度保持各自角色。
 */
export function applyFieldHeuristics<TD extends FieldLike, TT extends FieldLike, TM extends FieldLike>(
  gen: SpecLike<TD, TT, TM>,
  profile: { columns: ColumnProfile[] },
): SpecLike<TD, TT, TM> {
  const byColumn = new Map(profile.columns.map((c) => [c.column, c]));

  const decorate = (item: TD, role: string, withEnums: boolean): TD => {
    const p = byColumn.get(item.name);
    const next: TD = {
      ...item,
      displayName: item.displayName || humanizeColumn(item.name),
      role: item.role || role,
    };
    if (withEnums && (next.role === 'enum' || next.role === 'foreign_key') && p?.values?.length) {
      next.enums = p.values.slice(0, ENUM_MAX);
    }
    return next;
  };

  return {
    dimensions: gen.dimensions.map((d) => {
      const p = byColumn.get(d.name);
      const role = inferFieldRole({ name: d.name, type: p?.type, profile: p });
      return decorate(d, role, true);
    }),
    timeDimensions: gen.timeDimensions.map((t) => decorate(t as unknown as TD, 'time', false) as unknown as TT),
    measures: gen.measures.map((m) => decorate(m as unknown as TD, 'measure', false) as unknown as TM),
  };
}
