import type { ProjectRecord, ProjectSnapshot, WorkspaceData } from '@/types'

export const SNAPSHOT_WARNING_BYTE_LIMIT = 5 * 1024 * 1024
export const SNAPSHOT_DANGER_BYTE_LIMIT = 25 * 1024 * 1024
export const SNAPSHOT_ERROR_MESSAGE_CHAR_LIMIT = 4_000

export interface SnapshotEmbeddedMediaEntry {
  path: string
  byteSize: number
  mimeType: string
}

export interface SnapshotLargeStringEntry {
  path: string
  byteSize: number
  sourceKind: 'node' | 'task' | 'snapshot'
  sourceId: string | null
  label: string
}

export interface ProjectSnapshotSizeReport {
  serializedByteSize: number
  warningByteLimit: number
  dangerByteLimit: number
  status: 'ok' | 'warning' | 'danger'
  embeddedMediaCount: number
  embeddedMediaByteSize: number
  largestEmbeddedMedia: SnapshotEmbeddedMediaEntry[]
  largeStringCount: number
  largestStrings: SnapshotLargeStringEntry[]
}

const DATA_MEDIA_URL_PATTERN = /^data:((?:image|video)\/[a-zA-Z0-9.+-]+);base64,/
const LARGE_STRING_BYTE_LIMIT = 256 * 1024
const TOP_ENTRY_LIMIT = 5

function getUtf8ByteSize(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function getSnapshotSizeStatus(byteSize: number): ProjectSnapshotSizeReport['status'] {
  if (byteSize >= SNAPSHOT_DANGER_BYTE_LIMIT) {
    return 'danger'
  }

  if (byteSize >= SNAPSHOT_WARNING_BYTE_LIMIT) {
    return 'warning'
  }

  return 'ok'
}

function estimateBase64PayloadBytes(value: string) {
  const commaIndex = value.indexOf(',')
  if (commaIndex < 0) {
    return getUtf8ByteSize(value)
  }

  const payload = value.slice(commaIndex + 1).replace(/\s/g, '')
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor(payload.length * 3 / 4) - padding)
}

function sortByByteSizeDescending<T extends { byteSize: number }>(entries: T[]) {
  return [...entries]
    .sort((left, right) => right.byteSize - left.byteSize)
    .slice(0, TOP_ENTRY_LIMIT)
}

function walkSnapshotStrings(
  value: unknown,
  path: string,
  snapshot: ProjectSnapshot,
  embeddedMedia: SnapshotEmbeddedMediaEntry[],
  largeStrings: SnapshotLargeStringEntry[],
) {
  if (typeof value === 'string') {
    const mediaMatch = DATA_MEDIA_URL_PATTERN.exec(value)
    if (mediaMatch) {
      embeddedMedia.push({
        path,
        mimeType: mediaMatch[1],
        byteSize: estimateBase64PayloadBytes(value),
      })
      return
    }

    const byteSize = getUtf8ByteSize(value)
    if (byteSize >= LARGE_STRING_BYTE_LIMIT) {
      largeStrings.push(describeLargeString(snapshot, path, byteSize))
    }
    return
  }

  if (!value || typeof value !== 'object') {
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkSnapshotStrings(item, `${path}[${index}]`, snapshot, embeddedMedia, largeStrings)
    })
    return
  }

  for (const [key, childValue] of Object.entries(value)) {
    walkSnapshotStrings(childValue, path ? `${path}.${key}` : key, snapshot, embeddedMedia, largeStrings)
  }
}

const NODE_FIELD_LABELS: Record<string, string> = {
  text: '文本正文',
  prompt: '提示词',
  instructionPrompt: '指令提示词',
  systemPrompt: '系统提示词',
  inputText: '输入文本',
  negativePrompt: '反向提示词',
  content: '正文',
}

function describeLargeString(snapshot: ProjectSnapshot, path: string, byteSize: number): SnapshotLargeStringEntry {
  const nodeMatch = /^snapshot\.canvas\.nodes\[(\d+)]\.data\.(.+)$/.exec(path)
  if (nodeMatch) {
    const node = snapshot.canvas.nodes[Number(nodeMatch[1])]
    const fieldPath = nodeMatch[2]
    const attachmentMatch = /^inputFiles\[(\d+)]\.content$/.exec(fieldPath)
    const nodeName = typeof node?.data?.label === 'string'
      ? node.data.label
      : typeof node?.data?.name === 'string'
        ? node.data.name
        : node?.type || node?.id || '未知节点'

    if (attachmentMatch) {
      const inputFiles = Array.isArray(node?.data?.inputFiles) ? node.data.inputFiles : []
      const attachment = inputFiles[Number(attachmentMatch[1])]
      const attachmentName = attachment && typeof attachment === 'object' && 'name' in attachment && typeof attachment.name === 'string'
        ? attachment.name
        : `附件 ${Number(attachmentMatch[1]) + 1}`

      return {
        path,
        byteSize,
        sourceKind: 'node',
        sourceId: node?.id ?? null,
        label: `${nodeName} · ${attachmentName}`,
      }
    }

    const fieldName = fieldPath.split('.').at(-1) || fieldPath
    return {
      path,
      byteSize,
      sourceKind: 'node',
      sourceId: node?.id ?? null,
      label: `${nodeName} · ${NODE_FIELD_LABELS[fieldName] || fieldName}`,
    }
  }

  const taskMatch = /^snapshot\.taskQueue\.tasks\[(\d+)]\.(.+)$/.exec(path)
  if (taskMatch) {
    const task = snapshot.taskQueue.tasks[Number(taskMatch[1])]
    const fieldName = taskMatch[2].split('.').at(-1) || taskMatch[2]
    return {
      path,
      byteSize,
      sourceKind: 'task',
      sourceId: task?.id ?? null,
      label: `${task?.displayId || task?.id || '生成任务'} · ${NODE_FIELD_LABELS[fieldName] || fieldName}`,
    }
  }

  return { path, byteSize, sourceKind: 'snapshot', sourceId: null, label: path }
}

export function truncateSnapshotErrorMessage(message: string) {
  if (message.length <= SNAPSHOT_ERROR_MESSAGE_CHAR_LIMIT) {
    return message
  }

  return `${message.slice(0, SNAPSHOT_ERROR_MESSAGE_CHAR_LIMIT)}\n[已截断过长错误信息，完整内容未写入项目快照。]`
}

function sanitizeNodeErrorMessage(node: ProjectSnapshot['canvas']['nodes'][number]) {
  const errorMsg = node.data?.errorMsg
  if (typeof errorMsg !== 'string' || errorMsg.length <= SNAPSHOT_ERROR_MESSAGE_CHAR_LIMIT) {
    return node
  }

  return {
    ...node,
    data: {
      ...node.data,
      errorMsg: truncateSnapshotErrorMessage(errorMsg),
    },
  }
}

function sanitizeTaskErrorMessage(task: ProjectSnapshot['taskQueue']['tasks'][number]) {
  if (typeof task.errorMsg !== 'string' || task.errorMsg.length <= SNAPSHOT_ERROR_MESSAGE_CHAR_LIMIT) {
    return task
  }

  return {
    ...task,
    errorMsg: truncateSnapshotErrorMessage(task.errorMsg),
  }
}

export function sanitizeProjectSnapshotForPersistence(snapshot: ProjectSnapshot): ProjectSnapshot {
  return {
    ...snapshot,
    canvas: {
      ...snapshot.canvas,
      nodes: snapshot.canvas.nodes.map((node) => sanitizeNodeErrorMessage(node)),
    },
    taskQueue: {
      ...snapshot.taskQueue,
      tasks: snapshot.taskQueue.tasks.map((task) => sanitizeTaskErrorMessage(task)),
    },
  }
}

export function sanitizeProjectRecordForPersistence(project: ProjectRecord): ProjectRecord {
  return {
    ...project,
    savedSnapshot: sanitizeProjectSnapshotForPersistence(project.savedSnapshot),
    workingSnapshot: sanitizeProjectSnapshotForPersistence(project.workingSnapshot),
  }
}

export function sanitizeWorkspaceDataForPersistence(data: WorkspaceData): WorkspaceData {
  return {
    ...data,
    projects: data.projects.map((project) => sanitizeProjectRecordForPersistence(project)),
  }
}

export function analyzeProjectSnapshotSize(snapshot: ProjectSnapshot): ProjectSnapshotSizeReport {
  const sanitizedSnapshot = sanitizeProjectSnapshotForPersistence(snapshot)
  const serializedByteSize = getUtf8ByteSize(JSON.stringify(sanitizedSnapshot))
  const embeddedMedia: SnapshotEmbeddedMediaEntry[] = []
  const largeStrings: SnapshotLargeStringEntry[] = []

  walkSnapshotStrings(sanitizedSnapshot, 'snapshot', sanitizedSnapshot, embeddedMedia, largeStrings)

  return {
    serializedByteSize,
    warningByteLimit: SNAPSHOT_WARNING_BYTE_LIMIT,
    dangerByteLimit: SNAPSHOT_DANGER_BYTE_LIMIT,
    status: getSnapshotSizeStatus(serializedByteSize),
    embeddedMediaCount: embeddedMedia.length,
    embeddedMediaByteSize: embeddedMedia.reduce((sum, entry) => sum + entry.byteSize, 0),
    largestEmbeddedMedia: sortByByteSizeDescending(embeddedMedia),
    largeStringCount: largeStrings.length,
    largestStrings: sortByByteSizeDescending(largeStrings),
  }
}

export function formatSnapshotByteSize(byteSize: number) {
  if (byteSize >= 1024 * 1024) {
    return `${(byteSize / 1024 / 1024).toFixed(1)} MB`
  }

  if (byteSize >= 1024) {
    return `${Math.ceil(byteSize / 1024)} KB`
  }

  return `${byteSize} B`
}
