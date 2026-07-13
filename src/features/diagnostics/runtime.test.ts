import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyDiagnosticKind, createAppDiagnostic, formatDiagnosticReport } from './runtime.ts'

test('classifies network, permission, missing resource, and persistence failures', () => {
  assert.equal(classifyDiagnosticKind(new TypeError('fetch failed'), 'model'), 'network')
  assert.equal(classifyDiagnosticKind(new Error('HTTP 429 quota exhausted'), 'model'), 'network')
  assert.equal(classifyDiagnosticKind(new Error('Permission denied'), 'persistence'), 'permission')
  assert.equal(classifyDiagnosticKind(new Error('ENOENT asset missing'), 'resource'), 'not-found')
  assert.equal(classifyDiagnosticKind(new Error('disk write failed'), 'persistence'), 'storage')
})

test('creates structured diagnostics without undefined context values', () => {
  const diagnostic = createAppDiagnostic({
    area: 'model',
    title: '图片生成失败',
    error: new Error('HTTP 503 unavailable'),
    code: 'IMAGE_GENERATION_FAILED',
    context: { taskId: 'task-1', provider: 'openai', empty: undefined },
  }, 123)

  assert.equal(diagnostic.code, 'IMAGE_GENERATION_FAILED')
  assert.equal(diagnostic.kind, 'network')
  assert.equal(diagnostic.retryable, true)
  assert.deepEqual(diagnostic.context, { taskId: 'task-1', provider: 'openai' })
  assert.match(formatDiagnosticReport([diagnostic]), /IMAGE_GENERATION_FAILED/)
  assert.match(formatDiagnosticReport([diagnostic]), /taskId=task-1/)
})
