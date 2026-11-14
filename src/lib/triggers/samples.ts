/**
 * What each trigger shows before its first real event, copied from the
 * documented envelopes (docs/external-api.md § Events and § Callbacks).
 */

const FORM = { id: 'j57d3kq9y8x2m1n0p4r6s5t7v9w8', name: 'Vendor onboarding', snapshotId: 'js7d3kq9y8x2m1n0p4r6s5t7v9w8' }

const SUBMISSION = {
  id: 'jd7d3kq9y8x2m1n0p4r6s5t7v9w8',
  respondentEmail: 'ada@acme.com',
  submittedAt: '2026-03-04T09:31:40.000Z',
  updatedAt: null,
  editCount: 0,
  pdfUrl: null,
  language: 'en',
}

const REQUEST = {
  id: 'kd7d3kq9y8x2m1n0p4r6s5t7v9w8',
  externalId: 'run-42',
  language: 'en',
  recipient: { email: 'ada@acme.com', name: 'Ada' },
  metadata: { runId: 'run-42' },
  context: { case_id: 'CASE-9' },
  createdAt: '2026-03-04T09:20:00.000Z',
}

export const SUBMISSION_CREATED_SAMPLE = {
  id: 'evt_kj7d3kq9y8x2m1n0p4r6s5t7v9w8',
  type: 'submission.completed',
  createdAt: '2026-03-04T09:31:40.000Z',
  apiVersion: '2026-09-24',
  test: false,
  data: {
    form: FORM,
    submission: SUBMISSION,
    answers: {
      company_name: 'Acme',
      plan: 'pro',
      satisfaction: { delivery_speed: 'very_good', support: 'poor' },
      total: 40,
      contacts: [{ name: 'Ada' }, { name: 'Grace' }],
    },
    display: {
      company_name: 'Acme',
      plan: 'Pro',
      satisfaction: 'Delivery speed: Very good; Support: Poor',
      total: '40',
      contacts: 'Ada, Grace',
    },
  },
}

export const REQUEST_COMPLETED_SAMPLE = {
  id: 'evt_kj7d3kq9y8x2m1n0p4r6s5t7v9w8',
  type: 'request.completed',
  createdAt: '2026-03-04T09:31:40.000Z',
  apiVersion: '2026-09-24',
  test: false,
  data: {
    request: { ...REQUEST, status: 'completed', outcome: 'approve', completedAt: '2026-03-04T09:31:40.000Z' },
    form: FORM,
    submission: SUBMISSION,
    answers: { case_id: 'CASE-9', company_name: 'Acme', contacts: [{ name: 'Ada' }] },
    display: { case_id: 'CASE-9', company_name: 'Acme', contacts: 'Ada' },
  },
}

export const REQUEST_EXPIRED_SAMPLE = {
  id: 'evt_kn9d3kq9y8x2m1n0p4r6s5t7v9w8',
  type: 'request.expired',
  createdAt: '2026-03-11T09:00:00.000Z',
  apiVersion: '2026-09-24',
  test: false,
  data: {
    request: { ...REQUEST, status: 'expired', expiredAt: '2026-03-11T09:00:00.000Z' },
  },
}

export const REQUEST_CANCELED_SAMPLE = {
  id: 'evt_kp2d3kq9y8x2m1n0p4r6s5t7v9w8',
  type: 'request.canceled',
  createdAt: '2026-03-05T14:10:00.000Z',
  apiVersion: '2026-09-24',
  test: false,
  data: {
    request: { ...REQUEST, status: 'canceled', canceledAt: '2026-03-05T14:10:00.000Z', cancelReason: 'Deal closed without the documents' },
  },
}
