# 原生工作历史导入（v1.0.0）

原生导入合同沿用 alpha.5–12，用户此前已确认 Windows 转工作可用。v1.0.0 补齐 Host/Client 的服务替身回归测试；真实存储重启、后续上下文与 Mac 仍需实机验收。见 RELEASE-1.0.0.md。

## 使用结果

点击转工作、确认已有工作区后，历史直接存入原生工作会话。进入会话时输入框为空，不需要先把历史发送给模型。展开原生的导入上下文块可按顺序查看原用户/DeepSeek 消息；输入下一条工作任务即可继续。

导入记录是带来源的引用上下文。完整原始快照也随原生会话保存，插件本地档案仍保留。原消息文本、角色、代码、附件元数据和 partial 标记不丢弃；附件原文仍未导入。

旧 alpha.4 工作草稿不会自动提交或改写。升级后仍记住旧工作区，但一键开关默认关闭；重新核对并开启即可使用新策略。没有已知工作区时仍先选择目标。

## 实现

1. Client 重新查询真实 workspace registry，读取并验证源档案。
2. 插件自有 `dshChatBridge/importHistory` Remote 接收限额内的全文，Host 独立核对结构、指纹和原始文本与规范化历史的一致性。
3. 以 `session-dsh-chat-bridge-history-${requestId}` 确定 ID 创建原生 Agent，通过公开 `agents.create({ seed })` 与当前默认 preset 的 `mount` 配置工具环境。
4. seed 使用标准事件：turn/start（1）→ step/start（1/1）→ 空 system head（1/1）→ 插件来源 user/message → step/end（1/1）→ turn/end（1/completed）。系统消息必须处于已开始的步骤中，即使内容为空；它仍是模型 surface 的首节点，供下一次正常请求填入真实系统提示。封闭的边界只记录上下文导入，driver 创建后没有待执行的导入任务，下一轮编号从其后开始。
5. 一个插件来源 user/message 同时携带：模型可读取的 quoted JSON、界面展示的原角色分节、完整来源快照、请求摘要和收据。没有 request/header、request/context、assistant/attempt、assistant/message、工具或用量事件，不捏造历史模型执行，也不驱动模型。
6. 将会话挂到目标 workspace、设置标题、等待 Session flush；随后打开 persistence 的只读 handle，核对完整源快照和模型上下文。
7. 两层结果分别处理：Typert RemoteResult + 业务 Result。只有 Host 成功并保存客户端元数据收据后才导航；不调用 setDraft、prompt、followup、steer。

导入后的问答以原生可展开的上下文记录展示。模型收到的是保留角色的引用资料。界面分节是原文的显示投影，模型引用 JSON 对特殊字符做转义，原值可恢复。插件只创建自己的确定 ID，不向任意现有会话追加，也不直接写宿主存储文件。

## 持久性、重试和释放

- Host 创建者归属于插件 fiber，RPC 调用上下文不能改变该生命周期。停用时取消未完成导入并释放所拥有的活动 Agent；已持久化记录保留，宿主可正常恢复。
- 同次请求并发合并；其完整规范化请求摘要不同则拒绝。新 ID 前缀与旧草稿路径分离。
- 失败或取消可留下已发布/已保存的会话；同次请求重试核对来源后继续 attach/flush/read，不再次追加历史。发现没有匹配来源标记的既有 ID 时拒绝写入。
- 旧 quoted-draft 收据可读，新收据为 imported-context。客户端收据仅用于关联，不代替 Host 的保存核对。
- `importedRange: full` 只表示这份本地档案全文；网页来源仍是 partial，不表示网页全量历史。
- 删除插件档案不删除原生会话中的来源副本；卸载不自动删除原生会话。
- 原生系统提示、当前模型、上下文容量与后续压缩行为由 DSH 处理；本插件仍未估算容量，也不缩减历史。导入无模型请求；后续工作任务使用正常工作模型。

## 验收状态

本版已运行自动测试（Host/Client 使用公开服务替身），不能代替官方桌面实测。本轮未安装/启动 Desktop、未读取实际账号/会话。需要按 MANUAL-CHECKS H1–H10 确认空输入、原生上下文、后续请求包含历史、重启及卸载恢复。
