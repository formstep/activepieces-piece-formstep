import { formstepTrigger } from './formstep-trigger'
import { REQUEST_CANCELED_SAMPLE, REQUEST_COMPLETED_SAMPLE, REQUEST_EXPIRED_SAMPLE, SUBMISSION_CREATED_SAMPLE } from './samples'

export const requestCompleted = formstepTrigger({
  name: 'request_completed',
  eventType: 'request_completed',
  displayName: 'Request Completed',
  description: 'Runs when a recipient completes a request for the selected form, with the answers and the outcome (event type request.completed)',
  sampleData: REQUEST_COMPLETED_SAMPLE,
})

export const requestExpired = formstepTrigger({
  name: 'request_expired',
  eventType: 'request_expired',
  displayName: 'Request Expired',
  description: 'Runs when a request for the selected form reaches its expiry without being completed',
  sampleData: REQUEST_EXPIRED_SAMPLE,
})

export const requestCanceled = formstepTrigger({
  name: 'request_canceled',
  eventType: 'request_canceled',
  displayName: 'Request Canceled',
  description: 'Runs when a request for the selected form is canceled, with the reason when one was given',
  sampleData: REQUEST_CANCELED_SAMPLE,
})

export const publicLinkSubmissionCreated = formstepTrigger({
  name: 'public_link_submission_created',
  eventType: 'submission_created',
  displayName: 'Public Link Submission Created',
  description:
    "Runs when a respondent submits the selected form through its public link (event type submission.completed). A completed request runs 'Request Completed' instead.",
  sampleData: SUBMISSION_CREATED_SAMPLE,
})
