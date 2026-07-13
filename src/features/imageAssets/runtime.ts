import { platformBridge } from '@/platform'
import type { WorkspaceImageAsset } from '@/types'

export const WORKSPACE_IMAGE_THUMBNAIL_PATH = ['thumbnails']
export const WORKSPACE_IMAGE_THUMBNAIL_MAX_EDGE = 768

type ImageDimensions = {
  width: number
  height: number
}

type WorkspaceImageAssetInput = {
  pathSegments: string[]
  fileName: string
  blob: Blob
  originalWidth?: number
  originalHeight?: number
}

type WorkspaceImageThumbnailInput = WorkspaceImageAssetInput

type RestoreWorkspaceImageThumbnailInput = {
  asset: Pick<WorkspaceImageAsset, 'relativePath' | 'fileName' | 'thumbnailRelativePath' | 'originalWidth' | 'originalHeight'>
  imageUrl: string
}

type ThumbnailResult = {
  blob: Blob
  width: number
  height: number
}

function getSafeDimension(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0
}

function loadImageElementFromBlob(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to read image asset dimensions'))
    }

    image.src = objectUrl
  })
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.72)
  })
}

function buildThumbnailFileName(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.')
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  return `${baseName || 'image'}-thumbnail.webp`
}

function getWorkspaceImageAssetPathParts(relativePath: string, fallbackFileName: string) {
  const segments = relativePath.replace(/\\+/g, '/').split('/').filter(Boolean)
  const fileName = segments.pop() || fallbackFileName
  const pathSegments = segments[0] === 'images' ? segments.slice(1) : segments

  return {
    pathSegments,
    fileName,
  }
}

async function readBlobImageDimensions(blob: Blob): Promise<ImageDimensions> {
  const image = await loadImageElementFromBlob(blob)
  return {
    width: getSafeDimension(image.naturalWidth || image.width),
    height: getSafeDimension(image.naturalHeight || image.height),
  }
}

async function createThumbnail(blob: Blob, original: ImageDimensions): Promise<ThumbnailResult | null> {
  if (original.width <= 0 || original.height <= 0) {
    return null
  }

  const scale = Math.min(1, WORKSPACE_IMAGE_THUMBNAIL_MAX_EDGE / Math.max(original.width, original.height))
  if (scale >= 1) {
    return null
  }

  const image = await loadImageElementFromBlob(blob)
  const width = Math.max(1, Math.round(original.width * scale))
  const height = Math.max(1, Math.round(original.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', { alpha: true })
  if (!context) {
    return null
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'medium'
  context.drawImage(image, 0, 0, width, height)

  const thumbnailBlob = await canvasToBlob(canvas)
  if (!thumbnailBlob) {
    return null
  }

  return {
    blob: thumbnailBlob,
    width,
    height,
  }
}

export async function writeWorkspaceImageAsset(input: WorkspaceImageAssetInput): Promise<WorkspaceImageAsset> {
  const originalWidth = getSafeDimension(input.originalWidth)
  const originalHeight = getSafeDimension(input.originalHeight)
  const original = originalWidth > 0 && originalHeight > 0
    ? { width: originalWidth, height: originalHeight }
    : await readBlobImageDimensions(input.blob)

  const asset = await platformBridge.writeWorkspaceAsset({
    pathSegments: input.pathSegments,
    fileName: input.fileName,
    blob: input.blob,
  })

  const enrichedAsset: WorkspaceImageAsset = {
    ...asset,
    originalWidth: original.width || undefined,
    originalHeight: original.height || undefined,
    displayWidth: original.width || undefined,
    displayHeight: original.height || undefined,
  }

  try {
    const thumbnailMeta = await writeWorkspaceImageThumbnailAsset({
      ...input,
      originalWidth: original.width,
      originalHeight: original.height,
    })

    return {
      ...enrichedAsset,
      ...thumbnailMeta,
    }
  } catch {
    return enrichedAsset
  }
}

export async function writeWorkspaceImageThumbnailAsset(input: WorkspaceImageThumbnailInput): Promise<Partial<WorkspaceImageAsset>> {
  const originalWidth = getSafeDimension(input.originalWidth)
  const originalHeight = getSafeDimension(input.originalHeight)
  const original = originalWidth > 0 && originalHeight > 0
    ? { width: originalWidth, height: originalHeight }
    : await readBlobImageDimensions(input.blob)
  const thumbnail = await createThumbnail(input.blob, original)

  if (!thumbnail) {
    return {
      originalWidth: original.width || undefined,
      originalHeight: original.height || undefined,
      displayWidth: original.width || undefined,
      displayHeight: original.height || undefined,
    }
  }

  const thumbnailAsset = await platformBridge.writeWorkspaceAsset({
    pathSegments: [...WORKSPACE_IMAGE_THUMBNAIL_PATH, ...input.pathSegments],
    fileName: buildThumbnailFileName(input.fileName),
    blob: thumbnail.blob,
  })

  return {
    thumbnailRelativePath: thumbnailAsset.relativePath,
    originalWidth: original.width || undefined,
    originalHeight: original.height || undefined,
    displayWidth: thumbnail.width,
    displayHeight: thumbnail.height,
  }
}

export async function restoreWorkspaceImageThumbnailAsset(input: RestoreWorkspaceImageThumbnailInput): Promise<Partial<WorkspaceImageAsset> | null> {
  if (!input.asset.relativePath || !input.imageUrl) {
    return null
  }

  const response = await fetch(input.imageUrl)
  if (!response.ok) {
    throw new Error('原图读取失败，无法恢复预览图')
  }

  const blob = await response.blob()
  const originalWidth = getSafeDimension(input.asset.originalWidth)
  const originalHeight = getSafeDimension(input.asset.originalHeight)
  const original = originalWidth > 0 && originalHeight > 0
    ? { width: originalWidth, height: originalHeight }
    : await readBlobImageDimensions(blob)
  const thumbnail = await createThumbnail(blob, original)

  if (!thumbnail) {
    return {
      originalWidth: original.width || undefined,
      originalHeight: original.height || undefined,
      displayWidth: original.width || undefined,
      displayHeight: original.height || undefined,
    }
  }

  if (input.asset.thumbnailRelativePath) {
    const restoredAsset = await platformBridge.writeWorkspaceAssetAtPath({
      relativePath: input.asset.thumbnailRelativePath,
      blob: thumbnail.blob,
    })

    return {
      thumbnailRelativePath: restoredAsset.relativePath,
      originalWidth: original.width || undefined,
      originalHeight: original.height || undefined,
      displayWidth: thumbnail.width,
      displayHeight: thumbnail.height,
    }
  }

  const pathParts = getWorkspaceImageAssetPathParts(input.asset.relativePath, input.asset.fileName)
  const thumbnailAsset = await platformBridge.writeWorkspaceAsset({
    pathSegments: [...WORKSPACE_IMAGE_THUMBNAIL_PATH, ...pathParts.pathSegments],
    fileName: buildThumbnailFileName(pathParts.fileName),
    blob: thumbnail.blob,
  })

  return {
    thumbnailRelativePath: thumbnailAsset.relativePath,
    originalWidth: original.width || undefined,
    originalHeight: original.height || undefined,
    displayWidth: thumbnail.width,
    displayHeight: thumbnail.height,
  }
}
