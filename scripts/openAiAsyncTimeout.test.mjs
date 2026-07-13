import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/api/image/openai.ts', import.meta.url), 'utf8')

test('OpenAI compatible async image polling waits long enough for slow gpt-image-2 jobs', () => {
  const timeoutMatch = source.match(/const OPENAI_ASYNC_POLL_TIMEOUT_MS = (\d+) \* 60 \* 1000/)

  assert(timeoutMatch, 'OPENAI_ASYNC_POLL_TIMEOUT_MS should be declared in minutes')
  assert(Number(timeoutMatch[1]) >= 30, 'OpenAI async image polling should wait at least 30 minutes')
})

test('async timeout copy tells users the task can still be checked remotely', () => {
  assert.match(source, /Remote task may still complete/)
})
