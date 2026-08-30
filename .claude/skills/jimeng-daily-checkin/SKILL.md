---
name: jimeng-daily-checkin
description: 每天自动登录即梦（Dreamina，字节跳动 AI 创作平台）并签到领取灵感值/积分。当用户要求"即梦签到""即梦每天签到领积分""即梦灵感值签到""Dreamina 签到"时触发。首次需扫码登录，之后配合定时任务每日自动执行。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.1"
---

# 即梦每日签到领积分（jimeng-daily-checkin）

自动登录**即梦**（Dreamina，字节跳动 AI 图片/视频创作平台）并完成每日签到，领取灵感值/积分。

- 即梦官网：https://jimeng.jianying.com/
- 签到奖励：灵感值（用于生成图片/视频）

## 何时触发

- 用户说"即梦签到""即梦每天签到""即梦领积分""即梦灵感值""Dreamina 签到"等
- 用户要求每天自动签到即梦

## ⚠️ 重要约束（必须遵守）

- **目标站固定**：只访问 `https://jimeng.jianying.com/`，**禁止访问 dreamina.ai / dreamina.com 等国际版**（国际版为英文站、无中文签到入口，已多次导致失败）。
- **登录只走扫码**：检测到未登录 → `ask_user` 提示用户在浏览器面板扫码 → 等用户确认 → 复核已登录。**禁止代填手机号、禁止代填验证码**（验证码需用户手机接收，代填必死循环）。
- **登录态持久化**：BrowserView 使用 `persist:browser-view` partition，首次扫码登录后 cookie 落盘，后续签到（含定时任务）无需重复扫码，直到 cookie 过期。
- **定位用 get_dom**：登录弹窗可能在 iframe/Shadow DOM/深层 portal，用 `browser_get_dom`（depth:12, maxNodes:1000，已支持穿透）抓弹窗结构再定位，不要盲猜动态 hash class（如 `input-xrB84C`）。
- **终止条件**：同一选择器连续 miss 2 次即停止盲试，改用 `ask_user` 或 `browser_screenshot` 重新分析；坐标盲点击连续 3 次无页面变化即停止。

## 登录说明（重要）

即梦使用**抖音扫码登录**或**手机号验证码登录**，不是账号密码表单登录，因此 `browser_login_saved` 不适用。**优先走抖音扫码流程，不要代填手机号/验证码。**

pageAgent 处理登录的流程（弹窗扫码）：
1. `browser_navigate` 打开即梦首页（用户在浏览器面板可见页面）
2. `browser_get_page_info` 检查登录状态
3. 若未登录 → `ask_user` 弹窗提示"请在浏览器面板中扫码登录即梦，登录完成后点击确认"
4. 用户在可见的浏览器面板上扫码登录（或手机号验证码登录）
5. 用户在弹窗点击"确认"
6. `browser_get_page_info` 确认已登录 → 继续签到

登录态（cookie）会保留在浏览器会话中，后续签到无需重复扫码（除非 cookie 过期）。

## 标准流程

### 一次性签到（立即执行）

1. **委派 pageAgent**，依次执行：

2. **打开即梦首页**：
   ```
   browser_navigate { url: "https://jimeng.jianying.com/" }
   ```

3. **检查登录状态**：
   ```
   browser_get_page_info
   ```
   - 若页面有用户头像/昵称 → 已登录，跳到步骤 5
   - 若页面有"登录"按钮 → 未登录，继续步骤 4

4. **弹窗扫码登录**：
   ```
   ask_user { question: "请在浏览器面板中扫码登录即梦（或手机号验证码登录），登录完成后点击确认" }
   ```
   - 用户在浏览器面板可见的即梦页面上完成登录
   - 用户点击弹窗"确认"后继续
   - 再次 `browser_get_page_info` 确认登录成功

5. **查找签到入口**：
   - 用 `browser_get_page_info` 获取可交互元素
   - 找含"签到""打卡""领灵感""每日"等关键词的按钮/链接
   - 首页可能有签到弹窗/浮窗，或在个人中心

6. **点击签到**：
   ```
   browser_click { selector: "签到按钮选择器" }
   ```

7. **确认签到结果**：
   ```
   browser_get_visible_text
   ```
   - 查找"签到成功""已签到""获得 X 灵感值""连续签到 X 天"等文本
   - 若"今日已签到"→ 今天已签过，正常结束
   - 若有额外奖励（翻牌/抽奖）→ 按提示领取

8. **回报结果**：签到是否成功、获得多少灵感值、连续签到天数

### 周期性签到（每日自动执行）

1. 先手动执行一次确认流程能成功
2. 创建定时任务（scheduled_task）：
   - **cron 表达式**：`0 9 * * *`（每天上午 9 点）
   - **prompt**：`登录即梦网站 jimeng.jianying.com 并签到领取灵感值`
   - **绑定智能体**：默认助理（其会委派 pageAgent）
3. 系统每天 9 点自动启动会话执行签到
4. 注意：若 cookie 过期，pageAgent 会弹窗提示扫码，需用户手动扫码后继续

## pageAgent 工具速查

| 工具 | 用途 |
|------|------|
| `browser_navigate` | 打开即梦 URL |
| `browser_get_page_info` | 获取页面状态 + 可交互元素（找签到按钮/检查登录） |
| `browser_get_visible_text` | 获取可见文本（确认签到结果） |
| `browser_click` | 点击签到按钮/领取奖励 |
| `ask_user` | 弹窗提示用户扫码登录（等待用户确认后继续） |
| `browser_wait_for` | 等待签到弹窗/结果出现 |
| `browser_screenshot` | 截图（调试用） |

## 完整示例对话

### 示例 1：立即签到

用户："帮我签到即梦领灵感值"

执行：
1. 委派 pageAgent
2. `browser_navigate` { url: "https://jimeng.jianying.com/" }
3. `browser_get_page_info` → 检查是否已登录
   - 若已登录 → 跳到步骤 5
   - 若未登录 → 继续
4. `ask_user` { question: "请在浏览器面板中扫码登录即梦，登录完成后点击确认" }
   - 用户在浏览器面板扫码登录
   - 用户点击弹窗"确认"
   - `browser_get_page_info` 确认已登录
5. `browser_get_page_info` → 找"签到"按钮
6. `browser_click` { selector: "签到按钮" }
7. `browser_get_visible_text` → 确认"签到成功，获得 X 灵感值"
8. 回复"即梦签到完成，今日获得 X 灵感值，已连续签到 Y 天"

### 示例 2：每天自动签到

用户："帮我每天自动签到即梦"

执行：
1. 先按示例 1 手动签到一次，确认成功
2. 创建定时任务：cron `0 9 * * *`，prompt "登录即梦网站 jimeng.jianying.com 并签到领取灵感值"
3. 回复"已创建每日 9 点自动签到即梦的定时任务"

## 注意事项

- **扫码登录**：即梦用抖音扫码/手机号验证码登录，pageAgent 通过 ask_user 弹窗让用户在浏览器面板扫码
- **登录态保留**：登录后 cookie 保留在浏览器会话，后续签到无需重复扫码（除非过期）
- **登录态过期**：若 pageAgent 检测到未登录，会再次弹窗提示扫码
- **签到入口位置**：即梦可能调整 UI，用 `browser_get_page_info` 动态查找，不要硬编码选择器
- **今日已签到**：若提示"今日已签到"，属正常情况，不要重复点击
- **调试**：若找不到签到入口，用 `browser_screenshot` 截图查看页面实际内容再分析
- **失败处理**：单步失败时用 `browser_get_page_info` 重新分析页面状态，不要盲目重试
