import {
  DEFAULT_ALIYUN_BASE_URL,
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_IMAGE_MODEL_NAME,
  inferProviderFromApiUrl,
} from '../config/modelCatalog.ts'
import type {
  ApiConfig,
  CustomImageModelConfig,
  CustomModelKind,
  ProviderAsyncConfig,
  ProviderProfileConfig,
  StorageConfig,
  WorkspaceConfigFile,
} from '../types/index.ts'

const DEFAULT_PROVIDER_ASYNC_CONFIG: ProviderAsyncConfig = {
  enabled: false,
  submitPath: 'images/generations',
  submitQuery: { async: 'true' },
  taskIdPath: 'data',
  pollPath: 'images/tasks/{task_id}',
  pollIntervalSeconds: 5,
  statusPath: 'data.status',
  successValues: ['SUCCESS', 'completed', 'succeeded'],
  failureValues: ['FAILURE', 'failed', 'cancelled', 'error'],
  errorPath: 'data.fail_reason',
  imageUrlPaths: ['data.data.data.*.url', 'data.data.*.url', 'data.result.images.*.url', 'data.result.images.*.url.*'],
  b64JsonPaths: ['data.data.data.*.b64_json', 'data.data.*.b64_json', 'data.*.b64_json'],
}

interface LegacyProviderConfig {
  apiKey?: string
  apiUrl?: string
  model?: string
}

export interface LegacyConfigShape {
  apiKey?: string
  apiUrl?: string
  model?: string
  providers?: {
    aliyun?: LegacyProviderConfig
  }
}

function createModelId() {
  return `custom-model-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createProviderProfileId() {
  return `provider-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createDefaultCustomModel(overrides?: Partial<CustomImageModelConfig>): CustomImageModelConfig {
  return {
    id: createModelId(),
    name: DEFAULT_IMAGE_MODEL_NAME,
    modelId: DEFAULT_IMAGE_MODEL_ID,
    kind: 'image',
    enabled: true,
    testStatus: 'idle',
    testMessage: '',
    lastTestedAt: null,
    ...overrides,
  }
}

export function normalizeCustomModel(model: Partial<CustomImageModelConfig>): CustomImageModelConfig {
  const fallback = createDefaultCustomModel()
  const modelId = model.modelId?.trim() || fallback.modelId

  return {
    ...fallback,
    ...model,
    id: model.id || fallback.id,
    name: model.name?.trim() || modelId || fallback.name,
    modelId,
    kind: model.kind ?? 'image',
    enabled: model.enabled ?? true,
    testStatus: model.testStatus ?? 'idle',
    testMessage: model.testMessage ?? '',
    lastTestedAt: model.lastTestedAt ?? null,
  }
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return [...fallback]
  }

  const normalized = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())

  return normalized.length > 0 ? normalized : [...fallback]
}

function normalizeStringRecord(value: unknown, fallback: Record<string, string>) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...fallback }
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string | number | boolean] => (
        typeof entry[0] === 'string'
        && entry[0].trim().length > 0
        && ['string', 'number', 'boolean'].includes(typeof entry[1])
      ))
      .map(([key, item]) => [key.trim(), String(item)] as const),
  )
}

export function normalizeProviderAsyncConfig(config?: Partial<ProviderAsyncConfig> | null): ProviderAsyncConfig | null {
  if (!config) {
    return null
  }

  const pollIntervalSeconds = typeof config.pollIntervalSeconds === 'number' && Number.isFinite(config.pollIntervalSeconds)
    ? Math.max(1, Math.trunc(config.pollIntervalSeconds))
    : DEFAULT_PROVIDER_ASYNC_CONFIG.pollIntervalSeconds

  return {
    enabled: Boolean(config.enabled),
    submitPath: config.submitPath?.trim() || DEFAULT_PROVIDER_ASYNC_CONFIG.submitPath,
    submitQuery: normalizeStringRecord(config.submitQuery, DEFAULT_PROVIDER_ASYNC_CONFIG.submitQuery),
    taskIdPath: config.taskIdPath?.trim() || DEFAULT_PROVIDER_ASYNC_CONFIG.taskIdPath,
    pollPath: config.pollPath?.trim() || DEFAULT_PROVIDER_ASYNC_CONFIG.pollPath,
    pollIntervalSeconds,
    statusPath: config.statusPath?.trim() || DEFAULT_PROVIDER_ASYNC_CONFIG.statusPath,
    successValues: normalizeStringArray(config.successValues, DEFAULT_PROVIDER_ASYNC_CONFIG.successValues),
    failureValues: normalizeStringArray(config.failureValues, DEFAULT_PROVIDER_ASYNC_CONFIG.failureValues),
    errorPath: config.errorPath?.trim() || DEFAULT_PROVIDER_ASYNC_CONFIG.errorPath,
    imageUrlPaths: normalizeStringArray(config.imageUrlPaths, DEFAULT_PROVIDER_ASYNC_CONFIG.imageUrlPaths),
    b64JsonPaths: normalizeStringArray(config.b64JsonPaths, DEFAULT_PROVIDER_ASYNC_CONFIG.b64JsonPaths),
  }
}

export function createDefaultProviderProfile(overrides?: Partial<ProviderProfileConfig>): ProviderProfileConfig {
  const profile: ProviderProfileConfig = {
    id: createProviderProfileId(),
    name: '阿里百炼',
    kind: 'image',
    apiKey: '',
    apiUrl: DEFAULT_ALIYUN_BASE_URL,
    provider: 'aliyun',
    requestMode: 'sync',
    asyncConfig: normalizeProviderAsyncConfig(overrides?.asyncConfig) ?? { ...DEFAULT_PROVIDER_ASYNC_CONFIG },
    enabled: true,
    testStatus: 'idle',
    testMessage: '',
    lastTestedAt: null,
    ...overrides,
  }

  return {
    ...profile,
    asyncConfig: normalizeProviderAsyncConfig(profile.asyncConfig) ?? { ...DEFAULT_PROVIDER_ASYNC_CONFIG },
  }
}

export function normalizeProviderProfile(profile: Partial<ProviderProfileConfig>): ProviderProfileConfig {
  const fallback = createDefaultProviderProfile()
  const apiUrl = profile.apiUrl?.trim() || fallback.apiUrl
  const provider = profile.provider ?? inferProviderFromApiUrl(apiUrl)

  return {
    ...fallback,
    ...profile,
    id: profile.id || fallback.id,
    name: profile.name?.trim() || (provider === 'aliyun' ? '阿里百炼' : 'OpenAI Compatible'),
    kind: profile.kind ?? 'image',
    apiKey: profile.apiKey ?? '',
    apiUrl,
    provider,
    requestMode: provider === 'openai' ? profile.requestMode ?? fallback.requestMode : 'sync',
    asyncConfig: normalizeProviderAsyncConfig(profile.asyncConfig) ?? normalizeProviderAsyncConfig(fallback.asyncConfig),
    enabled: profile.enabled ?? true,
    testStatus: profile.testStatus ?? 'idle',
    testMessage: profile.testMessage ?? '',
    lastTestedAt: profile.lastTestedAt ?? null,
  }
}

function modelToMigratedProviderProfile(model: Partial<CustomImageModelConfig> & {
  apiKey?: string
  apiUrl?: string
  provider?: ProviderProfileConfig['provider']
  requestMode?: ProviderProfileConfig['requestMode']
}): ProviderProfileConfig {
  const apiUrl = model.apiUrl?.trim() || DEFAULT_ALIYUN_BASE_URL
  const provider = model.provider ?? inferProviderFromApiUrl(apiUrl)

  return normalizeProviderProfile({
    id: `provider-${model.id || createProviderProfileId()}`,
    name: model.name?.trim() || (provider === 'aliyun' ? '阿里百炼' : 'OpenAI Compatible'),
    kind: model.kind ?? 'image',
    apiKey: model.apiKey ?? '',
    apiUrl,
    provider,
    requestMode: model.requestMode ?? 'sync',
    enabled: model.enabled ?? true,
  })
}

function migrateLegacyModels(config?: LegacyConfigShape): CustomImageModelConfig[] {
  const aliyunConfig = config?.providers?.aliyun
  const modelId = aliyunConfig?.model ?? config?.model ?? DEFAULT_IMAGE_MODEL_ID

  return [
    normalizeCustomModel({
      id: 'default-aliyun-model',
      name: modelId,
      modelId,
      kind: 'image',
      enabled: true,
    }),
  ]
}

function migrateLegacyProviderProfiles(config?: LegacyConfigShape): ProviderProfileConfig[] {
  const aliyunConfig = config?.providers?.aliyun
  const apiKey = aliyunConfig?.apiKey ?? config?.apiKey ?? ''
  const apiUrl = aliyunConfig?.apiUrl ?? config?.apiUrl ?? DEFAULT_ALIYUN_BASE_URL

  return [
    normalizeProviderProfile({
      id: 'default-aliyun-provider',
      name: inferProviderFromApiUrl(apiUrl) === 'aliyun' ? '阿里百炼' : 'OpenAI Compatible',
      kind: 'image',
      apiKey,
      apiUrl,
      provider: inferProviderFromApiUrl(apiUrl),
      requestMode: 'sync',
      enabled: true,
    }),
  ]
}

export function normalizeStorageConfig(config?: Partial<StorageConfig>): StorageConfig {
  const autosaveIntervalMs = Number.isFinite(config?.autosaveIntervalMs)
    ? Math.max(15_000, Number(config?.autosaveIntervalMs))
    : 60_000
  const themeMode = config?.themeMode === 'light' || config?.themeMode === 'system'
    ? config.themeMode
    : 'dark'
  const canvasPerformanceMode = config?.canvasPerformanceMode === 'performance' ? 'performance' : 'quality'
  const edgeStyle = config?.edgeStyle === 'solid' ? 'solid' : 'animated'

  return {
    autosaveIntervalMs,
    canvasTopBarCollapsed: Boolean(config?.canvasTopBarCollapsed),
    alignmentGuidesEnabled: config?.alignmentGuidesEnabled !== false,
    themeMode,
    canvasPerformanceMode,
    canvasGridEnabled: config?.canvasGridEnabled !== false,
    edgeStyle,
    lowQualityPreviewEnabled: config?.lowQualityPreviewEnabled !== false,
    workspaceDirectoryName: config?.workspaceDirectoryName?.trim() ?? '',
    workspaceConfigured: Boolean(config?.workspaceConfigured),
  }
}

export function normalizeConfig(config?: Partial<ApiConfig> | LegacyConfigShape): ApiConfig {
  const maybeCustomModels = (config as Partial<ApiConfig> | undefined)?.customModels
  const customModels = Array.isArray(maybeCustomModels) && maybeCustomModels.length > 0
    ? maybeCustomModels.map((model) => normalizeCustomModel(model))
    : migrateLegacyModels(config as LegacyConfigShape | undefined)

  const maybeProviderProfiles = (config as Partial<ApiConfig> | undefined)?.providerProfiles
  const providerProfiles = Array.isArray(maybeProviderProfiles) && maybeProviderProfiles.length > 0
    ? maybeProviderProfiles.map((profile) => normalizeProviderProfile(profile))
    : Array.isArray(maybeCustomModels) && maybeCustomModels.length > 0
      ? maybeCustomModels.map((model) => modelToMigratedProviderProfile(model))
      : migrateLegacyProviderProfiles(config as LegacyConfigShape | undefined)

  const enabledModels = customModels.filter((model) => model.enabled)
  const enabledProfiles = providerProfiles.filter((profile) => profile.enabled)
  const defaultModel = (config as Partial<ApiConfig> | undefined)?.model
  const hasDefaultModel = enabledModels.some((model) => model.modelId === defaultModel)
  const rawActiveProviderProfileIds = (config as Partial<ApiConfig> | undefined)?.activeProviderProfileIds ?? {}
  const rawModelProviderProfileIds = (config as Partial<ApiConfig> | undefined)?.modelProviderProfileIds ?? {}
  const activeProviderProfileIds = Object.fromEntries(
    (['chat', 'image', 'video', 'music', 'tool'] as CustomModelKind[]).map((kind) => {
      const configuredId = rawActiveProviderProfileIds[kind]
      const activeId = enabledProfiles.some((profile) => profile.id === configuredId && profile.kind === kind)
        ? configuredId
        : enabledProfiles.find((profile) => profile.kind === kind)?.id

      return [kind, activeId]
    }).filter((entry): entry is [CustomModelKind, string] => typeof entry[1] === 'string' && entry[1].length > 0),
  ) as Partial<Record<CustomModelKind, string>>
  const enabledProfileIds = new Set(enabledProfiles.map((profile) => profile.id))
  const modelKindByModelId = new Map(customModels.map((model) => [model.modelId, model.kind]))
  const modelProviderProfileIds = Object.fromEntries(
    Object.entries(rawModelProviderProfileIds)
      .filter((entry): entry is [string, string] => (
        typeof entry[0] === 'string'
        && entry[0].trim().length > 0
        && typeof entry[1] === 'string'
        && enabledProfileIds.has(entry[1])
        && modelKindByModelId.has(entry[0])
        && providerProfiles.some((profile) => profile.id === entry[1] && profile.kind === modelKindByModelId.get(entry[0]))
      )),
  )

  return {
    model: hasDefaultModel ? defaultModel ?? enabledModels[0]?.modelId ?? DEFAULT_IMAGE_MODEL_ID : enabledModels[0]?.modelId ?? DEFAULT_IMAGE_MODEL_ID,
    customModels,
    providerProfiles,
    activeProviderProfileIds,
    modelProviderProfileIds,
    storage: normalizeStorageConfig((config as Partial<ApiConfig> | undefined)?.storage),
  }
}

export function toWorkspaceConfigFile(config: ApiConfig): WorkspaceConfigFile {
  const normalized = normalizeConfig(config)

  return {
    version: 1,
    model: normalized.model,
    customModels: normalized.customModels.map((model) => ({
      id: model.id,
      name: model.name,
      modelId: model.modelId,
      kind: model.kind,
      enabled: model.enabled,
    })),
    providerProfiles: normalized.providerProfiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      kind: profile.kind,
      apiKey: profile.apiKey,
      apiUrl: profile.apiUrl,
      provider: profile.provider,
      requestMode: profile.requestMode,
      asyncConfig: profile.asyncConfig,
      enabled: profile.enabled,
    })),
    activeProviderProfileIds: normalized.activeProviderProfileIds,
    modelProviderProfileIds: normalized.modelProviderProfileIds,
    storage: {
      autosaveIntervalMs: normalized.storage.autosaveIntervalMs,
      canvasTopBarCollapsed: normalized.storage.canvasTopBarCollapsed,
      alignmentGuidesEnabled: normalized.storage.alignmentGuidesEnabled,
      themeMode: normalized.storage.themeMode,
      canvasPerformanceMode: normalized.storage.canvasPerformanceMode,
      canvasGridEnabled: normalized.storage.canvasGridEnabled,
      lowQualityPreviewEnabled: normalized.storage.lowQualityPreviewEnabled,
      edgeStyle: normalized.storage.edgeStyle,
    },
  }
}

export function fromWorkspaceConfigFile(configFile: WorkspaceConfigFile | null | undefined): ApiConfig | null {
  if (!configFile) {
    return null
  }

  return normalizeConfig({
    model: configFile.model,
    customModels: configFile.customModels.map((model) => ({
      ...model,
      testStatus: 'idle',
      testMessage: '',
      lastTestedAt: null,
    })),
    providerProfiles: configFile.providerProfiles?.map((profile) => ({
      ...profile,
      testStatus: 'idle',
      testMessage: '',
      lastTestedAt: null,
    })),
    activeProviderProfileIds: configFile.activeProviderProfileIds,
    modelProviderProfileIds: configFile.modelProviderProfileIds,
    storage: {
      autosaveIntervalMs: configFile.storage?.autosaveIntervalMs,
      canvasTopBarCollapsed: configFile.storage?.canvasTopBarCollapsed,
      alignmentGuidesEnabled: configFile.storage?.alignmentGuidesEnabled,
      themeMode: configFile.storage?.themeMode,
      canvasPerformanceMode: configFile.storage?.canvasPerformanceMode,
      canvasGridEnabled: configFile.storage?.canvasGridEnabled,
      lowQualityPreviewEnabled: configFile.storage?.lowQualityPreviewEnabled,
      edgeStyle: configFile.storage?.edgeStyle,
      workspaceConfigured: false,
      workspaceDirectoryName: '',
    },
  })
}
