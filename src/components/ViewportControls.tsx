import { useEffect, useMemo, useRef, useState } from 'react'
import { Panel, useReactFlow, useViewport } from '@xyflow/react'
import { Keyboard, Maximize, Minus, Plus, Redo2, Undo2 } from 'lucide-react'
import { TooltipIconButton } from '@/components/TooltipIconButton'
import { useHistoryStore } from '@/store/useHistoryStore'
import { themeClasses } from '@/styles/themeClasses'
import { handleMenuKeyboard } from '@/utils/menuKeyboard'

const ZOOM_PRESETS = [2, 1, 0.5, 0.2]
const FIT_VIEW_OPTIONS = {
  padding: 0.2,
  maxZoom: 0.8,
  duration: 220,
}

const CONTROL_TEXT_STYLE = {
  fontSize: '9px',
  lineHeight: '2.8',
  letterSpacing: '0',
} as const

const FLOATING_SURFACE_CLASS = `${themeClasses.floatingPanel} p-[4px]`
const ICON_BUTTON_CLASS = `${themeClasses.iconButton} h-6 w-6`
const ACTIVE_ICON_BUTTON_CLASS = themeClasses.iconButtonActive
const DIVIDER_CLASS = `mx-0.5 h-3 w-px ${themeClasses.divider}`

type ShortcutItem = {
  keyLabel: string
  name: string
}

const SHORTCUT_ITEMS: ShortcutItem[] = [
  {
    keyLabel: 'Ctrl/Cmd + Z',
    name: '撤销',
  },
  {
    keyLabel: 'Ctrl/Cmd + Shift + Z',
    name: '重做',
  },
  {
    keyLabel: 'Ctrl/Cmd + C',
    name: '复制节点',
  },
  {
    keyLabel: 'Ctrl/Cmd + V',
    name: '粘贴节点',
  },
  {
    keyLabel: 'Ctrl/Cmd + D',
    name: '快速复制',
  },
  {
    keyLabel: 'C',
    name: '整理关联节点',
  },
]

function formatZoomLabel(zoom: number) {
  return `${Math.round(zoom * 100)}%`
}

interface ViewportControlsProps {
  onBeforeHistoryAction?: () => void
}

export function ViewportControls({ onBeforeHistoryAction }: ViewportControlsProps) {
  const [showZoomMenu, setShowZoomMenu] = useState(false)
  const [showShortcutMenu, setShowShortcutMenu] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const zoomTriggerRef = useRef<HTMLButtonElement | null>(null)
  const zoomMenuRef = useRef<HTMLDivElement | null>(null)
  const { zoom } = useViewport()
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow()
  const undo = useHistoryStore((state) => state.undo)
  const redo = useHistoryStore((state) => state.redo)
  const canUndo = useHistoryStore((state) => state.canUndo())
  const canRedo = useHistoryStore((state) => state.canRedo())
  const currentZoomLabel = useMemo(() => formatZoomLabel(zoom), [zoom])

  useEffect(() => {
    if (!showZoomMenu) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && containerRef.current?.contains(target)) {
        return
      }

      setShowZoomMenu(false)
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [showZoomMenu])

  useEffect(() => {
    if (showZoomMenu) window.requestAnimationFrame(() => zoomMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
  }, [showZoomMenu])

  const closeZoomMenu = () => {
    setShowZoomMenu(false)
    window.requestAnimationFrame(() => zoomTriggerRef.current?.focus())
  }

  const handleFitView = async () => {
    await fitView(FIT_VIEW_OPTIONS)
    setShowZoomMenu(false)
  }

  const handleZoomPreset = async (nextZoom: number) => {
    await zoomTo(nextZoom, { duration: 180 })
    setShowZoomMenu(false)
  }

  return (
    <Panel position="bottom-left" className="!m-3">
      <div ref={containerRef} role="toolbar" aria-label="画布视图与历史操作" className="flex items-end gap-2">
        <div className="relative">
          {showZoomMenu ? (
            <div id="zoom-menu" ref={zoomMenuRef} role="menu" aria-label="画布缩放" onKeyDown={(event) => handleMenuKeyboard(event.nativeEvent, zoomMenuRef.current, closeZoomMenu)} className={`absolute bottom-[calc(100%+8px)] left-1/2 w-[92px] -translate-x-1/2 animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ${FLOATING_SURFACE_CLASS}`}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void handleFitView()
                }}
                className={`${themeClasses.iconButton} h-6 w-full gap-1 text-[var(--text-secondary)]`}
              >
                <Maximize className="h-2.5 w-2.5" />
                <span style={CONTROL_TEXT_STYLE}>适应视图</span>
              </button>

              <div className={`my-1 h-px ${themeClasses.divider}`} />

              <div className="flex flex-col gap-0.5">
                {ZOOM_PRESETS.map((preset) => {
                  const active = Math.abs(zoom - preset) < 0.01

                  return (
                    <button
                      key={preset}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        void handleZoomPreset(preset)
                      }}
                      className={`flex h-5.5 w-full items-center justify-center rounded-lg border font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--text-primary)_20%,transparent)] ${
                        active
                          ? themeClasses.iconButtonActive
                          : 'border-transparent text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span style={CONTROL_TEXT_STYLE}>{formatZoomLabel(preset)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className={`flex items-center gap-0 ${FLOATING_SURFACE_CLASS}`}>
            <button
              ref={zoomTriggerRef}
              type="button"
              onClick={() => {
                void zoomOut({ duration: 160 })
              }}
              className={ICON_BUTTON_CLASS}
              aria-label="缩小画布"
              title="缩小画布"
            >
              <Minus className="h-3 w-3" />
            </button>

            <span className={DIVIDER_CLASS} aria-hidden="true" />

            <button
              type="button"
              onClick={() => {
                setShowShortcutMenu(false)
                setShowZoomMenu((current) => !current)
              }}
              className={`inline-flex h-6 min-w-[38px] items-center justify-center rounded-lg border px-2 text-[var(--text-secondary)] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--text-primary)_20%,transparent)] ${
                showZoomMenu
                  ? ACTIVE_ICON_BUTTON_CLASS
                  : 'border-transparent bg-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]'
              }`}
              aria-label="打开缩放菜单"
              aria-haspopup="menu"
              aria-expanded={showZoomMenu}
              aria-controls={showZoomMenu ? 'zoom-menu' : undefined}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  setShowZoomMenu(true)
                }
              }}
              title="打开缩放菜单"
            >
              <span style={CONTROL_TEXT_STYLE}>{currentZoomLabel}</span>
            </button>

            <span className={DIVIDER_CLASS} aria-hidden="true" />

            <button
              type="button"
              onClick={() => {
                void zoomIn({ duration: 160 })
              }}
              className={ICON_BUTTON_CLASS}
              aria-label="放大画布"
              title="放大画布"
            >
              <Plus className="h-3 w-3" />
            </button>

            <span className={DIVIDER_CLASS} aria-hidden="true" />

            <button
              type="button"
              onClick={() => {
                void handleFitView()
              }}
              className={ICON_BUTTON_CLASS}
              aria-label="适配画布"
              title="适配画布"
            >
              <Maximize className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div
          className="relative"
          onPointerEnter={() => {
            setShowZoomMenu(false)
            setShowShortcutMenu(true)
          }}
          onPointerLeave={() => setShowShortcutMenu(false)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setShowShortcutMenu(false)
          }}
        >
          {showShortcutMenu ? (
            <div id="shortcut-help" role="dialog" aria-label="快捷键说明" className={`absolute bottom-[calc(100%+8px)] left-0 w-[196px] max-w-[calc(100vw-24px)] p-2.5 animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ${FLOATING_SURFACE_CLASS}`}>
              <div className="pb-2.5 text-[9px] font-medium text-[var(--text-muted)]">快捷键</div>

              <div className="flex flex-col gap-2.5">
                {SHORTCUT_ITEMS.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-1.5">
                    <span className="min-w-0 text-[11px] font-medium tracking-normal text-[var(--text-primary)]">{item.name}</span>
                    <span className={themeClasses.shortcutKey}>
                      {item.keyLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className={FLOATING_SURFACE_CLASS}>
            <button
              type="button"
              onClick={() => {
                setShowZoomMenu(false)
                setShowShortcutMenu((current) => !current)
              }}
              onFocus={() => {
                setShowZoomMenu(false)
                setShowShortcutMenu(true)
              }}
              className={`${ICON_BUTTON_CLASS} ${
                showShortcutMenu
                  ? ACTIVE_ICON_BUTTON_CLASS
                  : ''
              }`}
              aria-label="查看快捷键说明"
              aria-haspopup="dialog"
              aria-expanded={showShortcutMenu}
              aria-controls={showShortcutMenu ? 'shortcut-help' : undefined}
              title="快捷键说明"
            >
              <Keyboard className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className={`flex items-center gap-0 ${FLOATING_SURFACE_CLASS}`}>
          <TooltipIconButton
            label="撤销"
            onClick={() => {
              onBeforeHistoryAction?.()
              undo()
            }}
            disabled={!canUndo}
            testId="undo-button"
            tooltipPlacement="top"
            tooltipAlign="start"
            className={ICON_BUTTON_CLASS}
            icon={<Undo2 className="h-3 w-3" />}
          />
          <span className={DIVIDER_CLASS} aria-hidden="true" />
          <TooltipIconButton
            label="重做"
            onClick={() => {
              onBeforeHistoryAction?.()
              redo()
            }}
            disabled={!canRedo}
            testId="redo-button"
            tooltipPlacement="top"
            tooltipAlign="start"
            className={ICON_BUTTON_CLASS}
            icon={<Redo2 className="h-3 w-3" />}
          />
        </div>
      </div>
    </Panel>
  )
}
