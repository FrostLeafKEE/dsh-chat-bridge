/**
 * Locale wiring for the plugin's single namespace.
 *
 * Two things happen here beyond re-exporting the dictionaries:
 *  - `LocaleNamespaceMap` is augmented, which is what makes the
 *    framework-injected `t` seat and `ctx.locale.bind` typed against this
 *    plugin's keys instead of accepting any string;
 *  - `ERROR_KEYS` maps every stable error code onto a dictionary key as a
 *    `Record<ErrorCode, ...>`, so adding a code without copy is a compile
 *    error rather than a raw key rendered to the user.
 *
 * @module dsh-chat-bridge/client/locales
 */

import type { ErrorCode } from '../../shared/errors'
import { en, type DshChatBridgeLocaleKey } from './en'
import { zh } from './zh'

export { en, zh }
export type { DshChatBridgeLocaleKey }

/** Namespace this plugin owns. */
export const NS = 'dshChatBridge'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Chat-area copy owned by dsh-chat-bridge. */
    dshChatBridge: DshChatBridgeLocaleKey
  }
}

/** Dictionary key for every stable error code. */
export const ERROR_KEYS: Record<ErrorCode, DshChatBridgeLocaleKey> = {
  INPUT_TOO_LARGE: 'error.INPUT_TOO_LARGE',
  INVALID_JSON: 'error.INVALID_JSON',
  UNSUPPORTED_FORMAT: 'error.UNSUPPORTED_FORMAT',
  UNSUPPORTED_VERSION: 'error.UNSUPPORTED_VERSION',
  INVALID_HISTORY: 'error.INVALID_HISTORY',
  UNSAFE_SOURCE_URL: 'error.UNSAFE_SOURCE_URL',
  ARCHIVE_NOT_FOUND: 'error.ARCHIVE_NOT_FOUND',
  ARCHIVE_CORRUPTED: 'error.ARCHIVE_CORRUPTED',
  STORAGE_UNAVAILABLE: 'error.STORAGE_UNAVAILABLE',
  STORAGE_QUOTA_EXCEEDED: 'error.STORAGE_QUOTA_EXCEEDED',
  WEB_CARRIER_NOT_IMPLEMENTED: 'error.WEB_CARRIER_NOT_IMPLEMENTED',
  WORK_IMPORT_NOT_IMPLEMENTED: 'error.WORK_IMPORT_NOT_IMPLEMENTED',
  DESKTOP_REQUIRED: 'error.DESKTOP_REQUIRED',
  WEB_LOAD_FAILED: 'error.WEB_LOAD_FAILED',
  WEB_NAVIGATION_BLOCKED: 'error.WEB_NAVIGATION_BLOCKED',
  WEB_CAPTURE_UNAVAILABLE: 'error.WEB_CAPTURE_UNAVAILABLE',
  WEB_CAPTURE_UNSUPPORTED: 'error.WEB_CAPTURE_UNSUPPORTED',
  WEB_CAPTURE_EMPTY: 'error.WEB_CAPTURE_EMPTY',
  WEB_CAPTURE_BUSY: 'error.WEB_CAPTURE_BUSY',
  WEB_CAPTURE_DRAFT_PRESENT: 'error.WEB_CAPTURE_DRAFT_PRESENT',
  WEB_CAPTURE_CHANGED: 'error.WEB_CAPTURE_CHANGED',
  WEB_CAPTURE_CANCELED: 'error.WEB_CAPTURE_CANCELED',
  WEB_HISTORY_UNSUPPORTED: 'error.WEB_HISTORY_UNSUPPORTED',
  WEB_HISTORY_LOAD_FAILED: 'error.WEB_HISTORY_LOAD_FAILED',
  WEB_HISTORY_TOO_LARGE: 'error.WEB_HISTORY_TOO_LARGE',
  WEB_HISTORY_UNAVAILABLE: 'error.WEB_HISTORY_UNAVAILABLE',
  WORK_IMPORT_FAILED: 'error.WORK_IMPORT_FAILED',
  WORKSPACE_LIST_UNAVAILABLE: 'error.WORKSPACE_LIST_UNAVAILABLE',
  WORKSPACE_LIST_TIMEOUT: 'error.WORKSPACE_LIST_TIMEOUT',
  WORK_HISTORY_SERVICE_UNAVAILABLE: 'error.WORK_HISTORY_SERVICE_UNAVAILABLE',
  WORK_HISTORY_REQUEST_FAILED: 'error.WORK_HISTORY_REQUEST_FAILED',
  WORK_PRESET_UNAVAILABLE: 'error.WORK_PRESET_UNAVAILABLE',
  WORK_DRAFT_NOT_SAVED: 'error.WORK_DRAFT_NOT_SAVED',
  WORK_HISTORY_NOT_SAVED: 'error.WORK_HISTORY_NOT_SAVED',
  WORK_IMPORT_CANCELED: 'error.WORK_IMPORT_CANCELED',
  TRANSFER_PREFERENCES_UNAVAILABLE: 'error.TRANSFER_PREFERENCES_UNAVAILABLE',
  INVALID_ENCODING: 'error.INVALID_ENCODING',
  INVALID_TITLE: 'error.INVALID_TITLE',
  FILE_READ_FAILED: 'error.FILE_READ_FAILED',
  NAVIGATION_UNAVAILABLE: 'error.NAVIGATION_UNAVAILABLE',
  UNEXPECTED: 'error.UNEXPECTED',
}

/** One dictionary for every built-in locale (both are required by the typed registration). */
export const DICTIONARIES = { zh, en }
