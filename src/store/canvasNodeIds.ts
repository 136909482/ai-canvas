import type { Edge, Node } from '@xyflow/react'
import { getCanvasNodeRegistration } from '@/features/nodeRegistry/protocol'

let nodeIdCounter = 1

export function syncNodeIdCounter(nodes: Node[]) {
  const maxNodeId = nodes.reduce((maxValue, node) => {
    const match = /^[a-z]+-(\d+)$/.exec(node.id)
    const numericId = match ? Number(match[1]) : 0
    return Math.max(maxValue, numericId)
  }, 0)

  nodeIdCounter = maxNodeId + 1
}

export function resetNodeIdCounter() {
  nodeIdCounter = 1
}

export function takeNextNodeId(type: Node['type']) {
  const registration = getCanvasNodeRegistration(type)
  return registration ? `${registration.idPrefix}-${nodeIdCounter++}` : null
}

export function buildConnectedComponentNodeIds(nodes: Node[], edges: Edge[], startNodeId: string): Set<string> {
  const nodeIds = new Set(nodes.map((node) => node.id))
  if (!nodeIds.has(startNodeId)) {
    return new Set()
  }

  const adjacency = new Map<string, Set<string>>()
  for (const node of nodes) {
    adjacency.set(node.id, new Set())
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue
    }

    adjacency.get(edge.source)?.add(edge.target)
    adjacency.get(edge.target)?.add(edge.source)
  }

  const visited = new Set<string>()
  const queue = [startNodeId]

  while (queue.length > 0) {
    const currentNodeId = queue.shift()
    if (!currentNodeId || visited.has(currentNodeId)) {
      continue
    }

    visited.add(currentNodeId)
    for (const neighborId of adjacency.get(currentNodeId) ?? []) {
      if (!visited.has(neighborId)) {
        queue.push(neighborId)
      }
    }
  }

  return visited
}
