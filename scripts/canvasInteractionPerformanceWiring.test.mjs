import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const canvasSource = readFileSync(fileURLToPath(new URL('../src/components/Canvas.tsx', import.meta.url)), 'utf8')
const canvasFlowLayerSource = readFileSync(fileURLToPath(new URL('../src/components/canvas/CanvasFlowLayer.tsx', import.meta.url)), 'utf8')
const mainSource = readFileSync(fileURLToPath(new URL('../src/main.tsx', import.meta.url)), 'utf8')
const canvasCombinedSource = `${canvasSource}\n${canvasFlowLayerSource}`
const imageNodeSource = readFileSync(fileURLToPath(new URL('../src/nodes/ImageNode/index.tsx', import.meta.url)), 'utf8')
const generateNodeSource = readFileSync(fileURLToPath(new URL('../src/nodes/GenerateNode/index.tsx', import.meta.url)), 'utf8')
const imagePreviewSource = readFileSync(fileURLToPath(new URL('../src/components/CanvasImagePreview.tsx', import.meta.url)), 'utf8')
const nodePropComparatorsSource = readFileSync(fileURLToPath(new URL('../src/nodes/nodePropComparators.ts', import.meta.url)), 'utf8')
const stableNodeToolbarSource = readFileSync(fileURLToPath(new URL('../src/components/StableNodeToolbar.tsx', import.meta.url)), 'utf8')
const indexCssSource = readFileSync(fileURLToPath(new URL('../src/index.css', import.meta.url)), 'utf8')
const connectionHandleNodeSources = [
  imageNodeSource,
  generateNodeSource,
  readFileSync(fileURLToPath(new URL('../src/nodes/GeneratedPreviewNode/index.tsx', import.meta.url)), 'utf8'),
  readFileSync(fileURLToPath(new URL('../src/nodes/ImageEditNode/index.tsx', import.meta.url)), 'utf8'),
  readFileSync(fileURLToPath(new URL('../src/nodes/InlineTextSplitterNode/index.tsx', import.meta.url)), 'utf8'),
  readFileSync(fileURLToPath(new URL('../src/nodes/LLMFileNode/index.tsx', import.meta.url)), 'utf8'),
  readFileSync(fileURLToPath(new URL('../src/nodes/LLMOutputTextNode/index.tsx', import.meta.url)), 'utf8'),
  readFileSync(fileURLToPath(new URL('../src/nodes/TestImageNode/index.tsx', import.meta.url)), 'utf8'),
  readFileSync(fileURLToPath(new URL('../src/nodes/TextNode/index.tsx', import.meta.url)), 'utf8'),
  readFileSync(fileURLToPath(new URL('../src/nodes/TextSplitterNode/index.tsx', import.meta.url)), 'utf8'),
  readFileSync(fileURLToPath(new URL('../src/nodes/VideoGenerateNode/index.tsx', import.meta.url)), 'utf8'),
  readFileSync(fileURLToPath(new URL('../src/nodes/VideoNode/index.tsx', import.meta.url)), 'utf8'),
]

if (!canvasSource.includes('shouldUseCanvasPerformanceRendering')) {
  throw new Error('Canvas should use centralized performance rendering rules')
}

if (!canvasSource.includes('getCanvasImagePerformanceStats')) {
  throw new Error('Canvas should include image-aware performance stats')
}

if (!canvasCombinedSource.includes('CanvasPerformanceProvider')) {
  throw new Error('Canvas should provide interaction rendering hints to image previews')
}

if (
  !canvasCombinedSource.includes('pauseThumbnailQueue()') ||
  !canvasCombinedSource.includes('return resumeThumbnailQueue') ||
  !canvasCombinedSource.includes('shouldDeferThumbnailWork') ||
  !canvasFlowLayerSource.includes('pauseViewportThumbnailWork()') ||
  !canvasFlowLayerSource.includes('resumeViewportThumbnailWork()')
) {
  throw new Error('Canvas should pause thumbnail queue during node and viewport interactions without broadcasting rerenders to image previews')
}

if (imagePreviewSource.includes('deferThumbnailWork')) {
  throw new Error('CanvasImagePreview should not subscribe to interaction-only deferThumbnailWork because that rerenders every mounted image during drag/pan')
}

if (
  !indexCssSource.includes("img[data-canvas-image-source='workspace-thumbnail']")
  || !indexCssSource.includes('will-change: transform')
) {
  throw new Error('Stable image-heavy canvases should pre-promote lightweight thumbnail textures for first-pan compositing')
}

if (!canvasCombinedSource.includes('onNodeDragStart={handleNodeDragStart}')) {
  throw new Error('ReactFlow should start history tracking when node dragging begins')
}

if (!canvasSource.includes('shouldShowMiniMap') || !canvasSource.includes('shouldShowBackground')) {
  throw new Error('Canvas should route MiniMap and Background visibility through performance rules')
}

if (
  !canvasSource.includes('shouldCullOffscreenElements') ||
  !canvasSource.includes('VISIBLE_ELEMENT_CULLING_OVERRIDE_STORAGE_KEY') ||
  !canvasSource.includes("visibleElementCullingOverride === 'off'") ||
  !canvasSource.includes('shouldStabilizeViewportElements') ||
  !canvasSource.includes('IMAGE_HEAVY_CULLING_DISABLE_NODE_LIMIT') ||
  !canvasSource.includes('IMAGE_HEAVY_CULLING_DISABLE_IMAGE_LIMIT') ||
  !canvasCombinedSource.includes('canvas-image-heavy-stable') ||
  !canvasCombinedSource.includes('onlyRenderVisibleElements={shouldCullReactFlowElements}')
) {
  throw new Error('Canvas should keep culling configurable while keeping bounded image-heavy viewport elements warm throughout viewport interactions and immediate follow-up work')
}

if (canvasSource.includes('canvas-interaction-lite-rendering')) {
  throw new Error('Canvas should not hide or blank node content during active interactions')
}

if (
  !canvasCombinedSource.includes('isPureActivePositionDrag') ||
  !canvasCombinedSource.includes('scheduleInteractiveNodeChanges(changes)') ||
  !canvasCombinedSource.includes('requestAnimationFrame') ||
  !canvasCombinedSource.includes('nodes={isNodeDragging && !shouldUseInternalDrag ? interactiveNodes : nodes}')
) {
  throw new Error('Canvas should keep active drag position changes local and coalesce them to animation frames before syncing business store on drag stop')
}

if (
  !canvasCombinedSource.includes('function CanvasFlowLayer(') ||
  !canvasCombinedSource.includes("recordComponentRender('CanvasFlowLayer')") ||
  !canvasSource.includes('<CanvasFlowLayer')
) {
  throw new Error('Canvas should isolate visible-drag React Flow state in CanvasFlowLayer so the outer Canvas does not rerender on every pointer frame')
}

if (
  !canvasSource.includes('INTERNAL_DRAG_ENABLE_STORAGE_KEY') ||
  !canvasSource.includes('shouldUseInternalDrag') ||
  !canvasCombinedSource.includes('setNodePositions(getDraggedNodePositions(node, draggedNodes))')
) {
  throw new Error('Canvas should keep internal drag behind an explicit diagnostic switch and sync final positions in one batch on drag stop')
}

if (!canvasCombinedSource.includes('clearPendingInteractiveNodeChanges()')) {
  throw new Error('Canvas should clear queued interactive node changes when drag ends or the canvas unmounts')
}

if (
  !stableNodeToolbarSource.includes('storeApi.subscribe(updatePosition)')
  || !stableNodeToolbarSource.includes('toolbar.style.transform = getToolbarTransform')
  || !imageNodeSource.includes('{selected ? <StableNodeToolbar')
) {
  throw new Error('Selected-node toolbars should update viewport transforms imperatively instead of rerendering through React on every pan frame')
}

if (!mainSource.includes("import.meta.env.VITE_REACT_STRICT_MODE === 'true'")) {
  throw new Error('React StrictMode should be opt-in so development interaction sampling matches production behavior')
}

if (
  connectionHandleNodeSources.some((source) => source.includes('useConnection'))
  || !indexCssSource.includes('.react-flow__handle.connectingfrom .handle-orb')
  || indexCssSource.includes('.react-flow__handle.connecting .handle-orb')
) {
  throw new Error('Node shells should use the native connectingfrom handle class instead of subscribing whole nodes to live connection coordinates')
}

if (!canvasCombinedSource.includes('!shouldShowAlignmentGuides && isNodeDraggingRef.current && isPureActivePositionDrag(changes)')) {
  throw new Error('Canvas should only use local drag state when alignment guide behavior is disabled')
}

if (
  !nodePropComparatorsSource.includes('areNodeContentPropsEqual') ||
  !nodePropComparatorsSource.includes('previous.data === next.data') ||
  !nodePropComparatorsSource.includes('previous.selected === next.selected') ||
  imageNodeSource.includes('export const ImageNode = memo(function ImageNode({ id, data, selected, dragging }: ImageNodeProps) {\n') && !imageNodeSource.includes('}, areNodeContentPropsEqual)') ||
  !generateNodeSource.includes('}, areNodeContentPropsEqual)')
) {
  throw new Error('Image-heavy nodes should ignore React Flow position-only prop changes so dragging does not rerender node internals every frame')
}
