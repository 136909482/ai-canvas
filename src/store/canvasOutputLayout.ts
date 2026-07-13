import type { Node, NodeChange } from '@xyflow/react'
import type { GeneratedPreviewNodeData, LLMOutputTextNodeData, TextNodeData } from '@/types'
import { DEFAULT_IMAGE_CROP_COLUMNS, clampCropSegmentCount } from '@/features/imageCrop/runtime'
import { getOrderedStringIds } from './canvasNodeData'
import {
  DEFAULT_GENERATE_NODE_HEIGHT,
  DEFAULT_GENERATE_NODE_WIDTH,
  DEFAULT_IMAGE_CROP_NODE_HEIGHT,
  DEFAULT_IMAGE_CROP_NODE_WIDTH,
  DEFAULT_IMAGE_EDIT_NODE_HEIGHT,
  DEFAULT_IMAGE_EDIT_NODE_WIDTH,
  DEFAULT_LLM_NODE_HEIGHT,
  DEFAULT_LLM_NODE_WIDTH,
  DEFAULT_LLM_OUTPUT_TEXT_NODE_HEIGHT,
  DEFAULT_LLM_OUTPUT_TEXT_NODE_WIDTH,
  DEFAULT_PREVIEW_NODE_HEIGHT,
  DEFAULT_PREVIEW_NODE_WIDTH,
  DEFAULT_TEXT_SPLITTER_NODE_HEIGHT,
  DEFAULT_TEXT_SPLITTER_NODE_WIDTH,
  expandGroupToFitDescendants,
} from './canvasLayoutGeometry'

export const PREVIEW_LAYOUT_OFFSET_X = 96

const PREVIEW_LAYOUT_GAP_X = 28

function layoutGeneratedPreviewNodes(
  nodes: Node[],
  sourceGenerateNodeId: string,
) {
  const sourceNode = nodes.find((node) => node.id === sourceGenerateNodeId)

  if (!sourceNode) {
    return nodes
  }

  const relatedPreviewNodes = nodes
    .filter(
      (node): node is Node<GeneratedPreviewNodeData> =>
        node.type === 'generatedPreviewNode' && node.data?.sourceGenerateNodeId === sourceGenerateNodeId,
    )
    .sort((left, right) => {
      const leftCreatedAt = typeof left.data?.createdAt === 'number' ? left.data.createdAt : 0
      const rightCreatedAt = typeof right.data?.createdAt === 'number' ? right.data.createdAt : 0
      return leftCreatedAt - rightCreatedAt
    })

  if (relatedPreviewNodes.length === 0) {
    return nodes
  }

  const autoPreviewNodes = relatedPreviewNodes.filter((node) => node.data?.layoutMode !== 'manual')
  const manualPreviewNodes = relatedPreviewNodes.filter((node) => node.data?.layoutMode === 'manual')

  if (autoPreviewNodes.length === 0) {
    return nodes
  }

  const sourceX = sourceNode.position.x ?? 0
  const sourceY = sourceNode.position.y ?? 0
  const sourceWidth = typeof sourceNode.width === 'number'
    ? sourceNode.width
    : sourceNode.type === 'imageCropNode'
      ? DEFAULT_IMAGE_CROP_NODE_WIDTH
      : sourceNode.type === 'imageEditNode'
        ? DEFAULT_IMAGE_EDIT_NODE_WIDTH
        : DEFAULT_GENERATE_NODE_WIDTH
  const sourceHeight = typeof sourceNode.height === 'number'
    ? sourceNode.height
    : sourceNode.type === 'imageCropNode'
      ? DEFAULT_IMAGE_CROP_NODE_HEIGHT
      : sourceNode.type === 'imageEditNode'
        ? DEFAULT_IMAGE_EDIT_NODE_HEIGHT
        : DEFAULT_GENERATE_NODE_HEIGHT
  const slotWidth = Math.max(
    DEFAULT_PREVIEW_NODE_WIDTH,
    ...relatedPreviewNodes.map((node) => (typeof node.width === 'number' ? node.width : DEFAULT_PREVIEW_NODE_WIDTH)),
  )
  const slotHeight = Math.max(
    DEFAULT_PREVIEW_NODE_HEIGHT,
    ...relatedPreviewNodes.map((node) => (typeof node.height === 'number' ? node.height : DEFAULT_PREVIEW_NODE_HEIGHT)),
  )
  const baseStartX = sourceX + sourceWidth + PREVIEW_LAYOUT_OFFSET_X
  const manualRightEdge = manualPreviewNodes.reduce((maxRight, node) => {
    const nodeWidth = typeof node.width === 'number' ? node.width : DEFAULT_PREVIEW_NODE_WIDTH
    return Math.max(maxRight, node.position.x + nodeWidth)
  }, baseStartX - PREVIEW_LAYOUT_GAP_X)
  const startX = Math.max(baseStartX, manualRightEdge + PREVIEW_LAYOUT_GAP_X)

  const cropColumns = sourceNode.type === 'imageCropNode'
    ? clampCropSegmentCount(typeof sourceNode.data?.columnCount === 'number' ? sourceNode.data.columnCount : DEFAULT_IMAGE_CROP_COLUMNS, DEFAULT_IMAGE_CROP_COLUMNS)
    : autoPreviewNodes.length
  const cropRows = sourceNode.type === 'imageCropNode'
    ? Math.max(1, Math.ceil(autoPreviewNodes.length / cropColumns))
    : 1
  const totalGridHeight = cropRows * slotHeight + Math.max(0, cropRows - 1) * PREVIEW_LAYOUT_GAP_X
  const startY = sourceY + Math.max((sourceHeight - totalGridHeight) / 2, 0)

  const nextPositionById = new Map(
    autoPreviewNodes.map((previewNode, index) => {
      const columnIndex = sourceNode.type === 'imageCropNode' ? index % cropColumns : index
      const rowIndex = sourceNode.type === 'imageCropNode' ? Math.floor(index / cropColumns) : 0

      return [
        previewNode.id,
        {
          x: startX + columnIndex * (slotWidth + PREVIEW_LAYOUT_GAP_X),
          y: startY + rowIndex * (slotHeight + PREVIEW_LAYOUT_GAP_X),
        },
      ]
    }),
  )

  return nodes.map((node) => {
    const nextPosition = nextPositionById.get(node.id)

    if (!nextPosition) {
      return node
    }

    return {
      ...node,
      position: nextPosition,
    }
  })
}

export function layoutGeneratedPreviewNodesInContext(nodes: Node[], sourceGenerateNodeId: string) {
  const laidOutNodes = layoutGeneratedPreviewNodes(nodes, sourceGenerateNodeId)
  const sourceNode = laidOutNodes.find((node) => node.id === sourceGenerateNodeId)
  const sourceGroupId = sourceNode?.parentId

  if (!sourceGroupId) {
    return laidOutNodes
  }

  return expandGroupToFitDescendants(laidOutNodes, sourceGroupId)
}

function layoutLLMOutputTextNodes(nodes: Node[], sourceLLMNodeId: string) {
  const sourceNode = nodes.find((node) => node.id === sourceLLMNodeId)

  if (!sourceNode) {
    return nodes
  }

  const relatedOutputNodes = nodes
    .filter(
      (node): node is Node<LLMOutputTextNodeData> =>
        node.type === 'llmOutputTextNode' && node.data?.sourceLLMNodeId === sourceLLMNodeId,
    )
    .sort((left, right) => {
      const leftCreatedAt = typeof left.data?.createdAt === 'number' ? left.data.createdAt : 0
      const rightCreatedAt = typeof right.data?.createdAt === 'number' ? right.data.createdAt : 0
      return leftCreatedAt - rightCreatedAt
    })

  if (relatedOutputNodes.length === 0) {
    return nodes
  }

  const autoOutputNodes = relatedOutputNodes.filter((node) => node.data?.layoutMode !== 'manual')
  const manualOutputNodes = relatedOutputNodes.filter((node) => node.data?.layoutMode === 'manual')

  if (autoOutputNodes.length === 0) {
    return nodes
  }

  const sourceX = sourceNode.position.x ?? 0
  const sourceY = sourceNode.position.y ?? 0
  const sourceWidth = typeof sourceNode.width === 'number' ? sourceNode.width : DEFAULT_LLM_NODE_WIDTH
  const sourceHeight = typeof sourceNode.height === 'number' ? sourceNode.height : DEFAULT_LLM_NODE_HEIGHT
  const slotWidth = Math.max(
    DEFAULT_LLM_OUTPUT_TEXT_NODE_WIDTH,
    ...relatedOutputNodes.map((node) => (typeof node.width === 'number' ? node.width : DEFAULT_LLM_OUTPUT_TEXT_NODE_WIDTH)),
  )
  const slotHeight = Math.max(
    DEFAULT_LLM_OUTPUT_TEXT_NODE_HEIGHT,
    ...relatedOutputNodes.map((node) => (typeof node.height === 'number' ? node.height : DEFAULT_LLM_OUTPUT_TEXT_NODE_HEIGHT)),
  )
  const baseStartX = sourceX + sourceWidth + PREVIEW_LAYOUT_OFFSET_X
  const startY = sourceY + Math.max((sourceHeight - slotHeight) / 2, 0)
  const manualRightEdge = manualOutputNodes.reduce((maxRight, node) => {
    const nodeWidth = typeof node.width === 'number' ? node.width : DEFAULT_LLM_OUTPUT_TEXT_NODE_WIDTH
    return Math.max(maxRight, node.position.x + nodeWidth)
  }, baseStartX - PREVIEW_LAYOUT_GAP_X)
  const startX = Math.max(baseStartX, manualRightEdge + PREVIEW_LAYOUT_GAP_X)

  const nextPositionById = new Map(
    autoOutputNodes.map((outputNode, index) => [
      outputNode.id,
      {
        x: startX + index * (slotWidth + PREVIEW_LAYOUT_GAP_X),
        y: startY,
      },
    ]),
  )

  return nodes.map((node) => {
    const nextPosition = nextPositionById.get(node.id)

    if (!nextPosition) {
      return node
    }

    return {
      ...node,
      position: nextPosition,
    }
  })
}

export function layoutLLMOutputTextNodesInContext(nodes: Node[], sourceLLMNodeId: string) {
  const laidOutNodes = layoutLLMOutputTextNodes(nodes, sourceLLMNodeId)
  const sourceNode = laidOutNodes.find((node) => node.id === sourceLLMNodeId)
  const sourceGroupId = sourceNode?.parentId

  if (!sourceGroupId) {
    return laidOutNodes
  }

  return expandGroupToFitDescendants(laidOutNodes, sourceGroupId)
}

export function layoutTextSplitterOutputNodesInContext(nodes: Node[], sourceSplitterNodeId: string) {
  const sourceNode = nodes.find((node) => node.id === sourceSplitterNodeId)

  if (!sourceNode) {
    return nodes
  }

  const outputNodeIds = getOrderedStringIds(sourceNode.data?.outputNodeIds)
  const outputNodes = outputNodeIds
    .map((outputNodeId) => nodes.find((node) => node.id === outputNodeId && node.type === 'textNode'))
    .filter((node): node is Node<TextNodeData> => Boolean(node))

  if (outputNodes.length === 0) {
    return nodes
  }

  const sourceWidth = typeof sourceNode.width === 'number' ? sourceNode.width : DEFAULT_TEXT_SPLITTER_NODE_WIDTH
  const sourceHeight = typeof sourceNode.height === 'number' ? sourceNode.height : DEFAULT_TEXT_SPLITTER_NODE_HEIGHT
  const slotHeight = Math.max(140, ...outputNodes.map((node) => (typeof node.height === 'number' ? node.height : 140)))
  const totalHeight = outputNodes.length * slotHeight + Math.max(0, outputNodes.length - 1) * 20
  const startX = sourceNode.position.x + sourceWidth + 72
  const startY = sourceNode.position.y + Math.min(0, (sourceHeight - totalHeight) / 2)
  const nextPositionById = new Map(
    outputNodes.map((outputNode, index) => [
      outputNode.id,
      {
        x: startX,
        y: startY + index * (slotHeight + 20),
      },
    ]),
  )
  const laidOutNodes = nodes.map((node) => {
    const nextPosition = nextPositionById.get(node.id)
    return nextPosition ? { ...node, position: nextPosition } : node
  })
  const sourceGroupId = sourceNode.parentId

  if (!sourceGroupId) {
    return laidOutNodes
  }

  return expandGroupToFitDescendants(laidOutNodes, sourceGroupId)
}

export function applyDragStopSideEffects(
  nodes: Node[],
  changes: NodeChange[],
): Node[] {
  const completedDraggedNodeIds = changes
    .filter((change): change is NodeChange & { type: 'position'; id: string; dragging?: boolean } => (
      'id' in change && change.type === 'position' && change.dragging === false
    ))
    .map((change) => change.id)

  if (completedDraggedNodeIds.length === 0) {
    return nodes
  }

  const nextNodes = nodes
  const affectedGenerateNodeIds = new Set<string>()
  const affectedLLMNodeIds = new Set<string>()

  for (const nodeId of completedDraggedNodeIds) {
    const draggedNode = nextNodes.find((node) => node.id === nodeId)

    if (!draggedNode || draggedNode.type === 'groupNode') {
      continue
    }

    if (draggedNode.type === 'generateNode' || draggedNode.type === 'imageEditNode') {
      affectedGenerateNodeIds.add(draggedNode.id)
    }

    if (draggedNode.type === 'llmNode' || draggedNode.type === 'llmFileNode') {
      affectedLLMNodeIds.add(draggedNode.id)
    }

    if (draggedNode.type === 'generatedPreviewNode') {
      const sourceGenerateNodeId = typeof draggedNode.data?.sourceGenerateNodeId === 'string'
        ? draggedNode.data.sourceGenerateNodeId
        : null
      if (sourceGenerateNodeId) {
        affectedGenerateNodeIds.add(sourceGenerateNodeId)
      }
    }

    if (draggedNode.type === 'llmOutputTextNode') {
      const sourceLLMNodeId = typeof draggedNode.data?.sourceLLMNodeId === 'string'
        ? draggedNode.data.sourceLLMNodeId
        : null
      if (sourceLLMNodeId) {
        affectedLLMNodeIds.add(sourceLLMNodeId)
      }
    }
  }

  let laidOutNodes = nextNodes
  for (const generateNodeId of affectedGenerateNodeIds) {
    laidOutNodes = layoutGeneratedPreviewNodesInContext(laidOutNodes, generateNodeId)
  }
  for (const llmNodeId of affectedLLMNodeIds) {
    laidOutNodes = layoutLLMOutputTextNodesInContext(laidOutNodes, llmNodeId)
  }

  return laidOutNodes
}
