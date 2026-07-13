import type { ProviderAsyncConfig } from '@/types'
import { buildApiError, getFirstStringValue, getNetworkErrorMessage, normalizeApiUrl, parseJsonLikeResponse, sleep, toSafeUrl } from './shared.ts'
import type { AsyncImageTaskQueryResult, AsyncImageTaskStatus, GenerateImageParams } from './types.ts'

const CUSTOM_ASYNC_POLL_TIMEOUT_MS = 30 * 60 * 1000

function isHttpUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://')
}

function isDataImageUrl(value: string) {
  return value.startsWith('data:image/')
}

function normalizeBase64Image(value: string) {
  return value.startsWith('data:image/') ? value : `data:image/png;base64,${value}`
}

function normalizePath(path: string) {
  return path
    .trim()
    .replace(/^\//, '')
    .replace(/^v1\//, '')
}

function buildCustomEndpoint(apiUrl: string, path: string) {
  const normalizedApiUrl = normalizeApiUrl(apiUrl.trim())
  const parsed = toSafeUrl(normalizedApiUrl)
  const normalizedPath = normalizePath(path)
  const base = parsed.pathname.endsWith('/v1')
    ? `${parsed.origin}${parsed.pathname}`
    : `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname}/v1`

  return `${base}/${normalizedPath}`
}

function appendQuery(url: string, query: Record<string, string> | undefined) {
  const entries = Object.entries(query ?? {}).filter(([, value]) => value.trim().length > 0)
  if (entries.length === 0) {
    return url
  }

  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')}`
}

function getCustomProxiedRequestUrl(endpoint: string) {
  if (!import.meta.env.DEV || typeof window === 'undefined' || !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return endpoint
  }

  return `/api-proxy/openai?target=${encodeURIComponent(endpoint)}`
}

function splitPath(path: string) {
  return path.split('.').map((part) => part.trim()).filter(Boolean)
}

function getByPath(value: unknown, path: string): unknown {
  return splitPath(path).reduce<unknown>((current, part) => {
    if (Array.isArray(current)) {
      const index = Number(part)
      return Number.isInteger(index) ? current[index] : undefined
    }

    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[part]
    }

    return undefined
  }, value)
}

function getAllByPath(value: unknown, path: string): unknown[] {
  const parts = splitPath(path)

  const visit = (current: unknown, index: number): unknown[] => {
    if (index >= parts.length) {
      return [current]
    }

    const part = parts[index]
    if (part === '*') {
      if (Array.isArray(current)) {
        return current.flatMap((item) => visit(item, index + 1))
      }

      if (current && typeof current === 'object') {
        return Object.values(current).flatMap((item) => visit(item, index + 1))
      }

      return []
    }

    return visit(getByPath(current, part), index + 1)
  }

  return visit(value, 0).filter((item) => item !== undefined && item !== null)
}

function renderTaskPath(path: string, taskId: string) {
  return path
    .replace(/\{task_id\}/g, encodeURIComponent(taskId))
    .replace(/\{taskId\}/g, encodeURIComponent(taskId))
}

function getCustomTaskId(payload: unknown, config: ProviderAsyncConfig) {
  const taskId = [
    getByPath(payload, config.taskIdPath),
    getByPath(payload, 'data'),
    getByPath(payload, 'data.task_id'),
    getByPath(payload, 'task_id'),
    getByPath(payload, 'taskId'),
    getByPath(payload, 'id'),
  ].map((value) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''))
    .find(Boolean)

  if (!taskId) {
    throw new Error(`Async image API did not return a task id at path "${config.taskIdPath}"`)
  }

  return taskId
}

function normalizeStatusValue(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : String(value ?? '').trim().toLowerCase()
}

function getCustomTaskStatus(payload: unknown, config: ProviderAsyncConfig, rawText: string): AsyncImageTaskStatus {
  const status = normalizeStatusValue(getByPath(payload, config.statusPath))

  if (config.successValues.map(normalizeStatusValue).includes(status)) {
    return 'SUCCESS'
  }

  if (config.failureValues.map(normalizeStatusValue).includes(status)) {
    return 'FAILURE'
  }

  if (status) {
    return 'IN_PROGRESS'
  }

  const preview = rawText.trim().slice(0, 240)
  throw new Error(preview ? `Async image API returned no status at path "${config.statusPath}": ${preview}` : `Async image API returned no status at path "${config.statusPath}"`)
}

function getCustomTaskError(payload: unknown, config: ProviderAsyncConfig) {
  return getFirstStringValue(
    getByPath(payload, config.errorPath),
    getByPath(payload, 'error.message'),
    getByPath(payload, 'message'),
    getByPath(payload, 'msg'),
    getByPath(payload, 'data.fail_reason'),
  ) ?? 'Async image task failed'
}

function getImageFromCustomResult(payload: unknown, config: ProviderAsyncConfig, rawText: string) {
  for (const path of config.b64JsonPaths) {
    for (const value of getAllByPath(payload, path)) {
      if (typeof value === 'string' && value.trim()) {
        return normalizeBase64Image(value.trim())
      }
    }
  }

  for (const path of config.imageUrlPaths) {
    for (const value of getAllByPath(payload, path)) {
      if (typeof value === 'string' && (isHttpUrl(value) || isDataImageUrl(value))) {
        return value
      }
    }
  }

  const preview = rawText.trim().slice(0, 240)
  throw new Error(preview ? `Async image API returned no image payload: ${preview}` : 'Async image API returned no image payload')
}

export async function submitCustomAsyncImageGeneration(
  params: GenerateImageParams,
  requestBody: BodyInit,
  config: ProviderAsyncConfig,
  contentType?: string,
) {
  const endpoint = getCustomProxiedRequestUrl(appendQuery(buildCustomEndpoint(params.apiUrl, config.submitPath), config.submitQuery))
  const headers = new Headers({
    Authorization: `Bearer ${params.apiKey}`,
  })

  if (contentType) {
    headers.set('Content-Type', contentType)
  }

  let response: Response

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: requestBody,
    })
  } catch (error) {
    throw new Error(getNetworkErrorMessage(error, 'Custom async image submission'))
  }

  if (!response.ok) {
    throw await buildApiError(response, 'Custom async image submission')
  }

  const { payload } = await parseJsonLikeResponse(response)
  return {
    taskId: getCustomTaskId(payload, config),
  }
}

async function queryCustomAsyncImageGeneration(
  params: GenerateImageParams,
  taskId: string,
  config: ProviderAsyncConfig,
): Promise<AsyncImageTaskQueryResult> {
  const endpoint = getCustomProxiedRequestUrl(buildCustomEndpoint(params.apiUrl, renderTaskPath(config.pollPath, taskId)))
  let response: Response

  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
    })
  } catch (error) {
    throw new Error(getNetworkErrorMessage(error, 'Custom async image query'))
  }

  if (!response.ok) {
    throw await buildApiError(response, 'Custom async image query')
  }

  const { payload, rawText } = await parseJsonLikeResponse(response)
  const status = getCustomTaskStatus(payload, config, rawText)

  if (status === 'SUCCESS') {
    return {
      status,
      imageUrl: getImageFromCustomResult(payload, config, rawText),
    }
  }

  if (status === 'FAILURE') {
    return {
      status,
      errorMsg: getCustomTaskError(payload, config),
    }
  }

  return { status }
}

export async function waitForCustomAsyncImageGeneration(
  params: GenerateImageParams,
  taskId: string,
  config: ProviderAsyncConfig,
  onStatusChange?: (status: AsyncImageTaskStatus) => void,
) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < CUSTOM_ASYNC_POLL_TIMEOUT_MS) {
    const result = await queryCustomAsyncImageGeneration(params, taskId, config)
    onStatusChange?.(result.status)

    if (result.status === 'SUCCESS') {
      return result.imageUrl
    }

    if (result.status === 'FAILURE') {
      throw new Error(result.errorMsg)
    }

    await sleep(config.pollIntervalSeconds * 1000)
  }

  throw new Error('Custom async image generation timed out. Remote task may still complete; use the task ID to check it in the upstream provider console.')
}
