import type { Node, Edge } from '@xyflow/react'

export type LayoutDirection = 'horizontal' | 'vertical'

const LAYER_GAP = 80
const NODE_GAP = 40
const IMAGE_NODE_WIDTH = 340
const IMAGE_NODE_HEIGHT = 340
const VIDEO_NODE_WIDTH = 360
const VIDEO_NODE_HEIGHT = 240
const VIDEO_GENERATE_NODE_WIDTH = 760
const VIDEO_GENERATE_NODE_HEIGHT = 230

function getSize(node: Node): { width: number; height: number } {
  const w = typeof node.width === 'number' ? node.width
    : node.type === 'generateNode' ? 480
    : node.type === 'imageEditNode' ? 520
    : node.type === 'imageCropNode' ? 420
    : node.type === 'llmNode' || node.type === 'llmFileNode' ? 480
    : node.type === 'generatedPreviewNode' ? 300
    : node.type === 'compareNode' ? 420
    : node.type === 'llmOutputTextNode' ? 320
    : node.type === 'textSplitterNode' ? 360
    : node.type === 'inlineTextSplitterNode' ? 420
    : node.type === 'groupNode' ? 520
    : node.type === 'imageNode' ? IMAGE_NODE_WIDTH
    : node.type === 'videoNode' ? VIDEO_NODE_WIDTH
    : node.type === 'videoGenerateNode' ? VIDEO_GENERATE_NODE_WIDTH
    : node.type === 'testImageNode' ? IMAGE_NODE_WIDTH
    : node.type === 'textNode' ? 240
    : 240

  const h = typeof node.height === 'number' ? node.height
    : node.type === 'generateNode' ? 360
    : node.type === 'imageEditNode' ? 430
    : node.type === 'imageCropNode' ? 420
    : node.type === 'llmNode' || node.type === 'llmFileNode' ? 340
    : node.type === 'generatedPreviewNode' ? 260
    : node.type === 'compareNode' ? 320
    : node.type === 'llmOutputTextNode' ? 240
    : node.type === 'textSplitterNode' ? 240
    : node.type === 'inlineTextSplitterNode' ? 420
    : node.type === 'groupNode' ? 420
    : node.type === 'imageNode' ? IMAGE_NODE_HEIGHT
    : node.type === 'videoNode' ? VIDEO_NODE_HEIGHT
    : node.type === 'videoGenerateNode' ? VIDEO_GENERATE_NODE_HEIGHT
    : node.type === 'testImageNode' ? IMAGE_NODE_HEIGHT
    : node.type === 'textNode' ? 160
    : 180

  return { width: w, height: h }
}

function getRelevantEdges(nodes: Node[], edges: Edge[]) {
  const nodeIds = new Set(nodes.map(n => n.id))
  return edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
}

function buildLayerMap(nodes: Node[], edges: Edge[]): Map<string, number> {
  const relevantEdges = getRelevantEdges(nodes, edges)

  const inDegree = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  const layerMap = new Map<string, number>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    outgoing.set(node.id, [])
    layerMap.set(node.id, 0)
  }

  for (const edge of relevantEdges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
    outgoing.get(edge.source)!.push(edge.target)
  }

  const queue: string[] = []
  for (const node of nodes) {
    if (inDegree.get(node.id) === 0) queue.push(node.id)
  }

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    const currentLayer = layerMap.get(nodeId)!

    for (const targetId of outgoing.get(nodeId) ?? []) {
      const newLayer = currentLayer + 1
      if (newLayer > (layerMap.get(targetId) ?? 0)) {
        layerMap.set(targetId, newLayer)
      }
      const deg = (inDegree.get(targetId) ?? 1) - 1
      inDegree.set(targetId, deg)
      if (deg === 0) queue.push(targetId)
    }
  }

  // 有环节点（BFS 未覆盖）放到最大层 + 1
  const maxLayer = Math.max(0, ...layerMap.values())
  for (const node of nodes) {
    if ((inDegree.get(node.id) ?? 0) > 0) {
      layerMap.set(node.id, maxLayer + 1)
    }
  }

  return layerMap
}

function buildWeakComponents(nodes: Node[], edges: Edge[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const neighbors = new Map(nodes.map((node) => [node.id, [] as string[]]))

  for (const edge of getRelevantEdges(nodes, edges)) {
    neighbors.get(edge.source)?.push(edge.target)
    neighbors.get(edge.target)?.push(edge.source)
  }

  const visited = new Set<string>()
  const components: Node[][] = []

  for (const node of nodes) {
    if (visited.has(node.id)) {
      continue
    }

    const component: Node[] = []
    const queue = [node.id]
    visited.add(node.id)

    while (queue.length > 0) {
      const nodeId = queue.shift()!
      const currentNode = nodeById.get(nodeId)
      if (currentNode) {
        component.push(currentNode)
      }

      for (const neighborId of neighbors.get(nodeId) ?? []) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId)
          queue.push(neighborId)
        }
      }
    }

    components.push(component)
  }

  return components
}

function getSecondaryPosition(node: Node, direction: LayoutDirection) {
  return direction === 'horizontal' ? node.position.y : node.position.x
}

function averageNeighborOrder(nodeIds: string[], orderByNodeId: Map<string, number>) {
  const orders = nodeIds
    .map((nodeId) => orderByNodeId.get(nodeId))
    .filter((order): order is number => typeof order === 'number')

  if (orders.length === 0) {
    return null
  }

  return orders.reduce((sum, order) => sum + order, 0) / orders.length
}

function orderLayerGroups(nodes: Node[], edges: Edge[], direction: LayoutDirection) {
  const layerMap = buildLayerMap(nodes, edges)
  const layerGroups = new Map<number, Node[]>()
  const incoming = new Map(nodes.map((node) => [node.id, [] as string[]]))
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]))

  for (const edge of getRelevantEdges(nodes, edges)) {
    incoming.get(edge.target)?.push(edge.source)
    outgoing.get(edge.source)?.push(edge.target)
  }

  for (const node of nodes) {
    const layer = layerMap.get(node.id) ?? 0
    if (!layerGroups.has(layer)) layerGroups.set(layer, [])
    layerGroups.get(layer)!.push(node)
  }

  const sortedLayers = [...layerGroups.keys()].sort((a, b) => a - b)
  const originalOrder = new Map<string, number>()

  for (const layer of sortedLayers) {
    layerGroups.get(layer)!.sort((left, right) => getSecondaryPosition(left, direction) - getSecondaryPosition(right, direction))
    layerGroups.get(layer)!.forEach((node, index) => originalOrder.set(node.id, index))
  }

  const getOrderByNodeId = () => {
    const orderByNodeId = new Map<string, number>()
    for (const layer of sortedLayers) {
      layerGroups.get(layer)!.forEach((node, index) => orderByNodeId.set(node.id, index))
    }
    return orderByNodeId
  }

  const sortLayer = (layer: number, scoreByNodeId: Map<string, number>) => {
    const previousOrder = getOrderByNodeId()
    layerGroups.get(layer)!.sort((left, right) => {
      const leftScore = scoreByNodeId.get(left.id)
      const rightScore = scoreByNodeId.get(right.id)

      if (typeof leftScore === 'number' && typeof rightScore === 'number' && leftScore !== rightScore) {
        return leftScore - rightScore
      }
      if (typeof leftScore === 'number' && typeof rightScore !== 'number') {
        return -1
      }
      if (typeof leftScore !== 'number' && typeof rightScore === 'number') {
        return 1
      }

      return (previousOrder.get(left.id) ?? originalOrder.get(left.id) ?? 0) - (previousOrder.get(right.id) ?? originalOrder.get(right.id) ?? 0)
    })
  }

  for (let iteration = 0; iteration < 4; iteration += 1) {
    for (const layer of sortedLayers.slice(1)) {
      const orderByNodeId = getOrderByNodeId()
      const scores = new Map<string, number>()
      for (const node of layerGroups.get(layer) ?? []) {
        const score = averageNeighborOrder(incoming.get(node.id) ?? [], orderByNodeId)
        if (score !== null) scores.set(node.id, score)
      }
      sortLayer(layer, scores)
    }

    for (const layer of sortedLayers.slice(0, -1).reverse()) {
      const orderByNodeId = getOrderByNodeId()
      const scores = new Map<string, number>()
      for (const node of layerGroups.get(layer) ?? []) {
        const score = averageNeighborOrder(outgoing.get(node.id) ?? [], orderByNodeId)
        if (score !== null) scores.set(node.id, score)
      }
      sortLayer(layer, scores)
    }
  }

  return { sortedLayers, layerGroups }
}

function computeLayeredAutoLayout(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection,
  originX: number,
  originY: number,
) {
  const { sortedLayers, layerGroups } = orderLayerGroups(nodes, edges, direction)
  const positions = new Map<string, { x: number; y: number }>()

  if (direction === 'horizontal') {
    let x = originX
    for (const layer of sortedLayers) {
      const layerNodes = layerGroups.get(layer)!
      const maxWidth = Math.max(...layerNodes.map(n => getSize(n).width))
      let y = originY
      for (const node of layerNodes) {
        positions.set(node.id, { x, y })
        y += getSize(node).height + NODE_GAP
      }
      x += maxWidth + LAYER_GAP
    }
  } else {
    let y = originY
    for (const layer of sortedLayers) {
      const layerNodes = layerGroups.get(layer)!
      const maxHeight = Math.max(...layerNodes.map(n => getSize(n).height))
      let x = originX
      for (const node of layerNodes) {
        positions.set(node.id, { x, y })
        x += getSize(node).width + NODE_GAP
      }
      y += maxHeight + LAYER_GAP
    }
  }

  return positions
}

function getLayoutBounds(nodes: Node[], positions: Map<string, { x: number; y: number }>) {
  return nodes.reduce((bounds, node) => {
    const position = positions.get(node.id) ?? node.position
    const size = getSize(node)
    return {
      minX: Math.min(bounds.minX, position.x),
      minY: Math.min(bounds.minY, position.y),
      maxX: Math.max(bounds.maxX, position.x + size.width),
      maxY: Math.max(bounds.maxY, position.y + size.height),
    }
  }, {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  })
}

export function computeAutoLayout(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection,
): Map<string, { x: number; y: number }> {
  if (nodes.length === 0) return new Map()

  const minX = Math.min(...nodes.map(n => n.position.x))
  const minY = Math.min(...nodes.map(n => n.position.y))
  const components = buildWeakComponents(nodes, edges).sort((left, right) => {
    const leftBounds = getLayoutBounds(left, new Map())
    const rightBounds = getLayoutBounds(right, new Map())
    return direction === 'horizontal'
      ? leftBounds.minY - rightBounds.minY
      : leftBounds.minX - rightBounds.minX
  })

  const positions = new Map<string, { x: number; y: number }>()
  let componentOffset = direction === 'horizontal' ? minY : minX

  for (const component of components) {
    const componentPositions = computeLayeredAutoLayout(
      component,
      edges,
      direction,
      direction === 'horizontal' ? minX : componentOffset,
      direction === 'horizontal' ? componentOffset : minY,
    )

    for (const [nodeId, position] of componentPositions) {
      positions.set(nodeId, position)
    }

    const bounds = getLayoutBounds(component, componentPositions)
    componentOffset = direction === 'horizontal'
      ? bounds.maxY + NODE_GAP * 2
      : bounds.maxX + NODE_GAP * 2
  }

  return positions
}

export function computeFocusedAutoLayout(
  nodes: Node[],
  edges: Edge[],
  centerNodeId: string,
): Map<string, { x: number; y: number }> {
  if (nodes.length === 0) return new Map()

  const centerNode = nodes.find((node) => node.id === centerNodeId)
  if (!centerNode) return new Map()

  const layerMap = buildLayerMap(nodes, edges)
  const centerLayer = layerMap.get(centerNodeId) ?? 0
  const layerGroups = new Map<number, Node[]>()

  for (const node of nodes) {
    const relativeLayer = (layerMap.get(node.id) ?? 0) - centerLayer
    if (!layerGroups.has(relativeLayer)) layerGroups.set(relativeLayer, [])
    layerGroups.get(relativeLayer)!.push(node)
  }

  const centerNodeSize = getSize(centerNode)
  const centerX = centerNode.position.x
  const centerY = centerNode.position.y
  const centerMiddleY = centerY + centerNodeSize.height / 2
  const sortedLayers = [...layerGroups.keys()].sort((a, b) => a - b)
  const xByLayer = new Map<number, number>([[0, centerX]])

  const positiveLayers = sortedLayers.filter((layer) => layer > 0)
  const negativeLayers = sortedLayers.filter((layer) => layer < 0).sort((a, b) => b - a)

  let previousPositiveLayer = 0
  for (const layer of positiveLayers) {
    const previousX = xByLayer.get(previousPositiveLayer) ?? centerX
    const previousWidth = Math.max(...(layerGroups.get(previousPositiveLayer) ?? [centerNode]).map((node) => getSize(node).width))
    xByLayer.set(layer, previousX + previousWidth + LAYER_GAP)
    previousPositiveLayer = layer
  }

  let previousNegativeLayer = 0
  for (const layer of negativeLayers) {
    const nextX = xByLayer.get(previousNegativeLayer) ?? centerX
    const currentWidth = Math.max(...(layerGroups.get(layer) ?? [centerNode]).map((node) => getSize(node).width))
    xByLayer.set(layer, nextX - currentWidth - LAYER_GAP)
    previousNegativeLayer = layer
  }

  const positions = new Map<string, { x: number; y: number }>()

  for (const layer of sortedLayers) {
    const layerNodes = [...(layerGroups.get(layer) ?? [])].sort((left, right) => left.position.y - right.position.y)
    const x = xByLayer.get(layer) ?? centerX

    if (layer === 0) {
      const anchorIndex = layerNodes.findIndex((node) => node.id === centerNodeId)
      if (anchorIndex >= 0) {
        positions.set(centerNodeId, { x, y: centerY })

        let nextTop = centerY
        for (let index = anchorIndex - 1; index >= 0; index -= 1) {
          const node = layerNodes[index]
          nextTop -= getSize(node).height + NODE_GAP
          positions.set(node.id, { x, y: nextTop })
        }

        let nextBottom = centerY + centerNodeSize.height + NODE_GAP
        for (let index = anchorIndex + 1; index < layerNodes.length; index += 1) {
          const node = layerNodes[index]
          positions.set(node.id, { x, y: nextBottom })
          nextBottom += getSize(node).height + NODE_GAP
        }
        continue
      }
    }

    const totalHeight = layerNodes.reduce((sum, node) => sum + getSize(node).height, 0) + NODE_GAP * Math.max(0, layerNodes.length - 1)
    let y = centerMiddleY - totalHeight / 2

    for (const node of layerNodes) {
      positions.set(node.id, { x, y })
      y += getSize(node).height + NODE_GAP
    }
  }

  return positions
}
