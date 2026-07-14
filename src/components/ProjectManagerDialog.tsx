import { useMemo, useState } from 'react'
import {
  Archive,
  ArrowUpDown,
  CheckSquare,
  Clock3,
  Import,
  FolderOpen,
  LayoutGrid,
  List,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { getProjectManagerStatusView } from '@/features/projectManager/projectManagerStatus'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { useFeedbackStore } from '@/store/useFeedbackStore'
import { useProjectDialogStore } from '@/store/useProjectDialogStore'
import { useProjectStore } from '@/store/useProjectStore'
import { useSettingsDialogStore } from '@/store/useSettingsDialogStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { themeClasses } from '@/styles/themeClasses'
import type { ProjectBundleImportCandidate, ProjectImportResolution } from '@/platform/types'
import type { ProjectRecord } from '@/types'
import {
  ProjectNameDialog,
  ProjectPreviewCard,
  SidebarButton,
} from '@/components/projectManager/ProjectManagerParts'
import {
  filterAndSortProjects,
  type ProjectCategory,
  type ProjectSortMode,
  type ProjectViewMode,
} from '@/components/projectManager/projectManagerModel'

async function confirmProceedWhenDirty(
  dirty: boolean,
  saveActiveProject: () => Promise<'saved' | 'storage-required' | 'no-project'>,
  confirm: ReturnType<typeof useFeedbackStore.getState>['confirm'],
  notify: ReturnType<typeof useFeedbackStore.getState>['notify'],
) {
  if (!dirty) {
    return true
  }

  const shouldSave = await confirm({
    title: '保存当前改动',
    message: '当前项目有未保存的改动，是否先保存？',
    confirmLabel: '先保存',
    cancelLabel: '不保存',
  })

  if (shouldSave) {
    let result: Awaited<ReturnType<typeof saveActiveProject>>
    try {
      result = await saveActiveProject()
    } catch {
      // The project store reports the structured diagnostic and user feedback.
      return false
    }

    if (result === 'storage-required') {
      notify({ tone: 'warning', title: '需要缓存目录', message: '首次保存前请先在存储设置里配置缓存目录。' })
      return false
    }

    return result === 'saved'
  }

  return confirm({
    title: '放弃未保存改动',
    message: '不保存当前改动，继续切换吗？',
    confirmLabel: '继续切换',
    tone: 'danger',
  })
}

function ProjectImportConflictDialog({
  candidate,
  busy,
  onCancel,
  onResolve,
}: {
  candidate: ProjectBundleImportCandidate | null
  busy: boolean
  onCancel: () => void
  onResolve: (resolution: ProjectImportResolution) => void
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>(Boolean(candidate), onCancel)
  if (!candidate) return null

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/48 px-4 backdrop-blur-sm">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="project-import-conflict-title" tabIndex={-1} className={`w-full max-w-md p-5 ${themeClasses.strongPanel}`} data-testid="project-import-conflict-dialog">
        <div id="project-import-conflict-title" className={`text-sm font-semibold ${themeClasses.textPrimary}`}>项目 ID 已存在</div>
        <p className={`mt-1 text-xs leading-5 ${themeClasses.textMuted}`}>
          请选择保留两个项目，或用目录包内容替换现有项目。
        </p>

        <dl className="mt-4 grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)] p-3 text-xs">
          <dt className={themeClasses.textMuted}>项目名称</dt>
          <dd className={`truncate ${themeClasses.textPrimary}`}>{candidate.project.name}</dd>
          <dt className={themeClasses.textMuted}>项目 ID</dt>
          <dd className={`truncate font-mono text-[11px] ${themeClasses.textSecondary}`}>{candidate.project.id}</dd>
          <dt className={themeClasses.textMuted}>引用资产</dt>
          <dd className={themeClasses.textSecondary}>{candidate.assetCount} 个</dd>
        </dl>

        <div className="mt-4 space-y-2 text-xs leading-5">
          <p className={themeClasses.textSecondary}><strong className={themeClasses.textPrimary}>导入副本：</strong>生成新的项目 ID，并把资产写入独立目录。</p>
          <p className={themeClasses.textSecondary}><strong className={themeClasses.textPrimary}>替换现有：</strong>保留项目 ID，用导入内容更新现有项目；旧的未引用资产稍后可通过磁盘清理移除。</p>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className={`${themeClasses.secondaryButton} h-9 px-4 text-sm disabled:opacity-50`}>
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve('copy')}
            data-testid="project-import-copy"
            className={`${themeClasses.secondaryButton} h-9 px-4 text-sm disabled:opacity-50`}
          >
            导入副本
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve('replace')}
            data-testid="project-import-replace"
            className="h-9 rounded-lg bg-red-500 px-4 text-sm font-semibold text-white transition hover:bg-red-400 disabled:opacity-50"
          >
            替换现有项目
          </button>
        </div>
      </div>
    </div>
  )
}

export function ProjectManagerDialog() {
  const isOpen = useProjectDialogStore((state) => state.isOpen)
  const close = useProjectDialogStore((state) => state.close)
  const openSettings = useSettingsDialogStore((state) => state.open)
  const workspaceConfigured = useSettingsStore((state) => state.runtime.workspaceConfigured)
  const projects = useProjectStore((state) => state.projects)
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const createProject = useProjectStore((state) => state.createProject)
  const duplicateProject = useProjectStore((state) => state.duplicateProject)
  const loadProject = useProjectStore((state) => state.loadProject)
  const renameProject = useProjectStore((state) => state.renameProject)
  const archiveProject = useProjectStore((state) => state.archiveProject)
  const restoreProject = useProjectStore((state) => state.restoreProject)
  const deleteProject = useProjectStore((state) => state.deleteProject)
  const exportProject = useProjectStore((state) => state.exportProject)
  const prepareProjectImport = useProjectStore((state) => state.prepareProjectImport)
  const commitProjectImport = useProjectStore((state) => state.commitProjectImport)
  const saveActiveProject = useProjectStore((state) => state.saveActiveProject)
  const hasUnsavedChanges = useProjectStore((state) => state.hasUnsavedChanges)
  const getActivePersistenceStatus = useProjectStore((state) => state.getActivePersistenceStatus)
  const confirm = useFeedbackStore((state) => state.confirm)
  const notify = useFeedbackStore((state) => state.notify)
  const [dialogState, setDialogState] = useState<{ mode: 'create' | 'rename'; project: ProjectRecord | null } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<ProjectCategory>('all')
  const [viewMode, setViewMode] = useState<ProjectViewMode>('grid')
  const [sortMode, setSortMode] = useState<ProjectSortMode>('updated')
  const [batchMode, setBatchMode] = useState(false)
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [importCandidate, setImportCandidate] = useState<ProjectBundleImportCandidate | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const dialogRef = useDialogFocus<HTMLDivElement>(isOpen, close, '[data-dialog-initial-focus]')

  const filteredProjects = useMemo(() => filterAndSortProjects(projects, {
    category: activeCategory,
    searchQuery,
    sortMode,
  }), [activeCategory, projects, searchQuery, sortMode])

  if (!isOpen) {
    return null
  }

  const handleOpenProject = async (projectId: string) => {
    const shouldProceed = await confirmProceedWhenDirty(hasUnsavedChanges(), saveActiveProject, confirm, notify)

    if (!shouldProceed) {
      return
    }

    const success = await loadProject(projectId)

    if (success) {
      close()
    }
  }

  const handleCreateProject = async (name: string) => {
    setDialogState(null)
    const shouldProceed = await confirmProceedWhenDirty(hasUnsavedChanges(), saveActiveProject, confirm, notify)

    if (!shouldProceed) {
      return
    }

    const projectId = await createProject(name)

    if (projectId) {
      close()
      return
    }

    notify({ tone: 'warning', title: '需要保存位置', message: '请先选择项目保存位置，再新建项目。' })
    close()
    openSettings('storage')
  }

  const handleRenameProject = async (name: string) => {
    const target = dialogState?.project
    setDialogState(null)

    if (!target) {
      return
    }

    await renameProject(target.id, name)
  }

  const handleDeleteProject = async (project: ProjectRecord) => {
    const confirmed = await confirm({
      title: '删除项目',
      message: project.id === activeProjectId
        ? '删除当前项目后会切换到其他项目，确定继续吗？'
        : '确定删除这个项目吗？',
      confirmLabel: '删除',
      tone: 'danger',
    })

    if (!confirmed) {
      return
    }

    await deleteProject(project.id)
    setSelectedProjectIds((current) => current.filter((id) => id !== project.id))
  }

  const handleDuplicateProject = async (project: ProjectRecord) => {
    await duplicateProject(project.id)
  }

  const handleExportProject = async (project: ProjectRecord) => {
    try {
      const exported = await exportProject(project.id)
      if (!exported) {
        notify({ tone: 'warning', title: '需要工作区', message: '请先在存储设置中配置工作区，再导出项目目录包。' })
        return
      }
      notify({ tone: 'success', title: '项目已导出', message: `${project.name} 的目录包已创建。` })
    } catch (error) {
      notify({ tone: 'error', title: '导出失败', message: error instanceof Error ? error.message : String(error) })
    }
  }

  const commitImport = async (candidate: ProjectBundleImportCandidate, resolution: ProjectImportResolution) => {
    setImportBusy(true)
    try {
      const result = await commitProjectImport(candidate.candidateId, resolution)
      setImportCandidate(null)
      notify({
        tone: 'success',
        title: resolution === 'replace' ? '项目已替换' : '项目已导入',
        message: `${result.project.name} 已写入工作区，共导入 ${result.importedAssetCount} 个资产。`,
      })
    } catch (error) {
      notify({ tone: 'error', title: '导入失败', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setImportBusy(false)
    }
  }

  const handlePrepareProjectImport = async () => {
    try {
      const candidate = await prepareProjectImport()
      if (candidate.hasIdConflict) {
        setImportCandidate(candidate)
        return
      }
      const confirmed = await confirm({
        title: '导入项目',
        message: `将导入“${candidate.project.name}”（${candidate.assetCount} 个引用资产），是否继续？`,
        confirmLabel: '导入',
      })
      if (confirmed) await commitImport(candidate, 'preserve')
    } catch (error) {
      notify({ tone: 'error', title: '无法读取项目目录包', message: error instanceof Error ? error.message : String(error) })
    }
  }

  const handleArchiveProject = async (project: ProjectRecord) => {
    if (project.id === activeProjectId) {
      const shouldProceed = await confirmProceedWhenDirty(hasUnsavedChanges(), saveActiveProject, confirm, notify)
      if (!shouldProceed) return
    }

    const confirmed = await confirm({
      title: '归档项目',
      message: project.id === activeProjectId
        ? '归档当前项目后会切换到其他未归档项目；如果没有其他项目，画布将回到未打开状态。是否继续？'
        : '归档后项目不会出现在“全部”和“最近编辑”中，可随时从“已归档”恢复。',
      confirmLabel: '归档',
    })
    if (!confirmed) return

    await archiveProject(project.id)
    setSelectedProjectIds((current) => current.filter((id) => id !== project.id))
  }

  const handleRestoreProject = async (project: ProjectRecord) => {
    const restored = await restoreProject(project.id)
    if (restored) {
      notify({ tone: 'success', title: '项目已恢复', message: `${project.name} 已回到项目列表。` })
    }
  }

  const handleToggleProject = (projectId: string) => {
    setSelectedProjectIds((current) => (
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId]
    ))
  }

  const handleBatchDelete = async () => {
    if (selectedProjectIds.length === 0) {
      return
    }

    const confirmed = await confirm({
      title: '批量删除项目',
      message: `确定删除选中的 ${selectedProjectIds.length} 个项目吗？`,
      confirmLabel: '删除',
      tone: 'danger',
    })

    if (!confirmed) {
      return
    }

    for (const projectId of selectedProjectIds) {
      await deleteProject(projectId)
    }

    setSelectedProjectIds([])
    setBatchMode(false)
  }

  const handleConfigureWorkspace = () => {
    close()
    openSettings('storage')
  }

  const hasProjects = filteredProjects.length > 0
  const activePersistenceStatus = getActivePersistenceStatus()
  const activeProjectStatusView = getProjectManagerStatusView(activePersistenceStatus)

  return (
    <div className="absolute inset-0 z-[55] flex items-center justify-center overflow-hidden bg-black/30 px-4 py-6 backdrop-blur-sm">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="project-manager-title" tabIndex={-1} className={`relative flex h-[min(78vh,40rem)] w-[min(94vw,66rem)] overflow-hidden rounded-[12px] ${themeClasses.strongPanel}`}>
        <aside className="relative hidden w-52 shrink-0 border-r border-[var(--border-subtle)] lg:flex lg:flex-col">
          <div className="px-7 pt-8">
            <h2 id="project-manager-title" className={`text-[1.65rem] font-semibold tracking-[-0.06em] ${themeClasses.textPrimary}`}>项目管理</h2>
            <p className={`mt-1.5 whitespace-nowrap text-[12px] leading-5 ${themeClasses.textMuted}`}>
              查看并管理你的历史创作记录
            </p>
          </div>

          <div className="px-7 pt-7">
            <div className="space-y-1.5">
              <SidebarButton
                label="全部"
                active={activeCategory === 'all'}
                icon={<FolderOpen className="h-4 w-4" />}
                onClick={() => setActiveCategory('all')}
              />
              <SidebarButton
                label="最近编辑"
                active={activeCategory === 'recent'}
                icon={<Clock3 className="h-4 w-4" />}
                onClick={() => setActiveCategory('recent')}
              />
              <SidebarButton
                label="已归档"
                active={activeCategory === 'archived'}
                icon={<Archive className="h-4 w-4" />}
                onClick={() => setActiveCategory('archived')}
              />
            </div>
          </div>
        </aside>

        <section className="relative flex min-w-0 flex-1 flex-col p-5 sm:p-6 lg:p-7">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-end">
              <div className="flex flex-wrap items-center gap-2.5 xl:justify-end">
                <div className="relative w-full sm:w-[15.5rem]">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    data-dialog-initial-focus
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="搜索项目..."
                    className={`h-10 w-full rounded-2xl pl-10 pr-4 text-sm ${themeClasses.input}`}
                  />
                </div>

                <label className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--control-bg)] px-3.5 text-sm text-[var(--text-secondary)]">
                  <ArrowUpDown className="h-4 w-4 text-[var(--text-muted)]" />
                  <select
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as ProjectSortMode)}
                    className="bg-transparent pr-1 text-sm font-medium text-[var(--text-primary)] outline-none"
                  >
                    <option value="updated" className="bg-[var(--panel-bg-strong)]">最近更新</option>
                    <option value="name-asc" className="bg-[var(--panel-bg-strong)]">名称 A-Z</option>
                    <option value="name-desc" className="bg-[var(--panel-bg-strong)]">名称 Z-A</option>
                  </select>
                </label>

                <div className="inline-flex h-10 items-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--control-bg)] p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    aria-label="网格视图"
                    aria-pressed={viewMode === 'grid'}
                    className={viewMode === 'grid'
                      ? 'inline-flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500 text-white'
                      : 'inline-flex h-8 w-8 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]'}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    aria-label="列表视图"
                    aria-pressed={viewMode === 'list'}
                    className={viewMode === 'list'
                      ? 'inline-flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500 text-white'
                      : 'inline-flex h-8 w-8 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]'}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setBatchMode((current) => !current)
                    setSelectedProjectIds([])
                  }}
                  data-testid="project-batch-toggle"
                  className={batchMode
                    ? 'inline-flex h-10 items-center gap-2 rounded-2xl border border-violet-400/30 bg-violet-500 px-4 text-sm font-semibold text-white'
                    : `${themeClasses.secondaryButton} h-10 gap-2 px-4 text-sm font-medium`}
                >
                  <CheckSquare className="h-4 w-4" />
                  批量管理
                </button>

                {batchMode && selectedProjectIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      void handleBatchDelete()
                    }}
                    data-testid="project-batch-delete"
                    className="inline-flex h-10 items-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 text-sm font-medium text-red-500 transition hover:bg-red-500/14"
                  >
                    <Trash2 className="h-4 w-4" />
                    删除已选
                  </button>
                ) : null}

                {!batchMode && workspaceConfigured ? (
                  <>
                    <button
                      type="button"
                      onClick={() => { void handlePrepareProjectImport() }}
                      data-testid="import-project-button"
                      className={`${themeClasses.secondaryButton} h-10 gap-2 px-4 text-sm font-medium`}
                    >
                      <Import className="h-4 w-4" />
                      导入项目
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialogState({ mode: 'create', project: null })}
                      data-testid="create-project-button"
                      className="inline-flex h-10 items-center gap-2 rounded-2xl border border-violet-400/25 bg-violet-500 px-4 text-sm font-semibold text-white transition hover:bg-violet-400"
                    >
                      <Plus className="h-4 w-4" />
                      新建项目
                    </button>
                  </>
                ) : !batchMode ? (
                  <button
                    type="button"
                    onClick={handleConfigureWorkspace}
                    data-testid="project-workspace-setup-button"
                    className="inline-flex h-10 items-center gap-2 rounded-2xl border border-violet-400/25 bg-violet-500 px-4 text-sm font-semibold text-white transition hover:bg-violet-400"
                  >
                    <FolderOpen className="h-4 w-4" />
                    选择保存位置
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={close}
                  className={`${themeClasses.iconButton} h-10 w-10 rounded-2xl`}
                  aria-label="关闭项目管理"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="lg:hidden">
                <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    type="button"
                    onClick={() => setActiveCategory('all')}
                    aria-pressed={activeCategory === 'all'}
                    className={activeCategory === 'all'
                      ? 'rounded-full bg-violet-500 px-4 py-2 text-xs font-semibold text-white'
                      : 'rounded-full border border-[var(--border-subtle)] bg-[var(--control-bg)] px-4 py-2 text-xs font-medium text-[var(--text-muted)]'}
                  >
                    全部
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCategory('recent')}
                    aria-pressed={activeCategory === 'recent'}
                    className={activeCategory === 'recent'
                      ? 'rounded-full bg-violet-500 px-4 py-2 text-xs font-semibold text-white'
                      : 'rounded-full border border-[var(--border-subtle)] bg-[var(--control-bg)] px-4 py-2 text-xs font-medium text-[var(--text-muted)]'}
                  >
                    最近编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCategory('archived')}
                    aria-pressed={activeCategory === 'archived'}
                    className={activeCategory === 'archived'
                      ? 'rounded-full bg-violet-500 px-4 py-2 text-xs font-semibold text-white'
                      : 'rounded-full border border-[var(--border-subtle)] bg-[var(--control-bg)] px-4 py-2 text-xs font-medium text-[var(--text-muted)]'}
                  >
                    已归档
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="project-manager-scrollbar mt-4 min-h-0 flex-1 overflow-x-visible overflow-y-auto pt-2 [scrollbar-gutter:stable]">
            {!hasProjects ? (
              <div className="flex h-full min-h-56 items-center justify-center rounded-[26px] border border-dashed border-[var(--border-subtle)] bg-[var(--control-bg)] px-8 text-center">
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">这里还没有符合条件的项目</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                    {!workspaceConfigured
                      ? '请先选择项目保存位置，然后再创建第一个项目。'
                      : activeCategory === 'archived'
                      ? '归档项目会保留完整快照和资产引用，并可随时恢复。'
                      : '试试切换分类、清空搜索，或者直接新建一个项目开始。'}
                  </p>
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] justify-center gap-3">
                {filteredProjects.map((project) => (
                  <ProjectPreviewCard
                    key={project.id}
                    project={project}
                    active={project.id === activeProjectId}
                    batchMode={batchMode}
                    selected={selectedProjectIds.includes(project.id)}
                    viewMode={viewMode}
                    status={project.id === activeProjectId ? activeProjectStatusView : null}
                    onOpen={() => {
                      void handleOpenProject(project.id)
                    }}
                    onRename={() => setDialogState({ mode: 'rename', project })}
                    onDuplicate={() => {
                      void handleDuplicateProject(project)
                    }}
                    onExport={() => {
                      void handleExportProject(project)
                    }}
                    onArchive={() => {
                      void handleArchiveProject(project)
                    }}
                    onRestore={() => {
                      void handleRestoreProject(project)
                    }}
                    onDelete={() => {
                      void handleDeleteProject(project)
                    }}
                    onToggleSelect={() => handleToggleProject(project.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredProjects.map((project) => (
                  <ProjectPreviewCard
                    key={project.id}
                    project={project}
                    active={project.id === activeProjectId}
                    batchMode={batchMode}
                    selected={selectedProjectIds.includes(project.id)}
                    viewMode={viewMode}
                    status={project.id === activeProjectId ? activeProjectStatusView : null}
                    onOpen={() => {
                      void handleOpenProject(project.id)
                    }}
                    onRename={() => setDialogState({ mode: 'rename', project })}
                    onDuplicate={() => {
                      void handleDuplicateProject(project)
                    }}
                    onExport={() => {
                      void handleExportProject(project)
                    }}
                    onArchive={() => {
                      void handleArchiveProject(project)
                    }}
                    onRestore={() => {
                      void handleRestoreProject(project)
                    }}
                    onDelete={() => {
                      void handleDeleteProject(project)
                    }}
                    onToggleSelect={() => handleToggleProject(project.id)}
                  />
                ))}
              </div>
            )}
          </div>

          <ProjectNameDialog
            key={`create-project-${dialogState?.mode === 'create'}`}
            open={dialogState?.mode === 'create'}
            title="新建项目"
            defaultValue=""
            onClose={() => setDialogState(null)}
            onSubmit={(value) => {
              void handleCreateProject(value)
            }}
          />

          <ProjectNameDialog
            key={`${dialogState?.project?.id ?? 'rename-project'}-${dialogState?.mode === 'rename'}`}
            open={dialogState?.mode === 'rename'}
            title="重命名"
            defaultValue={dialogState?.project?.name ?? ''}
            onClose={() => setDialogState(null)}
            onSubmit={(value) => {
              void handleRenameProject(value)
            }}
          />

          <ProjectImportConflictDialog
            candidate={importCandidate}
            busy={importBusy}
            onCancel={() => setImportCandidate(null)}
            onResolve={(resolution) => {
              if (importCandidate) void commitImport(importCandidate, resolution)
            }}
          />
        </section>
      </div>
    </div>
  )
}
