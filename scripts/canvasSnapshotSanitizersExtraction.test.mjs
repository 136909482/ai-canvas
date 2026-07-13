import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const storeSource = readFileSync(fileURLToPath(new URL('../src/store/useCanvasStore.ts', import.meta.url)), 'utf8')
const sanitizerSource = readFileSync(fileURLToPath(new URL('../src/store/canvasSnapshotSanitizers.ts', import.meta.url)), 'utf8')

const requiredExports = [
  'sanitizeNodeForPersistence',
  'sanitizeNodeForHistory',
  'sanitizeEdge',
  'sanitizeCanvasSnapshotForPersistence',
  'sanitizeCanvasSnapshotForHistory',
]

if (!storeSource.includes("from './canvasSnapshotSanitizers'")) {
  throw new Error('useCanvasStore should import snapshot sanitizers from src/store/canvasSnapshotSanitizers.ts')
}

for (const exportName of requiredExports) {
  if (!sanitizerSource.includes(`export function ${exportName}`)) {
    throw new Error(`canvasSnapshotSanitizers.ts should export ${exportName}`)
  }

  if (storeSource.includes(`function ${exportName}`)) {
    throw new Error(`useCanvasStore should not define ${exportName} inline`)
  }
}

if (!sanitizerSource.includes('normalizeNodes:')) {
  throw new Error('snapshot sanitizers should accept a normalizeNodes callback instead of owning group layout logic')
}

if (!sanitizerSource.includes('imageAsset') || !sanitizerSource.includes('videoAsset')) {
  throw new Error('snapshot sanitizers should preserve workspace asset URL cleanup behavior')
}
