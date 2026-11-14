/**
 * Builds the piece the way Activepieces publishes its own: one self-contained
 * CommonJS bundle at dist/src/index.js with the framework inlined, and a
 * dist/package.json with no dependencies. Publish from dist/.
 *
 * keepNames matters: the engine finds the piece among the module's exports by
 * `constructor.name === 'Piece'`, which minified class names would break.
 */
import { build } from 'esbuild'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

await rm(dist, { recursive: true, force: true })
await mkdir(path.join(dist, 'src'), { recursive: true })

await build({
  entryPoints: [path.join(root, 'src/index.ts')],
  outfile: path.join(dist, 'src/index.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  keepNames: true,
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
})

const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const published = {
  name: manifest.name,
  version: manifest.version,
  description: manifest.description,
  keywords: manifest.keywords,
  license: manifest.license,
  homepage: manifest.homepage,
  author: manifest.author,
  repository: manifest.repository,
  main: './src/index.js',
  dependencies: {},
  files: ['src/index.js', 'package.json'],
}
await writeFile(path.join(dist, 'package.json'), `${JSON.stringify(published, null, 2)}\n`)
await copyFile(path.join(root, 'README.md'), path.join(dist, 'README.md'))
await copyFile(path.join(root, 'LICENSE.md'), path.join(dist, 'LICENSE.md'))
console.info(`Built ${published.name}@${published.version} into dist/`)
