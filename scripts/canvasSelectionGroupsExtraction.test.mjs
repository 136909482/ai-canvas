import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const storeSource = readFileSync(fileURLToPath(new URL('../src/store/useCanvasStore.ts', import.meta.url)), 'utf8')
const selectionSource = readFileSync(fileURLToPath(new URL('../src/store/canvasSelectionGroups.ts', import.meta.url)), 'utf8')

const requiredExports = [
  'buildManualNodeSelection',
  'buildGroupedSelectionState',
  'buildUngroupedSelectionState',
]

if (!storeSource.includes("from './canvasSelectionGroups'")) {
  throw new Error('useCanvasStore should import selection/group helpers from src/store/canvasSelectionGroups.ts')
}

for (const exportName of requiredExports) {
  if (!selectionSource.includes(`export function ${exportName}`)) {
    throw new Error(`canvasSelectionGroups.ts should export ${exportName}`)
  }

  if (storeSource.includes(`function ${exportName}`)) {
    throw new Error(`useCanvasStore should not define ${exportName} inline`)
  }
}

for (const dependencySnippet of [
  'normalizeVisualGroupNodes',
  'getVisualGroupMemberIds',
  'getAbsoluteNodePosition',
  'getNodeSize',
  'buildGroupNode',
  'GROUP_PADDING_X',
  'GROUP_HEADER_HEIGHT',
]) {
  if (!selectionSource.includes(dependencySnippet)) {
    throw new Error(`canvasSelectionGroups.ts should own group selection dependency: ${dependencySnippet}`)
  }
}

for (const inlineGroupSnippet of [
  'const bounds = selectedNodes.reduce',
  'selected: memberIds.has(node.id)',
  'nodes: [groupNode, ...nextNodes]',
]) {
  if (storeSource.includes(inlineGroupSnippet)) {
    throw new Error(`useCanvasStore should not inline group selection state building: ${inlineGroupSnippet}`)
  }
}
