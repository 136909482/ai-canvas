import { memo, useEffect, useMemo, useState, type FocusEvent, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, useConnection, type Edge, type Node } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '@/store/useCanvasStore'
import { StableNodeToolbar } from '@/components/StableNodeToolbar'
import { useHistoryStore } from '@/store/useHistoryStore'
import { Check, Copy, Eraser, FilePlus2, Maximize, RotateCcw, Save, Type, X } from 'lucide-react'
import type { AppNodeProps } from '@/types'
import { themeClasses } from '@/styles/themeClasses'
import { RichPromptEditor } from '@/features/richPrompt/RichPromptEditor'
import { createRichPromptDocumentFromText } from '@/features/richPrompt/promptCompiler'
import type { RichPromptDocument, RichPromptReferenceItem } from '@/features/richPrompt/types'
import { recordComponentRender } from '@/utils/performanceDiagnostics'
import { getWorkspaceAssetThumbnailRelativePath } from '@/utils/workspaceImageAsset'
import { NodeDeleteButton, NodeHeader, NodeResizerPreset } from '../nodeShell'
import { getNodeShellClassName } from '../nodeShellClassName'
import { areNodeContentPropsEqual } from '../nodePropComparators'

type TextNodeProps = AppNodeProps<'textNode'>

const DEFAULT_TEXT_NODE_LABEL = '提示词'
const DEFAULT_TEXT_NODE_WIDTH = 240
const DEFAULT_TEXT_NODE_HEIGHT = 190

const UI_TEXT = {
  deleteNode: '删除文本节点',
  titlePlaceholder: '标题',
  copyText: '复制文本',
  copied: '已复制',
  copyFailed: '复制失败',
  inputPlaceholder: '输入提示词...',
} as const

const TITLE_TEXT_CLASS_NAME = 'block h-5 min-w-0 truncate p-0 text-xs font-medium leading-5 normal-case tracking-normal text-[var(--text-secondary)]'
const NODE_TOOLBAR_CLASS_NAME = `nodrag nopan flex items-center gap-1 p-[5px] ${themeClasses.nodeToolbarPanel}`
const NODE_TOOLBAR_BUTTON_CLASS_NAME = `${themeClasses.nodeToolbarButton} h-7 w-7`
const RICH_PROMPT_REFERENCE_KEY_SEPARATOR = '\u0000'
const FULLSCREEN_EDITOR_TEXT = {
  enlarge: '放大编辑',
  closeEditor: '关闭编辑器',
  saveAndClose: '保存并关闭',
} as const

const QUICK_TOOLBAR_TEXT = {
  copyBodyText: '\u590d\u5236\u6b63\u6587',
  bodyCopied: '\u5df2\u590d\u5236\u6b63\u6587',
  copyBodyFailed: '\u590d\u5236\u6b63\u6587\u5931\u8d25',
  clearText: '清空文本',
  duplicateAsTextNode: '复制为新文本节点',
} as const

const CLEAR_NOTICE_TEXT = {
  cleared: '\u5df2\u6e05\u7a7a',
  undo: '\u64a4\u9500',
} as const

function getTextStats(text: string) {
  const characters = text.length
  const lines = text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length
  const cjkCharacters = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0
  const latinWords = text
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  const tokens = Math.max(0, Math.ceil(cjkCharacters * 1.6 + latinWords * 1.3))

  return { characters, lines, tokens }
}

function encodeRichPromptReferenceKey(item: Pick<RichPromptReferenceItem, 'sourceId' | 'imageUrl' | 'thumbnailRelativePath'>) {
  return [
    item.sourceId,
    item.imageUrl,
    item.thumbnailRelativePath ?? '',
  ].join(RICH_PROMPT_REFERENCE_KEY_SEPARATOR)
}

function decodeRichPromptReferenceKey(key: string, index: number): RichPromptReferenceItem | null {
  const separatorIndex = key.indexOf(RICH_PROMPT_REFERENCE_KEY_SEPARATOR)
  if (separatorIndex < 0) {
    return null
  }

  const sourceId = key.slice(0, separatorIndex)
  const imageUrl = key.slice(separatorIndex + RICH_PROMPT_REFERENCE_KEY_SEPARATOR.length)
  const thumbnailSeparatorIndex = imageUrl.indexOf(RICH_PROMPT_REFERENCE_KEY_SEPARATOR)
  const resolvedImageUrl = thumbnailSeparatorIndex >= 0
    ? imageUrl.slice(0, thumbnailSeparatorIndex)
    : imageUrl
  const thumbnailRelativePath = thumbnailSeparatorIndex >= 0
    ? imageUrl.slice(thumbnailSeparatorIndex + RICH_PROMPT_REFERENCE_KEY_SEPARATOR.length)
    : ''
  return sourceId && resolvedImageUrl
    ? {
      sourceId,
      imageUrl: resolvedImageUrl,
      thumbnailRelativePath: thumbnailRelativePath || undefined,
      label: `图片${index + 1}`,
      order: index + 1,
    }
    : null
}

function isImageReferenceNode(node: unknown): node is {
  id: string
  type: 'imageNode' | 'generatedPreviewNode' | 'testImageNode'
  data: { imageUrl: string; imageAsset?: unknown }
} {
  return Boolean(
    node
    && typeof node === 'object'
    && 'type' in node
    && (
      node.type === 'imageNode'
      || node.type === 'generatedPreviewNode'
      || node.type === 'testImageNode'
    )
    && 'data' in node
    && typeof node.data === 'object'
    && node.data
    && 'imageUrl' in node.data
    && typeof node.data.imageUrl === 'string'
    && node.data.imageUrl,
  )
}

function getOrderedStringIds(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function buildTextNodeRichPromptReferences({
  textNodeId,
  nodes,
  edges,
}: {
  textNodeId: string
  nodes: Node[]
  edges: Edge[]
}): RichPromptReferenceItem[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const referenceSourceIds: string[] = []
  const pushReferenceSourceId = (sourceId: string | null | undefined) => {
    if (!sourceId || referenceSourceIds.includes(sourceId)) {
      return
    }

    if (isImageReferenceNode(nodeById.get(sourceId))) {
      referenceSourceIds.push(sourceId)
    }
  }

  edges
    .filter((edge) => edge.target === textNodeId)
    .forEach((edge) => pushReferenceSourceId(edge.source))

  const connectedGenerateNodes = edges
    .filter((edge) => edge.source === textNodeId)
    .map((edge) => nodeById.get(edge.target ?? ''))
    .filter((node) => node?.type === 'generateNode')

  for (const generateNode of connectedGenerateNodes) {
    const referenceSourceOrder = getOrderedStringIds(generateNode?.data?.referenceSourceOrder)
    const imageEdgeSourceIds = edges
      .filter((edge) => edge.target === generateNode?.id && edge.targetHandle !== 'mask')
      .map((edge) => edge.source)
      .filter((sourceId): sourceId is string => typeof sourceId === 'string')

    referenceSourceOrder.forEach(pushReferenceSourceId)
    imageEdgeSourceIds.forEach(pushReferenceSourceId)
  }

  return referenceSourceIds
    .map((sourceId, index): RichPromptReferenceItem | null => {
      const node = nodeById.get(sourceId)
      if (!isImageReferenceNode(node)) {
        return null
      }

      return {
        sourceId: node.id,
        imageUrl: node.data.imageUrl,
        thumbnailRelativePath: getWorkspaceAssetThumbnailRelativePath(node.data.imageAsset),
        label: `图片${index + 1}`,
        order: index + 1,
      }
    })
    .filter((reference): reference is RichPromptReferenceItem => Boolean(reference))
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()

  if (!copied) {
    throw new Error(UI_TEXT.copyFailed)
  }
}

export const TextNode = memo(function TextNode({ id, data, selected, dragging }: TextNodeProps) {
  recordComponentRender('TextNode')
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)
  const addTextNode = useCanvasStore((s) => s.addTextNode)
  const deleteNode = useCanvasStore((s) => s.deleteNode)
  const selectRichPromptReferenceKeys = useMemo(() => (
    (state: { nodes: Node[]; edges: Edge[] }) => buildTextNodeRichPromptReferences({
      textNodeId: id,
      nodes: state.nodes,
      edges: state.edges,
    }).map(encodeRichPromptReferenceKey)
  ), [id])
  const richPromptReferenceKeys = useCanvasStore(useShallow(selectRichPromptReferenceKeys))
  const beginTransaction = useHistoryStore((s) => s.beginTransaction)
  const commitTransaction = useHistoryStore((s) => s.commitTransaction)
  const runTracked = useHistoryStore((s) => s.runTracked)
  const undo = useHistoryStore((s) => s.undo)
  const connection = useConnection()
  const isConnecting = connection.inProgress && connection.fromNode?.id === id
  const text = (data.text as string) || ''
  const richPrompt = data.richPrompt as RichPromptDocument | null | undefined
  const label = typeof data.label === 'string' && data.label.trim() && data.label !== 'Prompt'
    ? data.label
    : DEFAULT_TEXT_NODE_LABEL
  const stats = useMemo(() => getTextStats(text), [text])
  const richPromptValue = useMemo(
    () => richPrompt ?? createRichPromptDocumentFromText(text),
    [richPrompt, text],
  )
  const richPromptReferences = useMemo<RichPromptReferenceItem[]>(
    () => richPromptReferenceKeys
      .map(decodeRichPromptReferenceKey)
      .filter((item): item is RichPromptReferenceItem => Boolean(item)),
    [richPromptReferenceKeys],
  )
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const [fullscreenText, setFullscreenText] = useState(text)
  const [titleEditing, setTitleEditing] = useState(false)
  const [clearNoticeId, setClearNoticeId] = useState<number | null>(null)
  const showClearNotice = clearNoticeId !== null && !text

  useEffect(() => {
    if (copyState === 'idle') {
      return
    }

    const timer = window.setTimeout(() => setCopyState('idle'), 1200)
    return () => window.clearTimeout(timer)
  }, [copyState])

  useEffect(() => {
    if (!fullscreenOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFullscreenOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [fullscreenOpen])

  useEffect(() => {
    if (clearNoticeId === null) {
      return
    }

    const timer = window.setTimeout(() => setClearNoticeId(null), 3600)
    return () => window.clearTimeout(timer)
  }, [clearNoticeId])

  const stopCanvasGesture = (event: SyntheticEvent) => {
    event.stopPropagation()
  }

  const handleTitleFocus = (event: FocusEvent<HTMLInputElement>) => {
    stopCanvasGesture(event)
    event.currentTarget.select()
    beginTransaction()
  }

  const commitTitle = (nextLabel: string) => {
    const normalizedLabel = nextLabel.trim() || DEFAULT_TEXT_NODE_LABEL

    if (normalizedLabel !== label) {
      updateNodeData(id, { label: normalizedLabel })
    }

    commitTransaction()
    setTitleEditing(false)
  }

  const handleCopyText = async () => {
    try {
      await copyTextToClipboard(text)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  const handleClearText = () => {
    if (!text) {
      return
    }

    runTracked(() => {
      updateNodeData(id, { text: '' })
    })
    setCopyState('idle')
    setClearNoticeId(Date.now())
  }

  const handleUndoClearText = () => {
    undo()
    setClearNoticeId(null)
  }

  const handleDuplicateTextNode = () => {
    if (!text) {
      return
    }

    runTracked(() => {
      const sourceNode = useCanvasStore.getState().nodes.find((node) => node.id === id)
      const sourcePosition = sourceNode?.position ?? { x: 0, y: 0 }
      const sourceWidth = typeof sourceNode?.width === 'number' ? sourceNode.width : DEFAULT_TEXT_NODE_WIDTH
      const sourceHeight = typeof sourceNode?.height === 'number' ? sourceNode.height : DEFAULT_TEXT_NODE_HEIGHT
      const newNodeId = addTextNode({
        x: sourcePosition.x + sourceWidth + 32,
        y: sourcePosition.y,
      })

      updateNodeData(newNodeId, {
        text,
        richPrompt,
        label,
        focusBodyRequestId: Date.now(),
        width: sourceWidth,
        height: sourceHeight,
      })
    })
  }

  const openFullscreenEditor = () => {
    setFullscreenText(text)
    setFullscreenOpen(true)
    beginTransaction()
  }

  const saveFullscreenEditor = () => {
    if (fullscreenText !== text) {
      updateNodeData(id, { text: fullscreenText })
    }

    commitTransaction()
    setFullscreenOpen(false)
  }

  return (
    <>
      {selected ? <StableNodeToolbar isVisible={!dragging ? undefined : false} position={Position.Top} offset={10}>
        <div className={NODE_TOOLBAR_CLASS_NAME}>
          <button
            type="button"
            onClick={handleCopyText}
            disabled={!text}
            className={NODE_TOOLBAR_BUTTON_CLASS_NAME}
            aria-label={copyState === 'copied' ? QUICK_TOOLBAR_TEXT.bodyCopied : QUICK_TOOLBAR_TEXT.copyBodyText}
            title={copyState === 'copied' ? QUICK_TOOLBAR_TEXT.bodyCopied : copyState === 'error' ? QUICK_TOOLBAR_TEXT.copyBodyFailed : QUICK_TOOLBAR_TEXT.copyBodyText}
          >
            {copyState === 'copied' ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleClearText}
            disabled={!text}
            className={NODE_TOOLBAR_BUTTON_CLASS_NAME}
            aria-label={QUICK_TOOLBAR_TEXT.clearText}
            title={QUICK_TOOLBAR_TEXT.clearText}
          >
            <Eraser className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDuplicateTextNode}
            disabled={!text}
            className={NODE_TOOLBAR_BUTTON_CLASS_NAME}
            aria-label={QUICK_TOOLBAR_TEXT.duplicateAsTextNode}
            title={QUICK_TOOLBAR_TEXT.duplicateAsTextNode}
          >
            <FilePlus2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={openFullscreenEditor}
            className={NODE_TOOLBAR_BUTTON_CLASS_NAME}
            aria-label={FULLSCREEN_EDITOR_TEXT.enlarge}
            title={FULLSCREEN_EDITOR_TEXT.enlarge}
          >
            <Maximize className="h-3.5 w-3.5" />
          </button>
        </div>
      </StableNodeToolbar> : null}

      <div
        data-testid={`node-${id}`}
        className={getNodeShellClassName({ selected })}
      >
        <NodeDeleteButton
          id={id}
          selected={selected}
          ariaLabel={UI_TEXT.deleteNode}
          onDelete={() => runTracked(() => deleteNode(id))}
        />

        <NodeResizerPreset
          selected={selected}
          minWidth={220}
          minHeight={DEFAULT_TEXT_NODE_HEIGHT}
          maxWidth={700}
          maxHeight={600}
          hideVisuals
        />

        <Handle
          type="target"
          position={Position.Left}
          id="input"
          className="handle-orb-anchor !w-[18px] !h-[18px] !rounded-full !border-0 !bg-transparent !p-0"
        >
          <span className="handle-orb handle-orb--target">
            <span className="handle-orb__glow" />
            <span className="handle-orb__ring" />
            <span className="handle-orb__dot" />
          </span>
        </Handle>

        <NodeHeader
          icon={<Type className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
          title={(
            <span className="flex h-5 min-w-0 items-center">
              {titleEditing ? (
                <input
                  defaultValue={label}
                  placeholder={UI_TEXT.titlePlaceholder}
                  onFocus={handleTitleFocus}
                  onBlur={(event) => commitTitle(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur()
                    }
                  }}
                  onPointerDown={stopCanvasGesture}
                  onMouseDown={stopCanvasGesture}
                  onClick={stopCanvasGesture}
                  className={`nodrag nopan w-full cursor-grab bg-transparent outline-none placeholder:text-[var(--text-muted)] focus:cursor-text active:cursor-text ${TITLE_TEXT_CLASS_NAME}`}
                  autoFocus
                />
              ) : (
                <span
                  className={TITLE_TEXT_CLASS_NAME}
                  title="双击编辑标题"
                  onDoubleClick={(event) => {
                    stopCanvasGesture(event)
                    setTitleEditing(true)
                  }}
                >
                  {label}
                </span>
              )}
            </span>
          )}
        />

        <div className="flex min-h-0 flex-1 flex-col p-3">
          <RichPromptEditor
            value={richPromptValue}
            fallbackText={text}
            references={richPromptReferences}
            placeholder={UI_TEXT.inputPlaceholder}
            readOnly={false}
            minHeightClassName="min-h-[88px]"
            onChange={(nextDocument, nextText) => {
              if (nextText !== text || nextDocument !== richPrompt) {
                updateNodeData(id, {
                  text: nextText,
                  richPrompt: nextDocument,
                })
              }
            }}
            onFocus={beginTransaction}
            onBlur={commitTransaction}
          />
          <div className="mt-2 flex h-4 shrink-0 items-center justify-between gap-2 px-0.5 text-[10px] font-medium text-[var(--text-muted)]">
            <span className="truncate">{stats.characters} 字符</span>
            <span className="flex shrink-0 items-center gap-2">
              <span>{stats.lines} 行</span>
              <span>≈ {stats.tokens} tokens</span>
            </span>
          </div>
        </div>

        {showClearNotice && (
          <div
            className={`nodrag nopan absolute bottom-8 left-3 z-40 flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-medium ${themeClasses.strongPanel} ${themeClasses.textSecondary}`}

            onPointerDown={stopCanvasGesture}
            onMouseDown={stopCanvasGesture}
            onClick={stopCanvasGesture}
          >
            <span>{CLEAR_NOTICE_TEXT.cleared}</span>
            <button
              type="button"
              onClick={handleUndoClearText}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-violet-500 transition hover:bg-violet-400/10 hover:text-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/20"
            >
              <RotateCcw className="h-3 w-3" />
              {CLEAR_NOTICE_TEXT.undo}
            </button>
          </div>
        )}

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
      </div>
      {fullscreenOpen && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 animate-[modal-fade-in_0.2s_ease-out]"

          onClick={saveFullscreenEditor}
        >
          <div
            className={`flex h-[min(78vh,48rem)] w-[min(88vw,64rem)] flex-col overflow-hidden rounded-2xl ${themeClasses.strongPanel}`}

            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--control-bg)] px-4">
              <Type className="h-4 w-4 text-[var(--text-muted)]" />
              <input
                defaultValue={label}
                placeholder={UI_TEXT.titlePlaceholder}
                onFocus={() => beginTransaction()}
                onBlur={(event) => commitTitle(event.currentTarget.value)}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
              <span className="hidden shrink-0 text-[11px] font-medium text-[var(--text-muted)] sm:inline">
                {getTextStats(fullscreenText).characters} 字符 · {getTextStats(fullscreenText).lines} 行 · ≈ {getTextStats(fullscreenText).tokens} tokens
              </span>
              <button
                type="button"
                onClick={saveFullscreenEditor}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-secondary)] transition hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]"
                aria-label={FULLSCREEN_EDITOR_TEXT.saveAndClose}
                title={FULLSCREEN_EDITOR_TEXT.saveAndClose}
              >
                <Save className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setFullscreenOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-secondary)] transition hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]"
                aria-label={FULLSCREEN_EDITOR_TEXT.closeEditor}
                title={FULLSCREEN_EDITOR_TEXT.closeEditor}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={fullscreenText}
              onChange={(event) => setFullscreenText(event.currentTarget.value)}
              autoFocus
              className="min-h-0 flex-1 resize-none bg-[var(--control-bg)] px-6 py-5 text-[15px] leading-7 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              placeholder={UI_TEXT.inputPlaceholder}
              style={{ fontFamily: '"Microsoft YaHei", sans-serif' }}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}, areNodeContentPropsEqual)
