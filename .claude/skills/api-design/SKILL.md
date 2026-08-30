---
name: api-design
description: API 设计助手。当用户要求"设计 API""定义接口""RESTful 规范""生成 OpenAPI 文档""Mock 接口"时触发。覆盖 RESTful/GraphQL 设计规范、URL/方法/状态码/命名约定、OpenAPI 文档生成、接口 Mock，输出可直接对接的接口契约。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# API 设计（api-design）

设计规范、可对接的 API 接口。覆盖 RESTful 与 GraphQL 两种风格，输出 URL/方法/入参/出参/状态码/错误码，可生成 OpenAPI 文档与 Mock。

## 何时触发

- 用户说"设计 API""定义接口""RESTful 规范""生成接口文档""Mock 接口""GraphQL schema"等
- 用户要为某功能设计前后端契约
- 用户要规范团队接口风格

## 标准流程

1. **理清资源**：识别领域对象（订单/用户/商品…）
2. **定 URL 与方法**：按 RESTful 约定映射操作
3. **定入参出参**：字段/类型/必填/示例
4. **定状态码与错误**：成功与各错误对应码
5. **输出契约**：接口表 + OpenAPI（可选）+ Mock（可选）

## RESTful 规范

### URL 约定
- 用名词复数：`/orders`、`/users`
- 嵌套表达从属：`/users/{id}/orders`
- 小写、连字符分词：`/order-items`
- 版本前缀：`/v1/orders`
- 查询参数做筛选/分页/排序：`/orders?status=paid&page=1&size=20&sort=-created_at`

### 方法语义
| 方法 | 语义 | 示例 |
|------|------|------|
| GET | 查询（幂等） | `GET /orders/{id}` |
| POST | 新建 | `POST /orders` |
| PUT | 整体替换（幂等） | `PUT /orders/{id}` |
| PATCH | 局部更新 | `PATCH /orders/{id}` |
| DELETE | 删除（幂等） | `DELETE /orders/{id}` |

### 状态码
- 200 成功 / 201 创建 / 204 无内容
- 400 参数错误 / 401 未认证 / 403 无权限 / 404 不存在 / 409 冲突 / 422 语义错误 / 429 限流
- 500 服务端错误 / 502 网关 / 503 不可用

### 统一响应体
```json
{
  "code": 0,
  "message": "ok",
  "data": { "id": "o_1", "status": "paid" }
}
```
分页：
```json
{ "data": [...], "page": 1, "size": 20, "total": 136 }
```

### 错误体
```json
{ "code": 40001, "message": "金额必须大于 0", "details": [{ "field": "amount", "issue": "must_be_positive" }] }
```

## 接口表模板

| 方法 | URL | 说明 | 入参 | 出参 |
|------|-----|------|------|------|
| POST | /v1/orders | 创建订单 | {items[], addressId} | {id, status, total} |
| GET | /v1/orders/{id} | 查订单详情 | — | {id, items[], status} |
| PATCH | /v1/orders/{id}/cancel | 取消订单 | {reason?} | {id, status:"cancelled"} |

## OpenAPI 生成

```yaml
openapi: 3.0.0
paths:
  /v1/orders:
    post:
      summary: 创建订单
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                items:
                  type: array
                  items: { type: string }
      responses:
        '201':
          description: 创建成功
```
工具：`npx @redocly/cli build-docs openapi.yaml -o api.html` 生成文档站。

## Mock

```bash
# prism 按 OpenAPI 起 Mock 服务
npx prism mock openapi.yaml --port 4010
```

## GraphQL（可选）

```graphql
type Order { id: ID! status: OrderStatus! total: Float! items: [OrderItem!]! }
type Query { order(id: ID!): Order }
type Mutation { createOrder(input: CreateOrderInput!): Order! }
```
约定：查询用 Query、写用 Mutation；错误用统一 `errors` + 业务 code；分页用 Relay cursor 模式。

## 注意事项

- URL 表达"资源"，不要把动词放 URL（`/createOrder` 不规范，用 `POST /orders`）
- 用 HTTP 方法 + 状态码表达语义，不要全部 200 + body 里的 code
- 时间字段用 ISO 8601 字符串（`2026-08-30T10:00:00Z`），不要用时间戳
- id 用字符串（避免数值精度问题），带前缀（`o_`、`u_`）便于辨识
- 破坏性改动走版本（`/v2/`）或字段兼容（新增字段不删旧字段）
- 批量操作用单独端点（`POST /orders/batch`）而非在单资源上重载语义