import { createPiece } from '@activepieces/pieces-framework'
import { PieceCategory } from '@activepieces/shared'

import { createRequest } from './lib/actions/create-request'
import { cancelRequest, findRequest, getRequest, sendReminder } from './lib/actions/request-actions'
import { formstepAuth } from './lib/auth'
import { publicLinkSubmissionCreated, requestCanceled, requestCompleted, requestExpired } from './lib/triggers'

export { formstepAuth }

export const formstep = createPiece({
  displayName: 'Formstep',
  description:
    'Request information without the back-and-forth: send a recipient a branded form, and continue the flow when they complete it.',
  auth: formstepAuth,
  // First release built with pieces-framework 0.32 or later; raw webhook bodies reach triggers since well before it.
  minimumSupportedRelease: '0.88.0',
  logoUrl: 'https://formstep.io/android-chrome-512x512.png',
  authors: ['formstep'],
  categories: [PieceCategory.FORMS_AND_SURVEYS],
  actions: [createRequest, getRequest, sendReminder, cancelRequest, findRequest],
  triggers: [requestCompleted, requestExpired, requestCanceled, publicLinkSubmissionCreated],
})
