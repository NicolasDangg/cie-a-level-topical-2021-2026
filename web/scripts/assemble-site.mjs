// Assemble the deployable site in web/site/: the built app is already in
// site/app (vite build); this hard-links every published repo file next to it
// at its current path, so classic pages, PNG crops and content/ JSON keep
// their URLs. Hard links cost no disk and almost no time; if the filesystem
// refuses (e.g. across devices) it falls back to copying.
import { copyFileSync, linkSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const site = fileURLToPath(new URL('../site', import.meta.url))
// Never published: VCS, build tooling, local state.
const SKIP = new Set(['.git', '.gitignore', '.vercel', '.DS_Store', 'web', 'node_modules', '__pycache__'])

if (!statSync(path.join(site, 'app', 'index.html'), { throwIfNoEntry: false })) {
  throw new Error('site/app/index.html missing: run `vite build` first')
}
for (const entry of readdirSync(site)) {
  if (entry !== 'app') rmSync(path.join(site, entry), { recursive: true, force: true })
}

let linked = 0
let copied = 0
let bytes = 0
const started = performance.now()

function walk(rel) {
  for (const entry of readdirSync(path.join(repo, rel), { withFileTypes: true })) {
    // Secrets never ship, even when building from a machine that has a .env.
    if (SKIP.has(entry.name) || entry.name === '.env' || entry.name.startsWith('.env.')) continue
    const relPath = path.join(rel, entry.name)
    if (rel === '' && entry.name === 'app') throw new Error('repo has an app/ folder; it would collide with the built app')
    if (entry.isDirectory()) {
      mkdirSync(path.join(site, relPath), { recursive: true })
      walk(relPath)
    } else if (entry.isFile()) {
      const from = path.join(repo, relPath)
      const to = path.join(site, relPath)
      bytes += statSync(from).size
      try {
        linkSync(from, to)
        linked++
      } catch (err) {
        if (!['EXDEV', 'EPERM', 'ENOTSUP'].includes(err.code)) throw err
        copyFileSync(from, to)
        copied++
      }
    }
  }
}

walk('')
const ms = Math.round(performance.now() - started)
console.log(`assembled site/: ${linked} linked, ${copied} copied, ${(bytes / 2 ** 20).toFixed(0)} MB in ${ms} ms`)
