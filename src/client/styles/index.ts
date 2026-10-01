/**
 * The plugin's stylesheet, held as one string and injected under a single
 * `<style data-plugin="dsh-chat-bridge">` tag.
 *
 * Two deliberate choices:
 *
 * 1. **No CSS toolchain.** The official preset compiles CSS Modules with
 *    lightningcss inside the bundle; that machinery is monorepo build tooling an
 *    external package would have to reimplement. Shipping one plain sheet keeps
 *    the build small and the artifact inspectable, at the cost of not having
 *    per-file hashed class names.
 * 2. **Every selector is rooted at the plugin's own class.** Nothing here can
 *    match host markup, so disabling the plugin cannot leave styles behind that
 *    affect anything else, and `installStyles` removal is a complete undo.
 *
 * Colours come from the host's alias tokens (`--dsw-alias-*`), which the theme
 * renderer rebinds for light and dark, so light/dark support is inherited rather
 * than duplicated, and every token has a literal fallback for the case where the
 * theme service is not present.
 *
 * @module dsh-chat-bridge/client/styles
 */

/** `data-plugin` marker and style tag id used for the injected sheet. */
export const STYLE_TAG_ID = 'dsh-chat-bridge'

/** Tagged stylesheet for the chat panel and the sidebar entry. */
export const PLUGIN_STYLES = `
.dshcb-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  box-sizing: border-box;
  padding: 0 16px 16px;
  gap: 8px;
  color: var(--dsw-alias-label-primary, #1b1b1f);
  font-family: var(--dsw-font-family, system-ui, sans-serif);
  font-size: var(--dsh-content-font-size, 14px);
}
.dshcb-root *, .dshcb-root *::before, .dshcb-root *::after,
.dshcb-mode-picker *, .dshcb-mode-popover *, .dshcb-sidebar-chat * { box-sizing: border-box; }
.dshcb-root[data-dshcb-chrome='macos-windowed'] {
  padding-top: 0;
}
/* The common mode seat now owns Mac clearance; Windows clears its caption in AppFrame. */
.dshcb-root[data-dshcb-chrome='macos-fullscreen'] { padding-top: 0; }
.dshcb-button, .dshcb-mode, .dshcb-mode-trigger, .dshcb-mode-popover, .dshcb-input,
.dshcb-textarea, .dshcb-select, .dshcb-web-help, .dshcb-webview,
.dshcb-entry, .dshcb-sidebar-archive, .dshcb-row, .dshcb-dialog, .dshcb-dialog-close {
  -webkit-app-region: no-drag;
}
.dshcb-icon { flex: none; display: block; pointer-events: none; }

/* Header ------------------------------------------------------------------ */
.dshcb-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  flex: none;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e4e4e8);
}
.dshcb-title { font-size: 16px; font-weight: 600; margin: 0; line-height: 1.5; }
.dshcb-badge {
  border: 1px solid var(--dsw-alias-border-l1, #e4e4e8);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #55555e);
  background: var(--dsw-alias-bg-layer-2, #f4f4f6);
}
.dshcb-note { color: var(--dsw-alias-label-tertiary, #77777f); font-size: 12px; }
.dshcb-quick-hint { color: var(--dsw-alias-label-secondary, #55555e); font-size: 12px; line-height: 1.6; margin: 0; overflow-wrap: anywhere; }
.dshcb-spacer { flex: 1 1 auto; }

/* Mode switch ------------------------------------------------------------- */
.dshcb-modes {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: var(--dsw-alias-bg-layer-2, #f4f4f6);
  border: 1px solid var(--dsw-alias-border-l1, #e4e4e8);
  border-radius: 999px;
  flex: none;
}
.dshcb-mode {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #55555e);
  padding: 5px 16px;
  min-height: 30px;
  border-radius: 999px;
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.dshcb-mode:hover { color: var(--dsw-alias-label-primary, #1b1b1f); background: var(--dsw-alias-interactive-bg-hover, #f2f2f5); }
.dshcb-mode[aria-pressed='true'] {
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #1b1b1f);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
.dshcb-mode:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: -2px; }

/* Layout ------------------------------------------------------------------ */
.dshcb-body {
  display: flex;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
}

.dshcb-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 12px;
  overflow: auto;
}

.dshcb-card {
  border: 1px solid var(--dsw-alias-border-l2, #d8d8dd);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1, #fff);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.dshcb-card-title { display: flex; align-items: center; gap: 8px; font-weight: 600; margin: 0; }
.dshcb-card-hint { color: var(--dsw-alias-label-tertiary, #77777f); font-size: 12px; margin: 0; }

/* Web carrier ------------------------------------------------------------- */
.dshcb-carrier {
  border: 1px dashed var(--dsw-alias-border-l3, #c2c2c9);
  border-radius: 10px;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 16px;
  text-align: center;
  background: var(--dsw-alias-bg-module-platform, #fafafb);
}
.dshcb-carrier-strong { font-weight: 600; color: var(--dsw-alias-state-warn-primary, #b26a00); }
.dshcb-carrier-detail { color: var(--dsw-alias-label-tertiary, #77777f); font-size: 12px; max-width: 46ch; }
.dshcb-carrier-marker { color: var(--dsw-alias-label-caption, #9a9aa2); font-size: 11px; }

/* Archive list ------------------------------------------------------------ */
.dshcb-search { display: flex; gap: 8px; align-items: center; }
.dshcb-search .dshcb-input { flex: 1 1 0; min-width: 0; }
.dshcb-search .dshcb-button { flex: none; }
@media (max-width: 540px) { .dshcb-search { flex-wrap: wrap; } .dshcb-search .dshcb-input { flex-basis: 100%; } }
.dshcb-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.dshcb-row {
  width: 100%;
  text-align: start;
  appearance: none;
  font: inherit;
  color: inherit;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
}
.dshcb-row:hover { background: var(--dsw-alias-interactive-bg-hover, #f2f2f5); }
.dshcb-row[aria-current='true'] {
  background: var(--dsw-alias-interactive-bg-active, #e6e6ea);
  border-color: var(--dsw-alias-border-l2, #d8d8dd);
}
.dshcb-row:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: 1px; }
.dshcb-row-title { font-weight: 500; overflow-wrap: anywhere; }
.dshcb-row-meta { color: var(--dsw-alias-label-tertiary, #77777f); font-size: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.dshcb-row-corrupted { color: var(--dsw-alias-state-error-primary, #c0392b); font-size: 12px; }

/* Detail ------------------------------------------------------------------ */
.dshcb-meta { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; margin: 0; }
.dshcb-meta dt { color: var(--dsw-alias-label-tertiary, #77777f); font-size: 12px; }
.dshcb-meta dd { margin: 0; overflow-wrap: anywhere; }
.dshcb-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.dshcb-button {
  appearance: none;
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  white-space: nowrap;
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2, #d8d8dd);
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #1b1b1f);
  padding: 6px 12px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.dshcb-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #f2f2f5); }
.dshcb-button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: 1px; }
.dshcb-button:disabled { opacity: 0.55; cursor: not-allowed; }
.dshcb-button-primary {
  background: var(--dsw-alias-button-primary-fill, #4d6bfe);
  color: var(--dsw-alias-label-primary-foreground, #fff);
  border-color: transparent;
}
.dshcb-button-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover, #3a56e0); }
.dshcb-button-subtle { border-color: transparent; background: transparent; color: var(--dsw-alias-label-secondary, #55555e); }
.dshcb-button-danger { color: var(--dsw-alias-state-error-primary, #c0392b); }

.dshcb-message {
  border: 1px solid var(--dsw-alias-border-l1, #e4e4e8);
  border-radius: 12px;
  padding: 12px 14px;
  margin: 0 0 8px;
  background: var(--dsw-alias-bg-layer-1, #fff);
}
.dshcb-message-head { display: flex; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-tertiary, #77777f); margin-bottom: 4px; }
.dshcb-role { font-weight: 600; color: var(--dsw-alias-label-secondary, #55555e); }
.dshcb-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: var(--dsw-font-family, system-ui, sans-serif);
  margin: 0;
  line-height: 1.65;
}
.dshcb-attachments { margin: 6px 0 0; padding-inline-start: 18px; font-size: 12px; color: var(--dsw-alias-label-tertiary, #77777f); }
.dshcb-pager { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-tertiary, #77777f); }

.dshcb-empty { color: var(--dsw-alias-label-tertiary, #77777f); padding: 12px 0; text-align: center; }
.dshcb-error {
  border: 1px solid var(--dsw-alias-state-error-primary, #c0392b);
  border-radius: 8px;
  padding: 8px 10px;
  color: var(--dsw-alias-state-error-primary, #c0392b);
  font-size: 12px;
  white-space: pre-wrap;
  line-height: 1.6;
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #c0392b) 5%, var(--dsw-alias-bg-layer-1, #fff));
}
.dshcb-notice {
  border: 1px solid var(--dsw-alias-border-l2, #d8d8dd);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  display: flex;
  gap: 8px;
  align-items: center;
}

/* Inputs ------------------------------------------------------------------ */
.dshcb-field { display: flex; flex-direction: column; gap: 6px; }
.dshcb-label { font-size: 12px; color: var(--dsw-alias-label-secondary, #55555e); }
.dshcb-input, .dshcb-textarea, .dshcb-select {
  font: inherit;
  color: var(--dsw-alias-label-primary, #1b1b1f);
  background: var(--dsw-alias-bg-layer-1, #fff);
  border: 1px solid var(--dsw-alias-border-l2, #d8d8dd);
  border-radius: 10px;
  padding: 8px 10px;
  width: 100%;
  min-height: 38px;
  line-height: 20px;
  transition: border-color 120ms ease;
}
.dshcb-input:hover:not(:disabled), .dshcb-textarea:hover:not(:disabled), .dshcb-select:hover:not(:disabled) { border-color: var(--dsw-alias-border-l3, #c2c2c9); }
.dshcb-input:disabled, .dshcb-textarea:disabled, .dshcb-select:disabled { opacity: 0.6; cursor: not-allowed; }
.dshcb-input:focus-visible, .dshcb-textarea:focus-visible, .dshcb-select:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 1px;
}
.dshcb-textarea { min-height: 160px; resize: vertical; font-family: var(--dsw-font-family, system-ui, sans-serif); }
.dshcb-tabs { display: flex; gap: 4px; }
.dshcb-tabs .dshcb-button[aria-selected='true'] { background: var(--dsw-alias-interactive-bg-active, #e6e6ea); font-weight: 600; }
.dshcb-warnings { margin: 0; padding-inline-start: 18px; font-size: 12px; color: var(--dsw-alias-state-warn-primary, #b26a00); }

/* Modal ------------------------------------------------------------------- */
.dshcb-overlay {
  position: fixed;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.45));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  padding-top: max(24px, var(--dsh-frame-overlay-top, 24px));
  z-index: 1000;
}
.dshcb-dialog {
  background: var(--dsw-alias-bg-layer-3, #fff);
  color: var(--dsw-alias-label-primary, #1b1b1f);
  border: 1px solid var(--dsw-alias-border-l2, #d8d8dd);
  border-radius: 18px;
  width: min(720px, 100%);
  max-height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 16px;
  padding: 20px;
  overflow: hidden;
  box-shadow: var(--dsw-elevation-prominent, 0 16px 48px rgba(0, 0, 0, 0.18));
  font-family: var(--dsw-font-family, system-ui, sans-serif);
  font-size: var(--dsh-content-font-size, 14px);
}
.dshcb-dialog-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex: none; }
.dshcb-dialog-body { display: flex; flex-direction: column; gap: 12px; flex: 1 1 auto; min-height: 0; overflow: auto; padding: 2px; }
.dshcb-dialog-body > p { margin: 0; line-height: 1.6; }
.dshcb-dialog-close { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 30px; height: 30px; border: 0; border-radius: 9px; background: transparent; color: var(--dsw-alias-label-secondary, #55555e); cursor: pointer; }
.dshcb-dialog-close:hover { background: var(--dsw-alias-interactive-bg-hover, #f2f2f5); }
.dshcb-dialog-close:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: 1px; }
.dshcb-dialog-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; flex: none; padding-top: 14px; border-top: 1px solid var(--dsw-alias-border-l1, #e4e4e8); }
.dshcb-archive-dialog { width: min(960px, 100%); }
.dshcb-dialog-title { margin: 0; font-size: 17px; font-weight: 600; line-height: 1.5; }

/* Sidebar entry ----------------------------------------------------------- */
.dshcb-entry {
  appearance: none;
  font: inherit;
  color: var(--dsw-alias-label-primary, #1b1b1f);
  background: transparent;
  border: 0;
  border-radius: 8px;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  cursor: pointer;
  text-align: start;
}
.dshcb-entry:hover { background: var(--dsw-alias-interactive-bg-hover, #f2f2f5); }
.dshcb-entry:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: -1px; }
.dshcb-entry-rail { justify-content: center; padding: 6px; }
.dshcb-entry-count { margin-inline-start: auto; min-width: 20px; text-align: center; padding: 1px 6px; border-radius: 999px; font-size: 11px; line-height: 18px; background: var(--dsw-alias-bg-layer-2, #f4f4f6); color: var(--dsw-alias-label-secondary, #55555e); }
.dshcb-entry-glyph { flex: none; display: inline-flex; }
.dshcb-sidebar-chat { width: 100%; border-top: 1px solid var(--dsw-alias-border-l2, #d8d8dd); padding-top: 8px; }
.dshcb-sidebar-history-heading { display: flex; align-items: center; gap: 6px; margin: 6px 10px; font-size: 12px; color: var(--dsw-alias-label-secondary, #55555e); }
.dshcb-sidebar-history-heading .dshcb-entry-count { margin-left: auto; }
.dshcb-sidebar-refresh { display: grid; place-items: center; border: 0; border-radius: 6px; padding: 5px; color: inherit; background: transparent; cursor: pointer; -webkit-app-region: no-drag; }
.dshcb-sidebar-refresh:hover { background: var(--dsw-alias-interactive-bg-hover, #f2f2f5); }
.dshcb-sidebar-refresh:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); }
.dshcb-sidebar-refresh:disabled { opacity: .5; cursor: default; }
.dshcb-sidebar-search { width: calc(100% - 16px); margin: 0 8px 5px; min-height: 28px; padding: 4px 8px; font-size: 12px; }
.dshcb-sidebar-web-list { max-height: 25vh; }
.dshcb-sidebar-history-scope { color: var(--dsw-alias-label-tertiary, #77777f); font-size: 10px; margin: 4px 10px; line-height: 1.5; }
.dshcb-sidebar-more { margin: 2px 8px 8px; width: calc(100% - 16px); font-size: 11px; padding: 4px 8px; min-height: 26px; }
.dshcb-sidebar-local { border-top: 1px solid var(--dsw-alias-border-l1, #e4e4e8); }
.dshcb-sidebar-local > summary { cursor: pointer; }
.dshcb-sidebar-label { margin: 8px 10px 6px; font-size: 11px; color: var(--dsw-alias-label-tertiary, #77777f); }
.dshcb-sidebar-tools { display: flex; gap: 6px; padding: 8px 4px 4px; }
.dshcb-sidebar-tool { flex: 1 1 0; min-width: 0; font-size: 12px; padding: 5px 6px; }
.dshcb-sidebar-tool .dshcb-icon { width: 14px; height: 14px; }
.dshcb-sidebar-tool-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshcb-sidebar-archives { max-height: 23vh; overflow-y: auto; padding: 0 4px; }
.dshcb-sidebar-archive { width: 100%; display: block; border: 0; background: transparent; color: inherit; font: inherit; text-align: start; padding: 7px 12px; border-radius: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
.dshcb-sidebar-archive:hover { background: var(--dsw-alias-interactive-bg-hover, #f2f2f5); }
.dshcb-sidebar-archive[aria-current="page"] { background: var(--dsw-alias-interactive-bg-active, #e6e6ea); font-weight: 500; }
.dshcb-sidebar-archive:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: -2px; }
.dshcb-sidebar-archives .dshcb-note { margin: 6px 8px; line-height: 1.6; }
.dshcb-web-card { position: relative; flex: 1 1 0; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.dshcb-web-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; max-width: 100%; }
.dshcb-web-host { position: relative; flex: 1 1 0; min-width: 0; min-height: 0; overflow: hidden; border-radius: 8px; }
.dshcb-webview { position: absolute; inset: 0; display: flex; width: 100%; height: 100%; min-height: 0; border: 0; }
.dshcb-web-status { position: absolute; top: 8px; left: 8px; right: 8px; z-index: 1; pointer-events: none; }
.dshcb-web-status:empty { display: none; }
.dshcb-web-status .dshcb-note { width: fit-content; background: var(--dsw-alias-bg-layer-1, #fff); padding: 6px 10px; border-radius: 8px; }
.dshcb-web-help { position: relative; }
.dshcb-web-help > summary { list-style: none; }
.dshcb-web-help > summary::-webkit-details-marker { display: none; }
.dshcb-web-help[open] > summary { background: var(--dsw-alias-interactive-bg-active, #e6e6ea); }
.dshcb-web-help-popover { position: absolute; top: calc(100% + 8px); right: 0; width: min(360px, calc(100vw - 48px)); padding: 12px 16px; border: 1px solid var(--dsw-alias-border-l1, #e4e4e8); border-radius: 14px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-secondary, #55555e); font-size: 12px; line-height: 1.6; box-shadow: var(--dsw-elevation-prominent, 0 8px 24px rgba(0, 0, 0, 0.12)); z-index: 2; }
.dshcb-context-choice { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; line-height: 1.6; }
.dshcb-context-choice input { accent-color: var(--dsw-alias-brand-primary, #4d6bfe); margin-top: 3px; flex: none; }
.dshcb-mode-seat { box-sizing: border-box; height: 56px; width: 100%; flex: none; pointer-events: none; }
.dshcb-mode-seat[data-chrome='macos-windowed'] { height: calc(56px + var(--dsh-frame-top-clearance, 48px)); }
.dshcb-fixed-modes { position: fixed; z-index: 30; transform: translateX(-50%); width: 168px; height: 40px; box-sizing: border-box; font-family: var(--dsw-font-family, system-ui, sans-serif); color: var(--dsw-alias-label-primary, #1b1b1f); -webkit-app-region: no-drag; }
.dshcb-fixed-modes[hidden] { display: none; }
.dshcb-fixed-modes .dshcb-mode { flex: 1 1 0; min-width: 0; padding-inline: 12px; }

/* Sidebar mode picker ----------------------------------------------------- */
.dshcb-mode-picker { width: calc(100% - 32px); margin: 0 16px 10px; font-family: var(--dsw-font-family, system-ui, sans-serif); }
.dshcb-mode-trigger { appearance: none; display: flex; align-items: center; gap: 10px; width: 100%; min-height: 42px; padding: 7px 10px; border: 1px solid var(--dsw-alias-border-l1, #e4e4e8); border-radius: 12px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1b1b1f); font: inherit; font-size: 13px; line-height: 20px; text-align: start; cursor: pointer; transition: background 120ms ease, border-color 120ms ease; }
.dshcb-mode-trigger:hover, .dshcb-mode-trigger[aria-expanded='true'] { background: var(--dsw-alias-interactive-bg-hover, #f2f2f5); border-color: var(--dsw-alias-border-l2, #d8d8dd); }
.dshcb-mode-trigger:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: 2px; }
.dshcb-mode-glyph { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; flex: none; border-radius: 8px; color: var(--dsw-alias-label-secondary, #55555e); background: var(--dsw-alias-bg-layer-2, #f4f4f6); }
.dshcb-mode-glyph[data-mode='chat'] { color: var(--dsw-alias-brand-primary, #4d6bfe); background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 10%, var(--dsw-alias-bg-layer-1, #fff)); }
.dshcb-mode-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.dshcb-mode-caret { display: inline-flex; flex: none; color: var(--dsw-alias-label-tertiary, #77777f); transition: transform 120ms ease; }
.dshcb-mode-trigger[aria-expanded='true'] .dshcb-mode-caret { transform: rotate(180deg); }
.dshcb-mode-popover { position: fixed; z-index: 1100; box-sizing: border-box; padding: 5px; border: 1px solid var(--dsw-alias-border-l1, #e4e4e8); border-radius: 15px; background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: var(--dsw-elevation-prominent, 0 8px 28px rgba(0, 0, 0, 0.12)); font-family: var(--dsw-font-family, system-ui, sans-serif); color: var(--dsw-alias-label-primary, #1b1b1f); font-size: 13px; overflow: auto; scroll-padding-top: max(12px, var(--dsh-frame-overlay-top, 12px)); }
.dshcb-mode-popover[hidden] { display: none; }
.dshcb-mode-popover:focus { outline: none; }
.dshcb-mode-option { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 8px 10px; border-radius: 10px; cursor: pointer; }
.dshcb-mode-option[aria-selected='true'] { background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 8%, var(--dsw-alias-bg-layer-3, #fff)); }
.dshcb-mode-option[data-highlighted='true'] { background: var(--dsw-alias-interactive-bg-hover, #f2f2f5); }
.dshcb-mode-option[data-highlighted='true'][aria-selected='true'] { background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 12%, var(--dsw-alias-bg-layer-3, #fff)); }
.dshcb-mode-option-icon { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 30px; height: 30px; border: 1px solid var(--dsw-alias-border-l1, #e4e4e8); border-radius: 9px; color: var(--dsw-alias-label-secondary, #55555e); }
.dshcb-mode-option-copy { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.dshcb-mode-option-title { font-weight: 500; line-height: 20px; }
.dshcb-mode-option-description { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary, #77777f); overflow-wrap: anywhere; }
.dshcb-mode-option-check { display: inline-flex; flex: none; color: var(--dsw-alias-brand-primary, #4d6bfe); visibility: hidden; }
.dshcb-mode-option[aria-selected='true'] .dshcb-mode-option-check { visibility: visible; }
.dshcb-sidebar-archives, .dshcb-dialog-body, .dshcb-mode-popover { scrollbar-width: thin; scrollbar-color: var(--dsh-scrollbar-thumb, var(--dsw-alias-border-l2, #d8d8dd)) transparent; }
@media (max-width: 620px) {
  .dshcb-root { padding: 0 12px 12px; }
  .dshcb-header { gap: 8px; }
  .dshcb-web-controls { order: 1; flex-basis: 100%; }
  .dshcb-overlay { padding-inline: 12px; padding-bottom: 12px; }
  .dshcb-dialog { padding: 16px; border-radius: 14px; }
  .dshcb-dialog-actions .dshcb-button { white-space: normal; }
}
@media (prefers-reduced-motion: reduce) {
  .dshcb-button, .dshcb-mode, .dshcb-input, .dshcb-textarea, .dshcb-select, .dshcb-mode-trigger, .dshcb-mode-caret { transition: none; }
}
`
