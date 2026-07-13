import assert from 'node:assert/strict'
import test from 'node:test'
import { readLLMInputFiles } from './inputFiles.ts'

test('keeps the complete text attachment without character truncation', async () => {
  const content = `  ${'用户附件正文\r\n'.repeat(4_000)}  `
  const [result] = await readLLMInputFiles([
    new File([content], 'notes.txt', { type: 'text/plain' }),
  ], 0)

  assert.equal(result.content, content)
  assert.equal(result.size, new TextEncoder().encode(content).byteLength)
})

test('rejects an attachment over the explicit byte limit', async () => {
  const oversized = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.txt', { type: 'text/plain' })

  await assert.rejects(() => readLLMInputFiles([oversized], 0), /2MB/)
})
