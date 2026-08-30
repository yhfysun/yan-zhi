---
name: unit-test-gen
description: 单元测试生成。当用户要求"写单测""生成测试""补测试用例""加单元测试"时触发。为函数/类/模块生成单元测试，支持 pytest/jest/vitest/mocha/go test/JUnit，覆盖正常路径、边界值、异常分支，遵循 AAA（Arrange-Act-Assert）结构。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# 单元测试生成（unit-test-gen）

为已有代码生成单元测试。识别被测目标的输入输出与分支，覆盖正常/边界/异常三类用例，遵循 AAA 结构与单一断言原则。

## 何时触发

- 用户说"写单测""生成测试""补测试""加单测""测一下这个函数"等
- 用户要求提升覆盖率
- code-review 发现关键路径无测试

## 标准流程

1. **分析被测目标**：函数签名、分支、依赖、返回/副作用
2. **识别用例**：正常路径 + 边界值 + 异常分支
3. **隔离依赖**：mock/stub 外部依赖（DB/网络/时间/文件）
4. **生成测试**：按框架语法写，AAA 结构
5. **可运行验证**：给出运行命令，提醒跑一遍

## 用例识别清单

- **正常路径**：典型输入 → 预期输出
- **边界值**：空集合/0/负数/最大最小/单元素/越界
- **异常分支**：非法输入 → 抛错、外部失败 → 降级
- **幂等/顺序**：重复调用、调用顺序
- **并发**（若涉及）：竞态、重入

## 各框架模板

### pytest（Python）

```python
import pytest
from mymod import calc_price

def test_normal():
    # Arrange
    qty, price = 3, 100
    # Act
    res = calc_price(qty, price)
    # Assert
    assert res == 300

def test_zero_qty():
    assert calc_price(0, 100) == 0

def test_negative_raises():
    with pytest.raises(ValueError):
        calc_price(-1, 100)

# mock 依赖
def test_with_mock(mocker):
    mocker.patch('mymod.db.query', return_value={...})
    assert fetch(...) == ...
```
运行：`pytest -v`

### jest / vitest（JS/TS）

```typescript
import { describe, it, expect, vi } from 'vitest';
import { calcPrice } from './mymod';

describe('calcPrice', () => {
  it('正常', () => {
    expect(calcPrice(3, 100)).toBe(300);
  });
  it('零数量', () => {
    expect(calcPrice(0, 100)).toBe(0);
  });
  it('负数抛错', () => {
    expect(() => calcPrice(-1, 100)).toThrow(ValueError);
  });
});

// mock
vi.mock('./db', () => ({ query: vi.fn().mockResolvedValue({}) }));
```
运行：`npx vitest run` / `npx jest`

### go test（Go）

```go
func TestCalcPrice(t *testing.T) {
    tests := []struct{
        qty, price, want int
    }{
        {3, 100, 300},
        {0, 100, 0},
    }
    for _, tt := range tests {
        got := CalcPrice(tt.qty, tt.price)
        if got != tt.want {
            t.Errorf("CalcPrice(%d,%d)=%d, want %d", tt.qty, tt.price, got, tt.want)
        }
    }
}
```
运行：`go test ./...`

### JUnit（Java）

```java
@Test
void normal() {
    assertEquals(300, calcPrice(3, 100));
}
@Test
void negative() {
    assertThrows(IllegalArgumentException.class, () -> calcPrice(-1, 100));
}
```
运行：`mvn test`

## 注意事项

- **不测私有实现**：通过公开接口测行为，不测内部私有方法
- **单一断言**：一个用例只断言一个行为（多个 expect 聚焦同一行为可接受）
- **隔离**：每个用例独立，不依赖执行顺序，测后清理状态
- **mock 适度**：只 mock 外部不可控依赖，不要把被测对象自己 mock 掉
- **命名达意**：`test_零数量返回零` 而非 `test_1`
- 生成后务必跑一遍，修掉因 mock/签名不匹配导致的失败
- 覆盖率工具：`pytest --cov` / `vitest --coverage` / `go test -cover`