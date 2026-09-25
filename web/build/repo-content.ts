// Serves the repo's existing content (content/ JSON and the subject folders'
// PNG crops) at their real site URLs during `vite dev` and `vite preview`, so
// the app can fetch /content/... and /9618/... without importing or copying
// anything. In production the same URLs are real files: scripts/assemble-site.mjs
// hard-links the repo into the deploy directory next to the built app.
import { createReadStream, statSync } from 'node:fs'
import path from 'node:path'
import type { Connect, Plugin } from 'vite'

const TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
}

export function repoContent(repoRoot: string, prefixes: string[]): Plugin {
  const root = path.resolve(repoRoot)
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    let url: string
    try {
      url = decodeURIComponent((req.url ?? '').split('?')[0])
    } catch {
      return next()
    }
    if (!prefixes.some((p) => url.startsWith(p))) return next()
    const type = TYPES[path.extname(url).toLowerCase()]
    const file = path.join(root, url)
    if (!type || !file.startsWith(root + path.sep)) return next()
    let size: number
    try {
      const stat = statSync(file)
      if (!stat.isFile()) return next()
      size = stat.size
    } catch {
      return next()
    }
    res.setHeader('Content-Type', type)
    res.setHeader('Content-Length', size)
    res.setHeader('Cache-Control', 'no-cache')
    createReadStream(file).pipe(res)
  }
  return {
    name: 'repo-content',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
