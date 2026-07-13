import {
  SNAPSHOT_ERROR_MESSAGE_CHAR_LIMIT,
  analyzeProjectSnapshotSize,
  sanitizeProjectSnapshotForPersistence,
  truncateSnapshotErrorMessage,
} from './snapshotSize.ts'
import type { GenerateTask, ProjectSnapshot } from '@/types'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function createTask(errorMsg = ''): GenerateTask {
  return {
    id: 'task-1',
    displayId: 'task-1',
    kind: 'image',
    sourceNodeId: 'gen-1',
    previewNodeId: null,
    model: 'test-model',
    prompt: '',
    negativePrompt: '',
    ratio: '1:1',
    resolution: '1024x1024',
    operationType: 'text-to-image',
    sourceImageNodeId: null,
    apiProfileId: null,
    apiProfileName: null,
    provider: null,
    referenceImageUrls: [],
    resultImageAsset: null,
    resultVideoAsset: null,
    status: 'error',
    errorMsg,
    remoteTaskId: null,
    remoteStatus: null,
    createdAt: 1,
    startedAt: 1,
    finishedAt: 2,
  }
}

function createSnapshot(input: {
  imageUrl?: string
  text?: string
  nodeError?: string
  taskError?: string
} = {}): ProjectSnapshot {
  return {
    schemaVersion: 1,
    canvas: {
      nodes: [
        {
          id: 'image-1',
          type: 'imageNode',
          position: { x: 0, y: 0 },
          data: {
            imageUrl: input.imageUrl ?? null,
            errorMsg: input.nodeError ?? '',
          },
        },
        {
          id: 'text-1',
          type: 'textNode',
          position: { x: 0, y: 0 },
          data: {
            text: input.text ?? '',
          },
        },
      ],
      edges: [],
    },
    taskQueue: {
      tasks: [createTask(input.taskError ?? '')],
    },
  }
}

function runSnapshotSizeTests() {
  const longUserText = '用户正文'.repeat(100_000)
  const longError = 'E'.repeat(SNAPSHOT_ERROR_MESSAGE_CHAR_LIMIT + 500)
  const dataUrl = `data:image/png;base64,${'a'.repeat(4096)}`
  const snapshot = createSnapshot({
    imageUrl: dataUrl,
    text: longUserText,
    nodeError: longError,
    taskError: longError,
  })

  const sanitized = sanitizeProjectSnapshotForPersistence(snapshot)
  const sanitizedImageNode = sanitized.canvas.nodes.find((node) => node.id === 'image-1')
  const sanitizedTextNode = sanitized.canvas.nodes.find((node) => node.id === 'text-1')
  const expectedError = truncateSnapshotErrorMessage(longError)

  assert(sanitizedImageNode?.data?.errorMsg === expectedError, 'node error messages should be truncated before persistence')
  assert(sanitized.taskQueue.tasks[0].errorMsg === expectedError, 'task error messages should be truncated before persistence')
  assert(sanitizedTextNode?.data?.text === longUserText, 'user-authored text should not be truncated by snapshot size controls')

  const report = analyzeProjectSnapshotSize(snapshot)
  assert(report.serializedByteSize > 0, 'snapshot size report should include serialized byte size')
  assert(report.embeddedMediaCount === 1, 'snapshot size report should count embedded image/video data URLs')
  assert(report.embeddedMediaByteSize > 0, 'snapshot size report should estimate embedded media payload size')
  assert(report.largestEmbeddedMedia[0]?.path.includes('imageUrl'), 'snapshot size report should locate embedded media fields')
  assert(report.largeStringCount === 1, 'snapshot size report should count large user-authored strings')
  assert(report.largestStrings[0]?.sourceId === 'text-1', 'large string report should locate the source node')
  assert(report.largestStrings[0]?.label.includes('文本正文'), 'large string report should provide a readable field label')
}

runSnapshotSizeTests()
