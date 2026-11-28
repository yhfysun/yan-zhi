import type {
  LearningV2EventDetail,
  LearningV2Practice,
  LearningV2StudyPoint,
} from '../../v2-types.js';
import type { CuratedCoursePlanPatchMap } from '../types.js';

const point = (
  label: LearningV2StudyPoint['label'],
  text: string,
  stepIndex: number,
): LearningV2StudyPoint => ({ label, text, stepIndex });

const question = (
  prompt: string,
  correct: string,
  distractors: readonly [string, string, string],
  answer: number,
  explanation: string,
  focus: string,
): LearningV2Practice => {
  const options = [...distractors];
  options.splice(answer, 0, correct);
  return { prompt, options, answer, explanation, focus };
};

const source = (id: string, title: string, issuer: string, date: string, url: string, usedFor: string) =>
  ({ id, title, issuer, date, url, usedFor });

const PALACE_ARCHIVE = {
  id: 'method-of-loci-evidence',
  kind: 'experiment',
  title: '记忆宫殿：空间路线为何能承载有序提取',
  period: '古代修辞术—2017',
  summary:
    '记忆宫殿把待记项目放进熟悉空间中的固定锚点，再用动态画面建立联系。实验关注的是路线、锚点与提取顺序，而不是“脑内拍照”。',
  background:
    '演讲者很早便使用“地点与图像”保存长段内容。现代研究比较记忆运动员、普通人和训练者，检查空间策略、脑网络变化与任务迁移。',
  timeline: [
    {
      date: '约公元前 1 世纪',
      title: '地点与图像进入修辞训练',
      body: '古罗马修辞材料把背景地点与待记内容对应，回忆时按路线依次经过图像。该传统强调稳定顺序和清晰区别，而不是把全部信息堆在同一定点。',
      sourceIds: ['yates-art-memory'],
    },
    {
      date: '1966',
      title: '记忆术历史被系统整理',
      body: 'Yates 梳理古典记忆术中的地点、图像和秩序观念。历史材料说明宫殿法首先是一套组织与检索程序，其效果仍受训练、材料和执行质量影响。',
      sourceIds: ['yates-art-memory'],
    },
    {
      date: '2002',
      title: '记忆高手被比较研究',
      body: 'Maguire 等研究记忆竞赛参与者，发现其优势与空间记忆、路线组织和策略使用有关，而不是所有记忆维度都同样突出。普通解剖结构本身不能解释全部表现。',
      sourceIds: ['maguire-2002'],
    },
    {
      date: '2017',
      title: '普通成人接受六周宫殿训练',
      body: 'Dresler 等的训练研究让未受过训练者学习 loci 方法并完成词语回忆。训练后，任务表现与功能连接出现变化，说明策略练习可以改变相关加工网络。',
      sourceIds: ['dresler-2017'],
    },
    {
      date: '2017',
      title: '效果被限定在训练任务和材料',
      body: '训练研究同时提醒，记忆宫殿提升的是特定有序材料的编码与提取。它没有自动证明一般智力、工作记忆容量或所有学科理解都永久提高。',
      sourceIds: ['dresler-2017', 'noba-memory'],
    },
    {
      date: '教学迁移',
      title: '路线质量决定复查重点',
      body: '路线不熟、锚点相似或每个地点塞入过多项目都会造成干扰。可靠训练必须做顺序回忆、随机抽查和延迟测试，并保留失败路线作为改进证据。',
      sourceIds: ['noba-memory', 'putnam-2015'],
    },
  ],
  outcome:
    '记忆宫殿的有效证据主要来自有序材料与空间策略训练。可观察结果是锚点顺序更稳定、随机抽查更准确和延迟遗忘减少，而非获得照相机式记忆。',
  significance:
    '这一方法把抽象清单变成可重复的路线任务，适合训练组织能力；同时必须区分任务内收益与一般认知能力提升。',
  sourceCards: [
    source(
      'yates-art-memory',
      'The Art of Memory',
      'Frances A. Yates, University of Chicago Press',
      '1966',
      'https://press.uchicago.edu/ucp/books/book/chicago/A/bo3621895.html',
      '核对地点、图像和古典记忆术的历史背景。',
    ),
    source(
      'maguire-2002',
      'Routes to Remembering: The Brains Behind Superior Memory',
      'Eleanor A. Maguire et al., Nature Neuroscience',
      '2002',
      'https://doi.org/10.1038/nn988',
      '核对记忆高手的空间策略与神经影像结果。',
    ),
    source(
      'dresler-2017',
      'Mnemonic Training Reshapes Brain Networks to Support Superior Memory',
      'Martin Dresler et al., Neuron',
      '2017',
      'https://doi.org/10.1016/j.neuron.2017.02.003',
      '核对普通成人 loci 训练、回忆表现与网络变化。',
    ),
    source(
      'noba-memory',
      'Memory (Encoding, Storage, Retrieval)',
      'Noba Project',
      '2025 年访问版',
      'https://nobaproject.com/modules/memory-encoding-storage-retrieval',
      '核对编码、提取线索与延迟测试的教学原则。',
    ),
    source(
      'putnam-2015',
      'Mnemonics in Education: Current Research and Applications',
      'A. L. Putnam, Translational Issues in Psychological Science',
      '2015',
      'https://doi.org/10.1037/tps0000023',
      '核对记忆术在课堂中的证据、实施条件与边界。',
    ),
  ],
} satisfies LearningV2EventDetail;

const CHAIN_ARCHIVE = {
  id: 'interactive-imagery-evidence',
  kind: 'experiment',
  title: '联想链：关系图像怎样连接相邻项目',
  period: '1969—2015',
  summary:
    '联想链要求相邻项目发生可解释的互动。研究比较孤立重复与关系图像，发现有组织的联系能帮助回忆，但联系过弱、相似或无法还原时会制造干扰。',
  background:
    '图像记忆实验通常让参与者把词对放入同一场景，并控制呈现时间、联系方式和测试延迟。关键在于建立项目之间的关系，而不是只把画面做得离奇。',
  timeline: [
    {
      date: '1969',
      title: '故事与关系组织改善序列回忆',
      body: 'Bower 与 Clark 比较叙事组织与普通序列学习，发现把项目连成连贯情节能提高回忆。项目不是各自独立，而是通过角色、动作和时间顺序形成整体。',
      sourceIds: ['bower-clark-1969'],
    },
    {
      date: '1970',
      title: '图像被证明可组织词对关系',
      body: 'Bower 的实验让参与者用互动图像连接词对。相比机械重复，关系图像提供了更强的提取结构，说明联想效果来自项目间的可恢复联系。',
      sourceIds: ['bower-1970'],
    },
    {
      date: '1972',
      title: '意义加工优于表面重复',
      body: 'Craik 与 Lockhart 的加工深度研究推动记忆教学从“多看几次”转向“怎样加工”。联想链若只重复词语而没有关系，仍停留在浅层接触。',
      sourceIds: ['craik-lockhart-1972', 'noba-memory'],
    },
    {
      date: '2013',
      title: '图像法的适用性受到限定',
      body: 'Dunlosky 等综述提醒，图像法并非对所有文本和考试都高效。抽象材料、复杂推理或联系不自然时，图像可能增加额外负担而没有改善理解。',
      sourceIds: ['dunlosky-2013'],
    },
    {
      date: '2015',
      title: '记忆术需要训练与核对',
      body: 'Putnam 的教学综述强调示范、生成、反馈和迁移。学习者要能解释链接为何包含两个项目，并在随机顺序中验证，而不是只记得一个热闹画面。',
      sourceIds: ['putnam-2015'],
    },
    {
      date: '教学迁移',
      title: '干扰来自相似链接',
      body: '多个词对使用同一人物、同一动作或同一地点时，线索会互相竞争。训练应让动作具体可区分，并在 24 小时后检查错误插入和顺序断裂。',
      sourceIds: ['bower-1970', 'noba-memory'],
    },
  ],
  outcome:
    '联想链的有效指标是相邻项目能否互相触发、逆向和乱序能否恢复，以及延迟测试是否仍准确。荒诞程度本身不是评分标准。',
  significance:
    '这一方法提供关系编码程序，同时说明有趣画面必须服务可恢复线索；否则会增加认知负荷和错误竞争。',
  sourceCards: [
    source(
      'bower-1970',
      'Imagery as a Relational Organizer in Associative Learning',
      'Gordon H. Bower, Journal of Verbal Learning and Verbal Behavior',
      '1970',
      'https://doi.org/10.1016/S0022-5371(70)80096-2',
      '核对互动图像对词对关系的组织作用。',
    ),
    source(
      'bower-clark-1969',
      'Narrative Stories as Mediators for Serial Learning',
      'Gordon H. Bower & Michal C. Clark, Psychonomic Science',
      '1969',
      'https://doi.org/10.3758/BF03332778',
      '核对叙事联系与序列回忆的关系。',
    ),
    source(
      'craik-lockhart-1972',
      'Levels of Processing: A Framework for Memory Research',
      'Fergus I. M. Craik & Robert S. Lockhart',
      '1972',
      'https://doi.org/10.1016/S0022-5371(72)80001-X',
      '核对意义加工与表面重复的保持差异。',
    ),
    source(
      'dunlosky-2013',
      'Improving Students’ Learning With Effective Learning Techniques',
      'John Dunlosky et al.',
      '2013',
      'https://doi.org/10.1177/1529100612453266',
      '核对图像记忆法的证据强度与材料边界。',
    ),
    source(
      'noba-memory',
      'Memory (Encoding, Storage, Retrieval)',
      'Noba Project',
      '2025 年访问版',
      'https://nobaproject.com/modules/memory-encoding-storage-retrieval',
      '核对编码、提取与复查的教学原则。',
    ),
    source(
      'putnam-2015',
      'Mnemonics in Education: Current Research and Applications',
      'A. L. Putnam',
      '2015',
      'https://doi.org/10.1037/tps0000023',
      '核对记忆术示范、反馈和迁移条件。',
    ),
  ],
} satisfies LearningV2EventDetail;

const CHUNK_ARCHIVE = {
  id: 'chunking-and-expertise-evidence',
  kind: 'experiment',
  title: '分块：从短时记忆跨度到专家结构',
  period: '1956—2010',
  summary:
    '分块把多个元素组成一个有意义单位。数字跨度研究说明即时容量有限，棋局研究说明专业知识会改变可识别组块，但分块并不自动带来长期记忆。',
  background:
    '研究者用即时回忆、棋局复现和类别组织任务比较零散材料与结构化材料。有效分块依赖可识别标签、层级关系和完整还原。',
  timeline: [
    {
      date: '1956',
      title: '有限跨度被概括为组块容量',
      body: 'Miller 综合多项即时判断和回忆研究，提出有限容量可按组块而非孤立比特理解。该概括为后续分段教学提供起点，但具体数字仍依赖任务。',
      sourceIds: ['miller-1956'],
    },
    {
      date: '1973',
      title: '棋手优势依赖合法棋局结构',
      body: 'Chase 与 Simon 比较棋手对真实棋局和随机摆放棋子的复现。专业棋手在合法棋局中优势明显，说明组块来自可识别模式而非单纯记忆容量更大。',
      sourceIds: ['chase-simon-1973'],
    },
    {
      date: '1980s',
      title: '专业知识决定可识别单位',
      body: '专家能把常见配置识别为高阶结构，新手却仍需逐个元素处理。分块教学因此必须建立知识与标签，而不是只把长串机械切成相同长度。',
      sourceIds: ['national-academies-how-people-learn'],
    },
    {
      date: '2000',
      title: '组块与先前知识进入教学框架',
      body: '《How People Learn》综合认知研究，强调先前知识影响注意、组织和迁移。相同材料对不同学习者形成的组块可能不同，教学应显式呈现层级与关系。',
      sourceIds: ['national-academies-how-people-learn'],
    },
    {
      date: '2001',
      title: '控制策略后容量估计约为四组块',
      body: 'Cowan 综合控制复述与组块策略的实验，认为成人注意焦点常约为四个组块。这个结果支持减少同时处理的单位，但不是课程内容只能有四组的规则。',
      sourceIds: ['cowan-2001'],
    },
    {
      date: '2010',
      title: '容量限制解释仍存在竞争',
      body: 'Cowan 比较注意焦点、时间与干扰等解释，说明容量限制不是单一机制。教学上更可靠的做法是降低无关负荷、提供结构和用延迟提取验证。',
      sourceIds: ['cowan-2010'],
    },
  ],
  outcome:
    '有效分块要求标签可理解、层级可重建、项目可完整还原。评价应同时看项目遗漏、顺序、类别线索和延迟测试，而不能只凭一次记得更快。',
  significance:
    '分块把容量问题转成组织问题，并提醒专业知识是有效组块的条件；没有意义的切段不会自动形成专家结构。',
  sourceCards: [
    source(
      'cowan-2010',
      'The Magical Mystery Four: How Is Working Memory Capacity Limited, and Why?',
      'Nelson Cowan',
      '2010',
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC2864034/',
      '核对工作记忆容量限制与竞争性解释。',
    ),
    source(
      'miller-1956',
      'The Magical Number Seven, Plus or Minus Two',
      'George A. Miller',
      '1956',
      'https://doi.org/10.1037/h0043158',
      '核对组块概念与早期容量研究。',
    ),
    source(
      'chase-simon-1973',
      'Perception in Chess',
      'William G. Chase & Herbert A. Simon',
      '1973',
      'https://doi.org/10.1016/0010-0285(73)90004-2',
      '核对棋局专业知识与组块复现实验。',
    ),
    source(
      'cowan-2001',
      'The Magical Number 4 in Short-Term Memory',
      'Nelson Cowan',
      '2001',
      'https://doi.org/10.1017/S0140525X01003922',
      '核对控制策略后约四个组块的容量估计。',
    ),
    source(
      'national-academies-how-people-learn',
      'How People Learn: Brain, Mind, Experience, and School',
      'National Academies Press',
      '2000',
      'https://nap.nationalacademies.org/catalog/9853/how-people-learn-brain-mind-experience-and-school',
      '核对先前知识、组织与迁移的教学意义。',
    ),
  ],
} satisfies LearningV2EventDetail;

const ACRONYM_ARCHIVE = {
  id: 'acronym-keyword-evidence',
  kind: 'experiment',
  title: '首字母与关键词法：两种线索，两种边界',
  period: '1975—2015',
  summary:
    '首字母法压缩有序项目，关键词法用发音相近词和互动图像连接外语词义。两者都能提供线索，但都不能替代准确释义、发音和迁移练习。',
  background:
    '关键词法研究比较外语词汇的机械重复、语境学习与关键词图像。教育综述又比较其即时回忆、延迟保持和不同年龄、材料的适用性。',
  timeline: [
    {
      date: '1975',
      title: '关键词法被用于俄语词汇学习',
      body: 'Atkinson 与 Raugh 让学习者把外语词发音连接到熟悉关键词，再形成关键词与母语释义的图像。研究显示该方法能改善词汇提取，但测试主要限定在词汇回忆。',
      sourceIds: ['atkinson-raugh-1975'],
    },
    {
      date: '1988',
      title: '关键词效用受到任务条件检验',
      body: 'McDaniel 与 Pressley 比较关键词编码与语境学习，发现关键词法在即时词汇回忆上常有优势，但语境理解、句子使用和长期迁移需要另外评价。',
      sourceIds: ['mcdaniel-pressley-1988'],
    },
    {
      date: '2000s',
      title: '首字母缩略词用于有序程序',
      body: '首字母法把一组步骤的首字或首字母组成较短提示，适合项目名称稳定、顺序明确的材料。它提示起点，却不会自动解释每一步的条件和作用。',
      sourceIds: ['putnam-2015'],
    },
    {
      date: '2013',
      title: '教育综述降低对单一记忆术的期待',
      body: 'Dunlosky 等综述认为关键词记忆术的效用证据有限，且高度依赖材料与实施。它不应挤占练习测试、间隔复习和概念理解等更通用的学习时间。',
      sourceIds: ['dunlosky-2013'],
    },
    {
      date: '2015',
      title: '记忆术教学被要求包含生成与核对',
      body: 'Putnam 的综述强调由教师示范、学习者自行生成、及时纠正和后续应用。错误谐音或含糊首字母若未核对，会把发音、词义或程序顺序固定成错误。',
      sourceIds: ['putnam-2015'],
    },
    {
      date: '教学迁移',
      title: '线索必须回到真实任务',
      body: '词汇要进入句子听辨与阅读，程序要进入实际步骤操作。只有 24 小时后能在新语境中解释或使用，才能说明缩略提示没有取代真正知识。',
      sourceIds: ['atkinson-raugh-1975', 'mcdaniel-pressley-1988'],
    },
  ],
  outcome:
    '首字母法适用于项目名称和顺序清楚的材料，关键词法适用于可建立发音—图像—释义联系的词汇。两者都要核对准确性和延迟迁移。',
  significance:
    '两种方法提供压缩线索而非完整理解。把线索与反馈、提取和真实任务连接起来，才能避免“记住提示却不会使用概念”。',
  sourceCards: [
    source(
      'atkinson-raugh-1975',
      'An Application of the Mnemonic Keyword Method to the Acquisition of a Russian Vocabulary',
      'Richard C. Atkinson & Michael R. Raugh',
      '1975',
      'https://doi.org/10.1037/0278-7393.1.2.126',
      '核对关键词法用于外语词汇的经典实验。',
    ),
    source(
      'mcdaniel-pressley-1988',
      'On the Utility of the Keyword Mnemonic for Vocabulary Learning',
      'Mark A. McDaniel & Michael Pressley',
      '1988',
      'https://doi.org/10.1037/0022-0663.80.4.554',
      '核对关键词法在词汇与语境任务中的边界。',
    ),
    source(
      'dunlosky-2013',
      'Improving Students’ Learning With Effective Learning Techniques',
      'John Dunlosky et al.',
      '2013',
      'https://doi.org/10.1177/1529100612453266',
      '核对关键词记忆术的效用评价和应用限制。',
    ),
    source(
      'putnam-2015',
      'Mnemonics in Education: Current Research and Applications',
      'A. L. Putnam',
      '2015',
      'https://doi.org/10.1037/tps0000023',
      '核对记忆术教学、生成、反馈和迁移建议。',
    ),
  ],
} satisfies LearningV2EventDetail;

const STORY_ARCHIVE = {
  id: 'narrative-story-memory-evidence',
  kind: 'experiment',
  title: '故事法：叙事为什么能组织序列与提取',
  period: '1969—2015',
  summary:
    '故事法把项目放进人物、动作、地点和因果链中。叙事提供连续框架，但必须包含全部目标项目、保持可理解关系，并接受延迟与乱序测试。',
  background:
    '序列学习实验比较零散词表与连贯叙事。后续研究区分图像、故事和语义加工的作用，并提醒故事不能替代学科事实与推理。',
  timeline: [
    {
      date: '1969',
      title: '叙事作为序列回忆的中介',
      body: 'Bower 与 Clark 让参与者把词表编入故事，连贯情节比孤立项目提供更多关系线索。回忆时一个角色或事件可以带动后续项目，形成顺序结构。',
      sourceIds: ['bower-clark-1969'],
    },
    {
      date: '1970',
      title: '互动图像为故事提供关系节点',
      body: 'Bower 的研究显示，关系图像能组织词对而非只增加视觉热闹。故事法中的动作和地点要真正连接相邻项目，才能成为可恢复的节点。',
      sourceIds: ['bower-1970'],
    },
    {
      date: '1972',
      title: '连贯意义支持编码',
      body: 'Craik 与 Lockhart 区分表面形式与意义加工。故事若围绕材料的关键关系展开，比机械罗列更容易形成整体表征；若情节与内容无关，则可能只是额外负担。',
      sourceIds: ['craik-lockhart-1972', 'noba-memory'],
    },
    {
      date: '2006',
      title: '故事之后仍需主动提取',
      body: 'Roediger 与 Karpicke 的测试效应研究提醒，听完或写完故事不等于能够回忆。合上材料复述角色和项目，再用反馈修正遗漏，才是完整练习。',
      sourceIds: ['roediger-karpicke-2006'],
    },
    {
      date: '2015',
      title: '教学综述强调材料匹配',
      body: 'Putnam 指出记忆术需要与学习目标匹配。故事适合有顺序的项目和词汇，但用于复杂理论时，叙事可能牺牲条件、证据和反例，必须保留原结构。',
      sourceIds: ['putnam-2015'],
    },
    {
      date: '教学迁移',
      title: '新故事不保证新理解',
      body: '如果学习者只能复述原故事，却不能解释概念关系或迁移到新例子，收益可能停留在情节记忆。延迟测试应加入乱序项目和意义问题。',
      sourceIds: ['noba-memory', 'dunlosky-2013'],
    },
  ],
  outcome:
    '故事法的可观察成效包括项目齐全、顺序连续、乱序可定位和延迟仍可解释。故事连贯不等于学科理解，最终仍要回到材料事实与迁移任务。',
  significance:
    '叙事把序列转成关系网络，适合词汇与步骤教学；其边界在于不能替代定义、证据和因果推理。',
  sourceCards: [
    source(
      'bower-clark-1969',
      'Narrative Stories as Mediators for Serial Learning',
      'Gordon H. Bower & Michal C. Clark',
      '1969',
      'https://doi.org/10.3758/BF03332778',
      '核对故事组织对序列回忆的影响。',
    ),
    source(
      'bower-1970',
      'Imagery as a Relational Organizer in Associative Learning',
      'Gordon H. Bower',
      '1970',
      'https://doi.org/10.1016/S0022-5371(70)80096-2',
      '核对互动图像对项目关系的组织作用。',
    ),
    source(
      'craik-lockhart-1972',
      'Levels of Processing: A Framework for Memory Research',
      'Fergus I. M. Craik & Robert S. Lockhart',
      '1972',
      'https://doi.org/10.1016/S0022-5371(72)80001-X',
      '核对意义加工与表面重复的保持差异。',
    ),
    source(
      'roediger-karpicke-2006',
      'Test-Enhanced Learning: Taking Memory Tests Improves Long-Term Retention',
      'Henry L. Roediger III & Jeffrey D. Karpicke',
      '2006',
      'https://doi.org/10.1111/j.1467-9280.2006.01693.x',
      '核对提取反馈对故事内容的延迟保持。',
    ),
    source(
      'noba-memory',
      'Memory (Encoding, Storage, Retrieval)',
      'Noba Project',
      '2025 年访问版',
      'https://nobaproject.com/modules/memory-encoding-storage-retrieval',
      '核对编码、线索与提取的教学原则。',
    ),
    source(
      'putnam-2015',
      'Mnemonics in Education: Current Research and Applications',
      'A. L. Putnam',
      '2015',
      'https://doi.org/10.1037/tps0000023',
      '核对故事法与其他记忆术的应用条件。',
    ),
    source(
      'dunlosky-2013',
      'Improving Students’ Learning With Effective Learning Techniques',
      'John Dunlosky et al.',
      '2013',
      'https://doi.org/10.1177/1529100612453266',
      '核对图像和记忆术的有限证据与迁移风险。',
    ),
  ],
} satisfies LearningV2EventDetail;

const PALACE_SOURCES = [
  'Martin Dresler et al., Mnemonic Training Reshapes Brain Networks, Neuron, 2017。https://doi.org/10.1016/j.neuron.2017.02.003',
  'Eleanor A. Maguire et al., Routes to Remembering, Nature Neuroscience, 2002。https://doi.org/10.1038/nn988',
  'Frances A. Yates, The Art of Memory, University of Chicago Press。https://press.uchicago.edu/ucp/books/book/chicago/A/bo3621895.html',
  'Noba Project, Memory (Encoding, Storage, Retrieval)。https://nobaproject.com/modules/memory-encoding-storage-retrieval',
];

const CHAIN_SOURCES = [
  'Gordon H. Bower, Imagery as a Relational Organizer in Associative Learning, 1970。https://doi.org/10.1016/S0022-5371(70)80096-2',
  'Gordon H. Bower & Michal C. Clark, Narrative Stories as Mediators for Serial Learning, 1969。https://doi.org/10.3758/BF03332778',
  'John Dunlosky et al., Improving Students’ Learning With Effective Learning Techniques, 2013。https://doi.org/10.1177/1529100612453266',
  'Noba Project, Memory (Encoding, Storage, Retrieval)。https://nobaproject.com/modules/memory-encoding-storage-retrieval',
];

const CHUNK_SOURCES = [
  'Nelson Cowan, The Magical Mystery Four, 2010。https://pmc.ncbi.nlm.nih.gov/articles/PMC2864034/',
  'George A. Miller, The Magical Number Seven, Plus or Minus Two, 1956。https://doi.org/10.1037/h0043158',
  'William G. Chase & Herbert A. Simon, Perception in Chess, 1973。https://doi.org/10.1016/0010-0285(73)90004-2',
  'National Academies, How People Learn。https://nap.nationalacademies.org/catalog/9853/how-people-learn-brain-mind-experience-and-school',
];

const ACRONYM_SOURCES = [
  'A. L. Putnam, Mnemonics in Education: Current Research and Applications, 2015。https://doi.org/10.1037/tps0000023',
  'Richard C. Atkinson & Michael R. Raugh, The Mnemonic Keyword Method, 1975。https://doi.org/10.1037/0278-7393.1.2.126',
  'Mark A. McDaniel & Michael Pressley, Keyword Mnemonic Utility, 1988。https://doi.org/10.1037/0022-0663.80.4.554',
  'John Dunlosky et al., Improving Students’ Learning With Effective Learning Techniques, 2013。https://doi.org/10.1177/1529100612453266',
];

const STORY_SOURCES = [
  'Gordon H. Bower & Michal C. Clark, Narrative Stories as Mediators for Serial Learning, 1969。https://doi.org/10.3758/BF03332778',
  'Gordon H. Bower, Imagery as a Relational Organizer in Associative Learning, 1970。https://doi.org/10.1016/S0022-5371(70)80096-2',
  'A. L. Putnam, Mnemonics in Education: Current Research and Applications, 2015。https://doi.org/10.1037/tps0000023',
  'Noba Project, Memory (Encoding, Storage, Retrieval)。https://nobaproject.com/modules/memory-encoding-storage-retrieval',
];

export const MEMORY_METHODS_REWRITE: CuratedCoursePlanPatchMap = {
  'memory:记忆宫殿：20 个词的有序提取': {
    contentStatus: 'reviewed',
    prerequisite: '完成记忆基础课程；能选择一条熟悉路线并记录 5 个固定锚点。',
    plainLanguageGoal:
      '学完后，你能用 5 个空间锚点编码 20 个词，并用顺序回忆、随机抽查和 24 小时复查评价提取效果。',
    guidedPractice:
      '选一条每天经过的路线，固定 5 个锚点，每处放 4 个词，完成顺序回忆、10 次随机抽查和 24 小时延迟测试。',
    independentPractice:
      '换一份 20 词材料并重新走一遍路线，记录锚点混淆、项目遗漏、顺序错误和随机线索正确率，再修正最弱锚点。',
    commonErrors: [
      '路线不熟或锚点彼此太相似，走过时无法分辨当前地点。',
      '每个锚点塞入过多词，只记得夸张画面却漏掉具体项目。',
      '只按顺序复述，不做随机抽查和 24 小时复查。',
    ],
    sourceRefs: PALACE_SOURCES,
    studyPoints: [
      point('必背', '记忆宫殿依赖固定路线、可区分锚点和项目间动态联系；顺序回忆、随机抽查与延迟测试缺一不可。', 1),
      point('重点', '每个锚点承载少量项目，画面要让词与地点发生具体互动，而不是只把词贴在墙上。', 2),
      point('易错', '能走完整条路线不等于能随机取词；锚点混淆必须通过重新编码和独立复查修正。', 4),
    ],
    eventDetails: [PALACE_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜二十个词为什么最后只剩开头几个',
        body:
          '把二十个无关词依次读两遍，六十秒后遮住材料按顺序写。多数结果会出现开头较稳、中段丢失和末尾混淆。这个前测不需要评价记性，而要记录项目正确数、位置正确数、最长连续段和空白时间。再尝试回忆第 13 个词和第 7 个词，观察顺序位置是否比随机线索容易。宫殿法将利用熟悉路线提供固定位置，但路线选择、锚点区分和画面联系都会影响后测，所以先保留原始基线。',
        note: '路线不是装饰，是提取坐标。',
        objective: '能用项目数、顺序位置、连续段和随机线索描述二十词材料的前测基线。',
        practice: '完成二十词前测，标出正确、遗漏、错序和完全空白，并尝试两个随机位置。',
        checkpoint: '检查是否只记总数，是否区分项目与顺序，是否保留原始材料与呈现时长。',
      },
      {
        title: '材料与概念｜路线、锚点与动态画面',
        body:
          '记忆宫殿把熟悉空间中的固定位置当作有序线索，再把待记项目编码成发生在该位置的动态画面。有效条件包括路线稳定、锚点清楚、项目之间有区别、画面能还原目标词。证据研究关注训练任务中的有序回忆和神经加工变化，并没有证明所有人获得照相机式记忆。每个地点放入适量项目可减少拥堵；若画面只反复出现同一种颜色或动作，词与词会产生干扰。宫殿法属于组织与检索策略，仍要配合反馈和间隔复查。',
        note: '有序位置要服务随机提取。',
        objective: '能解释路线、锚点、动态编码、顺序提取和延迟复查之间的关系。',
        practice: '画出一条五锚点路线，为每个位置写可区分的空间特征和最多四个项目的分工。',
        checkpoint: '检查路线是否熟悉，锚点是否唯一，是否说明项目画面怎样还原，而非只描述漂亮场景。',
      },
      {
        title: '示范与推导｜把五个词放进一条可复走路线上',
        body:
          '以门口、鞋柜、楼梯、餐桌、书桌为五个锚点，项目为钥匙、雨伞、面包、邮票、耳机。门口让钥匙打开一把下暴雨的伞，鞋柜把伞柄插进面包，楼梯用邮票铺成台阶，餐桌让耳机绕着餐桌飞行，书桌最后接住耳机。示范要从起点走一遍，再随机问“面包在哪里”和“邮票前一项是什么”。若面包与餐桌上的其他食物混淆，说明画面区分度不足而不是路线无效；修正时应改变动作和对象，不要增加更多无关情节。',
        note: '画面必须能还原目标词。',
        objective: '能把五个词编码到固定路线，并用顺序、逆序和随机线索检验联系。',
        practice: '为五个词的每个锚点写出动作、目标词和相邻关系，闭眼走路线后完成三种提取。',
        checkpoint: '检查每个画面是否包含准确词语，是否出现同质动作，是否能从随机位置继续前进。',
      },
      {
        title: '引导练习｜五锚点承载二十个词',
        body:
          '选择一条每天都会经过、至少有五个清楚位置的路线。把二十个词平均分配到五个锚点，每处用一个主要动作串起四个词，并写明动作顺序。编码八分钟后做即时后测：先按路线顺序写下全部词，再做十次随机抽查，逐次回答“这个位置有什么”。第二天不看材料复述，记录锚点混淆和错误插入，并只重做最弱的两个位置。材料要保留到 24 小时测试完成后，不能用重新阅读代替回忆。',
        note: '弱锚点要单独重编码。',
        objective: '能用固定路线完成二十词编码，并通过顺序、随机和延迟测试定位弱锚点。',
        practice: '提交路线图、五组画面、即时顺序回忆、十次随机抽查和 24 小时延迟结果。',
        checkpoint: '检查锚点是否五个，项目是否完整，是否区分顺序与随机得分，是否记录错误画面。',
      },
      {
        title: '独立迁移与评价｜换一组材料重建路线',
        body:
          '间隔两天后换一份新的二十词材料，可使用同一条路线但不得沿用完全相同动作。先做一次简短前测，再编码、即时后测和 24 小时复查。评价四项：路线顺序稳定、项目全部可还原、随机线索能定位、延迟错误可解释。最后选出一个失败锚点，写明是位置不熟、项目过多还是画面相似，并给出重编码版本。迁移成功表现为方法能用于新材料，不是只记住上一次的二十个词。',
        note: '新材料才能检验方法迁移。',
        objective: '能把宫殿法迁移到新材料，并用延迟与错误分析评价路线质量。',
        practice: '提交新路线编码、两轮测试、随机抽查、24 小时结果和弱锚点重写。',
        checkpoint: '四项自评：路线稳定、项目完整、随机可取、延迟可改；任一失败都要定位到具体锚点。',
      },
    ],
    quiz: [
      question(
        '记忆宫殿中最关键的三个组成是什么？',
        '固定路线、可区分锚点与能还原项目的联系画面',
        ['越夸张越好的单一画面', '一次放入尽可能多的词', '只看一遍不做提取'],
        0,
        '路线提供顺序，锚点提供位置，联系画面负责把词绑定到位置。只追求夸张或数量会造成干扰，也无法保证随机取回，更无法通过延迟复查。',
        '事实与定义',
      ),
      question(
        '顺序回忆很好，但随机问第 12 个词经常失败，最可能说明什么？',
        '项目主要依赖前后文连续推进，独立锚点线索还不够强',
        ['二十个词全部没有编码', '路线越短越容易永久记住', '随机测试没有任何诊断价值'],
        1,
        '顺序成功可能依靠相邻项目带动。随机失败提示某些位置缺少独立可检索线索，需要检查该锚点画面和项目是否拥挤，并单独重编码。',
        '材料与推导',
      ),
      question(
        '哪一种做法最可能削弱宫殿法效果？',
        '五个锚点外观几乎一样，每个地点还放八个相似画面',
        ['路线每天经过且位置清楚', '每个锚点用具体动作连接项目', '完成后做随机抽查与延迟测试'],
        2,
        '锚点相似和项目拥堵都会增加位置混淆。可区分空间、适量项目与多重提取测试才有利于稳定表现，单纯换更夸张的颜色并不能修复路线问题。',
        '常见误区',
      ),
      question(
        '把宫殿法迁移到背诵演讲要点时，哪种评价最完整？',
        '按路线复述、随机跳点、脱稿解释和 24 小时后复查',
        ['只看画面是否好笑', '只背标题顺序不看内容', '只在原稿上重新划线'],
        0,
        '演讲既需要顺序也需要内容表达。随机跳点和延迟解释能检查锚点是否真正支持提取，而非只形成一条顺口路线，也能暴露忘词后的恢复能力。',
        '迁移应用',
      ),
    ],
  },
  'memory:联想链：从荒诞到稳定': {
    contentStatus: 'reviewed',
    prerequisite: '完成记忆宫殿或具有基础图像编码经验，能记录顺序与随机提取。',
    plainLanguageGoal:
      '学完后，你能用相邻项目的具体互动建立可逆联想链，并通过顺序、逆序、乱序和 24 小时测试修正干扰。',
    guidedPractice:
      '把 12 个具体名词两两连接成六个互动画面，完成正向、逆向和随机起点回忆，记录断裂与错误插入。',
    independentPractice:
      '用 10 个学科术语建立相邻联想，保留释义核对，比较顺序回忆与随机线索，并在 24 小时后重测。',
    commonErrors: [
      '只把两个词放进同一画面，没有动作、方向或因果关系。',
      '所有链接都使用同一个人、房间或动作，导致线索互相竞争。',
      '只记画面有趣，无法准确还原两个目标词和它们的顺序。',
    ],
    sourceRefs: CHAIN_SOURCES,
    studyPoints: [
      point('必背', '联想链连接的是相邻项目之间的具体关系，可恢复、可区分比荒诞程度更重要。', 1),
      point('重点', '正向、逆向和随机起点测试能发现单向链接、同质画面和错误插入。', 3),
      point('易错', '画面包含很多元素却没有准确动作时，会增加无关负担；链接必须能还原目标项目。', 4),
    ],
    eventDetails: [CHAIN_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜画面很热闹为什么取不回原来的词',
        body:
          '取十二个常见名词，先按原顺序学习一分钟，再遮住材料默写作为即时后测。然后让学习者描述刚才想到的画面，常会发现画面里出现额外物品、相邻动作雷同，或只能从第一个词往后走。前测记录四个量：项目正确数、顺序正确数、逆向起点成功数和错误插入数。接着随机指向一个词，要求说出后一项。若正向可以而逆向失败，说明链接可能只是单向叙事；若多个场景都在同一房间，后续需要提高动作和对象的区分度。',
        note: '有趣不等于可恢复。',
        objective: '能用正向、逆向、随机起点和错误插入定位联想链的薄弱连接。',
        practice: '完成十二词前测并标出每一处断裂，描述当时画面中出现但词表没有的项目。',
        checkpoint: '检查是否记录双向提取，是否区分遗漏与错误插入，是否保留原词表顺序。',
      },
      {
        title: '材料与概念｜相邻关系与互动图像',
        body:
          '联想链把相邻项目编码成同一个事件，后一项应在前一项动作的结果或方向上出现。关系图像研究提示，项目间互动比孤立重复更有组织力；但联系必须可解释，不能只把两个词摆在一起。夸张画面可以增加区别，不过若夸张元素遮住目标词，或所有链接重复同一动作，反而增加干扰。链条越短越容易保持方向，材料很长时应拆成若干段，并在段间留独立锚点。联想只负责线索组织，释义和推理仍需回到材料核对。',
        note: '每个连接都要有方向。',
        objective: '能区分并列摆放、单向叙事和可双向恢复的关系编码。',
        practice: '把六个词对分别写成“动作—对象—结果”，删去不指向目标词的装饰元素。',
        checkpoint: '检查每个画面是否包含两个目标词，是否有可逆方向，是否出现同质动作或无关插入。',
      },
      {
        title: '示范与推导｜从灯塔到雨衣再到列车',
        body:
          '灯塔、雨衣、列车三个词可编码为：灯塔突然喷下暴雨，雨衣撑开接住水柱，雨衣口袋里冲出一列小车沿轨道驶走。正向问“灯塔之后是什么”，逆向问“什么带来列车”，随机起点问“雨衣同时连接谁”。示范时先不看原词复述，再检查画面是否准确包含三项。若列车与汽车混淆，应在动作里写明轨道和车厢，而不是再加一段无关追逐。推导重点是：联系方向清楚—目标词可还原—多重入口可提取—延迟仍稳定。',
        note: '一个事件带动一组相邻词。',
        objective: '能把三个项目写成有方向的互动链，并从正向、逆向和随机起点提取。',
        practice: '为三个词绘制链式图，在每个箭头上写动作，完成后从中间词向两端复述。',
        checkpoint: '检查箭头方向，目标词是否准确，随机起点能否启动前后两项，画面是否删除无关装饰。',
      },
      {
        title: '引导练习｜六段链连接十二个词',
        body:
          '准备十二个具体名词，分为六对。每对生成一个包含动作、方向与结果的画面，再按原顺序连接整条链。编码六分钟后完成正向回忆、从末端逆向回忆、四个乱序起点和一次打乱词表顺序后的重建。第二天不看材料再测一次，记录断点、错误插入和同质画面。对于断裂连接，不要重读整个词表，只重写对应箭头并再次测试。每个画面最多保留两个目标词和一个关键动作，防止故事膨胀到无法控制。',
        note: '断点只修对应箭头。',
        objective: '能用十二词材料完成双向联想编码，并根据测试结果修复单条连接。',
        practice: '提交六组关系图、正向与逆向回忆、四个随机起点和 24 小时重测结果。',
        checkpoint: '检查十二词是否完整，动作是否具体，断点能否定位到相邻项目，是否记录错误插入。',
      },
      {
        title: '独立迁移与评价｜把术语链接到真实含义',
        body:
          '选择十个当前学科术语，先写准确释义，再为相邻术语建立能体现关系的联想。完成后遮住释义做顺序回忆，随机抽三个词解释含义，并在 24 小时后用新例子判断。评价四项：项目完整、方向可逆、含义准确、迁移可用。最后写一条失效边界，例如“抽象过程若只用谐音画面会掩盖条件与因果”。联想链是提取入口，不能替代定义和例子；若迁移失败，应回到原概念重新编码。',
        note: '术语链必须回到真实含义。',
        objective: '能把联想链迁移到学科术语，并用释义、随机与新例测试限定方法边界。',
        practice: '提交十项术语链、准确释义、两轮提取、24 小时新例测试和一条失效边界。',
        checkpoint: '四项自评：词项完整、关系可逆、含义正确、迁移成立；任何一项错误都需重写对应连接。',
      },
    ],
    quiz: [
      question(
        '联想链中，相邻项目的有效连接应具备什么特征？',
        '有具体动作或方向，能从前一项恢复到后一项并反向定位',
        ['把两个词放在同一页上', '画面越大越好但不需要关系', '所有连接都使用同一个房间'],
        0,
        '关系图像要通过动作、方向或因果连接项目。可逆定位能排除只是单向背诵而没有形成可恢复结构，也能发现画面里缺少的目标词。',
        '事实与定义',
      ),
      question(
        '正向回忆顺利、逆向和随机起点失败，最合理的第一检查点是什么？',
        '连接可能只在连续叙事中成立，需要检查每个箭头能否独立定位',
        ['说明词表太短无法测试', '必须增加更多无关人物', '可以取消所有延迟测试'],
        1,
        '单向流畅可能依赖上下句带动。逆向或随机失败提示连接方向不足，应重写具体动作而不是扩大故事，并再次检查相邻项目是否完整。',
        '材料与推导',
      ),
      question(
        '哪一种联想设计最容易产生干扰？',
        '六组词对都由同一个人在同一房间拿起物品',
        ['每组动作和目标词都不同', '每个链接能说明前后关系', '完成后测试随机起点'],
        2,
        '同质人物与地点会让线索竞争，回想时无法判断属于哪一对。区分度来自具体动作、对象和方向差异，重复同一套画面会放大错误插入。',
        '常见误区',
      ),
      question(
        '把联想链用于历史事件顺序时，哪种做法最稳妥？',
        '用事件因果建立连接，同时保留年代、参与者核对和时间线复查',
        ['只记夸张人物不看史实', '把所有年代改写成谐音', '只看故事是否有趣'],
        0,
        '历史顺序需要事实准确。联想可以连接节点，但不能替代年代、参与者和因果证据，最终要在时间线中复核，并保留没有记住的节点。',
        '迁移应用',
      ),
    ],
  },
  'memory:分块：把长串压缩成结构': {
    contentStatus: 'reviewed',
    prerequisite: '完成工作记忆容量课程，能建立类别、层级和顺序记录。',
    plainLanguageGoal:
      '学完后，你能把 20 项长串组织成有标签的层级组块，并通过完整还原、类别线索、随机抽查和 24 小时测试评价效果。',
    guidedPractice:
      '把 20 个词分成 5 个类别、每类 4 项，先记组块标签再记项目，完成类别提示、随机抽查和 24 小时重建。',
    independentPractice:
      '把一份真实术语或公式列表改写成两层结构，比较原顺序与分块版本的即时和延迟提取，保留项目遗漏记录。',
    commonErrors: [
      '只按项目数量机械切成四段，没有可理解的类别或层级。',
      '记住组块名称却漏掉内部项目，未检查完整还原。',
      '只按类别顺序回忆，不测试随机抽取和跨组迁移。',
    ],
    sourceRefs: CHUNK_SOURCES,
    studyPoints: [
      point('必背', '分块通过有意义标签和层级减少同时处理的单位，但必须能完整还原全部项目与顺序。', 1),
      point('重点', '专家组块依赖先前知识；初学者需要显式学习类别、关系和边界，不能只做等长切分。', 2),
      point('易错', '组块标题不是掌握证据；类别提示后仍要抽查内部项目、错误插入和 24 小时重建。', 4),
    ],
    eventDetails: [CHUNK_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜十六项长串为什么记住类别却漏掉内容',
        body:
          '准备十六个词，先随机排列并学习两分钟，完成一次前测；再把同样十六个词按四个类别组织，学习两分钟并做后测。记录项目总数、类别正确数、类别内项目和最长连续段。若分块后更快说出类别，却仍漏掉具体项目，说明标签只提供了入口，内部结构尚未建立。还要检查不同学习者是否能解释分类依据：同一组词可由用途、时代或条件分组，错误标签会造成后续提取路径互相冲突。',
        note: '标签必须能带出内部项目。',
        objective: '能比较随机长串与分类组块的项目、类别和完整还原差异。',
        practice: '完成十六词两条件前测，分别统计类别数、内部项目数、遗漏和错误插入。',
        checkpoint: '检查分类依据是否一致，是否只记标题，是否记录全部项目与顺序而没有只看速度。',
      },
      {
        title: '材料与概念｜组块、标签与层级',
        body:
          '组块是把多个元素组织成一个可识别单位，常用于处理超出即时负荷的长串。专业知识可以让棋手、医生或程序员快速识别熟悉结构，新手则需要显式建立关系和边界。有效分块通常包含可理解的上级标签、稳定的子项和清楚的顺序规则；它减少的是同时处理单位，不是删除信息。认知负荷过高时，分段、表格和外部记录可以降低无关占用，但组块本身不会自动形成长期记忆。若长串只按字数相等切分，学习者仍需逐个处理，效果与真正意义组块不同。',
        note: '结构来自关系，不来自等长。',
        objective: '能解释组块、类别标签、层级、认知负荷和长期记忆的区别。',
        practice: '为三组材料分别设计用途、条件和流程层级，并说明每组标签为什么不会混淆。',
        checkpoint: '检查标签是否有意义，子项是否完整，是否说明顺序规则和长期提取需要。',
      },
      {
        title: '示范与推导｜把十二项压成三个可展开组块',
        body:
          '把十二个词按“观察—判断—行动”分为三组，每组四项，形成“总目标—类别—项目”的层次。先让学习者看到三个高层标签，再逐组展开内部项目，最后只看标签重建全部内容。示范时比较两种失败：只记标签会漏项，只记项目则难以在大列表中定位。有效推导是：上级关系—组块数量减少—类别内顺序清楚—完整还原—随机提取。还要加入一个反例：某项同时适合两个类别时，必须写优先规则，否则组块边界不确定。',
        note: '每个组块都要能展开和闭合。',
        objective: '能把十二项组织成三层结构，并用标签重建、随机抽取和边界规则检验。',
        practice: '制作三级树状图，为每项写位置，再删除小项只看标签复述全部内容。',
        checkpoint: '检查层级是否一致，是否有重复或漏项，是否能说明交叉项目的归类规则。',
      },
      {
        title: '引导练习｜二十项、五类、每类四项',
        body:
          '选择二十个词，按五个有意义的类别各放四项。先学习五个类别标签两分钟，再逐类编码每项与类别的关系五分钟。完成即时后测：写出全部类别并从每类抽一项解释。随后随机抽取十个词，要求说出所属类别；第二天只给类别名称，重建全部二十项。记录标题正确、内部项目正确、跨类错误和 24 小时遗漏。若某类总漏项，检查是标签太抽象还是类别内四项没有顺序。',
        note: '类别内也要有定位方式。',
        objective: '能独立构建五类四层的二十项组块，并通过类别提示与随机抽取评价完整性。',
        practice: '提交分类表、即时重建、十次随机归类、24 小时类别重建和错误统计。',
        checkpoint: '检查五个类别是否互斥，内部项目是否齐全，是否测试双向类别线索，是否保留遗漏项。',
      },
      {
        title: '独立迁移与评价｜把真实清单改造成可展开结构',
        body:
          '从当前学科选择一份十项以上的真实清单，例如公式、法条要件或实验步骤。先保留原来顺序完成前测，再按条件、功能或流程建立两层结构。学习后用类别标签重建、随机抽取三项解释，并在 24 小时后做新例判断。评价四项：分类有依据、项目完整、随机可取、迁移可用。最后写下一个不能合并的项目，说明它为何需要单独边界。分块成功的证据是结构能支持完整提取，而非把页面压缩得更短。',
        note: '项目完整性优先于版面简洁。',
        objective: '能把分块方法迁移到真实知识清单，并用完整重建和新例判断评价效果。',
        practice: '提交前后两版清单、两轮测试、24 小时迁移题、遗漏记录和一条独立边界。',
        checkpoint: '四项自评：分类合理、项目完整、随机可查、迁移有效；项目若有遗漏必须重新展开组块。',
      },
    ],
    quiz: [
      question(
        '真正有意义的分块最应该包含什么？',
        '可理解的上级标签、稳定的内部项目和清楚的还原规则',
        ['仅把材料按字数等长切开', '只记标题不记内部内容', '一次把所有项目塞进一个画面'],
        0,
        '组块通过关系减少同时处理的单位，但仍要完整保留内容。标签、子项和还原规则共同构成可展开结构，等长切分并不满足这些条件。',
        '事实与定义',
      ),
      question(
        '分块后类别名称记得很准，但内部项目大量遗漏，说明什么？',
        '学习者可能只形成了类别入口，类别内关系与项目尚未编码完整',
        ['类别标签一定完全无用', '工作记忆已经无限扩大', '应该继续增加类别数量'],
        1,
        '能说出标签不代表能展开组块。需要检查类别内项目的关系、顺序和提取练习，并用重建测试验证，不能只增加更多标题。',
        '材料与推导',
      ),
      question(
        '哪种分类最容易产生提取冲突？',
        '同一项目没有优先规则，同时被放进两个类别',
        ['每个项目只出现一次', '类别标签能说明依据', '完成后做随机归类测试'],
        2,
        '重叠类别会让检索时无法确定位置。若材料确实需要多标签，应明确主类别、次标签或适用条件，并记录每次归类的依据。',
        '常见误区',
      ),
      question(
        '把分块法迁移到法律条文时，哪种结果最能说明有效？',
        '能由要件类别重建条文项目，并在新案例中准确调取和解释',
        ['把条文缩成几个好听标题', '只记住每组有多少字', '看到标题就觉得已经掌握'],
        0,
        '法律学习要求完整、准确和可应用。类别标签必须能展开到要件，并在案例中支持判断，不能只做文字压缩，也不能漏掉例外与限定。',
        '迁移应用',
      ),
    ],
  },
  'memory:首字母与关键词法': {
    contentStatus: 'reviewed',
    prerequisite: '能区分项目名称、外语发音与中文释义，并准备可核对的原始词表。',
    plainLanguageGoal:
      '学完后，你能为首字母提示和关键词法分别建立准确线索，并用即时、24 小时和语境任务判断线索是否有效。',
    guidedPractice:
      '为 6 个流程步骤制作首字母提示，为 8 个外语词制作关键词发音—图像—释义卡，完成线索回忆与纠错。',
    independentPractice:
      '从真实课程选 10 个词汇或步骤，比较原样重复与记忆术线索在 24 小时和句子应用中的表现。',
    commonErrors: [
      '首字母对应的项目名称不完整，提示顺序与原流程不一致。',
      '关键词只谐音不核对发音、词性和真实释义，形成错误联系。',
      '只测看到提示后的识别，不做无提示回忆和语境应用。',
    ],
    sourceRefs: ACRONYM_SOURCES,
    studyPoints: [
      point('必背', '首字母法压缩有序项目，关键词法连接发音、图像与释义；线索必须准确并接受延迟与语境测试。', 1),
      point('重点', '首字母提示要对应完整项目，关键词图像要同时锁定外语发音和中文含义，不能只记谐音。', 2),
      point('易错', '关键词法在词汇回忆中可能有帮助，但效用受材料和任务限制，不能替代阅读、听力与句子使用。', 4),
    ],
    eventDetails: [ACRONYM_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜首字母背得很顺为什么一用就错',
        body:
          '给出一组六步流程和八个外语词，先用原样重复学习五分钟，完成前测：写出步骤顺序、看到中文写外语、听发音选释义。记录全对项目、顺序错误、发音混淆和知道提示却无法展开的位置。再尝试用首字母或关键词提示，观察即时后测是否改善。前测要保留原词表和标准发音，因为把关键词建在错误读音上会让后续更难纠正。诊断重点是线索能否还原完整知识，不是缩略词是否顺口。',
        note: '提示必须回到完整内容。',
        objective: '能用顺序、词义、发音和语境前测区分“记住提示”与“掌握项目”。',
        practice: '完成六步流程和八词前测，分别记录顺序、发音、释义和提示展开失败。',
        checkpoint: '检查是否保留标准答案，是否区分识别与生成，是否记录错误谐音和项目名称缺口。',
      },
      {
        title: '材料与概念｜首字母压缩与关键词双钩',
        body:
          '首字母法取一组有序项目的第一字或首字母组成短提示，适合名称稳定、顺序明确的清单。它只压缩入口，学习者仍需能展开每项定义。关键词法先用一个发音相近的熟悉词作声音钩子，再让该词与中文释义形成互动图像，因此同时涉及发音和意义。关键词研究多见于外语词汇，教育综述对其效用评价较谨慎。若谐音偏离发音、图像与词义无关，或只做选择题，短期识别会高估掌握。两法都要配合闭卷生成和反馈，也要写清适用材料与退出边界。',
        note: '首字母与关键词不是同一方法。',
        objective: '能准确区分首字母压缩、关键词声音线索和关键词意义图像。',
        practice: '为同一组材料分别设计首字母入口与关键词卡，标明各自必须还原的内容。',
        checkpoint: '检查首字母是否覆盖完整项目，关键词是否保留发音和释义，是否说明不使用关键词的题型。',
      },
      {
        title: '示范与推导｜一个流程缩略词与一个词汇关键词',
        body:
          '六步流程若依次是界定、取样、测量、记录、核对、报告，可取“界取测记核报”形成短句，但复述时必须展开每步条件，不能只背六个字。外语词 abundant 表示“充足的”，可把发音拆到“一帮蚂蚁搬来很多粮食”，画面必须同时出现 abundant 的声音和“数量充足”的含义。示范后做无提示释义、听音辨词和造句三项测试；若造句失败，说明关键词只支持识别，尚未形成语境使用。错误关键词要删除并重建，不能继续重复。',
        note: '声音钩子要连到真实词义。',
        objective: '能为有序流程和外语词建立两种不同线索，并用展开、发音和语境任务验证。',
        practice: '制作一个六项首字母提示和一个关键词卡，完成无提示展开、听音与造句三项检查。',
        checkpoint: '检查缩略提示顺序，关键词发音是否接近，图像是否包含目标释义，语境是否自然准确。',
      },
      {
        title: '引导练习｜六步流程与八个外语词',
        body:
          '为六步流程取首字母后，先看提示复述全部名称和定义，再遮住提示从第一步重建。为八个外语词分别写标准音标、近似发音关键词、互动图像和中文释义；每词先听音选义，再做中译外，最后放入一个短句。十分钟后完成即时后测，第二天不看卡片做无提示与关键词提示两种测试。记录提示有效、无提示失败、发音错误和语境不自然四类结果，防止把“看到缩略词就懂”当作掌握。',
        note: '有提示与无提示要分开。',
        objective: '能用两套方法完成流程和词汇练习，并比较提示前后、延迟与语境表现。',
        practice: '提交六步缩略提示、八张关键词卡、即时测试、24 小时测试和语境造句。',
        checkpoint: '检查首字母能否独立展开，关键词是否准确，是否区分有提示与无提示，是否保留语境错误。',
      },
      {
        title: '独立迁移与评价｜选择真实材料并保留退出条件',
        body:
          '从当前课程选择十个真实项目，判断哪些适合首字母，哪些适合关键词。为每项记录选择理由、原始定义、提示和测试结果，在 24 小时后用无提示回忆与真实任务检查。评价四项：线索准确、项目完整、延迟有效、语境可用。最后写退出条件，例如连续两次在听音或造句中失败，就停用该关键词并回到音形义练习。关键词法不能取代语篇理解，首字母也不能替代流程条件。',
        note: '线索失效时要能退出。',
        objective: '能根据材料选择两种记忆术，并用延迟、语境和退出条件评价其真实价值。',
        practice: '提交十项选择理由、两轮测试、24 小时真实任务和至少一条停用线索记录。',
        checkpoint: '四项自评：线索准确、内容完整、延迟有效、语境自然；失效线索必须删除或重做。',
      },
    ],
    quiz: [
      question(
        '首字母法与关键词法最核心的区别是什么？',
        '首字母压缩有序项目入口，关键词用发音相近词和图像连接外语词义',
        ['两者都只记录页码', '首字母法专门替换所有定义', '关键词法不需要核对发音'],
        0,
        '首字母法组织项目首字，关键词法同时建立声音与意义联系。两者都只是线索，仍需展开完整知识和语境使用，不能把提示本身当答案。',
        '事实与定义',
      ),
      question(
        '关键词图像很生动，但学习者听标准发音仍无法辨认该词，问题最可能在哪？',
        '声音钩子与真实发音连接不足，图像只锁定了中文情境',
        ['说明所有词汇都不能用图像', '首字母数量一定不够', '24 小时后必然全部遗忘'],
        1,
        '关键词必须同时连接真实发音和释义。若听音失败，应修正声音钩子并增加听辨，而不是继续强化无关画面，也不能只做中文选择题。',
        '材料与推导',
      ),
      question(
        '哪种评价方式最可能高估关键词法效果？',
        '只做看到关键词后选择中文释义，不做无提示回忆和造句',
        ['分别测试听音、释义和语境', '在 24 小时后重新测试', '记录错误关键词并重建'],
        2,
        '提示下的再认比独立生成容易。缺少无提示和语境任务，无法判断词汇能否被真正提取和使用，也看不到发音和词性错误。',
        '常见误区',
      ),
      question(
        '把首字母法用于急救步骤时，最重要的附加检查是什么？',
        '能按顺序展开每一步的条件与动作，并通过情景演练核对准确性',
        ['缩略词读起来是否押韵', '是否把所有步骤缩成一个字', '是否只在纸上划线'],
        0,
        '急救程序要求顺序和动作准确。缩略词只是入口，必须回到完整步骤并在受控情景中演练，不能替代规范训练或现场专业判断。',
        '迁移应用',
      ),
    ],
  },
  'memory:故事法：人物、动作与地点': {
    contentStatus: 'reviewed',
    prerequisite: '完成联想链课程，能区分项目顺序、事实约束和虚构情节。',
    plainLanguageGoal:
      '学完后，你能把 12 个项目编入有角色、动作、地点和因果关系的故事，并用项目完整、顺序、乱序和 24 小时测试评价效果。',
    guidedPractice:
      '把 12 个具体名词编成三幕故事，每幕包含四个词，完成完整复述、随机取词和倒序检查。',
    independentPractice:
      '把 8 个学科步骤编入受事实约束的故事，同时保留原始定义，在 24 小时后用顺序复述和新例解释验证。',
    commonErrors: [
      '故事很好看但没有包含全部目标项目，或擅自改变学科事实。',
      '人物、地点和动作过于重复，多个场景互相混淆。',
      '只能顺着讲完整故事，无法随机取词或解释概念关系。',
    ],
    sourceRefs: STORY_SOURCES,
    studyPoints: [
      point('必背', '故事法用人物、动作、地点和因果链组织序列，但必须包含全部项目并保持事实准确。', 1),
      point('重点', '故事中的每个节点都要能还原目标词或步骤，随机抽取和倒序检查可发现单向叙事。', 3),
      point('易错', '情节有趣不能替代定义、条件和证据；用于学科材料时，故事要服从原有因果与顺序。', 4),
    ],
    eventDetails: [STORY_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜故事讲得完整为什么考点仍然漏',
        body:
          '给十二个具体名词两分钟，让学习者自由编故事后复述，再随机问第 3、7、11 个词作为即时后测。前测记录故事是否包含全部项目、顺序正确数、乱序取词数和错误插入。常见情况是情节丰富却漏掉两个词，或为了情节顺畅把后项提前。接着尝试倒序讲一遍，观察哪些节点只靠前文带动。若故事中出现原词表没有的角色或物品，也要记录其是否挤占目标信息。诊断目标是区分“会讲故事”与“能准确提取项目”。',
        note: '情节完整不等于项目完整。',
        objective: '能用项目覆盖、顺序、随机取词和错误插入诊断故事法的真实提取效果。',
        practice: '完成十二词故事前测，逐项标记覆盖、遗漏和错序，并做三个随机位置与倒序检查。',
        checkpoint: '检查是否逐项核对，是否记录无关插入，是否区分顺畅复述与随机定位。',
      },
      {
        title: '材料与概念｜人物、动作、地点与因果链',
        body:
          '故事法把项目组织为有时间顺序的事件网络。人物决定谁行动，地点提供场景坐标，动作连接前后项目，因果或目标关系维持情节推进。实验证据表明叙事组织能改善序列回忆，但效果依赖项目是否准确嵌入故事。过度夸张不是必要条件，清晰关系往往更重要。用于学科材料时，故事必须保留真实条件、顺序和因果，不能为了戏剧性改动事实。故事是编码框架，之后仍需闭卷复述、反馈与延迟测试。',
        note: '故事要服从材料事实。',
        objective: '能解释人物、动作、地点和因果链各自承担的编码功能及事实边界。',
        practice: '把一个六项流程拆成三幕，每幕标出人物、地点、动作、目标项目和事实约束。',
        checkpoint: '检查每个项目是否进入情节，事件顺序是否符合材料，是否出现改变事实的装饰。',
      },
      {
        title: '示范与推导｜用三幕故事串起十二个词',
        body:
          '把十二个词分成三幕，每幕四个。第一幕在车站，人物用钥匙打开雨伞并把面包塞进邮筒；第二幕在楼梯，人物用耳机拉动列车，列车撞翻花盆；第三幕在书桌，人物用胶带粘住灯泡再打开地图。示范时逐幕检查目标词是否齐全，再从末尾倒讲，随机问“花盆属于哪一幕”。若人物或地点重复到无法区分幕次，应更换动作而非无限增加角色。推导链是：场景分隔—动作连接—项目覆盖—多重提取—延迟复查。',
        note: '每幕要有独立场景边界。',
        objective: '能用三幕结构连接十二个项目，并通过逐幕覆盖、倒序和随机位置检验。',
        practice: '为三幕各写地点、人物、四个项目和关键动作，完成正序、倒序与三个随机问题。',
        checkpoint: '检查十二项是否完整，幕间边界是否清楚，动作是否指向目标词，事实约束是否保留。',
      },
      {
        title: '引导练习｜十二个词的三幕故事',
        body:
          '从十二个具体名词开始，先列原顺序并分三幕。每幕只设置一个主要地点和一个核心人物，四个词必须通过连续动作出现。故事写完后立即遮住词表，正序复述并逐项打勾；再从每幕随机抽一项回答前后关系；第二天不看材料完成整篇复述。记录漏项、错序、跨幕插入和无法解释的动作。对遗漏项目只补强对应幕，不重写整个故事。最后检查故事是否仍保持原词顺序，避免为了情节方便擅自调换。',
        note: '故事服务原顺序，不替代原顺序。',
        objective: '能独立完成十二项三幕故事，并用逐幕复述和 24 小时测试修正遗漏。',
        practice: '提交三幕故事、正序逐项核对、随机位置问答和 24 小时复述记录。',
        checkpoint: '检查项目完整、顺序正确、幕间清楚、随机可取，遗漏是否定位到具体动作。',
      },
      {
        title: '独立迁移与评价｜让故事服从学科事实',
        body:
          '选择八个真实学科步骤或历史事件节点，先写原始定义和证据，再编入受事实约束的故事。人物可以做行动者，但不能改变时间、条件和因果。24 小时后完成顺序复述、随机解释和一道新例判断题。评价四项：事实准确、项目齐全、顺序稳定、迁移可用。最后写下一个不适合故事法的内容，例如需要同时比较多个抽象模型的理论。故事能降低序列负荷，却不能替代定义、证据和推理。',
        note: '学科故事先准确，再易记。',
        objective: '能把故事法迁移到受事实约束的学科材料，并用延迟迁移检验方法边界。',
        practice: '提交八节点故事、定义对照表、24 小时复述、新例判断和一条不适用场景。',
        checkpoint: '四项自评：事实准确、节点完整、顺序稳定、迁移有效；事实错误必须优先修正。',
      },
    ],
    quiz: [
      question(
        '故事法帮助序列回忆的关键是什么？',
        '人物、动作、地点和因果关系把项目组织成连续可提取的事件网络',
        ['故事越长越不需要项目', '只要人物夸张就能自动掌握', '把所有词写成同义词'],
        0,
        '故事通过关系串联项目并提供顺序线索。项目仍必须完整、准确并可随机定位，单纯夸张情节不是有效性的保证，也无法替代反馈。',
        '事实与定义',
      ),
      question(
        '故事复述很流畅，但随机问第 8 个词时总从前一幕重讲，说明了什么？',
        '提取依赖故事连续推进，幕内节点尚未形成独立入口',
        ['故事法对所有材料永远无效', '第 8 个词一定没有出现', '只需把故事写得更长'],
        1,
        '连续复述可能掩盖定位困难。应检查该幕地点、动作和目标词的联系，并增加从中间节点开始的提取练习，而不是继续加长情节。',
        '材料与推导',
      ),
      question(
        '把故事法用于历史事件时，哪种做法最危险？',
        '为了情节刺激改变事件时间或因果关系，却不做原文核对',
        ['保留真实年代与参与者', '用动作连接已有事实节点', '完成 24 小时复述与解释'],
        2,
        '记忆术不能牺牲事实准确性。历史故事可以虚构场景细节帮助连接，但不能改动关键时间、行动与因果，完成后仍要对照原始材料。',
        '常见误区',
      ),
      question(
        '迁移到生物过程学习时，哪种评价最完整？',
        '按顺序复述步骤，随机解释某一步作用，并用新情境判断因果',
        ['只看故事是否有戏剧性', '只记人物姓名不记过程', '只在原图上描出情节'],
        0,
        '生物过程需要顺序、条件与因果。随机解释和新情境判断能检查故事是否支持真实知识，而非只帮助顺口复述或记住人物装饰。',
        '迁移应用',
      ),
    ],
  },
};
