import { createAction, Property } from '@activepieces/pieces-framework'

import { formstepAuth } from '../auth'
import { readWorkspace, tokenOf } from '../catalog'
import { formstepCall } from '../client'
import { formDropdown, requestIdProperty } from '../props'

function requestIdOf(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error('Enter the request ID under Request ID.')
  return value.trim()
}

export const getRequest = createAction({
  auth: formstepAuth,
  name: 'get_request',
  displayName: 'Get Request',
  description: 'Read a request, with its answers once it is completed',
  props: { requestId: requestIdProperty },
  async run(context) {
    return formstepCall(tokenOf(context.auth), 'requests.get', { requestId: requestIdOf(context.propsValue.requestId) })
  },
})

export const sendReminder = createAction({
  auth: formstepAuth,
  name: 'send_reminder',
  displayName: 'Send Reminder',
  description: 'Email the recipient of a request a reminder now, outside the reminder schedule',
  props: { requestId: requestIdProperty },
  async run(context) {
    return formstepCall(tokenOf(context.auth), 'requests.remind', { requestId: requestIdOf(context.propsValue.requestId) })
  },
})

export const cancelRequest = createAction({
  auth: formstepAuth,
  name: 'cancel_request',
  displayName: 'Cancel Request',
  description: 'Withdraw a pending request so its link stops working',
  props: {
    requestId: requestIdProperty,
    reason: Property.ShortText({
      displayName: 'Reason',
      description: 'Why the request is withdrawn; echoed in the request.canceled event',
      required: false,
    }),
  },
  async run(context) {
    const reason = context.propsValue.reason?.trim()
    return formstepCall(tokenOf(context.auth), 'requests.cancel', {
      requestId: requestIdOf(context.propsValue.requestId),
      ...(reason ? { reason } : {}),
    })
  },
})

/**
 * `requests.list` needs a form or a workspace scope. With no form picked the
 * search covers the connection's whole workspace, which is what an external
 * id is scoped to. Newest first; an empty list means none was found.
 */
export const findRequest = createAction({
  auth: formstepAuth,
  name: 'find_request',
  displayName: 'Find Request',
  description: 'Find requests by the External ID a Create Request step gave them, newest first',
  props: {
    externalId: Property.ShortText({
      displayName: 'External ID',
      description: 'The External ID set when the request was created',
      required: true,
    }),
    formId: formDropdown('Optional. Narrows the search to one form; otherwise the whole workspace is searched.', false),
    includeTest: Property.Checkbox({
      displayName: 'Include Test Requests',
      description: 'Requests created with Test Mode on are left out unless this is on',
      required: false,
      defaultValue: false,
    }),
  },
  async run(context) {
    const token = tokenOf(context.auth)
    const externalId = context.propsValue.externalId?.trim()
    if (!externalId) throw new Error('Enter the External ID to look for.')
    const formId = context.propsValue.formId
    const scope = typeof formId === 'string' && formId.length > 0 ? { formId } : { workspaceId: (await readWorkspace(token)).id }
    const page = await formstepCall<{ items: unknown[] }>(token, 'requests.list', {
      ...scope,
      externalId,
      ...(context.propsValue.includeTest === true ? { includeTest: true } : {}),
    })
    return { found: page.items.length > 0, requests: page.items }
  },
})
