import { Worker } from 'node:worker_threads'

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

function createWorkerError(payload = {}) {
  const error = new Error(payload.message || '桌面持久化 Worker 执行失败')
  error.name = payload.name || 'PersistenceWorkerError'
  error.code = payload.code || 'PERSISTENCE_WORKER_ERROR'
  error.retryable = Boolean(payload.retryable)
  if (payload.operation) error.operation = payload.operation
  return error
}

export function createNativeWorkspaceDatabaseClient(options = {}) {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const workerUrl = options.workerUrl ?? new URL('./nativeWorkspaceDatabaseWorker.mjs', import.meta.url)
  const pendingRequests = new Map()
  const projectSaveQueues = new Map()
  let worker = null
  let nextRequestId = 1
  let disposed = false

  function updateWorkerReference() {
    if (!worker) return
    if (pendingRequests.size > 0) worker.ref()
    else worker.unref()
  }

  function rejectPending(error) {
    for (const pending of pendingRequests.values()) {
      clearTimeout(pending.timeoutId)
      pending.reject(error)
    }
    pendingRequests.clear()
  }

  function ensureWorker() {
    if (disposed) throw createWorkerError({
      message: '桌面持久化 Worker 已关闭',
      code: 'PERSISTENCE_WORKER_CLOSED',
    })
    if (worker) return worker

    const nextWorker = new Worker(workerUrl, {
      name: 'ai-canvas-persistence',
      execArgv: [],
    })
    worker = nextWorker
    nextWorker.unref()

    nextWorker.on('message', (message) => {
      const pending = pendingRequests.get(message.id)
      if (!pending) return
      pendingRequests.delete(message.id)
      clearTimeout(pending.timeoutId)
      if (message.ok) pending.resolve(message.result)
      else pending.reject(createWorkerError(message.error))
      updateWorkerReference()
    })

    nextWorker.on('error', (error) => {
      if (worker === nextWorker) worker = null
      rejectPending(createWorkerError({
        message: error instanceof Error ? error.message : String(error),
        code: 'PERSISTENCE_WORKER_CRASHED',
        retryable: true,
      }))
    })

    nextWorker.on('exit', (code) => {
      if (worker === nextWorker) worker = null
      if (pendingRequests.size > 0) {
        rejectPending(createWorkerError({
          message: `桌面持久化 Worker 在请求完成前退出（${code}）`,
          code: 'PERSISTENCE_WORKER_EXITED',
          retryable: true,
        }))
      }
    })

    return nextWorker
  }

  function request(operation, args = []) {
    let activeWorker
    try {
      activeWorker = ensureWorker()
    } catch (error) {
      return Promise.reject(error)
    }

    const id = nextRequestId
    nextRequestId += 1
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingRequests.delete(id)
        reject(createWorkerError({
          message: `桌面持久化操作超时：${operation}`,
          code: 'PERSISTENCE_TIMEOUT',
          retryable: true,
          operation,
        }))
        updateWorkerReference()
      }, requestTimeoutMs)
      pendingRequests.set(id, { resolve, reject, timeoutId })
      updateWorkerReference()
      activeWorker.postMessage({ id, operation, args })
    })
  }

  function getProjectSaveQueueKey(workspacePath, input) {
    return `${workspacePath}\u0000${input?.project?.id ?? ''}`
  }

  function getProjectSaveMergeKey(input) {
    return Number.isFinite(input?.project?.updatedAt) ? String(input.project.updatedAt) : null
  }

  function drainProjectSaveQueue(key, state) {
    if (state.running || disposed) return
    state.running = true
    void (async () => {
      while (state.items.length > 0 && !disposed) {
        const item = state.items.shift()
        try {
          const result = await request('saveWorkspaceProjectToDatabase', [item.workspacePath, item.input])
          for (const waiter of item.waiters) waiter.resolve(result)
        } catch (error) {
          for (const waiter of item.waiters) waiter.reject(error)
        }
      }
      state.running = false
      if (state.items.length > 0 && !disposed) {
        drainProjectSaveQueue(key, state)
      } else {
        projectSaveQueues.delete(key)
      }
    })()
  }

  function enqueueProjectSave(workspacePath, input) {
    if (disposed) return Promise.reject(createWorkerError({
      message: '桌面持久化 Worker 已关闭',
      code: 'PERSISTENCE_WORKER_CLOSED',
    }))

    const key = getProjectSaveQueueKey(workspacePath, input)
    let state = projectSaveQueues.get(key)
    if (!state) {
      state = { running: false, items: [] }
      projectSaveQueues.set(key, state)
    }

    return new Promise((resolve, reject) => {
      const mergeKey = getProjectSaveMergeKey(input)
      const last = state.items.at(-1)
      if (mergeKey && last?.mergeKey === mergeKey) {
        last.workspacePath = workspacePath
        last.input = input
        last.waiters.push({ resolve, reject })
      } else {
        state.items.push({ workspacePath, input, mergeKey, waiters: [{ resolve, reject }] })
      }
      drainProjectSaveQueue(key, state)
    })
  }

  return {
    initializeWorkspaceDatabase: (workspacePath) => request('initializeWorkspaceDatabase', [workspacePath]),
    backupWorkspaceDatabase: (workspacePath, reason) => request('backupWorkspaceDatabase', [workspacePath, reason]),
    readWorkspaceDataFromDatabase: (workspacePath) => request('readWorkspaceDataFromDatabase', [workspacePath]),
    replaceWorkspaceDataInDatabase: (workspacePath, data, eventType) => request('replaceWorkspaceDataInDatabase', [workspacePath, data, eventType]),
    listWorkspaceProjectsFromDatabase: (workspacePath) => request('listWorkspaceProjectsFromDatabase', [workspacePath]),
    loadWorkspaceProjectFromDatabase: (workspacePath, projectId) => request('loadWorkspaceProjectFromDatabase', [workspacePath, projectId]),
    saveWorkspaceProjectToDatabase: enqueueProjectSave,
    deleteWorkspaceProjectFromDatabase: (workspacePath, input) => request('deleteWorkspaceProjectFromDatabase', [workspacePath, input]),
    loadWorkspaceConfigFromDatabase: (workspacePath) => request('loadWorkspaceConfigFromDatabase', [workspacePath]),
    saveWorkspaceConfigToDatabase: (workspacePath, config) => request('saveWorkspaceConfigToDatabase', [workspacePath, config]),
    loadWorkflowTemplatesFromDatabase: (workspacePath) => request('loadWorkflowTemplatesFromDatabase', [workspacePath]),
    saveWorkflowTemplatesToDatabase: (workspacePath, library) => request('saveWorkflowTemplatesToDatabase', [workspacePath, library]),
    searchWorkspaceFromDatabase: (workspacePath, input) => request('searchWorkspaceFromDatabase', [workspacePath, input]),
    queryWorkspaceAuditFromDatabase: (workspacePath, input) => request('queryWorkspaceAuditFromDatabase', [workspacePath, input]),
    async dispose() {
      disposed = true
      const closedError = createWorkerError({
        message: '桌面持久化 Worker 已关闭',
        code: 'PERSISTENCE_WORKER_CLOSED',
      })
      for (const state of projectSaveQueues.values()) {
        for (const item of state.items) {
          for (const waiter of item.waiters) waiter.reject(closedError)
        }
        state.items.length = 0
      }
      projectSaveQueues.clear()
      const activeWorker = worker
      worker = null
      rejectPending(closedError)
      if (activeWorker) await activeWorker.terminate()
    },
  }
}
