import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/nodes/LLMOutputTextNode/index.tsx', import.meta.url), 'utf8')

test('LLM output generating state uses thinking copy', () => {
  assert.match(source, /generating:\s*'思考中'/)
  assert.doesNotMatch(source, /generating:\s*'生成中'/)
})
