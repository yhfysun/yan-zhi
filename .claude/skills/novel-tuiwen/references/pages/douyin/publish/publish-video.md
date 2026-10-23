# publish-video — 抖音发布一条作品

> 站点：`creator.douyin.com` ｜ 上传页：`/creator-micro/content/upload`
> 依据：2026-10-14 ~ 10-19 多集实战（含 10-19 描述框反复清空事故）

## 首选：一行配方（2026-10-19 起）

工具列表里有 `browser_run_recipe` 时，**优先用它**，不要自己逐页操作：

```text
browser_run_recipe {
  recipe: 'douyin-publish-video',
  params: {
    videoPath: '<成片绝对路径>',
    title: '<标题>',
    description: '<描述正文>',
    collectionName: '<合集名，可选>',
    submit: true   // 只有用户明确要求发布时才传；默认 false 只上传+填表
  }
}
```

- 配方内部完成：导航 → filechooser 上传 → 等转码 → 一次填表（幂等）→ 可选选合集 → 可选点发布 → 验证成功。
- 返回 `readyToSubmit:true`（submit=false 跑完）时：用户确认后**直接 `browser_click` 页面上的「发布」**；
  **不要重新运行配方** —— 会重新上传视频并重置表单。
- 返回 `blockedByVerification:true`（滑块/验证码）时，按**验证交接**处理：
  1. 立即 `ask_user`：「请在浏览器面板完成滑块/验证码，完成后回复继续」；
  2. 用户确认后，再次调用 `browser_run_recipe`，**params 保持不变**，并加上返回的 `resumeStep`；
  3. 续跑只执行验证之后的步骤（发布已点过就只等结果），**不会重新上传/填表/重复点发布**；
  4. 若续跑仍返回 `blockedByVerification`，说明验证还没完成，再次请用户处理，不要换脚本硬试。
- 返回失败步骤与页面现场时：**不要重复运行同一配方**。先按失败原因处理（补登录 / 等上传完成 / 换参数），仍不行就向用户报告。
- 配方不可用或站点改版时，才走下面的手动步骤。

## 封面 + 发布：三步调用（2026-10-23 起）

手工逐页点实测「上传 15 分 / 封面 7.5 分」，现在固定为三次调用，不要自己找封面弹窗：

```text
① browser_run_recipe { recipe:'douyin-publish-video', params:{ videoPath, title, description, collectionName?, submit:false } }
② 有封面图时：browser_run_recipe { recipe:'douyin-set-cover', params:{ coverPath } }
③ browser_click 页面上的「发布」   // 不需要自定义封面时，①直接传 submit:true 一步到底
```

- `douyin-set-cover` 必须在**同一个已上传页面**调用；失败就放弃封面直接进 ③，
  **绝不重跑 ①**（会重新上传并重置表单）。
- 封面图规格：4:3 成片用 1080×1440，9:16 用 1080×1920（见 `references/cover-recipes.md`）。
- 封面弹窗的锚点尚未逐版实抓（2026-10-23 首版配方），首次使用若卡在「选择封面」入口，
  按回执提示放弃封面并如实报告，不要换脚本硬试。

## 输入参数

- `videoPath`：本地成片 `.mp4`（`novel_tuiwen` 产物）
- `title`：作品标题（≤ 30 字，带别名关键词，**禁书名**）
- `description`：描述正文（≤ 1000 字，带别名关键词 + 引导语，可含 `#话题`）
- `collectionName`：**系列任务（≥2 集 / 同一本书连发）首集必填** —— 第一集发布时就要创建并选中合集；
  单集一次性任务才可留空。**不要先发完再补归集**（第 1 集不进合集 → 主页「第N集」从开头就断）
- `submit`：是否点「发布」；**默认必须经 `confirm_user` 确认**

## 页面锚点（实抓，改版时以 `browser_get_page_content` 复核为准）

```
https://creator.douyin.com/creator-micro/content/upload
├─ 上传区：文本「点击上传」/「拖拽文件到这里」或 button
│   → browser_upload（filechooser 模式：clickSelector 点上传按钮投递本地文件）
├─ 标题：input[placeholder*="填写作品标题"]（上传页仅 1 个 input[type=text]）
│   计数器「0 / 30」在 editor-kit-root-container 内
├─ 描述：.zone-container.editor-kit-container
│   contenteditable=true（Draft.js）｜计数器「N / 1000」在右侧 toolbar
├─ 上传状态：正文出现「已上传：… 剩余时间：…」→「上传成功 / 重新上传」
├─ 合集入口：文本「选择合集」/「添加到合集」（有权限才显示）
└─ 发布按钮：底部 button 文本「发布」（文本可能不唯一，用容器收窄或编号定位）
```

⚠️ **计数器不可信**：标题/描述计数器会与字段真实值不同步（实测标题 22 字显示 `0/30`）。
回读一律以 `input.value` / `innerText` 为准，**禁止拿计数器反推内容**。

## 填表协议（P0，2026-10-19 起强制）

1. 只调**一次** `browser_get_page_content` 确认锚点；不要每一步都读全页。
2. **一次 `browser_fill_form` 同时填标题与描述**：

   ```text
   fields = [
     { selector: 'input[placeholder*="填写作品标题"]', value: title },
     { selector: '.zone-container.editor-kit-container', value: description }
   ]
   ```

3. 以返回的 `state` / `applied` 为准：**包含目标文本即视为成功**，不要为了“完全相等”再填一遍。
4. **禁止**用 `browser_run_script` 做 `selectAll → delete → insertText` 的“清空重填”。
   富文本反复清空会让 Draft.js 内部 model 与 DOM 不同步，产出重复前缀
   （实测「拜师那天拜师那天，师父递给我…」），越填越乱。
5. 若 `applied:false`：只允许换一次选择器重试；仍失败就停止，回读当前值并报告。
6. 若返回 `forceStop:true`（同字段连续 2 次未生效）：**立即停止重填**，不要换脚本继续试，
   向用户报告“描述框无法写入”及当前值，由用户决定手填或换方案。

## 步骤（确定性配方）

1. `browser_navigate` 上传页（一次到位，别先开空 tab）
2. `browser_upload` 投递 `videoPath`：
   - `clickSelector` 指向上传按钮/拖拽区（优先 selector，别依赖易漂移的 index）
   - 等待正文出现「上传成功 / 重新上传」，且**没有**「上传中 / 转码」
3. `browser_fill_form` 填标题 + 描述（见上面的协议）
4. **合集（系列任务首集必建，不是可选项）**：
   - 点「选择合集」/「添加到合集」；列表里**已有** `collectionName` → 选中
   - **没有** → 点「创建新合集」→ 名称填 `collectionName`（=别名，≤20 字；有 1:1 封面就传 1080×1080 ≤5MB）
     → 创建并选中（合集审核 1–3 小时，不影响本集发布）
   - 页面确认已显示所选合集名，再进下一步；**没选上合集不得点发布**（单集任务除外）
   - 入口整页搜不到 → 按 `collection.md` 四层排查（实名 / 手机号 / 权限申请）；仍不行就**截图报告用户**，
     不要静默跳过合集直接发布
5. `confirm_user` 确认 → 点底部「发布」
6. 轮询成功判据（见下）；**严禁再 navigate 回上传页** —— 会重置流程、清空已填内容
7. 取 `aweme_id` / 作品链接 → 发引导评论（见 `../comment/post-comment.md`）

## 成功判据

1. URL 离开 `/content/post/video`，或页面出现「发布成功 / 已提交 / 等待审核」类文案
2. 「内容管理」列表出现该作品
3. 合集已选中时，`/web/api/mix/item/list/` 能查到该 `aweme_id`

> 只读核验优先用页面内 `fetch`（`credentials:'include'`）：`/web/api/mix/list/`、
> `/web/api/mix/detail/`、`/web/api/mix/item/list/`，比反复读 DOM 稳定。

## 常见坑

- **描述框重复前缀**：见「填表协议」第 4、6 条；出现重复就按失败处理，不要继续清空。
- **上传中途导航**：上传/转码期间 navigate 或刷新会丢失整个表单，只能重传。
- **发布按钮被遮挡**：`browser_click` 已做遮挡感知（返回 `occluded:true`）；按 `Esc` 或点关闭层后再点。
- **微前端假死**：预览面板收起时页面可能停在「加载中，请稍候...」；让用户展开面板后再操作。
- **「继续编辑/放弃」弹窗**：离开编辑页时出现，选「继续编辑」，否则已填内容全部丢弃。
- **严禁坐标硬点**：仅当 index/selector 都失效且已确认坐标时兜底，点后必须回读复核。
