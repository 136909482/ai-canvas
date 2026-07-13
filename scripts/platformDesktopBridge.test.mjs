import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const platformIndexSource = readFileSync(
  fileURLToPath(new URL('../src/platform/index.ts', import.meta.url)),
  'utf8',
)
const desktopBridgeSource = readFileSync(
  fileURLToPath(new URL('../src/platform/desktop/desktopPlatform.ts', import.meta.url)),
  'utf8',
)
const browserBridgeSource = readFileSync(
  fileURLToPath(new URL('../src/platform/web/browserPlatform.ts', import.meta.url)),
  'utf8',
)
const platformTypesSource = readFileSync(
  fileURLToPath(new URL('../src/platform/types.ts', import.meta.url)),
  'utf8',
)
const storageSettingsSource = readFileSync(
  fileURLToPath(new URL('../src/components/StorageSettingsDialog.tsx', import.meta.url)),
  'utf8',
)
const preloadSource = readFileSync(
  fileURLToPath(new URL('../electron/preload.cjs', import.meta.url)),
  'utf8',
)
const electronMainSource = readFileSync(
  fileURLToPath(new URL('../electron/main.mjs', import.meta.url)),
  'utf8',
)
const nativeWorkspaceSource = readFileSync(
  fileURLToPath(new URL('../electron/nativeWorkspace.mjs', import.meta.url)),
  'utf8',
)
const databaseWorkerSource = readFileSync(
  fileURLToPath(new URL('../electron/nativeWorkspaceDatabaseWorker.mjs', import.meta.url)),
  'utf8',
)

if (!platformIndexSource.includes("platformRuntime: PlatformRuntimeKind = isElectronRuntime() ? 'desktop' : 'web'")) {
  throw new Error('platform index should select the desktop bridge when running inside Electron.')
}

if (!platformIndexSource.includes('platformRuntime === \'desktop\' ? desktopPlatformBridge : browserPlatformBridge')) {
  throw new Error('platformBridge should not be permanently bound to the browser bridge.')
}

if (
  !storageSettingsSource.includes("runtime.workspaceConfigured && platformRuntime === 'web'")
  || !storageSettingsSource.includes('浏览器模式仅能读取授权目录名')
) {
  throw new Error('Browser-only workspace path guidance should not be displayed in the desktop client.')
}

if (desktopBridgeSource.includes('browserPlatformBridge')) {
  throw new Error('desktop bridge must not depend on the browser File System Access implementation.')
}

if (!desktopBridgeSource.includes("window.aiCanvasDesktop?.runtime === 'electron'")) {
  throw new Error('desktop runtime detection should use the isolated Electron preload marker.')
}

if (!preloadSource.includes("ipcRenderer.invoke(`ai-canvas:workspace:${method}`")) {
  throw new Error('Electron preload should expose workspace operations through namespaced IPC.')
}

if (!preloadSource.includes("inspectWorkspaceAssets: (data) => invoke('inspect-assets', data)")) {
  throw new Error('Electron preload should expose disk asset inspection through the workspace IPC namespace.')
}

if (!desktopBridgeSource.includes("inspectWorkspaceAssets: (data) => getDesktopApi().inspectWorkspaceAssets(data)")) {
  throw new Error('Desktop platform bridge should expose native disk asset inspection.')
}

for (const contract of [
  [preloadSource, "searchWorkspace: (query) => invoke('search-workspace', query)"],
  [desktopBridgeSource, 'searchWorkspace: (query) => getDesktopApi().searchWorkspace(query)'],
  [electronMainSource, "['search-workspace', 'searchWorkspace']"],
  [preloadSource, "queryWorkspaceAudit: (query) => invoke('query-audit', query)"],
  [desktopBridgeSource, 'queryWorkspaceAudit: (query) => getDesktopApi().queryWorkspaceAudit(query)'],
  [electronMainSource, "['query-audit', 'queryWorkspaceAudit']"],
  [preloadSource, "loadWorkflowTemplates: () => invoke('load-workflow-templates')"],
  [preloadSource, "saveWorkflowTemplates: (library) => invoke('save-workflow-templates', library)"],
  [desktopBridgeSource, 'loadWorkflowTemplates: () => getDesktopApi().loadWorkflowTemplates()'],
  [desktopBridgeSource, 'saveWorkflowTemplates: (library) => getDesktopApi().saveWorkflowTemplates(library)'],
  [electronMainSource, "['load-workflow-templates', 'loadWorkflowTemplates']"],
  [electronMainSource, "['save-workflow-templates', 'saveWorkflowTemplates']"],
  [preloadSource, "exportProjectBundle: (input) => invoke('export-project-bundle', input)"],
  [preloadSource, "prepareProjectBundleImport: () => invoke('prepare-project-import')"],
  [preloadSource, "commitProjectBundleImport: (input) => invoke('commit-project-import', input)"],
  [desktopBridgeSource, 'exportProjectBundle: (input) => getDesktopApi().exportProjectBundle(input)'],
  [electronMainSource, "['export-project-bundle', 'exportProjectBundle']"],
  [electronMainSource, "['prepare-project-import', 'prepareProjectBundleImport']"],
  [electronMainSource, "['commit-project-import', 'commitProjectBundleImport']"],
]) {
  if (!contract[0].includes(contract[1])) {
    throw new Error(`Desktop project bundle contract is missing: ${contract[1]}`)
  }
}

if (preloadSource.includes('ipcRenderer,')) {
  throw new Error('Electron preload must not expose the raw ipcRenderer object.')
}

const createServiceIndex = electronMainSource.indexOf('workspaceService = createWorkspaceService()')
const registerHandlersIndex = electronMainSource.indexOf('registerWorkspaceIpcHandlers(workspaceService)')
const createWindowIndex = electronMainSource.indexOf('createMainWindow(pageUrl)', registerHandlersIndex)
if (createServiceIndex < 0 || registerHandlersIndex < createServiceIndex || createWindowIndex < registerHandlersIndex) {
  throw new Error('Electron main process should register the native workspace IPC handlers before opening the window.')
}

if (electronMainSource.includes('node:sqlite') || electronMainSource.includes('DatabaseSync')
  || nativeWorkspaceSource.includes('node:sqlite') || nativeWorkspaceSource.includes('DatabaseSync')) {
  throw new Error('Electron main process and native workspace service must not execute synchronous SQLite operations.')
}

if (!databaseWorkerSource.includes("from './nativeWorkspaceDatabase.mjs'")) {
  throw new Error('Desktop SQLite operations should run inside the dedicated persistence Worker.')
}

if (!browserBridgeSource.includes('async exportWorkspaceBundle(input)')) {
  throw new Error('browser bridge should implement workspace bundle export.')
}

if (!browserBridgeSource.includes('async importWorkspaceBundle()')) {
  throw new Error('browser bridge should implement workspace bundle import.')
}

if (platformTypesSource.includes('exportWorkspaceBundle?:') || platformTypesSource.includes('importWorkspaceBundle?:')) {
  throw new Error('workspace bundle bridge methods should be required once implemented.')
}

if (!platformTypesSource.includes('inspectWorkspaceAssets: (data: WorkspaceData)')) {
  throw new Error('Disk asset inspection should be a required platform bridge contract.')
}
