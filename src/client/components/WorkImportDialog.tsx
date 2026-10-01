/**
 * The "turn into work" handoff dialog.
 *
 * It requires an existing workspace and an explicit decision to preserve the
 * full history as persisted quoted context. The native adapter never submits it.
 * Unavailable hosts show the pending adapter's disabled state. Capacity stays
 * not-estimated; no token budget or fits-in-context conclusion is invented.
 *
 * @module dsh-chat-bridge/client/components/WorkImportDialog
 */

import type { ReactNode } from 'react'
import type { ChatBridgeController, WorkState } from '../state/controller'
import { capabilityText, completenessText, sourceKindText, warningKeys, type Translate } from '../presentation'
import { Modal } from './Modal'
import { ErrorBanner } from './Notices'

/** Props of {@link WorkImportDialog}. */
export interface WorkImportDialogProps {
  t: Translate
  controller: ChatBridgeController
  work: WorkState
}

/**
 * Render the handoff preview.
 * @param props - see {@link WorkImportDialogProps}.
 * @returns the dialog element.
 */
export function WorkImportDialog({ t, controller, work }: WorkImportDialogProps): ReactNode {
  const preview = work.preview
  const available = controller.capabilities.workImport.state === 'available'
  return (
    <Modal
      closeLabel={t('dialog.close')}
      title={t('work.title')}
      onClose={() => { controller.closeWork() }}
      actions={
        <>
          {work.archiveId === '' ? null : (
            <button
              type="button"
              className="dshcb-button"
              onClick={() => { void controller.exportDocument(work.archiveId) }}
            >
              {t('work.exportArchive')}
            </button>
          )}
          <button type="button" className="dshcb-button" onClick={() => { controller.closeWork() }}>
            {t('work.close')}
          </button>
          <button
            type="button"
            className="dshcb-button dshcb-button-primary"
            disabled={!available || work.phase !== 'ready' || preview?.workspaceId == null || work.acceptContext !== true || work.committing === true}
            title={available ? t('work.warning.quotedDraft') : t('work.commitReason')}
            onClick={() => { void controller.commitWork() }}
          >
            {work.committing === true ? t('work.creating') : available ? t('work.createNative') : t('work.commit')}
          </button>
        </>
      }
    >
      {work.phase === 'loading' ? <p className="dshcb-empty">{t('archives.loading')}</p> : null}
      {work.error === undefined ? null : <ErrorBanner t={t} error={work.error} />}
      {work.commitError === undefined ? null : <ErrorBanner t={t} error={work.commitError} />}

      {preview === undefined ? null : (
        <>
          <h3 className="dshcb-card-title">{preview.title}</h3>
          <dl className="dshcb-meta">
            <dt>{t('work.archiveId')}</dt>
            <dd>{preview.archiveId}</dd>
            <dt>{t('work.kind')}</dt>
            <dd>{preview.historyKind === 'messages' ? t('work.kind.messages') : t('work.kind.source-text')}</dd>
            {preview.messageCount === undefined ? null : (
              <>
                <dt>{t('work.messageCount')}</dt>
                <dd>{preview.messageCount}</dd>
              </>
            )}
            {preview.sourceTextLength === undefined ? null : (
              <>
                <dt>{t('work.sourceTextLength')}</dt>
                <dd>{t('import.charsValue', { count: preview.sourceTextLength })}</dd>
              </>
            )}
            <dt>{t('work.originalBytes')}</dt>
            <dd>{t('import.bytesValue', { bytes: preview.originalBytes })}</dd>
            <dt>{t('detail.format')}</dt>
            <dd>{sourceKindText(t, preview.sourceKind)}</dd>
            <dt>{t('work.completeness')}</dt>
            <dd>{completenessText(t, preview.completeness)}</dd>
            <dt>{t('work.attachments')}</dt>
            <dd>{preview.sourceKind === 'web-dom' ? t('capture.exclusions')
              : t('import.attachmentsValue', { total: preview.attachments.total, unavailable: preview.attachments.unavailable })}</dd>
            <dt>{t('work.workspace')}</dt>
            <dd>{preview.workspaceId === null ? t(available ? 'work.chooseWorkspace' : 'work.workspaceNotSelected') : work.workspaces?.find(item => item.id === preview.workspaceId)?.title}</dd>
            <dt>{t('work.capacity')}</dt>
            <dd>{t('work.capacityNotEstimated')}</dd>
          </dl>

          {available ? <>
            <label className="dshcb-label" htmlFor="dshcb-workspace">{t('work.chooseWorkspace')}</label>
            <select id="dshcb-workspace" className="dshcb-input" value={preview.workspaceId ?? ''} disabled={work.committing === true || work.targetLocked === true}
              title={work.targetLocked === true ? t('work.targetLocked') : undefined}
              onChange={event => { controller.chooseWorkWorkspace(event.target.value) }}>
              <option value="">{t('work.chooseWorkspace')}</option>
              {work.workspaces?.map(item => <option value={item.id} key={item.id}>{item.title} — {item.path}</option>)}
            </select>
            {work.workspaces?.length === 0 ? <p className="dshcb-card-hint">{t('work.noWorkspace')}</p> : null}
            <label className="dshcb-context-choice"><input type="checkbox" checked={work.acceptContext === true} disabled={work.committing === true}
              onChange={event => { controller.acceptWorkContext(event.target.checked) }} />{t(preview.sourceKind === 'web-dom' ? 'capture.acceptContext' : 'work.acceptContext')}</label>
          </> : <p className="dshcb-card-hint">{t('work.commitReason')}</p>}
          {capabilityText(t, controller.capabilities.workImport) === '' ? null : (
            <p className="dshcb-card-hint">{capabilityText(t, controller.capabilities.workImport)}</p>
          )}

          <ul className="dshcb-warnings">
            {warningKeys(preview.warningKeys).map(key => <li key={key}>{t(key)}</li>)}
          </ul>
        </>
      )}
    </Modal>
  )
}
