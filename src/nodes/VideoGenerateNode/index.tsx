import { memo, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type SyntheticEvent } from 'react'
import { Handle, Position } from '@xyflow/react'
import { ChevronDown, Clock3, Film, Image as ImageIcon, Play, SlidersHorizontal, Sparkles, Video, X } from 'lucide-react'
import { CanvasImagePreview } from '@/components/CanvasImagePreview'
import { enqueueVideoGenerateTask } from '@/features/generateQueue/orchestrator'
import { getCanvasNodeById } from '@/store/canvasConnectionSources'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { useProjectStore } from '@/store/useProjectStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { handleTextareaBlur, handleTextareaFocus, handleTextareaWheel } from '@/utils/textareaWheel'
import { getWorkspaceAssetThumbnailRelativePath } from '@/utils/workspaceImageAsset'
import { recordComponentRender } from '@/utils/performanceDiagnostics'
import type { AppNodeProps, WorkspaceImageAsset } from '@/types'
import { useShallow } from 'zustand/react/shallow'
import { themeClasses } from '@/styles/themeClasses'
import { InlineSelect, type InlineSelectOption } from '../InlineSelect'
import { NodeDeleteButton, NodeHeader, NodeResizerPreset } from '../nodeShell'
import { getNodeShellClassName } from '../nodeShellClassName'
import { areNodeContentPropsEqual } from '../nodePropComparators'

type VideoGenerateNodeProps = AppNodeProps<'videoGenerateNode'>

const RATIOS = ['16:9', '9:16'] as const
const DURATIONS = ['5s', '10s'] as const
const RESOLUTIONS = ['480p', '720p', '1080p'] as const
const MODES = [
  { value: 'text', label: '文生视频' },
  { value: 'keyframes', label: '首尾帧' },
  { value: 'reference', label: '参考图' },
] as const

const UI_TEXT = {
  deleteNode: '删除 AI 视频节点',
  title: 'AI视频',
  promptInput: '提示词',
  imageInput: '图片输入',
  connectPrompt: '连接文本节点作为提示词',
  textOnlyHint: '直接输入提示词生成视频',
  connectImage: '连接图片作为首帧 / 尾帧',
  connectReferenceImage: '连接图片作为参考图',
  placeholder: '描述画面、镜头运动、节奏和氛围...',
  syncedFromText: '已由文本节点同步',
  chooseSettings: '视频生成设置',
  chooseMode: '选择生成方式',
  chooseModel: '选择视频模型',
  chooseRatio: '选择比例',
  chooseDuration: '选择生成时长',
  chooseResolution: '选择清晰度',
  generate: '生成视频',
  missingPrompt: '请输入视频提示词。',
  noVideoModel: '未配置视频模型',
} as const

type ReferenceImageItem = {
  sourceId: string
  imageUrl: string
  thumbnailRelativePath?: string
}

const REFERENCE_IMAGE_KEY_SEPARATOR = '\u0000'

function encodeReferenceImageKey(item: ReferenceImageItem) {
  return [
    item.sourceId,
    item.imageUrl,
    item.thumbnailRelativePath ?? '',
  ].join(REFERENCE_IMAGE_KEY_SEPARATOR)
}

function decodeReferenceImageKey(key: string): ReferenceImageItem | null {
  const [sourceId, imageUrl, thumbnailRelativePath = ''] = key.split(REFERENCE_IMAGE_KEY_SEPARATOR)
  return sourceId && imageUrl ? { sourceId, imageUrl, thumbnailRelativePath: thumbnailRelativePath || undefined } : null
}

function buildReferenceImageAsset(item: ReferenceImageItem): WorkspaceImageAsset | null {
  return item.thumbnailRelativePath
    ? {
        relativePath: '',
        mimeType: '',
        fileName: '',
        thumbnailRelativePath: item.thumbnailRelativePath,
      }
    : null
}

function RatioPreview({ ratio }: { ratio: string }) {
  const [rawWidth, rawHeight] = ratio.split(':').map(Number)
  const maxWidth = 22
  const maxHeight = 16
  const scale = Math.min(maxWidth / rawWidth, maxHeight / rawHeight)
  const width = Math.round(rawWidth * scale)
  const height = Math.round(rawHeight * scale)

  return (
    <span aria-hidden="true" className="inline-flex h-5 w-7 shrink-0 items-center justify-center">
      <span
        className="inline-flex shrink-0 rounded-[3px] border border-[color-mix(in_srgb,var(--text-primary)_80%,transparent)] bg-transparent"
        style={{ width, height }}
      />
    </span>
  )
}

function SettingsSegment<T extends string>({
  value,
  options,
  ariaLabel,
  onChange,
  renderOption,
  groupClassName = '',
  buttonClassName = '',
  slider = false,
}: {
  value: T | string
  options: readonly T[]
  ariaLabel: string
  onChange: (value: T) => void
  renderOption?: (value: T, active: boolean) => ReactNode
  groupClassName?: string
  buttonClassName?: string
  slider?: boolean
}) {
  const activeIndex = Math.max(0, options.findIndex((option) => option === value))
  const sliderGapRem = 0.25
  const sliderHorizontalInsetRem = 0.5
  const sliderTotalGapRem = Math.max(0, options.length - 1) * sliderGapRem

  return (
    <div
      className={`${themeClasses.nodeSegmentGroup} ${slider ? 'relative gap-1' : ''} ${groupClassName}`}
      role="group"
      aria-label={ariaLabel}
    >
      {slider && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1 left-1 top-1 rounded-[7px] border border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)] shadow-[0_6px_18px_rgba(124,58,237,0.22),inset_0_0_0_1px_color-mix(in_srgb,var(--text-primary)_7%,transparent)] transition-transform duration-200 ease-out"
          style={{
            width: `calc((100% - ${sliderHorizontalInsetRem}rem - ${sliderTotalGapRem}rem) / ${options.length})`,
            transform: `translateX(calc(${activeIndex} * (100% + ${sliderGapRem}rem)))`,
          }}
        />
      )}
      {options.map((option) => {
        const active = option === value

        return (
          <button
            key={option}
            type="button"
            className={`${themeClasses.nodeSegmentButton} ${slider ? 'relative z-10 bg-transparent shadow-none' : ''} ${buttonClassName} ${
              active ? slider ? 'text-[var(--text-primary)]' : themeClasses.nodeSegmentButtonActive : ''
            }`}
            aria-pressed={active}
            onClick={() => onChange(option)}
          >
            {renderOption ? renderOption(option, active) : option}
          </button>
        )
      })}
    </div>
  )
}

function SettingsSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-1.5 px-0.5 text-[10px] font-semibold tracking-[0.04em] text-[var(--text-muted)]">
        {title}
      </div>
      {children}
    </section>
  )
}

export const VideoGenerateNode = memo(function VideoGenerateNode({ id, data, selected }: VideoGenerateNodeProps) {
  recordComponentRender('VideoGenerateNode')
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)
  const deleteNode = useCanvasStore((s) => s.deleteNode)
  const deleteEdgesBySourceTarget = useCanvasStore((s) => s.deleteEdgesBySourceTarget)
  const beginTransaction = useHistoryStore((s) => s.beginTransaction)
  const commitTransaction = useHistoryStore((s) => s.commitTransaction)
  const runTracked = useHistoryStore((s) => s.runTracked)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const getEnabledCustomModels = useSettingsStore((s) => s.getEnabledCustomModels)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const settingsRef = useRef<HTMLDivElement | null>(null)
  const [hasPromptDraft, setHasPromptDraft] = useState(Boolean((data.prompt || '').trim()))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const videoModels = getEnabledCustomModels('video')
  const mode = data.mode === 'keyframes' || data.mode === 'reference' ? data.mode : 'text'
  const ratio = data.ratio || '16:9'
  const duration = data.duration || '5s'
  const resolution = data.resolution || '720p'
  const modeLabel = MODES.find((option) => option.value === mode)?.label ?? MODES[0].label
  const fallbackModel = videoModels[0]?.modelId ?? ''
  const effectiveModel = videoModels.some((model) => model.modelId === data.model) ? data.model : fallbackModel
  const isConnected = Boolean(data.connectedTextNode)
  const hasPrompt = isConnected ? Boolean((data.prompt || '').trim()) : hasPromptDraft
  const referenceSourceOrderKey = Array.isArray(data.referenceSourceOrder)
    ? data.referenceSourceOrder.filter((sourceId): sourceId is string => typeof sourceId === 'string').join(REFERENCE_IMAGE_KEY_SEPARATOR)
    : ''
  const selectReferenceImageKeys = useMemo(() => {
    const orderedIds = referenceSourceOrderKey ? referenceSourceOrderKey.split(REFERENCE_IMAGE_KEY_SEPARATOR) : []
    return (state: { nodes: ReturnType<typeof useCanvasStore.getState>['nodes'] }) => (
      orderedIds.flatMap((sourceId) => {
        const node = getCanvasNodeById(state.nodes, sourceId)
        const imageUrl = typeof node?.data?.imageUrl === 'string' ? node.data.imageUrl : ''
        if (!imageUrl) {
          return []
        }

        return encodeReferenceImageKey({
          sourceId,
          imageUrl,
          thumbnailRelativePath: getWorkspaceAssetThumbnailRelativePath(node?.data.imageAsset),
        })
      })
    )
  }, [referenceSourceOrderKey])
  const referenceImageKeys = useCanvasStore(useShallow(selectReferenceImageKeys))
  const referenceImages = useMemo<ReferenceImageItem[]>(
    () => referenceImageKeys.map(decodeReferenceImageKey).filter((item): item is ReferenceImageItem => Boolean(item)),
    [referenceImageKeys],
  )
  const visibleImages = mode === 'text' ? [] : mode === 'keyframes' ? referenceImages.slice(0, 2) : referenceImages
  const imageHint = mode === 'text'
    ? UI_TEXT.textOnlyHint
    : mode === 'keyframes'
      ? UI_TEXT.connectImage
      : UI_TEXT.connectReferenceImage
  const settingsSummary = `${modeLabel} / ${ratio} / ${resolution} / ${duration}`

  const modelOptions = useMemo<InlineSelectOption[]>(
    () => videoModels.length > 0
      ? videoModels.map((model) => ({
          value: model.modelId,
          label: model.name || model.modelId,
          icon: <Video className="h-3.5 w-3.5 text-[var(--accent-violet-strong)]" />,
        }))
      : [{
          value: '',
          label: UI_TEXT.noVideoModel,
          icon: <Video className="h-3.5 w-3.5 text-[var(--text-muted)]" />,
        }],
    [videoModels],
  )

  const stopCanvasGesture = (event: SyntheticEvent) => {
    event.stopPropagation()
  }

  const syncPromptToStore = (nextPrompt: string) => {
    if (nextPrompt !== (data.prompt || '')) {
      updateNodeData(id, { prompt: nextPrompt, errorMsg: '', status: 'idle' })
    }
  }

  useEffect(() => {
    const textarea = promptRef.current

    if (!textarea) {
      return
    }

    const nextPrompt = data.prompt || ''
    const isFocused = document.activeElement === textarea

    if (isConnected || !isFocused) {
      if (textarea.value !== nextPrompt) {
        textarea.value = nextPrompt
      }
    }
  }, [data.prompt, isConnected])

  useEffect(() => {
    if (!settingsOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [settingsOpen])

  const updateVideoSettings = (patch: Record<string, unknown>) => {
    runTracked(() => updateNodeData(id, { ...patch, errorMsg: '', status: 'idle' }))
  }

  const disconnectImage = (sourceId: string) => {
    runTracked(() => deleteEdgesBySourceTarget(sourceId, id))
  }

  const handleGenerate = () => {
    const currentPrompt = (promptRef.current?.value ?? data.prompt ?? '').trim()
    if (!currentPrompt) {
      updateNodeData(id, { status: 'error', errorMsg: UI_TEXT.missingPrompt })
      return
    }

    if (!effectiveModel) {
      updateNodeData(id, { status: 'error', errorMsg: UI_TEXT.noVideoModel })
      return
    }

    syncPromptToStore(currentPrompt)
    enqueueVideoGenerateTask({
      projectId: activeProjectId,
      sourceNodeId: id,
      prompt: currentPrompt,
      model: effectiveModel,
      mode,
      ratio,
      resolution,
      duration,
    })
  }

  const getImageLabel = (index: number) => {
    if (mode === 'keyframes') {
      return index === 0 ? '首帧' : '尾帧'
    }

    return String(index + 1)
  }

  return (
    <div
      data-testid={`node-${id}`}
      className={getNodeShellClassName({ selected })}
    >
      <NodeResizerPreset
        selected={selected}
        minWidth={440}
        minHeight={320}
        maxWidth={820}
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
        id="input"
        className="handle-orb-anchor !w-[18px] !h-[18px] !rounded-full !border-0 !bg-transparent !p-0"
        style={{ top: '56%' }}
        title="提示词 / 图片输入"
      >
        <span className="handle-orb handle-orb--target">
          <span className="handle-orb__glow" />
          <span className="handle-orb__ring" />
          <span className="handle-orb__dot" />
        </span>
      </Handle>

      <Handle
        type="source"
        position={Position.Right}
        id="video"
        className="handle-orb-anchor !w-[18px] !h-[18px] !rounded-full !border-0 !bg-transparent !p-0"
      >
        <span className="handle-orb handle-orb--source">
          <span className="handle-orb__glow" />
          <span className="handle-orb__ring" />
          <span className="handle-orb__dot" />
        </span>
      </Handle>

      <NodeHeader
        icon={<Sparkles className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
        title={UI_TEXT.title}
        right={(
          <span className={`ml-auto ${themeClasses.nodeBadge} ${themeClasses.nodeBadgeViolet} font-semibold`}>
            {mode === 'text' ? <Video className="h-3 w-3" /> : mode === 'keyframes' ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
            {modeLabel}
          </span>
        )}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2.5">
        {(visibleImages.length > 0 || isConnected) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {visibleImages.length > 0 && (
              <div className={themeClasses.nodeAssetStrip}>
                <div className="flex items-center gap-1">
                  {visibleImages.map((referenceImage, index) => (
                  <span
                    key={referenceImage.sourceId}
                    title={mode === 'keyframes' ? getImageLabel(index) : `参考图 ${index + 1}`}
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
                      {getImageLabel(index)}
                    </span>
                    <button
                      type="button"
                      title="移除图片"
                      aria-label="移除图片"
                      className={`${themeClasses.nodeAssetRemoveButton} group-hover/reference-thumb:pointer-events-auto group-hover/reference-thumb:opacity-100`}
                      onPointerDown={stopCanvasGesture}
                      onMouseDown={stopCanvasGesture}
                      onClick={(event) => {
                        stopCanvasGesture(event)
                        disconnectImage(referenceImage.sourceId)
                      }}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
                {mode === 'keyframes' && referenceImages.length > 2 && (
                  <span className={`${themeClasses.nodeBadge} border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-muted)] normal-case tracking-normal`}>
                    +{referenceImages.length - 2}
                  </span>
                )}
                </div>
              </div>
            )}

            {isConnected && (
              <span className={`${themeClasses.nodeBadge} ${themeClasses.nodeBadgeViolet}`}>
                {UI_TEXT.syncedFromText}
              </span>
            )}
          </div>
        )}

        <textarea
          ref={promptRef}
          defaultValue={data.prompt || ''}
          onFocus={(event) => {
            handleTextareaFocus(event)
            if (isConnected) return
            beginTransaction()
          }}
          onInput={(event: FormEvent<HTMLTextAreaElement>) => {
            if (isConnected) return
            const nextPrompt = event.currentTarget.value
            setHasPromptDraft(Boolean(nextPrompt.trim()))
            syncPromptToStore(nextPrompt)
          }}
          onBlur={(event) => {
            handleTextareaBlur(event)
            if (isConnected) return
            syncPromptToStore(event.currentTarget.value)
            commitTransaction()
          }}
          onWheelCapture={handleTextareaWheel}
          readOnly={isConnected}
          placeholder={mode === 'text' || visibleImages.length > 0 || isConnected ? UI_TEXT.placeholder : `${imageHint}，或直接输入提示词...`}
          rows={5}
          className={`min-h-[132px] w-full flex-1 resize-none px-3 py-2.5 text-sm leading-6 transition nodrag nopan ${themeClasses.nodeTextarea}
            ${isConnected ? 'border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)]' : ''}`}
          style={{ fontFamily: '"Microsoft YaHei", sans-serif' }}
        />

        <div className={themeClasses.nodeFooter}>
          <div className="flex items-center gap-1.5">
            <div className="min-w-[170px] flex-1">
              <InlineSelect
                value={effectiveModel}
                options={modelOptions}
                ariaLabel={UI_TEXT.chooseModel}
                onChange={(value) => updateVideoSettings({ model: value })}
                stopCanvasGesture={stopCanvasGesture}
                menuClassName="min-w-[260px]"
              />
            </div>

            <div ref={settingsRef} className="relative min-w-0 flex-[1.05]">
              <button
                type="button"
                className={`nodrag nopan flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border px-3 text-left text-xs font-medium leading-5 transition-all ${
                  settingsOpen
                    ? 'border-[var(--accent-violet-strong)] bg-[var(--node-control-bg-hover)] text-[var(--text-primary)] shadow-[0_10px_24px_rgba(0,0,0,0.16)]'
                    : 'border-[var(--border-subtle)] bg-[var(--node-control-bg)] text-[var(--text-secondary)] hover:border-[var(--accent-violet-muted)] hover:bg-[var(--node-control-bg-hover)]'
                }`}
                aria-label={UI_TEXT.chooseSettings}
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
                  className="nodrag nopan absolute bottom-full left-1/2 z-50 mb-2 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--text-primary)_9%,transparent)] bg-[color-mix(in_srgb,var(--panel-bg-strong)_94%,black)] p-3 shadow-[0_20px_48px_rgba(0,0,0,0.34)] backdrop-blur-2xl"
                  role="dialog"
                  aria-label={UI_TEXT.chooseSettings}
                  onPointerDown={stopCanvasGesture}
                  onMouseDown={stopCanvasGesture}
                  onClick={stopCanvasGesture}
                >
                  <div className="space-y-3">
                    <SettingsSection title="生成方式">
                      <SettingsSegment
                        value={mode}
                        options={MODES.map((option) => option.value)}
                        ariaLabel={UI_TEXT.chooseMode}
                        onChange={(value) => updateVideoSettings({ mode: value })}
                        groupClassName="h-10 rounded-[9px] border-[color-mix(in_srgb,var(--text-primary)_11%,transparent)] bg-[color-mix(in_srgb,var(--control-bg)_62%,transparent)] p-1 shadow-none"
                        buttonClassName="whitespace-nowrap rounded-[7px] text-[11px] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)]"
                        slider
                        renderOption={(value) => {
                          const optionLabel = MODES.find((option) => option.value === value)?.label ?? value
                          return (
                            <>
                              {value === 'text' ? <Video className="h-3.5 w-3.5" /> : value === 'keyframes' ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                              {optionLabel}
                            </>
                          )
                        }}
                      />
                    </SettingsSection>

                    <SettingsSection title="比例">
                      <SettingsSegment
                        value={ratio}
                        options={RATIOS}
                        ariaLabel={UI_TEXT.chooseRatio}
                        onChange={(value) => updateVideoSettings({ ratio: value })}
                        groupClassName="h-10 rounded-[9px] border-[color-mix(in_srgb,var(--text-primary)_11%,transparent)] bg-[color-mix(in_srgb,var(--control-bg)_62%,transparent)] p-1 shadow-none"
                        buttonClassName="rounded-[7px] text-[11px] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)]"
                        slider
                        renderOption={(value) => (
                          <>
                            <RatioPreview ratio={value} />
                            {value}
                          </>
                        )}
                      />
                    </SettingsSection>

                    <SettingsSection title="清晰度">
                      <SettingsSegment
                        value={resolution}
                        options={RESOLUTIONS}
                        ariaLabel={UI_TEXT.chooseResolution}
                        onChange={(value) => updateVideoSettings({ resolution: value })}
                        groupClassName="h-10 rounded-[9px] border-[color-mix(in_srgb,var(--text-primary)_11%,transparent)] bg-[color-mix(in_srgb,var(--control-bg)_62%,transparent)] p-1 shadow-none"
                        buttonClassName="rounded-[7px] text-[11px] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)]"
                        slider
                      />
                    </SettingsSection>

                    <SettingsSection title="生成时长">
                      <SettingsSegment
                        value={duration}
                        options={DURATIONS}
                        ariaLabel={UI_TEXT.chooseDuration}
                        onChange={(value) => updateVideoSettings({ duration: value })}
                        groupClassName="h-10 rounded-[9px] border-[color-mix(in_srgb,var(--text-primary)_11%,transparent)] bg-[color-mix(in_srgb,var(--control-bg)_62%,transparent)] p-1 shadow-none"
                        buttonClassName="rounded-[7px] text-[11px] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)]"
                        slider
                        renderOption={(value) => (
                          <>
                            <Clock3 className="h-3.5 w-3.5" />
                            {value}
                          </>
                        )}
                      />
                    </SettingsSection>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={!hasPrompt || !effectiveModel || data.status === 'queued' || data.status === 'generating'}
              className={`${themeClasses.nodePrimaryButton} h-9 w-9 shrink-0`}
              aria-label={UI_TEXT.generate}
              title={UI_TEXT.generate}
              data-testid={`enqueue-video-generate-${id}`}
            >
              <Play className="h-3.5 w-3.5 fill-current" />
            </button>
          </div>

          {data.errorMsg && (
            <p className={`${themeClasses.nodeInlineNotice} ${themeClasses.nodeWarningText}`}>{data.errorMsg}</p>
          )}
        </div>
      </div>
    </div>
  )
}, areNodeContentPropsEqual)
