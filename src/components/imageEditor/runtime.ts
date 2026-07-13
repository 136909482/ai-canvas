export type ToolMode = 'select' | 'brush' | 'line' | 'rect' | 'ellipse' | 'text'
export type DrawMode = 'annotation' | 'mask'

export const MIN_BRUSH_SIZE = 4
export const MAX_BRUSH_SIZE = 96
export const MIN_TEXT_SIZE = 12
export const MAX_TEXT_SIZE = 160
export const MIN_TEXT_BOX_WIDTH = 140
export const MIN_TEXT_BOX_HEIGHT = 72
export const TEXT_BOX_PADDING_X = 12
export const TEXT_BOX_PADDING_Y = 9
export const MAX_UNDO_HISTORY = 20
const TEXT_FONT_FAMILY = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

export const EDITOR_COLOR_SWATCHES = [
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ffffff',
] as const

export type CanvasPoint = { x: number; y: number }
export type StrokeSegment = { from: CanvasPoint; to: CanvasPoint }
export type TextAnnotation = CanvasPoint & {
  id: string
  value: string
  fontSize: number
  color: string
  rotation: number
}
export type TextDraft = Omit<TextAnnotation, 'id'> & { id: string | null }
export type UndoSnapshot = HTMLCanvasElement

function getTextFont(fontSize: number) {
  return `600 ${fontSize}px ${TEXT_FONT_FAMILY}`
}

export function getTextAnnotationMetrics(annotation: Pick<TextAnnotation, 'value' | 'fontSize'>) {
  const lines = (annotation.value || ' ').split(/\r?\n/)
  const lineHeight = annotation.fontSize * 1.25
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    return { width: MIN_TEXT_BOX_WIDTH, height: MIN_TEXT_BOX_HEIGHT, lines }
  }

  context.font = getTextFont(annotation.fontSize)
  const measuredWidth = Math.max(...lines.map((line) => context.measureText(line || ' ').width))
  return {
    width: Math.max(MIN_TEXT_BOX_WIDTH, Math.ceil(measuredWidth + TEXT_BOX_PADDING_X * 2)),
    height: Math.max(MIN_TEXT_BOX_HEIGHT, lines.length * lineHeight + TEXT_BOX_PADDING_Y * 2),
    lines,
  }
}

export function drawTextAnnotation(context: CanvasRenderingContext2D, annotation: TextAnnotation) {
  const text = annotation.value.trim()
  if (!text) {
    return
  }

  const lineHeight = annotation.fontSize * 1.25
  const { lines } = getTextAnnotationMetrics(annotation)
  context.save()
  context.translate(annotation.x, annotation.y)
  context.rotate((annotation.rotation * Math.PI) / 180)
  context.font = getTextFont(annotation.fontSize)
  context.textBaseline = 'top'
  context.fillStyle = annotation.color
  context.globalCompositeOperation = 'source-over'
  lines.forEach((line, index) => {
    context.fillText(line || ' ', TEXT_BOX_PADDING_X, TEXT_BOX_PADDING_Y + index * lineHeight)
  })
  context.restore()
}

export function loadImage(imageUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败'))
    if (!imageUrl.startsWith('data:')) {
      image.crossOrigin = 'anonymous'
    }
    image.src = imageUrl
  })
}

export function canvasToDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL('image/png')
}

export function getImageNodeSize(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return { width: 320, height: 260 }
  }

  const maxSize = 500
  const minSize = 100
  const aspectRatio = width / height
  let contentWidth = width >= height ? maxSize : maxSize * aspectRatio
  let contentHeight = width >= height ? maxSize / aspectRatio : maxSize

  if (contentWidth < minSize) {
    contentWidth = minSize
    contentHeight = minSize / aspectRatio
  }
  if (contentHeight < minSize) {
    contentHeight = minSize
    contentWidth = minSize * aspectRatio
  }

  return {
    width: Math.round(contentWidth + 12),
    height: Math.round(contentHeight + 12),
  }
}

export function getDownloadFileName(title: string, suffix = '') {
  const baseName = (title || 'edited-image')
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim()
    .replace(/\.(png|jpe?g|webp|gif|bmp|svg)$/i, '')
    .replace(/\.+$/, '')
    || 'edited-image'

  return `${baseName}${suffix}.png`
}

export function downloadDataUrl(dataUrl: string, fileName: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl)
  return response.blob()
}
