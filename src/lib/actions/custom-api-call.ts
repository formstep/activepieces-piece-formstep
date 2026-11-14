import { createCustomApiCallAction } from '@activepieces/pieces-common'

import { formstepAuth } from '../auth'
import { tokenOf } from '../catalog'
import { formstepApiUrl } from '../client'

/**
 * Any Formstep API method. The API route is exact-path, so the base is the
 * API origin and the URL defaults to /api/v1; the method goes in the body.
 */
export const customApiCall = createCustomApiCallAction({
  auth: formstepAuth,
  baseUrl: () => new URL(formstepApiUrl()).origin,
  authMapping: async (auth) => ({ Authorization: `Bearer ${tokenOf(auth)}` }),
  description:
    'Calls any method of the Formstep API. Send POST to /api/v1 with a JSON body such as {"method": "requests.list", "params": {"formId": "..."}}.',
  props: {
    url: { description: 'Use /api/v1. Formstep has one endpoint and picks the method from the body.', defaultValue: '/api/v1' },
  },
})
