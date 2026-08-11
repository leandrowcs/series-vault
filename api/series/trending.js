const { handleError, sendJson, tmdbFetch } = require('../_tmdb')

module.exports = async function handler(req, res) {
  try {
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
  } catch (error) {
    handleError(res, error)
  }
}
