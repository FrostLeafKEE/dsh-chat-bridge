/**
 * Paginated view over one structured history.
 *
 * Pagination is presentation only: the stored archive always holds every
 * message, and the pager states the totals so a reader can see that nothing was
 * dropped. Message bodies are rendered as text nodes — never as HTML — so a
 * message that contains markup stays literal.
 *
 * @module dsh-chat-bridge/client/components/MessagesView
 */

import type { ReactNode } from 'react'
import type { ImportedMessage } from '../../shared/contracts'
import type { Translate } from '../presentation'

/** Props of {@link MessagesView}. */
export interface MessagesViewProps {
  t: Translate
  messages: readonly ImportedMessage[]
  page: number
  pageSize: number
  onPage: (page: number) => void
}

/**
 * Render one page of messages plus its pager.
 * @param props - see {@link MessagesViewProps}.
 * @returns the message list.
 */
export function MessagesView({ t, messages, page, pageSize, onPage }: MessagesViewProps): ReactNode {
  const totalPages = Math.max(1, Math.ceil(messages.length / pageSize))
  const current = Math.min(Math.max(1, page), totalPages)
  const start = (current - 1) * pageSize
  const slice = messages.slice(start, start + pageSize)

  return (
    <div>
      {slice.map(message => <MessageRow key={message.id} t={t} message={message} />)}
      <div className="dshcb-pager">
        <button type="button" className="dshcb-button" onClick={() => { onPage(current - 1) }} disabled={current <= 1}>
          {t('detail.pagePrev')}
        </button>
        <span>
          {t('detail.pagination', {
            from: messages.length === 0 ? 0 : start + 1,
            to: start + slice.length,
            total: messages.length,
          })}
        </span>
        <button
          type="button"
          className="dshcb-button"
          onClick={() => { onPage(current + 1) }}
          disabled={current >= totalPages}
        >
          {t('detail.pageNext')}
        </button>
      </div>
    </div>
  )
}

/**
 * Render one message.
 * @param props - translate seat and the message.
 * @returns the message element.
 */
function MessageRow({ t, message }: { t: Translate; message: ImportedMessage }): ReactNode {
  const role = message.role === 'user' ? t('detail.role.user') : t('detail.role.assistant')
  const attachments = message.attachments ?? []
  return (
    <article className="dshcb-message">
      <div className="dshcb-message-head">
        <span className="dshcb-role">{role}</span>
        <span>{message.id}</span>
        {message.createdAt === undefined ? null : <span>{message.createdAt}</span>}
        {message.model === undefined ? null : <span>{t('detail.model')}: {message.model}</span>}
      </div>
      <p className="dshcb-text">{message.content}</p>
      {attachments.length === 0 ? null : (
        <ul className="dshcb-attachments">
          {attachments.map((attachment, index) => (
            <li key={`${attachment.name}-${index}`}>
              {attachment.name}
              {attachment.mimeType === undefined ? '' : ` · ${attachment.mimeType}`}
              {attachment.sizeBytes === undefined ? '' : ` · ${attachment.sizeBytes}B`}
              {` · ${attachment.availability}`}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
