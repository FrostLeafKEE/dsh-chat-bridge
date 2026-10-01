/**
 * Archive detail pane: provenance, completeness, attachment metadata, the body,
 * and the action row.
 *
 * Everything shown here is either stored metadata or the original text. The pane
 * states explicitly when a value is *not* known (no remote conversation id, no
 * verified speakers, metadata-only attachments) rather than leaving a blank that
 * could read as "fine".
 *
 * @module dsh-chat-bridge/client/components/ArchiveDetail
 */

import { useId, type ReactNode } from 'react'
import type { ChatSnapshot } from '../../shared/contracts'
import { PAGE_SIZE, type DetailState } from '../state/controller'
import { completenessText, formatText, formatTimestamp, sourceKindText, type Translate } from '../presentation'
import { ErrorBanner } from './Notices'
import { MessagesView } from './MessagesView'

/** Props of {@link ArchiveDetail}. */
export interface ArchiveDetailProps {
  t: Translate
  detail: DetailState
  onRename: (snapshot: ChatSnapshot) => void
  onDelete: (snapshot: ChatSnapshot) => void
  onExportOriginal: (snapshot: ChatSnapshot) => void
  onExportDocument: (snapshot: ChatSnapshot) => void
  onToWork: (snapshot: ChatSnapshot) => void
  onPage: (page: number) => void
}

/**
 * Render the detail pane.
 * @param props - see {@link ArchiveDetailProps}.
 * @returns the detail card.
 */
export function ArchiveDetail(props: ArchiveDetailProps): ReactNode {
  const { t, detail } = props
  const headingId = useId()

  if (detail.phase === 'idle') {
    return <p className="dshcb-empty">{t('detail.placeholder')}</p>
  }
  if (detail.phase === 'loading') {
    return <p className="dshcb-empty">{t('archives.loading')}</p>
  }
  if (detail.phase === 'error' || detail.snapshot === undefined) {
    return detail.error === undefined
      ? <p className="dshcb-empty">{t('detail.placeholder')}</p>
      : <ErrorBanner t={t} error={detail.error} />
  }

  const snapshot = detail.snapshot
  const history = snapshot.history
  const attachments = history.kind === 'messages'
    ? history.messages.reduce((total, message) => total + (message.attachments?.length ?? 0), 0)
    : 0
  const unavailable = history.kind === 'messages'
    ? history.messages.reduce(
      (total, message) => total + (message.attachments?.filter(item => item.availability === 'unavailable').length ?? 0),
      0,
    )
    : 0

  return (
    <section className="dshcb-card" aria-labelledby={headingId}>
      <h3 className="dshcb-card-title" id={headingId}>{snapshot.title}</h3>

      <dl className="dshcb-meta">
        <dt>{t('detail.importedAt')}</dt>
        <dd>{formatTimestamp(snapshot.importedAt)}</dd>
        <dt>{t('detail.updatedAt')}</dt>
        <dd>{formatTimestamp(snapshot.updatedAt)}</dd>
        <dt>{t('detail.format')}</dt>
        <dd>{formatText(t, snapshot.original.format)}</dd>
        {snapshot.source.kind === 'web-dom' ? <><dt>{t('capture.sourceLabel')}</dt><dd>{sourceKindText(t, snapshot.source.kind)}</dd></> : null}
        {snapshot.source.fileName === undefined ? null : (
          <>
            <dt>{t('detail.fileName')}</dt>
            <dd>{snapshot.source.fileName}</dd>
          </>
        )}
        {snapshot.source.url === undefined ? null : (
          <>
            <dt>{t('detail.sourceUrl')}</dt>
            <dd>{snapshot.source.url}</dd>
          </>
        )}
        <dt>{t('detail.conversationId')}</dt>
        <dd>{snapshot.source.conversationId ?? t('detail.noConversationId')}</dd>
        <dt>{t('detail.completeness')}</dt>
        <dd>{completenessText(t, history.completeness)}</dd>
        <dt>{t('detail.attachments')}</dt>
        <dd>
          {snapshot.source.kind === 'web-dom' ? t('capture.exclusions') : attachments === 0
            ? t('detail.attachments.none')
            : t('detail.attachments.metadataOnly', { total: attachments, unavailable })}
        </dd>
      </dl>

      <div className="dshcb-actions">
        <button type="button" className="dshcb-button" onClick={() => { props.onRename(snapshot) }}>
          {t('action.rename')}
        </button>
        <button type="button" className="dshcb-button" onClick={() => { props.onExportOriginal(snapshot) }}>
          {t('action.exportOriginal')}
        </button>
        <button type="button" className="dshcb-button" onClick={() => { props.onExportDocument(snapshot) }}>
          {t('action.exportArchive')}
        </button>
        <button type="button" className="dshcb-button" onClick={() => { props.onToWork(snapshot) }}>
          {t('action.toWork')}
        </button>
        <button
          type="button"
          className="dshcb-button dshcb-button-danger"
          onClick={() => { props.onDelete(snapshot) }}
        >
          {t('action.delete')}
        </button>
      </div>

      <p className="dshcb-card-hint">{t('detail.linksNotice')}</p>

      {history.kind === 'messages'
        ? <MessagesView t={t} messages={history.messages} page={detail.page} pageSize={PAGE_SIZE} onPage={props.onPage} />
        : (
          <>
            <p className="dshcb-card-hint">
              {t('detail.sourceTextNotice')}
              {snapshot.original.format === 'markdown' ? ` ${t('detail.markdownNotice')}` : ''}
            </p>
            <p className="dshcb-text">{history.text}</p>
          </>
        )}
    </section>
  )
}
