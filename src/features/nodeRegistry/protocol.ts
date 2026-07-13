import type { Node } from '@xyflow/react'
import type { AppNodeType } from '@/types'
import {
  buildManualCompareNode,
  buildManualGenerateNode,
  buildManualGeneratedPreviewNode,
  buildManualImageCropNode,
  buildManualImageEditNode,
  buildManualImageNode,
  buildManualInlineTextSplitterNode,
  buildManualLLMFileNode,
  buildManualPanoramaNode,
  buildManualTestImageNode,
  buildManualTextNode,
  buildManualVideoGenerateNode,
  buildManualVideoNode,
} from '@/store/canvasNodeCreation'
import {
  DEFAULT_COMPARE_NODE_HEIGHT,
  DEFAULT_COMPARE_NODE_WIDTH,
  DEFAULT_GENERATE_NODE_HEIGHT,
  DEFAULT_GENERATE_NODE_WIDTH,
  DEFAULT_IMAGE_CROP_NODE_HEIGHT,
  DEFAULT_IMAGE_CROP_NODE_WIDTH,
  DEFAULT_IMAGE_EDIT_NODE_HEIGHT,
  DEFAULT_IMAGE_EDIT_NODE_WIDTH,
  DEFAULT_IMAGE_NODE_HEIGHT,
  DEFAULT_IMAGE_NODE_WIDTH,
  DEFAULT_INLINE_TEXT_SPLITTER_NODE_HEIGHT,
  DEFAULT_INLINE_TEXT_SPLITTER_NODE_WIDTH,
  DEFAULT_LLM_NODE_HEIGHT,
  DEFAULT_LLM_NODE_WIDTH,
  DEFAULT_PANORAMA_NODE_HEIGHT,
  DEFAULT_PANORAMA_NODE_WIDTH,
  DEFAULT_PREVIEW_NODE_HEIGHT,
  DEFAULT_PREVIEW_NODE_WIDTH,
  DEFAULT_TEXT_NODE_HEIGHT,
  DEFAULT_TEXT_NODE_WIDTH,
  DEFAULT_VIDEO_GENERATE_NODE_HEIGHT,
  DEFAULT_VIDEO_GENERATE_NODE_WIDTH,
  DEFAULT_VIDEO_NODE_HEIGHT,
  DEFAULT_VIDEO_NODE_WIDTH,
} from '@/store/canvasLayoutGeometry'

export type NodeConnectionKind = 'text' | 'image'
export type NodeOutputLayoutKind = 'none' | 'generated-preview' | 'generated-video' | 'llm-output' | 'splitter-output' | 'crop-output'
export type NodeLibraryIcon = 'text' | 'image' | 'sparkles' | 'bot' | 'video' | 'split' | 'crop' | 'compare' | 'panorama' | 'preview'
export type NodeLibraryCategoryId = 'common' | 'text-tools' | 'image-tools' | 'ai-tools'

export interface NodeLibraryRegistration {
  id: string
  category: NodeLibraryCategoryId
  order: number
  icon: NodeLibraryIcon
  label: string
  description: string
  keywords: string[]
}

export interface ManualNodeRegistration {
  size: { width: number; height: number }
  build: (id: string, position: { x: number; y: number }, size: { width: number; height: number }) => Node
}

export interface CanvasNodeRegistration {
  type: AppNodeType
  idPrefix: string
  rendererType?: AppNodeType
  manual?: ManualNodeRegistration
  connection: {
    output?: NodeConnectionKind
    inputs?: Record<string, NodeConnectionKind[]>
    quickCreateTargetHandle?: string
  }
  outputLayout: NodeOutputLayoutKind
  library?: NodeLibraryRegistration
}

const size = (width: number, height: number) => ({ width, height })

const registrations = {
  imageNode: {
    type: 'imageNode', idPrefix: 'img', manual: { size: size(DEFAULT_IMAGE_NODE_WIDTH, DEFAULT_IMAGE_NODE_HEIGHT), build: buildManualImageNode },
    connection: { output: 'image' }, outputLayout: 'none',
    library: { id: 'image', category: 'common', order: 20, icon: 'image', label: '图片组件', description: '导入图片并作为参考或素材。', keywords: ['image', '图片', '素材', '参考图'] },
  },
  videoNode: {
    type: 'videoNode', idPrefix: 'video', manual: { size: size(DEFAULT_VIDEO_NODE_WIDTH, DEFAULT_VIDEO_NODE_HEIGHT), build: buildManualVideoNode },
    connection: {}, outputLayout: 'none',
    library: { id: 'video', category: 'ai-tools', order: 20, icon: 'video', label: '视频组件', description: '导入视频并作为素材节点。', keywords: ['video', '视频'] },
  },
  videoGenerateNode: {
    type: 'videoGenerateNode', idPrefix: 'vgen', manual: { size: size(DEFAULT_VIDEO_GENERATE_NODE_WIDTH, DEFAULT_VIDEO_GENERATE_NODE_HEIGHT), build: buildManualVideoGenerateNode },
    connection: { inputs: { input: ['text', 'image'], prompt: ['text', 'image'], image: ['image'], firstFrame: ['image'], lastFrame: ['image'] }, quickCreateTargetHandle: 'input' }, outputLayout: 'generated-video',
    library: { id: 'ai-video', category: 'common', order: 50, icon: 'video', label: 'AI 视频', description: '配置视频模型、提示词、比例、时长和分辨率。', keywords: ['video', 'ai', '视频', '生成视频'] },
  },
  imageCropNode: {
    type: 'imageCropNode', idPrefix: 'crop', manual: { size: size(DEFAULT_IMAGE_CROP_NODE_WIDTH, DEFAULT_IMAGE_CROP_NODE_HEIGHT), build: buildManualImageCropNode },
    connection: { inputs: { input: ['image'] }, quickCreateTargetHandle: 'input' }, outputLayout: 'crop-output',
    library: { id: 'image-crop', category: 'image-tools', order: 10, icon: 'crop', label: '图像裁切', description: '裁切参考图或提取画面区域。', keywords: ['crop', '裁切', '图片处理'] },
  },
  textNode: {
    type: 'textNode', idPrefix: 'text', manual: { size: size(DEFAULT_TEXT_NODE_WIDTH, DEFAULT_TEXT_NODE_HEIGHT), build: buildManualTextNode },
    connection: { output: 'text' }, outputLayout: 'none',
    library: { id: 'text', category: 'common', order: 10, icon: 'text', label: '文本组件', description: '输入提示词、备注和中间文本。', keywords: ['text', 'prompt', '提示词', '文字'] },
  },
  textSplitterNode: {
    type: 'textSplitterNode', idPrefix: 'split', rendererType: 'textSplitterNode', connection: { output: 'text', inputs: { input: ['text'] } }, outputLayout: 'splitter-output',
  },
  inlineTextSplitterNode: {
    type: 'inlineTextSplitterNode', idPrefix: 'inlinesplit', manual: { size: size(DEFAULT_INLINE_TEXT_SPLITTER_NODE_WIDTH, DEFAULT_INLINE_TEXT_SPLITTER_NODE_HEIGHT), build: buildManualInlineTextSplitterNode },
    connection: { output: 'text', inputs: { input: ['text'] }, quickCreateTargetHandle: 'input' }, outputLayout: 'splitter-output',
    library: { id: 'text-splitter', category: 'text-tools', order: 10, icon: 'split', label: '文本分割', description: '把长文本切分成可连接的片段。', keywords: ['split', '文本分割', '分镜', '拆分'] },
  },
  generateNode: {
    type: 'generateNode', idPrefix: 'gen', manual: { size: size(DEFAULT_GENERATE_NODE_WIDTH, DEFAULT_GENERATE_NODE_HEIGHT), build: buildManualGenerateNode },
    connection: { inputs: { prompt: ['text', 'image'] }, quickCreateTargetHandle: 'prompt' }, outputLayout: 'generated-preview',
    library: { id: 'ai', category: 'common', order: 30, icon: 'sparkles', label: 'AI 绘图', description: '配置模型、提示词和参考图生成图片。', keywords: ['ai', '生成', '绘图', 'generate'] },
  },
  imageEditNode: {
    type: 'imageEditNode', idPrefix: 'edit', manual: { size: size(DEFAULT_IMAGE_EDIT_NODE_WIDTH, DEFAULT_IMAGE_EDIT_NODE_HEIGHT), build: buildManualImageEditNode },
    connection: { inputs: { base: ['image'], reference: ['image'] }, quickCreateTargetHandle: 'base' }, outputLayout: 'generated-preview',
  },
  experimentalGenerateNode: {
    type: 'experimentalGenerateNode', idPrefix: 'experimental', rendererType: 'generateNode', connection: { inputs: { prompt: ['text', 'image'] }, quickCreateTargetHandle: 'prompt' }, outputLayout: 'generated-preview',
  },
  generatedPreviewNode: {
    type: 'generatedPreviewNode', idPrefix: 'preview', manual: { size: size(DEFAULT_PREVIEW_NODE_WIDTH, DEFAULT_PREVIEW_NODE_HEIGHT), build: buildManualGeneratedPreviewNode },
    connection: { output: 'image' }, outputLayout: 'none',
    library: { id: 'preview', category: 'ai-tools', order: 10, icon: 'preview', label: '生成预览', description: '展示生成结果并承接后续编辑。', keywords: ['preview', '预览', '结果'] },
  },
  compareNode: {
    type: 'compareNode', idPrefix: 'compare', manual: { size: size(DEFAULT_COMPARE_NODE_WIDTH, DEFAULT_COMPARE_NODE_HEIGHT), build: buildManualCompareNode },
    connection: { inputs: { image1: ['image'], image2: ['image'] }, quickCreateTargetHandle: 'image1' }, outputLayout: 'none',
    library: { id: 'compare', category: 'image-tools', order: 20, icon: 'compare', label: '图片对比', description: '并排或滑动比较两张图片。', keywords: ['compare', '对比', '图片对比'] },
  },
  groupNode: { type: 'groupNode', idPrefix: 'group', connection: {}, outputLayout: 'none' },
  llmNode: { type: 'llmNode', idPrefix: 'llm', rendererType: 'llmFileNode', connection: { inputs: { input: ['text', 'image'] }, quickCreateTargetHandle: 'input' }, outputLayout: 'llm-output' },
  llmFileNode: {
    type: 'llmFileNode', idPrefix: 'llmfile', manual: { size: size(DEFAULT_LLM_NODE_WIDTH, DEFAULT_LLM_NODE_HEIGHT), build: buildManualLLMFileNode },
    connection: { inputs: { input: ['text', 'image'] }, quickCreateTargetHandle: 'input' }, outputLayout: 'llm-output',
    library: { id: 'llm', category: 'common', order: 40, icon: 'bot', label: '大模型节点', description: '运行多模态或文本大模型任务。', keywords: ['llm', '大模型', '对话', '分析'] },
  },
  llmOutputTextNode: { type: 'llmOutputTextNode', idPrefix: 'llmtext', connection: { output: 'text' }, outputLayout: 'none' },
  testImageNode: { type: 'testImageNode', idPrefix: 'testimg', manual: { size: size(DEFAULT_IMAGE_NODE_WIDTH, DEFAULT_IMAGE_NODE_HEIGHT), build: buildManualTestImageNode }, connection: { output: 'image' }, outputLayout: 'none' },
  panoramaNode: {
    type: 'panoramaNode', idPrefix: 'pano', manual: { size: size(DEFAULT_PANORAMA_NODE_WIDTH, DEFAULT_PANORAMA_NODE_HEIGHT), build: buildManualPanoramaNode },
    connection: { inputs: { input: ['image'] }, quickCreateTargetHandle: 'input' }, outputLayout: 'none',
    library: { id: 'panorama', category: 'image-tools', order: 30, icon: 'panorama', label: '全景图片', description: '展示 360° 全景图片。', keywords: ['panorama', '全景', '360'] },
  },
} satisfies Record<AppNodeType, CanvasNodeRegistration>

export const canvasNodeRegistrations: Record<AppNodeType, CanvasNodeRegistration> = registrations

export type ManualCanvasNodeType =
  | 'imageNode'
  | 'videoNode'
  | 'videoGenerateNode'
  | 'imageCropNode'
  | 'textNode'
  | 'inlineTextSplitterNode'
  | 'generateNode'
  | 'imageEditNode'
  | 'llmFileNode'
  | 'generatedPreviewNode'
  | 'compareNode'
  | 'testImageNode'
  | 'panoramaNode'

export function getCanvasNodeRegistration(type: string | undefined | null) {
  return type && type in canvasNodeRegistrations
    ? canvasNodeRegistrations[type as AppNodeType]
    : null
}

export function getManualNodeRegistration(type: ManualCanvasNodeType) {
  const registration = canvasNodeRegistrations[type].manual
  if (!registration) throw new Error(`节点 ${type} 不支持手动创建`)
  return registration
}

export function getNodeConnectionOutput(type: string | undefined | null): NodeConnectionKind | null {
  return getCanvasNodeRegistration(type)?.connection.output ?? null
}

export function getNodeConnectionInputs(type: string | undefined | null, handleId: string | null): NodeConnectionKind[] {
  if (!handleId) return []
  return getCanvasNodeRegistration(type)?.connection.inputs?.[handleId] ?? []
}

export function getQuickCreateTargetHandle(type: string | undefined | null) {
  return getCanvasNodeRegistration(type)?.connection.quickCreateTargetHandle ?? null
}

export const nodeLibraryRegistrations = Object.values(canvasNodeRegistrations)
  .flatMap((registration) => registration.library && registration.manual
    ? [registration as CanvasNodeRegistration & { library: NodeLibraryRegistration; manual: ManualNodeRegistration }]
    : [])
  .sort((left, right) => left.library.category.localeCompare(right.library.category) || left.library.order - right.library.order)
