/**
 * scrcpy 帧转换守门（真内嵌镜像的解码前置）。
 *
 * 这些函数的输出直接喂给 WebCodecs：切错一个字节就会表现为「黑屏但不报错」，
 * 所以用真机抓到的包头/起始码形态钉死。
 */
import { describe, it, expect } from 'vitest';
import {
  splitAnnexB,
  annexBToAvcc,
  extractSpsPps,
  avcCodecString,
  buildAvcDescription,
  parsePacketHeader,
} from './scrcpyFrames';

const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

describe('splitAnnexB / annexBToAvcc', () => {
  it('同时支持 3 字节与 4 字节起始码', () => {
    const data = new Uint8Array([
      0, 0, 0, 1, 0x67, 0x64, 0x00, 0x1f, // 4 字节起始码 + SPS
      0, 0, 1, 0x68, 0xee, 0x3c, 0x80,    // 3 字节起始码 + PPS
    ]);
    const nals = splitAnnexB(data);
    expect(nals).toHaveLength(2);
    expect(nals[0][0]).toBe(0x67);
    expect(nals[1][0]).toBe(0x68);
  });

  it('★ AVCC 输出：每个 NAL 前 4 字节大端长度（WebCodecs 要的形态）', () => {
    const data = new Uint8Array([0, 0, 0, 1, 1, 2, 3, 0, 0, 1, 4, 5]);
    const avcc = annexBToAvcc(data);
    expect(Array.from(avcc.subarray(0, 4))).toEqual(be32(3));
    expect(Array.from(avcc.subarray(4, 7))).toEqual([1, 2, 3]);
    expect(Array.from(avcc.subarray(7, 11))).toEqual(be32(2));
    expect(Array.from(avcc.subarray(11, 13))).toEqual([4, 5]);
    expect(avcc.length).toBe(13);
  });

  it('空数据/纯脏数据不抛异常，返回空', () => {
    expect(splitAnnexB(new Uint8Array([]))).toEqual([]);
    expect(splitAnnexB(new Uint8Array([1, 2, 3, 4]))).toEqual([]);
    expect(annexBToAvcc(new Uint8Array([9, 9])).length).toBe(0);
  });
});

describe('SPS/PPS 与 WebCodecs 配置', () => {
  // 真机（OnePlus / Android 16）首包形态：CONFIG 里带 SPS+PPS
  const config = new Uint8Array([
    0, 0, 0, 1, 0x67, 0x64, 0x00, 0x1f, 0xac, 0xd9, 0x40, 0x50,
    0, 0, 0, 1, 0x68, 0xee, 0x3c, 0x80,
  ]);

  it('★ 从 CONFIG 包取出 SPS(7)/PPS(8)', () => {
    const { sps, pps } = extractSpsPps(config);
    expect(sps?.[0]).toBe(0x67);
    expect(pps?.[0]).toBe(0x68);
  });

  it('★ codec 串按 SPS 的 profile/compat/level 拼（不是写死 baseline）', () => {
    const { sps } = extractSpsPps(config);
    expect(avcCodecString(sps)).toBe('avc1.64001f');
    // 拿不到 SPS 时兜底可用
    expect(avcCodecString(null)).toBe('avc1.42E01F');
  });

  it('★ description（AVCDecoderConfigurationRecord）字段正确', () => {
    const { sps, pps } = extractSpsPps(config);
    const desc = buildAvcDescription(sps!, pps!);
    expect(desc[0]).toBe(1);              // configurationVersion
    expect(desc[1]).toBe(0x64);           // profile
    expect(desc[2]).toBe(0x00);           // compat
    expect(desc[3]).toBe(0x1f);           // level
    expect(desc[4]).toBe(0xff);           // lengthSizeMinusOne = 3
    expect(desc[5]).toBe(0xe1);           // 1 组 SPS
    expect((desc[6] << 8) | desc[7]).toBe(sps!.length);
    expect(desc[8]).toBe(0x67);
    const ppsLenAt = 8 + sps!.length;
    expect(desc[ppsLenAt]).toBe(1);       // 1 组 PPS
    expect((desc[ppsLenAt + 1] << 8) | desc[ppsLenAt + 2]).toBe(pps!.length);
  });
});

describe('12 字节视频包头', () => {
  const header = (pts: bigint, size: number): Uint8Array => {
    const h = new Uint8Array(12);
    for (let i = 0; i < 8; i += 1) h[i] = Number((pts >> BigInt(8 * (7 - i))) & 0xffn);
    h.set(be32(size), 8);
    return h;
  };

  it('★ CONFIG / KEY 标志位在 pts 的 bit63/bit62，size 在尾部 4 字节', () => {
    const configPts = (1n << 63n) | 123n;
    const p = parsePacketHeader(header(configPts, 31));
    expect(p.isConfig).toBe(true);
    expect(p.isKey).toBe(false);
    expect(p.size).toBe(31);
    expect(p.pts).toBe(123);

    const keyPts = (1n << 62n) | (1n << 63n) | 456n;
    const k = parsePacketHeader(header(keyPts, 2048));
    expect(k.isConfig).toBe(true);
    expect(k.isKey).toBe(true);
    expect(k.size).toBe(2048);
    expect(k.pts).toBe(456);
  });

  it('普通帧：size 正常读出（bilibili 大帧也不能被当成负数）', () => {
    const p = parsePacketHeader(header(789n, 3_000_000));
    expect(p.isConfig).toBe(false);
    expect(p.size).toBe(3_000_000);
  });
});
