---
name: web-task-automation
description: 用内置 pageAgent 驱动真实浏览器完成登录、签到、下载、上传、跨系统同步、填表、搜索、提交和周期网页任务。用户要求自动操作网站、处理文件下载或非标准表单时触发。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "2.0"
---

# 网站自动化任务（web-task-automation）

用内置 pageAgent 操作预览面板中的真实浏览器。复杂登录、非标准表单和点击无反应时，同时参考 `web-page-operation`。

## 工具面

pageAgent 已挂载完整的浏览器核心工具，不再只有六件套：

- 导航与读取：`browser_navigate`、`browser_wait_for`、`browser_get_page_content`、`browser_get_page_info`、`browser_get_visible_text`
- 操作：`browser_click`、`browser_type`、`browser_fill_form`、`browser_submit_form`、`browser_press_key`、`browser_scroll`
- 多标签：`browser_get_tabs`、`browser_new_tab`、`browser_switch_tab`、`browser_close_tab`
- 文件流转：`browser_download`、`browser_upload`
- 其他：`browser_screenshot`、`browser_get_api_data`、`browser_run_script`、`browser_run_recipe`

## 标准流程

1. 委派 pageAgent，一次说清目标站点、当前状态、要执行的动作和成功判据。
2. 首次导航只调用一次 `browser_navigate`。返回“页面未就绪”时用 `browser_get_tabs` / `browser_wait_for` / `browser_get_page_content` 等待，不要反复开页。
3. 用 `browser_get_page_content` 获取正文、表单状态和编号元素。两点及以上字段优先一次 `browser_fill_form`。
4. 用 `browser_submit_form` 或明确按钮提交，随后重新读页，按 URL、成功提示或表单消失判断结果。
5. 下载：点击导出/下载后读 `browser_click` 的 `downloaded` 回执；异步生成时调用 `browser_download` 不传参数查询。`state=completed` 且 `exists=true` 才算成功。
6. 上传：下载后先用 `file_read` / `office_read` / `python_exec` 校验内容，再用 `browser_upload` 上传目标系统，提交后回读结果。
7. 周期任务使用 `scheduled_task`，绑定日常办公助手，由它委派 pageAgent。

## 非标准上传

- 不要按标签判断：`div`、`span`、`role=button`、纯图标按钮都可能绑定文件 click 事件。
- 上传入口直接 `browser_upload({ clickSelector })`，不要先用 `browser_click` 打开原生文件框。
- 只有“上传”按钮、点击后弹系统文件框：传 `clickSelector` / `clickIndex`，走 filechooser 拦截。
- 有隐藏或多个 `input[type=file]`：按文件名附近的文案和 `accept` 选准 index；Shadow DOM、iframe 内也会扫描。
- 自定义拖拽区、只有“拖文件到这里”：传 `dropSelector` / `dropIndex`，由工具发送真实本地文件 dragenter/dragover/drop。
- 第三方网盘或云文档 picker：先确认文件选择器是否在 iframe 内；需要 OAuth/人工选择时 `ask_user`。
- 不要用 JavaScript 伪造 `File` 再调页面接口；浏览器安全边界会让它看起来成功、实际没有本地文件内容。

## 办公文件流转场景

- 报表下载 -> 数据校验 -> 上传财务/ERP 系统 -> 回读更新条数。
- 工单导出 -> 去重/筛选 -> 导入客服系统 -> 报告新增、更新和失败数量。
- 银行流水下载 -> 与业务台账对账 -> 上传差异清单 -> 保存回执。
- 发票/合同下载 -> OCR 或结构化读取 -> 供应商门户/报销系统填表 -> 回读提交结果。
- CRM 客户名单导出 -> 清洗去重 -> 导入另一个 CRM/营销系统 -> 核对同步数量。
- 采购订单下载 -> 核对状态 -> 更新库存/供应商系统 -> 返回源文件路径和结果。

固定闭环：下载 -> 验证文件存在与内容 -> 上传 -> 提交 -> 回读成功证据 -> 报告文件路径和更新条数。

## 权限

只读权限允许导航、读页、等待和截图。点击、输入、填表、提交首次调用会弹授权卡，这是正常流程，不是“浏览器不可用”。用户拒绝后不要重试同一调用，改为说明原因或换只读方案。

## 安全边界

二维码、短信验证码、滑块、二次验证、支付和用户密码由用户本人在浏览器面板完成。pageAgent 不代填验证码，不越过资金操作红线。
