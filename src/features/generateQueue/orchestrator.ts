import { generateImage, submitAsyncImageGeneration, waitForAsyncImageGeneration } from '@/api/imageAdapter'
import { submitAliyunTextToVideoGeneration, waitForAliyunVideoGeneration, type GenerateVideoParams } from '@/api/videoAdapter'
import { DEFAULT_IMAGE_MODEL_ID } from '@/config/modelCatalog'
import { resolveRuntimeModelConfig } from '@/features/settings/providerConfig'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useTaskQueueStore } from '@/store/useTaskQueueStore'
import { reportDiagnostic } from '@/store/useDiagnosticsStore'
import type { GenerateTask, GptImageQuality, ImageInputFidelity, ImageOperationType, VideoGenerateMode, VideoGenerateNodeData, WorkspaceImageAsset } from '@/types'
import { getPreviewNodeSize, loadImageDimensions } from './previewUtils'
import {
  getVideoNodeSize,
  loadVideoMetadata,
  persistGeneratedImageAsset,
  persistGeneratedVideoAsset,
} from './generatedAssets'

const UI_TEXT = {
  previewLabelPrefix: '\u9884\u89c8',
  missingSourceNode: '\u751f\u6210\u4efb\u52a1\u5bf9\u5e94\u7684 AI \u7ed8\u56fe\u8282\u70b9\u4e0d\u5b58\u5728',
  missingVideoSourceNode: '\u751f\u6210\u4efb\u52a1\u5bf9\u5e94\u7684 AI \u89c6\u9891\u8282\u70b9\u4e0d\u5b58\u5728',
  missingPreviewNode: '\u751f\u6210\u4efb\u52a1\u5bf9\u5e94\u7684\u9884\u89c8\u8282\u70b9\u4e0d\u5b58\u5728',
  missingVideoNode: '\u751f\u6210\u4efb\u52a1\u5bf9\u5e94\u7684\u89c6\u9891\u7ed3\u679c\u8282\u70b9\u4e0d\u5b58\u5728',
  restoreFailurePrefix: '\u9879\u76ee\u6062\u590d\u5931\u8d25\uff1a',
  assetPersistFailed: '\u751f\u6210\u56fe\u7247\u5df2\u8fd4\u56de\uff0c\u4f46\u5199\u5165\u672c\u5730\u8d44\u4ea7\u5931\u8d25',
} as const

const activeRemoteResumeTaskIds = new Set<string>()

type EnqueueGenerateTaskInput = {
  sourceNodeId: string
  prompt: string
  negativePrompt?: string
  model?: string
  ratio?: string
  resolution?: string
  operationType?: ImageOperationType
  sourceImageNodeId?: string | null
  maskImageUrl?: string | null
  referenceImageUrls?: string[]
  inputFidelity?: ImageInputFidelity | null
  quality?: GptImageQuality | null
  officialFallback?: boolean
  googleSearch?: boolean
  googleImageSearch?: boolean
}

type EnqueueVideoGenerateTaskInput = {
  sourceNodeId: string
  prompt: string
  model: string
  mode: VideoGenerateMode
  ratio: VideoGenerateNodeData['ratio']
  resolution: VideoGenerateNodeData['resolution']
  duration: VideoGenerateNodeData['duration']
}

function createPreviewLabel(timestamp: number) {
  return `${UI_TEXT.previewLabelPrefix} ${new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })}`
}

function getTaskProviderSnapshot(kind: 'image' | 'video', modelId: string) {
  const profile = useSettingsStore.getState().getResolvedProviderProfile(modelId, kind)

  return {
    apiProfileId: profile?.id ?? null,
    apiProfileName: profile?.name ?? null,
    provider: profile?.provider ?? null,
  }
}

function findReusablePreviewNode(sourceNodeId: string) {
  const canvasStore = useCanvasStore.getState()
  const connectedPreviewNodes = canvasStore.edges
    .filter((edge) => edge.source === sourceNodeId)
    .map((edge) => canvasStore.nodes.find((node) => node.id === edge.target && node.type === 'generatedPreviewNode'))
    .filter((node): node is NonNullable<typeof node> => Boolean(node))
    .filter((node) => !node.data?.imageUrl)
    .sort((left, right) => {
      const leftIsManualPreview = left.data?.sourceGenerateNodeId === 'manual-preview'
      const rightIsManualPreview = right.data?.sourceGenerateNodeId === 'manual-preview'

      if (leftIsManualPreview !== rightIsManualPreview) {
        return leftIsManualPreview ? -1 : 1
      }

      const leftCreatedAt = typeof left.data?.createdAt === 'number' ? left.data.createdAt : 0
      const rightCreatedAt = typeof right.data?.createdAt === 'number' ? right.data.createdAt : 0
      return rightCreatedAt - leftCreatedAt
    })

  return connectedPreviewNodes[0] ?? null
}

function findReusableVideoNode(sourceNodeId: string) {
  const canvasStore = useCanvasStore.getState()
  const connectedVideoNodes = canvasStore.edges
    .filter((edge) => edge.source === sourceNodeId)
    .map((edge) => canvasStore.nodes.find((node) => node.id === edge.target && node.type === 'videoNode'))
    .filter((node): node is NonNullable<typeof node> => Boolean(node))
    .filter((node) => !node.data?.videoUrl)

  return connectedVideoNodes[0] ?? null
}

function resolvePreviewSourceImageNodeId(sourceImageNodeId: string | null) {
  if (!sourceImageNodeId) {
    return null
  }

  const sourceNode = useCanvasStore.getState().nodes.find((node) => node.id === sourceImageNodeId)

  if (!sourceNode) {
    return null
  }

  if (sourceNode.type === 'imageNode') {
    return sourceNode.id
  }

  if (sourceNode.type === 'generatedPreviewNode') {
    return typeof sourceNode.data?.sourceImageNodeId === 'string' ? sourceNode.data.sourceImageNodeId : null
  }

  return null
}

function resolveTaskSourceImageUrl(sourceImageNodeId: string | null) {
  if (!sourceImageNodeId) {
    return null
  }

  const sourceNode = useCanvasStore.getState().nodes.find((node) => node.id === sourceImageNodeId)
  return typeof sourceNode?.data?.imageUrl === 'string' && sourceNode.data.imageUrl
    ? sourceNode.data.imageUrl
    : null
}

function createQueuedPreview(
  sourceNodeId: string,
  prompt: string,
  model: string,
  ratio: string,
  options?: {
    originOperation?: 'generate' | 'image-edit'
    sourceImageNodeId?: string | null
    apiProfileName?: string | null
  },
) {
  const canvasStore = useCanvasStore.getState()
  const previewTimestamp = Date.now()
  const reusablePreviewNode = findReusablePreviewNode(sourceNodeId)
  const originOperation = options?.originOperation ?? 'generate'
  const previewSourceImageNodeId = resolvePreviewSourceImageNodeId(options?.sourceImageNodeId ?? null)

  if (reusablePreviewNode) {
    canvasStore.updateNodeData(reusablePreviewNode.id, {
      label: createPreviewLabel(previewTimestamp),
      prompt,
      model,
      apiProfileName: options?.apiProfileName ?? null,
      ratio,
      status: 'queued',
      errorMsg: '',
      sourceGenerateNodeId: sourceNodeId,
      sourceImageNodeId: previewSourceImageNodeId,
      originOperation,
      taskId: null,
      createdAt: previewTimestamp,
    })

    return reusablePreviewNode.id
  }

  return canvasStore.createGeneratedPreviewNode(sourceNodeId, {
    label: createPreviewLabel(previewTimestamp),
    prompt,
    imageUrl: '',
    model,
    apiProfileName: options?.apiProfileName ?? null,
    ratio,
    status: 'queued',
    errorMsg: '',
    imageWidth: 0,
    imageHeight: 0,
    sourceImageNodeId: previewSourceImageNodeId,
    originOperation,
    taskId: null,
  })
}

function createQueuedVideoNode(sourceNodeId: string, model: string) {
  const canvasStore = useCanvasStore.getState()
  const reusableVideoNode = findReusableVideoNode(sourceNodeId)

  if (reusableVideoNode) {
    canvasStore.updateNodeData(reusableVideoNode.id, {
      videoUrl: null,
      videoAsset: null,
      name: `${model} 生成中`,
      duration: 0,
      videoWidth: 0,
      videoHeight: 0,
      status: 'queued',
      errorMsg: '',
    })

    return reusableVideoNode.id
  }

  return canvasStore.createGeneratedVideoNode(sourceNodeId, {
    videoUrl: null,
    videoAsset: null,
    name: `${model} 生成中`,
    duration: 0,
    videoWidth: 0,
    videoHeight: 0,
    status: 'queued',
    errorMsg: '',
  })
}

function getActiveSourceTaskState(sourceNodeId: string) {
  const tasks = useTaskQueueStore.getState().tasks
  const runningTasks = tasks
    .filter((task) => task.sourceNodeId === sourceNodeId && task.status === 'running')
    .sort((left, right) => left.startedAt - right.startedAt)

  if (runningTasks.length > 0) {
    return {
      status: 'generating' as const,
      activeTaskId: runningTasks[0].id,
      errorMsg: '',
    }
  }

  const queuedTasks = tasks
    .filter((task) => task.sourceNodeId === sourceNodeId && task.status === 'queued')
    .sort((left, right) => left.createdAt - right.createdAt)

  if (queuedTasks.length > 0) {
    return {
      status: 'queued' as const,
      activeTaskId: queuedTasks[0].id,
      errorMsg: '',
    }
  }

  return null
}

function syncSourceNodeAfterTaskSettles(
  task: GenerateTask,
  settledState: { status: 'done' | 'error'; errorMsg?: string; imageUrl?: string; imageAsset?: WorkspaceImageAsset | null },
) {
  const activeState = getActiveSourceTaskState(task.sourceNodeId)
  const canvasStore = useCanvasStore.getState()
  const { updateNodeData } = canvasStore
  const sourceNode = canvasStore.nodes.find((node) => node.id === task.sourceNodeId)

  if (activeState) {
    updateNodeData(task.sourceNodeId, activeState)
    return
  }

  updateNodeData(task.sourceNodeId, {
    status: settledState.status,
    errorMsg: settledState.errorMsg ?? '',
    activeTaskId: null,
    ...(sourceNode?.type === 'generateNode' && settledState.imageUrl ? { imageUrl: settledState.imageUrl } : {}),
    ...(sourceNode?.type === 'generateNode' && settledState.imageAsset !== undefined ? { imageAsset: settledState.imageAsset } : {}),
  })
}

function syncSourceNodeWithTask(task: GenerateTask, status: 'queued' | 'generating' | 'done' | 'error', errorMsg = '') {
  const canvasStore = useCanvasStore.getState()
  const sourceNode = canvasStore.nodes.find((node) => node.id === task.sourceNodeId)

  if (!sourceNode || (sourceNode.type !== 'generateNode' && sourceNode.type !== 'imageEditNode' && sourceNode.type !== 'videoGenerateNode')) {
    return
  }

  const patch: Record<string, unknown> = {
    prompt: task.prompt,
    model: task.model,
    ratio: task.ratio,
    resolution: task.resolution,
    status,
    errorMsg,
  }

  if (sourceNode.type === 'generateNode' || sourceNode.type === 'imageEditNode') {
    patch.negativePrompt = task.negativePrompt
    patch.activeTaskId = status === 'queued' || status === 'generating' ? task.id : null
  }

  if (sourceNode.type === 'videoGenerateNode') {
    patch.mode = task.videoMode ?? sourceNode.data?.mode ?? 'text'
    patch.duration = task.videoDuration ?? sourceNode.data?.duration ?? '5s'
  }

  if (sourceNode.type === 'imageEditNode') {
    patch.sourceImageNodeId = task.sourceImageNodeId
    patch.maskDataUrl = task.maskImageUrl ?? sourceNode.data?.maskDataUrl ?? null
  }

  canvasStore.updateNodeData(task.sourceNodeId, patch)
}

function syncPreviewNodeWithTask(task: GenerateTask, status: 'queued' | 'generating' | 'done' | 'error', errorMsg = '') {
  const previewNodeId = task.previewNodeId

  if (!previewNodeId) {
    return
  }

  const { updateNodeData } = useCanvasStore.getState()
  updateNodeData(previewNodeId, {
    prompt: task.prompt,
    model: task.model,
    ratio: task.ratio,
    status,
    errorMsg,
    taskId: task.id,
  })
}

function syncVideoNodeWithTask(task: GenerateTask, status: 'queued' | 'generating' | 'done' | 'error', errorMsg = '') {
  const videoNodeId = task.previewNodeId

  if (!videoNodeId) {
    return
  }

  const { updateNodeData } = useCanvasStore.getState()
  updateNodeData(videoNodeId, {
    status,
    errorMsg,
    name: status === 'done' ? `${task.model} 生成结果` : `${task.model} 生成中`,
  })
}

export function enqueueGenerateTask(input: EnqueueGenerateTaskInput) {
  const canvasStore = useCanvasStore.getState()
  const sourceNode = canvasStore.nodes.find((node) => node.id === input.sourceNodeId && node.type === 'generateNode')

  if (!sourceNode) {
    return null
  }

  const prompt = input.prompt.trim()
  if (!prompt) {
    return null
  }

  const ratio = input.ratio || '1:1'
  const model = input.model || DEFAULT_IMAGE_MODEL_ID
  const providerSnapshot = getTaskProviderSnapshot('image', model)
  const sourceImageNodeId = typeof input.sourceImageNodeId === 'string' ? input.sourceImageNodeId : null
  const maskImageUrl = input.maskImageUrl ?? null
  const operationType = input.operationType === 'image-edit' && sourceImageNodeId && maskImageUrl
    ? 'image-edit'
    : (input.referenceImageUrls?.length ?? 0) > 0
      ? 'image-to-image'
      : 'text-to-image'
  const previewNodeId = createQueuedPreview(input.sourceNodeId, prompt, model, ratio, {
    originOperation: operationType === 'image-edit' ? 'image-edit' : 'generate',
    sourceImageNodeId: operationType === 'image-edit' ? sourceImageNodeId : null,
    apiProfileName: providerSnapshot.apiProfileName,
  })
  const taskId = useTaskQueueStore.getState().createTask({
    sourceNodeId: input.sourceNodeId,
    previewNodeId,
    model,
    prompt,
    negativePrompt: input.negativePrompt ?? '',
    ratio,
    resolution: input.resolution ?? '1K',
    operationType,
    sourceImageNodeId: operationType === 'image-edit' ? sourceImageNodeId : null,
    maskImageUrl: operationType === 'image-edit' ? maskImageUrl : null,
    ...providerSnapshot,
    referenceImageUrls: input.referenceImageUrls ?? [],
    inputFidelity: null,
    quality: input.quality ?? null,
    officialFallback: Boolean(input.officialFallback),
    googleSearch: Boolean(input.googleSearch),
    googleImageSearch: Boolean(input.googleImageSearch),
  })

  const sourceTaskState = getActiveSourceTaskState(input.sourceNodeId)
  canvasStore.updateNodeData(input.sourceNodeId, {
    status: sourceTaskState?.status ?? 'queued',
    errorMsg: sourceTaskState?.errorMsg ?? '',
    model,
    activeTaskId: sourceTaskState?.activeTaskId ?? taskId,
  })
  canvasStore.updateNodeData(previewNodeId, { taskId })

  return taskId
}

export function enqueueVideoGenerateTask(input: EnqueueVideoGenerateTaskInput) {
  const canvasStore = useCanvasStore.getState()
  const sourceNode = canvasStore.nodes.find((node) => node.id === input.sourceNodeId && node.type === 'videoGenerateNode')

  if (!sourceNode) {
    return null
  }

  const prompt = input.prompt.trim()
  const model = input.model.trim()
  if (!prompt || !model) {
    return null
  }

  const videoNodeId = createQueuedVideoNode(input.sourceNodeId, model)
  const providerSnapshot = getTaskProviderSnapshot('video', model)
  const taskId = useTaskQueueStore.getState().createTask({
    kind: 'video',
    sourceNodeId: input.sourceNodeId,
    previewNodeId: videoNodeId,
    model,
    prompt,
    ratio: input.ratio,
    resolution: input.resolution,
    operationType: 'text-to-image',
    ...providerSnapshot,
    referenceImageUrls: [],
    videoMode: input.mode,
    videoDuration: input.duration,
  })

  const sourceTaskState = getActiveSourceTaskState(input.sourceNodeId)
  canvasStore.updateNodeData(input.sourceNodeId, {
    status: sourceTaskState?.status ?? 'queued',
    errorMsg: sourceTaskState?.errorMsg ?? '',
    model,
  })
  canvasStore.updateNodeData(videoNodeId, { status: 'queued', errorMsg: '' })

  return taskId
}

export function enqueueImageEditTask(input: EnqueueGenerateTaskInput) {
  const canvasStore = useCanvasStore.getState()
  const sourceNode = canvasStore.nodes.find((node) => node.id === input.sourceNodeId && node.type === 'imageEditNode')

  if (!sourceNode) {
    return null
  }

  const prompt = input.prompt.trim()
  const sourceImageNodeId = typeof input.sourceImageNodeId === 'string'
    ? input.sourceImageNodeId
    : typeof sourceNode.data?.sourceImageNodeId === 'string'
      ? sourceNode.data.sourceImageNodeId
      : null
  if (!prompt || !sourceImageNodeId) {
    return null
  }

  const sourceImageNode = canvasStore.nodes.find((node) => node.id === sourceImageNodeId)
  const sourceImageUrl = typeof sourceImageNode?.data?.imageUrl === 'string' ? sourceImageNode.data.imageUrl : ''
  if (!sourceImageUrl) {
    return null
  }

  const ratio = input.ratio || '1:1'
  const model = input.model || DEFAULT_IMAGE_MODEL_ID
  const providerSnapshot = getTaskProviderSnapshot('image', model)
  const maskImageUrl = input.maskImageUrl ?? (typeof sourceNode.data?.maskDataUrl === 'string' ? sourceNode.data.maskDataUrl : null)
  if (!maskImageUrl) {
    return null
  }

  const referenceImageUrls = input.referenceImageUrls ?? []
  const previewNodeId = createQueuedPreview(input.sourceNodeId, prompt, model, ratio, {
    originOperation: 'image-edit',
    sourceImageNodeId,
    apiProfileName: providerSnapshot.apiProfileName,
  })
  const taskId = useTaskQueueStore.getState().createTask({
    sourceNodeId: input.sourceNodeId,
    previewNodeId,
    model,
    prompt,
    negativePrompt: input.negativePrompt ?? '',
    ratio,
    resolution: input.resolution ?? '1K',
    operationType: 'image-edit',
    sourceImageNodeId,
    maskImageUrl,
    ...providerSnapshot,
    referenceImageUrls,
    inputFidelity: null,
    quality: input.quality ?? null,
    officialFallback: Boolean(input.officialFallback),
    googleSearch: Boolean(input.googleSearch),
    googleImageSearch: Boolean(input.googleImageSearch),
  })

  const sourceTaskState = getActiveSourceTaskState(input.sourceNodeId)
  canvasStore.updateNodeData(input.sourceNodeId, {
    status: sourceTaskState?.status ?? 'queued',
    errorMsg: sourceTaskState?.errorMsg ?? '',
    model,
    sourceImageNodeId,
    maskDataUrl: maskImageUrl,
    activeTaskId: sourceTaskState?.activeTaskId ?? taskId,
  })
  canvasStore.updateNodeData(previewNodeId, { taskId })

  return taskId
}

export function retryGenerateTask(taskId: string) {
  const taskStore = useTaskQueueStore.getState()
  const task = taskStore.tasks.find((item) => item.id === taskId)

  if (!task) {
    return null
  }

  if (task.remoteTaskId && (task.kind === 'video' || task.kind === 'image')) {
    taskStore.resumeRemoteTask(taskId)
    const runningTask = useTaskQueueStore.getState().tasks.find((item) => item.id === taskId)

    if (!runningTask) {
      return null
    }

    syncSourceNodeWithTask(runningTask, 'generating')
    if (runningTask.kind === 'video') {
      syncVideoNodeWithTask(runningTask, 'generating')
    } else {
      syncPreviewNodeWithTask(runningTask, 'generating')
    }
    void resumeRemoteGenerateTask(taskId)

    return taskId
  }

  const previewNodeId = task.kind === 'video'
    ? createQueuedVideoNode(task.sourceNodeId, task.model)
    : createQueuedPreview(task.sourceNodeId, task.prompt, task.model, task.ratio, {
        originOperation: task.operationType === 'image-edit' ? 'image-edit' : 'generate',
        sourceImageNodeId: task.sourceImageNodeId,
        apiProfileName: task.apiProfileName,
      })

  taskStore.markTaskQueued(taskId, {
    kind: task.kind,
    sourceNodeId: task.sourceNodeId,
    previewNodeId,
    model: task.model,
    prompt: task.prompt,
    negativePrompt: task.negativePrompt,
    ratio: task.ratio,
    resolution: task.resolution,
    operationType: task.operationType,
    sourceImageNodeId: task.sourceImageNodeId,
    maskImageUrl: task.maskImageUrl ?? null,
    referenceImageUrls: task.referenceImageUrls,
    inputFidelity: task.inputFidelity ?? null,
    quality: task.quality ?? null,
    officialFallback: Boolean(task.officialFallback),
    googleSearch: Boolean(task.googleSearch),
    googleImageSearch: Boolean(task.googleImageSearch),
    videoMode: task.videoMode ?? null,
    videoDuration: task.videoDuration ?? null,
  })

  const nextTask = useTaskQueueStore.getState().tasks.find((item) => item.id === taskId)
  if (!nextTask) {
    return null
  }

  const sourceTaskState = getActiveSourceTaskState(nextTask.sourceNodeId)
  useCanvasStore.getState().updateNodeData(nextTask.sourceNodeId, {
    status: sourceTaskState?.status ?? 'queued',
    errorMsg: sourceTaskState?.errorMsg ?? '',
    ...(nextTask.kind === 'image' ? { activeTaskId: sourceTaskState?.activeTaskId ?? nextTask.id } : {}),
  })
  if (nextTask.kind === 'video') {
    syncVideoNodeWithTask(nextTask, 'queued')
  } else {
    syncPreviewNodeWithTask(nextTask, 'queued')
  }

  return taskId
}

function getTaskRuntime(taskId: string) {
  const task = useTaskQueueStore.getState().tasks.find((item) => item.id === taskId)
  if (!task) {
    throw new Error('Task not found')
  }

  const canvasStore = useCanvasStore.getState()
  const sourceNode = canvasStore.nodes.find((node) => node.id === task.sourceNodeId)
  if (!sourceNode || (task.kind === 'video' ? sourceNode.type !== 'videoGenerateNode' : (sourceNode.type !== 'generateNode' && sourceNode.type !== 'imageEditNode'))) {
    throw new Error(task.kind === 'video' ? UI_TEXT.missingVideoSourceNode : UI_TEXT.missingSourceNode)
  }

  if (!task.previewNodeId) {
    throw new Error(task.kind === 'video' ? UI_TEXT.missingVideoNode : UI_TEXT.missingPreviewNode)
  }

  const resultNode = canvasStore.nodes.find((node) => (
    node.id === task.previewNodeId && (task.kind === 'video' ? node.type === 'videoNode' : node.type === 'generatedPreviewNode')
  ))
  if (!resultNode) {
    throw new Error(task.kind === 'video' ? UI_TEXT.missingVideoNode : UI_TEXT.missingPreviewNode)
  }

  return { task, sourceNode, resultNode }
}

function getTaskModelConfig(task: GenerateTask) {
  const settings = useSettingsStore.getState()
  const resolution = resolveRuntimeModelConfig(settings.config, {
    modelId: task.model,
    kind: task.kind,
    profileId: task.apiProfileId,
    requireCredentials: true,
  })

  if (!resolution.ok) {
    throw new Error(resolution.diagnostic.message)
  }

  return resolution.runtimeConfig
}

function buildTaskRequestParams(task: GenerateTask) {
  const modelConfig = getTaskModelConfig(task)
  const provider = modelConfig.provider ?? 'aliyun'
  const apiUrl = modelConfig.apiUrl

  if (task.kind === 'video') {
    return {
      modelConfig,
      provider,
      requestParams: {
        prompt: task.prompt,
        ratio: task.ratio,
        resolution: task.resolution,
        duration: task.videoDuration ?? '5s',
        apiKey: modelConfig.apiKey,
        apiUrl,
        model: task.model,
      } as GenerateVideoParams,
    }
  }

  return {
    modelConfig,
    provider,
    requestParams: {
      prompt: task.prompt,
      negativePrompt: task.negativePrompt,
      ratio: task.ratio,
      resolution: task.resolution,
      inputFidelity: task.inputFidelity ?? null,
      quality: task.quality ?? null,
      officialFallback: Boolean(task.officialFallback),
      googleSearch: Boolean(task.googleSearch),
      googleImageSearch: Boolean(task.googleImageSearch),
      editImageUrl: task.operationType === 'image-edit' ? resolveTaskSourceImageUrl(task.sourceImageNodeId) : null,
      maskImageUrl: task.operationType === 'image-edit' ? task.maskImageUrl ?? null : null,
      referenceImageUrl: task.referenceImageUrls[0] ?? null,
      referenceImageUrls: task.referenceImageUrls,
      apiKey: modelConfig.apiKey,
      apiUrl,
      model: task.model,
      provider,
      requestMode: modelConfig.requestMode,
      asyncConfig: modelConfig.asyncConfig ?? null,
      operationType: task.operationType,
    } as const,
  }
}

async function finalizeSuccessfulTask(task: GenerateTask, imageUrl: string, runtimeVersion: number) {
  const { asset, resolvedUrl } = await persistGeneratedImageAsset(task, imageUrl).catch((error) => {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`${UI_TEXT.assetPersistFailed}：${reason}`)
  })

  let imageWidth = 0
  let imageHeight = 0

  try {
    const dimensions = await loadImageDimensions(resolvedUrl)
    imageWidth = dimensions.width
    imageHeight = dimensions.height
  } catch {
    imageWidth = 0
    imageHeight = 0
  }

  const previewSize = imageWidth > 0 && imageHeight > 0
    ? getPreviewNodeSize(imageWidth, imageHeight)
    : { width: 300, height: 260 }

  if (!isTaskQueueRuntimeCurrent(runtimeVersion)) {
    return
  }

  const { updateNodeData } = useCanvasStore.getState()
  if (task.previewNodeId) {
    updateNodeData(task.previewNodeId, {
      imageUrl: resolvedUrl,
      imageAsset: asset,
      apiProfileName: task.apiProfileName ?? null,
      status: 'done',
      errorMsg: '',
      imageWidth,
      imageHeight,
      width: previewSize.width,
      height: previewSize.height,
      sourceImageNodeId: resolvePreviewSourceImageNodeId(task.sourceImageNodeId),
      originOperation: task.operationType === 'image-edit' ? 'image-edit' : 'generate',
      taskId: task.id,
    })
  }

  useTaskQueueStore.getState().markTaskDone(task.id, {
    resultImageAsset: asset,
  })
  syncSourceNodeAfterTaskSettles(task, {
    status: 'done',
    imageUrl: resolvedUrl,
    imageAsset: asset,
  })
}

async function finalizeSuccessfulVideoTask(task: GenerateTask, videoUrl: string, runtimeVersion: number) {
  const { asset, resolvedUrl } = await persistGeneratedVideoAsset(task, videoUrl).catch((error) => {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`生成视频已返回，但写入本地资产失败：${reason}`)
  })

  let metadata = { duration: 0, width: 0, height: 0 }

  try {
    metadata = await loadVideoMetadata(resolvedUrl)
  } catch {
    metadata = { duration: 0, width: 0, height: 0 }
  }

  const videoSize = getVideoNodeSize(metadata.width, metadata.height)

  if (!isTaskQueueRuntimeCurrent(runtimeVersion)) {
    return
  }

  const { updateNodeData } = useCanvasStore.getState()

  if (task.previewNodeId) {
    updateNodeData(task.previewNodeId, {
      videoUrl: resolvedUrl,
      videoAsset: asset,
      name: `${task.model} 生成结果`,
      duration: metadata.duration,
      videoWidth: metadata.width,
      videoHeight: metadata.height,
      status: 'done',
      errorMsg: '',
      width: videoSize.width,
      height: videoSize.height,
    })
  }

  useTaskQueueStore.getState().markTaskDone(task.id, {
    resultVideoAsset: asset,
  })
  syncSourceNodeAfterTaskSettles(task, {
    status: 'done',
  })
}

function isTaskQueueRuntimeCurrent(runtimeVersion: number) {
  return useTaskQueueStore.getState().runtimeVersion === runtimeVersion
}

function markTaskRestoreError(task: GenerateTask, errorMessage: string) {
  const latestTask = useTaskQueueStore.getState().tasks.find((item) => item.id === task.id) ?? task
  const fullMessage = `${UI_TEXT.restoreFailurePrefix}${errorMessage}`
  reportDiagnostic({
    area: 'resource',
    title: '生成任务恢复失败',
    error: errorMessage,
    code: 'TASK_RESTORE_FAILED',
    context: { taskId: task.id, model: task.model, provider: task.provider ?? null },
  })

  if (latestTask.previewNodeId) {
    const resultNode = useCanvasStore.getState().nodes.find(
      (node) => node.id === latestTask.previewNodeId && (latestTask.kind === 'video' ? node.type === 'videoNode' : node.type === 'generatedPreviewNode'),
    )

    if (resultNode) {
      useCanvasStore.getState().updateNodeData(latestTask.previewNodeId, {
        status: 'error',
        errorMsg: fullMessage,
        ...(latestTask.kind === 'image' ? { taskId: latestTask.id } : {}),
      })
    }
  }

  useTaskQueueStore.getState().markTaskError(latestTask.id, fullMessage)

  const sourceNode = useCanvasStore.getState().nodes.find(
    (node) => node.id === latestTask.sourceNodeId && (latestTask.kind === 'video' ? node.type === 'videoGenerateNode' : (node.type === 'generateNode' || node.type === 'imageEditNode')),
  )

  if (sourceNode) {
    syncSourceNodeAfterTaskSettles(latestTask, {
      status: 'error',
      errorMsg: fullMessage,
    })
  }
}

async function resumeRemoteGenerateTask(taskId: string) {
  const taskState = useTaskQueueStore.getState()
  const runtimeVersion = taskState.runtimeVersion
  const runtimeTaskId = `${runtimeVersion}:${taskId}`

  if (activeRemoteResumeTaskIds.has(runtimeTaskId)) {
    return
  }

  const task = taskState.tasks.find((item) => item.id === taskId)

  if (!task || task.status !== 'running' || !task.remoteTaskId) {
    return
  }

  activeRemoteResumeTaskIds.add(runtimeTaskId)

  try {
    const { task: runningTask } = getTaskRuntime(taskId)
    const { provider, requestParams } = buildTaskRequestParams(runningTask)

    if (!runningTask.remoteTaskId) {
      throw new Error(runningTask.kind === 'video' ? UI_TEXT.missingVideoNode : UI_TEXT.missingPreviewNode)
    }

    syncSourceNodeWithTask(runningTask, 'generating')
    useTaskQueueStore.getState().setRemoteTaskStatus(runningTask.id, 'IN_PROGRESS')

    if (runningTask.kind === 'video') {
      if (provider !== 'aliyun') {
        throw new Error('\u5f53\u524d\u89c6\u9891\u4efb\u52a1\u4ec5\u652f\u6301\u963f\u91cc\u767e\u70bc\u8fdc\u7a0b\u8f6e\u8be2\u6062\u590d')
      }

      syncVideoNodeWithTask(runningTask, 'generating')
      const videoUrl = await waitForAliyunVideoGeneration(
        requestParams as GenerateVideoParams,
        runningTask.remoteTaskId,
        (remoteStatus) => {
          if (isTaskQueueRuntimeCurrent(runtimeVersion)) {
            useTaskQueueStore.getState().setRemoteTaskStatus(runningTask.id, remoteStatus)
          }
        },
      )

      if (!isTaskQueueRuntimeCurrent(runtimeVersion)) {
        return
      }

      await finalizeSuccessfulVideoTask(runningTask, videoUrl, runtimeVersion)
      return
    }

    if (provider !== 'openai') {
      throw new Error('\u5f53\u524d\u4efb\u52a1\u4e0d\u652f\u6301\u8fdc\u7a0b\u8f6e\u8be2\u6062\u590d')
    }

    syncPreviewNodeWithTask(runningTask, 'generating')
    const imageUrl = await waitForAsyncImageGeneration(
      requestParams,
      runningTask.remoteTaskId,
      (remoteStatus) => {
        if (isTaskQueueRuntimeCurrent(runtimeVersion)) {
          useTaskQueueStore.getState().setRemoteTaskStatus(runningTask.id, remoteStatus)
        }
      },
    )

    if (!isTaskQueueRuntimeCurrent(runtimeVersion)) {
      return
    }

    await finalizeSuccessfulTask(runningTask, imageUrl, runtimeVersion)
  } catch (error) {
    if (!isTaskQueueRuntimeCurrent(runtimeVersion)) {
      return
    }

    const errorMessage = error instanceof Error ? error.message : String(error)
    reportDiagnostic({
      area: 'resource',
      title: '远程任务恢复失败',
      error,
      code: 'REMOTE_TASK_RESUME_FAILED',
      context: { taskId, model: task.model, provider: task.provider ?? null },
    })
    const latestTask = useTaskQueueStore.getState().tasks.find((item) => item.id === taskId)

    if (latestTask?.previewNodeId) {
      const resultNode = useCanvasStore.getState().nodes.find(
        (node) => node.id === latestTask.previewNodeId && (latestTask.kind === 'video' ? node.type === 'videoNode' : node.type === 'generatedPreviewNode'),
      )

      if (resultNode) {
        useCanvasStore.getState().updateNodeData(latestTask.previewNodeId, {
          status: 'error',
          errorMsg: errorMessage,
          ...(latestTask.kind === 'image' ? { taskId } : {}),
        })
      }
    }

    useTaskQueueStore.getState().markTaskError(taskId, errorMessage)
    if (latestTask) {
      syncSourceNodeAfterTaskSettles(latestTask, {
        status: 'error',
        errorMsg: errorMessage,
      })
    }
  } finally {
    activeRemoteResumeTaskIds.delete(runtimeTaskId)
  }
}

export async function restoreTaskQueueAfterSnapshotLoad() {
  const taskStore = useTaskQueueStore.getState()
  const tasks = [...taskStore.tasks]
  const canvasNodes = useCanvasStore.getState().nodes
  const nodeIds = new Set(canvasNodes.map((node) => node.id))

  for (const task of tasks) {
    if (!nodeIds.has(task.sourceNodeId)) {
      taskStore.removeTask(task.id)
      continue
    }

    if (task.previewNodeId && !nodeIds.has(task.previewNodeId)) {
      taskStore.removeTask(task.id)
      continue
    }

    if (task.status === 'done' || task.status === 'error') {
      continue
    }

    if (task.status === 'queued') {
      syncSourceNodeWithTask(task, 'queued')
      if (task.kind === 'video') {
        syncVideoNodeWithTask(task, 'queued')
      } else {
        syncPreviewNodeWithTask(task, 'queued')
      }
      continue
    }

    if (task.remoteTaskId) {
      try {
        const { provider } = buildTaskRequestParams(task)

        if (provider === 'openai' || (task.kind === 'video' && provider === 'aliyun')) {
          syncSourceNodeWithTask(task, 'generating')
          if (task.kind === 'video') {
            syncVideoNodeWithTask(task, 'generating')
          } else {
            syncPreviewNodeWithTask(task, 'generating')
          }
          void resumeRemoteGenerateTask(task.id)
          continue
        }
      } catch (error) {
        markTaskRestoreError(task, error instanceof Error ? error.message : String(error))
        continue
      }
    }

    taskStore.markTaskQueued(task.id, {
      kind: task.kind,
      sourceNodeId: task.sourceNodeId,
      previewNodeId: task.previewNodeId,
      model: task.model,
      prompt: task.prompt,
      negativePrompt: task.negativePrompt,
      ratio: task.ratio,
      resolution: task.resolution,
      operationType: task.operationType,
      sourceImageNodeId: task.sourceImageNodeId,
      maskImageUrl: task.maskImageUrl ?? null,
      referenceImageUrls: task.referenceImageUrls,
      inputFidelity: task.inputFidelity ?? null,
      quality: task.quality ?? null,
      officialFallback: Boolean(task.officialFallback),
      googleSearch: Boolean(task.googleSearch),
      googleImageSearch: Boolean(task.googleImageSearch),
      videoMode: task.videoMode ?? null,
      videoDuration: task.videoDuration ?? null,
    })

    const queuedTask = useTaskQueueStore.getState().tasks.find((item) => item.id === task.id)
    if (queuedTask) {
      syncSourceNodeWithTask(queuedTask, 'queued')
      if (queuedTask.kind === 'video') {
        syncVideoNodeWithTask(queuedTask, 'queued')
      } else {
        syncPreviewNodeWithTask(queuedTask, 'queued')
      }
    }
  }
}

export async function runGenerateTask(taskId: string) {
  const taskStore = useTaskQueueStore.getState()
  const runtimeVersion = taskStore.runtimeVersion
  const queuedTask = taskStore.tasks.find((item) => item.id === taskId)

  if (!queuedTask || queuedTask.status !== 'queued') {
    return
  }

  try {
    const { task } = getTaskRuntime(taskId)
    taskStore.markTaskRunning(task.id, task.previewNodeId)
    const runningTask = useTaskQueueStore.getState().tasks.find((item) => item.id === taskId)

    if (!runningTask) {
      return
    }

    syncSourceNodeWithTask(runningTask, 'generating')

    if (runningTask.kind === 'video') {
      syncVideoNodeWithTask(runningTask, 'generating')
      const { provider, requestParams } = buildTaskRequestParams(runningTask)

      if (provider !== 'aliyun') {
        throw new Error('当前视频生成仅支持阿里百炼 provider')
      }

      const videoRequestParams = requestParams as GenerateVideoParams
      const submission = await submitAliyunTextToVideoGeneration(videoRequestParams)
      if (!isTaskQueueRuntimeCurrent(runtimeVersion)) {
        return
      }

      taskStore.attachRemoteTask(runningTask.id, submission.taskId)
      const videoUrl = await waitForAliyunVideoGeneration(videoRequestParams, submission.taskId, (remoteStatus) => {
        if (isTaskQueueRuntimeCurrent(runtimeVersion)) {
          useTaskQueueStore.getState().setRemoteTaskStatus(runningTask.id, remoteStatus)
        }
      })

      if (!isTaskQueueRuntimeCurrent(runtimeVersion)) {
        return
      }

      await finalizeSuccessfulVideoTask(runningTask, videoUrl, runtimeVersion)
      return
    }

    syncPreviewNodeWithTask(runningTask, 'generating')
    const { modelConfig, requestParams } = buildTaskRequestParams(runningTask)
    const shouldUseAsync = modelConfig.provider === 'openai'
      && (modelConfig.requestMode === 'async' || modelConfig.asyncConfig?.enabled === true)
    const imageUrl = shouldUseAsync
      ? await (async () => {
          const submission = await submitAsyncImageGeneration(requestParams)
          if (!isTaskQueueRuntimeCurrent(runtimeVersion)) {
            return null
          }

          taskStore.attachRemoteTask(runningTask.id, submission.taskId)

          return waitForAsyncImageGeneration(requestParams, submission.taskId, (remoteStatus) => {
            if (isTaskQueueRuntimeCurrent(runtimeVersion)) {
              useTaskQueueStore.getState().setRemoteTaskStatus(runningTask.id, remoteStatus)
            }
          })
        })()
      : await generateImage(requestParams)

    if (!isTaskQueueRuntimeCurrent(runtimeVersion) || !imageUrl) {
      return
    }

    await finalizeSuccessfulTask(runningTask, imageUrl, runtimeVersion)
  } catch (error) {
    if (!isTaskQueueRuntimeCurrent(runtimeVersion)) {
      return
    }

    const errorMessage = error instanceof Error ? error.message : String(error)
    const latestTask = useTaskQueueStore.getState().tasks.find((item) => item.id === taskId)
    reportDiagnostic({
      area: 'model',
      title: latestTask?.kind === 'video' ? '视频生成失败' : '图片生成失败',
      error,
      code: latestTask?.kind === 'video' ? 'VIDEO_GENERATION_FAILED' : 'IMAGE_GENERATION_FAILED',
      context: {
        taskId,
        model: latestTask?.model,
        provider: latestTask?.provider ?? null,
      },
    })

    if (latestTask?.previewNodeId) {
      useCanvasStore.getState().updateNodeData(latestTask.previewNodeId, {
        status: 'error',
        errorMsg: errorMessage,
        ...(latestTask.kind === 'image' ? { taskId } : {}),
      })
    }

    useTaskQueueStore.getState().markTaskError(taskId, errorMessage)
    if (latestTask) {
      syncSourceNodeAfterTaskSettles(latestTask, {
        status: 'error',
        errorMsg: errorMessage,
      })
    }
  }
}
