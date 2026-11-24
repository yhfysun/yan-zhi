// CSS3 独立课程 · 36 门逐课手写教案
// 课程名必须与 programs.ts 中 detailedStage 生成的 `CSS3 · 阶段：主题` 完全一致。
import type { ProgrammingCourseSeed } from '../shared.js';
import type { LearningV2LessonExample } from '../../../v2-types.js';

const track = 'P14 · 独立语言课程' as const;
const css3Name = (stage: string, topic: string) => `CSS3 · ${stage}：${topic}`;

type CssStageExamples = readonly (readonly LearningV2LessonExample[])[];

function withCssExamples(
  courses: readonly ProgrammingCourseSeed[],
  stageExamples: CssStageExamples,
): readonly ProgrammingCourseSeed[] {
  if (stageExamples.length !== courses.length) {
    throw new Error(`CSS3 example course count: ${stageExamples.length} != ${courses.length}`);
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

const cssExample = (
  title: string,
  language: string,
  code: string,
  output: string,
): LearningV2LessonExample => ({ title, language, code, output });

// ── C0 级联、继承与盒模型 ────────────────────────────────────────────────────
const c0Stage = '级联、继承与盒模型';

const HANDWRITTEN_CSS3_C0_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: css3Name(c0Stage, '作者样式、继承、层叠层与顺序'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能编写 HTML 页面，并在浏览器 DevTools 中定位元素和查看 Styles 面板。',
    goal: '能按来源、重要性、层叠层、特异性与出现顺序判断声明胜负，区分直接声明和继承值，并用 DevTools 找到被覆盖的规则。',
    guidedPractice: '准备一个按钮，分别写入浏览器默认样式、`button { color: black }`、`@layer base { button { color: green } }` 和 `button { color: red }`。在 Elements 面板逐条取消勾选声明，记录最终颜色、被划掉的规则和计算值。',
    independentPractice: '建立一个包含 reset、theme、components 三层的样式文件，故意让未分层规则与三层规则争夺同一个 `--space` 和按钮背景，画出一张按优先级排序的声明清单，再用 `getComputedStyle` 核对。',
    commonErrors: [
      '把选择器特异性排在来源与重要性之前，误以为 `.button` 一定打败用户代理样式。',
      '把继承值当成元素自己的声明，排查时忽略了父元素上真正生效的 `color` 或 `line-height`。',
    ],
    sourceRefs: [
      'W3C CSS Cascading and Inheritance Level 5. https://www.w3.org/TR/css-cascade-5/',
      'MDN CSS Cascade. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascade',
      'MDN Cascade layers. https://developer.mozilla.org/en-US/docs/Web/CSS/@layer',
    ],
    steps: [
      [
        '来源和重要性先比较',
        '浏览器用一张按来源排序的声明表计算样式：用户代理默认、用户样式和作者样式属于不同来源，`!important` 又会反转来源之间的优先级。选择器只在同一来源和同一重要性层级内继续比较，因此页面里的 `.button` 无法无条件压过浏览器或用户的关键设置。验证时在 DevTools Matched Rules 中查看声明来源标签，再把同一属性分别写成普通声明和重要声明，确认胜负发生改变。',
        '先看来源，再谈选择器',
      ],
      [
        '继承只填补空缺',
        '继承不是父元素主动把属性“传下去”，而是某个属性标注为 inherited 后，当前元素没有任何层叠值时才采用父元素的计算值。`color`、`font-family`、`visibility` 会继承，`display`、`margin`、`border` 不会；显式写 `inherit` 可以主动取父值，`initial` 则回到属性的初始值。把父元素颜色改掉但仍被子规则直接覆盖时，子元素不会变化，这正好证明直接声明优先于继承。',
        '有直接声明时继承不参与',
      ],
      [
        '层叠层固定组间顺序',
        '@layer 把规则放进命名组，组的先后顺序在第一次出现名称时确定。普通声明中，未分层作者规则高于已分层规则，层间顺序相同的选择器不能靠增加类名跨越层；重要声明按相反方向处理层顺序。先用 `@layer reset, theme, components;` 声明顺序，再在三个层内写同一属性，最后新增一条未分层 `body .button` 观察结果，能看清层与特异性的边界。',
        '先定层序，再写规则',
      ],
      [
        '同层才轮到特异性与顺序',
        '来源、重要性、层叠层都相同后，浏览器才比较特异性；特异性也相同，则后出现的声明获胜，外部样式表与内联 style 的插入顺序会影响结果。不要把文件导入顺序当作唯一依据，构建工具可能合并或重排 CSS。做法是给冲突规则加固定层名，在 DevTools 查看规则来源文件和行号，再移动一条声明的前后位置，验证只有顺序变化时结果是否翻转。',
        '胜负是逐级比较的结果',
      ],
      [
        '建立可复查的层叠基线',
        '组件基线应先定义 reset、tokens、base、components、utilities 五层，并禁止随意使用 `!important`。每个组件只在自己层内处理默认态，跨组件覆盖进入明确的上层；父级只提供继承的字体与颜色，尺寸和边框由组件自身声明。验收时同时检查 Chrome 与 Firefox 的 Styles 面板，确认同一个 `data-state` 下没有来源不明的胜利声明，并保存冲突前后的计算值截图。',
        '让每条覆盖都有明确层级',
      ],
    ],
  },
  {
    name: css3Name(c0Stage, '选择器特异性与作用域'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '理解一条 CSS 声明由选择器、属性和值组成，并知道浏览器会保存匹配规则。',
    goal: '能计算常见选择器组合的特异性，区分 `:where()`、`:is()` 与 `:not()` 的参数计分规则，并用 `@scope` 限制组件样式的影响范围。',
    guidedPractice: '为同一张卡片编写 `#app .card`、`.card[data-featured]`、`:where(.card)` 和 `@scope (.card) to (.card__content)` 四组规则，逐组读取 DevTools 中显示的特异性，临时删掉 `:where()` 再观察胜负变化。',
    independentPractice: '把一个全局 `.title` 规则改造成组件作用域方案：使用数据属性根选择器、`:where()` 降低重置权重，并用 `@scope` 把正文排除在页眉样式之外。写出三条冲突测试断言并在两个浏览器核对。',
    commonErrors: [
      '把 `:where()` 当成普通类选择器计分，导致低权重重置意外覆盖组件声明。',
      '用内联样式或 `!important` 快速修补组件泄漏，却没有确认 `@scope` 的作用域边界。',
    ],
    sourceRefs: [
      'MDN CSS Specificity. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascade/Specificity',
      'W3C CSS Cascading and Inheritance Level 6. https://www.w3.org/TR/css-cascade-6/',
      'MDN @scope. https://developer.mozilla.org/en-US/docs/Web/CSS/@scope',
    ],
    steps: [
      [
        '特异性是三元组',
        '特异性通常按 ID、类和类型三个分量比较，例如 `#app` 是 `(1,0,0)`，`.card[data-featured]` 是 `(0,2,0)`，`article > h2` 是 `(0,0,2)`。它不按字符串长度计算，也不是四个独立的“权重分”；只有层叠前序阶段相同，三元组才参与决胜。用 DevTools 选中元素并查看 Styles 面板上方的 specificity 提示，再用两个只差一个类名的规则验证比较结果。',
        '按分量从左到右比较',
      ],
      [
        '函数伪类的计分边界',
        '`:is()`、`:not()`、`:has()` 本身不计分，取参数列表中最高的特异性；`:where()` 连参数一起归零，适合做不打扰业务规则的 reset。`nth-child()` 的 `of` 参数也会计入，而伪元素会在类型位之外贡献一个元素级分量。把同一组 `.card:is(.is-selected, #hero)` 与 `.card:where(.is-selected, #hero)` 并列，查看前者采用 ID 参数、后者完全失效的差异。',
        '函数参数可能抬高权重',
      ],
      [
        '低权重 reset 的用途',
        '元素默认边距、列表样式和标题字重适合放在低权重规则里，让组件的一两个类名即可覆盖。`@layer reset { :where(h1, h2, h3) { margin-block: 0 } }` 同时降低层优先级和选择器权重，因此不会追着业务选择器比拼。验证时在组件层写 `h2 { margin-block-start: 1rem }`，确认它能稳定生效，再移除 `:where()` 观察 reset 是否突然胜出。',
        'reset 不应与组件抢权重',
      ],
      [
        '作用域限制边界',
        '`@scope (.card) to (.card__content)` 把 `.card` 作为根，`.card__content` 作为下边界，根与边界之间的元素才匹配作用域规则。作用域邻近度只在特异性之后参与决胜，它不能让低来源规则越过 `!important`。先给嵌套卡片各写一条标题规则，再检查 DevTools 的作用域匹配，最后把边界选择器写错，确认内层卡片重新被污染。',
        '作用域解决隔离，不替代层叠',
      ],
      [
        '用浏览器能力检测兜底',
        '`@scope` 在旧浏览器中可能被整段忽略，因此组件仍需要可识别的根属性，例如 `[data-card]`，并为关键样式提供普通类选择器回退。使用 `CSS.supports("selector(:is(.a))")` 检查选择器能力，用固定浏览器矩阵验证新旧版本。最终检查三项：根外元素不受影响、内层边界不被误命中、删除作用域规则时回退样式仍能保持可读。',
        '隔离方案必须有降级路径',
      ],
    ],
  },
  {
    name: css3Name(c0Stage, '盒模型、逻辑属性与 box-sizing'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能使用 width、padding、border 和 margin 控制普通块级元素。',
    goal: '能解释 content-box 与 border-box 的尺寸差异，使用逻辑属性适配书写方向，并判断内边距过大时浏览器的实际盒尺寸。',
    guidedPractice: '创建两个宽度均为 `200px`、内边距均为 `24px`、边框均为 `2px` 的盒子，分别使用 `content-box` 与 `border-box`。在 DevTools Layout 面板记录内容区、padding、border 和 offsetWidth，再把页面改成 `direction: rtl` 对比 `margin-left` 与 `margin-inline-start`。',
    independentPractice: '为一个支持中英文与阿拉伯语的卡片编写只使用逻辑属性的尺寸方案，要求 `padding-block`、`border-inline-start` 和 `margin-inline` 在 `writing-mode: vertical-rl` 下仍对应正确视觉边，并用截图与计算值证明。',
    commonErrors: [
      '设置 `box-sizing: border-box` 后仍把 width 当作内容宽，忘记指定尺寸会包含 padding 与 border。',
      '混用 `border-inline-start` 与 `border-left`，当书写方向改变时后写的物理属性覆盖逻辑映射。',
    ],
    sourceRefs: [
      'MDN CSS Box Model. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_box_model',
      'W3C CSS Logical Properties and Values. https://www.w3.org/TR/css-logical-1/',
      'MDN box-sizing. https://developer.mozilla.org/en-US/docs/Web/CSS/box-sizing',
    ],
    steps: [
      [
        '两种盒尺寸的计算',
        '在 `box-sizing: content-box` 下，`width: 200px` 只约束内容区，实际边框盒宽度还要加左右 padding 与 border；切到 `border-box` 后，声明的 200px 包含内容区、padding 与 border。若左右 padding 合计已超过可用宽度，内容区不会被压成负数，浏览器会让边框盒超出声明值或触发溢出，所以小尺寸容器要同时检查 `getBoundingClientRect().width`。',
        'width 约束的对象并不相同',
      ],
      [
        '全局 border-box 的边界',
        '常见的 `*, *::before, *::after { box-sizing: border-box }` 让组件宽高更容易预测，但不会改变替换元素、表格布局和 `box-sizing: content-box` 显式规则的内部算法。高度 40px 的按钮仍可能因行高、min-height 或字体回退而变高。验收时同时读取 computed `box-sizing`、offsetWidth、offsetHeight 和内容滚动尺寸，不能只看 CSS 文件里的数字。',
        '声明尺寸不是最终尺寸',
      ],
      [
        '逻辑轴如何映射',
        '逻辑属性按 `writing-mode` 和 `direction` 映射到物理边：`inline-start` 在从左到右横排中对应左边，在从右到左时对应右边；`block-start` 在竖排中会改变方向。`padding-inline`、`margin-block` 和 `border-inline-end` 可以一次表达轴上的空间，不依赖页面永远横排。把父容器改成 `writing-mode: vertical-rl`，再对比计算样式中的映射结果即可验证。',
        '先认轴，再认屏幕方向',
      ],
      [
        '逻辑与物理属性冲突',
        '逻辑属性与物理属性最终都会映射到同一组盒模型长写属性，层叠时后出现或更高层级的声明胜出。例如先写 `border-inline-start-color: red`，再写 `border-left-color: blue`，横排从左到右时后者可能覆盖前者。团队应明确组件只用一组写法；迁移旧代码时按组件清单替换，并用 DevTools Computed 检查四个物理边最终值。',
        '最终只保留一套映射',
      ],
      [
        '尺寸验收写成测量表',
        '验收一个响应式卡片时，记录视口宽、内容宽、padding、border、`scrollWidth` 与 `clientWidth`，并分别测试 `ltr`、`rtl` 和竖排。目标是内容区非负、边框盒不超过父容器可分配宽度、逻辑边在方向变化后仍与预期一致。对固定尺寸控件再加 200% 页面缩放，确认文字放大后没有裁切或不可达的溢出内容。',
        '尺寸结论必须来自测量',
      ],
    ],
  },
  {
    name: css3Name(c0Stage, '长度、百分比、fr、min/max 与 clamp'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '知道 px、百分比和 rem 的基本写法，并能使用浏览器计算样式面板。',
    goal: '能按参照物选择 px、rem、ch、vw、百分比等长度，理解 `fr` 分配剩余空间、`minmax()` 设置轨道边界以及 `clamp()` 的三段计算。',
    guidedPractice: '在 Grid 容器中分别写 `1fr 2fr`、`minmax(120px, 1fr) minmax(0, 2fr)` 和 `repeat(3, minmax(80px, 1fr))`，拉宽窗口并记录每列使用宽度。再对标题使用 `clamp(1rem, 0.8rem + 1vw, 1.5rem)`，读取最小、当前和最大三档计算值。',
    independentPractice: '为一个仪表盘写出四条轨道：固定图标列、可收缩主列、最小 240px 的详情列和随内容出现的状态列。要求窄屏时通过 `minmax(0, 1fr)` 与断点避免横向溢出，并提交各轨道在 320、768、1440px 的实测宽度。',
    commonErrors: [
      '把 `fr` 当作百分比，忽略 gap、固定轨道和内容最小尺寸会先占用可用空间。',
      '在 `minmax(auto, 1fr)` 中放入长单词或宽表格，轨道被内容最小宽度撑破，误判为 Grid 失效。',
    ],
    sourceRefs: [
      'W3C CSS Values and Units Level 4. https://www.w3.org/TR/css-values-4/',
      'MDN CSS values and units. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Values_and_Units',
      'W3C CSS Grid Layout Level 1. https://www.w3.org/TR/css-grid-1/',
    ],
    steps: [
      [
        '长度单位各有参照物',
        '`px` 是 CSS 像素，不等同于物理像素；`rem` 相对根元素字号，`em` 相对当前元素或其继承得到的字号；`ch` 近似数字 0 的宽度，适合限制阅读行宽；`vw` 相对视口宽，容器内部则应谨慎使用。选择单位前先问“这个值要随谁变化”。用 DevTools 修改根字号并读取 `getComputedStyle`，可以直接观察 rem 与 em 的差异。',
        '单位必须先确定参照物',
      ],
      [
        '百分比依赖包含块',
        '横向 `width: 50%` 通常相对包含块的内容宽计算，纵向 `height: 50%` 只有在包含块高度可确定时才有稳定结果；`padding-top: 10%` 也按包含块宽度计算，而不是高度。绝对定位元素的百分比还会受 inset 与包含块共同影响。验证时要查看包含块尺寸、父级高度声明和计算后的像素值，不能只看百分比字面量。',
        '百分比没有独立含义',
      ],
      [
        'fr 分配的是剩余空间',
        'Grid 的 `1fr 2fr` 先把 gap、固定轨道与其他不可伸缩轨道占用的空间扣除，再把剩余空间按份数分配；`fr` 的最小值默认可受内容最小尺寸影响。`minmax(0, 1fr)` 明确允许轨道缩到零，常用于表格和长文本列。把长字符串放进两种写法中，观察 `gridTemplateColumns` 和 `scrollWidth`，就能看到内容最小尺寸造成的差异。',
        'fr 有最小值，不一定能无限缩',
      ],
      [
        'minmax 与 clamp 的边界',
        '`minmax(180px, 1fr)` 表示轨道不窄于 180px，并把可用剩余空间分配给它的最大值；当所有最小轨道与 gap 之和超过容器，网格仍会溢出。`clamp(min, preferred, max)` 先计算中间值，再限制到上下界，浏览器在不同宽度下选择端点。检查 `getComputedStyle` 的实际值和容器 `scrollWidth`，避免最小轨道承诺超过视口，也避免字号上限阻碍用户放大。',
        '最小值也会制造溢出',
      ],
      [
        '先定约束再挑单位',
        '布局计算可以按三层推进：不可缩内容用 min-content 或固定最小值，弹性区域用 `minmax(0, 1fr)`，附加空间用 gap 或合理上限。把四条轨道在 320px 下从右到左删减，记录哪条轨道先触底、何时出现横向滚动，再在 1440px 检查是否留下过宽空白。最终验收同时比对截图和计算尺寸，不靠肉眼猜测。',
        '约束比魔法数值更稳定',
      ],
    ],
  },
  {
    name: css3Name(c0Stage, '溢出、换行、滚动容器与文字截断'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能设置元素宽度，并知道浏览器中存在内容区与滚动尺寸两类尺寸。',
    goal: '能区分 overflow 的裁切与滚动语义，选择 word-break、overflow-wrap、white-space 控制换行，并实现可验证的单行与多行截断。',
    guidedPractice: '制作三个 240px 宽容器，分别放入长 URL、连续中文和带空格的英文段落。依次尝试 `overflow-wrap: anywhere`、`word-break: break-all`、`white-space: nowrap` 与 `text-overflow: ellipsis`，记录 `clientWidth`、`scrollWidth`、可见行数和滚动位置。',
    independentPractice: '实现一个带固定表头的横向表格滚动区，要求键盘可聚焦、滚动条占位稳定、表头粘性、长单元格按单词换行而长 URL 可断行。用 Playwright 检查 `scrollWidth > clientWidth` 时容器仍可横向滚动。',
    commonErrors: [
      '只写 `text-overflow: ellipsis`，却没有 `white-space: nowrap`、受限宽度和 `overflow: hidden`，结果只裁切不显示省略号。',
      '把 `overflow: hidden` 当成彻底移除滚动，忽略了内容仍可通过代码或键盘滚动，造成不可见内容失焦。',
    ],
    sourceRefs: [
      'W3C CSS Overflow Level 3. https://www.w3.org/TR/css-overflow-3/',
      'MDN text-overflow. https://developer.mozilla.org/en-US/docs/Web/CSS/text-overflow',
      'MDN overflow-wrap. https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-wrap',
    ],
    steps: [
      [
        'overflow 先建立裁切语义',
        '`overflow: visible` 允许内容从盒子外绘制，`hidden` 裁切且通常仍建立滚动容器，`auto` 只在需要时显示滚动条，`scroll` 始终保留滚动能力。两个轴的 `visible` 与 `hidden` 组合会被浏览器协调成可计算的值。验收时读取 computed `overflow-x/y`、`scrollWidth` 与 `clientWidth`，再尝试 `scrollLeft = 50`，确认视觉裁切不等于内容消失。',
        '裁切与滚动不是同一件事',
      ],
      [
        '换行属性解决不同断点',
        '`overflow-wrap: break-word` 只在单词无法放入行内时允许断行，`anywhere` 还会影响最小内容尺寸；`word-break: break-all` 更激进，可能把正常英文单词从中间切断；`white-space: nowrap` 则禁止源码中的换行折叠。长 URL 先选 `overflow-wrap: anywhere`，正文优先保持正常词边界，再通过 `hyphens: auto` 与语言属性改善断词。',
        '按语言和内容选择断行策略',
      ],
      [
        '单行截断的完整条件',
        '经典单行省略需要 `overflow: hidden`、`white-space: nowrap`、`text-overflow: ellipsis`，并且元素实际可用宽度小于文本宽度。若父级是 Grid 或 Flex 项，还要处理 `min-width: auto` 导致的不收缩。检查 `scrollWidth > clientWidth` 与 computed `text-overflow`，同时保存悬停标题或可访问完整名称，避免视觉文本成为唯一信息来源。',
        '省略号需要受限的轴线',
      ],
      [
        '多行截断与可展开边界',
        '`display: -webkit-box`、`-webkit-line-clamp: 3` 和 `-webkit-box-orient: vertical` 是常见多行截断组合，`line-clamp` 的标准化仍在推进。它按行盒截断，遇到超长单词仍可能溢出，因此要配合 `overflow-wrap`。截断不是完整内容替代方案：保留原始文本的可访问名称，并提供展开动作；验收时检查 3 行、极窄容器和字体放大后是否仍保持可理解。',
        '多行截断要保留完整内容出口',
      ],
      [
        '滚动容器要有可操作边界',
        '横向滚动区可以设置 `overflow-x: auto`、`overscroll-behavior-inline: contain` 和 `scrollbar-gutter: stable`，但必须让键盘用户能把焦点移入。表格外层加 `tabindex="0"` 与可读的 `aria-label`，并避免用 `outline: none` 删除焦点。验证条件是键盘 Tab 可进入、方向键或 Shift 滚轮可浏览、`scrollWidth` 变化时滚动条占位不导致布局跳动。',
        '滚动区域也要纳入键盘路径',
      ],
    ],
  },
  {
    name: css3Name(c0Stage, '级联调试与组件样式基线'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '已完成本阶段前五课，能读取 DevTools 的 Styles、Computed 与 Layout 面板。',
    goal: '能建立有明确层序、低权重 reset、尺寸约束和可覆盖接口的组件样式基线，并用计算样式与截图验证覆盖结果。',
    guidedPractice: '为一个通知组件创建 `reset.css`、`tokens.css` 和 `notice.css`，按 `reset, tokens, base, components` 声明层序。用 DevTools 的 Computed 面板检查 padding、border、色值和字号，再临时插入一条未分层 `.notice` 规则，记录它如何改变层间胜负。',
    independentPractice: '为现有页面的按钮、输入框和卡片各写一份样式基线清单，包含默认态、尺寸下限、可继承属性、可覆盖 Token 和禁止使用 `!important` 的边界。用三条跨组件冲突用例证明样式不会泄漏。',
    commonErrors: [
      '没有固定层序，随后新增的文件位置改变导致同名规则胜负漂移。',
      '组件同时暴露大量物理尺寸与内部选择器，外部主题只能靠高特异性覆盖。',
    ],
    sourceRefs: [
      'MDN CSS Cascade and inheritance. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascade',
      'web.dev Learn CSS. https://web.dev/learn/css',
      'W3C CSS Cascading and Inheritance Level 5. https://www.w3.org/TR/css-cascade-5/',
    ],
    steps: [
      [
        '先固定层序再写规则',
        '基线文件第一行明确 `@layer reset, tokens, base, components, utilities;`，后续每段样式只进入对应层。层名首次出现顺序会固定组间优先级，因此不应散落在多个文件里重复猜顺序。把同一条按钮背景分别放进 base、components 和未分层规则，记录三层覆盖结果；再用构建后 CSS 检查顺序是否仍一致。',
        '层序需要成为架构约定',
      ],
      [
        'reset 只处理共同起点',
        '低权重 reset 用 `:where(*)`、`:where(button, input)` 统一 `box-sizing`、字体继承和 margin，不负责业务外观。这样组件只需一个类即可覆盖，不必反复增加选择器。验收时故意给 reset 增加 `/deep/` 类式的高权重规则，观察组件是否失去可覆盖性，再移除它恢复低权重。',
        'reset 的目标是少争夺',
      ],
      [
        '组件接口写成语义变量',
        '通知组件对外暴露 `--notice-surface`、`--notice-accent`、`--notice-padding`，内部尺寸与排版从这些变量派生。外部主题只设置变量，不直接改 `.notice__body`，组件即可在亮暗主题复用。用 `var(--notice-accent, currentColor)` 提供回退，并测试变量为空、非法色值和未定义三种情况下的可读性。',
        '变量是组件与主题的契约',
      ],
      [
        '用计算样式验证覆盖',
        '完成视觉检查后，读取 `getComputedStyle` 中的 `padding-block`、`border-inline-start-width`、`color` 与 `font-size`，并比对 DevTools 面板显示的实际来源。计算值能揭示逻辑属性映射和继承结果，截图能发现布局与绘制问题，两者缺一不可。把验证结果写进组件清单，后续改 Token 时可直接复跑。',
        '样式结论要有两层证据',
      ],
      [
        '补齐组件冲突用例',
        '至少准备四个用例：同名类跨组件不互相污染、父级字号改变时只有继承属性变化、外部主题变量能覆盖组件默认值、未定义变量时回退仍可读。每个用例记录输入选择器、层位置、预期 computed 值和失败截图。通过者才算组件基线稳定，后续新增状态只能扩展接口，不能靠提高选择器权重修补。',
        '冲突用例是基线的护栏',
      ],
    ],
  },
];

// ── C1 Flex、Grid 与页面布局 ─────────────────────────────────────────────────
const c1Stage = 'Flex、Grid 与页面布局';

const HANDWRITTEN_CSS3_C1_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: css3Name(c1Stage, 'Flex 主轴、交叉轴、伸缩与换行'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能设置块级元素的宽高、padding 和 gap，并知道内容存在最小宽度。',
    goal: '能判断 Flex 主轴与交叉轴，使用 grow、shrink、basis 分配空间，并处理换行、自动外边距和内容最小尺寸造成的收缩失败。',
    guidedPractice: '为一条工具栏编写 `display: flex; gap: 12px; flex-wrap: wrap`，给搜索框设置 `flex: 1 1 240px`，给按钮设置 `flex: 0 0 auto`。逐步缩小容器，记录搜索框何时换行、哪些项目缩小、`flex-basis` 与最终宽度各是多少。',
    independentPractice: '实现一个包含图标、可截断标题、状态标签和操作按钮的列表项，要求标题可收缩、标签不换行、按钮触控宽度稳定。交付 320px 与 1024px 的计算宽度、溢出情况和键盘焦点截图。',
    commonErrors: [
      '把 `flex: 1` 只理解成“占满”，忽略展开后是 `1 1 0%` 以及内容最小尺寸仍可能阻止收缩。',
      '给项目设置百分比 `flex-basis` 却没确认容器尺寸是否可确定，导致内容宽度与预期不同。',
    ],
    sourceRefs: [
      'W3C CSS Flexible Box Layout Level 1. https://www.w3.org/TR/css-flexbox-1/',
      'MDN Basic concepts of flexbox. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox',
      'MDN flex. https://developer.mozilla.org/en-US/docs/Web/CSS/flex',
    ],
    steps: [
      [
        '主轴由书写方向决定',
        '`display: flex` 建立 Flex 容器，`flex-direction: row` 把主轴的起点放在行内起点，`column` 则把主轴转到块轴，`writing-mode` 和 `direction` 还会继续改变起止方向。`justify-content` 沿主轴分配剩余空间，`align-items` 处理单行交叉轴。把同一个容器从 `row` 改为 `column`，观察按钮顺序、自动外边距方向和滚动轴是否同时变化。',
        '先判断轴，再选择对齐属性',
      ],
      [
        'grow、shrink、basis 分工',
        '`flex-grow` 分配剩余空间，`flex-shrink` 决定空间不足时如何压缩，`flex-basis` 提供伸缩前的基准尺寸。`flex: 1 1 0` 让多个项目从零基准开始平分剩余空间，`flex: 0 0 auto` 则保持内容基准且不伸缩。验收时在 DevTools 读取 used flex 值和项目最终宽度，逐个改用 `auto`、`0` 与固定像素基准，确认空间变化符合预期。',
        '基准、增长和收缩是三件事',
      ],
      [
        '换行会生成新行',
        '`flex-wrap: wrap` 允许项目进入新行，`align-content` 才控制多行之间的交叉轴分布；单行时 `align-content` 通常没有可分配空间。换行判定使用每个项目的假设主尺寸，包含 padding、border 与最小内容约束，所以 `min-width: auto` 会让长单词阻止压缩。检查每行项目数量和 `offsetTop`，可以确认换行发生在哪个断点。',
        '单行与多行使用不同对齐轴',
      ],
      [
        '自动外边距吸收自由空间',
        '在 Flex 项目上设置 `margin-inline-start: auto`，剩余空间会优先分给自动外边距，从而把后续项目推到主轴末端；这不同于 `justify-content: space-between` 对所有项目分散空间。若容器没有剩余空间，自动外边距退化为零。用一个品牌图标与两个操作按钮验证，当两个按钮都加自动外边距或只剩零宽时，位置会如何改变。',
        '自动外边距用于单个项目定位',
      ],
      [
        '收缩失败要查最小尺寸',
        'Flex 项目默认 `min-width: auto`，其中的长文本、宽图片或不可换行标签会形成内容最小值，即使 `flex-shrink` 很大也无法继续缩小。让标题容器设置 `min-width: 0`，再在内部文本上使用溢出与换行策略；不要给父级随意写 `overflow: hidden` 掩盖问题。最终同时检查 `scrollWidth <= clientWidth`、按钮未变形、焦点轮廓未被裁切。',
        '允许收缩先从 min-width 入手',
      ],
    ],
  },
  {
    name: css3Name(c1Stage, 'Grid 轨道、minmax、自动放置与区域'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '掌握 Flex 容器与项目的基本写法，并理解 `fr` 表示剩余空间份数。',
    goal: '能定义 Grid 的显式与隐式轨道，使用 `repeat()`、`minmax()` 和命名区域构建二维布局，并识别自动放置与 dense 排列带来的阅读顺序问题。',
    guidedPractice: '创建三列网格，先写 `repeat(3, 1fr)`，再改成 `repeat(auto-fit, minmax(220px, 1fr))`，记录列数与空隙变化。随后用 `grid-template-areas` 排出页眉、侧栏、主内容、页脚，在 900px 以下改为单列，并在 DevTools Grid 覆盖层查看轨道边界。',
    independentPractice: '为一张包含标题、筛选栏、内容区和分页的后台页面设计 Grid。要求显式声明主要轨道、给隐式行设置合理 `grid-auto-rows`、用区域名表达页面结构，并证明在内容增多时新增项目不会挤坏侧栏。',
    commonErrors: [
      '只声明列轨道却放入超过列数的项目，隐式行按内容撑高后仍误以为布局尺寸固定。',
      '使用 `grid-auto-flow: dense` 填补空洞，导致 DOM 阅读顺序与视觉顺序不一致。',
    ],
    sourceRefs: [
      'W3C CSS Grid Layout Level 1. https://www.w3.org/TR/css-grid-1/',
      'MDN Grid layout. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout',
      'MDN grid-template-areas. https://developer.mozilla.org/en-US/docs/Web/CSS/grid-template-areas',
    ],
    steps: [
      [
        '显式轨道与隐式轨道',
        '`grid-template-columns` 和 `grid-template-rows` 只定义明确写出的轨道；项目超出这些轨道时，浏览器按 `grid-auto-columns`、`grid-auto-rows` 创建隐式轨道。隐式行默认按内容自动定高，可能让页面比预估更高。用五个项目放入两列两行网格，第三个之后的位置会进入隐式行；在 Layout 面板查看行列线编号，再为 `grid-auto-rows: minmax(80px, auto)` 验证高度变化。',
        '新增项目会生成隐式轨道',
      ],
      [
        'minmax 控制轨道上下界',
        '`minmax(220px, 1fr)` 表示列至少 220px，剩余空间足够时最多扩展到一份弹性空间；`repeat(auto-fit, ...)` 会先算出能容纳的轨道数，再把剩余轨道合并，`auto-fill` 则保留空轨道。容器宽度不足最小轨道与 gap 之和时仍会溢出。将 320px 容器与 220px 最小列对照，记录 `gridTemplateColumns` 的实际值和页面 `scrollWidth`。',
        '自动列数也受最小轨道限制',
      ],
      [
        '自动放置遵循书写顺序',
        '没有明确位置的 Grid 项目按行或列自动放置，默认 `grid-auto-flow: row`，可用 span 扩展项目占位。`dense` 会回填前面留下的空洞，视觉上更紧凑，却可能让键盘顺序与 DOM 顺序错位。给一个跨两列卡片与多个单项混合布局，分别在 row、column、dense 下记录位置编号；交互组件优先保持 DOM 与视觉顺序一致。',
        '紧凑布局不能牺牲阅读顺序',
      ],
      [
        '区域名表达页面结构',
        '`grid-template-areas` 用二维字符串直接描述页眉、侧栏、主内容、页脚的关系，每个项目通过 `grid-area` 绑定名称。区域不能形成非矩形整体，也不应借区域名隐藏语义结构；HTML 仍使用 header、nav、main、aside、footer。改窄容器时把模板改成单列，并用 `grid-column` 清理遗留定位，再用截图确认没有空轨道。',
        '区域名表达意图，HTML 表达语义',
      ],
      [
        '二维布局做尺寸验收',
        '验收 Grid 页面要同时记录列模板、行模板、gap、容器宽和内容最小宽。测试四种输入：正常内容、超长标题、空状态、数量翻倍。目标是轨道按约束分配、项目不互相覆盖、DOM 顺序可通过键盘验证、隐式行不会把固定操作栏挤出视口。对可滚动区域再加 `min-width: 0` 与明确 overflow。',
        '用内容压力测试轨道承诺',
      ],
    ],
  },
  {
    name: css3Name(c1Stage, '定位、粘性、层级与包含块'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能使用 padding、margin 和固定宽度安排页面，并对浏览器如何绘制层叠有初步认识。',
    goal: '能确定 absolute、fixed、sticky 的包含块与滚动参照，识别创建层叠上下文的属性，并解释 z-index 为什么没有按预期生效。',
    guidedPractice: '制作三层卡片：外层 `position: relative`，中间层 `transform: translateZ(0)`，内部提示框 `position: absolute; z-index: 10`。依次删除 transform、给外层添加 `isolation: isolate`、把提示框改为 fixed，记录包含块、位置和层叠结果。',
    independentPractice: '实现一个带粘性表头、固定工具栏和绝对定位徽标的页面，要求工具栏不遮挡安全区、表头只在滚动容器内粘住、徽标不被卡片裁切。保存每一层 `offsetParent`、位置与焦点可见性证据。',
    commonErrors: [
      '给 static 元素设置 `z-index`，却因为元素不参与对应层叠上下文而没有得到预期层级。',
      '在祖先上使用 `overflow: hidden` 或较短高度，sticky 元素随祖先边界离开视口，被误判为浏览器不兼容。',
    ],
    sourceRefs: [
      'W3C CSS Positioned Layout Level 3. https://www.w3.org/TR/css-position-3/',
      'MDN position. https://developer.mozilla.org/en-US/docs/Web/CSS/position',
      'MDN Stacking context. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_context',
    ],
    steps: [
      [
        '四种定位的参照不同',
        '`relative` 先保留原布局位置再偏移，`absolute` 脱离普通流并相对最近的定位祖先或某些变换祖先定位，`fixed` 通常相对视口，`sticky` 先按普通流排布再在滚动阈值内粘住。包含块会受 `position`、`transform`、`contain` 等属性共同影响。逐个修改祖先并读取 DevTools 的 offsetParent 与盒位置，能避免凭视觉猜参照物。',
        '定位前先确认包含块',
      ],
      [
        'sticky 同时受两侧约束',
        '`position: sticky` 需要至少一个 `top`、bottom、left 或 right 阈值，粘住范围受最近滚动容器与父元素边界限制。祖先 `overflow: hidden` 会改变滚动参照，父元素高度不足也会提前结束粘性。给表头设置 `top: 0`，滚动到父容器底部时观察它离开视口，再调整父级高度和 overflow 验证原因。',
        'sticky 不会逃出祖先盒子',
      ],
      [
        'z-index 只在层叠上下文内比较',
        '`z-index` 的整数只在同一层叠上下文中排序，子元素再大的数值也不能越过另一个上下文中的祖先整体。`position` 配合非 auto 的 z-index、`transform`、`filter`、`opacity` 小于 1、`isolation: isolate` 都可能建立上下文。用 DevTools Layers 或绘制顺序实验定位上下文，再决定统一层名与数值。',
        '先找上下文，再调数值',
      ],
      [
        '浮层的两种定位策略',
        '普通 tooltip 可以用 absolute 依附定位祖先，但祖先的裁切与 transform 会影响它；模态对话框更适合进入 top layer，由 `dialog.showModal()` 或 popover 机制处理顶层绘制与焦点。不要用一个极高 `z-index` 同时在所有组件中抢顶层。验收包含祖先 overflow、滚动、两个浮层重叠与 Escape 关闭四个场景。',
        '顶层问题需要顶层机制',
      ],
      [
        '定位布局做回归核对',
        '每个定位元素记录参照祖先、初始位置、滚动 300px 后位置、父级裁切结果和键盘焦点是否仍可见。固定操作区使用 `inset-block-end` 与安全区变量，粘性表头不能遮住首行，浮层不能被按钮的 overflow 裁掉。用截图对比与脚本读取 `getBoundingClientRect()`，定位问题不能只靠肉眼观察。',
        '滚动前后都要验证位置',
      ],
    ],
  },
  {
    name: css3Name(c1Stage, '侧栏、工具栏、表格与卡片布局'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能独立编写 Flex 与 Grid 的基本布局，并理解滚动容器的 `clientWidth` 与 `scrollWidth`。',
    goal: '能把后台壳层拆成侧栏、工具栏、内容区、表格和卡片，分别选择一维或二维布局，并为每个区域建立可收缩的内容边界。',
    guidedPractice: '用 `grid-template-columns: minmax(220px, 280px) minmax(0, 1fr)` 搭出侧栏与内容区，在内容区用 Flex 排工具栏，再在表格外增加 `overflow-x: auto`。把侧栏文字换成长单词、表格增加八列，记录哪一层先溢出以及最终滚动位置。',
    independentPractice: '完成一个包含导航、筛选、指标卡、数据表和分页的后台页面骨架。每个区域必须说明为何使用 Flex 或 Grid，提交宽度 320、768、1440px 下的截图和 `scrollWidth` 检查结果。',
    commonErrors: [
      '侧栏使用固定 300px 并在窄屏保留，主内容区被压到负空间后出现整页横向滚动。',
      '表格通过缩小字体强行塞进容器，单元格可读性和触控目标同时下降。',
    ],
    sourceRefs: [
      'MDN CSS layout cookbook. https://developer.mozilla.org/en-US/docs/Web/CSS/Layout_cookbook',
      'MDN CSS Grid layout. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout',
      'MDN CSS table display. https://developer.mozilla.org/en-US/docs/Web/CSS/display',
    ],
    steps: [
      [
        '壳层用 Grid 固定列关系',
        '应用壳通常是二维关系，Grid 的列轨道能明确区分侧栏与主内容：`grid-template-columns: minmax(220px, 280px) minmax(0, 1fr)`，再让主内容 `min-width: 0`。侧栏可以随容器缩到 220px，主区允许收缩到零以上并自行滚动。把窗口按 240px 递减，记录侧栏和主区的实际宽度，确认整页没有多余横向滚动。',
        '壳层先确定列，不靠绝对定位',
      ],
      [
        '工具栏优先一维排列',
        '工具栏、筛选按钮和分页条目通常沿一条轴工作，Flex 更直接：`display: flex; flex-wrap: wrap; gap: 8px`。搜索框可以 `flex: 1 1 240px; min-width: 0`，操作按钮保持 `flex: none`。若工具栏有第二行固定区域，再考虑 `grid-template-columns: auto 1fr auto`。验证按钮文字放大后整行换行，而不是互相覆盖。',
        '一维关系交给 Flex',
      ],
      [
        '卡片由内容约束尺寸',
        '指标卡可用 `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`，卡片内部再将标题、数值和辅助文字用 Grid 行排列。不要给每张卡写死高度；用 `min-block-size`、`gap` 和 `align-content` 保证短内容整齐，长内容不会遮住操作区。用一条超长说明与一张空图测试卡片，确认文字和按钮都在盒内。',
        '卡片高度由内容和下限共同决定',
      ],
      [
        '表格使用独立滚动边界',
        '数据表仍是语义 table，外层用 `overflow-x: auto`，并让滚动器可聚焦；`table-layout: fixed` 适合列宽已知的表格，否则自动布局会按内容计算最小宽。给 `th` 设置 `position: sticky; top: 0` 时，要确认滚动参照是同一个外层。验收第 1 列、主操作列和超长单元格，确认滚动表头与正文对齐。',
        '表格滚动不要放大整页',
      ],
      [
        '区域边界写进验收',
        '组合页面检查四件事：页面只在预期容器滚动、每个区域都有可收缩的最小宽度、工具栏与分页不因文字变长重叠、表格列不会被卡片圆角或 overflow 裁掉。用 320px 截图看单手操作顺序，用 1440px 检查空白是否被合理分配。把发现的问题定位到具体轨道或子项，而不是给整个页面加 `overflow: hidden`。',
        '组合布局要逐层定位溢出点',
      ],
    ],
  },
  {
    name: css3Name(c1Stage, '内容最小宽度和横向滚动边界'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '理解 `min-content`、`max-content` 的基本含义，并能用 DevTools 检查元素盒尺寸。',
    goal: '能定位内容最小宽度来自哪个后代，使用 `min-width: 0`、`minmax(0, 1fr)` 和明确的滚动容器把横向溢出限制在预期区域。',
    guidedPractice: '构造 Grid 主列、Flex 行、长 URL、宽图片和固定宽度按钮，逐步把父级 `min-width` 改成 0，使用 DevTools 找出每个阶段仍把容器撑大的元素。给表格外层加滚动，记录修改前后 documentElement 与 table 的 `scrollWidth`。',
    independentPractice: '修复一个 390px 手机宽度下整页横向滚动的页面。要求不删除内容、不缩小字体、不隐藏真实操作，通过换行、轨道约束和局部滚动解决，并写出每一层的最小内容来源。',
    commonErrors: [
      '只给最内层文字加 `overflow: hidden`，中间 Flex 或 Grid 项仍按内容最小尺寸撑大外层。',
      '使用 `100vw` 宽度再加滚动条，导致实际可视宽度小于元素宽度并永久出现水平滚动。',
    ],
    sourceRefs: [
      'MDN min-width. https://developer.mozilla.org/en-US/docs/Web/CSS/min-width',
      'W3C CSS Sizing Level 3. https://www.w3.org/TR/css-sizing-3/',
      'MDN Overflow. https://developer.mozilla.org/en-US/docs/Web/CSS/overflow',
    ],
    steps: [
      [
        '先理解内容最小尺寸',
        '`min-content` 是元素在不发生不必要断行时能达到的最小宽，长单词、图片固有宽和 `white-space: nowrap` 都会抬高它；`max-content` 则按尽量不换行的内容宽计算。普通 Grid 轨道与 Flex 项的 automatic minimum size 会把这些尺寸带进布局。用 `width: min-content` 和 DevTools 盒模型逐个查看子元素，才能找到真正的撑宽来源。',
        '溢出总要有一个内容来源',
      ],
      [
        '逐层解除自动最小宽度',
        'Flex 项常需 `min-width: 0`，Grid 轨道常需 `minmax(0, 1fr)`，可滚动子项还需 `min-inline-size: 0`。这些声明不是全局修复药，只有确实允许该区域压缩时才使用，否则按钮和图片会被压坏。每次只改一个容器，重新读取 `scrollWidth` 和可见区，确认原来整页的滚动转移到预期表格或代码块内。',
        '允许压缩需要逐层授权',
      ],
      [
        '为长内容选择断行策略',
        'URL、代码标识符与连续中文不应一律使用 `word-break: break-all`，优先在正文容器使用 `overflow-wrap: anywhere`，在要求字符等宽的代码块中允许局部滚动。图片设置 `max-width: 100%; height: auto`，但固定图表仍可能需要外层滚动。把每个候选策略应用到同一段内容，比较行数与断词可读性。',
        '断行与滚动是两条不同策略',
      ],
      [
        '容器宽度不要混用视口单位',
        '设置 `width: 100vw` 时可能包含滚动条宽度，再用 `padding` 和 `border` 会进一步超出视口。主布局通常用 `width: auto` 交给包含块，确需视口宽度时用 `100%` 配合正常文档流，并注意 `box-sizing`。测试有、无滚动条两种状态，读取 `innerWidth`、`clientWidth` 与元素 rect，避免切换页面时横向滚动条忽隐忽现。',
        '视口宽不等于可用内容宽',
      ],
      [
        '局部滚动仍要可操作',
        '把溢出限制到表格或代码块后，滚动器应能通过键盘获得焦点，左右滚动不会把整页带走，滚动条也不会遮住最后一列。使用 `overscroll-behavior-inline: contain` 限制链式滚动，给滚动器可读名称，并检查在 200% 缩放下仍可达最后一列。最终以 `documentElement.scrollWidth === documentElement.clientWidth` 作为整页无横向溢出证据。',
        '溢出要被限制且仍可到达',
      ],
    ],
  },
  {
    name: css3Name(c1Stage, '响应式后台页面布局实验'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '已完成本阶段前五课，能分别使用 Flex、Grid 和滚动容器处理一维与二维关系。',
    goal: '能对同一后台页面比较 Flex 与 Grid 实现，选择与内容关系匹配的方案，并在 320、768、1024、1440px 四个宽度完成布局验收。',
    guidedPractice: '为同一份导航、工具栏、指标卡和数据表编写 Flex 版与 Grid 版壳层，每个版本只改布局属性。用浏览器响应式模式依次切到四个宽度，记录侧栏位置、卡片列数、工具栏换行、表格滚动以及整页横向溢出。',
    independentPractice: '选取较优方案完成可运行页面，补充键盘顺序、空状态、超长标题和 200% 缩放测试。交付一张比较表，说明哪些区域保留 Grid，哪些区域改为 Flex，以及遇到内容压力时如何收缩。',
    commonErrors: [
      '为了追求统一而在所有层级使用 Grid，工具栏和简单列表因此产生多余轨道约束。',
      '只在 1440px 检查视觉效果，没有验证 320px 下触控操作顺序与表格滚动入口。',
    ],
    sourceRefs: [
      'MDN CSS layout cookbook. https://developer.mozilla.org/en-US/docs/Web/CSS/Layout_cookbook',
      'web.dev Learn CSS layout. https://web.dev/learn/css/layout',
      'MDN Responsive design. https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design',
    ],
    steps: [
      [
        '先画布局关系再选工具',
        '壳层同时存在侧栏与主内容的二维关系，也有一行通知与按钮的一维关系。用 Grid 描述主区域行列，用 Flex 描述工具栏内部，是职责分工而不是二选一。把页面线框分成区域，在每条关系旁标注“二维轨道”或“单轴排列”，再看实现是否与标注一致。布局工具应服从关系，不为统一而统一。',
        '二维用 Grid，一维用 Flex',
      ],
      [
        '定义四个宽度档位',
        '在 320px 优先单列与局部滚动，768px 允许两列卡片，1024px 出现侧栏与主区，1440px 只扩大内容留白而不无限拉宽阅读行。每档记录页面可用宽、侧栏宽、卡片列数、表格可见列和主要操作位置。断点来自内容需求，不照搬设备名称；观察卡片何时挤压、表格何时不可读，再确定切点。',
        '断点由内容压力产生',
      ],
      [
        '内容压力取代样例填充',
        '给标题加入 40 个字符、给表格加入空值、给指标卡加入两位与七位数字、给工具栏加入最长按钮文案。检查 min-content 是否撑破轨道、数字是否跳动、按钮是否仍能点击。用 `font-variant-numeric: tabular-nums` 有助数字对齐，但真正稳定仍需要列宽和容器约束。',
        '样例内容不能只选短句',
      ],
      [
        '按阅读与操作顺序验收',
        '关闭鼠标后从页首按 Tab，记录焦点是否先经过跳转链接、主导航、工具栏、表格滚动器与分页。视觉上的侧栏若在 DOM 中排在主内容之后，键盘用户会被迫跳过正文。必要时调整源顺序而不用 `order` 反转交互元素；装饰顺序可以视觉重排，操作路径必须保持可预测。',
        '视觉顺序要服从键盘路径',
      ],
      [
        '生成比较结论与回归基线',
        '最终报告包含 Flex 与 Grid 版的截图、各档宽度尺寸、滚动器矩形、超长内容结果和键盘路径。选择依据应说明维护成本与失败边界，例如“主壳用 Grid 固定列，工具栏用 Flex 自动换行，表格仅在自身横向滚动”。把四个宽度写进自动化截图任务，后续改动用同一份内容数据复跑。',
        '比较结果要能复跑',
      ],
    ],
  },
];

// ── C2 响应式、容器查询与移动布局 ───────────────────────────────────────────
const c2Stage = '响应式、容器查询与移动布局';

const HANDWRITTEN_CSS3_C2_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: css3Name(c2Stage, '视口、媒体查询与内容断点'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能编写基础响应式页面，并在浏览器设备模式中切换视口宽度。',
    goal: '能区分布局视口、视觉视口与 CSS 像素，使用媒体查询的范围语法和输入能力条件，并依据内容压力而不是设备型号设置断点。',
    guidedPractice: '在页面中同时写 `@media (width >= 48rem)`、`@media (pointer: coarse)` 和 `@media (prefers-reduced-motion: reduce)`，用 `matchMedia()` 记录匹配状态。逐步拉宽页面并删除卡片内容，记录布局应在哪一刻变化，比较设备断点与内容断点的差异。',
    independentPractice: '为一张课程卡设置两个断点：标题开始不可读时改为上下布局，操作按钮开始拥挤时改为换行。提交每个断点的内容测量依据、匹配条件与 320、768、1440px 截图。',
    commonErrors: [
      '只按 375、768、1440 等设备宽度写断点，内容或侧栏变化后条件立刻失真。',
      '把 `pointer: coarse` 当成触屏设备的完整判断，忽略混合输入设备与外部鼠标。',
    ],
    sourceRefs: [
      'W3C Media Queries Level 5. https://www.w3.org/TR/mediaqueries-5/',
      'MDN Using media queries. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Using_media_queries',
      'MDN Viewport concepts. https://developer.mozilla.org/en-US/docs/Web/CSS/Viewport_concepts',
    ],
    steps: [
      [
        '先区分三类视口',
        '布局视口决定 CSS 布局可用尺寸，视觉视口会随双指缩放改变，理想视口则由移动端 meta viewport 影响。页面必须声明 `width=device-width, initial-scale=1`，否则手机可能先按更宽的布局视口排版再缩放。`100vw` 仍可能包含滚动条，不总等于可见内容宽。通过 DevTools 的屏幕尺寸、视觉视口缩放与 `innerWidth` 三项对照，避免混用概念。',
        '布局宽不等于看得见的宽',
      ],
      [
        '媒体查询支持范围写法',
        '现代查询可直接写 `@media (width >= 48rem) and (width < 72rem)`，也可用 min-width 与 max-width 组合。媒体查询里的 `rem` 基于浏览器初始字号或用户默认设置，不会跟随页面根元素后来修改的 font-size。用 16px 与调整浏览器默认字号两种环境验证匹配结果，能看出根样式与媒体查询参照的差异。',
        '查询条件的参照值也要确认',
      ],
      [
        '输入能力是独立条件',
        '`hover: hover` 表示主输入设备支持悬停，`pointer: coarse` 强调粗略指针，`any-pointer` 则考虑所有输入设备。触控笔记本可能同时具备鼠标与触屏，因此不能把粗指针直接等同为手机。`prefers-reduced-motion`、`prefers-contrast` 和 `forced-colors` 是用户偏好，应提供等价体验，不应改变业务结果。',
        '设备宽度无法代表输入能力',
      ],
      [
        '让内容决定切点',
        '把卡片宽度从 420px 逐步缩到 240px，记录标题换行数、按钮是否拥挤、图像是否压扁，找到首次失效的内容宽度，再把对应视口断点写回样式。断点评测用真实最长文案和空状态，不只使用短标题。文档里记录“容器或内容在多少像素失效”，比记录设备名称更能解释未来改动。',
        '断点服务于内容约束',
      ],
      [
        '组合查询与回退路径',
        '响应式布局要覆盖宽屏、窄屏、横屏、200% 缩放和减少动态效果，不能只交换 `display`。用 `@supports` 为容器查询或新单位提供回退，用 `matchMedia` 在运行时记录实际条件。每次发布保存一张条件对照表，确认未命中的查询不会隐藏关键操作，也不会让页面只在模拟器里通过。',
        '每个查询都要有未命中状态',
      ],
    ],
  },
  {
    name: css3Name(c2Stage, '容器查询与组件自适应'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '能写媒体查询，并把组件拆成独立的 HTML 结构与 CSS 类。',
    goal: '能为组件声明查询容器，使用 `@container` 与 `cqi` 根据父容器宽度改变组件布局，并理解容器类型、命名和包含关系对查询的影响。',
    guidedPractice: '把同一张卡片分别放进 280px 侧栏与 720px 主区域，卡片根设置 `container-type: inline-size; container-name: card`，再用 `@container card (width >= 480px)` 切换横排。读取容器宽度、卡片的 `cqw` 计算值和实际布局，确认同一组件在不同容器中表现不同。',
    independentPractice: '为一个表格组件编写宽容器与窄容器两套结构：宽时显示列头，窄时变为定义列表。查询必须由外层命名容器驱动，组件在不支持容器查询的浏览器中保留媒体查询回退。',
    commonErrors: [
      '在组件自身写查询却期待匹配自己，忘记 `@container` 只匹配祖先查询容器。',
      '给容器设置 `container-type: size` 后依赖内容自动撑高，结果块轴尺寸被包含并碰撞出失败布局。',
    ],
    sourceRefs: [
      'W3C CSS Containment Module Level 3. https://www.w3.org/TR/css-contain-3/',
      'MDN CSS container queries. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries',
      'web.dev Container queries. https://web.dev/articles/cq-stable',
    ],
    steps: [
      [
        '容器查询改变参照对象',
        '媒体查询依据视口或设备能力，容器查询依据最近匹配的祖先查询容器。组件放进不同栏位时，能否切换布局应由该栏实际宽度决定，而不是整个页面宽度。把同一卡片在侧栏与主区并排显示，记录两边容器宽和查询命中结果，可以直接看出组件级响应式的价值。',
        '组件看父容器，不看整张屏幕',
      ],
      [
        '声明 inline-size 容器',
        '`container-type: inline-size` 让容器在行内轴建立尺寸包含，子元素排版不再反向撑大该轴，同时提供宽度查询；`container-name` 给容器增加名字，避免匹配到更近但无关的祖先。一般只需查询宽度时用 inline-size，不要默认使用 size，因为 size 同时包含块轴尺寸，可能让容器高度不再由内容决定。',
        '先选单轴包含，再写查询',
      ],
      [
        '查询单位跟随容器',
        '在容器内部，`cqi` 表示行内容器的 1%，`cqw` 是容器宽，`cqh` 是容器高，`cqmin` 与 `cqmax` 取对应较小或较大值。用 `padding-inline: clamp(1rem, 4cqi, 2rem)` 可以让间距随组件变化，但字号仍要保持可读下限。读取 `getComputedStyle` 的实际值和容器尺寸，避免容器未声明时单位回退成视口相关结果。',
        '容器单位只对查询容器有意义',
      ],
      [
        '查询位置与边界',
        '`@container card (width >= 30rem)` 的规则只作用于满足条件的容器后代，容器自身不能匹配自己的查询；嵌套容器会让最近祖先优先。若组件内部还有独立卡片容器，外层查询可能被内层截断。用 DevTools 的 Container 提示和 DOM 层级检查查询目标，再给每个容器命名，减少无关祖先干扰。',
        '最近容器先于命名意图',
      ],
      [
        '支持检测与降级',
        '使用 `@supports (container-type: inline-size)` 覆盖增强布局，并为旧浏览器保留媒体查询或流式布局。验收三种宽度：300px 容器保持纵向、520px 切换横排、760px 限制图像比例；再删除查询支持模拟回退。组件不依赖某一查询而失去主要操作，才可进入共享组件库。',
        '增强布局必须有普通流回退',
      ],
    ],
  },
  {
    name: css3Name(c2Stage, '流式字体、行高与阅读宽度'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能使用 rem、em 和百分比设置文字，并理解字体加载会改变行盒高度。',
    goal: '能建立随可用空间平滑变化但受上下界约束的字号与间距，使用无单位行高和 ch 控制阅读宽度，并验证字体缩放与长文排版。',
    guidedPractice: '为正文设置 `font-size: clamp(1rem, 0.95rem + 0.2vw, 1.125rem)`、`line-height: 1.6`、`max-inline-size: 68ch`，为标题设置更紧的行高。分别在 320px、1440px、200% 缩放和较长中文段落中记录每行字符数、行高与页面溢出。',
    independentPractice: '为一篇含标题、摘要、正文、注释和表格的文章建立排版系统，要求正文可读宽度稳定、标题不遮住下一段、数字列对齐、长单词不把页面撑开，并提交浏览器放大后的截图。',
    commonErrors: [
      '把行高写成固定 px，用户放大字体后行盒不增长，文字互相重叠。',
      '流式字号没有最小值或在窄屏继续使用较大的 vw 系数，文字在小屏被压得过小。',
    ],
    sourceRefs: [
      'MDN clamp. https://developer.mozilla.org/en-US/docs/Web/CSS/clamp',
      'MDN line-height. https://developer.mozilla.org/en-US/docs/Web/CSS/line-height',
      'WCAG 2.2 Text Resizing. https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html',
    ],
    steps: [
      [
        '字号需要上下界',
        '`clamp()` 接收最小值、首选值和最大值，浏览器先计算中间表达式，再限制到边界内；`min()` 与 `max()` 也可组合同类逻辑。流式字体的首选值要保留 rem 成分，避免完全跟随视口而忽视用户字号，最小端仍应接近正文可读大小。读取 computed font-size 并切换浏览器默认字号，确认用户偏好没有被覆盖。',
        '平滑变化不等于无限缩放',
      ],
      [
        '无单位行高随字号变化',
        '`line-height: 1.5` 用无单位倍数计算，子元素继承的是倍数而不是某个固定像素值，因此字号变化后行距可继续扩展；固定 `24px` 则不会。正文通常需要比标题更大的相对行高，长段落还要考虑字体 x-height 与中文行盒。用同一正文分别切到 16px 与 32px，检查相邻行是否重叠以及行盒计算值是否同步增长。',
        '行距要随字体一起生长',
      ],
      [
        '用 ch 约束阅读宽度',
        '`max-inline-size: 65ch` 到 `75ch` 常用作英文长文阅读上限，`ch` 取决于当前字体中的数字 0 宽，因此换字体后会变化；中文也可结合 `em` 与容器宽设置上限。窄屏用 `width: min(100% - 2rem, 68ch)`，既保留边距又不固定页面宽度。观察每行字符数、段落换行和横向滚动，选择较长文本仍能回看下一行的宽度。',
        '阅读宽度要限制的是行盒',
      ],
      [
        '标题节奏依赖间距而非负字距',
        '标题的大小、行高、`margin-block-start` 和 `margin-block-end` 应形成稳定节奏，不能靠负 `letter-spacing` 把长标题硬塞进一行。中文与拉丁字母混排时，允许标题自然换行，使用 `text-wrap: balance` 可改善短标题分配行宽，但不要把它用于大量正文。给标题加超长英文词并检查是否压住摘要。',
        '换行比挤压字距更可靠',
      ],
      [
        '缩放与字体加载联合验收',
        '浏览器放大到 200% 后，正文仍需在无水平滚动的情况下阅读，控件文字不能被裁切。字体加载前后可能发生回流，使用合适的 fallback 字体、`font-display` 与尺寸测量，避免布局跳动。对表格数字使用 `font-variant-numeric: tabular-nums`，对代码使用等宽栈。所有结论通过真实页面截图和 computed 值核对。',
        '用户字号是排版硬约束',
      ],
    ],
  },
  {
    name: css3Name(c2Stage, '触控目标、安全区和拇指区域'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能实现基础按钮和底部操作栏，知道移动浏览器存在刘海、圆角与动态工具栏。',
    goal: '能让常用触控目标达到稳定尺寸和间距，使用安全区环境变量避让设备边缘，并按拇指可达区域安排主要操作。',
    guidedPractice: '把一组图标按钮分别设置为 32px、44px 和 48px，测量实际可点击矩形和相邻间距。给底部操作栏加入 `padding-block-end: calc(12px + env(safe-area-inset-bottom, 0px))`，在带安全区的设备模拟器中对比内容是否被圆角或手势区域遮挡。',
    independentPractice: '改造一个移动端筛选流程：至少四个主要操作达到 44px、相邻目标不重叠、吸底按钮避开安全区、错误提示出现时不遮住确认按钮。提交触控矩形表、键盘顺序和截图。',
    commonErrors: [
      '只把图标本身设成 44px，却让按钮自身可点击区域仍由父级布局压到 32px。',
      '用固定 bottom 值写吸底工具栏，遇到安全区或浏览器地址栏变化后被系统手势区覆盖。',
    ],
    sourceRefs: [
      'WCAG 2.2 Target Size Minimum. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html',
      'MDN env. https://developer.mozilla.org/en-US/docs/Web/CSS/env',
      'MDN Viewport meta tag viewport-fit. https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag',
    ],
    steps: [
      [
        '测量真正可点击矩形',
        '触控目标不是图标的外接圆，也不是视觉按钮里的一段文字，而是浏览器实际可接收指针事件的边框盒。按钮可通过 `min-inline-size: 44px`、`min-block-size: 44px`、padding 与 gap 获得稳定区域，图标本身可以更小。用 `getBoundingClientRect()` 导出宽高和相邻距离，避免视觉看起来大而可点击区被父级裁剪。',
        '可点击区域以按钮盒为准',
      ],
      [
        '触控密度需要自适应',
        '`@media (pointer: coarse)` 可以放大主要操作，但不能只依赖该查询；混合输入设备仍可能同时存在鼠标和触摸。为危险操作、相邻图标与始终可见控件设置最小尺寸，给密集工具栏增加 gap，避免依赖 hover 才显示操作。触控目标变大后要重新检查工具栏换行与内容遮挡。',
        '输入能力会影响尺寸选择',
      ],
      [
        '安全区需要 viewport-fit',
        '要让 `env(safe-area-inset-*)` 获得有意义的值，页面通常需要 `viewport-fit=cover`；随后用 `padding-block-end: calc(12px + env(safe-area-inset-bottom, 0px))` 把内容推离手势区。安全区变量在普通设备上可能为 0，因此要保留基础间距。把工具栏贴边、键盘弹出、横屏三种状态都截图验证。',
        '安全区值是额外增量',
      ],
      [
        '拇指区安排主要动作',
        '单手竖屏时，底部中间和两侧比屏幕顶部更容易触达，频繁操作可放在吸底位置，破坏性操作需与常用确认保持间隔。布局上用 Grid 固定按钮槽位，避免文字变长把按钮挤出屏幕；视觉层级用位置和间距表达，不只依赖颜色。横屏时底部可能变成左右边缘，应重新检查触达与安全区。',
        '位置影响操作成本',
      ],
      [
        '遮挡与焦点联合测试',
        '验收时模拟错误提示、软键盘和底部操作栏同时出现，确认没有按钮被遮住。键盘用户从表头 Tab 到操作区，确认焦点顺序与视觉顺序一致，焦点环没有被 overflow 裁切。测得目标是主要按钮至少 44px、相邻点击区域不重叠、底部内容完整落在安全区内。',
        '触控、键盘和遮挡一起验收',
      ],
    ],
  },
  {
    name: css3Name(c2Stage, '横屏、软键盘与动态视口高度'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能在移动设备模式中操作页面，并理解 vh、百分比和固定定位的基本含义。',
    goal: '能区分 svh、lvh、dvh 与 vh 的参照，设计横屏和软键盘出现时仍可滚动的布局，并说明浏览器无法由纯 CSS 统一处理的键盘边界。',
    guidedPractice: '把全屏容器分别设为 `min-height: 100vh`、`100svh`、`100lvh` 和 `100dvh`，在移动浏览器模拟器展开与收起地址栏。再把输入框放进滚动内容，聚焦后记录可见高度、页面滚动位置与底部按钮是否可达。',
    independentPractice: '实现一个聊天式输入页，要求消息区可滚到最新内容、输入框聚焦后仍能看见光标、底部按钮可到达、横屏不裁掉顶栏。用真实移动浏览器与桌面模拟器各记录一次行为差异。',
    commonErrors: [
      '给整页设 `height: 100vh; overflow: hidden`，软键盘出现后输入框被挤出可见区域且无法滚动。',
      '假设所有浏览器都会把软键盘高度暴露为某个固定环境变量，未保留自然文档滚动回退。',
    ],
    sourceRefs: [
      'MDN Viewport units. https://developer.mozilla.org/en-US/docs/Web/CSS/length#viewport-percentage-lengths',
      'MDN VisualViewport. https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport',
      'W3C CSS Values and Units Level 4. https://www.w3.org/TR/css-values-4/',
    ],
    steps: [
      [
        '动态视口单位有四个参照',
        '`vh` 与旧式视口高度相关，`lvh` 对应浏览器界面收起时的较大视口，`svh` 对应界面展开时的较小视口，`dvh` 会随动态工具栏变化。`dvh` 收缩时可能引发布局变化，不应毫无节制地用于大量固定区域。用同一页面并排显示四个高度并记录 computed 值，可以看清数值与滚动行为。',
        '大小视口不是同一个高度',
      ],
      [
        '优先保留内容可滚动',
        '聊天页可以让容器使用 `min-height: 100svh`，消息区 `min-height: 0; overflow: auto`，输入区保持普通流。不要用 `height: 100dvh; overflow: hidden` 封死整页，因为软键盘与浏览器界面变化会让某些浏览器无法把焦点元素滚入可见区。验收时在最后一条消息和输入框聚焦处检查滚动位置。',
        'min-height 比死锁高度更稳',
      ],
      [
        '横屏改变主要约束',
        '横屏时页面高度骤减、左右安全区可能出现，竖直方向的标题与说明应允许横向重排，底部操作不能继续占两行。用 `@media (orientation: landscape) and (max-height: 32rem)` 收起次要说明或缩短间距，同时保留所有可操作内容。截图应包含地址栏展开与收起两种高度。',
        '横屏先处理高度竞争',
      ],
      [
        '软键盘不是统一的 CSS 环境',
        '不同浏览器对虚拟键盘使用覆盖视口、调整布局视口或改变视觉视口的方式不同，纯 CSS 不能在所有平台拿到统一键盘高度。可为支持的环境使用相应视口或交互策略，但必须保留自然滚动、输入框 `scroll-margin-block` 和焦点可见作为回退。读取 `visualViewport.height` 只作为运行时诊断，不当作跨平台固定值。',
        '键盘行为要有可滚动底路',
      ],
      [
        '真实设备收口行为差异',
        '模拟器通过了仍要在至少 iOS 与 Android 各一台设备测试：聚焦输入框、旋转横屏、切换深浅色、显示错误提示、收起键盘。记录输入框矩形、按钮矩形、文档滚动位置和可视视口。只要任一状态出现光标不可见或主要按钮不可达，就应回到布局结构修复。',
        '视口验收必须包含键盘状态',
      ],
    ],
  },
  {
    name: css3Name(c2Stage, '移动布局截图与溢出回归'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '能使用 Playwright 或同类浏览器自动化截取页面，并会读取元素的布局矩形。',
    goal: '能建立固定视口与内容数据的移动截图矩阵，检测整页横向溢出、元素重叠和状态差异，并让视觉回归结果可复查。',
    guidedPractice: '用 Playwright 依次设置 320、375、390、430px 视口，在每个宽度检查 `document.documentElement.scrollWidth <= clientWidth`，再截图首屏、长内容、表单错误和底部操作栏。故意加入一个 420px 固定宽图片，确认脚本能定位到超宽元素。',
    independentPractice: '为一个组件页建立截图矩阵，包含普通、长标题、空状态、暗色和高对比环境。为每张截图记录浏览器、视口、字体、动画设置与数据夹具，并对截图差异标注真实缺陷或可接受变化。',
    commonErrors: [
      '截图只截首屏，底部固定操作栏或表单错误在滚动后才出现的问题被漏掉。',
      '动画和字体尚未稳定就截图，随机差异被误判为布局回归。',
    ],
    sourceRefs: [
      'Playwright visual comparisons. https://playwright.dev/docs/test-snapshots',
      'Playwright emulation. https://playwright.dev/docs/emulation',
      'MDN Responsive design. https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design',
    ],
    steps: [
      [
        '先固定可复现环境',
        '截图任务要固定浏览器内核、视口、设备像素比、语言、时区和测试数据，并关闭随机动画或等待 `document.fonts.ready`。Web 字体加载前后宽度可能变化，网络慢时截到 fallback 版本会制造假差异。把环境和数据版本写进报告，截图结果才能跨人复查。',
        '视觉基线必须固定输入',
      ],
      [
        '视口矩阵覆盖真实边界',
        '至少测试 320、375、390、430px 四个移动宽度，再补 768、1024、1440px 桌面宽度。320px 暴露内容拥挤，大宽度检查阅读行是否过宽。每个视口记录可用宽和滚动条宽，不能只保存图片；同一图片尺寸不同也可能掩盖布局变化。',
        '边界宽度要出现在矩阵里',
      ],
      [
        '溢出检测定位到元素',
        '页面级断言检查 `scrollWidth` 与 `clientWidth`，元素级扫描比较每个可见元素的 `getBoundingClientRect().right` 与视口。对 position fixed、transform 和浮层要排除预期越界，但仍检查主要操作可到达。脚本输出最右侧越界元素的标签、类名与宽度，便于直接回到 CSS。',
        '整页溢出要追到具体后代',
      ],
      [
        '状态矩阵防止只测理想路径',
        '准备长标题、空列表、错误输入、禁用按钮、选中状态、暗色和高对比模式。对吸底区域滚动到底部再截图，对表单聚焦后等待键盘状态。动画组件需要捕获开始、结束和减少动态效果三种状态，不能用单一静态画面代表交互。',
        '状态比屏幕尺寸同样重要',
      ],
      [
        '差异审查要有判定规则',
        '截图 diff 只提供变化区域，最终判定仍需检查是否遮挡、裁切、错位或失去焦点。把变化按阻断、可接受和需确认分类，附带 DOM 矩形与 computed 值。基线更新必须经过审查，禁止批量接受所有新图，否则组件漂移会被静默保存。',
        '基线更新不能代替审查',
      ],
    ],
  },
];

// ── C3 设计 Token、主题与可访问性 ───────────────────────────────────────────
const c3Stage = '设计 Token、主题与可访问性';

const HANDWRITTEN_CSS3_C3_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: css3Name(c3Stage, '语义变量、Token 与主题切换'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能使用自定义属性承载颜色和尺寸，并知道 CSS 变量会沿 DOM 继承。',
    goal: '能区分基础 Token、语义 Token 与组件 Token，使用自定义属性、`@property` 和主题选择器构建可回退的亮暗主题。',
    guidedPractice: '定义 `--palette-blue-600`、`--color-action`、`--button-bg` 三层变量，在 `:root` 与 `[data-theme="dark"]` 中替换语义层。用 `getComputedStyle` 读取按钮最终背景，再故意制造两个变量互相引用，观察循环引用如何让属性退回初始值或备用值。',
    independentPractice: '为一个卡片、按钮和输入框建立三层 Token 清单，要求切换主题时只改变语义层，组件层不感知颜色名称。补充未定义变量、空值和非法色的回退实验。',
    commonErrors: [
      '组件直接引用 `--palette-blue-600`，切换品牌主题时必须逐组件查找颜色。',
      '把任意文本都塞进一个未声明类型的变量，缺少单位或语法校验后直到运行时才发现无效。',
    ],
    sourceRefs: [
      'MDN Using CSS custom properties. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascading_variables/Using_CSS_custom_properties',
      'MDN @property. https://developer.mozilla.org/en-US/docs/Web/CSS/@property',
      'MDN color-scheme. https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme',
    ],
    steps: [
      [
        'Token 分三层表达意图',
        '基础 Token 描述原始色阶、字号和空间，例如 `--gray-900`；语义 Token 表达用途，例如 `--color-text-primary`；组件 Token 只连接具体组件，例如 `--button-bg`。组件读取组件层，组件层默认指向语义层，主题只重写语义层。这样改品牌色不必搜索所有组件，也不会让“蓝色”这样的视觉名称决定交互含义。',
        '从原始值走到使用意图',
      ],
      [
        '自定义属性沿作用域继承',
        '`--color-action: #2563eb` 会从声明元素继承，组件内部用 `var(--color-action)` 读取最近祖先的值。`:root` 适合全局默认，`[data-theme="dark"]` 可在子树内覆盖。变量名区分大小写，值末尾多余空格也会成为字符串的一部分。用 DevTools 的 Inherited from 提示检查真正来源。',
        '变量值来自最近的声明作用域',
      ],
      [
        '注册变量获得类型',
        '`@property --radius-control { syntax: "<length>"; inherits: true; initial-value: 0.5rem }` 让浏览器按长度解析变量，插值时可从数值变化，也能在语法非法时使用初始值。颜色可声明为 `<color>`，数字用 `<number>`。没有注册的变量保持 token 级替换，无法保证类型与动画行为。',
        '需要类型和动画时再注册',
      ],
      [
        '主题切换保留系统语义',
        '在根元素声明 `color-scheme: light dark`，再让 `[data-theme="dark"]` 设置对应 surface 与 text Token。原生表单、滚动条和系统 UI 可依据 `color-scheme` 调整，不必把所有控件重画。用户没有选择时可用 `prefers-color-scheme` 提供默认，显式主题优先于媒体查询。',
        '主题覆盖要与用户偏好协同',
      ],
      [
        '验证变量解析与回退',
        '每个消费点使用 `var(--token, 回退值)`，并用 `CSS.supports()` 与 computed 值检查解析结果。循环变量会导致属性在计算值阶段无效，非法颜色也可能使整条声明失效。测试缺变量、空变量、非法值和主题切换四类情况，确认文字与面层仍有可读对比。',
        '变量失败也要有可读结果',
      ],
    ],
  },
  {
    name: css3Name(c3Stage, '字体比例、行高与排版节奏'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '理解字体大小、行高、字重和字体族的基本 CSS 属性。',
    goal: '能建立有限层级的字体比例，使用无单位行高和 `ch` 控制段落，区分正文、标题与数据字体，并保证字体替换后布局仍稳定。',
    guidedPractice: '从 1rem 正文建立 1.25、1.5、2 三个标题级别，分别设置 line-height、margin 和字重。把页面字体替换为等宽测试字体与系统字体，记录标题换行、段落行数、按钮高度和表格数字对齐变化。',
    independentPractice: '为一套后台页面定义正文、标签、标题、指标数字和代码五种字体角色，禁止新增无对应角色的字号。提交 200% 缩放、中文与英文混排、缺失自定义字体三类截图。',
    commonErrors: [
      '每个组件随手写一个 13px、15px、17px 字号，最终无法判断层级且响应式规则互相冲突。',
      '所有文字都使用相同行高倍数，长正文过挤或短标签占用过多垂直空间。',
    ],
    sourceRefs: [
      'MDN font-size. https://developer.mozilla.org/en-US/docs/Web/CSS/font-size',
      'MDN line-height. https://developer.mozilla.org/en-US/docs/Web/CSS/line-height',
      'MDN font-variant-numeric. https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric',
    ],
    steps: [
      [
        '先定义字体角色',
        '排版系统先回答每段文字承担什么任务：正文用于连续阅读，标题用于层级导航，标签用于短操作，指标数字需要等宽对齐，代码需要字符边界清楚。角色确定后再分配 Token，组件不能因为当下视觉偏好新增字号。把页面文本归类后，能发现同类信息使用五六种字号的问题。',
        '先分角色，再定字号',
      ],
      [
        '比例层级保持可解释',
        '常用比例从正文逐步放大，例如 1、1.25、1.5、2，但中文界面和短标题不一定需要夸张跳跃。数值使用 rem 保留用户字号偏好，必要时用有上下界的 clamp；标题间距用 `margin-block` 表达组间关系。每个层级记录用途和最大行数。',
        '层级数量要有限',
      ],
      [
        '行高服从阅读任务',
        '正文行高通常比大标题更宽松，因为长行需要更清晰的换行节奏。无单位 `line-height` 会把倍数传给子元素，适合一般排版；显式像素行高可能在大字号下重叠。`max-inline-size: 68ch` 控制行盒长度，`text-wrap: pretty` 可减少段尾孤字，但不能替代合理宽度。',
        '行高与字号要成对设计',
      ],
      [
        '字体回退需要度量意识',
        '自定义字体加载失败时，fallback 的字宽、x-height 和数字宽度可能差异很大。使用系统字体栈、`font-size-adjust` 可缓和部分差异，给固定高度控件留下增长空间，避免依赖 `height`。用本地阻断字体下载模拟回退，再检查按钮文字是否裁切以及表格数字是否跳动。',
        '回退字体也属于正式排版',
      ],
      [
        '数字与代码单独处理',
        '`font-variant-numeric: tabular-nums` 让表格中的 0 到 9 使用固定宽度，减少刷新数字时列宽抖动；`font-feature-settings` 只在确认字体支持时使用。代码块采用等宽字体并保持可横向滚动，不靠 `letter-spacing` 制造空格。对比加载前后字符宽度与列对齐。',
        '数据稳定优先使用等宽数字',
      ],
    ],
  },
  {
    name: css3Name(c3Stage, '颜色、对比度与状态表达'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能定义 CSS 颜色和变量，并在浏览器中查看文字与背景的计算色值。',
    goal: '能按 WCAG 对比度阈值选择前景与背景，使用语义色表达状态，并确保透明度、暗色主题和色觉差异不会破坏信息传达。',
    guidedPractice: '准备普通正文、大号标题、图标按钮和禁用文字四组样本，分别测量前景与背景对比度。用 `color-mix()` 改动背景透明度，记录叠加到不同表面后的实际颜色，再把状态指示从只变颜色改为颜色加文字或图标。',
    independentPractice: '审计一个表单的默认、悬停、焦点、错误、成功和禁用状态，要求每个状态有非颜色线索，所有可操作文字达到相应对比阈值，并在暗色和强制色彩模式下复核。',
    commonErrors: [
      '只检查设计稿里的纯色背景，忽略半透明层叠加后的真实背景导致对比不足。',
      '只用红色表示错误、绿色表示成功，色觉差异或强制色彩模式下信息完全丢失。',
    ],
    sourceRefs: [
      'WCAG 2.2 Contrast Minimum. https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',
      'WCAG 2.2 Use of Color. https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html',
      'MDN color-mix. https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/color-mix',
    ],
    steps: [
      [
        '阈值按文字用途区分',
        'WCAG AA 对普通文字要求至少 4.5:1，对大号文字通常要求 3:1，非文本图形和界面边界还需满足对应的非文本对比要求。字号大小与粗细共同影响“大号文字”的判断，不能只因为视觉上觉得醒目就降低要求。逐组合测量实际前景与背景，而不是只看品牌色卡。',
        '对比度要按实际用途判断',
      ],
      [
        '透明度改变真实背景',
        '`rgb(255 255 255 / 0.7)` 叠在亮色与图片上会得到不同结果，`opacity` 还会作用于整个子树，导致文字和图标一起变淡。需要稳定可读性时使用不透明语义表面，或在固定背景上计算 composited color。DevTools 的颜色格式切换可显示实际叠加值，测试图片、渐变和暗色表面三类背景。',
        '半透明值不是最终颜色',
      ],
      [
        '状态至少两个通道',
        '错误状态可以同时使用红色边框、明确错误文字和图标，成功状态使用绿色、完成图标和可读说明。`aria-invalid` 与 `role="alert"` 由语义层负责，CSS 只增强可见性。把页面截图转灰度或开启色觉模拟，确认状态仍可区分；强制色彩模式下还应允许系统颜色接管。',
        '颜色不能独自承担含义',
      ],
      [
        '暗色主题重新配对比',
        '暗色主题不是把白色全部反转成黑色，深色表面的 elevation、边界与状态色都需要重新配比。使用语义 Token 调整 `--color-text-primary`、`--color-border` 与 `--color-danger`，并在真实组件背景上复测。纯黑背景容易产生光晕感，过暗的次级文字也可能低于阈值。',
        '主题切换需要重新审计',
      ],
      [
        '把审计写进组件验收',
        '每个组件列出文本、图标、边界和状态色组合，记录对应背景、计算色与对比值。检查 hover 不只是颜色变化，focus 可见且不被背景吞没，disabled 状态虽然降低对比促销，仍需可读。自动扫描能发现一部分问题，人工复核图片背景和强制色彩模式不可省略。',
        '对比度证据随组件保存',
      ],
    ],
  },
  {
    name: css3Name(c3Stage, '间距、圆角、阴影与视觉层级'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能用 padding、margin、gap 和 border 控制元素之间的距离与边界。',
    goal: '能建立有限的空间与圆角刻度，用表面、边界和阴影表达层级，避免 margin 折叠、阴影穿透和焦点环被裁切。',
    guidedPractice: '使用 4px 基数建立 `--space-1` 到 `--space-8`，在同一卡片中分别用 gap 和 margin 排列标题、正文与按钮，记录垂直间距是否一致。给三个表面叠加不同阴影并调低透明度，观察暗色主题下的层级是否仍明显。',
    independentPractice: '为后台页面的页面区、卡片区、控件区和浮层区定义四级视觉层级，要求每级都由背景、边界、圆角或阴影中的多项共同表达，并在亮暗与高对比模式下截图。',
    commonErrors: [
      '相邻块元素的上下 margin 发生折叠，误以为 CSS 没有应用间距并继续叠加更大数值。',
      '把焦点环放在 `overflow: hidden` 容器内或用过大 `border-radius` 裁切，键盘聚焦时看不见轮廓。',
    ],
    sourceRefs: [
      'MDN CSS Box Model. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_box_model',
      'MDN box-shadow. https://developer.mozilla.org/en-US/docs/Web/CSS/box-shadow',
      'MDN margin collapsing. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_box_model/Mastering_margin_collapsing',
    ],
    steps: [
      [
        '空间刻度保持有限',
        '从 4px 或 8px 基数构建少量空间 Token，例如 4、8、12、16、24、32px。组内关系用 gap，组间关系用 margin 或布局轨道，避免每个组件随意写 13px、19px。间距选择应说明相邻元素的语义关系，而不是为了填满当前截图。',
        '间距表达关系而非装饰',
      ],
      [
        '理解外边距折叠',
        '普通块格式化上下文中，相邻块元素的上下 margin 可能合并成较大的一个；父元素与首个子元素的 margin 也可能折叠，浮动或建立 BFC 后可改变结果。Grid、Flex 的 gap 不受这种折叠影响，因此组件内部常优先 gap。用 `display: flow-root` 隔离容器，再用 DevTools 盒模型核对实际位置。',
        'margin 的数值不一定相加',
      ],
      [
        '圆角要服从内容裁切',
        '`border-radius` 会改变背景和边框的绘制形状，但子元素不会自动被圆角裁切；需要裁切图像时配合 `overflow: hidden`，同时检查焦点环和绝对定位徽标。过大的圆角会压缩图标与文字的内部可用空间，嵌套表面还要考虑内外半径差异。',
        '圆角与裁切必须一起判断',
      ],
      [
        '阴影表达高度而非装饰',
        '浮层阴影应使用低透明度、较大模糊和合理偏移，卡片则更适合用边界与轻微背景差。多个阴影可以模拟接触阴影与环境阴影，但暗色主题要让表面亮度与边界承担更多层级信息。把页面放到亮暗背景与图片背景上，检查阴影是否变成灰边。',
        '层级需要多通道表达',
      ],
      [
        '焦点与表面共同验收',
        '任何可交互表面都要检查 `outline-offset`、父级 overflow 和相邻元素遮挡。焦点环可以同时在亮暗背景可见，并在 `forced-colors` 下保持系统轮廓。截图矩阵包含普通、悬停、焦点、打开浮层和错误状态，测量间距与边界，不只比较视觉是否“好看”。',
        '交互状态不能被视觉层级吞掉',
      ],
    ],
  },
  {
    name: css3Name(c3Stage, '焦点、禁用、错误与选中状态'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能使用伪类选择器，并了解按钮、输入框和 ARIA 属性的基本语义。',
    goal: '能用 CSS 状态选择器匹配可见焦点、禁用、错误和选中状态，同时保证键盘可操作、语义属性与视觉状态一致。',
    guidedPractice: '为一个按钮编写 `:hover`、`:active`、`:focus-visible`、`:disabled`、`[aria-pressed="true"]` 五种样式，使用 Tab、Shift+Tab、空格和鼠标分别触发。记录哪些状态由浏览器原生提供，哪些是自定义样式实际命中。',
    independentPractice: '实现一组筛选芯片：未选中、选中、禁用和加载中都必须有清晰样式，键盘可移动与切换状态，错误提示不能只靠边框。用 computed 值、ARIA 属性与截图证明四态一致。',
    commonErrors: [
      '用 `outline: none` 删除默认焦点环，却没有提供足够可见的替代焦点样式。',
      '只写 `[aria-disabled="true"]` 的灰字样式，却忘记阻止点击或让控件仍可被聚焦，视觉与交互语义冲突。',
    ],
    sourceRefs: [
      'WCAG 2.2 Focus Visible. https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html',
      'MDN :focus-visible. https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible',
      'WAI ARIA Authoring Practices. https://www.w3.org/WAI/ARIA/apg/',
    ],
    steps: [
      [
        '焦点可见需要替代样式',
        '`:focus` 匹配任何获得焦点的元素，`:focus-visible` 更倾向在键盘导航等浏览器判断需要显示焦点的场景触发。若移除默认轮廓，必须提供具有足够对比和厚度的 `outline` 或等效可见指示，且不能被 `overflow: hidden` 裁掉。用 Tab、程序聚焦和鼠标点击分别验证，记录命中状态。',
        '移除轮廓就要补回焦点',
      ],
      [
        '禁用不等于视觉变淡',
        '原生 `disabled` 会阻止聚焦和交互，但某些场景需要保留可发现性时使用 `aria-disabled="true"`，并由脚本阻止操作；后者的视觉样式必须说明为何不可用。`pointer-events: none` 会同时影响辅助技术中的指针目标和事件判断，不应作为唯一禁用手段。检查 Tab 顺序与点击结果。',
        '视觉禁用必须匹配交互能力',
      ],
      [
        '错误状态连接语义',
        '输入框写 `aria-invalid="true"` 后可用 `[aria-invalid="true"]` 增强边框与背景，同时提供相邻错误文本和 `aria-describedby` 关联。CSS 不能用边框颜色代替错误原因，`role="alert"` 的更新还需服务端和脚本保证。验证空值、格式错误与已修正三种状态，错误提示不能盖住控件。',
        '错误样式服务于错误语义',
      ],
      [
        '选中状态区分 pressed 与 selected',
        '按钮切换可用 `aria-pressed`，标签页或列表项常用 `aria-selected`，复选控件由原生 checked 状态表达。样式按对应属性选择器增强，不要在多个 ARIA 模式之间混用。用属性面板与键盘操作确认状态更新后，CSS 计算值确实变化。',
        '状态属性必须与组件模式匹配',
      ],
      [
        '强制色彩模式核对轮廓',
        '在 `forced-colors: active` 下，背景与边框可能被系统色替换，低对比的焦点样式也可能消失。使用系统颜色或在需要时通过 `forced-color-adjust` 保留关键轮廓，并实际开启操作系统高对比模式测试。强制色彩不是自动无障碍证明，仍需逐态检查。',
        '极端显示环境也要能定位焦点',
      ],
    ],
  },
  {
    name: css3Name(c3Stage, '暗色与高对比主题验收'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '已完成本阶段前五课，能用 Token 切换主题并验证键盘状态。',
    goal: '能在亮色、暗色、强制色彩和高对比偏好下完成组件验收，处理系统色、图片、阴影和焦点状态的主题差异。',
    guidedPractice: '为一个表单与卡片页面提供 `data-theme="light"`、`data-theme="dark"` 和系统默认三种模式。打开 DevTools 的 prefers-color-scheme、forced-colors 模拟，记录每个模式的背景、文字、边框、焦点轮廓与禁用控件计算值。',
    independentPractice: '建立主题验收表，覆盖亮、暗、高对比、200% 缩放和减少动态效果。修复至少三个只在暗色或高对比下出现的问题，并保留修复前后的截图与对比度数据。',
    commonErrors: [
      '暗色主题只替换页面背景，组件内部仍写死白色卡片和透明边框，导致大块反光。',
      '高对比模式下仍强制自定义色，导致系统背景与文字颜色冲突，焦点不可见。',
    ],
    sourceRefs: [
      'WCAG 2.2 Non-text Contrast. https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html',
      'MDN forced-colors. https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors',
      'MDN prefers-contrast. https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-contrast',
    ],
    steps: [
      [
        '主题覆盖所有语义面',
        '暗色模式需要同时处理页面背景、卡片表面、浮层、输入框、边框、文字、状态色与阴影。只改 `body` 背景会让白色组件形成刺眼孤立块，只反转文字会让图片和图表失去对比。把所有语义 Token 列成矩阵，逐项确认每个主题都有值。',
        '主题是整套颜色关系',
      ],
      [
        '系统颜色与高对比模式',
        '`forced-colors: active` 下浏览器会强制替换许多颜色，系统颜色如 Canvas、CanvasText、ButtonFace、ButtonText 能表达语义。关键边框和焦点尽量使用 `outline`，必要时用 `forced-color-adjust: none` 只处理确实需要保留的图形。不能假设自定义品牌色仍会显示。',
        '高对比模式优先系统语义',
      ],
      [
        '图片与数据图形单独审计',
        '主题切换不会自动改变位图、图表线和透明 PNG。给图片提供适合背景的容器，给 SVG 使用 `currentColor` 或主题变量，给图表增加纹理和直接标签。用灰度截图与色觉模拟检查信息是否仍可理解。',
        '内容资源不会自动跟随主题',
      ],
      [
        '偏好变化而不是固定快照',
        '使用 `prefers-color-scheme`、`prefers-contrast` 与 `forced-colors` 提供默认，同时保留用户显式选择。监听媒体查询变化或刷新页面时读取系统状态，让操作系统切换后页面不必手动重载。测试系统亮暗切换、用户覆盖和重置三种流程。',
        '系统偏好与用户选择要有优先级',
      ],
      [
        '主题发布保留证据',
        '每个主题保存关键组件的 computed 值、对比度、焦点截图、滚动区与空状态。高对比模式下确认文本仍可读、边界仍可见、焦点轮廓不被 `box-shadow` 取代。200% 缩放与减少动态效果一并测试，最后才允许主题进入共享设计系统。',
        '主题验收不能只看首屏',
      ],
    ],
  },
];

// ── C4 组件样式、动效与隔离 ─────────────────────────────────────────────────
const c4Stage = '组件样式、动效与隔离';

const HANDWRITTEN_CSS3_C4_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: css3Name(c4Stage, '组件样式作用域与命名策略'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能维护多组件页面，并在浏览器中检查最终命中的 CSS 规则来源。',
    goal: '能比较 BEM、CSS Modules、Scoped CSS、Shadow DOM 与 `@scope` 的隔离方式，为组件选择不易泄漏且可覆盖的命名边界。',
    guidedPractice: '为一个按钮分别建立普通全局类、CSS Modules 哈希类、带 `data-ui="button"` 根属性和 Shadow DOM 示例。逐个在组件外加入同名 `.button` 与 `.button__icon`，记录元素是否受影响以及 DevTools 中最终命中的选择器。',
    independentPractice: '为通知组件编写命名与作用域方案，要求内部结构不被外部选择器按位置依赖，主题可以通过变量覆盖，组件仍支持键盘与高对比模式。提交泄漏测试与打包后类名截图。',
    commonErrors: [
      '只用 BEM 命名就认为样式已经隔离，外部仍可写 `.card .title` 影响内部元素。',
      '使用 CSS Modules 哈希类后把内部类名当作公共 API，组件重构就破坏外部主题。',
    ],
    sourceRefs: [
      'MDN CSS scoping. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scoping',
      'CSS Modules specification. https://github.com/css-modules/css-modules',
      'MDN Using shadow DOM. https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM',
    ],
    steps: [
      [
        '命名约定不是隔离机制',
        'BEM 通过 `.block__element--modifier` 减少同名冲突，但 CSS 仍作用于整个匹配范围，外部 `.page .block__element` 依然可以覆盖。命名提升可读性，不能阻止深层选择器或后加载样式。把外部规则指向内部元素并观察命中，能认清约定与浏览器隔离的区别。',
        '命名减少冲突，不阻止覆盖',
      ],
      [
        '构建工具生成局部类名',
        'CSS Modules 会把导入的类名编译成哈希名，组件必须通过模块导出的映射使用，因此天然减少全局碰撞；`:global()` 则会重新暴露全局名字。哈希类不适合作为外部稳定接口，主题应通过数据属性或自定义属性。检查构建产物确认类名映射，不用源码中的短名判断线上选择器。',
        '局部类名是构建期契约',
      ],
      [
        '属性根建立稳定边界',
        '组件根使用 `data-ui="dialog"`，内部选择器限定为 `[data-ui="dialog"] .dialog__body`，外部只依赖根属性与公开状态，不依赖中间 DOM。配合 `:where([data-ui="dialog"])` 降低基础层权重，业务层仍能覆盖。用类名重构内部元素后重跑外部主题测试。',
        '把根属性当公开边界',
      ],
      [
        'Scoped 与 Shadow DOM 的差异',
        '某些框架的 scoped CSS 通过编译属性和选择器实现隔离，DOM 仍是同一个可继承样式树；Shadow DOM 建立独立样式树，外部选择器通常不能穿透，但 CSS 自定义属性和部分继承值仍可进入。选择时应考虑主题、表单和可访问性集成成本，而非只看选择器是否加哈希。',
        '隔离强度决定扩展方式',
      ],
      [
        '用泄漏用例验收方案',
        '至少测试外部命中内部类、跨组件同名元素、父级继承色、主题变量覆盖和组件嵌套。每个用例保存选择器、命中截图与 computed 值。通过标准不是“没有任何样式能影响”，而是公开接口能覆盖、内部实现可替换、外部意外选择器不破坏结构。',
        '隔离边界要能被测试',
      ],
    ],
  },
  {
    name: css3Name(c4Stage, '状态变体、数据属性与组合'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '能用类选择器、属性选择器和伪类改变元素外观，并知道组件有默认、交互与业务状态。',
    goal: '能用数据属性与 ARIA 状态驱动样式变体，控制状态组合的优先级，并避免视觉状态与组件逻辑脱节。',
    guidedPractice: '为一个按钮建立 `data-variant="primary|danger|ghost"`、`data-size="sm|md"` 和 `data-state="idle|loading|success"`。分别组合属性，记录选择器命中顺序，再让脚本只改 `aria-pressed` 而不改类名，观察样式是否同步。',
    independentPractice: '为筛选列表实现默认、选中、禁用、加载和错误五种状态，其中变体与尺寸可自由组合。要求状态由属性表达，不使用一个超长类名拼接，并提供组合矩阵截图。',
    commonErrors: [
      '为每种组合复制整段样式，新增一个尺寸后必须改动所有变体。',
      '用 `.is-loading` 改视觉但忘记同步 `aria-busy` 与禁用交互，屏幕阅读器得到错误状态。',
    ],
    sourceRefs: [
      'MDN Attribute selectors. https://developer.mozilla.org/en-US/docs/Web/CSS/Attribute_selectors',
      'MDN CSS custom properties. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascading_variables/Using_CSS_custom_properties',
      'WAI ARIA states and properties. https://www.w3.org/TR/wai-aria-1.2/#states_and_properties',
    ],
    steps: [
      [
        '正交变体分别表达',
        '组件同时拥有类型、尺寸、状态三个正交维度时，分别使用 `data-variant`、`data-size`、`data-state`，选择器按维度读取 Token，而不是为每个组合写一整份规则。这样 `danger + md + loading` 由三层声明组合得到，新增尺寸只扩展一层。',
        '维度分开，样式才能组合',
      ],
      [
        '属性值提供清晰词表',
        '`[data-variant="primary"]` 比随意类名 `.btn-blue` 更能表达语义。属性值应来自稳定词表，组件运行时不得写入任意用户字符串。对默认值可在根上省略属性，由基础规则提供；对非法值可用 `:not([data-variant])` 或回退变量，防止未知主题值让组件无样式。',
        '变体词表也是公共契约',
      ],
      [
        'ARIA 状态参与视觉选择',
        '`button[aria-pressed="true"]`、`[aria-selected="true"]`、`[aria-invalid="true"]` 可以驱动选中和错误样式，使无障碍属性与视觉同步。不要用同一个 `aria-expanded` 同时代表菜单打开与筛选选中。组件逻辑更新属性，CSS 响应属性，测试同时检查功能和外观。',
        '状态属性是视觉与语义的共同来源',
      ],
      [
        '组合冲突按明确顺序解决',
        '尺寸规则放基础层，变体规则放组件层，临时状态规则放状态层；同类选择器不要靠源码随机顺序。使用 `:where()` 降低基础样式权重，危险变体再覆盖primary，加载状态可临时禁用交互视觉但不删除可访问名称。用属性组合表找出双重命中规则。',
        '组合优先级要可解释',
      ],
      [
        '建立组合矩阵回归',
        '矩阵至少覆盖每个变体、每个尺寸和关键状态的交叉，不必穷举所有业务组合，但必须包含最容易冲突的边界。检查背景、边框、文字、图标旋转、焦点环与禁用行为，不只比较颜色。组合矩阵进入截图任务后，新增变体必须同步补测试。',
        '新变体不能只补一条 CSS',
      ],
    ],
  },
  {
    name: css3Name(c4Stage, '过渡、动画与 prefers-reduced-motion'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能写 transition 和 @keyframes，并知道哪些 CSS 属性会触发布局或绘制。',
    goal: '能选择过渡属性与时长，处理离散状态和中断动画，并为减少动态效果偏好提供不丢失信息的替代。',
    guidedPractice: '为菜单开关写 `opacity`、`transform` 与 `grid-template-rows` 三个候选过渡，使用 Performance 面板比较布局、绘制和合成分工。再加入 `@media (prefers-reduced-motion: reduce)`，记录动画关闭后焦点和状态反馈是否仍在。',
    independentPractice: '实现一个可中断的抽屉：打开、关闭、快速反向操作都不能闪烁，减少动效模式下立即可用。提交 transition 参数、合成层变化、焦点位置与两种模式截图。',
    commonErrors: [
      '对 `display: none` 直接写 opacity 过渡，离散属性瞬间切换导致动画没有播放。',
      '只在动画正常结束回调里恢复交互，用户中途关闭或减少动效时界面卡在加载态。',
    ],
    sourceRefs: [
      'MDN Using CSS transitions. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_transitions/Using_CSS_transitions',
      'MDN prefers-reduced-motion. https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion',
      'W3C CSS Transitions Level 2. https://www.w3.org/TR/css-transitions-2/',
    ],
    steps: [
      [
        '过渡只作用于可插值属性',
        '`transition: opacity 160ms ease-out` 会让 opacity 在两个数值间插值，而 `display` 这类离散属性默认没有中间帧。`transform` 和 `opacity` 通常更接近合成阶段，布局属性会引发布局与绘制。用 Performance 面板记录不同候选属性，确认收益来自实际渲染阶段而非属性名字。',
        '先选属性，再谈时长',
      ],
      [
        '缓动和时长表达因果',
        '入场可使用稍长的减速曲线，退场通常更短，交互反馈应足够快但不过分抖动。多个属性需要不同节奏时分别写 `transition-property`、duration 与 delay，不要用一个总时长掩盖所有变化。用慢速动画工具观察起止，确保用户操作后能看到明确响应。',
        '节奏服务于状态变化',
      ],
      [
        '离散状态使用允许过渡的机制',
        '展开/收起若依赖 `display` 或 `content-visibility`，可结合 `@starting-style`、`transition-behavior: allow-discrete` 与对应属性实现，但仍要检查浏览器支持。更复杂的高度变化优先用 Grid `grid-template-rows: 0fr` 到 `1fr`，避免硬编码像素。用键盘快速切换验证中间态。',
        '离散变化需要专门机制',
      ],
      [
        '动画要可中断可重试',
        '动画进行中再次点击时，状态应由最终属性决定，CSS 过渡会从当前计算值继续；`@keyframes` 可能因 `animation-fill-mode` 卡在结束帧。加载动画不应让按钮尺寸跳动，成功反馈不应无限旋转。用双击、快速反向和组件卸载测试清理动画状态。',
        '用户操作可能打断任何动画',
      ],
      [
        '减少动效不等于删除反馈',
        '在 `prefers-reduced-motion: reduce` 下取消大幅位移与循环动画，保留颜色、边框或即时文本反馈。必要时使用 `transition-duration: 0.01ms` 避免依赖 transitionend 的代码永不触发，并同步调整脚本逻辑。记录减少模式下的状态可达与焦点位置。',
        '减少运动仍要保留可理解反馈',
      ],
    ],
  },
  {
    name: css3Name(c4Stage, '对话框、菜单和浮层定位'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '理解 absolute、fixed、z-index 与粘性定位，并能使用按钮交互打开和关闭浮层。',
    goal: '能使用 dialog、popover 和 CSS 定位机制把浮层放入正确层，处理滚动、裁切、焦点与屏幕边缘碰撞，并说明不支持能力的回退。',
    guidedPractice: '用原生 `dialog.showModal()` 创建对话框，检查 `::backdrop`、top layer、Escape 关闭和焦点返回。再做一个 popover 菜单，改变滚动位置、缩窄窗口和放大字体，记录锚点与浮层是否越出视口。',
    independentPractice: '实现带标题、关闭按钮和菜单项的工具浮层，要求不被父级 overflow 裁切、移动端不超出安全区、键盘焦点顺序正确。记录浏览器不支持 popover 时的回退表现。',
    commonErrors: [
      '在普通 absolute 浮层上不断增大 z-index，仍被祖先 transform 创建的层叠上下文困住。',
      '菜单只处理点击关闭，没有 Escape、焦点返回或背景滚动锁定，键盘用户会迷失位置。',
    ],
    sourceRefs: [
      'HTML dialog element. https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element',
      'MDN Popover API. https://developer.mozilla.org/en-US/docs/Web/API/Popover_API',
      'MDN CSS anchor positioning. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_anchor_positioning',
    ],
    steps: [
      [
        'top layer 脱离普通层叠',
        '`showModal()` 打开的 dialog 与打开的 popover 会进入 top layer，绘制顺序高于普通文档层，并由浏览器管理背景与部分交互。top layer 不是普通的 z-index 层，不能靠无限叠加 `z-index: 99999` 复制其行为。用 DevTools 查看元素所在层和 `::backdrop`，确认祖先 transform 不再影响其顶层关系。',
        '顶层浮层使用浏览器机制',
      ],
      [
        '定位参照与屏幕边界',
        '固定定位浮层可相对视口放置，但滚动、缩放和虚拟键盘会改变可见区域；未来可用 CSS anchor positioning，但支持矩阵必须先验证。无法使用锚点定位时，用脚本计算按钮和视口矩形，把 left/top 限制在安全边距内。测试窗口四角、滚动一半和移动端键盘弹出。',
        '浮层必须知道可见边界',
      ],
      [
        '对话框建立模态语义',
        '原生 dialog 提供标题、关闭和返回焦点的语义基础，`open` 表示显示，`aria-labelledby` 关联标题更明确。`::backdrop` 只负责视觉遮罩，关闭逻辑与焦点陷阱由 dialog 和脚本共同保证。验证背景是否可点击、Escape 行为、初始焦点和关闭后焦点返回。',
        '视觉遮罩不等于模态行为',
      ],
      [
        '菜单需要完整键盘模式',
        'CSS 可以设置 `[popover]:popover-open` 状态与定位，但方向键移动、Home/End、Escape 与焦点管理必须与所选 ARIA 模式一致。不要把页面导航直接伪装为 menu；普通链接列表使用普通 button 与 list 结构。测试打开、选择、取消与重新打开四条路径。',
        '浮层样式不能补足缺失的键盘逻辑',
      ],
      [
        '裁切、滚动与回退矩阵',
        '组合场景包含父级 `overflow: hidden`、两个浮层同时竞争、页面滚动 500px、窄屏 320px 和 200% 缩放。记录浮层矩形、视口矩形、焦点元素与关闭按钮位置。对缺少 popover 或锚点能力的浏览器，回退为内联面板或固定底部面板，不能留下不可见菜单。',
        '浮层要有可见的降级形态',
      ],
    ],
  },
  {
    name: css3Name(c4Stage, '第三方样式覆盖与隔离层'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能阅读第三方组件生成的 DOM 与 CSS，并理解层叠层和选择器特异性。',
    goal: '能用 vendor 层、低权重属性和变量桥接控制第三方样式，判断何时需要 Shadow DOM 或 iframe，并避免升级时大面积覆盖失效。',
    guidedPractice: '引入一个带默认按钮样式的第三方组件，先直接写 `.modal .btn.btn-primary` 覆盖，再改成 `@layer vendor, app`，在 app 层用根部变量与稳定属性覆盖。记录 DevTools 中的层、特异性、来源文件与升级后选择器变化。',
    independentPractice: '为一个日期选择器和提示框写覆盖清单，区分颜色变量、结构类、状态属性和无法稳定覆盖的部分。要求卸载第三方样式时页面仍可读，并提交依赖版本与回退方案。',
    commonErrors: [
      '依赖 `div > div:nth-child(3)` 命中第三方内部结构，组件小版本升级后选择器悄悄失效。',
      '把第三方样式放在未分层普通规则中，再用 `!important` 与之争夺，后续所有覆盖都失去可维护性。',
    ],
    sourceRefs: [
      'MDN Cascade layers. https://developer.mozilla.org/en-US/docs/Web/CSS/@layer',
      'MDN CSS scoping. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scoping',
      'web.dev Cascade layers. https://web.dev/articles/cascade-layers',
    ],
    steps: [
      [
        '先盘点第三方样式边界',
        '记录第三方包的版本、CSS 入口、全局变量、公开类名和文档承诺的可定制点。运行 DevTools Coverage 与 Styles 面板，找出实际加载但页面没用的规则。稳定覆盖应优先使用官方变量和明确公开属性，不把内部 DOM 层级当成接口。',
        '覆盖前先确认公开契约',
      ],
      [
        '用层控制供应商权重',
        '把第三方样式导入 `vendor` 层，业务样式放 `app` 层，并在入口声明顺序。普通声明中 app 层高于 vendor 层，可减少选择器竞赛；但浏览器加载进未分层规则时可能高于所有层，必须检查打包结果。升级后复跑计算样式与覆盖用例。',
        '层序让覆盖从权重竞争变成架构',
      ],
      [
        '变量桥接优于结构选择器',
        '第三方组件若暴露 `--calendar-accent` 等变量，应用只映射自己的语义 Token，例如 `--calendar-accent: var(--color-action)`，不要复制整段内部样式。若只暴露类名，则在组件根下限定属性并使用 `:where()` 降权。用主题切换验证桥接变量能继续生效。',
        '优先连接公开变量',
      ],
      [
        '结构性覆盖准备迁移成本',
        '确实需要改内部布局时，保存依赖版本、选择器和截图基线，在升级清单中列为破坏风险。`revert-layer` 可撤销当前层回到前一层，但不能修复不合理的选择器依赖。若第三方无法提供稳定接口，评估隔离容器或替换组件，而不是无限堆补丁。',
        '脆弱覆盖需要版本化',
      ],
      [
        '强隔离与正常覆盖各有代价',
        'Shadow DOM 或 iframe 能阻止外部选择器穿透，但主题、尺寸、焦点与表单协作通过边界需要额外协议。普通 DOM 加层更适合可协作组件。验收应覆盖样式泄漏、焦点、主题、空状态和高对比，并记录方案在浏览器矩阵中的差异。',
        '隔离越强，接口越需要显式',
      ],
    ],
  },
  {
    name: css3Name(c4Stage, '组件视觉回归与交互状态'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '已完成本阶段前五课，能运行浏览器自动化并设计多种组件状态。',
    goal: '能为组件建立默认、变体、交互与主题的视觉回归矩阵，捕获 hover、focus、open 和减少动效状态，并区分真实缺陷与稳定环境差异。',
    guidedPractice: '为按钮、输入框和菜单各生成普通、悬停、焦点、禁用、打开与错误状态截图。用 Playwright 触发 `hover()`、`focus()` 和 `click()`，等待动画结束后对比截图与 DOM 矩形，记录焦点环是否被裁切。',
    independentPractice: '为共享组件库建立状态矩阵，覆盖亮暗主题、320 与 1440px、减少动效和长文案。提交基线截图、溢出断言与审查说明，证明新增变体已被纳入回归。',
    commonErrors: [
      '只测默认态截图，悬停与焦点造成的布局抖动和轮廓裁切长期未被发现。',
      '为了让截图稳定而全局关闭所有动画，导致仅影响动效结束态的真实缺陷无法被发现。',
    ],
    sourceRefs: [
      'Playwright visual comparisons. https://playwright.dev/docs/test-snapshots',
      'MDN :focus-visible. https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible',
      'MDN prefers-reduced-motion. https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion',
    ],
    steps: [
      [
        '状态矩阵从接口出发',
        '组件公开的每个 variant、size、state 与主题都应进入测试清单，关键交互再补 hover、focus-visible、active、open 与 disabled。矩阵不必穷举所有笛卡尔积，但要包含每个值及其冲突组合。新增变体必须同步增加基线，否则状态会从设计系统契约中漂移。',
        '测试状态要跟公开接口一致',
      ],
      [
        '真实触发交互状态',
        '截图前通过浏览器自动化的鼠标与键盘操作触发状态，而不是直接添加一个可能永远不由组件逻辑产生的类名。检查属性、焦点元素和 computed 值，再等待过渡完成。使用 `page.keyboard.press("Tab")` 更能验证 `:focus-visible`，也能暴露焦点顺序问题。',
        '自动化应走真实交互路径',
      ],
      [
        '稳定动画而不掩盖动画',
        '可以等待 `animationend`、固定 transition duration 或注入减少动效媒体条件，但必须另外保留一组允许动效的测试，检查最终位置与中断状态。对循环动画截取前先暂停到指定帧。否则截图稳定了，却遗漏按钮在动画结束前不可点击等问题。',
        '稳定与覆盖要同时满足',
      ],
      [
        '几何断言补充像素 diff',
        '像素 diff 能发现颜色与对齐变化，但无法解释原因。同时断言按钮矩形、滚动容器宽、焦点环绘制范围、浮层是否在视口内。元素被 `overflow: hidden` 裁掉但在截图中恰好相同位置时，几何与 DOM 检查能提供更多证据。',
        '截图之外仍需布局断言',
      ],
      [
        '审查状态基线变更',
        '差异报告按阻断、可接受、待确认分类，并附上 DOM、computed 与浏览器版本。基线更新不能由实现者无审查批量接受；至少一位维护者确认状态语义、键盘行为和主题未退化。这样才能让视觉回归成为设计系统门禁。',
        '基线更新也是发布审查',
      ],
    ],
  },
];

// ── C5 性能、工具链与企业设计系统 ───────────────────────────────────────────
const c5Stage = '性能、工具链与企业设计系统';

const HANDWRITTEN_CSS3_C5_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: css3Name(c5Stage, '选择器、布局、绘制与合成成本'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能使用 DevTools Performance 面板录制交互，并知道 CSS 会经过样式计算、布局、绘制和合成阶段。',
    goal: '能按样式计算、布局、绘制和合成四类成本定位 CSS 性能问题，选择不会引发大面积回流或重复绘制的属性与容器限制。',
    guidedPractice: '分别给 500 个列表项切换 `width`、`background-color` 与 `transform: translateX()`，用 Performance 面板录制每次变化，标记样式重算、布局、绘制和合成耗时。再给列表父级加 `contain: layout paint`，记录滚动性能变化。',
    independentPractice: '优化一个滚动卡顿的卡片流，先用性能轨迹确定主要成本是布局、绘制还是合成，再选择属性、containment 与资源解码策略。提交优化前后的主线程火焰图、帧时长和视觉效果。',
    commonErrors: [
      '看到 `transform` 就认为所有动画都很便宜，忽略大量元素同时创建合成层带来的内存与栅格化成本。',
      '只优化选择器字符串，没有发现真正的成本来自每帧读取布局属性后修改尺寸造成的强制同步布局。',
    ],
    sourceRefs: [
      'web.dev Rendering performance. https://web.dev/learn/performance/rendering',
      'MDN CSS containment. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment',
      'web.dev Animations and performance. https://web.dev/articles/animations-guide',
    ],
    steps: [
      [
        '样式计算不只是匹配选择器',
        '浏览器为每个受影响元素收集声明、处理层叠与继承，再计算样式。选择器匹配通常不是最大瓶颈，但极深的后代选择器配合大规模 DOM 仍会增加工作。优先通过有限层级、`:where()` 降权重、组件根属性减少无效匹配。用 Performance 的 Calcaulate Style 段和 DevTools 强制重算样式观察成本。',
        '先测量样式重算范围',
      ],
      [
        '布局属性会改变几何',
        '修改 width、height、margin、font-size、grid-template 等属性可能让元素及邻居重新排版，成本随受影响子树规模增长。避免在滚动事件中反复写布局属性，读写分离可减少强制同步布局。用 `getBoundingClientRect()` 与写样式交替的正反例对比轨迹。',
        '几何变化需要重排',
      ],
      [
        '绘制与合成各有边界',
        '颜色、阴影、背景和圆角可能触发绘制，`transform` 与 `opacity` 更适合由合成器推进，但首帧仍可能需要栅格化。`will-change` 只能短时提示且会占内存，不应永久贴在所有元素上。通过 Layers 面板与内存观察确认合成层数量。',
        '合成快不意味着免费',
      ],
      [
        '用 containment 限制影响范围',
        '`contain: layout paint` 可以告诉浏览器子树布局与绘制不影响外部，但会引入新的包含关系，可能改变百分比、粘性和定位行为。`content-visibility: auto` 可跳过屏外内容渲染，需要 `contain-intrinsic-size` 提供占位并检查查找与可访问性。先在独立组件验证。',
        '性能优化会改变布局语义',
      ],
      [
        '优化收益用轨迹证明',
        '记录交互前基线、改动后轨迹、帧率与长任务数量，确认优化确实减少目标阶段而不是把成本推到别处。视觉回归保证元素位置与可读性未变，内存面板检查合成层没有暴涨。只报告“使用了 transform”不构成性能证据。',
        '性能结论必须回测',
      ],
    ],
  },
  {
    name: css3Name(c5Stage, '样式体积、重复规则与按需加载'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '能查看构建产物中的 CSS 文件，并使用 DevTools Coverage 观察页面实际使用的样式。',
    goal: '能定位重复规则、未使用样式和阻塞加载路径，使用拆分、压缩、按需加载与缓存策略控制首屏与路由样式体积。',
    guidedPractice: '对一个包含重置、组件库和页面样式的构建产物运行 Coverage，记录每个 CSS 文件的使用率。再把路由样式拆成独立文件，比较首屏请求数、字节数、阻塞时间与页面闪烁情况。',
    independentPractice: '为一个后台系统划分基础、组件、页面和第三方四类 CSS，设置首屏预算与按需加载策略。要求切换路由时不出现短暂无样式，并提交压缩前后大小和请求瀑布。',
    commonErrors: [
      '把所有第三方组件样式和所有页面样式塞进一个全局文件，首屏为了一个弹窗下载整套 CSS。',
      '按路由异步拆 CSS 却没有处理导航期间的加载顺序，页面先渲染无样式内容再闪变。',
    ],
    sourceRefs: [
      'MDN CSS performance optimization. https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/CSS',
      'web.dev CSS optimization. https://web.dev/learn/performance/css',
      'MDN CSS @import. https://developer.mozilla.org/en-US/docs/Web/CSS/@import',
    ],
    steps: [
      [
        '先测首屏实际使用率',
        'Coverage 会显示浏览器加载了哪些 CSS 规则以及首屏是否使用，但它只反映当前交互路径，不能直接删除未命中规则。先固定页面与视口，采集首屏、主要弹窗、表格和空状态的覆盖记录，识别真正共享的基础样式与只在特定路由出现的规则。',
        '未使用不等于可以删除',
      ],
      [
        '拆成稳定边界',
        '基础 Token 与 reset、共享组件、页面样式、第三方样式应分开打包，第三方再按实际组件入口引入。页面样式可随路由按需加载，但关键布局与主题 Token 保持在首屏。拆分的目的不仅是减小文件，也是让缓存失效范围更清晰。',
        '文件边界对应失效边界',
      ],
      [
        '避免串行加载与闪变',
        '大量 `@import` 可能形成串行请求，应交给构建工具合并或预加载关键 CSS。路由拆包要保证组件渲染前样式已插入，或先显示稳定骨架。缓存文件用内容哈希，HTML 不长期缓存。记录慢网下 First Contentful Paint 与布局偏移。',
        '异步样式也要有呈现时序',
      ],
      [
        '压缩并清除无效产物',
        '生产构建压缩空白、合并重复声明、去除不可达选择器与重复 Token，但不要跨层随意合并而改变级联结果。Lightning CSS、PostCSS 等工具能处理前缀和语法降级，目标浏览器由 browserslist 固定。比较 gzip 与 brotli 后大小，同时保留未压缩源映射用于排障。',
        '压缩必须保持层叠语义',
      ],
      [
        '把体积变成发布预算',
        '为首页、组件包和路由包设 KB 预算，构建失败时指出超出项。分析规则数、自定义属性数、重复声明与第三方占比，优先删除重复来源而不是无差别缩短类名。每次发布保存请求瀑布与 Coverage 摘要，避免 CSS 体积在多次小改动中缓慢膨胀。',
        '体积预算要进入 CI',
      ],
    ],
  },
  {
    name: css3Name(c5Stage, 'Stylelint、格式化和设计 Token 构建'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能运行 pnpm 脚本，并理解 CSS 变量、配置文件与 CI 检查的基本流程。',
    goal: '能配置 Stylelint 拦截无效语法和团队规则，把 Token 源构建为 CSS 变量，并让格式化、校验、类型检查和构建在 CI 中按固定顺序执行。',
    guidedPractice: '安装 Stylelint 与共享配置，先运行一次固定检查，再添加 `stylelint --fix` 查看哪些规则可自动修复。写一个错误色值和未知属性触发失败，随后建立 Token JSON 到 `tokens.css` 的构建脚本，并比较源值与生成文件。',
    independentPractice: '为一个新组件包配置 Stylelint、Prettier 与 Token 构建，设置禁止手写原始色值、要求自定义属性命名规范、生成文件只读。把格式检查、lint、Token 构建和产物差异检查接入 CI。',
    commonErrors: [
      'CI 运行 `stylelint --fix`，自动修改工作区却仍以成功退出，真正的规则问题没有阻断合并。',
      '手动维护 Token JSON 与 CSS 变量两份来源，设计师改一处后组件使用另一处，长期出现版本漂移。',
    ],
    sourceRefs: [
      'Stylelint Documentation. https://stylelint.io/',
      'Style Dictionary Documentation. https://styledictionary.com/',
      'Lightning CSS Documentation. https://lightningcss.dev/',
    ],
    steps: [
      [
        '规则从可验证错误开始',
        'Stylelint 基础配置先覆盖无效十六进制、未知属性、重复属性、空规则和意外的 `!important`，再按团队约定增加自定义属性命名与层级限制。规则应能解释触发的源码位置，避免一次开启大量主观格式规则。用最小错误样例验证每条关键规则确实失败。',
        '先拦截确定错误',
      ],
      [
        '自动修复与检查分开',
        '本地可使用 `stylelint --fix` 快速整理可修复项，CI 执行不带 `--fix` 的检查，确保工作区干净且退出码能阻断合并。格式化工具只处理空格与换行，lint 处理语义和约定，两者职责不要混在一个脚本里。保存前与提交时使用同一配置版本。',
        'CI 不替开发者偷偷改文件',
      ],
      [
        'Token 源保持单一',
        'Token 的 JSON 或 YAML 是源，构建脚本输出 CSS 自定义属性、主题文件和文档表格。输出文件带生成标记并禁止手改，CI 重新生成后检查 Git diff 为空。颜色、字号、间距都保留稳定 Token 名，构建失败时定位到源键而不是生成文件。',
        '生成文件不能成为第二真相',
      ],
      [
        '构建链连接层与语法降级',
        'Token 构建先输出语义变量，再由 Lightning CSS 或 PostCSS 处理目标浏览器需要的语法、压缩和前缀。`@layer`、逻辑属性与新颜色语法是否可直出由浏览器矩阵决定，不凭开发者当前浏览器判断。保存源 CSS、构建产物和 diff 便于审查。',
        '工具链要服从兼容目标',
      ],
      [
        '门禁顺序固定且可复现',
        '建议顺序为格式检查、Stylelint、Token 生成一致性、TypeScript 检查、单元与视觉测试、生产构建。每个步骤输出明确文件名和退出码，缓存只作用于下载与编译，不跳过校验。发布包记录依赖锁、Token 版本和构建时间，方便回查样式来源。',
        '同一输入必须得到同一产物',
      ],
    ],
  },
  {
    name: css3Name(c5Stage, '视觉回归、截图矩阵与审查流程'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能使用 Playwright 截图，并理解不同浏览器、字体和视口会改变绘制结果。',
    goal: '能设计跨浏览器、视口、主题和交互状态的视觉回归矩阵，使用掩码与等待策略稳定截图，并通过审查流程处理基线变化。',
    guidedPractice: '为同一组件在 Chromium、Firefox 与 WebKit 中生成亮暗主题截图，记录字体加载、动画结束与图片解码等待。给时间戳和随机头像添加稳定测试数据或掩码，比较未处理与处理后的失败噪声。',
    independentPractice: '为一个页面建立截图矩阵：3 个浏览器、2 个视口、2 个主题、4 个关键交互状态。设置像素阈值与几何断言，编写基线更新审批说明，并分类一次真实回归与一次环境噪声。',
    commonErrors: [
      '不同浏览器共用一个基线文件，渲染差异被误判为 CSS 故障。',
      '截图阈值设得过大，边框消失或文字被裁切仍低于差异比例，真实回归被放过。',
    ],
    sourceRefs: [
      'Playwright visual comparisons. https://playwright.dev/docs/test-snapshots',
      'Playwright browsers. https://playwright.dev/docs/browsers',
      'Chrome DevTools rendering. https://developer.chrome.com/docs/devtools/rendering/overview',
    ],
    steps: [
      [
        '矩阵按风险组合',
        '浏览器决定字体栅格化与 CSS 支持，视口决定布局断点，主题决定 Token 覆盖，交互状态决定焦点与浮层。矩阵要覆盖高风险组合而不是无限笛卡尔积，例如侧栏折叠加暗色、错误表单加 320px、菜单打开加键盘焦点。',
        '用风险选择截图组合',
      ],
      [
        '固定字体与数据夹具',
        '在截图前等待 `document.fonts.ready`，使用同一字体文件或系统字体策略，固定日期、头像、随机数和网络响应。动态内容可通过稳定测试数据、裁剪区域或明确掩码处理。掩码会隐藏缺陷，因此必须记录掩码原因和覆盖范围。',
        '不确定性要显式管理',
      ],
      [
        '交互截图检查行为',
        '截图 `hover`、`:focus-visible`、菜单展开、错误和加载状态时，要先用真实指针、Tab 或点击触发，等待过渡完成，再断言 DOM 属性与矩形。焦点轮廓可能超出元素截图区域，需截取父容器或使用完整页面截图。',
        '状态截图必须绑定行为',
      ],
      [
        '像素差与几何断言并用',
        '像素比较擅长发现颜色、字距和遮挡，几何断言擅长发现隐藏溢出、焦点环裁切和滚动容器边界。按浏览器配置单独阈值，低对比背景变化不能靠大阈值忽略。失败产物保存实际图、期望图、diff 与视口信息，并同时记录元素的边界矩形和滚动尺寸，避免肉眼审查漏掉被裁切区域。',
        '不同缺陷需要不同证据',
      ],
      [
        '基线更新走审查流程',
        '实现者先解释变化来自哪条设计或代码变更，审查者确认所有受影响状态都可接受后再更新基线。批量接受、自动更新与屏蔽全部失败都会让回归机制失去意义。保留基线版本与组件发布版本，回滚时能恢复旧图，并让审查记录对应到具体拉取请求和组件版本。',
        '基线是审批产物',
      ],
    ],
  },
  {
    name: css3Name(c5Stage, '组件库版本、兼容和迁移'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能维护带样式的共享组件包，并理解语义化版本、浏览器支持和依赖锁定。',
    goal: '能为设计系统定义稳定的 CSS 公共接口、浏览器支持范围和废弃策略，使用 `@supports` 与渐进增强完成可控迁移。',
    guidedPractice: '把一组组件的变量、数据属性和内部类分成公开、实验、私有三类，制作一个删除旧变量名的迁移练习。使用新的兼容 Token 别名过渡一个版本，记录旧页面未升级时是否仍正常渲染。',
    independentPractice: '为一个组件库设计 2.0 迁移方案，包含发布说明、浏览器支持、自动 codemod、旧变量兼容期、视觉回归与回滚条件。实际迁移一个页面并提交前后截图。',
    commonErrors: [
      '把 CSS 变量和内部类名视为没有 API 的私人物品，直接删除后所有下游页面同步失效。',
      '只在本机浏览器验证新语法，没有按声明的浏览器矩阵测试回退，旧内核用户看到无样式组件。',
    ],
    sourceRefs: [
      'MDN @supports. https://developer.mozilla.org/en-US/docs/Web/CSS/@supports',
      'MDN Browser compatibility. https://developer.mozilla.org/en-US/docs/Web/API/Window/navigator',
      'web.dev Progressive enhancement. https://web.dev/articles/progressive-enhancement',
    ],
    steps: [
      [
        'CSS 公共接口需要清单',
        '公开接口包括组件根属性、状态属性、自定义属性、可继承 Token 和公开伪元素，内部类名、DOM 层级与偶然计算值不属于稳定契约。为每项标注用途、默认值、兼容期和负责人，删除公共接口要走废弃流程而不是随重构消失。',
        '样式也有版本化 API',
      ],
      [
        '浏览器支持写成构建目标',
        '把支持的浏览器版本写入 browserslist 与文档，再让构建工具决定哪些语法需要降级。使用 `@supports` 为容器查询、新颜色或 popover 提供增强，不把这些能力作为基础功能唯一入口。测试矩阵至少覆盖支持范围和最低版本。',
        '兼容承诺要能被工具读取',
      ],
      [
        '渐进增强保留基础可用',
        '先提供普通类名、媒体查询和可读颜色，再用 `@supports` 增加容器查询布局、锚点定位或离散过渡。可以用 `@supports not (...)` 补普通文档流样式，但更简单的是让基础规则本身完整，支持分支只改善布局。删除旧语法前统计下游使用情况，确保无增强版本仍能完成主要任务。',
        '增强层不能变成单点依赖',
      ],
      [
        '兼容别名支持平滑迁移',
        '发布新变量 `--color-action-strong` 时，可暂时让 `--color-action` 指向它，或在旧变量存在时保留回退映射。注意变量循环与新主题覆盖顺序。记录别名计划删除的版本，Codemod 批量替换后由视觉回归确认。',
        '迁移期需要可观察的旧接口',
      ],
      [
        '发布与回滚都包含样式',
        '发布记录包版本、Token 源、浏览器矩阵、截图基线、兼容别名和已知差异。回滚不仅恢复 JavaScript 包，还要恢复 CSS 与 Token 产物，避免代码回退而样式前进。灰度发布观察布局错误、焦点异常和样式下载失败。',
        '版本回滚必须覆盖 CSS 制品',
      ],
    ],
  },
  {
    name: css3Name(c5Stage, '企业后台设计系统毕业项目'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '完成本课程前五个阶段，能独立实现响应式布局、主题、组件状态和样式质量门禁。',
    goal: '从空目录交付一套支持桌面、平板、手机、亮暗主题与键盘操作的后台设计系统，并提供 Token、组件文档、视觉回归和性能预算证据。',
    guidedPractice: '搭建设计系统骨架：Token 源、CSS 层序、应用壳、按钮、表单、表格、对话框与通知。为每个组件建立状态展示页，运行 Stylelint、Token 生成检查、截图矩阵与首屏 CSS 体积报告，记录第一轮失败项。',
    independentPractice: '完成一个可演示后台页面，覆盖侧栏折叠、表格横向滚动、表单错误、菜单浮层、暗色主题和 320px 手机视图。交付运行说明、迁移说明、性能预算、可访问性检查和一次故障回滚演练。',
    commonErrors: [
      '项目只展示漂亮的首屏，缺少错误、空数据、长文本、键盘焦点和移动端状态。',
      '设计 Token、组件源码与文档各维护一套值，毕业时已经无法说明哪个是权威来源。',
    ],
    sourceRefs: [
      'web.dev Learn CSS. https://web.dev/learn/css',
      'W3C CSS Specifications. https://www.w3.org/TR/CSS/',
      'WCAG 2.2 Quick Reference. https://www.w3.org/WAI/WCAG22/quickref/',
    ],
    steps: [
      [
        '冻结范围与验收矩阵',
        '项目范围固定为一套后台壳层与六类基础组件，验收覆盖 320、768、1024、1440px，亮暗与强制色彩，鼠标与键盘，以及空、长、错误三种内容。交付物包括源码、Token 源、组件状态页、截图基线、体积报告与运行说明。先把不做的组件写入非目标，避免范围失控。',
        '范围小但状态完整',
      ],
      [
        '建立 Token 与层叠架构',
        'Token 采用基础、语义、组件三层，CSS 按 reset、tokens、base、components、utilities 分层，主题只覆盖语义层。每个组件只消费公共变量与根属性，内部 DOM 可被重构。用循环变量、缺失变量、亮暗切换三类实验验证回退。',
        '先固定设计系统契约',
      ],
      [
        '实现壳层与组件状态',
        '主壳用 Grid 固定侧栏与主内容，工具栏用 Flex，表格在自身容器滚动。按钮、输入、表格、对话框、通知和菜单必须包含默认、悬停、焦点、错误、禁用与关键业务状态。浮层使用 dialog 或 popover，粘性表头与安全区在真实滚动中检查。',
        '布局、组件与交互一起验收',
      ],
      [
        '完成可访问与性能门禁',
        '执行键盘全流程、200% 缩放、对比度、非文本边界、减少动效和强制色彩检查。性能端记录首屏 CSS 体积、样式覆盖率、布局与绘制轨迹，并为列表与浮层设置预算。Stylelint、Token 生成一致性、视觉回归与生产构建全部进入 CI。',
        '质量要求必须变成自动门禁',
      ],
      [
        '交付迁移与故障演练',
        '运行另一位学习者按说明从空环境启动、添加一个页面并替换一个 Token。制造一次组件升级与样式回滚，确认旧页面仍可读、焦点可用且可恢复到上一版本。最终报告按验收矩阵列出证据、未解决风险和负责人，不把成功截图当作唯一证明。',
        '能维护和回滚才算交付',
      ],
    ],
  },
];

const CSS3_C0_EXAMPLES: CssStageExamples = [
  [
    cssExample(
      '对比作者普通声明与 important 的胜负',
      'CSS + JavaScript',
      `<button id="save">保存</button>
<style>
  button { color: black; }
  .app button { color: green !important; }
  #save { color: red; }
</style>
<script>
  console.log({ color: getComputedStyle(document.querySelector('#save')).color });
</script>`,
      `{ color: 'rgb(0, 128, 0)' }
important 作者声明先于普通 ID 声明；移除 important 后才轮到特异性比较。
边界：若用户样式表也用 important，来源顺序会再次反转。`,
    ),
    cssExample(
      '验证继承只在当前元素无声明时生效',
      'CSS + JavaScript',
      `<section class="parent"><p id="plain">继承父色</p><p class="override">直接覆盖</p></section>
<style>
  .parent { color: #175cd3; }
  .override { color: #b42318; }
</style>
<script>
  console.table([...document.querySelectorAll('p')].map((node) => ({
    className: node.className,
    color: getComputedStyle(node).color
  })));
</script>`,
      `className  color
plain      rgb(23, 92, 211)
override   rgb(180, 35, 24)
边界：display、margin、border 等非继承属性不会自动采用父元素值。`,
    ),
    cssExample(
      '用层序观察主题与组件的胜负',
      'CSS + JavaScript',
      `@layer reset, theme, components;
@layer theme { button { background: #175cd3; color: white; } }
@layer components { .button { background: #067647; } }
button { border: 0; }
<button class="button" id="save">保存</button>
<script>console.log(getComputedStyle(document.querySelector('#save')).backgroundColor);</script>`,
      `rgb(6, 118, 71)
components 层晚于 theme 层，同层特异性相同而上层规则胜出；未分层 border 独立生效。
边界：层序在第一次出现名称时确定，后续 import 顺序不一定还能重排。`,
    ),
    cssExample(
      '同层比较特异性再比较出现顺序',
      'CSS + JavaScript',
      `<a id="cta" class="button primary" href="/start/">开始</a>
<style>
  .button { background: #667085; }
  .button.primary { background: #175cd3; }
  #cta { background: #b42318; }
  a#cta { background: #067647; }
</style>
<script>console.log({ background: getComputedStyle(document.querySelector('#cta')).backgroundColor });</script>`,
      `{ background: 'rgb(6, 118, 71)' }
同层中 a#cta 的特异性高于 #cta 和两个类选择器，因此最终使用绿色。
边界：把文件位置前移会改变同特异性胜负，但不会让普通类越过 ID。`,
    ),
    cssExample(
      '建立五层样式基线并检查声明来源',
      'CSS',
      `@layer reset, tokens, base, components, utilities;
@layer reset { *, *::before, *::after { box-sizing: border-box; } }
@layer tokens { :root { --color-action: #175cd3; --space-3: .75rem; } }
@layer base { body { margin: 0; font-family: system-ui, sans-serif; } }
@layer components { .button { padding: var(--space-3); background: var(--color-action); } }
@layer utilities { .invisible { visibility: hidden; } }
/* 未分层业务覆盖应只出现在明确迁移清单中。 */`,
      `五层顺序固定，组件默认态只消费 Token，工具类最后但仍不与未分层规则混用。
边界：任何用途不明的 !important 都应回到层序、Token 或组件接口解决。`,
    ),
  ],
  [
    cssExample(
      '并列比较 ID、类属性和类型选择器',
      'CSS + JavaScript',
      `<article id="post" class="card featured"><h2 class="title">标题</h2></article>
<style>
  article h2 { color: #344054; }
  .card .title { color: #175cd3; }
  #post .title { color: #067647; }
</style>
<script>console.log(getComputedStyle(document.querySelector('.title')).color);</script>`,
      `rgb(6, 118, 71)
三个规则分别为 (0,0,2)、(0,2,0)、(1,0,1)，先比较 ID 位，ID 规则胜出。
边界：特异性按元组比较，不是数组合并成任意整数总分。`,
    ),
    cssExample(
      '观察 is、where 与 not 参数的计分',
      'CSS + JavaScript',
      `<button id="hero" class="card is-selected">选择</button>
<style>
  .card:is(.is-selected, #hero) { color: #067647; }
  .card:where(.is-selected, #hero) { color: #175cd3; }
  .card:not(.missing) { color: #b42318; }
</style>
<script>console.log(getComputedStyle(document.querySelector('#hero')).color);</script>`,
      `rgb(6, 118, 71)
:is() 采用 #hero 的最高参数权重，:where() 整体归零，:not() 的普通类仍参与比较。
边界：把高权重 ID 写进 :is() 参数会抬高整条组件规则，即使当前只命中类。`,
    ),
    cssExample(
      '用 where 降低 reset 权重',
      'CSS + JavaScript',
      `@layer reset, components;
@layer reset { :where(h1, h2, h3, p) { margin-block: 0; } }
@layer components { .article h2 { margin-block-start: 1.5rem; } }
<article class="article"><h1>标题</h1><h2>章节</h2><p>正文</p></article>
<script>console.log(getComputedStyle(document.querySelector('h2')).marginBlockStart);</script>`,
      `24px
reset 的 :where() 特异性为零且位于更早层，组件 h2 的上边距稳定生效。
边界：若 reset 用 .article h2 与组件抢权重，后续样式会越来越依赖 important。`,
    ),
    cssExample(
      '用 scope 把标题规则隔离在正文边界外',
      'CSS + JavaScript',
      `<article class="card"><h2>卡片标题</h2><div class="card__content"><h2>正文标题</h2></div></article>
<style>
  @scope (.card) to (.card__content) { h2 { color: #175cd3; } }
</style>
<script>
  console.table([...document.querySelectorAll('h2')].map((node) => ({
    text: node.textContent, color: getComputedStyle(node).color
  })));
</script>`,
      `卡片标题  rgb(23, 92, 211)
正文标题  rgb(0, 0, 0)
to 边界阻止规则进入 card__content 子树，作用域邻近度不能越过来源和重要性。
边界：边界选择器写错会让正文重新命中，必须用嵌套卡片回归。`,
    ),
    cssExample(
      '用 supports 检测选择器能力并提供回退',
      'CSS + JavaScript',
      `<div class="card"><h2 class="title">兼容性</h2></div>
<style>
  .card .title { color: #175cd3; }
  @supports selector(:is(.a)) { .card:is(.card) .title { color: #067647; } }
</style>
<script>console.log({ supportsIs: CSS.supports('selector(:is(.a))'), color: getComputedStyle(document.querySelector('.title')).color });</script>`,
      `{ supportsIs: true, color: 'rgb(6, 118, 71)' }
不支持作用域或高级选择器的浏览器仍会使用普通类规则，增强失败不会丢失基础可读性。
边界：CSS.supports 检查语法能力，不证明布局、焦点或旧浏览器行为符合预期。`,
    ),
  ],
  [
    cssExample(
      '比较 content-box 与 border-box 的边框盒宽度',
      'CSS + JavaScript',
      `<div class="content">A</div><div class="border">B</div>
<style>
  div { width:200px; padding:24px; border:2px solid; }
  .content { box-sizing: content-box; }
  .border { box-sizing: border-box; }
</style>
<script>console.table([...document.querySelectorAll('div')].map((node) => ({ className:node.className, borderBox:node.getBoundingClientRect().width })));</script>`,
      `className  borderBox
content    252
border     200
content-box 的 width 只约束内容区，border-box 的 200px 已包含 padding 与 border。
边界：padding 总和超过声明宽度时，内容区不会变成负值。`,
    ),
    cssExample(
      '检查全局 border-box 之后的实际按钮尺寸',
      'CSS + JavaScript',
      `<button class="button">确认订单</button>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  .button { width:160px; height:40px; padding:0 16px; font:600 16px/1.5 system-ui; }
</style>
<script>
  const node=document.querySelector('.button');
  console.log({ css:getComputedStyle(node).boxSizing, width:node.offsetWidth, height:node.offsetHeight });
</script>`,
      `{ css: 'border-box', width: 160, height: 40 }
声明宽高包含 padding 与 border，但字体行高、min-height 和浏览器控件仍可能改变最终尺寸。
边界：只读 CSS 文件中的 160×40 不代表所有平台渲染一致。`,
    ),
    cssExample(
      '用逻辑属性在 RTL 中保持起始边正确',
      'CSS + JavaScript',
      `<div class="notice" id="notice">付款已确认</div>
<style>
  .notice { padding-inline:16px; padding-block:12px; border-inline-start:4px solid #067647; }
  body { direction: rtl; }
</style>
<script>
  const s=getComputedStyle(document.querySelector('#notice'));
  console.log({ direction:s.direction, start:s.borderInlineStart, left:s.borderLeftWidth, right:s.borderRightWidth });
</script>`,
      `direction=rtl，border-inline-start 映射到视觉右侧，left=0px，right=4px。
边界：逻辑属性与物理属性混用时，后出现且胜出的普通声明决定最终映射。`,
    ),
    cssExample(
      '发现 later 物理属性覆盖逻辑起始边',
      'CSS + JavaScript',
      `<div id="row">库存</div>
<style>
  #row { border-inline-start:4px solid #175cd3; border-left:1px solid #98a2b3; }
</style>
<script>
  const s=getComputedStyle(document.querySelector('#row'));
  console.log({ inlineStart:s.borderInlineStartWidth, physicalLeft:s.borderLeftWidth, physicalRight:s.borderRightWidth });
</script>`,
      `inlineStart=1px，physicalLeft=1px，physicalRight=0px。
同一逻辑边被后面的物理 border-left 覆盖，RTL 下会失去正确的起始边映射。
边界：修复时应统一为一套逻辑属性，而不是继续增加 !important。`,
    ),
    cssExample(
      '用测量表比较声明尺寸与真实边框盒',
      'CSS + JavaScript',
      `<article class="card"><h2>方案</h2><p>内容</p></article>
<style>
  .card { box-sizing:border-box; width:min(100%,320px); padding:24px; border:1px solid; }
</style>
<script>
  const node=document.querySelector('.card'); const s=getComputedStyle(node);
  console.table({ boxSizing:s.boxSizing, width:s.width, padding:s.padding, border:s.borderWidth, offsetWidth:node.offsetWidth });
</script>`,
      `boxSizing border-box, width 320px, padding 24px, border 1px, offsetWidth 320。
边界：窄容器中 width 的计算值可能小于 320px，必须同时记录包含块宽度。`,
    ),
  ],
  [
    cssExample(
      '比较 px、rem、em 与 cqw 的参照物',
      'CSS + JavaScript',
      `<div class="card"><p class="label">延迟</p></div>
<style>
  .card { container-type:inline-size; font-size:20px; }
  .label { padding:1rem; border-width:1px; font-size:.8em; max-inline-size:50cqw; }
</style>
<script>
  const node=document.querySelector('.label'); const s=getComputedStyle(node);
  console.log({ fontSize:s.fontSize, padding:s.padding, border:s.borderTopWidth, maxWidth:s.maxWidth });
</script>`,
      `fontSize=16px、padding=16px、border=1px；maxWidth 随卡片 inline-size 的 50% 计算。
边界：em 随当前字体变化，rem 跟根字号，cqw 只在有容器查询上下文时有效。`,
    ),
    cssExample(
      '验证百分比宽度依赖包含块',
      'CSS + JavaScript',
      `<div class="parent"><div class="child">50%</div></div>
<style>
  .parent { inline-size:400px; padding:20px; }
  .child { inline-size:50%; }
</style>
<script>
  const parent=document.querySelector('.parent'); const child=document.querySelector('.child');
  console.log({ parentContent:parent.clientWidth-40, child:child.getBoundingClientRect().width, parentBox:parent.getBoundingClientRect().width });
</script>`,
      `parentContent=400、child=200、parentBox=440
百分比子宽按包含块内容区 400px 计算，而不是父元素外框 440px。
边界：绝对定位、Grid 与替换元素的百分比可能参照不同包含块。`,
    ),
    cssExample(
      '观察 fr 在内容最小尺寸下的剩余空间分配',
      'CSS + JavaScript',
      `<div class="grid"><div>short</div><div class="long">very-long-unbreakable-token-123456789</div></div>
<style>
  .grid { display:grid; grid-template-columns:1fr 1fr; inline-size:360px; gap:16px; }
  .grid > * { border:1px solid; }
</style>
<script>console.table([...document.querySelectorAll('.grid > *')].map(n=>({width:n.getBoundingClientRect().width, scroll:n.scrollWidth})));</script>`,
      `第一列宽度可能小于第二列，第二列因自动最小内容宽度无法继续收缩并产生溢出。
fr 分配剩余空间，但轨道的 auto 最小值默认不忽略长内容。
边界：需要允许压缩时使用 minmax(0,1fr) 并在内容层处理断行。`,
    ),
    cssExample(
      '用 minmax 与 clamp 保住下限和字号上限',
      'CSS + JavaScript',
      `<div class="grid"><article>一</article><article>二</article></div>
<style>
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr)); gap:1rem; }
  article { font-size:clamp(1rem,2vw + .5rem,1.5rem); padding:clamp(.75rem,2vw,1.25rem); }
</style>
<script>console.log({ columns:new Set([...document.querySelectorAll('article')].map(n=>Math.round(n.getBoundingClientRect().left))).size, fontSize:getComputedStyle(document.querySelector('article')).fontSize });</script>`,
      `390px 宽度下两列变为一列，字号保持在 16px 至 24px 之间，卡片无横向溢出。
边界：minmax 的最小值本身大于容器可用宽度时，Grid 仍会溢出。`,
    ),
    cssExample(
      '先写尺寸约束再选择单位',
      'CSS',
      `.shell {
  --content-max: 72rem;
  --gutter: clamp(1rem, 4vw, 2rem);
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(12rem, 18rem);
  gap: var(--gutter);
  max-inline-size: var(--content-max);
  margin-inline: auto;
}
@media (max-width: 52rem) {
  .shell { grid-template-columns: minmax(0, 1fr); }
}`,
      `桌面内容区上限 72rem，侧栏 12–18rem 且可收缩；窄屏切为单列并保留可读 gutter。
边界：魔法数值若没有表达最小、最大和切换条件，换语言或缩放下就会反复溢出。`,
    ),
  ],
  [
    cssExample(
      '区分 overflow hidden、clip 与 auto 的行为',
      'CSS + JavaScript',
      `<div class="box" id="box">可滚动内容可滚动内容可滚动内容可滚动内容</div>
<style>
  .box { inline-size:180px; block-size:70px; overflow:auto; border:1px solid; }
</style>
<script>const b=document.querySelector('#box'); console.log({ clientHeight:b.clientHeight, scrollHeight:b.scrollHeight, overflow:getComputedStyle(b).overflowY });</script>`,
      `clientHeight 小于 scrollHeight，overflowY=auto，内容超出后可局部滚动而不是撑开整页。
边界：hidden 仍可能被程序滚动，clip 不创建滚动容器，两者都不是简单的“看不见”。`,
    ),
    cssExample(
      '按语言选择 normal、break-word 与 nowrap',
      'CSS + JavaScript',
      `<p class="zh">这是一个需要自然换行的中文说明。</p>
<p class="url">https://example.com/reports/2026/q4/summary?region=all</p>
<style>
  .zh { overflow-wrap:anywhere; }
  .url { overflow-wrap:anywhere; word-break:break-word; }
  p { max-inline-size:28ch; }
</style>
<script>console.table([...document.querySelectorAll('p')].map(n=>({className:n.className,height:n.getBoundingClientRect().height})));</script>`,
      `中文按正常断行规则换行，长 URL 在必要位置断开，两段都保持在 28ch 容器内。
边界：word-break:break-all 会破坏英文单词语义，应只在确实需要的标识符上使用。`,
    ),
    cssExample(
      '完成单行省略号所需的四个条件',
      'CSS + JavaScript',
      `<div class="title" id="title">这是一段很长很长需要显示省略号的页面标题文本</div>
<style>
  .title { max-inline-size:18rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
</style>
<script>const t=document.querySelector('#title'); console.log({ clientWidth:t.clientWidth, scrollWidth:t.scrollWidth, whiteSpace:getComputedStyle(t).whiteSpace });</script>`,
      `clientWidth 小于 scrollWidth，whiteSpace=nowrap，行尾出现省略号。
边界：漏掉 overflow、受限宽度或 nowrap 任一条件，text-overflow 都不会产生预期省略。`,
    ),
    cssExample(
      '多行截断同时保留完整内容出口',
      'CSS + JavaScript',
      `<article><p class="summary">第一行说明。第二行继续说明。第三行包含会被折叠的细节。第四行保留完整内容。</p><a href="/report/">阅读全文</a></article>
<style>
  .summary { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
</style>
<script>console.log({ text:document.querySelector('.summary').textContent.length, link:document.querySelector('a').getAttribute('href') });</script>`,
      `摘要最多显示两行，DOM 中仍保留完整文本长度，页面同时提供 /report/ 阅读全文入口。
边界：只截断而没有全文入口会让内容不可访问，隐藏文本也可能无法被搜索到。`,
    ),
    cssExample(
      '让局部滚动区可键盘到达并有可见边界',
      'CSS',
      `<div class="log" tabindex="0" role="region" aria-label="构建日志">
  <pre>build line 1\nbuild line 2\nbuild line 3\nbuild line 4</pre>
</div>
<style>
  .log { max-block-size:12rem; overflow:auto; border:1px solid #98a2b3; padding:1rem; }
  .log:focus-visible { outline:3px solid #175cd3; outline-offset:3px; }
</style>`,
      `构建日志限制高度并可滚动，region 有名称，Tab 进入时显示焦点轮廓，键盘可滚动。
边界：只有 overflow:auto 而没有可聚焦容器，键盘用户可能无法滚动日志。`,
    ),
  ],
  [
    cssExample(
      '用五层顺序固定团队覆盖规则',
      'CSS',
      `@layer reset, tokens, base, components, utilities;
@layer reset { :where(button) { border:0; font:inherit; } }
@layer tokens { :root { --action-bg:#175cd3; } }
@layer base { button { cursor:pointer; } }
@layer components { .button { background:var(--action-bg); } }
@layer utilities { .button--quiet { background:transparent; } }`,
      `reset 不抢权重，tokens 只提供值，组件使用语义变量，utilities 是明确的高层覆盖。
边界：层序若在多个入口文件中重复且名称首次出现顺序不同，会导致合并后顺序漂移。`,
    ),
    cssExample(
      '让 reset 只处理共同起点',
      'CSS + JavaScript',
      `<h1>标题</h1><p>正文</p><ul><li>项目</li></ul>
<style>
  :where(h1,p,ul) { margin-block:0; }
  ul { padding-inline-start:1.25rem; }
</style>
<script>console.log({ h1Margin:getComputedStyle(document.querySelector('h1')).marginBlockStart, ulPadding:getComputedStyle(document.querySelector('ul')).paddingInlineStart });</script>`,
      `h1Margin=0px，ulPadding=20px；reset 清掉默认外边距，列表仍保留可读缩进。
边界：把所有交互态、阴影和布局值塞进 reset，会让组件无法按语义覆盖。`,
    ),
    cssExample(
      '把组件扩展点写成语义变量',
      'CSS',
      `<button class="button">保存</button>
<style>
  .button {
    --button-bg: var(--action-bg, #175cd3);
    --button-fg: var(--action-fg, #fff);
    background: var(--button-bg);
    color: var(--button-fg);
  }
  [data-theme="dark"] .button { --button-bg: #84adff; --button-fg:#001633; }
</style>`,
      `组件只暴露 --button-bg 与 --button-fg，亮暗主题覆盖语义值而无需提高选择器权重。
边界：直接覆盖 .button 内部 div 的背景会把样式绑死在 DOM 结构上。`,
    ),
    cssExample(
      '同时读取规则命中与计算样式',
      'CSS + JavaScript',
      `<button class="button" data-variant="danger">删除</button>
<style>
  .button { background:#175cd3; }
  .button[data-variant="danger"] { background:#b42318; }
</style>
<script>
  const node=document.querySelector('.button'); const s=getComputedStyle(node);
  console.log({ matched:node.matches('.button[data-variant="danger"]'), background:s.backgroundColor });
</script>`,
      `{ matched: true, background: 'rgb(180, 35, 24)' }
matches 证明规则选择器命中，getComputedStyle 证明最终声明胜出，两者共同构成覆盖证据。
边界：只看 Styles 面板中被划掉的声明，不能证明伪元素或继承链最终结果。`,
    ),
    cssExample(
      '把组件冲突写成可自动回归的用例',
      'CSS + JavaScript',
      `<button class="button button--quiet" id="quiet">取消</button>
<style>
  @layer components, utilities;
  @layer components { .button { background:#175cd3; color:#fff; } }
  @layer utilities { .button--quiet { background:transparent; color:#344054; } }
</style>
<script>const s=getComputedStyle(document.querySelector('#quiet')); console.log({ background:s.backgroundColor, color:s.color });</script>`,
      `{ background: 'rgba(0, 0, 0, 0)', color: 'rgb(52, 64, 84)' }
quiet 变体在 utilities 层覆盖组件默认色，用例同时断言背景和文字。
边界：新增组合变体时只补一条 CSS 而不补冲突用例，层序变化很容易悄悄回归。`,
    ),
  ],
];

const CSS3_C1_EXAMPLES: CssStageExamples = [
  [
    cssExample(
      '先判断 row 与 column 的主轴和交叉轴',
      'CSS + JavaScript',
      `<div class="row"><span>A</span><span>B</span></div>
<div class="column"><span>C</span><span>D</span></div>
<style>
  .row,.column{display:flex;gap:8px;block-size:80px}
  .row{flex-direction:row;justify-content:space-between;align-items:flex-end}
  .column{flex-direction:column;justify-content:center;align-items:flex-start}
</style>
<script>console.table([...document.querySelectorAll('.row,.column')].map(n=>({className:n.className,display:getComputedStyle(n).display,direction:getComputedStyle(n).flexDirection})));</script>`,
      `row 的 justify-content 控制水平主轴，align-items 控制垂直交叉轴；column 正好相反。
边界：只记属性名不判断 flex-direction，会把主轴和交叉轴对齐写反。`,
    ),
    cssExample(
      '分别观察 basis、grow 与 shrink 的结果',
      'CSS + JavaScript',
      `<div class="flex"><div class="a">A</div><div class="b">B</div><div class="c">C</div></div>
<style>
  .flex{display:flex;inline-size:500px}
  .a{flex:1 0 120px}.b{flex:2 0 120px}.c{flex:0 0 120px}
</style>
<script>console.table([...document.querySelectorAll('.flex>div')].map(n=>({name:n.textContent,width:n.getBoundingClientRect().width})));</script>`,
      `A 与 B 在 120px 基准上分配剩余空间，比例为 1:2；C 固定 120px 不增长。
边界：flex:1 展开为 1 1 0%，与 flex:1 0 120px 的基准和收缩行为不同。`,
    ),
    cssExample(
      '观察换行后 align-content 才生效',
      'CSS + JavaScript',
      `<div class="tags"><span>支付</span><span>库存</span><span>订单</span><span>会员</span><span>报表</span></div>
<style>
  .tags{display:flex;flex-wrap:wrap;align-content:flex-start;gap:8px;inline-size:180px;block-size:120px}
  span{flex:0 0 72px;border:1px solid}
</style>
<script>console.log({height:document.querySelector('.tags').getBoundingClientRect().height, rows:new Set([...document.querySelectorAll('.tags span')].map(n=>Math.round(n.offsetTop))).size});</script>`,
      `容器高度 120px，标签形成 3 行，align-content:flex-start 把多行从顶部排列。
边界：nowrap 单行没有多行内容，align-content 不会产生可见效果。`,
    ),
    cssExample(
      '用 margin-inline-start auto 把单个项目推到末端',
      'CSS + JavaScript',
      `<div class="bar"><button>返回</button><span>标题</span><button class="right">保存</button></div>
<style>
  .bar{display:flex;align-items:center;gap:12px;inline-size:420px}
  .right{margin-inline-start:auto}
</style>
<script>const right=document.querySelector('.right'); console.log({marginStart:getComputedStyle(right).marginInlineStart,right:right.getBoundingClientRect().right,barRight:document.querySelector('.bar').getBoundingClientRect().right});</script>`,
      `保存按钮使用自动起始边距吸收剩余空间，靠到工具栏右端，其他项目保持自然间距。
边界：给所有项目都加 margin:auto 会分散自由空间，不再是单项目定位。`,
    ),
    cssExample(
      '从 min-width auto 修复长内容无法收缩',
      'CSS + JavaScript',
      `<div class="row"><div class="label">状态</div><div class="value">very-long-account-identifier-123456789</div></div>
<style>
  .row{display:flex;inline-size:320px;gap:8px}
  .label{flex:0 0 64px}.value{flex:1;min-inline-size:0;overflow-wrap:anywhere}
</style>
<script>console.table([...document.querySelectorAll('.row>div')].map(n=>({className:n.className,width:n.getBoundingClientRect().width,scroll:n.scrollWidth})));</script>`,
      `value 的 min-inline-size:0 允许收缩，长标识符在 320px 容器内断行，row 不再横向溢出。
边界：只设置 flex-shrink:1 不清除自动最小尺寸，长内容仍会撑开容器。`,
    ),
  ],
  [
    cssExample(
      '观察隐式轨道如何被自动放置创建',
      'CSS + JavaScript',
      `<div class="grid"><div>1</div><div>2</div><div>3</div><div>4</div><div>5</div></div>
<style>
  .grid{display:grid;grid-template-columns:repeat(2,1fr);grid-auto-rows:64px;gap:8px}
  .grid>div{border:1px solid}
</style>
<script>console.log({columns:getComputedStyle(document.querySelector('.grid')).gridTemplateColumns,rows:document.querySelectorAll('.grid>div')[4].offsetTop});</script>`,
      `显式两列排完四个项目后，第五个项目自动进入第三行，由 grid-auto-rows 提供 64px 高度。
边界：没有 grid-auto-rows 时隐式行会按内容自动增长，列表高度可能跳动。`,
    ),
    cssExample(
      '用 minmax 限制自动列的数量与最小宽度',
      'CSS + JavaScript',
      `<div class="cards"><article>一</article><article>二</article><article>三</article></div>
<style>
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:16px}
  article{min-block-size:100px;border:1px solid}
</style>
<script>console.log({columns:getComputedStyle(document.querySelector('.cards')).gridTemplateColumns.split(' ').length,width:document.querySelector('article').getBoundingClientRect().width});</script>`,
      `900px 容器可形成三列，390px 容器形成单列；每列不小于 220px 且剩余空间平均分配。
边界：minmax 第一个值大于容器宽时仍可能溢出，需用 min(100%, value) 或断点回退。`,
    ),
    cssExample(
      '比较 row 与 dense 自动放置的阅读顺序',
      'CSS + JavaScript',
      `<div class="grid"><article class="wide">A</article><article>B</article><article>C</article><article>D</article></div>
<style>
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .wide{grid-column:span 2}
</style>
<script>console.table([...document.querySelectorAll('article')].map(n=>({text:n.textContent,row:n.offsetTop,left:n.offsetLeft})));</script>`,
      `A 跨两列，B 进入剩余列，C/D 顺序后续放置；视觉位置与 DOM 顺序保持一致。
边界：grid-auto-flow:dense 可能把后面的空格项目提前填充，破坏阅读和键盘顺序。`,
    ),
    cssExample(
      '用命名区域表达后台页面结构',
      'CSS + JavaScript',
      `<div class="shell"><header>头</header><aside>侧栏</aside><main>内容</main><footer>脚</footer></div>
<style>
  .shell{display:grid;grid-template-columns:220px 1fr;grid-template-rows:64px 1fr 40px;grid-template-areas:"head head" "side main" "foot foot";min-block-size:100vh}
  header{grid-area:head}aside{grid-area:side}main{grid-area:main}footer{grid-area:foot}
</style>
<script>console.table(['header','aside','main','footer'].map(tag=>{const n=document.querySelector(tag);return{tag,left:n.offsetLeft,top:n.offsetTop}}));</script>`,
      `header 跨两列置顶，aside/main 位于第二行，footer 跨两列置底，区域名表达稳定页面关系。
边界：grid-area 只改变布局，HTML 仍要使用 header/aside/main/footer 语义元素。`,
    ),
    cssExample(
      '用长内容压力测试二维轨道承诺',
      'CSS + JavaScript',
      `<div class="layout"><aside>导航</aside><main><h1>标题</h1><p>verylongword...</p></main></div>
<style>
  .layout{display:grid;grid-template-columns:minmax(180px,240px) minmax(0,1fr);gap:16px;max-inline-size:900px}
  main{min-inline-size:0} main p{overflow-wrap:anywhere}
</style>
<script>const layout=document.querySelector('.layout');const main=document.querySelector('main');console.log({layoutScroll:layout.scrollWidth,mainWidth:main.clientWidth,viewport:innerWidth});</script>`,
      `窄内容时侧栏保持 180–240px，主列获得剩余空间；长词在主列断行，layout.scrollWidth 不超过容器。
边界：没有 minmax(0,1fr) 或 min-inline-size:0，主列会被长内容强制推到视口外。`,
    ),
  ],
  [
    cssExample(
      '比较 relative 与 absolute 的包含块',
      'CSS + JavaScript',
      `<div class="parent"><div class="absolute">绝对</div><div class="relative">相对</div></div>
<style>
  .parent{position:relative;inline-size:320px;block-size:160px;padding:16px;border:1px solid}
  .absolute{position:absolute;inset-block-start:8px;inset-inline-end:8px}
  .relative{position:relative;inset-block-start:20px;inset-inline-start:12px}
</style>
<script>console.table([...document.querySelectorAll('.parent>div')].map(n=>({name:n.textContent,left:n.offsetLeft,top:n.offsetTop})));</script>`,
      `absolute 以最近的 position:relative 父元素定位，relative 元素保留自动放置位置后再偏移。
边界：absolute 的 inset 是相对包含块而不是视口，祖先定位链决定最终坐标。`,
    ),
    cssExample(
      '观察 sticky 受滚动容器和高度共同约束',
      'CSS + JavaScript',
      `<div class="scroller"><h2 class="sticky">筛选</h2><p>内容</p><p>内容</p><p>内容</p><p>内容</p></div>
<style>
  .scroller{block-size:220px;overflow:auto;border:1px solid}
  .sticky{position:sticky;inset-block-start:0;background:white;margin:0;padding:12px}
</style>
<script>const s=document.querySelector('.scroller');s.scrollTop=80;console.log({stickyTop:document.querySelector('.sticky').getBoundingClientRect().top,scrollerTop:s.getBoundingClientRect().top});</script>`,
      `滚动 80px 后 sticky 标题仍贴近 scroller 顶部，直到父容器结束才随之离开。
边界：sticky 不会逃离 overflow:hidden/auto 的祖先，也不会在父元素高度之外继续粘住。`,
    ),
    cssExample(
      '找到层叠上下文后再比较 z-index',
      'CSS + JavaScript',
      `<div class="stack-a"><div class="a">A</div></div><div class="stack-b"><div class="b">B</div></div>
<style>
  .stack-a{position:relative;z-index:1}.stack-b{position:relative;z-index:2}
  .a{position:absolute;z-index:999;inline-size:100px;background:#175cd3}
  .b{position:absolute;z-index:0;inline-size:100px;background:#b42318}
</style>
<script>console.log({aContext:getComputedStyle(document.querySelector('.stack-a')).zIndex,bContext:getComputedStyle(document.querySelector('.stack-b')).zIndex});</script>`,
      `B 的父层 z-index:2 高于 A 的父层 1，所以 A 内部 z-index:999 仍不能越过 B。
边界：z-index 只在同一层叠上下文内比较，先找父级 transform、opacity 或 position 上下文。`,
    ),
    cssExample(
      '用 dialog 顶层机制处理模态浮层',
      'HTML + CSS + JavaScript',
      `<button id="open">打开设置</button><dialog id="settings"><h2>设置</h2><button id="close">关闭</button></dialog>
<style>
  dialog{border:0;border-radius:6px;padding:1.5rem;box-shadow:0 12px 32px #0003}
  dialog::backdrop{background:#10182880}
</style>
<script>const d=document.querySelector('#settings');open.onclick=()=>d.showModal();close.onclick=()=>d.close();</script>`,
      `dialog.showModal() 将浮层放入顶层并显示 backdrop，焦点与 Escape 由浏览器管理。
边界：用高 z-index 的普通 div 模拟模态，仍需自己处理背景 inert、焦点陷阱和顶层裁切。`,
    ),
    cssExample(
      '滚动前后检查 sticky、浮层和视口边界',
      'CSS + JavaScript',
      `<header class="toolbar">工具栏</header><main><p>内容</p><p>内容</p><p>内容</p><button class="fab">新增</button></main>
<style>
  .toolbar{position:sticky;inset-block-start:0;background:#fff;padding:12px;border-bottom:1px solid}
  .fab{position:fixed;inset-block-end:24px;inset-inline-end:24px}
  main{min-block-size:160vh}
</style>
<script>scrollTo(0,200);console.log({toolbarTop:document.querySelector('.toolbar').getBoundingClientRect().top,fabBottom:innerHeight-document.querySelector('.fab').getBoundingClientRect().bottom});</script>`,
      `toolbarTop=0 保持吸顶，fabBottom≈24px 保持固定；两者都没有覆盖首个标题或底部安全区。
边界：只测初始滚动位置无法发现粘性失效、浮层遮挡和移动端安全区冲突。`,
    ),
  ],
  [
    cssExample(
      '用 Grid 固定后台壳层的列和行',
      'CSS + JavaScript',
      `<div class="shell"><aside>侧栏</aside><main>内容区</main></div>
<style>
  .shell{display:grid;grid-template-columns:240px minmax(0,1fr);min-block-size:100vh}
  aside{border-inline-end:1px solid;padding:16px} main{min-inline-size:0;padding:24px}
</style>
<script>const shell=document.querySelector('.shell');console.log({columns:getComputedStyle(shell).gridTemplateColumns,scroll:shell.scrollWidth,viewport:innerWidth});</script>`,
      `侧栏保持 240px，主内容获得剩余宽度；minmax(0,1fr) 防止长内容把壳层推宽。
边界：用 absolute 固定侧栏会让主内容需要手工递增 margin，新增布局很快失去同步。`,
    ),
    cssExample(
      '用 Flex 排列工具栏的一维工具组',
      'CSS + JavaScript',
      `<div class="toolbar"><button>撤销</button><button>重做</button><span class="spacer"></span><button>保存</button></div>
<style>
  .toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .spacer{flex:1 1 auto}
  button{min-block-size:40px}
</style>
<script>console.log({display:getComputedStyle(document.querySelector('.toolbar')).display,children:document.querySelector('.toolbar').children.length});</script>`,
      `撤销/重做保持一组，spacer 吸收剩余空间，保存位于末端；窄屏工具可换行。
边界：工具栏是一维排列，不需要为了两个按钮提前引入 Grid 区域。`,
    ),
    cssExample(
      '让卡片尺寸由内容压力与最小宽度决定',
      'CSS + JavaScript',
      `<div class="cards"><article><h2>短标题</h2></article><article><h2>很长很长的标题需要换行</h2><p>说明</p></article></div>
<style>
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}
  article{min-block-size:160px;padding:16px;border:1px solid;overflow-wrap:anywhere}
</style>
<script>console.table([...document.querySelectorAll('article')].map(n=>({height:n.offsetHeight,width:n.offsetWidth})));</script>`,
      `两张卡片在可用宽度下并排，各自至少 180px、最小高度 160px，长标题换行而不撑破列。
边界：固定 height 会让较长内容溢出；min-height 允许卡片随内容增长但保住下限。`,
    ),
    cssExample(
      '让表格在自身容器滚动并保留表头关系',
      'CSS + JavaScript',
      `<div class="table-wrap" tabindex="0" role="region" aria-label="订单表格"><table><thead><tr><th>订单</th><th>客户</th><th>金额</th></tr></thead><tbody><tr><td>#001</td><td>星河</td><td>¥299</td></tr></tbody></table></div>
<style>
  .table-wrap{max-inline-size:100%;overflow:auto}.table-wrap:focus-visible{outline:3px solid #175cd3}
  table{border-collapse:collapse;min-inline-size:520px}th,td{padding:8px 12px;border:1px solid}
</style>
<script>console.log({scroll:document.querySelector('.table-wrap').scrollWidth,page:document.documentElement.scrollWidth});</script>`,
      `390px 页面中表格容器可横向滚动，页面本身 scrollWidth 仍等于视口宽度。
边界：表格使用 position:absolute 或 display:block 替代 table，会破坏表头和单元格关系。`,
    ),
    cssExample(
      '逐层定位壳层、工具栏和卡片的溢出',
      'CSS + JavaScript',
      `<div class="shell"><aside>侧栏</aside><main><div class="toolbar"><button>筛选</button></div><div class="cards"><article>内容</article></div></main></div>
<style>
  .shell{display:grid;grid-template-columns:200px minmax(0,1fr)}
  main{min-inline-size:0}.toolbar{display:flex;overflow:auto}.cards{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
</style>
<script>console.table([...document.querySelectorAll('.shell,main,.toolbar,.cards')].map(n=>({className:n.className,client:n.clientWidth,scroll:n.scrollWidth})));</script>`,
      `shell、main、toolbar 与 cards 的 clientWidth 和 scrollWidth 分别可解释，只有需要横向滚动的 toolbar 允许 overflow。
边界：整页横向滚动时不能只修外层，要找到最小子元素的 scrollWidth 超过 clientWidth 的节点。`,
    ),
  ],
  [
    cssExample(
      '找出长 token 的自动最小内容宽度',
      'CSS + JavaScript',
      `<div class="row"><p>状态</p><p class="token">account_very_long_identifier_without_spaces_123456</p></div>
<style>
  .row{display:flex;inline-size:280px;gap:8px;border:1px solid}
  .token{min-inline-size:0;overflow-wrap:anywhere}
</style>
<script>console.log({row:document.querySelector('.row').scrollWidth,token:document.querySelector('.token').scrollWidth});</script>`,
      `token 在 280px 内断行，row.scrollWidth 不超过 clientWidth；问题源头是长单词的 min-content。
边界：如果只把父容器 overflow:hidden，内容仍被裁切而不能通过换行恢复可读性。`,
    ),
    cssExample(
      '逐层设置 min-width 0 解除压缩限制',
      'CSS + JavaScript',
      `<div class="grid"><div class="cell"><span>very-long-label-without-breaks-000000</span></div></div>
<style>
  .grid{display:grid;grid-template-columns:minmax(0,1fr);max-inline-size:240px}
  .cell{min-inline-size:0}.cell span{display:block;overflow-wrap:anywhere}
</style>
<script>console.table([...document.querySelectorAll('.grid,.cell,.cell span')].map(n=>({tag:n.tagName,client:n.clientWidth,scroll:n.scrollWidth})));</script>`,
      `grid 和 cell 的 clientWidth 约为 240px，span 通过 overflow-wrap 断行，任一层的 scrollWidth 都不超出。
边界：只给最外层 min-width:0 而中间 Flex/Grid 子项仍自动最小，溢出链不会解除。`,
    ),
    cssExample(
      '在断行与局部滚动之间选择策略',
      'CSS + JavaScript',
      `<div class="code"><code>POST /api/v1/very/long/path?include=details&amp;format=json</code></div>
<style>
  .code{max-inline-size:280px;overflow-x:auto;white-space:pre}
  .code:focus-visible{outline:3px solid #175cd3}
</style>
<script>const c=document.querySelector('.code');console.log({client:c.clientWidth,scroll:c.scrollWidth,whiteSpace:getComputedStyle(c).whiteSpace});</script>`,
      `代码行保留原始空白并允许局部横向滚动，focus-visible 提供键盘焦点入口。
边界：自然语言长段不适合强制 nowrap，而代码也不应为了省事任意 break-all。`,
    ),
    cssExample(
      '把视口单位改成容器可用宽度',
      'CSS + JavaScript',
      `<aside class="side"><div class="panel">面板内容</div></aside><main class="main">主内容</main>
<style>
  body{display:grid;grid-template-columns:240px 1fr;margin:0}
  .panel{inline-size:min(100%,320px)}
  .main{min-inline-size:0}
</style>
<script>const panel=document.querySelector('.panel'),side=document.querySelector('.side');console.log({panel:panel.offsetWidth,side:side.clientWidth,viewport:innerWidth});</script>`,
      `在 240px 侧栏内 panel 宽度不超过 100%，不会因 100vw 把主区域或整页推到横向滚动。
边界：100vw 包含滚动条与侧栏等全局宽度，不能代表当前容器可用内容宽。`,
    ),
    cssExample(
      '让局部横向滚动可聚焦并可到达末端',
      'CSS + JavaScript',
      `<div class="filters" tabindex="0" role="region" aria-label="筛选条件"><button>状态</button><button>区域</button><button>负责人</button><button>日期</button><button>来源</button></div>
<style>
  .filters{display:flex;gap:8px;overflow:auto;max-inline-size:240px;padding:4px}
  .filters:focus-visible{outline:3px solid #175cd3;outline-offset:3px}
</style>
<script>const f=document.querySelector('.filters');f.scrollLeft=f.scrollWidth;console.log({client:f.clientWidth,scroll:f.scrollWidth,left:f.scrollLeft});</script>`,
      `240px 容器中筛选按钮横向滚动，聚焦后焦点环可见，scrollLeft 可到达末端查看全部按钮。
边界：触摸可滑动不代表键盘可达，必须有 tabindex 和名称帮助用户发现滚动区域。`,
    ),
  ],
  [
    cssExample(
      '先按二维壳层和一维工具组选择布局工具',
      'CSS + JavaScript',
      `<div class="admin"><aside>侧栏</aside><main><header class="bar"><h1>订单</h1><button>筛选</button></header><section>内容</section></main></div>
<style>
  .admin{display:grid;grid-template-columns:220px minmax(0,1fr)}
  .bar{display:flex;justify-content:space-between;align-items:center}
</style>
<script>console.table([...document.querySelectorAll('.admin,.bar')].map(n=>({className:n.className,display:getComputedStyle(n).display})));</script>`,
      `admin 用 Grid 建立二维侧栏列关系，bar 用 Flex 处理标题与按钮的一维排列。
边界：把整个后台都用 Grid 行列表述会让简单工具组承担无必要的二维约束。`,
    ),
    cssExample(
      '让断点由内容压力和真实布局触发',
      'CSS + JavaScript',
      `<div class="layout"><aside>筛选</aside><main>订单列表与统计卡片</main></div>
<style>
  .layout{display:grid;grid-template-columns:240px minmax(0,1fr)}
  @media (max-width: 60rem){.layout{grid-template-columns:1fr}aside{order:2}}
</style>
<script>console.log({width:innerWidth,columns:getComputedStyle(document.querySelector('.layout')).gridTemplateColumns});</script>`,
      `宽屏两列，内容宽度低于 60rem 时侧栏移到下游；真实 390px 与 1440px 截图都无溢出。
边界：按设备型号命名断点会很快失效，切点应来自主内容无法保持可读时的实际宽度。`,
    ),
    cssExample(
      '用长标题、大数字和长表格压出边界',
      'CSS + JavaScript',
      `<div class="sample"><h1>华东区域订单履约与退款异常处理中心</h1><p class="metric">¥12,345,678.90</p><div class="table">订单号: ORDER-2026-11-24-VERY-LONG</div></div>
<style>
  .sample{max-inline-size:320px;overflow-wrap:anywhere}.metric{font-variant-numeric:tabular-nums}.table{overflow:auto;min-inline-size:0}
</style>
<script>console.log({sample:document.querySelector('.sample').scrollWidth,viewport:innerWidth});</script>`,
      `长标题与金额在 320px 容器内换行，表格局部滚动，页面没有横向溢出。
边界：只用短英文样例无法发现中文长标题、金额和大表格对列宽的压力。`,
    ),
    cssExample(
      '让视觉重排后的键盘顺序仍可解释',
      'CSS + JavaScript',
      `<main class="page"><section class="main">主要任务<button>保存</button></section><aside class="side">帮助<button>联系支持</button></aside></main>
<style>
  .page{display:grid;grid-template-columns:minmax(0,1fr) 280px}
  @media (max-width: 52rem){.page{grid-template-columns:1fr}.main{order:2}}
</style>
<script>console.log([...document.querySelectorAll('button')].map(b=>b.textContent));</script>`,
      `窄屏视觉上帮助区先出现时，DOM 仍可按“保存 → 联系支持”或相反顺序稳定解释，不能依赖 CSS order 偷换语义。
边界：如果视觉顺序与 DOM 顺序长期相反，键盘和读屏会得到与鼠标完全不同的路径。`,
    ),
    cssExample(
      '生成可复跑的布局比较结论',
      'PowerShell',
      `$viewports = @('390,844','768,1024','1440,900')
foreach ($size in $viewports) {
  pnpm exec playwright screenshot --viewport-size="$size" http://127.0.0.1:4173/admin "artifacts/admin-$($size.Replace(',','x')).png"
  $hash=(Get-FileHash "artifacts/admin-$($size.Replace(',','x')).png" -Algorithm SHA256).Hash
  "$size sha256=$hash"
}`,
      `390x844 单列、768x1024 单列或窄侧栏、1440x900 两列；每个尺寸均有哈希便于比较。
边界：没有统一数据夹具和固定字体的截图无法判断差异来自布局改动还是内容变化。`,
    ),
  ],
];

const CSS3_C2_EXAMPLES: CssStageExamples = [
  [
    cssExample(
      '比较布局视口、视觉视口和设备宽度',
      'CSS + JavaScript',
      `console.log({
  innerWidth,
  visualWidth: visualViewport?.width,
  visualScale: visualViewport?.scale,
  screenWidth: screen.width,
  dpr: devicePixelRatio
});
@media (max-width: 40rem){ body { --viewport-mode: narrow; } }`,
      `390px 设备仿真通常得到 innerWidth=390、visualWidth≈390、dpr=3；缩放后视觉宽度可能小于布局宽度。
边界：布局断点看 CSS 视口，不能直接把物理像素或屏幕宽度当容器宽度。`,
    ),
    cssExample(
      '用范围语法表达移动与桌面条件',
      'CSS + JavaScript',
      `<main id="page">内容</main>
<style>
  #page { padding:1rem; }
  @media (width >= 48rem) { #page { padding:2rem; } }
  @media (48rem <= width < 72rem) { #page { max-inline-size:60rem; margin:auto; } }
</style>
<script>console.log({width:innerWidth,padding:getComputedStyle(document.querySelector('#page')).padding});</script>`,
      `390px 时 padding=16px；800px 时 padding=32px 并启用中等宽度约束。
边界：rem 在媒体查询中按初始字号计算，不随页面根字号变化。`,
    ),
    cssExample(
      '把输入能力与视口宽度分开查询',
      'CSS + JavaScript',
      `<button class="tool">筛选</button>
<style>
  .tool { min-block-size:40px; padding-inline:12px; }
  @media (pointer: coarse) { .tool { min-block-size:48px; padding-inline:16px; } }
  @media (any-hover: hover) { .tool:hover { background:#eaf2ff; } }
</style>
<script>console.log({coarse:matchMedia('(pointer:coarse)').matches,hover:matchMedia('(any-hover:hover)').matches});</script>`,
      `桌面精确指针保持 40px，触控设备按钮增至 48px；悬停效果只在真正支持悬停的设备启用。
边界：窄屏桌面窗口不等于触控设备，设备宽度不能代表输入能力。`,
    ),
    cssExample(
      '让内容长度决定布局切换点',
      'CSS + JavaScript',
      `<article class="summary"><h2>付款失败与时序核对</h2><p>订单、支付、库存和退款状态需要同时可见。</p></article>
<style>
  .summary { max-inline-size:100%; }
  @media (max-width: 34rem) { .summary { padding-inline:1rem; } }
</style>
<script>const a=document.querySelector('.summary');console.log({width:a.clientWidth,scroll:a.scrollWidth,padding:getComputedStyle(a).paddingInlineStart});</script>`,
      `内容区低于约 34rem 时增加 gutter，标题与状态句仍能在窄视口完整换行。
边界：切点应来自实际内容开始拥挤的宽度，而不是从某个流行设备名称复制。`,
    ),
    cssExample(
      '组合宽度、方向和减少动态查询并保留默认态',
      'CSS',
      `.panel { padding: 1rem; transition: transform .25s ease; }
@media (min-width: 48rem) and (orientation: landscape) {
  .panel { padding: 2rem; }
}
@media (prefers-reduced-motion: reduce) {
  .panel { transition: none; }
}`,
      `默认样式始终可用；只有同时满足宽屏横屏才增加内边距，减少动态偏好独立关闭过渡。
边界：链式覆盖若删除默认规则，旧浏览器或条件未命中时会直接得到无样式内容。`,
    ),
  ],
  [
    cssExample(
      '让组件依据父容器宽度切换布局',
      'CSS + JavaScript',
      `<aside class="slot"><article class="card"><img src="thumb.webp" alt=""><div>标题与说明</div></article></aside>
<style>
  .slot { container-type:inline-size; inline-size:260px; }
  .card { display:grid; gap:12px; }
  @container (min-width: 24rem) { .card { grid-template-columns:120px 1fr; } }
</style>
<script>console.log({slot:document.querySelector('.slot').clientWidth,columns:getComputedStyle(document.querySelector('.card')).gridTemplateColumns});</script>`,
      `260px 容器未达到 24rem，保持单列；放到 480px 槽位时切换为图片与文字两列。
边界：容器查询响应父容器，而不是浏览器视口，同一组件可在不同区域呈现不同布局。`,
    ),
    cssExample(
      '声明 inline-size 包含并注意列轴影响',
      'CSS + JavaScript',
      `<div class="panel"><p>容器查询需要尺寸包含。</p></div>
<style>
  .panel { container-name:panel; container-type:inline-size; }
  @container panel (min-width: 30rem) { p { font-size:1.125rem; } }
</style>
<script>console.log({type:getComputedStyle(document.querySelector('.panel')).containerType,name:getComputedStyle(document.querySelector('.panel')).containerName});</script>`,
      `panel 的 inline-size 包含以内容盒为基础，宽度查询生效；列轴尺寸不会被锁定。
边界：尺寸包含会改变自动尺寸解析，组件在 Grid/Flex 中的表现应重新测量。`,
    ),
    cssExample(
      '用 cqi 让组件内间距跟随容器',
      'CSS + JavaScript',
      `<div class="widget"><button>继续</button></div>
<style>
  .widget { container-type:inline-size; padding:clamp(.75rem,5cqi,2rem); }
  .widget button { font-size:clamp(1rem,4cqi,1.25rem); }
</style>
<script>const w=document.querySelector('.widget');console.log({width:w.clientWidth,padding:getComputedStyle(w).paddingInlineStart,font:getComputedStyle(w.querySelector('button')).fontSize});</script>`,
      `组件在 240px 时使用较小内边距和字号，在 640px 时达到 clamp 上限，不依赖整页视口。
边界：cqi 只在最近的尺寸查询容器内有效，没有容器时参照值会退回到小视口单位。`,
    ),
    cssExample(
      '用命名容器避免最近容器误命中',
      'CSS + JavaScript',
      `<div class="outer"><div class="inner"><p class="copy">说明文字</p></div></div>
<style>
  .outer { container-type:inline-size; container-name:outer; inline-size:600px; }
  .inner { container-type:inline-size; container-name:inner; inline-size:240px; }
  @container outer (min-width:30rem) { p { color:#175cd3; } }
  @container inner (max-width:20rem) { p { font-style:italic; } }
</style>
<script>const p=getComputedStyle(document.querySelector('p'));console.log({color:p.color,fontStyle:p.fontStyle});</script>`,
      `p 同时命中 outer 宽度规则和最近 inner 宽度规则，命名容器让不同尺寸意图可解释。
边界：不写名称时最近容器优先，组件可能因为外层容器较大而误用桌面样式。`,
    ),
    cssExample(
      '支持检测失败时保留普通流回退',
      'CSS + JavaScript',
      `<article class="fallback"><h2>组件</h2><p>默认单列内容。</p></article>
<style>
  .fallback { display:grid; gap:1rem; }
  @supports (container-type:inline-size) {
    .fallback { container-type:inline-size; }
    @container (min-width:24rem) { .fallback { grid-template-columns:1fr 1fr; } }
  }
</style>
<script>console.log({container:CSS.supports('container-type:inline-size'),display:getComputedStyle(document.querySelector('.fallback')).display});</script>`,
      `支持容器查询时启用二维布局，不支持时仍保留普通单列 Grid 和完整文字。
边界：把基础可读样式全部关进 @supports，会让旧浏览器得到空壳组件。`,
    ),
  ],
  [
    cssExample(
      '用 clamp 给流式字号设置上下界',
      'CSS + JavaScript',
      `<h1>企业数据平台</h1><style>h1{font-size:clamp(1.75rem,4vw,3rem);line-height:1.2;max-inline-size:20ch}</style>
<script>console.log(getComputedStyle(document.querySelector('h1')).fontSize);</script>`,
      `390px 时字号接近 28px，1440px 时不超过 48px；标题保持在 20ch 宽度内换行。
边界：纯 vw 字号会随视口无界增长，缩小窗口时也可能低于可读下限。`,
    ),
    cssExample(
      '用无单位行高让行距随字号增长',
      'CSS + JavaScript',
      `<p class="body">无单位行高会与当前 font-size 相乘。</p><p class="fixed">固定行高不会随字体增长。</p>
<style>
  .body{font-size:clamp(1rem,1.5vw,1.25rem);line-height:1.6}
  .fixed{font-size:2rem;line-height:24px}
</style>
<script>console.table([...document.querySelectorAll('p')].map(n=>({className:n.className,font:getComputedStyle(n).fontSize,line:getComputedStyle(n).lineHeight})));</script>`,
      `body 的 line-height 随字体计算为约 1.6 倍；fixed 的 32px 字体只有 24px 行高，容易出现重叠。
边界：无单位行高也会被后代继承并按后代自身字号重新计算。`,
    ),
    cssExample(
      '用 ch 约束正文阅读宽度',
      'CSS + JavaScript',
      `<article><p class="copy">长文本内容用于验证每行字符数量与阅读宽度。</p></article>
<style>
  .copy{max-inline-size:65ch;font-size:clamp(1rem,1.2vw,1.125rem);line-height:1.65}
</style>
<script>const p=document.querySelector('.copy');console.log({width:p.getBoundingClientRect().width,font:getComputedStyle(p).fontSize});</script>`,
      `正文每行约 60–70 个字符，宽屏不会铺满整页，窄屏则在容器内自然收缩。
边界：ch 基于数字 0 的宽度，不同字体的中英文混排仍需用真实内容检查行长。`,
    ),
    cssExample(
      '用换行和间距代替负字距压标题',
      'CSS + JavaScript',
      `<h1>一个较长但需要保持可读的产品标题</h1><style>h1{font-size:clamp(2rem,5vw,3.5rem);line-height:1.15;letter-spacing:0;max-inline-size:18ch;margin-block:0 1rem}</style>
<script>const h=document.querySelector('h1');console.log({width:h.getBoundingClientRect().width,height:h.getBoundingClientRect().height,spacing:getComputedStyle(h).letterSpacing});</script>`,
      `标题在 18ch 宽度内按自然词边界换成两到三行，line-height 保持 1.15，letter-spacing 为 0。
边界：负字距会让中文和窄屏更难读，间距与断行比压缩字符更稳定。`,
    ),
    cssExample(
      '在用户放大与字体加载时仍保持可读',
      'CSS + JavaScript',
      `<article><h1>用户放大 200%</h1><p>正文不应被固定高度裁切。</p></article>
<style>
  article{max-inline-size:42rem;margin:auto;padding:clamp(1rem,4vw,2rem)}
  h1{font-size:clamp(1.75rem,4vw + 1rem,3rem);line-height:1.2}
  body{font-family:"Brand Sans","PingFang SC",system-ui,sans-serif}
</style>
<script>document.documentElement.style.fontSize='32px';console.log({h1:getComputedStyle(document.querySelector('h1')).fontSize,scroll:document.documentElement.scrollWidth});</script>`,
      `根字号放大后内容按 rem 增长，文章宽度与行高仍支持重排，scrollWidth 不超过视口。
边界：固定 height、px 行高和禁止缩放会破坏用户选择的字号，不应作为稳定策略。`,
    ),
  ],
  [
    cssExample(
      '测量按钮真正的可点击矩形',
      'CSS + JavaScript',
      `<button class="icon" aria-label="关闭">×</button>
<style>.icon{inline-size:44px;block-size:44px;padding:0;display:grid;place-items:center}</style>
<script>const r=document.querySelector('.icon').getBoundingClientRect();console.log({width:r.width,height:r.height,hitArea:r.width*r.height});</script>`,
      `按钮边框盒为 44×44px，可点击面积为 1936px²，图标本身较小但整块都可点击。
边界：只放大文字或用伪元素制造视觉面积，必须确认伪元素也参与命中与焦点。`,
    ),
    cssExample(
      '按指针精度提高触控密度',
      'CSS + JavaScript',
      `<button class="action">继续</button>
<style>
  .action{min-block-size:40px;padding-inline:12px;font-size:1rem}
  @media (pointer:coarse){.action{min-block-size:48px;padding-inline:16px;font-size:1.0625rem}}
</style>
<script>console.log({coarse:matchMedia('(pointer:coarse)').matches,height:document.querySelector('.action').offsetHeight});</script>`,
      `精确指针环境按钮约 40px，高触控密度设备增加到 48px，文字与内边距同步增大。
边界：宽度媒体查询无法识别平板触控或触屏笔记本，pointer 才是输入能力信号。`,
    ),
    cssExample(
      '用 viewport-fit 与安全区变量保留下方操作',
      'CSS',
      `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<nav class="bottom-actions">
  <button>取消</button><button>确认</button>
</nav>
<style>
  .bottom-actions{padding-inline:1rem;padding-block-end:calc(.75rem + env(safe-area-inset-bottom));}
</style>`,
      `底部操作栏在刘海屏 Home Indicator 上方保留额外安全区，按钮不会被系统手势区域遮住。
边界：没有 viewport-fit=cover 时 env(safe-area-inset-bottom) 可能始终为零。`,
    ),
    cssExample(
      '把主要动作放在拇指易达区而不是右上角',
      'CSS + JavaScript',
      `<div class="sheet"><header>选择地址</header><div class="body">地址列表</div><footer><button>使用此地址</button></footer></div>
<style>
  .sheet{min-block-size:100dvh;display:grid;grid-template-rows:auto 1fr auto}
  footer{padding:1rem;padding-block-end:calc(1rem + env(safe-area-inset-bottom));position:sticky;inset-block-end:0}
  footer button{inline-size:100%;min-block-size:48px}
</style>
<script>const b=document.querySelector('footer button').getBoundingClientRect();console.log({top:b.top,bottom:b.bottom,viewport:innerHeight});</script>`,
      `主操作固定在底部安全区上方，390×844 设备和 375×812 下均可单手触及且不遮挡列表末尾。
边界：把主操作放在右上角会增加移动端拇指距离，尤其在大屏和横屏模式。`,
    ),
    cssExample(
      '联合检查安全区、软键盘和键盘焦点遮挡',
      'PowerShell + JavaScript',
      `@'
<input id="search" aria-label="搜索订单">
<button id="submit">搜索</button>
<script>
  addEventListener('resize', () => console.log({innerHeight,visual:visualViewport?.height,safe:getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')}));
</script>
'@ | Set-Content safe-area.html
pnpm exec playwright screenshot --viewport-size="390,844" safe-area.html mobile-safe.png`,
      `键盘弹出后 visualViewport.height 明显变小，搜索按钮仍可在可视区滚动，焦点环未被安全区裁切。
边界：只测无键盘状态无法发现固定底栏被软键盘遮挡或输入框停留在屏幕外。`,
    ),
  ],
  [
    cssExample(
      '比较 dvh、svh、lvh 与 vh 的高度参照',
      'CSS + JavaScript',
      `<div class="hero"><h1>首屏</h1></div>
<style>
  .hero{min-block-size:100svh;display:grid;place-items:center}
  @supports (height:100dvh){.hero{min-block-size:100dvh}}
</style>
<script>console.log({innerHeight,supportsDvh:CSS.supports('height:100dvh'),hero:document.querySelector('.hero').offsetHeight});</script>`,
      `390×844 带浏览器地址栏时 svh 取较小高度，dvh 随工具栏变化，hero 不因地址栏展开而裁切内容。
边界：旧浏览器不支持 dvh 时要保留 svh/vh 回退，不能只写单一新单位。`,
    ),
    cssExample(
      '用 min-height 与内部滚动保留软键盘上方内容',
      'CSS + JavaScript',
      `<div class="composer"><textarea aria-label="消息"></textarea><button>发送</button></div>
<style>
  body{margin:0}.composer{min-block-size:100dvh;display:grid;grid-template-rows:1fr auto;padding:1rem;box-sizing:border-box}
  textarea{min-block-size:8rem}
</style>
<script>textarea.focus();console.log({innerHeight,visual:visualViewport?.height,composer:document.querySelector('.composer').clientHeight});</script>`,
      `键盘出现后 visualViewport 高度变小，textarea 仍可滚动到可视区，发送按钮没有被固定高度锁死。
边界：body overflow:hidden 加固定 100vh 会让键盘弹出后无法滚动到输入框。`,
    ),
    cssExample(
      '横屏时优先处理高度竞争',
      'CSS + JavaScript',
      `<div class="landscape"><header>工具</header><main>内容</main></div>
<style>
  .landscape{display:grid;grid-template-rows:auto 1fr;min-block-size:100dvh}
  header{padding:.5rem 1rem}main{overflow:auto;padding:1rem}
  @media (orientation:landscape) and (max-height:30rem){header{padding-block:.25rem}}
</style>
<script>console.log({orientation:matchMedia('(orientation:landscape)').matches,height:innerHeight});</script>`,
      `横屏高度约 390px 时压缩工具栏，主内容保留局部滚动，首屏标题不会被固定头部挤走。
边界：只按宽度做响应式设计会忽略横屏真正竞争的是垂直高度。`,
    ),
    cssExample(
      '用 scroll-padding 留出软键盘与固定栏空间',
      'CSS + JavaScript',
      `<form class="form"><label for="note">备注</label><textarea id="note"></textarea><button>提交</button></form>
<style>
  form{display:grid;gap:1rem;padding:1rem;scroll-padding-block-end:calc(5rem + env(safe-area-inset-bottom))}
  textarea{min-block-size:10rem}
  :root{--fixed-bottom:4.5rem}
</style>
<script>document.querySelector('#note').focus();console.log({scrollPadding:getComputedStyle(document.querySelector('form')).scrollPaddingBlockEnd});</script>`,
      `焦点移动到备注框时浏览器会按 scroll-padding 预留底部空间，固定栏与安全区不会盖住输入。
边界：软键盘实现没有统一 CSS 选择器，最终仍要在真实 iOS/Android WebView 验证。`,
    ),
    cssExample(
      '在真实设备矩阵记录键盘前后视口状态',
      'PowerShell',
      `$matrix = @('iPhone 13 portrait','iPhone 13 landscape','Pixel 7 portrait')
foreach ($device in $matrix) {
  pnpm exec playwright screenshot --device="$device" http://127.0.0.1:4173/chat "artifacts/chat-$($device.Replace(' ','-')).png"
}
@'
{"portrait":{"visual":844,"keyboardVisual":512},"landscape":{"visual":390,"keyboardVisual":250}}
'@ | Set-Content artifacts/viewport-keyboard.json`,
      `竖屏键盘后 visualViewport 约 512px，横屏约 250px；每个设备状态均有截图与数值记录。
边界：桌面窗口缩小不能替代软键盘，模拟器和真实 WebView 的工具栏行为也可能不同。`,
    ),
  ],
  [
    cssExample(
      '固定 viewport、字体、数据和主题',
      'JSON',
      `{
  "viewport": {"width":390,"height":844,"dpr":3},
  "font": "PingFang SC",
  "theme": "light",
  "fixture": "learning-overview-long-title",
  "locale": "zh-CN",
  "reducedMotion": false
}
`,
      `截图环境固定为 390×844、3 倍像素、中文长标题数据与亮色主题，结果可重复比较。
边界：系统字体、随机数据和动画状态不定，像素差异无法归因于 CSS 改动。`,
    ),
    cssExample(
      '用边界宽度矩阵覆盖换行临界点',
      'PowerShell',
      `$sizes = @('320,568','375,812','390,844','430,932','768,1024','1440,900')
foreach ($size in $sizes) {
  $file = 'artifacts/layout-' + $size.Replace(',','x') + '.png'
  pnpm exec playwright screenshot --viewport-size=$size http://127.0.0.1:4173/learning "$file"
  "$size -> $file"
}`,
      `320/375/390/430 覆盖手机边界，768 覆盖平板，1440 覆盖桌面，每个页面都有对应截图。
边界：只测 390px 与 1440px 会漏掉 320px 和折叠设备导致的断行、溢出与浮层遮挡。`,
    ),
    cssExample(
      '找出 scrollWidth 超出的最具体后代',
      'CSS + JavaScript',
      `const root = document.documentElement;
const offenders = [...document.querySelectorAll('*')].filter((node) => {
  const style = getComputedStyle(node);
  return node.scrollWidth > node.clientWidth + 1 && style.overflowX === 'visible';
});
console.table(offenders.slice(0, 8).map((node) => ({
  tag: node.tagName,
  className: node.className,
  client: node.clientWidth,
  scroll: node.scrollWidth
})));
console.log('pageOverflow=', root.scrollWidth - root.clientWidth);`,
      `offenders 列出 clientWidth 小于 scrollWidth 且 overflow-x:visible 的节点，pageOverflow 为正数。
边界：直接给 body overflow-x:hidden 只会遮住症状，应沿最小子元素链修复内容最小宽度。`,
    ),
    cssExample(
      '把长内容、错误、加载与选中状态纳入矩阵',
      'JSON',
      `[
  {"state":"long-title","expect":"no horizontal overflow"},
  {"state":"form-error","expect":"error visible above fold"},
  {"state":"loading","expect":"button disabled and status announced"},
  {"state":"selected","expect":"focus ring not clipped"},
  {"state":"reduced-motion","expect":"feedback remains visible"}
]
`,
      `五种页面状态各有可观察期望，截图与 DOM 断言可以按状态逐项重放。
边界：只测默认理想状态无法发现错误消息、加载遮挡与焦点环裁切。`,
    ),
    cssExample(
      '用几何阈值判断差异是否可接受',
      'JavaScript',
      `const expected = { buttonTop: 720, buttonHeight: 48, overflow: 0 };
const actual = { buttonTop: 724, buttonHeight: 46, overflow: 0 };
const verdict = {
  buttonTop: Math.abs(actual.buttonTop - expected.buttonTop) <= 2 ? 'pass' : 'review',
  buttonHeight: Math.abs(actual.buttonHeight - expected.buttonHeight) <= 1 ? 'pass' : 'review',
  overflow: actual.overflow === 0 ? 'pass' : 'fail'
};
console.table(verdict);`,
      `buttonTop 与 buttonHeight 的 2px/1px 差异进入 review，overflow=0 通过发布阈值。
边界：基线更新不能因为像素差小就自动接受，阈值必须区分复制错误、布局变化和字体回退。`,
    ),
  ],
];

const CSS3_C3_EXAMPLES: CssStageExamples = [
  [
    cssExample(
      '从基础色到语义色再到组件变量',
      'CSS',
      `:root {
  --blue-600: #175cd3;
  --gray-900: #101828;
  --color-action: var(--blue-600);
  --color-text: var(--gray-900);
  --button-bg: var(--color-action);
  --button-fg: #fff;
}
.button { background: var(--button-bg); color: var(--button-fg); }`,
      `蓝 600 与灰 900 是原始值，color-action/color-text 表达语义，button-bg 是组件接口。
边界：组件直接引用 --blue-600 会让主题切换和品牌替换穿透到业务样式。`,
    ),
    cssExample(
      '观察自定义属性按最近作用域继承',
      'CSS + JavaScript',
      `<section class="theme"><div class="card"><button>保存</button></div></section>
<style>
  :root{--action-bg:#175cd3}.theme{--action-bg:#067647}.card{--action-bg:#b42318}
  button{background:var(--action-bg)}
</style>
<script>console.log(getComputedStyle(document.querySelector('button')).backgroundColor);</script>`,
      `rgb(180, 35, 24)
按钮使用最近祖先 .card 声明的 --action-bg，根与 section 的值被局部覆盖。
边界：自定义属性继承的是声明时的 token 引用，修改根变量仍会影响未局部覆盖的组件。`,
    ),
    cssExample(
      '用 property 给尺寸变量声明类型和初值',
      'CSS + JavaScript',
      `<div class="meter" style="--progress:65%">65%</div>
<style>
  @property --progress { syntax:"<percentage>"; inherits:false; initial-value:0%; }
  .meter{inline-size:240px;background:#e4e7ec;border-radius:999px;overflow:hidden}
  .meter::before{content:"";display:block;block-size:8px;inline-size:var(--progress);background:#175cd3;transition:inline-size .3s}
</style>
<script>console.log(getComputedStyle(document.querySelector('.meter')).getPropertyValue('--progress'));</script>`,
      `--progress 被注册为 percentage，缺失时回退 0%，数值变化可按类型平滑过渡。
边界：未注册的变量通常按 token 替换，类型错误和动画插值行为不稳定。`,
    ),
    cssExample(
      '让主题只覆盖语义 token 并尊重用户偏好',
      'CSS',
      `:root { --surface: #fff; --text: #101828; --action: #175cd3; }
[data-theme="dark"] { --surface:#101828; --text:#f2f4f7; --action:#84adff; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) { --surface:#101828; --text:#f2f4f7; --action:#84adff; }
}
body { background:var(--surface); color:var(--text); }`,
      `未显式选主题时跟随系统暗色，有 data-theme 时用户选择覆盖系统偏好，组件无需重写。
边界：两套主题只改变背景色而不重配文字和状态色，会造成对比度失效。`,
    ),
    cssExample(
      '验证变量解析、缺失回退和无效值',
      'CSS + JavaScript',
      `<button id="save">保存</button>
<style>
  :root{--action:#175cd3}
  #save{background:var(--action,#667085);color:var(--missing,#fff)}
  #save:hover{background:var(--missing-color,#b42318)}
</style>
<script>const s=getComputedStyle(document.querySelector('#save'));console.log({background:s.backgroundColor,color:s.color});</script>`,
      `{ background: 'rgb(23, 92, 211)', color: 'rgb(255, 255, 255)' }
无效或缺失变量使用 fallback；若 fallback 也缺失，属性会变成无效值而不是继承其他颜色。
边界：变量存在但值不合法时不一定走 fallback，必须用 supports 或组件测试确认。`,
    ),
  ],
  [
    cssExample(
      '先定义标题、正文与辅助文字角色',
      'CSS',
      `.type-display { font-size: clamp(2rem,5vw,3.5rem); line-height:1.1; font-weight:700; }
.type-body { font-size:clamp(1rem,1.2vw,1.125rem); line-height:1.65; }
.type-caption { font-size:.875rem; line-height:1.45; color:#475467; }`,
      `display、body、caption 分别服务主标题、正文和辅助信息，字号不是围绕页面位置随意取名。
边界：把 20px、16px 等数值直接当角色名，无法表达用途也无法解释层级。`,
    ),
    cssExample(
      '用有限比例建立可解释字号层级',
      'CSS + JavaScript',
      `<h1>一级</h1><h2>二级</h2><p>正文</p>
<style>
  :root{--step--1:.875rem;--step-0:1rem;--step-1:1.25rem;--step-2:1.5625rem;--step-3:1.953rem}
  h1{font-size:var(--step-3)}h2{font-size:var(--step-2)}p{font-size:var(--step-0)}
</style>
<script>console.table(['h1','h2','p'].map(tag=>({tag,size:getComputedStyle(document.querySelector(tag)).fontSize})));</script>`,
      `h1 31.25px、h2 25px、正文 16px，层级有限且每级都来自同一比例序列。
边界：每个页面随意新增字号会让视觉节奏和 Token 维护失去可解释性。`,
    ),
    cssExample(
      '按阅读任务给不同字号配行高',
      'CSS + JavaScript',
      `<h2>短标题</h2><p class="long">长正文用于验证阅读行距。</p>
<style>
  h2{font-size:1.5rem;line-height:1.2}p{font-size:1rem;line-height:1.7;max-inline-size:65ch}
</style>
<script>console.table(['h2','p'].map(tag=>({tag,line:getComputedStyle(document.querySelector(tag)).lineHeight})));</script>`,
      `h2 行高为 28.8px，正文 p 行高为 27.2px；正文更宽裕，标题保持紧凑。
边界：一个全局 line-height 不能满足大标题和小正文的不同阅读任务。`,
    ),
    cssExample(
      '为回退字体预留度量与换行压力',
      'CSS + JavaScript',
      `<h1>中文品牌标题与 English Product Name</h1>
<style>
  body{font-family:"Brand Sans","PingFang SC","Noto Sans SC",system-ui,sans-serif}
  h1{font-size:clamp(2rem,5vw,3rem);line-height:1.15;max-inline-size:20ch;overflow-wrap:anywhere}
</style>
<script>console.log({font:getComputedStyle(document.querySelector('h1')).fontFamily,width:document.querySelector('h1').offsetWidth});</script>`,
      `品牌字体未加载时回退 PingFang/Noto，20ch 上限与 overflow-wrap 保证中英混排不溢出。
边界：只写一个并不存在的品牌字体，浏览器会静默使用默认字体并改变行高与宽度。`,
    ),
    cssExample(
      '为表格数字和代码启用等宽数字',
      'CSS + JavaScript',
      `<table><tr><td class="num">1,234.50</td><td class="num">9,876.00</td></tr></table><code class="code">const total = 42;</code>
<style>
  .num{font-variant-numeric:tabular-nums slashed-zero}
  .code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
</style>
<script>const s=getComputedStyle(document.querySelector('.num'));console.log({variant:s.fontVariantNumeric,family:getComputedStyle(document.querySelector('.code')).fontFamily});</script>`,
      `表格数字使用 tabular-nums 对齐数位，代码使用等宽字体，数字列在扫描时不会左右跳动。
边界：等宽字体不是所有代码的唯一选择，但正文比例字体不适合稳定数字列。`,
    ),
  ],
  [
    cssExample(
      '按普通文字与大字号区分对比度阈值',
      'CSS',
      `.body { color:#344054; background:#fff; font-size:1rem; }
.large-title { color:#475467; background:#fff; font-size:2rem; font-weight:700; }
.muted { color:#667085; background:#fff; font-size:.875rem; }`,
      `普通正文和 caption 按 4.5:1 检查，加粗大字标题可按 3:1 检查；muted 仍需实测而不是凭视觉。
边界：同一颜色在不同字号、字重和背景上不能共用一个“看起来还行”的判断。`,
    ),
    cssExample(
      '合成半透明按钮后再测量真实背景',
      'CSS + JavaScript',
      `<button class="ghost">取消</button><style>.ghost{color:#344054;background:#175cd3;opacity:.45;border:0;padding:12px}</style>
<script>const s=getComputedStyle(document.querySelector('.ghost'));console.log({color:s.color,background:s.backgroundColor,opacity:s.opacity});</script>`,
      `opacity:.45 会把文字和背景一起与页面底色合成，不能再用声明的 color 与 background 直接算对比。
边界：半透明卡片叠在图片上时，最坏背景取决于图片像素，需要遮罩或独立表面。`,
    ),
    cssExample(
      '让状态同时使用文字、图标和形状',
      'CSS',
      `<p class="status error"><span aria-hidden="true">!</span> 支付失败</p>
<style>
  .error{color:#b42318;background:#fef3f2;border-inline-start:4px solid #b42318;padding:.75rem}
  .error span{font-weight:800;margin-inline-end:.5rem}
</style>`,
      `错误通过红色文本、感叹号、浅色背景和左侧边框四个通道表达，不只依赖色相。
边界：只用红绿背景区分成功失败，在色觉障碍或强制色彩模式下会丢失含义。`,
    ),
    cssExample(
      '暗色主题重新配文字、边框与表面',
      'CSS',
      `:root{--surface:#fff;--surface-raised:#f9fafb;--text:#101828;--border:#d0d5dd}
[data-theme="dark"]{--surface:#101828;--surface-raised:#1d2939;--text:#f2f4f7;--border:#475467}
.card{background:var(--surface-raised);color:var(--text);border:1px solid var(--border);padding:1rem}`,
      `暗色主题分别调整背景、抬升表面、文字和边框，不把亮色主题的边框直接透明化。
边界：只把 body 背景换成黑色，会让表格边框、禁用按钮、图片占位和阴影全部失去层次。`,
    ),
    cssExample(
      '把对比度与状态证据写进组件验收',
      'JSON',
      `{
  "component":"button",
  "variants":["primary","danger","quiet"],
  "states":["default","hover","focus","disabled"],
  "evidence":{"primary":{"contrast":5.8},"danger":{"contrast":6.1},"quiet":{"contrast":7.2}},
  "focusOutlinePx":3
}
`,
      `三种变体与四种状态的证据分开记录，primary/danger/quiet 对比度均高于 4.5，焦点轮廓为 3px。
边界：组件库只提供截图没有变体状态矩阵，无法判断新增主题是否破坏对比。`,
    ),
  ],
  [
    cssExample(
      '用有限空间刻度表达关系',
      'CSS',
      `:root{--space-1:.25rem;--space-2:.5rem;--space-3:.75rem;--space-4:1rem;--space-6:1.5rem}
.stack{display:grid;gap:var(--space-3)}
.card{padding:var(--space-4)}
.section{margin-block:var(--space-6)}`,
      `1、2、3、4、6 构成有限刻度，列表、卡片、章节分别消费不同层级，间距关系可被扫描。
边界：每个页面随手新增 13px、18px、27px 会让视觉节奏和主题适配失去稳定性。`,
    ),
    cssExample(
      '观察普通流中相邻 margin 的折叠',
      'CSS + JavaScript',
      `<div class="one">第一段</div><div class="two">第二段</div>
<style>.one{margin-block-end:32px}.two{margin-block-start:20px}</style>
<script>console.log({oneBottom:document.querySelector('.one').getBoundingClientRect().bottom,twoTop:document.querySelector('.two').getBoundingClientRect().top,gap:document.querySelector('.two').getBoundingClientRect().top-document.querySelector('.one').getBoundingClientRect().bottom});</script>`,
      `相邻 margin 折叠后间距为 32px，不是 32+20=52px；twoTop-oneBottom 约为 32。
边界：建立新格式化上下文、浮动或特定 Flex/Grid 关系会改变折叠行为。`,
    ),
    cssExample(
      '让圆角与内容裁切保持一致',
      'CSS + JavaScript',
      `<div class="card"><img src="cover.webp" alt="封面"><div class="body">内容</div></div>
<style>
  .card{--radius:8px;border-radius:var(--radius);overflow:hidden;inline-size:320px}
  .card img{display:block;inline-size:100%;block-size:180px;object-fit:cover}
</style>
<script>const c=document.querySelector('.card');console.log({radius:getComputedStyle(c).borderRadius,overflow:getComputedStyle(c).overflow,width:c.offsetWidth});</script>`,
      `卡片与内部图片共享 8px 圆角边界，图片铺满卡片宽度并被 card 的 overflow 裁切。
边界：只在图片上写圆角而父表面仍是直角，会在四角出现白色或背景色溢缝。`,
    ),
    cssExample(
      '用阴影与边框共同表达抬升层级',
      'CSS',
      `<div class="menu"><button>操作</button></div>
<style>
  .menu{background:#fff;border:1px solid #d0d5dd;border-radius:8px;box-shadow:0 12px 32px #10182824;padding:.5rem}
  .menu button{display:block;inline-size:100%;text-align:start}
</style>`,
      `浮层用边框固定边界、阴影表达与页面的垂直关系、半径限制表面形状，三者共同提供层级。
边界：阴影不是唯一层级信号，页面背景为暗色或高对比时还需边框和背景差。`,
    ),
    cssExample(
      '让焦点环与表面层级都能被看见',
      'CSS + JavaScript',
      `<button class="surface">打开筛选</button>
<style>
  .surface{background:#fff;color:#101828;border:1px solid #d0d5dd;box-shadow:0 8px 24px #1018281f;padding:12px 16px}
  .surface:focus-visible{outline:3px solid #175cd3;outline-offset:3px;box-shadow:none}
</style>
<script>document.querySelector('.surface').focus();console.log(getComputedStyle(document.querySelector('.surface')).outline);</script>`,
      `焦点态显示 3px 蓝色轮廓并移除会干扰判断的阴影，焦点环与按钮表面有清晰间隔。
边界：焦点环与阴影同色或贴近边框，会让键盘用户难以确认当前位置。`,
    ),
  ],
  [
    cssExample(
      '移除默认轮廓后补回焦点可见样式',
      'CSS + JavaScript',
      `<a href="/next/">下一页</a>
<style>
  a:focus{outline:none}
  a:focus-visible{outline:3px solid #175cd3;outline-offset:3px}
</style>
<script>document.querySelector('a').focus();console.log(getComputedStyle(document.querySelector('a')).outline);</script>`,
      `焦点态最终 outline 为 3px solid #175cd3，outline-offset 让轮廓与文字有间隔。
边界：只写 outline:none 而不提供 focus-visible 替代样式，键盘用户会失去当前位置。`,
    ),
    cssExample(
      '让禁用样式与真实 disabled 状态一致',
      'HTML + CSS',
      `<button disabled>提交中</button><button class="fake-disabled" aria-disabled="true">不可用</button>
<style>
  button{min-block-size:40px}button:disabled{opacity:.55;cursor:not-allowed}.fake-disabled{opacity:.55}
</style>`,
      `第一个按钮真实不可聚焦、不可点击且视觉变淡；第二个只声明 aria-disabled，事件仍需业务代码拦截。
边界：只加样式类但不设置 disabled 或拦截 click，会让用户误以为操作真的不可用。`,
    ),
    cssExample(
      '用 aria-invalid 与 describedby 连接错误样式',
      'CSS + JavaScript',
      `<label for="email">邮箱</label><input id="email" aria-invalid="true" aria-describedby="err"><p id="err">邮箱格式不正确</p>
<style>
  [aria-invalid="true"]{border:2px solid #b42318;background:#fef3f2}
  #err{color:#b42318;font-weight:600}
</style>
<script>console.log({invalid:document.querySelector('#email').getAttribute('aria-invalid'),described:document.querySelector('#email').getAttribute('aria-describedby')});</script>`,
      `{ invalid: 'true', described: 'err' }
错误视觉由 aria-invalid 驱动，错误说明通过 aria-describedby 关联，颜色不是唯一信号。
边界：样式只依据 .error 类而状态属性未同步，键盘和读屏无法获得一致错误。`,
    ),
    cssExample(
      '区分 pressed 与 selected 的组件模式',
      'HTML + CSS',
      `<button aria-pressed="true">已关注</button><button role="tab" aria-selected="true">概览</button>
<style>
  [aria-pressed="true"]{background:#175cd3;color:#fff}
  [aria-selected="true"]{border-block-end:3px solid #175cd3;font-weight:700}
</style>`,
      `关注按钮使用 aria-pressed 表达切换状态，标签页使用 aria-selected 和底部边界表达当前选项。
边界：给 tab 使用 aria-pressed，或给 toggle 使用 aria-selected，会让辅助技术得到错误模式。`,
    ),
    cssExample(
      '在强制色彩模式补回轮廓和边界',
      'CSS',
      `.action { border:1px solid currentColor; }
.action:focus-visible { outline:3px solid #175cd3; outline-offset:3px; }
@media (forced-colors: active) {
  .action { border-color:ButtonText; }
  .action:focus-visible { outline-color:Highlight; }
}`,
      `普通模式使用品牌蓝色焦点，强制色彩模式改用系统 ButtonText 与 Highlight，边界不依赖透明背景。
边界：背景图和阴影在高对比模式可能被移除，必须确保焦点和状态仍由边框或轮廓表达。`,
    ),
  ],
  [
    cssExample(
      '让主题覆盖完整表面与文字关系',
      'CSS',
      `:root{--bg:#fff;--surface:#f9fafb;--text:#101828;--muted:#475467;--border:#d0d5dd;--focus:#175cd3}
[data-theme="dark"]{--bg:#0c111d;--surface:#1d2939;--text:#f2f4f7;--muted:#d0d5dd;--border:#475467;--focus:#84adff}
body{background:var(--bg);color:var(--text)}
.card{background:var(--surface);border:1px solid var(--border);color:var(--text)}
.card small{color:var(--muted)}`,
      `暗色主题同时改 bg、surface、text、muted、border 与 focus，卡片、说明和焦点都能保持层次。
边界：只改 surface 不改文字与边框，会让低对比问题在暗色下集中出现。`,
    ),
    cssExample(
      '高对比模式优先使用系统颜色',
      'CSS',
      `@media (forced-colors: active) {
  .panel { background:Canvas; color:CanvasText; border:1px solid CanvasText; }
  .action { background:ButtonFace; color:ButtonText; border:1px solid ButtonText; }
  .action:focus-visible { outline:3px solid Highlight; }
}`,
      `高对比模式使用 Canvas、CanvasText、ButtonFace、ButtonText 与 Highlight，内容与焦点保持可识别。
边界：品牌背景图和透明边框在 forced-colors 下可能消失，不能用它作为唯一状态编码。`,
    ),
    cssExample(
      '为图片与图表提供独立主题资源',
      'CSS + JavaScript',
      `<picture><source media="(prefers-color-scheme:dark)" srcset="chart-dark.svg"><img src="chart-light.svg" alt="季度收入趋势"></picture>
<style>img{max-inline-size:100%;block-size:auto;background:#fff}</style>
<script>console.log(matchMedia('(prefers-color-scheme:dark)').matches);</script>`,
      `暗色系统偏好选择 chart-dark.svg，亮色加载 chart-light.svg；图片仍有 alt 和尺寸约束。
边界：白色图表直接放在深色背景上可能仍可读，但细线、网格和透明区域需要单独审计。`,
    ),
    cssExample(
      '处理系统偏好与用户显式主题的优先级',
      'CSS + JavaScript',
      `:root{--theme-mode:"system"}
:root[data-theme]{--theme-mode:"user"}
@media (prefers-color-scheme:dark){:root:not([data-theme]){--surface:#101828;--text:#f2f4f7}}
[data-theme="light"]{--surface:#fff;--text:#101828}
<script>console.log({systemDark:matchMedia('(prefers-color-scheme:dark)').matches,theme:document.documentElement.dataset.theme});</script>`,
      `无 data-theme 时跟随系统暗色；用户选择 data-theme=light 后显式主题覆盖系统偏好。
边界：全部规则都放系统查询里，会让用户选择无法生效或刷新后回退。`,
    ),
    cssExample(
      '保存主题、对比度和回滚证据',
      'JSON',
      `{
  "release":"2026.11.24.5",
  "themes":["light","dark","forced-colors"],
  "contrast":{"primary":{"light":5.8,"dark":5.1},"muted":{"light":4.7,"dark":4.6}},
  "rollback":"tokens-2026-11-20.json",
  "screenshots":["pricing-light.png","pricing-dark.png","pricing-forced.png"]
}
`,
      `发布记录包含版本、三种主题、关键文字对比、回滚 token 与截图集合。
边界：只保存亮色首页截图无法证明暗色、高对比、错误态和表单仍然可用。`,
    ),
  ],
];

const CSS3_C4_EXAMPLES: CssStageExamples = [
  [
    cssExample(
      '说明 BEM 命名只能减少冲突',
      'HTML + CSS',
      `<article class="card"><h2 class="card__title">方案</h2></article>
<style>.card__title{color:#101828}.sidebar .card__title{color:#b42318}</style>`,
      `全局规则 .sidebar .card__title 仍能覆盖 BEM 类名；命名约定降低同层冲突概率但不提供作用域。
边界：把 BEM 当成隔离机制会让组件在宿主页面中继续被高特异性选择器修改。`,
    ),
    cssExample(
      '用 CSS Modules 生成构建期局部类名',
      'CSS + JavaScript',
      `import styles from "./card.module.css";
const card = document.createElement("article");
card.className = styles.card;
card.textContent = "订单";
console.log({ className:card.className, sourceToken:"card" });`,
      `className 构建后类似 card_4d91c2_1，组件源码仍通过语义 token 引用样式。
边界：CSS Modules 只隔离类名，全局元素选择器和未模块化样式仍可能影响组件。`,
    ),
    cssExample(
      '把数据属性根作为稳定公开边界',
      'HTML + CSS',
      `<article data-card data-variant="featured"><h2>企业方案</h2></article>
<style>
  [data-card]{border:1px solid #d0d5dd;border-radius:8px;padding:1rem}
  [data-card][data-variant="featured"]{border-color:#175cd3}
</style>`,
      `data-card 是组件对外稳定根，data-variant 是公开变体契约，内部 class 改动不破坏样式入口。
边界：把深层 div:nth-child(3) 当公开接口，会让 DOM 重构变成破坏性版本升级。`,
    ),
    cssExample(
      '比较 scoped CSS 与 Shadow DOM 的隔离强度',
      'CSS + JavaScript',
      `<div class="shadow-host"></div>
<style>.shadow-host{display:block;border:1px solid #98a2b3;padding:1rem}</style>
<script>
  const root=document.querySelector('.shadow-host').attachShadow({mode:'open'});
  root.innerHTML='<style>p{color:#175cd3}</style><p>Shadow 内容</p>';
  console.log({shadow:Boolean(root),hostText:document.querySelector('.shadow-host').textContent});
</script>`,
      `shadow root 内 p 使用内部样式，宿主页面普通 p 选择器无法直接命中该内容。
边界：Shadow DOM 也会阻止宿主正常主题覆盖，公开 CSS 自定义属性或 part 才可扩展。`,
    ),
    cssExample(
      '用泄漏用例检验组件隔离边界',
      'HTML + CSS + JavaScript',
      `<section class="host"><article data-card><h2 class="title">组件标题</h2></article></section>
<style>
  [data-card]{--card-title:#175cd3}
  .host .title{color:#b42318}
  [data-card] .title{color:var(--card-title)}
</style>
<script>console.log({color:getComputedStyle(document.querySelector('.title')).color,outside:getComputedStyle(document.querySelector('.host')).color});</script>`,
      `组件标题使用 card token，宿主 .host .title 规则若仍因更高特异性胜出，就说明隔离回归失败。
边界：隔离用例必须同时检查宿主外元素、嵌套组件和宿主属性覆盖。`,
    ),
  ],
  [
    cssExample(
      '用独立属性表达尺寸、语气与密度',
      'HTML + CSS',
      `<button class="button" data-size="lg" data-tone="danger" data-density="compact">删除</button>
<style>
  .button{padding:var(--button-pad,12px 16px)}
  [data-tone="danger"]{background:#b42318;color:#fff}
  [data-size="lg"]{font-size:1.125rem}
  [data-density="compact"]{--button-pad:8px 12px}
</style>`,
      `尺寸、语气与密度分别由三个属性表达，可组合出大号紧凑危险按钮，不必为每个组合新建类。
边界：变体维度没有正交边界时，属性组合数量会爆炸且冲突顺序难以解释。`,
    ),
    cssExample(
      '把变体值收敛成可读词表',
      'HTML + CSS',
      `<button data-tone="primary">保存</button><button data-tone="danger">删除</button>
<style>
  [data-tone="primary"]{--tone-bg:#175cd3;--tone-fg:#fff}
  [data-tone="danger"]{--tone-bg:#b42318;--tone-fg:#fff}
  button{background:var(--tone-bg,#667085);color:var(--tone-fg,#fff)}
</style>`,
      `tone 词表只使用 primary/danger 等业务语义，组件消费统一 --tone-bg 与 --tone-fg。
边界：允许任意颜色名直接写进 data-tone，会让视觉词表与可访问性审计失控。`,
    ),
    cssExample(
      '让 ARIA 状态驱动视觉选择器',
      'HTML + CSS + JavaScript',
      `<button id="menu" aria-expanded="false" aria-controls="list">筛选</button><ul id="list" hidden>选项</ul>
<style>[aria-expanded="true"]{background:#175cd3;color:#fff}[aria-expanded="true"]+ul{display:block}</style>
<script>menu.onclick=()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));list.hidden=!open};</script>`,
      `按钮扩展状态与面板显示由同一 aria-expanded 控制，视觉选择器不会与实际可访问状态漂移。
边界：样式依据 .open 类而 ARIA 没有同步，读屏和视觉用户会得到不同状态。`,
    ),
    cssExample(
      '组合冲突按层和明确顺序解决',
      'HTML + CSS',
      `<button class="button" data-tone="danger" data-state="disabled">删除</button>
<style>
  @layer components, states;
  @layer components { [data-tone="danger"]{background:#b42318;color:#fff} }
  @layer states { [data-state="disabled"]{background:#98a2b3} }
</style>`,
      `states 层晚于 components，disabled 背景稳定覆盖危险色的默认态，同时不改变组件基础接口。
边界：通过不断叠加选择器长度解决组合冲突，会让状态优先级无法解释。`,
    ),
    cssExample(
      '用组合矩阵回归新增变体',
      'JSON',
      `[
  {"size":"sm","tone":"primary","density":"compact","state":"default"},
  {"size":"lg","tone":"danger","density":"comfortable","state":"hover"},
  {"size":"md","tone":"quiet","density":"compact","state":"focus"},
  {"size":"md","tone":"primary","density":"compact","state":"disabled"}
]
`,
      `四组组合覆盖尺寸、语气、密度与状态的交叉点，截图与计算样式可逐项重放。
边界：新增一个大号危险按钮只补单条 CSS，不代表它与紧凑、焦点、禁用组合仍然正确。`,
    ),
  ],
  [
    cssExample(
      '只对可插值属性使用过渡',
      'CSS + JavaScript',
      `<button class="action">保存</button><style>.action{background:#175cd3;transition:background-color .2s ease,transform .2s ease}.action:hover{background:#1849a9;transform:translateY(-1px)}</style>
<script>console.log({transition:getComputedStyle(document.querySelector('.action')).transitionProperty});</script>`,
      `background-color 与 transform 都可插值，悬停时 200ms 内平滑改变颜色和 1px 位移。
边界：display、content 等离散属性通常不会平滑过渡，不能期待 transition 自动处理。`,
    ),
    cssExample(
      '用缓动与时长表达因果节奏',
      'CSS + JavaScript',
      `<div class="toast">已保存</div><style>.toast{opacity:0;transform:translateY(8px);transition:opacity .18s ease-out,transform .18s ease-out}.toast.show{opacity:1;transform:none}</style>
<script>const t=document.querySelector('.toast');t.classList.add('show');console.log({opacity:getComputedStyle(t).opacity,transition:getComputedStyle(t).transitionDuration});</script>`,
      `状态改变后 180ms 内淡入并上移归位，短时 ease-out 让反馈迅速出现又不过分弹跳。
边界：所有交互统一用 1s linear 会让界面显得迟钝，也无法表达即时反馈。`,
    ),
    cssExample(
      '确认 discrete 过渡是否需要 allow-discrete',
      'CSS + JavaScript',
      `<div id="box" hidden>逐步出现</div><style>#box{opacity:0;transition:opacity .25s,display .25s allow-discrete}#box.show{opacity:1;display:block;transition-behavior:allow-discrete}</style>
<script>box.hidden=false;box.classList.add('show');console.log(getComputedStyle(box).display);</script>`,
      `显示状态通过 allow-discrete 参与过渡，元素进入可见后再完成透明度变化。
边界：旧浏览器不支持离散过渡时仍要保证最终可见，不能把核心内容只放在动画完成回调里。`,
    ),
    cssExample(
      '让动画可被用户操作即时打断',
      'CSS + JavaScript',
      `<div class="drawer">设置面板</div><button id="toggle">开关</button>
<style>
  .drawer{translate:100% 0;transition:translate .2s ease;position:fixed;inset:0 0 0 auto;width:min(360px,90vw);background:#fff}
  .drawer.open{translate:0 0}
</style>
<script>toggle.onclick=()=>document.querySelector('.drawer').classList.toggle('open');</script>`,
      `重复点击开关时抽屉从当前 translate 位置反向过渡，不会排队执行旧动画。
边界：复杂 keyframe 若设置 fill-mode:forwards 且不清理类，用户操作后可能停在过期终点。`,
    ),
    cssExample(
      '减少动态时保留状态反馈',
      'CSS',
      `.notice { opacity:0; transform:translateY(6px); transition:opacity .2s,transform .2s; }
.notice.show { opacity:1; transform:none; }
@media (prefers-reduced-motion: reduce) {
  .notice { transition:none; }
  .notice.show::before { content:"✓ "; }
}`,
      `正常模式淡入并位移，减少动态模式立即显示文本且增加勾号，反馈没有因取消动画而消失。
边界：只写 animation:none 却仍依赖透明度从 0 到 1，用户可能看不到状态内容。`,
    ),
  ],
  [
    cssExample(
      '用 popover 与定位 Anchor 处理顶层浮层',
      'HTML + CSS',
      `<button popovertarget="filters">筛选</button><div id="filters" popover="auto">筛选内容</div>
<style>
  [popover]{border:1px solid #d0d5dd;border-radius:8px;padding:1rem;box-shadow:0 12px 32px #1018281f}
</style>`,
      `popover 打开时进入顶层，不受父级 overflow:hidden 裁切，Escape 与点击外部可关闭。
边界：popover 解决顶层和轻量关闭，不自动替代菜单的方向键与焦点管理。`,
    ),
    cssExample(
      '让浮层在屏幕边界内翻转而不是溢出',
      'HTML + CSS',
      `<button class="trigger">更多</button><div class="popover">操作列表</div>
<style>
  .trigger{position:relative}.popover{position:absolute;inset-block-start:calc(100% + .5rem);inset-inline-end:0;min-inline-size:12rem;background:#fff;border:1px solid}
  @media (max-width:30rem){.popover{inset-inline:0 auto;max-inline-size:calc(100vw - 2rem)}}
</style>`,
      `桌面浮层从触发器下方靠右对齐，窄屏贴左并限制在视口减 32px 的范围内。
边界：固定 left:999px 或固定宽度会让浮层在右侧、缩放和 RTL 下越界。`,
    ),
    cssExample(
      '让 dialog 的视觉模态与行为模态一致',
      'HTML + CSS + JavaScript',
      `<dialog id="confirm" aria-labelledby="title"><h2 id="title">确认删除</h2><button>取消</button><button>删除</button></dialog>
<style>dialog{border:0;border-radius:8px;padding:1.5rem}dialog::backdrop{background:#10182888}</style>
<script>confirm.showModal();console.log(dialog.open);</script>`,
      `showModal 把 dialog 放入顶层、显示 backdrop、限制背景交互并管理 Escape/焦点。
边界：普通 div 加 backdrop 只看起来像模态，背景仍可 Tab 和点击。`,
    ),
    cssExample(
      '菜单视觉正确但键盘模式仍需完整',
      'HTML + JavaScript',
      `<button id="menu-button" aria-haspopup="menu" aria-expanded="false">操作</button><ul id="menu" role="menu" hidden><li role="none"><button role="menuitem">编辑</button></li><li role="none"><button role="menuitem">删除</button></li></ul>
<script>menu-button.onclick=()=>{const open=menu-button.getAttribute('aria-expanded')!=='true';menu-button.setAttribute('aria-expanded',String(open));menu.hidden=!open};</script>`,
      `按钮暴露 haspopup=menu 与 expanded 状态；完整实现还需 ArrowDown/Up、Home/End、Escape 和焦点返回。
边界：CSS hover 展开菜单不能替代键盘和触摸操作，也不应依赖悬停保持打开。`,
    ),
    cssExample(
      '为浮层准备裁切、滚动和失败回退矩阵',
      'JSON',
      `[
  {"case":"parent-overflow-hidden","expected":"top layer remains visible"},
  {"case":"short-viewport","expected":"menu scrolls and first option visible"},
  {"case":"rtl","expected":"aligns to inline-start without crossing viewport"},
  {"case":"no-popover","expected":"inline panel remains reachable"}
]
`,
      `四种状态分别检查顶层、短视口、RTL 与不支持 popover 的回退，浮层不能只测桌面打开态。
边界：没有可见降级形态时，第三方组件加载失败会把设置入口完全藏掉。`,
    ),
  ],
  [
    cssExample(
      '先用层控制供应商样式权重',
      'CSS',
      `@layer vendor, components, overrides;
@layer vendor { .widget { color:#101828; background:#f2f4f7; } }
@layer components { .widget { background:#fff; } }
@layer overrides { .widget { border:1px solid #d0d5dd; } }`,
      `供应商规则位于最早层，组件默认态与业务覆盖按层序生效，不再依靠不断加长选择器。
边界：未分层规则会高于全部已分层规则，迁移时要把现有样式逐步纳入层架构。`,
    ),
    cssExample(
      '用变量桥接第三方公开配置',
      'CSS + JavaScript',
      `<div class="vendor-card">客户案例</div><style>.vendor-card{--card-bg:#f9fafb;--card-fg:#101828;background:var(--card-bg);color:var(--card-fg);padding:1rem}</style>
<script>const s=getComputedStyle(document.querySelector('.vendor-card'));console.log({background:s.backgroundColor,color:s.color});</script>`,
      `宿主通过 --card-bg 与 --card-fg 连接供应商公开变量，无需覆盖内部 .vendor-card__body div。
边界：变量名若没有出现在供应商文档中，升级版本后仍可能被删除或改变语义。`,
    ),
    cssExample(
      '标记需要迁移的结构性覆盖',
      'CSS',
      `@layer vendor, overrides;
@layer vendor { .vendor-modal .vendor-modal__body > div:first-child { padding:12px; } }
@layer overrides {
  /* migration:vendor-modal-v5 */
  .vendor-modal .vendor-modal__body > div:first-child { padding:16px; }
}`,
      `脆弱的选择器路径有明确迁移版本标记，升级到 v5 时可搜索并重新验证是否仍命中。
边界：匿名深层覆盖会在供应商 DOM 变化后静默失效，且没有负责人或删除条件。`,
    ),
    cssExample(
      '在 Shadow DOM 与普通覆盖间做取舍',
      'CSS + JavaScript',
      `<div id="host"></div><style>#host{display:block}</style>
<script>
  const root=host.attachShadow({mode:'open'});
  root.innerHTML='<style>:host{--accent:#175cd3}.button{background:var(--accent);color:#fff}</style><button class="button">支付</button>';
  console.log({shadow:Boolean(root),accent:getComputedStyle(host).getPropertyValue('--accent')});
</script>`,
      `组件通过 :host 暴露 --accent 接口，宿主可设置变量但普通 .button 规则无法穿透。
边界：强隔离提高稳定性也限制快速修补，组件需要明确 part、变量或属性接口。`,
    ),
    cssExample(
      '盘点供应商覆盖的公开接口与风险',
      'JSON',
      `{
  "vendor":"chart-widget@3.4.1",
  "public":["--chart-bg","data-theme","part=legend"],
  "private":["div:nth-child(2)","span.css-1x2y"],
  "migration":"remove private overrides before v4",
  "owner":"frontend-platform"
}
`,
      `公开变量、属性和 part 与私有 DOM 选择器分开登记，v4 前必须移除脆弱覆盖。
边界：只记录 CSS 文件而没有供应商版本与负责人，升级时无法判断哪些覆盖安全。`,
    ),
  ],
  [
    cssExample(
      '状态矩阵从公开组件接口出发',
      'JSON',
      `{
  "component":"button",
  "size":["sm","md","lg"],
  "tone":["primary","danger","quiet"],
  "state":["default","hover","focus","disabled"],
  "required":["primary/default","danger/focus","quiet/disabled"]
}
`,
      `截图矩阵从 size、tone、state 三个公开维度生成，必测组合覆盖默认、焦点与禁用。
边界：为每个内部 CSS 类截图会制造噪声，却遗漏用户真正可能进入的状态组合。`,
    ),
    cssExample(
      '用真实触发路径进入悬停与焦点状态',
      'CSS + JavaScript',
      `<button id="pay">立即支付</button><style>#pay{padding:12px 16px;background:#175cd3;color:#fff}#pay:hover{background:#1849a9}#pay:focus-visible{outline:3px solid #f79009}</style>
<script>pay.focus();console.log({focusVisible:pay.matches(':focus-visible'),outline:getComputedStyle(pay).outlineColor});</script>`,
      `脚本调用 focus 后 focus-visible 命中，轮廓色为 #f79009；悬停截图则必须由指针真实触发。
边界：直接给测试 DOM 添加 :hover 类不会改变伪类匹配，状态截图必须走真实事件。`,
    ),
    cssExample(
      '稳定动画又保留动画覆盖',
      'CSS',
  `.spinner { animation:spin .8s linear infinite; }
@keyframes spin { to { rotate:1turn; } }
@media (prefers-reduced-motion: reduce) {
  .spinner { animation:none; }
  .spinner::after { content:"处理中"; }
}`,
      `普通模式旋转提示持续处理中，减少动态模式停止旋转并显示文字，视觉回归可分别固定状态。
边界：截图工具若等待动画自然结束会永远超时，需暂停动画但不要删除用户可见反馈。`,
    ),
    cssExample(
      '像素差与几何断言一起检查',
      'JavaScript',
      `const geometry = {
  button: { width:44, height:44 },
  focusRing: { width:3, offset:3 },
  rowGap: 12
};
const pixelDiff = { ratio:0.002, changedPixels:24 };
console.table({ geometry, pixelDiff, decision: pixelDiff.ratio < 0.01 ? 'review-small-diff' : 'fail' });
console.log(geometry.rowGap === 12 ? 'geometry-pass' : 'geometry-fail');`,
      `像素差 0.2% 进入人工复核，按钮 44×44、焦点 3px、行距 12px 的几何断言直接通过。
边界：像素 diff 可发现颜色偏移，但可能漏掉语义顺序或把轻微抗锯齿误判为布局回归。`,
    ),
    cssExample(
      '基线更新必须保留审查记录',
      'JSON',
      `{
  "component":"dialog",
  "change":"focus ring offset 2px -> 3px",
  "reason":"ring touched rounded border in Safari",
  "approvedBy":"design-system-review",
  "screenshots":["dialog-focus-chromium.png","dialog-focus-safari.png"],
  "release":"2026.11.24.6"
}
`,
      `基线变更记录说明 2px 到 3px 的原因、审批、浏览器截图与发布版本，未来可追溯。
边界：测试命令自动覆盖旧基线而没有 diff 与审批，会把真实回归直接固化成新标准。`,
    ),
  ],
];

const CSS3_C5_EXAMPLES: CssStageExamples = [
  [
    cssExample(
      '用复杂选择器和 DOM 范围测样式重算',
      'CSS + JavaScript',
      `<section class="catalog"><article class="card"><h2>订单</h2><p>详情</p></article></section>
<style>
  .catalog .card h2 + p { color:#475467; }
  [data-state="selected"] .card { border:2px solid #175cd3; }
</style>
<script>const t=performance.now();document.querySelector('.card').dataset.state='selected';console.log({nodes:document.querySelectorAll('*').length,changedInMs:performance.now()-t});</script>`,
      `切换单个组件状态时只改变小范围样式，Performance 轨迹中的 Recalc Style 节点数量与 DOM 范围可对应。
边界：选择器长度本身不是唯一成本，批量切 class、DOM 过大和无效属性同样会扩大样式计算。`,
    ),
    cssExample(
      '观察 width 变化触发布局重排',
      'CSS + JavaScript',
      `<div class="panel">面板</div><style>.panel{inline-size:240px;transition:inline-size .25s;border:1px solid}.panel.wide{inline-size:360px}</style>
<script>panel.classList.add('wide');console.log({width:panel.getBoundingClientRect().width,animating:panel.getAnimations().length});</script>`,
      `inline-size 从 240px 过渡到 360px 时浏览器持续重排面板与相邻内容，周边元素位置随之变化。
边界：改变几何属性无法只靠合成层免费完成，需要评估是否真的适合动画。`,
    ),
    cssExample(
      '比较 opacity 与 box-shadow 绘制成本',
      'CSS + JavaScript',
      `<div class="fx" id="fx">浮层</div><style>.fx{opacity:1;box-shadow:0 12px 32px #10182824;transition:opacity .2s,box-shadow .2s}.fx.hide{opacity:0;box-shadow:none}</style>
<script>fx.classList.add('hide');console.log({opacity:getComputedStyle(fx).opacity,shadow:getComputedStyle(fx).boxShadow});</script>`,
      `opacity 过渡通常可由合成阶段处理，box-shadow 变化则需要重新绘制阴影，轨迹中的 Paint 成本不同。
边界：合成快也占用 GPU 内存，超大图层或过多层会让移动设备掉帧。`,
    ),
    cssExample(
      '用 containment 限制样式与布局影响范围',
      'CSS + JavaScript',
      `<section class="widget"><h2>独立组件</h2><p>内容</p></section>
<style>
  .widget { contain:layout paint style; }
  .widget.pulse { background:#eaf2ff; }
</style>
<script>const w=document.querySelector('.widget');console.log({contain:getComputedStyle(w).contain,display:getComputedStyle(w).display});</script>`,
      `contain:layout paint style 把组件布局、绘制与样式影响限制在自身范围，切换背景只重绘组件。
边界：contain 会改变尺寸与包含块语义，粘性、绝对定位和溢出可能因此失效。`,
    ),
    cssExample(
      '用轨迹证明优化前后收益',
      'PowerShell',
      `@'
[
  {"label":"before","scriptingMs":26,"styleMs":18,"layoutMs":34,"paintMs":22},
  {"label":"after","scriptingMs":24,"styleMs":9,"layoutMs":10,"paintMs":18}
]
'@ | Set-Content artifacts/css-trace.json
node -e "const rows=require('./artifacts/css-trace.json'); console.table(rows); const before=rows[0],after=rows[1]; if(after.layoutMs>=before.layoutMs) process.exit(1)"`,
      `before layoutMs 34、after layoutMs 10，优化后记录通过门槛；style 与 paint 也分别下降。
边界：只看 Lighthouse 总分或单次录制无法说明是 selectors、layout 还是 paint 的收益。`,
    ),
  ],
  [
    cssExample(
      '用覆盖率找出首屏未使用 CSS',
      'CSS + JavaScript',
      `const rules = [...document.styleSheets].flatMap((sheet) => {
  try { return [...sheet.cssRules].map((rule) => rule.cssText); } catch { return []; }
});
const used = rules.filter((rule) => document.querySelector(rule.split('{')[0] || 'body'));
console.log({ rules:rules.length, matchedSelectors:used.length, ratio:(used.length/rules.length).toFixed(2) });
/* DevTools Coverage 可继续区分“首屏未用”与“交互后仍需要”。 */`,
      `规则总数与当前页面可匹配选择器数量一并输出，devtools Coverage 可进一步给出未使用字节。
边界：未使用不等于可删除，弹窗、错误态和后续路由状态可能暂时不出现。`,
    ),
    cssExample(
      '按稳定性拆分基础、组件和页面样式',
      'CSS + JavaScript',
      `<link rel="stylesheet" href="/assets/tokens.4d91c2.css">
<link rel="stylesheet" href="/assets/base.4d91c2.css">
<link rel="stylesheet" href="/assets/components.4d91c2.css">
<link rel="stylesheet" href="/assets/checkout.7a21e9.css">
<script>console.log([...document.styleSheets].map(s=>s.href));</script>`,
      `令牌、基础与组件边界稳定，结算页专属样式独立指纹；其他页面不会下载 checkout 规则。
边界：每个小组件都拆一个请求会放大网络开销，拆分应服务失效边界与请求数量。`,
    ),
    cssExample(
      '异步样式加载时保留可读的默认态',
      'HTML + CSS',
      `<link rel="stylesheet" href="/assets/hero.7a21e9.css" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="/assets/hero.7a21e9.css"></noscript>
<main class="hero"><h1>企业数据平台</h1><p>首屏文字不依赖样式加载。</p></main>`,
      `异步样式不阻塞初始绘制，脚本启用后应用 hero.css；禁用脚本时 noscript 样式仍能加载。
边界：异步样式会带来无样式或旧样式瞬间，需要关键布局内联或避免不可接受的闪变。`,
    ),
    cssExample(
      '压缩后验证层叠语义未改变',
      'PowerShell',
      `pnpm exec lightningcss --minify --bundle --targets ">= 0.25%" src/app.css -o dist/app.css
$sourceRules = (Select-String src/app.css -Pattern '@layer|@media|:where' -AllMatches).Matches.Count
$builtRules = (Select-String dist/app.css -Pattern '@layer|@media|:where' -AllMatches).Matches.Count
[pscustomobject]@{source=$sourceRules;minified=$builtRules;bytes=(Get-Item dist/app.css).Length} | ConvertTo-Json`,
      `压缩前后 layer/media/where 关键结构均可检索，产物体积明显下降且选择器没有被无序合并。
边界：只比较 gzip 体积不能证明层序、fallback 或 calc 表达式保持正确。`,
    ),
    cssExample(
      '把首屏 CSS 体积变成 CI 发布预算',
      'JavaScript',
      `const budgetKb = 70;
const assets = [
  { file:"tokens.css", bytes:6200 },
  { file:"base.css", bytes:18400 },
  { file:"components.css", bytes:42800 }
];
const totalKb = assets.reduce((sum,item)=>sum+item.bytes,0)/1024;
console.table({ assets, totalKb, budgetKb, pass: totalKb <= budgetKb });`,
      `三份首屏 CSS 共约 65.8KB，低于 70KB 预算；CI 可在超限时阻塞合入并输出最大贡献文件。
边界：预算必须绑定页面模板与压缩方式，否则全站一个总数字无法定位回退。`,
    ),
  ],
  [
    cssExample(
      '从可验证错误开始配置 Stylelint',
      'JSON',
      `{
  "extends":["stylelint-config-standard"],
  "rules":{
    "declaration-block-no-duplicate-properties":true,
    "no-duplicate-selectors":true,
    "selector-pseudo-element-no-unknown":true,
    "color-no-invalid-hex":true
  }
}
`,
      `重复属性、重复选择器、未知伪元素和非法颜色会稳定失败，都是一眼可判且自动可修的结构错误。
边界：风格规则过多会淹没真正的可访问性与布局问题，治理规则应服务可见缺陷。`,
    ),
    cssExample(
      '分开检查与自动修复命令',
      'PowerShell',
      `pnpm exec stylelint "src/**/*.css" --max-warnings 0
Write-Output "check=$LASTEXITCODE"
pnpm exec stylelint "src/**/*.css" --fix
Get-ChildItem src -Recurse -Filter *.css | Get-FileHash | Select-Object -First 3`,
      `CI 只执行 --max-warnings 0 检查；开发者本地才用 --fix，并在修复后比较文件哈希与 diff。
边界：CI 自动修复会修改工作区但不验证提交，容易让门禁看似通过却留下未提交变更。`,
    ),
    cssExample(
      '让 Token 源文件保持单一真相',
      'JSON + CSS',
      `{
  "color": {"action":{"$value":"#175cd3","$type":"color"}},
  "space": {"3":{"$value":"0.75rem","$type":"dimension"}}
}
/* 生成产物 */
:root { --color-action:#175cd3; --space-3:.75rem; }`,
      `设计 Token JSON 保存原始值，CSS 变量由构建脚本生成；生成文件头应标记只读并校验哈希。
边界：设计师与开发者各改一份生成文件，下一次构建就会覆盖手工值或产生不可追踪差异。`,
    ),
    cssExample(
      '让构建目标同时服务层叠与语法降级',
      'JSON',
      `{
  "targets":{"chrome":108,"firefox":110,"safari":16.4},
  "cssModules":true,
  "minify":true,
  "sourceMap":true,
  "features":{"nesting":"preserve-if-supported","layer":"preserve"}
}
`,
      `构建目标明确支持层与基础嵌套，压缩与 source map 同时开启，降级策略不会误删组间顺序。
边界：只写“支持主流浏览器”无法让工具决定 @layer、color-mix 或新函数的转换与回退。`,
    ),
    cssExample(
      '固定输入重复生成并比较产物哈希',
      'PowerShell',
      `pnpm exec node scripts/build-css.mjs
$first=(Get-FileHash dist/app.css -Algorithm SHA256).Hash
pnpm exec node scripts/build-css.mjs
$second=(Get-FileHash dist/app.css -Algorithm SHA256).Hash
pnpm exec stylelint "dist/**/*.css" --max-warnings 0
[pscustomobject]@{sameHash=$first -eq $second;hash=$first;lint=$LASTEXITCODE} | ConvertTo-Json`,
      `{"sameHash":true,"hash":"A21F...8C6D","lint":0}
同一源码与锁文件重复构建得到相同哈希，随后才检查产物语法，门禁顺序可复现。
边界：生成器写入时间戳或依赖版本漂移会让产物不可比较，应先固定输入再谈视觉通过。`,
    ),
  ],
  [
    cssExample(
      '按风险选择视觉回归矩阵',
      'JSON',
      `[
  {"page":"checkout","viewport":"390x844","state":"error","risk":"payment"},
  {"page":"pricing","viewport":"1440x900","state":"hover","risk":"conversion"},
  {"page":"docs","viewport":"320x568","state":"focus","risk":"keyboard"},
  {"page":"admin","viewport":"768x1024","state":"loading","risk":"overflow"}
]
`,
      `矩阵围绕支付错误、价格转化、键盘焦点和后台加载选择页面/视口/状态，而不是盲测所有组合。
边界：只截首页桌面默认态无法覆盖高风险业务流程和边界宽度。`,
    ),
    cssExample(
      '固定字体与数据夹具消除不确定性',
      'JSON',
      `{
  "font":"Noto Sans SC",
  "fontSource":"local-fixture",
  "data":"fixtures/checkout-long-customer.json",
  "locale":"zh-CN",
  "timezone":"Asia/Shanghai",
  "animations":"disabled",
  "clock":"2026-11-24T10:00:00+08:00"
}
`,
      `字体、数据、语言、时区、动画和时钟全部固定，截图差异可归因于样式或结构改动。
边界：依赖系统字体和随机金额时，每次运行都可能因字形、换行和数字宽度不同而误报。`,
    ),
    cssExample(
      '截图交互状态时走真实触发路径',
      'CSS + JavaScript',
      `<button id="buy">立即购买</button><style>#buy{padding:12px 20px;background:#175cd3;color:#fff}#buy:hover{background:#1849a9}#buy:focus-visible{outline:3px solid #f79009}</style>
<script>buy.focus();console.log({focusVisible:buy.matches(':focus-visible'),background:getComputedStyle(buy).backgroundColor});</script>`,
      `焦点截图通过 focus() 进入真实 :focus-visible，悬停截图由测试框架 hover，状态不是伪造类名。
边界：手动添加 .hover 类不会触发伪类，截图可能看起来正确但实际用户路径不可复现。`,
    ),
    cssExample(
      '像素差异之外记录关键几何断言',
      'JavaScript',
      `const layout = {
  toolbar: { width:390, height:56 },
  saveButton: { width:48, height:48 },
  pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
};
const pixelRatio = 0.0031;
console.table({ layout, pixelRatio, verdict: layout.pageOverflow === 0 && layout.saveButton.height >= 48 ? 'pass' : 'fail' });`,
      `toolbar 高度 56、保存按钮 48×48、页面溢出 0，像素差 0.31% 同时进入人工复核。
边界：只看截图相似度无法判断按钮命中区域、页面横向溢出或浮层是否被裁切。`,
    ),
    cssExample(
      '基线更新保留 diff、原因与审批',
      'PowerShell',
      `$record = [ordered]@{
  component='pricing-card'
  viewport='390x844'
  changed='badge line-height 18px -> 20px'
  reason='two-line Chinese badge no longer clipping'
  approved='design-review-184'
  build='2026.11.24.7'
}
$record | ConvertTo-Json | Set-Content artifacts/visual-baseline-change.json
pnpm exec playwright test tests/visual/pricing.spec.ts --update-snapshots`,
      `基线更新前保存组件、视口、变更、原因、审批与构建版本，随后才生成新截图。
边界：测试失败就盲目 --update-snapshots 会把真实回归变成新的“正确”基线。`,
    ),
  ],
  [
    cssExample(
      '列出组件库样式公共接口',
      'JSON',
      `{
  "component":"button",
  "public":{"attributes":["data-size","data-tone","aria-pressed"],"variables":["--button-bg","--button-fg"]},
  "private":{"selectors":["button > span","button::after"]},
  "deprecated":{"class":".button--old","removeIn":"v5"}
}
`,
      `属性、变量、私有选择器与弃用接口分别登记，消费者知道什么可覆盖、什么会随 DOM 改动。
边界：没有公共接口清单时，所有内部选择器都会被消费者当成契约，升级成本不可控。`,
    ),
    cssExample(
      '把浏览器支持写成构建目标',
      'JSON',
      `{
  "browserslist":[
    "Chrome >= 108",
    "Firefox >= 110",
    "Safari >= 16.4",
    "not dead"
  ],
  "cssFeatures":{
    "nesting":"progressive",
    "containerQueries":"supports-block",
    "oklch":"fallback-palette"
  }
}
`,
      `构建器能读取明确版本范围，嵌套、容器查询与 OKLCH 各自声明增强或回退策略。
边界：支持矩阵若只存在于产品文档，PostCSS、Stylelint 和视觉测试无法据此执行。`,
    ),
    cssExample(
      '用 supports 与基础布局渐进增强',
      'CSS + JavaScript',
      `<div class="cards"><article>A</article><article>B</article></div>
<style>
  .cards{display:grid;gap:1rem}
  @supports (grid-template-columns:subgrid){.cards{grid-template-columns:repeat(2,1fr)}}
</style>
<script>console.log({display:getComputedStyle(document.querySelector('.cards')).display,columns:getComputedStyle(document.querySelector('.cards')).gridTemplateColumns});</script>`,
      `所有浏览器得到可读单列 Grid；支持增强特性的浏览器再切两列，核心内容从未依赖增强样式。
边界：基础布局若只在 supports 内定义，不支持时页面会退回普通块流甚至重叠。`,
    ),
    cssExample(
      '为弃用类提供可观察的迁移别名',
      'CSS',
  `@layer components, compatibility;
@layer components { .button { padding:12px 16px; background:var(--button-bg,#175cd3); } }
@layer compatibility { .button--old { --button-bg:#475467; outline:1px dashed transparent; } }
/* 扫描 .button--old 使用量，v5 前迁移到 data-size/data-tone。 */`,
      `旧类通过兼容层映射到新变量，仍可观察使用量，不会与组件基础层抢权重。
边界：兼容别名若永久存在且无人统计，会变成第二套无法删除的公共 API。`,
    ),
    cssExample(
      '发布与回滚都包含 CSS 指纹和公共接口',
      'JSON',
      `{
  "release":"2026.11.24.8",
  "artifacts":{"css":"components.7a21e9.css","tokens":"tokens.4d91c2.css"},
  "interfaces":{"button":"v4","dialog":"v3"},
  "rollback":{"artifacts":"previous-manifest.json","smoke":["pricing","checkout","docs"]}
}
`,
      `发布清单同时固定 CSS 指纹、组件接口版本和回滚产物，回滚后按三个关键页面做冒烟。
边界：只回滚 JavaScript 而保留新 CSS，样式接口与 DOM 可能形成不兼容组合。`,
    ),
  ],
  [
    cssExample(
      '冻结范围与完整验收矩阵',
      'JSON',
      `{
  "pages":["dashboard","orders","settings"],
  "components":["button","table","dialog","toast"],
  "viewports":["320x568","390x844","768x1024","1440x900"],
  "states":["default","loading","error","focus","disabled"],
  "outOfScope":["marketing-site"]
}
`,
      `毕业项目范围限定三页、四组件、四视口、五状态，营销站明确排除，验收组合可枚举。
边界：范围写成“做一套后台”无法判断何时完成，也无法为每个状态分配证据。`,
    ),
    cssExample(
      '先固定 Token 与层叠架构',
      'CSS',
      `@layer reset, tokens, base, components, utilities;
@layer tokens {
  :root{--color-action:#175cd3;--space-3:.75rem;--radius-sm:6px}
  [data-theme="dark"]{--color-action:#84adff;--surface:#101828;--text:#f2f4f7}
}
@layer components {.button{background:var(--color-action);padding:var(--space-3);border-radius:var(--radius-sm)}}
@layer utilities {.visually-hidden{position:absolute;clip-path:inset(50%)}}`,
      `设计系统先冻结五层、语义 Token、组件变量与唯一工具类，页面与组件不再各自定义覆盖顺序。
边界：直接开始写页面样式再倒推 Token，会让层序、主题和组件接口互相追赶。`,
    ),
    cssExample(
      '壳层、组件和状态一起验收',
      'CSS + JavaScript',
      `<div class="shell"><aside>导航</aside><main><button id="save">保存</button><div class="table">订单表格</div></main></div>
<style>
  .shell{display:grid;grid-template-columns:220px minmax(0,1fr);min-block-size:100vh}
  .table{overflow:auto;max-inline-size:100%}
  button:focus-visible{outline:3px solid #175cd3;outline-offset:3px}
</style>
<script>save.focus();console.log({focus:save.matches(':focus-visible'),pageOverflow:document.documentElement.scrollWidth-innerWidth});</script>`,
      `壳层在 1440px 保持侧栏，390px 断点转单列；保存按钮焦点可见，表格局部滚动，页面溢出为 0。
边界：单独验证按钮和表格组件不能证明它们在真实壳层中仍不溢出或不被遮挡。`,
    ),
    cssExample(
      '把可访问与性能要求变成自动门禁',
      'JSON',
      `{
  "checks":[
    {"name":"stylelint","command":"stylelint src/**/*.css --max-warnings 0"},
    {"name":"a11y","command":"playwright test tests/a11y.spec.ts"},
    {"name":"visual","command":"playwright test tests/visual.spec.ts"},
    {"name":"cssBudget","command":"node scripts/css-budget.mjs --max-kb 70"}
  ],
  "blocking":true
}
`,
      `Stylelint、可访问性、视觉回归与 CSS 体积四个门禁全部阻塞发布，失败会保留命令与产物。
边界：门禁只存在于口头流程或允许 warnings 通过，无法阻止下一次样式回退。`,
    ),
    cssExample(
      '从空环境重放、升级、回滚和交接',
      'PowerShell',
      `pnpm install --frozen-lockfile
pnpm build
pnpm exec playwright test tests/a11y.spec.ts tests/visual.spec.ts
Copy-Item artifacts/previous-manifest.json artifacts/current-manifest.json
@'
{"handover":["add settings page","replace action token","rollback dialog CSS"],"owner":"frontend-platform"}
'@ | Set-Content artifacts/design-system-handover.json`,
      `另一位学习者能从空环境安装构建，跑完 a11y 与视觉回归，再按交接清单新增页面、替换 Token 并回滚。
边界：只有作者机器能构建或回滚只覆盖单个文件，说明设计系统尚未真正交付。`,
    ),
  ],
];

export const HANDWRITTEN_CSS3_C0_COURSES = withCssExamples(HANDWRITTEN_CSS3_C0_BASE, CSS3_C0_EXAMPLES);
export const HANDWRITTEN_CSS3_C1_COURSES = withCssExamples(HANDWRITTEN_CSS3_C1_BASE, CSS3_C1_EXAMPLES);
export const HANDWRITTEN_CSS3_C2_COURSES = withCssExamples(HANDWRITTEN_CSS3_C2_BASE, CSS3_C2_EXAMPLES);
export const HANDWRITTEN_CSS3_C3_COURSES = withCssExamples(HANDWRITTEN_CSS3_C3_BASE, CSS3_C3_EXAMPLES);
export const HANDWRITTEN_CSS3_C4_COURSES = withCssExamples(HANDWRITTEN_CSS3_C4_BASE, CSS3_C4_EXAMPLES);
export const HANDWRITTEN_CSS3_C5_COURSES = withCssExamples(HANDWRITTEN_CSS3_C5_BASE, CSS3_C5_EXAMPLES);
