import type { ReactNode } from 'react'
import { NodeResizer } from '@xyflow/react'
import type { OnResizeEnd, ResizeDragEvent } from '@xyflow/react'
import { X } from 'lucide-react'

const NODE_RESIZER_LINE_CLASS = '!border-[var(--accent-violet-strong)]'
const NODE_RESIZER_HANDLE_CLASS = '!w-3 !h-3 !bg-[var(--accent-violet)] !border-2 !border-[var(--node-bg)] !rounded-full'
const DELETE_BUTTON_BASE_CLASS =
  'group absolute -top-2.5 -right-2.5 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--panel-bg-strong)] text-[var(--text-muted)] shadow-lg backdrop-blur-sm transition-all duration-200 ease-out hover:scale-105 hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-500 active:scale-[0.96] active:border-red-400/50 active:bg-red-500/14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas-bg)]'
const DELETE_BUTTON_VISIBLE_CLASS = 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
const DELETE_BUTTON_HIDDEN_CLASS =
  'opacity-0 scale-95 -translate-y-1 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0 group-hover:pointer-events-auto'

type NodeDeleteButtonProps = {
  id: string
  selected: boolean
  ariaLabel: string
  onDelete: () => void
}

type NodeResizerPresetProps = {
  selected: boolean
  minWidth: number
  minHeight: number
  maxWidth?: number
  maxHeight?: number
  keepAspectRatio?: boolean
  onResizeStart?: (event: ResizeDragEvent) => void
  onResizeEnd?: OnResizeEnd
  hideVisuals?: boolean
}

type NodeHeaderProps = {
  icon: ReactNode
  title: ReactNode
  right?: ReactNode
}

type NodeStateTone = 'neutral' | 'violet' | 'sky' | 'amber' | 'red'

type NodeEmptyStateProps = {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  tone?: NodeStateTone
  className?: string
}

type NodeStatusSurfaceProps = {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  tone?: NodeStateTone
  className?: string
}

const NODE_STATE_TONE_CLASS: Record<NodeStateTone, { frame: string; icon: string; title: string }> = {
  neutral: {
    frame: 'border-[var(--border-subtle)] bg-[var(--control-bg)]',
    icon: 'border-[var(--border-subtle)] bg-[var(--control-bg-hover)] text-[var(--text-secondary)]',
    title: 'text-[var(--text-primary)]',
  },
  violet: {
    frame: 'border-violet-400/14 bg-violet-400/[0.035]',
    icon: 'border-violet-300/25 bg-violet-400/10 text-violet-100',
    title: 'text-[var(--text-primary)]',
  },
  sky: {
    frame: 'border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)]',
    icon: 'border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)] text-[var(--accent-violet-strong)]',
    title: 'text-[var(--text-primary)]',
  },
  amber: {
    frame: 'border-amber-400/16 bg-amber-400/[0.045]',
    icon: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
    title: 'text-amber-100',
  },
  red: {
    frame: 'border-red-400/16 bg-red-950/10',
    icon: 'border-red-400/25 bg-red-500/10 text-red-200',
    title: 'text-red-100',
  },
}

export function NodeDeleteButton({ id, selected, ariaLabel, onDelete }: NodeDeleteButtonProps) {
  return (
    <button
      type="button"
      data-testid={`delete-node-${id}`}
      onClick={(e) => {
        e.stopPropagation()
        onDelete()
      }}
      className={`${DELETE_BUTTON_BASE_CLASS} ${selected ? DELETE_BUTTON_VISIBLE_CLASS : DELETE_BUTTON_HIDDEN_CLASS}`}
      aria-label={ariaLabel}
      tabIndex={selected ? 0 : -1}
    >
      <X className="h-4 w-4 transition-transform duration-200 ease-out group-hover:rotate-90" />
    </button>
  )
}

export function NodeResizerPreset({
  selected,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
  keepAspectRatio = false,
  onResizeStart,
  onResizeEnd,
  hideVisuals = false,
}: NodeResizerPresetProps) {
  const lineClassName = hideVisuals ? `${NODE_RESIZER_LINE_CLASS} !opacity-0` : NODE_RESIZER_LINE_CLASS
  const handleClassName = hideVisuals
    ? `${NODE_RESIZER_HANDLE_CLASS} !opacity-0 !w-4 !h-4`
    : NODE_RESIZER_HANDLE_CLASS

  return (
    <NodeResizer
      minWidth={minWidth}
      minHeight={minHeight}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      keepAspectRatio={keepAspectRatio}
      isVisible={selected}
      onResizeStart={onResizeStart}
      onResizeEnd={onResizeEnd}
      lineClassName={lineClassName}
      handleClassName={handleClassName}
    />
  )
}

export function NodeHeader({ icon, title, right }: NodeHeaderProps) {
  return (
    <div className="node-drag-handle flex cursor-grab items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2 select-none active:cursor-grabbing">
      <span className="flex-none text-[var(--text-secondary)]">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {title}
      </span>
      {right}
    </div>
  )
}

export function NodeEmptyState({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
  className = '',
}: NodeEmptyStateProps) {
  const toneClass = NODE_STATE_TONE_CLASS[tone]

  return (
    <div
      className={[
        'node-drag-handle flex flex-1 cursor-default flex-col items-center justify-center rounded-lg border px-6 py-8 text-center select-none active:cursor-grabbing',
        toneClass.frame,
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className={`mb-3 flex h-14 w-14 items-center justify-center rounded-full border shadow-[0_0_0_1px_rgba(255,255,255,0.03)] ${toneClass.icon}`}>
        {icon}
      </div>
      <p className={`text-sm font-medium ${toneClass.title}`}>{title}</p>
      {description ? <p className="mt-2 max-w-[260px] text-xs leading-5 text-[var(--text-muted)]">{description}</p> : null}
      {action ? <div className="nodrag nopan mt-4">{action}</div> : null}
    </div>
  )
}

export function NodeStatusSurface({
  icon,
  title,
  description,
  tone = 'neutral',
  className = '',
}: NodeStatusSurfaceProps) {
  const toneClass = NODE_STATE_TONE_CLASS[tone]

  return (
    <div
      className={[
        'node-drag-handle flex flex-1 cursor-default flex-col items-center justify-center rounded-lg border px-6 py-8 text-center select-none active:cursor-grabbing',
        toneClass.frame,
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className={`mb-3 flex h-14 w-14 items-center justify-center rounded-full border shadow-[0_0_0_1px_rgba(255,255,255,0.03)] ${toneClass.icon}`}>
        {icon}
      </div>
      <p className={`text-sm font-medium ${toneClass.title}`}>{title}</p>
      {description ? <p className="mt-2 max-w-[260px] text-xs leading-5 text-[var(--text-muted)]">{description}</p> : null}
    </div>
  )
}
