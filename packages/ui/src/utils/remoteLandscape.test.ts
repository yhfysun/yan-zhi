/**
 * 远控横屏重构守门（2026-10-27 定稿，2026-10-31 仿真鼠标改成对标 UU 的独立控制器）。
 *
 * 交互红线：
 *  1. 指针箭头 = 唯一光标：箭头尖 = 注入坐标热点，绝不允许再出现第二个自绘光标；
 *  2. 仿真鼠标控制器独立悬浮，不跟着指针跑 —— 否则又会像旧版那样压住要点的目标，
 *     指针也就摸不到最底部的任务栏（实报）；
 *  3. 触屏端入口 = 右侧栏工具栏（操作/鼠标/键盘/全屏/断开），悬浮球与旧右侧栏、旧「键盘输入」面板必须绝迹；
 *  4. 直通键盘：隐藏 input 唤系统输入法，无自绘输入框；画面默认铺满（zoomMode='fill'）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const CLIENT = readFileSync(resolve(ROOT, 'packages/ui/src/views/RemoteControl.vue'), 'utf8');

describe('横屏重构：指针箭头 + 独立悬浮的仿真鼠标控制器', () => {
  it('★ 旧触控板（rc-pad）与自绘光标（rc-cursor）必须绝迹', () => {
    expect(CLIENT, '★ rc-pad 还在 —— 触控板要整个删掉').not.toMatch(/rc-pad/);
    expect(CLIENT, '★ rc-cursor 还在 —— 自绘光标要删（箭头尖是唯一光标）').not.toMatch(/rc-cursor/);
    expect(CLIENT, '★ 旧「键盘输入」面板必须删干净').not.toMatch(/rc-panel-kb/);
  });

  it('★ 指针箭头画在注入坐标处（left/top = 热点 - 1px）', () => {
    expect(CLIENT, '★ 缺指针箭头').toMatch(/class="rc-pointer" :style="vmouseStyle"/);
    // 箭头尖 = 热点：vmouse 摆放 = 指针坐标 - 1px
    expect(CLIENT, '★ 摆放必须锚在箭头尖（at - 1px）').toMatch(
      /function syncVmouseToPointer\(\): void \{[\s\S]{0,160}vmousePos\.x = at\.x - 1;[\s\S]{0,60}vmousePos\.y = at\.y - 1;/,
    );
  });

  it('★ 控制器独立悬浮，不跟着指针跑（否则又会挡住要点的东西）', () => {
    expect(CLIENT, '★ 缺仿真鼠标控制器').toMatch(/class="rc-vmctrl"/);
    expect(CLIENT, '★ 控制器不能跟着指针定位（不许绑 vmouseStyle）').not.toMatch(
      /rc-vmctrl"[^>]*:style="vmouseStyle"/,
    );
    expect(CLIENT, '★ 控制器要定点悬浮（右侧中部，给侧栏让位）').toMatch(/\.rc-vmctrl \{ position: absolute; right: 84px; top: 50%/);
    expect(CLIENT, '★ 缺中滚轮').toMatch(/class="rc-vm-wheel"/);
  });

  it('★ 拖 = 移动指针（pointer 捕获），单击 = 左键，长按 = 右键', () => {
    const downIdx = CLIENT.indexOf('function onCtrlPointerDown');
    expect(downIdx, '未找到 onCtrlPointerDown').toBeGreaterThan(0);
    expect(CLIENT.slice(downIdx, downIdx + 320), '★ 拖动必须指针捕获').toMatch(/setPointerCapture\(e\.pointerId\)/);
    expect(CLIENT, '★ 拖动必须走 movePointerBy（与远端注入同链路）').toMatch(
      /function onCtrlPointerMove[\s\S]{0,700}movePointerBy\(/,
    );
    expect(CLIENT, '★ 长按必须发右键').toMatch(/function onCtrlPointerDown[\s\S]{0,700}vmClick\('right'\)/);
    expect(CLIENT, '★ 单击必须发左键').toMatch(/function onCtrlPointerUp[\s\S]{0,500}vmClick\('left'\)/);
  });
});

describe('侧栏工具栏（2026-10-31 对标 UU，悬浮球已删）', () => {
  it('★ 悬浮球与球菜单/显示器子菜单必须绝迹', () => {
    expect(CLIENT, '★ rc-fball 还在 —— 悬浮球已删，入口改侧栏').not.toMatch(/rc-fball/);
    expect(CLIENT, '★ 球菜单还在').not.toMatch(/rc-fmenu/);
    expect(CLIENT, '★ 显示器子菜单还在').not.toMatch(/rc-disp-menu/);
    expect(CLIENT, '★ ballAct 分发还在').not.toMatch(/function ballAct/);
  });

  it('★ 侧栏四件套：操作 / 鼠标 / 键盘 / 全屏 + 断开', () => {
    expect(CLIENT, '★ 缺侧栏').toMatch(/v-if="phase === 'live' && isTouch" class="rc-sidebar"/);
    expect(CLIENT, '★ 缺操作入口').toMatch(/class="rc-sbtn" @click="actionsOpen = true"/);
    expect(CLIENT, '★ 缺鼠标开关').toMatch(/class="rc-sbtn" :class="\{ on: mouseVisible \}" @click="toggleMouseMode"/);
    expect(CLIENT, '★ 缺键盘入口').toMatch(/class="rc-sbtn" :class="\{ on: kbDirect \}" @click="openKeyboardPanel"/);
    expect(CLIENT, '★ 缺全屏入口').toMatch(/class="rc-sbtn" :class="\{ on: immersive \}" @click="toggleFullscreen"/);
    expect(CLIENT, '★ 缺断开入口').toMatch(/class="rc-sbtn danger" @click="disconnect"/);
  });

  it('★ 控制器要给侧栏让位（右移一档，不能叠在一起）', () => {
    expect(CLIENT, '★ 控制器与侧栏重叠').toMatch(/\.rc-vmctrl \{ position: absolute; right: 84px/);
  });

  it('★ 旧右侧栏（rc-rail）必须绝迹，顶栏沉浸态隐藏（hudHidden）', () => {
    expect(CLIENT, '★ rc-rail 还在 —— 入口要全部收进侧栏').not.toMatch(/rc-rail/);
    expect(CLIENT, '★ 顶栏沉浸态要藏').toMatch(/:class="\{ hidden: hudHidden \}"/);
  });
});

describe('桌面控制端：不刷仿真鼠标/侧栏，顶栏要有全屏入口', () => {
  it('★ 侧栏只给触屏控制端（桌面端本来就有鼠标键盘）', () => {
    expect(CLIENT, '★ 侧栏必须用 isTouch 门控').toMatch(
      /v-if="phase === 'live' && isTouch" class="rc-sidebar"/,
    );
  });

  it('★ isTouch 不能看 maxTouchPoints —— 触摸屏 Windows 笔记本会被误判成手机', () => {
    expect(CLIENT, '★ isTouch 又被 maxTouchPoints 带偏了').not.toMatch(/isTouch = [^\n]*maxTouchPoints/);
    expect(CLIENT, '★ isTouch 必须只认粗粒度指针').toMatch(
      /const isTouch = typeof matchMedia !== 'undefined' && matchMedia\('\(pointer: coarse\)'\)\.matches;/,
    );
  });

  it('★ 顶栏常驻「操作 / 全屏」两个入口（桌面端无球可点）', () => {
    expect(CLIENT, '★ 缺全屏按钮').toMatch(/:title="immersive \? '退出全屏（Esc）' : '全屏 \/ 最大化'"/);
    expect(CLIENT, '★ 缺操作面板按钮').toMatch(/title="操作面板" @click="actionsOpen = !actionsOpen"/);
  });

  it('★ 桌面全屏顶栏自动隐藏，鼠标移到顶部再浮出（不挡住退出按钮）', () => {
    expect(CLIENT, '★ 缺顶栏空闲隐藏').toMatch(/hudIdleTimer = window\.setTimeout/);
    expect(CLIENT, '★ 缺顶部热区唤出').toMatch(/function onHudPointerMove[\s\S]{0,140}e\.clientY <= 72/);
  });
});

describe('触屏平移余量：指针要能摸到最底部的任务栏', () => {
  it('★ 底部/右侧安全边距按仿真鼠标体尺寸留 —— 只留 28px 会让鼠标体整块跑出屏外', () => {
    expect(CLIENT, '★ 缺底部专用边距').toMatch(/STAGE_EDGE_PAD_BOTTOM = 9\d/);
    expect(CLIENT, '★ 缺右侧专用边距').toMatch(/STAGE_EDGE_PAD_RIGHT = \d+/);
    expect(CLIENT, '★ 边缘平移必须用底部/右侧专用边距').toMatch(
      /c\.x > viewport\.w - STAGE_EDGE_PAD_RIGHT[\s\S]{0,120}c\.y > viewport\.h - STAGE_EDGE_PAD_BOTTOM/,
    );
  });

  it('★ 允许画面额外外推（overscroll），远端边缘能被推进视口内侧', () => {
    expect(CLIENT, '★ 缺 overscroll 比例').toMatch(/PAN_OVERSCROLL_RATIO = 0\.\d+/);
    expect(CLIENT, '★ 显示矩形夹取没算 overscroll').toMatch(
      /const pad = panPad\(\);[\s\S]{0,200}const yMax = Math\.max\(0, viewport\.h - h\) \+ pad;/,
    );
    expect(CLIENT, '★ panBy 夹取没算 overscroll').toMatch(
      /const yMaxOff = Math\.max\(0, viewport\.h - h\) - \(viewport\.h - h\) \/ 2 \+ pad;/,
    );
  });
});

describe('邀请链接必须在普通浏览器（http 局域网）里能跑', () => {
  it('★ 不许直接调用 crypto.randomUUID：非安全上下文里它不存在，配对第一步就抛异常', () => {
    expect(CLIENT, '★ crypto.randomUUID 又被直接调用了（http://192.168.x.x 下是 undefined）')
      .not.toMatch(/crypto\.randomUUID\(\)/);
    expect(CLIENT, '★ 缺设备号兜底生成').toMatch(/function newDeviceId\(\)/);
    expect(CLIENT, '★ 兜底必须用 getRandomValues（不安全上下文也可用）').toMatch(/c\.getRandomValues\(b\)/);
  });
});

describe('横屏重构：直通键盘 + 默认铺满', () => {
  it('★ 隐藏 input 唤系统键盘，打字逐字注入，无自绘输入框', () => {
    expect(CLIENT, '★ 缺隐藏 input（直通键盘）').toMatch(/v-if="kbDirect" ref="kbInputRef" class="rc-kb-input"/);
    expect(CLIENT, '★ 缺 focus 唤系统键盘').toMatch(/kbDirect\.value = true;\s*\n\s*await nextTick\(\);\s*\n\s*kbInputRef\.value\?\.focus\(\)/);
    // 组字保护：拼音阶段不发，compositionend 整串发
    expect(CLIENT, '★ 缺组字守卫（kbComposing）').toMatch(/function onKbInput[\s\S]{0,120}if \(kbComposing\.value\) return;/);
    expect(CLIENT, '★ 缺组字结束整串注入').toMatch(/function onKbCompositionEnd/);
  });

  it('★ 画面默认铺满（cover）+ 四周留出平移余量', () => {
    // 2026-10-27 用户口径：画面铺满屏幕（不要固定黑边），但四周必须留出可平移的溢出量
    // —— 指针推到边缘后画面还能继续走，才能点到远端桌面的最底/最右元素。
    expect(CLIENT, '★ 默认 zoomMode 必须是 fill（铺满）').toMatch(
      /const zoomMode = ref<'fit' \| 'fill' \| 'free'>\('fill'\)/,
    );
    expect(CLIENT, '★ 铺满必须带 overscan，否则纵向没有平移余量').toMatch(/FILL_OVERSCAN = 1\.0[0-9]/);
    expect(CLIENT, '★ cleanup 要重置回 fill').toMatch(/zoomMode\.value = 'fill';/);
  });
});
