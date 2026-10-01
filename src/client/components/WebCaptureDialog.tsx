import { useState, type ReactNode } from 'react'
import type { Translate } from '../presentation'
import type { ChatBridgeController, WebCaptureState } from '../state/controller'
import { PAGE_SIZE } from '../state/controller'
import { MessagesView } from './MessagesView'
import { Modal } from './Modal'
import { ErrorBanner } from './Notices'

/** Page text is rendered as text nodes; website HTML never enters the host DOM. */
export function WebCaptureDialog({ t, controller, capture }: {
  t: Translate; controller: ChatBridgeController; capture: WebCaptureState
}): ReactNode {
  const [page, setPage] = useState(1)
  const snapshot = capture.built?.snapshot
  const saving = capture.phase === 'saving'
  return <Modal title={t('capture.title')} closeLabel={t('dialog.close')} className="dshcb-archive-dialog"
    onClose={() => { controller.closeWebCapture() }}
    actions={<>
      <button type="button" className="dshcb-button" disabled={saving}
        onClick={() => { controller.closeWebCapture() }}>{t('dialog.cancel')}</button>
      {capture.phase === 'error' || (capture.phase === 'ready' && capture.workspaces === undefined) ? <>
        <button type="button" className="dshcb-button" onClick={() => { void controller.captureWebConversation(true) }}>{t('common.retry')}</button>
        <button type="button" className="dshcb-button" onClick={() => { controller.closeWebCapture(); controller.openImport() }}>{t('capture.manual')}</button>
      </> : null}
      {snapshot === undefined ? null : <button type="button" className="dshcb-button dshcb-button-primary"
        disabled={saving || !capture.acceptedScope || capture.acceptContext !== true || capture.workspaceId === undefined}
        onClick={() => { void controller.saveWebCaptureToWork() }}>{t(saving ? 'capture.saving' : 'quick.create')}</button>}
    </>}>
    {capture.phase === 'loading' ? <p role="status">{t('capture.loading')}</p> : null}
    {saving ? <p role="status">{t('quick.progress')}</p> : null}
    {capture.error === undefined ? null : <ErrorBanner t={t} error={capture.error} />}
    {capture.noticeKey === undefined ? null : <p className="dshcb-warnings">{t(capture.noticeKey)}</p>}
    {snapshot === undefined ? null : <>
      <div className="dshcb-field">
        <label className="dshcb-label" htmlFor="dshcb-capture-title">{t('import.titleField')}</label>
        <input id="dshcb-capture-title" className="dshcb-input" value={capture.title} disabled={saving}
          onChange={event => { controller.setWebCaptureTitle(event.target.value) }} />
      </div>
      <p className="dshcb-card-hint">{snapshot.source.url}</p>
      <ul className="dshcb-warnings"><li>{t('capture.scopeNote')}</li><li>{t('capture.exclusions')}</li></ul>
      <label className="dshcb-label" htmlFor="dshcb-capture-workspace">{t('work.chooseWorkspace')}</label>
      <select id="dshcb-capture-workspace" className="dshcb-input" value={capture.workspaceId ?? ''} disabled={saving}
        onChange={event => { controller.chooseWebCaptureWorkspace(event.target.value) }}>
        <option value="">{t('work.chooseWorkspace')}</option>
        {capture.workspaces?.map(item => <option key={item.id} value={item.id}>{item.title} — {item.path}</option>)}
      </select>
      {capture.workspaces?.length === 0 ? <p className="dshcb-card-hint">{t('work.noWorkspace')}</p> : null}
      <label className="dshcb-context-choice">
        <input type="checkbox" checked={capture.acceptedScope} disabled={saving}
          onChange={event => { controller.acceptWebCaptureScope(event.target.checked) }} />
        {t('capture.acceptScope')}
      </label>
      <label className="dshcb-context-choice"><input type="checkbox" checked={capture.acceptContext === true} disabled={saving}
        onChange={event => { controller.acceptWebCaptureContext(event.target.checked) }} />{t('capture.acceptContext')}</label>
      <label className="dshcb-context-choice"><input type="checkbox" checked={capture.enableQuick === true} disabled={saving || capture.workspaceId === undefined}
        onChange={event => { controller.enableQuickTransfer(event.target.checked) }} />{t('quick.enable')}</label>
      <p className="dshcb-card-hint">{t('quick.policy')}</p>
      {snapshot.history.kind === 'messages' ? <MessagesView t={t} messages={snapshot.history.messages}
        page={page} pageSize={PAGE_SIZE} onPage={setPage} /> : null}
    </>}
  </Modal>
}
