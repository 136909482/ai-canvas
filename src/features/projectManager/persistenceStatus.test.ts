import { resolveProjectPersistenceStatus, type ResolveProjectPersistenceStatusInput } from './persistenceStatus.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function createInput(overrides: Partial<ResolveProjectPersistenceStatusInput> = {}): ResolveProjectPersistenceStatusInput {
  return {
    activeProjectId: 'project-1',
    storageConfigured: true,
    isReady: true,
    isPersisting: false,
    lastPersistenceError: null,
    hasPersistedChanges: false,
    hasUnsavedChanges: false,
    persistenceMeta: null,
    ...overrides,
  }
}

function runProjectPersistenceStatusTests() {
  assert(resolveProjectPersistenceStatus(createInput({ activeProjectId: null })).kind === 'no-project', 'no active project should be explicit')
  assert(resolveProjectPersistenceStatus(createInput({ isReady: false })).kind === 'restoring', 'project restoration should be explicit')
  assert(resolveProjectPersistenceStatus(createInput({ storageConfigured: false })).kind === 'storage-required', 'missing workspace storage should be explicit')
  assert(resolveProjectPersistenceStatus(createInput({ isPersisting: true, lastPersistenceError: 'old error' })).kind === 'saving', 'saving should override stale errors')

  const errorStatus = resolveProjectPersistenceStatus(createInput({ lastPersistenceError: 'write failed' }))
  assert(errorStatus.kind === 'error' && errorStatus.message === 'write failed', 'save errors should expose the reason')

  assert(resolveProjectPersistenceStatus(createInput({ hasPersistedChanges: true })).kind === 'pending-autosave', 'persisted changes should wait for autosave')
  assert(resolveProjectPersistenceStatus(createInput({ persistenceMeta: { mode: 'auto', at: 10 } })).kind === 'auto-saved', 'auto save metadata should be visible')
  assert(resolveProjectPersistenceStatus(createInput({ persistenceMeta: { mode: 'auto', at: 10 }, hasUnsavedChanges: true })).kind === 'auto-saved-manual-dirty', 'auto persisted changes should still surface manual save dirtiness')
  assert(resolveProjectPersistenceStatus(createInput({ persistenceMeta: { mode: 'manual', at: 20 }, hasUnsavedChanges: true })).kind === 'manual-saved', 'manual save metadata should remain the primary savepoint state')
  assert(resolveProjectPersistenceStatus(createInput()).kind === 'not-saved', 'projects without persistence metadata should be marked unsaved')
}

runProjectPersistenceStatusTests()
