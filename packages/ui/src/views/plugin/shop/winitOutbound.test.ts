import { describe, it, expect } from 'vitest';
import {
  buildWinitOutboundOrder, validateWinitOutbound, type WinitOutboundForm,
} from './winitOutbound';

function form(overrides: Partial<WinitOutboundForm> = {}): WinitOutboundForm {
  return {
    warehouseCode: 'USWC',
    customerOrderNo: 'ORD-1',
    recipientName: '张三',
    recipientPhone: '13800000000',
    countryCode: 'us',
    province: 'CA',
    city: 'Los Angeles',
    address1: '123 Main St',
    address2: '',
    postalCode: '90001',
    productList: [{ productCode: 'SKU-1', qty: 2 }],
    approve: false,
    ...overrides,
  };
}

describe('万邑通出库单字段校验', () => {
  it('正常表单通过校验，并组装成 recipient + productList', () => {
    expect(validateWinitOutbound(form(), false)).toBe('');
    const order = buildWinitOutboundOrder(form());
    expect(order).toMatchObject({
      warehouseCode: 'USWC',
      customerOrderNo: 'ORD-1',
      recipient: { name: '张三', countryCode: 'US', city: 'Los Angeles', postalCode: '90001' },
      productList: [{ productCode: 'SKU-1', qty: 2 }],
    });
    // 空的可选字段不提交
    expect('address2' in order.recipient).toBe(false);
  });

  it('缺仓库/收件人/国家/地址/邮编都如实报第一条错误', () => {
    expect(validateWinitOutbound(form({ warehouseCode: '' }), false)).toContain('仓库编码');
    expect(validateWinitOutbound(form({ recipientName: '' }), false)).toContain('姓名');
    expect(validateWinitOutbound(form({ recipientPhone: '' }), false)).toContain('电话');
    expect(validateWinitOutbound(form({ countryCode: '' }), false)).toContain('国家');
    expect(validateWinitOutbound(form({ city: '' }), false)).toContain('城市');
    expect(validateWinitOutbound(form({ address1: '' }), false)).toContain('地址1');
    expect(validateWinitOutbound(form({ postalCode: '' }), false)).toContain('邮编');
  });

  it('商品明细：空行被忽略；没有有效行/数量非法时拒绝', () => {
    expect(validateWinitOutbound(form({ productList: [{ productCode: ' ', qty: 1 }] }), false)).toContain('至少填一条');
    expect(validateWinitOutbound(form({ productList: [{ productCode: 'SKU-1', qty: 0 }] }), false)).toContain('≥1 的整数');
    expect(validateWinitOutbound(form({ productList: [{ productCode: 'SKU-1', qty: 1.5 }] }), false)).toContain('≥1 的整数');
    const order = buildWinitOutboundOrder(form({
      productList: [{ productCode: 'SKU-1', qty: 1 }, { productCode: ' ', qty: 3 }],
    }));
    expect(order.productList).toEqual([{ productCode: 'SKU-1', qty: 1 }]);
  });

  it('生产店铺必须勾选批准', () => {
    expect(validateWinitOutbound(form({ approve: false }), true)).toContain('生产店铺');
    expect(validateWinitOutbound(form({ approve: true }), true)).toBe('');
  });
});
