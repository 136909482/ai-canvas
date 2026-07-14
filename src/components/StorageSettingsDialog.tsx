import { useEffect, useMemo, useState } from 'react'
import { Download, History, Loader2, ScanSearch, Trash2, Upload, X } from 'lucide-react'
import { analyzeHistorySize } from '@/features/history/historyDiagnostics'
import { summarizeWorkspaceAssetReferences } from '@/features/projectManager/assetInventory'
import { cloneProjectSnapshot, takeWorkspaceSnapshot } from '@/features/projectManager/runtime'
import { analyzeProjectSnapshotSize, formatSnapshotByteSize } from '@/features/projectManager/snapshotSize'
import { platformBridge, platformRuntime } from '@/platform'
import { useFeedbackStore } from '@/store/useFeedbackStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { useProjectStore } from '@/store/useProjectStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useStorageDialogStore } from '@/store/useStorageDialogStore'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { themeClasses } from '@/styles/themeClasses'
import type { WorkspaceAssetDiskInspection } from '@/platform/types'
import type { WorkspaceData } from '@/types'

const AUTOSAVE_OPTIONS = [
  { value: 15_000, label: '15 秒' },
  { value: 30_000, label: '30 秒' },
  { value: 60_000, label: '1 分钟' },
  { value: 120_000, label: '2 分钟' },
  { value: 300_000, label: '5 分钟' },
]

const STORAGE_SETTINGS_ROW_CLASS =
  'flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] px-4 py-4 last:border-b-0'
const STORAGE_SETTINGS_COMPACT_ROW_CLASS =
  'flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] px-4 py-3 last:border-b-0'
const STORAGE_OPTION_BUTTON_CLASS =
  'inline-flex h-7 min-w-16 items-center justify-center rounded-[9px] px-3 text-xs font-medium leading-none transition-colors'
const STORAGE_STAT_ITEM_CLASS =
  'min-w-0 rounded-[9px] bg-[var(--control-bg-hover)] px-3 py-2'

function getWorkspaceDisplayPath(status: { directoryName: string; directoryPath?: string }) {
  return status.directoryPath || status.directoryName
}

function isPickerCancellation(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function buildWorkspaceDataWithLiveActiveProject(
  projects: WorkspaceData['projects'],
  activeProjectId: WorkspaceData['activeProjectId'],
  lastOpenedProjectId: WorkspaceData['lastOpenedProjectId'],
): WorkspaceData {
  const activeSnapshot = takeWorkspaceSnapshot()

  return {
    projects: projects.map((project) => (
      project.id === activeProjectId
        ? {
            ...project,
            workingSnapshot: cloneProjectSnapshot(activeSnapshot),
          }
        : project
    )),
    activeProjectId,
    lastOpenedProjectId,
  }
}

export function StorageSettingsPanel({ active = true }: { active?: boolean }) {
  const storage = useSettingsStore((state) => state.config.storage)
  const runtime = useSettingsStore((state) => state.runtime)
  const setStorageSettings = useSettingsStore((state) => state.setStorageSettings)
  const setWorkspaceRuntimeStatus = useSettingsStore((state) => state.setWorkspaceRuntimeStatus)
  const hydrateFromWorkspace = useSettingsStore((state) => state.hydrateFromWorkspace)
  const persistWorkspaceConfig = useSettingsStore((state) => state.persistWorkspaceConfig)
  const persistWorkspaceFile = useProjectStore((state) => state.persistWorkspaceFile)
  const saveActiveProject = useProjectStore((state) => state.saveActiveProject)
  const reloadFromWorkspace = useProjectStore((state) => state.reloadFromWorkspace)
  const projects = useProjectStore((state) => state.projects)
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const lastOpenedProjectId = useProjectStore((state) => state.lastOpenedProjectId)
  const historyPast = useHistoryStore((state) => state.past)
  const historyFuture = useHistoryStore((state) => state.future)
  const pendingHistoryBaseline = useHistoryStore((state) => state.pendingBaseline)
  const clearHistory = useHistoryStore((state) => state.clearHistory)
  const [isChecking, setIsChecking] = useState(false)
  const [isPicking, setIsPicking] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [workspaceSupported, setWorkspaceSupported] = useState(true)
  const [diskInspection, setDiskInspection] = useState<WorkspaceAssetDiskInspection | null>(null)
  const confirm = useFeedbackStore((state) => state.confirm)
  const notify = useFeedbackStore((state) => state.notify)
  const workspaceDataWithLiveActiveProject = buildWorkspaceDataWithLiveActiveProject(projects, activeProjectId, lastOpenedProjectId)
  const assetSummary = summarizeWorkspaceAssetReferences(workspaceDataWithLiveActiveProject)
  const activeAssetCount = assetSummary.activeProjectSummary?.uniquePathCount ?? 0
  const activeProject = workspaceDataWithLiveActiveProject.projects.find((project) => project.id === activeProjectId)
  const activeSnapshotSizeReport = activeProject
    ? analyzeProjectSnapshotSize(activeProject.workingSnapshot)
    : null
  const historySizeReport = useMemo(() => analyzeHistorySize({
    past: historyPast,
    future: historyFuture,
    pendingBaseline: pendingHistoryBaseline,
  }), [historyFuture, historyPast, pendingHistoryBaseline])
  const isStorageBusy = isPicking || isCleaning || isScanning || isExporting || isImporting

  useEffect(() => {
    if (!active) {
      return
    }

    let cancelled = false

    const syncStatus = async () => {
      setIsChecking(true)

      try {
        const status = await platformBridge.getWorkspaceStatus()

        if (cancelled) {
          return
        }

        setWorkspaceSupported(status.supported)
        setWorkspaceRuntimeStatus({
          configured: status.configured,
          directoryName: status.directoryName,
          permission: status.permission,
        })

        if (!status.supported) {
          setStatusMessage('当前浏览器不支持目录授权，Web 端暂时无法保存到本地工作区。')
          return
        }

        if (!status.configured) {
          setStatusMessage('还没有设置缓存目录。')
          return
        }

        if (status.permission === 'denied') {
          setStatusMessage('缓存目录权限已失效，请重新选择目录。')
          return
        }

        setStatusMessage(`当前工作区：${getWorkspaceDisplayPath(status)}`)
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (!cancelled) {
          setIsChecking(false)
        }
      }
    }

    void syncStatus()

    return () => {
      cancelled = true
    }
  }, [active, setWorkspaceRuntimeStatus])

  const handleChooseDirectory = async () => {
    setIsPicking(true)

    try {
      const status = await platformBridge.pickWorkspaceDirectory()
      setWorkspaceSupported(status.supported)
      setWorkspaceRuntimeStatus({
        configured: status.configured,
        directoryName: status.directoryName,
        permission: status.permission,
      })
      await hydrateFromWorkspace()
      await reloadFromWorkspace()
      setDiskInspection(null)
      setStatusMessage(`当前工作区：${getWorkspaceDisplayPath(status)}`)
    } catch (error) {
      if (isPickerCancellation(error)) {
        return
      }

      setStatusMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setIsPicking(false)
    }
  }

  const inspectWorkspaceDiskAssets = async (options?: { commitActiveProject?: boolean }) => {
    const saveResult = options?.commitActiveProject
      ? await saveActiveProject()
      : await persistWorkspaceFile()
    if (saveResult === 'no-project') {
      throw new Error('当前没有可扫描的项目。')
    }
    if (saveResult === 'storage-required') {
      throw new Error('请先设置缓存目录。')
    }

    const persistedWorkspaceData = await platformBridge.loadWorkspaceData()
    if (!persistedWorkspaceData) {
      throw new Error('当前工作区没有可扫描的项目数据。')
    }
    const workspaceData = buildWorkspaceDataWithLiveActiveProject(
      persistedWorkspaceData.projects,
      persistedWorkspaceData.activeProjectId,
      persistedWorkspaceData.lastOpenedProjectId,
    )
    const inspection = await platformBridge.inspectWorkspaceAssets(workspaceData)
    setDiskInspection(inspection)
    return { inspection, workspaceData }
  }

  const handleInspectWorkspaceAssets = async () => {
    if (!runtime.workspaceConfigured) {
      setStatusMessage('请先设置缓存目录。')
      return
    }

    setIsScanning(true)
    try {
      const { inspection } = await inspectWorkspaceDiskAssets()
      setStatusMessage(
        inspection.orphanedFileCount > 0
          ? `扫描完成：发现 ${inspection.orphanedFileCount} 个未引用文件，可回收 ${formatSnapshotByteSize(inspection.orphanedByteSize)}。`
          : '扫描完成：没有发现未引用文件。',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatusMessage(message)
      notify({ tone: 'error', title: '磁盘扫描失败', message })
    } finally {
      setIsScanning(false)
    }
  }

  const handleCleanupUnusedImages = async () => {
    if (!runtime.workspaceConfigured) {
      setStatusMessage('请先设置缓存目录。')
      return
    }

    setIsCleaning(true)

    try {
      const { inspection, workspaceData } = await inspectWorkspaceDiskAssets({ commitActiveProject: true })
      if (inspection.orphanedFileCount === 0) {
        const protectedMessage = inspection.referencedFileCount > 0
          ? `${inspection.referencedFileCount} 个文件仍被项目快照或任务队列引用。`
          : '磁盘扫描没有发现未引用文件。'
        setStatusMessage(`没有可清理的未引用资产。${protectedMessage}`)
        notify({ tone: 'success', title: '无需清理', message: protectedMessage })
        return
      }

      const pathPreview = inspection.orphanedFiles
        .slice(0, 3)
        .map((file) => file.relativePath)
        .join('、')
      const remainingCount = Math.max(0, inspection.orphanedFileCount - 3)
      const confirmed = await confirm({
        title: '清理未引用文件',
        message: `将删除 ${inspection.orphanedFileCount} 个未引用文件，释放 ${formatSnapshotByteSize(inspection.orphanedByteSize)}。${pathPreview}${remainingCount > 0 ? `，另有 ${remainingCount} 个文件` : ''}。项目正在引用的文件不会删除。是否继续？`,
        confirmLabel: '清理',
        tone: 'danger',
      })
      if (!confirmed) {
        return
      }

      const result = await platformBridge.cleanupUnusedWorkspaceAssets(workspaceData)
      const nextInspection = await platformBridge.inspectWorkspaceAssets(workspaceData)
      setDiskInspection(nextInspection)
      setStatusMessage(
        result.deletedCount > 0
          ? `已清理 ${result.deletedCount} 个未引用文件，释放 ${formatSnapshotByteSize(result.deletedByteSize)}。`
          : '没有可清理的未引用图片缓存。',
      )
      notify({
        tone: 'success',
        title: '资产清理完成',
        message: result.deletedCount > 0
          ? `已清理 ${result.deletedCount} 个未引用文件，释放 ${formatSnapshotByteSize(result.deletedByteSize)}。`
          : '没有可清理的未引用图片缓存。',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatusMessage(message)
      notify({ tone: 'error', title: '资产清理失败', message })
    } finally {
      setIsCleaning(false)
    }
  }

  const handleExportWorkspaceBundle = async () => {
    if (!runtime.workspaceConfigured) {
      setStatusMessage('请先设置工作区目录。')
      return
    }

    setIsExporting(true)

    try {
      await persistWorkspaceFile()
      const [data, config] = await Promise.all([
        platformBridge.loadWorkspaceData(),
        platformBridge.loadWorkspaceConfig(),
      ])

      if (!data) {
        throw new Error('当前工作区没有可导出的项目数据。')
      }

      await platformBridge.exportWorkspaceBundle({
        data,
        config,
        suggestedName: `ai-canvas-workspace-${new Date().toISOString().slice(0, 10)}`,
      })

      const message = `已导出 ${data.projects.length} 个项目，Provider API Key 未包含在目录包中。`
      setStatusMessage(message)
      notify({ tone: 'success', title: '工作区导出完成', message })
    } catch (error) {
      if (isPickerCancellation(error)) {
        return
      }

      const message = error instanceof Error ? error.message : String(error)
      setStatusMessage(message)
      notify({ tone: 'error', title: '工作区导出失败', message })
    } finally {
      setIsExporting(false)
    }
  }

  const handleImportWorkspaceBundle = async () => {
    if (!runtime.workspaceConfigured) {
      setStatusMessage('请先设置工作区目录。')
      return
    }

    const confirmed = await confirm({
      title: '导入工作区目录包',
      message: '导入会替换当前工作区目录中的项目、设置和图片资产。Provider API Key 不包含在目录包中，导入后需要重新填写。是否继续？',
      confirmLabel: '导入并替换',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }

    setIsImporting(true)

    try {
      const result = await platformBridge.importWorkspaceBundle()
      await hydrateFromWorkspace()
      await reloadFromWorkspace()

      const message = `已导入 ${result.data.projects.length} 个项目和 ${result.importedAssetCount} 个资产。`
      setStatusMessage(message)
      notify({ tone: 'success', title: '工作区导入完成', message })
    } catch (error) {
      if (isPickerCancellation(error)) {
        return
      }

      const message = error instanceof Error ? error.message : String(error)
      setStatusMessage(message)
      notify({ tone: 'error', title: '工作区导入失败', message })
    } finally {
      setIsImporting(false)
    }
  }

  const handleClearHistory = async () => {
    const confirmed = await confirm({
      title: '清空撤销记录',
      message: `将清空当前项目的 ${historySizeReport.totalEntryCount} 条撤销、重做和待提交记录，预计释放 ${formatSnapshotByteSize(historySizeReport.totalByteSize)} 内存。当前画布和已保存项目内容不会改变。是否继续？`,
      confirmLabel: '清空记录',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }

    clearHistory()
    notify({ tone: 'success', title: '撤销记录已清空', message: '当前画布和项目正文未改变。' })
  }

  return (
    <section className="overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--control-bg)]">
      <div className={STORAGE_SETTINGS_ROW_CLASS}>
        <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="min-w-0">
              <div className={`text-sm font-medium ${themeClasses.textPrimary}`}>缓存目录</div>
              <div className={`mt-1 text-xs leading-5 ${themeClasses.textMuted}`}>
                {isChecking ? '正在检查目录状态...' : statusMessage || '选择一个本地目录作为项目工作区。'}
              </div>
              {runtime.workspaceConfigured && platformRuntime === 'web' ? (
                <div className={`mt-0.5 text-[11px] leading-4 ${themeClasses.textMuted}`}>
                  浏览器模式仅能读取授权目录名；接入桌面目录桥后会显示完整路径。
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void handleChooseDirectory()
              }}
              disabled={!workspaceSupported || isStorageBusy}
              className={`${STORAGE_OPTION_BUTTON_CLASS} bg-[var(--control-bg-hover)] text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {isPicking ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              选择目录
            </button>

            <button
              type="button"
              data-testid="workspace-bundle-export"
              onClick={() => {
                void handleExportWorkspaceBundle()
              }}
              disabled={!workspaceSupported || !runtime.workspaceConfigured || isStorageBusy}
              className={`${STORAGE_OPTION_BUTTON_CLASS} gap-1.5 bg-[var(--control-bg-hover)] text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50`}
              title="导出工作区目录包"
            >
              {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              导出
            </button>

            <button
              type="button"
              data-testid="workspace-bundle-import"
              onClick={() => {
                void handleImportWorkspaceBundle()
              }}
              disabled={!workspaceSupported || !runtime.workspaceConfigured || isStorageBusy}
              className={`${STORAGE_OPTION_BUTTON_CLASS} gap-1.5 bg-violet-600 text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50`}
              title="导入并替换当前工作区"
            >
              {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              导入
            </button>

            <button
              type="button"
              data-testid="workspace-asset-cleanup"
              onClick={() => {
                void handleCleanupUnusedImages()
              }}
              disabled={!workspaceSupported || !runtime.workspaceConfigured || isStorageBusy}
              className={`${STORAGE_OPTION_BUTTON_CLASS} text-red-600 hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-200`}
            >
              {isCleaning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              清理未引用文件
            </button>
          </div>
        </div>
      </div>

      <div
        className={STORAGE_SETTINGS_ROW_CLASS}
        data-testid="workspace-asset-summary"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
            <div className="min-w-0">
              <div className={`text-sm font-medium ${themeClasses.textPrimary}`}>图片资产引用</div>
              <div className={`mt-1 text-xs leading-5 ${themeClasses.textMuted}`}>
                清理会保留所有项目保存快照、工作快照和任务结果正在引用的 images/ 文件。
              </div>
            </div>
            </div>

            <div className="grid w-full shrink-0 grid-cols-2 gap-2 text-xs md:w-[28rem] md:grid-cols-3">
            <div className={STORAGE_STAT_ITEM_CLASS}>
              <div className={`text-sm font-semibold leading-none ${themeClasses.textPrimary}`}>{assetSummary.totalUniquePathCount}</div>
              <div className={`mt-1 truncate text-[11px] leading-none ${themeClasses.textMuted}`}>工作区引用</div>
            </div>
            <div className={STORAGE_STAT_ITEM_CLASS}>
              <div className={`text-sm font-semibold leading-none ${themeClasses.textPrimary}`}>{activeAssetCount}</div>
              <div className={`mt-1 truncate text-[11px] leading-none ${themeClasses.textMuted}`}>当前项目</div>
            </div>
            <div className={STORAGE_STAT_ITEM_CLASS}>
              <div className={`text-sm font-semibold leading-none ${themeClasses.textPrimary}`}>{assetSummary.originalCount}</div>
              <div className={`mt-1 truncate text-[11px] leading-none ${themeClasses.textMuted}`}>原图/视频</div>
            </div>
            <div className={STORAGE_STAT_ITEM_CLASS}>
              <div className={`text-sm font-semibold leading-none ${themeClasses.textPrimary}`}>
                {assetSummary.thumbnailCount}/{assetSummary.previewCount}
              </div>
              <div className={`mt-1 truncate text-[11px] leading-none ${themeClasses.textMuted}`}>缩略/预览</div>
            </div>
            <div className={STORAGE_STAT_ITEM_CLASS}>
              <div className={`text-sm font-semibold leading-none ${activeSnapshotSizeReport?.status === 'danger'
                ? 'text-red-500 dark:text-red-200'
                : activeSnapshotSizeReport?.status === 'warning'
                  ? 'text-amber-600 dark:text-amber-200'
                  : themeClasses.textPrimary}`}
              >
                {activeSnapshotSizeReport ? formatSnapshotByteSize(activeSnapshotSizeReport.serializedByteSize) : '-'}
              </div>
              <div className={`mt-1 truncate text-[11px] leading-none ${themeClasses.textMuted}`}>当前快照</div>
            </div>
            <div className={STORAGE_STAT_ITEM_CLASS}>
              <div className={`text-sm font-semibold leading-none ${themeClasses.textPrimary}`}>
                {activeSnapshotSizeReport?.embeddedMediaCount ?? 0}
              </div>
              <div className={`mt-1 truncate text-[11px] leading-none ${themeClasses.textMuted}`}>嵌入媒体</div>
            </div>
            </div>
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-3" data-testid="workspace-disk-inspection">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className={`text-sm font-medium ${themeClasses.textPrimary}`}>磁盘资产扫描</div>
                <p className={`mt-1 text-xs leading-5 ${themeClasses.textMuted}`}>
                  读取 images/ 实际文件大小，并与全部项目快照引用逐项比对。
                </p>
              </div>
              <button
                type="button"
                data-testid="workspace-asset-scan"
                onClick={() => {
                  void handleInspectWorkspaceAssets()
                }}
                disabled={!workspaceSupported || !runtime.workspaceConfigured || isStorageBusy}
                className={`${STORAGE_OPTION_BUTTON_CLASS} shrink-0 gap-1.5 bg-[var(--control-bg-hover)] text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {isScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
                扫描磁盘
              </button>
            </div>

            {diskInspection ? (
              <div className="mt-3" data-testid="workspace-disk-inspection-result">
                <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                  <div className={STORAGE_STAT_ITEM_CLASS}>
                    <div className={`text-sm font-semibold leading-none ${themeClasses.textPrimary}`}>{formatSnapshotByteSize(diskInspection.totalByteSize)}</div>
                    <div className={`mt-1 truncate text-[11px] leading-none ${themeClasses.textMuted}`}>{diskInspection.totalFileCount} 个磁盘文件</div>
                  </div>
                  <div className={STORAGE_STAT_ITEM_CLASS}>
                    <div className={`text-sm font-semibold leading-none ${themeClasses.textPrimary}`}>{formatSnapshotByteSize(diskInspection.referencedByteSize)}</div>
                    <div className={`mt-1 truncate text-[11px] leading-none ${themeClasses.textMuted}`}>{diskInspection.referencedFileCount} 个受保护</div>
                  </div>
                  <div className={STORAGE_STAT_ITEM_CLASS}>
                    <div className={`text-sm font-semibold leading-none ${diskInspection.orphanedFileCount > 0 ? 'text-amber-600 dark:text-amber-200' : themeClasses.textPrimary}`}>
                      {formatSnapshotByteSize(diskInspection.orphanedByteSize)}
                    </div>
                    <div className={`mt-1 truncate text-[11px] leading-none ${themeClasses.textMuted}`}>{diskInspection.orphanedFileCount} 个可清理</div>
                  </div>
                  <div className={STORAGE_STAT_ITEM_CLASS}>
                    <div className={`text-sm font-semibold leading-none ${diskInspection.missingReferencedPaths.length > 0 ? 'text-red-500 dark:text-red-200' : themeClasses.textPrimary}`}>
                      {diskInspection.missingReferencedPaths.length}
                    </div>
                    <div className={`mt-1 truncate text-[11px] leading-none ${themeClasses.textMuted}`}>缺失引用</div>
                  </div>
                </div>

                {diskInspection.orphanedFiles.length > 0 ? (
                  <div className="mt-2 max-h-28 overflow-y-auto border-t border-[var(--border-subtle)] pt-1">
                    {diskInspection.orphanedFiles.slice(0, 20).map((file) => (
                      <div key={file.relativePath} className="flex h-7 min-w-0 items-center justify-between gap-3 border-b border-[color-mix(in_srgb,var(--border-subtle)_60%,transparent)] px-1 text-[11px] last:border-b-0">
                        <span className={`min-w-0 truncate ${themeClasses.textSecondary}`} title={file.relativePath}>{file.relativePath}</span>
                        <span className={`shrink-0 tabular-nums ${themeClasses.textMuted}`}>{formatSnapshotByteSize(file.byteSize)}</span>
                      </div>
                    ))}
                    {diskInspection.orphanedFiles.length > 20 ? (
                      <div className={`px-1 py-1.5 text-[11px] ${themeClasses.textMuted}`}>另有 {diskInspection.orphanedFiles.length - 20} 个未引用文件未展开</div>
                    ) : null}
                  </div>
                ) : null}

                {diskInspection.missingReferencedPaths.length > 0 ? (
                  <div className="mt-2 border-t border-red-500/20 pt-2 text-[11px] leading-5 text-red-500 dark:text-red-200">
                    缺失：{diskInspection.missingReferencedPaths.slice(0, 3).join('、')}
                    {diskInspection.missingReferencedPaths.length > 3 ? `，另有 ${diskInspection.missingReferencedPaths.length - 3} 项` : ''}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={STORAGE_SETTINGS_ROW_CLASS} data-testid="history-text-governance">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className={`flex items-center gap-2 text-sm font-medium ${themeClasses.textPrimary}`}>
                <History className="h-4 w-4 text-[var(--accent-violet-strong)]" aria-hidden="true" />
                历史与大文本
              </div>
              <p className={`mt-1 text-xs leading-5 ${themeClasses.textMuted}`}>
                正文、提示词、LLM 输出和附件会完整保留；体积治理只提供诊断和显式操作。
              </p>
            </div>

            <button
              type="button"
              data-testid="clear-canvas-history"
              onClick={() => void handleClearHistory()}
              disabled={historySizeReport.totalEntryCount === 0}
              className={`${STORAGE_OPTION_BUTTON_CLASS} shrink-0 gap-1.5 text-red-600 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-200`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              清空撤销记录
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <div className={STORAGE_STAT_ITEM_CLASS}>
              <div className={`text-sm font-semibold leading-none ${themeClasses.textPrimary}`}>{historySizeReport.totalEntryCount}</div>
              <div className={`mt-1 truncate text-[11px] leading-none ${themeClasses.textMuted}`}>历史记录</div>
            </div>
            <div className={STORAGE_STAT_ITEM_CLASS}>
              <div className={`text-sm font-semibold leading-none ${historySizeReport.status === 'danger'
                ? 'text-red-500 dark:text-red-200'
                : historySizeReport.status === 'warning'
                  ? 'text-amber-600 dark:text-amber-200'
                  : themeClasses.textPrimary}`}
              >
                {formatSnapshotByteSize(historySizeReport.totalByteSize)}
              </div>
              <div className={`mt-1 truncate text-[11px] leading-none ${themeClasses.textMuted}`}>历史内存估算</div>
            </div>
            <div className={STORAGE_STAT_ITEM_CLASS}>
              <div className={`text-sm font-semibold leading-none ${themeClasses.textPrimary}`}>{activeSnapshotSizeReport?.largeStringCount ?? 0}</div>
              <div className={`mt-1 truncate text-[11px] leading-none ${themeClasses.textMuted}`}>大文本条目</div>
            </div>
            <div className={STORAGE_STAT_ITEM_CLASS}>
              <div className={`text-sm font-semibold leading-none ${themeClasses.textPrimary}`}>
                {historySizeReport.largestSnapshot ? formatSnapshotByteSize(historySizeReport.largestSnapshot.byteSize) : '-'}
              </div>
              <div className={`mt-1 truncate text-[11px] leading-none ${themeClasses.textMuted}`}>最大历史快照</div>
            </div>
          </div>

          {activeSnapshotSizeReport?.largestStrings.length ? (
            <div className="border-t border-[var(--border-subtle)] pt-1" aria-label="当前项目大文本条目">
              {activeSnapshotSizeReport.largestStrings.map((entry) => (
                <div key={entry.path} className="flex min-h-8 min-w-0 items-center justify-between gap-3 border-b border-[color-mix(in_srgb,var(--border-subtle)_60%,transparent)] px-1 py-1 text-[11px] last:border-b-0">
                  <span className={`min-w-0 truncate ${themeClasses.textSecondary}`} title={entry.path}>{entry.label}</span>
                  <span className={`shrink-0 tabular-nums ${themeClasses.textMuted}`}>{formatSnapshotByteSize(entry.byteSize)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className={STORAGE_SETTINGS_COMPACT_ROW_CLASS}>
        <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className={`text-sm font-medium ${themeClasses.textPrimary}`}>画布自动保存时间</div>
            <p className={`mt-1 text-xs leading-5 ${themeClasses.textMuted}`}>自动保存会直接写入当前项目文件，但不会替代手动保存。</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {AUTOSAVE_OPTIONS.map((option) => {
              const isActive = option.value === storage.autosaveIntervalMs

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setStorageSettings({ autosaveIntervalMs: option.value })
                    void persistWorkspaceConfig().catch(() => undefined)
                  }}
                  className={`${STORAGE_OPTION_BUTTON_CLASS} ${
                    isActive
                      ? 'bg-[var(--control-bg-hover)] text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

export function StorageSettingsDialog() {
  const isOpen = useStorageDialogStore((state) => state.isOpen)
  const close = useStorageDialogStore((state) => state.close)
  const dialogRef = useDialogFocus<HTMLDivElement>(isOpen, close)

  if (!isOpen) {
    return null
  }

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/30 px-4 py-6 backdrop-blur-sm">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="storage-settings-title" tabIndex={-1} className={`w-full max-w-xl overflow-hidden rounded-[24px] ${themeClasses.strongPanel}`}>
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4">
          <div>
            <div className={`text-[11px] font-medium tracking-[0.12em] ${themeClasses.textMuted}`}>STORAGE</div>
            <h2 id="storage-settings-title" className={`mt-1 text-lg font-semibold ${themeClasses.textPrimary}`}>存储设置</h2>
            <p className={`mt-1 text-sm ${themeClasses.textMuted}`}>设置项目缓存目录和画布自动保存时间。</p>
          </div>

          <button
            type="button"
            onClick={close}
            className={`${themeClasses.iconButton} h-8 w-8 rounded-xl`}
            aria-label="关闭存储设置"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5">
          <StorageSettingsPanel active={isOpen} />
        </div>
      </div>
    </div>
  )
}
