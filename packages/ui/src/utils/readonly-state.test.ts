/**
 * 输入权限两档 + 右键入口守门（2026-10-26 P0）。
 *
 * 口径（对标 UU）：
 *  - 被控端确认弹窗可把整次会话设成「仅观看」→ session.input.granted=false；
 *  - 控制端自己也能在 [操作]-[仅观看] 切一档（纯本地偏好，随时退出，不需要被控端同意）；
 *  - 生效权限 = 两者与；只读时控制端底部常驻「只读观看」，可原地请求/恢复，不重连。
 *
 * 另守：手机没有右键键，除长按/双指轻点外必须有**显式右键按钮**（否则等于没有右键）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const SERVER = readFileSync(resolve(ROOT, 'apps/server/src/plugins/remote-control.ts'), 'utf8');
// 阶段 1 第 1 步：被控端信令/采集已抽到 composable，弹窗仍留在组件里。
// 守门用例按「UI + 逻辑」合并检查，避免重构后断言落空。
const HOST = [
  readFileSync(resolve(ROOT, 'packages/ui/src/components/RemoteControlHost.vue'), 'utf8'),
  readFileSync(resolve(ROOT, 'packages/ui/src/composables/useRcHostSignaling.ts'), 'utf8'),
].join('\n');
const CLIENT = readFileSync(resolve(ROOT, 'packages/ui/src/views/RemoteControl.vue'), 'utf8');

describe('输入权限两档（被控端授予 ∧ 控制端未切仅观看）', () => {
  it('★ 服务端：生效权限是两档与，只读时直接拒绝注入且只提示一次', () => {
    expect(SERVER, '★ 缺两档合并').toMatch(
      /const inputEffective = \(s: RcSession\): boolean => s\.inputAllowed && !s\.viewOnly;/,
    );
    expect(SERVER).toMatch(/if \(!inputEffective\(s\)\) \{/);
    expect(SERVER, '★ 拒绝提示必须带 readonly 标记').toMatch(/type: 'input\.rejected',\s*\n\s*readonly: true,/);
    expect(SERVER, '★ 只读提示应只发一次').toMatch(/if \(!s\.readonlyNotified\)/);
  });

  it('★ 服务端：granted/resume/session.input 都下发同一套权限状态', () => {
    expect(SERVER, '★ 缺统一状态打包').toMatch(
      /const inputState = \(s: RcSession\)[\s\S]{0,160}allowed: inputEffective\(s\)[\s\S]{0,80}granted: s\.inputAllowed[\s\S]{0,80}viewOnly: s\.viewOnly/,
    );
    const grantedCount = (SERVER.match(/input: inputState\(s\)/g) || []).length;
    expect(grantedCount, `★ granted 与 resume 都应走 inputState（实测 ${grantedCount} 处）`).toBe(2);
  });

  it('★ 控制端可自切仅观看（input.set），被控端可另行授予（input.grant）', () => {
    expect(SERVER, '★ 缺控制器 input.set').toMatch(/case 'input\.set': \{/);
    expect(SERVER).toMatch(/s\.viewOnly = msg\.viewOnly === true;/);
    expect(SERVER, '★ 缺被控端 input.grant').toMatch(/case 'input\.grant': \{/);
    expect(SERVER, '★ 授予后要把新状态推给控制器').toMatch(
      /s\.inputAllowed = msg\.allow !== false;[\s\S]{0,200}type: 'session\.input', \.\.\.inputState\(s\)/,
    );
  });

  it('★ 被控端确认弹窗保留「仅观看」档', () => {
    expect(HOST).toMatch(/v-model="viewOnly"/);
    expect(HOST).toMatch(/readOnly: allow && viewOnly\.value/);
    expect(HOST, '★ 缺 input.request 处理').toMatch(/case 'input\.request':/);
    expect(HOST).toMatch(/type: 'input\.grant', sessionId, allow: true/);
  });

  it('★ 客户端：只读本地不发输入，底栏按来源给「请求操控 / 恢复操控」', () => {
    expect(CLIENT).toMatch(/const inputAllowed = computed\(\(\) => inputGranted\.value && !viewOnlySelf\.value\)/);
    // 只读时不发输入，并记下原因（诊断面板靠它区分「权限」还是「链路」）
    expect(CLIENT, '★ input() 未按只读态拦截').toMatch(
      /if \(!inputAllowed\.value\) \{\s*\n\s*lastInputError\.value[\s\S]{0,120}return;/,
    );
    expect(CLIENT, '★ 缺只读底栏').toMatch(/v-if="phase === 'live' && !inputAllowed" class="rc-readonly"/);
    expect(CLIENT, '★ 两种来源要能区分（被控端未授予 vs 自己切了仅观看）').toMatch(
      /inputGranted \? toggleViewOnly\(\) : requestInput\(\)/,
    );
    expect(CLIENT, '★ 切仅观看必须走 input.set').toMatch(/function toggleViewOnly\(\)[\s\S]{0,200}type: 'input\.set'/);
    expect(CLIENT, '★ 顶栏状态要能看出只读').toMatch(/const ro = inputAllowed\.value \? '' : '只读观看 · '/);
  });
});

describe('显式右键入口（手机没有右键键）', () => {
  it('★ 仿真鼠标控制器长按 = 常驻右键（2026-10-31 对标 UU：控制器只剩拖/点/长按）', () => {
    // 控制器改成独立悬浮后没有左/右半键了：长按 = 右键，落点仍是指针当前位置（vmClick → clickAt useCursor）
    expect(CLIENT, '★ 缺长按右键入口').toMatch(
      /function onCtrlPointerDown[\s\S]{0,760}vmClick\('right'\)/,
    );
    expect(CLIENT, '★ 长按必须把点击落在指针位置').toMatch(
      /function vmClick\(button: 'left' \| 'right'\): void \{[\s\S]{0,200}clickAt\(0, 0, button, true\)/,
    );
    expect(CLIENT, '★ 旧 rail 右键按钮必须删干净').not.toMatch(/@click\.stop="rightClickAtLast"/);
    expect(CLIENT).toMatch(/function rightClickAtLast\(\): void \{/);
    expect(CLIENT, '★ 应优先在最近点过的位置右键').toMatch(/const at = lastTapAt \|\|/);
    expect(CLIENT, '★ 指针模式下应在虚拟指针处右键').toMatch(/if \(mouseVisible\.value\) \{\s*\n\s*rightClickHere\(\);/);
  });

  it('★ 操作抽屉里也有右键（不再只在 pointer 模式出现）', () => {
    expect(CLIENT).toMatch(/class="rc-act" @click="doAction\(rightClickAtLast\)"/);
    expect(CLIENT, '★ 右键按钮不该再被 mouseMode 挡住').not.toMatch(/v-if="mouseMode" class="rc-act" @click="doAction\(rightClickHere\)"/);
  });

  it('★ 点按位置被记录（右键落在用户刚点的地方）', () => {
    expect(CLIENT).toMatch(/lastTapAt = p;/);
    expect(CLIENT).toMatch(/let lastTapAt: \{ x: number; y: number \} \| null = null;/);
  });
});
