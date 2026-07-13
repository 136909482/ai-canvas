import { useId, useState, type MouseEvent, type ReactNode } from 'react'
import { themeClasses } from '@/styles/themeClasses'

type TooltipPlacement = 'top' | 'bottom'
type TooltipAlign = 'start' | 'center' | 'end'

type TooltipIconButtonProps = {
  label: string
  icon: ReactNode
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  className?: string
  testId?: string
  disabled?: boolean
  showTooltip?: boolean
  tooltipPlacement?: TooltipPlacement
  tooltipAlign?: TooltipAlign
  pressed?: boolean
  expanded?: boolean
  controls?: string
  hasPopup?: 'menu' | 'listbox' | 'dialog'
}

function getTooltipPositionClassName(placement: TooltipPlacement, align: TooltipAlign) {
  if (placement === 'bottom') {
    if (align === 'start') {
      return 'left-0 top-full mt-2'
    }

    if (align === 'end') {
      return 'right-0 top-full mt-2'
    }

    return 'left-1/2 top-full mt-2 -translate-x-1/2'
  }

  if (align === 'start') {
    return 'left-0 top-0 -translate-y-[calc(100%+10px)]'
  }

  if (align === 'end') {
    return 'right-0 top-0 -translate-y-[calc(100%+10px)]'
  }

  return 'left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(100%+10px)]'
}

export function TooltipIconButton({
  label,
  icon,
  onClick,
  className,
  testId,
  disabled = false,
  showTooltip = true,
  tooltipPlacement = 'bottom',
  tooltipAlign = 'center',
  pressed,
  expanded,
  controls,
  hasPopup,
}: TooltipIconButtonProps) {
  const [visible, setVisible] = useState(false)
  const tooltipId = useId()

  const tooltipClassName = getTooltipPositionClassName(tooltipPlacement, tooltipAlign)

  return (
    <div
      className="relative"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <button
        type="button"
        onMouseDown={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        onClick={(event) => {
          setVisible(false)
          onClick(event)
        }}
        aria-label={label}
        aria-pressed={pressed}
        aria-expanded={expanded}
        aria-controls={controls}
        aria-haspopup={hasPopup}
        aria-describedby={showTooltip ? tooltipId : undefined}
        data-testid={testId}
        disabled={disabled}
        className={`inline-flex items-center justify-center rounded-lg border border-transparent bg-transparent transition ${className ?? ''}`}
      >
        {icon}
      </button>

      {showTooltip ? (
        <div id={tooltipId} role="tooltip" aria-hidden={!visible} className={`pointer-events-none absolute z-10 transition duration-150 ${tooltipClassName} ${visible ? 'opacity-100' : 'opacity-0'}`}>
          <div className={themeClasses.tooltip}>
            {label}
          </div>
        </div>
      ) : null}
    </div>
  )
}
