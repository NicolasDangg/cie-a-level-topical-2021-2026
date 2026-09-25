// Which questions practice sets may use: per topic, the distinct questions
// (no duplicate_of) whose extracted text a person has reviewed. Built from
// content/ at request time in dev (vite.config.ts) and written into the site at
// deploy (scripts/assemble-site.mjs), so approving a question in the review
// tool needs no export step. Served as /content/{subject}/practice.json.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const PRACTICE_SCHEMA = 'topicalpaper-practice/v1'
export const PRACTICE_SUBJECTS = ['9702', '9618', '9990']

const read = (file) => JSON.parse(readFileSync(file, 'utf8'))

/** { schema, subject, topics: { [slug]: [{ id, marks }] } } for one subject. */
export function practiceIndex(repoRoot, subject) {
  const dir = path.join(repoRoot, 'content', subject)
  const topics = {}
  for (const topic of read(path.join(dir, 'index.json')).topics) {
    const questions = []
    for (const q of read(path.join(dir, 'topics', `${topic.slug}.json`)).questions) {
      if (q.duplicate_of) continue
      const file = path.join(dir, 'questions', `${q.id}.json`)
      if (!existsSync(file)) continue
      const doc = read(file)
      if (doc.status === 'reviewed') questions.push({ id: q.id, marks: doc.marks_total ?? q.marks ?? 0 })
    }
    topics[topic.slug] = questions
  }
  return { schema: PRACTICE_SCHEMA, subject, topics }
}
