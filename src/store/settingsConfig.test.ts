import {
  fromWorkspaceConfigFile,
  normalizeConfig,
  normalizeProviderAsyncConfig,
  normalizeStorageConfig,
  toWorkspaceConfigFile,
} from './settingsConfig.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function runSettingsConfigTests() {
  const emptyConfig = normalizeConfig()
  assert(emptyConfig.model === '', 'fresh config should not select a built-in model')
  assert(emptyConfig.customModels.length === 0, 'fresh config should not ship built-in models')
  assert(emptyConfig.providerProfiles.length === 0, 'fresh config should not ship provider profiles')

  const explicitEmptyConfig = normalizeConfig({
    model: '',
    customModels: [],
    providerProfiles: [],
  })
  assert(explicitEmptyConfig.customModels.length === 0, 'normalization should preserve an empty model library')
  assert(explicitEmptyConfig.providerProfiles.length === 0, 'normalization should preserve an empty provider library')

  const legacyConfig = normalizeConfig({
    apiKey: 'legacy-key',
    apiUrl: 'https://example.com/v1',
    model: 'legacy-image-model',
  })

  assert(legacyConfig.model === 'legacy-image-model', 'legacy model id should become the default model')
  assert(legacyConfig.customModels[0]?.modelId === 'legacy-image-model', 'legacy model should migrate into custom models')
  assert(legacyConfig.providerProfiles[0]?.apiKey === 'legacy-key', 'legacy API key should migrate into a provider profile')
  assert(legacyConfig.providerProfiles[0]?.provider === 'openai', 'legacy API URL should infer the provider family')

  const asyncConfig = normalizeProviderAsyncConfig({
    enabled: true,
    submitPath: '   ',
    submitQuery: { async: true as unknown as string },
    taskIdPath: ' task.id ',
    pollPath: ' tasks/{task_id} ',
    pollIntervalSeconds: 0,
    statusPath: ' task.status ',
    successValues: [' done ', ''],
    failureValues: [],
    errorPath: ' task.error ',
    imageUrlPaths: [' result.url '],
    b64JsonPaths: [' result.b64 '],
  })

  assert(asyncConfig?.submitPath === 'images/generations', 'blank async submit path should use the default')
  assert(asyncConfig?.submitQuery.async === 'true', 'async query values should normalize to strings')
  assert(asyncConfig?.taskIdPath === 'task.id', 'async task id path should be trimmed')
  assert(asyncConfig?.pollIntervalSeconds === 1, 'async polling interval should be at least one second')
  assert(asyncConfig?.successValues.join(',') === 'done', 'async success values should be trimmed')
  assert(asyncConfig?.failureValues.includes('FAILURE'), 'empty async failure values should use defaults')

  const normalized = normalizeConfig({
    model: 'image-model',
    customModels: [{
      id: 'image-model-entry',
      name: ' Image Model ',
      modelId: 'image-model',
      kind: 'image',
      enabled: true,
      testStatus: 'success',
      testMessage: 'ok',
      lastTestedAt: 123,
    }],
    providerProfiles: [{
      id: 'image-provider',
      name: ' Image Provider ',
      kind: 'image',
      apiKey: 'secret',
      apiUrl: 'https://example.com/v1',
      provider: 'openai',
      requestMode: 'async',
      asyncConfig,
      enabled: true,
      testStatus: 'success',
      testMessage: 'ok',
      lastTestedAt: 123,
    }],
    activeProviderProfileIds: { image: 'image-provider' },
    modelProviderProfileIds: {
      'image-model': 'image-provider',
      missing: 'image-provider',
    },
    storage: {
      autosaveIntervalMs: 1,
      canvasTopBarCollapsed: true,
      alignmentGuidesEnabled: false,
      themeMode: 'light',
      canvasPerformanceMode: 'performance',
      canvasGridEnabled: false,
      edgeStyle: 'solid',
      lowQualityPreviewEnabled: false,
      workspaceDirectoryName: ' workspace ',
      workspaceConfigured: true,
    },
  })

  assert(normalized.storage.autosaveIntervalMs === 15_000, 'autosave interval should respect the minimum')
  assert(normalized.storage.workspaceDirectoryName === 'workspace', 'workspace directory name should be trimmed')
  assert(!('missing' in normalized.modelProviderProfileIds), 'bindings for missing models should be removed')

  const legacyColorfulEdges = normalizeStorageConfig({ edgeStyle: 'colorful' })
  assert(legacyColorfulEdges.edgeStyle === 'step', 'legacy colorful edge style should migrate to step')

  const smoothStepEdges = normalizeStorageConfig({ edgeStyle: 'smoothstep' })
  assert(smoothStepEdges.edgeStyle === 'smoothstep', 'smoothstep edge style should be preserved')

  const workspaceConfig = toWorkspaceConfigFile(normalized)
  assert(workspaceConfig.providerProfiles?.[0]?.apiKey === 'secret', 'workspace config should retain provider secrets')
  assert(!('testStatus' in workspaceConfig.customModels[0]), 'workspace config should omit runtime model test state')
  assert(!('workspaceConfigured' in workspaceConfig.storage), 'workspace config should omit runtime storage state')

  const restored = fromWorkspaceConfigFile(workspaceConfig)
  assert(restored?.customModels[0]?.testStatus === 'idle', 'workspace models should restore with idle test state')
  assert(restored?.providerProfiles[0]?.testStatus === 'idle', 'workspace profiles should restore with idle test state')
  assert(restored?.storage.workspaceConfigured === false, 'workspace runtime status should not hydrate from config files')
  assert(restored?.storage.workspaceDirectoryName === '', 'workspace directory name should come from runtime status')
}

runSettingsConfigTests()
