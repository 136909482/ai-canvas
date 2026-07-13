import type { Edge, Node } from '@xyflow/react'
import {
  buildGroupNode,
} from './canvasNodeCreation'
import {
  DEFAULT_GROUP_NODE_HEIGHT,
  DEFAULT_GROUP_NODE_WIDTH,
  GROUP_HEADER_HEIGHT,
  GROUP_PADDING_X,
  GROUP_PADDING_Y,
  getAbsoluteNodePosition,
  getNodeSize,
  getVisualGroupMemberIds,
  normalizeVisualGroupNodes,
} from './canvasLayoutGeometry'

export function buildManualNodeSelection(nodes: Node[], nodeId: string) {
  return nodes.map((node) => ({
    ...node,
    selected: node.id === nodeId,
  }))
}

export function buildGroupedSelectionState(
  nodes: Node[],
  edges: Edge[],
  nextGroupNodeId: () => string | null,
) {
  const normalizedNodes = normalizeVisualGroupNodes(nodes)
  const selectedNodes = normalizedNodes.filter((node) => node.selected && node.type !== 'groupNode')

  if (selectedNodes.length < 2) {
    return null
  }

  const bounds = selectedNodes.reduce((accumulator, node) => {
    const position = getAbsoluteNodePosition(normalizedNodes, node)
    const { width, height } = getNodeSize(node)
    return {
      minX: Math.min(accumulator.minX, position.x),
      minY: Math.min(accumulator.minY, position.y),
      maxX: Math.max(accumulator.maxX, position.x + width),
      maxY: Math.max(accumulator.maxY, position.y + height),
    }
  }, {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  })
  const groupId = nextGroupNodeId()
  if (!groupId) {
    return null
  }

  const groupPosition = {
    x: bounds.minX - GROUP_PADDING_X,
    y: bounds.minY - GROUP_PADDING_Y - GROUP_HEADER_HEIGHT,
  }
  const groupNode = buildGroupNode(
    groupId,
    groupPosition,
    {
      width: Math.max(DEFAULT_GROUP_NODE_WIDTH, bounds.maxX - bounds.minX + GROUP_PADDING_X * 2),
      height: Math.max(
        DEFAULT_GROUP_NODE_HEIGHT,
        bounds.maxY - bounds.minY + GROUP_PADDING_Y * 2 + GROUP_HEADER_HEIGHT,
      ),
    },
  )
  const nextNodes = normalizedNodes.map((node) => ({
    ...node,
    selected: false,
  }))

  return {
    groupId,
    nodes: [groupNode, ...nextNodes],
    edges: edges.map((edge) => ({ ...edge, selected: false })),
  }
}

export function buildUngroupedSelectionState(
  nodes: Node[],
  edges: Edge[],
  groupId: string,
) {
  const normalizedNodes = normalizeVisualGroupNodes(nodes)
  const groupNode = normalizedNodes.find((node) => node.id === groupId && node.type === 'groupNode')

  if (!groupNode) {
    return null
  }

  const memberIds = getVisualGroupMemberIds(normalizedNodes, groupNode)

  return {
    nodes: normalizedNodes
      .filter((node) => node.id !== groupId)
      .map((node) => ({
        ...node,
        selected: memberIds.has(node.id),
      })),
    edges: edges.map((edge) => ({ ...edge, selected: false })),
  }
}
