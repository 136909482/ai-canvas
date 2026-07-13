import type { ProjectRecord, ProjectSnapshot, WorkspaceData } from '../../types/index.ts'

export interface WorkspaceManifestProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  archivedAt?: number | null
  fileName: string
}

export interface WorkspaceManifest {
  activeProjectId: string | null
  lastOpenedProjectId: string | null
  projects: WorkspaceManifestProject[]
}

export type StoredProjectRecord = Omit<ProjectRecord, 'savedSnapshot'> & {
  storageVersion?: 2
  savedSnapshot?: ProjectSnapshot | null
  savedSnapshotSameAsWorking?: boolean
}

export function isLegacyWorkspaceData(value: unknown): value is WorkspaceData {
  if (!value || typeof value !== 'object') {
    return false
  }

  const data = value as Partial<WorkspaceData>
  return Array.isArray(data.projects)
    && data.projects.every((project) => (
      project
      && typeof project === 'object'
      && 'savedSnapshot' in project
      && 'workingSnapshot' in project
    ))
}

export function isWorkspaceManifest(value: unknown): value is WorkspaceManifest {
  if (!value || typeof value !== 'object') {
    return false
  }

  const manifest = value as Partial<WorkspaceManifest>
  return Array.isArray(manifest.projects)
    && manifest.projects.every((project) => (
      project
      && typeof project === 'object'
      && typeof project.fileName === 'string'
      && typeof project.id === 'string'
    ))
}

function isProjectSnapshot(value: unknown): value is ProjectSnapshot {
  if (!value || typeof value !== 'object') {
    return false
  }

  const snapshot = value as Partial<ProjectSnapshot>
  return Boolean(
    snapshot.canvas
    && typeof snapshot.canvas === 'object'
    && Array.isArray(snapshot.canvas.nodes)
    && Array.isArray(snapshot.canvas.edges)
    && snapshot.taskQueue
    && typeof snapshot.taskQueue === 'object'
    && Array.isArray(snapshot.taskQueue.tasks),
  )
}

export function normalizeStoredProjectRecord(
  project: ProjectRecord | StoredProjectRecord | null,
): ProjectRecord | null {
  if (!project || typeof project !== 'object' || !isProjectSnapshot(project.workingSnapshot)) {
    return null
  }

  const savedSnapshot = isProjectSnapshot(project.savedSnapshot)
    ? project.savedSnapshot
    : project.workingSnapshot

  return {
    ...project,
    savedSnapshot,
    workingSnapshot: project.workingSnapshot,
    createdAt: typeof project.createdAt === 'number' ? project.createdAt : Date.now(),
    updatedAt: typeof project.updatedAt === 'number' ? project.updatedAt : Date.now(),
    lastOpenedAt: typeof project.lastOpenedAt === 'number' ? project.lastOpenedAt : Date.now(),
    archivedAt: typeof project.archivedAt === 'number' ? project.archivedAt : null,
  } satisfies ProjectRecord
}
