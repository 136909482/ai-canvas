import { create } from 'zustand'
import { reportDiagnostic } from '@/store/useDiagnosticsStore'
import { platformBridge } from '@/platform'
import type { WorkspacePermissionState, WorkspaceStatus } from '@/platform/types'
import type {
  ApiConfig,
  CustomImageModelConfig,
  CustomModelKind,
  ModelTestStatus,
  ProviderProfileConfig,
  RuntimeModelConfig,
  StorageConfig,
} from '@/types'
import {
  readLegacyPersistedConfig,
  readWorkspaceConfigCache,
  writeWorkspaceConfigCache,
} from './settingsCache'
import {
  fromWorkspaceConfigFile,
  normalizeConfig,
  normalizeCustomModel,
  normalizeProviderProfile,
  toWorkspaceConfigFile,
} from './settingsConfig'

interface SettingsRuntimeState {
  workspaceConfigured: boolean
  workspaceDirectoryName: string
  workspacePermission: WorkspacePermissionState
  hydrated: boolean
  lastLoadError: string | null
  lastSaveError: string | null
}

interface SettingsStore {
  config: ApiConfig
  runtime: SettingsRuntimeState
  setStorageSettings: (patch: Partial<StorageConfig>) => void
  setWorkspaceRuntimeStatus: (status: Pick<WorkspaceStatus, 'configured' | 'directoryName' | 'permission'>) => void
  hydrateFromWorkspace: () => Promise<'workspace' | 'legacy' | 'default'>
  persistWorkspaceConfig: () => Promise<void>
  setDefaultModel: (modelId: string) => void
  saveCustomModel: (model: CustomImageModelConfig) => void
  deleteCustomModel: (id: string) => void
  saveProviderProfile: (profile: ProviderProfileConfig) => void
  deleteProviderProfile: (id: string) => void
  setActiveProviderProfile: (kind: CustomModelKind, profileId: string) => void
  setModelProviderProfile: (modelId: string, profileId: string | null) => void
  setCustomModelTestState: (
    id: string,
    status: ModelTestStatus,
    message: string,
    testedAt?: number | null,
  ) => void
  setProviderProfileTestState: (
    id: string,
    status: ModelTestStatus,
    message: string,
    testedAt?: number | null,
  ) => void
  getCustomModels: () => CustomImageModelConfig[]
  getEnabledCustomModels: (kind?: CustomModelKind) => CustomImageModelConfig[]
  getProviderProfiles: (kind?: CustomModelKind) => ProviderProfileConfig[]
  getActiveProviderProfile: (kind: CustomModelKind) => ProviderProfileConfig | undefined
  getResolvedProviderProfile: (modelId?: string, kind?: CustomModelKind, profileId?: string | null) => ProviderProfileConfig | undefined
  getModelConfig: (modelId?: string, kind?: CustomModelKind, profileId?: string | null) => RuntimeModelConfig | undefined
}

function createDefaultRuntimeState(): SettingsRuntimeState {
  return {
    workspaceConfigured: false,
    workspaceDirectoryName: '',
    workspacePermission: 'prompt',
    hydrated: false,
    lastLoadError: null,
    lastSaveError: null,
  }
}

function normalizeWorkspaceRuntimeStatus(status: Pick<WorkspaceStatus, 'configured' | 'directoryName' | 'permission'>) {
  return {
    workspaceConfigured: status.configured && status.permission !== 'denied',
    workspaceDirectoryName: status.permission === 'denied' ? '' : status.directoryName,
    workspacePermission: status.permission,
  }
}

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
  config: normalizeConfig(),
  runtime: createDefaultRuntimeState(),

  setStorageSettings: (patch) =>
    set((state) => ({
      config: normalizeConfig({
        ...state.config,
        storage: {
          ...state.config.storage,
          ...patch,
          workspaceConfigured: state.config.storage.workspaceConfigured,
          workspaceDirectoryName: state.config.storage.workspaceDirectoryName,
        },
      }),
    })),

  setWorkspaceRuntimeStatus: (status) =>
    set((state) => ({
      config: {
        ...state.config,
        storage: {
          ...state.config.storage,
          ...normalizeWorkspaceRuntimeStatus(status),
        },
      },
      runtime: {
        ...state.runtime,
        ...normalizeWorkspaceRuntimeStatus(status),
      },
    })),

  hydrateFromWorkspace: async () => {
    const legacyConfig = readLegacyPersistedConfig()
    const cachedWorkspaceConfig = readWorkspaceConfigCache()

    try {
      const workspaceConfig = await platformBridge.loadWorkspaceConfig()
      const hydratedConfig = fromWorkspaceConfigFile(workspaceConfig ?? cachedWorkspaceConfig)

      if (workspaceConfig) {
        writeWorkspaceConfigCache(workspaceConfig)
      }

      if (hydratedConfig) {
        set((state) => ({
          config: {
            ...hydratedConfig,
            storage: {
              ...hydratedConfig.storage,
              workspaceConfigured: state.runtime.workspaceConfigured,
              workspaceDirectoryName: state.runtime.workspaceDirectoryName,
            },
          },
          runtime: {
            ...state.runtime,
            hydrated: true,
            lastLoadError: null,
          },
        }))
        return workspaceConfig ? 'workspace' as const : 'default' as const
      }

      if (legacyConfig) {
        const migratedConfig = normalizeConfig(legacyConfig)
        set((state) => ({
          config: {
            ...migratedConfig,
            storage: {
              ...migratedConfig.storage,
              workspaceConfigured: state.runtime.workspaceConfigured,
              workspaceDirectoryName: state.runtime.workspaceDirectoryName,
            },
          },
          runtime: {
            ...state.runtime,
            hydrated: true,
            lastLoadError: null,
          },
        }))

        if (get().runtime.workspaceConfigured) {
          await get().persistWorkspaceConfig()
        }

        return 'legacy' as const
      }

      const defaultConfig = normalizeConfig()
      set((state) => ({
        config: {
          ...defaultConfig,
          storage: {
            ...defaultConfig.storage,
            workspaceConfigured: state.runtime.workspaceConfigured,
            workspaceDirectoryName: state.runtime.workspaceDirectoryName,
          },
        },
        runtime: {
          ...state.runtime,
          hydrated: true,
          lastLoadError: null,
        },
      }))

      return 'default' as const
    } catch (error) {
      const hydratedConfig = fromWorkspaceConfigFile(cachedWorkspaceConfig)

      if (hydratedConfig) {
        set((state) => ({
          config: {
            ...hydratedConfig,
            storage: {
              ...hydratedConfig.storage,
              workspaceConfigured: state.runtime.workspaceConfigured,
              workspaceDirectoryName: state.runtime.workspaceDirectoryName,
            },
          },
          runtime: {
            ...state.runtime,
            hydrated: true,
            lastLoadError: error instanceof Error ? error.message : String(error),
          },
        }))
        return 'default' as const
      }

      const defaultConfig = normalizeConfig()
      set((state) => ({
        config: {
          ...defaultConfig,
          storage: {
            ...defaultConfig.storage,
            workspaceConfigured: state.runtime.workspaceConfigured,
            workspaceDirectoryName: state.runtime.workspaceDirectoryName,
          },
        },
        runtime: {
          ...state.runtime,
          hydrated: true,
          lastLoadError: error instanceof Error ? error.message : String(error),
        },
      }))
      return 'default' as const
    }
  },

  persistWorkspaceConfig: async () => {
    const state = get()
    const workspaceConfig = toWorkspaceConfigFile(state.config)

    writeWorkspaceConfigCache(workspaceConfig)

    if (!state.runtime.workspaceConfigured) {
      set((current) => ({
        runtime: {
          ...current.runtime,
          lastSaveError: null,
        },
      }))
      return
    }

    try {
      await platformBridge.saveWorkspaceConfig(workspaceConfig)
      set((current) => ({
        runtime: {
          ...current.runtime,
          lastSaveError: null,
        },
      }))
    } catch (error) {
      reportDiagnostic({
        area: 'persistence',
        title: '工作区配置保存失败',
        error,
        code: 'WORKSPACE_CONFIG_SAVE_FAILED',
        context: { operation: 'save-config' },
      })
      set((current) => ({
        runtime: {
          ...current.runtime,
          lastSaveError: error instanceof Error ? error.message : String(error),
        },
      }))
      throw error
    }
  },

  setDefaultModel: (modelId) =>
    set((state) => ({
      config: normalizeConfig({
        ...state.config,
        model: modelId,
      }),
    })),

  saveCustomModel: (model) =>
    set((state) => {
      const normalized = normalizeConfig(state.config)
      const nextModel = normalizeCustomModel(model)
      const existingIndex = normalized.customModels.findIndex((item) => item.id === nextModel.id)
      const customModels = existingIndex >= 0
        ? normalized.customModels.map((item, index) => (index === existingIndex ? nextModel : item))
        : [...normalized.customModels, nextModel]

      return {
        config: normalizeConfig({
          ...normalized,
          customModels,
          model:
            normalized.model && customModels.some((item) => item.enabled && item.modelId === normalized.model)
              ? normalized.model
              : nextModel.enabled
                ? nextModel.modelId
                : normalized.model,
        }),
      }
    }),

  deleteCustomModel: (id) =>
    set((state) => {
      const normalized = normalizeConfig(state.config)
      const deletedModel = normalized.customModels.find((model) => model.id === id)
      const customModels = normalized.customModels.filter((model) => model.id !== id)

      return {
        config: normalizeConfig({
          ...normalized,
          customModels,
          modelProviderProfileIds: Object.fromEntries(
            Object.entries(normalized.modelProviderProfileIds).filter(([modelId]) => modelId !== deletedModel?.modelId),
          ),
        }),
      }
    }),

  saveProviderProfile: (profile) =>
    set((state) => {
      const normalized = normalizeConfig(state.config)
      const nextProfile = normalizeProviderProfile(profile)
      const existingIndex = normalized.providerProfiles.findIndex((item) => item.id === nextProfile.id)
      const providerProfiles = existingIndex >= 0
        ? normalized.providerProfiles.map((item, index) => (index === existingIndex ? nextProfile : item))
        : [...normalized.providerProfiles, nextProfile]

      return {
        config: normalizeConfig({
          ...normalized,
          providerProfiles,
          activeProviderProfileIds: {
            ...normalized.activeProviderProfileIds,
            [nextProfile.kind]: normalized.activeProviderProfileIds[nextProfile.kind] ?? nextProfile.id,
          },
        }),
      }
    }),

  deleteProviderProfile: (id) =>
    set((state) => {
      const normalized = normalizeConfig(state.config)
      const providerProfiles = normalized.providerProfiles.filter((profile) => profile.id !== id)

      return {
        config: normalizeConfig({
          ...normalized,
          providerProfiles,
          activeProviderProfileIds: Object.fromEntries(
            Object.entries(normalized.activeProviderProfileIds).filter(([, profileId]) => profileId !== id),
          ) as Partial<Record<CustomModelKind, string>>,
          modelProviderProfileIds: Object.fromEntries(
            Object.entries(normalized.modelProviderProfileIds).filter(([, profileId]) => profileId !== id),
          ),
        }),
      }
    }),

  setActiveProviderProfile: (kind, profileId) =>
    set((state) => ({
      config: normalizeConfig({
        ...state.config,
        activeProviderProfileIds: {
          ...state.config.activeProviderProfileIds,
          [kind]: profileId,
        },
      }),
    })),

  setModelProviderProfile: (modelId, profileId) =>
    set((state) => {
      const normalized = normalizeConfig(state.config)
      const trimmedModelId = modelId.trim()
      const model = normalized.customModels.find((item) => item.modelId === trimmedModelId)
      const profile = profileId
        ? normalized.providerProfiles.find((item) => item.enabled && item.id === profileId && (!model || item.kind === model.kind))
        : null
      const modelProviderProfileIds = { ...normalized.modelProviderProfileIds }

      if (trimmedModelId.length === 0 || !profile) {
        delete modelProviderProfileIds[trimmedModelId]
      } else {
        modelProviderProfileIds[trimmedModelId] = profile.id
      }

      return {
        config: normalizeConfig({
          ...normalized,
          modelProviderProfileIds,
        }),
      }
    }),

  setCustomModelTestState: (id, status, message, testedAt = Date.now()) =>
    set((state) => ({
      config: normalizeConfig({
        ...state.config,
        customModels: state.config.customModels.map((model) =>
          model.id === id
            ? {
                ...model,
                testStatus: status,
                testMessage: message,
                lastTestedAt: testedAt,
              }
            : model,
        ),
      }),
    })),

  setProviderProfileTestState: (id, status, message, testedAt = Date.now()) =>
    set((state) => ({
      config: normalizeConfig({
        ...state.config,
        providerProfiles: state.config.providerProfiles.map((profile) =>
          profile.id === id
            ? {
                ...profile,
                testStatus: status,
                testMessage: message,
                lastTestedAt: testedAt,
              }
            : profile,
        ),
      }),
    })),

  getCustomModels: () => normalizeConfig(get().config).customModels,

  getEnabledCustomModels: (kind) =>
    normalizeConfig(get().config).customModels.filter(
      (model) => model.enabled && (kind ? model.kind === kind : true),
    ),

  getProviderProfiles: (kind) =>
    normalizeConfig(get().config).providerProfiles.filter(
      (profile) => profile.enabled && (kind ? profile.kind === kind : true),
    ),

  getActiveProviderProfile: (kind) => {
    const normalized = normalizeConfig(get().config)
    const activeId = normalized.activeProviderProfileIds[kind]
    return normalized.providerProfiles.find((profile) => profile.enabled && profile.kind === kind && profile.id === activeId)
      ?? normalized.providerProfiles.find((profile) => profile.enabled && profile.kind === kind)
  },

  getResolvedProviderProfile: (modelId, kind, profileId) => {
    const normalized = normalizeConfig(get().config)
    const model = normalized.customModels.find((item) => (
      item.modelId === modelId
      && (kind ? item.kind === kind : true)
    ))
    const resolvedKind = kind ?? model?.kind ?? 'image'
    const modelProfileId = model?.modelId ? normalized.modelProviderProfileIds[model.modelId] : undefined

    return (profileId
      ? normalized.providerProfiles.find((item) => item.enabled && item.id === profileId && item.kind === resolvedKind)
      : undefined)
      ?? (modelProfileId
        ? normalized.providerProfiles.find((item) => item.enabled && item.id === modelProfileId && item.kind === resolvedKind)
        : undefined)
      ?? normalized.providerProfiles.find((item) => item.enabled && item.id === normalized.activeProviderProfileIds[resolvedKind] && item.kind === resolvedKind)
      ?? normalized.providerProfiles.find((item) => item.enabled && item.kind === resolvedKind)
  },

  getModelConfig: (modelId, kind, profileId) => {
    const normalized = normalizeConfig(get().config)
    const model = normalized.customModels.find((item) => (
      item.enabled
      && item.modelId === modelId
      && (kind ? item.kind === kind : true)
    ))
    const profile = get().getResolvedProviderProfile(modelId, kind ?? model?.kind, profileId)

    if (!model || !profile) {
      return undefined
    }

    return {
      ...model,
      apiKey: profile.apiKey,
      apiUrl: profile.apiUrl,
      provider: profile.provider,
      requestMode: profile.requestMode,
      asyncConfig: profile.asyncConfig,
    }
  },
}))
