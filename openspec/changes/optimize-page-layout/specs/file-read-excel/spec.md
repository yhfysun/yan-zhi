## ADDED Requirements

### Requirement: Excel parsing in file_read tool
`file_read` 工具 SHALL 支持读取 Excel 文件（.xlsx、.xls、.csv）。新增三个可选参数：`sheet`（指定 sheet 名称或索引，默认返回所有 sheet）、`range`（指定行列范围如 "A1:D100"，默认全表）、`format`（输出格式 "csv" 或 "json"，默认 "csv"）。

#### Scenario: Read all sheets by default
- **WHEN** 模型调用 `file_read` 读取 .xlsx 文件，不传 sheet 参数
- **THEN** 返回所有 sheet 的数据，每个 sheet 以 `--- Sheet: {name} ---` 头分隔
- **AND** 每个 sheet 最多返回 10000 行

#### Scenario: Read specific sheet
- **WHEN** 模型调用 `file_read` 指定 `sheet: "Sheet2"`
- **THEN** 只返回 Sheet2 的数据

#### Scenario: Read Excel with range
- **WHEN** 模型调用 `file_read` 指定 `range: "A1:C50"`
- **THEN** 只返回 A1 到 C50 范围内的数据

#### Scenario: Read Excel as JSON
- **WHEN** 模型调用 `file_read` 指定 `format: "json"`
- **THEN** 返回 JSON 对象，key 为 sheet 名，value 为 `[{col1: val1, col2: val2}, ...]` 数组

#### Scenario: Read CSV file
- **WHEN** 模型调用 `file_read` 读取 .csv 文件
- **THEN** 工具自动识别 CSV 格式，返回结构化表格数据

#### Scenario: Large Excel truncation warning
- **WHEN** 某个 sheet 超过 10000 行且未指定 range
- **THEN** 返回前 10000 行数据，并在该 sheet 末尾附加截断提示

### Requirement: Excel library lazy loading
Excel 解析库（xlsx/SheetJS）SHALL 通过动态 import 加载，不打包进核心模块。首次调用 Excel 解析时才加载该库。

#### Scenario: First Excel read triggers library load
- **WHEN** 首次调用 `file_read` 读取 .xlsx 文件
- **THEN** 系统动态加载 xlsx 解析库
- **AND** 后续 Excel 读取复用已加载的库
