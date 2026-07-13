import { memo, useEffect, useMemo, type SyntheticEvent } from 'react'
import { Handle, Position, useConnection, useUpdateNodeInternals } from '@xyflow/react'
import { Link2, Play, ScissorsLineDashed } from 'lucide-react'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import type { AppNodeProps } from '@/types'
import { themeClasses } from '@/styles/themeClasses'
import { NodeDeleteButton, NodeHeader, NodeResizerPreset } from '../nodeShell'
import { getNodeShellClassName } from '../nodeShellClassName'
import { areNodeContentPropsEqual } from '../nodePropComparators'

type InlineTextSplitterNodeProps = AppNodeProps<'inlineTextSplitterNode'>

const UI_TEXT = {
  deleteNode: '删除内联文本分割节点',
  title: '文本分割',
  linked: '已连接文本',
  unlinked: '等待文本输入',
  separator: '按以下方式分割文本',
  run: '分割文本',
  emptyInput: '连接文本节点后运行',
} as const

export const InlineTextSplitterNode = memo(function InlineTextSplitterNode({ id, data, selected }: InlineTextSplitterNodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)
  const deleteNode = useCanvasStore((s) => s.deleteNode)
  const syncInlineTextSplitterParts = useCanvasStore((s) => s.syncInlineTextSplitterParts)
  const runTracked = useHistoryStore((s) => s.runTracked)
  const connection = useConnection()
  const updateNodeInternals = useUpdateNodeInternals()
  const isConnecting = connection.inProgress && connection.fromNode?.id === id
  const inputText = typeof data.inputText === 'string' ? data.inputText : ''
  const separator = typeof data.separator === 'string' ? data.separator : '*'
  const parts = useMemo(
    () => (Array.isArray(data.parts) ? data.parts.filter((part): part is string => typeof part === 'string') : []),
    [data.parts],
  )
  const hasInputText = Boolean(inputText.trim())
  const handleTopByIndex = (index: number) => `calc(128px + ${index} * 52px)`

  const stopCanvasGesture = (event: SyntheticEvent) => {
    event.stopPropagation()
  }

  const updatePart = (index: number, nextPart: string) => {
    const nextParts = parts.map((part, partIndex) => (partIndex === index ? nextPart : part))
    updateNodeData(id, { parts: nextParts, errorMsg: '' })
  }

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => updateNodeInternals(id))
    return () => window.cancelAnimationFrame(frameId)
  }, [id, parts.length, updateNodeInternals])

  return (
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
        minWidth={360}
        minHeight={320}
        maxWidth={620}
        maxHeight={1200}
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
        icon={<ScissorsLineDashed className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
        title={UI_TEXT.title}
        right={(
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-medium text-[var(--text-muted)]">{parts.length}段</span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              data.connectedTextNode
                ? 'border-violet-400/20 bg-violet-400/8 text-violet-200'
                : 'border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-muted)]'
            }`}>
              <Link2 className="h-3 w-3" />
              {data.connectedTextNode ? UI_TEXT.linked : UI_TEXT.unlinked}
            </span>
          </div>
        )}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="grid grid-cols-[1fr_7rem] items-center gap-3">
          <span className="text-xs font-medium text-[var(--text-secondary)]">{UI_TEXT.separator}</span>
          <input
            value={separator}
            onPointerDown={stopCanvasGesture}
            onMouseDown={stopCanvasGesture}
            onClick={stopCanvasGesture}
            onChange={(event) => updateNodeData(id, { separator: event.currentTarget.value, errorMsg: '' })}
            className={`nowheel nodrag nopan h-9 px-3 text-xs font-semibold ${themeClasses.nodeInput}`}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-visible p-2">
          {parts.length > 0 ? (
            <div className="space-y-3">
              {parts.map((part, index) => (
                <div key={`part-${index}`} className="relative">
                  <div className="flex min-h-10 items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)] px-3 py-2 text-xs text-[var(--text-secondary)] focus-within:border-violet-400/45 focus-within:bg-[var(--control-bg-hover)]">
                    <span className="w-5 shrink-0 text-right font-mono text-[10px] text-[var(--text-muted)]">{index + 1}.</span>
                    <input
                      value={part}
                      onPointerDown={stopCanvasGesture}
                      onMouseDown={stopCanvasGesture}
                      onClick={stopCanvasGesture}
                      onChange={(event) => updatePart(index, event.currentTarget.value)}
                      className="nowheel nodrag nopan min-w-0 flex-1 bg-transparent text-xs font-semibold text-[var(--text-primary)] outline-none"
                      title={part}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
              {hasInputText ? '点击运行生成分段' : UI_TEXT.emptyInput}
            </div>
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
          <div className="min-w-0 text-[10px] text-[var(--text-muted)]">
            {data.errorMsg ? <span className="truncate text-red-300">{data.errorMsg}</span> : <span>输出端口会跟随分段数量生成</span>}
          </div>
          <button
            type="button"
            onClick={() => runTracked(() => syncInlineTextSplitterParts(id))}
            disabled={!hasInputText}
            className={`${themeClasses.nodePrimaryButton} h-8 w-8 shrink-0`}
            aria-label={UI_TEXT.run}
            data-testid={`run-inline-text-splitter-${id}`}
          >
            <Play className="h-3.5 w-3.5 fill-current" />
          </button>
        </div>
      </div>

      {parts.map((_, index) => (
        <Handle
          key={`handle-${index}`}
          type="source"
          position={Position.Right}
          id={`part-${index}`}
          className="handle-orb-anchor !right-[-9px] !h-[18px] !w-[18px] !rounded-full !border-0 !bg-transparent !p-0"
          style={{ top: handleTopByIndex(index) }}
        >
          <span className={`handle-orb handle-orb--source ${isConnecting ? 'is-connecting' : ''}`}>
            <span className="handle-orb__glow" />
            <span className="handle-orb__ring" />
            <span className="handle-orb__dot" />
          </span>
        </Handle>
      ))}
    </div>
  )
}, areNodeContentPropsEqual)
