/** Small shared stroke icons; both DOM chrome and React controls use these paths. */
export const ICON_PATHS = {
  work: ['M3 5.5h5l1.5 2H17a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z'],
  chat: ['M17.5 9.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.5-.8L2.5 17l.8-4a8 8 0 0 1-.8-3.5A7.5 7.5 0 0 1 10 2a7.5 7.5 0 0 1 7.5 7.5Z', 'M6.5 9.5h7'],
  chevron: ['m6 8 4 4 4-4'],
  check: ['m4.5 10 3.5 3.5 7.5-7.5'],
  transfer: ['M3 6h13m-4-4 4 4-4 4', 'M17 14H4m4-4-4 4 4 4'],
  settings: ['M3 5h14M3 10h14M3 15h14', 'M7 3v4m6 1v4m-6 1v4'],
  plus: ['M10 3v14M3 10h14'],
  refresh: ['M17 7a7 7 0 1 0 .2 5', 'M17 2v5h-5'],
  info: ['M17.5 10a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z', 'M10 9v5M10 6v.01'],
  upload: ['M10 13V3m-4 4 4-4 4 4', 'M3 12v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4'],
  archive: ['M3 3h14v4H3Z', 'M4 7v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7M8 10h4'],
  close: ['m5 5 10 10M15 5 5 15'],
} as const

export type BridgeIconName = keyof typeof ICON_PATHS

/** DOM-only icon factory for the owned sidebar addition. */
export function createBridgeIcon(name: BridgeIconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 20 20')
  svg.setAttribute('width', '18')
  svg.setAttribute('height', '18')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.6')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.classList.add('dshcb-icon')
  for (const d of ICON_PATHS[name]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}
