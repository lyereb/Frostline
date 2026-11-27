import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, relative, posix } from 'node:path'

const root = join(process.cwd(), 'dist')
const files = []

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await walk(path)
    else if (entry.name !== 'sw.js') files.push('/' + posix.normalize(relative(root, path).split('\\').join('/')))
  }
}

await walk(root)
const swPath = join(root, 'sw.js')
const source = await readFile(swPath, 'utf8')
files.sort()
// Hashed bundle names change with every code change, so the list itself versions the cache:
// a new deploy gets a new cache name and `activate` deletes the previous build's entries.
const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 10)
const output = source
  .replace("const CACHE_NAME = 'frostline-zero-v1'", `const CACHE_NAME = 'frostline-zero-${version}'`)
  .replace('const PRECACHE = []', `const PRECACHE = ${JSON.stringify(files, null, 2)}`)
await writeFile(swPath, output)
console.log(`[pwa] precached ${files.length} build files (cache ${version})`)
