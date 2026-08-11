const { handleError, sendJson, serializeWatchProviders, tmdbFetch } = require('../../_tmdb')

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

    const data = await tmdbFetch(`/tv/${tmdbId}/watch/providers`)
    sendJson(res, 200, serializeWatchProviders(data))
  } catch (error) {
    handleError(res, error)
  }
}
