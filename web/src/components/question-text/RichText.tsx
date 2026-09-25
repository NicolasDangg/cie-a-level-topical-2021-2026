import 'katex/dist/katex.min.css'
import katex from 'katex'
import { Fragment, type ReactNode } from 'react'
import type { ExtractedFigure } from '../../content/types'
import { FigureCrop } from './FigureCrop'

// Renders the extracted-question text format (see python files/question_schema.py):
// paragraphs, line breaks, *italic*, `code`, $TeX$, ``` code blocks ```,
// [[fig:ID]] figure placements, and [[blank]] gaps the student fills in.
// Nothing else is interpreted; text stays text.

const CODE_BLOCK = /```[a-z]*\n?([\s\S]*?)```/g
const FIGURE = /^\[\[fig:([A-Za-z0-9_-]+)\]\]$/
const INLINE = /(\[\[blank\]\]|\$[^$\n]+\$|`[^`\n]+`|\*[^*\n]+\*)/g
const BLANK = '[[blank]]'

/** A gap to fill in. `line`: a whole line left for the student. */
export function Blank({ line = false }: { line?: boolean }) {
  return (
    <span className={line ? 'blank blank-line' : 'blank'}>
      <span className="sr-only">blank</span>
    </span>
  )
}

/** How to show the n-th gap (counted through the whole text, in order). */
export type BlankRenderer = (index: number, where: { code: boolean; line: boolean }) => ReactNode

const drawnBlank: BlankRenderer = (_i, { line }) => <Blank line={line} />

/** Code with its gaps drawn; everything else stays verbatim. */
function codeWithBlanks(code: string, blank: BlankRenderer, next: () => number): ReactNode[] {
  return code.split('\n').flatMap((line, i) => {
    const out: ReactNode[] = i > 0 ? ['\n'] : []
    if (line.trim() === BLANK) {
      return [...out, line.slice(0, line.indexOf(BLANK)), <Fragment key={i}>{blank(next(), { code: true, line: true })}</Fragment>]
    }
    line.split(BLANK).forEach((piece, j) => {
      if (j > 0) out.push(<Fragment key={`${i}-${j}`}>{blank(next(), { code: true, line: false })}</Fragment>)
      out.push(piece)
    })
    return out
  })
}

function inline(text: string, keyPrefix: string, blank: BlankRenderer = drawnBlank, next: () => number = () => 0): ReactNode[] {
  const out: ReactNode[] = []
  text.split('\n').forEach((line, li) => {
    if (li > 0) out.push(<br key={`${keyPrefix}-br${li}`} />)
    line.split(INLINE).forEach((token, ti) => {
      const key = `${keyPrefix}-${li}-${ti}`
      if (!token) return
      if (token === BLANK) {
        out.push(<Fragment key={key}>{blank(next(), { code: false, line: false })}</Fragment>)
      } else if (token.length > 2 && token.startsWith('$') && token.endsWith('$')) {
        const html = katex.renderToString(token.slice(1, -1), { throwOnError: false, output: 'htmlAndMathml' })
        out.push(<span key={key} dangerouslySetInnerHTML={{ __html: html }} />)
      } else if (token.length > 2 && token.startsWith('`') && token.endsWith('`')) {
        out.push(
          <code key={key} className="font-mono text-[0.9em]">
            {token.slice(1, -1)}
          </code>,
        )
      } else if (token.length > 2 && token.startsWith('*') && token.endsWith('*')) {
        out.push(<em key={key}>{token.slice(1, -1)}</em>)
      } else {
        out.push(<Fragment key={key}>{token}</Fragment>)
      }
    })
  })
  return out
}

type Props = {
  text: string
  figures?: ExtractedFigure[]
  /** Replace the drawn gaps, e.g. with inputs. */
  blank?: BlankRenderer
  /** Replace how a placed figure shows, e.g. with a drawing layer. */
  figure?: (figure: ExtractedFigure) => ReactNode
}

export function RichText({ text, figures = [], blank = drawnBlank, figure: renderFigure }: Props) {
  const blocks: ReactNode[] = []
  let last = 0
  let n = 0
  let gaps = 0
  const nextGap = () => gaps++
  const paragraphs = (chunk: string) => {
    for (const para of chunk.split(/\n{2,}/)) {
      const trimmed = para.trim()
      if (!trimmed) continue
      const key = `p${n++}`
      const fig = FIGURE.exec(trimmed)
      if (fig) {
        const figure = figures.find((f) => f.id === fig[1])
        blocks.push(
          figure ? (
            <Fragment key={key}>{renderFigure ? renderFigure(figure) : <FigureCrop figure={figure} />}</Fragment>
          ) : (
            <p key={key} className="m-0 text-sm text-ink-muted">
              [missing figure {fig[1]}]
            </p>
          ),
        )
      } else {
        blocks.push(
          <p key={key} className="m-0">
            {inline(trimmed, key, blank, nextGap)}
          </p>,
        )
      }
    }
  }
  for (const match of text.matchAll(CODE_BLOCK)) {
    paragraphs(text.slice(last, match.index))
    blocks.push(
      <pre key={`c${n++}`} className="m-0 overflow-x-auto rounded-sm bg-desk px-3 py-2 font-mono text-[0.85em] leading-relaxed">
        {codeWithBlanks(match[1].replace(/\n$/, ''), blank, nextGap)}
      </pre>,
    )
    last = (match.index ?? 0) + match[0].length
  }
  paragraphs(text.slice(last))
  return <div className="flex flex-col gap-3">{blocks}</div>
}
