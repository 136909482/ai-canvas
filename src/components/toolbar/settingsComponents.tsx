import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { TooltipIconButton } from '@/components/TooltipIconButton'
import { themeClasses } from '@/styles/themeClasses'

type TopChromeIconButtonProps = {
  label: string
  icon: ReactNode
  onClick: () => void
}

export function TopChromeIconButton({ label, icon, onClick }: TopChromeIconButtonProps) {
  return (
    <TooltipIconButton
      label={label}
      onClick={onClick}
      tooltipAlign="end"
      className={`${themeClasses.iconButton} h-6 w-6 rounded-md`}
      icon={icon}
    />
  )
}

type DetailRowProps = {
  label: string
  hint: string
  children: ReactNode
}

export function DetailRow({ label, hint, children }: DetailRowProps) {
  return (
    <div className="relative grid min-h-0 items-center gap-3 px-4 py-1.5 last:[&>span[data-row-divider]]:hidden md:grid-cols-[8rem_minmax(0,1fr)] md:gap-4">
      <div className="md:pl-3">
        <div className={`flex items-center gap-1.5 text-[12px] font-medium ${themeClasses.textPrimary}`}>
          <span>{label}</span>
          {hint ? (
            <button
              type="button"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--text-primary)_18%,transparent)]"
              aria-label={`${label}说明：${hint}`}
              title={hint}
            >
              <Info className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>
      <div>{children}</div>
      <span
        data-row-divider
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-4 right-4 h-px bg-[color-mix(in_srgb,var(--border-subtle)_72%,transparent)] md:left-7"
      />
    </div>
  )
}
