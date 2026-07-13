import assert from 'node:assert/strict'
import test from 'node:test'
import { executeChatPrompt } from './chatAdapter.ts'
import { generateWithQwen } from './image/aliyun.ts'
import { generateWithOpenAI, submitOpenAiAsyncImageGeneration } from './image/openai.ts'

type CapturedRequest = {
  input: string | URL | Request
  init?: RequestInit
}

async function withMockFetch<T>(
  responder: (request: CapturedRequest) => Response | Promise<Response>,
  action: () => Promise<T>,
) {
  const originalFetch = globalThis.fetch
  const requests: CapturedRequest[] = []
  globalThis.fetch = async (input, init) => {
    const request = { input, init }
    requests.push(request)
    return responder(request)
  }

  try {
    return { result: await action(), requests }
  } finally {
    globalThis.fetch = originalFetch
  }
}

function getHeader(init: RequestInit | undefined, name: string) {
  return new Headers(init?.headers).get(name)
}

test('Aliyun image provider sends its documented endpoint, authorization, and payload', async () => {
  const { result, requests } = await withMockFetch(
    () => Response.json({ output: { choices: [{ message: { content: [{ image: 'https://cdn.example/qwen.png' }] } }] } }),
    () => generateWithQwen({
      prompt: 'draw a square',
      negativePrompt: 'noise',
      ratio: '16:9',
      apiKey: 'aliyun-key',
      apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-image-2.0-pro',
      provider: 'aliyun',
      operationType: 'text-to-image',
    }),
  )

  assert.equal(result, 'https://cdn.example/qwen.png')
  assert.equal(String(requests[0]?.input), 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation')
  assert.equal(getHeader(requests[0]?.init, 'authorization'), 'Bearer aliyun-key')
  const body = JSON.parse(String(requests[0]?.init?.body))
  assert.equal(body.model, 'qwen-image-2.0-pro')
  assert.equal(body.input.messages[0].content[0].text, 'draw a square')
  assert.equal(body.parameters.size, '1664*928')
  assert.equal(body.parameters.negative_prompt, 'noise')
})

test('OpenAI compatible sync image provider preserves model options and extracts URL results', async () => {
  const { result, requests } = await withMockFetch(
    () => Response.json({ data: [{ url: 'https://cdn.example/openai.png' }] }),
    () => generateWithOpenAI({
      prompt: 'draw a circle',
      ratio: '1:1',
      resolution: '2k',
      quality: 'high',
      apiKey: 'openai-key',
      apiUrl: 'https://images.example/v1',
      model: 'gpt-image-2',
      provider: 'openai',
      requestMode: 'sync',
      operationType: 'text-to-image',
    }),
  )

  assert.equal(result, 'https://cdn.example/openai.png')
  assert.equal(String(requests[0]?.input), 'https://images.example/v1/images/generations')
  assert.equal(getHeader(requests[0]?.init, 'authorization'), 'Bearer openai-key')
  assert.equal(getHeader(requests[0]?.init, 'content-type'), 'application/json')
  const body = JSON.parse(String(requests[0]?.init?.body))
  assert.deepEqual(
    { model: body.model, prompt: body.prompt, resolution: body.resolution, quality: body.quality, outputFormat: body.output_format },
    { model: 'gpt-image-2', prompt: 'draw a circle', resolution: '2k', quality: 'high', outputFormat: 'png' },
  )
})

test('OpenAI compatible async provider accepts the task_id submission contract', async () => {
  const { result, requests } = await withMockFetch(
    () => Response.json({ task_id: 'remote-task-1' }),
    () => submitOpenAiAsyncImageGeneration({
      prompt: 'draw a triangle',
      ratio: '1:1',
      apiKey: 'async-key',
      apiUrl: 'https://async.example/v1',
      model: 'gpt-image-2',
      provider: 'openai',
      requestMode: 'async',
      operationType: 'text-to-image',
    }),
  )

  assert.deepEqual(result, { taskId: 'remote-task-1' })
  assert.equal(String(requests[0]?.input), 'https://async.example/v1/images/generations')
  assert.equal(getHeader(requests[0]?.init, 'authorization'), 'Bearer async-key')
})

test('chat provider uses the OpenAI-compatible completion contract', async () => {
  const { result, requests } = await withMockFetch(
    () => Response.json({ choices: [{ message: { content: '  pong  ' } }] }),
    () => executeChatPrompt({
      model: { apiKey: 'chat-key', apiUrl: 'https://chat.example/v1/models', modelId: 'chat-model' },
      systemPrompt: 'Be concise.',
      instructionPrompt: 'Answer the user.',
      inputText: 'ping',
      outputFormat: 'text',
    }),
  )

  assert.equal(result, 'pong')
  assert.equal(String(requests[0]?.input), 'https://chat.example/v1/chat/completions')
  assert.equal(getHeader(requests[0]?.init, 'authorization'), 'Bearer chat-key')
  const body = JSON.parse(String(requests[0]?.init?.body))
  assert.equal(body.model, 'chat-model')
  assert.equal(body.stream, false)
  assert.equal(body.messages[0].role, 'system')
  assert.match(body.messages[1].content, /ping/)
})

test('provider HTTP failures preserve status and response details', async () => {
  await assert.rejects(
    () => withMockFetch(
      () => new Response('quota exhausted', { status: 429, statusText: 'Too Many Requests' }),
      () => executeChatPrompt({
        model: { apiKey: 'chat-key', apiUrl: 'https://chat.example/v1', modelId: 'chat-model' },
        instructionPrompt: '',
        inputText: 'ping',
        outputFormat: 'text',
      }),
    ),
    /429 quota exhausted/,
  )
})
