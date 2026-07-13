import { recoverTasksAfterSnapshotLoad } from './useTaskQueueStore.ts'
import type { GenerateTask } from '@/types'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function createTask(overrides: Partial<GenerateTask>): GenerateTask {
  return {
    id: 'task-1',
    displayId: 'display-1',
    kind: 'image',
    sourceNodeId: 'gen-1',
    previewNodeId: 'preview-1',
    model: 'model-1',
    prompt: 'prompt',
    negativePrompt: '',
    ratio: '1:1',
    resolution: '1K',
    operationType: 'text-to-image',
    sourceImageNodeId: null,
    maskImageUrl: null,
    apiProfileId: null,
    apiProfileName: null,
    provider: 'openai',
    referenceImageUrls: [],
    inputFidelity: null,
    quality: null,
    officialFallback: false,
    googleSearch: false,
    googleImageSearch: false,
    videoMode: null,
    videoDuration: null,
    resultImageAsset: null,
    resultVideoAsset: null,
    status: 'queued',
    errorMsg: '',
    remoteTaskId: null,
    remoteStatus: null,
    createdAt: 100,
    startedAt: 0,
    finishedAt: null,
    ...overrides,
  }
}

function runTaskQueueRecoveryTests() {
  const recoveredTasks = recoverTasksAfterSnapshotLoad([
    createTask({ id: 'queued', status: 'queued', errorMsg: 'stale', remoteTaskId: 'old-remote', remoteStatus: 'IN_PROGRESS', startedAt: 200 }),
    createTask({ id: 'running-local', status: 'running', startedAt: 300 }),
    createTask({ id: 'running-remote', status: 'running', remoteTaskId: 'remote-1', remoteStatus: 'SUCCESS', startedAt: 400 }),
    createTask({ id: 'done', status: 'done', finishedAt: 500, resultImageAsset: { relativePath: 'images/a.png', mimeType: 'image/png', fileName: 'a.png' } }),
    createTask({ id: 'error', status: 'error', errorMsg: '失败', finishedAt: 600 }),
  ])

  const queuedTask = recoveredTasks.find((task) => task.id === 'queued')
  assert(queuedTask?.status === 'queued', 'queued tasks should remain queued after snapshot load')
  assert(queuedTask.remoteTaskId === null, 'queued tasks should not keep stale remote ids')
  assert(queuedTask.errorMsg === '', 'queued tasks should clear stale errors')
  assert(queuedTask.startedAt === 0, 'queued tasks should clear stale startedAt')

  const localRunningTask = recoveredTasks.find((task) => task.id === 'running-local')
  assert(localRunningTask?.status === 'queued', 'local running tasks should return to queued after refresh')
  assert(localRunningTask.startedAt === 0, 'local running tasks should clear startedAt when re-queued')

  const remoteRunningTask = recoveredTasks.find((task) => task.id === 'running-remote')
  assert(remoteRunningTask?.status === 'running', 'remote running tasks should remain running for provider polling')
  assert(remoteRunningTask.remoteTaskId === 'remote-1', 'remote running tasks should preserve remote task id')
  assert(remoteRunningTask.remoteStatus === 'IN_PROGRESS', 'remote running tasks should resume polling from an in-progress state')

  const doneTask = recoveredTasks.find((task) => task.id === 'done')
  assert(doneTask?.status === 'done', 'done tasks should remain done')
  assert(doneTask.resultImageAsset?.relativePath === 'images/a.png', 'done tasks should preserve result assets')

  const errorTask = recoveredTasks.find((task) => task.id === 'error')
  assert(errorTask?.status === 'error', 'failed tasks should remain failed')
  assert(errorTask.errorMsg === '失败', 'failed tasks should preserve error messages')
}

runTaskQueueRecoveryTests()
