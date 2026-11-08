// 学习模式 · 课程内容包（P1）：场景卡 / 语法点目录（预写讲解）/ 分级范文。
// 全部离线预写、随应用分发——LLM 只做「归因到语法点」「按模板补例句」「AI 收词」，
// 不允许现场编教学内容（方案 §2.4：语法规则预写内置）。

// ── 场景卡 ──────────────────────────────────────────────────────────────────

export type SceneCard = {
  id: string;
  title: string;
  scene: string;        // 一句话场景描述（注入给模型的设定）
  roles: [string, string]; // [模型扮演, 用户扮演]
  keyPhrases: string[]; // 目标句型（Learn→Practice→Apply 的 Learn 段）
  exitHint: string;     // 达成什么算完成
  cefr: string;         // 建议难度
};

export const SCENE_CARDS: SceneCard[] = [  { id: 'sc_airport', title: '机场值机', scene: '机场出发大厅值机柜台，用户赶时间，航班 40 分钟后截止托运', roles: ['值机柜员', '赶时间的旅客'], keyPhrases: ['I’d like to check in for flight...', 'Here’s my passport.', 'Can I take ... as carry-on?', 'Is the flight on time?'], exitHint: '完成托运并确认登机口', cefr: 'A2' },
  { id: 'sc_restaurant', title: '餐厅点单', scene: '西餐厅晚餐，服务员推荐今日特色', roles: ['服务员', '顾客'], keyPhrases: ['Could I see the menu?', 'I’ll have the ...', 'How is the ... cooked?', 'Could we get the bill, please?'], exitHint: '点完主菜饮料并结账', cefr: 'A2' },
  { id: 'sc_hotel', title: '酒店入住', scene: '酒店前台，用户已预订但订单姓名拼写有出入', roles: ['前台接待', '入住客人'], keyPhrases: ['I have a reservation under...', 'Could you check again, please?', 'What time is breakfast?', 'Is there Wi-Fi in the room?'], exitHint: '解决订单问题并拿到房卡', cefr: 'A2' },
  { id: 'sc_interview', title: '求职面试', scene: '英语面试，岗位与用户简历相关，面试官追问项目细节', roles: ['面试官', '应聘者'], keyPhrases: ['Thank you for having me.', 'In my last role, I...', 'My biggest strength is...', 'Do you have any questions for me?'], exitHint: '完成自我介绍 + 项目问答 + 反向提问', cefr: 'B1' },
  { id: 'sc_smalltalk', title: '电梯闲聊', scene: '电梯里遇到外国同事，30 秒到 1 分钟的寒暄', roles: ['外国同事', '用户本人'], keyPhrases: ['How’s it going?', 'Busy week?', 'Any plans for the weekend?', 'Well, this is my floor—nice talking to you!'], exitHint: '自然寒暄并得体结束', cefr: 'A2' },
  { id: 'sc_doctor', title: '看医生', scene: '诊所问诊，描述症状三天了，医生询问细节并给建议', roles: ['医生', '患者'], keyPhrases: ['I’ve had a ... for three days.', 'It gets worse when...', 'Is it serious?', 'How often should I take this?'], exitHint: '描述症状并听懂医嘱', cefr: 'B1' },
  { id: 'sc_shopping', title: '退换货', scene: '商店客服处，用户要退一件有瑕疵的商品，没有小票', roles: ['客服', '顾客'], keyPhrases: ['I’d like to return this.', 'It doesn’t work properly.', 'I lost the receipt, but...', 'Could I get a refund or exchange?'], exitHint: '说明问题并争取到退换', cefr: 'B1' },
  { id: 'sc_meeting', title: '线上会议发言', scene: '项目周会，用户要汇报进度并被追问风险', roles: ['项目经理', '汇报人'], keyPhrases: ['Quick update on my side.', 'We’re on track for...', 'The main risk is...', 'I suggest we...'], exitHint: '完成进度汇报并回应一次追问', cefr: 'B1' },
  { id: 'sc_phone', title: '客服电话', scene: '打电话给宽带运营商报修，信号差需要拼清楚信息', roles: ['客服专员', '报修用户'], keyPhrases: ['I’m calling about...', 'Sorry, could you repeat that?', 'My account number is...', 'When can a technician come?'], exitHint: '报修成功并确认上门时间', cefr: 'B1' },
  { id: 'sc_directions', title: '问路', scene: '国外街头，用户手机没电，向路人问路去地铁站', roles: ['热心路人', '迷路游客'], keyPhrases: ['Excuse me, how do I get to...?', 'Is it far from here?', 'Left at the second traffic light?', 'Thanks a lot!'], exitHint: '问清路线并复述确认', cefr: 'A1' },
  { id: 'sc_negotiate', title: '砍价', scene: '旅游纪念品市场，摊主开价偏高，用户想便宜 20%', roles: ['摊主', '游客'], keyPhrases: ['That’s a bit steep.', 'Could you do ... if I take two?', 'What’s your best price?', 'Deal!'], exitHint: '谈成一笔买卖', cefr: 'B1' },
  { id: 'sc_party', title: '派对破冰', scene: '朋友聚会上认识新朋友，聊兴趣爱好并互加联系方式', roles: ['新朋友', '用户'], keyPhrases: ['Hi, I don’t think we’ve met.', 'What do you do for fun?', 'How do you know the host?', 'Let’s exchange numbers!'], exitHint: '完成破冰并互留联系方式', cefr: 'A2' },
];

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
];

// ── 场景卡检索与提示词渲染（llm-task-manager 注入用） ─────────────────────────

export function getSceneCard(id: string): SceneCard | null {
  return SCENE_CARDS.find((s) => s.id === id) || null;
}

/** 场景块拼进教学提示词：角色 + 目标句型 + [SCENE_END] 触发条件（提示词 §宪法第 6 条负责收尾格式） */
export function renderScenePrompt(s: SceneCard): string {
  return [
    '## 当前场景（场景任务卡模式）',
    `场景：${s.scene}`,
    `你扮演：${s.roles[0]}；用户扮演：${s.roles[1]}。严格按角色说话，不跳出场景。`,
    `关键句型（开场先列出这 ${s.keyPhrases.length} 句让用户跟读，再进入对话）：`,
    ...s.keyPhrases.map((k) => `- ${k}`),
    `完成条件：${s.exitHint}。达成后按教学宪法输出 [SCENE_END] + 评分 JSON（corrections 每条带 grammar_point 可留空）。`,
    `难度参考：CEFR ${s.cefr}。`,
  ].join('\n');
}
