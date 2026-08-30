---
name: code-refactor
description: 代码重构。当用户要求"重构代码""这段代码太乱帮我重构""消除重复""降低复杂度"时触发。识别代码坏味道（长函数/重复/深嵌套/魔法数/大类/霰弹手术），给出重构手法与重构后代码，保证行为不变。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# 代码重构（code-refactor）

在不改变外部行为的前提下改善代码结构。识别"坏味道"，选用对应重构手法，输出重构后代码与改动说明。

## 何时触发

- 用户说"重构""代码太乱""优化结构""消除重复""降低圈复杂度"等
- 用户嫌某函数/类太长、嵌套太深、难维护
- code-review 后用户要求动手改

## 标准流程

1. **识别坏味道**：通读代码，列出问题
2. **选择手法**：为每个坏味道匹配重构手法
3. **小步重构**：每步保持可编译/测试通过
4. **输出对比**：改前 vs 改后 + 改动说明
5. **验证**：提醒跑测试确认行为不变

## 坏味道 → 重构手法

| 坏味道 | 手法 |
|--------|------|
| 函数过长 | 提取函数（Extract Function）；按意图命名 |
| 深层嵌套 | 提前返回（Guard Clauses）；分解条件表达式 |
| 重复代码 | 提取函数 / 提取超类 / 以组合替代 |
| 魔法数 | 用命名常量替换 |
| 大类（God Object） | 提取类 / 拆分职责 |
| 霰弹手术（改一处要动多处） | 移动函数 / 内联类 |
| 数据泥团 | 提取值对象 / 引入参数对象 |
| 发散式变化 | 拆分类（一个变化方向一个类） |
| 依恋情结 | 移动函数到数据所在类 |
| switch/类型码 | 以多态替换类型码 |
| 临时字段 | 提取类 |
| 可变数据 | 以查询替换派生变量；尽量不可变 |

## 常用手法示例

### 提取函数

```javascript
// 改前
function printInvoice(o) {
  let total = 0;
  for (const r of o.records) total += r.amount;
  console.log('name:', o.name);
  console.log('total:', total);
}

// 改后
function printInvoice(o) {
  console.log('name:', o.name);
  console.log('total:', calcTotal(o));
}
function calcTotal(o) {
  return o.records.reduce((s, r) => s + r.amount, 0);
}
```

### 提前返回（消除嵌套）

```javascript
// 改前
function pay(amount) {
  if (amount > 0) {
    if (isVerified) {
      doPay(amount);
    } else {
      throw new Error('未验证');
    }
  }
}

// 改后
function pay(amount) {
  if (amount <= 0) return;
  if (!isVerified) throw new Error('未验证');
  doPay(amount);
}
```

### 以多态替换 switch

```typescript
// 改前
function priceOf(plan) {
  switch (plan.type) {
    case 'basic': return 10;
    case 'pro': return 30;
    case 'enterprise': return 100;
  }
}

// 改后
const Plans = {
  basic: () => 10,
  pro: () => 30,
  enterprise: () => 100,
};
function priceOf(plan) { return Plans[plan.type](); }
```

## 注意事项

- **行为不变是第一原则**：每步重构后跑测试
- 小步前进，不要一次重构一大片
- 重构与加功能分开做（先重构再加功能）
- 重构前确保有测试兜底；没有测试先补关键路径测试
- 输出时给"改前/改后"对比，并说明用了哪个手法、为什么