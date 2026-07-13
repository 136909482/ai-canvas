import { generateWithQwen } from './image/aliyun'
import { generateWithOpenAI, submitOpenAiAsyncImageGeneration, waitForOpenAiAsyncImageGeneration } from './image/openai'
import type { AsyncImageTaskStatus, AsyncImageTaskSubmission, GenerateImageParams } from './image/types'

export type { GenerateImageParams } from './image/types'
export { isGptImageModel } from './image/openai'

export async function submitAsyncImageGeneration(params: GenerateImageParams): Promise<AsyncImageTaskSubmission> {
  const provider = params.provider ?? 'aliyun'

  if (provider !== 'openai') {
    throw new Error('Async generation is currently only supported for OpenAI Compatible image APIs')
  }

  return submitOpenAiAsyncImageGeneration(params)
}

export async function waitForAsyncImageGeneration(
  params: GenerateImageParams,
  taskId: string,
  onStatusChange?: (status: AsyncImageTaskStatus) => void,
): Promise<string> {
  const provider = params.provider ?? 'aliyun'

  if (provider !== 'openai') {
    throw new Error('Async generation is currently only supported for OpenAI Compatible image APIs')
  }

  return waitForOpenAiAsyncImageGeneration(params, taskId, onStatusChange)
}

export async function generateImage(params: GenerateImageParams): Promise<string> {
  const provider = params.provider ?? 'aliyun'

  switch (provider) {
    case 'openai':
      return generateWithOpenAI(params)
    case 'aliyun':
      return generateWithQwen(params)
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}
