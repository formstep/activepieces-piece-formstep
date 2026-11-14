import { Property } from '@activepieces/pieces-framework'

import { formstepAuth } from './auth'
import { listFields, listForms, tokenOf, type FormSummary } from './catalog'
import { fieldLabel, fieldProperty, isPrefillable, mappableFields } from './fields'

const CONNECT_FIRST = { disabled: true, placeholder: 'Connect your Formstep account first', options: [] }
const PICK_FORM_FIRST = { disabled: true, placeholder: 'Pick a form first', options: [] }

/**
 * A form as a picker lists it. An unpublished form is still offered, since a
 * trigger can be set up before the form goes live, but it says so: a request
 * needs a published form.
 */
function formOption(form: FormSummary) {
  return { label: form.isPublished ? form.name : `${form.name} (not published)`, value: form.id }
}

function hasAuth(auth: unknown): boolean {
  return auth !== undefined && auth !== null && auth !== ''
}

function pickedFormId(formId: unknown): string | undefined {
  return typeof formId === 'string' && formId.length > 0 ? formId : undefined
}

/** The Form dropdown of every trigger and of Create Request, from `forms.list`. */
export function formDropdown(description: string, required: boolean) {
  return Property.Dropdown({
    auth: formstepAuth,
    displayName: 'Form',
    description,
    required,
    refreshers: [],
    options: async ({ auth }) => {
      if (!hasAuth(auth)) return CONNECT_FIRST
      const forms = await listForms(tokenOf(auth))
      if (forms.length === 0) return { disabled: true, placeholder: 'This workspace has no forms yet', options: [] }
      return { disabled: false, options: forms.map(formOption) }
    },
  })
}

/**
 * The Fields group of Create Request: one input per field of the picked form
 * that a request can carry a value for, from `fields.list`.
 */
export const fieldsProperty = Property.DynamicProperties({
  auth: formstepAuth,
  displayName: 'Fields',
  description:
    'Initial answers the recipient sees, and context values they never see, keyed by field key. Empty inputs are left out.',
  required: false,
  refreshers: ['formId'],
  props: async ({ auth, formId }) => {
    const id = pickedFormId(formId)
    if (!hasAuth(auth) || !id) return {}
    const fields = await listFields(tokenOf(auth), id)
    return Object.fromEntries(mappableFields(fields).map((field) => [field.key, fieldProperty(field)]))
  },
})

/** Read-Only Fields of Create Request: prefillable fields of the picked form, from `fields.list`. */
export const readonlyFieldsProperty = Property.MultiSelectDropdown({
  auth: formstepAuth,
  displayName: 'Read-Only Fields',
  description: 'Prefilled fields the recipient may see but not change. Each one needs a value under Fields.',
  required: false,
  refreshers: ['formId'],
  options: async ({ auth, formId }) => {
    const id = pickedFormId(formId)
    if (!hasAuth(auth)) return CONNECT_FIRST
    if (!id) return PICK_FORM_FIRST
    const fields = await listFields(tokenOf(auth), id)
    const prefillable = fields.filter(isPrefillable)
    if (prefillable.length === 0) return { disabled: true, placeholder: 'This form has no field to prefill. Publish it first.', options: [] }
    return { disabled: false, options: prefillable.map((field) => ({ label: fieldLabel(field), value: field.key })) }
  },
})

export const requestIdProperty = Property.ShortText({
  displayName: 'Request ID',
  description: 'The ID Formstep returned when the request was created',
  required: true,
})
