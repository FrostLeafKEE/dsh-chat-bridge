# 数据与接口合同

本文件描述 `dsh-chat-bridge` `1.0.0` 的现行及兼容历史合同：档案 schema、结果与错误码、限额、摘要规则、导出格式，以及 Port 的输入、结果与释放规则。第 14–24 节按版本记录演进；旧草稿语义只供兼容参考，现行原生历史导入以第 16–24 节为准，网页列表以第 25 节为准。它是**本插件自己定义的业务接口**说明，不是 DSH SDK 文档。手动档案继续使用 v1；网页采集使用新增 v2，见第 14 节。实机验证状态见 INTEGRATION.md。

对应代码：`src/shared/contracts.ts`、`src/shared/errors.ts`、`src/shared/limits.ts`、`src/import/*`、`src/storage/*`、`src/adapters/*`。

---

## 1. ChatSnapshot v1

```ts
interface ChatSnapshot {
  schemaVersion: 1
  archiveId: string        // 插件生成的本地 UUIDv4
  fingerprint: string      // 原始导入内容摘要，与 archiveId 相互独立
  title: string
  importedAt: string       // 本次本地导入时间（ISO）
  updatedAt: string        // 本地元数据最后变化时间（ISO）
  source: {
    kind: 'manual-json' | 'manual-text' | 'manual-markdown'
    fileName?: string      // 仅基本文件名，绝不保存用户机器上的完整路径
    url?: string           // 校验通过的 https://chat.deepseek.com 页面 URL
    conversationId?: string
  }
  original: {
    format: 'json' | 'text' | 'markdown'
    text: string           // 用户提供的全文，不 trim、不截断、不转换换行
  }
  history:
    | { kind: 'messages'; completeness: 'user-supplied' | 'partial'; messages: ImportedMessage[] }
    | { kind: 'source-text'; completeness: 'unknown'; text: string }
}
```

`ImportedMessage`：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 非空、档案内唯一，最长 128 字符 |
| `role` | 是 | 只允许 `user`、`assistant` |
| `content` | 是 | 字符串，可为空串；原样保留 |
| `createdAt` | 否 | 来源给出的 ISO 时间；缺失即缺失 |
| `model` | 否 | 来源标注的模型名，最长 128 字符 |
| `attachments` | 否 | 最多 64 项元数据 |

`ImportedAttachment`：`name`（必填，≤260 字符）、可选 `mimeType`、可选非负整数 `sizeBytes`、`availability: 'metadata-only' | 'unavailable'`（缺失按 `metadata-only`）。**不读取链接、不保存文件内容**。

`validateSnapshot()`（`src/import/validate-snapshot.ts`）在运行时逐字段校验，并在读取路径上重新校验 `source.url`：一个存储记录无法夹带外域或带凭据的 URL。

---

## 2. Result 与错误码

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: ArchiveError }

interface ArchiveError {
  code: ErrorCode
  messageKey: string   // 客户端字典键，如 error.INPUT_TOO_LARGE
  message: string      // 简短技术描述；不含用户内容、不拼接完整输入
  path?: string        // 出错字段位置，如 messages[3].role
  detail?: Record<string, string | number | boolean>  // 结构性细节，如 { limit, actual }
}
```

任务书要求的稳定错误码全部实现：`INPUT_TOO_LARGE`、`INVALID_JSON`、`UNSUPPORTED_FORMAT`、`UNSUPPORTED_VERSION`、`INVALID_HISTORY`、`UNSAFE_SOURCE_URL`、`ARCHIVE_NOT_FOUND`、`ARCHIVE_CORRUPTED`、`STORAGE_UNAVAILABLE`、`STORAGE_QUOTA_EXCEEDED`、`WEB_CARRIER_NOT_IMPLEMENTED`、`WORK_IMPORT_NOT_IMPLEMENTED`。

本实现新增（每个都对应必需集合无法命名的一种失败）：

| 错误码 | 含义 |
| --- | --- |
| `INVALID_ENCODING` | 字节不是合法 UTF-8 |
| `INVALID_TITLE` | 标题为空或超长 |
| `FILE_READ_FAILED` | 选中的文件读不出来 |
| `NAVIGATION_UNAVAILABLE` | 宿主布局服务拒绝或不存在 |
| `UNEXPECTED` | 无更精确分类的失败，同样不含输入数据 |
| `DESKTOP_REQUIRED` | 桌面 Browser bridge 缺失或已释放 |
| `WEB_LOAD_FAILED` | guest 申请、加载或渲染失败 |
| `WEB_NAVIGATION_BLOCKED` | 弹窗请求或已观察的页面离开支持站点；不是网络拦截保证 |
| `WORK_IMPORT_FAILED` | 工作区未就绪、用户输入冲突或原生交接失败 |
| `WORK_DRAFT_NOT_SAVED` | 未能读回原生保存的完整引用草稿 |
| `WORK_IMPORT_CANCELED` | 用户后续导航或插件释放取消交接；不强制切回聊天 |

客户端 `ERROR_KEYS` 是 `Record<ErrorCode, 字典键>`：新增错误码而不补文案会编译失败，不会把裸键渲染给用户。

**日志纪律**：错误对象是可直接记录的安全结构——只有码、字典键、字段路径与结构性 detail。正文、原始导出、完整输入都不会进入异常信息或日志。

---

## 3. 限额（`src/shared/limits.ts`）

| 键 | 值 | 适用 |
| --- | --- | --- |
| `manualInputBytes` | 5 MiB | 普通手动历史输入（`.json` 手动格式、`.txt`、`.md`、粘贴） |
| `archiveFileBytes` | 64 MiB | 完整本地档案 JSON 文件 |
| `maxMessages` | 5000 | 结构化消息条数 |
| `maxTitleLength` | 200 | 标题（码点） |
| `maxAttachmentsPerMessage` | 64 | 单条消息附件数 |
| `maxAttachmentNameLength` | 260 | 附件名 |
| `maxSourceUrlLength` | 2048 | 来源 URL |
| `maxConversationIdLength` | 256 | 来源会话 ID |
| `maxMessageIdLength` | 128 | 消息 ID |
| `maxModelLabelLength` | 128 | 模型标签 |

规则：

- 字节上限一律按 **UTF-8 字节数**比较（`utf8ByteLength`），不是 JS 字符串长度。
- 导入前（`checkByteCeiling` / 选择文件时）与解析后（解析器内部）都核实；**超限即拒绝，绝不截断后保存**。
- 档案文件 64 MiB 上限之外，其中的 `original.text` 仍必须满足 5 MiB 与 5000 条消息限制。
- 选择的 `.json` 文件先按 64 MiB 放行（可能是档案文档），解码后若判定为手动历史，再由解析器按 5 MiB 拦下。

---

## 4. 编码与 BOM

- 用 `TextDecoder('utf-8', { fatal: true })` 严格解码；非法字节报 `INVALID_ENCODING`，**不把 U+FFFD 替换字符当成原文保存**。
- BOM 被当作编码签名消耗：它不会破坏 `JSON.parse`，也不会以不可见字符出现在 `original.text` 中；`original.text` 仍包含文件的全部内容字节。解码结果附带 `hadBom` 供 UI 说明。
- 正文不做换行转换：CRLF/LF 原样保留。

---

## 5. 手动历史格式 v1（`dsh-chat-bridge.manual-history`）

示例见 `fixtures/manual-history.v1.json`，字段说明见 `fixtures/README.md`。要点：

- 根字段为 `format`、`schemaVersion`、`title?`、`source?`、`completeness?`、`messages`。
- **先判格式与版本，再判字段**：外来 JSON 报 `UNSUPPORTED_FORMAT`（用户可改用原始文本重新预览），本格式内的未知字段报 `INVALID_HISTORY` 并指出字段路径。
- `completeness` 缺失按 `user-supplied`；它是唯一被允许的“默认诚实值”，永远不表示网页版全量历史。
- `source.url` 只接受 `https://chat.deepseek.com` 的 HTTPS 页面 URL，拒绝其他域名、用户名密码、危险协议；保存时去掉 fragment。
- 消息按数组顺序保存；不按时间重排、不强制角色交替；`id` 必须唯一。
- 附件只保留元数据，`availability` 缺失按 `metadata-only`。

## 6. 纯文本 / Markdown

整段作为一段 `source-text`（`completeness: 'unknown'`）保存。不按“你：”“助手：”等字样拆分角色，也不把 Markdown 代码围栏拆成消息。详情页明确显示“原始文本，未验证对话角色”。

---

## 7. 摘要（fingerprint）规则

```
输入（UTF-8 字节）："manual-history:v1" NUL <format> NUL <original.text>
算法：SHA-256（Web Crypto subtle），小写十六进制
```

- 参与摘要：原始格式与原始全文。
- **不参与**：`archiveId`、导入/更新时间、文件名、标题（含重命名后）、来源元数据。
- 只有“同格式 + 原始文字完全相同”才判为重复；JSON 仅格式空白不同即视为另一份档案（基础版不做语义去重）。
- 该规则被 `tests/fingerprint.test.ts` 用 `node:crypto` 独立实现交叉验证。

---

## 8. ArchiveRepository

```ts
interface ArchiveRepository {
  list(query?: { search?: string }): Promise<Result<ArchiveSummary[]>>
  get(archiveId: string): Promise<Result<ChatSnapshot>>
  save(snapshot: ChatSnapshot): Promise<Result<{ archiveId: string; duplicate: boolean }>>
  rename(archiveId: string, title: string): Promise<Result<void>>
  remove(archiveId: string): Promise<Result<void>>
  dispose(): void
}
```

- `ArchiveSummary` 只含列表字段与统计，**不含正文**。
- 搜索只匹配标题；列表按 `updatedAt` 倒序，同一时间按 `archiveId` 升序稳定排序。
- 生产实现：`IndexedDbArchiveRepository`，数据库 `dsh-chat-bridge.archives.v1`，两个对象仓库（`summaries` 仅列表投影 + 唯一 `fingerprint` 索引；`archives` 完整快照），同事务写入。
- 唯一索引是去重的数据库级保证；并发写入由 `ConstraintError` 兜底，回读既有记录并返回 `duplicate: true`。
- 标题编辑只改 `title` 与 `updatedAt`，不动原始内容与摘要。
- 损坏或未知版本记录**不自动删除**：`get()` 报 `ARCHIVE_CORRUPTED`，`list()` 把它显示为 `status: 'corrupted'` 条目，其余档案保持可用。
- 数据库不可用报 `STORAGE_UNAVAILABLE`，**不静默退回内存实现**；内存实现（`MemoryArchiveRepository`）仅用于测试与明确标记的开发预览。
- 存储位于 DSH 主界面自己的 origin；不要依赖它天然重启可见。README 说明了导出与清理方式。

---

## 9. 导出与重新导入

两种导出，含义不同：

1. **原文导出**：内容就是 `original.text`，逐字节一致；扩展名随原始格式（`.json` / `.txt` / `.md`）。
2. **完整档案导出**：`{ "format": "dsh-chat-bridge.archive", "schemaVersion": 1 | 2, "snapshot": ChatSnapshot }`，版本必须与 snapshot 一致，受 64 MiB 上限约束。

重新导入档案时：

- 重新校验包装、`schemaVersion`、`snapshot` 结构、`source.url`；
- 重算摘要并要求与文档内一致；
- 从 `original` 重新解析并逐条核对 `history`（条数、id、role、content、completeness；文本型核对整段）——互相矛盾报 `ARCHIVE_CORRUPTED`；
- 其中 `original.text` 仍须满足 5 MiB；
- **本地 ID 与导入时间按新导入重新生成**，导出文件里的 `archiveId` 不得作为数据库写入目标；
- 之后按摘要去重，重复导入不覆盖已有标题与正文。

导出文件名经 `safeExportFileName` 清理（去路径分隔符、控制字符、Windows 保留名、限长），标题不会被当作路径。

---

## 10. Ports 与桌面实现

### NavigationPort

| | |
| --- | --- |
| 基础实现 | `src/adapters/dsh-navigation.ts`：`ctx.layout.selectPanel('dsh-chat-bridge')` / `selectPanel(null)` |
| 输入 | 无 |
| 结果 | `Result<undefined>`；布局服务缺失或拒绝时 `NAVIGATION_UNAVAILABLE`（不抛异常） |
| 释放 | `dispose()` 后所有调用返回 `NAVIGATION_UNAVAILABLE` |
| 语义 | 纯导航。**不新建会话、不移动历史、不提交草稿**；`null` 是布局文档定义的“回到会话界面” |

### WebCarrierPort

| | |
| --- | --- |
| 桌面实现 | `src/adapters/desktop-web-carrier.ts`：检测 `dshDesktop.browser`，申请批准的 lease / partition |
| 输入 | `WebCarrierTarget { url?, conversationId? }`；URL 默认官方根页面；单独 conversationId 不拼接猜测路由 |
| 结果 | `open()` 的成功只表示已接受导航；加载成功/错误通过 `PresentedWebCarrier` 状态观察 |
| 限制 | 只接受精确 `https://chat.deepseek.com` origin，无 URL 凭据；仅在用户触发时按第 14、15 节读取 DOM，不读取 Cookie 或 token |
| 存储 | 固定插件存储标识，主进程分区在同次运行复用；不承诺跨重启登录 |
| 释放 | `mount()` 返回清理函数；晚到 lease 会释放；`dispose()` 幂等，撤除事件、guest 和租约 |
| 退路 | pending 实现仍返回 `WEB_CARRIER_NOT_IMPLEMENTED`；真实工厂在非桌面环境返回 `DESKTOP_REQUIRED` |

`PresentedWebCarrier` 另外定义 `mount(host)`、`subscribe()`、`getSnapshot()`、`reload()`，仅供 DOM 呈现层使用。状态为 `idle / starting / loading / ready / error`；`ready` 表示网页就绪，不代表已登录或已同步。渲染层只在观察到外站导航后停止 guest，不能替代主进程导航策略。

### WorkImportPort

| | |
| --- | --- |
| 桌面实现 | `src/adapters/native-work-importer.ts`；pending 适配器保留作为不可用实现和档案预览器 |
| `prepare()` 输入 | `WorkImportRequest { schemaVersion: 1, requestId, archiveId, expectedFingerprint, workspaceId?, acceptUnestimatedContext? }` |
| `prepare()` 结果 | `WorkImportPreview`；档案不存在 `ARCHIVE_NOT_FOUND`，摘要不符 `ARCHIVE_CORRUPTED`，请求畸形 `UNSUPPORTED_VERSION` / `INVALID_HISTORY` |
| 工作区 | 可选 `listWorkspaces(signal?)` 返回真实已有 `{ id, title, path }`；commit 必须再核对 registry，不创建目录；alpha.6 的等待与取消见第 17 节 |
| `commit()` 前提 | 合法请求/预览身份、来源摘要不变、已选已有工作区、`acceptUnestimatedContext === true` |
| `commit()` 结果 | 创建或复用原生 Session，以公开 seed / Session 接口保存引用历史上下文，输入保持空白；只有 flush 后读回保存的完整来源与上下文且收据保存成功才返回成功（第 16–24 节） |
| 原生记录 | 历史仍是引用资料，未作为伪造助手/工具事件导入；不调用 send/submit 或模型 |
| 释放 | 原生 adapter 取消等待并释放 retain；已有半完成会话不删除，来源档案不删除 |
| pending | `commit()` 仍恒 `WORK_IMPORT_NOT_IMPLEMENTED`，收据数组恒空；仅该实现具有基础版的未实现语义 |

`WorkImportPreview.workspaceId` 在选择前为 `null`，选择后为真实字符串 ID。`contextCapacity` 仍恒为 `{ state: 'not-estimated' }`，不输出虚构 token 数、模型容量或可放下结论。用户需在原生输入框追加本次工作任务并主动发送，首次工作推理遵守 DSH 原有额度和权限设置。

### 原生工作收据与失败重试

- `WorkImportReceipt` v1 保存 `requestId / sourceArchiveId / sourceFingerprint / workspaceId / nativeSessionId / importedAt / importedRange: 'full' / transferMode: 'quoted-draft'`，无正文和凭据。
- 数据库 `dsh-chat-bridge.work-imports.v1`，`receipts` store 以请求 ID 为键；存储不可用即失败，不回退内存成功。
- 会话 ID 为 `session-dsh-chat-bridge-<requestId>`；同次请求在失败重试时复用。开始 commit 后不能改工作区；换目标需关闭并新建预览，可能保留原半完成会话。
- 原生 draft mirror 的基线键 `dsh.conversation.<sessionId>` **只读**核对；写入由 DSH 自身完成。核对失败不产生成功收据。
- JSON 引用资料保留全部结构化历史或完整 source-text；原始导出格式继续保存在档案。尖括号及原生 editor 的占位字符转为 JSON Unicode 转义，解码值不变，避免内容破坏引用边界或被占位清理删除。
- 草稿引用提示不等于安全策略；转工作后的工具权限由原生工作会话控制，用户的新工作任务才是当前授权。
- 成功收据证明当时交接已完成，不保证用户后来没有修改草稿或删除会话。关闭/停用插件不自动删除档案、草稿或原生会话。

---

## 11. 客户端本地化与错误呈现

- 命名空间 `dshChatBridge`，中英文字典键集合完全一致（类型强制）。
- 核心（`src/shared`、`src/import`、`src/storage`、`src/adapters`）不依赖任何客户端字典，只产出字符串键；客户端 `presentation.ts` 的 `warningKeys()` 用显式白名单把它们收敛为字典键，未知键被丢弃而不是渲染成裸键。
- 错误一律经 `errorText()` 渲染：码对应的整句 + 可选字段路径，放在 `role="alert"` 容器里。

---

## 12. 下一阶段需要重述的地方

1. 档案若改为 Host 档案服务，继续实现同一 `ArchiveRepository` 接口，并由该改动负责明确的数据迁移（从 IndexedDB 读出 → 写入 Host）。
2. `WorkImportReceipt` 的字段在真实实现前不得改动含义；`importedRange` 目前只有 `'full'`，压缩/分段策略加入时需要显式版本迁移。
3. 网页来源已采用独立 v2 记录，既有手动 v1 不迁移。分支树、完整远端历史与附件原文加入时仍需显式合同和兼容策略。

## 13. 布局与导航合同（alpha.2）

- 主内容区不常驻档案列表/详情，只呈现网页 guest；按钮与说明在主标题栏。剩余宽高由 flex 分配，不使用固定网页最小高度挤出输入区。
- 侧栏 footer 包含完整本地档案投影、导入入口与管理入口；管理窗口里的搜索只过滤管理列表。折叠侧栏保留带无障碍名称的管理图标。
- `archiveDialog: 'list' | 'detail'` 是插件生命周期内的临时 UI 状态，不写入档案 schema。详情、重命名和删除确认依次呈现，不叠加多个档案对话框。
- 关闭管理不卸载网页；手动导入确认后可打开已保存档案详情。关闭导入期间的异步保存不会强制复活详情窗口。
- 工作会话的聊天入口注册到公共 `conversation.session.header.utilities` list，ID 为 `dsh-chat-bridge-work-modes`，生命周期由 slots 管理；不替换原生标题栏。
- 空白工作页滑块使用 `data-content-phase="hero"`（skeleton 呈现阶段，不能写业务阶段 blank）。两种工作入口都只调用导航，不改变工作会话身份、草稿、历史、额度或权限，不自动转存工作历史到网页。

## 14. 当前网页采集合同（alpha.3）

- `WebCarrierPort.captureCurrent?(signal)` 返回 `Promise<Result<WebConversationCapture>>`。只在用户点击时执行两次固定 DOM 读取；未接入的 Port 可省略方法，调用方显示 `WEB_CAPTURE_UNAVAILABLE`。
- 结果字段：`adapter: 'deepseek-dom-2026-10-01'`、真实 `url`（origin + pathname，不携带查询/片段）、可编辑来源标题、`scope: 'rendered-current-branch'`、`completeness: 'partial'`、线性 `messages`。消息 ID 来自观察到的虚拟行 key，缺少 key 时使用本次采集内的本地顺序 ID；均不冒充远端会话 ID。
- 适配器基于官方公开前端脚本的渲染代码，限定 `main.6fca03582d.js`。网址、版本、角色结构、正文和代码异常时拒绝采集。生成/加载控制、未发送草稿、两次内容差异、导航、关闭和 12 秒超时都有明确停止路径。
- alpha.3 用户必须在原文预览勾选范围确认，才能保存；alpha.4 增加第 15 节的显式持久快捷选择。核对模式取消前不写数据库、不创建工作会话。保存中按钮禁用，导航离开可能保留已完成写入的本地档案，但晚到完成不强制开启工作窗口。
- 网页快照写 `ChatSnapshot.schemaVersion: 2`：其余顶层字段与 v1 相同；`source.kind: 'web-dom'`、`source.url` 必需，`source.capture` 必需 `{ adapter, scope, capturedAt }`；不设置 `fileName` 或 `conversationId`。`history` 必须为消息形态、`partial`，`original.format` 必须为 JSON。
- `original.text` 是固定序列化的 `{ format: 'dsh-chat-bridge.web-capture', schemaVersion: 1, capture }`。它是采集时的文字快照，不是网站原始 HTML/Markdown，也不含本地时钟；沿用现有 format + 原文摘要算法，使同内容重复读取能去重。规范化消息及来源 URL/adapter/scope 必须与该 JSON 重建结果一致，存储与重导入均核验。
- v1 手动记录和其原文不迁移、不重写。数据库/store 结构不变，新 reader 接受 v1/v2；完整导出 wrapper 版本与 snapshot 对齐。旧版拒绝 v2 完整导出；降级不应删除显示为不可读的网页记录。网页原文 JSON 用于备份，重新导入使用完整档案 JSON。
- 先保存来源档案，再复用现有 `prepare/commit`。收据 `importedRange: 'full'` 表示已确认的本地快照全部进入草稿，不能解释为服务端全量历史。工作预览继续显示 partial、容量未估算和附件/隐藏内容缺口。
- 新错误码：`WEB_CAPTURE_UNAVAILABLE / UNSUPPORTED / EMPTY / BUSY / DRAFT_PRESENT / CHANGED / CANCELED`（均带 `WEB_CAPTURE_` 前缀）。另沿用 `INPUT_TOO_LARGE` 等校验错误。错误不含正文、凭据或原始返回值。
- 公开脚本依据、范围和未验证项见 PAGE-CAPTURE.md。纯插件代码可构建不等于官方桌面已成功采集。

## 15. 记住工作区与快捷转换（alpha.4）

- 主界面 localStorage 独立键 `dsh-chat-bridge.transfer-preferences.v1`，结构为 `{ schemaVersion: 1, policy: 'rendered-quoted-v1', workspaceId: string, quickEnabled: boolean }`。严格检查键/版本/类型/ID 长度，损坏或未支持值不启用快捷；不读写网页存储，不保存正文/账号/凭据。
- 首次无记录则不开启快捷。核对模式一个窗口选择工作区、确认已渲染范围与未估算上下文，才可以保存来源并自动走 native prepare/commit；可选择交接成功后记住并开启快捷。不再二次询问同一决定。
- 快捷模式每次重新读设置、从已有 workspace registry 确认 ID，在成功读取/校验页面后按已接受策略自动存档并创建引用草稿。每次仍由用户点击触发；模式滑块只导航，没有自动发送/同步。顶部持续显示 partial 范围提醒，保留逐次预览与转换设置入口。
- 已移除的目标或列表不可用不改投其他工作区，不继承范围/上下文确认；停在核对或错误界面。换目标取消快捷勾选，用户需再次开启。native commit 继续再核对真实 registry 与来源摘要。
- 常规档案交接成功会记住 workspace ID；不会凭空开启快捷。原快捷只在同一目标保留。网页预览中的快捷选择在交接成功后保存；设置窗口也可独立保存，不创建会话。
- 设置写入采用 setItem + 全值 read-back；失败在本次运行抑制旧值自动启用，报 `TRANSFER_PREFERENCES_UNAVAILABLE`（无用户内容）。设置不支持内存“已记住”降级；草稿已成功但设置失败用单独文案说明，重启后旧记录可能仍在。
- 临时状态 `capture` 新增 workspace/范围与上下文确认/快捷选择，`transferSettings` 与 `transferPreference` 属 UI 状态；原四个 Port、快照 v1/v2 和收据 v1 格式不变。
- 同步 busy 阻止重复点击；native 失败保留同次 request ID 与 target lock。页面读/存档取消丢弃晚到结果；工作准备期宿主导航也取消，绑定 retain 使用可释放取消监听，自己打开 native 后改用原导航信号。半完成会话不删除。
- policy 只接受当前版本的「rendered-current-branch、partial、quoted-draft、容量未估算」行为。未来范围、发送、容量策略变化应改 policy 并重新取得快捷选择，不能沿用本版选项自动扩大行为。


## 16. alpha.5 原生历史上下文导入（覆盖第 10、15 节旧草稿路径）

- WorkImportRequest/Preview 保持 v1，acceptUnestimatedContext 现指将全文存入原生上下文；预览范围不变。
- 新 Host Remote namespace dshChatBridge、service dshChatBridgeHistory、method importHistory。严格 Typert codec 参数为 requestId/workspaceId/acceptUnestimatedContext:true/snapshot，限额沿用 64 MiB 档案、5 MiB original、5000 消息；JSON 结构、来源版本、正文、指纹均独立验证。
- Client Remote 返回 RemoteResult<Result<WorkImportReceipt>>，不能把外层成功当作业务成功。承载失败与域失败分别映射，错误不含用户正文。
- 只创建 ID session-dsh-chat-bridge-history-${requestId} 的新 Agent；已存在时必须核对摘要、来源标记、cwd，不能写入任意既有 Session。快照创建前全部验证，标准 seed 创建 native driver，不在活跃 driver 上临时插入 turn。
- 当前 seed 顺序见第 19 节，修正旧版空 system head 位于步骤之外的问题。导入完成的 turn 只用于正常重建原生会话状态，之后的任务由普通 Agent 继续。
- 用户上下文 source.kind=dsh-chat-bridge-history，form=snapshot；sections 是可读原问答，snapshot 保存完整档案，transfer 保存收据与完整规范化请求 SHA256。模型 content 为完整带角色的引用 JSON，不追加“我的工作任务”尾巴。输入不写入，不提交。
- 源文仍为外部引用，不能当成新任务授权。所有原始正文及完整性保留；附件元数据不代表内容已读取。
- 新收据 v1 transferMode=imported-context；旧 quoted-draft 仍按旧前缀读取。full 仅指本地档案的全部记录，网页仍 partial。
- 成功门槛：workspace attach、标题、Session flush 返回有效 checkpoint，然后 persistence.open(read).read 的源快照与模型 content 与输入一致。原生正文不依赖本地 IDB，IDB 收据仅关联。不直接修改宿主文件或配置。
- 新错误 WORK_HISTORY_NOT_SAVED：没有 checkpoint 或持久化读回不匹配。一般导入失败仍用 WORK_IMPORT_FAILED；导航取消用 WORK_IMPORT_CANCELED。取消/失败可留会话，重复同次 request 复用，不自动删除。
- 主界面设置 key 与 schema 保持不变，policy 升级为 rendered-context-v2。旧 rendered-quoted-v1 合法值只沿用目标工作区，quickEnabled 返回 false，需新策略确认。旧草稿不会自动改写。
- 实机仍需验收后续模型上下文、原生 renderer、重启、卸载恢复。本文描述实现合同，不能作为已经通过的行为证据。

## 17. alpha.6 准备阶段与动态服务访问

- Client 在 `$mount(HISTORY_REMOTE)` 完成后，用公开 `ctx.get('remote.dshChatBridge')` 读取自有动态 Remote 服务。该键由本插件 apply 挂载，不能作为顶层 inject 的启动前置条件；直接属性访问需要注入声明，会触发 Cordis 缺少 inject 的异常。
- 工作区枚举不依赖历史 Remote 服务存在。服务缺失在 commit 返回 `WORK_HISTORY_SERVICE_UNAVAILABLE`；工作区错误不再套用通用 `WORK_IMPORT_FAILED`。
- `WorkImportPort.listWorkspaces` 增加可选 AbortSignal。原生实现只使用公开 WorkspaceSource getSnapshot/subscribe：phase=ready 且 state=idle 返回真实列表；state=error 返回 `WORKSPACE_LIST_UNAVAILABLE`；pending 或 loading 等待变化，最多 10 秒后 `WORKSPACE_LIST_TIMEOUT`。取消或插件停用返回 `WORK_IMPORT_CANCELED`。完成/取消/超时均释放监听和定时器。
- loading 可能仍包含上一次成功的列表，不用于判定目标消失或允许快捷转换。仅成功取得 ready/idle 列表且目标 ID 缺失时显示 `quick.targetMissing`。列表读取失败保持原目标元数据，但本次不开启快捷、不继承确认、不改投其他工作区。
- 捕获准备等待绑定捕获的取消信号，commit 等待绑定导航与插件 lifetime。错误只带固定结构说明，不记录原异常或用户数据。
- 无快照、策略、收据或数据库迁移；原生历史导入合同继续遵循第 16 节。

## 18. alpha.7 Host 就绪与失败阶段诊断

- Host 插件启动只要求 typert，在 apply 注册自己的严格 Remote。每次导入请求进入后，通过公开 get() 读取 sessions/agents/workspaceRegistry/sessionController/agentPresets/agentDefaultModel/sessionPersistence，全部就绪才继续。缺少返回 WORK_HISTORY_SERVICE_UNAVAILABLE，detail.service 只允许上述固定名称。服务不可用不创建会话、不改投其他接口。
- 默认 preset.resolve() 的 broken 字段非空时提前拒绝；resolve 或 setup 中 mount 失败返回 WORK_PRESET_UNAVAILABLE。setup 原异常转换为只含固定阶段/诊断码的 ImportStageFailure。
- 新 WORK_HISTORY_REQUEST_FAILED 用于 Remote 外层失败；不再同通用 Host 业务失败混为一类。Client result.decode 验证业务 Result 与收据，保持两层解包。
- 导入错误 detail 增加 stage/build，可选 fault/service；原始用户数据、异常消息、栈、路径及 Remote details 不进入诊断。stage/fault/service 使用 import-diagnostics.ts 闭合名单；无法识别的异常只报告阶段。业务层固定结构 detail 仍保留。
- Client 阶段：prepare/rpc/receipt/activate。Host 阶段：services/validate/workspace/inspect/preset/create/mount/activate/attach/title/flush/readback。转发业务错误时保留 Host 阶段；失败提示以本地中英文字典解释阶段并标当前 Client 构建版本。
- 新诊断不改变快照、收据、策略或数据库版本，不重试新会话 ID、不提交模型请求，不记录新的真实用户日志。
- alpha.6 的实际失败根因尚未确认。本版提供可见诊断与就绪检查，完整流程仍待桌面反馈。

## 19. alpha.8 系统消息边界修正与创建阶段细分

- 用户的 alpha.7 截图显示 host.create，无诊断码。它证明请求到达 Host 创建分支；不能证明 agents.create 已进入 setup、preset 挂载成功或历史已存储。实际默认模型读取也在旧 host.create 范围内。
- 只读源码中的 Session 关系校验要求 system/message 指向当前打开的 turn/step。旧 seed 的第一条 system/message 为 turn=1/step=0，且尚未打开 turn/step，不满足该规则。改为 turn/start（1）→ step/start（1/1）→ system/message（空 head，1/1）→ user/message（插件来源）→ step/end（1/1）→ turn/end（1/completed），seq 连续为 0–5，Session 自动追加普通 end-seed。
- turn/step 为封闭的导入结构；没有模型请求、助手尝试/回复、工具执行或用量事件，没有待发送输入。历史仍是完整快照与明确来源的 quoted 上下文，不伪造网页版回复为原生执行。快照、收据、策略和数据库版本不变。
- 创建路径细分为 host.model（公开默认模型读取）→ host.seed（构造导入种子）→ host.create（调用公开 agents.create，尚未进入 setup）→ host.mount（公开 setup 内挂载 preset）→ host.publish（setup 返回后，厂商 factory 的历史保存及发布）。后两阶段以公开 setup 回调标记，不读取或修改私有 factory/persistence 实现。原激活、归属、flush/readback 合同继续沿用。
- 诊断增加固定 INVARIANT/INACTIVE_EFFECT、存储格式与公开 API 不可用码；仅已知 Session invariant 消息前缀可映射 session/system-message-outside-step。cause/AggregateError 搜索最多 12 个对象，避免包装异常丢失固定错误码；未知异常明确返回 runtime/type-error、runtime/range-error 或 runtime/unclassified，不保留异常全文、栈、路径或用户数据。
- 转发保留 Host 的允许构建号（alpha.5–8），不再用 Client 号覆盖。Host 号与当前 Client 不一致时提示完全退出并重启；未知版本字符串不显示。未出现此提示不能代替已安装文件核对或证明全部模块为同一版。
- 已保存的旧导入会话不改写、不删除。相同请求仍复用原 ID；新一次转换生成新请求 ID。旧失败记录是否实际保存，以及本次失败是否由该种子规则导致，均未取得运行时证据，不宣称全链路已恢复。

## 20. alpha.9 macOS chrome 与分享包

- 用户在 alpha.8 交付后确认当前转工作顺利；这份用户反馈不替代完整 H1–H10 或 Mac 实机结果。历史 seed、传输、存储与不驱动模型的导入合同保持第 19 节实现。
- Client 只读宿主 `<html data-platform>` 和 `data-fullscreen`，不得写这些标记或调整宿主窗口控制位置。darwin 普通窗口在自己的主面板使用 16px + `--dsh-frame-top-clearance`（缺失 fallback 48px）；全屏恢复 16px。其他平台不额外增加主面板顶部 clearance。React 订阅只监听这两个属性，释放断开。
- 插件对话框顶部 padding 使用 max(24px, `--dsh-frame-overlay-top`)，由宿主已有的 window/fullscreen CSS 控制；其余默认间距不变。所有样式仍以 `.dshcb-` 开头。控件、输入、webview 明确 no-drag；组合输入 `isComposing` 为真时不处理 Modal Esc/Tab。不读取或重映射网页键盘、剪贴板或账户存储。
- `distribution/macos` 安装助手默认查找系统/用户 Applications 下的 DeepSeek Harness.app，可显式 --app；使用其 `Contents/Resources/runtime/cli/bin/dsh`。要求原生 executable 可读、进程已退出，安装前验证 ZIP 同目录 tgz 的 SHA256。进程查询出错、CLI 缺失、包缺失或哈希不同即停止。只执行官方 plugin add/remove/list，不 sudo、不自动退出应用、不直接编辑 app 或 profile 配置；CLI 自己负责写锁与兼容性校验。
- ZIP 为额外分享产物，不是替换 Desktop 的 .app/dmg。同一 npm tgz 供不同系统与 CPU 使用，宿主负责自身平台依赖。Python 标准库仅用于开发打包，安装不要求 Python；脚本记录 LF/Unix 0755 与 SHA256SUMS，打包前确认 tgz 身份和版本、没有链接或原生二进制。
- 登录隔离/运行期复用、DOM partial、容量未估算、快捷规则与档案删除边界沿用原合同。Windows 工作区 ID、账号登录或原生会话不自动迁移到 Mac；手动档案可导出后重新导入，目标工作区在 Mac 选择。无格式、错误码、策略或数据库迁移。
- 当前执行环境 Windows；Mac 适配依据同基线公开源码，实际 Mac 安装、视觉、IME、网页交互、历史转换、持久性与卸载恢复均未实机执行，不能称为 Mac 验收通过。

## 21. alpha.10 模式菜单与视觉一致性

- 替换的只有插件在宽侧栏新会话上方加入的模式控件；不替换宿主组件，不改官方网页内容。仍根据基线 New Session 语义锚点定位，歧义或收窄时移除新增控件，公开聊天区入口继续工作。
- 控件为 button + body 中的自有 ARIA listbox。选项工作区/聊天区使用本地 SVG、文字说明和选中勾；触发按钮与 option 按当前活动面板同步。选择另一模式仅调用原 openChatPanel/returnToWork；选中当前项只关闭菜单，不触发模型、历史转换或会话创建。
- button 公开 aria-haspopup/listbox、expanded/controls 与本地化名称；popup 用 option/selected、labelledby/describedby 和 activedescendant。键盘方向键、Home/End 移动高亮并滚动可见项，Enter/空格确认，Esc 关闭并恢复触发焦点，Tab 关闭并继续自然导航。点击外部或焦点移到外部关闭，不抢走外部目标焦点；组合输入时不处理按键。
- Portal 固定坐标依据 trigger rect/viewport，宽度匹配侧栏且有可读最小值，受视口宽度限制；下方不够则向上，顶部遵守宿主 --dsh-frame-overlay-top。滚动/resize/宿主 fullscreen 和 platform 变更后更新。窗口高度不足时菜单内部滚动。打开期间注册的文档 pointerdown/focusin/scroll 和 resize 监听，关闭时释放；锚点更换或插件停用时移除 overlay、trigger 和所有监听。
- 插件按钮、模式滑块、侧栏工具、档案选中态、正文行高及表单间距采用统一样式。所有选择器仍只在 .dshcb- 自有节点生效，颜色采用宿主 token；本地 SVG 无远程字体、图片或新依赖，尊重 prefers-reduced-motion。菜单在 light/dark 使用同一主题规则，不能将静态源码当作已验证的对比度/读屏结果。
- Modal 添加有本地化名字的标题关闭按钮，调用原 onClose；body 单独滚动，标题与 footer 操作不随正文滚走。Escape、组合输入、Tab 循环、取消与恢复焦点逻辑沿用现有合同，不改变忙碌状态下 controller 的关闭规则。
- 不改变快照、策略、收据、数据库、原生工作上下文或 WebCarrier 的生命周期；菜单导航与主题更新不重新挂载网页，不新增网页登录或远端历史同步。诊断构建号升到 alpha.10，保留 alpha.9 Host 的允许转发号。
- 本轮没有新增/运行测试或访问真实 Desktop/profile。Windows/Mac 的实际布局、交互、键盘/读屏、浅深色和长内容仍待实机确认；提供同一个 npm tgz 与更新版本的 Mac 分享 ZIP。

## 22. alpha.11 聊天/工作共用固定切换

- 用户要求两种模式的控件处于同一位置。移除聊天页工具栏内的滑块、已有工作标题 utilities 注册及 hero composer 追加滑块，只保留 body 中一个常驻 .dshcb-fixed-modes。节点在模式往返时不重建；两个等宽按钮按真实 activePanelId 更新 aria-pressed 和本地化名称，导航方法仍是原 openChatPanel/returnToWork。
- ChatBridgePanel 渲染自有 .dshcb-mode-seat；原生会话布局仅在公开 [data-slot="main"] 包装唯一、其直接根节点有 hero/active/settling phase 且具备 conversation-header-leading/content 语义标记时加入自有占位行。不能修改宿主属性、padding、drag 标记或替换组件，不根据随机 CSS 名推断布局。
- 占位行以主区域顶部为基准，普通模式高度 56px，Mac windowed 额外包含宿主 --dsh-frame-top-clearance（fallback 48px），fullscreen 取消该额外间距。按钮宽 168px、高 40px，固定在占位行水平中心及其末尾 56px 行的 top+8。两页采用同一算法，因此相同窗口/列布局下位置一致；工具栏在占位行下面，不用额外透明控件盖住宿主按钮。
- ResizeObserver 只读当前主区域尺寸，结合既有 DOM 语义/根 html platform/fullscreen、locale/panel/resize 订阅定位。变更主面板时断开旧根并移除旧 native seat，再绑定新根；其他主面板、未知或歧义根、不足 192px 的区域不显示或猜屏幕坐标。缩放/列布局改变按新主区域定位，不保证改变窗口几何后的旧坐标。
- 切换控件在网页载体不可用时仍可导航；侧栏新会话拦截与下拉菜单继续受 WebCarrier capability 约束。网页 guest、历史转换、现有工作会话和输入草稿生命周期保持原合同，不产生模型请求，不保存屏幕位置或新增持久化数据。
- 控件使用 .dshcb- CSS 及 no-drag，普通页面 z-index 30，低于插件菜单/对话框。关闭/停用释放 ResizeObserver、占位行、按钮和所有原 desktop-layout 订阅。原有宿主标题与工具不改写；禁用后原生布局恢复。
- 构建号更新 alpha.11，允许转发 alpha.10 Host 诊断；无数据、错误码、策略、收据或依赖迁移。实机两页坐标、侧栏/右面板/窗口变化、焦点与 Mac 行为未验证；未新增/运行测试，继续提供共用 npm tgz 和 Mac ZIP。

## 23. alpha.12 工作页原生根包装修正

- 用户截图确认 alpha.11 聊天页有常驻切换，已有工作页没有切换和占位。源码查明旧 mainRoot 只遍历 main 的直接 DOM 子节点，而 ConversationPanel 返回公开 main.conversation Slot；Slot 的 display:contents 包装没有盒子，但仍在 DOM 层级中，阻断旧定位。
- 原生路径修正为唯一 [data-slot="main"] → 唯一直接 [data-slot="main.conversation"] → 其直接 HTMLElement 候选根，再按既有 hero/active/settling phase 和 conversation-header-leading/content 标记核对。Chat 仍为 main 的直接插件根。包装缺失/歧义或语义不符仍停止，不通过随机类名、任意递归或缓存坐标兜底。
- 其余第 22 节常驻节点、等宽按钮、原生自有 seat、ResizeObserver、Mac clearance、导航/焦点与释放合同保持。修正适用于该源码路径上的空白、已有和加载会话，不触及原生会话、草稿、网页账号或安装/profile。
- 构建号 alpha.12，保留 alpha.11 Host 允许转发；无新依赖、数据/策略/收据/错误码迁移。执行边界仅静态检查与本地构建打包，未新增/运行测试、未操作真实 Desktop；实际工作入口恢复和 Mac 仍待实机确认。


## 24. v1.0.0 发布审查修复

- `ChatBridgeController.readFile()` 接收 name/size/arrayBuffer 边界，在扩展名与 File.size 检查通过后才读取；chooseFile 保留解码前的实际字节闸门。异步读取与当前 draft 身份绑定，关闭/重建窗口后忽略迟到结果；读取失败返回 FILE_READ_FAILED。
- 导入处于读取/解析/保存 busy 期间，输入字段与模式切换冻结；关闭仍遵循原合同。保存前 normalizeTitle，并把预览中的新标题写入 snapshot.title。标题是元数据，不修改原文、指纹或历史；重复内容维持已有档案及其标题。
- 网页取得租约后，DOM 创建、属性设置、preload 订阅、事件绑定和挂载都在同一异常收尾边界。失败释放租约和节点；旧 mount 返回的清理同时核对 host 和 generation，避免卸载新挂载；release 的同步/异步异常都不泄漏到 UI。
- Modal 的 Tab 焦点循环包含最初的 dialog 容器、外部焦点和无控件状态，Shift+Tab 不从初始容器逃出。组合输入期间 Escape 规则保持。
- 新增 42 项回归，更新旧注入/异步 apply/档案弹窗/v2 断言。19 文件 / 177 用例通过，类型检查、lint 与构建通过；覆盖原生导入种子/并发/重试/取消/flush/readback、Client 导航和 workspace 等待、网页生命周期、来源往返、模式根/释放及上述表单与焦点修复。
- 版本、锁文件、诊断构建号与 UI 标记统一 1.0.0，诊断继续接受 alpha.5–12。无依赖、数据库、快照、收据或策略迁移。正式版号不改变 partial、上下文未估算、登录进程生命周期等功能边界。
- 测试是合成服务/DOM 与本地代码检查；未操作实际安装/profile，不据此宣称 Mac、真实页面/布局、重启与后续模型上下文已验收。发布检查见 RELEASE-1.0.0.md。


## 25. v1.0.0 网页历史侧栏

新增独立 WebHistoryPort：getSnapshot / subscribe / refresh(more?)；由受管理网页载体拥有并释放。只在网页 ready 时每 3 秒读取已加载 DOM 标题/链接，一次一个读取，6 秒超时，导航/重载/卸载使旧结果失效。切工作可保留标为 paused 的内存链接；重新挂载清空并重读。登出、加载、失败或不支持清空，结果不持久化、不累加、不混入本地档案。

固定 scope loaded-sidebar；phase ready/loading/signed-out/sidebar-closed；items 为 url/title；pageUrl 为清除 query/hash 的同源地址；loadingMore 为布尔值。通过独立验证器检验所有字段、重复 URL、规范会话路径。限制 5000 个条目、1 MiB 元数据、单标题 1024 UTF-16 单位，超限拒绝。点击链接只导航；正文仍需显式采集/转换。显式 more=true 仅滚动已确认的网页历史容器，自动刷新不滚动、不点击、不读存储或私有接口。

新增错误 WEB_HISTORY_UNSUPPORTED / WEB_HISTORY_LOAD_FAILED / WEB_HISTORY_TOO_LARGE / WEB_HISTORY_UNAVAILABLE，均闭合本地化且不带网页内容。固定前端解析基线、结构依据、分页与验证边界详见 WEB-HISTORY.md。191 用例的合成验证不能替代新侧栏实机验收。
