import type { RuntimeModelConfig } from '@/types'

const TEST_MESSAGE = 'ping'

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

function toProxyUrl(targetUrl: string) {
  const parsed = toSafeUrl(targetUrl)

  if (!isLocalDevHost()) {
    return parsed.toString()
  }

  switch (parsed.host) {
    case 'dashscope.aliyuncs.com':
      return `/api-proxy/aliyun${parsed.pathname}${parsed.search}`
    case 'dashscope-intl.aliyuncs.com':
      return `/api-proxy/aliyun-intl${parsed.pathname}${parsed.search}`
    case 'dashscope-us.aliyuncs.com':
      return `/api-proxy/aliyun-us${parsed.pathname}${parsed.search}`
    default:
      return parsed.toString()
  }
}

function buildChatCompletionsUrl(apiUrl: string) {
  const normalized = normalizeApiUrl(apiUrl.trim())
  const parsed = toSafeUrl(normalized)
  const pathname = parsed.pathname

  if (pathname.endsWith('/v1/chat/completions') || pathname.endsWith('/chat/completions')) {
    return toProxyUrl(parsed.toString())
  }

  if (pathname.endsWith('/v1/models')) {
    return toProxyUrl(`${parsed.origin}${pathname.slice(0, -'/models'.length)}/chat/completions`)
  }

  if (pathname.endsWith('/v1')) {
    return toProxyUrl(`${parsed.origin}${pathname}/chat/completions`)
  }

  return toProxyUrl(`${parsed.origin}${pathname === '/' ? '' : pathname}/v1/chat/completions`)
}

async function readError(response: Response) {
  const text = await response.text()
  return text || response.statusText || 'Unknown error'
}

export async function testChatModelConnection(model: Pick<RuntimeModelConfig, 'apiKey' | 'apiUrl' | 'modelId'>) {
  const response = await fetch(buildChatCompletionsUrl(model.apiUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${model.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model.modelId,
      messages: [{ role: 'user', content: TEST_MESSAGE }],
      max_tokens: 1,
      stream: false,
    }),
  })

  if (!response.ok) {
    throw new Error(`测试失败：${response.status} ${await readError(response)}`)
  }

  return response.json()
}
