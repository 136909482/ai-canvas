export interface GenerateVideoParams {
  prompt: string
  ratio: '16:9' | '9:16' | string
  resolution: string
  duration: string
  apiKey: string
  apiUrl: string
  model: string
}

type AsyncVideoTaskStatus = 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE'

interface AsyncVideoTaskSubmission {
  taskId: string
}

interface AsyncVideoTaskQueryPendingResult {
  status: 'IN_PROGRESS'
}

interface AsyncVideoTaskQuerySuccessResult {
  status: 'SUCCESS'
  videoUrl: string
}

interface AsyncVideoTaskQueryFailureResult {
  status: 'FAILURE'
  errorMsg: string
}

type AsyncVideoTaskQueryResult =
  | AsyncVideoTaskQueryPendingResult
  | AsyncVideoTaskQuerySuccessResult
  | AsyncVideoTaskQueryFailureResult

const ASYNC_VIDEO_TASK_STATUS_ALIASES: Record<string, AsyncVideoTaskStatus> = {
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

const ALIYUN_VIDEO_SYNTHESIS_PATH = '/api/v1/services/aigc/video-generation/video-synthesis'
const ALIYUN_TASKS_PATH = '/api/v1/tasks'
const ASYNC_VIDEO_POLL_INTERVAL_MS = 5000
const ASYNC_VIDEO_POLL_TIMEOUT_MS = 30 * 60 * 1000

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms)
  })
}

async function parseJsonResponse(response: Response) {
  const rawText = await response.text()

  if (!rawText.trim()) {
    return { payload: {}, rawText }
  }

  try {
    return {
      payload: JSON.parse(rawText) as Record<string, unknown>,
      rawText,
    }
  } catch {
    throw new Error(`API returned non-JSON response: ${rawText}`)
  }
}

function getErrorMessage(payload: Record<string, unknown>, fallback: string) {
  const output = payload.output && typeof payload.output === 'object'
    ? payload.output as Record<string, unknown>
    : null
  const message = typeof payload.message === 'string'
    ? payload.message
    : typeof payload.error === 'string'
      ? payload.error
      : typeof output?.message === 'string'
        ? output.message
        : typeof output?.error === 'string'
          ? output.error
          : ''
  const code = typeof payload.code === 'string'
    ? payload.code
    : typeof output?.code === 'string'
      ? output.code
      : ''

  return [code, message].filter(Boolean).join(': ') || fallback
}

function normalizeApiUrl(apiUrl: string) {
  return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl
}

function toSafeUrl(apiUrl: string) {
  try {
    return new URL(apiUrl)
  } catch {
    return new URL(`https://${apiUrl}`)
  }
}

function isLocalDevHost() {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function getAliyunRequestBase(apiUrl: string) {
  const normalized = normalizeApiUrl(apiUrl.trim() || 'https://dashscope.aliyuncs.com')
  const parsed = toSafeUrl(normalized)
  const rootBase = `${parsed.protocol}//${parsed.host}`

  if (!isLocalDevHost()) {
    return rootBase
  }

  switch (parsed.host) {
    case 'dashscope.aliyuncs.com':
      return '/api-proxy/aliyun'
    case 'dashscope-intl.aliyuncs.com':
      return '/api-proxy/aliyun-intl'
    case 'dashscope-us.aliyuncs.com':
      return '/api-proxy/aliyun-us'
    default:
      return rootBase
  }
}

function resolveDashScopeBaseUrl(apiUrl: string) {
  const fallback = 'https://dashscope.aliyuncs.com'
  const trimmedApiUrl = apiUrl.trim() || fallback

  try {
    const url = new URL(trimmedApiUrl)
    const normalizedPath = url.pathname.replace(/\/+$/, '')

    if (
      normalizedPath.includes('/compatible-mode')
      || normalizedPath.includes('/services/aigc/')
      || normalizedPath === '/api/v1'
      || normalizedPath.startsWith('/api/v1/tasks')
    ) {
      return url.origin
    }

    return `${url.origin}${normalizedPath}`.replace(/\/+$/, '')
  } catch {
    return fallback
  }
}

function buildVideoSynthesisUrl(apiUrl: string) {
  const trimmedApiUrl = apiUrl.trim()

  if (trimmedApiUrl.includes(ALIYUN_VIDEO_SYNTHESIS_PATH)) {
    return trimmedApiUrl.replace(resolveDashScopeBaseUrl(trimmedApiUrl), getAliyunRequestBase(trimmedApiUrl))
  }

  return `${getAliyunRequestBase(apiUrl)}${ALIYUN_VIDEO_SYNTHESIS_PATH}`
}

function buildTaskQueryUrl(apiUrl: string, taskId: string) {
  return `${getAliyunRequestBase(apiUrl)}${ALIYUN_TASKS_PATH}/${encodeURIComponent(taskId)}`
}

function normalizeResolution(model: string, resolution: string) {
  const normalized = resolution.trim().toUpperCase()
  const effectiveResolution = normalized === '1080P'
    ? '1080P'
    : normalized === '480P'
      ? '480P'
      : '720P'

  if (model.toLowerCase().includes('wan2.7') && effectiveResolution === '480P') {
    throw new Error('wan2.7-t2v 暂不支持 480p，请改为 720p 或 1080p。')
  }

  return effectiveResolution
}

function normalizeDuration(duration: string) {
  const matched = duration.match(/\d+/)
  const seconds = matched ? Number(matched[0]) : 5

  return seconds === 10 ? 10 : 5
}

function normalizeTaskStatus(value: unknown) {
  if (typeof value !== 'string') {
    return 'IN_PROGRESS' as const
  }

  return ASYNC_VIDEO_TASK_STATUS_ALIASES[value.toUpperCase()] ?? 'IN_PROGRESS'
}

function getTaskId(payload: Record<string, unknown>) {
  const output = payload.output && typeof payload.output === 'object'
    ? payload.output as Record<string, unknown>
    : null
  const taskId = typeof output?.task_id === 'string'
    ? output.task_id
    : typeof payload.task_id === 'string'
      ? payload.task_id
      : ''

  if (!taskId) {
    throw new Error('API response did not include task_id')
  }

  return taskId
}

function getVideoUrl(payload: Record<string, unknown>) {
  const output = payload.output && typeof payload.output === 'object'
    ? payload.output as Record<string, unknown>
    : null
  const videoUrl = typeof output?.video_url === 'string'
    ? output.video_url
    : typeof payload.video_url === 'string'
      ? payload.video_url
      : ''

  if (!videoUrl) {
    throw new Error('API response did not include video_url')
  }

  return videoUrl
}

export async function submitAliyunTextToVideoGeneration(params: GenerateVideoParams): Promise<AsyncVideoTaskSubmission> {
  let response: Response

  try {
    response = await fetch(buildVideoSynthesisUrl(params.apiUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: params.model,
        input: {
          prompt: params.prompt,
        },
        parameters: {
          resolution: normalizeResolution(params.model, params.resolution),
          ratio: params.ratio === '9:16' ? '9:16' : '16:9',
          duration: normalizeDuration(params.duration),
          prompt_extend: true,
          watermark: false,
        },
      }),
    })
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('无法连接阿里百炼视频接口。请确认正在使用本地 Vite 开发服务、Base URL 是 dashscope.aliyuncs.com，并检查网络/API Key。')
    }
    throw error
  }

  const { payload, rawText } = await parseJsonResponse(response)

  if (!response.ok) {
    throw new Error(`API Error ${response.status}: ${getErrorMessage(payload, rawText)}`)
  }

  return {
    taskId: getTaskId(payload),
  }
}

async function queryAliyunVideoGeneration(params: GenerateVideoParams, taskId: string): Promise<AsyncVideoTaskQueryResult> {
  let response: Response

  try {
    response = await fetch(buildTaskQueryUrl(params.apiUrl, taskId), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
    })
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('无法轮询阿里百炼视频任务。请确认本地 Vite 代理仍在运行，并检查网络连接。')
    }
    throw error
  }
  const { payload, rawText } = await parseJsonResponse(response)

  if (!response.ok) {
    throw new Error(`API Error ${response.status}: ${getErrorMessage(payload, rawText)}`)
  }

  const output = payload.output && typeof payload.output === 'object'
    ? payload.output as Record<string, unknown>
    : null
  const status = normalizeTaskStatus(output?.task_status ?? payload.task_status)

  if (status === 'SUCCESS') {
    return {
      status,
      videoUrl: getVideoUrl(payload),
    }
  }

  if (status === 'FAILURE') {
    return {
      status,
      errorMsg: getErrorMessage(payload, '视频生成失败'),
    }
  }

  return { status }
}

export async function waitForAliyunVideoGeneration(
  params: GenerateVideoParams,
  taskId: string,
  onStatusChange?: (status: AsyncVideoTaskStatus) => void,
): Promise<string> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < ASYNC_VIDEO_POLL_TIMEOUT_MS) {
    const result = await queryAliyunVideoGeneration(params, taskId)
    onStatusChange?.(result.status)

    if (result.status === 'SUCCESS') {
      return result.videoUrl
    }

    if (result.status === 'FAILURE') {
      throw new Error(result.errorMsg)
    }

    await sleep(ASYNC_VIDEO_POLL_INTERVAL_MS)
  }

  throw new Error('视频生成任务超时')
}
