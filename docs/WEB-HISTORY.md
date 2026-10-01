# Web history sidebar / 网页历史侧栏

## Usage / 使用

Sign in on the embedded official webpage and expand its sidebar. **Web conversations / 网页会话** appears below project sessions, separately from **Imported history / 已导入历史**. The plugin refreshes loaded titles/links every three seconds while the guest is ready. Search matches titles locally; click a title to open its real webpage URL. No messages are submitted or imported by this navigation.

在内嵌官方网页登录并展开网页侧栏后，DSH 项目会话下方会显示「网页会话」。支持标题搜索、点击打开和手动刷新。「从网页加载更多」只在你点击时滚动网页版历史容器，由网站自己的正常界面继续加载；稍后自动读取更新列表。搜索只覆盖已加载条目。

## Boundaries

- The list reflects the **loaded webpage sidebar**, not a full account export. Folded pinned groups or unloaded server-side entries may be missing. The number shown is the loaded entry count, not a claimed remote total.
- Titles/links are memory-only and replace the previous snapshot. They are not accumulated, written to IndexedDB or merged with local archives.
- While the guest is detached for Work, last-read links can remain marked paused. Reopening Chat clears/rechecks them. Navigation, login/loading states, unsupported structures and failures clear stale titles. This cannot certify account identity independently of the displayed website.
- No credential, cookie, local/sessionStorage, React store or private endpoint is accessed. Passive polls never scroll or click. Explicit load-more scrolls only the recognized official sidebar container.
- Reading a title does not fetch its message body. Only explicit capture/import/transfer saves history, under existing partial capture and capacity limitations.

## Supported structure

Official inspected build `main.6fca03582d.js`, same public artifact and SHA as [PAGE-CAPTURE](PAGE-CAPTURE.md). Render-code modules: 13401 `_6d215eb` history scroll container; 6189 `_546d736` session anchor and `c08e6e93` title; router 64197 `/a/:agentId/s/:sessionId`. `fd90d2b2` marks empty, `_06a97e9` initial loading, `_0f1bc20` append loading, `_47ef3ad`/`fa9e7cfe` failure.

Only observed anchor hrefs are used. Routes must remain credential/query/fragment-free `https://chat.deepseek.com/a/<agent>/s/<session>`. Duplicates are removed by canonical URL without combining titles from older reads. Unknown builds and multi-select button rows fail closed. No arbitrary page/user code is interpolated.

Guest output is validated separately: fixed fields, allowed states, canonical same-origin page URL, distinct supported conversation URLs, nonempty titles ≤1024 UTF-16 units, ≤5000 entries and ≤1 MiB serialized metadata. Each read has a six-second timeout; there is one in-flight read per monitor. Request/lifetime/navigation guards reject late results and all timers are released.

## Verification

The stringified script executes in synthetic DOM tests with forbidden storage/network APIs, plus validation, polling, sign-out/title replacement, navigation cancellation, stale replies, escaping, bilingual rendering and controller navigation tests. **Real Desktop history-list acceptance is pending**, and no complete remote history guarantee is made. See [manual checks](MANUAL-CHECKS.md).
