import { downloadMediaAsBlob } from '@/api/image/shared'
import { writeWorkspaceImageAsset } from '@/features/imageAssets/runtime'
import { platformBridge } from '@/platform'
import { useSettingsStore } from '@/store/useSettingsStore'
import type { GenerateTask, WorkspaceImageAsset } from '@/types'

function buildAssetFolderDate(timestamp: number) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildGeneratedImageFileName(task: GenerateTask, mimeType: string) {
  const extension = mimeType === 'image/jpeg'
    ? 'jpg'
    : mimeType === 'image/webp'
      ? 'webp'
      : mimeType === 'image/gif'
        ? 'gif'
        : 'png'

  return `${task.model}-${task.id}.${extension}`
}

function buildGeneratedVideoFileName(task: GenerateTask, mimeType: string) {
  const extension = mimeType === 'video/webm'
    ? 'webm'
    : mimeType === 'video/quicktime'
      ? 'mov'
      : 'mp4'

  return `${task.model}-${task.id}.${extension}`
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl)

  if (!response.ok) {
    throw new Error(`Failed to decode generated image: ${response.status}`)
  }

  return response.blob()
}

async function downloadGeneratedImageAsBlob(imageUrl: string) {
  if (imageUrl.startsWith('data:image/')) {
    return dataUrlToBlob(imageUrl)
  }

  return downloadMediaAsBlob(imageUrl, 'Failed to fetch generated image')
}

async function downloadGeneratedVideoAsBlob(videoUrl: string) {
  if (videoUrl.startsWith('data:video/')) {
    return dataUrlToBlob(videoUrl)
  }

  return downloadMediaAsBlob(videoUrl, 'Failed to fetch generated video')
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('Failed to convert generated image to data URL'))
    }

    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to convert generated image to data URL'))
    }

    reader.readAsDataURL(blob)
  })
}

export async function persistGeneratedImageAsset(
  task: GenerateTask,
  imageUrl: string,
): Promise<{ asset: WorkspaceImageAsset | null; resolvedUrl: string }> {
  const blob = await downloadGeneratedImageAsBlob(imageUrl)

  if (!useSettingsStore.getState().runtime.workspaceConfigured) {
    return {
      asset: null,
      resolvedUrl: await blobToDataUrl(blob),
    }
  }

  const asset = await writeWorkspaceImageAsset({
    pathSegments: [buildAssetFolderDate(task.createdAt)],
    fileName: buildGeneratedImageFileName(task, blob.type || 'image/png'),
    blob,
  })
  const resolvedUrl = await platformBridge.resolveWorkspaceAssetUrl(asset.relativePath)

  return {
    asset,
    resolvedUrl,
  }
}

export async function persistGeneratedVideoAsset(
  task: GenerateTask,
  videoUrl: string,
): Promise<{ asset: WorkspaceImageAsset | null; resolvedUrl: string }> {
  if (!useSettingsStore.getState().runtime.workspaceConfigured) {
    return {
      asset: null,
      resolvedUrl: videoUrl,
    }
  }

  let blob: Blob
  try {
    blob = await downloadGeneratedVideoAsBlob(videoUrl)
  } catch {
    return {
      asset: null,
      resolvedUrl: videoUrl,
    }
  }

  const asset = await platformBridge.writeWorkspaceAsset({
    pathSegments: [buildAssetFolderDate(task.createdAt)],
    fileName: buildGeneratedVideoFileName(task, blob.type || 'video/mp4'),
    blob,
  })
  const resolvedUrl = await platformBridge.resolveWorkspaceAssetUrl(asset.relativePath)

  return {
    asset,
    resolvedUrl,
  }
}

export function loadVideoMetadata(videoUrl: string) {
  return new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
    const video = document.createElement('video')

    video.preload = 'metadata'
    video.onloadedmetadata = () => resolve({
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      width: video.videoWidth,
      height: video.videoHeight,
    })
    video.onerror = () => reject(new Error('Failed to load generated video metadata'))
    video.src = videoUrl
  })
}

export function getVideoNodeSize(width: number, height: number) {
  const aspectRatio = width > 0 && height > 0 ? width / height : 16 / 9
  const widthValue = aspectRatio >= 1 ? 360 : 260
  const heightValue = Math.round(widthValue / aspectRatio)

  return {
    width: widthValue,
    height: Math.max(heightValue, 180),
  }
}
