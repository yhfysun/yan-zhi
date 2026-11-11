// 学习模式 · 历年真题训练题库。
// 题目和解析只留在服务端，取卷接口不下发 answer/explanation。
import { db } from '../db.js';

export type ExamType = '考研' | '高考';

export type ExamQuestion = {
  id: string;
  stem: string;
  options: string[];
  answer: number;
  explanation: string;
};

export type ExamPaper = {
  id: string;
  title: string;
  examType: ExamType;
  year: number;
  region: string;
  section: string;
  difficulty: string;
  durationMinutes: number;
  tags: string[];
  passage: string;
  /** 听力专项的朗读稿：前端只用于播放，交卷前不在页面展示 */
  listeningScript?: string;
  questions: ExamQuestion[];
};

export type ExamPaperSummary = Omit<ExamPaper, 'passage' | 'questions' | 'listeningScript'> & {
  questionCount: number;
  hasListening: boolean;
};

export type ExamPaperPublic = Omit<ExamPaper, 'questions'> & {
  questions: Array<Pick<ExamQuestion, 'id' | 'stem' | 'options'>>;
};

export type ExamSubmitResult = {
  paperId: string;
  title: string;
  correct: number;
  total: number;
  score: number;
  details: Array<{
    questionId: string;
    stem: string;
    picked: number | null;
    answer: number;
    correct: boolean;
    explanation: string;
  }>;
};

export const EXAM_PAPERS: ExamPaper[] = [
  {
    id: 'exam_kaoyan_2024_r1',
    title: '2024 考研英语（一）· 阅读精练',
    examType: '考研',
    year: 2024,
    region: '全国统考',
    section: '阅读理解',
    difficulty: '中等偏难',
    durationMinutes: 18,
    tags: ['慢阅读', '注意力', '论证题'],
    passage:
      'For years, speed has been treated as a virtue in online reading. Articles are ranked by how quickly they attract clicks, and readers are encouraged to skim, share and move on. Yet a growing number of teachers and researchers argue that slow reading deserves a place in digital life. They are not asking people to abandon screens or reject short summaries. Their point is simpler: some texts repay patience, and a reader who pauses can notice the structure of an argument rather than merely collect its conclusions.\n\n'
      + 'This matters because comprehension is not a single act. A reader first identifies what a text is about, then tests how its claims fit together, and finally asks whether the evidence is strong enough. Skimming can help with the first step, but it often skips the second and third. When a passage is reduced to a few familiar phrases, readers may feel informed while missing the writer’s qualifications. The result is a confident opinion built on an uncertain base.\n\n'
      + 'Slow reading is therefore less about pace than about attention. A short pause to mark an unfamiliar claim, compare two paragraphs or ask what has been left unsaid can change the way a text is understood. Digital tools need not work against this habit. Annotation, adjustable type and the ability to return to a marked sentence can make careful reading easier, provided that the tools do not turn every page into another stream of distractions.',
    questions: [
      {
        id: 'q1',
        stem: 'What does the author mainly argue in the first paragraph?',
        options: [
          'Digital reading should replace printed books.',
          'Some texts deserve patient, attentive reading.',
          'Readers should avoid all short summaries.',
          'Online articles are usually badly written.',
        ],
        answer: 1,
        explanation: '首段核心是“some texts repay patience”，作者并不反对屏幕或摘要。',
      },
      {
        id: 'q2',
        stem: 'According to the passage, skimming is most useful for',
        options: [
          'judging the strength of evidence.',
          'remembering every qualification.',
          'identifying what a text is about.',
          'comparing several writers at once.',
        ],
        answer: 2,
        explanation: '第二段明确说略读有助于第一步，也就是判断文章大致讲什么。',
      },
      {
        id: 'q3',
        stem: 'The phrase “an uncertain base” in paragraph 2 refers to',
        options: [
          'an opinion formed without enough understanding.',
          'a summary written by an unreliable author.',
          'a digital tool that changes too quickly.',
          'a conclusion supported by too much evidence.',
        ],
        answer: 0,
        explanation: '前文说读者可能“feel informed while missing qualifications”，因此自信观点建立在不稳理解上。',
      },
      {
        id: 'q4',
        stem: 'The author suggests that digital tools can help slow reading when they',
        options: [
          'reward users for finishing quickly.',
          'remove unfamiliar claims from texts.',
          'support annotation and easy return to key sentences.',
          'replace the need for comparison between paragraphs.',
        ],
        answer: 2,
        explanation: '末段列举 annotation、adjustable type 和 return to a marked sentence。',
      },
      {
        id: 'q5',
        stem: 'Which of the following best describes the author’s attitude?',
        options: ['Doubtful about all digital reading', 'Supportive of careful reading', 'Indifferent to reading habits', 'Critical of teachers and researchers'],
        answer: 1,
        explanation: '全文肯定慢读和注意力，同时承认数字工具可以有帮助。',
      },
    ],
  },
  {
    id: 'exam_kaoyan_2023_r2',
    title: '2023 考研英语（二）· 阅读精练',
    examType: '考研',
    year: 2023,
    region: '全国统考',
    section: '阅读理解',
    difficulty: '中等',
    durationMinutes: 16,
    tags: ['城市治理', '公共空间', '观点题'],
    passage:
      'City planners once treated trees mainly as decoration. A row of trees could soften the edge of a road or make a new square look complete. Today, many cities are beginning to treat them as infrastructure. Trees cool streets during heat waves, absorb rainwater and provide shade for people waiting at bus stops. Their value is not evenly distributed, however. Wealthier neighborhoods often have older and denser tree cover, while crowded districts may have little more than young saplings.\n\n'
      + 'The problem cannot be solved by planting as many trees as possible in a single season. Young trees need water, care and enough space for their roots. If a city plants thousands of them without a maintenance plan, many will die within a few years. Officials are therefore experimenting with smaller projects that local residents help design and maintain. In one district, residents mapped the hottest walking routes and asked for shade at specific crossings. The result was less dramatic than a large park, but it made daily life noticeably safer.\n\n'
      + 'Treating trees as infrastructure also changes how success is measured. The number of trees planted is easy to report, but it says little about whether people actually benefit. Cities are now counting shade over playgrounds, temperature reductions on busy streets and the number of residents involved in care. These measures are slower and less photogenic, yet they connect public spending to the everyday experience of a neighborhood.',
    questions: [
      {
        id: 'q1',
        stem: 'How has the view of urban trees changed?',
        options: ['From public health threat to private property', 'From decoration to infrastructure', 'From food source to tourist attraction', 'From natural habitat to construction material'],
        answer: 1,
        explanation: '首段对比“mainly as decoration”和“treat them as infrastructure”。',
      },
      {
        id: 'q2',
        stem: 'What does paragraph 1 suggest about tree cover?',
        options: ['It is equally distributed across districts.', 'It is always denser in crowded areas.', 'It can reflect existing neighborhood inequality.', 'It has no effect on street temperature.'],
        answer: 2,
        explanation: '文中说富裕社区树木更老更密，拥挤区域可能只有幼树，体现分布不均。',
      },
      {
        id: 'q3',
        stem: 'Why can mass planting fail?',
        options: ['Young trees require long-term care.', 'Residents dislike small projects.', 'Cities have no space for parks.', 'Trees cannot survive in hot weather.'],
        answer: 0,
        explanation: '第二段指出没有维护计划时，大量幼树会在几年内死亡。',
      },
      {
        id: 'q4',
        stem: 'The district example shows that successful projects are often',
        options: ['large and highly visible.', 'designed without public input.', 'focused on specific local needs.', 'completed within one season.'],
        answer: 2,
        explanation: '居民标出最热的步行路线和需要遮阴的路口，项目针对具体需求。',
      },
      {
        id: 'q5',
        stem: 'The author would most likely agree that success should be measured by',
        options: ['the number of trees planted.', 'the size of the city budget.', 'the visible impact on residents.', 'the speed of construction.'],
        answer: 2,
        explanation: '末段强调从种树数量转向居民实际获得的遮阴和降温。',
      },
    ],
  },
  {
    id: 'exam_kaoyan_2022_r1',
    title: '2022 考研英语（一）· 阅读精练',
    examType: '考研',
    year: 2022,
    region: '全国统考',
    section: '阅读理解',
    difficulty: '中等偏难',
    durationMinutes: 18,
    tags: ['团队协作', '沉默', '推理题'],
    passage:
      'Modern workplaces celebrate the person who speaks first and speaks often. Meetings are designed around discussion, brainstorming and rapid responses. Quiet employees may be seen as less engaged, even when their work is careful and their judgment is sound. This assumption can cost organizations valuable ideas. Some people need time to process information before they can contribute, and their silence during a meeting does not necessarily mean that they have nothing to say.\n\n'
      + 'A team that values only immediate speech may mistake confidence for competence. The fastest answer is not always the best one, especially when a decision involves complex evidence. Research on group discussion has repeatedly found that early speakers can shape what others regard as acceptable. Once a direction seems settled, later participants may hesitate to challenge it. A brief pause before decisions, or a written round of comments after a meeting, can make room for views that would otherwise remain unseen.\n\n'
      + 'This does not mean that every meeting should become slow or that quietness is always wise. Some problems require quick action, and some people are silent because they are disengaged. The point is to stop treating volume as a reliable sign of contribution. Good managers create more than one route into the conversation, then judge ideas by their quality rather than by how quickly they were voiced.',
    questions: [
      {
        id: 'q1',
        stem: 'What assumption about quiet employees does the author challenge?',
        options: ['They always disagree with their managers.', 'They are necessarily less engaged.', 'They prefer written communication.', 'They avoid complex decisions.'],
        answer: 1,
        explanation: '首段指出安静员工可能被误认为不投入，即使工作认真、判断可靠。',
      },
      {
        id: 'q2',
        stem: 'Why can early speakers have disproportionate influence?',
        options: ['They usually have more evidence.', 'They control the meeting schedule.', 'Their views can define what later speakers consider acceptable.', 'They are more likely to take written notes.'],
        answer: 2,
        explanation: '第二段说 early speakers can shape what others regard as acceptable。',
      },
      {
        id: 'q3',
        stem: 'Which practice does the author recommend?',
        options: ['Banning quick decisions in every case', 'Inviting comments in more than one form', 'Choosing only experienced speakers', 'Ending meetings before discussion begins'],
        answer: 1,
        explanation: '文中建议 written round of comments、decision pause 等更多参与路径。',
      },
      {
        id: 'q4',
        stem: 'The author’s view of silence is',
        options: ['entirely positive.', 'entirely negative.', 'context-dependent.', 'irrelevant to teamwork.'],
        answer: 2,
        explanation: '第三段明确说安静并不总是明智，要看情境。',
      },
      {
        id: 'q5',
        stem: 'What is the main point of the passage?',
        options: ['Meetings should be shorter.', 'Speaking speed predicts ability.', 'Teams should assess ideas beyond their volume.', 'Quiet workers should avoid discussion.'],
        answer: 2,
        explanation: '结论是不要用说话多少判断贡献，而要看观点质量。',
      },
    ],
  },
  {
    id: 'exam_gaokao_2024_r1',
    title: '2024 高考英语 · 阅读精练',
    examType: '高考',
    year: 2024,
    region: '全国卷',
    section: '阅读理解',
    difficulty: '中等',
    durationMinutes: 12,
    tags: ['校园生活', '劳动教育', '细节题'],
    passage:
      'When the students of Hilltop School first proposed a vegetable garden, they expected to grow carrots and tomatoes. Their teacher, Ms. Chen, agreed on one condition: the garden had to be planned, planted and maintained by the students themselves. The first month was harder than anyone had imagined. Weeds appeared before the seeds did, and a week of heavy rain turned the paths into mud.\n\n'
      + 'Instead of taking over, Ms. Chen asked the class to keep a weekly record. Students measured how much sunlight each bed received, tested the soil and compared which plants survived. They soon discovered that the wettest corner was better suited to leafy vegetables than to tomatoes. They also learned that a problem noticed by one group could affect the whole garden. When the science club reported insects on the beans, the art club designed signs that explained how the garden’s insects helped keep a balance.\n\n'
      + 'By the end of the term, the garden had produced enough vegetables for a community lunch. The students were proud of the food, but their final reports focused on something else. They wrote about learning to observe, to ask better questions and to share responsibility. “The garden did not need us to be perfect,” one student wrote. “It needed us to keep paying attention.”',
    questions: [
      {
        id: 'q1',
        stem: 'What condition did Ms. Chen set for the garden?',
        options: ['It had to produce enough food for the school.', 'It had to be managed by the students.', 'It had to be finished within one month.', 'It had to include only vegetables.'],
        answer: 1,
        explanation: '第一段明确说学生必须自己规划、种植和维护花园。',
      },
      {
        id: 'q2',
        stem: 'What did the students learn from the wettest corner?',
        options: ['Tomatoes grow best in wet soil.', 'Some plants suit different conditions.', 'All seeds need the same amount of water.', 'The paths should be removed.'],
        answer: 1,
        explanation: '潮湿角落更适合叶菜而不是番茄，说明植物适应条件不同。',
      },
      {
        id: 'q3',
        stem: 'Why did the art club make signs?',
        options: ['To advertise the community lunch.', 'To show how insects helped the garden.', 'To ask visitors not to enter.', 'To mark the vegetables for sale.'],
        answer: 1,
        explanation: '科学社报告豆子上的昆虫后，艺术社做牌子解释昆虫如何帮助生态平衡。',
      },
      {
        id: 'q4',
        stem: 'What did the final reports mainly discuss?',
        options: ['The size of the harvest', 'The cost of the tools', 'Skills and responsibility gained', 'The best way to cook vegetables'],
        answer: 2,
        explanation: '末段说报告重点不是食物，而是观察、提问题和分担责任。',
      },
      {
        id: 'q5',
        stem: 'What does the student’s comment show?',
        options: ['The garden required constant attention.', 'The garden failed at first.', 'Only perfect students could join.', 'The teacher did most of the work.'],
        answer: 0,
        explanation: '“keep paying attention”强调持续观察和照料。',
      },
    ],
  },
  {
    id: 'exam_gaokao_2023_r1',
    title: '2023 高考英语 · 阅读精练',
    examType: '高考',
    year: 2023,
    region: '新课标 I 卷',
    section: '阅读理解',
    difficulty: '中等',
    durationMinutes: 12,
    tags: ['社区服务', '环保', '主旨题'],
    passage:
      'The town library had a problem that no one talked about: it was busy all day but almost empty at night. Many students wanted a quiet place to study after dinner, while older residents said they would enjoy evening readings and classes. The library director suggested a simple experiment. For two months, the building would stay open until nine o’clock on Fridays. Volunteers would run activities, and visitors would be asked to suggest what they wanted.\n\n'
      + 'The first Friday attracted only twelve people. By the fourth week, the number had grown to sixty. A group of teenagers started a homework corner, and a retired engineer offered a weekly class on repairing small machines. The most popular event, however, was a quiet reading hour. No phones, no conversation and no pressure to finish a book: people simply sat together and read.\n\n'
      + 'The experiment changed more than opening hours. It showed that a public space can be shaped by the people who use it. When the library asked residents what they needed, it received ideas that its staff could not have invented alone. The town has now decided to keep Friday nights open and to let each month’s schedule be planned with community members.',
    questions: [
      {
        id: 'q1',
        stem: 'What problem did the library face?',
        options: ['It had too few books.', 'It was crowded at night.', 'It was not used much in the evening.', 'It could not find enough volunteers.'],
        answer: 2,
        explanation: '开头说图书馆白天忙但晚上几乎没人。',
      },
      {
        id: 'q2',
        stem: 'What was the most popular activity?',
        options: ['A machine repair class', 'A homework corner', 'A quiet reading hour', 'A weekly lecture'],
        answer: 2,
        explanation: '第二段明确说 most popular event 是 quiet reading hour。',
      },
      {
        id: 'q3',
        stem: 'What did the experiment prove?',
        options: ['Libraries should close earlier.', 'Public spaces can reflect users’ needs.', 'Only teenagers need community activities.', 'Volunteers should plan every event.'],
        answer: 1,
        explanation: '第三段总结公共空间可以由使用者塑造。',
      },
      {
        id: 'q4',
        stem: 'What will the town do next?',
        options: ['Close the library on Fridays.', 'Hire more staff for evening work.', 'Plan future schedules with residents.', 'Move the library to a larger building.'],
        answer: 2,
        explanation: '结尾说每月日程将与社区成员共同规划。',
      },
      {
        id: 'q5',
        stem: 'Which title best fits the passage?',
        options: ['A Library That Listened', 'The History of Public Libraries', 'How to Repair Small Machines', 'A Busy Friday Morning'],
        answer: 0,
        explanation: '全文重点是图书馆倾听居民需求并调整服务。',
      },
    ],
  },
  {
    id: 'exam_gaokao_2022_r1',
    title: '2022 高考英语 · 阅读精练',
    examType: '高考',
    year: 2022,
    region: '全国卷',
    section: '阅读理解',
    difficulty: '基础到中等',
    durationMinutes: 12,
    tags: ['科学学习', '睡眠', '推断题'],
    passage:
      'Students often trade sleep for study time before an exam. They believe that staying awake longer gives them more hours to remember facts. Research suggests that this strategy can be misleading. During sleep, the brain does not simply rest. It organizes and strengthens what was learned during the day, making information easier to recall later.\n\n'
      + 'In one experiment, two groups of students learned a list of words in the afternoon. One group slept for eight hours that night; the other stayed awake until morning. Both groups were tested the next day. The students who had slept remembered more words, especially those they had found difficult at first. The researchers explained that sleep helped connect new information with what the students already knew.\n\n'
      + 'This does not mean that sleep can replace studying. A student who never reviews the material will not learn it during sleep. The best results came when students studied actively, tested themselves and then allowed enough time for rest. Sleep is not a shortcut, but it is part of the learning process rather than a break from it.',
    questions: [
      {
        id: 'q1',
        stem: 'What do many students believe about sleep?',
        options: ['It is more important than studying.', 'It can be reduced to gain study time.', 'It makes facts harder to remember.', 'It should happen only after exams.'],
        answer: 1,
        explanation: '第一段说学生常常牺牲睡眠换取学习时间。',
      },
      {
        id: 'q2',
        stem: 'In the experiment, which group remembered more words?',
        options: ['The group that stayed awake.', 'The group that slept eight hours.', 'Both groups remembered the same.', 'Neither group remembered any words.'],
        answer: 1,
        explanation: '第二段明确 slept group remembered more words。',
      },
      {
        id: 'q3',
        stem: 'What did researchers say sleep helped students do?',
        options: ['Forget unimportant information', 'Connect new information with known information', 'Study for more hours', 'Avoid difficult words'],
        answer: 1,
        explanation: '第二段最后说 sleep helped connect new information with what students already knew。',
      },
      {
        id: 'q4',
        stem: 'What is the author’s view of sleep?',
        options: ['It can replace active study.', 'It is unnecessary before exams.', 'It supports learning but is not a shortcut.', 'It only helps with easy facts.'],
        answer: 2,
        explanation: '末段说睡眠不能替代学习，但它是学习过程的一部分。',
      },
      {
        id: 'q5',
        stem: 'What is the best summary of the passage?',
        options: ['Sleep and study work together.', 'Students should sleep less.', 'Exams cause sleeping problems.', 'Reviewing is less useful than sleeping.'],
        answer: 0,
        explanation: '文章核心是睡眠与主动学习相互配合。',
      },
    ],
  },
  {
    id: 'exam_kaoyan_2021_r1',
    title: '2021 考研英语（一）· 阅读精练',
    examType: '考研',
    year: 2021,
    region: '全国统考',
    section: '阅读理解',
    difficulty: '中等',
    durationMinutes: 16,
    tags: ['公共图书馆', '公共服务', '态度题'],
    passage:
      'Public libraries are sometimes judged by the size of their book collections. A library with more shelves and more titles may appear more valuable than one with fewer. This measure is easy to understand, but it misses much of what libraries now do. In many communities, the library is the only place where residents can use a computer, attend a free class or find a quiet room without spending money.\n\n'
      + 'The services are not equally visible. A borrowed novel is easy to count, while help with a job application or a child’s first research project is harder to record. As a result, libraries can look less important in reports than they are in daily life. Some directors have begun to collect different evidence: how many people use public computers, how often meeting rooms are booked and whether visitors return for help after their first visit.\n\n'
      + 'None of this reduces the value of books. It simply asks communities to see the library as a shared resource with several purposes. A library that lends books and also helps people learn, connect and solve practical problems is not doing two unrelated jobs. It is responding to the many ways knowledge enters ordinary life.',
    questions: [
      {
        id: 'q1',
        stem: 'What traditional measure does the author question?',
        options: ['The number of visitors', 'The size of a library’s collection', 'The cost of public computers', 'The number of classes offered'],
        answer: 1,
        explanation: '首段质疑仅用藏书规模判断图书馆价值。',
      },
      {
        id: 'q2',
        stem: 'Why can important library services be overlooked?',
        options: ['They are too expensive.', 'They are difficult to count.', 'They are only used by children.', 'They replace borrowed books.'],
        answer: 1,
        explanation: '第二段说借书容易统计，而求职帮助等项目更难记录。',
      },
      {
        id: 'q3',
        stem: 'What new evidence are some directors collecting?',
        options: ['The age of every book', 'The number of staff meetings', 'Patterns of computer and room use', 'The opinions of publishers'],
        answer: 2,
        explanation: '第二段列举电脑使用、会议室预订和回访情况。',
      },
      {
        id: 'q4',
        stem: 'What does the author say about the library’s different purposes?',
        options: ['They compete for limited space.', 'They are unrelated to books.', 'They are connected ways of serving knowledge needs.', 'They should be handled by separate institutions.'],
        answer: 2,
        explanation: '末段说它们不是两项无关工作，而是知识进入日常生活的多种方式。',
      },
      {
        id: 'q5',
        stem: 'What is the author’s attitude toward public libraries?',
        options: ['Supportive of a broader view of their value', 'Concerned that books are no longer useful', 'Critical of all public spending', 'Indifferent to their future'],
        answer: 0,
        explanation: '全文主张用更广的视角看待图书馆的多重公共服务价值。',
      },
    ],
  },
  {
    id: 'exam_kaoyan_2024_retest_listening',
    title: '2024 考研复试英语 · 听力专项',
    examType: '考研',
    year: 2024,
    region: '复试模拟',
    section: '听力理解',
    difficulty: '中等偏难',
    durationMinutes: 18,
    tags: ['复试听力', '学术讲座', '推理题'],
    passage: '听力材料只播放音频，不在作答页展示原文。交卷后可查看完整听力稿与逐题解析。',
    listeningScript:
      'Good morning, everyone. Today I want to talk about repair cafes, a small but growing movement that began in the Netherlands. '
      + 'The idea is simple. People bring broken household objects to a community space, and volunteers help them repair those objects instead of throwing them away. '
      + 'The first repair cafe opened in Amsterdam in 2009. Today there are more than two thousand around the world. '
      + 'The movement is often described as an environmental project, and that is certainly part of its purpose. Electronic waste is growing quickly, and many products are designed in ways that make repair difficult. '
      + 'But the organizers say the social benefits are just as important. At a repair cafe, older residents often share practical skills with younger visitors. Someone who has never used a screwdriver may leave with a repaired lamp and a new confidence to try again. '
      + 'Not every object can be saved. Volunteers sometimes have to explain that a device is unsafe or that a replacement part is no longer available. They also face criticism from those who argue that the real solution is to force companies to design longer-lasting products. '
      + 'The organizers agree that individual repair cannot replace better regulation. Still, they believe local action changes how people think about ownership. Once you have opened a toaster and discovered how it works, you are less likely to treat every broken object as waste. '
      + 'In the coming months, the group plans to collect data on how many items are repaired and how much waste is avoided. They hope the figures will help local governments decide whether to support similar projects in public libraries and community centers.',
    questions: [
      {
        id: 'q1',
        stem: 'What is the main purpose of a repair cafe?',
        options: ['To sell second-hand household objects', 'To help people repair broken items', 'To train professional electricians', 'To collect electronic waste for companies'],
        answer: 1,
        explanation: '开场直接说明人们把损坏物品带到社区空间，由志愿者帮助维修。',
      },
      {
        id: 'q2',
        stem: 'Where did the first repair cafe open?',
        options: ['In Amsterdam', 'In London', 'In New York', 'In Berlin'],
        answer: 0,
        explanation: '听力稿明确说第一家 repair cafe 于 2009 年在阿姆斯特丹开放。',
      },
      {
        id: 'q3',
        stem: 'Why is the movement connected with environmental protection?',
        options: ['It plants trees around cities.', 'It reduces electronic waste.', 'It bans all new products.', 'It teaches people to use less water.'],
        answer: 1,
        explanation: '讲话提到电子废弃物快速增长，而维修能避免物品被直接丢弃。',
      },
      {
        id: 'q4',
        stem: 'What social benefit does the speaker emphasize?',
        options: ['People can earn money from repairs.', 'Older residents share skills with younger visitors.', 'Companies can advertise their products.', 'Local governments can collect taxes.'],
        answer: 1,
        explanation: '讲话说年长居民经常与年轻访客分享实用技能。',
      },
      {
        id: 'q5',
        stem: 'What may happen when an object cannot be repaired?',
        options: ['It is sold to a museum.', 'Volunteers explain why it is unsafe or lacks parts.', 'The cafe keeps it for one year.', 'The visitor must pay a fine.'],
        answer: 1,
        explanation: '志愿者会解释设备不安全或替换零件已经无法获得。',
      },
      {
        id: 'q6',
        stem: 'What criticism does the movement face?',
        options: ['It charges too much for repairs.', 'It ignores the need for better product regulation.', 'It only accepts old clothes.', 'It refuses to work with local governments.'],
        answer: 1,
        explanation: '批评者认为真正的解决办法是迫使企业设计更耐用的产品，而不仅靠个人维修。',
      },
      {
        id: 'q7',
        stem: 'How does repairing an object change people’s thinking?',
        options: ['They become less willing to buy anything.', 'They see broken objects differently.', 'They stop using community spaces.', 'They expect every repair to be free.'],
        answer: 1,
        explanation: '讲话说亲手打开电器后，人们不再把每件坏物品都视作垃圾。',
      },
      {
        id: 'q8',
        stem: 'Why will the group collect repair data?',
        options: ['To increase the price of repairs', 'To help governments decide whether to support similar projects', 'To prove that all products can be repaired', 'To replace public libraries'],
        answer: 1,
        explanation: '结尾说数据可帮助地方政府决定是否支持类似项目。',
      },
    ],
  },
  {
    id: 'exam_gaokao_2024_listening',
    title: '2024 高考英语 · 听力专项',
    examType: '高考',
    year: 2024,
    region: '全国卷',
    section: '听力理解',
    difficulty: '中等',
    durationMinutes: 15,
    tags: ['高考听力', '短对话', '独白'],
    passage: '听力材料只播放音频，不在作答页展示原文。交卷后可查看完整听力稿与逐题解析。',
    listeningScript:
      'Text 1. Good morning. This is the city library. We are open from nine to six on weekdays, but on Saturday we close at four. '
      + 'The reading room on the second floor will be closed this weekend because workers are painting the walls. Books can still be returned at the front desk. '
      + 'Text 2. W: Hi, Mark. Are you still joining the volunteer clean-up on Sunday? M: I planned to, but my cousin is visiting. '
      + 'W: The park clean-up starts at nine. Could you come for just the first hour? M: That works. I will bring some gloves and bags. '
      + 'Text 3. M: Did you see the weather report for our hiking trip? W: Yes. It will be sunny in the morning, but rain may arrive after three. '
      + 'We should start early and reach the top before noon. M: Good idea. I will pack a raincoat anyway. '
      + 'Text 4. W: You look tired today. M: I stayed up late finishing a science report. W: How much sleep did you get? M: About four hours. '
      + 'W: That is not enough. Remember, your memory works better when you have had enough rest. M: I know. I will finish earlier tonight.',
    questions: [
      {
        id: 'q1',
        stem: 'When does the library close on Saturday?',
        options: ['At four', 'At five', 'At six', 'At nine'],
        answer: 0,
        explanation: 'Text 1 明确说周六四点关门。',
      },
      {
        id: 'q2',
        stem: 'Why will the reading room be closed?',
        options: ['The books are being moved.', 'Workers are painting the walls.', 'There are too many visitors.', 'The library is holding a meeting.'],
        answer: 1,
        explanation: 'Text 1 说工人这个周末要给墙面刷漆。',
      },
      {
        id: 'q3',
        stem: 'What is Mark going to do on Sunday?',
        options: ['Visit his cousin all day', 'Join the park clean-up for an hour', 'Work at the library', 'Go hiking with the woman'],
        answer: 1,
        explanation: 'Mark 的亲戚来访，但他仍答应参加第一个小时的公园清洁。',
      },
      {
        id: 'q4',
        stem: 'What will Mark bring?',
        options: ['Water and food', 'Gloves and bags', 'A raincoat', 'A science report'],
        answer: 1,
        explanation: 'Text 2 结尾 Mark 说会带手套和袋子。',
      },
      {
        id: 'q5',
        stem: 'What is the weather expected to be like after three?',
        options: ['Snowy', 'Sunny', 'Windy', 'Rainy'],
        answer: 3,
        explanation: 'Text 3 说下午三点后可能下雨。',
      },
      {
        id: 'q6',
        stem: 'Why do they plan to start early?',
        options: ['The park opens early.', 'They want to avoid the rain.', 'The bus leaves at noon.', 'They need to buy raincoats.'],
        answer: 1,
        explanation: '两人决定早出发，在中午前到山顶，以避开下午可能到来的雨。',
      },
      {
        id: 'q7',
        stem: 'Why is the man tired?',
        options: ['He hiked all day.', 'He stayed up late finishing a report.', 'He worked at the library.', 'He visited his cousin.'],
        answer: 1,
        explanation: 'Text 4 中男士说熬夜完成科学报告。',
      },
      {
        id: 'q8',
        stem: 'How much sleep did the man get?',
        options: ['About three hours', 'About four hours', 'About six hours', 'About eight hours'],
        answer: 1,
        explanation: '男士回答约四个小时。',
      },
      {
        id: 'q9',
        stem: 'What does the woman remind the man about?',
        options: ['The importance of rest for memory', 'The date of the science exam', 'The cost of the hiking trip', 'The closing time of the library'],
        answer: 0,
        explanation: '女士提醒他充足休息有助于记忆。',
      },
      {
        id: 'q10',
        stem: 'What will the man do tonight?',
        options: ['Go hiking', 'Visit his cousin', 'Finish earlier', 'Work at the library'],
        answer: 2,
        explanation: '男士说今晚会早点完成。',
      },
    ],
  },
];

function publicPaper(paper: ExamPaper): ExamPaperPublic {
  return {
    ...paper,
    questions: paper.questions.map(({ id, stem, options }) => ({ id, stem, options: [...options] })),
  };
}

export function listExamPapers(type?: ExamType): ExamPaperSummary[] {
  return EXAM_PAPERS
    .filter((p) => !type || p.examType === type)
    .map(({ passage: _passage, listeningScript: _listeningScript, questions, ...meta }) => ({
      ...meta,
      questionCount: questions.length,
      hasListening: !!_listeningScript,
    }));
}

export function getExamPaper(id: string): ExamPaperPublic | null {
  const paper = EXAM_PAPERS.find((p) => p.id === id);
  return paper ? publicPaper(paper) : null;
}

export function submitExamPaper(userId: string, id: string, answers: Record<string, number>): ExamSubmitResult {
  const paper = EXAM_PAPERS.find((p) => p.id === id);
  if (!paper) throw new Error('真题不存在');
  const details = paper.questions.map((q) => {
    const picked = Number.isInteger(answers[q.id]) ? answers[q.id] : null;
    return {
      questionId: q.id,
      stem: q.stem,
      picked,
      answer: q.answer,
      correct: picked === q.answer,
      explanation: q.explanation,
    };
  });
  const correct = details.filter((d) => d.correct).length;
  const score = Math.round((correct / paper.questions.length) * 100);
  const now = Date.now();
  db.prepare(
    'INSERT INTO learning_session (id, user_id, mode, scene_id, score, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    `ls_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    userId, 'exam', paper.id, score, now, now,
  );
  return { paperId: paper.id, title: paper.title, correct, total: paper.questions.length, score, details };
}
