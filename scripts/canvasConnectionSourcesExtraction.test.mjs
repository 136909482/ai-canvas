import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const storeSource = readFileSync(fileURLToPath(new URL('../src/store/useCanvasStore.ts', import.meta.url)), 'utf8')
const connectionSource = readFileSync(fileURLToPath(new URL('../src/store/canvasConnectionSources.ts', import.meta.url)), 'utf8')

const requiredExports = [
  'getCanvasNodeById',
  'isConnectedImageSourceNode',
  'getGenerateReferenceSourceNodes',
  'getGenerateMaskSourceNode',
  'getImageEditReferenceSourceNodes',
  'getLLMInputImageSourceNodes',
  'isTextSourceNode',
  'getTextFromSourceEdge',
]

if (!storeSource.includes("from './canvasConnectionSources'")) {
  throw new Error('useCanvasStore should import connection source helpers from src/store/canvasConnectionSources.ts')
}

for (const exportName of requiredExports) {
  if (!connectionSource.includes(`export function ${exportName}`)) {
    throw new Error(`canvasConnectionSources.ts should export ${exportName}`)
  }

  if (storeSource.includes(`function ${exportName}`)) {
    throw new Error(`useCanvasStore should not define ${exportName} inline`)
  }
}

if (!connectionSource.includes('collectMentionedSourceIds') || !connectionSource.includes('sanitizeRichPrompt')) {
  throw new Error('canvasConnectionSources.ts should own rich prompt source extraction for generate references')
}

if (!connectionSource.includes('new WeakMap<Node[], Map<string, Node>>()') || !connectionSource.includes('nodeByIdCache.set(nodes, nodeById)')) {
  throw new Error('canvasConnectionSources.ts should cache node id lookups per nodes array to avoid repeated full scans in selectors')
}

if (!storeSource.includes('getCanvasNodeById')) {
  throw new Error('useCanvasStore should reuse cached node id lookups for connection replacement logic')
}
