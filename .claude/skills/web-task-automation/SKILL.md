---
name: web-task-automation
description: 用内置 pageAgent 驱动真实浏览器完成网站自动化任务（登录、签到、领积分、填表单、搜索、翻页、提交、制作内容等）。当用户要求"每天签到领取积分""自动登录某网站做某事""用 AI 视频站输入文案制作视频"等需要操作网页的周期性或一次性任务时触发。结合浏览器记住密码能力，可自动登录已保存凭证的站点，把任务交给大模型执行。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# 网站自动化任务（web-task-automation）

用内置 **pageAgent**（浏览器自动化专家）驱动真实浏览器，完成登录、签到、领积分、填写表单、搜索、翻页、提交、制作内容等网站操作任务。配合「浏览器记住密码」能力，可自动登录已保存凭证的站点；配合「定时任务」（scheduled_task）可每日自动执行。

## 何时触发

- 用户要求在某个网站自动执行操作：登录、签到、领取积分/奖励、填写并提交表单、搜索、翻页采集、输入文案生成视频/图片等
- 用户要求"每天/定期"执行上述任务（结合定时任务）
- 用户说"帮我签到""自动登录 XX 做 YY""每天领积分""用 XX 网站生成视频"等

## 前置条件

1. **pageAgent 已挂载**：默认助理已通过 `call_agent` 委派 pageAgent（内置浏览器自动化智能体）
2. **目标站点密码已保存**：若任务需要登录，先让用户在「浏览器 → 密码管理」中保存该站点的账号密码（域名、用户名、密码）。pageAgent 通过 `browser_login_saved` 自动登录
3. **Playwright 已安装**：服务端需安装 playwright 并下载 chromium（`pnpm add playwright && npx playwright install chromium`）

## 标准流程

### 一次性任务（立即执行）

1. **理解任务**：明确目标网站、要执行的操作、期望结果
2. **登录**（若需要）：调用 `call_agent` 委派 pageAgent，让其用 `browser_login_saved`（传 host 或 url）自动登录
   - 若报"未找到凭证"，停止并提示用户先在浏览器密码管理保存该站点密码
3. **执行操作**：pageAgent 依次使用浏览器工具完成任务
4. **回报结果**：返回任务执行摘要（成功/失败、关键信息）

### 周期性任务（每日/定期执行）

1. 先按一次性任务流程确认能成功执行一次
2. 创建定时任务（scheduled_task）：
   - cron 表达式或间隔分钟数（如每天 9 点：cron `0 9 * * *`）
   - prompt：描述任务（如"登录 XX 视频站，签到领取积分，若积分足够则用文案'XX'制作一个视频"）
   - 绑定智能体：默认助理（其会委派 pageAgent）
3. 系统到点自动启动会话执行 prompt

## pageAgent 工具速查

| 工具 | 用途 |
|------|------|
| `browser_login_saved` | 用已存密码自动登录站点（传 host 或 url） |
| `browser_navigate` | 导航到 URL |
| `browser_get_page_info` | 获取 url/title/可交互元素摘要，理解页面状态 |
| `browser_get_visible_text` | 获取干净可见文本 |
| `browser_fill_form` | 批量填表单（text/select/checkbox/radio） |
| `browser_search` | 页面搜索（自动识别搜索框） |
| `browser_click` / `browser_type` / `browser_press_key` | 单步点击/输入/按键 |
| `browser_select_option` / `browser_check` / `browser_uncheck` | 下拉选择/勾选 |
| `browser_submit_form` | 提交表单（等导航） |
| `browser_next_page` / `browser_prev_page` | 翻页（自动识别"下一页"） |
| `browser_wait_for` | 智能等待（元素/URL/文本出现） |
| `browser_screenshot` | 截图（调试用） |

## 示例任务

### 示例 1：每日签到领取积分

用户："帮我每天登录 XX AI 视频站签到领取积分"

步骤：
1. 确认用户已在浏览器密码管理保存 XX 站点凭证
2. 委派 pageAgent：
   - `browser_login_saved` { host: "xx-video.com" }
   - `browser_get_page_info` → 找"签到"按钮
   - `browser_click` { selector: "签到按钮选择器" }
   - `browser_get_visible_text` → 确认"签到成功/获得 X 积分"
3. 创建定时任务：cron `0 9 * * *`，prompt "登录 xx-video.com 签到领取积分"

### 示例 2：输入文案制作视频

用户："用 XX 视频站，输入文案'一只在月球上弹吉他的猫'，制作一个视频"

步骤：
1. 确认凭证已保存
2. 委派 pageAgent：
   - `browser_login_saved` { host: "xx-video.com" }
   - `browser_navigate` { url: "创作页 URL" }（或从首页找"创作"入口点击）
   - `browser_get_page_info` → 找文案输入框、生成按钮
   - `browser_fill_form` { fields: [{ selector: "文案框", value: "一只在月球上弹吉他的猫" }] }
   - `browser_click` { selector: "生成按钮" }
   - `browser_wait_for` { text: "生成完成", timeout: 30000 }
   - `browser_get_page_info` → 找下载/分享链接
3. 回报：视频已生成，链接/下载方式

### 示例 3：搜索并翻页采集

用户："在 XX 站搜索'AI 教程'，把前 3 页结果标题给我"

步骤：
1. 委派 pageAgent：
   - `browser_navigate` { url: "XX 站首页" }
   - `browser_search` { query: "AI 教程" }
   - `browser_get_visible_text` → 第 1 页结果
   - `browser_next_page` → 第 2 页
   - `browser_get_visible_text`
   - `browser_next_page` → 第 3 页
   - `browser_get_visible_text`
2. 汇总返回前 3 页标题

## 注意事项

- **凭证安全**：密码加密存储，pageAgent 只通过 `browser_login_saved` 间接使用，不会在对话中泄露明文
- **登录失败**：若 `browser_login_saved` 报"未找到登录表单"，可能已登录或页面结构特殊，用 `browser_get_page_info` 检查当前状态
- **选择器不确定**：优先用 `browser_get_page_info` 获取可交互元素摘要，据此构造选择器
- **等待**：页面加载/异步内容用 `browser_wait_for`（等元素/文本），避免固定 sleep
- **验证**：关键操作后用 `browser_get_page_info` 或 `browser_get_visible_text` 确认结果
- **失败重试**：单步失败时，用 `browser_get_page_info` 重新分析页面状态再调整，而非盲目重试