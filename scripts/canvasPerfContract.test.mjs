import assert from 'node:assert/strict'
import test from 'node:test'
import {
  evaluateCanvasPerformanceBudget,
  getCanvasPerformanceBudget,
  validateCanvasPerformanceSample,
} from './canvasPerfContract.mjs'

test('uses the documented strict budget for image-dense interactions', () => {
  assert.deepEqual(getCanvasPerformanceBudget({
    nodeCount: 44,
    imageCount: 41,
    gesture: 'pan',
  }), {
    name: 'image-dense-interaction',
    averageFrameMs: 17,
    p95FrameMs: 16.8,
    maxFramesOver32: 1,
    longTaskTotalMs: 120,
  })
})

test('does not let the old workspace p95 threshold pass', () => {
  const budget = getCanvasPerformanceBudget({ nodeCount: 44, imageCount: 41, gesture: 'zoom' })
  const result = evaluateCanvasPerformanceBudget({
    averageFrameMs: 16.9,
    p95FrameMs: 23,
    framesOver32ms: 0,
    longTaskTotalMs: 0,
    maxLowQualityPlaceholderCount: 0,
  }, budget)

  assert.equal(result.passed, false)
  assert.match(result.failures.join('\n'), /p95 frame/)
})

test('accepts floating point noise at the exact frame budget boundary', () => {
  const budget = getCanvasPerformanceBudget({ nodeCount: 80, imageCount: 80, gesture: 'pan' })
  const result = evaluateCanvasPerformanceBudget({
    averageFrameMs: 16.80000000001,
    p95FrameMs: 16.80000000001,
    framesOver32ms: 0,
    longTaskTotalMs: 0,
    maxLowQualityPlaceholderCount: 0,
  }, budget)

  assert.equal(result.passed, true)
})

test('allows one isolated long frame but rejects repeated long frames', () => {
  const budget = getCanvasPerformanceBudget({ nodeCount: 45, imageCount: 41, gesture: 'pan' })
  const baseSummary = {
    averageFrameMs: 16.9,
    p95FrameMs: 16.8,
    longTaskTotalMs: 0,
    maxLowQualityPlaceholderCount: 0,
  }

  assert.equal(evaluateCanvasPerformanceBudget({
    ...baseSummary,
    framesOver32ms: 1,
  }, budget).passed, true)
  assert.equal(evaluateCanvasPerformanceBudget({
    ...baseSummary,
    framesOver32ms: 2,
  }, budget).passed, false)
})

test('rejects a zoom sample that did not change the viewport', () => {
  const result = validateCanvasPerformanceSample({
    gesture: 'zoom',
    zoomBefore: 0.8,
    zoomAfter: 0.8,
    zoomChanges: 0,
    zoomFrom: 0.8,
    zoomTo: 0.24,
    panZoom: 1 / 6,
  })

  assert.equal(result.valid, false)
  assert.match(result.failures.join('\n'), /did not change/)
  assert.match(result.failures.join('\n'), /did not reach/)
})

test('accepts pan only after its explicit zoom preset is reached', () => {
  assert.equal(validateCanvasPerformanceSample({
    gesture: 'pan',
    zoomBefore: 1 / 6,
    zoomAfter: 1 / 6,
    zoomChanges: 0,
    zoomFrom: 0.8,
    zoomTo: 0.24,
    panZoom: 1 / 6,
  }).valid, true)

  assert.equal(validateCanvasPerformanceSample({
    gesture: 'pan',
    zoomBefore: 0.3,
    zoomAfter: 0.3,
    zoomChanges: 0,
    zoomFrom: 0.8,
    zoomTo: 0.24,
    panZoom: 1 / 6,
  }).valid, false)
})
