import type { ReactNode } from 'react'
import type { ChatBridgeController, TransferSettingsState } from '../state/controller'
import type { Translate } from '../presentation'
import { Modal } from './Modal'
import { ErrorBanner } from './Notices'

export function TransferSettingsDialog({ t, controller, settings }: {
  t: Translate; controller: ChatBridgeController; settings: TransferSettingsState
}): ReactNode {
  return <Modal title={t('quick.settings')} closeLabel={t('dialog.close')} onClose={() => { controller.closeTransferSettings() }} actions={<>
    <button className="dshcb-button" type="button" onClick={() => { controller.closeTransferSettings() }}>{t('dialog.cancel')}</button>
    {controller.getSnapshot().transferPreference?.quickEnabled !== true ? null : <button className="dshcb-button" type="button"
      onClick={() => { controller.disableQuickTransfer() }}>{t('quick.disable')}</button>}
    <button className="dshcb-button dshcb-button-primary" type="button"
      disabled={settings.phase !== 'ready' || !settings.workspaces.some(item => item.id === settings.workspaceId)}
      onClick={() => { controller.saveTransferSettings() }}>{t('quick.saveSettings')}</button>
  </>}>
    {settings.phase === 'loading' ? <p role="status">{t('archives.loading')}</p> : null}
    {settings.error === undefined ? null : <ErrorBanner t={t} error={settings.error} />}
    <label className="dshcb-label" htmlFor="dshcb-transfer-workspace">{t('work.chooseWorkspace')}</label>
    <select id="dshcb-transfer-workspace" className="dshcb-input" value={settings.workspaceId}
      disabled={settings.phase !== 'ready'} onChange={event => { controller.updateTransferSettings(event.target.value, false) }}>
      <option value="">{t('work.chooseWorkspace')}</option>
      {settings.workspaces.map(item => <option key={item.id} value={item.id}>{item.title} — {item.path}</option>)}
    </select>
    {settings.phase === 'ready' && settings.workspaces.length === 0 ? <p className="dshcb-card-hint">{t('work.noWorkspace')}</p> : null}
    <label className="dshcb-context-choice"><input type="checkbox" checked={settings.quickEnabled}
      disabled={settings.phase !== 'ready' || settings.workspaceId === ''}
      onChange={event => { controller.updateTransferSettings(settings.workspaceId, event.target.checked) }} />{t('quick.enable')}</label>
    <ul className="dshcb-warnings"><li>{t('quick.policy')}</li><li>{t('capture.exclusions')}</li></ul>
    <p className="dshcb-card-hint">{t('quick.scopeReminder')}</p>
  </Modal>
}
