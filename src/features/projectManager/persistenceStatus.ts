export type ProjectPersistenceMode = 'manual' | 'auto'

export interface ProjectPersistenceMeta {
  at: number
  mode: ProjectPersistenceMode
}

export type ProjectPersistenceStatus =
  | { kind: 'no-project' }
  | { kind: 'restoring' }
  | { kind: 'storage-required' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string }
  | { kind: 'pending-autosave' }
  | { kind: 'auto-saved-manual-dirty'; at: number }
  | { kind: 'auto-saved'; at: number }
  | { kind: 'manual-saved'; at: number }
  | { kind: 'not-saved' }

export interface ResolveProjectPersistenceStatusInput {
  activeProjectId: string | null
  storageConfigured: boolean
  isReady: boolean
  isPersisting: boolean
  lastPersistenceError: string | null
  hasPersistedChanges: boolean
  hasUnsavedChanges: boolean
  persistenceMeta: ProjectPersistenceMeta | null
}

export function resolveProjectPersistenceStatus(input: ResolveProjectPersistenceStatusInput): ProjectPersistenceStatus {
  if (!input.activeProjectId) {
    return { kind: 'no-project' }
  }

  if (!input.isReady) {
    return { kind: 'restoring' }
  }

  if (!input.storageConfigured) {
    return { kind: 'storage-required' }
  }

  if (input.isPersisting) {
    return { kind: 'saving' }
  }

  if (input.lastPersistenceError) {
    return { kind: 'error', message: input.lastPersistenceError }
  }

  if (input.hasPersistedChanges) {
    return { kind: 'pending-autosave' }
  }

  if (input.persistenceMeta?.mode === 'auto') {
    return input.hasUnsavedChanges
      ? { kind: 'auto-saved-manual-dirty', at: input.persistenceMeta.at }
      : { kind: 'auto-saved', at: input.persistenceMeta.at }
  }

  if (input.persistenceMeta?.mode === 'manual') {
    return { kind: 'manual-saved', at: input.persistenceMeta.at }
  }

  return { kind: 'not-saved' }
}
