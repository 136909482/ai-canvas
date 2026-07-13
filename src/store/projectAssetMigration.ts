import { writeWorkspaceImageAsset, writeWorkspaceImageThumbnailAsset } from '@/features/imageAssets/runtime'
import { platformBridge } from '@/platform'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { reportDiagnostic } from '@/store/useDiagnosticsStore'
import {
  isWorkspaceAssetNodeType,
  type ProjectSnapshot,
  type WorkspaceImageAsset,
} from '@/types'

const MIGRATED_IMAGE_ASSET_PATH = ['migrated-images']
const MIGRATED_VIDEO_ASSET_PATH = ['migrated-videos']
const BACKFILLED_THUMBNAIL_ASSET_PATH = ['backfilled']

export function isStorageConfigured() {
  return useSettingsStore.getState().runtime.workspaceConfigured
}

function isEmbeddedImageUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value)
}

function isEmbeddedVideoUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:video\/[a-zA-Z0-9.+-]+;base64,/.test(value)
}

async function embeddedMediaUrlToBlob(mediaUrl: string) {
  const response = await fetch(mediaUrl)

  if (!response.ok) {
    throw new Error('绱犳潗缂撳瓨杩佺Щ澶辫触')
  }

  return response.blob()
}

function getMigratedImageFileName(node: ProjectSnapshot['canvas']['nodes'][number]) {
  const rawName = typeof node.data?.name === 'string' && node.data.name.trim()
    ? node.data.name.trim()
    : typeof node.data?.label === 'string' && node.data.label.trim()
      ? node.data.label.trim()
      : `${node.id}.png`

  return /\.[a-zA-Z0-9]+$/.test(rawName) ? rawName : `${rawName}.png`
}

function getMigratedVideoFileName(node: ProjectSnapshot['canvas']['nodes'][number]) {
  const rawName = typeof node.data?.name === 'string' && node.data.name.trim()
    ? node.data.name.trim()
    : `${node.id}.mp4`

  return /\.[a-zA-Z0-9]+$/.test(rawName) ? rawName : `${rawName}.mp4`
}

function getImageAssetFileName(asset: { relativePath?: unknown; fileName?: unknown }) {
  if (typeof asset.fileName === 'string' && asset.fileName.trim()) {
    return asset.fileName
  }

  if (typeof asset.relativePath === 'string' && asset.relativePath.trim()) {
    return asset.relativePath.replace(/\\+/g, '/').split('/').pop() || 'image.png'
  }

  return 'image.png'
}

function isWorkspaceImageAsset(value: unknown): value is WorkspaceImageAsset {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as WorkspaceImageAsset).relativePath === 'string',
  )
}

async function enrichWorkspaceImageAssetThumbnail(
  asset: WorkspaceImageAsset,
  cache: Map<string, Promise<WorkspaceImageAsset>>,
  stats?: { thumbnailBackfillCount: number },
) {
  if (asset.thumbnailRelativePath || !asset.relativePath) {
    return asset
  }

  const cached = cache.get(asset.relativePath)
  if (cached) {
    return cached
  }

  const request = (async () => {
    try {
      const imageUrl = await platformBridge.resolveWorkspaceAssetUrl(asset.relativePath)
      const response = await fetch(imageUrl)
      if (!response.ok) {
        return asset
      }

      const blob = await response.blob()
      const thumbnailMeta = await writeWorkspaceImageThumbnailAsset({
        pathSegments: BACKFILLED_THUMBNAIL_ASSET_PATH,
        fileName: getImageAssetFileName(asset),
        blob,
        originalWidth: asset.originalWidth,
        originalHeight: asset.originalHeight,
      })
      if (thumbnailMeta.thumbnailRelativePath && stats) {
        stats.thumbnailBackfillCount += 1
      }

      return {
        ...asset,
        ...thumbnailMeta,
      }
    } catch {
      return asset
    }
  })()

  cache.set(asset.relativePath, request)
  return request
}

export async function migrateSnapshotEmbeddedImageAssets(
  snapshot: ProjectSnapshot,
  options?: {
    updateLiveCanvas?: boolean
    thumbnailCache?: Map<string, Promise<WorkspaceImageAsset>>
    stats?: { thumbnailBackfillCount: number }
  },
) {
  if (!isStorageConfigured()) {
    return snapshot
  }

  const thumbnailCache = options?.thumbnailCache ?? new Map<string, Promise<WorkspaceImageAsset>>()
  const migratedNodes = await Promise.all(snapshot.canvas.nodes.map(async (node) => {
    if (node.type === 'videoNode') {
      if (node.data?.videoAsset) {
        return node
      }

      const videoUrl = node.data?.videoUrl
      if (!isEmbeddedVideoUrl(videoUrl)) {
        return node
      }

      const blob = await embeddedMediaUrlToBlob(videoUrl)
      const videoAsset = await platformBridge.writeWorkspaceAsset({
        pathSegments: MIGRATED_VIDEO_ASSET_PATH,
        fileName: getMigratedVideoFileName(node),
        blob,
      })

      if (options?.updateLiveCanvas) {
        const resolvedVideoUrl = await platformBridge.resolveWorkspaceAssetUrl(videoAsset.relativePath)
        useCanvasStore.getState().updateNodeData(node.id, {
          videoAsset,
          videoUrl: resolvedVideoUrl,
        })
      }

      return {
        ...node,
        data: {
          ...node.data,
          videoAsset,
          videoUrl: null,
        },
      }
    }

    if (!isWorkspaceAssetNodeType(node.type)) {
      return node
    }

    if (isWorkspaceImageAsset(node.data?.imageAsset)) {
      const imageAsset = await enrichWorkspaceImageAssetThumbnail(node.data.imageAsset, thumbnailCache, options?.stats)
      if (options?.updateLiveCanvas && imageAsset !== node.data.imageAsset) {
        useCanvasStore.getState().updateNodeData(node.id, { imageAsset })
      }

      return imageAsset === node.data.imageAsset
        ? node
        : {
            ...node,
            data: {
              ...node.data,
              imageAsset,
            },
          }
    }

    const imageUrl = node.data?.imageUrl
    if (!isEmbeddedImageUrl(imageUrl)) {
      return node
    }

    const blob = await embeddedMediaUrlToBlob(imageUrl)
    const imageAsset = await writeWorkspaceImageAsset({
      pathSegments: MIGRATED_IMAGE_ASSET_PATH,
      fileName: getMigratedImageFileName(node),
      blob,
    })

    if (options?.updateLiveCanvas) {
      const resolvedImageUrl = await platformBridge.resolveWorkspaceAssetUrl(imageAsset.relativePath)
      useCanvasStore.getState().updateNodeData(node.id, {
        imageAsset,
        imageUrl: resolvedImageUrl,
      })
    }

    return {
      ...node,
      data: {
        ...node.data,
        imageAsset,
        imageUrl: null,
      },
    }
  }))

  const migratedTasks = await Promise.all((snapshot.taskQueue.tasks ?? []).map(async (task) => {
    if (!isWorkspaceImageAsset(task.resultImageAsset)) {
      return task
    }

    const resultImageAsset = await enrichWorkspaceImageAssetThumbnail(task.resultImageAsset, thumbnailCache, options?.stats)
    return resultImageAsset === task.resultImageAsset
      ? task
      : {
          ...task,
          resultImageAsset,
        }
  }))

  return {
    ...snapshot,
    canvas: {
      ...snapshot.canvas,
      nodes: migratedNodes,
    },
    taskQueue: {
      ...snapshot.taskQueue,
      tasks: migratedTasks,
    },
  }
}

export async function resolveWorkspaceNodeAssetUrls() {
  const { nodes, updateNodeData } = useCanvasStore.getState()

  await Promise.all(nodes.map(async (node) => {
    if (!isWorkspaceAssetNodeType(node.type)) {
      return
    }

    if (node.type === 'videoNode') {
      const asset = node.data?.videoAsset as { relativePath?: unknown } | null | undefined
      const relativePath = typeof asset?.relativePath === 'string'
        ? asset.relativePath
        : null

      if (!relativePath) {
        return
      }

      try {
        const videoUrl = await platformBridge.resolveWorkspaceAssetUrl(relativePath)
        updateNodeData(node.id, { videoUrl })
      } catch (error) {
        reportDiagnostic({
          area: 'resource',
          title: '视频资源恢复失败',
          error,
          code: 'VIDEO_ASSET_RESTORE_FAILED',
          retryable: false,
          context: { nodeId: node.id, relativePath },
        })
      }
      return
    }

    const asset = node.data?.imageAsset as { relativePath?: unknown } | null | undefined
    const relativePath = typeof asset?.relativePath === 'string'
      ? asset.relativePath
      : null

    if (!relativePath) {
      return
    }

    try {
      const imageUrl = await platformBridge.resolveWorkspaceAssetUrl(relativePath)
      updateNodeData(node.id, { imageUrl })
    } catch (error) {
      reportDiagnostic({
        area: 'resource',
        title: '图片资源恢复失败',
        error,
        code: 'IMAGE_ASSET_RESTORE_FAILED',
        retryable: false,
        context: { nodeId: node.id, relativePath },
      })
    }
  }))
}
