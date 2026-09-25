import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type ThemePreference } from '../theme/context'

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

const item =
  'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none ' +
  'data-[highlighted]:bg-desk data-[disabled]:text-ink-muted'

export function ThemeMenu() {
  const { preference, resolved, darkPaper, setPreference, setDarkPaper } = useTheme()
  const TriggerIcon = resolved === 'dark' ? Moon : Sun

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rule text-ink hover:border-rule-strong"
        aria-label="Theme"
      >
        <TriggerIcon size={16} aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-52 rounded-md border border-rule bg-paper p-1 text-ink shadow-sheet"
        >
          <DropdownMenu.Label className="px-2 pb-1 pt-1.5 text-xs text-ink-muted">Theme</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={preference} onValueChange={(v) => setPreference(v as ThemePreference)}>
            {OPTIONS.map(({ value, label, Icon }) => (
              <DropdownMenu.RadioItem key={value} value={value} className={item}>
                <Icon size={15} aria-hidden />
                <span className="flex-1">{label}</span>
                <DropdownMenu.ItemIndicator>
                  <Check size={15} aria-hidden />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="my-1 h-px bg-rule" />
          <DropdownMenu.CheckboxItem
            checked={darkPaper}
            onCheckedChange={setDarkPaper}
            onSelect={(e) => e.preventDefault()}
            className={item}
          >
            <span className="inline-flex h-[15px] w-[15px] items-center justify-center rounded-[3px] border border-rule-strong">
              <DropdownMenu.ItemIndicator>
                <Check size={12} aria-hidden />
              </DropdownMenu.ItemIndicator>
            </span>
            <span className="flex-1">
              Dark paper
              <span className="block text-xs text-ink-muted">
                {resolved === 'dark' ? 'Invert the scanned pages' : 'Applies in dark theme'}
              </span>
            </span>
          </DropdownMenu.CheckboxItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
