import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const storeSource = readFileSync(fileURLToPath(new URL('../src/store/useCanvasStore.ts', import.meta.url)), 'utf8')
const runtimeSource = readFileSync(fileURLToPath(new URL('../src/store/canvasImageCropRuntime.ts', import.meta.url)), 'utf8')

if (!storeSource.includes("from './canvasImageCropRuntime'")) {
  throw new Error('useCanvasStore should import image crop runtime helpers')
}

for (const exportName of ['buildImageCropOutputState']) {
  if (!runtimeSource.includes(`export function ${exportName}`)) {
    throw new Error(`canvasImageCropRuntime.ts should export ${exportName}`)
  }
}

for (const snippet of [
  'const existingPreviewById = new Map',
  'const previewNodeById = new Map<string, Node<GeneratedPreviewNodeData>>()',
  'const removedPreviewIds = new Set',
  'const outputEdges = nextPreviewIds',
]) {
  if (storeSource.includes(snippet)) {
    throw new Error(`runImageCropNode should delegate crop output graph building: ${snippet}`)
  }
}
