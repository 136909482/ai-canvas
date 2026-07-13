import type { LLMInputFileData, LLMOutputFormat, RuntimeModelConfig } from '@/types'
import { createChatCompletionStreamParser } from './chatStream.ts'

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

function buildOutputInstruction(outputFormat: LLMOutputFormat) {
  switch (outputFormat) {
    case 'json':
      return '请只输出合法 JSON，不要附加解释、代码块标记或多余前后缀。'
    case 'markdown':
      return '请使用结构清晰的 Markdown 输出。'
    default:
      return '请使用纯文本输出，除非用户要求，否则不要附加多余说明。'
  }
}

type ChatTextContentPart = {
  type: 'text'
  text: string
}

type ChatImageContentPart = {
  type: 'image_url'
  image_url: {
    url: string
  }
}

type ChatMessage = {
  role: 'system' | 'user'
  content: string | Array<ChatTextContentPart | ChatImageContentPart>
}

function buildVisionInstruction(inputImageUrls: string[]) {
  if (inputImageUrls.length <= 1) {
    return ''
  }

  const referenceLabels = inputImageUrls
    .map((_imageUrl, index) => `图片 ${index + 1}`)
    .join('、')

  return `以下图片按顺序提供：${referenceLabels}。如引用编号，请按出现顺序理解。`
}

function buildFileInstruction(inputFiles: Array<Pick<LLMInputFileData, 'name' | 'content'>>) {
  if (inputFiles.length === 0) {
    return ''
  }

  return inputFiles
    .map((file, index) => [
      `附件 ${index + 1}：${file.name}`,
      file.content.trim(),
    ].join('\n'))
    .join('\n\n')
}

export type ExecuteChatPromptParams = {
  model: Pick<RuntimeModelConfig, 'apiKey' | 'apiUrl' | 'modelId'>
  systemPrompt?: string
  instructionPrompt: string
  inputText: string
  inputImageUrls?: string[]
  inputFiles?: Array<Pick<LLMInputFileData, 'name' | 'content'>>
  outputFormat: LLMOutputFormat
}

function buildChatMessages({
  systemPrompt = '',
  instructionPrompt,
  inputText,
  inputImageUrls = [],
  inputFiles = [],
  outputFormat,
}: Omit<ExecuteChatPromptParams, 'model'>) {
  const messages: ChatMessage[] = []
  const normalizedSystemPrompt = systemPrompt.trim()

  if (normalizedSystemPrompt) {
    messages.push({ role: 'system', content: normalizedSystemPrompt })
  }

  const userSegments = [
    instructionPrompt.trim(),
    inputText.trim(),
    buildFileInstruction(inputFiles),
    buildVisionInstruction(inputImageUrls),
    buildOutputInstruction(outputFormat),
  ].filter(Boolean)
  const userText = userSegments.join('\n\n')

  if (inputImageUrls.length === 0) {
    messages.push({ role: 'user', content: userText })
  } else {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: userText },
        ...inputImageUrls.map((imageUrl) => ({
          type: 'image_url' as const,
          image_url: { url: imageUrl },
        })),
      ],
    })
  }

  return messages
}

function extractChatCompletionText(payload: {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
}) {
  const content = payload.choices?.[0]?.message?.content
  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    const joined = content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('')
      .trim()

    if (joined) {
      return joined
    }
  }

  return ''
}

export async function executeChatPrompt({
  model,
  systemPrompt = '',
  instructionPrompt,
  inputText,
  inputImageUrls = [],
  inputFiles = [],
  outputFormat,
}: ExecuteChatPromptParams) {
  const messages = buildChatMessages({
    systemPrompt,
    instructionPrompt,
    inputText,
    inputImageUrls,
    inputFiles,
    outputFormat,
  })

  const response = await fetch(buildChatCompletionsUrl(model.apiUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${model.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model.modelId,
      messages,
      stream: false,
    }),
  })

  if (!response.ok) {
    throw new Error(`调用失败：${response.status} ${await readError(response)}`)
  }

  const text = extractChatCompletionText(await response.json())
  if (text) {
    return text
  }

  throw new Error('模型未返回可用内容')
}

export type ExecuteChatPromptStreamCallbacks = {
  onDelta?: (delta: string, fullText: string) => void
}

export async function executeChatPromptStream({
  model,
  systemPrompt = '',
  instructionPrompt,
  inputText,
  inputImageUrls = [],
  inputFiles = [],
  outputFormat,
}: ExecuteChatPromptParams, callbacks: ExecuteChatPromptStreamCallbacks = {}) {
  const messages = buildChatMessages({
    systemPrompt,
    instructionPrompt,
    inputText,
    inputImageUrls,
    inputFiles,
    outputFormat,
  })

  const response = await fetch(buildChatCompletionsUrl(model.apiUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${model.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model.modelId,
      messages,
      stream: true,
    }),
  })

  if (!response.ok) {
    throw new Error(`调用失败：${response.status} ${await readError(response)}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const text = extractChatCompletionText(await response.json())
    if (text) {
      callbacks.onDelta?.(text, text)
      return text
    }
    throw new Error('模型未返回可用内容')
  }

  if (!response.body) {
    throw new Error('模型未返回可读取的流式内容')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parser = createChatCompletionStreamParser()
  let fullText = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }

    const parsed = parser.push(decoder.decode(value, { stream: true }))
    for (const delta of parsed.deltas) {
      fullText += delta
      callbacks.onDelta?.(delta, fullText)
    }

    if (parsed.done) {
      break
    }
  }

  const trailing = decoder.decode()
  if (trailing) {
    const parsed = parser.push(trailing)
    for (const delta of parsed.deltas) {
      fullText += delta
      callbacks.onDelta?.(delta, fullText)
    }
  }

  const result = fullText.trim()
  if (result) {
    return result
  }

  throw new Error('模型未返回可用内容')
}
