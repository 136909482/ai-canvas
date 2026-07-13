import type { Node } from '@xyflow/react'
import { DEFAULT_IMAGE_MODEL_ID } from '@/config/modelCatalog'
import type {
  CompareNodeData,
  GenerateNodeData,
  ImageCropNodeData,
  ImageEditNodeData,
  ImageNodeData,
  InlineTextSplitterNodeData,
  LLMFileNodeData,
  LLMNodeData,
  TestImageNodeData,
  TextNodeData,
  TextSplitterNodeData,
  VideoGenerateNodeData,
  VideoNodeData,
} from '@/types'
import {
  createImageCropNodeData,
  createImageNodeData,
  createTestImageNodeData,
  createVideoGenerateNodeData,
  createVideoNodeData,
  sanitizeGptImageQuality,
  sanitizeRichPrompt,
} from './canvasNodeData'
import { DEFAULT_TEXT_NODE_LABEL } from './canvasNodeCreation'
import { getAbsoluteNodePosition } from './canvasLayoutGeometry'

export function canDuplicateNode(node: Node) {
  return ['textNode', 'textSplitterNode', 'inlineTextSplitterNode', 'imageNode', 'videoNode', 'videoGenerateNode', 'imageCropNode', 'generateNode', 'imageEditNode', 'llmNode', 'llmFileNode', 'compareNode', 'testImageNode'].includes(node.type ?? '')
}

export function cloneNodeForDuplicate(
  node: Node,
  nodes: Node[],
  takeNextNodeId: (type: Node['type']) => string | null,
) {
  const nextId = takeNextNodeId(node.type)

  if (!nextId) {
    return null
  }

  const absolutePosition = getAbsoluteNodePosition(nodes, node)
  const duplicatedPosition = {
    x: absolutePosition.x + 32,
    y: absolutePosition.y + 32,
  }

  if (node.type === 'textNode') {
    return {
      ...node,
      id: nextId,
      position: duplicatedPosition,
      parentId: undefined,
      extent: undefined,
      selected: true,
      data: {
        text: typeof node.data?.text === 'string' ? node.data.text : '',
        richPrompt: sanitizeRichPrompt(node.data),
        label: typeof node.data?.label === 'string' && node.data.label !== 'Prompt'
          ? node.data.label
          : DEFAULT_TEXT_NODE_LABEL,
      } satisfies TextNodeData,
    } satisfies Node<TextNodeData>
  }

  if (node.type === 'textSplitterNode') {
    return {
      ...node,
      id: nextId,
      position: duplicatedPosition,
      parentId: undefined,
      extent: undefined,
      selected: true,
      data: {
        inputText: '',
        connectedTextNode: null,
        separator: typeof node.data?.separator === 'string' ? node.data.separator : '\\n\\n',
        outputNodeIds: [],
        lastRunAt: null,
        errorMsg: '',
      } satisfies TextSplitterNodeData,
    } satisfies Node<TextSplitterNodeData>
  }

  if (node.type === 'inlineTextSplitterNode') {
    return {
      ...node,
      id: nextId,
      position: duplicatedPosition,
      parentId: undefined,
      extent: undefined,
      selected: true,
      data: {
        inputText: '',
        connectedTextNode: null,
        separator: typeof node.data?.separator === 'string' ? node.data.separator : '\\n\\n',
        parts: [],
        lastRunAt: null,
        errorMsg: '',
      } satisfies InlineTextSplitterNodeData,
    } satisfies Node<InlineTextSplitterNodeData>
  }

  if (node.type === 'imageNode') {
    return {
      ...node,
      id: nextId,
      position: duplicatedPosition,
      parentId: undefined,
      extent: undefined,
      selected: true,
      data: createImageNodeData(node.data),
    } satisfies Node<ImageNodeData>
  }

  if (node.type === 'videoNode') {
    return {
      ...node,
      id: nextId,
      position: duplicatedPosition,
      parentId: undefined,
      extent: undefined,
      selected: true,
      data: createVideoNodeData(node.data),
    } satisfies Node<VideoNodeData>
  }

  if (node.type === 'videoGenerateNode') {
    return {
      ...node,
      id: nextId,
      position: duplicatedPosition,
      parentId: undefined,
      extent: undefined,
      selected: true,
      data: {
        ...createVideoGenerateNodeData(node.data),
        connectedTextNode: null,
        referenceSourceOrder: [],
        firstFrameSourceNodeId: null,
        lastFrameSourceNodeId: null,
        status: 'idle',
        errorMsg: '',
      },
    } satisfies Node<VideoGenerateNodeData>
  }

  if (node.type === 'imageCropNode') {
    return {
      ...node,
      id: nextId,
      position: duplicatedPosition,
      parentId: undefined,
      extent: undefined,
      selected: true,
      data: {
        ...createImageCropNodeData(node.data),
        sourceImageNodeId: null,
        outputPreviewNodeIds: [],
        lastRunAt: null,
        status: 'idle',
        errorMsg: '',
      } satisfies ImageCropNodeData,
    } satisfies Node<ImageCropNodeData>
  }

  if (node.type === 'generateNode') {
    return {
      ...node,
      id: nextId,
      position: duplicatedPosition,
      parentId: undefined,
      extent: undefined,
      selected: true,
      data: {
        prompt: typeof node.data?.prompt === 'string' ? node.data.prompt : '',
        richPrompt: sanitizeRichPrompt(node.data),
        negativePrompt: typeof node.data?.negativePrompt === 'string' ? node.data.negativePrompt : '',
        imageUrl: null,
        imageAsset: null,
        status: 'idle',
        errorMsg: '',
        ratio: typeof node.data?.ratio === 'string' ? node.data.ratio : '1:1',
        model: typeof node.data?.model === 'string' ? node.data.model : DEFAULT_IMAGE_MODEL_ID,
        resolution: typeof node.data?.resolution === 'string' ? node.data.resolution : '1K',
        quality: sanitizeGptImageQuality(node.data?.quality),
        officialFallback: node.data?.officialFallback === true,
        googleSearch: node.data?.googleSearch === true,
        googleImageSearch: node.data?.googleImageSearch === true,
        connectedTextNode: null,
        referenceSourceOrder: [],
        maskInputEnabled: false,
        maskSourceNodeId: null,
        activeTaskId: null,
      } satisfies GenerateNodeData,
    } satisfies Node<GenerateNodeData>
  }

  if (node.type === 'imageEditNode') {
    return {
      ...node,
      id: nextId,
      position: duplicatedPosition,
      parentId: undefined,
      extent: undefined,
      selected: true,
      data: {
        sourceImageNodeId: null,
        prompt: typeof node.data?.prompt === 'string' ? node.data.prompt : '',
        negativePrompt: typeof node.data?.negativePrompt === 'string' ? node.data.negativePrompt : '',
        model: typeof node.data?.model === 'string' ? node.data.model : DEFAULT_IMAGE_MODEL_ID,
        ratio: typeof node.data?.ratio === 'string' ? node.data.ratio : '1:1',
        resolution: typeof node.data?.resolution === 'string' ? node.data.resolution : '1K',
        status: 'idle',
        errorMsg: '',
        referenceSourceOrder: [],
        activeTaskId: null,
        maskDataUrl: null,
        maskUpdatedAt: null,
        brushSize: typeof node.data?.brushSize === 'number' ? Math.max(4, Math.min(96, node.data.brushSize)) : 28,
        brushMode: node.data?.brushMode === 'erase' ? 'erase' : 'paint',
        maskVisible: typeof node.data?.maskVisible === 'boolean' ? node.data.maskVisible : true,
      } satisfies ImageEditNodeData,
    } satisfies Node<ImageEditNodeData>
  }

  if (node.type === 'llmNode') {
    return {
      ...node,
      id: nextId,
      position: duplicatedPosition,
      parentId: undefined,
      extent: undefined,
      selected: true,
      data: {
        presetId: typeof node.data?.presetId === 'string' ? node.data.presetId : null,
        instructionPrompt: typeof node.data?.instructionPrompt === 'string' ? node.data.instructionPrompt : '',
        richPrompt: sanitizeRichPrompt(node.data),
        inputText: '',
        inputRichPrompt: null,
        connectedTextNode: null,
        inputImageSourceOrder: [],
        model: typeof node.data?.model === 'string' ? node.data.model : '',
        outputFormat: node.data?.outputFormat === 'json' || node.data?.outputFormat === 'markdown' ? node.data.outputFormat : 'text',
        outputNodeId: null,
        outputText: '',
        outputJson: '',
        status: 'idle',
        errorMsg: '',
      } satisfies LLMNodeData,
    } satisfies Node<LLMNodeData>
  }

  if (node.type === 'llmFileNode') {
    return {
      ...node,
      id: nextId,
      position: duplicatedPosition,
      parentId: undefined,
      extent: undefined,
      selected: true,
      data: {
        presetId: typeof node.data?.presetId === 'string' ? node.data.presetId : null,
        instructionPrompt: typeof node.data?.instructionPrompt === 'string' ? node.data.instructionPrompt : '',
        richPrompt: sanitizeRichPrompt(node.data),
        inputText: '',
        inputRichPrompt: null,
        connectedTextNode: null,
        inputImageSourceOrder: [],
        model: typeof node.data?.model === 'string' ? node.data.model : '',
        outputFormat: node.data?.outputFormat === 'json' || node.data?.outputFormat === 'markdown' ? node.data.outputFormat : 'text',
        outputNodeId: null,
        outputText: '',
        outputJson: '',
        status: 'idle',
        errorMsg: '',
        inputFiles: Array.isArray(node.data?.inputFiles)
          ? node.data.inputFiles
            .filter((file): file is LLMFileNodeData['inputFiles'][number] => Boolean(file && typeof file === 'object'))
            .map((file) => ({ ...file }))
          : [],
      } satisfies LLMFileNodeData,
    } satisfies Node<LLMFileNodeData>
  }

  if (node.type === 'compareNode') {
    return {
      ...node,
      id: nextId,
      position: duplicatedPosition,
      parentId: undefined,
      extent: undefined,
      selected: true,
      data: {
        mode: node.data?.mode === 'toggle' ? 'toggle' : 'slider',
        activeSlot: node.data?.activeSlot === 'image2' ? 'image2' : 'image1',
        sliderPosition: typeof node.data?.sliderPosition === 'number' ? node.data.sliderPosition : 50,
      } satisfies CompareNodeData,
    } satisfies Node<CompareNodeData>
  }

  if (node.type === 'testImageNode') {
    return {
      ...node,
      id: nextId,
      position: duplicatedPosition,
      parentId: undefined,
      extent: undefined,
      selected: true,
      data: createTestImageNodeData(node.data),
    } satisfies Node<TestImageNodeData>
  }

  return null
}
