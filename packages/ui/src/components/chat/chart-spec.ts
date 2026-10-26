// 图表契约：工作台 ↔ DataChart ↔ 聚合接口共用。
// 只用名字与数值，不携带 SQL —— 渲染层与取数层通过这份 spec 解耦。

export type ChartKind = 'line' | 'bar' | 'pie' | 'scatter' | 'area';

export interface ChartSpec {
  kind: ChartKind;
  /** X 轴 / 分组维度 */
  dim: string;
  /** Y 轴度量列 */
  measure: string;
  /** 第二维度（多系列）；缺省为单系列 */
  series?: string;
  /** 服务端已把值换算成百分比 */
  percent?: boolean;
  /** 聚合方式（文档/图表 section 自描述用；工作台另传） */
  agg?: 'count' | 'sum' | 'avg' | 'min' | 'max';
  /** 时间粒度（仅日期维度有意义） */
  timeGrain?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  /** TopN（其余归「其他」） */
  topN?: number;
  title?: string;
}

export interface ChartPoint {
  key: string;
  /** 与 ChartData.series 一一对应 */
  values: number[];
}

export interface ChartData {
  series: string[];
  points: ChartPoint[];
  total: number;
  dim: string;
  measure: string;
  agg?: string;
  timeGrain?: string;
  sql?: string;
}
