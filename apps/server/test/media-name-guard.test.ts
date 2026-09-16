/**
 * 媒体静态路由的文件名守卫单测。
 *
 * 背景（真实回归）：早先白名单写死 `^[A-Za-z0-9][A-Za-z0-9._-]*$`，只认 ASCII ——
 * 但 file_write 产出的交付物常是「手机推荐报告.png」这类中文名，一律被 404 拒掉，
 * 表现为「交付卡片的缩略图裂开」。放宽为「只禁穿越字符」后必须确认：
 *   1. 中文 / 空格 / 括号等合法名放行
 *   2. 目录穿越（../、/、\、空字节、控制字符）全部拦下 —— 放宽不能放宽到能读任意文件
 *
 * 这里用与 index.ts 同构的实现做等价验证（index.ts 里的函数未导出，逻辑逐字对齐）。
 */
import { describe, it, expect } from 'vitest';

/** 与 apps/server/src/index.ts 的 isSafeMediaName 逐字对齐 */
function isSafeMediaName(name: string): boolean {
  if (!name || name.length > 180) return false;
  if (name === '.' || name === '..') return false;
  if (name.includes('..')) return false;
  if (/[/\\]/.test(name)) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return false;
  if (name.trim() !== name) return false;
  return true;
}

describe('媒体文件名守卫 · 放行合法名', () => {
  it('英文与数字为主的产物名（生图工具默认命名）', () => {
    expect(isSafeMediaName('image-1789491621693.png')).toBe(true);
    expect(isSafeMediaName('video-1789491621693.mp4')).toBe(true);
  });

  it('中文文件名放行（这正是此前 404 图裂的场景）', () => {
    expect(isSafeMediaName('手机推荐报告.png')).toBe(true);
    expect(isSafeMediaName('2024年中秋礼品与手机选购指南.png')).toBe(true);
  });

  it('空格 / 括号 / 连字符 / 下划线等常见字符放行', () => {
    expect(isSafeMediaName('a b.png')).toBe(true);
    expect(isSafeMediaName('报告(最终版).png')).toBe(true);
    expect(isSafeMediaName('2026-09-16_星空森林插画.webp')).toBe(true);
  });
});

describe('媒体文件名守卫 · 拦截穿越与异常', () => {
  it('上级目录穿越', () => {
    expect(isSafeMediaName('../etc/passwd')).toBe(false);
    expect(isSafeMediaName('..\\..\\win.ini')).toBe(false);
    expect(isSafeMediaName('..')).toBe(false);
    expect(isSafeMediaName('a..b.png')).toBe(false);
  });

  it('路径分隔符（正斜杠与 Windows 反斜杠都要拦）', () => {
    expect(isSafeMediaName('a/b.png')).toBe(false);
    expect(isSafeMediaName('a\\b.png')).toBe(false);
  });

  it('空值 / 目录自身 / 超长', () => {
    expect(isSafeMediaName('')).toBe(false);
    expect(isSafeMediaName('.')).toBe(false);
    expect(isSafeMediaName('a'.repeat(181))).toBe(false);
  });

  it('空字节与控制字符', () => {
    expect(isSafeMediaName('a\u0000b.png')).toBe(false);
    expect(isSafeMediaName('a\nb.png')).toBe(false);
    expect(isSafeMediaName('a\tb.png')).toBe(false);
  });

  it('前后空白（易造成定位歧义）', () => {
    expect(isSafeMediaName('  x.png')).toBe(false);
    expect(isSafeMediaName('x.png ')).toBe(false);
  });
});