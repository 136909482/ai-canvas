import type { Edge, Node } from '@xyflow/react'
import type { TextNodeData } from '@/types'
import { buildTextSplitterOutputTextNode } from './canvasNodeCreation'

export interface TextSplitterRuntimeInput {
  nodes: Node[]
  edges: Edge[]
  splitterNodeId: string
  inputText: string
  separator: string
  outputNodeIds: string[]
  nextTextNodeId: () => string | null
}

export interface TextSplitterRuntimeResult {
  nodes: Node[]
  edges: Edge[]
  parts: string[]
  errorMsg: string
}

const EMPTY_INPUT_ERROR = '请先连接或输入需要分割的文本。'
const EMPTY_OUTPUT_ERROR = '没有得到可输出的文本片段。'

export function buildTextSplitterOutputState({
  nodes,
  edges,
  splitterNodeId,
  inputText,
  separator,
  outputNodeIds,
  nextTextNodeId,
}: TextSplitterRuntimeInput): TextSplitterRuntimeResult {
  const parts = (separator ? inputText.split(separator) : [inputText])
    .filter((part) => Boolean(part.trim()))

  if (!inputText.trim()) {
    return {
      nodes: updateSplitterError(nodes, splitterNodeId, EMPTY_INPUT_ERROR),
      edges,
      parts: [],
      errorMsg: EMPTY_INPUT_ERROR,
    }
  }

  if (parts.length === 0) {
    return {
      nodes: updateSplitterError(nodes, splitterNodeId, EMPTY_OUTPUT_ERROR),
      edges,
      parts: [],
      errorMsg: EMPTY_OUTPUT_ERROR,
    }
  }

  const reusableOutputIds = outputNodeIds.filter((outputNodeId) => (
    nodes.some((node) => node.id === outputNodeId && node.type === 'textNode')
  ))
  const nextOutputNodeIds = [...reusableOutputIds]
  const createdNodes: Node<TextNodeData>[] = []

  while (nextOutputNodeIds.length < parts.length) {
    const outputNodeId = nextTextNodeId()
    if (!outputNodeId) {
      break
    }

    nextOutputNodeIds.push(outputNodeId)
    createdNodes.push(buildTextSplitterOutputTextNode(outputNodeId, '', ''))
  }

  const keptOutputIds = nextOutputNodeIds.slice(0, parts.length)
  const removedOutputIds = new Set(outputNodeIds.filter((outputNodeId) => !keptOutputIds.includes(outputNodeId)))
  const outputTextById = new Map(keptOutputIds.map((outputNodeId, index) => [outputNodeId, parts[index]]))
  const existingNodes = nodes
    .filter((node) => !removedOutputIds.has(node.id))
    .map((node) => {
      if (node.id === splitterNodeId) {
        return {
          ...node,
          data: {
            ...node.data,
            outputNodeIds: keptOutputIds,
            lastRunAt: Date.now(),
            errorMsg: '',
          },
        }
      }

      const outputText = outputTextById.get(node.id)
      if (outputText === undefined || node.type !== 'textNode') {
        return node
      }

      const outputIndex = keptOutputIds.indexOf(node.id)
      return buildTextSplitterOutputTextNode(node.id, outputText, `片段 ${outputIndex + 1}`)
    })
  const hydratedCreatedNodes = createdNodes.map((node) => {
    const outputText = outputTextById.get(node.id) ?? ''
    const outputIndex = keptOutputIds.indexOf(node.id)
    return buildTextSplitterOutputTextNode(node.id, outputText, `片段 ${outputIndex + 1}`)
  })
  const nextNodes = [...existingNodes, ...hydratedCreatedNodes]
  const keptEdges = edges.filter((edge) => !removedOutputIds.has(edge.source) && !removedOutputIds.has(edge.target))
  const existingEdgeKeys = new Set(keptEdges.map((edge) => `${edge.source}->${edge.target}`))
  const outputEdges = keptOutputIds
    .filter((outputNodeId) => !existingEdgeKeys.has(`${splitterNodeId}->${outputNodeId}`))
    .map((outputNodeId) => ({
      id: `edge-${splitterNodeId}-${outputNodeId}`,
      source: splitterNodeId,
      target: outputNodeId,
      animated: true,
    }))

  return {
    nodes: nextNodes,
    edges: [...keptEdges, ...outputEdges],
    parts,
    errorMsg: '',
  }
}

function updateSplitterError(nodes: Node[], splitterNodeId: string, errorMsg: string) {
  return nodes.map((node) => (
    node.id === splitterNodeId
      ? { ...node, data: { ...node.data, errorMsg } }
      : node
  ))
}
