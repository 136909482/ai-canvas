import { useCanvasStore } from '@/store/useCanvasStore'
import { useTaskQueueStore } from '@/store/useTaskQueueStore'
import type { ProjectSnapshot } from '@/types'
import { cloneSerializable } from '@/utils/clone'
import {
  CURRENT_PROJECT_SNAPSHOT_SCHEMA_VERSION,
  migrateProjectSnapshot,
  type PersistedProjectSnapshot,
} from './migrations'
import { sanitizeProjectSnapshotForPersistence } from './snapshotSize'

export const DEFAULT_PROJECT_NAME = '未命名项目'
export { CURRENT_PROJECT_SNAPSHOT_SCHEMA_VERSION, migrateProjectSnapshot }

export function createEmptyProjectSnapshot(): ProjectSnapshot {
  return {
    schemaVersion: CURRENT_PROJECT_SNAPSHOT_SCHEMA_VERSION,
    canvas: {
      nodes: [],
      edges: [],
    },
    taskQueue: {
      tasks: [],
    },
  }
}

export function cloneProjectSnapshot(snapshot: ProjectSnapshot | PersistedProjectSnapshot): ProjectSnapshot {
  return migrateProjectSnapshot(cloneSerializable(snapshot))
}

export function takeWorkspaceSnapshot(): ProjectSnapshot {
  return sanitizeProjectSnapshotForPersistence(cloneProjectSnapshot({
    schemaVersion: CURRENT_PROJECT_SNAPSHOT_SCHEMA_VERSION,
    canvas: useCanvasStore.getState().getSnapshot(),
    taskQueue: useTaskQueueStore.getState().getSnapshot(),
  }))
}

export function replaceWorkspaceSnapshot(
  snapshot: ProjectSnapshot | PersistedProjectSnapshot,
  projectId?: string | null,
) {
  const clonedSnapshot = cloneProjectSnapshot(snapshot)
  useCanvasStore.getState().replaceSnapshot(clonedSnapshot.canvas)
  useTaskQueueStore.getState().replaceSnapshot(clonedSnapshot.taskQueue, projectId)
}

export function resetWorkspaceToEmpty() {
  useCanvasStore.getState().resetToEmpty()
  useTaskQueueStore.getState().resetToEmpty()
}

export function serializeProjectSnapshot(snapshot: ProjectSnapshot) {
  return JSON.stringify(sanitizeProjectSnapshotForPersistence(cloneProjectSnapshot(snapshot)))
}
