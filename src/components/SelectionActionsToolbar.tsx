import { useMemo, useState } from 'react'
import { NodeToolbar, Position } from '@xyflow/react'
import { AlignHorizontalSpaceAround, AlignVerticalSpaceAround, BookmarkPlus, Layers3, Trash2, Ungroup } from 'lucide-react'
import { TooltipIconButton } from '@/components/TooltipIconButton'
import { selectSelectedGroupNodes, selectSelectedTopLevelNodes, useCanvasStore } from '@/store/useCanvasStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { useWorkflowTemplateStore } from '@/store/useWorkflowTemplateStore'
import { themeClasses } from '@/styles/themeClasses'
import type { GroupNodeColor } from '@/types'
import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'

const UI_TEXT = {
  group: '\u7F16\u7EC4',
  ungroup: '\u53D6\u6D88\u7F16\u7EC4',
  remove: '\u5220\u9664',
  arrangeH: '\u6C34\u5E73\u6392\u5217',
  arrangeV: '\u5782\u76F4\u6392\u5217',
  changeColor: '\u5207\u6362\u7F16\u7EC4\u989C\u8272',
  saveTemplate: '\u4FDD\u5B58\u4E3A\u5DE5\u4F5C\u6D41\u6A21\u677F',
} as const

const DEFAULT_GROUP_COLOR: GroupNodeColor = 'violet'

const GROUP_COLOR_OPTIONS: { id: GroupNodeColor; label: string; swatchClassName: string }[] = [
  { id: 'violet', label: '\u7D2B\u8272', swatchClassName: 'bg-[#8648a0]' },
  { id: 'blue', label: '\u84DD\u8272', swatchClassName: 'bg-[#3d6fa7]' },
  { id: 'green', label: '\u7EFF\u8272', swatchClassName: 'bg-[#4d8a5a]' },
  { id: 'amber', label: '\u9EC4\u8272', swatchClassName: 'bg-[#a4973b]' },
  { id: 'rose', label: '\u7EA2\u8272', swatchClassName: 'bg-[#964243]' },
  { id: 'slate', label: '\u7070\u8272', swatchClassName: 'bg-[#d7d7d2]' },

]

function getGroupColorOption(color: unknown) {
  return GROUP_COLOR_OPTIONS.find((option) => option.id === color) ?? GROUP_COLOR_OPTIONS[0]
}

const TOOLBAR_CLASS_NAME = `flex items-center gap-1 p-[5px] ${themeClasses.nodeToolbarPanel}`
const TOOLBAR_BUTTON_CLASS_NAME = `${themeClasses.nodeToolbarButton} h-7 w-7`
const DANGER_TOOLBAR_BUTTON_CLASS_NAME = 'inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent bg-transparent text-[var(--text-muted)] transition hover:border-red-400/25 hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/20 dark:hover:text-red-200'

type ToolbarIconButtonProps = {
  label: string
  onClick: () => void
  icon: ReactNode
  className: string
  testId?: string
}

function ToolbarIconButton({ label, onClick, icon, className, testId }: ToolbarIconButtonProps) {
  return (
    <TooltipIconButton
      label={label}
      onClick={onClick}
      testId={testId}
      tooltipPlacement="top"
      tooltipAlign="center"
      className={className}
      icon={icon}
    />
  )
}

export function SelectionActionsToolbar() {
  const groupSelectedNodes = useCanvasStore((s) => s.groupSelectedNodes)
  const ungroupNode = useCanvasStore((s) => s.ungroupNode)
  const deleteSelectedElements = useCanvasStore((s) => s.deleteSelectedElements)
  const arrangeSelectedNodes = useCanvasStore((s) => s.arrangeSelectedNodes)
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)
  const selectedTopLevelNodes = useCanvasStore(useShallow(selectSelectedTopLevelNodes))
  const selectedGroupNodes = useCanvasStore(useShallow(selectSelectedGroupNodes))
  const runTracked = useHistoryStore((s) => s.runTracked)
  const requestTemplateLibrary = useWorkflowTemplateStore((s) => s.requestOpen)
  const [colorMenuGroupId, setColorMenuGroupId] = useState<string | null>(null)

  const selectedNodeCount = selectedTopLevelNodes.length + selectedGroupNodes.length
  const isMultiSelection = selectedNodeCount >= 2
  const isSingleGroupSelection = selectedNodeCount === 1 && selectedGroupNodes.length === 1
  const selectedGroupNode = isSingleGroupSelection ? selectedGroupNodes[0] : null
  const selectedGroupColorOption = getGroupColorOption(selectedGroupNode?.data.color ?? DEFAULT_GROUP_COLOR)
  const isColorMenuOpen = Boolean(selectedGroupNode && colorMenuGroupId === selectedGroupNode.id)
  const toolbarNodes = useMemo(() => (
    isSingleGroupSelection
      ? selectedGroupNodes
      : [...selectedTopLevelNodes, ...selectedGroupNodes]
  ), [isSingleGroupSelection, selectedGroupNodes, selectedTopLevelNodes])
  const toolbarNodeIds = useMemo(() => toolbarNodes.map((node) => node.id), [toolbarNodes])

  const changeSelectedGroupColor = (color: GroupNodeColor) => {
    if (!selectedGroupNode || color === selectedGroupColorOption.id) {
      setColorMenuGroupId(null)
      return
    }

    runTracked(() => updateNodeData(selectedGroupNode.id, { color }))
    setColorMenuGroupId(null)
  }

  if (!isSingleGroupSelection && !isMultiSelection) {
    return null
  }

  return (
    <NodeToolbar
      nodeId={toolbarNodeIds}
      isVisible
      position={Position.Top}
      offset={18}
      align="center"
      className="pointer-events-auto z-30"
    >
      <div role="toolbar" aria-label="所选节点操作" className={TOOLBAR_CLASS_NAME}>
          {isSingleGroupSelection ? (
            <>
              <div className="relative">
                <button
                  type="button"
                  aria-label={UI_TEXT.changeColor}
                  aria-expanded={isColorMenuOpen}
                  onClick={() => setColorMenuGroupId(isColorMenuOpen ? null : selectedGroupNode?.id ?? null)}
                  className={TOOLBAR_BUTTON_CLASS_NAME}
                >
                  <span className={`h-3.5 w-3.5 rounded-full border border-[var(--border-subtle)] shadow-[0_0_0_2px_var(--control-bg-hover),0_0_12px_rgba(139,92,246,0.16)] ${selectedGroupColorOption.swatchClassName}`} />
                </button>

                {isColorMenuOpen ? (
                  <div role="menu" aria-label={UI_TEXT.changeColor} className={`absolute left-1/2 top-[calc(100%+8px)] z-40 flex -translate-x-1/2 flex-col gap-1.5 p-2 ${themeClasses.nodeToolbarPanel}`}>
                    {GROUP_COLOR_OPTIONS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        role="menuitemradio"
                        title={`${UI_TEXT.changeColor}：${preset.label}`}
                        aria-label={`${UI_TEXT.changeColor}：${preset.label}`}
                        aria-checked={preset.id === selectedGroupColorOption.id}
                        onClick={() => changeSelectedGroupColor(preset.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-[var(--control-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-violet-soft)]"
                      >
                        <span className={`h-4 w-4 rounded-full border transition ${
                          preset.id === selectedGroupColorOption.id
                            ? 'border-[var(--text-primary)] ring-2 ring-[var(--accent-violet-soft)]'
                            : 'border-[var(--border-subtle)]'
                        } ${preset.swatchClassName}`} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <ToolbarIconButton
                testId="ungroup-selection"
                label={UI_TEXT.ungroup}
                onClick={() => runTracked(() => ungroupNode(selectedGroupNodes[0].id))}
                className={TOOLBAR_BUTTON_CLASS_NAME}
                icon={<Ungroup className="h-3.5 w-3.5" />}
              />
            </>
          ) : (
            <>
              {selectedGroupNodes.length === 0 && selectedTopLevelNodes.length >= 2 ? (
                <>
                  <ToolbarIconButton
                    label={UI_TEXT.group}
                    onClick={() => runTracked(() => groupSelectedNodes())}
                    className={TOOLBAR_BUTTON_CLASS_NAME}
                    icon={<Layers3 className="h-3.5 w-3.5" />}
                  />
                  <ToolbarIconButton
                    label={UI_TEXT.arrangeH}
                    onClick={() => runTracked(() => arrangeSelectedNodes('horizontal'))}
                    className={TOOLBAR_BUTTON_CLASS_NAME}
                    icon={<AlignHorizontalSpaceAround className="h-3.5 w-3.5" />}
                  />
                  <ToolbarIconButton
                    label={UI_TEXT.arrangeV}
                    onClick={() => runTracked(() => arrangeSelectedNodes('vertical'))}
                    className={TOOLBAR_BUTTON_CLASS_NAME}
                    icon={<AlignVerticalSpaceAround className="h-3.5 w-3.5" />}
                  />
                </>
              ) : null}

              <ToolbarIconButton
                testId="save-selection-as-template"
                label={UI_TEXT.saveTemplate}
                onClick={requestTemplateLibrary}
                className={TOOLBAR_BUTTON_CLASS_NAME}
                icon={<BookmarkPlus className="h-3.5 w-3.5" />}
              />

              <ToolbarIconButton
                label={UI_TEXT.remove}
                onClick={() => runTracked(deleteSelectedElements)}
                className={DANGER_TOOLBAR_BUTTON_CLASS_NAME}
                icon={<Trash2 className="h-3.5 w-3.5" />}
              />
            </>
          )}
      </div>
    </NodeToolbar>
  )
}
