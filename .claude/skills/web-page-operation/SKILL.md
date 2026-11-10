---
name: web-page-operation
description: 网页登录与非标准页面操作。用户登录非标准表单网站、遇到扫码/短信/OAuth/SSO、自定义下拉、iframe、Shadow DOM、弹窗或点击无反应时触发。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# 网页登录与页面操作（web-page-operation）

目标是把页面任务交给 pageAgent 时，不让权限、冷启动或控件差异被误判成“浏览器进不去”。

浏览器唯一执行入口是 pageAgent。其他智能体只负责把任务描述清楚并委派，不直接持有或调用 `browser_*`。

## 先分层判断

1. 权限：只读会话可直接导航、读页、截图、等待；点击、输入、填表、提交首次会弹授权卡。
2. 冷启动：首次打开预览面板可能较慢。同一 URL 只导航一次，未就绪时等待并复用已有标签。
3. 页面结构：先用 `browser_get_page_content`，按 index 操作；不要猜 hash class。
4. 登录类型：区分账号密码、二维码、短信、OAuth/SSO、iframe 和 Shadow DOM。

## 非标准登录

1. 打开页面后等待登录表单或登录入口出现。
2. 原生输入框优先一次 `browser_fill_form`；受控组件失败时改为 `browser_click` + `browser_type`，并回读字段值。
3. 自定义下拉或组件库控件先点开，再重新读取页面并点击选项 index；不要对伪 select 调用原生下拉工具。
4. 二维码、短信验证码、滑块、二次验证和密码由用户接管。使用 `ask_user` 说清楚要用户完成哪一步。
5. 用户确认后重新读取页面，以 URL 离开登录页、出现头像/工作台或成功提示作为登录成功证据。

## 非标准表单

- 多字段一次 `browser_fill_form`，按返回的 state 回读核验。
- 富文本用 contenteditable 字段；联动下拉先填上游，再等下游出现。
- 弹窗、抽屉、portal、iframe 和 Shadow DOM 里的元素以最新编号为准。
- 校验提示连续出现两次仍未消失时停止重试，引用提示原文并报告卡住字段。

## 文件下载与上传

- 点击导出/下载后先看 `browser_click` 回执的 `downloaded`；异步生成时用 `browser_download` 不传参数查看最近记录。
- 成功判据是 `state=completed` 且 `exists=true`；`progressing` 继续等待，`cancelled/interrupted` 按失败处理。
- 下载路径拿到后先用文件工具校验内容，再用 `browser_upload` 上传到另一个系统，提交后回读成功提示或更新条数。
- 非标准上传：只有按钮时用 `clickSelector/clickIndex`；自定义拖放区用 `dropSelector/dropIndex`；隐藏 input、Shadow DOM、iframe 内的 input 由工具扫描后按 index 精确投递。

## 委派模板

`call_agent { agentId: "a_builtin_page_agent", input: "目标站点：...；当前页面/登录状态：...；要完成的动作：...；成功判据：...；遇到扫码/验证码/滑块请先 ask_user，由用户接管" }`
