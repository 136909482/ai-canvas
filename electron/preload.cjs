const { contextBridge, ipcRenderer } = require('electron')

const invoke = (method, payload) => ipcRenderer.invoke(`ai-canvas:workspace:${method}`, payload)

contextBridge.exposeInMainWorld('aiCanvasDesktop', Object.freeze({
  runtime: 'electron',
  getWorkspaceStatus: () => invoke('get-status'),
  pickWorkspaceDirectory: () => invoke('pick-directory'),
  loadWorkspaceData: () => invoke('load-data'),
  saveWorkspaceData: (data) => invoke('save-data', data),
  listWorkspaceProjects: () => invoke('list-projects'),
  loadWorkspaceProject: (projectId) => invoke('load-project', projectId),
  saveWorkspaceProject: (input) => invoke('save-project', input),
  deleteWorkspaceProject: (input) => invoke('delete-project', input),
  loadWorkspaceConfig: () => invoke('load-config'),
  saveWorkspaceConfig: (config) => invoke('save-config', config),
  loadWorkflowTemplates: () => invoke('load-workflow-templates'),
  saveWorkflowTemplates: (library) => invoke('save-workflow-templates', library),
  queryWorkspaceAudit: (query) => invoke('query-audit', query),
  searchWorkspace: (query) => invoke('search-workspace', query),
  writeWorkspaceAsset: (input) => invoke('write-asset', input),
  writeWorkspaceAssetAtPath: (input) => invoke('write-asset-at-path', input),
  readWorkspaceAsset: (relativePath) => invoke('read-asset', relativePath),
  inspectWorkspaceAssets: (data) => invoke('inspect-assets', data),
  cleanupUnusedWorkspaceAssets: (data) => invoke('cleanup-assets', data),
  exportWorkspaceBundle: (input) => invoke('export-bundle', input),
  importWorkspaceBundle: () => invoke('import-bundle'),
  exportProjectBundle: (input) => invoke('export-project-bundle', input),
  prepareProjectBundleImport: () => invoke('prepare-project-import'),
  commitProjectBundleImport: (input) => invoke('commit-project-import', input),
  exportWorkflowJson: (input) => invoke('export-workflow', input),
  importWorkflowJson: () => invoke('import-workflow'),
}))
