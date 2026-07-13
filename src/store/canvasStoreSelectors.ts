import type { Edge, Node } from '@xyflow/react'
import {
  getGenerateMaskSourceNode,
  getGenerateReferenceSourceNodes,
  getImageEditReferenceSourceNodes,
  getLLMInputImageSourceNodes,
} from './canvasConnectionSources'

export const selectSelectedTopLevelNodes = ({ nodes }: { nodes: Node[] }) => (
  nodes.filter((node) => node.selected && node.type !== 'groupNode')
)

export const selectSelectedGroupNodes = ({ nodes }: { nodes: Node[] }) => (
  nodes.filter((node) => node.selected && node.type === 'groupNode')
)

export const selectHasCanvasContent = ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => (
  nodes.length > 0 || edges.length > 0
)

export const makeSelectGenerateReferenceSourceNodes = (nodeId: string) => ({ nodes }: { nodes: Node[] }) => (
  getGenerateReferenceSourceNodes(nodes, nodeId)
)

export const makeSelectGenerateMaskSourceNode = (nodeId: string) => ({ nodes }: { nodes: Node[] }) => (
  getGenerateMaskSourceNode(nodes, nodeId)
)

export const makeSelectImageEditReferenceSourceNodes = (nodeId: string) => ({ nodes }: { nodes: Node[] }) => (
  getImageEditReferenceSourceNodes(nodes, nodeId)
)

export const makeSelectLLMInputImageSourceNodes = (nodeId: string) => ({ nodes }: { nodes: Node[] }) => (
  getLLMInputImageSourceNodes(nodes, nodeId)
)
