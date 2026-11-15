// 音乐 · 两方向零基础主线（内容包，全部预写）—— docs/音乐双方向重构方案-2026-11-15.md §六。
// ★ 方向是一等字段 track：A(western) 现代通用乐理 / B(traditional) 中国传统音乐；
//   分域硬闸（western 不得出现宫商角徵羽/工尺术语、traditional 不得出现大小调/调号术语）由单测钉死。
// 与传统文化 CULTURE_LESSONS 同范式：静态 TS 常量、只读下发、判分（quickCheck）在前端。

import type { MusicLesson, MusicLevel, MusicTrack } from './types';
import { getMusicScore } from './scores';

export const MUSIC_LEVELS: MusicLevel[] = ['听与拍', '识谱', '调性与色彩', '依谱写词', '编曲实践', '体系对照'];

export const MUSIC_LESSONS: MusicLesson[] = [
  // ── A · 现代通用乐理（western） ─────────────────────────────────────────────
  {
    id: 'mus_w_beat', kind: 'listen', title: '感受四拍', track: 'western',
    goal: '跟着曲子拍手，找到 4/4 的强弱规律', minutes: 8, level: '听与拍',
    steps: ['listen', 'play', 'check'], scoreId: 'score_scale_c',
    quickCheck: {
      question: '4/4 拍的「4/4」是什么意思？',
      options: ['每小节 4 拍，以四分音符为一拍', '每拍 4 秒', '一共 4 个音符'],
      answer: '每小节 4 拍，以四分音符为一拍',
      explanation: '拍号下方的 4 表示「以四分音符为一拍」，上方的 4 表示「每小节 4 拍」。',
    },
  },
  {
    id: 'mus_w_highlow', kind: 'listen', title: '音的高与低', track: 'western',
    goal: '听出两个音谁高谁低，建立「音高」的耳朵', minutes: 8, level: '听与拍',
    steps: ['listen', 'recognize', 'check'], scoreId: 'score_scale_c',
    quickCheck: {
      question: '同一八度里，B 和 C 哪个更高？',
      options: ['B', 'C', '一样高'],
      answer: 'B',
      explanation: 'C 大调音阶从 do 爬到 si 再回到高 do：B（si）比 C（do）高 11 个半音。',
    },
  },
  {
    id: 'mus_w_staff', kind: 'read', title: '五线谱与高音谱号', track: 'western',
    goal: '认识线和间：音符放的位置越高，音越高', minutes: 10, level: '识谱',
    steps: ['listen', 'recognize', 'check'], scoreId: 'score_scale_c',
    quickCheck: {
      question: '五线谱上，音符的位置越靠上，音就——',
      options: ['越高', '越低', '不变'],
      answer: '越高',
      explanation: '五线谱是一条「高度计」：高音谱表从下往上数，最下线是 E4（mi），每往上半格升高一步。',
    },
  },
  {
    id: 'mus_w_names', kind: 'read', title: '七个音名与唱名', track: 'western',
    goal: 'C D E F G A B = do re mi fa sol la si：十二个音的基础七个', minutes: 10, level: '识谱',
    steps: ['recognize', 'play', 'check'], scoreId: 'score_scale_c',
    quickCheck: {
      question: '唱名 fa 对应的音名是——',
      options: ['F', 'E', 'G'],
      answer: 'F',
      explanation: 'do=C、re=D、mi=E、fa=F、sol=G、la=A、si=B。fa 夹在 mi 和 sol 之间。',
    },
  },
  {
    id: 'mus_w_rhythm', kind: 'read', title: '拍号、时值与休止', track: 'western',
    goal: '全音符 4 拍、二分 2 拍、四分 1 拍、八分半拍；休止符是无声的时值', minutes: 10, level: '识谱',
    steps: ['recognize', 'play', 'check'], scoreId: 'score_odetojoy',
    quickCheck: {
      question: '在 4/4 拍里，一个二分音符占几拍？',
      options: ['2 拍', '1 拍', '4 拍'],
      answer: '2 拍',
      explanation: '四分音符 1 拍，二分音符是它的两倍 = 2 拍，全音符 4 拍，八分音符半拍。',
    },
  },
  {
    id: 'mus_w_rounds', kind: 'listen', title: '轮唱：两只老虎', track: 'western',
    goal: '同一段旋律间隔一小节再唱一遍就是轮唱（卡农）——重复是最古老的作曲手法', minutes: 12, level: '识谱',
    steps: ['listen', 'recognize', 'play', 'check'], scoreId: 'score_frerejacques',
    quickCheck: {
      question: '轮唱（卡农）的第二声部什么时候进入？',
      options: ['隔开固定的小节数再从头唱', '同时唱不同的歌', '等第一声部唱完'],
      answer: '隔开固定的小节数再从头唱',
      explanation: '第一声部唱满一小节（或两小节），第二声部从同一旋律的开头跟进——两声部用的是同一份谱，只错开时间。',
    },
  },
  {
    id: 'mus_w_accident', kind: 'read', title: '半音与升降号', track: 'western',
    goal: '相邻两键就是半音；升号 # 把音抬高半音，降号 b 压低半音', minutes: 10, level: '识谱',
    steps: ['recognize', 'play', 'check'], scoreId: 'score_odetojoy',
    quickCheck: {
      question: 'F#（升 fa）和 F 比——',
      options: ['高半音', '低半音', '一样高'],
      answer: '高半音',
      explanation: '升号把音抬高一个半音：mi→fa、fa→f# 都是「相邻一步」。钢琴上就是右边紧挨的那个键。',
    },
  },
  {
    id: 'mus_w_major', kind: 'listen', title: 'C 大调听感', track: 'western',
    goal: '大调以 do 为主音，色彩明亮稳定——大多数儿歌和颂歌都是大调', minutes: 12, level: '调性与色彩',
    steps: ['listen', 'play', 'check'], scoreId: 'score_odetojoy',
    quickCheck: {
      question: '《欢乐颂》《小星星》这类明亮稳定的旋律，通常是——',
      options: ['大调', '小调', '五声调式'],
      answer: '大调',
      explanation: '大调以 do 为主音、主三和弦是大三和弦，听感明亮；小调以 la 为主音，色彩偏暗。',
    },
  },
  {
    id: 'mus_w_interval', kind: 'check', title: '音程与三和弦', track: 'western',
    goal: '两音的距离叫音程；三个音叠起来叫三和弦——大调的骨架是 do mi sol', minutes: 10, level: '调性与色彩',
    steps: ['recognize', 'check'],
    quickCheck: {
      question: 'C 大调的主三和弦是哪三个音？',
      options: ['C E G', 'C D E', 'C F A'],
      answer: 'C E G',
      explanation: 'do-mi-sol 按「大三度+小三度」叠起来就是 C 大三和弦——大调明亮感的来源。',
    },
  },
  {
    id: 'mus_w_arpeggio', kind: 'listen', title: '琶音：把和弦拆开听', track: 'western',
    goal: '主三和弦 do-mi-sol 逐个弹就是琶音——听出大三和弦明亮「回家」的听感', minutes: 12, level: '调性与色彩',
    steps: ['listen', 'recognize', 'play', 'check'], scoreId: 'score_chord_arp',
    quickCheck: {
      question: 'C 大调主三和弦琶音按顺序是哪三个音？',
      options: ['C E G（do mi sol）', 'C D E（do re mi）', 'C F A（do fa la）'],
      answer: 'C E G（do mi sol）',
      explanation: '琶音 = 把同时响的和弦拆成先后响。C-E-G 逐个弹出来，就是大调「明亮稳当」听感的来源。',
    },
  },
  {
    id: 'mus_w_compose1', kind: 'compose', title: '七音格子第一次落音', track: 'western',
    goal: '在 4 小节 × 7 音的格子里落下第一批音，边点边听', minutes: 12, level: '编曲实践',
    steps: ['write', 'play', 'check'],
    quickCheck: {
      question: '编曲格子的一行代表什么？',
      options: ['一个音高（C D E F G A B）', '一个小节', '一个调式'],
      answer: '一个音高（C D E F G A B）',
      explanation: '格子是「时间 × 音高」：横向是小节里的拍位（列），纵向是七个基本音级（行）。',
    },
  },
  {
    id: 'mus_w_compose2', kind: 'compose', title: '起承转合与收束', track: 'western',
    goal: '重复让旋律好记；结束落在主音 do 上，曲子才「回了家」', minutes: 12, level: '编曲实践',
    steps: ['listen', 'write', 'play', 'check'], scoreId: 'score_odetojoy',
    quickCheck: {
      question: '想让 8 小节小曲「结束得稳」，最后一拍最好落在——',
      options: ['主音 do（C）', 'si（B）', '任何音都行'],
      answer: '主音 do（C）',
      explanation: '旋律回到主音叫「收束」：大调落在 do、小调落在 la，听感才完整。这叫主音收束。',
    },
  },
  {
    id: 'mus_w_bridge', kind: 'read', title: '两套体系怎么对照', track: 'western',
    goal: '五线谱是通用记谱工具：中国旋律也能用五线谱/简谱记录，但两套乐理概念不混用', minutes: 10, level: '体系对照',
    steps: ['listen', 'recognize', 'check'], scoreId: 'score_twinkle_w',
    quickCheck: {
      question: '《小星星》的调式应该叫——',
      options: ['C 大调', '宫调式', '小调'],
      answer: 'C 大调',
      explanation: '它是以 do 为主音的西方大调儿歌。「宫调式」是中国五声体系的说法，用在这里就串味了。',
    },
  },

  // ── B · 中国传统音乐（traditional） ─────────────────────────────────────────
  {
    id: 'mus_t_beat', kind: 'listen', title: '拍子与强弱', track: 'traditional',
    goal: '先能感知：拍子、长短、强弱与方向无关，哪个体系都要先有这双耳朵', minutes: 8, level: '听与拍',
    steps: ['listen', 'play', 'check'], scoreId: 'score_penta_practice',
    quickCheck: {
      question: '「一拍」的长短由什么决定？',
      options: ['曲子的速度（BPM）', '音符的高低', '调式'],
      answer: '曲子的速度（BPM）',
      explanation: 'BPM = 每分钟拍数。同样的四分音符，快曲子里短、慢曲子里长——拍子是「相对时长」。',
    },
  },
  {
    id: 'mus_t_gongche', kind: 'read', title: '工尺谱：上尺工六五', track: 'traditional',
    goal: '认识老祖宗的记谱法：上=1 尺=2 工=3 六=5 五=6', minutes: 10, level: '识谱',
    steps: ['recognize', 'play', 'check'], scoreId: 'score_penta_practice',
    quickCheck: {
      question: '工尺谱里的「工」相当于简谱的——',
      options: ['3（mi）', '1（do）', '5（sol）'],
      answer: '3（mi）',
      explanation: '口诀「上尺工六五」对应「1 2 3 5 6」：上=do，尺=re，工=mi，六=sol，五=la。',
    },
  },
  {
    id: 'mus_t_jianpu', kind: 'read', title: '简谱 1 2 3 5 6', track: 'traditional',
    goal: '简谱近代传入、在中国普及：数字记法两边通用，这里先记五声五个数', minutes: 10, level: '识谱',
    steps: ['recognize', 'write', 'check'], scoreId: 'score_penta_practice',
    quickCheck: {
      question: '五声音阶的简谱里没有出现 4 和 7，因为——',
      options: ['宫商角徵羽五个音里没有它们', '唱不了', '写不出来'],
      answer: '宫商角徵羽五个音里没有它们',
      explanation: '中国传统五声音阶是 1 2 3 5 6（do re mi sol la），没有 fa 和 si，这是大多数民歌听起来「很中国」的秘密。',
    },
  },
  {
    id: 'mus_t_penta', kind: 'read', title: '宫商角徵羽', track: 'traditional',
    goal: '把五个音的四种写法（五线谱/简谱/工尺/汉字名）一次打通', minutes: 10, level: '调性与色彩',
    steps: ['listen', 'recognize', 'play'], scoreId: 'score_penta_practice',
    quickCheck: {
      question: '「六」在工尺谱里对应宫商角徵羽的哪一个？',
      options: ['徵（5）', '角（3）', '宫（1）'],
      answer: '徵（5）',
      explanation: '徵=sol=5=六=G。「六」是高音区的 sol，传统管乐谱里还分「大六」「小六」，先记低音这个。',
    },
  },
  {
    id: 'mus_t_modes', kind: 'listen', title: '换个调式听色彩', track: 'traditional',
    goal: '同一段旋律，宫调式和羽调式的「心情」不一样——主音变了，色彩就变了', minutes: 12, level: '调性与色彩',
    steps: ['listen', 'play', 'check'], scoreId: 'score_moli',
    quickCheck: {
      question: '羽调式听起来通常比宫调式——',
      options: ['更柔和、更忧伤', '更明亮、更欢快', '完全没有差别'],
      answer: '更柔和、更忧伤',
      explanation: '宫调式以 do 为主音、色彩明亮；羽调式以 la 为主音、色彩偏暗偏柔——民歌的婉转常来自羽调式色彩。',
    },
  },
  {
    id: 'mus_t_folksong', kind: 'listen', title: '民歌里的五声', track: 'traditional',
    goal: '在《康定情歌》里找出宫商角徵羽：民歌只用这五个音', minutes: 12, level: '调性与色彩',
    steps: ['listen', 'recognize', 'play'], scoreId: 'score_kangding',
    quickCheck: {
      question: '《康定情歌》的调式色彩偏——',
      options: ['羽调式（柔和）', '宫调式（明亮）', '没有调式'],
      answer: '羽调式（柔和）',
      explanation: '它的旋律围绕 la（羽）展开并收在羽音上，是典型的羽调式色彩。',
    },
  },
  {
    id: 'mus_t_qa', kind: 'listen', title: '问一句 · 答一句', track: 'traditional',
    goal: '民歌的上下句结构：上句「问」（不落主音），下句「答」（收在宫音上）', minutes: 12, level: '调性与色彩',
    steps: ['listen', 'recognize', 'play', 'check'], scoreId: 'score_penta_qa',
    quickCheck: {
      question: '民歌「上问下答」的答句通常落在——',
      options: ['宫音（do）上', '角音（mi）上', '随便哪个音'],
      answer: '宫音（do）上',
      explanation: '上句像问话，停在半空；下句收在主音上才有「说完」的感觉——这就是「问-答」结构，编曲的「起承转合」也用它。',
    },
  },
  {
    id: 'mus_t_lyric1', kind: 'lyric', title: '给茉莉花填词', track: 'traditional',
    goal: '一字一音：把示范词换成你自己写的词', minutes: 12, level: '依谱写词',
    steps: ['listen', 'write', 'play'], scoreId: 'score_moli',
    lyricTemplate: ['', '', '', '', '', '', '', '', '', '', ''],
  },
  {
    id: 'mus_t_lyric2', kind: 'lyric', title: '字调与旋律走向', track: 'traditional',
    goal: '阴平阳平是「平」，上声去声是「仄」：平声配平缓，仄声配跳进', minutes: 10, level: '依谱写词',
    steps: ['listen', 'recognize', 'write'], scoreId: 'score_yimeng',
    lyricTemplate: ['', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    quickCheck: {
      question: '「花」（huā，阴平）配在什么样的音上最顺口？',
      options: ['较长、较平缓的音', '最短促的音', '随便哪个音'],
      answer: '较长、较平缓的音',
      explanation: '阴平字调平而长，落在长音上字正腔圆；短促的跳进音配仄声字（上去声）更顺。',
    },
  },
  {
    id: 'mus_t_compose1', kind: 'compose', title: '五声格子第一次落音', track: 'traditional',
    goal: '在 4 小节 × 5 音的格子里落音，感受五声的「天生中国味」', minutes: 12, level: '编曲实践',
    steps: ['write', 'play', 'check'],
    quickCheck: {
      question: '编曲格子的一行代表什么？',
      options: ['一个音高（宫/商/角/徵/羽）', '一个小节', '一个调式'],
      answer: '一个音高（宫/商/角/徵/羽）',
      explanation: '格子是「时间 × 音高」：横向是小节里的拍位（列），纵向是五个五声音高（行）。',
    },
  },
  {
    id: 'mus_t_compose2', kind: 'compose', title: '移调试听', track: 'traditional',
    goal: '同一段旋律一键换调式：亲耳听出宫调与羽调的差别', minutes: 12, level: '编曲实践',
    steps: ['listen', 'write', 'play'], scoreId: 'score_caiyun',
    quickCheck: {
      question: '把《彩云追月》从宫调式移到羽调式后，旋律的——',
      options: ['相对走向不变，主音变了', '音符全变了', '节奏变了'],
      answer: '相对走向不变，主音变了',
      explanation: '移调保持每个音「距主音的度数」不变，只把锚点换成新调式主音——所以旋律形状不变、色彩变了。',
    },
  },
  {
    id: 'mus_t_bridge', kind: 'read', title: '工尺 · 简谱 · 五线谱对照', track: 'traditional',
    goal: '同一段民歌旋律在三种记法里长什么样；五线谱是通用工具，不是「国外专属」', minutes: 10, level: '体系对照',
    steps: ['listen', 'recognize', 'check'], scoreId: 'score_moli',
    quickCheck: {
      question: '《茉莉花》用五线谱记录时，这套记谱法——',
      options: ['只是工具，记什么体系都可以', '会让它变成西方音乐', '不能用'],
      answer: '只是工具，记什么体系都可以',
      explanation: '记谱法是纸笔，乐理体系才是「语言」。中国旋律也大量用五线谱/简谱出版——分域的是概念与术语，不是工具。',
    },
  },
];

export function lessonsByTrack(track: MusicTrack): MusicLesson[] {
  return MUSIC_LESSONS.filter((l) => l.track === track);
}

export function getMusicLesson(id: string): MusicLesson | undefined {
  return MUSIC_LESSONS.find((l) => l.id === id);
}

// 自检：课时引用的 scoreId 必须真实存在（写错 = 沉浸台拿到空谱面，静默坏掉）；
// 依谱写词模板位数必须与曲谱非休止音符数一致。
for (const l of MUSIC_LESSONS) {
  if (l.scoreId && !getMusicScore(l.scoreId)) {
    throw new Error(`music lesson ${l.id} 引用了不存在的 scoreId ${l.scoreId}`);
  }
  if (l.lyricTemplate && l.scoreId) {
    const count = getMusicScore(l.scoreId)!.notes.filter((n) => !n.rest).length;
    if (l.lyricTemplate.length !== count) {
      throw new Error(`music lesson ${l.id} lyricTemplate ${l.lyricTemplate.length} 位 ≠ 曲谱非休止音 ${count} 位`);
    }
  }
}
