---
name: openbiomed-skills
description: 对接清华 AIR（智能产业研究院）OpenBioMed 生物医药 AI 开源工具链。当用户要求"药物发现""分子生成""蛋白质结构预测""医学影像分析""生物信息学分析""对接 OpenBioMed"时触发。指导安装部署和使用生物医药 AI 能力。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# OpenBioMed 生物医药 AI（openbiomed-skills）

对接清华大学智能产业研究院（AIR）主导的 **OpenBioMed** 开源生物医药 AI 工具链，覆盖药物发现、分子生成、蛋白质分析、医学影像等场景。

## 何时触发

- 用户说"药物发现""分子生成""蛋白质结构预测""医学影像分析"等
- 用户要求对接/使用 OpenBioMed
- 用户要求做生物信息学 AI 分析

## 项目背景

**OpenBioMed** 是清华 AIR 主导的生物医药领域开源 AI 项目，旨在将大模型能力引入生物医药研发流程，加速药物发现和生物分子设计。

核心能力方向：
- **药物发现**：靶点识别、虚拟筛选、活性预测
- **分子生成**：按属性约束生成新分子结构（SMILES）
- **蛋白质分析**：结构预测、功能注释、蛋白质-配体对接
- **医学影像**：CT/MRI/病理切片 AI 辅助分析
- **生物信息学**：序列分析、基因表达、变异调用

## 标准流程

### 1. 环境准备

```bash
# 基础环境
pip install torch torchvision torchaudio
pip install rdkit-pypi biopython numpy scipy pandas

# OpenBioMed 工具链（从清华 AIR 获取）
# git clone <OpenBioMed 仓库地址>
# cd OpenBioMed && pip install -e .
```

### 2. 药物发现 / 虚拟筛选

```python
# 示例：对靶点做虚拟筛选
from openbiomed import DrugDiscovery

dd = DrugDiscovery(model="molmim")  # 分子优化模型
# 生成候选分子
candidates = dd.generate_molecules(
    target_protein="靶点蛋白序列或PDB ID",
    n_candidates=100,
    constraints={"logP": [-1, 5], "mw": [200, 500]}
)
# 活性预测
scores = dd.predict_activity(candidates, target="靶点ID")
# 按得分排序
ranked = sorted(zip(candidates, scores), key=lambda x: x[1], reverse=True)
```

### 3. 分子生成与优化

```python
from openbiomed import MoleculeGenerator

gen = MoleculeGenerator(model="molmim")
# 按约束生成分子
mols = gen.generate(
    n=50,
    constraints={
        "logP": [2, 4],        # 脂水分配系数
        "mw": [300, 600],       # 分子量
        "tpsa": [40, 120],      # 拓扑极性表面积
    }
)
# 输出 SMILES
for m in mols:
    print(m.smiles, m.properties)
```

### 4. 蛋白质结构预测

```python
from openbiomed import ProteinFolder

pf = ProteinFolder()
structure = pf.predict(sequence="MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEK")
structure.save("predicted.pdb")
```

### 5. 医学影像分析

```python
from openbiomed import MedicalImageAnalyzer

analyzer = MedicalImageAnalyzer(task="classification")
result = analyzer.analyze("ct_scan.dcm")
print(f"诊断建议: {result.prediction}")
print(f"置信度: {result.confidence}")
```

## 应用场景

| 场景 | 能力 | 说明 |
|------|------|------|
| 药物筛选 | 虚拟筛选 + 活性预测 | 从化合物库筛选候选药物 |
| 分子设计 | 约束生成 + 优化 | 按药代动力学属性设计新分子 |
| 蛋白质研究 | 结构预测 + 功能注释 | 预测未知蛋白结构 |
| 影像辅助 | 分类/分割/检测 | CT/MRI/病理 AI 辅助诊断 |
| 序列分析 | 基因/蛋白序列 | 生物信息学分析 |

## 注意事项

- 生物医药 AI 结果仅供参考，不能替代专业医学判断
- 分子生成结果需经药化专家评估和实验验证
- 医学影像分析需有资质医师复核
- 部分模型需要 GPU 支持，显存需求较大
- 数据隐私：患者数据需脱敏后处理，遵守 HIPAA/个人信息保护法
- 获取最新仓库地址和文档：https://air.tsinghua.edu.cn/