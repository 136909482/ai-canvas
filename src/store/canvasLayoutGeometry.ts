import type { Edge, Node, NodeChange } from '@xyflow/react'

export const DEFAULT_IMAGE_NODE_WIDTH = 340
export const DEFAULT_IMAGE_NODE_HEIGHT = 340
export const DEFAULT_VIDEO_NODE_WIDTH = 360
export const DEFAULT_VIDEO_NODE_HEIGHT = 240
export const DEFAULT_VIDEO_GENERATE_NODE_WIDTH = 560
export const DEFAULT_VIDEO_GENERATE_NODE_HEIGHT = 360
export const DEFAULT_IMAGE_CROP_NODE_WIDTH = 420
export const DEFAULT_IMAGE_CROP_NODE_HEIGHT = 420
export const DEFAULT_GENERATE_NODE_WIDTH = 480
export const DEFAULT_GENERATE_NODE_HEIGHT = 360
export const DEFAULT_IMAGE_EDIT_NODE_WIDTH = 520
export const DEFAULT_IMAGE_EDIT_NODE_HEIGHT = 430
export const DEFAULT_PREVIEW_NODE_WIDTH = 300
export const DEFAULT_PREVIEW_NODE_HEIGHT = 260
export const DEFAULT_COMPARE_NODE_WIDTH = 420
export const DEFAULT_COMPARE_NODE_HEIGHT = 320
export const DEFAULT_LLM_NODE_WIDTH = DEFAULT_GENERATE_NODE_WIDTH
export const DEFAULT_LLM_NODE_HEIGHT = 340
export const DEFAULT_LLM_OUTPUT_TEXT_NODE_WIDTH = 320
export const DEFAULT_LLM_OUTPUT_TEXT_NODE_HEIGHT = 240
export const DEFAULT_TEXT_SPLITTER_NODE_WIDTH = 360
export const DEFAULT_TEXT_SPLITTER_NODE_HEIGHT = 240
export const DEFAULT_INLINE_TEXT_SPLITTER_NODE_WIDTH = 420
export const DEFAULT_INLINE_TEXT_SPLITTER_NODE_HEIGHT = 420
export const DEFAULT_TEXT_NODE_WIDTH = 240
export const DEFAULT_TEXT_NODE_HEIGHT = 190
export const DEFAULT_GROUP_NODE_WIDTH = 520
export const DEFAULT_GROUP_NODE_HEIGHT = 420
export const DEFAULT_PANORAMA_NODE_WIDTH = 480
export const DEFAULT_PANORAMA_NODE_HEIGHT = 300
export const GROUP_PADDING_X = 24
export const GROUP_PADDING_Y = 24
export const GROUP_HEADER_HEIGHT = 0

const MANUAL_NODE_SPAWN_SAFE_OFFSET_X = 56
const MANUAL_NODE_SPAWN_GAP = 32
const MANUAL_NODE_SPAWN_SEARCH_COLUMNS = 6
const MANUAL_NODE_SPAWN_SEARCH_ROWS = 6

const activeGroupDragMemberIdsByGroupId = new Map<string, Set<string>>()

export function getNodeSize(node: Node) {
  const width = typeof node.width === 'number'
    ? node.width
    : node.type === 'imageNode'
      ? DEFAULT_IMAGE_NODE_WIDTH
      : node.type === 'videoNode'
        ? DEFAULT_VIDEO_NODE_WIDTH
        : node.type === 'videoGenerateNode'
          ? DEFAULT_VIDEO_GENERATE_NODE_WIDTH
      : node.type === 'imageCropNode'
      ? DEFAULT_IMAGE_CROP_NODE_WIDTH
      : node.type === 'textNode'
        ? 240
        : node.type === 'textSplitterNode'
          ? DEFAULT_TEXT_SPLITTER_NODE_WIDTH
          : node.type === 'inlineTextSplitterNode'
            ? DEFAULT_INLINE_TEXT_SPLITTER_NODE_WIDTH
            : node.type === 'generateNode'
              ? DEFAULT_GENERATE_NODE_WIDTH
              : node.type === 'imageEditNode'
                ? DEFAULT_IMAGE_EDIT_NODE_WIDTH
              : node.type === 'llmNode' || node.type === 'llmFileNode'
                ? DEFAULT_LLM_NODE_WIDTH
                : node.type === 'llmOutputTextNode'
                  ? DEFAULT_LLM_OUTPUT_TEXT_NODE_WIDTH
                  : node.type === 'generatedPreviewNode'
                    ? DEFAULT_PREVIEW_NODE_WIDTH
                    : node.type === 'compareNode'
                      ? DEFAULT_COMPARE_NODE_WIDTH
                      : node.type === 'groupNode'
                        ? DEFAULT_GROUP_NODE_WIDTH
                        : node.type === 'testImageNode'
                          ? DEFAULT_IMAGE_NODE_WIDTH
                          : node.type === 'panoramaNode'
                            ? DEFAULT_PANORAMA_NODE_WIDTH
                            : 240
  const height = typeof node.height === 'number'
    ? node.height
    : node.type === 'imageNode'
      ? DEFAULT_IMAGE_NODE_HEIGHT
      : node.type === 'videoNode'
        ? DEFAULT_VIDEO_NODE_HEIGHT
        : node.type === 'videoGenerateNode'
          ? DEFAULT_VIDEO_GENERATE_NODE_HEIGHT
      : node.type === 'imageCropNode'
      ? DEFAULT_IMAGE_CROP_NODE_HEIGHT
      : node.type === 'textNode'
        ? 160
        : node.type === 'textSplitterNode'
          ? DEFAULT_TEXT_SPLITTER_NODE_HEIGHT
          : node.type === 'inlineTextSplitterNode'
            ? DEFAULT_INLINE_TEXT_SPLITTER_NODE_HEIGHT
            : node.type === 'generateNode'
              ? DEFAULT_GENERATE_NODE_HEIGHT
              : node.type === 'imageEditNode'
                ? DEFAULT_IMAGE_EDIT_NODE_HEIGHT
              : node.type === 'llmNode' || node.type === 'llmFileNode'
                ? DEFAULT_LLM_NODE_HEIGHT
                : node.type === 'llmOutputTextNode'
                  ? DEFAULT_LLM_OUTPUT_TEXT_NODE_HEIGHT
                  : node.type === 'generatedPreviewNode'
                    ? DEFAULT_PREVIEW_NODE_HEIGHT
                    : node.type === 'compareNode'
                      ? DEFAULT_COMPARE_NODE_HEIGHT
                      : node.type === 'groupNode'
                        ? DEFAULT_GROUP_NODE_HEIGHT
                        : node.type === 'testImageNode'
                          ? DEFAULT_IMAGE_NODE_HEIGHT
                          : node.type === 'panoramaNode'
                            ? DEFAULT_PANORAMA_NODE_HEIGHT
                            : 180

  return { width, height }
}

export function getAbsoluteNodePosition(nodes: Node[], nodeOrId: Node | string) {
  const node = typeof nodeOrId === 'string'
    ? nodes.find((candidate) => candidate.id === nodeOrId)
    : nodeOrId

  if (!node) {
    return { x: 0, y: 0 }
  }

  let absoluteX = node.position.x
  let absoluteY = node.position.y
  let currentParentId = typeof node.parentId === 'string' ? node.parentId : null

  while (currentParentId) {
    const parentNode = nodes.find((candidate) => candidate.id === currentParentId)

    if (!parentNode) {
      break
    }

    absoluteX += parentNode.position.x
    absoluteY += parentNode.position.y
    currentParentId = typeof parentNode.parentId === 'string' ? parentNode.parentId : null
  }

  return { x: absoluteX, y: absoluteY }
}

function isNodeFullyInsideGroup(nodes: Node[], node: Node, groupNode: Node) {
  const nodeAbsolutePosition = getAbsoluteNodePosition(nodes, node)
  const groupAbsolutePosition = getAbsoluteNodePosition(nodes, groupNode)
  const { width: nodeWidth, height: nodeHeight } = getNodeSize(node)
  const { width: groupWidth, height: groupHeight } = getNodeSize(groupNode)

  return (
    nodeAbsolutePosition.x >= groupAbsolutePosition.x
    && nodeAbsolutePosition.y >= groupAbsolutePosition.y
    && nodeAbsolutePosition.x + nodeWidth <= groupAbsolutePosition.x + groupWidth
    && nodeAbsolutePosition.y + nodeHeight <= groupAbsolutePosition.y + groupHeight
  )
}

export function getVisualGroupMemberIds(nodes: Node[], groupNode: Node) {
  return new Set(
    nodes
      .filter((node) => node.type !== 'groupNode' && isNodeFullyInsideGroup(nodes, node, groupNode))
      .map((node) => node.id),
  )
}

function getSmallestContainingGroup(nodes: Node[], node: Node) {
  const containingGroups = nodes.filter((candidate) => candidate.type === 'groupNode' && isNodeFullyInsideGroup(nodes, node, candidate))

  if (containingGroups.length === 0) {
    return null
  }

  return containingGroups.reduce((smallest, groupNode) => {
    const smallestSize = getNodeSize(smallest)
    const groupSize = getNodeSize(groupNode)
    return groupSize.width * groupSize.height < smallestSize.width * smallestSize.height ? groupNode : smallest
  })
}

export function buildGroupAwareLayoutTargets(nodes: Node[], edges: Edge[], shouldIncludeUnit: (node: Node) => boolean) {
  const normalizedNodes = normalizeVisualGroupNodes(nodes)
  const groupNodes = normalizedNodes.filter((node) => node.type === 'groupNode')
  const unitNodeById = new Map<string, Node>()
  const memberIdsByGroupId = new Map<string, Set<string>>()
  const unitIdByNodeId = new Map<string, string>()

  for (const groupNode of groupNodes) {
    const memberIds = getVisualGroupMemberIds(normalizedNodes, groupNode)
    memberIdsByGroupId.set(groupNode.id, memberIds)
    unitIdByNodeId.set(groupNode.id, groupNode.id)
  }

  for (const node of normalizedNodes) {
    if (node.type === 'groupNode') {
      continue
    }

    const containingGroup = getSmallestContainingGroup(normalizedNodes, node)
    unitIdByNodeId.set(node.id, containingGroup?.id ?? node.id)
  }

  for (const node of normalizedNodes) {
    if (!shouldIncludeUnit(node)) {
      continue
    }

    const unitId = unitIdByNodeId.get(node.id)
    if (!unitId || unitNodeById.has(unitId)) {
      continue
    }

    const unitNode = normalizedNodes.find((candidate) => candidate.id === unitId)
    if (unitNode) {
      unitNodeById.set(unitId, unitNode)
    }
  }

  const unitIds = new Set(unitNodeById.keys())
  const layoutEdges = edges
    .map((edge) => {
      const sourceUnitId = unitIdByNodeId.get(edge.source)
      const targetUnitId = unitIdByNodeId.get(edge.target)

      if (!sourceUnitId || !targetUnitId || sourceUnitId === targetUnitId || !unitIds.has(sourceUnitId) || !unitIds.has(targetUnitId)) {
        return null
      }

      return {
        ...edge,
        id: `${edge.id}:${sourceUnitId}:${targetUnitId}`,
        source: sourceUnitId,
        target: targetUnitId,
      }
    })
    .filter((edge): edge is Edge => edge !== null)

  return {
    normalizedNodes,
    targets: [...unitNodeById.values()],
    layoutEdges,
    memberIdsByGroupId,
  }
}

export function applyGroupAwareLayoutPositions(
  nodes: Node[],
  normalizedNodes: Node[],
  memberIdsByGroupId: Map<string, Set<string>>,
  positions: Map<string, { x: number; y: number }>,
) {
  const deltasByGroupId = new Map<string, { x: number; y: number }>()

  for (const [nodeId, position] of positions) {
    const node = normalizedNodes.find((candidate) => candidate.id === nodeId)
    if (node?.type === 'groupNode') {
      deltasByGroupId.set(nodeId, {
        x: position.x - node.position.x,
        y: position.y - node.position.y,
      })
    }
  }

  return nodes.map((node) => {
    const directPosition = positions.get(node.id)
    if (directPosition) {
      return { ...node, position: directPosition }
    }

    for (const [groupId, delta] of deltasByGroupId) {
      const memberIds = memberIdsByGroupId.get(groupId)
      if (memberIds?.has(node.id)) {
        return {
          ...node,
          position: {
            x: node.position.x + delta.x,
            y: node.position.y + delta.y,
          },
        }
      }
    }

    return node
  })
}

function removeGroupDragHandle(node: Node) {
  if (node.type !== 'groupNode' || !node.dragHandle) {
    return node
  }

  const nextNode = { ...node }
  delete nextNode.dragHandle
  return nextNode
}

function orderVisualGroupNodes(nodes: Node[]) {
  const groupNodes = nodes.filter((node) => node.type === 'groupNode').map(removeGroupDragHandle)
  const contentNodes = nodes.filter((node) => node.type !== 'groupNode')
  return [...groupNodes, ...contentNodes]
}

export function normalizeVisualGroupNodes(nodes: Node[]) {
  const hasParentedNodes = nodes.some((node) => node.parentId)
  const normalizedNodes = hasParentedNodes
    ? nodes.map((node) => {
      if (!node.parentId) {
        return node
      }

      return {
        ...node,
        parentId: undefined,
        extent: undefined,
        position: getAbsoluteNodePosition(nodes, node),
      }
    })
    : nodes

  return orderVisualGroupNodes(normalizedNodes)
}

export function moveVisualGroupMembers(previousNodes: Node[], nextNodes: Node[], changes: NodeChange[]) {
  const resizingNodeIds = new Set(
    changes
      .filter((change): change is NodeChange & { type: 'dimensions'; id: string } => (
        'id' in change && change.type === 'dimensions'
      ))
      .map((change) => change.id),
  )
  const movedGroupChanges = changes.filter((change): change is NodeChange & {
    type: 'position'
    id: string
    dragging?: boolean
  } => 'id' in change && change.type === 'position')

  if (movedGroupChanges.length === 0) {
    return nextNodes
  }

  const changedNodeIds = new Set(movedGroupChanges.map((change) => change.id))
  let movedNodes = nextNodes

  for (const change of movedGroupChanges) {
    const previousGroupNode = previousNodes.find((node) => node.id === change.id && node.type === 'groupNode')
    const nextGroupNode = movedNodes.find((node) => node.id === change.id && node.type === 'groupNode')

    if (!previousGroupNode || !nextGroupNode) {
      continue
    }

    if (resizingNodeIds.has(change.id)) {
      activeGroupDragMemberIdsByGroupId.delete(change.id)
      continue
    }

    const deltaX = nextGroupNode.position.x - previousGroupNode.position.x
    const deltaY = nextGroupNode.position.y - previousGroupNode.position.y

    if (deltaX === 0 && deltaY === 0) {
      if (change.dragging === false) {
        activeGroupDragMemberIdsByGroupId.delete(change.id)
      }
      continue
    }

    let memberIds = activeGroupDragMemberIdsByGroupId.get(change.id)
    if (!memberIds) {
      memberIds = getVisualGroupMemberIds(previousNodes, previousGroupNode)
      activeGroupDragMemberIdsByGroupId.set(change.id, memberIds)
    }

    movedNodes = movedNodes.map((node) => {
      if (!memberIds.has(node.id) || changedNodeIds.has(node.id)) {
        return node
      }

      return {
        ...node,
        position: {
          x: node.position.x + deltaX,
          y: node.position.y + deltaY,
        },
      }
    })

    if (change.dragging === false) {
      activeGroupDragMemberIdsByGroupId.delete(change.id)
    }
  }

  return movedNodes
}

export function getDescendantNodeIds(nodes: Node[], rootIds: Set<string>) {
  const descendantIds = new Set<string>()
  let foundNewNode = true

  while (foundNewNode) {
    foundNewNode = false

    for (const node of nodes) {
      const parentId = typeof node.parentId === 'string' ? node.parentId : null
      if (!parentId) {
        continue
      }

      if ((rootIds.has(parentId) || descendantIds.has(parentId)) && !descendantIds.has(node.id) && !rootIds.has(node.id)) {
        descendantIds.add(node.id)
        foundNewNode = true
      }
    }
  }

  return descendantIds
}

export function expandGroupToFitDescendants(nodes: Node[], groupId: string) {
  const groupNode = nodes.find((node) => node.id === groupId && node.type === 'groupNode')

  if (!groupNode) {
    return nodes
  }

  const descendantIds = getDescendantNodeIds(nodes, new Set([groupId]))

  if (descendantIds.size === 0) {
    return nodes
  }

  const directChildIds = new Set(
    nodes
      .filter((node) => node.parentId === groupId)
      .map((node) => node.id),
  )
  const groupAbsolutePosition = getAbsoluteNodePosition(nodes, groupNode)
  const { width: currentWidth, height: currentHeight } = getNodeSize(groupNode)
  const bounds = nodes
    .filter((node) => descendantIds.has(node.id))
    .reduce((accumulator, node) => {
      const absolutePosition = getAbsoluteNodePosition(nodes, node)
      const { width, height } = getNodeSize(node)
      const relativeX = absolutePosition.x - groupAbsolutePosition.x
      const relativeY = absolutePosition.y - groupAbsolutePosition.y

      return {
        minX: Math.min(accumulator.minX, relativeX),
        minY: Math.min(accumulator.minY, relativeY),
        maxX: Math.max(accumulator.maxX, relativeX + width),
        maxY: Math.max(accumulator.maxY, relativeY + height),
      }
    }, {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    })

  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)) {
    return nodes
  }

  const minimumContentX = GROUP_PADDING_X
  const minimumContentY = GROUP_HEADER_HEIGHT + GROUP_PADDING_Y
  const shiftX = bounds.minX < minimumContentX ? minimumContentX - bounds.minX : 0
  const shiftY = bounds.minY < minimumContentY ? minimumContentY - bounds.minY : 0
  const requiredWidth = Math.max(currentWidth, bounds.maxX + shiftX + GROUP_PADDING_X)
  const requiredHeight = Math.max(currentHeight, bounds.maxY + shiftY + GROUP_PADDING_Y)

  if (shiftX === 0 && shiftY === 0 && requiredWidth === currentWidth && requiredHeight === currentHeight) {
    return nodes
  }

  return nodes.map((node) => {
    if (node.id === groupId) {
      return {
        ...node,
        position: {
          x: node.position.x - shiftX,
          y: node.position.y - shiftY,
        },
        width: requiredWidth,
        height: requiredHeight,
      }
    }

    if (!directChildIds.has(node.id)) {
      return node
    }

    return {
      ...node,
      position: {
        x: node.position.x + shiftX,
        y: node.position.y + shiftY,
      },
    }
  })
}

function rectanglesOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
  gap: number,
) {
  return !(
    left.x + left.width + gap <= right.x
    || right.x + right.width + gap <= left.x
    || left.y + left.height + gap <= right.y
    || right.y + right.height + gap <= left.y
  )
}

export function findManualSpawnPosition(
  nodes: Node[],
  preferredPosition: { x: number; y: number } | undefined,
  size: { width: number; height: number },
) {
  const basePosition = preferredPosition ?? { x: 160, y: 120 }
  const stepX = Math.max(Math.round(size.width * 0.72), 180)
  const stepY = Math.max(Math.round(size.height * 0.72), 140)
  const occupiedRectangles = nodes
    .filter((node) => node.type !== 'groupNode')
    .map((node) => {
      const absolutePosition = getAbsoluteNodePosition(nodes, node)
      const nodeSize = getNodeSize(node)
      return {
        x: absolutePosition.x,
        y: absolutePosition.y,
        width: nodeSize.width,
        height: nodeSize.height,
      }
    })

  const candidates: Array<{ x: number; y: number }> = [
    basePosition,
    { x: basePosition.x + MANUAL_NODE_SPAWN_SAFE_OFFSET_X, y: basePosition.y },
  ]

  for (let column = 1; column <= MANUAL_NODE_SPAWN_SEARCH_COLUMNS; column += 1) {
    candidates.push({ x: basePosition.x + column * stepX, y: basePosition.y })

    for (let row = 1; row <= MANUAL_NODE_SPAWN_SEARCH_ROWS; row += 1) {
      candidates.push({ x: basePosition.x + column * stepX, y: basePosition.y + row * stepY })
      candidates.push({ x: basePosition.x + column * stepX, y: basePosition.y - row * stepY })
    }
  }

  for (const candidate of candidates) {
    const nextRectangle = {
      x: candidate.x,
      y: candidate.y,
      width: size.width,
      height: size.height,
    }

    if (!occupiedRectangles.some((rectangle) => rectanglesOverlap(nextRectangle, rectangle, MANUAL_NODE_SPAWN_GAP))) {
      return candidate
    }
  }

  return candidates[candidates.length - 1] ?? basePosition
}
