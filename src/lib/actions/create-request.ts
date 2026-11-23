import { createAction, Property } from '@activepieces/pieces-framework'

import { formstepAuth } from '../auth'
import { listFields, tokenOf } from '../catalog'
import { formstepCall } from '../client'
import { splitFieldValues } from '../fields'
import { fieldsProperty, formDropdown, readonlyFieldsProperty } from '../props'

/** Everything Create Request reads, as Activepieces hands it over. */
export interface CreateRequestInput {
  formId: unknown
  recipientEmail?: unknown
  fields?: unknown
  readonly?: unknown
  delivery?: unknown
  recipientName?: unknown
  language?: unknown
  expiresAt?: unknown
  externalId?: unknown
  reminders?: unknown
  metadata?: unknown
  callbackUrl?: unknown
  test?: unknown
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readExpiresAt(value: unknown): number | undefined {
  const raw = text(value)
  if (raw === undefined) return undefined
  const timestamp = Date.parse(raw)
  if (Number.isNaN(timestamp)) throw new Error(`'Expires At' value ${raw} is not a date. Use a date and time such as 2026-12-31T17:00:00Z.`)
  return timestamp
}

/**
 * `"2d, 5d"` → `["2d", "5d"]`; `none` turns reminders off; empty inherits the
 * form's schedule.
 */
function readReminders(value: unknown): string[] | undefined {
  const raw = text(value)
  if (raw === undefined) return undefined
  if (raw.toLowerCase() === 'none') return []
  return raw
    .split(',')
    .map((offset) => offset.trim())
    .filter((offset) => offset.length > 0)
}

function readMetadata(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null || value === '') return undefined
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error("'Metadata' is not valid JSON. Put double quotes around every key and text value, and leave no trailing commas.")
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('\'Metadata\' must be a JSON object. Write it as { "key": "value" }, or empty it to send nothing.')
  }
  return Object.keys(parsed).length > 0 ? (parsed as Record<string, unknown>) : undefined
}

function readKeyList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((key): key is string => typeof key === 'string' && key.length > 0)
}

/** The `requests.create` params Create Request's inputs describe. */
export async function buildCreateParams(token: string, input: CreateRequestInput): Promise<Record<string, unknown>> {
  const formId = text(input.formId)
  if (!formId) throw new Error('Pick a form under Form.')

  const values = typeof input.fields === 'object' && input.fields !== null ? (input.fields as Record<string, unknown>) : {}
  const { prefill, context } = Object.keys(values).length > 0 ? splitFieldValues(await listFields(token, formId), values) : { prefill: {}, context: {} }
  const readonly = readKeyList(input.readonly)

  const recipientEmail = text(input.recipientEmail)
  const recipientName = text(input.recipientName)
  const recipient = {
    ...(recipientEmail ? { email: recipientEmail } : {}),
    ...(recipientName ? { name: recipientName } : {}),
  }
  const delivery = text(input.delivery)
  const language = text(input.language)
  const externalId = text(input.externalId)
  const callbackUrl = text(input.callbackUrl)
  const expiresAt = readExpiresAt(input.expiresAt)
  const reminders = readReminders(input.reminders)
  const metadata = readMetadata(input.metadata)

  return {
    formId,
    ...(Object.keys(prefill).length > 0 ? { prefill } : {}),
    ...(Object.keys(context).length > 0 ? { context } : {}),
    ...(readonly.length > 0 ? { readonly } : {}),
    ...(Object.keys(recipient).length > 0 ? { recipient } : {}),
    ...(language ? { language } : {}),
    ...(delivery ? { delivery } : {}),
    ...(reminders !== undefined ? { reminders } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    // A retried run with the same External ID reuses the request instead of creating a second one.
    ...(externalId ? { externalId, idempotencyKey: externalId } : {}),
    ...(metadata ? { metadata } : {}),
    ...(callbackUrl ? { callbackUrl } : {}),
    ...(input.test === true ? { test: true } : {}),
  }
}

export const createRequest = createAction({
  auth: formstepAuth,
  name: 'create_request',
  displayName: 'Create Request',
  description: 'Create a request that asks one recipient to complete a published form',
  props: {
    formId: formDropdown("The form of the connection's workspace. A request needs a published one.", true),
    recipientEmail: Property.ShortText({
      displayName: 'Recipient Email',
      description: 'Who the request is for. Needed to send the invitation email and reminders.',
      required: false,
    }),
    fields: fieldsProperty,
    readonly: readonlyFieldsProperty,
    delivery: Property.StaticDropdown({
      displayName: 'Delivery',
      description: "How the recipient gets the link. Leave empty for the form's default.",
      required: false,
      options: {
        options: [
          { label: 'Email the Invitation', value: 'email' },
          { label: 'None (you deliver the returned link yourself)', value: 'none' },
        ],
      },
    }),
    recipientName: Property.ShortText({ displayName: 'Recipient Name', required: false }),
    language: Property.ShortText({
      displayName: 'Language',
      description: 'Language the form opens in and the invitation is written in, such as en; must be published for the form',
      required: false,
    }),
    expiresAt: Property.DateTime({
      displayName: 'Expires At',
      description: 'When the link stops working. Defaults to 30 days, at most 365.',
      required: false,
    }),
    externalId: Property.ShortText({
      displayName: 'External ID',
      description:
        'Your ID for this request, such as the run or ticket it belongs to. Also used as the idempotency key, so a retried run reuses the request instead of creating a second one.',
      required: false,
    }),
    reminders: Property.ShortText({
      displayName: 'Reminders',
      description:
        "Idle offsets after which to remind the recipient, comma-separated, at most five, such as 2d, 5d. Write none to send no reminders; leave empty for the form's schedule when Formstep emails the invitation, or no reminders otherwise.",
      required: false,
    }),
    metadata: Property.Json({
      displayName: 'Metadata',
      description: 'JSON object for your own bookkeeping. Never shown to the recipient, echoed in every event.',
      required: false,
    }),
    callbackUrl: Property.ShortText({
      displayName: 'Callback URL',
      description: 'An HTTPS URL of your own that receives the signed request callback when the request completes, expires or is canceled.',
      required: false,
    }),
    test: Property.Checkbox({
      displayName: 'Test Mode',
      description: 'Whether to create a test request: nothing is emailed, the callback carries test: true, and nothing counts against the quota',
      required: false,
      defaultValue: false,
    }),
  },
  async run(context) {
    const token = tokenOf(context.auth)
    return formstepCall(token, 'requests.create', await buildCreateParams(token, context.propsValue))
  },
})
