const ALLOWED_RUN_TYPES = new Set(['primary', 'retry', 'weekly', 'shadow'])

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) { output.set(part, offset); offset += part.length }
  return output
}

function derLength(length: number): Uint8Array {
  if (length < 128) return Uint8Array.of(length)
  const bytes: number[] = []
  for (let value = length; value > 0; value >>= 8) bytes.unshift(value & 0xff)
  return Uint8Array.of(0x80 | bytes.length, ...bytes)
}

function der(tag: number, value: Uint8Array): Uint8Array {
  return concatBytes(Uint8Array.of(tag), derLength(value.length), value)
}

function pemBytes(value: string): Uint8Array {
  const normalized = value.replace(/\\n/g, '\n')
  const isPkcs1 = normalized.includes('BEGIN RSA PRIVATE KEY')
  const body = normalized.replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/, '')
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/, '').replace(/\s/g, '')
  const binary = atob(body)
  const raw = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  if (!isPkcs1) return raw
  const version = Uint8Array.of(0x02, 0x01, 0x00)
  const rsaAlgorithm = Uint8Array.of(0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00)
  return der(0x30, concatBytes(version, rsaAlgorithm, der(0x04, raw)))
}

async function appJwt(appId: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })))
  const unsigned = `${header}.${payload}`
  const keyBytes = pemBytes(privateKey)
  const keyBuffer = keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) as ArrayBuffer
  const key = await crypto.subtle.importKey(
    'pkcs8', keyBuffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`
}

async function githubRequest(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
}

async function installationToken(): Promise<string> {
  const jwt = await appJwt(requiredEnv('GITHUB_APP_ID'), requiredEnv('GITHUB_APP_PRIVATE_KEY'))
  const installationId = requiredEnv('GITHUB_APP_INSTALLATION_ID')
  const response = await githubRequest(
    `https://api.github.com/app/installations/${installationId}/access_tokens`, jwt, { method: 'POST' },
  )
  if (!response.ok) throw new Error(`GitHub installation token failed (${response.status})`)
  const body = await response.json() as { token?: string }
  if (!body.token) throw new Error('GitHub installation token missing')
  return body.token
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const expected = requiredEnv('DISPATCH_SHARED_SECRET')
  if (request.headers.get('x-dispatch-secret') !== expected) return new Response('Unauthorized', { status: 401 })

  try {
    const body = await request.json() as { run_type?: string }
    const runType = body.run_type?.trim() ?? ''
    if (!ALLOWED_RUN_TYPES.has(runType)) return Response.json({ error: 'Invalid run_type' }, { status: 400 })

    const owner = requiredEnv('GITHUB_REPOSITORY_OWNER')
    const repository = requiredEnv('GITHUB_REPOSITORY_NAME')
    const token = await installationToken()
    const response = await githubRequest(
      `https://api.github.com/repos/${owner}/${repository}/actions/workflows/price-check.yml/dispatches`,
      token,
      { method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { run_type: runType } }) },
    )
    if (!response.ok) throw new Error(`GitHub workflow dispatch failed (${response.status})`)
    return Response.json({ accepted: true, run_type: runType }, { status: 202 })
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown dispatcher error')
    return Response.json({ error: 'Dispatch failed' }, { status: 502 })
  }
})
