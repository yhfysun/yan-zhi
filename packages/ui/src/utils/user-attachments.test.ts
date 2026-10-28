/**
 * 用户消息附件块剥离测试（2026-10-28 用户实报「消息里整段露出一行文件路径」）
 *
 * 发送时会把上传文件 / @ 引用 / 网页引用以纯文本块拼到正文尾部（智能体要读路径），
 * 展示侧必须把它们切成卡片，正文只留用户真正打的字 —— 但**绝不能吞掉解析不出的内容**。
 */
import { describe, it, expect } from 'vitest';
import { splitUserContent } from './user-attachments';

const UPLOAD_ONE = '识别一下这个图片\n---\n已上传文件：\n'
  + '[文件: image.png (33.7 KB, image/png) 路径: C:\\Users\\u\\tasks\\c1\\uploads\\f_ab12_image.png]';

describe('用户消息附件块解析', () => {
  it('单个图片上传：正文只剩用户打的字，图片带路径与尺寸', () => {
    const r = splitUserContent(UPLOAD_ONE);
    expect(r.text).toBe('识别一下这个图片');
    expect(r.attachments).toEqual([{
      name: 'image.png',
      path: 'C:\\Users\\u\\tasks\\c1\\uploads\\f_ab12_image.png',
      mimeType: 'image/png',
      sizeText: '33.7 KB',
      kind: 'image',
    }]);
  });

  it('只发文件不打字：正文为空串（气泡不渲染空壳）', () => {
    const r = splitUserContent('\n---\n已上传文件：\n[文件: a.pdf (1.2 MB, application/pdf) 路径: C:\\u\\a.pdf]');
    expect(r.text).toBe('');
    expect(r.attachments).toHaveLength(1);
    expect(r.attachments[0].kind).toBe('file');
  });

  it('多个文件按上传顺序排列', () => {
    const r = splitUserContent('看这两个\n---\n已上传文件：\n'
      + '[文件: a.png (1 KB, image/png) 路径: C:\\u\\a.png]'
      + '\n[文件: b.txt (2 B, text/plain) 路径: C:\\u\\b.txt]');
    expect(r.attachments.map((a) => a.name)).toEqual(['a.png', 'b.txt']);
  });

  it('文件名自带括号也能正确切出路径', () => {
    const r = splitUserContent('看图\n---\n已上传文件：\n[文件: 截图(1).png (9.0 KB, image/png) 路径: C:\\u\\截图(1).png]');
    expect(r.attachments[0].name).toBe('截图(1).png');
    expect(r.attachments[0].path).toBe('C:\\u\\截图(1).png');
  });

  it('落盘失败的文件标记为失败，不给出可点的路径', () => {
    const r = splitUserContent('看看\n---\n已上传文件：\n[文件: x.bin (3 B, ) 保存失败: EACCES]');
    expect(r.attachments[0]).toMatchObject({ name: 'x.bin', error: 'EACCES', kind: 'file' });
    expect(r.attachments[0].path).toBeUndefined();
  });

  it('★ 统一引用块 <references>：文件 + 网页各归各位，预览正文不干扰解析', () => {
    const raw = '看下这些\n\n<references>\n'
      + '<reference type="file" name="a &quot;quoted&quot;.ts" path="C:\\w\\a.ts" mime="ts" size="1.2 KB">\n'
      + 'const x = 1 < 2 && 3 > 2;\n</reference>\n'
      + '<reference type="page" name="示例页" url="https://example.com/a"/>\n'
      + '</references>';
    const r = splitUserContent(raw);
    expect(r.text).toBe('看下这些');
    expect(r.attachments).toEqual([{
      name: 'a "quoted".ts', path: 'C:\\w\\a.ts', mimeType: 'ts', sizeText: '1.2 KB', kind: 'file',
    }]);
    expect(r.links).toEqual([{ name: '示例页', url: 'https://example.com/a' }]);
  });

  it('引用块里的图片按图片处理（走缩略图分支）', () => {
    const r = splitUserContent('看图\n\n<references>\n'
      + '<reference type="file" name="shot.png" path="C:\\u\\shot.png" mime="png"/>\n</references>');
    expect(r.attachments[0].kind).toBe('image');
  });

  it('引用块（`[引用文件]` 行式）：切成卡片，预览正文里的竖线不误判', () => {
    const raw = '总结下\n\n[引用文件]\n'
      + '[引用] main.ts | C:\\w\\main.ts | ts | 1.2 KB\n  预览：\n  const a = 1 | 2;\n'
      + '[引用] b.md | C:\\w\\b.md | md';
    const r = splitUserContent(raw);
    expect(r.text).toBe('总结下');
    expect(r.attachments.map((a) => a.name)).toEqual(['main.ts', 'b.md']);
    expect(r.attachments[0]).toMatchObject({ path: 'C:\\w\\main.ts', sizeText: '1.2 KB', kind: 'file' });
    expect(r.attachments[1].sizeText).toBeUndefined();
  });

  it('@ 引用的工作区文件（[Files] JSON）切成卡片，正文不留 JSON', () => {
    const r = splitUserContent('读下这个\n\n[Files]\n'
      + JSON.stringify([{ fileName: 'main.ts', path: 'C:\\w\\main.ts', type: 'ts', size: 10, preview: 'x' }], null, 2));
    expect(r.text).toBe('读下这个');
    expect(r.attachments[0]).toMatchObject({ name: 'main.ts', path: 'C:\\w\\main.ts', kind: 'file' });
  });

  it('目录引用识别为 folder', () => {
    const r = splitUserContent('探索一下\n\n[Files]\n'
      + JSON.stringify([{ fileName: 'src/', path: 'C:\\w\\src', type: 'folder', size: 0 }]));
    expect(r.attachments[0].kind).toBe('folder');
  });

  it('网页引用切成链接，不占正文', () => {
    const r = splitUserContent('看这个网页\n\n[网页引用]\n- 示例页 https://example.com/a');
    expect(r.text).toBe('看这个网页');
    expect(r.links).toEqual([{ name: '示例页', url: 'https://example.com/a' }]);
  });

  it('上传 + 引用 + 网页三段同时存在：各归各位', () => {
    const r = splitUserContent('总结下\n---\n已上传文件：\n[文件: a.png (1 KB, image/png) 路径: C:\\u\\a.png]'
      + '\n\n[Files]\n' + JSON.stringify([{ fileName: 'b.md', path: 'C:\\w\\b.md', type: 'md' }])
      + '\n\n[网页引用]\n- 标题 https://example.com');
    expect(r.text).toBe('总结下');
    expect(r.attachments.map((a) => a.name)).toEqual(['a.png', 'b.md']);
    expect(r.links).toHaveLength(1);
  });

  it('★ 用户自己手打了同样的分隔符：解析不出就原样保留，不吞内容', () => {
    const raw = '我写了一段\n---\n已上传文件：\n这不是真的文件行';
    const r = splitUserContent(raw);
    expect(r.attachments).toHaveLength(0);
    expect(r.text).toBe(raw);
  });

  it('没有附件标记的普通消息原样返回', () => {
    const r = splitUserContent('你好呀');
    expect(r).toEqual({ text: '你好呀', attachments: [], links: [], annotations: [] });
  });

  it('空内容不炸', () => {
    expect(splitUserContent('')).toEqual({ text: '', attachments: [], links: [], annotations: [] });
    expect(splitUserContent(undefined).text).toBe('');
  });
});
