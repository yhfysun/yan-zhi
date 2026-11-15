/**
 * 陪练「按科目隔离」契约测试。
 *
 * 实报：切到周易后陪练面板仍显示 "Hi, I'm ready. What would you like to practice today?"，
 * 点「先开场」还会拿英语自由口语的英文预设句去请求中文陪练。根因不是 agentId 分派
 * （那部分一直是按科目的），而是面板文案与开场白硬编码在 Learning.vue 里。
 */
import { describe, it, expect } from 'vitest'
import { COACH_PROFILES, coachProfileOf, coachPresetPrefixes } from './coach-profiles'

const CHINESE_SUBJECTS = ['周易', '传统文化', '音乐'] as const

describe('陪练科目分派', () => {
  it('四个科目都有完整配置；未知科目回落英语而不是空白', () => {
    for (const key of ['英语', ...CHINESE_SUBJECTS]) {
      const p = COACH_PROFILES[key]
      expect(p, `${key} 缺配置`).toBeTruthy()
      for (const field of ['eyebrow', 'title', 'subtitle', 'roleLabel', 'startLabel', 'emptyReply', 'openingPrompt', 'typingPlaceholder', 'talkIdleHint'] as const) {
        expect(p[field].length, `${key}.${field} 为空`).toBeGreaterThan(0)
      }
    }
    expect(coachProfileOf('不存在的科目')).toBe(COACH_PROFILES['英语'])
  })

  it('中文科目的面板文案与角色标签不含英文句子', () => {
    for (const key of CHINESE_SUBJECTS) {
      const p = COACH_PROFILES[key]
      for (const field of ['eyebrow', 'title', 'subtitle', 'roleLabel', 'startLabel', 'emptyReply', 'talkIdleHint'] as const) {
        expect(p[field], `${key}.${field} 混入英文`).not.toMatch(/[A-Za-z]/)
      }
    }
  })

  it('中文科目的开场白明确要求中文，且不出现英语口语陪练的预设句', () => {
    for (const key of CHINESE_SUBJECTS) {
      const p = COACH_PROFILES[key]
      expect(p.openingPrompt).toContain('请用中文')
      expect(p.openingPrompt).toContain('不要使用英语')
      expect(p.openingPrompt).not.toContain('practice English')
      expect(p.openingPrompt).not.toContain('scene_result')
    }
  })

  it('英语科目保持原有英文空态与口语陪练预设（该科目的教学目标就是练英语）', () => {
    const p = COACH_PROFILES['英语']
    expect(p.emptyReply).toContain('What would you like to practice today?')
    expect(p.openingPrompt).toContain('practice English freely')
  })

  it('每个科目的开场预设都能被识别，不计入用户真实轮次', () => {
    const prefixes = coachPresetPrefixes()
    for (const key of ['英语', ...CHINESE_SUBJECTS]) {
      const firstLine = COACH_PROFILES[key].openingPrompt.split('\n')[0]
      expect(prefixes).toContain(firstLine)
      expect(prefixes.some((prefix) => firstLine.startsWith(prefix))).toBe(true)
    }
    // 历史会话里的旧英文预设仍兼容
    expect(prefixes).toContain('I am ready. Please start')
    expect(prefixes).toContain('请根据当前场景')
  })
})
