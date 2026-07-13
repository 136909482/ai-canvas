import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const storeSource = readFileSync(fileURLToPath(new URL('../src/store/useCanvasStore.ts', import.meta.url)), 'utf8')
const deletionSource = readFileSync(fileURLToPath(new URL('../src/store/canvasGraphDeletion.ts', import.meta.url)), 'utf8')

const requiredExports = [
  'buildNodeDeletedGraphState',
  'buildEdgeDeletedGraphState',
  'buildEdgesDeletedBySourceTargetState',
  'buildEdgesDeletedBySourceTargetHandleState',
  'buildEdgesDeletedBySourceTargetExceptHandleState',
  'buildSelectedElementsDeletedGraphState',
]

if (!storeSource.includes("from './canvasGraphDeletion'")) {
  throw new Error('useCanvasStore should import deletion helpers from src/store/canvasGraphDeletion.ts')
}

for (const exportName of requiredExports) {
  if (!deletionSource.includes(`export function ${exportName}`)) {
    throw new Error(`canvasGraphDeletion.ts should export ${exportName}`)
  }

  if (storeSource.includes(`function ${exportName}`)) {
    throw new Error(`useCanvasStore should not define ${exportName} inline`)
  }
}

if (!deletionSource.includes('buildSyncedGraphState')) {
  throw new Error('canvasGraphDeletion.ts should own graph resync after delete filters')
}

for (const inlineDeleteSnippet of [
  'const nodeIdsToDelete = new Set([id])',
  'const selectedNodeIds = initialSelectedNodeIds',
  'selectedEdgeIds.has(edge.id)',
  'edge.targetHandle !== excludedTargetHandle',
]) {
  if (storeSource.includes(inlineDeleteSnippet)) {
    throw new Error(`useCanvasStore should not inline delete filtering logic: ${inlineDeleteSnippet}`)
  }
}
