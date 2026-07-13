import assert from 'node:assert/strict'
import test from 'node:test'
import { getNextMenuIndex } from './menuKeyboard.ts'

test('menu navigation wraps and supports Home and End', () => {
  assert.equal(getNextMenuIndex('ArrowDown', -1, 3), 0)
  assert.equal(getNextMenuIndex('ArrowDown', 2, 3), 0)
  assert.equal(getNextMenuIndex('ArrowUp', 0, 3), 2)
  assert.equal(getNextMenuIndex('Home', 2, 3), 0)
  assert.equal(getNextMenuIndex('End', 0, 3), 2)
  assert.equal(getNextMenuIndex('ArrowDown', 0, 0), -1)
})
