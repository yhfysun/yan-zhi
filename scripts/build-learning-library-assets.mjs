import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const { JSDOM } = createRequire(path.join(ROOT, 'packages/ui/package.json'))('jsdom');
const OUT_DIR = path.join(ROOT, 'packages/ui/src/assets/learning-library');
const GUTENBERG_MIRROR = 'https://gutenberg.pglaf.org/cache/epub';
const FORCE = process.argv.includes('--force');

const chineseBooks = [
  {
    assetKey: 'three-kingdoms',
    dir: '三国演义',
    title: '三国演义',
    author: '罗贯中',
    descriptions: ['东汉末年的政治、战争与人物选择。', '群雄争霸中的组织、联盟与战略。'],
  },
  {
    assetKey: 'water-margin',
    dir: '水浒传',
    title: '水浒传',
    author: '施耐庵、罗贯中（传）',
    descriptions: ['江湖秩序、人物群像与官民关系。', '从个人遭际看到制度压力。'],
  },
  {
    assetKey: 'journey-west',
    dir: '西游记',
    title: '西游记',
    author: '吴承恩（传）',
    descriptions: ['神魔旅途中的欲望、规则与成长。', '章回叙事和宗教词汇的入门读本。'],
  },
  {
    assetKey: 'red-chamber',
    dir: '红楼梦',
    title: '红楼梦',
    author: '曹雪芹、高鹗（通行本）',
    descriptions: ['家族兴衰、人物关系与诗词世界。', '从日常细节理解复杂社会结构。'],
  },
  {
    assetKey: 'liaozhai',
    dir: '聊斋志异',
    title: '聊斋志异',
    author: '蒲松龄',
    descriptions: ['短篇志怪中的社会批评与叙事实验。', '狐鬼故事背后的现实关怀。'],
  },
  {
    assetKey: 'yushi-mingyan',
    dir: '喻世明言',
    title: '喻世明言',
    author: '冯梦龙 编',
    descriptions: ['市井生活、人情与明代白话叙事。', '短篇话本如何讲出一个时代。'],
  },
  {
    assetKey: 'jingshi-tongyan',
    dir: '警世通言',
    title: '警世通言',
    author: '冯梦龙 编',
    descriptions: ['司法、商旅、婚姻与城市生活。', '从故事冲突理解社会规则。'],
  },
  {
    assetKey: 'xingshi-hengyan',
    dir: '醒世恒言',
    title: '醒世恒言',
    author: '冯梦龙 编',
    descriptions: ['明代社会的财富、家庭与身份流动。', '白话短篇中的人物选择与代价。'],
  },
  {
    assetKey: 'chuke-paian-jingqi',
    dir: '初刻拍案惊奇',
    title: '初刻拍案惊奇',
    author: '凌濛初',
    descriptions: ['奇案、商旅与晚明社会想象。', '拟话本如何组织悬念和道德判断。'],
  },
  {
    assetKey: 'erke-paian-jingqi',
    dir: '二刻拍案惊奇',
    title: '二刻拍案惊奇',
    author: '凌濛初',
    descriptions: ['与“初刻”对读题材和叙事套路。', '从故事看晚明城市与商业。'],
  },
];

const englishBooks = [
  { assetKey: 'great-gatsby', gutenbergId: 64317, title: 'The Great Gatsby', author: 'F. Scott Fitzgerald' },
  { assetKey: 'pride-prejudice', gutenbergId: 1342, title: 'Pride and Prejudice', author: 'Jane Austen' },
  { assetKey: 'alice-wonderland', gutenbergId: 11, title: "Alice's Adventures in Wonderland", author: 'Lewis Carroll' },
  { assetKey: 'tom-sawyer', gutenbergId: 74, title: 'The Adventures of Tom Sawyer', author: 'Mark Twain' },
  { assetKey: 'secret-garden', gutenbergId: 17396, title: 'The Secret Garden', author: 'Frances Hodgson Burnett' },
  { assetKey: 'treasure-island', gutenbergId: 120, title: 'Treasure Island', author: 'Robert Louis Stevenson' },
  { assetKey: 'christmas-carol', gutenbergId: 46, title: 'A Christmas Carol', author: 'Charles Dickens' },
  { assetKey: 'frankenstein', gutenbergId: 84, title: 'Frankenstein', author: 'Mary Shelley' },
  { assetKey: 'little-women', gutenbergId: 514, title: 'Little Women', author: 'Louisa May Alcott' },
  { assetKey: 'wizard-oz', gutenbergId: 55, title: 'The Wonderful Wizard of Oz', author: 'L. Frank Baum' },
  { assetKey: 'call-of-wild', gutenbergId: 215, title: 'The Call of the Wild', author: 'Jack London' },
  { assetKey: 'time-machine', gutenbergId: 35, title: 'The Time Machine', author: 'H. G. Wells' },
];

const authoredBooks = [
  {
    assetKey: 'everyday-science',
    title: '万物为什么：生活里的科学原理',
    author: '言智学习编辑部',
    language: 'zh-Hans',
    chapters: [
      ['彩虹为什么是弯的', ['阳光进入水滴后会发生折射，不同颜色的光偏折角度略有不同，于是被分开。观察者只能看到与自己视线成特定角度的那一部分光，因此彩虹呈现圆弧。']],
      ['桥梁为什么不会被自己的重量压垮', ['桥梁把荷载分成压力、拉力和剪力。拱桥把竖直荷载转为沿拱圈传递的压力，悬索桥把桥面重量交给主缆，再由主缆传给桥塔和锚碇。']],
      ['声音为什么能在墙后听见', ['声音是介质中的机械振动。墙体并非完全封闭，振动会带动墙体或空气继续传播。频率较低的声音更容易绕过障碍或穿透结构。']],
      ['冰箱为什么摸起来发热', ['冰箱并没有“制造冷”，而是把热量从内部搬到外部。压缩机、冷凝器和蒸发器组成热泵循环，背部和侧面的热量正是被搬出来的热。']],
      ['芯片为什么越小越难做', ['晶体管越小，同样的距离内可容纳更多器件，但也越容易受漏电、发热和制造误差影响。先进制程依赖极紫外光刻、精密材料和极严格的洁净环境。']],
      ['星星为什么会闪烁', ['星光穿过地球大气时会被不断变化的空气密度折射，亮度和方向出现快速扰动。行星视面积更大，扰动被平均，看起来通常更稳定。']],
      ['飞机为什么能飞起来', ['机翼让气流产生速度差和压力差，同时把大量空气向下偏转。升力来自空气对机翼的反作用，精确解释需要同时考虑压力分布、黏性与动量。']],
      ['电池为什么会有容量衰减', ['充放电过程中，电极材料会膨胀收缩，副反应还会消耗活性锂并形成钝化层。循环、温度和倍率都会改变衰减速度。']],
      ['地图为什么会失真', ['地球表面无法在不拉伸或压缩的情况下完整铺平。等角投影保方向但改面积，等面积投影保面积但改形状，选择投影取决于要解决的问题。']],
      ['概率为什么会反直觉', ['人的直觉常把“看起来像随机”误当成随机。生日悖论、独立事件和条件概率提醒我们：要用样本空间和条件重新计算，而不是凭故事感判断。']],
    ],
  },
  {
    assetKey: 'trivia-firsts',
    title: '世界“最”与“第一次”',
    author: '言智学习编辑部',
    language: 'zh-Hans',
    chapters: [
      ['第一封电子邮件留下了什么', ['早期网络邮件系统彼此并不互通。今天常用电子邮件的“@ 用户名”格式，来自雷·汤姆林森在 1971 年左右的系统设计。']],
      ['第一张照片如何留住光线', ['早期摄影把感光材料放进暗箱。曝光后还要用化学药品显影和定影，照片不是即时打印，而是光的化学记录。']],
      ['第一次环球航行改变了什么', ['麦哲伦船队出发后损失多艘船和大量船员，但完成环球航行证明海洋相连，也让地图、贸易和帝国竞争进入新阶段。']],
      ['最早的地图未必指向北方', ['许多古代地图以宗教中心、宫殿、河流或日出方向为上方。方位是文化选择，不是地图天然属性。']],
      ['最深的洞穴不是一条竖井', ['洞穴系统由多段竖井、廊道和水道组成。深度纪录来自连续测量和完整测绘，单个垂直落差不能代表整个洞穴。']],
      ['最大的动物吃什么', ['蓝鲸体型巨大，却主要捕食小型磷虾。食物链层级不等于体型大小，海洋生产力和滤食效率决定了这种组合。']],
      ['最快的短距离动物', ['猎豹在短距离冲刺中极具优势，但持续追猎会迅速体温升高。自然界的速度纪录必须同时说明距离、路面和测量方式。']],
      ['第一台通用电子计算机的重量', ['ENIAC 使用大量真空管，耗电和占地都很大。它与今天芯片的差别不仅是尺寸，还包括可靠性、存储和编程方式。']],
      ['最早的城市为何靠近河流', ['河流提供饮水、运输、灌溉和废物带走能力，同时也会带来洪水。城市兴衰常常取决于治水能力和粮食剩余。']],
      ['“最亮星”其实取决于你看哪颗', ['夜空中的视亮度受恒星真实发光、距离和消光影响。太阳当然最亮，但若限定夜间肉眼恒星，答案又会随星等口径变化。']],
    ],
  },
  {
    assetKey: 'visual-encyclopedia',
    title: '看见世界：图文百科',
    author: '言智学习编辑部',
    language: 'zh-Hans',
    chapters: [
      ['一张地图能读出几层信息', ['看地图先读比例尺、方向和图例，再看地形、边界、交通与聚落。制图者选择哪些信息，也就在规定读者能看见什么。']],
      ['建筑如何告诉你社会结构', ['门、轴线、庭院、公共空间和材料都传递权力与生活方式。建筑不是背景，而是制度在空间中的物质化。']],
      ['器物上的技术路线', ['陶器、青铜、铁器、瓷器与芯片看似相隔遥远，却都在处理材料、能量、精度和标准化的问题。']],
      ['图像不是现实的复印件', ['构图、裁切、光线和拍摄时机都会改变图像意义。理解图像要追问谁拍摄、给谁看、排除了什么。']],
      ['博物馆为什么把东西放在一起', ['展陈通过路线、灯光、标签和组合建立因果。一次展览就是一套解释，观众应同时看展品和它的组织方式。']],
      ['从地图看气候变化', ['温度、降水、冰盖和海平面是不同变量。单张地图只能表达一个时间切片，趋势需要多时相数据与统计检验。']],
      ['城市里的自然网络', ['公园、屋顶、河道和行道树形成生态廊道。连通性越好，动物、花粉和水流越容易移动，城市韧性也越高。']],
      ['语言如何塑造分类', ['不同语言对颜色、亲属、方向和自然的切分并不完全相同。分类既帮助认知，也会让某些差异变得不显眼。']],
      ['数字图表的第一眼陷阱', ['纵轴截断、面积夸张、颜色对比和样本选择都能让图表“说真话但给出错误印象”。先读坐标、单位和样本。']],
      ['知识网络如何建立', ['把人物、地点、概念、证据和时间连接起来，会暴露单一章节看不到的关系。好的学习笔记不是摘抄，而是画出联系。']],
    ],
  },
];

function stripHeaderFooter(text) {
  const start = text.search(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  const end = text.search(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  return text.slice(start >= 0 ? text.indexOf('\n', start) + 1 : 0, end >= 0 ? end : text.length);
}

function cleanParagraph(value) {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
}

function chineseNumber(value) {
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units = { 十: 10, 百: 100, 千: 1000 };
  let total = 0;
  let current = 0;
  for (const char of value) {
    if (char in digits) current = digits[char];
    else if (char in units) {
      total += (current || 1) * units[char];
      current = 0;
    }
  }
  return total + current;
}

function chapterOrder(value) {
  const arabic = value.match(/(\d+)/);
  if (arabic) return Number(arabic[1]);
  const chinese = value.match(/第([零〇一二两三四五六七八九十百千]+)[回章节篇]/);
  return chinese ? chineseNumber(chinese[1]) : Number.MAX_SAFE_INTEGER;
}

async function latestChineseSource() {
  const entries = await fs.readdir(os.tmpdir(), { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('china-literary-'))
    .map((entry) => path.join(os.tmpdir(), entry.name));
  const stats = await Promise.all(candidates.map(async (dir) => ({ dir, stat: await fs.stat(dir) })));
  return stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0]?.dir;
}

async function loadChineseBook(sourceDir, config) {
  const bookDir = path.join(sourceDir, config.dir);
  let chapterFiles = [];
  try {
    const dirs = await fs.readdir(bookDir, { withFileTypes: true });
    const textDir = dirs.find((entry) => entry.isDirectory() && entry.name.includes('原文'))?.name;
    if (!textDir) throw new Error(`没有找到原文目录: ${bookDir}`);
    const chapterDir = path.join(bookDir, textDir);
    chapterFiles = (await fs.readdir(chapterDir))
      .filter((name) => name.endsWith('.html'))
      .sort((a, b) => chapterOrder(a) - chapterOrder(b))
      .map((name) => ({ name, file: path.join(chapterDir, name), url: '' }));
  } catch {
    const listed = execFileSync('git', [
      '-C', sourceDir, 'ls-tree', '-r', '--name-only', 'HEAD', '--', config.dir,
    ], { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter((name) => name.endsWith('.html') && name.includes('/原文'));
    chapterFiles = listed
      .sort((a, b) => chapterOrder(a) - chapterOrder(b))
      .map((name) => {
        const segments = name.split('/');
        const encoded = segments.map((segment) => encodeURIComponent(segment)).join('/');
        return {
          name: segments.at(-1),
          file: '',
          url: `https://raw.githubusercontent.com/hunterhug/china-literary/master/${encoded}`,
        };
      });
  }
  const chapters = [];
  for (const item of chapterFiles) {
    const html = item.url
      ? await (async () => {
        const response = await fetch(item.url);
        if (!response.ok) throw new Error(`下载章节失败 ${response.status}: ${item.url}`);
        return response.text();
      })()
      : await fs.readFile(item.file, 'utf8');
    const dom = new JSDOM(html);
    const title = item.name.replace(/-原文\.html$/, '');
    const paragraphs = [...dom.window.document.querySelectorAll('p')]
      .filter((node) => !node.querySelector('a'))
      .map((node) => cleanParagraph(node.textContent || ''))
      .filter((text) => text && text !== title && !/^(首页|目录|上一节|下一节)/.test(text))
      .filter((text) => !/©\s*20\d{2}-|阿星星\s*·|版权所有/.test(text))
      .filter((text, index, all) => all.indexOf(text) === index);
    if (paragraphs.length) chapters.push({ title, paragraphs });
    dom.window.close();
  }
  return {
    id: config.assetKey,
    title: config.title,
    author: config.author,
    language: 'zh-Hans',
    source: 'hunterhug/china-literary（公版原著转录）',
    license: '原著公版；仅保留公版正文，不包含现代校注和译注',
    chapterCount: chapters.length,
    editions: {
      original: '通行原文（应用内简体校读）',
      simplified: '简体校读',
    },
    descriptions: config.descriptions,
    chapters,
  };
}

function splitEnglishChapters(text, fallbackTitle) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const marker = /(?:^|\n)\s*(CHAPTER\s+(?:[IVXLCDM]+|\d+)|Chapter\s+\d+)[^\n]*\n/gi;
  const matches = [...normalized.matchAll(marker)];
  if (matches.length >= 2) {
    return matches.map((match, index) => {
      const start = (match.index || 0) + match[0].length;
      const end = matches[index + 1]?.index ?? normalized.length;
      const paragraphs = normalized.slice(start, end).split(/\n\s*\n+/).map(cleanParagraph).filter(Boolean);
      return { title: match[1].trim(), paragraphs };
    }).filter((chapter) => chapter.paragraphs.length);
  }
  const paragraphs = normalized.split(/\n\s*\n+/).map(cleanParagraph).filter((item) => item.length > 30);
  const size = Math.max(12, Math.ceil(paragraphs.length / 9));
  return Array.from({ length: Math.ceil(paragraphs.length / size) }, (_, index) => ({
    title: `${fallbackTitle} · Part ${index + 1}`,
    paragraphs: paragraphs.slice(index * size, (index + 1) * size),
  }));
}

async function loadEnglishBook(config) {
  const url = `${GUTENBERG_MIRROR}/${config.gutenbergId}/pg${config.gutenbergId}.txt`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载失败 ${response.status}: ${url}`);
  const raw = await response.text();
  const chapters = splitEnglishChapters(stripHeaderFooter(raw), config.title);
  return {
    id: config.assetKey,
    title: config.title,
    author: config.author,
    language: 'en',
    source: `Project Gutenberg eBook #${config.gutenbergId}`,
    license: 'Public domain in the United States; verify local copyright rules',
    chapterCount: chapters.length,
    editions: {
      original: 'English public-domain text',
    },
    chapters,
  };
}

async function writeBook(book) {
  const output = path.join(OUT_DIR, `${book.id}.json`);
  if (!FORCE) {
    try {
      await fs.access(output);
      console.log(`[library] ${book.id}: 已存在，跳过（--force 可重建）`);
      return;
    } catch { /* missing: build it */ }
  }
  await fs.writeFile(output, `${JSON.stringify(book)}\n`, 'utf8');
  const bytes = (await fs.stat(output)).size;
  console.log(`[library] ${book.id}: ${book.chapterCount} chapters, ${(bytes / 1024).toFixed(1)} KiB`);
}

async function hasBook(assetKey) {
  if (FORCE) return false;
  try {
    await fs.access(path.join(OUT_DIR, `${assetKey}.json`));
    console.log(`[library] ${assetKey}: 已存在，跳过（--force 可重建）`);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const sourceDir = await latestChineseSource();
  if (!sourceDir) throw new Error('缺少中文公版正文源目录；请先克隆 hunterhug/china-literary 到系统临时目录');

  for (const config of chineseBooks) {
    if (!(await hasBook(config.assetKey))) await writeBook(await loadChineseBook(sourceDir, config));
  }
  for (const config of englishBooks) {
    if (!(await hasBook(config.assetKey))) await writeBook(await loadEnglishBook(config));
  }
  for (const book of authoredBooks) {
    if (await hasBook(book.assetKey)) continue;
    await writeBook({
      ...book,
      id: book.assetKey,
      source: '言智学习编辑部原创',
      license: '应用原创内容',
      chapterCount: book.chapters.length,
      editions: { original: '简体中文原创读本', simplified: '简体中文' },
      chapters: book.chapters.map(([title, paragraphs]) => ({ title, paragraphs })),
    });
  }

  const keys = [
    ...chineseBooks.map((book) => book.assetKey),
    ...englishBooks.map((book) => book.assetKey),
    ...authoredBooks.map((book) => book.assetKey),
  ];
  const lines = [
    '// AUTO-GENERATED by scripts/build-learning-library-assets.mjs',
    'export type BuiltinBookAsset = {',
    '  id: string;',
    '  title: string;',
    '  author: string;',
    '  language: string;',
    '  source: string;',
    '  license: string;',
    '  chapterCount: number;',
    '  editions?: Record<string, string>;',
    '  chapters: Array<{ title: string; paragraphs: string[] }>;',
    '};',
    '',
    'export const BUILTIN_BOOK_LOADERS: Record<string, () => Promise<{ default: BuiltinBookAsset }>> = {',
    ...keys.map((key) => `  ${JSON.stringify(key)}: () => import(${JSON.stringify(`./${key}.json`.replaceAll('\\', '/'))}),`),
    '};',
    '',
  ];
  await fs.writeFile(path.join(OUT_DIR, 'book-assets.generated.ts'), lines.join('\n'), 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
