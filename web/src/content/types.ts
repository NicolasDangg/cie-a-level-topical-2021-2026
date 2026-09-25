// Shapes of the files written by python files/export_data.py
// (schema "topicalpaper-content/v2").

export type AnswerInfo = {
  status: 'available' | 'unavailable' | 'missing'
  reason: string | null
  image_paths: string[]
  source_pages: number[]
  mark_scheme_url: string | null
  mark_scheme_text: string
  /** Per mark-scheme image: where each part's row sits, for peel-off tape. */
  tape?: (MarkSchemeTape | null)[]
}

/** Fractions of the page. x: [table left, answer column left, table right]. */
export type MarkSchemeTape = {
  x: [number, number, number]
  /** One band per part; `wide` also covers the Question column (merged cells). */
  bands: { y: [number, number]; wide: boolean }[]
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

// Extracted question text (schema "topicalpaper-question/v1"), written by
// python files/extract_questions.py and checked by question_schema.py.

export type PartKind = 'numeric' | 'written' | 'diagram' | 'code'

export type ExtractedPart = {
  partId: string
  label: string
  lead: string | null
  text: string
  marks: number
  kind: PartKind
  /** Labelled answer spaces printed for this part ("Benefit 1", "Drawback 1"), if split. */
  slots?: string[] | null
  /** symbol is null when the answer line has no "x =" before it. */
  answer: { symbol: string | null; unit: string | null } | null
}

export type ExtractedFigure = {
  id: string
  caption: string | null
  alt: string
  source_image: string
  source_size: [number, number]
  /** Fractions of the source image: [x0, y0, x1, y1]. */
  box: [number, number, number, number]
}

export type ExtractedQuestion = {
  schema: string
  id: string
  subject: string
  status: 'draft' | 'reviewed' | 'rejected'
  extracted_with: { model: string; prompt: string; date: string }
  source_images: string[]
  marks_total: number | null
  stem: string | null
  parts: ExtractedPart[]
  figures: ExtractedFigure[]
  notes: string[]
  problems?: string[]
}
