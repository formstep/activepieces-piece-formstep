import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { buildCreateParams, createRequest } from '../src/lib/actions/create-request'
import { cancelRequest, findRequest, getRequest, sendReminder } from '../src/lib/actions/request-actions'
import { formstepAuth } from '../src/lib/auth'
import { fieldsProperty, formDropdown, readonlyFieldsProperty } from '../src/lib/props'
import { API_TOKEN, CONNECTION, FakeFormstep } from './fake-formstep'

const FIELDS = [
  { key: 'company_name', type: 'text', title: 'Company name' },
  { key: 'employees', type: 'number', title: 'Employees' },
  { key: 'start_date', type: 'date', title: 'Start date' },
  { key: 'newsletter', type: 'switch', title: 'Newsletter' },
  { key: 'plan', type: 'radio', title: 'Plan', options: [{ key: 'pro', label: 'Pro' }, { key: 'free', label: 'Free' }] },
  { key: 'tools', type: 'checkbox', title: 'Tools', options: [{ key: 'zapier', label: 'Zapier' }, { key: 'make', label: 'Make' }] },
  { key: 'contacts', type: 'group', title: 'Contacts', members: [{ key: 'name', type: 'text' }] },
  { key: 'total', type: 'number', title: 'Total', calculated: true },
  { key: 'case_id', type: 'hidden', title: 'case_id', context: true },
]

let formstep: FakeFormstep

beforeAll(async () => {
  formstep = await new FakeFormstep({
    forms: [
      { id: 'form_live', name: 'Vendor onboarding', published: true },
      { id: 'form_draft', name: 'Draft', published: false },
    ],
    fields: { form_live: FIELDS },
  }).start()
  process.env['FORMSTEP_API_URL'] = formstep.apiUrl
})

afterAll(async () => {
  delete process.env['FORMSTEP_API_URL']
  await formstep.stop()
})

beforeEach(() => {
  formstep.requests.clear()
})

const run = (action: { run: (context: never) => Promise<unknown> }, propsValue: Record<string, unknown>) =>
  action.run({ auth: CONNECTION, propsValue } as never)

describe('the connection', () => {
  const validate = formstepAuth.validate!

  it('accepts a token Formstep accepts', async () => {
    expect(await validate({ auth: API_TOKEN, server: {} as never })).toEqual({ valid: true })
  })

  it('refuses a token Formstep refuses, and says what to check', async () => {
    const result = await validate({ auth: 'fs_wrong', server: {} as never })
    expect(result).toEqual({ valid: false, error: expect.stringMatching(/did not accept this token/) })
  })
})

describe('dropdowns', () => {
  it('lists the forms of the workspace, marking the unpublished ones', async () => {
    const options = await formDropdown('', true).options({ auth: CONNECTION }, {} as never)
    expect(options).toEqual({
      disabled: false,
      options: [
        { label: 'Vendor onboarding', value: 'form_live' },
        { label: 'Draft (not published)', value: 'form_draft' },
      ],
    })
  })

  it('asks for a connection before listing forms', async () => {
    expect(await formDropdown('', true).options({}, {} as never)).toMatchObject({ disabled: true, placeholder: expect.stringMatching(/Connect/) })
  })

  it('offers one input per field a request can carry, typed by the field', async () => {
    const props = await fieldsProperty.props({ auth: CONNECTION, formId: 'form_live' }, {} as never)
    expect(Object.keys(props)).toEqual(['company_name', 'employees', 'start_date', 'newsletter', 'plan', 'tools', 'contacts', 'case_id'])
    expect(props['company_name']).toMatchObject({ type: 'SHORT_TEXT', displayName: 'Company name (company_name)' })
    expect(props['plan']).toMatchObject({ type: 'STATIC_DROPDOWN', options: { options: [{ label: 'Pro', value: 'pro' }, { label: 'Free', value: 'free' }] } })
    expect(props['tools']).toMatchObject({ type: 'STATIC_MULTI_SELECT_DROPDOWN' })
    expect(props['contacts']).toMatchObject({ type: 'JSON', description: expect.stringContaining('name') })
    expect(props['case_id']).toMatchObject({ type: 'SHORT_TEXT', displayName: 'case_id · context' })
  })

  it('offers no field inputs until a form is picked', async () => {
    expect(await fieldsProperty.props({ auth: CONNECTION }, {} as never)).toEqual({})
  })

  it('offers only prefillable fields as read-only', async () => {
    const options = await readonlyFieldsProperty.options({ auth: CONNECTION, formId: 'form_live' }, {} as never)
    expect(options.options.map((option) => option.value)).toEqual(['company_name', 'employees', 'start_date', 'newsletter', 'plan', 'tools', 'contacts'])
  })
})

describe('Create Request', () => {
  it('splits Fields into prefill and context and converts each to its shape', async () => {
    const params = await buildCreateParams(API_TOKEN, {
      formId: 'form_live',
      recipientEmail: 'ada@acme.com',
      recipientName: 'Ada',
      fields: {
        company_name: 'Acme',
        employees: '42',
        start_date: '2026-03-04T00:00:00.000Z',
        newsletter: 'true',
        plan: 'pro',
        tools: ['zapier'],
        contacts: [{ name: 'Ada' }],
        case_id: 'CASE-9',
        total: 99,
        empty: '',
      },
      readonly: ['company_name'],
    })
    expect(params).toEqual({
      formId: 'form_live',
      prefill: { company_name: 'Acme', employees: 42, start_date: '2026-03-04', newsletter: true, plan: 'pro', tools: ['zapier'], contacts: [{ name: 'Ada' }] },
      context: { case_id: 'CASE-9' },
      readonly: ['company_name'],
      recipient: { email: 'ada@acme.com', name: 'Ada' },
    })
  })

  it('decodes a repeating group typed as JSON text, and names the field when it is not JSON', async () => {
    const params = await buildCreateParams(API_TOKEN, { formId: 'form_live', fields: { contacts: '[{ "name": "Ada" }]' } })
    expect(params['prefill']).toEqual({ contacts: [{ name: 'Ada' }] })
    await expect(buildCreateParams(API_TOKEN, { formId: 'form_live', fields: { contacts: 'Ada' } })).rejects.toThrow(
      'The value for "contacts" is not valid JSON. A JSON array of rows, each an object with the keys name.'
    )
  })

  it('sends a value under a key the form no longer has, so Formstep can name it', async () => {
    const params = await buildCreateParams(API_TOKEN, { formId: 'form_live', fields: { renamed_field: 'x' } })
    expect(params['prefill']).toEqual({ renamed_field: 'x' })
  })

  it('uses the External ID as the idempotency key', async () => {
    const first = (await run(createRequest, { formId: 'form_live', externalId: 'run-42' })) as { id: string }
    const retried = (await run(createRequest, { formId: 'form_live', externalId: 'run-42' })) as { id: string }
    expect(retried.id).toBe(first.id)
    expect(formstep.callsOf('requests.create').at(-1)?.params).toMatchObject({ externalId: 'run-42', idempotencyKey: 'run-42' })
  })

  it('sends the optional settings', async () => {
    const params = await buildCreateParams(API_TOKEN, {
      formId: 'form_live',
      delivery: 'email',
      language: 'de',
      expiresAt: '2026-12-31T17:00:00Z',
      reminders: '2d, 5d',
      metadata: '{ "runId": "run-42" }',
      callbackUrl: 'https://example.com/callback',
      test: true,
    })
    expect(params).toEqual({
      formId: 'form_live',
      delivery: 'email',
      language: 'de',
      expiresAt: Date.parse('2026-12-31T17:00:00Z'),
      reminders: ['2d', '5d'],
      metadata: { runId: 'run-42' },
      callbackUrl: 'https://example.com/callback',
      test: true,
    })
  })

  it('turns reminders off with none, and leaves them to the form when empty', async () => {
    expect((await buildCreateParams(API_TOKEN, { formId: 'form_live', reminders: 'none' }))['reminders']).toEqual([])
    expect(await buildCreateParams(API_TOKEN, { formId: 'form_live', reminders: '' })).not.toHaveProperty('reminders')
  })

  it('refuses metadata that is not a JSON object, and an expiry that is not a date', async () => {
    await expect(buildCreateParams(API_TOKEN, { formId: 'form_live', metadata: '[1]' })).rejects.toThrow(/must be a JSON object/)
    await expect(buildCreateParams(API_TOKEN, { formId: 'form_live', metadata: '{ runId: 1 }' })).rejects.toThrow(/not valid JSON/)
    await expect(buildCreateParams(API_TOKEN, { formId: 'form_live', expiresAt: 'next week' })).rejects.toThrow(/not a date/)
  })

  it("passes Formstep's refusal through with its code", async () => {
    await expect(run(createRequest, { formId: 'form_draft' })).rejects.toThrow('CONFLICT: Form is not published. Reason: FORM_NOT_PUBLISHED')
  })
})

describe('the request actions', () => {
  async function created(params: Record<string, unknown> = {}) {
    return (await run(createRequest, { formId: 'form_live', ...params })) as { id: string }
  }

  it('Get Request reads the request', async () => {
    const { id } = await created({ externalId: 'run-1' })
    expect(await run(getRequest, { requestId: id })).toMatchObject({ id, status: 'pending', externalId: 'run-1' })
  })

  it('Send Reminder reminds the recipient', async () => {
    const { id } = await created()
    expect(await run(sendReminder, { requestId: ` ${id} ` })).toMatchObject({ id, remindersSent: 1 })
  })

  it('Cancel Request withdraws the request with the reason', async () => {
    const { id } = await created()
    expect(await run(cancelRequest, { requestId: id, reason: 'duplicate' })).toMatchObject({ id, status: 'canceled', cancelReason: 'duplicate' })
    await expect(run(cancelRequest, { requestId: id })).rejects.toThrow('CONFLICT: Request is not pending. Reason: REQUEST_NOT_PENDING')
  })

  it('Get Request names a request Formstep does not know', async () => {
    await expect(run(getRequest, { requestId: 'req_missing' })).rejects.toThrow('NOT_FOUND: Request not found. Reason: REQUEST_NOT_FOUND. Field: requestId')
  })

  it('Find Request searches the workspace by External ID', async () => {
    const request = await created({ externalId: 'ticket-7' })
    await created({ externalId: 'ticket-8' })
    const result = (await run(findRequest, { externalId: 'ticket-7' })) as { found: boolean; requests: Array<{ id: string }> }
    expect(result).toEqual({ found: true, requests: [expect.objectContaining({ id: request.id, externalId: 'ticket-7' })] })
    expect(formstep.callsOf('requests.list').at(-1)?.params).toEqual({ workspaceId: 'ws_1', externalId: 'ticket-7' })
  })

  it('Find Request leaves test requests out unless asked', async () => {
    await created({ externalId: 'ticket-9', test: true })
    expect(await run(findRequest, { externalId: 'ticket-9' })).toEqual({ found: false, requests: [] })
  })

  it('Find Request narrows to a form and includes test requests when asked', async () => {
    await created({ externalId: 'ticket-9', test: true })
    const result = (await run(findRequest, { externalId: 'ticket-9', formId: 'form_live', includeTest: true })) as { requests: unknown[] }
    expect(result.requests).toHaveLength(1)
    expect(formstep.callsOf('requests.list').at(-1)?.params).toEqual({ formId: 'form_live', externalId: 'ticket-9', includeTest: true })
  })

  it('Find Request says when nothing matched', async () => {
    expect(await run(findRequest, { externalId: 'nobody' })).toEqual({ found: false, requests: [] })
  })
})
