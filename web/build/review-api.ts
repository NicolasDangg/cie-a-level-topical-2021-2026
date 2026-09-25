// Dev-server-only endpoints for the question review tool:
//   GET  /__dev/questions/:subject       ids that have an extracted file
//   GET  /__dev/review-summary           per topic: how many drafts, reviewed, ... (the "to review" list)
//   POST /__dev/questions/:subject/:id   body: the whole question JSON
// Writes content/{subject}/questions/{id}.json (the file must already exist),
// then runs python files/question_schema.py on it and stores the problems.
// A question can only be saved as "reviewed" with no problems; otherwise it
// is kept as a draft, and the saved file (status "draft", its problems) is
// returned so the tool can say why. Never part of a build.
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Connect, Plugin } from 'vite'

const SUBJECTS = new Set(['9702', '9618', '9990'])
const ID = /^(9702|9618|9990)-20\d\d-(m|mj|on)-\d\d-q\d\d$/
const ROUTE = /^\/__dev\/questions\/([^/]+)\/([^/?]+)$/
const LIST = /^\/__dev\/questions\/([^/?]+)$/

function validate(repoRoot: string, file: string): Promise<{ problems: string[]; warnings: string[] }> {
  const script = path.join(repoRoot, 'python files', 'question_schema.py')
  return new Promise((resolve, reject) => {
    execFile(process.env.PYTHON ?? 'python3', [script, '--with-warnings', file], (err, stdout) => {
      try {
        const report = JSON.parse(stdout) as Record<string, { problems: string[]; warnings: string[] }>
        resolve(report[file] ?? { problems: [], warnings: [] })
      } catch {
        reject(err ?? new Error(`validator printed: ${stdout}`))
      }
    })
  })
}

type TopicSummary = { subject: string; slug: string; label: string; draft: number; problems: number; reviewed: number; rejected: number; none: number }

/** Per topic, the state of its distinct questions' extractions. */
function reviewSummary(repoRoot: string): TopicSummary[] {
  const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
  const out: TopicSummary[] = []
  for (const subject of SUBJECTS) {
    const dir = path.join(repoRoot, 'content', subject)
    if (!existsSync(path.join(dir, 'index.json'))) continue
    for (const topic of read(path.join(dir, 'index.json')).topics as { slug: string; label: string }[]) {
      const row: TopicSummary = { subject, slug: topic.slug, label: topic.label, draft: 0, problems: 0, reviewed: 0, rejected: 0, none: 0 }
      for (const q of read(path.join(dir, 'topics', `${topic.slug}.json`)).questions as { id: string; duplicate_of: string | null }[]) {
        if (q.duplicate_of) continue
        const file = path.join(dir, 'questions', `${q.id}.json`)
        if (!existsSync(file)) {
          row.none++
          continue
        }
        const doc = read(file) as { status: 'draft' | 'reviewed' | 'rejected'; problems?: string[] }
        row[doc.status]++
        if (doc.status === 'draft' && doc.problems?.length) row.problems++
      }
      out.push(row)
    }
  }
  return out
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 2_000_000) reject(new Error('too large'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

export function reviewApi(repoRoot: string): Plugin {
  return {
    name: 'review-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.url === '/__dev/review-summary' && req.method === 'GET') {
          try {
            return send(200, { topics: reviewSummary(repoRoot) })
          } catch (err) {
            return send(500, { error: String(err) })
          }
        }
        const list = LIST.exec(req.url ?? '')
        if (list && req.method === 'GET') {
          if (!SUBJECTS.has(list[1])) return send(400, { error: 'bad subject' })
          const dir = path.join(repoRoot, 'content', list[1], 'questions')
          const ids = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : []
          return send(200, { ids })
        }
        const match = ROUTE.exec(req.url ?? '')
        if (!match || req.method !== 'POST') return next()
        const [, subject, id] = match
        if (!SUBJECTS.has(subject) || !ID.test(id) || !id.startsWith(subject)) return send(400, { error: 'bad subject or id' })
        const file = path.join(repoRoot, 'content', subject, 'questions', `${id}.json`)
        if (!existsSync(file)) return send(404, { error: 'no extracted file for this question' })
        let doc: Record<string, unknown>
        try {
          doc = JSON.parse(await readBody(req))
        } catch {
          return send(400, { error: 'body is not JSON' })
        }
        if (doc.id !== id) return send(400, { error: `id in the JSON (${String(doc.id)}) doesn't match ${id}` })
        const wantsReviewed = doc.status === 'reviewed'
        const write = (d: unknown) => writeFileSync(file, JSON.stringify(d, null, 2) + '\n', 'utf8')
        try {
          write({ ...doc, problems: [], warnings: [] })
          const { problems, warnings } = await validate(repoRoot, file)
          const saved = { ...doc, status: wantsReviewed && problems.length ? 'draft' : doc.status, problems, warnings }
          write(saved)
          send(200, saved)
        } catch (err) {
          send(500, { error: `couldn't save or validate: ${String(err)}` })
        }
      })
    },
  }
}
