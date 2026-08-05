const { sendJson } = require('../../_tmdb')

module.exports = function handler(req, res) {
  if (req.method === 'PATCH') {
    sendJson(res, 200, {
      episode_id: Number(req.query.episodeId),
      progress_percent: 100,
      watched_at: new Date().toISOString(),
    })
    return
  }

  if (req.method === 'DELETE') {
    sendJson(res, 200, { detail: 'Episode unwatched' })
    return
  }

  sendJson(res, 405, { detail: 'Method not allowed' })
}
