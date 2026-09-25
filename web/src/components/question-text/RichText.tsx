import 'katex/dist/katex.min.css'
import katex from 'katex'
import { Fragment, type ReactNode } from 'react'
import type { ExtractedFigure } from '../../content/types'
import { FigureCrop } from './FigureCrop'

// Renders the extracted-question text format (see python files/question_schema.py):
// paragraphs, line breaks, *italic*, `code`, $TeX$, ``` code blocks ```, and
// [[fig:ID]] figure placements. Nothing else is interpreted; text stays text.

const CODE_BLOCK = /```[a-z]*\n?([\s\S]*?)```/g
const FIGURE = /^\[\[fig:([A-Za-z0-9_-]+)\]\]$/
const INLINE = /(\$[^$\n]+\$|`[^`\n]+`|\*[^*\n]+\*)/g

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  text.split('\n').forEach((line, li) => {
    if (li > 0) out.push(<br key={`${keyPrefix}-br${li}`} />)
    line.split(INLINE).forEach((token, ti) => {
      const key = `${keyPrefix}-${li}-${ti}`
      if (!token) return
      if (token.length > 2 && token.startsWith('$') && token.endsWith('$')) {
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

export function RichText({ text, figures = [] }: { text: string; figures?: ExtractedFigure[] }) {
  const blocks: ReactNode[] = []
  let last = 0
  let n = 0
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
            <FigureCrop key={key} figure={figure} />
          ) : (
            <p key={key} className="m-0 text-sm text-ink-muted">
              [missing figure {fig[1]}]
            </p>
          ),
        )
      } else {
        blocks.push(
          <p key={key} className="m-0">
            {inline(trimmed, key)}
          </p>,
        )
      }
    }
  }
  for (const match of text.matchAll(CODE_BLOCK)) {
    paragraphs(text.slice(last, match.index))
    blocks.push(
      <pre key={`c${n++}`} className="m-0 overflow-x-auto rounded-sm bg-desk px-3 py-2 font-mono text-[0.85em] leading-relaxed">
        {match[1].replace(/\n$/, '')}
      </pre>,
    )
    last = (match.index ?? 0) + match[0].length
  }
  paragraphs(text.slice(last))
  return <div className="flex flex-col gap-3">{blocks}</div>
}
