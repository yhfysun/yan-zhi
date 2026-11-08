// 内置示例词书内容包（P0）。正式的 CET4/高考全量词书按方案 P1 走「词书库下载」，
// 这里只内置一小本让 P0 的关卡体验完整可跑（2 关 × 20 词）。
//
// 词条结构刻意窄：word/phonetic/gloss/example —— 与 learning_word 表列一一对应，
// 词书库（P1 的 JSON 内容包）沿用同一结构，落库时零转换。

export type BuiltinWordEntry = { word: string; phonetic?: string; gloss: string; example?: string };

export type BuiltinWordBook = {
  id: string;
  name: string;
  course: string;
  level: string;
  words: BuiltinWordEntry[];
};

export const BUILTIN_WORDBOOKS: BuiltinWordBook[] = [
  {
    id: 'wb_cet4_sample',
    name: 'CET4 高频核心 · 示例',
    course: 'CET4',
    level: '入门',
    words: [
      { word: 'abandon', phonetic: '/əˈbændən/', gloss: 'v. 放弃；抛弃', example: 'He had to abandon the plan.' },
      { word: 'ability', phonetic: '/əˈbɪləti/', gloss: 'n. 能力；才能', example: 'She has the ability to solve problems fast.' },
      { word: 'absorb', phonetic: '/əbˈzɔːb/', gloss: 'v. 吸收；理解', example: 'Plants absorb water through roots.' },
      { word: 'achieve', phonetic: '/əˈtʃiːv/', gloss: 'v. 达到；实现', example: 'You can achieve your goal step by step.' },
      { word: 'adapt', phonetic: '/əˈdæpt/', gloss: 'v. 适应；改编', example: 'It takes time to adapt to a new city.' },
      { word: 'afford', phonetic: '/əˈfɔːd/', gloss: 'v. 买得起；承担得起', example: 'I can not afford a new laptop.' },
      { word: 'analyze', phonetic: '/ˈænəlaɪz/', gloss: 'v. 分析', example: 'We analyze the data every week.' },
      { word: 'ancient', phonetic: '/ˈeɪnʃənt/', gloss: 'adj. 古代的；古老的', example: 'They visited an ancient temple.' },
      { word: 'apparent', phonetic: '/əˈpærənt/', gloss: 'adj. 显然的；表面上的', example: 'It was apparent that he was tired.' },
      { word: 'appreciate', phonetic: '/əˈpriːʃieɪt/', gloss: 'v. 感激；欣赏', example: 'I appreciate your help.' },
      { word: 'approach', phonetic: '/əˈprəʊtʃ/', gloss: 'n./v. 方法；接近', example: 'We need a new approach to this problem.' },
      { word: 'appropriate', phonetic: '/əˈprəʊpriət/', gloss: 'adj. 恰当的；合适的', example: 'Wear appropriate clothes for the interview.' },
      { word: 'assume', phonetic: '/əˈsjuːm/', gloss: 'v. 假定；承担', example: 'Do not assume you know the answer.' },
      { word: 'available', phonetic: '/əˈveɪləbl/', gloss: 'adj. 可获得的；有空的', example: 'Are you available tomorrow morning?' },
      { word: 'aware', phonetic: '/əˈweə(r)/', gloss: 'adj. 意识到的', example: 'She is aware of the risk.' },
      { word: 'barrier', phonetic: '/ˈbæriə(r)/', gloss: 'n. 障碍；屏障', example: 'Language is a big barrier for beginners.' },
      { word: 'benefit', phonetic: '/ˈbenɪfɪt/', gloss: 'n./v. 好处；受益', example: 'Exercise benefits both body and mind.' },
      { word: 'budget', phonetic: '/ˈbʌdʒɪt/', gloss: 'n. 预算', example: 'Our budget is limited this year.' },
      { word: 'capable', phonetic: '/ˈkeɪpəbl/', gloss: 'adj. 有能力的', example: 'He is capable of finishing it alone.' },
      { word: 'challenge', phonetic: '/ˈtʃælɪndʒ/', gloss: 'n./v. 挑战；向…挑战', example: 'Learning English is a fun challenge.' },
      { word: 'circumstance', phonetic: '/ˈsɜːkəmstəns/', gloss: 'n. 环境；情况', example: 'Under no circumstances should you give up.' },
      { word: 'colleague', phonetic: '/ˈkɒliːɡ/', gloss: 'n. 同事', example: 'My colleagues are very supportive.' },
      { word: 'commit', phonetic: '/kəˈmɪt/', gloss: 'v. 承诺；犯（错）', example: 'I committed to daily practice.' },
      { word: 'community', phonetic: '/kəˈmjuːnəti/', gloss: 'n. 社区；群体', example: 'The local community helped a lot.' },
      { word: 'compare', phonetic: '/kəmˈpeə(r)/', gloss: 'v. 比较', example: 'Do not compare yourself with others.' },
      { word: 'compete', phonetic: '/kəmˈpiːt/', gloss: 'v. 竞争；比赛', example: 'They compete for the top prize.' },
      { word: 'confirm', phonetic: '/kənˈfɜːm/', gloss: 'v. 确认', example: 'Please confirm your booking.' },
      { word: 'consequence', phonetic: '/ˈkɒnsɪkwəns/', gloss: 'n. 后果；结果', example: 'Every choice has consequences.' },
      { word: 'contribute', phonetic: '/kənˈtrɪbjuːt/', gloss: 'v. 贡献；促成', example: 'Everyone can contribute ideas.' },
      { word: 'convince', phonetic: '/kənˈvɪns/', gloss: 'v. 说服；使确信', example: 'He convinced me to join the team.' },
      { word: 'crucial', phonetic: '/ˈkruːʃl/', gloss: 'adj. 至关重要的', example: 'Practice is crucial to progress.' },
      { word: 'curious', phonetic: '/ˈkjʊəriəs/', gloss: 'adj. 好奇的', example: 'Kids are naturally curious.' },
      { word: 'decrease', phonetic: '/dɪˈkriːs/', gloss: 'v./n. 减少', example: 'Sales decreased last quarter.' },
      { word: 'demand', phonetic: '/dɪˈmɑːnd/', gloss: 'v./n. 要求；需求', example: 'The demand for English skills is growing.' },
      { word: 'demonstrate', phonetic: '/ˈdemənstreɪt/', gloss: 'v. 展示；证明', example: 'Let me demonstrate how it works.' },
      { word: 'determine', phonetic: '/dɪˈtɜːmɪn/', gloss: 'v. 决定；确定', example: 'Practice determines your progress.' },
      { word: 'develop', phonetic: '/dɪˈveləp/', gloss: 'v. 发展；开发', example: 'Reading develops vocabulary fast.' },
      { word: 'distribute', phonetic: '/dɪˈstrɪbjuːt/', gloss: 'v. 分发；分配', example: 'They distribute flyers on campus.' },
      { word: 'diverse', phonetic: '/daɪˈvɜːs/', gloss: 'adj. 多样的', example: 'The city has a diverse culture.' },
      { word: 'efficient', phonetic: '/ɪˈfɪʃnt/', gloss: 'adj. 高效的', example: 'This method is more efficient.' },
    ],
  },
];
