import type { Node } from '@xyflow/react'
import { DEFAULT_IMAGE_MODEL_ID } from '@/config/modelCatalog'
import type {
  CompareNodeData,
  GenerateStatus,
  GenerateNodeData,
  GeneratedPreviewNodeData,
  GroupNodeData,
  ImageCropNodeData,
  ImageEditNodeData,
  ImageNodeData,
  InlineTextSplitterNodeData,
  LLMFileNodeData,
  LLMOutputTextNodeData,
  PanoramaNodeData,
  TestImageNodeData,
  TextNodeData,
  VideoGenerateNodeData,
  VideoNodeData,
} from '@/types'
import {
  createImageCropNodeData,
  createImageEditNodeData,
  createImageNodeData,
  createTestImageNodeData,
  createVideoGenerateNodeData,
  createVideoNodeData,
} from './canvasNodeData'

const NODE_DRAG_HANDLE = '.node-drag-handle'
export const DEFAULT_TEXT_NODE_LABEL = '提示词'

export type LLMOutputTextNodeDraft = Pick<
  LLMOutputTextNodeData,
  'text' | 'label' | 'status' | 'errorMsg' | 'outputFormat' | 'layoutMode'
>

export type GeneratedPreviewNodeDraft = Pick<
  GeneratedPreviewNodeData,
  | 'label'
  | 'imageUrl'
  | 'imageAsset'
  | 'prompt'
  | 'model'
  | 'apiProfileName'
  | 'ratio'
  | 'status'
  | 'errorMsg'
  | 'imageWidth'
  | 'imageHeight'
  | 'sourceImageNodeId'
  | 'originOperation'
  | 'taskId'
>

export interface CropPreviewNodeDraft {
  label: string
  imageUrl: string
  imageAsset: GeneratedPreviewNodeData['imageAsset']
  ratio: string
  imageWidth: number
  imageHeight: number
  createdAt: number
}

export function buildManualTextNode(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
): Node<TextNodeData> {
  return {
    id,
    type: 'textNode',
    dragHandle: NODE_DRAG_HANDLE,
    position,
    width: size.width,
    height: size.height,
    selected: true,
    data: {
      text: '',
      richPrompt: null,
      label: DEFAULT_TEXT_NODE_LABEL,
    },
  }
}

export function buildManualInlineTextSplitterNode(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
): Node<InlineTextSplitterNodeData> {
  return {
    id,
    type: 'inlineTextSplitterNode',
    dragHandle: NODE_DRAG_HANDLE,
    position,
    width: size.width,
    height: size.height,
    selected: true,
    data: {
      inputText: '',
      connectedTextNode: null,
      separator: '*',
      parts: [],
      lastRunAt: null,
      errorMsg: '',
    },
  }
}

export function buildTextSplitterOutputTextNode(
  id: string,
  text: string,
  label: string,
): Node<TextNodeData> {
  return {
    id,
    type: 'textNode',
    dragHandle: NODE_DRAG_HANDLE,
    position: { x: 0, y: 0 },
    width: 280,
    height: 140,
    selected: false,
    data: {
      text,
      label,
    },
  }
}

export function buildManualImageNode(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
): Node<ImageNodeData> {
  return {
    id,
    type: 'imageNode',
    dragHandle: NODE_DRAG_HANDLE,
    position,
    width: size.width,
    height: size.height,
    selected: true,
    data: createImageNodeData(),
  }
}

export function buildManualVideoNode(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
): Node<VideoNodeData> {
  return {
    id,
    type: 'videoNode',
    dragHandle: NODE_DRAG_HANDLE,
    position,
    width: size.width,
    height: size.height,
    selected: true,
    data: createVideoNodeData(),
  }
}

export function buildManualVideoGenerateNode(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
): Node<VideoGenerateNodeData> {
  return {
    id,
    type: 'videoGenerateNode',
    dragHandle: NODE_DRAG_HANDLE,
    position,
    width: size.width,
    height: size.height,
    selected: true,
    data: createVideoGenerateNodeData(),
  }
}

export function buildManualImageCropNode(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
): Node<ImageCropNodeData> {
  return {
    id,
    type: 'imageCropNode',
    dragHandle: NODE_DRAG_HANDLE,
    position,
    width: size.width,
    height: size.height,
    selected: true,
    data: createImageCropNodeData(),
  }
}

export function buildManualGenerateNode(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
): Node<GenerateNodeData> {
  return {
    id,
    type: 'generateNode',
    dragHandle: NODE_DRAG_HANDLE,
    position,
    width: size.width,
    height: size.height,
    selected: true,
    data: {
      prompt: '',
      richPrompt: null,
      negativePrompt: '',
      imageUrl: null,
      imageAsset: null,
      status: 'idle',
      errorMsg: '',
      ratio: '1:1',
      model: DEFAULT_IMAGE_MODEL_ID,
      resolution: '1K',
      quality: 'auto',
      officialFallback: false,
      googleSearch: false,
      googleImageSearch: false,
      connectedTextNode: null,
      referenceSourceOrder: [],
      maskInputEnabled: false,
      maskSourceNodeId: null,
      activeTaskId: null,
    },
  }
}

export function buildManualImageEditNode(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
): Node<ImageEditNodeData> {
  return {
    id,
    type: 'imageEditNode',
    dragHandle: NODE_DRAG_HANDLE,
    position,
    width: size.width,
    height: size.height,
    selected: true,
    data: createImageEditNodeData(),
  }
}

export function buildManualLLMFileNode(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
): Node<LLMFileNodeData> {
  return {
    id,
    type: 'llmFileNode',
    dragHandle: NODE_DRAG_HANDLE,
    position,
    width: size.width,
    height: size.height,
    selected: true,
    data: {
      presetId: null,
      instructionPrompt: '',
      richPrompt: null,
      inputText: '',
      inputRichPrompt: null,
      connectedTextNode: null,
      inputImageSourceOrder: [],
      model: '',
      outputFormat: 'text',
      outputNodeId: null,
      outputText: '',
      outputJson: '',
      status: 'idle',
      errorMsg: '',
      inputFiles: [],
    },
  }
}

export function buildGroupNode(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
): Node<GroupNodeData> {
  return {
    id,
    type: 'groupNode',
    position,
    width: size.width,
    height: size.height,
    selected: true,
    data: {
      label: `\u7F16\u7EC4 ${id.split('-').at(-1) ?? ''}`.trim(),
      layoutMode: 'manual',
      color: 'violet',
    },
  }
}

export function buildLLMOutputTextNode(
  id: string,
  sourceLLMNodeId: string,
  outputNode: LLMOutputTextNodeDraft,
  size: { width: number; height: number },
): Node<LLMOutputTextNodeData> {
  return {
    id,
    type: 'llmOutputTextNode',
    dragHandle: NODE_DRAG_HANDLE,
    position: { x: 0, y: 0 },
    width: size.width,
    height: size.height,
    data: {
      text: outputNode.text,
      label: outputNode.label,
      status: outputNode.status,
      errorMsg: outputNode.errorMsg,
      sourceLLMNodeId,
      outputFormat: outputNode.outputFormat,
      createdAt: Date.now(),
      layoutMode: outputNode.layoutMode ?? 'auto',
    },
  }
}

export function buildGeneratedPreviewNode(
  id: string,
  sourceGenerateNodeId: string,
  preview: GeneratedPreviewNodeDraft,
  size: { width: number; height: number },
): Node<GeneratedPreviewNodeData> {
  return {
    id,
    type: 'generatedPreviewNode',
    dragHandle: NODE_DRAG_HANDLE,
    position: { x: 0, y: 0 },
    width: size.width,
    height: size.height,
    data: {
      label: preview.label,
      imageUrl: preview.imageUrl,
      imageAsset: preview.imageAsset ?? null,
      prompt: preview.prompt,
      model: preview.model,
      apiProfileName: preview.apiProfileName ?? null,
      ratio: preview.ratio,
      status: preview.status,
      errorMsg: preview.errorMsg,
      imageWidth: preview.imageWidth,
      imageHeight: preview.imageHeight,
      sourceGenerateNodeId,
      sourceImageNodeId: preview.sourceImageNodeId ?? null,
      originOperation: preview.originOperation ?? 'generate',
      taskId: preview.taskId ?? null,
      createdAt: Date.now(),
      layoutMode: 'auto',
    },
  }
}

export function buildGeneratedVideoNode(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
  video: Partial<VideoNodeData>,
): Node<VideoNodeData> {
  return {
    id,
    type: 'videoNode',
    dragHandle: NODE_DRAG_HANDLE,
    position,
    width: size.width,
    height: size.height,
    data: createVideoNodeData(video),
  }
}

export function buildCropPreviewNode(
  id: string,
  sourceCropNodeId: string,
  preview: CropPreviewNodeDraft,
  size: { width: number; height: number },
): Node<GeneratedPreviewNodeData> {
  return {
    id,
    type: 'generatedPreviewNode',
    dragHandle: NODE_DRAG_HANDLE,
    position: { x: 0, y: 0 },
    width: size.width,
    height: size.height,
    selected: false,
    data: {
      label: preview.label,
      imageUrl: preview.imageUrl,
      imageAsset: preview.imageAsset,
      prompt: '',
      model: 'crop',
      ratio: preview.ratio,
      status: 'done' satisfies GenerateStatus,
      errorMsg: '',
      imageWidth: preview.imageWidth,
      imageHeight: preview.imageHeight,
      sourceGenerateNodeId: sourceCropNodeId,
      sourceImageNodeId: null,
      originOperation: 'crop',
      taskId: null,
      createdAt: preview.createdAt,
      layoutMode: 'auto',
    },
  }
}

export function buildManualGeneratedPreviewNode(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
): Node<GeneratedPreviewNodeData> {
  return {
    id,
    type: 'generatedPreviewNode',
    dragHandle: NODE_DRAG_HANDLE,
    position,
    width: size.width,
    height: size.height,
    selected: true,
    data: {
      label: '预览图片',
      imageUrl: '',
      imageAsset: null,
      prompt: '',
      model: DEFAULT_IMAGE_MODEL_ID,
      apiProfileName: null,
      ratio: '1:1',
      status: 'idle',
      errorMsg: '',
      imageWidth: 0,
      imageHeight: 0,
      sourceGenerateNodeId: 'manual-preview',
      sourceImageNodeId: null,
      originOperation: 'generate',
      taskId: null,
      createdAt: Date.now(),
      layoutMode: 'manual',
    },
  }
}

export function buildManualCompareNode(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
): Node<CompareNodeData> {
  return {
    id,
    type: 'compareNode',
    dragHandle: NODE_DRAG_HANDLE,
    position,
    width: size.width,
    height: size.height,
    selected: true,
    data: {
      mode: 'slider',
      activeSlot: 'image1',
      sliderPosition: 50,
    },
  }
}

export function buildManualTestImageNode(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
): Node<TestImageNodeData> {
  return {
    id,
    type: 'testImageNode',
    dragHandle: NODE_DRAG_HANDLE,
    position,
    width: size.width,
    height: size.height,
    selected: true,
    data: createTestImageNodeData(),
  }
}

export function buildManualPanoramaNode(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
): Node<PanoramaNodeData> {
  return {
    id,
    type: 'panoramaNode',
    dragHandle: NODE_DRAG_HANDLE,
    position,
    width: size.width,
    height: size.height,
    selected: true,
    data: {
      sourceImageNodeId: null,
      imageUrl: null,
      imageAsset: null,
      autoRotate: false,
    },
  }
}
