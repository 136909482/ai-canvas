import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const storeSource = readFileSync(fileURLToPath(new URL('../src/store/useCanvasStore.ts', import.meta.url)), 'utf8')
const clipboardSource = readFileSync(fileURLToPath(new URL('../src/store/canvasNodeClipboard.ts', import.meta.url)), 'utf8')

const requiredExports = [
  'canDuplicateNode',
  'cloneNodeForDuplicate',
]

if (!storeSource.includes("from './canvasNodeClipboard'")) {
  throw new Error('useCanvasStore should import clipboard helpers from src/store/canvasNodeClipboard.ts')
}

for (const exportName of requiredExports) {
  if (!clipboardSource.includes(`export function ${exportName}`)) {
    throw new Error(`canvasNodeClipboard.ts should export ${exportName}`)
  }

  if (storeSource.includes(`function ${exportName}`)) {
    throw new Error(`useCanvasStore should not define ${exportName} inline`)
  }
}

for (const dependencySnippet of [
  'createImageNodeData',
  'createVideoNodeData',
  'createVideoGenerateNodeData',
  'createImageCropNodeData',
  'createTestImageNodeData',
  'sanitizeGptImageQuality',
  'sanitizeRichPrompt',
  'DEFAULT_TEXT_NODE_LABEL',
  'getAbsoluteNodePosition',
]) {
  if (!clipboardSource.includes(dependencySnippet)) {
    throw new Error(`canvasNodeClipboard.ts should own duplicate sanitizing dependency: ${dependencySnippet}`)
  }
}

for (const resetSnippet of [
  'connectedTextNode: null',
  'referenceSourceOrder: []',
  'outputNodeIds: []',
  'outputNodeId: null',
  'activeTaskId: null',
  'status: \'idle\'',
]) {
  if (!clipboardSource.includes(resetSnippet)) {
    throw new Error(`duplicated nodes should reset runtime linkage/state in canvasNodeClipboard.ts: ${resetSnippet}`)
  }
}
