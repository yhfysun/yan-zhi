import { describe, expect, it } from 'vitest';
import type { BrowserAnnotation } from '@yan-zhi/shared';
import { formatAnnotationBlock } from './browser-annotation-message';

function anno(over: Partial<BrowserAnnotation> = {}): BrowserAnnotation {
  return {
    id: 'a1',
    type: 'element',
    label: 'button「立即升级」',
    selector: 'div.pricing > div:nth-of-type(2) > button.cta',
    componentFile: 'packages/ui/src/components/PricingCard.vue',
    componentName: 'PricingCard',
    rect: { x: 10, y: 20, w: 120, h: 32 },
    comment: '窄屏下溢出卡片',
    pageUrl: 'http://localhost:5173/pricing',
    createdAt: 1,
    ...over,
  };
}

describe('formatAnnotationBlock', () => {
  it('没有批注时返回空串（不产生空消息块）', () => {
    expect(formatAnnotationBlock([])).toBe('');
  });

  it('元素批注带组件路径与选择器', () => {
    const text = formatAnnotationBlock([anno()]);
    expect(text).toContain('浏览器批注（1 条');
    expect(text).toContain('http://localhost:5173/pricing');
    expect(text).toContain('[1] button「立即升级」');
    expect(text).toContain('组件：packages/ui/src/components/PricingCard.vue');
    expect(text).toContain('选择器：div.pricing > div:nth-of-type(2) > button.cta');
    expect(text).toContain('评论：窄屏下溢出卡片');
  });

  it('生产构建拿不到组件路径时整行省略，不留空字段', () => {
    const text = formatAnnotationBlock([anno({ componentFile: undefined, componentName: undefined })]);
    expect(text).not.toContain('组件：');
    // 选择器仍在，模型照样能定位
    expect(text).toContain('选择器：');
  });

  it('区域框选按尺寸与坐标描述（拿不到 DOM 目标）', () => {
    const text = formatAnnotationBlock([anno({
      type: 'region',
      label: '区域框选',
      selector: undefined,
      componentFile: undefined,
      rect: { x: 62, y: 367, w: 566, h: 111 },
    })]);
    expect(text).toContain('[1] 区域框选 566×111 @ (62, 367)');
    expect(text).not.toContain('选择器：');
  });

  it('有截图时以「已存档:」前缀写入 —— 服务端靠这个锚点挂多模态输入，措辞不能改', () => {
    const text = formatAnnotationBlock([anno()], 'C:\\shots\\annotated-1.png');
    expect(text).toContain('已存档: C:\\shots\\annotated-1.png');
    // 与 llm-task-manager 的 IMAGE_ARCHIVE_MARK_RE 对齐：紧跟空格 + 以图片扩展名结尾
    expect(/已存档:\s*([^\n）)]+\.(?:png|jpe?g|webp|gif|bmp))/i.test(text)).toBe(true);
  });

  it('没有截图时不写「已存档」行（避免指向不存在文件）', () => {
    expect(formatAnnotationBlock([anno()])).not.toContain('已存档');
  });

  it('多条批注按序号排列，且只出现一次页头', () => {
    const text = formatAnnotationBlock([anno({ id: 'a1' }), anno({ id: 'a2', comment: '第二条' })]);
    expect(text.match(/浏览器批注（2 条/g)?.length).toBe(1);
    expect(text).toContain('[1]');
    expect(text).toContain('[2]');
    expect(text.indexOf('[1]')).toBeLessThan(text.indexOf('[2]'));
  });
});
