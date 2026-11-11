// 学习模式 · 课程内容包（P1）：场景卡 / 语法点目录（预写讲解）/ 分级范文。
// 全部离线预写、随应用分发——LLM 只做「归因到语法点」「按模板补例句」「AI 收词」，
// 不允许现场编教学内容（方案 §2.4：语法规则预写内置）。

// 场景内容单独维护在 ./scenes.ts，保证「课程 → 场景」的内容包不被语法/阅读数据淹没。
export {
  SCENE_CARDS, listSceneCards, getSceneCard, renderScenePrompt,
  type SceneCard, type SceneCardView, type SceneGuide, type SceneLevel,
} from './scenes.js';

// ── 语法点目录（P1 首版 24 点起步，覆盖最高频痛点；目录可下载扩充） ─────────────
// 每点内容离线预写：rule 一句话规则 / examples 正例（en+zh）/ pairs 正误对照 / errors 常见错误

export type GrammarPoint = {
  id: string;
  title: string;
  cefr: string;
  group: string;   // 时态 / 从句 / 非谓语 / 冠词介词 / 句型
  rule: string;
  examples: Array<{ en: string; zh: string }>;
  pairs: Array<{ wrong: string; right: string; why: string }>;
};

export const GRAMMAR_POINTS: GrammarPoint[] = [
  { id: 'g_present_simple', title: '一般现在时', cefr: 'A1', group: '时态', rule: '习惯、事实、常态用 do/does；第三人称单数动词加 -s/-es。', examples: [{ en: 'She works from home on Fridays.', zh: '她周五在家办公。' }, { en: 'Water boils at 100°C.', zh: '水在 100°C 沸腾。' }], pairs: [{ wrong: 'He go to school by bus.', right: 'He goes to school by bus.', why: '第三人称单数动词必须加 -es。' }] },
  { id: 'g_present_cont', title: '现在进行时', cefr: 'A1', group: '时态', rule: '此刻正在发生：am/is/are + doing；不和 know/like 等状态动词连用。', examples: [{ en: 'I’m reading a great novel these days.', zh: '我最近在读一本很棒的小说。' }], pairs: [{ wrong: 'I am knowing the answer.', right: 'I know the answer.', why: 'know 是状态动词，不用进行时。' }] },
  { id: 'g_past_simple', title: '一般过去时', cefr: 'A1', group: '时态', rule: '过去某个明确时间发生的动作，用动词过去式；否定/疑问用 did + 动词原形。', examples: [{ en: 'We moved to this city in 2020.', zh: '我们 2020 年搬来这座城市。' }], pairs: [{ wrong: 'I didn’t went to the party.', right: 'I didn’t go to the party.', why: 'did 已经承载过去时，后面用原形。' }] },
  { id: 'g_present_perfect', title: '现在完成时', cefr: 'A2', group: '时态', rule: '过去发生、影响现在：have/has + 过去分词；**不能**与明确的过去时间点连用。', examples: [{ en: 'I’ve finished the report.', zh: '我已经写完报告了（所以现在能交）。' }], pairs: [{ wrong: 'I have seen him yesterday.', right: 'I saw him yesterday.', why: 'yesterday 是明确过去时间，必须用过去时。' }] },
  { id: 'g_past_perfect', title: '过去完成时', cefr: 'B1', group: '时态', rule: '「过去的过去」：had + 过去分词，表示在过去某点之前已完成。', examples: [{ en: 'The train had left when we arrived.', zh: '我们到时火车已经开走了。' }], pairs: [{ wrong: 'When I arrived, the train already left.', right: 'When I arrived, the train had already left.', why: '“开走”发生在“到达”之前，要用过去完成时。' }] },
  { id: 'g_future_will', title: '将来时 will / be going to', cefr: 'A2', group: '时态', rule: '临时决定用 will；先前计划或证据明显用 be going to。', examples: [{ en: 'I’ll get the door!', zh: '我去开门！（话音未落的临时决定）' }, { en: 'It’s going to rain—look at those clouds.', zh: '要下雨了——看那云（有证据）。' }], pairs: [{ wrong: 'I will to call you later.', right: 'I will call you later.', why: 'will 后面直接跟动词原形。' }] },
  { id: 'g_present_3rd', title: '第三人称单数 -s', cefr: 'A1', group: '时态', rule: '一般现在时里 he/she/it 后动词加 -s/-es（goes, watches, studies）。', examples: [{ en: 'My brother watches the news every night.', zh: '我弟弟每晚看新闻。' }], pairs: [{ wrong: 'She like coffee.', right: 'She likes coffee.', why: '第三人称单数漏 -s 是中文母语者最高频错误之一。' }] },
  { id: 'g_count_uncount', title: '可数与不可数名词', cefr: 'A2', group: '句型', rule: 'information/advice/furniture/news 等不可数：不加 -s、不用 a/an、用 much/some。', examples: [{ en: 'She gave me some useful advice.', zh: '她给了我一些有用的建议。' }], pairs: [{ wrong: 'I need some informations.', right: 'I need some information.', why: 'information 不可数，没有复数。' }] },
  { id: 'g_articles', title: '冠词 a/an/the', cefr: 'A1', group: '冠词介词', rule: '泛指首次提到用 a/an；特指双方都知道的用 the；泛指复数/不可数可零冠词。', examples: [{ en: 'I bought a laptop. The laptop is light.', zh: '我买了台笔记本（首次 a），这台很轻（特指 the）。' }], pairs: [{ wrong: 'I love the music.', right: 'I love music.', why: '泛指“音乐”这一类事物时不加 the。' }] },
  { id: 'g_prepositions_time', title: '时间介词 in/on/at', cefr: 'A1', group: '冠词介词', rule: 'at + 时刻（at 7）、on + 日期/星期（on Monday）、in + 月/年/段（in May）。', examples: [{ en: 'The meeting is at 3 p.m. on Friday in June.', zh: '会议在六月某个周五下午 3 点。' }], pairs: [{ wrong: 'See you in Monday.', right: 'See you on Monday.', why: '星期前用 on。' }] },
  { id: 'g_modals', title: '情态动词 can/must/should', cefr: 'A2', group: '句型', rule: '情态动词后跟原形，无人称变化；否定直接加 not。', examples: [{ en: 'You should double-check the numbers.', zh: '你应该复核一下数字。' }], pairs: [{ wrong: 'He can to swim.', right: 'He can swim.', why: 'can 后不接 to。' }] },
  { id: 'g_comparatives', title: '比较级与最高级', cefr: 'A2', group: '句型', rule: '短词加 -er/-est，长词用 more/most；两者比较用 than；三者取一用 the + 最高级。', examples: [{ en: 'This route is faster than that one.', zh: '这条路比那条快。' }], pairs: [{ wrong: 'This is more better.', right: 'This is better.', why: 'better 本身就是比较级，不能再加 more。' }] },
  { id: 'g_conditionals', title: '条件句（if 三型）', cefr: 'B1', group: '从句', rule: '一型真实条件 if+现在/will；二型虚拟现在 if+过去/would；三型虚拟过去 if+had done/would have done。', examples: [{ en: 'If I were you, I’d take the offer.', zh: '我要是你就接受这个提议（对现在的虚拟）。' }], pairs: [{ wrong: 'If I will have time, I’ll help.', right: 'If I have time, I’ll help.', why: 'if 从句用现在时表将来，不放 will。' }] },
  { id: 'g_passive', title: '被动语态', cefr: 'B1', group: '句型', rule: 'be + 过去分词；不知道或不必说施动者时用。', examples: [{ en: 'The package was delivered this morning.', zh: '包裹今早送到了。' }], pairs: [{ wrong: 'The report was wrote by her.', right: 'The report was written by her.', why: '被动要接过去分词，不是过去式。' }] },
  { id: 'g_relative', title: '定语从句 which/that/who', cefr: 'B1', group: '从句', rule: '人用 who，物用 which/that；作从句宾语时可以省略关系词。', examples: [{ en: 'The book (that) I borrowed was great.', zh: '我借的那本书很棒（that 作宾语可省）。' }], pairs: [{ wrong: 'The man which called you is my boss.', right: 'The man who called you is my boss.', why: '指人用 who，不用 which。' }] },
  { id: 'g_gerund_inf', title: '动名词 vs 不定式', cefr: 'B1', group: '非谓语', rule: 'enjoy/finish/mind + doing；decide/want/hope + to do；remember/forget 两者意义不同。', examples: [{ en: 'I remember locking the door.', zh: '我记得锁过门了（已发生）。' }, { en: 'Remember to lock the door.', zh: '记得要锁门（还没做）。' }], pairs: [{ wrong: 'I enjoy to read.', right: 'I enjoy reading.', why: 'enjoy 后必须接动名词。' }] },
  { id: 'g_inf_purpose', title: '不定式表目的', cefr: 'A2', group: '非谓语', rule: '「为了…」用 to do 或 in order to；for 后接名词不接动词。', examples: [{ en: 'I called to confirm the booking.', zh: '我打电话是为了确认预订。' }], pairs: [{ wrong: 'I came here for learn English.', right: 'I came here to learn English.', why: 'for 后接名词；动词目的用 to do。' }] },
  { id: 'g_there_be', title: 'there be 句型', cefr: 'A1', group: '句型', rule: '「有」用 there is/are，就近原则；不要和 have 混用。', examples: [{ en: 'There are two cafés near my office.', zh: '我办公室附近有两家咖啡馆。' }], pairs: [{ wrong: 'The street has many shops.（中式）', right: 'There are many shops on the street.', why: '“某地有某物”英语惯用 there be。' }] },
  { id: 'g_questions', title: '疑问句语序', cefr: 'A1', group: '句型', rule: '疑问词 + 助动词 + 主语 + 动词原形；无 be/情态动词时借助 do/does/did。', examples: [{ en: 'Where does she work?', zh: '她在哪儿上班？' }], pairs: [{ wrong: 'Where she works?', right: 'Where does she work?', why: '特殊疑问句必须把助动词提到主语前。' }] },
  { id: 'g_tag_questions', title: '反义疑问句', cefr: 'B1', group: '句型', rule: '前肯后否、前否后肯；尾句用助动词/be。', examples: [{ en: 'You’ve been here before, haven’t you?', zh: '你来过这儿，对吧？' }], pairs: [{ wrong: 'He is a doctor, isn’t it?', right: 'He is a doctor, isn’t he?', why: '尾句代词要和主语一致（he）。' }] },
  { id: 'g_used_to', title: 'used to / be used to', cefr: 'B1', group: '句型', rule: 'used to do = 过去常常（现在不了）；be used to doing = 习惯于。', examples: [{ en: 'I used to live in Chengdu.', zh: '我以前住成都。' }, { en: 'I’m used to spicy food.', zh: '我习惯吃辣。' }], pairs: [{ wrong: 'I am used to live alone.', right: 'I am used to living alone.', why: 'be used to 后接动名词。' }] },
  { id: 'g_reported', title: '间接引语', cefr: 'B1', group: '从句', rule: '转述时态后移（said (that) he was...），人称/时间词跟着换。', examples: [{ en: 'She said (that) she was busy that day.', zh: '她说她那天很忙。' }], pairs: [{ wrong: 'He said me he was tired.', right: 'He told me he was tired.', why: 'say 不带间接宾语；“对我说”用 told me 或 said to me。' }] },
  { id: 'g_so_such', title: 'so / such', cefr: 'B1', group: '句型', rule: 'so + 形容词（so good）；such + 名词短语（such a good idea）。', examples: [{ en: 'The view was so beautiful. / It was such a beautiful view.', zh: '景色太美了。' }], pairs: [{ wrong: 'It was so a good idea.', right: 'It was such a good idea.', why: 'so 不能直接修饰名词短语。' }] },
  { id: 'g_either_neither', title: 'either / neither / both', cefr: 'B1', group: '句型', rule: 'either 二选一；neither 两者都不（动词单数）；both 两者都。', examples: [{ en: 'Neither answer is correct.', zh: '两个答案都不对。' }], pairs: [{ wrong: 'Neither of them are coming.', right: 'Neither of them is coming.', why: 'neither 作主语按单数处理（口语可放宽，书面从严）。' }] },
];

// ── 分级范文（P1 内置 8 篇：4 篇 A2 + 4 篇 B1；en/zh 段落逐段对齐） ────────────

export type ReadingPassage = {
  id: string;
  title: string;
  cefr: string;
  topic: string;
  paras: Array<{ en: string; zh: string }>;
};

export const READING_PASSAGES: ReadingPassage[] = [
  {
    id: 'rp_morning_a2', title: 'A Quiet Morning', cefr: 'A2', topic: '日常生活',
    paras: [
      { en: 'Every morning, Li Wei wakes up at six thirty. He opens the window and listens to the birds for a few minutes.', zh: '每天早上，李伟六点半醒来。他打开窗户，听几分钟鸟叫。' },
      { en: 'Then he makes a cup of tea and reads the news on his phone. He doesn’t check work messages before seven.', zh: '然后他泡一杯茶，用手机看看新闻。七点之前他不看工作消息。' },
      { en: '“A quiet hour makes a good day,” he always says. His friends laugh at him, but they all agree he is the calmest person they know.', zh: '“安静的一小时带来好的一天。”他总是这么说。朋友们笑他，但都承认他是他们认识的最平静的人。' },
    ],
  },
  {
    id: 'rp_cafe_a2', title: 'The Little Café', cefr: 'A2', topic: '故事',
    paras: [
      { en: 'There is a small café near the train station. It has only six tables, but the coffee is the best in town.', zh: '火车站附近有一家小咖啡馆。只有六张桌子，但咖啡是全镇最好的。' },
      { en: 'The owner, Mr. Chen, knows everyone’s name. If you don’t come for a week, he asks where you have been.', zh: '老板陈先生知道每个人的名字。你要是一周没来，他会问你去哪儿了。' },
      { en: 'Last winter, the café almost closed. But all the neighbors came together and ordered coffee every day until spring. It is still open today.', zh: '去年冬天，咖啡馆差点关门。但邻居们每天都来买咖啡，一直撑到春天。它今天还开着。' },
    ],
  },
  {
    id: 'rp_email_a2', title: 'Writing a Simple Work Email', cefr: 'A2', topic: '职场',
    paras: [
      { en: 'A good work email is short and clear. Start with one sentence that says why you are writing.', zh: '一封好的工作邮件要短而清楚。第一句就说明你为什么写。' },
      { en: 'For example: “I’m writing to confirm tomorrow’s meeting.” Then give the details: time, place, and what the reader should do.', zh: '比如：“写邮件是为了确认明天的会议。”然后给出细节：时间、地点、对方要做什么。' },
      { en: 'End with a polite line like “Looking forward to your reply.” Long emails are like long meetings—nobody finishes them happily.', zh: '结尾用一句客气话，如“期待你的回复”。长邮件就像长会议——没人能愉快地看完。' },
    ],
  },
  {
    id: 'rp_bus_a2', title: 'On the Bus', cefr: 'A2', topic: '日常生活',
    paras: [
      { en: 'The number 12 bus is always crowded at eight in the morning. People stand close to each other and look at their phones.', zh: '12 路公交早上八点总是很挤。人们挨得很近，低头看手机。' },
      { en: 'Yesterday, an old woman got on with two heavy bags. A young man stood up immediately and offered her his seat.', zh: '昨天，一位老奶奶提着两个重袋子上了车。一个小伙子立刻起身让座。' },
      { en: 'She smiled and said, “Thank you, young man.” Everyone around them smiled too. Small kindness travels fast on a crowded bus.', zh: '她笑着说：“谢谢你，小伙子。”周围的人也笑了。小小的善意在拥挤的车厢里传播得很快。' },
    ],
  },
  {
    id: 'rp_interview_b1', title: 'How to Answer “Tell Me About Yourself”', cefr: 'B1', topic: '面试',
    paras: [
      { en: 'This question is not about your life story. The interviewer wants a two-minute summary that connects your past to this job.', zh: '这个问题不是让你讲人生故事。面试官想要一段两分钟的概述，把你的过去和这份工作连起来。' },
      { en: 'A simple structure works: where you are now, one or two achievements with numbers, and why this role fits you.', zh: '一个简单的结构：你现在做什么、一两个带数字的成绩、为什么这个岗位适合你。' },
      { en: 'Practice it out loud until it sounds natural, not memorized. And never end with “So… that’s about it.” Always finish with why you are excited about this company.', zh: '练习到听起来自然而不是背稿。结尾永远不要用“大概就这样”，要落在这家公司为什么让你兴奋。' },
    ],
  },
  {
    id: 'rp_travel_b1', title: 'The Delayed Flight', cefr: 'B1', topic: '旅行',
    paras: [
      { en: 'Our flight was delayed for six hours. Some passengers shouted at the staff, but that changed nothing.', zh: '我们的航班延误了六个小时。有些乘客冲工作人员喊叫，但毫无用处。' },
      { en: 'Instead, a woman in a red coat walked to the counter, explained the situation calmly, and asked what options were available.', zh: '一位穿红外套的女士走到柜台，冷静地说明情况，问有哪些可选方案。' },
      { en: 'Twenty minutes later, she came back with meal vouchers and a hotel booking for the night. Being polite is not weak—it is the fastest way to get things done.', zh: '二十分钟后，她拿着餐券和当晚的酒店订单回来了。礼貌不是软弱——它是把事情办成的最快方式。' },
    ],
  },
  {
    id: 'rp_habit_b1', title: 'Why Small Habits Win', cefr: 'B1', topic: '学习方法',
    paras: [
      { en: 'Most people fail at learning English not because the goal is too big, but because the first step is too big.', zh: '大多数人学英语失败，不是因为目标太大，而是因为第一步太大。' },
      { en: '“Study for one hour every day” sounds great and lasts about four days. “Learn five words with breakfast” sounds tiny—and lasts for years.', zh: '“每天学习一小时”听着很棒，大概能坚持四天。“早饭时记五个单词”听着很小——却能坚持几年。' },
      { en: 'Make the first step so small that saying no feels silly. Motivation gets you started; systems keep you going.', zh: '把第一步做得小到“说不”都显得可笑。动机让你开始，系统让你继续。' },
    ],
  },
  {
    id: 'rp_city_b1', title: 'A City That Never Sleeps', cefr: 'B1', topic: '城市',
    paras: [
      { en: 'At two in the morning, most cities are asleep. This one is not. Taxi drivers argue about football, noodle shops steam, and office lights stay on.', zh: '凌晨两点，大多数城市睡着了。这座城市没有。出租车司机在争论足球，面馆冒着热气，写字楼的灯还亮着。' },
      { en: 'Some people say a city like this is exhausting. Others say it is alive in a way that quiet places never are.', zh: '有人说这样的城市让人疲惫。也有人说它有一种安静城市永远没有的活力。' },
      { en: 'Maybe both are true. The city doesn’t choose for you. You decide whether it is noise or energy.', zh: '也许都对。城市不替你选择。它到底是噪音还是能量，由你决定。' },
    ],
  },
  {
    id: 'rp_noodles_a1', title: 'A Bowl of Noodles', cefr: 'A1', topic: '日常生活',
    paras: [
      { en: 'Anna comes home late on Friday. She is tired and does not want to cook.', zh: '安娜周五很晚回家。她很累，不想做饭。' },
      { en: 'She walks to a small noodle shop near her home. The owner smiles and asks, “The usual?” Anna nods.', zh: '她走到家附近的一家小面馆。老板笑着问：“还是老样子？”安娜点点头。' },
      { en: 'Ten minutes later, she eats hot noodles and feels much better. Sometimes a simple meal is all you need.', zh: '十分钟后，她吃着热腾腾的面，感觉好多了。有时候，一顿简单的饭就足够了。' },
    ],
  },
  {
    id: 'rp_umbrella_a2', title: 'The Lost Umbrella', cefr: 'A2', topic: '故事',
    paras: [
      { en: 'It was raining hard when Mei left the library. She reached for her umbrella, but it was not there.', zh: '梅离开图书馆时雨下得很大。她伸手去拿伞，却发现伞不见了。' },
      { en: 'A library worker found a blue umbrella behind a chair. “Is this yours?” she asked. Mei shook her head, but she took it with her.', zh: '一位图书馆工作人员在椅子后面找到一把蓝伞。“这是你的吗？”她问。梅摇摇头，但还是把伞带上了。' },
      { en: 'The next day, Mei returned the umbrella and left a note: “Thank you to whoever left this here.” A small act can help a stranger more than we expect.', zh: '第二天，梅把伞还了回去，并留了一张纸条：“谢谢把伞留在这里的人。”一个小小的举动，可能比我们想象中更能帮助陌生人。' },
    ],
  },
  {
    id: 'rp_work_people_b1', title: 'Working With People You Do Not Like', cefr: 'B1', topic: '职场',
    paras: [
      { en: 'You do not have to like every colleague to work well with them. In fact, expecting every relationship to feel friendly can make office problems harder to solve.', zh: '你不需要喜欢每一位同事才能合作。事实上，期待每段关系都像朋友一样，反而会让办公室问题更难解决。' },
      { en: 'Focus on the task, not the personality. Clarify what each person will deliver, when it is due, and how decisions will be made.', zh: '把重点放在任务而不是性格上。明确每个人交付什么、什么时候完成，以及决定如何做出。' },
      { en: 'Politeness is not fake. It is a professional tool that keeps communication open when personal chemistry is missing.', zh: '礼貌不是虚伪。它是一种职业工具，在彼此没有默契时仍能让沟通继续。' },
    ],
  },
  {
    id: 'rp_reading_list_b1', title: 'Why I Keep a Reading List', cefr: 'B1', topic: '学习方法',
    paras: [
      { en: 'I used to finish one book and then spend two weeks deciding what to read next. My reading slowed down, not because I lacked interest, but because I kept making the same small decision again.', zh: '我以前读完一本书，会花两周想下一本读什么。阅读变慢，不是因为没兴趣，而是因为总在重复做同一个小的决定。' },
      { en: 'Now I keep a short list of three books: one easy, one challenging, and one that has nothing to do with work. The list gives me direction without turning reading into another task.', zh: '现在我会保留一个三本书的小清单：一本轻松，一本有挑战，一本与工作完全无关。清单给我方向，却没把阅读变成又一项任务。' },
      { en: 'The goal is not to read more than everyone else. It is to make the next good choice easier.', zh: '目标不是读得比所有人都多，而是让下一个好选择更容易做出来。' },
    ],
  },
  {
    id: 'rp_morning_city_b2', title: 'The City at Six in the Morning', cefr: 'B2', topic: '城市',
    paras: [
      { en: 'At six in the morning, a city shows a version of itself that office workers rarely notice. Delivery vans occupy the empty roads, cleaners wash the pavement, and bakery lights come on one window at a time.', zh: '清晨六点，城市会显露一个上班族很少注意到的版本。货车占据空旷的道路，清洁工冲洗人行道，面包店的灯一扇窗一扇窗地亮起来。' },
      { en: 'This early hour feels less like a pause and more like preparation. The city is not resting; it is quietly arranging itself for the people who will soon arrive.', zh: '这个清晨时刻与其说是暂停，不如说是准备。城市没有休息，它只是在安静地为即将到来的人们整理自己。' },
      { en: 'Walking through it can change how you see the same streets later in the day. A crowded place becomes easier to understand once you have seen it empty.', zh: '在这样的清晨走过城市，会改变你白天看同一条街的方式。一旦见过它空下来的样子，拥挤的地方也更容易理解。' },
    ],
  },
  {
    id: 'rp_technology_patience_b2', title: 'Can Technology Make Us More Patient?', cefr: 'B2', topic: '观点',
    paras: [
      { en: 'Technology is often blamed for making us impatient. We expect instant replies, same-day delivery, and answers within seconds. Yet the same tools can also teach patience when they are designed well.', zh: '科技常被指责让人更没耐心。我们期待即时回复、当日送达和几秒内得到答案。但设计得当的话，同样的工具也能教会我们耐心。' },
      { en: 'A language app that shows steady progress can make daily practice feel worthwhile. A recipe app that explains why dough needs time can turn waiting into understanding rather than wasted time.', zh: '一个展示稳定进步的语言应用，会让每日练习显得值得。一个解释面团为何需要时间的食谱应用，也能把等待变成理解，而不是浪费时间。' },
      { en: 'The question is not whether technology makes us patient or impatient. It is whether we use it to hide from effort or to understand why effort takes time.', zh: '问题不在于科技让我们更有耐心还是更没耐心，而在于我们是用它逃避投入，还是理解为什么投入需要时间。' },
    ],
  },
];

// ── 语法点第二批（P1 扩充至 40：覆盖中文母语者中高频痛点） ─────────────────────
GRAMMAR_POINTS.push(
  { id: 'g_past_cont', title: '过去进行时', cefr: 'A2', group: '时态', rule: '过去某时正在发生：was/were + doing；常与 when/while 连用。', examples: [{ en: 'I was cooking when he called.', zh: '他打电话时我正在做饭。' }], pairs: [{ wrong: 'I cooked when he called.', right: 'I was cooking when he called.', why: '“正在做”要用进行时，一般过去时表达不了“进行中”。' }] },
  { id: 'g_freq_adv', title: '频率副词的位置', cefr: 'A1', group: '句型', rule: 'always/usually/often 放在实义动词**前**、be 动词**后**。', examples: [{ en: 'She often works late.', zh: '她常工作到很晚。' }, { en: 'He is always late.', zh: '他总是迟到。' }], pairs: [{ wrong: 'She works often late.', right: 'She often works late.', why: '频率副词紧跟主语之后、实义动词之前。' }] },
  { id: 'g_ing_ed', title: '-ing / -ed 形容词', cefr: 'B1', group: '非谓语', rule: '-ing 修饰事物（令人…），-ed 修饰人的感受（感到…）。', examples: [{ en: 'The film was boring. I was bored.', zh: '电影很无聊（boring）；我感到无聊（bored）。' }], pairs: [{ wrong: 'I was very boring at the party.', right: 'I was very bored at the party.', why: '形容人的感受用 -ed；“我很无趣”才用 boring。' }] },
  { id: 'g_too_enough', title: 'too / enough', cefr: 'A2', group: '句型', rule: 'too + 形容词（太…而不能）；形容词 + enough（足够…）；enough 修饰名词放前面。', examples: [{ en: 'It’s too cold to swim. / He isn’t old enough.', zh: '太冷不能游泳；他年纪还不够。' }], pairs: [{ wrong: 'He isn’t enough old.', right: 'He isn’t old enough.', why: 'enough 修饰形容词时必须后置。' }] },
  { id: 'g_as_as', title: 'as ... as 同级比较', cefr: 'A2', group: '句型', rule: 'as + 原级 + as（和…一样）；否定 not as/so ... as。', examples: [{ en: 'She is as tall as her brother.', zh: '她和哥哥一样高。' }], pairs: [{ wrong: 'He is as taller as me.', right: 'He is as tall as me.', why: 'as...as 中间用形容词原级。' }] },
  { id: 'g_make_let', title: '使役动词 make/let/help', cefr: 'B1', group: '非谓语', rule: 'make/let + 宾语 + 动词原形；help 后原形或 to do 均可；被动语态要还原 to。', examples: [{ en: 'She made me laugh.', zh: '她让我笑了。' }, { en: 'I was made to wait.', zh: '我被迫等了（被动要加 to）。' }], pairs: [{ wrong: 'He let me to go.', right: 'He let me go.', why: 'let 后接原形，不接 to do。' }] },
  { id: 'g_spend_cost', title: 'spend / cost / pay / take', cefr: 'A2', group: '句型', rule: '人 spend 时间/钱 on/doing；物 cost 人钱；人 pay 钱 for 物；it takes 人时间 to do。', examples: [{ en: 'I spent two hours on this report.', zh: '这份报告花了我两小时。' }], pairs: [{ wrong: 'This book cost me fifty yuan to buy it.', right: 'This book cost me fifty yuan.', why: 'cost 本身已含“买”，不能再加 to buy it。' }] },
  { id: 'g_few_little', title: 'few / a few / little / a little', cefr: 'B1', group: '句型', rule: 'few/a few 修饰可数，little/a little 修饰不可数；带 a=有一点（肯定），不带=几乎没有（否定）。', examples: [{ en: 'I have a few friends here. / I have few friends here.', zh: '我在这儿有几个朋友（还好）；我在这儿几乎没朋友（凄凉）。' }], pairs: [{ wrong: 'There is a little water bottles here.', right: 'There are a few water bottles here.', why: '可数名词用 few，不用 little。' }] },
  { id: 'g_look_forward', title: 'look forward to + doing', cefr: 'B1', group: '非谓语', rule: 'to 在这里是介词：look forward to doing / be used to doing / object to doing。', examples: [{ en: 'I look forward to hearing from you.', zh: '期待你的回信（邮件标准结尾）。' }], pairs: [{ wrong: 'I look forward to hear from you.', right: 'I look forward to hearing from you.', why: 'to 是介词，后面接动名词。' }] },
  { id: 'g_borrow_lend', title: 'borrow / lend / keep', cefr: 'A2', group: '句型', rule: 'borrow…from（借入）；lend…to（借出）；借多久用 keep（borrow 是瞬间动词）。', examples: [{ en: 'I borrowed a book from the library and kept it for two weeks.', zh: '我从图书馆借了本书，保留了两周。' }], pairs: [{ wrong: 'I have borrowed this book for two weeks.', right: 'I have kept this book for two weeks.', why: 'borrow 是瞬间动作，不能与一段时间连用。' }] },
  { id: 'g_conjunctions', title: '状语从句连词', cefr: 'B1', group: '从句', rule: 'because/so 不同时出现；although/but 也不同时出现——英语一句话只留一个。', examples: [{ en: 'Although it was late, we kept working.', zh: '虽然很晚了，我们仍在干（不加大写 but）。' }], pairs: [{ wrong: 'Because he was tired, so he slept.', right: 'Because he was tired, he slept.', why: 'because 和 so 不能成对出现（中式连词）。' }] },
  { id: 'g_ordinals', title: '序数词与日期', cefr: 'A2', group: '句型', rule: '第几用序数词（the first/second/third），日期口语序数、书写数字加后缀（May 1st）。', examples: [{ en: 'This is my first time here.', zh: '这是我第一次来。' }], pairs: [{ wrong: 'It’s my firstly time.', right: 'It’s my first time.', why: '修饰名词要用序数词 first，不是副词 firstly。' }] },
  { id: 'g_wish_hope', title: 'hope / wish', cefr: 'B1', group: '句型', rule: 'hope + to do/that（可能实现）；wish + 过去式/过去完成（虚拟，难实现）；wish to do 是正式的“想要”。', examples: [{ en: 'I hope you pass. / I wish I passed.', zh: '希望你通过（现实）；我要是过了就好了（虚拟）。' }], pairs: [{ wrong: 'I wish you will succeed.', right: 'I hope you succeed.', why: '可实现的祝愿用 hope，wish 要接虚拟语气。' }] },
  { id: 'g_passive_modals', title: '情态动词被动式', cefr: 'B1', group: '句型', rule: 'must/can/should + be + 过去分词。', examples: [{ en: 'The form must be signed today.', zh: '表格今天必须签好。' }], pairs: [{ wrong: 'The form must signed today.', right: 'The form must be signed today.', why: '被动不能漏掉 be 动词。' }] },
  { id: 'g_there_will', title: 'there be 的将来与情态', cefr: 'A2', group: '句型', rule: 'there will be / there must be——there 后接 be 原形，不接 have。', examples: [{ en: 'There will be a storm tonight.', zh: '今晚会有暴风雨。' }], pairs: [{ wrong: 'There will have a meeting.', right: 'There will be a meeting.', why: '“将有”是 there will be，不是 there will have。' }] },
  { id: 'g_adv_adj', title: '形容词 vs 副词', cefr: 'A2', group: '句型', rule: '修饰名词用形容词，修饰动词用副词（-ly）；感官动词（look/sound/feel）后用形容词。', examples: [{ en: 'She sings beautifully. / The soup tastes good.', zh: '她唱得美（副词）；汤尝起来好（形容词）。' }], pairs: [{ wrong: 'The music sounds sweetly.', right: 'The music sounds sweet.', why: 'sound 是感官动词，后接形容词。' }] },
  { id: 'g_irregular_verbs', title: '不规则动词三态', cefr: 'A2', group: '时态', rule: '按「原形 — 过去式 — 过去分词」整组记：go-went-gone、see-saw-seen；完成时和被动语态用第三列。', examples: [{ en: 'I went home early, but I had already finished my work.', zh: '我很早回家，但当时已经完成工作了。' }], pairs: [{ wrong: 'I have went there before.', right: 'I have gone there before.', why: 'have 后接过去分词 gone，不能用过去式 went。' }] },
  { id: 'g_plural_nouns', title: '名词复数与分类记法', cefr: 'A1', group: '词法', rule: '一般加 -s；以 s/x/ch/sh 结尾加 -es；辅音字母+y 变 ies；不规则复数单独背。', examples: [{ en: 'The child has two mice and three sheep.', zh: '这个孩子有两只老鼠和三只羊。' }], pairs: [{ wrong: 'There are three sheeps.', right: 'There are three sheep.', why: 'sheep 单复数同形，不加 -s。' }] },
);

// ── 课程学段目录（用户拍板：字母音标 → 初中 → 高中 → 四六级 → 雅思托福） ──────────
// 每门课一本内置示例词书（本课 40 词起步）；完整词书走「词书库 URL 导入」补充。
// 排序即建议学程；跨课程不做硬锁（硬锁留在书内关卡），进度条引导按序进阶。

export type CourseStage = '启蒙' | '必背专题' | '初中' | '高中' | '大学' | '出国';
export type LearningCourseStage = CourseStage | '软考' | '网络安全';

/** 科目清单（扩展点）：以后加日语/数学/物理 = 往这里加一项 + 往 COURSE_CATALOG 加对应 subject 的课程 */
export const LEARNING_SUBJECTS = [
  { key: '英语', label: '英语', ready: true },
  { key: '软考', label: '软考', ready: true },
  { key: '网络安全', label: '网络安全', ready: true },
  { key: '日语', label: '日语', ready: false },
  { key: '数学', label: '数学', ready: false },
  { key: '物理', label: '物理', ready: false },
] as const;

export type CourseDef = {
  id: string;
  name: string;
  stage: LearningCourseStage;
  /** 科目归属（按科目过滤课程地图；当前全部英语） */
  subject: string;
  kind?: 'vocab' | 'exam' | 'security';
  bookId?: string;
  examLevel?: '中级' | '高级';
  examSpecialty?: string;
  securityPathId?: string;
};

export const COURSE_CATALOG: CourseDef[] = [
  { id: 'course_letters', name: '字母与音标', subject: '英语', stage: '启蒙', bookId: 'wb_letters_sample' },
  { id: 'course_verbs', name: '动词全本', subject: '英语', stage: '必背专题', bookId: 'wb_verbs_all' },
  { id: 'course_nouns', name: '名词分类', subject: '英语', stage: '必背专题', bookId: 'wb_nouns_all' },
  { id: 'course_nature', name: '动植物分类', subject: '英语', stage: '必背专题', bookId: 'wb_nature_all' },
  { id: 'course_objects', name: '生活物品', subject: '英语', stage: '必背专题', bookId: 'wb_daily_objects' },
  { id: 'course_food', name: '食物与饮品', subject: '英语', stage: '必背专题', bookId: 'wb_food_drink' },
  { id: 'course_body', name: '身体与健康', subject: '英语', stage: '必背专题', bookId: 'wb_body_health' },
  { id: 'course_spoken', name: '口语高频句', subject: '英语', stage: '必背专题', bookId: 'wb_spoken_phrases' },
  { id: 'course_idioms', name: '英语习语', subject: '英语', stage: '必背专题', bookId: 'wb_english_idioms' },
  { id: 'course_tenses', name: '时态必背', subject: '英语', stage: '必背专题', bookId: 'wb_tense_essentials' },
  { id: 'course_junior1', name: '初一', subject: '英语', stage: '初中', bookId: 'wb_junior1_sample' },
  { id: 'course_junior2', name: '初二', subject: '英语', stage: '初中', bookId: 'wb_junior2_sample' },
  { id: 'course_junior3', name: '初三', subject: '英语', stage: '初中', bookId: 'wb_junior3_sample' },
  { id: 'course_senior1', name: '高一', subject: '英语', stage: '高中', bookId: 'wb_senior1_sample' },
  { id: 'course_senior2', name: '高二', subject: '英语', stage: '高中', bookId: 'wb_senior2_sample' },
  { id: 'course_gaokao', name: '高三 · 高考冲刺', subject: '英语', stage: '高中', bookId: 'wb_gaokao_sample' },
  { id: 'course_cet4', name: '大学英语四级', subject: '英语', stage: '大学', bookId: 'wb_cet4_sample' },
  { id: 'course_cet6', name: '大学英语六级', subject: '英语', stage: '大学', bookId: 'wb_cet6_sample' },
  { id: 'course_ielts', name: '雅思', subject: '英语', stage: '出国', bookId: 'wb_ielts_sample' },
  { id: 'course_toefl', name: '托福', subject: '英语', stage: '出国', bookId: 'wb_toefl_sample' },
  { id: 'course_soft_software_designer', name: '软件设计师', subject: '软考', stage: '软考', kind: 'exam', examLevel: '中级', examSpecialty: '软件设计师' },
  { id: 'course_soft_network_engineer', name: '网络工程师', subject: '软考', stage: '软考', kind: 'exam', examLevel: '中级', examSpecialty: '网络工程师' },
  { id: 'course_soft_system_architect', name: '系统架构设计师', subject: '软考', stage: '软考', kind: 'exam', examLevel: '高级', examSpecialty: '系统架构设计师' },
  { id: 'course_soft_system_analyst', name: '系统分析师', subject: '软考', stage: '软考', kind: 'exam', examLevel: '高级', examSpecialty: '系统分析师' },
  { id: 'course_sec_fundamentals', name: '安全基础与威胁建模', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_fundamentals' },
  { id: 'course_sec_web', name: 'Web 漏洞与攻击防御', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_web' },
  { id: 'course_sec_languages', name: '多语言安全编码', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_languages' },
  { id: 'course_sec_pentest', name: '授权渗透测试', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_pentest' },
  { id: 'course_sec_automation', name: '自动化攻防靶场', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_automation' },
  { id: 'course_sec_defense', name: '攻击防御与蓝队运营', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_defense' },
  { id: 'course_sec_devsecops', name: '安全开发与 DevSecOps', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_devsecops' },
];

export const COURSE_STAGES: LearningCourseStage[] = ['启蒙', '必背专题', '初中', '高中', '大学', '出国', '软考', '网络安全'];
