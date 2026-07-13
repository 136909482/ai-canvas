import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const toolbarSource = readFileSync(fileURLToPath(new URL('../src/components/Toolbar.tsx', import.meta.url)), 'utf8')

if (toolbarSource.includes('[&::-webkit-scrollbar-thumb]:bg-white/15')) {
  throw new Error('Toolbar scrollbars should use theme variables instead of white-only scrollbar thumbs')
}

if (!toolbarSource.includes('[&::-webkit-scrollbar-thumb]:bg-[var(--border-subtle)]')) {
  throw new Error('Toolbar scrollbars should keep a visible themed thumb in light and dark modes')
}
