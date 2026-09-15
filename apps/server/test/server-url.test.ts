// 服务端资源地址解析 —— 回归测试
//
// 背景：API_BASE 约定「已含 /api」（Electron: http://127.0.0.1:3001/api，Web: /api），
// 而服务端返回的媒体地址是站点根相对路径且自身也带 /api（/api/generated/...、
// /api/plugin/computer-use/screenshots/...）。历史实现直接 API_BASE + src，
// 拼出 /api/api/... 导致生图产物 404（图裂）。这里锁死拼接规则，防回归。

import { describe, it, expect } from 'vitest';
import { serverOrigin, resolveServerUrl } from '@yan-zhi/shared';

const DESKTOP_BASE = 'http://127.0.0.1:3001/api';
const WEB_BASE = '/api';
const CONV = 'e824e62a-e446-449b-bad8-62e86c71f510';

describe('serverOrigin', () => {
  it('剥掉结尾的 /api，得到站点根', () => {
    expect(serverOrigin(DESKTOP_BASE)).toBe('http://127.0.0.1:3001');
    expect(serverOrigin('http://127.0.0.1:3001/api/')).toBe('http://127.0.0.1:3001');
  });

  it('Web 模式的相对 base 剥成空串（拼接后仍是站点根相对路径）', () => {
    expect(serverOrigin(WEB_BASE)).toBe('');
  });

  it('不含 /api 结尾的 base 原样保留（只剥一次，不动其它路径前缀）', () => {
    expect(serverOrigin('http://127.0.0.1:3001')).toBe('http://127.0.0.1:3001');
    expect(serverOrigin('http://host/api/v2')).toBe('http://host/api/v2');
  });
});

describe('resolveServerUrl', () => {
  it('生图产物地址不会拼出重复的 /api 前缀（本次 404 的根因）', () => {
    const path = `/api/generated/images/${CONV}/image-1789468048907.png`;
    const url = resolveServerUrl(DESKTOP_BASE, path);
    expect(url).toBe(`http://127.0.0.1:3001/api/generated/images/${CONV}/image-1789468048907.png`);
    expect(url).not.toContain('/api/api/');
  });

  it('临时截图地址（/api/plugin/...）同样不会重复 /api', () => {
    const url = resolveServerUrl(DESKTOP_BASE, '/api/plugin/computer-use/screenshots/shot-1.png');
    expect(url).toBe('http://127.0.0.1:3001/api/plugin/computer-use/screenshots/shot-1.png');
  });

  it('Web 模式保持相对地址（同源由站点自己解析）', () => {
    const url = resolveServerUrl(WEB_BASE, `/api/generated/images/${CONV}/a.png`);
    expect(url).toBe(`/api/generated/images/${CONV}/a.png`);
  });

  it('站点根下非 /api 前缀的资源也能正确补全', () => {
    expect(resolveServerUrl(DESKTOP_BASE, '/screenshots/a.png')).toBe('http://127.0.0.1:3001/screenshots/a.png');
  });

  it('完整地址与内联地址原样返回', () => {
    for (const u of [
      'https://cdn.example.com/a.png',
      'http://cdn.example.com/a.png',
      'data:image/png;base64,AAAA',
      'blob:http://127.0.0.1:3001/abc',
    ]) {
      expect(resolveServerUrl(DESKTOP_BASE, u)).toBe(u);
    }
  });

  it('裸文件名 / 文档相对路径保持原样，不擅自补站点根', () => {
    expect(resolveServerUrl(DESKTOP_BASE, 'image.png')).toBe('image.png');
    expect(resolveServerUrl(DESKTOP_BASE, './image.png')).toBe('./image.png');
  });

  it('空值与空白安全', () => {
    expect(resolveServerUrl(DESKTOP_BASE, '')).toBe('');
    expect(resolveServerUrl(DESKTOP_BASE, '   ')).toBe('');
    expect(resolveServerUrl('', '/api/generated/images/x/y.png')).toBe('/api/generated/images/x/y.png');
  });
});
