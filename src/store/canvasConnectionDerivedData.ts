import type { Edge, Node } from '@xyflow/react'
import { createRichPromptDocumentFromText } from '@/features/richPrompt/promptCompiler'
import { sanitizeRichPrompt } from './canvasNodeData'
import {
  getCanvasNodeById,
  getTextFromSourceEdge,
  isConnectedImageSourceNode,
  isTextSourceNode,
} from './canvasConnectionSources'

export function syncConnectionDerivedNodeData(nodes: Node[], edges: Edge[]) {
  let nextNodes = nodes
  let hasChanges = false

  const generateNodes = nextNodes.filter((node) => node.type === 'generateNode')

  for (const node of generateNodes) {
    const incomingImageEdges = edges.filter((edge) => edge.target === node.id && typeof edge.source === 'string')
    const connectedReferenceSourceIds = incomingImageEdges
      .filter((edge) => edge.targetHandle !== 'mask')
      .map((edge) => {
        const sourceNode = getCanvasNodeById(nextNodes, edge.source)
        return sourceNode?.type === 'imageNode' || sourceNode?.type === 'generatedPreviewNode' || sourceNode?.type === 'testImageNode'
          ? edge.source
          : null
      })
      .filter((sourceId, index, sourceIds): sourceId is string => Boolean(sourceId) && sourceIds.indexOf(sourceId) === index)
    const maskInputEnabled = node.data?.maskInputEnabled === true
    const incomingMaskEdge = maskInputEnabled
      ? incomingImageEdges.find((edge) => (
        edge.targetHandle === 'mask'
        && isConnectedImageSourceNode(getCanvasNodeById(nextNodes, edge.source))
      ))
      : undefined
    const nextMaskSourceNodeId = typeof incomingMaskEdge?.source === 'string' ? incomingMaskEdge.source : null
    const currentReferenceSourceOrder = Array.isArray(node.data?.referenceSourceOrder)
      ? node.data.referenceSourceOrder.filter((sourceId): sourceId is string => typeof sourceId === 'string')
      : []
    const nextReferenceSourceOrder = [
      ...currentReferenceSourceOrder.filter((sourceId) => connectedReferenceSourceIds.includes(sourceId)),
      ...connectedReferenceSourceIds.filter((sourceId) => !currentReferenceSourceOrder.includes(sourceId)),
    ]
    const incomingTextEdge = edges.find((edge) => edge.target === node.id && isTextSourceNode(getCanvasNodeById(nextNodes, edge.source)))
    const { sourceId: connectedTextNodeId, text: connectedText, richPrompt: connectedRichPrompt } = getTextFromSourceEdge(nextNodes, incomingTextEdge)

    const currentPrompt = typeof node.data?.prompt === 'string' ? node.data.prompt : ''
    const currentConnectedId = typeof node.data?.connectedTextNode === 'string'
      ? node.data.connectedTextNode
      : null
    const currentMaskSourceNodeId = typeof node.data?.maskSourceNodeId === 'string' ? node.data.maskSourceNodeId : null
    const nextPatch: Record<string, unknown> = {}

    if (
      currentReferenceSourceOrder.length !== nextReferenceSourceOrder.length
      || currentReferenceSourceOrder.some((sourceId, index) => sourceId !== nextReferenceSourceOrder[index])
    ) {
      nextPatch.referenceSourceOrder = nextReferenceSourceOrder
    }

    if (currentMaskSourceNodeId !== nextMaskSourceNodeId) {
      nextPatch.maskSourceNodeId = nextMaskSourceNodeId
    }

    if (connectedTextNodeId) {
      if (currentConnectedId !== connectedTextNodeId || currentPrompt !== connectedText) {
        nextPatch.connectedTextNode = connectedTextNodeId
        nextPatch.prompt = connectedText
        nextPatch.richPrompt = connectedRichPrompt ?? createRichPromptDocumentFromText(connectedText)
      }
    } else if (currentConnectedId !== null) {
      nextPatch.connectedTextNode = null
    }

    if (Object.keys(nextPatch).length === 0) {
      continue
    }

    hasChanges = true
    nextNodes = nextNodes.map((candidate) => (
      candidate.id === node.id
        ? {
          ...candidate,
          data: {
            ...candidate.data,
            ...nextPatch,
          },
        }
        : candidate
    ))
  }

  const videoGenerateNodes = nextNodes.filter((node) => node.type === 'videoGenerateNode')

  for (const node of videoGenerateNodes) {
    const incomingEdges = edges.filter((edge) => edge.target === node.id && typeof edge.source === 'string')
    const incomingTextEdge = incomingEdges.find((edge) => (edge.targetHandle === 'input' || edge.targetHandle === 'prompt') && isTextSourceNode(getCanvasNodeById(nextNodes, edge.source)))
    const connectedImageSourceIds = incomingEdges
      .filter((edge) => edge.targetHandle === 'input' || edge.targetHandle === 'image' || edge.targetHandle === 'firstFrame' || edge.targetHandle === 'lastFrame')
      .map((edge) => {
        const sourceNode = getCanvasNodeById(nextNodes, edge.source)
        return isConnectedImageSourceNode(sourceNode) ? edge.source : null
      })
      .filter((sourceId, index, sourceIds): sourceId is string => Boolean(sourceId) && sourceIds.indexOf(sourceId) === index)
    const currentReferenceSourceOrder = Array.isArray(node.data?.referenceSourceOrder)
      ? node.data.referenceSourceOrder.filter((sourceId): sourceId is string => typeof sourceId === 'string')
      : []
    const nextReferenceSourceOrder = [
      ...currentReferenceSourceOrder.filter((sourceId) => connectedImageSourceIds.includes(sourceId)),
      ...connectedImageSourceIds.filter((sourceId) => !currentReferenceSourceOrder.includes(sourceId)),
    ]
    const { sourceId: connectedTextNodeId, text: connectedText } = getTextFromSourceEdge(nextNodes, incomingTextEdge)
    const currentPrompt = typeof node.data?.prompt === 'string' ? node.data.prompt : ''
    const currentConnectedId = typeof node.data?.connectedTextNode === 'string'
      ? node.data.connectedTextNode
      : null
    const currentFirstFrameSourceNodeId = typeof node.data?.firstFrameSourceNodeId === 'string' ? node.data.firstFrameSourceNodeId : null
    const currentLastFrameSourceNodeId = typeof node.data?.lastFrameSourceNodeId === 'string' ? node.data.lastFrameSourceNodeId : null
    const nextFirstFrameSourceNodeId = nextReferenceSourceOrder[0] ?? null
    const nextLastFrameSourceNodeId = nextReferenceSourceOrder[1] ?? null
    const nextPatch: Record<string, unknown> = {}

    if (
      currentReferenceSourceOrder.length !== nextReferenceSourceOrder.length
      || currentReferenceSourceOrder.some((sourceId, index) => sourceId !== nextReferenceSourceOrder[index])
    ) {
      nextPatch.referenceSourceOrder = nextReferenceSourceOrder
    }

    if (currentFirstFrameSourceNodeId !== nextFirstFrameSourceNodeId) {
      nextPatch.firstFrameSourceNodeId = nextFirstFrameSourceNodeId
    }

    if (currentLastFrameSourceNodeId !== nextLastFrameSourceNodeId) {
      nextPatch.lastFrameSourceNodeId = nextLastFrameSourceNodeId
    }

    if (connectedTextNodeId) {
      if (currentConnectedId !== connectedTextNodeId || currentPrompt !== connectedText) {
        nextPatch.connectedTextNode = connectedTextNodeId
        nextPatch.prompt = connectedText
      }
    } else if (currentConnectedId !== null) {
      nextPatch.connectedTextNode = null
    }

    if (Object.keys(nextPatch).length === 0) {
      continue
    }

    hasChanges = true
    nextNodes = nextNodes.map((candidate) => (
      candidate.id === node.id
        ? {
          ...candidate,
          data: {
            ...candidate.data,
            ...nextPatch,
          },
        }
        : candidate
    ))
  }

  const imageEditNodes = nextNodes.filter((node) => node.type === 'imageEditNode')

  for (const node of imageEditNodes) {
    const incomingEdges = edges.filter((edge) => edge.target === node.id && typeof edge.source === 'string')
    const incomingBaseEdge = incomingEdges.find((edge) => (
      edge.targetHandle === 'base'
      && isConnectedImageSourceNode(getCanvasNodeById(nextNodes, edge.source))
    ))
    const nextSourceImageNodeId = typeof incomingBaseEdge?.source === 'string' ? incomingBaseEdge.source : null
    const connectedReferenceSourceIds = incomingEdges
      .filter((edge) => edge.targetHandle === 'reference')
      .map((edge) => {
        const sourceNode = getCanvasNodeById(nextNodes, edge.source)
        return sourceNode?.type === 'imageNode' || sourceNode?.type === 'generatedPreviewNode' || sourceNode?.type === 'testImageNode'
          ? edge.source
          : null
      })
      .filter((sourceId, index, sourceIds): sourceId is string => Boolean(sourceId) && sourceIds.indexOf(sourceId) === index)
    const currentSourceImageNodeId = typeof node.data?.sourceImageNodeId === 'string' ? node.data.sourceImageNodeId : null
    const currentReferenceSourceOrder = Array.isArray(node.data?.referenceSourceOrder)
      ? node.data.referenceSourceOrder.filter((sourceId): sourceId is string => typeof sourceId === 'string')
      : []
    const nextReferenceSourceOrder = [
      ...currentReferenceSourceOrder.filter((sourceId) => connectedReferenceSourceIds.includes(sourceId)),
      ...connectedReferenceSourceIds.filter((sourceId) => !currentReferenceSourceOrder.includes(sourceId)),
    ]
    const nextPatch: Record<string, unknown> = {}

    if (currentSourceImageNodeId !== nextSourceImageNodeId) {
      nextPatch.sourceImageNodeId = nextSourceImageNodeId
    }

    if (
      currentReferenceSourceOrder.length !== nextReferenceSourceOrder.length
      || currentReferenceSourceOrder.some((sourceId, index) => sourceId !== nextReferenceSourceOrder[index])
    ) {
      nextPatch.referenceSourceOrder = nextReferenceSourceOrder
    }

    if (Object.keys(nextPatch).length === 0) {
      continue
    }

    hasChanges = true
    nextNodes = nextNodes.map((candidate) => (
      candidate.id === node.id
        ? {
          ...candidate,
          data: {
            ...candidate.data,
            ...nextPatch,
          },
        }
        : candidate
    ))
  }

  const llmNodes = nextNodes.filter((node) => node.type === 'llmNode' || node.type === 'llmFileNode')

  for (const node of llmNodes) {
    const incomingEdges = edges.filter((edge) => edge.target === node.id && typeof edge.source === 'string')
    const connectedImageSourceIds = incomingEdges
      .map((edge) => {
        const sourceNode = getCanvasNodeById(nextNodes, edge.source)
        return sourceNode?.type === 'imageNode' || sourceNode?.type === 'generatedPreviewNode' || sourceNode?.type === 'testImageNode'
          ? edge.source
          : null
      })
      .filter((sourceId, index, sourceIds): sourceId is string => Boolean(sourceId) && sourceIds.indexOf(sourceId) === index)
    const currentInputImageSourceOrder = Array.isArray(node.data?.inputImageSourceOrder)
      ? node.data.inputImageSourceOrder.filter((sourceId): sourceId is string => typeof sourceId === 'string')
      : []
    const nextInputImageSourceOrder = [
      ...currentInputImageSourceOrder.filter((sourceId) => connectedImageSourceIds.includes(sourceId)),
      ...connectedImageSourceIds.filter((sourceId) => !currentInputImageSourceOrder.includes(sourceId)),
    ]
    const incomingTextEdge = incomingEdges.find((edge) => isTextSourceNode(getCanvasNodeById(nextNodes, edge.source)))
    const { sourceId: connectedTextNodeId, text: connectedText, richPrompt: connectedRichPrompt } = getTextFromSourceEdge(nextNodes, incomingTextEdge)
    const currentInputText = typeof node.data?.inputText === 'string' ? node.data.inputText : ''
    const currentConnectedId = typeof node.data?.connectedTextNode === 'string'
      ? node.data.connectedTextNode
      : null
    const nextPatch: Record<string, unknown> = {}

    if (
      currentInputImageSourceOrder.length !== nextInputImageSourceOrder.length
      || currentInputImageSourceOrder.some((sourceId, index) => sourceId !== nextInputImageSourceOrder[index])
    ) {
      nextPatch.inputImageSourceOrder = nextInputImageSourceOrder
    }

    if (connectedTextNodeId) {
      const nextInputRichPrompt = connectedRichPrompt ?? createRichPromptDocumentFromText(connectedText)
      const currentInputRichPrompt = sanitizeRichPrompt({ richPrompt: node.data?.inputRichPrompt })
      if (currentConnectedId !== connectedTextNodeId || currentInputText !== connectedText || currentInputRichPrompt !== nextInputRichPrompt) {
        nextPatch.connectedTextNode = connectedTextNodeId
        nextPatch.inputText = connectedText
        nextPatch.inputRichPrompt = nextInputRichPrompt
      }
    } else {
      if (currentConnectedId !== null) {
        nextPatch.connectedTextNode = null
      }

      if (currentInputText !== '') {
        nextPatch.inputText = ''
      }

      if (node.data?.inputRichPrompt) {
        nextPatch.inputRichPrompt = null
      }
    }

    if (Object.keys(nextPatch).length === 0) {
      continue
    }

    hasChanges = true
    nextNodes = nextNodes.map((candidate) => (
      candidate.id === node.id
        ? {
          ...candidate,
          data: {
            ...candidate.data,
            ...nextPatch,
          },
        }
        : candidate
    ))
  }

  const textSplitterNodes = nextNodes.filter((node) => node.type === 'textSplitterNode' || node.type === 'inlineTextSplitterNode')

  for (const node of textSplitterNodes) {
    const incomingTextEdge = edges.find((edge) => edge.target === node.id && isTextSourceNode(getCanvasNodeById(nextNodes, edge.source)))
    const { sourceId: connectedTextNodeId, text: connectedText } = getTextFromSourceEdge(nextNodes, incomingTextEdge)
    const currentInputText = typeof node.data?.inputText === 'string' ? node.data.inputText : ''
    const currentConnectedId = typeof node.data?.connectedTextNode === 'string'
      ? node.data.connectedTextNode
      : null
    const nextPatch: Record<string, unknown> = {}

    if (connectedTextNodeId) {
      if (currentConnectedId !== connectedTextNodeId || currentInputText !== connectedText) {
        nextPatch.connectedTextNode = connectedTextNodeId
        nextPatch.inputText = connectedText
      }
    } else {
      if (currentConnectedId !== null) {
        nextPatch.connectedTextNode = null
      }

      if (currentInputText !== '') {
        nextPatch.inputText = ''
      }
    }

    if (Object.keys(nextPatch).length === 0) {
      continue
    }

    hasChanges = true
    nextNodes = nextNodes.map((candidate) => (
      candidate.id === node.id
        ? {
          ...candidate,
          data: {
            ...candidate.data,
            ...nextPatch,
          },
        }
        : candidate
    ))
  }

  const imageCropNodes = nextNodes.filter((node) => node.type === 'imageCropNode')

  for (const node of imageCropNodes) {
    const incomingImageEdge = edges.find((edge) => edge.target === node.id && isConnectedImageSourceNode(getCanvasNodeById(nextNodes, edge.source)))
    const nextSourceImageNodeId = typeof incomingImageEdge?.source === 'string' ? incomingImageEdge.source : null
    const currentSourceImageNodeId = typeof node.data?.sourceImageNodeId === 'string' ? node.data.sourceImageNodeId : null

    if (currentSourceImageNodeId === nextSourceImageNodeId) {
      continue
    }

    hasChanges = true
    nextNodes = nextNodes.map((candidate) => (
      candidate.id === node.id
        ? {
          ...candidate,
          data: {
            ...candidate.data,
            sourceImageNodeId: nextSourceImageNodeId,
          },
        }
        : candidate
    ))
  }

  const panoramaNodes = nextNodes.filter((node) => node.type === 'panoramaNode')

  for (const node of panoramaNodes) {
    const incomingImageEdge = edges.find((edge) => edge.target === node.id && isConnectedImageSourceNode(getCanvasNodeById(nextNodes, edge.source)))
    const nextSourceImageNodeId = typeof incomingImageEdge?.source === 'string' ? incomingImageEdge.source : null
    const currentSourceImageNodeId = typeof node.data?.sourceImageNodeId === 'string' ? node.data.sourceImageNodeId : null

    if (currentSourceImageNodeId === nextSourceImageNodeId) {
      continue
    }

    hasChanges = true
    nextNodes = nextNodes.map((candidate) => (
      candidate.id === node.id
        ? {
          ...candidate,
          data: {
            ...candidate.data,
            sourceImageNodeId: nextSourceImageNodeId,
          },
        }
        : candidate
    ))
  }

  return hasChanges ? nextNodes : nodes
}

export function buildSyncedGraphState(nodes: Node[], edges: Edge[]) {
  return {
    nodes: syncConnectionDerivedNodeData(nodes, edges),
    edges,
  }
}
