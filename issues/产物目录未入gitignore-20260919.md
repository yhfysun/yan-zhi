# `.yan-zhi/` 只在本机 exclude 中忽略，未写入 .gitignore

- **状态**：✅ **已解决**（2026-10-08 核实：`.gitignore:220` 已有 `.yan-zhi/`，`git check-ignore` 命中）
  → 本条可删（保留仅为记录"为何加这条规则"的背景）
- **严重度**：medium
- **发现日期**：2026-09-19

## 现象

产物目录 `.yan-zhi/` 在本机能被 git 正确忽略，但这条规则**只存在于本机私有文件**
`.git/info/exclude`，项目 `.gitignore` 里没有。

## 根因

```
.git/info/exclude 第 7 行：.yan-zhi/
.gitignore 中：无任何 .yan-zhi 规则
```

`.git/info/exclude` 是**本机私有**的（不入库、不随 clone 分发）。
因此换一台机器、或他人重新 clone 后，`.yan-zhi/` 不再被忽略。

## 影响面

- 新克隆的仓库里，产物目录（含用户生成的图片、上传文件、中间产物）
  会**进入版本控制**：`git status` 出现大量未跟踪文件，误 `git add -A` 会把
  用户数据提交进仓库。
- 产物目录体积不小（单张生成图 1.4~6.1MB），一旦入库会显著膨胀仓库。
- 属「安静的坑」：本机开发完全无感，只在别的机器上爆。

## 复现步骤

1. 在另一台机器 clone 仓库（或删除本地 `.git/info/exclude` 中该行）。
2. 运行应用、生成一个产物。
3. `git status` → `.yan-zhi/` 及其内容出现在未跟踪列表里。

## 修复方向

在项目根 `.gitignore` 的「运行时数据」段补一条：

```gitignore
# 产物目录（.yan-zhi/tasks/<会话id>/{uploads,intermediate,deliverables}）
# 规范化产物落盘位置，绝不应入库（含用户生成的图片/文件）
.yan-zhi/
```

补完后可顺手清理 `.git/info/exclude` 里的同名行（避免两处规则重复、日后漂移）。

## 备注

本次排障已确认 `.gitignore` 里**有** `dist-release-*/` 通配（构建产物），
但产物目录这条确实缺失 —— 两者是不同的目录，不要混淆。