const {
  MAX_SEASON_FETCH_WORKERS,
  handleError,
  mapWithConcurrency,
  parseBody,
  sendJson,
  serializeWatchProviders,
  tmdbFetch,
  toTrackedSeries,
} = require('./_shared')

async function sendEpisodes(req, res) {
  const tmdbId = Number(req.query.seriesId)
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
}

module.exports = async function handler(req, res) {
  try {
    const route = String(req.query.route || '')

    if (req.method === 'GET' && route === 'tracked') {
      sendJson(res, 200, [])
      return
    }

    if (req.method === 'GET' && route === 'trending') {
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

    if (req.method === 'GET' && route === 'popular') {
      const data = await tmdbFetch('/tv/popular', {
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

    if (req.method === 'GET' && route === 'episodes') {
      await sendEpisodes(req, res)
      return
    }

    if (req.method === 'GET' && route === 'watch-providers') {
      const tmdbId = Number(req.query.seriesId)
      if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
        sendJson(res, 400, { detail: 'Valid series id is required' })
        return
      }

      const data = await tmdbFetch(`/tv/${tmdbId}/watch/providers`)
      sendJson(res, 200, serializeWatchProviders(data))
      return
    }

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

    if (req.method === 'PATCH' && route === 'status') {
      sendJson(res, 200, {
        series_id: Number(req.query.seriesId || 0) || null,
        tmdb_id: Number(req.query.tmdbId || 0) || null,
        user_status: parseBody(req).user_status || null,
      })
      return
    }

    if (req.method === 'DELETE') {
      sendJson(res, 200, {
        detail: 'Series removed',
        series_id: Number(req.query.seriesId || 0) || null,
        tmdb_id: Number(req.query.tmdbId || 0) || null,
      })
      return
    }

    sendJson(res, 405, { detail: 'Method not allowed' })
  } catch (error) {
    handleError(res, error)
  }
}
