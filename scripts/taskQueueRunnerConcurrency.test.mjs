import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(
  fileURLToPath(new URL('../src/components/TaskQueueRunner.tsx', import.meta.url)),
  'utf8',
)

if (!source.includes('const IMAGE_TASK_LANE_LIMIT = 8')) {
  throw new Error('image generation tasks should allow 8 concurrent canvas jobs')
}

if (!source.includes('const VIDEO_TASK_LANE_LIMIT = 1')) {
  throw new Error('video generation tasks should remain serial')
}

if (!source.includes("task.kind === 'video'")) {
  throw new Error('task queue lanes should be selected by task kind')
}

if (source.includes('const DEFAULT_TASK_LANE_LIMIT = 1')) {
  throw new Error('task queue should not use a single global serial lane for all tasks')
}
