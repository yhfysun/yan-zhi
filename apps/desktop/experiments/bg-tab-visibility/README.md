# P0 实验：后台标签页的可见性判据

**背景**：`docs/background-tab-parallel-plan.md` §4.4 / §0.5。要回答的问题是 ——
让第二个 pageAgent 占一个"后台标签页"时，那个页到底还在不在正常跑（微前端会不会挂载）。

**结论（2026-10-15 实测，5 次运行）**：

1. **`document.visibilityState` 不能当判据**：7 种挂载形态（激活页 / 铺满+`opacity:0`+被盖住 /
   移出视口 / 0×0 / `display:none` / `visibility:hidden` / 滚出滚动容器）**每一次运行都报同一个值** ——
   窗口正常时全 `visible`，窗口最小化时全 `hidden`。它只跟随**窗口级**状态，与元素怎么挂载无关。
2. rAF 活性 / 定时器节流本该是真正的判据，但**本脚手架测不稳**：同一形态跨轮次拿到过 92 / 0 / 90 / 1 帧。
   根因是从后台 shell 启动的 Electron 窗口**无法稳定进入前台合成**（实测 `isFocused=false`、
   `paintedTicks=-1`），此时所有 guest 一起掉帧 —— 量到的是"环境没热"，不是"形态差异"。
   ⇒ 挂载形态的取舍**要另找条件测**（真实 app + 真实前台窗口）。
3. 唯一稳定重现的：`display:none` 在所有轮次都是 0 帧，与产品 CSS 注释
   （`packages/ui/src/components/BrowserPanel.vue:2910`："不用 display:none —— 那会让 guest 停止合成"）一致。

**跑法**：

```bash
apps/desktop/node_modules/.bin/electron apps/desktop/experiments/bg-tab-visibility
```

产物：stdout + 同目录 `result.json`。运行时会弹一个约 40 秒的窗口并自动关闭。
用独立 `userData`（在系统临时目录下），**不会**碰真实 app 的数据库与缓存。

**`result.json` 结构**：

```json
{
  "ok": true,
  "attachedGuests": 7,
  "results": {
    "<round>": {                      // round ∈ normal | minimized | restored
      "paintedTicks": 3,              // -1 = 该轮窗口没进入合成（此轮数据不可用）
      "focused": true,
      "data": {
        "<case>": {
          "case": "app-inactive",
          "probe": {
            "visibilityState": "visible",
            "hidden": false,
            "rafCount": 90,           // 1.5s 窗口内的 rAF 帧数
            "timerDelayMs": 305,      // setTimeout(300ms) 的实际触发延迟
            "elapsedMs": 1508
          }
        }
      }
    }
  }
}
```

**本目录不属于产品代码**，不参与 `node --test`，也不进入打包。
