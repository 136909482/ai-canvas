import type { Edge, Node } from '@xyflow/react'
import type { WorkflowTemplate, WorkflowTemplateLibrary } from '../../types/index.ts'

const NODE_ID_FIELDS = new Set([
  'connectedTextNode',
  'firstFrameSourceNodeId',
  'lastFrameSourceNodeId',
  'maskSourceNodeId',
  'outputNodeId',
  'sourceGenerateNodeId',
  'sourceImageNodeId',
  'sourceLLMNodeId',
])

const NODE_ID_ARRAY_FIELDS = new Set([
  'inputImageSourceOrder',
  'outputNodeIds',
  'outputPreviewNodeIds',
  'referenceSourceOrder',
])

export interface WorkflowTemplateDraft {
  nodes: Node[]
  edges: Edge[]
}

export interface InstantiatedWorkflowTemplate extends WorkflowTemplateDraft {
  nodeIds: string[]
}

function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

function getNodeWidth(node: Node) {
  return Number(node.measured?.width ?? node.width ?? node.style?.width ?? 0) || 0
}

function getNodeHeight(node: Node) {
  return Number(node.measured?.height ?? node.height ?? node.style?.height ?? 0) || 0
}

function isInsideGroup(node: Node, group: Node) {
  return node.type !== 'groupNode'
    && node.position.x >= group.position.x
    && node.position.y >= group.position.y
    && node.position.x + getNodeWidth(node) <= group.position.x + getNodeWidth(group)
    && node.position.y + getNodeHeight(node) <= group.position.y + getNodeHeight(group)
}

function collectSelectedNodeIds(nodes: Node[]) {
  const selectedIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id))
  for (const group of nodes.filter((node) => node.selected && node.type === 'groupNode')) {
    for (const node of nodes) {
      if (isInsideGroup(node, group)) selectedIds.add(node.id)
    }
  }
  return selectedIds
}

function sanitizeTemplateNode(node: Node, origin: { x: number; y: number }): Node {
  const nextNode = cloneValue(node)
  delete nextNode.parentId
  delete nextNode.extent
  delete nextNode.dragging
  nextNode.selected = false
  nextNode.position = {
    x: node.position.x - origin.x,
    y: node.position.y - origin.y,
  }
  return nextNode
}

function sanitizeTemplateEdge(edge: Edge): Edge {
  const nextEdge = cloneValue(edge)
  delete nextEdge.selected
  return nextEdge
}

export function captureSelectedWorkflowTemplate(nodes: Node[], edges: Edge[]): WorkflowTemplateDraft | null {
  const selectedIds = collectSelectedNodeIds(nodes)
  if (selectedIds.size === 0) return null

  const selectedNodes = nodes.filter((node) => selectedIds.has(node.id))
  const origin = selectedNodes.reduce((current, node) => ({
    x: Math.min(current.x, node.position.x),
    y: Math.min(current.y, node.position.y),
  }), { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY })

  return {
    nodes: selectedNodes.map((node) => sanitizeTemplateNode(node, origin)),
    edges: edges
      .filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))
      .map(sanitizeTemplateEdge),
  }
}

function remapNodeReferences(value: unknown, key: string | null, nodeIdMap: Map<string, string>): unknown {
  if (key && NODE_ID_FIELDS.has(key)) {
    return typeof value === 'string' ? nodeIdMap.get(value) ?? null : value
  }
  if (key && NODE_ID_ARRAY_FIELDS.has(key)) {
    return Array.isArray(value)
      ? value.flatMap((item) => typeof item === 'string' && nodeIdMap.has(item) ? [nodeIdMap.get(item)] : [])
      : []
  }
  if (Array.isArray(value)) {
    return value.map((item) => remapNodeReferences(item, null, nodeIdMap))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      remapNodeReferences(entryValue, entryKey, nodeIdMap),
    ]))
  }
  return value
}

export function instantiateWorkflowTemplate(
  template: WorkflowTemplate,
  anchor: { x: number; y: number },
  nextNodeId: (type: Node['type']) => string | null,
  nextEdgeId: () => string,
): InstantiatedWorkflowTemplate | null {
  const nodeIdMap = new Map<string, string>()
  for (const node of template.nodes) {
    const nextId = nextNodeId(node.type)
    if (!nextId) return null
    nodeIdMap.set(node.id, nextId)
  }

  const nodes = template.nodes.map((node) => ({
    ...cloneValue(node),
    id: nodeIdMap.get(node.id) as string,
    position: {
      x: anchor.x + node.position.x,
      y: anchor.y + node.position.y,
    },
    selected: true,
    data: remapNodeReferences(node.data, null, nodeIdMap) as Record<string, unknown>,
  }))
  const edges = template.edges.flatMap((edge) => {
    const source = nodeIdMap.get(edge.source)
    const target = nodeIdMap.get(edge.target)
    return source && target ? [{
      ...cloneValue(edge),
      id: nextEdgeId(),
      source,
      target,
      selected: false,
    }] : []
  })

  return { nodes, edges, nodeIds: nodes.map((node) => node.id) }
}

export function createWorkflowTemplate(
  name: string,
  draft: WorkflowTemplateDraft,
  now = Date.now(),
  id = `template-${now}-${Math.random().toString(36).slice(2, 8)}`,
): WorkflowTemplate {
  return {
    id,
    name: name.trim(),
    schemaVersion: 1,
    nodes: cloneValue(draft.nodes),
    edges: cloneValue(draft.edges),
    createdAt: now,
    updatedAt: now,
  }
}

export function normalizeWorkflowTemplateLibrary(value: unknown): WorkflowTemplateLibrary {
  const candidate = value as Partial<WorkflowTemplateLibrary> | null
  const templates = candidate?.type === 'ai-canvas-workflow-templates' && candidate.version === 1 && Array.isArray(candidate.templates)
    ? candidate.templates.filter((template): template is WorkflowTemplate => Boolean(
      template
      && typeof template.id === 'string'
      && typeof template.name === 'string'
      && template.schemaVersion === 1
      && Array.isArray(template.nodes)
      && Array.isArray(template.edges)
      && Number.isFinite(template.createdAt)
      && Number.isFinite(template.updatedAt),
    ))
    : []
  return { type: 'ai-canvas-workflow-templates', version: 1, templates }
}
