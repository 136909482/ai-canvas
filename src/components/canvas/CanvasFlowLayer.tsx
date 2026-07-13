import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type MutableRefObject, type ReactNode } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  Panel,
  ViewportPortal,
  type Connection,
  type DefaultEdgeOptions,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnNodeDrag,
} from '@xyflow/react'
import { getAlignmentSnap, getNodeBox, getResizeAlignmentSnap, type AlignmentGuides } from '@/features/canvasAlignment/alignmentSnapping'
import { nodeTypes } from '@/nodes/nodeRegistry'
import { applyVisualNodeChanges } from '@/store/canvasLayoutGeometry'
import { recordComponentRender } from '@/utils/performanceDiagnostics'
import { clearCanvasImagePreviewCache, pauseThumbnailQueue, resumeThumbnailQueue } from '../canvasImagePreviewRuntime'
import { CanvasPerformanceProvider } from '../CanvasPerformanceContext'
import { ViewportControls } from '../ViewportControls'
import { isEditableTarget } from './canvasDomUtils'

const VIEWPORT_INTERACTION_RESTORE_DELAY_MS = 140
const NODE_DRAG_RENDER_RESTORE_DELAY_MS = 220
const NODE_DRAG_POSITION_EPSILON = 0.01

type ResizeDimensionChange = NodeChange & {
  id: string
  type: 'dimensions'
  dimensions: { width: number; height: number }
  resizing: boolean
}

function isResizeDimensionChange(change: NodeChange): change is ResizeDimensionChange {
  return (
    'id' in change
    && change.type === 'dimensions'
    && typeof change.resizing === 'boolean'
    && typeof change.dimensions?.width === 'number'
    && typeof change.dimensions?.height === 'number'
  )
}

function getPositionChange(changes: NodeChange[], nodeId: string) {
  return changes.find((change) => (
    'id' in change
    && change.id === nodeId
    && change.type === 'position'
    && change.position
  ))
}

function buildResizedNode(node: Node, changes: NodeChange[], resizeChange: ResizeDimensionChange): Node {
  const positionChange = getPositionChange(changes, node.id)
  const nextPosition = positionChange && positionChange.type === 'position' && positionChange.position
    ? positionChange.position
    : node.position

  return {
    ...node,
    position: nextPosition,
    width: resizeChange.dimensions.width,
    height: resizeChange.dimensions.height,
    measured: {
      ...node.measured,
      width: resizeChange.dimensions.width,
      height: resizeChange.dimensions.height,
    },
  }
}

function applyResizeSnapToChanges(changes: NodeChange[], node: Node, resizedNode: Node, snapBox: ReturnType<typeof getNodeBox>) {
  const resizedBox = getNodeBox(resizedNode)
  const nextPosition = { x: snapBox.x, y: snapBox.y }
  const nextDimensions = { width: snapBox.width, height: snapBox.height }
  const shouldUpdatePosition = resizedBox.x !== snapBox.x || resizedBox.y !== snapBox.y
  let hasPositionChange = false
  let insertedPositionChange = false

  const snappedChanges = changes.flatMap((change): NodeChange[] => {
    if (!('id' in change) || change.id !== node.id) {
      return [change]
    }

    if (change.type === 'position') {
      hasPositionChange = true
      return shouldUpdatePosition
        ? [{ ...change, position: nextPosition }]
        : [change]
    }

    if (change.type !== 'dimensions') {
      return [change]
    }

    const dimensionChange: NodeChange = {
      ...change,
      dimensions: nextDimensions,
    }

    if (shouldUpdatePosition && !hasPositionChange && !insertedPositionChange) {
      insertedPositionChange = true
      return [
        {
          id: node.id,
          type: 'position',
          position: nextPosition,
        },
        dimensionChange,
      ]
    }

    return [dimensionChange]
  })

  return snappedChanges
}

function hasAlignmentGuides(guides: AlignmentGuides) {
  return Boolean(guides.vertical || guides.horizontal)
}

function isActivePositionDragChange(change: NodeChange) {
  return 'id' in change && change.type === 'position' && change.dragging === true
}

function isPureActivePositionDrag(changes: NodeChange[]) {
  return changes.length > 0 && changes.every(isActivePositionDragChange)
}

function isSettledPositionDragChange(change: NodeChange) {
  return 'id' in change && change.type === 'position' && change.dragging === false
}

function isPureSettledPositionDrag(changes: NodeChange[]) {
  return changes.length > 0 && changes.every(isSettledPositionDragChange)
}

function isTransientDraggedNodeDeselect(change: NodeChange, draggedNodeIds: Set<string>) {
  return 'id' in change
    && change.type === 'select'
    && change.selected === false
    && draggedNodeIds.has(change.id)
}

function filterTransientDraggedNodeDeselects(changes: NodeChange[], draggedNodeIds: Set<string>) {
  if (draggedNodeIds.size === 0) {
    return changes
  }

  const filteredChanges = changes.filter((change) => !isTransientDraggedNodeDeselect(change, draggedNodeIds))
  return filteredChanges.length === changes.length ? changes : filteredChanges
}

function getDraggedNodePositions(node: Node, draggedNodes: Node[]) {
  const activeDraggedNodes = draggedNodes.length > 0 ? draggedNodes : [node]
  const positionById = new Map<string, { x: number; y: number }>()

  for (const draggedNode of activeDraggedNodes) {
    positionById.set(draggedNode.id, draggedNode.position)
  }

  return [...positionById].map(([id, position]) => ({ id, position }))
}

function positionsChangedFromSnapshot(
  positions: Array<{ id: string; position: { x: number; y: number } }>,
  snapshot: Map<string, { x: number; y: number }>,
) {
  return positions.some(({ id, position }) => {
    const previous = snapshot.get(id)
    return !previous
      || Math.abs(previous.x - position.x) > NODE_DRAG_POSITION_EPSILON
      || Math.abs(previous.y - position.y) > NODE_DRAG_POSITION_EPSILON
  })
}

function positionChangesChangedFromSnapshot(changes: NodeChange[], snapshot: Map<string, { x: number; y: number }>) {
  return changes.some((change) => {
    if (!('id' in change) || change.type !== 'position' || !change.position) {
      return false
    }

    const previous = snapshot.get(change.id)
    return !previous
      || Math.abs(previous.x - change.position.x) > NODE_DRAG_POSITION_EPSILON
      || Math.abs(previous.y - change.position.y) > NODE_DRAG_POSITION_EPSILON
  })
}

function getSnappedDraggedNodePositions(node: Node, draggedNodes: Node[], delta: { x: number; y: number }) {
  return getDraggedNodePositions(node, draggedNodes).map(({ id, position }) => ({
    id,
    position: {
      x: position.x + delta.x,
      y: position.y + delta.y,
    },
  }))
}

function applyNodePositions(
  nodes: Node[],
  positions: Array<{ id: string; position: { x: number; y: number } }>,
  dragging: boolean,
) {
  if (positions.length === 0) {
    return nodes
  }

  return applyVisualNodeChanges(nodes, positions.map(({ id, position }) => ({
    id,
    type: 'position',
    position,
    dragging,
  })))
}

function applyNodeSelection(nodes: Node[], nodeIds: Set<string>, selected: boolean) {
  if (nodeIds.size === 0) {
    return nodes
  }

  return nodes.map((currentNode) => (
    nodeIds.has(currentNode.id) && currentNode.selected !== selected
      ? { ...currentNode, selected }
      : currentNode
  ))
}

function buildSettledPositionChanges(positions: Array<{ id: string; position: { x: number; y: number } }>): NodeChange[] {
  return positions.map(({ id, position }) => ({
    id,
    type: 'position',
    position,
    dragging: false,
  }))
}

function mergeQueuedSettledPositionChanges(existingChanges: NodeChange[], nextChanges: NodeChange[]) {
  if (existingChanges.length === 0) {
    return nextChanges
  }

  const mergedChanges = [...existingChanges]
  const settledPositionIndexById = new Map<string, number>()

  mergedChanges.forEach((change, index) => {
    if ('id' in change && change.type === 'position' && change.dragging === false) {
      settledPositionIndexById.set(change.id, index)
    }
  })

  for (const change of nextChanges) {
    if ('id' in change && change.type === 'position' && change.dragging === false) {
      const existingIndex = settledPositionIndexById.get(change.id)
      if (existingIndex !== undefined) {
        mergedChanges[existingIndex] = change
        continue
      }

      settledPositionIndexById.set(change.id, mergedChanges.length)
    }

    mergedChanges.push(change)
  }

  return mergedChanges
}

interface CanvasFlowLayerProps {
  nodes: Node[]
  edges: Edge[]
  edgeOptions: DefaultEdgeOptions
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  onConnectStart: (event: MouseEvent | TouchEvent, params: { nodeId: string | null, handleId: string | null, handleType: string | null }) => void
  onConnectEnd: (event: MouseEvent | TouchEvent, connectionState: { toNode: Node | null }) => void
  onPaneContextMenu: (event: ReactMouseEvent<Element> | MouseEvent) => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  beginTransaction: () => void
  scheduleCommit: () => void
  setNodePositions: (positions: Array<{ id: string; position: { x: number; y: number } }>) => void
  flushPendingNodeDragRef: MutableRefObject<(() => void) | null>
  shouldUseLiteRendering: boolean
  shouldShowAlignmentGuides: boolean
  shouldUseInternalDrag: boolean
  shouldCullOffscreenElements: boolean
  shouldStabilizeViewportElements: boolean
  shouldFitView: boolean
  shouldShowBackground: boolean
  shouldShowMiniMap: boolean
  miniMapNodeColor: string
  miniMapSelectedNodeColor: string
  miniMapMaskColor: string
  topLeftPanel: ReactNode
}

export function CanvasFlowLayer({
  nodes,
  edges,
  edgeOptions,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onConnectStart,
  onConnectEnd,
  onPaneContextMenu,
  onDragOver,
  onDrop,
  beginTransaction,
  scheduleCommit,
  setNodePositions,
  flushPendingNodeDragRef,
  shouldUseLiteRendering,
  shouldShowAlignmentGuides,
  shouldUseInternalDrag,
  shouldCullOffscreenElements,
  shouldStabilizeViewportElements,
  shouldFitView,
  shouldShowBackground,
  shouldShowMiniMap,
  miniMapNodeColor,
  miniMapSelectedNodeColor,
  miniMapMaskColor,
  topLeftPanel,
}: CanvasFlowLayerProps) {
  recordComponentRender('CanvasFlowLayer')
  const [isNodeDragging, setIsNodeDragging] = useState(false)
  const isViewportInteractingRef = useRef(false)
  const isNodeDraggingRef = useRef(false)
  const isNodeDragRenderingActiveRef = useRef(false)
  const [interactiveNodes, setInteractiveNodes] = useState<Node[]>(nodes)
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuides>({})
  const dragStopSnapFrameRef = useRef<number | null>(null)
  const dragStopCommitFrameRef = useRef<number | null>(null)
  const nodeDragRenderRestoreTimeoutRef = useRef<number | null>(null)
  const nodeDragRenderRestoreFrameRef = useRef<number | null>(null)
  const pendingNodeDragSettledChangesRef = useRef<NodeChange[]>([])
  const shouldCommitNodeDragSettledChangesRef = useRef(false)
  const interactiveNodeFrameRef = useRef<number | null>(null)
  const pendingInteractiveNodeChangesRef = useRef<NodeChange[]>([])
  const hasAppliedInteractiveNodeDragChangeRef = useRef(false)
  const hasMovedNodeDragRef = useRef(false)
  const nodeDragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const activeNodeDragIdsRef = useRef<Set<string>>(new Set())
  const viewportInteractionRestoreFrameRef = useRef<number | null>(null)
  const viewportInteractionRestoreTimeoutRef = useRef<number | null>(null)
  const clearAlignmentGuides = useCallback(() => {
    setAlignmentGuides((current) => (hasAlignmentGuides(current) ? {} : current))
  }, [])

  const clearViewportRestoreTimers = useCallback(() => {
    if (viewportInteractionRestoreTimeoutRef.current !== null) {
      window.clearTimeout(viewportInteractionRestoreTimeoutRef.current)
      viewportInteractionRestoreTimeoutRef.current = null
    }

    if (viewportInteractionRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(viewportInteractionRestoreFrameRef.current)
      viewportInteractionRestoreFrameRef.current = null
    }

  }, [])

  const clearNodeDragRenderRestoreTimers = useCallback(() => {
    if (nodeDragRenderRestoreTimeoutRef.current !== null) {
      window.clearTimeout(nodeDragRenderRestoreTimeoutRef.current)
      nodeDragRenderRestoreTimeoutRef.current = null
    }

    if (nodeDragRenderRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(nodeDragRenderRestoreFrameRef.current)
      nodeDragRenderRestoreFrameRef.current = null
    }
  }, [])

  const restoreNodeDragRendering = useCallback(() => {
    clearNodeDragRenderRestoreTimers()
    isNodeDragRenderingActiveRef.current = false
    hasAppliedInteractiveNodeDragChangeRef.current = false
    hasMovedNodeDragRef.current = false
    nodeDragStartPositionsRef.current = new Map()
    activeNodeDragIdsRef.current = new Set()
    setIsNodeDragging(false)
    setInteractiveNodes([])
  }, [clearNodeDragRenderRestoreTimers])

  const restoreNodeDragRenderingAfterStoreSync = useCallback(() => {
    clearNodeDragRenderRestoreTimers()

    nodeDragRenderRestoreFrameRef.current = window.requestAnimationFrame(() => {
      nodeDragRenderRestoreFrameRef.current = null
      restoreNodeDragRendering()
    })
  }, [clearNodeDragRenderRestoreTimers, restoreNodeDragRendering])

  const flushNodeDragSettledChanges = useCallback(() => {
    clearNodeDragRenderRestoreTimers()

    const pendingChanges = pendingNodeDragSettledChangesRef.current
    const shouldCommit = shouldCommitNodeDragSettledChangesRef.current
    pendingNodeDragSettledChangesRef.current = []
    shouldCommitNodeDragSettledChangesRef.current = false

    if (pendingChanges.length > 0) {
      onNodesChange(pendingChanges)
    }

    if (shouldCommit) {
      scheduleCommit()
    }

    if (pendingChanges.length > 0) {
      restoreNodeDragRenderingAfterStoreSync()
      return
    }

    restoreNodeDragRendering()
  }, [clearNodeDragRenderRestoreTimers, onNodesChange, restoreNodeDragRendering, restoreNodeDragRenderingAfterStoreSync, scheduleCommit])

  useEffect(() => {
    flushPendingNodeDragRef.current = flushNodeDragSettledChanges
    return () => {
      if (flushPendingNodeDragRef.current === flushNodeDragSettledChanges) {
        flushPendingNodeDragRef.current = null
      }
    }
  }, [flushNodeDragSettledChanges, flushPendingNodeDragRef])

  const scheduleNodeDragSettledFlush = useCallback((options?: { commit?: boolean }) => {
    clearNodeDragRenderRestoreTimers()

    shouldCommitNodeDragSettledChangesRef.current ||= Boolean(options?.commit)

    nodeDragRenderRestoreTimeoutRef.current = window.setTimeout(() => {
      nodeDragRenderRestoreFrameRef.current = window.requestAnimationFrame(() => {
        nodeDragRenderRestoreTimeoutRef.current = null
        nodeDragRenderRestoreFrameRef.current = null
        flushNodeDragSettledChanges()
      })
    }, NODE_DRAG_RENDER_RESTORE_DELAY_MS)
  }, [clearNodeDragRenderRestoreTimers, flushNodeDragSettledChanges])

  const queueNodeDragSettledChanges = useCallback((changes: NodeChange[], options?: { commit?: boolean }) => {
    pendingNodeDragSettledChangesRef.current = mergeQueuedSettledPositionChanges(
      pendingNodeDragSettledChangesRef.current,
      changes,
    )
    setInteractiveNodes((currentNodes) => applyVisualNodeChanges(currentNodes, changes))
    scheduleNodeDragSettledFlush(options)
  }, [scheduleNodeDragSettledFlush])

  const handleViewportMoveStart = useCallback(() => {
    clearViewportRestoreTimers()
    clearNodeDragRenderRestoreTimers()
    isViewportInteractingRef.current = true
  }, [clearNodeDragRenderRestoreTimers, clearViewportRestoreTimers])

  const handleViewportMove = useCallback(() => {
    if (isViewportInteractingRef.current) {
      return
    }

    clearViewportRestoreTimers()
    clearNodeDragRenderRestoreTimers()
    isViewportInteractingRef.current = true
  }, [clearNodeDragRenderRestoreTimers, clearViewportRestoreTimers])

  const handleViewportMoveEnd = useCallback(() => {
    clearViewportRestoreTimers()

    if (!isViewportInteractingRef.current) {
      if (!isNodeDraggingRef.current && isNodeDragRenderingActiveRef.current) {
        scheduleNodeDragSettledFlush({ commit: true })
      }
      return
    }

    viewportInteractionRestoreTimeoutRef.current = window.setTimeout(() => {
      viewportInteractionRestoreFrameRef.current = window.requestAnimationFrame(() => {
        isViewportInteractingRef.current = false
        viewportInteractionRestoreFrameRef.current = null
        viewportInteractionRestoreTimeoutRef.current = null
      })
    }, VIEWPORT_INTERACTION_RESTORE_DELAY_MS)

    if (!isNodeDraggingRef.current && isNodeDragRenderingActiveRef.current) {
      scheduleNodeDragSettledFlush({ commit: true })
    }
  }, [clearViewportRestoreTimers, scheduleNodeDragSettledFlush])

  useEffect(() => {
    const handleHistoryShortcutCapture = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || (!event.ctrlKey && !event.metaKey)) {
        return
      }

      const key = event.key.toLowerCase()
      if (key === 'z' || key === 'y') {
        flushNodeDragSettledChanges()
      }
    }

    window.addEventListener('keydown', handleHistoryShortcutCapture, true)
    return () => window.removeEventListener('keydown', handleHistoryShortcutCapture, true)
  }, [flushNodeDragSettledChanges])

  const clearPendingInteractiveNodeChanges = useCallback(() => {
    pendingInteractiveNodeChangesRef.current = []

    if (interactiveNodeFrameRef.current !== null) {
      window.cancelAnimationFrame(interactiveNodeFrameRef.current)
      interactiveNodeFrameRef.current = null
    }
  }, [])

  const scheduleInteractiveNodeChanges = useCallback((changes: NodeChange[]) => {
    const didMove = positionChangesChangedFromSnapshot(changes, nodeDragStartPositionsRef.current)

    if (!hasAppliedInteractiveNodeDragChangeRef.current) {
      hasAppliedInteractiveNodeDragChangeRef.current = true
      hasMovedNodeDragRef.current ||= didMove
      if (didMove) {
        setIsNodeDragging(true)
      }
      setInteractiveNodes((currentNodes) => applyVisualNodeChanges(currentNodes, changes))
      return
    }

    hasMovedNodeDragRef.current ||= didMove
    if (didMove) {
      setIsNodeDragging(true)
    }
    pendingInteractiveNodeChangesRef.current = [
      ...pendingInteractiveNodeChangesRef.current,
      ...changes,
    ]

    if (interactiveNodeFrameRef.current !== null) {
      return
    }

    interactiveNodeFrameRef.current = window.requestAnimationFrame(() => {
      const pendingChanges = pendingInteractiveNodeChangesRef.current
      pendingInteractiveNodeChangesRef.current = []
      interactiveNodeFrameRef.current = null

      if (pendingChanges.length === 0) {
        return
      }

      setInteractiveNodes((currentNodes) => applyVisualNodeChanges(currentNodes, pendingChanges))
    })
  }, [])

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    if (!shouldShowAlignmentGuides && isNodeDraggingRef.current && isPureActivePositionDrag(changes)) {
      if (!shouldUseInternalDrag) {
        scheduleInteractiveNodeChanges(changes)
      }
      return
    }

    if (shouldShowAlignmentGuides && isNodeDraggingRef.current && isPureActivePositionDrag(changes)) {
      return
    }

    const effectiveChanges = isNodeDragRenderingActiveRef.current
      ? filterTransientDraggedNodeDeselects(changes, activeNodeDragIdsRef.current)
      : changes

    if (effectiveChanges.length === 0) {
      return
    }

    if (isNodeDragRenderingActiveRef.current && isPureSettledPositionDrag(effectiveChanges)) {
      const didMove = hasMovedNodeDragRef.current
        || positionChangesChangedFromSnapshot(effectiveChanges, nodeDragStartPositionsRef.current)
      if (!didMove) {
        return
      }
      hasMovedNodeDragRef.current = true
      queueNodeDragSettledChanges(effectiveChanges, { commit: true })
      return
    }

    const resizeChange = effectiveChanges.find(isResizeDimensionChange)

    if (!resizeChange || !shouldShowAlignmentGuides) {
      if (resizeChange?.resizing === false) {
        clearAlignmentGuides()
      }
      onNodesChange(effectiveChanges)
      return
    }

    const originalNode = nodes.find((currentNode) => currentNode.id === resizeChange.id)
    if (!originalNode) {
      onNodesChange(effectiveChanges)
      return
    }

    const resizedNode = buildResizedNode(originalNode, effectiveChanges, resizeChange)
    const nextNodes = nodes.map((currentNode) => (
      currentNode.id === resizedNode.id ? resizedNode : currentNode
    ))
    const alignmentSnap = getResizeAlignmentSnap(originalNode, resizedNode, nextNodes)
    const snappedChanges = applyResizeSnapToChanges(effectiveChanges, originalNode, resizedNode, alignmentSnap.nextBox)

    if (resizeChange.resizing) {
      setAlignmentGuides(alignmentSnap.guides)
    } else {
      clearAlignmentGuides()
    }
    onNodesChange(snappedChanges)
  }, [clearAlignmentGuides, nodes, onNodesChange, queueNodeDragSettledChanges, scheduleInteractiveNodeChanges, shouldShowAlignmentGuides, shouldUseInternalDrag])

  const handleNodeDragStart: OnNodeDrag<Node> = useCallback((_event, node, draggedNodes) => {
    if (pendingNodeDragSettledChangesRef.current.length > 0 || shouldCommitNodeDragSettledChangesRef.current) {
      flushNodeDragSettledChanges()
    }
    clearNodeDragRenderRestoreTimers()
    beginTransaction()
    const startPositions = getDraggedNodePositions(node, draggedNodes)
    const draggedNodeIds = new Set(startPositions.map(({ id }) => id))
    nodeDragStartPositionsRef.current = new Map(startPositions.map(({ id, position }) => [id, position]))
    activeNodeDragIdsRef.current = draggedNodeIds
    setInteractiveNodes(applyNodeSelection(nodes, draggedNodeIds, true))
    hasAppliedInteractiveNodeDragChangeRef.current = false
    hasMovedNodeDragRef.current = false
    isNodeDraggingRef.current = true
    isNodeDragRenderingActiveRef.current = true
    setIsNodeDragging(false)
  }, [beginTransaction, clearNodeDragRenderRestoreTimers, flushNodeDragSettledChanges, nodes])

  const handleNodeDrag: OnNodeDrag<Node> = useCallback((_event, node, draggedNodes) => {
    const activeDraggedNodes = draggedNodes.length > 0 ? draggedNodes : [node]
    const draggedNodeById = new Map(activeDraggedNodes.map((draggedNode) => [draggedNode.id, draggedNode]))
    const nextNodes = nodes.map((currentNode) => draggedNodeById.get(currentNode.id) ?? currentNode)
    const alignmentSnap = getAlignmentSnap(activeDraggedNodes, nextNodes)

    const snappedPositions = getSnappedDraggedNodePositions(node, draggedNodes, alignmentSnap.delta)
    const didMove = positionsChangedFromSnapshot(snappedPositions, nodeDragStartPositionsRef.current)
    hasMovedNodeDragRef.current ||= didMove
    if (didMove) {
      setIsNodeDragging(true)
    }
    setInteractiveNodes((currentNodes) => applyNodePositions(currentNodes, snappedPositions, true))

    setAlignmentGuides(alignmentSnap.guides)
  }, [nodes])

  const handleNodeDragStop: OnNodeDrag<Node> = useCallback((_event, node, draggedNodes) => {
    const finalPositions = getDraggedNodePositions(node, draggedNodes)
    const didMove = hasMovedNodeDragRef.current || positionsChangedFromSnapshot(finalPositions, nodeDragStartPositionsRef.current)

    clearPendingInteractiveNodeChanges()
    isNodeDraggingRef.current = false
    clearAlignmentGuides()

    if (!didMove) {
      restoreNodeDragRendering()
      return
    }

    if (!shouldShowAlignmentGuides) {
      setInteractiveNodes((currentNodes) => applyNodePositions(currentNodes, finalPositions, false))
      if (shouldUseInternalDrag) {
        setNodePositions(getDraggedNodePositions(node, draggedNodes))
        if (dragStopCommitFrameRef.current !== null) {
          window.cancelAnimationFrame(dragStopCommitFrameRef.current)
        }
        dragStopCommitFrameRef.current = window.requestAnimationFrame(() => {
          dragStopCommitFrameRef.current = null
          scheduleNodeDragSettledFlush({ commit: true })
        })
        return
      }
      queueNodeDragSettledChanges(buildSettledPositionChanges(finalPositions), { commit: true })
      return
    }

    const activeDraggedNodes = draggedNodes.length > 0 ? draggedNodes : [node]
    const draggedNodeById = new Map(activeDraggedNodes.map((draggedNode) => [draggedNode.id, draggedNode]))
    const nextNodes = nodes.map((currentNode) => draggedNodeById.get(currentNode.id) ?? currentNode)
    const alignmentSnap = getAlignmentSnap(activeDraggedNodes, nextNodes)
    const shouldSnap = alignmentSnap.delta.x !== 0 || alignmentSnap.delta.y !== 0
    const settledPositions = shouldSnap
      ? getSnappedDraggedNodePositions(node, draggedNodes, alignmentSnap.delta)
      : finalPositions

    setInteractiveNodes((currentNodes) => applyNodePositions(currentNodes, settledPositions, false))

    if (!shouldSnap) {
      queueNodeDragSettledChanges(buildSettledPositionChanges(finalPositions), { commit: true })
      return
    }

    if (dragStopSnapFrameRef.current !== null) {
      window.cancelAnimationFrame(dragStopSnapFrameRef.current)
    }

    dragStopSnapFrameRef.current = window.requestAnimationFrame(() => {
      queueNodeDragSettledChanges(buildSettledPositionChanges(settledPositions), { commit: true })

      dragStopSnapFrameRef.current = null
    })
  }, [clearAlignmentGuides, clearPendingInteractiveNodeChanges, nodes, queueNodeDragSettledChanges, restoreNodeDragRendering, scheduleNodeDragSettledFlush, setNodePositions, shouldShowAlignmentGuides, shouldUseInternalDrag])

  useEffect(() => () => {
    clearViewportRestoreTimers()
    clearCanvasImagePreviewCache()
    clearPendingInteractiveNodeChanges()
    clearNodeDragRenderRestoreTimers()
    pendingNodeDragSettledChangesRef.current = []
    shouldCommitNodeDragSettledChangesRef.current = false

    if (dragStopSnapFrameRef.current !== null) {
      window.cancelAnimationFrame(dragStopSnapFrameRef.current)
      dragStopSnapFrameRef.current = null
    }

    if (dragStopCommitFrameRef.current !== null) {
      window.cancelAnimationFrame(dragStopCommitFrameRef.current)
      dragStopCommitFrameRef.current = null
    }
  }, [clearNodeDragRenderRestoreTimers, clearPendingInteractiveNodeChanges, clearViewportRestoreTimers])

  const shouldDeferThumbnailWork = isNodeDragging

  useEffect(() => {
    if (!shouldDeferThumbnailWork) {
      return
    }

    pauseThumbnailQueue()
    return resumeThumbnailQueue
  }, [shouldDeferThumbnailWork])

  const canvasPerformanceContextValue = useMemo(() => ({
    forceLowQualityImages: shouldUseLiteRendering,
    deferThumbnailWork: false,
  }), [shouldUseLiteRendering])
  const shouldCullReactFlowElements = shouldStabilizeViewportElements
    ? false
    : shouldCullOffscreenElements

  return (
    <CanvasPerformanceProvider value={canvasPerformanceContextValue}>
      <ReactFlow
        nodes={isNodeDragging && !shouldUseInternalDrag ? interactiveNodes : nodes}
        edges={edges}
        defaultEdgeOptions={edgeOptions}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onMoveStart={handleViewportMoveStart}
        onMove={handleViewportMove}
        onMoveEnd={handleViewportMoveEnd}
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={shouldShowAlignmentGuides ? handleNodeDrag : undefined}
        onNodeDragStop={handleNodeDragStop}
        proOptions={{ hideAttribution: true }}
        minZoom={0.05}
        maxZoom={4}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        fitView={shouldFitView}
        fitViewOptions={{ padding: 0.2, maxZoom: 0.8 }}
        elevateNodesOnSelect={false}
        onlyRenderVisibleElements={shouldCullReactFlowElements}
        className={`bg-[var(--canvas-bg)] ${shouldStabilizeViewportElements ? 'canvas-image-heavy-stable' : ''}`}
        onPaneContextMenu={onPaneContextMenu}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <Panel position="top-left" className="m-4">
          {topLeftPanel}
        </Panel>
        {shouldShowBackground ? <Background color="var(--flow-grid)" gap={28} size={1.6} /> : null}
        <ViewportControls onBeforeHistoryAction={flushNodeDragSettledChanges} />
        {shouldShowMiniMap ? (
          <MiniMap
            className="!right-5 !bottom-5 !h-28 !w-48 !overflow-hidden !rounded-lg !border !border-[var(--border-subtle)] !bg-[var(--panel-bg)] !shadow-[var(--shadow-panel)] !backdrop-blur-xl [&_.react-flow__minimap-mask]:!rx-2 [&_.react-flow__minimap-mask]:!ry-2 [&_.react-flow__minimap-node]:!stroke-[var(--border-subtle)] [&_svg]:!h-full [&_svg]:!w-full"
            nodeColor={(node) => (node.selected ? miniMapSelectedNodeColor : miniMapNodeColor)}
            maskColor={miniMapMaskColor}
            pannable
            zoomable
          />
        ) : null}
        {shouldShowAlignmentGuides && (alignmentGuides.vertical || alignmentGuides.horizontal) ? (
          <ViewportPortal>
            {alignmentGuides.vertical ? (
              <div
                className="pointer-events-none absolute z-[2] w-px bg-[var(--accent-violet-strong)] shadow-[0_0_8px_var(--accent-violet-glow)]"
                style={{
                  transform: `translate(${alignmentGuides.vertical.x}px, ${alignmentGuides.vertical.y1}px)`,
                  height: alignmentGuides.vertical.y2 - alignmentGuides.vertical.y1,
                }}
              />
            ) : null}
            {alignmentGuides.horizontal ? (
              <div
                className="pointer-events-none absolute z-[2] h-px bg-[var(--accent-violet-strong)] shadow-[0_0_8px_var(--accent-violet-glow)]"
                style={{
                  transform: `translate(${alignmentGuides.horizontal.x1}px, ${alignmentGuides.horizontal.y}px)`,
                  width: alignmentGuides.horizontal.x2 - alignmentGuides.horizontal.x1,
                }}
              />
            ) : null}
          </ViewportPortal>
        ) : null}
      </ReactFlow>
    </CanvasPerformanceProvider>
  )
}
