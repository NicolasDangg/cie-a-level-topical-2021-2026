import * as ToggleGroup from '@radix-ui/react-toggle-group'

export type Mode = 'browse' | 'practice'

const segment =
  'h-8 px-3 text-sm text-ink-muted hover:text-ink ' +
  'data-[state=on]:bg-paper data-[state=on]:text-ink data-[state=on]:shadow-sheet ' +
  'first:rounded-l-[5px] last:rounded-r-[5px]'

export function ModeToggle({ value, onChange }: { value: Mode; onChange: (mode: Mode) => void }) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      // Radix allows deselecting the active item; a mode must always be set.
      onValueChange={(next) => next && onChange(next as Mode)}
      aria-label="Mode"
      className="inline-flex rounded-md border border-rule bg-desk p-0.5"
    >
      <ToggleGroup.Item value="browse" className={segment}>
        Browse
      </ToggleGroup.Item>
      <ToggleGroup.Item value="practice" className={segment}>
        Practice
      </ToggleGroup.Item>
    </ToggleGroup.Root>
  )
}
