import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { testImageModelConnection } from '@/api/testImageModel'
import { testChatModelConnection } from '@/api/testChatModel'
import {
  getModelDeleteErrorFeedback,
  getModelDeleteSuccessFeedback,
  getModelSaveErrorFeedback,
  getModelSaveSuccessFeedback,
} from '@/features/settings/modelFeedback'
import {
  getModelDraftValidationMessage,
  getProviderProfileValidationMessage,
  PROVIDER_CONFIG_MESSAGES,
} from '@/features/settings/providerConfig'
import { isClaudeModel } from '@/features/settings/modelBrand'
import { ClaudeIcon } from '@/components/icons/ClaudeIcon'
import { useFeedbackStore } from '@/store/useFeedbackStore'
import { useDiagnosticsStore } from '@/store/useDiagnosticsStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useSettingsDialogStore } from '@/store/useSettingsDialogStore'
import { useWorkspaceSearchStore } from '@/store/useWorkspaceSearchStore'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { StorageSettingsPanel } from '@/components/StorageSettingsDialog'
import { TaskQueueButton } from '@/components/TaskQueueButton'
import { themeClasses } from '@/styles/themeClasses'
import type { CanvasPerformanceMode, CustomModelKind, EdgeStyle, ThemeMode } from '@/types'
import {
  API_URL_HELP_TEXT,
  CANVAS_EXPERIENCE_TEXT,
  CANVAS_OPTION_BUTTON_CLASS,
  CANVAS_OPTION_GROUP_CLASS,
  CANVAS_PERFORMANCE_OPTIONS,
  CANVAS_SETTINGS_ROW_CLASS,
  type DraftModelCard,
  type DraftProviderProfile,
  EDGE_STYLE_OPTIONS,
  FIELD_INPUT_CLASS,
  FIELD_SELECT_CLASS,
  MODEL_NAME_LABEL,
  MODEL_SETTINGS_PANEL_CLASS,
  MODEL_TAB_ICONS,
  MODEL_TABS,
  READONLY_FIELD_CLASS,
  SETTINGS_CATEGORIES,
  SWITCH_OPTION_CLASS,
  THEME_MODE_OPTIONS,
  UI_TEXT,
  createEmptyDraft,
  createEmptyProviderDraft,
  cx,
  formatAsyncConfigJson,
  formatTimestamp,
  getKindLabel,
  getProviderLabel,
  getStatusTone,
  sanitizeDraftModel,
  sanitizeProviderProfile,
  toDraftModel,
  toDraftProviderProfile,
} from '@/components/toolbar/settingsModel'
import { DetailRow, TopChromeIconButton } from '@/components/toolbar/settingsComponents'

interface ToolbarProps {
  leftSlot?: ReactNode
  rightSlot?: ReactNode
}

export function Toolbar({ leftSlot, rightSlot }: ToolbarProps) {
  const {
    config,
    saveCustomModel,
    deleteCustomModel,
    saveProviderProfile,
    deleteProviderProfile,
    setModelProviderProfile,
    setDefaultModel,
    setStorageSettings,
    persistWorkspaceConfig,
  } = useSettingsStore(useShallow((state) => ({
    config: state.config,
    saveCustomModel: state.saveCustomModel,
    deleteCustomModel: state.deleteCustomModel,
    saveProviderProfile: state.saveProviderProfile,
    deleteProviderProfile: state.deleteProviderProfile,
    setModelProviderProfile: state.setModelProviderProfile,
    setDefaultModel: state.setDefaultModel,
    setStorageSettings: state.setStorageSettings,
    persistWorkspaceConfig: state.persistWorkspaceConfig,
  })))
  const notify = useFeedbackStore((state) => state.notify)
  const confirm = useFeedbackStore((state) => state.confirm)
  const openDiagnostics = useDiagnosticsStore((state) => state.open)
  const diagnosticCount = useDiagnosticsStore((state) => state.diagnostics.length)
  const openWorkspaceSearch = useWorkspaceSearchStore((state) => state.open)
  const showSettings = useSettingsDialogStore((state) => state.isOpen)
  const activeCategory = useSettingsDialogStore((state) => state.activeCategory)
  const openSettings = useSettingsDialogStore((state) => state.open)
  const closeSettings = useSettingsDialogStore((state) => state.close)
  const setActiveCategory = useSettingsDialogStore((state) => state.setActiveCategory)
  const [draftModels, setDraftModels] = useState<DraftModelCard[]>([])
  const [draftProviderProfiles, setDraftProviderProfiles] = useState<DraftProviderProfile[]>([])
  const [draftModelProviderProfileIds, setDraftModelProviderProfileIds] = useState<Record<string, string>>({})
  const [draftAsyncConfigText, setDraftAsyncConfigText] = useState<Record<string, string>>({})
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({})
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<CustomModelKind>('image')
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [editingAsyncProviderId, setEditingAsyncProviderId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const savedModels = config.customModels
  const savedProviderProfiles = config.providerProfiles

  const visibleDraftModels = draftModels.filter((model) => {
    if (model.kind !== activeTab) {
      return false
    }

    if (!searchQuery.trim()) {
      return true
    }

    const keyword = searchQuery.trim().toLowerCase()
    return (
      model.modelId.toLowerCase().includes(keyword) ||
      model.name.toLowerCase().includes(keyword) ||
      model.kind.toLowerCase().includes(keyword)
    )
  })

  const visibleProviderProfiles = draftProviderProfiles.filter((profile) => profile.kind === activeTab)

  useEffect(() => {
    if (!showSettings) {
      return
    }

    setDraftModels(savedModels.map(toDraftModel))
    const nextProviderProfiles = savedProviderProfiles.map(toDraftProviderProfile)
    setDraftProviderProfiles(nextProviderProfiles)
    setDraftModelProviderProfileIds(config.modelProviderProfileIds)
    setDraftAsyncConfigText(Object.fromEntries(nextProviderProfiles.map((profile) => [profile.id, formatAsyncConfigJson(profile)])))
    setSearchQuery('')
  }, [config.modelProviderProfileIds, savedModels, savedProviderProfiles, showSettings])

  useEffect(() => {
    if (!showSettings || activeCategory !== 'models') {
      return
    }

    if (visibleDraftModels.length === 0) {
      setSelectedModelId(null)
      return
    }

    const stillVisible = visibleDraftModels.some((model) => model.id === selectedModelId)
    if (!stillVisible) {
      setSelectedModelId(visibleDraftModels[0].id)
    }
  }, [activeCategory, showSettings, visibleDraftModels, selectedModelId])

  useEffect(() => {
    if (!showSettings || activeCategory !== 'models') {
      return
    }

    const visibleProviders = draftProviderProfiles.filter((profile) => profile.kind === activeTab)
    if (visibleProviders.length === 0) {
      setSelectedProviderId(null)
      return
    }

    const selectedModel = draftModels.find((model) => model.id === selectedModelId)
    const modelProviderId = selectedModel ? draftModelProviderProfileIds[selectedModel.modelId] : undefined
    const resolvedProviderId = modelProviderId ?? config.activeProviderProfileIds[activeTab] ?? visibleProviders[0]?.id ?? null
    const stillVisible = visibleProviders.some((profile) => profile.id === selectedProviderId)
    if (!stillVisible || (resolvedProviderId && selectedProviderId !== resolvedProviderId)) {
      setSelectedProviderId(resolvedProviderId)
    }
  }, [activeCategory, activeTab, config.activeProviderProfileIds, draftModelProviderProfileIds, draftModels, draftProviderProfiles, selectedModelId, selectedProviderId, showSettings])

  const selectedModel = draftModels.find((model) => model.id === selectedModelId) ?? null
  const selectedProvider = draftProviderProfiles.find((profile) => profile.id === selectedProviderId)
    ?? (selectedModel ? visibleProviderProfiles.find((profile) => profile.id === draftModelProviderProfileIds[selectedModel.modelId]) : undefined)
    ?? visibleProviderProfiles.find((profile) => profile.id === config.activeProviderProfileIds[activeTab])
    ?? visibleProviderProfiles[0]
    ?? null

  const openSettingsPanel = () => {
    openSettings('models')
  }

  const closeSettingsPanel = () => {
    closeSettings()
    setDraftModels([])
    setDraftProviderProfiles([])
    setDraftModelProviderProfileIds({})
    setDraftAsyncConfigText({})
    setSelectedModelId(null)
    setSelectedProviderId(null)
    setEditingAsyncProviderId(null)
    setSearchQuery('')
  }

  const settingsDialogRef = useDialogFocus<HTMLDivElement>(showSettings, closeSettingsPanel)
  const asyncConfigDialogRef = useDialogFocus<HTMLDivElement>(
    Boolean(showSettings && editingAsyncProviderId),
    () => setEditingAsyncProviderId(null),
  )

  const updateDraft = (id: string, patch: Partial<DraftModelCard>) => {
    setDraftModels((current) =>
      current.map((model) =>
        model.id === id
          ? sanitizeDraftModel({
            ...model,
            ...patch,
          })
          : model,
      ),
    )

    if (patch.kind) {
      setActiveTab(patch.kind)
    }
  }

  const updateSelectedModelProvider = (model: DraftModelCard, profileId: string | null) => {
    setSelectedProviderId(profileId)
    setDraftModelProviderProfileIds((current) => {
      const next = { ...current }
      if (profileId) {
        next[model.modelId] = profileId
      } else {
        delete next[model.modelId]
      }
      return next
    })
  }

  const updateSelectedModelId = (model: DraftModelCard, modelId: string) => {
    const nextModelId = modelId.trim()
    updateDraft(model.id, { modelId })
    setDraftModelProviderProfileIds((current) => {
      const existingProfileId = current[model.modelId]
      if (!existingProfileId || !nextModelId || nextModelId === model.modelId) {
        return current
      }

      const next = { ...current }
      delete next[model.modelId]
      next[nextModelId] = existingProfileId
      return next
    })
  }

  const updateProviderDraft = (id: string, patch: Partial<DraftProviderProfile>) => {
    setDraftProviderProfiles((current) =>
      current.map((profile) =>
        profile.id === id
          ? sanitizeProviderProfile({
            ...profile,
            ...patch,
          })
          : profile,
      ),
    )

    if (patch.kind) {
      setActiveTab(patch.kind)
    }
  }

  const updateProviderAsyncConfigJson = (id: string, value: string) => {
    setDraftAsyncConfigText((current) => ({
      ...current,
      [id]: value,
    }))

    try {
      const parsed = JSON.parse(value) as DraftProviderProfile['asyncConfig']
      updateProviderDraft(id, {
        asyncConfig: parsed,
        testStatus: 'idle',
        testMessage: '',
      })
    } catch (error) {
      updateProviderDraft(id, {
        testStatus: 'error',
        testMessage: `高级异步配置 JSON 格式无效：${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  const handleAddModel = () => {
    const nextModel = createEmptyDraft(activeTab)
    setDraftModels((current) => [...current, nextModel])
    setSelectedModelId(nextModel.id)
    setSearchQuery('')
  }

  const handleAddProvider = () => {
    const nextProfile = createEmptyProviderDraft(activeTab)
    const currentModel = draftModels.find((model) => model.id === selectedModelId && model.kind === activeTab)
    setDraftProviderProfiles((current) => [...current, nextProfile])
    setDraftAsyncConfigText((current) => ({
      ...current,
      [nextProfile.id]: formatAsyncConfigJson(nextProfile),
    }))
    if (currentModel) {
      setDraftModelProviderProfileIds((current) => ({
        ...current,
        [currentModel.modelId]: nextProfile.id,
      }))
    }
    setSelectedProviderId(nextProfile.id)
  }

  const handleDeleteModel = async (id: string) => {
    const deletedModel = draftModels.find((model) => model.id === id)
    const deletedModelName = deletedModel?.name || deletedModel?.modelId || ''
    let nextSelectedId: string | null = null

    setDraftModels((current) => {
      const filtered = current.filter((model) => model.id !== id)
      const nextVisible = filtered.filter((model) => model.kind === activeTab)
      nextSelectedId = nextVisible[0]?.id ?? null
      return filtered
    })

    setSelectedModelId((current) => (current === id ? nextSelectedId : current))
    deleteCustomModel(id)
    try {
      await persistWorkspaceConfig()
      notify(getModelDeleteSuccessFeedback(deletedModelName))
    } catch {
      notify(getModelDeleteErrorFeedback(deletedModelName))
    }
  }

  const handleTestModel = async (model: DraftModelCard, providerProfile: DraftProviderProfile | null) => {
    const sanitized = sanitizeDraftModel(model)
    const validationMessage = getModelDraftValidationMessage(sanitized)
    const sanitizedProvider = providerProfile ? sanitizeProviderProfile(providerProfile) : null
    const providerValidationMessage = sanitizedProvider
      ? getProviderProfileValidationMessage(sanitizedProvider)
      : PROVIDER_CONFIG_MESSAGES.emptyProviderProfile

    if (validationMessage || providerValidationMessage) {
      updateDraft(model.id, {
        testStatus: 'error',
        testMessage: validationMessage || providerValidationMessage,
        lastTestedAt: null,
      })
      return
    }

    if (!sanitizedProvider) {
      return
    }

    if (!['image', 'chat'].includes(sanitized.kind)) {
      updateDraft(model.id, {
        testStatus: 'error',
        testMessage: UI_TEXT.unsupportedTest,
        lastTestedAt: null,
      })
      return
    }

    updateDraft(model.id, {
      ...sanitized,
      testStatus: 'testing',
      testMessage: '',
    })

    setPendingId(model.id)

    try {
      const runtimeModel = {
        ...sanitized,
        apiKey: sanitizedProvider.apiKey,
        apiUrl: sanitizedProvider.apiUrl,
        provider: sanitizedProvider.provider,
        requestMode: sanitizedProvider.requestMode,
        asyncConfig: sanitizedProvider.asyncConfig,
      }
      if (sanitized.kind === 'image') {
        await testImageModelConnection(runtimeModel)
      } else {
        await testChatModelConnection(runtimeModel)
      }

      updateDraft(model.id, {
        ...sanitized,
        testStatus: 'success',
        testMessage: sanitized.kind === 'image' ? UI_TEXT.testSuccess : UI_TEXT.testLinkSuccess,
        lastTestedAt: Date.now(),
      })
    } catch (error) {
      updateDraft(model.id, {
        ...sanitized,
        testStatus: 'error',
        testMessage: error instanceof Error ? error.message : String(error),
        lastTestedAt: Date.now(),
      })
    } finally {
      setPendingId(null)
    }
  }

  const handleDeleteProvider = async (id: string) => {
    const deletedProvider = draftProviderProfiles.find((profile) => profile.id === id)
    const deletedProviderName = deletedProvider?.name || ''
    const confirmed = await confirm({
      title: UI_TEXT.deleteProviderConfirmTitle,
      message: deletedProviderName
        ? `${deletedProviderName}：${UI_TEXT.deleteProviderConfirmMessage}`
        : UI_TEXT.deleteProviderConfirmMessage,
      confirmLabel: UI_TEXT.delete,
      cancelLabel: UI_TEXT.close,
      tone: 'danger',
    })

    if (!confirmed) {
      return
    }

    let nextSelectedId: string | null = null

    setDraftProviderProfiles((current) => {
      const filtered = current.filter((profile) => profile.id !== id)
      const nextVisible = filtered.filter((profile) => profile.kind === activeTab)
      nextSelectedId = nextVisible[0]?.id ?? null
      return filtered
    })

    setSelectedProviderId((current) => (current === id ? nextSelectedId : current))
    setDraftModelProviderProfileIds((current) => Object.fromEntries(
      Object.entries(current).filter(([, profileId]) => profileId !== id),
    ))
    deleteProviderProfile(id)
    try {
      await useSettingsStore.getState().persistWorkspaceConfig()
      notify(getModelDeleteSuccessFeedback(deletedProviderName))
    } catch {
      notify(getModelDeleteErrorFeedback(deletedProviderName))
    }
  }

  const handleSaveModel = async (model: DraftModelCard, providerProfile: DraftProviderProfile | null) => {
    const sanitized = sanitizeDraftModel(model)
    const validationMessage = getModelDraftValidationMessage(sanitized)
    const sanitizedProvider = providerProfile ? sanitizeProviderProfile(providerProfile) : null
    const providerValidationMessage = sanitizedProvider
      ? getProviderProfileValidationMessage(sanitizedProvider)
      : PROVIDER_CONFIG_MESSAGES.emptyProviderProfile

    if (validationMessage || providerValidationMessage) {
      updateDraft(model.id, {
        testStatus: 'error',
        testMessage: validationMessage || providerValidationMessage,
      })
      return
    }

    if (!sanitizedProvider) {
      return
    }

    saveCustomModel(sanitized)
    saveProviderProfile(sanitizedProvider)
    setModelProviderProfile(sanitized.modelId, sanitizedProvider.id)
    updateDraft(model.id, sanitized)
    updateProviderDraft(sanitizedProvider.id, sanitizedProvider)
    setDraftModelProviderProfileIds((current) => ({
      ...current,
      [sanitized.modelId]: sanitizedProvider.id,
    }))
    try {
      await useSettingsStore.getState().persistWorkspaceConfig()
      notify(getModelSaveSuccessFeedback(sanitized.name || sanitized.modelId))
    } catch {
      notify(getModelSaveErrorFeedback(sanitized.name || sanitized.modelId))
    }
  }

  const handleToggleAlignmentGuides = async () => {
    setStorageSettings({ alignmentGuidesEnabled: !config.storage.alignmentGuidesEnabled })
    await persistWorkspaceConfig().catch(() => undefined)
  }

  const handleToggleCanvasGrid = async () => {
    setStorageSettings({ canvasGridEnabled: !config.storage.canvasGridEnabled })
    await persistWorkspaceConfig().catch(() => undefined)
  }

  const handleCanvasPerformanceModeChange = async (canvasPerformanceMode: CanvasPerformanceMode) => {
    setStorageSettings({ canvasPerformanceMode })
    await persistWorkspaceConfig().catch(() => undefined)
  }

  const handleEdgeStyleChange = async (edgeStyle: EdgeStyle) => {
    setStorageSettings({ edgeStyle })
    await persistWorkspaceConfig().catch(() => undefined)
  }

  const handleToggleHighQualityPreview = async () => {
    setStorageSettings({ lowQualityPreviewEnabled: !config.storage.lowQualityPreviewEnabled })
    await persistWorkspaceConfig().catch(() => undefined)
  }

  const handleThemeModeChange = async (themeMode: ThemeMode) => {
    setStorageSettings({ themeMode })
    await persistWorkspaceConfig().catch(() => undefined)
  }

  return (
    <>
      {leftSlot ? (
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
          {leftSlot}
        </div>
      ) : null}

      <div role="toolbar" aria-label="应用工具" className={`absolute right-4 top-4 z-10 flex items-center gap-0.5 p-1 ${themeClasses.compactFloatingPanel}`}>
        <TaskQueueButton />
        {rightSlot}
        <TopChromeIconButton
          label={UI_TEXT.settingsTitle}
          onClick={openSettingsPanel}
          icon={<Settings className="h-3.5 w-3.5" />}
        />
      </div>

      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-4 py-6 backdrop-blur-sm">
          <div ref={settingsDialogRef} role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title" tabIndex={-1} className={`grid h-[min(84vh,44rem)] w-[min(94vw,76rem)] overflow-hidden rounded-[16px] md:grid-cols-[13rem_minmax(0,1fr)] ${themeClasses.strongPanel}`}>
            <aside className="flex min-h-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--control-bg)]">
              <div className="border-b border-[var(--border-subtle)] px-4 pb-4 pt-4">
                <h2 id="settings-dialog-title" className={`text-[15px] font-semibold ${themeClasses.textPrimary}`}>{UI_TEXT.settingsTitle}</h2>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
                <div className="space-y-1">
                  {SETTINGS_CATEGORIES.map((category) => {
                    const active = activeCategory === category.id
                    const CategoryIcon = category.Icon

                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => setActiveCategory(category.id)}
                        data-testid={`settings-category-${category.id}`}
                        aria-label={category.label}
                        aria-pressed={active}
                        className={cx(
                          'settings-nav-item group relative w-full overflow-hidden rounded-[10px] border px-3 py-2.5 text-left transition-all duration-200 ease-out',
                          active
                            ? 'is-active border-violet-400/30 bg-violet-400/10 text-[var(--text-primary)] shadow-[0_8px_24px_rgba(139,92,246,0.08)]'
                            : 'border-transparent text-[var(--text-muted)] hover:border-[var(--border-subtle)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-secondary)]',
                        )}
                      >
                        <span className="flex items-center gap-2 text-[13px] font-medium">
                          <span className={cx('transition-colors duration-200', active ? 'text-violet-300' : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]')}>
                            <CategoryIcon className="h-3.5 w-3.5" />
                          </span>
                          {category.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </aside>

            <main className="min-h-0 bg-[var(--panel-bg-strong)]">
              {activeCategory === 'models' ? (
                <section key="models" className="settings-content-enter flex h-full min-h-0 flex-col">
                  <header className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4">
                    <div className="min-w-0">
                      <h2 className={`text-[17px] font-semibold ${themeClasses.textPrimary}`}>
                        {SETTINGS_CATEGORIES.find((category) => category.id === activeCategory)?.label}
                      </h2>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={closeSettingsPanel}
                        aria-label={UI_TEXT.close}
                        className={`${themeClasses.iconButton} h-8 w-8 shrink-0 rounded-[9px]`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </header>

                  <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-5 md:grid-cols-[16rem_minmax(0,1fr)] md:overflow-hidden">
                    <section className={`${MODEL_SETTINGS_PANEL_CLASS} flex min-h-0 flex-col`}>
                      <div className="border-b border-[var(--border-subtle)] px-4 pb-3 pt-4">
                        <h2 className={`text-sm font-semibold ${themeClasses.textPrimary}`}>{UI_TEXT.modelLibrary}</h2>
                        <p className={`mt-1 text-[11px] ${themeClasses.textMuted}`}>
                          {visibleDraftModels.length} {UI_TEXT.itemUnit} {getKindLabel(activeTab)}
                        </p>

                        <div className="mt-3 grid grid-cols-5 gap-1 rounded-[9px] border border-[var(--border-subtle)] bg-[var(--control-bg)] p-1">
                          {MODEL_TABS.map((tab) => {
                            const isActive = activeTab === tab.id
                            const TabIcon = MODEL_TAB_ICONS[tab.id]

                            return (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={cx(
                                  'inline-flex h-7 items-center justify-center rounded-[7px] text-[11px] font-medium transition-all duration-200 ease-out',
                                  isActive
                                    ? 'bg-[var(--control-bg-hover)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-subtle)]'
                                    : 'text-[var(--text-muted)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-secondary)]',
                                )}
                                title={tab.label}
                              >
                                <TabIcon className="h-3.5 w-3.5" />
                              </button>
                            )
                          })}
                        </div>

                        <div className="relative mt-3">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder={UI_TEXT.search}
                            aria-label={UI_TEXT.search}
                            className={`${FIELD_INPUT_CLASS} pl-8 pr-3`}
                          />
                        </div>
                      </div>

                      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--border-subtle)] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5">
                        <div key={`${activeTab}-${searchQuery.trim() ? 'search' : 'all'}`} className="space-y-1">
                          {visibleDraftModels.length === 0 ? (
                            <div className={`flex h-full min-h-32 items-center justify-center rounded-[12px] border border-dashed border-[var(--border-subtle)] bg-[var(--control-bg)] px-4 text-center text-xs leading-5 ${themeClasses.textMuted}`}>
                              {searchQuery.trim() ? UI_TEXT.emptySearch : UI_TEXT.emptyTab}
                            </div>
                          ) : (
                            visibleDraftModels.map((model) => {
                              const isActive = model.id === selectedModelId
                              const showClaudeIcon = isClaudeModel(model)
                              return (
                                <button
                                  key={model.id}
                                  type="button"
                                  onClick={() => setSelectedModelId(model.id)}
                                  aria-pressed={isActive}
                                  className={cx(
                                    'w-full rounded-[9px] border px-3 py-2.5 text-left transition-all duration-200 ease-out',
                                    isActive
                                      ? 'border-[var(--border-subtle)] bg-[var(--control-bg-hover)]'
                                      : 'border-transparent bg-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--control-bg-hover)]',
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 flex-1 items-center gap-2">
                                      {showClaudeIcon ? <ClaudeIcon className="h-3.5 w-3.5 shrink-0" /> : null}
                                      <div className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                                        {model.name || model.modelId || 'New Model'}
                                      </div>
                                    </div>

                                    <span className={cx('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', getStatusTone(model.testStatus, isActive))} />
                                  </div>
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>

                      <div className="border-t border-[var(--border-subtle)] p-3">
                        <button
                          type="button"
                          onClick={handleAddModel}
                          className={`${themeClasses.secondaryButton} h-8 w-full gap-1.5 rounded-[9px] text-xs font-medium`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {UI_TEXT.addModel}
                        </button>
                      </div>
                    </section>

                    {selectedModel ? (
                      <section key={selectedModel.id} className={`${MODEL_SETTINGS_PANEL_CLASS} settings-content-enter flex min-h-0 flex-col`}>
                        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-3">
                          <div className="min-w-0">
                            <h2 className={`mt-1 flex min-w-0 items-center gap-2 text-[17px] font-semibold ${themeClasses.textPrimary}`}>
                              {isClaudeModel(selectedModel) ? <ClaudeIcon className="h-4 w-4 shrink-0" /> : null}
                              {selectedModel.name || selectedModel.modelId || UI_TEXT.modelDetails}
                            </h2>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              void handleDeleteModel(selectedModel.id)
                            }}
                            className={`${themeClasses.iconButton} h-8 w-8 shrink-0 rounded-[9px]`}
                            aria-label={UI_TEXT.delete}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="flex min-h-0 flex-1 overflow-y-auto px-5 py-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--border-subtle)] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5">
                    <div key={`${activeTab}-${selectedModel.id}-${selectedProvider?.id ?? 'no-provider'}`} className="mx-auto grid min-h-full w-full max-w-4xl grid-rows-[repeat(6,minmax(0,auto))] overflow-hidden rounded-[10px] border border-[var(--border-subtle)] bg-[var(--control-bg)]">
                        <DetailRow label={MODEL_NAME_LABEL} hint="给模型起一个更容易识别的名字。">
                          <input
                            type="text"
                            value={selectedModel.name}
                            onChange={(event) => updateDraft(selectedModel.id, { name: event.target.value })}
                            placeholder="Flux Pro / 豆包绘图"
                            aria-label={MODEL_NAME_LABEL}
                            className={FIELD_INPUT_CLASS}
                          />
                        </DetailRow>

                        <DetailRow label={UI_TEXT.modelKind} hint="决定它出现在哪个模型分类里。">
                          <div className="grid h-8.5 grid-cols-5 gap-1 rounded-[9px] border border-[var(--border-subtle)] bg-[var(--control-bg)] p-1">
                            {MODEL_TABS.map((tab) => (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() => updateDraft(selectedModel.id, { kind: tab.id })}
                                aria-pressed={selectedModel.kind === tab.id}
                                className={cx(
                                  'inline-flex items-center justify-center rounded-[7px] text-[11px] font-medium transition',
                                  selectedModel.kind === tab.id
                                    ? 'bg-[var(--control-bg-hover)] text-[var(--text-primary)]'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                                )}
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>
                        </DetailRow>

                        <DetailRow label={UI_TEXT.modelId} hint="服务商实际识别的模型 ID。">
                          <input
                            type="text"
                            value={selectedModel.modelId}
                            onChange={(event) => updateSelectedModelId(selectedModel, event.target.value)}
                            placeholder="new-model-id"
                            aria-label={UI_TEXT.modelId}
                            className={FIELD_INPUT_CLASS}
                          />
                        </DetailRow>
                        <DetailRow label={UI_TEXT.providerProfile} hint="同一个模型 ID 会使用当前选中的服务商接口发起请求。">
                          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
                            <select
                              value={selectedProvider?.id ?? ''}
                              onChange={(event) => updateSelectedModelProvider(selectedModel, event.target.value || null)}
                              className={FIELD_SELECT_CLASS}
                              aria-label={UI_TEXT.providerProfile}
                            >
                              {visibleProviderProfiles.map((profile) => (
                                <option key={profile.id} value={profile.id} className="bg-[var(--panel-bg-strong)] text-[var(--text-primary)]">
                                  {profile.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={handleAddProvider}
                              className={`${themeClasses.secondaryButton} h-8.5 shrink-0 whitespace-nowrap rounded-[9px] px-3 text-xs font-medium`}
                            >
                              {UI_TEXT.addProvider}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedProvider) {
                                  void handleDeleteProvider(selectedProvider.id)
                                }
                              }}
                              disabled={!selectedProvider}
                              className={`${themeClasses.iconButton} h-8.5 w-8.5 shrink-0 rounded-[9px] text-red-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40`}
                              aria-label={UI_TEXT.deleteProvider}
                              title={UI_TEXT.deleteProvider}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </DetailRow>

                        {selectedProvider ? (
                          <>
                            <DetailRow label={MODEL_NAME_LABEL} hint="给服务商接口起一个方便识别的名字。">
                              <input
                                type="text"
                                value={selectedProvider.name}
                                onChange={(event) => updateProviderDraft(selectedProvider.id, { name: event.target.value })}
                                placeholder="OpenAI / Code0 / 阿里百炼"
                                aria-label="服务商显示名称"
                                className={FIELD_INPUT_CLASS}
                              />
                            </DetailRow>

                            <DetailRow label={UI_TEXT.apiKey} hint="用于连接服务商接口的访问密钥。">
                              <div className="space-y-1.5">
                                <div className="relative">
                                  <input
                                    type={showApiKeys[selectedProvider.id] ? 'text' : 'password'}
                                    value={selectedProvider.apiKey}
                                    onChange={(event) => updateProviderDraft(selectedProvider.id, { apiKey: event.target.value })}
                                    placeholder="sk-..."
                                    aria-label={UI_TEXT.apiKey}
                                    className={cx(FIELD_INPUT_CLASS, 'pr-10')}
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setShowApiKeys((current) => ({
                                        ...current,
                                        [selectedProvider.id]: !current[selectedProvider.id],
                                      }))
                                    }
                                    className="absolute right-1.5 top-1/2 inline-flex h-6.5 w-6.5 -translate-y-1/2 items-center justify-center rounded-[7px] text-[var(--text-muted)] transition-colors hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-secondary)]"
                                    aria-label={showApiKeys[selectedProvider.id] ? '隐藏 API Key' : '显示 API Key'}
                                    aria-pressed={Boolean(showApiKeys[selectedProvider.id])}
                                  >
                                    {showApiKeys[selectedProvider.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                  </button>
                                </div>
                                <p className={`text-[11px] leading-4 ${themeClasses.textMuted}`}>
                                  密钥随工作区配置保存，浏览器配置缓存会自动移除密钥。
                                </p>
                              </div>
                            </DetailRow>

                            <DetailRow label={UI_TEXT.apiUrl} hint={API_URL_HELP_TEXT}>
                              <input
                                type="text"
                                value={selectedProvider.apiUrl}
                                onChange={(event) => updateProviderDraft(selectedProvider.id, { apiUrl: event.target.value })}
                                placeholder="https://your-api-endpoint.com"
                                aria-label={UI_TEXT.apiUrl}
                                className={FIELD_INPUT_CLASS}
                              />
                            </DetailRow>
                            <DetailRow label={UI_TEXT.provider} hint="系统会根据 API 请求地址自动判断。">
                              <div className={READONLY_FIELD_CLASS}>
                                {getProviderLabel(selectedProvider) || UI_TEXT.pendingApiUrl}
                              </div>
                            </DetailRow>

                            <DetailRow
                              label={UI_TEXT.requestMode}
                              hint={UI_TEXT.requestModeHint}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="grid h-8.5 w-56 grid-cols-2 gap-1 rounded-[9px] border border-[var(--border-subtle)] bg-[var(--control-bg)] p-1">
                                  {(['sync', 'async'] as const).map((mode) => (
                                    <button
                                      key={mode}
                                      type="button"
                                      onClick={() =>
                                        updateProviderDraft(selectedProvider.id, {
                                          requestMode: mode,
                                        })
                                      }
                                      className={cx(
                                        SWITCH_OPTION_CLASS,
                                        selectedProvider.requestMode === mode
                                          ? 'bg-[var(--control-bg-hover)] text-[var(--text-primary)]'
                                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                                      )}
                                    >
                                      {mode === 'sync' ? UI_TEXT.requestModeSync : UI_TEXT.requestModeAsync}
                                    </button>
                                  ))}
                                </div>
                                {selectedProvider.requestMode === 'async' ? (
                                  <button
                                    type="button"
                                    onClick={() => setEditingAsyncProviderId(selectedProvider.id)}
                                    className={`${themeClasses.secondaryButton} h-8.5 rounded-[9px] px-3 text-xs font-medium`}
                                  >
                                    {UI_TEXT.asyncConfig}
                                  </button>
                                ) : null}
                              </div>
                            </DetailRow>
                          </>
                        ) : null}
                    </div>
                  </div>

                  <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--control-bg)] px-5 py-3">
                    <div
                      className={cx(
                        'min-h-5 text-xs',
                        selectedModel.testStatus === 'success'
                          ? themeClasses.textPrimary
                          : selectedModel.testStatus === 'error'
                            ? 'text-red-600 dark:text-red-200'
                            : themeClasses.textMuted,
                      )}
                    >
                      {selectedModel.testMessage ||
                        (savedModels.some((item) => item.id === selectedModel.id) ? UI_TEXT.saved : UI_TEXT.unsaved)}
                      {selectedModel.lastTestedAt ? ` · ${formatTimestamp(selectedModel.lastTestedAt)}` : ''}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDefaultModel(selectedModel.modelId)
                          void persistWorkspaceConfig().catch(() => undefined)
                        }}
                        disabled={!selectedModel.modelId.trim() || selectedModel.kind !== 'image'}
                        className={`${themeClasses.secondaryButton} h-8 rounded-[9px] px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {UI_TEXT.setDefault}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          void handleTestModel(selectedModel, selectedProvider)
                        }}
                        disabled={pendingId === selectedModel.id}
                        className={`${themeClasses.secondaryButton} inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {pendingId === selectedModel.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        {pendingId === selectedModel.id
                          ? UI_TEXT.testing
                          : selectedModel.kind === 'chat'
                            ? UI_TEXT.testLink
                            : UI_TEXT.test}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          void handleSaveModel(selectedModel, selectedProvider)
                        }}
                        className="h-8 rounded-[9px] bg-[var(--text-primary)] px-3 text-xs font-semibold text-[var(--canvas-bg)] transition hover:opacity-90"
                      >
                        {UI_TEXT.save}
                      </button>
                    </div>
                  </footer>
                  </section>
                ) : (
                  <section className={`${MODEL_SETTINGS_PANEL_CLASS} flex h-full items-center justify-center px-6`}>
                    <div className={`rounded-[12px] border border-dashed border-[var(--border-subtle)] bg-[var(--control-bg)] px-8 py-10 text-center text-sm ${themeClasses.textMuted}`}>
                      {UI_TEXT.emptySelection}
                    </div>
                  </section>
                )}
                </div>
                </section>
              ) : (
                <section key={activeCategory} className="settings-content-enter flex h-full min-h-0 flex-col">
                  <header className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4">
                    <div className="min-w-0">
                      <h2 className={`text-[17px] font-semibold ${themeClasses.textPrimary}`}>
                        {SETTINGS_CATEGORIES.find((category) => category.id === activeCategory)?.label}
                      </h2>
                    </div>

                    <button
                      type="button"
                      onClick={closeSettingsPanel}
                      aria-label={UI_TEXT.close}
                      className={`${themeClasses.iconButton} h-8 w-8 shrink-0 rounded-[9px]`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </header>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--border-subtle)] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5">
                    {activeCategory === 'storage' ? <StorageSettingsPanel active={showSettings && activeCategory === 'storage'} /> : null}
                    {activeCategory === 'canvas' ? (
                      <section className="overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--control-bg)]">
                        <div className={CANVAS_SETTINGS_ROW_CLASS}>
                          <div className="min-w-0">
                            <div className={`truncate text-sm font-medium ${themeClasses.textPrimary}`}>{CANVAS_EXPERIENCE_TEXT.performanceMode}</div>
                            <p className={`mt-1 max-w-2xl truncate text-xs ${themeClasses.textMuted}`}>{CANVAS_EXPERIENCE_TEXT.performanceModeHint}</p>
                          </div>
                          <div className={CANVAS_OPTION_GROUP_CLASS}>
                            {CANVAS_PERFORMANCE_OPTIONS.map((option) => {
                              const active = config.storage.canvasPerformanceMode === option.id

                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => {
                                    void handleCanvasPerformanceModeChange(option.id)
                                  }}
                                  className={cx(
                                    CANVAS_OPTION_BUTTON_CLASS,
                                    active
                                      ? 'bg-[var(--control-bg-hover)] text-[var(--text-primary)]'
                                      : 'text-[var(--text-muted)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-secondary)]',
                                  )}
                                  aria-pressed={active}
                                >
                                  <span className="block truncate">{option.label}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        <div className={CANVAS_SETTINGS_ROW_CLASS}>
                          <div className="min-w-0">
                            <div className={`truncate text-sm font-medium ${themeClasses.textPrimary}`}>{CANVAS_EXPERIENCE_TEXT.canvasGrid}</div>
                            <p className={`mt-1 max-w-2xl truncate text-xs ${themeClasses.textMuted}`}>{CANVAS_EXPERIENCE_TEXT.canvasGridHint}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void handleToggleCanvasGrid()
                            }}
                            className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300 ease-out ${
                              config.storage.canvasGridEnabled
                                ? 'border-violet-300/30 bg-violet-400/24'
                                : 'border-[var(--border-subtle)] bg-[var(--control-bg-hover)]'
                            }`}
                            aria-pressed={config.storage.canvasGridEnabled}
                            aria-label="显示画布网格"
                          >
                            <span
                              className={`absolute left-1 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full shadow-sm transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                config.storage.canvasGridEnabled
                                  ? 'translate-x-[20px] bg-violet-100'
                                  : 'translate-x-0 bg-[var(--text-muted)]'
                              }`}
                            />
                          </button>
                        </div>

                        <div className={CANVAS_SETTINGS_ROW_CLASS}>
                          <div className="min-w-0">
                            <div className={`truncate text-sm font-medium ${themeClasses.textPrimary}`}>{CANVAS_EXPERIENCE_TEXT.lowQualityPreview}</div>
                            <p className={`mt-1 max-w-2xl truncate text-xs ${themeClasses.textMuted}`}>{CANVAS_EXPERIENCE_TEXT.lowQualityPreviewHint}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void handleToggleHighQualityPreview()
                            }}
                            className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300 ease-out ${
                              config.storage.lowQualityPreviewEnabled
                                ? 'border-violet-300/30 bg-violet-400/24'
                                : 'border-[var(--border-subtle)] bg-[var(--control-bg-hover)]'
                            }`}
                            aria-pressed={config.storage.lowQualityPreviewEnabled}
                            aria-label="启用低清晰度交互预览"
                          >
                            <span
                              className={`absolute left-1 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full shadow-sm transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                config.storage.lowQualityPreviewEnabled
                                  ? 'translate-x-[20px] bg-violet-100'
                                  : 'translate-x-0 bg-[var(--text-muted)]'
                              }`}
                            />
                          </button>
                        </div>

                        <div className={CANVAS_SETTINGS_ROW_CLASS}>
                          <div className="min-w-0">
                            <div className={`truncate text-sm font-medium ${themeClasses.textPrimary}`}>{CANVAS_EXPERIENCE_TEXT.alignmentGuides}</div>
                            <p className={`mt-1 max-w-2xl truncate text-xs ${themeClasses.textMuted}`}>{CANVAS_EXPERIENCE_TEXT.alignmentGuidesHint}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void handleToggleAlignmentGuides()
                            }}
                            className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300 ease-out ${
                              config.storage.alignmentGuidesEnabled
                                ? 'border-violet-300/30 bg-violet-400/24'
                                : 'border-[var(--border-subtle)] bg-[var(--control-bg-hover)]'
                            }`}
                            aria-pressed={config.storage.alignmentGuidesEnabled}
                            aria-label="启用对齐参考线"
                          >
                            <span
                              className={`absolute left-1 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full shadow-sm transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                config.storage.alignmentGuidesEnabled
                                  ? 'translate-x-[20px] bg-violet-100'
                                  : 'translate-x-0 bg-[var(--text-muted)]'
                              }`}
                            />
                          </button>
                        </div>

                        <div className={CANVAS_SETTINGS_ROW_CLASS}>
                          <div className="min-w-0">
                            <div className={`truncate text-sm font-medium ${themeClasses.textPrimary}`}>{CANVAS_EXPERIENCE_TEXT.edgeStyle}</div>
                            <p className={`mt-1 max-w-2xl truncate text-xs ${themeClasses.textMuted}`}>{CANVAS_EXPERIENCE_TEXT.edgeStyleHint}</p>
                          </div>
                          <div className={CANVAS_OPTION_GROUP_CLASS}>
                            {EDGE_STYLE_OPTIONS.map((option) => {
                              const active = config.storage.edgeStyle === option.id

                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => {
                                    void handleEdgeStyleChange(option.id)
                                  }}
                                  className={cx(
                                    CANVAS_OPTION_BUTTON_CLASS,
                                    active
                                      ? 'bg-[var(--control-bg-hover)] text-[var(--text-primary)]'
                                      : 'text-[var(--text-muted)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-secondary)]',
                                  )}
                                  aria-pressed={active}
                                >
                                  <span className="block truncate">{option.label}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        <div className={CANVAS_SETTINGS_ROW_CLASS}>
                          <div className="min-w-0">
                            <div className={`truncate text-sm font-medium ${themeClasses.textPrimary}`}>{CANVAS_EXPERIENCE_TEXT.appearanceTheme}</div>
                            <p className={`mt-1 max-w-2xl truncate text-xs ${themeClasses.textMuted}`}>{CANVAS_EXPERIENCE_TEXT.appearanceThemeHint}</p>
                          </div>
                          <div className={CANVAS_OPTION_GROUP_CLASS}>
                            {THEME_MODE_OPTIONS.map((option) => {
                              const active = config.storage.themeMode === option.id

                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => {
                                    void handleThemeModeChange(option.id)
                                  }}
                                  className={cx(
                                    CANVAS_OPTION_BUTTON_CLASS,
                                    active
                                      ? 'bg-[var(--control-bg-hover)] text-[var(--text-primary)]'
                                      : 'text-[var(--text-muted)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-secondary)]',
                                  )}
                                  aria-pressed={active}
                                >
                                  {option.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </section>
                    ) : null}
                    {activeCategory === 'appearance' ? (
                      <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--control-bg)] p-5">
                        <div className={`text-sm font-medium ${themeClasses.textPrimary}`}>主题入口保持在画布左上角</div>
                        <p className={`mt-2 text-xs leading-5 ${themeClasses.textMuted}`}>当前版本先保留画布工具区的快速主题切换，这里预留给后续更完整的外观选项。</p>
                      </div>
                    ) : null}
                    {activeCategory === 'tasks' ? (
                      <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--control-bg)] p-5">
                        <div className={`text-sm font-medium ${themeClasses.textPrimary}`}>任务队列设置预留</div>
                        <p className={`mt-2 text-xs leading-5 ${themeClasses.textMuted}`}>当前任务队列会自动恢复排队和远程轮询任务。后续可在这里加入并发、失败重试和完成任务清理策略。</p>
                      </div>
                    ) : null}
                    {activeCategory === 'tools' ? (
                      <section className="overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--control-bg)]">
                        <button
                          type="button"
                          data-testid="open-workspace-search"
                          onClick={() => {
                            closeSettingsPanel()
                            openWorkspaceSearch()
                          }}
                          className="group flex min-h-16 w-full items-center gap-3 border-b border-[var(--border-subtle)] px-4 text-left transition-colors hover:bg-[var(--control-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/60"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-[var(--border-subtle)] bg-[var(--panel-bg-strong)] text-[var(--text-secondary)]">
                            <Search className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-sm font-medium ${themeClasses.textPrimary}`}>全局搜索</span>
                            <span className={`mt-0.5 block text-xs ${themeClasses.textMuted}`}>查找项目、节点文本和工作区资产</span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" />
                        </button>

                        <button
                          type="button"
                          data-testid="open-diagnostics-button"
                          onClick={() => {
                            closeSettingsPanel()
                            openDiagnostics()
                          }}
                          className="group flex min-h-16 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-[var(--control-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/60"
                        >
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-[var(--border-subtle)] bg-[var(--panel-bg-strong)] ${diagnosticCount > 0 ? 'text-red-500 dark:text-red-200' : 'text-[var(--text-secondary)]'}`}>
                            <Activity className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`flex items-center gap-2 text-sm font-medium ${themeClasses.textPrimary}`}>
                              诊断记录
                              {diagnosticCount > 0 ? <span className="rounded-full bg-red-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-red-500 dark:text-red-200">{diagnosticCount}</span> : null}
                            </span>
                            <span className={`mt-0.5 block text-xs ${themeClasses.textMuted}`}>查看会话错误、运行信息和本地审计</span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" />
                        </button>
                      </section>
                    ) : null}
                  </div>
                </section>
              )}
            </main>
          </div>
        </div>
      )}

      {showSettings && editingAsyncProviderId ? (() => {
        const editingProvider = draftProviderProfiles.find((profile) => profile.id === editingAsyncProviderId)
        if (!editingProvider) return null

        return (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm">
            <div ref={asyncConfigDialogRef} role="dialog" aria-modal="true" aria-labelledby="async-config-dialog-title" tabIndex={-1} className={`flex h-[min(78vh,40rem)] w-[min(92vw,44rem)] flex-col overflow-hidden rounded-[14px] ${themeClasses.strongPanel}`}>
              <header className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4">
                <div className="min-w-0">
                  <h2 id="async-config-dialog-title" className={`truncate text-[16px] font-semibold ${themeClasses.textPrimary}`}>{UI_TEXT.asyncConfig}</h2>
                  <p className={`mt-1 truncate text-xs ${themeClasses.textMuted}`}>{editingProvider.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingAsyncProviderId(null)}
                  aria-label={UI_TEXT.close}
                  className={`${themeClasses.iconButton} h-8 w-8 shrink-0 rounded-[9px]`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </header>

              <div className="min-h-0 flex-1 p-5">
                <textarea
                  value={draftAsyncConfigText[editingProvider.id] ?? formatAsyncConfigJson(editingProvider)}
                  onChange={(event) => updateProviderAsyncConfigJson(editingProvider.id, event.target.value)}
                  spellCheck={false}
                  className="h-full w-full resize-none rounded-[10px] border border-[var(--border-subtle)] bg-[var(--control-bg)] px-3 py-3 font-mono text-xs leading-5 text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-violet-400/60 focus:bg-[var(--control-bg-hover)]"
                />
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--control-bg)] px-5 py-3">
                <p className={`min-w-0 flex-1 text-xs leading-5 ${editingProvider.testStatus === 'error' ? 'text-red-500 dark:text-red-200' : themeClasses.textMuted}`}>
                  {editingProvider.testMessage || UI_TEXT.asyncConfigHint}
                </p>
                <button
                  type="button"
                  onClick={() => setEditingAsyncProviderId(null)}
                  className="h-8 rounded-[9px] bg-[var(--text-primary)] px-4 text-xs font-semibold text-[var(--canvas-bg)] transition hover:opacity-90"
                >
                  {UI_TEXT.save}
                </button>
              </footer>
            </div>
          </div>
        )
      })() : null}
    </>
  )
}
