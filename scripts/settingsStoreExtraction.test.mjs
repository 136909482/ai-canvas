import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const storeSource = readFileSync(fileURLToPath(new URL('../src/store/useSettingsStore.ts', import.meta.url)), 'utf8')
const configSource = readFileSync(fileURLToPath(new URL('../src/store/settingsConfig.ts', import.meta.url)), 'utf8')
const cacheSource = readFileSync(fileURLToPath(new URL('../src/store/settingsCache.ts', import.meta.url)), 'utf8')

if (!storeSource.includes("from './settingsConfig'") || !storeSource.includes("from './settingsCache'")) {
  throw new Error('useSettingsStore should import the extracted settings config and cache helpers')
}

for (const helper of ['normalizeConfig', 'normalizeProviderProfile', 'toWorkspaceConfigFile']) {
  if (!configSource.includes(`export function ${helper}`)) {
    throw new Error(`settingsConfig.ts should export ${helper}`)
  }

  if (storeSource.includes(`function ${helper}`)) {
    throw new Error(`useSettingsStore should not define ${helper} inline`)
  }
}

if (!cacheSource.includes('redactWorkspaceConfigSecretsForCache(config)')) {
  throw new Error('settings cache writes should continue redacting provider API keys')
}

if (storeSource.includes('localStorage') || storeSource.includes('WORKSPACE_CONFIG_CACHE_KEY')) {
  throw new Error('useSettingsStore should not own browser localStorage details after extraction')
}
