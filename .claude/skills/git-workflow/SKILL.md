---
name: git-workflow
description: Git 工作流助手。当用户要求"怎么合并冲突""帮我解决冲突""规范 commit""发 PR""cherry-pick""rebase"时触发。覆盖分支管理、合并冲突解决、commit 规范、PR 创建、cherry-pick、rebase、回滚等常用场景，含命令速查。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# Git 工作流（git-workflow）

Git 日常与进阶操作助手：分支、合并、冲突解决、commit 规范、PR、cherry-pick、rebase、回滚。给出可直接执行的命令，并解释每步含义。

## 何时触发

- 用户说"解决冲突""合并分支""规范 commit""帮我发 PR""cherry-pick""rebase 一下""回滚上一次提交"等
- 用户遇到 git 报错/冲突不知如何处理
- 用户想规范团队的 commit / 分支策略

## 常用场景

### 1. 合并冲突解决

```bash
git merge feature        # 产生冲突
# 编辑冲突文件，保留正确内容，删除 <<<<<<< ======= >>>>>>> 标记
git add <冲突文件>       # 标记已解决
git commit               # 完成合并
# 放弃合并：git merge --abort
```

冲突标记解读：
```
<<<<<<< HEAD
我的分支内容
=======
对方分支内容
>>>>>>> feature
```
保留哪段取决于业务意图，可两者都保留或选其一，删掉标记行。

### 2. commit 规范（Conventional Commits）

格式：`<type>(<scope>): <subject>`
type：feat / fix / docs / style / refactor / perf / test / chore / build / ci

```bash
git commit -m "feat(order): 新增订单导出"
git commit -m "fix(auth): 修复 token 过期未刷新"
```

### 3. 分支管理

```bash
git checkout -b feature/xxx   # 新建并切换
git branch -d feature/xxx     # 删除本地分支（已合并）
git push origin --delete feature/xxx  # 删除远程分支
git branch -a                 # 查看全部分支
git fetch --prune             # 同步并清理已删远程分支
```

### 4. rebase（保持线性历史）

```bash
git checkout feature
git rebase main              # 把 feature 的提交重放到 main 最新之上
# 冲突时：解决后 git add → git rebase --continue
# 放弃：git rebase --abort
git rebase -i HEAD~3         # 交互式：压缩/改顺序/改提交信息
```

### 5. cherry-pick（把某提交搬到当前分支）

```bash
git cherry-pick <commit-sha>
git cherry-pick A^..B        # 搬一段提交
# 冲突：解决后 git add → git cherry-pick --continue
```

### 6. 回滚

```bash
# 撤销工作区改动（未 add）
git checkout -- <file>
# 撤销暂存（已 add 未 commit）
git reset HEAD <file>
# 撤销最近一次 commit（保留改动在工作区）
git reset HEAD~1
# 安全回滚（新增一个反向提交，不改历史）
git revert <commit-sha>
```

### 7. 发 PR（gh CLI）

```bash
git push -u origin feature/xxx
gh pr create --title "feat: 订单导出" --body "## 改动\n- 新增导出接口" --base main
gh pr view --web            # 浏览器打开 PR
gh pr merge --squash        # 合并
```

### 8. 暂存与恢复

```bash
git stash                   # 暂存当前改动
git stash pop               # 恢复最近一次暂存
git stash list              # 查看暂存列表
```

## 常见报错处理

| 报错 | 原因 | 解决 |
|------|------|------|
| `Your local changes would be overwritten` | 切分支前有未提交改动 | `git stash` 或 commit |
| `non-fast-forward` | 远程有新提交 | 先 `git pull --rebase` |
| `fatal: refusing to merge unrelated histories` | 两分支无共同祖先 | `git pull --allow-unrelated-histories` |
| `Permission denied (publickey)` | SSH key 未配置 | 配置 ssh-keygen + 上传公钥 |

## 注意事项

- **rebase 会改写历史**：已 push 到公共分支的提交不要 rebase；个人 feature 分支可以
- **回滚优先用 revert**：公共分支用 reset 改历史会坑队友
- 解决冲突后一定 `git add` 标记已解决，否则冲突未真正解除
- commit 信息写"为什么"而非"做了什么"，subject 不超 50 字
- 大改动拆成多个小 commit，便于 review 和回滚
- 危险操作（force push / reset --hard）前先确认分支和备份