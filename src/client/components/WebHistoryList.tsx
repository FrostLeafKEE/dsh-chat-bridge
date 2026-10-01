import { useState, useSyncExternalStore, type ReactNode } from 'react'
import type { PresentedWebCarrier } from '../../adapters/desktop-web-carrier'
import type { ChatBridgeController } from '../state/controller'
import { errorText, type Translate } from '../presentation'
import { BridgeIcon } from './BridgeIcon'

/** Website links and local archives remain separate; only an explicit transfer persists messages. */
export function WebHistoryList({ t, carrier, controller }: {
  t: Translate; carrier: PresentedWebCarrier; controller: ChatBridgeController
}): ReactNode {
  const state = useSyncExternalStore(carrier.history.subscribe, carrier.history.getSnapshot, carrier.history.getSnapshot)
  const guest = useSyncExternalStore(carrier.subscribe, carrier.getSnapshot, carrier.getSnapshot)
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState(50)
  const matching = state.items.filter(item => item.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const blocked = carrier.capability.state !== 'available'
  const ready = state.phase === 'ready'
  return <div className="dshcb-sidebar-web-history">
    <div className="dshcb-sidebar-history-heading">
      <span>{t('history.title')}</span>
      <span className="dshcb-entry-count" aria-label={t('history.count', { count: state.items.length })}>{state.items.length}</span>
      <button type="button" className="dshcb-sidebar-refresh" disabled={blocked || state.refreshing}
        title={t('history.refresh')} aria-label={t('history.refresh')} onClick={() => {
          controller.openChatPanel(); void carrier.history.refresh()
        }}><BridgeIcon name="refresh" /></button>
    </div>
    {state.items.length === 0 ? null : <input type="search" className="dshcb-input dshcb-sidebar-search"
      aria-label={t('history.search')} placeholder={t('history.search')} value={search}
      onChange={event => { setSearch(event.target.value); setShown(50) }} />}
    <div className="dshcb-sidebar-archives dshcb-sidebar-web-list" aria-label={t('history.title')}>
      {matching.slice(0, shown).map(item => <button type="button" key={item.url} className="dshcb-sidebar-archive"
        title={item.title} aria-current={guest.url === item.url ? 'page' : undefined}
        onClick={() => { controller.openWebConversation(item.url) }}>{item.title}</button>)}
      {matching.length > shown ? <button type="button" className="dshcb-sidebar-archive dshcb-note"
        onClick={() => { setShown(shown + 50) }}>{t('history.showMore')}</button> : null}
      {state.error === undefined ? null : <p className="dshcb-note" role="status">{errorText(t, state.error)}</p>}
      {state.phase === 'signed-out' ? <p className="dshcb-note" role="status">{t('history.signIn')}</p>
        : state.phase === 'sidebar-closed' ? <p className="dshcb-note" role="status">{t('history.openSidebar')}</p>
          : state.phase === 'loading' ? <p className="dshcb-note" role="status">{t('history.loading')}</p>
            : state.phase === 'unavailable' ? <p className="dshcb-note" role="status">{t('error.WEB_HISTORY_UNAVAILABLE')}</p>
              : state.phase === 'paused' ? <p className="dshcb-note">{t('history.paused')}</p>
                : ready && matching.length === 0 ? <p className="dshcb-note">{t(search.trim() === '' ? 'history.empty' : 'history.noMatch')}</p> : null}
    </div>
    <p className="dshcb-sidebar-history-scope">{t('history.scope')}</p>
    <button type="button" className="dshcb-button dshcb-sidebar-more" disabled={!ready || state.loadingMore || state.refreshing}
      onClick={() => { controller.openChatPanel(); void carrier.history.refresh(true) }}>
      {t(state.loadingMore || state.refreshing ? 'history.loadingMore' : 'history.loadMore')}
    </button>
  </div>
}
