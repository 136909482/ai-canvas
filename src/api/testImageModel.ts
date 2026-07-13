import { generateImage } from './imageAdapter'
import type { RuntimeModelConfig } from '@/types'

const TEST_PROMPT = 'A minimal blue square icon on a light background.'

export async function testImageModelConnection(
  model: Pick<RuntimeModelConfig, 'apiKey' | 'apiUrl' | 'modelId' | 'provider' | 'requestMode' | 'asyncConfig'>,
) {
  const imageUrl = await generateImage({
    prompt: TEST_PROMPT,
    ratio: '1:1',
    apiKey: model.apiKey,
    apiUrl: model.apiUrl,
    model: model.modelId,
    provider: model.provider,
    asyncConfig: model.asyncConfig,
    requestMode: model.requestMode,
    operationType: 'text-to-image',
  })

  return imageUrl
}
