import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HISTORY_DANGER_BYTE_LIMIT,
  HISTORY_WARNING_BYTE_LIMIT,
  analyzeHistorySize,
  getHistorySizeStatus,
} from './historyDiagnostics.ts'
import type { CanvasSnapshot } from '@/types'

function createSnapshot(text: string): CanvasSnapshot {
  return {
    nodes: [{ id: 'text-1', type: 'textNode', position: { x: 0, y: 0 }, data: { text } }],
    edges: [],
  }
}

test('reports history entries, UTF-8 bytes, and the largest snapshot', () => {
  const report = analyzeHistorySize({
    past: [createSnapshot('短文本'), createSnapshot('较长正文'.repeat(200))],
    future: [createSnapshot('redo')],
    pendingBaseline: createSnapshot('pending'),
  })

  assert.equal(report.totalEntryCount, 4)
  assert.equal(report.pastEntryCount, 2)
  assert.equal(report.futureEntryCount, 1)
  assert.equal(report.pendingEntryCount, 1)
  assert.ok(report.totalByteSize > 0)
  assert.equal(report.largestSnapshot?.stack, 'past')
  assert.equal(report.largestSnapshot?.index, 1)
})

test('classifies history byte thresholds without mutating snapshot text', () => {
  const text = '完整正文'
  const snapshot = createSnapshot(text)
  const report = analyzeHistorySize({ past: [snapshot], future: [], pendingBaseline: null })

  assert.equal(getHistorySizeStatus(HISTORY_WARNING_BYTE_LIMIT - 1), 'ok')
  assert.equal(getHistorySizeStatus(HISTORY_WARNING_BYTE_LIMIT), 'warning')
  assert.equal(getHistorySizeStatus(HISTORY_DANGER_BYTE_LIMIT), 'danger')
  assert.equal(snapshot.nodes[0].data.text, text)
  assert.equal(report.totalEntryCount, 1)
})
