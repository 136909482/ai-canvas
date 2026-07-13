import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const storeSource = readFileSync(fileURLToPath(new URL('../src/store/useCanvasStore.ts', import.meta.url)), 'utf8')
const updatesSource = readFileSync(fileURLToPath(new URL('../src/store/canvasNodeDataUpdates.ts', import.meta.url)), 'utf8')

const requiredExports = [
  'buildNodeDataUpdatedState',
]

if (!storeSource.includes("from './canvasNodeDataUpdates'")) {
  throw new Error('useCanvasStore should import node data update helpers from src/store/canvasNodeDataUpdates.ts')
}

for (const exportName of requiredExports) {
  if (!updatesSource.includes(`export function ${exportName}`)) {
    throw new Error(`canvasNodeDataUpdates.ts should export ${exportName}`)
  }

  if (storeSource.includes(`function ${exportName}`)) {
    throw new Error(`useCanvasStore should not define ${exportName} inline`)
  }
}

for (const dependencySnippet of [
  'syncConnectionDerivedNodeData',
  'layoutGeneratedPreviewNodesInContext',
  'layoutLLMOutputTextNodesInContext',
]) {
  if (!updatesSource.includes(dependencySnippet)) {
    throw new Error(`canvasNodeDataUpdates.ts should own update side-effect dependency: ${dependencySnippet}`)
  }
}

for (const inlineUpdateSnippet of [
  'let layoutSourceGenerateNodeId',
  'const hasNodeSizePatch = patch.width !== undefined || patch.height !== undefined',
  'const { width, height, ...dataPatch } = patch',
  "n.type === 'generatedPreviewNode' && n.data?.layoutMode !== 'manual'",
  "n.type === 'llmOutputTextNode' && n.data?.layoutMode !== 'manual'",
]) {
  if (storeSource.includes(inlineUpdateSnippet)) {
    throw new Error(`useCanvasStore should not inline node data update side effects: ${inlineUpdateSnippet}`)
  }
}
