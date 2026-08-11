const { sendJson } = require('./_shared')

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { detail: 'Method not allowed' })
    return
  }

  const route = String(req.query.route || '')

  if (route === 'overview') {
    sendJson(res, 200, {
      total_watched_episodes: 0,
      total_runtime_minutes: 0,
    })
    return
  }

  if (['actors', 'genres', 'top-series', 'years'].includes(route)) {
    sendJson(res, 200, [])
    return
  }

  sendJson(res, 404, { detail: 'Not found' })
}
