/**
 * 远控横屏重构守门（2026-10-27）：按 docs/prototypes/remote-landscape-proto.html 落真机。
 *
 * 三条交互红线（用户逐条拍板，原型定稿）：
 *  1. 仿真鼠标 = 唯一光标：箭头尖 = 注入坐标热点，绝不允许再出现第二个自绘光标；
 *  2. 悬浮球 = 全沉浸唯一常驻入口：点/长按呼出菜单（鼠标显隐/键盘/显示器/铺满/操作/断开），
 *     右侧栏与旧「键盘输入」面板必须绝迹；
 *  3. 直通键盘：隐藏 input 唤系统输入法，无自绘输入框；画面默认铺满（zoomMode='fill'）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const CLIENT = readFileSync(resolve(ROOT, 'packages/ui/src/views/RemoteControl.vue'), 'utf8');

describe('横屏重构：仿真鼠标 = 唯一光标', () => {
  it('★ 旧触控板（rc-pad）与自绘光标（rc-cursor）必须绝迹', () => {
    expect(CLIENT, '★ rc-pad 还在 —— 触控板要整个删掉').not.toMatch(/rc-pad/);
    expect(CLIENT, '★ rc-cursor 还在 —— 自绘光标要删（箭头尖是唯一光标）').not.toMatch(/rc-cursor/);
    expect(CLIENT, '★ 旧「键盘输入」面板必须删干净').not.toMatch(/rc-panel-kb/);
  });

  it('★ 仿真鼠标三件套：箭头 + 左/右半键 + 中滚轮，箭头尖 = 注入坐标', () => {
    expect(CLIENT, '★ 缺仿真鼠标本体').toMatch(/class="rc-vmouse" :style="vmouseStyle"/);
    expect(CLIENT, '★ 缺箭头（唯一光标）').toMatch(/class="rc-vm-arrow"/);
    expect(CLIENT, '★ 缺左半键').toMatch(/rc-vm-l" :class="\{ press: vmPress === 'left' \}"/);
    expect(CLIENT, '★ 缺右半键').toMatch(/rc-vm-r" :class="\{ press: vmPress === 'right' \}"/);
    expect(CLIENT, '★ 缺中滚轮').toMatch(/class="rc-vm-wheel"/);
    // 箭头尖 = 热点：vmouse 摆放 = 指针坐标 - 1px（与原型 vmHotspot 同口径）
    expect(CLIENT, '★ 摆放必须锚在箭头尖（at - 1px）').toMatch(
      /function syncVmouseToPointer\(\): void \{[\s\S]{0,160}vmousePos\.x = at\.x - 1;[\s\S]{0,60}vmousePos\.y = at\.y - 1;/,
    );
  });

  it('★ 拖鼠标体 = pointer 模式移动指针，且必须 setPointerCapture（幽灵指针坑）', () => {
    const downIdx = CLIENT.indexOf('function onVmousePointerDown');
    expect(downIdx, '未找到 onVmousePointerDown').toBeGreaterThan(0);
    expect(CLIENT.slice(downIdx, downIdx + 320), '★ 拖动必须指针捕获').toMatch(/setPointerCapture\(e\.pointerId\)/);
    expect(CLIENT, '★ 拖动必须走 movePointerBy（与远端注入同链路）').toMatch(
      /function onVmousePointerMove[\s\S]{0,240}movePointerBy\(/,
    );
  });
});

describe('横屏重构：悬浮球 = 全沉浸唯一入口', () => {
  it('★ 球存在、可点开菜单、长按也呼出、4s 无操作变暗', () => {
    expect(CLIENT, '★ 缺悬浮球').toMatch(/class="rc-fball" :class="\{ dim: ballDimmed \}"/);
    expect(CLIENT, '★ 缺球菜单').toMatch(/v-if="ballMenuOpen" class="rc-fmenu"/);
    expect(CLIENT, '★ 长按必须呼出菜单').toMatch(/ballLongTimer = window\.setTimeout/);
    expect(CLIENT, '★ 必须有空闲变暗').toMatch(/BALL_DIM_MS/);
  });

  it('★ 菜单六项：鼠标显隐 / 键盘 / 显示器 / 铺满 / 操作 / 断开', () => {
    for (const act of ['mouse', 'kb', 'disp', 'zoom', 'actions', 'back']) {
      expect(CLIENT, `★ 球菜单缺 ${act}`).toMatch(new RegExp(`data-act="${act}"`));
    }
    expect(CLIENT, '★ 缺显示器子菜单').toMatch(/v-if="dispMenuOpen" class="rc-disp-menu"/);
    expect(CLIENT, '★ 缺球菜单动作分发').toMatch(/function ballAct\(act: string\)/);
  });

  it('★ 旧右侧栏（rc-rail）必须绝迹，顶栏沉浸态隐藏（hudHidden）', () => {
    expect(CLIENT, '★ rc-rail 还在 —— 入口要全部收进悬浮球').not.toMatch(/rc-rail/);
    expect(CLIENT, '★ 顶栏沉浸态要藏').toMatch(/:class="\{ hidden: hudHidden \}"/);
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
