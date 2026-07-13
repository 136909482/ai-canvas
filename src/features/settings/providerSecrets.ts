import type { WorkspaceConfigFile } from '@/types'

export const REDACTED_PROVIDER_SECRET = ''

export function redactWorkspaceConfigSecrets(config: WorkspaceConfigFile): WorkspaceConfigFile {
  return {
    ...config,
    providerProfiles: config.providerProfiles?.map((profile) => ({
      ...profile,
      apiKey: REDACTED_PROVIDER_SECRET,
    })),
  }
}

export function redactWorkspaceConfigSecretsForCache(config: WorkspaceConfigFile) {
  return redactWorkspaceConfigSecrets(config)
}

export function hasWorkspaceConfigSecrets(config: WorkspaceConfigFile | null | undefined) {
  return Boolean(config?.providerProfiles?.some((profile) => profile.apiKey.trim().length > 0))
}
