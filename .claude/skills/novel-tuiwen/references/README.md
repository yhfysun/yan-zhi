# references

| 路径 | 说明 |
|------|------|
| [platform-specs.md](./platform-specs.md) | 各平台画幅规范与 `aspect` 取值 |
| [pipeline.md](./pipeline.md) | 出片产线：`novel_tuiwen` 参数、标题条/字幕、ffmpeg 坑、TTS、依赖 |
| [common/arco-dom.md](./common/arco-dom.md) | arco-design 站点通用表单规矩（受控输入、日期选择器、抽屉/弹窗、get_dom 复核） |
| [pages/fanqie/](./pages/fanqie/) | 番茄达人中心：[总览+全站骨架](./pages/fanqie/index.md) / 内容库 / 书详情 / 别名管理（含回填） |
| [pages/kuaishou/](./pages/kuaishou/) | 快手创作者平台：发布作品 / 作品管理 |
| [pages/douyin/](./pages/douyin/) | 抖音创作者平台：发布页·合集 / 引导评论 |

## 结构约定

```
pages/<平台>/<页>/index.md         何时用 / 展示 / 公共说明 / 操作文件表
pages/<平台>/<页>/<操作>.md        输入 / 步骤 / 页面锚点 / 输出 / Browser 操作
```

加载顺序：SKILL 场景表 →（平台）→ `index.md` → `{操作}.md` →（需要时）`common/arco-dom.md`。

⚠️ 页面文档里的选择器**都会漂**（arco CSS Modules / 抖音 React hash）。
统一口径：优先「**文本 + placeholder + `[class*=前缀]`**」，**不写死 hash**；
落操作前先 `browser_get_dom` / `browser_get_page_content` 实抓复核一次。
