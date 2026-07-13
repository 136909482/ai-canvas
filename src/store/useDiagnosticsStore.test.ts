import assert from 'node:assert/strict'
import test from 'node:test'
import { useFeedbackStore } from './useFeedbackStore.ts'
import { reportDiagnostic, useDiagnosticsStore } from './useDiagnosticsStore.ts'

function resetStores() {
  useDiagnosticsStore.setState({ diagnostics: [], isOpen: false })
  useFeedbackStore.setState({ toasts: [], confirmRequest: null })
}

test('deduplicates repeated diagnostics and links error feedback to the record', () => {
  resetStores()
  const input = {
    area: 'model' as const,
    title: '图片生成失败',
    error: 'HTTP 503 unavailable',
    code: 'IMAGE_GENERATION_FAILED',
  }

  const first = reportDiagnostic(input)
  const duplicate = reportDiagnostic(input)

  assert.equal(duplicate.id, first.id)
  assert.equal(useDiagnosticsStore.getState().diagnostics.length, 1)
  assert.equal(useFeedbackStore.getState().toasts.length, 1)
  assert.equal(useFeedbackStore.getState().toasts[0]?.diagnosticId, first.id)
})

test('keeps only the latest 50 session diagnostics', () => {
  resetStores()

  for (let index = 0; index < 55; index += 1) {
    reportDiagnostic({
      area: 'resource',
      title: '资源恢复失败',
      error: `missing asset ${index}`,
      code: `ASSET_${index}`,
    }, { notify: false })
  }

  const diagnostics = useDiagnosticsStore.getState().diagnostics
  assert.equal(diagnostics.length, 50)
  assert.equal(diagnostics[0]?.code, 'ASSET_54')
  assert.equal(diagnostics.at(-1)?.code, 'ASSET_5')
})
