import { createTrigger, Property, TriggerStrategy } from '@activepieces/pieces-framework'

import { formstepAuth } from '../auth'
import { tokenOf } from '../catalog'
import { formstepCall, FormstepApiError } from '../client'
import { formDropdown } from '../props'
import { createWebhookSecret, headerValue, SIGNATURE_HEADER, verifyWebhookSignature } from '../signature'

/** The provider name Formstep files these subscriptions under (NATIVE_WEBHOOK_PROVIDERS). */
export const FORMSTEP_PROVIDER = 'activepieces'

export type FormstepEventType = 'submission_created' | 'request_completed' | 'request_expired' | 'request_canceled'

/** What `onEnable` keeps for `onDisable` and `run`. */
export interface StoredSubscription {
  subscriptionId: string
  webhookSecret: string
}

/** One store key per trigger, so two Formstep triggers of one flow never read each other's secret. */
export function storeKey(eventType: FormstepEventType): string {
  return `formstep_subscription_${eventType}`
}

interface FormstepTriggerOptions {
  name: string
  eventType: FormstepEventType
  displayName: string
  description: string
  sampleData: unknown
}

/**
 * Formstep delivers events to public HTTPS addresses only. A self-hosted
 * Activepieces without one hands out http:// URLs, which Formstep refuses with
 * a bare VALIDATION_ERROR; say which setting builds the URL instead.
 */
function assertHttpsWebhookUrl(webhookUrl: string): void {
  if (webhookUrl.startsWith('https://')) return
  throw new Error(
    `Formstep sends events to HTTPS addresses only, and this flow's webhook URL is ${webhookUrl}. Set AP_FRONTEND_URL to the public HTTPS address of your Activepieces and try again.`
  )
}

function readStored(value: unknown): StoredSubscription | null {
  if (typeof value !== 'object' || value === null) return null
  const { subscriptionId, webhookSecret } = value as Partial<StoredSubscription>
  if (typeof subscriptionId !== 'string' || typeof webhookSecret !== 'string') return null
  return { subscriptionId, webhookSecret }
}

/** Remove a subscription at Formstep; one already gone is the outcome we wanted. */
async function deleteSubscription(token: string, subscriptionId: string): Promise<void> {
  try {
    await formstepCall(token, 'webhooks.delete', { subscriptionId })
  } catch (error) {
    if (!(error instanceof FormstepApiError) || error.status !== 404) throw error
  }
}

/**
 * A Formstep instant trigger. Publishing the flow subscribes its webhook URL
 * with `webhooks.create` and a fresh signing secret; turning it off removes
 * the subscription. Each delivery runs the flow only once its signature
 * checks out, and hands the Formstep event envelope over untouched.
 */
export function formstepTrigger(options: FormstepTriggerOptions) {
  const { eventType } = options
  return createTrigger({
    auth: formstepAuth,
    name: options.name,
    displayName: options.displayName,
    description: options.description,
    type: TriggerStrategy.WEBHOOK,
    props: {
      formId: formDropdown('The form whose events start this flow', true),
      info: Property.MarkDown({
        value:
          'Formstep subscribes this flow to the form when you publish it, and removes the subscription when you turn the flow off. Every delivery is signed and checked before the flow runs.',
      }),
    },
    sampleData: options.sampleData,

    async onEnable(context) {
      const formId = context.propsValue.formId
      if (typeof formId !== 'string' || formId.length === 0) throw new Error('Pick a form under Form.')
      assertHttpsWebhookUrl(context.webhookUrl)
      const token = tokenOf(context.auth)

      // A republish disables the old version with errors ignored, so a subscription can outlive it.
      // Remove it first, or it would keep delivering to this URL under a secret nobody holds.
      const previous = readStored(await context.store.get(storeKey(eventType)))
      if (previous) await deleteSubscription(token, previous.subscriptionId)

      const webhookSecret = createWebhookSecret()
      const created = await formstepCall<{ subscriptionId: string }>(token, 'webhooks.create', {
        formId,
        targetUrl: context.webhookUrl,
        provider: FORMSTEP_PROVIDER,
        eventType,
        signingSecret: webhookSecret,
      })
      await context.store.put<StoredSubscription>(storeKey(eventType), { subscriptionId: created.subscriptionId, webhookSecret })
    },

    async onDisable(context) {
      const stored = readStored(await context.store.get(storeKey(eventType)))
      if (stored) await deleteSubscription(tokenOf(context.auth), stored.subscriptionId)
      await context.store.delete(storeKey(eventType))
    },

    async run(context) {
      const stored = readStored(await context.store.get(storeKey(eventType)))
      if (!stored) {
        throw new Error('This trigger holds no Formstep signing secret, so the delivery cannot be checked. Turn the flow off and on again.')
      }
      const { rawBody, headers, body } = context.payload
      if (typeof rawBody !== 'string') {
        throw new Error(
          'Activepieces did not pass the raw body of this delivery, so its Formstep signature cannot be checked. Update Activepieces; the delivery was not used.'
        )
      }
      const verified = verifyWebhookSignature({
        secret: stored.webhookSecret,
        signatureHeader: headerValue(headers, SIGNATURE_HEADER),
        rawBody,
      })
      // A delivery that is not Formstep's, or is older than five minutes, starts nothing.
      if (!verified) return []
      return [body]
    },
  })
}
