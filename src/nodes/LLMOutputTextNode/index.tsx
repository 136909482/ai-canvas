import { memo, useCallback, useEffect, useState } from 'react'
import { Handle, Position, useConnection, type OnResizeEnd } from '@xyflow/react'
import { AlertTriangle, Bot, Braces, Check, CheckCircle2, Copy, Eye, Loader2, Pencil } from 'lucide-react'
import { canEditLLMOutput, getLLMOutputModeLabel } from '@/features/llm/outputEditMode'
import { StableNodeToolbar } from '@/components/StableNodeToolbar'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { themeClasses } from '@/styles/themeClasses'
import type { AppNodeProps } from '@/types'
import { NodeDeleteButton, NodeHeader, NodeResizerPreset } from '../nodeShell'
import { getNodeShellClassName } from '../nodeShellClassName'
import { areNodeContentPropsEqual } from '../nodePropComparators'
import { SharedTextEditor } from '../SharedTextEditor'
import { LLMOutputViewer } from './LLMOutputViewer'

type LLMOutputTextNodeProps = AppNodeProps<'llmOutputTextNode'>

const NODE_TOOLBAR_CLASS_NAME = `nodrag nopan flex items-center gap-1 p-[5px] ${themeClasses.nodeToolbarPanel}`
const NODE_TOOLBAR_BUTTON_CLASS_NAME = `${themeClasses.nodeToolbarButton} h-7 w-7`

const UI_TEXT = {
  deleteNode: '删除 LLM 输出节点',
  title: 'LLM 输出',
  queued: '等待执行',
  generating: '思考中',
  success: '已完成',
  failed: '生成失败',
  placeholder: '执行完成后会在这里显示内容。',
  copy: '复制内容',
  copied: '已复制',
  copyFailed: '复制失败',
  edit: '编辑原文',
  preview: '预览渲染',
} as const

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

function buildStatusMeta(status: LLMOutputTextNodeProps['data']['status']) {
  switch (status) {
    case 'queued':
      return {
        label: UI_TEXT.queued,
        toneClassName: themeClasses.nodeBadgeAmber,
        icon: <Bot className="h-3 w-3" />,
      }
    case 'generating':
      return {
        label: UI_TEXT.generating,
        toneClassName: themeClasses.nodeBadgeViolet,
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
      }
    case 'done':
      return {
        label: UI_TEXT.success,
        toneClassName: themeClasses.nodeBadgeEmerald,
        icon: <CheckCircle2 className="h-3 w-3" />,
      }
    default:
      return {
        label: UI_TEXT.failed,
        toneClassName: themeClasses.nodeBadgeRed,
        icon: <AlertTriangle className="h-3 w-3" />,
      }
  }
}

export const LLMOutputTextNode = memo(function LLMOutputTextNode({ id, data, selected }: LLMOutputTextNodeProps) {
  const deleteNode = useCanvasStore((s) => s.deleteNode)
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)
  const beginTransaction = useHistoryStore((s) => s.beginTransaction)
  const commitTransaction = useHistoryStore((s) => s.commitTransaction)
  const runTracked = useHistoryStore((s) => s.runTracked)
  const connection = useConnection()
  const isConnecting = connection.inProgress && connection.fromNode?.id === id
  const statusMeta = buildStatusMeta(data.status)
  const isGenerating = data.status === 'generating'
  const isError = data.status === 'error'
  const hasText = Boolean((data.text || '').trim())
  const canEdit = canEditLLMOutput(data.status)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (copyState === 'idle') {
      return
    }

    const timer = window.setTimeout(() => setCopyState('idle'), 1200)
    return () => window.clearTimeout(timer)
  }, [copyState])

  const effectiveIsEditing = canEdit && isEditing

  const handleResizeEnd: OnResizeEnd = useCallback((_, params) => {
    updateNodeData(id, {
      width: Math.round(params.width),
      height: Math.round(params.height),
      layoutMode: 'manual',
    })
  }, [id, updateNodeData])

  const syncTextToStore = (nextText: string) => {
    if (nextText !== ((data.text as string) || '')) {
      updateNodeData(id, { text: nextText })
    }
  }

  const handleCopyText = async () => {
    if (!hasText) {
      return
    }

    try {
      await copyTextToClipboard((data.text as string) || '')
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  return (
    <>
      {selected ? <StableNodeToolbar isVisible={hasText && !isError ? undefined : false} position={Position.Top} offset={10}>
        <div className={NODE_TOOLBAR_CLASS_NAME}>
          <button
            type="button"
            onClick={handleCopyText}
            disabled={!hasText}
            className={NODE_TOOLBAR_BUTTON_CLASS_NAME}
            aria-label={copyState === 'copied' ? UI_TEXT.copied : copyState === 'error' ? UI_TEXT.copyFailed : UI_TEXT.copy}
            title={copyState === 'copied' ? UI_TEXT.copied : copyState === 'error' ? UI_TEXT.copyFailed : UI_TEXT.copy}
          >
            {copyState === 'copied' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setIsEditing((value) => !value)}
              className={NODE_TOOLBAR_BUTTON_CLASS_NAME}
              aria-label={effectiveIsEditing ? UI_TEXT.preview : UI_TEXT.edit}
              title={effectiveIsEditing ? UI_TEXT.preview : UI_TEXT.edit}
            >
              {effectiveIsEditing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            </button>
          ) : null}
        </div>
      </StableNodeToolbar> : null}

      <div
      data-testid={`node-${id}`}
      className={getNodeShellClassName({
        selected,
        className: 'bg-[var(--node-bg)]',
      })}
    >
      <NodeDeleteButton
        id={id}
        selected={selected}
        ariaLabel={UI_TEXT.deleteNode}
        onDelete={() => runTracked(() => deleteNode(id))}
      />

      <NodeResizerPreset
        selected={selected}
        minWidth={260}
        minHeight={180}
        maxWidth={760}
        maxHeight={900}
        onResizeStart={beginTransaction}
        onResizeEnd={handleResizeEnd}
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
        icon={<Braces className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
        title={data.label || UI_TEXT.title}
        right={(
          <span className={`ml-auto ${themeClasses.nodeBadge} ${statusMeta.toneClassName}`}>
            {statusMeta.icon}
            {statusMeta.label}
          </span>
        )}
      />

      <div className="flex min-h-0 flex-1 flex-col p-2.5">
        <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)]">
          {isGenerating && !hasText ? (
            <>
              <div className="preview-generating-surface absolute inset-0 overflow-hidden rounded-lg">
                <div className="preview-grid-overlay absolute inset-0" />
                <div className="preview-aurora preview-aurora-a absolute -left-12 top-[-10%] h-44 w-44" />
                <div className="preview-aurora preview-aurora-b absolute right-[-8%] top-[16%] h-40 w-40" />
                <div className="preview-aurora preview-aurora-c absolute left-[18%] bottom-[-18%] h-48 w-48" />
                <div className="preview-wave absolute inset-x-[-14%] top-[18%] h-24" />
                <div className="preview-wave preview-wave-delayed absolute inset-x-[-18%] bottom-[16%] h-28" />
                <div className="preview-flow-sheen absolute inset-y-[-16%] left-[-30%] w-[58%]" />
                <div className="preview-core-glow absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="preview-vignette absolute inset-0 rounded-lg" />
              <div className="relative z-10 flex flex-1 items-center justify-center px-6 text-center">
                <div className={`${themeClasses.nodeBadge} ${themeClasses.nodeBadgeViolet} normal-case tracking-normal backdrop-blur`}>
                  {UI_TEXT.generating}
                </div>
              </div>
            </>
          ) : isError ? (
            <div className="flex flex-1 items-center justify-center px-6 py-8 text-center">
              <div className="max-w-[260px]">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-red-500/25 bg-red-500/10 text-red-300">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{UI_TEXT.failed}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{data.errorMsg || UI_TEXT.placeholder}</p>
              </div>
            </div>
          ) : data.status === 'done' || hasText ? (
            <>
              {effectiveIsEditing ? (
                <SharedTextEditor
                  value={(data.text as string) || ''}
                  placeholder={UI_TEXT.placeholder}
                  rows={8}
                  onChange={syncTextToStore}
                  onBeginTransaction={beginTransaction}
                  onCommitTransaction={commitTransaction}
                  wrapperClassName="min-h-0 h-full"
                  className="flex-1 whitespace-pre-wrap break-words"
                />
              ) : (
                <LLMOutputViewer
                  text={(data.text as string) || ''}
                  outputFormat={data.outputFormat}
                  status={data.status}
                />
              )}
              {isGenerating ? (
                <div className="pointer-events-none absolute left-2 top-2 z-20">
                  <span className={`${themeClasses.nodeBadge} ${themeClasses.nodeBadgeViolet} normal-case tracking-normal backdrop-blur`}>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {UI_TEXT.generating}
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 py-8 text-center">
              <div className="max-w-[240px]">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--control-bg-hover)] text-[var(--text-secondary)]">
                  <Bot className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{UI_TEXT.queued}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{UI_TEXT.placeholder}</p>
              </div>
            </div>
          )}
        </div>

        {!isError && hasText ? (
          <p className="mt-2 px-0.5 text-[10px] leading-relaxed text-[var(--text-muted)]">
            {effectiveIsEditing ? `${getLLMOutputModeLabel(data.outputFormat)} · 编辑中` : getLLMOutputModeLabel(data.outputFormat)}
          </p>
        ) : null}
      </div>
      </div>
    </>
  )
}, areNodeContentPropsEqual)
