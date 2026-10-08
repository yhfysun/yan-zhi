/**
 * 剪辑工作台布局与草稿态会话的守门测试。
 *
 * 为什么用「读源码做结构断言」而不是挂载渲染：
 *   这两类问题是**模板/CSS 写法的静态错误**（flex 值写错、媒体查询漏断点、
 *   动词调用缺失），挂载要拖 router/pinia/chat store 整条链，成本远高于收益。
 *   已验证过的行为面（拖放建会话、真渲染时间轴）在 tmp_verify_clip.cjs 的 CDP 真跑里。
 *
 * ★ 为什么必须钉住这几条（都是本轮真实踩到的缺陷）：
 *   ① 根节点写 height:100% → 上层 .main-content 是 flex 列容器，拿不到父高，
 *      整页缩成内容高度挤在上半屏（用户截图一眼看出"页面设计不行"）；
 *   ② 监视器定高 + 时间轴 flex:1 → 监视器被挤成窄条、时间轴下方大片空白（方向反了）；
 *   ③ stageStyle 给舞台加 maxWidth → 竖屏工程把舞台宽度塌成 146px；
 *   ④ 草稿态（currentConvId 为空）直接改工程 → 没有 id 可写，刷新即丢；
 *      且 createConversation **不会**切当前会话，必须再调 selectConv。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(here, '../views/ClipWorkbench.vue');
const SRC = readFileSync(FILE, 'utf8');

/** 剥注释（只剥整行与块注释，保留行尾注释所在行的代码 —— 见 skill 坑 60j）。 */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*<!--[\s\S]*?-->\s*$/gm, '').replace(/^[ \t]*\/\/.*$/gm, '');
const CODE = strip(SRC);

/**
 * ★ 只解析 `<style scoped>` 块内部。
 *   直接在整文件上跑「选择器比较」会失败：第一个规则的捕获串里混着
 *   `<style scoped>` 之前的模板/脚本残留（`...</script> <style scoped> .clip-page`），
 *   trim 后永不等于 `.clip-page` —— 这不是源码问题，是解析范围没界定（实测踩到）。
 */
function styleBlockOf(src: string, scoped = true): string {
  const open = scoped ? '<style scoped>' : '<style>';
  const i = src.indexOf(open);
  if (i < 0) return '';
  const j = src.indexOf('</style>', i);
  return src.slice(i + open.length, j < 0 ? undefined : j);
}
const CSS = strip(styleBlockOf(SRC));

/** 精确取某个选择器的声明块（按 `}` 截断单块，不用 [^}]* 跨块 —— 见 skill 坑 37）。 */
function declBlockOf(css: string, selector: string): string | null {
  // 选择器列表按逗号切开逐个精确比较，避免 `.a, .b {...}` 被 `.a` 命中的假绿
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const sels = m[1].split(',').map((s) => s.trim());
    if (sels.includes(selector)) return m[2];
  }
  return null;
}

describe('ClipWorkbench · 布局（撑满 + 剪辑软件比例）', () => {
  it('★★ 根节点必须 flex:1 而非 height:100%（否则整页缩成内容高度）', () => {
    const block = declBlockOf(CSS, '.clip-page');
    expect(block).toBeTruthy();
    expect(block).toMatch(/flex:\s*1\b/);
    expect(block).not.toMatch(/height:\s*100%/);
  });

  it('★ 监视器占剩余高度、时间轴按内容定高（方向不能反）', () => {
    const monitor = declBlockOf(CSS, '.cp-monitor');
    const timeline = declBlockOf(CSS, '.cp-timeline');
    expect(monitor).toMatch(/flex:\s*1\b/);
    expect(timeline).toMatch(/flex:\s*0\s+0\s+auto/);
  });

  it('★ 比例只约束画面，不约束舞台（否则竖屏工程舞台宽度塌陷）', () => {
    // 模板里舞台不得绑 :style（比例要落在 video 上）
    const monitorTag = CODE.match(/<div class="cp-monitor-stage"[^>]*>/);
    expect(monitorTag).toBeTruthy();
    expect(monitorTag![0]).not.toContain(':style');
    // stageStyle 里不得出现 maxWidth
    const fn = CODE.slice(CODE.indexOf('const stageStyle'), CODE.indexOf('const stageStyle') + 400);
    expect(fn).toContain('aspectRatio');
    expect(fn).not.toMatch(/maxWidth/);
  });

  it('三栏宽度与纵向收缩：均声明 min-height:0（漏一个滚动就会跑到最外层）', () => {
    for (const sel of ['.clip-page', '.cp-body', '.cp-left', '.cp-center', '.cp-right']) {
      const b = declBlockOf(CSS, sel);
      expect(b, sel).toBeTruthy();
      expect(b, sel).toMatch(/min-height:\s*0/);
    }
  });

  it('窄屏断点齐备且素材栏不直接消失（1199 收窄 / 900 隐藏 / 640 收右栏）', () => {
    expect(CSS).toMatch(/@media \(max-width: 1199px\)/);
    expect(CSS).toMatch(/@media \(max-width: 900px\)/);
    expect(CSS).toMatch(/@media \(max-width: 640px\)/);
    expect(CSS).toMatch(/\.cp-top \{ flex-wrap: wrap; \}/);
  });

  it('窄栏文字不被压成竖排：关键文本声明 nowrap / 空态允许自然断行', () => {
    expect(CSS).toMatch(/\.cp-media-name[^{]*\{[^}]*white-space:\s*nowrap/);
    expect(CSS).toMatch(/\.cp-badge[^{]*\{[^}]*white-space:\s*nowrap/);
    expect(CSS).toMatch(/\.cp-meta[^{]*\{[^}]*white-space:\s*nowrap/);
  });
});

describe('ClipWorkbench · 草稿态会话（工程可落盘）', () => {
  it('★★ 加素材前必须 ensureConversation（草稿态否则无处落盘，刷新即丢）', () => {
    for (const fn of ['async function appendClip', 'async function setBgm', 'async function render']) {
      const start = CODE.indexOf(fn);
      expect(start, fn).toBeGreaterThan(-1);
      const body = CODE.slice(start, CODE.indexOf('\n}', start));
      expect(body, fn).toContain('ensureConversation()');
    }
  });

  it('★★ ensureConversation 必须 createConversation + selectConv 两步（只建不切 = currentConvId 仍为空）', () => {
    const start = CODE.indexOf('async function ensureConversation');
    expect(start).toBeGreaterThan(-1);
    const body = CODE.slice(start, CODE.indexOf('\n}', start));
    expect(body).toContain('createConversation');
    expect(body).toContain('selectConv');
    // selectConv 必须在 createConversation 之后
    expect(body.indexOf('selectConv')).toBeGreaterThan(body.indexOf('createConversation'));
  });

  it('applyClipPatch / applyTextPatch 也走 save()，草稿态不落盘（判定在 persistProject）', () => {
    // ★ 断言目标要跟着重构走：save 现在只负责"快照+入栈"，草稿态判定搬到了 persistProject
    //   （重构后仍断言旧位置 = 假红，见项目铁律"锚点必须跟实现同步"）
    const i = CODE.indexOf('async function persistProject');
    expect(i).toBeGreaterThan(-1);
    const body = CODE.slice(i, i + 600);
    expect(body).toContain('if (!convId.value) return false');
  });
});

describe('ClipWorkbench · 手动剪辑闭环（双驱动：UI 与对话都得能用）', () => {
  it('★★ 字幕必须能在 UI 里新增（此前只有删除 → 手动剪辑缺半个功能）', () => {
    expect(CODE).toContain('addTextAtPlayhead');
    // 工具条里要有入口按钮（不能只是定义了函数没人调 —— 死代码）
    expect(CODE).toMatch(/@click="addTextAtPlayhead"/);
  });

  it('★ 新增字幕要夹在成片时长内（越过片尾会被渲染静默截断，不报错）', () => {
    const i = CODE.indexOf('async function addTextAtPlayhead');
    expect(i).toBeGreaterThan(-1);
    const body = CODE.slice(i, i + 900);
    expect(body).toContain('estTotal');
    expect(body).toContain('Math.min');
    expect(body).toContain('无法在此添加字幕');
  });

  it('★★ splitAtPlayhead 必须先取片段序号（漏了这行会引用未定义变量 → 运行期崩）', () => {
    const i = CODE.indexOf('async function splitAtPlayhead');
    const body = CODE.slice(i, i + 300);
    expect(body).toContain('const i = selectedClipIndex.value');
    // 且 i 必须在被使用之前声明
    expect(body.indexOf('const i =')).toBeLessThan(body.indexOf('if (i < 0'));
  });

  it('手动操作前都要 ensureConversation（草稿态落盘）', () => {
    const i = CODE.indexOf('async function addTextAtPlayhead');
    expect(CODE.slice(i, i + 300)).toContain('ensureConversation()');
  });
});

describe('ClipWorkbench · 素材导入（剪辑第一步必须能走通）', () => {
  it('★★ 必须有「导入素材」入口（空态文案承诺了上传，就必须真有入口）', () => {
    expect(CODE).toContain('importMedia');
    expect(CODE).toMatch(/@click="importMedia"/);
    // 文案不得再提不存在的「+」按钮（用户截图直接指出这个误导）
    expect(CODE).not.toContain('用「+」上传');
  });

  it('★ 导入走系统文件选择器；Web 端回落字节上传（不让按钮变死按钮）', () => {
    const i = CODE.indexOf('async function importMedia');
    const body = CODE.slice(i, i + 2000);
    expect(body).toContain('showOpenFiles');
    expect(body).toContain('pickViaInput');           // Web 端兜底，不是"仅桌面端可用"就完事
    // 登记到会话（引用式素材：只登记路径，不复制字节 —— 渲染读的是绝对路径）
    expect(body).toContain('/files');
    expect(body).toContain("category: 'upload'");
  });

  it('★★ 拖入必须用 electronAPI.getPathForFile（Electron 32+ 已移除 File.path）', () => {
    const i = CODE.indexOf('async function onDropMedia');
    const body = CODE.slice(i, i + 1600);
    expect(body).toContain('getPathForFile');
    // 不得只依赖 File.path（在 Electron 33 上恒为 undefined → 拖入静默失败）
    expect(body).toMatch(/getPath\s*\?\s*getPath\(f\)/);
  });

  it('★ Web 端字节上传走 /files/upload（base64），分块避免大文件爆栈', () => {
    const i = CODE.indexOf('async function uploadFileBytes');
    const body = CODE.slice(i, i + 900);
    expect(body).toContain('/files/upload');
    expect(body).toContain('CHUNK');   // 一次性 btoa 大文件会爆栈
  });

  it('★ 素材栏支持直接拖入文件（同一条登记链路）', () => {
    expect(CODE).toContain('onDropMedia');
    expect(CODE).toMatch(/@drop="onDropMedia"/);
  });

  it('★ 编辑视图也能看到/更换项目目录（不能只在项目列表里）', () => {
    expect(CODE).toContain('cp-dir-tag');
    expect(CODE).toContain('projectDirTitle');
  });
});

describe('ClipWorkbench · 项目管理（剪映式草稿箱）', () => {
  it('★★ 进模式默认是项目列表视图，不是空白时间轴', () => {
    const onMounted = CODE.slice(CODE.indexOf('onMounted(async'), CODE.indexOf('</script>'));
    expect(onMounted).toContain('loadProjects');
    // 默认视图必须是 projects
    expect(CODE).toMatch(/const view = ref<'projects' \| 'editor'>\('projects'\)/);
  });

  it('★★ 规格只能在建项目时定：侧栏不得再有可改规格的选择器', () => {
    // 侧栏工程设置块必须是只读展示（cp-prop），不能再出现可改规格的绑定。
    // ★ 切片边界要用**唯一锚点**：'删除项目' 在项目卡片上先出现（title 文本），
    //   拿它当右边界会切到空串（实测踩到）。
    const specBlock = CODE.slice(CODE.indexOf('工程设置'), CODE.indexOf('背景音乐'));
    expect(specBlock).toContain('新建');
    expect(specBlock).not.toContain('v-model="outSize"');
    expect(specBlock).not.toContain('v-model.number="outFps"');
    // 建项目对话框里是规格的唯一写入点
    const npStart = CODE.indexOf('新建剪辑项目');
    const npBlock = CODE.slice(npStart, npStart + 2000);
    expect(npBlock).toContain('SPEC_PRESETS');
  });

  it('★ 新建项目必须 createConversation + selectConv + 落工程三步（缺一就会存不上）', () => {
    const start = CODE.indexOf('async function createProject');
    const body = CODE.slice(start, CODE.indexOf('\n}', start));
    expect(body).toContain('createConversation');
    expect(body).toContain('selectConv');
    expect(body).toContain("api.put('/clip/project'");
  });

  it('项目列表走 /clip/projects 一次拉全（不逐会话 N+1）', () => {
    const start = CODE.indexOf('async function loadProjects');
    const body = CODE.slice(start, CODE.indexOf('\n}', start));
    expect(body).toContain("api.get<{ projects: ProjectListItem[] }>('/clip/projects')");
  });

  it('删除项目明确只删工程与会话（提示不删素材源文件）', () => {
    expect(CODE).toMatch(/api\.delete\(`\/clip\/projects\//);
    const body = CODE.slice(CODE.indexOf('async function doDeleteProject'), CODE.indexOf('const specLabel'));
    expect(body).toContain('素材源文件未动');
  });

  it('素材缺失要可见（引用式工程的 Offline 提示）', () => {
    expect(CODE).toContain('missingClips');
    expect(CODE).toMatch(/素材文件已不在原位置/);
  });
});


describe('ClipWorkbench · 蒙版与字幕样式（对标商用软件的"能建立"）', () => {
  it('★★ 蒙版必须能在 UI 里设置（此前完全没有此能力）', () => {
    expect(CODE).toContain('MASK_SHAPES');
    expect(CODE).toContain('MASK_KEYS');
    expect(CODE).toMatch(/@click="pickMaskShape/);
    expect(CODE).toMatch(/@click="pickMaskKey/);
  });

  it('★ 形状与抠像互斥（同时生效会让用户搞不清哪个起作用）', () => {
    const shapeFn = CODE.slice(CODE.indexOf('function pickMaskShape'), CODE.indexOf('function pickMaskKey'));
    expect(shapeFn).toContain('maskKey = ');
    const keyFn = CODE.slice(CODE.indexOf('function pickMaskKey'), CODE.indexOf('function clearClipMask'));
    expect(keyFn).toContain('maskShape = ');
  });

  it('★ 蒙版要能写进工程（applyClipPatch 里处理 mask 字段）', () => {
    const i = CODE.indexOf('async function applyClipPatch');
    const body = CODE.slice(i, i + 1800);
    expect(body).toContain('c.mask');
    expect(body).toContain('delete c.mask');   // 清空时要真删，不留空对象
  });

  it('★★ 字幕样式模板必须来自效果库（不得手写第二份清单）', () => {
    expect(CODE).toContain('TEXT_STYLES');
    expect(CODE).toMatch(/applyTextStyle/);
  });

  it('★ 套用模板只覆盖模板里有的字段（不能重置用户已调好的时间/文案）', () => {
    const i = CODE.indexOf('function applyTextStyle');
    const body = CODE.slice(i, i + 900);
    expect(body).not.toContain('textPatch.text =');
    expect(body).not.toContain('textPatch.start =');
    expect(body).not.toContain('textPatch.end =');
  });
});


describe('ClipWorkbench · 实时预览（边剪辑边预览）', () => {
  it('★★ 默认必须是实时模式，且监视器渲染实时帧（不是只有成片播放）', () => {
    // 此前"预览"= 上一次渲染的成片，等于没有预览（用户："边剪辑边预览没有？"）
    expect(CODE).toMatch(/const monitorMode = ref<'live' \| 'clip'>\('live'\)/);
    expect(CODE).toContain('cp-live-frame');
    expect(CODE).toContain('liveFrameUrl');
  });

  it('★ 没有成片时也要能出画面（条件不能依赖 previewUrl）', () => {
    // 实时帧分支不得出现 previewUrl 作为前提
    const tpl = CODE.slice(CODE.indexOf('cp-monitor-stage'), CODE.indexOf('cp-transport'));
    const liveBranch = tpl.slice(tpl.indexOf('monitorMode === \'live\''), tpl.indexOf('monitorMode === \'clip\''));
    expect(liveBranch).not.toContain('previewUrl');
  });

  it('★★ 播放头变化必须驱动取帧（这是"边剪边看"的驱动核心）', () => {
    expect(CODE).toMatch(/watch\(playhead,[\s\S]{0,80}scheduleFrameFetch/);
  });

  it('★★ 取帧必须防竞态（拖动时旧响应不能覆盖新画面）', () => {
    const i = CODE.indexOf('async function fetchFrame');
    const body = CODE.slice(i, i + 1600);
    expect(body).toContain('frameSeq');           // 序号比对
    expect(body).toContain('mySeq !== frameSeq'); // 作废旧响应
  });

  it('★★ 请求 URL 必须带工程版本，且不能依赖浏览器缓存（否则改参数画面不动）', () => {
    const i = CODE.indexOf('async function fetchFrame');
    const body = CODE.slice(i, i + 1000);
    // 实测踩到：URL 只有 t → 改参数后 URL 未变 → 浏览器回旧图，表现为"预览不刷新"
    expect(body).toContain('&v=');
  });

  it('★ 换帧要释放旧 object URL（否则持续泄漏内存）', () => {
    const i = CODE.indexOf('function replaceFrameUrl');
    const body = CODE.slice(i, i + 400);
    expect(body).toContain('revokeObjectURL');
  });

  it('★ 取帧失败要如实展示（不静默留空白）', () => {
    expect(CODE).toContain('cp-live-err');
    expect(CODE).toContain('frameError');
  });
});


describe('ClipWorkbench · 鼠标与键盘交互（对标商用软件）', () => {
  it('★★ 必须有右键菜单（此前 42 个 click 但零 contextmenu）', () => {
    expect(CODE).toContain('@contextmenu.prevent');
    expect(CODE).toContain('onClipMenu');
    expect(CODE).toContain('onTextMenu');
    expect(CODE).toContain('onMediaMenu');
    expect(CODE).toContain('onEmptyMenu');
  });

  it('★★ 右键菜单必须做边界夹取（否则贴边右击菜单跑出视窗且无法滚动）', () => {
    const i = CODE.indexOf('function openCtxMenu');
    const body = CODE.slice(i, i + 500);
    expect(body).toContain('clampMenuPos');
  });

  it('★ 片段边缘必须能拖动修剪（拖动即改裁剪点，比进面板改数字直观）', () => {
    expect(CODE).toContain('cp-clip-handle');
    expect(CODE).toContain('startTrim');
    expect(CODE).toMatch(/@mousedown\.stop="startTrim/);
  });

  it('★★ 拖动修剪要按 speed 换算回素材时间（否则变速段的裁剪点会错位）', () => {
    const i = CODE.indexOf('function startTrim');
    const body = CODE.slice(i, i + 1400);
    expect(body).toContain('/ pxPerSec.value) * sp');
    // 拖动中要刷新预览帧（边剪边看）
    expect(body).toContain('scheduleFrameFetch');
    // 拖动中不落盘、松手才落盘
    expect(body).toContain('window.removeEventListener');
    expect(body).toMatch(/void save\(\)/);
  });

  it('★★ 快捷键必须在输入框聚焦时不拦截（否则打字按 Delete 会删片段）', () => {
    const i = CODE.indexOf('function onKeyDown');
    const body = CODE.slice(i, i + 900);
    expect(body).toContain("tag === 'input'");
    expect(body).toContain("tag === 'textarea'");
    expect(body).toContain('isContentEditable');
  });

  it('★ 快捷键要在弹窗打开时不生效（避免误删）', () => {
    const i = CODE.indexOf('function onKeyDown');
    const body = CODE.slice(i, i + 900);
    expect(body).toContain('el-dialog');
  });

  it('★ 快捷键表要覆盖商用软件的高频键（空格/S/Ctrl+D/Delete/方向键）', () => {
    const i = CODE.indexOf('const SHORTCUTS');
    const body = CODE.slice(i, i + 1200);
    for (const k of ["' '", "'s'", "'d'", "'Delete'", "'ArrowLeft'", "'ArrowRight'", "'Home'", "'End'"]) {
      expect(body, `缺快捷键 ${k}`).toContain(k);
    }
  });

  it('★ 键盘监听必须在卸载时移除（否则切页面后快捷键仍生效）', () => {
    expect(CODE).toMatch(/onBeforeUnmount\(\(\) => \{[\s\S]{0,200}removeEventListener\('keydown'/);
  });

  it('★ 播放定时器与帧定时器要在卸载时清理（否则后台空跑）', () => {
    // ★ 锚点必须用**代码片段**而不是 import 行：`onBeforeUnmount` 先出现在
    //   `import { ... onBeforeUnmount ... } from 'vue'`（本项目第三次踩这个坑）
    const i = CODE.indexOf('onBeforeUnmount(() => {');
    expect(i, '未找到 onBeforeUnmount 回调').toBeGreaterThan(-1);
    const body = CODE.slice(i, i + 400);
    expect(body).toContain('clearInterval(playTimer');
    expect(body).toContain('clearTimeout(frameTimer');
  });
});


describe('ClipWorkbench · 转场 / 音效 / 音效库（对标商用软件的三个入口）', () => {
  it('★★ 属性面板必须有转场入口（此前效果库有 25 种转场但 UI 没接）', () => {
    expect(CODE).toContain('TRANSITION_GROUPS');
    expect(CODE).toContain('clipPatch.transitionType');
    expect(CODE).toMatch(/<optgroup v-for="g in TRANSITION_GROUPS"/);
  });

  it('★★ 第一段不该有转场选项（没有"前一段"，接了也是无效配置）', () => {
    expect(CODE).toContain('selectedClipIndex === 0');
    // 落盘时要挡掉第一段
    const i = CODE.indexOf('async function applyClipPatch');
    const body = CODE.slice(i, i + 2000);
    expect(body).toMatch(/clipPatch\.transitionType && i > 0/);
  });

  it('★★ 必须有音效链入口（整片音频效果）', () => {
    expect(CODE).toContain('audioFx');
    expect(CODE).toContain('onPickAudioFx');
    expect(CODE).toContain('setAudioFx');
    expect(CODE).toMatch(/AUDIO_GROUPS/);
  });

  it('★ 音效链上限 4 个（叠加过多互相污染；后端也有同样闸门）', () => {
    const i = CODE.indexOf('async function onPickAudioFx');
    const body = CODE.slice(i, i + 800);
    expect(body).toContain('>= 4');
  });

  it('★★ 必须有音效库入口与生成（此前素材库空白）', () => {
    expect(CODE).toContain('openSfxLibrary');
    expect(CODE).toContain('generateSfx');
    expect(CODE).toMatch(/@click="generateSfx/);
    // 弹窗要如实说明"旋律配乐无法合成"，不能假装有配乐库
    expect(CODE).toContain('旋律性配乐无法合成');
  });

  it('★ 音效生成后要刷新素材列表（否则用户看不到刚生成的音效）', () => {
    const i = CODE.indexOf('async function generateSfx');
    const body = CODE.slice(i, i + 900);
    expect(body).toContain('loadFiles');
  });
});


describe('ClipWorkbench · 编辑器基础三件套（撤销 / 拖拽 / 吸附）', () => {
  it('★★★ 必须有撤销/重做（任何编辑器的门槛；此前 grep undo = 0 处）', () => {
    expect(CODE).toContain('undoStack');
    expect(CODE).toContain('redoStack');
    expect(CODE).toContain('async function undo()');
    expect(CODE).toContain('async function redo()');
    // 工具条要有按钮
    expect(CODE).toMatch(/@click="undo"/);
    expect(CODE).toMatch(/@click="redo"/);
  });

  it('★★ 快照必须在唯一落盘入口 save() 里统一入栈（不在 11 个改动点逐个手写 → 必漏）', () => {
    const i = CODE.indexOf('async function save()');
    expect(i).toBeGreaterThan(-1);
    const body = CODE.slice(i, i + 700);
    expect(body).toContain('snapshotProject');
    expect(body).toContain('pushHistory');
    // 必须是"落盘成功才入栈"（失败还入栈 = 给用户假历史）
    expect(body).toMatch(/if \(ok\) \{[\s\S]{0,80}pushHistory/);
  });

  it('★★★ 入栈的必须是「改动前」快照（实跑踩到：撤销点了没反应）', () => {
    // 第一版在 save() 里 `const before = snapshotProject()` —— 但 save 是调用方**改完之后**调的，
    // 取到的是改动后的状态 → 撤销回现状 = 看似无效。修法是维护 lastCommitted 基线。
    const i = CODE.indexOf('async function save()');
    const body = CODE.slice(i, i + 800);
    expect(body, 'save 必须入栈 lastCommitted 而不是现场快照').toContain('pushHistory(pendingLabel.value, lastCommitted)');
    expect(body, '入栈后要推进基线').toContain('lastCommitted = after');
    // 基线必须在载入工程后重置（否则首次编辑会撤销到空工程）
    expect(CODE).toContain('function resetHistory');
    const r = CODE.indexOf('await loadMediaMeta();');
    expect(CODE.slice(r, r + 400)).toContain('resetHistory()');
    // undo/redo 也要同步基线
    for (const fn of ['async function undo()', 'async function redo()']) {
      const k = CODE.indexOf(fn);
      expect(CODE.slice(k, k + 800), fn + ' 未同步基线').toContain('lastCommitted = snapshotProject()');
    }
  });

  it('★★ 撤销/重做时不能再入栈（否则撤销本身变成新历史，陷入循环）', () => {
    expect(CODE).toContain('applyingHistory');
    const i = CODE.indexOf('async function undo()');
    const body = CODE.slice(i, i + 700);
    expect(body).toContain('applyingHistory = true');
    expect(body).toContain('persistProject');   // 只落盘不入栈
    // undo 里不得调用 save（那会入栈）
    expect(body).not.toMatch(/await save\(\)/);
  });

  it('★ 撤销后要清理已不存在的选中项（否则属性面板指向幽灵片段）', () => {
    const i = CODE.indexOf('function refreshSelectionAfterHistory');
    const body = CODE.slice(i, i + 600);
    expect(body).toContain('selectedClipId.value');
    expect(body).toContain('selectedTextId.value');
  });

  it('★ 历史栈有上限（否则长任务内存无限增长）', () => {
    expect(CODE).toContain('HISTORY_MAX');
    const i = CODE.indexOf('function pushHistory');
    const body = CODE.slice(i, i + 600);
    expect(body).toContain('HISTORY_MAX');
    expect(body).toContain('shift()');
  });

  it('★★ 拖动片段要能交换位序（此前只能右键挪一位，挪 5 位要 5 次）', () => {
    const i = CODE.indexOf('function onClipMouseDown');
    const body = CODE.slice(i, i + 1800);
    expect(body).toContain('splice');            // 就地交换
    expect(body).toContain('dragMoved.value = true');
    // 松手才落盘（拖动中不动磁盘）
    expect(body).toMatch(/void save\(\)/);
  });

  it('★★ 拖动要有像素阈值（否则轻微抖动会弄乱片段顺序）', () => {
    const i = CODE.indexOf('function onClipMouseDown');
    const body = CODE.slice(i, i + 1800);
    expect(body).toMatch(/Math\.abs\(ev\.clientX - startX\) < 4/);
  });

  it('★★ 必须有吸附（手动拖到正好段开头做不到，差 0.03s 字幕就错位）', () => {
    expect(CODE).toContain('snapTime');
    expect(CODE).toContain('snapPoints');
    expect(CODE).toContain('SNAP_PX');
  });

  it('★★ 吸附阈值必须按像素而非秒（用秒在大缩放下形同虚设）', () => {
    const i = CODE.indexOf('function snapTime');
    const body = CODE.slice(i, i + 500);
    expect(body).toContain('SNAP_PX / pxPerSec.value');
  });

  it('★ 播放头定位要走吸附（否则"拖到片段开头"永远差一点点）', () => {
    const i = CODE.indexOf('function seekFromEvent');
    const body = CODE.slice(i, i + 400);
    expect(body).toContain('snapTime');
  });

  it('★ 撤销/重做快捷键（Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y）', () => {
    const i = CODE.indexOf('const SHORTCUTS');
    const body = CODE.slice(i, i + 1600);
    expect(body).toContain("key: 'z'");
    expect(body).toContain("key: 'Z'");   // Shift+Ctrl+Z
    expect(body).toContain("key: 'y'");
    expect(body).toContain('undo()');
    expect(body).toContain('redo()');
  });

  it('★ 关键操作要设置可读标签（撤销时能看懂撤了什么）', () => {
    expect(CODE).toContain('pendingLabel.value');
    for (const label of ['删除片段', '分割片段', '修改片段参数', '添加字幕', '调整片段顺序']) {
      expect(CODE, `缺标签 ${label}`).toContain(label);
    }
  });
});

describe('ClipWorkbench · 与后端契约一致', () => {
  it('★★ 字幕动画清单不得再手写（必须来自 shared 效果库，否则与后端漂移）', () => {
    // 架构改进后：UI 从 @yan-zhi/shared 的 TEXT_ANIMATIONS 取，不再自己维护一份
    expect(CODE).toContain('TEXT_ANIMATIONS');
    expect(CODE).toMatch(/from '@yan-zhi\/shared'/);
    // 不得再出现手写的 8 项 id 清单
    expect(CODE).not.toMatch(/\{ id: 'fade', label: '淡入淡出'/);
  });

  it('★★ 调色/音效下拉也来自效果库（按 group 分组渲染）', () => {
    expect(CODE).toContain('COLOR_EFFECTS');
    expect(CODE).toContain('COLOR_GROUPS');
    expect(CODE).toMatch(/<optgroup v-for="g in COLOR_GROUPS"/);
  });

  it('预览地址参数名与 FilePreview 一致（license=，非 x-license）', () => {
    const start = CODE.indexOf('function streamUrl');
    const body = CODE.slice(start, CODE.indexOf('\n}', start));
    expect(body).toContain('license=');
    expect(body).not.toContain('x-license=');
  });

  it('工程读写走 /clip/project 接口（GET 带 conversationId、PUT 带 project）', () => {
    expect(CODE).toContain('/clip/project?conversationId=');
    expect(CODE).toMatch(/api\.put\('\/clip\/project'/);
  });
});