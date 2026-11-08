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

// 第二本：高考核心示例（与 CET4 示例同构，40 词 2 关；全量词书走词书库下载）
BUILTIN_WORDBOOKS.push({
  id: 'wb_gaokao_sample',
  name: '高考核心 · 示例',
  course: '高考',
  level: '入门',
  words: [
    { word: 'absent', phonetic: '/ˈæbsənt/', gloss: 'adj. 缺席的', example: 'He was absent from class yesterday.' },
    { word: 'academic', phonetic: '/ˌækəˈdemɪk/', gloss: 'adj. 学业的；学术的', example: 'Her academic results improved a lot.' },
    { word: 'access', phonetic: '/ˈækses/', gloss: 'n./v. 接近；使用权', example: 'Students have access to the library online.' },
    { word: 'accurate', phonetic: '/ˈækjərət/', gloss: 'adj. 精确的', example: 'Your answer is accurate.' },
    { word: 'announce', phonetic: '/əˈnaʊns/', gloss: 'v. 宣布', example: 'They announced the winner at noon.' },
    { word: 'anxious', phonetic: '/ˈæŋkʃəs/', gloss: 'adj. 焦虑的；渴望的', example: 'I felt anxious before the exam.' },
    { word: 'apologize', phonetic: '/əˈpɒlədʒaɪz/', gloss: 'v. 道歉', example: 'You should apologize to her.' },
    { word: 'apparent', phonetic: '/əˈpærənt/', gloss: 'adj. 显然的', example: 'It was apparent that she was tired.' },
    { word: 'apply', phonetic: '/əˈplaɪ/', gloss: 'v. 申请；应用', example: 'I want to apply for the position.' },
    { word: 'attitude', phonetic: '/ˈætɪtjuːd/', gloss: 'n. 态度', example: 'A positive attitude helps a lot.' },
    { word: 'attract', phonetic: '/əˈtrækt/', gloss: 'v. 吸引', example: 'The show attracts many visitors.' },
    { word: 'average', phonetic: '/ˈævərɪdʒ/', gloss: 'adj./n. 平均的；平均数', example: 'The average temperature is 20 degrees.' },
    { word: 'balance', phonetic: '/ˈbæləns/', gloss: 'n./v. 平衡', example: 'Try to balance work and rest.' },
    { word: 'behavior', phonetic: '/bɪˈheɪvjə(r)/', gloss: 'n. 行为', example: 'His behavior at school was excellent.' },
    { word: 'brilliant', phonetic: '/ˈbrɪliənt/', gloss: 'adj. 杰出的；明亮的', example: 'She came up with a brilliant idea.' },
    { word: 'campaign', phonetic: '/kæmˈpeɪn/', gloss: 'n. 运动；活动', example: 'They started a campaign to save water.' },
    { word: 'candidate', phonetic: '/ˈkændɪdət/', gloss: 'n. 候选人', example: 'There are three candidates for the job.' },
    { word: 'celebrate', phonetic: '/ˈselɪbreɪt/', gloss: 'v. 庆祝', example: 'We celebrated her birthday at home.' },
    { word: 'ceremony', phonetic: '/ˈserəməni/', gloss: 'n. 典礼', example: 'The opening ceremony was amazing.' },
    { word: 'character', phonetic: '/ˈkærəktə(r)/', gloss: 'n. 性格；角色；汉字', example: 'The main character is a brave girl.' },
    { word: 'combine', phonetic: '/kəmˈbaɪn/', gloss: 'v. 结合', example: 'Combine theory with practice.' },
    { word: 'comment', phonetic: '/ˈkɒment/', gloss: 'n./v. 评论', example: 'He made no comment on the news.' },
    { word: 'communicate', phonetic: '/kəˈmjuːnɪkeɪt/', gloss: 'v. 交流', example: 'We communicate by email every day.' },
    { word: 'company', phonetic: '/ˈkʌmpəni/', gloss: 'n. 公司；陪伴', example: 'She works for a big company.' },
    { word: 'concentrate', phonetic: '/ˈkɒnsntreɪt/', gloss: 'v. 集中（注意力）', example: 'I can’t concentrate with all this noise.' },
    { word: 'confident', phonetic: '/ˈkɒnfɪdənt/', gloss: 'adj. 自信的', example: 'Be confident in yourself.' },
    { word: 'confuse', phonetic: '/kənˈfjuːz/', gloss: 'v. 使困惑', example: 'The question confused the whole class.' },
    { word: 'connection', phonetic: '/kəˈnekʃn/', gloss: 'n. 联系；连接', example: 'There is a close connection between the two events.' },
    { word: 'conscious', phonetic: '/ˈkɒnʃəs/', gloss: 'adj. 意识到的；有意识的', example: 'He was conscious of his mistake.' },
    { word: 'consider', phonetic: '/kənˈsɪdə(r)/', gloss: 'v. 考虑；认为', example: 'Please consider my suggestion.' },
    { word: 'content', phonetic: '/ˈkɒntent/', gloss: 'n. 内容 adj. 满足的', example: 'The content of the essay is rich.' },
    { word: 'convenient', phonetic: '/kənˈviːniənt/', gloss: 'adj. 方便的', example: 'Is Tuesday convenient for you?' },
    { word: 'culture', phonetic: '/ˈkʌltʃə(r)/', gloss: 'n. 文化', example: 'Language is part of culture.' },
    { word: 'curious', phonetic: '/ˈkjʊəriəs/', gloss: 'adj. 好奇的', example: 'Children are curious about everything.' },
    { word: 'decision', phonetic: '/dɪˈsɪʒn/', gloss: 'n. 决定', example: 'It was a hard decision to make.' },
    { word: 'describe', phonetic: '/dɪˈskraɪb/', gloss: 'v. 描述', example: 'Can you describe what you saw?' },
    { word: 'effort', phonetic: '/ˈefət/', gloss: 'n. 努力', example: 'Great effort leads to progress.' },
    { word: 'embarrass', phonetic: '/ɪmˈbærəs/', gloss: 'v. 使尴尬', example: 'Don’t embarrass him in public.' },
    { word: 'encourage', phonetic: '/ɪnˈkʌrɪdʒ/', gloss: 'v. 鼓励', example: 'Teachers encourage students to ask questions.' },
    { word: 'exactly', phonetic: '/ɪɡˈzæktli/', gloss: 'adv. 恰好；正是', example: 'That’s exactly what I meant.' },
  ],
});
