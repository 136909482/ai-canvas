import { create } from 'zustand'
import type { ProviderId } from '@/config/modelCatalog'
import type {
  GenerateTask,
  GptImageQuality,
  ImageInputFidelity,
  ImageOperationType,
  GenerateTaskRemoteStatus,
  TaskQueueSnapshot,
  VideoGenerateNodeData,
  VideoGenerateMode,
} from '@/types'

export interface GenerateTaskSnapshot {
  kind?: 'image' | 'video'
  sourceNodeId: string
  previewNodeId?: string | null
  model: string
  prompt: string
  negativePrompt?: string
  ratio?: string
  resolution?: string
  operationType?: ImageOperationType
  sourceImageNodeId?: string | null
  maskImageUrl?: string | null
  apiProfileId?: string | null
  apiProfileName?: string | null
  provider?: ProviderId | null
  referenceImageUrls?: string[]
  inputFidelity?: ImageInputFidelity | null
  quality?: GptImageQuality | null
  officialFallback?: boolean
  googleSearch?: boolean
  googleImageSearch?: boolean
  videoMode?: VideoGenerateMode | null
  videoDuration?: VideoGenerateNodeData['duration'] | null
  resultImageAsset?: GenerateTask['resultImageAsset']
  resultVideoAsset?: GenerateTask['resultVideoAsset']
}

interface TaskQueueStore {
  tasks: GenerateTask[]
  runtimeVersion: number
  createTask: (input: GenerateTaskSnapshot) => string
  getSnapshot: () => TaskQueueSnapshot
  replaceSnapshot: (snapshot: TaskQueueSnapshot) => void
  resetToEmpty: () => void
  markTaskQueued: (id: string, patch?: Partial<GenerateTaskSnapshot>) => void
  markTaskRunning: (id: string, previewNodeId?: string | null) => void
  resumeRemoteTask: (id: string) => void
  attachRemoteTask: (id: string, remoteTaskId: string) => void
  setRemoteTaskStatus: (id: string, remoteStatus: GenerateTaskRemoteStatus) => void
  markTaskDone: (id: string, patch?: Partial<GenerateTaskSnapshot>) => void
  markTaskError: (id: string, errorMsg: string) => void
  removeTask: (id: string) => void
  clearFinishedTasks: () => void
}

let taskIdCounter = 1

function createTaskId() {
  return `task-${taskIdCounter++}`
}

function createTaskDisplayId(seed: string) {
  let hash = 0

  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(31, hash) + seed.charCodeAt(index) | 0
  }

  return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8)
}

function syncTaskIdCounter(tasks: GenerateTask[]) {
  const maxTaskId = tasks.reduce((maxValue, task) => {
    const match = /^task-(\d+)$/.exec(task.id)
    const numericId = match ? Number(match[1]) : 0
    return Math.max(maxValue, numericId)
  }, 0)

  taskIdCounter = maxTaskId + 1
}

function sanitizeTask(task: GenerateTask): GenerateTask {
  return {
    ...task,
    kind: task.kind === 'video' ? 'video' : 'image',
    displayId: typeof task.displayId === 'string' && task.displayId.trim()
      ? task.displayId
      : createTaskDisplayId(`${task.id}:${task.createdAt}:${task.prompt}`),
    previewNodeId: task.previewNodeId ?? null,
    negativePrompt: task.negativePrompt ?? '',
    ratio: task.ratio ?? '1:1',
    resolution: task.resolution ?? '1K',
    operationType: task.operationType ?? (task.referenceImageUrls?.length ? 'image-to-image' : 'text-to-image'),
    sourceImageNodeId: task.sourceImageNodeId ?? null,
    maskImageUrl: task.maskImageUrl ?? null,
    apiProfileId: task.apiProfileId ?? null,
    apiProfileName: task.apiProfileName ?? null,
    provider: task.provider ?? null,
    referenceImageUrls: Array.isArray(task.referenceImageUrls) ? [...task.referenceImageUrls] : [],
    inputFidelity: task.inputFidelity ?? null,
    quality: task.quality ?? null,
    officialFallback: Boolean(task.officialFallback),
    googleSearch: Boolean(task.googleSearch),
    googleImageSearch: Boolean(task.googleImageSearch),
    videoMode: task.videoMode ?? null,
    videoDuration: task.videoDuration ?? null,
    resultImageAsset: task.resultImageAsset ?? null,
    resultVideoAsset: task.resultVideoAsset ?? null,
    errorMsg: task.errorMsg ?? '',
    remoteTaskId: task.remoteTaskId ?? null,
    remoteStatus: task.remoteStatus ?? null,
    finishedAt: task.finishedAt ?? null,
  }
}

function sanitizeTasks(tasks: GenerateTask[]): GenerateTask[] {
  return tasks.map((task) => sanitizeTask(task))
}

export function recoverTaskAfterSnapshotLoad(task: GenerateTask): GenerateTask {
  const sanitizedTask = sanitizeTask(task)

  if (sanitizedTask.status === 'running' && sanitizedTask.remoteTaskId) {
    return {
      ...sanitizedTask,
      errorMsg: '',
      remoteStatus: 'IN_PROGRESS',
      finishedAt: null,
    }
  }

  if (sanitizedTask.status === 'running') {
    return {
      ...sanitizedTask,
      status: 'queued',
      errorMsg: '',
      remoteTaskId: null,
      remoteStatus: null,
      startedAt: 0,
      finishedAt: null,
    }
  }

  if (sanitizedTask.status === 'queued') {
    return {
      ...sanitizedTask,
      errorMsg: '',
      remoteTaskId: null,
      remoteStatus: null,
      startedAt: 0,
      finishedAt: null,
    }
  }

  return sanitizedTask
}

export function recoverTasksAfterSnapshotLoad(tasks: GenerateTask[]): GenerateTask[] {
  return tasks.map((task) => recoverTaskAfterSnapshotLoad(task))
}

function mergeTaskSnapshot(task: GenerateTask, patch?: Partial<GenerateTaskSnapshot>): GenerateTask {
  return {
    ...task,
    kind: patch?.kind ?? task.kind,
    sourceNodeId: patch?.sourceNodeId ?? task.sourceNodeId,
    previewNodeId:
      patch && 'previewNodeId' in patch
        ? patch.previewNodeId ?? null
        : task.previewNodeId,
    model: patch?.model ?? task.model,
    prompt: patch?.prompt ?? task.prompt,
    negativePrompt: patch?.negativePrompt ?? task.negativePrompt,
    ratio: patch?.ratio ?? task.ratio,
    resolution: patch?.resolution ?? task.resolution,
    operationType: patch?.operationType ?? task.operationType,
    sourceImageNodeId:
      patch && 'sourceImageNodeId' in patch
        ? patch.sourceImageNodeId ?? null
        : task.sourceImageNodeId,
    maskImageUrl:
      patch && 'maskImageUrl' in patch
        ? patch.maskImageUrl ?? null
        : task.maskImageUrl ?? null,
    apiProfileId:
      patch && 'apiProfileId' in patch
        ? patch.apiProfileId ?? null
        : task.apiProfileId ?? null,
    apiProfileName:
      patch && 'apiProfileName' in patch
        ? patch.apiProfileName ?? null
        : task.apiProfileName ?? null,
    provider:
      patch && 'provider' in patch
        ? patch.provider ?? null
        : task.provider ?? null,
    referenceImageUrls: patch?.referenceImageUrls ?? task.referenceImageUrls,
    inputFidelity:
      patch && 'inputFidelity' in patch
        ? patch.inputFidelity ?? null
        : task.inputFidelity ?? null,
    quality:
      patch && 'quality' in patch
        ? patch.quality ?? null
        : task.quality ?? null,
    officialFallback:
      patch && 'officialFallback' in patch
        ? Boolean(patch.officialFallback)
        : Boolean(task.officialFallback),
    googleSearch:
      patch && 'googleSearch' in patch
        ? Boolean(patch.googleSearch)
        : Boolean(task.googleSearch),
    googleImageSearch:
      patch && 'googleImageSearch' in patch
        ? Boolean(patch.googleImageSearch)
        : Boolean(task.googleImageSearch),
    videoMode:
      patch && 'videoMode' in patch
        ? patch.videoMode ?? null
        : task.videoMode ?? null,
    videoDuration:
      patch && 'videoDuration' in patch
        ? patch.videoDuration ?? null
        : task.videoDuration ?? null,
    resultImageAsset:
      patch && 'resultImageAsset' in patch
        ? patch.resultImageAsset ?? null
        : task.resultImageAsset ?? null,
    resultVideoAsset:
      patch && 'resultVideoAsset' in patch
        ? patch.resultVideoAsset ?? null
        : task.resultVideoAsset ?? null,
  }
}

export const useTaskQueueStore = create<TaskQueueStore>((set, get) => ({
  tasks: [],
  runtimeVersion: 0,

  createTask: (input) => {
    const taskId = createTaskId()
    const now = Date.now()
    const displayId = createTaskDisplayId(`${taskId}:${now}:${input.prompt}`)

    set((state) => ({
      tasks: [
        ...state.tasks,
        {
          id: taskId,
          displayId,
          kind: input.kind ?? 'image',
          sourceNodeId: input.sourceNodeId,
          previewNodeId: input.previewNodeId ?? null,
          model: input.model,
          prompt: input.prompt,
          negativePrompt: input.negativePrompt ?? '',
          ratio: input.ratio ?? '1:1',
          resolution: input.resolution ?? '1K',
          operationType: input.operationType ?? (input.referenceImageUrls?.length ? 'image-to-image' : 'text-to-image'),
          sourceImageNodeId: input.sourceImageNodeId ?? null,
          maskImageUrl: input.maskImageUrl ?? null,
          apiProfileId: input.apiProfileId ?? null,
          apiProfileName: input.apiProfileName ?? null,
          provider: input.provider ?? null,
          referenceImageUrls: input.referenceImageUrls ?? [],
          inputFidelity: input.inputFidelity ?? null,
          quality: input.quality ?? null,
          officialFallback: Boolean(input.officialFallback),
          googleSearch: Boolean(input.googleSearch),
          googleImageSearch: Boolean(input.googleImageSearch),
          videoMode: input.videoMode ?? null,
          videoDuration: input.videoDuration ?? null,
          resultImageAsset: input.resultImageAsset ?? null,
          resultVideoAsset: input.resultVideoAsset ?? null,
          status: 'queued',
          errorMsg: '',
          remoteTaskId: null,
          remoteStatus: null,
          createdAt: now,
          startedAt: 0,
          finishedAt: null,
        },
      ],
    }))

    return taskId
  },

  getSnapshot: (): TaskQueueSnapshot => ({
    tasks: sanitizeTasks(get().tasks),
  }),

  replaceSnapshot: (snapshot) =>
    set((state) => {
      const tasks = recoverTasksAfterSnapshotLoad(sanitizeTasks(snapshot.tasks ?? []))
      syncTaskIdCounter(tasks)

      return {
        tasks,
        runtimeVersion: state.runtimeVersion + 1,
      }
    }),

  resetToEmpty: () =>
    set((state) => {
      taskIdCounter = 1
      return {
        tasks: [],
        runtimeVersion: state.runtimeVersion + 1,
      }
    }),

  markTaskQueued: (id, patch) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id
          ? {
              ...mergeTaskSnapshot(task, patch),
              status: 'queued',
              errorMsg: '',
              remoteTaskId: null,
              remoteStatus: null,
              createdAt: Date.now(),
              startedAt: 0,
              finishedAt: null,
            }
          : task,
      ),
    })),

  markTaskRunning: (id, previewNodeId) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              status: 'running',
              previewNodeId: previewNodeId ?? task.previewNodeId,
              startedAt: Date.now(),
              finishedAt: null,
              errorMsg: '',
              remoteTaskId: null,
              remoteStatus: null,
            }
          : task,
      ),
    })),

  resumeRemoteTask: (id) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              status: 'running',
              startedAt: Date.now(),
              finishedAt: null,
              errorMsg: '',
              remoteStatus: 'IN_PROGRESS',
            }
          : task,
      ),
    })),

  attachRemoteTask: (id, remoteTaskId) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              remoteTaskId,
              remoteStatus: 'IN_PROGRESS',
            }
          : task,
      ),
    })),

  setRemoteTaskStatus: (id, remoteStatus) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              remoteStatus,
            }
          : task,
      ),
    })),

  markTaskDone: (id, patch) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id
          ? {
              ...mergeTaskSnapshot(task, patch),
              status: 'done',
              remoteStatus: task.remoteTaskId ? 'SUCCESS' : task.remoteStatus,
              finishedAt: Date.now(),
              errorMsg: '',
            }
          : task,
      ),
    })),

  markTaskError: (id, errorMsg) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              status: 'error',
              remoteStatus: task.remoteTaskId ? 'FAILURE' : task.remoteStatus,
              errorMsg,
              finishedAt: Date.now(),
            }
          : task,
      ),
    })),

  removeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== id),
    })),

  clearFinishedTasks: () =>
    set((state) => ({
      tasks: state.tasks.filter((task) => task.status === 'queued' || task.status === 'running'),
    })),
}))
