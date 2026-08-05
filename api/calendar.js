const { sendJson } = require('./_tmdb')

module.exports = function handler(_req, res) {
  sendJson(res, 200, [])
}
