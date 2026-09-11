import { describe, expect, it } from 'vitest'

import { withFutureJwtRetry } from './auth-retry'

describe('withFutureJwtRetry', () => {
  it('retries one transient JWT issued-at-future failure', async () => {
    let attempts = 0

    const result = await withFutureJwtRetry(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('JWT issued at future')
      return 'realtime'
    }, async () => undefined)

    expect(result).toBe('realtime')
    expect(attempts).toBe(2)
  })

  it('does not retry unrelated data errors', async () => {
    let attempts = 0

    await expect(withFutureJwtRetry(async () => {
      attempts += 1
      throw new Error('permission denied')
    }, async () => undefined)).rejects.toThrow('permission denied')

    expect(attempts).toBe(1)
  })
})
