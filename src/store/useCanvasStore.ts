import { computeAutoLayout, computeFocusedAutoLayout, type LayoutDirection } from '@/utils/autoLayout'
import { create } from 'zustand'
import {
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react'
import type {
  CanvasSnapshot,
  VideoNodeData,
  GenerateNodeData,
  WorkflowTemplate,
} from '@/types'
import { instantiateWorkflowTemplate } from '@/features/workflowTemplates/runtime'
import { getCanvasNodeRegistration, getManualNodeRegistration, type ManualCanvasNodeType } from '@/features/nodeRegistry/protocol'
import {
  DEFAULT_IMAGE_CROP_COLUMNS,
  DEFAULT_IMAGE_CROP_ROWS,
  clampCropSegmentCount,
  cropImageIntoTiles,
  normalizeCropCuts,
} from '@/features/imageCrop/runtime'
import {
  getOrderedStringIds,
} from './canvasNodeData'
import {
  buildGeneratedPreviewNode,
  buildGeneratedVideoNode,
  buildLLMOutputTextNode,
  type GeneratedPreviewNodeDraft,
  type LLMOutputTextNodeDraft,
} from './canvasNodeCreation'
import {
  sanitizeCanvasSnapshotForHistory,
  sanitizeCanvasSnapshotForPersistence,
} from './canvasSnapshotSanitizers'
import { buildImageCropOutputState } from './canvasImageCropRuntime'
import { buildTextSplitterOutputState } from './canvasTextSplitterRuntime'
import {
  getCanvasNodeById,
  isTextSourceNode,
} from './canvasConnectionSources'
import {
  buildSyncedGraphState,
  syncConnectionDerivedNodeData,
} from './canvasConnectionDerivedData'
import {
  DEFAULT_INLINE_TEXT_SPLITTER_NODE_HEIGHT,
  DEFAULT_LLM_OUTPUT_TEXT_NODE_HEIGHT,
  DEFAULT_LLM_OUTPUT_TEXT_NODE_WIDTH,
  DEFAULT_PREVIEW_NODE_HEIGHT,
  DEFAULT_PREVIEW_NODE_WIDTH,
  DEFAULT_VIDEO_GENERATE_NODE_HEIGHT,
  DEFAULT_VIDEO_GENERATE_NODE_WIDTH,
  DEFAULT_VIDEO_NODE_HEIGHT,
  DEFAULT_VIDEO_NODE_WIDTH,
  applyGroupAwareLayoutPositions,
  applyVisualNodeChanges,
  buildGroupAwareLayoutTargets,
  findManualSpawnPosition,
  getAbsoluteNodePosition,
  normalizeVisualGroupNodes,
} from './canvasLayoutGeometry'
import {
  PREVIEW_LAYOUT_OFFSET_X,
  applyDragStopSideEffects,
  layoutGeneratedPreviewNodesInContext,
  layoutLLMOutputTextNodesInContext,
  layoutTextSplitterOutputNodesInContext,
} from './canvasOutputLayout'
import {
  canDuplicateNode,
  cloneNodeForDuplicate,
} from './canvasNodeClipboard'
import {
  buildGroupedSelectionState,
  buildManualNodeSelection,
  buildUngroupedSelectionState,
} from './canvasSelectionGroups'
import {
  buildEdgeDeletedGraphState,
  buildEdgesDeletedBySourceTargetExceptHandleState,
  buildEdgesDeletedBySourceTargetHandleState,
  buildEdgesDeletedBySourceTargetState,
  buildNodeDeletedGraphState,
  buildSelectedElementsDeletedGraphState,
} from './canvasGraphDeletion'
import {
  buildNodeDataUpdatedState,
} from './canvasNodeDataUpdates'
import {
  buildConnectedComponentNodeIds,
  resetNodeIdCounter,
  syncNodeIdCounter,
  takeNextNodeId,
} from './canvasNodeIds'

export { getNodeSize } from './canvasLayoutGeometry'
export {
  makeSelectGenerateMaskSourceNode,
  makeSelectGenerateReferenceSourceNodes,
  makeSelectImageEditReferenceSourceNodes,
  makeSelectLLMInputImageSourceNodes,
  selectHasCanvasContent,
  selectSelectedGroupNodes,
  selectSelectedTopLevelNodes,
} from './canvasStoreSelectors'

interface CanvasStore {
  nodes: Node[]
  edges: Edge[]
  copiedNode: Node | null
  getSnapshot: () => CanvasSnapshot
  getHistorySnapshot: () => CanvasSnapshot
  replaceSnapshot: (snapshot: CanvasSnapshot) => void
  resetToEmpty: () => void
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (conn: Connection) => void
  addNodeByType: (type: ManualCanvasNodeType, preferredPosition?: { x: number; y: number }) => string
  addImageNode: (preferredPosition?: { x: number; y: number }) => string
  addVideoNode: (preferredPosition?: { x: number; y: number }) => string
  addVideoGenerateNode: (preferredPosition?: { x: number; y: number }) => string
  addImageCropNode: (preferredPosition?: { x: number; y: number }) => string
  addTextNode: (preferredPosition?: { x: number; y: number }) => string
  addTextSplitterNode: (preferredPosition?: { x: number; y: number }) => string
  addInlineTextSplitterNode: (preferredPosition?: { x: number; y: number }) => string
  addGenerateNode: (preferredPosition?: { x: number; y: number }) => string
  addImageEditNode: (preferredPosition?: { x: number; y: number }) => string
  addLLMNode: (preferredPosition?: { x: number; y: number }) => string
  addLLMFileNode: (preferredPosition?: { x: number; y: number }) => string
  addGeneratedPreviewNode: (preferredPosition?: { x: number; y: number }) => string
  addCompareNode: (preferredPosition?: { x: number; y: number }) => string
  addTestImageNode: (preferredPosition?: { x: number; y: number }) => string
  addPanoramaNode: (preferredPosition?: { x: number; y: number }) => string
  groupSelectedNodes: () => string | null
  attachNodeToGroup: (
    nodeId: string,
    groupId: string,
    absolutePosition?: { x: number; y: number },
  ) => void
  detachNodeFromGroup: (
    nodeId: string,
    absolutePosition?: { x: number; y: number },
  ) => void
  ungroupNode: (groupId: string) => void
  deleteNode: (id: string) => void
  deleteEdge: (id: string) => void
  deleteEdgesBySourceTarget: (sourceId: string, targetId: string) => void
  deleteEdgesBySourceTargetHandle: (sourceId: string, targetId: string, targetHandle: string) => void
  deleteEdgesBySourceTargetExceptHandle: (sourceId: string, targetId: string, excludedTargetHandle: string) => void
  selectNode: (id: string) => void
  deleteSelectedElements: () => void
  copySelectedNode: () => string | null
  duplicateSelectedNode: () => string | null
  pasteCopiedNode: () => string | null
  updateNodeData: (id: string, patch: Record<string, unknown>) => void
  syncTextSplitterOutputs: (id: string) => void
  syncInlineTextSplitterParts: (id: string) => void
  runImageCropNode: (id: string) => Promise<void>
  updateGenerateNodeData: (id: string, patch: Partial<GenerateNodeData>) => void
  createGeneratedPreviewNode: (
    sourceGenerateNodeId: string,
    preview: GeneratedPreviewNodeDraft
  ) => string
  createGeneratedVideoNode: (
    sourceVideoGenerateNodeId: string,
    video: Partial<VideoNodeData>
  ) => string
  createLLMOutputTextNode: (
    sourceLLMNodeId: string,
    outputNode: LLMOutputTextNodeDraft
  ) => string
  setNodePosition: (id: string, position: { x: number; y: number }) => void
  setNodePositions: (positions: Array<{ id: string; position: { x: number; y: number } }>) => void
  updateNode: (id: string, patch: Partial<Node>) => void
  arrangeSelectedNodes: (direction: LayoutDirection) => void
  arrangeAllNodes: (direction: LayoutDirection) => void
  arrangeConnectedGraphFromSelection: () => boolean
  insertWorkflowTemplate: (template: WorkflowTemplate, preferredPosition?: { x: number; y: number }) => string[]
}

let workflowTemplateEdgeCounter = 1

function applySettledPositionSideEffects(nodes: Node[], changes: NodeChange[]) {
  let nextNodes = nodes
  const movedPreviewSourceIds = new Set(
    changes
      .map((change) => {
        if (!('id' in change) || change.type !== 'position') {
          return null
        }

        const changedNode = nextNodes.find((node) => node.id === change.id)
        return changedNode?.type === 'generatedPreviewNode'
          ? (typeof changedNode.data?.sourceGenerateNodeId === 'string' ? changedNode.data.sourceGenerateNodeId : null)
          : null
      })
      .filter((id): id is string => Boolean(id)),
  )

  if (movedPreviewSourceIds.size > 0) {
    nextNodes = nextNodes.map((node) => {
      if (
        node.type !== 'generatedPreviewNode'
        || !movedPreviewSourceIds.has(typeof node.data?.sourceGenerateNodeId === 'string' ? node.data.sourceGenerateNodeId : '')
      ) {
        return node
      }

      return {
        ...node,
        data: {
          ...node.data,
          layoutMode: 'manual',
        },
      }
    })
  }

  const movedLLMOutputSourceIds = new Set(
    changes
      .map((change) => {
        if (!('id' in change) || change.type !== 'position') {
          return null
        }

        const changedNode = nextNodes.find((node) => node.id === change.id)
        return changedNode?.type === 'llmOutputTextNode'
          ? (typeof changedNode.data?.sourceLLMNodeId === 'string' ? changedNode.data.sourceLLMNodeId : null)
          : null
      })
      .filter((id): id is string => Boolean(id)),
  )

  if (movedLLMOutputSourceIds.size > 0) {
    nextNodes = nextNodes.map((node) => {
      if (
        node.type !== 'llmOutputTextNode'
        || !movedLLMOutputSourceIds.has(typeof node.data?.sourceLLMNodeId === 'string' ? node.data.sourceLLMNodeId : '')
      ) {
        return node
      }

      return {
        ...node,
        data: {
          ...node.data,
          layoutMode: 'manual',
        },
      }
    })
  }

  return applyDragStopSideEffects(nextNodes, changes)
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  copiedNode: null,

  getSnapshot: (): CanvasSnapshot => sanitizeCanvasSnapshotForPersistence({
    nodes: get().nodes,
    edges: get().edges,
  }, normalizeVisualGroupNodes),

  getHistorySnapshot: (): CanvasSnapshot => sanitizeCanvasSnapshotForHistory({
    nodes: get().nodes,
    edges: get().edges,
  }, normalizeVisualGroupNodes),

  replaceSnapshot: (snapshot) =>
    set(() => {
      const sanitized = sanitizeCanvasSnapshotForHistory(snapshot, normalizeVisualGroupNodes)
      syncNodeIdCounter(sanitized.nodes)

      return {
        nodes: sanitized.nodes,
        edges: sanitized.edges,
        copiedNode: null,
      }
    }),

  resetToEmpty: () =>
    set(() => {
      resetNodeIdCounter()
      return {
        nodes: [],
        edges: [],
        copiedNode: null,
      }
    }),

  onNodesChange: (changes) =>
    set((s) => {
      const nextNodes = applyVisualNodeChanges(s.nodes, changes)
      const isDragging = changes.some((change) => (
        'id' in change && change.type === 'position' && change.dragging === true
      ))

      if (isDragging) {
        return { nodes: nextNodes }
      }

      return {
        nodes: applySettledPositionSideEffects(nextNodes, changes),
      }
    }),

  onEdgesChange: (changes) =>
    set((s) => {
      const nextEdges = applyEdgeChanges(changes, s.edges)
      return buildSyncedGraphState(s.nodes, nextEdges)
    }),

  onConnect: (conn) =>
    set((s) => {
      const targetNode = s.nodes.find((node) => node.id === conn.target)
      const sourceNode = s.nodes.find((node) => node.id === conn.source)
      const isTextSource = isTextSourceNode(sourceNode)
      const shouldReplaceExistingTargetHandle =
        Boolean(conn.targetHandle)
        && (
          targetNode?.type === 'compareNode'
          || (
            targetNode?.type === 'generateNode'
            && isTextSource
          )
          || (
            targetNode?.type === 'videoGenerateNode'
            && isTextSource
          )
          || (
            targetNode?.type === 'videoGenerateNode'
            && (conn.targetHandle === 'firstFrame' || conn.targetHandle === 'lastFrame')
          )
          || (
            targetNode?.type === 'generateNode'
            && conn.targetHandle === 'mask'
          )
          || (
            targetNode?.type === 'imageEditNode'
            && conn.targetHandle === 'base'
          )
          || (
            (targetNode?.type === 'llmNode' || targetNode?.type === 'llmFileNode')
            && isTextSource
          )
          || (
            targetNode?.type === 'textSplitterNode'
            && isTextSource
          )
          || (
            targetNode?.type === 'inlineTextSplitterNode'
            && isTextSource
          )
          || targetNode?.type === 'imageCropNode'
        )

      const nextEdges = addEdge(
        { ...conn, animated: true },
        shouldReplaceExistingTargetHandle
          ? s.edges.filter((edge) => {
            if (!(edge.target === conn.target && edge.targetHandle === conn.targetHandle)) {
              return true
            }

            if (
              targetNode?.type === 'compareNode'
              || targetNode?.type === 'imageCropNode'
              || (targetNode?.type === 'generateNode' && conn.targetHandle === 'mask')
              || (targetNode?.type === 'videoGenerateNode' && (conn.targetHandle === 'firstFrame' || conn.targetHandle === 'lastFrame'))
              || (targetNode?.type === 'imageEditNode' && conn.targetHandle === 'base')
            ) {
              return false
            }

            const existingSourceNode = getCanvasNodeById(s.nodes, edge.source)
            const isExistingTextSource = isTextSourceNode(existingSourceNode)
            return !isExistingTextSource
          })
          : s.edges,
      )

      return buildSyncedGraphState(s.nodes, nextEdges)
    }),

  addNodeByType: (type, preferredPosition) => {
    const id = takeNextNodeId(type)
    if (!id) {
      return ''
    }

    set((s) => {
      const registration = getManualNodeRegistration(type)
      const position = findManualSpawnPosition(s.nodes, preferredPosition, registration.size)
      const newNode = registration.build(id, position, registration.size)
      return { nodes: [...buildManualNodeSelection(s.nodes, id), newNode] }
    })

    return id
  },

  addImageNode: (preferredPosition) => get().addNodeByType('imageNode', preferredPosition),
  addVideoNode: (preferredPosition) => get().addNodeByType('videoNode', preferredPosition),
  addVideoGenerateNode: (preferredPosition) => get().addNodeByType('videoGenerateNode', preferredPosition),
  addImageCropNode: (preferredPosition) => get().addNodeByType('imageCropNode', preferredPosition),
  addTextNode: (preferredPosition) => get().addNodeByType('textNode', preferredPosition),

  addTextSplitterNode: (preferredPosition) => {
    return get().addInlineTextSplitterNode(preferredPosition)
  },

  addInlineTextSplitterNode: (preferredPosition) => get().addNodeByType('inlineTextSplitterNode', preferredPosition),
  addGenerateNode: (preferredPosition) => get().addNodeByType('generateNode', preferredPosition),
  addImageEditNode: (preferredPosition) => get().addNodeByType('imageEditNode', preferredPosition),
  addLLMNode: (preferredPosition) => get().addNodeByType('llmFileNode', preferredPosition),
  addLLMFileNode: (preferredPosition) => get().addNodeByType('llmFileNode', preferredPosition),
  addGeneratedPreviewNode: (preferredPosition) => get().addNodeByType('generatedPreviewNode', preferredPosition),
  addCompareNode: (preferredPosition) => get().addNodeByType('compareNode', preferredPosition),
  addTestImageNode: (preferredPosition) => get().addNodeByType('testImageNode', preferredPosition),
  addPanoramaNode: (preferredPosition) => get().addNodeByType('panoramaNode', preferredPosition),

  insertWorkflowTemplate: (template, preferredPosition) => {
    let insertedNodeIds: string[] = []
    set((s) => {
      const anchor = findManualSpawnPosition(s.nodes, preferredPosition, { width: 320, height: 220 })
      const instance = instantiateWorkflowTemplate(
        template,
        anchor,
        takeNextNodeId,
        () => `template-edge-${Date.now()}-${workflowTemplateEdgeCounter++}`,
      )
      if (!instance) return s
      insertedNodeIds = instance.nodeIds
      return buildSyncedGraphState(
        [
          ...s.nodes.map((node) => ({ ...node, selected: false })),
          ...instance.nodes,
        ],
        [
          ...s.edges.map((edge) => ({ ...edge, selected: false })),
          ...instance.edges,
        ],
      )
    })
    return insertedNodeIds
  },

  groupSelectedNodes: () => {
    let groupId: string | null = null

    set((s) => {
      const groupedState = buildGroupedSelectionState(s.nodes, s.edges, () => takeNextNodeId('groupNode'))
      if (!groupedState) {
        return s
      }

      groupId = groupedState.groupId
      return {
        nodes: groupedState.nodes,
        edges: groupedState.edges,
      }
    })

    return groupId
  },

  attachNodeToGroup: (nodeId, _groupId, absolutePosition) =>
    set((s) => {
      const targetNode = s.nodes.find((node) => node.id === nodeId)

      if (!targetNode || !targetNode.parentId) {
        return s
      }
      const nextAbsolutePosition = absolutePosition ?? getAbsoluteNodePosition(s.nodes, targetNode)

      return {
        nodes: s.nodes.map((node) => {
          if (node.id !== nodeId) {
            return node
          }

          return {
            ...node,
            parentId: undefined,
            extent: undefined,
            position: nextAbsolutePosition,
          }
        }),
      }
    }),

  detachNodeFromGroup: (nodeId, absolutePosition) =>
    set((s) => {
      const targetNode = s.nodes.find((node) => node.id === nodeId)

      if (!targetNode || !targetNode.parentId) {
        return s
      }

      const nextAbsolutePosition = absolutePosition ?? getAbsoluteNodePosition(s.nodes, targetNode)

      return {
        nodes: s.nodes.map((node) => {
          if (node.id !== nodeId) {
            return node
          }

          return {
            ...node,
            parentId: undefined,
            extent: undefined,
            position: nextAbsolutePosition,
          }
        }),
      }
    }),

  ungroupNode: (groupId) =>
    set((s) => {
      const ungroupedState = buildUngroupedSelectionState(s.nodes, s.edges, groupId)
      if (!ungroupedState) {
        return s
      }

      return ungroupedState
    }),

  deleteNode: (id) =>
    set((s) => buildNodeDeletedGraphState(s.nodes, s.edges, id)),

  deleteEdge: (id) =>
    set((s) => buildEdgeDeletedGraphState(s.nodes, s.edges, id)),

  deleteEdgesBySourceTarget: (sourceId, targetId) =>
    set((s) => buildEdgesDeletedBySourceTargetState(s.nodes, s.edges, sourceId, targetId)),

  deleteEdgesBySourceTargetHandle: (sourceId, targetId, targetHandle) =>
    set((s) => buildEdgesDeletedBySourceTargetHandleState(s.nodes, s.edges, sourceId, targetId, targetHandle)),

  deleteEdgesBySourceTargetExceptHandle: (sourceId, targetId, excludedTargetHandle) =>
    set((s) => buildEdgesDeletedBySourceTargetExceptHandleState(s.nodes, s.edges, sourceId, targetId, excludedTargetHandle)),

  selectNode: (id) =>
    set((s) => ({
      nodes: buildManualNodeSelection(s.nodes, id),
      edges: s.edges.map((edge) => ({ ...edge, selected: false })),
    })),

  deleteSelectedElements: () =>
    set((s) => {
      const deletedState = buildSelectedElementsDeletedGraphState(s.nodes, s.edges)
      if (!deletedState) {
        return s
      }

      return deletedState
    }),

  copySelectedNode: () => {
    let copiedNodeId: string | null = null

    set((s) => {
      const selectedNodes = s.nodes.filter((node) => node.selected)

      if (selectedNodes.length !== 1) {
        return s
      }

      const sourceNode = selectedNodes[0]
      if (!canDuplicateNode(sourceNode)) {
        return s
      }

      copiedNodeId = sourceNode.id

      return {
        copiedNode: {
          ...sourceNode,
          selected: false,
        },
      }
    })

    return copiedNodeId
  },

  duplicateSelectedNode: () => {
    let duplicatedNodeId: string | null = null

    set((s) => {
      const selectedNodes = s.nodes.filter((node) => node.selected)

      if (selectedNodes.length !== 1) {
        return s
      }

      const sourceNode = selectedNodes[0]
      if (!canDuplicateNode(sourceNode)) {
        return s
      }

      const duplicatedNode = cloneNodeForDuplicate(sourceNode, s.nodes, takeNextNodeId)
      if (!duplicatedNode) {
        return s
      }

      duplicatedNodeId = duplicatedNode.id

      return {
        copiedNode: duplicatedNode,
        nodes: [
          ...s.nodes.map((node) => ({
            ...node,
            selected: false,
          })),
          duplicatedNode,
        ],
        edges: s.edges.map((edge) => ({
          ...edge,
          selected: false,
        })),
      }
    })

    return duplicatedNodeId
  },

  pasteCopiedNode: () => {
    let pastedNodeId: string | null = null

    set((s) => {
      if (!s.copiedNode || !canDuplicateNode(s.copiedNode)) {
        return s
      }

      const duplicatedNode = cloneNodeForDuplicate(s.copiedNode, s.nodes, takeNextNodeId)
      if (!duplicatedNode) {
        return s
      }

      pastedNodeId = duplicatedNode.id

      return {
        nodes: [
          ...s.nodes.map((node) => ({
            ...node,
            selected: false,
          })),
          duplicatedNode,
        ],
        edges: s.edges.map((edge) => ({
          ...edge,
          selected: false,
        })),
      }
    })

    return pastedNodeId
  },

  updateNodeData: (id, patch) =>
    set((s) => buildNodeDataUpdatedState(s.nodes, s.edges, id, patch)),

  syncTextSplitterOutputs: (id) =>
    set((s) => {
      const splitterNode = s.nodes.find((node) => node.id === id && node.type === 'textSplitterNode')

      if (!splitterNode) {
        return s
      }

      const inputText = typeof splitterNode.data?.inputText === 'string' ? splitterNode.data.inputText : ''
      const rawSeparator = typeof splitterNode.data?.separator === 'string' ? splitterNode.data.separator : ''
      const separator = rawSeparator.replaceAll('\\n', '\n').replaceAll('\\t', '\t')
      const outputNodeIds = getOrderedStringIds(splitterNode.data?.outputNodeIds)

      const outputState = buildTextSplitterOutputState({
        nodes: s.nodes,
        edges: s.edges,
        splitterNodeId: id,
        inputText,
        separator,
        outputNodeIds,
        nextTextNodeId: () => takeNextNodeId('textNode'),
      })

      const nextNodes = layoutTextSplitterOutputNodesInContext(outputState.nodes, id)

      return buildSyncedGraphState(nextNodes, outputState.edges)
    }),

  syncInlineTextSplitterParts: (id) =>
    set((s) => {
      const splitterNode = s.nodes.find((node) => node.id === id && node.type === 'inlineTextSplitterNode')

      if (!splitterNode) {
        return s
      }

      const inputText = typeof splitterNode.data?.inputText === 'string' ? splitterNode.data.inputText : ''
      const rawSeparator = typeof splitterNode.data?.separator === 'string' ? splitterNode.data.separator : ''
      const separator = rawSeparator.replaceAll('\\n', '\n').replaceAll('\\t', '\t')
      const parts = (separator ? inputText.split(separator) : [inputText])
        .filter((part) => Boolean(part.trim()))

      if (!inputText.trim()) {
        return {
          nodes: syncConnectionDerivedNodeData(
            s.nodes.map((node) => (
              node.id === id
                ? { ...node, data: { ...node.data, errorMsg: '请先连接或输入需要分割的文本。' } }
                : node
            )),
            s.edges,
          ),
        }
      }

      if (parts.length === 0) {
        return {
          nodes: syncConnectionDerivedNodeData(
            s.nodes.map((node) => (
              node.id === id
                ? { ...node, data: { ...node.data, errorMsg: '没有得到可输出的文本片段。' } }
                : node
            )),
            s.edges,
          ),
        }
      }

      return {
        nodes: syncConnectionDerivedNodeData(
          s.nodes.map((node) => (
            node.id === id
              ? {
                ...node,
                height: Math.max(DEFAULT_INLINE_TEXT_SPLITTER_NODE_HEIGHT, 160 + parts.length * 52),
                data: {
                  ...node.data,
                  parts,
                  lastRunAt: Date.now(),
                  errorMsg: '',
                },
              }
              : node
          )),
          s.edges,
        ),
      }
    }),

  createGeneratedPreviewNode: (sourceGenerateNodeId, preview) => {
    let previewId = ''
    set((s) => {
      const sourceNode = s.nodes.find((node) => node.id === sourceGenerateNodeId)
      if (getCanvasNodeRegistration(sourceNode?.type)?.outputLayout !== 'generated-preview') {
        return s
      }
      const nextPreviewId = takeNextNodeId('generatedPreviewNode')
      if (!nextPreviewId) {
        return s
      }

      previewId = nextPreviewId
      const generatedPreview = buildGeneratedPreviewNode(
        previewId,
        sourceGenerateNodeId,
        preview,
        {
          width: DEFAULT_PREVIEW_NODE_WIDTH,
          height: DEFAULT_PREVIEW_NODE_HEIGHT,
        },
      )

      const nextNodes = layoutGeneratedPreviewNodesInContext([...s.nodes, generatedPreview], sourceGenerateNodeId)

      return {
        nodes: nextNodes,
        edges: [
          ...s.edges,
          {
            id: `edge-${sourceGenerateNodeId}-${previewId}`,
            source: sourceGenerateNodeId,
            target: previewId,
            animated: true,
          },
        ],
      }
    })
    return previewId
  },

  createGeneratedVideoNode: (sourceVideoGenerateNodeId, video) => {
    let videoId = ''

    set((s) => {
      const sourceNode = s.nodes.find((node) => node.id === sourceVideoGenerateNodeId)

      if (!sourceNode || getCanvasNodeRegistration(sourceNode.type)?.outputLayout !== 'generated-video') {
        return s
      }

      const nextVideoId = takeNextNodeId('videoNode')
      if (!nextVideoId) {
        return s
      }

      videoId = nextVideoId
      const sourceWidth = typeof sourceNode.width === 'number' ? sourceNode.width : DEFAULT_VIDEO_GENERATE_NODE_WIDTH
      const sourceHeight = typeof sourceNode.height === 'number' ? sourceNode.height : DEFAULT_VIDEO_GENERATE_NODE_HEIGHT
      const position = {
        x: sourceNode.position.x + sourceWidth + PREVIEW_LAYOUT_OFFSET_X,
        y: sourceNode.position.y + Math.max((sourceHeight - DEFAULT_VIDEO_NODE_HEIGHT) / 2, 0),
      }
      const generatedVideo = buildGeneratedVideoNode(
        videoId,
        position,
        {
        width: DEFAULT_VIDEO_NODE_WIDTH,
        height: DEFAULT_VIDEO_NODE_HEIGHT,
        },
        video,
      )
      const edgeId = `edge-${sourceVideoGenerateNodeId}-${videoId}`

      return {
        nodes: [...s.nodes, generatedVideo],
        edges: s.edges.some((edge) => edge.id === edgeId)
          ? s.edges
          : [
            ...s.edges,
            {
              id: edgeId,
              source: sourceVideoGenerateNodeId,
              sourceHandle: 'video',
              target: videoId,
              targetHandle: 'input',
              animated: true,
            },
          ],
      }
    })

    return videoId
  },

  createLLMOutputTextNode: (sourceLLMNodeId, outputNode) => {
    let outputNodeId = ''

    set((s) => {
      const sourceNode = s.nodes.find((node) => node.id === sourceLLMNodeId)
      if (!sourceNode || getCanvasNodeRegistration(sourceNode.type)?.outputLayout !== 'llm-output') {
        return s
      }

      const nextOutputNodeId = takeNextNodeId('llmOutputTextNode')
      if (!nextOutputNodeId) {
        return s
      }

      outputNodeId = nextOutputNodeId
      const llmOutputNode = buildLLMOutputTextNode(
        outputNodeId,
        sourceLLMNodeId,
        outputNode,
        {
        width: DEFAULT_LLM_OUTPUT_TEXT_NODE_WIDTH,
        height: DEFAULT_LLM_OUTPUT_TEXT_NODE_HEIGHT,
        },
      )

      const nextNodes = layoutLLMOutputTextNodesInContext(
        [
          ...s.nodes.map((node) => (
            node.id === sourceLLMNodeId
              ? {
                ...node,
                data: {
                  ...node.data,
                  outputNodeId,
                },
              }
              : node
          )),
          llmOutputNode,
        ],
        sourceLLMNodeId,
      )
      const hasExistingEdge = s.edges.some((edge) => edge.source === sourceLLMNodeId && edge.target === outputNodeId)

      return {
        nodes: nextNodes,
        edges: hasExistingEdge
          ? s.edges
          : [
            ...s.edges,
            {
              id: `edge-${sourceLLMNodeId}-${outputNodeId}`,
              source: sourceLLMNodeId,
              target: outputNodeId,
              animated: true,
            },
          ],
      }
    })

    return outputNodeId
  },

  runImageCropNode: async (id) => {
    const cropNode = get().nodes.find((node) => node.id === id && node.type === 'imageCropNode')
    if (!cropNode) {
      return
    }

    const sourceImageNodeId = typeof cropNode.data?.sourceImageNodeId === 'string' ? cropNode.data.sourceImageNodeId : null
    if (!sourceImageNodeId) {
      set((s) => ({
        nodes: s.nodes.map((node) => (
          node.id === id && node.type === 'imageCropNode'
            ? {
              ...node,
              data: {
                ...node.data,
                status: 'error',
                errorMsg: '请先连接一张图片。',
              },
            }
            : node
        )),
      }))
      return
    }

    const sourceNode = get().nodes.find((node) => node.id === sourceImageNodeId)
    const sourceImageUrl = typeof sourceNode?.data?.imageUrl === 'string' ? sourceNode.data.imageUrl : ''

    if (!sourceImageUrl) {
      set((s) => ({
        nodes: s.nodes.map((node) => (
          node.id === id && node.type === 'imageCropNode'
            ? {
              ...node,
              data: {
                ...node.data,
                status: 'error',
                errorMsg: '输入图片还没有可用内容。',
              },
            }
            : node
        )),
      }))
      return
    }

    set((s) => ({
      nodes: s.nodes.map((node) => (
        node.id === id && node.type === 'imageCropNode'
          ? {
            ...node,
            data: {
              ...node.data,
              status: 'running',
              errorMsg: '',
            },
          }
          : node
      )),
    }))

    try {
      const rowCount = clampCropSegmentCount(typeof cropNode.data?.rowCount === 'number' ? cropNode.data.rowCount : DEFAULT_IMAGE_CROP_ROWS, DEFAULT_IMAGE_CROP_ROWS)
      const columnCount = clampCropSegmentCount(typeof cropNode.data?.columnCount === 'number' ? cropNode.data.columnCount : DEFAULT_IMAGE_CROP_COLUMNS, DEFAULT_IMAGE_CROP_COLUMNS)
      const horizontalCuts = normalizeCropCuts(cropNode.data?.horizontalCuts, rowCount)
      const verticalCuts = normalizeCropCuts(cropNode.data?.verticalCuts, columnCount)
      const previewResults = await cropImageIntoTiles({
        cropNodeId: id,
        imageUrl: sourceImageUrl,
        rowCount,
        columnCount,
        horizontalCuts,
        verticalCuts,
      })

      set((s) => {
        const latestCropNode = s.nodes.find((node) => node.id === id && node.type === 'imageCropNode')
        if (!latestCropNode) {
          return s
        }

        const outputState = buildImageCropOutputState({
          nodes: s.nodes,
          edges: s.edges,
          cropNodeId: id,
          existingPreviewIds: getOrderedStringIds(latestCropNode.data?.outputPreviewNodeIds),
          previewResults,
          rowCount,
          columnCount,
          horizontalCuts,
          verticalCuts,
          nextPreviewId: () => takeNextNodeId('generatedPreviewNode'),
        })
        const nextNodes = layoutGeneratedPreviewNodesInContext(outputState.nodes, id)

        return buildSyncedGraphState(nextNodes, outputState.edges)
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '图片裁切失败，请稍后重试'
      set((s) => ({
        nodes: s.nodes.map((node) => (
          node.id === id && node.type === 'imageCropNode'
            ? {
              ...node,
              data: {
                ...node.data,
                status: 'error',
                errorMsg: errorMessage,
              },
            }
            : node
        )),
      }))
    }
  },

  setNodePosition: (id, position) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
    })),

  setNodePositions: (positions) =>
    set((s) => {
      if (positions.length === 0) {
        return {}
      }

      const changes: NodeChange[] = positions.map(({ id, position }) => ({
        id,
        type: 'position',
        position,
        dragging: false,
      }))
      const nextNodes = applyVisualNodeChanges(s.nodes, changes)

      return {
        nodes: applySettledPositionSideEffects(nextNodes, changes),
      }
    }),

  updateNode: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, ...patch } : n
      ),
    })),

  arrangeSelectedNodes: (direction) =>
    set((s) => {
      const { normalizedNodes, targets, layoutEdges, memberIdsByGroupId } = buildGroupAwareLayoutTargets(
        s.nodes,
        s.edges,
        (node) => node.selected === true,
      )
      if (targets.length < 2) return {}
      const positions = computeAutoLayout(targets, layoutEdges, direction)
      return {
        nodes: applyGroupAwareLayoutPositions(s.nodes, normalizedNodes, memberIdsByGroupId, positions),
      }
    }),

  arrangeAllNodes: (direction) =>
    set((s) => {
      const { normalizedNodes, targets, layoutEdges, memberIdsByGroupId } = buildGroupAwareLayoutTargets(
        s.nodes,
        s.edges,
        () => true,
      )
      if (targets.length < 2) return {}
      const positions = computeAutoLayout(targets, layoutEdges, direction)
      return {
        nodes: applyGroupAwareLayoutPositions(s.nodes, normalizedNodes, memberIdsByGroupId, positions),
      }
    }),

  arrangeConnectedGraphFromSelection: () => {
    let arranged = false

    set((s) => {
      const selectedNodes = s.nodes.filter((node) => node.selected)
      if (selectedNodes.length !== 1) {
        return {}
      }

      const selectedNode = selectedNodes[0]
      if (selectedNode.type === 'groupNode') {
        return {}
      }

      const topLevelNodes = s.nodes.filter((node) => node.type !== 'groupNode')
      const connectedNodeIds = buildConnectedComponentNodeIds(topLevelNodes, s.edges, selectedNode.id)
      if (connectedNodeIds.size < 2) {
        return {}
      }

      const targets = topLevelNodes.filter((node) => connectedNodeIds.has(node.id))
      const positions = computeFocusedAutoLayout(targets, s.edges, selectedNode.id)
      if (positions.size < 2) {
        return {}
      }

      arranged = true
      return {
        nodes: s.nodes.map((node) => {
          const position = positions.get(node.id)
          return position ? { ...node, position } : node
        }),
      }
    })

    return arranged
  },

  updateGenerateNodeData: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id && n.type === 'generateNode'
          ? { ...n, data: { ...n.data, ...patch } }
          : n
      ),
    })),
}))
