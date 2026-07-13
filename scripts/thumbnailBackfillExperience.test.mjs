import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const projectStoreSource = readFileSync(
  fileURLToPath(new URL('../src/store/useProjectStore.ts', import.meta.url)),
  'utf8',
)
const projectAssetMigrationSource = readFileSync(
  fileURLToPath(new URL('../src/store/projectAssetMigration.ts', import.meta.url)),
  'utf8',
)
const canvasTopBarSource = readFileSync(
  fileURLToPath(new URL('../src/components/CanvasTopBar.tsx', import.meta.url)),
  'utf8',
)

if (!projectStoreSource.includes('lastThumbnailBackfillCount')) {
  throw new Error('Project store should record how many thumbnails were backfilled during save')
}

if (!projectAssetMigrationSource.includes('stats.thumbnailBackfillCount += 1')) {
  throw new Error('Thumbnail backfill should increment a save-time count when new thumbnails are generated')
}

if (
  !canvasTopBarSource.includes('thumbnailBackfillCount > 0')
  || !canvasTopBarSource.includes('性能缩略图已生成')
) {
  throw new Error('Manual save should surface a lightweight thumbnail backfill success hint')
}
