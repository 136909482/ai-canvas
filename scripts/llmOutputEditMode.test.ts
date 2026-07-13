import assert from 'node:assert/strict'
import test from 'node:test'
import { canEditLLMOutput, getLLMOutputModeLabel } from '../src/features/llm/outputEditMode.ts'

test('allows editing only after the LLM output has settled', () => {
  assert.equal(canEditLLMOutput('done'), true)
  assert.equal(canEditLLMOutput('generating'), false)
  assert.equal(canEditLLMOutput('queued'), false)
  assert.equal(canEditLLMOutput('error'), false)
})

test('labels output display modes clearly', () => {
  assert.equal(getLLMOutputModeLabel('json'), 'JSON 输出')
  assert.equal(getLLMOutputModeLabel('markdown'), 'Markdown 输出')
  assert.equal(getLLMOutputModeLabel('text'), '文本输出')
})
