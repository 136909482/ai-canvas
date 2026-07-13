import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const storeSource = readFileSync(fileURLToPath(new URL('../src/store/useCanvasStore.ts', import.meta.url)), 'utf8')
const layoutSource = readFileSync(fileURLToPath(new URL('../src/store/canvasLayoutGeometry.ts', import.meta.url)), 'utf8')

const requiredExports = [
  'DEFAULT_IMAGE_NODE_WIDTH',
  'DEFAULT_GROUP_NODE_HEIGHT',
  'getNodeSize',
  'getAbsoluteNodePosition',
  'getVisualGroupMemberIds',
  'buildGroupAwareLayoutTargets',
  'applyGroupAwareLayoutPositions',
  'normalizeVisualGroupNodes',
  'moveVisualGroupMembers',
  'applyVisualNodeChanges',
  'getDescendantNodeIds',
  'findManualSpawnPosition',
]

if (!storeSource.includes("from './canvasLayoutGeometry'")) {
  throw new Error('useCanvasStore should import layout geometry helpers from src/store/canvasLayoutGeometry.ts')
}

for (const exportName of requiredExports) {
  if (!layoutSource.includes(`export function ${exportName}`) && !layoutSource.includes(`export const ${exportName}`)) {
    throw new Error(`canvasLayoutGeometry.ts should export ${exportName}`)
  }

  if (storeSource.includes(`function ${exportName}`) || storeSource.includes(`export function ${exportName}`) || storeSource.includes(`export const ${exportName}`)) {
    throw new Error(`useCanvasStore should not define ${exportName} inline`)
  }
}

for (const layoutConstant of [
  'GROUP_PADDING_X',
  'GROUP_PADDING_Y',
  'GROUP_HEADER_HEIGHT',
  'MANUAL_NODE_SPAWN_GAP',
]) {
  if (!layoutSource.includes(layoutConstant)) {
    throw new Error(`canvasLayoutGeometry.ts should own ${layoutConstant}`)
  }
}
