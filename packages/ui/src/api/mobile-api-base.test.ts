/**
 * 移动端远程后端地址（mobile_api_base）读写单测。
 *
 * 为什么值得测：这是移动端「连不上自建后端」的收尾入口 —— 写错一个地址，App 的
 * 全部请求跟着失联，而校验规则（http(s) 前缀 / 去尾斜杠 / 空串清除）都在
 * setMobileApiBase 一处，值得钉死。
 *
 * 读写 localStorage，包级 vitest 是 node 环境。
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getMobileApiBase, setMobileApiBase } from './client';

afterEach(() => localStorage.clear());

describe('mobile_api_base 读写', () => {
  it('默认未配置返回空串（走内嵌本地后端）', () => {
    expect(getMobileApiBase()).toBe('');
  });

  it('写入后可读回，且去掉尾斜杠（避免拼出 //api）', () => {
    expect(setMobileApiBase('https://srv.example.com/')).toBe('https://srv.example.com');
    expect(getMobileApiBase()).toBe('https://srv.example.com');
  });

  it('非 http(s) 前缀直接拒绝（写错地址 = 全部请求失联）', () => {
    expect(() => setMobileApiBase('srv.example.com')).toThrow(/http/);
    expect(() => setMobileApiBase('ftp://srv.example.com')).toThrow(/http/);
    expect(getMobileApiBase()).toBe('');
  });

  it('空串清除配置（回落内嵌本地后端）', () => {
    setMobileApiBase('https://srv.example.com');
    setMobileApiBase('');
    expect(getMobileApiBase()).toBe('');
    expect(localStorage.getItem('mobile_api_base')).toBeNull();
  });

  it('容忍首尾空白（手机输入法常带空格）', () => {
    expect(setMobileApiBase('  https://srv.example.com  ')).toBe('https://srv.example.com');
  });
});
