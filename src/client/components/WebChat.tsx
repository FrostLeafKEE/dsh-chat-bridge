/** Official page container and host-owned controls; capture is explicitly user-triggered. */
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import type { PresentedWebCarrier } from '../../adapters/desktop-web-carrier'
import { DEEPSEEK_WEB_URL } from '../../adapters/desktop-web-carrier'
import type { Translate } from '../presentation'
import { ErrorBanner } from './Notices'
import { BridgeIcon } from './BridgeIcon'

/** Controls live in the panel header, keeping the entire canvas for the guest. */
export function WebChatActions({ t, carrier, onCapture, onReview, onSettings, quickEnabled = false, captureDisabled = false }: {
  t: Translate; carrier: PresentedWebCarrier; onCapture?: () => void; onReview?: () => void; onSettings?: () => void
  quickEnabled?: boolean; captureDisabled?: boolean
}): ReactNode {
  const state = useSyncExternalStore(carrier.subscribe, carrier.getSnapshot)
  return <div className="dshcb-web-controls">
    {onCapture === undefined ? null : <button className="dshcb-button dshcb-button-primary" type="button"
      disabled={captureDisabled || state.phase !== 'ready'} onClick={onCapture}><BridgeIcon name="transfer" />{t(quickEnabled ? 'quick.action' : 'capture.action')}</button>}
    {onReview === undefined || !quickEnabled ? null : <button className="dshcb-button" type="button"
      disabled={captureDisabled || state.phase !== 'ready'} onClick={onReview}>{t('quick.review')}</button>}
    {onSettings === undefined ? null : <button className="dshcb-button dshcb-button-subtle" type="button"
      disabled={captureDisabled} onClick={onSettings}><BridgeIcon name="settings" />{t('quick.settings')}</button>}
    <button className="dshcb-button" type="button" disabled={carrier.capability.state !== 'available'}
      onClick={() => { carrier.open({ url: DEEPSEEK_WEB_URL }) }}><BridgeIcon name="plus" />{t('web.home')}</button>
    <button className="dshcb-button dshcb-button-subtle" type="button" disabled={carrier.capability.state !== 'available'}
      onClick={() => { carrier.reload() }}><BridgeIcon name="refresh" />{t('web.reload')}</button>
    <details className="dshcb-web-help">
      <summary className="dshcb-button dshcb-button-subtle"><BridgeIcon name="info" />{t('web.info')}</summary>
      <div className="dshcb-web-help-popover">
        <p>{t('web.sessionNote')}</p><p>{t('panel.basicNote')}</p>
      </div>
    </details>
  </div>
}

export function WebChat({ t, carrier }: {
  t: Translate
  carrier: PresentedWebCarrier
}): ReactNode {
  const state = useSyncExternalStore(carrier.subscribe, carrier.getSnapshot)
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = host.current
    return element === null ? undefined : carrier.mount(element)
  }, [carrier])
  return (
    <section className="dshcb-web-card" aria-label={t('web.title')} data-dsh-chat-bridge="web-carrier-host">
      <div className="dshcb-web-status">
        {carrier.capability.state === 'unavailable' ? <p role="status">{t('capability.webCarrier.desktopRequired')}</p> : null}
        {state.phase === 'starting' || state.phase === 'loading' ? <p className="dshcb-note" role="status">{t('web.loading')}</p> : null}
        {state.error === undefined ? null : <ErrorBanner t={t} error={state.error} />}
      </div>
      <div ref={host} className="dshcb-web-host" data-dsh-chat-bridge="web-carrier" />
    </section>
  )
}
