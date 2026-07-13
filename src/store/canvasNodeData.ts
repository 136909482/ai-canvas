import type { Node } from '@xyflow/react'
import { DEFAULT_IMAGE_MODEL_ID } from '@/config/modelCatalog'
import {
  DEFAULT_IMAGE_CROP_COLUMNS,
  DEFAULT_IMAGE_CROP_ROWS,
  clampCropSegmentCount,
  normalizeCropCuts,
} from '@/features/imageCrop/runtime'
import type { RichPromptDocument } from '@/features/richPrompt/types'
import type {
  GptImageQuality,
  ImageCropNodeData,
  ImageEditNodeData,
  ImageNodeData,
  TestImageNodeData,
  VideoGenerateNodeData,
  VideoNodeData,
} from '@/types'

function cloneWorkspaceImageAsset(asset: unknown) {
  return asset && typeof asset === 'object'
    ? { ...(asset as Record<string, unknown>) }
    : null
}

export function sanitizeRichPrompt(data: Record<string, unknown> | undefined): RichPromptDocument | null {
  const richPrompt = data?.richPrompt
  if (!richPrompt || typeof richPrompt !== 'object' || Array.isArray(richPrompt)) {
    return null
  }

  return richPrompt as RichPromptDocument
}

export function sanitizeGptImageQuality(value: unknown): GptImageQuality {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'auto'
    ? value
    : 'auto'
}

export function createImageNodeData(data?: Node['data']): ImageNodeData {
  return {
    prompt: typeof data?.prompt === 'string' ? data.prompt : '',
    negativePrompt: typeof data?.negativePrompt === 'string' ? data.negativePrompt : '',
    imageUrl: typeof data?.imageUrl === 'string' ? data.imageUrl : null,
    imageAsset: cloneWorkspaceImageAsset(data?.imageAsset) as ImageNodeData['imageAsset'],
    name: typeof data?.name === 'string' ? data.name : undefined,
    imageNaturalWidth: typeof data?.imageNaturalWidth === 'number' && Number.isFinite(data.imageNaturalWidth) ? data.imageNaturalWidth : undefined,
    imageNaturalHeight: typeof data?.imageNaturalHeight === 'number' && Number.isFinite(data.imageNaturalHeight) ? data.imageNaturalHeight : undefined,
    status: 'idle',
    errorMsg: '',
    ratio: typeof data?.ratio === 'string' ? data.ratio : '1:1',
    model: typeof data?.model === 'string' ? data.model : DEFAULT_IMAGE_MODEL_ID,
    referenceImageUrl: typeof data?.referenceImageUrl === 'string' ? data.referenceImageUrl : null,
  }
}

export function createTestImageNodeData(data?: Node['data']): TestImageNodeData {
  return {
    imageUrl: typeof data?.imageUrl === 'string' ? data.imageUrl : null,
    imageAsset: cloneWorkspaceImageAsset(data?.imageAsset) as TestImageNodeData['imageAsset'],
    name: typeof data?.name === 'string' ? data.name : '',
    imageNaturalWidth: typeof data?.imageNaturalWidth === 'number' && Number.isFinite(data.imageNaturalWidth) ? data.imageNaturalWidth : undefined,
    imageNaturalHeight: typeof data?.imageNaturalHeight === 'number' && Number.isFinite(data.imageNaturalHeight) ? data.imageNaturalHeight : undefined,
    description: typeof data?.description === 'string' ? data.description : '',
    tags: Array.isArray(data?.tags) ? [...data.tags] : [],
    source: typeof data?.source === 'string' ? data.source : '',
    resolution: typeof data?.resolution === 'string' ? data.resolution : '',
    status: 'idle',
    errorMsg: '',
  }
}

export function createVideoNodeData(data?: Node['data']): VideoNodeData {
  return {
    videoUrl: typeof data?.videoUrl === 'string' ? data.videoUrl : null,
    videoAsset: cloneWorkspaceImageAsset(data?.videoAsset) as VideoNodeData['videoAsset'],
    name: typeof data?.name === 'string' ? data.name : undefined,
    duration: typeof data?.duration === 'number' && Number.isFinite(data.duration) ? data.duration : 0,
    videoWidth: typeof data?.videoWidth === 'number' && Number.isFinite(data.videoWidth) ? data.videoWidth : 0,
    videoHeight: typeof data?.videoHeight === 'number' && Number.isFinite(data.videoHeight) ? data.videoHeight : 0,
    status: data?.status === 'queued' || data?.status === 'generating' || data?.status === 'done' || data?.status === 'error'
      ? data.status
      : 'idle',
    errorMsg: typeof data?.errorMsg === 'string' ? data.errorMsg : '',
  }
}

export function getOrderedStringIds(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function createVideoGenerateNodeData(data?: Node['data']): VideoGenerateNodeData {
  const ratio = data?.ratio === '9:16' ? '9:16' : '16:9'
  const duration = data?.duration === '10s' ? '10s' : '5s'
  const resolution = data?.resolution === '480p' || data?.resolution === '1080p' ? data.resolution : '720p'

  return {
    prompt: typeof data?.prompt === 'string' ? data.prompt : '',
    model: typeof data?.model === 'string' ? data.model : '',
    mode: data?.mode === 'keyframes' || data?.mode === 'reference' ? data.mode : 'text',
    ratio,
    duration,
    resolution,
    connectedTextNode: typeof data?.connectedTextNode === 'string' ? data.connectedTextNode : null,
    referenceSourceOrder: getOrderedStringIds(data?.referenceSourceOrder),
    firstFrameSourceNodeId: typeof data?.firstFrameSourceNodeId === 'string' ? data.firstFrameSourceNodeId : null,
    lastFrameSourceNodeId: typeof data?.lastFrameSourceNodeId === 'string' ? data.lastFrameSourceNodeId : null,
    status: data?.status === 'queued' || data?.status === 'generating' || data?.status === 'done' || data?.status === 'error'
      ? data.status
      : 'idle',
    errorMsg: typeof data?.errorMsg === 'string' ? data.errorMsg : '',
  }
}

export function createImageEditNodeData(data?: Node['data']): ImageEditNodeData {
  return {
    sourceImageNodeId: typeof data?.sourceImageNodeId === 'string' ? data.sourceImageNodeId : null,
    prompt: typeof data?.prompt === 'string' ? data.prompt : '',
    negativePrompt: typeof data?.negativePrompt === 'string' ? data.negativePrompt : '',
    model: typeof data?.model === 'string' ? data.model : DEFAULT_IMAGE_MODEL_ID,
    ratio: typeof data?.ratio === 'string' ? data.ratio : '1:1',
    resolution: typeof data?.resolution === 'string' ? data.resolution : '1K',
    status: data?.status === 'queued' || data?.status === 'generating' || data?.status === 'done' || data?.status === 'error'
      ? data.status
      : 'idle',
    errorMsg: typeof data?.errorMsg === 'string' ? data.errorMsg : '',
    referenceSourceOrder: getOrderedStringIds(data?.referenceSourceOrder),
    activeTaskId: typeof data?.activeTaskId === 'string' ? data.activeTaskId : null,
    maskDataUrl: typeof data?.maskDataUrl === 'string' ? data.maskDataUrl : null,
    maskUpdatedAt: typeof data?.maskUpdatedAt === 'number' ? data.maskUpdatedAt : null,
    brushSize: typeof data?.brushSize === 'number' ? Math.max(4, Math.min(96, data.brushSize)) : 28,
    brushMode: data?.brushMode === 'erase' ? 'erase' : 'paint',
    maskVisible: typeof data?.maskVisible === 'boolean' ? data.maskVisible : true,
  }
}

export function createImageCropNodeData(data?: Node['data']): ImageCropNodeData {
  const rowCount = clampCropSegmentCount(typeof data?.rowCount === 'number' ? data.rowCount : DEFAULT_IMAGE_CROP_ROWS, DEFAULT_IMAGE_CROP_ROWS)
  const columnCount = clampCropSegmentCount(typeof data?.columnCount === 'number' ? data.columnCount : DEFAULT_IMAGE_CROP_COLUMNS, DEFAULT_IMAGE_CROP_COLUMNS)

  return {
    sourceImageNodeId: typeof data?.sourceImageNodeId === 'string' ? data.sourceImageNodeId : null,
    rowCount,
    columnCount,
    horizontalCuts: normalizeCropCuts(data?.horizontalCuts, rowCount),
    verticalCuts: normalizeCropCuts(data?.verticalCuts, columnCount),
    outputPreviewNodeIds: getOrderedStringIds(data?.outputPreviewNodeIds),
    lastRunAt: typeof data?.lastRunAt === 'number' ? data.lastRunAt : null,
    status: data?.status === 'running' || data?.status === 'done' || data?.status === 'error' ? data.status : 'idle',
    errorMsg: typeof data?.errorMsg === 'string' ? data.errorMsg : '',
  }
}
