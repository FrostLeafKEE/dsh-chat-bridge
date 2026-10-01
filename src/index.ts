/** Host half: registers the standalone history-import Remote service. */
import type { Context } from '@deepseek-ai/cordis'
import { applyHistoryHost } from './host/history-service'

/** Package name, Client factory id and root Loader row id. */
export const name = 'dsh-chat-bridge'
// Keep the diagnostic endpoint visible even if a core import dependency is not ready.
// Import dependencies are resolved through public get() before any side effect.
export const inject = ['typert']

export function apply(ctx: Context): void { applyHistoryHost(ctx) }
