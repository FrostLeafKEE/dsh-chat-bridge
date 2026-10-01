/**
 * Client half of `dsh-chat-bridge`: the plugin body the DSH web shell loads
 * lazily from `lib/client.js`.
 *
 * What it contributes through public slots:
 *  - a keyed entry in the `main` slot (`dsh-chat-bridge`) holding the chat panel;
 *  - an entry in the `sidebar.footer.action` list holding the sidebar "Chat"
 *    button and archive tools, which live under the project area;
 *  - one resident mode switch aligned across the Chat and Conversation panels;
 *  - its own locale namespace and a single plugin-owned stylesheet.
 *
 * Everything registered here is owned by this fiber: `slots.register` and
 * `slots.inject` install their disposers through the caller's context, and the
 * controller, desktop additions and stylesheet are released by `ctx.effect`, so
 * disabling the plugin removes the panel, the button, the style tag and the
 * subscriptions with no residue.
 *
 * `inject` names the Cordis services the body needs; the client module graph
 * additionally loads the layout, sidebar and locale bundles first through
 * `dsh.client.inject` in `package.json`.
 *
 * @module dsh-chat-bridge/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: `ctx.locale` (the augmentation lives on the locale client half).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: `ctx.slots` and the slot component prop types.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: `ctx.layout`, the `main` keyed slot, and the `MainPanelId` brand.
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the `sidebar.footer.action` slot declaration and its owner props.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { createDshNavigationPort } from '../adapters/dsh-navigation'
import { createDesktopWebCarrier } from '../adapters/desktop-web-carrier'
import { createPendingWorkImporter } from '../adapters/pending-work-importer'
import { createNativeWorkImporter } from '../adapters/native-work-importer'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import { HISTORY_NAMESPACE, HISTORY_REMOTE, type HistoryRemote } from '../shared/history-rpc'
import { openArchiveRepository } from '../storage/indexeddb-repository'
import { createTransferPreferenceStore } from '../storage/transfer-preferences'
import { ChatBridgePanel, type ChatBridgePanelFace } from './components/ChatBridgePanel'
import { ChatEntry, type ChatEntryFace } from './components/SidebarEntry'
import { downloadTextFile } from './download'
import { DICTIONARIES, NS } from './locales'
import { ChatBridgeController, defaultRequestId } from './state/controller'
import { installStyles } from './styles/install'
import { installDesktopLayout } from './desktop-layout'

/** Main-panel id; deliberately not the reserved `conversation` key. */
export const PANEL_ID = 'dsh-chat-bridge' as MainPanelId

/** Cordis services required before this plugin may activate. */
export const inject = ['slots', 'locale', 'layout', 'sessions', 'workspaces', 'conversation', 'uiWorkspace', 'remote']

/**
 * Client plugin body.
 * @param ctx - the browser plugin context.
 */
export async function apply(ctx: ClientContext): Promise<void> {
  await ctx.remote.$mount(HISTORY_REMOTE)
  ctx.effect(() => ctx.locale.register(NS, DICTIONARIES), 'dsh-chat-bridge: dictionaries')
  ctx.effect(() => installStyles(), 'dsh-chat-bridge: stylesheet')

  const carrier = createDesktopWebCarrier()
  const translate = ctx.locale.bind(NS)
  const controller = new ChatBridgeController({
    // Storage failure is surfaced, never downgraded to a memory repository: a
    // user must not be told an archive is saved when it is not.
    openRepository: () => openArchiveRepository(),
    navigation: createDshNavigationPort(ctx.layout, PANEL_ID),
    webCarrier: carrier,
    transferPreferences: createTransferPreferenceStore(),
    createWorkImporter: repository => {
      // Host and Client both use the Cordis key `sessions`; this standalone
      // project compiles both faces together, so make this Client boundary explicit.
      const sessions = ctx.get('sessions') as unknown as ISessions | undefined
      const workspaces = ctx.get('workspaces')
      const conversation = ctx.get('conversation')
      const navigation = ctx.get('uiWorkspace')
      // This namespace is mounted by this very plugin, so requiring it in
      // `inject` would prevent apply() from ever reaching $mount(). Cordis
      // exposes get() for this dynamic lookup; a property read requires inject.
      const history = ctx.get(`remote.${HISTORY_NAMESPACE}`) as HistoryRemote | undefined
      return sessions === undefined || workspaces === undefined || conversation === undefined || navigation === undefined
        ? createPendingWorkImporter(repository)
        : createNativeWorkImporter(repository, { sessions, workspaces, conversation, navigation,
          ...(history === undefined ? {} : { history }),
          beginNavigation: () => ctx.layout.beginNavigation(), text: key => translate(key) })
    },
    download: downloadTextFile,
    now: () => new Date(),
    newRequestId: defaultRequestId,
  })
  ctx.effect(() => () => { controller.dispose() }, 'dsh-chat-bridge: controller')
  ctx.effect(() => installDesktopLayout(ctx, controller, carrier), 'dsh-chat-bridge: desktop chrome')

  // `slots.inject` waits for the parent's declaration, so activation order
  // between this plugin and the layout/sidebar shells does not matter.
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: (): ChatBridgePanelFace => ({ controller, carrier }),
  }, ChatBridgePanel))

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: PANEL_ID,
    order: 0,
    locale: NS,
    inject: (): ChatEntryFace => ({ controller, carrier }),
  }, ChatEntry))
}
