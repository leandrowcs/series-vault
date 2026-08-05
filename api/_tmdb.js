const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', statusCode === 200 ? 's-maxage=3600, stale-while-revalidate=86400' : 'no-store')
  res.end(JSON.stringify(data))
}

function getTmdbApiKey() {
  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) {
    const error = new Error('TMDB_API_KEY is not configured')
    error.statusCode = 500
    throw error
  }
  return apiKey
}

async function tmdbFetch(path, params = {}) {
  const url = new URL(`${TMDB_BASE_URL}${path}`)
  url.searchParams.set('api_key', getTmdbApiKey())
  url.searchParams.set('language', params.language || 'pt-BR')

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && key !== 'language') {
      url.searchParams.set(key, String(value))
    }
  })

  const response = await fetch(url)
  if (!response.ok) {
    const error = new Error(`TMDb returned status ${response.status}`)
    error.statusCode = response.status >= 500 ? 502 : response.status
    throw error
  }

  return response.json()
}

function toTrackedSeries(data) {
  return {
    id: data.id,
    tmdb_id: data.id,
    title: data.name || data.original_name || '',
    overview: data.overview || '',
    poster_path: data.poster_path || null,
    completed_percent: 0,
    number_of_seasons: data.number_of_seasons || 0,
    number_of_episodes: data.number_of_episodes || 0,
    status: data.status || null,
    last_synced_at: new Date().toISOString(),
  }
}

function handleError(res, error) {
  const statusCode = Number(error.statusCode || 500)
  sendJson(res, statusCode, { detail: error.message || 'Unexpected API error' })
}

module.exports = {
  handleError,
  sendJson,
  tmdbFetch,
  toTrackedSeries,
}
