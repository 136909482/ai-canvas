import assert from 'node:assert/strict'
import test from 'node:test'
import { isClaudeModel } from '../src/features/settings/modelBrand.ts'

test('detects Claude related models from name, model id, or API URL', () => {
  assert.equal(isClaudeModel({ name: 'Claude Sonnet 4.5', modelId: 'custom-router', apiUrl: '' }), true)
  assert.equal(isClaudeModel({ name: '', modelId: 'claude-3-5-haiku-latest', apiUrl: '' }), true)
  assert.equal(isClaudeModel({ name: '', modelId: 'router-model', apiUrl: 'https://api.anthropic.com/v1' }), true)
  assert.equal(isClaudeModel({ name: 'glm-5', modelId: 'glm-5', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' }), false)
})
