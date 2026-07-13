import assert from 'node:assert/strict'
import test from 'node:test'
import { getResizeAlignmentSnap } from '../src/features/canvasAlignment/alignmentSnapping.ts'

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

test('snaps the resized right edge to another right edge within threshold', () => {
  const original = node('resized', 0, 0)
  const resized = node('resized', 0, 0, 193, 80)
  const target = node('target', 100, 16, 100, 80)

  const result = getResizeAlignmentSnap(original, resized, [resized, target])

  assert.equal(result.nextBox.x, 0)
  assert.equal(result.nextBox.width, 200)
  assert.equal(result.guides.vertical?.x, 200)
})

test('snaps the resized left edge while keeping the opposite edge stable', () => {
  const original = node('resized', 200, 0)
  const resized = node('resized', 107, 0, 193, 80)
  const target = node('target', 100, 16, 100, 80)

  const result = getResizeAlignmentSnap(original, resized, [resized, target])

  assert.equal(result.nextBox.x, 100)
  assert.equal(result.nextBox.width, 200)
  assert.equal(result.nextBox.x + result.nextBox.width, 300)
  assert.equal(result.guides.vertical?.x, 100)
})

test('snaps the resized bottom edge to another bottom edge within threshold', () => {
  const original = node('resized', 0, 0)
  const resized = node('resized', 0, 0, 100, 153)
  const target = node('target', 16, 80, 100, 80)

  const result = getResizeAlignmentSnap(original, resized, [resized, target])

  assert.equal(result.nextBox.y, 0)
  assert.equal(result.nextBox.height, 160)
  assert.equal(result.guides.horizontal?.y, 160)
})

test('does not snap a resized edge to the opposite edge kind', () => {
  const original = node('resized', 0, 0)
  const resized = node('resized', 0, 0, 193, 80)
  const target = node('target', 200, 16, 100, 80)

  const result = getResizeAlignmentSnap(original, resized, [resized, target])

  assert.deepEqual(result.nextBox, {
    id: 'resized',
    x: 0,
    y: 0,
    width: 193,
    height: 80,
  })
  assert.deepEqual(result.guides, {})
})
