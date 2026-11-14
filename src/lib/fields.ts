import { Property } from '@activepieces/pieces-framework'

import type { FormField } from './catalog'

/** Fields `requests.create` accepts in `prefill`: visible questions, never a context field or a calculated one. */
export function isPrefillable(field: FormField): boolean {
  if (field.context === true) return false
  if (field.calculated === true) return false
  return field.prefillable !== false
}

/** The fields a request can carry a value for: every prefillable question and every context field. */
export function mappableFields(fields: FormField[]): FormField[] {
  return fields.filter((field) => field.context === true || isPrefillable(field))
}

/**
 * How a field reads in a picker: its question and, since flows address it by
 * key, the key. A hidden field is titled with its key, so it reads once.
 */
export function fieldLabel(field: FormField): string {
  return field.title && field.title !== field.key ? `${field.title} (${field.key})` : field.key
}

const SINGLE_CHOICE_TYPES: ReadonlySet<string> = new Set(['radio', 'select'])
const MULTI_CHOICE_TYPES: ReadonlySet<string> = new Set(['checkbox', 'ranking', 'picture-choice'])
const NUMBER_TYPES: ReadonlySet<string> = new Set(['number', 'rating', 'scale'])
const JSON_TYPES: ReadonlySet<string> = new Set(['matrix', 'group'])

/** What to type into a JSON input, for the shapes a label alone does not explain. */
function jsonHint(field: FormField): string {
  if (field.type === 'matrix') {
    const rows = field.rows?.map((row) => row.key).join(', ')
    const columns = field.columns?.map((column) => column.key).join(', ')
    return `A JSON object of row key to column key${rows ? `. Rows: ${rows}` : ''}${columns ? `. Columns: ${columns}` : ''}.`
  }
  const members = field.members?.map((member) => member.key).join(', ')
  return `A JSON array of rows, each an object${members ? ` with the keys ${members}` : ''}.`
}

/**
 * One input of the Fields group of Create Request, keyed by field key.
 * Activepieces offers text, choices and JSON inside a dynamic group, so a
 * number or a yes/no is typed as text and converted by `toPrefillValue`.
 * Nothing is required: a request prefills whatever the flow has.
 */
export function fieldProperty(field: FormField) {
  const displayName = fieldLabel(field)
  if (field.context === true) {
    return Property.ShortText({
      displayName: `${displayName} · context`,
      description: 'A context value: the recipient never sees or edits it, and it comes back in every event.',
      required: false,
    })
  }
  if (SINGLE_CHOICE_TYPES.has(field.type) && field.options) {
    return Property.StaticDropdown({
      displayName,
      required: false,
      options: { options: field.options.map((option) => ({ label: option.label, value: option.key })) },
    })
  }
  if (MULTI_CHOICE_TYPES.has(field.type) && field.options) {
    return Property.StaticMultiSelectDropdown({
      displayName,
      required: false,
      options: { options: field.options.map((option) => ({ label: option.label, value: option.key })) },
    })
  }
  if (field.type === 'switch') {
    return Property.StaticDropdown({
      displayName,
      required: false,
      options: {
        options: [
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ],
      },
    })
  }
  if (JSON_TYPES.has(field.type)) {
    return Property.Json({ displayName, description: jsonHint(field), required: false })
  }
  if (NUMBER_TYPES.has(field.type)) {
    return Property.ShortText({ displayName, description: 'A number.', required: false })
  }
  if (field.type === 'date') {
    return Property.ShortText({ displayName, description: 'A date, such as 2026-03-04. A full timestamp is cut to its date.', required: false })
  }
  return Property.ShortText({ displayName, required: false })
}

function isBlank(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  return Array.isArray(value) && value.length === 0
}

const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/
const NUMERIC = /^-?\d+(\.\d+)?$/

/**
 * A field's prefill value in the shape Formstep takes it
 * (docs/external-api.md § Prefill value shapes). A value that does not fit
 * is sent as given, so Formstep names it in its own INVALID_PREFILL_VALUE.
 */
function toPrefillValue(field: FormField, value: unknown): unknown {
  if (JSON_TYPES.has(field.type) && typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      throw new Error(`The value for "${field.key}" is not valid JSON. ${jsonHint(field)}`)
    }
  }
  if (NUMBER_TYPES.has(field.type) && typeof value === 'string' && NUMERIC.test(value.trim())) return Number(value.trim())
  if (field.type === 'date') {
    if (value instanceof Date) return value.toISOString().slice(0, 10)
    if (typeof value === 'string' && ISO_DATE_PREFIX.test(value)) return value.slice(0, 10)
  }
  if (field.type === 'switch' && typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return value
}

/** The values of one request's fields, split the way `requests.create` takes them. */
export interface FieldValues {
  prefill: Record<string, unknown>
  context: Record<string, unknown>
}

/**
 * Splits the Fields group into `prefill` and `context` by the form's live
 * field list, skipping blanks. A value under a key the form no longer has is
 * sent as prefill anyway, so Formstep names it in its error.
 */
export function splitFieldValues(fields: FormField[], values: Record<string, unknown>): FieldValues {
  const byKey = new Map(fields.map((field) => [field.key, field]))
  const prefill: Record<string, unknown> = {}
  const context: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (isBlank(value)) continue
    const field = byKey.get(key)
    if (!field) {
      prefill[key] = value
      continue
    }
    if (field.context === true) context[key] = value
    else if (isPrefillable(field)) prefill[key] = toPrefillValue(field, value)
  }
  return { prefill, context }
}
