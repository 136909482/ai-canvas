import { useEffect, useId, useRef, useState, type ReactNode, type SyntheticEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { handleMenuKeyboard } from '@/utils/menuKeyboard'

export type InlineSelectOption = {
  value: string
  label: string
  icon?: ReactNode
  trailing?: ReactNode
}

type InlineSelectProps = {
  value: string
  options: InlineSelectOption[]
  ariaLabel: string
  onChange: (value: string) => void
  stopCanvasGesture: (event: SyntheticEvent) => void
  menuClassName?: string
}

export function InlineSelect({
  value,
  options,
  ariaLabel,
  onChange,
  stopCanvasGesture,
  menuClassName = '',
}: InlineSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()
  const selectedOption = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  useEffect(() => {
    if (open) {
      window.requestAnimationFrame(() => {
        menuRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
      })
    }
  }, [open])

  const closeMenu = () => {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <div
      ref={rootRef}
      className="relative min-w-0"
      onPointerDown={stopCanvasGesture}
      onMouseDown={stopCanvasGesture}
      onClick={stopCanvasGesture}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`nowheel nodrag nopan flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-left text-xs font-medium leading-5 transition-all ${
          open
            ? 'border-[var(--accent-violet-strong)] bg-[var(--node-control-bg-hover)] text-[var(--text-primary)] shadow-[0_10px_24px_rgba(0,0,0,0.16)]'
            : 'border-[var(--border-subtle)] bg-[var(--node-control-bg)] text-[var(--text-secondary)] hover:border-[var(--accent-violet-muted)] hover:bg-[var(--node-control-bg-hover)]'
        }`}
        title={selectedOption?.label ?? value}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
        onClick={(event) => {
          stopCanvasGesture(event)
          setOpen((current) => !current)
        }}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {selectedOption?.icon}
          <span className="min-w-0 truncate leading-5">{selectedOption?.label ?? value}</span>
          {selectedOption?.trailing}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180 text-[var(--text-secondary)]' : ''}`} />
      </button>

      {open && (
        <div
          id={menuId}
          ref={menuRef}
          className={`nowheel nodrag nopan absolute left-0 right-0 top-full z-40 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-bg-strong)] p-1.5 shadow-[var(--shadow-panel)] backdrop-blur-xl ${menuClassName}`}
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={(event) => handleMenuKeyboard(event.nativeEvent, menuRef.current, closeMenu)}
          onPointerDown={stopCanvasGesture}
          onMouseDown={stopCanvasGesture}
          onClick={stopCanvasGesture}
          onWheelCapture={stopCanvasGesture}
        >
          <div
            className="scrollbar-hidden nowheel max-h-52 overflow-y-auto overscroll-contain"
            onWheelCapture={stopCanvasGesture}
          >
            {options.map((option) => {
              const active = option.value === value

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs leading-5 transition-colors ${
                    active
                      ? 'bg-[var(--accent-violet-soft)] text-[var(--accent-violet-strong)] shadow-[inset_0_0_0_1px_var(--accent-violet-muted)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]'
                  }`}
                  onClick={(event) => {
                    stopCanvasGesture(event)
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {option.icon}
                    <span className="min-w-0 truncate" title={option.label}>{option.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {option.trailing}
                    {active ? <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent-violet-strong)]" /> : <span className="h-3.5 w-3.5 shrink-0" />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
