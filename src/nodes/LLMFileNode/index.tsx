import { memo, useEffect, useMemo, useRef, useState, type ChangeEvent, type SyntheticEvent } from 'react'
import { Handle, Position, useConnection } from '@xyflow/react'
import { Bot, CheckCircle2, FileText, Loader2, Paperclip, Play, TriangleAlert, X } from 'lucide-react'
import { CanvasImagePreview } from '@/components/CanvasImagePreview'
import { ClaudeIcon } from '@/components/icons/ClaudeIcon'
import { OpenAIIcon } from '@/components/OpenAIIcon'
import { QwenIcon } from '@/components/QwenIcon'
import { ZhipuIcon } from '@/components/ZhipuIcon'
import type { ProviderId } from '@/config/modelCatalog'
import { runLLMFileNode } from '@/features/llm/orchestrator'
import { isClaudeModel } from '@/features/settings/modelBrand'
import { getMaxInputFiles, LLM_INPUT_FILE_ACCEPT, readLLMInputFiles } from '@/features/llm/inputFiles'
import { createRichPromptDocumentFromText } from '@/features/richPrompt/promptCompiler'
import { RichPromptEditor } from '@/features/richPrompt/RichPromptEditor'
import type { RichPromptDocument, RichPromptReferenceItem } from '@/features/richPrompt/types'
import { getCanvasNodeById } from '@/store/canvasConnectionSources'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { getWorkspaceAssetThumbnailRelativePath } from '@/utils/workspaceImageAsset'
import { recordComponentRender } from '@/utils/performanceDiagnostics'
import { type AppNodeProps, type CustomImageModelConfig, type LLMInputFileData, type LLMOutputFormat, type WorkspaceImageAsset } from '@/types'
import { useShallow } from 'zustand/react/shallow'
import { themeClasses } from '@/styles/themeClasses'
import { InlineSelect, type InlineSelectOption } from '../InlineSelect'
import { NodeDeleteButton, NodeHeader, NodeResizerPreset } from '../nodeShell'
import { getNodeShellClassName } from '../nodeShellClassName'
import { areNodeContentPropsEqual } from '../nodePropComparators'

type LLMFileNodeProps = AppNodeProps<'llmFileNode'>

type LLMPreset = {
  id: string
  label: string
  description: string
  systemPrompt: string
  instructionPrompt: string
  defaultOutputFormat: LLMOutputFormat
}

type InputImageItem = {
  sourceId: string
  imageUrl: string
  thumbnailRelativePath?: string
}

const INPUT_IMAGE_KEY_SEPARATOR = '\u0000'

function encodeInputImageKey(item: InputImageItem) {
  return [
    item.sourceId,
    item.imageUrl,
    item.thumbnailRelativePath ?? '',
  ].join(INPUT_IMAGE_KEY_SEPARATOR)
}

function decodeInputImageKey(key: string): InputImageItem | null {
  const [sourceId, imageUrl, thumbnailRelativePath = ''] = key.split(INPUT_IMAGE_KEY_SEPARATOR)
  return sourceId && imageUrl ? { sourceId, imageUrl, thumbnailRelativePath: thumbnailRelativePath || undefined } : null
}

function buildInputImageAsset(item: InputImageItem): WorkspaceImageAsset | null {
  return item.thumbnailRelativePath
    ? {
        relativePath: '',
        mimeType: '',
        fileName: '',
        thumbnailRelativePath: item.thumbnailRelativePath,
      }
    : null
}

const OUTPUT_FORMAT_OPTIONS: Array<{ value: LLMOutputFormat; label: string }> = [
  { value: 'text', label: '纯文本' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
]

const PRESETS: LLMPreset[] = [
  {
    id: 'extract-characters-scenes',
    label: '角色场景提取',
    description: '提取角色、地点、场景和关键视觉元素。',
    systemPrompt: '你是一个擅长视觉内容拆解的中文助手。输出要准确、紧凑、可复用。',
    instructionPrompt: '请提取文本中的角色、场景、地点、时间、关键动作和视觉细节，便于后续生成图像提示词。',
    defaultOutputFormat: 'json',
  },
  {
    id: 'storyboard-breakdown',
    label: '分镜拆解',
    description: '把文本拆成可执行分镜。',
    systemPrompt: '你是一个擅长把中文文本拆解成镜头语言的分镜助手。结果要清晰、可直接继续加工。',
    instructionPrompt: '请将输入内容拆解成连续分镜，包含镜头编号、画面主体、场景、动作、情绪、镜头景别和构图重点。',
    defaultOutputFormat: 'markdown',
  },
  {
    id: 'prompt-enhancement',
    label: '提示词增强',
    description: '把原始描述增强成更完整的提示词。',
    systemPrompt: '你是一个擅长为图像生成模型优化提示词的助手。输出要具体、可视化、避免空话。',
    instructionPrompt: '请把输入内容增强成更完整、更有画面感的图像生成提示词。',
    defaultOutputFormat: 'text',
  },
]

const UI_TEXT = {
  deleteNode: '删除大模型节点',
  title: '大模型',
  linkedTextToken: '#文本节点内容',
  instructionPlaceholder: '输入自定义提示词...',
  choosePreset: '选择预设',
  chooseModel: '选择模型',
  chooseOutputFormat: '选择输出格式',
  uploadFiles: '上传附件',
  uploadMoreFiles: '继续添加',
  attachments: '附件',
  run: '执行',
  running: '执行中',
  success: '执行完成',
  failed: '执行失败',
  noModel: '暂无可用 Chat 模型，请先在模型设置中启用。',
  noPrompt: '请输入自定义提示词后再执行。',
} as const

function getPresetById(presetId: string | null | undefined) {
  return PRESETS.find((preset) => preset.id === presetId) ?? null
}

function getModelIconMeta(model: Pick<CustomImageModelConfig, 'modelId' | 'name'> & { provider?: ProviderId }) {
  const normalized = `${model.name} ${model.modelId}`.toLowerCase()

  if (normalized.includes('qwen')) {
    return {
      glyph: '通',
      className: 'border-amber-300/25 bg-amber-300/12 text-amber-200',
    }
  }

  if (normalized.includes('gpt')) {
    return {
      glyph: '◎',
      className: 'border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-secondary)]',
    }
  }

  if (normalized.includes('gemini')) {
    return {
      glyph: 'G',
      className: 'border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)] text-[var(--accent-violet-strong)]',
    }
  }

  if (normalized.includes('deepseek')) {
    return {
      glyph: 'D',
      className: 'border-emerald-300/25 bg-emerald-300/12 text-emerald-200',
    }
  }

  if (model.provider === 'openai') {
    return {
      glyph: '◎',
      className: 'border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-secondary)]',
    }
  }

  return {
    glyph: '✦',
    className: 'border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)] text-[var(--accent-violet-strong)]',
  }
}

function ModelOptionIcon({ model }: { model: Pick<CustomImageModelConfig, 'modelId' | 'name'> & { provider?: ProviderId } }) {
  const iconMeta = getModelIconMeta(model)
  const normalized = `${model.name} ${model.modelId}`.toLowerCase()
  const isOpenAIModel = normalized.includes('gpt') || model.provider === 'openai'

  if (isClaudeModel(model)) {
    return (
      <span aria-hidden="true" className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <ClaudeIcon className="h-3.5 w-3.5" />
      </span>
    )
  }

  if (normalized.includes('qwen')) {
    return (
      <span aria-hidden="true" className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <QwenIcon className="h-3.5 w-3.5" />
      </span>
    )
  }

  if (normalized.includes('glm') || normalized.includes('zhipu') || normalized.includes('智谱')) {
    return (
      <span aria-hidden="true" className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <ZhipuIcon className="h-3.5 w-3.5" />
      </span>
    )
  }

  if (isOpenAIModel) {
    return (
      <span aria-hidden="true" className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-secondary)]">
        <OpenAIIcon className="h-3 w-3" />
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border text-[10px] font-semibold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${iconMeta.className}`}
    >
      {iconMeta.glyph}
    </span>
  )
}

function buildStatusMeta(status: LLMFileNodeProps['data']['status']) {
  switch (status) {
    case 'running':
      return {
        label: UI_TEXT.running,
        toneClassName: `${themeClasses.nodeBadgeViolet}`,
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
      }
    case 'success':
      return {
        label: UI_TEXT.success,
        toneClassName: `${themeClasses.nodeBadgeEmerald}`,
        icon: <CheckCircle2 className="h-3 w-3" />,
      }
    case 'error':
      return {
        label: UI_TEXT.failed,
        toneClassName: `${themeClasses.nodeBadgeRed}`,
        icon: <TriangleAlert className="h-3 w-3" />,
      }
    default:
      return {
        label: 'LLM',
        toneClassName: `${themeClasses.nodeBadgeViolet}`,
        icon: <Bot className="h-3 w-3" />,
      }
  }
}

function normalizeInputFiles(input: unknown) {
  return Array.isArray(input)
    ? input.filter((file): file is LLMInputFileData => Boolean(file && typeof file === 'object' && typeof (file as LLMInputFileData).id === 'string'))
    : []
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`
  }

  return `${size} B`
}

export const LLMFileNode = memo(function LLMFileNode({ id, data, selected }: LLMFileNodeProps) {
  recordComponentRender('LLMFileNode')
  const [isRunning, setIsRunning] = useState(false)
  const [instructionDraft, setInstructionDraft] = useState(data.instructionPrompt || '')
  const [richPromptDraft, setRichPromptDraft] = useState<RichPromptDocument | null>(data.richPrompt ?? null)
  const latestInstructionDraftRef = useRef(instructionDraft)
  const latestRichPromptDraftRef = useRef<RichPromptDocument | null>(richPromptDraft)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const inputImageSourceOrderKey = Array.isArray(data.inputImageSourceOrder)
    ? data.inputImageSourceOrder.filter((sourceId): sourceId is string => typeof sourceId === 'string').join(INPUT_IMAGE_KEY_SEPARATOR)
    : ''
  const selectInputImageKeys = useMemo(() => {
    const orderedIds = inputImageSourceOrderKey ? inputImageSourceOrderKey.split(INPUT_IMAGE_KEY_SEPARATOR) : []
    return (state: { nodes: ReturnType<typeof useCanvasStore.getState>['nodes'] }) => (
      orderedIds.flatMap((sourceId) => {
        const node = getCanvasNodeById(state.nodes, sourceId)
        const imageUrl = typeof node?.data?.imageUrl === 'string' ? node.data.imageUrl : ''
        if (!imageUrl) {
          return []
        }

        return encodeInputImageKey({
          sourceId,
          imageUrl,
          thumbnailRelativePath: getWorkspaceAssetThumbnailRelativePath(node?.data.imageAsset),
        })
      })
    )
  }, [inputImageSourceOrderKey])
  const inputImageKeys = useCanvasStore(useShallow(selectInputImageKeys))
  const { updateNodeData, deleteNode, deleteEdgesBySourceTarget } = useCanvasStore(
    useShallow((s) => ({
      updateNodeData: s.updateNodeData,
      deleteNode: s.deleteNode,
      deleteEdgesBySourceTarget: s.deleteEdgesBySourceTarget,
    })),
  )
  const beginTransaction = useHistoryStore((s) => s.beginTransaction)
  const commitTransaction = useHistoryStore((s) => s.commitTransaction)
  const runTracked = useHistoryStore((s) => s.runTracked)
  const connection = useConnection()
  const isConnecting = connection.inProgress && connection.fromNode?.id === id
  const getEnabledCustomModels = useSettingsStore((s) => s.getEnabledCustomModels)
  const chatModels = getEnabledCustomModels('chat')
  const hasChatModel = chatModels.length > 0
  const selectedPreset = getPresetById(data.presetId)
  const hasConnectedInputNode = Boolean(data.connectedTextNode)
  const inputImages = useMemo<InputImageItem[]>(
    () => inputImageKeys.map(decodeInputImageKey).filter((item): item is InputImageItem => Boolean(item)),
    [inputImageKeys],
  )
  const richPromptReferences = useMemo<RichPromptReferenceItem[]>(
    () =>
      inputImages.map((item, index) => ({
        sourceId: item.sourceId,
        imageUrl: item.imageUrl,
        thumbnailRelativePath: item.thumbnailRelativePath,
        label: `参考图${index + 1}`,
        order: index + 1,
      })),
    [inputImages],
  )
  const inputFiles = useMemo(() => normalizeInputFiles(data.inputFiles), [data.inputFiles])
  const inputImageCount = inputImages.length
  const inputFileCount = inputFiles.length
  const hasInputAssets = inputImageCount > 0 || inputFileCount > 0
  const maxInputFiles = getMaxInputFiles()
  const remainingFileSlots = Math.max(0, maxInputFiles - inputFileCount)
  const hasInstructionPrompt = Boolean((data.instructionPrompt || '').trim())
  const canRun = hasInstructionPrompt && hasChatModel && !isRunning
  const statusMeta = buildStatusMeta(data.status)

  const presetOptions = useMemo<InlineSelectOption[]>(
    () => [
      { value: '__none__', label: '自定义' },
      ...PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
    ],
    [],
  )
  const modelOptions = useMemo<InlineSelectOption[]>(
    () => chatModels.length > 0
      ? chatModels.map((model) => ({
          value: model.modelId,
          label: model.name || model.modelId,
          icon: <ModelOptionIcon model={model} />,
        }))
      : [{ value: '__empty__', label: '暂无可用 Chat 模型' }],
    [chatModels],
  )
  const outputFormatOptions = useMemo<InlineSelectOption[]>(
    () => OUTPUT_FORMAT_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    [],
  )

  useEffect(() => {
    const nextInstruction = data.instructionPrompt || ''
    latestInstructionDraftRef.current = nextInstruction
    latestRichPromptDraftRef.current = data.richPrompt ?? null
    setInstructionDraft(nextInstruction)
    setRichPromptDraft(data.richPrompt ?? null)
  }, [data.instructionPrompt, data.richPrompt])

  const stopCanvasGesture = (event: SyntheticEvent) => {
    event.stopPropagation()
  }

  const updateRichPromptDraft = (nextInstruction: string, nextRichPrompt: RichPromptDocument | null) => {
    latestInstructionDraftRef.current = nextInstruction
    latestRichPromptDraftRef.current = nextRichPrompt
    setInstructionDraft(nextInstruction)
    setRichPromptDraft(nextRichPrompt)
  }

  const syncRichPromptToStore = (nextInstruction: string, nextRichPrompt: RichPromptDocument | null) => {
    if (nextInstruction !== (data.instructionPrompt || '') || nextRichPrompt !== (data.richPrompt ?? null)) {
      updateNodeData(id, {
        instructionPrompt: nextInstruction,
        richPrompt: nextRichPrompt,
      })
    }
  }

  const handlePresetChange = (value: string) => {
    const nextPreset = value === '__none__' ? null : getPresetById(value)

    runTracked(() => updateNodeData(id, {
      presetId: nextPreset?.id ?? null,
      outputFormat: nextPreset?.defaultOutputFormat ?? data.outputFormat,
      instructionPrompt: nextPreset ? nextPreset.instructionPrompt : data.instructionPrompt,
      richPrompt: nextPreset ? createRichPromptDocumentFromText(nextPreset.instructionPrompt) : data.richPrompt ?? null,
      errorMsg: '',
    }))
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''

    if (selectedFiles.length === 0) {
      return
    }

    try {
      const nextFiles = await readLLMInputFiles(selectedFiles, inputFiles.length)
      runTracked(() => updateNodeData(id, {
        inputFiles: [...inputFiles, ...nextFiles],
        errorMsg: '',
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      runTracked(() => updateNodeData(id, { errorMsg: message }))
    }
  }

  const handleRun = async () => {
    if (!canRun) {
      return
    }

    const nextInstruction = (latestInstructionDraftRef.current || data.instructionPrompt || '').trim()
    if (!nextInstruction) {
      runTracked(() => updateNodeData(id, {
        status: 'error',
        errorMsg: UI_TEXT.noPrompt,
      }))
      return
    }

    setIsRunning(true)

    try {
      syncRichPromptToStore(nextInstruction, latestRichPromptDraftRef.current)
      await runLLMFileNode(id, {
        instructionPrompt: nextInstruction,
        presetSystemPrompt: selectedPreset?.systemPrompt,
      })
    } catch {
      // 状态已由 orchestrator 回写到节点
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div
      data-testid={`node-${id}`}
      className={getNodeShellClassName({ selected })}
    >
      <NodeResizerPreset
        selected={selected}
        minWidth={360}
        minHeight={340}
        maxWidth={760}
        maxHeight={860}
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
        style={{ top: '50%' }}
        className="handle-orb-anchor !w-[18px] !h-[18px] !rounded-full !border-0 !bg-transparent !p-0"
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
        id="output"
        className="handle-orb-anchor !w-[18px] !h-[18px] !rounded-full !border-0 !bg-transparent !p-0"
      >
        <span className={`handle-orb handle-orb--source ${isConnecting ? 'is-connecting' : ''}`}>
          <span className="handle-orb__glow" />
          <span className="handle-orb__ring" />
          <span className="handle-orb__dot" />
        </span>
      </Handle>

      <NodeHeader
        icon={<Paperclip className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
        title={UI_TEXT.title}
        right={(
          <span className={`ml-auto ${themeClasses.nodeBadge} ${statusMeta.toneClassName}`}>
            {statusMeta.icon}
            {statusMeta.label}
          </span>
        )}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={LLM_INPUT_FILE_ACCEPT}
          className="hidden"
          onChange={handleFileChange}
        />

        {selectedPreset && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${themeClasses.nodeBadge} ${themeClasses.nodeBadgeViolet}`}>
              {selectedPreset.label}
            </span>
          </div>
        )}

        {hasInputAssets && (
          <div className={themeClasses.nodeAssetStrip}>
            <div className="flex max-w-full items-center gap-1 overflow-x-auto pr-0.5">
              {inputImages.map((inputImage, index) => (
                <span
                  key={inputImage.sourceId}
                  title={`第 ${index + 1} 张输入图片`}
                  className={`group/reference-thumb ${themeClasses.nodeAssetThumb}`}
                >
                  <CanvasImagePreview
                    src={inputImage.imageUrl}
                    alt=""
                    imageAsset={buildInputImageAsset(inputImage)}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                  <span className={themeClasses.nodeAssetIndexBadge}>
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    title="移除这张输入图片"
                    aria-label={`移除第 ${index + 1} 张输入图片`}
                    data-testid={`disconnect-llmfile-image-${inputImage.sourceId}-${id}`}
                    className={`${themeClasses.nodeAssetRemoveButton} group-hover/reference-thumb:pointer-events-auto group-hover/reference-thumb:opacity-100`}
                    onPointerDown={stopCanvasGesture}
                    onMouseDown={stopCanvasGesture}
                    onClick={(event) => {
                      stopCanvasGesture(event)
                      runTracked(() => deleteEdgesBySourceTarget(inputImage.sourceId, id))
                    }}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}

              {inputFiles.map((file) => (
                <span
                  key={file.id}
                  title={`${file.name} · ${formatFileSize(file.size)}`}
                  className="group/file-thumb relative flex h-9 w-[92px] shrink-0 items-center gap-1.5 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)] px-2 pr-6 text-[10px] text-[var(--text-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                >
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)] text-[var(--accent-violet-strong)]">
                    <FileText className="h-3 w-3" />
                  </span>
                  <span className="truncate leading-tight">{file.name}</span>
                  <button
                    type="button"
                    title="移除附件"
                    aria-label={`移除附件 ${file.name}`}
                    className={`${themeClasses.nodeAssetRemoveButton} group-hover/file-thumb:pointer-events-auto group-hover/file-thumb:opacity-100`}
                    onPointerDown={stopCanvasGesture}
                    onMouseDown={stopCanvasGesture}
                    onClick={(event) => {
                      stopCanvasGesture(event)
                      runTracked(() => updateNodeData(id, {
                        inputFiles: inputFiles.filter((item) => item.id !== file.id),
                        errorMsg: '',
                      }))
                    }}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="relative flex min-h-[120px] flex-1">
          <RichPromptEditor
            value={richPromptDraft ?? createRichPromptDocumentFromText(instructionDraft)}
            fallbackText={instructionDraft}
            references={richPromptReferences}
            placeholder={UI_TEXT.instructionPlaceholder}
            readOnly={false}
            onFocus={beginTransaction}
            onChange={(nextRichPrompt, nextText) => {
              updateRichPromptDraft(nextText, nextRichPrompt)
              syncRichPromptToStore(nextText, nextRichPrompt)
            }}
            onBlur={() => {
              syncRichPromptToStore(latestInstructionDraftRef.current, latestRichPromptDraftRef.current)
              commitTransaction()
            }}
          />
          {hasConnectedInputNode && (
            <div className="pointer-events-none absolute bottom-3 right-3">
              <span className="inline-flex items-center rounded-md border border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)] px-2 py-1 text-[11px] font-medium text-[var(--accent-violet-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                {UI_TEXT.linkedTextToken}
              </span>
            </div>
          )}
        </div>

        <div className={themeClasses.nodeFooter}>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,0.82fr)_auto_auto] items-center gap-1.5">
            <InlineSelect
              value={data.presetId || '__none__'}
              options={presetOptions}
              ariaLabel={UI_TEXT.choosePreset}
              onChange={handlePresetChange}
              stopCanvasGesture={stopCanvasGesture}
              menuClassName="min-w-[200px]"
            />

            <InlineSelect
              value={hasChatModel ? (data.model || chatModels[0]?.modelId || '__empty__') : '__empty__'}
              options={modelOptions}
              ariaLabel={UI_TEXT.chooseModel}
              onChange={(value) => runTracked(() => updateNodeData(id, { model: value, errorMsg: '' }))}
              stopCanvasGesture={stopCanvasGesture}
              menuClassName="min-w-[230px]"
            />

            <InlineSelect
              value={data.outputFormat}
              options={outputFormatOptions}
              ariaLabel={UI_TEXT.chooseOutputFormat}
              onChange={(value) => runTracked(() => updateNodeData(id, { outputFormat: value, errorMsg: '' }))}
              stopCanvasGesture={stopCanvasGesture}
              menuClassName="min-w-[140px]"
            />

            <button
              type="button"
              title={inputFileCount > 0 ? `${UI_TEXT.uploadMoreFiles}（${inputFileCount}/${maxInputFiles}）` : UI_TEXT.uploadFiles}
              aria-label={inputFileCount > 0 ? `${UI_TEXT.uploadMoreFiles}（${inputFileCount}/${maxInputFiles}）` : UI_TEXT.uploadFiles}
              data-testid={`upload-llm-file-${id}`}
              disabled={remainingFileSlots === 0}
              onPointerDown={stopCanvasGesture}
              onMouseDown={stopCanvasGesture}
              onClick={(event) => {
                stopCanvasGesture(event)
                fileInputRef.current?.click()
              }}
              className={`${themeClasses.nodeActionButton} relative h-8 w-8 shrink-0 duration-200 disabled:cursor-not-allowed disabled:text-[var(--text-muted)]`}
            >
              <Paperclip className="h-3.5 w-3.5" />
              {inputFileCount > 0 && (
                <span className="pointer-events-none absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--accent-violet)] px-1 text-[9px] font-semibold leading-4 text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                  {inputFileCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleRun}
              disabled={!canRun}
              data-testid={`run-llm-${id}`}
              aria-label={isRunning ? UI_TEXT.running : UI_TEXT.run}
              className={`${themeClasses.nodePrimaryButton} h-9 w-9 shrink-0 shadow-none duration-200`}
            >
              {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            </button>
          </div>

          {!hasChatModel && (
            <p className={`${themeClasses.nodeInlineNotice} ${themeClasses.nodeWarningText}`}>{UI_TEXT.noModel}</p>
          )}

          {data.errorMsg && (
            <p className={`${themeClasses.nodeInlineNotice} ${data.status === 'success' ? themeClasses.nodeWarningText : themeClasses.nodeErrorText}`}>
              {data.errorMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}, areNodeContentPropsEqual)
