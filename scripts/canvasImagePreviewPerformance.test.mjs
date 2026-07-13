import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const componentSource = readFileSync(
  fileURLToPath(new URL('../src/components/CanvasImagePreview.tsx', import.meta.url)),
  'utf8',
)
const runtimeSource = readFileSync(
  fileURLToPath(new URL('../src/components/canvasImagePreviewRuntime.ts', import.meta.url)),
  'utf8',
)
const canvasSource = readFileSync(
  fileURLToPath(new URL('../src/components/Canvas.tsx', import.meta.url)),
  'utf8',
)
const canvasFlowLayerSource = readFileSync(
  fileURLToPath(new URL('../src/components/canvas/CanvasFlowLayer.tsx', import.meta.url)),
  'utf8',
)
const source = `${componentSource}\n${runtimeSource}`

if (!source.includes('thumbnailRequests')) {
  throw new Error('CanvasImagePreview should dedupe thumbnail work for repeated image URLs')
}

if (!source.includes('MAX_CONCURRENT_THUMBNAIL_JOBS = 1') || !source.includes('thumbnailJobQueue')) {
  throw new Error('CanvasImagePreview should serialize thumbnail creation for large image canvases')
}

if (!source.includes('canvas.toBlob')) {
  throw new Error('CanvasImagePreview should encode thumbnails asynchronously instead of blocking with toDataURL')
}

if (source.includes('LOW_QUALITY_PLACEHOLDER_SRC') || source.includes('data-low-quality-placeholder')) {
  throw new Error('CanvasImagePreview should not blank images with placeholders while low-quality previews are pending')
}

if (!source.includes('thumbnailSrc ?? src')) {
  throw new Error('CanvasImagePreview should keep rendering the full image until a thumbnail is ready')
}

if (!runtimeSource.includes('pauseThumbnailQueue') || !runtimeSource.includes('activeThumbnailControllers')) {
  throw new Error('CanvasImagePreview runtime should support aborting queued thumbnail work during interactions')
}

if (!canvasFlowLayerSource.includes('pauseThumbnailQueue()') || !canvasFlowLayerSource.includes('return resumeThumbnailQueue')) {
  throw new Error('Canvas should pause background thumbnail work during interactions without blanking images')
}

if (componentSource.includes('deferThumbnailWork')) {
  throw new Error('CanvasImagePreview should not subscribe to interaction-only thumbnail pause state')
}

if (!source.includes('THUMBNAIL_PREWARM_DELAY_MS')) {
  throw new Error('CanvasImagePreview should delay thumbnail prewarming until the canvas has had time to settle')
}
