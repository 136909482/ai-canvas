import { getProjectManagerStatusView } from './projectManagerStatus.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function runProjectManagerStatusTests() {
  const storageRequired = getProjectManagerStatusView({ kind: 'storage-required' })
  assert(storageRequired.label === '未配置存储', 'project manager should explain missing storage')
  assert(storageRequired.tone === 'warning', 'missing storage should be a warning')

  const pendingAutosave = getProjectManagerStatusView({ kind: 'pending-autosave' })
  assert(pendingAutosave.label === '待自动保存', 'project manager should distinguish pending autosave')
  assert(pendingAutosave.tone === 'warning', 'pending autosave should be a warning')

  const autoSavedManualDirty = getProjectManagerStatusView({ kind: 'auto-saved-manual-dirty', at: 1 })
  assert(autoSavedManualDirty.label === '已自动保存', 'auto-saved manual dirty state should stay compact')
  assert(autoSavedManualDirty.title.includes('尚未手动保存'), 'auto-saved manual dirty title should explain the manual savepoint')

  const manualSaved = getProjectManagerStatusView({ kind: 'manual-saved', at: 1 })
  assert(manualSaved.label === '已手动保存', 'manual save state should be visible')
  assert(manualSaved.tone === 'success', 'manual save should be a success state')

  const error = getProjectManagerStatusView({ kind: 'error', message: 'write failed' })
  assert(error.label === '保存失败', 'save errors should be visible in project manager')
  assert(error.title === 'write failed', 'save error detail should be preserved')
  assert(error.tone === 'danger', 'save errors should use danger tone')
}

runProjectManagerStatusTests()
