export type ProviderId = 'openai' | 'aliyun'

export interface ProviderDefinition {
  id: ProviderId
  label: string
  defaultApiUrl: string
}

export const DEFAULT_IMAGE_MODEL_ID = 'qwen-image-2.0-pro'
export const DEFAULT_IMAGE_MODEL_NAME = 'Qwen Image 2.0 Pro'
export const DEFAULT_ALIYUN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com'

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'aliyun',
    label: '阿里百炼',
    defaultApiUrl: DEFAULT_ALIYUN_BASE_URL,
  },
  {
    id: 'openai',
    label: 'OpenAI Compatible',
    defaultApiUrl: DEFAULT_OPENAI_BASE_URL,
  },
] as const

export function getProviderDefinition(providerId: ProviderId) {
  return PROVIDERS.find((provider) => provider.id === providerId) ?? PROVIDERS[0]
}

export function inferProviderFromApiUrl(apiUrl: string): ProviderId {
  const normalized = apiUrl.trim().toLowerCase()

  if (
    normalized.includes('dashscope.aliyuncs.com') ||
    normalized.includes('compatible-mode')
  ) {
    return 'aliyun'
  }

  return 'openai'
}
