const crypto = require('node:crypto')

const MAX_RESPONSE_BYTES = 3 * 1024 * 1024
const MAX_REDIRECTS = 3
const FETCH_TIMEOUT_MS = 20_000

const HTML_HOSTS = new Set([
  'fptshop.com.vn',
  'www.fptshop.com.vn',
  'thegioididong.com',
  'www.thegioididong.com',
])

const FPT_API_PREFIX = '/gw/v1/public/bff-before-order/product/'

function validateTarget(value) {
  let target
  try {
    target = new URL(value)
  } catch {
    return false
  }
  if (target.protocol !== 'https:' || target.username || target.password) return false
  if (HTML_HOSTS.has(target.hostname)) return true
  return target.hostname === 'papi.fptshop.com.vn' && target.pathname.startsWith(FPT_API_PREFIX)
}

function isAuthorized(header, expectedToken) {
  if (!expectedToken || typeof header !== 'string' || !header.startsWith('Bearer ')) return false
  const supplied = Buffer.from(header.slice(7), 'utf8')
  const expected = Buffer.from(expectedToken, 'utf8')
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)
}

async function fetchAllowed(initialUrl) {
  let currentUrl = initialUrl
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    if (!validateTarget(currentUrl)) throw new Error('Target is not allowed')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let response
    try {
      const target = new URL(currentUrl)
      const headers = {
        'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      }
      if (target.hostname === 'papi.fptshop.com.vn') {
        headers.accept = 'application/json'
        headers['order-channel'] = '1'
        headers.referer = 'https://fptshop.com.vn/'
      }
      response = await fetch(currentUrl, {
        headers,
        redirect: 'manual',
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error('Retailer redirect omitted Location')
      const redirected = new URL(location, currentUrl).toString()
      if (!validateTarget(redirected)) throw new Error('Redirect target is not allowed')
      currentUrl = redirected
      continue
    }

    const declaredLength = Number(response.headers.get('content-length') || 0)
    if (declaredLength > MAX_RESPONSE_BYTES) throw new Error('Retailer response is too large')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > MAX_RESPONSE_BYTES) throw new Error('Retailer response is too large')
    return {
      body: bytes.toString('utf8'),
      contentType: response.headers.get('content-type') || 'text/html; charset=utf-8',
      finalUrl: currentUrl,
      status: response.status,
    }
  }
  throw new Error('Too many retailer redirects')
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!isAuthorized(req.headers.authorization, process.env.PRICE_FETCH_RELAY_TOKEN)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const targetUrl = typeof req.body?.url === 'string' ? req.body.url : ''
  if (!validateTarget(targetUrl)) return res.status(400).json({ error: 'Target is not allowed' })
  try {
    const result = await fetchAllowed(targetUrl)
    return res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Retailer request failed'
    return res.status(502).json({ error: message })
  }
}

module.exports = handler
module.exports.fetchAllowed = fetchAllowed
module.exports.isAuthorized = isAuthorized
module.exports.validateTarget = validateTarget
