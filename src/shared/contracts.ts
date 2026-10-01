/**
 * Data and port contracts of the basic-stage plugin.
 *
 * Three groups live here:
 *  1. The immutable archive model (`ChatSnapshot` v1) and its list projection.
 *  2. The `ArchiveRepository` interface the UI talks to — the UI never touches
 *     IndexedDB directly.
 *  3. The three seam ports the next stage replaces (`NavigationPort`,
 *     `WebCarrierPort`, `WorkImportPort`). These are **this plugin's own
 *     business interfaces**, not DSH SDK methods; no host implementation is
 *     assumed to exist for them.
 *
 * @module dsh-chat-bridge/shared/contracts
 */

import type { ErrorCode, Result } from './errors'

/** Which manual input format the user provided. */
export type ManualFormat = 'json' | 'text' | 'markdown'

/** Where the archive came from, in the vocabulary of this stage. */
export type SourceKind = 'manual-json' | 'manual-text' | 'manual-markdown' | 'web-dom'

/** An explicit capture of the rendered current branch; never a full remote-history claim. */
export interface WebConversationCapture {
  adapter: 'deepseek-dom-2026-10-01'
  url: string
  title: string
  scope: 'rendered-current-branch'
  completeness: 'partial'
  messages: ImportedMessage[]
}

/**
 * How much of the source the archive is known to contain.
 * `user-supplied` only means "the set the user handed us" — it never proves a
 * full web-version conversation history. `unknown` is used for raw text with
 * no verified turn structure.
 */
export type Completeness = 'user-supplied' | 'partial' | 'unknown'

/** Roles this stage accepts. Anything else is a hard error, never a silent drop. */
export type MessageRole = 'user' | 'assistant'

/**
 * Attachment presence. The basic stage keeps metadata only: it never fetches a
 * link and never fabricates file content.
 */
export type AttachmentAvailability = 'metadata-only' | 'unavailable'

/** Attachment metadata as supplied by the user. */
export interface ImportedAttachment {
  /** Display name exactly as supplied. */
  name: string
  /** Optional declared MIME type. */
  mimeType?: string
  /** Optional declared byte size. */
  sizeBytes?: number
  /** Whether the source claimed the file was reachable; nothing is downloaded either way. */
  availability: AttachmentAvailability
}

/** One imported message, preserved verbatim. */
export interface ImportedMessage {
  /** Non-empty, unique within the archive. */
  id: string
  /** `user` or `assistant` only. */
  role: MessageRole
  /** Message text, preserved exactly (leading/trailing whitespace included). */
  content: string
  /** Source-provided ISO timestamp, when the source actually gave one. */
  createdAt?: string
  /** Source-provided model label, when the source actually gave one. */
  model?: string
  /** Attachment metadata, when present. No attachment body is ever stored. */
  attachments?: ImportedAttachment[]
}

/** Structured history: a single linear message list, no branches. */
export interface MessagesHistory {
  kind: 'messages'
  completeness: 'user-supplied' | 'partial'
  messages: ImportedMessage[]
}

/** Unstructured history: the whole source text as one block, roles unknown. */
export interface SourceTextHistory {
  kind: 'source-text'
  completeness: 'unknown'
  text: string
}

/** The archive's history payload. */
export type ImportedHistory = MessagesHistory | SourceTextHistory

/** Where the imported material came from. */
export interface SnapshotSource {
  kind: SourceKind
  /** Base file name only — never a full path from the user's machine. */
  fileName?: string
  /** Validated `https://chat.deepseek.com/...` page URL, when the user supplied one. */
  url?: string
  /** Remote conversation id, only when the source genuinely provided one. */
  conversationId?: string
  /** Present only on schema v2 webpage captures. */
  capture?: {
    adapter: WebConversationCapture['adapter']
    scope: WebConversationCapture['scope']
    capturedAt: string
  }
}

/** Local archive: v1 manual inputs; v2 explicitly scoped webpage captures. */
export interface ChatSnapshot {
  schemaVersion: 1 | 2
  /** Plugin-generated local UUID. Never derived from the source. */
  archiveId: string
  /** Digest of the original import content; independent of `archiveId`. */
  fingerprint: string
  title: string
  /** When this local import was created (ISO). */
  importedAt: string
  /** When local metadata last changed (ISO). */
  updatedAt: string
  source: SnapshotSource
  original: {
    format: ManualFormat
    /** Full supplied text or canonical capture JSON; never silently truncated. */
    text: string
  }
  history: ImportedHistory
}

/** List projection: what the archive list needs, without any message body. */
export interface ArchiveSummary {
  archiveId: string
  fingerprint: string
  title: string
  importedAt: string
  updatedAt: string
  sourceKind: SourceKind
  fileName?: string
  historyKind: 'messages' | 'source-text'
  /** Present for structured history. */
  messageCount?: number
  /** Present for source-text history: code points in the source text. */
  textLength?: number
  /** UTF-8 bytes of `original.text`. */
  originalBytes: number
  completeness: Completeness
  attachmentCount: number
  /** Attachments whose availability is `unavailable`. */
  missingAttachmentCount: number
  /** `corrupted` marks a record this build cannot read; it is never auto-deleted. */
  status: 'ok' | 'corrupted'
  /** Locale key describing the corruption, present when `status` is `corrupted`. */
  statusMessageKey?: string
}

/** Query accepted by {@link ArchiveRepository.list}. */
export interface ArchiveListQuery {
  /** Case-insensitive substring match on the title only. */
  search?: string
}

/** Outcome of a save: `duplicate` means an equal-content archive already existed. */
export interface SaveOutcome {
  archiveId: string
  duplicate: boolean
}

/**
 * Storage port. All methods are async and return {@link Result} so the UI can
 * render a precise failure instead of an exception.
 */
export interface ArchiveRepository {
  list(query?: ArchiveListQuery): Promise<Result<ArchiveSummary[]>>
  get(archiveId: string): Promise<Result<ChatSnapshot>>
  save(snapshot: ChatSnapshot): Promise<Result<SaveOutcome>>
  rename(archiveId: string, title: string): Promise<Result<undefined>>
  remove(archiveId: string): Promise<Result<undefined>>
  dispose(): void
}

/** Availability of an adapter that a later stage must implement. */
export type CapabilityState = 'available' | 'unavailable'

/** Serialized capability report the UI renders as an explicit "not wired yet" note. */
export interface CapabilityStatus {
  state: CapabilityState
  /** The error code the adapter returns while unavailable. */
  code?: ErrorCode
  /** Locale key explaining the gap. */
  noteKey: string
}

/**
 * Host navigation seam. The basic implementation selects this plugin's main
 * panel and returns to the reserved conversation panel through the public
 * layout API.
 */
export interface NavigationPort {
  /** Open this plugin's chat panel. */
  openChatPanel(): Result<undefined>
  /** Return to the original conversation surface (`selectPanel(null)`). */
  returnToWork(): Result<undefined>
  dispose(): void
}

/** Target accepted by a managed web carrier. */
export interface WebCarrierTarget {
  /** Validated `https://chat.deepseek.com/...` URL. */
  url?: string
  /** Remote conversation id to focus, when the source supplied one. */
  conversationId?: string
}

/**
 * Web carrier seam. The Desktop adapter queues approved navigation; unavailable
 * adapters return an explicit failure. Loading is observed through presentation state.
 */
export interface WebCarrierPort {
  readonly capability: CapabilityStatus
  open(target?: WebCarrierTarget): Result<undefined>
  /** User-triggered page read; unsupported hosts may omit it. No navigation or submission. */
  captureCurrent?(signal: AbortSignal): Promise<Result<WebConversationCapture>>
  dispose(): void
}

/** A request to turn one archive into a work session. One request per click. */
export interface WorkImportRequest {
  schemaVersion: 1
  /** Idempotency key for one user action. */
  requestId: string
  archiveId: string
  /** Fingerprint the caller believes the archive has; mismatch is a hard error. */
  expectedFingerprint: string
  /**
   * The existing workspace the user picked. The native adapter requires this
   * at commit time and verifies it against the workspace registry.
   */
  workspaceId?: string
  /** User explicitly accepts imported context before a native capacity estimate. */
  acceptUnestimatedContext?: boolean
}

/** Attachment accounting shown in the handoff preview. */
export interface WorkImportAttachmentSummary {
  /** Messages carrying at least one attachment. */
  messagesWithAttachments: number
  /** Total attachment entries (metadata only). */
  total: number
  /** Entries whose availability is `unavailable`. */
  unavailable: number
  /** Names of the unavailable attachments (metadata only). */
  unavailableNames: string[]
}

/** What the handoff preview shows before any work session exists. */
export interface WorkImportPreview {
  schemaVersion: 1
  requestId: string
  archiveId: string
  fingerprint: string
  title: string
  /** Where the material came from, in words the user can check. */
  sourceKind: SourceKind
  sourceUrl?: string
  sourceFileName?: string
  hasRemoteConversationId: boolean
  historyKind: 'messages' | 'source-text'
  /** Message count for structured history. */
  messageCount?: number
  /** Code points of the source text for unstructured history. */
  sourceTextLength?: number
  /** UTF-8 bytes of `original.text`, always present. */
  originalBytes: number
  completeness: Completeness
  attachments: WorkImportAttachmentSummary
  /** Locale keys for every caveat the user must read before confirming. */
  warningKeys: string[]
  /** Null until the user selects an existing workspace. */
  workspaceId: string | null
  /** Capacity is never estimated in this stage. */
  contextCapacity: { state: 'not-estimated' }
}

/**
 * Receipt of a completed archive-to-work handoff; does not imply model submission.
 */
export interface WorkImportReceipt {
  schemaVersion: 1
  requestId: string
  sourceArchiveId: string
  sourceFingerprint: string
  workspaceId: string
  nativeSessionId: string
  importedAt: string
  importedRange: 'full'
  /** Old quoted drafts and persisted imported context remain distinguishable. */
  transferMode?: 'quoted-draft' | 'imported-context'
}

/**
 * Work import seam. `prepare()` really reads and verifies the archive and
 * builds a preview. The native adapter requests persisted imported context;
 * the pending adapter remains explicitly unavailable.
 */
export interface WorkImportPort {
  readonly capability: CapabilityStatus
  /** Wait for a usable native projection; callers can cancel preparation. */
  listWorkspaces?(signal?: AbortSignal): Promise<Result<WorkspaceChoice[]>>
  prepare(request: WorkImportRequest): Promise<Result<WorkImportPreview>>
  commit(request: WorkImportRequest, preview: WorkImportPreview): Promise<Result<WorkImportReceipt>>
  dispose(): void
}

/** Existing workspace choices, supplied by the native workspace registry. */
export interface WorkspaceChoice { id: string; title: string; path: string }
