const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const MAX_SEASON_FETCH_WORKERS = 6

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

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'object') return req.body

  try {
    return JSON.parse(req.body)
  } catch {
    return {}
  }
}

function getRouteParts(req) {
  if (Array.isArray(req.query.path)) {
    return req.query.path.flatMap((part) => String(part).split('/')).filter(Boolean)
  }

  if (typeof req.query.path === 'string') {
    return req.query.path.split('/').filter(Boolean)
  }

  const url = new URL(req.url, 'http://localhost')
  return url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean)
}

function serializeWatchProviders(data) {
  const results = (data && data.results) || {}
  const countryData = results.BR || results.US || Object.values(results)[0] || {}
  const providerTypes = ['flatrate', 'ads', 'free', 'rent', 'buy']
  const providersById = new Map()

  providerTypes.forEach((providerType) => {
    ;(countryData[providerType] || []).forEach((provider) => {
      const providerId = provider.provider_id || provider.provider_name
      if (!providersById.has(providerId)) {
        providersById.set(providerId, {
          name: provider.provider_name,
          logo_path: provider.logo_path || null,
          type: providerType,
        })
      }
    })
  })

  return Array.from(providersById.values()).filter((provider) => provider.name)
}

function toTrackedSeries(data) {
  return {
    id: data.id,
    tmdb_id: data.id,
    title: data.name || data.original_name || '',
    overview: data.overview || '',
    poster_path: data.poster_path || null,
    backdrop_path: data.backdrop_path || null,
    completed_percent: 0,
    number_of_seasons: data.number_of_seasons || 0,
    number_of_episodes:
      (data.seasons || [])
        .filter((season) => season.season_number > 0)
        .reduce((total, season) => total + Number(season.episode_count || 0), 0) ||
      data.number_of_episodes ||
      0,
    status: data.status || null,
    first_air_date: data.first_air_date || null,
    last_air_date: data.last_air_date || null,
    episode_run_time: Array.isArray(data.episode_run_time) && data.episode_run_time.length
      ? data.episode_run_time[0]
      : null,
    vote_average: data.vote_average || null,
    vote_count: data.vote_count || null,
    genres: (data.genres || []).map((genre) => genre.name).filter(Boolean),
    actors: ((data.credits && data.credits.cast) || []).slice(0, 10).map((actor) => ({
      name: actor.name,
      character: actor.character || null,
      profile_path: actor.profile_path || null,
    })),
    watch_providers: serializeWatchProviders(data['watch/providers']),
    last_synced_at: new Date().toISOString(),
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = []
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const currentIndex = cursor
      cursor += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

async function handleSeries(req, res, parts) {
  if (parts.length === 1) {
    if (req.method === 'GET') {
      const query = String(req.query.query || '').trim()
      if (!query) {
        sendJson(res, 400, { detail: 'Query is required' })
        return
      }

      const data = await tmdbFetch('/search/tv', {
        query,
        include_adult: false,
      })

      sendJson(
        res,
        200,
        (data.results || []).map((item) => ({
          tmdb_id: item.id,
          name: item.name,
          first_air_date: item.first_air_date,
          overview: item.overview,
          poster_path: item.poster_path,
        })),
      )
      return
    }

    if (req.method === 'POST') {
      const body = parseBody(req)
      const tmdbId = Number(body.tmdb_id)
      if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
        sendJson(res, 400, { detail: 'Valid tmdb_id is required' })
        return
      }

      const data = await tmdbFetch(`/tv/${tmdbId}`, { append_to_response: 'credits,watch/providers' })
      sendJson(res, 200, toTrackedSeries(data))
      return
    }
  }

  if (parts.length === 2 && parts[1] === 'tracked') {
    sendJson(res, req.method === 'GET' ? 200 : 405, req.method === 'GET' ? [] : { detail: 'Method not allowed' })
    return
  }

  if (parts.length === 2 && parts[1] === 'trending') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { detail: 'Method not allowed' })
      return
    }

    const data = await tmdbFetch('/trending/tv/day', {
      page: Number(req.query.page || 1),
    })

    sendJson(
      res,
      200,
      (data.results || [])
        .filter((item) => item.poster_path)
        .map((item) => ({
          tmdb_id: item.id,
          name: item.name || item.original_name || '',
          first_air_date: item.first_air_date,
          overview: item.overview,
          poster_path: item.poster_path,
          vote_average: item.vote_average,
          vote_count: item.vote_count,
          popularity: item.popularity,
        })),
    )
    return
  }

  if (parts.length === 3 && parts[2] === 'episodes') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { detail: 'Method not allowed' })
      return
    }

    const tmdbId = Number(parts[1])
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
      sendJson(res, 400, { detail: 'Valid series id is required' })
      return
    }

    const series = await tmdbFetch(`/tv/${tmdbId}`)
    const seasonNumbers = (series.seasons || [])
      .map((season) => season.season_number)
      .filter((seasonNumber) => Number.isInteger(seasonNumber))

    const seasons = await mapWithConcurrency(seasonNumbers, MAX_SEASON_FETCH_WORKERS, (seasonNumber) =>
      tmdbFetch(`/tv/${tmdbId}/season/${seasonNumber}`),
    )

    const episodes = seasons
      .flatMap((season) =>
        (season.episodes || []).map((episode) => ({
          id: episode.id,
          tmdb_episode_id: episode.id,
          season_number: season.season_number,
          episode_number: episode.episode_number,
          title: episode.name,
          overview: episode.overview,
          air_date: episode.air_date,
          runtime: episode.runtime,
          still_path: episode.still_path,
          vote_average: episode.vote_average,
          vote_count: episode.vote_count,
          season_name: season.name,
          season_poster_path: season.poster_path,
          watched: false,
          progress_percent: 0,
        })),
      )
      .sort((episodeA, episodeB) => episodeA.season_number - episodeB.season_number || episodeA.episode_number - episodeB.episode_number)

    sendJson(res, 200, episodes)
    return
  }

  if (parts.length === 3 && parts[2] === 'watch-providers') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { detail: 'Method not allowed' })
      return
    }

    const tmdbId = Number(parts[1])
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
      sendJson(res, 400, { detail: 'Valid series id is required' })
      return
    }

    const data = await tmdbFetch(`/tv/${tmdbId}/watch/providers`)
    sendJson(res, 200, serializeWatchProviders(data))
    return
  }

  sendJson(res, 404, { detail: 'Not found' })
}

function handleStats(req, res, parts) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { detail: 'Method not allowed' })
    return
  }

  const statsRoute = parts[1]
  if (statsRoute === 'overview') {
    sendJson(res, 200, {
      total_watched_episodes: 0,
      total_runtime_minutes: 0,
    })
    return
  }

  if (['actors', 'genres', 'top-series', 'years'].includes(statsRoute)) {
    sendJson(res, 200, [])
    return
  }

  sendJson(res, 404, { detail: 'Not found' })
}

function handleCalendar(req, res, parts) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { detail: 'Method not allowed' })
    return
  }

  if (parts.length === 1 || (parts.length === 2 && parts[1] === 'new-episodes')) {
    sendJson(res, 200, [])
    return
  }

  sendJson(res, 404, { detail: 'Not found' })
}

function handleWatch(req, res, parts) {
  if (parts.length === 3 && parts[1] === 'episodes') {
    const episodeId = Number(parts[2])

    if (req.method === 'PATCH') {
      sendJson(res, 200, {
        episode_id: episodeId,
        progress_percent: 100,
        watched_at: new Date().toISOString(),
      })
      return
    }

    if (req.method === 'DELETE') {
      sendJson(res, 200, { detail: 'Episode unwatched' })
      return
    }
  }

  sendJson(res, 405, { detail: 'Method not allowed' })
}

function handleError(res, error) {
  const statusCode = Number(error.statusCode || 500)
  sendJson(res, statusCode, { detail: error.message || 'Unexpected API error' })
}

module.exports = async function handler(req, res) {
  try {
    const parts = getRouteParts(req)

    if (parts[0] === 'series') {
      await handleSeries(req, res, parts)
      return
    }

    if (parts[0] === 'stats') {
      handleStats(req, res, parts)
      return
    }

    if (parts[0] === 'calendar') {
      handleCalendar(req, res, parts)
      return
    }

    if (parts[0] === 'watch') {
      handleWatch(req, res, parts)
      return
    }

    sendJson(res, 404, { detail: 'Not found' })
  } catch (error) {
    handleError(res, error)
  }
}
