import { describe, expect, it } from 'vitest';
import { splitUserContent } from './user-attachments';

const BLOCK = `浏览器批注（1 条，页面：http://localhost:5173/pricing）

[1] button「卡片 CTA · Growth」
    组件：packages/ui/src/components/PricingCard.vue
    选择器：#page > section:nth-of-type(2) > button.cta
    评论：窄屏下溢出卡片，保持单行。

已存档: C:\\shots\\annotated-1.png`;

describe('splitUserContent · 浏览器批注', () => {
  it('纯批注消息：正文被清空，批注结构化，截图路径单独取出', () => {
    const r = splitUserContent(BLOCK);
    expect(r.text).toBe('');
    expect(r.annotations).toHaveLength(1);
    expect(r.annotations[0]).toMatchObject({
      index: 1,
      kind: 'element',
      label: 'button「卡片 CTA · Growth」',
      componentFile: 'packages/ui/src/components/PricingCard.vue',
      selector: '#page > section:nth-of-type(2) > button.cta',
      comment: '窄屏下溢出卡片，保持单行。',
    });
    expect(r.annotationShot).toBe('C:\\shots\\annotated-1.png');
  });

  it('用户打了字又带批注：正文保留，批注块从正文里剥掉', () => {
    const r = splitUserContent(`按这个改一下\n\n${BLOCK}`);
    expect(r.text).toBe('按这个改一下');
    expect(r.annotations).toHaveLength(1);
    // 机器可读的字段不该再出现在用户可见正文里
    expect(r.text).not.toContain('已存档');
    expect(r.text).not.toContain('选择器：');
  });

  it('区域框选识别为 region', () => {
    const r = splitUserContent(`浏览器批注（1 条）

[1] 区域框选 566×111 @ (62, 367)
    评论：tooltip 挡住柱子`);
    expect(r.annotations[0].kind).toBe('region');
    expect(r.annotations[0].comment).toBe('tooltip 挡住柱子');
    expect(r.annotations[0].componentFile).toBeUndefined();
  });

  it('无组件路径（生产构建 / 非 Vue 页面）时不产生空字段', () => {
    const r = splitUserContent(`浏览器批注（1 条）

[1] a「tjkuku」
    选择器：#s-top-left > a.mnav
    评论：改一下`);
    expect(r.annotations[0].componentFile).toBeUndefined();
    expect(r.annotations[0].selector).toBe('#s-top-left > a.mnav');
  });

  it('多条批注按序号全部解析', () => {
    const r = splitUserContent(`浏览器批注（2 条）

[1] button「A」
    评论：第一条

[2] 区域框选 10×10 @ (1, 2)
    评论：第二条`);
    expect(r.annotations.map((a) => a.index)).toEqual([1, 2]);
    expect(r.annotations[1].comment).toBe('第二条');
  });

  it('普通消息不受影响', () => {
    const r = splitUserContent('就是一句普通的话');
    expect(r.text).toBe('就是一句普通的话');
    expect(r.annotations).toEqual([]);
    expect(r.annotationShot).toBeUndefined();
  });

  it('不是批注块的「已存档」行不会被当成批注', () => {
    const r = splitUserContent('已存档: C:\\x.png');
    expect(r.annotations).toEqual([]);
    expect(r.text).toBe('已存档: C:\\x.png');
  });
});
