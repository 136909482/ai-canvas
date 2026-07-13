import { MAX_GENERATE_REFERENCE_IMAGES } from '../../constants/generateNode.ts'
import {
  blobToDataUrl,
  buildApiError,
  getNetworkErrorMessage,
  isLocalDevHost,
  normalizeApiUrl,
  normalizeReferenceImages,
  resolveEffectiveRatio,
  resolveImageOperationType,
  toSafeUrl,
} from './shared.ts'
import type { GenerateImageParams } from './types.ts'

const IMAGE_EDIT_UNSUPPORTED_MESSAGE = 'Image edit is only supported by GPT image compatible JSON APIs.'

interface QwenImagePayload {
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{
          image?: string
          text?: string
        }>
      }
    }>
  }
}

type QwenContentItem = {
  image?: string
  text?: string
}

async function convertReferenceImageToQwenInput(image: string) {
  if (image.startsWith('http://') || image.startsWith('https://') || image.startsWith('data:image/')) {
    return image
  }

  if (image.startsWith('blob:')) {
    let response: Response

    try {
      response = await fetch(image)
    } catch (error) {
      throw new Error(getNetworkErrorMessage(error, 'Reference image'))
    }

    if (!response.ok) {
      throw new Error(`Reference image fetch failed: HTTP ${response.status}`)
    }

    return blobToDataUrl(await response.blob())
  }

  return `data:image/png;base64,${image}`
}

function getAliyunRequestBase(apiUrl: string) {
  const normalized = normalizeApiUrl(apiUrl)
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

function getQwenImageResult(payload: QwenImagePayload): string {
  const content = payload.output?.choices?.[0]?.message?.content ?? []
  const imageItem = content.find((item) => item.image)
  if (imageItem?.image) return imageItem.image
  throw new Error('Qwen image API returned no image payload')
}

function getQwenImageSize(ratio?: string) {
  switch (ratio) {
    case '16:9':
      return '1664*928'
    case '9:16':
      return '928*1664'
    case '4:3':
      return '1472*1104'
    case '3:4':
      return '1104*1472'
    case '3:2':
      return '1584*1056'
    case '2:3':
      return '1056*1584'
    case '5:4':
      return '1472*1184'
    case '4:5':
      return '1184*1472'
    case '21:9':
      return '1792*768'
    case '1:1':
    default:
      return '1328*1328'
  }
}

function buildQwenReferenceImagePrompt(referenceImages: string[], prompt: string): QwenContentItem[] {
  if (referenceImages.length === 0) {
    return [{ text: prompt }]
  }

  const referenceLabels = referenceImages
    .map((_referenceImage, index) => `image ${index + 1}`)
    .join(', ')

  const instructionText = [
    `You will receive ${referenceImages.length} reference images, up to ${MAX_GENERATE_REFERENCE_IMAGES}.`,
    `The uploaded references are ordered as: ${referenceLabels}.`,
    'When the user mentions image 1, image 2, or numbered reference images, follow this order exactly.',
    `User request: ${prompt}`,
  ].join(' ')

  return [
    { text: instructionText },
    ...referenceImages.map((referenceImage) => ({ image: referenceImage })),
  ]
}

export async function generateWithQwen(params: GenerateImageParams): Promise<string> {
  const operationType = resolveImageOperationType(params)

  if (operationType === 'image-edit') {
    throw new Error(IMAGE_EDIT_UNSUPPORTED_MESSAGE)
  }

  const { prompt, negativePrompt, apiKey, model } = params
  const apiUrl = getAliyunRequestBase(params.apiUrl)
  const effectiveRatio = await resolveEffectiveRatio(params)
  const size = getQwenImageSize(effectiveRatio)
  const referenceImages = await Promise.all(
    normalizeReferenceImages(params.referenceImageUrl, params.referenceImageUrls).map(convertReferenceImageToQwenInput),
  )
  const content = buildQwenReferenceImagePrompt(referenceImages, prompt)

  let response: Response
  try {
    response = await fetch(`${apiUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: {
          messages: [
            {
              role: 'user',
              content,
            },
          ],
        },
        parameters: {
          size,
          watermark: false,
          prompt_extend: true,
          ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
        },
      }),
    })
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Unable to reach Bailian API. In local dev, restart Vite to enable the proxy and check your API URL.')
    }
    throw error
  }

  if (!response.ok) {
    throw await buildApiError(response, 'Bailian image generation')
  }

  return getQwenImageResult(await response.json())
}
