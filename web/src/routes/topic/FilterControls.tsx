import type { Filters, Option } from './filters'

type Props = {
  options: { years: Option[]; sessions: Option[]; papers: Option[] }
  filters: Filters
  repeatCount: number
  onChange: (next: Filters) => void
}

// The filter form, shared by the desktop rail and the phone sheet.
export function FilterControls({ options, filters, repeatCount, onChange }: Props) {
  const toggle = (key: 'years' | 'sessions' | 'papers', value: string) => {
    const next = new Set(filters[key])
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange({ ...filters, [key]: next })
  }

  return (
    <div className="flex flex-col gap-6 text-sm">
      <Group legend="Year" options={options.years} selected={filters.years} onToggle={(v) => toggle('years', v)} mono />
      <Group legend="Session" options={options.sessions} selected={filters.sessions} onToggle={(v) => toggle('sessions', v)} />
      <Group legend="Paper" options={options.papers} selected={filters.papers} onToggle={(v) => toggle('papers', v)} mono />
      {repeatCount > 0 && (
        <label className="flex cursor-pointer items-start justify-between gap-3">
          <span>
            Hide repeated questions
            <span className="block text-xs text-ink-muted">
              {repeatCount} appear again in another paper variant
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={!filters.showRepeats}
            onChange={(e) => onChange({ ...filters, showRepeats: !e.target.checked })}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-ink)]"
          />
        </label>
      )}
    </div>
  )
}

function Group({
  legend,
  options,
  selected,
  onToggle,
  mono = false,
}: {
  legend: string
  options: Option[]
  selected: Set<string>
  onToggle: (value: string) => void
  mono?: boolean
}) {
  if (options.length < 2) return null
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 p-0 text-xs font-medium uppercase tracking-wide text-ink-muted">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.has(o.value)
          return (
            <label
              key={o.value}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                on ? 'border-ink bg-ink text-desk' : 'border-rule-strong bg-paper text-ink hover:bg-desk'
              }`}
            >
              <input type="checkbox" checked={on} onChange={() => onToggle(o.value)} className="sr-only" />
              <span className={mono ? 'font-mono' : ''}>{o.label}</span>
              <span className={`text-xs ${on ? 'text-desk/80' : 'text-ink-muted'}`}>{o.count}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
