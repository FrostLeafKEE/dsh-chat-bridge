# 测试夹具

这里的全部内容都是自造的、非敏感的测试材料。**不包含任何真实聊天记录、登录凭据、工作目录或个人信息**，也不能被当作产品默认数据使用：正式包里不会出现这些文件。

## `manual-history.v1.json`

本插件公开手动历史格式的完整示例（`format: "dsh-chat-bridge.manual-history"`、`schemaVersion: 1`）。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `format` | 是 | 固定为 `dsh-chat-bridge.manual-history`。其他值报 `UNSUPPORTED_FORMAT`。 |
| `schemaVersion` | 是 | 本版本只接受 `1`，其他值报 `UNSUPPORTED_VERSION`。 |
| `title` | 否 | 标题。缺失时按文件名推导，仍为空则用「导入的聊天」。 |
| `source` | 否 | 只允许 `url` 与 `conversationId` 两个字段。 |
| `source.url` | 否 | 只接受 `https://chat.deepseek.com` 的页面 URL，且不能带用户名密码。 |
| `source.conversationId` | 否 | 只记录来源明确给出的值；没有就不生成假 ID。 |
| `completeness` | 否 | 只允许 `user-supplied` 或 `partial`；缺失按 `user-supplied` 处理。它只表示“用户提供的数据集合”，不能证明是网页版全量历史。 |
| `messages` | 是 | 数组，按原顺序保存，最多 5000 条，不强制用户/助手交替。 |
| `messages[].id` | 是 | 非空字符串，必须唯一。 |
| `messages[].role` | 是 | 只允许 `user`、`assistant`；`system`/`developer`/`tool` 一律报错，不提升也不丢弃。 |
| `messages[].content` | 是 | 字符串。保留原空白、换行、代码、中文与表情；允许空字符串。 |
| `messages[].createdAt` | 否 | 合法 ISO 时间字符串；缺失时保持缺失，不拿导入时间冒充。 |
| `messages[].model` | 否 | 来源标注的模型名。 |
| `messages[].attachments` | 否 | 附件数组，每项最多 64 个。 |
| `attachments[].name` | 是 | 非空字符串。 |
| `attachments[].mimeType` / `sizeBytes` | 否 | 来源声明的类型与字节数。 |
| `attachments[].availability` | 否 | `metadata-only` 或 `unavailable`，缺失按 `metadata-only` 处理；两种都只保留元数据，不读取文件内容。 |

未列出的字段一律报 `INVALID_HISTORY` 并指出字段路径：本插件不会“猜字段后声称完整恢复”。

## `source-text.txt` / `source-markdown.md`

用于验证纯文本与 Markdown 输入：整段作为一段 `source-text` 保存，角色与轮次保持未知，不按“你：”“助手：”等字样拆分，也不把代码围栏拆成多条消息。
