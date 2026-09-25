// Fixture data for /dev/card. Question metadata and crop paths are real
// (served from the repo); mark points are invented for display and are not
// mark-scheme text.
import type { Question } from '../../content/types'
import type { GradingError, MarkPoint, PartResult, PartState, PracticePart } from '../../components/question-card/types'

const CS_31 =
  'https://pastpapers.co/api/file/caie/A-Level/Computer%20Science%20%28for%20first%20examination%20in%202021%29%20%289618%29/2021-May-June/9618_s21_qp_31.pdf?download=true'
const CS_31_MS = CS_31.replace('_qp_', '_ms_')

const available = (image_paths: string[], source_pages: number[], mark_scheme_url: string) => ({
  status: 'available' as const,
  reason: null,
  image_paths,
  source_pages,
  mark_scheme_url,
  mark_scheme_text: '',
})

export const rpn: Question = {
  id: '9618-2021-mj-31-q04',
  year: 2021,
  session: 'May/June',
  session_code: 'mj',
  paper: 3,
  variant: '31',
  question_number: 4,
  marks: 8,
  image_paths: ['/9618/9618-topic-16-system-software/assets/9618-2021-mj-31-q04-p01.png'],
  source_pages: [6],
  source_pdf_url: CS_31,
  answer: available(['/9618/answer-assets/9618_s21_ms_31-p05.png', '/9618/answer-assets/9618_s21_ms_31-p06.png'], [5, 6], CS_31_MS),
}

export const packetSwitching: Question = {
  id: '9618-2021-mj-31-q06',
  year: 2021,
  session: 'May/June',
  session_code: 'mj',
  paper: 3,
  variant: '31',
  question_number: 6,
  marks: 4,
  image_paths: ['/9618/9618-topic-14-communication-and-internet-technologies/assets/9618-2021-mj-31-q06-p01.png'],
  source_pages: [8],
  source_pdf_url: CS_31,
  answer: available(['/9618/answer-assets/9618_s21_ms_31-p07.png'], [7], CS_31_MS),
}

export const gravitation: Question = {
  id: '9702-2021-m-42-q01',
  year: 2021,
  session: 'March',
  session_code: 'm',
  paper: 4,
  variant: '42',
  question_number: 1,
  marks: 12,
  image_paths: [
    '/9702/9702-topic-13-gravitational-fields/assets/9702-2021-m-42-q01-p01.png',
    '/9702/9702-topic-13-gravitational-fields/assets/9702-2021-m-42-q01-p02.png',
  ],
  source_pages: [4, 5],
  source_pdf_url: 'https://pastpapers.co/api/file/caie/A-Level/Physics-9702/2021-March/9702_m21_qp_42.pdf?download=true',
  answer: available(
    ['/9702/answer-assets/9702_m21_ms_42-p08.png'],
    [8],
    'https://pastpapers.co/api/file/caie/A-Level/Physics-9702/2021-March/9702_m21_ms_42.pdf?download=true',
  ),
}

export const consumer: Question = {
  id: '9990-2021-mj-31-q03',
  year: 2021,
  session: 'May/June',
  session_code: 'mj',
  paper: 3,
  variant: '31',
  question_number: 3,
  marks: 12,
  image_paths: ['/9990/9990-topic-02-consumer-psychology/assets/9990-2021-mj-31-q03-p01.png'],
  source_pages: [2],
  source_pdf_url: 'https://pastpapers.co/api/file/caie/A-Level/Psychology-9990/2021-May-June/9990_s21_qp_31.pdf?download=true',
  answer: available(
    ['/9990/answer-assets/9990_s21_ms_31-p10.png', '/9990/answer-assets/9990_s21_ms_31-p11.png'],
    [10, 11],
    'https://pastpapers.co/api/file/caie/A-Level/Psychology-9990/2021-May-June/9990_s21_ms_31.pdf?download=true',
  ),
}

export const noMarkScheme: Question = {
  ...packetSwitching,
  answer: { ...packetSwitching.answer, status: 'unavailable', reason: 'No official mark scheme PDF', image_paths: [] },
}

export const rpnParts: PracticePart[] = [
  { partId: 'q04-a-i', label: '(a)(i)', marks: 2 },
  { partId: 'q04-a-ii', label: '(a)(ii)', marks: 2 },
  { partId: 'q04-b', label: '(b)', marks: 1 },
  { partId: 'q04-c', label: '(c)', marks: 1 },
  { partId: 'q04-d', label: '(d)', marks: 2 },
]

export const packetParts: PracticePart[] = [{ partId: 'q06', label: '6', marks: 4 }]

const graded = (answer: string, result: PartResult): PartState => ({ answer, status: { kind: 'graded', result } })

// One card, one grading state per part, so every state sits side by side.
export const rpnAllStates: Record<string, PartState> = {
  'q04-a-i': graded('No brackets are needed and it can be evaluated left to right using a stack.', {
    score: 2,
    max: 2,
    provisional: false,
    points: [
      { id: 'p1', text: 'Removes the need for brackets', state: 'counted' },
      { id: 'p2', text: 'Evaluated in a single left-to-right pass', state: 'counted' },
    ],
  }),
  'q04-a-ii': graded('A stack, because operands are pushed and the last two are popped for each operator. It is LIFO. Values are held until needed.', {
    score: 2,
    max: 2,
    provisional: false,
    points: [
      { id: 'p1', text: 'Identifies a stack', state: 'counted' },
      { id: 'p2', text: 'Operands popped in last-in-first-out order', state: 'counted' },
      { id: 'p3', text: 'Holds values until an operator is read', state: 'capped' },
    ],
  }),
  'q04-b': graded('a b c + * 7 /', {
    score: 0,
    max: 1,
    provisional: false,
    points: [{ id: 'p1', text: 'Operators in the correct final positions', state: 'blocked', blockedBy: '“(a − b) converted first”' }],
  }),
  'q04-c': graded('a / b * 4 + a + b', {
    score: 0,
    max: 1,
    provisional: false,
    points: [{ id: 'p1', text: 'Correct infix expression with brackets', state: 'missed' }],
  }),
  'q04-d': graded('17 + 3 = 20, 48 / 12 = 4, 20 / 4 = 5', {
    score: 1,
    max: 2,
    provisional: true,
    points: [
      { id: 'p1', text: 'Final answer 5', state: 'counted' },
      { id: 'p2', text: 'Working shows the stack contents', state: 'uncertain' },
    ],
  }),
}

const errored = (answer: string, error: GradingError): PartState => ({ answer, status: { kind: 'error', error } })

export const rpnErrors: Record<string, PartState> = {
  'q04-a-i': errored('No brackets are needed.', { kind: 'rate_limited', retryAfterSec: 45 }),
  'q04-a-ii': errored('A stack.', { kind: 'verification' }),
  'q04-b': errored('a b - a c + * 7 /', { kind: 'not_found' }),
  'q04-c': errored('a / b * 4 - (a + b)', { kind: 'unavailable' }),
  'q04-d': errored('20 / 4 = 5', { kind: 'network' }),
}

export const packetGrading: Record<string, PartState> = {
  q06: { answer: 'Benefit: packets can take different routes, so the network is more resilient.', status: { kind: 'grading' } },
}

// Interactive specimen: a fake, deterministic result from the answer length.
export function fakeGrade(answer: string): PartResult {
  const words = answer.trim().split(/\s+/).filter(Boolean).length
  const hits = Math.min(4, Math.floor(words / 6))
  const points: MarkPoint[] = [
    { id: 'b1', text: 'First benefit', state: hits >= 1 ? 'counted' : 'missed' },
    { id: 'b2', text: 'Second benefit', state: hits >= 2 ? 'counted' : 'missed' },
    { id: 'd1', text: 'First drawback', state: hits >= 3 ? 'counted' : words % 2 === 1 ? 'uncertain' : 'missed' },
    { id: 'd2', text: 'Second drawback', state: hits >= 4 ? 'counted' : 'missed' },
  ]
  return { score: hits, max: 4, provisional: points.some((p) => p.state === 'uncertain'), points }
}
