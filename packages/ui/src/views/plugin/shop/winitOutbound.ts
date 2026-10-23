/**
 * 万邑通出库单表单：校验与组装（2026-10-23）。
 * ★ 抽成纯函数是为了可单测：组件只负责绑定与提示，字段规则有测试兜底。
 */
export interface WinitProductRow {
  productCode: string;
  qty: number;
}

export interface WinitOutboundForm {
  warehouseCode: string;
  customerOrderNo: string;
  recipientName: string;
  recipientPhone: string;
  countryCode: string;
  province: string;
  city: string;
  address1: string;
  address2: string;
  postalCode: string;
  productList: WinitProductRow[];
  approve: boolean;
}

export interface WinitOutboundOrder {
  warehouseCode: string;
  customerOrderNo?: string;
  recipient: {
    name: string;
    phone: string;
    countryCode: string;
    province?: string;
    city: string;
    address1: string;
    address2?: string;
    postalCode: string;
  };
  productList: Array<{ productCode: string; qty: number }>;
}

/** 返回第一条校验错误；全部通过返回空串 */
export function validateWinitOutbound(form: WinitOutboundForm, isProduction: boolean): string {
  if (!form.warehouseCode.trim()) return '仓库编码必填';
  if (!form.recipientName.trim()) return '收件人姓名必填';
  if (!form.recipientPhone.trim()) return '收件人电话必填';
  if (!form.countryCode.trim()) return '国家必填（如 US）';
  if (!form.city.trim()) return '城市必填';
  if (!form.address1.trim()) return '地址1必填';
  if (!form.postalCode.trim()) return '邮编必填';
  const rows = form.productList.filter((r) => r.productCode.trim());
  if (!rows.length) return '至少填一条商品明细（productCode）';
  if (rows.some((r) => !Number.isInteger(Number(r.qty)) || Number(r.qty) < 1)) return '商品数量必须是 ≥1 的整数';
  if (isProduction && !form.approve) return '生产店铺需要勾选批准';
  return '';
}

/** 组装提交给 winit.order.ship 的 payload.order */
export function buildWinitOutboundOrder(form: WinitOutboundForm): WinitOutboundOrder {
  return {
    warehouseCode: form.warehouseCode.trim(),
    ...(form.customerOrderNo.trim() ? { customerOrderNo: form.customerOrderNo.trim() } : {}),
    recipient: {
      name: form.recipientName.trim(),
      phone: form.recipientPhone.trim(),
      countryCode: form.countryCode.trim().toUpperCase(),
      ...(form.province.trim() ? { province: form.province.trim() } : {}),
      city: form.city.trim(),
      address1: form.address1.trim(),
      ...(form.address2.trim() ? { address2: form.address2.trim() } : {}),
      postalCode: form.postalCode.trim(),
    },
    productList: form.productList
      .filter((r) => r.productCode.trim())
      .map((r) => ({ productCode: r.productCode.trim(), qty: Number(r.qty) })),
  };
}
