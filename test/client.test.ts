import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { formstepCall, FormstepApiError } from '../src/lib/client'
import { verifyWebhookSignature } from '../src/lib/signature'
import { API_TOKEN, FakeFormstep, signDelivery } from './fake-formstep'

let formstep: FakeFormstep

beforeAll(async () => {
  formstep = await new FakeFormstep().start()
  process.env['FORMSTEP_API_URL'] = formstep.apiUrl
})

afterAll(async () => {
  delete process.env['FORMSTEP_API_URL']
  await formstep.stop()
})

describe('formstepCall', () => {
  it('posts the method and params with the bearer token and returns data', async () => {
    expect(await formstepCall(API_TOKEN, 'workspaces.list')).toEqual({ items: [{ id: 'ws_1', name: 'Acme' }], hasMore: false, nextCursor: null })
    expect(formstep.calls.at(-1)).toEqual({ method: 'workspaces.list', params: {} })
  })

  it('turns an error status into CODE: message with its HTTP status', async () => {
    const error = await formstepCall('fs_wrong', 'me.get').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(FormstepApiError)
    expect(error).toMatchObject({ code: 'UNAUTHORIZED', status: 401, message: 'UNAUTHORIZED: Invalid token' })
  })

  it('unwraps an error envelope that came with a 200', async () => {
    formstep.scripted.set('me.get', {
      status: 200,
      body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Bad prefill', details: { reason: 'INVALID_PREFILL_VALUE', field: 'plan', validKeys: ['pro', 'free'] } } }),
    })
    await expect(formstepCall(API_TOKEN, 'me.get')).rejects.toMatchObject({
      status: 400,
      reason: 'INVALID_PREFILL_VALUE',
      message: 'VALIDATION_ERROR: Bad prefill. Reason: INVALID_PREFILL_VALUE. Field: plan. Valid keys: pro, free',
    })
  })

  it('refuses a response that is not the Formstep envelope', async () => {
    formstep.scripted.set('me.get', { status: 502, body: '<html>Bad gateway</html>' })
    await expect(formstepCall(API_TOKEN, 'me.get')).rejects.toThrow(/unreadable response \(HTTP 502\)/)
    formstep.scripted.set('me.get', { status: 200, body: JSON.stringify({ ok: true }) })
    await expect(formstepCall(API_TOKEN, 'me.get')).rejects.toThrow(/unreadable response/)
  })
})

describe('verifyWebhookSignature', () => {
  const secret = `whsec_${'a'.repeat(64)}`
  const rawBody = '{"id":"evt_1","answers":{"name":"Zoë 🚀"}}'
  const now = 1_800_000_000

  it('accepts a signature over the raw body, non-ASCII included', () => {
    expect(verifyWebhookSignature({ secret, rawBody, signatureHeader: signDelivery(secret, now, rawBody), nowSeconds: now })).toBe(true)
  })

  it('accepts a signature up to five minutes old, and no older', () => {
    const header = signDelivery(secret, now, rawBody)
    expect(verifyWebhookSignature({ secret, rawBody, signatureHeader: header, nowSeconds: now + 300 })).toBe(true)
    expect(verifyWebhookSignature({ secret, rawBody, signatureHeader: header, nowSeconds: now + 301 })).toBe(false)
  })

  it('refuses a malformed header', () => {
    expect(verifyWebhookSignature({ secret, rawBody, signatureHeader: 'sha256=abc', nowSeconds: now })).toBe(false)
    expect(verifyWebhookSignature({ secret, rawBody, signatureHeader: undefined, nowSeconds: now })).toBe(false)
  })
})
