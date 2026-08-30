---
name: data-visualization
description: 数据可视化。当用户要求"画图""生成图表""可视化数据""画柱状图/折线图/饼图""热力图"时触发。用 matplotlib/plotly/echarts 生成柱状/折线/饼/散点/热力/组合图，可存为图片或 HTML 交互图。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# 数据可视化（data-visualization）

把数据画成图。matplotlib（静态图片）/ plotly（交互 HTML）/ echarts（Web）三选一，覆盖柱状/折线/饼/散点/热力/组合图。

## 何时触发

- 用户说"画图""生成图表""可视化数据""画柱状图/折线图/饼图""热力图"等
- 用户有数据要直观展示

## 依赖

```bash
pip install matplotlib plotly pandas
# 中文显示
# matplotlib 中文字体：SimHei / Microsoft YaHei
```

## 标准流程

1. **确认数据与图表类型**：柱状比较、折线趋势、饼占比、散点相关、热力密度
2. **选库**：静态报告→matplotlib / 交互→plotly / 网页→echarts
3. **生成**：写脚本，存图片或 HTML
4. **回报**：输出路径 + 图表说明

## matplotlib（静态图片）

```python
import matplotlib.pyplot as plt
import matplotlib
matplotlib.rcParams['font.sans-serif'] = ['SimHei']  # 中文
matplotlib.rcParams['axes.unicode_minus'] = False

# 柱状
plt.bar(['A', 'B', 'C'], [10, 25, 18])
plt.title('各分类销量'); plt.xlabel('分类'); plt.ylabel('销量')
plt.savefig('bar.png', dpi=150, bbox_inches='tight')

# 折线
plt.plot(['1月','2月','3月'], [100, 130, 120], marker='o')
plt.title('月度趋势'); plt.savefig('line.png', dpi=150)

# 饼
plt.pie([30, 45, 25], labels=['A','B','C'], autopct='%1.1f%%')
plt.title('占比'); plt.savefig('pie.png', dpi=150)

# 散点
plt.scatter(df['x'], df['y']); plt.savefig('scatter.png', dpi=150)

# 热力
import seaborn as sns
sns.heatmap(df.corr(), annot=True); plt.savefig('heat.png', dpi=150)
```

## plotly（交互 HTML）

```python
import plotly.express as px
import pandas as pd

df = pd.DataFrame({'月': ['1','2','3'], '值': [100, 130, 120]})
fig = px.bar(df, x='月', y='值', title='月度销量')
fig.write_html('bar.html')   # 交互图
fig.write_image('bar.png')   # 静态（需 kaleido）

fig = px.line(df, x='月', y='值', markers=True)
fig = px.pie(df, values='值', names='月')
fig = px.scatter(df, x='x', y='y', color='cat')
fig = px.density_heatmap(df, x='x', y='y')
```

## echarts（Web 嵌入）

```html
<div id="chart" style="width:600px;height:400px"></div>
<script src="https://cdn.jsdelivr.net/npm/echarts/dist/echarts.min.js"></script>
<script>
const c = echarts.init(document.getElementById('chart'))
c.setOption({
  title: { text: '月度销量' },
  xAxis: { data: ['1月','2月','3月'] },
  yAxis: {},
  series: [{ type: 'bar', data: [100, 130, 120] }]
})
</script>
```

## 组合图（子图）

```python
fig, axes = plt.subplots(1, 2, figsize=(12, 5))
axes[0].bar(['A','B'], [10, 20]); axes[0].set_title('柱状')
axes[1].plot(['1','2','3'], [5, 8, 6]); axes[1].set_title('折线')
plt.tight_layout(); plt.savefig('combo.png', dpi=150)
```

## 图表选型

| 目的 | 图表 |
|------|------|
| 比较分类 | 柱状/条形 |
| 趋势 | 折线/面积 |
| 占比 | 饼/环图 |
| 相关 | 散点/气泡 |
| 分布 | 直方/箱线 |
| 密度 | 热力 |
| 多维对比 | 雷达 |

## 注意事项

- matplotlib 中文需设 `SimHei`/`Microsoft YaHei`，否则方块
- 保存用 `dpi=150` + `bbox_inches='tight'`，避免裁切和模糊
- 交互图优先 plotly（`write_html`），报告插图用 matplotlib
- 坐标轴从 0 起（柱状/饼），折线可截断但需说明
- 图例/标题/轴标签齐全，别只画图不标注
- 数据量大时散点用透明度（`alpha=0.5`）避免堆叠
- echarts 嵌网页按需引入（`import * as echarts from 'echarts/core'`）减小体积
- 生成后回报图表说明（这张图说明了什么结论）