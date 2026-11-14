/** Formstep's external API: one endpoint, the method name in the body. */
export const DEFAULT_FORMSTEP_API_URL = 'https://api.formstep.io/api/v1'

/** What to do next when Formstep answers with something no step setting can change. */
export const FORMSTEP_RETRY_HINT = 'Run the step again. If this keeps happening, write to support@formstep.io with the time of this run.'

/**
 * The endpoint every call goes to. `FORMSTEP_API_URL` points a self-hosted
 * Activepieces, or the tests, at another Formstep deployment.
 */
export function formstepApiUrl(): string {
  const override = process.env['FORMSTEP_API_URL']
  return (override && override.length > 0 ? override : DEFAULT_FORMSTEP_API_URL).replace(/\/+$/, '')
}

/** The API's error body; `details` names the specific cause behind a reused code. */
interface FormstepErrorBody {
  code: string
  message: string
  details?: { reason?: string; field?: string; validKeys?: string[] }
}

/**
 * A call Formstep refused. The message starts with `CODE:` so a flow branching
 * on the error can match the code, and adds the specific cause underneath.
 */
export class FormstepApiError extends Error {
  readonly code: string
  readonly status: number
  readonly reason?: string

  constructor(status: number, body: FormstepErrorBody) {
    const { code, message, details } = body
    const causes = [
      details?.reason === undefined ? undefined : `Reason: ${details.reason}`,
      details?.field === undefined ? undefined : `Field: ${details.field}`,
      details?.validKeys === undefined || details.validKeys.length === 0 ? undefined : `Valid keys: ${details.validKeys.join(', ')}`,
    ].filter((cause) => cause !== undefined)
    super(causes.length > 0 ? `${code}: ${message}. ${causes.join('. ')}` : `${code}: ${message}`)
    this.name = 'FormstepApiError'
    this.code = code
    this.status = status
    this.reason = details?.reason
  }
}

function isErrorBody(value: unknown): value is FormstepErrorBody {
  if (typeof value !== 'object' || value === null) return false
  const { code, message } = value as { code?: unknown; message?: unknown }
  return typeof code === 'string' && typeof message === 'string'
}

/** Mirrors ERROR_CODE_TO_STATUS on the Formstep API, for a 200 that carries an error envelope. */
const ERROR_CODE_TO_HTTP: Record<string, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  UPGRADE_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
}

function invalidResponse(status: number): Error {
  return new Error(`Formstep answered with an unreadable response (HTTP ${status}). ${FORMSTEP_RETRY_HINT}`)
}

/**
 * Call one Formstep method with an API token and return its `data`.
 *
 * Formstep answers an error with a non-2xx status and an `{ ok: false, error }`
 * body; that body becomes a FormstepApiError so the code and message reach the
 * flow. A 200 that carries the error envelope is unwrapped the same way.
 */
export async function formstepCall<T = unknown>(token: string, method: string, params: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(formstepApiUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ method, params }),
  })

  const text = await response.text()
  let body: unknown
  try {
    body = text.length > 0 ? JSON.parse(text) : undefined
  } catch {
    throw invalidResponse(response.status)
  }
  if (typeof body !== 'object' || body === null) throw invalidResponse(response.status)

  const envelope = body as { ok?: unknown; data?: unknown; error?: unknown }
  if (envelope.ok === false || !response.ok) {
    if (!isErrorBody(envelope.error)) throw invalidResponse(response.status)
    const status = response.ok ? (ERROR_CODE_TO_HTTP[envelope.error.code] ?? 500) : response.status
    throw new FormstepApiError(status, envelope.error)
  }
  if (envelope.ok !== true || !('data' in envelope)) throw invalidResponse(response.status)
  return envelope.data as T
}
