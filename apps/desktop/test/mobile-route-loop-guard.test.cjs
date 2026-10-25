// 移动端路由死循环守门（2026-10-25 真机空白根因）。
//
// 病灶：localStorage 恢复出被屏蔽的模式（如 legacy 迁移的 dev）→ 冷启动 / → /chat →
// 「模式记忆」弹去 /code → MOBILE_BLOCKED_PATHS 分支弹回 /chat → 无限重定向，
// vue-router 判定死循环**中止导航**：内容区永远空白、route.name 落空 →
// 标题落兜底「日常办公助手」、顶栏变 App 级形态（真机截图逐项吻合）。
//
// 修复是三道闸（都在 packages/ui/src/router/index.ts）：
//   ① 屏蔽分支回 /chat 前先 setMode('office')（断环主力）；
//   ② 模式记忆重定向加第二道闸：目标是屏蔽路径时不许跳；
//   ③ 移动端恢复模式落在屏蔽路径时就地归位 office。
// 这里用静态断言钉住三道闸 —— 与 checkbox-guard/instance 系列同风格（源码即契约）。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'packages', 'ui', 'src', 'router', 'index.ts'), 'utf8');

test('屏蔽分支回 /chat 前必须先把 activeMode 拨回 office（断环主力）', () => {
  const branch = src.slice(
    src.indexOf('MOBILE_BLOCKED_PATHS.has(to.path)'),
    src.indexOf('MOBILE_BLOCKED_PATHS.has(to.path)') + 800,
  );
  assert.ok(branch.includes("setMode('office')"), '屏蔽分支内缺 setMode("office") —— 会 reintroduce /chat↔/code 死循环');
});

test('模式记忆重定向必须带移动端屏蔽路径第二道闸', () => {
  const memory = src.slice(src.indexOf('模式记忆（泛化）'), src.indexOf('冷启动竞态这里'));
  assert.ok(
    memory.includes('MOBILE_BLOCKED_PATHS.has(modeRoute(activeMode.value))'),
    '模式记忆重定向缺屏蔽路径闸 —— dev 恢复时会弹回 /code 形成死循环',
  );
});

test('移动端恢复模式落在屏蔽路径时必须就地归位 office', () => {
  const normalize = src.slice(src.indexOf('就地归位 office'), src.indexOf('模式记忆（泛化）'));
  assert.ok(normalize.includes("setMode('office')"), '缺恢复模式归位 office 的兜底');
});

test('MOBILE_BLOCKED_PATHS 必须包含 /code（legacy 代码模式迁移的目标路径）', () => {
  assert.ok(/MOBILE_BLOCKED_PATHS = new Set\(\[\s*'\/code'/.test(src), '屏蔽清单丢了 /code');
});
