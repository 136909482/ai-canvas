import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const canvasSource = readFileSync(fileURLToPath(new URL('../src/components/canvas/CanvasFlowLayer.tsx', import.meta.url)), 'utf8')

const dragStopStart = canvasSource.indexOf('const handleNodeDragStop')
const dragStopEnd = canvasSource.indexOf('useEffect(() => () => {', dragStopStart)
const dragStopSource = canvasSource.slice(dragStopStart, dragStopEnd)

if (!dragStopSource.includes('getAlignmentSnap(activeDraggedNodes, nextNodes)')) {
  throw new Error('handleNodeDragStop should recompute snap from final drag coordinates before committing')
}

if (!dragStopSource.includes('requestAnimationFrame')) {
  throw new Error('handleNodeDragStop should apply the snapped position after React Flow final drag updates settle')
}

if (!dragStopSource.includes('setNodePosition')) {
  throw new Error('handleNodeDragStop should persist snapped coordinates to prevent release-time jumps')
}
