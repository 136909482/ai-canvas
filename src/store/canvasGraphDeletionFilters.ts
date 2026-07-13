type GraphNode = {
  id: string
  selected?: boolean
}

type GraphEdge = {
  id: string
  source: string
  target: string
  targetHandle?: string | null
  selected?: boolean
}

export function filterNodeDeletedGraph<TNode extends GraphNode, TEdge extends GraphEdge>(
  nodes: TNode[],
  edges: TEdge[],
  nodeId: string,
) {
  const nodeIdsToDelete = new Set([nodeId])
  const nextNodes = nodes.filter((node) => !nodeIdsToDelete.has(node.id))
  const nextEdges = edges.filter((edge) => !nodeIdsToDelete.has(edge.source) && !nodeIdsToDelete.has(edge.target))

  return { nodes: nextNodes, edges: nextEdges }
}

export function filterEdgeDeletedGraph<TNode extends GraphNode, TEdge extends GraphEdge>(
  nodes: TNode[],
  edges: TEdge[],
  edgeId: string,
) {
  return {
    nodes,
    edges: edges.filter((edge) => edge.id !== edgeId),
  }
}

export function filterEdgesDeletedBySourceTargetGraph<TNode extends GraphNode, TEdge extends GraphEdge>(
  nodes: TNode[],
  edges: TEdge[],
  sourceId: string,
  targetId: string,
) {
  return {
    nodes,
    edges: edges.filter((edge) => !(edge.source === sourceId && edge.target === targetId)),
  }
}

export function filterEdgesDeletedBySourceTargetHandleGraph<TNode extends GraphNode, TEdge extends GraphEdge>(
  nodes: TNode[],
  edges: TEdge[],
  sourceId: string,
  targetId: string,
  targetHandle: string,
) {
  return {
    nodes,
    edges: edges.filter((edge) => !(
      edge.source === sourceId
      && edge.target === targetId
      && edge.targetHandle === targetHandle
    )),
  }
}

export function filterEdgesDeletedBySourceTargetExceptHandleGraph<TNode extends GraphNode, TEdge extends GraphEdge>(
  nodes: TNode[],
  edges: TEdge[],
  sourceId: string,
  targetId: string,
  excludedTargetHandle: string,
) {
  return {
    nodes,
    edges: edges.filter((edge) => !(
      edge.source === sourceId
      && edge.target === targetId
      && edge.targetHandle !== excludedTargetHandle
    )),
  }
}

export function filterSelectedElementsDeletedGraph<TNode extends GraphNode, TEdge extends GraphEdge>(
  nodes: TNode[],
  edges: TEdge[],
) {
  const selectedNodeIds = new Set(
    nodes.filter((node) => node.selected).map((node) => node.id),
  )
  const selectedEdgeIds = new Set(
    edges.filter((edge) => edge.selected).map((edge) => edge.id),
  )

  if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) {
    return null
  }

  const nextNodes = nodes.filter((node) => !selectedNodeIds.has(node.id))
  const nextEdges = edges.filter(
    (edge) =>
      !selectedEdgeIds.has(edge.id) &&
      !selectedNodeIds.has(edge.source) &&
      !selectedNodeIds.has(edge.target),
  )

  return { nodes: nextNodes, edges: nextEdges }
}
