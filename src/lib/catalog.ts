import { formstepCall, FORMSTEP_RETRY_HINT } from './client'

/**
 * The API token of a connection. Steps get the connection value,
 * `{ type, secret_text }`; older engines and the `validate` hook hand over
 * the bare string.
 */
export function tokenOf(auth: unknown): string {
  if (typeof auth === 'string' && auth.length > 0) return auth
  if (typeof auth === 'object' && auth !== null && 'secret_text' in auth) {
    const secret = (auth as { secret_text: unknown }).secret_text
    if (typeof secret === 'string' && secret.length > 0) return secret
  }
  throw new Error('This step has no Formstep connection. Pick one under Connection.')
}

export interface ListResponse<T> {
  items: T[]
  hasMore: boolean
  nextCursor?: string | null
}

export interface FormSummary {
  id: string
  name: string
  isPublished: boolean
}

interface WorkspaceSummary {
  id: string
  name: string
}

/** An option of a choice field, or a row or column of a matrix: its stable key and the label a person sees. */
export interface KeyedLabel {
  key: string
  label: string
}

/** One row of `fields.list`: a keyed field of the form's current published version. */
export interface FormField {
  key: string
  type: string
  title?: string
  prefillable?: boolean
  context?: boolean
  calculated?: boolean
  options?: KeyedLabel[]
  rows?: KeyedLabel[]
  columns?: KeyedLabel[]
  members?: FormField[]
}

const PAGE_SIZE = 100

/**
 * Every item of a cursor-paged list method, up to `max`. Formstep answers
 * `hasMore` with a `nextCursor`; a page that claims more without one is a
 * broken page, not the end of the list.
 */
export async function collectPages<T>(token: string, method: string, params: Record<string, unknown>, max = Number.POSITIVE_INFINITY): Promise<T[]> {
  const items: T[] = []
  let cursor: string | undefined
  do {
    const page = await formstepCall<ListResponse<T>>(token, method, {
      ...params,
      limit: Math.min(PAGE_SIZE, max - items.length),
      ...(cursor ? { cursor } : {}),
    })
    items.push(...page.items)
    if (page.hasMore && !page.nextCursor) {
      throw new Error(`Formstep returned an incomplete ${method} page. ${FORMSTEP_RETRY_HINT}`)
    }
    cursor = page.hasMore ? (page.nextCursor ?? undefined) : undefined
  } while (cursor && items.length < max)
  return items.slice(0, max)
}

/** The connected workspace. An API token reaches exactly one, so `workspaces.list` answers with it alone. */
export async function readWorkspace(token: string): Promise<WorkspaceSummary> {
  const workspaces = await formstepCall<ListResponse<WorkspaceSummary>>(token, 'workspaces.list')
  const workspace = workspaces.items[0]
  if (!workspace) throw new Error('This Formstep token reaches no workspace. Create a new token in the workspace you want to use.')
  return workspace
}

/** Every form of the connected workspace, across every `forms.list` page. */
export async function listForms(token: string): Promise<FormSummary[]> {
  const workspace = await readWorkspace(token)
  return collectPages<FormSummary>(token, 'forms.list', { workspaceId: workspace.id })
}

/** The keyed fields of a form's current published version; empty while the form is unpublished. */
export async function listFields(token: string, formId: string): Promise<FormField[]> {
  const fields = await formstepCall<ListResponse<FormField>>(token, 'fields.list', { formId })
  return fields.items
}
