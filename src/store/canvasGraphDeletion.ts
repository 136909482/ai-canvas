import type { Edge, Node } from '@xyflow/react'
import { buildSyncedGraphState } from './canvasConnectionDerivedData'
import {
  filterEdgeDeletedGraph,
  filterEdgesDeletedBySourceTargetExceptHandleGraph,
  filterEdgesDeletedBySourceTargetGraph,
  filterEdgesDeletedBySourceTargetHandleGraph,
  filterNodeDeletedGraph,
  filterSelectedElementsDeletedGraph,
} from './canvasGraphDeletionFilters'

export function buildNodeDeletedGraphState(nodes: Node[], edges: Edge[], nodeId: string) {
  const filteredGraph = filterNodeDeletedGraph(nodes, edges, nodeId)
  return buildSyncedGraphState(filteredGraph.nodes, filteredGraph.edges)
}

export function buildEdgeDeletedGraphState(nodes: Node[], edges: Edge[], edgeId: string) {
  const filteredGraph = filterEdgeDeletedGraph(nodes, edges, edgeId)
  return buildSyncedGraphState(filteredGraph.nodes, filteredGraph.edges)
}

export function buildEdgesDeletedBySourceTargetState(
  nodes: Node[],
  edges: Edge[],
  sourceId: string,
  targetId: string,
) {
  const filteredGraph = filterEdgesDeletedBySourceTargetGraph(nodes, edges, sourceId, targetId)
  return buildSyncedGraphState(filteredGraph.nodes, filteredGraph.edges)
}

export function buildEdgesDeletedBySourceTargetHandleState(
  nodes: Node[],
  edges: Edge[],
  sourceId: string,
  targetId: string,
  targetHandle: string,
) {
  const filteredGraph = filterEdgesDeletedBySourceTargetHandleGraph(nodes, edges, sourceId, targetId, targetHandle)
  return buildSyncedGraphState(filteredGraph.nodes, filteredGraph.edges)
}

export function buildEdgesDeletedBySourceTargetExceptHandleState(
  nodes: Node[],
  edges: Edge[],
  sourceId: string,
  targetId: string,
  excludedTargetHandle: string,
) {
  const filteredGraph = filterEdgesDeletedBySourceTargetExceptHandleGraph(nodes, edges, sourceId, targetId, excludedTargetHandle)
  return buildSyncedGraphState(filteredGraph.nodes, filteredGraph.edges)
}

export function buildSelectedElementsDeletedGraphState(nodes: Node[], edges: Edge[]) {
  const filteredGraph = filterSelectedElementsDeletedGraph(nodes, edges)
  if (!filteredGraph) {
    return null
  }

  return buildSyncedGraphState(filteredGraph.nodes, filteredGraph.edges)
}
