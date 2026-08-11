const { sendJson } = require('./_shared')

module.exports = function handler(req, res) {
  const episodeId = Number(req.query.episodeId)

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

  sendJson(res, 405, { detail: 'Method not allowed' })
}
