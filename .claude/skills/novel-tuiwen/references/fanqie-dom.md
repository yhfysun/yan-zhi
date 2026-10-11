# 番茄达人中心 · 表单填写 DOM 速查（别名创建 / 回填发文）

> 配套 `fanqie-dom-samples.md`（内容库/书详情的实抓样本）。
> ⚠️ 表单区类名同样带 hash 后缀会漂，**匹配策略统一：稳定类名前缀 + 文本 + 结构**，不写死 hash。
> ⚠️ 本文骨架基于 arco-design 组件规范 + 2026-10 实抓要点整理；**每次落地前先用 get_dom 复核一次**（抓取手段见文末）。

## 0. 表单通用规矩（arco-design）

- 输入框一律 `input.arco-input`（textarea 是 `textarea.arco-textarea`）。
- **受控组件**：直接设 value 不生效，必须 **原生 value setter + `dispatchEvent(new Event('input',{bubbles:true}))`**；回车提交用 keydown Enter（keyCode 13）。
- 按钮定位：`button.arco-btn`，**靠按钮内文本**（「确定」「提交」「批量创建别名」等）区分，别靠第几个按钮。
- 表单项容器：`div.arco-form-item`（label 在 `.arco-form-item-label`），**「按 label 文本找它右边/下边的输入框」是最稳的定位法**。
- 下拉选择（arco-select）：点开后选项在**挂到 body 的** `div.arco-trigger-popup > .arco-select-dropdown` 里，选项是 `li.arco-select-option`（文本匹配），**不在表单容器内**——get_dom 搜不到就往 body 尾部找。
- 开关/勾选：`button.arco-switch`（aria-checked）/ `label.arco-checkbox > input.arco-checkbox-target`。
- 错误提示：`.arco-form-item-message`（必填没填提交时会出），可作为「哪项没填对」的判据。

## 1. 别名管理页（申词记录 → 别名管理）

```
div#kol-content-box
└─ 工具条：input.arco-input（搜索）+ button「批量创建别名」「批量回填发文」「批量导出」
└─ 表格 div.arco-table
   ├─ 表头 th（书名/别名/别名状态/书籍状态/操作…）
   └─ 行 tr.arco-table-tr
      ├─ 别名状态单元格：生效中 / 待生效 / 已失效   ← 发文前提
      ├─ 书籍状态单元格：可用 / …                  ← 发文前提
      └─ 操作列 div.arco-space > button「回填发文」「查看」「删除」
```

- 状态判定：**别名状态=生效中 且 书籍状态=可用** 才可发文。
- 搜索别名/书名：工具条 input.arco-input（受控，同通用规矩）。

## 2. 「批量创建别名」弹窗

```
div.arco-modal（遮罩 div.arco-mask）
├─ .arco-modal-header > 标题「批量创建别名」
├─ .arco-modal-body
│  ├─ 书目信息（已带出，只读展示）
│  └─ 别名输入区：textarea.arco-textarea 或 input.arco-input
│     （一行一个 / 逗号分隔的关键词，3-5 字，如 狐王痴狂）
└─ .arco-modal-footer > button「确定」/「取消」
```

- 填法：textarea 受控同上；关键词 3-5 字、与书题材强相关。
- 提交后回到列表，**轮询行状态到「生效中」**才可进下一步（发文挂生效中别名）。

## 3. 「回填发文」抽屉（别名管理行内，arco Drawer）

```
div.arco-drawer（遮罩 .arco-drawer-mask）
├─ .arco-drawer-header（自动带出书名/别名）
├─ .arco-drawer-body
│  ├─ 发文类型选择（arco-select 或 arco-radio-group）   ← ⚠️ 必须与链接匹配，否则影响结算
│  ├─ 「抖音发文」区块
│  │  ├─ button/link「添加发文」                        ← 每点一次加一组表单
│  │  └─ 每组表单：
│  │     ├─ 抖音号 input.arco-input
│  │     └─ 视频链接 input.arco-input（短视频作品链接，不是小说链接）
│  └─ 提示文案区（新别名 7 天内不回填会失效 等）
└─ .arco-drawer-footer > button「提交」/「取消提交」
```

- **定位锚点**：抽屉内按钮/输入框同样用「文本 + input.arco-input」匹配；「添加发文」可能被点多次生成多组，**按组提交**（同一 div 容器内的两个 input 为一组）。
- ⚠️ 关闭：合成事件对 mask/Esc 无效 → **点「取消提交」按钮**关抽屉。
- 回填链接必须与「发文类型」匹配（官方页面原文警示）。

## 4. 落地前 get_dom 复核手法

```
browser_action { action:'get_dom', maxNodes:2500, depth:20,
                 selector:'arco-drawer' }      ← 回填抽屉
browser_action { action:'get_dom', maxNodes:2500, depth:20,
                 selector:'arco-modal' }       ← 别名创建弹窗
```

- 抓到后**先比对类名前缀是否漂移**，再照本文骨架定位。
- 点不动 / 找不到时：优先换「文本匹配」，其次 x/y 坐标点击兜底（同书详情目录项的做法）。
