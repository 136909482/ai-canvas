import assert from 'node:assert/strict'
import test from 'node:test'
import { formatJsonForDisplay, markdownToHtml } from '../src/features/llm/outputViewer.ts'

test('formats valid JSON and leaves invalid streaming JSON untouched', () => {
  assert.deepEqual(formatJsonForDisplay('{"name":"canvas","items":[1,2]}'), {
    text: '{\n  "name": "canvas",\n  "items": [\n    1,\n    2\n  ]\n}',
    valid: true,
  })

  assert.deepEqual(formatJsonForDisplay('{"name":'), {
    text: '{"name":',
    valid: false,
  })
})

test('renders common markdown blocks to safe HTML', () => {
  assert.equal(
    markdownToHtml('# Title\n\n- one\n- **two**\n\n```ts\nconst x = 1\n```\n\nPlain `code`'),
    '<h1>Title</h1><ul><li>one</li><li><strong>two</strong></li></ul><pre><code class="language-ts">const x = 1</code></pre><p>Plain <code>code</code></p>',
  )

  assert.equal(markdownToHtml('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
})
