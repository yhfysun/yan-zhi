# arco-design 表单通用规矩（番茄达人中心等 arco 站点共用）

> 适用：`kol.fanqieopen.com`（番茄达人中心）等 arco-design 站点。
> ⚠️ **类名带 hash 后缀会漂**（`form-CC3r5p`、`base-info-IVRg8K`）→
> 匹配策略统一：**稳定类名前缀（`[class*=xxx]`）+ 文本 + 结构**，**不写死 hash**。

## 控件定位

- 输入框一律 `input.arco-input`；多行是 `textarea.arco-textarea`。
- **受控组件**：直接设 `value` 不生效，必须
  **原生 value setter + `dispatchEvent(new Event('input',{bubbles:true}))`**；
  回车提交用 `keydown` Enter（keyCode 13）。
- 按钮定位：`button.arco-btn`，**靠按钮内文本**（「确定」「提交」「批量创建别名」…），
  **别靠"第几个按钮"**。
- 表单项容器：`div.arco-form-item`（label 在 `.arco-form-item-label`）→
  **「按 label 文本找它右边/下边的输入框」是最稳的定位法**。
- 下拉（arco-select）：选项**挂到 body** 的 `div.arco-trigger-popup > .arco-select-dropdown`，
  选项是 `li.arco-select-option`（文本匹配），**不在表单容器内** —— get_dom 搜不到就往 body 尾部找。
- 开关/勾选：`button.arco-switch`（`aria-checked`）/ `label.arco-checkbox > input.arco-checkbox-target`。
- 错误提示：`.arco-form-item-message`（必填没填、提交时出现）→ 可作「哪项没填对」的判据。

## 日期选择器（arco DatePicker）—— 高频坑

**只往输入框里 route 文本不会提交到表单状态**，提交时校验会把日期重置为空并报「必填」。
正确做法：**点开面板 → 点具体日格**（让面板回填值），或键入后 **按 Enter** 提交。

## 抽屉 / 弹窗

- 抽屉 `div.arco-drawer`（遮罩 `.arco-drawer-mask`）；弹窗 `div.arco-modal`（遮罩 `.arco-mask`）。
- ⚠️ **合成事件对 mask / Esc 无效** → 关抽屉要点它自己的**「取消」/「取消提交」按钮**。
- ⚠️ **抽屉不存草稿**：刷新 = 已填内容全清空。中断接手时**先只读**看现状，**绝不刷新**。

## get_dom 复核手法

```
browser_get_dom { maxNodes:2500, depth:20, selector:'arco-drawer' }   ← 回填抽屉
browser_get_dom { maxNodes:2500, depth:20, selector:'arco-modal' }   ← 别名创建弹窗
```

- 抓到后**先比对类名前缀是否漂移**，再按页面文档的骨架定位。
- 点不动 / 找不到时：**优先换「文本匹配」**，其次 x/y 坐标点击兜底。
- 左栏目录很长的页（书详情 60+ 章）整页 get_dom 会被目录吃掉节点配额（800 不够）→
  **用 selector 定位容器**或 maxNodes≥2500。
