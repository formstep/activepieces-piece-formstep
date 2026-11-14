import { PieceAuth } from '@activepieces/pieces-framework'

import { formstepCall, FormstepApiError } from './client'

export const formstepAuth = PieceAuth.SecretText({
  displayName: 'API Token',
  description:
    'An API token of the Formstep workspace this connection may use, starting with fs_. Create one in Formstep under OAuth and API Keys › Create token, with Expiration set to No expiration. A token reaches one workspace only.',
  required: true,
  validate: async ({ auth }) => {
    try {
      await formstepCall(auth, 'me.get')
      return { valid: true }
    } catch (error) {
      if (error instanceof FormstepApiError && error.status === 401) {
        return { valid: false, error: 'Formstep did not accept this token. Check that it was copied whole and has not expired or been revoked.' }
      }
      return { valid: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
})
