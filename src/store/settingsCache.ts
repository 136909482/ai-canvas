import { redactWorkspaceConfigSecretsForCache } from '../features/settings/providerSecrets.ts'
import type { ApiConfig, WorkspaceConfigFile } from '../types/index.ts'
import type { LegacyConfigShape } from './settingsConfig.ts'

const LEGACY_SETTINGS_STORAGE_KEY = 'ai-canvas-settings'
const WORKSPACE_CONFIG_CACHE_KEY = 'ai-canvas-workspace-config-cache'

type PersistedSettingsShape = {
  state?: {
    config?: Partial<ApiConfig> | LegacyConfigShape
  }
  config?: Partial<ApiConfig> | LegacyConfigShape
}

export function readLegacyPersistedConfig(): Partial<ApiConfig> | LegacyConfigShape | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  try {
    const raw = window.localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY)
    if (!raw) {
      return undefined
    }

    const parsed = JSON.parse(raw) as PersistedSettingsShape | Partial<ApiConfig> | LegacyConfigShape | null

    if (parsed && typeof parsed === 'object' && 'state' in parsed && parsed.state?.config) {
      return parsed.state.config
    }

    if (parsed && typeof parsed === 'object' && 'config' in parsed) {
      return parsed.config
    }

    return parsed as Partial<ApiConfig> | LegacyConfigShape | undefined
  } catch {
    return undefined
  }
}

export function readWorkspaceConfigCache(): WorkspaceConfigFile | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_CONFIG_CACHE_KEY)
    if (!raw) {
      return null
    }

    return JSON.parse(raw) as WorkspaceConfigFile
  } catch {
    return null
  }
}

export function writeWorkspaceConfigCache(config: WorkspaceConfigFile) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(WORKSPACE_CONFIG_CACHE_KEY, JSON.stringify(redactWorkspaceConfigSecretsForCache(config)))
  } catch {
    // Ignore cache write failures; workspace persistence remains authoritative.
  }
}
