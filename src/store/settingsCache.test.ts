import {
  readLegacyPersistedConfig,
  readWorkspaceConfigCache,
  writeWorkspaceConfigCache,
} from './settingsCache.ts'
import type { WorkspaceConfigFile } from '../types/index.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

function createWorkspaceConfig(): WorkspaceConfigFile {
  return {
    version: 1,
    model: 'image-model',
    customModels: [{
      id: 'model-entry',
      name: 'Image Model',
      modelId: 'image-model',
      kind: 'image',
      enabled: true,
    }],
    providerProfiles: [{
      id: 'provider-entry',
      name: 'Provider',
      kind: 'image',
      apiKey: 'workspace-secret',
      apiUrl: 'https://example.com/v1',
      provider: 'openai',
      requestMode: 'sync',
      asyncConfig: null,
      enabled: true,
    }],
    activeProviderProfileIds: { image: 'provider-entry' },
    modelProviderProfileIds: { 'image-model': 'provider-entry' },
    storage: {
      autosaveIntervalMs: 60_000,
      canvasTopBarCollapsed: false,
      alignmentGuidesEnabled: true,
      themeMode: 'dark',
      canvasPerformanceMode: 'quality',
      canvasGridEnabled: true,
      edgeStyle: 'animated',
      lowQualityPreviewEnabled: true,
    },
  }
}

function runSettingsCacheTests() {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const localStorage = new MemoryStorage()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage },
  })

  try {
    const workspaceConfig = createWorkspaceConfig()
    writeWorkspaceConfigCache(workspaceConfig)

    const cachedConfig = readWorkspaceConfigCache()
    assert(cachedConfig?.providerProfiles?.[0]?.apiKey === '', 'workspace cache should redact provider API keys')
    assert(workspaceConfig.providerProfiles?.[0]?.apiKey === 'workspace-secret', 'cache writes should not mutate workspace config')

    localStorage.setItem('ai-canvas-settings', JSON.stringify({
      state: {
        config: {
          apiKey: 'legacy-secret',
          apiUrl: 'https://legacy.example.com/v1',
          model: 'legacy-model',
        },
      },
    }))

    const legacyConfig = readLegacyPersistedConfig()
    assert(legacyConfig?.model === 'legacy-model', 'legacy Zustand settings envelope should still hydrate')
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow)
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
}

runSettingsCacheTests()
