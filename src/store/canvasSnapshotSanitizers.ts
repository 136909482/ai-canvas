import type { Edge, Node } from '@xyflow/react'
import type { CanvasSnapshot } from '@/types'

type NormalizeNodes = (nodes: Node[]) => Node[]

function sanitizeNodeWithImageAsset(node: Node, emptyImageUrl: string | null): Node {
  return {
    ...node,
    selected: false,
    data: {
      ...node.data,
      imageUrl: node.data?.imageAsset
        ? emptyImageUrl
        : (typeof node.data?.imageUrl === 'string' ? node.data.imageUrl : emptyImageUrl),
    },
  }
}

function sanitizeNodeWithVideoAsset(node: Node): Node {
  return {
    ...node,
    selected: false,
    data: {
      ...node.data,
      videoUrl: node.data?.videoAsset
        ? null
        : (typeof node.data?.videoUrl === 'string' ? node.data.videoUrl : null),
    },
  }
}

export function sanitizeNodeForPersistence(node: Node): Node {
  if (node.type === 'videoNode') {
    return sanitizeNodeWithVideoAsset(node)
  }

  if (node.type === 'imageNode' || node.type === 'generateNode' || node.type === 'testImageNode') {
    return sanitizeNodeWithImageAsset(node, null)
  }

  if (node.type === 'generatedPreviewNode') {
    return sanitizeNodeWithImageAsset(node, '')
  }

  return {
    ...node,
    selected: false,
  }
}

export function sanitizeNodeForHistory(node: Node): Node {
  return {
    ...node,
    selected: false,
  }
}

export function sanitizeEdge(edge: Edge): Edge {
  const nextEdge = { ...edge }
  delete nextEdge.type

  return {
    ...nextEdge,
    animated: true,
    selected: false,
  }
}

export function sanitizeCanvasSnapshotForPersistence(
  snapshot: CanvasSnapshot,
  normalizeNodes: NormalizeNodes,
): CanvasSnapshot {
  return {
    nodes: normalizeNodes(snapshot.nodes ?? []).map((node) => sanitizeNodeForPersistence(node)),
    edges: (snapshot.edges ?? []).map((edge) => sanitizeEdge(edge)),
  }
}

export function sanitizeCanvasSnapshotForHistory(
  snapshot: CanvasSnapshot,
  normalizeNodes: NormalizeNodes,
): CanvasSnapshot {
  return {
    nodes: normalizeNodes(snapshot.nodes ?? []).map((node) => sanitizeNodeForHistory(node)),
    edges: (snapshot.edges ?? []).map((edge) => sanitizeEdge(edge)),
  }
}
