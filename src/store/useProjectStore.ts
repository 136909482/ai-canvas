import { create } from 'zustand'
import { restoreTaskQueueAfterSnapshotLoad } from '@/features/generateQueue/orchestrator'
import { readLegacyWorkspaceData } from '@/features/projectManager/legacyStorage'
import { migrateProjectRecordSnapshots, migrateWorkspaceDataSnapshots } from '@/features/projectManager/migrations'
import {
  resolveProjectPersistenceStatus,
  type ProjectPersistenceMeta,
  type ProjectPersistenceStatus,
} from '@/features/projectManager/persistenceStatus'
import {
  cloneProjectSnapshot,
  replaceWorkspaceSnapshot,
  resetWorkspaceToEmpty,
  serializeProjectSnapshot,
  takeWorkspaceSnapshot,
} from '@/features/projectManager/runtime'
import {
  sanitizeProjectRecordForPersistence,
  sanitizeProjectSnapshotForPersistence,
} from '@/features/projectManager/snapshotSize'
import { platformBridge } from '@/platform'
import type {
  CommitProjectBundleImportResult,
  ProjectBundleImportCandidate,
  ProjectImportResolution,
} from '@/platform/types'
import { useHistoryStore } from '@/store/useHistoryStore'
import { reportDiagnostic } from '@/store/useDiagnosticsStore'
import {
  isStorageConfigured,
  migrateSnapshotEmbeddedImageAssets,
  resolveWorkspaceNodeAssetUrls,
} from '@/store/projectAssetMigration'
import {
  buildPersistedSnapshotMap,
  createProjectRecord,
  createProjectRecordFromSummary,
  getFallbackProject,
  getFallbackProjectSummary,
  normalizeProjectName,
} from '@/store/projectRecords'
import type { ProjectRecord, ProjectSnapshot } from '@/types'

type SaveProjectResult = 'saved' | 'storage-required' | 'no-project'

interface ProjectStore {
  projects: ProjectRecord[]
  activeProjectId: string | null
  lastOpenedProjectId: string | null
  persistedSnapshotByProjectId: Record<string, string>
  persistenceMetaByProjectId: Record<string, ProjectPersistenceMeta>
  isPersisting: boolean
  lastPersistenceError: string | null
  lastThumbnailBackfillCount: number
  hasHydrated: boolean
  isReady: boolean
  ensureInitialized: () => Promise<void>
  syncActiveWorkingSnapshot: () => void
  reloadFromWorkspace: () => Promise<void>
  resolveActiveProjectAssetUrls: () => Promise<void>
  persistWorkspaceFile: () => Promise<SaveProjectResult>
  saveActiveProject: () => Promise<SaveProjectResult>
  createProject: (name?: string) => Promise<string | null>
  duplicateProject: (projectId: string) => Promise<string | null>
  loadProject: (projectId: string) => Promise<boolean>
  renameProject: (projectId: string, name?: string) => Promise<boolean>
  archiveProject: (projectId: string) => Promise<boolean>
  restoreProject: (projectId: string) => Promise<boolean>
  deleteProject: (projectId: string) => Promise<boolean>
  exportProject: (projectId: string) => Promise<boolean>
  prepareProjectImport: () => Promise<ProjectBundleImportCandidate>
  commitProjectImport: (candidateId: string, resolution: ProjectImportResolution) => Promise<CommitProjectBundleImportResult>
  hasUnsavedChanges: () => boolean
  hasPersistedChanges: () => boolean
  getActiveProject: () => ProjectRecord | null
  getActivePersistenceMeta: () => ProjectPersistenceMeta | null
  getActivePersistenceStatus: () => ProjectPersistenceStatus
}

async function restoreProjectWorkspace(snapshot: ProjectSnapshot, projectId: string) {
  platformBridge.clearWorkspaceAssetUrlCache()
  replaceWorkspaceSnapshot(snapshot, projectId)
  useHistoryStore.getState().clearHistory()
  await resolveWorkspaceNodeAssetUrls()
  await restoreTaskQueueAfterSnapshotLoad()
}


async function persistWorkspaceProjectIfConfigured(
  project: ProjectRecord,
  metadata: { activeProjectId: string | null; lastOpenedProjectId: string | null },
) {
  if (!isStorageConfigured()) {
    return false
  }

  try {
    await platformBridge.saveWorkspaceProject({
      project: sanitizeProjectRecordForPersistence(project),
      activeProjectId: metadata.activeProjectId,
      lastOpenedProjectId: metadata.lastOpenedProjectId,
    })
    setProjectPersistenceError(null)
    return true
  } catch (error) {
    setProjectPersistenceError(error)
    return false
  }
}

async function loadWorkspaceProjectForStore(projectId: string) {
  if (!isStorageConfigured()) {
    return null
  }

  const project = await platformBridge.loadWorkspaceProject(projectId).catch(() => null)
  return project ? cloneLoadedProjectRecord(migrateProjectRecordSnapshots(project)) : null
}

function cloneLoadedProjectRecord(project: ProjectRecord) {
  return {
    ...project,
    savedSnapshot: cloneProjectSnapshot(project.savedSnapshot),
    workingSnapshot: cloneProjectSnapshot(project.workingSnapshot),
  }
}

function setProjectPersistenceError(error: unknown, operation = 'background-save') {
  if (error === null || error === undefined) {
    useProjectStore.setState({ lastPersistenceError: null })
    return
  }

  const diagnostic = reportDiagnostic({
    area: 'persistence',
    title: operation === 'manual-save' ? '项目保存失败' : '工作区写入失败',
    error,
    code: operation === 'manual-save' ? 'PROJECT_SAVE_FAILED' : 'WORKSPACE_PERSIST_FAILED',
    context: {
      operation,
      projectId: useProjectStore.getState().activeProjectId,
    },
  })
  useProjectStore.setState({
    lastPersistenceError: diagnostic.message,
  })
}

export const useProjectStore = create<ProjectStore>()((set, get) => {
  const hydrateProjectsFromWorkspace = async (allowLegacyFallback: boolean) => {
    set({ isReady: false })

    const workspaceProjectIndex = await platformBridge.listWorkspaceProjects().catch(() => null)

    if (workspaceProjectIndex?.projects.length) {
      const fallbackProjectSummary = getFallbackProjectSummary(workspaceProjectIndex)
      const loadedFallbackProject = fallbackProjectSummary
        ? await loadWorkspaceProjectForStore(fallbackProjectSummary.id)
        : null

      if (loadedFallbackProject) {
        const now = Date.now()
        const openedProject = {
          ...loadedFallbackProject,
          lastOpenedAt: now,
        }
        const projects = workspaceProjectIndex.projects.map((summary) => (
          summary.id === openedProject.id
            ? openedProject
            : createProjectRecordFromSummary(summary)
        ))

        set({
          projects,
          activeProjectId: openedProject.id,
          lastOpenedProjectId: openedProject.id,
          persistedSnapshotByProjectId: {
            [openedProject.id]: serializeProjectSnapshot(openedProject.workingSnapshot),
          },
          persistenceMetaByProjectId: {},
          isPersisting: false,
          lastPersistenceError: null,
          lastThumbnailBackfillCount: 0,
          hasHydrated: true,
          isReady: false,
        })

        await restoreProjectWorkspace(openedProject.workingSnapshot, openedProject.id)
        set({ isReady: true })

        void persistWorkspaceProjectIfConfigured(openedProject, {
          activeProjectId: openedProject.id,
          lastOpenedProjectId: openedProject.id,
        })
        return
      }
    }

    const workspaceData = await platformBridge.loadWorkspaceData().catch(() => null)
    const initialData = migrateWorkspaceDataSnapshots(workspaceData ?? (allowLegacyFallback ? readLegacyWorkspaceData() : null) ?? {
      projects: [],
      activeProjectId: null,
      lastOpenedProjectId: null,
    })

    const fallbackProject = getFallbackProject(initialData)

    if (!fallbackProject) {
      resetWorkspaceToEmpty()
      set({
        projects: initialData.projects,
        activeProjectId: null,
        lastOpenedProjectId: null,
        persistedSnapshotByProjectId: {},
        persistenceMetaByProjectId: {},
        isPersisting: false,
        lastPersistenceError: null,
        lastThumbnailBackfillCount: 0,
        hasHydrated: true,
        isReady: true,
      })
      return
    }

    const now = Date.now()
    const nextProjects = initialData.projects.map((project: ProjectRecord) => (
      project.id === fallbackProject.id
        ? {
            ...project,
            lastOpenedAt: now,
          }
        : project
    ))

    set({
      projects: nextProjects,
      activeProjectId: fallbackProject.id,
      lastOpenedProjectId: fallbackProject.id,
      persistedSnapshotByProjectId: workspaceData ? buildPersistedSnapshotMap(initialData.projects) : {},
      persistenceMetaByProjectId: {},
      isPersisting: false,
      lastPersistenceError: null,
      lastThumbnailBackfillCount: 0,
      hasHydrated: true,
      isReady: false,
    })

    await restoreProjectWorkspace(fallbackProject.workingSnapshot, fallbackProject.id)
    set({ isReady: true })
  }

  return ({
  projects: [],
  activeProjectId: null,
  lastOpenedProjectId: null,
  persistedSnapshotByProjectId: {},
  persistenceMetaByProjectId: {},
  isPersisting: false,
  lastPersistenceError: null,
  lastThumbnailBackfillCount: 0,
  hasHydrated: false,
  isReady: false,

  ensureInitialized: async () => {
    if (get().hasHydrated) {
      return
    }

    await hydrateProjectsFromWorkspace(true)
  },

  syncActiveWorkingSnapshot: () => {
    const state = get()

    if (!state.isReady || !state.activeProjectId) {
      return
    }

    const workingSnapshot = takeWorkspaceSnapshot()

    set((currentState) => ({
      projects: currentState.projects.map((project) => (
        project.id === currentState.activeProjectId
          ? {
              ...project,
              workingSnapshot,
            }
          : project
      )),
    }))
  },

  reloadFromWorkspace: async () => {
    await hydrateProjectsFromWorkspace(false)
  },

  resolveActiveProjectAssetUrls: async () => {
    if (!get().activeProjectId) {
      return
    }

    await resolveWorkspaceNodeAssetUrls()
  },

  persistWorkspaceFile: async () => {
    const state = get()
    const projectId = state.activeProjectId
    const project = state.projects.find((item) => item.id === projectId)

    if (!projectId || !project) {
      return 'no-project'
    }

    if (!isStorageConfigured()) {
      return 'storage-required'
    }

    set({ isPersisting: true, lastPersistenceError: null })

    try {
      const stats = { thumbnailBackfillCount: 0 }
      const snapshot = sanitizeProjectSnapshotForPersistence(
        await migrateSnapshotEmbeddedImageAssets(takeWorkspaceSnapshot(), { projectId, updateLiveCanvas: true, stats }),
      )
      await platformBridge.saveWorkspaceProject({
        project: sanitizeProjectRecordForPersistence({
          ...project,
          workingSnapshot: cloneProjectSnapshot(snapshot),
        }),
        activeProjectId: state.activeProjectId,
        lastOpenedProjectId: state.lastOpenedProjectId,
      })
      const persistedAt = Date.now()
      const serializedSnapshot = serializeProjectSnapshot(snapshot)

      set((currentState) => ({
        projects: currentState.projects.map((project) => (
          project.id === projectId
            ? {
                ...project,
                workingSnapshot: cloneProjectSnapshot(snapshot),
              }
            : project
        )),
        persistedSnapshotByProjectId: {
          ...currentState.persistedSnapshotByProjectId,
          [projectId]: serializedSnapshot,
        },
        persistenceMetaByProjectId: {
          ...currentState.persistenceMetaByProjectId,
          [projectId]: {
            at: persistedAt,
            mode: 'auto',
          },
        },
        isPersisting: false,
        lastPersistenceError: null,
        lastThumbnailBackfillCount: stats.thumbnailBackfillCount,
      }))

      return 'saved'
    } catch (error) {
      set({
        isPersisting: false,
        lastThumbnailBackfillCount: 0,
      })
      setProjectPersistenceError(error, 'autosave')
      throw error
    }
  },

  saveActiveProject: async () => {
    const state = get()
    const activeProject = state.projects.find((project) => project.id === state.activeProjectId)

    if (!state.activeProjectId || !activeProject) {
      return 'no-project'
    }

    if (!isStorageConfigured()) {
      return 'storage-required'
    }

    const now = Date.now()
    set({ isPersisting: true, lastPersistenceError: null })

    try {
      const stats = { thumbnailBackfillCount: 0 }
      const snapshot = sanitizeProjectSnapshotForPersistence(
        await migrateSnapshotEmbeddedImageAssets(takeWorkspaceSnapshot(), { projectId: state.activeProjectId, updateLiveCanvas: true, stats }),
      )
      const nextActiveProject = {
        ...activeProject,
        savedSnapshot: cloneProjectSnapshot(snapshot),
        workingSnapshot: cloneProjectSnapshot(snapshot),
        updatedAt: now,
        lastOpenedAt: now,
      }
      const nextProjects = state.projects.map((project) => (
        project.id === state.activeProjectId
          ? nextActiveProject
          : project
      ))

      const nextState = {
        projects: nextProjects,
        activeProjectId: state.activeProjectId,
        lastOpenedProjectId: state.activeProjectId,
      }

      await platformBridge.saveWorkspaceProject({
        project: sanitizeProjectRecordForPersistence(nextActiveProject),
        activeProjectId: nextState.activeProjectId,
        lastOpenedProjectId: nextState.lastOpenedProjectId,
      })

      const serializedSnapshot = serializeProjectSnapshot(snapshot)

      set((currentState) => ({
        ...nextState,
        persistedSnapshotByProjectId: currentState.activeProjectId
          ? {
              ...currentState.persistedSnapshotByProjectId,
              [currentState.activeProjectId]: serializedSnapshot,
            }
          : currentState.persistedSnapshotByProjectId,
        persistenceMetaByProjectId: currentState.activeProjectId
          ? {
              ...currentState.persistenceMetaByProjectId,
              [currentState.activeProjectId]: {
                at: now,
                mode: 'manual',
              },
            }
          : currentState.persistenceMetaByProjectId,
        isPersisting: false,
        lastPersistenceError: null,
        lastThumbnailBackfillCount: stats.thumbnailBackfillCount,
      }))
      return 'saved'
    } catch (error) {
      set({
        isPersisting: false,
        lastThumbnailBackfillCount: 0,
      })
      setProjectPersistenceError(error, 'manual-save')
      throw error
    }
  },

  createProject: async (name) => {
    if (!isStorageConfigured()) {
      return null
    }

    get().syncActiveWorkingSnapshot()

    const project = createProjectRecord(name)

    set((state) => ({
      projects: [...state.projects, project],
      activeProjectId: project.id,
      lastOpenedProjectId: project.id,
      isReady: false,
    }))

    await restoreProjectWorkspace(project.workingSnapshot, project.id)
    set({ isReady: true })

    const persisted = await persistWorkspaceProjectIfConfigured(project, {
      activeProjectId: project.id,
      lastOpenedProjectId: project.id,
    })

    if (persisted) {
      set((currentState) => ({
        persistedSnapshotByProjectId: {
          ...currentState.persistedSnapshotByProjectId,
          [project.id]: serializeProjectSnapshot(project.workingSnapshot),
        },
      }))
    }

    return project.id
  },

  duplicateProject: async (projectId) => {
    get().syncActiveWorkingSnapshot()

    const currentState = get()
    const sourceProject = projectId === currentState.activeProjectId
      ? currentState.projects.find((item) => item.id === projectId)
      : await loadWorkspaceProjectForStore(projectId)
        ?? currentState.projects.find((item) => item.id === projectId)

    if (!sourceProject) {
      return null
    }

    const project = createProjectRecord(`${sourceProject.name} 副本`, sourceProject.workingSnapshot)

    set((state) => ({
      projects: [...state.projects, project],
    }))

    const persisted = await persistWorkspaceProjectIfConfigured(project, {
      activeProjectId: get().activeProjectId,
      lastOpenedProjectId: get().lastOpenedProjectId,
    })

    if (persisted) {
      set((currentState) => ({
        persistedSnapshotByProjectId: {
          ...currentState.persistedSnapshotByProjectId,
          [project.id]: serializeProjectSnapshot(project.workingSnapshot),
        },
      }))
    }

    return project.id
  },

  loadProject: async (projectId) => {
    get().syncActiveWorkingSnapshot()

    if (get().activeProjectId === projectId) {
      return true
    }

    const project = await loadWorkspaceProjectForStore(projectId)
      ?? get().projects.find((item) => item.id === projectId)

    if (!project || project.archivedAt) {
      return false
    }

    const now = Date.now()
    const openedProject = {
      ...project,
      lastOpenedAt: now,
    }

    set((state) => ({
      projects: state.projects.map((item) => (
        item.id === projectId
          ? openedProject
          : item
      )),
      activeProjectId: projectId,
      lastOpenedProjectId: projectId,
      persistedSnapshotByProjectId: {
        ...state.persistedSnapshotByProjectId,
        [projectId]: serializeProjectSnapshot(openedProject.workingSnapshot),
      },
      isReady: false,
    }))

    await restoreProjectWorkspace(openedProject.workingSnapshot, openedProject.id)
    set({ isReady: true })

    await persistWorkspaceProjectIfConfigured(openedProject, {
      activeProjectId: projectId,
      lastOpenedProjectId: projectId,
    })

    return true
  },

  renameProject: async (projectId, name) => {
    if (get().activeProjectId === projectId) {
      get().syncActiveWorkingSnapshot()
    }

    const state = get()
    const project = await loadWorkspaceProjectForStore(projectId)
      ?? state.projects.find((item) => item.id === projectId)

    if (!project) {
      return false
    }

    const normalizedName = normalizeProjectName(name)
    const now = Date.now()

    set((currentState) => ({
      projects: currentState.projects.map((item) => (
        item.id === projectId
          ? {
              ...item,
              name: normalizedName,
              updatedAt: now,
            }
          : item
      )),
    }))

    const renamedProject = {
      ...project,
      name: normalizedName,
      updatedAt: now,
      workingSnapshot: projectId === state.activeProjectId
        ? cloneProjectSnapshot(takeWorkspaceSnapshot())
        : project.workingSnapshot,
    }

    await persistWorkspaceProjectIfConfigured(renamedProject, {
      activeProjectId: state.activeProjectId,
      lastOpenedProjectId: state.lastOpenedProjectId,
    })

    return true
  },

  archiveProject: async (projectId) => {
    if (get().activeProjectId === projectId) {
      get().syncActiveWorkingSnapshot()
    }

    const state = get()
    const project = await loadWorkspaceProjectForStore(projectId)
      ?? state.projects.find((item) => item.id === projectId)

    if (!project || project.archivedAt) {
      return false
    }

    const now = Date.now()
    const archivedProject = {
      ...project,
      archivedAt: now,
      updatedAt: now,
      workingSnapshot: projectId === state.activeProjectId
        ? cloneProjectSnapshot(takeWorkspaceSnapshot())
        : project.workingSnapshot,
    }
    const nextProjects = state.projects.map((item) => (
      item.id === projectId
        ? { ...item, archivedAt: now, updatedAt: now }
        : item
    ))

    if (state.activeProjectId !== projectId) {
      set({ projects: nextProjects })
      await persistWorkspaceProjectIfConfigured(archivedProject, {
        activeProjectId: state.activeProjectId,
        lastOpenedProjectId: state.lastOpenedProjectId,
      })
      return true
    }

    const fallbackProject = getFallbackProject({
      projects: nextProjects,
      activeProjectId: null,
      lastOpenedProjectId: state.lastOpenedProjectId === projectId ? null : state.lastOpenedProjectId,
    })

    if (!fallbackProject) {
      set({
        projects: nextProjects,
        activeProjectId: null,
        lastOpenedProjectId: null,
        persistedSnapshotByProjectId: {},
        persistenceMetaByProjectId: {},
        isReady: true,
      })
      resetWorkspaceToEmpty()
      await persistWorkspaceProjectIfConfigured(archivedProject, {
        activeProjectId: null,
        lastOpenedProjectId: null,
      })
      return true
    }

    const loadedFallbackProject = await loadWorkspaceProjectForStore(fallbackProject.id)
    const openedFallbackProject = {
      ...(loadedFallbackProject ?? fallbackProject),
      lastOpenedAt: now,
    }
    set({
      projects: nextProjects.map((item) => (
        item.id === openedFallbackProject.id ? openedFallbackProject : item
      )),
      activeProjectId: openedFallbackProject.id,
      lastOpenedProjectId: openedFallbackProject.id,
      persistedSnapshotByProjectId: {
        [openedFallbackProject.id]: serializeProjectSnapshot(openedFallbackProject.workingSnapshot),
      },
      persistenceMetaByProjectId: {},
      isReady: false,
    })
    await restoreProjectWorkspace(openedFallbackProject.workingSnapshot, openedFallbackProject.id)
    set({ isReady: true })
    await persistWorkspaceProjectIfConfigured(archivedProject, {
      activeProjectId: openedFallbackProject.id,
      lastOpenedProjectId: openedFallbackProject.id,
    })
    await persistWorkspaceProjectIfConfigured(openedFallbackProject, {
      activeProjectId: openedFallbackProject.id,
      lastOpenedProjectId: openedFallbackProject.id,
    })
    return true
  },

  restoreProject: async (projectId) => {
    const state = get()
    const project = await loadWorkspaceProjectForStore(projectId)
      ?? state.projects.find((item) => item.id === projectId)

    if (!project || !project.archivedAt) {
      return false
    }

    const restoredProject = {
      ...project,
      archivedAt: null,
      updatedAt: Date.now(),
    }
    set((currentState) => ({
      projects: currentState.projects.map((item) => (
        item.id === projectId
          ? { ...item, archivedAt: null, updatedAt: restoredProject.updatedAt }
          : item
      )),
    }))
    await persistWorkspaceProjectIfConfigured(restoredProject, {
      activeProjectId: state.activeProjectId,
      lastOpenedProjectId: state.lastOpenedProjectId,
    })
    return true
  },

  deleteProject: async (projectId) => {
    const state = get()
    const project = state.projects.find((item) => item.id === projectId)

    if (!project) {
      return false
    }

    const remainingProjects = state.projects.filter((item) => item.id !== projectId)

    if (remainingProjects.length === 0) {
      set({
        projects: [],
        activeProjectId: null,
        lastOpenedProjectId: null,
        persistedSnapshotByProjectId: {},
        persistenceMetaByProjectId: {},
        isReady: true,
      })
      resetWorkspaceToEmpty()
      if (isStorageConfigured()) {
        await platformBridge.deleteWorkspaceProject({
          projectId,
          activeProjectId: null,
          lastOpenedProjectId: null,
        }).catch(setProjectPersistenceError)
      }
      return true
    }

    const availableProjects = remainingProjects.filter((item) => !item.archivedAt)

    if (state.activeProjectId === projectId && availableProjects.length === 0) {
      set({
        projects: remainingProjects,
        activeProjectId: null,
        lastOpenedProjectId: null,
        persistedSnapshotByProjectId: {},
        persistenceMetaByProjectId: {},
        isReady: true,
      })
      resetWorkspaceToEmpty()
      if (isStorageConfigured()) {
        await platformBridge.deleteWorkspaceProject({
          projectId,
          activeProjectId: null,
          lastOpenedProjectId: null,
        }).catch(setProjectPersistenceError)
      }
      return true
    }

    const fallbackProject = availableProjects.find((item) => item.id === state.lastOpenedProjectId)
      ?? availableProjects.find((item) => item.id === state.activeProjectId && state.activeProjectId !== projectId)
      ?? availableProjects[0]

    if (state.activeProjectId === projectId) {
      const now = Date.now()
      const loadedFallbackProject = await loadWorkspaceProjectForStore(fallbackProject.id)
      const nextFallbackProject = {
        ...(loadedFallbackProject ?? fallbackProject),
        lastOpenedAt: now,
      }

      set({
        projects: remainingProjects.map((item) => (
          item.id === fallbackProject.id
            ? nextFallbackProject
            : item
        )),
        activeProjectId: fallbackProject.id,
        lastOpenedProjectId: fallbackProject.id,
        persistedSnapshotByProjectId: Object.fromEntries(
          [
            ...Object.entries(state.persistedSnapshotByProjectId).filter(([id]) => id !== projectId),
            [fallbackProject.id, serializeProjectSnapshot(nextFallbackProject.workingSnapshot)] as const,
          ],
        ),
        persistenceMetaByProjectId: Object.fromEntries(
          Object.entries(state.persistenceMetaByProjectId).filter(([id]) => id !== projectId),
        ),
        isReady: false,
      })

      await restoreProjectWorkspace(nextFallbackProject.workingSnapshot, nextFallbackProject.id)
      set({ isReady: true })
      if (isStorageConfigured()) {
        await platformBridge.deleteWorkspaceProject({
          projectId,
          activeProjectId: fallbackProject.id,
          lastOpenedProjectId: fallbackProject.id,
        }).catch(setProjectPersistenceError)
        await persistWorkspaceProjectIfConfigured(nextFallbackProject, {
          activeProjectId: fallbackProject.id,
          lastOpenedProjectId: fallbackProject.id,
        })
      }
      return true
    }

      set({
        projects: remainingProjects,
        lastOpenedProjectId: state.lastOpenedProjectId === projectId ? fallbackProject?.id ?? null : state.lastOpenedProjectId,
        persistedSnapshotByProjectId: Object.fromEntries(
          Object.entries(state.persistedSnapshotByProjectId).filter(([id]) => id !== projectId),
        ),
        persistenceMetaByProjectId: Object.fromEntries(
          Object.entries(state.persistenceMetaByProjectId).filter(([id]) => id !== projectId),
        ),
      })

    if (isStorageConfigured()) {
      await platformBridge.deleteWorkspaceProject({
        projectId,
        activeProjectId: get().activeProjectId,
        lastOpenedProjectId: get().lastOpenedProjectId,
      }).catch(setProjectPersistenceError)
    }
    return true
  },

  exportProject: async (projectId) => {
    if (!isStorageConfigured()) {
      return false
    }

    if (get().activeProjectId === projectId) {
      get().syncActiveWorkingSnapshot()
    }

    const state = get()
    const project = await loadWorkspaceProjectForStore(projectId)
      ?? state.projects.find((item) => item.id === projectId)

    if (!project) {
      return false
    }

    const exportProject = projectId === state.activeProjectId
      ? {
          ...project,
          workingSnapshot: cloneProjectSnapshot(takeWorkspaceSnapshot()),
        }
      : project

    await platformBridge.exportProjectBundle({
      project: sanitizeProjectRecordForPersistence(exportProject),
      suggestedName: exportProject.name,
    })
    return true
  },

  prepareProjectImport: () => platformBridge.prepareProjectBundleImport(),

  commitProjectImport: async (candidateId, resolution) => {
    const result = await platformBridge.commitProjectBundleImport({ candidateId, resolution })
    await get().reloadFromWorkspace()
    return result
  },

  hasUnsavedChanges: () => {
    const state = get()
    const activeProject = state.projects.find((project) => project.id === state.activeProjectId)

    if (!activeProject || !state.isReady) {
      return false
    }

    return serializeProjectSnapshot(takeWorkspaceSnapshot()) !== serializeProjectSnapshot(activeProject.savedSnapshot)
  },

  hasPersistedChanges: () => {
    const state = get()
    const activeProject = state.projects.find((project) => project.id === state.activeProjectId)

    if (!activeProject || !state.isReady) {
      return false
    }

    const persistedSnapshot = state.activeProjectId
      ? state.persistedSnapshotByProjectId[state.activeProjectId]
      : null

    if (!persistedSnapshot) {
      return true
    }

    return serializeProjectSnapshot(takeWorkspaceSnapshot()) !== persistedSnapshot
  },

  getActiveProject: () => {
    const state = get()
    return state.projects.find((project) => project.id === state.activeProjectId) ?? null
  },

  getActivePersistenceMeta: () => {
    const state = get()

    if (!state.activeProjectId) {
      return null
    }

    return state.persistenceMetaByProjectId[state.activeProjectId] ?? null
  },

  getActivePersistenceStatus: () => {
    const state = get()

    return resolveProjectPersistenceStatus({
      activeProjectId: state.activeProjectId,
      storageConfigured: isStorageConfigured(),
      isReady: state.isReady,
      isPersisting: state.isPersisting,
      lastPersistenceError: state.lastPersistenceError,
      hasPersistedChanges: state.hasPersistedChanges(),
      hasUnsavedChanges: state.hasUnsavedChanges(),
      persistenceMeta: state.getActivePersistenceMeta(),
    })
  },
})
})
