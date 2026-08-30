---
name: xlsx-data-processing
description: 处理 Excel/CSV/TSV 电子表格数据。当用户要求"处理 Excel""分析表格数据""清洗数据""生成报表""合并 CSV"时触发。通过 pandas + openpyxl 读写数据、计算公式、格式化、图表，支持数据清洗、聚合、透视、多表合并。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# Excel/数据处理（xlsx-data-processing）

用 **pandas** + **openpyxl** 处理 Excel/CSV 数据。通过 shell 执行 Python 脚本完成数据读写、清洗、分析、报表生成。

## 何时触发

- 用户说"处理 Excel""分析表格""清洗数据""生成报表"等
- 用户要求合并/拆分/转换 CSV/Excel
- 用户要求对数据做聚合/透视/统计

## 依赖安装

```bash
pip install pandas openpyxl xlsxwriter
```

## 标准流程

1. **理解数据**：明确输入文件、目标操作、输出格式
2. **编写脚本**：用 pandas/openpyxl 处理
3. **执行**：通过 shell 运行
4. **回报**：结果摘要 + 输出文件路径

## 常用操作

### 读取数据

```python
import pandas as pd

# Excel
df = pd.read_excel("input.xlsx", sheet_name="Sheet1")
# CSV
df = pd.read_csv("input.csv", encoding="utf-8")
# 多 sheet
xls = pd.ExcelFile("input.xlsx")
for sheet in xls.sheet_names:
    df = pd.read_excel(xls, sheet_name=sheet)
```

### 数据清洗

```python
# 去重
df = df.drop_duplicates()
# 填充空值
df = df.fillna(0)
# 删除空行
df = df.dropna(how="all")
# 重命名列
df = df.rename(columns={"旧名": "新名"})
# 类型转换
df["日期"] = pd.to_datetime(df["日期"])
df["金额"] = df["金额"].astype(float)
```

### 聚合分析

```python
# 分组统计
summary = df.groupby("部门").agg({"金额": ["sum", "mean", "count"]})
# 透视表
pivot = df.pivot_table(values="金额", index="部门", columns="月份", aggfunc="sum")
# 排序
df = df.sort_values("金额", ascending=False)
# 筛选
filtered = df[df["金额"] > 10000]
```

### 写入 Excel（带格式）

```python
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

# pandas 写入
df.to_excel("output.xlsx", index=False, sheet_name="报表")

# openpyxl 格式化
import openpyxl
wb = openpyxl.load_workbook("output.xlsx")
ws = wb.active

# 表头样式
header_font = Font(bold=True, color="FFFFFF")
header_fill = PatternFill(start_color="1E2761", end_color="1E2761", fill_type="solid")
for cell in ws[1]:
    cell.font = header_font
    cell.fill = header_fill
    cell.alignment = Alignment(horizontal="center")

# 自动列宽
for col in ws.columns:
    max_len = max(len(str(cell.value or "")) for cell in col)
    ws.column_dimensions[col[0].column_letter].width = max_len + 2

wb.save("output.xlsx")
```

### 多文件合并

```python
import glob
dfs = [pd.read_csv(f) for f in glob.glob("data/*.csv")]
merged = pd.concat(dfs, ignore_index=True)
merged.to_excel("merged.xlsx", index=False)
```

### 公式写入

```python
import openpyxl
wb = openpyxl.Workbook()
ws = wb.active
ws["A1"] = "数量"
ws["B1"] = "单价"
ws["C1"] = "合计"
ws["A2"] = 10
ws["B2"] = 50
ws["C2"] = "=A2*B2"  # 公式
wb.save("formula.xlsx")
```

## 速查表

| 操作 | 方法 |
|------|------|
| 读 Excel | `pd.read_excel(path, sheet_name=)` |
| 读 CSV | `pd.read_csv(path, encoding=)` |
| 写 Excel | `df.to_excel(path, index=False)` |
| 写 CSV | `df.to_csv(path, index=False, encoding="utf-8-sig")` |
| 分组 | `df.groupby(col).agg({col: func})` |
| 透视 | `df.pivot_table(values, index, columns, aggfunc)` |
| 合并 | `pd.concat([df1, df2])` / `pd.merge(df1, df2, on=)` |
| 筛选 | `df[df[col] > val]` |
| 排序 | `df.sort_values(col, ascending=)` |

## 注意事项

- CSV 写入中文用 `encoding="utf-8-sig"`（带 BOM，Excel 可正确显示）
- 大文件用 `chunksize` 参数分块读取
- 日期解析用 `pd.to_datetime`，不要字符串比较
- 公式以 `=` 开头写入单元格，Excel 打开时自动计算
- 生成后回报行数、列数、输出路径