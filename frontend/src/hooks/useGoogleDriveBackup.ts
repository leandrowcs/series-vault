import { useCallback, useRef } from 'react'
import { SeriesVaultBackup } from '../types/series'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const BACKUP_FILE = 'seriesvault_data.json'
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const DRIVE_UNAVAILABLE_STATUS = new Set([401, 403])

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const useGoogleDriveBackup = (accessToken: string | null) => {
  const cachedFileId = useRef<string | null>(null)
  const isDriveUnavailable = useRef(false)

  const fetchWithRetry = useCallback(async (url: string, options: RequestInit = {}, maxAttempts = 4) => {
    let lastResponse: Response | null = null

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const response = await fetch(url, options)
        lastResponse = response

        if (response.ok) return response
        if (!RETRYABLE_STATUS.has(response.status)) return response
      } catch (err) {
        if (attempt >= maxAttempts - 1) throw err
      }

      if (attempt < maxAttempts - 1) {
        await sleep(500 * 2 ** attempt)
      }
    }

    return lastResponse
  }, [])

  const authHeader = useCallback(
    (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${accessToken}`, ...extra }),
    [accessToken],
  )

  const findBackupFileId = useCallback(async () => {
    if (!accessToken || isDriveUnavailable.current) return null
    if (cachedFileId.current) return cachedFileId.current

    const query = encodeURIComponent(`name='${BACKUP_FILE}'`)
    const response = await fetchWithRetry(
      `${DRIVE_API}/files?spaces=appDataFolder&q=${query}&fields=files(id)`,
      { headers: authHeader() },
    )

    if (!response?.ok) {
      if (response && DRIVE_UNAVAILABLE_STATUS.has(response.status)) {
        isDriveUnavailable.current = true
      }
      return null
    }
    const data = await response.json()
    const fileId = data.files?.[0]?.id ?? null
    cachedFileId.current = fileId
    return fileId
  }, [accessToken, authHeader, fetchWithRetry])

  const loadBackup = useCallback(async (): Promise<SeriesVaultBackup | null> => {
    if (!accessToken) return null

    try {
      const fileId = await findBackupFileId()
      if (!fileId) return null

      const response = await fetchWithRetry(`${DRIVE_API}/files/${fileId}?alt=media`, {
        headers: authHeader(),
      })

      if (!response?.ok) return null
      return (await response.json()) as SeriesVaultBackup
    } catch {
      return null
    }
  }, [accessToken, authHeader, fetchWithRetry, findBackupFileId])

  const saveBackup = useCallback(
    async (backup: SeriesVaultBackup) => {
      if (!accessToken) return false
      if (isDriveUnavailable.current) return true
      const body = JSON.stringify(backup)

      try {
        const fileId = await findBackupFileId()

        if (isDriveUnavailable.current) return true

        if (fileId) {
          const response = await fetchWithRetry(`${UPLOAD_API}/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: authHeader({ 'Content-Type': 'application/json' }),
            body,
          })

          if (response?.ok) return true
          if (response && DRIVE_UNAVAILABLE_STATUS.has(response.status)) {
            isDriveUnavailable.current = true
            return true
          }
          if (response?.status === 404 || response?.status === 410) {
            cachedFileId.current = null
          } else {
            return false
          }
        }

        const form = new FormData()
        form.append(
          'metadata',
          new Blob([JSON.stringify({ name: BACKUP_FILE, parents: ['appDataFolder'] })], {
            type: 'application/json',
          }),
        )
        form.append('file', new Blob([body], { type: 'application/json' }))

        const createResponse = await fetchWithRetry(`${UPLOAD_API}/files?uploadType=multipart`, {
          method: 'POST',
          headers: authHeader(),
          body: form,
        })

        if (!createResponse?.ok) {
          if (createResponse && DRIVE_UNAVAILABLE_STATUS.has(createResponse.status)) {
            isDriveUnavailable.current = true
            return true
          }
          return false
        }
        const created = await createResponse.json()
        cachedFileId.current = created.id
        return true
      } catch {
        return false
      }
    },
    [accessToken, authHeader, fetchWithRetry, findBackupFileId],
  )

  return { loadBackup, saveBackup, isConfigured: Boolean(accessToken) }
}
