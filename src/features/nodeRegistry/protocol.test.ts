import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./protocol.ts', import.meta.url), 'utf8')

test('node registration protocol covers all shared node types and compatibility aliases', () => {
  const requiredTypes = [
    'imageNode', 'videoNode', 'videoGenerateNode', 'imageCropNode', 'textNode',
    'textSplitterNode', 'inlineTextSplitterNode', 'generateNode', 'imageEditNode',
    'experimentalGenerateNode', 'generatedPreviewNode', 'compareNode', 'groupNode',
    'llmNode', 'llmFileNode', 'llmOutputTextNode', 'testImageNode', 'panoramaNode',
  ]
  for (const type of requiredTypes) {
    assert.match(source, new RegExp(`\\n  ${type}: \\{`), `missing registration for ${type}`)
  }
  assert.match(source, /llmNode: \{[^}]+rendererType: 'llmFileNode'/)
  assert.match(source, /experimentalGenerateNode: \{[\s\S]*?rendererType: 'generateNode'/)
})

test('protocol owns manual factories, connection rules, output layouts, and library metadata', () => {
  assert.match(source, /manual: \{ size:/)
  assert.match(source, /quickCreateTargetHandle:/)
  assert.match(source, /outputLayout: 'generated-preview'/)
  assert.match(source, /library: \{ id: 'text'/)
  assert.match(source, /export const nodeLibraryRegistrations/)
})
