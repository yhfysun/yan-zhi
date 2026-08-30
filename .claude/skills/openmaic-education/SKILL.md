---
name: openmaic-education
description: 对接清华 AIR（智能产业研究院）OpenMAIC 教育 AI 开源平台。当用户要求"智能出题""学情分析""个性化学习路径""自动批改""对接 OpenMAIC"时触发。指导部署和使用教育领域 AI 能力。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# OpenMAIC 教育 AI（openmaic-education）

对接清华大学智能产业研究院（AIR）主导的 **OpenMAIC** 开源教育 AI 平台，覆盖智能出题、学情分析、个性化学习、自动批改等场景。

## 何时触发

- 用户说"自动出题""学情分析""个性化学习""自动批改"等
- 用户要求对接/使用 OpenMAIC
- 用户要求构建教育 AI 应用

## 项目背景

**OpenMAIC** 是清华 AIR 主导的教育领域开源 AI 项目，将大模型能力引入教育教学流程，实现智能化教学辅助和个性化学习。

核心能力方向：
- **智能出题**：按知识点/难度/题型自动生成题目
- **学情分析**：分析学生答题数据，诊断知识薄弱点
- **个性化学习**：基于学情生成个性化学习路径和推荐
- **自动批改**：客观题自动判分 + 主观题 AI 评分
- **教学辅助**：教案生成、知识点讲解、教学反馈

## 标准流程

### 1. 环境准备

```bash
# 基础环境
pip install torch transformers

# OpenMAIC 平台（从清华 AIR 获取）
# git clone <OpenMAIC 仓库地址>
# cd OpenMAIC && pip install -e .
```

### 2. 智能出题

```python
from openmaic import QuestionGenerator

gen = QuestionGenerator(model="edu-llm")
# 按知识点和难度生成题目
questions = gen.generate(
    subject="数学",
    knowledge_points=["二次函数", "顶点坐标"],
    difficulty="中等",
    question_types=["选择题", "填空题", "解答题"],
    count=10
)
for q in questions:
    print(f"题型: {q.type}")
    print(f"题干: {q.stem}")
    print(f"选项: {q.options}")
    print(f"答案: {q.answer}")
    print(f"解析: {q.analysis}")
```

### 3. 学情分析

```python
from openmaic import StudentAnalyzer

analyzer = StudentAnalyzer()
# 分析学生答题记录
report = analyzer.analyze(
    student_id="S001",
    answer_records=[
        {"question_id": "Q1", "correct": True, "time_spent": 30},
        {"question_id": "Q2", "correct": False, "time_spent": 120},
        # ...
    ]
)
print(f"知识掌握度: {report.mastery}")
print(f"薄弱知识点: {report.weak_points}")
print(f"建议: {report.recommendations}")
```

### 4. 个性化学习路径

```python
from openmaic import LearningPathPlanner

planner = LearningPathPlanner()
# 基于学情生成学习路径
path = planner.plan(
    student_profile={
        "level": "高二",
        "subject": "数学",
        "weak_points": ["二次函数", "概率统计"],
        "goal": "期末考试提分"
    }
)
for step in path.steps:
    print(f"阶段: {step.phase}")
    print(f"学习内容: {step.content}")
    print(f"预计时长: {step.duration}分钟")
    print(f"练习题: {step.exercises}")
```

### 5. 自动批改

```python
from openmaic import AutoGrader

grader = AutoGrader()
# 客观题自动判分
result = grader.grade_objective(
    questions=[{"id": "Q1", "answer": "B"}, {"id": "Q2", "answer": "42"}],
    student_answers=[{"id": "Q1", "answer": "B"}, {"id": "Q2", "answer": "40"}]
)
print(f"得分: {result.score}/{result.total}")
print(f"错题: {result.wrong_questions}")

# 主观题 AI 评分
essay_score = grader.grade_subjective(
    question="请论述二次函数的图像性质",
    student_answer="二次函数 y=ax²+bx+c 的图像是抛物线...",
    rubric={"内容": 40, "逻辑": 30, "表达": 30}
)
print(f"总分: {essay_score.total}")
print(f"分项: {essay_score.details}")
print(f"评语: {essay_score.feedback}")
```

## 应用场景

| 场景 | 能力 | 说明 |
|------|------|------|
| 智能出题 | 知识点+难度+题型 | 批量生成带解析的题目 |
| 学情诊断 | 答题数据分析 | 诊断知识薄弱点 |
| 个性化学习 | 学习路径规划 | 因材施教推荐 |
| 自动批改 | 客观+主观 | 减轻教师负担 |
| 教学辅助 | 教案/讲解/反馈 | 辅助教师备课 |

## 注意事项

- AI 出题需教师审核后方可使用
- 主观题评分仅供参考，最终成绩由教师确定
- 学情分析需足够样本量才准确
- 学生数据需脱敏存储，遵守个人信息保护法
- 不同学科需配置对应的知识图谱
- 获取最新仓库地址和文档：https://air.tsinghua.edu.cn/