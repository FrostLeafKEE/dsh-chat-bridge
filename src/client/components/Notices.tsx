/**
 * Small shared surfaces: an error banner and a dismissible notice.
 *
 * Errors are rendered with `role="alert"` so a screen reader announces them and
 * the failure is never a silent no-op.
 *
 * @module dsh-chat-bridge/client/components/Notices
 */

import type { ReactNode } from 'react'
import type { ArchiveError } from '../../shared/errors'
import { errorText, type Translate } from '../presentation'

/** Props of {@link ErrorBanner}. */
export interface ErrorBannerProps {
  t: Translate
  error: ArchiveError
  /** Optional dismiss handler; the banner is persistent without one. */
  onDismiss?: () => void
}

/**
 * Render a failure with its code-specific sentence.
 * @param props - see {@link ErrorBannerProps}.
 * @returns the banner element.
 */
export function ErrorBanner({ t, error, onDismiss }: ErrorBannerProps): ReactNode {
  return (
    <div className="dshcb-error" role="alert">
      {errorText(t, error)}
      {onDismiss === undefined ? null : (
        <>
          {' '}
          <button type="button" className="dshcb-button" onClick={onDismiss}>{t('common.dismiss')}</button>
        </>
      )}
    </div>
  )
}

/** Props of {@link NoticeBar}. */
export interface NoticeBarProps {
  t: Translate
  /** Locale key of the notice text. */
  messageKey: Parameters<Translate>[0]
  onDismiss: () => void
}

/**
 * Render a one-line informational notice.
 * @param props - see {@link NoticeBarProps}.
 * @returns the notice element.
 */
export function NoticeBar({ t, messageKey, onDismiss }: NoticeBarProps): ReactNode {
  return (
    <div className="dshcb-notice" role="status">
      <span>{t(messageKey)}</span>
      <button type="button" className="dshcb-button" onClick={onDismiss}>{t('common.dismiss')}</button>
    </div>
  )
}
