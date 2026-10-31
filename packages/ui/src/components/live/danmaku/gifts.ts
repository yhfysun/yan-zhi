/** 平台礼物档位表：档位/价格/推力对所有玩法一致，动作词由各玩法 giftLabels 覆盖。 */

export interface GiftDef {
  id: string
  name: string
  coins: number
  push: number
  tier: number
}

export const GIFTS: Array<GiftDef> = [
  { id: 'fairy', name: '仙女棒', coins: 1, push: 2, tier: 1 },
  { id: 'pill', name: '能力药丸', coins: 10, push: 3, tier: 2 },
  { id: 'mirror', name: '魔法镜', coins: 19, push: 4, tier: 2 },
  { id: 'donut', name: '甜甜圈', coins: 52, push: 8, tier: 3 },
  { id: 'battery', name: '能量电池', coins: 99, push: 12, tier: 3 },
  { id: 'bomb', name: '恶魔炸弹', coins: 199, push: 16, tier: 4 },
  { id: 'airdrop', name: '神秘空投', coins: 520, push: 10, tier: 4 },
  { id: 'super', name: '超级空投', coins: 888, push: 24, tier: 5 },
  { id: 'jet', name: '超能喷射', coins: 1200, push: 36, tier: 5 },
]

export const GIFT_BY_ID: Record<string, GiftDef> = Object.fromEntries(
  GIFTS.map((gf) => [gf.id, gf])
)
