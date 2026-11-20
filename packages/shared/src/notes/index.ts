export type NoteTemplateKind =
  | 'note'
  | 'journal'
  | 'expense'
  | 'income'
  | 'purchase'
  | 'sale'
  | 'time'
  | 'task'
  | 'custom';

export type NoteFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'amount'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'tags'
  | 'product';

export type NoteFieldAggregate = 'sum' | 'count';

export interface NoteTemplateField {
  key: string;
  label: string;
  type: NoteFieldType;
  required?: boolean;
  placeholder?: string;
  unit?: string;
  dictionaryId?: string;
  list?: boolean;
  aggregate?: NoteFieldAggregate;
  derived?: 'quantity_x_unitPrice';
  visibleWhen?: {
    field: string;
    equals: string;
  };
  defaultValue?: string | number | boolean | string[];
  min?: number;
  max?: number;
  rows?: number;
  width?: 'full' | 'half';
}

export interface NoteTemplateDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  tone: string;
  kind: NoteTemplateKind;
  fields: NoteTemplateField[];
  titleField: string;
  contentField?: string;
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface NoteDictionaryItem {
  id: string;
  label: string;
  color?: string;
  archived?: boolean;
}

export interface NoteDictionaryDefinition {
  id: string;
  name: string;
  description: string;
  items: NoteDictionaryItem[];
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type NoteTemplateData = Record<string, string | number | boolean | string[] | null>;

const now = 0;

export const NOTE_BUILTIN_DICTIONARIES: NoteDictionaryDefinition[] = [
  {
    id: 'dict.expense_category',
    name: '支出分类',
    description: '日常花销与经营支出的分类',
    builtin: true,
    createdAt: now,
    updatedAt: now,
    items: [
      { id: 'food', label: '餐饮' },
      { id: 'groceries', label: '买菜' },
      { id: 'transport', label: '交通' },
      { id: 'shopping', label: '购物' },
      { id: 'daily', label: '日用' },
      { id: 'bills', label: '房租水电' },
      { id: 'health', label: '医疗' },
      { id: 'study', label: '学习' },
      { id: 'gift', label: '人情' },
      { id: 'other-expense', label: '其他' },
    ],
  },
  {
    id: 'dict.income_category',
    name: '收入分类',
    description: '收入来源分类',
    builtin: true,
    createdAt: now,
    updatedAt: now,
    items: [
      { id: 'shop-income', label: '店铺收入' },
      { id: 'salary', label: '工资' },
      { id: 'refund', label: '退款' },
      { id: 'other-income', label: '其他' },
    ],
  },
  {
    id: 'dict.account',
    name: '资金账户',
    description: '现金、微信、支付宝和银行卡',
    builtin: true,
    createdAt: now,
    updatedAt: now,
    items: [
      { id: 'cash', label: '现金' },
      { id: 'wechat', label: '微信' },
      { id: 'alipay', label: '支付宝' },
      { id: 'bank', label: '银行卡' },
    ],
  },
  {
    id: 'dict.product_category',
    name: '商品分类',
    description: '进货与出货的商品分类',
    builtin: true,
    createdAt: now,
    updatedAt: now,
    items: [
      { id: 'fresh', label: '生鲜' },
      { id: 'snack', label: '零食' },
      { id: 'daily-goods', label: '日用' },
      { id: 'apparel', label: '服饰' },
      { id: 'digital', label: '数码' },
      { id: 'other-product', label: '其他' },
    ],
  },
  {
    id: 'dict.time_category',
    name: '时间场景',
    description: '每天时间去向的分类',
    builtin: true,
    createdAt: now,
    updatedAt: now,
    items: [
      { id: 'business', label: '经营' },
      { id: 'focus-work', label: '工作' },
      { id: 'study', label: '学习' },
      { id: 'chores', label: '家务' },
      { id: 'commute', label: '通勤' },
      { id: 'rest', label: '休息' },
    ],
  },
  {
    id: 'dict.journal_mood',
    name: '日记心情',
    description: '记录当天的心情',
    builtin: true,
    createdAt: now,
    updatedAt: now,
    items: [
      { id: 'great', label: '开心' },
      { id: 'calm', label: '平静' },
      { id: 'normal', label: '普通' },
      { id: 'tired', label: '疲惫' },
      { id: 'low', label: '低落' },
    ],
  },
  {
    id: 'dict.task_priority',
    name: '任务优先级',
    description: '任务计划优先级',
    builtin: true,
    createdAt: now,
    updatedAt: now,
    items: [
      { id: 'low', label: '低' },
      { id: 'medium', label: '中' },
      { id: 'high', label: '高' },
    ],
  },
  {
    id: 'dict.payment_status',
    name: '付款状态',
    description: '进货与出货的付款状态',
    builtin: true,
    createdAt: now,
    updatedAt: now,
    items: [
      { id: 'unpaid', label: '未付款' },
      { id: 'partial', label: '部分付款' },
      { id: 'paid', label: '已付款' },
    ],
  },
];

export const NOTE_BUILTIN_TEMPLATES: NoteTemplateDefinition[] = [
  {
    id: 'template.note',
    name: '普通笔记',
    description: '标题、正文和标签，适合随手记录',
    icon: 'NotebookPen',
    tone: 'slate',
    kind: 'note',
    titleField: 'title',
    contentField: 'content',
    builtin: true,
    createdAt: now,
    updatedAt: now,
    fields: [
      { key: 'title', label: '标题', type: 'text', required: true, placeholder: '一句话说明这条记录', width: 'full' },
      { key: 'content', label: '正文', type: 'textarea', rows: 8, placeholder: '写下内容，支持 Markdown', width: 'full' },
      { key: 'tags', label: '标签', type: 'tags', placeholder: '输入后按回车', width: 'full' },
    ],
  },
  {
    id: 'template.journal',
    name: '写日记',
    description: '记录今天发生的事、心情和天气',
    icon: 'SunMedium',
    tone: 'amber',
    kind: 'journal',
    titleField: 'title',
    contentField: 'content',
    builtin: true,
    createdAt: now,
    updatedAt: now,
    fields: [
      { key: 'title', label: '今天的一句话', type: 'text', required: true, placeholder: '例如：忙里偷闲的一天' },
      { key: 'date', label: '日期', type: 'date', defaultValue: 'today', width: 'half' },
      { key: 'mood', label: '心情', type: 'select', dictionaryId: 'dict.journal_mood', width: 'half' },
      { key: 'content', label: '今天发生了什么', type: 'textarea', rows: 8, placeholder: '慢慢写，不着急', width: 'full' },
      { key: 'tags', label: '标签', type: 'tags', placeholder: '生活、家人、灵感', width: 'full' },
    ],
  },
  {
    id: 'template.expense',
    name: '记支出',
    description: '快速记录金额、分类和账户',
    icon: 'WalletCards',
    tone: 'rose',
    kind: 'expense',
    titleField: 'merchant',
    contentField: 'note',
    builtin: true,
    createdAt: now,
    updatedAt: now,
    fields: [
      { key: 'amount', label: '金额', type: 'amount', required: true, placeholder: '0.00', list: true, aggregate: 'sum' },
      { key: 'category', label: '支出分类', type: 'select', required: true, dictionaryId: 'dict.expense_category', list: true },
      { key: 'account', label: '付款账户', type: 'select', dictionaryId: 'dict.account' },
      { key: 'merchant', label: '商家或用途', type: 'text', placeholder: '例如：早餐、超市' },
      { key: 'occurredAt', label: '时间', type: 'datetime', defaultValue: 'now' },
      { key: 'note', label: '备注', type: 'textarea', rows: 3, width: 'full' },
    ],
  },
  {
    id: 'template.income',
    name: '记收入',
    description: '记录收入来源和金额',
    icon: 'TrendingUp',
    tone: 'emerald',
    kind: 'income',
    titleField: 'source',
    contentField: 'note',
    builtin: true,
    createdAt: now,
    updatedAt: now,
    fields: [
      { key: 'amount', label: '金额', type: 'amount', required: true, placeholder: '0.00', list: true, aggregate: 'sum' },
      { key: 'category', label: '收入分类', type: 'select', required: true, dictionaryId: 'dict.income_category', list: true },
      { key: 'account', label: '收款账户', type: 'select', dictionaryId: 'dict.account' },
      { key: 'source', label: '来源', type: 'text', placeholder: '例如：门店销售、退款' },
      { key: 'occurredAt', label: '时间', type: 'datetime', defaultValue: 'now' },
      { key: 'note', label: '备注', type: 'textarea', rows: 3, width: 'full' },
    ],
  },
  {
    id: 'template.purchase',
    name: '记进货',
    description: '商品、数量、进价和供应商',
    icon: 'PackagePlus',
    tone: 'orange',
    kind: 'purchase',
    titleField: 'item',
    contentField: 'note',
    builtin: true,
    createdAt: now,
    updatedAt: now,
    fields: [
      { key: 'item', label: '商品', type: 'product', required: true, placeholder: '例如：红富士苹果' },
      { key: 'category', label: '商品分类', type: 'select', dictionaryId: 'dict.product_category', list: true },
      { key: 'quantity', label: '数量', type: 'number', required: true, unit: '件', list: true },
      { key: 'unitPrice', label: '单价', type: 'amount', required: true, aggregate: 'sum' },
      { key: 'total', label: '总额', type: 'amount', list: true, aggregate: 'sum', derived: 'quantity_x_unitPrice' },
      { key: 'supplier', label: '供应商', type: 'text' },
      { key: 'paymentStatus', label: '付款状态', type: 'select', dictionaryId: 'dict.payment_status' },
      { key: 'occurredAt', label: '进货日期', type: 'date', defaultValue: 'today' },
      { key: 'note', label: '备注', type: 'textarea', rows: 3, width: 'full' },
    ],
  },
  {
    id: 'template.sale',
    name: '记出货',
    description: '商品、数量、售价和渠道',
    icon: 'PackageCheck',
    tone: 'blue',
    kind: 'sale',
    titleField: 'item',
    contentField: 'note',
    builtin: true,
    createdAt: now,
    updatedAt: now,
    fields: [
      { key: 'item', label: '商品', type: 'product', required: true, placeholder: '例如：红富士苹果' },
      { key: 'quantity', label: '数量', type: 'number', required: true, unit: '件', list: true },
      { key: 'unitPrice', label: '售价', type: 'amount', required: true },
      { key: 'total', label: '出货金额', type: 'amount', list: true, aggregate: 'sum', derived: 'quantity_x_unitPrice' },
      { key: 'channel', label: '渠道或客户', type: 'text' },
      { key: 'cost', label: '对应成本', type: 'amount' },
      { key: 'paymentStatus', label: '收款状态', type: 'select', dictionaryId: 'dict.payment_status' },
      { key: 'occurredAt', label: '出货日期', type: 'date', defaultValue: 'today' },
      { key: 'note', label: '备注', type: 'textarea', rows: 3, width: 'full' },
    ],
  },
  {
    id: 'template.time',
    name: '记时间',
    description: '记录今天把时间花在了哪里',
    icon: 'Timer',
    tone: 'violet',
    kind: 'time',
    titleField: 'activity',
    contentField: 'note',
    builtin: true,
    createdAt: now,
    updatedAt: now,
    fields: [
      { key: 'activity', label: '做了什么', type: 'text', required: true, placeholder: '例如：整理货架' },
      { key: 'category', label: '时间场景', type: 'select', required: true, dictionaryId: 'dict.time_category', list: true },
      { key: 'durationMinutes', label: '时长', type: 'number', required: true, unit: '分钟', list: true, aggregate: 'sum' },
      { key: 'occurredAt', label: '日期', type: 'date', defaultValue: 'today' },
      { key: 'note', label: '备注', type: 'textarea', rows: 3, width: 'full' },
    ],
  },
  {
    id: 'template.task',
    name: '任务计划',
    description: '待办、时间、优先级和提醒',
    icon: 'ListChecks',
    tone: 'cyan',
    kind: 'task',
    titleField: 'title',
    contentField: 'content',
    builtin: true,
    createdAt: now,
    updatedAt: now,
    fields: [
      { key: 'title', label: '任务', type: 'text', required: true, placeholder: '要完成什么' },
      { key: 'planAt', label: '计划时间', type: 'datetime' },
      { key: 'priority', label: '优先级', type: 'select', dictionaryId: 'dict.task_priority', list: true },
      { key: 'remind', label: '到点提醒', type: 'checkbox', defaultValue: true },
      { key: 'done', label: '已完成', type: 'checkbox', defaultValue: false },
      { key: 'content', label: '说明', type: 'textarea', rows: 3, width: 'full' },
    ],
  },
];

export function noteDictionaryById(
  id: string,
  dictionaries: readonly NoteDictionaryDefinition[] = NOTE_BUILTIN_DICTIONARIES,
): NoteDictionaryDefinition | undefined {
  return dictionaries.find((dictionary) => dictionary.id === id);
}

export function noteTemplateById(
  id: string,
  templates: readonly NoteTemplateDefinition[] = NOTE_BUILTIN_TEMPLATES,
): NoteTemplateDefinition | undefined {
  return templates.find((template) => template.id === id);
}

export function noteFieldHasOptions(field: NoteTemplateField): boolean {
  return field.type === 'select' || field.type === 'multiselect';
}
