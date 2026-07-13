import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const generateNodeSource = readFileSync(
  fileURLToPath(new URL('../src/nodes/GenerateNode/index.tsx', import.meta.url)),
  'utf8',
)
const previewNodeSource = readFileSync(
  fileURLToPath(new URL('../src/nodes/GeneratedPreviewNode/index.tsx', import.meta.url)),
  'utf8',
)
const orchestratorSource = readFileSync(
  fileURLToPath(new URL('../src/features/generateQueue/orchestrator.ts', import.meta.url)),
  'utf8',
)
const typeSource = readFileSync(
  fileURLToPath(new URL('../src/types/index.ts', import.meta.url)),
  'utf8',
)

if (!generateNodeSource.includes('getResolvedProviderProfile')) {
  throw new Error('AI image node should resolve and display the active provider profile')
}

if (!generateNodeSource.includes('providerLabel')) {
  throw new Error('AI image node should expose a compact provider label')
}

if (!generateNodeSource.includes("getProviderProfiles('image')")) {
  throw new Error('AI image node should read configured image provider profiles for the provider menu')
}

if (!generateNodeSource.includes('setModelProviderProfile(effectiveModel, profileId)')) {
  throw new Error('AI image node should switch the resolved provider profile for the current model')
}

if (!generateNodeSource.includes('providerMenuOpen')) {
  throw new Error('AI image node should expose the provider profile switcher as an inline menu')
}

if (!generateNodeSource.includes('node-menu-scrollbar')) {
  throw new Error('AI image provider menu should use the compact hidden-track node menu scrollbar')
}

if (!orchestratorSource.includes('apiProfileName: providerSnapshot.apiProfileName')) {
  throw new Error('queued preview nodes should snapshot the provider profile name')
}

if (!previewNodeSource.includes('data.apiProfileName')) {
  throw new Error('generated preview node metadata should show the provider profile name')
}

if (!typeSource.includes('apiProfileName?: string | null')) {
  throw new Error('generated preview node data should carry the provider profile name')
}
