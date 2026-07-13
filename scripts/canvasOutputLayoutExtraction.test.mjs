import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const storeSource = readFileSync(fileURLToPath(new URL('../src/store/useCanvasStore.ts', import.meta.url)), 'utf8')
const outputLayoutSource = readFileSync(fileURLToPath(new URL('../src/store/canvasOutputLayout.ts', import.meta.url)), 'utf8')
const geometrySource = readFileSync(fileURLToPath(new URL('../src/store/canvasLayoutGeometry.ts', import.meta.url)), 'utf8')

const requiredOutputExports = [
  'layoutGeneratedPreviewNodesInContext',
  'layoutLLMOutputTextNodesInContext',
  'layoutTextSplitterOutputNodesInContext',
  'applyDragStopSideEffects',
]

if (!storeSource.includes("from './canvasOutputLayout'")) {
  throw new Error('useCanvasStore should import output layout helpers from src/store/canvasOutputLayout.ts')
}

for (const exportName of requiredOutputExports) {
  if (!outputLayoutSource.includes(`export function ${exportName}`)) {
    throw new Error(`canvasOutputLayout.ts should export ${exportName}`)
  }

  if (storeSource.includes(`function ${exportName}`)) {
    throw new Error(`useCanvasStore should not define ${exportName} inline`)
  }
}

if (!geometrySource.includes('export function expandGroupToFitDescendants')) {
  throw new Error('canvasLayoutGeometry.ts should export expandGroupToFitDescendants for output layout helpers')
}

if (
  !outputLayoutSource.includes('DEFAULT_PREVIEW_NODE_WIDTH')
  || !outputLayoutSource.includes('DEFAULT_LLM_OUTPUT_TEXT_NODE_WIDTH')
  || !outputLayoutSource.includes('getOrderedStringIds')
) {
  throw new Error('canvasOutputLayout.ts should own preview, LLM output, and splitter output layout dependencies')
}
