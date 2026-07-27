## ADDED Requirements

### Requirement: File panel toggle
聊天页面右侧 SHALL 显示一个可折叠的文件管理面板。面板默认折叠，用户点击顶部工具栏"文件"按钮或使用快捷键时展开/折叠。面板宽度为 240px。

#### Scenario: Open file panel
- **WHEN** 用户点击聊天页顶部或工具栏中的文件图标按钮
- **THEN** 右侧文件管理面板展开，宽度 240px
- **AND** 聊天消息区宽度相应缩小

#### Scenario: Close file panel
- **WHEN** 文件面板处于展开状态且用户点击关闭按钮或再次点击文件图标
- **THEN** 文件面板折叠隐藏

### Requirement: File list display
文件面板 SHALL 以列表形式展示工作目录下的文件，每项显示文件类型图标、文件名、文件大小和修改时间。最近修改的文件排在前面。列表支持搜索过滤。

#### Scenario: View file list
- **WHEN** 文件面板展开
- **THEN** 系统通过 `FsAdapter.readDir` 读取工作目录文件列表并渲染
- **AND** 每个文件项显示类型图标、文件名、大小

#### Scenario: Search files
- **WHEN** 用户在文件面板搜索框输入关键词
- **THEN** 文件列表实时过滤，只显示文件名匹配的文件

### Requirement: File preview in panel
点击文件列表中的文件 SHALL 弹出预览弹窗。文本文件显示完整内容（带语法高亮）；图片文件显示图片预览；Excel 文件遍历所有 sheet，每个 sheet 以选项卡或折叠面板展示前 20 行表格数据；其他文件类型显示基本信息（名称、大小、类型）。

#### Scenario: Preview text file
- **WHEN** 用户点击一个 .txt 或 .md 文件
- **THEN** 弹出预览弹窗，显示文件完整内容（带代码高亮）

#### Scenario: Preview Excel file with all sheets
- **WHEN** 用户点击一个 .xlsx 文件
- **THEN** 弹出预览弹窗，以选项卡切换每个 sheet
- **AND** 每个 sheet 展示前 20 行表格数据

#### Scenario: Preview image file
- **WHEN** 用户点击一个 .png 或 .jpg 文件
- **THEN** 弹出预览弹窗，显示图片

### Requirement: File upload with ID generation
文件面板 SHALL 提供上传按钮。用户选择本地文件后，系统生成唯一文件 ID（格式 `f_` + UUID 前 12 位），将文件复制到工作目录 `workspace/files/` 下，文件列表自动刷新。

#### Scenario: Upload file via panel
- **WHEN** 用户点击文件面板中的"上传"按钮并选择本地文件
- **THEN** 文件被复制到 `workspace/files/{fileId}_{原文件名}`
- **AND** 文件列表自动刷新显示新文件

### Requirement: File delete
文件面板 SHALL 支持删除操作。删除时系统弹出确认对话框，确认后通过 `FsAdapter.remove` 删除文件并刷新列表。

#### Scenario: Delete file with confirmation
- **WHEN** 用户点击文件项的删除图标
- **THEN** 系统弹出"确认删除"对话框
- **AND** 用户确认后文件被删除，列表刷新

### Requirement: File reference in chat context
发送消息时，若当前对话挂载了文件，系统 SHALL 将文件引用（非完整内容）附加到消息上下文中。文件引用格式为：`{ fileId, fileName, type, size, preview }`。文本文件 preview 为前 5 行原文；Excel 文件 preview 为每个 sheet 各取前 3 行（标注 sheet 名）；图片/二进制文件 preview 为元信息文字描述。

#### Scenario: Send message with attached Excel file
- **WHEN** 用户选中一个包含 Sheet1、Sheet2 的 .xlsx 文件并发送消息
- **THEN** 消息上下文中的 preview 字段依次展示 Sheet1 前 3 行和 Sheet2 前 3 行
- **AND** 不包含完整文件内容

#### Scenario: Send message with attached text file
- **WHEN** 用户选中一个 .txt 文件并发送消息
- **THEN** 消息上下文只包含文件的 ID、名称、类型、大小和前 5 行预览
- **AND** 完整文件内容不进入 prompt

#### Scenario: Model reads file via tool
- **WHEN** 模型从上下文中获得文件引用后需要读取完整内容
- **THEN** 模型调用 `file_read` 工具，传入文件路径
- **AND** `file_read` 返回完整文件内容给模型

### Requirement: File panel visual style
文件面板 SHALL 使用与左侧会话侧边栏一致的毛玻璃风格（backdrop-filter），包含面板标题栏（标题 + 上传按钮 + 关闭按钮）、搜索框和文件列表区域。面板与聊天消息区之间有 1px 分隔线。
