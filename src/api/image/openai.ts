import type { ImageOperationType } from '@/types'
import { submitCustomAsyncImageGeneration, waitForCustomAsyncImageGeneration } from './customAsync.ts'
import {
  buildApiError,
  convertReferenceImageToFile,
  getFirstStringValue,
  getImageResultFromResponsePayload,
  getImageResultFromUnknown,
  getNestedValue,
  getNetworkErrorMessage,
  isLocalDevHost,
  normalizeApiUrl,
  normalizeReferenceImages,
  parseJsonLikeResponse,
  resolveEffectiveRatio,
  resolveImageOperationType,
  sleep,
} from './shared.ts'
import type { AsyncImageTaskQueryResult, AsyncImageTaskStatus, AsyncImageTaskSubmission, GenerateImageParams } from './types.ts'

const ASYNC_IMAGE_TASK_STATUS_ALIASES: Record<string, AsyncImageTaskStatus> = {
  IN_PROGRESS: 'IN_PROGRESS',
  PROCESSING: 'IN_PROGRESS',
  PENDING: 'IN_PROGRESS',
  PENDING_QUEUE: 'IN_PROGRESS',
  QUEUED: 'IN_PROGRESS',
  RUNNING: 'IN_PROGRESS',
  SUBMITTED: 'IN_PROGRESS',
  WAITING: 'IN_PROGRESS',
  SUCCESS: 'SUCCESS',
  SUCCEEDED: 'SUCCESS',
  COMPLETED: 'SUCCESS',
  DONE: 'SUCCESS',
  FINISHED: 'SUCCESS',
  FAILURE: 'FAILURE',
  FAILED: 'FAILURE',
  ERROR: 'FAILURE',
  CANCELLED: 'FAILURE',
  CANCELED: 'FAILURE',
}

const NUMBERED_REFERENCE_PROMPT_PATTERN =
  /(?:first image|second image|third image|fourth image|fifth image|image\s*[1-9]|reference image\s*[1-9])/i
const ENABLE_OPENAI_NUMBERED_REFERENCE_HINTS = false

const GPT_IMAGE_2_SUPPORTED_SIZES = [
  'auto',
  '1:1',
  '3:2',
  '2:3',
  '4:3',
  '3:4',
  '5:4',
  '4:5',
  '16:9',
  '9:16',
  '2:1',
  '1:2',
  '3:1',
  '1:3',
  '21:9',
  '9:21',
] as const

type GptImage2Size = (typeof GPT_IMAGE_2_SUPPORTED_SIZES)[number]

const OPENAI_ENDPOINT_PATHS = [
  '/v1/images/generations',
  '/v1/images/edits',
  '/v1/models',
  '/v1/images/tasks',
  '/v1/tasks',
] as const

const OPENAI_ASYNC_POLL_INTERVAL_MS = 3500
const OPENAI_ASYNC_POLL_TIMEOUT_MS = 30 * 60 * 1000
const GPT_IMAGE_2_INITIAL_POLL_DELAY_MS = 10 * 1000
const GPT_IMAGE_2_MIN_PIXELS = 655_360
const GPT_IMAGE_2_MAX_SIDE = 3_824
const GPT_IMAGE_2_SIZE_MULTIPLE = 16
const GPT_IMAGE_MODEL_ID = 'gpt-image-2'
const UNSUPPORTED_OPENAI_IMAGE_MODEL_MESSAGE = `OpenAI compatible image generation only supports ${GPT_IMAGE_MODEL_ID} or Gemini image model ids.`

type OpenAiCompatibleImageRequestFamily = 'openai' | 'gemini'

function getOrdinalLabel(order: number) {
  switch (order) {
    case 1:
      return 'first'
    case 2:
      return 'second'
    case 3:
      return 'third'
    case 4:
      return 'fourth'
    case 5:
      return 'fifth'
    default:
      return `${order}th`
  }
}

function shouldInjectNumberedReferencePrompt(model: string, prompt: string, referenceImageCount: number) {
  return ENABLE_OPENAI_NUMBERED_REFERENCE_HINTS
    && isGptImageModel(model)
    && referenceImageCount > 1
    && NUMBERED_REFERENCE_PROMPT_PATTERN.test(prompt)
}

function buildOpenAiReferenceAwarePrompt(model: string, prompt: string, referenceImageCount: number) {
  if (!shouldInjectNumberedReferencePrompt(model, prompt, referenceImageCount)) {
    return prompt
  }

  const numberedMappings = Array.from(
    { length: referenceImageCount },
    (_, index) => `The ${getOrdinalLabel(index + 1)} uploaded image is image ${index + 1}.`,
  )

  return [
    'You will receive multiple reference images. Interpret them strictly by upload order.',
    ...numberedMappings,
    'If the user mentions a numbered reference image, follow that mapping exactly.',
    `User request: ${prompt}`,
  ].join('\n')
}

export function isGptImageModel(model: string) {
  return model.trim().toLowerCase() === GPT_IMAGE_MODEL_ID
}

function isGeminiImageModel(model: string) {
  const normalized = model.trim().toLowerCase()
  return normalized.includes('gemini') || normalized.includes('nano-banana') || normalized.includes('nanobanana')
}

function getOpenAiCompatibleImageRequestFamily(model: string): OpenAiCompatibleImageRequestFamily | null {
  if (isGptImageModel(model)) {
    return 'openai'
  }

  if (isGeminiImageModel(model)) {
    return 'gemini'
  }

  return null
}

function normalizeGptImage2Resolution(resolution?: string) {
  const normalized = resolution?.trim().toLowerCase()

  switch (normalized) {
    case '2k':
    case '4k':
    case '1k':
      return normalized
    case 'auto':
    default:
      return '1k'
  }
}

function normalizeGptImage2Quality(quality?: string | null) {
  switch (quality) {
    case 'low':
    case 'medium':
    case 'high':
    case 'auto':
      return quality
    default:
      return 'auto'
  }
}

function normalizeGeminiImageResolution(resolution?: string) {
  const normalized = resolution?.trim().toLowerCase()

  switch (normalized) {
    case '0.5k':
      return '0.5K'
    case '2k':
      return '2K'
    case '4k':
      return '4K'
    case '1k':
    default:
      return '1K'
  }
}

function getGptImage2BaseLongEdge(resolution?: string) {
  switch (normalizeGptImage2Resolution(resolution)) {
    case '4k':
      return GPT_IMAGE_2_MAX_SIDE
    case '2k':
      return 2048
    case '1k':
    default:
      return 1024
  }
}

function roundToImageSizeMultiple(value: number) {
  return Math.max(GPT_IMAGE_2_SIZE_MULTIPLE, Math.round(value / GPT_IMAGE_2_SIZE_MULTIPLE) * GPT_IMAGE_2_SIZE_MULTIPLE)
}

function ceilToImageSizeMultiple(value: number) {
  return Math.max(GPT_IMAGE_2_SIZE_MULTIPLE, Math.ceil(value / GPT_IMAGE_2_SIZE_MULTIPLE) * GPT_IMAGE_2_SIZE_MULTIPLE)
}

function parseRatioValue(ratio?: string) {
  const normalized = ratio?.trim().toLowerCase()
  const matched = normalized?.match(/^(\d{1,4})\s*:\s*(\d{1,4})$/)

  if (!matched) {
    return null
  }

  const width = Number(matched[1])
  const height = Number(matched[2])

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }

  return width / height
}

function getGreatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left)
  let b = Math.abs(right)

  while (b > 0) {
    const next = a % b
    a = b
    b = next
  }

  return a || 1
}

function normalizeSizePair(width: number, height: number) {
  const divisor = getGreatestCommonDivisor(width, height)
  return `${width / divisor}:${height / divisor}`
}

function ratioToGptImage2PixelSize(ratio: string, resolution?: string) {
  const ratioValue = parseRatioValue(ratio)

  if (!ratioValue) {
    return null
  }

  const longEdge = getGptImage2BaseLongEdge(resolution)
  let width = ratioValue >= 1 ? longEdge : longEdge * ratioValue
  let height = ratioValue >= 1 ? longEdge / ratioValue : longEdge

  width = roundToImageSizeMultiple(width)
  height = roundToImageSizeMultiple(height)

  const currentPixels = width * height
  if (currentPixels < GPT_IMAGE_2_MIN_PIXELS) {
    if (ratioValue >= 1) {
      width = ceilToImageSizeMultiple(Math.sqrt(GPT_IMAGE_2_MIN_PIXELS * ratioValue))
      height = ceilToImageSizeMultiple(width / ratioValue)
    } else {
      height = ceilToImageSizeMultiple(Math.sqrt(GPT_IMAGE_2_MIN_PIXELS / ratioValue))
      width = ceilToImageSizeMultiple(height * ratioValue)
    }
  }

  width = Math.min(width, GPT_IMAGE_2_MAX_SIDE)
  height = Math.min(height, GPT_IMAGE_2_MAX_SIDE)

  return `${width}x${height}`
}

function getGptImage2Size(ratio?: string, resolution?: string) {
  const normalized = ratio?.trim().toLowerCase()

  if (!normalized || normalized === 'auto') {
    return '1024x1024'
  }

  if (/^\d+x\d+$/i.test(normalized)) {
    return normalized
  }

  return GPT_IMAGE_2_SUPPORTED_SIZES.includes(normalized as GptImage2Size)
    ? normalized
    : ratioToGptImage2PixelSize(normalized, resolution) ?? '1024x1024'
}

function resolveGptImage2RequestSize(params: GenerateImageParams, effectiveRatio: string) {
  if (!params.ratio || params.ratio === 'Auto') {
    return getGptImage2Size(effectiveRatio, params.resolution)
  }

  return getGptImage2Size(params.ratio, params.resolution)
}

function hasGeminiAutoRatioReference(params: GenerateImageParams) {
  if (resolveImageOperationType(params) === 'image-edit') {
    return Boolean(params.editImageUrl || normalizeReferenceImages(params.referenceImageUrl, params.referenceImageUrls).length > 0)
  }

  return normalizeReferenceImages(params.referenceImageUrl, params.referenceImageUrls).length > 0
}

function resolveGeminiImageRequestSize(params: GenerateImageParams, effectiveRatio: string) {
  const ratio = !params.ratio || params.ratio === 'Auto'
    ? hasGeminiAutoRatioReference(params)
      ? effectiveRatio
      : 'auto'
    : params.ratio

  if (!ratio || ratio.trim().toLowerCase() === 'auto') {
    return 'auto'
  }

  const normalizedRatio = ratio.trim().toLowerCase()
  if (/^\d+\s*x\s*\d+$/i.test(normalizedRatio)) {
    const matched = normalizedRatio.match(/^(\d+)\s*x\s*(\d+)$/i)
    if (matched) {
      return normalizeSizePair(Number(matched[1]), Number(matched[2]))
    }
  }

  return normalizedRatio
}

function resolveOpenAiRequestSize(params: GenerateImageParams, effectiveRatio: string) {
  return getOpenAiCompatibleImageRequestFamily(params.model) === 'openai'
    ? resolveGptImage2RequestSize(params, effectiveRatio)
    : resolveGeminiImageRequestSize(params, effectiveRatio)
}

function logOpenAiImageRequest(debugInfo: {
  endpoint: string
  isAsync: boolean
  operationType: ImageOperationType
  model: string
  ratio?: string
  resolution?: string
  effectiveRatio: string
  size?: string
  body: BodyInit
}) {
  if (!import.meta.env?.DEV || typeof window === 'undefined') {
    return
  }

  try {
    if (window.localStorage.getItem('ai-canvas:debug-image-requests') !== '1') {
      return
    }
  } catch {
    return
  }

  const requestFamily = getOpenAiCompatibleImageRequestFamily(debugInfo.model)
  const body = summarizeOpenAiImageRequestBody(debugInfo.body)

  console.debug('[AI Canvas] OpenAI compatible image request', {
    endpoint: debugInfo.endpoint,
    isAsync: debugInfo.isAsync,
    operationType: debugInfo.operationType,
    model: debugInfo.model,
    requestFamily,
    ratio: debugInfo.ratio,
    effectiveRatio: debugInfo.effectiveRatio,
    size: debugInfo.size,
    resolution: debugInfo.resolution,
    body,
  })
}

function summarizeOpenAiImageRequestBody(body: BodyInit): unknown {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as unknown
    } catch {
      return body
    }
  }

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return Array.from(body.entries()).map(([key, value]) => ({
      key,
      value: summarizeOpenAiImageFormDataValue(value),
    }))
  }

  return '[uninspectable body]'
}

function summarizeOpenAiImageFormDataValue(value: FormDataEntryValue) {
  if (typeof value === 'string') {
    return value
  }

  return {
    kind: 'file',
    name: value.name,
    type: value.type,
    size: value.size,
  }
}

function resolveOpenAiEndpoint(apiUrl: string, endpointPath: (typeof OPENAI_ENDPOINT_PATHS)[number]) {
  const normalized = normalizeApiUrl(apiUrl)

  if (normalized.endsWith(endpointPath)) {
    return normalized
  }

  const matchedKnownEndpoint = OPENAI_ENDPOINT_PATHS.find((knownPath) => normalized.endsWith(knownPath))

  if (matchedKnownEndpoint) {
    return `${normalized.slice(0, -matchedKnownEndpoint.length)}${endpointPath}`
  }

  if (normalized.endsWith('/v1')) {
    return `${normalized}${endpointPath.slice(3)}`
  }

  return `${normalized}${endpointPath}`
}

function getOpenAiProxiedRequestUrl(endpoint: string) {
  if (!import.meta.env?.DEV || !isLocalDevHost()) {
    return endpoint
  }

  return `/api-proxy/openai?target=${encodeURIComponent(endpoint)}`
}

function getOpenAiRequestUrl(apiUrl: string, endpointPath: (typeof OPENAI_ENDPOINT_PATHS)[number]) {
  return getOpenAiProxiedRequestUrl(resolveOpenAiEndpoint(apiUrl, endpointPath))
}

function getOpenAiImageEditInputImages(params: GenerateImageParams) {
  const operationType = resolveImageOperationType(params)
  return operationType === 'image-edit'
    ? [
        ...(params.editImageUrl ? [params.editImageUrl] : []),
        ...normalizeReferenceImages(params.referenceImageUrl, params.referenceImageUrls),
      ]
    : normalizeReferenceImages(params.referenceImageUrl, params.referenceImageUrls)
}

function shouldUseOpenAiImageEditRequest(params: GenerateImageParams) {
  return getOpenAiImageEditInputImages(params).length > 0
}

function appendStringFormField(formData: FormData, key: string, value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) {
    return
  }

  formData.append(key, String(value))
}

function buildGeminiImageConfig(imageSize: string, size: string) {
  return {
    image_size: imageSize,
    resolution: imageSize,
    aspect_ratio: size,
  }
}

function addGeminiImagePayloadFields(payload: Record<string, unknown>, params: GenerateImageParams, size: string) {
  const imageSize = normalizeGeminiImageResolution(params.resolution)
  const imageConfig = buildGeminiImageConfig(imageSize, size)

  payload.resolution = imageSize
  payload.image_size = imageSize
  payload.image_config = imageConfig
  payload.aspect_ratio = size
}

function addGeminiImageFormFields(formData: FormData, params: GenerateImageParams, size: string) {
  const imageSize = normalizeGeminiImageResolution(params.resolution)
  const imageConfig = buildGeminiImageConfig(imageSize, size)

  appendStringFormField(formData, 'resolution', imageSize)
  appendStringFormField(formData, 'image_size', imageSize)
  appendStringFormField(formData, 'image_config', JSON.stringify(imageConfig))
  appendStringFormField(formData, 'aspect_ratio', size)
}

function assertSupportedOpenAiImageModel(params: Pick<GenerateImageParams, 'model'>) {
  if (!getOpenAiCompatibleImageRequestFamily(params.model)) {
    throw new Error(UNSUPPORTED_OPENAI_IMAGE_MODEL_MESSAGE)
  }
}

async function buildGptImageGenerationPayload(params: GenerateImageParams, size: string) {
  const requestFamily = getOpenAiCompatibleImageRequestFamily(params.model)
  const payload: Record<string, unknown> = {
    model: params.model,
    prompt: buildOpenAiReferenceAwarePrompt(params.model, params.prompt, 0),
    n: 1,
    size,
  }

  if (requestFamily === 'openai') {
    Object.assign(payload, {
      resolution: normalizeGptImage2Resolution(params.resolution),
      quality: normalizeGptImage2Quality(params.quality),
      moderation: 'low',
      output_format: 'png',
    })
  }

  if (requestFamily === 'gemini') {
    addGeminiImagePayloadFields(payload, params, size)
  }

  return payload
}

async function buildGptImageEditFormData(params: GenerateImageParams, size: string) {
  const requestFamily = getOpenAiCompatibleImageRequestFamily(params.model)
  const operationType = resolveImageOperationType(params)
  const inputImages = getOpenAiImageEditInputImages(params)

  if (operationType === 'image-edit' && !params.editImageUrl) {
    throw new Error('OpenAI image edit requires a source image')
  }

  if (operationType === 'image-edit' && !params.maskImageUrl) {
    throw new Error('OpenAI image edit requires a mask image')
  }

  const imageFiles = await Promise.all(
    inputImages.map((imageUrl, index) => convertReferenceImageToFile(imageUrl, index)),
  )
  const formData = new FormData()
  const imageFieldName = imageFiles.length > 1 ? 'image[]' : 'image'

  appendStringFormField(formData, 'model', params.model)
  appendStringFormField(formData, 'prompt', buildOpenAiReferenceAwarePrompt(params.model, params.prompt, imageFiles.length))
  appendStringFormField(formData, 'n', 1)
  appendStringFormField(formData, 'size', size)

  if (requestFamily === 'openai') {
    appendStringFormField(formData, 'resolution', normalizeGptImage2Resolution(params.resolution))
    appendStringFormField(formData, 'quality', normalizeGptImage2Quality(params.quality))
    appendStringFormField(formData, 'moderation', 'low')
    appendStringFormField(formData, 'output_format', 'png')
  }

  if (requestFamily === 'gemini') {
    addGeminiImageFormFields(formData, params, size)
  }

  for (const imageFile of imageFiles) {
    formData.append(imageFieldName, imageFile)
  }

  if (operationType === 'image-edit' && params.maskImageUrl) {
    formData.append('mask', await convertReferenceImageToFile(params.maskImageUrl, imageFiles.length))
  }

  return formData
}

async function buildGptImageRequestBody(params: GenerateImageParams, size: string) {
  if (shouldUseOpenAiImageEditRequest(params)) {
    return buildGptImageEditFormData(params, size)
  }

  return JSON.stringify(await buildGptImageGenerationPayload(params, size))
}

function resolveOpenAiImageEndpointPath(params: GenerateImageParams, operationType: ImageOperationType) {
  return operationType === 'image-edit' || shouldUseOpenAiImageEditRequest(params)
    ? '/v1/images/edits'
    : '/v1/images/generations'
}

function normalizeAsyncSubmitPath(path: string) {
  return path.trim().replace(/^\//, '').replace(/^v1\//, '')
}

function resolveCustomAsyncConfigForRequest(params: GenerateImageParams) {
  if (!params.asyncConfig?.enabled) {
    return null
  }

  if (
    shouldUseOpenAiImageEditRequest(params)
    && normalizeAsyncSubmitPath(params.asyncConfig.submitPath) === 'images/generations'
  ) {
    return {
      ...params.asyncConfig,
      submitPath: 'images/edits',
    }
  }

  return params.asyncConfig
}

function getAsyncTaskId(payload: unknown) {
  const taskId = getFirstStringValue(
    getNestedValue(payload, ['task_id']),
    getNestedValue(payload, ['data', 'task_id']),
    getNestedValue(payload, ['data', 0, 'task_id']),
    getNestedValue(payload, ['data', 'data', 'task_id']),
  )

  if (!taskId) {
    throw new Error('Async image API did not return a task_id')
  }

  return taskId
}

function getAsyncTaskStatus(payload: unknown, rawText?: string): AsyncImageTaskStatus {
  const status = getFirstStringValue(
    getNestedValue(payload, ['status']),
    getNestedValue(payload, ['data', 'status']),
    getNestedValue(payload, ['data', 0, 'status']),
    getNestedValue(payload, ['data', 'data', 'status']),
  )

  if (status) {
    const normalizedStatus = ASYNC_IMAGE_TASK_STATUS_ALIASES[status.trim().toUpperCase()]

    if (normalizedStatus) {
      return normalizedStatus
    }
  }

  if (getImageResultFromUnknown(payload)) {
    return 'SUCCESS'
  }

  const failReason = getFirstStringValue(
    getNestedValue(payload, ['fail_reason']),
    getNestedValue(payload, ['data', 'fail_reason']),
    getNestedValue(payload, ['data', 'error']),
    getNestedValue(payload, ['data', 'data', 'fail_reason']),
  )

  if (failReason) {
    return 'FAILURE'
  }

  const responseCode = getFirstStringValue(
    getNestedValue(payload, ['code']),
    getNestedValue(payload, ['data', 'code']),
    getNestedValue(payload, ['data', 'data', 'code']),
  )

  if (responseCode && responseCode.trim().toLowerCase() === 'success') {
    return 'IN_PROGRESS'
  }

  const preview = rawText?.trim().slice(0, 240)
  throw new Error(
    preview
      ? `Async image API returned an unknown task status: ${preview}`
      : 'Async image API returned an unknown task status',
  )
}

function getAsyncTaskErrorMessage(payload: unknown) {
  return (
    getFirstStringValue(
      getNestedValue(payload, ['fail_reason']),
      getNestedValue(payload, ['data', 'fail_reason']),
      getNestedValue(payload, ['data', 'error']),
      getNestedValue(payload, ['data', 'data', 'fail_reason']),
      getNestedValue(payload, ['error', 'message']),
      getNestedValue(payload, ['message']),
      getNestedValue(payload, ['msg']),
      getNestedValue(payload, ['data', 'message']),
      getNestedValue(payload, ['data', 'msg']),
      getNestedValue(payload, ['data', 'data', 'message']),
      getNestedValue(payload, ['data', 'data', 'msg']),
    ) ?? 'Async image task failed'
  )
}

export async function generateWithOpenAI(params: GenerateImageParams): Promise<string> {
  assertSupportedOpenAiImageModel(params)

  const operationType = resolveImageOperationType(params)
  const endpointPath = resolveOpenAiImageEndpointPath(params, operationType)
  const generationsEndpoint = getOpenAiRequestUrl(params.apiUrl, endpointPath)
  const effectiveRatio = await resolveEffectiveRatio(params)
  const size = resolveOpenAiRequestSize(params, effectiveRatio)

  if (params.requestMode === 'async') {
    const submission = await submitOpenAiAsyncImageGeneration(params, size)
    return waitForOpenAiAsyncImageGeneration(params, submission.taskId)
  }

  const requestBody = shouldUseOpenAiImageEditRequest(params)
    ? await buildGptImageEditFormData(params, size)
    : await buildGptImageRequestBody(params, size)
  const requestHeaders = new Headers({
    Authorization: `Bearer ${params.apiKey}`,
  })
  if (typeof requestBody === 'string') {
    requestHeaders.set('Content-Type', 'application/json')
  }

  logOpenAiImageRequest({
    endpoint: generationsEndpoint,
    isAsync: false,
    operationType,
    model: params.model,
    ratio: params.ratio,
    resolution: params.resolution,
    effectiveRatio,
    size,
    body: requestBody,
  })

  let response: Response

  try {
    response = await fetch(generationsEndpoint, {
      method: 'POST',
      headers: requestHeaders,
      body: requestBody,
    })
  } catch (error) {
    throw new Error(getNetworkErrorMessage(error, 'OpenAI compatible image generation'))
  }

  if (!response.ok) {
    throw await buildApiError(response, 'OpenAI compatible image generation')
  }

  const { payload, rawText } = await parseJsonLikeResponse(response)
  return getImageResultFromResponsePayload(payload, rawText)
}

export async function submitOpenAiAsyncImageGeneration(
  params: GenerateImageParams,
  resolvedSize?: string,
): Promise<AsyncImageTaskSubmission> {
  assertSupportedOpenAiImageModel(params)

  const operationType = resolveImageOperationType(params)

  const endpointPath = resolveOpenAiImageEndpointPath(params, operationType)
  const endpoint = resolveOpenAiEndpoint(params.apiUrl, endpointPath)
  const effectiveRatio = await resolveEffectiveRatio(params)
  const size = resolvedSize ?? resolveOpenAiRequestSize(params, effectiveRatio)
  const isMultipartEdit = shouldUseOpenAiImageEditRequest(params)
  const requestBody = isMultipartEdit
    ? await buildGptImageEditFormData(params, size)
    : JSON.stringify(await buildGptImageGenerationPayload(params, size))
  const requestHeaders = new Headers({
    Authorization: `Bearer ${params.apiKey}`,
  })
  if (typeof requestBody === 'string') {
    requestHeaders.set('Content-Type', 'application/json')
  }
  const asyncEndpoint = getOpenAiProxiedRequestUrl(
    endpoint,
  )

  logOpenAiImageRequest({
    endpoint: asyncEndpoint,
    isAsync: true,
    operationType,
    model: params.model,
    ratio: params.ratio,
    resolution: params.resolution,
    effectiveRatio,
    size,
    body: requestBody,
  })

  const customAsyncConfig = resolveCustomAsyncConfigForRequest(params)

  if (customAsyncConfig?.enabled) {
    return submitCustomAsyncImageGeneration(
      params,
      requestBody,
      customAsyncConfig,
      typeof requestBody === 'string' ? 'application/json' : undefined,
    )
  }

  let response: Response

  try {
    response = await fetch(asyncEndpoint, {
      method: 'POST',
      headers: requestHeaders,
      body: requestBody,
    })
  } catch (error) {
    throw new Error(getNetworkErrorMessage(error, 'OpenAI compatible async image submission'))
  }

  if (!response.ok) {
    throw await buildApiError(response, 'OpenAI compatible async image submission')
  }

  const { payload } = await parseJsonLikeResponse(response)
  return {
    taskId: getAsyncTaskId(payload),
  }
}

async function queryOpenAiAsyncImageGeneration(
  params: GenerateImageParams,
  taskId: string,
): Promise<AsyncImageTaskQueryResult> {
  const tasksEndpoint = resolveOpenAiEndpoint(params.apiUrl, '/v1/tasks')
  const taskEndpoint = getOpenAiProxiedRequestUrl(`${tasksEndpoint}/${encodeURIComponent(taskId)}`)
  let response: Response

  try {
    response = await fetch(taskEndpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
    })
  } catch (error) {
    throw new Error(getNetworkErrorMessage(error, 'OpenAI compatible async image query'))
  }

  if (!response.ok) {
    throw await buildApiError(response, 'OpenAI compatible async image query')
  }

  const { payload, rawText } = await parseJsonLikeResponse(response)
  const status = getAsyncTaskStatus(payload, rawText)

  if (status === 'SUCCESS') {
    const imageUrl = getImageResultFromResponsePayload(payload, rawText)
    return {
      status,
      imageUrl,
    }
  }

  if (status === 'FAILURE') {
    return {
      status,
      errorMsg: getAsyncTaskErrorMessage(payload),
    }
  }

  return { status }
}

export async function waitForOpenAiAsyncImageGeneration(
  params: GenerateImageParams,
  taskId: string,
  onStatusChange?: (status: AsyncImageTaskStatus) => void,
): Promise<string> {
  assertSupportedOpenAiImageModel(params)

  if (params.asyncConfig?.enabled) {
    return waitForCustomAsyncImageGeneration(params, taskId, params.asyncConfig, onStatusChange)
  }

  const startedAt = Date.now()
  let hasWaitedInitialDelay = false

  while (Date.now() - startedAt < OPENAI_ASYNC_POLL_TIMEOUT_MS) {
    if (!hasWaitedInitialDelay) {
      hasWaitedInitialDelay = true
      await sleep(GPT_IMAGE_2_INITIAL_POLL_DELAY_MS)
    }

    const result = await queryOpenAiAsyncImageGeneration(params, taskId)
    onStatusChange?.(result.status)

    if (result.status === 'SUCCESS') {
      return result.imageUrl
    }

    if (result.status === 'FAILURE') {
      throw new Error(result.errorMsg)
    }

    await sleep(OPENAI_ASYNC_POLL_INTERVAL_MS)
  }

  throw new Error('Async image generation timed out. Remote task may still complete; use the task ID to check it in the upstream provider console.')
}
