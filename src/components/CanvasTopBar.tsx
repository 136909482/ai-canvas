import { ChevronLeft, ChevronRight, Download, FolderDown, Grid3X3, Loader2, Moon, Save, Sun, Upload } from 'lucide-react'
import { TooltipIconButton } from '@/components/TooltipIconButton'
import { platformBridge } from '@/platform'
import { selectHasCanvasContent, useCanvasStore } from '@/store/useCanvasStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { useFeedbackStore } from '@/store/useFeedbackStore'
import { useProjectStore } from '@/store/useProjectStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useSettingsDialogStore } from '@/store/useSettingsDialogStore'
import { themeClasses } from '@/styles/themeClasses'
import type { ProjectPersistenceStatus } from '@/features/projectManager/persistenceStatus'

function formatStatusTime(value: number) {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function getNextThemeMode(themeMode: 'dark' | 'light' | 'system') {
  return themeMode === 'light' ? 'dark' : 'light'
}

function getThemeLabel(themeMode: 'dark' | 'light' | 'system') {
  return themeMode === 'light' ? '切换到暗色主题' : '切换到浅色主题'
}

function getPersistenceStatusView(status: ProjectPersistenceStatus) {
  switch (status.kind) {
    case 'no-project':
      return {
        text: '没有项目',
        tone: themeClasses.textMuted,
        title: '当前还没有打开项目。',
      }
    case 'restoring':
      return {
        text: '恢复中...',
        tone: 'text-[var(--accent-violet-strong)]',
        title: '正在恢复当前项目画布和任务队列。',
      }
    case 'storage-required':
      return {
        text: '未配置缓存目录',
        tone: 'text-amber-500 dark:text-amber-200',
        title: '请在存储设置中选择缓存目录，项目才能写入本地工作区。',
      }
    case 'saving':
      return {
        text: '保存中...',
        tone: 'text-[var(--accent-violet-strong)]',
        title: '正在写入当前项目文件。',
      }
    case 'error':
      return {
        text: '上次保存失败',
        tone: 'text-red-500 dark:text-red-200',
        title: status.message,
      }
    case 'pending-autosave':
      return {
        text: '待自动保存',
        tone: 'text-amber-500 dark:text-amber-200',
        title: '当前更改还未写入工作区文件，稍后会自动保存。',
      }
    case 'auto-saved-manual-dirty':
      return {
        text: `自动保存 ${formatStatusTime(status.at)} · 未手动保存`,
        tone: 'text-amber-500 dark:text-amber-200',
        title: `更改已在 ${new Date(status.at).toLocaleString('zh-CN')} 自动写入工作区，但尚未手动保存为项目保存点。`,
      }
    case 'auto-saved':
      return {
        text: `自动保存 ${formatStatusTime(status.at)}`,
        tone: themeClasses.textMuted,
        title: `上次自动保存：${new Date(status.at).toLocaleString('zh-CN')}`,
      }
    case 'manual-saved':
      return {
        text: `已保存 ${formatStatusTime(status.at)}`,
        tone: themeClasses.textMuted,
        title: `上次手动保存：${new Date(status.at).toLocaleString('zh-CN')}`,
      }
    default:
      return {
        text: '尚未保存',
        tone: themeClasses.textMuted,
        title: '当前项目还没有写入记录。',
      }
  }
}

type CanvasTopBarProps = {
  compact?: boolean
  onToggleCollapse?: () => void
}

type CanvasQuickActionsProps = {
  includeWorkflowActions?: boolean
  tooltipAlign?: 'start' | 'center' | 'end'
}

export function CanvasQuickActions({ includeWorkflowActions = true, tooltipAlign = 'center' }: CanvasQuickActionsProps) {
  const openSettings = useSettingsDialogStore((state) => state.open)
  const activeProject = useProjectStore((state) => state.getActiveProject())
  const saveActiveProject = useProjectStore((state) => state.saveActiveProject)
  const syncActiveWorkingSnapshot = useProjectStore((state) => state.syncActiveWorkingSnapshot)
  const getSnapshot = useCanvasStore((state) => state.getSnapshot)
  const replaceSnapshot = useCanvasStore((state) => state.replaceSnapshot)
  const hasCanvasContent = useCanvasStore(selectHasCanvasContent)
  const clearHistory = useHistoryStore((state) => state.clearHistory)
  const themeMode = useSettingsStore((state) => state.config.storage.themeMode)
  const canvasGridEnabled = useSettingsStore((state) => state.config.storage.canvasGridEnabled)
  const setStorageSettings = useSettingsStore((state) => state.setStorageSettings)
  const persistWorkspaceConfig = useSettingsStore((state) => state.persistWorkspaceConfig)
  const notify = useFeedbackStore((state) => state.notify)
  const confirm = useFeedbackStore((state) => state.confirm)

  const handleSaveProject = async () => {
    try {
      const result = await saveActiveProject()
      const thumbnailBackfillCount = useProjectStore.getState().lastThumbnailBackfillCount

      if (result === 'storage-required') {
        notify({ tone: 'warning', title: '需要缓存目录', message: '首次保存前请先设置缓存目录。' })
        openSettings('storage')
      } else if (result === 'saved' && thumbnailBackfillCount > 0) {
        notify({
          tone: 'success',
          title: '性能缩略图已生成',
          message: `已为旧项目补齐 ${thumbnailBackfillCount} 张画布缩略图，后续拖动画布会优先使用这些资源。`,
        })
      }
    } catch {
      // The project store reports the structured diagnostic and user feedback.
    }
  }

  const handleExportWorkflow = async () => {
    const suggestedName = `${activeProject?.name || 'workflow'}.json`
    await platformBridge.exportWorkflowJson(getSnapshot(), suggestedName)
  }

  const handleImportWorkflow = async () => {
    if (hasCanvasContent) {
      const confirmed = await confirm({
        title: '导入工作流',
        message: '导入工作流会替换当前画布，确定继续吗？',
        confirmLabel: '继续导入',
      })

      if (!confirmed) {
        return
      }
    }

    try {
      const { snapshot } = await platformBridge.importWorkflowJson()
      replaceSnapshot(snapshot)
      clearHistory()
      syncActiveWorkingSnapshot()
    } catch (error) {
      if (error instanceof Error && error.message === '未选择工作流文件') {
        return
      }

      notify({ tone: 'error', title: '导入失败', message: error instanceof Error ? error.message : String(error) })
    }
  }

  const handleToggleTheme = async () => {
    setStorageSettings({ themeMode: getNextThemeMode(themeMode) })
    await persistWorkspaceConfig().catch(() => undefined)
  }

  const handleToggleCanvasGrid = async () => {
    setStorageSettings({ canvasGridEnabled: !canvasGridEnabled })
    await persistWorkspaceConfig().catch(() => undefined)
  }

  const iconButtonClass = `${themeClasses.iconButton} h-6 w-6 rounded-md disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:text-[color-mix(in_srgb,var(--text-muted)_55%,transparent)]`

  return (
    <>
      <TooltipIconButton
        label="保存项目"
        onClick={() => {
          void handleSaveProject()
        }}
        testId="save-project-button"
        tooltipAlign={tooltipAlign}
        className={iconButtonClass}
        icon={<Save className="h-3.5 w-3.5" />}
      />
      {includeWorkflowActions ? (
        <>
          <TooltipIconButton
            label="保存工作流"
            onClick={() => {
              void handleExportWorkflow()
            }}
            testId="export-workflow-button"
            tooltipAlign={tooltipAlign}
            className={iconButtonClass}
            icon={<Download className="h-3.5 w-3.5" />}
          />
          <TooltipIconButton
            label="导入工作流"
            onClick={() => {
              void handleImportWorkflow()
            }}
            testId="import-workflow-button"
            tooltipAlign={tooltipAlign}
            className={iconButtonClass}
            icon={<Upload className="h-3.5 w-3.5" />}
          />
        </>
      ) : null}
      <TooltipIconButton
        label={getThemeLabel(themeMode)}
        onClick={() => {
          void handleToggleTheme()
        }}
        testId="toggle-theme-button"
        tooltipAlign={tooltipAlign}
        className={iconButtonClass}
        icon={themeMode === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
      />
      <TooltipIconButton
        label={canvasGridEnabled ? '隐藏画布网格' : '显示画布网格'}
        onClick={() => {
          void handleToggleCanvasGrid()
        }}
        testId="toggle-canvas-grid-button"
        tooltipAlign={tooltipAlign}
        className={`${iconButtonClass} ${canvasGridEnabled ? themeClasses.iconButtonActive : ''}`}
        pressed={canvasGridEnabled}
        icon={<Grid3X3 className="h-3.5 w-3.5" />}
      />
    </>
  )
}

export function CanvasTopBar({ compact = false, onToggleCollapse }: CanvasTopBarProps) {
  const activeProject = useProjectStore((state) => state.getActiveProject())
  const getActivePersistenceStatus = useProjectStore((state) => state.getActivePersistenceStatus)
  const hasUnsavedChanges = useProjectStore((state) => state.hasUnsavedChanges())
  const hasPersistedChanges = useProjectStore((state) => state.hasPersistedChanges())
  const syncActiveWorkingSnapshot = useProjectStore((state) => state.syncActiveWorkingSnapshot)
  const notify = useFeedbackStore((state) => state.notify)
  const confirm = useFeedbackStore((state) => state.confirm)
  const getSnapshot = useCanvasStore((state) => state.getSnapshot)
  const replaceSnapshot = useCanvasStore((state) => state.replaceSnapshot)
  const hasCanvasContent = useCanvasStore(selectHasCanvasContent)
  const clearHistory = useHistoryStore((state) => state.clearHistory)
  const persistenceStatus = getActivePersistenceStatus()

  const handleExportWorkflow = async () => {
    const suggestedName = `${activeProject?.name || 'workflow'}.json`
    await platformBridge.exportWorkflowJson(getSnapshot(), suggestedName)
  }

  const handleImportWorkflow = async () => {
    if (hasCanvasContent) {
      const confirmed = await confirm({
        title: '导入工作流',
        message: '导入工作流会替换当前画布，确定继续吗？',
        confirmLabel: '继续导入',
      })

      if (!confirmed) {
        return
      }
    }

    try {
      const { snapshot } = await platformBridge.importWorkflowJson()
      replaceSnapshot(snapshot)
      clearHistory()
      syncActiveWorkingSnapshot()
    } catch (error) {
      if (error instanceof Error && error.message === '未选择工作流文件') {
        return
      }

      notify({ tone: 'error', title: '导入失败', message: error instanceof Error ? error.message : String(error) })
    }
  }

  const toggleLabel = compact ? '展开工具栏' : '折叠工具栏'
  const projectName = activeProject?.name || '未命名'

  const status = getPersistenceStatusView(persistenceStatus)

  const iconButtonClass = `${themeClasses.iconButton} h-6 w-6 rounded-md disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:text-[color-mix(in_srgb,var(--text-muted)_55%,transparent)]`

  return (
    <div className={`flex items-center gap-0.5 p-1 ${themeClasses.compactFloatingPanel}`}>
      {!compact ? (
        <>
          <TooltipIconButton
            label="保存工作流"
            onClick={() => {
              void handleExportWorkflow()
            }}
            testId="export-workflow-button"
            tooltipAlign="start"
            className={iconButtonClass}
            icon={<Download className="h-3 w-3" />}
          />
          <TooltipIconButton
            label="导入工作流"
            onClick={() => {
              void handleImportWorkflow()
            }}
            testId="import-workflow-button"
            tooltipAlign="start"
            className={iconButtonClass}
            icon={<Upload className="h-3 w-3" />}
          />
        </>
      ) : null}

      <div
        className={`h-6 items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--control-bg)] px-2 ${themeClasses.textSecondary} ${compact ? 'flex min-w-0' : 'ml-0.5 hidden md:flex'}`}
        title={status.title}
        data-testid="project-persistence-status"
        data-status-kind={persistenceStatus.kind}
        data-has-unsaved-changes={hasUnsavedChanges ? 'true' : 'false'}
        data-has-persisted-changes={hasPersistedChanges ? 'true' : 'false'}
      >
        <FolderDown className={`h-3 w-3 shrink-0 ${themeClasses.textMuted}`} />
        <span className={`whitespace-nowrap text-[10px] font-medium ${themeClasses.textPrimary}`} title={projectName}>{projectName}</span>
        <span className={`h-3 w-px shrink-0 ${themeClasses.divider}`} />
        <span className={`inline-flex min-w-0 items-center gap-1 text-[9px] ${status.tone}`}>
          {persistenceStatus.kind === 'saving' || persistenceStatus.kind === 'restoring' ? <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin" /> : null}
          <span className="truncate">{status.text}</span>
        </span>
      </div>

      {onToggleCollapse ? (
        <TooltipIconButton
          label={toggleLabel}
          onClick={onToggleCollapse}
          showTooltip={false}
          tooltipAlign="start"
          className={`${iconButtonClass} shrink-0 ${compact ? 'ml-0.5' : ''}`}
          icon={compact ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        />
      ) : null}
    </div>
  )
}
