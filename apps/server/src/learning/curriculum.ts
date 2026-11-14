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
  {
    id: 'rp_fable_tortoise_a2', title: 'The Tortoise and the Hare', cefr: 'A2', topic: '寓言',
    paras: [
      { en: 'A hare laughed at a tortoise for walking so slowly. The tortoise calmly accepted the challenge to race.', zh: '野兔嘲笑乌龟走得太慢。乌龟平静地接受了赛跑挑战。' },
      { en: 'The hare ran far ahead and stopped for a nap. The tortoise kept moving, one step after another, without looking back.', zh: '野兔远远跑到前面，停下来睡午觉。乌龟一直向前，一步一步，没有回头。' },
      { en: 'When the hare woke up, the tortoise was already at the finish line. Slow and steady had won the race.', zh: '野兔醒来时，乌龟已经到达终点。慢而稳赢了比赛。' },
    ],
  },
  {
    id: 'rp_fable_north_wind_b1', title: 'The North Wind and the Sun', cefr: 'B1', topic: '寓言',
    paras: [
      { en: 'The North Wind and the Sun argued about who was stronger. They chose a traveler in a warm coat as the judge of their power.', zh: '北风和太阳争论谁更强。他们选了一位穿暖外套的旅人作为力量的裁判。' },
      { en: 'The North Wind blew as hard as he could, but the traveler held his coat tighter. Then the Sun shone gently, and the traveler soon took the coat off.', zh: '北风拼命吹，旅人却把外套裹得更紧。然后太阳温和地照耀，旅人很快脱下了外套。' },
      { en: 'Gentle persuasion achieved what force could not. The Sun had won without a single loud word.', zh: '温和的说服做到了力量做不到的事。太阳没有大声说一句话就赢了。' },
    ],
  },
  {
    id: 'rp_fable_fox_a2', title: 'The Fox and the Grapes', cefr: 'A2', topic: '寓言',
    paras: [
      { en: 'A hungry fox saw a bunch of ripe grapes hanging above him. He jumped once, twice, and many more times, but he could not reach them.', zh: '一只饥饿的狐狸看见头顶挂着一串熟葡萄。他跳了一次、两次，又跳了很多次，却够不到。' },
      { en: 'Finally, he turned away and said, “Those grapes are probably sour anyway.”', zh: '最后，他转身走开，说：“那些葡萄反正大概是酸的。”' },
      { en: 'The grapes had not changed. Only the fox’s story about them had. People still call this “sour grapes.”', zh: '葡萄没有变，变的只是狐狸对它们的说法。人们至今把这种现象叫作“酸葡萄”。' },
    ],
  },
  {
    id: 'rp_lantern_01_b1', title: 'The Lantern Keeper · Chapter 1', cefr: 'B1', topic: '长篇连载',
    paras: [
      { en: 'Every evening, Mara lit the old lantern at the top of the harbor tower. Ships used its light to find the narrow entrance between the rocks. Her father had kept the lantern for thirty years, and now the tower belonged to her.', zh: '每天晚上，玛拉都会点亮港口塔顶的旧灯笼。船只靠这盏灯找到礁石间狭窄的入口。她的父亲守了这盏灯三十年，如今灯塔归她照料。' },
      { en: 'The village had changed. Bright electric beacons now stood along the coast, and people said the old tower would close before winter. Mara still climbed the stairs each night because the northern fishing boats refused to trust the new machines.', zh: '村庄变了。明亮的电子灯塔已经立满海岸，人们说旧塔会在冬天前关闭。玛拉仍然每晚爬楼梯，因为北方渔船不肯信任新机器。' },
      { en: 'On the first cold night of October, she found a brass key beneath the lantern-room floor. It felt warm in her hand even though the room was freezing. A paper label was tied to it: “Do not light the red lamp.”', zh: '十月的第一个寒夜，她在灯笼房地板下发现一把黄铜钥匙。房间冰冷，钥匙在她手里却是温的。钥匙上系着纸签：“不要点亮红灯。”' },
      { en: 'Mara looked at the lamp above her. It had only ever burned white. She had never seen a red lamp in the tower, and for the first time in years, the quiet room felt crowded with secrets.', zh: '玛拉抬头看头顶的灯。它从来只发出白光。她从没在塔里见过红灯。多年来第一次，这间安静的房间让她觉得挤满了秘密。' },
    ],
  },
  {
    id: 'rp_fable_wolf_a2', title: 'The Boy Who Cried Wolf', cefr: 'A2', topic: '寓言',
    paras: [
      { en: 'A shepherd boy watched sheep near a village. One afternoon, he shouted, “Wolf! Wolf!” The villagers ran to help, but there was no wolf. He laughed at their worried faces.', zh: '一个牧羊男孩在村庄附近看羊。一天下午，他喊：“狼来了！”村民们跑来帮忙，却没有狼。他嘲笑他们担忧的样子。' },
      { en: 'The next day he did it again. This time the villagers were angry, but they still came. When they found no wolf, they warned him not to lie again.', zh: '第二天他又这样做。这次村民很生气，但还是来了。发现没有狼后，他们警告他不要再撒谎。' },
      { en: 'Then a real wolf appeared. The boy shouted for help, but nobody believed him. The sheep scattered, and he learned that trust is hard to rebuild once it is broken.', zh: '后来真的狼出现了。男孩大声求救，却没人相信。羊群四散，他明白了信任一旦破碎就很难重建。' },
    ],
  },
  {
    id: 'rp_fable_lion_mouse_a2', title: 'The Lion and the Mouse', cefr: 'A2', topic: '寓言',
    paras: [
      { en: 'A mouse ran across a sleeping lion and woke him. The lion caught the tiny creature under one paw. “Why should I let you go?” he asked.', zh: '一只老鼠跑过熟睡的狮子，把他吵醒了。狮子用一只爪子抓住这个小家伙，问：“我为什么要放你走？”' },
      { en: '“I may be small,” the mouse said, “but one day I could help you.” The lion laughed, yet he lifted his paw and let the mouse go.', zh: '“我虽然小，”老鼠说，“但有一天也许能帮到你。”狮子笑了，却抬起爪子放走了老鼠。' },
      { en: 'Weeks later, the lion was caught in a hunter’s net. The mouse chewed through the ropes and set him free. The lion never laughed at small kindness again.', zh: '几周后，狮子被猎人的网困住。老鼠咬断绳索救了他。狮子从此不再嘲笑微小的善意。' },
    ],
  },
  {
    id: 'rp_fable_ant_a2', title: 'The Ant and the Grasshopper', cefr: 'A2', topic: '寓言',
    paras: [
      { en: 'All summer, the ant carried food to its nest. The grasshopper sang in the sunshine and asked why the ant worked so hard.', zh: '整个夏天，蚂蚁都在往巢里搬食物。蚱蜢在阳光下唱歌，问蚂蚁为什么这么辛苦。' },
      { en: '“Winter will come,” said the ant. The grasshopper laughed. “There is plenty of time.” He kept singing while the ant kept working.', zh: '“冬天会来的，”蚂蚁说。蚱蜢笑了：“时间多着呢。”他继续唱歌，蚂蚁继续工作。' },
      { en: 'When the cold arrived, food was hard to find. The ant had enough, but the grasshopper did not. The story does not say never to enjoy life; it says prepare while the sun is still warm.', zh: '寒冬到来时，食物很难找。蚂蚁够吃，蚱蜢却没有。故事不是叫人不享受生活，而是提醒人在还有余裕时做好准备。' },
    ],
  },
  {
    id: 'rp_fable_crow_a2', title: 'The Crow and the Pitcher', cefr: 'A2', topic: '寓言',
    paras: [
      { en: 'A thirsty crow found a pitcher with a little water at the bottom. Its beak could not reach the water.', zh: '一只口渴的乌鸦找到一个水罐，罐底只有一点水，嘴却够不到。' },
      { en: 'The crow did not give up. It picked up small stones and dropped them into the pitcher, one by one. Slowly, the water rose.', zh: '乌鸦没有放弃。它捡起小石子，一颗颗投进水罐。水位慢慢升高。' },
      { en: 'At last, the crow could drink. A hard problem may not need one big answer; sometimes it yields to many small, patient steps.', zh: '最后，乌鸦喝到了水。难题不一定需要一个大答案，有时它会败给许多耐心的小步骤。' },
    ],
  },
  {
    id: 'rp_fable_dog_a2', title: 'The Dog and the Shadow', cefr: 'A2', topic: '寓言',
    paras: [
      { en: 'A dog carried a piece of meat across a bridge. Looking down, he saw another dog in the water with what seemed to be a larger piece.', zh: '一只狗叼着一块肉过桥。他低头看见水里还有一只狗，似乎叼着更大的一块。' },
      { en: 'The dog opened his mouth to grab the better piece. His own meat fell into the river and disappeared.', zh: '狗张嘴去抢那块更好的肉。自己的肉却掉进河里，消失了。' },
      { en: 'The “larger piece” was only a reflection. Wanting more can make us lose what is already in our hands.', zh: '那块“更大的肉”只是倒影。贪求更多，有时会失去手里已经拥有的东西。' },
    ],
  },
  {
    id: 'rp_fable_pots_b1', title: 'The Two Pots', cefr: 'B1', topic: '寓言',
    paras: [
      { en: 'A clay pot and an iron pot floated down a river together. The iron pot invited the clay pot to stay close for safety.', zh: '一只陶罐和一只铁罐一起顺河漂流。铁罐邀请陶罐靠近些，说这样更安全。' },
      { en: 'The clay pot refused. “You are strong, but if we touch, I will break. Your safety is not my safety.”', zh: '陶罐拒绝了：“你很结实，但我们一碰，我就会碎。你的安全不是我的安全。”' },
      { en: 'The two pots traveled separately and both reached the shore. Differences in strength may require differences in boundaries.', zh: '两只罐子分开漂流，都到了岸边。力量不同，需要的边界也可能不同。' },
    ],
  },
  {
    id: 'rp_fable_sticks_b1', title: 'The Bundle of Sticks', cefr: 'B1', topic: '寓言',
    paras: [
      { en: 'A father gave his sons a bundle of sticks and asked each one to break it. None of them could.', zh: '一位父亲给儿子们一捆树枝，让每个人试着折断。没人做得到。' },
      { en: 'Then he untied the bundle and gave each son a single stick. They broke the sticks easily. “Together you are strong,” he said. “Divided, you are easy to break.”', zh: '然后他解开绳子，给每个儿子一根树枝。他们很容易就折断了。“团结时你们很强，”他说，“分散时很容易被折断。”' },
      { en: 'The lesson is not that people must always agree. It is that shared problems require cooperation, not isolated effort.', zh: '寓意不是要求所有人永远意见一致，而是共同问题需要合作，而不是各自孤立应对。' },
    ],
  },
  {
    id: 'rp_fable_milkmaid_b1', title: 'The Milkmaid and Her Pail', cefr: 'B1', topic: '寓言',
    paras: [
      { en: 'A milkmaid carried a pail of milk on her head and began planning what she would buy with the money. She imagined eggs, chickens, and a fine dress.', zh: '一个挤奶女工头顶一桶牛奶，开始盘算卖钱后买什么。她想象着鸡蛋、小鸡和一条漂亮裙子。' },
      { en: 'Thinking about the dress, she tossed her head as if she were already wearing it. The pail fell, and the milk spilled into the road.', zh: '想到裙子时，她像已经穿上一样甩了一下头。奶桶掉下来，牛奶洒在路上。' },
      { en: 'She had counted future gains before securing the present one. Plans are useful, but they cannot replace the next careful step.', zh: '她在守住眼前的成果前就盘算未来收益。计划有用，但不能替代下一步的谨慎行动。' },
    ],
  },
  {
    id: 'rp_fable_mice_b1', title: 'The Town Mouse and the Country Mouse', cefr: 'B1', topic: '寓言',
    paras: [
      { en: 'The town mouse visited his cousin in the country. He found the simple food dull and invited the country mouse to the city.', zh: '城里的老鼠去乡下看望表亲，觉得简单食物很乏味，便邀请乡下老鼠进城。' },
      { en: 'In the city, the food was rich, but every sound sent them running from cats and people. The country mouse could not eat in peace.', zh: '城里食物丰盛，但每个声音都让他们躲避猫和人。乡下老鼠根本无法安心吃饭。' },
      { en: 'He returned home. “Plain food without fear is better than a feast in danger,” he said. Comfort and safety are part of the value of any choice.', zh: '他回到家里说：“没有恐惧的简单食物，胜过危险中的盛宴。”任何选择的价值都包含舒适与安全。' },
    ],
  },
  // ── 英文经典著作分级改写（原著均为公版；改写控难度 + 中英对照） ──────────────
  {
    id: 'rp_classic_alice_a2', title: 'Alice in Wonderland · Down the Rabbit Hole', cefr: 'A2', topic: '经典',
    paras: [
      { en: 'Alice was sitting by the river with her sister. She was bored, because the book her sister read had no pictures at all.', zh: '爱丽丝和姐姐坐在河边。她很无聊，因为姐姐读的那本书一幅插图都没有。' },
      { en: 'Suddenly, a white rabbit ran past her. It took a watch out of its pocket and said, “Oh dear! I am late!”', zh: '突然，一只白兔从她身边跑过。它从口袋里掏出一块表，说：“天哪！我要迟到了！”' },
      { en: 'A rabbit with a watch! Alice jumped up and followed it into a large rabbit hole. Down, down she fell — into a world where nothing was normal.', zh: '带着表的兔子！爱丽丝跳起来，跟着它钻进一个大兔子洞。她一直往下掉——掉进了一个什么都不正常的世界。' },
      { en: 'Curiosity takes you to strange places. For Alice, it all started with one question: where does a late rabbit go?', zh: '好奇心会把你带去奇怪的地方。对爱丽丝来说，一切都始于一个问题：一只迟到的兔子要去哪里？' },
    ],
  },
  {
    id: 'rp_classic_matchgirl_a2', title: 'The Little Match Girl', cefr: 'A2', topic: '经典',
    paras: [
      { en: 'On the last night of the year, snow fell over the city. A poor little girl walked barefoot through the streets, carrying boxes of matches.', zh: '一年的最后一夜，大雪覆盖全城。一个贫穷的小女孩光着脚走在街上，手里拿着几盒火柴。' },
      { en: 'She had lost her slippers in the crowd, and no one had bought a single match all day. She was afraid to go home without any money.', zh: '她的拖鞋在人群中丢了，一整天没人买过一根火柴。她不敢空着手回家。' },
      { en: 'She sat in a corner and lit one match to warm her fingers. In its light, she saw wonderful pictures — a warm stove, a feast, and at last her dear grandmother.', zh: '她坐在墙角，划亮一根火柴暖手指。在火光里，她看见了美妙的景象——温暖的火炉、丰盛的宴席，最后是她亲爱的奶奶。' },
      { en: 'People still read this story because it asks a hard question: how many “matches” do we walk past without looking?', zh: '人们至今仍在读这个故事，因为它问了一个沉重的问题：我们每天走过多少“火柴”，却看都不看一眼？' },
    ],
  },
  {
    id: 'rp_classic_tom_b1', title: 'The Adventures of Tom Sawyer · The Fence', cefr: 'B1', topic: '经典',
    paras: [
      { en: 'On Saturday morning, Tom had to paint a long fence. His friends were going swimming, and he had to work. Life felt unfair.', zh: '星期六早上，汤姆得刷一长段栅栏。朋友们都要去游泳，他却要干活。生活对他太不公平了。' },
      { en: 'Then Tom had an idea. When his friend Ben came by, he painted slowly and carefully, as if the work were a rare pleasure.', zh: '这时汤姆想出一个主意。朋友本路过时，他刷得又慢又认真，好像这份工作是天大的乐事。' },
      { en: '“You call this work?” Tom said. “Maybe you’d like a chance to paint?” Soon every boy in town was paying Tom for the honor.', zh: '“你把这叫干活？”汤姆说，“要不要也来试试？”很快，镇上的男孩们都掏钱来换取刷墙的机会。' },
      { en: 'By noon the fence had three coats of paint — and Tom had learned an old truth: work is what you have to do; play is what you don’t have to do.', zh: '到中午，栅栏刷了三遍漆——汤姆也懂得了一个古老的道理：必须做的是工作，不必做的是游戏。' },
    ],
  },
  {
    id: 'rp_classic_robinson_b1', title: 'Robinson Crusoe · The Island', cefr: 'B1', topic: '经典',
    paras: [
      { en: 'Robinson Crusoe was the only person left after the storm destroyed his ship. He swam to a small island with nothing but the clothes on his back.', zh: '风暴摧毁了船之后，鲁滨逊·克鲁索是唯一的幸存者。他游到一座小岛上，除了身上的衣服一无所有。' },
      { en: 'The next morning, he saw the broken ship lying on the rocks. He built a raft and rowed back, again and again, to bring away tools, food, and guns.', zh: '第二天早上，他看见破船卡在礁石上。他扎了木筏，一趟又一趟划回去，把工具、食物和枪运上岸。' },
      { en: 'Then he began to build a life: a tent for the night, a fence for safety, a diary to keep his mind from sinking into despair.', zh: '接着他开始建造生活：过夜的帐篷、防备的围栏、还有一本日记——让头脑不至于沉入绝望。' },
      { en: 'He later wrote that hope is a thing you build, plank by plank, the same way you build shelter.', zh: '他后来写道：希望是一点点建起来的，一块板接着一块板，就像建住处一样。' },
    ],
  },
  {
    id: 'rp_classic_peterpan_b1', title: 'Peter Pan · The Window', cefr: 'B1', topic: '经典',
    paras: [
      { en: 'Peter Pan visited the nursery at night and taught Wendy, John, and Michael to fly. “Think of a wonderful thought,” he said, “and sprinkle on fairy dust.”', zh: '彼得·潘夜里来到儿童房，教温迪、约翰和迈克尔飞。“想一件特别开心的事，”他说，“再撒上仙尘。”' },
      { en: 'They flew out of the window, over the city, and all the way to Neverland — an island where children never grow up and every day brings an adventure.', zh: '他们飞出窗户，越过城市，一路飞到永无岛——那里的孩子永远不长大的，每天都有新的冒险。' },
      { en: 'But Mrs. Darling left the nursery window open every night. She believed that if her children ever wanted to come home, the way back must be ready.', zh: '但达林太太每晚都让儿童房的窗子开着。她相信，只要孩子们想回家，回去的路就必须一直都在。' },
      { en: 'Adventures are wonderful precisely because there is a window left open somewhere. Even Peter, who refused to grow up, kept coming back to look at it.', zh: '冒险之所以美好，恰恰因为某个地方有一扇开着的窗。连拒绝长大的彼得，也总会回来看看它。' },
    ],
  },
  {
    id: 'rp_classic_garden_b1', title: 'The Secret Garden · The Key', cefr: 'B1', topic: '经典',
    paras: [
      { en: 'Mary Lennox came to live at her uncle’s great house on the moor. She was a sour, lonely child who had never liked anyone or anywhere.', zh: '玛丽·伦诺克斯来到舅舅住在荒原上的大宅。她是个别扭又孤独的孩子，从没喜欢过什么人，也没喜欢过什么地方。' },
      { en: 'A friendly robin led her to an old wall, where a dog had dug away the soil. Under the ivy, Mary’s fingers found a hidden key.', zh: '一只友好的知更鸟把她引到一堵老墙边，那里的土被狗刨开了。常春藤下，玛丽的手指摸到了一把藏起来的钥匙。' },
      { en: 'The next day, the wind moved the ivy aside, and she saw a small door in the wall. The garden behind it had been locked for ten years.', zh: '第二天，风吹开常春藤，她看见墙里有一扇小门。门后的花园已经锁了十年。' },
      { en: 'What Mary found inside was not only an overgrown garden. Tending it, season by season, she found that she herself was changing too.', zh: '玛丽在里头发现的不只是一座荒废的花园。一季一季地照料它，她自己也在悄悄改变。' },
    ],
  },
  {
    id: 'rp_classic_giant_b1', title: 'The Selfish Giant', cefr: 'B1', topic: '寓言',
    paras: [
      { en: 'The Giant came back after seven years away and found children playing in his beautiful garden. “This is my garden!” he shouted, and he built a high wall around it.', zh: '巨人离家七年后回来，看见孩子们在他美丽的花园里玩耍。“这是我的花园！”他大喊，并在四周筑起高墙。' },
      { en: 'Without the children, spring never came. Snow and frost covered the garden while the rest of the world blossomed.', zh: '没有孩子们，春天再也不来。外面的世界花开满园，他的花园却盖满冰雪寒霜。' },
      { en: 'One morning, the Giant heard a bird singing again. The children had crept in through a hole in the wall, and spring had followed them in.', zh: '一天早上，巨人又听见了鸟鸣。孩子们从墙洞里悄悄钻了进来，春天也跟着他们来了。' },
      { en: 'He tore the wall down that very day. “It is your garden now, little children,” he said. A garden shared is the only kind that keeps its spring.', zh: '他当天就拆了墙。“孩子们，现在这是你们的花园了。”他说。只有分享出去的花园，才能留住春天。' },
    ],
  },
  {
    id: 'rp_classic_prince_b1', title: 'The Happy Prince', cefr: 'B1', topic: '寓言',
    paras: [
      { en: 'High above the city stood the golden statue of the Happy Prince. He had lived and died in a palace where sorrow was never allowed.', zh: '城市上空立着快乐王子的金像。他生前和死后都住在宫殿里，悲伤从来不被允许靠近。' },
      { en: 'Now, from his high place, he could see all the misery of the city. A little swallow stopped to rest at his feet, and the Prince asked for its help.', zh: '如今，他从高处看见了全城的苦难。一只小燕子落在他脚边歇脚，王子请它帮忙。' },
      { en: 'Night after night, the swallow carried the Prince’s gold leaf and jewel eyes to the poor. The statue grew ugly, but the city grew warmer.', zh: '燕子一夜一夜地把王子的金箔和宝石眼睛送给穷人。雕像变得丑陋，城市却变得温暖。' },
      { en: 'The town leaders later pulled the statue down as useless. But the story ends by saying these were the two most precious things in the city: a kind heart and a loyal friend.', zh: '后来，市长们嫌雕像没用，把它熔掉了。但故事的结尾说，城里最珍贵的两样东西，是一颗善良的心和一位忠实的朋友。' },
    ],
  },
  {
    id: 'rp_classic_emperor_b1', title: 'The Emperor’s New Clothes', cefr: 'B1', topic: '经典',
    paras: [
      { en: 'An emperor loved fine clothes more than anything else. Two swindlers arrived and claimed they could weave cloth that was invisible to anyone stupid or unfit for office.', zh: '一位皇帝最爱华服。两个骗子来了，声称能织出一种布——愚蠢或不称职的人都看不见它。' },
      { en: 'The ministers looked at the empty looms and praised the “cloth.” None of them dared to say they saw nothing. So the emperor walked in his “new clothes,” and the whole town applauded.', zh: '大臣们看着空织机，纷纷称赞“布料”精美。没人敢说自己什么都没看见。于是皇帝穿着他的“新衣”游行，全城的人都在鼓掌。' },
      { en: 'Then a child in the crowd said, “But he has nothing on!” The whisper spread, and at last everyone repeated it.', zh: '这时人群里一个孩子说：“可他什么也没穿呀！”低语传开，最后所有人都跟着说了出来。' },
      { en: 'The emperor kept walking, because he did not want to admit the truth either. Fairy tales are gentle with children and merciless with adults who choose not to see.', zh: '皇帝继续往前走，因为他也不想承认真相。童话对孩子温和，对那些选择视而不见的大人却毫不留情。' },
    ],
  },
  {
    id: 'rp_classic_magie_b2', title: 'The Gift of the Magi', cefr: 'B2', topic: '经典',
    paras: [
      { en: 'Della and Jim were young, poor, and in love. Christmas was coming, and each had one treasure: her beautiful long hair, and his father’s gold watch.', zh: '德拉和吉姆年轻、贫穷，也深爱着彼此。圣诞节快到了，两人各有一件宝贝：她一头漂亮的长发，和他父亲留下的金表。' },
      { en: 'Della counted her savings — one dollar and eighty-seven cents. So she did the only thing she could think of: she sold her hair to buy Jim a chain for his watch.', zh: '德拉数了数积蓄——一块八毛七。于是她做了唯一想得到的事：卖掉头发，给吉姆买一条配金表的表链。' },
      { en: 'When Jim came home, he stared at her short hair in surprise. Then he gave her his gift: a set of combs she had admired in a shop window. He had sold the watch to buy them.', zh: '吉姆回到家，愣愣地望着她的短发。然后他递上礼物：她曾在橱窗里羡慕许久的一套发梳。为了买它，他卖掉了金表。' },
      { en: 'O. Henry closes the story by calling these two foolish children the wisest of gift-givers. Two useless presents proved exactly what each was willing to give up.', zh: '欧·亨利在结尾称这对“傻孩子”是最聪明的送礼人。两件“没用了”的礼物，恰恰证明了各自愿意付出什么。' },
    ],
  },
  {
    id: 'rp_classic_lastleaf_b2', title: 'The Last Leaf', cefr: 'B2', topic: '经典',
    paras: [
      { en: 'In a small New York art colony, a girl named Johnsy fell ill with pneumonia. She lay in bed counting the leaves falling from the vine outside her window.', zh: '在纽约一个小小的艺术家聚居区，一个叫琼西的姑娘得了肺炎。她躺在床上，数着窗外藤蔓上飘落的叶子。' },
      { en: '“When the last leaf falls, I will die too,” she said quietly. Her friend Sue told this to old Behrman, a painter downstairs who had talked about a masterpiece for forty years and never painted one.', zh: '“最后一片叶子落下时，我也会死。”她轻声说。朋友苏把这话告诉了楼下的老贝尔曼——一位说了四十年要画杰作、却一直没动笔的老画家。' },
      { en: 'That night came wind and rain. In the morning, one leaf still hung on the wall — dark green against the storm. Johnsy stared at it, and something in her turned back toward life.', zh: '那天夜里风雨交加。清晨，墙上还挂着一片叶子——深绿色，顶着风雨。琼西盯着它看，心里有什么东西转回了生的一侧。' },
      { en: 'The leaf never moved, because it was painted on the wall. Behrman caught a fever working in the cold that night, and died two days later. His masterpiece had been waiting for a life worth saving.', zh: '那片叶子从未动过，因为它是画在墙上的。贝尔曼那晚在寒风里作画，染上肺炎，两天后去世。他的杰作，一直在等一条值得救的命。' },
    ],
  },
  {
    id: 'rp_classic_necklace_b2', title: 'The Necklace', cefr: 'B2', topic: '经典',
    paras: [
      { en: 'Mathilde Loisel was pretty, and she was poor — a combination she believed was a great injustice. When her husband brought home an invitation to a ball, she wept, because she had nothing to wear.', zh: '玛蒂尔德·卢瓦泽尔很漂亮，也很穷——她认定这是命运极大的不公。丈夫带回一张舞会请柬时，她哭了，因为她没有像样的衣服。' },
      { en: 'She bought a dress with their savings, but jewelry she dared not touch. So she borrowed a diamond necklace from her rich friend Madame Forestier, and that night she was the most beautiful woman at the ball.', zh: '她用积蓄买了裙子，却不敢买首饰。于是向有钱的朋友福雷斯蒂埃太太借了一条钻石项链。那一晚，她是舞会上最美的女人。' },
      { en: 'On the way home, the necklace was gone. They borrowed a fortune, bought an identical one to return, and spent the next ten years working to pay the debt — Mathilde’s hands red and rough from housework.', zh: '回家的路上，项链丢了。夫妻俩借了一大笔钱，买了一条一模一样的还回去，然后用整整十年打工还债——玛蒂尔德的双手被家务磨得又红又粗。' },
      { en: 'One Sunday, she met Madame Forestier again and finally told the truth. “Oh, my poor Mathilde — but mine was fake. It was worth five hundred francs at most.” A single night of vanity had cost ten years, and the truth had been standing there all along.', zh: '一个星期天，她再次遇到福雷斯蒂埃太太，终于说出真相。“哦，我可怜的玛蒂尔德——可我那条是假的，最多值五百法郎。”一夜的虚荣花了十年，而真相一直就站在那里。' },
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
  { id: 'course_sec_crypto', name: '密码学与 PKI', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_crypto' },
  { id: 'course_sec_web', name: 'Web 漏洞与攻击防御', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_web' },
  { id: 'course_sec_identity', name: '身份与访问管理', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_identity' },
  { id: 'course_sec_api', name: 'API 与移动安全', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_api' },
  { id: 'course_sec_cloud', name: '云与容器安全', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_cloud' },
  { id: 'course_sec_pentest', name: '授权渗透测试', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_pentest' },
  { id: 'course_sec_automation', name: '自动化攻防靶场', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_automation' },
  { id: 'course_sec_languages', name: '多语言安全编码', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_languages' },
  { id: 'course_sec_defense', name: '攻击防御与蓝队运营', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_defense' },
  { id: 'course_sec_ai', name: 'AI 与 LLM 安全', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_ai' },
  { id: 'course_sec_devsecops', name: '安全开发与 DevSecOps', subject: '网络安全', stage: '网络安全', kind: 'security', securityPathId: 'sec_devsecops' },
];

export const COURSE_STAGES: LearningCourseStage[] = ['启蒙', '必背专题', '初中', '高中', '大学', '出国', '软考', '网络安全'];
