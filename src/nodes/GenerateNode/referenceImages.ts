import type { WorkspaceImageAsset } from '@/types'

export type ReferenceImageItem = {
  sourceId: string
  imageUrl: string
  thumbnailRelativePath?: string
}

const REFERENCE_IMAGE_KEY_SEPARATOR = '\u0000'

export function encodeReferenceImageKey(item: ReferenceImageItem) {
  return [
    item.sourceId,
    item.imageUrl,
    item.thumbnailRelativePath ?? '',
  ].join(REFERENCE_IMAGE_KEY_SEPARATOR)
}

export function decodeReferenceImageKey(key: string): ReferenceImageItem | null {
  const [sourceId = '', imageUrl = '', thumbnailRelativePath = ''] = key.split(REFERENCE_IMAGE_KEY_SEPARATOR)
  if (!sourceId || !imageUrl) {
    return null
  }

  return {
    sourceId,
    imageUrl,
    thumbnailRelativePath: thumbnailRelativePath || undefined,
  }
}

export function buildReferenceImageAsset(item: ReferenceImageItem): WorkspaceImageAsset | null {
  return item.thumbnailRelativePath
    ? {
        relativePath: '',
        mimeType: '',
        fileName: '',
        thumbnailRelativePath: item.thumbnailRelativePath,
      }
    : null
}

export function getReferenceOrderLabel(order: number) {
  return String(order)
}
