import assert from 'node:assert/strict'
import test from 'node:test'
import { createChatCompletionStreamParser } from '../src/api/chatStream.ts'

test('parses split OpenAI compatible chat completion SSE deltas', () => {
  const parser = createChatCompletionStreamParser()

  assert.deepEqual(parser.push('data: {"choices":[{"delta":{"content":"Hel'), {
    deltas: [],
    done: false,
  })

  assert.deepEqual(parser.push('lo"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\n'), {
    deltas: ['Hello', ' world'],
    done: false,
  })

  assert.deepEqual(parser.push('data: [DONE]\n\n'), {
    deltas: [],
    done: true,
  })
})

test('ignores non-content stream payloads without failing the stream', () => {
  const parser = createChatCompletionStreamParser()

  assert.deepEqual(parser.push(': keep-alive\n\ndata: {"choices":[{"delta":{"role":"assistant"}}]}\n\n'), {
    deltas: [],
    done: false,
  })
})
