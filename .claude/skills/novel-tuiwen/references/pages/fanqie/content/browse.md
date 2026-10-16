# browse — 浏览 / 搜索 / 进书详情

## 步骤

1. 打开 `https://kol.fanqieopen.com/page/content?tab_type=2&top_tab_genre=-1`
2. 切榜单：点 `.task-menu-second-item`（爆款榜/阅读榜/潜力榜）
3. 切频段：点 `.arco-radio-group` 内的 男频/女频
4. 搜书：往 `input.arco-input[placeholder="请输入作者名/书名/BookID"]` 输入（**受控组件**，见 `../../../common/arco-dom.md`）
5. 点卡片上的「**别名推广**」进书详情

## 输出

候选书目（书名 / 作者 / 题材 / 字数 / 评分 / BookID）→ 交给打分环节取 Top1-3。
