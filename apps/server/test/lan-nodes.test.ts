// 局域网节点发现 · 纯函数单测（不发真实网络请求）。
//
// 为什么值得测：这是移动端「一键连局域网节点」的识别底座 —— isPrivateIp 是扫描的
// 护栏（放公网进来就成对第三方网段的端口探测了），looksLikeYzNode 决定同端口上的
// 其他应用会不会被误认成言智节点。判断错一档，功能就「能连上但连的不是言智」。
import { describe, it, expect } from 'vitest';
import { isPrivateIp, subnetOf, looksLikeYzNode } from '../src/services/lan-nodes.js';

describe('isPrivateIp · 扫描目标护栏（只允许 RFC1918 私网）', () => {
  it.each([
    ['192.168.1.10', true],
    ['10.0.0.1', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.32.0.1', false],
    ['8.8.8.8', false],
    ['127.0.0.1', false],
    ['169.254.1.1', false],
    ['not-an-ip', false],
    ['', false],
  ])('%s → %s', (ip, expected) => {
    expect(isPrivateIp(ip as string)).toBe(expected);
  });
});

describe('subnetOf · /24 网段提取', () => {
  it('常规 IP → 前三段 .0/24', () => {
    expect(subnetOf('192.168.1.23')).toBe('192.168.1.0/24');
  });

  it('非 IPv4 返回 null（交给上层跳过）', () => {
    expect(subnetOf('fe80::1')).toBeNull();
    expect(subnetOf('')).toBeNull();
  });
});

describe('looksLikeYzNode · 言智节点特征识别', () => {
  it('built index.html（title 言智）命中', () => {
    expect(looksLikeYzNode('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8" /><title>言智</title>')).toBe(true);
  });

  it('产物路径含 yan-zhi 标识也命中（title 被改过时兜底）', () => {
    expect(looksLikeYzNode('<html><head><title>App</title></head><body><script src="/assets/yan-zhi-index-a1b2.js"></script>')).toBe(true);
  });

  it('其他应用 / 空响应不命中', () => {
    expect(looksLikeYzNode('<!DOCTYPE html><html><head><title>Router Admin</title></head></html>')).toBe(false);
    expect(looksLikeYzNode('')).toBe(false);
  });
});
