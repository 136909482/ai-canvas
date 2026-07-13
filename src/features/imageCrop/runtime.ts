import { platformBridge } from '@/platform'
import { writeWorkspaceImageAsset } from '@/features/imageAssets/runtime'
import type { WorkspaceImageAsset } from '@/types'
import { useSettingsStore } from '@/store/useSettingsStore'

export const DEFAULT_IMAGE_CROP_ROWS = 2
export const DEFAULT_IMAGE_CROP_COLUMNS = 2
export const MIN_IMAGE_CROP_SEGMENTS = 1
export const MAX_IMAGE_CROP_SEGMENTS = 6
const MIN_CUT_GAP = 0.04

export interface CropTileResult {
  row: number
  column: number
  width: number
  height: number
  ratio: string
  imageUrl: string
  imageAsset: WorkspaceImageAsset | null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function greatestCommonDivisor(left: number, right: number): number {
  return right === 0 ? left : greatestCommonDivisor(right, left % right)
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('裁切结果转换失败'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('裁切结果转换失败'))
    reader.readAsDataURL(blob)
  })
}

function loadImageElement(imageUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败，请检查输入图片是否可用'))
    image.src = imageUrl
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType = 'image/png') {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }

      reject(new Error('裁切结果导出失败'))
    }, mimeType)
  })
}

function formatRatio(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return '1:1'
  }

  const divisor = greatestCommonDivisor(width, height)
  const ratioWidth = Math.max(1, Math.round(width / divisor))
  const ratioHeight = Math.max(1, Math.round(height / divisor))
  return `${ratioWidth}:${ratioHeight}`
}

function buildCropOutputFileName(row: number, column: number, blob: Blob) {
  const extension = blob.type === 'image/jpeg'
    ? 'jpg'
    : blob.type === 'image/webp'
      ? 'webp'
      : 'png'

  return `crop-r${row + 1}-c${column + 1}.${extension}`
}

function buildCropBoundaries(segmentCount: number, cuts: number[]) {
  return [0, ...normalizeCropCuts(cuts, segmentCount), 1]
}

async function persistCropTile(blob: Blob, cropNodeId: string, row: number, column: number) {
  if (!useSettingsStore.getState().runtime.workspaceConfigured) {
    return {
      imageAsset: null,
      imageUrl: await blobToDataUrl(blob),
    }
  }

  const imageAsset = await writeWorkspaceImageAsset({
    pathSegments: ['crops', cropNodeId],
    fileName: buildCropOutputFileName(row, column, blob),
    blob,
  })

  return {
    imageAsset,
    imageUrl: await platformBridge.resolveWorkspaceAssetUrl(imageAsset.relativePath),
  }
}

export function clampCropSegmentCount(value: number | undefined, fallback = DEFAULT_IMAGE_CROP_ROWS) {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return clamp(Math.round(value as number), MIN_IMAGE_CROP_SEGMENTS, MAX_IMAGE_CROP_SEGMENTS)
}

export function buildEvenlyDistributedCuts(segmentCount: number) {
  const safeSegmentCount = clampCropSegmentCount(segmentCount)
  return Array.from({ length: Math.max(0, safeSegmentCount - 1) }, (_, index) => (index + 1) / safeSegmentCount)
}

export function normalizeCropCuts(cuts: unknown, segmentCount: number) {
  const safeSegmentCount = clampCropSegmentCount(segmentCount)
  const targetLength = Math.max(0, safeSegmentCount - 1)
  const fallback = buildEvenlyDistributedCuts(safeSegmentCount)

  const numericCuts = Array.isArray(cuts)
    ? cuts.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    : []

  if (numericCuts.length !== targetLength) {
    return fallback
  }

  const sortedCuts = [...numericCuts].sort((left, right) => left - right)
  const normalized: number[] = []

  for (let index = 0; index < targetLength; index += 1) {
    const previous = normalized[index - 1] ?? 0
    const remainingCuts = targetLength - index - 1
    const lowerBound = previous + MIN_CUT_GAP
    const upperBound = 1 - MIN_CUT_GAP * (remainingCuts + 1)
    const nextValue = clamp(sortedCuts[index] ?? fallback[index] ?? lowerBound, lowerBound, upperBound)
    normalized.push(nextValue)
  }

  return normalized
}

export async function cropImageIntoTiles(input: {
  cropNodeId: string
  imageUrl: string
  rowCount: number
  columnCount: number
  horizontalCuts: number[]
  verticalCuts: number[]
}) {
  const image = await loadImageElement(input.imageUrl)
  const rowCount = clampCropSegmentCount(input.rowCount, DEFAULT_IMAGE_CROP_ROWS)
  const columnCount = clampCropSegmentCount(input.columnCount, DEFAULT_IMAGE_CROP_COLUMNS)
  const horizontalBoundaries = buildCropBoundaries(rowCount, input.horizontalCuts)
  const verticalBoundaries = buildCropBoundaries(columnCount, input.verticalCuts)
  const results: CropTileResult[] = []

  for (let row = 0; row < rowCount; row += 1) {
    const sourceTop = Math.round(horizontalBoundaries[row] * image.naturalHeight)
    const sourceBottom = row === rowCount - 1
      ? image.naturalHeight
      : Math.round(horizontalBoundaries[row + 1] * image.naturalHeight)
    const cropHeight = Math.max(1, sourceBottom - sourceTop)

    for (let column = 0; column < columnCount; column += 1) {
      const sourceLeft = Math.round(verticalBoundaries[column] * image.naturalWidth)
      const sourceRight = column === columnCount - 1
        ? image.naturalWidth
        : Math.round(verticalBoundaries[column + 1] * image.naturalWidth)
      const cropWidth = Math.max(1, sourceRight - sourceLeft)
      const canvas = document.createElement('canvas')
      canvas.width = cropWidth
      canvas.height = cropHeight
      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error('浏览器当前无法处理图像裁切')
      }

      context.drawImage(
        image,
        sourceLeft,
        sourceTop,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight,
      )

      const blob = await canvasToBlob(canvas)
      const persisted = await persistCropTile(blob, input.cropNodeId, row, column)

      results.push({
        row,
        column,
        width: cropWidth,
        height: cropHeight,
        ratio: formatRatio(cropWidth, cropHeight),
        imageUrl: persisted.imageUrl,
        imageAsset: persisted.imageAsset,
      })
    }
  }

  return results
}
