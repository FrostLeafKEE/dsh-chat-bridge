/**
 * Browser download helper.
 *
 * The file name always comes from `safeExportFileName`, which removes path
 * separators, control characters and reserved device names, so a user-chosen
 * archive title can never be interpreted as a path.
 *
 * @module dsh-chat-bridge/client/download
 */

/**
 * Save one text payload through an object URL.
 * @param fileName - a sanitized file name including its extension.
 * @param text - the exact text to write.
 * @param mimeType - MIME type with an explicit charset.
 */
export function downloadTextFile(fileName: string, text: string, mimeType: string): void {
  const blob = new Blob([text], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoke on the next task: revoking synchronously can cancel the download in
  // some engines.
  setTimeout(() => { URL.revokeObjectURL(url) }, 0)
}
