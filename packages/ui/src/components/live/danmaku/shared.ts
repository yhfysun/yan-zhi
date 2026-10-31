/** 弹幕游戏共用常量与小工具。W/H 是 9:16 舞台的逻辑画布尺寸。 */
export type Ctx = CanvasRenderingContext2D
/** 站队：a = 改写方（拉锯 +），b = 守常方（拉锯 −） */
export type Side = 'a' | 'b'

export const W = 360
export const H = 640

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))
export const rand = (a: number, b: number): number => a + Math.random() * (b - a)
export const pick = <T,>(arr: Array<T>): T => arr[Math.floor(Math.random() * arr.length)]

export const FONT = '-apple-system,"PingFang SC",sans-serif'

/** '#rrggbb' → rgba(...)，引擎叠加层（飘字/脉冲）按阵营色派生 */
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** 打赏飘字：带倍率就标出来，让观众看见「这一下比平时值」 */
export function multFloatText(gain: number, mult: number): string {
  return mult > 1 ? `+${gain} ×${mult === 2.5 ? '2.5' : mult}` : `+${gain}`
}
