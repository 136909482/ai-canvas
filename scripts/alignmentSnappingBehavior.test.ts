import assert from 'node:assert/strict'
import test from 'node:test'
import { getAlignmentSnap } from '../src/features/canvasAlignment/alignmentSnapping.ts'

const node = (
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 80,
) => ({
  id,
  position: { x, y },
  width,
  height,
  data: {},
})

test('snaps a dragged node when an anchor is within the snap threshold', () => {
  const dragged = node('dragged', 192, 36)
  const target = node('target', 200, 44)

  const result = getAlignmentSnap([dragged], [dragged, target])

  assert.deepEqual(result.delta, { x: 8, y: 8 })
  assert.equal(result.guides.vertical?.x, 200)
  assert.equal(result.guides.horizontal?.y, 44)
})

test('does not snap when the nearest anchor is outside the snap threshold', () => {
  const dragged = node('dragged', 88, 40)
  const target = node('target', 200, 60)

  const result = getAlignmentSnap([dragged], [dragged, target])

  assert.deepEqual(result.delta, { x: 0, y: 0 })
  assert.deepEqual(result.guides, {})
})

test('snaps a multi-node selection by its combined bounding box', () => {
  const draggedA = node('dragged-a', 0, 10, 100, 80)
  const draggedB = node('dragged-b', 140, 10, 100, 80)
  const target = node('target', 148, 120, 100, 80)

  const result = getAlignmentSnap([draggedA, draggedB], [draggedA, draggedB, target])

  assert.deepEqual(result.delta, { x: 8, y: 0 })
  assert.equal(result.guides.vertical?.x, 248)
})

test('does not snap opposite edges because that feels like a sudden jump', () => {
  const dragged = node('dragged', 92, 40)
  const target = node('target', 200, 140)

  const result = getAlignmentSnap([dragged], [dragged, target])

  assert.deepEqual(result.delta, { x: 0, y: 0 })
  assert.deepEqual(result.guides, {})
})
