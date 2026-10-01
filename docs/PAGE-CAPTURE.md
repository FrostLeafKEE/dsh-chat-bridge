# Rendered webpage capture

Click **Transfer to work** while an embedded conversation is open and has finished generating. Clear or save any unsent/edited draft first. Review the capture, select a workspace and confirm. Quick mode uses a previously accepted scope and destination policy.

## Scope

Only the currently rendered branch is read and every capture remains **partial**. The website uses a virtual list; earlier unmounted messages, other branches, hidden reasoning, references and attachment files are not retrieved. Assistant Markdown is reconstructed from rendered DOM, so formatting may differ. Unsupported images or code structure fail explicitly.

Two bounded reads, separated by 800 ms, check for content/navigation changes. A 12-second deadline and caller cancellation stop stale captures. Generating/loader controls and drafts are checked on both reads. This does not establish remote history completeness.

## Official render-code basis

Inspected public frontend: `https://fe-static.deepseek.com/chat/static/main.6fca03582d.js` (2026-10-01), SHA256 `c1a25cbb78e344205463cf54d673c1e0f01db007697b92d84fb8131c6feab7de`.

| Element | Reader |
| --- | --- |
| Shared message row | .ds-message |
| User / assistant outer row | ._9663006 / ._4f9bf79 |
| User full text | .ds-collapsible-text > div > span |
| Assistant answer | .ds-assistant-message-main-content |
| Code | .md-code-block pre; .md-code-block-infostring |
| Virtual item key | data-virtual-list-item-key |
| Submit / stop control | ._52c986b, known path / spin marker |
| Response loader | .b4e4476b |

Execution uses the managed guest's [Electron executeJavaScript API](https://www.electronjs.org/docs/latest/api/webview-tag#webviewexecutejavascriptcode-usergesture). The fixed function reads DOM only: no storage, cookies, internal stores, private API, clicks or submissions. Guest output is revalidated before archive creation.

Native import saves the captured range as quoted history context and keeps the input empty. It does not send another message or invoke a model. See [native history](NATIVE-HISTORY.md). Website conversation-list links have a separate [sidebar contract](WEB-HISTORY.md).
