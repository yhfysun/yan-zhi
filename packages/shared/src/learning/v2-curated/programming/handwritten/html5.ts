// HTML5 独立语言课程 · 手写教案
// courseName 必须与 programs.ts 中 html5 课包的 exact lesson.courseName 一致。
import type { ProgrammingCourseSeed } from '../shared.js';
import type { LearningV2LessonExample } from '../../../v2-types.js';

const track = 'P14 · 独立语言课程' as const;

const h0Name = (topic: string) => `HTML5 · 浏览器、文档与开发工具：${topic}`;

type HtmlStageExamples = readonly (readonly LearningV2LessonExample[])[];

function withHtmlExamples(
  courses: readonly ProgrammingCourseSeed[],
  stageExamples: HtmlStageExamples,
): readonly ProgrammingCourseSeed[] {
  if (stageExamples.length !== courses.length) {
    throw new Error(`HTML5 example course count: ${stageExamples.length} != ${courses.length}`);
  }
  return courses.map((course, courseIndex) => {
    const examples = stageExamples[courseIndex]!;
    if (examples.length !== course.steps.length) {
      throw new Error(`${course.name} example count must match its step count`);
    }
    return {
      ...course,
      steps: course.steps.map(([title, body, note], stepIndex) => (
        [title, body, note, examples[stepIndex]!] as const
      )),
    };
  });
}

const htmlExample = (
  title: string,
  language: string,
  code: string,
  output: string,
): LearningV2LessonExample => ({ title, language, code, output });

const HANDWRITTEN_HTML5_H0_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: h0Name('浏览器如何请求和解析 HTML'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能在终端打开本地目录，并知道网址、服务器和浏览器不是同一个程序。',
    goal: '能从输入 URL 讲到 DOM 构建，区分网络响应、解码、分词和建树四个阶段，并能用响应头与 DevTools 定位页面为何没有按 HTML 渲染。',
    guidedPractice: '启动一个本地静态服务器，在 Network 面板勾选 Preserve log 后打开首页；记录请求状态、Content-Type、响应字节数和 DOMContentLoaded 时间，再故意改成 application/octet-stream 对比浏览器下载文件而不是渲染页面的行为。',
    independentPractice: '为一个含中文、外链样式和脚本的页面写请求链路记录：分别用 curl -I 与 DevTools Network 核对响应头，在 Elements 面板确认 title 和正文节点，再删除 charset 声明观察乱码与 document.characterSet 的变化。',
    commonErrors: [
      '把 HTML 源码、HTTP 响应体和浏览器中的 DOM 混为同一份内容，忽略脚本会修改文档树。',
      '只在页面里写 meta charset，却让服务器返回错误的 Content-Type 或缺失字符集，导致解码先于 meta 发生。',
    ],
    sourceRefs: [
      'WHATWG HTML Living Standard: Parsing HTML documents. https://html.spec.whatwg.org/multipage/parsing.html',
      'MDN: How browsers work. https://developer.mozilla.org/en-US/docs/Web/Performance/How_browsers_work',
    ],
    steps: [
      [
        '从 URL 到响应字节',
        '浏览器先解析 URL 的 scheme、host、port、path 和 query，再查缓存并经过 DNS、TCP、TLS 与 HTTP 请求取得响应。决定内容能否成为文档的是状态行和 Content-Type，例如 200 加 text/html 才会进入 HTML 解析；404 仍可能返回可渲染的错误页，application/octet-stream 则通常触发下载。失败边界包括重定向后路径丢失、缓存返回旧实体或无权限却伪装成 200；验证动作是在 DevTools Network 查看 status、request URL、Content-Type 与 response size，并用 curl -I 对照服务器原始响应头。',
        '先区分响应成功与内容类型正确',
      ],
      [
        '解码、分词与建树',
        'HTML 字节先按传输编码和字符集规则解码成字符流，再由 tokenizer 产生 doctype、开始标签、属性和文本 token，tree builder 依据插入模式把它们装进 Document 节点树。解析器会修复缺失闭合标签、表格内意外节点等错误，所以浏览器展示的 DOM 可能比源码更规整。失败边界是响应头声明 GBK 而文件实际为 UTF-8，或脚本拼接了未转义的尖括号；验证动作是检查 document.characterSet、Elements 中的修正后结构，并用 textContent 核对文本是否不是 HTML 实体原文。',
        '解析器会修复输入但不会修复错误含义',
      ],
      [
        '预扫描、DOM 与渲染协作',
        '主解析器遇到同步 script 会暂停建树并执行脚本，脚本可读写已经出现的 DOM；现代浏览器还用预加载扫描器提前发现图片、样式和脚本 URL，但执行顺序仍受 HTML 规则约束。DOM 完成后还要组合 CSSOM 并计算布局与绘制，因此节点存在不等于像素已经稳定。失败边界是脚本查询了尚未出现的元素，或在 head 中同步加载远程脚本拖住首屏；验证动作是在 Elements 查看节点、在 Performance 面板核对解析与绘制时间，并把脚本加上 defer 或 type=module 后比较 DOMContentLoaded 和网络瀑布。',
        '节点出现、执行与绘制是不同时间点',
      ],
      [
        '异常文档的可见症状',
        '截断响应、错误的嵌套表格和重复 body 常被解析器容错，页面看似能开却形成意料之外的父子关系；错误 MIME、压缩头不匹配和非法字节序列则可能在解码或渲染前失败。不要只凭地址栏没有报错判断正常。失败边界包括开发服务器自动注入 HTML、代理改写 Content-Encoding，以及 view-source 与 Elements 不一致；验证动作是保留原始响应、查看 Console 与 Network 的 failed 请求，逐层比较 curl 原始字节、view-source 和实时 DOM，并记录每一步的首个差异。',
        '容错成功不等于文档语义正确',
      ],
      [
        '形成可重复的解析检查',
        '检查顺序固定为：请求是否命中正确 URL，状态与 Content-Type 是否合理，字符集是否在文档前段确定，关键节点是否进入预期父节点，脚本是否改变结构。把 curl -I、document.title、document.characterSet 和 Elements 截图放进同一次实验记录。失败边界是只看缓存后的页面、用 file 协议替代服务器，或把浏览器翻译后的 DOM 当成原始输出；验证动作是在禁用缓存的新会话重载，并用 `npx html-validate index.html` 捕获静态结构错误后再复测页面。',
        '同一轮检查必须保留请求与 DOM 证据',
      ],
    ],
  },
  {
    name: h0Name('DOCTYPE、head、body 与文档树'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '已能辨认 HTML 开始标签、结束标签和属性，知道浏览器开发者工具可以查看页面结构。',
    goal: '理解 doctype 如何选择渲染模式，掌握 head 中元数据的职责与 body 的文档内容边界，并能从文档树验证浏览器实际采用的解析结果。',
    guidedPractice: '编写两个只差 `<!doctype html>` 的实验页，在 Console 执行 document.compatMode，再读取 document.doctype、document.head 与 document.body；随后在 head 放入 title、meta charset、meta viewport 和 link，在 Elements 面板标出每个节点所属区域。',
    independentPractice: '从空文件写出标准 HTML 骨架，加入中文标题、描述、应用样式和脚本；用 html-validate 检查 head 与 body 的非法子元素，再删除 doctype、打乱元素顺序分别重跑，记录浏览器修复后的树结构与验证器报告差异。',
    commonErrors: [
      '省略 doctype 或把它放在注释之后，导致浏览器进入 quirks mode 并改变布局计算。',
      '把可见标题、段落或大段脚本塞进 head，依赖浏览器把它们移到 body，忽略源码可维护性。',
    ],
    sourceRefs: [
      'WHATWG HTML Living Standard: The document element. https://html.spec.whatwg.org/multipage/semantics.html#the-html-element',
      'MDN: Document head. https://developer.mozilla.org/en-US/docs/Web/HTML/Element/head',
    ],
    steps: [
      [
        'doctype 决定渲染模式',
        '`<!doctype html>` 本身不是普通元素内容，而是让解析器采用 standards mode 的声明。缺少或写错 doctype 可能进入 quirks mode，某些盒模型、行高和表格尺寸计算会走兼容路径。document.compatMode 可返回 CSS1Compat 或 BackCompat，doctype 节点则可通过 document.doctype 检查。失败边界是 doctype 前出现非空文本、服务端模板重复拼接或在 XML 声明后放错位置；验证动作是在原始源码第一屏核对声明，并在 Console 同时输出 compatMode、document.doctype.name 和实际首条响应字节。',
        '渲染模式必须从文档首段确定',
      ],
      [
        'head 负责机器元数据',
        'head 放置 title、meta charset、meta name=description、meta name=viewport、link 和允许的脚本资源声明，这些内容通常不直接形成正文版式。字符集声明应尽早出现，title 为标签页与搜索结果提供默认名称；link rel=stylesheet 建立样式资源关系，base 则改变相对 URL 解析基准。失败边界是多个 title、重复 charset、把 description 当排名保证，或 base 放在依赖相对地址的节点之后；验证动作是检查 document.title、document.characterSet 和 document.baseURI，并在 Network 确认样式请求实际 URL。',
        'head 决定文档身份与资源关系',
      ],
      [
        'body 承载可见文档流',
        '浏览器会自动补出 html、head 和 body，即使源码只有一段文字；可见流式内容和大部分区块语义节点应位于 body。表格、列表和 phrasing content 的允许父节点随后仍有规则，自动修复可能把非法元素搬到表格外。失败边界是依赖自动纠正导致脚本选择器找不到预期父节点，或在 body 结束标签后继续追加有效内容；验证动作是在 Elements 查看真实父子关系，用 querySelector 与 closest 断言层级，而不是只检查格式化后的源码缩进。',
        '源码层级和解析后树都要核对',
      ],
      [
        'viewport 改变移动布局上下文',
        '`meta name="viewport" content="width=device-width, initial-scale=1"` 让移动浏览器的布局视口接近设备宽度；不写或使用固定宽度的 viewport，页面可能先在较宽虚拟画布排版再整体缩小。user-scalable=no 会阻止用户放大，与可访问性目标冲突。失败边界是把 initial-scale 固定成 0.5 以掩盖溢出、横屏后尺寸不变，或只测试桌面窄窗口忽略真实移动 WebView；验证动作是在 DevTools 设备仿真读取 innerWidth、visualViewport.width 与布局断点，并在横竖屏切换后检查是否存在横向滚动。',
        'viewport 控制布局视口而非真实设备像素',
      ],
      [
        '用树与验证器双向验收',
        '完成后同时检查作者源码和浏览器树：源码应只有一个 html 根、完整 head 与 body，关键元数据顺序明确；浏览器中则应出现相同的根节点和预期父子关系。静态验证器擅长发现重复 id、非法嵌套与缺失必需属性，但不能证明页面语义或交互正确。失败边界是验证器零错误却存在错误的 tab 顺序，或页面能看但 head 中有重复资源；验证动作是运行 `npx html-validate index.html`，再执行 `document.documentElement.outerHTML.slice(0, 200)` 与 Elements 对照，并记录两边的唯一差异。',
        '静态通过后仍要检查运行中的树',
      ],
    ],
  },
  {
    name: h0Name('标题层级、段落、链接与图片'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '已完成标准 HTML 文档骨架，能在 DevTools 中选中元素并查看属性和计算尺寸。',
    goal: '能用标题、段落、链接和图片表达清晰的信息层级，区分可访问名称与视觉文本，并为图片加载、链接目标和键盘使用建立验证方法。',
    guidedPractice: '制作一个产品介绍区：一个 h1、两个 h2、若干 p、一个指向详情页的 a 和一个带 width、height、alt 的 img；在 Elements 与 Accessibility 面板读取标题角色、链接名称和图片替代文本，再断网刷新观察图片失败时页面是否仍可理解。',
    independentPractice: '把一段只用样式放大文字冒充标题的富文本改为真实 h1-h3 与 p 结构，补充面包屑、正文链接和装饰图片；分别用键盘 Tab、链接列表与图片禁用模式检查，并写出修复前后的阅读顺序对照。',
    commonErrors: [
      '按字号而不是信息层级选择 h1 到 h6，造成辅助技术导航列表与页面主题不一致。',
      '链接只写“点击这里”，图片缺失 alt，或把重要文字烘焙进图片后不提供等价内容。',
    ],
    sourceRefs: [
      'WHATWG HTML Standard: Headings and sections. https://html.spec.whatwg.org/multipage/sections.html',
      'W3C WAI: Images tutorial. https://www.w3.org/WAI/tutorials/images/',
    ],
    steps: [
      [
        '标题先表达信息层级',
        'h1 到 h6 给浏览器、搜索引擎和辅助技术提供可跳转的标题层级，视觉字号由 CSS 另行决定。页面通常以一个明确 h1 描述主题，子主题使用 h2，再按嵌套使用 h3；标题文本应能脱离上下文单独说明内容。失败边界是跳级让阅读器目录断裂、用多个 h1 表示不同视觉块却无可理解的章节关系，或为了小字把 h3 当 h6；验证动作是打开 Accessibility 的 Headings 列表，按级别朗读并检查大纲能否覆盖页面主张。',
        '先确认大纲再看字号',
      ],
      [
        '段落切分阅读节奏',
        'p 表示一个段落级文本单元，源代码中的换行和连续空格会被折叠为单个空格，真正分段必须使用结束与开始标签。br 只表示同一语义段内必须换行，如地址或诗句，不应拿来制造段间距；空 p 也不会形成可访问内容。失败边界是用 br 堆出整页版式、把列表项塞在一个 p 中，或依赖零宽空格改变布局；验证动作是用 Ctrl+A 阅读纯文本、关闭 CSS 检查内容顺序，并在 DOM 中统计非空 p 的数量与文本长度。',
        '换行符与段落边界不是同一件事',
      ],
      [
        '链接说明目标与动作',
        'a 的 href 决定可导航目标，href 缺失时不会成为正常可聚焦链接；同页锚点指向存在 id 的元素，外站链接可按上下文增加 rel。链接名称应来自可见文本或受控的可访问名称，不要用空 href 加脚本假装按钮。失败边界是链接嵌套交互元素、target=_blank 缺少安全策略、锚点目标被删除后无提示；验证动作是用键盘 Tab 激活链接并在地址栏核对 URL，再使用链接列表朗读，确认每个目标脱离段落仍有意义。',
        '可访问名称必须说明去哪里',
      ],
      [
        '图片同时表达内容与尺寸',
        'img 通过 src 请求资源，alt 提供内容等价文本，width 与 height 让浏览器在下载前预留宽高比，loading 与 decoding 影响加载和呈现时机。信息图片的 alt 应描述用途，装饰图片可用空 alt，但不要同时写 title 猜谜。失败边界是响应式 CSS 改变尺寸却未保留比例、alt 取代正文重复朗读、图片 404 后没有文字兜底；验证动作是在 Network 查看图片状态与尺寸，关闭图片或断网刷新，再在 Accessibility Tree 核对 image 名称是否为空或准确。',
        '替代文本取决于图片承担的任务',
      ],
      [
        '联合验收结构与呈现',
        '标题、段落、链接和图片各自通过语法校验并不意味着组合可读；需要按屏幕阅读器与键盘用户路径重走一次页面。检查标题列表顺序、正文是否出现孤链、图片失败时替代文本是否显示、固定尺寸在窄屏是否溢出。失败边界是视觉截图正常但 Tab 顺序跳入页脚、长标题在 320px 宽度溢出，或 alt 中包含“图片”等无帮助前缀；验证动作是使用响应式模式在 320px 与桌面宽度各测一次，运行 axe 扫描，并人工记录前五个标题与前五个链接的名称。',
        '最后按真实阅读路径收口',
      ],
    ],
  },
  {
    name: h0Name('相对路径、绝对路径与站点目录'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '理解协议、主机、端口和路径组成，能在终端列出目录并启动简单静态服务器。',
    goal: '掌握浏览器依据文档 URL 解析相对地址的规则，能区分站点根路径、协议相对地址和完整 URL，并用目录结构与网络请求定位资源 404。',
    guidedPractice: '建立 `site/about/index.html`、`site/assets/logo.png` 与 `site/css/site.css`，从 about 页面分别请求 `../../assets/logo.png`、`/assets/logo.png` 和完整 https URL；在 DevTools Network 记录最终 Request URL，再用树形命令核对文件真实位置。',
    independentPractice: '把一个能在 file 协议打开但部署后图片全坏的目录改成可部署站点：统一资源目录、修正根相对路径、补齐 index.html，并通过本地 HTTP 服务器检查两层面包屑页面与 404 返回。',
    commonErrors: [
      '把 `/assets/logo.png` 当成磁盘绝对路径，忽略它其实以当前站点 origin 为根。',
      '只在 Windows 大小写不敏感目录测试，部署到区分大小写的 Linux 服务器后出现资源 404。',
    ],
    sourceRefs: [
      'WHATWG URL Standard. https://url.spec.whatwg.org/',
      'MDN: What is a URL. https://developer.mozilla.org/en-US/docs/Learn_web_development/Howto/Web_mechanics/What_is_a_URL',
    ],
    steps: [
      [
        '相对路径以文档 URL 为基准',
        '浏览器把 href、src 等属性值按所在文档的 URL 解析；`logo.png` 当前目录、`../logo.png` 上一级、`/assets/logo.png` 站点根下，而 `https://cdn.example.com/a.png` 是完整绝对 URL。带 `./` 的写法能明确表达当前目录，path 的尾斜杠也会改变相对基准。失败边界是从不同深度的页面复制同一段相对路径、模板被部署到子目录后 `/` 指向错误根；验证动作是读取 `new URL(attrValue, document.baseURI).href`，并在 Network 逐条确认最终 Request URL 与预期一致。',
        '看最终解析结果而不是只看属性值',
      ],
      [
        '目录入口与 URL 映射',
        '静态服务器通常把 `/about/` 映射到 about/index.html，把 `/about` 重定向到带斜杠目录；文档 URL 是否带尾斜杠会改变其中相对路径的下一级基准。部署平台对 index.html 的规则并不相同，有的自动扩展，有的要求显式文件。失败边界是链接写 `/about` 后服务器未重定向，页内 `images/team.png` 却按根目录求解；验证动作是用 curl -I 查看 Location，再在地址栏观察重定向后的 document.URL 与 Network 中资源路径。',
        '目录页的最终 URL 决定后续解析',
      ],
      [
        '站点目录应显式分区',
        '可维护静态站点通常按页面、styles、scripts、images 或 assets 分目录，让 URL 与文件职责稳定；共享资源使用同一套命名，页面内不散落临时副本。目录结构不是浏览器强制的语义，但会直接影响路径推理与缓存更新。失败边界是上传时漏掉隐藏文件、文件名含空格未编码、大小写在不同系统表现不一致；验证动作是运行 `tree site` 或 `Get-ChildItem -Recurse site` 生成清单，用脚本逐个检查 HTML 中 src 与 href 的目标文件存在，再在区分大小写的容器复测。',
        '目录清晰能减少路径猜测',
      ],
      [
        '协议差异会改变可用能力',
        'file 协议从本地磁盘读取文件，origin 规则、模块加载、fetch 与某些存储能力与 http 环境不同，不能作为部署验收环境。http 本地服务器让相对路径和请求日志更接近真实浏览器行为，https 还会引入证书与混合内容边界。失败边界是页面在 file 下能开便认为可部署，切换到 HTTP 后模块因 MIME 或 CORS 被拒绝；验证动作是在站点根目录运行 `python -m http.server 8000`，从 `http://localhost:8000/about/` 访问，并在 Console 与 Network 检查协议和错误来源。',
        '本地文件不能模拟完整站点环境',
      ],
      [
        '用请求结果反推路径',
        '验证路径时同时记录引用值、解析后的 URL、HTTP 状态和响应类型；404 表示目标位置不对，403 可能是目录权限，200 但类型错误则可能是服务器把文件当下载或脚本 MIME 不符。不要通过不断添加 `../` 猜测，应从 Network 复制 Request URL 后与文件清单对齐。失败边界是 CDN 返回 200 的 HTML 404 页面导致图片解码失败、代理缓存旧路径；验证动作是对每条失败资源运行 curl -I 最终 URL，检查 status、Content-Type 和正文前缀，再修正目录或服务器回退规则后清缓存重跑。',
        '状态码与内容类型一起判断',
      ],
    ],
  },
  {
    name: h0Name('DevTools、验证器与最小调试'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能打开浏览器开发者工具，知道 HTML 元素、属性、控制台和网络请求分别在哪里查看。',
    goal: '建立从页面现象到 DOM、网络、控制台、可访问树和静态验证器的证据链，能用最小实验区分 HTML 结构错误、资源请求失败和脚本运行错误。',
    guidedPractice: '教师提供一个标题缺失、图片 404、表单按钮无名称的页面；学员在 Elements 定位节点，在 Network 找失败资源，在 Console 执行选择器查询，再运行 HTML 验证器与 axe，把每条现象归到结构、请求或可访问名称类别。',
    independentPractice: '给静态页人为注入三个独立故障：重复 id、错误相对路径、未闭合的列表项；先写预期影响，再逐项用 DevTools 与 `npx html-validate` 取证，每次只修一个故障并记录哪些告警消失、哪些页面行为恢复。',
    commonErrors: [
      '只在 Elements 修改页面并误以为已修复源码，刷新后问题全部回来。',
      '看到 Console 无红字就判定 HTML 正确，忽略网络失败、可访问名称缺失和验证器结构错误。',
    ],
    sourceRefs: [
      'Chrome DevTools: Elements panel. https://developer.chrome.com/docs/devtools/elements',
      'Nu HTML Checker. https://validator.w3.org/nu/',
      'Deque axe-core. https://github.com/dequelabs/axe-core',
    ],
    steps: [
      [
        'Elements 面板查看运行中 DOM',
        'Elements 展示解析和脚本修改后的实时文档树，可展开 shadow root、查看 Computed 样式并临时编辑属性；它不直接修改磁盘文件。选中节点后可通过 Accessibility 子面板查看 role、name 与状态。失败边界是刷新后临时修改丢失、脚本渲染发生在断点前、页面有多个同名元素却只看到第一个；验证动作是同时打开 view-source 原始响应，把修复写回文件，刷新后重新查询并记录 Elements 中父子路径与源码差异。',
        '先分清临时调试与源文件修复',
      ],
      [
        'Network 负责资源与协议证据',
        'Network 面板按请求记录状态、方法、MIME、大小、耗时和 Initiator；HTML 引用错误通常表现为 404、MIME 不匹配、CORS 拦截或请求被缓存。禁用缓存并保留日志后才能观察导航前后的完整链路。失败边界是把 CDN 返回的 HTML 错误页当成功图片、只查看 All 过滤器而漏掉 Pending 请求，或缓存状态掩盖服务器变化；验证动作是逐条打开 Headers 与 Response，并用 curl -I 复核最终 URL、状态和 Content-Type。',
        '资源问题要在请求层取证',
      ],
      [
        'Console 做最小选择器实验',
        'Console 可执行 `document.querySelector`、`getElementById`、`checkValidity` 等只读检查，验证节点是否存在、属性值和表单约束状态。全局选择器依赖 id 时要注意重复 id 与动态 DOM。失败边界是把脚本异常误判为元素不存在、执行结果被上一页残留变量污染，或跨 iframe 查询不到节点；验证动作是输出 `location.href`、节点数量与 outerHTML 前缀，清空 Console 后刷新重跑，并在 Application 或 sources 中确认无旧 Service Worker 接管。',
        '选择器结果要绑定当前文档',
      ],
      [
        '验证器覆盖静态结构规则',
        'Nu HTML Checker 可检查 doctype、非法嵌套、重复 id、缺失必需属性和部分可访问性提示；本地可用 `npx html-validate index.html` 纳入脚本。验证器看到的是给定 HTML 文本，不会知道脚本运行后新增的 DOM，也不能替代人工交互测试。失败边界是模板片段单独校验产生噪声、生成文件未先构建、验证通过但运行时脚本破坏语义；验证动作是校验最终构建产物而不是源片段，保存报告，再对浏览器实时 DOM 运行 axe 并补做键盘检查。',
        '静态校验与运行检查互补',
      ],
      [
        '把最小故障修复成闭环',
        '最小调试记录应包含页面现象、复现步骤、首个错误证据、定位节点或请求、唯一修改和回归结果。每轮只改一个变量，否则无法解释修好的是结构、缓存还是时序。失败边界是同时更换模板、资源路径和脚本后只看到页面恢复，或修复后未复测相邻页面；验证动作是按清单重跑原始步骤、验证器、Network 缓存禁用检查和键盘路径，并保存修复前后截图与退出码，确认原因与修复动作一一对应。',
        '修复必须能解释且能复现',
      ],
    ],
  },
  {
    name: h0Name('第一个语义化多页面站点'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '已掌握 HTML 文档骨架、标题与链接、相对路径和基础 DevTools 检查。',
    goal: '从空目录组织一个可导航的三页静态站点，正确共享页面骨架、表达当前页状态、拆分资源目录，并完成链接、资源与移动视口的最小验收。',
    guidedPractice: '创建首页、产品页和联系页，每页使用 header、nav、main、footer，导航中的当前链接加 aria-current=page；把共享导航复制到三页后逐页检查标题和当前位置，避免用空链接模拟当前页。',
    independentPractice: '独立完成三页企业介绍站：统一 head 元数据、正确相对链接、每页唯一 h1、真实联系邮箱、带 alt 的团队图片和可访问页脚；用本地服务器逐页点击导航，并测试一个故意写错的链接能返回 404。',
    commonErrors: [
      '多页复制后只改正文不改 title、h1 和 aria-current，导致每页在搜索与辅助技术中都像首页。',
      '只在编辑器预览中点击链接，没有通过 HTTP 服务器验证目录入口、大小写和资源加载。',
    ],
    sourceRefs: [
      'MDN: HTML basics. https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Your_first_website/Creating_the_content',
      'W3C WAI: Page structure. https://www.w3.org/WAI/tutorials/page-structure/',
    ],
    steps: [
      [
        '先定义页面与 URL 清单',
        '三页站点先列出页面职责、路径、标题和主导航文字，例如 `/` 首页、`/products/` 产品、`/contact/` 联系；每个目录放 index.html，共享资源放 `/assets/`。URL 清单能提前暴露相对路径深度差异和重复标题。失败边界是文件名含空格、导航复制后路径层级错、产品详情与产品索引使用同一 URL；验证动作是画页面到文件的映射表，并用服务器访问每个最终 URL，确认状态码、title 与 h1 同时符合清单。',
        '页面结构先落到 URL 约定',
      ],
      [
        '共享骨架但保留页面差异',
        '静态 HTML 没有原生 include，三页可复制同一 header/nav/footer，或在构建阶段由模板生成；共享部分应保持标签和顺序一致，title、meta description、h1 与 main 内容必须逐页不同。失败边界是复制时带入两个 main、残留旧 title，或采用脚本注入关键导航导致无脚本环境缺失；验证动作是关闭 JavaScript 重新加载，比较三页 DOM 中的 title、main 数量和导航链接，再做一次源码 diff 确认只改变允许区域。',
        '共享结构不能共享页面身份',
      ],
      [
        '导航表达位置与地标',
        'nav 为链接组提供导航地标，多个 nav 可用 aria-label 区分；当前页链接使用 `aria-current="page"` 表达状态，而不是删除 href 或写成空锚点。header 与 footer 可提供站点级上下文，main 应包住该页唯一主要内容。失败边界是当前页不可点击导致键盘用户无法确认完整路径、导航重复多个相同名称、正文链接被误放进页脚；验证动作是按 Tab 从顶部走完全部链接，在 Accessibility 树确认 nav 与 main 名称，并检查当前位置的 aria-current 值。',
        '当前状态要可见也要可访问',
      ],
      [
        '图片与联系信息可独立理解',
        '团队图片使用项目相对路径和明确 alt，联系页提供 `mailto:` 链接且地址文本可直接读取；装饰图案放 CSS 或使用空 alt。页脚中的版权年份和时间可用 time datetime 表达机器可读值。失败边界是邮箱只藏入图片、图片 alt 与相邻说明重复，或日期只写“去年”而没有可解析时间；验证动作是禁用图片后阅读联系页，在 Accessibility Tree 检查图片名称，并通过链接列表复制邮箱到邮件客户端验证 mailto URI。',
        '关键信息不能依赖单一视觉载体',
      ],
      [
        '从本地服务器完成多页回归',
        '在站点根目录执行 `python -m http.server 8000`，依次访问三页并点击所有导航与正文链接；Network 中不得有 404，Console 不得出现影响加载的错误。接着开启移动设备视图检查 320px 下标题、导航和图片是否溢出，再访问一个不存在的 `/missing/` 记录 404 行为。失败边界是首页通过而深层页图片全 404、移动导航遮挡内容、服务器回退总返回 200；验证动作是用 curl -I 检查 404，保存每页 Network 截图和标题清单，并请另一人仅凭导航完成联系任务。',
        '三页全部可达才算站点完成',
      ],
    ],
  },
];

const h1Name = (topic: string) => `HTML5 · 语义、结构与企业页面骨架：${topic}`;

const HANDWRITTEN_HTML5_H1_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: h1Name('header、nav、main 与 footer'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '已能构建多页静态站，理解标题、链接和基本地标不是单纯用于排版的容器。',
    goal: '能用站点地标表达页面区域，掌握 header、nav、main 与 footer 的允许嵌套和可访问名称，并避免多个 main 或无名称导航造成地标混乱。',
    guidedPractice: '把一个站点页面中的顶部、菜单、正文和版权区分别改为 header、nav、main、footer；在两个 nav 上添加不同 aria-label，在 Accessibility 面板朗读地标列表，再用 Tab 验证菜单与正文链接顺序。',
    independentPractice: '为首页和文章详情页建立同一地标骨架，详情页在 article 内保留正文 header，页脚包含联系与隐私链接；故意放置两个未命名 nav，观察辅助技术地标列表的歧义后改成可区分名称。',
    commonErrors: [
      '站点已有 main 时在 article 或 section 内再放 main，导致跳至主内容地标的目标不唯一。',
      '所有导航只写相同 nav 名称，辅助技术无法区分主导航、面包屑与页脚链接组。',
    ],
    sourceRefs: [
      'WHATWG HTML Standard: Sections and headings. https://html.spec.whatwg.org/multipage/sections.html',
      'W3C WAI: Page regions. https://www.w3.org/WAI/tutorials/page-structure/regions/',
    ],
    steps: [
      [
        '地标对应稳定页面区域',
        'header 通常承载站点标识或一组导言，nav 包装主要导航链接，main 标识页面唯一主要内容，footer 提供相关元信息与辅助链接；元素名称表达职责而不是视觉位置。站点 header 与 article 内 header 可并存，但用途不同。失败边界是把整页所有内容都塞进 header、用 footer 承载主要业务正文，或在模板布局中生成两个 main；验证动作是打开 Accessibility 的地标列表，确认名称、数量与顺序，并关闭 CSS 检查 DOM 仍能按这些区域阅读。',
        '地标数量应可解释',
      ],
      [
        '导航需要可区分名称',
        '一个页面可以有多个 nav，但应通过 aria-label 或 aria-labelledby 给出“主导航”“面包屑”“页脚导航”等名称；当前页使用 aria-current=page，不应删除链接目标。导航里的列表结构可帮助用户了解链接数量，但嵌套不应为了缩进破坏读屏顺序。失败边界是名称与可见标题矛盾、两个 nav 都叫“导航”、当前项只在颜色上与其余链接区分；验证动作是在地标快捷导航中逐个跳转，朗读名称，再用键盘逐项激活并确认 aria-current 与页面 URL 对应。',
        '名称要能让多个导航不混淆',
      ],
      [
        'main 是每页唯一主线',
        'main 应围住该 URL 独有的核心内容，不应包含全站重复的页头、主导航或版权页脚；页面内文章列表可放在 main 的 section 中。浏览器和辅助技术可让用户直接跳到 main，多个 main 会破坏这个捷径。失败边界是 SPA 初始隐藏多个页面且每个都有 main、模板把 main 放在循环卡片内，或错误地在 body 外层使用 main；验证动作是执行 `document.querySelectorAll("main").length`，在每个路由状态下都应为 1，并从地标列表跳到 main 检查焦点落点。',
        '唯一主内容地标是导航捷径',
      ],
      [
        'footer 表达相关而非兜底',
        'footer 可位于页面或 article、section 内，表示最近分节内容的页脚；站点页脚常放版权、隐私和联系方式，文章 footer 可放发布日期与标签。footer 不是所有未分类内容的回收站，重要导航仍需有语义容器。失败边界是文章正文误放站点 footer、页脚链接顺序在移动布局重排后与 DOM 相反、联系信息只显示图标；验证动作是分别在桌面与 320px 宽度按 Tab 走链接，比较视觉顺序与 DOM 顺序，并在地标列表确认页脚名称及内容完整。',
        '页脚归属最近的分节上下文',
      ],
      [
        '骨架要通过结构与任务回归',
        '语义骨架完成后，既要做静态结构检查，也要从真实任务路径验证：首页可定位主体、导航可切换页面、文章页可从 header 读到 footer、移动布局没有隐藏关键链接。失败边界是验证器零错误但地标名称重复、CSS 把 main 移到视觉顶部却保留旧 DOM 顺序，或小屏菜单关闭后页面无入口；验证动作是运行 HTML 验证器与 axe，在 320px 和桌面宽度分别使用地标快捷键、Tab 和链接列表完成同一任务，并保存焦点顺序记录。',
        '结构验收要覆盖真实导航任务',
      ],
    ],
  },
  {
    name: h1Name('article、section 与 aside 的边界'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '已能正确使用 header、nav、main 和 footer，理解语义元素会影响辅助技术导航。',
    goal: '根据内容独立性与标题关系选择 article、section 或 aside，避免无语义 div 和过度分节，并能用文档大纲与内容复用判断边界。',
    guidedPractice: '取一页企业新闻，把可独立转载的新闻放进 article，用带 h2 的主题组使用 section，把相关阅读与编辑说明放 aside；删除一个 section 标题观察大纲变化，再把 article 摘要复制到列表页验证独立可理解。',
    independentPractice: '重构一个全是 div 的博客详情页：识别文章主体、评论、相关链接和作者说明，分别映射到 article、section、aside；为每个分节补标题，并把至少一条新闻放入 RSS 与搜索摘要，检查脱离原页后仍能读懂。',
    commonErrors: [
      '看到视觉分组就创建 section，却不提供标题，让辅助技术无法说明该区域是什么。',
      '把 article 只当大卡片或文章正文，忽略评论、独立新闻条目也可作为可独立分发内容。',
    ],
    sourceRefs: [
      'WHATWG HTML Standard: article, section and aside. https://html.spec.whatwg.org/multipage/sections.html#the-article-element',
      'MDN: Document and website structure. https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content/Document_and_website_structure',
    ],
    steps: [
      [
        'article 以独立分发为判断',
        'article 表示原则上可脱离页面单独发布或复用的完整内容，新闻、博客、论坛帖与评论都可能符合条件；是否独立不是由视觉边框决定。一个页面可有多个 article，嵌套 article 可用于文章评论。失败边界是把每个按钮卡片都包成 article、正文拆成多个无摘要的 article、列表页只显示截断内容却没有可追溯链接；验证动作是把该节点内容复制到独立页面或摘要接口，检查标题、作者与链接是否仍能组成完整条目。',
        '能否独立复用是核心判据',
      ],
      [
        'section 要有主题标题',
        'section 表示文档中的主题分组，通常应由 h2 到 h6 之一开始，使大纲和地标都能说明该组内容；若只是样式容器，div 更合适。section 可以嵌套表示更细主题，但过深分节会增加导航噪声。失败边界是无标题 section、为每个段落创建 section、标题放在 section 外却想描述内部；验证动作是查看 Headings 与 Landmarks 面板，逐个 section 检查首标题或 aria-labelledby，并删除纯装饰容器时确认信息关系不变。',
        '没有标题的主题组通常不是 section',
      ],
      [
        'aside 表达补充关系',
        'aside 表示与主内容相关但可独立抽取仍成立的补充信息，例如作者简介、术语说明、相关链接或广告；它不能因为是侧栏就自动成为 aside，侧栏里的主筛选也可能属于 main。失败边界是把所有侧栏内容塞入 aside 导致主导航消失、把关键安全警告放 aside、移动端把 aside 移到正文前改变阅读顺序；验证动作是在不同屏幕断点检查 DOM 顺序，使用地标列表确认 aside 名称，并询问去掉 aside 后主任务是否仍完整。',
        '位置在侧边不等于语义是 aside',
      ],
      [
        '嵌套关系决定最近标题上下文',
        '分节元素形成嵌套上下文，标题、header 和 footer 会相对最近的 article、section 或 body 解释；移动 DOM 节点可能改变“最近章节”而不是只改变外观。article 内的 section 标题不必从 h2 开始但大纲仍应连续可读。失败边界是复制评论 article 时带入页面 h1、section 标题跳级、CSS order 视觉移动 aside 但 DOM 未变；验证动作是导出大纲树，检查每个标题父分节与 DOM 顺序，并在键盘阅读时确认补充内容位于预期位置。',
        '分节上下文随 DOM 变化',
      ],
      [
        '用复用场景做边界回归',
        '语义选择完成后，把最小组件分别放入列表页、详情页和摘要输出；能够保留完整意义的结构才是可靠边界。section 的标题应能说明组内内容，aside 抽离后不该破坏主流程，article 应拥有可识别的标题和链接。失败边界是详情页正常而 RSS 单条无标题、样式删除后 article 与 section 无法区分；验证动作是关闭 CSS 进行一次线性阅读，再跑 html-validate 与 axe，记录每个 article 的标题、链接和摘要字段。',
        '离开原页面仍成立才算独立',
      ],
    ],
  },
  {
    name: h1Name('标题大纲与文档阅读顺序'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能使用 h1-h6、section 与 article，并理解 CSS 视觉顺序不一定等于 DOM 顺序。',
    goal: '建立从页面主题到章节子题的连续标题大纲，能在 CSS 重排、移动断点和辅助技术中保持正确阅读顺序，并定位跳级与标题缺失。',
    guidedPractice: '为一个企业服务页列出标题树，再在 HTML 中实现 h1、h2、h3 的层级；在 Console 用 `document.querySelectorAll("h1,h2,h3,h4,h5,h6")` 输出级别与文本，尝试用 CSS order 把引言移到底部，观察视觉与 DOM 阅读顺序不一致。',
    independentPractice: '选择一个现有长页，导出所有标题并重写为连续大纲；在桌面、320px 和关闭 CSS 三种状态各走一遍标题跳转，记录三个版本中章节名称和顺序是否一致。',
    commonErrors: [
      '为了视觉大小把 h1 换成 h4，导致标题导航把普通章节当成四级内容。',
      '使用 flex 或 grid 的 order 改变内容顺序，却没有同步调整 DOM，读屏与键盘仍按旧顺序进行。',
    ],
    sourceRefs: [
      'WHATWG HTML Standard: Heading content. https://html.spec.whatwg.org/multipage/sections.html#headings-and-sections',
      'W3C WAI: Headings. https://www.w3.org/WAI/tutorials/page-structure/headings/',
    ],
    steps: [
      [
        '先画信息层级再写标签',
        '大纲从页面唯一主题出发：h1 说明当前页提供什么，h2 是一级章节，h3 只在其下属章节出现。标题文本避免“更多信息”这类离开上下文就失去意义的表述。视觉设计可以缩小 h2，但不能因此改用 h4。失败边界是多个同级主题互相包含、只有图片作为标题内容、每个卡片都升级为 h2 导致大纲爆量；验证动作是导出标题列表并按缩进阅读，若某个标题离开前一段就不知其主语，应改写标题而不是继续加层级。',
        '标题层级先于字号选择',
      ],
      [
        '检查跳级与空标题',
        '浏览器不会阻止从 h2 跳到 h4，辅助技术也未必报错，但用户会得到不连续的结构。空标题或只有图标的标题没有可访问名称，也无法形成有用大纲。失败边界是条件渲染留下空 h2、模板把 h1 隐藏但仍在 DOM、标题内只含一个未命名链接；验证动作是运行脚本遍历标题，输出 tagName、textContent 与计算可见性，并对每个隐藏标题判断是否应从结构中移除，而不是只用 CSS display:none 藏起来。',
        '结构合法仍需内容有意义',
      ],
      [
        'DOM 顺序决定阅读主线',
        '键盘、屏幕阅读器与复制纯文本通常遵循 DOM 顺序，CSS grid-area、flex order 和绝对定位可以改变视觉位置，却不会自动改变阅读序列。响应式布局若把侧栏从右侧移到正文前，应评估 DOM 是否真的需要提前。失败边界是桌面视觉合理而移动端标题顺序颠倒、跳过链接落到视觉末尾、用负边距叠放内容导致焦点顺序混乱；验证动作是在关闭 CSS 后通读，再用键盘 Tab 与标题快捷键记录顺序，比较桌面和 320px 的截图。',
        '视觉重排不能偷偷改写阅读主线',
      ],
      [
        '标题链接保持可操作名称',
        '带锚点的标题常把图标或“链接到此”放进 a 中，若只有装饰图标，需要 aria-hidden 与可访问名称；标题本身可以包含少量链接，但不应让整个标题只剩无法朗读的图标。失败边界是 `<a href="#"><svg></svg></a>` 名称为空、同一锚点重复 id、标题链接吞掉父链接；验证动作是在 Accessibility 面板读取标题与链接名称，复制页内锚点 URL 后确认目标元素可见，并检查 document.querySelectorAll(`[id]`) 是否重复。',
        '可跳转标题也要可命名',
      ],
      [
        '跨视口完成大纲回归',
        '标题大纲验收要在桌面、移动和关闭 CSS 三种场景保持一致：每个关键章节存在、层级连续、视觉顺序没有压过 DOM 顺序。把标题文本、级别、目标 id 与截图放入同一份检查表。失败边界是只检查首屏标题、移动端折叠内容根本未渲染、旧锚点因标题改写失效；验证动作是执行自动化标题脚本与 axe，扫描所有断点，再手工从 h1 依次跳到最后一个 h3，并确认焦点和滚动落点正确。',
        '同一份主线要在所有视口成立',
      ],
    ],
  },
  {
    name: h1Name('列表、引用、代码与时间'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能使用段落、标题与 article/section，知道内容语义应与视觉样式分离。',
    goal: '为枚举、术语解释、引用、示例代码和时间选择正确元素，掌握 pre/code、blockquote/cite 与 time datetime 的边界，并避免依靠样式猜测语义。',
    guidedPractice: '制作一页技术说明：步骤用 ol、并列条件用 ul、术语表用 dl，命令行示例用 pre 包 code，正文变量用 code；再给发布日期写 time datetime，在 DevTools 与复制纯文本中比较各元素结构的差异。',
    independentPractice: '把一份混用 br、div 和引号字符的文章改写为列表、引用和时间结构；至少加入一个嵌套列表、一段多行代码和一个机器可读日期，然后用验证器与纯文本阅读检查内容没有丢失。',
    commonErrors: [
      '把所有项目都写成 ul，忽略 ol 表达的步骤顺序与 dl 表达的术语关系。',
      '只在 blockquote 中写引文却不提供来源，或给 time 的 datetime 写浏览器无法解析的文本。',
    ],
    sourceRefs: [
      'WHATWG HTML Standard: Grouping content. https://html.spec.whatwg.org/multipage/grouping-content.html',
      'MDN: The time element. https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/time',
    ],
    steps: [
      [
        '列表按关系选 ul、ol 或 dl',
        'ul 表示顺序不重要的项目集合，ol 表示步骤或排名等次序有意义，dl 由 dt 与 dd 组成术语到解释的关联；列表项始终使用 li，嵌套列表放在 li 内而不是直接塞到 ul。失败边界是用样式隐藏序号却让步骤依赖视觉编号、将键值配置硬塞进两个并列 ul、li 外层有裸文本；验证动作是去除 CSS 序号后阅读内容，在 DOM 中检查 li 父节点，并让辅助技术朗读列表项目数量与顺序。',
        '先判断项目之间是什么关系',
      ],
      [
        '引用区分块级与行内',
        'blockquote 表示从别处引来的块级内容，q 表示行内短引用，浏览器可能在 q 周围生成引号；cite 元素标记作品标题，不能自动证明来源 URL，来源链接应使用 a 指向可核查页面。失败边界是把整段原创说明包成 blockquote、用 cite 属性冒充可见来源、深层嵌套引用后读者无法判断作者；验证动作是在关闭 CSS 后确认引用边界清晰，读取链接目标，并为每段引用记录作者、作品与访问日期。',
        '引用结构要保留来源归属',
      ],
      [
        '代码用 pre 与 code 分工',
        'code 表达计算机代码片段，pre 保留空白和换行，适合多行命令或示例；行内命令只用 code，不默认套 pre。代码中的 `<`、`>` 与 `&` 必须转义，脚本示例若包含 `</script>` 还要避免提前结束脚本上下文。失败边界用 pre 排版普通段落、长代码行在移动端无限横向溢出、复制按钮只复制可见省略文本；验证动作是选中代码复制到终端或编辑器，检查空白与特殊字符完整，并在 320px 下确认可滚动区域有可访问名称且不遮住正文。',
        '保留空白与表达代码职责不同',
      ],
      [
        'time 为时间提供机器值',
        'time 元素的 datetime 属性可以写 date、time、带时区的 datetime 或 duration，可见文本可本地化但机器值应稳定；没有 datetime 时元素内容本身需符合可解析格式。失败边界是把 11/12 这类歧义日期直接当日期、时区缺失导致跨地区误解、只显示“3 天前”而没有绝对时间；验证动作是在 Console 读取 `element.dateTime` 与 `element.textContent`，用 `new Date(element.dateTime)` 检查有效性，并在页面上同时呈现足够精确的可见时间。',
        '可见表达与机器时间分开',
      ],
      [
        '组合内容接受线性阅读',
        '列表、引用和代码常混在同一教程中，最终要把它们从视觉卡片还原成连续文本：读者应知道步骤从哪开始、引文是谁说的、示例该复制哪一段。失败边界是复制按钮复制整页、代码横向滚动隐藏关键参数、日期在移动端被截断；验证动作是关闭 CSS 通读、在桌面与移动端复制每个代码块、用键盘访问横向滚动区域，并用 html-validate 检查非法嵌套后保存内容前后对照。',
        '去掉样式仍能逐步阅读',
      ],
    ],
  },
  {
    name: h1Name('企业站点的页面信息架构'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已掌握语义地标、标题大纲和多页链接，能从用户任务而非视觉稿拆解页面。',
    goal: '把企业内容组织成可预测的页面层级与导航关系，区分首页、栏目页、详情页和工具页的 URL 与标题职责，并用页面矩阵检查遗漏和重复入口。',
    guidedPractice: '为一家提供咨询、案例和招聘的企业画出页面矩阵：列出 URL、页面类型、主要任务、父栏目、标题和主 CTA；把“了解服务”和“联系顾问”拆成不同任务，再为每个页面指定面包屑与导航当前状态。',
    independentPractice: '把一张只有视觉分区的首页草图整理成至少八页的站点信息架构，建立统一命名和目录规则，并写出三个关键任务的跳转路径；用本地静态服务器验证每个路径都落到正确 title、h1 和导航状态。',
    commonErrors: [
      '以视觉区块代替用户任务，造成同一个产品既有多个名称又有多个互不关联的 URL。',
      '所有内容都塞进首页长滚动页，导航没有稳定详情页，搜索与分享无法定位具体主题。',
    ],
    sourceRefs: [
      'W3C WAI: Page structure and navigation. https://www.w3.org/WAI/tutorials/page-structure/',
      'GOV.UK: Information architecture. https://www.gov.uk/guidance/content-design',
    ],
    steps: [
      [
        '从用户任务建立页面矩阵',
        '页面矩阵至少记录任务、页面类型、URL、主标题、父级、关键链接和成功条件；同一任务只保留一个主入口，跨页面出现的名称保持一致。把“安排演示”和“查看价格”分开能避免导航文案和落地页内容错配。失败边界是页面名称在导航、title 和 h1 中三套叫法、用户必须连续点击三次才看到联系方式；验证动作是请一位不了解项目的人按矩阵执行三条任务，记录每次点击、页面标题和是否迷路。',
        '页面先服务任务再服务版式',
      ],
      [
        'URL 层级表达稳定关系',
        '企业站点可用 `/services/` 作为栏目入口，`/services/consulting/` 表示具体服务，不与 `/about/team/` 混在同一无意义编号下；URL 应简短、稳定并避免暴露实现语言。栏目名变化时可保留重定向，不要把旧链接直接删除。失败边界是同一内容有多个无法 canonical 的主路径、大小写和尾斜杠被当不同页面、营销活动临时路径长期成为主入口；验证动作是列出所有入站链接与 sitemap URL，用 curl -I 检查状态与重定向链，并确认面包屑、canonical 和 h1 指向同一主题。',
        'URL 是长期公开契约',
      ],
      [
        '导航覆盖主线但保持层级',
        '主导航只放最高频的栏目入口，二级导航展示当前栏目相关页面，面包屑说明当前页在站点中的位置；页脚可以放政策与辅助链接。移动菜单关闭后仍需保留可访问触发按钮与当前状态。失败边界是主导航包含二十个平级项、面包屑与页面层级不一致、移动端隐藏联系入口；验证动作是分别从首页和三张深层页打开导航，记录当前项、父级与返回路径，并在 320px 下使用键盘完成一次栏目内跳转。',
        '主导航负责稳定主线',
      ],
      [
        '每页拥有独立身份与目标',
        '即使共享模板，每页也要有唯一 title、meta description、h1 和主要行动入口；标题应描述用户能完成的任务或获得的内容，而不是只写公司名。内容重复页要明确差异或合并，避免搜索与导航出现多份近似答案。失败边界是十个服务页复制同一描述、详情页 h1 只有“详情”、CTA 都跳到泛化首页；验证动作是导出所有页的 title、h1 与 canonical 表格，逐页阅读首屏并检查 CTA 的 href 是否直达相应下一步。',
        '模板共享不能抹掉页面身份',
      ],
      [
        '用关键旅程验证架构',
        '架构完成时用三条真实旅程验收：新访客了解核心服务，意向客户查看案例并找到联系入口，求职者找到岗位并提交申请；每条旅程记录入口、页面数、返回方式和最终状态。失败边界是只有设计稿路径顺畅、浏览器后退回到空筛选、表单成功后没有确认页；验证动作是通过本地服务器和真实浏览器从头走一遍，保存每一步 URL、title、h1 与 Network 状态，并让另一个人只靠站点内导航复现。',
        '架构要经得起真实任务往返',
      ],
    ],
  },
  {
    name: h1Name('语义重构与回归检查'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '已能使用页面地标、article/section、标题大纲和列表，并能运行基础 HTML 验证器。',
    goal: '在不改变业务内容和关键交互的前提下，把 div 型页面重构为语义结构，并用源码 diff、可访问树、键盘路径和页面级视觉回归证明改造没有回归。',
    guidedPractice: '选择一页全 div 模板并标出候选地标、文章和列表；先建立改造前基线截图、标题清单与 Tab 顺序，再逐块替换标签，每次只改一个区域并在 DevTools 中比较 role、name 与阅读顺序。',
    independentPractice: '重构产品详情页的 header、主内容、规格列表、相关文章和页脚；保持原有链接与表单行为，补齐标题与 aside 名称，最后用 HTML 验证器、axe、键盘旅程和 320px 截图完成回归报告。',
    commonErrors: [
      '一次性重写整个模板并以截图看起来一样作为完成标准，遗漏键盘顺序与链接目标。',
      '把视觉容器机械替换成 section 或 article，却没有标题、独立内容或正确父子关系。',
    ],
    sourceRefs: [
      'W3C WAI: Page structure tutorial. https://www.w3.org/WAI/tutorials/page-structure/',
      'MDN: HTML semantics. https://developer.mozilla.org/en-US/docs/Glossary/Semantics',
    ],
    steps: [
      [
        '建立改造前的可比较基线',
        '重构前保存渲染截图、所有 title/h1-h6、地标角色、链接与按钮名称、Tab 顺序和 Network 关键请求；这些是语义改造的回归对象，而不是只看像素。CSS 或模板未变时，基线应能在固定视口复现。失败边界是页面依赖随机数据、字体未加载完成、截图尺寸不同；验证动作是固定数据与视口，等待 fonts.ready 后截图，并从 DOM 导出排序后的角色与名称清单，确认两次采集一致。',
        '先记录阅读与交互基线',
      ],
      [
        '按内容职责逐个映射元素',
        '将站点顶部映射为 header，主导航映射为 nav，独特正文映射为 main，独立内容映射为 article，有标题主题组映射为 section，辅助信息映射为 aside；纯布局和无标题视觉组保留 div。每次只替换一个区域并运行结构检查。失败边界是把样式类名当语义、把整页塞进 section、替换后丢失原有 id 或事件监听；验证动作是查看 git diff 每个标签与属性，刷新后比较 role、可访问名称以及原点击事件是否仍由同一 URL 响应。',
        '语义来自内容职责而非类名',
      ],
      [
        '补齐标题和可访问名称',
        '语义元素若没有名称，辅助技术只能报告泛化角色；section 应有标题，多个 nav 与 aside 需要区分名称，文章标题应能从列表与详情页独立识别。不要用 aria-label 覆盖已有可见标题，优先通过 aria-labelledby 关联。失败边界是标签语义正确但地标均无名称、标题文本藏在图片、aria-label 与可见文本不一致；验证动作是在 Accessibility Tree 读取每个地标的 name 与 role，用语音或文本输出检查名称是否自然，并对重复名称进行改写。',
        '结构元素还要有稳定名称',
      ],
      [
        '修复父子关系与阅读顺序',
        '重构常暴露原 div 布局掩盖的问题：标题在 section 外、列表项直接放 div、链接嵌套按钮、CSS order 与 DOM 顺序相反。替换后应按线性阅读检查从 h1 到页脚的顺序，并保持关键任务入口在前。失败边界是桌面截图相同但键盘焦点先跳到页脚、移动端面包屑与标题颠倒、跳转锚点因容器变化失效；验证动作是关闭 CSS 与在 320px 下各走一次 Tab，记录每次焦点文本和滚动位置，并修复 DOM 而非只用 tabindex 强行排序。',
        'DOM 主线必须与视觉主线一致',
      ],
      [
        '合并自动化与人工回归证据',
        '完成重构后同时运行 HTML 验证器、axe 与项目现有测试，再人工走关键旅程；自动工具能发现重复 id、缺名控件与部分对比度问题，却不能判断标题是否符合业务或 Tab 顺序是否合理。失败边界是 axe 零问题但页面仍无法只用键盘完成购买、验证器通过但页面出现布局回归；验证动作是保存验证器与 axe 报告、桌面和移动截图、Tab 记录和关键请求状态，再与改造前基线逐项对照后才合入。',
        '结构、交互与视觉三类证据一起验收',
      ],
    ],
  },
];

const h2Name = (topic: string) => `HTML5 · 表单、输入与验证：${topic}`;

const HANDWRITTEN_HTML5_H2_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: h2Name('form、label 与输入控件关联'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '已能编写语义页面并使用键盘访问链接，知道表单控件会成为可聚焦交互元素。',
    goal: '能建立 form、label、input 与 button 的正确关联，理解点击标签和可访问名称的计算方式，并避免空 placeholder 与重复 id 造成的输入歧义。',
    guidedPractice: '创建一个登录表单，用 for 与 input id 关联邮箱和密码，再添加一个包裹式 label 的搜索框；在 Accessibility 面板读取每个控件的 name、role 和 required 状态，点击标签文字验证焦点移动，并用表单提交观察 URL 与查询参数。',
    independentPractice: '把一份只用 placeholder 标识字段的注册表单改为显式标签，保留必要的格式帮助；为密码确认、套餐选择和提交按钮分别建立可访问名称，再用键盘与屏幕阅读器名称列表完成一次填写。',
    commonErrors: [
      'label 的 for 拼错或指向重复 id，视觉上靠近控件但浏览器没有建立关联。',
      '用 placeholder 取代 label，用户输入后提示消失，自动填充和辅助技术也难以稳定获得字段名称。',
    ],
    sourceRefs: [
      'WHATWG HTML Standard: Forms. https://html.spec.whatwg.org/multipage/forms.html',
      'W3C WAI: Forms tutorial. https://www.w3.org/WAI/tutorials/forms/',
    ],
    steps: [
      [
        'form 声明提交边界',
        'form 的 action 指定提交目标 URL，method 选择 GET 或 POST，enctype 决定请求体编码；表单控件只有具备 name 且未 disabled 才会成功提交。GET 会把数据放入查询字符串，POST 更适合非幂等或敏感数据，但仍需 HTTPS 与服务器校验。失败边界是 action 为空误提交当前页、控件没有 name、GET 表单提交密码导致 URL 与日志泄露；验证动作是在 Network 记录请求方法、action URL 与 Form Data，并关闭 JavaScript 用原生提交验证浏览器自身行为。',
        '提交协议先由 form 属性确定',
      ],
      [
        'label 建立名称与点击范围',
        '显式关联由 label 的 for 对应控件的唯一 id，隐式关联则由 label 包裹控件；两者都能让点击标签聚焦或切换控件，并为控件提供可见名称。一个控件只应有一个主要 label，说明帮助可用 aria-describedby 关联。失败边界是多个控件复用 id、把一个 label 包住多个可交互控件、用 title 作为唯一名称；验证动作是逐项点击标签并观察 activeElement，在 Accessibility Tree 读取 name，再运行验证器检查重复 id。',
        '点击关联与可访问名称同时成立',
      ],
      [
        '按控件职责选择元素',
        '短文本用 input 并配 type，长文本用 textarea，固定选项可考虑 select，布尔值用 checkbox，互斥选项用 radio，触发动作使用 button。button 要显式写 `type="submit"`、`type="reset"` 或 `type="button"`，尤其在 form 内不要依赖默认值。失败边界是用 div 加 click 假装按钮、reset 按钮误触发提交、checkbox 与文字未建立关联；验证动作是用 Tab 和 Space 操作每种控件，在 Console 检查 element.type 与 form.elements，确认只有预期按钮提交。',
        '原生控件先表达交互语义',
      ],
      [
        'placeholder 只作补充提示',
        'placeholder 显示未输入状态的短提示，不替代可见 label，也不会在输入后持续存在；复杂格式要求应放在 label 邻近文本并用 aria-describedby 引用。失败边界是 placeholder 文本过长在小屏截断、颜色对比不足、把必填说明只放在 placeholder；验证动作是在高倍缩放与 320px 下读取标签，清空和输入后分别检查提示是否仍可获得，并用 axe 检查表单名称和描述关系。',
        '提示消失后字段仍需可识别',
      ],
      [
        '从名称到提交走完整表单',
        '最终验收不能只看鼠标点击：键盘用户应能从第一个控件依次到达提交按钮，读屏应朗读字段名、类型、必填与错误描述，服务器应收到正确字段名。失败边界是鼠标能点但 label 未关联、Tab 跳过某项、Network 中字段名与后端契约不一致；验证动作是只用键盘完成填写并提交，在 Network 复制 Form Data 与后端 schema 对齐，关闭 CSS 后再检查标签与控件仍相邻可理解。',
        '键盘、名称与请求字段一起验收',
      ],
    ],
  },
  {
    name: h2Name('输入类型、自动填充与移动键盘'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '能把 label 与 input、textarea、select 正确关联，并理解表单提交会形成 name-value 数据。',
    goal: '根据数据语义选择 input type、inputmode 与 autocomplete，理解浏览器如何决定移动键盘和自动填充，并避免把格式约束只写在说明文本里。',
    guidedPractice: '制作包含邮箱、电话、邮编、日期和验证码的表单，分别设置 type、inputmode、autocomplete 与 enterkeyhint；在手机仿真中记录每种控件弹出的键盘布局和自动填充候选，再用 Network 查看提交值。',
    independentPractice: '为一个结算页补齐姓名、地址、国家和信用卡字段的 autocomplete token，删除会破坏自动填充的自定义掩码；用移动设备横竖屏、密码管理器和无自动填充三种环境完成填写，记录哪些字段需要手动恢复。',
    commonErrors: [
      '所有字段都用 type=text，移动用户必须为邮箱、电话和数字反复切换键盘。',
      '自定义输入掩码拦截粘贴和自动填充，导致密码管理器或浏览器无法写入合法值。',
    ],
    sourceRefs: [
      'WHATWG HTML Standard: Input elements. https://html.spec.whatwg.org/multipage/input.html',
      'MDN: Autofill. https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete',
    ],
    steps: [
      [
        'input type 表达数据类别',
        'email、tel、url、number、date、password 等类型给浏览器提供解析、验证、键盘和自动填充线索；type=tel 不保证号码格式，具体限制仍要靠 pattern 或服务器规则。number 适合真正数值并可参加步进与范围约束，不适合邮编或带前导零的标识。失败边界是日期用 text 却依赖手写解析、密码用 text 暴露输入、信用卡号使用 number 丢失格式；验证动作是逐项检查 element.type、移动键盘与提交值，并在 Network 中确认名称和数据类型未因显示格式而改变。',
        '类型描述数据而不是视觉风格',
      ],
      [
        'autocomplete 使用标准 token',
        '浏览器依靠 autocomplete 识别姓名、email、tel、one-time-code、address-line1、cc-number 等语义，可组合 shipping 或 billing 分区。正确 token 让密码管理器和移动系统提供一致填充，显著减少错误。失败边界是随便写 autocomplete=on、跨用途复用同一 token、把验证码保存成 password；验证动作是在无痕窗口检查自动填充候选，提交后比较各字段值，并确认敏感值不会进入查询字符串或客户端日志。',
        '标准 token 才能驱动可靠自动填充',
      ],
      [
        'inputmode 控制键盘而非验证',
        'inputmode=numeric、decimal、tel、email、url、search 可提示虚拟键盘形态，但不改变元素数据语义，也不触发原生类型验证。可用 `enterkeyhint="next|done|send"` 改变移动键盘动作提示，仍需配合表单顺序与焦点管理。失败边界是把 inputmode 当格式校验、在普通搜索框强制 numeric 使汉字无法输入、软键盘弹出后提交按钮被遮住；验证动作是在真实移动设备或仿真中输入中英文字符，切换横竖屏并观察 visualViewport 与焦点滚动，确认字段仍可编辑。',
        '键盘提示不等于数据约束',
      ],
      [
        '标签和帮助说明格式',
        '可见 label 写字段含义，帮助文本说明例子与格式，placeholder 仅放短提示；当用户输入后，格式规则仍应可见。错误信息要指向具体字段并可被读取，不能只靠红色边框。失败边界是电话格式只在 placeholder、单位未写明、错误只显示在表单顶部；验证动作是将缩放设为 200% 并清空 placeholder 输入，确认字段名与帮助仍在，再提交非法值检查错误是否通过 aria-describedby 关联。',
        '格式规则不能随占位符消失',
      ],
      [
        '跨输入方式验收字段',
        '同一表单要覆盖物理键盘、触屏键盘、粘贴、自动填充和语音输入；任何输入方式都不得被按键事件随意阻断，提交值必须经过同样校验。失败边界是 onkeydown 只允许数字导致粘贴失败、自动填充未触发 change 事件、软键盘把错误提示遮住；验证动作是在移动仿真中分别粘贴和自动填充，在 Console 监听 input 与 change，滚动到错误字段确认可视区域，并把三类输入产生的 Form Data 与服务器校验结果对比。',
        '输入路径不同但数据契约应一致',
      ],
    ],
  },
  {
    name: h2Name('原生约束验证与错误提示'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '掌握 input 类型、label 关联和表单提交，能在 Console 读取 DOM 属性和对象状态。',
    goal: '使用 required、pattern、minlength、min、max 等原生约束完成客户端即时检查，正确读取 ValidityState，并用可持久、可关联的错误文案补充浏览器默认提示。',
    guidedPractice: '建立一个含必填邮箱、六位验证码和日期范围的表单，提交非法值后在 Console 输出每个控件的 validity 对象与 validationMessage；先用浏览器默认提示，再加入 aria-describedby 错误文本与自定义 reportValidity 调用。',
    independentPractice: '为一个活动报名表单设计客户端规则：姓名长度、邮箱格式、年龄范围、同意条款；让非法值在提交时阻止请求，合法值进入 Network，随后用脚本绕过前端直接发请求，验证服务器仍会拒绝。',
    commonErrors: [
      '只给输入框添加红色 CSS，却没有 required 等约束或可读取错误文本。',
      '把客户端验证当安全边界，认为用户无法修改 DOM 或直接调用 API。',
    ],
    sourceRefs: [
      'WHATWG HTML Standard: Constraint validation. https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#constraint-validation',
      'MDN: Client-side form validation. https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Form_validation',
    ],
    steps: [
      [
        '约束属性声明浏览器规则',
        'required 阻止空值提交，minlength 与 maxlength 限制文本长度，pattern 用完整匹配语义表达格式，type=email 与 url 提供内置解析，min、max、step 约束数值或日期范围。属性值应来自业务规则并允许合法边界，如空字符串是否算未填。失败边界是 pattern 锚点与转义写错、maxlength 被用来代替业务上限校验、number 接受科学计数法导致格式变化；验证动作是准备边界矩阵，逐项读取 `field.validity.valid`、`field.validity.tooShort` 等字段，并确认同一值在服务器有对应规则。',
        '约束属性要与业务边界一致',
      ],
      [
        'ValidityState 说明失败原因',
        'ValidityState 为 valueMissing、typeMismatch、patternMismatch、tooShort、rangeUnderflow、rangeOverflow、stepMismatch、customError 等提供布尔标记，validationMessage 返回浏览器本地化提示。检查时按字段类型读取具体标记，而不是只写 `!input.checkValidity()`。失败边界是多个约束同时失败只显示第一条、浏览器语言与业务文案不一致、禁用控件不参与约束；验证动作是在 Console 输出每个字段的 validity 对象，修正一个属性后重测对应标记是否变化，并记录 disabled、readonly 下行为差异。',
        '先知道哪一种约束失败',
      ],
      [
        '显式关联可读错误文本',
        '错误信息放在字段附近，通过 `aria-describedby` 指向稳定 id，必要时使用 aria-invalid=true；不要用颜色或图标作为唯一提示。错误出现后应更新文本并让用户知道提交被阻止，但不要为每个字段无条件使用 aria-live 造成重复朗读。失败边界是错误文本不在 DOM、id 冲突、只设置 aria-invalid 而没有说明；验证动作是清空/输入/再次提交，检查 Accessibility Tree 的 description，用屏幕阅读器从字段读到错误，再开启高对比模式确认提示仍可见。',
        '错误要定位到字段并说明原因',
      ],
      [
        '自定义规则保持原生语义',
        '跨字段一致性、异步可用性等规则可用 `setCustomValidity` 写入 customError，规则变化时必须清空旧消息；提交事件中若调用 reportValidity，应避免再弹出第二套重复提示。novalidate 会关闭浏览器的原生阻止，适合完全自定义流程，但不应误用来掩盖规则缺失。失败边界是旧 customError 未清除使合法值持续失败、自定义弹窗抢走焦点、novalidate 后没有任何客户端检查；验证动作是修改触发条件和字段值，在 Console 每轮输出 checkValidity、validationMessage 与 customError，确保状态会被重置。',
        '自定义提示仍要回到约束状态',
      ],
      [
        '客户端验证必须配合服务器',
        '原生验证改善体验但不能防止直接请求、代理改写或旧客户端提交；服务器必须重新检查类型、长度、范围、权限和业务唯一性，并返回字段级错误映射。失败边界是前端通过但服务器 500、服务器返回错误字段名与表单不一致、成功后重复允许提交；验证动作是先用表单触发客户端失败，再用 curl 或测试客户端绕过浏览器发送非法与边界请求，确认状态码、错误字段与数据库无非法副作用。',
        '浏览器校验永远不是安全边界',
      ],
    ],
  },
  {
    name: h2Name('fieldset、legend 与分组语义'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '已能为单个输入控件建立 label，并理解 radio、checkbox 与提交按钮的原生行为。',
    goal: '使用 fieldset 与 legend 表达相关控件组，正确处理单选、复选、地址组与禁用状态，并能验证组名、组内标签和键盘操作没有被视觉结构破坏。',
    guidedPractice: '制作一组配送方式 radio：外层 fieldset 的 legend 写“配送方式”，每个 radio 各有 label；在 Accessibility Tree 读取组名和选项名称，再把 fieldset 设为 disabled，观察所有内部控件不可提交且不可聚焦的差异。',
    independentPractice: '重构结算表单的地址与付款区块，用 fieldset/legend 分组，保留每个字段独立 label；故意把一个 legend 删除或隐藏，比较读屏名称与提交数据，然后修复并补写键盘操作记录。',
    commonErrors: [
      'radio 只有每个选项的 label，没有说明这组选项回答的问题。',
      '用 div 标题加 role=group 代替可原生表达的 fieldset，却没有提供可访问组名。',
    ],
    sourceRefs: [
      'WHATWG HTML Standard: fieldset and legend. https://html.spec.whatwg.org/multipage/form-elements.html#the-fieldset-element',
      'W3C WAI: Grouping controls. https://www.w3.org/WAI/tutorials/forms/grouping/',
    ],
    steps: [
      [
        'fieldset 建立相关控件组',
        'fieldset 把逻辑相关控件与一个组名关联，legend 是该组的题注；单选组、地址字段组、付款方式和同意条款都适合使用。组名应回答一个完整问题，例如“选择发票类型”，而不是重复每个字段名称。失败边界是把整个长页面塞进一个 fieldset、legend 为空、分组只存在于视觉卡片中；验证动作是在 Accessibility Tree 读取 group 与 name，再用键盘进入组内，确认读屏在选项前先报组题。',
        '先判断这些控件共同回答什么',
      ],
      [
        'legend 必须可见且可命名',
        'legend 若被 CSS 完全隐藏，视觉用户看不到问题，辅助技术也可能失去组名；若布局需要，可调整位置和样式，但不要用 display:none 删掉语义。需要隐藏时可使用无障碍视觉隐藏技术，同时保留可访问树，但业务问题通常应可见。失败边界是 legend 颜色对比不足、position:absolute 遮挡、多个 legend 对应不清；验证动作是在 200% 缩放与 320px 下查看 legend，读取 Accessibility name，并确认它不会与字段标签重复造成冗长朗读。',
        '组题注默认应让所有人看见',
      ],
      [
        'radio 与 checkbox 各自正确命名',
        '一组 radio 共享相同 name 以形成互斥选择，每个 radio 仍需要自己的 label 说明选项；legend 说明组的问题，label 说明当前选项，两者缺一不可。checkbox 同组可有不同 name 或按业务收集多值。失败边界是所有选项使用同一 id、name 不同导致可多选、label 只包图标；验证动作是用方向键在 radio 组间切换，用 Space 切换 checkbox，并在 Network 检查提交键名与多选值编码。',
        '组名与选项名承担不同信息',
      ],
      [
        'disabled 改变组与提交行为',
        'fieldset 的 disabled 会使后代的表单控件失效，无法聚焦或成功提交；aria-disabled 只是状态提示，不会自动改变原生提交与焦点。需要暂时锁定时还要提供原因和恢复路径。失败边界是把隐藏区域设为 disabled 后仍期望 FormData 含字段、用 pointer-events:none 替代原生禁用、锁定后用户无法知道如何解除；验证动作是切换 fieldset.disabled 与 aria-disabled 对比 Tab、FormData 和样式，并在 Accessibility Tree 读取状态。',
        '原生 disabled 与 ARIA 状态不同',
      ],
      [
        '分组后重走完整提交流程',
        '验收时从组名到每个选项再到后续字段连续操作，确保视觉区块、DOM 分组和提交数据结构一致；单选组应有默认状态或明确未选。失败边界是桌面布局正常但移动端组题在选项之后、禁用状态破坏 FormData、服务端不接受空单选；验证动作是键盘完成所有组、在 Network 核对键值，在 320px 检查 legend 与错误提示位置，再运行 html-validate 与 axe 记录组级问题。',
        '组语义要贯穿操作与请求',
      ],
    ],
  },
  {
    name: h2Name('提交、取消、加载与重复提交'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能理解 form action、method、提交按钮和 Network 请求，并能编写基础事件监听代码。',
    goal: '区分原生提交、重置和普通按钮，设计加载中与取消状态，理解客户端禁用按钮不能防止重复请求，并用幂等策略与服务端结果验证。',
    guidedPractice: '实现一个创建工单表单：初始表单走原生提交并观察导航，再接入 submit 事件、AbortController 和加载文案；快速连点提交按钮两次，记录 Network 请求数，然后加入请求中禁用与服务端幂等键重测。',
    independentPractice: '为付款或预约表单设计提交状态机：可编辑、校验中、提交中、成功、失败、可重试；保证取消不会清空用户数据，失败时可恢复按钮，成功后刷新不会再次创建记录。',
    commonErrors: [
      '只监听 click 而不处理 form submit，用户按 Enter 或调用 requestSubmit 时绕过逻辑。',
      '认为按钮 disabled 就能防重复请求，忽略断网重试、双击前时序与直接 API 调用。',
    ],
    sourceRefs: [
      'WHATWG HTML Standard: Form submission. https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#form-submission-algorithm',
      'MDN: HTMLFormElement.requestSubmit. https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/requestSubmit',
    ],
    steps: [
      [
        '三种按钮职责要显式声明',
        '提交按钮通常写 `button type="submit"`，重置写 `type="reset"`，其余交互写 `type="button"`；在 form 中省略 type 的 button 默认可能提交。原生 submit 会先执行约束验证，再按 action、method 与 enctype 发出请求。失败边界是把取消按钮放进 form 未写 type，点击后提交；验证动作是逐个按钮点击并在 Network 观察请求，再使用键盘 Enter 与 form.requestSubmit() 确认同一提交路径。',
        '按钮默认行为必须明确',
      ],
      [
        'submit 事件是统一入口',
        '监听 form 的 submit 可在原生验证通过后拦截默认行为，再通过 fetch 提交 FormData；不要监听每个提交按钮，否则 Enter 键和程序化提交会漏掉。调用 preventDefault 后需自行处理错误、导航和重复提交。失败边界是只在 click 中 preventDefault、submit handler 未检查 event.submitter、字段在序列化后被改值；验证动作是分别用鼠标、Enter、requestSubmit 提交同一表单，比较 FormData、sender 元素与 Network 方法。',
        '所有提交路径要汇入同一处理',
      ],
      [
        '加载状态表达进行中',
        '提交开始时记录状态、禁用可重复触发入口、把按钮文本或 aria-busy 更新为“提交中”，并在结果后恢复；如果视觉变化可能重复朗读，可用 aria-live 只播报一次。不能仅靠转圈图标，也不能让按钮一直保持不可恢复的加载态。失败边界是请求失败后按钮永久禁用、加载文案改变宽度造成布局跳动、屏幕阅读器无反馈；验证动作是人为延迟网络，用 Tab 与读屏观察状态，在 Network 中确认只出现预期请求，并检查按钮尺寸在多种状态保持稳定。',
        '加载状态要可见可读可恢复',
      ],
      [
        '取消请求与取消操作分开',
        'AbortController 可中止 fetch 并触发 AbortError，解决离开页面或主动取消等待；但服务器可能已经处理请求，客户端显示“已取消”不代表记录未创建。真正的业务取消需要服务端状态或补偿操作。失败边界是取消后错误提示当普通失败重试、中止后仍更新已卸载界面、超时与用户取消无法区分；验证动作是用 DevTools 网络节流在发送后取消，检查 Network 状态和数据库，再让页面分别处理 AbortError、超时与业务失败。',
        '中止等待不等于撤销副作用',
      ],
      [
        '重复提交由多层防线处理',
        '客户端可用提交中状态减少误触，服务端仍要用幂等键、唯一约束或事务保证同一意图只产生一次结果；网络重试必须复用同一幂等标识。成功页刷新应显示已有结果而不是再次 POST。失败边界是禁用按钮前仍有竞态、超时重试生成两条订单、成功响应丢失后用户重试新建；验证动作是快速双击、断网后恢复、代理重放同一请求，统计数据库记录数，并检查响应与幂等键是否允许安全重放。',
        '防重复的最终责任在服务端',
      ],
    ],
  },
  {
    name: h2Name('可访问表单的完整实验'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '已掌握标签关联、输入类型、原生约束、分组和提交状态，能进行键盘与 Accessibility Tree 检查。',
    goal: '把字段名称、说明、错误、分组、提交状态与焦点恢复组合成完整可访问表单，并用键盘、读屏、axe、缩放和绕过前端请求证明可用与可信。',
    guidedPractice: '构建一个含姓名、邮箱、手机号、服务类型和同意条款的注册表单；为每字段提供 label、autocomplete 与帮助文本，提交非法值后在字段旁显示错误，并把焦点送到首个无效字段，同时保留表单顶部错误摘要。',
    independentPractice: '为一个带动态条件的预约表单补充可访问流程：选择线下时出现地址组，选择在线时出现会议平台；用 fieldset/legend 和 aria-describedby 管理变化，出错时可恢复输入，再用键盘和 axe 完成验收。',
    commonErrors: [
      '把所有错误放进一个 alert，却不把错误与具体字段关联，用户需要来回查找。',
      '动态显示或隐藏字段时只改 CSS，留下不可见却可聚焦的控件，或改变字段后不清除旧错误。',
    ],
    sourceRefs: [
      'W3C WAI: Forms tutorial. https://www.w3.org/WAI/tutorials/forms/',
      'WebAIM: Creating accessible forms. https://webaim.org/techniques/forms/',
      'MDN: ARIA live regions. https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions',
    ],
    steps: [
      [
        '先保证字段名称与说明',
        '每个控件应有稳定 label，必要时用 aria-describedby 关联格式说明和错误；autocomplete 帮助自动填充，fieldset/legend 说明组合问题。字段名称回答“填什么”，说明回答“怎么填”，不要把两者混成长 placeholder。失败边界是标签与控件视觉相邻但未关联、字段说明只在图例、重复字段同名；验证动作是用 Tab 逐项朗读 name、role、description 与 required，清空输入后再读一次，确保说明在交互后仍然存在。',
        '名称、说明和分组各司其职',
      ],
      [
        '错误摘要与字段错误协同',
        '提交失败后可提供错误摘要链接到每个问题字段，同时在字段附近保留具体说明；首个无效字段获得焦点，摘要用于总览而不是替代字段错误。摘要可通过 aria-labelledby 与 heading 标识，切忌重复使用会无限播报的 alert。失败边界是摘要只显示数量、点击摘要不移动焦点、字段错误清空后摘要仍过期；验证动作是提交多个非法字段，记录焦点位置，依次点击摘要链接并确认 activeElement 与描述更新，再修正字段观察错误状态同步消失。',
        '摘要负责总览，字段负责定位',
      ],
      [
        '动态字段保持焦点可预测',
        '条件字段出现时，应只插入当前需要的控件；隐藏时使用 disabled、移出 DOM 或明确的 hidden 语义，避免不可见但可 Tab 的元素。若用户正在操作的字段被移除，焦点应回到触发字段或新组标题并说明变化。失败边界是 display:none 后代仍通过脚本聚焦、动态新增字段没有 label、切换选项后保留旧错误；验证动作是用键盘切换条件，记录每次 activeElement，读取新增区域的 name 与 legend，提交后确认只包含当前可见且启用的字段。',
        '条件变化不能破坏焦点和提交范围',
      ],
      [
        '提交状态与成功结果可感知',
        '提交按钮应保持稳定尺寸，加载状态通过文本或 aria-busy 表达；成功后提供明确 heading 与结果编号，失败时保留用户已输入内容。若重定向到成功页，标题和页面地标仍应完整。失败边界是成功只显示短暂 toast、错误刷新后输入全丢、aria-live 无节制播报网络日志；验证动作是节流网络观察按钮和可访问状态，提交成功后刷新并读取 heading，再模拟 500 错误确认数据、错误说明和重试入口仍在。',
        '状态反馈覆盖等待、成功与失败',
      ],
      [
        '多工具与越权路径联合验收',
        '自动化检查只能作为第一层：axe 发现名称、标签和部分 ARIA 错误，键盘测试验证操作，读屏验证顺序和播报，服务器测试验证绕过前端仍安全。失败边界是 axe 零错误但动态字段仍能 Tab 到隐藏控件、只测 Chrome 忽略 WebKit 焦点差异、前端拒绝非法值但 API 接受；验证动作是保存 axe 报告、纯键盘流程、200% 缩放截图和服务器非法请求结果，并用另一学习者从空表单完成任务。',
        '可访问表单要靠任务而非分数收口',
      ],
    ],
  },
];

const h3Name = (topic: string) => `HTML5 · 媒体、表格与内容表达：${topic}`;

const HANDWRITTEN_HTML5_H3_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: h3Name('img、srcset、sizes 与替代文本'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能用 img 加载图片、设置宽高并编写 alt，知道 Network 面板可查看资源请求。',
    goal: '理解 srcset 的宽度与像素密度描述符、sizes 的布局提示和浏览器选图流程，能为信息图片与装饰图片写出正确替代文本并验证实际加载资源。',
    guidedPractice: '准备 480、960 和 1440 像素宽的同一产品图，配置 `srcset` 的 w 描述符与 `sizes="(max-width: 600px) 100vw, 50vw"`；在 375px 与 1440px 视口下读取 `img.currentSrc` 和 Network 传输尺寸，确认浏览器没有总下载最大图。',
    independentPractice: '为企业案例卡片实现响应式图片：保留 src 作为兜底，使用 srcset/sizes、width/height、loading、decoding，并分别处理封面信息图与纯装饰纹理的 alt；在慢速网络下断图验证布局不发生大跳动。',
    commonErrors: [
      '给宽度描述符候选图写错真实像素宽度，浏览器会按错误密度选择低清或过大图片。',
      '把 alt 写成文件名、重复相邻标题，或让装饰图朗读无意义描述。',
    ],
    sourceRefs: [
      'WHATWG HTML Standard: Images. https://html.spec.whatwg.org/multipage/images.html',
      'MDN: Responsive images. https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images',
    ],
    steps: [
      [
        'src 是兜底与最终内容',
        'img 的 src 指定默认资源，srcset 提供候选 URL 及 x 或 w 描述符；即使浏览器会选择候选，src 仍应指向合理图片，防止阅读器或旧环境无图可显示。图片的 width 与 height 写原始宽高比，CSS 可再缩放并让浏览器预留空间。失败边界是 src 指向 404、srcset 文件名与真实尺寸不符、CSS 强拉伸改变比例；验证动作是逐个打开候选 URL 读取 naturalWidth 与 naturalHeight，再比较页面 currentSrc、渲染尺寸和 Network 编码后大小。',
        '默认资源与候选描述都要真实',
      ],
      [
        'srcset 与 sizes 共同决策',
        'w 描述符表示图片固有宽度，浏览器结合 sizes 推得的显示宽度和设备像素比选择候选；x 描述符更适合固定 CSS 尺寸的矢量替代或图标。sizes 必须描述布局规则，媒体条件按顺序匹配，无法匹配时使用最后一项。失败边界是写了 w 却没写 sizes、sizes 与实际容器宽度差异很大、响应式网格让布局宽度不断变化；验证动作是在多个断点读取 getBoundingClientRect().width、devicePixelRatio 与 currentSrc，在 Network 禁用缓存后观察每档实际请求。',
        '候选选择依赖布局宽度而非屏幕猜图',
      ],
      [
        '加载优先级控制时机',
        '首屏主图可用 `fetchpriority="high"` 和预加载帮助尽早发现，非首屏图片可用 `loading="lazy"`；decoding=async 允许浏览器在不阻塞渲染的情况下解码，但不能保证解码前不占布局。对首屏图片盲目 lazy 会延迟 LCP，对折叠下图片全部 eager 又会抢占带宽。失败边界是 lazy 用在首屏 hero、图片无尺寸造成 CLS、预加载图片与实际 currentSrc 不一致；验证动作是清缓存节流加载两次，在 Network 比较图片请求起始时间、LCP 候选与布局偏移，并检查 Console 是否有 unused preload 警告。',
        '加载提示服从首屏与视口顺序',
      ],
      [
        'alt 描述图像承担的任务',
        '信息图片的 alt 应传达用户需要的信息，链接内图片的名称应与链接目的结合；装饰图片使用空 alt，让辅助技术跳过，而不是省略属性。复杂图表可给简短 alt 并用正文或数据表提供等价信息。失败边界是 alt 重复 figcaption、把重要数据只藏在图里、所有图片统一“产品图片”；验证动作是关闭图片查看替代文本，读取 Accessibility Tree 的 image name，再让读屏从相邻标题进入，确认没有重复或缺失信息。',
        '替代文本取决于图像用途',
      ],
      [
        '响应式图片需要网络与布局回归',
        '完成后在 320、600、1440px 和不同 DPR 下检查 currentSrc、文件体积、清晰度与图片占位；断网或返回 404 时应保留合理宽高和可理解文本。失败边界是桌面高清移动仍下载巨图、低 DPR 被错选超图、图片失败后卡片内容重叠；验证动作是禁用缓存并记录各断点的请求集合，执行一次断网刷新和 axe 检查，再比较 CLS 事件与图片区域截图。',
        '最终验收同时看选图、带宽和空位',
      ],
    ],
  },
  {
    name: h3Name('picture、figure 与图像决策'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '理解 img 的 srcset、尺寸占位和 alt，并能在 DevTools 中查看 currentSrc。',
    goal: '区分分辨率切换、艺术指导与图像说明，能用 picture/source 选择合适格式和裁切，用 figure 与 figcaption 建立可引用的媒体内容单元。',
    guidedPractice: '为一张新闻头图配置 picture：桌面使用横向 AVIF/WebP，窄屏使用裁切更紧的版本，最后保留 img 兜底；在 375px 与桌面切换，读取 currentSrc，再把它放入带 figcaption 的 figure，核对图注没有被重复朗读。',
    independentPractice: '制作一个包含数据图、说明文字和来源链接的图组：用 figure 组织图像与 figcaption，按浏览器支持选择 AVIF 或回退格式，并为无法显示图片的读者提供相同结论的文本说明。',
    commonErrors: [
      '在 picture 内去掉 img，导致浏览器没有最终图像元素和替代文本。',
      '用 picture 处理同图不同分辨率，却忽略更合适的 srcset，造成重复 source 和复杂维护。',
    ],
    sourceRefs: [
      'WHATWG HTML Standard: picture element. https://html.spec.whatwg.org/multipage/embedded-content.html#the-picture-element',
      'MDN: figure element. https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/figure',
    ],
    steps: [
      [
        '先判断是否需要艺术指导',
        '当不同视口需要不同裁切、构图或内容重点时，picture 用 source 的 media 条件切换资源；只是同一构图给不同设备选清晰度时，直接在 img 上使用 srcset 与 sizes 更简单。source 中的 type 也可以按格式支持选择 AVIF、WebP 或 JPEG。失败边界是裁切版只隐藏主体、source 条件互斥错误、没有最终 img；验证动作是列出每个断点的设计意图，在多视口读取 currentSrc，并通过 Response Headers 的 Content-Type 确认格式。',
        '切裁切和切清晰度是两类需求',
      ],
      [
        'source 顺序与回退规则',
        '浏览器按 source 出现顺序评估 media、type 与 srcset，第一个满足的 source 提供候选，最后必须有 img 作为兜底并承载 alt。source 的 media 不应与 CSS 容器断点使用不同口径而不做说明。失败边界是 AVIF source 写在 WebP 前却测试了不支持格式，source 指向不存在文件而 img 正常资源掩盖错误；验证动作是在支持与不支持格式的浏览器各测，禁用缓存查看 Network，确认没有下载未选候选，并检查 currentSrc 最终不是 source 的 URL。',
        '最终回退必须落在 img',
      ],
      [
        'figure 是内容单元',
        'figure 可包图、代码、图表等可移动的独立内容，figcaption 提供说明；caption 可以是简短标题或来源说明，但不要把图片 alt 与 figcaption 写成重复两句。figure 本身不是地标，重要图表需要正文引用与解释。失败边界是图文关系只靠视觉邻近、figure 嵌套 article 形成错误复用、删除 figure 后正文失去引用对象；验证动作是在线性阅读中从正文跳到图与图注，再输出 Accessibility Tree，确认 image name 与 caption 各承担不同信息。',
        '图注说明意义而非复述像素',
      ],
      [
        '媒体内容提供等价路径',
        '图表、信息图和示意图若承载决策信息，应有结构化表格、列表或文字结论作为等价内容；alt 只写概要，详细数据放在正文或可展开的 table。图片加载失败时 figure 仍应保留说明与替代路径。失败边界是 alt 过长塞满所有数据、只有颜色区分系列、figcaption 指向“见上图”却断图后无意义；验证动作是禁用图片、关闭 CSS 和读屏三种方式阅读，确认数据与来源仍可获得，并用灰度截图检查颜色之外的编码。',
        '复杂图像需要独立等价内容',
      ],
      [
        '在真实断点验证选图与说明',
        '把 picture 与 figure 放入完整内容页，在 320、768、1440px 下检查构图、尺寸占位、currentSrc 和图注位置；慢速网络下确认不会因加载候选切换造成明显跳动。失败边界是桌面与移动都选同一源、图注在移动端压住下一标题、格式回退在 Safari 失败；验证动作是禁用缓存采集各断点 Network、读取 naturalWidth 与 clientWidth，并运行 axe 和图片关闭模式后形成对照记录。',
        '艺术指导要通过真实断点验收',
      ],
    ],
  },
  {
    name: h3Name('video、audio、track 与字幕'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解图片资源的 MIME、Network 请求和可访问名称，能在页面中嵌入链接与说明文本。',
    goal: '嵌入可控的视频与音频体验，配置 poster、preload、playsinline、字幕轨和替代文本，并区分自动播放策略、隐私请求与媒体真实可播放边界。',
    guidedPractice: '嵌入一段 20 秒产品视频，设置 width、height、poster、preload=metadata、controls 与 playsinline，添加 VTT 字幕 track；在 Network 观察首屏是否只请求元数据，开启 captions 后检查字幕文本与时间轴，再尝试静音自动播放记录浏览器策略。',
    independentPractice: '为一个播客片段提供 audio、文字稿与下载链接，给视频补英语和简体中文字幕，配置 crossorigin 与来源域名；用慢速网络、无字幕文件和静音环境分别测试并记录失败反馈。',
    commonErrors: [
      '只放 video 标签和 controls，没有字幕、文字稿或 poster，静音环境用户无法获得内容。',
      '自动播放带声音或大体积预加载，触发浏览器拦截并抢占首屏带宽。',
    ],
    sourceRefs: [
      'WHATWG HTML Standard: Video and audio. https://html.spec.whatwg.org/multipage/media.html',
      'MDN: Adding captions and subtitles to HTML video. https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Audio_and_video_delivery/Adding_captions_and_subtitles_to_HTML5_video',
    ],
    steps: [
      [
        'video 先声明可替换媒体',
        'video 的 controls 提供浏览器播放控件，width 与 height 预留比例，poster 显示首帧替代图，preload 控制元数据或媒体预取，playsinline 影响移动浏览器全屏策略。多个 source 可按 type 顺序提供编码回退，浏览器选择首项可播放资源。失败边界是只有不支持的编码、缺失尺寸造成布局跳动、controls 被 CSS 隐藏却无替代控件；验证动作是读取 video.currentSrc 与 video.error，比较 Network 中的 MIME、范围请求和实际可播放状态。',
        '播放能力由容器编码共同决定',
      ],
      [
        '自动播放必须尊重策略',
        '浏览器通常只允许静音自动播放，带声音的 autoplay 会被拒绝并在控制台提示；muted、playsinline 可能提高移动端播放成功率，但不应成为绕过用户意愿的手段。播放会消耗流量和注意力，首屏可让用户主动开始。失败边界是自动播放被拦截后页面无按钮、移动端进入全屏打断阅读、静音视频没有文字说明；验证动作是查看 `video.autoplay`、paused 与 play() 返回的 Promise，在桌面和移动仿真各测一次并记录控制台拒绝原因。',
        '自动播放不是可用性的前提',
      ],
      [
        'track 提供字幕与文字替代',
        'track 的 kind=captions 表示对白与非对白声音的字幕，kind=subtitles 表示翻译，srclang 标明语言，label 给用户选择名称，default 选择默认轨。WebVTT 文件需正确 MIME、时间戳和 cue 文本，跨域媒体与轨道还要处理 CORS。失败边界是字幕文件 404、时间轴重叠或字符编码错误、只给英文字幕；验证动作是选中字幕轨读取 textTracks 的 mode、cues 与 language，播放关键段落核对屏幕上出现内容，再直接请求 VTT 检查响应头和正文。',
        '字幕轨要能被加载也能被选择',
      ],
      [
        'audio 需要可见内容和文字稿',
        'audio 与 video 一样可以使用 source、controls 与 preload，但音频没有画面辅助理解，页面应同时提供标题、摘要、时长和完整文字稿。文字稿链接应可聚焦、可复制，并标注更新时间。失败边界是文字稿藏在仅鼠标可见浮层、播放器无名称、音频资源跨域播放失败；验证动作是静音且关闭扬声器完成内容获取，在 Accessibility Tree 读取播放器与说明，并用按键控制播放、暂停和音量。',
        '声音内容必须有非声音路径',
      ],
      [
        '媒体在真实网络与设备上收口',
        '验收要覆盖第一次播放、拖动进度、字幕切换、网络中断、错误恢复与移动旋转；检查媒体请求范围、首帧延迟和文字稿。失败边界是本地文件可播而生产 MIME 被代理改成下载、字幕跨域被拒、暂停后焦点丢失；验证动作是使用本地 HTTP 服务器和节流网络播放，查看 video.error 与 textTracks，再在移动设备切换横竖屏，保存可播放、失败和字幕开启三种状态记录。',
        '媒体验收要包含失败与替代路径',
      ],
    ],
  },
  {
    name: h3Name('table、caption、th 与数据关系'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能使用标题、段落和列表组织内容，并理解辅助技术会暴露表格行列关系。',
    goal: '用 table、caption、thead、tbody 与 th scope 建立真实数据表，理解行列标题和合并单元格对读屏的影响，并能判断何时表格结构比视觉网格更合适。',
    guidedPractice: '制作季度销售额表：caption 写“2026 年季度销售额”，首行 th 设 scope=col，首列 th 设 scope=row；用 DevTools Accessibility 查看单元格关联标题，再故意删除 scope 比较读屏获得的行列信息。',
    independentPractice: '把一个价格对比页面实现为可访问表格，包含 caption、thead、tbody、数字单位、脚注和空值表示；在 320px 下增加可聚焦横向滚动容器，验证键盘用户仍能读取首列并滚动查看末列。',
    commonErrors: [
      '用 table 做整页布局，导致读屏按行列导航一组并不存在关系的内容。',
      '表头只加粗视觉样式却不用 th，或合并单元格后没有说明列组关系。',
    ],
    sourceRefs: [
      'WHATWG HTML Standard: Tabular data. https://html.spec.whatwg.org/multipage/tables.html',
      'W3C WAI: Tables tutorial. https://www.w3.org/WAI/tutorials/tables/',
    ],
    steps: [
      [
        '先确认内容确实是二维数据',
        'table 适合行与列共同决定单元格含义的数据；页面布局、日程卡片或简单列表通常不需要表格。caption 提供表名和必要单位，thead、tbody、tfoot 组织结构，th 标记行或列标题。失败边界是把一张卡片网格硬塞成 table、caption 缺失、用空单元格撑间距；验证动作是口头描述任一单元格“某行与某列交叉是什么”，若无法说清关系就应改用列表或 section。',
        '行列共同决定单元格含义',
      ],
      [
        'scope 建立单元格关联',
        'th 的 scope=col 表示该表头描述整列，scope=row 表示描述整行；对二维表，行头与列头共同决定数据单元。合并单元格可用 colspan、rowspan 调整结构，但会让后续行列偏移，复杂表可配合 colgroup 或 headers/id。失败边界是数据单元格用 td 导致失去关联、scope 方向反了、合并后表头跨入错误区域；验证动作是在 Accessibility 面板查看 cell 的 row/column headers，逐行检查第一列与首行的组合，并用表格导航快捷键朗读若干数据单元。',
        '表头关联要能被辅助技术计算',
      ],
      [
        '结构和单位要进入内容',
        '数值单元格应明确货币、百分比、时间范围或空值含义；总计与普通数据可通过 th scope=col 或行结构区分，脚注放在表格附近并有引用关系。不要只靠颜色表示增长和下降。失败边界是列标题“变化”但单位不清、空值读作零、趋势只用红绿箭头；验证动作是关闭 CSS 后逐列阅读，在纯文本导出中检查单位仍在，并用灰度或色盲模拟确认数值与文字本身可区分。',
        '数值含义不能只靠样式补齐',
      ],
      [
        '窄屏滚动保留表格关系',
        '宽表在 320px 可放进有 tabindex=0 和 aria-label 的横向滚动容器，让键盘用户能聚焦并滚动；不要仅用 overflow:hidden 截掉列。若改为卡片堆叠，必须保留每张卡的行头与列名。失败边界是容器无可访问名称、左右滚动键被页面吞掉、粘性首列遮住焦点；验证动作是在 320px 用 Shift+滚轮或方向键滚动，记录第一列是否可见，再用 Tab 确认容器可聚焦且不与单元格内链接冲突。',
        '窄屏重排不能丢掉行列关系',
      ],
      [
        '表格验收覆盖导航与数据完整性',
        '完成后使用读屏表格快捷键逐行、逐列、跳转表头，检查每个统计值都有正确行列名；同时比较页面数字与数据源，确认排序或筛选没有改变 caption 所述范围。失败边界是视觉排序后表头顺序没变、分页只显示部分数据却 caption 像全量、导出 CSV 与屏幕内容不同；验证动作是保存读屏样例、执行 html-validate 与 axe，导出表格文本并和数据源做行数、总计与边界值核对。',
        '表格正确性包括关系与数据两项',
      ],
    ],
  },
  {
    name: h3Name('meta、Open Graph 与结构化数据'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能在 head 中设置 title 与 meta，理解页面 URL、标题和描述会出现在搜索与分享场景。',
    goal: '为页面配置搜索摘要、canonical、Open Graph 与 JSON-LD 结构化数据，理解机器读取来源和冲突规则，并能用抓取工具验证而不是只看源码猜测。',
    guidedPractice: '为一个产品详情页设置唯一 title、meta description、canonical、og:title、og:type、og:image、og:url 与 Product JSON-LD；用浏览器查看原始响应，再分别运行社交分享预览与 Schema Markup Validator，记录警告和实际抓取值。',
    independentPractice: '为文章、公司首页和产品页各建立元数据模板，要求 URL 为绝对地址、图片尺寸合格、结构化字段与可见内容一致；制造 canonical 与 og:url 不同、价格不一致两个错误，观察工具报告后修复。',
    commonErrors: [
      '把同一段 meta description 复制到所有页面，或写与正文不一致的关键词堆砌。',
      '结构化数据声称价格、评分或库存与页面内容和业务系统不一致，试图只靠标记获得富结果。',
    ],
    sourceRefs: [
      'Open Graph protocol. https://ogp.me/',
      'Schema.org Product. https://schema.org/Product',
      'Google Search Central: Structured data. https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data',
    ],
    steps: [
      [
        '搜索元数据描述唯一页面',
        'title 是页面主要标题来源，meta name=description 提供摘要候选，link rel=canonical 声明规范 URL；它们都应逐页生成并反映可见内容。description 不保证被原样使用，canonical 也不是强制重定向。失败边界是 title 重复、canonical 指向其他主题、描述包含只有内部知道的信息；验证动作是导出全站 title、description 与 canonical 表格，逐页对照 h1 和主内容，并请求最终 URL 检查响应正文中的值。',
        '页面身份信息必须逐页一致',
      ],
      [
        'Open Graph 面向分享抓取',
        'og:title、og:description、og:image、og:url 和 og:type 为社交平台提供分享卡片候选，图片 URL 应绝对可访问并满足尺寸与内容要求。抓取器通常不执行复杂客户端脚本，动态内容需在服务端或预渲染响应中输出。失败边界是相对图片路径、登录后才可访问、og:url 带追踪参数造成重复；验证动作是匿名请求页面源码，直接请求分享图片，再用平台调试器查看抓取缓存和警告，必要时刷新抓取缓存。',
        '分享信息要能在匿名抓取中出现',
      ],
      [
        'JSON-LD 描述实体关系',
        '结构化数据使用 Schema.org 词汇描述页面实体，如 Article、Organization 或 Product；JSON-LD 放在 `script type="application/ld+json"` 中，字段值应与页面可见内容和数据源一致，URL、价格、货币和可用性使用规定格式。失败边界是 JSON 尾逗号、多个实体缺少 @id 关系、评分没有真实用户依据；验证动作是解析 JSON 不依赖人工目测，运行 Schema Markup Validator 与富结果测试，再对比页面显示、数据库记录和响应字段。',
        '标记只能描述真实内容',
      ],
      [
        '多来源重复时建立优先级',
        '页面可能同时有标准 meta、Open Graph 与 JSON-LD，同一事实应在构建阶段来自同一数据模型，避免手写多处后漂移。canonical、og:url 与结构化 URL 对分页、筛选和多语言页要明确主从关系。失败边界是筛选页 canonical 全指向首页、og:image 与 JSON-LD image 不同、描述更新而缓存仍保留旧值；验证动作是列出每个机器字段的唯一来源，自动比较生成结果，再用匿名 curl 与各验证器检查最终 CDN 响应而非本地模板。',
        '同一事实只维护一个来源',
      ],
      [
        '分享与搜索预览做端到端验收',
        '发布前用完整绝对 URL 请求页面，确认 title、description、canonical、OG 和 JSON-LD 都出现在首屏响应，图片无需登录即可取回；分享后检查实际卡片与目标页一致。失败边界是部署后才注入脚本使抓取器看不到、预览图片被防火墙阻断、搜索结果展示与他页冲突；验证动作是记录匿名响应头与关键 meta、图片状态、验证器报告和平台预览截图，并在 CDN 缓存刷新后复测同一 URL。',
        '验收最终公网响应而非模板猜测',
      ],
    ],
  },
  {
    name: h3Name('媒体与富内容企业页面'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '已掌握响应式图片、picture/figure、音视频字幕、数据表和页面元数据，并能使用 DevTools 检查加载。',
    goal: '在一个企业内容页中组合图片、图表、视频、表格和分享元数据，建立内容等价路径、资源优先级和失败回退，并完成移动与可访问性验收。',
    guidedPractice: '制作企业年度报告页：首屏用响应式 figure，主体嵌入带字幕短视频、关键指标表和可下载文字稿；设置图片尺寸与 LCP 候选，给视频和信息图提供等价文本，并在 320px 下检查表格滚动。',
    independentPractice: '独立完成一条产品发布内容页，包含 picture 头图、视频、数据表、OG 摘要和 JSON-LD 新闻文章标记；模拟图片 404、字幕缺失和慢网环境，写出每项的可见回退与检测记录。',
    commonErrors: [
      '页面在正常网络和图片加载成功时成立，断网、无字幕或窄屏时关键信息直接消失。',
      '把多种富内容同时高优先级加载，导致 LCP 图片、字体和视频元数据互相争抢带宽。',
    ],
    sourceRefs: [
      'W3C WAI: Complex images. https://www.w3.org/WAI/tutorials/images/complex/',
      'web.dev: Media performance. https://web.dev/learn/performance',
      'Schema.org Article. https://schema.org/Article',
    ],
    steps: [
      [
        '按内容主线安排媒体',
        '富内容页先确定读者必须获得的结论，再决定图片、视频和表格各自承担什么；首屏主图可高优先级，解释性视频与下方图表延后加载。每个媒体都要有正文引用和摘要，避免孤立的视觉装饰。失败边界是视频取代全部文字说明、表格与图像讲不同数字、首屏同时预加载多个媒体；验证动作是关闭媒体后阅读页面，检查主线是否完整，再在 Network 按请求起始时间排出真实资源优先级。',
        '内容先决定媒体职责',
      ],
      [
        '图片与图注形成稳定内容单元',
        '年度报告主图用 picture 或 srcset 适配断点，figure 与 figcaption 说明时间、范围和来源；复杂图表提供数据表或文本结论，图像 alt 只给摘要。尺寸、宽高比和加载策略要避免移动端跳动。失败边界是 figcaption 只写“报告图”、图片失败后数据不可获得、裁切版丢失关键数值；验证动作是在禁用图片、320px 和 200% 缩放下阅读，比较 currentSrc、点击图表说明和目标表格是否存在。',
        '每个媒体都要有非视觉等价路径',
      ],
      [
        '音视频服从阅读与带宽',
        '视频默认显示 poster 与 controls，按需加载，字幕用 track 提供 default 选择；文字稿放在相邻 heading 下并可链接下载。不要自动播放带声音，也不要把隐私跟踪脚本绑在未点击播放器上。失败边界是字幕轨跨域失败、视频错误无提示、暂停后页面无法继续阅读；验证动作是节流网络播放、切换字幕、模拟媒体 404，检查 video.error 与页面提示，再在移动设备旋转后确认播放器和后续表格布局稳定。',
        '播放失败也要保留内容路径',
      ],
      [
        '表格和分享数据来自同一事实源',
        '关键指标用 table/caption/th 表达行列关系，OG 和 JSON-LD 的标题、日期、图片与正文来自同一内容模型；数值在屏幕、结构化数据和分享摘要中必须一致。失败边界是页面销量与 JSON-LD 不同、发布日期使用用户本地时间导致跨日、OG 图片指向临时预览；验证动作是导出页面表格、meta、JSON-LD 三者做自动对比，检查日期 ISO 值与图片状态，再运行结构化数据验证工具。',
        '可见内容与机器描述不能漂移',
      ],
      [
        '用失败矩阵完成页面交付',
        '最终在正常网络、慢速 3G、断图、禁音、320px、桌面和键盘七种条件下检查：标题可读、主图可替代、视频有字幕与文字稿、表格可滚动、分享信息完整。失败边界是只保存一张成功截图、错误在缓存后不可复现、替代内容只在开发环境存在；验证动作是建立条件与预期矩阵，每项记录 URL、Network、可访问树截图和控制台，所有关键项通过后才交给他人按正文任务验收。',
        '富内容验收必须覆盖降级状态',
      ],
    ],
  },
];

const h4Name = (topic: string) => `HTML5 · 可访问性、SEO 与国际化：${topic}`;

const HANDWRITTEN_HTML5_H4_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: h4Name('键盘路径、焦点顺序与跳转链接'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能用语义地标和原生链接、按钮构建页面，并知道 Tab 键会移动键盘焦点。',
    goal: '建立可预测的键盘路径，使用页面内跳转链接越过重复导航，理解焦点环、tabindex 与程序化聚焦边界，并修复焦点丢失和视觉顺序错位。',
    guidedPractice: '在页面首个可聚焦元素放置“跳到主要内容”链接，href 指向 `main id="main"`，必要时给 main `tabindex="-1"`；只用 Tab、Enter 和 Shift+Tab 从地址栏走到页脚，记录每次焦点文本与滚动位置，再关闭 CSS 检查顺序。',
    independentPractice: '为一个移动菜单和搜索结果页建立键盘路径：菜单可开可关并返回触发按钮，搜索无结果时焦点落在说明标题；补齐可见 focus-visible 样式，并用 200% 缩放测试跨三屏内容。',
    commonErrors: [
      '给大量 div 添加正数 tabindex，制造与 DOM 不同的跳跃顺序。',
      '删除 outline 却没有替代焦点样式，或打开浮层后焦点仍停留在背景页面。',
    ],
    sourceRefs: [
      'W3C WAI: Keyboard compatibility. https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html',
      'MDN: tabindex. https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/tabindex',
    ],
    steps: [
      [
        '原生可聚焦元素建立主线',
        'a 的 href 与 button 默认可通过 Tab 到达，并分别承担导航与动作；键盘顺序通常遵循 DOM，正数 tabindex 会创建在自然序列之前的独立队列，容易失控。tabindex=0 可让自定义控件进入自然顺序，但不会自动补上键盘行为。失败边界是用 div 加 onclick 作为链接、按钮内嵌套可聚焦元素、隐藏元素仍保留 tabindex；验证动作是刷新后从地址栏连续按 Tab，记录 activeElement 的标签、文本与位置，并删除所有正数 tabindex 重测。',
        '让原生元素承担可聚焦职责',
      ],
      [
        '跳转链接服务重复导航',
        '跳转链接应是页面中较早可聚焦的 a，正常可见或聚焦时出现，href 指向主要内容 id；目标不是原生可聚焦元素时加 tabindex=-1 让脚本或片段导航能把焦点送入，避免按 Tab 后仍从导航重新开始。失败边界是目标 id 重复、链接 href 只有 `#`、跳转后焦点仍在地址栏；验证动作是只按 Tab 找到跳转链接并 Enter，读取 document.activeElement 与滚动位置，再从该点继续 Tab 完成正文任务。',
        '跳转必须在焦点上真正生效',
      ],
      [
        '焦点样式必须清晰稳定',
        '`:focus-visible` 用于区分键盘焦点与部分鼠标点击，样式应与背景有足够对比并覆盖链接、按钮和表单控件；不要全局 `outline:none` 后只留细微阴影。固定尺寸的控件需要为焦点环预留空间，避免被 overflow 裁剪。失败边界是深色背景上焦点不可见、tabindex=-1 程序聚焦没有反馈、强制色彩模式样式丢失；验证动作是在普通、暗色和 forced-colors 模式中逐类控件 Tab，截图测量焦点轮廓，并用键盘而非鼠标完成整页操作。',
        '焦点可见是键盘使用的前提',
      ],
      [
        '动态界面管理焦点返回',
        '打开菜单、对话框或筛选面板时，焦点应移入可见逻辑起点；关闭后返回触发控件。移出 DOM 的节点会造成 activeElement 变成 body。动态内容更新可移动焦点到结果标题，但不应每次输入都打断用户，状态播报由受控 live region 负责。失败边界是关闭浮层后焦点回页首、Esc 退出后无法继续原位置、Tab 跑入背景内容；验证动作是记录打开前 activeElement，完成打开、内部 Tab、Esc 关闭，再核对焦点引用与背景不可达状态。',
        '焦点要随上下文移动并返回',
      ],
      [
        '跨浏览器与缩放完成回归',
        '相同 DOM 在 Chrome、Firefox 和 Safari/WebKit 中对片段导航、focus-visible 与隐藏元素的处理可能有细节差异，移动 WebView 还会受软键盘影响。回归时固定页面版本，在 200% 缩放和 320px 宽度记录 Tab 路径、焦点可见性与滚动位置。失败边界是桌面方向键正常而移动返回键退出页面、焦点目标被粘性页头遮住、浏览器自动滚动后上下文标题不可见；验证动作是逐浏览器从跳转链接走到提交按钮，截图焦点位置，并用 scrollIntoView 前后的矩形坐标确认目标没有被遮挡。',
        '焦点路径要在目标浏览器中实测',
      ],
    ],
  },
  {
    name: h4Name('ARIA 的角色、名称和状态'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '已熟悉原生链接、按钮、地标和标签，并能读取 Accessibility Tree。',
    goal: '理解 ARIA 只补充可访问语义而不自动提供行为，能正确设置 role、可访问名称与状态，优先保留原生元素，并识别 aria-hidden 与焦点冲突。',
    guidedPractice: '把一个自定义展开按钮写成原生 button，添加 aria-expanded 与 aria-controls；在 Accessibility Tree 读取 role、name、expanded，切换状态后用键盘 Enter、Space 操作，再把 button 换成 div role=button 对比缺失的默认行为。',
    independentPractice: '为一个标签页或筛选面板补全可访问名称、选中状态和关联区域；先尝试用原生 button、hidden 与 detail 等能力，只有原生不足时再添加 ARIA，并记录每种角色的键盘操作假设。',
    commonErrors: [
      '只写 role=button 就以为获得 Enter、Space、焦点和禁用行为。',
      '对含可聚焦内容的容器设置 aria-hidden=true，造成可 Tab 元素从可访问树消失。',
    ],
    sourceRefs: [
      'W3C WAI-ARIA Authoring Practices. https://www.w3.org/WAI/ARIA/apg/',
      'MDN: ARIA states and properties. https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes',
    ],
    steps: [
      [
        '优先使用原生语义',
        '原生 button、a[href]、input、select、main 等元素自带角色、焦点和大量状态行为；ARIA role 只改变辅助技术暴露的语义，浏览器不会据此补上点击、键盘或禁用行为。能使用原生元素时不要重造。失败边界是 nav 上加 role=main、div role=link 没有 href、label 目标被 aria 属性覆盖；验证动作是对照源码与 Accessibility Tree，确认 role 是否与元素职责一致，再只按键盘执行每项动作。',
        'ARIA 不替代原生行为',
      ],
      [
        '名称由可见文本或关联提供',
        '可访问名称可来自元素内容、label、aria-label 或 aria-labelledby，aria-labelledby 会按引用元素文本组合；可见文本与名称应一致，以免语音控制说出的词无法匹配。description 与 name 是不同字段，可用 aria-describedby 补充。失败边界是 aria-label 覆盖已有关键文本、引用不存在 id、图标按钮无名；验证动作是在 Accessibility Tree 读取 name 与 description，用语音识别或文本搜索核对可见词，修复重复 id 后复查。',
        '可访问名称要与可见表达一致',
      ],
      [
        '状态属性必须同步真实界面',
        'aria-expanded 表示展开状态，aria-pressed 表示切换按钮，aria-selected 表示选中，aria-disabled 表示不可用但不等同原生 disabled；ARIA 状态属性只有真假字符串的语义，仍需脚本在每次交互后更新。失败边界是状态写死为 true、视觉已关闭而 aria-expanded 未更新、aria-current 用在非当前项；验证动作是逐步操作并观察 DOM 属性与 Accessibility Tree，刷新和浏览器后退后再次验证状态已由应用状态重新计算。',
        '状态不能与界面行为漂移',
      ],
      [
        '隐藏与焦点必须一致',
        'aria-hidden=true 只从可访问树隐藏内容，不改变焦点、点击或视觉；隐藏区域内若有可聚焦元素，键盘用户会进入“不可见”的空白。纯装饰图标可 aria-hidden，完整关闭面板通常用 hidden 属性或从 DOM 移除。失败边界是关闭菜单仍可 Tab、aria-hidden 包住当前焦点、视觉隐藏文本用 display:none 后失去标签；验证动作是关闭后持续按 Tab，检查 activeElement 是否仍落入隐藏容器，再读取 Accessibility Tree 确认隐藏边界。',
        '不可访问的内容也不应抢焦点',
      ],
      [
        '用行为规则验证自定义角色',
        '使用复杂 role，如 tab、dialog、combobox 时，必须一并实现该角色所需的键盘、名称和状态规则；ARIA Authoring Practices 可作为模式参考而不是只需复制属性。失败边界是 tab 不能方向键切换、dialog 背景仍可 Tab、combobox 展开后焦点丢失；验证动作是建立模式检查表，逐步执行键盘、读屏和 axe，并优先评估是否能退回原生 select、details 或 button 组合。',
        '角色越复杂，需要验证的行为越多',
      ],
    ],
  },
  {
    name: h4Name('对比度、缩放与动效偏好'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能使用 DevTools 检查计算样式，并理解 focus、hover、error 等状态需要视觉表达。',
    goal: '按 WCAG 对比度与缩放要求检查文字、图标和焦点状态，支持放大到 200% 与 320 CSS 像素重排，并为 prefers-reduced-motion 提供降级。',
    guidedPractice: '选择一个正文按钮、错误提示和焦点环，用 DevTools 颜色检查器测量前景与背景对比度；把浏览器缩放到 200%，在 320 CSS 像素宽度下检查导航、表格和固定宽度元素，再开启 prefers-reduced-motion 模拟验证过渡是否关闭。',
    independentPractice: '为企业站建立视觉可访问矩阵：正文、次要文字、禁用态、错误与焦点分别记录对比度；修复一个固定宽度溢出和一个持续动画，保留普通模式与减弱动效模式截图。',
    commonErrors: [
      '只检查大标题和默认按钮，漏掉 placeholder、禁用态、错误文字与焦点环。',
      '通过 user-scalable=no 或满屏固定高度阻止缩放，或在 200% 缩放下产生双向滚动。',
    ],
    sourceRefs: [
      'W3C WCAG 2.2: Contrast minimum. https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',
      'W3C WCAG 2.2: Reflow. https://www.w3.org/WAI/WCAG22/Understanding/reflow.html',
      'MDN: prefers-reduced-motion. https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion',
    ],
    steps: [
      [
        '对比度按状态逐项测量',
        '普通文本通常需要至少 4.5:1，大号文本与部分非文本控件按相应阈值检查；对比度应按实际最终计算色计算，透明背景、渐变和图片叠加会让 DevTools 单点读数失效。按钮 hover、focus、disabled、error 都要覆盖。失败边界是半透明层改变真实底色、占位符过淡、图标成为唯一状态；验证动作是用颜色检查器读取最终色值，放到纯色背景复测，并在 forced-colors 模式检查系统覆盖后的可见性。',
        '每个交互状态都要有可见对比',
      ],
      [
        '颜色之外保留状态编码',
        '错误、成功、选中和链接不能只靠红绿蓝差异，应同时使用文本、图标、形状或下划线；图标要隐藏装饰部分并给容器可访问名称。失败边界是表单只变红、差异图只用色阶、深色模式下链接与正文同色；验证动作是灰度截图与色觉模拟后辨认状态，再关闭 CSS 检查文本和属性是否仍表达相同信息。',
        '颜色是辅助通道而非唯一通道',
      ],
      [
        '200% 与窄视口需要重排',
        '浏览器缩放到 200% 时，内容应在约 320 CSS 像素宽度下保持阅读与操作，不出现必须横向滚动的整页；数据表等允许自身受控滚动，但主文、表单和导航不应固定超出。使用相对单位、minmax、max-width 与换行，避免绝对宽度。失败边界是仅浏览器内缩放被禁、固定侧栏遮挡 main、弹窗按钮在缩放下离屏；验证动作是在 200% 缩放和 320px 设备同时检查 scrollWidth 与 clientWidth，逐页寻找横向溢出元素并修复。',
        '重排目标是内容无需整页横向滚动',
      ],
      [
        '动效偏好允许降级',
        '`@media (prefers-reduced-motion: reduce)` 可减少非必要过渡、视差和循环动画；动画若承载状态变化，仍需保持即时可见反馈，而不是完全无提示。自动播放、闪烁和持续背景运动应谨慎。失败边界是只删 transition 却保留动画循环、减弱模式导致加载状态不可见、用 JS 设置动画而不读取媒体查询；验证动作是在 DevTools Rendering 模拟 reduced motion，记录动画前后的 computed style、可见状态和页面任务完成情况。',
        '减弱动效不能删除必要反馈',
      ],
      [
        '把视觉规则纳入页面回归',
        '把正文、次要文本、控件、焦点、错误和减弱动效的关键值写进设计或测试清单，在桌面、暗色、200% 缩放和 forced-colors 中抽样。失败边界是只截一张首屏、主题切换后对比度失效、组件新增状态未进入矩阵；验证动作是形成状态表格，用计算样式脚本输出色值与尺寸，再结合人工截图、axe 与键盘任务确认修复没有让其他状态变差。',
        '视觉验收要覆盖主题与状态组合',
      ],
    ],
  },
  {
    name: h4Name('SEO、canonical 与 robots'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '理解页面 URL、title、meta description、语义标题和 HTTP 状态码，能查看响应头与源代码。',
    goal: '为多页站点建立可抓取的标题、描述、规范 URL 和索引规则，区分 canonical、robots meta、robots.txt 与重定向，并能验证最终公网响应。',
    guidedPractice: '为一个有分页和筛选的站点设置每页唯一 title、description、自引用 canonical；在测试环境复制页面到两个 URL，分别添加 canonical、meta robots noindex 和 robots.txt Disallow，用 curl 与搜索平台工具观察抓取结果与冲突。',
    independentPractice: '为企业站制定索引策略：导航页可抓取，后台与临时预览禁止索引，分页保留原 URL，活动页使用 301；写出 robots.txt、页面 meta、sitemap 和验证记录，并模拟一次 URL 改名。',
    commonErrors: [
      '把 canonical 当访问控制或重定向，页面仍可返回 200 并被其他入口链接。',
      '页面写 noindex 又在 robots.txt 全面 Disallow，使抓取器看不到 noindex 指令。',
    ],
    sourceRefs: [
      'Google Search Central: Canonical URLs. https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls',
      'Google Search Central: Robots.txt. https://developers.google.com/search/docs/crawling-indexing/robots/intro',
      'RFC 9309: Robots Exclusion Protocol. https://www.rfc-editor.org/rfc/rfc9309',
    ],
    steps: [
      [
        'title 与描述描述真实页面',
        '抓取器主要依据可见内容、链接和响应理解页面，title 提供强标题信号，meta description 是摘要候选；两者逐页生成，并避免把所有页面都写成品牌首页。唯一 h1 与语义结构仍是内容基础。失败边界是 title 含关键词堆砌、描述与正文不符、所有筛选组合共享标题；验证动作是导出静态构建的 title、h1、description 表，逐条对照页面首屏，并检查 HTTP 响应中已包含这些标签。',
        '搜索信息来自真实内容与页面身份',
      ],
      [
        'canonical 声明首选 URL',
        'link rel=canonical 用绝对或根据 base 解析的 URL 指向规范页面，告诉搜索引擎当多个 URL 内容相似时哪个应被合并；它不会重定向用户，也不保证其他冲突信号自动消失。规范页最好能匿名访问并自引用。失败边界是 canonical 指向 404、筛选页都应自规范却全指首页、多语言页互相错误指向；验证动作是对每个 URL 请求最终响应，解析 canonical 后再次 curl，确认状态、title 与主要内容和目标一致。',
        'canonical 是合并信号不是访问控制',
      ],
      [
        '索引规则分工明确',
        '`meta name="robots" content="noindex"` 控制抓取后是否允许索引，robots.txt 主要限制抓取范围，HTTP 301/308 用于永久迁移，404/410 表示页面不存在；这些机制不能互相替代。失败边界是用 robots.txt 阻止后台页同时依赖 meta noindex、noindex 页面仍出现在 sitemap、URL 改名只写 canonical 不重定向；验证动作是分别检查页面源码、robots.txt、sitemap 和响应头，确认同一 URL 没有冲突指令。',
        '抓取、索引与重定向是不同层',
      ],
      [
        'sitemap 只列可索引主 URL',
        'XML sitemap 应包含规范、返回 200 且允许索引的页面，lastmod 使用可靠日期；在 robots.txt 可声明 sitemap 位置。分页、备份和跟踪参数页需按策略处理，不能全部塞入。失败边界是 sitemap 含 302/404、URL 参数与 canonical 不一致、lastmod 每次构建都变化；验证动作是解析 XML，逐条批量请求状态码，读取最终 URL 与 canonical，再用日期对比构建历史确认 lastmod 有意义。',
        '站点地图质量按目标 URL 校验',
      ],
      [
        '从匿名请求验证最终结果',
        'SEO 验收使用生产或预发布公网 URL，而不是登录后的本地 DOM：检查状态、重定向链、响应首屏中的 title/meta、robots 与 canonical，确认页面无需脚本才可见核心内容。失败边界是 CDN 缓存旧 canonical、防火墙拦截抓取器、客户端路由导致 200 但内容空；验证动作是 curl -I 与 curl 获取源码、关闭 JavaScript 打开页面、用抓取工具测试，并记录缓存刷新后的同一 URL 响应。',
        '最终匿名响应才是抓取事实',
      ],
    ],
  },
  {
    name: h4Name('语言、方向与本地化结构'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '理解 html、head、链接和文本顺序，能在页面中区分主语言与少量外语内容。',
    goal: '用 lang、dir、bdi 与本地化结构让浏览器和辅助技术正确处理语言切换、双向文字与日期，建立多语言 URL 与回退关系并验证实际朗读。',
    guidedPractice: '把页面根元素设为 `lang="zh-CN"`，在一段英文产品名和阿拉伯语引文中分别添加 lang，对双向混排用户名使用 bdi；在 Accessibility Tree 与读屏中读取语言变化，再切换 dir=rtl 观察导航和表格顺序。',
    independentPractice: '为一个中英双语企业页面建立 `/zh/` 与 `/en/` 结构，分别设置 html lang、唯一 title、hreflang 链接和语言切换；在英文段落中嵌入中文地址，在阿拉伯语用户名中测试方向隔离并记录修复。',
    commonErrors: [
      '所有页面都写 `lang=en`，即使正文为中文，造成读屏用错误语音规则朗读。',
      '只用 CSS 设置 dir 或 text-align，却没有在 DOM 中声明方向，导致标点、列表和表单顺序错误。',
    ],
    sourceRefs: [
      'WHATWG HTML Standard: Language and direction. https://html.spec.whatwg.org/multipage/dom.html#language',
      'W3C Internationalization: Declaring language. https://www.w3.org/International/questions/qa-html-language-declarations',
      'MDN: bdi element. https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/bdi',
    ],
    steps: [
      [
        '根元素声明主语言',
        'html 的 lang 使用 BCP 47 语言标签，例如 zh-CN、en、ar，帮助读屏选择发音并影响断词、拼写和部分排版；缺少声明时辅助技术可能采用用户默认语言。页面主体用一种语言时在 html 上声明，局部外语内容再嵌套语言。失败边界是 lang=zh 与具体地区内容不符、页面增删语言后模板未更新、非法标签被忽略；验证动作是 Electrono/Lighthouse Accessible Names 或 Accessibility Tree 读取 document.documentElement.lang，并让读屏分别朗读中英段落。',
        '语言标签描述文本实际语言',
      ],
      [
        '局部 lang 覆盖正确片段',
        '外语名称、引文、按钮标签或缩写若与主语言不同，应在最近的 span、blockquote、p 等元素设置 lang；语言切换过多会让朗读反复跳变，因此只标实际需要且足够长的片段。失败边界是给每个英文缩写都加语言导致噪声、语言标错地区、把品牌名强行译音后仍标旧语言；验证动作是抽查 Accessibility 中节点语言，读屏逐段听关键名称，并让本地使用者确认发音。',
        '局部声明要精确且节制',
      ],
      [
        'dir 与 bdi 处理双向文字',
        'dir=ltr 或 rtl 影响文本、列表、表格和表单的方向，bdi 可隔离用户生成文本以免标点把周围布局方向带偏，bdo 可强制覆盖方向但应少用。CSS logical properties 比 margin-left 更能适配方向。失败边界是用户名首字符为阿拉伯文导致整行反转、只有 text-align:right 没有 dir、图标方向未随语言变化；验证动作是在实际 RTL 页面检查段落起点、列表标记、表格列和键盘方向，并对含数字、标点的用户名做多组输入回归。',
        '方向是文档属性而非仅视觉对齐',
      ],
      [
        '多语言 URL 与 hreflang 对齐',
        '每种语言最好有独立稳定 URL，页内 `link rel="alternate" hreflang="zh-CN"` 指向对应翻译，并包含自引用与 x-default 回退；canonical 应在语言版本内部自指。失败边界是 hreflang 指向错误语言、切换语言锚定丢失到首页、同一 URL 按 cookie 返回不同语言却无缓存区分；验证动作是对每种 URL 匿名请求，解析 lang、hreflang 与 canonical，确认目标页面 lang 匹配并保留当前主题。',
        '语言版本应有可访问的稳定地址',
      ],
      [
        '本地化内容与格式一起验证',
        '日期、数字、货币和姓名顺序应通过 Intl 或服务端 locale 规则生成，date/time 使用可解析 datetime，并让可见格式符合目标地区；翻译后标题可能变长，需要在移动端重测换行。失败边界是只翻译正文不翻译 title、日期 03/04 含义不明、阿拉伯语页面仍使用左对齐滚动条；验证动作是用目标 locale 浏览关键页面，读取 Intl.DateTimeFormat 输出，检查 320px 下按钮和标题不溢出，并让母语使用者完成主要任务。',
        '翻译之外还要验证格式与布局',
      ],
    ],
  },
  {
    name: h4Name('无障碍与 SEO 联合验收'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '已掌握语义结构、键盘、ARIA、表单、对比度、meta、canonical 与语言声明，能运行 axe 和浏览器检查。',
    goal: '建立同时覆盖用户任务、辅助技术和搜索引擎抓取的验收矩阵，理解 Lighthouse 分数、axe 结果与人工检查各自边界，并输出可复现的问题与修复证据。',
    guidedPractice: '对同一企业页面运行 Lighthouse、axe 和纯键盘主流程，记录每项发现对应的元素与用户影响；再把页面用匿名 curl 抓取元数据，比较屏幕上的 title、h1、canonical 和链接是否与爬虫响应一致。',
    independentPractice: '为一个包含导航、表单、图片和文章的企业站建立验收报告：覆盖键盘手机与桌面、读屏抽样、200% 缩放、匿名抓取、robots/canonical、性能最低项，并为每个问题指定唯一修复与回归动作。',
    commonErrors: [
      '把 Lighthouse 100 分或 axe 零错误当成完整无障碍与 SEO 结论。',
      '只验证页面首屏和成功路径，遗漏错误状态、深层页面、移动视口与匿名抓取。',
    ],
    sourceRefs: [
      'W3C WAI: Easy checks. https://www.w3.org/WAI/test-evaluate/easy-checks/',
      'Google Search Central: SEO starter guide. https://developers.google.com/search/docs/fundamentals/seo-starter-guide',
      'Deque axe-core. https://github.com/dequelabs/axe-core',
    ],
    steps: [
      [
        '验收矩阵按用户任务组织',
        '矩阵先列任务：浏览服务、查看案例、提交咨询、切换语言、返回首页；每个任务再覆盖键盘、读屏、缩放、移动端和匿名抓取。这样能发现结构或状态组合问题，而不是逐题追逐工具规则。失败边界是只测首页首屏、表单只测成功、SEO 只看一个详情页；验证动作是给每个任务写入口 URL、步骤、预期状态和证据位置，并确保深层页与错误页至少各抽一张。',
        '任务覆盖优先于工具清单',
      ],
      [
        '自动工具定位可修复信号',
        'axe 可检查缺失名称、非法 ARIA、重复 id、部分对比度等问题，Lighthouse 综合运行性能与部分最佳实践；报告要保存规则 id、DOM 路径、视口与构建版本，修复后同条件复跑。分数受环境与规则集影响，不能代替键盘操作。失败边界是扫描登录后页面但生产匿名不同、只修高亮元素而没修同类模板、报告来自旧构建；验证动作是记录页面 URL 与 git 构建号，扫描所有页面模板，并对报告中一个元素修复后重跑同一路径。',
        '自动结果要绑定元素与构建',
      ],
      [
        '人工路径验证真实体验',
        '只用键盘完成主要任务，再用屏幕阅读器抽查标题、地标、表单错误和动态状态；缩放 200% 与 320px 检查重排。人工测试能发现焦点丢失、名称虽存在但不自然、视觉顺序与 DOM 不符等自动工具盲区。失败边界是只听首屏标题、只用一种浏览器、跳转链接可见但 Enter 后焦点未移动；验证动作是记录每步 activeElement、朗读文本和页面位置，由另一人仅凭键盘复现关键流程。',
        '人工验收回答用户能否完成任务',
      ],
      [
        'SEO 从公网响应与链接图验证',
        '使用匿名 curl 或抓取工具查看最终 URL 的状态、title、description、canonical、robots、hreflang 与主内容，检查所有内部链接能到达且不产生重定向环；sitemap 与实际索引页对齐。失败边界是 CDN 返回旧 meta、客户端路由只给空壳、robots 与 noindex 冲突；验证动作是保存响应头与源码片段，批量请求站内链接，关闭 JavaScript 检查内容，并比较 sitemap、canonical 和实际 200 URL 集合。',
        '搜索验收以最终匿名响应为准',
      ],
      [
        '缺陷闭环到可回归证据',
        '每条问题写清严重程度、受影响用户、复现 URL、元素路径、工具证据、唯一修复和回归命令或步骤；关闭前重新跑原路径、自动扫描与相邻页面。失败边界是只写“已优化无障碍”、修复导致移动端头图溢出、刷新缓存前误判成功；验证动作是保留修复前后截图、DOM 片段、测试命令和访问日期，确保报告可由另一位工程师独立重放。',
        '每项验收都要能重放和回归',
      ],
    ],
  },
];

const h5Name = (topic: string) => `HTML5 · 页面性能与企业站点交付：${topic}`;

const HANDWRITTEN_HTML5_H5_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: h5Name('关键 HTML、CSS、字体与脚本'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能在 DevTools 查看网络瀑布、LCP 候选和解析阻塞资源，并理解 HTML 解析会执行同步脚本。',
    goal: '控制首屏关键请求与 HTML 顺序，使用 defer、module、字体回退和必要样式降低渲染阻塞，并能以网络瀑布与渲染指标验证取舍。',
    guidedPractice: '给一个企业首页标出首屏所需 HTML、CSS、字体和交互脚本，把非首屏 CSS 拆分，把脚本移到带 defer 或 type=module 的入口，字体使用 font-display:swap；在慢速 3G 下比较改动前后的 First Contentful Paint 和请求瀑布。',
    independentPractice: '为一个部门页建立关键资源清单：记录每项请求的存在理由、体积、是否阻塞和 LCP 关系；删除一个无用样式包和同步统计脚本，补上本地字体回退，再用同一视口重复测三次。',
    commonErrors: [
      '把所有脚本都加 defer 就认为完成优化，忽略大体积下载仍会争抢首屏带宽。',
      '在 head 内联远超首屏需要的 CSS 和同步脚本，使 HTML 体积变大并延迟首屏渲染。',
    ],
    sourceRefs: [
      'web.dev: Render-blocking resources. https://web.dev/articles/render-blocking-resources',
      'web.dev: Font best practices. https://web.dev/articles/font-best-practices',
      'WHATWG HTML Standard: Scripting. https://html.spec.whatwg.org/multipage/scripting.html',
    ],
    steps: [
      [
        '先列出首屏关键请求',
        '首屏需要什么由 LCP 图像、可见文本样式和必要交互决定；HTML 是入口，关键 CSS 决定首次绘制，字体影响文本出现，脚本只有影响首屏结构或状态时才应抢占早期带宽。把每个请求标记为关键、延后或缓存命中。失败边界是模板依赖字体后遮住文本、首屏图片在 CSS 背景中晚发现、第三方脚本先于主样式；验证动作是在 Performance 面板看 LCP 元素与 Initiator，在 Network 按 Start time 排序，并逐项回答删除后首屏是否仍可读。',
        '关键资源必须有首屏理由',
      ],
      [
        'HTML 顺序影响发现与执行',
        '同步 script 会阻塞后续解析，defer 脚本在文档解析后按顺序执行，type=module 默认延迟并保留模块依赖语义；link rel=stylesheet 的样式会阻塞首次绘制。关键 CSS 可内联或尽早请求，非关键样式延后，但内联内容必须控制体积。失败边界是 defer 脚本仍依赖已删除的元素、异步脚本改变执行顺序导致初始化竞争、CSS 在 body 末尾造成无样式闪烁；验证动作是检查 Performance 调用栈与 DOMContentLoaded，记录脚本执行前后节点状态，并逐步调整属性后复跑首屏。',
        '加载属性改变执行时序',
      ],
      [
        '字体体验使用回退与子集',
        '`@font-face` 的 font-display:swap 先显示回退字体，再替换为下载字体；字体子集和多格式可减小体积，但替换时的字形宽度差异可能造成 CLS。预加载字体只在确定首屏使用且 URL、crossorigin 正确时加入。失败边界是字体请求较晚、字符集缺失导致局部回退、多个字重全部加载；验证动作是 Network 查看字体状态和大小，在慢速网络观察文本切换与布局偏移，并核对 document.fonts.check 对关键字体返回结果。',
        '字体优化同时处理时间与替换抖动',
      ],
      [
        '脚本按业务阶段拆分',
        '首屏只加载必需交互，分析、客服和重组件可延迟到空闲或用户动作；通过动态 import 和事件触发把非关键逻辑移出初始包。脚本仍需有错误边界和可关闭路径，不能为了指标把业务功能藏掉。失败边界是延迟脚本在用户点击前未准备、动态 chunk 路径错误 404、第三方脚本失败阻断主入口；验证动作是模拟点击、慢网和脚本失败，查看 Network 中 chunk 与错误，确认关键表单和导航不依赖非关键包。',
        '延后加载要考虑用户触发时机',
      ],
      [
        '同条件比较改动结果',
        '性能测试固定设备、网络节流、缓存状态、视口和构建版本，至少比较冷启动与二次访问。记录 FCP、LCP、CLS、总传输量与首屏请求数，避免只看单次 Lighthouse 分数。失败边界是开发服务器缓存与生产 CDN 混测、不同扩展干扰、只截最好一次；验证动作是使用无痕窗口或固定配置跑三次取中位数，保存请求列表和 Performance trace，并与改动前基线逐项解释差异。',
        '性能结论必须来自可重复对照',
      ],
    ],
  },
  {
    name: h5Name('预加载、懒加载与资源提示'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '理解关键渲染路径、图片选图和浏览器资源优先级，能查看 Network 请求的 Priority。',
    goal: '正确使用 preload、prefetch、modulepreload、fetchpriority 与 loading=lazy，避免未使用预加载和首屏懒加载，并用请求优先级与 LCP 候选验证资源提示。',
    guidedPractice: '为一个含首屏 hero、字体、模块脚本和折叠区图片的页面配置资源提示：hero 合理高优先级，非首屏 img 使用 lazy，模块入口使用 modulepreload；逐项移除提示比较 Network Priority、LCP 与 Console 警告。',
    independentPractice: '审计现有首页所有 preload、preconnect 与 lazy 图片，删除没有消费者的提示，为真实 LCP 资源建立预加载与尺寸占位；在 375px 与桌面各测一次，确认移动端没有提前下载折叠区大图。',
    commonErrors: [
      '给首屏主图加 loading=lazy，导致浏览器延迟发现并抬高 LCP。',
      '预加载不在当前页使用的字体或模块，下载完成后控制台报 unused preload。',
    ],
    sourceRefs: [
      'web.dev: Preload critical assets. https://web.dev/articles/preload-critical-assets',
      'web.dev: Browser-level image lazy loading. https://web.dev/articles/browser-level-image-lazy-loading',
      'MDN: fetchpriority. https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/fetchpriority',
    ],
    steps: [
      [
        'preload 只用于确定的关键资源',
        '`link rel="preload"` 提前请求当前页确定会用的资源，as 决定请求目的地与优先级，字体等跨域资源需要 crossorigin；提示错误 URL、类型不匹配或页面根本不用会造成警告和带宽浪费。失败边界是预加载了响应式图片中未被选中的候选、as 与真实类型不符、CSS 背景图重复请求；验证动作是 Network 打开 Priority 与 Initiator，确认 preload 请求被同一资源复用，并检查 Console 的 unused preload 提示。',
        '预加载必须对应真实消费者',
      ],
      [
        'fetchpriority 调整相对优先级',
        'img 的 `fetchpriority="high"` 可提高 LCP 候选发现后的相对优先级，low 可压低非关键图；它与 preload 不是替代关系，也不能突破连接和带宽竞争。对多图首屏应有明确主图，不能全部标 high。失败边界是关键图与轮播图都争 high、浏览器版本忽略属性、错误资源预占导致文本 CSS 延后；验证动作是在同一网络条件比较 Priority 列和 LCP 时间，一次只改一个图片属性并记录请求顺序。',
        '优先级必须分出主次',
      ],
      [
        'lazy 适合折叠下方资源',
        '原生 `loading="lazy"` 让浏览器在接近视口时请求图片或 iframe，减少初始传输；图片仍需 width、height 或 aspect-ratio 预留空间。首屏 hero、LCP 图和立即需要的交互 iframe 不应 lazy。失败边界是移动端视口计算特殊导致延迟、JS 横向轮播中的图远离初始滚动、图片无尺寸造成 CLS；验证动作是分别在首屏和滚动到位置时观察 Network 请求起点，检查 currentSrc 与布局偏移，并保留 eager 对照。',
        '懒加载服从视口与布局预留',
      ],
      [
        '预取与模块提示服务下一步',
        'prefetch 提示浏览器在空闲时获取可能用于下一页的资源，资源若未被使用就是机会成本；modulepreload 可提前解析模块图而不执行。链接 hover、路由预测和用户意图能提高命中率。失败边界是给所有路由预取、prefetch 跨源泄漏隐私、modulepreload URL 重定向导致重复；验证动作是模拟真实导航，比较空闲网络与下一页启动时间，检查请求复用和服务器访问日志中的未使用资源比例。',
        '预测资源要以用户意图为依据',
      ],
      [
        '资源提示通过完整加载回归',
        '清缓存测试第一页 LCP、首屏请求数、折叠区是否被提前下载，再测试点击下一页时 prefetch 是否命中；在不同 DPR 与视口重复。失败边界是只在桌面有效、CDN 响应头使 preload 无法复用、资源提示把缓存清空后的高峰放大；验证动作是保存 Network HAR、Priority 列表、LCP 候选与控制台警告，所有提示都应有命中证据或删除记录。',
        '每条提示都要有命中与收益证据',
      ],
    ],
  },
  {
    name: h5Name('第三方脚本、CSP 与隐私边界'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能在 head/body 加入外部脚本并查看 Network、Console 和响应头，理解同源与跨域不是同一安全边界。',
    goal: '为第三方脚本建立最小权限与加载闸门，使用 SRI、sandbox、referrerpolicy 和 CSP 限制注入与数据外流，并验证拦截、回退与隐私告知。',
    guidedPractice: '加入一个带 `integrity` 与 `crossorigin` 的固定版本库脚本，再为嵌入视频 iframe 设置 allow、sandbox 与 referrerpolicy；配置 CSP 后检查 Console 拦截项，逐项放宽到功能可用但权限最小。',
    independentPractice: '为一个含客服挂件、分析和地图的企业页做第三方审计：记录来源、用途、加载时机、可访问数据与失败回退；删除一个不必要脚本，将其余延后到用户动作，并补齐隐私说明和 CSP 测试。',
    commonErrors: [
      '第三方脚本使用 latest 地址且没有 SRI 或版本锁定，供应商更新即可改变执行内容。',
      'CSP 只放宽到 unsafe-inline 让页面不报错，实际没有限制脚本注入面。',
    ],
    sourceRefs: [
      'MDN: Content Security Policy. https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP',
      'W3C: Subresource Integrity. https://www.w3.org/TR/SRI/',
      'OWASP: Content Security Policy Cheat Sheet. https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html',
    ],
    steps: [
      [
        '第三方资源先做清单',
        '清单记录域名、脚本用途、版本、加载条件、可读取数据、失败影响和负责人；客服、分析、地图和 A/B 测试都应按第三方处理。能延后到用户点击的不要阻塞首屏。失败边界是营销页面复制旧标签、同一供应商多个重复 SDK、隐藏像素读取完整 URL 参数；验证动作是查看 Network Initiator 与请求域，断网和阻止域名分别测试主任务，确认每项资源都有明确降级。',
        '第三方的权限与失败都要登记',
      ],
      [
        'SRI 锁定外部内容',
        '静态 script 或 link 可使用 integrity 哈希与 crossorigin 验证资源未被 CDN 替换，版本 URL 应固定而不是 latest；哈希升级必须与文件内容审核同步。失败边界是浏览器跨域响应缺少 CORS 导致 SRI 失败、动态更新脚本不适用固定哈希、哈希只覆盖一个旧文件；验证动作是检查 script.integrity 与响应 CORS 头，故意篡改测试副本确认加载被阻断并在 Console 记录原因。',
        '可执行资源要验证内容完整性',
      ],
      [
        'iframe 使用最小权限',
        'sandbox 默认限制脚本、表单、弹窗和同源能力，再按需要加 allow-scripts 等 token；iframe allow 控制摄像头、麦克风等特性，referrerpolicy 控制来源信息，title 提供可访问名称。失败边界是同时 allow-scripts 与 allow-same-origin 却仍以为被隔离、第三方地图无需摄像头却允许、iframe 无 title；验证动作是逐项移除 allow 权限测试功能，检查 frame 的 Content-Security-Policy 与 Network referrer，并在 Accessibility Tree 读取标题。',
        '嵌入内容只获得业务所需权限',
      ],
      [
        'CSP 从报告到强制逐步收紧',
        'CSP 通过响应头设置 default-src、script-src、img-src、frame-src、connect-src 等来源，Content-Security-Policy-Report-Only 可先收集违规；nonce 或 hash 可允许受控内联脚本，避免 unsafe-inline。CSP 不能修补已存在的输出编码漏洞，但能缩小注入执行面。失败边界是 meta CSP 无法覆盖全部指令、报告地址泄露敏感路径、只设置 report-only 未真正强制；验证动作是检查响应头、触发一次未授权脚本观察 blocked 事件，并查看报告确认违规 URL 与指令准确。',
        'CSP 是纵深防御的一层',
      ],
      [
        '隐私和失败回退一起验收',
        '在加载任何跟踪或嵌入前确认必要性、告知和同意边界，避免把查询参数、表单值或用户标识写入第三方 URL；脚本失败时页面仍可浏览和联系。失败边界是像素在同意前加载、CSP 错误页面白屏、客服挂件失败后键盘焦点卡住；验证动作是在净化后的测试账号中查看第三方请求，阻止脚本域名后完成主要任务，并记录 CSP 控制台、隐私文案版本与回退截图。',
        '第三方失败不能拖垮核心站点',
      ],
    ],
  },
  {
    name: h5Name('缓存、压缩与 CDN 静态发布'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '理解 HTTP 状态码、响应头和静态文件哈希，能使用 curl 查看最终 URL 与响应头。',
    goal: '为 HTML 与指纹资源设计不同缓存策略，正确使用 ETag、Cache-Control、压缩和 CDN 失效，验证发布后用户得到新 HTML 且复用未变资源。',
    guidedPractice: '为 `index.html` 与 `app.8f3a1c.js` 分别配置 Cache-Control，用 curl -I 查看 html 可重新验证、带哈希脚本长期缓存；再次请求观察 304/200，修改 HTML 中脚本哈希后刷新页面确认切换资源。',
    independentPractice: '为一个静态企业站写发布流程：构建指纹资源、压缩文本、上传 CDN、先发资源后发 HTML、清首页缓存并跑冒烟；模拟回滚到上一版 HTML，验证旧资源仍可访问。',
    commonErrors: [
      '对 HTML 设置长期 immutable，发布后用户持续拿到引用旧脚本的页面。',
      '对未带内容哈希的 JS/CSS 设置一年缓存，修复版本无法及时被用户获取。',
    ],
    sourceRefs: [
      'MDN: HTTP caching. https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching',
      'web.dev: HTTP cache. https://web.dev/articles/http-cache',
      'MDN: Content-Encoding. https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Encoding',
    ],
    steps: [
      [
        '按资源可变性设置缓存',
        'HTML 是发布入口，通常使用 `Cache-Control: no-cache` 或较短 max-age，让浏览器每次重新验证；文件名含内容哈希的 JS、CSS、字体可设 `public,max-age=31536000,immutable`，内容变化即换 URL。失败边界是 HTML 长期缓存而资源名不变、API JSON 被当静态资源缓存、同一 URL 内容跨用户变化；验证动作是 curl -I 检查 Cache-Control、ETag 与 Vary，发布测试版后观察浏览器是否重新请求 HTML 并取得新哈希。',
        '入口文件与指纹资源策略不同',
      ],
      [
        'ETag 与 Last-Modified 支撑验证',
        'ETag 用实体标识支持 If-None-Match，Last-Modified 支持 If-Modified-Since；服务器可返回 304 而不传输正文。强 ETag 表示字节一致，弱 ETag 允许语义等价。失败边界是 CDN 压平 ETag 导致频繁失效、压缩前后 ETag 混用、日期精度不足；验证动作是 curl 首次保存 ETag，再带 If-None-Match 请求检查 304 与空正文，并比较边缘节点响应头是否一致。',
        '304 也要有可比较的实体标识',
      ],
      [
        '压缩由内容类型与协商决定',
        '文本 HTML、CSS、JS、JSON 可用 Brotli 或 gzip，图片视频通常已压缩，不应重复追求文本压缩；客户端发送 Accept-Encoding，服务器返回 Content-Encoding 与 Vary: Accept-Encoding。失败边界是代理压缩后长度或 ETag 未更新、服务器错误声明 br、二进制资源重复压缩；验证动作是用 curl 带 `Accept-Encoding: br,gzip` 查看响应头和字节数，解压前后哈希比较内容一致，并在浏览器 Network 查看最终 transferred size。',
        '压缩要协商且内容保持一致',
      ],
      [
        'CDN 发布顺序保护版本一致性',
        '静态发布先上传带新哈希的资源，确认边缘可取回，再发布引用新哈希的 HTML；这样缓存旧 HTML 的客户端仍可找到旧资源。回滚需要旧 HTML 与旧资源同时保留，CDN 失效只针对可变入口，不宜全量清空指纹资源。失败边界是 HTML 提前指向尚未传播的脚本、只清一个边缘区域、供应商自动清除旧版本；验证动作是从不同地区或响应头节点请求 HTML 与资源，检查 age、cache status、ETag，并按发布单执行首次访问冒烟。',
        '资源先于入口发布可降低版本断裂',
      ],
      [
        '用真实缓存状态验收发布',
        '发布后从无缓存、已有缓存和 CDN 命中三种状态访问页面，确认 HTML 采用新版本、哈希资源命中且内容正确、405/404 回退没有误缓存。失败边界是本地刷新绕过缓存、开发服务器没有 CDN 头、旧 Service Worker 继续返回旧 HTML；验证动作是记录 curl 原始响应头、浏览器 Application Cache Storage、Network cache 状态和三页冒烟结果，必要时注销旧 Service Worker 后复测。',
        '缓存策略要在三种客户端状态验证',
      ],
    ],
  },
  {
    name: h5Name('Web Vitals、真实用户监控与回归'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能使用 Performance 面板和 Network 分析页面加载，并理解生产设备与实验室环境存在差异。',
    goal: '解释 LCP、CLS、INP 与 TTFB 的用户体验含义，使用 PerformanceObserver 和 web-vitals 采集真实样本，建立分位数、维度与回归门槛而不是只看平均值。',
    guidedPractice: '用 PerformanceObserver 监听 largest-contentful-paint、layout-shift 与 event timing，在本地页面执行导航、点击筛选和滚动图片，记录 LCP 元素、CLS 累计值与交互延迟样本；再用 web-vitals 库对照字段名。',
    independentPractice: '为一个企业站设计 RUM 事件：采集 TTFB、LCP、CLS、INP、navigationType、页面模板和设备分桶，限制采样与隐私；从测试流量生成一个小样本报表，并设置 P75 回归报警阈值。',
    commonErrors: [
      '只记录页面加载结束时的单一数字，忽略用户持续交互产生的 INP 与布局偏移。',
      '用内网高速设备平均值代表所有用户，缺少移动设备、地区与缓存状态分桶。',
    ],
    sourceRefs: [
      'web.dev: Web Vitals. https://web.dev/articles/vitals',
      'MDN: PerformanceObserver. https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver',
      'Chrome for Developers: Core Web Vitals workflow. https://developer.chrome.com/docs/devtools/performance/overview',
    ],
    steps: [
      [
        '先解释四个指标',
        'TTFB 从导航请求到响应首字节，反映网络与后端等待；LCP 表示视口内最大内容元素完成呈现的时间；CLS 汇总意外布局偏移；INP 关注用户交互从输入到下一帧呈现的最长响应。指标不是单一加载时间。失败边界是把 FCP 当 LCP、把图片加载完成时间误当呈现时间、把首屏测试当全天交互；验证动作是在 Performance 面板定位具体 entry，记录 element、startTime、value 与页面任务，并区分实验环境与真实用户数据。',
        '每个指标回答不同体验问题',
      ],
      [
        'PerformanceObserver 捕获条目',
        '使用 `PerformanceObserver` 的 entryTypes 或 type 监听 paint、largest-contentful-paint、layout-shift 与 event timing；某些条目需要 buffered:true 才能补收初始化前的数据。事件处理中避免重计算，只聚合必要字段。失败边界是浏览器不支持某条目导致异常中断、页面隐藏后 CLS 继续累计未处理、observer 创建太晚漏样本；验证动作是 Console 输出各 entry 的 entryType、duration 与来源元素，刷新、切后台和恢复后核对样本是否仍合理。',
        '采集代码本身不能改变页面时序',
      ],
      [
        '上报使用分位数与维度',
        'RUM 样本至少包含模板、设备类别、地区、导航类型、缓存或版本与指标值，报表看 P75 或 P95 而非只看均值；采样要控制体积和隐私，避免 URL 查询中的个人信息。sendBeacon 或 fetch keepalive 可在离开页面时发送小负载。失败边界是无界事件量拖慢页面、URL 直接进日志泄露搜索词、平均值掩盖慢设备长尾；验证动作是检查请求大小与采样率，抽样匹配页面版本，按设备与模板分组比较同一周期。',
        '真实用户指标要能定位到用户群体',
      ],
      [
        '建立预算与回归报警',
        '为 LCP、CLS、INP 设置团队预算和持续窗口，例如按周 P75 超出阈值或某模板显著回退时报警；报警要关联构建版本与责任人，避免单次小样本触发噪声。实验室 Lighthouse 用于开发诊断，字段 RUM 用于验证真实体验。失败边界是只看单页不分模板、阈值过松长期不行动、发布后样本混新旧版本；验证动作是保存基线与置信样本量，模拟一次图片变重导致的 LCP 回归，确认报警能定位版本与页面模板。',
        '性能门槛要绑定版本与页面模板',
      ],
      [
        '从指标回到可解释资源',
        '发现回退后根据 LCP element 和资源 URL 查 Network，根据 CLS 来源查插入节点与尺寸，根据 INP 长任务查主线程脚本；修复后用同一设备网络条件回归。失败边界是只替换压缩算法却没有解决大图、因跟踪脚本阻塞交互却删除业务功能、修复后没有清理旧观测；验证动作是保存 Performance trace、资源瀑布、源码定位与修复前后 P75 样本，回归达到门槛后才关闭问题。',
        '每个指标都要追到具体页面机制',
      ],
    ],
  },
  {
    name: h5Name('企业官网毕业项目与运行手册'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '已完成语义页面、表单、媒体、可访问性、SEO 和资源性能课程，能独立使用本地服务器、DevTools 与命令行验证。',
    goal: '从空目录交付一个可发布的企业官网，形成页面结构、内容元数据、无障碍、性能预算、缓存发布、监控和回滚证据，并能让他人按手册独立验收。',
    guidedPractice: '按首页、服务、案例、关于、联系五类页面搭出站点，建立共享语义骨架与每页唯一 title/h1；为联系表单、响应式主图、视频或图表、sitemap 和可访问导航编写验收项，并在本地服务器逐项检查。',
    independentPractice: '完成企业官网毕业交付：生成指纹资源与 sitemap，配置缓存、CSP 与压缩，记录 LCP/CLS/INP 字段预算；模拟一次图片回退、表单 500 和错误发布，执行恢复并提交不含密钥的运行手册。',
    commonErrors: [
      '只完成视觉首页，没有深层页、错误页、sitemap、canonical 与可回滚发布记录。',
      '运行手册只写启动命令，没有负责人、阈值、日志位置、缓存处理和恢复验证。',
    ],
    sourceRefs: [
      'W3C WCAG 2.2 Quick Reference. https://www.w3.org/WAI/WCAG22/quickref/',
      'web.dev: Core Web Vitals. https://web.dev/articles/vitals',
      'Google Search Central: SEO starter guide. https://developers.google.com/search/docs/fundamentals/seo-starter-guide',
    ],
    steps: [
      [
        '冻结页面与内容契约',
        '毕业项目先列 URL、页面类型、目标任务、title、h1、canonical、主要媒体和表单端点；所有页面使用同一语义骨架，但联系方式、隐私、错误页和深层链接必须真实可达。内容模型中的公司名、服务、日期与价格只保留单一来源。失败边界是页面矩阵与实现不一致、临时占位文案进入生产、分享图与正文不符；验证动作是逐 URL 访问并导出 title/h1/canonical 对照表，检查 sitemap 与站内链接集合完全覆盖。',
        '先锁定公开页面与内容身份',
      ],
      [
        '把结构与可访问性做成模板约束',
        '共享模板应稳定提供 header、带名称的 nav、唯一 main、footer、跳转链接和语言声明；表单模板包含标签、错误、字段分组与提交状态。组件新增时先验证语义和键盘，再交给页面组合。失败边界是模板复制导致多个 main、空链接、重复 id、ARIA 名称随页面变化失效；验证动作是新页面创建后自动跑 html-validate 与 axe，并使用键盘完成导航、表单和退出流程，保存焦点记录。',
        '模板让正确结构成为默认选择',
      ],
      [
        '建立媒体、SEO 与性能预算',
        '为每类页面设置最大首页请求数、HTML/CSS/JS/字体体积、LCP 资源、图片候选和最差字段 P75；主图使用响应式图片与尺寸占位，视频有字幕和文字稿，meta/OG/JSON-LD 从内容模型生成。失败边界是首屏图片未压缩、每个详情页都预加载视频、结构化数据与页面价格不一致；验证动作是在慢速移动环境采集 LCP、CLS、INP 与请求列表，对匿名响应运行元数据和结构化数据验证器。',
        '性能与索引质量进入发布门槛',
      ],
      [
        '发布流程保护版本与权限',
        '构建产物使用内容哈希，先发布静态资源再发布 HTML；HTML 使用重新验证缓存，指纹资源长期缓存，文本启用 Brotli/gzip，CSP 限制脚本与连接域。部署凭据只存在 CI 秘密中，发布单记录版本、命令、验证 URL 和回滚目标。失败边界是手动上传漏文件、CDN 只清首页、CSP 让关键脚本全部被拦、秘密写进前端源码；验证动作是在预发布环境走完整发布、检查响应头与 Console、从不同缓存状态访问页面，再从备份恢复上一版 HTML。',
        '发布必须可重复且可回滚',
      ],
      [
        '监控、事故与毕业验收闭环',
        '上线后用 RUM 分位数与可用性检查验证真实用户，日志记录页面版本、错误和关键请求结果；出现 LCP 回退、表单失败或 CSP 拦截时按运行手册停止发布、恢复版本、清理缓存并复测。最终验收由另一位学习者按手册完成浏览、联系、移动、键盘与匿名抓取五项任务。失败边界是只看到页面能开就宣布完成、告警无人负责、回滚后没有验证旧资源；验证动作是保存验收记录、三次关键任务、发布与回滚截图、指标基线及剩余风险清单，全部可重放后才结束项目。',
        '最终交付以他人可复现为标准',
      ],
    ],
  },
];

const HTML5_H0_EXAMPLES: HtmlStageExamples = [
  [
    htmlExample(
      '用状态行与 Content-Type 判断是否进入文档解析',
      'PowerShell',
      `$response = Invoke-WebRequest http://127.0.0.1:4173/ -Method Head
$response.StatusCode
$response.Headers['Content-Type']
$length = $response.Headers['Content-Length'][0]
"bytes=$length renderable=$($response.Headers['Content-Type'][0] -match '^text/html')"`,
      `200
text/html; charset=utf-8
bytes=1842 renderable=True
边界：若 Content-Type 为 application/octet-stream，即使状态 200 也会触发下载。`,
    ),
    htmlExample(
      '比较源码与解析器修正后的 DOM',
      'HTML + JavaScript',
      `<table id="report"><tr><td>收入</td></tr><p id="leak">说明</p></table>
<script>
  const table = document.querySelector('#report');
  const leak = document.querySelector('#leak');
  console.log({
    tableChildren: [...table.children].map((node) => node.tagName),
    paragraphParent: leak.parentElement.tagName,
    characterSet: document.characterSet
  });
</script>`,
      `{ tableChildren: [ 'TBODY' ], paragraphParent: 'BODY', characterSet: 'UTF-8' }
边界：解析器会把 p 移出 table，但不会修复本应表达的“表格说明”含义。`,
    ),
    htmlExample(
      '用 DOMContentLoaded 与 paint 条目区分节点和执行时间',
      'HTML + Performance API',
      `<script>
  const events = [];
  document.addEventListener('DOMContentLoaded', () => {
    events.push({ event: 'DOMContentLoaded', nodes: document.querySelectorAll('*').length });
  });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) events.push({ event: entry.name, start: entry.startTime });
  }).observe({ type: 'paint', buffered: true });
  window.addEventListener('load', () => console.table(events));
</script>
<main><h1>首屏实验</h1><img src="hero.webp" width="640" height="360" alt="产品面板"></main>`,
      `┌─────────┬──────────────────┬───────┐
│ event   │ DOMContentLoaded │ ...   │
│ first-contentful-paint | 186.4 ms | ... │
└─────────┴──────────────────┴───────┘
边界：节点已出现不代表图片和字体已完成，绘制时间仍需与资源瀑布对照。`,
    ),
    htmlExample(
      '故意返回错误 MIME 并记录下载行为',
      'PowerShell + HTML',
      `@'
from http.server import BaseHTTPRequestHandler, HTTPServer
class Broken(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b"<!doctype html><title>MIME probe</title><h1>不会进入 XML 解析</h1>"
        self.send_response(200)
        self.send_header("Content-Type", "application/xhtml+xml")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
HTTPServer(("127.0.0.1", 4180), Broken).serve_forever()
'@ | Set-Content mime-probe.py
python mime-probe.py`,
      `Serving HTTP on 127.0.0.1 port 4180 ...
浏览器可显示 XML 解析错误或下载文件，而 view-source 仍能看到完整 200 响应。
边界：容错 HTML 模式不会接管被声明成 XML 的文档。`,
    ),
    htmlExample(
      '把请求头、字符集和关键节点保存成同一份检查证据',
      'PowerShell + HTML',
      `@'
<!doctype html>
<html lang="zh-CN"><head>
  <meta charset="utf-8">
  <title>解析检查页</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head><body>
  <main id="probe"><h1>可重复检查</h1><p data-field="status">ready</p></main>
  <script>
    window.probe = () => ({
      compatMode: document.compatMode,
      charset: document.characterSet,
      title: document.title,
      heading: document.querySelector('h1')?.textContent
    });
  </script>
</body></html>
'@ | Set-Content index.html
npx html-validate index.html
curl.exe -sSI http://127.0.0.1:4173/ | Select-String 'HTTP/|Content-Type'`,
      `index.html: 0 errors
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
浏览器执行 probe() 后应返回 CSS1Compat、UTF-8 与“可重复检查”。`,
    ),
  ],
  [
    htmlExample(
      '用 compatMode 验证 doctype 是否真正生效',
      'HTML + JavaScript',
      `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>doctype 实验室</title></head>
<body>
  <main><h1>渲染模式</h1><output id="result"></output></main>
  <script>
    document.querySelector('#result').textContent = JSON.stringify({
      mode: document.compatMode,
      doctype: document.doctype?.name,
      firstNode: document.documentElement.outerHTML.slice(0, 24)
    });
  </script>
</body>
</html>`,
      `{"mode":"CSS1Compat","doctype":"html","firstNode":"<html lang=\"zh-CN\"><head>"}
边界：doctype 前出现非空文本会破坏标准模式判断。`,
    ),
    htmlExample(
      '读取 head 的身份、字符集和资源基准地址',
      'HTML + JavaScript',
      `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>年度报告</title>
  <meta name="description" content="2026 年产品与服务质量报告">
  <base href="https://example.com/reports/">
  <link rel="stylesheet" href="report.css">
</head>
<body><main><h1>年度报告</h1></main></body>
</html>
<script>
  console.table({ title: document.title, charset: document.characterSet, base: document.baseURI });
</script>`,
      `title      年度报告
charset    UTF-8
base       https://example.com/reports/
边界：base 之后解析的相对样式 URL 会指向 /reports/report.css。`,
    ),
    htmlExample(
      '检查浏览器自动补出的 html、head 与 body',
      'HTML + JavaScript',
      `<title>省略骨架</title>
<p id="summary">浏览器会补出文档骨架。</p>
<script>
  const summary = document.querySelector('#summary');
  console.log({
    root: document.documentElement.tagName,
    headParent: document.head.parentElement?.tagName,
    bodyParent: document.body.parentElement?.tagName,
    paragraphParent: summary.parentElement.tagName
  });
</script>`,
      `{ root: 'HTML', headParent: 'HTML', bodyParent: 'HTML', paragraphParent: 'BODY' }
边界：自动修复只保证树可解析，不保证作者源码的层级和可维护性。`,
    ),
    htmlExample(
      '在真实移动视口记录 width 与设备宽度',
      'HTML + PowerShell',
      `@'
<meta name="viewport" content="width=device-width, initial-scale=1">
<main id="probe">
  <h1>视口语义</h1>
  <pre></pre>
</main>
<script>
  const data = {
    innerWidth,
    visualWidth: visualViewport?.width,
    screenWidth: screen.width,
    dpr: devicePixelRatio
  };
  document.querySelector('pre').textContent = JSON.stringify(data, null, 2);
</script>
'@ | Set-Content viewport.html
pnpm dlx serve . -l 4174`,
      `在 390×844 设备仿真中应观察到 innerWidth=390、visualWidth≈390、dpr=3。
边界：user-scalable=no 会阻止缩放，不能用来掩盖横向溢出。`,
    ),
    htmlExample(
      '让验证器和运行中 DOM 各自报告同一问题',
      'PowerShell + HTML',
      `@'
<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>结构验收</title></head>
<body>
  <main id="main"><h1>产品</h1><section><h2>价格</h2></section></main>
  <script>
    console.table({
      h1: document.querySelectorAll('h1').length,
      main: document.querySelectorAll('main').length,
      emptyLinks: [...document.links].filter((a) => !a.textContent.trim()).length
    });
  </script>
</body>
</html>
'@ | Set-Content index.html
npx html-validate index.html`,
      `h1    1
main  1
emptyLinks 0
边界：验证器零错误仍不能证明键盘顺序、标题内容或动态脚本行为正确。`,
    ),
  ],
  [
    htmlExample(
      '从 Accessibility Headings 列表验证标题大纲',
      'HTML + JavaScript',
      `<article aria-labelledby="report-title">
  <h1 id="report-title">季度可靠性报告</h1>
  <section aria-labelledby="availability"><h2 id="availability">可用性</h2><p>99.95%</p></section>
  <section aria-labelledby="incidents"><h2 id="incidents">事故</h2><h3>数据库故障</h3></section>
</article>
<script>
  console.log([...document.querySelectorAll('h1,h2,h3')].map((h) => h.tagName + ':' + h.textContent));
</script>`,
      `[ 'H1:季度可靠性报告', 'H2:可用性', 'H3:数据库故障', 'H2:事故' ]
边界：视觉字号可以另设，标题级别必须保持真实信息层级。`,
    ),
    htmlExample(
      '区分 p 边界与同一段内 br 换行',
      'HTML',
      `<article>
  <h1>门店地址</h1>
  <p>周一至周五 09:00 至 18:00<br>周六 10:00 至 16:00</p>
  <p>节假日安排会提前七天公布。</p>
  <p><strong>注意：</strong><br>最后入场时间为闭店前三十分钟。</p>
</article>`,
      `屏幕阅读器会读到三个段落；前两行营业时间是同一段内的强制换行。
边界：用多个 br 制造段间距会破坏朗读节奏和可维护性。`,
    ),
    htmlExample(
      '检查链接可访问名称是否说明目标',
      'HTML + JavaScript',
      `<nav aria-label="帮助资源">
  <a href="/pricing">查看价格与套餐</a>
  <a href="/security">安全与合规说明</a>
  <a href="/contact">联系销售团队</a>
</nav>
<script>
  const names = [...document.querySelectorAll('nav a')].map((link) => ({
    name: link.textContent.trim(),
    href: new URL(link.href).pathname
  }));
  console.table(names);
</script>`,
      `name                  href
查看价格与套餐        /pricing
安全与合规说明        /security
联系销售团队          /contact
边界：“点击这里”离开上下文后无法说明目标。`,
    ),
    htmlExample(
      '用 width、height 与 alt 预留图片并表达用途',
      'HTML',
      `<figure>
  <img src="dashboard.webp"
       width="960"
       height="540"
       loading="lazy"
       decoding="async"
       alt="运营仪表盘显示本周订单转化率提升 8%">
  <figcaption>本周转化趋势，数据截至 11 月 24 日。</figcaption>
</figure>
<p>图片加载失败时，替代文本仍说明它对报告的作用；宽度和高度预留 16:9 比例。</p>`,
      `Network 中 dashboard.webp 返回 200，图片区域在下载前保持 960×540 比例。
边界：若 alt 只写“图片”，图片失败后用户无法获得任何等价信息。`,
    ),
    htmlExample(
      '按阅读路径联合检查标题、链接与图片失败态',
      'HTML + PowerShell',
      `@'
<main>
  <h1>服务概览</h1>
  <h2>可用性</h2>
  <p>过去三十天可用性为 <strong>99.95%</strong>。</p>
  <a href="/status">查看实时状态页</a>
  <img src="missing.webp" width="320" height="180" alt="过去三十天可用性趋势">
</main>
'@ | Set-Content audit.html
npx html-validate audit.html`,
      `验证器报告缺失 lang、title 或 main 文档骨架时先修复；图片 404 时浏览器显示替代文本。
边界：测试必须覆盖 320px 宽度、键盘 Tab 与图片断网，不只看桌面截图。`,
    ),
  ],
  [
    htmlExample(
      '用 URL 与 baseURI 反推相对地址',
      'HTML + JavaScript',
      `<nav>
  <a id="guide" href="../guide/start.html">开始指南</a>
  <a id="asset" href="/assets/logo.svg">品牌资源</a>
</nav>
<script>
  for (const id of ['guide', 'asset']) {
    const link = document.getElementById(id);
    console.log(id, { href: link.getAttribute('href'), resolved: link.href });
  }
  console.log('baseURI', document.baseURI);
</script>`,
      `guide { href: '../guide/start.html', resolved: 'https://example.com/docs/guide/start.html' }
asset { href: '/assets/logo.svg', resolved: 'https://example.com/assets/logo.svg' }
边界：部署到带子路径的站点时，以 / 开头的地址会离开应用根目录。`,
    ),
    htmlExample(
      '观察目录 URL 的尾斜杠如何改变相对链接',
      'PowerShell + HTML',
      `@'
<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>目录页</title></head>
<body><main><h1>文档目录</h1><a id="next" href="start.html">开始阅读</a></main>
<script>document.body.append(new URL(document.querySelector('#next').href).pathname);</script>
</body></html>
'@ | Set-Content index.html
pnpm dlx serve . -l 4175
curl.exe -sSI http://127.0.0.1:4175/docs`,
      `HTTP/1.1 301 Moved Permanently
Location: /docs/
最终页面中的 start.html 会解析为 /docs/start.html。
边界：直接打开 /docs 与 /docs/ 可能得到不同相对地址，必须检查最终 URL。`,
    ),
    htmlExample(
      '把站点资源按稳定 URL 分区并检查遗漏',
      'PowerShell',
      `New-Item -ItemType Directory -Force site/assets,site/docs,site/legal | Out-Null
Set-Content site/index.html '<a href="/docs/start.html">开始</a>'
Set-Content site/docs/start.html '<a href="/">返回首页</a>'
Set-Content site/legal/privacy.html '<h1>隐私</h1>'
$files = Get-ChildItem site -Recurse -File
$files | ForEach-Object { $_.FullName.Replace((Resolve-Path site).Path, '') }
"total=$($files.Count) html=$(@($files | Where-Object Extension -eq '.html').Count)"`,
      `/index.html
/docs/start.html
/legal/privacy.html
total=3 html=3
边界：目录存在不代表 URL 映射正确，仍需通过 HTTP 请求验证大小写与尾斜杠。`,
    ),
    htmlExample(
      '对比 file 协议与 HTTP 下的资源请求',
      'HTML + JavaScript',
      `<main>
  <h1>协议能力检查</h1>
  <button id="probe">读取数据</button>
  <pre id="result"></pre>
</main>
<script>
  const result = document.querySelector('#result');
  result.textContent = location.protocol + ' origin=' + location.origin;
  document.querySelector('#probe').addEventListener('click', async () => {
    try {
      const response = await fetch('./data.json');
      result.textContent = 'fetch=' + response.status;
    } catch (error) {
      result.textContent = 'fetch failed: ' + error.message;
    }
  });
</script>`,
      `file: origin=null，fetch 通常因 CORS 或本地文件限制失败。
http://127.0.0.1:4175 origin=http://127.0.0.1:4175，fetch 返回 200。
边界：file 页面不能模拟真实站点的路径、缓存、CORS 和 HTTP 头。`,
    ),
    htmlExample(
      '用 curl 同时核对路径状态码与响应类型',
      'PowerShell',
      `$urls = @(
  'http://127.0.0.1:4175/',
  'http://127.0.0.1:4175/docs/start.html',
  'http://127.0.0.1:4175/docs/Start.html',
  'http://127.0.0.1:4175/assets/logo.svg'
)
foreach ($url in $urls) {
  $r = Invoke-WebRequest $url -SkipHttpErrorCheck
  [pscustomobject]@{ url=$url; status=$r.StatusCode; type=$r.Headers['Content-Type'][0] }
} | Format-Table -AutoSize`,
      `200 text/html
200 text/html
404 text/html
404 text/plain
边界：大小写错误在本地磁盘看似接近，通过 HTTP 请求会立即暴露 404。`,
    ),
  ],
  [
    htmlExample(
      '在 Elements 修改 DOM 后对照 view-source',
      'HTML + JavaScript',
      `<main id="app"><h1>源文件标题</h1></main>
<script>
  document.querySelector('h1').textContent = '脚本修改后的标题';
  console.log({
    liveText: document.querySelector('h1').textContent,
    sourceSignature: document.documentElement.outerHTML.includes('脚本修改后的标题')
  });
</script>`,
      `{ liveText: '脚本修改后的标题', sourceSignature: true }
Elements 显示实时代码，view-source 只显示服务器返回的原始 HTML。
边界：把 Elements 中修改复制回源文件后必须刷新确认，否则只是临时 DOM。`,
    ),
    htmlExample(
      '从 PerformanceResourceTiming 找出失败或超大的资源',
      'HTML + JavaScript',
      `<script>
  window.addEventListener('load', () => {
    const resources = performance.getEntriesByType('resource').map((entry) => ({
      name: new URL(entry.name).pathname,
      type: entry.initiatorType,
      transfer: entry.transferSize,
      duration: Math.round(entry.duration)
    }));
    console.table(resources.filter((item) => item.transfer > 100000 || item.duration > 500));
  });
</script>
<img src="hero-large.jpg" alt="大图"><script src="analytics.js"></script>`,
      `pathname              type  transfer duration
/hero-large.jpg       img   842100   734
/analytics.js         script 186400  612
边界：跨域资源可能缺少详细 timing，仍需在 Network 中查看状态和响应头。`,
    ),
    htmlExample(
      '在 Console 固定查询范围并记录 DOM 节点',
      'JavaScript',
      `const button = document.querySelector('[data-action="save"]');
if (!(button instanceof HTMLButtonElement)) {
  throw new Error('save action is not a native button');
}
const snapshot = {
  tag: button.tagName,
  type: button.type,
  disabled: button.disabled,
  accessibleText: button.textContent.trim(),
  form: button.form?.id ?? null
};
console.table(snapshot);
button.dataset.selected = 'true';`,
      `tag             BUTTON
type            submit
disabled        false
accessibleText  保存
form            profile-form
边界：querySelector 返回 null 时继续读属性会中断脚本，先断言元素身份。`,
    ),
    htmlExample(
      '用 html-validate 捕获重复 id 与非法嵌套',
      'PowerShell + HTML',
      `@'
<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>验证器实验</title></head>
<body>
  <main id="content">
    <h1 id="title">标题</h1>
    <p id="title">重复 ID</p>
    <button><a href="/next">非法嵌套</a></button>
  </main>
</body>
</html>
'@ | Set-Content invalid.html
npx html-validate invalid.html
Write-Output "exit=$LASTEXITCODE"`,
      `Duplicate id "title"
Element <a> must not be nested inside <button>
exit=1
边界：验证器定位静态结构问题，运行时焦点和网络仍要人工检查。`,
    ),
    htmlExample(
      '把一次故障整理成可重复的最小页面与修复断言',
      'HTML + JavaScript',
      `<form id="newsletter" novalidate>
  <label for="email">工作邮箱</label>
  <input id="email" name="email" type="email" required>
  <p id="error" role="alert"></p>
  <button type="submit">订阅</button>
</form>
<script>
  const form = document.querySelector('#newsletter');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = form.elements.namedItem('email');
    document.querySelector('#error').textContent = email.validity.valid ? '' : '请输入有效邮箱';
    console.log({ valid: email.validity.valid, focused: document.activeElement.id });
  });
</script>`,
      `空值提交后输出 { valid: false, focused: 'email' }，错误文本通过 role=alert 暴露。
边界：修复后还要确认有效邮箱能提交、错误能清除、键盘流程不中断。`,
    ),
  ],
  [
    htmlExample(
      '先把页面、URL 与导航边写成可检查清单',
      'JSON',
      `[
  {"path":"/","title":"首页","primaryAction":"浏览服务"},
  {"path":"/services/","title":"服务","primaryAction":"比较方案"},
  {"path":"/contact/","title":"联系","primaryAction":"提交咨询"},
  {"path":"/thanks/","title":"提交成功","primaryAction":"返回首页"}
]
`,
      `四个 URL 都有独立 title 与主要任务；首页、服务和联系页必须进入主导航。
边界：成功页不应出现在主导航，且不能允许直接重复提交咨询。`,
    ),
    htmlExample(
      '共享语义骨架但给每页独立 title 与主标题',
      'HTML',
      `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>服务与方案 | 星河咨询</title>
  <meta name="description" content="比较交付范围、周期与支持方式。"></head>
<body>
  <header><a href="/" aria-label="星河咨询首页">星河咨询</a></header>
  <nav aria-label="主导航"><a href="/services/" aria-current="page">服务</a><a href="/contact/">联系</a></nav>
  <main><h1>服务与方案</h1><p>按团队规模选择交付方式。</p></main>
  <footer><a href="/privacy/">隐私</a></footer>
</body>
</html>`,
      `document.title 为“服务与方案 | 星河咨询”，h1 为“服务与方案”，nav 中只有服务标为当前页。
边界：模板共享 header/nav/footer，但 title、description、h1 与主操作必须逐页不同。`,
    ),
    htmlExample(
      '用 aria-current 同时表达可见与辅助技术状态',
      'HTML + CSS',
      `<nav aria-label="主导航">
  <a href="/" >首页</a>
  <a href="/services/" aria-current="page">服务</a>
  <a href="/contact/">联系</a>
</nav>
<style>
  nav a[aria-current="page"] {
    font-weight: 700;
    text-decoration-thickness: 3px;
    text-underline-offset: 0.35em;
  }
</style>`,
      `鼠标和屏幕阅读器都能识别“服务”是当前页，视觉状态不只靠颜色。
边界：不要用 aria-current=true 代替精确值 page，也不要让当前页链接仍触发整页导航。`,
    ),
    htmlExample(
      '联系信息使用真实链接与可理解的图片替代文本',
      'HTML',
      `<section aria-labelledby="contact-title">
  <h2 id="contact-title">联系销售</h2>
  <img src="team.webp" width="480" height="320" alt="星河咨询销售与方案团队">
  <address>
    电话：<a href="tel:+861012345678">010-1234-5678</a><br>
    邮箱：<a href="mailto:sales@example.com">sales@example.com</a>
  </address>
</section>`,
      `电话和邮箱都是可激活链接，address 元素表达联系方式，图片断网时仍说明团队用途。
边界：图片中若包含唯一联系方式而没有文字副本，关闭图片后会丢失信息。`,
    ),
    htmlExample(
      '在本地 HTTP 服务下巡检三页导航和资源状态',
      'PowerShell',
      `$base = 'http://127.0.0.1:4173'
$paths = @('/', '/services/', '/contact/')
foreach ($path in $paths) {
  $response = Invoke-WebRequest ($base + $path) -SkipHttpErrorCheck
  $html = $response.Content
  [pscustomobject]@{
    path = $path
    status = $response.StatusCode
    title = [regex]::Match($html, '<title>(.*?)</title>').Groups[1].Value
    h1 = [regex]::Match($html, '<h1[^>]*>(.*?)</h1>').Groups[1].Value
  }
} | Format-Table -AutoSize`,
      `/            200 首页 | 星河咨询          让复杂方案更清晰
/services/   200 服务与方案 | 星河咨询    服务与方案
/contact/    200 联系星河咨询               联系销售
边界：页面可达不等于交互完成，还要实测导航、表单和移动断点。`,
    ),
  ],
];

const HTML5_H1_EXAMPLES: HtmlStageExamples = [
  [
    htmlExample(
      '用按钮统计每个地标出现的次数',
      'HTML + JavaScript',
      `<header data-region="masthead">品牌与全局入口</header>
<nav aria-label="主导航"><a href="/">首页</a></nav>
<main id="main"><h1>企业主页</h1><p>唯一主内容区。</p></main>
<footer>版权与隐私链接</footer>
<script>
  const landmarks = ['header', 'nav', 'main', 'footer'];
  console.table(landmarks.map((tag) => ({ tag, count: document.querySelectorAll(tag).length })));
</script>`,
      `header 1
nav    1
main   1
footer 1
边界：嵌套 article 内可以再有 header/footer，但整页 main 必须保持唯一。`,
    ),
    htmlExample(
      '给多个导航分别提供可区分名称',
      'HTML',
      `<header>
  <nav aria-label="主导航"><a href="/products/">产品</a><a href="/pricing/">价格</a></nav>
  <nav aria-label="账户导航"><a href="/account/">账户</a><a href="/logout">退出</a></nav>
</header>
<main><h1>产品列表</h1></main>
<footer>
  <nav aria-label="页脚导航"><a href="/privacy/">隐私</a><a href="/terms/">条款</a></nav>
</footer>`,
      `辅助技术导航地标列表会出现“主导航”“账户导航”“页脚导航”三个不同名称。
边界：多个 nav 都叫“导航”会让用户无法判断应跳到哪一组链接。`,
    ),
    htmlExample(
      '验证 main 唯一且包含页面主标题',
      'HTML + JavaScript',
      `<a class="skip" href="#main">跳到主要内容</a>
<header><a href="/">企业站</a></header>
<main id="main" tabindex="-1">
  <h1>服务目录</h1>
  <section aria-labelledby="consulting"><h2 id="consulting">咨询服务</h2></section>
</main>
<script>
  const main = document.querySelector('main');
  console.log({
    mainCount: document.querySelectorAll('main').length,
    mainHasH1: Boolean(main?.querySelector('h1')),
    skipTargetExists: Boolean(document.querySelector('.skip')?.hash === '#main')
  });
</script>`,
      `{ mainCount: 1, mainHasH1: true, skipTargetExists: true }
边界：先在 header 内塞 main 再嵌套 article/main，会让跳转目标与页面主线混乱。`,
    ),
    htmlExample(
      '把页脚内容放在最近的分节上下文',
      'HTML',
      `<main>
  <article aria-labelledby="release-title">
    <h2 id="release-title">版本 4.2 发布说明</h2>
    <p>新增批量导出与故障回滚。</p>
    <footer>发布于 <time datetime="2026-11-24">11 月 24 日</time></footer>
  </article>
</main>
<footer>
  <p>星河科技 · <a href="/privacy/">隐私政策</a></p>
</footer>`,
      `article 内页脚表达这篇发布说明的作者与日期，页面最外层页脚表达全站信息。
边界：不要因为 footer 在底部就把所有相关信息都塞进全站页脚。`,
    ),
    htmlExample(
      '用真实导航任务回归语义骨架',
      'HTML + JavaScript',
      `<header><a id="home" href="/">首页</a></header>
<nav aria-label="主导航">
  <a href="/products/">产品</a>
  <a href="/pricing/" aria-current="page">价格</a>
</nav>
<main id="main"><h1>价格</h1><a id="contact" href="/contact/">联系销售</a></main>
<footer><a href="/privacy/">隐私</a></footer>
<script>
  const current = document.querySelector('[aria-current="page"]');
  console.log([...document.querySelectorAll('a')].map((a) => a.textContent.trim()));
  console.log('current=', current?.textContent);
</script>`,
      `[ '首页', '产品', '价格', '联系销售', '隐私' ]
current= 价格
边界：链接可点不代表语义正确，还要验证跳转后焦点、标题和当前页状态。`,
    ),
  ],
  [
    htmlExample(
      '让一篇文章脱离首页后仍能独立理解',
      'HTML',
      `<article aria-labelledby="post-title">
  <header>
    <h2 id="post-title">如何排查支付回调延迟</h2>
    <p>作者：周宁 · <time datetime="2026-11-24">2026-11-24</time></p>
  </header>
  <p>从回调队列、幂等键和重试时间线定位延迟来源。</p>
  <footer><a href="/topics/payments/">更多支付主题</a></footer>
</article>`,
      `文章包含独立标题、作者、发布时间、正文和主题链接，可被订阅器或搜索结果单独复用。
边界：只有一句“阅读更多”且依赖页面外部标题的摘要，不应标成完整 article。`,
    ),
    htmlExample(
      '为 section 添加可命名主题并避免空标题',
      'HTML + JavaScript',
      `<main>
  <h1>服务等级</h1>
  <section aria-labelledby="support">
    <h2 id="support">支持范围</h2>
    <p>工作日两小时内响应。</p>
  </section>
  <section aria-labelledby="sla">
    <h2 id="sla">SLA</h2>
    <p>关键故障季度可用性目标为 99.95%。</p>
  </section>
</main>
<script>
  console.table([...document.querySelectorAll('section')].map((section) => ({
    name: section.getAttribute('aria-labelledby'),
    heading: section.querySelector('h2')?.textContent
  })));
</script>`,
      `name     heading
support  支持范围
sla      SLA
边界：只有样式分组而没有标题的区块通常不需要 section，使用 div 更准确。`,
    ),
    htmlExample(
      '把相关链接区标成 aside 而不是任意侧栏',
      'HTML',
      `<main>
  <article aria-labelledby="guide-title">
    <h1 id="guide-title">发布流程</h1>
    <p>先冻结版本，再构建、验证、发布和观察。</p>
  </article>
  <aside aria-labelledby="related-title">
    <h2 id="related-title">相关运行手册</h2>
    <ul><li><a href="/runbooks/rollback/">回滚</a></li><li><a href="/runbooks/cache/">缓存清理</a></li></ul>
  </aside>
</main>`,
      `aside 为正文补充相关运行手册；如果它被样式移到左侧，语义仍是补充内容。
边界：主导航或用户唯一主要任务不能因为视觉位置靠边就标成 aside。`,
    ),
    htmlExample(
      '用 closest 检查嵌套文章各自的标题上下文',
      'HTML + JavaScript',
      `<main>
  <article id="outer"><h1>季度报告</h1>
    <section><h2>区域表现</h2>
      <article id="inner"><h3>亚太市场</h3><p>收入增长 12%。</p></article>
    </section>
  </article>
</main>
<script>
  for (const article of document.querySelectorAll('article')) {
    console.log(article.id, article.querySelector('h1,h2,h3,h4,h5,h6')?.textContent);
  }
</script>`,
      `outer 季度报告
inner 亚太市场
边界：嵌套 article 会形成新的分节上下文，标题级别和摘要必须在该边界内自洽。`,
    ),
    htmlExample(
      '把文章卡片放入新页面验证复用边界',
      'HTML',
      `<article class="case-study">
  <h2>制造业库存预测</h2>
  <p>用需求信号与供应约束把缺货率降低 18%。</p>
  <dl>
    <dt>周期</dt><dd>十二周</dd>
    <dt>角色</dt><dd>数据工程与运营团队</dd>
  </dl>
  <a href="/cases/manufacturing/">阅读完整案例</a>
</article>
<p>复用测试：把整个 article 放到独立详情页，标题、数据和链接仍无需外部上下文。</p>`,
      `复制 article 到独立页面后仍能说明客户问题、结果、周期和责任范围。
边界：若缺少客户名或“本案例”指向页面外部信息，说明边界仍未完成。`,
    ),
  ],
  [
    htmlExample(
      '从任务清单生成 h1-h3 层级',
      'HTML',
      `<main>
  <h1>客户成功计划</h1>
  <section><h2>上线准备</h2>
    <h3>账号与权限</h3><p>导入成员并校验角色。</p>
    <h3>数据迁移</h3><p>抽样核对字段与附件。</p>
  </section>
  <section><h2>运营交接</h2><h3>培训</h3><p>完成管理员与支持团队演练。</p></section>
</main>`,
      `标题大纲呈现“客户成功计划 → 上线准备/运营交接 → 下级任务”的任务层级。
边界：不要先按 24px、20px、18px 决定 h2/h3，字号最后由设计 Token 决定。`,
    ),
    htmlExample(
      '检查空标题与不合理的级别跳跃',
      'HTML + JavaScript',
      `<main id="outline">
  <h1>安全白皮书</h1>
  <h3>身份认证</h3>
  <h2></h2>
  <h2>数据加密</h2>
</main>
<script>
  const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  const issues = levels.flatMap((heading, index) => {
    const level = Number(heading.tagName.slice(1));
    const previous = index ? Number(levels[index - 1].tagName.slice(1)) : level;
    return [!heading.textContent.trim() && 'empty', level - previous > 1 && 'skip'].filter(Boolean);
  });
  console.log({ total: levels.length, issues });
</script>`,
      `{ total: 4, issues: [ 'skip', 'empty' ] }
边界：h1 后直接 h3 会让大纲断裂，空 h2 则应删除，而不是用 CSS 隐藏。`,
    ),
    htmlExample(
      '比较视觉顺序与 DOM 阅读顺序',
      'HTML + CSS + JavaScript',
      `<main>
  <h1>结算</h1>
  <section id="summary"><h2>订单摘要</h2><p>总计 ¥299</p></section>
  <form id="payment"><h2>支付信息</h2><button>支付</button></form>
</main>
<style>main{display:grid}.summary-last #summary{order:2}</style>
<script>
  const order = [...document.querySelectorAll('h1,h2')].map((node) => node.textContent);
  console.log({ domOrder: order, paymentBeforeSummary: order.indexOf('支付信息') < order.indexOf('订单摘要') });
</script>`,
      `{ domOrder: [ '结算', '订单摘要', '支付信息' ], paymentBeforeSummary: false }
边界：CSS order 可以改变视觉位置，但 Tab、朗读和复制仍按 DOM 顺序执行。`,
    ),
    htmlExample(
      '让可跳转标题拥有明确链接名称和焦点目标',
      'HTML + JavaScript',
      `<main>
  <h2 id="billing"><a href="#billing">账单与发票设置</a></h2>
  <section><h2 id="security"><a href="/guides/security/">安全指南</a></h2></section>
  <script>
    const links = [...document.querySelectorAll('h2 a')];
    console.table(links.map((link) => ({ text: link.textContent, target: link.getAttribute('href') })));
    location.hash = 'billing';
    console.log('hashTarget=', document.querySelector(':target')?.id);
  </script>
</main>`,
      `text              target
账单与发票设置    #billing
安全指南          /guides/security/
hashTarget= billing
边界：给 h2 加 onclick 却不提供可聚焦链接，会让键盘用户无法复制或跳转。`,
    ),
    htmlExample(
      '在三个视口核对同一标题主线',
      'PowerShell + HTML',
      `@'
<main id="outline">
  <h1>产品迁移指南</h1>
  <h2>准备</h2><h3>导出旧数据</h3>
  <h2>切换</h2><h3>验证新环境</h3>
</main>
<script>
  console.log([...document.querySelectorAll('h1,h2,h3')].map(h=>h.tagName+':'+h.textContent));
</script>
'@ | Set-Content outline.html
pnpm exec playwright screenshot --device="iPhone 13" outline.html mobile.png
pnpm exec playwright screenshot --viewport-size="1024,768" outline.html desktop.png`,
      `384px、768px 和 1440px 下标题文本与 DOM 顺序一致，移动端只改变排版，不删除层级。
边界：若移动端隐藏 h2 只用粗体文字替代，视觉简化已经破坏了大纲。`,
    ),
  ],
  [
    htmlExample(
      '按项目关系选择无序、有序和描述列表',
      'HTML',
      `<main>
  <h1>上线清单</h1>
  <ul><li>备份数据库</li><li>冻结发布分支</li></ul>
  <h2>执行顺序</h2>
  <ol><li>部署静态资源</li><li>发布应用</li><li>运行冒烟测试</li></ol>
  <h2>环境</h2>
  <dl><dt>区域</dt><dd>华东</dd><dt>版本</dt><dd>2026.11.24</dd></dl>
</main>`,
      `ul 表示无先后项目，ol 表示必须按顺序执行，dl 表示环境名与值成对。
边界：为了显示数字而把无顺序标签塞进 ol，会向用户错误表达流程依赖。`,
    ),
    htmlExample(
      '为块级引用保留来源归属与链接',
      'HTML',
      `<article>
  <p>评审结论强调：<q cite="https://example.com/reviews/42">先把失败路径写成可执行测试。</q></p>
  <figure>
    <blockquote cite="https://example.com/incidents/17">
      <p>回滚在四分钟内完成，但没有同步清理边缘缓存。</p>
    </blockquote>
    <figcaption>事故复盘 17，<a href="https://example.com/incidents/17">查看原始记录</a></figcaption>
  </figure>
</article>`,
      `行内 q 与块级 blockquote 保持引用语义，cite 保存来源 URL，图注提供可点击原文。
边界：只用左缩进样式模仿引用，会让辅助技术和复制结果丢失来源关系。`,
    ),
    htmlExample(
      '用 pre 保留空白、code 表达代码片段',
      'HTML',
      `<figure aria-labelledby="curl-title">
  <figcaption id="curl-title">检查首页缓存是否命中</figcaption>
  <pre><code>curl.exe -sSI https://example.com/ \\
  | Select-String 'HTTP/|cache-control|etag'
</code></pre>
</figure>
<p>行内命令 <code>curl.exe -sSI</code> 只请求响应头，不下载正文。</p>`,
      `HTTP/2 200
cache-control: public, max-age=0, must-revalidate
etag: "8f31a7"
边界：pre 不负责语法高亮，代码高亮库必须保留原始文本和复制内容。`,
    ),
    htmlExample(
      '把可见时间与机器可读 datetime 分开',
      'HTML + JavaScript',
      `<article>
  <h1>维护窗口</h1>
  <p>开始：<time id="start" datetime="2026-11-24T22:00:00+08:00">11 月 24 日 22:00</time></p>
  <p>结束：<time datetime="2026-11-25T00:30:00+08:00">次日 00:30</time></p>
  <script>
    const value = document.querySelector('#start').dateTime;
    console.log({ machineValue: value, parsed: new Date(value).toISOString() });
  </script>
</article>`,
      `{ machineValue: '2026-11-24T22:00:00+08:00', parsed: '2026-11-24T14:00:00.000Z' }
边界：datetime 缺失时可见文本可能被猜测解析，跨时区排程会产生歧义。`,
    ),
    htmlExample(
      '关闭 CSS 后按线性文本检查组合内容',
      'HTML + PowerShell',
      `@'
<main>
  <h1>部署公告</h1>
  <ul><li>版本 2.4.1</li><li>预计影响 5 分钟</li></ul>
  <blockquote cite="https://example.com/status/88"><p>只影响报表导出。</p></blockquote>
  <p>开始时间 <time datetime="2026-11-24T23:00:00+08:00">23:00</time>。</p>
</main>
'@ | Set-Content linear.html
pnpm exec playwright screenshot --viewport-size="390,844" linear.html mobile.png`,
      `线性阅读顺序为公告标题、版本与影响列表、引用、开始时间，各块无需视觉定位即可理解。
边界：若列表符号和时间关系只由背景图表达，关闭样式后会丢失关键信息。`,
    ),
  ],
  [
    htmlExample(
      '把用户任务映射为页面矩阵',
      'JSON',
      `[
  {"task":"比较方案","entry":"/","pages":["/pricing/","/services/"]},
  {"task":"申请试用","entry":"/pricing/","pages":["/trial/","/thanks/"]},
  {"task":"处理故障","entry":"/status/","pages":["/status/","/contact/"]}
]
`,
      `每个任务都有入口、必经页面和成功终点；页面矩阵可直接转成导航与验收脚本。
边界：页面按部门名称分类却无法支持用户任务时，信息架构仍不成立。`,
    ),
    htmlExample(
      '用稳定 URL 层级表达内容关系',
      'HTTP + JSON',
      `GET /services/consulting/ HTTP/1.1
Host: example.com

HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Link: </services/>; rel="up", </services/consulting/contact/>; rel="next"

<link rel="canonical" href="https://example.com/services/consulting/">
<nav aria-label="面包屑"><a href="/">首页</a> / <a href="/services/">服务</a> / 咨询</nav>`,
      `稳定路径 /services/consulting/ 同时被 canonical、面包屑和上级链接采用。
边界：营销活动参数、大小写和尾斜杠变体不应制造多个首页身份。`,
    ),
    htmlExample(
      '让主导航只覆盖稳定主线',
      'HTML',
      `<nav aria-label="主导航">
  <a href="/products/" aria-current="page">产品</a>
  <a href="/solutions/">解决方案</a>
  <a href="/pricing/">价格</a>
  <a href="/contact/">联系</a>
</nav>
<aside aria-label="相关资源">
  <a href="/guides/migration/">迁移指南</a>
  <a href="/webinars/2026-q4/">季度网络研讨会</a>
</aside>`,
      `主导航保持四条长期主线，迁移指南和活动页放入相关资源，避免每次活动都改全局导航。
边界：把所有深层页面塞进主导航，会让稳定入口随内容增长失去可扫描性。`,
    ),
    htmlExample(
      '逐页核对 title、h1 与 canonical',
      'PowerShell',
      `$pages = @{
  '/' = '星河科技 | 企业数字化交付'
  '/services/' = '服务与交付方式 | 星河科技'
  '/services/consulting/' = '咨询与架构评审 | 星河科技'
}
foreach ($entry in $pages.GetEnumerator()) {
  $html = (Invoke-WebRequest ('http://127.0.0.1:4173' + $entry.Key)).Content
  $title = [regex]::Match($html, '<title>(.*?)</title>').Groups[1].Value
  "url=$($entry.Key) expectedMatch=$($title -eq $entry.Value) title=$title"
}`,
      `url=/ expectedMatch=True title=星河科技 | 企业数字化交付
url=/services/ expectedMatch=True title=服务与交付方式 | 星河科技
边界：共享模板若无条件复用首页 title，页面身份就会在搜索与分享中重叠。`,
    ),
    htmlExample(
      '从首页到成功页走完关键旅程',
      'HTML + JavaScript',
      `<ol aria-label="试用申请步骤">
  <li><a href="/pricing/">选择方案</a></li>
  <li><a href="/trial/">填写资料</a></li>
  <li><a href="/thanks/">确认邮箱</a></li>
</ol>
<script>
  const steps = [...document.querySelectorAll('ol a')];
  console.table(steps.map((link, index) => ({
    step: index + 1,
    label: link.textContent,
    path: new URL(link.href).pathname
  })));
</script>`,
      `step 1 选择方案 /pricing/
step 2 填写资料 /trial/
step 3 确认邮箱 /thanks/
边界：每一步都要能返回上一层并保留数据，不能只验证链接存在。`,
    ),
  ],
  [
    htmlExample(
      '记录改造前的键盘、标题和文本基线',
      'JavaScript',
      `const baseline = {
  headings: [...document.querySelectorAll('h1,h2,h3')].map((node) => node.textContent.trim()),
  links: [...document.querySelectorAll('a')].map((node) => node.textContent.trim()),
  bodyTextLength: document.body.innerText.length,
  mainCount: document.querySelectorAll('main').length
};
sessionStorage.setItem('baseline-before', JSON.stringify(baseline));
console.table(baseline);`,
      `headings 12 links 24 bodyTextLength 1864 mainCount 1
基线保存在 sessionStorage，改造后应比较标题、链接名称、文本和地标数量。
边界：只保存截图不能证明键盘焦点和链接名称没有退化。`,
    ),
    htmlExample(
      '按内容职责把 div 替换为语义元素',
      'HTML',
      `<main>
  <header><p>安全中心</p><h1>事件响应指南</h1></header>
  <nav aria-label="指南目录"><a href="#detect">检测</a><a href="#contain">隔离</a></nav>
  <article>
    <section id="detect"><h2>检测</h2><p>先用日志与告警确认影响范围。</p></section>
    <section id="contain"><h2>隔离</h2><p>限制凭据并断开可疑会话。</p></section>
  </article>
</main>`,
      `main、header、nav、article、section 各自对应页面主线、标题区、目录和独立指南内容。
边界：不能根据 class 名批量替换元素，先证明每个区域的真实内容职责。`,
    ),
    htmlExample(
      '为地标和分节补齐稳定可访问名称',
      'HTML + JavaScript',
      `<nav aria-label="文档目录"><a href="#policy">政策</a></nav>
<main><article aria-labelledby="policy"><h1 id="policy">数据保留政策</h1></article></main>
<script>
  const regions = [...document.querySelectorAll('nav, main, article')];
  console.table(regions.map((node) => ({
    tag: node.tagName,
    label: node.getAttribute('aria-label') ?? node.getAttribute('aria-labelledby')
  })));
</script>`,
      `tag      label
NAV      文档目录
MAIN     null
ARTICLE  policy
边界：main 可依赖唯一性，不必强行命名；多个 nav 或 article 则需要可区分名称。`,
    ),
    htmlExample(
      '修复 DOM 中原先由视觉顺序掩盖的错位',
      'HTML + JavaScript',
      `<main>
  <h1>申请试用</h1>
  <form id="trial" aria-labelledby="form-title"><h2 id="form-title">团队信息</h2><button>提交</button></form>
  <aside aria-labelledby="help-title"><h2 id="help-title">需要帮助？</h2><a href="/contact/">联系顾问</a></aside>
</main>
<script>
  const path = [...document.querySelectorAll('h1,h2,a,button')].map((node) => node.textContent.trim());
  console.log(path.join(' > '));
</script>`,
      `申请试用 > 团队信息 > 提交 > 需要帮助？ > 联系顾问
DOM 主线先完成任务，再提供可选帮助；CSS 若把帮助放到右侧，不影响键盘顺序。
边界：用 grid 把帮助区视觉上放到表单前，却保留 DOM 后置，会造成顺序错觉。`,
    ),
    htmlExample(
      '把结构、交互与视觉证据合并为回归记录',
      'PowerShell',
      `npx html-validate dist/index.html
pnpm exec playwright test tests/semantic-regression.spec.ts --reporter=line
$hash = (Get-FileHash dist/index.html -Algorithm SHA256).Hash
@{ validator=$LASTEXITCODE; htmlSha256=$hash; viewport='390x844' } | ConvertTo-Json`,
      `index.html: 0 errors
2 passed (1.8s)
{"validator":0,"htmlSha256":"C13A...990F","viewport":"390x844"}
边界：结构、交互、视觉三类证据必须指向同一构建产物，否则结果无法复核。`,
    ),
  ],
];

const HTML5_H2_EXAMPLES: HtmlStageExamples = [
  [
    htmlExample(
      '声明表单提交地址、方法和成功页面',
      'HTML',
      `<form id="lead"
      action="/api/leads"
      method="post"
      enctype="application/x-www-form-urlencoded"
      aria-labelledby="lead-title">
  <h1 id="lead-title">申请产品演示</h1>
  <label for="company">公司名称</label>
  <input id="company" name="company" autocomplete="organization" required>
  <button type="submit">提交申请</button>
</form>`,
      `提交请求为 POST /api/leads，字段名 company 随表单发送，服务端成功后重定向到确认页。
边界：缺少 name 的控件不会进入表单数据，错误 method 还可能把敏感字段放进 URL。`,
    ),
    htmlExample(
      '用 for 与 id 建立标签名称和点击范围',
      'HTML + JavaScript',
      `<form>
  <label for="email">工作邮箱</label>
  <input id="email" name="email" type="email" autocomplete="email">
  <label>
    接收产品更新
    <input name="newsletter" type="checkbox">
  </label>
</form>
<script>
  const email = document.querySelector('#email');
  console.log({ labelText: email.labels?.[0]?.textContent, id: email.id, name: email.name });
</script>`,
      `{ labelText: '工作邮箱', id: 'email', name: 'email' }
边界：视觉标签未关联时鼠标可点但屏幕阅读器和控件点击范围会丢失名称。`,
    ),
    htmlExample(
      '按任务选择 input、select、textarea 与原生 button',
      'HTML',
      `<form id="ticket">
  <label for="subject">主题</label>
  <input id="subject" name="subject" required>
  <label for="priority">优先级</label>
  <select id="priority" name="priority">
    <option value="normal">普通</option>
    <option value="urgent">紧急</option>
  </select>
  <label for="detail">问题描述</label>
  <textarea id="detail" name="detail" rows="5"></textarea>
  <button type="submit">创建工单</button>
</form>`,
      `浏览器和辅助技术会分别暴露文本框、下拉框、多行文本和提交按钮的原生行为。
边界：给 div 加 click 模拟按钮会丢失 Enter、Space、禁用和表单提交语义。`,
    ),
    htmlExample(
      '让帮助文本在占位符消失后仍然存在',
      'HTML + CSS',
      `<label for="vat">增值税号</label>
<input id="vat" name="vat" aria-describedby="vat-help vat-error" placeholder="例如 CN91310000...">
<p id="vat-help">请输入 15 至 20 位字母与数字，不包含空格。</p>
<p id="vat-error" role="alert"></p>
<style>
  input:user-invalid { border: 2px solid #b42318; }
  #vat-help { color: #475467; font-size: 0.9rem; }
</style>`,
      `输入框获得名称“增值税号”，帮助文本和错误都通过 aria-describedby 关联。
边界：placeholder 在输入后消失，不能作为字段名称或唯一格式说明。`,
    ),
    htmlExample(
      '从 FormData 检查实际提交字段与空值',
      'HTML + JavaScript',
      `<form id="profile">
  <label for="name">姓名</label><input id="name" name="name" value="林岚">
  <label for="role">角色</label><select id="role" name="role"><option>管理员</option></select>
  <label><input type="checkbox" name="alerts" checked> 接收告警</label>
  <button type="submit">保存</button>
</form>
<script>
  document.querySelector('#profile').addEventListener('submit', (event) => {
    event.preventDefault();
    console.table([...new FormData(event.currentTarget).entries()]);
  });
</script>`,
      `name  林岚
role  管理员
alerts on
边界：未勾选复选框不会出现在 FormData 中，服务端必须把缺失解释为 false 而不是漏字段。`,
    ),
  ],
  [
    htmlExample(
      '让 type 表达邮箱、电话和日期数据类别',
      'HTML + JavaScript',
      `<form id="booking">
  <label for="email">邮箱</label><input id="email" type="email" name="email">
  <label for="phone">电话</label><input id="phone" type="tel" name="phone">
  <label for="date">日期</label><input id="date" type="date" name="date">
</form>
<script>
  const fields = [...document.querySelectorAll('input')];
  console.table(fields.map((field) => ({ id: field.id, type: field.type, valid: field.validity.valid })));
</script>`,
      `email email true
phone tel true
date  date true
边界：type 会改变键盘、格式与验证，但 tel 不会验证国家码，服务端仍需规范化。`,
    ),
    htmlExample(
      '为标准字段配置 autocomplete 令牌',
      'HTML',
      `<form>
  <label for="given">名</label><input id="given" name="given-name" autocomplete="given-name">
  <label for="family">姓</label><input id="family" name="family-name" autocomplete="family-name">
  <label for="email">邮箱</label><input id="email" type="email" autocomplete="email">
  <label for="street">街道</label><input id="street" autocomplete="street-address">
  <label for="postal">邮编</label><input id="postal" autocomplete="postal-code">
</form>`,
      `浏览器可把已保存的姓名、邮箱和地址分别填入对应字段，而不是把同一值填满所有输入框。
边界：自造 token 或所有字段都写 autocomplete=on，会降低自动填充准确性。`,
    ),
    htmlExample(
      '用 inputmode 优化键盘但保留真实约束',
      'HTML + JavaScript',
      `<label for="code">六位验证码</label>
<input id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6"
       autocomplete="one-time-code" aria-describedby="code-help">
<p id="code-help">只输入六位数字，不含空格或连字符。</p>
<script>
  const code = document.querySelector('#code');
  code.addEventListener('input', () => {
    console.log({ value: code.value, valid: code.validity.valid, keyboardHint: code.inputMode });
  });
</script>`,
      `输入 12a456 时得到 { value: '12a456', valid: false, keyboardHint: 'numeric' }。
边界：inputmode 只提示键盘，真正约束来自 pattern、长度与服务端校验。`,
    ),
    htmlExample(
      '把格式规则同时写进标签说明和错误关联',
      'HTML',
      `<div class="field">
  <label for="iban">国际银行账号</label>
  <p id="iban-help">国家代码后接 2 位校验码，可包含空格。</p>
  <input id="iban" name="iban" autocomplete="off"
         aria-describedby="iban-help iban-error">
  <p id="iban-error" role="alert"></p>
</div>
<script>
  const input = document.querySelector('#iban');
  input.addEventListener('blur', () => {
    const valid = /^[A-Z]{2}\\d{2}[A-Z0-9 ]{8,30}$/.test(input.value.trim().toUpperCase());
    document.querySelector('#iban-error').textContent = valid ? '' : '请检查国家代码与校验位';
    input.setAttribute('aria-invalid', String(!valid));
  });
</script>`,
      `输入 CN00 1234 时 error 清空；输入 CN12 时显示“请检查国家代码与校验位”。
边界：帮助说明和错误必须同时可达，不能只在 placeholder 里显示格式。`,
    ),
    htmlExample(
      '跨触摸、键盘和粘贴验证同一字段契约',
      'HTML + JavaScript',
      `<label for="phone">手机号</label>
<input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel"
       pattern="1[3-9][0-9]{9}" maxlength="11" aria-describedby="phone-help">
<p id="phone-help">中国大陆 11 位手机号，不输入空格。</p>
<script>
  const phone = document.querySelector('#phone');
  phone.addEventListener('change', () => {
    const digits = phone.value.replace(/\\D/g, '');
    console.log({ digits, unchanged: digits === phone.value, valid: phone.validity.valid });
  });
</script>`,
      `粘贴“138 0013 8000”后 digits=13800138000、unchanged=false、valid=false。
边界：客服输入、自动填充和键盘输入必须共享同一规范化与验证规则。`,
    ),
  ],
  [
    htmlExample(
      '把 required、minlength 与 pattern 写成业务约束',
      'HTML + JavaScript',
      `<form id="account">
  <label for="user">用户名</label>
  <input id="user" name="user" required minlength="4" maxlength="16"
         pattern="[a-z][a-z0-9_]{3,15}" aria-describedby="user-help">
  <p id="user-help">以字母开头，只能使用小写字母、数字和下划线。</p>
  <button>创建账号</button>
</form>
<script>
  const user = document.querySelector('#user');
  user.value = '1abc';
  console.log({ valid: user.validity.valid, patternMismatch: user.validity.patternMismatch });
</script>`,
      `{ valid: false, patternMismatch: true }
边界：HTML pattern 使用整段匹配语义，但仍必须由服务端重新验证并检查唯一性。`,
    ),
    htmlExample(
      '按 ValidityState 定位唯一种失败原因',
      'HTML + JavaScript',
      `<label for="slug">页面地址</label>
<input id="slug" required minlength="3" pattern="[a-z0-9-]+">
<script>
  const input = document.querySelector('#slug');
  const reasons = ['valueMissing', 'tooShort', 'patternMismatch', 'customError'];
  input.value = 'A B';
  console.table(reasons.map((key) => ({ key, active: input.validity[key] })));
  console.log('message=', input.validationMessage);
</script>`,
      `valueMissing false, tooShort false, patternMismatch true, customError false
message= 请匹配要求的格式。
边界：同时叠加多个错误时要按用户可修复顺序提示，而不是只显示首个布尔值。`,
    ),
    htmlExample(
      '让错误文本定位字段并说明修复方式',
      'HTML + CSS',
      `<label for="password">新密码</label>
<input id="password" name="password" type="password" minlength="12"
       aria-describedby="password-rule password-error" aria-invalid="true">
<p id="password-rule">至少 12 个字符，并包含数字与符号。</p>
<p id="password-error" role="alert">密码长度不足，请再输入 3 个字符。</p>
<style>
  [aria-invalid="true"] { border-color: #b42318; border-width: 2px; }
  #password-error { color: #b42318; }
</style>`,
      `字段边框和错误文本同时显示错误，读屏在 aria-invalid=true 时关联错误说明。
边界：只把边框变红而不提供文本，会让色觉障碍用户无法知道失败原因。`,
    ),
    htmlExample(
      '用 setCustomValidity 保留原生约束流程',
      'HTML + JavaScript',
      `<form id="join">
  <label for="code">团队邀请码</label>
  <input id="code" name="code" required aria-describedby="code-error">
  <p id="code-error"></p>
  <button>加入团队</button>
</form>
<script>
  const code = document.querySelector('#code');
  code.addEventListener('input', () => {
    const remoteStyleCheck = code.value === 'TEAM-2026';
    code.setCustomValidity(remoteStyleCheck ? '' : '邀请码无效或已过期');
    document.querySelector('#code-error').textContent = code.validationMessage;
  });
</script>`,
      `输入 TEAM-2025 时字段 invalid，错误文本为“邀请码无效或已过期”；输入有效码后清空。
边界：自定义验证仍要调用 checkValidity，并在输入变化时清除旧 customError。`,
    ),
    htmlExample(
      '让客户端预检与服务器最终结论都可观察',
      'HTML + JavaScript',
      `<form id="coupon">
  <label for="code">优惠码</label><input id="code" name="code" pattern="[A-Z0-9-]{6,20}">
  <button>应用优惠码</button><output id="status" role="status"></output>
</form>
<script>
  document.querySelector('#coupon').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!event.currentTarget.reportValidity()) return;
    const response = await fetch('/api/coupons/validate', { method: 'POST', body: data });
    document.querySelector('#status').textContent = response.ok ? '优惠已应用' : '服务器拒绝该优惠码';
  });
</script>`,
      `格式错误在浏览器阻止请求；格式正确但已过期的优惠码由服务器返回失败并展示状态。
边界：客户端不能决定折扣金额或优惠码有效，必须使用服务端重新计算的结果。`,
    ),
  ],
  [
    htmlExample(
      '用 fieldset 把账单控件组织成同一问题',
      'HTML',
      `<fieldset>
  <legend>账单地址</legend>
  <label for="street">街道</label><input id="street" name="street">
  <label for="city">城市</label><input id="city" name="city">
  <label for="postal">邮编</label><input id="postal" name="postal">
</fieldset>`,
      `三个输入框被同一 legend“账单地址”命名，屏幕阅读器进入字段时会说明所属组。
边界：fieldset 不应包围整个页面；只有共同回答一个问题的控件才需要分组。`,
    ),
    htmlExample(
      '让 legend 可见并成为组名称',
      'HTML + CSS',
      `<fieldset id="delivery">
  <legend>配送方式</legend>
  <label><input type="radio" name="delivery" value="standard"> 标准配送（3–5 天）</label>
  <label><input type="radio" name="delivery" value="express"> 加急配送（次日）</label>
</fieldset>
<style>
  legend { font-weight: 700; padding-inline: 0.35rem; }
  fieldset { border: 1px solid #98a2b3; border-radius: 6px; }
</style>`,
      `legend 在视觉上清楚显示“配送方式”，辅助技术会把两个单选按钮归入该组。
边界：用 CSS 隐藏 legend 或用绝对定位移出屏幕，会削弱用户理解组目的的能力。`,
    ),
    htmlExample(
      '区分单选组名与每个选项名',
      'HTML + JavaScript',
      `<fieldset>
  <legend>通知频率</legend>
  <label><input type="radio" name="frequency" value="daily" checked> 每日摘要</label>
  <label><input type="radio" name="frequency" value="weekly"> 每周摘要</label>
  <label><input type="checkbox" name="incident" value="yes"> 重大事故立即通知</label>
</fieldset>
<script>
  const checked = document.querySelector('[name="frequency"]:checked');
  console.table({ group: '通知频率', option: checked.nextText.trim(), value: checked.value });
</script>`,
      `group 通知频率, option 每日摘要, value daily
边界：radio 的 name 定义互斥组，label 文本定义选项含义，两者不能互相替代。`,
    ),
    htmlExample(
      '观察 disabled fieldset 对提交和焦点的整体影响',
      'HTML + JavaScript',
      `<form id="plan">
  <fieldset id="legacy" disabled>
    <legend>旧版选项</legend>
    <label><input type="checkbox" name="archive" value="yes"> 保留归档</label>
    <button name="action" value="legacy">旧版保存</button>
  </fieldset>
  <button name="action" value="current">保存当前设置</button>
</form>
<script>
  const form = document.querySelector('#plan');
  console.table([...new FormData(form).entries()]);
  console.log('legacyMatches=', form.querySelectorAll('#legacy :disabled').length);
</script>`,
      `action current；fieldset 内两个控件都被禁用，不能聚焦也不会进入提交数据。
边界：aria-disabled 只表达状态，不会自动阻止点击或提交。`,
    ),
    htmlExample(
      '分组后重新走键盘、提交与错误流程',
      'HTML + JavaScript',
      `<form id="survey">
  <fieldset aria-describedby="contact-help">
    <legend>联系偏好</legend>
    <p id="contact-help">至少选择一种方式。</p>
    <label><input type="checkbox" name="contact" value="email"> 邮件</label>
    <label><input type="checkbox" name="contact" value="phone"> 电话</label>
  </fieldset>
  <button>提交偏好</button>
</form>
<script>
  document.querySelector('#survey').addEventListener('submit', (event) => {
    event.preventDefault();
    const selected = new FormData(event.currentTarget).getAll('contact');
    console.log({ selected, count: selected.length });
  });
</script>`,
      `{ selected: [ 'email', 'phone' ], count: 2 }
边界：分组语义正确不代表约束完整，业务仍需验证至少选择一项并在组级提示错误。`,
    ),
  ],
  [
    htmlExample(
      '明确 submit、button 与 reset 三种按钮职责',
      'HTML',
      `<form id="editor">
  <label for="title">标题</label><input id="title" name="title" value="季度计划">
  <button type="submit">发布</button>
  <button type="button" id="preview">预览</button>
  <button type="reset">撤销未保存修改</button>
</form>
<script>
  document.querySelector('#preview').addEventListener('click', () => console.log('preview-only'));
  document.querySelector('#editor').addEventListener('submit', (event) => {
    event.preventDefault();
    console.log('submit=', new FormData(event.currentTarget).get('title'));
  });
</script>`,
      `点击预览只输出 preview-only；点击发布输出 submit= 季度计划；reset 恢复初始标题。
边界：form 内未写 type 的按钮默认 submit，容易把预览误触发为发布。`,
    ),
    htmlExample(
      '通过 submit 事件集中处理所有提交入口',
      'HTML + JavaScript',
      `<form id="search">
  <label for="query">搜索课程</label>
  <input id="query" name="query" required>
  <button>搜索</button>
  <button type="submit" formnovalidate name="lucky" value="1">手气不错</button>
</form>
<script>
  document.querySelector('#search').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    console.log({ submitter: event.submitter?.textContent.trim(), ...data });
  });
</script>`,
      `点击“搜索”输出 submitter=搜索；点击“手气不错”跳过 required 并输出 lucky=1。
边界：如果只给第一个按钮绑定 click，回车与第二个提交按钮会绕开业务处理。`,
    ),
    htmlExample(
      '用 aria-busy 和禁用状态表达提交进行中',
      'HTML + JavaScript',
      `<form id="order">
  <label for="email">确认邮箱</label><input id="email" type="email" required>
  <button type="submit">提交订单</button>
  <p id="status" role="status"></p>
</form>
<script>
  document.querySelector('#order').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    event.currentTarget.setAttribute('aria-busy', 'true');
    document.querySelector('#status').textContent = '正在提交，请稍候';
    await new Promise((resolve) => setTimeout(resolve, 600));
    document.querySelector('#status').textContent = '订单已提交';
  });
</script>`,
      `提交后按钮不可重复点击，form aria-busy=true，状态区先读“正在提交”再读“订单已提交”。
边界：只让按钮变灰而不禁用或阻止重复请求，快速双击仍可能创建两笔订单。`,
    ),
    htmlExample(
      '用 AbortController 取消等待但不假设撤销副作用',
      'HTML + JavaScript',
      `<button id="start">生成报价</button><button id="cancel">取消等待</button>
<output id="state" role="status"></output>
<script>
  let controller;
  document.querySelector('#start').addEventListener('click', async () => {
    controller = new AbortController();
    document.querySelector('#state').textContent = '生成中';
    try {
      const response = await fetch('/api/quotes', { method: 'POST', signal: controller.signal });
      document.querySelector('#state').textContent = response.ok ? '报价已生成' : '生成失败';
    } catch (error) {
      document.querySelector('#state').textContent = error.name === 'AbortError' ? '已取消等待' : '网络失败';
    }
  });
  document.querySelector('#cancel').addEventListener('click', () => controller?.abort());
</script>`,
      `点击取消后状态显示“已取消等待”；若服务端已创建报价，客户端取消不会自动删除记录。
边界：中止 fetch 与撤销服务端事务是两件事，需要单独设计补偿接口。`,
    ),
    htmlExample(
      '用幂等键与服务端状态阻断重复订单',
      'HTML + JavaScript',
      `<form id="payment">
  <label for="amount">金额</label><input id="amount" name="amount" value="299">
  <button>支付</button><output id="result" role="status"></output>
</form>
<script>
  const idempotencyKey = crypto.randomUUID();
  document.querySelector('#payment').addEventListener('submit', async (event) => {
    event.preventDefault();
    const response = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ amount: Number(document.querySelector('#amount').value) })
    });
    document.querySelector('#result').textContent = response.ok ? '支付已受理' : '请检查支付结果';
  });
</script>`,
      `同一表单重复发送携带相同 Idempotency-Key，服务端返回同一支付结果而不是重复扣款。
边界：前端禁用按钮只能减少误触，最终唯一性必须由服务端幂等约束保证。`,
    ),
  ],
  [
    htmlExample(
      '为每个字段建立名称、说明和分组三类信息',
      'HTML',
      `<form aria-labelledby="account-title">
  <h1 id="account-title">企业账号申请</h1>
  <label for="company">企业名称</label>
  <input id="company" name="company" autocomplete="organization" aria-describedby="company-help" required>
  <p id="company-help">请与营业执照上的名称一致。</p>
  <fieldset><legend>团队规模</legend>
    <label><input type="radio" name="size" value="s"> 1–20 人</label>
    <label><input type="radio" name="size" value="m"> 21–200 人</label>
  </fieldset>
</form>`,
      `企业名称有 label 与帮助说明；团队规模两个选项属于同一 fieldset 与 legend。
边界：只有视觉标题而没有可访问名称，读屏用户无法在表单模式中定位字段用途。`,
    ),
    htmlExample(
      '让错误摘要链接到具体字段并能移动焦点',
      'HTML + JavaScript',
      `<div id="error-summary" role="alert" tabindex="-1" hidden>
  <h2>提交失败</h2><ul><li><a href="#email">邮箱格式不正确</a></li></ul>
</div>
<form id="signup"><label for="email">邮箱</label><input id="email" aria-invalid="true"></form>
<script>
  const summary = document.querySelector('#error-summary');
  summary.hidden = false;
  summary.focus();
  summary.querySelector('a').addEventListener('click', () => {
    document.querySelector('#email').focus();
  });
</script>`,
      `摘要获得焦点并朗读失败总数，点击链接或 Enter 后焦点移动到邮箱字段。
边界：摘要只显示红色文字且不可聚焦，键盘用户可能错过全部错误。`,
    ),
    htmlExample(
      '动态插入字段后把焦点放到新控件',
      'HTML + JavaScript',
      `<button id="add" type="button">添加备用联系人</button>
<div id="contacts"></div>
<script>
  let count = 0;
  document.querySelector('#add').addEventListener('click', () => {
    count += 1;
    const id = 'contact-' + count;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = '备用联系人 ' + count;
    const input = document.createElement('input');
    input.id = id;
    input.name = 'backupContact';
    document.querySelector('#contacts').append(label, input);
    input.focus();
  });
</script>`,
      `点击添加后新 label 与 input 成对插入，焦点落在新输入框，Tab 顺序继续向后。
边界：只 append input 不关联标签且不移动焦点，会让动态表单难以发现和操作。`,
    ),
    htmlExample(
      '用状态区区分等待、成功和失败',
      'HTML + JavaScript',
      `<form id="invite">
  <label for="email">邀请邮箱</label><input id="email" type="email" required>
  <button>发送邀请</button><p id="status" role="status" aria-live="polite"></p>
</form>
<script>
  document.querySelector('#invite').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#status');
    status.textContent = '正在发送邀请';
    await new Promise((resolve) => setTimeout(resolve, 300));
    status.textContent = '邀请已发送，可在成员列表查看';
  });
</script>`,
      `状态文本从“正在发送邀请”变为“邀请已发送，可在成员列表查看”，不夺走当前焦点。
边界：成功只靠页面顶部 toast 且迅速消失，会让低视力或读屏用户错过结果。`,
    ),
    htmlExample(
      '用 axe 与键盘任务共同验收表单',
      'PowerShell',
      `@'
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("accessible signup", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/signup");
  const results = await new AxeBuilder({ page }).include("form").analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("企业名称")).toBeFocused();
});
'@ | Set-Content tests/signup.spec.ts
pnpm exec playwright test tests/signup.spec.ts`,
      `1 passed，axe 无 form 违规，首个 Tab 焦点落在“企业名称”。
边界：自动扫描通过后仍要人工走完错误摘要、动态字段和提交成功路径。`,
    ),
  ],
];

const HTML5_H3_EXAMPLES: HtmlStageExamples = [
  [
    htmlExample(
      '让 src 成为最终可显示的默认资源',
      'HTML',
      `<img id="cover"
     src="/images/report-960.webp"
     width="960" height="540"
     alt="年度报告封面，显示 2026 与核心业务指标">
<script>
  const image = document.querySelector('#cover');
  image.addEventListener('load', () => {
    console.log({ src: image.getAttribute('src'), naturalWidth: image.naturalWidth });
  });
</script>`,
      `{ src: '/images/report-960.webp', naturalWidth: 960 }
边界：src 404 时 srcset 候选也不能无限兜底，必须提供可理解的 alt 与备用说明。`,
    ),
    htmlExample(
      '用 srcset 与 sizes 让浏览器选择真实候选宽度',
      'HTML + JavaScript',
      `<img id="hero"
     src="/media/hero-800.jpg"
     srcset="/media/hero-480.jpg 480w, /media/hero-960.jpg 960w, /media/hero-1440.jpg 1440w"
     sizes="(max-width: 640px) 100vw, (max-width: 1200px) 70vw, 960px"
     width="1440" height="720"
     alt="仓库机器人正在搬运订单">
<script>
  document.querySelector('#hero').addEventListener('load', (event) => {
    console.log({ currentSrc: event.currentTarget.currentSrc, width: event.currentTarget.naturalWidth });
  });
</script>`,
      `390px 视口加载 hero-480.jpg 时 naturalWidth=480；960px 布局宽度可能选择 hero-960.jpg。
边界：sizes 应描述渲染宽度，不能用 DPR 猜测替代 CSS 布局。`,
    ),
    htmlExample(
      '首屏主图用 eager、折叠下方图片用 lazy',
      'HTML',
      `<img src="/media/hero-960.webp"
     width="960" height="540"
     fetchpriority="high"
     decoding="async"
     alt="实时运营仪表盘">
<section>
  <h2>客户案例</h2>
  <img src="/media/customer-640.webp"
       width="640" height="360"
       loading="lazy"
       decoding="async"
       alt="制造团队使用库存预测面板">
</section>`,
      `Network 中首屏主图较早发起，折叠下方案例图进入视口附近才请求。
边界：首屏图若也标记 lazy，可能延迟 LCP；未知高度图片还需宽高或 aspect-ratio 防抖动。`,
    ),
    htmlExample(
      '信息图片描述用途，装饰图片使用空 alt',
      'HTML',
      `<figure>
  <img src="/media/checkout-error.webp" width="720" height="420"
       alt="结账页提示优惠码已过期，并提供重新选择按钮">
  <figcaption>错误提示必须说明原因和下一步操作。</figcaption>
</figure>
<button class="icon-button" aria-label="关闭通知">
  <img src="/icons/close.svg" width="20" height="20" alt="">
</button>`,
      `第一张图片被读作错误状态说明；关闭图标由按钮 aria-label 命名，图片 alt 为空。
边界：装饰图片若写“关闭图标”，读屏会把同一名称重复两次。`,
    ),
    htmlExample(
      '在移动网络记录实际选图、字节和布局空位',
      'HTML + JavaScript',
      `<img id="proof"
     src="/media/proof-640.jpg"
     srcset="/media/proof-320.jpg 320w, /media/proof-640.jpg 640w"
     sizes="(max-width: 480px) calc(100vw - 32px), 480px"
     width="640" height="400" alt="客户评价与使用场景">
<script>
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name.includes('/media/proof-')) {
        console.table({ file: entry.name, transfer: entry.transferSize, duration: entry.duration });
      }
    }
  }).observe({ type: 'resource', buffered: true });
</script>`,
      `375px 视口选择 proof-320.jpg，transferSize 小于 80KB，图片盒在下载前保持 640:400 比例。
边界：自然尺寸足够小不代表传输小，仍要检查编码、缓存与服务端压缩。`,
    ),
  ],
  [
    htmlExample(
      '用 picture 为窄屏提供不同裁切',
      'HTML',
      `<picture>
  <source media="(max-width: 640px)" srcset="/media/team-portrait.webp">
  <source media="(min-width: 641px)" srcset="/media/team-wide.webp">
  <img src="/media/team-wide.jpg" width="1200" height="600"
       alt="产品和工程团队在发布评审会上讨论看板">
</picture>`,
      `390px 视口加载竖版 team-portrait.webp，桌面加载横版 team-wide.webp。
边界：媒体条件应来自构图边界，不要为每个像素宽度维护一张图片。`,
    ),
    htmlExample(
      '确认 source 顺序与 img 最终回退',
      'HTML + JavaScript',
      `<picture>
  <source type="image/avif" srcset="/media/chart.avif">
  <source type="image/webp" srcset="/media/chart.webp">
  <img id="chart" src="/media/chart.png" width="900" height="500"
       alt="季度收入按地区分组的柱状图">
</picture>
<script>
  document.querySelector('#chart').addEventListener('load', (event) => {
    console.log({ currentSrc: event.currentTarget.currentSrc, supported: CSS.supports('display', 'grid') });
  });
</script>`,
      `支持 AVIF 的浏览器 currentSrc 为 chart.avif；不支持时依次尝试 WebP 和 PNG。
边界：如果没有 img 回退，picture 在全部 source 失配时没有最终内容。`,
    ),
    htmlExample(
      '让 figure 与 figcaption 形成一个自解释内容单元',
      'HTML',
      `<figure id="latency">
  <img src="/media/latency-p95.webp" width="960" height="480"
       alt="过去四周接口 p95 延迟从 410 毫秒下降到 260 毫秒">
  <figcaption>
    图 3：发布缓存修复后，p95 延迟连续四周下降。
    <a href="/reports/latency.csv">下载原始数据</a>
  </figcaption>
</figure>`,
      `figure 保留图像与图注关系，图注解释趋势意义并提供原始数据入口。
边界：figcaption 若只写“图 3”或重复 alt 像素描述，没有增加解释价值。`,
    ),
    htmlExample(
      '为复杂图表提供文字等价路径',
      'HTML',
      `<figure>
  <img src="/media/payment-flow.webp" width="1200" height="700"
       alt="支付授权流程从客户端到网关再到银行，共四个步骤">
  <figcaption>支付授权链路。<a href="#flow-transcript">阅读完整流程文字版</a></figcaption>
</figure>
<section id="flow-transcript">
  <h2>流程文字版</h2>
  <ol><li>客户端创建幂等支付请求。</li><li>网关校验金额与账户。</li><li>银行返回授权结果。</li></ol>
</section>`,
      `复杂图片的 alt 给出高层摘要，图注链接到包含步骤、异常与超时规则的文字版。
边界：把整段流程塞进 alt 会难以浏览，把关键规则只画在图中则无法访问。`,
    ),
    htmlExample(
      '在真实断点确认 currentSrc 与图注不溢出',
      'PowerShell + JavaScript',
      `@'
<picture>
  <source media="(max-width: 480px)" srcset="/media/case-square.jpg">
  <source media="(min-width: 481px)" srcset="/media/case-wide.jpg">
  <img id="case" src="/media/case-wide.jpg" width="800" height="450"
       alt="客户仓库团队使用移动盘点设备">
</picture>
<script>document.querySelector('#case').onload=e=>console.log(e.currentTarget.currentSrc);</script>
'@ | Set-Content case.html
pnpm exec playwright screenshot --viewport-size="375,812" case.html case-mobile.png
pnpm exec playwright screenshot --viewport-size="1280,800" case.html case-desktop.png`,
      `375px 使用 case-square.jpg，页面无横向滚动；1280px 使用 case-wide.jpg，图注保持单行可读。
边界：只测桌面无法发现手机裁切把主体裁掉，或 caption 长链接撑宽页面。`,
    ),
  ],
  [
    htmlExample(
      '用多个 source 声明视频容器与编码回退',
      'HTML',
      `<video id="demo" controls width="960" height="540" poster="/media/demo-poster.jpg">
  <source src="/media/demo.av1.mp4" type='video/mp4; codecs="av01.0.05M.08"'>
  <source src="/media/demo.h264.mp4" type='video/mp4; codecs="avc1.42E01E"'>
  <p>浏览器无法播放视频时，<a href="/media/demo-transcript.html">阅读操作文字版</a>。</p>
</video>
<script>
  document.querySelector('#demo').addEventListener('error', () => console.error('no supported source'));
</script>`,
      `支持 AV1 的浏览器选择第一项，其余浏览器回退 H.264；全部失败时显示 transcript 链接。
边界：只改扩展名不改变编码，MIME 与 codecs 声明必须和真实文件一致。`,
    ),
    htmlExample(
      '自动播放仅在静音且提供显式控制时使用',
      'HTML',
      `<video id="ambient" autoplay muted loop playsinline controls
       width="960" height="540" poster="/media/showroom-poster.jpg">
  <source src="/media/showroom.webm" type="video/webm">
  <source src="/media/showroom.mp4" type="video/mp4">
  当前浏览器不支持自动背景视频。
</video>
<button type="button" id="toggle">暂停背景视频</button>
<script>
  const video = document.querySelector('#ambient');
  document.querySelector('#toggle').addEventListener('click', () => {
    video.paused ? video.play() : video.pause();
  });
</script>`,
      `页面打开后背景视频静音播放，按钮仍可暂停和恢复，系统减少动态效果时不会强制依赖视频。
边界：带声音自动播放通常被拦截，隐藏 controls 还会剥夺用户暂停能力。`,
    ),
    htmlExample(
      '用 track 提供可选择的字幕轨',
      'HTML',
      `<video id="talk" controls width="960" height="540">
  <source src="/media/talk.mp4" type="video/mp4">
  <track id="captions" kind="captions" srclang="zh-CN" label="简体中文"
         src="/media/talk.zh-CN.vtt" default>
  <track kind="chapters" srclang="zh-CN" label="章节" src="/media/talk.chapters.vtt">
</video>
<script>
  document.querySelector('#talk').textTracks[0].addEventListener('load', () => {
    console.log('captions-ready', document.querySelector('#talk').textTracks[0].cues.length);
  });
</script>`,
      `字幕轨加载后输出 captions-ready 与 cue 数量；播放器菜单出现“简体中文”和“章节”。
边界：字幕文件路径、MIME 或 WebVTT 格式错误时轨道会出现但无法显示内容。`,
    ),
    htmlExample(
      '为纯音频内容提供可见文字稿与下载',
      'HTML',
      `<section aria-labelledby="podcast-title">
  <h1 id="podcast-title">第 42 期：缓存失效事故复盘</h1>
  <audio controls preload="metadata">
    <source src="/media/podcast-42.mp3" type="audio/mpeg">
    你的浏览器不支持音频播放。
  </audio>
  <p><a href="/transcripts/podcast-42.html">阅读完整文字稿</a> ·
     <a href="/media/podcast-42.mp3" download>下载音频</a></p>
  <p>文字稿包含时间戳、关键结论、术语说明和可搜索全文。</p>
</section>`,
      `用户可播放、下载或直接搜索文字稿；音频失败时关键信息仍可通过链接获得。
边界：只有播放器没有 transcript，会让听障用户、搜索和无音频环境失去全部内容。`,
    ),
    htmlExample(
      '用真实网络失败验证媒体回退路径',
      'HTML + JavaScript',
      `<video id="training" controls width="800" height="450">
  <source src="/media/training.mp4" type="video/mp4">
  <a href="/media/training.mp4">下载培训视频</a>
</video>
<p id="fallback" hidden>视频暂时无法加载。<a href="/guides/training/">阅读图文操作指南</a></p>
<script>
  const video = document.querySelector('#training');
  video.addEventListener('error', () => {
    document.querySelector('#fallback').hidden = false;
    console.error({ code: video.error?.code, message: video.error?.message });
  });
  // DevTools 可将 training.mp4 请求改为 Block request URL。
</script>`,
      `阻断视频请求后 fallback 显示图文指南入口，错误码与失败资源写入 Console。
边界：慢网、403、编码不支持和设备静音是不同问题，回退测试不能只断网一次。`,
    ),
  ],
  [
    htmlExample(
      '先确认数据确实由行列共同定义',
      'HTML',
      `<table>
  <caption>各区域季度收入（万元）</caption>
  <thead><tr><th scope="col">区域</th><th scope="col">Q1</th><th scope="col">Q2</th></tr></thead>
  <tbody>
    <tr><th scope="row">华东</th><td>820</td><td>910</td></tr>
    <tr><th scope="row">华南</th><td>640</td><td>700</td></tr>
  </tbody>
</table>`,
      `“华东”和“Q2”共同定义单元格 910，caption 说明数据主题与单位。
边界：一维卡片列表或页面布局不应为了对齐方便而使用 table。`,
    ),
    htmlExample(
      '用 scope 建立行列表头关联',
      'HTML',
      `<table>
  <caption>服务可用性</caption>
  <thead><tr><th scope="col">服务</th><th scope="col">目标</th><th scope="col">实际</th></tr></thead>
  <tbody><tr><th scope="row">支付 API</th><td>99.95%</td><td>99.97%</td></tr></tbody>
</table>
<script>
  const row = document.querySelector('tbody tr');
  console.table([...row.children].map((cell) => ({ text: cell.textContent, scope: cell.scope || 'data' })));
</script>`,
      `支付 API 的 scope=row，目标与实际列头 scope=col，单元格可被辅助技术按行列读取。
边界：全部单元格都用 td 会失去表头语义，视觉加粗不能替代关联。`,
    ),
    htmlExample(
      '把单位和时间范围写进表头与说明',
      'HTML',
      `<table>
  <caption>2026 年第三季度接口延迟</caption>
  <thead><tr><th scope="col">接口</th><th scope="col">p50（毫秒）</th><th scope="col">p95（毫秒）</th></tr></thead>
  <tbody>
    <tr><th scope="row">订单查询</th><td>42</td><td>186</td></tr>
    <tr><th scope="row">支付授权</th><td>68</td><td>240</td></tr>
  </tbody>
</table>
<p>统计范围：生产环境，2026-07-01 至 2026-09-30，按全部请求计算。</p>`,
      `读取“支付授权”和“p95（毫秒）”时可得到 240 毫秒，统计范围在表外说明。
边界：数值不带单位或时间范围，复制到报告后会失去可比性。`,
    ),
    htmlExample(
      '为窄屏提供局部滚动而不是压扁单元格',
      'HTML + CSS',
      `<div class="table-scroll" tabindex="0" role="region" aria-labelledby="deploy-caption">
  <table>
    <caption id="deploy-caption">最近部署</caption>
    <thead><tr><th scope="col">版本</th><th scope="col">环境</th><th scope="col">时间</th></tr></thead>
    <tbody><tr><th scope="row">2026.11.24.3</th><td>预发布</td><td>22:14</td></tr></tbody>
  </table>
</div>
<style>
  .table-scroll { overflow-x: auto; max-width: 100%; }
  table { border-collapse: collapse; min-width: 42rem; }
  th, td { padding: .5rem .75rem; white-space: nowrap; }
</style>`,
      `390px 视口下表格在 region 内横向滚动，页面本身 scrollWidth 不增加，表头关系保持完整。
边界：父容器若无 tabindex 或可聚焦区域，只能触摸滚动，键盘用户可能无法访问右侧列。`,
    ),
    htmlExample(
      '用表头、单元格数和 caption 做数据完整性检查',
      'HTML + JavaScript',
      `<table id="inventory">
  <caption>仓库库存</caption>
  <thead><tr><th scope="col">SKU</th><th scope="col">可用</th><th scope="col">预留</th></tr></thead>
  <tbody><tr><th scope="row">KB-01</th><td>18</td><td>4</td></tr></tbody>
</table>
<script>
  const table = document.querySelector('#inventory');
  console.table({
    caption: table.caption?.textContent,
    columns: table.tHead.rows[0].cells.length,
    bodyRows: table.tBodies[0].rows.length,
    hasMissingCell: [...table.tBodies[0].rows].some((row) => row.cells.length !== 3)
  });
</script>`,
      `caption 仓库库存，columns 3，bodyRows 1，hasMissingCell false。
边界：行列数量正确仍可能有错误值，数据完整性还要对源系统做总数与单位校验。`,
    ),
  ],
  [
    htmlExample(
      '逐页维护 title、description 与 canonical',
      'HTML',
      `<title>支付 API 故障排查 | 星河文档</title>
<meta name="description" content="从超时、幂等键、回调状态与银行返回码定位支付授权失败。">
<link rel="canonical" href="https://docs.example.com/payments/troubleshooting/">
<main><h1>支付 API 故障排查</h1><p>按请求阶段定位失败。</p></main>`,
      `搜索与分享读取到唯一页面标题、描述和首选 URL，canonical 与 h1 描述同一主题。
边界：canonical 不是权限控制，也不能用来合并不同语言或不同业务页面。`,
    ),
    htmlExample(
      '让 Open Graph 分享字段与正文一致',
      'HTML',
      `<meta property="og:type" content="article">
<meta property="og:title" content="缓存失效事故复盘">
<meta property="og:description" content="一次错误缓存键如何在十二分钟内扩散到全部地区。">
<meta property="og:image" content="https://example.com/media/cache-incident-1200x630.png">
<meta property="og:image:alt" content="十二分钟内各地区错误率变化曲线">
<meta property="og:url" content="https://example.com/blog/cache-incident/">
<meta name="twitter:card" content="summary_large_image">`,
      `匿名抓取可读取文章类型、标题、摘要、1200×630 图片和稳定 URL，图片 alt 说明趋势。
边界：分享图必须公网可访问，不能用登录页、临时签名 URL 或与正文无关的品牌图。`,
    ),
    htmlExample(
      '用 JSON-LD 描述页面中真实存在的实体',
      'HTML',
      `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "支付 API 故障排查",
  "dateModified": "2026-11-24",
  "author": {"@type": "Organization", "name": "星河工程团队"},
  "mainEntityOfPage": "https://docs.example.com/payments/troubleshooting/"
}
</script>
<main><h1>支付 API 故障排查</h1><time datetime="2026-11-24">更新于 11 月 24 日</time></main>`,
      `JSON-LD 的文章标题、日期、作者和 URL 都能在可见页面或 canonical 中找到对应事实。
边界：标记虚构评分、价格或作者会制造垃圾信号，不能把结构化数据当排名装饰。`,
    ),
    htmlExample(
      '从单一内容对象生成可见元数据与社交标签',
      'JavaScript',
      `const page = {
  title: '企业迁移白皮书',
  description: '从评估、迁移到回滚的十二周计划。',
  url: 'https://example.com/whitepapers/migration/',
  image: 'https://example.com/media/migration-cover.png'
};
document.title = page.title + ' | 星河科技';
console.table([
  ['description', page.description],
  ['og:title', page.title],
  ['og:image', page.image],
  ['canonical', page.url]
]);`,
      `四行标签全部来自同一 page 对象，修改标题时 description 与 canonical 不会残留旧页面。
边界：模板硬编码 description 或多处复制事实，会在内容更新后出现漂移。`,
    ),
    htmlExample(
      '用匿名 curl 核对最终响应的搜索元数据',
      'PowerShell',
      `$url = 'https://example.com/blog/cache-incident/'
$html = (Invoke-WebRequest $url -Headers @{ 'User-Agent'='Googlebot' }).Content
$checks = [ordered]@{
  title = [regex]::Match($html, '<title>(.*?)</title>').Groups[1].Value
  canonical = [regex]::Match($html, 'rel="canonical" href="(.*?)"').Groups[1].Value
  ogImage = [regex]::Match($html, 'property="og:image" content="(.*?)"').Groups[1].Value
}
$checks | ConvertTo-Json
Invoke-WebRequest $checks.ogImage -Method Head | Select-Object StatusCode`,
      `{"title":"缓存失效事故复盘 | 星河科技","canonical":"https://example.com/blog/cache-incident/","ogImage":"https://example.com/media/cache-incident-1200x630.png"}
StatusCode 200
边界：必须验证无登录 Cookie 的最终响应，并跟随重定向后重新读取 canonical。`,
    ),
  ],
  [
    htmlExample(
      '让正文主线先于次要媒体与推荐内容',
      'HTML',
      `<main>
  <article aria-labelledby="story-title">
    <h1 id="story-title">库存预测如何降低缺货率</h1>
    <p>通过需求信号与供应约束联合预测，把缺货率从 7.2% 降到 5.9%。</p>
    <figure><img src="/media/forecast.webp" width="960" height="540" alt="四周需求预测与实际销量对比"></figure>
    <h2>实现步骤</h2><ol><li>清洗历史订单</li><li>建立预测基线</li><li>接入人工校正</li></ol>
  </article>
  <aside aria-label="相关案例"><a href="/cases/retail/">零售库存案例</a></aside>
</main>`,
      `阅读和键盘顺序先得到标题、结论、解释图、实现步骤，最后才进入相关案例。
边界：自动播放视频或大图放在 h1 前，会延迟核心结论并打乱阅读主线。`,
    ),
    htmlExample(
      '用 figure 固定图片、替代文本与图注关系',
      'HTML',
      `<figure id="warehouse">
  <img src="/media/warehouse-robots.webp" width="1200" height="675"
       srcset="/media/warehouse-robots-600.webp 600w, /media/warehouse-robots.webp 1200w"
       sizes="(max-width: 700px) 100vw, 800px"
       alt="自动搬运车在仓库通道内运送订单箱">
  <figcaption>自动搬运车按实时订单优先级规划路线，图片来自客户现场。</figcaption>
</figure>`,
      `图片、候选资源、替代文本和图注保持在同一个 figure，窄屏选择 600w 候选。
边界：alt 与 figcaption 应互相补充，不能都只写“仓库图片”。`,
    ),
    htmlExample(
      '视频失败时仍保留步骤与文字路径',
      'HTML',
      `<section aria-labelledby="install-title">
  <h2 id="install-title">安装与配对</h2>
  <video controls poster="/media/pairing-poster.jpg" width="720" height="405">
    <source src="/media/pairing.mp4" type="video/mp4">
    <track kind="captions" srclang="zh-CN" label="简体中文" src="/media/pairing.zh.vtt" default>
    <a href="/guides/pairing/">查看图文配对步骤</a>
  </video>
  <details><summary>视频文字步骤</summary><ol><li>接通电源。</li><li>长按配对键三秒。</li><li>选择设备。</li></ol></details>
</section>`,
      `视频可播放时字幕默认开启；视频被阻断时仍可展开文字步骤或打开图文指南。
边界：poster 不是内容替代，字幕也不能代替可搜索、可复制的完整步骤。`,
    ),
    htmlExample(
      '让表格与页面元数据读取同一业务数据对象',
      'JavaScript',
      `const plan = {
  name: '企业版',
  seats: 200,
  priceCny: 39800,
  url: 'https://example.com/pricing/enterprise/'
};
document.querySelector('#plan-name').textContent = plan.name;
document.querySelector('#plan-seats').textContent = String(plan.seats);
document.querySelector('#structured').textContent = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: plan.name,
  url: plan.url,
  offers: { '@type': 'Offer', price: plan.priceCny, priceCurrency: 'CNY' }
});`,
      `表格中的套餐名、席位与 JSON-LD name/price 都来自同一个 plan 对象。
边界：页面显示 398 元而结构化数据仍写 298 元，会导致分享、搜索与用户看到的事实冲突。`,
    ),
    htmlExample(
      '用失败矩阵验收富内容企业页面',
      'JSON',
      `{
  "cases": [
    {"state":"blocked-image","mustKeep":["alt","caption","body link"]},
    {"state":"video-403","mustKeep":["poster","transcript","download"]},
    {"state":"narrow-320","mustKeep":["table scroll","no page overflow"]},
    {"state":"no-js","mustKeep":["visible values","canonical","OG image"]}
  ]
}
`,
      `四类失败均有必须保留的内容路径，验收人可按矩阵逐项重放，不需要猜测页面是否“还能看”。
边界：只在理想网络截屏无法证明媒体、表格与机器元数据在失败时仍然一致。`,
    ),
  ],
];

const HTML5_H4_EXAMPLES: HtmlStageExamples = [
  [
    htmlExample(
      '让原生链接与按钮建立键盘主线',
      'HTML + JavaScript',
      `<nav aria-label="账户"><a href="/account/">账户</a><button type="button" id="logout">退出</button></nav>
<main><h1>订单</h1><a href="/orders/42/">查看订单详情</a><button type="button">取消订单</button></main>
<script>
  document.querySelector('#logout').addEventListener('click', () => console.log('logout requested'));
  console.log([...document.querySelectorAll('a,button')].map((node) => node.textContent.trim()));
</script>`,
      `Tab 顺序依次为账户、退出、订单详情、取消订单；Enter 激活链接，Space 激活按钮。
边界：给 div 加 tabindex=0 仍不会自动获得 Enter、Space 和角色语义。`,
    ),
    htmlExample(
      '用跳转链接把键盘焦点送到 main',
      'HTML + CSS',
      `<a class="skip-link" href="#main">跳到主要内容</a>
<header><nav aria-label="主导航"><a href="/a/">产品</a><a href="/b/">价格</a></nav></header>
<main id="main" tabindex="-1"><h1>价格与方案</h1></main>
<style>
  .skip-link { position:absolute; left:-999px; }
  .skip-link:focus { left:1rem; top:1rem; padding:.75rem; background:#fff; }
  :focus-visible { outline:3px solid #1570ef; outline-offset:3px; }
</style>`,
      `页面首次按 Tab 显示“跳到主要内容”，Enter 后焦点到 main，下一次 Tab 从正文内容继续。
边界：没有 tabindex=-1 的非可聚焦 main 在某些浏览器中不会接收程序化焦点。`,
    ),
    htmlExample(
      '为所有可交互状态保留清晰焦点环',
      'HTML + CSS',
      `<button id="save">保存草稿</button>
<a href="/preview/">预览</a>
<input id="title" aria-label="标题">
<style>
  button:focus-visible, a:focus-visible, input:focus-visible {
    outline: 3px solid #175cd3;
    outline-offset: 3px;
  }
  @media (forced-colors: active) {
    :focus-visible { outline: 3px solid Highlight; }
  }
</style>
<script>
  document.querySelector('#save').focus();
  console.log('focused=', document.activeElement.id);
</script>`,
      `脚本聚焦保存按钮时出现 3px 焦点环；键盘 Tab 到链接和输入框也保持可见轮廓。
边界：全局 outline:none 会让鼠标更“干净”，但使键盘用户失去当前位置。`,
    ),
    htmlExample(
      '关闭对话框后把焦点还给触发按钮',
      'HTML + JavaScript',
      `<button id="open" aria-haspopup="dialog">删除项目</button>
<dialog id="confirm" aria-labelledby="confirm-title">
  <h2 id="confirm-title">确认删除？</h2>
  <button id="cancel">取消</button><button id="remove">删除</button>
</dialog>
<script>
  const opener = document.querySelector('#open');
  const dialog = document.querySelector('#confirm');
  opener.addEventListener('click', () => dialog.showModal());
  document.querySelector('#cancel').addEventListener('click', () => {
    dialog.close();
    opener.focus();
  });
</script>`,
      `打开对话框后焦点进入 dialog；取消关闭后 activeElement 回到“删除项目”按钮。
边界：用普通遮罩模拟模态却不隔离背景焦点，会破坏键盘和读屏上下文。`,
    ),
    htmlExample(
      '在两个浏览器和 200% 缩放下记录键盘路径',
      'PowerShell + JavaScript',
      `@'
<a href="#main">跳到主要内容</a>
<button id="menu">打开菜单</button>
<main id="main" tabindex="-1"><h1>报告</h1><a href="/next/">下一页</a></main>
<script>
  addEventListener('keydown', e => console.log(e.key, document.activeElement.id || document.activeElement.textContent.trim()));
</script>
'@ | Set-Content focus.html
pnpm exec playwright test tests/focus.spec.ts --project=chromium
pnpm exec playwright test tests/focus.spec.ts --project=firefox`,
      `Chromium 与 Firefox 均记录到跳过链接、菜单、下一页的 Tab 路径，200% 缩放时焦点环没有被裁切。
边界：只测鼠标点击无法发现屏外焦点、陷阱和浏览器差异。`,
    ),
  ],
  [
    htmlExample(
      '用原生 button 实现保存而不是伪造角色',
      'HTML + JavaScript',
      `<button id="save" type="button" aria-describedby="save-help">保存更改</button>
<p id="save-help">保存后可在版本历史恢复。</p>
<script>
  const save = document.querySelector('#save');
  save.addEventListener('click', () => console.log('saved'));
  console.log({ role: save.role || 'native button', name: save.textContent, disabled: save.disabled });
</script>`,
      `{ role: 'native button', name: '保存更改', disabled: false }
边界：div role=button 需要手写 Tab、Enter、Space、disabled 和事件，通常不如原生 button。`,
    ),
    htmlExample(
      '让可见图标文本成为稳定可访问名称',
      'HTML',
      `<button type="button" aria-label="关闭通知">
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20"><path d="M4 4l12 12M16 4L4 16"></path></svg>
</button>
<a href="/notifications/" aria-label="查看全部通知">通知 <span aria-hidden="true">3</span></a>
<script>
  console.table([...document.querySelectorAll('button,a')].map((node) => ({ text: node.textContent.trim(), label: node.getAttribute('aria-label') })));
</script>`,
      `关闭通知按钮与查看全部通知链接都有明确名称，装饰性 svg 和数字不重复朗读。
边界：aria-label 与可见文本差异过大时，语音控制用户无法按看到的文字点击。`,
    ),
    htmlExample(
      '让 aria-expanded 与真实面板状态同步',
      'HTML + JavaScript',
      `<button id="toggle" aria-expanded="false" aria-controls="filters">筛选条件</button>
<aside id="filters" hidden><label for="status">状态</label><select id="status"><option>全部</option></select></aside>
<script>
  const button = document.querySelector('#toggle');
  const panel = document.querySelector('#filters');
  button.addEventListener('click', () => {
    const next = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(next));
    panel.hidden = !next;
    console.log({ expanded: next, hidden: panel.hidden });
  });
</script>`,
      `点击后同时得到 aria-expanded=true 与 hidden=false，再点一次两者都反转。
边界：只改面板 CSS display 而不更新 expanded，会让状态与实际界面漂移。`,
    ),
    htmlExample(
      '隐藏内容时同时移出可访问树和焦点顺序',
      'HTML + JavaScript',
      `<button id="show" aria-controls="advanced" aria-expanded="false">高级设置</button>
<section id="advanced" hidden><label for="timeout">超时秒数</label><input id="timeout"></section>
<div id="decorative" aria-hidden="true"><button>装饰占位按钮</button></div>
<script>
  document.querySelector('#show').addEventListener('click', () => {
    const panel = document.querySelector('#advanced');
    panel.hidden = false;
    document.querySelector('#timeout').focus();
  });
</script>`,
      `hidden 面板中的输入框不在 Tab 顺序；展开后焦点进入 timeout，aria-hidden 区按钮不会被访问。
边界：用 opacity:0 隐藏内容仍可能接收焦点，必须同时管理可见性、可访问树和焦点。`,
    ),
    htmlExample(
      '用真实键盘模式验证自定义组合框',
      'HTML + JavaScript',
      `<label for="city">城市</label>
<input id="city" role="combobox" aria-expanded="false" aria-controls="city-list" aria-autocomplete="list">
<ul id="city-list" role="listbox" hidden><li role="option" id="shanghai">上海</li><li role="option">杭州</li></ul>
<script>
  const input = document.querySelector('#city');
  const list = document.querySelector('#city-list');
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    document.querySelector('[role="option"]').focus();
  });
</script>`,
      `输入框聚焦后按 ArrowDown 展开列表，aria-expanded=true，焦点进入第一个 option。
边界：ARIA 组合框还需要方向键、Enter、Escape、选中回填和触摸替代路径。`,
    ),
  ],
  [
    htmlExample(
      '逐状态测量文字与背景对比度',
      'HTML + CSS + JavaScript',
      `<a class="button" href="/start/">开始使用</a>
<style>
  .button { color:#fff; background:#175cd3; padding:.75rem 1rem; }
  .button:hover { background:#1849a9; }
  .button:focus-visible { outline:3px solid #f79009; outline-offset:3px; }
</style>
<script>
  const style = getComputedStyle(document.querySelector('.button'));
  console.table({ color: style.color, background: style.backgroundColor });
</script>`,
      `默认、hover 与焦点状态均保留足够对比，焦点还通过 3px 轮廓而非只改颜色表达。
边界：只测默认态会漏掉 hover 背景变深、焦点环过淡或禁用态不可读。`,
    ),
    htmlExample(
      '让错误状态同时有图标、文字和边框',
      'HTML',
      `<div class="field">
  <label for="email">邮箱</label>
  <input id="email" type="email" aria-invalid="true" aria-describedby="email-error">
  <p id="email-error" class="error"><span aria-hidden="true">!</span> 请输入包含 @ 的邮箱地址。</p>
</div>
<style>
  [aria-invalid="true"] { border: 2px solid #b42318; }
  .error { color:#b42318; font-weight:600; }
</style>`,
      `错误同时显示感叹号、具体文本和加粗边框，不依赖红色这一种视觉通道。
边界：红色边框没有错误文本时，色觉障碍和读屏用户都无法知道原因。`,
    ),
    htmlExample(
      '在 200% 缩放与窄视口检查重排',
      'HTML + CSS',
      `<main class="layout">
  <section><h1>年度账单</h1><p>所有字段在放大后仍可换行阅读。</p></section>
  <aside><a href="/invoices/2026/">下载 PDF 账单</a></aside>
</main>
<style>
  .layout { display:flex; gap:2rem; max-width:72rem; margin:auto; }
  .layout > * { min-width:0; }
  @media (max-width:48rem) { .layout { display:block; } }
  @media (zoom:2) { .layout { display:block; } }
</style>`,
      `200% 缩放后两列变为单列，正文无需整页横向滚动，长链接在容器内换行。
边界：fixed 宽度、white-space:nowrap 和 viewport 单位可能让内容在放大后溢出。`,
    ),
    htmlExample(
      '在减少动态偏好下保留必要反馈',
      'HTML + CSS',
      `<button id="save">保存设置</button><output id="status" role="status"></output>
<style>
  #status { display:inline-block; transition: opacity .8s, transform .8s; }
  #status.show { opacity:1; transform:none; }
  @media (prefers-reduced-motion: reduce) {
    #status { transition:none; }
    #status::before { content:"✓ "; }
  }
</style>
<script>
  document.querySelector('#save').onclick = () => document.querySelector('#status').classList.add('show');
</script>`,
      `普通模式淡入并上移状态；减少动态模式立即显示文本并保留“✓”反馈。
边界：直接 animation:none 而状态仍不可见，会把减少动态误做成删除反馈。`,
    ),
    htmlExample(
      '把视觉规则纳入主题与状态回归',
      'PowerShell',
      `@'
[
  {"theme":"light","state":"default","minContrast":4.5},
  {"theme":"dark","state":"hover","minContrast":4.5},
  {"theme":"light","state":"focus","minOutlinePx":3},
  {"theme":"high-contrast","state":"selected","minContrast":4.5}
]
'@ | Set-Content artifacts/visual-cases.json
node -e "const rows=require('./artifacts/visual-cases.json'); if(rows.some(r=>!r.state||!r.theme))process.exit(1); console.log(rows.length,'cases ready')"`,
      `4 cases ready
验收矩阵覆盖 light/dark/high-contrast 与 default/hover/focus/selected。
边界：只检查一套主题默认态，无法证明交互状态、高对比和用户偏好下的可读性。`,
    ),
  ],
  [
    htmlExample(
      '用真实页面内容生成 title 与 description',
      'HTML',
      `<main>
  <h1>企业数据迁移服务</h1>
  <p>将订单、客户与权限从旧系统迁移到新平台，并提供校验、回滚与培训。</p>
</main>
<title>企业数据迁移服务 | 星河科技</title>
<meta name="description" content="从旧系统迁移订单、客户与权限，提供字段校验、回滚计划和团队培训。">
<link rel="canonical" href="https://example.com/services/data-migration/">`,
      `标题与描述准确覆盖页面 h1、服务范围和交付结果，canonical 指向公开服务页。
边界：description 不是关键词堆栈，也不能承诺正文没有提供的效果。`,
    ),
    htmlExample(
      '验证 canonical 与重定向目标一致',
      'PowerShell',
      `$first = Invoke-WebRequest 'http://example.com/services/?utm_source=newsletter' -MaximumRedirection 0 -SkipHttpErrorCheck
$final = Invoke-WebRequest 'https://example.com/services/'
$canonical = [regex]::Match($final.Content, 'rel="canonical" href="(.*?)"').Groups[1].Value
@{ redirect=$first.StatusCode; location=$first.Headers.Location; final=$final.BaseResponse.RequestMessage.RequestUri.AbsoluteUri; canonical=$canonical } | ConvertTo-Json`,
      `{"redirect":301,"location":"https://example.com/services/","final":"https://example.com/services/","canonical":"https://example.com/services/"}
边界：canonical 只能表达首选 URL，不能替代 301、robots 或登录权限控制。`,
    ),
    htmlExample(
      '区分抓取限制、索引规则和页面重定向',
      'HTTP',
      `GET /private/report HTTP/1.1
Host: example.com

HTTP/1.1 302 Found
Location: /login/

GET /robots.txt
User-agent: *
Disallow: /admin/

GET /login/ HTTP/1.1
Host: example.com
X-Robots-Tag: noindex`,
      `私密报告先 302 到登录页，管理区由 robots 禁止抓取，登录页响应头声明 noindex。
边界：robots 禁止抓取不等于阻止索引；noindex 也不能阻止用户直接访问内容。`,
    ),
    htmlExample(
      '从可索引 URL 生成 sitemap 并排除参数页',
      'PowerShell',
      `$urls = @(
  'https://example.com/',
  'https://example.com/services/',
  'https://example.com/pricing/',
  'https://example.com/pricing/?ref=email'
) | Where-Object { (([uri]$_).Query.Length -eq 0) }
$entries = $urls | ForEach-Object { "  <url><loc>$($_)</loc></url>" }
"<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>" + ($entries -join [Environment]::NewLine) + "</urlset>" | Set-Content sitemap.xml
$urls`,
      `https://example.com/
https://example.com/services/
https://example.com/pricing/
sitemap 排除了带 ref 参数的重复地址。
边界：sitemap 不应包含 404、重定向、登录页或已 canonical 到其他 URL 的重复页面。`,
    ),
    htmlExample(
      '从匿名最终响应验收索引契约',
      'PowerShell',
      `$url = 'https://example.com/services/'
$response = Invoke-WebRequest $url -Headers @{ 'User-Agent'='Googlebot' }
$html = $response.Content
[pscustomobject]@{
  status = $response.StatusCode
  finalUrl = $response.BaseResponse.RequestMessage.RequestUri.AbsoluteUri
  canonical = [regex]::Match($html, 'rel="canonical" href="(.*?)"').Groups[1].Value
  noindex = $response.Headers['X-Robots-Tag'] -match 'noindex'
  robotsMeta = [regex]::Match($html, 'name="robots" content="(.*?)"').Groups[1].Value
} | ConvertTo-Json`,
      `{"status":200,"finalUrl":"https://example.com/services/","canonical":"https://example.com/services/","noindex":false,"robotsMeta":"index,follow"}
边界：必须跟随重定向、去掉登录 Cookie，并同时检查 HTML meta 与响应头 robots 规则。`,
    ),
  ],
  [
    htmlExample(
      '在根元素声明文本主语言',
      'HTML + JavaScript',
      `<html lang="zh-CN">
<head><meta charset="utf-8"><title>语言声明</title></head>
<body><main><h1>产品说明</h1><p>默认正文使用简体中文。</p></main>
<script>console.log({ lang: document.documentElement.lang, direction: getComputedStyle(document.documentElement).direction });</script>
</body>
</html>`,
      `{ lang: 'zh-CN', direction: 'ltr' }
边界：lang 描述文本语言而不是用户所在地，不能仅用“中国”或“中文版”自造标签。`,
    ),
    htmlExample(
      '只对实际外文片段做局部 lang 覆盖',
      'HTML',
      `<html lang="zh-CN">
<body>
  <h1>缓存控制</h1>
  <p>响应头中的 <code lang="en">Cache-Control: no-store</code> 禁止缓存。</p>
  <p>产品英文名为 <span lang="en">Star River</span>，中文品牌名为“星河”。</p>
</body>
</html>`,
      `正文按普通话合成，英文响应头和品牌名按英语发音，语言切换只影响对应片段。
边界：整页给每个英文单词都加 lang 会噪声过大，只标记有意义的语言片段。`,
    ),
    htmlExample(
      '用 dir 与 bdi 处理双向用户文本',
      'HTML + JavaScript',
      `<html lang="ar" dir="rtl">
<body>
  <main><h1>用户消息</h1><p>المستخدم: <bdi dir="auto">@alice_translation_42</bdi> رحب بالفريق.</p></main>
  <script>console.log({ root: document.documentElement.dir, bdi: document.querySelector('bdi').innerText });</script>
</body>
</html>`,
      `{ root: 'rtl', bdi: '@alice_translation_42' }
边界：只改 text-align:right 不会改变数字、标点和混合方向文本的解析规则。`,
    ),
    htmlExample(
      '让语言切换 URL 与 hreflang 互相指向',
      'HTML',
      `<link rel="alternate" hreflang="zh-CN" href="https://example.com/zh-CN/pricing/">
<link rel="alternate" hreflang="en" href="https://example.com/en/pricing/">
<link rel="alternate" hreflang="ja" href="https://example.com/ja/pricing/">
<link rel="alternate" hreflang="x-default" href="https://example.com/pricing/">
<nav aria-label="语言">
  <a href="/zh-CN/pricing/" lang="zh-CN" hreflang="zh-CN">简体中文</a>
  <a href="/en/pricing/" lang="en" hreflang="en">English</a>
</nav>`,
      `每个语言版本声明自身和其他版本，语言导航链接到相同的价格页面内容。
边界：只有一个版本使用 hreflang，或各版本 canonical 互相冲突，会削弱语言关系。`,
    ),
    htmlExample(
      '逐语言验证日期、货币和布局',
      'JSON',
      `[
  {"locale":"zh-CN","date":"2026年11月24日","money":"¥29,800","width":390,"overflow":false},
  {"locale":"en-US","date":"November 24, 2026","money":"$4,200.00","width":390,"overflow":false},
  {"locale":"de-DE","date":"24. November 2026","money":"3.980,00 €","width":390,"overflow":false}
]
`,
      `三个语言版本的日期、货币与千位分隔符符合 locale，390px 宽度下均无横向溢出。
边界：只替换翻译字符串而不验证格式，会让金额、日期和长词破坏业务含义与布局。`,
    ),
  ],
  [
    htmlExample(
      '用用户任务组织无障碍与 SEO 验收矩阵',
      'JSON',
      `[
  {"task":"寻找企业价格","evidence":["crawl","heading","keyboard"],"owner":"growth"},
  {"task":"提交咨询","evidence":["form-name","error","status"],"owner":"web"},
  {"task":"分享文章","evidence":["canonical","og-image","description"],"owner":"content"}
]
`,
      `三项任务分别绑定抓取、标题、键盘、表单、错误、状态、canonical 和分享图证据。
边界：按工具名组织验收容易得到漂亮分数，却遗漏用户无法完成任务的核心问题。`,
    ),
    htmlExample(
      '让自动扫描结果绑定元素与构建版本',
      'JavaScript',
      `const results = {
  build: '2026.11.24.3',
  violations: [
    { id: 'label', impact: 'serious', selector: '#newsletter input', help: 'Form elements must have labels' }
  ]
};
console.table(results.violations.map((item) => ({ id: item.id, selector: item.selector, impact: item.impact })));
if (results.violations.length) console.error('a11y violations', results.build);`,
      `id       selector             impact
label    #newsletter input     serious
错误同时带构建版本，便于修复提交后重跑同一扫描。
边界：只知道“页面有 1 个问题”而不知道元素与版本，无法形成可回归修复。`,
    ),
    htmlExample(
      '人工完成键盘与缩放任务',
      'HTML + JavaScript',
      `<a href="#main">跳到主要内容</a>
<nav aria-label="主导航"><a href="/pricing/">价格</a><a href="/contact/">联系</a></nav>
<main id="main" tabindex="-1"><h1>企业方案</h1><a href="/trial/">申请试用</a></main>
<script>
  addEventListener('keydown', (event) => {
    if (event.key === 'Tab') console.log('focus=', document.activeElement.textContent.trim());
  });
</script>`,
      `200% 缩放下 Tab 依次记录跳到主要内容、价格、联系、申请试用，焦点环始终在视口内。
边界：axe 通过不代表可以只用键盘完成试用申请，人工路径必须实际提交一次。`,
    ),
    htmlExample(
      '从公网链接图和匿名响应验证 SEO',
      'PowerShell',
      `$pages = @('https://example.com/', 'https://example.com/pricing/', 'https://example.com/contact/')
foreach ($url in $pages) {
  $r = Invoke-WebRequest $url -Headers @{ 'User-Agent'='Googlebot' }
  $links = [regex]::Matches($r.Content, 'href="(/[^"#]*)"') | ForEach-Object { $_.Groups[1].Value }
  [pscustomobject]@{ url=$url; status=$r.StatusCode; internalLinks=$links.Count; noindex=($r.Content -match 'noindex') }
} | Format-Table -AutoSize`,
      `/ 200 14 False
/pricing/ 200 9 False
/contact/ 200 7 False
边界：robots、canonical 与页面链接需要同时看，单个页面 title 不能代表整站可抓取。`,
    ),
    htmlExample(
      '把缺陷修复变成可重跑回归证据',
      'PowerShell',
      `@'
{
  "issue":"newsletter-input-has-no-label",
  "before":{"axe":"label","selector":"#email","keyboardName":""},
  "after":{"axe":"pass","selector":"#email","keyboardName":"工作邮箱"},
  "test":"tests/newsletter.a11y.spec.ts",
  "build":"2026.11.24.4"
}
'@ | Set-Content artifacts/a11y-fix.json
pnpm exec playwright test tests/newsletter.a11y.spec.ts`,
      `1 passed，修复记录包含问题、修复前后证据、测试文件和构建版本。
边界：只贴一张修复后截图不能证明同类页面或下一次构建不会回归。`,
    ),
  ],
];

const HTML5_H5_EXAMPLES: HtmlStageExamples = [
  [
    htmlExample(
      '从首屏内容反查关键请求清单',
      'HTML',
      `<main>
  <h1>企业数据平台</h1>
  <img src="/media/hero.avif" width="960" height="540" fetchpriority="high" alt="实时数据看板">
  <link rel="stylesheet" href="/assets/hero.css">
  <script type="module" src="/assets/hero.js"></script>
</main>
<p>关键请求：HTML、hero.css、hero.avif、hero.js；页脚分析脚本延后加载。</p>`,
      `首屏四类请求都有明确消费者，非首屏推荐图和统计脚本不会与标题、主图争夺带宽。
边界：把“可能是关键”的字体、图标和第三方脚本全部加入清单，会稀释真正优先级。`,
    ),
    htmlExample(
      '用 defer 与 module 保护 DOM 执行顺序',
      'HTML + JavaScript',
      `<h1 id="title">产品发布</h1>
<script defer src="/js/analytics.js"></script>
<script type="module" src="/js/app.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', () => {
    console.log({ titleReady: Boolean(document.querySelector('#title')), readyState: document.readyState });
  });
</script>`,
      `{ titleReady: true, readyState: 'interactive' }
defer 与 module 在解析后按顺序执行，不阻塞标题节点出现。
边界：无 defer 的 head 脚本若远程慢响应，会延迟正文解析和首屏出现。`,
    ),
    htmlExample(
      '为字体准备回退、子集与替换参数',
      'HTML + CSS',
      `<style>
  @font-face {
    font-family: "Brand Sans";
    src: url("/fonts/brand-zh-subset.woff2") format("woff2");
    font-display: swap;
    unicode-range: U+4E00-9FFF, U+3000-303F;
  }
  body { font-family: "Brand Sans", "PingFang SC", sans-serif; }
</style>
<main><h1>更稳定的首屏文字</h1><p>字体加载期间先显示系统回退字形。</p></main>`,
      `字体未加载时正文先使用 PingFang SC，WOFF2 子集到达后替换，CLS 由稳定行高和尺寸控制。
边界：font-display 不能修复全部布局抖动，仍需调整字体度量、回退和行高。`,
    ),
    htmlExample(
      '把聊天和复杂报表按用户动作延后加载',
      'HTML + JavaScript',
      `<button id="open-chat">打开客服</button><div id="chat-root"></div>
<script type="module">
  document.querySelector('#open-chat').addEventListener('click', async () => {
    const started = performance.now();
    const { mountChat } = await import('/js/chat-widget.js');
    mountChat(document.querySelector('#chat-root'));
    console.log({ loadedInMs: Math.round(performance.now() - started) });
  }, { once: true });
</script>`,
      `首屏不请求聊天 bundle；点击按钮后动态 import 成功并输出加载耗时。
边界：动态导入若失败必须显示可联系邮箱或电话，不能留下无响应按钮。`,
    ),
    htmlExample(
      '固定环境与版本比较同一页面的性能改动',
      'PowerShell',
      `$env = @{ url='http://127.0.0.1:4173/'; width=390; height=844; cpu=4; network='Slow 4G' }
$before = Get-Content artifacts/lh-before.json -Raw | ConvertFrom-Json
$after = Get-Content artifacts/lh-after.json -Raw | ConvertFrom-Json
[pscustomobject]@{
  lcpBefore = $before.audits['largest-contentful-paint'].numericValue
  lcpAfter = $after.audits['largest-contentful-paint'].numericValue
  sameUrl = $before.finalUrl -eq $after.finalUrl
} | ConvertTo-Json`,
      `{"lcpBefore":3120,"lcpAfter":1940,"sameUrl":true}
同一 URL、视口、CPU 和网络条件下 LCP 下降，结论才可用于判断改动收益。
边界：不同网络、缓存状态或内容版本之间的数字不能直接比较。`,
    ),
  ],
  [
    htmlExample(
      '只预加载确定会被首屏使用的图片',
      'HTML',
      `<link rel="preload" as="image" href="/media/hero-960.avif"
      imagesrcset="/media/hero-480.avif 480w, /media/hero-960.avif 960w"
      imagesizes="(max-width: 640px) 100vw, 960px"
      fetchpriority="high">
<main><h1>运营总览</h1><img src="/media/hero-960.avif" width="960" height="540" alt="实时运营指标"></main>`,
      `Network 中 AVIF 提前发起，实际候选与 img 的 srcset/sizes 保持一致并被首屏使用。
边界：preload 未命中或引用了 img 不会选择的文件，会制造重复下载和警告。`,
    ),
    htmlExample(
      '让首屏主图高优先级、次要图低优先级',
      'HTML',
      `<img src="/media/dashboard.webp" width="960" height="540"
     fetchpriority="high" decoding="async" alt="核心运营仪表盘">
<img src="/media/customer-logo.webp" width="120" height="40"
     fetchpriority="low" loading="lazy" alt="客户品牌">
<img src="/media/feature-detail.webp" width="640" height="360"
     loading="lazy" decoding="async" alt="订单详情界面">`,
      `Network Priority 中 dashboard 为 High，客户 logo 与折叠下详情较低，主图更早完成。
边界：fetchpriority 只是提示，CSS 背景图、字体和脚本仍可能争夺同一连接与主线程。`,
    ),
    htmlExample(
      '用尺寸占位与 lazy 让折叠图片进入视口再加载',
      'HTML',
      `<section>
  <h2>客户案例</h2>
  <img src="/media/case-01.webp" width="640" height="400"
       loading="lazy" decoding="async" alt="零售客户库存看板">
</section>
<section>
  <h2>实施步骤</h2>
  <img src="/media/process.webp" width="800" height="450"
       loading="lazy" decoding="async" alt="从接入到验收的四步流程图">
</section>`,
      `页面首屏不请求两张折叠图片；向下滚动接近视口时依次请求，预留高度避免内容跳动。
边界：若无 width/height 或 aspect-ratio，lazy 图片到达时仍会造成明显 CLS。`,
    ),
    htmlExample(
      '按用户意图预取下一步页面',
      'HTML + JavaScript',
      `<a id="next" href="/reports/q4/">查看第四季度报告</a>
<script>
  const link = document.querySelector('#next');
  let hinted = false;
  const prefetch = () => {
    if (hinted) return;
    hinted = true;
    const hint = document.createElement('link');
    hint.rel = 'prefetch';
    hint.href = '/reports/q4/';
    document.head.append(hint);
  };
  link.addEventListener('pointerenter', prefetch, { once: true });
  link.addEventListener('focus', prefetch, { once: true });
</script>`,
      `鼠标悬停或键盘聚焦“查看第四季度报告”后才发起 prefetch，不阻塞当前首屏。
边界：对每个链接都预取会浪费移动流量；预取页面仍需权限、缓存和失效策略。`,
    ),
    htmlExample(
      '核对资源提示是否命中并产生实际收益',
      'JavaScript',
      `const hints = performance.getEntriesByType('resource')
  .filter((entry) => /hero|report|q4/.test(entry.name))
  .map((entry) => ({
    file: new URL(entry.name).pathname,
    initiator: entry.initiatorType,
    start: Math.round(entry.startTime),
    transfer: entry.transferSize
  }));
console.table(hints);
console.log('preloadWarningSeen=', performance.getEntriesByType('resource').some((e) => e.name.includes('hero') && e.startTime < 20));`,
      `file              initiator      start transfer
/media/hero-960.avif link         18   148200
/reports/q4/       link         1840 6400
边界：资源提前出现但未使用、重复下载或抢占 LCP 资源时，提示是负收益。`,
    ),
  ],
  [
    htmlExample(
      '为每个第三方资源登记用途、权限和失败路径',
      'JSON',
      `[
  {"host":"https://analytics.example","purpose":"pageview","cookies":false,"fallback":"skip"},
  {"host":"https://js.stripe.com","purpose":"payment","cookies":true,"fallback":"show phone order"},
  {"host":"https://chat.example","purpose":"support","cookies":true,"fallback":"mailto link"}
]
`,
      `每个第三方都有业务用途、Cookie 需求和降级路径，支付与客服失败不会让核心页面失去出口。
边界：未登记的 script/iframe 可能在用户不知情时读取页面、Cookie 和输入内容。`,
    ),
    htmlExample(
      '用 integrity 锁定外部脚本内容',
      'HTML',
      `<script src="https://cdn.example.com/lib/chart-3.2.1.min.js"
        integrity="sha384-Ym9vA0lR7xwJn9G2mJfVQxS8m1n4q8F1c7p3c6m0dY7rP2sK3xL9fN4tQ6wH8jB"
        crossorigin="anonymous"></script>
<script>
  document.currentScript.addEventListener('error', () => {
    document.querySelector('#chart').textContent = '图表资源校验失败，请稍后重试';
  });
</script>`,
      `哈希匹配时脚本执行；CDN 内容被替换时浏览器因 integrity 失败拒绝执行并触发回退文本。
边界：integrity 只校验内容完整性，不证明供应商可信或脚本没有隐私行为。`,
    ),
    htmlExample(
      '用 sandbox 与 allow 只给 iframe 必需能力',
      'HTML',
      `<iframe
  src="https://player.example.com/embed/42"
  title="产品演示视频"
  width="640" height="360"
  sandbox="allow-scripts allow-same-origin allow-presentation"
  allow="fullscreen; picture-in-picture"
  referrerpolicy="strict-origin-when-cross-origin"
  loading="lazy"></iframe>`,
      `iframe 只能执行脚本、显示媒体并进入全屏，不能弹窗、提交顶层导航或读取无关能力。
边界：同时 allow-scripts 与 allow-same-origin 会显著放宽隔离，需要确认同源前提。`,
    ),
    htmlExample(
      '从 CSP 报告模式逐步收紧到强制模式',
      'HTTP',
      `Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' https://cdn.example.com; report-uri /csp-report
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.example.com; object-src 'none'; base-uri 'none'; frame-ancestors 'self'`,
      `报告模式先收集被阻止的 resource 与 directive，修复内联脚本和未登记域名后再启用强制模式。
边界：CSP 是纵深防御，不能替代输出编码、鉴权和服务端输入验证。`,
    ),
    htmlExample(
      '模拟第三方脚本失败并验证核心页面仍可用',
      'HTML + JavaScript',
      `<form id="contact"><label for="email">邮箱</label><input id="email" type="email"><button>发送</button></form>
<p id="support">客服组件不可用时，请邮件联系 <a href="mailto:support@example.com">support@example.com</a>。</p>
<script>
  window.addEventListener('error', (event) => {
    if (event.target?.src?.includes('chat.example')) {
      document.querySelector('#support').hidden = false;
      console.warn('chat vendor unavailable');
    }
  }, true);
</script>`,
      `阻断 chat.example 后核心表单仍可提交，备用邮箱入口显示，Console 只记录明确的供应商失败。
边界：若第三方脚本与主应用同步加载且异常中断入口，核心任务已不再是“可降级”。`,
    ),
  ],
  [
    htmlExample(
      '入口 HTML 短缓存、指纹资源长期缓存',
      'HTTP',
      `GET /index.html HTTP/1.1
Host: example.com

HTTP/1.1 200 OK
Cache-Control: public, max-age=0, must-revalidate
ETag: "index-2026-11-24-3"

GET /assets/app.4d91c2.js
Cache-Control: public, max-age=31536000, immutable`,
      `index.html 每次重新验证，app.4d91c2.js 因内容哈希稳定可缓存一年。
边界：给入口 HTML 设一年 immutable 会让新版本无法被发现，给无哈希资源长缓存会串版本。`,
    ),
    htmlExample(
      '用 ETag 验证条件请求返回 304',
      'PowerShell',
      `$first = Invoke-WebRequest 'https://example.com/assets/app.4d91c2.js'
$etag = $first.Headers.ETag
$second = Invoke-WebRequest 'https://example.com/assets/app.4d91c2.js' -Headers @{ 'If-None-Match'=$etag } -SkipHttpErrorCheck
[pscustomobject]@{ first=$first.StatusCode; etag=$etag; conditional=$second.StatusCode; bytes=$second.RawContentLength } | ConvertTo-Json`,
      `{"first":200,"etag":"\\"4d91c2\\"","conditional":304,"bytes":0}
边界：304 必须对应同一实体标识；ETag 被代理改写或内容变化不换值都会返回错误缓存。`,
    ),
    htmlExample(
      '按内容类型协商 Brotli 与 gzip',
      'PowerShell',
      `$headers = @{ 'Accept-Encoding'='br, gzip' }
$html = Invoke-WebRequest 'https://example.com/' -Headers $headers
$image = Invoke-WebRequest 'https://example.com/media/hero.avif' -Headers $headers
[pscustomobject]@{
  htmlEncoding = $html.Headers['Content-Encoding']
  htmlVary = $html.Headers['Vary']
  imageEncoding = $image.Headers['Content-Encoding']
} | ConvertTo-Json`,
      `{"htmlEncoding":"br","htmlVary":"Accept-Encoding","imageEncoding":null}
边界：不应重复压缩已编码图片；响应需带 Vary，中间缓存才能区分压缩与非压缩版本。`,
    ),
    htmlExample(
      '先发布指纹资源再切换入口 HTML',
      'PowerShell',
      `$version = git rev-parse --short HEAD
aws s3 sync dist/assets "s3://static.example.com/assets/" --cache-control "public,max-age=31536000,immutable"
aws s3 cp dist/index.html "s3://static.example.com/index.html" --cache-control "public,max-age=0,must-revalidate"
aws cloudfront create-invalidation --distribution-id E123 --paths "/index.html"
@{ version=$version; assetsFirst=$true; entryInvalidated=$true } | ConvertTo-Json`,
      `{"version":"4d91c2e","assetsFirst":true,"entryInvalidated":true}
边界：先清入口再上传新指纹资源，会让一部分用户请求到不存在的脚本和样式。`,
    ),
    htmlExample(
      '在无缓存、已缓存和过期三种状态验收发布',
      'PowerShell',
      `$url = 'https://example.com/'
$fresh = Invoke-WebRequest $url -Headers @{ 'Cache-Control'='no-cache' }
$etag = $fresh.Headers.ETag
$revalidated = Invoke-WebRequest $url -Headers @{ 'If-None-Match'=$etag } -SkipHttpErrorCheck
$asset = Invoke-WebRequest 'https://example.com/assets/app.4d91c2.js' -Method Head
[pscustomobject]@{ fresh=$fresh.StatusCode; revalidated=$revalidated.StatusCode; assetCache=$asset.Headers['Cache-Control'] } | ConvertTo-Json`,
      `{"fresh":200,"revalidated":304,"assetCache":"public, max-age=31536000, immutable"}
边界：只测浏览器强刷会绕过缓存策略，必须分别观察首次、条件和长期缓存行为。`,
    ),
  ],
  [
    htmlExample(
      '把 LCP、CLS、INP 与 TTFB 映射到不同体验问题',
      'JSON',
      `{
  "ttfb": "服务器与网络开始响应的时间",
  "lcp": "视口内最大内容完成呈现的时间",
  "cls": "加载期间意外布局移动的累计分数",
  "inp": "用户交互到下一帧可响应的延迟"
}
`,
      `四个指标分别指向后端响应、主内容、视觉稳定性和交互响应，不能用一个总分替代定位。
边界：LCP 快但 CLS 高仍会让用户点错按钮，TTFB 低也不能保证主线程交互顺畅。`,
    ),
    htmlExample(
      '用 PerformanceObserver 捕获 LCP 与布局移动',
      'HTML + JavaScript',
      `<script>
  let lcp = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) lcp = entry.startTime;
    console.log('lcp-ms', Math.round(lcp));
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    const shift = list.getEntries().reduce((sum, entry) => sum + (entry.hadRecentInput ? 0 : entry.value), 0);
    if (shift) console.log('cls-delta', shift.toFixed(4));
  }).observe({ type: 'layout-shift', buffered: true });
</script>`,
      `lcp-ms 1940
cls-delta 0.0214
采集只读取性能条目，不主动修改 DOM，避免观测代码制造新的布局移动。
边界：隐藏页面或后台标签的 LCP 不具代表性，上报需按可见性和页面状态过滤。`,
    ),
    htmlExample(
      '按 P75、页面模板和设备分位数上报',
      'JSON',
      `{
  "metric":"lcp",
  "page":"pricing",
  "device":"mobile",
  "sample":4820,
  "p50":1780,
  "p75":2460,
  "p95":5120,
  "release":"2026.11.24.3"
}
`,
      `pricing 移动端 P75 为 2460ms，P95 为 5120ms；样本与版本足以定位受影响群体。
边界：只上报平均值会掩盖尾部体验，没有页面模板和版本就无法关联发布回退。`,
    ),
    htmlExample(
      '为 LCP 与 CLS 建立按模板的回归门槛',
      'JSON',
      `{
  "pricing": {"lcpP75":2500,"clsP75":0.1,"inpP75":200},
  "docs": {"lcpP75":2500,"clsP75":0.1,"inpP75":200},
  "requiredRelease": "2026.11.24.4",
  "action": "block rollout when two consecutive windows exceed any budget"
}
`,
      `两个模板分别有 LCP、CLS、INP 门槛，连续两个窗口超限会阻断发布并保留版本。
边界：预算若没有页面模板、窗口和动作，只是一组不会影响发布的数字。`,
    ),
    htmlExample(
      '从 RUM 指标回溯到资源与 DOM 证据',
      'JavaScript',
      `const signal = { page:'/pricing/', metric:'lcp', value:4200, release:'2026.11.24.3' };
const resources = performance.getEntriesByType('resource')
  .filter((entry) => entry.renderBlockingStatus === 'blocking' || entry.name.includes('hero'))
  .map((entry) => ({ file: entry.name, start: Math.round(entry.startTime), duration: Math.round(entry.duration) }));
const lcpElement = document.querySelector('[data-lcp]')?.outerHTML.slice(0, 120);
console.log({ signal, lcpElement, resources });`,
      `signal /pricing/ lcp 4200；lcpElement 指向首屏主图；resources 显示阻塞 CSS 与图片启动时间。
边界：RUM 只说明哪页慢，资源、元素和构建证据才能解释为什么慢以及下一步修哪里。`,
    ),
  ],
  [
    htmlExample(
      '冻结公开 URL、页面身份和内容来源',
      'JSON',
      `{
  "pages": [
    {"path":"/","title":"企业数据平台","h1":"让数据成为日常决策","source":"content:home"},
    {"path":"/pricing/","title":"价格与方案","h1":"按团队规模选择","source":"content:pricing"}
  ],
  "owner":"web-platform",
  "changeRule":"URL or title changes require redirect review"
}
`,
      `首页和价格页都有稳定 URL、title、h1、内容来源与负责人，公开身份变更需检查重定向。
边界：直接从设计稿手写页面而忽略内容来源，会让价格、标题和分享信息产生多套真相。`,
    ),
    htmlExample(
      '用页面模板强制地标、标题和表单基线',
      'HTML',
      `<a href="#main">跳到主要内容</a>
<header><a href="/">星河科技</a></header>
<nav aria-label="主导航"><a href="/pricing/">价格</a></nav>
<main id="main" tabindex="-1"><h1>{{page-title}}</h1><slot></slot></main>
<footer><a href="/privacy/">隐私政策</a></footer>
<p>构建时若缺少 page-title 或出现第二个 main，模板检查应失败。</p>`,
      `新页面自动获得跳转链接、带名称导航、唯一 main、可见 h1 和全站页脚。
边界：模板只能约束结构，页面负责人仍需验证真实标题、内容和关键任务。`,
    ),
    htmlExample(
      '把媒体、SEO 与性能预算写成发布门禁',
      'JSON',
      `{
  "budgets": {
    "initialJsKb": 180,
    "initialImageKb": 220,
    "cssKb": 70,
    "lcpP75Ms": 2500,
    "clsP75": 0.1
  },
  "metadata": ["title","description","canonical","og:image"],
  "media": ["width","height","alt"]
}
`,
      `JS、图片、CSS、LCP、CLS、元数据和媒体必需属性全部进入同一预算对象。
边界：没有版本化产物与固定测量环境，预算只是一条无法比较的建议值。`,
    ),
    htmlExample(
      '让发布顺序、缓存头和回滚目标都可执行',
      'PowerShell',
      `$release = @{
  id = (git rev-parse --short HEAD)
  assetPath = 's3://static.example.com/assets/'
  entryPath = 's3://static.example.com/index.html'
  rollbackEntry = 's3://backup/index.previous.html'
  smoke = @('/','/pricing/','/contact/')
}
Copy-S3Object -BucketName static.example.com -Key index.html -DestinationKey backup/index.previous.html
$release | ConvertTo-Json | Set-Content artifacts/release.json
$release.smoke | ForEach-Object { (Invoke-WebRequest ('https://example.com' + $_)).StatusCode }`,
      `发布记录包含构建 ID、资源入口、回滚对象和三个冒烟 URL；每个 URL 返回 200 才继续放量。
边界：只备份 HTML 而遗漏配置、图片或 CDN 缓存，无法恢复完整版本。`,
    ),
    htmlExample(
      '用毕业运行手册重放监控、回滚与验收',
      'JSON',
      `{
  "alerts": [
    {"name":"homepage-lcp-p75","threshold":3000,"owner":"web"},
    {"name":"contact-submit-error","threshold":"2%","owner":"growth"}
  ],
  "runbook": ["freeze release","restore previous HTML","purge entry cache","verify LCP and form","record incident"],
  "graduation": ["mobile","keyboard","anonymous crawl","rollback","handover"]
}
`,
      `告警、负责人、回滚步骤和毕业验收都可逐条执行，另一位工程师无需作者在场即可重放。
边界：只有指标看板没有负责人和恢复动作，遇到回退时仍然不算完成运行手册。`,
    ),
  ],
];

export const HANDWRITTEN_HTML5_H0_COURSES = withHtmlExamples(HANDWRITTEN_HTML5_H0_BASE, HTML5_H0_EXAMPLES);
export const HANDWRITTEN_HTML5_H1_COURSES = withHtmlExamples(HANDWRITTEN_HTML5_H1_BASE, HTML5_H1_EXAMPLES);
export const HANDWRITTEN_HTML5_H2_COURSES = withHtmlExamples(HANDWRITTEN_HTML5_H2_BASE, HTML5_H2_EXAMPLES);
export const HANDWRITTEN_HTML5_H3_COURSES = withHtmlExamples(HANDWRITTEN_HTML5_H3_BASE, HTML5_H3_EXAMPLES);
export const HANDWRITTEN_HTML5_H4_COURSES = withHtmlExamples(HANDWRITTEN_HTML5_H4_BASE, HTML5_H4_EXAMPLES);
export const HANDWRITTEN_HTML5_H5_COURSES = withHtmlExamples(HANDWRITTEN_HTML5_H5_BASE, HTML5_H5_EXAMPLES);
