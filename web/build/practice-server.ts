// Serves /content/{subject}/practice.json during `vite dev` and `vite preview`,
// built fresh from content/ on each request (see practice-index.mjs).
import type { Connect, Plugin } from 'vite'
import { PRACTICE_SUBJECTS, practiceIndex } from './practice-index.mjs'

const ROUTE = /^\/content\/(\d{4})\/practice\.json(?:\?.*)?$/

export function practiceIndexServer(repoRoot: string): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const match = ROUTE.exec(req.url ?? '')
    if (!match || !PRACTICE_SUBJECTS.includes(match[1])) return next()
    try {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.end(JSON.stringify(practiceIndex(repoRoot, match[1])))
    } catch (err) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(err) }))
    }
  }
  return {
    name: 'practice-index',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
