import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(
  fileURLToPath(new URL('../src/platform/web/browserPlatform.ts', import.meta.url)),
  'utf8',
)
const storageSettingsSource = readFileSync(
  fileURLToPath(new URL('../src/components/StorageSettingsDialog.tsx', import.meta.url)),
  'utf8',
)
const workspaceBundleSource = readFileSync(
  fileURLToPath(new URL('../src/platform/web/workspaceBundle.ts', import.meta.url)),
  'utf8',
)

if (!workspaceBundleSource.includes('export function collectWorkspaceReferencedAssetPaths')) {
  throw new Error('Workspace cleanup and bundle export should share referenced asset path collection')
}

if (
  !workspaceBundleSource.includes('candidate.relativePath')
  || !workspaceBundleSource.includes('candidate.thumbnailRelativePath')
  || !workspaceBundleSource.includes('candidate.previewRelativePath')
) {
  throw new Error('Workspace cleanup should preserve original, thumbnail, and preview asset paths')
}

if (
  !workspaceBundleSource.includes('collectAssetPaths(task.resultImageAsset, referencedPaths)')
  || !workspaceBundleSource.includes('collectAssetPaths(task.resultVideoAsset, referencedPaths)')
) {
  throw new Error('Workspace cleanup should include generated task asset references')
}

if (!source.includes('new Set(collectWorkspaceReferencedAssetPaths(data))')) {
  throw new Error('Workspace cleanup should reuse bundle reference collection across saved and working snapshots')
}

if (
  !storageSettingsSource.includes('await persistWorkspaceFile()')
  || !storageSettingsSource.includes('await platformBridge.loadWorkspaceData()')
  || !storageSettingsSource.includes('await platformBridge.inspectWorkspaceAssets(workspaceData)')
) {
  throw new Error('Workspace cleanup should persist the active project and inspect the full persisted workspace before deleting assets')
}

if (!storageSettingsSource.includes('persistedWorkspaceData.projects')) {
  throw new Error('Workspace cleanup should pass all projects, not only the active project, to asset cleanup')
}

if (
  !storageSettingsSource.includes('inspection.orphanedByteSize')
  || !storageSettingsSource.includes('inspection.orphanedFiles')
) {
  throw new Error('Workspace cleanup should explain reclaimable bytes and orphan paths before deletion')
}
