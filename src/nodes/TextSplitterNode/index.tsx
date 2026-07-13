import { memo, type SyntheticEvent } from 'react'
import { Handle, Position, useConnection } from '@xyflow/react'
import { Link2, Play, ScissorsLineDashed } from 'lucide-react'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import type { AppNodeProps } from '@/types'
import { themeClasses } from '@/styles/themeClasses'
import { NodeDeleteButton, NodeHeader, NodeResizerPreset } from '../nodeShell'
import { getNodeShellClassName } from '../nodeShellClassName'
import { areNodeContentPropsEqual } from '../nodePropComparators'

type TextSplitterNodeProps = AppNodeProps<'textSplitterNode'>

const UI_TEXT = {
  deleteNode: '删除文本分割节点',
  title: '文本分割',
  linked: '已连接文本',
  unlinked: '等待文本输入',
  separator: '分隔符',
  separatorPlaceholder: '例如：--- 或 \\n\\n',
  run: '分割文本',
  emptyInput: '连接文本节点后运行',
} as const

function normalizeSeparatorPreview(separator: string) {
  return separator || '未设置'
}

export const TextSplitterNode = memo(function TextSplitterNode({ id, data, selected }: TextSplitterNodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)
  const deleteNode = useCanvasStore((s) => s.deleteNode)
  const syncTextSplitterOutputs = useCanvasStore((s) => s.syncTextSplitterOutputs)
  const runTracked = useHistoryStore((s) => s.runTracked)
  const connection = useConnection()
  const isConnecting = connection.inProgress && connection.fromNode?.id === id
  const inputText = typeof data.inputText === 'string' ? data.inputText : ''
  const separator = typeof data.separator === 'string' ? data.separator : '\\n\\n'
  const outputCount = Array.isArray(data.outputNodeIds) ? data.outputNodeIds.length : 0
  const hasInputText = Boolean(inputText.trim())

  const stopCanvasGesture = (event: SyntheticEvent) => {
    event.stopPropagation()
  }

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
        minWidth={320}
        minHeight={220}
        maxWidth={560}
        maxHeight={420}
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
          <span className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
            data.connectedTextNode
              ? 'border-violet-400/20 bg-violet-400/8 text-violet-200'
              : 'border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-muted)]'
          }`}>
            <Link2 className="h-3 w-3" />
            {data.connectedTextNode ? UI_TEXT.linked : UI_TEXT.unlinked}
          </span>
        )}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)]">
          <div className="text-splitter-scrollbar h-full overflow-y-auto px-3 py-2.5 text-xs leading-5 text-[var(--text-secondary)]">
            {hasInputText ? (
              <pre className="whitespace-pre-wrap break-words font-sans">{inputText}</pre>
            ) : (
              <span className="text-[var(--text-muted)]">{UI_TEXT.emptyInput}</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <label className="min-w-0">
            <span className={`mb-1 block text-[10px] font-medium ${themeClasses.nodeHint}`}>{UI_TEXT.separator}</span>
            <input
              value={separator}
              onPointerDown={stopCanvasGesture}
              onMouseDown={stopCanvasGesture}
              onClick={stopCanvasGesture}
              onChange={(event) => updateNodeData(id, { separator: event.currentTarget.value, errorMsg: '' })}
              placeholder={UI_TEXT.separatorPlaceholder}
              className={`nowheel nodrag nopan h-8 w-full px-2.5 text-xs font-medium ${themeClasses.nodeInput}`}
              title={`当前分隔符：${normalizeSeparatorPreview(separator)}`}
            />
          </label>

          <button
            type="button"
            onClick={() => runTracked(() => syncTextSplitterOutputs(id))}
            disabled={!hasInputText}
            className={`${themeClasses.nodePrimaryButton} h-8 w-8 shrink-0`}
            aria-label={UI_TEXT.run}
            data-testid={`run-text-splitter-${id}`}
          >
            <Play className="h-3.5 w-3.5 fill-current" />
          </button>
        </div>

        <div className="flex min-h-4 items-center justify-between gap-2 px-0.5 text-[10px] text-[var(--text-muted)]">
          <span>输出 {outputCount} 段</span>
          {data.errorMsg ? <span className="truncate text-red-300">{data.errorMsg}</span> : null}
        </div>
      </div>

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
  )
}, areNodeContentPropsEqual)
