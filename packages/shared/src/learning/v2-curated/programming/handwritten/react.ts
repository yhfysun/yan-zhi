// React 课程包手写教案。课程名必须与 programs.ts 中的详细阶段和 lesson.courseName 完全一致。
import type { ProgrammingCourseSeed, ProgrammingStepSeed } from '../shared.js';
import type { LearningV2LessonExample } from '../../../v2-types.js';

const track = 'P14 · 独立语言课程' as const;

type ReactCourseInput = Omit<
  ProgrammingCourseSeed,
  'name' | 'track' | 'contentStatus' | 'steps'
> & {
  readonly steps: readonly ProgrammingStepSeed[];
};

const reactName = (stage: string, topic: string) => `React · ${stage}：${topic}`;

const reactExamples: Record<string, readonly LearningV2LessonExample[]> = {};

const reactExample = (
  title: string,
  language: string,
  code: string,
  output: string,
): LearningV2LessonExample => ({ title, language, code, output });

function reactCourse(
  stage: string,
  topic: string,
  input: ReactCourseInput,
): ProgrammingCourseSeed {
  const name = reactName(stage, topic);
  return {
    name,
    track,
    ...input,
    contentStatus: 'reviewed',
    steps: input.steps.map(([title, body, note], index) => [
      title,
      index === 0 ? `${name}。${body}` : body,
      note,
      ...(reactExamples[topic]?.[index]
        ? [reactExamples[topic][index]]
        : []),
    ] as unknown as ProgrammingStepSeed),
  };
}

const reactDocs = 'React Documentation. https://react.dev/reference/react';
const reactLearn = 'React Learn. https://react.dev/learn';
const reactSource = 'React source. https://github.com/facebook/react';
const viteGuide = 'Vite Guide. https://vite.dev/guide/';
const reactRouterDocs = 'React Router Documentation. https://reactrouter.com/';
const queryDocs = 'TanStack Query Documentation. https://tanstack.com/query/latest/docs/framework/react/overview';
const nextDocs = 'Next.js Documentation. https://nextjs.org/docs';
const testingLibraryDocs = 'React Testing Library. https://testing-library.com/docs/react-testing-library/intro/';
const vitestDocs = 'Vitest Documentation. https://vitest.dev/guide/';
const playwrightDocs = 'Playwright Documentation. https://playwright.dev/docs/intro';
const webVitalsDocs = 'Web Vitals. https://web.dev/articles/vitals';
const axeDocs = 'axe-core. https://github.com/dequelabs/axe-core';

Object.assign(reactExamples, {
  'React 渲染模型与声明式 UI': [
    reactExample(
      '计数按钮：状态驱动重新渲染',
      'TSX + Vitest',
      `// src/Counter.tsx
import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(value => value + 1)}>计数：{count}</button>;
}

// 验证命令
// pnpm vitest run src/Counter.test.tsx`,
      `按钮初始文本为“计数：0”，点击一次后变为“计数：1”。
失败边界：直接修改局部 count 变量不会触发提交，组件文本保持不变。`,
    ),
    reactExample(
      'createRoot 单根挂载检查',
      'TSX + Browser Console',
      `// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const host = document.getElementById('root');
if (!host) throw new Error('缺少 #root');
createRoot(host).render(<StrictMode><App /></StrictMode>);

// 检查命令：在页面控制台执行
document.querySelectorAll('#root > *').length`,
      `挂载后控制台返回 1，react DevTools 只有一个 HostRoot 应用容器。
失败边界：把 id 改成不存在的节点会抛出“缺少 #root”，不能静默创建第二个根。`,
    ),
    reactExample(
      '纯 render 与提交后副作用对照',
      'TSX + Vitest',
      `// src/Profile.tsx
import { useEffect, useState } from 'react';

let renderCount = 0;
export function Profile() {
  const [name, setName] = useState('Ada');
  renderCount += 1;
  useEffect(() => {
    document.title = '用户：' + name;
  }, [name]);
  return <button onClick={() => setName('Lin')}>用户：{name}</button>;
}

// pnpm vitest run src/Profile.test.tsx`,
      `首次提交后 document.title 为“用户：Ada”，点击后变为“用户：Lin”。
失败边界：把 setItem 或 fetch 写进 render，StrictMode 重复执行会制造重复外部写入。`,
    ),
    reactExample(
      '稳定 key 让行状态跟随实体',
      'TSX + Vitest',
      `// src/EditorList.tsx
import { useState } from 'react';
type Row = { id: string; label: string };

function Editor({ row }: { row: Row }) {
  const [draft, setDraft] = useState('');
  return <label>{row.label}<input value={draft} onChange={e => setDraft(e.target.value)} /></label>;
}

export function EditorList({ rows }: { rows: Row[] }) {
  return <>{rows.map(row => <Editor key={row.id} row={row} />)}</>;
}

// pnpm vitest run src/EditorList.test.tsx`,
      `在 A 行输入草稿后交换 rows 顺序，草稿仍停留在 A 行。
失败边界：使用 index 作为 key 时，草稿会跟着位置跳到 B 行，说明身份错位。`,
    ),
    reactExample(
      'useLayoutEffect 在绘制前测量节点',
      'TSX + Browser Performance',
      `// src/Measure.tsx
import { useLayoutEffect, useRef, useState } from 'react';

export function Measure() {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    setWidth(box.current?.getBoundingClientRect().width ?? 0);
  }, []);
  return <div ref={box}>宽度：{Math.round(width)}px</div>;
}

// 打开 DevTools Performance 录制首帧`,
      `DOM 提交后布局阶段读取到真实宽度，页面在首次绘制前显示测量值。
失败边界：在 render 中读 ref.current 会得到 null 或旧节点，布局没有完成。`,
    ),
  ],
  '从空目录创建入口和组件': [
    reactExample(
      'index.html 只装载 Vite 模块',
      'HTML + PowerShell',
      `@'
<!doctype html>
<html lang="zh-CN">
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
'@ | Set-Content index.html
pnpm dev
Invoke-WebRequest http://localhost:5173/src/main.tsx | Select-Object StatusCode,Headers`,
      `开发服务器返回 200，main.tsx 响应内容为 Vite 转换后的 JavaScript。
失败边界：把 script 路径写成 /src/main.js 时 Network 返回 404，React 不会挂载。`,
    ),
    reactExample(
      '入口缺少根节点时快速失败',
      'TSX + PowerShell',
      `// src/main.tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';

const host = document.getElementById('root');
if (!(host instanceof HTMLElement)) {
  throw new Error('缺少挂载节点 #root');
}
createRoot(host).render(<App />);

// 验证：pnpm dev 后打开浏览器控制台`,
      `正常页面显示 App，控制台无警告；删除 index.html 的 #root 后立即报“缺少挂载节点 #root”。
失败边界：使用 host! 会绕过空值检查，错误堆栈更晚出现且难以定位入口。`,
    ),
    reactExample(
      '组件模块可被 Vitest 独立导入',
      'TSX + PowerShell',
      `// src/CourseCard.tsx
type Props = { title: string; progress: number };
export function CourseCard({ title, progress }: Props) {
  return <article><h2>{title}</h2><progress max="100" value={progress} /></article>;
}

// src/CourseCard.test.tsx
import { render, screen } from '@testing-library/react';
import { CourseCard } from './CourseCard';

test('显示课程进度', () => {
  render(<CourseCard title="React 路由" progress={60} />);
  expect(screen.getByRole('heading', { name: 'React 路由' })).toBeVisible();
});
// pnpm vitest run src/CourseCard.test.tsx`,
      `Vitest 输出 1 passed，导入组件时没有额外网络请求或全局 DOM 写入。
失败边界：在模块顶层执行 fetch 会让测试启动即访问网络，组件无法独立验证。`,
    ),
    reactExample(
      '开发服务器与生产构建分开验收',
      'PowerShell',
      `pnpm create vite react-empty --template react-ts
Set-Location react-empty
pnpm install
pnpm dev --host 127.0.0.1
pnpm build
pnpm preview --host 127.0.0.1
Get-ChildItem dist -Recurse | Select-Object FullName,Length`,
      `dev 页面可访问后，build 生成 dist/index.html 与 dist/assets 中带哈希资源，preview 再次返回 200。
失败边界：只在 dev 成功时会漏掉大小写 import 错误，生产 build 会直接失败。`,
    ),
    reactExample(
      'sourcemap 定位生产异常',
      'TSX + PowerShell',
      `// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()], build: { sourcemap: true } });

// 构建后在浏览器触发一个按钮异常，再到 Sources 搜索组件名
// pnpm build
// pnpm preview`,
      `dist/assets 出现 .js 与 .js.map，DevTools 堆栈可以跳回 App.tsx 的真实行号。
失败边界：只上传 JS 不上传 map 时，生产堆栈仍停留在压缩代码，无法定位源码。`,
    ),
  ],
  'JSX、表达式和条件渲染': [
    reactExample(
      'JSX 编译为 jsx 调用',
      'TSX + PowerShell',
      `// src/SaveButton.tsx
export function SaveButton() {
  return <button type="button" onClick={() => console.log('saved')}>保存</button>;
}

// Vite 开发服务器请求转换结果
Invoke-WebRequest http://localhost:5173/src/SaveButton.tsx |
  Select-Object -ExpandProperty Content`,
      `响应中出现 jsx("button", ...) 或 jsxs 调用，不再是浏览器无法解析的原始 TSX。
失败边界：在没有 React 插件的普通 script 中运行 TSX，浏览器报 Unexpected token '<'。`,
    ),
    reactExample(
      '表达式格式化价格而非对象',
      'TSX + Vitest',
      `type LineItem = { name: string; cents: number };
const formatPrice = (cents: number) => (cents / 100).toFixed(2) + ' 元';

export function Receipt({ items }: { items: LineItem[] }) {
  return <ul>{items.map(item => <li key={item.name}>{item.name}：{formatPrice(item.cents)}</li>)}</ul>;
}

// pnpm vitest run src/Receipt.test.tsx`,
      `页面显示“咖啡：18.50 元”，DOM 中只有字符串而不是对象。
失败边界：直接写 {items[0]} 会把普通对象作为 child，React 抛出 Objects are not valid as a React child。`,
    ),
    reactExample(
      '零值条件避免渲染 0',
      'TSX + Vitest',
      `type Props = { comments: string[]; loading: boolean };
export function Comments({ comments, loading }: Props) {
  if (loading) return <p>加载中</p>;
  return <section>
    {comments.length > 0
      ? comments.map(text => <p key={text}>{text}</p>)
      : <p>暂无评论</p>}
  </section>;
}

// pnpm vitest run src/Comments.test.tsx`,
      `comments 为空数组时只显示“暂无评论”，页面没有多余的 0。
失败边界：写成 {comments.length && <List />} 会在空数组时把数字 0 渲染出来。`,
    ),
    reactExample(
      'Fragment 保留表格语义',
      'TSX + Vitest',
      `import { Fragment } from 'react';
type Row = { id: string; name: string; score: number };

export function ScoreRows({ rows }: { rows: Row[] }) {
  return <tbody>{rows.map(row => (
    <Fragment key={row.id}>
      <tr><th scope="row">{row.name}</th><td>{row.score}</td></tr>
      <tr><td colSpan={2}>最近更新</td></tr>
    </Fragment>
  ))}</tbody>;
}

// pnpm vitest run src/ScoreRows.test.tsx`,
      `每个实体生成两组 tr，tbody 内没有额外的 div 破坏表格结构。
失败边界：用 div 包裹 tr 会被浏览器重排 DOM，最终查询和样式都不稳定。`,
    ),
    reactExample(
      '订单状态用显式分支渲染',
      'TSX + Vitest',
      `type OrderState = 'loading' | 'error' | 'empty' | 'paid' | 'refunded';

export function OrderPanel({ state }: { state: OrderState }) {
  if (state === 'loading') return <p role="status">加载中</p>;
  if (state === 'error') return <p role="alert">加载失败，请重试</p>;
  if (state === 'empty') return <p>暂无订单</p>;
  if (state === 'paid') return <p>已支付 <button>开发票</button></p>;
  return <p>已退款</p>;
}

// pnpm vitest run src/OrderPanel.test.tsx`,
      `五种 state 各只出现一个状态面板，错误状态可获得 role=alert。
失败边界：用嵌套三元且缺少 empty 分支时，多个提示可能同时出现，用户无法判断结果。`,
    ),
  ],
  '列表、key 与稳定身份': [
    reactExample(
      'map 先过滤再渲染',
      'TSX + Vitest',
      `type Task = { id: string; title: string; done: boolean };
const visible = (tasks: Task[]) => tasks.filter(task => !task.done);

export function TaskList({ tasks }: { tasks: Task[] }) {
  return <ul>{visible(tasks).map(task => (
    <li key={task.id}>{task.title}</li>
  ))}</ul>;
}

// pnpm vitest run src/TaskList.test.tsx`,
      `只渲染未完成任务的稳定 ID 列表，输入数组本身没有被 filter 修改。
失败边界：在 render 中 tasks.sort(...) 会修改父级数组，造成难以追踪的顺序污染。`,
    ),
    reactExample(
      '重复 key 检测为阻断错误',
      'TSX + Vitest',
      `const rows = [
  { id: 'a1', name: 'Alice' },
  { id: 'a1', name: 'Alice 副本' },
];

export function BadRows() {
  return <ul>{rows.map(row => <li key={row.id}>{row.name}</li>)}</ul>;
}
// npm run test -- --run
// 开发模式同时检查 console.error`,
      `React 开发控制台出现 Encountered two children with the same key, a1。
失败边界：消除警告时改成 Math.random() 会让每次 render 都卸载重建列表，输入框焦点丢失。`,
    ),
    reactExample(
      'index key 复现行状态串位',
      'TSX + Vitest',
      `const initial = [{ name: 'A' }, { name: 'B' }];

export function IndexRows() {
  return <>{initial.map((row, index) => (
    <label key={index}>{row.name}<input aria-label={row.name} /></label>
  ))}</>;
}

// 在 A 行输入草稿后删除 A，观察输入值是否跟随 B 行`,
      `删除 A 后，B 行仍显示 A 的未提交草稿，证明状态跟位置而不是实体。
失败边界：若数据永远只追加且有稳定实体 ID，index key 的回归才可限量接受。`,
    ),
    reactExample(
      '删除与排序保持数组快照不可变',
      'TSX + Vitest',
      `type Item = { id: number; title: string };
export const removeById = (items: Item[], id: number) => items.filter(item => item.id !== id);
export const sortById = (items: Item[]) => items.toSorted((a, b) => a.id - b.id);

const before = [{ id: 2, title: 'B' }, { id: 1, title: 'A' }];
const after = sortById(before);
console.assert(before[0].id === 2);
console.assert(after[0].id === 1);

// pnpm vitest run src/items.test.ts`,
      `before 仍保持 B、A 顺序，after 按 A、B 排序，两个数组引用不同。
失败边界：before.sort 原地修改旧快照，撤销操作会读到已经被改变的数组。`,
    ),
    reactExample(
      '长列表先分页再观察 Profiler',
      'TSX + Browser Profiler',
      `type Row = { id: string; label: string };
export function PagedRows({ rows, page }: { rows: Row[]; page: number }) {
  const start = page * 50;
  return <ul>{rows.slice(start, start + 50).map(row => (
    <li key={row.id}>{row.label}</li>
  ))}</ul>;
}

// 在 React DevTools Profiler 中录制翻页
// 对比一次渲染 50 行与一次渲染 5000 行的 commit 时长和 DOM 节点数`,
      `翻页只提交 50 个 li，Profiler 火焰图和 DOM 节点数明显低于全量列表。
失败边界：直接给每行 memo 但仍传新对象，Profiler 显示子行继续重渲染，优化无效。`,
    ),
  ],
  'Props、组合和 children': [
    reactExample(
      '只读 props 通过回调更新父状态',
      'TSX + Vitest',
      `type Course = { id: string; title: string };
type Props = { course: Course; onOpen: (id: string) => void };

export function CourseCard({ course, onOpen }: Props) {
  return <button onClick={() => onOpen(course.id)}>{course.title}</button>;
}

// const onOpen = vi.fn();
// render(<CourseCard course={{ id: 'react', title: 'React' }} onOpen={onOpen} />);
// await user.click(screen.getByRole('button'));
// expect(onOpen).toHaveBeenCalledWith('react');`,
      `点击按钮后回调收到字符串 react，父级对象未被修改。
失败边界：子组件直接执行 course.title = ... 会污染父级快照，生产环境冻结对象时会抛错。`,
    ),
    reactExample(
      'children 作为布局插槽',
      'TSX + Vitest',
      `import type { ReactNode } from 'react';
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section aria-labelledby="panel-title">
    <h2 id="panel-title">{title}</h2>
    <div>{children}</div>
  </section>;
}

// render(<Panel title="统计"><p>今日访问 128 次</p></Panel>);
// expect(screen.getByRole('region', { name: '统计' })).toHaveTextContent('128');`,
      `Panel 内出现标题“统计”和正文“今日访问 128 次”，没有额外业务条件。
失败边界：给 children 假定必须是字符串时，传入多个元素会导致渲染或类型错误。`,
    ),
    reactExample(
      '具名插槽组合页面骨架',
      'TSX + Vitest',
      `import type { ReactNode } from 'react';
type Props = { header: ReactNode; sidebar: ReactNode; children: ReactNode };
export function Layout({ header, sidebar, children }: Props) {
  return <div>
    <header>{header}</header>
    <nav aria-label="侧栏">{sidebar}</nav>
    <main>{children}</main>
  </div>;
}

// render(<Layout header={<h1>订单</h1>} sidebar={<a href="/a">A</a>}>内容</Layout>);
// expect(screen.getByRole('navigation')).toBeVisible();`,
      `DOM 中只有一个 header、一个 navigation 和一个 main，插槽顺序稳定。
失败边界：把插槽函数在 render 中调用两次会生成两份不同节点，布局和事件归属变乱。`,
    ),
    reactExample(
      'Context 默认值缺失时立即报错',
      'TSX + Vitest',
      `import { createContext, useContext, useMemo, useState } from 'react';
type Session = { userId: string; signOut: () => void };
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState('u-1');
  const value = useMemo(() => ({ userId, signOut: () => setUserId('') }), [userId]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession 必须在 SessionProvider 内使用');
  return session;
}

// render(<Consumer />); // 应失败`,
      `缺少 Provider 时测试收到“useSession 必须在 SessionProvider 内使用”。
失败边界：默认值伪造一个可运行会话，会让权限组件在错误上下文中静默放行。`,
    ),
    reactExample(
      '插槽协议用测试锁住替换能力',
      'TSX + Vitest',
      `type LayoutProps = {
  header: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
};
export function AccountLayout({ header, actions, children }: LayoutProps) {
  return <section>
    <header>{header}{actions}</header>
    <main>{children}</main>
  </section>;
}

// 分别替换 header 与 actions，断言 main 内容和按钮事件仍属于调用方；
// render(<AccountLayout header={<h1>账户</h1>} actions={<button>退出</button>}>明细</AccountLayout>);
// expect(screen.getByRole('button', { name: '退出' })).toBeEnabled();`,
      `替换任一插槽后 main 仍保留“明细”，按钮名称和事件归属保持不变。
失败边界：布局组件 cloneElement 覆盖 onClick 会夺走调用方行为，组合接口变得不可预测。`,
    ),
  ],
  '第一个可测试 React 页面': [
    reactExample(
      'Vitest 使用 jsdom 渲染组件',
      'TypeScript + Vitest',
      `// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom', setupFiles: './src/setup.ts' } });

// src/Counter.test.tsx
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { Counter } from './Counter';

test('渲染计数按钮', () => {
  render(<Counter />);
  expect(screen.getByRole('button', { name: /计数/ })).toBeInTheDocument();
});

// pnpm vitest run src/Counter.test.tsx`,
      `Vitest 在 jsdom 中完成 1 个测试，DOM 查询得到按钮。
失败边界：断言 offsetWidth 或 CSS 颜色时 jsdom 无法计算布局，应交给 Playwright。`,
    ),
    reactExample(
      '按可访问名称查询唯一按钮',
      'TSX + Testing Library',
      `export function FavoriteButton({ name }: { name: string }) {
  return <button aria-label={'收藏 ' + name}>★</button>;
}

import { render, screen } from '@testing-library/react';
render(<><FavoriteButton name="React 课程" /><FavoriteButton name="路由课程" /></>);
screen.getByRole('button', { name: '收藏 React 课程' });
screen.getByRole('button', { name: '收藏 路由课程' });`,
      `两个收藏按钮都能通过不同的可访问名称定位，查询无歧义。
失败边界：两个按钮都只显示 ★ 且没有 aria-label 时，getByRole 会因名称不唯一抛错。`,
    ),
    reactExample(
      'userEvent 触发真实输入链路',
      'TSX + Testing Library',
      `import { useState } from 'react';
export function SearchBox({ onSearch }: { onSearch: (value: string) => void }) {
  const [value, setValue] = useState('');
  return <>
    <input aria-label="搜索" value={value} onChange={event => {
      setValue(event.target.value);
      onSearch(event.target.value);
    }} />
    <output>关键词：{value}</output>
  </>;
}

// const user = userEvent.setup();
// await user.type(screen.getByRole('textbox', { name: '搜索' }), 'React');
// expect(screen.getByText('关键词：React')).toBeVisible();`,
      `输入 React 后 output 同步显示“关键词：React”，回调收到五个字符事件。
失败边界：直接设置 input.value 不会触发 React onChange，界面和 state 可能不一致。`,
    ),
    reactExample(
      '断言公开回调收到实体 ID',
      'TSX + Vitest',
      `type Course = { id: string; title: string };
export function CourseActions({ course, onToggle }: {
  course: Course;
  onToggle: (id: string) => void;
}) {
  return <button onClick={() => onToggle(course.id)}>切换 {course.title}</button>;
}

// const onToggle = vi.fn();
// render(<CourseActions course={{ id: 'query', title: 'Query' }} onToggle={onToggle} />);
// await user.click(screen.getByRole('button'));
// expect(onToggle).toHaveBeenNthCalledWith(1, 'query');`,
      `回调只被调用一次，参数是 query，能够定位到正确列表项。
失败边界：只断言 toHaveBeenCalled 而参数传错 ID 时，多行列表中的实体串位不会被发现。`,
    ),
    reactExample(
      '异步错误通过条件查询等待',
      'TSX + Vitest',
      `import { useEffect, useState } from 'react';
export function RemoteText() {
  const [text, setText] = useState('加载中');
  useEffect(() => {
    const timer = setTimeout(() => setText('加载完成'), 20);
    return () => clearTimeout(timer);
  }, []);
  return <p role={text === '加载完成' ? 'status' : undefined}>{text}</p>;
}

// render(<RemoteText />);
// expect(await screen.findByText('加载完成')).toHaveAttribute('role', 'status');`,
      `findByText 等待异步提交后返回“加载完成”节点，角色为 status。
失败边界：用固定 sleep 10ms 在慢 CI 上会先读到“加载中”，测试随机失败。`,
    ),
  ],
});

const r0Stage = 'React、Vite 与第一个组件';

export const HANDWRITTEN_REACT_R0_COURSES: readonly ProgrammingCourseSeed[] = [
  reactCourse(r0Stage, 'React 渲染模型与声明式 UI', {
    minutes: 36,
    prerequisite: '已掌握 JavaScript 函数、对象与 DOM 查询基础，能读懂 TypeScript 的接口和可选属性。',
    goal: '能说明 React 如何把 props 与 state 转换为元素树，再经过 reconciliation 和 commit 更新真实 DOM，并用渲染日志验证声明式更新。',
    guidedPractice: '用 Vite 创建最小项目，在 App 中加入计数按钮和 console.log，利用 React DevTools 观察每次点击后组件函数重新执行、元素树变化与 DOM 提交，而不是手写 querySelector 修改节点。',
    independentPractice: '实现一个显示服务器时间并允许暂停的页面，记录点击前后组件函数执行次数、浏览器 Performance 面板中的 commit 与 DOM 变化，并解释哪些数据属于渲染输入、哪些副作用发生在提交之后。',
    commonErrors: [
      '直接 push state 数组或修改 props 对象，认为内容变了 React 就会知道，结果引用未变导致跳过更新。',
      '把“虚拟 DOM 会逐节点比较并直接替换整个页面”当成机制，忽略 Fiber 工作循环、可中断 render 与分阶段 commit。',
    ],
    sourceRefs: [reactLearn, 'React Rendering. https://react.dev/learn/render-and-commit', reactSource],
    steps: [
      ['声明式 UI 是状态映射', 'React 把界面描述为 `props` 与 `state` 的函数结果：`function Badge({ count }) { return <span>{count}</span>; }`。事件处理只提交新状态，不直接命令某个 span 改成多少；下一次组件函数执行会重新计算整段 UI 描述。失败边界是依赖可变对象并期望 React 猜测变化；验证动作是给每次 render 加带调用序号的日志，确认状态更新后函数重新执行且输出由输入决定。', '输入驱动输出'],
      ['首次挂载由根容器接管', '`createRoot(document.getElementById("root")!)` 建立 React 根，`root.render(<App />)` 让协调器创建 Fiber 树并把结果提交到容器。根可以提交多次，但同一容器不能被多个 createRoot 同时当作独立根管理。失败边界是容器为空、选错节点或重复创建 root；验证动作是检查 DOM 中只出现一份应用标记，并在开发模式确认根节点与 StrictMode 包装正确，再核对根容器子节点数和控制台警告，排除重复挂载。', '一个容器一个根'],
      ['render 必须是可重放的纯计算', '组件函数在状态、父组件或上下文变化时都会再次执行，因此 render 中不能写 `localStorage.setItem`、修改全局变量或发起不受控写请求。同样的 props 与 state 应得到同样的元素描述，副作用应放在事件处理或 Effect 中。失败边界是开发模式 StrictMode 下重复执行导致重复计数；验证动作是临时记录函数调用次数，确认重跑不会改变外部数据，再检查提交后的 DOM 与输入状态一致。', 'render 可重复但不能有副作用'],
      ['reconciliation 依据身份复用节点', 'React 会比较同一父节点下的元素类型与 `key`，类型相同就复用 Fiber 并更新属性，类型不同则卸载旧子树再挂载新子树。列表中的稳定业务 ID 让项目在插入、排序后仍对应同一实体。失败边界是用随机值当 key 或在不同分支复用同 key，造成输入框状态与数据错位；验证动作是重排列表并观察各行的焦点、输入值和卸载日志是否跟随正确实体。', '身份决定复用'],
      ['commit 才触碰宿主 DOM', '协调阶段可以暂停、重做或丢弃工作，只有进入 commit 阶段才执行 DOM 插入、属性更新与布局 Effect；浏览器绘制通常发生在提交之后。因此 render 阶段读到的是本次快照，不能依赖尚未提交的 DOM。失败边界是在 render 中测量元素导致读到旧尺寸；验证动作是用 Performance 记录确认提交标记先于 mutating effects，再用 `useLayoutEffect` 的测量结果与首帧边界对照。', '计算与提交分离'],
    ],
  }),
  reactCourse(r0Stage, '从空目录创建入口和组件', {
    minutes: 39,
    prerequisite: '能在终端使用 pnpm，理解 ESM import/export 和 HTML 中 script 的加载方式。',
    goal: '能从空目录建立 Vite React TypeScript 项目，解释 index.html、main.tsx、App.tsx 与 Vite 开发服务器的关系，并完成生产构建验证。',
    guidedPractice: '执行 `pnpm create vite react-empty --template react-ts` 后删除示例样式，只保留 index.html、src/main.tsx、src/App.tsx 和 tsconfig，逐步补回 import、createRoot 与组件导出，每删一个文件就记录开发服务器报错。',
    independentPractice: '不用模板生成器，手写 package.json、vite.config.ts、index.html 和两个组件模块，以严格 TypeScript 配置启动开发服务器并执行生产构建，最后从 dist 启动静态预览确认资源路径正确。',
    commonErrors: [
      '在 index.html 直接执行 JSX，却没有经过 Vite 的 React 插件或 TypeScript 转换。',
      '把样式和静态资源的相对路径当成源码目录路径，构建后从 assets 目录读取导致 404。',
    ],
    sourceRefs: [viteGuide, reactDocs, 'Vite React plugin. https://github.com/vitejs/vite-plugin-react'],
    steps: [
      ['入口 HTML 只负责装载模块', 'Vite 以 index.html 为应用入口，`<div id="root"></div>` 提供宿主节点，`<script type="module" src="/src/main.tsx"></script>` 把模块图交给开发服务器。浏览器不会直接理解 TSX，Vite 在请求阶段转换模块并通过 import 关系加载依赖。失败边界是入口脚本路径写错或把 root 放在被脚本异步替换的区域；验证动作是打开 Network 面板确认 main.tsx 返回 JavaScript，并在 Elements 中看到 React 在 root 内新增节点。', 'HTML 装载模块图'],
      ['main.tsx 建立运行时边界', '`main.tsx` 导入 `createRoot`、全局样式与 App，并在 root 节点存在时调用 `createRoot(root).render(<StrictMode><App /></StrictMode>)`。StrictMode 在开发环境额外检查重复副作用和不纯 render，但不会给生产界面增加 DOM 外壳。失败边界是 root 为空仍使用非空断言，导致运行时 createRoot 报错；验证动作是故意改错 id，并确认错误堆栈指向入口而不是 App 组件，同时确认入口模块只注册一次根。', '根运行时集中建立'],
      ['组件按行为拆分模块', '`App.tsx` 只负责页面组合，`CourseCard.tsx` 接收标题、进度和操作回调，纯格式化函数可放到独立模块。组件模块导出的应是函数与类型，而不是启动服务器的顶层代码，方便测试直接 render。失败边界是组件文件在 import 时执行网络请求或修改全局状态；验证动作是在 Vitest 中单独 import 组件，确认没有页面副作用且导出的 props 类型能被检查。', '组件模块可独立加载'],
      ['开发服务器依赖模块图', 'Vite 在开发时按浏览器请求即时转换 TSX，并利用 ESM 缓存与 HMR 把改动推送到页面；生产构建则先 Rollup 或 Rolldown 分析依赖，再做 tree shaking、压缩与文件名哈希。开发环境启动成功不能证明生产构建可用。失败边界是只在 dev 下能解析的裸模块或大小写错误的 import；验证动作是运行 `pnpm build`，再执行 `pnpm preview` 从 dist 检查页面、控制台和资源加载。', '开发构建与生产构建分开验证'],
      ['构建产物回看源码映射', '生产目录包含带哈希的 JavaScript、CSS 与静态资源，`index.html` 引用这些产物；开启 sourcemap 后可以把压缩代码的错误位置映射回 TSX。资源哈希变化表示内容变化，适合设置长缓存。失败边界是把绝对本地路径写入运行时配置或未复制 public 资源；验证动作是检查 dist/index.html 引用、在 preview 中刷新深层路由，并用 DevTools Sources 确认 source map 可定位到组件源码。', '产物路径与缓存一起验收'],
    ],
  }),
  reactCourse(r0Stage, 'JSX、表达式和条件渲染', {
    minutes: 42,
    prerequisite: '理解函数调用、三元表达式、短路运算，并知道 React 组件返回的是描述 UI 的对象。',
    goal: '能读懂 JSX 到 `jsx()` 调用的转换，正确嵌入表达式、条件分支、Fragment 和事件属性，并识别零值与布尔短路造成的渲染边界。',
    guidedPractice: '把一段 HTML 改写成 TSX，分别在花括号中放入变量、函数调用、三元表达式和 map；用 React DevTools 检查元素树，再故意写 `items.length && <List />`，把空数组改成零元素后观察页面出现的 0。',
    independentPractice: '实现订单状态卡片，覆盖 loading、error、empty、paid、refunded 五种分支；要求每种分支有独立可访问文本，不用嵌套三元堆叠，并编写 RTL 测试断言任意时刻只出现当前状态。',
    commonErrors: [
      '把 `0 && <Row />` 当成不会渲染，结果 React 把数字 0 作为合法子节点显示在页面上。',
      '在 JSX 中写 if 语句或用普通对象直接渲染子节点，忽略表达式位置与 ReactNode 的类型约束。',
    ],
    sourceRefs: ['React JSX. https://react.dev/learn/writing-markup-with-jsx', 'React conditional rendering. https://react.dev/learn/conditional-rendering', 'Babel JSX transform. https://babeljs.io/docs/babel-plugin-transform-react-jsx'],
    steps: [
      ['JSX 是表达式语法糖', 'TSX 中的 `<Button tone="primary">保存</Button>` 会由编译器转换为 `jsx(Button, { tone: "primary", children: "保存" })` 一类的调用，最终得到 React 元素描述。组件名首字母大写，div 等宿主标签保持小写，属性由 React 映射到 DOM 或组件 props。失败边界是浏览器直接把未转换 TSX 当脚本执行；验证动作是查看 Vite 转换结果，确认出现 jsx/jsxs 调用而不是原始尖括号。', 'JSX 最终是函数调用'],
      ['花括号只放表达式', '`{user.name}`、`{formatPrice(total)}` 与 `{items.map(renderItem)}` 都会在渲染时求值，语句块不能直接塞进 JSX。表达式中的对象不能作为子节点，日期与价格应先格式化为字符串或元素。失败边界是把 `Promise` 或普通对象放进 children，触发表达式不可渲染错误；验证动作是给关键格式函数补返回类型，并用测试传入 null、空字符串和异常价格检查输出。', '表达式结果必须可渲染'],
      ['条件分支要明确空值', '二选一可用 `status === "paid" ? <Paid /> : <Pending />`，只有真值才显示时使用 `count > 0 && <Badge />`，多分支通常提前 return 或查表更清楚。`&&` 左侧必须是布尔值，不能直接使用可能为 0 的数量。失败边界是把合法数字、空字符串或 NaN 意外渲染为文本；验证动作是遍历五种状态和零值数据，断言页面上既没有多余 0，也没有同时出现两个状态面板。', '条件和值类型一起检查'],
      ['Fragment 与属性保持语义', '多个同级节点用 `<></>` 返回，带 key 的列表项用 `<Fragment key={id}>`，避免额外 div 破坏 Grid 或表格结构。事件属性使用 `onClick={handleSave}`，DOM 属性使用 className、htmlFor，自定义 data 属性保持字符串。失败边界是写成 onclick 字符串或把 className 写成 class 后元素失去样式和交互；验证动作是审查渲染后的 DOM，并用 userEvent.click 确认处理器执行而不是只检查文本，同时检查语义树没有多余容器。', '属性名遵守 React 映射'],
      ['条件树要可测试', '把状态判断集中在 `StatusPanel` 的显式分支，测试从用户可见结果出发：无数据时 `getByText("暂无订单")`，错误时 `getByRole("alert")`，支付完成时出现发票按钮。不要通过组件内部条件变量断言实现细节。失败边界是网络错误和空数据共用同一文案，用户无法判断是否失败；验证动作是分别构造五种响应，检查可访问名称、焦点和重试按钮只在错误状态出现。', '可见行为区分状态'],
    ],
  }),
  reactCourse(r0Stage, '列表、key 与稳定身份', {
    minutes: 45,
    prerequisite: '能使用数组 map、filter 与 sort，并理解对象引用相等和业务实体 ID 的区别。',
    goal: '能用稳定实体 ID 渲染列表，解释 key 在 reconciliation 中的作用，识别索引 key、重复 key 和列表内状态迁移问题。',
    guidedPractice: '渲染一个可排序任务列表，每个任务行内含未提交的输入框；先使用 index 作为 key 并交换两行，观察输入值跟随位置，再改用 task.id，重复实验并记录 Fiber 复用差异。',
    independentPractice: '实现带删除、置顶和本地编辑的评论列表，要求分页追加、排序和删除后行状态仍绑定正确评论；用 React DevTools 高亮更新与测试断言验证不会发生内容串行。',
    commonErrors: [
      '为了消除 key 警告而使用 `Math.random()`，每次 render 都创建新身份导致整列卸载重挂。',
      '只在静态列表使用 index key 看不出问题，排序或插入后才把输入框值、展开状态错误套到另一条数据上。',
    ],
    sourceRefs: ['React lists. https://react.dev/learn/rendering-lists', 'React reconciliation. https://react.dev/learn/preserving-and-resetting-state', reactDocs],
    steps: [
      ['map 生成元素数组', '列表由 `items.map(item => <Row key={item.id} item={item} />)` 返回元素数组，React 会把数组展开成同级子节点。过滤和排序应先生成新数组，避免在 render 中直接 sort 修改原 props。失败边界是 map 回调没有返回元素或遗漏 key，导致无效 children 与开发警告；验证动作是检查返回数组长度、每项元素类型，并在测试中按文本查询确认所有可见行按预期顺序出现。', '先转换数据再渲染'],
      ['key 表示兄弟中的身份', 'key 不是 DOM 属性，也不会作为 props 传给 Row；它只在父节点的一级子元素之间建立身份。实体移动时 React 用 key 把旧 Fiber 与新的元素位置配对，从而搬移 DOM 或保留状态。失败边界是两个兄弟使用相同 key，协调结果取决于顺序并可能重复节点；验证动作是输出重复 ID 的报告，并用 DevTools 查看排序前后的复用关系。', 'key 只在兄弟间比较'],
      ['索引 key 适合纯展示', 'index key 在只追加、不重排、行内无可变状态时可能工作，但删除或排序会让同一索引对应另一实体。输入框、展开面板、动画和媒体播放器尤其容易串状态。若数据没有稳定 ID，应在数据进入前端前补服务端 ID；仅把 index 与内容拼在一起仍会随内容变化。失败边界是编辑未提交后删除前一项，输入值跳到另一行；验证动作是对插入、删除、排序三种操作做同样的回归测试。', '有状态行必须有实体 ID'],
      ['列表更新应复制后替换', '新增使用 `setTasks(prev => [...prev, task])`，删除使用 filter，修改使用 map 返回新对象，排序用 `toSorted` 或 `slice().sort`。这些操作产生新数组引用供 React 比较，同时不修改正在渲染的旧快照。失败边界是 push 后把同一数组 setState，引用相同可能跳过更新；验证动作是记录操作前后数组引用与行 ID 顺序，确认原数组未被改变且 UI 正确刷新。', '不修改旧快照'],
      ['列表性能从结构开始', '稳定 key 之后，频繁更新的长列表可先限制渲染量、分页或虚拟化，再用 React Profiler 判断单行 props 与渲染成本。不要为了让每个 Row 都记住而包一层 memo，如果父组件每行都传新对象仍然无效。失败边界是只看总渲染时长却忽略滚动卡顿和输入延迟；验证动作是记录重排操作、浏览器 Long Tasks 与 Profiler commit，确认优化前后的 DOM 操作数量和交互延迟都下降。', '先稳定身份再谈 memo'],
    ],
  }),
  reactCourse(r0Stage, 'Props、组合和 children', {
    minutes: 48,
    prerequisite: '理解 TypeScript 接口、解构赋值和 React 元素类型，能编写无状态组件。',
    goal: '能设计只读 props 与明确的组件边界，通过 children、具名插槽和 Context 组合复用布局，同时避免把共享数据全部塞进组件参数。',
    guidedPractice: '实现 Card、Toolbar 与 CourseCard 三层组件：Card 接收 children，Toolbar 接收 actions，CourseCard 只接收课程数据；再把主题色与当前用户放入 Context，比较 props 逐层传递与 Context 消费的可见依赖。',
    independentPractice: '把重复的页面外框抽成 Layout，支持 sidebar、header 与主内容具名插槽，并提供一个只暴露 `useSession()` 的会话 Context；用测试验证任意插槽和子组件更换不会破坏布局骨架。',
    commonErrors: [
      '在子组件中直接修改 props 数组或对象，试图把父级数据“传回去”。',
      '把列表、主题、会话和路由参数全部通过 props 层层传递，导致中间组件依赖无关字段。',
    ],
    sourceRefs: ['React passing props. https://react.dev/learn/passing-props-to-a-component', 'React context. https://react.dev/learn/passing-data-deeply-with-context', reactDocs],
    steps: [
      ['Props 是父级给出的只读输入', '`type CourseCardProps = { course: Course; onOpen(id: string): void }` 描述父级能提供的值和回调；子组件通过解构读取，但修改对象字段会污染父级状态并破坏单向数据流。需要变更时调用 `onOpen(course.id)`，由状态拥有者决定下一快照。失败边界是把 setter 隐藏后同时传入可变对象，多个子组件写同一引用；验证动作是冻结开发数据或写测试检查渲染前后原对象未改变。', '数据向下，事件向上'],
      ['children 是普通 ReactNode 插槽', '`function Panel({ children }) { return <section>{children}</section>; }` 把调用方提供的元素原样放入布局，适合边界清晰的内容容器。children 不一定需要类型细化，只要接收 `React.ReactNode` 并确保宿主元素允许这些内容。失败边界是把需要特定子组件顺序的协议仅写在注释里，调用方传入任意节点后布局失效；验证动作是写 Story 或测试分别传入文本、多个元素和条件为空的 children。', '容器只负责外形'],
      ['具名插槽表达多个区域', 'Header、Sidebar、Main 可通过对象 props 传递：`<Layout header={<Header />} sidebar={<Nav />}>...`。这种组合让布局不依赖业务模块，同时保留明确的可访问地标。若插槽只需要渲染函数，可传 `(props) => ReactNode` 共享布局计算值。失败边界是把插槽函数在 render 中调用两次并产生不同结果；验证动作是检查 DOM 只有一个 main、一个 nav，且插槽切换后页面顺序稳定。', '多区域用显式插槽'],
      ['Context 用于跨层共享稳定能力', '`const SessionContext = createContext<Session | null>(null)` 配合 Provider 提供用户、权限和退出方法，`useSession()` 先判断 null 再返回 Context。Context 适合主题、会话和国际化，不适合每次请求都变化的表格行数据。失败边界是 Provider value 每次 render 新建对象，让所有消费者都更新；验证动作是在 Profiler 中切换无关局部状态，确认 Context 消费者没有无意义提交，并用 useMemo 稳定 value，比较稳定前后的提交次数。', '只共享真正跨层的数据'],
      ['组合组件接口要约束错误方式', 'props 类型应区分必填与可选，回调参数使用实体 ID 而不是整个可变对象；布局组件不要偷偷重置 key 或克隆 children 注入未知属性。复杂组件可用 compound component 把 `Tabs.List`、`Tabs.Panel` 放在同一上下文，但仍要提供键盘语义。失败边界是父组件用 cloneElement 覆盖子组件事件，导致组合层行为不可预测；验证动作是给每个插槽写替换测试，确认替换后组件结构、无障碍名称与事件归属都保持正确。', '接口让正确用法更容易'],
    ],
  }),
  reactCourse(r0Stage, '第一个可测试 React 页面', {
    minutes: 51,
    prerequisite: '会使用 pnpm 安装开发依赖，理解 describe、it、expect 的基本测试结构。',
    goal: '能用 Vitest、jsdom 与 React Testing Library 渲染组件，以用户可见文本和角色断言交互结果，并区分单测环境与浏览器真实环境的边界。',
    guidedPractice: '配置 Vitest 的 jsdom 环境和 setup 文件，给一个搜索输入框写“输入关键字后显示空状态”的测试；使用 `screen.getByRole("searchbox")` 与 `userEvent.type`，故意改成直接操作 DOM value 后观察 React 状态为何没有更新。',
    independentPractice: '为课程卡片列表补三个测试：初次渲染显示课程名、点击收藏触发回调、网络错误显示重试按钮；要求测试不查询 class、不模拟 useState，并在测试结束后确认没有未处理的异步警告。',
    commonErrors: [
      '用 container.querySelector(".favorite") 绑定 CSS 类，改样式后测试全红，却没有验证用户能看到的收藏动作。',
      '只调用 fireEvent.change 后立刻断言异步结果，没有等待 Promise 或处理 Suspense 边界。',
    ],
    sourceRefs: [vitestDocs, testingLibraryDocs, 'User Event. https://testing-library.com/docs/user-event/intro/'],
    steps: [
      ['测试环境模拟浏览器宿主', 'Vitest 在 Node 中运行测试，jsdom 提供 document、window 和事件系统，让 ReactDOM 可以把组件挂到测试容器。`environment: "jsdom"` 与 setup 文件里的 jest-dom 断言让 DOM 查询可用，但 jsdom 不计算真实布局。失败边界是测试依赖 CSS 尺寸或滚动位置，在 jsdom 中得到零值；验证动作是把组件测试与 Playwright 视觉或交互测试分层，确保每种断言在能提供该能力的运行环境执行。', '组件单测不等于浏览器'],
      ['按可访问角色查询', 'React Testing Library 的 `render(<CourseCard />)` 返回 screen 查询接口，优先使用 `getByRole("button", { name: "收藏" })`、`getByText` 和 `findByRole`。这些查询模拟用户能感知的语义，也能暴露缺失 label 的问题。失败边界是多个相似按钮没有可区分名称；验证动作是在测试中添加第二个同名按钮，确认必须使用明确 aria-label 或区域限定，而不是退回 querySelector，并优先修正页面语义。', '查询体现用户视角'],
      ['用户事件要经过完整链路', '`const user = userEvent.setup(); await user.type(input, "React")` 会触发 focus、键盘、input 与 change 等事件序列，并由 React 调用状态更新。直接设置 element.value 不会触发合成事件系统，页面看起来有字但 state 仍是旧值。失败边界是测试里使用同步 fireEvent 后马上读取异步结果；验证动作是统一 await userEvent，并用 find 查询等待界面稳定，同时在控制台开启 act 警告检查，出现警告时先等待真实提交完成。', '真实事件而非改属性'],
      ['断言行为与回调边界', '点击收藏后，测试可直接断言按钮文本变化；若组件只负责发出事件，则用 `vi.fn()` 作为 onToggle 并断言收到正确课程 ID。不要断言 setState 被调用或内部对象字段，除非那本身就是公开契约。失败边界是回调断言只看调用次数，却传错实体；验证动作是准备两条课程并分别点击，检查每次参数 ID 与对应行，避免列表闭包或 key 错误被掩盖。', '断言外部可见结果'],
      ['异步状态要显式等待', '数据请求组件可 mock fetch 返回 Promise，`await screen.findByText("加载完成")` 会等待状态提交；错误路径用 `findByRole("alert")` 并确认重试按钮可点击。每个测试恢复 mock 和 DOM，避免前一个测试的未完成请求污染后一个。失败边界是测试使用真实计时器等待固定毫秒，机器一慢就波动；验证动作是用 Vitest fake timers 或可控 Promise，检查请求次数、清理函数和最终可见状态。', '等待条件而非等待时间'],
    ],
  }),
];

Object.assign(reactExamples, {
  'State、快照与批处理': [
    reactExample(
      '事件内日志仍是旧快照',
      'TSX + Browser Console',
      `import { useState } from 'react';
export function SnapshotDemo() {
  const [count, setCount] = useState(0);
  const increment = () => {
    setCount(count + 1);
    console.log('事件内 count =', count);
  };
  return <button onClick={increment}>count: {count}</button>;
}

// 打开控制台连续点击按钮，记录每次日志与文本`,
      `首次点击日志为“事件内 count = 0”，按钮随后提交为 count: 1。
失败边界：期望日志立即显示新值会导致业务校验读取旧状态，实际更新需依赖返回值或 Effect。`,
    ),
    reactExample(
      '同一事件多次 set 合并提交',
      'TSX + Profiler',
      `import { useRef } from 'react';
export function BatchButton({ setCount }: { setCount: React.Dispatch<React.SetStateAction<number>> }) {
  const commits = useRef(0);
  const handle = () => {
    setCount(value => value + 1);
    setCount(value => value + 1);
    setCount(value => value + 1);
    commits.current += 1;
  };
  return <button onClick={handle}>连续加三</button>;
}

// 在 React Profiler 中录入一次点击，查看 commit 数量`,
      `按钮最终增加 3，Profiler 通常只记录一次由该点击触发的提交。
失败边界：把中间值写入外部数组依赖逐次 render 时会丢失中间快照，应合并后一次计算。`,
    ),
    reactExample(
      '函数式 updater 累加三次',
      'TSX + Vitest',
      `import { useState } from 'react';
export function TripleCounter() {
  const [count, setCount] = useState(0);
  return <>
    <button onClick={() => {
      setCount(value => value + 1);
      setCount(value => value + 1);
      setCount(value => value + 1);
    }}>加三</button>
    <output>总数：{count}</output>
  </>;
}

// render(<TripleCounter />);
// await user.click(screen.getByRole('button', { name: '加三' }));
// expect(screen.getByText('总数：3')).toBeVisible();`,
      `点击一次后输出“总数：3”，说明 updater 按队列读取最新待处理值。
失败边界：写成 setCount(count + 1) 三次仍只增加 1，因为三次都读取同一个旧快照。`,
    ),
    reactExample(
      '对象字段更新必须展开旧值',
      'TSX + Vitest',
      `type Profile = { name: string; city: string };
const [profile, setProfile] = useState<Profile>({ name: 'Ada', city: '上海' });

setProfile(prev => ({ ...prev, city: '杭州' }));
console.log(profile);

// 渲染测试断言“Ada”和“杭州”
screen.getByText('Ada');
screen.getByText('杭州');`,
      `提交后姓名仍为 Ada，城市变为杭州，旧对象没有被原地修改。
失败边界：只 setProfile({ city: '杭州' }) 会丢掉 name，类型检查可阻止但运行时仍可能出现缺字段。`,
    ),
    reactExample(
      '从可见结果验证更新次数',
      'TSX + Testing Library',
      `type Props = { onCheckout: (count: number) => void };
export function Cart({ onCheckout }: Props) {
  const [count, setCount] = useState(1);
  return <section>
    <button onClick={() => setCount(value => value + 1)}>增加</button>
    <output>件数：{count}</output>
    <button onClick={() => onCheckout(count)}>结算</button>
  </section>;
}

// await user.click(screen.getByRole('button', { name: '增加' }));
// expect(screen.getByText('件数：2')).toBeVisible();
// await user.click(screen.getByRole('button', { name: '结算' }));
// expect(onCheckout).toHaveBeenCalledWith(2);`,
      `界面显示件数 2，结算回调收到 2，用户看到的值与请求参数一致。
失败边界：只断言 updater 被调用一次却没有验证提交结果，闭包错误可能传回旧件数。`,
    ),
  ],
  '不可变对象和数组更新': [
    reactExample(
      '浅拷贝隔离第一层对象',
      'TypeScript + Vitest',
      `type Order = { id: string; address: { city: string } };
const before: Order = { id: 'o-1', address: { city: '上海' } };
const after: Order = { ...before, address: { ...before.address, city: '杭州' } };

expect(after).not.toBe(before);
expect(after.address).not.toBe(before.address);
expect(before.address.city).toBe('上海');
// pnpm vitest run src/order.test.ts`,
      `after 的城市是杭州，before 仍是上海，两层对象引用都不同。
失败边界：只展开 order 后直接 after.address.city = '杭州' 会同时改掉旧快照。`,
    ),
    reactExample(
      '按实体 ID 更新数组元素',
      'TypeScript + Vitest',
      `type Task = { id: string; title: string; done: boolean };
const tasks: Task[] = [{ id: 't1', title: '学习 Hooks', done: false }];
const after = tasks.map(task =>
  task.id === 't1' ? { ...task, done: true } : task,
);

expect(after).not.toBe(tasks);
expect(after[0]).not.toBe(tasks[0]);
expect(tasks[0].done).toBe(false);
// pnpm vitest run src/tasks.test.ts`,
      `after 中 t1 已完成，原 tasks 的 t1 仍未完成，未命中的行保留引用。
失败边界：按 index 修改会在排序后更新错误实体，必须使用稳定业务 ID。`,
    ),
    reactExample(
      '多层结构中逐层替换',
      'TypeScript + Vitest',
      `type Board = { columns: Array<{ id: string; cards: Array<{ id: string; text: string }> }> };
const board: Board = { columns: [{ id: 'todo', cards: [{ id: 'c1', text: '旧文案' }] }] };
const next: Board = {
  ...board,
  columns: board.columns.map(column => column.id !== 'todo' ? column : {
    ...column,
    cards: column.cards.map(card => card.id === 'c1' ? { ...card, text: '新文案' } : card),
  }),
};
expect(board.columns[0].cards[0].text).toBe('旧文案');`,
      `next 中卡片文本为新文案，board 原快照仍为旧文案，兄弟列尽量复用。
失败边界：在 map 内直接 card.text = ... 会修改共享快照，撤销与比较都失真。`,
    ),
    reactExample(
      '稳定空数组减少无意义依赖变化',
      'TSX + TypeScript',
      `import { useEffect } from 'react';
const EMPTY: readonly string[] = [];

export function Tags({ tags = EMPTY }: { tags?: readonly string[] }) {
  useEffect(() => {
    console.log('tags changed', tags.length);
  }, [tags]);
  return <span>{tags.join(' / ') || '无标签'}</span>;
}

// 父组件每次传默认值时不要写 tags = []，否则每次 render 都是新引用`,
      `没有标签的同一个组件多次重渲染时，Effect 不会因为空数组引用变化而重复执行。
失败边界：参数默认值写成 [] 会在每次调用创建新数组，触发无意义同步和性能噪声。`,
    ),
    reactExample(
      '撤销历史保存不可变快照',
      'TypeScript + Vitest',
      `type EditorState = { draft: string; history: readonly string[] };
const initial: EditorState = { draft: '第一版', history: [''] };
const saved: EditorState = {
  draft: '第二版',
  history: [...initial.history, initial.draft],
};
const undo: EditorState = {
  draft: saved.history.at(-1) ?? '',
  history: saved.history.slice(0, -1),
};

expect(undo.draft).toBe('第一版');
expect(initial.draft).toBe('第一版');
// pnpm vitest run src/editor.test.ts`,
      `撤销后 draft 回到第一版，history 缩回一项，initial 快照未改变。
失败边界：把同一个可变对象推进 history 并在后续修改它，会让所有历史版本一起变化。`,
    ),
  ],
  '派生状态与状态最小化': [
    reactExample(
      '总价从数量和单价派生',
      'TSX + Testing Library',
      `export function OrderTotal({ quantity, unitPrice }: { quantity: number; unitPrice: number }) {
  const total = quantity * unitPrice;
  return <p>合计：{(total / 100).toFixed(2)} 元</p>;
}

// render(<OrderTotal quantity={3} unitPrice={2599} />);
// expect(screen.getByText('合计：77.97 元')).toBeVisible();`,
      `页面显示“合计：77.97 元”，组件只有一个事实源 quantity 与 unitPrice。
失败边界：把 total 另存 state 后修改 unitPrice 且忘记同步，会让明细与合计不一致。`,
    ),
    reactExample(
      '筛选和空态在 render 中计算',
      'TSX + Vitest',
      `type Item = { id: string; name: string; active: boolean };
export function ActiveItems({ items }: { items: Item[] }) {
  const visible = items.filter(item => item.active);
  return visible.length === 0
    ? <p>暂无启用项</p>
    : <ul>{visible.map(item => <li key={item.id}>{item.name}</li>)}</ul>;
}

// render(<ActiveItems items={[]} />);
// expect(screen.getByText('暂无启用项')).toBeVisible();`,
      `空数组只出现空态；传入两项启用数据时自动出现两条列表项。
失败边界：把 visible 用 useEffect 同步，首次 render 会短暂显示空态或过期结果。`,
    ),
    reactExample(
      'useMemo 只缓存昂贵排序',
      'TSX + Profiler',
      `import { useMemo } from 'react';
export function SortedRows({ rows, query }: {
  rows: Array<{ id: string; label: string }>;
  query: string;
}) {
  const visible = useMemo(() => rows
    .filter(row => row.label.includes(query))
    .toSorted((a, b) => a.label.localeCompare(b.label)), [rows, query]);
  return <ul>{visible.map(row => <li key={row.id}>{row.label}</li>)}</ul>;
}

// 用 Profiler 对比输入相同 query 时的重复排序耗时`,
      `query 与 rows 未变时复用排序结果，Profiler 中筛选提交耗时下降。
失败边界：把依赖写成空数组后 rows 更新仍显示旧排序，缓存必须覆盖全部读取输入。`,
    ),
    reactExample(
      'key 重置外部实体表单',
      'TSX + Testing Library',
      `type FormProps = { customerId: string };
export function CustomerForm({ customerId }: FormProps) {
  const [note, setNote] = useState('初始备注');
  return <label>客户 {customerId}<input value={note} onChange={e => setNote(e.target.value)} /></label>;
}

export function CustomerSwitcher({ id }: { id: string }) {
  return <CustomerForm key={id} customerId={id} />;
}

// 编辑客户 A 后切换 id 为 B，输入恢复初始备注`,
      `切换客户后组件实例重建，输入值回到“初始备注”，不会继承 A 的草稿。
失败边界：key 使用可编辑字段时每次输入都会重置组件，表单无法正常编辑。`,
    ),
    reactExample(
      '交互矩阵验证最小状态',
      'TypeScript + Vitest',
      `const scenarios = [
  { name: '切换筛选', hasUrl: true, hasCache: true, expected: '结果来自 URL 与缓存' },
  { name: '直接刷新', hasUrl: true, hasCache: false, expected: '从 URL 重建' },
  { name: '无筛选', hasUrl: false, hasCache: false, expected: '显示全部' },
];

test.each(scenarios)('$name', ({ expected }) => {
  expect(expected.length).toBeGreaterThan(0);
});
// pnpm vitest run src/state-matrix.test.ts`,
      `三个状态恢复场景全部通过，测试名直接呈现用户任务。
失败边界：只保存派生的筛选结果而不保存 URL 输入时，刷新场景会丢失恢复依据。`,
    ),
  ],
  '受控表单、校验和服务器错误': [
    reactExample(
      '受控输入与输出同步',
      'TSX + Testing Library',
      `export function EmailField() {
  const [email, setEmail] = useState('');
  return <>
    <label htmlFor="email">邮箱</label>
    <input id="email" value={email} onChange={event => setEmail(event.target.value)} />
    <output>输入：{email}</output>
  </>;
}

// await user.type(screen.getByLabelText('邮箱'), 'ada@example.com');
// expect(screen.getByText('输入：ada@example.com')).toBeVisible();`,
      `键入完整邮箱后 output 同步显示相同文本，DOM value 与 state 一致。
失败边界：写死 value 且 onChange 不更新，输入框会立即恢复旧值并产生只读警告。`,
    ),
    reactExample(
      '慢请求提交中阻止重复提交',
      'TSX + Vitest',
      `export function Signup({ createUser }: { createUser: (email: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  return <form onSubmit={async event => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try { await createUser(email); } finally { setSubmitting(false); }
  }}>
    <input aria-label="邮箱" value={email} onChange={e => setEmail(e.target.value)} />
    <button disabled={submitting}>{submitting ? '提交中' : '注册'}</button>
  </form>;
}
// 慢 Promise 下连续点击两次，断言 createUser 只调用一次`,
      `提交开始时按钮变为“提交中”并禁用，慢请求结束后恢复“注册”。
失败边界：只在前端禁用仍可能被绕过，服务端还需要幂等键防重复写入。`,
    ),
    reactExample(
      '服务器字段错误关联 input',
      'TSX + Testing Library',
      `type FieldError = { field: 'email'; message: string };
export function EmailForm({ error }: { error?: FieldError }) {
  return <div>
    <label htmlFor="signup-email">邮箱</label>
    <input id="signup-email" aria-invalid={Boolean(error)}
      aria-describedby={error ? 'email-error' : undefined} />
    {error && <p id="email-error" role="alert">{error.message}</p>}
  </div>;
}

// expect(screen.getByRole('textbox', { name: '邮箱' })).toHaveAccessibleDescription('已注册');
// expect(screen.getByRole('alert')).toHaveTextContent('已注册');`,
      `输入框 aria-invalid=true，错误文本“已注册”通过 aria-describedby 成为可访问说明。
失败边界：错误只显示页面顶部且没有关联字段，屏幕阅读器用户无法知道哪个输入失败。`,
    ),
    reactExample(
      '简单表单用 FormData 避免逐键渲染',
      'TSX + Vitest',
      `export function ContactForm({ onSubmit }: { onSubmit: (data: FormData) => void }) {
  return <form onSubmit={event => {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }}>
    <label>姓名<input name="name" defaultValue="Ada" /></label>
    <label>留言<textarea name="message" defaultValue="你好" /></label>
    <button>提交</button>
  </form>;
}

// 提交后断言 FormData.get('name') 为 Ada，message 为你好`,
      `非受控表单提交一次，回调可以读取 name 与 message 两个字段。
失败边界：文件输入不能设置 value 成为受控，应通过 FormData 或 ref 读取 File 对象。`,
    ),
    reactExample(
      '错误修复后可再次成功提交',
      'TSX + Testing Library',
      `// 模拟第一次提交服务器返回 409，第二次返回 201
const requests: string[] = [];
async function submit(email: string) {
  requests.push(email);
  if (requests.length === 1) throw { fields: { email: '邮箱已注册' } };
  return { ok: true };
}

await user.type(screen.getByLabelText('邮箱'), 'bad@example.com');
await user.click(screen.getByRole('button', { name: '注册' }));
expect(await screen.findByRole('alert')).toHaveTextContent('邮箱已注册');
await user.clear(screen.getByLabelText('邮箱'));
await user.type(screen.getByLabelText('邮箱'), 'new@example.com');
await user.click(screen.getByRole('button', { name: '注册' }));
expect(await screen.findByText('注册成功')).toBeVisible();`,
      `第一次请求显示字段错误，修正邮箱后第二次请求成功并显示“注册成功”。
失败边界：错误 state 未清除会永久阻塞提交，只测首个错误无法发现无法恢复的问题。`,
    ),
  ],
  'Reducer 与联合状态机': [
    reactExample(
      '上传状态用可辨识联合',
      'TypeScript + Vitest',
      `type UploadState =
  | { type: 'idle' }
  | { type: 'uploading'; progress: number }
  | { type: 'success'; fileId: string }
  | { type: 'error'; message: string };

function label(state: UploadState): string {
  switch (state.type) {
    case 'idle': return '等待上传';
    case 'uploading': return '上传中 ' + state.progress + '%';
    case 'success': return '完成 ' + state.fileId;
    case 'error': return '失败：' + state.message;
  }
}
expect(label({ type: 'uploading', progress: 40 })).toBe('上传中 40%');`,
      `每个联合分支只访问自己拥有的字段，上传中显示 40%，类型检查覆盖全部状态。
失败边界：用 loading、success、error 三个布尔会产生互斥状态同时为真的非法组合。`,
    ),
    reactExample(
      'reducer 对相同输入可重放',
      'TypeScript + Vitest',
      `type State = { count: number };
type Action = { type: 'add'; amount: number };
const reducer = (state: State, action: Action): State =>
  action.type === 'add' ? { count: state.count + action.amount } : state;

const start = Object.freeze({ count: 1 });
const a = reducer(start, { type: 'add', amount: 2 });
const b = reducer(start, { type: 'add', amount: 2 });
expect(a).toEqual(b);
expect(start.count).toBe(1);
// pnpm vitest run src/reducer.test.ts`,
      `两次执行 reducer 都得到 count=3，冻结的初始状态没有被修改。
失败边界：在 reducer 内调用 Date.now 或发 fetch 会让相同输入产生不同结果，且难以重放。`,
    ),
    reactExample(
      'dispatch 记录可序列化事实',
      'TSX + Vitest',
      `type Action = { type: 'submit'; email: string } | { type: 'success'; userId: string };
export function SignupButton({ email, dispatch }: {
  email: string;
  dispatch: (action: Action) => void;
}) {
  const submit = async () => {
    dispatch({ type: 'submit', email });
    const response = await fetch('/api/signup', {
      method: 'POST', body: JSON.stringify({ email }),
    });
    const data = await response.json();
    dispatch({ type: 'success', userId: data.id });
  };
  return <button onClick={submit}>创建账户</button>;
}
// mock fetch 后断言 action 时间为 submit -> success`,
      `网络请求发生在事件层，action 时间线只有可序列化的 submit 与 success。
失败边界：把 Promise 或 AbortController 放进 reducer state 会阻碍序列化、比较和历史回放。`,
    ),
    reactExample(
      '拆分只读状态与 dispatch Context',
      'TSX + TypeScript',
      `const StateContext = createContext<EditorState | null>(null);
const DispatchContext = createContext<React.Dispatch<EditorAction> | null>(null);

export function useEditorState() {
  const value = useContext(StateContext);
  if (!value) throw new Error('缺少 EditorStateContext');
  return value;
}

export function useEditorDispatch() {
  const value = useContext(DispatchContext);
  if (!value) throw new Error('缺少 EditorDispatchContext');
  return value;
}
// 在 Profiler 中只触发 dispatch 消费者，确认其不读取 rows`,
      `只调用 dispatch 的工具按钮不会订阅 rows，rows 变化时提交范围更小。
失败边界：读写放在同一 Context 且 Provider value 每次新建，会让所有消费者一起重渲染。`,
    ),
    reactExample(
      '迟到请求不能越过取消状态',
      'TypeScript + Vitest',
      `type State = { type: 'editing' } | { type: 'cancelled' } | { type: 'saved'; requestId: number };
type Action = { type: 'cancel' } | { type: 'saved'; requestId: number };
const cancelledRequest = 7;

const reducer = (state: State, action: Action): State => {
  if (action.type === 'cancel') return { type: 'cancelled' };
  if (state.type === 'cancelled' || action.requestId !== cancelledRequest) return state;
  return { type: 'saved', requestId: action.requestId };
};

expect(reducer({ type: 'cancelled' }, { type: 'saved', requestId: 7 }))
  .toEqual({ type: 'cancelled' });`,
      `取消后到达的旧请求被忽略，状态仍为 cancelled，不会误显示已保存。
失败边界：不携带 requestId 就无法区分旧请求与新请求，取消可能被迟到响应覆盖。`,
    ),
  ],
  '表单状态与交互测试': [
    reactExample(
      '测试名称描述用户结果',
      'Testing Library',
      `test('填写有效地址后可继续到支付', async () => {
  render(<CheckoutWizard />);
  await user.type(screen.getByLabelText('收货地址'), '杭州市西湖区');
  await user.click(screen.getByRole('button', { name: '下一步' }));
  expect(screen.getByRole('heading', { name: '支付方式' })).toBeVisible();
});

// pnpm vitest run src/checkout.test.tsx`,
      `测试通过，报告名称直接说明“填写地址后进入支付”的用户完成结果。
失败边界：测试名只写“调用 nextStep”会鼓励直接调用内部函数，无法发现按钮被遮挡或禁用。`,
    ),
    reactExample(
      'label 与错误描述构成查询接口',
      'TSX + Testing Library',
      `export function CompanyField({ error }: { error?: string }) {
  return <div>
    <label htmlFor="company">公司名称</label>
    <input id="company" aria-invalid={Boolean(error)}
      aria-describedby={error ? 'company-help' : undefined} />
    {error && <p id="company-help">{error}</p>}
  </div>;
}

const input = screen.getByRole('textbox', { name: '公司名称' });
expect(input).toHaveAccessibleDescription('最多 80 个字符');`,
      `查询只使用 label 与可访问说明，不依赖 class、DOM 层级或测试 id。
失败边界：两个“名称”输入没有可区分 label 时，getByRole 会报匹配到多个元素。`,
    ),
    reactExample(
      'fake timers 推进优惠码防抖',
      'Testing Library + Vitest',
      `vi.useFakeTimers();
const checkCode = vi.fn().mockResolvedValue({ valid: true });
render(<CouponForm checkCode={checkCode} />);
await user.type(screen.getByLabelText('优惠码'), 'REACT20');
await vi.advanceTimersByTimeAsync(300);
expect(checkCode).toHaveBeenCalledWith('REACT20');
expect(await screen.findByText('优惠生效')).toBeVisible();
vi.useRealTimers();`,
      `推进 300ms 后查询函数只调用一次，最终显示“优惠生效”。
失败边界：使用真实 sleep 会在慢机器波动；测试结束未恢复计时器会污染后续用例。`,
    ),
    reactExample(
      '服务器错误后保留输入并恢复提交',
      'Testing Library + Vitest',
      `const submit = vi.fn()
  .mockRejectedValueOnce({ fields: { email: '邮箱已占用' } })
  .mockResolvedValueOnce({ ok: true });
render(<SignupForm submit={submit} />);
await user.type(screen.getByLabelText('邮箱'), 'bad@example.com');
await user.click(screen.getByRole('button', { name: '注册' }));
expect(await screen.findByRole('alert')).toHaveTextContent('邮箱已占用');
expect(screen.getByLabelText('邮箱')).toHaveValue('bad@example.com');`,
      `错误出现时输入仍保留 bad@example.com，焦点可回到邮箱继续修改。
失败边界：错误后清空表单或永久禁用按钮，会让用户无法完成失败恢复路径。`,
    ),
    reactExample(
      '浏览器层测返回上一步保留数据',
      'Playwright',
      `test('返回上一步保留收货地址', async ({ page }) => {
  await page.goto('/checkout');
  await page.getByLabel('收货地址').fill('杭州市西湖区');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '返回' }).click();
  await expect(page.getByLabel('收货地址')).toHaveValue('杭州市西湖区');
});

// pnpm playwright test e2e/checkout.spec.ts --project=chromium`,
      `Playwright 在真实路由和历史栈中返回后，地址输入仍为杭州市西湖区。
失败边界：组件单测通过但路由卸载组件丢失状态时，只有浏览器层后退能发现。`,
    ),
  ],
});

const r1Stage = '状态、表单与不可变更新';

export const HANDWRITTEN_REACT_R1_COURSES: readonly ProgrammingCourseSeed[] = [
  reactCourse(r1Stage, 'State、快照与批处理', {
    minutes: 36,
    prerequisite: '已能创建组件和事件处理器，理解函数作用域中的局部变量在每次 render 时重新创建。',
    goal: '能解释 useState 每次 render 提供的状态快照、事件内批处理与 updater 队列，预测连续 setState 后下一次渲染看到的值。',
    guidedPractice: '写一个按钮处理器连续调用 `setCount(count + 1)` 三次与 `setCount(c => c + 1)` 三次，分别打印同一次事件里的 count；用 React DevTools 的 highlight updates 对比一次提交与多次提交。',
    independentPractice: '实现购物车数量调节，要求快速连点、异步回调更新与父组件传入初值三类场景都得到正确结果；为每个场景记录提交次数，并解释闭包中的旧 count 从何而来。',
    commonErrors: [
      '认为连续三次 `setCount(count + 1)` 会得到加三，忽略同一事件中的 count 是同一快照。',
      '只在事件中读取 state 后用于异步请求，却没有在回调运行时取得最新输入，导致提交旧值。',
    ],
    sourceRefs: ['React state as a snapshot. https://react.dev/learn/state-as-a-snapshot', 'React queueing state updates. https://react.dev/learn/queueing-a-series-of-state-updates', reactDocs],
    steps: [
      ['state 是本次 render 的快照', '调用 `setCount` 不会改写当前函数里的 `count` 常量，而是请求 React 用新值安排下一次 render。当前事件处理器继续使用旧快照，页面也要等提交后才看到新数字。失败边界是同一事件先 setState 再 console.log state，误以为日志应显示新值；验证动作是同时记录事件内值和 Effect 中值，确认后者对应下一次提交。', '当前闭包不随 setState 变形'],
      ['同一事件中的更新会批处理', 'React 在事件处理、Promise 回调和原生事件边界内收集更新，通常合并为一次 render。批处理减少中间 DOM 与 Effect，但也意味着一次事件里的多次 set 不会逐次重绘。失败边界是需要中间状态的动画或日志被合并后丢失；验证动作是在 React Profiler 中记录 commit 次数，并在 updater 中加入纯计数观察队列执行次数。', '合并提交不合并更新语义'],
      ['updater 读取最新待处理状态', '`setCount(c => c + 1)` 把函数放入更新队列，React 依次执行它与本次事件中的其他更新，因此连续加法能得到 3。updater 必须是纯函数，不能在内部发请求或修改外部对象，因为开发检查可能重复调用。失败边界是把对象 mutation 放进 updater，导致重复执行后数据被加两次；验证动作是写一个只返回新值的 updater，并用测试断言最终值和调用输入。', '需要前值时使用函数式更新'],
      ['不同数据要选择独立更新', '对象 state 需要替换整块引用或拆分字段：`setProfile(prev => ({ ...prev, name }))` 让 React 看到新对象；多字段互不相关时拆成多个 useState 可减少无意覆盖。失败边界是只更新一个对象字段却忘记展开旧字段；验证动作是提交表单后断言未修改字段仍在，并用对象引用比较确认没有复用旧根对象，拆分字段时还要比较提交次数。', '替换而非原地改写'],
      ['用渲染结果验证更新', '为数量按钮、总价和提交次数分别加上稳定测试标识，通过点击三次、等待一个 tick 后断言界面总数与网络载荷。不要只查看 console；用户真正看到的是提交后的文本。失败边界是测试每个 updater 被调用一次而不验证最终状态；验证动作是用 RTL 连续触发用户事件，检查总价、禁用状态与请求参数一致。', '以提交后的可见结果收口'],
    ],
  }),
  reactCourse(r1Stage, '不可变对象和数组更新', {
    minutes: 39,
    prerequisite: '知道对象展开语法、Array.map/filter 和引用相等，并完成过一次带有列表交互的组件。',
    goal: '能用不可变结构更新嵌套对象、数组和集合，保持结构共享，并识别浅拷贝仍修改原对象或遗漏删除路径的问题。',
    guidedPractice: '为订单编辑器实现改数量、改地址、删除行和切换选中四个操作，每一步先用 `Object.freeze` 暴露 mutation，再改用展开、map 与 filter 重写并比较原对象快照。',
    independentPractice: '实现一个多层权限矩阵，要求切换单个权限时只替换对应分支，其他对象引用保持不变；用快照记录修改前后的结构，并写测试证明原状态未被污染。',
    commonErrors: [
      '只展开最外层对象却直接修改内层数组，因为根引用变了便误以为整棵树都不可变。',
      '删除数组项时按索引更新，却在 filter 前后发生排序，导致删错业务实体。',
    ],
    sourceRefs: ['React updating objects in state. https://react.dev/learn/updating-objects-in-state', 'React updating arrays in state. https://react.dev/learn/updating-arrays-in-state', 'Immer documentation. https://immerjs.github.io/immer/'],
    steps: [
      ['浅拷贝只隔离第一层', '`{ ...order, address: { ...order.address, city } }` 每经过需要修改的分支都创建新对象，兄弟字段可以保留原引用，这就是结构共享。若只复制 order 而直接改 `order.address.city`，旧快照仍被污染。失败边界是深层 copy 缺失而在撤销功能中读到已改数据；验证动作是冻结开发数据并断言更新前后旧对象的 city 与引用均保持原样。', '每一层变化都要新对象'],
      ['数组更新围绕实体 ID', '新增用展开，修改用 `map(item => item.id === id ? { ...item, done } : item)`，删除用 `filter(item => item.id !== id)`，排序用不修改原数组的 `toSorted`。按 ID 操作比按索引更稳定。失败边界是 map 中修改旧 item 或 filter 条件恒真；验证动作是准备三项并分别更新中间项，确认只替换目标引用、其他两项引用不变，再用重复 ID 样例确认操作没有歧义，并在变更函数入口拒绝重复实体。', '操作目标用业务 ID'],
      ['嵌套结构可先拆分再重组', '更新 `project.columns[columnId].cards` 时，先检查 columnId 是否存在，再替换 cards，最后替换 columns 和 project。可以封装纯函数 `updateCard(project, cardId, patch)` 让变更路径集中。失败边界是某层为 undefined 时展开报错或静默生成新分支；验证动作是对正常列、缺失列和重复卡 ID 做表驱动测试，检查函数返回 null 或原状态而不修改输入，并比较各层引用，失败时保留旧对象。', '把复杂路径收进纯函数'],
      ['避免无意义的新引用', '即使值相同，每次 `{ ...state }` 也会产生新引用并触发依赖比较；在 updater 中先判断目标项是否存在、字段是否真的变化，可返回原 state。不要为了省一次更新而漏掉必要字段。失败边界是 `JSON.parse(JSON.stringify(state))` 把 Date、Map 与 undefined 改变；验证动作是使用结构化对象测试往返，并检查 Date 实例、NaN 与空值不会被序列化改写。', '无变化就保留旧引用'],
      ['撤销与回滚保留快照', '编辑功能可保存整个状态快照或只保存 patch，但快照必须依赖严格不可变更新，否则历史记录会全部指向同一可变对象。`structuredClone` 适合小型本地快照，不适合含函数、DOM 或循环引用的状态。失败边界是撤销时只恢复当前字段却漏掉选择状态；验证动作是连续三次编辑后撤销到第二步，比较界面、选中项和原始对象引用，确认历史层级正确。', '历史记录依赖不可变'],
    ],
  }),
  reactCourse(r1Stage, '派生状态与状态最小化', {
    minutes: 42,
    prerequisite: '能在组件中使用多个 useState，并理解 render 期间可以执行普通 JavaScript 计算。',
    goal: '能区分唯一事实源与派生值，删除可计算的状态，避免用 Effect 同步 props 和 state，并在确有昂贵计算时选择缓存策略。',
    guidedPractice: '把搜索页中的 filteredItems、total、isEmpty 三个 state 删掉，改为每轮 render 从 items 和 keyword 计算；用 React DevTools 观察删除事件后状态数量减少，页面仍保持相同筛选结果。',
    independentPractice: '重构一个同时保存 firstName、lastName、fullName 和 initials 的客户资料表单，只保留必要输入状态，并以派生变量生成显示值；补测试覆盖姓名为空、全空格和切换客户时的重置。',
    commonErrors: [
      '把 props 复制进 state 后再用 useEffect 同步，形成两套事实源并出现短暂旧值。',
      '每次输入都 setState 保存由 items 过滤出的数组，忘记 items 改变时派生数组会过期。',
    ],
    sourceRefs: ['React choosing state structure. https://react.dev/learn/choosing-the-state-structure', 'React removing state. https://react.dev/learn/you-might-not-need-an-effect', reactDocs],
    steps: [
      ['先找唯一事实源', '订单数量与单价是输入，合计金额可以由 `quantity * unitPrice` 计算；只保存输入能避免合计与明细不一致。能由现有 state 或 props 算出的值不应再 setState。失败边界是合计被用户手动改后覆盖计算值；验证动作是给金额显示写断言，修改数量后确认金额随同一次 render 更新，而状态清单中没有 total 字段。', '输入状态而不是结果状态'],
      ['派生值在 render 中计算', '`const visibleItems = items.filter(...)` 与 `const isValid = email.includes("@")` 可以直接放在组件函数内，复杂度通常足够低。React 重新执行组件本来就是为了得到新的界面描述，不必为每次计算安排 state 或 Effect。失败边界是把派生值放进 Effect 依赖自己的结果，造成循环更新；验证动作是注释掉所有同步 Effect，确认过滤、空态和禁用按钮仍工作。', '能算就别存'],
      ['缓存只针对可测成本', '只有排序大数组、解析大 JSON 或构造昂贵对象时，才考虑 `useMemo(() => expensive(items, query), [items, query])`；依赖必须覆盖全部读取值。缓存不是语义保证，React 仍可能丢弃缓存。失败边界是小计算被大量 useMemo 包裹，比较依赖的成本超过计算本身；验证动作是用 Performance 或 Profiler 记录优化前后组件耗时，只有稳定下降才保留缓存。', '优化要有测量对象'],
      ['外部身份变化用 key 重置', '切换客户时若希望整张表单回到初始值，可在父组件渲染 `<CustomerForm key={customer.id} />`，让 React 卸载旧组件并挂载新组件。这样比在 Effect 中逐个 setState 更可预测。失败边界是关键 key 误用了可编辑字段，导致每次输入都重置；验证动作是切换两个客户并断言表单字段正确，再编辑同一客户字段确认不会被重置。', '身份变了就换组件实例'],
      ['用交互矩阵证明最小状态', '列出加载、筛选、选择、错误四类变化，分别问哪些数据能算、哪些必须保存；为每种状态写一个用户操作与可见断言。失败边界是删状态后隐藏了必须恢复的服务端页码；验证动作是把 URL、查询缓存和组件状态分层记录，刷新深链接后确认筛选、页码和排序都能从持久来源恢复。', '状态越少越要验证恢复'],
    ],
  }),
  reactCourse(r1Stage, '受控表单、校验和服务器错误', {
    minutes: 45,
    prerequisite: '能处理浏览器 form submit 与 input change，理解 HTML 表单的原生约束和 HTTP 请求错误。',
    goal: '能实现受控表单字段、客户端校验、提交中状态、服务器字段错误与焦点恢复，并说明受控和非受控输入各自适用边界。',
    guidedPractice: '制作注册表单，name、email、password 使用 value/onChange，提交时阻止默认行为并执行校验；再让测试服务器返回 `{ fields: { email: "已注册" } }`，把错误映射到输入项旁并聚焦第一个错误字段。',
    independentPractice: '把注册表单改成可复用的 FormField，支持 label、hint、aria-invalid 和错误文本；为重复提交、网络断开、字段错误和成功跳转四条路径写 RTL 与浏览器测试。',
    commonErrors: [
      '只发送表单但输入框 value 从不更新，用户键入后字符立即消失或被 React 警告覆盖。',
      '服务器返回字段错误后仍给成功 toast，或者错误没有关联到 input，屏幕阅读器不知道哪个字段失败。',
    ],
    sourceRefs: ['React forms. https://react.dev/reference/react-dom/components/form', 'WAI forms tutorial. https://www.w3.org/WAI/tutorials/forms/', 'React input reference. https://react.dev/reference/react-dom/components/input'],
    steps: [
      ['受控值由 state 决定', '输入框写 `value={form.email}`，onChange 用 `setForm(prev => ({ ...prev, email: event.target.value }))` 更新唯一事实源。React 会在每次按键后重新渲染并把值写回 DOM，因此格式化和拒绝非法字符都可在更新前完成。失败边界是 value 固定而 onChange 不更新，输入变成只读；验证动作是键入后同时检查 state 快照、DOM value 和提交流载荷，三者应一致。', 'state 是输入值来源'],
      ['提交是事务而不是按钮单击', 'form 的 onSubmit 先阻止默认页面刷新，再进入 validating、submitting 状态；按钮在 in-flight 时禁用，但服务端仍要使用幂等键防重复。客户端校验只改善反馈，不能替代服务端授权与唯一性检查。失败边界是网络延迟时连点创建两个账号；验证动作是模拟慢请求并点击两次，确认请求数、按钮状态和最终记录都只有一份。', '客户端与服务端双重校验'],
      ['错误要绑定到字段和焦点', '服务器返回结构化 fields 后，把错误存到 `errors.email`，给 input 设置 `aria-invalid` 和 `aria-describedby`，并把 focus 移到第一个错误控件。表单级错误使用 role="alert" 或摘要链接。失败边界是所有错误只显示在顶部纯文本，键盘用户不知道要返回哪里；验证动作是开启屏幕阅读器或无障碍树检查 label、说明与焦点顺序，再确认首个错误控件可立即编辑。', '错误必须可定位'],
      ['受控与非受控各有适用面', '受控适合实时联动、格式化、复杂校验和动态字段；非受控通过 defaultValue、FormData 和 ref 可减少每次键入的重渲染，适合简单提交或文件输入。两者混用时要明确谁拥有值。失败边界是给 file input 写 value 或在非受控输入上读取过期 state；验证动作是分别用 FormData 读取简单表单、用受控测试验证动态字段，确认提交对象字段完整。', '先确定值所有权'],
      ['表单测试覆盖错误恢复', '用 userEvent 填写字段、点击提交、等待 submitting 状态结束；断言同名字段错误与 input 的 aria-describedby 关联，修正后错误消失并重新允许提交。不要只断言函数被调用。失败边界是错误文本消失但错误 state 仍在，第二次提交仍被阻止；验证动作是修正邮箱后再提交，检查第二次载荷和成功页面，并确认焦点回到可继续操作的位置。', '验证从错误到成功的完整恢复'],
    ],
  }),
  reactCourse(r1Stage, 'Reducer 与联合状态机', {
    minutes: 48,
    prerequisite: '熟悉 TypeScript 可辨识联合、switch 穷尽检查和 React state，能阅读 useReducer 的基本签名。',
    goal: '能用 useReducer 把复杂交互收束为纯状态转换，以联合 action 排他状态，并通过 Context 提供 dispatch 和只读状态。',
    guidedPractice: '把上传流程的 isUploading、isSuccess、errorMessage 三个布尔和字符串改为 `idle | uploading | success | error` 联合状态；为 START、PROGRESS、SUCCESS、FAIL 写 reducer，用 `assertNever` 检查遗漏 action。',
    independentPractice: '实现带撤销的权限编辑面板，使用 reducer 管理 rows、selectedId、history 和 modal；通过 Context 暴露 state 与 dispatch，写表驱动测试验证非法转换不会清空已有数据。',
    commonErrors: [
      '在 reducer 内直接发 fetch、写 localStorage 或修改 action，导致纯状态转换无法重放和测试。',
      '用多个布尔变量表示互斥状态，出现 loading 与 error 同时为真的不可能组合。',
    ],
    sourceRefs: ['React useReducer. https://react.dev/reference/react/useReducer', 'React scaling with reducer and context. https://react.dev/learn/scaling-up-with-reducer-and-context', 'TypeScript discriminated unions. https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions'],
    steps: [
      ['把界面写成离散状态', '上传流程用 `{ type: "uploading"; progress: number } | { type: "success"; fileId: string } | { type: "error"; message: string }` 表达，每个分支只携带合法字段。渲染时通过 type 收窄读取 progress 或 fileId，互斥条件不再依靠多个布尔拼接。失败边界是添加了 idle 却忘记处理，界面落入空分支；验证动作是让 reducer 的 switch 默认分支调用 `assertNever(action)`，编译期指出漏项并阻止合并。', '互斥状态用联合表达'],
      ['reducer 返回下一份完整状态', '`function reducer(state: State, action: Action): State` 根据当前 state 与 action 返回新对象，不修改输入、不读取 Date.now 以外未注入的环境值。需要时间或随机数时由 action 携带，保证同一输入可重放。失败边界是 reducer 执行两次产生不同结果；验证动作是直接对 reducer 写纯函数测试，连续调用同一组 actions 得到完全相同的状态，并冻结输入检查没有 mutation。', '转换只依赖输入'],
      ['dispatch 只描述发生了什么', '事件处理器调用 `dispatch({ type: "submit", payload })`，而不是在组件里拆开多个 setState。异步请求通常由事件处理器或自定义 Hook 发起，成功后 dispatch 结果 action；reducer 不承担网络副作用。失败边界是把 Promise 对象放进 state，导致序列化与比较困难；验证动作是记录 action 时间线，确认每个 action 可序列化、可重放且请求只发生一次，失败时也能 dispatch 明确错误。', 'action 记录事实'],
      ['Context 分离状态与写入能力', '创建 `EditorStateContext` 与 `EditorDispatchContext`，读取组件只订阅 state，触发按钮只订阅稳定的 dispatch；Provider value 用 useMemo 避免无意义变化。分开 Context 可减少无关消费者更新。失败边界是 Context 默认值给了可变空对象，脱离 Provider 时悄悄运行；验证动作是让 `useEditorState` 在缺失 Provider 时抛错，并用 Profiler 检查 dispatch-only 组件不随 rows 重渲染，同时比较拆分前后提交范围与消费者数量。', '读写 Context 可拆分'],
      ['非法转换必须被拒绝', '从 success 收到 START 时通常应回到 uploading，从 error 收到 PROGRESS 则可能保持错误或忽略，规则由业务决定并写进 reducer。历史撤销需要把可恢复字段作为快照，不能把函数和 AbortController 存进历史。失败边界是用户取消后迟到的 SUCCESS 把界面改回成功；验证动作是给 reducer 注入带请求序号的 action，测试旧请求不能越过取消状态，并检查 history 不含瞬时资源。', '迟到事件也要按状态机处理'],
    ],
  }),
  reactCourse(r1Stage, '表单状态与交互测试', {
    minutes: 51,
    prerequisite: '已能编写 RTL 测试、使用 userEvent，并理解受控表单与 reducer 状态转换。',
    goal: '能为多步骤表单建立用户行为测试矩阵，覆盖字段联动、校验、异步提交、服务器错误、返回上一步和数据保留，而不是只测组件树快照。',
    guidedPractice: '为三步结算表单写测试：填写地址后进入支付，返回上一步确认输入仍在，提交错误卡号后定位错误字段；每个测试只通过 label、role 和可见文本操作，不调用组件内部 setState。',
    independentPractice: '为带优惠码的注册流程补完整测试，包括大小写规范化、异步验证、网络失败、重复提交和最终跳转；把可访问名称与错误关联作为断言的一部分。',
    commonErrors: [
      '用快照测试替代交互验证，表单逻辑坏掉但快照更新后仍显示通过。',
      '每个字段测试都直接改 DOM value，绕过 React 事件和受控状态，测试结果与真实用户操作不一致。',
    ],
    sourceRefs: [testingLibraryDocs, 'Testing Library queries. https://testing-library.com/docs/queries/about/', 'Vitest mocking. https://vitest.dev/guide/mocking.html'],
    steps: [
      ['先定义用户任务', '测试名称应描述用户结果，例如“填写有效地址后可继续到支付”与“返回上一步保留已填地址”，而不是“setStep 被调用”。每个任务只覆盖一条主路径和一个关键失败路径。失败边界是测试内部调用 nextStep 跳过界面，无法发现按钮禁用或标签错误；验证动作是仅暴露 render 与用户事件，从真实控件推进流程。', '测试任务而非实现'],
      ['查询稳定语义而非样式', '为输入绑定 `<label htmlFor>`，用 `getByLabelText("邮箱")`，为步骤标题使用 heading，为状态消息使用 role=status 或 alert。不要依赖生成 class 或 DOM 层级。失败边界是两个输入都叫“名称”导致查询歧义；验证动作是运行无障碍查询，补充“联系人姓名”“公司名称”等可区分标签，并保证错误说明通过 aria-describedby 关联且可被读屏读出，动态错误也能被再次感知。', '标签是测试接口'],
      ['异步验证使用可控时钟', '优惠码校验可能 debounce 300ms，测试用 fake timers 推进时间，再 mock fetch 返回有效或无效结果。每次等待都通过 `findByText` 等条件查询，避免固定 sleep。失败边界是测试结束时还有未恢复计时器或请求；验证动作是检查 mock 调用次数、清理函数和 act 警告，并在改网络延迟后重复运行，确认结果不依赖执行顺序。', '控制时间与请求'],
      ['错误恢复也要被测', '服务器返回错误后，测试确认字段仍保留、错误可见、焦点落在首个错误；用户修正后，旧错误应清除并允许再次提交。失败边界是错误 state 永久阻塞提交；验证动作是断言第二次请求载荷与按钮状态，完成从失败到成功的整条路径，并确认成功提示不再引用旧错误。', '错误之后仍可完成'],
      ['交互矩阵连接浏览器层', 'RTL 覆盖单组件和表单状态，Playwright 再覆盖真实路由、浏览器后退、移动键盘与网络请求。两层测试共享用户场景名称，但浏览器层只保留跨页面价值。失败边界是把所有字段组合都放进 E2E，导致执行慢且脆弱；验证动作是按风险选一个完整用户旅程，并在 CI 报告中区分失败属于组件逻辑、路由还是部署环境。', '分层测试不同风险'],
    ],
  }),
];

Object.assign(reactExamples, {
  'Hooks 调用规则与渲染快照': [
    reactExample(
      '条件 Hook 触发顺序错误',
      'TSX + Browser Console',
      `import { useEffect, useState } from 'react';
export function Broken({ enabled }: { enabled: boolean }) {
  const [count] = useState(0);
  if (enabled) {
    useEffect(() => console.log('enabled'), []);
  }
  const [name] = useState('Ada');
  return <p>{count} / {name}</p>;
}

// 先 render(<Broken enabled={false} />)，再切换为 true
// 控制台应出现 Rendered more hooks than during the previous render`,
      `从 false 切到 true 后 React 报 Hook 数量变化，页面无法稳定渲染。
失败边界：把 useEffect 移到提前 return 之后同样改变 Hook 链表，即使没有 if 也会报错。`,
    ),
    reactExample(
      'eslint-plugin-react-hooks 阻止条件调用',
      'PowerShell',
      `npm install -D eslint @eslint/js eslint-plugin-react-hooks
@'
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
export default [
  js.configs.recommended,
  { plugins: { 'react-hooks': reactHooks }, rules: reactHooks.configs.recommended.rules },
];
'@ | Set-Content eslint.config.js
npx eslint src/Broken.tsx`,
      `ESLint 输出 react-hooks/rules-of-hooks 错误，指向 if 分支中的 useEffect。
失败边界：关闭该规则后运行时仍会报错，lint 通过不代表 Hook 顺序安全。`,
    ),
    reactExample(
      '定时器闭包读取旧 count',
      'TSX + Vitest',
      `export function DelayedCounter() {
  const [count, setCount] = useState(0);
  const addLater = () => {
    setTimeout(() => setCount(value => value + 1), 100);
  };
  return <button onClick={() => { setCount(value => value + 1); addLater(); }}>
    count: {count}
  </button>;
}

// 连续点击两次并推进 fake timer，断言最终 count 为 4`,
      `每次点击先加 1，定时器回调再读取最新待处理值加 1，最终总数为 4。
失败边界：回调写成 setCount(count + 1) 会捕获旧快照，定时器累加可能始终只加一次。`,
    ),
    reactExample(
      'dispatch 后 state 尚未赋值',
      'TSX + Vitest',
      `export function GuardedAdd({ onAdded }: { onAdded: (next: number) => void }) {
  const [count, setCount] = useState(0);
  const add = () => {
    setCount(value => value + 1);
    onAdded(count + 1);
  };
  return <button onClick={add}>当前 {count}</button>;
}

// 从 count=0 点击后，界面变为 1，onAdded 收到 1`,
      `事件内 state 仍是 0，但函数式更新预计下一值为 1，界面提交后显示 1。
失败边界：setCount 后立即用 count 作为是否允许下一次点击的条件，会基于旧快照判断。`,
    ),
    reactExample(
      '自定义 Hook 状态实例彼此独立',
      'TSX + Testing Library',
      `function useToggle(initial = false) {
  const [value, setValue] = useState(initial);
  return [value, () => setValue(current => !current)] as const;
}

function Switch({ name }: { name: string }) {
  const [on, toggle] = useToggle();
  return <button onClick={toggle}>{name}:{on ? '开' : '关'}</button>;
}

render(<><Switch name="A" /><Switch name="B" /></>);
await user.click(screen.getByRole('button', { name: 'A:关' }));
expect(screen.getByRole('button', { name: 'A:开' })).toBeVisible();
expect(screen.getByRole('button', { name: 'B:关' })).toBeVisible();`,
      `点击 A 后 A 显示开，B 仍显示关，两个 useToggle 实例互不共享状态。
失败边界：把 state 放在模块顶层会让所有同名 Hook 消费者共享变量，互相污染。`,
    ),
  ],
  'useEffect 同步外部系统': [
    reactExample(
      'Effect 在 DOM 提交后同步标题',
      'TSX + Testing Library',
      `export function ActiveCourse({ title }: { title: string }) {
  useEffect(() => {
    document.title = '正在学习：' + title;
  }, [title]);
  return <h1>{title}</h1>;
}

render(<ActiveCourse title="React Effect" />);
await waitFor(() => expect(document.title).toBe('正在学习：React Effect'));
expect(screen.getByRole('heading')).toHaveTextContent('React Effect');`,
      `测试确认标题在 DOM 提交后更新为“正在学习：React Effect”，不会在 render 期间改外部状态。
失败边界：把 document.title 直接写在 render 中，StrictMode 会重复执行并产生不可控副作用。`,
    ),
    reactExample(
      '监听器 setup 与 cleanup 成对',
      'TSX + Vitest',
      `export function OnlineBadge() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return <span>{online ? '在线' : '离线'}</span>;
}
// 卸载组件后派发 offline，确认不再报 act 更新`,
      `挂载时显示在线，派发 offline 后变为离线，卸载后监听器被移除。
失败边界：cleanup 使用新的匿名函数无法移除原监听器，事件会继续更新已卸载组件。`,
    ),
    reactExample(
      '依赖完整才能同步 room',
      'TSX + Vitest',
      `export function RoomStatus({ roomId }: { roomId: string }) {
  const [status, setStatus] = useState('连接中');
  useEffect(() => {
    const socket = new WebSocket('/rooms/' + roomId);
    socket.onopen = () => setStatus('已连接：' + roomId);
    return () => socket.close();
  }, [roomId]);
  return <p>{status}</p>;
}

// rerender(<RoomStatus roomId="react-101" />);
// expect(await screen.findByText('已连接：react-101')).toBeVisible();`,
      `roomId 变化时关闭旧 WebSocket 并建立新连接，文本显示新房间。
失败边界：依赖写成空数组会一直连接首个 room，切换页面后仍收到旧房间数据。`,
    ),
    reactExample(
      '媒体查询使用 useSyncExternalStore',
      'TSX + Testing Library',
      `const query = '(max-width: 700px)';
const media = window.matchMedia(query);
const subscribe = (callback: () => void) => {
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
};

export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// expect(useIsMobileSnapshot()).toBe(true); // mock matchMedia 后验证`,
      `订阅变更后 matchMedia 的快照变化会同步到组件，服务端快照稳定为 false。
失败边界：服务端缺少 getServerSnapshot 时 hydration 读取 window 会直接抛错。`,
    ),
    reactExample(
      'Effect 连接与断开可重复验证',
      'TSX + Vitest',
      `const connect = vi.fn(() => ({ close: vi.fn() }));
export function SocketProbe() {
  useEffect(() => {
    const connection = connect();
    return () => connection.close();
  }, []);
  return <span>已连接</span>;
}

const { unmount } = render(<SocketProbe />);
expect(connect).toHaveBeenCalledTimes(1);
unmount();
expect(connect.mock.results[0].value.close).toHaveBeenCalledTimes(1);`,
      `挂载时 connect 调用一次，卸载时对应 close 调用一次，资源生命周期成对。
失败边界：开发 StrictMode 下 setup 会再次执行，若缺少 cleanup 会积累两条连接。`,
    ),
  ],
  '依赖、闭包和清理函数': [
    reactExample(
      '依赖变化重新建立 interval',
      'TSX + Vitest',
      `export function Tick({ intervalMs }: { intervalMs: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(value => value + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return <output>{tick}</output>;
}

vi.useFakeTimers();
const { rerender } = render(<Tick intervalMs={1000} />);
await vi.advanceTimersByTimeAsync(1000);
expect(screen.getByRole('status')).toHaveTextContent('1');
rerender(<Tick intervalMs={500} />);
await vi.advanceTimersByTimeAsync(500);
expect(screen.getByRole('status')).toHaveTextContent('2');`,
      `依赖从 1000 变为 500 后旧 interval 被清理，新周期只再增加一次。
失败边界：省略 intervalMs 依赖会让定时器一直使用首次传入的周期。`,
    ),
    reactExample(
      'Effect 闭包捕获旧 message',
      'Browser Console',
      `function demo(setMessage: (value: string) => void) {
  let message = 'A';
  useEffect(() => {
    const save = () => console.log('保存：' + message);
    save();
    message = 'B';
  }, []);
  setMessage(message);
}

// 打开控制台执行等价实验，观察保存日志为 A`,
      `Effect 内首次执行日志仍为“保存：A”，之后局部变量改成 B 不会改变已捕获值。
失败边界：异步回调依赖当前 message 时必须更新依赖或在触发时读取最新外部 store，否则保存旧值。`,
    ),
    reactExample(
      'Effect 不直接返回 Promise',
      'TSX + TypeScript',
      `export function AsyncCleanup({ signal }: { signal: AbortSignal }) {
  useEffect(() => {
    async function load() {
      const response = await fetch('/api/health', { signal });
      console.log(await response.text());
    }
    void load();
  }, [signal]);
  return <p>加载中</p>;
}

// pnpm eslint src/AsyncCleanup.tsx
// 检查没有 Promise returned from useEffect 警告`,
      `挂载后发起一次请求，signal 变化时新 Effect 建立新的请求边界。
失败边界：直接写 useEffect(async () => {}, []) 会把 Promise 当 cleanup，React 发出警告且忽略返回值。`,
    ),
    reactExample(
      'AbortController 取消过期请求',
      'TSX + Vitest',
      `export function QueryText({ query }: { query: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/search?q=' + encodeURIComponent(query), { signal: controller.signal })
      .then(response => response.text())
      .then(setText)
      .catch(error => {
        if (error.name !== 'AbortError') setText('请求失败');
      });
    return () => controller.abort();
  }, [query]);
  return <p>{text}</p>;
}

// mock fetch 使第二次 query 先完成，断言旧响应不会覆盖新结果`,
      `快速输入两个关键词时旧请求收到 AbortError，页面只保留最新查询结果。
失败边界：cleanup 只清空 text 却不 abort 请求，迟到响应仍会把旧结果写回。`,
    ),
    reactExample(
      '第三方控件销毁匹配创建',
      'TSX + Vitest',
      `const createChart = vi.fn(() => ({ destroy: vi.fn() }));
export function ChartHost() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const chart = createChart();
    return () => chart.destroy();
  }, []);
  return <div ref={ref} />;
}

const { unmount } = render(<ChartHost />);
expect(createChart).toHaveBeenCalledTimes(1);
unmount();
expect(createChart.mock.results[0].value.destroy).toHaveBeenCalledTimes(1);`,
      `Chart 实例在挂载时创建一次，卸载时 destroy 一次，没有内存泄漏。
失败边界：StrictMode 下 setup-cleanup-setup 会创建两次但只保留一个实例，缺少清理就泄漏。`,
    ),
  ],
  'useMemo、useCallback 与性能误区': [
    reactExample(
      'memo 子组件先检查 props 引用',
      'TSX + Profiler',
      `const Expensive = memo(function Expensive({ row }: { row: { id: string } }) {
  console.log('render', row.id);
  return <span>{row.id}</span>;
});
export function Parent() {
  const [q, setQ] = useState('');
  return <>
    <input value={q} onChange={e => setQ(e.target.value)} />
    <Expensive row={{ id: 'react' }} />
  </>;
}

// 输入时 Profiler 显示 Expensive 仍重渲染，因为 row 每次是新对象`,
      `输入字符时 Expensive 日志持续出现，memo 未阻止提交。
失败边界：只加 memo 而不稳定 row 引用，浅比较仍失败，优化没有实际收益。`,
    ),
    reactExample(
      'useMemo 缓存排序结果',
      'TSX + Profiler',
      `export function RankedList({ rows, keyword }: {
  rows: Array<{ id: string; name: string }>;
  keyword: string;
}) {
  const ranked = useMemo(() => rows
    .filter(row => row.name.includes(keyword))
    .toSorted((a, b) => a.name.localeCompare(b.name)), [rows, keyword]);
  return <ol>{ranked.map(row => <li key={row.id}>{row.name}</li>)}</ol>;
}

// 相同 rows 与 keyword 下重渲染，Profiler 的排序耗时不再重复`,
      `关键字不变时直接复用排名结果，Profiler 中列表计算段耗时下降。
失败边界：useMemo 依赖遗漏 rows 时新增数据仍显示旧列表，缓存会制造错误结果。`,
    ),
    reactExample(
      'useCallback 稳定回调身份',
      'TSX + Profiler',
      `const Child = memo(function Child({ onSave }: { onSave: () => void }) {
  console.log('child render');
  return <button onClick={onSave}>保存</button>;
});
export function Editor({ save }: { save: () => void }) {
  const [draft, setDraft] = useState('');
  const handleSave = useCallback(() => save(), [save]);
  return <><input value={draft} onChange={e => setDraft(e.target.value)} />
    <Child onSave={handleSave} /></>;
}
// 输入草稿时 Child 不应重渲染`,
      `输入草稿导致父组件 render，但 Child 的回调身份不变，Profiler 中不再提交子组件。
失败边界：useCallback 依赖漏掉 save 时，父级替换保存逻辑后按钮仍调用旧函数。`,
    ),
    reactExample(
      '拆状态缩小重渲染范围',
      'TSX + Profiler',
      `function SearchInput() {
  const [query, setQuery] = useState('');
  return <input aria-label="搜索" value={query} onChange={e => setQuery(e.target.value)} />;
}
function StableChart() {
  console.log('chart render');
  return <div>图表</div>;
}
export function Dashboard() {
  return <><SearchInput /><StableChart /></>;
}

// 在 Profiler 中输入字符，StableChart 不随父 state 更新`,
      `输入只更新 SearchInput 自身，StableChart 没有新的 render 日志。
失败边界：把 query 提升到父级 state 会让整页子树都参与比较，缓存只能事后补救。`,
    ),
    reactExample(
      '优化前后用生产构建比较',
      'PowerShell + Profiler',
      `pnpm build
pnpm preview --host 127.0.0.1
@'
{ "cpuThrottling": 4, "network": "Fast 3G", "scenario": "search-1000-rows" }
'@ | Set-Content perf-scenario.json
Get-FileHash perf-scenario.json
# 在 React Profiler 录制相同键入序列并导出 JSON`,
      `优化前后的 Profiler 都使用相同场景文件，记录 p50/p95 提交耗时与输入延迟。
失败边界：只在开发模式看到一个更快截图，不能证明生产用户在低端设备上的收益。`,
    ),
  ],
  '并发渲染、转场和可中断工作': [
    reactExample(
      '输入即时更新，列表进入 transition',
      'TSX + Browser Performance',
      `export function SearchPage() {
  const [query, setQuery] = useState('');
  const [listQuery, setListQuery] = useState('');
  const updateList = (value: string) => {
    setListQuery(value);
  };
  const onChange = (value: string) => {
    setQuery(value);
    startTransition(() => updateList(value));
  };
  return <><input value={query} onChange={e => onChange(e.target.value)} />
    <SlowList query={listQuery} /></>;
}
// 4x CPU 节流下快速键入，观察 input 与列表提交顺序`,
      `输入框字符立即出现，慢列表稍后更新，长任务不再阻塞每次按键回显。
失败边界：把 setQuery 也包进 transition 会让输入回显排队，键入体验反而变差。`,
    ),
    reactExample(
      'useTransition 展示挂起状态',
      'TSX + Testing Library',
      `export function FilterButton({ onApply }: { onApply: () => Promise<void> }) {
  const [isPending, startTransition] = useTransition();
  return <button onClick={() => startTransition(async () => {
    await onApply();
  })}>{isPending ? '更新中' : '应用筛选'}</button>;
}
// 延迟 Promise 期间断言按钮文本为“更新中”`,
      `点击后按钮立即进入“更新中”，Promise 结束后恢复“应用筛选”。
失败边界：isPending 只反映 transition 任务，不能替代真正的网络提交状态或错误处理。`,
    ),
    reactExample(
      'useDeferredValue 延后昂贵结果',
      'TSX + Profiler',
      `export function QuickSearch({ query, rows }: { query: string; rows: string[] }) {
  const deferred = useDeferredValue(query);
  const stale = deferred !== query;
  return <>
    <output>当前关键词：{query}</output>
    <ul style={{ opacity: stale ? 0.6 : 1 }}>
      {rows.filter(row => row.includes(deferred)).map(row => <li key={row}>{row}</li>)}
    </ul>
  </>;
}
// 快速键入时看到旧列表短暂降透明度，最终追上最新 query`,
      `输入值先更新，列表消费 deferred 值并在后台计算，旧结果带有可见滞后状态。
失败边界：deferred 不是防抖，不会减少总计算量；请求副作用也仍要自己取消。`,
    ),
    reactExample(
      'render 可让出但 commit 保持完整',
      'TSX + Performance',
      `function SlowTree() {
  const rows = Array.from({ length: 5000 }, (_, index) => <li key={index}>{index}</li>);
  return <ul>{rows}</ul>;
}
export function AsyncPage() {
  const [show, setShow] = useState(false);
  return <><button onClick={() => startTransition(() => setShow(true))}>展开</button>
    {show && <SlowTree />}</>;
}
// Performance 中观察 render 让出与单次 commit 的 DOM 插入`,
      `展开时 render 可分片让出，但真正 commit 阶段一次完成可见 DOM 更新。
失败边界：把巨型同步循环塞进单个组件仍形成长任务，Fiber 不能自动拆分任意 JS 计算。`,
    ),
    reactExample(
      '并发策略用 INP 与键入延迟验收',
      'PowerShell + Browser',
      `@'
{
  "scenario": "type-20-chars-with-5000-rows",
  "cpuThrottle": 4,
  "metrics": ["input-delay-p95", "INP", "long-task-count"]
}
'@ | Set-Content concurrency-metrics.json
# 分别在无 transition、transition、deferred 三档录制 Performance
Get-FileHash concurrency-metrics.json`,
      `三组记录使用同一设备和输入序列，比较 p95 输入延迟、INP 候选和长任务数量。
失败边界：只看最终列表变快，却忽略输入框卡顿，不能证明并发策略改善了用户感知。`,
    ),
  ],
  '异步 Hook 与竞态回归': [
    reactExample(
      '异步状态使用可辨识联合',
      'TSX + TypeScript',
      `type Result =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: string[] }
  | { status: 'error'; message: string };

function view(result: Result) {
  if (result.status === 'loading') return '加载中';
  if (result.status === 'error') return result.message;
  if (result.status === 'success') return result.data.join(',');
  return '等待搜索';
}
// 类型检查确保 success 分支才读取 data`,
      `每个异步阶段只暴露合法字段，success 分支可以安全读取 data 数组。
失败边界：data、loading、error 三个独立字段容易产生 loading=true 且 error 有值的组合。`,
    ),
    reactExample(
      'Effect 创建并取消 fetch',
      'TSX + Vitest',
      `export function UserName({ id }: { id: string }) {
  const [name, setName] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/users/' + id, { signal: controller.signal })
      .then(response => response.json())
      .then(user => setName(user.name))
      .catch(error => { if (error.name !== 'AbortError') setName('加载失败'); });
    return () => controller.abort();
  }, [id]);
  return <p>{name || '加载中'}</p>;
}
// 切换 id 后旧 fetch 应收到 abort`,
      `切换用户时旧请求被取消，页面最终显示新用户的姓名。
失败边界：组件卸载后 fetch 仍 resolve，会触发对已卸载组件 setState 的警告或资源泄漏。`,
    ),
    reactExample(
      'requestId 防住不可取消响应',
      'TSX + Vitest',
      `export function SearchResult({ query }: { query: string }) {
  const [result, setResult] = useState('');
  const latest = useRef(0);
  useEffect(() => {
    const id = ++latest.current;
    fetch('/api/search?q=' + query).then(r => r.text()).then(text => {
      if (id === latest.current) setResult(text);
    });
  }, [query]);
  return <p>{result}</p>;
}
// 让旧请求后完成，断言最终仍显示新 query 的结果`,
      `旧请求响应到达时 id 已过期，不会覆盖最新结果。
失败边界：即使 fetch 无法 abort，最新序号也能保护 UI；没有序号时旧响应可覆盖新查询。`,
    ),
    reactExample(
      '重试使用预算与指数退避',
      'TSX + Vitest',
      `async function loadWithRetry(fetchPage: () => Promise<string>, retries = 2) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try { return await fetchPage(); } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 300 * 2 ** attempt));
    }
  }
  throw lastError;
}

const fetchPage = vi.fn().mockRejectedValueOnce(new Error('503'))
  .mockResolvedValueOnce('page-2');
expect(await loadWithRetry(fetchPage)).toBe('page-2');`,
      `第一次 503 后等待 300ms 再请求，第二次成功返回 page-2。
失败边界：无条件无限重试会在服务端故障时放大流量，必须限制预算并区分可重试错误。`,
    ),
    reactExample(
      '竞态测试控制两个 Promise',
      'TSX + Testing Library',
      `let resolveOld!: (value: string) => void;
let resolveNew!: (value: string) => void;
const fetcher = vi.fn()
  .mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
  .mockReturnValueOnce(new Promise(resolve => { resolveNew = resolve; }));

const { rerender } = render(<SearchResult query="a" fetcher={fetcher} />);
rerender(<SearchResult query="ab" fetcher={fetcher} />);
resolveNew('新结果');
resolveOld('旧结果');
expect(await screen.findByText('新结果')).toBeVisible();
expect(screen.queryByText('旧结果')).not.toBeInTheDocument();`,
      `先完成新请求、后完成旧请求时，页面最终仍显示“新结果”。
失败边界：只测正常顺序响应无法发现竞态，必须显式控制两个 Promise 的完成顺序。`,
    ),
  ],
});

const r2Stage = 'Hooks、Effect 与并发渲染';

export const HANDWRITTEN_REACT_R2_COURSES: readonly ProgrammingCourseSeed[] = [
  reactCourse(r2Stage, 'Hooks 调用规则与渲染快照', {
    minutes: 36,
    prerequisite: '已使用过 useState、useEffect，理解组件函数每次 render 会重新执行并创建新的局部变量。',
    goal: '能说明 Hooks 依赖固定调用顺序与内部 dispatcher 的原因，识别条件 Hook 错误，并用渲染快照解释闭包中的旧 state。',
    guidedPractice: '在一个组件中故意把 useEffect 放进 if 分支，触发 “Rendered more hooks than during the previous render”；删除分支后再打印每次 render 的 count 与定时器回调读到的 count，比较两份快照。',
    independentPractice: '把一段混用条件 Hook、类实例字段和手工计数器的组件改为顶层 Hooks，记录每次提交的 Hook 顺序、状态值与清理动作，并用 ESLint 和 RTL 证明修复后行为稳定。',
    commonErrors: [
      '认为 Hook 名称只是普通函数，可以在循环或提前 return 后按需调用。',
      '把当前 render 的 state 当成实时可变量，忽略异步回调捕获的是旧快照。',
    ],
    sourceRefs: ['Rules of Hooks. https://react.dev/reference/rules/rules-of-hooks', 'React state as a snapshot. https://react.dev/learn/state-as-a-snapshot', reactDocs],
    steps: [
      ['Hook 顺序就是内部身份', 'React 在函数组件执行时用当前 dispatcher 记录 useState、useEffect 等调用顺序，第一个 Hook 对应链表第一节，第二个对应下一节。每次 render 必须走同一条路径，React 才能把旧状态与本次调用配对。失败边界是条件分支让第二、第三次 render 的 Hook 数不同；验证动作是移除提前 return 后的 Hook，并在开发模式对照错误前后的组件源码。', '顺序即 Hook 的身份'],
      ['React hook lint 规则在编写时拦截', '`eslint-plugin-react-hooks` 会检查 Hook 是否位于顶层、依赖是否遗漏以及条件调用。它不能证明业务正确，但能抓住大多数结构错误。自定义 Hook 必须以 use 开头并同样只调用 Hook，普通函数不能隐藏在内部偷偷调用。失败边界是关闭规则后提交了动态 Hook 数；验证动作是在 CI 中运行 lint，并把规则失败与浏览器运行时错误都作为阻断项。', '工具先拦住结构错误'],
      ['每次 render 拥有独立快照', '当 count 为 0 时安排的 setTimeout 闭包读到 count=0，即使稍后 count 变成 2，旧闭包也不会被修改。需要在触发时读取最新待处理值可用函数式更新，需要跨 render 保留可变对象可用 useRef。失败边界是定时器累加永远只加一次；验证动作是连续点击后等待回调，分别用普通 setCount 和 setCount(c => c + 1) 记录最终值，并给回调查看创建时的快照。', '闭包捕获当时快照'],
      ['状态更新排队而非立即赋值', 'useState 与 useReducer 的 dispatch 把更新加入队列，React 在合适时机重新 render 并计算新快照；同一事件中的多次更新按顺序处理。Effect 看到的是本次提交后的值，事件处理器看到的是本次 render 的值。失败边界是读取 dispatch 后立即读取 state 做校验；验证动作是把校验放到下一次 render 或 updater 中，并用测试证明条件基于新值。', 'dispatch 之后值仍暂时不变'],
      ['自定义 Hook 组合而非共享实例', '两个组件调用同一个 `useOnlineStatus()` 会各自拥有独立 state 与 Effect，除非底层订阅的是同一外部单例。自定义 Hook 返回的函数也要稳定或有明确身份。失败边界是以为同名 Hook 会自动共享缓存；验证动作是同时挂载两个消费者，触发浏览器 online/offline，确认状态来源是共享外部事件而实例状态仍独立，或用 Context 改成真正共享。', '复用逻辑不自动复用状态'],
    ],
  }),
  reactCourse(r2Stage, 'useEffect 同步外部系统', {
    minutes: 39,
    prerequisite: '能订阅浏览器事件或 WebSocket，并理解 React 提交后 DOM 已更新的基本时序。',
    goal: '能判断何时需要 Effect，用 setup 与 cleanup 同步事件监听、连接或第三方实例，并区分渲染计算、事件处理器和外部同步三类工作。',
    guidedPractice: '为窗口在线状态创建 useOnlineStatus：Effect 内读取 navigator.onLine 并监听 online/offline，返回清理函数移除监听；用 DevTools 切换网络并记录每次 setup 与 cleanup 的执行次数。',
    independentPractice: '封装一个地图容器，挂载后创建第三方 Map 实例，props 改变时调用 setCenter，卸载时 destroy；补测试证明重复创建被清理、旧回调不会写入已卸载容器。',
    commonErrors: [
      '把本可在 render 计算的过滤结果放进 Effect，再 setState 保存，造成额外提交与状态漂移。',
      '订阅了事件或创建连接却不返回清理函数，StrictMode 开发重复挂载后出现多个监听器。',
    ],
    sourceRefs: ['React useEffect. https://react.dev/reference/react/useEffect', 'React synchronizing with effects. https://react.dev/learn/synchronizing-with-effects', 'useSyncExternalStore. https://react.dev/reference/react/useSyncExternalStore'],
    steps: [
      ['Effect 在提交之后同步外部', '组件先根据 props 与 state 生成 DOM，React 完成 commit 后才运行 useEffect，此时可以安全测量或连接会读取 DOM 的第三方库。它适合浏览器订阅、非 React 控件、日志与网络连接，不适合仅由 props 计算出的值。失败边界是把布局尺寸写入 Effect 再渲染第二次，先闪一帧错误位置；验证动作是用 Performance 和截图确认首帧，必要时改用 useLayoutEffect 并解释其阻塞绘制成本。', '先提交再同步外部'],
      ['setup 返回 cleanup 配对资源', '`const unsubscribe = store.subscribe(callback); return unsubscribe` 让每次 Effect 重跑前先清理旧订阅，再把新订阅接上。连接、定时器、事件监听和 observer 都应沿同一成对模式管理。失败边界是 cleanup 没移除同一个函数引用或异步创建的资源尚未完成；验证动作是连续改变依赖三次，确认 subscribe 与 unsubscribe 次数相等，且最终只剩一个监听器，并比较回调引用。', '每个资源都有释放动作'],
      ['依赖表达 Effect 读取值', 'Effect 读取 roomId 与 token 时，二者都应在依赖数组中；使用函数式更新可减少不必要依赖，把稳定函数定义在 Effect 内或通过 useCallback 保持身份。关闭 exhaustive-deps 会让旧值长期残留。失败边界是房间 ID 已切换但仍向旧房间发送消息；验证动作是切换两次房间并检查连接 URL、事件日志和 cleanup 顺序，确认不会跨房间串流。', '依赖覆盖全部读取值'],
      ['外部 store 优先同步快照接口', '浏览器媒体查询、第三方 store 等可订阅数据可用 `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`，它保证并发渲染下不会撕裂。Effect 加 useState 的简单订阅在 React 18 以后仍可工作，但需要额外处理快照一致性。失败边界是服务端渲染读到 window 直接抛错；验证动作是提供稳定的 getServerSnapshot，并分别运行 SSR 与 hydration 检查首屏一致，服务端快照变化时还要保持可序列化。', '外部状态有专用接口'],
      ['Effect 行为需要稳定测试', '测试中用可控 subscribe mock 记录 setup、cleanup 和回调，改变依赖后断言清理顺序；不要把测试建立在 Effect 执行次数本身，而应在外部资源状态与用户可见结果上。失败边界是测试因 StrictMode 双调用误报两次请求；验证动作是区分开发检查与生产行为，给请求加幂等或缓存，并断言清理后不会提交过期结果。', '验证资源而不是次数'],
    ],
  }),
  reactCourse(r2Stage, '依赖、闭包和清理函数', {
    minutes: 42,
    prerequisite: '能写 useEffect 订阅和定时器，并理解函数闭包捕获的是创建时的词法环境。',
    goal: '能诊断 stale closure、重复订阅和过期请求写入状态的问题，使用函数式更新、ref、AbortController 与精确 cleanup 修复。',
    guidedPractice: '写一个每秒递增计时器，Effect 依赖为空但读取 filter，切换 filter 后观察日志仍打印旧值；再把 filter 放入依赖，观察计时器重启，最后用 ref 或拆分 Effect 选择合适修复。',
    independentPractice: '为聊天室消息订阅补上房间切换与卸载路径，要求旧房间回调不能写入新房间；用可控 Promise 和事件总线制造迟到消息，测试最终消息列表和监听器数量。',
    commonErrors: [
      '为消除 lint 警告随意删除依赖，导致 Effect 永远读取首次 render 的 props。',
      'cleanup 只清空状态却不取消请求，迟到响应仍把旧房间数据写进新页面。',
    ],
    sourceRefs: ['React Effect lifecycle. https://react.dev/learn/lifecycle-of-reactive-effects', 'React removing effect dependencies. https://react.dev/learn/removing-effect-dependencies', 'AbortController. https://developer.mozilla.org/en-US/docs/Web/API/AbortController'],
    steps: [
      ['依赖数组决定重新同步时机', '依赖不是“触发一次函数”的参数列表，而是 Effect 所使用响应式值的声明。roomId 改变意味着外部订阅属于另一个房间，应清理旧连接并建立新连接；如果值只在事件发生时读取，可改放到事件处理器或 ref。失败边界是把对象字面量作为依赖，每次 render 都触发重连；验证动作是记录连接次数，并把稳定 value 用 useMemo 或移到 Effect 内消除身份抖动。', '依赖描述同步关系'],
      ['过期闭包来自旧渲染作用域', '在 count=1 时创建的回调永远看到 count=1，即使组件后来提交到 count=5。需要基于最新待处理状态更新时使用 `setCount(c => c + 1)`，需要读取其它最新值时可写 only latest ref。但 ref 不是默认解药，过多使用会把渲染快照变成不可追踪的命令式状态。失败边界是点击事件与后台回调读到不同 count；验证动作是把时间、点击和日志序号对齐，确认每个值来自哪次 render。', '先判断旧快照是否合理'],
      ['Effect 本体不能直接返回 Promise', '`useEffect(async () => { ... })` 会返回 Promise 而不是 cleanup。应写成 `useEffect(() => { let ignore = false; void doWork().then(() => { if (!ignore) ... }); return () => { ignore = true; }; }, [])`。失败边界是快速切换页面后旧 Promise 仍 setState 或记录指标；验证动作是用 deferred Promise 控制完成顺序，断言 cleanup 后旧结果不改变当前界面，并确认请求 signal 已中止。若必须复用异步函数，应在 Effect 内同步创建 controller，并让 then 与 catch 都检查忽略标志，避免成功和失败分支绕过取消协议。', '异步 setup 要显式管理取消'],
      ['AbortController 取消真实请求', '把 signal 传给 fetch 或支持 signal 的客户端，cleanup 调用 `controller.abort()`；捕获错误时区分 AbortError 与真实网络错误。仅仅忽略结果能避免界面写入，但网络流量和下游任务仍然发生。失败动作是切换筛选后旧请求继续占用带宽；验证动作是检查 Network 面板显示 canceled、服务器访问日志与客户端最终列表，确认取消在浏览器层可见。', '能取消就不只忽略'],
      ['清理由事件来源回到资源', '事件监听、interval、IntersectionObserver、WebSocket 和第三方命令各需要对应 cleanup；清理函数必须引用创建时的同一 callback 或实例。React StrictMode 会在开发模式额外执行 setup-cleanup-setup，用来暴露缺失清理。失败边界是生产环境也出现双份事件，说明并非只有开发检查；验证动作是统计监听器、连接和计时器实例，并关闭 StrictMode 后对比行为，确认资源协议本身正确。', '按创建资源分别释放'],
    ],
  }),
  reactCourse(r2Stage, 'useMemo、useCallback 与性能误区', {
    minutes: 45,
    prerequisite: '会使用 React.memo，理解引用相等、对象比较和 React Profiler 能显示组件提交成本。',
    goal: '能判断 memo、useMemo 与 useCallback 真正减少的工作，建立稳定的组件边界和数据身份，并用性能记录而非直觉决定是否保留缓存。',
    guidedPractice: '让父组件每次输入都重渲染一个昂贵子列表，先用 React Profiler 记录提交耗时；再拆分状态、稳定行数据与回调，对比 React.memo 前后的渲染次数和实际 commit 时间。',
    independentPractice: '优化一个筛选面板，要求输入保持即时响应、列表只在查询变化时重算；分别测量不缓存、useDeferredValue、useMemo 与 memo 行的组合，保留有证据的改动。',
    commonErrors: [
      '给每个函数都加 useCallback，却没有 memo 子组件或 Effect 依赖使用，只是增加比较成本。',
      '用 useMemo 包住依赖每次都变化的临时对象，缓存永不命中，还让代码误以为已经优化。',
    ],
    sourceRefs: ['React useMemo. https://react.dev/reference/react/useMemo', 'React useCallback. https://react.dev/reference/react/useCallback', 'React Profiler. https://react.dev/reference/react/Profiler'],
    steps: [
      ['引用相等先于重建成本', 'React.memo 默认对 props 做浅比较，父组件 render 中新建的 `{ id, name }` 或内联函数每次都是不同引用，子组件仍会重渲染。可以在数据源头稳定对象，或让 memo 使用明确比较函数。失败边界是比较函数忽略实际影响 UI 的字段；验证动作是记录子组件 render 次数，并修改一个影响字段确认仍会更新。', '先看引用是否稳定'],
      ['useMemo 缓存计算结果', '`const sorted = useMemo(() => rows.toSorted(compare), [rows])` 只保证在依赖未变时尽量复用值，不是语义缓存，React 可以在特殊情况下丢弃。依赖必须完整，排序函数若读取外部 locale 也应纳入稳定化。失败边界是依赖写空数组后 row 更新，界面永远显示首次排序；验证动作是更新 rows 后断言顺序变化，并用 Profiler 确认无变化输入不再重复排序。', '依赖完整才有命中'],
      ['useCallback 缓存函数身份', '当函数作为 memo 子组件 props 或 Effect 依赖时，`useCallback(() => save(id), [id])` 能减少身份变化引起的下游工作；事件处理器可在内部用函数式更新减少依赖。若所有消费者都直接调用而不比较身份，缓存没有收益。失败边界是 useCallback 依赖了每次新建的 options 对象；验证动作是记录依赖引用与 Effect 重跑次数，先修复上游身份再评估是否保留。', '只在身份被消费时有意义'],
      ['拆分状态比全局缓存更有效', '把快速变化的输入框与昂贵列表分成兄弟组件，输入更新不会让列表父组件整块渲染；再通过 useDeferredValue 或 transitions 调度慢更新。缓存不能阻止父组件自身执行。失败边界是 memo 了列表但父组件仍每次创建筛选配置并重排数据；验证动作是看 Profiler flamegraph，确认高成本 commit 与不相关输入解耦。', '先缩小更新范围'],
      ['每次优化都要有反向指标', '记录交互前 p50/p95 渲染时间、子组件渲染次数、长任务与包体；改动后重跑同一场景，若没有稳定下降就删除缓存。React Compiler 在适用项目中可自动优化部分函数与值，但不替代状态结构与测量。失败边界是开发环境 React DevTools 开销被当成生产性能；验证动作是使用生产构建、节流 CPU 后比较，并保留输入数据与 Profiler 截图。', '没有收益就撤掉'],
    ],
  }),
  reactCourse(r2Stage, '并发渲染、转场和可中断工作', {
    minutes: 48,
    prerequisite: '理解 React render 与 commit 分离，会用 useState 和列表过滤，能观察浏览器 Long Tasks。',
    goal: '能区分紧急更新与可打断转场，使用 startTransition、useTransition 与 useDeferredValue 保持输入响应，并说明并发不会让副作用并行执行。',
    guidedPractice: '构建大型搜索结果页，在输入框直接 setQuery 时记录键入延迟，再用 startTransition 延迟更新结果列表，比较 React Profiler 的 interruption、输入响应和最终结果。',
    independentPractice: '实现带标签筛选和详情的目录页，要求在加载新详情时可以取消旧转场、保持当前页面可交互；用 Performance 面板证明长 render 被拆分而非只缩短代码行数。',
    commonErrors: [
      '把受控输入 value 放进 transition，导致输入框本身被延迟而出现卡顿或丢字。',
      '认为 concurrent rendering 会自动中断 fetch 或 DOM 写入，忽略网络取消和 commit 仍要自行管理。',
    ],
    sourceRefs: ['React startTransition. https://react.dev/reference/react/startTransition', 'React useDeferredValue. https://react.dev/reference/react/useDeferredValue', 'React concurrent rendering. https://react.dev/blog/2022/03/29/react-v18#new-feature-concurrent-rendering'],
    steps: [
      ['紧急更新与转场分开', '输入框的值属于紧急更新，应立即 setQuery；依赖 query 的大列表属于可延后的转场，可写 `startTransition(() => setDeferredQuery(query))`。这样 React 可以先提交输入，再在空闲时渲染列表。失败边界是把 setQuery 本身包进 transition，键盘回显被延后；验证动作是节流 CPU 键入并记录 input value 更新与列表 commit 的时间差。', '用户输入保持同步'],
      ['useTransition 暴露挂起状态', '`const [isPending, startTransition] = useTransition()` 让按钮或列表显示更新中状态，但不阻塞当前界面。pending 表示还有低优先级工作未完成，不是网络请求状态。失败边界是把 isPending 当成成功或错误标志；验证动作是快速切换筛选项，确认旧结果保留到新结果提交，pending 结束与最终列表变化同时发生，并记录期间按钮仍可响应。', 'pending 表示渲染尚未收口'],
      ['useDeferredValue 复制可延后值', '`const deferred = useDeferredValue(query)` 先让输入使用最新 query，再用 deferred 渲染昂贵列表；React 可能先显示旧列表并在后台计算新列表。它不会跳过计算，只是调整优先级。失败边界是列表的 key 不稳定，旧结果与新结果混用导致行状态错位；验证动作是快速输入并检查旧列表、新列表和每行实体 ID，确认最终状态一致。', '延后的是消费速度'],
      ['可中断只覆盖 render 工作', 'Fiber 工作循环在浏览器让出时间片后可以暂停 render，重新调度时从工作单元继续；commit 阶段为保证 DOM 一致性仍同步完成。Effect、网络请求和第三方 DOM 写入也不是可中断单元。失败边界是把巨型同步循环放在组件 render 中，期望 React 自动切碎任意代码；验证动作是把计算拆成组件树或数据分页，再用 Chrome Performance 看长任务是否减少。', 'render 可让出，commit 不可拆'],
      ['用交互指标验收并发策略', '记录键入到字符出现的延迟、筛选到结果稳定的时间、旧结果可交互时间与最终结果正确率；并发模式不是总是更快，低端设备可能因重复工作变慢。失败边界是只看最终结果正确而忽略输入卡顿；验证动作是在 4 倍 CPU 节流和真实移动设备上重跑，若没有改善就改回简单状态并优化数据结构。', '以延迟分布决定取舍'],
    ],
  }),
  reactCourse(r2Stage, '异步 Hook 与竞态回归', {
    minutes: 51,
    prerequisite: '熟悉 fetch、Promise、AbortController 与 useEffect 清理，能编写可控异步测试。',
    goal: '能封装加载、成功、空结果和失败状态的异步 Hook，处理请求顺序、取消、重试与卸载清理，并用回归测试证明迟到响应不会覆盖新结果。',
    guidedPractice: '为搜索接口写 useSearch：keyword 改变时取消旧请求，首次请求人为延迟 800ms，第二次延迟 100ms；先返回第二次结果再让第一次完成，观察并修复旧结果覆盖新结果的竞态。',
    independentPractice: '封装可分页课程查询 Hook，支持 signal、page、query、刷新与错误重试；用 deferred Promise 控制乱序完成，测试卸载后不写入状态、取消会传递到 fetch，且重试不会叠加监听。',
    commonErrors: [
      'Effect 直接返回 async 函数，浏览器拿不到 cleanup，切换查询后旧请求继续写入。',
      '只靠 `setLoading(false)` 判断最新请求，多个 in-flight 请求会让状态在任意一个完成后提前结束。',
    ],
    sourceRefs: ['React useEffect. https://react.dev/reference/react/useEffect', 'AbortSignal. https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal', vitestDocs],
    steps: [
      ['异步状态是联合而不是散字段', 'Hook 状态可建模为 `{ status: "idle" | "loading" | "success" | "error"; data?; error? }`，每次转换带上请求 key 或 requestId。互斥状态避免 loading 与 error 同时存在。失败边界是成功响应后忘记把 loading 清零；验证动作是写状态转换测试，断言每个事件只产生一种可见分支，并检查旧请求不能提交 success，错误转换也要能被重试覆盖。', '状态组合必须互斥'],
      ['Effect 内部创建并取消请求', '`useEffect(() => { const controller = new AbortController(); setState({ status: "loading" }); fetch(url, { signal: controller.signal }).then(...).catch(...); return () => controller.abort(); }, [url])` 保证 URL 改变时取消旧请求。setup 函数保持同步返回 cleanup。失败边界是 Catch 把 AbortError 显示成用户错误；验证动作是切换关键词后检查状态与控制台，主动取消不应进入 error，并确认 signal.aborted 为 true。请求包装层还应把超时、主动取消和网络失败映射为不同 code，避免用户看到误导性重试提示，并保留取消原因日志。', '每次请求都有生命周期'],
      ['请求序号防御不可取消客户端', '有些 SDK 不支持 AbortSignal，此时 cleanup 设置 ignore 标志或 requestId；只有 `id === latestId.current` 的响应可以 dispatch。不要仅使用局部 boolean 后忘记在重试时重置。失败边界是同一关键词手动刷新两次，旧刷新覆盖新刷新；验证动作是让第二个响应先完成，再完成第一个，断言最终数据和 requestId 都属于最新请求，并检查日志顺序。', '迟到响应必须有门禁'],
      ['重试要有预算与退避', '仅对网络错误、429 与 5xx 等可恢复错误重试，最多固定次数，使用指数退避加 jitter；4xx 校验错误通常不该重试。重试期间保留旧成功数据或明确 loading，并让取消传播到当前尝试。失败边界是每次 render 自动重试形成请求风暴；验证动作是注入连续失败并统计尝试次数、总时长和最终错误，确认达到上限后停止。', '重试是受限状态机'],
      ['竞态测试控制完成顺序', '为每次 fetch 创建手动 resolve 的 Promise，触发 A、B 后先完成 B 再完成 A，断言界面仍是 B 的数据；卸载或切换后再完成 A，确认不会再产生提交或日志。失败边界是测试依赖随机延迟；验证动作是固定执行顺序并重复运行，同时检查 cleanup 调用和 AbortSignal 状态，确保回归稳定且失败能稳定复现，并保存乱序步骤。', '用可控乱序证明修复'],
    ],
  }),
];

Object.assign(reactExamples, {
  '路由、URL 和深链接恢复': [
    reactExample(
      '路由参数定义订单身份',
      'TSX + Playwright',
      `const router = createBrowserRouter([
  { path: '/orders/:orderId', element: <OrderPage /> },
]);

function OrderPage() {
  const { orderId } = useParams();
  return <h1>订单 {orderId}</h1>;
}

// await page.goto('/orders/ORD-42');
// await expect(page.getByRole('heading')).toHaveText('订单 ORD-42');`,
      `刷新 /orders/ORD-42 后页面仍显示订单 ORD-42，不依赖内存中的上一页跳转。
失败边界：把订单 ID 只放在全局 store，直接刷新深链接会得到空订单或错误订单。`,
    ),
    reactExample(
      '更新筛选时保留分页参数',
      'TSX + React Router',
      `function StatusFilter() {
  const [params, setParams] = useSearchParams();
  const choose = (status: string) => {
    const next = new URLSearchParams(params);
    next.set('status', status);
    next.delete('page');
    setParams(next);
  };
  return <button onClick={() => choose('paid')}>已支付</button>;
}

// 从 ?status=open&page=3 点击后 URL 变为 ?status=paid
// 分页被清除，避免沿用旧页码落到空结果`,
      `URL 保留 status 并移除旧 page，前进后退都得到一致筛选状态。
失败边界：每次 setParams({ status }) 会丢掉其他条件，多筛选组合会互相覆盖。`,
    ),
    reactExample(
      '资源切换用 key 重置编辑草稿',
      'TSX + Vitest',
      `function OrderEditor({ orderId }: { orderId: string }) {
  const [note, setNote] = useState('');
  return <label>订单 {orderId}<input value={note} onChange={e => setNote(e.target.value)} /></label>;
}

export function OrderRoute() {
  const { orderId = '' } = useParams();
  return <OrderEditor key={orderId} orderId={orderId} />;
}
// 在 ORD-1 输入草稿，导航到 ORD-2，输入应清空`,
      `切换到 ORD-2 后编辑组件重建，输入框恢复空值，不会继承 ORD-1 草稿。
失败边界：同一路由组件仅 params 变化时可能复用实例，必须显式 key 或设计字段重置。`,
    ),
    reactExample(
      '导航守卫与服务端授权双层检查',
      'TSX + TypeScript',
      `async function requireManager() {
  const session = await fetch('/api/session', { credentials: 'include' }).then(r => r.json());
  if (session.role !== 'manager') {
    const redirect = encodeURIComponent(location.pathname + location.search);
    throw redirect('/login?next=' + redirect);
  }
  return session;
}

const loader = async () => {
  await requireManager();
  return fetch('/api/team/orders').then(response => response.json());
};
// router loader 调用后，没有 manager 权限应跳登录，API 仍再次校验 role`,
      `无权限客户端跳转到登录页，直接请求 API 仍返回 403，前后端检查都生效。
失败边界：只在路由隐藏按钮而不校验接口，用户可以直接调用写接口越权。`,
    ),
    reactExample(
      '刷新、后退和前进共享同一 URL',
      'Playwright',
      `test('筛选 URL 可恢复', async ({ page }) => {
  await page.goto('/orders?status=paid&page=2');
  await expect(page.getByLabel('状态')).toHaveValue('paid');
  await page.getByLabel('状态').selectOption('refunded');
  await page.goBack();
  await expect(page.getByLabel('状态')).toHaveValue('paid');
  await page.reload();
  await expect(page.getByLabel('状态')).toHaveValue('paid');
});
// pnpm playwright test e2e/orders-url.spec.ts`,
      `后退回到 paid 并保留 page=2，刷新后筛选仍为 paid。
失败边界：只在组件 state 保存筛选时，后退可能改变 URL 但控件仍显示旧值。`,
    ),
  ],
  'TanStack Query 键、缓存和失效': [
    reactExample(
      'queryKey 由资源身份组成',
      'TSX + TanStack Query',
      `const orderQuery = (tenantId: string, orderId: string) => ({
  queryKey: ['orders', tenantId, orderId] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    fetch('/api/t/' + tenantId + '/orders/' + orderId, { signal })
      .then(response => response.json()),
});

const query = orderQuery('t-1', 'ORD-7');
console.log(query.queryKey);
// ['orders', 't-1', 'ORD-7']`,
      `控制台输出完整键 orders、t-1、ORD-7，不同租户或订单不会共享缓存。
失败边界：只用 orderId 作为键会在切换租户后读到另一租户同号订单，属于数据越界。`,
    ),
    reactExample(
      'staleTime 与 gcTime 分别配置',
      'TSX + TanStack Query',
      `const client = new QueryClient({ defaultOptions: { queries: {
  staleTime: 30_000,
  gcTime: 300_000,
}}});

const query = {
  queryKey: ['catalog', 'react'],
  queryFn: () => fetch('/api/catalog/react').then(response => response.json()),
  staleTime: 60_000,
};

// 在 React Query Devtools 中观察：60 秒内重新挂载复用缓存，
// 长时间无人订阅后才在 gcTime 后回收`,
      `60 秒内重新挂载不会立即请求，超过 staleTime 后后台刷新，离开时间足够长才回收。
失败边界：把两个参数混为一谈会以为缓存超过 staleTime 就不能显示，实际上仍可先显示旧数据。`,
    ),
    reactExample(
      'enabled 阻止无 ID 的请求',
      'TSX + TanStack Query',
      `export function Detail({ id }: { id?: string }) {
  const detail = useQuery({
    queryKey: ['orders', id],
    queryFn: () => fetch('/api/orders/' + id).then(response => response.json()),
    enabled: Boolean(id),
  });
  return id ? <p>{detail.data?.status}</p> : <p>请选择订单</p>;
}
// 不传 id 时 mock fetch 调用次数应为 0`,
      `没有 id 时组件显示“请选择订单”，fetch 未被调用，查询保持禁用。
失败边界：忽略 enabled 会请求 /api/orders/undefined，并在 Network 中制造无意义 404。`,
    ),
    reactExample(
      '按前缀失效订单列表',
      'TSX + TanStack Query',
      `const queryClient = useQueryClient();

await updateOrder({ id: 'ORD-7', status: 'paid' });
await queryClient.invalidateQueries({
  queryKey: ['orders', 't-1'],
  exact: false,
});

// 只让 tenant t-1 的订单列表与详情重新获取，其他租户缓存保留`,
      `提交后 t-1 的 ['orders','t-1'] 下所有查询进入失效并后台刷新。
失败边界：invalidateQueries() 不带键会清空所有业务缓存，造成大面积重复请求。`,
    ),
    reactExample(
      '租户切换必须隔离缓存',
      'TSX + TanStack Query',
      `function useOrders(tenantId: string) {
  return useQuery({
    queryKey: ['orders', tenantId, 'list'],
    queryFn: ({ signal }) => fetch('/api/t/' + tenantId + '/orders', { signal })
      .then(response => response.json()),
  });
}

// 登录 t-1 加载列表，退出后登录 t-2，打开 Devtools：
// 两个租户的键分别存在，t-2 不会命中 t-1 的 data`,
      `t-2 使用独立 queryKey 发起自己的请求，Devtools 中两份缓存并列隔离。
失败边界：键里没有 tenantId 时，切换账号可能短暂显示上一租户订单，形成越权泄漏。`,
    ),
  ],
  'Mutation、乐观更新和回滚': [
    reactExample(
      'mutation 表示一次写请求',
      'TSX + TanStack Query',
      `const mutation = useMutation({
  mutationFn: (input: { orderId: string; status: string }) =>
    fetch('/api/orders/' + input.orderId, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: input.status }),
    }).then(async response => {
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    }),
});

// 点击后观察 mutation.status 从 idle -> pending -> success/error`,
      `提交时 mutation 进入 pending，服务端成功返回后状态变为 success 并带回更新订单。
失败边界：把写请求放进 useQuery，会在窗口聚焦或重试时重复创建资源。`,
    ),
    reactExample(
      'onMutate 保存可撤销现场',
      'TSX + TanStack Query',
      `const mutation = useMutation({
  mutationFn: (next: Order) => patchOrder(next),
  onMutate: async (next) => {
    await queryClient.cancelQueries({ queryKey: ['orders', 't-1', next.id] });
    const previous = queryClient.getQueryData<Order>(['orders', 't-1', next.id]);
    queryClient.setQueryData(['orders', 't-1', next.id], next);
    return { previous };
  },
  onError: (_error, next, context) => {
    queryClient.setQueryData(['orders', 't-1', next.id], context?.previous);
  },
});
// mock PATCH 失败，断言详情恢复旧的 status`,
      `失败后 onError 用 context.previous 恢复旧订单，界面回到可确认状态。
失败边界：没有取消在途查询就乐观覆盖，旧请求回来可能再次写回服务器旧值。`,
    ),
    reactExample(
      '版本冲突拒绝盲目覆盖',
      'TSX + TanStack Query',
      `async function patchOrder(order: Order) {
  const response = await fetch('/api/orders/' + order.id, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'if-match': String(order.version),
    },
    body: JSON.stringify({ status: order.status }),
  });
  if (response.status === 409) throw new Error('订单已被他人修改，请刷新');
  return response.json();
}

// 用 version=3 提交，服务器当前已是 version=4，断言显示冲突提示`,
      `旧版本提交收到 409，页面提示“订单已被他人修改”，不会静默覆盖新状态。
失败边界：不携带版本只发 patch，两个客服可能互相覆盖对方的退款或发货操作。`,
    ),
    reactExample(
      '成功后统一失效相关查询',
      'TSX + TanStack Query',
      `const mutation = useMutation({
  mutationFn: createOrder,
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['orders', 't-1', 'list'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard', 't-1'] }),
    ]);
  },
});

// 创建成功后 Network 应出现订单列表和仪表盘刷新，详情不重复请求`,
      `创建成功后列表与仪表盘一致性刷新，未使用的详情缓存不受影响。
失败边界：只在本地数组 push 新订单，其他页面仍显示旧统计，多个视图事实不一致。`,
    ),
    reactExample(
      '幂等键保护网络重试',
      'TypeScript + Vitest',
      `async function createPayment(idempotencyKey: string, amount: number) {
  return fetch('/api/payments', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({ amount }),
  });
}

const key = crypto.randomUUID();
await Promise.all([createPayment(key, 9900), createPayment(key, 9900)]);
expect(fetch).toHaveBeenCalledTimes(2);
// mock 服务端返回相同 paymentId`,
      `两次网络请求携带同一幂等键，服务端只创建一个支付并返回同一 ID。
失败边界：每次重试生成新 UUID 会创建两笔支付，前端禁用按钮不能替代服务端幂等性。`,
    ),
  ],
  '请求竞态、重试和取消': [
    reactExample(
      'queryFn 把 signal 交给 fetch',
      'TSX + TanStack Query',
      `useQuery({
  queryKey: ['search', query],
  queryFn: async ({ signal }) => {
    const response = await fetch('/api/search?q=' + query, { signal });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  },
});

// 快速切换 query，Network 中旧请求应显示 canceled`,
      `旧 query 的请求被 AbortSignal 取消，只保留最新查询结果。
失败边界：忽略 signal 后旧请求仍占用连接，组件可能显示过期资源。`,
    ),
    reactExample(
      '按错误类型决定是否重试',
      'TypeScript + Vitest',
      `async function fetchOrders(attempt = 0): Promise<Response> {
  const response = await fetch('/api/orders');
  if (response.status === 401) throw new Error('AUTH');
  if (response.status >= 500 && attempt < 2) return fetchOrders(attempt + 1);
  return response;
}

// mock 连续 500 后 200，断言共三次调用；
// mock 401，断言只调用一次`,
      `5xx 最多重试两次，401 立即终止，不把权限错误重试成请求风暴。
失败边界：所有错误统一重试会重复消耗登录失败请求，也可能触发账户风控。`,
    ),
    reactExample(
      '超时预算覆盖整个任务',
      'TypeScript + Vitest',
      `async function withTimeout<T>(task: (signal: AbortSignal) => Promise<T>, budgetMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), budgetMs);
  try { return await task(controller.signal); }
  finally { clearTimeout(timeout); }
}

const task = vi.fn((signal: AbortSignal) => new Promise<never>((_, reject) => {
  signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
}));
await expect(withTimeout(task, 20)).rejects.toMatchObject({ name: 'AbortError' });`,
      `20ms 后任务收到 AbortError，计时器被清理，不会留下悬挂请求。
失败边界：只限制单次 fetch 超时却允许多次重试，整页等待可能远超用户可接受预算。`,
    ),
    reactExample(
      '相同 queryKey 自动去重',
      'TSX + TanStack Query',
      `function Price({ id }: { id: string }) {
  const price = useQuery({
    queryKey: ['price', id],
    queryFn: () => fetch('/api/price/' + id).then(response => response.json()),
  });
  return <span>{price.data?.amount}</span>;
}

render(<><Price id="sku-1" /><Price id="sku-1" /></>);
// 等待加载完成，断言 fetch('/api/price/sku-1') 只执行一次`,
      `两个相邻组件同时订阅相同键，只产生一次网络请求，两者共享缓存。
失败边界：把随机数或时间放进 queryKey 会破坏去重，并让每次 render 都产生新缓存。`,
    ),
    reactExample(
      '竞态回归断言最终键',
      'Testing Library + TanStack Query',
      `const fetchKey = vi.fn((query: string) => Promise.resolve('结果:' + query));
const { rerender } = render(<Search query="a" fetchKey={fetchKey} />);
rerender(<Search query="ab" fetchKey={fetchKey} />);
await waitFor(() => expect(fetchKey).toHaveBeenLastCalledWith('ab'));
expect(await screen.findByText('结果:ab')).toBeVisible();
expect(screen.queryByText('结果:a')).not.toBeInTheDocument();`,
      `最后一次请求键为 ab，页面只显示“结果:ab”，旧结果未覆盖新键。
失败边界：只断言请求次数会增加，不检查最终键，无法证明取消和去重真的生效。`,
    ),
  ],
  '服务端状态与客户端状态分离': [
    reactExample(
      '按生命周期分类状态',
      'TSX + TanStack Query',
      `function OrdersPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const orders = useQuery({ queryKey: ['orders'], queryFn: fetchOrders });
  return <Orders data={orders.data ?? []} selectedId={selectedId}
    onSelect={setSelectedId} draft={draft} onDraft={setDraft} />;
}
// orders 由 Query 管缓存，selectedId 与未提交草稿属于本地交互状态`,
      `订单数据只在 TanStack Query 缓存一份，选中 ID 与草稿单独存放。
失败边界：把 orders 复制进 useState 再用 Effect 同步，会出现两份数据互相覆盖。`,
    ),
    reactExample(
      '不要在本地镜像服务端列表',
      'TSX + TanStack Query',
      `function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: createOrder, onSuccess: async (created) => {
    queryClient.setQueryData<Order[]>(['orders'], previous =>
      previous ? [created, ...previous] : [created]);
    await queryClient.invalidateQueries({ queryKey: ['orders'] });
  }});
}

// mock invalidate 返回服务端权威列表，断言本地缓存同步到最新数组`,
      `创建返回的订单先进入缓存，随后 invalidate 以服务端列表校准最终结果。
失败边界：另建 localOrders state 并只修改它，刷新或切换页面后新订单会消失。`,
    ),
    reactExample(
      '401 与 403 进入专用错误页',
      'TSX + React Router',
      `const loader = async () => {
  const response = await fetch('/api/admin/orders');
  if (response.status === 401) throw redirect('/login?next=/admin/orders');
  if (response.status === 403) throw new Response('无权查看', { status: 403 });
  if (!response.ok) throw new Response('加载失败', { status: 500 });
  return response.json();
};

// router 的 errorElement 中读取 useRouteError，
// 403 应显示权限说明，401 应跳登录`,
      `未登录跳登录页，角色不足进入 403 错误页，服务端异常进入 500 恢复页。
失败边界：所有错误都显示“加载失败，请重试”，用户无法判断应登录、申请权限还是稍后重试。`,
    ),
    reactExample(
      'Error Boundary 只接管渲染子树',
      'TSX + Testing Library',
      `class OrderErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('order-render', error.message); }
  render() {
    return this.state.failed ? <p role="alert">订单区域不可用</p> : this.props.children;
  }
}

// render(<OrderErrorBoundary><BrokenOrder /></OrderErrorBoundary>);
// 页面其余搜索栏仍可见`,
      `订单子树渲染异常时只显示局部 alert，应用头部与导航仍可继续使用。
失败边界：事件处理器中的异常不会自动进入 Error Boundary，需要单独 catch 并记录。`,
    ),
    reactExample(
      '无法恢复时保留安全退出路径',
      'TSX + Playwright',
      `test('缓存损坏后仍可退出订单页', async ({ page }) => {
  await page.goto('/orders/ORD-7');
  await page.getByRole('button', { name: '重新加载' }).click();
  await expect(page.getByRole('link', { name: '返回订单列表' })).toBeVisible();
  await page.getByRole('link', { name: '返回订单列表' }).click();
  await expect(page).toHaveURL('/orders');
});
// pnpm playwright test e2e/order-recovery.spec.ts`,
      `错误页仍提供返回列表链接，点击后 URL 回到 /orders，用户可继续其他工作。
失败边界：错误页只放重试按钮，若缓存永久损坏用户会陷入重复失败，没有退出路径。`,
    ),
  ],
  '企业数据页面实验': [
    reactExample(
      '列表身份由 URL 与 queryKey 共同定义',
      'TSX + TanStack Query',
      `const [params] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const page = Number(params.get('page') ?? '1');
  const orders = useQuery({
    queryKey: ['orders', tenantId, { status, page }],
    queryFn: ({ signal }) => fetchOrders({ tenantId, status, page, signal }),
  });
// URL ?status=paid&page=2 对应缓存 ['orders', 't-1', { status: 'paid', page: 2 }]`,
      `URL 中状态与页码决定 queryKey，返回或刷新时命中对应缓存并重新校验。
失败边界：URL 与 queryKey 使用不同字段名或规范化规则，会展示另一筛选条件下的列表。`,
    ),
    reactExample(
      '详情预取复用列表实体键',
      'TSX + TanStack Query',
      `const prefetchOrder = (order: Order) => queryClient.prefetchQuery({
  queryKey: ['orders', tenantId, order.id],
  queryFn: () => fetchOrder(order.id),
  staleTime: 30_000,
});

<button onMouseEnter={() => prefetchOrder(order)} onClick={() => navigate('/orders/' + order.id)}>
  {order.id}
</button>
// hover 后 Devtools 中先出现详情缓存，进入页面不再空白加载`,
      `鼠标悬停预取详情，点击进入时详情缓存已存在，列表页仍保持可操作。
失败边界：预取键与详情页 queryKey 不一致，会重复请求且无法复用刚获取的数据。`,
    ),
    reactExample(
      '乐观关闭需要服务端事务',
      'TSX + TanStack Query',
      `async function closeConversation(id: string) {
  const response = await fetch('/api/conversations/' + id + '/close', {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

// mutation onMutate 将列表行标为 closing，
// 服务端返回 409 时 onError 恢复旧行并提示“有新消息，未关闭”`,
      `本地先显示“关闭中”，服务端拒绝后恢复原状态并说明冲突原因。
失败边界：界面直接删除会话但事务失败，用户会以为成功，刷新后又看到会话重现。`,
    ),
    reactExample(
      '权限失败按资源边界呈现',
      'TSX + React Router',
      `const loader = async ({ params }: LoaderFunctionArgs) => {
  const response = await fetch('/api/orders/' + params.orderId);
  if (response.status === 404) throw new Response('订单不存在', { status: 404 });
  if (response.status === 403) throw new Response('无权查看该租户订单', { status: 403 });
  return response.json();
};

// 在 errorElement 中读取 status 和 data，
// 页面保留租户导航，只在订单内容区显示对应错误`,
      `404 与 403 显示不同资源级说明，侧边导航仍可切换到其他订单。
失败边界：把权限失败统一 toast 后继续渲染空表，用户会误以为订单真的没有数据。`,
    ),
    reactExample(
      '企业旅程用 Playwright 串起',
      'Playwright',
      `test('筛选、进入详情、乐观关闭和刷新恢复', async ({ page }) => {
  await page.goto('/orders?status=open');
  await page.getByRole('row', { name: /ORD-7/ }).click();
  await expect(page).toHaveURL(/orders\\/ORD-7/);
  await page.getByRole('button', { name: '关闭订单' }).click();
  await expect(page.getByText('已关闭')).toBeVisible();
  await page.reload();
  await expect(page.getByText('已关闭')).toBeVisible();
});
// pnpm playwright test e2e/order-lifecycle.spec.ts`,
      `浏览器从列表筛选进入详情，乐观关闭后刷新仍显示服务端已关闭状态。
失败边界：只测前端本地 state 显示成功，刷新或换设备后一致性会失败。`,
    ),
  ],
});

const r3Stage = 'Router、Query 与远程数据';

export const HANDWRITTEN_REACT_R3_COURSES: readonly ProgrammingCourseSeed[] = [
  reactCourse(r3Stage, '路由、URL 和深链接恢复', {
    minutes: 36,
    prerequisite: '已能创建多组件页面，理解浏览器地址栏、history API 和服务端路径回退。',
    goal: '能用 React Router 把页面身份、路径参数和筛选条件放进 URL，支持前进后退、刷新恢复与权限跳转，并解释前端路由的服务端回退条件。',
    guidedPractice: '用 `createBrowserRouter` 建立课程列表、详情和 404 路由，把 page、status、sort 存进 useSearchParams；刷新详情深链接后检查路由参数、查询数据和面包屑都能恢复。',
    independentPractice: '为订单页实现可分享 URL，包含订单 ID、标签筛选和分页；用户无权限时保留目标地址并跳转登录，登录成功后返回原地址，补浏览器后退与刷新测试。',
    commonErrors: [
      '把筛选和分页只放在 useState，复制链接给别人后看到默认页面。',
      '部署静态服务器时不配置 history fallback，用户刷新 /orders/42 直接得到 404。',
    ],
    sourceRefs: [reactRouterDocs, 'Web History API. https://developer.mozilla.org/en-US/docs/Web/API/History_API', 'React Router URL values. https://reactrouter.com/start/declarative/url-values'],
    steps: [
      ['URL 是页面状态协议', '路径 `/orders/:orderId` 表示资源身份，查询串 `?status=paid&page=2` 表示同一资源的视图参数；刷新、分享、前进后退都依赖它。路由组件应读取 `useParams` 与 `useSearchParams`，而不是复制一份本地 state 再双向同步。失败边界是 URL 和界面筛选不一致；验证动作是修改筛选后复制地址到新标签页，检查列表、面包屑和请求参数完全一致。', '可分享状态放 URL'],
      ['查询参数更新要保留同类条件', '使用 `setSearchParams(prev => { prev.set("page", "2"); return prev; }, { replace: false })` 或基于当前值构造新 URLSearchParams；修改筛选通常应把 page 重置为 1。失败边界是每次只写一个参数，把其它筛选项清空；验证动作是连续改状态、排序、页码，再后退两步，确认每个历史项只改变预期参数，并保留空值和默认值规则。提交导航前还要删除无意义默认参数，保证分享地址稳定。', '一次导航生成完整 URL'],
      ['路由身份决定组件重置', 'React Router 在同一路由元素之间切换只有 params 变化时，可能复用组件实例；需要按订单 ID 重置本地编辑状态时，可给编辑组件加 `key={orderId}`。不要用 Effect 在每次 ID 变化后逐个清空字段。失败边界是从订单 A 切到 B 后草稿仍属于 A；验证动作是分别输入草稿切换订单，检查 key、表单值和提交 ID 都对应新订单。', '资源身份可触发重置'],
      ['导航守卫同时服务端授权', '前端路由守卫可改善体验，但用户可直接请求 API 或构造 URL，服务端必须再次验证对象权限。登录跳转可把 `location.pathname + location.search` 放进 state 或 returnTo 参数，成功后使用 replace 避免回退再次撞上登录页。失败边界是仅隐藏按钮却保留详情路由访问能力；验证动作是用低权限账户直接打开 URL，确认服务端返回 403 且界面展示可理解页面。', '前端守卫不能替代授权'],
      ['路由测试覆盖刷新和后退', '组件测试用 MemoryRouter 渲染指定初始条目，验证参数驱动的可见状态；Playwright 再访问真实 URL、刷新、点击链接并使用 browser back。失败边界是开发服务器自动回退所以测试全绿，生产静态托管却 404；验证动作是在与生产相同的托管配置下访问深链接，检查 status、资源路径和 404 页面，并比较历史栈长度。', '真实部署路径才算通过'],
    ],
  }),
  reactCourse(r3Stage, 'TanStack Query 键、缓存和失效', {
    minutes: 39,
    prerequisite: '理解 Promise、REST 分页和 React 组件状态，能在应用根部提供共享 Context。',
    goal: '能设计层级 queryKey、缓存策略、启用条件与失效范围，解释 staleTime、gcTime 和后台刷新，避免把 Query 缓存当作任意本地状态仓库。',
    guidedPractice: '建立 QueryClientProvider，用 `["orders", { page, status }]` 查询列表，用 `["order", id]` 查询详情；在 DevTools 中切换页面观察 fresh、stale、fetching 与 inactive 状态，修改列表后按范围 invalidateQueries。',
    independentPractice: '为商品列表实现搜索、分页、详情预取和返回列表缓存，要求切换筛选不串数据、切换用户不读上一账号缓存，并为关键 queryFn 写请求参数测试。',
    commonErrors: [
      'queryKey 只写固定字符串，页码或筛选变化仍复用同一缓存，页面显示上一组数据。',
      '把输入框草稿、弹窗开关等客户端 UI 状态也塞进 Query，导致状态生命周期和缓存回收混淆。',
    ],
    sourceRefs: [queryDocs, 'TanStack Query keys. https://tanstack.com/query/latest/docs/framework/react/guides/query-keys', 'TanStack Query caching. https://tanstack.com/query/latest/docs/framework/react/guides/caching'],
    steps: [
      ['queryKey 是缓存身份', '`useQuery({ queryKey: ["orders", { page, status, sort }], queryFn: ({ signal }) => fetchOrders({ page, status, sort }, signal) })` 把全部影响响应的输入写进 key。键应可序列化、层级稳定，数组对象字段顺序固定。失败边界是两个请求参数不同却共享 key，命中错误数据；验证动作是切换每个参数并检查 DevTools 缓存条目与 Network 请求一一对应，同时核对 URL 中的规范化参数。', '输入变化必须换身份'],
      ['staleTime 与 gcTime 管不同阶段', 'staleTime 表示新鲜多久内不自动重新请求，gcTime 表示没有观察者后缓存何时回收；它们不是浏览器 HTTP 缓存。短暂页面切换可依赖内存缓存，长期持久化需额外方案。失败边界是把 staleTime 设成 Infinity 后服务端数据永久不刷新；验证动作是人为修改后台数据，用 refetch 与重新挂载分别观察旧值、后台请求和最终更新。', '新鲜度与回收分开设置'],
      ['enabled 表达依赖前置条件', '详情查询只有拿到 orderId 且有权限时才启用：`enabled: Boolean(orderId) && canRead`，disabled 查询不应发起请求。queryFn 中仍要再次检查必要参数，避免测试或调用方绕过组件条件。失败边界是 enabled 变化时旧请求已发出，切换 ID 后出现竞争；验证动作是快速切换订单，检查 signal 取消、最终 data 与 queryKey 一致，并确认未授权时不发请求。', '能查询才启用'],
      ['失效范围要精确', '修改订单后可使 `queryClient.invalidateQueries({ queryKey: ["order", id] })` 刷新详情，再使 `["orders"]` 刷新列表；默认只标记 stale 并重取活跃查询。过度使用 `invalidateQueries()` 会让整个应用同时刷新。失败边界是列表使用带筛选的嵌套 key 而失效前缀层级写错；验证动作是在 DevTools 中记录失效后哪些查询转为 fetching，确认目标集合完整且没有无关请求。', '前缀命中也会失效'],
      ['缓存必须按租户和权限分区', 'queryKey 应包含 userId、tenantId 或权限版本，登出时 `queryClient.clear()` 防止下一个账号看到内存残留。缓存数据不要包含不该暴露的敏感字段。失败边界是共享浏览器切换账号后首屏闪现旧客户资料；验证动作是完成一次账号切换并检查缓存命名空间、请求头和页面内容，确认旧缓存无法被新会话命中。', '安全边界进入缓存键'],
    ],
  }),
  reactCourse(r3Stage, 'Mutation、乐观更新和回滚', {
    minutes: 42,
    prerequisite: '已会 useQuery 和 QueryClient，理解服务端写入、幂等键与失败响应的业务含义。',
    goal: '能用 useMutation 连接写请求，设计乐观更新、取消进行中查询、错误回滚和成功后的精确失效，避免 UI 与服务端长期不一致。',
    guidedPractice: '实现收藏按钮：onMutate 取消详情查询、保存旧快照并立即 setQueryData，onError 恢复快照，onSettled 失效详情；用 500 响应验证按钮从乐观态回滚。',
    independentPractice: '为任务排序实现拖拽持久化，包含版本号冲突、同实体连续两次更新、成功失效列表和失败回滚；用延迟请求控制响应顺序并重放两次保存。',
    commonErrors: [
      '乐观更新后只显示 toast，onError 不回滚本地缓存，下一轮刷新前一直显示错误状态。',
      '没有取消进行中的列表查询，旧请求在 mutation 后返回并把乐观数据覆盖。',
    ],
    sourceRefs: ['TanStack Query mutations. https://tanstack.com/query/latest/docs/framework/react/guides/mutations', 'TanStack Query optimistic updates. https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates', 'Idempotency. https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header'],
    steps: [
      ['Mutation 表示一次写入尝试', '`useMutation({ mutationFn: updateTask, onSuccess, onError })` 管理 pending、错误与成功回调，但每次 mutate 的参数和结果属于该次尝试。需要同时展示多个写入状态时可按实体管理 mutation 状态。失败边界是把全局 isPending 用于所有行，导致一行提交时全部按钮禁用；验证动作是并发提交两行，检查每行 loading、错误和成功状态互不影响。', '写入状态按实体隔离'],
      ['onMutate 先保存可撤销现场', 'onMutate 内 `await queryClient.cancelQueries({ queryKey })`，读取 `getQueryData` 到 context，再用 setQueryData 写入乐观结果，并返回 context 供 onError 使用。若已有更早的 mutation，应合并或排队。失败边界是 context 未返回导致 onError 拿到 undefined；验证动作是制造网络失败，比较回滚后的对象引用和内容与提交前完全一致，并检查进行中查询被取消，以及后续 mutation 没有覆盖快照。若两次写入作用于同一实体，应按版本或 mutation 序号拒绝旧回调回滚新结果。', '回滚依赖明确快照'],
      ['冲突不能靠盲目覆盖', '服务端可返回 `409` 与最新 version，前端把本地草稿标为冲突并展示重新合并，不要直接用旧快照覆盖服务端较新结果。连续拖拽可使用 mutation 序号或服务端版本，只允许最后确认的版本落库。失败边界是两个标签页同时编辑，后提交者静默覆盖前者；验证动作是模拟版本冲突，确认本地显示差异、服务端记录未丢失并允许用户重试。', '并发写要识别冲突'],
      ['成功后再统一一致性', '乐观更新是临时预测，服务端可能规范化 ID、时间或权限字段。onSettled 失效相关 key，必要时用响应的 canonical 数据 setQueryData，避免在一处永久拼装服务端结构。失败边界是回滚与失效同时覆盖新成功数据；验证动作是成功、失败各跑一次，检查缓存最终来源和额外请求数量，并确认响应版本号已保存。', '先预测，再服务端收口'],
      ['幂等键保护重试', '创建订单等非幂等动作在第一次请求生成 idempotency key，重试复用同一个 key；服务端按键返回同一结果。前端 mutation 重试只针对可安全重放的错误，并设置上限。失败边界是超时后用户再次点击创建两笔订单；验证动作是模拟服务端已写入但响应超时，重试后检查数据库中只有一份记录和同一业务编号。', '重试先确认幂等'],
    ],
  }),
  reactCourse(r3Stage, '请求竞态、重试和取消', {
    minutes: 45,
    prerequisite: '理解 AbortSignal、Promise 竞态和 HTTP 状态码，能用浏览器 Network 面板观察请求。',
    goal: '能区分取消、超时与业务错误，配置 Query 的重试条件和退避，向 queryFn 传递 signal，并证明旧请求不会覆盖当前页面。',
    guidedPractice: '给分页查询注入 100ms 和 600ms 两种延迟，快速翻页两次，观察 Network 中旧请求是否 canceled；再关闭取消功能复现旧数据覆盖，记录两次最终 queryKey。',
    independentPractice: '为企业接口实现带 10 秒超时、最多两次重试、429 Retry-After 和用户手动刷新按钮的查询；测试 401、404、500、超时和取消五条错误路径的用户提示。',
    commonErrors: [
      '所有错误都自动重试，403 或验证失败被连续请求多次，放大服务端压力。',
      '组件卸载后只忽略 Promise 结果，没有取消网络和下游任务，浪费连接并可能触发日志。',
    ],
    sourceRefs: [queryDocs, 'TanStack Query query cancellation. https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation', 'HTTP Semantics. https://www.rfc-editor.org/rfc/rfc9110'],
    steps: [
      ['queryFn 接收 signal 并传播', 'queryFn 参数包含 `{ signal }`，应把它传给 fetch 或支持取消的 SDK；若 SDK 不支持，可在包装层检查 signal 并在响应后丢弃。取消错误不要渲染为用户失败。失败边界是包装函数吞掉 signal，查询键变化后旧请求仍完成整个下载；验证动作是快速切换参数，在 Network 中确认请求状态与组件最终数据。', '取消要传到网络层'],
      ['重试策略按错误分类', '`retry: (failureCount, error) => failureCount < 2 && error.status >= 500` 可避免对 400、401、403 无限重试；`retryDelay` 可使用指数退避和 Retry-After。写操作通常默认不重试。失败边界是服务端持续 500 时仍然每 render 重试；验证动作是统计每种状态码的尝试次数和间隔，确认只有符合策略的错误进入下一轮，并记录最终失败、总耗时与用户可见的停止原因，再核对 4xx 从未进入重试。', '默认重试需要收紧'],
      ['超时是整次任务的预算', '用 AbortSignal.timeout 或自定义 controller 限制单次请求，多个重试共享总截止时间而非每次重新获得完整预算。用户取消与系统超时应区分消息。失败边界是超时后 underlying request 继续消耗连接；验证动作是记录总耗时、取消原因和最终错误，在慢网实验中确认不超过约定上限，并检查后续请求已经停止。', '重试不能绕过总预算'],
      ['Query 自动去重相同键', '多个组件在短时间内请求同一 queryKey 时，TanStack Query 会共享 in-flight Promise；手动 refetch 与新挂载消费者可能加入同一请求。失败边界是 queryFn 每次 `fetch` 不带 signal，导致 dedupe 后一个消费者离开仍继续。验证动作是同时挂载两个同键消费者，确认 Network 只有一个请求，组件卸载后只在无观察者时按策略取消，并核对缓存观察者数量。', '共享键共享进行中请求'],
      ['竞态回归检查最终键', '请求 A 未完成时切到 B，则最终缓存中的当前页面数据必须对应 B；A 可以完成并进入自己的缓存，但不能成为 B 的 data。测试中记录 queryKey、signal.aborted 与最终 UI。失败边界是只看 loading 结束而没比较资源 ID；验证动作是乱序完成 A、B，并在页面显示详情 ID，证明结果与当前 URL 和缓存键一致，同时保留乱序日志。', '最终数据必须匹配当前身份'],
    ],
  }),
  reactCourse(r3Stage, '服务端状态与客户端状态分离', {
    minutes: 48,
    prerequisite: '能区分 Query 缓存、React state 和 URL 参数，理解权限错误与 Error Boundary 的职责。',
    goal: '能把服务端事实交给 Query、把可分享视图交给 URL、把瞬时 UI 交给本地 state，并用错误边界和权限分支处理查询失败。',
    guidedPractice: '把订单页中的订单对象、筛选条件、选中行和弹窗开关分别归位到 Query、URL、local state 与 local state；删除重复缓存后验证刷新、返回和权限失败三种场景。',
    independentPractice: '重构一个客户档案页，服务端数据只从 Query 读取，编辑草稿独立保存，未保存离开需要确认；查询 403 展示权限页，渲染异常由上层 Error Boundary 捕获并重置。',
    commonErrors: [
      '把 Query 返回对象复制到 useState 编辑，丢失实时刷新和缓存一致性。',
      '查询 401 只在 toast 中提示，页面仍保留旧敏感数据和可操作按钮。',
    ],
    sourceRefs: [queryDocs, 'React error boundaries. https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary', reactRouterDocs],
    steps: [
      ['按所有者和生命周期分类状态', '客户详情由服务器拥有，使用 queryKey 缓存；筛选与 page 由 URL 拥有；对话框开关由当前页面实例拥有；未保存草稿由表单拥有。分类依据是谁能修改、需要持续多久、刷新后是否恢复。失败边界是同一个值在四处保存并互相覆盖；验证动作是画状态来源表，逐个操作后检查只更新对应所有者。', '状态归属先于实现'],
      ['服务端数据不要复制到本地镜像', 'Query 的 data 是当前服务器快照，编辑时可创建显式 draft 状态并在提交成功后用 `queryClient.setQueryData` 更新；取消编辑则丢弃 draft。失败边界是后台 refetch 到来时 draft 被覆盖或保存按钮突然改目标；验证动作是编辑中触发 refetch，确认表单值和服务器版本同时可见，提交时带版本号并检查冲突响应，取消后草稿彻底丢弃。', '编辑草稿是独立状态'],
      ['权限错误进入专用页面', '查询函数可把 401、403 转成带 code 的错误，路由层决定登录跳转或显示“无权访问”，并清除旧缓存中的敏感对象。不要在每个组件内散落相同状态码判断。失败边界是 403 页面还渲染旧订单标题和金额；验证动作是用低权限账户切换资源 ID，检查 DOM、Query 缓存和日志中不再出现受保护数据。', '错误也决定数据可见性'],
      ['渲染异常交给 Error Boundary', 'Error Boundary 能捕获子树 render、生命周期和构造期间的异常，不能捕获事件处理器、异步回调或服务端错误。查询错误可通过 `throwOnError` 或组件主动抛出交给边界，并提供 reset 与重新查询。失败边界是 fetch 回调抛错却期待边界显示；验证动作是分别制造 render 异常和网络异常，确认前者进入边界、后者进入 query error UI。', '边界捕获范围要写清'],
      ['无法恢复时保留安全退出', '错误页面应提供回列表、重试和联系支持，不能只显示堆栈。重置时应清除边界状态并重新验证权限，而不是无限重新挂载同一坏数据。失败边界是重试按钮触发缓存死循环；验证动作是连续点击重试并观察请求次数，确认失败稳定、退出路径可用且敏感数据已清理。', '恢复动作有上限'],
    ],
  }),
  reactCourse(r3Stage, '企业数据页面实验', {
    minutes: 51,
    prerequisite: '完成本阶段前五课，能使用 React Router、TanStack Query、权限响应和错误测试。',
    goal: '综合 URL、查询缓存、预取、分页、权限和错误恢复，交付一个可深链接、可取消、可观测的企业订单列表与详情流程。',
    guidedPractice: '建立订单列表与详情双栏页面，列表筛选写入 URL，行悬停预取详情，点击后加载当前订单；模拟 500、403 和慢请求，记录查询键、取消、错误边界和用户恢复路径。',
    independentPractice: '独立完成客户工单工作台，包含分页、排序、状态筛选、详情预取、乐观关闭、权限校验和错误重试；用 RTL 测组件查询，用 Playwright 测深链接、后退和移动端流程。',
    commonErrors: [
      '预取使用与详情页不同的 queryKey，点击后重复请求且无法复用缓存。',
      '列表和详情的筛选、选中项各存一份，浏览器后退后两者指向不同数据。',
    ],
    sourceRefs: [reactRouterDocs, queryDocs, playwrightDocs],
    steps: [
      ['列表身份由 URL 和查询键共同定义', 'URL 保存可分享的 page、status、sort，Query key 从同一参数对象派生，请求函数只接收规范化后的参数。这样刷新和复制地址都能恢复同一资源集合。失败边界是查询键字段顺序或默认值不一致，预取与正式查询不命中；验证动作是记录两次 key 的 JSON 值，确认请求参数和缓存条目完全相同。', 'URL 与缓存键同源'],
      ['预取必须复用详情身份', '列表行 hover 可用 `queryClient.prefetchQuery({ queryKey: ["order", id], queryFn })`，点击详情组件使用同一 key 和 queryFn。只预取当前可见或高概率进入的行，避免悬停一次请求全部列表。失败边界是预取失败覆盖已有缓存；验证动作是让预取 500、详情已有成功数据，确认详情保持可用并可手动刷新，且 Network 中没有重复成功请求，失败也不写坏缓存。', '预取只是提前工作'],
      ['乐观关闭需要事务语义', '关闭工单时保存旧详情和列表快照，乐观更新状态，失败则回滚并显示原因；成功后失效详情与当前列表。多个筛选缓存都可能包含该工单，不宜手改所有副本，可用精确前缀失效。失败边界是失败回滚只恢复详情，列表仍显示已关闭；验证动作是切换筛选后错误回滚，检查所有相关页面最终来自服务器。', '跨缓存写入用失效收口'],
      ['权限失败按资源边界呈现', '403 详情显示权限页面而不是通用崩溃，401 清空会话并跳登录；列表中对无权字段不渲染，也不把它们放入客户端缓存。服务端返回的数据字段应在 API 层裁剪。失败边界是权限页仍保留请求响应中的姓名、金额等敏感值；验证动作是切换角色后检查 DOM、Network 载荷和 Query DevTools。', '权限失败也清理数据'],
      ['端到端测试真实用户旅程', 'RTL 覆盖筛选组件、查询 Hook 包装和错误面板；Playwright 打开带参数的深链接，修改筛选，返回再前进，验证 URL、请求和可见行同步。失败边界是所有测试都 mock 掉路由，无法发现静态托管刷新失败；验证动作是在类生产服务器上执行 journey，并保留 trace、Network 与截图作为证据，再检查移动端路径。', '浏览器流程负责跨层验收'],
    ],
  }),
];

Object.assign(reactExamples, {
  'App Router、布局和服务端组件': [
    reactExample(
      '服务端组件直接读取数据库',
      'Next.js TSX',
      `// app/courses/page.tsx
import { db } from '@/lib/db';

export default async function CoursesPage() {
  const courses = await db.course.findMany({ select: { id: true, title: true } });
  return <ul>{courses.map(course => <li key={course.id}>{course.title}</li>)}</ul>;
}

// pnpm next build
// 构建输出应显示 /courses 为静态或动态服务端路由，客户端 bundle 不含 db 模块`,
      `构建成功，访问 /courses 返回包含课程标题的 HTML，数据库代码没有进入浏览器 bundle。
失败边界：在服务端组件中使用 useState 或事件处理器会触发构建错误，交互必须下沉到客户端组件。`,
    ),
    reactExample(
      '嵌套布局保持导航复用',
      'Next.js TSX',
      `// app/(dashboard)/layout.tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div className="dashboard">
    <aside aria-label="控制台导航"><a href="/orders">订单</a></aside>
    <main>{children}</main>
  </div>;
}

// app/(dashboard)/orders/page.tsx
export default function OrdersPage() {
  return <h1>订单列表</h1>;
}
// 从 /orders 导航到 /orders/42，aside 不重新挂载`,
      `路由切换只替换 main 下的页面内容，侧边导航状态和滚动位置保持。
失败边界：把布局写进每个 page，导航切换时整页重挂载，客户端组件状态全部丢失。`,
    ),
    reactExample(
      '数据读取靠近消费组件',
      'Next.js TSX',
      `// app/orders/[id]/page.tsx
async function loadOrder(id: string) {
  const response = await fetch('http://api.internal/orders/' + id, { cache: 'no-store' });
  if (!response.ok) throw new Error('订单加载失败');
  return response.json() as Promise<{ id: string; total: number }>;
}

export default async function OrderPage({ params }: { params: { id: string } }) {
  const order = await loadOrder(params.id);
  return <article><h1>{order.id}</h1><strong>{order.total}</strong></article>;
}

// pnpm next build，再用 curl 请求 /orders/ORD-7`,
      `响应 HTML 直接包含订单 ORD-7 和金额，首屏无需等待客户端再次请求。
失败边界：为所有页面在根布局集中请求大量数据，会让无关路由也承担串行延迟。`,
    ),
    reactExample(
      'loading 与 not-found 是路由协议',
      'Next.js TSX',
      `// app/orders/[id]/loading.tsx
export default function Loading() {
  return <p role="status">订单加载中</p>;
}

// app/orders/[id]/not-found.tsx
export default function NotFound() {
  return <section><h1>订单不存在</h1><a href="/orders">返回订单列表</a></section>;
}

// 用不存在 ID 访问 /orders/missing，响应应为 not-found 页面`,
      `读取期间显示 status=status 的加载提示，缺失资源返回订单不存在页面和返回链接。
失败边界：所有错误都跳到全局 500 页，用户无法区分加载中、资源不存在与服务端故障。`,
    ),
    reactExample(
      '产物验证服务端与客户端边界',
      'PowerShell',
      `pnpm next build
Get-ChildItem .next/server/app -Recurse -Filter '*.js' |
  Select-String 'db\\.course\\.findMany'
Get-ChildItem .next/static/chunks -Recurse -Filter '*.js' |
  Select-String 'db\\.course\\.findMany'
# 第一组应有命中，第二组应为空`,
      `服务端产物包含数据库查询代码，静态客户端 chunks 中没有该查询实现。
失败边界：只凭源代码 import 判断边界不可靠，构建产物泄漏或环境变量误打包需要实际扫描。`,
    ),
  ],
  '客户端边界与序列化约束': [
    reactExample(
      'use client 标记交互模块图',
      'Next.js TSX',
      `'use client';

import { useState } from 'react';
export function Counter({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  return <button onClick={() => setCount(value => value + 1)}>数量：{count}</button>;
}

// app/page.tsx
// import { Counter } from './Counter';
// export default function Page() { return <Counter initial={1} />; }
// pnpm next build 后检查 Counter 进入客户端 chunk`,
      `服务端渲染首屏为“数量：1”，浏览器 hydration 后点击增加，客户端 chunk 包含 Counter。
失败边界：在服务端组件中直接使用 onClick 会在构建时报 Server Component 不支持事件处理器。`,
    ),
    reactExample(
      'Props 必须跨边界序列化',
      'Next.js TSX',
      `// 错误示例：函数不能从 Server Component 传给 Client Component
// <ClientPanel onSave={() => db.save()} />

export function ClientPanel({ order }: { order: { id: string; total: number } }) {
  return <p>{order.id}：{order.total}</p>;
}

// 正确数据：只传可序列化字段
<ClientPanel order={{ id: 'ORD-7', total: 9900 }} />

// pnpm next build 验证序列化错误`,
      `纯对象 props 成功构建并在浏览器渲染 ORD-7 与 9900。
失败边界：传 Date 以外的类实例、函数或 Promise 会报 Only plain objects can be passed to Client Components。`,
    ),
    reactExample(
      '客户端边界尽量下沉',
      'Next.js TSX + Bundle Analyzer',
      `// app/orders/page.tsx 保持 Server Component
import { OrderFilters } from './OrderFilters';

export default async function OrdersPage() {
  const orders = await loadOrders();
  return <><OrderFilters /><OrderTable rows={orders} /></>;
}

// OrderFilters.tsx 顶部 'use client'，只包含输入与 URL 更新
// 使用 NEXT_ANALYZE=true pnpm build 比较客户端 chunk`,
      `客户端 chunk 只增加筛选控件，订单表静态内容仍由服务端输出。
失败边界：在 page.tsx 顶部加 use client 会把整页和依赖拖进浏览器 bundle。`,
    ),
    reactExample(
      '服务端能力通过受控协议暴露',
      'Next.js TSX',
      `'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireManager } from '@/lib/auth';

const input = z.object({ orderId: z.string().uuid() });
export async function cancelOrder(raw: unknown) {
  const { orderId } = input.parse(raw);
  const session = await requireManager();
  await db.order.cancel({ tenantId: session.tenantId, id: orderId });
  revalidatePath('/orders');
}

// 客户端 form action={cancelOrder}，提交隐藏 orderId`,
      `授权管理员提交后订单取消并刷新列表，非法 UUID 在进入数据库前被拒绝。
失败边界：Server Action 是网络入口，必须校验登录、租户、字段和权限，不能信任客户端隐藏字段。`,
    ),
    reactExample(
      '网络与类型双重验证边界',
      'Playwright + PowerShell',
      `pnpm next build
pnpm next start -p 3100
@'
fetch('http://127.0.0.1:3100/orders').then(r => r.text()).then(text => {
  console.log('has-table', text.includes('订单列表'));
});
'@ | node
# 浏览器 Network 确认 /orders 首屏 HTML 与客户端 chunk 分离`,
      `HTML 响应包含订单列表文本，Network 中交互 chunk 单独加载且不含数据库模块。
失败边界：仅 TypeScript 类型正确不代表运行时序列化安全，必须结合构建和网络响应验证。`,
    ),
  ],
  'SSR、SSG、ISR 与缓存': [
    reactExample(
      'SSR 在请求时生成响应',
      'Next.js TSX',
      `export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const generatedAt = new Date().toISOString();
  return <p>服务端时间：{generatedAt}</p>;
}

// pnpm build && pnpm start
// curl http://localhost:3000/dashboard 连续两次，时间应不同`,
      `两次请求返回不同的服务端时间，HTML 标记为动态渲染。
失败边界：使用浏览器 Date 会在 hydration 时与服务端文本不一致，无法证明请求级 SSR。`,
    ),
    reactExample(
      'SSG 在构建时固定页面骨架',
      'Next.js TSX',
      `export default async function GuidePage() {
  const guide = await loadGuide('react-query');
  return <article><h1>{guide.title}</h1><p>{guide.summary}</p></article>;
}

export const dynamic = 'force-static';

// pnpm build
// 构建输出中 /guide 标记为 ○ Static，
// 启动后离线数据源变化不会改变已生成 HTML`,
      `构建阶段生成 /guide 的静态 HTML，运行时多次请求内容保持一致。
失败边界：在页面顶层调用 cookies 或 headers 会转为动态渲染，破坏静态缓存假设。`,
    ),
    reactExample(
      'ISR 用 revalidate 更新页面',
      'Next.js TSX',
      `export const revalidate = 60;

export default async function CatalogPage() {
  const items = await fetch('https://catalog.example/items', {
    next: { revalidate: 60 },
  }).then(response => response.json());
  return <ul>{items.map((item: { id: string; name: string }) => (
    <li key={item.id}>{item.name}</li>
  ))}</ul>;
}

// 等待 60 秒后首次请求触发后台再生，观察响应头与下一页内容`,
      `60 秒内的请求复用旧页面，过期后的首个请求可先返回缓存并在后台更新。
失败边界：将 revalidate 与 fetch cache no-store 混用会让外层页面缓存但数据每次动态，语义不一致。`,
    ),
    reactExample(
      '四层缓存用响应头区分',
      'PowerShell',
      `pnpm build
Start-Process pnpm -ArgumentList 'start','-p','3100' -WindowStyle Hidden
Start-Sleep 3
Invoke-WebRequest http://127.0.0.1:3100/catalog |
  Select-Object StatusCode,@{n='Cache';e={$_.Headers['x-nextjs-cache']}}
Invoke-WebRequest http://127.0.0.1:3100/api/health |
  Select-Object StatusCode,@{n='Cache';e={$_.Headers['cache-control']}}`,
      `页面响应头显示 HIT 或 MISS，API 健康检查返回 no-store 或短缓存策略。
失败边界：浏览器缓存、Next 数据缓存和 CDN 缓存混为一谈，会导致清了一层仍未看到新数据。`,
    ),
    reactExample(
      '缓存实验记录响应证据',
      'PowerShell',
      `$results = foreach ($i in 1..3) {
  $r = Invoke-WebRequest http://127.0.0.1:3100/catalog
  [pscustomobject]@{
    Attempt = $i
    Status = $r.StatusCode
    Cache = $r.Headers['x-nextjs-cache']
    Hash = ($r.Content | Get-FileHash -InputStream ([IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($r.Content)))).Hash
  }
  Start-Sleep 2
}
$results | Format-Table`,
      `三次请求记录状态、HIT/MISS 与内容哈希，可以判断何时命中与内容是否更新。
失败边界：只截一张页面图无法证明缓存行为，响应时间与内容哈希必须和请求顺序一起保留。`,
    ),
  ],
  '数据获取、秘密和授权边界': [
    reactExample(
      '服务端会话每次重新验证',
      'Next.js TypeScript',
      `import { cookies } from 'next/headers';

export async function getSession() {
  const token = cookies().get('session')?.value;
  if (!token) return null;
  const response = await fetch('https://auth.internal/session', {
    headers: { authorization: 'Bearer ' + token },
    cache: 'no-store',
  });
  return response.ok ? response.json() : null;
}
// 每次受保护读取都调用 getSession，不把用户对象放进共享模块变量`,
      `没有 cookie 时返回 null，有效会话返回用户，权限撤销在后端立即生效。
失败边界：把会话缓存在模块级变量，多个请求可能共享错误用户，造成跨用户泄漏。`,
    ),
    reactExample(
      '读取前完成对象级授权',
      'Next.js TSX',
      `export async function getOrder(orderId: string) {
  const session = await requireSession();
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  if (order.tenantId !== session.tenantId) throw new Error('FORBIDDEN');
  return order;
}

// app/orders/[id]/page.tsx
const order = await getOrder(params.id);
if (!order) notFound();
return <OrderView order={order} />;`,
      `同租户订单返回详情，其他租户 ID 返回 FORBIDDEN，缺失订单进入 not-found。
失败边界：仅 URL 中检查 tenantId 或隐藏按钮，用户可修改请求读取其他租户订单。`,
    ),
    reactExample(
      '秘密只在服务端模块使用',
      'Next.js TypeScript',
      `import 'server-only';

const serviceKey = process.env.CATALOG_SERVICE_KEY;
if (!serviceKey) throw new Error('CATALOG_SERVICE_KEY 未配置');

export async function fetchCatalog() {
  return fetch('https://catalog.internal/items', {
    headers: { authorization: 'Bearer ' + serviceKey },
    cache: 'no-store',
  });
}
// 从 Client Component import 此模块时，next build 应阻止构建`,
      `服务端查询可以携带密钥，客户端引用 server-only 模块时构建立即失败。
失败边界：以 NEXT_PUBLIC_ 前缀保存密钥会被打包到浏览器，任何页面用户都能读取。`,
    ),
    reactExample(
      'Server Action 防御越权与重放',
      'Next.js TSX',
      `'use server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';

const schema = z.object({ orderId: z.string().uuid(), expectedVersion: z.number().int() });
export async function updateOrder(raw: unknown) {
  const input = schema.parse(raw);
  const session = await requireSession();
  const result = await db.order.updateMany({
    where: {
      id: input.orderId,
      tenantId: session.tenantId,
      version: input.expectedVersion,
    },
    data: { version: { increment: 1 }, status: 'confirmed' },
  });
  if (result.count !== 1) throw new Error('CONFLICT_OR_FORBIDDEN');
  revalidatePath('/orders');
}
// 用他人订单 ID 与过期 version 分别提交，均应失败`,
      `合法请求单次更新并递增版本，越权或重放请求 count 为 0，不会修改订单。
失败边界：Action 内只检查是否登录，不检查资源所属租户，任意用户可修改他人订单。`,
    ),
    reactExample(
      '用户数据不进入共享缓存',
      'Next.js TSX',
      `import { unstable_noStore as noStore } from 'next/cache';

export async function AccountSummary() {
  noStore();
  const session = await requireSession();
  const account = await db.account.findUnique({
    where: { userId: session.userId },
    cache: 'no-store',
  });
  return <p>{account?.displayName}</p>;
}

// 两个不同 Cookie 请求同一路径，响应应包含各自显示名且 x-nextjs-cache 不共享`,
      `两个账号请求分别得到自己的显示名，缓存头不显示跨请求共享 HTML。
失败边界：在根布局静态渲染用户菜单，CDN 可能把一个用户的 HTML 发给另一个用户。`,
    ),
  ],
  'hydration、错误和恢复': [
    reactExample(
      '首帧时间使用稳定服务端值',
      'Next.js TSX',
      `export default function ServerClock({ time }: { time: string }) {
  return <time dateTime={time}>{time}</time>;
}

// app/page.tsx
export default async function Page() {
  return <ServerClock time={new Date().toISOString()} />;
}

// 浏览器 Sources 中检查 hydration 后 time 文本未变化`,
      `服务端 HTML 与 hydration 后文本一致，console 没有 Text content did not match 警告。
失败边界：客户端组件首次 render 调用 new Date 会在 hydration 时得到不同文本并产生不匹配。`,
    ),
    reactExample(
      '错误边界贴近失败区域',
      'Next.js TSX',
      `// app/orders/error.tsx
'use client';

export default function OrdersError({ error, reset }: { error: Error; reset: () => void }) {
  return <section role="alert">
    <h1>订单区域加载失败</h1>
    <p>{error.message}</p>
    <button onClick={reset}>重试订单</button>
  </section>;
}

// 订单页抛错时，根导航和其他路由保持可访问`,
      `订单路由显示局部 alert 与重试按钮，站点头部和其他导航仍可正常工作。
失败边界：错误被根 error.tsx 接管后整页替换，局部故障让用户失去所有导航路径。`,
    ),
    reactExample(
      'reset 只重试渲染不等于修数据',
      'Next.js TSX',
      `'use client';
export function RetryError({ error, reset }: { error: Error; reset: () => void }) {
  const canRetry = !error.message.includes('404');
  return <div role="alert">
    <p>{error.message}</p>
    {canRetry && <button onClick={() => reset()}>重新加载</button>}
    <a href="/orders">返回订单列表</a>
  </div>;
}

// 构造 404 与 500 两种 error，检查按钮可见性与 activeElement`,
      `500 错误显示“重新加载”和返回链接，404 只保留返回链接。
失败边界：数据本身不存在时无限 reset 会反复失败，恢复界面必须提供安全退出。`,
    ),
    reactExample(
      '浏览器与服务端错误共享 traceId',
      'Next.js TypeScript',
      `export function logClientError(error: Error, traceId: string) {
  return fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ traceId, message: error.message, route: location.pathname }),
  });
}

// RSC 抛错时服务端日志记录同一 traceId，
// 在平台日志中按 traceId 搜索应得到客户端与服务端两条记录`,
      `同一个 traceId 能检索到浏览器渲染错误和服务端请求错误，完成端到端关联。
失败边界：前端随机生成不传回服务端，只会有孤立日志，无法判断同一次用户故障。`,
    ),
    reactExample(
      '恢复后验证数据与焦点',
      'Playwright',
      `test('重试后恢复订单并保留焦点', async ({ page }) => {
  await page.goto('/orders/ORD-7');
  await page.getByRole('button', { name: '重试订单' }).click();
  await expect(page.getByRole('heading', { name: 'ORD-7' })).toBeVisible();
  await expect(page.getByRole('button', { name: '编辑订单' })).toBeFocused();
});
// pnpm playwright test e2e/order-hydration.spec.ts`,
      `重试成功后显示订单 ORD-7，焦点回到编辑按钮，键盘用户可继续操作。
失败边界：只检查错误文本消失，可能留下空内容页或焦点回到 body，用户仍需重新导航。`,
    ),
  ],
  'Next.js 部署与回滚实验': [
    reactExample(
      '构建产物记录源码与配置',
      'PowerShell',
      `pnpm next build
git rev-parse HEAD | Set-Content .next/release-commit.txt
node -e "console.log(require('./package.json').version)" | Set-Content .next/release-version.txt
npm pkg get version | Set-Content .next/npm-version.json
Get-ChildItem .next/release-*.txt | Get-FileHash`,
      `部署目录包含 commit、包版本和构建产物哈希，可以反查本次发布来自哪份源码。
失败边界：只记录镜像 tag 不记录 commit，同名 tag 重推后无法判断实际代码。`,
    ),
    reactExample(
      '运行配置在启动时注入',
      'PowerShell',
      `$env:API_BASE_URL='https://staging-api.example.com'
pnpm next start -p 3100
# 用实际请求验证配置来源
Invoke-WebRequest http://127.0.0.1:3100/api/config | Select-Object -ExpandProperty Content`,
      `服务返回 staging API 地址，同一构建产物可通过启动环境切换到另一安全配置。
失败边界：把环境值写在构建期 NEXT_PUBLIC 常量中，换环境必须重新构建且容易泄漏秘密。`,
    ),
    reactExample(
      '代码发布与缓存失效分开执行',
      'PowerShell',
      `docker build -t portal:release-42 .
docker run --rm -p 3000:3000 portal:release-42
Invoke-WebRequest http://127.0.0.1:3000/health
Invoke-WebRequest http://127.0.0.1:3000/orders |
  Select-Object StatusCode,@{n='Cache';e={$_.Headers['x-nextjs-cache']}}
# 确认新 HTML 后单独调用 CDN purge，记录 purge id`,
      `新镜像健康后 CDN 仍可能返回旧 HTML，purge 完成后再验证新内容哈希。
失败边界：容器重启就以为缓存已失效，用户仍可能命中旧页面或旧 API 响应。`,
    ),
    reactExample(
      '蓝绿切换观察真实指标',
      'PowerShell',
      `$blue = Invoke-WebRequest http://127.0.0.1:3001/health
$green = Invoke-WebRequest http://127.0.0.1:3002/health
@{
  blue = $blue.StatusCode
  green = $green.StatusCode
  switch = 'proxy-upstream-to-3002'
  at = (Get-Date).ToUniversalTime().ToString('o')
} | ConvertTo-Json | Set-Content switch-record.json
Get-Content switch-record.json`,
      `两份健康检查均返回 200，切换记录包含时间、旧端口、新端口和触发原因。
失败边界：切换前只检查进程存活，不检查错误率与 P95，坏版本会直接接收全部流量。`,
    ),
    reactExample(
      '回滚同时验证旧代码兼容当前数据',
      'PowerShell',
      `docker run --rm -p 3000:3000 portal:release-41
Invoke-WebRequest http://127.0.0.1:3000/health
Invoke-WebRequest http://127.0.0.1:3000/orders |
  Select-Object StatusCode
pnpm playwright test e2e/order-read.spec.ts --grep "@smoke"
# 记录 rollback-at、数据库 schema、缓存 purge 结果`,
      `旧版本连接当前数据库后通过 health、订单读取和 smoke，回滚在可接受时间完成。
失败边界：只回滚容器但数据库已执行破坏性迁移，旧代码启动后仍会报字段不存在。`,
    ),
  ],
});

const r4Stage = 'Next.js、RSC 与渲染边界';

export const HANDWRITTEN_REACT_R4_COURSES: readonly ProgrammingCourseSeed[] = [
  reactCourse(r4Stage, 'App Router、布局和服务端组件', {
    minutes: 36,
    prerequisite: '已能构建 React 组件和路由页面，了解 Node 请求处理与 HTML 首屏响应。',
    goal: '能解释 App Router 中 layout、page、loading、error 与 not-found 的嵌套关系，默认使用 Server Component 读取数据，并说明哪些代码不会进入浏览器包。',
    guidedPractice: '建立 `app/(dashboard)/layout.tsx`、`dashboard/page.tsx` 与 `loading.tsx`，在服务端组件直接查询课程统计；用 `next build` 输出和浏览器 Network 的 RSC payload 检查组件是否在服务端执行。',
    independentPractice: '实现带共享导航的订单工作区，页面数据在服务端读取，导航高亮与折叠使用客户端布局组件；记录每次导航请求、布局复用和错误回退范围，完成构建验证。',
    commonErrors: [
      '在 Server Component 中写 useState、onClick 或 window，结果构建阶段直接报错。',
      '把每个页面都重复包一层根布局和导航，导航切换时整棵树重建并丢失共享缓存。',
    ],
    sourceRefs: ['Next.js App Router. https://nextjs.org/docs/app', 'Next.js layouts and pages. https://nextjs.org/docs/app/getting-started/layouts-and-pages', 'React Server Components. https://react.dev/reference/rsc/server-components'],
    steps: [
      ['Server Component 是默认层', '`app/orders/page.tsx` 默认在服务端执行，可直接读取数据库或服务端密钥，再返回可序列化 RSC 树；浏览器只收到渲染结果和必要的客户端组件引用。页面中可以使用 async/await，但不能使用浏览器事件和本地 state。失败边界是导入依赖 window 的第三方模块导致服务端构建失败；验证动作是检查构建日志和客户端 bundle，确认数据库模块没有出现在浏览器资源中。', '服务端是默认起点'],
      ['布局按路由段嵌套复用', '根 `app/layout.tsx` 必须包含 html 与 body，子布局只包围自己的路由段；同一布局下的 page 导航通常保留布局实例和客户端状态。`loading.tsx` 自动包围当前段，`error.tsx` 需要是客户端组件。失败边界是把需要每页重置的数据放在持久布局中；验证动作是导航两个子页面，检查布局组件日志、滚动与导航高亮，确认本应复用的外壳没有重挂载。', '共享外壳不等于共享业务状态'],
      ['数据靠近消费它的组件', '订单页面可直接 `const orders = await getOrders()`，把读取放在权限检查之后；多个组件需要同一请求时使用 `cache()` 或请求级记忆化避免重复。不要为所有页面建立不可见全局容器。失败边界是父布局读取每个子页面才需要的参数，使布局无法复用并拖慢导航；验证动作是通过 Next.js 构建路由表和请求日志检查哪些段实际重新执行。', '读取跟随页面的授权与缓存边界'],
      ['加载和缺失状态是路由协议', '`loading.tsx` 为当前段提供 Suspense fallback，`not-found.tsx` 处理 `notFound()`，`error.tsx` 捕获该段渲染和请求异常。它们各自有作用范围，不应由页面内一个万能分支替代全部。失败边界是数据库查无记录直接抛泛型错误而不是 notFound；验证动作是分别访问无效 ID、慢数据与抛错页面，检查 HTTP 语义、状态码和可见恢复按钮，并记录路由段。', '路由文件承担不同失败状态'],
      ['服务端边界要用产物验证', '`next build` 会标记静态、动态路由并生成 RSC 和服务端代码；结合 `.next/static` 与客户端 chunk 检查秘密和 Node 模块未被打包。失败边界是环境变量在构建时被内联到公开 bundle；验证动作是在编译产物中搜索哨兵密钥名称和值，并在浏览器断网请求中确认 server-only 模块不可下载，同时比较服务端日志。', '构建产物证明边界'],
    ],
  }),
  reactCourse(r4Stage, '客户端边界与序列化约束', {
    minutes: 39,
    prerequisite: '理解 Server Component 默认执行位置，能判断浏览器 API、事件处理器和本地状态属于哪一侧。',
    goal: '能选择最小 `"use client"` 边界，按 RSC 序列化规则传递 props，避免把服务端秘密、函数或不可序列化对象送入客户端。',
    guidedPractice: '让 Server Component 查询订单并把 `id、title、updatedAt 字符串` 传给 Client Component，客户端只负责展开和筛选；再尝试传 Date、Map 与 onClick 服务端函数，记录构建或序列化错误。',
    independentPractice: '把一个大页面中真正需要交互的按钮抽成客户端岛，其余表格与数据读取保留在服务端；检查客户端 bundle、props 类型与 hydration 行为，并提交一段说明边界的注释或设计记录。',
    commonErrors: [
      '在文件顶部写 "use client" 后仍以为整个 import 图在服务端执行，导致秘密和数据库代码被拉入客户端。',
      '把大型对象或包含函数、类实例的 props 从服务端传向客户端，收到无法序列化错误。',
    ],
    sourceRefs: ['Next.js client components. https://nextjs.org/docs/app/building-your-application/rendering/client-components', 'React server directives. https://react.dev/reference/rsc/use-client', 'Next.js serializable props. https://nextjs.org/docs/app/getting-started/server-and-client-components'],
    steps: [
      ['use client 标记模块图边界', '"use client" 出现在文件顶部时，它及它导入的客户端模块会进入浏览器图；父 Server Component 仍可在服务端渲染并传递已经序列化的 props。该指令不会让子孙组件全部失去服务端能力，边界要按依赖图理解。失败边界是客户端组件导入 server-only 数据库模块，构建时报错或秘密暴露；验证动作是分析 chunk、运行 `server-only` 保护并在浏览器资源中搜索敏感模块名。', '边界按模块图传播'],
      ['Props 必须跨边界可序列化', '普通字符串、数字、布尔、数组、可安全序列化对象和部分特殊值可传递；函数、类实例、Symbol 与不可序列化配置不能当作普通 props。事件处理必须在客户端定义，或通过 Server Action 作为受控引用调用。失败边界是把 ORM 实体直接传给客户端，带方法和 Date 后序列化失败；验证动作是把 DTO 映射为明确接口，并用类型和运行时样例检查字段。', '先做 DTO 再跨边界'],
      ['客户端边界尽量下沉', '只有需要 useState、事件、Effect 或浏览器 API 的控件使用客户端组件，列表布局和静态文案留在服务端可减少 JS。一个顶部客户端 Provider 可能把大量子树拉进客户端，因此 Provider 应尽量靠近需要它的区域。失败边界是整页标记 client 后 bundle 暴涨；验证动作是比较改动前后客户端 chunk 大小、首屏 hydration 时间和服务端组件日志。', '交互岛越小越好'],
      ['服务端能力通过受控协议暴露', 'Server Action 可从客户端提交表单，但接收的是不可信输入，必须重新校验权限、字段和业务状态；不要暴露可执行任意 SQL 或文件路径的通用参数。返回给客户端的结果同样要可序列化并裁剪敏感字段。失败边界是客户端修改隐藏字段后越权更新他人订单；验证动作是用篡改请求直接调用 action，确认服务端拒绝且审计日志记录主体与资源 ID。', '跨边界调用默认不可信'],
      ['用网络与类型双重验证边界', '检查 Network 中的 RSC 响应、客户端 chunk 与 hydration 错误，检查 TypeScript props 是否避免 any，并对来自环境或数据库的对象做显式映射。失败边界是类型通过但运行时字段变 undefined；验证动作是给 DTO 增加运行时校验，在服务端数据异常时返回明确错误而不是把整个实体交给客户端，并记录失败字段。', '类型与运行时一起守门'],
    ],
  }),
  reactCourse(r4Stage, 'SSR、SSG、ISR 与缓存', {
    minutes: 42,
    prerequisite: '理解 HTTP 缓存、CDN、构建时生成和请求时渲染，能阅读 Next.js build 路由表。',
    goal: '能区分 SSR、SSG、ISR 与客户端缓存，显式配置 fetch 缓存和失效标签，并用响应头、构建输出与数据更新实验验证策略。',
    guidedPractice: '为产品页分别建立静态参数页、每分钟再验证页和按用户动态页；在 fetch 中设置 `next: { revalidate: 60, tags: ["products"] }`，更新后台数据后调用 revalidateTag 并记录 HTML 与响应时间变化。',
    independentPractice: '设计一个目录页与详情页的混合缓存方案，静态生成热门详情、按需生成冷门详情、购物车和个人订单保持动态；证明数据更新时只有相关标签失效。',
    commonErrors: [
      '把 revalidate 数值当成浏览器端轮询，客户端不刷新页面时仍显示旧数据。',
      '给包含个人权限数据的页面配置整页静态缓存，CDN 把一名用户的响应返给其他人。',
    ],
    sourceRefs: ['Next.js caching. https://nextjs.org/docs/app/deep-dive/caching', 'Next.js fetch caching. https://nextjs.org/docs/app/api-reference/functions/fetch', 'Next.js revalidateTag. https://nextjs.org/docs/app/api-reference/functions/revalidateTag'],
    steps: [
      ['SSR 在请求时生成响应', '使用 cookies、headers、searchParams 或显式动态配置会让页面按请求执行，服务端取得当前用户上下文后生成 HTML 与 RSC。SSR 提高数据新鲜度，但每次请求可能承担数据库和渲染成本。失败边界是把公共目录页错误地依赖请求头，导致无法静态化并被 CDN 命中；验证动作是查看构建路由标记、响应缓存头和两次请求的服务端日志。', '请求时渲染换取新鲜度'],
      ['SSG 在构建时固定页面骨架', '`generateStaticParams()` 返回可预渲染的 ID，页面在构建时查询公共数据并生成静态 HTML，适合文档、商品目录和营销页。动态内容再通过客户端交互加载。失败边界是构建机没有数据库权限，导致部署失败或生成空页面；验证动作是检查 build 产物中的静态路径、HTML 内容和运行时不访问数据库的网络记录。', '构建时生成公共页面'],
      ['ISR 用再验证平衡新鲜与吞吐', '`fetch(url, { next: { revalidate: 60, tags: ["products", id] } })` 或段级 revalidate 让缓存内容在一段时间后后台更新，用户可能先看到旧版本。标签失效可精准刷新相关详情。失败边界是标签拼写不一致，后台更新只清掉列表没有清详情；验证动作是更新产品名后记录标签、页面版本和首次/第二次请求内容，并观察后台刷新时间。', '再验证有延迟窗口'],
      ['显式区分四层缓存', 'Next.js 可能同时涉及请求记忆化、数据缓存、完整路由输出缓存和客户端 Router Cache；各层失效条件不同。对登录用户、购物车与权限页面应明确 no-store 或动态边界，对公共内容按标签组织。失败边界是只清 CDN 却没有清客户端 Router Cache，用户返回旧页；验证动作是分别用硬刷新、客户端导航和 API 请求观察版本，记录每层策略。', '缓存层要逐一说明'],
      ['缓存实验记录响应证据', '对每个页面记录构建输出标记、响应 cache-control、age、x-nextjs-cache 等可用头、HTML 中版本标记和服务端日志次数。失败边界是只看页面 URL 判断是否命中；验证动作是在隔离环境连续请求并修改标签，整理时间线证明哪个请求触发再验证，哪些用户看到旧值，并保存响应头。缺少任何一层证据时，不能把页面版本变化简单归因于缓存。', '用响应头与时间线验收'],
    ],
  }),
  reactCourse(r4Stage, '数据获取、秘密和授权边界', {
    minutes: 45,
    prerequisite: '理解服务端组件、Cookie 会话、环境变量与对象级授权，能审查网络响应中的敏感字段。',
    goal: '能在服务端读取会话与数据，在查询前执行对象级授权，使用 server-only 保护秘密，并确保错误与缓存不会泄露跨用户数据。',
    guidedPractice: '建立订单详情页：服务端读取会话、查询订单后比较 tenantId，再决定渲染或 notFound；用两个测试账号访问同一 ID，检查响应体、缓存键、日志和数据库查询条件。',
    independentPractice: '为多租户报表实现服务端权限层，包含会话解析、角色和资源归属、字段裁剪、审计日志；尝试篡改 URL、Cookie 和客户端隐藏字段，证明三种越权都被拒绝。',
    commonErrors: [
      '只在客户端隐藏管理按钮，服务端仍然执行无权限的删除或读取。',
      '把 API 密钥放在 NEXT_PUBLIC_ 变量，误以为只导入服务端文件就不会进入客户端包。',
    ],
    sourceRefs: ['Next.js environment variables. https://nextjs.org/docs/app/guides/environment-variables', 'Next.js authentication. https://nextjs.org/docs/app/guides/authentication', 'OWASP authorization cheat sheet. https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html'],
    steps: [
      ['服务端会话始终重新验证', '服务端组件通过 `cookies()` 或受信任认证库取得会话，验证签名、过期和当前角色，再读取资源；客户端传来的 userId 只能用于展示，不能作为身份依据。失败边界是只解析 JWT 载荷不校验签名或过期；验证动作是用过期、篡改和另一租户令牌请求，确认统一进入 401/403 且无数据返回。', '身份来自服务端验证'],
      ['授权发生在数据读取前', '查询应包含 tenantId 和 userId 条件，或先加载最小记录检查对象权限，再获取敏感字段。对列表同时过滤，对详情同时校验，不能只在列表隐藏入口。失败边界是知道 ID 就能读取他人订单；验证动作是枚举两个租户 ID，检查服务端查询、响应状态和审计事件都按主体隔离。', '对象级授权落在查询'],
      ['秘密只在服务端模块使用', '数据库 URL、签名密钥和第三方服务 token 放普通环境变量并被 server-only 模块读取；`NEXT_PUBLIC_` 前缀变量会进入公开 bundle。构建时应扫描客户端产物中的秘密哨兵。失败边界是安装日志或错误页打印连接串；验证动作是检查 `.next/static`、错误上报与容器日志，确认既有泄露扫描也有运行时脱敏。', '秘密来源与去向都要审计'],
      ['Server Action 要像 API 一样防御', 'Action 接收 FormData 后重新解析会话、校验 Schema、检查对象权限和幂等键，再写数据库；不能信任隐藏 input 的 role 或 tenantId。返回错误使用稳定 code，不返回 SQL、堆栈或敏感字段。失败动作是修改 DOM 中隐藏 tenantId 后写入他人数据；验证动作是直接构造请求调用 action，确认服务端拒绝并记录 actor、resource、decision，再核对数据库未变化。', '客户端输入全部不可信'],
      ['用户数据不能进入共享缓存', '个人订单、权限菜单和带有会话内容的 RSC 响应应使用动态或私有策略，缓存键包含租户并非万无一失，因为 CDN 与客户端缓存层可能忽略自定义键。失败边界是用户 A 登出后用户 B 命中旧页面；验证动作是双账号交替访问并清除 Cookie，检查 HTML、RSC、API 和浏览器缓存中没有上一账号的标记。', '私有数据默认不共享'],
    ],
  }),
  reactCourse(r4Stage, 'hydration、错误和恢复', {
    minutes: 48,
    prerequisite: '理解服务端 HTML 与客户端 React 树，能阅读浏览器控制台、React 错误和 Network 中的 hydration 警告。',
    goal: '能定位 hydration mismatch，区分服务端首帧与 Effect 后状态，使用 error.tsx、global-error.tsx 和 reset 设计恢复路径，并保留可观测证据。',
    guidedPractice: '在服务端渲染 `Date.now()` 与 `Math.random()`，观察 hydration 文本不一致；改成服务端固定时间加客户端 Effect 更新，记录首屏 HTML、hydration 后文本和错误日志变化。',
    independentPractice: '为路由段建立 error.tsx，捕获服务端数据解析异常和客户端渲染异常，显示带 requestId 的恢复页面；测试重试成功、二次失败和根布局错误三种路径。',
    commonErrors: [
      '为消除警告随意给组件加 suppressHydrationWarning，隐藏真正的内容或属性不一致。',
      '期待 error.tsx 捕获根 layout 或全局 CSS/Script 错误，结果页面完全空白。',
    ],
    sourceRefs: ['Next.js hydration error. https://nextjs.org/docs/messages/react-hydration-error', 'Next.js error handling. https://nextjs.org/docs/app/getting-started/error-handling', 'React hydrateRoot. https://react.dev/reference/react-dom/client/hydrateRoot'],
    steps: [
      ['hydration 比较服务端首帧', '浏览器先显示服务端 HTML，再加载客户端 JS 并用相同 props 与 state 重建首帧；文本、属性和元素结构必须匹配。日期、随机数、localStorage 和浏览器窗口信息在服务端与客户端首轮可能不同，应放到提交后的 Effect 中。失败边界是服务端输出 12:00、客户端输出当前时间导致整树重渲染；验证动作是禁用 JS 查看 HTML，再开 JS 比较首帧与 hydration 完成后的 DOM。', '首轮输出必须一致'],
      ['错误分支要靠近失败范围', '`app/orders/error.tsx` 只替代订单段，根布局仍可保留导航；`global-error.tsx` 在根 layout 失败时接管并必须自行提供 html/body。错误组件需要 "use client" 才能接收 reset。失败边界是把所有错误都交给 global-error，用户失去重试当前段的能力；验证动作是分别让子段和根布局失败，记录哪一层错误文件执行及恢复按钮是否保留外壳。', '恢复范围跟随错误范围'],
      ['reset 只清边界不修数据', 'error.tsx 的 reset 尝试重新渲染该段，若服务端数据仍无效会再次失败；通常先提供重新查询、返回安全页或修正过滤条件。服务端组件错误可返回可序列化的 digest，由客户端记录给支持团队。失败边界是 reset 进入无限循环；验证动作是让接口持续失败，观察请求次数并在上限后停止自动重试。', '恢复动作需有上限'],
      ['日志同时连接浏览器与服务端', '客户端 hydration 错误记录 route、buildId、userAgent 和 error digest；服务端日志记录同一 requestId、构建版本和堆栈。用 source map 将压缩堆栈还原到组件。失败边界是只在控制台看到一行警告，生产无法定位哪版页面；验证动作是人为制造一次可恢复 mismatch，确认错误事件、构建号和 source map 都能在监控系统查到，并可从 digest 反查请求。', '两端日志用同一关联 ID'],
      ['恢复后验证数据与焦点', '错误页返回按钮应回到可操作位置，重试成功后焦点和滚动不丢失；对不是 hydration 的客户端异常通过 Error Boundary 测试。失败边界是页面恢复但屏幕阅读器仍停留在已卸载错误提示；验证动作是使用键盘与 axe 检查，并构造失败到成功流程，确认焦点落在标题或首个可交互控件。', '恢复也是可访问状态转换'],
    ],
  }),
  reactCourse(r4Stage, 'Next.js 部署与回滚实验', {
    minutes: 51,
    prerequisite: '能执行 next build，理解容器、环境变量、CDN、健康检查和不可变制品的基本概念。',
    goal: '能把 Next.js 构建为可部署制品，区分构建时与运行时配置，验证健康检查、缓存更新、版本追踪与代码回滚，并记录一次真实失败发布。',
    guidedPractice: '构建 standalone 输出并放入容器，在测试环境部署两个版本；记录 buildId、commit、环境变量摘要和响应版本头，再发布一个错误页面并用上一 digest 回滚。',
    independentPractice: '为 Next.js 应用写发布清单，包含数据库兼容迁移、CDN 缓存失效、认证密钥轮换、健康检查和回滚顺序；执行一次蓝绿切换并统计切换期间错误请求。',
    commonErrors: [
      '只保存 latest 镜像标签，线上出问题时不知道当前制品对应哪次提交。',
      '回滚应用镜像但数据库迁移不可逆，旧版本读取新 schema 后再次失败。',
    ],
    sourceRefs: ['Next.js deployment. https://nextjs.org/docs/app/getting-started/deploying', 'Next.js self-hosting. https://nextjs.org/docs/app/guides/self-hosting', 'CNCF progressive delivery. https://glossary.cncf.io/progressive-delivery/'],
    steps: [
      ['构建产物绑定源码与配置', '`next build` 生成 `.next` 路由输出和 buildId，部署制品应记录 commit SHA、lockfile 哈希、Node 版本与构建时间，并用镜像 digest 而不是 latest 识别。构建时内联的 NEXT_PUBLIC 配置必须随版本固定。失败边界是两版共用同一可变标签；验证动作是从线上响应反查构建记录、源码提交和依赖清单，确认三者一致。', '发布单元是不可变制品'],
      ['运行配置在启动时注入', '数据库地址、签名密钥与外部服务凭据在运行时从秘密管理系统注入，启动脚本先校验必需变量但不打印值。构建机不需要生产秘密。失败边界是容器启动后首次请求才发现缺失配置；验证动作是故意缺少一个变量，确认健康检查失败且进程退出清晰，而不是服务半坏。', '秘密运行时进入'],
      ['缓存失效与代码发布分开', '新版本上线前或后按业务兼容窗口调用 revalidateTag/revalidatePath，CDN 清除对应路径；客户端 Router Cache 可由重新验证响应触发。失败边界是代码已回滚但 CDN 仍缓存新结构页面；验证动作是记录旧版、新版本和缓存刷新后的 HTML/RSC 版本标记与响应头，并按依赖顺序恢复标签，随后用无痕会话检查旧内容不再命中。', '代码与内容缓存分别回滚'],
      ['蓝绿切换观察真实指标', '新实例先通过健康检查和冒烟测试，再逐步分配流量；观察 5xx、p95、hydration 错误、RSC 请求失败和核心业务成功率。失败边界是只检查首页 200 就全量切换；验证动作是执行一条需登录并读取数据库的关键路径，并将其纳入自动冒烟，再比较两版真实指标、错误日志和回滚触发阈值。', '健康检查要覆盖关键依赖'],
      ['回滚演练包含数据和操作顺序', '回滚顺序通常先停止继续放量，再切回上一不可变制品，恢复兼容配置与缓存，最后核对数据库迁移是否允许旧版读取。演练中记录检测、决策、切换和恢复时间。失败边界是从未运行过旧版，回滚时才发现 schema 不兼容；验证动作是在发布前让旧镜像连接迁移后的兼容 schema 跑完整 smoke，并保存回滚证据。', '回滚必须实际执行过'],
    ],
  }),
];

Object.assign(reactExamples, {
  'Testing Library 与用户行为': [
    reactExample(
      '从用户任务组织组件测试',
      'Testing Library',
      `test('用户搜索课程并看到空态', async () => {
  render(<CourseSearch items={[]} />);
  await user.type(screen.getByRole('searchbox', { name: '搜索课程' }), 'React');
  expect(screen.getByText('没有匹配课程')).toBeVisible();
});

// pnpm vitest run src/CourseSearch.test.tsx`,
      `测试通过时报告直接显示“搜索课程并看到空态”，不暴露内部查询函数。
失败边界：只测试内部 filter 函数不会发现 label 丢失、输入未受控或空态不可见。`,
    ),
    reactExample(
      '语义查询暴露缺失 label',
      'TSX + Testing Library',
      `export function Search() {
  return <input aria-label="订单编号" placeholder="例如 ORD-42" />;
}

const input = screen.getByRole('textbox', { name: '订单编号' });
expect(input).toHaveAccessibleName('订单编号');
expect(input).toHaveAttribute('placeholder', '例如 ORD-42');`,
      `输入框同时拥有可访问名称和占位提示，键盘与读屏都能识别用途。
失败边界：只写 placeholder 没有 label 或 aria-label 时，getByRole 找不到名称，语义不合格。`,
    ),
    reactExample(
      'MSW 在应用网络边界替身',
      'TypeScript + Vitest',
      `const server = setupServer(
  http.get('/api/orders', () => HttpResponse.json([{ id: 'ORD-7', status: 'open' }])),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

render(<OrdersPage />);
expect(await screen.findByText('ORD-7')).toBeVisible();`,
      `组件按真实 fetch 路径请求，MSW 返回订单 ORD-7，测试不依赖全局 fetch mock 细节。
失败边界：在组件内部替换 useQuery 会让路由、序列化和 Query 缓存层都没有被验证。`,
    ),
    reactExample(
      'findByRole 等待异步状态',
      'Testing Library',
      `render(<OrderDetail id="ORD-7" />);
expect(screen.getByRole('status')).toHaveTextContent('加载中');
expect(await screen.findByRole('heading', { name: 'ORD-7' })).toBeVisible();
expect(screen.queryByText('加载中')).not.toBeInTheDocument();`,
      `初始显示加载中，异步响应提交后出现订单标题且加载状态消失。
失败边界：使用固定 sleep 在慢机器可能先读到加载状态，findBy 会按条件自动重试。`,
    ),
    reactExample(
      '覆盖率与测试稳定性共同查看',
      'PowerShell',
      `pnpm vitest run --coverage
pnpm vitest run --reporter=json --outputFile=test-results.json
@'
{
  "requiredCoverage": { "statements": 80, "branches": 70 },
  "maxFlakyRetries": 0
}
'@ | Set-Content test-budget.json
Get-FileHash coverage/coverage-final.json`,
      `覆盖率报告达到预算，JSON 结果中没有重试后通过的测试，证据可以归档比较。
失败边界：只看总覆盖率会让关键错误分支未测；只追求 100% 会鼓励无价值快照测试。`,
    ),
  ],
  'Playwright、路由和移动流程': [
    reactExample(
      '每个测试使用独立浏览器上下文',
      'Playwright',
      `test('A 用户看不到 B 用户草稿', async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const userA = await first.newPage();
  const userB = await second.newPage();
  await userA.goto('/orders/ORD-A');
  await userB.goto('/orders/ORD-B');
  await expect(userA.getByRole('heading')).toHaveText('ORD-A');
  await expect(userB.getByRole('heading')).toHaveText('ORD-B');
  await first.close();
  await second.close();
});`,
      `两个页面各自保留 Cookie、localStorage 和路由状态，A 的草稿不会出现在 B。
失败边界：共享 page 或 context 时登录态和缓存互相污染，测试顺序会改变结果。`,
    ),
    reactExample(
      '语义定位器优先于 CSS',
      'Playwright',
      `await page.getByRole('searchbox', { name: '搜索订单' }).fill('ORD-7');
await page.getByRole('button', { name: '搜索' }).click();
await expect(page.getByRole('row', { name: /ORD-7/ })).toBeVisible();
await expect(page.getByRole('cell', { name: '已支付' })).toBeVisible();

// pnpm playwright test e2e/order-search.spec.ts`,
      `搜索后表格出现 ORD-7 行，状态单元格显示已支付，定位不依赖 hash class。
失败边界：使用 nth-child 或动态 class 会在布局调整后坏掉，且无法反映用户可见语义。`,
    ),
    reactExample(
      '自动等待状态而非固定睡眠',
      'Playwright',
      `await page.getByRole('button', { name: '保存' }).click();
await expect(page.getByRole('button', { name: '保存' })).toBeDisabled();
await expect(page.getByRole('status')).toHaveText('保存成功');
await expect(page.getByRole('button', { name: '保存' })).toBeEnabled();

// 不要写 await page.waitForTimeout(2000);`,
      `Playwright 依次等待禁用、成功消息和恢复可用，慢网络下也能稳定通过。
失败边界：固定等待 2 秒在慢 CI 会提前断言，在快环境则浪费时间且掩盖竞态。`,
    ),
    reactExample(
      '移动项目验证触摸和安全区',
      'Playwright',
      `// playwright.config.ts
projects: [
  { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
],
// e2e/mobile-order.spec.ts
await page.goto('/orders/ORD-7');
await page.getByRole('button', { name: '更多操作' }).tap();
await expect(page.getByRole('menu')).toBeVisible();
await expect(page).toHaveScreenshot('order-mobile.png', { maxDiffPixels: 20 });`,
      `Pixel 7 视口下点击触摸目标打开菜单，截图包含安全区内布局且无横向溢出。
失败边界：只在桌面鼠标项目运行会漏掉 tap、虚拟键盘和底部安全区问题。`,
    ),
    reactExample(
      '失败收集 trace、视频和网络日志',
      'Playwright + PowerShell',
      `@'
import { defineConfig } from '@playwright/test';
export default defineConfig({
  use: { trace: 'retain-on-failure', video: 'retain-on-failure', screenshot: 'only-on-failure' },
  reporter: [['json', { outputFile: 'playwright-report.json' }]],
});
'@ | Set-Content playwright.config.ts
pnpm playwright test e2e/order-search.spec.ts
pnpm playwright show-trace test-results/*/trace.zip`,
      `失败目录包含截图、视频与 trace，可从网络、DOM 快照和时间线复盘整个操作。
失败边界：只保存最后一张截图看不出按钮何时禁用、请求是否重试或页面何时跳转。`,
    ),
  ],
  '代码分割、Suspense 与包体': [
    reactExample(
      '按用户到达概率拆分路由',
      'TSX + React Router',
      `const OrderList = lazy(() => import('./pages/OrderList'));
const OrderReport = lazy(() => import('./pages/OrderReport'));

const router = createBrowserRouter([
  { path: '/orders', element: <Suspense fallback={<p>加载列表</p>}><OrderList /></Suspense> },
  { path: '/reports', element: <Suspense fallback={<p>加载报表</p>}><OrderReport /></Suspense> },
]);
// pnpm build，确认报表代码进入独立 chunk`,
      `首屏只加载订单列表 chunk，进入报表路由时才下载报表代码。
失败边界：把低频报表静态 import 到根路由会让所有用户承担无用包体。`,
    ),
    reactExample(
      'React.lazy 缺 Suspense 时整页等待',
      'TSX + Testing Library',
      `const Editor = lazy(() => import('./Editor'));

export function LessonPage() {
  return <main>
    <h1>课程内容</h1>
    <Suspense fallback={<p role="status">编辑器加载中</p>}><Editor /></Suspense>
  </main>;
}

// 延迟 import Promise 后 render，标题应立即可见，状态显示编辑器加载中`,
      `标题和课程正文先显示，只有编辑器区域出现加载状态。
失败边界：没有局部 Suspense 时首次 lazy 渲染会让整个路由 fallback，正文也一起消失。`,
    ),
    reactExample(
      '懒加载失败提供重试边界',
      'TSX + Error Boundary',
      `const loadChart = () => import('./Chart');
const Chart = lazy(loadChart);

export function ChartPanel() {
  return <RetryBoundary onRetry={() => location.reload()}>
    <Suspense fallback={<p>图表加载中</p>}><Chart /></Suspense>
  </RetryBoundary>;
}
// mock import 拒绝一次，断言显示“图表加载失败”和重试按钮`,
      `chunk 下载失败时只替换图表面板，点击重试重新走资源加载。
失败边界：没有 Error Boundary 时 rejected lazy Promise 会冒泡到根，整个应用白屏。`,
    ),
    reactExample(
      '悬停预加载高概率下一步',
      'TSX + Vite',
      `const loadEditor = () => import('./Editor');
const Editor = lazy(loadEditor);

export function EditLink() {
  return <a href="/editor"
    onMouseEnter={() => void loadEditor()}
    onFocus={() => void loadEditor()}>编辑课程</a>;
}
// Network 中 hover 或 Tab 聚焦后开始下载 Editor chunk，点击前完成`,
      `鼠标悬停或键盘聚焦后立即预取 Editor chunk，点击进入时通常无需再等待。
失败边界：在页面加载时预取所有路由会抵消代码分割，首屏包体和网络竞争反而变差。`,
    ),
    reactExample(
      '包体预算写入 CI',
      'PowerShell',
      `pnpm build
$assets = Get-ChildItem dist/assets -Filter '*.js' | Measure-Object Length -Sum
$sizeKb = [math]::Round($assets.Sum / 1KB, 1)
@{
  entryKb = $sizeKb
  budgetKb = 220
  chunks = (Get-ChildItem dist/assets -Filter '*.js').Count
} | ConvertTo-Json | Set-Content bundle-budget.json
if ($sizeKb -gt 220) { throw "JS 总体积 $sizeKb KB 超过预算" }`,
      `构建产物记录总计 KB 与 chunk 数，超过 220KB 时命令以非零状态退出。
失败边界：只看源码估算或开发服务器体积，不会发现第三方依赖被静态导入的生产包回归。`,
    ),
  ],
  '渲染、长任务与 Web Vitals': [
    reactExample(
      'LCP 对应主要首屏内容',
      'TypeScript + PerformanceObserver',
      `const observer = new PerformanceObserver(list => {
  const last = list.getEntries().at(-1) as PerformanceEntry & { element?: Element };
  console.log('LCP', Math.round(last.startTime), last.element?.tagName);
});
observer.observe({ type: 'largest-contentful-paint', buffered: true });

// 用 4x CPU 与 Fast 3G 打开课程页，记录首个大图或标题时间`,
      `控制台输出 LCP 时间和主要元素，例如 2480 IMG，对应真实首屏主内容。
失败边界：把 First Paint 当成 LCP 会忽略用户真正等待的大图或标题，指标判断偏早。`,
    ),
    reactExample(
      'Long Task 定位主线程阻塞',
      'Browser Performance',
      `const observer = new PerformanceObserver(list => {
  list.getEntries().forEach(entry => {
    console.log('long-task', Math.round(entry.duration), entry.name);
  });
});
observer.observe({ type: 'longtask', buffered: true });

// 在 Performance 火焰图中展开超过 50ms 的任务，
// 区分 JSON.parse、React render、样式布局和第三方脚本`,
      `控制台记录超过 50ms 的任务及其时长，火焰图显示任务内部调用归属。
失败边界：只看到 React commit 很长就盲目 memo，可能实际耗时在同步 JSON 解析或布局。`,
    ),
    reactExample(
      'transition 保持键入即时响应',
      'TSX + Performance',
      `function Search() {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  return <>
    <input value={query} onChange={event => setQuery(event.target.value)} />
    <HeavyResults query={deferred} />
  </>;
}
// 4x CPU 下键入 20 字符，记录 input delay p95 与列表完成时间`,
      `输入框字符先提交，列表使用 deferred 值稍后完成，输入延迟不随列表规模线性恶化。
失败边界：把 input 更新也降优先级会让每次按键等待列表计算，用户感到输入卡顿。`,
    ),
    reactExample(
      '控制长列表 DOM 数量',
      'TSX + Browser',
      `export function VirtualOrders({ rows }: { rows: Array<{ id: string }> }) {
  const [page, setPage] = useState(0);
  const visible = rows.slice(page * 50, page * 50 + 50);
  return <><ul>{visible.map(row => <li key={row.id}>{row.id}</li>)}</ul>
    <button onClick={() => setPage(value => value + 1)}>下一页</button></>;
}
// Elements 面板对比 50 行与 5000 行时的节点数、滚动和 INP`,
      `页面只保留 50 个 li，翻页时 DOM 数量稳定，滚动和点击响应明显更好。
失败边界：只把行组件 memo 但仍渲染 5000 个 DOM 节点，布局与绘制成本仍然存在。`,
    ),
    reactExample(
      '生产 RUM 数据验证优化',
      'TypeScript + Web Vitals',
      `import { onCLS, onINP, onLCP } from 'web-vitals';

const send = (metric: { name: string; value: number; id: string }) => {
  navigator.sendBeacon('/rum', JSON.stringify({
    ...metric,
    route: location.pathname,
    release: document.documentElement.dataset.release,
  }));
};
onLCP(send);
onINP(send);
onCLS(send);

// 按移动设备、路由和 release 分桶比较 p75`,
      `RUM 接收 LCP、INP、CLS 样本并带路由与发布版本，可比较优化前后 p75。
失败边界：只在开发机跑一次 Lighthouse 不能代表真实移动网络，也无法发现版本回归。`,
    ),
  ],
  '错误边界、日志和真实用户监控': [
    reactExample(
      '错误边界捕获渲染子树异常',
      'TSX + Testing Library',
      `class CourseBoundary extends React.Component<{ children: React.ReactNode }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    return this.state.error
      ? <p role="alert">课程组件无法显示</p>
      : this.props.children;
  }
}

// render(<CourseBoundary><BrokenLesson /></CourseBoundary>);
// 外层导航仍可查询，alert 只替换课程子树`,
      `课程渲染错误被局部边界捕获，导航保留，用户可切换到其他课程。
失败边界：事件处理器和异步回调中的异常不会自动被边界捕获，需要 try/catch 或全局监听。`,
    ),
    reactExample(
      'componentDidCatch 附加业务上下文',
      'TSX + Observability',
      `componentDidCatch(error: Error, info: React.ErrorInfo) {
  reportError({
    scope: 'course-renderer',
    courseId: this.props.courseId,
    release: import.meta.env.VITE_RELEASE,
    message: error.message,
    componentStack: info.componentStack,
  });
}

// 触发课程渲染错误，在 Network 请求载荷中检查 courseId 与 componentStack`,
      `错误事件包含课程 ID、发布版本和组件栈，能定位具体业务模块与源码链。
失败边界：只上报 error.message 会得到大量相同文本，无法判断是哪门课程或哪条分支。`,
    ),
    reactExample(
      '网络错误进入请求状态而不是边界',
      'TSX + TanStack Query',
      `const order = useQuery({ queryKey: ['orders', id], queryFn: fetchOrder, retry: 1 });
if (order.isError) {
  return <div role="alert">
    <p>订单加载失败</p>
    <button onClick={() => order.refetch()}>重新请求</button>
  </div>;
}
return order.data ? <OrderView order={order.data} /> : <p role="status">加载中</p>;`,
      `HTTP 失败显示可重试的请求错误，不把可控的网络状态升级为整棵组件树错误。
失败边界：在 queryFn 中 catch 后返回空数据会伪装成合法空订单，用户和监控都看不到故障。`,
    ),
    reactExample(
      'RUM 维度必须可比较',
      'TypeScript',
      `type Metric = {
  name: 'LCP' | 'INP' | 'CLS' | 'error';
  value: number;
  route: string;
  release: string;
  device: 'mobile' | 'desktop';
  connection: string;
};

const sample: Metric = {
  name: 'INP', value: 184, route: '/learning-v2',
  release: '2026.11.24-a', device: 'mobile', connection: '4g',
};
console.log(JSON.stringify(sample));
// 后端按 route/release/device/connection 分桶计算 p75`,
      `样本包含指标、路由、版本、设备和网络，分桶后可以与上一版本进行可解释对比。
失败边界：缺少 release 或设备维度时，混合样本的 p75 变化无法归因于某次优化。`,
    ),
    reactExample(
      '监控加载前获得用户同意',
      'TypeScript + Browser',
      `type Consent = { analytics: boolean };
function startMonitoring(consent: Consent) {
  if (!consent.analytics) return () => {};
  const release = document.documentElement.dataset.release;
  const handler = (event: ErrorEvent) => sendBeacon('/rum', {
    message: event.message, release, route: location.pathname,
  });
  window.addEventListener('error', handler);
  return () => window.removeEventListener('error', handler);
}

// 拒绝 analytics 时 Network 中没有 /rum 请求；同意后才出现脱敏事件`,
      `未同意前不发送监控请求，同意后才注册错误监听并附带发布版本。
失败边界：SDK 在页面加载即采集完整 URL、输入值或用户 ID，会违反隐私约定并泄漏敏感数据。`,
    ),
  ],
  '可访问性与性能联合验收': [
    reactExample(
      '原生 button 带完整键盘语义',
      'TSX + Testing Library',
      `export function SaveAction({ onSave }: { onSave: () => void }) {
  return <button type="button" onClick={onSave}>保存草稿</button>;
}

const button = screen.getByRole('button', { name: '保存草稿' });
button.focus();
await user.keyboard('{Enter}');
expect(onSave).toHaveBeenCalledTimes(1);
expect(button).toHaveFocus();`,
      `Enter 触发一次保存回调，焦点保留在原生 button 上，读屏名称清楚。
失败边界：用 div + role=button 必须自行实现 Enter、Space、tabIndex 和焦点样式，容易遗漏。`,
    ),
    reactExample(
      '动态结果通过 status 公告',
      'TSX + Testing Library',
      `export function SearchResults({ count, loading }: { count: number; loading: boolean }) {
  return <div>
    <p role="status">{loading ? '正在筛选' : '找到 ' + count + ' 条结果'}</p>
    {loading && <div aria-hidden="true">骨架屏</div>}
  </div>;
}

// 输入关键字后断言 status 文本更新，骨架屏不进入可访问树`,
      `筛选完成时 status 公告“找到 8 条结果”，视觉骨架屏不会被读屏重复朗读。
失败边界：只改变视觉数字且没有 live region，屏幕阅读器用户不知道结果已更新。`,
    ),
    reactExample(
      'Playwright 中扫描交互后状态',
      'Playwright + axe',
      `import AxeBuilder from '@axe-core/playwright';

test('筛选菜单打开后无严重无障碍问题', async ({ page }) => {
  await page.goto('/orders');
  await page.getByRole('button', { name: '筛选' }).click();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations.filter(item => item.impact === 'serious')).toEqual([]);
});`,
      `菜单打开后的 DOM 被扫描，严重与致命违反项为 0，测试报告保留违规节点。
失败边界：只扫描初始首页会漏掉菜单、错误提示和动态表格中的 ARIA 问题。`,
    ),
    reactExample(
      '虚拟列表保留键盘焦点',
      'TSX + Playwright',
      `await page.getByRole('button', { name: '第 49 行操作' }).focus();
await page.keyboard.press('Tab');
await page.keyboard.press('Shift+Tab');
await expect(page.getByRole('button', { name: '第 49 行操作' })).toBeFocused();
await page.getByRole('button', { name: '下一页' }).click();
await expect(page.getByRole('button', { name: '第 99 行操作' })).toBeFocused();`,
      `虚拟滚动后焦点仍跟随实体操作按钮，翻页后聚焦首个新行而不是 body。
失败边界：为减少 DOM 直接卸载聚焦节点，键盘用户会丢失当前位置，无法继续操作。`,
    ),
    reactExample(
      '联合门禁记录自动与人工证据',
      'PowerShell',
      `pnpm playwright test e2e/a11y.spec.ts e2e/mobile-vitals.spec.ts
$evidence = @{
  axeSerious = 0
  keyboardSmoke = 'pass'
  lcpP75 = 2.1
  inpP75 = 182
  reviewer = 'zhou'
  checkedAt = (Get-Date).ToUniversalTime().ToString('o')
}
$evidence | ConvertTo-Json | Set-Content release-a11y.json
Get-Content release-a11y.json`,
      `发布证据同时记录 axe、键盘 smoke、LCP/INP 与人工复核人和时间。
失败边界：只记录 Lighthouse 分数而没有人工键盘与读屏结论，无法证明辅助技术可用。`,
    ),
  ],
});

const r5Stage = '测试、性能与可访问性';

export const HANDWRITTEN_REACT_R5_COURSES: readonly ProgrammingCourseSeed[] = [
  reactCourse(r5Stage, 'Testing Library 与用户行为', {
    minutes: 36,
    prerequisite: '已能运行 Vitest，理解 React 状态、异步请求和可访问角色查询。',
    goal: '能使用 React Testing Library 按用户行为测试组件，控制异步状态与网络替身，并以可维护查询和断言减少实现耦合。',
    guidedPractice: '为搜索组件配置 Vitest jsdom，使用 userEvent 输入、点击和清空；用 MSW 返回成功、空数组与 500，分别断言结果、空态和 alert，全程不查询 class 或内部 state。',
    independentPractice: '为课程详情补测试，覆盖加载骨架、成功内容、无权限、重试和卸载后迟到响应；要求测试名称描述用户任务，并在 CI 中稳定重复运行二十次。',
    commonErrors: [
      '用 getByTestId 覆盖所有节点，完全不验证 label、role 和用户可操作路径。',
      '测试异步请求时使用固定 sleep，机器繁忙后随机失败，也没有检查未处理 Promise。',
    ],
    sourceRefs: [vitestDocs, testingLibraryDocs, 'MSW documentation. https://mswjs.io/docs/'],
    steps: [
      ['测试边界从用户任务开始', '用 `render(<CourseSearch />)` 挂载组件，优先查询 `getByRole("searchbox")`、`getByRole("status")` 和可见文本，再通过 userEvent 触发真实事件。测试不应关心组件用了 useState 还是 useReducer。失败边界是重构内部状态后大量测试失败却没有行为变化；验证动作是把 state 改成 reducer，只保留用户可见断言，测试应继续通过，失败日志仍能指出用户步骤。', '行为是稳定契约'],
      ['查询语义同时暴露无障碍问题', 'label、role、name 既是 RTL 查询接口，也是屏幕阅读器理解页面的入口；多个同名按钮在上下文中可加区域限定。`within(card).getByRole("button")` 比全局 testId 更接近用户。失败边界是图标按钮没有 accessible name；验证动作是运行 `getByRole("button", { name: /收藏/ })`，失败后补 aria-label，而不是退化为查 SVG class，并复查焦点顺序、读屏名称、重复文本、隐藏元素和动态状态描述。', '查询失败也是产品缺陷'],
      ['网络替身保持在应用边界', 'MSW 拦截真实 fetch URL，让组件、Query 和错误映射都走正常代码；比较 mock 模块函数，网络层替身更能发现请求参数错误。为每个测试重置 handlers 和 QueryClient。失败边界是测试直接返回假 Query 对象，绕过缓存和错误处理；验证动作是断言请求 URL、方法、body 与界面状态一致，并测试 401 到登录分支，确认处理器没有跨用例泄漏。', '在边界模拟外部系统'],
      ['异步测试等待状态条件', '`await screen.findByText("加载完成")` 会等待异步提交；用 `waitFor` 检查请求次数或元素消失，不应使用固定毫秒。act 警告表示状态更新发生在测试未包裹的交互中，需要修正 userEvent 使用或异步等待。失败边界是测试结束才出现 setState 警告并污染下一个用例；验证动作是启用严格未处理错误，在每个用例清理 QueryClient 与 server handlers。', '等条件而非等时钟'],
      ['覆盖率和稳定性共同看', '统计组件、Hook 和错误分支覆盖，但覆盖率不能证明断言有效；对关键路径使用 mutation testing 或故意改坏代码确认测试失败。重复运行、随机顺序和不同时区能暴露 flaky。失败边界是覆盖率 90% 但错误重试从未被断言；验证动作是增加一个失败网络反例并让 CI 重跑矩阵，确认失败能稳定定位到具体行为。', '测试必须会失败才有价值'],
    ],
  }),
  reactCourse(r5Stage, 'Playwright、路由和移动流程', {
    minutes: 39,
    prerequisite: '能启动前端与测试 API，理解浏览器导航、Cookie 会话和响应式布局。',
    goal: '能用 Playwright 在真实浏览器中验证路由、登录、网络失败与移动视口，按角色定位、自动等待并保存 trace、截图和网络证据。',
    guidedPractice: '为订单流程写 Playwright 测试：登录、打开列表、修改筛选、进入详情、后退；使用 `page.getByRole` 与 `toHaveURL`，在移动项目执行同一路径并开启 trace on retry。',
    independentPractice: '建立桌面与 390px 两套项目，覆盖路由深链接、API 500、慢网和键盘操作；用 route 拦截制造一次失败，再从 trace 中定位请求、DOM 与失败截图。',
    commonErrors: [
      '用 page.waitForTimeout 等待页面稳定，测试在慢 CI 随机失败且浪费时间。',
      '选择 CSS 层级或 nth-child，布局调整后测试失效，用户行为却完全没有变化。',
    ],
    sourceRefs: [playwrightDocs, 'Playwright locators. https://playwright.dev/docs/locators', 'Playwright trace viewer. https://playwright.dev/docs/trace-viewer'],
    steps: [
      ['上下文隔离每个测试', 'Playwright 为每个 test 创建 BrowserContext，Cookie、localStorage 和缓存默认隔离；登录可通过 storageState 复用，但账号状态变化仍需清理。失败边界是测试共享登录后的数据库修改，执行顺序一变就失败；验证动作是随机顺序与并行运行，确认每个测试都从明确 seed 数据开始。', '测试数据与浏览器隔离'],
      ['定位器优先语义与稳定属性', '`page.getByRole("link", { name: "订单" })`、getByLabel 和 getByText 跟随用户语义；重复列表项可先定位包含唯一标题的 region，再 within 查找动作。失败边界是 aria 名称变化后选择器全红；验证动作是把文案修正纳入测试评审，只有确实不面向用户的调试属性才用 data-testid，并检查同名控件范围与页面区域，防止选择到隐藏元素。', '选择器是交互契约'],
      ['自动等待断言真实状态', 'Playwright 的 locator 动作与断言会等待元素可操作和条件满足；点击后用 `await expect(page).toHaveURL(/orders\\/42/)`、`expect(row).toContainText("已支付")`，不要 sleep。失败边界是点击后 URL 变了但页面数据仍加载；验证动作是同时断言 URL、关键 role 和网络请求完成后的内容，确保不是只检查路由壳，并复跑慢网、失败响应和返回导航场景，同时记录等待超时。', '等待可见业务条件'],
      ['移动项目验证触摸与安全区', '在 `devices["iPhone 13"]` 或 390px 项目中检查底部操作不被安全区遮挡、横向步骤可滚动、目标尺寸足够大；键盘外设路径可另开 desktop 项目。失败边界是元素存在但被固定横幅覆盖；验证动作是实际 click/触摸并截图，检查 boundingBox、viewport、焦点与滚动位置，再旋转屏幕复核软键盘弹出后的可视区、底部安全区和点击命中。', '存在不等于可操作'],
      ['失败证据要能复盘', '开启 trace 保留 DOM 快照、网络、控制台和截图；对关键 API 设置明确响应断言，测试结束上传 artifact。失败边界是 CI 只输出一行 timeout，看不到当时页面；验证动作是故意制造 500，确认 trace 中能定位请求、错误组件与重试按钮，再据此修复选择器或产品行为，并记录修复版本、artifact 链接和首次失败时间。', '失败也要产生证据'],
    ],
  }),
  reactCourse(r5Stage, '代码分割、Suspense 与包体', {
    minutes: 42,
    prerequisite: '会使用动态 import，理解打包器 chunk、缓存和 Suspense fallback，能阅读构建体积报告。',
    goal: '能按路由和交互边界拆分代码，使用 React.lazy 或 Next dynamic 控制加载时机，以 Suspense 管理回退，并用包体预算验证首屏收益。',
    guidedPractice: '把图表编辑器从主页面改为 `lazy(() => import("./ChartEditor"))`，以 Suspense 包围并使用 startTransition 打开；用构建报告对比入口 chunk、编辑器 chunk 和首屏加载请求。',
    independentPractice: '为后台页面规划路由级与组件级拆分，要求低频权限编辑器按需加载、首屏关键组件预加载、弱网有可恢复 fallback；建立入口包体和关键路由包体预算。',
    commonErrors: [
      '只把模块改成 dynamic import，却仍从入口静态 import 导出类型或副作用模块，最终 chunk 没有真正隔离。',
      'Suspense fallback 只显示空白，慢网用户不知道正在加载什么，取消后也没有返回路径。',
    ],
    sourceRefs: ['React lazy. https://react.dev/reference/react/lazy', 'React Suspense. https://react.dev/reference/react/Suspense', 'Next.js lazy loading. https://nextjs.org/docs/app/guides/lazy-loading'],
    steps: [
      ['先按用户到达概率拆边界', '路由级拆分让未访问页面不进首屏入口，交互级拆分适合重型编辑器、图表和低概率弹窗；共享基础组件若被所有页面使用，强行拆成多个小 chunk 反而增加请求。失败边界是拆出大量 2KB 文件导致瀑布请求；验证动作是查看构建图和真实弱网 Network，比较入口体积、请求数与交互可用时间。', '拆分服务用户路径'],
      ['React.lazy 需要 Suspense', '`const Editor = lazy(() => import("./Editor"))` 只接受返回 Promise 的默认导出模块，首次渲染时抛出一个 thenable，最近的 Suspense 显示 fallback；模块加载完成后继续 render。失败边界是 lazy 组件没有边界，整页被最外层空白 fallback 替代；验证动作是先节流网络再打开编辑器，确认页面其余部分仍可操作，并检查 fallback 可访问名称、键盘焦点和取消路径。', '局部边界限制等待范围'],
      ['加载错误需要重试边界', '动态 import 可能因 CDN 404、离线或部署版本切换失败，Error Boundary 应捕获并提供重新加载页面或重试模块。新版本部署后旧 HTML 指向不存在 chunk 是常见风险。失败边界是一直显示加载中而没有错误路径；验证动作是拦截 editor chunk 返回 404，确认错误说明、重建请求和返回入口可用，并记录 chunk 版本。', '分包把网络失败变成渲染失败'],
      ['预加载服务高概率下一步', '对用户即将进入的路由可在 hover、viewport 或登录成功后调用动态 import 预取，但不要在空闲前预取所有模块。Next.js 可用路由预取或 dynamic import，注意用户数据与权限模块仍由服务端控制。失败边界是预取造成移动流量浪费；验证动作是按交互记录下载 chunk 时间与点击后的 ready 时间，确认收益覆盖额外请求。', '预取只在概率高时做'],
      ['包体预算进入 CI', '记录入口 JS gzip、关键路由 chunk、第三方依赖重复版本和 source map 变化；设置预算让超过阈值的 PR 失败或要求说明。失败边界是本地比较未压缩文件名而忽略实际传输；验证动作是使用生产构建、gzip/brotli 体积和 Lighthouse，检查改动前后首屏资源与 INP，并保存依赖版本差异和预算审批记录。', '预算约束防止回退'],
    ],
  }),
  reactCourse(r5Stage, '渲染、长任务与 Web Vitals', {
    minutes: 45,
    prerequisite: '会使用浏览器 Performance 和 React Profiler，理解 LCP、CLS、INP 分别描述什么体验。',
    goal: '能定位 React 提交、长任务和主线程阻塞对 LCP、CLS、INP 的影响，选择状态拆分、转场、虚拟化或资源优化，并用真实数据验证收益。',
    guidedPractice: '在四倍 CPU 节流下记录一个筛选页的 LCP、交互 INP 候选与 React commit 火焰图；把昂贵列表改成延迟值或虚拟化，反复测量键入、点击到视觉反馈的延迟。',
    independentPractice: '为企业目录页建立性能预算，覆盖移动 LCP、CLS、INP p75 和入口 JS；完成三项优化，每项保留前后 trace、Profiler 截图和用户交互脚本。',
    commonErrors: [
      '只优化 bundle 大小，却忽略点击后同步计算和大量 DOM 更新造成的 INP 长延迟。',
      '在开发模式读取性能数字并直接与生产比较，忽略 React DevTools、source map 和未压缩代码开销。',
    ],
    sourceRefs: [webVitalsDocs, 'Chrome long tasks. https://web.dev/articles/long-tasks-devtools', 'React Profiler. https://react.dev/reference/react/Profiler'],
    steps: [
      ['Vitals 对应用户阶段', 'LCP 关注首屏主要内容的加载与绘制，CLS 关注布局意外移动，INP 关注用户交互到下一帧可见反馈的延迟。优化前先为页面选定真实元素和交互，不用单一 Performance 分数替代。失败边界是只测首页桌面而忽略关键订单操作；验证动作是建立移动与桌面交互脚本，记录元素、时间窗、网络和 CPU 条件。', '指标对应具体体验'],
      ['长任务拆解主线程占用', 'Performance 的 Long Task 超过 50ms，会延迟输入处理和绘制；React render 与 commit 可能只是其中一段，JSON 解析、同步排序和第三方脚本也会阻塞。失败边界是把所有 INP 都归咎于组件重渲染；验证动作是看火焰图中事件处理、React 工作、样式布局与绘制各占多少，再决定改状态还是资源，并记录任务归属、持续时间和触发交互。', '先定位主线程归属'],
      ['转场保持输入即时响应', '对搜索过滤大列表，输入状态立即可见，昂贵结果通过 useDeferredValue 或 startTransition 延后；长 SQL 仍在服务端，要配合取消和分页。失败边界是把受控输入本身延后；验证动作是键入十个字符并测量按键到输入框显示、结果稳定的两段时间，分开验收，同时确认输入字符没有丢失。', '输入反馈优先于结果'],
      ['列表与 DOM 数量受控', '上千行同时挂载会产生大量 Fiber 与 DOM，即使 memo 每行也会消耗内存和布局时间。虚拟化只渲染视口附近行，必须保证可变行高、键盘滚动和可访问文本仍可用。失败边界是虚拟列表隐藏了屏幕阅读器需要的内容；验证动作是测量 DOM 行数、滚动帧率、键盘焦点与全文搜索边界，再决定页大小。', '减少工作不只减少比较'],
      ['生产数据验证优化', '在 production build、固定设备或真实 RUM p75 上比较优化前后 LCP、CLS、INP 和长任务分布；缓存和网络波动用多次运行中位数与分位数处理。失败边界是优化只改善了开发机单次最好成绩；验证动作是保留版本、脚本、trace 与指标表，若 p75 无改善则回退，并说明退化风险、受影响设备和后续观察窗口。', '分位数据决定保留'],
    ],
  }),
  reactCourse(r5Stage, '错误边界、日志和真实用户监控', {
    minutes: 48,
    prerequisite: '理解 Error Boundary 捕获范围，能处理浏览器异常、Promise 拒绝和 source map。',
    goal: '能建立分区域错误边界，记录可关联的 React 渲染错误与网络错误，使用采样和脱敏把真实用户监控接入发布决策。',
    guidedPractice: '实现 OrderErrorBoundary，在 componentDidCatch 中上报 message、componentStack、route、buildId 与 requestId；分别制造 render 异常和点击回调异常，确认前者被捕获、后者通过全局监听补上。',
    independentPractice: '接入 RUM 与 error endpoint，覆盖生产 source map、用户同意、样本采样和告警；发布一个只在灰度用户触发的已知错误，验证能在十分钟内定位版本、路由和复现步骤。',
    commonErrors: [
      '只用 window.onerror 监听错误，遗漏 React 子树错误或丢失 componentStack。',
      '把完整 state、请求体和用户文本发送到日志平台，造成隐私泄露和成本失控。',
    ],
    sourceRefs: ['React error boundary. https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary', 'Sentry React errors. https://docs.sentry.io/platforms/javascript/guides/react/', 'OpenTelemetry browser. https://opentelemetry.io/docs/languages/js/getting-started/browser/'],
    steps: [
      ['错误边界只守渲染子树', 'Error Boundary 捕获 render、生命周期与构造中的错误，但不能捕获点击回调、setTimeout 或普通 Promise。订单详情可单独包边界，崩溃时保留导航和重试；根边界处理不可恢复状态。失败边界是每个按钮都包边界却仍无法捕获事件异常；验证动作是分别抛 render error 与 event error，记录实际被哪个监听器捕获。', '边界范围与错误来源匹配'],
      ['componentDidCatch 补业务上下文', '在 componentDidCatch(error, info) 中记录 error.name、message、componentStack、route、buildId、用户区域和 requestId，不记录密码、令牌和完整表单值。react-error-boundary 可减少样板但上报内容仍需设计。失败边界是同一 message 来自多个页面无法归因；验证动作是构造两个不同路由错误，确认监控能按 route 和 release 聚合，并核查脱敏字段、采样率、重复上报、组件栈和用户操作序列。', '上下文决定可修复性'],
      ['网络错误与渲染错误分开', 'Query error 通常显示可重试面板而非崩溃边界；渲染异常说明代码或数据形状不兼容。全局 unhandledrejection 用于兜底，不能替代请求层分类。失败边界是 401 被当作 JS 崩溃告警造成噪声；验证动作是给错误增加 category、status 和 handled 字段，检查仪表盘与告警路由，并确认重试路径不会升级告警，同时验证用户恢复流程。', '错误分类影响响应'],
      ['RUM 使用可比较维度', '真实用户监控记录 release、route、device、浏览器、网络类型、Vitals 和错误率，按 p75 与错误会话比例观察；采样要能兼顾高流量成本与低频严重错误。失败边界是只按总量看，40% 用户在某浏览器崩溃却被平均值掩盖；验证动作是按 release 和 route 切片，检查样本量并在告警中要求最小分母，再核对采样偏差。', '聚合要保留关键切片'],
      ['监控接入发布与隐私', 'Web SDK 初始化放在明确同意后，秘密和敏感字段进入脱敏列表；source map 私有上传并在构建后控制访问。发布后观察错误率基线，异常超过阈值自动暂停放量。失败边界是 map 文件公开可下载暴露源码细节；验证动作是检查静态资源权限、日志样例和删除请求流程，并演练一次告警到停止发布。', '可观测性也受安全约束'],
    ],
  }),
  reactCourse(r5Stage, '可访问性与性能联合验收', {
    minutes: 51,
    prerequisite: '理解键盘焦点、语义 HTML、ARIA 基本规则，并能运行 Playwright 与性能面板。',
    goal: '能把键盘、屏幕阅读器语义、触控目标、对比度与性能预算放进同一验收矩阵，使用 axe 与真实交互发现异步提示和焦点恢复问题。',
    guidedPractice: '给订单流程加入 axe 扫描、Tab 顺序、Escape 关闭弹窗、错误 focus 和减动效测试；同时记录低端设备下的 INP，比较无障碍修复是否引入额外主线程工作。',
    independentPractice: '为一个企业数据表建立桌面与 390px 联合验收，覆盖表头语义、排序按钮名称、分页键盘、空状态公告、虚拟化后焦点、LCP 与 INP；把自动化与人工检查结果写入发布门禁。',
    commonErrors: [
      'axe 无人为错误就认为完全无障碍，忽略键盘焦点顺序、动态提示和可理解文案。',
      '为通过颜色对比度增加复杂滤镜和动画，反而拉长首帧与交互延迟。',
    ],
    sourceRefs: [axeDocs, 'WCAG 2.2. https://www.w3.org/TR/WCAG22/', webVitalsDocs],
    steps: [
      ['语义先于 ARIA 补丁', '优先使用 button、table、nav、label 与原生表单控件，ARIA 只在原生语义无法表达时补充；角色必须拥有对应状态和键盘行为。失败边界是 div 上只加 role=button 却没有 Enter、Space 与焦点样式；验证动作是关闭鼠标，仅用 Tab、Enter、Space 和 Escape 完成主流程，并检查焦点可见、顺序合理和读屏名称。', '原生语义减少自定义错误'],
      ['动态状态必须被感知', '筛选结果数量变化可用 aria-live=polite 或 role=status，模态框打开时捕获焦点并在关闭后还原；错误摘要链接到字段。失败边界是视觉提示出现但屏幕阅读器无公告；验证动作是在 axe 之外用可访问树与真实读屏路径检查，并断言 activeElement 在关键转换后正确，关闭后回到触发按钮。高频公告还应合并，避免读屏被逐字打断。', '焦点和公告也是状态'],
      ['自动化扫描放在浏览器层', '在 Playwright 页面稳定后注入 axe-core，按 WCAG 标签扫描并在 PR 中输出节点、规则与影响等级；复杂组件可对局部区域扫描。失败边界是加载中途扫描得到假阳性或漏掉门槛后内容；验证动作是打开菜单、错误和空状态后再扫描，并维护明确的豁免清单与负责人，定期复测豁免项。', '扫描状态而不只首页'],
      ['性能优化不能牺牲辅助技术', '虚拟列表、延迟渲染和 skeleton 必须保留可访问名称、焦点位置和加载进展；动画遵循 prefers-reduced-motion，隐藏内容不能用 visibility 的无障碍副作用来省渲染。失败边界是虚拟化把键盘焦点卸载后用户迷失；验证动作是边滚动边 Tab，记录焦点、公告与 INP，并核对减少动效模式、文本缩放和读屏内容。', '体验指标共同约束'],
      ['联合门禁连接真实发布', 'CI 运行 axe 严重规则、键盘 smoke、LCP/INP 预算和截图差异；人工每轮检查读屏关键路径与移动触控。失败边界是只看 Lighthouse 单页分数；验证动作是在类生产网络和设备下跑主流程，发布清单记录自动结果、人工结论、未通过项与风险接受人，并保留复测日期、证据链接和偏差。', '自动与人工各守边界'],
    ],
  }),
];

Object.assign(reactExamples, {
  '源码仓库、版本和入口': [
    reactExample(
      '固定 React tag 与 commit',
      'PowerShell + Git',
      `git clone https://github.com/facebook/react.git react-source
Set-Location react-source
git checkout v19.2.0
$commit = git rev-parse HEAD
node -e "const p=require('./packages/react/package.json'); console.log(p.version, process.env.REACT_COMMIT)" 2>$null
@"
tag=v19.2.0
commit=$commit
"@ | Set-Content ../react-baseline.txt
Get-Content ../react-baseline.txt`,
      `react-baseline.txt 记录 v19.2.0 与完整 commit，所有源码链接都能绑定同一版本。
失败边界：直接阅读 main 分支却运行旧版 react-dom，函数名和 Lane 结构可能已经不同。`,
    ),
    reactExample(
      '从 react-dom/client 追到 reconciler',
      'PowerShell + ripgrep',
      `Set-Location react-source
rg -n "createRoot|createContainer|updateContainer|scheduleUpdateOnFiber" packages/react-dom packages/react-reconciler -g '*.js'
rg -n "function scheduleUpdateOnFiber|function performWorkOnRoot" packages/react-reconciler/src/ReactFiberWorkLoop.js
rg -n "export function createContainer" packages/react-reconciler/src/ReactFiberReconciler.js
git diff --no-index packages/react-dom/src/client/ReactDOMRoot.js packages/react-reconciler/src/ReactFiberReconciler.js`,
      `搜索结果显示 createRoot 位于 react-dom/client，后续更新进入 react-reconciler 的 Fiber 工作循环。
失败边界：只从 react 包查找 createRoot 会误判入口；DOM 渲染入口实际由 react-dom 提供。`,
    ),
    reactExample(
      '最小应用触发源码断点',
      'TSX + Browser DevTools',
      `// src/main.tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';
const root = createRoot(document.getElementById('root')!);
root.render(<App />);
console.log('root-tag', root._internalRoot.tag);

// 在 Sources 的 ReactFiberWorkLoop.js 搜索 performUnitOfWork，
// 设置条件断点 fiber.type?.name === 'App'，点击一个按钮后逐步执行`,
      `首次挂载和点击更新都能在 performUnitOfWork 停住，作用域显示当前 Fiber 与 lanes。
失败边界：生产压缩构建没有可读函数名，必须用开发构建或带 sourcemap 的本地 React 构建。`,
    ),
    reactExample(
      '用运行时分支核对文章结论',
      'TypeScript + Browser Console',
      `const expected = {
  createRoot: 'react-dom/client',
  updateScheduling: 'react-reconciler',
  passiveEffects: 'commit-root traversal',
};
for (const [claim, location] of Object.entries(expected)) {
  console.log(claim, location, document.documentElement.dataset.reactBuild);
}
// 同时在源码中搜索函数，并记录当前 tag、构建时间和实际断点位置`,
      `三条结论都有 package、源码文件、构建版本和断点位置支撑，不依赖文章口述。
失败边界：文章说“Effect 总在绘制后执行”但源码路径可能包含 layout/passive 两阶段，必须回到当前 commit 核对。`,
    ),
    reactExample(
      '保存正常更新与 transition 基线',
      'PowerShell',
      `@'
{
  "reactTag": "v19.2.0",
  "app": "minimal-counter",
  "breakpoints": ["updateContainer", "ensureRootIsScheduled", "performUnitOfWork", "commitRoot"],
  "scenarios": ["normal-click", "transition-update"],
  "logs": ["root-tag", "renderLanes", "commit-phase"]
}
'@ | Set-Content source-experiment.json
Get-FileHash source-experiment.json
git -C react-source rev-parse HEAD`,
      `实验清单与 commit 哈希一起保存，下一次升级可按同一场景重放并比较日志。
失败边界：只保存截图或函数名无法确认版本，升级后结论会悄悄失效。`,
    ),
  ],
  'Fiber 节点和工作循环': [
    reactExample(
      '从组件元素找到对应 Fiber',
      'TSX + Browser DevTools',
      `function Child() { return <span>child</span>; }
export function Parent() { return <section><Child /></section>; }

// 在 React DevTools Components 面板选中 Parent，
// 控制台执行 $r 查看当前 Fiber：
console.log({ tag: $r.tag, type: $r.type.name, child: $r.child?.type, return: $r.return?.type });
console.log('host-node', $r.stateNode?.nodeName);`,
      `控制台显示 Parent 的 child 指向 Child Fiber，Child 的 return 指回 Parent。
失败边界：$r 是 DevTools 的调试引用，不是业务 API；把 Fiber 字段当成稳定组件契约会随版本变化。`,
    ),
    reactExample(
      'alternate 新旧树互相引用',
      'TSX + Browser DevTools',
      `function Toggle() {
  const [on, setOn] = useState(false);
  return <button onClick={() => setOn(value => !value)}>{on ? '开' : '关'}</button>;
}

// 首次挂载后记录 $r.alternate，
// 点击后再次查看 $r.alternate，
// current 与 workInProgress 的 alternate 应指向对方`,
      `更新后当前 Fiber 的 alternate 指向旧 Fiber，两棵树通过 alternate 成对复用。
失败边界：alternate 存在不代表组件一定重渲染，比如无变化更新会被 bailout。`,
    ),
    reactExample(
      'beginWork 条件日志记录组件路径',
      'React Source Debug',
      `// packages/react-reconciler/src/ReactFiberBeginWork.js
// 临时实验：只记录目标组件并保留原始返回
const originalBeginWork = beginWork;
beginWork = function measuredBeginWork(current, workInProgress, lanes) {
  if (workInProgress.type?.name === 'Child') {
    console.log('beginWork', workInProgress.type.name, lanes);
  }
  return originalBeginWork(current, workInProgress, lanes);
};

// 用本地 React source build 运行最小应用，观察点击时 Child 是否进入 beginWork`,
      `点击导致 Child 更新时日志出现 beginWork Child 与对应 lane，可和 DevTools 面板对照。
失败边界：日志只能证明进入函数，不能证明子组件一定提交；需要继续看 bailout 和 commit 阶段。`,
    ),
    reactExample(
      'completeWork 与 commitMutation 前后对照',
      'React Source Debug',
      `// 在 ReactFiberWorkLoop.js 的 completeWork 调用处读 DOM：
console.log('complete', fiber.type, fiber.stateNode?.textContent);

// 在 ReactFiberCommitWork.js 的 commitMutationEffects 后读同一节点：
console.log('commit', fiber.type, fiber.stateNode?.textContent);

// 将日志按 fiber.key 和时间排序，确认文本变化发生在哪个阶段`,
      `completeWork 日志仍可能是旧 DOM，commitMutationEffects 后同一节点文本才更新。
失败边界：把 render/completeWork 当成 DOM 已写入会误判布局和 Effect 时序。`,
    ),
    reactExample(
      'lane 从更新到子树的传播',
      'TypeScript + Browser Console',
      `const root = document.querySelector('#root');
const fiber = root?._reactRootContainer?._internalRoot?.current;
console.log({
  childLanes: fiber?.childLanes,
  pendingLanes: fiber?.pendingLanes,
  rootTag: fiber?.tag,
});
// 触发一次 setState 后重复读取，比较当前 root 与新 alternate 的 lanes`,
      `更新入队后 root 的 pendingLanes 变化，Fiber 的 childLanes 沿父链标记待处理路径。
失败边界：只读单个组件 props 无法解释某次更新为何被跳过，lane 与 root 状态才是调度证据。`,
    ),
  ],
  'Hooks 链表与更新队列': [
    reactExample(
      '首次 render 创建 Hook 链表',
      'TSX + Browser DevTools',
      `export function HookChain() {
  const [count] = useState(0);
  const [name] = useState('Ada');
  const ref = useRef(null);
  return <div>{count} / {name}<span ref={ref}>节点</span></div>;
}

// DevTools 选中 HookChain 后读取 $r.memoizedState，
// 依次查看 next：count -> name -> ref 三个 hook 节点`,
      `memoizedState 链表的三个节点顺序与源码调用顺序一致，子节点的 memoizedState 分别保存值。
失败边界：在 if 分支中调用 Hook 会改变下一次链表长度和顺序，状态可能串到另一个 Hook。`,
    ),
    reactExample(
      'Hook 节点保存自己的更新队列',
      'TSX + Browser Console',
      `export function QueueProbe() {
  const [value, setValue] = useState(0);
  return <button onClick={() => setValue(v => v + 1)}>value: {value}</button>;
}

// 点击后查看 $r.memoizedState.queue.pending，
// 记录 pending 的 action、lane 和 next，
// 再查看 memoizedState.memoizedState 仍是当前页面显示值`,
      `点击后 queue.pending 出现一个 update action，页面当前 memoizedState 仍先保持旧值直到 render。
失败边界：把 queue.pending 的 action 误当成当前 state，会在提交前读取到未来值。`,
    ),
    reactExample(
      '环形 pending 队列可重放多次更新',
      'TSX + Vitest',
      `export function MultiUpdate() {
  const [count, setCount] = useState(0);
  return <button onClick={() => {
    setCount(value => value + 1);
    setCount(value => value * 2);
    setCount(value => value + 3);
  }}>count: {count}</button>;
}

render(<MultiUpdate />);
await user.click(screen.getByRole('button'));
expect(screen.getByRole('button')).toHaveTextContent('count: 5');`,
      `三次 action 按顺序应用：(0 + 1) * 2 + 3 得到 5，队列没有丢失更新。
失败边界：如果每个 action 都直接读 count 快照，而不是 updater 参数，多个 action 会使用同一旧值。`,
    ),
    reactExample(
      'eagerState 相同值跳过调度',
      'TSX + Profiler',
      `export function SameValue() {
  const [count, setCount] = useState(0);
  return <>
    <button onClick={() => setCount(0)}>重复设置 0</button>
    <output>{count}</output>
  </>;
}
// 用 Profiler 记录连续点击“重复设置 0”的 commit 数；
// 再改为 setCount(value => value + 0) 比较`,
      `重复设置相同值通常不产生新的可见提交，Profiler 记录明显少于直接更新。
失败边界：已有 pending lane 时 eagerState 优化会让位，不能用它推断所有 dispatch 都会同步跳过。`,
    ),
    reactExample(
      'requestId 串起事件和 Hook 结果',
      'TSX + Browser Console',
      `let requestId = 0;
export function HookRequest() {
  const [value, setValue] = useState(0);
  const handle = () => {
    const id = ++requestId;
    console.log('request', id, 'before', value);
    setValue(current => current + 1);
    queueMicrotask(() => console.log('request', id, 'after', value));
  };
  return <button onClick={handle}>{value}</button>;
}
// 连续点击三次，按 requestId 排序日志`,
      `三条 request 日志按 id 排列，after 仍显示事件快照，下一次 render 才出现新值。
失败边界：多个并发交互没有 requestId 时，日志交错无法对应到底是哪次点击触发了哪个状态。`,
    ),
  ],
  'Scheduler 优先级和可中断渲染': [
    reactExample(
      'Lane 位掩码与 renderLanes',
      'React Build + Browser Console',
      `// 本地开发构建中在 updateContainer 后记录：
console.log('lane', root.pendingLanes.toString(2));
console.log('renderLanes', workInProgressRootRenderLanes.toString(2));

// 分别触发普通 setState 与 startTransition，
// 对比 pendingLanes 的位和工作循环读取的 renderLanes`,
      `普通更新与 transition 表现出不同 lane 位，renderLanes 只包含本次实际处理集合。
失败边界：lane 是 React 内部实现，不应在业务代码硬编码数值，版本升级可能重排。`,
    ),
    reactExample(
      'Scheduler priority 映射任务',
      'React Source Debug',
      `// packages/scheduler/src/forks/Scheduler.js
// 临时在 scheduleCallback 包装层记录：
const originalSchedule = scheduleCallback;
scheduleCallback = function measured(priority, callback) {
  console.log('schedule', priority, 'deadline', performance.now() + 1000);
  return originalSchedule(priority, callback);
};
// 触发输入与 transition，比较 priority 和回调执行时间`,
      `日志显示不同优先级任务进入 Scheduler，输入任务更早获得执行机会。
失败边界：Scheduler 只负责何时调用任务，不负责 Fiber 树协调；不能把它理解成 Web Worker 并发。`,
    ),
    reactExample(
      'shouldYield 让出长 render',
      'React Source + Performance',
      `// 在 performUnitOfWork 后记录：
if (shouldYield()) {
  console.log('yield-at', workInProgress.type?.name, performance.now());
}

// 用 5000 行列表触发 transition，
// 在 Performance 中查看多个任务片段与浏览器绘制间隔`,
      `长 render 在 shouldYield 返回 true 后保留 workInProgress 并重新调度，主线程出现绘制空档。
失败边界：让出只发生在 React 工作单元边界，组件内部的大同步循环仍会一次阻塞。`,
    ),
    reactExample(
      '并发重入会重放可中断 render',
      'TSX + Browser Console',
      `function ExpensiveRows({ query }: { query: string }) {
  console.log('render-start', query, performance.now());
  const rows = Array.from({ length: 1000 }, (_, index) => query + index);
  return <ul>{rows.map(row => <li key={row}>{row}</li>)}</ul>;
}
// 使 query 快速变化并观察同一 query 的 render-start 是否出现多次`,
      `被更高优先级打断的低优先级 render 可能重新开始，日志显示同一 query 的重复计算。
失败边界：把写全局缓存或请求放在组件 render 中会在重放时重复执行，render 必须保持纯。`,
    ),
    reactExample(
      'commit 保持同步可见边界',
      'TSX + Performance',
      `function Modal({ open }: { open: boolean }) {
  return <dialog open={open}><h2>确认操作</h2><button>关闭</button></dialog>;
}
// 在 Performance 中切换 open，
// 观察 dialog 插入、属性变化和 layout 是否处于同一 commit 时间片，
// 再把一个同步 200ms 循环移出 layout effect 对比`,
      `一次 open 切换的 DOM 变化集中提交，用户不会看到半开半闭的中间状态。
失败边界：在 commit 的 layout Effect 中执行长同步任务会阻塞绘制，即使 render 可中断也无法拯救首帧。`,
    ),
  ],
  'commit 阶段与副作用': [
    reactExample(
      'commitRoot 前的 finishedWork 只是预备树',
      'React Source Debug',
      `// ReactFiberWorkLoop.js 的 commitRoot 前：
console.log('before-commit', {
  pendingLanes: root.pendingLanes,
  finishedTag: root.finishedWork?.tag,
  domBefore: document.querySelector('#root')?.textContent,
});

// commitRoot 完成后打印同样的 DOM 与 root.current，
// 对比 prepared Fiber 和已提交宿主树`,
      `commit 前 finishedWork 已准备但 DOM 文本仍是旧值，commit 后 root.current 切换并显示新内容。
失败边界：在 render 阶段直接操 DOM 会破坏这一分离，导致半提交或重复更新。`,
    ),
    reactExample(
      'Mutation 阶段执行 DOM 写入',
      'React Source Debug',
      `// ReactFiberCommitWork.js 的 commitMutationEffectsOnFiber 前后：
console.log('mutation-before', fiber.stateNode?.textContent);
commitMutationEffectsOnFiber(finishedWork, root, lanes);
console.log('mutation-after', fiber.stateNode?.textContent);

// 触发一次文本更新，记录删除、插入和属性更新的 flags`,
      `Mutation 前文本仍是旧值，Mutation 后同一节点已是新文本，Placement/Update flags 被消费。
失败边界：在 commitMutationEffects 之后仍复用旧 DOM 引用，可能读到被删除节点的 detach 状态。`,
    ),
    reactExample(
      'Layout Effect 在绘制前测量',
      'TSX + Browser Performance',
      `export function BoxMeasure() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const next = ref.current?.getBoundingClientRect().width ?? 0;
    console.log('layout-measure', next, performance.now());
    setWidth(next);
  }, []);
  return <div ref={ref}>宽度：{width}</div>;
}
// 在 Performance 中确认 layout-measure 位于 paint 前，页面没有旧宽度闪一下`,
      `布局阶段读取真实宽度并在绘制前更新，用户看不到 0 到实际宽度的闪烁。
失败边界：在 useLayoutEffect 中执行大量同步任务会延迟 paint，性能敏感测量应缩小范围。`,
    ),
    reactExample(
      'Passive Effect 延后到提交之后',
      'TSX + Browser Console',
      `export function PassiveProbe() {
  useEffect(() => {
    console.log('passive', performance.now());
  }, []);
  return <p>已提交</p>;
}
// 在 commitRoot 后记录 commit-time，
// 对比 passive 日志时间，并观察页面已经可见文本`,
      `commit 日志先出现，passive 日志稍后执行，页面在两者之间已经可以绘制。
失败边界：依赖 useEffect 同步布局会读到已提交 DOM，但无法保证浏览器尚未绘制；测量应使用 layout effect。`,
    ),
    reactExample(
      'StrictMode 暴露未清理订阅',
      'TSX + Vitest',
      `const listeners = new Set<string>();
function subscribe(name: string) {
  listeners.add(name);
  return () => listeners.delete(name);
}

export function StrictProbe() {
  useEffect(() => subscribe('order-updated'), []);
  return <span>{listeners.size}</span>;
}
// 在 StrictMode 下 render，统计 setup/cleanup 日志与 listeners.size`,
      `开发模式先 setup、cleanup、再 setup，最终 listeners.size 仍为 1 而不是 2。
失败边界：cleanup 不删除订阅时开发环境会残留两条，生产环境虽然只 setup 一次也可能在真实卸载时泄漏。`,
    ),
  ],
  'React 企业应用毕业项目与源码答辩': [
    reactExample(
      '验收契约转成可运行检查',
      'Playwright',
      `test('经理可筛选已支付订单并查看详情', async ({ page }) => {
  await page.goto('/orders?status=paid&page=2');
  await expect(page.getByRole('heading', { name: '订单列表' })).toBeVisible();
  await page.getByRole('row', { name: /ORD-7/ }).click();
  await expect(page).toHaveURL('/orders/ORD-7');
  await expect(page.getByRole('heading')).toHaveText('ORD-7');
});
// pnpm playwright test e2e/graduation.spec.ts`,
      `测试用经理账号走完 URL 筛选、分页、列表和详情，URL 与可见标题一致。
失败边界：验收只写成文档不自动化，权限、刷新或路由回退可能在答辩前未被发现。`,
    ),
    reactExample(
      '状态所有权表用代码断言',
      'TSX + TanStack Query',
      `const owner = {
  filters: 'URLSearchParams',
  orders: 'TanStack Query cache',
  selectedId: 'component state',
  session: 'server session',
} as const;

test('订单数据只有一个查询所有者', () => {
  expect(owner.orders).toBe('TanStack Query cache');
  expect(owner.filters).toBe('URLSearchParams');
});
// 在详情页禁用 local orders state，Devtools 只保留 Query 缓存`,
      `筛选从 URL 恢复，订单来自 Query，选中状态仅属于组件，刷新不会复制出第二份订单。
失败边界：Query、useState 和 Server Component 各存一份订单时，取消操作可能只更新一个视图。`,
    ),
    reactExample(
      '生产指标写入毕业门槛',
      'TypeScript + Playwright',
      `const budget = { lcp: 2500, inp: 200, jsKb: 220 };
const measured = { lcp: 2100, inp: 182, jsKb: 204 };

expect(measured.lcp).toBeLessThan(budget.lcp);
expect(measured.inp).toBeLessThan(budget.inp);
expect(measured.jsKb).toBeLessThan(budget.jsKb);
console.log('vitals-pass', measured, budget);

// 使用 production build、4x CPU、Fast 3G 和移动视口记录三次 p75`,
      `三次移动样本均低于 LCP 2.5s、INP 200ms、入口包体 220KB 的预算。
失败边界：开发模式截图或桌面无节流数据不能作为发布门槛，必须固定环境并重复采样。`,
    ),
    reactExample(
      'requestId 串起点击到 commit',
      'React Source Debug',
      `let traceId = 0;
function trace(step: string, payload: unknown) {
  console.log(JSON.stringify({ traceId, step, payload, at: performance.now() }));
}

// 点击事件进 handler 时 traceId += 1，
// 在 dispatchSetState、scheduleUpdateOnFiber、beginWork、completeWork、
// commitRoot、commitLayoutEffects 记录同一 traceId 和 lane，
// 最后与 DevTools Performance 时间线对齐`,
      `同一次点击的多条日志共享 traceId，顺序从事件处理器进入 Fiber render，最后到 layout commit。
失败边界：不同版本或两个并发点击混在一起时，无法用函数名本身证明调用属于同一用户动作。`,
    ),
    reactExample(
      '发布与回滚演练产出可审计记录',
      'PowerShell',
      `$release = git rev-parse HEAD
@{
  release = $release
  image = 'registry.example.com/web:release-42'
  migration = 'additive-only'
  smoke = 'orders-permissions-vitals'
  rollbackImage = 'registry.example.com/web:release-41'
  detectedAt = (Get-Date).ToUniversalTime().ToString('o')
} | ConvertTo-Json | Set-Content release-42.json
Get-Content release-42.json
# 制造一次失败发布，执行旧镜像连接当前数据的 rollback smoke`,
      `发布记录包含源码 commit、镜像、迁移策略、smoke 项与回滚镜像，失败演练有检测和恢复证据。
失败边界：只回滚镜像但保留不兼容迁移，旧版本启动后仍会失败；发布证据必须覆盖数据与缓存。`,
    ),
  ],
});

const r6Stage = 'React 源码：Fiber、Hooks、Scheduler 与 Commit';

export const HANDWRITTEN_REACT_R6_COURSES: readonly ProgrammingCourseSeed[] = [
  reactCourse(r6Stage, '源码仓库、版本和入口', {
    minutes: 36,
    prerequisite: '能使用 Git、pnpm 与 TypeScript，理解 React 公共包与 reconciler 内部包的基本分工。',
    goal: '能固定 React 源码 tag 与依赖版本，从 react-dom 入口定位 reconciler 工作循环，建立可在断点、日志和源码行之间互相对照的阅读基线。',
    guidedPractice: '克隆 facebook/react 并检出指定稳定 tag，记录 commit、Node 与 pnpm 版本；在 packages/react-dom、react-reconciler、scheduler 中搜索 createContainer、updateContainer 与 scheduleUpdateOnFiber，画出首次渲染调用链。',
    independentPractice: '选一个最小 React 应用和本地源码构建，给 updateContainer、ensureRootIsScheduled、performWorkOnRoot 注入条件日志；每次点击后把浏览器行为与源码文件、提交版本一起记录。',
    commonErrors: [
      '直接阅读 main 分支，却用项目里较旧的 React 版本解释行为，函数名和 Lane 结构已经变化。',
      '只读压缩后的 node_modules 或搜索引擎片段，没有确认符号所属包、导出入口和实际 commit。',
    ],
    sourceRefs: [reactSource, 'React repository versions. https://github.com/facebook/react/tags', 'React DOM entry. https://github.com/facebook/react/blob/main/packages/react-dom/src/client/ReactDOMRoot.js'],
    steps: [
      ['固定版本再追踪符号', '先执行 `git checkout <稳定 tag>` 和 `git rev-parse HEAD`，把 tag、commit、react、react-dom、scheduler 的 package.json 版本写入记录；所有文件链接都带同一 commit。失败边界是同一调用链两段来自不同分支；验证动作是从源码构建出与本地应用兼容的版本，并确认 package 版本、构建时间和源码 commit 一致，再保存依赖锁文件与构建命令。', '源码版本必须固定'],
      ['公共入口连接到内部 reconciler', '`react-dom/client` 的 createRoot 最终创建 FiberRoot 与 HostRoot Fiber，react-reconciler 负责更新调度和树协调。阅读时先找 package 入口，再沿 createContainer、updateContainer、scheduleUpdateOnFiber 进入 ReactFiberWorkLoop.js。失败边界是把 react 包的 hooks dispatcher 当成全部渲染实现；验证动作是在调用链图上为每个符号标出 package 与文件，确认没有越层臆测，并用断点验证调用方向，同时记录首次挂载和更新差异、导出入口与构建映射。', '入口决定调用方向'],
      ['建立最小实验和断点', '用未压缩的本地开发构建运行一个只有一个按钮的页面，在 `updateContainer`、`ensureRootIsScheduled`、`performUnitOfWork` 和 `commitRoot` 设置断点或条件日志；记录 root、fiber、lane、finishedWork 与本次事件的关系。失败边界是调试器停在框架内部后无法映射回页面动作；验证动作是为日志加自增标记和当前 root tag，让一次点击产生一条可读顺序链，并保留浏览器 trace。', '每个内部状态都关联一次用户动作'],
      ['区分源码事实与文章解释', '阅读实现时可以借助文章和注释，但结论要回到当前 commit 的变量赋值、分支条件和调用点；注释描述意图，运行时分支才决定本次路径。失败边界是文章说“commit 一定异步”而源码显示同步阶段直接执行；验证动作是为结论列出文件、行、输入条件和实测日志，四者缺一就不写入答辩材料。', '文章只能提供线索'],
      ['形成可复现源码基线', '记录安装命令、tag、最小应用、断点清单、正常更新和一次 transition 的日志，下一次 React 升级按同一脚本复跑。失败边界是升级后只看函数还能搜索到就认为行为没变；验证动作是比较调用顺序、Lane 值和 commit 阶段日志，列出新增、删除或改名的符号，再更新讲解并保留旧基线。', '基线让版本差异可见'],
    ],
  }),
  reactCourse(r6Stage, 'Fiber 节点和工作循环', {
    minutes: 39,
    prerequisite: '完成源码版本与入口课，能区分 React 元素、Host DOM 与 Fiber 工作树。',
    goal: '能解释 Fiber 的 child、sibling、return、alternate 与 lanes 字段，沿 performUnitOfWork、beginWork、completeUnitOfWork 说明一棵树如何完成协调。',
    guidedPractice: '在 ReactFiberWorkLoop.js 的 performUnitOfWork 与 beginWork 打条件断点，展开一个三层组件树，记录当前 fiber、child、sibling、return、alternate 和 lanes，手绘 workInProgress 树。',
    independentPractice: '给列表插入一项并跟踪协调过程，记录哪些 Fiber 复用 alternate、哪些新建、哪些删除；把同一实验在初次挂载与更新两次运行中对照，写出字段变化表。',
    commonErrors: [
      '把 Fiber 当成真实 DOM，忽略它保存工作状态、优先级、副作用与树链接。',
      '看到 child 与 sibling 就按二叉链表理解，忘记 return 指回父级以及工作树与当前树的双缓冲关系。',
    ],
    sourceRefs: ['ReactFiberWorkLoop.js. https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberWorkLoop.js', 'ReactFiber.js. https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiber.js', 'ReactFiberBeginWork.js. https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberBeginWork.js'],
    steps: [
      ['Fiber 保存工作状态与关系', '每个 Fiber 有 `tag`、`key`、`type`、`stateNode`、`return`、`child`、`sibling`、`alternate`、`memoizedProps`、`memoizedState` 与 `updateQueue`。child 指向第一个子节点，sibling 连接同级，return 指回父节点；stateNode 对宿主组件可能就是 DOM。失败边界是只看 type 与 props 解释整个更新；验证动作是在断点中读取这些字段，并把一个嵌套组件树画成可遍历链表，标记每个节点来源、复用状态、lane 和宿主节点。', 'Fiber 是工作节点而非 DOM'],
      ['双缓冲使用 alternate 复用', '当前树 root.current 与 workInProgress 树互为 alternate，协调时在新树节点上计算，完成后一次切换 root.current 完成可见更新。复用 alternate 可保留队列和状态，但每次 render 仍需重新计算需要变化的 props 与结构。失败边界是认为 alternate 表示“没有更新”；验证动作是在 beginWork 中记录 fiber.alternate 是否存在，比较首次挂载与更新时的复用比例，并检查提交后的 current 指向。', '新旧树交替提交'],
      ['beginWork 向下处理当前单元', '工作循环调用 `performUnitOfWork`，先进入 `beginWork(current, workInProgress, renderLanes)`。该函数根据 tag 和更新条件决定是否跳过子树、创建子 Fiber 或调用组件 render；返回的 child 成为下一个工作单元。失败边界是 bailout 条件满足后仍期待子组件日志执行；验证动作是构造 props 未变与变化的两个分支，记录 beginWork 返回值与是否进入子节点，并核对 lanes。', '向下创建与复用子工作'],
      ['completeWork 向上收束副作用', '没有 child 可处理时进入 `completeUnitOfWork`，执行 `completeWork` 计算宿主属性并冒泡 flags，再沿 sibling 或 return 移动。整棵树的完成不等于 DOM 已修改，真正提交要等 root 完成并进入 commitRoot。失败边界是把 completeWork 的 DOM diff 当成已写入页面；验证动作是在 completeWork 与 commitMutationEffects 分别读取 DOM，确认前者仍修改 prepare 数据，页面变化发生在后者，并记录 flags 冒泡、宿主节点和提交次数。', '协调完成仍是预备工作'],
      ['Lane 决定本次处理范围', 'Fiber 的 `lanes` 与 `childLanes` 标记自身和子树待处理优先级；工作循环只处理与 renderLanes 相交的更新。一次点击产生的 lane 会沿父链标记，后续调度据此选择哪棵树继续工作。失败边界是只删掉局部更新却忘记 childLanes 导致父路径不被访问；验证动作是构造高、低两个优先级更新，记录每次 renderLanes 与进入 beginWork 的路径，解释跳过原因。', '优先级沿树传播'],
    ],
  }),
  reactCourse(r6Stage, 'Hooks 链表与更新队列', {
    minutes: 42,
    prerequisite: '完成 Fiber 工作循环课，理解 useState 快照，并能阅读 reducer、queue、lane 等基础结构。',
    goal: '能沿 ReactFiberHooks.js 解释 Hook 链表挂载与复用、update 环形队列、dispatchSetState 的 lane 标记和 render 阶段计算新 memoizedState。',
    guidedPractice: '在 renderWithHooks、mountWorkInProgressHook、updateWorkInProgressHook、dispatchSetState 与 processUpdateQueue 打条件断点，记录两个 useState 的 hook 节点、queue.pending 和连续点击后的新状态。',
    independentPractice: '为函数组件注入四次 setCount，分别混合直接值和 updater，跟踪每个 update 的 lane、action 与 eagerState，画出队列执行后 memoizedState 的变化。',
    commonErrors: [
      '把 Hook 状态理解成按变量名查找的字典，忽略调用顺序和 fiber.memoizedState 链表。',
      '认为 dispatch 立即改写 hook.memoizedState，忽略更新先进入 queue 并标记 Fiber lane。',
    ],
    sourceRefs: ['ReactFiberHooks.js. https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberHooks.js', 'React updateQueue. https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberHooks.js', 'React useState. https://react.dev/reference/react/useState'],
    steps: [
      ['首次 render 建立 Hook 链表', '函数组件执行时 renderWithHooks 设置当前 Fiber 与 dispatcher，第一次 useState 调用由 mountWorkInProgressHook 创建 hook 节点，挂到 fiber.memoizedState 链表尾部；后续 Hook 通过 next 链接。下一次 render 使用 update dispatcher 按相同顺序取节点。失败边界是条件 Hook 改变链表顺序，导致状态串位；验证动作是打印每次 Hook 的 memoizedState 与 next 地址，对照组件源码调用顺序，并记录链表长度。', 'Hook 身份来自链表位置'],
      ['Hook 节点保存状态与队列', '每个 hook 包含 `memoizedState`、`baseState`、`baseQueue` 和 `queue`，queue 中保存待处理 update。useState 返回的 state 来自当前 hook.memoizedState 快照，dispatch 是绑定 fiber 与 queue 的函数。失败边界是把多个组件实例的 hook 链表混为一谈；验证动作是同时挂载两个相同组件，比较各自 fiber.memoizedState 地址与更新行为，并分别触发状态变化，确认 queue 不会串实例、dispatcher 不会串函数，next 链也不会互相覆盖。', '实例状态在各自 Fiber 中'],
      ['update 进入环形待处理队列', 'dispatchSetState 创建 update，写入 action、lane 和 eagerState，并通过 enqueueConcurrentHookUpdate 把 update 插入 queue.pending 环形链表，再 scheduleUpdateOnFiber。render 时 processUpdateQueue 从 baseQueue 依次应用 action 得到新 memoizedState。失败边界是以为连续 dispatch 每次马上调用组件；验证动作是在每次 dispatch 前后读取 queue.pending 与 memoizedState，确认前者变化、后者要等下一次 render 才更新，并记录每个 update 的 lane、action、环形尾节点、执行结果、丢弃原因、状态结果和下一次调度入口。', '队列累积，渲染计算'],
      ['eagerState 只优化可立即判断的更新', '若当前 Fiber 没有待处理更新且新状态与当前状态相同，dispatch 可直接复用 eagerState，避免安排 render；但如果已有 pending lane，必须把 update 入队并等待合并。失败边界是把 eagerState 当成总是领先于 queue 的值；验证动作是连续调用相同值与不同值，记录是否进入 schedule 与最终提交次数，并比较 eagerState 和计算结果，再制造 pending 更新确认优化让位。', '优化不能越过更新顺序'],
      ['用稳定实验验证 Hook 源码结论', '为组件准备两条 Hook、三次混合更新和一次低优先级 transition，记录 Hook 链表、update lane、renderLanes 与最终 state。失败边界是源码断点和应用日志时间顺序混乱；验证动作是给每次用户动作生成递增 requestId，在关键函数同步记录它，最后按 requestId 还原从事件到 Hook 状态的完整时间线，并重复三次确认每个 update 的执行顺序。', '一条时间线串起事件与状态'],
    ],
  }),
  reactCourse(r6Stage, 'Scheduler 优先级和可中断渲染', {
    minutes: 45,
    prerequisite: '完成 Fiber 与 Hooks 源码课，理解 Lane、render 与 commit 分离，并能阅读浏览器任务与 MessageChannel。',
    goal: '能解释 Lane 到 Scheduler PriorityLevel 的映射、performConcurrentWorkOnRoot 的让出与重调度，以及 commit 阶段为何不能像 render 一样中断。',
    guidedPractice: '在 scheduleCallback、workLoopConcurrent、shouldYield、performConcurrentWorkOnRoot 打日志，制造一个长列表 transition 与紧急输入，记录任务开始、让出、重入和最终 submit 顺序。',
    independentPractice: '用 React Profiler 与 Scheduler 日志比较同步更新和 transition，列出每次 renderLanes、浏览器帧边界与 commit 位置，解释为什么输入能在长列表完成前先出现。',
    commonErrors: [
      '把 Scheduler 当成 Web Worker，认为 React 组件 render 在另一个线程并行执行。',
      '认为可中断渲染会丢弃已经提交的 DOM 或允许 commit 中途暂停，混淆两个阶段的一致性要求。',
    ],
    sourceRefs: ['React Scheduler. https://github.com/facebook/react/blob/main/packages/scheduler/src/forks/Scheduler.js', 'ReactFiberWorkLoop.js. https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberWorkLoop.js', 'React lanes. https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberLane.js'],
    steps: [
      ['Lane 表达 React 更新优先级', 'ReactFiberLane 用位掩码表示 SyncLane、InputContinuousLane、DefaultLane、TransitionLane 等，root 上保存 pendingLanes 与 suspendedLanes。更新入队后 ensureRootIsScheduled 根据最高相关优先级安排任务。失败边界是多个 lane 被错误合并为同一组后高优先级更新被拖慢；验证动作是记录每个 setState 的 lane 与 renderLanes，确认紧急输入与 transition 属于不同批次，并观察优先级合并、过期时间和 root 待处理掩码。', 'Lane 是内部优先级语言'],
      ['Scheduler 将 lane 映射为任务优先级', 'React 调度器提供 Immediate、UserBlocking、Normal、Low、Idle 等优先级，内部根据 lane 计算 expiration 并调用 scheduleCallback。核心逻辑在 ReactFiberWorkLoop.js 与 ReactFiberLane.js，Scheduler 负责按到期时间排队和执行，不负责组件树协调本身。失败边界是把 window.setTimeout 顺序当成全部调度；验证动作是记录 scheduleCallback 的 priority 与 expiration，对照浏览器任务时间线，并核对 lane、任务回调时间、实际执行顺序、取消结果和下一次重调度。', '调度器只管何时执行工作'],
      ['时间切片让出主线程', 'performConcurrentWorkOnRoot 调用 renderRootConcurrent，workLoopConcurrent 在每个工作单元后检查 shouldYield；若当前时间片耗尽，把 workInProgress 保留在 root 并返回 continuation，Scheduler 随后重新调度。失败边界是让出发生在不可恢复的局部更新中，可能产生撕裂；验证动作是构造长树并观察 shouldYield 时的 fiber、lane 和下次进入的恢复位置，同时记录浏览器帧时间、让出次数与重新调度间隔。', '中断保存工作进度'],
      ['重新进入会重放部分 render', '并发 render 可能被更高优先级更新打断，低优先级工作重做时组件函数与 useMemo 计算可再次执行，因此 render 必须纯。新更新会合并到 root 的 lane，finishedWork 需要重新确认是否仍可提交。失败边界是 render 中写全局缓存，让出后重复写入；验证动作是给昂贵计算加 requestId 日志，观察同一次 transition 的重入次数并检查外部数据未被重复修改。', '可中断意味着 render 可重做'],
      ['Commit 保持同步一致', '低优先级 render 完成后，root 若仍有更高优先级更新，可能先处理高优先级再决定提交；真正进入 commitRoot 后会同步执行 mutation、layout 与 passive 调度，避免用户看到半棵树。失败边界是期待巨型 layout Effect 自动切片而页面卡顿；验证动作是把耗时布局工作移出 commit，缩小 DOM 更新范围，并用 Performance 确认单个 commit 时长下降。', '提交是不可分割的可见边界'],
    ],
  }),
  reactCourse(r6Stage, 'commit 阶段与副作用', {
    minutes: 48,
    prerequisite: '能阅读 Fiber 工作循环，理解 DOM mutation、layout 测量与 passive Effect 的执行时机。',
    goal: '能沿 commitRoot 解释 before mutation、mutation、layout 与 passive 子阶段，区分 cleanup、DOM 写入、useLayoutEffect 和 useEffect，并定位重复执行或读取旧 DOM 的问题。',
    guidedPractice: '在 commitBeforeMutationEffects、commitMutationEffects、commitLayoutEffects、flushPassiveEffects 打条件断点，组件同时使用 useLayoutEffect 与 useEffect，记录移除监听、修改 DOM、测量和被动 Effect 的顺序。',
    independentPractice: '做一个列表项删除实验，分别记录 useLayoutEffect cleanup 时的 DOM、mutation 后 DOM 与 useEffect 中的 DOM；用 StrictMode 观察开发环境 effects 重跑，并说明哪些重复是检查、哪些是 cleanup 缺失。',
    commonErrors: [
      '在 mutation 前读取被删除节点的布局，或 useEffect 读取尚未更新的尺寸却归因于浏览器错误。',
      'useLayoutEffect 中执行昂贵同步计算，阻塞绘制导致交互卡顿，却误以为 Effect 都在后台运行。',
    ],
    sourceRefs: ['ReactFiberCommitWork.js. https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberCommitWork.js', 'ReactFiberWorkLoop.js. https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberWorkLoop.js', 'React useEffect. https://react.dev/reference/react/useEffect'],
    steps: [
      ['commitRoot 先准备副作用集合', '完成 render 后 root 持有 finishedWork，commit 阶段遍历 finishedWork 并消费 subtreeFlags 上记录的内容，按阶段处理 DOM 变化和 lifecycle。提交前还会处理根级快照与 passive 调度。失败边界是把 flags 当成执行结果，忘记 commit 才真正应用；验证动作是在 commitRoot 前后读取 DOM 与 subtreeFlags，确认哪些信息只是待处理标记，并记录阶段顺序、DOM 变化和 passive 调度。', '副作用在 render 标记、commit 执行'],
      ['Mutation 阶段写入宿主树', 'commitMutationEffects 处理 Placement、Update、Deletion 等，删除节点会先执行 layout effect cleanup，再执行 DOM 移除与 ref detach；插入和属性更新也在该阶段推进。用户尚未被浏览器绘制前，多个相关操作尽量作为一次提交完成。失败边界是在 DOM 已改后仍用旧布局做非受控测量；验证动作是在 mutation 断点前后记录节点父级、属性和布局值。', '真实 DOM 在 mutation 变化'],
      ['Layout 阶段同步测量与通知', 'DOM 更新完成后，commitLayoutEffects 执行 useLayoutEffect 的 create、ref attach 与 class layout lifecycle，仍处于浏览器绘制前，适合读取布局后同步调整。大量同步工作会阻塞首帧。失败边界是 layout Effect 中 setState 引发额外同步 render；验证动作是记录 commit 与 paint 时间，若必须调整则缩小更新范围，否则迁移为 passive Effect，并比较首帧耗时、额外提交次数、布局抖动和用户可见闪烁。', '布局 Effect 在绘制前'],
      ['Passive Effect 在提交后调度', 'useEffect 的 create 与 cleanup 不是 render 函数的一部分，而是 commit 后由 Scheduler 以 Passive 优先级安排 flushPassiveEffects；同一棵树的多项 passive effects 按顺序处理。它不会阻塞 paint，但可能稍后运行。失败边界是依赖页面刚完成点击就对 Effect 时序作假设；验证动作是记录 commit、paint 与 flushPassiveEffects 时间，确认设计不依赖未声明的顺序，并测试慢帧、突发交互和 cleanup 顺序。', '被动 Effect 不阻塞提交'],
      ['StrictMode 放大了生命周期错误', '开发模式可能对部分组件执行 setup、cleanup、setup 检查，用于发现未清理订阅或不可幂等副作用；生产不会因此自动重复。失败边界是把可见数据累计两次归咎 React，而 cleanup 根本没移除订阅；验证动作是检查 subscribe/unsubscribe 与 Effect 日志，确保任一次 setup 都有对应清理，第二次 setup 从干净状态开始，再对比生产构建。', '重复检查依赖正确清理'],
    ],
  }),
  reactCourse(r6Stage, 'React 企业应用毕业项目与源码答辩', {
    minutes: 51,
    prerequisite: '完成本课程前五个阶段，能独立构建 React/Next 功能，并使用测试、性能、可观测性和源码断点说明一次更新。',
    goal: '交付可运行、可测试、可观测、可回滚的 React/Next 企业模块，并用固定源码调用链解释一个真实交互从事件到 Fiber commit 的完整过程。',
    guidedPractice: '选择一个带权限、分页、查询缓存和 RSC 首屏的订单模块，完成规格、实现、RTL/Playwright/axe、Vitals 和 RUM；选“修改筛选”交互，从 URL 变化追踪到 Query、Fiber、Scheduler 与 commit。',
    independentPractice: '独立交付毕业模块，包含一次失败发布与回滚、一次慢请求、一个低权限越权尝试、一个 hydration 错误修复和一次源码升级对照；答辩材料必须把页面行为、测试证据、日志与源码 commit 相互对应。',
    commonErrors: [
      '只展示功能正常路径，无法说明权限、缓存、错误、性能和回滚证据。',
      '源码答辩只背函数名，不能把实际用户动作、lane、render 与 commit 日志对应到固定版本。',
    ],
    sourceRefs: [reactSource, nextDocs, webVitalsDocs],
    steps: [
      ['冻结业务范围与验收契约', '毕业模块选择一个真实但可控的业务闭环，例如订单列表加详情，明确角色、权限、分页、筛选、错误和回滚要求；每条验收映射到页面、API、测试或运行手册。失败边界是功能范围不断扩张却没有可复现数据；验证动作是让另一位学习者按 README 从空环境启动，并只用验收单判断通过或失败。', '范围可小但证据必须完整'],
      ['交付状态与数据边界', '列表筛选来自 URL，服务端数据由 TanStack Query 管理，RSC 首屏读取公共字典，客户端只负责交互岛；秘密和对象级授权留在服务端。为越权 ID、过期会话和缓存切换写自动化测试。失败边界是同一订单在 Query、useState 和 Server Component 各存一份导致不一致；验证动作是检查状态来源表、请求日志与双账号流程，确认每个值只有一个所有者。', '数据所有权要能画清'],
      ['建立性能与可靠性证据', '用 production build 记录移动 p75 LCP、INP、入口包体、慢接口和错误率；把阈值直接写入 CI 配置和运行手册，不把一次截图当作性能结论。失败边界是只在开发机截图一次 Lighthouse；验证动作是固定设备、网络和种子数据，重复记录分位结果，慢查询和取消行为附 Network 与 trace，并注明版本、日期和失败样本。', '性能数据要可重复'],
      ['从点击追到 commit', '选定固定 React tag，在事件处理器、dispatchSetState、scheduleUpdateOnFiber、ensureRootIsScheduled、beginWork、completeWork、commitRoot 与 commitLayoutEffects 记录 requestId；说明紧急输入与 transition 的 lane 差异，以及本次为什么在特定阶段提交。失败边界是源码行号来自不同 commit 或日志无法对应页面动作；验证动作是把提交版本、符号文件、断点和用户时间线放进同一份答辩材料，现场按顺序复现，再解释中断重入。', '源码解释必须落到真实交互'],
      ['发布、回滚与复盘闭环', '用不可变 digest 发布测试环境，执行权限、缓存、hydration、Vitals 和关键用户旅程冒烟；制造一次失败发布并回滚代码、配置和缓存，记录检测与恢复时间。复盘区分需求、实现、测试、部署和源码认知缺口。失败边界是回滚只覆盖容器而数据库或缓存仍不兼容；验证动作是让上一稳定版本连接当前数据执行 smoke，并把结果、负责人和后续行动项写入发布记录。', '能回滚并解释原因才算毕业'],
    ],
  }),
];
