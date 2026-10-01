import type { ReactNode } from 'react'
import { ICON_PATHS, type BridgeIconName } from '../icons'

export function BridgeIcon({ name }: { name: BridgeIconName }): ReactNode {
  return <svg className="dshcb-icon" width="18" height="18" viewBox="0 0 20 20"
    fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">
    {ICON_PATHS[name].map(d => <path key={d} d={d} />)}
  </svg>
}
