import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const selectionToolbarSource = readFileSync(
  fileURLToPath(new URL('../src/components/SelectionActionsToolbar.tsx', import.meta.url)),
  'utf8',
)
const llmOutputNodeSource = readFileSync(
  fileURLToPath(new URL('../src/nodes/LLMOutputTextNode/index.tsx', import.meta.url)),
  'utf8',
)
const themeClassesSource = readFileSync(
  fileURLToPath(new URL('../src/styles/themeClasses.ts', import.meta.url)),
  'utf8',
)
const indexCssSource = readFileSync(
  fileURLToPath(new URL('../src/index.css', import.meta.url)),
  'utf8',
)

if (
  !selectionToolbarSource.includes('const isMultiSelection = selectedNodeCount >= 2')
  || !selectionToolbarSource.includes('if (!isSingleGroupSelection && !isMultiSelection)')
) {
  throw new Error('The shared selection toolbar should stay hidden for a single ordinary node')
}

if (
  !selectionToolbarSource.includes('{isSingleGroupSelection ? (')
  || !selectionToolbarSource.includes('testId="save-selection-as-template"')
) {
  throw new Error('A single group should keep group-specific controls while shared actions remain in the multi-selection branch')
}

if (
  llmOutputNodeSource.includes('useCanvasSelectionContext()')
  || !llmOutputNodeSource.includes('{selected ? <StableNodeToolbar')
  || !llmOutputNodeSource.includes('isVisible={hasText && !isError ? undefined : false}')
) {
  throw new Error('Selected nodes should mount the stable toolbar without broadcasting selection count through every node')
}

if (
  !themeClassesSource.includes('node-toolbar-panel')
  || !indexCssSource.includes('.backdrop-blur-2xl:not(.node-toolbar-panel)')
  || !indexCssSource.includes('.canvas-image-heavy-stable .react-flow__node:not(.selected) .node-shell')
) {
  throw new Error('Viewport performance styling should not dim the selected node or its floating toolbar')
}
