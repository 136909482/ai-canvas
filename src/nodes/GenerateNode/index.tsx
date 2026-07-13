import { memo, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import { Handle, Position, useConnection, useUpdateNodeInternals } from '@xyflow/react'
import { Check, ChevronDown, Clock3, Link2, Loader2, Play, Server, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { CanvasImagePreview } from '@/components/CanvasImagePreview'
import { MAX_GENERATE_REFERENCE_IMAGES } from '@/constants/generateNode'
import { DEFAULT_IMAGE_MODEL_ID } from '@/config/modelCatalog'
import { isGptImageModel } from '@/api/imageAdapter'
import { enqueueGenerateTask } from '@/features/generateQueue/orchestrator'
import { compileImageMentionPrompt } from '@/features/richPrompt/promptCompiler'
import { RichPromptEditor } from '@/features/richPrompt/RichPromptEditor'
import type { RichPromptDocument, RichPromptReferenceItem } from '@/features/richPrompt/types'
import { makeSelectGenerateMaskSourceNode, makeSelectGenerateReferenceSourceNodes, useCanvasStore } from '@/store/useCanvasStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { getWorkspaceAssetThumbnailRelativePath } from '@/utils/workspaceImageAsset'
import { recordComponentRender } from '@/utils/performanceDiagnostics'
import { handleMenuKeyboard } from '@/utils/menuKeyboard'
import { type AppNodeProps } from '@/types'
import { useShallow } from 'zustand/react/shallow'
import { themeClasses } from '@/styles/themeClasses'
import { InlineSelect, type InlineSelectOption } from '../InlineSelect'
import { NodeDeleteButton, NodeHeader, NodeResizerPreset } from '../nodeShell'
import { getNodeShellClassName } from '../nodeShellClassName'
import { areNodeContentPropsEqual } from '../nodePropComparators'
import {
  ModelOptionIcon,
  RatioPreview,
  SettingsSection,
  SettingsSegment,
} from './modelOptions'
import {
  GPT_IMAGE_QUALITIES,
  GPT_IMAGE_QUALITY_LABELS,
  RATIOS,
  RESOLUTIONS,
  getRatioLabel,
  getResolutionLabel,
} from './modelSettings'
import {
  type ReferenceImageItem,
  buildReferenceImageAsset,
  decodeReferenceImageKey,
  encodeReferenceImageKey,
  getReferenceOrderLabel,
} from './referenceImages'

type GenerateNodeProps = AppNodeProps<'generateNode'>

const UI_TEXT = {
  deleteNode: '删除 AI 绘图节点',
  title: 'AI绘图',
  textToImage: '文生图',
  imageToImage: '图生图',
  syncedFromText: '已由文本节点同步',
  placeholder: '输入提示词...',
  chooseModel: '选择模型',
  chooseRatio: '选择画幅',
  chooseResolution: '选择分辨率',
  generate: '生成预览',
  queued: '排队中',
  generating: '生成中',
  generateFailed: '生成失败',
  retry: '重试',
  previewQueued: '已加入生成队列，等待前面的任务完成',
  referenceLimitHint: `最多支持 ${MAX_GENERATE_REFERENCE_IMAGES} 张参考图`,
  maskInput: '蒙版输入',
  maskToggle: '遮罩开关',
  enableMaskInput: '开启蒙版输入',
  disableMaskInput: '关闭蒙版输入',
  maskConnected: '已连接蒙版',
  maskNeedsBaseImage: '使用蒙版重绘需要同时连接原图和蒙版',
  maskUnsupportedModel: '请选择支持蒙版局部编辑的模型',
} as const

export const GenerateNode = memo(function GenerateNode({ id, data, selected }: GenerateNodeProps) {
  recordComponentRender('GenerateNode')
  const isQueued = data.status === 'queued'
  const isGenerating = data.status === 'generating'
  const isBusy = isQueued || isGenerating
  const [hasPromptDraft, setHasPromptDraft] = useState(Boolean((data.prompt || '').trim()))
  const [promptDraft, setPromptDraft] = useState(data.prompt || '')
  const [richPromptDraft, setRichPromptDraft] = useState<RichPromptDocument | null>(data.richPrompt ?? null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [providerMenuOpen, setProviderMenuOpen] = useState(false)
  const latestPromptDraftRef = useRef(promptDraft)
  const latestRichPromptDraftRef = useRef<RichPromptDocument | null>(richPromptDraft)
  const settingsRef = useRef<HTMLDivElement | null>(null)
  const providerMenuRef = useRef<HTMLDivElement | null>(null)
  const providerTriggerRef = useRef<HTMLButtonElement | null>(null)
  const providerListRef = useRef<HTMLDivElement | null>(null)
  const selectReferenceImageKeys = useMemo(() => {
    const selectReferenceSourceNodes = makeSelectGenerateReferenceSourceNodes(id)
    return (state: Parameters<typeof selectReferenceSourceNodes>[0]) => (
      selectReferenceSourceNodes(state).map((node) => encodeReferenceImageKey({
        sourceId: node.id,
        imageUrl: node.data.imageUrl as string,
        thumbnailRelativePath: getWorkspaceAssetThumbnailRelativePath(node.data.imageAsset),
      }))
    )
  }, [id])
  const selectMaskImageKey = useMemo(() => {
    const selectMaskSourceNode = makeSelectGenerateMaskSourceNode(id)
    return (state: Parameters<typeof selectMaskSourceNode>[0]) => {
      const node = selectMaskSourceNode(state)
      return node
        ? encodeReferenceImageKey({
          sourceId: node.id,
          imageUrl: node.data.imageUrl as string,
          thumbnailRelativePath: getWorkspaceAssetThumbnailRelativePath(node.data.imageAsset),
        })
        : ''
    }
  }, [id])
  const referenceImageKeys = useCanvasStore(useShallow(selectReferenceImageKeys))
  const maskImageKey = useCanvasStore(selectMaskImageKey)
  const { updateNodeData, deleteNode, deleteEdgesBySourceTargetExceptHandle, deleteEdgesBySourceTargetHandle } = useCanvasStore(
    useShallow((s) => ({
      updateNodeData: s.updateNodeData,
      deleteNode: s.deleteNode,
      deleteEdgesBySourceTargetExceptHandle: s.deleteEdgesBySourceTargetExceptHandle,
      deleteEdgesBySourceTargetHandle: s.deleteEdgesBySourceTargetHandle,
    })),
  )
  const beginTransaction = useHistoryStore((s) => s.beginTransaction)
  const commitTransaction = useHistoryStore((s) => s.commitTransaction)
  const runTracked = useHistoryStore((s) => s.runTracked)
  const updateNodeInternals = useUpdateNodeInternals()
  const connection = useConnection()
  const isConnecting = connection.inProgress && connection.fromNode?.id === id
  const getModelConfig = useSettingsStore((s) => s.getModelConfig)
  const getResolvedProviderProfile = useSettingsStore((s) => s.getResolvedProviderProfile)
  const getProviderProfiles = useSettingsStore((s) => s.getProviderProfiles)
  const getEnabledCustomModels = useSettingsStore((s) => s.getEnabledCustomModels)
  const setModelProviderProfile = useSettingsStore((s) => s.setModelProviderProfile)
  const allReferenceImages = useMemo<ReferenceImageItem[]>(
    () => referenceImageKeys
      .map(decodeReferenceImageKey)
      .filter((item): item is ReferenceImageItem => Boolean(item)),
    [referenceImageKeys],
  )
  const maskSourceImage = useMemo(() => (
    maskImageKey ? decodeReferenceImageKey(maskImageKey) : null
  ), [maskImageKey])
  const referenceImages = useMemo(
    () => allReferenceImages.slice(0, MAX_GENERATE_REFERENCE_IMAGES),
    [allReferenceImages],
  )
  const richPromptReferences = useMemo<RichPromptReferenceItem[]>(
    () =>
      referenceImages.map((item, index) => ({
        sourceId: item.sourceId,
        imageUrl: item.imageUrl,
        thumbnailRelativePath: item.thumbnailRelativePath,
        label: `图片${index + 1}`,
        order: index + 1,
      })),
    [referenceImages],
  )

  const isConnected = Boolean(data.connectedTextNode)
  const maskInputEnabled = data.maskInputEnabled === true
  const referenceImageUrls = referenceImages.map((item) => item.imageUrl)
  const referenceImageCount = referenceImages.length
  const maskImageUrl = maskInputEnabled && maskSourceImage ? maskSourceImage.imageUrl : ''
  const hasMaskImage = Boolean(maskImageUrl)
  const hasReferenceLimit = allReferenceImages.length >= MAX_GENERATE_REFERENCE_IMAGES
  const generationModeLabel = hasMaskImage ? '局部重绘' : referenceImageCount > 0 ? UI_TEXT.imageToImage : UI_TEXT.textToImage
  const imageModels = getEnabledCustomModels('image')
  const fallbackModelId = imageModels[0]?.modelId ?? DEFAULT_IMAGE_MODEL_ID
  const effectiveModel = imageModels.some((model) => model.modelId === data.model) ? data.model : fallbackModelId
  const isGptImageSettingsModel = isGptImageModel(effectiveModel)
  const selectedModel = getModelConfig(effectiveModel, 'image')
  const selectedProviderProfile = getResolvedProviderProfile(effectiveModel, 'image')
  const providerProfiles = getProviderProfiles('image')
  const providerLabel = selectedProviderProfile?.name?.trim() || selectedModel?.provider || ''
  const modelOptions: InlineSelectOption[] = imageModels.length > 0
    ? imageModels.map((model) => ({
        value: model.modelId,
        label: model.name || model.modelId,
        icon: <ModelOptionIcon model={model} />,
      }))
    : [{ value: effectiveModel, label: effectiveModel }]
  const ratio = data.ratio || '1:1'
  const resolution = RESOLUTIONS.includes(data.resolution) ? data.resolution : '1K'
  const quality = data.quality || 'auto'
  const ratioLabel = getRatioLabel(ratio)
  const resolutionLabel = getResolutionLabel(resolution)
  const settingsSummary = isGptImageSettingsModel
    ? `${ratioLabel} / ${resolutionLabel} / ${GPT_IMAGE_QUALITY_LABELS[quality]}`
    : `${ratioLabel} / ${resolutionLabel}`

  const stopCanvasGesture = (event: SyntheticEvent) => {
    event.stopPropagation()
  }

  const updateRichPromptDraft = (nextPrompt: string, nextRichPrompt: RichPromptDocument | null) => {
    latestPromptDraftRef.current = nextPrompt
    latestRichPromptDraftRef.current = nextRichPrompt
    setPromptDraft(nextPrompt)
    setRichPromptDraft(nextRichPrompt)
    setHasPromptDraft(Boolean(nextPrompt.trim()))
  }

  const syncRichPromptToStore = (nextPrompt: string, nextRichPrompt: RichPromptDocument | null) => {
    if (nextPrompt !== (data.prompt || '') || nextRichPrompt !== (data.richPrompt ?? null)) {
      updateNodeData(id, {
        prompt: nextPrompt,
        richPrompt: nextRichPrompt,
      })
    }
  }

  const toggleMaskInput = () => {
    const nextMaskInputEnabled = !maskInputEnabled
    runTracked(() => {
      if (!nextMaskInputEnabled && maskSourceImage) {
        deleteEdgesBySourceTargetHandle(maskSourceImage.sourceId, id, 'mask')
      }
      updateNodeData(id, {
        maskInputEnabled: nextMaskInputEnabled,
        ...(!nextMaskInputEnabled ? { maskSourceNodeId: null } : {}),
      })
    })
  }

  useEffect(() => {
    updateNodeInternals(id)
  }, [id, maskInputEnabled, updateNodeInternals])

  useEffect(() => {
    if (!settingsOpen && !providerMenuOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (settingsOpen && !settingsRef.current?.contains(target)) {
        setSettingsOpen(false)
      }
      if (providerMenuOpen && !providerMenuRef.current?.contains(target)) {
        setProviderMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [providerMenuOpen, settingsOpen])

  const selectProviderProfile = (profileId: string) => {
    setModelProviderProfile(effectiveModel, profileId)
    closeProviderMenu()
  }

  useEffect(() => {
    if (providerMenuOpen) {
      window.requestAnimationFrame(() => providerListRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
    }
  }, [providerMenuOpen])

  const closeProviderMenu = () => {
    setProviderMenuOpen(false)
    window.requestAnimationFrame(() => providerTriggerRef.current?.focus())
  }

  const handleEnqueue = () => {
    const effectivePromptDraft = isConnected ? data.prompt || '' : promptDraft
    const effectiveRichPromptDraft = isConnected ? data.richPrompt ?? null : richPromptDraft
    const currentPrompt = (effectivePromptDraft || data.prompt || '').trim()
    if (!currentPrompt) {
      return
    }

    if (hasMaskImage && referenceImages.length === 0) {
      updateNodeData(id, { status: 'error', errorMsg: UI_TEXT.maskNeedsBaseImage, model: effectiveModel })
      return
    }

    if (hasMaskImage && selectedModel?.provider !== 'openai') {
      updateNodeData(id, { status: 'error', errorMsg: UI_TEXT.maskUnsupportedModel, model: effectiveModel })
      return
    }

    const compiledPrompt = compileImageMentionPrompt({
      richPrompt: effectiveRichPromptDraft,
      fallbackPrompt: currentPrompt,
      references: richPromptReferences,
    })

    syncRichPromptToStore(currentPrompt, effectiveRichPromptDraft)
    updateNodeData(id, { model: effectiveModel })
    enqueueGenerateTask({
      sourceNodeId: id,
      prompt: compiledPrompt,
      negativePrompt: data.negativePrompt,
      model: effectiveModel,
      ratio: data.ratio || '1:1',
      resolution,
      quality: isGptImageSettingsModel ? quality : null,
      operationType: hasMaskImage ? 'image-edit' : undefined,
      sourceImageNodeId: hasMaskImage ? referenceImages[0]?.sourceId ?? null : null,
      maskImageUrl: hasMaskImage ? maskImageUrl : null,
      referenceImageUrls: hasMaskImage ? referenceImageUrls.slice(1) : referenceImageUrls,
      officialFallback: false,
      googleSearch: false,
      googleImageSearch: false,
    })
  }

  const hasPrompt = isConnected ? Boolean((data.prompt || '').trim()) : hasPromptDraft
  const showStatusText = isQueued
  const statusLabel = UI_TEXT.queued
  const statusDescription = UI_TEXT.previewQueued

  return (
    <div
      data-testid={`node-${id}`}
      className={getNodeShellClassName({ selected })}
    >
      <NodeResizerPreset
        selected={selected}
        minWidth={320}
        minHeight={280}
        maxWidth={720}
        maxHeight={720}
        hideVisuals
      />

      <NodeDeleteButton
        id={id}
        selected={selected}
        ariaLabel={UI_TEXT.deleteNode}
        onDelete={() => runTracked(() => deleteNode(id))}
      />

      <Handle
        type="target"
        position={Position.Left}
        id="prompt"
        className="handle-orb-anchor !w-[18px] !h-[18px] !rounded-full !border-0 !bg-transparent !p-0"
        style={{ top: '50%' }}
        title="提示词 / 参考图输入"
      >
        <span className="handle-orb handle-orb--target">
          <span className="handle-orb__glow" />
          <span className="handle-orb__ring" />
          <span className="handle-orb__dot" />
        </span>
      </Handle>

      {maskInputEnabled ? (
        <Handle
          type="target"
          position={Position.Left}
          id="mask"
          className="handle-orb-anchor !w-[18px] !h-[18px] !rounded-full !border-0 !bg-transparent !p-0"
          style={{ top: '62%' }}
          title={UI_TEXT.maskInput}
        >
          <span className="handle-orb handle-orb--mask">
            <span className="handle-orb__glow" />
            <span className="handle-orb__ring" />
            <span className="handle-orb__dot" />
          </span>
        </Handle>
      ) : null}

      <Handle
        type="source"
        position={Position.Right}
        id="image"
        className="handle-orb-anchor !w-[18px] !h-[18px] !rounded-full !border-0 !bg-transparent !p-0"
      >
        <span className={`handle-orb handle-orb--source ${isConnecting ? 'is-connecting' : ''}`}>
          <span className="handle-orb__glow" />
          <span className="handle-orb__ring" />
          <span className="handle-orb__dot" />
        </span>
      </Handle>

      <NodeHeader
        icon={<Sparkles className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
        title={UI_TEXT.title}
        right={(
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={toggleMaskInput}
              onPointerDown={stopCanvasGesture}
              onMouseDown={stopCanvasGesture}
              className={`nodrag nopan ${themeClasses.nodeBadge} transition ${
                maskInputEnabled
                  ? `${themeClasses.nodeBadgeAmber} hover:border-amber-400/40 hover:bg-amber-400/14`
                  : 'border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-muted)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-secondary)]'
              }`}
              aria-label={maskInputEnabled ? UI_TEXT.disableMaskInput : UI_TEXT.enableMaskInput}
              title={maskInputEnabled ? UI_TEXT.disableMaskInput : UI_TEXT.enableMaskInput}
            >
              {UI_TEXT.maskToggle}
            </button>
            <span
              className={`${themeClasses.nodeBadge} ${themeClasses.nodeBadgeViolet}`}
            >
              <Link2 className="h-3 w-3" />
              {generationModeLabel}
            </span>
            {providerLabel ? (
              <div ref={providerMenuRef} className="relative">
                <button
                  ref={providerTriggerRef}
                  type="button"
                  className={`nodrag nopan ${themeClasses.nodeBadge} max-w-[142px] border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-secondary)] normal-case tracking-normal transition hover:border-[var(--accent-violet-muted)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]`}
                  title={`服务商：${providerLabel}`}
                  aria-label={`切换服务商：${providerLabel}`}
                  aria-haspopup="menu"
                  aria-expanded={providerMenuOpen}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      event.preventDefault()
                      setProviderMenuOpen(true)
                    }
                  }}
                  onPointerDown={stopCanvasGesture}
                  onMouseDown={stopCanvasGesture}
                  onClick={(event) => {
                    stopCanvasGesture(event)
                    setSettingsOpen(false)
                    setProviderMenuOpen((current) => !current)
                  }}
                >
                  <Server className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
                  <span className="min-w-0 truncate">{providerLabel}</span>
                  <ChevronDown className={`h-3 w-3 shrink-0 text-[var(--text-muted)] transition-transform ${providerMenuOpen ? 'rotate-180 text-[var(--accent-violet-strong)]' : ''}`} />
                </button>

                {providerMenuOpen ? (
                  <div
                    ref={providerListRef}
                    className={`nodrag nopan absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden p-1.5 ${themeClasses.nodeToolbarPanel}`}
                    role="menu"
                    aria-label="选择图片服务商"
                    onKeyDown={(event) => handleMenuKeyboard(event.nativeEvent, providerListRef.current, closeProviderMenu)}
                    onPointerDown={stopCanvasGesture}
                    onMouseDown={stopCanvasGesture}
                  >
                    <div className="px-2 pb-1 pt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      服务商
                    </div>
                    <div className="node-menu-scrollbar nowheel flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
                      {providerProfiles.map((profile) => {
                        const isActive = profile.id === selectedProviderProfile?.id
                        return (
                          <button
                            key={profile.id}
                            type="button"
                            className={`flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition ${
                              isActive
                                ? 'bg-[var(--accent-violet-soft)] text-[var(--accent-violet-strong)]'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]'
                            }`}
                            role="menuitemradio"
                            aria-checked={isActive}
                            onClick={(event) => {
                              stopCanvasGesture(event)
                              selectProviderProfile(profile.id)
                            }}
                          >
                            <Server className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                            <span className="min-w-0 flex-1 truncate">{profile.name}</span>
                            {isActive ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2.5">
        {(referenceImageCount > 0 || hasMaskImage || isConnected) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {referenceImageCount > 0 && (
              <div className={themeClasses.nodeAssetStrip}>
                <div className="flex items-center gap-1">
                  {referenceImages.map((referenceImage, index) => (
                    <span
                      key={referenceImage.sourceId}
                      title={`第 ${index + 1} 张参考图`}
                      className={`group/reference-thumb ${themeClasses.nodeAssetThumb}`}
                    >
                      <CanvasImagePreview
                        src={referenceImage.imageUrl}
                        alt=""
                        imageAsset={buildReferenceImageAsset(referenceImage)}
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                      <span className={themeClasses.nodeAssetIndexBadge}>
                        {getReferenceOrderLabel(index + 1)}
                      </span>
                      <button
                        type="button"
                        title="移除这张参考图"
                        aria-label={`移除第 ${index + 1} 张参考图`}
                        data-testid={`disconnect-reference-${referenceImage.sourceId}-${id}`}
                        className={`${themeClasses.nodeAssetRemoveButton} group-hover/reference-thumb:pointer-events-auto group-hover/reference-thumb:opacity-100`}
                        onPointerDown={stopCanvasGesture}
                        onMouseDown={stopCanvasGesture}
                        onClick={(event) => {
                          stopCanvasGesture(event)
                          runTracked(() => deleteEdgesBySourceTargetExceptHandle(referenceImage.sourceId, id, 'mask'))
                        }}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {hasMaskImage && maskSourceImage ? (
              <div className={themeClasses.nodeAssetStrip} title={UI_TEXT.maskConnected}>
                <span className={`group/mask-thumb ${themeClasses.nodeAssetThumb} border-amber-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(251,191,36,0.07)]`}>
                  <CanvasImagePreview
                    src={maskImageUrl}
                    alt=""
                    imageAsset={maskSourceImage ? buildReferenceImageAsset(maskSourceImage) : null}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                  <span className="absolute left-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-400/90 px-1 text-[7px] font-bold leading-none text-amber-950 shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                    M
                  </span>
                  <button
                    type="button"
                    title="移除蒙版输入"
                    aria-label="移除蒙版输入"
                    data-testid={`disconnect-mask-${maskSourceImage.sourceId}-${id}`}
                    className={`${themeClasses.nodeAssetRemoveButton} group-hover/mask-thumb:pointer-events-auto group-hover/mask-thumb:opacity-100`}
                    onPointerDown={stopCanvasGesture}
                    onMouseDown={stopCanvasGesture}
                    onClick={(event) => {
                      stopCanvasGesture(event)
                      runTracked(() => deleteEdgesBySourceTargetHandle(maskSourceImage.sourceId, id, 'mask'))
                    }}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              </div>
            ) : null}

            {hasReferenceLimit && (
              <span className={`${themeClasses.nodeBadge} border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-secondary)] normal-case tracking-normal`}>
                {UI_TEXT.referenceLimitHint}
              </span>
            )}

            {isConnected && (
              <span className={`${themeClasses.nodeBadge} ${themeClasses.nodeBadgeViolet}`}>
                {UI_TEXT.syncedFromText}
              </span>
            )}
          </div>
        )}

        <RichPromptEditor
          value={isConnected ? data.richPrompt ?? null : richPromptDraft}
          fallbackText={data.prompt || ''}
          references={richPromptReferences}
          placeholder={UI_TEXT.placeholder}
          readOnly={isConnected}
          onFocus={() => {
            if (isConnected) return
            beginTransaction()
          }}
          onChange={(nextRichPrompt, nextText) => {
            if (isConnected) return
            updateRichPromptDraft(nextText, nextRichPrompt)
            syncRichPromptToStore(nextText, nextRichPrompt)
          }}
          onBlur={() => {
            if (isConnected) return
            syncRichPromptToStore(latestPromptDraftRef.current, latestRichPromptDraftRef.current)
            commitTransaction()
          }}
        />

        <div className={themeClasses.nodeFooter}>
          <div className="flex items-center gap-1.5">
            <div className="min-w-[170px] flex-1">
              <InlineSelect
                value={effectiveModel}
                options={modelOptions}
                ariaLabel={UI_TEXT.chooseModel}
                onChange={(value) => runTracked(() => updateNodeData(id, { model: value }))}
                stopCanvasGesture={stopCanvasGesture}
                menuClassName="min-w-[260px]"
              />
            </div>

            <div ref={settingsRef} className="relative min-w-0 flex-[1.15]">
              <button
                type="button"
                className={`nodrag nopan flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border px-3 text-left text-xs font-medium leading-5 transition-all ${
                  settingsOpen
                    ? 'border-[var(--accent-violet-strong)] bg-[var(--node-control-bg-hover)] text-[var(--text-primary)] shadow-[0_10px_24px_rgba(0,0,0,0.16)]'
                    : 'border-[var(--border-subtle)] bg-[var(--node-control-bg)] text-[var(--text-secondary)] hover:border-[var(--accent-violet-muted)] hover:bg-[var(--node-control-bg-hover)]'
                }`}
                aria-label={`${UI_TEXT.chooseRatio} / ${UI_TEXT.chooseResolution}`}
                aria-expanded={settingsOpen}
                aria-haspopup="dialog"
                title={settingsSummary}
                onPointerDown={stopCanvasGesture}
                onMouseDown={stopCanvasGesture}
                onClick={(event) => {
                  stopCanvasGesture(event)
                  setSettingsOpen((current) => !current)
                }}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-[var(--accent-violet-strong)]" />
                  <span className="min-w-0 truncate">{settingsSummary}</span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${settingsOpen ? 'rotate-180 text-[var(--accent-violet-strong)]' : ''}`} />
              </button>

              {settingsOpen && (
                <div
                  className="nodrag nopan absolute bottom-full left-1/2 z-50 mb-2 w-[min(15rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--text-primary)_9%,transparent)] bg-[color-mix(in_srgb,var(--panel-bg-strong)_94%,black)] p-3 shadow-[0_20px_48px_rgba(0,0,0,0.34)] backdrop-blur-2xl"
                  role="dialog"
                  aria-label={`${UI_TEXT.chooseRatio} / ${UI_TEXT.chooseResolution}`}
                  onPointerDown={stopCanvasGesture}
                  onMouseDown={stopCanvasGesture}
                  onClick={stopCanvasGesture}
                >
                  <div className="space-y-3">
                    <SettingsSection title="比例">
                      <SettingsSegment
                        value={ratio}
                        options={RATIOS}
                        ariaLabel={UI_TEXT.chooseRatio}
                        onChange={(value) => runTracked(() => updateNodeData(id, { ratio: value }))}
                        groupClassName="!h-auto !grid-flow-row grid-cols-4 !auto-cols-auto gap-x-1 gap-y-2 rounded-[9px] border-[color-mix(in_srgb,var(--text-primary)_11%,transparent)] bg-[color-mix(in_srgb,var(--control-bg)_62%,transparent)] p-2 shadow-none"
                        buttonClassName="h-[3rem] flex-col gap-1 rounded-[7px] px-1.5 py-1.5 text-[10px] leading-none hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)]"
                        gridSlider={{
                          columns: 4,
                          rowHeightRem: 3,
                          columnGapRem: 0.25,
                          rowGapRem: 0.5,
                          insetRem: 0.5,
                        }}
                        renderOption={(value) => (
                          <>
                            <RatioPreview ratio={value} />
                            {getRatioLabel(value)}
                          </>
                        )}
                      />
                    </SettingsSection>

                    <SettingsSection title="清晰度">
                      <SettingsSegment
                        value={resolution}
                        options={RESOLUTIONS}
                        ariaLabel={UI_TEXT.chooseResolution}
                        onChange={(value) => runTracked(() => updateNodeData(id, { resolution: value }))}
                        groupClassName="h-10 rounded-[9px] border-[color-mix(in_srgb,var(--text-primary)_11%,transparent)] bg-[color-mix(in_srgb,var(--control-bg)_62%,transparent)] p-1 shadow-none"
                        buttonClassName="rounded-[7px] text-[11px] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)]"
                        slider
                        renderOption={(value) => getResolutionLabel(value)}
                      />
                    </SettingsSection>

                    {isGptImageSettingsModel && (
                      <SettingsSection title="画质">
                        <SettingsSegment
                          value={quality}
                          options={GPT_IMAGE_QUALITIES}
                          ariaLabel="选择 GPT Image 画质"
                          onChange={(value) => runTracked(() => updateNodeData(id, { quality: value }))}
                          groupClassName="h-10 rounded-[9px] border-[color-mix(in_srgb,var(--text-primary)_11%,transparent)] bg-[color-mix(in_srgb,var(--control-bg)_62%,transparent)] p-1 shadow-none"
                          buttonClassName="rounded-[7px] text-[11px] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)]"
                          slider
                          renderOption={(value) => GPT_IMAGE_QUALITY_LABELS[value]}
                        />
                      </SettingsSection>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleEnqueue}
              disabled={!hasPrompt}
              data-testid={`enqueue-generate-${id}`}
              className={`${themeClasses.nodePrimaryButton} h-9 w-9 shrink-0 shadow-none duration-200`}
              aria-label={data.status === 'error' ? UI_TEXT.generateFailed : isQueued ? UI_TEXT.queued : isGenerating ? UI_TEXT.generating : UI_TEXT.generate}
            >
              {isBusy ? (
                isQueued ? <Clock3 className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}
            </button>
          </div>

          {showStatusText && (
            <div className={`mt-1.5 flex items-start gap-2 px-0.5 text-[10px] leading-relaxed ${themeClasses.textSecondary}`}>
              <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              <div>
                <p className={themeClasses.nodeWarningText}>{statusLabel}</p>
                {statusDescription && <p className="mt-0.5 text-[var(--text-muted)]">{statusDescription}</p>}
              </div>
            </div>
          )}

          {data.status === 'error' && data.errorMsg && (
            <div className="mt-1.5 flex items-start justify-between gap-3 px-0.5">
              <p className={`flex-1 text-[10px] leading-relaxed ${themeClasses.nodeErrorText}`}>{data.errorMsg}</p>
              <button
                type="button"
                onClick={handleEnqueue}
                disabled={!hasPrompt}
                className="shrink-0 rounded-md border border-red-400/30 bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-500 transition hover:border-red-400/50 hover:bg-red-500/15 hover:text-red-400 disabled:cursor-not-allowed disabled:border-[var(--border-subtle)] disabled:bg-[var(--control-bg)] disabled:text-[var(--text-muted)] dark:text-red-300"
                data-testid={`retry-generate-${id}`}
              >
                {UI_TEXT.retry}
              </button>
            </div>
          )}

          {!selectedModel && (
            <p className={`${themeClasses.nodeInlineNotice} ${themeClasses.nodeWarningText}`}>
              当前模型配置缺失，任务会进入队列并在执行时失败。
            </p>
          )}
        </div>
      </div>
    </div>
  )
}, areNodeContentPropsEqual)
