import { createHmac } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { AppConnectionType } from '@activepieces/shared'

export const API_TOKEN = 'fs_test_token'

const NATIVE_PROVIDERS = ['zapier', 'make', 'n8n', 'pipedream', 'composio', 'integrately', 'activepieces']
const EVENT_TYPES = ['submission_created', 'submission_updated', 'submission_abandoned', 'request_completed', 'request_expired', 'request_canceled']

interface FakeForm {
  id: string
  name: string
  published: boolean
}

export interface StoredSubscription {
  subscriptionId: string
  formId: string
  provider: string
  targetUrl: string
  eventType: string
  signingSecret?: string
}

export interface StoredRequest {
  id: string
  status: 'pending' | 'completed' | 'expired' | 'canceled'
  formId: string
  params: Record<string, unknown>
  externalId: string | null
  isTest: boolean
  remindersSent: number
  cancelReason?: string
}

type RpcResult = { data: unknown } | { status: number; error: { code: string; message: string; details?: Record<string, unknown> } }

function fail(status: number, code: string, message: string, details?: Record<string, unknown>): RpcResult {
  return { status, error: { code, message, ...(details ? { details } : {}) } }
}

export function signDelivery(secret: string, timestampSeconds: number, rawBody: string): string {
  const digest = createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex')
  return `t=${timestampSeconds},sha256=${digest}`
}

/**
 * An in-process Formstep external API: enough of `POST /api/v1` for the piece
 * to run its whole lifecycle over real HTTP. It checks the bearer token and
 * the `webhooks.create` rules like the server, stores subscriptions and
 * requests, and signs deliveries with the secret each subscription registered.
 */
export class FakeFormstep {
  readonly workspace = { id: 'ws_1', name: 'Acme' }
  readonly forms: FakeForm[]
  readonly fields: Record<string, unknown[]>
  readonly subscriptions = new Map<string, StoredSubscription>()
  readonly requests = new Map<string, StoredRequest>()
  readonly calls: Array<{ method: string; params: Record<string, unknown> }> = []
  /** Answers the next call of a method with this, once. */
  readonly scripted = new Map<string, { status: number; body: string }>()
  apiUrl = ''
  private server?: http.Server
  private nextId = 1

  constructor(options: { forms?: FakeForm[]; fields?: Record<string, unknown[]> } = {}) {
    this.forms = options.forms ?? [{ id: 'form_1', name: 'Customer Feedback', published: true }]
    this.fields = options.fields ?? {}
  }

  async start(): Promise<this> {
    this.server = http.createServer((request, response) => this.handle(request, response))
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', () => resolve()))
    this.apiUrl = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/api/v1`
    return this
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server!.close(() => resolve()))
  }

  callsOf(method: string) {
    return this.calls.filter((call) => call.method === method)
  }

  /** A delivery of `event` to a subscription, signed as Formstep signs it, with the raw body exactly as sent. */
  deliver(subscriptionId: string, rawBody: string, timestampSeconds = Math.floor(Date.now() / 1000)) {
    const subscription = this.subscriptions.get(subscriptionId)
    if (!subscription?.signingSecret) throw new Error(`No signed subscription ${subscriptionId}`)
    return {
      headers: {
        'content-type': 'application/json',
        'x-formstep-signature': signDelivery(subscription.signingSecret, timestampSeconds, rawBody),
        'x-formstep-event-type': 'request.completed',
      },
      rawBody,
      body: JSON.parse(rawBody) as unknown,
    }
  }

  private handle(request: http.IncomingMessage, response: http.ServerResponse): void {
    let content = ''
    request.on('data', (chunk) => (content += chunk))
    request.on('end', () => {
      const reply = (status: number, body: unknown) => {
        response.writeHead(status, { 'content-type': 'application/json' })
        response.end(typeof body === 'string' ? body : JSON.stringify(body))
      }
      if (request.url !== '/api/v1' || request.method !== 'POST') {
        return reply(404, { ok: false, error: { code: 'NOT_FOUND', message: 'No route' } })
      }
      if (request.headers.authorization !== `Bearer ${API_TOKEN}`) {
        return reply(401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } })
      }
      const { method, params = {} } = JSON.parse(content) as { method: string; params?: Record<string, unknown> }
      this.calls.push({ method, params })
      const scripted = this.scripted.get(method)
      if (scripted) {
        this.scripted.delete(method)
        return reply(scripted.status, scripted.body)
      }
      const result = this.dispatch(method, params)
      if ('error' in result) return reply(result.status, { ok: false, error: result.error })
      return reply(200, { ok: true, data: result.data })
    })
  }

  private dispatch(method: string, params: Record<string, unknown>): RpcResult {
    switch (method) {
      case 'me.get':
        return { data: { user: { id: 'user_1', email: 'owner@acme.com' } } }
      case 'workspaces.list':
        return { data: { items: [this.workspace], hasMore: false, nextCursor: null } }
      case 'forms.list':
        return this.listForms(params)
      case 'fields.list':
        return { data: { items: this.fields[String(params.formId)] ?? [], hasMore: false, nextCursor: null } }
      case 'webhooks.create':
        return this.createSubscription(params)
      case 'webhooks.delete':
        return this.deleteSubscription(params)
      case 'requests.create':
        return this.createRequest(params)
      case 'requests.get':
        return this.withRequest(params, (request) => ({ data: this.summary(request) }))
      case 'requests.remind':
        return this.withRequest(params, (request) => {
          if (request.status !== 'pending') return fail(409, 'CONFLICT', 'Request is not pending', { reason: 'REQUEST_NOT_PENDING' })
          request.remindersSent += 1
          return { data: this.summary(request) }
        })
      case 'requests.cancel':
        return this.withRequest(params, (request) => {
          if (request.status !== 'pending') return fail(409, 'CONFLICT', 'Request is not pending', { reason: 'REQUEST_NOT_PENDING' })
          request.status = 'canceled'
          if (typeof params.reason === 'string') request.cancelReason = params.reason
          return { data: this.summary(request) }
        })
      case 'requests.list':
        return this.listRequests(params)
      default:
        return fail(404, 'METHOD_NOT_FOUND', `Unknown method ${method}`)
    }
  }

  private listForms(params: Record<string, unknown>): RpcResult {
    if (params.workspaceId !== this.workspace.id) return fail(403, 'FORBIDDEN', 'Not your workspace')
    const items = this.forms.map((form) => ({ id: form.id, name: form.name, isPublished: form.published }))
    return { data: { items, hasMore: false, nextCursor: null } }
  }

  private createSubscription(params: Record<string, unknown>): RpcResult {
    const { formId, targetUrl, provider, eventType = 'submission_created', signingSecret } = params
    if (!this.forms.some((form) => form.id === formId)) return fail(404, 'NOT_FOUND', 'Form not found', { reason: 'FORM_NOT_FOUND', field: 'formId' })
    if (typeof targetUrl !== 'string' || !targetUrl.startsWith('https://')) return fail(400, 'VALIDATION_ERROR', 'targetUrl must be https', { field: 'targetUrl' })
    if (typeof provider !== 'string' || !NATIVE_PROVIDERS.includes(provider)) return fail(400, 'VALIDATION_ERROR', 'Unknown provider', { field: 'provider' })
    if (typeof eventType !== 'string' || !EVENT_TYPES.includes(eventType)) return fail(400, 'VALIDATION_ERROR', 'Unknown eventType', { field: 'eventType' })
    if (signingSecret !== undefined && (typeof signingSecret !== 'string' || signingSecret.length < 32 || signingSecret.length > 255)) {
      return fail(400, 'VALIDATION_ERROR', 'signingSecret must be 32 to 255 characters', { field: 'signingSecret' })
    }
    const subscription: StoredSubscription = {
      subscriptionId: `sub_${this.nextId++}`,
      formId: String(formId),
      provider,
      targetUrl,
      eventType,
      ...(typeof signingSecret === 'string' ? { signingSecret } : {}),
    }
    this.subscriptions.set(subscription.subscriptionId, subscription)
    const { signingSecret: _secret, ...returned } = subscription
    return { data: returned }
  }

  private deleteSubscription(params: Record<string, unknown>): RpcResult {
    const id = String(params.subscriptionId)
    if (!this.subscriptions.delete(id)) return fail(404, 'NOT_FOUND', 'Subscription not found', { reason: 'SUBSCRIPTION_NOT_FOUND' })
    return { data: { subscriptionId: id, deleted: true } }
  }

  private createRequest(params: Record<string, unknown>): RpcResult {
    const form = this.forms.find((candidate) => candidate.id === params.formId)
    if (!form) return fail(404, 'NOT_FOUND', 'Form not found', { reason: 'FORM_NOT_FOUND', field: 'formId' })
    if (!form.published) return fail(409, 'CONFLICT', 'Form is not published', { reason: 'FORM_NOT_PUBLISHED' })
    const existing = [...this.requests.values()].find((request) => params.idempotencyKey && request.params.idempotencyKey === params.idempotencyKey)
    if (existing) return { data: this.summary(existing) }
    const request: StoredRequest = {
      id: `req_${this.nextId++}`,
      status: 'pending',
      formId: form.id,
      params,
      externalId: typeof params.externalId === 'string' ? params.externalId : null,
      isTest: params.test === true,
      remindersSent: 0,
    }
    this.requests.set(request.id, request)
    return { data: { ...this.summary(request), url: `https://forms.formstep.io/r/${request.id}` } }
  }

  private withRequest(params: Record<string, unknown>, run: (request: StoredRequest) => RpcResult): RpcResult {
    const request = this.requests.get(String(params.requestId))
    if (!request) return fail(404, 'NOT_FOUND', 'Request not found', { reason: 'REQUEST_NOT_FOUND', field: 'requestId' })
    return run(request)
  }

  private listRequests(params: Record<string, unknown>): RpcResult {
    if (params.workspaceId === undefined && params.formId === undefined) {
      return fail(400, 'VALIDATION_ERROR', 'workspaceId or formId is required', { reason: 'SCOPE_REQUIRED' })
    }
    const items = [...this.requests.values()]
      .filter((request) => params.formId === undefined || request.formId === params.formId)
      .filter((request) => params.externalId === undefined || request.externalId === params.externalId)
      .filter((request) => params.includeTest === true || !request.isTest)
      .reverse()
      .map((request) => this.summary(request))
    return { data: { items, hasMore: false, nextCursor: null } }
  }

  private summary(request: StoredRequest) {
    return {
      id: request.id,
      status: request.status,
      formId: request.formId,
      externalId: request.externalId,
      isTest: request.isTest,
      remindersSent: request.remindersSent,
      cancelReason: request.cancelReason ?? null,
    }
  }
}

/** An Activepieces trigger store, in memory. */
export function memoryStore() {
  const values = new Map<string, unknown>()
  return {
    values,
    put: async <T>(key: string, value: T) => {
      values.set(key, value)
      return value
    },
    get: async <T>(key: string) => (values.has(key) ? (values.get(key) as T) : null),
    delete: async (key: string) => {
      values.delete(key)
    },
  }
}

/** The connection value Activepieces hands a step for a secret-text auth. */
export const CONNECTION = { type: AppConnectionType.SECRET_TEXT as const, secret_text: API_TOKEN }
