import type { Edge, Node } from '@xyflow/react'
import { collectMentionedSourceIds } from '@/features/richPrompt/promptCompiler'
import type { RichPromptDocument } from '@/features/richPrompt/types'
import type {
  GeneratedPreviewNodeData,
  ImageNodeData,
  LLMOutputTextNodeData,
  TestImageNodeData,
  TextNodeData,
} from '@/types'
import { getOrderedStringIds, sanitizeRichPrompt } from './canvasNodeData'

const nodeByIdCache = new WeakMap<Node[], Map<string, Node>>()

export function getCanvasNodeById(nodes: Node[], nodeId: string | null | undefined) {
  if (!nodeId) {
    return undefined
  }

  let nodeById = nodeByIdCache.get(nodes)
  if (!nodeById) {
    nodeById = new Map(nodes.map((node) => [node.id, node]))
    nodeByIdCache.set(nodes, nodeById)
  }

  return nodeById.get(nodeId)
}

export function isConnectedImageSourceNode(node: Node | undefined): node is Node<ImageNodeData | GeneratedPreviewNodeData | TestImageNodeData> {
  return Boolean(
    node
    && (node.type === 'imageNode' || node.type === 'generatedPreviewNode' || node.type === 'testImageNode')
    && typeof node.data?.imageUrl === 'string'
    && node.data.imageUrl,
  )
}

function getOrderedImageSourceNodes(nodes: Node[], sourceIds: string[]) {
  return sourceIds
    .map((sourceId) => getCanvasNodeById(nodes, sourceId))
    .filter(isConnectedImageSourceNode)
}

export function getGenerateReferenceSourceNodes(nodes: Node[], nodeId: string) {
  const targetNode = getCanvasNodeById(nodes, nodeId)
  if (targetNode?.type !== 'generateNode') {
    return []
  }

  const directReferenceSourceIds = getOrderedStringIds(targetNode?.data?.referenceSourceOrder)
  const mentionedReferenceSourceIds = Array.from(collectMentionedSourceIds(sanitizeRichPrompt(targetNode?.data)))
  return getOrderedImageSourceNodes(
    nodes,
    [
      ...directReferenceSourceIds,
      ...mentionedReferenceSourceIds.filter((sourceId) => !directReferenceSourceIds.includes(sourceId)),
    ],
  )
}

export function getGenerateMaskSourceNode(nodes: Node[], nodeId: string) {
  const targetNode = getCanvasNodeById(nodes, nodeId)
  if (targetNode?.type !== 'generateNode') {
    return null
  }

  const maskSourceNodeId = typeof targetNode?.data?.maskSourceNodeId === 'string' ? targetNode.data.maskSourceNodeId : ''
  const maskSourceNode = getCanvasNodeById(nodes, maskSourceNodeId)
  return isConnectedImageSourceNode(maskSourceNode) ? maskSourceNode : null
}

export function getImageEditReferenceSourceNodes(nodes: Node[], nodeId: string) {
  const targetNode = getCanvasNodeById(nodes, nodeId)
  if (targetNode?.type !== 'imageEditNode') {
    return []
  }

  return getOrderedImageSourceNodes(nodes, getOrderedStringIds(targetNode?.data?.referenceSourceOrder))
}

export function getLLMInputImageSourceNodes(nodes: Node[], nodeId: string) {
  const targetNode = getCanvasNodeById(nodes, nodeId)
  if (targetNode?.type !== 'llmNode' && targetNode?.type !== 'llmFileNode') {
    return []
  }

  return getOrderedImageSourceNodes(nodes, getOrderedStringIds(targetNode?.data?.inputImageSourceOrder))
}

export function isTextSourceNode(node: Node | undefined): node is Node<TextNodeData | LLMOutputTextNodeData> {
  return Boolean(node && (node.type === 'textNode' || node.type === 'llmOutputTextNode' || node.type === 'inlineTextSplitterNode'))
}

export function getTextFromSourceEdge(nodes: Node[], edge: Edge | undefined) {
  if (!edge?.source) {
    return { sourceId: null as string | null, text: '', richPrompt: null as RichPromptDocument | null }
  }

  const sourceNode = getCanvasNodeById(nodes, edge.source)

  if (!isTextSourceNode(sourceNode)) {
    return { sourceId: null as string | null, text: '', richPrompt: null as RichPromptDocument | null }
  }

  if (sourceNode.type === 'inlineTextSplitterNode') {
    const match = /^part-(\d+)$/.exec(typeof edge.sourceHandle === 'string' ? edge.sourceHandle : '')
    const partIndex = match ? Number(match[1]) : -1
    const parts = Array.isArray(sourceNode.data?.parts)
      ? sourceNode.data.parts.filter((part): part is string => typeof part === 'string')
      : []
    return {
      sourceId: sourceNode.id,
      text: partIndex >= 0 ? parts[partIndex] ?? '' : '',
      richPrompt: null,
    }
  }

  return {
    sourceId: sourceNode.id,
    text: typeof sourceNode.data?.text === 'string' ? sourceNode.data.text : '',
    richPrompt: sourceNode.type === 'textNode' ? sanitizeRichPrompt(sourceNode.data) : null,
  }
}
