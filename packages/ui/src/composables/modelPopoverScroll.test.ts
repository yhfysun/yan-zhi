/**
 * 模型下拉「打开即定位到当前选中项」—— 守门测试（2026-09-27，用户诉求）。
 *
 * 用户原话：「模型选择下拉点击不会跳转到选中的那个模型的位置啊。。。」
 * 根因：打开下拉一律从列表顶部开始（平台多、模型几百个时，当前选中项常在视口外）。
 *
 * ★ 这条链路有四个"静默失效"点，每一个都表现为"打开后停在顶部"，不报错：
 *   ① 没在弹出后触发定位（`watch` 里缺 nextTick/下一帧 → 查 DOM 太早，容器还没布局）；
 *   ② 定位滚错了对象（对 active 项用 `scrollIntoView` → 连带滚动页面/消息区）；
 *   ③ 移动端那个 popover 忘了关（`pickModel` 只关桌面那个）；
 *   ④ 两个模型 popover 共用无区分的选择器（验证/样式互相串，实测踩到）。
 *
 * 判据一律"读源码剥注释后再断言" —— 注释里出现同一个词会让断言假红/假绿（踩过多次）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UI_SRC = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(UI_SRC, p), 'utf8');

/** 剥注释：只剥整行注释与块注释，保留行尾注释所在行的代码（坑 60j） */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, '')
   .replace(/<!--[\s\S]*?-->/g, ' ');

const INPUT = read('components/chat/ChatInputArea.vue');
const CODE = strip(INPUT);
const CSS = strip(read('views/chat.css'));

/** 取函数体：从 `function X(` 起到下一个顶层 `}` 行（按缩进为 0 的 `}` 收口） */
function bodyOf(src: string, startAnchor: string): string {
  const start = src.indexOf(startAnchor);
  expect(start, `★ 找不到锚点: ${startAnchor}`).toBeGreaterThan(-1);
  const end = src.indexOf('\n}', start);
  return src.slice(start, end > 0 ? end : undefined);
}

describe('① 打开下拉时触发定位', () => {
  it('watch 里收尾时**必须 return**（否则收起也会跑定位，白算一次）', () => {
    const w = bodyOf(CODE, 'watch([modelPopOpen, mobileModelPopOpen]');
    expect(w).toMatch(/if\s*\(!desktopOpen\s*&&\s*!mobileOpen\)\s*\{[^}]*return;/);
  });

  it('★ 打开后必须等渲染完成再定位（nextTick + 至少一帧 rAF）', () => {
    const w = bodyOf(CODE, 'watch([modelPopOpen, mobileModelPopOpen]');
    expect(w).toMatch(/nextTick\(\)/);
    // popover 内容是 Teleport 到 body 的、打开瞬间才挂载：只 nextTick 读 offsetTop 会拿到未布局的值
    expect(w, '★ 缺少 requestAnimationFrame（布局未稳定就读取）').toMatch(/requestAnimationFrame/);
  });

  it('★ 桌面端与移动端各自定位（漏一个 → 该端停在顶部）', () => {
    const w = bodyOf(CODE, 'watch([modelPopOpen, mobileModelPopOpen]');
    expect(w).toMatch(/if\s*\(desktopOpen\)\s*scrollActiveModelIntoView\(false\)/);
    expect(w).toMatch(/if\s*\(mobileOpen\)\s*scrollActiveModelIntoView\(true\)/);
  });
});

describe('② 定位滚的是「内层容器」而不是 scrollIntoView', () => {
  const fn = bodyOf(CODE, 'function scrollActiveModelIntoView');

  it('取的是 .pop-model-scroll 里的 active 项', () => {
    expect(fn).toMatch(/querySelector<HTMLElement>\('\.pop-select-model\.active'\)/);
  });

  it('★★ 直接设容器 scrollTop —— 绝不用 scrollIntoView', () => {
    expect(fn, '★ 用了 scrollIntoView 会连带滚动页面/消息区').not.toMatch(/scrollIntoView/);
    expect(fn).toMatch(/scrollTop\s*=/);
  });

  it('★ 算的是"居中位置"并做下界钳制（否则首项会算出负数）', () => {
    expect(fn).toMatch(/offsetTop\s*-\s*\(box\.clientHeight\s*-\s*active\.offsetHeight\)\s*\/\s*2/);
    expect(fn).toMatch(/Math\.max\(0,\s*target\)/);
  });

  it('命中不到 active 时不报错（可能被折叠在分组里，停在顶部是可接受降级）', () => {
    expect(fn).toMatch(/if\s*\(!active\)\s*return;/);
  });

  it('取不到容器时不报错（popover 可能已被卸载）', () => {
    expect(fn).toMatch(/if\s*\(!box\)\s*return;/);
  });
});

describe('③ 两个滚动容器各自有 ref（定位要按端取对容器）', () => {
  it('模板里两个 .pop-model-scroll 分别绑定 modelScrollEl / mobileModelScrollEl', () => {
    expect(CODE).toMatch(/class="pop-model-scroll"\s+ref="modelScrollEl"/);
    expect(CODE).toMatch(/class="pop-model-scroll"\s+ref="mobileModelScrollEl"/);
  });

  it('两个 ref 都有声明', () => {
    expect(CODE).toMatch(/const modelScrollEl = ref<HTMLElement \| null>\(null\)/);
    expect(CODE).toMatch(/const mobileModelScrollEl = ref<HTMLElement \| null>\(null\)/);
  });
});

describe('④ 选中模型后必须**两个** popover 都关（修掉的真实缺陷）', () => {
  const fn = bodyOf(CODE, 'function pickModel');

  it('★ 桌面端与移动端开关都要置 false', () => {
    expect(fn).toMatch(/modelPopOpen\.value = false/);
    expect(fn, '★ 漏关移动端 → 触屏上点完模型下拉一直挂着挡住输入框')
      .toMatch(/mobileModelPopOpen\.value = false/);
  });

  it('仍然切模型 + 收掉上下文窗口浮层', () => {
    expect(fn).toMatch(/onModelChange\(modelId\)/);
    expect(fn).toMatch(/closeCtxPanelNow\(\)/);
  });
});

describe('⑤ 两个模型 popover 必须可区分（popper-class 不同）', () => {
  it('★ 各自有独立 popper-class（共用会让样式/探针互相串，坑 8）', () => {
    expect(CODE).toMatch(/v-model:visible="modelPopOpen"[\s\S]{0,320}?popper-class="model-select-popper"/);
    expect(CODE).toMatch(/v-model:visible="mobileModelPopOpen"[\s\S]{0,320}?popper-class="model-select-popper-mobile"/);
  });

  it('两者仍保持 v-if 互斥（同一时刻只有一个模型入口在 DOM 里）', () => {
    expect(CODE).toMatch(/v-if="!isMobileShell"[\s\S]{0,80}?v-model:visible="modelPopOpen"/);
    expect(CODE).toMatch(/v-model:visible="mobileModelPopOpen"/);
  });
});

describe('⑥ 过渡为纯透明度（有位移/缩放会与定位抖动打架）', () => {
  it('桌面模型 popover 用 pop-select-fade', () => {
    expect(CODE).toMatch(/transition="pop-select-fade"/);
  });

  it('★ pop-select-fade 只动 opacity，不动 transform', () => {
    const i = CSS.indexOf('.pop-select-fade-enter-active');
    expect(i, '★ chat.css 里没有 pop-select-fade 定义（将回落到 Element 默认缩放过渡）').toBeGreaterThan(-1);
    const block = CSS.slice(i, CSS.indexOf('}', i) + 1);
    expect(block).toMatch(/transition:\s*opacity/);
    expect(block, '★ 含 transform 会与"打开即定位"的滚动打架').not.toMatch(/transform/);
  });
});