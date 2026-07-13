import assert from 'node:assert/strict'
import test from 'node:test'
import { getFloatingMenuPosition } from '../src/utils/floatingMenuPosition.ts'

test('places a floating menu near the pointer while keeping it inside the viewport', () => {
  assert.deepEqual(
    getFloatingMenuPosition({
      clientX: 760,
      clientY: 560,
      menuWidth: 220,
      minMenuHeight: 240,
      viewportWidth: 800,
      viewportHeight: 600,
      margin: 10,
    }),
    { left: 570, top: 350 },
  )
})
