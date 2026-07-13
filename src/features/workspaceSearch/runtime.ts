import type { Node } from '@xyflow/react'
import type { ProjectRecord } from '../../types/index.ts'
import type { WorkspaceSearchEntry, WorkspaceSearchKind, WorkspaceSearchQuery } from '../../platform/types.ts'

export interface WorkspaceSearchDocument {
  documentId: string
  projectId: string
  projectName: string
  nodeId: string | null
  nodeType: string | null
  kind: WorkspaceSearchKind
  title: string
  content: string
  assetRelativePath: string | null
  updatedAt: number
}

function stringValue(value: unknown) {
  return typeof value === 'string' && !value.startsWith('data:') ? value.trim() : ''
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function getAssetRelativePath(node: Node) {
  const data = node.data as Record<string, unknown>
  const asset = node.type === 'videoNode' ? data.videoAsset : data.imageAsset
  return asset && typeof asset === 'object' ? stringValue((asset as Record<string, unknown>).relativePath) : ''
}

function getNodeTitle(node: Node) {
  const data = node.data as Record<string, unknown>
  return stringValue(data.name)
    || stringValue(data.label)
    || stringValue(data.title)
    || stringValue(data.prompt).slice(0, 80)
    || node.type
    || '节点'
}

function collectTextFields(node: Node) {
  const data = node.data as Record<string, unknown>
  const fields = [
    data.text,
    data.label,
    data.prompt,
    data.negativePrompt,
    data.instructionPrompt,
    data.inputText,
    data.outputText,
    data.outputJson,
    data.description,
    data.model,
    data.resolution,
    data.source,
    ...stringArray(data.parts),
    ...stringArray(data.tags),
  ]
  return fields.map(stringValue).filter(Boolean)
}

function isAssetNode(node: Node) {
  return Boolean(getAssetRelativePath(node)) || [
    'imageNode',
    'videoNode',
    'generatedPreviewNode',
    'testImageNode',
    'panoramaNode',
  ].includes(node.type ?? '')
}

export function extractProjectSearchDocuments(project: ProjectRecord): WorkspaceSearchDocument[] {
  if (project.archivedAt) return []
  const documents: WorkspaceSearchDocument[] = [{
    documentId: `${project.id}:project`,
    projectId: project.id,
    projectName: project.name,
    nodeId: null,
    nodeType: null,
    kind: 'project',
    title: project.name,
    content: project.name,
    assetRelativePath: null,
    updatedAt: project.updatedAt,
  }]

  for (const node of project.workingSnapshot.canvas.nodes) {
    const title = getNodeTitle(node)
    const textFields = collectTextFields(node)
    if (textFields.length > 0) {
      documents.push({
        documentId: `${project.id}:node:${node.id}:text`,
        projectId: project.id,
        projectName: project.name,
        nodeId: node.id,
        nodeType: node.type ?? null,
        kind: 'text',
        title,
        content: textFields.join('\n'),
        assetRelativePath: null,
        updatedAt: project.updatedAt,
      })
    }
    if (isAssetNode(node)) {
      const relativePath = getAssetRelativePath(node)
      const data = node.data as Record<string, unknown>
      const assetFields = [title, relativePath, data.model, data.resolution, data.source, ...stringArray(data.tags)]
        .map(stringValue)
        .filter(Boolean)
      documents.push({
        documentId: `${project.id}:node:${node.id}:asset`,
        projectId: project.id,
        projectName: project.name,
        nodeId: node.id,
        nodeType: node.type ?? null,
        kind: 'asset',
        title,
        content: assetFields.join('\n'),
        assetRelativePath: relativePath || null,
        updatedAt: project.updatedAt,
      })
    }
  }
  return documents
}

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim()
}

function buildSnippet(content: string, tokens: string[]) {
  const compact = content.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  const normalized = compact.toLocaleLowerCase()
  const matchIndex = tokens.reduce((best, token) => {
    const index = normalized.indexOf(token)
    return index >= 0 && (best < 0 || index < best) ? index : best
  }, -1)
  const start = Math.max(0, matchIndex - 36)
  const snippet = compact.slice(start, start + 150)
  return `${start > 0 ? '...' : ''}${snippet}${start + 150 < compact.length ? '...' : ''}`
}

export function searchWorkspaceDocuments(documents: WorkspaceSearchDocument[], query: WorkspaceSearchQuery): WorkspaceSearchEntry[] {
  const tokens = normalize(query.text).split(' ').filter(Boolean)
  if (tokens.length === 0) return []
  const kinds = new Set(query.kinds ?? [])
  const nodeTypes = new Set(query.nodeTypes ?? [])
  const limit = Math.max(1, Math.min(100, Math.trunc(query.limit ?? 50)))

  return documents.flatMap((document) => {
    if (kinds.size > 0 && !kinds.has(document.kind)) return []
    if (nodeTypes.size > 0 && (!document.nodeType || !nodeTypes.has(document.nodeType))) return []
    const title = normalize(document.title)
    const content = normalize(`${document.projectName}\n${document.title}\n${document.content}`)
    if (!tokens.every((token) => content.includes(token))) return []
    const score = tokens.reduce((total, token) => (
      total + (title === token ? 40 : title.startsWith(token) ? 24 : title.includes(token) ? 12 : 4)
    ), document.kind === 'project' ? 8 : 0)
    return [{
      documentId: document.documentId,
      projectId: document.projectId,
      projectName: document.projectName,
      nodeId: document.nodeId,
      nodeType: document.nodeType,
      kind: document.kind,
      title: document.title,
      snippet: buildSnippet(document.content, tokens),
      assetRelativePath: document.assetRelativePath,
      updatedAt: document.updatedAt,
      score,
    } satisfies WorkspaceSearchEntry]
  }).sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt || left.documentId.localeCompare(right.documentId)).slice(0, limit)
}
