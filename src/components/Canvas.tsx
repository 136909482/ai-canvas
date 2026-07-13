import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { type Connection, type DefaultEdgeOptions, type Node, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowLeftRight, Bot, ChevronRight, Crop, FileText, Image as ImageIcon, ScissorsLineDashed, Sparkles, Video } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { importImageFile } from '@/features/imageImport/runtime'
import {
  getCanvasImagePerformanceStats,
  shouldUseCanvasPerformanceRendering,
} from '@/features/canvasPerformance/rendering'
import { createCanvasNodeCatalog, type CanvasNodeTool } from '@/features/nodeLibrary/catalog'
import { getNodeConnectionInputs, getNodeConnectionOutput, getQuickCreateTargetHandle, type NodeConnectionKind } from '@/features/nodeRegistry/protocol'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useFeedbackStore } from '@/store/useFeedbackStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { themeClasses } from '@/styles/themeClasses'
import { MAX_GENERATE_REFERENCE_IMAGES } from '@/constants/generateNode'
import { recordComponentRender } from '@/utils/performanceDiagnostics'
import { getFloatingMenuPosition } from '@/utils/floatingMenuPosition'
import { isImageSourceNodeType } from '@/types'
import { CanvasTopBar } from './CanvasTopBar'
import { SelectionActionsToolbar } from './SelectionActionsToolbar'
import { CanvasFlowLayer } from './canvas/CanvasFlowLayer'
import {
  getFirstImageFile,
  hasImageFileTransfer,
  isCanvasEmptyDropTarget,
} from './canvas/canvasDomUtils'
import { useCanvasKeyboardShortcuts } from './canvas/useCanvasKeyboardShortcuts'

const UI_TEXT = {
  maxReferenceImages: `AI绘图节点最多支持 ${MAX_GENERATE_REFERENCE_IMAGES} 张参考图`,
  maxImageEditReferences: `局部编辑节点最多支持 ${MAX_GENERATE_REFERENCE_IMAGES - 1} 张附加参考图`,
  invalidDroppedImage: '请拖入图片文件',
  importImageFailed: '图片导入失败，请稍后重试',
} as const

const QUICK_CREATE_TEXT = {
  title: '\u5feb\u6377\u521b\u5efa',
} as const

const LARGE_CANVAS_NODE_LIMIT = 300
const QUICK_CREATE_MENU_WIDTH = 204
const QUICK_CREATE_MENU_MIN_HEIGHT = 138
const FLOATING_MENU_VIEWPORT_MARGIN = 10
const CANVAS_CONTEXT_MENU_WIDTH = 236
const CANVAS_CONTEXT_MENU_MIN_HEIGHT = 320
const QUICK_CREATE_APPEND_NODE_OFFSET_X = 32
const QUICK_CREATE_PREPEND_NODE_OFFSET_X = -220
const QUICK_CREATE_NODE_OFFSET_Y = -20
const IMAGE_HEAVY_CULLING_DISABLE_NODE_LIMIT = 80
const IMAGE_HEAVY_CULLING_DISABLE_IMAGE_LIMIT = 8
const DEFAULT_EDGE_OPTIONS: DefaultEdgeOptions = { zIndex: 0, type: 'default', animated: true }
const INTERNAL_DRAG_ENABLE_STORAGE_KEY = 'ai-canvas.enableInternalDrag'
const VISIBLE_ELEMENT_CULLING_OVERRIDE_STORAGE_KEY = 'ai-canvas.visibleElementCulling'

interface PendingConnection {
  nodeId: string
  handleId: string | null
  handleType: 'source' | 'target'
}

interface QuickCreateMenuState extends PendingConnection {
  clientX: number
  clientY: number
}

interface CanvasContextMenuState {
  clientX: number
  clientY: number
}

interface QuickCreateAction {
  id: string
  label: string
  icon: ReactNode
  createNode: (preferredPosition?: { x: number; y: number }) => string
  createConnection: (newNodeId: string, pendingConnection: PendingConnection) => Connection
}

function getEventClientPosition(event: MouseEvent | TouchEvent) {
  if ('changedTouches' in event) {
    const touch = event.changedTouches[0] ?? event.touches[0]
    if (touch) {
      return { x: touch.clientX, y: touch.clientY }
    }
  }

  const mouseEvent = event as MouseEvent
  return { x: mouseEvent.clientX, y: mouseEvent.clientY }
}

function getQuickCreateMenuPosition(clientX: number, clientY: number) {
  return getFloatingMenuPosition({
    clientX,
    clientY,
    menuWidth: QUICK_CREATE_MENU_WIDTH,
    minMenuHeight: QUICK_CREATE_MENU_MIN_HEIGHT,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    margin: FLOATING_MENU_VIEWPORT_MARGIN,
  })
}

export function Canvas() {
  recordComponentRender('Canvas')
  const isTopBarCollapsed = useSettingsStore((state) => state.config.storage.canvasTopBarCollapsed)
  const themeMode = useSettingsStore((state) => state.config.storage.themeMode)
  const alignmentGuidesEnabled = useSettingsStore((state) => state.config.storage.alignmentGuidesEnabled)
  const canvasPerformanceMode = useSettingsStore((state) => state.config.storage.canvasPerformanceMode)
  const canvasGridEnabled = useSettingsStore((state) => state.config.storage.canvasGridEnabled)
  const edgeStyle = useSettingsStore((state) => state.config.storage.edgeStyle)
  const workspaceConfigured = useSettingsStore((state) => state.runtime.workspaceConfigured)
  const setStorageSettings = useSettingsStore((state) => state.setStorageSettings)
  const persistWorkspaceConfig = useSettingsStore((state) => state.persistWorkspaceConfig)
  const notify = useFeedbackStore((state) => state.notify)
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect: connectNodes,
    addGenerateNode,
    addVideoGenerateNode,
    addLLMNode,
    addTextSplitterNode,
    addImageCropNode,
    addCompareNode,
    addGeneratedPreviewNode,
    addVideoNode,
    addPanoramaNode,
    addTextNode,
    addImageNode,
    updateNodeData,
    setNodePositions,
  } = useCanvasStore(useShallow((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    onNodesChange: state.onNodesChange,
    onEdgesChange: state.onEdgesChange,
    onConnect: state.onConnect,
    addGenerateNode: state.addGenerateNode,
    addVideoGenerateNode: state.addVideoGenerateNode,
    addLLMNode: state.addLLMNode,
    addTextSplitterNode: state.addTextSplitterNode,
    addImageCropNode: state.addImageCropNode,
    addCompareNode: state.addCompareNode,
    addGeneratedPreviewNode: state.addGeneratedPreviewNode,
    addVideoNode: state.addVideoNode,
    addPanoramaNode: state.addPanoramaNode,
    addTextNode: state.addTextNode,
    addImageNode: state.addImageNode,
    updateNodeData: state.updateNodeData,
    setNodePositions: state.setNodePositions,
  })))
  const beginTransaction = useHistoryStore((state) => state.beginTransaction)
  const scheduleCommit = useHistoryStore((state) => state.scheduleCommit)
  const runTracked = useHistoryStore((state) => state.runTracked)
  const imagePerformanceStats = useMemo(() => getCanvasImagePerformanceStats(nodes), [nodes])
  const shouldUsePerformanceRendering = shouldUseCanvasPerformanceRendering({
    canvasPerformanceMode,
  })
  const shouldUseLiteRendering = shouldUsePerformanceRendering
  const shouldFitView = !shouldUsePerformanceRendering && nodes.length <= LARGE_CANVAS_NODE_LIMIT
  const shouldShowMiniMap = !shouldUseLiteRendering && nodes.length <= LARGE_CANVAS_NODE_LIMIT
  const shouldShowBackground = canvasGridEnabled && !shouldUseLiteRendering
  const shouldShowAlignmentGuides = alignmentGuidesEnabled && !shouldUseLiteRendering
  const visibleElementCullingOverride = typeof window !== 'undefined'
    ? window.localStorage.getItem(VISIBLE_ELEMENT_CULLING_OVERRIDE_STORAGE_KEY)
    : null
  const shouldStabilizeViewportElements = visibleElementCullingOverride !== 'on'
    && nodes.length <= IMAGE_HEAVY_CULLING_DISABLE_NODE_LIMIT
    && imagePerformanceStats.imageNodeCount >= IMAGE_HEAVY_CULLING_DISABLE_IMAGE_LIMIT
  const shouldCullOffscreenElements = visibleElementCullingOverride === 'on'
    ? true
    : visibleElementCullingOverride === 'off'
      ? false
      : true
  const internalDragEnabled = typeof window !== 'undefined'
    && window.localStorage.getItem(INTERNAL_DRAG_ENABLE_STORAGE_KEY) === '1'
  const shouldUseInternalDrag = shouldUsePerformanceRendering && !shouldShowAlignmentGuides && internalDragEnabled
  const { screenToFlowPosition } = useReactFlow()
  const pendingConnectionRef = useRef<PendingConnection | null>(null)
  const quickCreateMenuRef = useRef<HTMLDivElement | null>(null)
  const canvasContextMenuRef = useRef<HTMLDivElement | null>(null)
  const flushPendingNodeDragRef = useRef<(() => void) | null>(null)
  const lastPointerDownNodeIdRef = useRef<string | null>(null)
  const [quickCreateMenu, setQuickCreateMenu] = useState<QuickCreateMenuState | null>(null)
  const [canvasContextMenu, setCanvasContextMenu] = useState<CanvasContextMenuState | null>(null)
  useCanvasKeyboardShortcuts({
    flushPendingNodeDragRef,
    lastPointerDownNodeIdRef,
  })

  const handleConnect = useCallback((connection: Connection) => {
    const targetNode = nodes.find((node) => node.id === connection.target)
    const sourceNode = nodes.find((node) => node.id === connection.source)
    const isReferenceImageSource =
      isImageSourceNodeType(sourceNode?.type)

    if (targetNode?.type === 'compareNode') {
      if (!isReferenceImageSource || !connection.targetHandle || !['image1', 'image2'].includes(connection.targetHandle)) {
        return
      }
    }

    if (targetNode?.type === 'imageCropNode' && !isReferenceImageSource) {
      return
    }

    if (targetNode?.type === 'panoramaNode' && !isReferenceImageSource) {
      return
    }

    if (targetNode?.type === 'videoGenerateNode') {
      const sourceKind = getNodeConnectionOutput(sourceNode?.type)

      if ((connection.targetHandle === 'input' || connection.targetHandle === 'prompt') && !sourceKind) {
        return
      }

      if ((connection.targetHandle === 'image' || connection.targetHandle === 'firstFrame' || connection.targetHandle === 'lastFrame') && !isReferenceImageSource) {
        return
      }
    }

    if (targetNode?.type === 'generateNode' && isReferenceImageSource) {
      const currentReferenceCount = edges.filter((edge) => (
        edge.target === connection.target
        && isImageSourceNodeType(nodes.find((node) => node.id === edge.source)?.type)
      )).length

      if (currentReferenceCount >= MAX_GENERATE_REFERENCE_IMAGES) {
        notify({ tone: 'warning', title: '参考图已达上限', message: UI_TEXT.maxReferenceImages })
        return
      }
    }

    if (targetNode?.type === 'imageEditNode') {
      if (!isReferenceImageSource || !connection.targetHandle || !['base', 'reference'].includes(connection.targetHandle)) {
        return
      }

      if (connection.targetHandle === 'reference') {
        const currentReferenceCount = edges.filter((edge) => (
          edge.target === connection.target
          && edge.targetHandle === 'reference'
          && isImageSourceNodeType(nodes.find((node) => node.id === edge.source)?.type)
        )).length

        if (currentReferenceCount >= MAX_GENERATE_REFERENCE_IMAGES - 1) {
          notify({ tone: 'warning', title: '参考图已达上限', message: UI_TEXT.maxImageEditReferences })
          return
        }
      }
    }

    runTracked(() => connectNodes(connection), { deferCommit: true })
  }, [connectNodes, edges, nodes, notify, runTracked])

  const handleConnectStart = useCallback((_event: MouseEvent | TouchEvent, params: { nodeId: string | null, handleId: string | null, handleType: string | null }) => {
    if ((params.handleType !== 'source' && params.handleType !== 'target') || !params.nodeId) {
      pendingConnectionRef.current = null
      return
    }

    pendingConnectionRef.current = {
      nodeId: params.nodeId,
      handleId: params.handleId,
      handleType: params.handleType,
    }
  }, [])

  const handleConnectEnd = useCallback((event: MouseEvent | TouchEvent, connectionState: { toNode: Node | null }) => {
    const pendingConnection = pendingConnectionRef.current
    pendingConnectionRef.current = null

    if (!pendingConnection || connectionState.toNode) {
      return
    }

    const pendingNode = nodes.find((node) => node.id === pendingConnection.nodeId)
    const canQuickCreate = pendingConnection.handleType === 'source'
      ? Boolean(getNodeConnectionOutput(pendingNode?.type))
      : getNodeConnectionInputs(pendingNode?.type, pendingConnection.handleId).length > 0

    if (!canQuickCreate) {
      return
    }

    const { x, y } = getEventClientPosition(event)
    setQuickCreateMenu({
      ...pendingConnection,
      clientX: x,
      clientY: y,
    })
  }, [nodes])

  const quickCreateActions = useMemo<QuickCreateAction[]>(() => {
    if (!quickCreateMenu) {
      return []
    }

    const pendingNode = nodes.find((node) => node.id === quickCreateMenu.nodeId)
    if (!pendingNode) {
      return []
    }

    if (quickCreateMenu.handleType === 'source') {
      const sourceKind = getNodeConnectionOutput(pendingNode.type)
      if (!sourceKind) {
        return []
      }

      const actions: Array<QuickCreateAction & { sourceKinds: NodeConnectionKind[] }> = [
        {
          id: 'generate',
          label: 'AI 绘图',
          icon: <Sparkles className="h-3 w-3" />,
          sourceKinds: ['text', 'image'],
          createNode: addGenerateNode,
          createConnection: (newNodeId, pendingConnection) => ({
            source: pendingConnection.nodeId,
            sourceHandle: pendingConnection.handleId,
            target: newNodeId,
            targetHandle: getQuickCreateTargetHandle('generateNode'),
          }),
        },
        {
          id: 'llm',
          label: '大模型节点',
          icon: <Bot className="h-3 w-3" />,
          sourceKinds: ['text', 'image'],
          createNode: addLLMNode,
          createConnection: (newNodeId, pendingConnection) => ({
            source: pendingConnection.nodeId,
            sourceHandle: pendingConnection.handleId,
            target: newNodeId,
            targetHandle: getQuickCreateTargetHandle('llmFileNode'),
          }),
        },
        {
          id: 'video-generate',
          label: 'AI 视频',
          icon: <Video className="h-3 w-3" />,
          sourceKinds: ['text', 'image'],
          createNode: addVideoGenerateNode,
          createConnection: (newNodeId, pendingConnection) => ({
            source: pendingConnection.nodeId,
            sourceHandle: pendingConnection.handleId,
            target: newNodeId,
            targetHandle: getQuickCreateTargetHandle('videoGenerateNode'),
          }),
        },
        {
          id: 'text-splitter',
          label: '文本分割',
          icon: <ScissorsLineDashed className="h-3 w-3" />,
          sourceKinds: ['text'],
          createNode: addTextSplitterNode,
          createConnection: (newNodeId, pendingConnection) => ({
            source: pendingConnection.nodeId,
            sourceHandle: pendingConnection.handleId,
            target: newNodeId,
            targetHandle: getQuickCreateTargetHandle('inlineTextSplitterNode'),
          }),
        },
        {
          id: 'compare',
          label: '图片对比',
          icon: <ArrowLeftRight className="h-3 w-3" />,
          sourceKinds: ['image'],
          createNode: addCompareNode,
          createConnection: (newNodeId, pendingConnection) => ({
            source: pendingConnection.nodeId,
            sourceHandle: pendingConnection.handleId,
            target: newNodeId,
            targetHandle: getQuickCreateTargetHandle('compareNode'),
          }),
        },
        {
          id: 'image-crop',
          label: '图像裁切',
          icon: <Crop className="h-3 w-3" />,
          sourceKinds: ['image'],
          createNode: addImageCropNode,
          createConnection: (newNodeId, pendingConnection) => ({
            source: pendingConnection.nodeId,
            sourceHandle: pendingConnection.handleId,
            target: newNodeId,
            targetHandle: getQuickCreateTargetHandle('imageCropNode'),
          }),
        },
      ]

      return actions.filter((action) => action.sourceKinds.includes(sourceKind))
    }

    const targetKinds = getNodeConnectionInputs(pendingNode.type, quickCreateMenu.handleId)
    if (targetKinds.length === 0) {
      return []
    }

    const sourceActions: Array<QuickCreateAction & { outputKind: NodeConnectionKind }> = [
      {
        id: 'text',
        label: '文本节点',
        icon: <FileText className="h-3 w-3" />,
        outputKind: 'text',
        createNode: addTextNode,
        createConnection: (newNodeId, pendingConnection) => ({
          source: newNodeId,
          sourceHandle: 'output',
          target: pendingConnection.nodeId,
          targetHandle: pendingConnection.handleId,
        }),
      },
      {
        id: 'image',
        label: '图片节点',
        icon: <ImageIcon className="h-3 w-3" />,
        outputKind: 'image',
        createNode: addImageNode,
        createConnection: (newNodeId, pendingConnection) => ({
          source: newNodeId,
          sourceHandle: 'output',
          target: pendingConnection.nodeId,
          targetHandle: pendingConnection.handleId,
        }),
      },
    ]

    return sourceActions.filter((action) => targetKinds.includes(action.outputKind))
  }, [addCompareNode, addGenerateNode, addImageCropNode, addImageNode, addLLMNode, addTextNode, addTextSplitterNode, addVideoGenerateNode, nodes, quickCreateMenu])

  const quickCreateMenuPosition = useMemo(() => {
    if (!quickCreateMenu) {
      return null
    }

    return getQuickCreateMenuPosition(quickCreateMenu.clientX, quickCreateMenu.clientY)
  }, [quickCreateMenu])

  const canvasContextMenuCategories = useMemo(() => createCanvasNodeCatalog({
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
  }), [
    addCompareNode,
    addGenerateNode,
    addGeneratedPreviewNode,
    addImageCropNode,
    addImageNode,
    addLLMNode,
    addPanoramaNode,
    addTextNode,
    addTextSplitterNode,
    addVideoGenerateNode,
    addVideoNode,
  ])

  const canvasContextMenuPosition = useMemo(() => {
    if (!canvasContextMenu) {
      return null
    }

    return getFloatingMenuPosition({
      clientX: canvasContextMenu.clientX,
      clientY: canvasContextMenu.clientY,
      menuWidth: CANVAS_CONTEXT_MENU_WIDTH,
      minMenuHeight: CANVAS_CONTEXT_MENU_MIN_HEIGHT,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      margin: FLOATING_MENU_VIEWPORT_MARGIN,
    })
  }, [canvasContextMenu])

  const handleQuickCreate = useCallback((action: QuickCreateAction) => {
    if (!quickCreateMenu) {
      return
    }

    const pendingNodeExists = nodes.some((node) => node.id === quickCreateMenu.nodeId)
    if (!pendingNodeExists) {
      setQuickCreateMenu(null)
      return
    }

    const preferredPosition = screenToFlowPosition({
      x: quickCreateMenu.clientX + (quickCreateMenu.handleType === 'target' ? QUICK_CREATE_PREPEND_NODE_OFFSET_X : QUICK_CREATE_APPEND_NODE_OFFSET_X),
      y: quickCreateMenu.clientY + QUICK_CREATE_NODE_OFFSET_Y,
    })

    runTracked(() => {
      const newNodeId = action.createNode(preferredPosition)
      connectNodes(action.createConnection(newNodeId, quickCreateMenu))
    })

    setQuickCreateMenu(null)
  }, [connectNodes, nodes, quickCreateMenu, runTracked, screenToFlowPosition])

  const handlePaneContextMenu = useCallback((event: ReactMouseEvent<Element> | MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setQuickCreateMenu(null)
    setCanvasContextMenu({
      clientX: event.clientX,
      clientY: event.clientY,
    })
  }, [])

  const handleCanvasContextCreate = useCallback((tool: CanvasNodeTool) => {
    if (!canvasContextMenu) {
      return
    }

    const preferredPosition = screenToFlowPosition({
      x: canvasContextMenu.clientX,
      y: canvasContextMenu.clientY,
    })

    runTracked(() => {
      tool.createNode(preferredPosition)
    })
    setCanvasContextMenu(null)
  }, [canvasContextMenu, runTracked, screenToFlowPosition])

  const handleCanvasDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!isCanvasEmptyDropTarget(event.target) || !hasImageFileTransfer(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleCanvasDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!isCanvasEmptyDropTarget(event.target)) {
      return
    }

    const file = getFirstImageFile(event.dataTransfer)
    if (!file) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    if (!file.type.startsWith('image/')) {
      notify({ tone: 'warning', title: '无法导入文件', message: UI_TEXT.invalidDroppedImage })
      return
    }

    const preferredPosition = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })

    void importImageFile(file, workspaceConfigured)
      .then((importedImage) => {
        runTracked(() => {
          const imageNodeId = addImageNode(preferredPosition)
          updateNodeData(imageNodeId, {
            imageUrl: importedImage.imageUrl,
            imageAsset: importedImage.imageAsset,
            name: importedImage.name,
            imageNaturalWidth: importedImage.naturalWidth,
            imageNaturalHeight: importedImage.naturalHeight,
            width: importedImage.width,
            height: importedImage.height,
          })
        })
      })
      .catch((error) => {
        notify({ tone: 'error', title: '图片导入失败', message: error instanceof Error ? error.message : UI_TEXT.importImageFailed })
      })
  }, [addImageNode, notify, runTracked, screenToFlowPosition, updateNodeData, workspaceConfigured])

  useEffect(() => {
    if (!quickCreateMenu) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as globalThis.Node | null
      if (target && quickCreateMenuRef.current?.contains(target)) {
        return
      }

      setQuickCreateMenu(null)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setQuickCreateMenu(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [quickCreateMenu])

  useEffect(() => {
    if (!canvasContextMenu) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as globalThis.Node | null
      if (target && canvasContextMenuRef.current?.contains(target)) {
        return
      }

      setCanvasContextMenu(null)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCanvasContextMenu(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [canvasContextMenu])

  const isLightTheme = themeMode === 'light'
  const miniMapNodeColor = isLightTheme ? 'rgba(82,82,91,0.42)' : 'rgba(113,113,122,0.58)'
  const miniMapSelectedNodeColor = isLightTheme ? 'rgba(14,165,233,0.72)' : 'rgba(196,181,253,0.82)'
  const miniMapMaskColor = isLightTheme ? 'rgba(24, 24, 27, 0.08)' : 'rgba(255, 255, 255, 0.12)'
  const performanceClassName = [
    shouldUseLiteRendering ? 'canvas-performance-rendering' : '',
  ].filter(Boolean).join(' ')
  const edgesAnimated = !shouldUseLiteRendering && edgeStyle !== 'solid'
  const edgeOptions = useMemo<DefaultEdgeOptions>(() => ({
    ...DEFAULT_EDGE_OPTIONS,
    type: 'default',
    animated: edgesAnimated,
  }), [edgesAnimated])
  const renderedEdges = useMemo(() => (
    edges.map((edge) => ({
      ...edge,
      type: edge.type === 'straight' ? undefined : edge.type,
      animated: edgesAnimated,
    }))
  ), [edges, edgesAnimated])
  const topLeftPanel = useMemo(() => (
    <CanvasTopBar
      compact={isTopBarCollapsed}
      onToggleCollapse={() => {
        const nextCollapsed = !isTopBarCollapsed
        setStorageSettings({ canvasTopBarCollapsed: nextCollapsed })
        void persistWorkspaceConfig().catch(() => undefined)
      }}
    />
  ), [isTopBarCollapsed, persistWorkspaceConfig, setStorageSettings])

  return (
    <div className={`relative h-full w-full ${performanceClassName}`}>
      <CanvasFlowLayer
        nodes={nodes}
        edges={renderedEdges}
        edgeOptions={edgeOptions}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onPaneContextMenu={handlePaneContextMenu}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
        beginTransaction={beginTransaction}
        scheduleCommit={scheduleCommit}
        setNodePositions={setNodePositions}
        flushPendingNodeDragRef={flushPendingNodeDragRef}
        shouldUseLiteRendering={shouldUseLiteRendering}
        shouldShowAlignmentGuides={shouldShowAlignmentGuides}
        shouldUseInternalDrag={shouldUseInternalDrag}
        shouldCullOffscreenElements={shouldCullOffscreenElements}
        shouldStabilizeViewportElements={shouldStabilizeViewportElements}
        shouldFitView={shouldFitView}
        shouldShowBackground={shouldShowBackground}
        shouldShowMiniMap={shouldShowMiniMap}
        miniMapNodeColor={miniMapNodeColor}
        miniMapSelectedNodeColor={miniMapSelectedNodeColor}
        miniMapMaskColor={miniMapMaskColor}
        topLeftPanel={topLeftPanel}
      />

      {quickCreateMenu && quickCreateActions.length > 0 && quickCreateMenuPosition ? (
        <div
          ref={quickCreateMenuRef}
          className={`fixed z-30 w-[204px] overflow-hidden p-[5px] ${themeClasses.strongPanel}`}
          style={{ left: quickCreateMenuPosition.left, top: quickCreateMenuPosition.top }}
        >
          <div className={`flex h-8 items-center border-b border-[var(--border-subtle)] px-2 text-[0px] font-semibold leading-none ${themeClasses.textMuted}`}>
            <span className="text-[10px]">{QUICK_CREATE_TEXT.title}</span>
            创建并连接到
          </div>

          <div className="mt-[5px] flex flex-col gap-0.5">
            {quickCreateActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => handleQuickCreate(action)}
                className="group flex h-10 w-full items-center gap-2 rounded-lg border border-transparent px-2 text-left text-[var(--text-secondary)] transition hover:border-[var(--border-subtle)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)] focus-visible:border-[var(--border-subtle)] focus-visible:bg-[var(--control-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--text-primary)_20%,transparent)]"
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-secondary)] transition group-hover:border-[var(--accent-violet-muted)] group-hover:bg-[var(--accent-violet-soft)] group-hover:text-[var(--accent-violet-strong)]">
                  {action.icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium leading-none">{action.label}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--text-secondary)]" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {canvasContextMenu && canvasContextMenuPosition ? (
        <div
          ref={canvasContextMenuRef}
          className={`fixed z-40 w-[236px] overflow-hidden p-[5px] ${themeClasses.strongPanel}`}
          style={{ left: canvasContextMenuPosition.left, top: canvasContextMenuPosition.top }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className={`flex h-8 items-center border-b border-[var(--border-subtle)] px-2 text-[10px] font-semibold leading-none ${themeClasses.textMuted}`}>
            创建节点
          </div>

          <div className="node-scrollbar max-h-[min(62vh,30rem)] overflow-y-auto py-1">
            {canvasContextMenuCategories.map((category) => (
              <section key={category.id} className="py-1">
                <div className={`px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.14em] ${themeClasses.textMuted}`}>
                  {category.label}
                </div>
                <div className="flex flex-col gap-0.5">
                  {category.tools.map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => handleCanvasContextCreate(tool)}
                      className="group flex h-8 w-full items-center gap-2 rounded-lg border border-transparent px-2 text-left text-[var(--text-secondary)] transition hover:border-[var(--border-subtle)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)] focus-visible:border-[var(--border-subtle)] focus-visible:bg-[var(--control-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--text-primary)_20%,transparent)]"
                    >
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[var(--text-secondary)] transition group-hover:text-[var(--accent-violet-strong)]">
                        {tool.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium leading-none">{tool.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}

      <SelectionActionsToolbar />
    </div>
  )
}
