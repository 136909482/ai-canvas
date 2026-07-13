import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/nodes/LLMOutputTextNode/index.tsx', import.meta.url), 'utf8')

test('LLM output copy and edit controls live in the viewport-stable node toolbar', () => {
  assert.match(source, /StableNodeToolbar/)
  assert.match(source, /\{selected \? <StableNodeToolbar/)
  assert.match(source, /isVisible=\{hasText && !isError \? undefined : false\}/)
  assert.doesNotMatch(source, /useCanvasSelectionContext/)
  assert.doesNotMatch(source, /absolute right-2 top-2 z-20 flex items-center gap-1/)
})
