export const PROJECT_ASSET_ROOT = 'projects'
export const PROJECT_THUMBNAIL_DIRECTORY = 'thumbnails'

function normalizeSegment(value: string) {
  return value.trim()
}

export function buildProjectAssetPath(
  projectId: string | null | undefined,
  ...pathSegments: string[]
) {
  const normalizedProjectId = normalizeSegment(projectId ?? '')
  if (!normalizedProjectId) {
    throw new Error('当前没有活动项目，无法保存项目资产')
  }

  return [
    PROJECT_ASSET_ROOT,
    normalizedProjectId,
    ...pathSegments.map(normalizeSegment).filter(Boolean),
  ]
}

export function buildWorkspaceThumbnailPath(pathSegments: string[]) {
  const normalizedSegments = pathSegments.map(normalizeSegment).filter(Boolean)
  if (normalizedSegments[0] === PROJECT_ASSET_ROOT && normalizedSegments[1]) {
    return [
      PROJECT_ASSET_ROOT,
      normalizedSegments[1],
      PROJECT_THUMBNAIL_DIRECTORY,
      ...normalizedSegments.slice(2),
    ]
  }

  return [PROJECT_THUMBNAIL_DIRECTORY, ...normalizedSegments]
}

export function getWorkspaceAssetPathParts(relativePath: string, fallbackFileName: string) {
  const segments = relativePath.replace(/\\+/g, '/').split('/').filter(Boolean)
  const fileName = segments.pop() || fallbackFileName
  const pathSegments = segments[0] === 'images' ? segments.slice(1) : segments

  return {
    pathSegments,
    fileName,
  }
}
