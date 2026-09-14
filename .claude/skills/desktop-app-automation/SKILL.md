---
name: desktop-app-automation
description: 用「电脑使用」(computer-use) 插件操作本机桌面应用（微信/QQ/钉钉/邮件客户端/文件管理器等任意有窗口的软件），以及系统级维护（安装/卸载应用、强制删除残留、注册表清理）。当用户要求"发微信 / 操作某个软件 / 帮我操作电脑 / 卸载应用 / 安装应用 / 删不掉的文件 / 清理注册表"等时触发。通用 SOP：找窗口→激活→核对操作对象→截图定位→按钮优先提交→截图核验；不写死任何路径，应用与路径先用工具扫出来；高危系统操作必须先经用户确认。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "2.0"
---

# 桌面应用自动化（desktop-app-automation）

用 computer-use 插件（鼠标/键盘/窗口/截屏）操作本机**任意桌面应用**，并可做系统级维护。

- 适用：操作微信/QQ/钉钉/邮件客户端/文件管理器/记事本等有窗口的软件；安装/卸载应用；清理卸载残留
- 不适用：企业微信/飞书/钉钉机器人消息——那些走 im 连接器（`api_im_send`）；浏览器内网页操作优先委派 pageAgent

## 核心原则：不写死任何路径

**换一台电脑也能跑**：应用叫什么、装在哪、什么版本，一律先用工具扫出来，禁止猜路径、禁止硬编码 `C:\Program Files\...`：

```
computer_list_installed_apps { nameFilter: "微信" }   // 已装应用：名称/版本/安装目录/exe 路径
computer_list_processes { nameFilter: "Weixin" }       // 正在运行的进程
computer_list_windows { processName: "Weixin" }        // 有窗口的：pid + 标题 + 矩形
```

## 通用 SOP（每步截图核验，禁止盲点盲按）

0. **前提**：「插件管理」页已启用电脑使用插件；目标应用已登录（登录/扫码/验证码一律请用户自己完成，禁止代操作）；锁屏先唤醒解锁。
1. **找窗口**：`computer_list_windows` 拿 pid；进程名可从 list_processes/list_installed_apps 得到（不同应用不同：微信 4.x=Weixin，3.x=WeChat）。
2. **激活**：`computer_activate_window { pid }`。
3. **核对操作对象（必做，防误操作）**：`computer_screenshot` + `image_analyze` 确认"当前窗口/当前会话/当前文档"与用户目标一致——聊天应用=防发错群（群名逐字核对），文件操作=防删错目录；有歧义 `ask_user` 与用户确认。
4. **定位与操作**：元素位置以截图+image_analyze 识别为准，禁止盲猜坐标；同一元素连续失败 2 次即停下说明，换思路或问用户。
5. **提交/发送**：**优先点界面按钮**（「发送」「提交」「保存」「确定」）；快捷键作备选——语义因应用和用户设置而异（见速查表）。
6. **结果核验（必做）**：再截图确认生效（消息气泡出现/文件状态变化/对话框关闭）；失败重试一次，仍失败换方式或如实报告。
7. **回报**：做了什么 + 结果证据 + 异常。

## 提交快捷键速查（因应用而异，勿混用）

| 场景 | 发送/提交方式 | 备注 |
|------|--------------|------|
| 微信 | 绿色「发送(S)」按钮 或 Ctrl+Enter | 默认**不开**「回车键发送」→ 单独 Enter 无效（实测踩坑）；Shift+Enter 是换行 |
| QQ | Ctrl+Enter 或「发送」按钮 | 可在设置改 |
| 通用表单/对话框 | Enter 或「确定」 | Enter 可能只是切换焦点，先截图识别 |
| 编辑器 | Ctrl+S 保存 | 无发送概念 |

拿不准时：先点按钮；按钮灰/不可见再用快捷键，然后截图核验。

## 系统管理操作（高危，必须先经用户确认）

| 工具 | 用途 | 关键护栏 |
|------|------|----------|
| `computer_uninstall_app` | 卸载应用（winget 静默优先，注册表卸载串兜底） | 先 list_installed_apps 查确切名称 → confirm_user → confirm: true |
| `computer_install_app` | 安装应用（winget 推荐；.msi 静默；.exe 必须传确认过的静默参数） | 来源须用户认可；.exe 参数不确定就改 winget 或让用户手动装 |
| `computer_force_delete` | 强删删不掉的残留文件/目录（takeown+icacls 接管） | 单个绝对路径、禁通配符、禁系统目录与用户根目录；**不可恢复（不进回收站）** |
| `computer_registry_delete` | 删除注册表残留键/值 | 删前自动导出 .reg 备份（误删可双击恢复）；禁 SYSTEM/SAM 等关键子树 |

标准动作：`computer_list_installed_apps` 查清单 → `confirm_user` **逐项列出**将执行的操作与影响 → 用户同意后才传 `confirm: true` 执行 → 执行后用 list_installed_apps / list_processes 复核。

## 纠错时效（第一时间处理）

- 微信消息发出后 **2 分钟内**可右键气泡「撤回」；超时无法撤回，如实告知，不谎报
- 普通文件删除进回收站可还原；`computer_force_delete` 不可恢复——删前列路径给用户确认
- 卸载后残留的安装目录/注册表键，可 `computer_force_delete` + `computer_registry_delete` 组合清理

## 安全红线

- **资金操作**（红包/转账/支付/收款确认）一律只提醒用户（截图告知），禁止代点、代转、代付
- 密码/验证码/证件号等敏感信息不写入要发送的内容
- 用户已明确指定的操作直接执行；未指定内容的发送/删除/支付/群发等，先确认再动
- 应用 UI 随版本变化：一切以截图+image_analyze 识别为准；同一元素连续失败 2 次即停下向用户说明

## 工具速查

| 工具 | 用途 |
|------|------|
| `computer_list_installed_apps` | 已装应用清单（名称/版本/安装目录/exe）——找应用的第一个入口 |
| `computer_list_processes` / `computer_list_windows` | 运行中进程 / 可见窗口（拿 pid） |
| `computer_activate_window` | 前置激活目标窗口 |
| `computer_screenshot` + `image_analyze` | 截屏识别（你看不到画面，必须靠它核对每一步） |
| `computer_mouse_click` / `computer_type` / `computer_press_key` | 点击 / 输入 / 快捷键 |
| `computer_open_app` | 启动应用（已在运行则激活） |
| `computer_uninstall_app` / `computer_install_app` | 卸载 / 安装（需确认） |
| `computer_force_delete` / `computer_registry_delete` | 强制删除 / 注册表清理（需确认） |
| `ask_user` / `confirm_user` | 对象有歧义询问 / 高危操作确认 |

## 实例（源自实测：微信群发「你好」）

1. `computer_list_windows { processName: "Weixin" }` → pid
2. `computer_activate_window { pid }`
3. 截图+识别 → 当前会话群名与目标一致（不一致先搜索定位）
4. 点输入框 → `computer_type { text: "你好" }` → 截图确认按钮变绿
5. 点绿色「发送(S)」按钮（按 Enter 无效——用户未开启回车发送）
6. 截图核验 → 绿色气泡出现、输入框清空
7. 回报："已发送到群「XXX」并核验成功"

> 若先按了 Enter 未发送：不要反复试，直接改点「发送(S)」按钮。
