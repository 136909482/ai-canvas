import type { Edge, Node } from '@xyflow/react'
import { syncConnectionDerivedNodeData } from './canvasConnectionDerivedData'
import {
  layoutGeneratedPreviewNodesInContext,
  layoutLLMOutputTextNodesInContext,
} from './canvasOutputLayout'

export function buildNodeDataUpdatedState(
  nodes: Node[],
  edges: Edge[],
  nodeId: string,
  patch: Record<string, unknown>,
) {
  let layoutSourceGenerateNodeId: string | null = null
  const hasNodeSizePatch = patch.width !== undefined || patch.height !== undefined
  const nextNodes = nodes.map((node) => {
    if (node.id !== nodeId) return node
    const { width, height, ...dataPatch } = patch
    const updates: Partial<Node> = {
      data: { ...node.data, ...dataPatch },
    }
    if (width !== undefined) {
      updates.width = width as number
    }
    if (height !== undefined) {
      updates.height = height as number
    }

    if (node.type === 'generatedPreviewNode' && node.data?.layoutMode !== 'manual') {
      layoutSourceGenerateNodeId = typeof node.data?.sourceGenerateNodeId === 'string' ? node.data.sourceGenerateNodeId : null
    }

    if ((node.type === 'generateNode' || node.type === 'imageEditNode' || node.type === 'imageCropNode') && hasNodeSizePatch) {
      layoutSourceGenerateNodeId = node.id
    }

    return { ...node, ...updates }
  })

  let layoutSourceLLMNodeId: string | null = null

  const finalNodes = nextNodes.map((node) => {
    if (node.id !== nodeId) {
      return node
    }

    if (node.type === 'llmOutputTextNode' && node.data?.layoutMode !== 'manual') {
      layoutSourceLLMNodeId = typeof node.data?.sourceLLMNodeId === 'string' ? node.data.sourceLLMNodeId : null
    }

    if ((node.type === 'llmNode' || node.type === 'llmFileNode') && hasNodeSizePatch) {
      layoutSourceLLMNodeId = node.id
    }

    return node
  })

  if (!layoutSourceGenerateNodeId && !layoutSourceLLMNodeId) {
    return { nodes: syncConnectionDerivedNodeData(finalNodes, edges) }
  }

  let laidOutNodes = finalNodes
  if (layoutSourceGenerateNodeId) {
    laidOutNodes = layoutGeneratedPreviewNodesInContext(laidOutNodes, layoutSourceGenerateNodeId)
  }
  if (layoutSourceLLMNodeId) {
    laidOutNodes = layoutLLMOutputTextNodesInContext(laidOutNodes, layoutSourceLLMNodeId)
  }

  return {
    nodes: syncConnectionDerivedNodeData(laidOutNodes, edges),
  }
}
