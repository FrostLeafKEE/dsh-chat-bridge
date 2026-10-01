/** Keep Tab traversal inside a modal, including its initial container focus. */
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function trapDialogTab(node: HTMLElement, event: Pick<KeyboardEvent, 'shiftKey' | 'preventDefault'>): void {
  const focusable = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]
  const first = focusable[0]
  const last = focusable.at(-1)
  const active = node.ownerDocument.activeElement
  const outside = !node.contains(active)
  const target = first === undefined || last === undefined ? node
    : event.shiftKey && (active === first || active === node || outside) ? last
    : !event.shiftKey && (active === last || outside) ? first : undefined
  if (target !== undefined) { event.preventDefault(); target.focus() }
}
