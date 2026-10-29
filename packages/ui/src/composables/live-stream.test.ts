import { describe, expect, it } from 'vitest'
import { isRtmpUrl, maskRtmpUrl } from './live-stream'

describe('live-stream 地址校验', () => {
  it('接受 rtmp / rtmps', () => {
    expect(isRtmpUrl('rtmp://push.example.com/live/abc')).toBe(true)
    expect(isRtmpUrl('rtmps://push.example.com/live/abc?k=1')).toBe(true)
    expect(isRtmpUrl('  rtmp://host/live  ')).toBe(true)
  })

  it('拒绝其它协议与空值', () => {
    expect(isRtmpUrl('http://push.example.com/live')).toBe(false)
    expect(isRtmpUrl('rtmp:/oops')).toBe(false)
    expect(isRtmpUrl('')).toBe(false)
    expect(isRtmpUrl(undefined as unknown as string)).toBe(false)
  })

  it('掩码只保留协议与主机，不泄露推流码', () => {
    expect(maskRtmpUrl('rtmp://push.example.com/live/secret-key?sign=abc')).toBe('rtmp://push.example.com/…')
    expect(maskRtmpUrl('rtmp://host-only')).toBe('rtmp://…')
  })
})
