/**
 * Dialog shell: modal semantics, Escape to close, a contained Tab cycle, focus
 * restoration, and a click-outside target. Every dialog in the plugin uses it,
 * so "Esc works" and "focus does not escape" are properties of one component
 * instead of three ad-hoc `<div>`s.
 *
 * @module dsh-chat-bridge/client/components/Modal
 */

import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react'
import { BridgeIcon } from './BridgeIcon'
import { trapDialogTab } from '../dialog-focus'

/** Props of {@link Modal}. */
export interface ModalProps {
  /** Dialog heading text; rendered by the dialog itself. */
  title: string
  /** Localized name of the optional header close button. */
  closeLabel?: string
  /** Close request from Escape or a click on the overlay. */
  onClose: () => void
  /** Footer actions. */
  actions?: ReactNode
  /** Additional plugin-owned sizing class. */
  className?: string
  /** Dialog body. */
  children: ReactNode
}

/**
 * Render a modal dialog.
 * @param props - see {@link ModalProps}.
 * @returns the dialog element.
 */
export function Modal({ title, closeLabel, onClose, actions, children, className }: ModalProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // Focus moves into the dialog on open and returns to the previous owner on
  // close, so keyboard users are never dropped at the top of the document.
  useEffect(() => {
    const previous = document.activeElement
    dialogRef.current?.focus()
    return () => {
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    // Escape belongs to the Chinese/Japanese input method while it is composing.
    if (event.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const node = dialogRef.current
    if (node === null) return
    trapDialogTab(node, event)
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown, true)
    return () => { document.removeEventListener('keydown', onKeyDown, true) }
  }, [onKeyDown])

  return (
    <div
      className="dshcb-overlay"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        className={className === undefined ? 'dshcb-dialog' : `dshcb-dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="dshcb-dialog-header">
          <h2 className="dshcb-dialog-title" id={titleId}>{title}</h2>
          {closeLabel === undefined ? null : <button type="button" className="dshcb-dialog-close"
            aria-label={closeLabel} title={closeLabel} onClick={onClose}><BridgeIcon name="close" /></button>}
        </div>
        <div className="dshcb-dialog-body">{children}</div>
        {actions === undefined ? null : <div className="dshcb-dialog-actions">{actions}</div>}
      </div>
    </div>
  )
}
