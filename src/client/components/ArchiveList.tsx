/**
 * The "imported history" list: title search, the local archive rows, and the
 * entry point to the import wizard.
 *
 * Every row is explicitly labelled a local archive; nothing in this component
 * ever claims a remote or synced state.
 *
 * @module dsh-chat-bridge/client/components/ArchiveList
 */

import { useId, type ReactNode } from 'react'
import type { ArchiveSummary } from '../../shared/contracts'
import type { ListState } from '../state/controller'
import { formatTimestamp, summarySizeText, type Translate } from '../presentation'
import { ErrorBanner } from './Notices'

/** Props of {@link ArchiveList}. */
export interface ArchiveListProps {
  t: Translate
  list: ListState
  search: string
  selectedArchiveId: string | undefined
  onSearch: (value: string) => void
  onSelect: (archiveId: string) => void
  onImport: () => void
  onRefresh: () => void
}

/**
 * Render the archive list card.
 * @param props - see {@link ArchiveListProps}.
 * @returns the list card.
 */
export function ArchiveList(props: ArchiveListProps): ReactNode {
  const { t, list, search, selectedArchiveId } = props
  const headingId = useId()
  const loading = list.phase === 'loading'

  return (
    <section className="dshcb-card" aria-labelledby={headingId}>
      <h3 className="dshcb-card-title" id={headingId}>
        {t('archives.title')}
      </h3>
      <p className="dshcb-card-hint">{t('archives.localOnly')}</p>
      <p className="dshcb-card-hint">{t('archives.count', { count: list.summaries.length })}</p>

      <div className="dshcb-search">
        <input
          className="dshcb-input"
          type="search"
          value={search}
          aria-label={t('archives.searchLabel')}
          placeholder={t('archives.searchPlaceholder')}
          onChange={(event) => { props.onSearch(event.target.value) }}
        />
        <button type="button" className="dshcb-button" onClick={props.onRefresh} disabled={loading}>
          {t('archives.refresh')}
        </button>
        <button type="button" className="dshcb-button dshcb-button-primary" onClick={props.onImport}>
          {t('archives.import')}
        </button>
      </div>

      {list.error === undefined ? null : <ErrorBanner t={t} error={list.error} />}
      {loading && list.summaries.length === 0 ? <p className="dshcb-empty">{t('archives.loading')}</p> : null}

      {!loading && list.summaries.length === 0 ? (
        <p className="dshcb-empty">
          {search.trim() === '' ? t('archives.empty') : t('archives.noMatch')}
          <br />
          {t('archives.emptyHint')}
        </p>
      ) : null}

      <ul className="dshcb-list">
        {list.summaries.map(summary => (
          <li key={summary.archiveId}>
            <button
              type="button"
              className="dshcb-row"
              aria-current={summary.archiveId === selectedArchiveId}
              onClick={() => { props.onSelect(summary.archiveId) }}
            >
              <span className="dshcb-row-title">{rowTitle(summary)}</span>
              {summary.status === 'corrupted' ? (
                <span className="dshcb-row-corrupted">{t('archives.corrupted')}</span>
              ) : (
                <span className="dshcb-row-meta">
                  <span>{summarySizeText(t, summary)}</span>
                  <span>{formatTimestamp(summary.updatedAt)}</span>
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Title to show for one row. A corrupted record has no trustworthy title, so its
 * raw key is shown instead of a fabricated one.
 * @param summary - the list projection.
 * @returns the display title.
 */
function rowTitle(summary: ArchiveSummary): string {
  return summary.title === '' ? summary.archiveId : summary.title
}
