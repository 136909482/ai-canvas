import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const storeSource = readFileSync(fileURLToPath(new URL('../src/store/useCanvasStore.ts', import.meta.url)), 'utf8')
const runtimeSource = readFileSync(fileURLToPath(new URL('../src/store/canvasTextSplitterRuntime.ts', import.meta.url)), 'utf8')

if (!storeSource.includes("from './canvasTextSplitterRuntime'")) {
  throw new Error('useCanvasStore should import text splitter runtime helpers')
}

for (const exportName of ['buildTextSplitterOutputState']) {
  if (!runtimeSource.includes(`export function ${exportName}`)) {
    throw new Error(`canvasTextSplitterRuntime.ts should export ${exportName}`)
  }
}

for (const snippet of [
  'const reusableOutputIds = outputNodeIds.filter',
  'const outputTextById = new Map',
  'const outputEdges = keptOutputIds',
]) {
  if (storeSource.includes(snippet)) {
    throw new Error(`syncTextSplitterOutputs should delegate runtime output building: ${snippet}`)
  }
}
