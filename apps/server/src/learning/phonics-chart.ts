/**
 * 英语 44 音标谱（元音 + 辅音分组）—— 学习模式「音标谱」工具页的唯一数据源。
 *
 * 点读音频映射见 packages/ui/src/utils/phonics-audio.ts（随包 gimson 44 音）：
 * - s / z 上游原缺音频，2026-11-14 已从真人整词裁出擦音段补录，音标谱 44 音现在全部可点读；
 * - tʃ / dʒ 与 ʧ / ʤ 两套写法由 normalizeIpa 归一，这里统一写 tʃ / dʒ（教学通用形态）；
 * - 课程内逐音卡片与音标谱都展示 IPA；mouth 口型提示只作并列的辅助说明。
 */
export type PhonicsChartItem = { ipa: string; word: string; gloss: string };
export type PhonicsChartGroup = { key: string; label: string; items: PhonicsChartItem[] };

export const ENGLISH_PHONIC_CHART: PhonicsChartGroup[] = [
  {
    key: 'short', label: '短元音', items: [
      { ipa: 'ɪ', word: 'sit', gloss: '坐' },
      { ipa: 'e', word: 'bed', gloss: '床' },
      { ipa: 'æ', word: 'tap', gloss: '轻拍' },
      { ipa: 'ʌ', word: 'cup', gloss: '杯子' },
      { ipa: 'ɒ', word: 'hot', gloss: '热的' },
      { ipa: 'ʊ', word: 'book', gloss: '书' },
      { ipa: 'ə', word: 'about', gloss: '关于' },
    ],
  },
  {
    key: 'long', label: '长元音', items: [
      { ipa: 'iː', word: 'see', gloss: '看见' },
      { ipa: 'ɑː', word: 'car', gloss: '汽车' },
      { ipa: 'ɔː', word: 'door', gloss: '门' },
      { ipa: 'uː', word: 'food', gloss: '食物' },
      { ipa: 'ɜː', word: 'bird', gloss: '鸟' },
    ],
  },
  {
    key: 'diphthong', label: '双元音', items: [
      { ipa: 'eɪ', word: 'day', gloss: '天' },
      { ipa: 'aɪ', word: 'time', gloss: '时间' },
      { ipa: 'ɔɪ', word: 'boy', gloss: '男孩' },
      { ipa: 'əʊ', word: 'go', gloss: '走' },
      { ipa: 'aʊ', word: 'now', gloss: '现在' },
      { ipa: 'ɪə', word: 'near', gloss: '近的' },
      { ipa: 'eə', word: 'hair', gloss: '头发' },
      { ipa: 'ʊə', word: 'tour', gloss: '旅行' },
    ],
  },
  {
    key: 'pairs', label: '清浊辅音对', items: [
      { ipa: 'p', word: 'pen', gloss: '笔' },
      { ipa: 'b', word: 'bag', gloss: '包' },
      { ipa: 't', word: 'tap', gloss: '轻拍' },
      { ipa: 'd', word: 'dog', gloss: '狗' },
      { ipa: 'k', word: 'cat', gloss: '猫' },
      { ipa: 'g', word: 'go', gloss: '走' },
      { ipa: 'f', word: 'fan', gloss: '扇子' },
      { ipa: 'v', word: 'van', gloss: '货车' },
      { ipa: 'θ', word: 'think', gloss: '想' },
      { ipa: 'ð', word: 'this', gloss: '这个' },
      { ipa: 's', word: 'sip', gloss: '小口喝' },
      { ipa: 'z', word: 'zip', gloss: '拉链' },
      { ipa: 'ʃ', word: 'she', gloss: '她' },
      { ipa: 'ʒ', word: 'vision', gloss: '视野' },
      { ipa: 'tʃ', word: 'chair', gloss: '椅子' },
      { ipa: 'dʒ', word: 'jam', gloss: '果酱' },
    ],
  },
  {
    key: 'nasal', label: '鼻音', items: [
      { ipa: 'm', word: 'map', gloss: '地图' },
      { ipa: 'n', word: 'nap', gloss: '小睡' },
      { ipa: 'ŋ', word: 'sing', gloss: '唱歌' },
    ],
  },
  {
    key: 'other', label: '其他辅音', items: [
      { ipa: 'h', word: 'hat', gloss: '帽子' },
      { ipa: 'l', word: 'leg', gloss: '腿' },
      { ipa: 'r', word: 'red', gloss: '红色' },
      { ipa: 'w', word: 'web', gloss: '网' },
      { ipa: 'j', word: 'yes', gloss: '是' },
    ],
  },
];
