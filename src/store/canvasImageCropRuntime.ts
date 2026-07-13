import type { Edge, Node } from '@xyflow/react'
import type { CropTileResult } from '@/features/imageCrop/runtime'
import { getPreviewNodeSize } from '@/features/generateQueue/previewUtils'
import type { GeneratedPreviewNodeData } from '@/types'
import {
  buildCropPreviewNode,
  type CropPreviewNodeDraft,
} from './canvasNodeCreation'

export interface ImageCropOutputStateInput {
  nodes: Node[]
  edges: Edge[]
  cropNodeId: string
  existingPreviewIds: string[]
  previewResults: CropTileResult[]
  rowCount: number
  columnCount: number
  horizontalCuts: number[]
  verticalCuts: number[]
  nextPreviewId: () => string | null
}

export interface ImageCropOutputStateResult {
  nodes: Node[]
  edges: Edge[]
}

export function buildImageCropOutputState({
  nodes,
  edges,
  cropNodeId,
  existingPreviewIds,
  previewResults,
  rowCount,
  columnCount,
  horizontalCuts,
  verticalCuts,
  nextPreviewId,
}: ImageCropOutputStateInput): ImageCropOutputStateResult {
  const existingPreviewById = new Map(
    existingPreviewIds
      .map((previewId) => nodes.find((node) => node.id === previewId && node.type === 'generatedPreviewNode'))
      .filter((node): node is Node<GeneratedPreviewNodeData> => Boolean(node))
      .map((node) => [node.id, node]),
  )
  const nextPreviewIds: string[] = []
  const previewNodeById = new Map<string, Node<GeneratedPreviewNodeData>>()

  for (const previewNodeId of existingPreviewIds) {
    const previewNode = existingPreviewById.get(previewNodeId)
    if (previewNode) {
      previewNodeById.set(previewNodeId, previewNode)
    }
  }

  for (let index = 0; index < previewResults.length; index += 1) {
    const previewResult = previewResults[index]
    const previewSize = getPreviewNodeSize(previewResult.width, previewResult.height)
    const existingPreviewId = existingPreviewIds[index]
    const previewDraft: CropPreviewNodeDraft = {
      label: `\u88c1\u5207 ${previewResult.row + 1}-${previewResult.column + 1}`,
      imageUrl: previewResult.imageUrl,
      imageAsset: previewResult.imageAsset,
      ratio: previewResult.ratio,
      imageWidth: previewResult.width,
      imageHeight: previewResult.height,
      createdAt: Date.now() + index,
    }

    if (existingPreviewId && previewNodeById.has(existingPreviewId)) {
      const existingPreviewNode = previewNodeById.get(existingPreviewId)
      if (!existingPreviewNode) {
        continue
      }

      previewNodeById.set(
        existingPreviewId,
        {
          ...buildCropPreviewNode(
            existingPreviewId,
            cropNodeId,
            {
              ...previewDraft,
              createdAt: typeof existingPreviewNode.data?.createdAt === 'number'
                ? existingPreviewNode.data.createdAt
                : previewDraft.createdAt,
            },
            previewSize,
          ),
          position: existingPreviewNode.position,
          selected: existingPreviewNode.selected,
        },
      )
      nextPreviewIds.push(existingPreviewId)
      continue
    }

    const previewId = nextPreviewId()
    if (!previewId) {
      continue
    }

    nextPreviewIds.push(previewId)
    previewNodeById.set(previewId, buildCropPreviewNode(previewId, cropNodeId, previewDraft, previewSize))
  }

  const removedPreviewIds = new Set(existingPreviewIds.filter((previewId) => !nextPreviewIds.includes(previewId)))
  const nextNodes = nodes
    .filter((node) => !removedPreviewIds.has(node.id) && !previewNodeById.has(node.id))
    .map((node) => {
      if (node.id !== cropNodeId || node.type !== 'imageCropNode') {
        return node
      }

      return {
        ...node,
        data: {
          ...node.data,
          rowCount,
          columnCount,
          horizontalCuts,
          verticalCuts,
          outputPreviewNodeIds: nextPreviewIds,
          lastRunAt: Date.now(),
          status: 'done',
          errorMsg: '',
        },
      }
    })
  const existingEdgeKeys = new Set(
    edges
      .filter((edge) => !removedPreviewIds.has(edge.source) && !removedPreviewIds.has(edge.target))
      .map((edge) => `${edge.source}->${edge.target}`),
  )
  const outputEdges = nextPreviewIds
    .filter((previewId) => !existingEdgeKeys.has(`${cropNodeId}->${previewId}`))
    .map((previewId) => ({
      id: `edge-${cropNodeId}-${previewId}`,
      source: cropNodeId,
      target: previewId,
      animated: true,
    }))

  return {
    nodes: [
      ...nextNodes,
      ...nextPreviewIds
        .map((previewId) => previewNodeById.get(previewId))
        .filter((node): node is Node<GeneratedPreviewNodeData> => Boolean(node)),
    ],
    edges: [
      ...edges.filter((edge) => !removedPreviewIds.has(edge.source) && !removedPreviewIds.has(edge.target)),
      ...outputEdges,
    ],
  }
}
