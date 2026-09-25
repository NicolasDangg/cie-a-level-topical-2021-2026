import type { ExtractedFigure, ExtractedPart, ExtractedQuestion } from '../content/types'

export const BLANK = '[[blank]]'
const FIG_PLACE = /\[\[fig:([A-Za-z0-9_-]+)\]\]/g
const FIG_REF = /\b(Fig|Table)\.?\s*(\d+\.\d+)/gi

export const countBlanks = (text: string) => text.split(BLANK).length - 1

const squash = (s: string) => s.replace(/[\s.]/g, '').toLowerCase()

/** "(c)" for "(c)(ii)": the group a sub-part belongs to. */
const topLabel = (label: string) => /^\(\w+\)/.exec(label)?.[0] ?? label

/** Texts that set up a part, nearest first: its own text, its group's lead, the stem. */
function contextTexts(q: ExtractedQuestion, index: number): string[] {
  const part = q.parts[index]
  const texts = [part.text]
  if (part.lead) texts.push(part.lead)
  for (let i = index - 1; i >= 0; i--) {
    const prev = q.parts[i]
    if (topLabel(prev.label) !== topLabel(part.label)) break
    if (prev.lead) texts.push(prev.lead)
  }
  if (q.stem) texts.push(q.stem)
  return texts
}

/** The figure a diagram part is drawn on, or null. */
export function drawingTarget(q: ExtractedQuestion, index: number): ExtractedFigure | null {
  const part = q.parts[index]
  if (part.kind !== 'diagram' || q.figures.length === 0) return null
  const byCaption = (kind: string, num: string) =>
    q.figures.find((f) => f.caption && squash(f.caption).startsWith(squash(`${kind}${num}`)))
  for (const text of contextTexts(q, index)) {
    for (const [, kind, num] of text.matchAll(FIG_REF)) {
      const figure = byCaption(kind, num)
      if (figure) return figure
    }
    // Several figures in one text: the answer space comes after the
    // instruction ("the array is: [f1] … Complete the trace table: [f2]").
    const placed = [...text.matchAll(FIG_PLACE)].map((m) => q.figures.find((f) => f.id === m[1])).filter(Boolean)
    if (placed.length) return placed[placed.length - 1]!
  }
  // Otherwise the last figure placed before this part.
  const before = [q.stem ?? '', ...q.parts.slice(0, index).flatMap((p) => [p.lead ?? '', p.text])].join('\n')
  const placed = [...before.matchAll(FIG_PLACE)].map((m) => m[1])
  return q.figures.find((f) => f.id === placed[placed.length - 1]) ?? null
}

/** A few words saying what the part is about, for answer cards. */
export function partSummary(part: ExtractedPart): string {
  const plain = part.text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(FIG_PLACE, ' ')
    .replace(/\[\[blank\]\]/g, '…')
    .replace(/[*`$]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const sentence = plain.split(/(?<=[.?!])\s/).find((s) => /^(state|calculate|determine|explain|describe|show|suggest|draw|sketch|complete|write|give|identify|outline|define|evaluate|compare|discuss|name|use|on)\b/i.test(s)) ?? plain
  return sentence.length > 90 ? `${sentence.slice(0, 88).trimEnd()}…` : sentence
}
