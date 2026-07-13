import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const groupNodeSource = readFileSync(fileURLToPath(new URL('../src/nodes/GroupNode/index.tsx', import.meta.url)), 'utf8')

if (groupNodeSource.includes('getNodeShellClassName')) {
  throw new Error('GroupNode should use a lightweight shell instead of the shared node shell with transitions and hover shadows')
}

if (groupNodeSource.includes('border-dashed')) {
  throw new Error('GroupNode should avoid dashed borders on large canvas surfaces because they are expensive during pan and zoom')
}

if (groupNodeSource.includes('opacity-90')) {
  throw new Error('GroupNode should avoid whole-surface opacity because it creates extra compositing work during pan and zoom')
}

if (groupNodeSource.includes('surface: \'color-mix(in srgb, var(--node-bg)')) {
  throw new Error('GroupNode surface should stay translucent so edges inside a group remain visible')
}

if (!groupNodeSource.includes('transparent')) {
  throw new Error('GroupNode should use translucent surfaces instead of an opaque background over edges')
}

if (!groupNodeSource.includes('[contain:paint]')) {
  throw new Error('GroupNode should isolate paint work with CSS containment')
}
