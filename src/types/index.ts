import type { Edge, Node, NodeProps } from '@xyflow/react'
import type { ProviderId } from '@/config/modelCatalog'
import type { RichPromptDocument } from '@/features/richPrompt/types'

export type ModelTestStatus = 'idle' | 'testing' | 'success' | 'error'
export type ThemeMode = 'dark' | 'light' | 'system'
export type CanvasPerformanceMode = 'quality' | 'performance'
export type EdgeStyle = 'animated' | 'solid'
export type CustomModelKind = 'chat' | 'image' | 'video' | 'music' | 'tool'
export type ImageRequestMode = 'sync' | 'async'
export type ImageOperationType = 'text-to-image' | 'image-to-image' | 'image-edit'
export type ImageInputFidelity = 'low' | 'high'
export type GptImageQuality = 'auto' | 'low' | 'medium' | 'high'
export type ImageEditBrushMode = 'paint' | 'erase'
export type CompareMode = 'slider' | 'toggle'
export type CompareImageSlot = 'image1' | 'image2'
export type GroupNodeLayoutMode = 'manual'
export type GroupNodeColor = 'violet' | 'blue' | 'green' | 'amber' | 'rose' | 'slate'
export type LLMOutputFormat = 'text' | 'json' | 'markdown'
export type LLMNodeStatus = 'idle' | 'running' | 'success' | 'error'
export type LLMOutputNodeStatus = 'queued' | 'generating' | 'done' | 'error'
export type ImageCropNodeStatus = 'idle' | 'running' | 'done' | 'error'
export type VideoGenerateMode = 'text' | 'keyframes' | 'reference'

export interface CustomImageModelConfig {
  id: string
  name: string
  modelId: string
  kind: CustomModelKind
  enabled: boolean
  testStatus: ModelTestStatus
  testMessage: string
  lastTestedAt: number | null
}

export interface ProviderAsyncConfig {
  enabled: boolean
  submitPath: string
  submitQuery: Record<string, string>
  taskIdPath: string
  pollPath: string
  pollIntervalSeconds: number
  statusPath: string
  successValues: string[]
  failureValues: string[]
  errorPath: string
  imageUrlPaths: string[]
  b64JsonPaths: string[]
}

export interface ProviderProfileConfig {
  id: string
  name: string
  kind: CustomModelKind
  apiKey: string
  apiUrl: string
  provider: ProviderId
  requestMode: ImageRequestMode
  asyncConfig?: ProviderAsyncConfig | null
  enabled: boolean
  testStatus: ModelTestStatus
  testMessage: string
  lastTestedAt: number | null
}

export type RuntimeModelConfig = CustomImageModelConfig & Pick<ProviderProfileConfig, 'apiKey' | 'apiUrl' | 'provider' | 'requestMode' | 'asyncConfig'>

export interface ApiConfig {
  model: string
  customModels: CustomImageModelConfig[]
  providerProfiles: ProviderProfileConfig[]
  activeProviderProfileIds: Partial<Record<CustomModelKind, string>>
  modelProviderProfileIds: Record<string, string>
  storage: StorageConfig
}

export interface WorkspaceConfigModel {
  id: string
  name: string
  modelId: string
  kind: CustomModelKind
  enabled: boolean
}

export interface WorkspaceProviderProfile {
  id: string
  name: string
  kind: CustomModelKind
  apiKey: string
  apiUrl: string
  provider: ProviderId
  requestMode: ImageRequestMode
  asyncConfig?: ProviderAsyncConfig | null
  enabled: boolean
}

export interface WorkspaceConfigFile {
  version: 1
  model: string
  customModels: WorkspaceConfigModel[]
  providerProfiles?: WorkspaceProviderProfile[]
  activeProviderProfileIds?: Partial<Record<CustomModelKind, string>>
  modelProviderProfileIds?: Record<string, string>
  storage: Pick<StorageConfig, 'autosaveIntervalMs' | 'canvasTopBarCollapsed' | 'alignmentGuidesEnabled' | 'themeMode' | 'canvasPerformanceMode' | 'canvasGridEnabled' | 'lowQualityPreviewEnabled' | 'edgeStyle'>
}

export interface StorageConfig {
  autosaveIntervalMs: number
  canvasTopBarCollapsed: boolean
  alignmentGuidesEnabled: boolean
  themeMode: ThemeMode
  canvasPerformanceMode: CanvasPerformanceMode
  canvasGridEnabled: boolean
  edgeStyle: EdgeStyle
  lowQualityPreviewEnabled: boolean
  workspaceDirectoryName: string
  workspaceConfigured: boolean
}

export interface WorkspaceImageAsset {
  relativePath: string
  mimeType: string
  fileName: string
  thumbnailRelativePath?: string
  previewRelativePath?: string
  displayWidth?: number
  displayHeight?: number
  originalWidth?: number
  originalHeight?: number
}

export type GenerateStatus = 'idle' | 'queued' | 'generating' | 'done' | 'error'

export interface ImageNodeData extends Record<string, unknown> {
  prompt: string
  negativePrompt: string
  imageUrl: string | null
  imageAsset?: WorkspaceImageAsset | null
  name?: string
  imageNaturalWidth?: number
  imageNaturalHeight?: number
  status: GenerateStatus
  errorMsg: string
  ratio: string
  model: string
  referenceImageUrl: string | null
}

export interface VideoNodeData extends Record<string, unknown> {
  videoUrl: string | null
  videoAsset?: WorkspaceImageAsset | null
  name?: string
  duration: number
  videoWidth: number
  videoHeight: number
  status: GenerateStatus
  errorMsg: string
}

export interface VideoGenerateNodeData extends Record<string, unknown> {
  prompt: string
  model: string
  mode: VideoGenerateMode
  ratio: '16:9' | '9:16'
  duration: '5s' | '10s'
  resolution: '480p' | '720p' | '1080p'
  connectedTextNode: string | null
  referenceSourceOrder: string[]
  firstFrameSourceNodeId: string | null
  lastFrameSourceNodeId: string | null
  status: GenerateStatus
  errorMsg: string
}

export interface GenerateNodeData extends Record<string, unknown> {
  prompt: string
  richPrompt?: RichPromptDocument | null
  negativePrompt: string
  imageUrl: string | null
  imageAsset?: WorkspaceImageAsset | null
  status: GenerateStatus
  errorMsg: string
  ratio: string
  model: string
  resolution: string
  quality: GptImageQuality
  officialFallback: boolean
  googleSearch: boolean
  googleImageSearch: boolean
  connectedTextNode: string | null
  referenceSourceOrder: string[]
  maskInputEnabled: boolean
  maskSourceNodeId: string | null
  activeTaskId: string | null
}

export interface ImageEditNodeData extends Record<string, unknown> {
  sourceImageNodeId: string | null
  prompt: string
  negativePrompt: string
  model: string
  ratio: string
  resolution: string
  status: GenerateStatus
  errorMsg: string
  referenceSourceOrder: string[]
  activeTaskId: string | null
  maskDataUrl: string | null
  maskUpdatedAt: number | null
  brushSize: number
  brushMode: ImageEditBrushMode
  maskVisible: boolean
}

export interface GeneratedPreviewNodeData extends Record<string, unknown> {
  label: string
  imageUrl: string
  imageAsset?: WorkspaceImageAsset | null
  prompt: string
  model: string
  apiProfileName?: string | null
  ratio: string
  status: GenerateStatus
  errorMsg: string
  imageWidth: number
  imageHeight: number
  sourceGenerateNodeId: string
  sourceImageNodeId?: string | null
  originOperation?: 'generate' | 'image-edit' | 'crop'
  taskId: string | null
  createdAt: number
  layoutMode?: 'auto' | 'manual'
}

export interface TextNodeData extends Record<string, unknown> {
  text: string
  richPrompt?: RichPromptDocument | null
  label?: string
}

export interface TextSplitterNodeData extends Record<string, unknown> {
  inputText: string
  connectedTextNode: string | null
  separator: string
  outputNodeIds: string[]
  lastRunAt: number | null
  errorMsg: string
}

export interface InlineTextSplitterNodeData extends Record<string, unknown> {
  inputText: string
  connectedTextNode: string | null
  separator: string
  parts: string[]
  lastRunAt: number | null
  errorMsg: string
}

export interface CompareNodeData extends Record<string, unknown> {
  mode: CompareMode
  activeSlot: CompareImageSlot
  sliderPosition: number
}

export interface ImageCropNodeData extends Record<string, unknown> {
  sourceImageNodeId: string | null
  rowCount: number
  columnCount: number
  horizontalCuts: number[]
  verticalCuts: number[]
  outputPreviewNodeIds: string[]
  lastRunAt: number | null
  status: ImageCropNodeStatus
  errorMsg: string
}

export interface GroupNodeData extends Record<string, unknown> {
  label: string
  layoutMode: GroupNodeLayoutMode
  color?: GroupNodeColor
}

export interface LLMNodeData extends Record<string, unknown> {
  presetId: string | null
  instructionPrompt: string
  richPrompt?: RichPromptDocument | null
  inputText: string
  inputRichPrompt?: RichPromptDocument | null
  connectedTextNode: string | null
  inputImageSourceOrder: string[]
  model: string
  outputFormat: LLMOutputFormat
  outputNodeId: string | null
  outputText: string
  outputJson: string
  status: LLMNodeStatus
  errorMsg: string
}

export interface LLMInputFileData extends Record<string, unknown> {
  id: string
  name: string
  mimeType: string
  size: number
  content: string
  uploadedAt: number
}

export interface LLMFileNodeData extends LLMNodeData {
  inputFiles: LLMInputFileData[]
}

export interface LLMOutputTextNodeData extends Record<string, unknown> {
  text: string
  label: string
  status: LLMOutputNodeStatus
  errorMsg: string
  sourceLLMNodeId: string
  outputFormat: LLMOutputFormat
  createdAt: number
  layoutMode?: 'auto' | 'manual'
}

export interface TestImageNodeData extends Record<string, unknown> {
  imageUrl: string | null
  imageAsset?: WorkspaceImageAsset | null
  name: string
  imageNaturalWidth?: number
  imageNaturalHeight?: number
  description: string
  tags: string[]
  source: string
  resolution: string
  status: GenerateStatus
  errorMsg: string
}

export interface PanoramaNodeData extends Record<string, unknown> {
  sourceImageNodeId: string | null
  imageUrl: string | null
  imageAsset?: WorkspaceImageAsset | null
  name?: string
  width?: number
  height?: number
  autoRotate: boolean
}

export type GenerateTaskStatus = 'queued' | 'running' | 'done' | 'error'
export type GenerateTaskRemoteStatus = 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE'

export interface GenerateTask {
  id: string
  displayId: string
  kind: 'image' | 'video'
  sourceNodeId: string
  previewNodeId: string | null
  model: string
  prompt: string
  negativePrompt: string
  ratio: string
  resolution: string
  operationType: ImageOperationType
  sourceImageNodeId: string | null
  maskImageUrl?: string | null
  apiProfileId?: string | null
  apiProfileName?: string | null
  provider?: ProviderId | null
  referenceImageUrls: string[]
  inputFidelity?: ImageInputFidelity | null
  quality?: GptImageQuality | null
  officialFallback?: boolean
  googleSearch?: boolean
  googleImageSearch?: boolean
  videoMode?: VideoGenerateMode | null
  videoDuration?: VideoGenerateNodeData['duration'] | null
  resultImageAsset?: WorkspaceImageAsset | null
  resultVideoAsset?: WorkspaceImageAsset | null
  status: GenerateTaskStatus
  errorMsg: string
  remoteTaskId: string | null
  remoteStatus: GenerateTaskRemoteStatus | null
  createdAt: number
  startedAt: number
  finishedAt: number | null
}

export interface CanvasSnapshot {
  nodes: Node[]
  edges: Edge[]
}

export interface WorkflowTemplate {
  id: string
  name: string
  schemaVersion: 1
  nodes: Node[]
  edges: Edge[]
  createdAt: number
  updatedAt: number
}

export interface WorkflowTemplateLibrary {
  type: 'ai-canvas-workflow-templates'
  version: 1
  templates: WorkflowTemplate[]
}

export interface TaskQueueSnapshot {
  tasks: GenerateTask[]
}

export interface ProjectSnapshot {
  schemaVersion: number
  canvas: CanvasSnapshot
  taskQueue: TaskQueueSnapshot
}

export interface ProjectRecord {
  id: string
  name: string
  savedSnapshot: ProjectSnapshot
  workingSnapshot: ProjectSnapshot
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  archivedAt?: number | null
}

export interface WorkspaceData {
  projects: ProjectRecord[]
  activeProjectId: string | null
  lastOpenedProjectId: string | null
}

export type AppNodeType =
  | 'imageNode'
  | 'videoNode'
  | 'videoGenerateNode'
  | 'imageCropNode'
  | 'textNode'
  | 'textSplitterNode'
  | 'inlineTextSplitterNode'
  | 'generateNode'
  | 'imageEditNode'
  | 'experimentalGenerateNode'
  | 'generatedPreviewNode'
  | 'compareNode'
  | 'groupNode'
  | 'llmNode'
  | 'llmFileNode'
  | 'llmOutputTextNode'
  | 'testImageNode'
  | 'panoramaNode'

export const IMAGE_SOURCE_NODE_TYPES = ['imageNode', 'generatedPreviewNode', 'testImageNode'] as const
export const WORKSPACE_ASSET_NODE_TYPES = ['imageNode', 'videoNode', 'generateNode', 'generatedPreviewNode', 'testImageNode', 'panoramaNode'] as const

export function isImageSourceNodeType(type: string | undefined | null): type is (typeof IMAGE_SOURCE_NODE_TYPES)[number] {
  return typeof type === 'string' && IMAGE_SOURCE_NODE_TYPES.includes(type as (typeof IMAGE_SOURCE_NODE_TYPES)[number])
}

export function isWorkspaceAssetNodeType(type: string | undefined | null): type is (typeof WORKSPACE_ASSET_NODE_TYPES)[number] {
  return typeof type === 'string' && WORKSPACE_ASSET_NODE_TYPES.includes(type as (typeof WORKSPACE_ASSET_NODE_TYPES)[number])
}

export interface AppNodeDataMap {
  imageNode: ImageNodeData
  videoNode: VideoNodeData
  videoGenerateNode: VideoGenerateNodeData
  imageCropNode: ImageCropNodeData
  textNode: TextNodeData
  textSplitterNode: TextSplitterNodeData
  inlineTextSplitterNode: InlineTextSplitterNodeData
  generateNode: GenerateNodeData
  imageEditNode: ImageEditNodeData
  experimentalGenerateNode: GenerateNodeData
  generatedPreviewNode: GeneratedPreviewNodeData
  compareNode: CompareNodeData
  groupNode: GroupNodeData
  llmNode: LLMNodeData
  llmFileNode: LLMFileNodeData
  llmOutputTextNode: LLMOutputTextNodeData
  testImageNode: TestImageNodeData
  panoramaNode: PanoramaNodeData
}

export type AppNode<T extends AppNodeType = AppNodeType> = Node<AppNodeDataMap[T], T>

export type AppNodeProps<T extends AppNodeType> = NodeProps<AppNode<T>>
