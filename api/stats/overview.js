const { sendJson } = require('../_tmdb')

module.exports = function handler(_req, res) {
  sendJson(res, 200, {
    total_watched_episodes: 0,
    total_runtime_minutes: 0,
  })
}
