# publish-video — 抖音发布一条作品

## 页面锚点

```
https://creator.douyin.com/creator-micro/content/upload
├─ 上传入口：拖拽区（文本「点击上传」/「拖拽文件到这里」）或 button 上传
│   → browser_upload（filechooser 模式：clickSelector 点上传按钮自动投递本地文件）
├─ 标题/文案编辑器：div[contenteditable=true] 或 .notranslate（placeholder「填写作品标题…」）
│   → 受控 contenteditable：focus 后 document.execCommand('insertText', false, 文案)
├─ 话题：文案里输入 # 触发下拉（li 文本匹配）
├─ 「发布设置」区：谁可以看 / 定时发布 / 合集 …
│   └─「添加到合集」/「选择合集」入口（**有权限才显示**）
└─ 底部：button「发布」          ← confirm_user 确认后才点
```

## 发布按钮被悬浮层遮挡（2026-10-12 已解，无需人工）

底部「发布」常被悬浮提示条 / 权限气泡 / 上传进度遮罩盖住，点不到或点了不生效。
桌面端 `main.cjs` 的 click **已做遮挡感知 + 自动关层**：检测到按钮中心被盖住时，
先点遮挡层的关闭控件（`× / 关闭 / 取消`），找不到则退 `Esc`，再对真实按钮派发点击，
并返回 `occluded:true` + `covering` 信息。**不再依赖脆弱的坐标绕过。**

## 步骤（配方）

1. 点「发布」前用 `browser_get_page_content` 看附近有无悬浮层；
   若 `browser_click` 返回 `occluded:true` 或点下去没反应 →
   按 `Esc` / 点关闭按钮 / `browser_wait_for 2000` 等它消失后重试
2. 点「发布」后用 `browser_get_page_content` **轮询**「发布成功 / 已提交 / 等待审核」文案
   + 到「内容管理」确认视频在列表
3. ⚠️ **严禁再次 navigate 回上传页** —— 会重置流程、清空已填标题（之前反复踩的根因）
4. 坐标点击（x/y）仅当 index/selector 都失效且已确认坐标时作最后兜底，点后必须读状态复核

## 成功判据

跳转/出现「发布成功」提示 → 「内容管理」列表出现该视频。
