import { MAX_GENERATE_REFERENCE_IMAGES } from '../../constants/generateNode.ts'
import type { ImageOperationType } from '@/types'
import type { GenerateImageParams } from './types.ts'

const SUPPORTED_IMAGE_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '4:1',
  '1:4',
  '8:1',
  '1:8',
  '21:9',
  '9:21',
] as const

type SupportedImageRatio = (typeof SUPPORTED_IMAGE_RATIOS)[number]
const PROMPT_RATIO_PATTERN = /(?:^|[^\d])(\d{1,4})\s*[:x]\s*(\d{1,4})(?:[^\d]|$)/i

export function normalizeReferenceImages(referenceImageUrl?: string | null, referenceImageUrls?: string[]) {
  const orderedReferenceImages = referenceImageUrls?.length
    ? referenceImageUrls
    : referenceImageUrl
      ? [referenceImageUrl]
      : []

  return orderedReferenceImages.slice(0, MAX_GENERATE_REFERENCE_IMAGES)
}

function decodeBase64ToBytes(value: string) {
  const binary = globalThis.atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function getExtensionFromMimeType(mimeType: string) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/png':
    default:
      return 'png'
  }
}

function dataUrlToFile(dataUrl: string, index: number) {
  const matched = dataUrl.match(/^data:([^;]+);base64,(.+)$/)

  if (!matched) {
    throw new Error('Unsupported data URL reference image format')
  }

  const [, mimeType, base64] = matched
  const bytes = decodeBase64ToBytes(base64)
  const extension = getExtensionFromMimeType(mimeType)

  return new File([bytes], `image_${index + 1}.${extension}`, { type: mimeType })
}

function base64ToFile(base64: string, index: number) {
  const mimeType = 'image/png'
  const bytes = decodeBase64ToBytes(base64)

  return new File([bytes], `image_${index + 1}.png`, { type: mimeType })
}

export async function remoteImageUrlToFile(imageUrl: string, index: number) {
  let response: Response

  try {
    response = await fetch(imageUrl)
  } catch (error) {
    throw new Error(getNetworkErrorMessage(error, `Reference image ${index + 1}`))
  }

  if (!response.ok) {
    throw new Error(`Reference image ${index + 1} fetch failed: HTTP ${response.status}`)
  }

  const blob = await response.blob()
  const mimeType = blob.type || 'image/png'
  const extension = getExtensionFromMimeType(mimeType)

  return new File([blob], `image_${index + 1}.${extension}`, { type: mimeType })
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('Failed to encode reference image'))
    }

    reader.onerror = () => reject(reader.error ?? new Error('Failed to encode reference image'))
    reader.readAsDataURL(blob.type ? blob : new Blob([blob], { type: 'image/png' }))
  })
}

export async function convertReferenceImageToFile(image: string, index: number) {
  if (image.startsWith('data:image/')) {
    return dataUrlToFile(image, index)
  }

  if (image.startsWith('http://') || image.startsWith('https://') || image.startsWith('blob:')) {
    return remoteImageUrlToFile(image, index)
  }

  return base64ToFile(image, index)
}

export function normalizeApiUrl(apiUrl: string) {
  return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl
}

export function toSafeUrl(apiUrl: string) {
  try {
    return new URL(apiUrl)
  } catch {
    return new URL(`https://${apiUrl}`)
  }
}

export function getNetworkErrorMessage(error: unknown, context: string) {
  if (error instanceof TypeError) {
    return `${context} request failed. In local dev, check the Vite proxy and API URL.`
  }

  if (error instanceof Error) {
    return `${context} request failed: ${error.message}`
  }

  return `${context} request failed: ${String(error)}`
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms)
  })
}

export function getNestedValue(value: unknown, path: Array<string | number>): unknown {
  return path.reduce<unknown>((current, key) => {
    if (Array.isArray(current) && typeof key === 'number') {
      return current[key]
    }

    if (current && typeof current === 'object' && typeof key === 'string') {
      return (current as Record<string, unknown>)[key]
    }

    return undefined
  }, value)
}

export function getFirstStringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }

  return null
}

export function isLocalDevHost() {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function isDevBuild() {
  return typeof import.meta !== 'undefined'
    && Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
}

function getLocalDevProxyUrl(targetUrl: string) {
  if (!isDevBuild() || !isLocalDevHost() || !(targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
    return null
  }

  return `/api-proxy/openai?target=${encodeURIComponent(targetUrl)}`
}

export async function downloadMediaAsBlob(mediaUrl: string, context: string) {
  const candidateUrls = [mediaUrl]
  const proxyUrl = getLocalDevProxyUrl(mediaUrl)

  if (proxyUrl && proxyUrl !== mediaUrl) {
    candidateUrls.push(proxyUrl)
  }

  let lastError: unknown = null

  for (const candidateUrl of candidateUrls) {
    try {
      const response = await fetch(candidateUrl)

      if (!response.ok) {
        lastError = new Error(`${context} fetch failed: HTTP ${response.status}`)
        continue
      }

      return response.blob()
    } catch (error) {
      lastError = error
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  throw new Error(getNetworkErrorMessage(lastError, context))
}

export function getImageResultFromUnknown(payload: unknown): string | null {
  if (typeof payload === 'string' && payload.trim()) {
    if (payload.startsWith('http://') || payload.startsWith('https://') || payload.startsWith('data:image/')) {
      return payload
    }
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const image = getImageResultFromUnknown(item)
      if (image) {
        return image
      }
    }

    return null
  }

  if (!payload || typeof payload !== 'object') {
    return null
  }

  const record = payload as Record<string, unknown>

  if (Array.isArray(record.url)) {
    const image = getImageResultFromUnknown(record.url)
    if (image) {
      return image
    }
  }

  if (typeof record.url === 'string' && record.url) {
    return record.url
  }

  if (typeof record.b64_json === 'string' && record.b64_json) {
    return `data:image/png;base64,${record.b64_json}`
  }

  const nestedKeys = ['data', 'result', 'results', 'images', 'image', 'output', 'response'] as const

  for (const key of nestedKeys) {
    const image = getImageResultFromUnknown(record[key])
    if (image) {
      return image
    }
  }

  for (const value of Object.values(record)) {
    const image = getImageResultFromUnknown(value)
    if (image) {
      return image
    }
  }

  return null
}

export async function parseJsonLikeResponse(response: Response) {
  const rawText = await response.text()

  if (!rawText.trim()) {
    return { payload: null, rawText }
  }

  try {
    return {
      payload: JSON.parse(rawText) as unknown,
      rawText,
    }
  } catch {
    return {
      payload: rawText,
      rawText,
    }
  }
}

function stripHtmlTags(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getApiErrorPreview(rawText: string) {
  const trimmed = rawText.trim()
  if (!trimmed) {
    return ''
  }

  try {
    const payload = JSON.parse(trimmed) as unknown
    const message = getFirstStringValue(
      getNestedValue(payload, ['error', 'message']),
      getNestedValue(payload, ['message']),
      getNestedValue(payload, ['msg']),
      getNestedValue(payload, ['error']),
    )

    if (message) {
      return message.slice(0, 320)
    }
  } catch {
    // Fall through to text preview.
  }

  const text = trimmed.startsWith('<') ? stripHtmlTags(trimmed) : trimmed
  return text.slice(0, 320)
}

function getPayloadStatusCode(payload: unknown) {
  const value = getNestedValue(payload, ['status_code']) ?? getNestedValue(payload, ['statusCode']) ?? getNestedValue(payload, ['code'])

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value)
  }

  return null
}

function getPayloadExplicitErrorMessage(payload: unknown) {
  const statusCode = getPayloadStatusCode(payload)
  const stringCode = getFirstStringValue(
    getNestedValue(payload, ['code']),
    getNestedValue(payload, ['status']),
  )
  const normalizedCode = stringCode?.trim().toLowerCase()
  const message = getFirstStringValue(
    getNestedValue(payload, ['error', 'message']),
    getNestedValue(payload, ['error']),
    getNestedValue(payload, ['message']),
    getNestedValue(payload, ['msg']),
    getNestedValue(payload, ['fail_reason']),
    getNestedValue(payload, ['data', 'error', 'message']),
    getNestedValue(payload, ['data', 'error']),
    getNestedValue(payload, ['data', 'message']),
    getNestedValue(payload, ['data', 'msg']),
    getNestedValue(payload, ['data', 'fail_reason']),
  )

  if (statusCode !== null && statusCode >= 400) {
    return message ? `status_code=${statusCode}: ${message}` : `status_code=${statusCode}`
  }

  if (normalizedCode && !['success', 'succeeded', 'ok', 'done', 'completed'].includes(normalizedCode)) {
    return message ? `${stringCode}: ${message}` : stringCode
  }

  if (getNestedValue(payload, ['error']) && message) {
    return message
  }

  return null
}

export async function buildApiError(response: Response, context: string) {
  const preview = getApiErrorPreview(await response.text())
  return new Error(preview ? `${context} failed: HTTP ${response.status}: ${preview}` : `${context} failed: HTTP ${response.status}`)
}

export function getImageResultFromResponsePayload(payload: unknown, rawText: string) {
  const explicitErrorMessage = getPayloadExplicitErrorMessage(payload)
  if (explicitErrorMessage) {
    throw new Error(`Image API failed: ${explicitErrorMessage}`)
  }

  const imageUrl = getImageResultFromUnknown(payload)

  if (imageUrl) {
    return imageUrl
  }

  const preview = rawText.trim().slice(0, 240)
  throw new Error(preview ? `Image API returned no image payload: ${preview}` : 'Image API returned no image payload')
}

export function resolveImageOperationType(params: GenerateImageParams): ImageOperationType {
  if (params.operationType) {
    return params.operationType
  }

  return normalizeReferenceImages(params.referenceImageUrl, params.referenceImageUrls).length > 0
    ? 'image-to-image'
    : 'text-to-image'
}

export function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }
    image.onerror = () => reject(new Error('Failed to read reference image dimensions'))
    image.src = url
  })
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

function normalizeRatioPair(width: number, height: number) {
  const divisor = getGreatestCommonDivisor(width, height)
  return `${width / divisor}:${height / divisor}`
}

function parseRatioFromPrompt(prompt: string): string | null {
  const matched = prompt.match(PROMPT_RATIO_PATTERN)

  if (!matched) {
    return null
  }

  const width = Number(matched[1])
  const height = Number(matched[2])

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }

  return normalizeRatioPair(width, height)
}

function resolveClosestSupportedRatio(width: number, height: number): SupportedImageRatio {
  if (width <= 0 || height <= 0) {
    return '1:1'
  }

  const targetRatio = width / height

  return SUPPORTED_IMAGE_RATIOS.reduce((closest, candidate) => {
    const [candidateWidth, candidateHeight] = candidate.split(':').map(Number)
    const candidateRatio = candidateWidth / candidateHeight
    const closestWidth = Number(closest.split(':')[0])
    const closestHeight = Number(closest.split(':')[1])
    const closestRatio = closestWidth / closestHeight

    return Math.abs(candidateRatio - targetRatio) < Math.abs(closestRatio - targetRatio)
      ? candidate
      : closest
  }, '1:1' as SupportedImageRatio)
}

export async function resolveEffectiveRatio(params: GenerateImageParams) {
  if (params.ratio && params.ratio !== 'Auto') {
    return params.ratio
  }

  const primaryReferenceImageUrl = resolveImageOperationType(params) === 'image-edit'
    ? params.editImageUrl ?? null
    : normalizeReferenceImages(params.referenceImageUrl, params.referenceImageUrls)[0] ?? null

  if (primaryReferenceImageUrl) {
    try {
      const { width, height } = await loadImageDimensions(primaryReferenceImageUrl)
      return resolveClosestSupportedRatio(width, height)
    } catch {
      // Fall through to prompt-derived ratio when the reference cannot be inspected.
    }
  }

  const promptRatio = parseRatioFromPrompt(params.prompt)
  if (promptRatio) {
    return promptRatio
  }

  return '1:1'
}
