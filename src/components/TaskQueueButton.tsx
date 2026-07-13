import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useReactFlow } from '@xyflow/react'
import { AlertCircle, CheckCircle2, ImageIcon, LocateFixed, ListTodo, LoaderCircle, RotateCcw, Trash2, Video, X } from 'lucide-react'
import { TooltipIconButton } from '@/components/TooltipIconButton'
import { retryGenerateTask } from '@/features/generateQueue/orchestrator'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useTaskQueueStore } from '@/store/useTaskQueueStore'
import { themeClasses } from '@/styles/themeClasses'
import type { GenerateTask } from '@/types'
import { useDialogFocus } from '@/hooks/useDialogFocus'

const UI_TEXT = {
  panelTitle: '\u751f\u6210\u4efb\u52a1',
  panelEmpty: '\u5f53\u524d\u8fd8\u6ca1\u6709\u751f\u6210\u4efb\u52a1',
  itemUnit: '\u9879',
  clearFinished: '\u6e05\u7a7a\u4efb\u52a1',
  removeTask: '\u79fb\u9664\u4efb\u52a1',
  retryTask: '\u91cd\u8bd5\u4efb\u52a1',
  locateResult: '\u5b9a\u4f4d\u751f\u6210\u7ed3\u679c',
  queued: '\u6392\u961f\u4e2d',
  running: '\u751f\u6210\u4e2d',
  done: '\u5df2\u5b8c\u6210',
  error: '\u5931\u8d25',
  image: '\u56fe\u7247',
  video: '\u89c6\u9891',
  openTasks: '\u67e5\u770b\u751f\u6210\u4efb\u52a1',
  closePanel: '\u5173\u95ed\u9762\u677f',
} as const

type IconButtonProps = {
  label: string
  onClick: () => void
  icon: ReactNode
  className?: string
  testId?: string
  tooltipPlacement?: 'top' | 'bottom'
  showTooltip?: boolean
  expanded?: boolean
  controls?: string
  hasPopup?: 'dialog'
}

function formatDuration(task: GenerateTask, now: number) {
  const start = task.startedAt || task.createdAt
  const end = task.finishedAt ?? now
  const diffMs = Math.max(end - start, 0)
  const totalSeconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function ToolbarIconButton({
  label,
  onClick,
  icon,
  className,
  testId,
  tooltipPlacement = 'top',
  showTooltip = true,
  expanded,
  controls,
  hasPopup,
}: IconButtonProps) {
  return (
    <TooltipIconButton
      label={label}
      onClick={onClick}
      testId={testId}
      showTooltip={showTooltip}
      tooltipPlacement={tooltipPlacement}
      tooltipAlign="center"
      className={`${themeClasses.iconButton} h-6 w-6 rounded-md ${className ?? ''}`}
      expanded={expanded}
      controls={controls}
      hasPopup={hasPopup}
      icon={icon}
    />
  )
}

function getStatusMeta(status: GenerateTask['status']) {
  if (status === 'done') {
    return {
      label: UI_TEXT.done,
      pillClassName: 'border-emerald-400/20 bg-emerald-400/8 text-emerald-600 dark:text-emerald-200',
      icon: <CheckCircle2 className="h-3 w-3" />,
    }
  }

  if (status === 'error') {
    return {
      label: UI_TEXT.error,
      pillClassName: 'border-red-400/25 bg-red-500/10 text-red-500 dark:text-red-200',
      icon: <AlertCircle className="h-3 w-3" />,
    }
  }

  if (status === 'queued') {
    return {
      label: UI_TEXT.queued,
      pillClassName: 'border-amber-400/25 bg-amber-400/10 text-amber-600 dark:text-amber-200',
      icon: <LoaderCircle className="h-3 w-3" />,
    }
  }

  return {
    label: UI_TEXT.running,
    pillClassName: 'border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)] text-[var(--accent-violet-strong)]',
    icon: <LoaderCircle className="h-3 w-3 animate-spin" />,
  }
}

export function TaskQueueButton() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const panelRef = useDialogFocus<HTMLDivElement>(open, () => setOpen(false))
  const [now, setNow] = useState(() => Date.now())
  const reactFlow = useReactFlow()
  const selectNode = useCanvasStore((s) => s.selectNode)
  const customModels = useSettingsStore((s) => s.config.customModels)
  const tasks = useTaskQueueStore((s) => s.tasks)
  const clearFinishedTasks = useTaskQueueStore((s) => s.clearFinishedTasks)
  const removeTask = useTaskQueueStore((s) => s.removeTask)
  const activeTaskCount = tasks.filter((task) => task.status === 'queued' || task.status === 'running').length
  const hasFinishedTask = tasks.some((task) => task.status === 'done' || task.status === 'error')
  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((left, right) => {
        const leftActive = left.status === 'queued' || left.status === 'running'
        const rightActive = right.status === 'queued' || right.status === 'running'

        if (leftActive !== rightActive) {
          return leftActive ? -1 : 1
        }

        return right.createdAt - left.createdAt
      }),
    [tasks],
  )
  const modelNameById = useMemo(
    () => new Map(customModels.map((model) => [model.modelId, model.name])),
    [customModels],
  )

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
    if (tasks.length === 0) {
      return
    }

    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [tasks.length])

  const handleLocateResult = (task: GenerateTask) => {
    if (!task.previewNodeId) {
      return
    }

    const previewNode = reactFlow.getNode(task.previewNodeId)
    selectNode(task.previewNodeId)

    if (previewNode) {
      const width = typeof previewNode.width === 'number' ? previewNode.width : 300
      const height = typeof previewNode.height === 'number' ? previewNode.height : 260

      void reactFlow.setCenter(
        previewNode.position.x + width / 2,
        previewNode.position.y + height / 2,
        { duration: 360, zoom: 0.9 },
      )
    }

    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative [--font-mono:'JetBrains_Mono','Cascadia_Mono','Consolas',monospace]">
      <ToolbarIconButton
        label={UI_TEXT.openTasks}
        onClick={() => setOpen((current) => !current)}
        testId="task-queue-button"
        className="relative text-[var(--text-muted)]"
        tooltipPlacement="bottom"
        expanded={open}
        controls={open ? 'task-queue-panel' : undefined}
        hasPopup="dialog"
        icon={
          <>
            {activeTaskCount > 0 ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ListTodo className="h-3.5 w-3.5" />}
            {activeTaskCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-[var(--panel-bg-strong)] bg-[var(--accent-violet)] px-1 text-[8px] font-semibold leading-none text-white shadow">
                {activeTaskCount}
              </span>
            )}
          </>
        }
      />

      {open && (
        <div
          id="task-queue-panel"
          ref={panelRef}
          role="dialog"
          aria-label={UI_TEXT.panelTitle}
          tabIndex={-1}
          data-testid="task-queue-panel"
          className={`absolute right-0 top-full z-30 mt-2 w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-xl ${themeClasses.strongPanel}`}
        >
          <div className="border-b border-[var(--border-subtle)] px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className={`text-sm font-semibold ${themeClasses.textPrimary}`}>{UI_TEXT.panelTitle}</div>
                  <span className="inline-flex items-center rounded border border-[var(--border-subtle)] bg-[var(--control-bg)] px-1.5 py-0.5 text-[11px] font-medium leading-none text-[var(--text-muted)]">
                    {tasks.length} {UI_TEXT.itemUnit}
                  </span>
                  {tasks.length === 0 && (
                    <span className={`truncate text-xs ${themeClasses.textMuted}`}>
                      {UI_TEXT.panelEmpty}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {hasFinishedTask && (
                  <ToolbarIconButton
                    label={UI_TEXT.clearFinished}
                    onClick={clearFinishedTasks}
                    testId="clear-finished-tasks"
                    tooltipPlacement="bottom"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                  />
                )}

                <ToolbarIconButton
                  label={UI_TEXT.closePanel}
                  onClick={() => setOpen(false)}
                  tooltipPlacement="bottom"
                  icon={<X className="h-3.5 w-3.5" />}
                />
              </div>
            </div>
          </div>

          {sortedTasks.length > 0 && (
            <div className="task-queue-scrollbar max-h-[20rem] overflow-x-hidden overflow-y-auto px-2 py-2">
              <div className="space-y-1.5">
                {sortedTasks.map((task) => {
                  const statusMeta = getStatusMeta(task.status)
                  const modelDisplayName = modelNameById.get(task.model) || task.model

                  return (
                    <div
                      key={task.id}
                      data-testid={`task-row-${task.id}`}
                      className="group/task grid min-h-10 min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--control-bg)] px-2 py-1.5 transition hover:bg-[var(--control-bg-hover)]"
                      title={`${modelDisplayName} (${task.model}) ${task.displayId}`}
                    >
                      <span className="inline-flex h-5 w-12 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded border border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)] px-1 text-[11px] font-semibold leading-none text-[var(--accent-violet-strong)]">
                        {task.kind === 'video'
                          ? <Video className="h-3 w-3 shrink-0" />
                          : <ImageIcon className="h-3 w-3 shrink-0" />}
                        {task.kind === 'video' ? UI_TEXT.video : UI_TEXT.image}
                      </span>

                      <span className="flex h-4 items-center overflow-visible">
                        <span className="block translate-y-px font-mono text-[10px] font-medium leading-[1.2] text-[var(--text-muted)]">
                          {task.displayId}
                        </span>
                      </span>

                      <span className="flex h-5 min-w-0 items-center overflow-visible">
                        <span className="block min-w-0 truncate text-xs font-medium leading-tight text-[var(--text-primary)]">{modelDisplayName}</span>
                      </span>

                      <div className="grid shrink-0 grid-cols-[1.25rem_2.75rem_3.5rem_1.5rem_1.5rem] items-center gap-1.5">
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
                          task.status === 'done'
                            ? 'text-emerald-300'
                            : task.status === 'error'
                              ? 'text-red-300'
                              : 'text-violet-300'
                        }`}>
                          {statusMeta.icon}
                        </span>

                        <span className="inline-flex w-11 items-center justify-end text-[11px] font-semibold leading-none tabular-nums text-[var(--text-secondary)]">
                          {formatDuration(task, now)}
                        </span>

                        <span className={`inline-flex h-5 min-w-12 items-center justify-center gap-1 whitespace-nowrap rounded border px-1 text-[11px] font-semibold leading-none ${statusMeta.pillClassName}`}>
                          {statusMeta.label}
                        </span>

                        <span className="flex h-6 w-6 items-center justify-center">
                          {task.status === 'done' && task.previewNodeId ? (
                            <ToolbarIconButton
                              label={UI_TEXT.locateResult}
                              onClick={() => handleLocateResult(task)}
                              testId={`locate-task-result-${task.id}`}
                              showTooltip={false}
                              icon={<LocateFixed className="h-3.5 w-3.5" />}
                            />
                          ) : task.status === 'error' ? (
                            <ToolbarIconButton
                              label={UI_TEXT.retryTask}
                              onClick={() => retryGenerateTask(task.id)}
                              testId={`retry-task-${task.id}`}
                              showTooltip={false}
                              icon={<RotateCcw className="h-3.5 w-3.5" />}
                            />
                          ) : null}
                        </span>

                        <span className="flex h-6 w-6 items-center justify-center">
                          {(task.status === 'done' || task.status === 'error') && (
                            <ToolbarIconButton
                              label={UI_TEXT.removeTask}
                              onClick={() => removeTask(task.id)}
                              className="hover:border-red-400/20 hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-200"
                              showTooltip={false}
                              icon={<Trash2 className="h-3.5 w-3.5" />}
                            />
                          )}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
