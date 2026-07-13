import { DatabaseSync } from 'node:sqlite'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'

export const WORKSPACE_DATABASE_SCHEMA_VERSION = 2
export const WORKSPACE_DATABASE_RELATIVE_PATH = path.join('.ai-canvas', 'workspace.sqlite')
const MAX_AUDIT_ENTRIES = 5_000

const DATABASE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS workspace_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active_project_id TEXT,
    last_opened_project_id TEXT,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_opened_at INTEGER NOT NULL,
    archived_at INTEGER,
    snapshot_schema_version INTEGER NOT NULL,
    saved_snapshot_bytes INTEGER NOT NULL,
    working_snapshot_bytes INTEGER NOT NULL,
    node_count INTEGER NOT NULL,
    edge_count INTEGER NOT NULL,
    task_count INTEGER NOT NULL,
    project_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS projects_updated_at_idx ON projects(updated_at DESC);
  CREATE INDEX IF NOT EXISTS projects_archived_at_idx ON projects(archived_at);
  CREATE TABLE IF NOT EXISTS tasks (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    kind TEXT,
    status TEXT,
    created_at INTEGER,
    task_json TEXT NOT NULL,
    PRIMARY KEY (project_id, task_id)
  );
  CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status, created_at);
  CREATE TABLE IF NOT EXISTS assets (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    role TEXT NOT NULL,
    mime_type TEXT,
    PRIMARY KEY (project_id, relative_path, role)
  );
  CREATE INDEX IF NOT EXISTS assets_relative_path_idx ON assets(relative_path);
  CREATE TABLE IF NOT EXISTS search_documents (
    document_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    project_name TEXT NOT NULL,
    node_id TEXT,
    node_type TEXT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    content_text TEXT NOT NULL,
    asset_path TEXT,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS search_documents_project_idx ON search_documents(project_id);
  CREATE INDEX IF NOT EXISTS search_documents_kind_idx ON search_documents(kind, updated_at DESC);
  CREATE INDEX IF NOT EXISTS search_documents_node_idx ON search_documents(project_id, node_id);
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    entity_id TEXT,
    details_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at DESC);
`

function getUtf8ByteSize(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function getDatabasePath(workspacePath) {
  return path.join(workspacePath, WORKSPACE_DATABASE_RELATIVE_PATH)
}

async function pathExists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function readSchemaVersion(database) {
  return Number(database.prepare('PRAGMA user_version').get()?.user_version ?? 0)
}

function openDatabase(workspacePath) {
  const database = new DatabaseSync(getDatabasePath(workspacePath))
  database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 100;')
  return database
}

function withTransaction(database, action) {
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = action()
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function collectAssetEntries(project) {
  const entries = new Map()
  const visitAsset = (asset, role) => {
    if (!asset || typeof asset !== 'object') return
    for (const [key, indexedRole] of [
      ['relativePath', role],
      ['thumbnailRelativePath', `${role}:thumbnail`],
      ['previewRelativePath', `${role}:preview`],
    ]) {
      if (typeof asset[key] !== 'string') continue
      entries.set(`${asset[key]}\0${indexedRole}`, {
        relativePath: asset[key],
        role: indexedRole,
        mimeType: typeof asset.mimeType === 'string' ? asset.mimeType : null,
      })
    }
  }

  for (const [snapshotName, snapshot] of [
    ['saved', project.savedSnapshot],
    ['working', project.workingSnapshot],
  ]) {
    for (const node of snapshot?.canvas?.nodes ?? []) {
      visitAsset(node.type === 'videoNode' ? node.data?.videoAsset : node.data?.imageAsset, `${snapshotName}:node`)
    }
    for (const task of snapshot?.taskQueue?.tasks ?? []) {
      visitAsset(task.resultImageAsset, `${snapshotName}:task-image`)
      visitAsset(task.resultVideoAsset, `${snapshotName}:task-video`)
    }
  }
  return [...entries.values()]
}

function searchableString(value) {
  return typeof value === 'string' && !value.startsWith('data:') ? value.trim() : ''
}

function searchableStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function getNodeAssetPath(node) {
  const asset = node?.type === 'videoNode' ? node?.data?.videoAsset : node?.data?.imageAsset
  return searchableString(asset?.relativePath)
}

function getSearchNodeTitle(node) {
  return searchableString(node?.data?.name)
    || searchableString(node?.data?.label)
    || searchableString(node?.data?.title)
    || searchableString(node?.data?.prompt).slice(0, 80)
    || node?.type
    || '节点'
}

function collectSearchTextFields(node) {
  const data = node?.data ?? {}
  return [
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
    ...searchableStrings(data.parts),
    ...searchableStrings(data.tags),
  ].map(searchableString).filter(Boolean)
}

function isSearchAssetNode(node) {
  return Boolean(getNodeAssetPath(node)) || ['imageNode', 'videoNode', 'generatedPreviewNode', 'testImageNode', 'panoramaNode'].includes(node?.type)
}

function collectProjectSearchDocuments(project) {
  if (project.archivedAt) return []
  const documents = [{
    documentId: `${project.id}:project`, nodeId: null, nodeType: null, kind: 'project', title: project.name,
    content: project.name, assetPath: null,
  }]
  for (const node of project.workingSnapshot?.canvas?.nodes ?? []) {
    const title = getSearchNodeTitle(node)
    const textFields = collectSearchTextFields(node)
    if (textFields.length > 0) {
      documents.push({
        documentId: `${project.id}:node:${node.id}:text`, nodeId: node.id, nodeType: node.type ?? null,
        kind: 'text', title, content: textFields.join('\n'), assetPath: null,
      })
    }
    if (isSearchAssetNode(node)) {
      const assetPath = getNodeAssetPath(node)
      const data = node.data ?? {}
      documents.push({
        documentId: `${project.id}:node:${node.id}:asset`, nodeId: node.id, nodeType: node.type ?? null,
        kind: 'asset', title,
        content: [title, assetPath, data.model, data.resolution, data.source, ...searchableStrings(data.tags)].map(searchableString).filter(Boolean).join('\n'),
        assetPath: assetPath || null,
      })
    }
  }
  return documents
}

function rebuildProjectSearchDocuments(database, project) {
  database.prepare('DELETE FROM search_documents WHERE project_id = ?').run(project.id)
  const insert = database.prepare(`
    INSERT INTO search_documents (
      document_id, project_id, project_name, node_id, node_type, kind,
      title, content_text, asset_path, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const document of collectProjectSearchDocuments(project)) {
    const contentText = `${project.name}\n${document.title}\n${document.content}`.toLocaleLowerCase().replace(/\s+/g, ' ').trim()
    insert.run(
      document.documentId, project.id, project.name, document.nodeId, document.nodeType,
      document.kind, document.title, contentText, document.assetPath, project.updatedAt,
    )
  }
}

function writeAudit(database, eventType, entityId, details = {}) {
  database.prepare(`
    INSERT INTO audit_log (event_type, entity_id, details_json, created_at)
    VALUES (?, ?, ?, ?)
  `).run(eventType, entityId ?? null, JSON.stringify(details), Date.now())
  database.prepare(`
    DELETE FROM audit_log
    WHERE id NOT IN (SELECT id FROM audit_log ORDER BY created_at DESC, id DESC LIMIT ?)
  `).run(MAX_AUDIT_ENTRIES)
}

function upsertProject(database, project) {
  const savedSnapshot = project.savedSnapshot
  const workingSnapshot = project.workingSnapshot
  const workingTasks = workingSnapshot?.taskQueue?.tasks ?? []
  database.prepare(`
    INSERT INTO projects (
      id, name, created_at, updated_at, last_opened_at, archived_at,
      snapshot_schema_version, saved_snapshot_bytes, working_snapshot_bytes,
      node_count, edge_count, task_count, project_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      last_opened_at = excluded.last_opened_at,
      archived_at = excluded.archived_at,
      snapshot_schema_version = excluded.snapshot_schema_version,
      saved_snapshot_bytes = excluded.saved_snapshot_bytes,
      working_snapshot_bytes = excluded.working_snapshot_bytes,
      node_count = excluded.node_count,
      edge_count = excluded.edge_count,
      task_count = excluded.task_count,
      project_json = excluded.project_json
  `).run(
    project.id,
    project.name,
    project.createdAt,
    project.updatedAt,
    project.lastOpenedAt,
    project.archivedAt ?? null,
    Number(workingSnapshot?.schemaVersion ?? savedSnapshot?.schemaVersion ?? 0),
    getUtf8ByteSize(savedSnapshot),
    getUtf8ByteSize(workingSnapshot),
    workingSnapshot?.canvas?.nodes?.length ?? 0,
    workingSnapshot?.canvas?.edges?.length ?? 0,
    workingTasks.length,
    JSON.stringify(project),
  )

  database.prepare('DELETE FROM tasks WHERE project_id = ?').run(project.id)
  const insertTask = database.prepare(`
    INSERT INTO tasks (project_id, task_id, kind, status, created_at, task_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  for (const task of workingTasks) {
    insertTask.run(project.id, task.id, task.kind ?? null, task.status ?? null, task.createdAt ?? null, JSON.stringify(task))
  }

  database.prepare('DELETE FROM assets WHERE project_id = ?').run(project.id)
  const insertAsset = database.prepare(`
    INSERT INTO assets (project_id, relative_path, role, mime_type)
    VALUES (?, ?, ?, ?)
  `)
  for (const asset of collectAssetEntries(project)) {
    insertAsset.run(project.id, asset.relativePath, asset.role, asset.mimeType)
  }
  rebuildProjectSearchDocuments(database, project)
}

function writeWorkspaceState(database, activeProjectId, lastOpenedProjectId) {
  database.prepare(`
    INSERT INTO workspace_state (id, active_project_id, last_opened_project_id, updated_at)
    VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      active_project_id = excluded.active_project_id,
      last_opened_project_id = excluded.last_opened_project_id,
      updated_at = excluded.updated_at
  `).run(activeProjectId ?? null, lastOpenedProjectId ?? null, Date.now())
}

export async function initializeWorkspaceDatabase(workspacePath) {
  const databasePath = getDatabasePath(workspacePath)
  const existed = await pathExists(databasePath)
  await mkdir(path.dirname(databasePath), { recursive: true })

  let previousVersion = 0
  if (existed) {
    const database = openDatabase(workspacePath)
    try {
      previousVersion = readSchemaVersion(database)
    } finally {
      database.close()
    }
  }
  if (previousVersion > WORKSPACE_DATABASE_SCHEMA_VERSION) {
    throw new Error(`工作区数据库版本 ${previousVersion} 高于当前支持版本 ${WORKSPACE_DATABASE_SCHEMA_VERSION}`)
  }

  let backupPath = null
  if (existed && previousVersion < WORKSPACE_DATABASE_SCHEMA_VERSION) {
    const backupDirectory = path.join(path.dirname(databasePath), 'backups')
    await mkdir(backupDirectory, { recursive: true })
    backupPath = path.join(backupDirectory, `workspace-v${previousVersion}-${Date.now()}.sqlite`)
    await copyFile(databasePath, backupPath)
  }

  if (!existed || previousVersion < WORKSPACE_DATABASE_SCHEMA_VERSION) {
    const database = openDatabase(workspacePath)
    try {
      withTransaction(database, () => {
        database.exec(DATABASE_SCHEMA)
        for (const row of database.prepare('SELECT project_json FROM projects').all()) {
          rebuildProjectSearchDocuments(database, JSON.parse(row.project_json))
        }
        database.exec(`PRAGMA user_version = ${WORKSPACE_DATABASE_SCHEMA_VERSION}`)
      })
    } finally {
      database.close()
    }
  }
  return { created: !existed, previousVersion, version: WORKSPACE_DATABASE_SCHEMA_VERSION, backupPath, databasePath }
}

export async function backupWorkspaceDatabase(workspacePath, reason = 'backup') {
  const databasePath = getDatabasePath(workspacePath)
  if (!await pathExists(databasePath)) return null
  const backupDirectory = path.join(path.dirname(databasePath), 'backups')
  await mkdir(backupDirectory, { recursive: true })
  const safeReason = String(reason).replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '') || 'backup'
  const backupPath = path.join(backupDirectory, `workspace-${safeReason}-${Date.now()}.sqlite`)
  await copyFile(databasePath, backupPath)
  return backupPath
}

export function readWorkspaceDataFromDatabase(workspacePath) {
  const database = openDatabase(workspacePath)
  try {
    const state = database.prepare('SELECT active_project_id, last_opened_project_id FROM workspace_state WHERE id = 1').get()
    const projects = database.prepare('SELECT project_json FROM projects ORDER BY updated_at DESC, id').all()
      .map((row) => JSON.parse(row.project_json))
    if (!state && projects.length === 0) return null
    return {
      projects,
      activeProjectId: state?.active_project_id ?? null,
      lastOpenedProjectId: state?.last_opened_project_id ?? null,
    }
  } finally {
    database.close()
  }
}

export function replaceWorkspaceDataInDatabase(workspacePath, data, eventType = 'workspace.replace') {
  const database = openDatabase(workspacePath)
  try {
    withTransaction(database, () => {
      database.exec('DELETE FROM projects')
      for (const project of data.projects) upsertProject(database, project)
      writeWorkspaceState(database, data.activeProjectId, data.lastOpenedProjectId)
      writeAudit(database, eventType, null, { projectCount: data.projects.length })
    })
  } finally {
    database.close()
  }
}

export function listWorkspaceProjectsFromDatabase(workspacePath) {
  const database = openDatabase(workspacePath)
  try {
    const state = database.prepare('SELECT active_project_id, last_opened_project_id FROM workspace_state WHERE id = 1').get()
    const projects = database.prepare(`
      SELECT id, name, created_at, updated_at, last_opened_at, archived_at
      FROM projects ORDER BY updated_at DESC, id
    `).all().map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastOpenedAt: row.last_opened_at,
      archivedAt: row.archived_at,
    }))
    if (!state && projects.length === 0) return null
    return { projects, activeProjectId: state?.active_project_id ?? null, lastOpenedProjectId: state?.last_opened_project_id ?? null }
  } finally {
    database.close()
  }
}

export function loadWorkspaceProjectFromDatabase(workspacePath, projectId) {
  const database = openDatabase(workspacePath)
  try {
    const row = database.prepare('SELECT project_json FROM projects WHERE id = ?').get(projectId)
    return row ? JSON.parse(row.project_json) : null
  } finally {
    database.close()
  }
}

export function saveWorkspaceProjectToDatabase(workspacePath, input) {
  const database = openDatabase(workspacePath)
  try {
    withTransaction(database, () => {
      upsertProject(database, input.project)
      const current = database.prepare('SELECT active_project_id, last_opened_project_id FROM workspace_state WHERE id = 1').get()
      writeWorkspaceState(
        database,
        'activeProjectId' in input ? input.activeProjectId : current?.active_project_id,
        'lastOpenedProjectId' in input ? input.lastOpenedProjectId : current?.last_opened_project_id,
      )
      writeAudit(database, 'project.save', input.project.id, {
        nodeCount: input.project.workingSnapshot?.canvas?.nodes?.length ?? 0,
        taskCount: input.project.workingSnapshot?.taskQueue?.tasks?.length ?? 0,
      })
    })
  } finally {
    database.close()
  }
}

export function deleteWorkspaceProjectFromDatabase(workspacePath, input) {
  const database = openDatabase(workspacePath)
  try {
    withTransaction(database, () => {
      const current = database.prepare('SELECT active_project_id, last_opened_project_id FROM workspace_state WHERE id = 1').get()
      database.prepare('DELETE FROM projects WHERE id = ?').run(input.projectId)
      const fallback = database.prepare('SELECT id FROM projects ORDER BY updated_at DESC, id LIMIT 1').get()?.id ?? null
      const activeProjectId = 'activeProjectId' in input
        ? input.activeProjectId ?? null
        : current?.active_project_id === input.projectId ? fallback : current?.active_project_id ?? null
      const lastOpenedProjectId = 'lastOpenedProjectId' in input
        ? input.lastOpenedProjectId ?? null
        : current?.last_opened_project_id === input.projectId ? activeProjectId : current?.last_opened_project_id ?? null
      writeWorkspaceState(database, activeProjectId, lastOpenedProjectId)
      writeAudit(database, 'project.delete', input.projectId)
    })
  } finally {
    database.close()
  }
}

export function loadWorkspaceConfigFromDatabase(workspacePath) {
  const database = openDatabase(workspacePath)
  try {
    const row = database.prepare("SELECT value_json FROM settings WHERE key = 'workspace_config'").get()
    return row ? JSON.parse(row.value_json) : null
  } finally {
    database.close()
  }
}

export function saveWorkspaceConfigToDatabase(workspacePath, config) {
  const database = openDatabase(workspacePath)
  try {
    withTransaction(database, () => {
      database.prepare(`
        INSERT INTO settings (key, value_json, updated_at) VALUES ('workspace_config', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
      `).run(JSON.stringify(config), Date.now())
      writeAudit(database, 'settings.save', 'workspace_config')
    })
  } finally {
    database.close()
  }
}

export function loadWorkflowTemplatesFromDatabase(workspacePath) {
  const database = openDatabase(workspacePath)
  try {
    const row = database.prepare("SELECT value_json FROM settings WHERE key = 'workflow_templates'").get()
    return row ? JSON.parse(row.value_json) : null
  } finally {
    database.close()
  }
}

export function saveWorkflowTemplatesToDatabase(workspacePath, library) {
  const database = openDatabase(workspacePath)
  try {
    withTransaction(database, () => {
      database.prepare(`
        INSERT INTO settings (key, value_json, updated_at) VALUES ('workflow_templates', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
      `).run(JSON.stringify(library), Date.now())
      writeAudit(database, 'templates.save', 'workflow_templates', { templateCount: library.templates?.length ?? 0 })
    })
  } finally {
    database.close()
  }
}

export function getWorkspaceDatabaseDiagnostics(workspacePath) {
  const database = openDatabase(workspacePath)
  try {
    return {
      version: readSchemaVersion(database),
      projectCount: Number(database.prepare('SELECT COUNT(*) AS count FROM projects').get().count),
      taskCount: Number(database.prepare('SELECT COUNT(*) AS count FROM tasks').get().count),
      assetCount: Number(database.prepare('SELECT COUNT(DISTINCT relative_path) AS count FROM assets').get().count),
      auditCount: Number(database.prepare('SELECT COUNT(*) AS count FROM audit_log').get().count),
      searchDocumentCount: Number(database.prepare('SELECT COUNT(*) AS count FROM search_documents').get().count),
    }
  } finally {
    database.close()
  }
}

function escapeSearchLike(value) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

function buildSearchSnippet(content, tokens) {
  const compact = content.replace(/\s+/g, ' ').trim()
  const normalized = compact.toLocaleLowerCase()
  const matchIndex = tokens.reduce((best, token) => {
    const index = normalized.indexOf(token)
    return index >= 0 && (best < 0 || index < best) ? index : best
  }, -1)
  const start = Math.max(0, matchIndex - 36)
  const snippet = compact.slice(start, start + 150)
  return `${start > 0 ? '...' : ''}${snippet}${start + 150 < compact.length ? '...' : ''}`
}

export function searchWorkspaceFromDatabase(workspacePath, input = {}) {
  const database = openDatabase(workspacePath)
  try {
    const text = typeof input.text === 'string' ? input.text.toLocaleLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200) : ''
    const tokens = text.split(' ').filter(Boolean)
    const indexedDocumentCount = Number(database.prepare('SELECT COUNT(*) AS count FROM search_documents').get().count)
    if (tokens.length === 0) return { supported: true, indexedDocumentCount, entries: [] }
    const where = tokens.map(() => "content_text LIKE ? ESCAPE '\\'")
    const parameters = tokens.map((token) => `%${escapeSearchLike(token)}%`)
    const kinds = Array.isArray(input.kinds) ? input.kinds.filter((kind) => ['project', 'text', 'asset'].includes(kind)) : []
    if (kinds.length > 0) {
      where.push(`kind IN (${kinds.map(() => '?').join(', ')})`)
      parameters.push(...kinds)
    }
    const nodeTypes = Array.isArray(input.nodeTypes) ? input.nodeTypes.filter((type) => typeof type === 'string').slice(0, 30) : []
    if (nodeTypes.length > 0) {
      where.push(`node_type IN (${nodeTypes.map(() => '?').join(', ')})`)
      parameters.push(...nodeTypes)
    }
    const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 50)))
    const rows = database.prepare(`
      SELECT document_id, project_id, project_name, node_id, node_type, kind, title, content_text, asset_path, updated_at
      FROM search_documents
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC, document_id
      LIMIT 300
    `).all(...parameters)
    const entries = rows.map((row) => {
      const normalizedTitle = row.title.toLocaleLowerCase()
      const score = tokens.reduce((total, token) => total + (
        normalizedTitle === token ? 40 : normalizedTitle.startsWith(token) ? 24 : normalizedTitle.includes(token) ? 12 : 4
      ), row.kind === 'project' ? 8 : 0)
      return {
        documentId: row.document_id,
        projectId: row.project_id,
        projectName: row.project_name,
        nodeId: row.node_id ?? null,
        nodeType: row.node_type ?? null,
        kind: row.kind,
        title: row.title,
        snippet: buildSearchSnippet(row.content_text, tokens),
        assetRelativePath: row.asset_path ?? null,
        updatedAt: Number(row.updated_at),
        score,
      }
    }).sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt || left.documentId.localeCompare(right.documentId)).slice(0, limit)
    return { supported: true, indexedDocumentCount, entries }
  } finally {
    database.close()
  }
}

const AUDIT_SCOPE_PREFIX = new Map([
  ['workspace', 'workspace.'],
  ['project', 'project.'],
  ['settings', 'settings.'],
  ['template', 'templates.'],
])

function normalizeAuditDetails(value) {
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, detail]) => (
      detail === null || ['string', 'number', 'boolean'].includes(typeof detail)
    )))
  } catch {
    return {}
  }
}

export function queryWorkspaceAuditFromDatabase(workspacePath, input = {}) {
  const database = openDatabase(workspacePath)
  try {
    const where = []
    const parameters = []
    const scopePrefix = AUDIT_SCOPE_PREFIX.get(input.scope)
    if (scopePrefix) {
      where.push('event_type LIKE ?')
      parameters.push(`${scopePrefix}%`)
    }
    const search = typeof input.search === 'string' ? input.search.trim().slice(0, 120) : ''
    if (search) {
      where.push("(event_type LIKE ? OR COALESCE(entity_id, '') LIKE ? OR details_json LIKE ?)")
      parameters.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    if (Number.isFinite(input.from)) {
      where.push('created_at >= ?')
      parameters.push(Math.max(0, Math.trunc(input.from)))
    }
    if (Number.isFinite(input.to)) {
      where.push('created_at <= ?')
      parameters.push(Math.max(0, Math.trunc(input.to)))
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 50)))
    const offset = Math.max(0, Math.trunc(input.offset ?? 0))
    const totalCount = Number(database.prepare(`SELECT COUNT(*) AS count FROM audit_log ${whereSql}`).get(...parameters).count)
    const rows = database.prepare(`
      SELECT id, event_type, entity_id, details_json, created_at
      FROM audit_log ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...parameters, limit, offset)
    return {
      supported: true,
      entries: rows.map((row) => ({
        id: Number(row.id),
        eventType: row.event_type,
        entityId: row.entity_id ?? null,
        details: normalizeAuditDetails(row.details_json),
        createdAt: Number(row.created_at),
      })),
      totalCount,
      hasMore: offset + rows.length < totalCount,
    }
  } finally {
    database.close()
  }
}
