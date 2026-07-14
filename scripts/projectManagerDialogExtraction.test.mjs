import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dialogSource = readFileSync(
  fileURLToPath(new URL('../src/components/ProjectManagerDialog.tsx', import.meta.url)),
  'utf8',
)
const partsSource = readFileSync(
  fileURLToPath(new URL('../src/components/projectManager/ProjectManagerParts.tsx', import.meta.url)),
  'utf8',
)
const modelSource = readFileSync(
  fileURLToPath(new URL('../src/components/projectManager/projectManagerModel.ts', import.meta.url)),
  'utf8',
)
const appSource = readFileSync(
  fileURLToPath(new URL('../src/App.tsx', import.meta.url)),
  'utf8',
)
const projectStoreSource = readFileSync(
  fileURLToPath(new URL('../src/store/useProjectStore.ts', import.meta.url)),
  'utf8',
)
const normalizedProjectStoreSource = projectStoreSource.replace(/\r\n/g, '\n')

if (
  !dialogSource.includes("from '@/components/projectManager/ProjectManagerParts'")
  || !dialogSource.includes("from '@/components/projectManager/projectManagerModel'")
) {
  throw new Error('Project manager dialog should use the extracted parts and model modules')
}

if (dialogSource.includes('function ProjectPreviewCard') || dialogSource.includes('function getProjectNodePreview')) {
  throw new Error('Project preview rendering should stay outside the project manager orchestration entry point')
}

if (!partsSource.includes('export function ProjectPreviewCard') || !partsSource.includes('export function ProjectNameDialog')) {
  throw new Error('Project manager parts should own the preview card and name dialog')
}

if (!modelSource.includes('export function filterAndSortProjects')) {
  throw new Error('Project filtering and sorting should stay in the extracted model module')
}

if (
  !appSource.includes("data-testid={workspaceConfigured ? 'empty-workspace-create-project' : 'workspace-setup-picker'}")
  || !appSource.includes('await platformBridge.pickWorkspaceDirectory()')
  || !appSource.includes('await reloadFromWorkspace()')
) {
  throw new Error('First-run onboarding should choose and load a workspace before offering project creation')
}

if (
  !normalizedProjectStoreSource.includes('createProject: (name?: string) => Promise<string | null>')
  || !normalizedProjectStoreSource.includes("createProject: async (name) => {\n    if (!isStorageConfigured()) {\n      return null")
) {
  throw new Error('Project creation should be rejected while no persistent workspace is configured')
}

if (
  !dialogSource.includes('!batchMode && workspaceConfigured')
  || !dialogSource.includes('data-testid="project-workspace-setup-button"')
) {
  throw new Error('Project manager should direct users to storage setup before project creation')
}
