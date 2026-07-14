import type { CanvasPerformanceMode } from '@/types'

export const LARGE_IMAGE_EDGE_LIMIT = 1800
export const LARGE_IMAGE_PIXEL_LIMIT = 2_000_000
export const EMBEDDED_IMAGE_PERFORMANCE_BYTE_LIMIT = 1_500_000
export const CANVAS_IMAGE_LOD_MIN_COUNT = 8
export const CANVAS_IMAGE_LOD_ENTER_ZOOM = 0.24
export const CANVAS_IMAGE_LOD_EXIT_ZOOM = 0.30

export type CanvasImagePreviewQuality = 'full' | 'thumbnail'

export interface CanvasImagePerformanceStats {
  imageNodeCount: number
  largeImageNodeCount: number
  embeddedImageByteCount: number
}

type CanvasPerformanceNode = {
  type?: string
  data?: Record<string, unknown>
}

const IMAGE_PREVIEW_NODE_TYPES = new Set([
  'imageNode',
  'testImageNode',
  'generatedPreviewNode',
  'panoramaNode',
])

function getDataUrlByteEstimate(value: string) {
  if (!value.startsWith('data:')) {
    return 0
  }

  const base64Index = value.indexOf('base64,')
  if (base64Index >= 0) {
    return Math.floor((value.length - base64Index - 'base64,'.length) * 0.75)
  }

  const commaIndex = value.indexOf(',')
  return commaIndex >= 0 ? value.length - commaIndex - 1 : value.length
}

function getFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function hasWorkspaceAsset(value: unknown) {
  return Boolean(
    value
    && typeof value === 'object'
    && 'relativePath' in value
    && typeof (value as { relativePath?: unknown }).relativePath === 'string',
  )
}

function getImageNaturalSize(data: Record<string, unknown>) {
  const width = Math.max(
    getFiniteNumber(data.imageNaturalWidth),
    getFiniteNumber(data.naturalWidth),
    getFiniteNumber(data.imageWidth),
    getFiniteNumber(data.width),
  )
  const height = Math.max(
    getFiniteNumber(data.imageNaturalHeight),
    getFiniteNumber(data.naturalHeight),
    getFiniteNumber(data.imageHeight),
    getFiniteNumber(data.height),
  )

  return { width, height }
}

function isLargeImage(data: Record<string, unknown>, embeddedBytes: number) {
  const { width, height } = getImageNaturalSize(data)
  const maxEdge = Math.max(width, height)
  const pixels = width * height

  return (
    maxEdge >= LARGE_IMAGE_EDGE_LIMIT
    || pixels >= LARGE_IMAGE_PIXEL_LIMIT
    || embeddedBytes >= EMBEDDED_IMAGE_PERFORMANCE_BYTE_LIMIT
  )
}

export function getCanvasImagePerformanceStats(nodes: CanvasPerformanceNode[]): CanvasImagePerformanceStats {
  return nodes.reduce<CanvasImagePerformanceStats>((stats, node) => {
    if (!node.type || !IMAGE_PREVIEW_NODE_TYPES.has(node.type)) {
      return stats
    }

    const data = node.data ?? {}
    const imageUrl = typeof data.imageUrl === 'string' ? data.imageUrl : ''
    if (!imageUrl && !hasWorkspaceAsset(data.imageAsset) && !hasWorkspaceAsset(data.videoAsset)) {
      return stats
    }

    const embeddedBytes = getDataUrlByteEstimate(imageUrl)

    return {
      imageNodeCount: stats.imageNodeCount + 1,
      largeImageNodeCount: stats.largeImageNodeCount + (isLargeImage(data, embeddedBytes) ? 1 : 0),
      embeddedImageByteCount: stats.embeddedImageByteCount + embeddedBytes,
    }
  }, {
    imageNodeCount: 0,
    largeImageNodeCount: 0,
    embeddedImageByteCount: 0,
  })
}

export function shouldUseCanvasPerformanceRendering({
  canvasPerformanceMode,
}: {
  canvasPerformanceMode: CanvasPerformanceMode
}) {
  return canvasPerformanceMode === 'performance'
}

export function getCanvasImagePreviewQuality({
  currentQuality,
  zoom,
  imageCount,
}: {
  currentQuality: CanvasImagePreviewQuality
  zoom: number
  imageCount: number
}): CanvasImagePreviewQuality {
  if (!Number.isFinite(zoom) || imageCount < CANVAS_IMAGE_LOD_MIN_COUNT) {
    return 'full'
  }

  if (currentQuality === 'thumbnail') {
    return zoom >= CANVAS_IMAGE_LOD_EXIT_ZOOM ? 'full' : 'thumbnail'
  }

  return zoom <= CANVAS_IMAGE_LOD_ENTER_ZOOM ? 'thumbnail' : 'full'
}
