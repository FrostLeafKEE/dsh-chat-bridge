/**
 * The chat panel registered into the host's `main` keyed slot.
 *
 * The web carrier fills the main canvas. Archive management/details are opt-in
 * dialogs entered from the sidebar; they never reserve a permanent web column.
 *
 * The mode switch is honest about what it does: "Chat" is the panel you are
 * looking at, and "Work" is a navigation action back to the original session
 * surface. It creates nothing and moves nothing.
 *
 * @module dsh-chat-bridge/client/components/ChatBridgePanel
 */

import { useEffect, useId, useState, type ReactNode } from 'react'
import type { ChatSnapshot } from '../../shared/contracts'
import type { PresentedWebCarrier } from '../../adapters/desktop-web-carrier'
import type { ArchiveError } from '../../shared/errors'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatBridgeController } from '../state/controller'
import { usePanelState } from './hooks'
import { ArchiveDetail } from './ArchiveDetail'
import { ArchiveList } from './ArchiveList'
import { ImportDialog } from './ImportDialog'
import { Modal } from './Modal'
import { ErrorBanner, NoticeBar } from './Notices'
import { WorkImportDialog } from './WorkImportDialog'
import { WebChat, WebChatActions } from './WebChat'
import { WebCaptureDialog } from './WebCaptureDialog'
import { TransferSettingsDialog } from './TransferSettingsDialog'
import { useDesktopChrome } from '../desktop-chrome'

/** Business face injected into the panel registration. */
export interface ChatBridgePanelFace {
  controller: ChatBridgeController
  carrier?: PresentedWebCarrier
}

/** Props assembled by the `main` slot renderer for this panel. */
export type ChatBridgePanelProps =
  Omit<PropsRuntime<'main'>, 'useWorkspaces'>
  & PropsLocale<'dshChatBridge'>
  & InjectFace<ChatBridgePanelFace>

/**
 * Render the chat panel.
 * @param props - slot-composed props plus the injected controller.
 * @returns the panel element.
 */
export function ChatBridgePanel({ t, controller, carrier }: ChatBridgePanelProps): ReactNode {
  const state = usePanelState(controller)
  const chrome = useDesktopChrome()
  const [renameTarget, setRenameTarget] = useState<ChatSnapshot | undefined>(undefined)
  const [renameText, setRenameText] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ChatSnapshot | undefined>(undefined)
  const [actionError, setActionError] = useState<ArchiveError | undefined>(undefined)
  const headingId = useId()

  // Initial load, and a refresh whenever the page becomes visible again — the
  // cheapest honest approximation of "another tab may have written".
  useEffect(() => { void controller.refresh(); void controller.refreshTransferDestination() }, [controller])
  useEffect(() => () => { controller.closeWebCapture(true); controller.closeTransferSettings(); controller.closeWork() }, [controller])
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void controller.refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { document.removeEventListener('visibilitychange', onVisibility) }
  }, [controller])

  const selectedId = state.detail.archiveId

  return (
    <div className="dshcb-root" data-dsh-chat-bridge="panel" data-dshcb-chrome={chrome}>
      <div className="dshcb-mode-seat" data-chrome={chrome} aria-hidden="true" />
      <header className="dshcb-header">
        <h2 className="dshcb-title" id={headingId}>{t('panel.title')}</h2>
        <span className="dshcb-badge">{t('panel.basicBadge')}</span>
        <span className="dshcb-spacer" />
        {carrier === undefined ? null : <WebChatActions t={t} carrier={carrier}
          captureDisabled={state.capture !== undefined || state.draft !== undefined || state.work !== undefined || state.transferSettings !== undefined}
          quickEnabled={state.transferPreference?.quickEnabled === true}
          onReview={() => { void controller.captureWebConversation(true) }}
          onSettings={() => { void controller.openTransferSettings() }}
          onCapture={() => { void controller.captureWebConversation() }} />}
      </header>

      {state.transferPreference?.quickEnabled === true ? <p className="dshcb-quick-hint">
        {t('quick.active', { workspace: state.transferWorkspace?.title ?? t('quick.checkDestination') })} {t('quick.scopeReminder')}
      </p> : null}
      {state.preferenceError === undefined ? null : <ErrorBanner t={t} error={state.preferenceError} />}

      {state.noticeKey === undefined ? null : (
        <NoticeBar t={t} messageKey={state.noticeKey} onDismiss={() => { controller.clearNotice() }} />
      )}
      {state.navigationError === undefined ? null : (
        <ErrorBanner t={t} error={state.navigationError} onDismiss={() => { controller.clearNavigationError() }} />
      )}
      {actionError === undefined ? null : (
        <ErrorBanner t={t} error={actionError} onDismiss={() => { setActionError(undefined) }} />
      )}

      <div className="dshcb-body">
        {carrier === undefined ? null : <WebChat t={t} carrier={carrier} />}
      </div>

      {state.archiveDialog === undefined || state.draft !== undefined || state.work !== undefined
        || state.capture !== undefined || state.transferSettings !== undefined
        || renameTarget !== undefined || deleteTarget !== undefined ? null : (
        <Modal title={t('archives.manage')} closeLabel={t('dialog.close')} className="dshcb-archive-dialog"
          onClose={() => { controller.closeArchiveManager() }}
          actions={<>
            {state.archiveDialog === 'detail' ? <button type="button" className="dshcb-button"
              onClick={() => { controller.openArchiveManager() }}>{t('archives.backToList')}</button> : null}
            <button type="button" className="dshcb-button" onClick={() => { controller.closeArchiveManager() }}>{t('archives.close')}</button>
          </>}>
          {actionError === undefined ? null : <ErrorBanner t={t} error={actionError} />}
          {state.archiveDialog === 'list' ? (
          <ArchiveList
            t={t}
            list={state.list}
            search={state.search}
            selectedArchiveId={selectedId}
            onSearch={(value) => { controller.setSearch(value) }}
            onSelect={(archiveId) => { setActionError(undefined); controller.openArchive(archiveId) }}
            onImport={() => { controller.openImport() }}
            onRefresh={() => { void controller.refresh() }}
          />
          ) : (
          <ArchiveDetail
            t={t}
            detail={state.detail}
            onRename={(snapshot) => { setActionError(undefined); setRenameTarget(snapshot); setRenameText(snapshot.title) }}
            onDelete={(snapshot) => { setActionError(undefined); setDeleteTarget(snapshot) }}
            onExportOriginal={(snapshot) => {
              void controller.exportOriginal(snapshot.archiveId).then(setActionError)
            }}
            onExportDocument={(snapshot) => {
              void controller.exportDocument(snapshot.archiveId).then(setActionError)
            }}
            onToWork={(snapshot) => { void controller.prepareWork(snapshot.archiveId) }}
            onPage={(page) => { controller.setPage(page) }}
          />
          )}
        </Modal>
      )}

      {state.draft === undefined
        ? null
        : <ImportDialog t={t} controller={controller} draft={state.draft} />}

      {state.work === undefined
        ? null
        : <WorkImportDialog t={t} controller={controller} work={state.work} />}

      {state.capture === undefined ? null : <WebCaptureDialog key={state.capture.id} t={t} controller={controller} capture={state.capture} />}
      {state.transferSettings === undefined ? null : <TransferSettingsDialog t={t} controller={controller} settings={state.transferSettings} />}

      {renameTarget === undefined ? null : (
        <Modal
          closeLabel={t('dialog.close')}
          title={t('dialog.rename.title')}
          onClose={() => { setRenameTarget(undefined) }}
          actions={
            <>
              <button type="button" className="dshcb-button" onClick={() => { setRenameTarget(undefined) }}>
                {t('dialog.cancel')}
              </button>
              <button
                type="button"
                className="dshcb-button dshcb-button-primary"
                onClick={() => {
                  const target = renameTarget
                  if (target === undefined) return
                  void controller.renameArchive(target.archiveId, renameText).then(error => {
                    setActionError(error)
                    if (error === undefined) setRenameTarget(undefined)
                  })
                }}
              >
                {t('dialog.rename.save')}
              </button>
            </>
          }
        >
          {actionError === undefined ? null : <ErrorBanner t={t} error={actionError} />}
          <div className="dshcb-field">
            <label className="dshcb-label" htmlFor="dshcb-rename-title">{t('dialog.rename.label')}</label>
            <input
              id="dshcb-rename-title"
              className="dshcb-input"
              type="text"
              value={renameText}
              onChange={(event) => { setRenameText(event.target.value) }}
            />
          </div>
        </Modal>
      )}

      {deleteTarget === undefined ? null : (
        <Modal
          closeLabel={t('dialog.close')}
          title={t('dialog.delete.title')}
          onClose={() => { setDeleteTarget(undefined) }}
          actions={
            <>
              <button type="button" className="dshcb-button" onClick={() => { setDeleteTarget(undefined) }}>
                {t('dialog.cancel')}
              </button>
              <button
                type="button"
                className="dshcb-button dshcb-button-danger"
                onClick={() => {
                  const target = deleteTarget
                  if (target === undefined) return
                  void controller.deleteArchive(target.archiveId).then(error => {
                    setActionError(error)
                    if (error === undefined) setDeleteTarget(undefined)
                  })
                }}
              >
                {t('dialog.delete.confirm')}
              </button>
            </>
          }
        >
          {actionError === undefined ? null : <ErrorBanner t={t} error={actionError} />}
          <p className="dshcb-text">{deleteTarget.title}</p>
          <p className="dshcb-card-hint">{t('dialog.delete.body')}</p>
        </Modal>
      )}
    </div>
  )
}
