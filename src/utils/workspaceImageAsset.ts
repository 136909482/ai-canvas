import type { WorkspaceImageAsset } from '@/types'

export function getWorkspaceAssetThumbnailRelativePath(asset: unknown) {
  if (!asset || typeof asset !== 'object') {
    return undefined
  }

  const thumbnailRelativePath = (asset as Partial<WorkspaceImageAsset>).thumbnailRelativePath
  return typeof thumbnailRelativePath === 'string' && thumbnailRelativePath
    ? thumbnailRelativePath
    : undefined
}
