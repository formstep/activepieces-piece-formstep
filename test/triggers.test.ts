/**
 * The whole trigger lifecycle against a Formstep API speaking real HTTP:
 * publish (subscribe with a signing secret), receive a signed delivery, turn
 * off (unsubscribe). Only Activepieces' own context is stood in for.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { publicLinkSubmissionCreated, requestCanceled, requestCompleted, requestExpired } from '../src/lib/triggers'
import { storeKey, type StoredSubscription } from '../src/lib/triggers/formstep-trigger'
import { REQUEST_COMPLETED_SAMPLE } from '../src/lib/triggers/samples'
import { CONNECTION, FakeFormstep, memoryStore, signDelivery } from './fake-formstep'

const WEBHOOK_URL = 'https://cloud.activepieces.com/api/v1/webhooks/flow_1'

let formstep: FakeFormstep

beforeAll(async () => {
  formstep = await new FakeFormstep({ forms: [{ id: 'form_live', name: 'Vendor onboarding', published: true }] }).start()
  process.env['FORMSTEP_API_URL'] = formstep.apiUrl
})

afterAll(async () => {
  delete process.env['FORMSTEP_API_URL']
  await formstep.stop()
})

type AnyTrigger = typeof requestCompleted

function hookContext(options: { store?: ReturnType<typeof memoryStore>; webhookUrl?: string; formId?: string } = {}) {
  return {
    auth: CONNECTION,
    propsValue: { formId: options.formId ?? 'form_live' },
    store: options.store ?? memoryStore(),
    webhookUrl: options.webhookUrl ?? WEBHOOK_URL,
    payload: { body: {}, headers: {}, queryParams: {} },
  }
}

function runContext(store: ReturnType<typeof memoryStore>, payload: { body: unknown; rawBody?: unknown; headers: Record<string, string> }) {
  return { ...hookContext({ store }), payload: { ...payload, queryParams: {} } }
}

// The hooks are typed for the engine's full context; the tests hand over what they read.
const call = (hook: (context: never) => Promise<unknown>, context: unknown) => hook(context as never)

async function enable(trigger: AnyTrigger, store = memoryStore()) {
  await call(trigger.onEnable, hookContext({ store }))
  const stored = (await store.get<StoredSubscription>(storeKey(eventTypeOf(trigger))))!
  return { store, stored }
}

function eventTypeOf(trigger: AnyTrigger) {
  return trigger.name === 'public_link_submission_created' ? 'submission_created' : (trigger.name as 'request_completed')
}

describe('publishing a flow', () => {
  it.each([
    [requestCompleted, 'request_completed'],
    [requestExpired, 'request_expired'],
    [requestCanceled, 'request_canceled'],
    [publicLinkSubmissionCreated, 'submission_created'],
  ] as const)('subscribes %s as provider activepieces with a signing secret', async (trigger, eventType) => {
    const { stored } = await enable(trigger)
    const subscription = formstep.subscriptions.get(stored.subscriptionId)
    expect(subscription).toMatchObject({ formId: 'form_live', targetUrl: WEBHOOK_URL, provider: 'activepieces', eventType })
    expect(subscription?.signingSecret).toBe(stored.webhookSecret)
    expect(stored.webhookSecret).toMatch(/^whsec_[a-f0-9]{64}$/)
  })

  it('removes the subscription a failed turn-off left behind before subscribing again', async () => {
    const { store, stored: first } = await enable(requestCompleted)
    const { stored: second } = await enable(requestCompleted, store)
    expect(formstep.subscriptions.has(first.subscriptionId)).toBe(false)
    expect(formstep.subscriptions.get(second.subscriptionId)?.signingSecret).toBe(second.webhookSecret)
  })

  it('subscribes again when the left-behind subscription is already gone', async () => {
    const { store, stored: first } = await enable(requestCompleted)
    formstep.subscriptions.delete(first.subscriptionId)
    const { stored: second } = await enable(requestCompleted, store)
    expect(second.subscriptionId).not.toBe(first.subscriptionId)
  })

  it('refuses an http webhook URL before calling Formstep, and says what to set', async () => {
    const before = formstep.callsOf('webhooks.create').length
    await expect(call(requestCompleted.onEnable, hookContext({ webhookUrl: 'http://localhost:8080/api/v1/webhooks/flow_1' }))).rejects.toThrow(
      /HTTPS addresses only.*AP_FRONTEND_URL/
    )
    expect(formstep.callsOf('webhooks.create')).toHaveLength(before)
  })

  it("passes Formstep's error code through when the form is gone", async () => {
    await expect(call(requestCompleted.onEnable, hookContext({ formId: 'form_deleted' }))).rejects.toThrow(
      'NOT_FOUND: Form not found. Reason: FORM_NOT_FOUND. Field: formId'
    )
  })
})

describe('a delivery', () => {
  // Spacing and non-ASCII text that a parse-and-reserialize would change, so only the raw bytes verify.
  const rawBody = JSON.stringify(REQUEST_COMPLETED_SAMPLE, null, 4).replace('"Acme"', '"Ächme — Ünïcødé ✓"')

  it('runs the flow with the event envelope when the signature checks out', async () => {
    const { store, stored } = await enable(requestCompleted)
    const delivery = formstep.deliver(stored.subscriptionId, rawBody)
    const items = await call(requestCompleted.run, runContext(store, delivery))
    expect(items).toEqual([JSON.parse(rawBody)])
  })

  it('finds the signature header whatever its case', async () => {
    const { store, stored } = await enable(requestCompleted)
    const delivery = formstep.deliver(stored.subscriptionId, rawBody)
    const headers = { 'X-Formstep-Signature': delivery.headers['x-formstep-signature'] }
    expect(await call(requestCompleted.run, runContext(store, { ...delivery, headers }))).toHaveLength(1)
  })

  it('starts nothing when the body was re-serialized after signing', async () => {
    const { store, stored } = await enable(requestCompleted)
    const delivery = formstep.deliver(stored.subscriptionId, rawBody)
    const items = await call(requestCompleted.run, runContext(store, { ...delivery, rawBody: JSON.stringify(delivery.body) }))
    expect(items).toEqual([])
  })

  it('starts nothing when signed with another secret', async () => {
    const { store } = await enable(requestCompleted)
    const headers = { 'x-formstep-signature': signDelivery(`whsec_${'0'.repeat(64)}`, Math.floor(Date.now() / 1000), rawBody) }
    expect(await call(requestCompleted.run, runContext(store, { body: JSON.parse(rawBody), rawBody, headers }))).toEqual([])
  })

  it('starts nothing when unsigned', async () => {
    const { store } = await enable(requestCompleted)
    expect(await call(requestCompleted.run, runContext(store, { body: JSON.parse(rawBody), rawBody, headers: {} }))).toEqual([])
  })

  it('starts nothing when signed more than five minutes ago', async () => {
    const { store, stored } = await enable(requestCompleted)
    const delivery = formstep.deliver(stored.subscriptionId, rawBody, Math.floor(Date.now() / 1000) - 301)
    expect(await call(requestCompleted.run, runContext(store, delivery))).toEqual([])
  })

  it('fails instead of passing the body through when Activepieces gives no raw body', async () => {
    const { store, stored } = await enable(requestCompleted)
    const { rawBody: _raw, ...delivery } = formstep.deliver(stored.subscriptionId, rawBody)
    await expect(call(requestCompleted.run, runContext(store, delivery))).rejects.toThrow(/did not pass the raw body/)
  })

  it('fails when the trigger holds no secret', async () => {
    const delivery = formstep.deliver((await enable(requestCompleted)).stored.subscriptionId, rawBody)
    await expect(call(requestCompleted.run, runContext(memoryStore(), delivery))).rejects.toThrow(/no Formstep signing secret/)
  })

  it("does not accept a delivery signed for another trigger of the same flow", async () => {
    const store = memoryStore()
    await enable(requestCompleted, store)
    const expired = await enable(requestExpired, store)
    const delivery = formstep.deliver(expired.stored.subscriptionId, rawBody)
    expect(await call(requestCompleted.run, runContext(store, delivery))).toEqual([])
  })
})

describe('turning a flow off', () => {
  it('removes the subscription and forgets the secret', async () => {
    const { store, stored } = await enable(requestCanceled)
    await call(requestCanceled.onDisable, hookContext({ store }))
    expect(formstep.subscriptions.has(stored.subscriptionId)).toBe(false)
    expect(store.values.size).toBe(0)
  })

  it('succeeds when Formstep already removed the subscription', async () => {
    const { store, stored } = await enable(requestCanceled)
    formstep.subscriptions.delete(stored.subscriptionId)
    await expect(call(requestCanceled.onDisable, hookContext({ store }))).resolves.toBeUndefined()
    expect(store.values.size).toBe(0)
  })

  it('succeeds when nothing was subscribed', async () => {
    await expect(call(requestCanceled.onDisable, hookContext())).resolves.toBeUndefined()
  })

  it('fails, and keeps the secret, when Formstep refuses for another reason', async () => {
    const { store } = await enable(requestCanceled)
    formstep.scripted.set('webhooks.delete', { status: 500, body: JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Try again' } }) })
    await expect(call(requestCanceled.onDisable, hookContext({ store }))).rejects.toThrow('INTERNAL_ERROR: Try again')
    expect(store.values.size).toBe(1)
  })
})
