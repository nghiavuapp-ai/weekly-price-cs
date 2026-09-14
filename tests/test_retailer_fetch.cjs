const assert = require('node:assert/strict')
const test = require('node:test')

const relay = require('../api/retailer-fetch.js')

test('only permits the retailer hosts and FPT API paths used by Price Check', () => {
  assert.equal(relay.validateTarget('https://www.thegioididong.com/dtdd/iphone-17'), true)
  assert.equal(relay.validateTarget('https://fptshop.com.vn/dien-thoai/iphone-17'), true)
  assert.equal(
    relay.validateTarget('https://papi.fptshop.com.vn/gw/v1/public/bff-before-order/product/status?sku=1'),
    true,
  )
  assert.equal(relay.validateTarget('https://papi.fptshop.com.vn/internal/admin'), false)
  assert.equal(relay.validateTarget('http://www.thegioididong.com/dtdd/iphone-17'), false)
  assert.equal(relay.validateTarget('https://example.com/'), false)
  assert.equal(relay.validateTarget('https://127.0.0.1/'), false)
})

test('uses a timing-safe exact bearer-token comparison', () => {
  assert.equal(relay.isAuthorized('Bearer same-secret', 'same-secret'), true)
  assert.equal(relay.isAuthorized('Bearer same-secret-extra', 'same-secret'), false)
  assert.equal(relay.isAuthorized('', 'same-secret'), false)
  assert.equal(relay.isAuthorized('Bearer same-secret', ''), false)
})

test('rejects redirects that leave the retailer allowlist', async () => {
  const originalFetch = global.fetch
  global.fetch = async () => new Response(null, {
    status: 302,
    headers: { location: 'https://example.com/private' },
  })
  try {
    await assert.rejects(
      relay.fetchAllowed('https://www.thegioididong.com/dtdd/iphone-17'),
      /Redirect target is not allowed/,
    )
  } finally {
    global.fetch = originalFetch
  }
})
