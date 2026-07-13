import { useEffect, useMemo, useRef, useState, type DragEvent, type FocusEvent, type MouseEvent, type ReactNode } from 'react'
import { useReactFlow } from '@xyflow/react'
import {
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Boxes,
  BookTemplate,
  Check,
  FolderKanban,
  Images,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { createCanvasNodeCatalog } from '@/features/nodeLibrary/catalog'
import { getNodeSize, useCanvasStore } from '@/store/useCanvasStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { useProjectDialogStore } from '@/store/useProjectDialogStore'
import { useWorkflowTemplateStore } from '@/store/useWorkflowTemplateStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useFeedbackStore } from '@/store/useFeedbackStore'
import { CanvasImagePreview } from '@/components/CanvasImagePreview'
import { isImageSourceNodeType, type WorkspaceImageAsset } from '@/types'
import { themeClasses } from '@/styles/themeClasses'
import { useShallow } from 'zustand/react/shallow'

const TOOLBAR_SAFE_OFFSET_X = 28
const TOOLBAR_SPAWN_VIEWPORT_X = 0.34
const VIEWPORT_FOLLOW_PADDING = 48
const TOOLBAR_PANEL_CLASS = `flex flex-col gap-0.5 p-1 ${themeClasses.compactFloatingPanel}`
const TOOLBAR_BUTTON_CLASS = `${themeClasses.iconButton} h-7 w-7 rounded-md`
const TOOLBAR_DIVIDER_CLASS = `mx-1 my-0.5 h-px ${themeClasses.divider}`

interface ToolButton {
  id: string
  icon: ReactNode
  label: string
}

interface NodeLibraryTool extends ToolButton {
  description: string
  keywords: string[]
  createNode?: (preferredPosition?: { x: number; y: number }) => string
}

interface NodeLibraryCategory {
  id: string
  label: string
  tools: NodeLibraryTool[]
}

interface CanvasImageAssetItem {
  nodeId: string
  title: string
  kindLabel: string
  metaLabel: string
  imageUrl: string
  imageAsset: WorkspaceImageAsset | null
  width: number
  height: number
}

function encodeCanvasAssetItem(item: CanvasImageAssetItem) {
  return JSON.stringify({
    nodeId: item.nodeId,
    title: item.title,
    kindLabel: item.kindLabel,
    metaLabel: item.metaLabel,
    imageUrl: item.imageUrl,
    imageAsset: item.imageAsset,
    width: item.width,
    height: item.height,
  })
}

function decodeCanvasAssetItem(value: string): CanvasImageAssetItem | null {
  try {
    const parsed = JSON.parse(value) as Partial<CanvasImageAssetItem>
    if (
      typeof parsed.nodeId !== 'string'
      || typeof parsed.title !== 'string'
      || typeof parsed.kindLabel !== 'string'
      || typeof parsed.metaLabel !== 'string'
      || typeof parsed.imageUrl !== 'string'
      || typeof parsed.width !== 'number'
      || typeof parsed.height !== 'number'
    ) {
      return null
    }

    return {
      nodeId: parsed.nodeId,
      title: parsed.title,
      kindLabel: parsed.kindLabel,
      metaLabel: parsed.metaLabel,
      imageUrl: parsed.imageUrl,
      imageAsset: parsed.imageAsset && typeof parsed.imageAsset === 'object'
        ? parsed.imageAsset as WorkspaceImageAsset
        : null,
      width: parsed.width,
      height: parsed.height,
    }
  } catch {
    return null
  }
}

const UI_TEXT = {
  moreNodes: '更多节点',
  nodeLibrary: '节点库',
  nodeLibraryHint: '搜索或从分类里添加节点',
  searchPlaceholder: '搜索节点、能力或关键词...',
  emptySearch: '没有找到匹配的节点',
  projectManager: '项目管理',
  assetLibrary: '素材库',
  assetLibraryHint: '当前画布图片资产，可拖拽复用',
  assetCountUnit: '张',
  emptyAssets: '当前画布暂无图片素材',
  emptyAssetsHint: '导入图片或生成图片后会显示在这里',
  dragToReuse: '拖拽到画布复用',
  horizontalLayout: '横向排列',
  verticalLayout: '纵向排列',
  comingSoon: '即将支持',
  templateLibrary: '工作流模板',
  templateLibraryHint: '保存和复用局部节点组合',
  templateNamePlaceholder: '输入模板名称',
  saveTemplate: '保存当前选区',
  noTemplates: '还没有工作流模板',
  noTemplatesHint: '选择画布节点后保存为模板',
  workspaceRequired: '配置缓存目录后才能保存模板',
} as const

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase()
}

function getStringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getNumberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function getCanvasAssetKindLabel(nodeType: string | undefined, data: Record<string, unknown>) {
  if (nodeType === 'imageNode') {
    return '图片'
  }

  if (nodeType === 'testImageNode') {
    return '测试图'
  }

  const model = getStringValue(data.model)
  const originOperation = getStringValue(data.originOperation)

  if (model === 'manual-mask') {
    return '蒙版'
  }

  if (originOperation === 'image-edit' || model === 'manual-edit') {
    return '编辑'
  }

  if (originOperation === 'crop' || model === 'crop') {
    return '裁切'
  }

  return '生成'
}

function getCanvasAssetTitle(nodeType: string | undefined, data: Record<string, unknown>) {
  const name = getStringValue(data.name)
  const label = getStringValue(data.label)
  const prompt = getStringValue(data.prompt)

  if (name) {
    return name
  }

  if (label) {
    return label
  }

  if (prompt) {
    return prompt
  }

  return nodeType === 'generatedPreviewNode' ? '生成图片' : '图片素材'
}

export function FloatingToolbar() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const panelTriggerRef = useRef<HTMLButtonElement | null>(null)
  const librarySearchRef = useRef<HTMLInputElement | null>(null)
  const assetPanelRef = useRef<HTMLDivElement | null>(null)
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null)
  const [isNodeLibraryOpen, setIsNodeLibraryOpen] = useState(false)
  const [isAssetLibraryOpen, setIsAssetLibraryOpen] = useState(false)
  const [isTemplateLibraryOpen, setIsTemplateLibraryOpen] = useState(false)
  const [librarySearch, setLibrarySearch] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [renamingTemplateId, setRenamingTemplateId] = useState<string | null>(null)
  const [renamingTemplateName, setRenamingTemplateName] = useState('')
  const selectNode = useCanvasStore((state) => state.selectNode)
  const updateNodeData = useCanvasStore((state) => state.updateNodeData)
  const addTextNode = useCanvasStore((state) => state.addTextNode)
  const addTextSplitterNode = useCanvasStore((state) => state.addTextSplitterNode)
  const addImageNode = useCanvasStore((state) => state.addImageNode)
  const addVideoNode = useCanvasStore((state) => state.addVideoNode)
  const addVideoGenerateNode = useCanvasStore((state) => state.addVideoGenerateNode)
  const addImageCropNode = useCanvasStore((state) => state.addImageCropNode)
  const addLLMNode = useCanvasStore((state) => state.addLLMNode)
  const addGenerateNode = useCanvasStore((state) => state.addGenerateNode)

  const addGeneratedPreviewNode = useCanvasStore((state) => state.addGeneratedPreviewNode)
  const addCompareNode = useCanvasStore((state) => state.addCompareNode)
  const addPanoramaNode = useCanvasStore((state) => state.addPanoramaNode)
  const arrangeAllNodes = useCanvasStore((state) => state.arrangeAllNodes)
  const insertWorkflowTemplate = useCanvasStore((state) => state.insertWorkflowTemplate)
  const hasSelectedNodes = useCanvasStore((state) => state.nodes.some((node) => node.selected))
  const openProjectDialog = useProjectDialogStore((state) => state.open)
  const workspaceConfigured = useSettingsStore((state) => state.runtime.workspaceConfigured)
  const templates = useWorkflowTemplateStore((state) => state.templates)
  const templatesHydrated = useWorkflowTemplateStore((state) => state.hydrated)
  const templatesBusy = useWorkflowTemplateStore((state) => state.busy)
  const templateOpenRequestVersion = useWorkflowTemplateStore((state) => state.openRequestVersion)
  const hydrateTemplates = useWorkflowTemplateStore((state) => state.hydrate)
  const saveSelectionAsTemplate = useWorkflowTemplateStore((state) => state.saveSelection)
  const renameTemplate = useWorkflowTemplateStore((state) => state.renameTemplate)
  const deleteTemplate = useWorkflowTemplateStore((state) => state.deleteTemplate)
  const notify = useFeedbackStore((state) => state.notify)
  const confirm = useFeedbackStore((state) => state.confirm)
  const runTracked = useHistoryStore((state) => state.runTracked)
  const { screenToFlowPosition, setCenter, viewportInitialized, getViewport } = useReactFlow()

  const createNodeFromToolbar = (
    event: MouseEvent<HTMLButtonElement>,
    createNode: (preferredPosition?: { x: number; y: number }) => string,
  ) => {
    const buttonRect = event.currentTarget.getBoundingClientRect()
    const toolbarRect = toolbarRef.current?.getBoundingClientRect() ?? buttonRect
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const screenAnchorX = Math.max(
      toolbarRect.right + TOOLBAR_SAFE_OFFSET_X,
      viewportWidth * TOOLBAR_SPAWN_VIEWPORT_X,
    )
    const preferredPosition = screenToFlowPosition({
      x: screenAnchorX,
      y: Math.min(viewportHeight - 80, Math.max(80, buttonRect.top + buttonRect.height / 2)),
    })
    const createdNodeId = runTracked(() => createNode(preferredPosition))

    if (!createdNodeId || !viewportInitialized) {
      return
    }

    const createdNode = useCanvasStore.getState().nodes.find((node) => node.id === createdNodeId)
    if (!createdNode) {
      return
    }

    const { width, height } = getNodeSize(createdNode)
    const viewport = getViewport()
    const zoom = viewport.zoom || 1
    const screenX = createdNode.position.x * zoom + viewport.x
    const screenY = createdNode.position.y * zoom + viewport.y
    const screenRight = screenX + width * zoom
    const screenBottom = screenY + height * zoom
    const isOutsideViewport = (
      screenX < toolbarRect.right + TOOLBAR_SAFE_OFFSET_X
      || screenY < VIEWPORT_FOLLOW_PADDING
      || screenRight > viewportWidth - VIEWPORT_FOLLOW_PADDING
      || screenBottom > viewportHeight - VIEWPORT_FOLLOW_PADDING
    )

    if (!isOutsideViewport) {
      return
    }

    setCenter(createdNode.position.x + width / 2, createdNode.position.y + height / 2, {
      duration: 180,
      zoom,
    })
  }

  const handleBlur = (toolId: string, event: FocusEvent<HTMLButtonElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return
    }

    setActiveTooltipId((current) => (current === toolId ? null : current))
  }

  const nodeLibraryCategories = useMemo<NodeLibraryCategory[]>(() => createCanvasNodeCatalog({
    addTextNode,
    addImageNode,
    addGenerateNode,
    addLLMNode,
    addVideoGenerateNode,
    addTextSplitterNode,
    addImageCropNode,
    addCompareNode,
    addGeneratedPreviewNode,
    addVideoNode,
    addPanoramaNode,
  }), [addCompareNode, addGenerateNode, addGeneratedPreviewNode, addImageCropNode, addImageNode, addLLMNode, addPanoramaNode, addTextNode, addTextSplitterNode, addVideoGenerateNode, addVideoNode])
  const commonTools = nodeLibraryCategories.find((category) => category.id === 'common')?.tools ?? []


  const normalizedLibrarySearch = normalizeSearchText(librarySearch)
  const filteredNodeLibraryCategories = useMemo(() => {
    if (!normalizedLibrarySearch) {
      return nodeLibraryCategories
    }

    return nodeLibraryCategories
      .map((category) => ({
        ...category,
        tools: category.tools.filter((tool) => {
          const searchableText = [tool.label, tool.description, ...tool.keywords].join(' ').toLowerCase()
          return searchableText.includes(normalizedLibrarySearch)
        }),
      }))
      .filter((category) => category.tools.length > 0)
  }, [nodeLibraryCategories, normalizedLibrarySearch])

  const hasLibraryResults = filteredNodeLibraryCategories.some((category) => category.tools.length > 0)
  const canvasImageAssetKeys = useCanvasStore(useShallow((state) => (
    isAssetLibraryOpen ? state.nodes.flatMap((node) => {
      if (!isImageSourceNodeType(node.type)) {
        return []
      }

      const data = node.data as Record<string, unknown>
      const imageUrl = getStringValue(data.imageUrl)

      if (!imageUrl) {
        return []
      }

      const nodeSize = getNodeSize(node)
      const imageWidth = getNumberValue(data.imageWidth) || nodeSize.width
      const imageHeight = getNumberValue(data.imageHeight) || nodeSize.height
      const resolution = getStringValue(data.resolution)
      const imageAsset = data.imageAsset && typeof data.imageAsset === 'object'
        ? data.imageAsset as WorkspaceImageAsset
        : null

      return [encodeCanvasAssetItem({
        nodeId: node.id,
        title: getCanvasAssetTitle(node.type, data),
        kindLabel: getCanvasAssetKindLabel(node.type, data),
        metaLabel: resolution || `${Math.round(imageWidth)}×${Math.round(imageHeight)}`,
        imageUrl,
        imageAsset,
        width: nodeSize.width,
        height: nodeSize.height,
      })]
    }) : []
  )))
  const canvasImageAssets = useMemo<CanvasImageAssetItem[]>(
    () => canvasImageAssetKeys
      .map(decodeCanvasAssetItem)
      .filter((item): item is CanvasImageAssetItem => Boolean(item)),
    [canvasImageAssetKeys],
  )

  const toolbarControls: ToolButton[] = [
    {
      id: 'more',
      icon: <Plus className="h-3.5 w-3.5" />,
      label: UI_TEXT.moreNodes,
    },
    {
      id: 'horizontal-layout',
      icon: <AlignHorizontalSpaceAround className="h-3.5 w-3.5" />,
      label: UI_TEXT.horizontalLayout,
    },
    {
      id: 'vertical-layout',
      icon: <AlignVerticalSpaceAround className="h-3.5 w-3.5" />,
      label: UI_TEXT.verticalLayout,
    },
    {
      id: 'asset-library',
      icon: <Images className="h-3.5 w-3.5" />,
      label: UI_TEXT.assetLibrary,
    },
    {
      id: 'workflow-templates',
      icon: <BookTemplate className="h-3.5 w-3.5" />,
      label: UI_TEXT.templateLibrary,
    },
    {
      id: 'project-manager',
      icon: <FolderKanban className="h-3.5 w-3.5" />,
      label: UI_TEXT.projectManager,
    },
  ]

  const closeFloatingPanels = (restoreFocus = false) => {
    setIsNodeLibraryOpen(false)
    setIsAssetLibraryOpen(false)
    setIsTemplateLibraryOpen(false)
    setActiveTooltipId(null)
    if (restoreFocus) window.requestAnimationFrame(() => panelTriggerRef.current?.focus())
  }

  useEffect(() => {
    if (isNodeLibraryOpen) window.requestAnimationFrame(() => librarySearchRef.current?.focus())
    if (isAssetLibraryOpen) window.requestAnimationFrame(() => assetPanelRef.current?.focus())
  }, [isAssetLibraryOpen, isNodeLibraryOpen])

  useEffect(() => {
    if (templateOpenRequestVersion === 0) return
    const frameId = window.requestAnimationFrame(() => {
      setIsNodeLibraryOpen(false)
      setIsAssetLibraryOpen(false)
      setIsTemplateLibraryOpen(true)
      void hydrateTemplates().catch(() => undefined)
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [hydrateTemplates, templateOpenRequestVersion])

  const saveTemplate = async () => {
    const name = templateName.trim()
    if (!name) return
    try {
      await saveSelectionAsTemplate(name)
      setTemplateName('')
      notify({ title: '模板已保存', message: name, tone: 'success' })
    } catch (error) {
      notify({ title: '模板保存失败', message: error instanceof Error ? error.message : '请稍后重试', tone: 'error' })
    }
  }

  const insertTemplateFromLibrary = (event: MouseEvent<HTMLButtonElement>, templateId: string) => {
    const template = templates.find((item) => item.id === templateId)
    if (!template) return
    const buttonRect = event.currentTarget.getBoundingClientRect()
    const toolbarRect = toolbarRef.current?.getBoundingClientRect() ?? buttonRect
    const preferredPosition = screenToFlowPosition({
      x: Math.max(toolbarRect.right + TOOLBAR_SAFE_OFFSET_X, window.innerWidth * TOOLBAR_SPAWN_VIEWPORT_X),
      y: Math.min(window.innerHeight - 80, Math.max(80, buttonRect.top + buttonRect.height / 2)),
    })
    const ids = runTracked(() => insertWorkflowTemplate(template, preferredPosition))
    const firstNode = useCanvasStore.getState().nodes.find((node) => node.id === ids[0])
    if (firstNode) {
      const { width, height } = getNodeSize(firstNode)
      void setCenter(firstNode.position.x + width / 2, firstNode.position.y + height / 2, { duration: 220, zoom: getViewport().zoom || 1 })
    }
    closeFloatingPanels()
  }

  const commitTemplateRename = async (templateId: string) => {
    const name = renamingTemplateName.trim()
    if (!name) return
    try {
      await renameTemplate(templateId, name)
      setRenamingTemplateId(null)
    } catch (error) {
      notify({ title: '模板重命名失败', message: error instanceof Error ? error.message : '请稍后重试', tone: 'error' })
    }
  }

  const removeTemplate = async (templateId: string, name: string) => {
    if (!await confirm({ title: '删除工作流模板', message: `确定删除“${name}”吗？`, confirmLabel: '删除', tone: 'danger' })) return
    try {
      await deleteTemplate(templateId)
      notify({ title: '模板已删除', message: name, tone: 'success' })
    } catch (error) {
      notify({ title: '模板删除失败', message: error instanceof Error ? error.message : '请稍后重试', tone: 'error' })
    }
  }

  const createNodeFromLibrary = (event: MouseEvent<HTMLButtonElement>, tool: NodeLibraryTool) => {
    if (!tool.createNode) {
      return
    }

    createNodeFromToolbar(event, tool.createNode)
    setIsNodeLibraryOpen(false)
    setLibrarySearch('')
  }

  const locateCanvasAsset = (asset: CanvasImageAssetItem) => {
    const sourceNode = useCanvasStore.getState().nodes.find((node) => node.id === asset.nodeId)
    selectNode(asset.nodeId)

    if (sourceNode) {
      const { width, height } = getNodeSize(sourceNode)
      void setCenter(sourceNode.position.x + width / 2, sourceNode.position.y + height / 2, {
        duration: 280,
        zoom: 0.9,
      })
    }

    setIsAssetLibraryOpen(false)
  }

  const reuseCanvasAsset = (asset: CanvasImageAssetItem, preferredPosition: { x: number; y: number }) => {
    runTracked(() => {
      const imageNodeId = addImageNode(preferredPosition)
      updateNodeData(imageNodeId, {
        imageUrl: asset.imageUrl,
        imageAsset: asset.imageAsset ? { ...asset.imageAsset } : null,
        name: asset.title,
        width: asset.width,
        height: asset.height,
      })
    })
  }

  const handleAssetDragStart = (event: DragEvent<HTMLButtonElement>, asset: CanvasImageAssetItem) => {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/x-ai-canvas-image-asset', asset.nodeId)
    event.dataTransfer.setData('text/plain', asset.title)
  }

  const handleAssetDragEnd = (event: DragEvent<HTMLButtonElement>, asset: CanvasImageAssetItem) => {
    if (event.clientX <= 0 || event.clientY <= 0) {
      return
    }

    const target = document.elementFromPoint(event.clientX, event.clientY)
    if (!(target instanceof Element) || !target.closest('.react-flow')) {
      return
    }

    reuseCanvasAsset(asset, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  const runLayoutAction = (direction: 'horizontal' | 'vertical') => {
    runTracked(() => arrangeAllNodes(direction))
    closeFloatingPanels()
  }

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && rootRef.current?.contains(target)) {
        return
      }

      closeFloatingPanels()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeFloatingPanels(true)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <div ref={rootRef} className="fixed left-3 top-1/2 z-20 -translate-y-1/2">
      <div ref={toolbarRef} role="toolbar" aria-label="画布节点工具" className={TOOLBAR_PANEL_CLASS}>
        {commonTools.map((tool) => {
          const isTooltipVisible = activeTooltipId === tool.id && !isNodeLibraryOpen && !isAssetLibraryOpen

          return (
            <div
              key={tool.id}
              className="relative"
              onMouseEnter={() => setActiveTooltipId(tool.id)}
              onMouseLeave={() => setActiveTooltipId((current) => (current === tool.id ? null : current))}
            >
              <button
                type="button"
                onMouseDown={() => setActiveTooltipId(null)}
                onFocus={() => setActiveTooltipId(tool.id)}
                onBlur={(event) => handleBlur(tool.id, event)}
                onClick={(event) => {
                  closeFloatingPanels()
                  if (tool.createNode) {
                    createNodeFromToolbar(event, tool.createNode)
                  }
                }}
                aria-label={tool.label}
                data-testid={`toolbar-node-${tool.id}`}
                className={TOOLBAR_BUTTON_CLASS}
              >
                {tool.icon}
              </button>

              <div className={`pointer-events-none absolute left-full top-1/2 z-10 ml-2 -translate-y-1/2 transition duration-150 ${isTooltipVisible ? 'opacity-100' : 'opacity-0'}`}>
                <div className={themeClasses.tooltip}>
                  {tool.label}
                </div>
              </div>
            </div>
          )
        })}

        <div className={TOOLBAR_DIVIDER_CLASS} />

        {toolbarControls.map((tool) => {
          const isActive = tool.id === 'more'
            ? isNodeLibraryOpen
            : tool.id === 'asset-library'
              ? isAssetLibraryOpen
              : tool.id === 'workflow-templates'
                ? isTemplateLibraryOpen
              : false
          const isTooltipVisible = activeTooltipId === tool.id && !isActive

          return (
            <div
              key={tool.id}
              className="relative"
              onMouseEnter={() => setActiveTooltipId(tool.id)}
              onMouseLeave={() => setActiveTooltipId((current) => (current === tool.id ? null : current))}
            >
              <button
                type="button"
                onMouseDown={() => setActiveTooltipId(null)}
                onFocus={() => setActiveTooltipId(tool.id)}
                onBlur={(event) => handleBlur(tool.id, event)}
                onClick={(event) => {
                  setActiveTooltipId(null)
                  if (tool.id === 'more') {
                    panelTriggerRef.current = event.currentTarget
                    setIsAssetLibraryOpen(false)
                    setIsTemplateLibraryOpen(false)
                    setIsNodeLibraryOpen((current) => !current)
                    return
                  }

                  if (tool.id === 'asset-library') {
                    panelTriggerRef.current = event.currentTarget
                    setIsNodeLibraryOpen(false)
                    setIsTemplateLibraryOpen(false)
                    setIsAssetLibraryOpen((current) => !current)
                    return
                  }

                  if (tool.id === 'workflow-templates') {
                    panelTriggerRef.current = event.currentTarget
                    setIsNodeLibraryOpen(false)
                    setIsAssetLibraryOpen(false)
                    setIsTemplateLibraryOpen((current) => {
                      if (!current) void hydrateTemplates().catch(() => undefined)
                      return !current
                    })
                    return
                  }

                  if (tool.id === 'horizontal-layout') {
                    runLayoutAction('horizontal')
                    return
                  }

                  if (tool.id === 'vertical-layout') {
                    runLayoutAction('vertical')
                    return
                  }

                  closeFloatingPanels()
                  openProjectDialog()
                }}
                aria-label={tool.label}
                aria-expanded={['more', 'asset-library', 'workflow-templates'].includes(tool.id) ? isActive : undefined}
                aria-haspopup={['more', 'asset-library', 'workflow-templates'].includes(tool.id) ? 'dialog' : undefined}
                aria-controls={tool.id === 'more' && isActive ? 'node-library-panel' : tool.id === 'asset-library' && isActive ? 'asset-library-panel' : tool.id === 'workflow-templates' && isActive ? 'workflow-template-panel' : undefined}
                data-testid={tool.id === 'project-manager' ? 'project-manager-button' : tool.id === 'asset-library' ? 'asset-library-button' : `toolbar-${tool.id}`}
                className={`${TOOLBAR_BUTTON_CLASS} ${
                  isActive
                    ? `${themeClasses.iconButtonActive} shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]`
                    : ''
                }`}
              >
                {tool.icon}
              </button>

              <div className={`pointer-events-none absolute left-full top-1/2 z-10 ml-2 -translate-y-1/2 transition duration-150 ${isTooltipVisible ? 'opacity-100' : 'opacity-0'}`}>
                <div className={themeClasses.tooltip}>
                  {tool.label}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {isNodeLibraryOpen && (
        <div id="node-library-panel" role="dialog" aria-label={UI_TEXT.nodeLibrary} className={`absolute left-full top-1/2 ml-3 flex max-h-[min(640px,calc(100vh-32px))] w-[326px] -translate-y-1/2 flex-col overflow-hidden rounded-2xl ${themeClasses.strongPanel}`}>
          <div className="border-b border-[var(--border-subtle)] bg-[var(--control-bg)] px-3.5 py-3">
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--control-bg-hover)] text-[var(--text-secondary)]">
                <Boxes className="h-3.5 w-3.5" />
              </span>
              <div>
                <div className="text-sm font-semibold leading-tight">{UI_TEXT.nodeLibrary}</div>
                <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{UI_TEXT.nodeLibraryHint}</div>
              </div>
            </div>

            <label className="mt-3 flex h-9 items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--control-bg)] px-2.5 text-[var(--text-muted)] focus-within:border-[var(--accent-violet-strong)] focus-within:text-[var(--text-secondary)]">
              <Search className="h-3.5 w-3.5" />
              <input
                ref={librarySearchRef}
                aria-label={UI_TEXT.searchPlaceholder}
                value={librarySearch}
                onChange={(event) => setLibrarySearch(event.target.value)}
                placeholder={UI_TEXT.searchPlaceholder}
                className="h-full min-w-0 flex-1 bg-transparent text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2.5 scrollbar-hidden">
            {hasLibraryResults ? (
              <div className="space-y-3">
                {filteredNodeLibraryCategories.map((category) => (
                  <section key={category.id}>
                    <div className={`px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${themeClasses.textMuted}`}>
                      {category.label}
                    </div>
                    <div className="grid gap-1.5">
                      {category.tools.map((tool) => {
                        const isDisabled = !tool.createNode

                        return (
                          <button
                            key={`${category.id}-${tool.id}`}
                            type="button"
                            disabled={isDisabled}
                            onClick={(event) => createNodeFromLibrary(event, tool)}
                            className="group flex min-h-[58px] w-full items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--control-bg)] px-3 py-2 text-left transition enabled:hover:bg-[var(--control-bg-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--control-bg-hover)] text-[var(--text-secondary)] transition group-enabled:group-hover:text-[var(--text-primary)]">
                              {tool.icon}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{tool.label}</span>
                                {isDisabled && (
                                  <span className="rounded-md border border-[var(--border-subtle)] bg-[var(--control-bg-hover)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-muted)]">
                                    {UI_TEXT.comingSoon}
                                  </span>
                                )}
                              </span>
                              <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-[var(--text-muted)]">
                                {tool.description}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="flex h-36 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--control-bg)] text-center">
                <Search className="h-5 w-5 text-[var(--text-muted)]" />
                <div className="mt-2 text-[12px] font-medium text-[var(--text-secondary)]">{UI_TEXT.emptySearch}</div>
                <div className="mt-1 text-[11px] text-[var(--text-muted)]">换个关键词试试</div>
              </div>
            )}
          </div>
        </div>
      )}

      {isTemplateLibraryOpen && (
        <div id="workflow-template-panel" role="dialog" aria-label={UI_TEXT.templateLibrary} className={`absolute left-full top-1/2 ml-3 flex max-h-[min(640px,calc(100vh-32px))] w-[360px] -translate-y-1/2 flex-col overflow-hidden rounded-xl ${themeClasses.strongPanel}`}>
          <div className="border-b border-[var(--border-subtle)] bg-[var(--control-bg)] px-3.5 py-3">
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg-hover)] text-[var(--text-secondary)]">
                <BookTemplate className="h-3.5 w-3.5" />
              </span>
              <div>
                <div className="text-sm font-semibold leading-tight">{UI_TEXT.templateLibrary}</div>
                <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{UI_TEXT.templateLibraryHint}</div>
              </div>
            </div>

            <div className="mt-3 flex gap-1.5">
              <input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void saveTemplate()
                }}
                placeholder={UI_TEXT.templateNamePlaceholder}
                aria-label={UI_TEXT.templateNamePlaceholder}
                className={`h-8 min-w-0 flex-1 px-2.5 text-[12px] ${themeClasses.input}`}
              />
              <button
                type="button"
                onClick={() => void saveTemplate()}
                disabled={!workspaceConfigured || !hasSelectedNodes || !templateName.trim() || templatesBusy}
                className={`${themeClasses.secondaryButton} h-8 shrink-0 px-2.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-45`}
              >
                {UI_TEXT.saveTemplate}
              </button>
            </div>
            {!workspaceConfigured && (
              <div className="mt-2 text-[10px] text-amber-500">{UI_TEXT.workspaceRequired}</div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2.5 scrollbar-hidden">
            {!templatesHydrated && templatesBusy ? (
              <div className="flex h-32 items-center justify-center text-[11px] text-[var(--text-muted)]">正在加载模板...</div>
            ) : templates.length === 0 ? (
              <div className="flex h-36 flex-col items-center justify-center border border-dashed border-[var(--border-subtle)] bg-[var(--control-bg)] px-5 text-center">
                <BookTemplate className="h-5 w-5 text-[var(--text-muted)]" />
                <div className="mt-2 text-[12px] font-medium text-[var(--text-secondary)]">{UI_TEXT.noTemplates}</div>
                <div className="mt-1 text-[11px] text-[var(--text-muted)]">{UI_TEXT.noTemplatesHint}</div>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
                {templates.map((template) => (
                  <div key={template.id} className="flex min-h-14 items-center gap-2 bg-[var(--control-bg)] px-2.5 py-2">
                    <div className="min-w-0 flex-1">
                      {renamingTemplateId === template.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={renamingTemplateName}
                            onChange={(event) => setRenamingTemplateName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') void commitTemplateRename(template.id)
                              if (event.key === 'Escape') setRenamingTemplateId(null)
                            }}
                            aria-label="模板名称"
                            className={`h-7 min-w-0 flex-1 px-2 text-[11px] ${themeClasses.input}`}
                          />
                          <button type="button" title="确认重命名" aria-label="确认重命名" onClick={() => void commitTemplateRename(template.id)} className={`${themeClasses.iconButton} h-7 w-7`}>
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" title="取消重命名" aria-label="取消重命名" onClick={() => setRenamingTemplateId(null)} className={`${themeClasses.iconButton} h-7 w-7`}>
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{template.name}</div>
                          <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{template.nodes.length} 个节点 · {template.edges.length} 条连线</div>
                        </>
                      )}
                    </div>
                    {renamingTemplateId !== template.id && (
                      <>
                        <button
                          type="button"
                          onClick={(event) => insertTemplateFromLibrary(event, template.id)}
                          className={`${themeClasses.secondaryButton} h-7 gap-1 px-2 text-[10px]`}
                        >
                          <Plus className="h-3 w-3" />
                          插入
                        </button>
                        <button
                          type="button"
                          title="重命名"
                          aria-label={`重命名模板 ${template.name}`}
                          disabled={!workspaceConfigured || templatesBusy}
                          onClick={() => {
                            setRenamingTemplateId(template.id)
                            setRenamingTemplateName(template.name)
                          }}
                          className={`${themeClasses.iconButton} h-7 w-7 disabled:opacity-40`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="删除"
                          aria-label={`删除模板 ${template.name}`}
                          disabled={!workspaceConfigured || templatesBusy}
                          onClick={() => void removeTemplate(template.id, template.name)}
                          className={`${themeClasses.iconButton} h-7 w-7 text-red-500 disabled:opacity-40`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {isAssetLibraryOpen && (
        <div id="asset-library-panel" ref={assetPanelRef} role="dialog" aria-label={UI_TEXT.assetLibrary} tabIndex={-1} className={`absolute left-full top-1/2 ml-3 flex max-h-[min(680px,calc(100vh-32px))] w-[420px] -translate-y-1/2 flex-col overflow-hidden rounded-2xl ${themeClasses.strongPanel}`}>
          <div className="border-b border-[var(--border-subtle)] bg-[var(--control-bg)] px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-[var(--text-primary)]">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--control-bg-hover)] text-[var(--text-secondary)]">
                  <Images className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-tight">{UI_TEXT.assetLibrary}</div>
                  <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{UI_TEXT.assetLibraryHint}</div>
                </div>
              </div>
              <span className="shrink-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg-hover)] px-2 py-1 text-[11px] font-medium text-[var(--text-muted)]">
                {canvasImageAssets.length} {UI_TEXT.assetCountUnit}
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5 scrollbar-hidden [contain:content]">
            {canvasImageAssets.length > 0 ? (
              <div className="grid grid-cols-4 gap-1.5">
                {canvasImageAssets.map((asset, index) => (
                  <button
                    key={asset.nodeId}
                    type="button"
                    draggable
                    onClick={() => locateCanvasAsset(asset)}
                    onDragStart={(event) => handleAssetDragStart(event, asset)}
                    onDragEnd={(event) => handleAssetDragEnd(event, asset)}
                    className="group min-w-0 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)] text-left transition hover:bg-[var(--control-bg-hover)] focus-visible:border-[var(--accent-violet-strong)] focus-visible:outline-none [contain:content] [content-visibility:auto] [contain-intrinsic-size:104px]"
                    title={`${asset.title} · ${UI_TEXT.dragToReuse}`}
                    aria-label={`定位素材 ${asset.title}`}
                  >
                    <span className="relative block aspect-square overflow-hidden bg-[var(--control-bg)]">
                      <CanvasImagePreview
                        src={asset.imageUrl}
                        alt=""
                        imageAsset={asset.imageAsset}
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                      <span className="absolute left-1 top-1 rounded bg-black/58 px-1 py-0.5 text-[8px] font-semibold leading-none text-white shadow">
                        {index + 1}
                      </span>
                      <span className="absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-[var(--panel-bg-strong)] px-1 py-0.5 text-[8px] font-medium leading-none text-[var(--text-secondary)] shadow">
                        {asset.kindLabel}
                      </span>
                    </span>
                    <span className="block min-w-0 px-1.5 py-1.5">
                      <span className="block truncate text-[10px] font-semibold leading-4 text-[var(--text-primary)]">{asset.title}</span>
                      <span className="mt-0.5 block truncate text-[9px] leading-3 text-[var(--text-muted)]">{asset.metaLabel}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex h-44 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--control-bg)] px-5 text-center">
                <Images className="h-6 w-6 text-[var(--text-muted)]" />
                <div className="mt-2 text-[12px] font-medium text-[var(--text-secondary)]">{UI_TEXT.emptyAssets}</div>
                <div className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">{UI_TEXT.emptyAssetsHint}</div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
