/**
 * The "Chat" entry in the sidebar's `sidebar.footer.action` list — the public
 * footer seat under the project area.
 *
 * The owner share tells the entry whether the column is wide or a 56px rail, so
 * the same component serves both: a labelled row with the local archive count in
 * wide mode, and an icon-only button with an accessible name and a tooltip in
 * rail mode. Selecting it opens this plugin's `main` panel; nothing else
 * happens, and no session is touched.
 *
 * @module dsh-chat-bridge/client/components/SidebarEntry
 */

import { useEffect, type ReactNode } from 'react'
import { IconPaperPlaneOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatBridgeController } from '../state/controller'
import { usePanelState } from './hooks'
import { BridgeIcon } from './BridgeIcon'
import type { PresentedWebCarrier } from '../../adapters/desktop-web-carrier'
import { WebHistoryList } from './WebHistoryList'

/** Business face injected into the sidebar entry registration. */
export interface ChatEntryFace {
  controller: ChatBridgeController
  carrier?: PresentedWebCarrier
}

/** Props assembled by the `sidebar.footer.action` list renderer. */
export type ChatEntryProps =
  Omit<PropsRuntime<'sidebar.footer.action'>, 'useWorkspaces'>
  & PropsLocale<'dshChatBridge'>
  & InjectFace<ChatEntryFace>

/**
 * Render the sidebar entry.
 * @param props - slot-composed props plus the injected controller.
 * @returns the entry element.
 */
export function ChatEntry({ t, controller, carrier, wide }: ChatEntryProps): ReactNode {
  const state = usePanelState(controller)
  useEffect(() => { void controller.refresh() }, [controller])
  const list = state.sidebarList ?? state.list
  const count = list.summaries.filter(summary => summary.status === 'ok').length
  return (
    <section className="dshcb-sidebar-chat" aria-label={t('entry.ariaLabel')}>
    <button
      type="button"
      className={wide ? 'dshcb-entry' : 'dshcb-entry dshcb-entry-rail'}
      aria-label={t('entry.ariaLabel')}
      title={wide ? undefined : t('entry.tooltip', { count })}
      onClick={() => { controller.openChatPanel() }}
    >
      <span className="dshcb-entry-glyph" aria-hidden="true">
        <IconPaperPlaneOutlineRegular size={16} />
      </span>
      {wide ? <span>{t('entry.label')}</span> : null}
      {wide && count > 0 ? <span className="dshcb-entry-count">{count}</span> : null}
    </button>
    {wide ? <>
      {carrier === undefined ? null : <WebHistoryList t={t} carrier={carrier} controller={controller} />}
      <details className="dshcb-sidebar-local" open={carrier === undefined ? true : undefined}>
      <summary className="dshcb-sidebar-label">{t('archives.title')} <span>{count}</span></summary>
      <div className="dshcb-sidebar-archives">
        {list.summaries.filter(summary => summary.status === 'ok').map(summary => (
          <button key={summary.archiveId} type="button" className="dshcb-sidebar-archive"
            aria-current={state.detail.archiveId === summary.archiveId ? 'page' : undefined}
            title={summary.title} onClick={() => {
              controller.openArchive(summary.archiveId)
            }}>{summary.title}</button>
        ))}
        {list.phase === 'loading' ? <p className="dshcb-note" role="status">{t('archives.loading')}</p>
          : list.phase === 'error' ? <p className="dshcb-note" role="status">{t('error.STORAGE_UNAVAILABLE')}</p>
            : count === 0 ? <p className="dshcb-note">{t('archives.empty')}</p> : null}
      </div>
      </details>
      <div className="dshcb-sidebar-tools">
        <button type="button" className="dshcb-button dshcb-sidebar-tool" title={t('archives.sidebarImport')}
          onClick={() => { controller.openImport() }}>
          <BridgeIcon name="upload" /><span className="dshcb-sidebar-tool-label">{t('archives.sidebarImport')}</span>
        </button>
        <button type="button" className="dshcb-button dshcb-sidebar-tool" title={t('archives.manage')}
          onClick={() => { controller.openArchiveManager() }}>
          <BridgeIcon name="archive" /><span className="dshcb-sidebar-tool-label">{t('archives.manage')}</span>
        </button>
      </div>
    </> : null}
    {!wide ? <button type="button" className="dshcb-entry dshcb-entry-rail" aria-label={t('archives.manage')}
      title={t('archives.manage')} onClick={() => { controller.openArchiveManager() }}>⋯</button> : null}
    </section>
  )
}
