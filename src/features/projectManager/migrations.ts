import type { CanvasSnapshot, ProjectRecord, ProjectSnapshot, TaskQueueSnapshot, WorkspaceData } from '@/types'

export const CURRENT_PROJECT_SNAPSHOT_SCHEMA_VERSION = 1

type PersistedCanvasSnapshot = Partial<CanvasSnapshot> | null | undefined
type PersistedTaskQueueSnapshot = Partial<TaskQueueSnapshot> | null | undefined

export type PersistedProjectSnapshot = Omit<Partial<ProjectSnapshot>, 'canvas' | 'taskQueue'> & {
  schemaVersion?: number | null
  canvas?: PersistedCanvasSnapshot
  taskQueue?: PersistedTaskQueueSnapshot
}

function getPersistedSchemaVersion(snapshot: PersistedProjectSnapshot) {
  return typeof snapshot.schemaVersion === 'number' && Number.isFinite(snapshot.schemaVersion)
    ? snapshot.schemaVersion
    : 0
}

function normalizeCanvasSnapshot(snapshot: PersistedCanvasSnapshot): CanvasSnapshot {
  return {
    nodes: Array.isArray(snapshot?.nodes) ? snapshot.nodes : [],
    edges: Array.isArray(snapshot?.edges) ? snapshot.edges : [],
  }
}

function normalizeTaskQueueSnapshot(snapshot: PersistedTaskQueueSnapshot): TaskQueueSnapshot {
  return {
    tasks: Array.isArray(snapshot?.tasks) ? snapshot.tasks : [],
  }
}

export function migrateProjectSnapshot(snapshot: PersistedProjectSnapshot): ProjectSnapshot {
  const schemaVersion = getPersistedSchemaVersion(snapshot)

  if (schemaVersion > CURRENT_PROJECT_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error('项目快照版本高于当前应用支持版本，请升级应用后再打开。')
  }

  return {
    ...snapshot,
    schemaVersion: CURRENT_PROJECT_SNAPSHOT_SCHEMA_VERSION,
    canvas: normalizeCanvasSnapshot(snapshot.canvas),
    taskQueue: normalizeTaskQueueSnapshot(snapshot.taskQueue),
  }
}

export function migrateProjectRecordSnapshots(project: ProjectRecord): ProjectRecord {
  return {
    ...project,
    savedSnapshot: migrateProjectSnapshot(project.savedSnapshot),
    workingSnapshot: migrateProjectSnapshot(project.workingSnapshot),
  }
}

export function migrateWorkspaceDataSnapshots(data: WorkspaceData): WorkspaceData {
  return {
    ...data,
    projects: data.projects.map((project) => migrateProjectRecordSnapshots(project)),
  }
}
