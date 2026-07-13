import { getProviderDefinition } from '../../config/modelCatalog.ts'
import type {
  ApiConfig,
  CustomImageModelConfig,
  CustomModelKind,
  ProviderProfileConfig,
  RuntimeModelConfig,
} from '../../types'

export const PROVIDER_CONFIG_MESSAGES = {
  emptyModelId: '\u8bf7\u5148\u586b\u5199\u6a21\u578b ID',
  emptyProviderProfile: '\u8bf7\u5148\u9009\u62e9\u670d\u52a1\u5546\u63a5\u53e3',
  modelMissing: '\u5f53\u524d\u4efb\u52a1\u4f7f\u7528\u7684\u6a21\u578b\u4e0d\u5b58\u5728',
  modelDisabled: '\u5f53\u524d\u4efb\u52a1\u4f7f\u7528\u7684\u6a21\u578b\u5df2\u88ab\u7981\u7528',
  providerProfileMissing: '\u5f53\u524d\u6a21\u578b\u5bf9\u5e94\u7684\u670d\u52a1\u5546\u63a5\u53e3\u4e0d\u5b58\u5728',
  providerProfileDisabled: '\u5f53\u524d\u6a21\u578b\u5bf9\u5e94\u7684\u670d\u52a1\u5546\u63a5\u53e3\u5df2\u88ab\u7981\u7528',
  providerKindMismatch: '\u5f53\u524d\u6a21\u578b\u4e0e\u670d\u52a1\u5546\u63a5\u53e3\u7684\u7c7b\u578b\u4e0d\u5339\u914d',
  emptyApiKey: '\u8bf7\u5148\u586b\u5199 API Key',
  emptyApiUrl: '\u8bf7\u5148\u586b\u5199 API \u8bf7\u6c42\u5730\u5740',
} as const

export type ProviderConfigIssueCode = keyof typeof PROVIDER_CONFIG_MESSAGES

export type ProviderConfigField = 'modelId' | 'providerProfile' | 'apiKey' | 'apiUrl'

export interface ProviderConfigDiagnostic {
  code: ProviderConfigIssueCode
  field: ProviderConfigField
  message: string
}

export interface ResolveRuntimeModelConfigOptions {
  modelId?: string | null
  kind?: CustomModelKind
  profileId?: string | null
  requireCredentials?: boolean
  allowProfileFallback?: boolean
}

export type RuntimeModelConfigResolution =
  | {
    ok: true
    model: CustomImageModelConfig
    profile: ProviderProfileConfig
    runtimeConfig: RuntimeModelConfig
  }
  | {
    ok: false
    diagnostic: ProviderConfigDiagnostic
  }

const ISSUE_FIELDS: Record<ProviderConfigIssueCode, ProviderConfigField> = {
  emptyModelId: 'modelId',
  emptyProviderProfile: 'providerProfile',
  modelMissing: 'modelId',
  modelDisabled: 'modelId',
  providerProfileMissing: 'providerProfile',
  providerProfileDisabled: 'providerProfile',
  providerKindMismatch: 'providerProfile',
  emptyApiKey: 'apiKey',
  emptyApiUrl: 'apiUrl',
}

function createDiagnostic(code: ProviderConfigIssueCode): ProviderConfigDiagnostic {
  return {
    code,
    field: ISSUE_FIELDS[code],
    message: PROVIDER_CONFIG_MESSAGES[code],
  }
}

function getTrimmedModelId(modelId?: string | null) {
  return modelId?.trim() ?? ''
}

function getProfileId(profileId?: string | null) {
  const trimmed = profileId?.trim() ?? ''
  return trimmed || null
}

function findModel(config: ApiConfig, modelId: string, kind?: CustomModelKind) {
  return config.customModels.find((model) => (
    model.modelId === modelId
    && (kind ? model.kind === kind : true)
  )) ?? null
}

function findProfile(config: ApiConfig, profileId: string | null) {
  if (!profileId) {
    return null
  }

  return config.providerProfiles.find((profile) => profile.id === profileId) ?? null
}

function findFallbackProfile(config: ApiConfig, model: CustomImageModelConfig, kind: CustomModelKind) {
  const modelProfileId = config.modelProviderProfileIds[model.modelId]
  const modelProfile = findProfile(config, modelProfileId ?? null)

  if (modelProfile?.enabled && modelProfile.kind === kind) {
    return modelProfile
  }

  const activeProfileId = config.activeProviderProfileIds[kind]
  const activeProfile = findProfile(config, activeProfileId ?? null)

  if (activeProfile?.enabled && activeProfile.kind === kind) {
    return activeProfile
  }

  return config.providerProfiles.find((profile) => profile.enabled && profile.kind === kind) ?? null
}

function validateProfileAvailability(profile: ProviderProfileConfig, kind: CustomModelKind) {
  if (profile.kind !== kind) {
    return createDiagnostic('providerKindMismatch')
  }

  if (!profile.enabled) {
    return createDiagnostic('providerProfileDisabled')
  }

  return null
}

export function getProviderConfigIssueMessage(code: ProviderConfigIssueCode) {
  return PROVIDER_CONFIG_MESSAGES[code]
}

export function validateModelDraftLike(model: Pick<CustomImageModelConfig, 'modelId'> | null | undefined) {
  return getTrimmedModelId(model?.modelId) ? null : createDiagnostic('emptyModelId')
}

export function getModelDraftValidationMessage(model: Pick<CustomImageModelConfig, 'modelId'> | null | undefined) {
  return validateModelDraftLike(model)?.message ?? ''
}

export function validateProviderProfileDraft(
  profile: Pick<ProviderProfileConfig, 'apiKey' | 'apiUrl'> | null | undefined,
) {
  if (!profile) {
    return createDiagnostic('emptyProviderProfile')
  }

  if (!profile.apiKey.trim()) {
    return createDiagnostic('emptyApiKey')
  }

  if (!profile.apiUrl.trim()) {
    return createDiagnostic('emptyApiUrl')
  }

  return null
}

export function getProviderProfileValidationMessage(
  profile: Pick<ProviderProfileConfig, 'apiKey' | 'apiUrl'> | null | undefined,
) {
  return validateProviderProfileDraft(profile)?.message ?? ''
}

export function resolveProviderApiUrl(profile: Pick<ProviderProfileConfig, 'apiUrl' | 'provider'>) {
  return profile.apiUrl.trim() || getProviderDefinition(profile.provider).defaultApiUrl
}

export function resolveRuntimeModelConfig(
  config: ApiConfig,
  options: ResolveRuntimeModelConfigOptions,
): RuntimeModelConfigResolution {
  const modelId = getTrimmedModelId(options.modelId)

  if (!modelId) {
    return { ok: false, diagnostic: createDiagnostic('emptyModelId') }
  }

  const model = findModel(config, modelId, options.kind)

  if (!model) {
    return { ok: false, diagnostic: createDiagnostic('modelMissing') }
  }

  if (!model.enabled) {
    return { ok: false, diagnostic: createDiagnostic('modelDisabled') }
  }

  const kind = options.kind ?? model.kind
  const explicitProfileId = getProfileId(options.profileId)
  const explicitProfile = findProfile(config, explicitProfileId)
  const allowProfileFallback = options.allowProfileFallback ?? false
  let profile = explicitProfile

  if (explicitProfileId && !explicitProfile && !allowProfileFallback) {
    return { ok: false, diagnostic: createDiagnostic('providerProfileMissing') }
  }

  if (explicitProfile) {
    const profileDiagnostic = validateProfileAvailability(explicitProfile, kind)
    if (profileDiagnostic && !allowProfileFallback) {
      return { ok: false, diagnostic: profileDiagnostic }
    }
    profile = profileDiagnostic ? null : explicitProfile
  }

  profile ??= findFallbackProfile(config, model, kind)

  if (!profile) {
    return { ok: false, diagnostic: createDiagnostic('providerProfileMissing') }
  }

  const profileDiagnostic = validateProfileAvailability(profile, kind)
  if (profileDiagnostic) {
    return { ok: false, diagnostic: profileDiagnostic }
  }

  if (options.requireCredentials) {
    const credentialsDiagnostic = validateProviderProfileDraft(profile)
    if (credentialsDiagnostic) {
      return { ok: false, diagnostic: credentialsDiagnostic }
    }
  }

  return {
    ok: true,
    model,
    profile,
    runtimeConfig: {
      ...model,
      apiKey: profile.apiKey.trim(),
      apiUrl: resolveProviderApiUrl(profile),
      provider: profile.provider,
      requestMode: profile.requestMode,
      asyncConfig: profile.asyncConfig ?? null,
    },
  }
}
