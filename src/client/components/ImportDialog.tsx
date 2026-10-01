/**
 * The import wizard: pick a file or paste text, parse it, preview what would be
 * saved, then save on an explicit confirmation.
 *
 * Nothing is written before the confirmation click, and the step order in the
 * UI mirrors the pipeline exactly (byte gate → decode → parse → preview →
 * save). When a JSON input fails, the dialog offers an explicit fallback to
 * re-read the same bytes as raw text — the importer never downgrades silently.
 *
 * @module dsh-chat-bridge/client/components/ImportDialog
 */

import { useRef, type ChangeEvent, type ReactNode } from 'react'
import { ACCEPT_ATTRIBUTE } from '../../import/input'
import type { ImportDraft, ChatBridgeController } from '../state/controller'
import { completenessText, warningKeys, type Translate } from '../presentation'
import { Modal } from './Modal'
import { ErrorBanner, NoticeBar } from './Notices'

/** Props of {@link ImportDialog}. */
export interface ImportDialogProps {
  t: Translate
  controller: ChatBridgeController
  draft: ImportDraft
}

/**
 * Render the import wizard.
 * @param props - see {@link ImportDialogProps}.
 * @returns the dialog element.
 */
export function ImportDialog({ t, controller, draft }: ImportDialogProps): ReactNode {
  const fileInput = useRef<HTMLInputElement>(null)

  const onFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    // Clearing the value lets the user re-pick the same file after fixing it.
    event.target.value = ''
    if (file === undefined) return
    void controller.readFile(file)
  }

  const rawTextAvailable = draft.origin === 'file' ? draft.fileText !== undefined : draft.pasteText !== ''
  const jsonFailed = draft.error !== undefined
    && (draft.error.code === 'UNSUPPORTED_FORMAT'
      || draft.error.code === 'UNSUPPORTED_VERSION'
      || draft.error.code === 'INVALID_JSON')
    && ((draft.origin === 'file' && draft.fileFormat === 'json') || (draft.origin === 'paste' && draft.pasteMode === 'json'))

  return (
    <Modal
      closeLabel={t('dialog.close')}
      title={t('import.title')}
      onClose={() => { controller.closeImport() }}
      actions={
        draft.step === 'preview'
          ? (
            <>
              <button
                type="button"
                className="dshcb-button"
                onClick={() => { controller.closeImport() }}
                disabled={draft.busy}
              >
                {t('import.cancel')}
              </button>
              <button
                type="button"
                className="dshcb-button dshcb-button-primary"
                onClick={() => { void controller.saveDraft() }}
                disabled={draft.busy || draft.built === undefined}
              >
                {draft.busy ? t('import.saving') : t('import.save')}
              </button>
            </>
          )
          : (
            <>
              <button type="button" className="dshcb-button" onClick={() => { controller.closeImport() }}>
                {t('import.cancel')}
              </button>
              {draft.origin === 'paste' ? (
                <button
                  type="button"
                  className="dshcb-button dshcb-button-primary"
                  onClick={() => { void controller.previewPaste() }}
                  disabled={draft.busy || draft.pasteText === ''}
                >
                  {draft.busy ? t('import.parsing') : t('import.preview')}
                </button>
              ) : null}
            </>
          )
      }
    >
      {draft.noticeKey === undefined ? null : (
        <NoticeBar
          t={t}
          messageKey={draft.noticeKey === 'import.duplicate' ? 'import.duplicate' : 'import.saved'}
          onDismiss={() => { controller.closeImport() }}
        />
      )}

      <div className="dshcb-tabs" role="tablist" aria-label={t('import.title')}>
        <button
          type="button"
          role="tab"
          aria-selected={draft.origin === 'file'}
          disabled={draft.busy}
          className="dshcb-button"
          onClick={() => { controller.setImportOrigin('file') }}
        >
          {t('import.tab.file')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={draft.origin === 'paste'}
          disabled={draft.busy}
          className="dshcb-button"
          onClick={() => { controller.setImportOrigin('paste') }}
        >
          {t('import.tab.paste')}
        </button>
      </div>

      {draft.error === undefined ? null : <ErrorBanner t={t} error={draft.error} />}
      {jsonFailed && rawTextAvailable ? (
        <button type="button" className="dshcb-button" onClick={() => { void controller.reparseAsRawText() }}>
          {t('import.reparseAsText')}
        </button>
      ) : null}

      {draft.step === 'preview' && draft.built !== undefined ? (
        <PreviewBody t={t} controller={controller} draft={draft} />
      ) : draft.origin === 'file' ? (
        <div className="dshcb-field">
          <p className="dshcb-card-hint">{t('import.fileHint')}</p>
          <input
            ref={fileInput}
            className="dshcb-input"
            type="file"
            disabled={draft.busy}
            accept={ACCEPT_ATTRIBUTE}
            aria-label={t('import.chooseFile')}
            onChange={onFileChange}
          />
          {draft.fileName === undefined ? null : <p className="dshcb-card-hint">{t('import.selected', { name: draft.fileName })}</p>}
          {draft.busy ? <p className="dshcb-card-hint">{t('import.parsing')}</p> : null}
        </div>
      ) : (
        <div className="dshcb-field">
          <label className="dshcb-label" htmlFor="dshcb-paste-mode">{t('import.pasteMode')}</label>
          <select
            id="dshcb-paste-mode"
            className="dshcb-select"
            value={draft.pasteMode}
            disabled={draft.busy}
            onChange={(event) => { controller.setPasteMode(event.target.value as ImportDraft['pasteMode']) }}
          >
            <option value="text">{t('import.mode.text')}</option>
            <option value="markdown">{t('import.mode.markdown')}</option>
            <option value="json">{t('import.mode.json')}</option>
          </select>
          <textarea
            className="dshcb-textarea"
            value={draft.pasteText}
            disabled={draft.busy}
            aria-label={t('import.tab.paste')}
            placeholder={t('import.pastePlaceholder')}
            onChange={(event) => { controller.setPasteText(event.target.value) }}
          />
          {draft.busy ? <p className="dshcb-card-hint">{t('import.parsing')}</p> : null}
        </div>
      )}
    </Modal>
  )
}

/**
 * The confirmation step: what would be saved, and every standing caveat.
 * @param props - translate seat, controller, and the draft being previewed.
 * @returns the preview body.
 */
function PreviewBody(
  { t, controller, draft }: { t: Translate; controller: ChatBridgeController; draft: ImportDraft },
): ReactNode {
  const built = draft.built
  if (built === undefined) return null
  const preview = built.preview
  return (
    <>
      <div className="dshcb-field">
        <label className="dshcb-label" htmlFor="dshcb-import-title">{t('import.titleField')}</label>
        <input
          id="dshcb-import-title"
          className="dshcb-input"
          type="text"
          value={draft.title}
          disabled={draft.busy}
          onChange={(event) => { controller.setDraftTitle(event.target.value) }}
        />
      </div>

      <dl className="dshcb-meta">
        {preview.messageCount === undefined ? null : (
          <>
            <dt>{t('import.summaryMessages')}</dt>
            <dd>{String(preview.messageCount)}</dd>
          </>
        )}
        {preview.sourceTextLength === undefined ? null : (
          <>
            <dt>{t('import.summarySourceText')}</dt>
            <dd>{t('import.charsValue', { count: preview.sourceTextLength })}</dd>
          </>
        )}
        <dt>{t('import.summaryBytes')}</dt>
        <dd>{t('import.bytesValue', { bytes: preview.originalBytes })}</dd>
        <dt>{t('import.summaryCompleteness')}</dt>
        <dd>{completenessText(t, preview.completeness)}</dd>
        <dt>{t('import.summaryAttachments')}</dt>
        <dd>
          {built.snapshot.source.kind === 'web-dom' ? t('capture.exclusions') : t('import.attachmentsValue', {
            total: preview.attachments.total,
            unavailable: preview.attachments.unavailable,
          })}
        </dd>
      </dl>

      <ul className="dshcb-warnings">
        {warningKeys(preview.warningKeys).map(key => <li key={key}>{t(key)}</li>)}
      </ul>
    </>
  )
}
