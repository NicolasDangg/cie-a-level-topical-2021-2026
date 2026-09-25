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
  answer: AnswerInfo
}
