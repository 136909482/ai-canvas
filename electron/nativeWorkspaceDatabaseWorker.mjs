import { setTimeout as delay } from 'node:timers/promises'
import { parentPort } from 'node:worker_threads'
import * as database from './nativeWorkspaceDatabase.mjs'

const operations = new Map([
  ['initializeWorkspaceDatabase', database.initializeWorkspaceDatabase],
  ['backupWorkspaceDatabase', database.backupWorkspaceDatabase],
  ['readWorkspaceDataFromDatabase', database.readWorkspaceDataFromDatabase],
  ['replaceWorkspaceDataInDatabase', database.replaceWorkspaceDataInDatabase],
  ['listWorkspaceProjectsFromDatabase', database.listWorkspaceProjectsFromDatabase],
  ['loadWorkspaceProjectFromDatabase', database.loadWorkspaceProjectFromDatabase],
  ['saveWorkspaceProjectToDatabase', database.saveWorkspaceProjectToDatabase],
  ['deleteWorkspaceProjectFromDatabase', database.deleteWorkspaceProjectFromDatabase],
  ['loadWorkspaceConfigFromDatabase', database.loadWorkspaceConfigFromDatabase],
  ['saveWorkspaceConfigToDatabase', database.saveWorkspaceConfigToDatabase],
  ['loadWorkflowTemplatesFromDatabase', database.loadWorkflowTemplatesFromDatabase],
  ['saveWorkflowTemplatesToDatabase', database.saveWorkflowTemplatesToDatabase],
  ['searchWorkspaceFromDatabase', database.searchWorkspaceFromDatabase],
  ['queryWorkspaceAuditFromDatabase', database.queryWorkspaceAuditFromDatabase],
])

const mutatingOperations = new Set([
  'initializeWorkspaceDatabase',
  'replaceWorkspaceDataInDatabase',
  'saveWorkspaceProjectToDatabase',
  'deleteWorkspaceProjectFromDatabase',
  'saveWorkspaceConfigToDatabase',
  'saveWorkflowTemplatesToDatabase',
])
const busyRetryDelaysMs = [50, 100, 200, 400]
const queue = []
let drainScheduled = false
let draining = false

function isDatabaseBusyError(error) {
  return error?.errcode === 5
    || error?.code === 'SQLITE_BUSY'
    || /database is (?:locked|busy)/i.test(error instanceof Error ? error.message : String(error))
}

async function runWithBusyRetry(operation, action) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await action()
    } catch (error) {
      if (!isDatabaseBusyError(error) || attempt >= busyRetryDelaysMs.length) {
        if (isDatabaseBusyError(error)) {
          error.code = 'SQLITE_BUSY_RETRY_EXHAUSTED'
          error.retryable = true
          error.operation = operation
        }
        throw error
      }
      await delay(busyRetryDelaysMs[attempt])
    }
  }
}

function serializeError(error, operation) {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
    code: error?.code || 'PERSISTENCE_OPERATION_FAILED',
    retryable: Boolean(error?.retryable || isDatabaseBusyError(error)),
    operation,
  }
}

function getAutosaveMergeKey(message) {
  if (message.operation !== 'saveWorkspaceProjectToDatabase') return null
  const [workspacePath, input] = message.args
  const project = input?.project
  if (!workspacePath || !project?.id || !Number.isFinite(project.updatedAt)) return null
  return `${workspacePath}\u0000${project.id}\u0000${project.updatedAt}`
}

function enqueue(message) {
  const mergeKey = getAutosaveMergeKey(message)
  const last = queue.at(-1)
  if (mergeKey && last?.mergeKey === mergeKey) {
    last.message = message
    last.requestIds.push(message.id)
    return
  }
  queue.push({ message, mergeKey, requestIds: [message.id] })
}

async function execute(message) {
  const operation = operations.get(message.operation)
  if (!operation) throw new Error(`不支持的桌面持久化操作：${message.operation}`)
  const action = () => operation(...message.args)
  return mutatingOperations.has(message.operation)
    ? runWithBusyRetry(message.operation, action)
    : action()
}

async function drainQueue() {
  drainScheduled = false
  if (draining) return
  draining = true
  try {
    while (queue.length > 0) {
      const item = queue.shift()
      try {
        const result = await execute(item.message)
        for (const id of item.requestIds) parentPort.postMessage({ id, ok: true, result })
      } catch (error) {
        const serializedError = serializeError(error, item.message.operation)
        for (const id of item.requestIds) parentPort.postMessage({ id, ok: false, error: serializedError })
      }
    }
  } finally {
    draining = false
    if (queue.length > 0) scheduleDrain()
  }
}

function scheduleDrain() {
  if (drainScheduled || draining) return
  drainScheduled = true
  setImmediate(() => void drainQueue())
}

if (!parentPort) throw new Error('桌面持久化 Worker 缺少父进程端口')

parentPort.on('message', (message) => {
  enqueue(message)
  scheduleDrain()
})
