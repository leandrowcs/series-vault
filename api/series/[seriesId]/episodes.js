const { handleError, sendJson, tmdbFetch } = require('../../_tmdb')

const MAX_SEASON_FETCH_WORKERS = 6

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

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      sendJson(res, 405, { detail: 'Method not allowed' })
      return
    }

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
  } catch (error) {
    handleError(res, error)
  }
}
