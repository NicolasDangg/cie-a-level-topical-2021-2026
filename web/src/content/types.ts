// Shapes of the files written by python files/export_data.py
// (schema "topicalpaper-content/v2").

export type AnswerInfo = {
  status: 'available' | 'unavailable' | 'missing'
  reason: string | null
  image_paths: string[]
  source_pages: number[]
  mark_scheme_url: string | null
  mark_scheme_text: string
}

export type Question = {
  id: string
  year: number
  session: string
  session_code: 'm' | 'mj' | 'on'
  paper: number
  variant: string
  question_number: number
  marks: number | null
  image_paths: string[]
  source_pages: number[]
  source_pdf_url: string
  /** Id of an earlier, identical question in another paper variant. */
  duplicate_of: string | null
  answer: AnswerInfo
}

export type TopicSummary = {
  number: number | null
  label: string
  slug: string
  question_count: number
  distinct_count: number
}

export type Paper = {
  year: number
  session: string
  session_code: 'm' | 'mj' | 'on'
  paper: number
  variant: string
  question_count: number
  source_pdf_url: string
}

export type SubjectIndex = {
  schema: string
  subject: string
  subject_name: string
  syllabus_url: string
  generated: string
  topics: TopicSummary[]
  papers: Paper[]
  missing_papers: { year: number; session: string; variant: string; source_pdf_url: string; reason: string }[]
}

export type TopicFile = {
  schema: string
  subject: string
  topic: { number: number | null; label: string; slug: string }
  questions: Question[]
}
