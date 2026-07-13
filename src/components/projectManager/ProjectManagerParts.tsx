import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  Archive,
  ArchiveRestore,
  CheckSquare,
  Clock3,
  Copy,
  Download,
  MoreHorizontal,
  PenSquare,
  Trash2,
} from 'lucide-react'
import type { ProjectManagerStatusView } from '@/features/projectManager/projectManagerStatus'
import { themeClasses } from '@/styles/themeClasses'
import { isImageSourceNodeType, type ProjectRecord } from '@/types'
import type { ProjectViewMode } from './projectManagerModel'
import { handleMenuKeyboard } from '@/utils/menuKeyboard'
import { useDialogFocus } from '@/hooks/useDialogFocus'

const PROJECT_STATUS_TONE_CLASS: Record<ProjectManagerStatusView['tone'], string> = {
  neutral: 'border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-muted)]',
  success: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200',
  warning: 'border-amber-400/25 bg-amber-500/10 text-amber-700 dark:text-amber-200',
  danger: 'border-red-400/25 bg-red-500/10 text-red-600 dark:text-red-200',
  info: 'border-violet-400/25 bg-violet-500/10 text-violet-600 dark:text-violet-200',
}

function ProjectStatusBadge({ status }: { status: ProjectManagerStatusView }) {
  return (
    <span
      title={status.title}
      className={`rounded-full border px-1.5 py-0.5 text-[8px] font-medium ${PROJECT_STATUS_TONE_CLASS[status.tone]}`}
      data-testid="project-manager-active-status"
      data-status-label={status.label}
    >
      {status.label}
    </span>
  )
}

function formatRelativeTime(value: number) {
  const diffMs = Math.max(Date.now() - value, 0)
  const minutes = Math.floor(diffMs / 60000)

  if (minutes < 1) {
    return '刚刚'
  }

  if (minutes < 60) {
    return `${minutes} 分钟前`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} 小时前`
  }

  const days = Math.floor(hours / 24)
  if (days < 30) {
    return `${days} 天前`
  }

  return new Date(value).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
}

function formatTimestamp(value: number) {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function getProjectNodePreview(project: ProjectRecord) {
  const nodes = project.workingSnapshot.canvas.nodes

  if (nodes.length === 0) {
    return []
  }

  const bounds = nodes.reduce((accumulator, node) => {
    const width = typeof node.width === 'number' ? node.width : 120
    const height = typeof node.height === 'number' ? node.height : 90

    return {
      minX: Math.min(accumulator.minX, node.position.x),
      minY: Math.min(accumulator.minY, node.position.y),
      maxX: Math.max(accumulator.maxX, node.position.x + width),
      maxY: Math.max(accumulator.maxY, node.position.y + height),
    }
  }, {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  })

  const width = Math.max(bounds.maxX - bounds.minX, 1)
  const height = Math.max(bounds.maxY - bounds.minY, 1)

  return nodes.slice(0, 8).map((node, index) => {
    const nodeWidth = typeof node.width === 'number' ? node.width : 120
    const nodeHeight = typeof node.height === 'number' ? node.height : 90
    const left = ((node.position.x - bounds.minX) / width) * 100
    const top = ((node.position.y - bounds.minY) / height) * 100
    const previewWidth = (nodeWidth / width) * 100
    const previewHeight = (nodeHeight / height) * 100

    return {
      id: `${node.id}-${index}`,
      left: `${Math.max(0, Math.min(left, 88))}%`,
      top: `${Math.max(0, Math.min(top, 82))}%`,
      width: `${Math.max(10, Math.min(previewWidth, 52))}%`,
      height: `${Math.max(8, Math.min(previewHeight, 34))}%`,
      tone:
        node.type === 'generateNode'
          ? 'bg-violet-400/24'
          : node.type === 'textNode'
            ? 'bg-[var(--control-bg-hover)]'
            : isImageSourceNodeType(node.type)
              ? 'bg-violet-400/16'
              : 'bg-[var(--control-bg)]',
    }
  })
}

export function ProjectNameDialog({
  open,
  title,
  defaultValue,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  defaultValue: string
  onClose: () => void
  onSubmit: (value: string) => void
}) {
  const [value, setValue] = useState(defaultValue)
  const dialogRef = useDialogFocus<HTMLDivElement>(open, onClose, '[data-testid="project-name-input"]')

  if (!open) {
    return null
  }

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/48 px-4 backdrop-blur-sm">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="project-name-dialog-title" tabIndex={-1} className={`w-full max-w-sm p-5 ${themeClasses.strongPanel}`}>
        <div id="project-name-dialog-title" className={`text-sm font-semibold tracking-[-0.02em] ${themeClasses.textPrimary}`}>{title}</div>
        <p className={`mt-1 text-xs leading-5 ${themeClasses.textMuted}`}>名称会立即同步到项目列表。</p>

        <input
          autoFocus
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className={`mt-4 h-10 w-full px-4 text-sm ${themeClasses.input}`}
          placeholder="输入名称"
          data-testid="project-name-input"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`${themeClasses.secondaryButton} h-9 px-4 text-sm`}
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onSubmit(value)}
            className="h-9 rounded-2xl bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--canvas-bg)] transition hover:opacity-90"
            data-testid="project-name-submit"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  )
}

export function SidebarButton({
  label,
  active,
  icon,
  onClick,
}: {
  label: string
  active: boolean
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={active
        ? 'relative flex h-8 w-full items-center gap-2 rounded-2xl bg-[var(--control-bg-hover)] px-3 text-[13px] font-semibold text-[var(--text-primary)]'
        : 'relative flex h-8 w-full items-center gap-2 rounded-2xl px-3 text-[13px] text-[var(--text-secondary)] transition hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]'}
    >
      <span className="relative z-10">{icon}</span>
      <span className="relative z-10">{label}</span>
    </button>
  )
}

function ProjectCardActionsMenu({
  projectId,
  className = 'relative',
  onRename,
  onDuplicate,
  onExport,
  archived,
  onArchive,
  onRestore,
  onDelete,
}: {
  projectId: string
  className?: string
  onRename: () => void
  onDuplicate: () => void
  onExport: () => void
  archived: boolean
  onArchive: () => void
  onRestore: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()

  useEffect(() => {
    if (open) window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
  }, [open])

  const closeMenu = () => {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const handleAction = (action: () => void) => {
    setOpen(false)
    action()
  }

  return (
    <div
      className={className}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false)
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="更多项目操作"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
        data-testid={`project-more-${projectId}`}
        className={`${themeClasses.iconButton} h-7 w-7 backdrop-blur-md`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open ? (
        <div id={menuId} ref={menuRef} role="menu" aria-label="项目操作" onKeyDown={(event) => handleMenuKeyboard(event.nativeEvent, menuRef.current, closeMenu)} className={`absolute right-0 top-full z-40 mt-1.5 w-28 overflow-hidden p-1 ${themeClasses.strongPanel}`}>
          {!archived ? (
            <>
              <button
                role="menuitem"
                type="button"
                onClick={() => handleAction(onRename)}
                data-testid={`project-rename-${projectId}`}
                className="flex h-7 w-full items-center gap-2 rounded-lg px-2 text-left text-[10px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]"
              >
                <PenSquare className="h-3 w-3" />
                重命名
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => handleAction(onDuplicate)}
                data-testid={`project-duplicate-${projectId}`}
                className="flex h-7 w-full items-center gap-2 rounded-lg px-2 text-left text-[10px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]"
              >
                <Copy className="h-3 w-3" />
                复制项目
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => handleAction(onExport)}
                data-testid={`project-export-${projectId}`}
                className="flex h-7 w-full items-center gap-2 rounded-lg px-2 text-left text-[10px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]"
              >
                <Download className="h-3 w-3" />
                导出项目
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => handleAction(onArchive)}
                data-testid={`project-archive-${projectId}`}
                className="flex h-7 w-full items-center gap-2 rounded-lg px-2 text-left text-[10px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]"
              >
                <Archive className="h-3 w-3" />
                归档
              </button>
            </>
          ) : (
            <>
              <button
                role="menuitem"
                type="button"
                onClick={() => handleAction(onRestore)}
                data-testid={`project-restore-${projectId}`}
                className="flex h-7 w-full items-center gap-2 rounded-lg px-2 text-left text-[10px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]"
              >
                <ArchiveRestore className="h-3 w-3" />
                恢复
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => handleAction(onExport)}
                data-testid={`project-export-${projectId}`}
                className="flex h-7 w-full items-center gap-2 rounded-lg px-2 text-left text-[10px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]"
              >
                <Download className="h-3 w-3" />
                导出项目
              </button>
            </>
          )}
          <button
            role="menuitem"
            type="button"
            onClick={() => handleAction(onDelete)}
            data-testid={`project-delete-${projectId}`}
            className="flex h-7 w-full items-center gap-2 rounded-lg px-2 text-left text-[10px] font-medium text-red-500 transition hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 className="h-3 w-3" />
            删除
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function ProjectPreviewCard({
  project,
  active,
  batchMode,
  selected,
  viewMode,
  onOpen,
  onRename,
  onDuplicate,
  onExport,
  onArchive,
  onRestore,
  onDelete,
  onToggleSelect,
  status,
}: {
  project: ProjectRecord
  active: boolean
  batchMode: boolean
  selected: boolean
  viewMode: ProjectViewMode
  onOpen: () => void
  onRename: () => void
  onDuplicate: () => void
  onExport: () => void
  onArchive: () => void
  onRestore: () => void
  onDelete: () => void
  onToggleSelect: () => void
  status?: ProjectManagerStatusView | null
}) {
  const previewNodes = getProjectNodePreview(project)
  const archived = Boolean(project.archivedAt)

  if (viewMode === 'list') {
    return (
      <div className={active
        ? 'group relative flex items-center gap-3 rounded-[20px] border border-violet-400/30 bg-violet-400/8 p-3'
        : 'group relative flex items-center gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--control-bg)] p-3 transition hover:border-violet-400/30 hover:bg-[var(--control-bg-hover)]'}>
        {batchMode ? (
          <button
            type="button"
            onClick={onToggleSelect}
            aria-label={selected ? '取消选择' : '选择项目'}
            className={selected
              ? 'inline-flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500 text-white'
              : 'inline-flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-muted)]'}
          >
            {selected ? <CheckSquare className="h-4 w-4" /> : <span className="h-4 w-4 rounded-[4px] border border-current" />}
          </button>
        ) : null}

        <button
          type="button"
          onClick={batchMode ? onToggleSelect : archived ? undefined : onOpen}
          aria-label={batchMode ? (selected ? '取消选择项目' : '选择项目') : undefined}
          data-testid={`project-open-${project.id}`}
          className="min-w-0 flex flex-1 items-center gap-3 text-left"
        >
          <div className="relative h-16 w-22 shrink-0 overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--panel-bg-strong)]">
            <div className="absolute inset-[8px] rounded-[10px] bg-[var(--control-bg)]" />
            {previewNodes.map((previewNode) => (
              <div
                key={previewNode.id}
                className={`absolute rounded-md shadow-[0_8px_18px_rgba(0,0,0,0.18)] ${previewNode.tone}`}
                style={{
                  left: previewNode.left,
                  top: previewNode.top,
                  width: previewNode.width,
                  height: previewNode.height,
                }}
              />
            ))}
            {previewNodes.length === 0 ? (
              <div className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-[var(--control-bg-hover)]" />
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-[13px] font-medium text-[var(--text-primary)]">{project.name}</div>
              {active ? (
                <span className="rounded-full border border-violet-400/25 bg-violet-400/10 px-1.5 py-0.5 text-[9px] font-medium text-violet-500">
                  当前
                </span>
              ) : null}
              {archived ? (
                <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--control-bg-hover)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-muted)]">
                  已归档
                </span>
              ) : null}
              {status ? <ProjectStatusBadge status={status} /> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-[var(--text-muted)]">
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-2.5 w-2.5" />
                {formatRelativeTime(project.lastOpenedAt)}
              </span>
              <span>{formatTimestamp(project.updatedAt)}</span>
            </div>
          </div>
        </button>

        {!batchMode ? (
          <ProjectCardActionsMenu
            projectId={project.id}
            className="relative opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"
            onRename={onRename}
            onDuplicate={onDuplicate}
            onExport={onExport}
            archived={archived}
            onArchive={onArchive}
            onRestore={onRestore}
            onDelete={onDelete}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className={active
      ? 'group relative w-full max-w-[14rem] rounded-[22px] bg-transparent p-0 shadow-none'
      : 'group relative w-full max-w-[14rem] rounded-[22px] bg-transparent p-0 shadow-none transition duration-200 hover:-translate-y-0.5'}>
      {batchMode ? (
        <button
          type="button"
          onClick={onToggleSelect}
          aria-label={selected ? '取消选择' : '选择项目'}
          className={selected
            ? 'absolute right-3 top-3 z-20 inline-flex h-7.5 w-7.5 items-center justify-center rounded-lg border border-violet-400/30 bg-violet-500 text-white'
            : 'absolute right-3 top-3 z-20 inline-flex h-7.5 w-7.5 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-bg)] text-[var(--text-muted)] backdrop-blur-md'}
        >
          {selected ? <CheckSquare className="h-4 w-4" /> : <span className="h-4 w-4 rounded-[4px] border border-current" />}
        </button>
      ) : (
        <ProjectCardActionsMenu
          projectId={project.id}
          className="absolute right-3 top-3 z-20 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"
          onRename={onRename}
          onDuplicate={onDuplicate}
          onExport={onExport}
          archived={archived}
          onArchive={onArchive}
          onRestore={onRestore}
          onDelete={onDelete}
        />
      )}

      <button
        type="button"
        onClick={batchMode ? onToggleSelect : archived ? undefined : onOpen}
        aria-label={batchMode ? (selected ? '取消选择项目' : '选择项目') : undefined}
        data-testid={`project-open-${project.id}`}
        className="block w-full text-left"
      >
        <div className="relative aspect-square overflow-hidden rounded-[20px] border border-[var(--border-subtle)] bg-[var(--panel-bg-strong)] shadow-[var(--shadow-panel)] transition duration-200 group-hover:border-violet-400/30">
          <div className="absolute inset-[10px] rounded-[14px] bg-[var(--control-bg)]" />
          <div className="absolute inset-x-[18%] top-[16%] h-[48%] rounded-[18px] bg-violet-400/5 blur-2xl" />
          {previewNodes.map((previewNode) => (
            <div
              key={previewNode.id}
              className={`absolute rounded-md shadow-[0_10px_22px_rgba(0,0,0,0.18)] ${previewNode.tone}`}
              style={{
                left: previewNode.left,
                top: previewNode.top,
                width: previewNode.width,
                height: previewNode.height,
              }}
            />
          ))}

          {previewNodes.length === 0 ? (
            <div className="absolute left-1/2 top-[35%] h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--control-bg-hover)]" />
          ) : null}

          <div className="absolute inset-0 rounded-[20px] bg-gradient-to-tr from-transparent via-transparent to-transparent transition duration-300 group-hover:from-violet-400/4 group-hover:to-violet-400/8" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--panel-bg-strong)] via-[var(--panel-bg)] to-transparent" />
          <div className="absolute inset-x-4 bottom-2.5">
            <div className="flex items-center gap-1.5">
              <div className="truncate text-[12px] font-medium text-[var(--text-primary)]">{project.name}</div>
              {active ? (
                <span className="rounded-full border border-violet-400/25 bg-violet-400/10 px-1.5 py-0.5 text-[8px] font-medium text-violet-500">
                  当前
                </span>
              ) : null}
              {archived ? (
                <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--control-bg-hover)] px-1.5 py-0.5 text-[8px] font-medium text-[var(--text-muted)]">
                  已归档
                </span>
              ) : null}
              {status ? <ProjectStatusBadge status={status} /> : null}
            </div>
            <div className="mt-1 flex items-center gap-1 text-[9px] text-[var(--text-muted)]">
              <Clock3 className="h-2.5 w-2.5" />
              <span className="font-mono">{formatRelativeTime(project.lastOpenedAt)}</span>
            </div>
          </div>
        </div>
      </button>
    </div>
  )
}
