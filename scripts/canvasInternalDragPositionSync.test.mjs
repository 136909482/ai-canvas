import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const storeSource = readFileSync(fileURLToPath(new URL('../src/store/useCanvasStore.ts', import.meta.url)), 'utf8')
const canvasSource = readFileSync(fileURLToPath(new URL('../src/components/Canvas.tsx', import.meta.url)), 'utf8')
const canvasFlowLayerSource = readFileSync(fileURLToPath(new URL('../src/components/canvas/CanvasFlowLayer.tsx', import.meta.url)), 'utf8')

if (!storeSource.includes('setNodePositions: (positions)')) {
  throw new Error('useCanvasStore should expose setNodePositions for batched drag-stop position sync')
}

if (!storeSource.includes('positions.map(({ id, position }) => ({')) {
  throw new Error('setNodePositions should convert final positions into React Flow position changes')
}

if (!storeSource.includes('dragging: false')) {
  throw new Error('setNodePositions should mark final position changes as dragging=false so drag-stop side effects run')
}

if (!storeSource.includes('moveVisualGroupMembers(s.nodes, nextNodes, changes)')) {
  throw new Error('setNodePositions should preserve visual group movement behavior')
}

if (!storeSource.includes('applySettledPositionSideEffects(nextNodes, changes)')) {
  throw new Error('setNodePositions should run generated preview and LLM output drag-stop side effects')
}

if (!storeSource.includes("layoutMode: 'manual'")) {
  throw new Error('dragging generated previews or LLM outputs should switch them to manual layout')
}

if (!canvasFlowLayerSource.includes('setNodePositions(getDraggedNodePositions(node, draggedNodes))')) {
  throw new Error('Canvas should sync internal-drag final positions in one batched store update')
}

if (!canvasFlowLayerSource.includes('dragStopCommitFrameRef.current = window.requestAnimationFrame')) {
  throw new Error('Canvas should defer internal-drag history commit to the next animation frame')
}

if (!canvasSource.includes('INTERNAL_DRAG_ENABLE_STORAGE_KEY')) {
  throw new Error('Canvas should keep internal drag behind an explicit diagnostic enable switch')
}
