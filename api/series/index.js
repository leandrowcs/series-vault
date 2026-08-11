const { handleError, sendJson, tmdbFetch, toTrackedSeries } = require('../_tmdb')

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'object') return req.body

  try {
    return JSON.parse(req.body)
  } catch {
    return {}
  }
}

module.exports = async function handler(req, res) {
  try {
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

    sendJson(res, 405, { detail: 'Method not allowed' })
  } catch (error) {
    handleError(res, error)
  }
}
