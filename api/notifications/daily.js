const crypto = require('crypto')
const { handleError, sendJson, tmdbFetch } = require('../_shared')

const FIRESTORE_BASE_URL = 'https://firestore.googleapis.com/v1'
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

function getEnv(name, fallbackName) {
  return process.env[name] || (fallbackName ? process.env[fallbackName] : undefined)
}

function getProjectId() {
  const projectId = getEnv('FIREBASE_PROJECT_ID', 'VITE_FIREBASE_PROJECT_ID')
  if (!projectId) {
    const error = new Error('FIREBASE_PROJECT_ID is not configured')
    error.statusCode = 500
    throw error
  }
  return projectId
}

function getServiceAccount() {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!clientEmail || !privateKey) {
    const error = new Error('Firebase service account is not configured')
    error.statusCode = 500
    throw error
  }

  return { clientEmail, privateKey }
}

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function getGoogleAccessToken() {
  const { clientEmail, privateKey } = getServiceAccount()
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64Url(
    JSON.stringify({
      aud: TOKEN_URL,
      exp: now + 3600,
      iat: now,
      iss: clientEmail,
      scope: `${FCM_SCOPE} ${FIRESTORE_SCOPE}`,
    }),
  )
  const unsignedJwt = `${header}.${payload}`
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsignedJwt)
    .sign(privateKey, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsignedJwt}.${signature}`,
    }),
  })

  if (!response.ok) {
    const error = new Error(`Google auth returned status ${response.status}`)
    error.statusCode = 502
    throw error
  }

  return (await response.json()).access_token
}

function firestoreValueToJs(value) {
  if (!value || typeof value !== 'object') return undefined
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return Boolean(value.booleanValue)
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('timestampValue' in value) return value.timestampValue
  if ('nullValue' in value) return null
  if ('arrayValue' in value) {
    return (value.arrayValue.values || []).map(firestoreValueToJs)
  }
  if ('mapValue' in value) {
    return firestoreFieldsToJs(value.mapValue.fields || {})
  }
  return undefined
}

function firestoreFieldsToJs(fields) {
  return Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, firestoreValueToJs(value)]),
  )
}

function jsToFirestoreValue(value) {
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: value } : { doubleValue: value }
  if (value === null || value === undefined) return { nullValue: null }
  return { stringValue: String(value) }
}

function formatDateKeyForTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timeZone || 'America/Toronto',
    year: 'numeric',
  }).formatToParts(new Date())

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

async function firestoreFetch(accessToken, path, options = {}) {
  const projectId = getProjectId()
  const response = await fetch(
    `${FIRESTORE_BASE_URL}/projects/${projectId}/databases/(default)/documents/${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    },
  )

  if (response.status === 404) return null
  if (!response.ok) {
    const error = new Error(`Firestore returned status ${response.status}`)
    error.statusCode = 502
    throw error
  }

  return response.json()
}

async function listDocuments(accessToken, path) {
  const documents = []
  let pageToken

  do {
    const separator = path.includes('?') ? '&' : '?'
    const payload = await firestoreFetch(
      accessToken,
      `${path}${separator}pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`,
    )

    documents.push(...(payload?.documents || []))
    pageToken = payload?.nextPageToken
  } while (pageToken)

  return documents
}

async function patchDocument(accessToken, documentName, fields) {
  const updateMask = Object.keys(fields)
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join('&')

  await fetch(`${FIRESTORE_BASE_URL}/${documentName}?${updateMask}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [key, jsToFirestoreValue(value)]),
      ),
    }),
  })
}

function isSeriesAbandoned(series) {
  return ['abandoned', 'abandonada', 'abandonado'].includes(
    String(series.user_status || series.library_status || series.personal_status || '')
      .trim()
      .toLowerCase(),
  )
}

async function getTodayEpisodesForSeries(series, todayKey) {
  const data = await tmdbFetch(`/tv/${series.tmdb_id || series.id}`)
  const candidates = [data.next_episode_to_air, data.last_episode_to_air].filter(Boolean)
  const seenEpisodeIds = new Set()

  return candidates
    .filter((episode) => episode.air_date === todayKey)
    .filter((episode) => {
      if (seenEpisodeIds.has(episode.id)) return false
      seenEpisodeIds.add(episode.id)
      return true
    })
    .map((episode) => ({
      episodeNumber: episode.episode_number,
      seasonNumber: episode.season_number,
      seriesTitle: series.title || data.name || 'Série acompanhada',
      title: episode.name,
    }))
}

function buildNotificationPayload(episodes, todayKey) {
  const title =
    episodes.length === 1
      ? `Hoje tem ${episodes[0].seriesTitle}`
      : `Hoje tem ${episodes.length} episódios novos`
  const body =
    episodes.length === 1
      ? `S${episodes[0].seasonNumber}E${episodes[0].episodeNumber}${episodes[0].title ? ` · ${episodes[0].title}` : ''}`
      : episodes
          .slice(0, 3)
          .map((episode) => episode.seriesTitle)
          .join(', ') + (episodes.length > 3 ? '...' : '')

  return {
    notification: { title, body },
    data: {
      tag: `series-vault-${todayKey}`,
      url: '/?tab=calendar',
    },
    webpush: {
      fcm_options: {
        link: '/?tab=calendar',
      },
    },
  }
}

async function sendFcmMessage(accessToken, token, payload) {
  const projectId = getProjectId()
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          ...payload,
        },
      }),
    },
  )

  if (!response.ok) {
    const error = new Error(`FCM returned status ${response.status}`)
    error.statusCode = response.status >= 500 ? 502 : response.status
    throw error
  }

  return response.json()
}

async function notifyUser(accessToken, userId, options) {
  const [subscriptionDocs, trackedDocs] = await Promise.all([
    listDocuments(accessToken, `seriesVaultUsers/${userId}/notificationSubscriptions`),
    listDocuments(accessToken, `seriesVaultUsers/${userId}/trackedSeries`),
  ])

  const subscriptions = subscriptionDocs
    .map((document) => ({
      ...firestoreFieldsToJs(document.fields),
      documentName: document.name,
    }))
    .filter((subscription) => subscription.enabled && subscription.token)

  if (subscriptions.length === 0) return { sent: 0, skipped: 0 }

  const seriesList = trackedDocs
    .map((document) => firestoreFieldsToJs(document.fields))
    .filter((series) => series.tmdb_id && !isSeriesAbandoned(series))

  if (seriesList.length === 0) return { sent: 0, skipped: subscriptions.length }

  let sent = 0
  let skipped = 0

  for (const subscription of subscriptions) {
    const todayKey = options.date || formatDateKeyForTimeZone(subscription.timezone)

    if (!options.force && subscription.last_notified_date === todayKey) {
      skipped += 1
      continue
    }

    const episodes = (
      await Promise.all(
        seriesList.map((series) => getTodayEpisodesForSeries(series, todayKey).catch(() => [])),
      )
    ).flat()

    if (episodes.length === 0) {
      skipped += 1
      await patchDocument(accessToken, subscription.documentName, {
        last_checked_date: todayKey,
      })
      continue
    }

    await sendFcmMessage(accessToken, subscription.token, buildNotificationPayload(episodes, todayKey))
    await patchDocument(accessToken, subscription.documentName, {
      last_checked_date: todayKey,
      last_notified_date: todayKey,
      last_notified_episode_count: episodes.length,
    })
    sent += 1
  }

  return { sent, skipped }
}

module.exports = async function handler(req, res) {
  try {
    if (!['GET', 'POST'].includes(req.method)) {
      sendJson(res, 405, { detail: 'Method not allowed' })
      return
    }

    const cronSecret = process.env.CRON_SECRET
    const providedSecret =
      req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.query.secret

    if (cronSecret && providedSecret !== cronSecret) {
      sendJson(res, 401, { detail: 'Unauthorized' })
      return
    }

    const accessToken = await getGoogleAccessToken()
    const userDocs = await listDocuments(accessToken, 'seriesVaultUsers')
    const force = req.query.force === '1' || req.query.force === 'true'
    const date = req.query.date ? String(req.query.date) : undefined

    const results = await Promise.all(
      userDocs.map((document) => {
        const userId = document.name.split('/').pop()
        return notifyUser(accessToken, userId, { date, force }).catch((error) => ({
          error: error.message,
          sent: 0,
          skipped: 0,
        }))
      }),
    )

    sendJson(res, 200, {
      detail: 'Daily notification job finished',
      sent: results.reduce((total, result) => total + result.sent, 0),
      skipped: results.reduce((total, result) => total + result.skipped, 0),
      users: userDocs.length,
    })
  } catch (error) {
    handleError(res, error)
  }
}
