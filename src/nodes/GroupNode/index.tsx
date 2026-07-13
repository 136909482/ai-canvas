import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useStore } from '@xyflow/react'
import { FolderKanban, PencilLine } from 'lucide-react'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import type { AppNodeProps, GroupNodeColor } from '@/types'
import { NodeDeleteButton, NodeResizerPreset } from '../nodeShell'
import { areNodeContentPropsEqual } from '../nodePropComparators'

type GroupNodeProps = AppNodeProps<'groupNode'>

const UI_TEXT = {
  deleteNode: '\u5220\u9664\u7F16\u7EC4',
  fallbackLabel: '\u7F16\u7EC4',
  renameGroup: '\u91CD\u547D\u540D\u7F16\u7EC4',
} as const

type GroupColorPreset = {
  id: GroupNodeColor
  label: string
  accent: string
  accentBorder: string
  surface: string
  iconColor: string
}

const GROUP_COLOR_PRESETS: GroupColorPreset[] = [
  {
    id: 'violet',
    label: '\u7D2B\u8272',
    accent: '#8648a0',
    accentBorder: 'rgba(134, 72, 160, 0.7)',
    surface: 'color-mix(in srgb, #8648a0 18%, transparent)',
    iconColor: '#c4b5fd',
  },
  {
    id: 'blue',
    label: '\u84DD\u8272',
    accent: '#3d6fa7',
    accentBorder: 'rgba(61, 111, 167, 0.7)',
    surface: 'color-mix(in srgb, #3d6fa7 18%, transparent)',
    iconColor: '#8bb7e8',
  },
  {
    id: 'green',
    label: '\u7EFF\u8272',
    accent: '#4d8a5a',
    accentBorder: 'rgba(77, 138, 90, 0.7)',
    surface: 'color-mix(in srgb, #4d8a5a 18%, transparent)',
    iconColor: '#a7f3d0',
  },
  {
    id: 'amber',
    label: '\u9EC4\u8272',
    accent: '#a4973b',
    accentBorder: 'rgba(164, 151, 59, 0.7)',
    surface: 'color-mix(in srgb, #a4973b 18%, transparent)',
    iconColor: '#fde68a',
  },
  {
    id: 'rose',
    label: '\u7EA2\u8272',
    accent: '#964243',
    accentBorder: 'rgba(150, 66, 67, 0.7)',
    surface: 'color-mix(in srgb, #964243 18%, transparent)',
    iconColor: '#fecdd3',
  },
  {
    id: 'slate',
    label: '\u7070\u8272',
    accent: '#8f8f88',
    accentBorder: 'rgba(143, 143, 136, 0.58)',
    surface: 'color-mix(in srgb, #8f8f88 14%, transparent)',
    iconColor: 'var(--text-secondary)',
  },
]

const DEFAULT_GROUP_COLOR: GroupNodeColor = 'violet'
const selectZoom = (state: { transform: [number, number, number] }) => state.transform[2]
const GROUP_NODE_BASE_CLASS =
  'node-shell group relative flex h-full w-full flex-col overflow-visible rounded-lg border bg-[var(--group-surface)] text-[var(--text-primary)] shadow-none [contain:paint] [backface-visibility:hidden]'
const GROUP_NODE_SELECTED_CLASS = 'border-[color:var(--group-accent-border)]'
const GROUP_NODE_UNSELECTED_CLASS = 'border-[color:var(--group-accent-border-muted)]'

function getGroupColorPreset(color: unknown) {
  return GROUP_COLOR_PRESETS.find((preset) => preset.id === color) ?? GROUP_COLOR_PRESETS[0]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export const GroupNode = memo(function GroupNode({ id, data, selected }: GroupNodeProps) {
  const zoom = useStore(selectZoom)
  const deleteNode = useCanvasStore((s) => s.deleteNode)
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)
  const beginTransaction = useHistoryStore((s) => s.beginTransaction)
  const commitTransaction = useHistoryStore((s) => s.commitTransaction)
  const runTracked = useHistoryStore((s) => s.runTracked)
  const label = typeof data.label === 'string' && data.label.trim() ? data.label : UI_TEXT.fallbackLabel
  const [isEditing, setIsEditing] = useState(false)
  const [draftLabel, setDraftLabel] = useState(label)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const colorPreset = getGroupColorPreset(data.color ?? DEFAULT_GROUP_COLOR)
  const groupStyle = {
    '--group-accent': colorPreset.accent,
    '--group-accent-border': colorPreset.accentBorder,
    '--group-accent-border-muted': colorPreset.accentBorder.replace('0.7', '0.42').replace('0.58', '0.34'),
    '--group-surface': colorPreset.surface,
    '--group-icon-color': colorPreset.iconColor,
  } as CSSProperties
  const labelScale = clamp(1 / Math.max(zoom, 0.01), 0.55, 24)
  const containerClassName = [
    GROUP_NODE_BASE_CLASS,
    selected ? GROUP_NODE_SELECTED_CLASS : GROUP_NODE_UNSELECTED_CLASS,
    'cursor-grab active:cursor-grabbing',
  ].join(' ')

  useEffect(() => {
    setDraftLabel(label)
  }, [label])

  useEffect(() => {
    if (!isEditing) {
      return
    }

    inputRef.current?.focus()
    inputRef.current?.select()
  }, [isEditing])

  const commitRename = () => {
    const nextLabel = draftLabel.trim() || UI_TEXT.fallbackLabel
    updateNodeData(id, { label: nextLabel })
    setDraftLabel(nextLabel)
    setIsEditing(false)
    commitTransaction()
  }

  const cancelRename = () => {
    setDraftLabel(label)
    updateNodeData(id, { label })
    setIsEditing(false)
    commitTransaction()
  }

  const beginRename = () => {
    beginTransaction()
    setDraftLabel(label)
    setIsEditing(true)
  }

  return (
    <div
      data-testid={`node-${id}`}
      className={containerClassName}
      style={groupStyle}
    >
      <NodeDeleteButton
        id={id}
        selected={selected}
        ariaLabel={UI_TEXT.deleteNode}
        onDelete={() => runTracked(() => deleteNode(id))}
      />

      <NodeResizerPreset
        selected={selected}
        minWidth={280}
        minHeight={220}
        hideVisuals
      />

      <div
        className="nodrag nopan absolute left-0 top-0 z-20 flex items-center gap-1.5 px-0 pb-1 text-[12px] font-medium text-[var(--text-primary)]"
        style={{
          transform: `translateY(-100%) scale(${labelScale})`,
          transformOrigin: 'left bottom',
        }}
      >
        <FolderKanban className="h-3.5 w-3.5 text-[var(--group-icon-color)]" />
        {isEditing ? (
          <input
            ref={inputRef}
            value={draftLabel}
            onChange={(event) => {
              const nextLabel = event.target.value
              setDraftLabel(nextLabel)
              updateNodeData(id, { label: nextLabel })
            }}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitRename()
                return
              }

              if (event.key === 'Escape') {
                event.preventDefault()
                cancelRename()
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            className="nodrag h-6 w-40 max-w-[220px] rounded border border-[var(--border-subtle)] bg-[var(--panel-bg-strong)] px-2 text-[12px] font-medium leading-none tracking-normal text-[var(--text-primary)] outline-none ring-0 placeholder:text-[var(--text-muted)] focus:border-[var(--accent-violet-strong)]"
            aria-label={UI_TEXT.renameGroup}
          />
        ) : (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              beginRename()
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
              beginRename()
            }}
            className="nodrag flex h-5 max-w-[220px] shrink-0 items-center rounded px-0 text-left leading-none tracking-normal outline-none transition-colors hover:text-[var(--accent-violet-strong)] focus-visible:text-[var(--accent-violet-strong)]"
            aria-label={UI_TEXT.renameGroup}
          >
            <span className="block min-w-0 truncate">{label}</span>
          </button>
        )}
        {!isEditing && (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              beginRename()
            }}
            className={`flex h-5 w-5 items-center justify-center rounded border border-transparent text-[var(--text-muted)] transition-all hover:border-[var(--accent-violet-muted)] hover:bg-[var(--accent-violet-soft)] hover:text-[var(--accent-violet-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-violet-soft)] ${
              selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            aria-label={UI_TEXT.renameGroup}
          >
            <PencilLine className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="pointer-events-none flex h-full min-h-0 flex-1" />
    </div>
  )
}, areNodeContentPropsEqual)
