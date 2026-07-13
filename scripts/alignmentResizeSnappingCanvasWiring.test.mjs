import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const canvasSource = readFileSync(fileURLToPath(new URL('../src/components/canvas/CanvasFlowLayer.tsx', import.meta.url)), 'utf8')

if (!canvasSource.includes('getResizeAlignmentSnap')) {
  throw new Error('Canvas should import and use getResizeAlignmentSnap for node resize snapping')
}

if (!canvasSource.includes('const handleNodesChange')) {
  throw new Error('Canvas should wrap onNodesChange so resize dimension changes can be snapped before store updates')
}

if (!canvasSource.includes('type === \'dimensions\'') || !canvasSource.includes('resizing')) {
  throw new Error('Canvas resize snapping should target React Flow dimension changes from NodeResizer')
}

if (!canvasSource.includes('onNodesChange={handleNodesChange}')) {
  throw new Error('ReactFlow should receive the resize-aware handleNodesChange callback')
}
