/**
 * The built bundle as the Activepieces engine loads it: require the package
 * main, find the export whose constructor is named Piece, read its metadata.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')

beforeAll(() => {
  execFileSync(process.execPath, [path.join(root, 'scripts/build.mjs')], { cwd: root, stdio: 'pipe' })
}, 60_000)

describe('the published bundle', () => {
  it('has no dependencies to install and points main at the bundle', () => {
    const manifest = JSON.parse(readFileSync(path.join(dist, 'package.json'), 'utf8'))
    expect(manifest).toMatchObject({ name: '@formstep/piece-formstep', main: './src/index.js', dependencies: {} })
    expect(manifest.private).toBeUndefined()
  })

  it('exports a Piece the engine can find, with every action and trigger', () => {
    const module = createRequire(__filename)(path.join(dist, 'src/index.js')) as Record<string, unknown>
    const piece = Object.values(module).find((value) => (value as { constructor?: { name?: string } } | null)?.constructor?.name === 'Piece') as
      | { metadata: () => { displayName: string; actions: Record<string, unknown>; triggers: Record<string, { type: string }>; auth: { type: string } } }
      | undefined
    expect(piece).toBeDefined()
    const metadata = piece!.metadata()
    expect(metadata.displayName).toBe('Formstep')
    expect(metadata.auth.type).toBe('SECRET_TEXT')
    expect(Object.keys(metadata.actions)).toEqual(['create_request', 'get_request', 'send_reminder', 'cancel_request', 'find_request'])
    expect(Object.keys(metadata.triggers)).toEqual(['request_completed', 'request_expired', 'request_canceled', 'public_link_submission_created'])
    expect(Object.values(metadata.triggers).every((trigger) => trigger.type === 'WEBHOOK')).toBe(true)
  })
})
