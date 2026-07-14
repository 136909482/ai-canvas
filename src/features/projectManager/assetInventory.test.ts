import {
  collectWorkspaceAssetReferences,
  summarizeWorkspaceAssetReferences,
} from './assetInventory.ts'
import type { GenerateTask, ProjectSnapshot, WorkspaceData, WorkspaceImageAsset } from '@/types'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function createAsset(relativePath: string, extras: Partial<WorkspaceImageAsset> = {}): WorkspaceImageAsset {
  return {
    relativePath,
    fileName: relativePath.split('/').at(-1) ?? 'asset.png',
    mimeType: 'image/png',
    ...extras,
  }
}

function createTask(id: string, asset: WorkspaceImageAsset): GenerateTask {
  return {
    id,
    displayId: id,
    projectId: 'project-1',
    kind: 'image',
    sourceNodeId: 'gen-1',
    previewNodeId: null,
    model: 'test-model',
    prompt: '',
    negativePrompt: '',
    ratio: '1:1',
    resolution: '1024x1024',
    operationType: 'text-to-image',
    sourceImageNodeId: null,
    apiProfileId: null,
    apiProfileName: null,
    provider: null,
    referenceImageUrls: [],
    resultImageAsset: asset,
    resultVideoAsset: null,
    status: 'done',
    errorMsg: '',
    remoteTaskId: null,
    remoteStatus: null,
    createdAt: 1,
    startedAt: 1,
    finishedAt: 2,
  }
}

function createSnapshot(input: {
  imageAsset?: WorkspaceImageAsset
  videoAsset?: WorkspaceImageAsset
  taskAsset?: WorkspaceImageAsset
} = {}): ProjectSnapshot {
  return {
    schemaVersion: 1,
    canvas: {
      nodes: [
        ...(input.imageAsset
          ? [{
              id: 'image-1',
              type: 'imageNode',
              position: { x: 0, y: 0 },
              data: { imageAsset: input.imageAsset },
            }]
          : []),
        ...(input.videoAsset
          ? [{
              id: 'video-1',
              type: 'videoNode',
              position: { x: 0, y: 0 },
              data: { videoAsset: input.videoAsset },
            }]
          : []),
      ],
      edges: [],
    },
    taskQueue: {
      tasks: input.taskAsset ? [createTask('task-1', input.taskAsset)] : [],
    },
  }
}

function runAssetInventoryTests() {
  const imageAsset = createAsset('images/originals/a.png', {
    thumbnailRelativePath: 'images/thumbnails/a-thumb.webp',
    previewRelativePath: 'images/previews/a-preview.webp',
  })
  const taskAsset = createAsset('images/generated/b.png', {
    thumbnailRelativePath: 'images/thumbnails/b-thumb.webp',
  })
  const videoAsset = createAsset('images/videos/c.mp4')
  const workspaceData: WorkspaceData = {
    projects: [
      {
        id: 'project-1',
        name: 'Active',
        savedSnapshot: createSnapshot({ imageAsset }),
        workingSnapshot: createSnapshot({ imageAsset, taskAsset }),
        createdAt: 1,
        updatedAt: 1,
        lastOpenedAt: 1,
      },
      {
        id: 'project-2',
        name: 'Other',
        savedSnapshot: createSnapshot({ videoAsset }),
        workingSnapshot: createSnapshot({ videoAsset }),
        createdAt: 1,
        updatedAt: 1,
        lastOpenedAt: 1,
      },
    ],
    activeProjectId: 'project-1',
    lastOpenedProjectId: 'project-1',
  }

  const references = collectWorkspaceAssetReferences(workspaceData)
  assert(references.some((reference) => reference.assetField === 'resultImageAsset'), 'task result image assets should be inventoried')
  assert(references.some((reference) => reference.assetField === 'videoAsset'), 'video node assets should be inventoried')
  assert(references.some((reference) => reference.kind === 'thumbnail'), 'thumbnail assets should be inventoried')
  assert(references.some((reference) => reference.kind === 'preview'), 'preview assets should be inventoried')

  const summary = summarizeWorkspaceAssetReferences(workspaceData)
  assert(summary.totalUniquePathCount === 6, 'workspace summary should count unique original, thumbnail, and preview paths')
  assert(summary.originalCount === 3, 'workspace summary should dedupe original paths across saved and working snapshots')
  assert(summary.thumbnailCount === 2, 'workspace summary should dedupe thumbnail paths')
  assert(summary.previewCount === 1, 'workspace summary should count preview paths')
  assert(summary.nodeReferenceCount === 8, 'workspace summary should preserve node reference counts across snapshots')
  assert(summary.taskReferenceCount === 2, 'workspace summary should preserve task asset reference counts')
  assert(summary.activeProjectSummary?.uniquePathCount === 5, 'active project summary should be available')
}

runAssetInventoryTests()
