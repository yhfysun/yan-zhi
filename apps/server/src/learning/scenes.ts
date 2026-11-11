// 学习模式 · 课程专属场景任务库。
//
// 场景不是通用英语闲聊，而是当前课程的一部分：
// - courseId 与 COURSE_CATALOG 一一对应，前端切课程时只取该课的场景；
// - missions 是用户在场景里必须完成的三步，既画在卡片上也注入陪练提示词；
// - setting / roles / keyPhrases 负责把角色、冲突和目标说清楚，避免模型自由发挥成普通聊天。

export type SceneLevel = '热身' | '挑战' | '实战';

export type SceneCard = {
  id: string;
  courseId: string;
  courseName: string;
  stage: '启蒙' | '必背专题' | '初中' | '高中' | '大学' | '出国';
  title: string;
  theme: string;
  scene: string;
  setting: string;
  roles: [string, string];
  missions: string[];
  keyPhrases: string[];
  exitHint: string;
  cefr: string;
  level: SceneLevel;
  minutes: number;
  tags: string[];
};

export const SCENE_CARDS: SceneCard[] = [
  // ── 字母与音标 ───────────────────────────────────────────────────────────
  {
    id: 'sc_letters_hello', courseId: 'course_letters', courseName: '字母与音标', stage: '启蒙',
    title: '第一次见面', theme: '课堂破冰', level: '热身', minutes: 8, cefr: 'A1',
    scene: '新同学第一次上英语课，老师带大家用姓名开头字母和简单问候互相认识。',
    setting: '明亮的少儿英语教室，桌上有姓名卡、彩色字母卡和一盒蜡笔。',
    roles: ['英语老师', '刚来报到的新同学'],
    missions: ['拼出自己的名字', '用 Hello / Hi 回应问候', '说出一个自己喜欢的字母'],
    keyPhrases: ['Hello, my name is...', 'How do you spell it?', 'Nice to meet you.', 'My favourite letter is...'],
    exitHint: '介绍姓名并和老师完成一次往返问候',
    tags: ['自我介绍', '字母拼写', '开口第一步'],
  },
  {
    id: 'sc_letters_classroom', courseId: 'course_letters', courseName: '字母与音标', stage: '启蒙',
    title: '教室寻宝', theme: '教室物品', level: '挑战', minutes: 10, cefr: 'A1',
    scene: '老师给出英文物品名，学生要在教室里找到对应物品并说出它在哪里。',
    setting: '教室被布置成寻宝现场，桌上和墙边分散放着 book、pen、bag、ruler。',
    roles: ['寻宝带队老师', '拿任务卡的学生'],
    missions: ['听懂 4 个教室物品词', '用 It is on / in... 说位置', '向老师确认最后一件物品'],
    keyPhrases: ['Where is the...?', 'It is on the desk.', 'Is this your...?', 'I found it!'],
    exitHint: '找齐四件物品并说清其中两件的位置',
    tags: ['课堂词汇', '方位表达', '听辨'],
  },
  {
    id: 'sc_letters_sound', courseId: 'course_letters', courseName: '字母与音标', stage: '启蒙',
    title: '音标侦探', theme: '辨音游戏', level: '实战', minutes: 10, cefr: 'A1',
    scene: '两名侦探要根据发音线索找出正确单词，读错一个词就会拿错证物袋。',
    setting: '侦探社的小办公室，桌上摆着写有 ship / sheep、cat / cut 的证物卡。',
    roles: ['侦探搭档', '负责读线索的新人侦探'],
    missions: ['听辨两组易混元音', '准确读出 4 个词', '用 I hear... 解释自己的选择'],
    keyPhrases: ['I hear the word...', 'Can you say it again?', 'They sound different.', 'This one is correct.'],
    exitHint: '四组辨音全部完成并说明一组差异',
    tags: ['音标', '最小对立', '发音纠正'],
  },

  // ── 初一 ─────────────────────────────────────────────────────────────────
  {
    id: 'sc_junior1_firstday', courseId: 'course_junior1', courseName: '初一', stage: '初中',
    title: '开学第一天', theme: '校园生活', level: '热身', minutes: 10, cefr: 'A1',
    scene: '开学第一天，新生在班里找座位、认识同桌，还要向班主任说明自己从哪里来。',
    setting: '早读前的七年级教室，黑板上写着座位表，走廊里不断有人搬书进来。',
    roles: ['班主任', '刚转学来的新生'],
    missions: ['介绍姓名和家乡', '询问自己的座位', '和同桌约好一起去领书'],
    keyPhrases: ['I am from...', 'Where should I sit?', 'Let us go together.', 'Excuse me, is this seat taken?'],
    exitHint: '找到座位并和同桌完成一次简短约定',
    tags: ['自我介绍', '校园', 'there be'],
  },
  {
    id: 'sc_junior1_canteen', courseId: 'course_junior1', courseName: '初一', stage: '初中',
    title: '食堂点餐', theme: '日常消费', level: '挑战', minutes: 12, cefr: 'A2',
    scene: '午餐高峰，食堂阿姨语速很快，学生要问价格、选菜并确认是否打包。',
    setting: '人声嘈杂的学校食堂，窗口上贴着套餐价目表，托盘只剩最后几个。',
    roles: ['食堂阿姨', '排队的学生'],
    missions: ['点一份主食和一份饮料', '询问价格', '确认堂食还是打包'],
    keyPhrases: ['I would like...', 'How much is it?', 'For here, please.', 'Could I have some...?'],
    exitHint: '完成点餐、确认价格并拿到餐盘',
    tags: ['点餐', '数字价格', '可数名词'],
  },
  {
    id: 'sc_junior1_weekend', courseId: 'course_junior1', courseName: '初一', stage: '初中',
    title: '周末计划', theme: '朋友邀约', level: '挑战', minutes: 12, cefr: 'A2',
    scene: '好朋友发来周末邀约，但学生已经答应了家人，需要解释并重新约时间。',
    setting: '周五放学后的校门口，两人边走边看手机里的电影排片。',
    roles: ['好朋友', '有家庭安排的自己'],
    missions: ['说明已有安排', '提出一个新时间', '约定见面地点'],
    keyPhrases: ['What are you going to do?', 'I have to...', 'How about next Sunday?', 'Let us meet at...'],
    exitHint: '礼貌拒绝一次邀约并敲定新计划',
    tags: ['将来时', '邀约', '时间表达'],
  },

  // ── 初二 ─────────────────────────────────────────────────────────────────
  {
    id: 'sc_junior2_directions', courseId: 'course_junior2', courseName: '初二', stage: '初中',
    title: '问路去地铁站', theme: '城市出行', level: '热身', minutes: 10, cefr: 'A2',
    scene: '游客手机没电，在街口向本地学生问去地铁站的路线，还要确认走几分钟。',
    setting: '傍晚的十字路口，路边有公交站、便利店和一块被树挡了一半的方向牌。',
    roles: ['热心本地学生', '迷路游客'],
    missions: ['问清地铁站方向', '复述两个转弯点', '确认步行时间'],
    keyPhrases: ['How do I get to...?', 'Turn left at...', 'Is it within walking distance?', 'So I should...?'],
    exitHint: '复述完整路线并获得预计步行时间',
    tags: ['问路', '祈使句', '方向介词'],
  },
  {
    id: 'sc_junior2_duty', courseId: 'course_junior2', courseName: '初二', stage: '初中',
    title: '班级值日分工', theme: '团队协作', level: '挑战', minutes: 12, cefr: 'A2',
    scene: '放学前班长要分配值日任务，但两名同学都想擦黑板，需要协调并说清每个人做什么。',
    setting: '放学后的教室，扫帚只剩两把，垃圾桶已经满了一半。',
    roles: ['班长', '负责协调的值日生'],
    missions: ['说明今天的三项任务', '协商交换一个任务', '确认完成时间'],
    keyPhrases: ['Who is going to...?', 'Can we swap?', 'I will take care of...', 'Let us finish by...'],
    exitHint: '三项任务都有人负责且没有重复分工',
    tags: ['分工', '将来时', '请求协商'],
  },
  {
    id: 'sc_junior2_penpal', courseId: 'course_junior2', courseName: '初二', stage: '初中',
    title: '笔友视频通话', theme: '跨文化交流', level: '实战', minutes: 15, cefr: 'A2',
    scene: '第一次和外国笔友视频，网络有点卡，双方要介绍学校生活并约好下次通信主题。',
    setting: '周末下午的书桌旁，视频画面偶尔卡住，手边放着写好问题的便签。',
    roles: ['外国笔友', '中国中学生'],
    missions: ['介绍一天的课程安排', '问对方最喜欢的科目', '约定下次分享校园节日'],
    keyPhrases: ['My school day starts at...', 'What subject do you like best?', 'Could you say that again?', 'Next time I can show you...'],
    exitHint: '完成双向提问并约定下一次主题',
    tags: ['视频通话', '学校生活', '澄清请求'],
  },

  // ── 初三 ─────────────────────────────────────────────────────────────────
  {
    id: 'sc_junior3_oral', courseId: 'course_junior3', courseName: '初三', stage: '初中',
    title: '中考口语模拟', theme: '考试训练', level: '挑战', minutes: 12, cefr: 'A2',
    scene: '人机对话考试开始，考生要先朗读短文，再回答两个与校园生活有关的问题。',
    setting: '安静的机考教室，耳机里播放提示音，屏幕倒计时只剩 12 分钟。',
    roles: ['口语考试系统', '参加模拟考的初三学生'],
    missions: ['清楚朗读一段短文', '回答如何安排课余时间', '在倒计时内完成追问'],
    keyPhrases: ['I usually spend... on...', 'In my opinion...', 'One reason is that...', 'That is why...'],
    exitHint: '完成朗读和两次完整作答',
    tags: ['中考口语', '朗读', '观点表达'],
  },
  {
    id: 'sc_junior3_club', courseId: 'course_junior3', courseName: '初三', stage: '初中',
    title: '社团招新面试', theme: '兴趣与责任', level: '挑战', minutes: 12, cefr: 'B1',
    scene: '摄影社招新，社长问学生为什么想加入、能投入多少时间，并给出一道取材情境题。',
    setting: '午休时间的社团活动室，墙上贴满往届照片，桌上有一台旧相机。',
    roles: ['摄影社社长', '来面试的初三学生'],
    missions: ['说明加入原因', '介绍一项相关经历', '回应时间投入的顾虑'],
    keyPhrases: ['I am interested in...', 'I have experience in...', 'I can manage my time by...', 'For this situation, I would...'],
    exitHint: '完成动机、经历和时间安排三轮回答',
    tags: ['社团面试', '原因表达', '时间管理'],
  },
  {
    id: 'sc_junior3_travel', courseId: 'course_junior3', courseName: '初三', stage: '初中',
    title: '毕业旅行提案', theme: '计划与说服', level: '实战', minutes: 15, cefr: 'B1',
    scene: '小组讨论毕业旅行目的地，学生要比较两个方案、回应预算问题并推动大家做决定。',
    setting: '图书馆讨论区，桌上摊着两张路线图，预算表被红笔圈出了交通费。',
    roles: ['小组组长', '提出方案的学生'],
    missions: ['介绍一个目的地', '比较交通与预算', '回应同学的安全顾虑'],
    keyPhrases: ['I suggest that we...', 'Compared with..., it is...', 'The main concern is...', 'Shall we vote on it?'],
    exitHint: '完成方案陈述并推动小组形成决定',
    tags: ['旅行计划', '比较级', '说服'],
  },

  // ── 高一 ─────────────────────────────────────────────────────────────────
  {
    id: 'sc_senior1_club', courseId: 'course_senior1', courseName: '高一', stage: '高中',
    title: '英语社面试', theme: '社团面试', level: '热身', minutes: 10, cefr: 'B1',
    scene: '英语社面试要求用英文做 1 分钟自我介绍，并现场回答一个活动策划问题。',
    setting: '放学后的活动教室，三名面试官坐成一排，桌上放着报名表和计时器。',
    roles: ['英语社面试官', '报名高一新生'],
    missions: ['完成一分钟自我介绍', '说清一项优势', '给出一个迎新活动点子'],
    keyPhrases: ['I am good at...', 'One idea is to...', 'I believe I can...', 'Would you like me to explain?'],
    exitHint: '完成自我介绍并讲清活动方案的第一步',
    tags: ['社团面试', '优势表达', '活动策划'],
  },
  {
    id: 'sc_senior1_presentation', courseId: 'course_senior1', courseName: '高一', stage: '高中',
    title: '课堂展示答疑', theme: '课堂演讲', level: '挑战', minutes: 12, cefr: 'B1',
    scene: '学生刚做完环保主题展示，老师追问数据来源，同学问能否给出校园行动建议。',
    setting: '英语课堂，投影停在最后一页图表，计时器提示还剩 3 分钟问答。',
    roles: ['英语老师', '负责展示的学生'],
    missions: ['概括展示结论', '说明数据来源', '给出一个可执行建议'],
    keyPhrases: ['To sum up...', 'The data comes from...', 'A practical step would be...', 'That is a good question.'],
    exitHint: '回答两个追问并给出明确下一步',
    tags: ['课堂展示', '数据说明', '问答'],
  },
  {
    id: 'sc_senior1_homestay', courseId: 'course_senior1', courseName: '高一', stage: '高中',
    title: '寄宿家庭晚餐', theme: '跨文化生活', level: '实战', minutes: 15, cefr: 'B1',
    scene: '交换生第一次在寄宿家庭吃晚餐，需要尝试不熟悉的食物、表达忌口并参与家庭闲聊。',
    setting: '温暖的家庭餐厅，桌上有一道没见过的炖菜，主人正热情询问今天的学校生活。',
    roles: ['寄宿家庭主人', '交换生'],
    missions: ['礼貌描述今天的经历', '说明一项饮食偏好', '主动问一个家庭问题'],
    keyPhrases: ['It was my first time...', 'I am not used to..., but I can try.', 'Would you mind telling me...?', 'Thanks for having me.'],
    exitHint: '完成一轮餐桌闲聊并礼貌表达饮食边界',
    tags: ['跨文化', '餐桌交流', '礼貌表达'],
  },

  // ── 高二 ─────────────────────────────────────────────────────────────────
  {
    id: 'sc_senior2_volunteer', courseId: 'course_senior2', courseName: '高二', stage: '高中',
    title: '志愿者活动协调', theme: '社会责任', level: '热身', minutes: 10, cefr: 'B1',
    scene: '社区读书活动缺一名协调员，学生要和负责人确认任务、时间以及突发情况处理方式。',
    setting: '社区活动中心，桌上摆着签到表、儿童绘本和临时调整过的时间表。',
    roles: ['社区活动负责人', '学生志愿者'],
    missions: ['确认自己的职责', '询问物资和人员安排', '提出一个风险预案'],
    keyPhrases: ['What exactly will I be responsible for?', 'Do we have enough...?', 'If..., we can...', 'I will be there by...'],
    exitHint: '明确职责并说清一个突发情况预案',
    tags: ['志愿服务', '职责确认', '条件句'],
  },
  {
    id: 'sc_senior2_major', courseId: 'course_senior2', courseName: '高二', stage: '高中',
    title: '未来专业咨询', theme: '升学规划', level: '挑战', minutes: 12, cefr: 'B1',
    scene: '职业规划老师询问学生感兴趣的专业，学生要解释兴趣来源并比较两个方向。',
    setting: '学校生涯规划室，桌上摊着大学专业手册，墙上贴着兴趣能力雷达图。',
    roles: ['生涯规划老师', '正在选科的高二学生'],
    missions: ['说明一个兴趣方向', '比较两个专业的差异', '提出下一步了解计划'],
    keyPhrases: ['I have always been curious about...', 'The difference is that...', 'I would like to find out...', 'What would you recommend?'],
    exitHint: '说清一个专业方向及下一步行动',
    tags: ['升学', '专业选择', '比较'],
  },
  {
    id: 'sc_senior2_debate', courseId: 'course_senior2', courseName: '高二', stage: '高中',
    title: '辩论社热身', theme: '观点交锋', level: '实战', minutes: 15, cefr: 'B1',
    scene: '辩题是“学生是否应该每天使用 AI 学习”，学生要在有限时间内提出论点并回应反方。',
    setting: '辩论社活动室，计时牌亮着，桌上只有一张写满关键词的草稿纸。',
    roles: ['反方辩手', '正方一辩'],
    missions: ['提出一个清晰论点', '用例子支持观点', '回应对方关于依赖性的质疑'],
    keyPhrases: ['My first argument is...', 'For example...', 'You mentioned that..., however...', 'That is why I believe...'],
    exitHint: '完成论点、例证和一次有效回应',
    tags: ['辩论', '论点结构', '让步反驳'],
  },

  // ── 高三 · 高考冲刺 ─────────────────────────────────────────────────────
  {
    id: 'sc_gaokao_speaking', courseId: 'course_gaokao', courseName: '高三 · 高考冲刺', stage: '高中',
    title: '高考口语·校园生活', theme: '考试训练', level: '挑战', minutes: 12, cefr: 'B1',
    scene: '高考英语口语模拟，考生要朗读短文，并回答“如何平衡学习与运动”的问题。',
    setting: '标准化口语考场，屏幕显示两分钟准备时间，耳边只能听到自己的声音。',
    roles: ['高考口语考官', '高三考生'],
    missions: ['完成短文朗读', '给出两个平衡学习与运动的方法', '用完整句结束回答'],
    keyPhrases: ['A balanced schedule helps me...', 'First..., second...', 'For instance...', 'Therefore, I try to...'],
    exitHint: '完成朗读和一次有结构的双点回答',
    tags: ['高考口语', '结构化回答', '朗读'],
  },
  {
    id: 'sc_gaokao_listening', courseId: 'course_gaokao', courseName: '高三 · 高考冲刺', stage: '高中',
    title: '高考听力·机场延误', theme: '听力情境', level: '挑战', minutes: 10, cefr: 'B1',
    scene: '机场广播通知航班延误，学生扮演旅客向柜台确认改签、行李和登机口信息。',
    setting: '嘈杂的机场服务台，广播重复航班号，队伍后面不断有人催促。',
    roles: ['机场服务人员', '需要改签的旅客'],
    missions: ['确认延误原因和新时间', '询问行李如何处理', '复述新的登机口'],
    keyPhrases: ['My flight has been delayed, right?', 'Could you tell me the new time?', 'What should I do with my luggage?', 'So I need to go to...'],
    exitHint: '准确确认三项关键信息并完成复述',
    tags: ['高考听力', '信息确认', '旅行'],
  },
  {
    id: 'sc_gaokao_advice', courseId: 'course_gaokao', courseName: '高三 · 高考冲刺', stage: '高中',
    title: '建议信面谈', theme: '书面表达', level: '实战', minutes: 15, cefr: 'B1',
    scene: '老师就一封“给学弟学妹的学习建议信”做面谈，要求学生压缩内容、调整语气并补一个例子。',
    setting: '晚自习前的办公室，作文纸上多了几处红笔批注，电脑里还开着写作提纲。',
    roles: ['英语老师', '修改建议信的高三学生'],
    missions: ['概括信件主旨', '解释一个建议的理由', '补充一个具体例子'],
    keyPhrases: ['The purpose of my letter is to...', 'I recommend that...', 'This is because...', 'For example...'],
    exitHint: '说清主旨、理由和例子三部分',
    tags: ['书面表达', '建议信', '论证'],
  },

  // ── 大学英语四级 ─────────────────────────────────────────────────────────
  {
    id: 'sc_cet4_course', courseId: 'course_cet4', courseName: '大学英语四级', stage: '大学',
    title: '选课咨询', theme: '校园事务', level: '热身', minutes: 10, cefr: 'B1',
    scene: '大一学生想换一门通识课，但学分、时间和人数上限都有冲突，需要向教务老师说明。',
    setting: '教务处窗口，选课系统刚开放，屏幕上显示两门课都只剩少量名额。',
    roles: ['教务老师', '来咨询换课的大一学生'],
    missions: ['说明想换课的原因', '确认学分是否互认', '问清候补名单规则'],
    keyPhrases: ['I would like to switch from... to...', 'Are the credits transferable?', 'Could I join the waiting list?', 'What happens if the class is full?'],
    exitHint: '确认换课条件和下一步操作',
    tags: ['校园事务', '选课', '信息询问'],
  },
  {
    id: 'sc_cet4_parttime', courseId: 'course_cet4', courseName: '大学英语四级', stage: '大学',
    title: '兼职面试', theme: '求职入门', level: '挑战', minutes: 12, cefr: 'B1',
    scene: '校园咖啡店招周末兼职，店长询问可排班时间、相关经验和遇到忙乱时的处理方式。',
    setting: '午后的咖啡店角落，柜台不断出单，店长一边看简历一边确认排班表。',
    roles: ['咖啡店店长', '应聘周末兼职的大学生'],
    missions: ['说明可工作时间', '介绍一项相关能力', '回应高峰期如何协作'],
    keyPhrases: ['I am available on...', 'I have experience in...', 'When it gets busy, I...', 'I am willing to learn.'],
    exitHint: '确认排班并完成一次情境回答',
    tags: ['兼职面试', '时间安排', '情境应对'],
  },
  {
    id: 'sc_cet4_project', courseId: 'course_cet4', courseName: '大学英语四级', stage: '大学',
    title: '小组项目分工', theme: '团队协作', level: '实战', minutes: 15, cefr: 'B1',
    scene: '小组要做英文展示，有人一直没领任务，组长需要重新分工并确认截止时间。',
    setting: '图书馆讨论间，白板上写着三个空任务，离展示只剩四天。',
    roles: ['小组组长', '负责协调进度的组员'],
    missions: ['确认剩余任务', '重新分配一项工作', '设定明确检查点'],
    keyPhrases: ['Who can take responsibility for...?', 'Could we agree on a deadline?', 'Let us check progress on...', 'That works for me.'],
    exitHint: '所有任务有负责人并确认一个检查时间',
    tags: ['小组项目', '分工', '截止时间'],
  },

  // ── 大学英语六级 ─────────────────────────────────────────────────────────
  {
    id: 'sc_cet6_lecture', courseId: 'course_cet6', courseName: '大学英语六级', stage: '大学',
    title: '学术讲座提问', theme: '学术沟通', level: '挑战', minutes: 12, cefr: 'B2',
    scene: '讲座结束后，学生要就研究方法提出一个有依据的问题，并回应讲者的简短追问。',
    setting: '大学报告厅，讲者刚结束关于城市可持续交通的分享，麦克风正传到后排。',
    roles: ['讲座讲者', '准备提问的研究生'],
    missions: ['概括你关注的研究点', '提出一个具体问题', '回应讲者关于研究范围的追问'],
    keyPhrases: ['Thank you for your talk on...', 'I was wondering how you...', 'Does that also apply to...?', 'That helps clarify...'],
    exitHint: '提出一个聚焦问题并完成一轮追问',
    tags: ['学术讲座', '提问', '研究表达'],
  },
  {
    id: 'sc_cet6_interview', courseId: 'course_cet6', courseName: '大学英语六级', stage: '大学',
    title: '英文简历面试', theme: '职业发展', level: '实战', minutes: 15, cefr: 'B2',
    scene: '外企实习面试，面试官追问简历里的一项项目成果，并要求说明个人贡献和失败教训。',
    setting: '视频面试界面，倒计时显示 15 分钟，简历上的项目数字被荧光笔标出。',
    roles: ['外企面试官', '申请实习的大学生'],
    missions: ['用 STAR 结构讲一个项目', '说清个人贡献', '诚实总结一次失败'],
    keyPhrases: ['The situation was...', 'My responsibility was to...', 'As a result...', 'Looking back, I should have...'],
    exitHint: '完整讲清项目背景、行动、结果与反思',
    tags: ['实习面试', 'STAR', '成果表达'],
  },
  {
    id: 'sc_cet6_thesis', courseId: 'course_cet6', courseName: '大学英语六级', stage: '大学',
    title: '论文导师反馈', theme: '学术写作', level: '实战', minutes: 15, cefr: 'B2',
    scene: '导师认为文献综述缺乏主线，学生需要解释现有结构、接受修改建议并确认下一步。',
    setting: '导师办公室，打印稿上用不同颜色标出重复观点，屏幕停在文献表格页。',
    roles: ['论文导师', '准备修改文献综述的学生'],
    missions: ['解释当前综述结构', '回应主线不清的问题', '确认下一版提交时间'],
    keyPhrases: ['I organised the review by...', 'I see your point about...', 'I could restructure it around...', 'When would you like the next draft?'],
    exitHint: '明确一个新结构和下一版时间',
    tags: ['论文写作', '导师反馈', '修改计划'],
  },

  // ── 雅思 ─────────────────────────────────────────────────────────────────
  {
    id: 'sc_ielts_part1', courseId: 'course_ielts', courseName: '雅思', stage: '出国',
    title: '口语 Part 1 · Hometown', theme: '雅思口语', level: '挑战', minutes: 10, cefr: 'B2',
    scene: '雅思口语开场，考官连续询问家乡、居住变化和最喜欢的地方，要求自然展开而非只答一个词。',
    setting: '安静的雅思口语考场，考官坐在对面，录音设备亮着红灯。',
    roles: ['雅思口语考官', '参加模拟考试的考生'],
    missions: ['介绍家乡的一个特点', '说明近年的一处变化', '给出最喜欢地点的原因'],
    keyPhrases: ['It is known for...', 'Over the past few years...', 'What I like most is...', 'Partly because...'],
    exitHint: '三个问题都用两句以上完整回答',
    tags: ['雅思 Part 1', '家乡', '原因拓展'],
  },
  {
    id: 'sc_ielts_part2', courseId: 'course_ielts', courseName: '雅思', stage: '出国',
    title: '口语 Part 2 · 难忘旅程', theme: '雅思口语', level: '实战', minutes: 15, cefr: 'B2',
    scene: '考生需要围绕一次难忘旅程连续说两分钟，并自然覆盖人物、地点、发生的事和感受。',
    setting: '考场桌上放着题卡和铅笔，一分钟准备时间结束后必须立即开始。',
    roles: ['雅思口语考官', '进行 Part 2 陈述的考生'],
    missions: ['交代旅程背景', '描述一个具体瞬间', '解释为什么难忘'],
    keyPhrases: ['I would like to talk about...', 'What made it memorable was...', 'At one point...', 'Looking back, I feel...'],
    exitHint: '完成两分钟结构化陈述并覆盖题卡要点',
    tags: ['雅思 Part 2', '叙事', '时间线'],
  },
  {
    id: 'sc_ielts_part3', courseId: 'course_ielts', courseName: '雅思', stage: '出国',
    title: '口语 Part 3 · 城市交通', theme: '雅思口语', level: '实战', minutes: 15, cefr: 'B2',
    scene: '考官从个人经历追问到公共政策，要求考生比较不同方案、预测未来并给出有保留的观点。',
    setting: '口语考试后半段，考官连续追问，考生只有几秒组织答案。',
    roles: ['雅思口语考官', '参加 Part 3 讨论的考生'],
    missions: ['比较两种通勤方式', '说明一个政策影响', '预测未来五年的变化'],
    keyPhrases: ['On the one hand...', 'This could lead to...', 'It is likely that...', 'I would argue that..., although...'],
    exitHint: '完成比较、影响和预测三类回答',
    tags: ['雅思 Part 3', '比较', '预测'],
  },

  // ── 托福 ─────────────────────────────────────────────────────────────────
  {
    id: 'sc_toefl_registration', courseId: 'course_toefl', courseName: '托福', stage: '出国',
    title: '校园对话·选课冲突', theme: '托福听力', level: '挑战', minutes: 12, cefr: 'B2',
    scene: '学生发现两门必修课时间冲突，向学业顾问说明情况并询问替代方案。',
    setting: '大学学业咨询办公室，电脑上是课程系统，墙上贴着选课截止日期。',
    roles: ['学业顾问', '遇到选课冲突的学生'],
    missions: ['说明冲突的具体时间', '确认能否申请替代课', '记录下一步截止时间'],
    keyPhrases: ['I am enrolled in both...', 'They overlap on...', 'Is there an alternative?', 'Could you confirm the deadline?'],
    exitHint: '确认一个可行替代方案和日期',
    tags: ['托福校园场景', '选课', '问题解决'],
  },
  {
    id: 'sc_toefl_seminar', courseId: 'course_toefl', courseName: '托福', stage: '出国',
    title: '学术讨论·城市绿地', theme: '托福学术', level: '实战', minutes: 15, cefr: 'B2',
    scene: '课堂讨论城市绿地对气候的影响，学生要引用一个概念、回应同学观点并补充限制条件。',
    setting: '小型研讨课，投影展示城市热岛图，教授要求学生用证据回应而不是只表达喜好。',
    roles: ['研讨课教授', '参加讨论的学生'],
    missions: ['解释一个核心概念', '回应同学提出的反例', '补充一个研究限制'],
    keyPhrases: ['One explanation is that...', 'That may be true in..., but...', 'The evidence suggests...', 'A limitation of this view is...'],
    exitHint: '完成概念解释、回应和限制说明',
    tags: ['托福学术讨论', '环境科学', '让步'],
  },
  {
    id: 'sc_toefl_library', courseId: 'course_toefl', courseName: '托福', stage: '出国',
    title: '图书馆检索求助', theme: '托福校园场景', level: '挑战', minutes: 12, cefr: 'B2',
    scene: '学生找不到一篇指定论文，图书管理员要帮助其调整检索词、确认数据库并保存结果。',
    setting: '大学图书馆服务台，检索系统返回了太多无关结果，闭馆时间快到了。',
    roles: ['图书管理员', '赶论文的学生'],
    missions: ['说明要找的资料', '根据建议调整检索词', '确认如何保存和导出结果'],
    keyPhrases: ['I am looking for an article about...', 'Should I narrow the search by...?', 'Could you show me how to export...?', 'That gives me what I need.'],
    exitHint: '找到更精确的检索方式并完成保存',
    tags: ['托福校园场景', '图书馆', '检索'],
  },

  // ── 必背专题 · 动词全本 ────────────────────────────────────────────────
  {
    id: 'sc_verbs_routine', courseId: 'course_verbs', courseName: '动词全本', stage: '必背专题',
    title: '一天动作接力', theme: '高频动作动词', level: '热身', minutes: 9, cefr: 'A1',
    scene: '陪练用时间线带你复述一天，每一步都要换一个准确的动词，不能只说 do 或 go。',
    setting: '清晨到夜晚的一日时间线贴在墙上，每个时间点旁边都有一个动作图标。',
    roles: ['口语教练', '正在复述一天安排的学习者'],
    missions: ['用 5 个动作动词说清早晨流程', '区分 make 与 do 的搭配', '复述今晚要做的一件事'],
    keyPhrases: ['I wake up at...', 'I get dressed and have breakfast.', 'I make... / I do...', 'After dinner, I usually...'],
    exitHint: '连续说出至少六个准确的动作搭配',
    tags: ['动词搭配', '日常流程', '高频词'],
  },
  {
    id: 'sc_verbs_weekend', courseId: 'course_verbs', courseName: '动词全本', stage: '必背专题',
    title: '周末复盘', theme: '过去式动词', level: '挑战', minutes: 12, cefr: 'A2',
    scene: '朋友问你这个周末做了什么，你需要用过去式讲三件事，并说明其中一件为什么没做成。',
    setting: '周日晚上的咖啡桌旁，手机里还留着周末拍的照片。',
    roles: ['好奇的朋友', '刚过完周末的你'],
    missions: ['用过去式讲三件事', '解释一个没完成的计划', '追问朋友的一个周末活动'],
    keyPhrases: ['I went...', 'I tried to..., but...', 'I did not manage to...', 'What did you do at the weekend?'],
    exitHint: '完成一次过去式叙事和一次相互追问',
    tags: ['一般过去时', '不规则动词', '叙事'],
  },
  {
    id: 'sc_verbs_project', courseId: 'course_verbs', courseName: '动词全本', stage: '必背专题',
    title: '项目分工', theme: '协作动作动词', level: '实战', minutes: 12, cefr: 'B1',
    scene: '三个人要在一小时内完成展示准备，你必须用清楚的动词分配任务并确认谁负责什么。',
    setting: '项目室的倒计时已经开始，白板上写着设计、资料、排练三个待办。',
    roles: ['项目负责人', '负责协调任务的组员'],
    missions: ['分配三项行动任务', '确认负责人和截止时间', '提出一个替代动作方案'],
    keyPhrases: ['Could you prepare...?', 'I will handle...', 'Who is going to check...?', 'Let us switch to...'],
    exitHint: '三项任务都落到明确负责人并复述截止时间',
    tags: ['动作动词', '项目协作', '指令表达'],
  },

  // ── 必背专题 · 名词分类 ────────────────────────────────────────────────
  {
    id: 'sc_nouns_supermarket', courseId: 'course_nouns', courseName: '名词分类', stage: '必背专题',
    title: '超市分类采购', theme: '可数与不可数名词', level: '热身', minutes: 9, cefr: 'A1',
    scene: '你拿着采购清单在超市找东西，需要分清可数名词和不可数名词，并用正确数量表达。',
    setting: '超市货架分成饮料、蔬果、日用三个区域，购物篮里已经有几样东西。',
    roles: ['超市导购', '拿着采购清单的顾客'],
    missions: ['说出三类商品名称', '区分 a bottle of 与 some', '确认清单上的最后一项'],
    keyPhrases: ['I am looking for...', 'Could I have a bottle of...?', 'We need some...', 'Is this in the right section?'],
    exitHint: '完成清单并正确使用至少三组数量表达',
    tags: ['可数名词', '不可数名词', '购物'],
  },
  {
    id: 'sc_nouns_airport', courseId: 'course_nouns', courseName: '名词分类', stage: '必背专题',
    title: '机场行李清单', theme: '旅行名词', level: '挑战', minutes: 11, cefr: 'A2',
    scene: '值机前你发现行李超重，需要向工作人员说明物品类别并决定哪些随身携带。',
    setting: '机场值机柜台，传送带旁放着行李秤和一张禁止托运物品清单。',
    roles: ['值机工作人员', '行李超重的旅客'],
    missions: ['说明行李中的三类物品', '询问哪些物品必须随身带', '确认一件物品的正确名称'],
    keyPhrases: ['There are some... in my bag.', 'Is this allowed in carry-on luggage?', 'I need to keep... with me.', 'What is this item called in English?'],
    exitHint: '完成物品分类并处理好超重行李',
    tags: ['旅行名词', '分类表达', '机场'],
  },
  {
    id: 'sc_nouns_academic', courseId: 'course_nouns', courseName: '名词分类', stage: '必背专题',
    title: '学术名词归类', theme: '学习与研究名词', level: '实战', minutes: 13, cefr: 'B1',
    scene: '你要把一组学习名词放进“资料、方法、结果”三栏，并向同伴解释分类理由。',
    setting: '小组讨论桌上摊着论文、问卷和方法卡片，白板分成三列。',
    roles: ['研究小组成员', '负责整理术语的你'],
    missions: ['把六个名词分入三栏', '解释两个分类理由', '用准确名词总结研究过程'],
    keyPhrases: ['This belongs to...', 'The reason is that...', 'It refers to...', 'Our method and result are...'],
    exitHint: '完成六项分类并清楚说明两类名词差异',
    tags: ['学术名词', '分类', '解释'],
  },

  // ── 必背专题 · 动植物分类 ──────────────────────────────────────────────
  {
    id: 'sc_nature_zoo', courseId: 'course_nature', courseName: '动植物分类', stage: '必背专题',
    title: '动物园导览', theme: '动物名称与习性', level: '热身', minutes: 9, cefr: 'A1',
    scene: '你是动物园小导览员，要带游客认识三种动物，并说出它们生活在哪里、吃什么。',
    setting: '动物园导览图前，游客拿着贴有动物图片的任务卡。',
    roles: ['动物园导览员', '第一次来动物园的游客'],
    missions: ['介绍三种动物名称', '说明一种动物的栖息地', '回答游客的一个追问'],
    keyPhrases: ['This is a...', 'It lives in...', 'It mainly eats...', 'Do you have any questions?'],
    exitHint: '完成三种动物介绍并回答一个追问',
    tags: ['动物词汇', '栖息地', '导览'],
  },
  {
    id: 'sc_nature_garden', courseId: 'course_nature', courseName: '动植物分类', stage: '必背专题',
    title: '植物园观察', theme: '植物部位与生长', level: '挑战', minutes: 11, cefr: 'A2',
    scene: '你在植物园做观察记录，需要描述叶、根、种子和花，并比较两种植物的差异。',
    setting: '温室里有标牌、放大镜和观察记录本，光线从玻璃屋顶落下来。',
    roles: ['植物园讲解员', '做观察记录的学生'],
    missions: ['说出四个植物部位', '描述一种植物的生长条件', '比较两种植物的一个差异'],
    keyPhrases: ['The leaves are...', 'Roots take in...', 'It grows well in...', 'Compared with..., this plant...'],
    exitHint: '完成四个部位描述和一个植物比较',
    tags: ['植物词汇', '生长条件', '比较'],
  },
  {
    id: 'sc_nature_documentary', courseId: 'course_nature', courseName: '动植物分类', stage: '必背专题',
    title: '自然纪录片旁白', theme: '生态与分类', level: '实战', minutes: 13, cefr: 'B1',
    scene: '你要为一段无声自然影像配英文旁白，既要说出物种名称，也要解释它们与环境的关系。',
    setting: '剪辑室里播放森林与湿地的无声画面，脚本只写了关键词和分类标签。',
    roles: ['纪录片导演', '撰写并试读旁白的你'],
    missions: ['描述画面中的两个物种', '解释一个生态关系', '使用分类词概括场景'],
    keyPhrases: ['In this scene, we can see...', 'This species depends on...', 'It belongs to the group of...', 'Together they form...'],
    exitHint: '完成一段连贯旁白并覆盖物种、关系和分类',
    tags: ['生态词汇', '物种分类', '旁白'],
  },

  // ── 必背专题 · 时态必背 ────────────────────────────────────────────────
  {
    id: 'sc_tenses_routine', courseId: 'course_tenses', courseName: '时态必背', stage: '必背专题',
    title: '现在习惯 vs 今天动作', theme: '一般现在时 / 现在进行时', level: '热身', minutes: 9, cefr: 'A1',
    scene: '你需要先说自己平时的习惯，再说今天此刻正在做什么，让两种时态自然对照。',
    setting: '上午的学习桌前，日历上标着每天安排，旁边是一杯正在冒热气的茶。',
    roles: ['学习教练', '正在整理日程的学习者'],
    missions: ['说两个日常习惯', '说两个此刻正在做的动作', '纠正一个第三人称单数错误'],
    keyPhrases: ['I usually...', 'She often...', 'Right now I am...', 'He is not... at the moment.'],
    exitHint: '完成习惯与当下动作的对照表达',
    tags: ['一般现在时', '现在进行时', '第三人称单数'],
  },
  {
    id: 'sc_tenses_trip', courseId: 'course_tenses', courseName: '时态必背', stage: '必背专题',
    title: '旅行经历复盘', theme: '一般过去时 / 现在完成时', level: '挑战', minutes: 12, cefr: 'A2',
    scene: '朋友问你旅行经历，你要区分具体某次发生了什么和到目前为止已经去过哪些地方。',
    setting: '旅行分享会上，桌上有车票、照片和一本盖满印章的护照。',
    roles: ['旅行分享会主持人', '分享经历的旅行者'],
    missions: ['用过去式讲一次具体经历', '用现在完成时说总体经历', '回答 have been 与 went 的差别'],
    keyPhrases: ['Last year I went...', 'I have been to...', 'I have never tried...', 'I went there in..., so I used...'],
    exitHint: '正确区分一次过去经历和至今累计经历',
    tags: ['一般过去时', '现在完成时', '旅行'],
  },
  {
    id: 'sc_tenses_plan', courseId: 'course_tenses', courseName: '时态必背', stage: '必背专题',
    title: '明日计划与已经完成', theme: '将来时 / 现在完成时', level: '实战', minutes: 13, cefr: 'B1',
    scene: '项目例会要求你说明哪些任务已经完成、哪些明天会做，并解释一个计划变化。',
    setting: '会议屏幕上是任务看板，已完成、进行中、明天三列颜色不同。',
    roles: ['项目经理', '汇报进度的组员'],
    missions: ['说明两项已完成任务', '说明两项明天将做的任务', '解释一次计划变化'],
    keyPhrases: ['I have already finished...', 'I have not completed... yet.', 'I am going to...', 'The plan changed because...'],
    exitHint: '清楚区分已完成、未完成和将来计划',
    tags: ['将来时', '现在完成时', '项目汇报'],
  },
];

type TopicSceneMeta = {
  courseId: string;
  courseName: string;
  theme: string;
  roles: [string, string];
  phrases: [string, string, string];
  coachEn: string;
  coachZh: string;
  userEn: string;
  userPhonetic: string;
  userZh: string;
};

const TOPIC_SCENE_META: TopicSceneMeta[] = [
  {
    courseId: 'course_objects', courseName: '生活物品', theme: '居家收纳',
    roles: ['室友', '正在整理房间的你'],
    phrases: ['Where can I find...?', 'Could you pass me...?', 'It is next to...'],
    coachEn: 'Where do you usually keep the towels?',
    coachZh: '你通常把毛巾放在哪里？',
    userEn: 'I keep the towels in the drawer next to the sink.',
    userPhonetic: '/aɪ kiːp ðə ˈtaʊəlz ɪn ðə drɔːr nɛkst tə ðə sɪŋk/',
    userZh: '我把毛巾放在水槽旁边的抽屉里。',
  },
  {
    courseId: 'course_food', courseName: '食物与饮品', theme: '点餐与饮食',
    roles: ['餐厅服务员', '正在点餐的顾客'],
    phrases: ['I would like...', 'Does it contain...?', 'Could I have...?'],
    coachEn: 'What would you like to order?',
    coachZh: '你想点些什么？',
    userEn: 'I would like a chicken sandwich and a cup of tea.',
    userPhonetic: '/aɪ wʊd laɪk ə ˈtʃɪkɪn ˈsænwɪtʃ ænd ə kʌp əv tiː/',
    userZh: '我想要一个鸡肉三明治和一杯茶。',
  },
  {
    courseId: 'course_body', courseName: '身体与健康', theme: '看诊与健康',
    roles: ['全科医生', '描述身体不适的病人'],
    phrases: ['I have a pain in...', 'How long have you felt...?', 'Should I...?'],
    coachEn: 'What seems to be the problem today?',
    coachZh: '今天哪里不舒服？',
    userEn: 'I have a sore throat and a headache.',
    userPhonetic: '/aɪ hæv ə sɔːr θroʊt ænd ə ˈhɛdeɪk/',
    userZh: '我喉咙痛，还有点头疼。',
  },
  {
    courseId: 'course_spoken', courseName: '口语高频句', theme: '自然口语回应',
    roles: ['新同事', '参加午休聊天的你'],
    phrases: ['What’s up?', 'Sounds good.', 'I’m running late.'],
    coachEn: 'How is your morning going so far?',
    coachZh: '你今天上午过得怎么样？',
    userEn: 'Pretty good, but I’m running late for the next meeting.',
    userPhonetic: '/ˈprɪti ɡʊd bʌt aɪm ˈrʌnɪŋ leɪt fər ðə nɛkst ˈmiːtɪŋ/',
    userZh: '挺好的，不过我下一个会议要迟到了。',
  },
  {
    courseId: 'course_idioms', courseName: '英语习语', theme: '地道习语',
    roles: ['英语口语教练', '练习地道表达的学习者'],
    phrases: ['It’s a piece of cake.', 'I’m under the weather.', 'Let’s call it a day.'],
    coachEn: 'How would you describe a task that is very easy?',
    coachZh: '你会怎样形容一项非常容易的任务？',
    userEn: 'It’s a piece of cake—I can finish it in ten minutes.',
    userPhonetic: '/ɪts ə piːs əv keɪk aɪ kæn ˈfɪnɪʃ ɪt ɪn tɛn ˈmɪnɪts/',
    userZh: '这很容易，我十分钟就能完成。',
  },
];

for (const meta of TOPIC_SCENE_META) {
  const key = meta.courseId.replace(/^course_/, '');
  SCENE_CARDS.push(
    {
      id: `sc_${key}_warm`, courseId: meta.courseId, courseName: meta.courseName, stage: '必背专题',
      title: `${meta.courseName} · 分类热身`, theme: meta.theme, level: '热身', minutes: 9, cefr: 'A2',
      scene: `用一组${meta.courseName}常用词完成分类和辨认，先把最容易混淆的词说清楚。`,
      setting: `一张写着不同${meta.courseName}词汇的任务卡，旁边放着分类框和提示卡。`,
      roles: meta.roles,
      missions: ['辨认四组常用词', '说出一个分类理由', '向陪练确认一个容易混淆的词'],
      keyPhrases: meta.phrases,
      exitHint: '完成四组辨认并准确解释一组分类',
      tags: [meta.courseName, '分类', '热身'],
    },
    {
      id: `sc_${key}_scene`, courseId: meta.courseId, courseName: meta.courseName, stage: '必背专题',
      title: `${meta.courseName} · 情景应用`, theme: meta.theme, level: '挑战', minutes: 12, cefr: 'B1',
      scene: `把${meta.courseName}词汇放进真实情景，用完整句子完成一次双向往返交流。`,
      setting: `日常场景中，陪练拿出任务卡，要求你不要只说单词，而要用完整句完成沟通。`,
      roles: meta.roles,
      missions: ['用三个目标词说清需求', '追问一个细节', '根据回复调整自己的表达'],
      keyPhrases: meta.phrases,
      exitHint: '连续完成三轮完整句交流并正确使用三个目标词',
      tags: [meta.courseName, '情景对话', '完整句'],
    },
    {
      id: `sc_${key}_native`, courseId: meta.courseId, courseName: meta.courseName, stage: '必背专题',
      title: `${meta.courseName} · 自然表达`, theme: meta.theme, level: '实战', minutes: 13, cefr: 'B2',
      scene: `不只把词说对，还要说得自然：练习搭配、语气和地道的收尾方式。`,
      setting: `陪练模拟母语者语速和追问，要求你解释一个词、替换一个更自然的说法。`,
      roles: meta.roles,
      missions: ['解释一个目标表达的语境', '替换一个不自然的说法', '用自然语气完成总结'],
      keyPhrases: meta.phrases,
      exitHint: '完成解释、替换和总结，输出能直接用于口语的表达',
      tags: [meta.courseName, '地道表达', '输出'],
    },
  );
}

export type SceneGuide = {
  /** 模型开场句：用户可以先听，再照着回答 */
  coachEn: string;
  coachZh: string;
  /** 第一轮轮到用户说的句子 */
  userEn: string;
  userPhonetic: string;
  userZh: string;
};

export type SceneCardView = SceneCard & { guide: SceneGuide };

/**
 * 场景首轮台本。简单模式显示完整的中英 + 音标；中级只显示英文；高级默认隐藏。
 * 台本只负责把用户送进第一轮，后续由陪练按用户实际回答继续生成。
 */
const SCENE_GUIDES: Record<string, SceneGuide> = {
  sc_letters_hello: {
    coachEn: 'Hello! Welcome to our English class. What is your name?',
    coachZh: '你好！欢迎来到英语课。你叫什么名字？',
    userEn: 'Hello, my name is...',
    userPhonetic: '/həˈloʊ, maɪ neɪm ɪz/',
    userZh: '你好，我的名字是……',
  },
  sc_letters_classroom: {
    coachEn: 'Let us find the book first. Where is the book?',
    coachZh: '我们先找书。书在哪里？',
    userEn: 'It is on the desk.',
    userPhonetic: '/ɪt ɪz ɑːn ðə desk/',
    userZh: '它在桌子上。',
  },
  sc_letters_sound: {
    coachEn: 'Listen carefully. Do you hear ship or sheep?',
    coachZh: '仔细听。你听到的是 ship 还是 sheep？',
    userEn: 'I hear ship.',
    userPhonetic: '/aɪ hɪr ʃɪp/',
    userZh: '我听到的是 ship。',
  },
  sc_junior1_firstday: {
    coachEn: 'Welcome to Class Seven. Where are you from?',
    coachZh: '欢迎来到七班。你来自哪里？',
    userEn: 'I am from Chengdu.',
    userPhonetic: '/aɪ æm frəm ˈtʃɜːŋˈduː/',
    userZh: '我来自成都。',
  },
  sc_junior1_canteen: {
    coachEn: 'Good afternoon! What would you like today?',
    coachZh: '下午好！今天想吃点什么？',
    userEn: 'I would like rice and chicken, please.',
    userPhonetic: '/aɪ wʊd laɪk raɪs ænd ˈtʃɪkɪn pliːz/',
    userZh: '我想要米饭和鸡肉，谢谢。',
  },
  sc_junior1_weekend: {
    coachEn: 'Do you want to see a movie this Saturday?',
    coachZh: '这周六你想去看电影吗？',
    userEn: 'I have to visit my grandparents, but I am free on Sunday.',
    userPhonetic: '/aɪ hæv tə ˈvɪzɪt maɪ ˈɡrænpeərənts bʌt aɪ æm friː ɑːn ˈsʌndeɪ/',
    userZh: '我要去看望祖父母，但周日有空。',
  },
  sc_junior2_directions: {
    coachEn: 'You look lost. Where do you want to go?',
    coachZh: '你看起来迷路了。你想去哪里？',
    userEn: 'How do I get to the subway station?',
    userPhonetic: '/haʊ duː aɪ ɡet tə ðə ˈsʌbweɪ ˈsteɪʃən/',
    userZh: '去地铁站怎么走？',
  },
  sc_junior2_duty: {
    coachEn: 'We have three jobs today. Who wants to clean the board?',
    coachZh: '今天有三项任务。谁想擦黑板？',
    userEn: 'I can clean the board, and you can sweep the floor.',
    userPhonetic: '/aɪ kæn kliːn ðə bɔːrd ænd juː kæn swiːp ðə flɔːr/',
    userZh: '我可以擦黑板，你可以扫地。',
  },
  sc_junior2_penpal: {
    coachEn: 'Hi! It is great to finally meet you online. What is your school day like?',
    coachZh: '嗨！终于在网上见到你了。你的学校生活是什么样的？',
    userEn: 'My school day starts at eight and ends at five.',
    userPhonetic: '/maɪ skuːl deɪ stɑːrts æt eɪt ænd endz æt faɪv/',
    userZh: '我的学校生活八点开始，五点结束。',
  },
  sc_junior3_oral: {
    coachEn: 'Your first question is: how do you spend your free time?',
    coachZh: '你的第一个问题是：你如何安排课余时间？',
    userEn: 'I usually spend my free time reading and playing basketball.',
    userPhonetic: '/aɪ ˈjuːʒuəli spend maɪ friː taɪm ˈriːdɪŋ ænd ˈpleɪɪŋ ˈbæskɪtbɔːl/',
    userZh: '我通常把课余时间用来读书和打篮球。',
  },
  sc_junior3_club: {
    coachEn: 'Why do you want to join the photography club?',
    coachZh: '你为什么想加入摄影社？',
    userEn: 'I am interested in photography because I enjoy telling stories with pictures.',
    userPhonetic: '/aɪ æm ˈɪntrəstɪd ɪn fəˈtɑːɡrəfi bɪˈkɔːz aɪ ɪnˈdʒɔɪ ˈtelɪŋ ˈstɔːriz wɪð ˈpɪktʃərz/',
    userZh: '我对摄影感兴趣，因为我喜欢用照片讲故事。',
  },
  sc_junior3_travel: {
    coachEn: 'Which place do you think we should choose for our graduation trip?',
    coachZh: '你觉得毕业旅行应该选哪里？',
    userEn: 'I suggest that we visit Hangzhou because it is beautiful and easy to reach.',
    userPhonetic: '/aɪ səˈdʒest ðæt wiː ˈvɪzɪt hɑːŋˈdʒoʊ bɪˈkɔːz ɪt ɪz ˈbjuːtəfəl ænd ˈiːzi tə riːtʃ/',
    userZh: '我建议去杭州，因为那里风景好，交通也方便。',
  },
  sc_senior1_club: {
    coachEn: 'Please introduce yourself and tell us one strength you can bring to the club.',
    coachZh: '请介绍一下自己，并说说你能为社团带来的一项优势。',
    userEn: 'I am good at planning activities, and I enjoy working with a team.',
    userPhonetic: '/aɪ æm ɡʊd æt ˈplænɪŋ ækˈtɪvətiz ænd aɪ ɪnˈdʒɔɪ ˈwɜːrkɪŋ wɪð ə tiːm/',
    userZh: '我擅长策划活动，也喜欢团队合作。',
  },
  sc_senior1_presentation: {
    coachEn: 'Your presentation has ended. Can you summarise your main conclusion?',
    coachZh: '你的展示结束了。能概括一下主要结论吗？',
    userEn: 'To sum up, small changes in daily habits can make a real difference.',
    userPhonetic: '/tə sʌm ʌp smɔːl ˈtʃeɪndʒɪz ɪn ˈdeɪli ˈhæbɪts kæn meɪk ə riːl ˈdɪfrəns/',
    userZh: '总的来说，日常习惯的小改变能带来真正的不同。',
  },
  sc_senior1_homestay: {
    coachEn: 'How was your first day at school? Would you like some more stew?',
    coachZh: '你第一天在学校怎么样？想再来点炖菜吗？',
    userEn: 'It was my first time trying this dish. It tastes better than I expected.',
    userPhonetic: '/ɪt wəz maɪ fɜːrst taɪm ˈtraɪɪŋ ðɪs dɪʃ ɪt teɪsts ˈbetər ðæn aɪ ɪkˈspektɪd/',
    userZh: '这是我第一次吃这道菜。它比我预想的更好吃。',
  },
  sc_senior2_volunteer: {
    coachEn: 'Thanks for coming. What exactly would you like to help with on Saturday?',
    coachZh: '谢谢你来。周六你具体想帮忙做什么？',
    userEn: 'I would like to help with the sign-in desk and guide the younger children.',
    userPhonetic: '/aɪ wʊd laɪk tə help wɪð ðə saɪn ɪn desk ænd ɡaɪd ðə ˈjʌŋɡər ˈtʃɪldrən/',
    userZh: '我想在签到台帮忙，并引导小朋友。',
  },
  sc_senior2_major: {
    coachEn: 'Which subject are you most curious about right now?',
    coachZh: '你现在对哪个学科最感兴趣？',
    userEn: 'I have always been curious about psychology and how people make decisions.',
    userPhonetic: '/aɪ hæv ˈɔːlweɪz bɪn ˈkjʊriəs əˈbaʊt saɪˈkɑːlədʒi ænd haʊ ˈpiːpəl meɪk dɪˈsɪʒənz/',
    userZh: '我一直对心理学以及人如何做决定感到好奇。',
  },
  sc_senior2_debate: {
    coachEn: 'You are on the affirmative side. What is your first argument?',
    coachZh: '你是正方。你的第一个论点是什么？',
    userEn: 'My first argument is that AI can give students immediate feedback.',
    userPhonetic: '/maɪ fɜːrst ˈɑːrɡjəmənt ɪz ðæt eɪ aɪ kæn ɡɪv ˈstuːdənts ɪˈmiːdiət ˈfiːdbæk/',
    userZh: '我的第一个论点是，AI 能给学生即时反馈。',
  },
  sc_gaokao_speaking: {
    coachEn: 'Now answer the question: how do you balance study and exercise?',
    coachZh: '现在回答问题：你如何平衡学习和运动？',
    userEn: 'I make a weekly plan so that I can study first and exercise after dinner.',
    userPhonetic: '/aɪ meɪk ə ˈwiːkli plæn soʊ ðæt aɪ kæn ˈstʌdi fɜːrst ænd ˈeksərsaɪz ˈæftər ˈdɪnər/',
    userZh: '我会制定周计划，先学习，晚饭后运动。',
  },
  sc_gaokao_listening: {
    coachEn: 'Your flight has been delayed. What would you like to know?',
    coachZh: '你的航班延误了。你想了解什么？',
    userEn: 'Could you tell me the new departure time and gate?',
    userPhonetic: '/kʊd juː tel miː ðə nuː dɪˈpɑːrtʃər taɪm ænd ɡeɪt/',
    userZh: '能告诉我新的起飞时间和登机口吗？',
  },
  sc_gaokao_advice: {
    coachEn: 'Let us talk about your advice letter. What is its main purpose?',
    coachZh: '我们来谈谈你的建议信。它的主要目的是什么？',
    userEn: 'The purpose of my letter is to help younger students manage their time.',
    userPhonetic: '/ðə ˈpɜːrpəs əv maɪ ˈletər ɪz tə help ˈjʌŋɡər ˈstuːdənts ˈmænɪdʒ ðer taɪm/',
    userZh: '这封信的目的是帮助学弟学妹管理时间。',
  },
  sc_cet4_course: {
    coachEn: 'Good morning. Which course would you like to change?',
    coachZh: '早上好。你想换哪门课？',
    userEn: 'I would like to switch from Art History to Psychology.',
    userPhonetic: '/aɪ wʊd laɪk tə swɪtʃ frəm ɑːrt ˈhɪstəri tə saɪˈkɑːlədʒi/',
    userZh: '我想从艺术史换到心理学。',
  },
  sc_cet4_parttime: {
    coachEn: 'Welcome to the interview. When are you available to work?',
    coachZh: '欢迎来面试。你什么时候可以工作？',
    userEn: 'I am available on Saturday and Sunday afternoons.',
    userPhonetic: '/aɪ æm əˈveɪləbəl ɑːn ˈsætərdeɪ ænd ˈsʌndeɪ ˈæftərnuːnz/',
    userZh: '我周六和周日下午都有空。',
  },
  sc_cet4_project: {
    coachEn: 'We still have two tasks left. Who can take responsibility for the slides?',
    coachZh: '我们还有两项任务。谁可以负责幻灯片？',
    userEn: 'I can take responsibility for the slides and finish them by Tuesday.',
    userPhonetic: '/aɪ kæn teɪk rɪˌspɑːnsəˈbɪləti fər ðə slaɪdz ænd ˈfɪnɪʃ ðem baɪ ˈtuːzdeɪ/',
    userZh: '我可以负责幻灯片，并在周二前完成。',
  },
  sc_cet6_lecture: {
    coachEn: 'Thank you. We have time for one question from the audience.',
    coachZh: '谢谢。我们还有时间接受一位观众的提问。',
    userEn: 'Thank you for your talk. I was wondering how you measured the long-term impact.',
    userPhonetic: '/θæŋk juː fər jɔːr tɔːk aɪ wəz ˈwʌndərɪŋ haʊ juː ˈmeʒərd ðə lɔːŋ tɜːrm ˈɪmpækt/',
    userZh: '谢谢您的讲座。我想知道你们如何衡量长期影响。',
  },
  sc_cet6_interview: {
    coachEn: 'Your resume mentions this project. What was your personal contribution?',
    coachZh: '你的简历提到了这个项目。你个人的贡献是什么？',
    userEn: 'My responsibility was to analyse the user data and present our findings.',
    userPhonetic: '/maɪ rɪˌspɑːnsəˈbɪləti wəz tə ˈænəlaɪz ðə ˈjuːzər ˈdeɪtə ænd prɪˈzent aʊər ˈfaɪndɪŋz/',
    userZh: '我的职责是分析用户数据并汇报发现。',
  },
  sc_cet6_thesis: {
    coachEn: 'The literature review feels fragmented. How did you organise it?',
    coachZh: '文献综述看起来有些零散。你是如何组织的？',
    userEn: 'I organised the review by theme, but I can restructure it around the research question.',
    userPhonetic: '/aɪ ˈɔːrɡənaɪzd ðə rɪˈvjuː baɪ θiːm bʌt aɪ kæn ˌriːˈstrʌktʃər ɪt əˈraʊnd ðə rɪˈsɜːrtʃ ˈkwestʃən/',
    userZh: '我按主题组织综述，但也可以围绕研究问题重写结构。',
  },
  sc_ielts_part1: {
    coachEn: 'Let us talk about your hometown. What is it like?',
    coachZh: '我们来聊聊你的家乡。那里是什么样的？',
    userEn: 'It is a lively city known for its food and friendly people.',
    userPhonetic: '/ɪt ɪz ə ˈlaɪvli ˈsɪti noʊn fər ɪts fuːd ænd ˈfrendli ˈpiːpəl/',
    userZh: '它是一座热闹的城市，以美食和友好的人闻名。',
  },
  sc_ielts_part2: {
    coachEn: 'I would like you to describe a journey you will never forget.',
    coachZh: '请描述一次你永远不会忘记的旅行。',
    userEn: 'I would like to talk about a trip to the mountains last summer.',
    userPhonetic: '/aɪ wʊd laɪk tə tɔːk əˈbaʊt ə trɪp tə ðə ˈmaʊntənz læst ˈsʌmər/',
    userZh: '我想谈谈去年夏天的一次山区旅行。',
  },
  sc_ielts_part3: {
    coachEn: 'Why do some people prefer public transport while others prefer driving?',
    coachZh: '为什么有些人更喜欢公共交通，而另一些人更喜欢开车？',
    userEn: 'On the one hand, public transport is cheaper, but driving can be more convenient.',
    userPhonetic: '/ɑːn ðə wʌn hænd ˈpʌblɪk ˈtrænspɔːrt ɪz ˈtʃiːpər bʌt ˈdraɪvɪŋ kæn biː mɔːr kənˈviːniənt/',
    userZh: '一方面，公共交通更便宜；但开车可能更方便。',
  },
  sc_toefl_registration: {
    coachEn: 'Tell me which two courses are conflicting.',
    coachZh: '告诉我哪两门课时间冲突。',
    userEn: 'My biology lab and statistics lecture overlap on Tuesday morning.',
    userPhonetic: '/maɪ baɪˈɑːlədʒi læb ænd stəˈtɪstɪks ˈlektʃər ˌoʊvərˈlæp ɑːn ˈtuːzdeɪ ˈmɔːrnɪŋ/',
    userZh: '我的生物实验课和统计讲座周二上午冲突。',
  },
  sc_toefl_seminar: {
    coachEn: 'How do urban green spaces affect the local climate?',
    coachZh: '城市绿地如何影响当地气候？',
    userEn: 'One explanation is that green spaces reduce the urban heat island effect.',
    userPhonetic: '/wʌn ˌekspləˈneɪʃən ɪz ðæt ɡriːn speɪsɪz rɪˈduːs ðə ˈɜːrbən hiːt ˈaɪlənd ɪˈfekt/',
    userZh: '一种解释是，绿地能减轻城市热岛效应。',
  },
  sc_toefl_library: {
    coachEn: 'What article are you looking for today?',
    coachZh: '你今天想找哪篇文章？',
    userEn: 'I am looking for an article about sustainable city design.',
    userPhonetic: '/aɪ æm ˈlʊkɪŋ fər ən ˈɑːrtɪkəl əˈbaʊt səˈsteɪnəbəl ˈsɪti dɪˈzaɪn/',
    userZh: '我在找一篇关于可持续城市设计的文章。',
  },
  sc_verbs_routine: {
    coachEn: 'Tell me what you usually do before breakfast.',
    coachZh: '告诉我你早餐前通常会做什么。',
    userEn: 'I usually wake up at seven and get dressed before breakfast.',
    userPhonetic: '/aɪ ˈjuːʒuəli weɪk ʌp æt ˈsevən ænd ɡet drest bɪˈfɔːr ˈbrekfəst/',
    userZh: '我通常七点起床，早餐前穿好衣服。',
  },
  sc_verbs_weekend: {
    coachEn: 'What did you do last weekend?',
    coachZh: '你上周末做了什么？',
    userEn: 'I went hiking with a friend and tried to finish a book.',
    userPhonetic: '/aɪ went ˈhaɪkɪŋ wɪð ə frend ænd traɪd tə ˈfɪnɪʃ ə bʊk/',
    userZh: '我和朋友去徒步了，还试着读完一本书。',
  },
  sc_verbs_project: {
    coachEn: 'Could you prepare the slides and check the data?',
    coachZh: '你能准备幻灯片并核对数据吗？',
    userEn: 'Sure, I will handle the slides and ask Mia to check the data.',
    userPhonetic: '/ʃʊr aɪ wɪl ˈhændəl ðə slaɪdz ænd æsk ˈmiːə tə tʃek ðə ˈdeɪtə/',
    userZh: '可以，我负责幻灯片，并请米娅核对数据。',
  },
  sc_nouns_supermarket: {
    coachEn: 'What are you looking for in this section?',
    coachZh: '你在这个区域找什么？',
    userEn: 'I need a bottle of milk and some fresh fruit.',
    userPhonetic: '/aɪ niːd ə ˈbɑːtəl əv mɪlk ænd sʌm freʃ fruːt/',
    userZh: '我需要一瓶牛奶和一些新鲜水果。',
  },
  sc_nouns_airport: {
    coachEn: 'What is inside your checked bag?',
    coachZh: '你的托运行李里有什么？',
    userEn: 'There are some clothes and a pair of shoes in my bag.',
    userPhonetic: '/ðer ɑːr sʌm kloʊðz ænd ə per əv ʃuːz ɪn maɪ bæɡ/',
    userZh: '我的包里有几件衣服和一双鞋。',
  },
  sc_nouns_academic: {
    coachEn: 'Which column does this term belong to?',
    coachZh: '这个术语应该归到哪一栏？',
    userEn: 'This term belongs to the method column because it describes how we collect data.',
    userPhonetic: '/ðɪs tɜːrm bɪˈlɔːŋz tə ðə ˈmeθəd ˈkɑːləm bɪˈkɔːz ɪt dɪˈskraɪbz haʊ wi kəˈlekt ˈdeɪtə/',
    userZh: '这个术语归在方法栏，因为它描述我们如何收集数据。',
  },
  sc_nature_zoo: {
    coachEn: 'Which animal would you like to introduce first?',
    coachZh: '你想先介绍哪种动物？',
    userEn: 'This is a deer. It lives in the forest and mainly eats plants.',
    userPhonetic: '/ðɪs ɪz ə dɪr ɪt lɪvz ɪn ðə ˈfɔːrɪst ænd ˈmeɪnli iːts plænts/',
    userZh: '这是一只鹿。它生活在森林里，主要吃植物。',
  },
  sc_nature_garden: {
    coachEn: 'What can you see on this plant?',
    coachZh: '你在这株植物上能看到什么？',
    userEn: 'The leaves are green, and the roots take in water from the soil.',
    userPhonetic: '/ðə liːvz ɑːr ɡriːn ænd ðə ruːts teɪk ɪn ˈwɔːtər frəm ðə sɔɪl/',
    userZh: '叶子是绿色的，根从土壤里吸收水分。',
  },
  sc_nature_documentary: {
    coachEn: 'What can we see in this scene?',
    coachZh: '我们在这个画面里能看到什么？',
    userEn: 'In this scene, we can see a river and several birds near the forest.',
    userPhonetic: '/ɪn ðɪs siːn wi kæn siː ə ˈrɪvər ænd ˈsevərəl bɜːrdz nɪr ðə ˈfɔːrɪst/',
    userZh: '在这个画面里，我们可以看到一条河和森林附近的几只鸟。',
  },
  sc_tenses_routine: {
    coachEn: 'What do you usually do in the morning, and what are you doing now?',
    coachZh: '你早上通常做什么？现在又在做什么？',
    userEn: 'I usually study English, but right now I am making a cup of tea.',
    userPhonetic: '/aɪ ˈjuːʒuəli ˈstʌdi ˈɪŋɡlɪʃ bʌt raɪt naʊ aɪ æm ˈmeɪkɪŋ ə kʌp əv tiː/',
    userZh: '我通常学英语，但现在正在泡一杯茶。',
  },
  sc_tenses_trip: {
    coachEn: 'Where did you go on your last trip?',
    coachZh: '你上次旅行去了哪里？',
    userEn: 'I went to Hangzhou last year, and I have visited it twice.',
    userPhonetic: '/aɪ went tə ˈhæŋdʒoʊ læst jɪr ænd aɪ hæv ˈvɪzɪtɪd ɪt twaɪs/',
    userZh: '我去年去了杭州，到现在已经去过两次。',
  },
  sc_tenses_plan: {
    coachEn: 'What have you finished, and what are you going to do tomorrow?',
    coachZh: '你已经完成了什么？明天打算做什么？',
    userEn: 'I have already finished the report, and I am going to present it tomorrow.',
    userPhonetic: '/aɪ hæv ɔːlˈredi ˈfɪnɪʃt ðə rɪˈpɔːrt ænd aɪ æm ˈɡoʊɪŋ tə prɪˈzent ɪt təˈmɑːroʊ/',
    userZh: '我已经写完报告，明天准备展示。',
  },
};

for (const meta of TOPIC_SCENE_META) {
  const key = meta.courseId.replace(/^course_/, '');
  for (const suffix of ['warm', 'scene', 'native']) {
    SCENE_GUIDES[`sc_${key}_${suffix}`] = {
      coachEn: meta.coachEn,
      coachZh: meta.coachZh,
      userEn: meta.userEn,
      userPhonetic: meta.userPhonetic,
      userZh: meta.userZh,
    };
  }
}

function withGuide(s: SceneCard): SceneCardView {
  return {
    ...s,
    guide: SCENE_GUIDES[s.id] || {
      coachEn: `Welcome to ${s.title}. Let us begin.`,
      coachZh: `欢迎来到「${s.title}」。我们开始吧。`,
      userEn: s.keyPhrases[0],
      userPhonetic: '',
      userZh: '先试着说出这句目标表达。',
    },
  };
}

export function listSceneCards(courseId?: string): SceneCardView[] {
  const key = String(courseId || '').trim();
  return (key ? SCENE_CARDS.filter((s) => s.courseId === key) : SCENE_CARDS).map(withGuide);
}

export function getSceneCard(id: string): SceneCardView | null {
  const hit = SCENE_CARDS.find((s) => s.id === id);
  return hit ? withGuide(hit) : null;
}

/** 场景块拼进教学提示词：角色 + 任务步骤 + 目标句型 + 收尾条件。 */
export function renderScenePrompt(s: SceneCard): string {
  return [
    '## 当前场景（课程场景任务）',
    `课程：${s.courseName}（CEFR ${s.cefr}，${s.level}，约 ${s.minutes} 分钟）`,
    `场景：${s.scene}`,
    `环境：${s.setting}`,
    `你扮演：${s.roles[0]}；用户扮演：${s.roles[1]}。始终留在角色里，不切换到办公助手或其他模式。`,
    '轮次规则：一次只输出一轮。先用一句中文说明当前任务，再用角色身份说 1~2 句英文，然后停下等用户回答；不要替用户说下一句。',
    '语言规则：用户可以说英文、中文或中英混说。用户问“怎么说”时，给出一句可直接跟读的自然英文 + 一句中文短注，再回到角色继续。',
    '用户任务：',
    ...s.missions.map((m, i) => `${i + 1}. ${m}`),
    `关键句型（开场先用中文说明任务，再以角色身份给用户第一句提示；对话中按需带用户使用）：`,
    ...s.keyPhrases.map((k) => `- ${k}`),
    `完成条件：${s.exitHint}。达成后按教学宪法输出 [SCENE_END] + 评分 JSON（corrections 每条带 grammar_point 可留空）。`,
  ].join('\n');
}
