import {
  getModelDraftValidationMessage,
  getProviderProfileValidationMessage,
  PROVIDER_CONFIG_MESSAGES,
  resolveRuntimeModelConfig,
} from './providerConfig.ts'
import type { ApiConfig, CustomImageModelConfig, ProviderProfileConfig } from '@/types'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function createModel(overrides: Partial<CustomImageModelConfig> = {}): CustomImageModelConfig {
  return {
    id: 'model-1',
    name: 'Image Model',
    modelId: 'image-model',
    kind: 'image',
    enabled: true,
    testStatus: 'idle',
    testMessage: '',
    lastTestedAt: null,
    ...overrides,
  }
}

function createProfile(overrides: Partial<ProviderProfileConfig> = {}): ProviderProfileConfig {
  return {
    id: 'profile-1',
    name: 'Provider',
    kind: 'image',
    apiKey: ' key ',
    apiUrl: ' https://dashscope.aliyuncs.com/compatible-mode/v1 ',
    provider: 'aliyun',
    requestMode: 'sync',
    asyncConfig: null,
    enabled: true,
    testStatus: 'idle',
    testMessage: '',
    lastTestedAt: null,
    ...overrides,
  }
}

function createConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  const model = createModel()
  const profile = createProfile()

  return {
    model: model.modelId,
    customModels: [model],
    providerProfiles: [profile],
    activeProviderProfileIds: { image: profile.id },
    modelProviderProfileIds: {},
    storage: {
      autosaveIntervalMs: 60000,
      canvasTopBarCollapsed: false,
      alignmentGuidesEnabled: true,
      themeMode: 'dark',
      canvasPerformanceMode: 'quality',
      canvasGridEnabled: true,
      edgeStyle: 'animated',
      lowQualityPreviewEnabled: true,
      workspaceDirectoryName: '',
      workspaceConfigured: false,
    },
    ...overrides,
  }
}

function runProviderConfigTests() {
  assert(
    getModelDraftValidationMessage(createModel({ modelId: '   ' })) === PROVIDER_CONFIG_MESSAGES.emptyModelId,
    'empty model ids should use the shared diagnostic message',
  )
  assert(
    getModelDraftValidationMessage(createModel({ modelId: 'model-a' })) === '',
    'non-empty model ids should pass draft validation',
  )
  assert(
    getProviderProfileValidationMessage(null) === PROVIDER_CONFIG_MESSAGES.emptyProviderProfile,
    'missing provider profiles should be explicit',
  )
  assert(
    getProviderProfileValidationMessage(createProfile({ apiKey: ' ', apiUrl: 'https://example.com/v1' })) === PROVIDER_CONFIG_MESSAGES.emptyApiKey,
    'empty api keys should be diagnosed before requests run',
  )
  assert(
    getProviderProfileValidationMessage(createProfile({ apiKey: 'key', apiUrl: ' ' })) === PROVIDER_CONFIG_MESSAGES.emptyApiUrl,
    'empty api urls should be diagnosed before requests run',
  )

  const resolved = resolveRuntimeModelConfig(createConfig(), {
    modelId: 'image-model',
    kind: 'image',
    requireCredentials: true,
  })
  assert(resolved.ok, 'valid model/provider config should resolve')
  assert(resolved.runtimeConfig.apiKey === 'key', 'runtime config should trim api keys')
  assert(
    resolved.runtimeConfig.apiUrl === 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    'runtime config should trim api urls',
  )

  const disabledModel = resolveRuntimeModelConfig(createConfig({
    customModels: [createModel({ enabled: false })],
  }), {
    modelId: 'image-model',
    kind: 'image',
    requireCredentials: true,
  })
  assert(!disabledModel.ok && disabledModel.diagnostic.code === 'modelDisabled', 'disabled models should not resolve')

  const disabledExplicitProfile = resolveRuntimeModelConfig(createConfig({
    providerProfiles: [createProfile({ enabled: false })],
  }), {
    modelId: 'image-model',
    kind: 'image',
    profileId: 'profile-1',
    requireCredentials: true,
  })
  assert(
    !disabledExplicitProfile.ok && disabledExplicitProfile.diagnostic.code === 'providerProfileDisabled',
    'disabled explicit provider profiles should not silently fall back',
  )

  const missingExplicitProfile = resolveRuntimeModelConfig(createConfig(), {
    modelId: 'image-model',
    kind: 'image',
    profileId: 'missing-profile',
    requireCredentials: true,
  })
  assert(
    !missingExplicitProfile.ok && missingExplicitProfile.diagnostic.code === 'providerProfileMissing',
    'missing explicit provider profiles should be reported',
  )

  const fallbackFromMissingProfile = resolveRuntimeModelConfig(createConfig(), {
    modelId: 'image-model',
    kind: 'image',
    profileId: 'missing-profile',
    requireCredentials: true,
    allowProfileFallback: true,
  })
  assert(fallbackFromMissingProfile.ok, 'callers can opt into provider profile fallback')
}

runProviderConfigTests()
